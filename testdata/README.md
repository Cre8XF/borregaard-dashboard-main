# 🧪 Test Data for Borregaard Dashboard

## Purpose
These files contain realistic test data for testing all dashboard modules before real data from Borregaard is available.

## Files

### Warehouse Inventory (3 files)
- **Hovedlager.csv** - Main warehouse (20 products)
- **Borregaard_Bygg.csv** - Construction warehouse (15 products)
- **Borregaard_Drift.csv** - Operations warehouse (15 products)

**Test scenarios included:**
- Products below reorder point (critical)
- Products near reorder point (warning)
- Products with good stock levels (OK)

### Sales History
- **Salgshistorikk_2024.csv** - 23 sales transactions
  - Includes Week 14-16 data (spring maintenance)
  - Includes Week 40-42 data (fall maintenance)
  - Recent sales (Dec 2024 - Jan 2025)

### Customer Assortment
- **Kundesortiment.csv** - 25 products
  - Active products
  - Phased-out products with replacements
  - Catalog classification (A / Outside)

### Product Catalog
- **Produktkatalog_Jeeves.csv** - 20 products
  - Complete product data from Jeeves system
  - Prices, suppliers, lead times

### Open Orders
- **Aapne_ordre.csv** - 10 orders
  - Various statuses (Confirmed, Delayed, In Progress)
  - From both Jeeves and SAP systems
  - Includes critical delayed order

## How to Test

### Test 1: Import Wizard
1. Go to dashboard
2. Upload all 3 warehouse files simultaneously
3. Import wizard should open
4. System suggests "📦 Lagerrisiko" for all
5. Confirm and import
6. Verify: "3 fil(er) lastet inn"

### Test 2: Inventory Risk Module
Upload warehouse files and verify critical items appear:
- Hovedlager: 5 critical items (below reorder point)
- Borregaard Bygg: 3 critical items
- Borregaard Drift: 2 critical items

### Test 3: Maintenance Planning (Week 16/42)
Upload Salgshistorikk_2024.csv to "Vedlikeholdsstopp" module.
Should show critical items sold during maintenance weeks.

### Test 4: Customer Assortment
Upload Kundesortiment.csv to see:
- 22 active products
- 3 phased-out products with replacements

### Test 5: Multi-File Upload
Upload ALL 7 files at once and verify import wizard handles them correctly.

## Data Characteristics

### Realistic Details
- Norwegian product names and suppliers
- Real supplier brands (Würth, SKF, Bosch, Hilti, etc.)
- Realistic prices (2.50 kr - 1200 kr)
- Correct product codes (DIN standards, ISO standards)
- Varied lead times (3-28 days)

### Test Scenarios Built-In
- Products below reorder point (critical scenario)
- Products just above reorder point (warning scenario)
- Phased-out products with replacements (lifecycle scenario)
- Delayed orders (operations scenario)
- Maintenance shutdown data (week 16 and 42)

## Expected Results

### After Importing Warehouse Files:
```
Hovedlager: 20 products, 5 critical
Borregaard Bygg: 15 products, 3 critical
Borregaard Drift: 15 products, 2 critical
```

### After Importing Sales History:
```
Critical items for maintenance:
- Skruer M8x40: Week 16 (120) + Week 42 (110)
- Sveisekabel: Week 16 (45) + Week 42 (55)
- Motorolje: Week 16 (80) + Week 42 (90)
```

## Troubleshooting

If import fails:
1. Check file encoding (should be UTF-8)
2. Check for special characters (æ, ø, å)
3. Verify CSV format (comma-separated)
4. Check browser console (F12) for errors

## Creating Excel Versions

To create Excel versions:
1. Open CSV in Excel
2. Save As → Excel Workbook (.xlsx)
3. Test import (should work identically)

For multi-sheet Excel:
Create file "Lagerstatus_alle.xlsx" with 3 sheets:
- Sheet 1: Hovedlager
- Sheet 2: Borregaard Bygg
- Sheet 3: Borregaard Drift

Dashboard should detect and import all sheets automatically.

## Next Steps

After testing with this data:
1. Verify all modules work correctly
2. Test data management (clear, export)
3. Wait for real data from Borregaard
4. Test with actual data
5. Refine based on real-world usage
