# DATAFLOW — Borregaard Dashboard

**Sist oppdatert:** Mars 2026 (FASE 9.0)

---

## Oversikt

```
generate_masterV2.py
  SANummer.xlsx ──────────────────┐
  Master_Artikkelstatus.xlsx ─────┴──► Borregaard_SA_Master_v2.xlsx (MV2)
                                                  │
                                                  ▼
                             DataProcessor.processMasterV2File()
                                                  │
                             Ordrer_Jeeves.xlsx ──┤ buildJeevesMap()
                             bestillinger.xlsx ───┤ processBestillingerData()  [valgfri]
                             prisliste.xlsx ──────┤ buildPrisMap()             [valgfri, FASE 9.0]
                                                  │
                                                  ▼
                                        UnifiedDataStore
                                     (items keyed by saNumber)
                                     store.prisMap (valgfri, FASE 9.0)
                                                  │
                         ┌────────────────────────┼────────────────────────┐
                         ▼                        ▼                        ▼
                   Varetelling            Artikkel Oppslag           Order Analyzer
                   Butler Analyzer        Shutdown Planner           Flow Issues
```

---

## Fase 7.x pipeline i detalj

### Steg 1 — MV2 lastes og oppretter artikler

`processMasterV2File(rows, store)` itererer alle rader i MV2.

For hver rad:
- Henter `SANummer` (påkrevd — rader uten hoppes over)
- Kaller `store.createFromSA(saNumber, toolsArtNr)` → ny `UnifiedItem`
- Beriker med alle tilgjengelige felt (se tabell under)

### Steg 2 — Jeeves-data beriker salgshistorikk

`buildJeevesMap(rows)` bygger et oppslagskart keyed på `toolsArticleNumber`:

```javascript
jeevesMap[toolsArtNr] = {
    totalOrders,
    lastDate,       // DD.MM.YYYY
    avgQty,
    minQty,
    maxQty,
    byLocation: {   // per leveringslager
        [loc]: { orders, lastDate, avgQty }
    }
}
```

Filtrerer på CustomerID ∋ `'424186'` (Borregaard AS).

`store.jeevesMap` brukes av **Artikkel Oppslag** for kjøpshistorikk-panel og av **Order Analyzer** for frekvensanalyse.

### Steg 3 — Bestillinger (valgfri)

`processBestillingerData(rows, store)` beriker items med åpne innkjøpsordrer:
- Slår opp via `toolsLookup` (toolsArtNr → saNumber)
- Setter `item.bestillinger[]` med restantall og beregnet leveringsdato

### Steg 4 — Prisliste (valgfri, FASE 9.0)

`buildPrisMap(rows)` bygger et oppslagskart keyed på `artnr` (Tools art.nr):

```javascript
store.prisMap[artnr] = {
    avtalepris,  // Ny pris inkl. 3% (fra prisliste-Excel)
    listpris,    // artlistpris (fra prisliste-Excel)
    kalkylpris,  // q_replacement_value (innkjøpspris i prislisten)
    nyDG,        // Dekningsgrad
    status,      // "Utgår", "Utgått" eller tom
    anbefaling,  // Kommentarkolonne (Y)
    saNummer     // SA-Nummer fra prislisten
}
```

Prisliste bakes inn i `dashboard-data.json` av `oppdater_dashboard.py` fra:
`C:\Users\ROGSOR0319\_Datahub\Excel-eksporter\01-Daglig\20260219_Borregaard_prisliste_orginal.xlsx`

Etter `buildPrisMap()` berikes alle `UnifiedItem`-objekter med prisdata. Om prislisten mangler, forblir alle `iInPrisliste`-flagg `false` og dashbordet fungerer uendret.

---

## MV2-feltdekning (29/40 UnifiedItem-felt)

| UnifiedItem-felt | MV2-kolonne | Kilde |
|------------------|-------------|-------|
| `saNumber` | SANummer | SANummer.xlsx |
| `toolsArticleNumber` | Tools art.nr | SANummer.xlsx |
| `description` | Artikelbeskrivning | Master_Artikkelstatus.xlsx |
| `articleStatus` | Artikelstatus | Master_Artikkelstatus.xlsx |
| `isDiscontinued` | Avledet fra Artikelstatus | — |
| `stock` | TotLagSaldo | Master_Artikkelstatus.xlsx |
| `availableStock` | DispLagSaldo | Master_Artikkelstatus.xlsx |
| `reserved` | ReservAnt | Master_Artikkelstatus.xlsx |
| `kalkylPris` | Kalkylpris bas | Master_Artikkelstatus.xlsx |
| `ordrekvantitet` (EOK) | EOK | Master_Artikkelstatus.xlsx |
| `bestAntLev` | BestAntLev | Master_Artikkelstatus.xlsx |
| `bestillingsNummer` | Beställningsnummer | Master_Artikkelstatus.xlsx |
| `ersattAvArtikel` | Ersätts av artikel | Master_Artikkelstatus.xlsx |
| `ersatterArtikel` | Ersätter artikel | Master_Artikkelstatus.xlsx |
| `location` | Lagerhylla / Lokasjon_SA | SANummer.xlsx / Master |
| `supplier` | Företagsnamn | Master_Artikkelstatus.xlsx |
| `category` | Varugrupp | Master_Artikkelstatus.xlsx |
| `invDat` | InvDat | Master_Artikkelstatus.xlsx |
| `r12` | R12 Del Qty | Master_Artikkelstatus.xlsx |
| `bp` | BP / Bestillingspunkt | Analyse_Lagerplan (bakt inn i MV2) |
| `outgoingOrders[]` | — | Ordrer_Jeeves.xlsx (alltid separat) |
| `jeevesMap` | — | Ordrer_Jeeves.xlsx (alltid separat) |
| `bestillinger[]` | — | bestillinger.xlsx (valgfri) |
| `avtalepris` | `Ny pris` | prisliste.xlsx (valgfri, FASE 9.0) |
| `listpris` | `artlistpris` | prisliste.xlsx (valgfri, FASE 9.0) |
| `prisKalkyl` | `q_replacement_value` | prisliste.xlsx (valgfri, FASE 9.0) |
| `nyDG` | `Ny DG` | prisliste.xlsx (valgfri, FASE 9.0) |
| `prisStatus` | `Status` | prisliste.xlsx (valgfri, FASE 9.0) |
| `prisAnbefaling` | `Anbefaling` | prisliste.xlsx (valgfri, FASE 9.0) |
| `iInPrisliste` | — | Avledet: true hvis artnr finnes i prisMap |
| `prisAvvik` | — | Avledet: (prisKalkyl − kalkylPris) / kalkylPris × 100 |

**Felt som gjenstår (11/40):** Primært avanserte planleggingsfelt og felt med usikker kilde. Se `AUDIT_TOOLS_SA_ARTIKLER.md` for full liste.

---

## Hvorfor Ordrer_Jeeves.xlsx alltid er separat

Tidsseriedata (salg per dato, per avdeling, per leveringslager) kan ikke forhåndsaggregeres i MV2 uten å miste fleksibilitet:
- `sales6m` vs `sales12m` beregnes dynamisk fra rådata
- Per-lager-breakdown (`byLocation`) krever alle ordrelinjer
- Trendanalyse over tid krever full historikk

Jeeves-filen er derfor den **eneste uunngåelige tilleggsfilen** ved siden av MV2.

---

## Kjøpsstatus-logikk (Order Analyzer)

```
Median dager mellom leveranser (m) beregnes per artikkel
  (filtrerer intervaller > 365 dager som prosjektordre)

daysSinceLast ≤ m × 1.2  →  ✅ OK
daysSinceLast ≤ m × 1.6  →  ⚠️  Følg med
daysSinceLast > m × 1.6  →  🔴 Bør bestilles
< 3 gyldige intervaller  →  ⬜ For lite historikk
```

Konstanter: `OK_THRESHOLD=1.2`, `FOLLOW_UP_THRESHOLD=1.6`, `MIN_INTERVALS=3`, `MAX_INTERVAL_DAYS=365`, `SAFETY_FACTOR=1.2`

---

## Sesonganalyse (uke 16 og 42)

For hvert fokusår analyseres tre vinduer: uke_før → fokusuke → uke_etter.

| Mønster | Klassifisering |
|---------|---------------|
| qty_fokus >> qty_før OG qty_etter = 0 | 🔴 Sesongspike |
| Aktivitet kun i fokusuke | 🟡 Engangs/event |
| Aktivitet også før/etter | 🟢 Stabil etterspørsel |

Anbefalt kvantitet = median historisk × 1.2 (20 % sikkerhetsmargin).

---

## Varetelling — 32-sesjoners telleplan 2026

- **Periode:** Uke 11–44, hopper over uke 16 og 42 (vedlikeholdsstopp)
- **Sesjoner:** 32 telleuker, 1 sesjon per uke
- **Soner:** ~3 261 artikler fordelt på 381 lokasjoner
- **Mål per sesjon:** 100–170 artikler
- **`invDat`** fra MV2 brukes for å vise «Sist telt» og beregne fremgang
- Bufferveker er innlagt for å tåle avvik i den operative hverdagen

---

## localStorage-skjema

Datastore serialiseres til `borregaardDashboardV4` i `localStorage`:

```json
{
  "version": "4.3",
  "timestamp": "...",
  "items": [...],
  "toolsLookup": [...],
  "alternativeArticles": [...],
  "masterOnlyArticles": [...],
  "dataQuality": {...}
}
```

Data bevares mellom nettleserøkter. Nullstilles med **Nullstill**-knappen i UI.
