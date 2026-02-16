# Audit Report: Excel Sources & Power BI Migration Plan

**Date:** 2026-02-16
**Scope:** Structural analysis of all Excel data sources, data flow mapping, and Power BI migration feasibility
**Status:** PHASE 1 — ANALYSIS ONLY (no code changes)

---

## 1. Executive Summary

The dashboard currently consumes 4 Excel files in a strict pipeline order (FASE 6.1 architecture). Analysis shows that **SA-Nummer.xlsx and Analyse_Lagerplan.xlsx can both be replaced** by the new Power BI export, provided it contains the required fields. Master_Artikkelstatus.xlsx already carries stock, incoming quantities, and kalkylpris. The `UnifiedItem.calculate()` method correctly computes `estimertVerdi`.

| Finding | Status |
|---------|--------|
| SA-Nummer.xlsx can be replaced by Power BI export | YES — if Power BI contains VareNr + SA number mapping |
| Analyse_Lagerplan.xlsx can be removed | YES — only provides BP/EOK (optional, rarely populated) |
| Master_Artikkelstatus has stock + incoming | YES — TotLagSaldo, BestAntLev, Kalkylpris all present |
| UnifiedItem.calculate() handles estimertVerdi | YES — `kalkylPris * stock` at lines 207-211 |
| Quarter/department sales exist in codebase | NO — not currently implemented (only department in contacts.js) |

---

## 2. Current File Dependencies

### 2.1 SA-Nummer.xlsx (REQUIRED — creates the operative universe)

**Role:** Defines which items exist in the dashboard. Every `UnifiedItem` is created from this file.

**Referenced in:**

| File | Line(s) | Usage |
|------|---------|-------|
| `js/app.js` | 4, 12, 23 | `this.files.sa` — file slot declaration |
| `js/dataProcessor.js` | 3, 12, 98-120, 165-183, 296-358 | `processSAData()` — creates items via `store.createFromSA()` |
| `js/models/unifiedItem.js` | 3, 12, 81-84, 123-134, 337-357 | `createFromSA()` on UnifiedDataStore; `setSAData()` on UnifiedItem |

**Columns consumed (2 of 25):**

| Column | Maps to | Critical? |
|--------|---------|-----------|
| `Artikelnr` | `UnifiedItem.toolsArticleNumber` | YES — join key to Master/Ordrer |
| `Kunds artikkelnummer` | `UnifiedItem.saNumber` (primary key) | YES — dashboard identity |
| `SA-type`, `Gyldig fra/til` | `saType`, `saGyldigFra`, `saGyldigTil` | LOW — rarely populated |

**Structural impact:** This file is the **gatekeeper**. Without it, `store.items` is empty and no data is displayed. The entire FASE 6.1 pipeline depends on SA-Nummer.xlsx running first.

---

### 2.2 Analyse_Lagerplan.xlsx (OPTIONAL — planning parameters)

**Role:** Enriches items with BP (bestillingspunkt) and EOK (ordrekvantitet). Declared optional in architecture.

**Referenced in:**

| File | Line(s) | Usage |
|------|---------|-------|
| `js/app.js` | 15, 24 | `this.files.lagerplan` — file slot (optional) |
| `js/dataProcessor.js` | 5, 15, 122-136, 223-245, 680-771 | `processLagerplanData()` — enriches BP/EOK |
| `js/models/unifiedItem.js` | 19, 77-79 | `bestillingspunkt`, `ordrekvantitet` fields |
| `js/workModes/planning.js` | ~212, ~274 | Uses `item.bp` for reorder suggestions |
| `js/workModes/overview.js` | ~233-234 | Displays BP in issue detection |

**Columns consumed (3):**

| Column | Maps to | Critical? |
|--------|---------|-----------|
| `Artikelnr` | Lookup key (via toolsArticleNumber → SA) | YES |
| `BP` | `item.bestillingspunkt`, `item.bp` | LOW |
| `EOK` | `item.ordrekvantitet` | LOW |

**Structural impact:** MINIMAL. The file is wrapped in a try/catch and explicitly documented as optional. If missing, items simply have `bestillingspunkt = null` and `ordrekvantitet = null`. The planning workMode degrades gracefully.

---

### 2.3 Master_Artikkelstatus.xlsx (REQUIRED — enrichment)

**Role:** Primary enrichment source. Provides stock, status, incoming, alternatives, and pricing.

**Fields already present in Master that answer the audit questions:**

| Field | Column | Maps to | Confirms |
|-------|--------|---------|----------|
| Stock balance | `TotLagSaldo` | `item.stock` | Master has stock |
| Available stock | `DispLagSaldo` | `item.available` | Master has available |
| Reserved | `ReservAnt` | `item.reserved` | Master has reserved |
| Incoming quantity | `BestAntLev` | `item.bestAntLev` | Master has incoming |
| Purchase order | `Beställningsnummer` | `item.bestillingsNummer` | Master has PO numbers |
| Calculation price | `Kalkylpris bas` | `item.kalkylPris` | Master has pricing |
| Status | `Artikelstatus` | `item.status`, `item._status`, `item.isDiscontinued` | Master has lifecycle |
| Replacement | `Ersätts av artikel` | `item.ersattAvArtikel` | Master has replacements |
| Replaces | `Ersätter artikel` | `item.ersatterArtikel` | Master has reverse map |

**Conclusion:** Master_Artikkelstatus.xlsx is the richest data source and MUST be retained.

---

### 2.4 Ordrer_Jeeves.xlsx (REQUIRED — sales history)

**Role:** Provides all outgoing sales data. Used for demand analysis, sales trends, and consumption calculations.

**Key fields:** `Item ID`, `Delivered quantity`, `Order number`, `Date`, `Customer`, `Delivery location ID`, `Brand`, `Supplier ID`

**Conclusion:** Must be retained for sales/demand analysis. Cannot be replaced by Power BI unless the export includes full sales history.

---

## 3. UnifiedItem.calculate() — estimertVerdi Verification

**File:** `js/models/unifiedItem.js`, lines 139-212

```javascript
// Lines 207-211
if (this.kalkylPris > 0 && this.stock > 0) {
    this.estimertVerdi = this.kalkylPris * this.stock;
} else {
    this.estimertVerdi = 0;
}
```

**Verification:** CORRECT.
- `kalkylPris` is set from Master.xlsx (`Kalkylpris bas`) in `dataProcessor.js:488-490`
- `stock` is set from Master.xlsx (`TotLagSaldo`) in `dataProcessor.js:484`
- `estimertVerdi` is only computed when both values are positive
- The formula `kalkylPris * stock` matches the documented spec (line 22: "estimertVerdi = kalkylPris * lagersaldo")
- No external files contribute to this calculation — it's purely derived from Master data

---

## 4. Data Flow Map

```
┌─────────────────────────────────────────────────────────────────┐
│                     USER UPLOADS 4 FILES                        │
│  SA-Nummer.xlsx | Master.xlsx | Ordrer_Jeeves.xlsx | Lagerplan  │
└──────────┬──────────┬──────────────┬───────────────┬────────────┘
           │          │              │               │
           ▼          │              │               │
┌──────────────────┐  │              │               │
│  DataLoader      │◄─┼──────────────┼───────────────┘
│  loadExcel()     │  │              │   (generic file parser)
│  loadCSV()       │  │              │
└──────────┬───────┘  │              │
           │          │              │
           ▼          ▼              ▼
┌──────────────────────────────────────────────────────────────┐
│                    DataProcessor                              │
│  processAllFiles(files) — STRICT PIPELINE ORDER              │
│                                                              │
│  STEP 1: processSAData()                                     │
│    SA-Nummer.xlsx → store.createFromSA(saNumber, toolsArtNr) │
│    Creates UnifiedItem objects (defines universe)             │
│                                                              │
│  STEP 2: processMasterData()                                 │
│    Master.xlsx → store.getByToolsArticleNumber(artNr)        │
│    Enriches: stock, status, kalkylPris, bestAntLev,          │
│              ersattAv/ersatter, supplier, category            │
│    Non-SA rows → store.masterOnlyArticles (for alt lookups)  │
│                                                              │
│  STEP 3: processOrdersOutData()                              │
│    Ordrer_Jeeves.xlsx → item.addOutgoingOrder()              │
│    Enriches: sales history, brand, supplierId                │
│                                                              │
│  STEP 4: processLagerplanData() [OPTIONAL]                   │
│    Analyse_Lagerplan.xlsx → item.bestillingspunkt, item.bp   │
│    Enriches: BP, EOK                                         │
│                                                              │
│  STEP 5: store.calculateAll()                                │
│    → item.calculate() on each UnifiedItem                    │
│    → sales6m, sales12m, monthlyConsumption, daysToEmpty      │
│    → estimertVerdi = kalkylPris * stock                      │
└──────────────────────┬───────────────────────────────────────┘
                       │
                       ▼
┌──────────────────────────────────────────────────────────────┐
│                  UnifiedDataStore                             │
│                                                              │
│  items: Map<saNumber, UnifiedItem>     (primary)             │
│  toolsLookup: Map<toolsArtNr, saNumber> (reverse)           │
│  masterOnlyArticles: Map<toolsArtNr, data> (non-SA items)   │
│  alternativeArticles: Map<toolsArtNr, [{altArticle}]>       │
│                                                              │
│  Key methods:                                                │
│    createFromSA() → new UnifiedItem                          │
│    getByToolsArticleNumber() → reverse lookup                │
│    resolveAlternativeStatus() → full alt classification      │
│    getArticlesWithoutSA() → 3 groups (stock/incoming/none)   │
│    calculateAll() → derives all computed fields              │
└──────────────────────┬───────────────────────────────────────┘
                       │
                       ▼
┌──────────────────────────────────────────────────────────────┐
│                    WorkModes (UI)                             │
│                                                              │
│  overview.js       → Dashboard summary, incoming orders,     │
│                      issue detection, top items by value     │
│  planning.js       → Reorder suggestions, BP analysis,      │
│                      incoming order groups by PO number      │
│  demand.js         → Sales trends, consumption analysis,     │
│                      discontinued item recommendations       │
│  assortment.js     → Customer assortment analysis,           │
│                      SA coverage, estimated values           │
│  alternatives.js   → Discontinued → replacement analysis,    │
│                      resolveAlternativeStatus() results      │
│  noSaArticles.js   → Master-only items (3 groups),          │
│                      capital tied up without SA agreement     │
└──────────────────────────────────────────────────────────────┘
```

---

## 5. Power BI Export — Gap Analysis

The new Power BI export contains:
- **VareNr** (Item ID) → maps to `toolsArticleNumber`
- **SA number** → maps to `saNumber`
- **Replacement mapping** → maps to `ersattAvArtikel`
- **Status** → maps to `Artikelstatus`
- **Customer assortment** → new field (not currently in SA-Nummer.xlsx)

### What Power BI CAN replace:

| Current Source | Field | Power BI Replacement | Notes |
|----------------|-------|---------------------|-------|
| SA-Nummer.xlsx | VareNr → SA mapping | VareNr + SA number | Direct replacement |
| SA-Nummer.xlsx | SA agreement data | Partially (if included) | saType, gyldigFra/Til rarely used |
| Master.xlsx | Replacement mapping | Replacement mapping | Power BI has this |
| Master.xlsx | Status | Status | Power BI has this |
| — (new) | Customer assortment | Customer assortment | New capability |

### What Power BI CANNOT replace:

| Current Source | Field | Why |
|----------------|-------|-----|
| Master.xlsx | TotLagSaldo (stock) | Not mentioned in Power BI export |
| Master.xlsx | BestAntLev (incoming) | Not mentioned in Power BI export |
| Master.xlsx | Kalkylpris bas | Not mentioned in Power BI export |
| Master.xlsx | DispLagSaldo, ReservAnt | Not mentioned in Power BI export |
| Master.xlsx | Beställningsnummer | Not mentioned in Power BI export |
| Ordrer_Jeeves.xlsx | Full sales history | Not mentioned in Power BI export |

---

## 6. Files That Can Safely Be Removed

### 6.1 Analyse_Lagerplan.xlsx — SAFE TO REMOVE

**Risk:** NONE
**Reason:**
- Explicitly declared OPTIONAL in the architecture (FASE 6.1)
- Only provides BP and EOK, which are rarely populated
- Wrapped in try/catch — the pipeline continues without it
- No workMode breaks if `bestillingspunkt = null`
- The `bp` field is also populated from Master (backward compat path)

**Code impact:**
- `dataProcessor.js:122-136` — LAGERPLAN_COLUMN_VARIANTS can be removed
- `dataProcessor.js:223-245` — Step 4 loading block can be removed
- `dataProcessor.js:680-771` — `processLagerplanData()` can be removed
- `app.js:24` — `lagerplan: null` slot can be removed
- `unifiedItem.js:77-79` — `bestillingspunkt`, `ordrekvantitet` fields stay (may be populated differently later)

### 6.2 SA-Nummer.xlsx — CAN BE REPLACED (not removed)

**Risk:** MEDIUM — this is the pipeline gatekeeper
**Reason:**
- SA-Nummer.xlsx's critical function (VareNr → SA mapping) is available in the Power BI export
- Only 2 of 25 columns are actually used
- The replacement is structural: Power BI becomes the new "universe creator"

**What must stay identical:**
- The concept of `saNumber` as primary key
- The `toolsLookup` reverse map (toolsArtNr → saNumber)
- The `createFromSA()` method signature

**What changes:**
- `processSAData()` reads from Power BI export instead of SA-Nummer.xlsx
- Column variants in `SA_COLUMN_VARIANTS` updated to match Power BI column names
- Optionally: replacement mapping + status can also be read from Power BI (reducing Master dependency)

---

## 7. What Needs to Change for Power BI Integration

### 7.1 Minimal refactor (replaces SA-Nummer.xlsx only)

| # | Change | File | Effort |
|---|--------|------|--------|
| 1 | Add Power BI column variants to `DataProcessor` | `dataProcessor.js` | Small |
| 2 | Update `processSAData()` to accept Power BI format | `dataProcessor.js` | Small |
| 3 | Update file slot from `sa` to `powerbi` (or keep `sa`) | `app.js` | Trivial |
| 4 | Update UI labels (drop zone, status messages) | `app.js` / `index.html` | Trivial |
| 5 | Remove `lagerplan` file slot and processing | `app.js`, `dataProcessor.js` | Small |

### 7.2 Extended refactor (new operational module)

For the 4 target use cases:

| Use Case | Current Support | What's Needed |
|----------|----------------|---------------|
| 1. Discontinued items with replacements | YES — `alternatives.js` workMode exists | Power BI can provide replacement mapping directly |
| 2. SA-number migration (old → new) | PARTIAL — `ersattAvArtikel` / `ersatterArtikel` exist | Need to read old→new mapping from Power BI |
| 3. Sales per quarter and department | NO — not implemented | New aggregation in `dataProcessor.js` or new workMode |
| 4. Incoming purchase quantities | YES — `bestAntLev` from Master, displayed in planning.js | Already working from Master.xlsx |

### 7.3 Missing: Sales per quarter and department

This is the only entirely new feature. Currently:
- Sales are aggregated as `sales6m` and `sales12m` (rolling windows, not quarters)
- Department data exists only in `contacts.js` (unrelated to sales)
- `slowMovers.js` has a department concept but for cross-warehouse transfer, not sales analysis

**Implementation would require:**
- Grouping `outgoingOrders` by calendar quarter (from `deliveryDate`)
- Grouping by department/delivery location (from `deliveryLocation` in Ordrer_Jeeves.xlsx)
- New fields on `UnifiedItem` or a separate aggregation structure
- A new workMode or extension of `demand.js`

---

## 8. Proposed Minimal Structural Refactor Plan

### Phase 2A — Replace SA-Nummer.xlsx with Power BI export

1. Add `POWERBI_COLUMN_VARIANTS` to `DataProcessor` with mappings for `VareNr`, `SA number`, `Replacement`, `Status`, `Customer assortment`
2. Modify `processSAData()` to detect whether input is SA-Nummer format or Power BI format (by checking column names)
3. If Power BI format: also read replacement mapping and status during item creation (reducing Master enrichment overhead)
4. Update file slot and UI labels

### Phase 2B — Remove Analyse_Lagerplan.xlsx

1. Remove `LAGERPLAN_COLUMN_VARIANTS`, `processLagerplanData()`, and the Step 4 loading block
2. Remove `files.lagerplan` slot
3. Keep `bestillingspunkt` and `ordrekvantitet` fields on UnifiedItem (can be populated from future sources)
4. Update UI to remove Lagerplan upload slot

### Phase 2C — New operational module

1. Add quarterly sales aggregation to `UnifiedItem` or `DataProcessor`
2. Add department/location-based sales grouping
3. Create new workMode or extend `demand.js` for the 4 target use cases

### Dependency order: 2A → 2B → 2C (2B can run in parallel with 2A)

---

## 9. Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Power BI column names don't match variants | Medium | High | Add comprehensive variants; validate on first load |
| Power BI missing SA-type/validity dates | Low | Low | Fields are rarely used; graceful degradation exists |
| Breaking `toolsLookup` reverse map | Low | Critical | Keep `createFromSA()` signature unchanged |
| Losing Lagerplan BP/EOK data | Low | Low | BP is also set from Master (backward compat); EOK rarely populated |
| Quarter aggregation performance | Low | Low | Data volume is manageable (~5k items, ~14k order lines) |

---

*This report is Phase 1 analysis only. No files have been modified or deleted.*
