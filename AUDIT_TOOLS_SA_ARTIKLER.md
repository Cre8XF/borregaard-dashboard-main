# Audit Report: Tools SA-nummer Artikler

**Date:** 2026-02-09
**Scope:** Dashboard data processing, SA-nummer integration, Tools article filtering
**Status:** AUDIT ONLY - No code changes made

---

## 1. Executive Summary

### Current State: CRITICAL - Dashboard Controller Misconfiguration

The dashboard has been architecturally redesigned for a "FASE 6.1" SA-first pipeline, but **the correct controller file is not loaded in `index.html`**. This means:

| Metric | Value |
|--------|-------|
| **Data utilization** | ~0% (pipeline never executes) |
| **Tools articles with SA-nummer in data** | 4,594 unique SA-numbers across 4,688 unique Tools article numbers |
| **SA articles currently displayed** | 0 (controller mismatch prevents processing) |
| **Critical gaps** | 1 showstopper, 3 major, 5 moderate |
| **Quick wins available** | 3 (swap controller, add column variants, map supplier) |

### The Root Cause

`index.html` (line 180) loads `js/app.js` - the **old** legacy controller (225 lines) that:
- Looks for a `fileInput` DOM element **that does not exist** in the current HTML
- Uses simple 4-bucket categorization (shutdown/inventory/flowIssues/assortment)
- Calls `ShutdownAnalyzer`, `InventoryRisk`, `FlowIssues`, `Assortment` - **none of which are loaded**

The **correct** controller `js/dashboard_app_js.js` (825 lines, FASE 6.1) exists in the repo but **is not included in any `<script>` tag**. This file:
- Handles the multi-file drop zone and individual file inputs
- Invokes `DataProcessor.processAllFiles()` (SA-first pipeline)
- Renders all 5 work modes via tab navigation
- Manages localStorage persistence (v4.3)

**Result: The entire FASE 6.1 pipeline, all 5 work modes, SA-number filtering, and data processing are loaded as JavaScript but never executed.**

---

## 2. Data Mapping Tables

### 2.1 SA-Nummer.xlsx

| Column | Used | Mapped To | Notes |
|--------|------|-----------|-------|
| `Artikelnr` | Yes | `UnifiedItem.toolsArticleNumber` | Primary join key to other files |
| `Kunds artikkelnummer` | Yes | `UnifiedItem.saNumber` (primary key) | 4,594 unique SA-numbers; 20 rows missing this value |
| `Foretagsnr` | No | - | 2 company numbers: 424186, 449930 |
| `Foretagsnamn` | No | - | Always "BORREGAARD AS" |
| `Artikelbeskrivning` | No | - | Article descriptions (redundant with Master) |
| `Specifikation` | No | - | 1,970 rows with spec data |
| **`Artikelbeskrivning.1`** | **No** | - | **Contains shelf/location codes (e.g., "12-3-B") for 3,422 of 9,375 rows - valuable warehouse data being ignored** |
| `Streckkod` | No | - | Barcode (nearly all null) |
| `HtDgr` | No | - | Always 0 |
| `Teknisk Status` | No | - | All null |
| `OOe, OPl, OFs, OFa, OBe, OTo` | No | - | Flags (always "Y") |
| `KTxt, Vvk` | No | - | Flags (always "Y") |
| `EA, EB` | No | - | Flags (always "N") |
| `Skapat av` | No | - | Created by (5 users) |
| `Skapad datum/tid` | No | - | Created date/time |
| `Uppdaterat av/datum` | No | - | Updated by/date (45 rows) |

**SA-Nummer.xlsx Summary:** 2 of 25 columns used (8%). Key gap: shelf/location data in `Artikelbeskrivning.1`.

### 2.2 Master_Artikkelstatus.xlsx

| Column | Used | Mapped To | Notes |
|--------|------|-----------|-------|
| `Artikelnr` | Yes | Lookup key (reverse map to SA) | Hard-bound mapping |
| `Artikelbeskrivning` | Yes | `item.description` | |
| `Artikelstatus` | Yes | `item.status`, `item._status`, `item.isDiscontinued` | 5 unique statuses |
| `TotLagSaldo` | Yes | `item.stock` | Total stock balance |
| `DispLagSaldo` | Yes | `item.available` | Disposable stock |
| `ReservAnt` | Yes | `item.reserved` | Reserved quantity |
| `Kalkylpris bas` | Yes | `item.kalkylPris` | Calculation price |
| `BestAntLev` | Yes | `item.bestAntLev` | Ordered from supplier |
| `Beställningsnummer` | Yes | `item.bestillingsNummer` | Purchase order number |
| `Ersätts av artikel` | Yes | `item.ersattAvArtikel` | Replacement article (153 rows) |
| `Ersätter artikel` | Yes | `item.ersatterArtikel` | Replaces article (1,219 rows) |
| `Lokasjon` | Yes | `item.location` | Only 1 unique value ("Borregaard") |
| **`Foretagsnamn`** | **No** | - | **SUPPLIER NAME - 210 unique suppliers. item.supplier is NEVER SET. This breaks supplier filters in AssortmentMode.** |
| **`Varugrupp`** | **No** | - | **PRODUCT GROUP - 89 categories. item.category is NEVER SET. This breaks category filters.** |
| `Lagersaldo (hylla)` | No | - | Stock balance (shelf) |
| `Lagerhylla` | No | - | Shelf location (27 unique values) |
| `LstK` | No | - | Cost center |
| `Forsalt antal` | No | - | Sold quantity |
| `RestAntal` | No | - | Remaining quantity |
| `BokAnt (lager)` | No | - | Booked quantity |
| `InvDat` | No | - | Inventory date |
| `InvJl` | No | - | Inventory journal |
| `InPrsBtoVal` | No | - | Purchase price gross value |
| `Valuta` | No | - | Currency (4 currencies) |
| `Valutakurs` | No | - | Exchange rate |
| `Inkopspris` | No | - | Purchase price |
| `BudgKalkPrs` | No | - | Budget calc price |
| `Skapad datum/tid` | No | - | Created date/time |
| `VGrp` | No | - | Product group code |
| `Specifikation` | No | - | Technical specification |
| `Lagersaldo` | No | - | Stock balance (duplicate column) |
| `BestHosPr` | No | - | On order with supplier |
| `Foretagsnr` | No | - | Company number |
| **`Lagervarde, inkop`** | **No** | - | **Stock value at purchase price - useful for capital analysis** |
| `Nettovikt kg` | No | - | Net weight |
| `OrderNr` | No | - | Order number |
| `Kalkylpris bas.1` | No | - | Duplicate calc price column (11,543 unique) |
| `Ursprungligt art.nr` | No | - | Original article number (1,011 unique) |
| `Fors.ant f.ar` | No | - | Sold prior year |
| `AKl` | No | - | Article class (15 classes) |
| `Lagerforsorjning` | No | - | Supply method (5 types) |
| `Ej med i disp saldo` | No | - | Not in disposable stock |

**Master_Artikkelstatus.xlsx Summary:** 12 of 59 columns used (20%). Critical gaps: `Foretagsnamn` (supplier) and `Varugrupp` (category) break work mode filters.

### 2.3 Ordrer_Jeeves.xlsx

| Column | Used | Matched By | Notes |
|--------|------|------------|-------|
| **`Item ID`** | **BROKEN** | - | **CRITICAL BUG: Not in ORDRER_COLUMN_VARIANTS. The partial matching would incorrectly match `Item` (description) instead via `ItemNo` variant containing "item".** |
| `Item` | Mismatched | `articleNumber` (incorrectly) | Description column, but partial matching with `ItemNo` variant would return this as the article number |
| `Date` | Yes | `date` variant | Format: "2025-02-03" |
| `Order number` | Yes | `orderNoOut` variant | 6,956 distinct orders |
| `Delivered quantity` | Yes | `quantityOut` via partial match on "quantity" | |
| `Delivered value` | No | - | Monetary value per order line (4,645 unique values) |
| `Customer ID` | No | - | Always 424186 (Borregaard) |
| `Delivery location ID` | Likely broken | - | May not match `deliveryLocation` variants (LevPlFtgKod, DH, etc.) |
| `Order count` | No | - | Always 1 |
| `Order row count` | No | - | Values 1-4 |

**Ordrer_Jeeves.xlsx Summary:** The article number column (`Item ID`) is not in the variant list, which means order data CANNOT be linked to articles. This is a critical data pipeline bug (dormant because the pipeline doesn't run). The `Delivered value` column is also unused but valuable for revenue analysis.

### 2.4 Analyse_Lagerplan.xlsx (Optional)

| Column | Used | Mapped To | Notes |
|--------|------|-----------|-------|
| `Artikelnr` | Yes | Lookup key | |
| `BP` | Yes | `item.bestillingspunkt`, `item.bp` | 73 unique BP values |
| `EOK` | Yes | `item.ordrekvantitet` | 60 unique EOK values |
| **`Leverantor`** | **No** | - | **Supplier name - 103 unique suppliers. Alternative source for item.supplier.** |
| `Artikelbeskrivning` | No | - | Redundant |
| `Lagersaldo` | No | - | Redundant with Master |
| `ReservAnt` | No | - | Redundant |
| `BestAntLev` | No | - | Redundant |
| `TotLagSaldo` | No | - | Redundant |
| `Forsalt antal` | No | - | Sold quantity this year |
| `Maxlager` | No | - | Max stock (2 values) |
| `Fors.ant f.ar` | No | - | Sold prior year |
| `FbrAntDA` | No | - | Consumption this year |
| `Bristsaldo` | No | - | Shortage balance |
| `Brist disp saldo` | No | - | Shortage disposable balance |
| `DispLagSaldo` | No | - | Redundant |
| `Varugrupp` | No | - | Product group (89 groups) |
| `Specifikation` | No | - | Technical spec |
| `Lagervarde kalk.pris` | No | - | Stock value at calc price |
| `ArtSalj` | No | - | Sales status (3 values) |
| `Beraknat kalkylpris` | No | - | Calculated cost price |
| `SInlDat` | No | - | Last receipt date |
| `SUtlevDat` | No | - | Last delivery date |
| `Lagerstalle` | No | - | Warehouse location (2 values) |
| `Foretagsnamn` | No | - | Supplier company name |

**Analyse_Lagerplan.xlsx Summary:** 3 of 35 columns used (9%). Key gap: `Leverantor` and `Varugrupp` could fill missing supplier/category data.

---

## 3. Feature Inventory

### 3.1 Script Loading Status

| Script File | In index.html | Status | Purpose |
|-------------|--------------|--------|---------|
| `js/dataLoader.js` | Yes | Loaded, idle | CSV/XLSX parsing engine |
| `js/models/unifiedItem.js` | Yes | Loaded, idle | UnifiedItem + UnifiedDataStore classes |
| `js/dataProcessor.js` | Yes | Loaded, idle | FASE 6.1 pipeline orchestrator |
| `js/workModes/overview.js` | Yes | Loaded, idle | Modus 1: Daglig kontroll |
| `js/workModes/demand.js` | Yes | Loaded, idle | Modus 2: Ettersporseel & Salg |
| `js/workModes/assortment.js` | Yes | Loaded, idle | Modus 3: Sortiment & Rydding |
| `js/workModes/planning.js` | Yes | Loaded, idle | Modus 4: Planlegging |
| `js/workModes/alternatives.js` | Yes | Loaded, idle | Modus 5: Utgaende Alternativer |
| `js/topSellers.js` | Yes | Loaded, idle | Legacy: Top sellers (overlaps DemandMode) |
| `js/orderSuggestions.js` | Yes | Loaded, idle | Legacy: BP suggestions (overlaps PlanningMode) |
| `js/slowMovers.js` | Yes | Loaded, idle | Legacy: Slow movers (overlaps AssortmentMode) |
| `js/inactiveItems.js` | Yes | Loaded, idle | Legacy: Inactive items (overlaps AssortmentMode) |
| **`js/app.js`** | **Yes** | **Active (WRONG)** | **Old legacy controller - does not match current HTML** |
| **`js/dashboard_app_js.js`** | **No** | **Not loaded (SHOULD BE)** | **Correct FASE 6.1 controller** |
| `js/dataMapper.js` | No | Not loaded | CSV column mapping engine |
| `js/dataMappingUI.js` | No | Not loaded | Mapping status display |
| `js/dataAggregator.js` | No | Not loaded | Data aggregation utilities |
| `js/insightEngine.js` | No | Not loaded | Cross-module intelligence |
| `js/orderAnalyzer.js` | No | Not loaded | Order frequency + seasonal analysis |
| `js/inventoryRisk.js` | No | Not loaded | Multi-warehouse risk monitoring |
| `js/replenishmentOptimizer.js` | No | Not loaded | 3-source BP optimization |
| `js/butlerAnalyzer.js` | No | Not loaded | Butler warehouse state analysis |
| `js/shutdownAnalyzer.js` | No | Not loaded | Maintenance shutdown planning |
| `js/locationAnalyzer.js` | No | Not loaded | Per-location breakdown |
| `js/flowIssues.js` | No | Not loaded | Integration issue tracking |
| `js/contacts.js` | No | Not loaded | Contact management |
| `js/utils/dateParser.js` | No | Not loaded | Centralized date parser |
| `js/utils/sortableTable.js` | No | Not loaded | Table sorting utility |

### 3.2 Feature Status Matrix

| Feature/Module | Status | Location | Data Source | Notes |
|----------------|--------|----------|-------------|-------|
| **FASE 6.1 Pipeline** | Dead code | `dataProcessor.js` | All 4 Excel files | Loaded but never invoked - controller mismatch |
| **Modus 1: Daglig kontroll** | Dead code | `workModes/overview.js` | UnifiedDataStore | Issues, BP alerts, incoming orders |
| **Modus 2: Ettersporseel** | Dead code | `workModes/demand.js` | UnifiedDataStore | 7 sub-views: top sellers, frequency, trends, etc. |
| **Modus 3: Sortiment** | Dead code | `workModes/assortment.js` | UnifiedDataStore | Slow movers, null-salg, inactive, discontinued, candidates |
| **Modus 4: Planlegging** | Dead code | `workModes/planning.js` | UnifiedDataStore | Critical items, reorder suggestions, PO grouping |
| **Modus 5: Alternativer** | Dead code | `workModes/alternatives.js` | UnifiedDataStore | Outgoing article alternative analysis |
| Multi-file drop zone | Dead UI | `index.html` | - | HTML exists, no JS handler (app.js looks for `fileInput`) |
| Individual file inputs | Dead UI | `index.html` | - | masterFile, ordersOutFile, saFile, lagerplanFile - unhandled |
| Tab navigation | Dead UI | `index.html` | - | 5 tabs present, no switch logic in app.js |
| Summary cards | Dead UI | `index.html` | - | totalItems, criticalCount, etc. - never updated |
| Category workflow | Scaffolded | `assortment.js:1097-1230` | - | Phase 2B design in comments, helper methods exist |
| Butler deep-links | Active (in code) | `assortment.js:763-794` | - | Builds URLs to Butler widget 142 |
| CSV export | Active (in code) | All work modes | UnifiedDataStore | Each mode has exportCSV() |
| TopSellers (legacy) | Loaded, idle | `topSellers.js` | UnifiedDataStore | Overlaps with DemandMode |
| SlowMovers (legacy) | Loaded, idle | `slowMovers.js` | UnifiedDataStore | Overlaps with AssortmentMode |
| InactiveItems (legacy) | Loaded, idle | `inactiveItems.js` | UnifiedDataStore | Overlaps with AssortmentMode |
| OrderSuggestions (legacy) | Loaded, idle | `orderSuggestions.js` | UnifiedDataStore | Overlaps with PlanningMode |
| OrderAnalyzer | Not loaded | `orderAnalyzer.js` | Order history | V3 purchase frequency, seasonal analysis |
| ReplenishmentOptimizer | Not loaded | `replenishmentOptimizer.js` | 3 data sources | BP optimization with risk categories |
| ShutdownAnalyzer | Not loaded | `shutdownAnalyzer.js` | Order history | Maintenance week analysis (wk 14-16, 40-42) |
| LocationAnalyzer | Not loaded | `locationAnalyzer.js` | Order data | Per-location (9 locations) sales breakdown |
| InsightEngine | Not loaded | `insightEngine.js` | Cross-module | Risk scoring, underutilized stock detection |
| ButlerAnalyzer | Not loaded | `butlerAnalyzer.js` | Butler exports | 5 filtered views, SA-number mapping |
| InventoryRisk | Not loaded | `inventoryRisk.js` | Warehouse data | Multi-warehouse risk, transfer suggestions |
| FlowIssues | Not loaded | `flowIssues.js` | Issue logs | SAP/Jeeves integration tracking |

---

## 4. Tools + SA-nummer Analysis

### 4.1 Key Numbers

| Metric | Count |
|--------|-------|
| Total rows in SA-Nummer.xlsx | 9,375 |
| Unique Tools article numbers (`Artikelnr`) | 4,688 |
| Unique SA-numbers (`Kunds artikkelnummer`) | 4,594 |
| Rows missing SA-nummer | 20 (skipped in processing) |
| Company numbers | 2 (424186, 449930) - some articles appear twice |
| Total Master articles | 15,582 |
| Master articles with SA-match | ~4,688 (estimated) |
| Master articles without SA-match | ~10,894 (stored in `masterOnlyArticles` for alt lookups) |
| Order lines in Ordrer_Jeeves.xlsx | 14,777 |
| Unique ordered article numbers | 2,322 |
| Delivery locations | 9 |

### 4.2 SA-nummer Filter Design (FASE 6.1)

The FASE 6.1 pipeline in `dataProcessor.js` implements strict SA-first filtering:

```
Pipeline Step 1: SA-Nummer.xlsx → CREATES items
  - Only articles with SA-nummer become UnifiedItem objects
  - Items keyed by SA-number as primary key
  - toolsArticleNumber stored as secondary key
  - Reverse lookup map: toolsArticleNumber → saNumber

Pipeline Step 2: Master.xlsx → ENRICHES items
  - Looks up each Master row's Artikelnr in reverse lookup map
  - If SA-match found → enriches existing item
  - If no SA-match → stored in masterOnlyArticles (for alternative lookups only)
  - Does NOT create new items

Pipeline Step 3: Ordrer_Jeeves.xlsx → ENRICHES items
  - Looks up each order line's article number in reverse lookup map
  - If SA-match found → adds order data to item
  - If no SA-match → ignored (logged as unmatched)

Pipeline Step 4: Analyse_Lagerplan.xlsx → ENRICHES items (optional)
  - Same lookup pattern via reverse map
```

**Conclusion: The SA-number filter design is correct and strict.** Only SA-articles exist in the operative universe. The pipeline explicitly states: "Items som ikke finnes i SA-Nummer.xlsx eksisterer IKKE i dashboardet."

### 4.3 Is the SA-nummer Filter Applied Consistently?

**Yes, in the code.** All 5 work modes operate on `store.getActiveItems()` which returns only items from the SA-keyed `items` Map. There is no path for non-SA articles to appear in the UI.

**However, the filter never actually runs** because `dashboard_app_js.js` is not loaded.

### 4.4 "Tools" Supplier Filtering

There is **no explicit "Tools" supplier filter** in the code. This is by design - all articles in the SA-Nummer.xlsx file ARE Tools articles (Tools is the supplier managing Borregaard's inventory). The SA-nummer file implicitly defines the Tools article universe.

**However**, the `item.supplier` field is **never populated** by the DataProcessor. The Master.xlsx `Foretagsnamn` column (210 unique supplier names) is not mapped. This means:
- The AssortmentMode supplier filter dropdown will be empty
- Item detail modals show "-" for supplier
- No way to filter by sub-supplier within Tools' catalog

### 4.5 Articles Being Excluded

If the pipeline were running:
1. **20 SA rows without SA-nummer** would be skipped (correct behavior)
2. **~10,894 Master rows without SA-match** would be stored in `masterOnlyArticles` only (correct - used for alternative lookups)
3. **Order lines for non-SA articles** would be ignored (correct)
4. **All order lines** would fail to match due to `Item ID` column name bug (see Section 6.2)

---

## 5. Data Flow Diagram

### 5.1 Intended Flow (FASE 6.1 - Currently Dead)

```
                    ┌─────────────────────┐
                    │   dashboard_app_js   │ ← NOT LOADED IN index.html
                    │   (DashboardApp)     │
                    └──────────┬──────────┘
                               │
                    ┌──────────▼──────────┐
                    │   DataProcessor      │ ← Loaded but never called
                    │   processAllFiles()  │
                    └──────────┬──────────┘
                               │
         ┌─────────┬───────────┼───────────┬─────────┐
         ▼         ▼           ▼           ▼         │
    SA-Nummer  Master.xlsx  Ordrer.xlsx  Lagerplan   │
    (REQUIRED) (REQUIRED)  (REQUIRED)   (OPTIONAL)   │
         │         │           │           │         │
    Creates    Enriches    Enriches    Enriches      │
    items      stock/      sales/      BP/EOK       │
    (SA key)   status      orders                    │
         │         │           │           │         │
         └─────────┴───────────┴───────────┘         │
                               │                     │
                    ┌──────────▼──────────┐          │
                    │  UnifiedDataStore    │          │
                    │  (SA-keyed items)    │          │
                    └──────────┬──────────┘          │
                               │                     │
         ┌─────────┬───────────┼───────────┬─────────┘
         ▼         ▼           ▼           ▼
    Overview   Demand    Assortment  Planning  Alternatives
    Mode       Mode      Mode        Mode      Mode
    (Modus 1)  (Modus 2) (Modus 3)   (Modus 4) (Modus 5)
```

### 5.2 Actual Flow (Current State)

```
    ┌─────────────────────┐
    │      app.js          │ ← LOADED (wrong controller)
    │   (DashboardApp)     │
    └──────────┬──────────┘
               │
    Looks for 'fileInput' DOM element
               │
               ▼
    'fileInput' DOES NOT EXIST in index.html
               │
               ▼
    TypeError → caught by try/catch → error message shown
               │
               ▼
    ┌──────────────────────┐
    │  Nothing happens.    │
    │  No data processed.  │
    │  No modules render.  │
    │  Dashboard is empty. │
    └──────────────────────┘
```

---

## 6. Specific Code Audit

### 6.1 `index.html` (Lines 155-181)

**Scripts loaded:**
```html
<!-- Core Data Handling -->
<script src="js/dataLoader.js"></script>        <!-- Loaded, never used -->
<script src="js/models/unifiedItem.js"></script> <!-- Loaded, never used -->
<script src="js/dataProcessor.js"></script>      <!-- Loaded, never used -->

<!-- Work Modes -->
<script src="js/workModes/overview.js"></script>     <!-- Loaded, never rendered -->
<script src="js/workModes/demand.js"></script>       <!-- Loaded, never rendered -->
<script src="js/workModes/assortment.js"></script>   <!-- Loaded, never rendered -->
<script src="js/workModes/planning.js"></script>     <!-- Loaded, never rendered -->
<script src="js/workModes/alternatives.js"></script> <!-- Loaded, never rendered -->

<!-- Legacy (marked for removal) -->
<script src="js/topSellers.js"></script>       <!-- Loaded, never called -->
<script src="js/orderSuggestions.js"></script>  <!-- Loaded, never called -->
<script src="js/slowMovers.js"></script>        <!-- Loaded, never called -->
<script src="js/inactiveItems.js"></script>     <!-- Loaded, never called -->

<!-- WRONG CONTROLLER -->
<script src="js/app.js"></script>              <!-- Should be dashboard_app_js.js -->
```

**Missing script tag:**
```html
<!-- THIS IS WHAT SHOULD BE LOADED INSTEAD OF app.js: -->
<script src="js/dashboard_app_js.js"></script>
```

### 6.2 `dataProcessor.js` - Ordrer_Jeeves.xlsx Column Mapping Bug

**Location:** `dataProcessor.js` lines 41-75 (`ORDRER_COLUMN_VARIANTS`)

The actual column names in `Ordrer_Jeeves.xlsx` are:
- `Date`, `Customer ID`, `Delivery location ID`, `Item ID`, `Item`, `Order number`, `Delivered value`, `Delivered quantity`, `Order count`, `Order row count`

**Bug:** `Item ID` is NOT in `ORDRER_COLUMN_VARIANTS.articleNumber`:
```javascript
articleNumber: [
    'Artikelnr', 'Tools art.nr', 'Tools artnr',
    'Artikkelnr', 'Article No', 'ArticleNo', 'ItemNo', 'Varenr'
]
```

The `getColumnValue()` partial matching logic (line 751-758) would:
1. Try to match `Item ID` against `ItemNo` → `"item id".includes("itemno")` = false
2. Try to match `Item` (description column) against `ItemNo` → `"itemno".includes("item")` = **true**!
3. **Return the article DESCRIPTION instead of the article NUMBER**

This means all 14,777 order lines would either fail to match any SA-article or match the wrong one.

**Fix needed:** Add `'Item ID'` to `ORDRER_COLUMN_VARIANTS.articleNumber`.

Similarly, `Delivery location ID` does not match any `deliveryLocation` variant, and `Delivered value` and `Delivered quantity` need variants added.

### 6.3 `dataProcessor.js` - Missing Supplier/Category Mapping

**Location:** `dataProcessor.js` lines 22-37 (`MASTER_COLUMNS`)

The `MASTER_COLUMNS` object does not include:
- `Foretagsnamn` (supplier name) - **210 unique values available**
- `Varugrupp` (product group) - **89 categories available**

In `processMasterData()` (lines 401-508), these columns are never extracted. As a result, `item.supplier` and `item.category` remain empty/undefined for all items.

**Impact on work modes:**
- `AssortmentMode.getSuppliers()` returns empty set → supplier filter dropdown is empty
- `AssortmentMode.getCategories()` returns empty set → category filter dropdown is empty
- All item detail modals show "-" for supplier
- `DemandMode` customer concentration analysis has no supplier context

### 6.4 Work Mode Audit

#### Modus 1: Overview (`workModes/overview.js`, 896 lines)
- **Data expected:** `UnifiedDataStore` via `store.getActiveItems()`
- **SA-nummer check:** Implicit (all items in store are SA-articles)
- **Tools filter:** None needed (SA = Tools)
- **Displays:** Issues table, BP alerts, discontinued items, incoming orders
- **Calculates but limited by missing data:** Supplier-based grouping not possible

#### Modus 2: Demand (`workModes/demand.js`, 1,700 lines)
- **Data expected:** `UnifiedDataStore` with outgoing orders
- **SA-nummer check:** Implicit
- **7 sub-views:** Top sellers, order frequency, customer dependency, trends, warehouse trends, critical 3018, critical sales articles
- **Known issue:** `deliveryLocation` may not map correctly from Ordrer_Jeeves.xlsx → warehouse-based views (5, 6) would have no data

#### Modus 3: Assortment (`workModes/assortment.js`, 1,230 lines)
- **Data expected:** `UnifiedDataStore` with stock and sales data
- **SA-nummer check:** Implicit
- **5 sub-views:** Slow movers, null-salg, inactive, discontinued, candidates
- **Known issues:**
  - Supplier filter empty (supplier not mapped from Master)
  - Category filter empty (category not mapped from Master)
  - `estimertVerdi` requires `kalkylPris` (mapped) and stock (mapped) → should work
- **Dormant feature:** Category workflow (Phase 2B) - scaffolded at lines 1097-1230

#### Modus 4: Planning (`workModes/planning.js`, 1,054 lines)
- **Data expected:** `UnifiedDataStore` with BP, stock, sales, incoming orders
- **SA-nummer check:** Implicit
- **4 sub-views:** Critical items, reorder suggestions, incoming (PO-grouped), risk items
- **BP dependency:** Requires `Analyse_Lagerplan.xlsx` for BP values; without it, many planning features are limited

#### Modus 5: Alternatives (`workModes/alternatives.js`, 500 lines)
- **Data expected:** `UnifiedDataStore` with `ersattAvArtikel` from Master
- **SA-nummer check:** Implicit
- **Strict rule:** Only uses `Ersatts av artikel` from Master.xlsx (no inference)
- **Uses:** `store.resolveAlternativeStatus()` for centralized alternative lookup
- **Displays:** Outgoing articles with/without valid alternatives

---

## 7. Recommendations

### 7.1 CRITICAL FIXES (Showstoppers)

#### C1: Replace Controller Script in index.html
**Priority:** P0 - Nothing works without this
**File:** `index.html` line 180
**Change:** Replace `<script src="js/app.js"></script>` with `<script src="js/dashboard_app_js.js"></script>`
**Impact:** Activates the entire FASE 6.1 pipeline, all 5 work modes, file upload, tab navigation

#### C2: Add `Item ID` to Ordrer_Jeeves.xlsx Column Variants
**Priority:** P0 - Order data cannot be linked without this
**File:** `dataProcessor.js` line 42-45
**Change:** Add `'Item ID'` to `ORDRER_COLUMN_VARIANTS.articleNumber` array
**Also add:** `'Delivered quantity'` to `quantityOut`, `'Delivered value'` as new field, `'Delivery location ID'` to `deliveryLocation`

### 7.2 MAJOR FIXES (Data completeness)

#### M1: Map Supplier Name from Master.xlsx
**Priority:** P1 - Breaks supplier filter in AssortmentMode
**File:** `dataProcessor.js`
**Change:** Add `supplier: 'Foretagsnamn'` to `MASTER_COLUMNS` and set `item.supplier` in `processMasterData()`

#### M2: Map Product Group from Master.xlsx
**Priority:** P1 - Breaks category filter in AssortmentMode
**File:** `dataProcessor.js`
**Change:** Add `category: 'Varugrupp'` to `MASTER_COLUMNS` and set `item.category` in `processMasterData()`

#### M3: Map Stock Value from Master.xlsx
**Priority:** P2 - Enables capital analysis
**File:** `dataProcessor.js`
**Change:** Add `stockValue: 'Lagervarde, inkop'` to `MASTER_COLUMNS` and set on item

### 7.3 QUICK WINS (Low effort, high value)

#### Q1: Map Shelf Location from SA-Nummer.xlsx
**Priority:** P2
**File:** `dataProcessor.js` in `processSAData()`
**Change:** Extract `Artikelbeskrivning.1` column (contains shelf codes like "12-3-B" for 3,422 articles) and set as `item.shelf`

#### Q2: Map Delivered Value from Ordrer_Jeeves.xlsx
**Priority:** P2
**Change:** Add `'Delivered value'` as a new variant mapping and accumulate on items for revenue analysis

#### Q3: Remove Legacy Modules from index.html
**Priority:** P3
**File:** `index.html` lines 174-177
**Change:** Remove `topSellers.js`, `orderSuggestions.js`, `slowMovers.js`, `inactiveItems.js` script tags (functionality is covered by new work modes)

### 7.4 FUTURE ENHANCEMENTS (Data supports these)

| Enhancement | Data Available | Effort |
|------------|---------------|--------|
| Revenue per article view | `Delivered value` in Ordrer_Jeeves.xlsx | Medium |
| Article class segmentation | `AKl` (15 classes) in Master | Low |
| Supply method analysis | `Lagerforsorjning` (5 types) in Master | Low |
| Purchase price tracking | `Inkopspris` + `Valuta` in Master | Medium |
| Multi-currency value reporting | `Valuta` (4 currencies) in Master | Medium |
| Last receipt/delivery dates | `SInlDat`/`SUtlevDat` in Lagerplan | Low |
| Article creation date tracking | `Skapad datum/tid` in Master | Low |
| Shelf optimization | `Lagerhylla` (27 shelves) in Master + `Artikelbeskrivning.1` in SA | Medium |
| Activate dormant modules | 13 JS files not loaded (see Section 3.1) | High |
| Category workflow (Phase 2B) | Scaffolded in `assortment.js` lines 1097-1230 | Medium |

### 7.5 Dormant Module Assessment

These 13 JavaScript files exist but are not loaded in `index.html`:

| Module | Lines | Value if Activated | Dependency |
|--------|-------|--------------------|------------|
| `dashboard_app_js.js` | 825 | **ESSENTIAL** - the correct controller | None |
| `orderAnalyzer.js` | 1,263 | High - purchase frequency, seasonal analysis | Order data |
| `replenishmentOptimizer.js` | 1,099 | High - 3-source BP optimization | Butler + orders + purchase |
| `shutdownAnalyzer.js` | 725 | High - maintenance week planning | Order history |
| `locationAnalyzer.js` | 554 | Medium - per-location breakdown | Order data |
| `insightEngine.js` | 604 | Medium - cross-module intelligence | Butler + LocationAnalyzer |
| `inventoryRisk.js` | 671 | Medium - multi-warehouse monitoring | Warehouse data |
| `butlerAnalyzer.js` | 961 | Medium - Butler system integration | Butler exports |
| `flowIssues.js` | 740 | Low-Medium - integration issue tracking | Manual input |
| `dataMapper.js` | 283 | Low - generic CSV mapping | - |
| `dataMappingUI.js` | 243 | Low - mapping status display | DataMapper |
| `dataAggregator.js` | 267 | Low - simple aggregations | - |
| `contacts.js` | 196 | Low - contact management | contacts.json |

---

## 8. Summary of All Issues Found

| # | Severity | Issue | Location | Impact |
|---|----------|-------|----------|--------|
| 1 | **SHOWSTOPPER** | `dashboard_app_js.js` not loaded in index.html; old `app.js` loaded instead | `index.html:180` | Entire dashboard non-functional |
| 2 | **CRITICAL** | `Item ID` column from Ordrer_Jeeves.xlsx not in ORDRER_COLUMN_VARIANTS | `dataProcessor.js:42-45` | Order data cannot be linked to articles |
| 3 | **CRITICAL** | Partial matching would map `Item` (description) as article number | `dataProcessor.js:751-758` | Wrong data matched if pipeline runs |
| 4 | **MAJOR** | `Foretagsnamn` (supplier) not mapped from Master.xlsx | `dataProcessor.js:22-37` | Supplier filters empty across all modes |
| 5 | **MAJOR** | `Varugrupp` (category) not mapped from Master.xlsx | `dataProcessor.js:22-37` | Category filters empty across all modes |
| 6 | **MAJOR** | `Delivery location ID` may not match deliveryLocation variants | `dataProcessor.js:62-65` | Warehouse-based demand views broken |
| 7 | **MODERATE** | `Delivered value` not mapped from Ordrer_Jeeves.xlsx | `dataProcessor.js:41-75` | Revenue analysis not possible |
| 8 | **MODERATE** | Shelf location from SA-Nummer.xlsx (`Artikelbeskrivning.1`) not used | `dataProcessor.js:287-337` | 3,422 shelf codes ignored |
| 9 | **MODERATE** | `Leverantor` from Analyse_Lagerplan.xlsx not used | `dataProcessor.js:638-692` | Alternative supplier data source ignored |
| 10 | **MODERATE** | 13 JS modules exist but are not loaded | `index.html` | ~9,400 lines of analysis code dormant |
| 11 | **LOW** | 4 legacy modules loaded but overlap with new work modes | `index.html:174-177` | Unnecessary code loaded |
| 12 | **LOW** | Category workflow Phase 2B scaffolded but not wired | `assortment.js:1097-1230` | Future feature partially built |

---

## Appendix A: Complete Column Coverage Summary

| File | Total Columns | Columns Used | % Used | Key Gaps |
|------|--------------|-------------|--------|----------|
| SA-Nummer.xlsx | 25 | 2 | 8% | Shelf locations, descriptions |
| Master_Artikkelstatus.xlsx | 59 | 12 | 20% | Supplier, category, stock value |
| Ordrer_Jeeves.xlsx | 10 | 4* | 40%* | *Article ID broken; Delivered value |
| Analyse_Lagerplan.xlsx | 35 | 3 | 9% | Supplier, product group, sales data |
| **Total** | **129** | **21** | **16%** | |

*Ordrer_Jeeves.xlsx: 4 columns theoretically mapped but article number matching is broken, reducing effective usage to ~30%.

## Appendix B: SA-Nummer Data Quality

- 9,375 total rows
- 4,688 unique `Artikelnr` (Tools article numbers)
- 4,594 unique `Kunds artikkelnummer` (SA-numbers)
- 20 rows missing SA-nummer (0.2% - correctly skipped)
- 2 company numbers present (424186, 449930) - articles may appear twice
- 5 different creators (`Skapat av`)
- Only 45 rows ever updated after creation

---

*End of Audit Report*
