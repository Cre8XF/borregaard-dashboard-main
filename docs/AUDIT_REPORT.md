# BORREGAARD OPERASJONELT DASHBOARD - AUDIT RAPPORT

**Dato:** 2026-01-26
**Versjon:** Dashboard v2.0
**Auditor:** System Audit (Read-Only Analysis)

---

## SECTION A - Dashboard Overview

### Hovedmoduler

| Modul | Ansvar | Type | Status |
|-------|--------|------|--------|
| **OrderAnalyzer** | Analyse av ordrehistorikk fra Tools → Borregaard | Analytisk | Aktiv (v3) |
| **ButlerAnalyzer** | Daglig lageranalyse med ~2800 artikler | Analytisk + Handlingsstøtte | Aktiv |
| **ShutdownAnalyzer** | Vedlikeholdsstopp-planlegging (uke 16/42) | Analytisk + Handlingsstøtte | Aktiv |
| **InventoryRisk** | Risikooversikt for 7 satellittlagre | Analytisk + Handlingsstøtte | Aktiv |
| **FlowIssues** | SAP ↔ Jeeves integrasjonsproblemer | Informasjon + Logging | Aktiv |
| **Assortment** | Kundesortiment og produktkatalog | Informasjon | Minimal implementasjon |
| **DataLoader** | CSV/Excel filimport | Infrastruktur | Aktiv |
| **DataMapper** | Kolonnemapping til standardiserte felt | Infrastruktur | Aktiv |
| **DataAggregator** | Dataoppsummering | Infrastruktur | Aktiv |
| **Refill Module** | Mobil lagersjekk med strekkodeskanning | Handlingsstøtte | Separat modul |

### Modulklassifisering

**Informasjonelle moduler:**
- FlowIssues (logger problemer, viser statistikk)
- Assortment (viser produktkatalog)

**Analytiske moduler:**
- OrderAnalyzer (kjøpsfrekvens, sesongmønstre, toppselgere)
- ButlerAnalyzer (lagerstatusoversikt med 5 forhåndsdefinerte visninger)
- ShutdownAnalyzer (kritiske varer før vedlikeholdsstopp)

**Handlingsstøttende moduler:**
- InventoryRisk (foreslår lagerflytting mellom lagre)
- ShutdownAnalyzer (anbefalinger om lagernivåer)
- OrderAnalyzer v3 (bestillingsforslag basert på median)
- ButlerAnalyzer (viser varer som trenger handling)

**Plassholder/Planlagt:**
- Assortment er implementert men har minimal forretningslogikk

---

## SECTION B - Data Sources & Inputs

### Datakilder

| Datakilde | Type | Modul | Formål | Status |
|-----------|------|-------|--------|--------|
| Butler Excel-eksport | Excel (.xlsx) | ButlerAnalyzer | Daglig lagersaldo, beholdning, min/max, R12 salg | Påkrevd |
| Tools ordrehistorikk | CSV/Excel | OrderAnalyzer | Historisk kjøpsanalyse | Påkrevd |
| SA-nummer mapping | CSV/Excel | ButlerAnalyzer | Kobling Tools artikler → Borregaard SA-nummer | Valgfri |
| Lagerbeholdning | CSV | InventoryRisk | Satellittlagerstatus | Påkrevd |
| Vedlikeholdsordrer | CSV | ShutdownAnalyzer | Historiske ordre for uke 16/42 | Påkrevd |
| Kontakter | JSON | contacts.js | Lageransvarlige | Innebygd |

### Forventede kolonner per datakilde

**Butler-eksport:**
- Artikelnr, Artikelbeskrivelse, Lagersaldo, DispLagSaldo, ReservAnt
- BP (beställningspunkt), Maxlager, Artikelstatus, R12 Del Qty
- Supplier Name, Lagerhylla, Hylla 1

**OrderAnalyzer (Tools/Qlik):**
- OrderNr/Ordrenr, Artikelnr/ItemNo, Artikelbeskrivning/Description
- OrdRadAnt/Quantity, Date/OrdDtm, Företagsnamn/Customer
- Pris/Price, Ord.radbelopp val/Total, Delivery location ID

**InventoryRisk:**
- Warehouse/Lager, Item/Varenummer, Stock/Beholdning
- Min/Minimum, Max/Maximum, Lead Time/Leveringstid

**ShutdownAnalyzer:**
- Week/Uke, Year/År, Item/Varenummer, Quantity/Antall

### Mapping-konfigurasjon

Dashboardet bruker JSON-baserte mapping-filer i `/data/mapping/`:
- `articles.map.json` - Artikkeldata
- `orders_internal.map.json` - Interne ordre
- `orders_external.map.json` - Eksterne innkjøp

**Prinsipp:** Dashboardet er **aldri** avhengig av faktiske CSV-kolonnenavn. All logikk bruker interne standardiserte feltnavn.

---

## SECTION C - Implemented Business Logic

### OrderAnalyzer (v3) - Kjøpsfrekvensanalyse

**Implementerte beregninger:**

1. **Median dager mellom leveranser**
   - Beregner intervaller mellom unike leveringsdatoer
   - Filtrerer ut intervaller > 365 dager (prosjektordre)
   - Bruker median (ikke gjennomsnitt) for robusthet mot outliers

2. **Kjøpsstatus (trafikklys)**
   ```
   OK (grønn):        daysSinceLast ≤ median × 1.2
   Følg med (gul):    daysSinceLast ≤ median × 1.6
   Bør bestilles (rød): daysSinceLast > median × 1.6
   For lite historikk (grå): < 3 gyldige intervaller
   ```

3. **Bestillingsforslag**
   - For røde varer: Foreslår median antall per ordre
   - Ingen automatisert ERP-integrasjon (kun visning)

4. **Sesonganalyse (v3)**
   - Fokuserer på uke 16 og 42 (vedlikeholdsuker)
   - Analyserer uke før, fokusuke, og uke etter
   - Klassifisering:
     - Sesongspike (rød): qty_focus >> qty_before OG qty_after = 0
     - Engangs/event (gul): Aktivitet kun i fokusuke
     - Stabil etterspørsel (grønn): Aktivitet før/etter også
   - Anbefalt kvantitet: median historisk × 1.2 (20% sikkerhetsmargin)

**Hardkodede verdier:**
- `OK_THRESHOLD: 1.2`
- `FOLLOW_UP_THRESHOLD: 1.6`
- `MIN_INTERVALS_REQUIRED: 3`
- `MAX_VALID_INTERVAL_DAYS: 365`
- `SAFETY_FACTOR: 1.2`
- `SPIKE_THRESHOLD: 2.0`
- `FOCUS_WEEKS: [16, 42]`

### ButlerAnalyzer - Lagerstatusanalyse

**5 forhåndsdefinerte visninger:**

1. **0 i saldo (Aktiv)** - Aktive artikler med lagersaldo = 0
2. **Negativ saldo** - Artikler med stock < 0
3. **Under minimum** - stock < BP (beställningspunkt)
4. **Ingen bevegelse R12** - R12 salg = 0 for aktive artikler
5. **Høy reservasjon** - Reservert > 70% av total beholdning

**Implementerte flagg per artikkel:**
```javascript
_isActive = status === '0' || 'Active' || 'Aktiv'
_isZeroStock = stockNum === 0
_isNegative = stockNum < 0
_hasBelowMin = stockNum < minNum && minNum > 0
_hasNoMovement = r12SalesNum === 0
_hasHighReserve = (reservedNum / stockNum) > 0.70
```

**SA-nummer matching:**
- Normaliserer artikkelnummer (fjerner ledende nuller)
- Logger debug-info til konsoll
- Viser SA-nummer i tabeller når tilgjengelig

### InventoryRisk - Risikoscoring

**Risikoscore 0-100 basert på 4 faktorer:**

| Faktor | Vekt | Logikk |
|--------|------|--------|
| Stock vs Min | 40p | 0 stock = 40p, stock/min ≤ 0.5 = 30p, etc. |
| Leveringstidsrisiko | 30p | daysOfStock < leadTime = 30p |
| Forbruksrate | 20p | runway < 7 dager = 20p |
| Nullbeholdning | 10p | stock === 0 = +10p |

**Risikonivåer:**
- Kritisk: score ≥ 70
- Høy: score ≥ 50
- Medium: score ≥ 30
- Lav: score < 30

**Flytteforslag:**
- Identifiserer varer i flere lagre
- Foreslår overføring fra lager med overskudd til lager med underskudd
- Beregner kvantitet basert på deficit og excess

### ShutdownAnalyzer - Vedlikeholdsstopp

**Implementerte beregninger:**

1. **Filtrering til stoppuker**
   - Uke 14-16 (vår)
   - Uke 40-42 (høst)

2. **Kritiske varer**
   - Varer som bestilles i BEGGE stoppperioder
   - Sortert etter totalkvantitet

3. **Trendanalyse**
   - Sporer historikk per år
   - Klassifiserer: økende, synkende, stabil, ny

4. **Risikoscore (0-100)**
   - Ordrefrekvens: 0-30p
   - Trend: 0-25p
   - Volum: 0-25p
   - Begge perioder: 20p

5. **Anbefalinger**
   - Anbefalt lagernivå = maxHistoricalQty × 1.2
   - For økende trend: × 1.3
   - For nye varer: currentQty × 1.5

### FlowIssues - Problemsporing

**Kategorier:** Order, Item, Invoice, Pricing, Stock, Customer, Transfer, Other
**Systemer:** SAP, Jeeves, Both, Other
**Alvorlighetsgrader:** Low, Medium, High, Critical
**Statuser:** Open, Investigating, Workaround, Monitoring, Closed

**Analyse:**
- Teller problemer per status/kategori/system
- Identifiserer tilbakevendende problemer (samme rotårsak ≥ 3 ganger)
- Beregner gjennomsnittlig løsningstid

---

## SECTION D - What Information the User Can See Today

### Fra OrderAnalyzer kan brukeren se:

1. **Mest solgt** - Topp 50 artikler sortert etter totalkvantitet
2. **Oftest kjøpt (v3)**
   - Prioritert arbeidsliste med trafikklys
   - Antall røde/gule/grønne/grå artikler
   - Median dager mellom kjøp
   - Dager siden sist
   - Bestillingsforslag for røde varer

3. **Sesonganalyse (v3)**
   - Artikler med aktivitet rundt uke 16 eller 42
   - Klassifisering per artikkel (spike/engangs/stabil)
   - Anbefalt bestillingskvantitet

4. **Sesongmønstre**
   - Salg aggregert per måned
   - Topp 20 uker

5. **Per kunde**
   - Kunder sortert etter verdi
   - Antall ordre per kunde

6. **Tidslinje**
   - Månedlig utvikling av salg
   - Snitt per måned

### Fra ButlerAnalyzer kan brukeren se:

1. Antall artikler i hver problemkategori
2. Artikkelliste med:
   - Artikelnr, SA-nummer (hvis tilgjengelig), Beskrivelse
   - Hylla, Saldo, Disponibel, Reservert
   - BP (Min), Max, R12 salg, Leverandør
3. Detaljvisning per artikkel (alle Butler-kolonner)
4. Søk og filtrering
5. Eksport til CSV

### Fra InventoryRisk kan brukeren se:

1. Totalt kritiske varer
2. Antall lagre med data
3. Forslag til lagerflytting (fra/til/antall/begrunnelse)
4. Per-lager oversikt med risikostatus
5. Detaljert tabell over kritiske varer

### Fra ShutdownAnalyzer kan brukeren se:

1. Antall kritiske varer
2. Totalt ordrelinjer
3. År med historisk data
4. Anbefalinger gruppert etter kritikalitet
5. Detaljert tabell med risikoscore, trend, historisk maks

### Fra FlowIssues kan brukeren se:

1. Totalt/åpne/lukkede problemer
2. Tilbakevendende problemer
3. Fordeling per kategori og system
4. Problemliste med søk og filter

---

## SECTION E - Module-by-Module Breakdown

### OrderAnalyzer

**Hva den viser:**
- 6 faner med forskjellige analysevisninger
- KPI-kort med oppsummeringsstatistikk
- Tabeller med detaljerte data

**Beslutninger den støtter:**
- Når bør vi bestille denne varen? (trafikklys-status)
- Hvor mye bør vi bestille? (median-basert forslag)
- Hvilke varer selger mest? (prioritering)
- Hvilke varer trenger vi før vedlikeholdsstopp? (sesonganalyse)

**Data den avhenger av:**
- Tools/Qlik ordrehistorikk med: OrderNr, Artikelnr, Dato, Antall, Kunde, Verdi

**Data den IKKE bruker (men kunne):**
- Leveringssted-ID (lagret men ikke brukt i UI)
- Prisdata (parses men ikke brukt i beregninger)

### ButlerAnalyzer

**Hva den viser:**
- 5 forhåndsdefinerte problemvisninger
- Detaljmodal per artikkel
- SA-nummer matching-status

**Beslutninger den støtter:**
- Hvilke varer må handles NÅ? (0 saldo med definert min)
- Hvor er det feil i dataene? (negativ saldo)
- Hvilke varer rører seg ikke? (ingen R12-salg)
- Hvor er det kapasitetsproblemer? (høy reservasjon)

**Data den avhenger av:**
- Butler Excel-eksport med ~70 kolonner
- Valgfritt: SA-nummer mapping

**Data den IKKE bruker:**
- Mange av de 70 Butler-kolonnene vises kun i detaljmodal
- Leveringstid (finnes i Butler men brukes ikke)

### InventoryRisk

**Hva den viser:**
- Per-lager risikooversikt
- Kritiske varer med risikoscore
- Flytteforslag mellom lagre

**Beslutninger den støtter:**
- Hvilke varer må bestilles umiddelbart?
- Kan vi flytte varer mellom lagre i stedet for å bestille?
- Hvor lang tid har vi før kritisk?

**Data den avhenger av:**
- Lagerbeholdning per lager med: Warehouse, Item, Stock, Min, Max

**Data den IKKE bruker:**
- Consumption/Daily Usage (parses men ofte ikke tilgjengelig)
- Lead Time (parses men ofte ikke tilgjengelig)

### ShutdownAnalyzer

**Hva den viser:**
- Kritiske varer for vedlikeholdsperioder
- Historisk trend per vare
- Anbefalte lagernivåer

**Beslutninger den støtter:**
- Hva må være på lager før uke 16 stopp?
- Hva må være på lager før uke 42 stopp?
- Hvor mye bør vi ha på lager?

**Data den avhenger av:**
- Historisk ordredata med: Uke, År, Varenummer, Antall

**Data den IKKE bruker:**
- Kundedata (hvem som bestilte)
- Verdidata (økonomisk impact)

### FlowIssues

**Hva den viser:**
- Problemlogg med full workflow
- Analyse av kategorier, systemer, rotårsaker
- Tilbakevendende problemer

**Beslutninger den støtter:**
- Hvilke integrasjonsproblemer er aktive?
- Hva er de vanligste problemene?
- Hvordan utvikler problemene seg over tid?

**Data den avhenger av:**
- Manuelt registrerte problemer (ingen automatisk import)

**Data den IKKE bruker:**
- Ingen direkte kobling til SAP/Jeeves-logger

### Assortment

**Hva den viser:**
- Produktkatalog (minimal implementasjon)

**Data den IKKE bruker:**
- Mesteparten av implementasjonen er placeholder

---

## SECTION F - Known Gaps & Blind Spots (Observed Only)

### Manglende koblinger

1. **OrderAnalyzer ↔ ButlerAnalyzer**
   - Ingen automatisk kobling mellom kjøpshistorikk og nåværende beholdning
   - Brukeren må manuelt sammenligne "Bør bestilles" med Butler-status

2. **OrderAnalyzer ↔ InventoryRisk**
   - Ingen bruk av kjøpsfrekvens i risikoberegning
   - InventoryRisk bruker ikke median forbruk fra OrderAnalyzer

3. **SA-nummer matching**
   - Fungerer kun i én retning (Tools → Butler)
   - Ingen validering av mapping-kvalitet

### Ubrukte felt

1. **OrderAnalyzer**
   - `_deliveryLocationId` parses men vises ikke
   - `_priceNum` parses men brukes ikke i beregninger

2. **ButlerAnalyzer**
   - Mesteparten av de ~70 Butler-kolonnene vises kun i detaljmodal
   - `_leadTime` parses men brukes ikke i beregninger

3. **InventoryRisk**
   - `_consumption` parses men data er ofte fraværende
   - `_leadTime` parses men data er ofte fraværende

### Duplikat logikk

1. **Datoparser** - Lignende logikk i:
   - `DataLoader.parseDate()`
   - `OrderAnalyzer.parseDateV3()`
   - `OrderAnalyzer.parseOrdDtm()`

2. **Ukenummerkalkulator** - Implementert i:
   - `DataLoader.getWeekNumber()`
   - `OrderAnalyzer.getWeekNumber()`
   - `OrderAnalyzer._getISOWeekYear()`

3. **Kolonnemapping** - Separate mappingstrukturer i:
   - `DataLoader.COLUMN_VARIANTS`
   - `OrderAnalyzer.ORDER_COLUMNS`
   - `ButlerAnalyzer.BUTLER_COLUMNS`
   - `InventoryRisk.extractXxx()`

### Beregninger som kan misforstås

1. **OrderAnalyzer "Dager siden sist"**
   - Basert på leveringsdato, ikke ordredato
   - Kan forvirre brukere som tenker "når bestilte kunden sist"

2. **ButlerAnalyzer "Høy reservasjon"**
   - 70% terskel er hardkodet
   - Ingen kontekst for HVA som er reservert

3. **InventoryRisk "Risikoscore"**
   - Kompleks formel med 4 faktorer
   - Brukeren ser bare et tall 0-100 uten forklaring

4. **ShutdownAnalyzer "Anbefalt lager"**
   - Basert på historisk maks + 20% buffer
   - Tar ikke hensyn til nåværende beholdning

### Data som lastes men ikke vises

1. **app.js data.saMappingData**
   - Lagres separat
   - Brukes kun for å berike Butler-data

2. **Butler alle kolonner**
   - ~70 kolonner lastes
   - Kun ~15 vises i tabeller
   - Resten tilgjengelig i detaljmodal

### Legacy-kode

Flere filer har "_js" suffikser som tyder på eldre versjoner:
- `shutdown_analyzer_js.js` (165 linjer vs 724 i `shutdownAnalyzer.js`)
- `inventory_risk_js.js` (154 linjer vs 670 i `inventoryRisk.js`)
- `flow_issues_js.js` (119 linjer vs 739 i `flowIssues.js`)
- `dataloader_js.js` (113 linjer vs 523 i `dataLoader.js`)

---

## SECTION G - Trust Level Assessment

### OrderAnalyzer

| Aspekt | Vurdering | Kommentar |
|--------|-----------|-----------|
| Datakvalitet | **Medium** | Avhenger av Qlik-eksport kvalitet, datoparsing kan feile |
| Beregningsklarhet | **Høy** | V3 logikk er godt dokumentert med WHY-kommentarer |
| Risiko for feiltolkning | **Medium** | "Bør bestilles" kan misforstås som automatisk ordre |

**Total:** ⭐⭐⭐⭐ **Høy tillit** - Godt designet med klare terskler

### ButlerAnalyzer

| Aspekt | Vurdering | Kommentar |
|--------|-----------|-----------|
| Datakvalitet | **Høy** | Direkte fra Butler, standardisert format |
| Beregningsklarhet | **Høy** | Enkle flagg basert på terskler |
| Risiko for feiltolkning | **Lav** | Visningene er selvforklarende |

**Total:** ⭐⭐⭐⭐⭐ **Meget høy tillit** - Direkte speilbilde av Butler-data

### InventoryRisk

| Aspekt | Vurdering | Kommentar |
|--------|-----------|-----------|
| Datakvalitet | **Medium** | Mangler ofte consumption og leadTime |
| Beregningsklarhet | **Medium** | Kompleks risikoscore uten synlig breakdown |
| Risiko for feiltolkning | **Medium** | Flytteforslag bør verifiseres manuelt |

**Total:** ⭐⭐⭐ **Medium tillit** - Nyttig oversikt, men forslag må valideres

### ShutdownAnalyzer

| Aspekt | Vurdering | Kommentar |
|--------|-----------|-----------|
| Datakvalitet | **Høy** | Basert på historisk ordredata |
| Beregningsklarhet | **Høy** | Tydelig logikk for kritiske varer |
| Risiko for feiltolkning | **Lav** | Anbefalinger er tydelig merket som forslag |

**Total:** ⭐⭐⭐⭐ **Høy tillit** - God for planlegging av vedlikeholdsstopp

### FlowIssues

| Aspekt | Vurdering | Kommentar |
|--------|-----------|-----------|
| Datakvalitet | **Variabel** | Avhenger av manuell registrering |
| Beregningsklarhet | **Høy** | Enkel telling og kategorisering |
| Risiko for feiltolkning | **Lav** | Ren loggføring uten komplekse beregninger |

**Total:** ⭐⭐⭐⭐ **Høy tillit** - Fungerer som forventet (kunnskapsbase)

### Assortment

| Aspekt | Vurdering | Kommentar |
|--------|-----------|-----------|
| Datakvalitet | **N/A** | Minimal implementasjon |
| Beregningsklarhet | **N/A** | Ingen kompleks logikk |
| Risiko for feiltolkning | **Lav** | Brukes lite |

**Total:** ⭐⭐ **Lav tillit** - Ikke ferdig implementert

---

## SECTION H - Executive Summary

### Hva dashboardet gjør GODT i dag

1. **Butler-analyse er sterk**
   - Direkte visning av lagerstatus fra Butler
   - 5 fokuserte problemvisninger
   - God søk og eksportfunksjonalitet

2. **OrderAnalyzer v3 er gjennomtenkt**
   - Median-basert analyse er robust
   - Tydelig trafikklys-klassifisering
   - Dokumentert med design-rationale

3. **Lokal databehandling**
   - Ingen data sendes til sky
   - Data lagres i localStorage mellom økter

4. **Fleksibelt import-system**
   - Støtter CSV og Excel
   - Automatisk kolonnedeteksjon
   - Import wizard for brukervalg

5. **Sesonganalyse for uke 16/42**
   - Identifiserer kritiske varer før vedlikeholdsstopp
   - Historisk trendanalyse

### Hva dashboardet IKKE gjør ennå

1. **Ingen automatisert bestilling**
   - Alle forslag er kun informative
   - Ingen integrasjon mot ERP

2. **Ingen sanntidsdata**
   - All data må lastes manuelt
   - Ingen automatisk oppdatering

3. **Manglende krysmodulkobling**
   - OrderAnalyzer og ButlerAnalyzer deler ikke data
   - Ingen kombinert visning

4. **Ingen varsling**
   - Ingen push-varsler for kritiske situasjoner
   - Brukeren må aktivt sjekke

5. **Assortment-modul er ufullstendig**
   - Minimal forretningslogikk
   - Fungerer mest som placeholder

### Trygge bruksområder I DAG

| Bruksområde | Trygghetsnivå | Kommentar |
|-------------|---------------|-----------|
| Se daglig Butler-status | ✅ Trygt | Direkte data uten transformasjon |
| Identifisere 0-saldo varer | ✅ Trygt | Enkel flaggsjekk |
| Planlegge før vedlikeholdsstopp | ✅ Trygt | Basert på historikk |
| Prioritere hvilke varer å følge opp | ⚠️ Støtte | Bruk som støtte, verifiser manuelt |
| Automatisk bestille basert på forslag | ❌ Ikke støttet | Dashboardet foreslår kun |
| Garantert komplett oversikt | ❌ Ikke garantert | Avhenger av datainnlasting |

### Hvis dashboardet forsvant i morgen

**Dette ville du miste:**

1. Rask oversikt over artikler med 0 saldo som har definert minimum
2. Visuell prioritering av varer som "bør bestilles" basert på kjøpsfrekvens
3. Historisk sesonganalyse for uke 16/42 planlegging
4. Samlet visning av risiko på tvers av 7 satellittlagre
5. Logg over SAP/Jeeves integrasjonsproblemer
6. Mulighet til å eksportere problemlister til CSV

**Dette ville du FORTSATT ha:**

1. Butler-eksport direkte i Excel
2. Qlik-data i originalformat
3. Mulighet til å gjøre samme analyser manuelt (men mye tregere)

---

## APPENDIX - Teknisk arkitektur

### Dataflyten

```
┌─────────────────────────────────────────────────────────────┐
│                       FILE UPLOAD                           │
│  CSV/Excel → DataLoader.loadCSV/loadExcel → Parsed data    │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                     IMPORT WIZARD                           │
│  app.js → showImportWizard → User selects target module     │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                   COLUMN MAPPING                            │
│  DataLoader.detectColumnMapping → Standardized fields       │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                      STORAGE                                │
│  app.data.{module} → localStorage (dashboardData)           │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                   MODULE UPDATE                             │
│  window.{Module}.update(data) → Enrich → Analyze → Render  │
└─────────────────────────────────────────────────────────────┘
```

### Filstruktur

```
borregaard-dashboard-main/
├── index.html                 # Hovedgrensesnitt
├── js/
│   ├── app.js                 # Hovedkontroller (829 linjer)
│   ├── dataLoader.js          # Filhåndtering (523 linjer)
│   ├── dataMapper.js          # Kolonnemapping (282 linjer)
│   ├── dataAggregator.js      # Aggregering (266 linjer)
│   ├── orderAnalyzer.js       # Ordreanalyse v3 (1262 linjer)
│   ├── butlerAnalyzer.js      # Butler-analyse (960 linjer)
│   ├── shutdownAnalyzer.js    # Vedlikeholdsanalyse (724 linjer)
│   ├── inventoryRisk.js       # Risikoanalyse (670 linjer)
│   └── flowIssues.js          # Problemsporing (739 linjer)
├── data/
│   ├── mapping/               # JSON mapping-konfig
│   └── contacts.json          # Lageransvarlige
└── borregaard-refill/         # Mobil lagersjekk-modul
```

### Eksterne avhengigheter

- **SheetJS (XLSX.js)** - CDN-lastet for Excel-parsing
- **Chart.js** - Nevnt i docs men ikke aktivt brukt

---

*Slutt på audit-rapport*
