// ===================================
// MODUS 8: RAPPORTER – KVARTALSRAPPORT MED AVDELINGSFILTER
// Multi-customer quarterly Excel export
// ===================================

class ReportsMode {
    static dataStore = null;
    static selectedDepartments = new Set();
    static lastReport = null;
    static generating = false;

    /**
     * Render the reports view
     * @param {UnifiedDataStore} store
     * @returns {string} HTML
     */
    static render(store) {
        this.dataStore = store;

        const departments = this.collectDepartments(store);

        return `
            <div class="module-header">
                <h2>Kvartalsrapport</h2>
                <p class="module-description">Generer kvartalsrapport med avdelingsfilter. Velg en eller flere avdelinger og eksporter til Excel.</p>
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
                <div style="margin-top:12px;">
                    <button onclick="ReportsMode.generateReport()"
                            class="btn-export"
                            ${departments.length === 0 ? 'disabled' : ''}
                            style="font-size:14px;padding:8px 20px;">
                        📊 Generer kvartalsrapport
                    </button>
                    <span id="reportStatus" style="margin-left:12px;font-size:13px;color:#666;"></span>
                </div>
            </div>

            ${this.lastReport ? this.renderReportPreview(this.lastReport) : ''}
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
        const quarterlySales = { Q1: 0, Q2: 0, Q3: 0, Q4: 0 };
        const deptMap = {};

        if (!item.outgoingOrders || item.outgoingOrders.length === 0) {
            return {
                salesLast12m: item.sales12m || 0,
                salesLast3m: item.sales6m ? Math.round(item.sales6m / 2) : 0,
                quarterlySales,
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
                if (deptKey) {
                    if (!deptMap[deptKey]) deptMap[deptKey] = { sales12m: 0, sales3m: 0 };
                    deptMap[deptKey].sales12m += qty;
                }
                return;
            }

            if (orderDate >= oneYearAgo) {
                salesLast12m += qty;
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

            const month = orderDate.getMonth();
            if (month <= 2) quarterlySales.Q1 += qty;
            else if (month <= 5) quarterlySales.Q2 += qty;
            else if (month <= 8) quarterlySales.Q3 += qty;
            else quarterlySales.Q4 += qty;
        });

        return {
            salesLast12m: Math.round(salesLast12m),
            salesLast3m: Math.round(salesLast3m),
            quarterlySales: {
                Q1: Math.round(quarterlySales.Q1),
                Q2: Math.round(quarterlySales.Q2),
                Q3: Math.round(quarterlySales.Q3),
                Q4: Math.round(quarterlySales.Q4)
            },
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

            rows.push({
                toolsNr: item.toolsArticleNumber,
                saNumber: item.saNumber || '',
                description: item.description || '',
                stock: item.stock || 0,
                bestAntLev: item.bestAntLev || 0,
                exposure,
                estimertVerdi: item.estimertVerdi || 0,
                kalkylPris: item.kalkylPris || 0,
                salesLast12m: salesData.salesLast12m,
                salesLast3m: salesData.salesLast3m,
                deptSales12m: Math.round(deptSales12m),
                deptSales3m: Math.round(deptSales3m),
                quarterlySales: salesData.quarterlySales,
                salesByDepartment: deptSales,
                discontinued,
                status: item._status || 'UKJENT',
                replacementNr: replacementNr || '',
                saMigrationRequired: !!saMigrationRequired,
                _item: item
            });
        });

        // Current quarter
        const currentQ = 'Q' + (Math.floor(new Date().getMonth() / 3) + 1);

        // A) Summary
        const summary = {
            totalSales12m: rows.reduce((s, r) => s + r.salesLast12m, 0),
            totalSales3m: rows.reduce((s, r) => s + r.salesLast3m, 0),
            currentQuarterSales: rows.reduce((s, r) => s + (r.quarterlySales[currentQ] || 0), 0),
            currentQuarter: currentQ,
            activeCount: rows.filter(r => !r.discontinued).length,
            discontinuedCount: rows.filter(r => r.discontinued).length,
            saMigrationCount: rows.filter(r => r.saMigrationRequired).length,
            totalExposure: rows.reduce((s, r) => s + r.exposure, 0),
            totalEstimertVerdi: rows.reduce((s, r) => s + r.estimertVerdi, 0),
            totalItems: rows.length,
            selectedDepartments: Array.from(selectedDepts).sort().join(', ')
        };

        // B) Top 20 by salesLast12m
        const top20 = [...rows].sort((a, b) => b.salesLast12m - a.salesLast12m).slice(0, 20);

        // C) Risk list: discontinued + (exposure > 0 OR salesLast3m > 0)
        const riskList = rows
            .filter(r => r.discontinued && (r.exposure > 0 || r.salesLast3m > 0))
            .sort((a, b) => b.exposure - a.exposure);

        // D) Department summary
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

        // E) Opportunities: items selling OUTSIDE selected depts but low/no sales inside
        const opportunities = rows.filter(r => {
            // Has sales outside selected depts
            const outsideSales = r.salesLast12m - r.deptSales12m;
            // Low inside sales = less than 10% of total
            return outsideSales > 0 && r.deptSales12m < r.salesLast12m * 0.1 && r.salesLast12m > 0;
        }).sort((a, b) => b.salesLast12m - a.salesLast12m).slice(0, 50);

        const report = { summary, top20, riskList, deptSummary, opportunities, rows };
        this.lastReport = report;

        // Generate Excel
        this.exportExcel(report);

        if (statusEl) statusEl.textContent = `Rapport generert med ${rows.length} artikler.`;

        // Re-render to show preview
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
    //  EXCEL EXPORT (SheetJS / XLSX)
    // ════════════════════════════════════════════════════

    static exportExcel(report) {
        if (typeof XLSX === 'undefined') {
            alert('XLSX-biblioteket er ikke lastet. Kan ikke eksportere.');
            return;
        }

        const wb = XLSX.utils.book_new();

        // Sheet 1: Sammendrag
        this.addSummarySheet(wb, report.summary);

        // Sheet 2: Topp 20
        this.addTop20Sheet(wb, report.top20);

        // Sheet 3: Risiko
        this.addRiskSheet(wb, report.riskList);

        // Sheet 4: Avdelingsfordeling
        this.addDeptSheet(wb, report.deptSummary);

        // Sheet 5: Muligheter
        this.addOpportunitiesSheet(wb, report.opportunities);

        // Generate filename: Kvartalsrapport_YYYY_QX.xlsx
        const now = new Date();
        const year = now.getFullYear();
        const quarter = 'Q' + (Math.floor(now.getMonth() / 3) + 1);
        const filename = `Kvartalsrapport_${year}_${quarter}.xlsx`;

        XLSX.writeFile(wb, filename);
    }

    static addSummarySheet(wb, summary) {
        const data = [
            ['Kvartalsrapport - Sammendrag'],
            ['Generert', new Date().toISOString().split('T')[0]],
            ['Valgte avdelinger', summary.selectedDepartments],
            [],
            ['Nøkkeltall', 'Verdi'],
            ['Totalt artikler i utvalg', summary.totalItems],
            ['Aktive artikler', summary.activeCount],
            ['Utgående artikler', summary.discontinuedCount],
            ['SA-migrering påkrevd', summary.saMigrationCount],
            [],
            ['Salg', 'Antall'],
            ['Total salg 12m', Math.round(summary.totalSales12m)],
            ['Total salg 3m', Math.round(summary.totalSales3m)],
            [`Salg ${summary.currentQuarter} (inneværende)`, Math.round(summary.currentQuarterSales)],
            [],
            ['Eksponering', 'Verdi'],
            ['Total eksponering (lager + innkjøp)', Math.round(summary.totalExposure)],
            ['Estimert verdi (NOK)', Math.round(summary.totalEstimertVerdi)]
        ];

        const ws = XLSX.utils.aoa_to_sheet(data);
        // Widen columns
        ws['!cols'] = [{ wch: 35 }, { wch: 30 }];
        XLSX.utils.book_append_sheet(wb, ws, 'Sammendrag');
    }

    static addTop20Sheet(wb, top20) {
        const headers = ['#', 'Tools Nr', 'SA-nummer', 'Beskrivelse', 'Saldo', 'Salg 12m', 'Salg 3m', 'Avd. salg 12m', 'Avd. salg 3m', 'Eksponering', 'Estimert verdi', 'Status'];
        const data = [headers];

        top20.forEach((r, i) => {
            data.push([
                i + 1,
                r.toolsNr,
                r.saNumber,
                r.description,
                r.stock,
                r.salesLast12m,
                r.salesLast3m,
                r.deptSales12m,
                r.deptSales3m,
                r.exposure,
                Math.round(r.estimertVerdi),
                r.status
            ]);
        });

        const ws = XLSX.utils.aoa_to_sheet(data);
        ws['!cols'] = [
            { wch: 4 }, { wch: 16 }, { wch: 14 }, { wch: 40 },
            { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 14 },
            { wch: 14 }, { wch: 12 }, { wch: 14 }, { wch: 12 }
        ];
        XLSX.utils.book_append_sheet(wb, ws, 'Topp 20');
    }

    static addRiskSheet(wb, riskList) {
        const headers = ['Tools Nr', 'SA-nummer', 'Beskrivelse', 'Status', 'Saldo', 'Innkommende', 'Eksponering', 'Salg 3m', 'Salg 12m', 'Erstatning', 'SA-migr. påkrevd'];
        const data = [headers];

        riskList.forEach(r => {
            data.push([
                r.toolsNr,
                r.saNumber,
                r.description,
                r.status,
                r.stock,
                r.bestAntLev,
                r.exposure,
                r.salesLast3m,
                r.salesLast12m,
                r.replacementNr,
                r.saMigrationRequired ? 'JA' : 'NEI'
            ]);
        });

        const ws = XLSX.utils.aoa_to_sheet(data);
        ws['!cols'] = [
            { wch: 16 }, { wch: 14 }, { wch: 40 }, { wch: 12 },
            { wch: 10 }, { wch: 12 }, { wch: 12 }, { wch: 10 },
            { wch: 10 }, { wch: 16 }, { wch: 14 }
        ];
        XLSX.utils.book_append_sheet(wb, ws, 'Risiko');
    }

    static addDeptSheet(wb, deptSummary) {
        const headers = ['Avdeling', 'Artikler', 'Salg 12m', 'Salg 3m'];
        const data = [headers];

        const depts = Object.keys(deptSummary).sort();
        let totalItems = 0, total12m = 0, total3m = 0;

        depts.forEach(dept => {
            const d = deptSummary[dept];
            data.push([dept, d.itemCount, Math.round(d.sales12m), Math.round(d.sales3m)]);
            totalItems += d.itemCount;
            total12m += d.sales12m;
            total3m += d.sales3m;
        });

        data.push([]);
        data.push(['TOTALT', totalItems, Math.round(total12m), Math.round(total3m)]);

        const ws = XLSX.utils.aoa_to_sheet(data);
        ws['!cols'] = [{ wch: 20 }, { wch: 10 }, { wch: 12 }, { wch: 12 }];
        XLSX.utils.book_append_sheet(wb, ws, 'Avdelingsfordeling');
    }

    static addOpportunitiesSheet(wb, opportunities) {
        const headers = ['Tools Nr', 'SA-nummer', 'Beskrivelse', 'Total salg 12m', 'Avd. salg 12m', 'Salg utenfor avd.', 'Andel utenfor', 'Status'];
        const data = [headers];

        opportunities.forEach(r => {
            const outsideSales = r.salesLast12m - r.deptSales12m;
            const pct = r.salesLast12m > 0 ? Math.round((outsideSales / r.salesLast12m) * 100) : 0;
            data.push([
                r.toolsNr,
                r.saNumber,
                r.description,
                r.salesLast12m,
                r.deptSales12m,
                outsideSales,
                pct + '%',
                r.status
            ]);
        });

        const ws = XLSX.utils.aoa_to_sheet(data);
        ws['!cols'] = [
            { wch: 16 }, { wch: 14 }, { wch: 40 }, { wch: 14 },
            { wch: 14 }, { wch: 16 }, { wch: 12 }, { wch: 12 }
        ];
        XLSX.utils.book_append_sheet(wb, ws, 'Muligheter');
    }

    // ════════════════════════════════════════════════════
    //  REPORT PREVIEW (shown after generation)
    // ════════════════════════════════════════════════════

    static renderReportPreview(report) {
        const s = report.summary;
        return `
            <div style="border:1px solid #dee2e6;border-radius:6px;padding:16px;margin-bottom:16px;">
                <h3 style="margin:0 0 12px 0;font-size:15px;">Siste rapport – ${s.selectedDepartments}</h3>
                <div class="alt-analysis-summary">
                    <div class="stat-card">
                        <div class="stat-value">${this.formatNumber(s.totalItems)}</div>
                        <div class="stat-label">Artikler</div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-value">${this.formatNumber(Math.round(s.totalSales12m))}</div>
                        <div class="stat-label">Salg 12m</div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-value">${this.formatNumber(Math.round(s.totalSales3m))}</div>
                        <div class="stat-label">Salg 3m</div>
                    </div>
                    <div class="stat-card ${s.discontinuedCount > 0 ? 'warning' : ''}">
                        <div class="stat-value">${s.discontinuedCount}</div>
                        <div class="stat-label">Utgående</div>
                    </div>
                    <div class="stat-card ${s.saMigrationCount > 0 ? 'critical' : ''}">
                        <div class="stat-value">${s.saMigrationCount}</div>
                        <div class="stat-label">SA-migr. påkrevd</div>
                    </div>
                </div>

                <div style="margin-top:12px;">
                    <strong style="font-size:13px;">Risikoliste:</strong>
                    <span style="font-size:13px;color:#666;">${report.riskList.length} utgående artikler med eksponering eller nylig salg</span>
                </div>
                <div style="margin-top:4px;">
                    <strong style="font-size:13px;">Muligheter:</strong>
                    <span style="font-size:13px;color:#666;">${report.opportunities.length} artikler med salg primært utenfor valgte avdelinger</span>
                </div>

                ${Object.keys(report.deptSummary).length > 0 ? `
                    <div style="margin-top:12px;">
                        <strong style="font-size:13px;">Avdelingsfordeling:</strong>
                        <table class="data-table compact" style="margin-top:6px;font-size:13px;">
                            <thead>
                                <tr><th>Avdeling</th><th>Artikler</th><th>Salg 12m</th><th>Salg 3m</th></tr>
                            </thead>
                            <tbody>
                                ${Object.keys(report.deptSummary).sort().map(dept => {
                                    const d = report.deptSummary[dept];
                                    return `<tr>
                                        <td>${this.escapeHtml(dept)}</td>
                                        <td class="qty-cell">${d.itemCount}</td>
                                        <td class="qty-cell">${this.formatNumber(Math.round(d.sales12m))}</td>
                                        <td class="qty-cell">${this.formatNumber(Math.round(d.sales3m))}</td>
                                    </tr>`;
                                }).join('')}
                            </tbody>
                        </table>
                    </div>
                ` : ''}
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
