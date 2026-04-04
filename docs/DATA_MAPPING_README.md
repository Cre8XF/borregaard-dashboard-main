# DATA_MAPPING_README — Borregaard Dashboard

**Sist oppdatert:** Mars 2026 (FASE 9.0)

> **Merk:** Dette dokumentet beskriver FASE 7.x-arkitekturen med MV2 som enkelt datakjerne.
> Den gamle CSV-mapping-løsningen (mapping-filer i `data/mapping/`) er avviklet.

---

## Prinsipp

Dashboardet bruker interne standardiserte feltnavn (`UnifiedItem`-modellen) og kobler disse til faktiske kolonner i Excel-filene via **kolonnevariant-lister** i `dataProcessor.js`. Dette betyr at dashboardet tåler mindre variasjoner i kolonnenavn mellom eksporter uten at koden må endres.

---

## Primærkilder og felttilknytning

### `Borregaard_SA_Master_v2.xlsx` (MV2)

Genereres av `generate_masterV2.py`. Inneholder kolonner fra SANummer.xlsx og Master_Artikkelstatus.xlsx bakt sammen.

| Internt felt (UnifiedItem) | Forventede kolonnenavn i MV2 | Påkrevd |
|---------------------------|------------------------------|---------|
| `saNumber` | `SANummer`, `Kunds artikkelnummer` | **Ja** |
| `toolsArticleNumber` | `Artikelnr`, `Tools art.nr` | **Ja** |
| `description` | `Artikelbeskrivning`, `Beskrivelse` | Ja |
| `articleStatus` | `Artikelstatus`, `Artikkelstatus` | Ja |
| `stock` | `TotLagSaldo`, `Lagersaldo` | Ja |
| `availableStock` | `DispLagSaldo`, `Available` | Ja |
| `reserved` | `ReservAnt`, `Reservert` | Ja |
| `kalkylPris` | `Kalkylpris bas`, `Kalkylpris` | Ja |
| `ordrekvantitet` (EOK) | `EOK` | Ja |
| `bestAntLev` | `BestAntLev`, `Ordered Qty` | Ja |
| `bestillingsNummer` | `Beställningsnummer`, `Bestillingsnr` | Nei |
| `ersattAvArtikel` | `Ersätts av artikel`, `ErsattsAvArtNr` | Nei |
| `ersatterArtikel` | `Ersätter artikel` | Nei |
| `location` | `Lagerhylla`, `Lokasjon_SA` | Nei |
| `supplier` | `Företagsnamn`, `Leverandør` | Nei |
| `category` | `Varugrupp`, `Kategori` | Nei |
| `invDat` | `InvDat` | Nei |
| `r12` | `R12 Del Qty` | Nei |
| `bp` | `BP`, `Bestillingspunkt` | Nei |

Matching er **case-insensitiv** og bruker "first match wins" — første variant som finnes i Excel-kolonnehodene vinner.

---

### `Ordrer_Jeeves.xlsx`

Brukes av `buildJeevesMap()` i `dataProcessor.js`. Inneholder kjøpshistorikk (avdelingsordrer fra Jeeves).

| Internt felt (jeevesMap) | Forventede kolonnenavn | Merknad |
|--------------------------|----------------------|---------|
| Artikkelnummer (join-nøkkel) | `Artikelnr`, `Item ID`, `ItemNo` | Matches mot `toolsArticleNumber` |
| Antall | `OrdRadAnt`, `Quantity`, `Antall` | Per ordrelinje |
| Dato | `OrdDtm`, `Date`, `Ordredato` | ISO eller DD.MM.YYYY |
| Kunde/avdeling | `Företagsnamn`, `Customer` | Filtrert på `424186` |
| Leveringslager | `Delivery location ID`, `Lager` | Brukes i `byLocation` |

**Viktig:** Bare rader der `Företagsnamn` / `Customer` inneholder `'424186'` inkluderes i `jeevesMap`.

---

### `bestillinger.xlsx` (valgfri)

Åpne innkjøpsordrer med restantall og beregnet leveringsdato.

| Internt felt | Forventede kolonnenavn |
|-------------|----------------------|
| Artikkelnummer | `Artikelnr`, `Item ID` |
| Restantall | `RestAntLgrEnh`, `RestAnt` |
| Beregnet leveringsdato | `BerLevDat`, `Beregnet levdato` |

---

### Prisliste (valgfri, FASE 9.0)

`20260219_Borregaard_prisliste_orginal.xlsx` — header på rad 5 (header=4 i pandas).

Leses av `oppdater_dashboard.py` og bakes inn som `prisliste`-array i `dashboard-data.json`.
Prosesseres i `DataProcessor.buildPrisMap()` til `store.prisMap`.

| Internt UnifiedItem-felt | Kilde-kolonne i prisliste | Merknad |
|--------------------------|--------------------------|---------|
| `avtalepris` | `Ny pris` | Avtalepris inkl. 3% økning |
| `listpris` | `artlistpris` | Listpris (string med komma → float) |
| `prisKalkyl` | `q_replacement_value` | Innkjøpspris/kalkylpris i prislisten |
| `nyDG` | `Ny DG` | Dekningsgrad |
| `prisStatus` | `Status` | "Utgår", "Utgått" eller tom |
| `prisAnbefaling` | `Anbefaling` | Kommentarkolonne (kolonne Y) |
| `iInPrisliste` | — | Avledet: `true` hvis artnr finnes i prisMap |
| `prisAvvik` | — | `(prisKalkyl − kalkylPris) / kalkylPris × 100 %` |

**Viktig:** `artlistpris` er en string med komma ("595,00"). Python-koden konverterer komma til punktum før lagring i JSON. Alle priskolonner med komma som desimalskilletegn håndteres i `oppdater_dashboard.py`.

Join-nøkkel: `artnr` (Tools art.nr) matcher mot `item.toolsArticleNumber`.

---

## Kolonnevariant-konfigurasjon

Alle varianter er definert i `DataProcessor.MASTER_COLUMN_VARIANTS` i `dataProcessor.js`. Legg til nye varianter her dersom eksportformatet fra Butler eller Jeeves endrer kolonnenavn:

```javascript
static MASTER_COLUMN_VARIANTS = {
    articleNumber: ['Artikelnr', 'Item ID', 'VareNr', ...],
    kalkylPris:    ['Kalkylpris bas', 'Kalkylpris', ...],
    // ...
};
```

---

## Feilsøking

### "0 artikler lastet" etter opplasting

1. Sjekk at filen er `Borregaard_SA_Master_v2.xlsx` (ikke en gammel versjon)
2. Åpne filen i Excel og verifiser at kolonnen `SANummer` eller `Kunds artikkelnummer` finnes
3. Sjekk nettleserens konsoll (F12) for feilmeldinger fra `processMasterV2File()`

### Kjøpshistorikk vises ikke i Artikkel Oppslag

1. Sjekk at `Ordrer_Jeeves.xlsx` ble lastet inn (ikke bare MV2)
2. Verifiser at kolonne for kundenummer/firma inneholder `424186` for Borregaard-rader
3. Sjekk konsollen for `[JeevesMap] Bygget kjøpshistorikk for X artikler`

### Bestillinger vises ikke

1. Sjekk at `bestillinger.xlsx` ble lastet inn som valgfri fil
2. Verifiser at `RestAntLgrEnh` > 0 for relevante rader (rader med 0 restantall hoppes over)

### Lokasjon mangler for mange artikler

`Lokasjon_SA` / `Lagerhylla` er ikke alltid populert i MV2. Sjekk kildefilen `SANummer.xlsx` kolonne `Artikelbeskrivning.1` — dette feltet inneholder hylleadresser (f.eks. `12-3-B`) for noen artikler og kan bakes inn i MV2 via `generate_masterV2.py`.

---

## Viktige prinsipper

- **Bruk kun interne feltnavn** i all JavaScript-logikk — aldri kolonnenavn direkte
- **Legg til varianter i MASTER_COLUMN_VARIANTS** når eksportformat endres — ikke endre logikken
- **MV2 er sannhetskilden** — alle andre filer er sekundære beriker
- **Jeeves er alltid separat** — tidsseriedata kan ikke forhåndsaggregeres uten å miste fleksibilitet

---

## Avviklede konsepter

Følgende fra tidligere dokumentasjon er **ikke lenger i bruk**:

| Avviklet | Erstattet av |
|----------|-------------|
| `data/mapping/*.map.json` | `MASTER_COLUMN_VARIANTS` i `dataProcessor.js` |
| `data/raw/*.csv` | `Borregaard_SA_Master_v2.xlsx` |
| `DataMapper`, `DataAggregator` (gammel) | `DataProcessor.processMasterV2File()` |
| SA-Nummer.xlsx som primærkilde | Bakt inn i MV2 via `generate_masterV2.py` |
| Analyse_Lagerplan.xlsx | BP og EOK bakt inn i MV2 |
| Master_Artikkelstatus.xlsx (direkte) | Bakt inn i MV2 via `generate_masterV2.py` |
