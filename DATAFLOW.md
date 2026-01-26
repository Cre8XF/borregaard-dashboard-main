# Borregaard Dashboard - Dataflyt

## Datakilder

### 1. Butler Excel-eksport (daglig)
**Fil:** `Lager_Borregaard.xlsx` eller lignende
**Kolonner:** ~88 (Artikelnr, Lagersaldo, DispLagSaldo, BP, R12 Del Qty, etc.)
**Destinasjon:** `ButlerAnalyzer`
**Frekvens:** Daglig

### 2. Salgshistorikk med Delivery Location (NY!)
**Fil:** `c2409b41-9fae-4adb-b5c1-4d2b84c8dc5a.xlsx`
**Kolonner:** 8 (Date, Customer ID, Delivery location ID, Item ID, Item, Order number, Delivered value, Delivered quantity)
**Destinasjon:** `LocationAnalyzer` -> `InsightEngine`
**Frekvens:** Ukentlig/Månedlig

**Nøkkeltall:**
- 14,330 ordrelinjer
- 2,302 unike artikler
- 9 leveringslokasjoner

### 3. SA-nummer mapping (Jeeves)
**Fil:** Artikkelknytte fra Jeeves
**Destinasjon:** `ButlerAnalyzer` (beriker data)
**Frekvens:** Ved behov

### 4. Ordre historikk (Tools - generell)
**Fil:** Diverse ordreeksporter
**Destinasjon:** `OrderAnalyzer`
**Frekvens:** Ved behov

## Modulkjede

```
1. Datainnlasting
   ↓
2. Import Wizard (brukervalg av modul)
   ↓
3. Kolonnedeteksjon (DataLoader)
   ↓
4. Modul-analyse
   ├── ButlerAnalyzer (lagerstatus)
   ├── LocationAnalyzer (salg per lager) ← NY!
   └── OrderAnalyzer (salgshistorikk)
   ↓
5. Kryssanalyse
   └── InsightEngine (Butler + Location) ← NY!
   ↓
6. Prioritert handlingsliste
```

## Kryssmodulkobling

### InsightEngine kombinerer:
- **Butler:** Artikler med 0-saldo, under minimum, negativ
- **Location:** Hvilke lagre som kjøper disse ofte
- **Resultat:** Prioritert etterfyllingsliste per lager

### Eksempel-flyt:
1. Butler melder: "Artikkel 12345 har 0 i saldo"
2. LocationAnalyzer finner: "Satellitt 3 kjøper denne 8 ganger siste år"
3. InsightEngine konkluderer: "Risikoscore 85 - artikkel 12345 trenger etterfylling for Satellitt 3"
4. Foreslår bestilling: Median(historiske ordre) x 1.2

## Modulhierarki for beslutninger

### For lagerspesifikke beslutninger (primær):
1. **InsightEngine** - Kombinert analyse (Butler + Location)
2. **LocationAnalyzer** - Salgshistorikk per leveringslokasjon
3. **ButlerAnalyzer** - Dagens lagerstatus

### OrderAnalyzer beholdes for:
- Generell trendanalyse (alle kunder samlet)
- Sesongmonstre over flere ar
- Totaloversikt uten lagerdimensjon

### OrderAnalyzer brukes IKKE for:
- Lagerspesifikke bestillinger (bruk LocationAnalyzer)
- Kritisk-lav analyse (bruk InsightEngine)
- Satellittlager-spesifikk analyse (bruk LocationAnalyzer)

**Forklaring:**
OrderAnalyzer ble bygget for Delivery Location ID ble oppdaget. Den viser generelle kjopsmonstre, men LocationAnalyzer gir lagerspesifikk innsikt som er nodvendig for presis etterfylling.

## Leveringslokasjoner

| ID | Navn | Andel |
|----|------|-------|
| 424186 | Hovedlager | 72% |
| 10003790 | Spesiallager | 10% |
| 424186-2 | Satellitt 2 | 6% |
| 424186-6 | Satellitt 6 | 5% |
| 424186-5 | Satellitt 5 | 3% |
| 424186-3 | Satellitt 3 | 3% |
| 424186-4 | Satellitt 4 | 1% |
| 424186-1 | Satellitt 1 | 1% |
| 424186-7 | Satellitt 7 | <1% |

## Risikoscore-beregning (InsightEngine)

Risikoscore: 0-100 poeng basert pa:

| Faktor | Maks poeng | Logikk |
|--------|------------|--------|
| Butler-status | 40p | 0-saldo=40, Negativ=35, Under min=20 |
| Ordrefrekvens | 30p | >=10 ordre=30, >=6=20, >=3=10 |
| Nylig aktivitet | 20p | <=7 dager=20, <=30=15, <=60=10 |
| Verdi | 10p | >=10k=10, >=5k=7, >=1k=5 |

**Terskel:** Score >= 50 vises i prioritetsliste

## Utilities

### DateParser (sentralisert)
Brukes av alle moduler for:
- `parse(dateStr)` - Multi-format datoparsing
- `getWeekNumber(date)` - ISO uke-nummer
- `parseNumber(value)` - Norsk/svensk tallformat
- `toNorwegian(date)` - DD.MM.YYYY

### SortableTable
Brukes for klikkbare kolonneoverskrifter:
- Klikk = sorter stigende
- Klikk igjen = sorter synkende
- Tredje klikk = original rekkefolge
- Stotter norsk tallformat

## Filstruktur

```
js/
├── utils/
│   ├── dateParser.js      # Sentralisert dato/tall-parsing
│   └── sortableTable.js   # Sorterbare tabeller
├── app.js                 # Hovedkontroller
├── dataLoader.js          # Filhandtering
├── dataMapper.js          # Kolonnemapping
├── dataAggregator.js      # Aggregering
├── butlerAnalyzer.js      # Butler-analyse
├── orderAnalyzer.js       # Ordreanalyse (generell)
├── locationAnalyzer.js    # Lokasjonsanalyse (NY!)
├── insightEngine.js       # Kryssanalyse (NY!)
├── shutdownAnalyzer.js    # Vedlikeholdsplanlegging
├── inventoryRisk.js       # Risikoanalyse
├── flowIssues.js          # Problemsporing
└── assortment.js          # Kundesortiment
```

## Viktig for brukere

### Datainnlasting-rekkefolge:
1. Last Butler-eksport forst (gir lagerstatus)
2. Last salgshistorikk med Delivery Location (gir frekvens per lager)
3. InsightEngine aktiveres automatisk nar begge finnes

### Disclaimer:
Alle forslag fra InsightEngine er beslutningsstotte.
Endelig bestilling vurderes manuelt av plassansvarlig.
