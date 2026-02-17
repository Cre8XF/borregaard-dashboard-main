// ===================================
// MODUS 8: RAPPORTER – KVARTALSRAPPORT + ARBEIDSRAPPORT
// Multi-customer quarterly Excel export + internal operational report
// ===================================

class ReportsMode {
    static dataStore = null;
    static selectedDepartments = new Set();
    static lastReport = null;
    static currentReportData = null;
    static generating = false;
    static selectedQuarter = 'rolling'; // 'rolling' | 'YYYY-QX' e.g. '2025-Q3'
    static categoryMap = null; // Map<toolsArticleNumber, {category1, category2, supplier, deliveredValue, deliveredQuantity, inventoryValue}>

    /**
     * Render the reports view
     * @param {UnifiedDataStore} store
     * @returns {string} HTML
     */
    static render(store) {
        this.dataStore = store;

        const departments = this.collectDepartments(store);
        const availableQuarters = this.collectAvailableQuarters(store);

        // Reset selection if stored value is no longer valid
        if (this.selectedQuarter !== 'rolling' && !availableQuarters.some(q => q.key === this.selectedQuarter)) {
            this.selectedQuarter = 'rolling';
        }

        return `
            <div class="module-header">
                <h2>Rapporter</h2>
                <p class="module-description">Velg avdelinger, generer forhåndsvisning, og eksporter til Excel.</p>
            </div>

            <div style="background:#f8f9fa;border:1px solid #dee2e6;border-radius:6px;padding:16px;margin-bottom:16px;">
                <h3 style="margin:0 0 12px 0;font-size:15px;">Velg kunder / avdelinger</h3>
                ${departments.length === 0
                    ? '<p style="color:#999;">Ingen avdelingsdata funnet. Ordrer_Jeeves må inneholde LevPlFtgKod.</p>'
                    : `
                        <div style="margin-bottom:8px;">
                            <label style="cursor:pointer;margin-right:12px;font-size:13px;">
                                <input type="checkbox" onchange="ReportsMode.handleSelectAll(this.checked)"> Velg alle
                            </label>
                        </div>
                        <div style="display:flex;flex-wrap:wrap;gap:6px 16px;max-height:200px;overflow-y:auto;padding:4px;">
                            ${departments.map(d => `
                                <label style="cursor:pointer;font-size:13px;white-space:nowrap;">
                                    <input type="checkbox" value="${this.escapeHtml(d.key)}"
                                           ${this.selectedDepartments.has(d.key) ? 'checked' : ''}
                                           onchange="ReportsMode.handleDeptToggle('${this.escapeHtml(d.key)}', this.checked)">
                                    ${this.escapeHtml(d.key)} <span style="color:#888;">(${d.itemCount} artikler)</span>
                                </label>
                            `).join('')}
                        </div>
                    `}
                <div style="margin-top:12px;display:flex;align-items:center;gap:12px;flex-wrap:wrap;">
                    <div style="display:flex;align-items:center;gap:6px;">
                        <label style="font-size:13px;font-weight:600;">Periode:</label>
                        <select class="filter-select" onchange="ReportsMode.handleQuarterChange(this.value)" style="font-size:13px;">
                            <option value="rolling" ${this.selectedQuarter === 'rolling' ? 'selected' : ''}>Rullerende 12 mnd</option>
                            ${availableQuarters.map(q => `
                                <option value="${this.escapeHtml(q.key)}" ${this.selectedQuarter === q.key ? 'selected' : ''}>${this.escapeHtml(q.label)}</option>
                            `).join('')}
                        </select>
                    </div>
                    <button onclick="ReportsMode.generateReport()"
                            class="btn-export"
                            ${departments.length === 0 ? 'disabled' : ''}
                            style="font-size:14px;padding:8px 20px;">
                        📊 Generer kvartalsrapport
                    </button>
                    <button onclick="ReportsMode.generateArbeidsrapport()"
                            class="btn-export"
                            ${departments.length === 0 ? 'disabled' : ''}
                            style="font-size:14px;padding:8px 20px;">
                        📋 Generer arbeidsrapport
                    </button>
                    ${this.currentReportData ? `
                    <button onclick="ReportsMode.exportQuarterlyExcel()"
                            class="btn-export"
                            style="font-size:14px;padding:8px 20px;background:#1565c0;color:#fff;">
                        📥 Eksporter kvartalsrapport til Excel
                    </button>
                    ` : ''}
                    <span id="reportStatus" style="margin-left:4px;font-size:13px;color:#666;"></span>
                </div>
            </div>

            ${this.currentReportData ? this.renderReportPreview(this.currentReportData) : ''}
        `;
    }

    // ════════════════════════════════════════════════════
    //  DATA COLLECTION
    // ════════════════════════════════════════════════════

    /**
     * Collect unique department keys from outgoing orders across all items
     */
    static collectDepartments(store) {
        const deptMap = {};
        const items = store.getAllItems();

        items.forEach(item => {
            if (!item.outgoingOrders || item.outgoingOrders.length === 0) return;
            item.outgoingOrders.forEach(order => {
                const key = (order.deliveryLocation || '').toString().trim();
                if (!key) return;
                if (!deptMap[key]) deptMap[key] = { key, itemCount: 0, itemSet: new Set() };
                if (!deptMap[key].itemSet.has(item.toolsArticleNumber)) {
                    deptMap[key].itemSet.add(item.toolsArticleNumber);
                    deptMap[key].itemCount++;
                }
            });
        });

        return Object.values(deptMap)
            .map(d => ({ key: d.key, itemCount: d.itemCount }))
            .sort((a, b) => a.key.localeCompare(b.key, 'nb-NO'));
    }

    /**
     * Build fast lookup map from Kategori.xlsx data stored in window.app.categoryData.
     * Safe to call even if categoryData is missing.
     */
    static buildCategoryMap() {
        this.categoryMap = null;
        const data = window.app && window.app.categoryData;
        if (!data || !Array.isArray(data) || data.length === 0) return;

        const map = new Map();
        data.forEach(row => {
            const key = (row.toolsArticleNumber || '').toString().trim();
            if (key) map.set(key, row);
        });
        this.categoryMap = map;
    }

    /**
     * Scan all order dates and return available quarters (with data), newest first.
     * Each entry: { key: '2025-Q3', label: 'Q3 2025', year: 2025, qNum: 3 }
     */
    static collectAvailableQuarters(store) {
        const quarterSet = new Set();
        const items = store.getAllItems();

        items.forEach(item => {
            if (!item.outgoingOrders || item.outgoingOrders.length === 0) return;
            item.outgoingOrders.forEach(order => {
                const qty = order.quantity || 0;
                if (qty <= 0) return;
                const d = order.deliveryDate instanceof Date ? order.deliveryDate :
                          order.deliveryDate ? new Date(order.deliveryDate) : null;
                if (!d || isNaN(d.getTime())) return;
                const year = d.getFullYear();
                const q = Math.floor(d.getMonth() / 3) + 1;
                quarterSet.add(`${year}-Q${q}`);
            });
        });

        return Array.from(quarterSet)
            .map(key => {
                const m = key.match(/^(\d{4})-Q(\d)$/);
                return { key, label: `Q${m[2]} ${m[1]}`, year: parseInt(m[1]), qNum: parseInt(m[2]) };
            })
            .sort((a, b) => b.year - a.year || b.qNum - a.qNum);
    }

    /**
     * Format a year-qualified quarter key ('2025-Q3') to display label ('Q3 2025')
     */
    static formatQuarterLabel(key) {
        const m = (key || '').match(/^(\d{4})-Q(\d)$/);
        if (!m) return key || '';
        return `Q${m[2]} ${m[1]}`;
    }

    /**
     * Calculate sales data for an item (reuses same logic as SAMigrationMode)
     */
    static calculateSales(item) {
        const now = new Date();
        const threeMonthsAgo = new Date();
        threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
        const oneYearAgo = new Date();
        oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);

        let salesLast12m = 0;
        let salesLast3m = 0;
        let orderCount12m = 0;
        const quarterlySales = {}; // keyed by 'YYYY-QX'
        const quarterlyOrders = {}; // keyed by 'YYYY-QX'
        const deptMap = {};

        if (!item.outgoingOrders || item.outgoingOrders.length === 0) {
            return {
                salesLast12m: item.sales12m || 0,
                salesLast3m: item.sales6m ? Math.round(item.sales6m / 2) : 0,
                orderCount12m: item.orderCount || 0,
                quarterlySales,
                quarterlyOrders,
                salesByDepartment: {}
            };
        }

        item.outgoingOrders.forEach(order => {
            const qty = order.quantity || 0;
            if (qty <= 0) return;

            const orderDate = order.deliveryDate instanceof Date ? order.deliveryDate :
                              order.deliveryDate ? new Date(order.deliveryDate) : null;
            const deptKey = (order.deliveryLocation || '').toString().trim();

            if (!orderDate || isNaN(orderDate.getTime())) {
                salesLast12m += qty;
                orderCount12m++;
                if (deptKey) {
                    if (!deptMap[deptKey]) deptMap[deptKey] = { sales12m: 0, sales3m: 0 };
                    deptMap[deptKey].sales12m += qty;
                }
                return;
            }

            if (orderDate >= oneYearAgo) {
                salesLast12m += qty;
                orderCount12m++;
                if (deptKey) {
                    if (!deptMap[deptKey]) deptMap[deptKey] = { sales12m: 0, sales3m: 0 };
                    deptMap[deptKey].sales12m += qty;
                }
            }

            if (orderDate >= threeMonthsAgo) {
                salesLast3m += qty;
                if (deptKey) {
                    if (!deptMap[deptKey]) deptMap[deptKey] = { sales12m: 0, sales3m: 0 };
                    deptMap[deptKey].sales3m += qty;
                }
            }

            const qKey = `${orderDate.getFullYear()}-Q${Math.floor(orderDate.getMonth() / 3) + 1}`;
            quarterlySales[qKey] = (quarterlySales[qKey] || 0) + qty;
            quarterlyOrders[qKey] = (quarterlyOrders[qKey] || 0) + 1;
        });

        // Round quarterly sales values
        const roundedQS = {};
        for (const k in quarterlySales) roundedQS[k] = Math.round(quarterlySales[k]);

        return {
            salesLast12m: Math.round(salesLast12m),
            salesLast3m: Math.round(salesLast3m),
            orderCount12m,
            quarterlySales: roundedQS,
            quarterlyOrders,
            salesByDepartment: deptMap
        };
    }

    /**
     * Check if item is discontinued
     */
    static isDiscontinued(item) {
        if (item._status === 'UTGAENDE' || item._status === 'UTGAATT') return true;
        if (item.isDiscontinued) return true;
        const raw = (item.status || '').toString().toLowerCase();
        if (raw.includes('utgå') || raw.includes('discontinued') || raw.includes('avvikle')) return true;
        if (raw === '3' || raw === '4' || raw.startsWith('3 -') || raw.startsWith('4 -')) return true;
        return false;
    }

    // ════════════════════════════════════════════════════
    //  REPORT GENERATION
    // ════════════════════════════════════════════════════

    static generateReport() {
        if (this.selectedDepartments.size === 0) {
            const statusEl = document.getElementById('reportStatus');
            if (statusEl) statusEl.textContent = 'Velg minst én avdeling.';
            return;
        }

        const statusEl = document.getElementById('reportStatus');
        if (statusEl) statusEl.textContent = 'Genererer rapport...';

        const store = this.dataStore;
        const items = store.getAllItems();
        const selectedDepts = this.selectedDepartments;

        // Build category lookup (safe if Kategori.xlsx not loaded)
        this.buildCategoryMap();

        // Build enriched rows for all items that have sales in selected departments
        const rows = [];
        items.forEach(item => {
            const salesData = this.calculateSales(item);
            const deptSales = salesData.salesByDepartment;

            // Check if this item has sales in any selected department
            const hasSelectedDeptSales = Object.keys(deptSales).some(k => selectedDepts.has(k));
            if (!hasSelectedDeptSales) return;

            // Sum sales only within selected departments
            let deptSales12m = 0;
            let deptSales3m = 0;
            for (const k of selectedDepts) {
                if (deptSales[k]) {
                    deptSales12m += deptSales[k].sales12m || 0;
                    deptSales3m += deptSales[k].sales3m || 0;
                }
            }

            const discontinued = this.isDiscontinued(item);
            const exposure = (item.stock || 0) + (item.bestAntLev || 0);
            const replacementNr = (item.ersattAvArtikel || '').trim();
            const saMigrationRequired = discontinued && replacementNr &&
                replacementNr !== item.toolsArticleNumber &&
                item.saNumber && !this.getReplacementSa(store, replacementNr);

            // Enrich with Kategori.xlsx data if available
            const catData = this.categoryMap ? this.categoryMap.get(item.toolsArticleNumber) : null;

            rows.push({
                toolsNr: item.toolsArticleNumber,
                saNumber: item.saNumber || '',
                description: item.description || '',
                category: item.category || '',
                supplier: item.supplier || '',
                catCategory1: catData ? catData.category1 : (item.category || ''),
                catSupplier: catData ? catData.supplier : (item.supplier || ''),
                stock: item.stock || 0,
                bestAntLev: item.bestAntLev || 0,
                exposure,
                estimertVerdi: item.estimertVerdi || 0,
                kalkylPris: item.kalkylPris || 0,
                salesLast12m: salesData.salesLast12m,
                salesLast3m: salesData.salesLast3m,
                orderCount12m: salesData.orderCount12m || 0,
                deptSales12m: Math.round(deptSales12m),
                deptSales3m: Math.round(deptSales3m),
                quarterlySales: salesData.quarterlySales,
                quarterlyOrders: salesData.quarterlyOrders || {},
                salesByDepartment: deptSales,
                currentQuarterSales: 0, // set below
                quantityLast12m: salesData.orderCount12m || 0,
                discontinued,
                status: item._status || 'UKJENT',
                replacementNr: replacementNr || '',
                saMigrationRequired: !!saMigrationRequired,
                _item: item
            });
        });

        // Quarter selection (year-qualified keys: '2025-Q3')
        const now = new Date();
        const currentQ = `${now.getFullYear()}-Q${Math.floor(now.getMonth() / 3) + 1}`;
        const qSel = this.selectedQuarter; // 'rolling' | 'YYYY-QX'
        const isQuarterFilter = qSel !== 'rolling';
        const periodLabel = isQuarterFilter
            ? this.formatQuarterLabel(qSel)
            : 'Rullerende 12 måneder';

        // Set currentQuarterSales on each row
        rows.forEach(r => { r.currentQuarterSales = r.quarterlySales[currentQ] || 0; });

        // Derive period-specific sales metric for sorting
        // For rolling: salesLast12m. For specific quarter: quarterlySales[QX].
        const getSalesMetric = isQuarterFilter
            ? (r) => r.quarterlySales[qSel] || 0
            : (r) => r.salesLast12m;
        const getQuantityMetric = isQuarterFilter
            ? (r) => r.quarterlyOrders[qSel] || 0
            : (r) => r.quantityLast12m;

        // A) Summary
        const summary = {
            totalSales12m: rows.reduce((s, r) => s + getSalesMetric(r), 0),
            totalSales3m: isQuarterFilter ? 0 : rows.reduce((s, r) => s + r.salesLast3m, 0),
            currentQuarterSales: rows.reduce((s, r) => s + r.currentQuarterSales, 0),
            currentQuarter: currentQ,
            activeCount: rows.filter(r => !r.discontinued).length,
            discontinuedCount: rows.filter(r => r.discontinued).length,
            saMigrationCount: rows.filter(r => r.saMigrationRequired).length,
            totalExposure: rows.reduce((s, r) => s + r.exposure, 0),
            totalEstimertVerdi: rows.reduce((s, r) => s + r.estimertVerdi, 0),
            totalItems: rows.length,
            selectedDepartments: Array.from(selectedDepts).sort().join(', '),
            periodLabel,
            isQuarterFilter,
            selectedQuarter: qSel
        };

        // B) Top 20 by value (estimertVerdi for rolling, quarterlySales value for quarter)
        const top20Value = [...rows].sort((a, b) => getSalesMetric(b) - getSalesMetric(a)).slice(0, 20);

        // C) Top 20 by order count (quantityLast12m for rolling, quarterlyOrders for quarter)
        const top20Quantity = [...rows].sort((a, b) => getQuantityMetric(b) - getQuantityMetric(a)).slice(0, 20);

        // D) Risk list: discontinued + (exposure > 0 OR SA-migration required)
        const riskList = rows
            .filter(r => r.discontinued && (r.exposure > 0 || r.saMigrationRequired))
            .sort((a, b) => b.exposure - a.exposure);

        // E) Department summary
        const deptSummary = {};
        for (const dept of selectedDepts) {
            deptSummary[dept] = { sales12m: 0, sales3m: 0, itemCount: 0 };
        }
        rows.forEach(r => {
            for (const dept of selectedDepts) {
                if (r.salesByDepartment[dept]) {
                    deptSummary[dept].sales12m += r.salesByDepartment[dept].sales12m || 0;
                    deptSummary[dept].sales3m += r.salesByDepartment[dept].sales3m || 0;
                    deptSummary[dept].itemCount++;
                }
            }
        });

        // F) Category summary (Kategori 1) — only if categoryData loaded
        let categorySummary = null;
        if (this.categoryMap) {
            const catMap = {};
            rows.forEach(r => {
                const cat = r.catCategory1 || 'Ukjent';
                if (!catMap[cat]) catMap[cat] = { sales: 0, count: 0 };
                catMap[cat].sales += getSalesMetric(r);
                if (!r.discontinued) catMap[cat].count++;
            });
            const totalCatSales = Object.values(catMap).reduce((s, c) => s + c.sales, 0);
            categorySummary = Object.entries(catMap)
                .map(([name, data]) => ({
                    name,
                    sales: Math.round(data.sales),
                    count: data.count,
                    percentage: totalCatSales > 0 ? Math.round(data.sales / totalCatSales * 1000) / 10 : 0
                }))
                .sort((a, b) => b.sales - a.sales)
                .slice(0, 10);
        }

        // G) Supplier summary (Top 5) — only if categoryData loaded
        let supplierSummary = null;
        if (this.categoryMap) {
            const supMap = {};
            rows.forEach(r => {
                const sup = r.catSupplier || 'Ukjent';
                if (!supMap[sup]) supMap[sup] = 0;
                supMap[sup] += getSalesMetric(r);
            });
            const totalSupSales = Object.values(supMap).reduce((s, v) => s + v, 0);
            supplierSummary = Object.entries(supMap)
                .map(([name, sales]) => ({
                    name,
                    sales: Math.round(sales),
                    percentage: totalSupSales > 0 ? Math.round(sales / totalSupSales * 1000) / 10 : 0
                }))
                .sort((a, b) => b.sales - a.sales)
                .slice(0, 5);
        }

        const report = { summary, top20Value, top20Quantity, riskList, deptSummary, categorySummary, supplierSummary, rows };
        this.currentReportData = report;
        this.lastReport = report;

        if (statusEl) statusEl.textContent = `Rapport generert med ${rows.length} artikler. Klikk "Eksporter" for Excel.`;

        // Re-render to show preview (no auto-download)
        this.refreshAll();
    }

    /**
     * Quick lookup for replacement SA number
     */
    static getReplacementSa(store, replacementToolsNr) {
        const saItem = store.getByToolsArticleNumber(replacementToolsNr);
        if (saItem && saItem.saNumber) return saItem.saNumber;
        return null;
    }

    // ════════════════════════════════════════════════════
    //  ARBEIDSRAPPORT (intern operativ rapport)
    // ════════════════════════════════════════════════════

    /**
     * Resolve replacement article data from store
     */
    static resolveReplacement(store, replacementToolsNr) {
        const saItem = store.getByToolsArticleNumber(replacementToolsNr);
        if (saItem) {
            const replSales = this.calculateSales(saItem);
            return {
                stock: saItem.stock || 0,
                saNumber: saItem.saNumber || '',
                salesLast12m: replSales.salesLast12m
            };
        }
        const masterData = store.masterOnlyArticles.get(replacementToolsNr);
        if (masterData) {
            return {
                stock: masterData.stock || 0,
                saNumber: '',
                salesLast12m: 0
            };
        }
        return { stock: 0, saNumber: '', salesLast12m: 0 };
    }

    /**
     * Calculate urgency level (same logic as SAMigrationMode)
     */
    static calculateUrgency(item, salesData) {
        if ((item.stock || 0) > 0 || salesData.salesLast3m > 0) return 'HIGH';
        if (salesData.salesLast12m > 0) return 'MEDIUM';
        return 'LOW';
    }

    /**
     * Derive recommended action text (same logic as SAMigrationMode)
     */
    static getRecommendation(row) {
        if (!row.saMigrationRequired) return 'Ingen handling';
        if (row.exposure > 0 && row.salesLast3m > 0) return 'Flytt SA nå (selger + lager)';
        if (row.exposure > 0) return 'Flytt SA – tøm lager';
        if (row.salesLast3m > 0) return 'Flytt SA (aktiv vare)';
        return 'Flytt SA (lav prioritet)';
    }

    /**
     * Generate Arbeidsrapport – internal operational report
     */
    static generateArbeidsrapport() {
        if (this.selectedDepartments.size === 0) {
            const statusEl = document.getElementById('reportStatus');
            if (statusEl) statusEl.textContent = 'Velg minst én avdeling.';
            return;
        }

        const statusEl = document.getElementById('reportStatus');
        if (statusEl) statusEl.textContent = 'Genererer arbeidsrapport...';

        const store = this.dataStore;
        const items = store.getAllItems();
        const selectedDepts = this.selectedDepartments;
        const arbNow = new Date();
        const currentQ = `${arbNow.getFullYear()}-Q${Math.floor(arbNow.getMonth() / 3) + 1}`;

        const rows = [];
        items.forEach(item => {
            const salesData = this.calculateSales(item);
            const deptSales = salesData.salesByDepartment;

            // Only include items with sales in selected departments
            const hasSelectedDeptSales = Object.keys(deptSales).some(k => selectedDepts.has(k));
            if (!hasSelectedDeptSales) return;

            const discontinued = this.isDiscontinued(item);
            const exposure = (item.stock || 0) + (item.bestAntLev || 0);
            const replacementNr = (item.ersattAvArtikel || '').trim();
            const statusLabel = discontinued ? 'Utgående' : 'Aktiv';

            // Resolve replacement if exists
            let replacementStock = 0;
            let replacementSales12m = 0;
            let saMigrationRequired = false;

            if (replacementNr && replacementNr !== item.toolsArticleNumber) {
                const repl = this.resolveReplacement(store, replacementNr);
                replacementStock = repl.stock;
                replacementSales12m = repl.salesLast12m;
                saMigrationRequired = discontinued && !!item.saNumber && !repl.saNumber;
            }

            const urgencyLevel = this.calculateUrgency(item, salesData);
            // urgencySort: HIGH=3, MEDIUM=2, LOW=1
            const urgencySort = urgencyLevel === 'HIGH' ? 3 : urgencyLevel === 'MEDIUM' ? 2 : 1;

            const row = {
                toolsNr: item.toolsArticleNumber,
                saNumber: item.saNumber || '',
                description: item.description || '',
                category: item.category || '',
                supplier: item.supplier || '',
                statusLabel,
                stock: item.stock || 0,
                bestAntLev: item.bestAntLev || 0,
                exposure,
                salesLast12m: salesData.salesLast12m,
                salesLast3m: salesData.salesLast3m,
                currentQuarterSales: salesData.quarterlySales[currentQ] || 0,
                replacementNr: replacementNr || '',
                replacementStock,
                replacementSales12m,
                saMigrationRequired,
                urgencyLevel,
                urgencySort
            };
            row.recommendation = this.getRecommendation(row);

            rows.push(row);
        });

        // Default sort: urgency DESC, exposure DESC, salesLast3m DESC
        rows.sort((a, b) =>
            b.urgencySort - a.urgencySort ||
            b.exposure - a.exposure ||
            b.salesLast3m - a.salesLast3m
        );

        this.exportArbeidsrapport(rows);

        if (statusEl) statusEl.textContent = `Arbeidsrapport generert med ${rows.length} artikler.`;
    }

    /**
     * Export Arbeidsrapport to Excel (single sheet)
     */
    static exportArbeidsrapport(rows) {
        if (typeof XLSX === 'undefined') {
            alert('XLSX-biblioteket er ikke lastet. Kan ikke eksportere.');
            return;
        }

        const headers = [
            'Tools nr', 'SA-nummer', 'Beskrivelse', 'Varegruppe', 'Leverandør',
            'Status', 'Lager', 'Innkommende', 'Eksponering (lager + innkjøp)',
            'Salg 12m', 'Salg 3m', 'Salg inneværende kvartal',
            'Erstatter artikkel', 'Erst. lager', 'Erst. salg 12m',
            'SA-migrering påkrevd', 'Hastegrad', 'Anbefalt handling'
        ];

        const data = [headers];
        rows.forEach(r => {
            data.push([
                r.toolsNr,
                r.saNumber,
                r.description,
                r.category,
                r.supplier,
                r.statusLabel,
                r.stock,
                r.bestAntLev,
                r.exposure,
                r.salesLast12m,
                r.salesLast3m,
                r.currentQuarterSales,
                r.replacementNr,
                r.replacementStock,
                r.replacementSales12m,
                r.saMigrationRequired ? 'Ja' : 'Nei',
                r.urgencyLevel,
                r.recommendation
            ]);
        });

        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.aoa_to_sheet(data);
        ws['!cols'] = [
            { wch: 16 }, { wch: 14 }, { wch: 40 }, { wch: 16 }, { wch: 20 },
            { wch: 10 }, { wch: 10 }, { wch: 12 }, { wch: 22 },
            { wch: 10 }, { wch: 10 }, { wch: 20 },
            { wch: 16 }, { wch: 10 }, { wch: 14 },
            { wch: 18 }, { wch: 10 }, { wch: 28 }
        ];
        XLSX.utils.book_append_sheet(wb, ws, 'Arbeidsrapport');

        const now = new Date();
        const year = now.getFullYear();
        const quarter = 'Q' + (Math.floor(now.getMonth() / 3) + 1);
        XLSX.writeFile(wb, `Arbeidsrapport_${year}_${quarter}.xlsx`);
    }

    // ════════════════════════════════════════════════════
    //  EXCEL EXPORT – KVARTALSRAPPORT (SheetJS / XLSX)
    // ════════════════════════════════════════════════════

    /**
     * Export quarterly report to Excel (triggered by export button, not auto)
     */
    static exportQuarterlyExcel() {
        if (!this.currentReportData) return;
        if (typeof XLSX === 'undefined') {
            alert('XLSX-biblioteket er ikke lastet. Kan ikke eksportere.');
            return;
        }

        const report = this.currentReportData;
        const s = report.summary;
        const isQ = s.isQuarterFilter;
        const qSel = s.selectedQuarter;
        const periodLabel = s.periodLabel || 'Rullerende 12 måneder';
        const qLabel = this.formatQuarterLabel(qSel);
        const salesColLabel = isQ ? `Salg ${qLabel}` : 'Salg 12m';
        const qtyColLabel = isQ ? `Ordrer ${qLabel}` : 'Ordrer 12m';
        const getSalesVal = isQ ? (r) => r.quarterlySales[qSel] || 0 : (r) => r.salesLast12m;
        const getQtyVal = isQ ? (r) => r.quarterlyOrders[qSel] || 0 : (r) => r.quantityLast12m;

        const wb = XLSX.utils.book_new();

        // Sheet 1: Sammendrag
        const summaryData = [
            ['Kvartalsrapport'],
            ['Periode', periodLabel],
            ['Generert', new Date().toISOString().split('T')[0]],
            ['Avdelinger', s.selectedDepartments],
            [],
            ['Nøkkeltall', 'Verdi'],
            ['Aktive artikler (stk)', s.activeCount],
            [salesColLabel + ' (kr)', Math.round(s.totalSales12m)],
            ...(!isQ ? [['Salg 3m (kr)', Math.round(s.totalSales3m)]] : []),
            ['Utgående artikler (stk)', s.discontinuedCount],
            ['SA-migrering påkrevd (stk)', s.saMigrationCount],
            ['Total eksponering (kr)', Math.round(s.totalExposure)]
        ];
        const ws1 = XLSX.utils.aoa_to_sheet(summaryData);
        ws1['!cols'] = [{ wch: 30 }, { wch: 25 }];
        XLSX.utils.book_append_sheet(wb, ws1, 'Sammendrag');

        // Sheet 2: Topp20_Verdi
        const valueHeaders = ['#', 'Tools nr', 'SA-nummer', 'Beskrivelse', 'Varegruppe', 'Leverandør', salesColLabel + ' (kr)', 'Salg 3m (kr)', 'Salg innev. kvartal (kr)'];
        const top20vData = [valueHeaders];
        report.top20Value.forEach((r, i) => {
            top20vData.push([i + 1, r.toolsNr, r.saNumber, r.description, r.category, r.supplier, getSalesVal(r), r.salesLast3m, r.currentQuarterSales]);
        });
        const ws2 = XLSX.utils.aoa_to_sheet(top20vData);
        ws2['!cols'] = [{ wch: 4 }, { wch: 16 }, { wch: 14 }, { wch: 40 }, { wch: 16 }, { wch: 20 }, { wch: 12 }, { wch: 10 }, { wch: 18 }];
        XLSX.utils.book_append_sheet(wb, ws2, 'Topp20_Verdi');

        // Sheet 3: Topp20_Antall (order count as primary metric)
        const qtyHeaders = ['#', 'Tools nr', 'SA-nummer', 'Beskrivelse', 'Varegruppe', 'Leverandør', qtyColLabel + ' (stk)', 'Salg 12m (kr)', 'Salg 3m (kr)'];
        const top20qData = [qtyHeaders];
        report.top20Quantity.forEach((r, i) => {
            top20qData.push([i + 1, r.toolsNr, r.saNumber, r.description, r.category, r.supplier, getQtyVal(r), r.salesLast12m, r.salesLast3m]);
        });
        const ws3 = XLSX.utils.aoa_to_sheet(top20qData);
        ws3['!cols'] = [{ wch: 4 }, { wch: 16 }, { wch: 14 }, { wch: 40 }, { wch: 16 }, { wch: 20 }, { wch: 12 }, { wch: 10 }, { wch: 10 }];
        XLSX.utils.book_append_sheet(wb, ws3, 'Topp20_Antall');

        // Sheet 4: Risiko
        const riskHeaders = ['Tools nr', 'Beskrivelse', 'Lager (stk)', 'Eksponering (kr)', 'Salg 3m (kr)', 'SA-migrering påkrevd'];
        const riskData = [riskHeaders];
        report.riskList.forEach(r => {
            riskData.push([r.toolsNr, r.description, r.stock, r.exposure, r.salesLast3m, r.saMigrationRequired ? 'Ja' : 'Nei']);
        });
        const ws4 = XLSX.utils.aoa_to_sheet(riskData);
        ws4['!cols'] = [{ wch: 16 }, { wch: 40 }, { wch: 10 }, { wch: 12 }, { wch: 10 }, { wch: 18 }];
        XLSX.utils.book_append_sheet(wb, ws4, 'Risiko');

        // Sheet 5: Avdelingsfordeling
        const deptHeaders = ['Avdeling', 'Artikler (stk)', 'Salg 12m (kr)', 'Salg 3m (kr)'];
        const deptData = [deptHeaders];
        const depts = Object.keys(report.deptSummary).sort();
        let totalItems = 0, total12m = 0, total3m = 0;
        depts.forEach(dept => {
            const d = report.deptSummary[dept];
            deptData.push([dept, d.itemCount, Math.round(d.sales12m), Math.round(d.sales3m)]);
            totalItems += d.itemCount;
            total12m += d.sales12m;
            total3m += d.sales3m;
        });
        deptData.push([]);
        deptData.push(['TOTALT', totalItems, Math.round(total12m), Math.round(total3m)]);
        const ws5 = XLSX.utils.aoa_to_sheet(deptData);
        ws5['!cols'] = [{ wch: 20 }, { wch: 10 }, { wch: 12 }, { wch: 12 }];
        XLSX.utils.book_append_sheet(wb, ws5, 'Avdelingsfordeling');

        // Sheet 6: Kategorifordeling (only if categoryData present)
        if (report.categorySummary) {
            const catHeaders = ['Kategori', 'Salg (kr)', 'Andel (%)', 'Antall artikler (stk)'];
            const catData = [catHeaders];
            report.categorySummary.forEach(c => {
                catData.push([c.name, c.sales, c.percentage, c.count]);
            });
            const ws6 = XLSX.utils.aoa_to_sheet(catData);
            ws6['!cols'] = [{ wch: 30 }, { wch: 12 }, { wch: 10 }, { wch: 16 }];
            XLSX.utils.book_append_sheet(wb, ws6, 'Kategorifordeling');
        }

        // Sheet 7: Leverandørfordeling (only if categoryData present)
        if (report.supplierSummary) {
            const supHeaders = ['Leverandør', 'Salg (kr)', 'Andel (%)'];
            const supData = [supHeaders];
            report.supplierSummary.forEach(s => {
                supData.push([s.name, s.sales, s.percentage]);
            });
            const ws7 = XLSX.utils.aoa_to_sheet(supData);
            ws7['!cols'] = [{ wch: 30 }, { wch: 12 }, { wch: 10 }];
            XLSX.utils.book_append_sheet(wb, ws7, 'Leverandørfordeling');
        }

        // Write file — derive filename from selected quarter key or current quarter
        const now = new Date();
        let fileYear, fileQ;
        if (isQ) {
            const m = qSel.match(/^(\d{4})-Q(\d)$/);
            fileYear = m ? m[1] : now.getFullYear();
            fileQ = m ? `Q${m[2]}` : `Q${Math.floor(now.getMonth() / 3) + 1}`;
        } else {
            fileYear = now.getFullYear();
            fileQ = `Q${Math.floor(now.getMonth() / 3) + 1}`;
        }
        XLSX.writeFile(wb, `Kvartalsrapport_${fileYear}_${fileQ}.xlsx`);
    }

    // ════════════════════════════════════════════════════
    //  REPORT PREVIEW (shown after generation)
    // ════════════════════════════════════════════════════

    static renderReportPreview(report) {
        const s = report.summary;
        const periodTitle = s.periodLabel || 'Rullerende 12 måneder';
        const qLabel = this.formatQuarterLabel(s.selectedQuarter);
        const salesLabel = s.isQuarterFilter ? `Salg ${qLabel}` : 'Salg 12m';
        const qtyLabel = s.isQuarterFilter ? `Ordrer ${qLabel}` : 'Ordrer 12m';
        const riskWithExposure = report.riskList.filter(r => r.exposure > 0).length;

        // Dynamic executive summary sentence
        const summaryParts = [];
        summaryParts.push(`${this.escapeHtml(periodTitle)}: ${this.formatNumber(s.activeCount)} aktive artikler`);
        if (s.saMigrationCount > 0) summaryParts.push(`${s.saMigrationCount} krever SA-migrering`);
        if (s.discontinuedCount > 0) summaryParts.push(`${s.discontinuedCount} utgående artikler, ${riskWithExposure} med eksponering`);
        const summaryText = summaryParts.join('. ') + '.';

        const sectionStyle = 'border-radius:6px;padding:20px;margin-bottom:20px;';
        const sectionHeaderStyle = 'margin:0 0 16px 0;font-size:15px;font-weight:700;padding-bottom:8px;border-bottom:2px solid;';
        const tblStyle = 'font-size:12px;';

        return `
            <div style="margin-bottom:16px;">

            <!-- ══════════════════════════════════════════ -->
            <!-- SECTION 1: EXECUTIVE SUMMARY              -->
            <!-- ══════════════════════════════════════════ -->
            <div style="${sectionStyle}background:#f4f9f4;border:1px solid #c8e6c9;">
                <h3 style="${sectionHeaderStyle}border-color:#4caf50;color:#2e7d32;">Sammendrag</h3>
                <p style="margin:0 0 4px 0;font-size:13px;color:#555;">
                    ${this.escapeHtml(s.selectedDepartments)}
                </p>
                <p style="margin:0 0 14px 0;font-size:13px;color:#666;">
                    Periode: <strong>${this.escapeHtml(periodTitle)}</strong>
                </p>
                <div class="alt-analysis-summary">
                    <div class="stat-card">
                        <div class="stat-value">${this.formatUnits(s.activeCount)}</div>
                        <div class="stat-label">Aktive artikler</div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-value">${this.formatCurrency(s.totalSales12m)}</div>
                        <div class="stat-label">${this.escapeHtml(salesLabel)}</div>
                    </div>
                    ${!s.isQuarterFilter ? `
                    <div class="stat-card">
                        <div class="stat-value">${this.formatCurrency(s.totalSales3m)}</div>
                        <div class="stat-label">Salg 3m</div>
                    </div>` : ''}
                    <div class="stat-card ${s.discontinuedCount > 0 ? 'warning' : ''}">
                        <div class="stat-value">${this.formatUnits(s.discontinuedCount)}</div>
                        <div class="stat-label">Utgående</div>
                    </div>
                    <div class="stat-card ${s.saMigrationCount > 0 ? 'critical' : ''}">
                        <div class="stat-value">${this.formatUnits(s.saMigrationCount)}</div>
                        <div class="stat-label">SA-migr. påkrevd</div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-value">${this.formatCurrency(s.totalExposure)}</div>
                        <div class="stat-label">Total eksponering</div>
                    </div>
                </div>
                <p style="margin:14px 0 0 0;font-size:13px;color:#444;line-height:1.5;background:#fff;border-radius:4px;padding:10px 12px;border-left:3px solid #4caf50;">
                    ${summaryText}
                </p>
            </div>

            <!-- ══════════════════════════════════════════ -->
            <!-- SECTION 2: COMMERCIAL INSIGHTS            -->
            <!-- ══════════════════════════════════════════ -->
            <div style="${sectionStyle}background:#f4f6fb;border:1px solid #bbdefb;">
                <h3 style="${sectionHeaderStyle}border-color:#1976d2;color:#1565c0;">Kommersiell innsikt</h3>

                ${report.categorySummary ? `
                <h4 style="margin:0 0 8px 0;font-size:13px;font-weight:600;color:#333;">Kategorifordeling (Topp 5)</h4>
                <div class="table-wrapper" style="margin-bottom:20px;">
                    <table class="data-table compact" style="${tblStyle}">
                        <thead>
                            <tr><th>Kategori</th><th>${this.escapeHtml(salesLabel)} (kr)</th><th>Andel (%)</th><th>Aktive artikler (stk)</th></tr>
                        </thead>
                        <tbody>
                            ${report.categorySummary.slice(0, 5).map(c => `
                                <tr>
                                    <td>${this.escapeHtml(c.name)}</td>
                                    <td class="qty-cell">${this.formatCurrency(c.sales)}</td>
                                    <td class="qty-cell">${this.formatPercent(c.percentage)}</td>
                                    <td class="qty-cell">${this.formatUnits(c.count)}</td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
                ` : ''}

                ${report.supplierSummary ? `
                <h4 style="margin:0 0 8px 0;font-size:13px;font-weight:600;color:#333;">Leverandørfordeling (Topp 5)</h4>
                <div class="table-wrapper" style="margin-bottom:20px;">
                    <table class="data-table compact" style="${tblStyle}">
                        <thead>
                            <tr><th>Leverandør</th><th>${this.escapeHtml(salesLabel)} (kr)</th><th>Andel (%)</th></tr>
                        </thead>
                        <tbody>
                            ${report.supplierSummary.map(sup => `
                                <tr>
                                    <td>${this.escapeHtml(sup.name)}</td>
                                    <td class="qty-cell">${this.formatCurrency(sup.sales)}</td>
                                    <td class="qty-cell">${this.formatPercent(sup.percentage)}</td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
                ` : ''}

                <h4 style="margin:0 0 8px 0;font-size:13px;font-weight:600;color:#333;">Topp 20 – Omsetning (${this.escapeHtml(salesLabel.toLowerCase())})</h4>
                ${this.renderOmsetningTable(report.top20Value, s)}

                <h4 style="margin:20px 0 8px 0;font-size:13px;font-weight:600;color:#333;">Topp 20 – Ordrefrekvens (${this.escapeHtml(qtyLabel.toLowerCase())})</h4>
                ${this.renderOrdrefrekvensTable(report.top20Quantity, s)}
                ${report.top20Value.length > 10 ? '<p style="color:#888;font-size:11px;margin-top:6px;">Viser topp 10 i forhåndsvisning. Komplett liste (20) i Excel-eksport.</p>' : ''}
            </div>

            <!-- ══════════════════════════════════════════ -->
            <!-- SECTION 3: RISK & CONTROL                 -->
            <!-- ══════════════════════════════════════════ -->
            <div style="${sectionStyle}background:#fdf4f4;border:1px solid #ffcdd2;">
                <h3 style="${sectionHeaderStyle}border-color:#e53935;color:#c62828;">Risiko og kontroll</h3>

                <h4 style="margin:0 0 8px 0;font-size:13px;font-weight:600;color:#333;">Risikoartikler (${report.riskList.length})</h4>
                ${report.riskList.length === 0
                    ? '<p style="color:#888;font-size:12px;">Ingen risikoartikler funnet.</p>'
                    : `
                    <div class="table-wrapper" style="margin-bottom:16px;">
                        <table class="data-table compact" style="${tblStyle}">
                            <thead>
                                <tr><th>Tools nr</th><th>Lager (stk)</th><th>Eksponering (kr)</th><th>${this.escapeHtml(salesLabel)} (kr)</th><th>SA-migr.</th></tr>
                            </thead>
                            <tbody>
                                ${report.riskList.slice(0, 20).map(r => {
                                    const periodSales = s.isQuarterFilter ? (r.quarterlySales[s.selectedQuarter] || 0) : r.salesLast12m;
                                    return `
                                    <tr>
                                        <td><strong>${this.escapeHtml(r.toolsNr)}</strong></td>
                                        <td class="qty-cell">${this.formatUnits(r.stock)}</td>
                                        <td class="qty-cell">${this.formatCurrency(r.exposure)}</td>
                                        <td class="qty-cell">${this.formatCurrency(periodSales)}</td>
                                        <td>${r.saMigrationRequired ? '<span class="badge badge-critical">Ja</span>' : 'Nei'}</td>
                                    </tr>`;
                                }).join('')}
                            </tbody>
                        </table>
                    </div>
                    ${report.riskList.length > 20 ? `<p style="color:#888;font-size:11px;">Viser 20 av ${report.riskList.length} (komplett liste i Excel)</p>` : ''}
                    `}

                ${Object.keys(report.deptSummary).length > 0 ? `
                    <h4 style="margin:20px 0 8px 0;font-size:13px;font-weight:600;color:#333;">Avdelingsfordeling</h4>
                    <div class="table-wrapper">
                        <table class="data-table compact" style="${tblStyle}">
                            <thead>
                                <tr><th>Avdeling</th><th>Artikler (stk)</th><th>Salg 12m (kr)</th><th>Salg 3m (kr)</th></tr>
                            </thead>
                            <tbody>
                                ${Object.keys(report.deptSummary).sort().map(dept => {
                                    const d = report.deptSummary[dept];
                                    return `<tr>
                                        <td>${this.escapeHtml(dept)}</td>
                                        <td class="qty-cell">${this.formatUnits(d.itemCount)}</td>
                                        <td class="qty-cell">${this.formatCurrency(d.sales12m)}</td>
                                        <td class="qty-cell">${this.formatCurrency(d.sales3m)}</td>
                                    </tr>`;
                                }).join('')}
                            </tbody>
                        </table>
                    </div>
                ` : ''}
            </div>

            </div>
        `;
    }

    static renderOmsetningTable(rows, summary) {
        if (!rows || rows.length === 0) {
            return '<p style="color:#888;font-size:12px;">Ingen data.</p>';
        }
        const isQ = summary.isQuarterFilter;
        const qSel = summary.selectedQuarter;
        const salesCol = isQ ? `Salg ${this.formatQuarterLabel(qSel)}` : 'Salg 12m';
        const getSalesVal = isQ
            ? (r) => r.quarterlySales[qSel] || 0
            : (r) => r.salesLast12m;
        const previewRows = rows.slice(0, 10);
        return `
            <div class="table-wrapper">
                <table class="data-table compact" style="font-size:12px;">
                    <thead>
                        <tr>
                            <th>#</th><th>Tools nr</th><th>SA-nummer</th><th>Beskrivelse</th>
                            <th>Varegruppe</th><th>Leverandør</th>
                            <th>${this.escapeHtml(salesCol)} (kr)</th><th>Salg 3m (kr)</th><th>Salg innev. kvartal (kr)</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${previewRows.map((r, i) => `
                            <tr>
                                <td>${i + 1}</td>
                                <td><strong>${this.escapeHtml(r.toolsNr)}</strong></td>
                                <td>${this.escapeHtml(r.saNumber)}</td>
                                <td>${this.escapeHtml(r.description)}</td>
                                <td>${this.escapeHtml(r.category)}</td>
                                <td>${this.escapeHtml(r.supplier)}</td>
                                <td class="qty-cell">${this.formatCurrency(getSalesVal(r))}</td>
                                <td class="qty-cell">${this.formatCurrency(r.salesLast3m)}</td>
                                <td class="qty-cell">${this.formatCurrency(r.currentQuarterSales)}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        `;
    }

    static renderOrdrefrekvensTable(rows, summary) {
        if (!rows || rows.length === 0) {
            return '<p style="color:#888;font-size:12px;">Ingen data.</p>';
        }
        const isQ = summary.isQuarterFilter;
        const qSel = summary.selectedQuarter;
        const qtyCol = isQ ? `Ordrer ${this.formatQuarterLabel(qSel)}` : 'Ordrer 12m';
        const salesCol = isQ ? `Salg ${this.formatQuarterLabel(qSel)}` : 'Salg 12m';
        const getQtyVal = isQ
            ? (r) => r.quarterlyOrders[qSel] || 0
            : (r) => r.quantityLast12m;
        const getSalesVal = isQ
            ? (r) => r.quarterlySales[qSel] || 0
            : (r) => r.salesLast12m;
        const previewRows = rows.slice(0, 10);
        return `
            <div class="table-wrapper">
                <table class="data-table compact" style="font-size:12px;">
                    <thead>
                        <tr>
                            <th>#</th><th>Tools nr</th><th>Beskrivelse</th>
                            <th>${this.escapeHtml(qtyCol)} (stk)</th><th>${this.escapeHtml(salesCol)} (kr)</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${previewRows.map((r, i) => `
                            <tr>
                                <td>${i + 1}</td>
                                <td><strong>${this.escapeHtml(r.toolsNr)}</strong></td>
                                <td>${this.escapeHtml(r.description)}</td>
                                <td class="qty-cell"><strong>${this.formatUnits(getQtyVal(r))}</strong></td>
                                <td class="qty-cell">${this.formatCurrency(getSalesVal(r))}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        `;
    }

    // ════════════════════════════════════════════════════
    //  EVENT HANDLERS
    // ════════════════════════════════════════════════════

    static handleDeptToggle(key, checked) {
        if (checked) {
            this.selectedDepartments.add(key);
        } else {
            this.selectedDepartments.delete(key);
        }
    }

    static handleQuarterChange(value) {
        this.selectedQuarter = value;
        // If a report was previously generated, regenerate with new quarter
        if (this.currentReportData) {
            this.generateReport();
        } else {
            this.refreshAll();
        }
    }

    static handleSelectAll(checked) {
        if (!this.dataStore) return;
        const departments = this.collectDepartments(this.dataStore);
        if (checked) {
            departments.forEach(d => this.selectedDepartments.add(d.key));
        } else {
            this.selectedDepartments.clear();
        }
        this.refreshAll();
    }

    static refreshAll() {
        const moduleContent = document.getElementById('moduleContent');
        if (moduleContent && this.dataStore) {
            moduleContent.innerHTML = this.render(this.dataStore);
        }
    }

    // ════════════════════════════════════════════════════
    //  UTILITY
    // ════════════════════════════════════════════════════

    static formatNumber(num) {
        if (num === null || num === undefined) return '-';
        return Math.round(num).toLocaleString('nb-NO');
    }

    static formatCurrency(num) {
        if (num === null || num === undefined) return '-';
        return Math.round(num).toLocaleString('nb-NO') + ' kr';
    }

    static formatUnits(num) {
        if (num === null || num === undefined) return '-';
        return Math.round(num).toLocaleString('nb-NO') + ' stk';
    }

    static formatPercent(num) {
        if (num === null || num === undefined) return '-';
        return num.toFixed(1) + ' %';
    }

    static escapeHtml(str) {
        if (!str) return '';
        return str.toString()
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }
}

// Eksporter til global scope
window.ReportsMode = ReportsMode;
