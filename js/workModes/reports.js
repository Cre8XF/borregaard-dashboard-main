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
    static selectedCategoryLevel = 1; // 1-5, maps to category1..category5 from Kategori.xlsx

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

            ${(() => {
                const store = ReportsMode.dataStore;
                const hasStocks = store && store.stocksMap && store.stocksMap.size > 0;
                return `
                    <div style="font-size:12px;color:${hasStocks ? '#2e7d32' : '#888'};
                                margin-bottom:12px;padding:6px 12px;
                                background:${hasStocks ? '#f1f8f1' : '#f5f5f5'};
                                border-radius:4px;border:1px solid ${hasStocks ? '#c8e6c9' : '#e0e0e0'};">
                        ${hasStocks
                            ? `✅ Ordrestockanalys lastet — DG% og åpne ordrer tilgjengelig (${store.stocksMap.size} artikler)`
                            : `ℹ️ Ordrestockanalys ikke lastet — DG% og åpne ordrer vises ikke. Legg filen i 03-Sjelden og kjør pipeline.`
                        }
                    </div>
                `;
            })()}

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
                    ${window.app && window.app.categoryData && window.app.categoryData.length > 0 ? `
                    <div style="display:flex;align-items:center;gap:6px;">
                        <label style="font-size:13px;font-weight:600;">Kategorinivå:</label>
                        <select class="filter-select" onchange="ReportsMode.handleCategoryLevelChange(this.value)" style="font-size:13px;">
                            <option value="1" ${this.selectedCategoryLevel === 1 ? 'selected' : ''}>Item category 1</option>
                            <option value="2" ${this.selectedCategoryLevel === 2 ? 'selected' : ''}>Item category 2</option>
                            <option value="3" ${this.selectedCategoryLevel === 3 ? 'selected' : ''}>Item category 3</option>
                            <option value="4" ${this.selectedCategoryLevel === 4 ? 'selected' : ''}>Item category 4</option>
                            <option value="5" ${this.selectedCategoryLevel === 5 ? 'selected' : ''}>Item category 5</option>
                        </select>
                    </div>
                    ` : ''}
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

            ${this._renderPrisavvikPanel()}
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

        // DG-kontroll data (FASE 9.x / 10.x)
        const dgKontroll = store.dashboardData?.dgKontroll || {};

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
            const catLevelKey = `category${this.selectedCategoryLevel}`;

            // DG-data fra Orderingang (FASE 9.x / 10.x)
            const dgEntry = dgKontroll[item.toolsArticleNumber];
            const dgSnitt12m   = dgEntry != null ? (dgEntry.dg_snitt_12mnd  ?? null) : null;
            const dgSiste      = dgEntry != null ? (dgEntry.dg_siste        ?? null) : null;
            const dgAvvik      = dgEntry != null ? (dgEntry.dg_avvik        ?? null) : null;

            rows.push({
                toolsNr: item.toolsArticleNumber,
                saNumber: item.saNumber || '',
                description: item.description || '',
                category: item.category || '',
                supplier: item.supplier || '',
                catCategory: catData ? (catData[catLevelKey] || 'Ukjent') : (item.category || ''),
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
                iInPrisliste:    !!item.iInPrisliste,   // FASE 9.0
                dgSnitt12m,   // FASE 10.x
                dgSiste,
                dgAvvik,
                dgPctAvg:        item.dgPctAvg        ?? null,   // FASE 9.1 — fra stocksMap
                openOrderCount:  item.openOrderCount  || 0,       // FASE 9.1 — fra stocksMap
                openOrderValue:  item.openOrderValue  || 0,       // FASE 9.1 — fra stocksMap
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

        // DG-sammendrag: vektet snitt-DG (vektet etter salgsverdi) + antall med DG-fall > 5 pp
        {
            let wNum = 0, wDen = 0, dgFallCount = 0;
            rows.forEach(r => {
                const sv = getSalesMetric(r);
                if (r.dgSnitt12m !== null && sv > 0) {
                    wNum += r.dgSnitt12m * sv;
                    wDen += sv;
                }
                if (r.dgAvvik !== null && r.dgAvvik < -5) dgFallCount++;
            });
            summary.weightedDG    = wDen > 0 ? Math.round(wNum / wDen * 10) / 10 : null;
            summary.dgFallCount   = dgFallCount;
        }

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

        // F) Category summary — only if categoryData loaded (uses selectedCategoryLevel)
        let categorySummary = null;
        if (this.categoryMap) {
            const catMap = {};
            rows.forEach(r => {
                const cat = r.catCategory || 'Ukjent';
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

        // ── DG-oversikt ark (FASE 10.x) ───────────────────────────────────────
        const dgKontrollArb = this.dataStore?.dashboardData?.dgKontroll || {};
        const dgOversiktRows = rows
            .filter(r => dgKontrollArb[r.toolsNr])
            .map(r => {
                const dg = dgKontrollArb[r.toolsNr];
                return {
                    toolsNr:      r.toolsNr,
                    saNumber:     r.saNumber,
                    description:  r.description,
                    dgSnitt12m:   dg.dg_snitt_12mnd  ?? '',
                    dgSiste:      dg.dg_siste         ?? '',
                    dgAvvik:      dg.dg_avvik          ?? '',
                    sistePris:    dg.siste_pris         ?? '',
                    sisteKsv:     dg.siste_ksv          ?? '',
                    sisteOrdre:   dg.siste_ordredato    ?? '',
                    antallOrdrer: dg.antall_ordrer_12mnd ?? '',
                };
            })
            .sort((a, b) => {
                // Stigende på dg_avvik — størst negativt avvik øverst
                const av = typeof a.dgAvvik === 'number' ? a.dgAvvik : Infinity;
                const bv = typeof b.dgAvvik === 'number' ? b.dgAvvik : Infinity;
                return av - bv;
            });

        if (dgOversiktRows.length > 0) {
            const dgHeaders = [
                'Tools art.nr', 'SA-nummer', 'Beskrivelse',
                'Snitt DG% 12 mnd', 'Siste DG%', 'Avvik (pp)',
                'Siste pris', 'Siste KSV', 'Siste ordre', 'Antall ordrer'
            ];
            const dgData = [dgHeaders];
            dgOversiktRows.forEach(r => {
                dgData.push([
                    r.toolsNr, r.saNumber, r.description,
                    typeof r.dgSnitt12m  === 'number' ? r.dgSnitt12m  / 100 : '',
                    typeof r.dgSiste     === 'number' ? r.dgSiste     / 100 : '',
                    typeof r.dgAvvik     === 'number' ? r.dgAvvik     / 100 : '',
                    r.sistePris, r.sisteKsv, r.sisteOrdre, r.antallOrdrer
                ]);
            });
            const wsDg = XLSX.utils.aoa_to_sheet(dgData);
            wsDg['!cols'] = [
                { wch: 16 }, { wch: 14 }, { wch: 40 },
                { wch: 16 }, { wch: 12 }, { wch: 12 },
                { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 12 }
            ];
            const dgRowCount = dgOversiktRows.length;
            // Prosentformat for DG-kolonner (3, 4, 5) — 0.385 → 38.5%
            const FMT_PCT_DG = '0.0%';
            for (let row = 1; row <= dgRowCount; row++) {
                [3, 4, 5].forEach(col => {
                    const ref = XLSX.utils.encode_cell({ r: row, c: col });
                    if (wsDg[ref] && typeof wsDg[ref].v === 'number') wsDg[ref].z = FMT_PCT_DG;
                });
                // Priskolonner med 2 desimaler
                [6, 7].forEach(col => {
                    const ref = XLSX.utils.encode_cell({ r: row, c: col });
                    if (wsDg[ref] && typeof wsDg[ref].v === 'number') wsDg[ref].z = '#,##0.00';
                });
            }
            // Frys headerrad + autofilter
            const lastCol = XLSX.utils.encode_col(dgHeaders.length - 1);
            wsDg['!autofilter'] = { ref: `A1:${lastCol}${dgRowCount + 1}` };
            wsDg['!views'] = [{ state: 'frozen', ySplit: 1, xSplit: 0, topLeftCell: 'A2', activePane: 'bottomLeft' }];
            XLSX.utils.book_append_sheet(wb, wsDg, 'DG-oversikt');
        }

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
     *
     * Layout: Executive (presentation) + structured data sheets with
     * number formats, autofilter, freeze panes, and sensible column widths.
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

        // ── Format constants ──
        const FMT_KR = '#,##0 "kr"';
        const FMT_NUM = '#,##0';
        const FMT_PCT = '0.0%';

        /** Apply number format to cells in a column (0-indexed rows) */
        const fmtCol = (ws, col, rowStart, rowEnd, fmt) => {
            for (let r = rowStart; r <= rowEnd; r++) {
                const ref = XLSX.utils.encode_cell({ r, c: col });
                if (ws[ref] && typeof ws[ref].v === 'number') {
                    ws[ref].z = fmt;
                }
            }
        };

        /** Format a single cell */
        const fmtCell = (ws, row, col, fmt) => {
            const ref = XLSX.utils.encode_cell({ r: row, c: col });
            if (ws[ref] && typeof ws[ref].v === 'number') ws[ref].z = fmt;
        };

        /** Apply freeze row 1 + autofilter to a data sheet */
        const freezeAndFilter = (ws, colCount, totalRowCount) => {
            const lastCol = XLSX.utils.encode_col(colCount - 1);
            ws['!autofilter'] = { ref: `A1:${lastCol}${totalRowCount}` };
            // Freeze top row via SheetJS views API
            ws['!views'] = [{ state: 'frozen', ySplit: 1, xSplit: 0, topLeftCell: 'A2', activePane: 'bottomLeft' }];
        };

        /**
         * Auto-apply number formats based on header text conventions.
         * Scans header row for (kr), (stk), (%) suffixes and applies formats.
         */
        const autoFmtByHeaders = (ws, headers, dataRowCount) => {
            if (dataRowCount <= 0) return;
            headers.forEach((h, c) => {
                const label = (h || '').toString();
                let fmt = null;
                if (label.includes('(kr)')) fmt = FMT_KR;
                else if (label.includes('(stk)')) fmt = FMT_NUM;
                else if (label.includes('(%)')) fmt = FMT_PCT;
                if (fmt) fmtCol(ws, c, 1, dataRowCount, fmt);
            });
        };

        // ══════════════════════════════════════════════════════
        //  SHEET 0: Executive (presentation sheet)
        // ══════════════════════════════════════════════════════
        const execAoa = [
            [`Borregaard \u2013 Kvartalsrapport ${periodLabel}`],
            [],
            ['Generert', new Date().toISOString().split('T')[0]],
            ['Avdelinger', s.selectedDepartments],
            [],
            ['Nøkkeltall', 'Verdi'],
            ['Omsetning', Math.round(s.totalSales12m)],
            ['Aktive artikler', s.activeCount],
            ['Utgående artikler', s.discontinuedCount],
            ['SA-migrering påkrevd', s.saMigrationCount],
            ['Total eksponering', Math.round(s.totalExposure)]
        ];

        // Top 5 Kategorier
        let execCatDataStart = -1;
        if (report.categorySummary && report.categorySummary.length > 0) {
            execAoa.push([]);
            execAoa.push([`Topp 5 Kategorier (niv\u00e5 ${this.selectedCategoryLevel})`]);
            execAoa.push([`Kategori (niv\u00e5 ${this.selectedCategoryLevel})`, 'Salg', 'Andel']);
            execCatDataStart = execAoa.length;
            report.categorySummary.slice(0, 5).forEach(c => {
                execAoa.push([c.name, c.sales, c.percentage / 100]);
            });
        }

        // Top 5 Leverandører
        let execSupDataStart = -1;
        if (report.supplierSummary && report.supplierSummary.length > 0) {
            execAoa.push([]);
            execAoa.push(['Topp 5 Leverandører']);
            execAoa.push(['Leverandør', 'Salg', 'Andel']);
            execSupDataStart = execAoa.length;
            report.supplierSummary.slice(0, 5).forEach(sup => {
                execAoa.push([sup.name, sup.sales, sup.percentage / 100]);
            });
        }

        const wsExec = XLSX.utils.aoa_to_sheet(execAoa);
        wsExec['!cols'] = [{ wch: 28 }, { wch: 20 }, { wch: 12 }];
        wsExec['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 2 } }];
        // KPI number formats
        fmtCell(wsExec, 6, 1, FMT_KR);   // Omsetning
        fmtCell(wsExec, 7, 1, FMT_NUM);   // Aktive
        fmtCell(wsExec, 8, 1, FMT_NUM);   // Utgående
        fmtCell(wsExec, 9, 1, FMT_NUM);   // SA-migr
        fmtCell(wsExec, 10, 1, FMT_KR);   // Eksponering
        // Top 5 Kategorier formats
        if (execCatDataStart > 0) {
            const catCount = Math.min(report.categorySummary.length, 5);
            fmtCol(wsExec, 1, execCatDataStart, execCatDataStart + catCount - 1, FMT_KR);
            fmtCol(wsExec, 2, execCatDataStart, execCatDataStart + catCount - 1, FMT_PCT);
        }
        // Top 5 Leverandører formats
        if (execSupDataStart > 0) {
            const supCount = Math.min(report.supplierSummary.length, 5);
            fmtCol(wsExec, 1, execSupDataStart, execSupDataStart + supCount - 1, FMT_KR);
            fmtCol(wsExec, 2, execSupDataStart, execSupDataStart + supCount - 1, FMT_PCT);
        }
        // Charts: SheetJS community edition does not support chart objects.
        // If a future version adds chart API, add column charts for Top 5 here.
        XLSX.utils.book_append_sheet(wb, wsExec, 'Executive');

        // ══════════════════════════════════════════════════════
        //  SHEET 1: Sammendrag
        // ══════════════════════════════════════════════════════
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
        // Number formats on value column (col 1)
        fmtCell(ws1, 6, 1, FMT_NUM);   // Aktive artikler
        fmtCell(ws1, 7, 1, FMT_KR);    // Salg
        if (!isQ) {
            fmtCell(ws1, 8, 1, FMT_KR);    // Salg 3m
            fmtCell(ws1, 9, 1, FMT_NUM);   // Utgående
            fmtCell(ws1, 10, 1, FMT_NUM);  // SA-migr
            fmtCell(ws1, 11, 1, FMT_KR);   // Eksponering
        } else {
            fmtCell(ws1, 8, 1, FMT_NUM);   // Utgående
            fmtCell(ws1, 9, 1, FMT_NUM);   // SA-migr
            fmtCell(ws1, 10, 1, FMT_KR);   // Eksponering
        }
        XLSX.utils.book_append_sheet(wb, ws1, 'Sammendrag');

        // ══════════════════════════════════════════════════════
        //  SHEET 2: Topp20_Verdi
        // ══════════════════════════════════════════════════════
        const valueHeaders = ['#', 'Tools nr', 'SA-nummer', 'Beskrivelse', 'Varegruppe', 'Leverandør', salesColLabel + ' (kr)', 'Salg 3m (kr)', 'Salg innev. kvartal (kr)', 'Snitt DG% 12 mnd'];
        const top20vData = [valueHeaders];
        report.top20Value.forEach((r, i) => {
            top20vData.push([i + 1, r.toolsNr, r.saNumber, r.description, r.category, r.supplier,
                getSalesVal(r), r.salesLast3m, r.currentQuarterSales,
                r.dgSnitt12m !== null ? r.dgSnitt12m / 100 : '']);
        });
        const ws2 = XLSX.utils.aoa_to_sheet(top20vData);
        ws2['!cols'] = [{ wch: 4 }, { wch: 12 }, { wch: 14 }, { wch: 30 }, { wch: 18 }, { wch: 20 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 16 }];
        const vRows = report.top20Value.length;
        freezeAndFilter(ws2, valueHeaders.length, vRows + 1);
        autoFmtByHeaders(ws2, valueHeaders, vRows);
        // DG-kolonne (index 9) — FMT_PCT viser 38.5% for verdien 0.385
        fmtCol(ws2, 9, 1, vRows, FMT_PCT);
        XLSX.utils.book_append_sheet(wb, ws2, 'Topp20_Verdi');

        // ══════════════════════════════════════════════════════
        //  SHEET 3: Topp20_Antall
        // ══════════════════════════════════════════════════════
        const qtyHeaders = ['#', 'Tools nr', 'SA-nummer', 'Beskrivelse', 'Varegruppe', 'Leverandør', qtyColLabel + ' (stk)', 'Salg 12m (kr)', 'Salg 3m (kr)'];
        const top20qData = [qtyHeaders];
        report.top20Quantity.forEach((r, i) => {
            top20qData.push([i + 1, r.toolsNr, r.saNumber, r.description, r.category, r.supplier, getQtyVal(r), r.salesLast12m, r.salesLast3m]);
        });
        const ws3 = XLSX.utils.aoa_to_sheet(top20qData);
        ws3['!cols'] = [{ wch: 4 }, { wch: 12 }, { wch: 14 }, { wch: 30 }, { wch: 18 }, { wch: 20 }, { wch: 14 }, { wch: 14 }, { wch: 14 }];
        const qRows = report.top20Quantity.length;
        freezeAndFilter(ws3, qtyHeaders.length, qRows + 1);
        autoFmtByHeaders(ws3, qtyHeaders, qRows);
        XLSX.utils.book_append_sheet(wb, ws3, 'Topp20_Antall');

        // ══════════════════════════════════════════════════════
        //  SHEET 4: Risiko
        // ══════════════════════════════════════════════════════
        const riskHeaders = ['Tools nr', 'Beskrivelse', 'Lager (stk)', 'Eksponering (kr)', 'Salg 3m (kr)', 'SA-migrering påkrevd', 'I prisliste'];
        const riskData = [riskHeaders];
        report.riskList.forEach(r => {
            riskData.push([r.toolsNr, r.description, r.stock, r.exposure, r.salesLast3m, r.saMigrationRequired ? 'Ja' : 'Nei', r.iInPrisliste ? 'Ja' : 'Nei']);
        });
        const ws4 = XLSX.utils.aoa_to_sheet(riskData);
        ws4['!cols'] = [{ wch: 12 }, { wch: 30 }, { wch: 12 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 12 }];
        const rRows = report.riskList.length;
        if (rRows > 0) {
            freezeAndFilter(ws4, riskHeaders.length, rRows + 1);
            autoFmtByHeaders(ws4, riskHeaders, rRows);
        }
        XLSX.utils.book_append_sheet(wb, ws4, 'Risiko');

        // ══════════════════════════════════════════════════════
        //  SHEET 5: Avdelingsfordeling
        // ══════════════════════════════════════════════════════
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
        ws5['!cols'] = [{ wch: 20 }, { wch: 12 }, { wch: 14 }, { wch: 14 }];
        const dRows = depts.length;
        // Autofilter covers header + dept rows only (excludes TOTALT)
        if (dRows > 0) {
            freezeAndFilter(ws5, deptHeaders.length, dRows + 1);
            autoFmtByHeaders(ws5, deptHeaders, dRows);
        }
        // Format TOTALT row separately (outside autofilter range)
        const totaltRow = dRows + 2;
        fmtCell(ws5, totaltRow, 1, FMT_NUM);
        fmtCell(ws5, totaltRow, 2, FMT_KR);
        fmtCell(ws5, totaltRow, 3, FMT_KR);
        XLSX.utils.book_append_sheet(wb, ws5, 'Avdelingsfordeling');

        // ══════════════════════════════════════════════════════
        //  SHEET 6: Kategorifordeling (only if categoryData present)
        // ══════════════════════════════════════════════════════
        if (report.categorySummary) {
            const catHeaders = [`Kategori (niv\u00e5 ${this.selectedCategoryLevel})`, 'Salg (kr)', 'Andel (%)', 'Antall artikler (stk)'];
            const catData = [catHeaders];
            report.categorySummary.forEach(c => {
                catData.push([c.name, c.sales, c.percentage / 100, c.count]);
            });
            const ws6 = XLSX.utils.aoa_to_sheet(catData);
            ws6['!cols'] = [{ wch: 30 }, { wch: 14 }, { wch: 10 }, { wch: 16 }];
            const cRows = report.categorySummary.length;
            freezeAndFilter(ws6, catHeaders.length, cRows + 1);
            autoFmtByHeaders(ws6, catHeaders, cRows);
            XLSX.utils.book_append_sheet(wb, ws6, `Kategori_niv\u00e5${this.selectedCategoryLevel}`);
        }

        // ══════════════════════════════════════════════════════
        //  SHEET 7: Leverandørfordeling (only if categoryData present)
        // ══════════════════════════════════════════════════════
        if (report.supplierSummary) {
            const supHeaders = ['Leverandør', 'Salg (kr)', 'Andel (%)'];
            const supData = [supHeaders];
            report.supplierSummary.forEach(sup => {
                supData.push([sup.name, sup.sales, sup.percentage / 100]);
            });
            const ws7 = XLSX.utils.aoa_to_sheet(supData);
            ws7['!cols'] = [{ wch: 30 }, { wch: 14 }, { wch: 10 }];
            const sRows = report.supplierSummary.length;
            freezeAndFilter(ws7, supHeaders.length, sRows + 1);
            autoFmtByHeaders(ws7, supHeaders, sRows);
            XLSX.utils.book_append_sheet(wb, ws7, 'Leverandørfordeling');
        }

        // ══════════════════════════════════════════════════════
        //  SHEET: Prisanalyse (FASE 9.0)
        // ══════════════════════════════════════════════════════
        if (this.dataStore && this.dataStore.prisMap && Object.keys(this.dataStore.prisMap).length > 0) {
            const prisHeaders = [
                'Tools nr', 'SA-nummer', 'Beskrivelse', 'Avtalepris (kr)',
                'Listpris (kr)', 'Dekningsgrad (%)', 'Innkjøpspris (liste)',
                'Kalkylpris (MV2)', 'Prisavvik (%)', 'Status', 'Anbefaling'
            ];
            const prisData = [prisHeaders];

            const alleItems = this.dataStore.getAllItems()
                .filter(item => item.iInPrisliste)
                .sort((a, b) => (b.avtalepris || 0) - (a.avtalepris || 0));

            alleItems.forEach(item => {
                prisData.push([
                    item.toolsArticleNumber,
                    item.saNumber,
                    item.description,
                    item.avtalepris || 0,
                    item.listpris || 0,
                    item.nyDG > 0 ? item.nyDG : 0,
                    item.prisKalkyl || 0,
                    item.kalkylPris || 0,
                    item.prisAvvik || 0,
                    item.prisStatus || '',
                    item.prisAnbefaling || '',
                ]);
            });

            const wsPris = XLSX.utils.aoa_to_sheet(prisData);
            wsPris['!cols'] = [
                { wch: 16 }, { wch: 14 }, { wch: 40 }, { wch: 16 },
                { wch: 14 }, { wch: 16 }, { wch: 20 }, { wch: 16 },
                { wch: 14 }, { wch: 12 }, { wch: 45 }
            ];

            // Formater tall-kolonner
            const numCols = [3, 4, 6, 7]; // avtalepris, listpris, prisKalkyl, kalkylPris
            const pctCols = [5, 8];        // nyDG, prisAvvik
            for (let r = 1; r < prisData.length; r++) {
                numCols.forEach(c => {
                    const cellRef = XLSX.utils.encode_cell({ r, c });
                    if (wsPris[cellRef]) wsPris[cellRef].z = '#,##0.00';
                });
                pctCols.forEach(c => {
                    const cellRef = XLSX.utils.encode_cell({ r, c });
                    if (wsPris[cellRef]) {
                        if (c === 5) wsPris[cellRef].z = '0.0%';
                        else wsPris[cellRef].z = '0.0"%"';
                    }
                });
            }

            freezeAndFilter(wsPris, prisHeaders.length, prisData.length);
            XLSX.utils.book_append_sheet(wb, wsPris, 'Prisanalyse');
        }

        // ══════════════════════════════════════════════════════
        //  SHEET: Omsetning (alle artikler — FASE 9.1)
        // ══════════════════════════════════════════════════════
        {
            const omsetningHeaders = [
                '#', 'Tools nr', 'SA-nummer', 'Beskrivelse', 'Varegruppe', 'Leverandør',
                salesColLabel + ' (kr)', 'Salg 3m (kr)', 'Salg innev. kv. (kr)',
                'Antall ordrelinjer 12m (stk)', 'Saldo (stk)', 'Innkommende (stk)', 'Eksponering (stk)',
                'Lagerverdi (kr)', 'DG% snitt', 'Åpne ordre (stk)', 'Åpne ordre (kr)',
                'Status', 'Erstatning', 'SA-migrering påkrevd'
            ];
            const omsetningData = [omsetningHeaders];
            report.rows.forEach((r, i) => {
                omsetningData.push([
                    i + 1,
                    r.toolsNr,
                    r.saNumber,
                    r.description,
                    r.category,
                    r.supplier,
                    getSalesVal(r),
                    r.salesLast3m,
                    r.currentQuarterSales,
                    r.orderCount12m || 0,
                    r.stock,
                    r.bestAntLev,
                    r.exposure,
                    r.estimertVerdi || 0,
                    r.dgPctAvg !== null && r.dgPctAvg !== undefined ? r.dgPctAvg : '',
                    r.openOrderCount || '',
                    r.openOrderValue || '',
                    r.status,
                    r.replacementNr || '',
                    r.saMigrationRequired ? 'Ja' : 'Nei'
                ]);
            });
            const wsOmsetning = XLSX.utils.aoa_to_sheet(omsetningData);
            wsOmsetning['!cols'] = [
                { wch: 4 }, { wch: 12 }, { wch: 14 }, { wch: 35 }, { wch: 18 }, { wch: 20 },
                { wch: 14 }, { wch: 14 }, { wch: 16 },
                { wch: 18 }, { wch: 10 }, { wch: 12 }, { wch: 14 },
                { wch: 14 }, { wch: 10 }, { wch: 14 }, { wch: 14 },
                { wch: 10 }, { wch: 14 }, { wch: 18 }
            ];
            const omRows = report.rows.length;
            if (omRows > 0) {
                freezeAndFilter(wsOmsetning, omsetningHeaders.length, omRows + 1);
                autoFmtByHeaders(wsOmsetning, omsetningHeaders, omRows);
                // DG% snitt — kolonne 14 (0-indeksert)
                fmtCol(wsOmsetning, 14, 1, omRows, '0.0"%"');
            }
            XLSX.utils.book_append_sheet(wb, wsOmsetning, 'Omsetning');
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
                    <div class="stat-card ${s.weightedDG !== null && s.weightedDG < 20 ? 'critical' : s.weightedDG !== null && s.weightedDG < 35 ? 'warning' : ''}">
                        <div class="stat-value" style="color:${this._dgColor(s.weightedDG)};">${s.weightedDG !== null ? s.weightedDG.toFixed(1) + '\u00a0%' : '\u2013'}</div>
                        <div class="stat-label">Snitt DG% (vektet)</div>
                    </div>
                    <div class="stat-card ${s.dgFallCount > 0 ? 'critical' : ''}">
                        <div class="stat-value">${s.dgFallCount}</div>
                        <div class="stat-label">DG-fall &gt;&nbsp;5&nbsp;pp</div>
                    </div>
                    ${(() => {
                        const store = ReportsMode.dataStore;
                        if (!store || !store.stocksMap || store.stocksMap.size === 0) return '';
                        const _getSM = s.isQuarterFilter
                            ? (r) => r.quarterlySales[s.selectedQuarter] || 0
                            : (r) => r.salesLast12m;
                        const dgRows = report.rows.filter(r => r.dgPctAvg !== null && r.dgPctAvg !== undefined);
                        if (dgRows.length === 0) return '';
                        const totalSales = dgRows.reduce((acc, r) => acc + _getSM(r), 0);
                        const weightedDg = totalSales > 0
                            ? dgRows.reduce((acc, r) => acc + (r.dgPctAvg || 0) * _getSM(r), 0) / totalSales
                            : dgRows.reduce((acc, r) => acc + (r.dgPctAvg || 0), 0) / dgRows.length;
                        return `
                        <div style="background:#fff;border:1px solid #e0e0e0;border-radius:6px;padding:12px 16px;">
                            <div style="font-size:11px;color:#888;margin-bottom:4px;">Snitt DG% (Ordrestock)</div>
                            <div style="font-size:20px;font-weight:700;color:#1565c0;">${weightedDg.toFixed(1)}%</div>
                            <div style="font-size:11px;color:#aaa;">vektet på salgsverdi</div>
                        </div>`;
                    })()}
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
                <h4 style="margin:0 0 8px 0;font-size:13px;font-weight:600;color:#333;">Kategorifordeling (niv\u00e5 ${this.selectedCategoryLevel}) \u2013 Topp 5</h4>
                <div class="table-wrapper" style="margin-bottom:20px;">
                    <table class="data-table compact" style="${tblStyle}">
                        <thead>
                            <tr><th>Kategori (niv\u00e5 ${this.selectedCategoryLevel})</th><th>${this.escapeHtml(salesLabel)} (kr)</th><th>Andel (%)</th><th>Aktive artikler (stk)</th></tr>
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

            ${(() => {
                const store = ReportsMode.dataStore;
                if (!store || !store.stocksMap || store.stocksMap.size === 0) return '';
                const openRows = report.rows.filter(r => r.openOrderCount > 0)
                    .sort((a, b) => (b.openOrderValue || 0) - (a.openOrderValue || 0))
                    .slice(0, 10);
                if (openRows.length === 0) return '';
                return `
                    <div style="${sectionStyle}background:#fffde7;border:1px solid #fff176;">
                        <h3 style="${sectionHeaderStyle}border-color:#f9a825;color:#f57f17;">Åpne ordrer</h3>
                        <h4 style="margin:0 0 8px 0;font-size:13px;font-weight:600;color:#333;">
                            Åpne ordrer (topp 10 etter verdi)
                        </h4>
                        <div class="table-wrapper">
                            <table class="data-table compact" style="font-size:12px;">
                                <thead>
                                    <tr>
                                        <th>Tools nr</th><th>SA-nummer</th><th>Beskrivelse</th>
                                        <th style="text-align:right;">Åpne (stk)</th>
                                        <th style="text-align:right;">Åpne (kr)</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${openRows.map(r => `
                                        <tr>
                                            <td>${ReportsMode.escapeHtml(r.toolsNr)}</td>
                                            <td>${ReportsMode.escapeHtml(r.saNumber)}</td>
                                            <td>${ReportsMode.escapeHtml(r.description)}</td>
                                            <td style="text-align:right;">${r.openOrderCount}</td>
                                            <td style="text-align:right;">${ReportsMode.formatCurrency(r.openOrderValue)}</td>
                                        </tr>
                                    `).join('')}
                                </tbody>
                            </table>
                        </div>
                    </div>
                `;
            })()}

            </div>
        `;
    }

    // DG% fargekode: grønn ≥35%, gul 20–35%, rød <20%, grå = mangler
    static _dgColor(dg) {
        if (dg === null || dg === undefined) return '#9e9e9e';
        if (dg >= 35) return '#2e7d32';
        if (dg >= 20) return '#e65100';
        return '#c62828';
    }

    static _dgCell(dg) {
        if (dg === null || dg === undefined) {
            return '<span style="color:#bdbdbd;">\u2013</span>';
        }
        return `<span style="color:${this._dgColor(dg)};font-weight:600;">${dg.toFixed(1)}%</span>`;
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
                            <th>Varegruppe</th><th>Leverand\u00f8r</th>
                            <th>${this.escapeHtml(salesCol)} (kr)</th><th>Salg 3m (kr)</th><th>Salg innev. kvartal (kr)</th>
                            <th>Snitt DG% (12 mnd)</th>
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
                                <td class="qty-cell">${this._dgCell(r.dgSnitt12m)}</td>
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

    static handleCategoryLevelChange(value) {
        this.selectedCategoryLevel = parseInt(value) || 1;
        // If a report was previously generated, regenerate with new category level
        if (this.currentReportData) {
            this.generateReport();
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
    //  PRISAVVIK PANEL (FASE 9.0)
    // ════════════════════════════════════════════════════

    /**
     * Render prisavvik-panel i Rapporter-modulen
     * Viser artikler med stort avvik mellom prisliste og MV2-kalkylpris
     * FASE 9.0
     */
    static _renderPrisavvikPanel() {
        if (!this.dataStore || !this.dataStore.prisMap) {
            return '';
        }

        const AVVIK_GRENSE = 10;
        const items = this.dataStore.getAllItems()
            .filter(item => item.iInPrisliste && Math.abs(item.prisAvvik) > AVVIK_GRENSE)
            .sort((a, b) => Math.abs(b.prisAvvik) - Math.abs(a.prisAvvik))
            .slice(0, 20);

        const statusEndringer = window.app ? window.app.checkPrislisteStatusEndringer() : [];

        const avvikHtml = items.length === 0
            ? '<p style="color:#16a34a;font-size:13px;">✅ Ingen prisavvik over 10% funnet</p>'
            : `<table style="width:100%;border-collapse:collapse;font-size:12px;">
                <thead><tr style="background:#f1f5f9;">
                    <th style="padding:6px 10px;text-align:left;">Tools nr</th>
                    <th style="padding:6px 10px;text-align:left;">Beskrivelse</th>
                    <th style="padding:6px 10px;text-align:right;">Liste innkjøp</th>
                    <th style="padding:6px 10px;text-align:right;">MV2 kalkyl</th>
                    <th style="padding:6px 10px;text-align:right;">Avvik %</th>
                </tr></thead>
                <tbody>
                    ${items.map((item, i) => {
                        const farge = item.prisAvvik > 0 ? '#fef2f2' : '#f0fdf4';
                        return `<tr style="background:${i%2===0?farge:'#ffffff'};">
                            <td style="padding:5px 10px;font-family:monospace;">${this.escapeHtml(item.toolsArticleNumber)}</td>
                            <td style="padding:5px 10px;">${this.escapeHtml((item.description||'').slice(0,35))}</td>
                            <td style="padding:5px 10px;text-align:right;">${item.prisKalkyl.toFixed(2).replace('.',',')} kr</td>
                            <td style="padding:5px 10px;text-align:right;">${item.kalkylPris.toFixed(2).replace('.',',')} kr</td>
                            <td style="padding:5px 10px;text-align:right;font-weight:700;
                                       color:${item.prisAvvik > 0 ? '#dc2626' : '#16a34a'};">
                                ${item.prisAvvik > 0 ? '+' : ''}${item.prisAvvik.toFixed(1)}%
                            </td>
                        </tr>`;
                    }).join('')}
                </tbody>
               </table>`;

        const statusHtml = statusEndringer.length === 0
            ? '<p style="color:#16a34a;font-size:13px;">✅ Ingen statusendringer siden prislisten ble satt opp</p>'
            : `<p style="color:#dc2626;font-size:13px;font-weight:600;">
                   ⚠️ ${statusEndringer.length} artikler har endret status til utgående siden prislisten ble laget
               </p>
               <ul style="font-size:12px;margin:6px 0 0 0;padding-left:18px;color:#374151;">
                   ${statusEndringer.slice(0,10).map(e =>
                       `<li>${this.escapeHtml(e.toolsNr)} — ${this.escapeHtml((e.beskrivelse||'').slice(0,35))}
                        <span style="color:#dc2626;">(${this.escapeHtml(e.vareStatus)})</span></li>`
                   ).join('')}
                   ${statusEndringer.length > 10 ? `<li style="color:#6b7280;">...og ${statusEndringer.length - 10} til</li>` : ''}
               </ul>`;

        return `
            <div style="margin-top:20px;background:#f8f9fa;border:1px solid #dee2e6;
                        border-radius:6px;padding:16px;">
                <h3 style="margin:0 0 12px 0;font-size:15px;color:#1e40af;">
                    📋 Prisliste-kontroll (FASE 9.0)
                </h3>

                <div style="margin-bottom:16px;">
                    <h4 style="font-size:13px;margin:0 0 8px 0;color:#374151;">
                        Statusendringer siden prislisten ble laget
                    </h4>
                    ${statusHtml}
                </div>

                <div>
                    <h4 style="font-size:13px;margin:0 0 8px 0;color:#374151;">
                        Prisavvik &gt; ${AVVIK_GRENSE}% (liste vs MV2) — topp 20
                    </h4>
                    ${avvikHtml}
                </div>
            </div>`;
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
