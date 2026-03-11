# borregaard

**Lagerstyringsdashboard for Borregaard AS (kundenr. 424186)**
Plassansvarlig-verktøy for 7 satellittlagre, bygget i samarbeid med Tools AS (MRO-leverandør).

---

## Hva er dette?

Et nettleserbasert dashboard som hjelper plassansvarlig å holde oversikt over artikkelstatus, varetelling, innkjøpshistorikk og lagerflyt — uten å måtte åpne flere Excel-filer eller systemet manuelt.

Dashboardet kjører lokalt i nettleseren (ingen server), lagrer data i `localStorage`, og deployes via GitHub → Netlify.

---

## Arkitektur (FASE 7.x)

### To-fil-kjernen

| Fil | Rolle | Påkrevd |
|-----|-------|---------|
| `Borregaard_SA_Master_v2.xlsx` | Hoved-datakilde — artikkelstatus, lokasjon, lager, kalkylpris, EOK, invDat | **Ja** |
| `Ordrer_Jeeves.xlsx` | Kjøpshistorikk fra Jeeves (avdelingsdata, tidsserier) | **Ja** |
| `bestillinger.xlsx` | Åpne innkjøpsordrer med restantall og leveringsdato | Valgfri |

MV2-filen genereres av `generate_masterV2.py` og erstatter alle tidligere separate kildefiler (SA-Nummer.xlsx, Master.xlsx, Master_Artikkelstatus.xlsx, Analyse_Lagerplan.xlsx).

### Primærnøkkel

`SANummer` (SA-nummer) er primærnøkkel for alle artikler. `toolsArticleNumber` brukes som oppslagsnøkkel mot Jeeves-data.

---

## Filstruktur

```
borregaard/
├── index.html                  # Inngang til dashboardet
├── contacts.html               # Kontaktoversikt lagerleddet
├── generate_masterV2.py        # Python-script: genererer MV2 fra kildefiler
│
├── js/
│   ├── app.js                  # Hovedkontroller (DashboardApp)
│   ├── dataProcessor.js        # Datapipeline: MV2 + Jeeves → UnifiedDataStore
│   ├── unifiedItem.js          # Artikkelmodell (UnifiedItem)
│   ├── unifiedDataStore.js     # Datastore med indekser og oppslag
│   └── workModes/
│       ├── varetelling.js      # Rullerende telleplan (32 sesjoner, uke 11–44)
│       ├── artikkelOppslag.js  # Globalt søk med Fuse.js
│       ├── orderAnalyzer.js    # Kjøpsfrekvens og sesonganalyse
│       ├── butlerAnalyzer.js   # Lagerstatusanalyse (5 visninger)
│       ├── shutdownPlanner.js  # Vedlikeholdsstopp uke 16 og 42
│       └── flowIssues.js       # Problemlogg SAP↔Jeeves
│
├── css/
│   └── dashboard.css
│
├── lib/                        # Fuse.js og andre tredjepartsbibliotek
├── testdata/                   # Eksempelfiler for testing
│
├── README.md
├── DATAFLOW.md                 # Detaljert dataflyt og feltdekning
├── AUDIT_EXCEL_SOURCES.md      # Hvilke kildefiler som er aktive/fjernet
├── AUDIT_TOOLS_SA_ARTIKLER.md  # Feltmapping fra Tools/SA til UnifiedItem
└── Brukerveiledning.md         # Bruksanvisning for daglig drift
```

---

## Arbeidsmoduser

| Modus | Formål |
|-------|--------|
| **Varetelling** | Rullerende 32-sesjoners telleplan 2026. Viser ukens soner, fremgang og sist-telt per lokasjon. |
| **Artikkel Oppslag** | Fuzzy-søk på Tools nr, SA-nummer, lokasjon, leverandør, beskrivelse. Viser kjøpshistorikk fra Jeeves. |
| **Order Analyzer** | Kjøpsfrekvensanalyse: trafikklys (OK/Følg med/Bestill), sesongtopper (uke 16/42), toppselgere. |
| **Butler Analyzer** | Daglig lagerstatusoversikt: 0-saldo aktive, negativ saldo, under BP, ingen R12-bevegelse. |
| **Shutdown Planner** | Planlegging av vedlikeholdsstopp — kritiske artikler og anbefalte lagernivåer. |
| **Flow Issues** | Logg over integrasjonsproblemer SAP↔Jeeves med kategori og rotårsak. |

---

## Slik bruker du dashboardet

1. Åpne `index.html` i nettleseren (eller den deployede Netlify-URL-en)
2. Last opp `Borregaard_SA_Master_v2.xlsx` i filopplastingsfeltet
3. Last opp `Ordrer_Jeeves.xlsx`
4. Klikk **Last inn data** — systemet bygger datastore og viser modulene
5. Data bevares i `localStorage` mellom økter; ingen ny opplasting nødvendig før MV2 oppdateres

---

## Oppdatere MV2-masterfilen

Kjør `generate_masterV2.py` lokalt med kildefilene på plass:

```bash
python generate_masterV2.py
```

Skriptet leser:
- `SANummer.xlsx`
- `Master_Artikkelstatus.xlsx` (inkludert kalkylpris og EOK)

Og produserer: `Borregaard_SA_Master_v2.xlsx`

Last deretter opp den nye MV2-filen i dashboardet.

---

## Teknisk stack

- Vanilla JavaScript (ingen rammeverk)
- [Fuse.js](https://fusejs.io/) — fuzzy-søk
- [SheetJS (xlsx)](https://sheetjs.com/) — Excel-parsing i nettleseren
- `localStorage` — klient-side datapersistens
- GitHub + Netlify — deploy

---

## Domeneterminologi

| Term | Betydning |
|------|-----------|
| SA-nummer / SANummer | Borregaards interne artikkelnummer (primærnøkkel) |
| Tools nr | Tools AS sitt artikkelnummer |
| MV2 | `Borregaard_SA_Master_v2.xlsx` — masterfilen |
| BP | Bestillingspunkt (minimumsnivå før påfyll) |
| EOK | Ekonomisk ordrekvantitet |
| kalkylPris | Beregnet innkjøpspris |
| VareStatus / Artikelstatus | Artikkelens livsstatus (Aktiv, Utgår, Erstattet, osv.) |
| ErsattsAvArtNr | Artikkelnummer som erstatter denne artikkelen |
| Lokasjon_SA | Lagerplassering (hylle/sone) |
| InvDat | Dato for siste varetelling |
| ukurans | Artikler uten bevegelse (slow movers) |
| vedlikeholdsstopp | Produksjonsstopp, normalt uke 16 og uke 42 |
| UnifiedItem | JavaScript-objektmodell for én artikkel i datastore |

---

## Status

**FASE 7.2 fullført (mars 2026)**
- MV2 dekker 29/40 UnifiedItem-felt
- Kjøpshistorikk-panel i Artikkel Oppslag (`buildJeevesMap()` → `store.jeevesMap`)
- Varetelling: 32-sesjoners rullerende telleplan 2026 (uke 11–44, hopper over 16 og 42)
- Eneste uunngåelige tilleggsfil: `Ordrer_Jeeves.xlsx`
