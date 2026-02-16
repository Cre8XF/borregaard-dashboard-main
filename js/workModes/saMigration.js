// ===================================
// MODUS 7: SA-MIGRERING – UTGÅENDE MED ERSTATNING
// Operativ kontrollvisning for utgående artikler med
// erstatningsartikkel og SA-migreringsstatus
// ===================================

/**
 * SAMigrationMode - Discontinued items with replacement and SA-migration status
 *
 * Data sources (all already loaded in UnifiedDataStore):
 *   - UnifiedItem: stock, bestAntLev, kalkylPris, estimertVerdi, outgoingOrders
 *   - Master.xlsx (via enrichment): Artikelstatus, Ersätts av artikel
 *   - SA-Nummer (via createFromSA): saNumber mapping
 *   - Ordrer_Jeeves (via addOutgoingOrder): sales history with dates
 *
 * Logic:
 *   1. Filter: items where isDiscontinued AND ersattAvArtikel is populated
 *   2. Resolve replacement via store.getByToolsArticleNumber / masterOnlyArticles
 *   3. Calculate quarterly sales from outgoingOrders deliveryDate
 *   4. Derive saMigrationRequired and urgencyLevel
 */
class SAMigrationMode {
    static dataStore = null;
    static searchTerm = '';
    static sortColumn = null; // null = default multi-key sort
    static sortDirection = 'desc';
    static currentFilter = 'all'; // all | highUrgency | migrationRequired | withStock

    // Quick-filter toggles (checkboxes, combinable)
    static toggleMigrationOnly = false;
    static toggleHighOnly = false;
    static toggleExposureOnly = false;
    static toggleBorregaardOnly = false;

    /**
     * Render SA-migration view
     * @param {UnifiedDataStore} store
     * @returns {string} HTML
     */
    static render(store) {
        this.dataStore = store;

        const analysis = this.analyze(store);

        console.log('=== SA-migrering – utgående med erstatning ===');
        console.log(`  Totalt utgående med erstatning: ${analysis.totalItems}`);
        console.log(`  SA-migrering påkrevd: ${analysis.migrationRequiredCount}`);
        console.log(`  Hastegrad HØY: ${analysis.highCount}`);
        console.log(`  Hastegrad MEDIUM: ${analysis.mediumCount}`);
        console.log(`  Hastegrad LAV: ${analysis.lowCount}`);

        return `
            <div class="module-header">
                <h2>SA-migrering – Utgående med erstatning</h2>
                <p class="module-description">Operativ kontroll: Utgående artikler med erstatningsartikkel og SA-migreringsstatus</p>
            </div>

            ${this.renderSummaryCards(analysis)}

            ${this.renderPrioritySection(analysis)}

            <div class="module-controls">
                <div class="filter-group">
                    <label>Filter:</label>
                    <select class="filter-select" onchange="SAMigrationMode.handleFilterChange(this.value)">
                        <option value="all" ${this.currentFilter === 'all' ? 'selected' : ''}>Alle (${analysis.totalItems})</option>
                        <option value="highUrgency" ${this.currentFilter === 'highUrgency' ? 'selected' : ''}>Hastegrad HØY (${analysis.highCount})</option>
                        <option value="migrationRequired" ${this.currentFilter === 'migrationRequired' ? 'selected' : ''}>SA-migrering påkrevd (${analysis.migrationRequiredCount})</option>
                        <option value="withStock" ${this.currentFilter === 'withStock' ? 'selected' : ''}>Med lagersaldo (${analysis.withStockCount})</option>
                    </select>
                </div>
                <div class="search-group">
                    <input type="text" class="search-input" placeholder="Søk artikkel..."
                           value="${this.searchTerm}"
                           onkeyup="SAMigrationMode.handleSearch(this.value)">
                </div>
                <button onclick="SAMigrationMode.exportCSV()" class="btn-export">Eksporter CSV</button>
            </div>

            <div class="module-controls" style="padding-top:0;gap:16px;flex-wrap:wrap;">
                <label style="cursor:pointer;"><input type="checkbox" ${this.toggleMigrationOnly ? 'checked' : ''} onchange="SAMigrationMode.handleToggle('toggleMigrationOnly', this.checked)"> Kun SA-migrering påkrevd</label>
                <label style="cursor:pointer;"><input type="checkbox" ${this.toggleHighOnly ? 'checked' : ''} onchange="SAMigrationMode.handleToggle('toggleHighOnly', this.checked)"> Kun HØY hastegrad</label>
                <label style="cursor:pointer;"><input type="checkbox" ${this.toggleExposureOnly ? 'checked' : ''} onchange="SAMigrationMode.handleToggle('toggleExposureOnly', this.checked)"> Kun eksponering &gt; 0</label>
                <label style="cursor:pointer;"><input type="checkbox" ${this.toggleBorregaardOnly ? 'checked' : ''} onchange="SAMigrationMode.handleToggle('toggleBorregaardOnly', this.checked)"> Kun 424186 (Borregaard)</label>
            </div>

            <div id="saMigrationContent">
                ${this.renderTable(analysis)}
            </div>
        `;
    }

    // ════════════════════════════════════════════════════
    //  ANALYSIS LOGIC
    // ════════════════════════════════════════════════════

    /**
     * Analyze all discontinued items that have a replacement defined
     */
    static analyze(store) {
        const items = store.getAllItems();
        const rows = [];

        let migrationRequiredCount = 0;
        let highCount = 0;
        let mediumCount = 0;
        let lowCount = 0;
        let withStockCount = 0;
        let totalEstimertVerdi = 0;

        items.forEach(item => {
            // Filter: only discontinued items
            if (!this.isDiscontinued(item)) return;

            // Filter: must have a replacement article defined (and not self-reference)
            const replacementNr = (item.ersattAvArtikel || '').trim();
            if (!replacementNr || replacementNr === item.toolsArticleNumber) return;

            // Resolve replacement article data
            const replacement = this.resolveReplacement(store, replacementNr);

            // Calculate quarterly sales from outgoing orders
            const salesData = this.calculateSales(item);

            // Derive: SA migration required
            const saMigrationRequired = !!(item.saNumber && !replacement.saNumber);

            // Derive: urgency level
            const urgencyLevel = this.calculateUrgency(item, salesData);

            // Exposure = stock + bestAntLev (total commitment)
            const oldExposure = (item.stock || 0) + (item.bestAntLev || 0);
            const replacementExposure = (replacement.stock || 0) + (replacement.bestAntLev || 0);

            const row = {
                toolsNr: item.toolsArticleNumber,
                saNumber: item.saNumber || '',
                description: item.description || '',
                stock: item.stock || 0,
                bestAntLev: item.bestAntLev || 0,
                status: this.getStatusLabel(item),
                estimertVerdi: item.estimertVerdi || 0,
                oldExposure: oldExposure,
                replacementNr: replacementNr,
                replacementDescription: replacement.description || '',
                replacementStock: replacement.stock,
                replacementBestAntLev: replacement.bestAntLev,
                replacementSaNumber: replacement.saNumber || '',
                replacementStatus: replacement.statusLabel || '',
                replacementExposure: replacementExposure,
                replacementSalesLast12m: replacement.salesLast12m || 0,
                replacementSalesLast3m: replacement.salesLast3m || 0,
                salesLast12m: salesData.salesLast12m,
                salesLast3m: salesData.salesLast3m,
                quarterlySales: salesData.quarterlySales,
                salesByDepartment: salesData.salesByDepartment || {},
                saMigrationRequired: saMigrationRequired,
                urgencyLevel: urgencyLevel,
                // Sort helper: HIGH=3, MEDIUM=2, LOW=1
                urgencySort: urgencyLevel === 'HIGH' ? 3 : urgencyLevel === 'MEDIUM' ? 2 : 1,
                recommendation: '', // set below after row creation
                _item: item
            };

            row.recommendation = this.getRecommendation(row);

            rows.push(row);

            if (saMigrationRequired) migrationRequiredCount++;
            if (urgencyLevel === 'HIGH') highCount++;
            else if (urgencyLevel === 'MEDIUM') mediumCount++;
            else lowCount++;
            if (item.stock > 0) withStockCount++;
            totalEstimertVerdi += item.estimertVerdi || 0;
        });

        // Default sort: saMigrationRequired first, then urgency desc, then exposure desc
        rows.sort((a, b) =>
            (b.saMigrationRequired ? 1 : 0) - (a.saMigrationRequired ? 1 : 0) ||
            b.urgencySort - a.urgencySort ||
            b.oldExposure - a.oldExposure
        );

        return {
            rows,
            totalItems: rows.length,
            migrationRequiredCount,
            highCount,
            mediumCount,
            lowCount,
            withStockCount,
            totalEstimertVerdi
        };
    }

    /**
     * Check if item is discontinued (UTGAENDE or UTGAATT)
     */
    static isDiscontinued(item) {
        if (item._status === 'UTGAENDE' || item._status === 'UTGAATT') return true;
        if (item.isDiscontinued) return true;
        const raw = (item.status || '').toString().toLowerCase();
        if (raw.includes('utgå') || raw.includes('discontinued') || raw.includes('avvikle')) return true;
        if (raw === '3' || raw === '4' || raw.startsWith('3 -') || raw.startsWith('4 -')) return true;
        return false;
    }

    /**
     * Resolve replacement article data from store
     * Uses existing SA lookup + masterOnlyArticles fallback.
     * Also calculates replacement sales (3m/12m) from outgoingOrders.
     */
    static resolveReplacement(store, replacementToolsNr) {
        // Try SA universe first
        const saItem = store.getByToolsArticleNumber(replacementToolsNr);
        if (saItem) {
            const replSales = this.calculateSales(saItem);
            return {
                description: saItem.description || '',
                stock: saItem.stock || 0,
                bestAntLev: saItem.bestAntLev || 0,
                saNumber: saItem.saNumber || '',
                statusLabel: this.getStatusLabel(saItem),
                isDiscontinued: saItem.isDiscontinued || false,
                salesLast12m: replSales.salesLast12m,
                salesLast3m: replSales.salesLast3m
            };
        }

        // Fallback: masterOnlyArticles (no outgoingOrders available)
        const masterData = store.masterOnlyArticles.get(replacementToolsNr);
        if (masterData) {
            return {
                description: masterData.description || '',
                stock: masterData.stock || 0,
                bestAntLev: masterData.bestAntLev || 0,
                saNumber: '',
                statusLabel: masterData.statusText || 'Ukjent',
                isDiscontinued: masterData.isDiscontinued || false,
                salesLast12m: 0,
                salesLast3m: 0
            };
        }

        // Not found anywhere
        return {
            description: '',
            stock: 0,
            bestAntLev: 0,
            saNumber: '',
            statusLabel: 'Ikke funnet',
            isDiscontinued: false,
            salesLast12m: 0,
            salesLast3m: 0
        };
    }

    /**
     * Calculate rolling sales, quarterly breakdown, and sales by department
     * from outgoing orders.
     *
     * salesByDepartment is keyed on LevPlFtgKod (deliveryLocation from Ordrer_Jeeves).
     * Each entry: { name: string, sales12m: number, sales3m: number }
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
        // Department sales keyed by LevPlFtgKod (deliveryLocation)
        const deptMap = {};

        if (!item.outgoingOrders || item.outgoingOrders.length === 0) {
            // Fallback to pre-calculated values if no raw orders available
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

            // Department key from LevPlFtgKod / Delivery location ID
            const deptKey = (order.deliveryLocation || '').toString().trim();

            if (!orderDate || isNaN(orderDate.getTime())) {
                // No valid date — count toward 12m total but not quarterly
                salesLast12m += qty;
                if (deptKey) {
                    if (!deptMap[deptKey]) deptMap[deptKey] = { name: deptKey, sales12m: 0, sales3m: 0 };
                    deptMap[deptKey].sales12m += qty;
                }
                return;
            }

            // Rolling 12 month
            if (orderDate >= oneYearAgo) {
                salesLast12m += qty;
                if (deptKey) {
                    if (!deptMap[deptKey]) deptMap[deptKey] = { name: deptKey, sales12m: 0, sales3m: 0 };
                    deptMap[deptKey].sales12m += qty;
                }
            }

            // Rolling 3 month
            if (orderDate >= threeMonthsAgo) {
                salesLast3m += qty;
                if (deptKey) {
                    if (!deptMap[deptKey]) deptMap[deptKey] = { name: deptKey, sales12m: 0, sales3m: 0 };
                    deptMap[deptKey].sales3m += qty;
                }
            }

            // Quarterly breakdown (calendar quarter of the order date)
            const month = orderDate.getMonth(); // 0-11
            if (month <= 2) quarterlySales.Q1 += qty;
            else if (month <= 5) quarterlySales.Q2 += qty;
            else if (month <= 8) quarterlySales.Q3 += qty;
            else quarterlySales.Q4 += qty;
        });

        // Round department values
        for (const key of Object.keys(deptMap)) {
            deptMap[key].sales12m = Math.round(deptMap[key].sales12m);
            deptMap[key].sales3m = Math.round(deptMap[key].sales3m);
        }

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
     * Calculate urgency level
     *   HIGH:   stock > 0 OR salesLast3m > 0
     *   MEDIUM: no stock but salesLast12m > 0
     *   LOW:    otherwise
     */
    static calculateUrgency(item, salesData) {
        if ((item.stock || 0) > 0 || salesData.salesLast3m > 0) {
            return 'HIGH';
        }
        if (salesData.salesLast12m > 0) {
            return 'MEDIUM';
        }
        return 'LOW';
    }

    /**
     * Derive recommended action text
     */
    static getRecommendation(row) {
        if (!row.saMigrationRequired) return 'Ingen handling';
        if (row.oldExposure > 0 && row.salesLast3m > 0) return 'Flytt SA nå (selger + lager)';
        if (row.oldExposure > 0) return 'Flytt SA – tøm lager';
        if (row.salesLast3m > 0) return 'Flytt SA (aktiv vare)';
        return 'Flytt SA (lav prioritet)';
    }

    /**
     * Get readable status label
     */
    static getStatusLabel(item) {
        if (item._status === 'UTGAENDE') return 'Utgående';
        if (item._status === 'UTGAATT') return 'Utgått';
        if (item._status === 'AKTIV') return 'Aktiv';
        if (item.statusText) return item.statusText;
        if (item.status) return item.status.toString();
        return 'Ukjent';
    }

    // ════════════════════════════════════════════════════
    //  RENDERING
    // ════════════════════════════════════════════════════

    static renderSummaryCards(analysis) {
        return `
            <div class="alt-analysis-summary">
                <div class="stat-card">
                    <div class="stat-value">${analysis.totalItems}</div>
                    <div class="stat-label">Utgående med erstatning</div>
                    <div class="stat-sub">Totalt identifisert</div>
                </div>
                <div class="stat-card critical">
                    <div class="stat-value">${analysis.highCount}</div>
                    <div class="stat-label">Hastegrad HØY</div>
                    <div class="stat-sub">Lager eller nylig salg</div>
                </div>
                <div class="stat-card warning">
                    <div class="stat-value">${analysis.migrationRequiredCount}</div>
                    <div class="stat-label">SA-migrering påkrevd</div>
                    <div class="stat-sub">Erstatning mangler SA</div>
                </div>
                <div class="stat-card">
                    <div class="stat-value">${this.formatNumber(Math.round(analysis.totalEstimertVerdi))} kr</div>
                    <div class="stat-label">Estimert verdi</div>
                    <div class="stat-sub">Kapitalbinding i utgående</div>
                </div>
                <div class="stat-card ${analysis.withStockCount > 0 ? 'warning' : 'ok'}">
                    <div class="stat-value">${analysis.withStockCount}</div>
                    <div class="stat-label">Med lagersaldo</div>
                    <div class="stat-sub">Fysisk lager på utgående</div>
                </div>
            </div>
        `;
    }

    static renderPrioritySection(analysis) {
        const priorityRows = analysis.rows
            .filter(r => r.saMigrationRequired && r.urgencyLevel === 'HIGH')
            .sort((a, b) => b.oldExposure - a.oldExposure)
            .slice(0, 10);

        if (priorityRows.length === 0) return '';

        return `
            <div style="margin-bottom:16px;border:2px solid #d32f2f;border-radius:6px;padding:12px 16px;background:#fff5f5;">
                <h3 style="margin:0 0 8px 0;color:#d32f2f;font-size:15px;">\u{1F534} M\u00e5 tas n\u00e5 (${priorityRows.length})</h3>
                <table class="data-table compact" style="margin:0;">
                    <thead>
                        <tr>
                            <th>Tools Nr</th>
                            <th>Lager</th>
                            <th>Salg 3m</th>
                            <th>Erst. Lager</th>
                            <th>Anbefalt handling</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${priorityRows.map(r => `
                            <tr>
                                <td><strong>${this.escapeHtml(r.toolsNr)}</strong></td>
                                <td class="qty-cell">${this.formatNumber(r.stock)}</td>
                                <td class="qty-cell">${this.formatNumber(r.salesLast3m)}</td>
                                <td class="qty-cell">${this.formatNumber(r.replacementStock)}</td>
                                <td>${this.escapeHtml(r.recommendation)}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        `;
    }

    static renderTable(analysis) {
        let filtered = this.filterResults(analysis.rows);
        filtered = this.sortResults(filtered);

        if (filtered.length === 0) {
            return `<div class="alert alert-info">Ingen utgående artikler med erstatning funnet med gjeldende filter.</div>`;
        }

        return `
            <div class="table-wrapper">
                <table class="data-table compact alt-analysis-table">
                    <thead>
                        <tr>
                            ${this.renderSortableHeader('Tools Nr', 'toolsNr')}
                            ${this.renderSortableHeader('SA', 'saNumber')}
                            ${this.renderSortableHeader('Saldo', 'stock', 'Lagersaldo (TotLagSaldo)')}
                            ${this.renderSortableHeader('Innkommende', 'bestAntLev', 'Bestilt antall leverandør')}
                            ${this.renderSortableHeader('Eksponering (lager + innkjøp)', 'oldExposure', 'Totaleksponering = lagersaldo + innkommende bestillinger')}
                            ${this.renderSortableHeader('Status', 'status')}
                            ${this.renderSortableHeader('Erstatning', 'replacementNr')}
                            ${this.renderSortableHeader('Erst. SA', 'replacementSaNumber', 'SA-nummer for erstatningsartikkel. «Mangler» betyr at erstatningen ikke har SA-nummer og SA-migrering er påkrevd.')}
                            ${this.renderSortableHeader('Erst. saldo', 'replacementStock')}
                            ${this.renderSortableHeader('Erst. innk.', 'replacementBestAntLev')}
                            ${this.renderSortableHeader('Erst. eksp.', 'replacementExposure', 'Erstatning totaleksponering = saldo + innkommende')}
                            ${this.renderSortableHeader('Salg 12m', 'salesLast12m', 'Utgående ordrer siste 12 måneder')}
                            ${this.renderSortableHeader('Salg 3m', 'salesLast3m', 'Utgående ordrer siste 3 måneder')}
                            ${this.renderSortableHeader('Erst. salg 12m', 'replacementSalesLast12m')}
                            ${this.renderSortableHeader('Erst. salg 3m', 'replacementSalesLast3m')}
                            ${this.renderSortableHeader('Hastegrad', 'urgencySort')}
                            ${this.renderSortableHeader('SA-migr.', 'saMigrationRequired')}
                            ${this.renderSortableHeader('Anbefalt handling', 'recommendation')}
                        </tr>
                    </thead>
                    <tbody>
                        ${filtered.map(row => this.renderRow(row)).join('')}
                    </tbody>
                </table>
            </div>
            <div class="table-footer">
                <p class="text-muted">Viser ${filtered.length} av ${analysis.totalItems} rader | Kvartalssalg: Q1=${this.sumField(filtered, 'Q1')}, Q2=${this.sumField(filtered, 'Q2')}, Q3=${this.sumField(filtered, 'Q3')}, Q4=${this.sumField(filtered, 'Q4')}</p>
            </div>
        `;
    }

    static renderRow(row) {
        const rowClass = row.urgencyLevel === 'HIGH' ? 'row-critical' :
                         row.urgencyLevel === 'MEDIUM' ? 'row-warning' : '';

        // Build department tooltip from salesByDepartment
        const deptKeys = Object.keys(row.salesByDepartment || {});
        const deptTooltip = deptKeys.length > 0
            ? deptKeys.map(k => `${k}: 12m=${row.salesByDepartment[k].sales12m}, 3m=${row.salesByDepartment[k].sales3m}`).join(' | ')
            : '';
        const hoverTitle = `Q1: ${row.quarterlySales.Q1} | Q2: ${row.quarterlySales.Q2} | Q3: ${row.quarterlySales.Q3} | Q4: ${row.quarterlySales.Q4}${deptTooltip ? ' || Dept: ' + deptTooltip : ''}`;

        return `
            <tr class="${rowClass}" title="${this.escapeHtml(hoverTitle)}">
                <td><strong>${this.escapeHtml(row.toolsNr)}</strong></td>
                <td>${this.escapeHtml(row.saNumber)}</td>
                <td class="qty-cell">${this.formatNumber(row.stock)}</td>
                <td class="qty-cell">${row.bestAntLev > 0 ? this.formatNumber(row.bestAntLev) : '-'}</td>
                <td class="qty-cell">${this.formatNumber(row.oldExposure)}</td>
                <td>${this.renderStatusBadge(row.status)}</td>
                <td><strong>${this.escapeHtml(row.replacementNr)}</strong></td>
                <td>${row.replacementSaNumber ? this.escapeHtml(row.replacementSaNumber) : '<span class="badge badge-warning">Mangler</span>'}</td>
                <td class="qty-cell">${this.formatNumber(row.replacementStock)}</td>
                <td class="qty-cell">${row.replacementBestAntLev > 0 ? this.formatNumber(row.replacementBestAntLev) : '-'}</td>
                <td class="qty-cell">${this.formatNumber(row.replacementExposure)}</td>
                <td class="qty-cell">${this.formatNumber(row.salesLast12m)}</td>
                <td class="qty-cell">${this.formatNumber(row.salesLast3m)}</td>
                <td class="qty-cell">${this.formatNumber(row.replacementSalesLast12m)}</td>
                <td class="qty-cell">${this.formatNumber(row.replacementSalesLast3m)}</td>
                <td>${this.renderUrgencyBadge(row.urgencyLevel)}</td>
                <td>${row.saMigrationRequired ? '<span class="badge badge-critical">JA</span>' : '<span class="badge badge-ok">Nei</span>'}</td>
                <td>${this.renderRecommendationBadge(row.recommendation)}</td>
            </tr>
        `;
    }

    static renderStatusBadge(status) {
        const lower = (status || '').toLowerCase();
        if (lower.includes('utgått') || lower === 'utgått') {
            return `<span class="badge badge-critical">${this.escapeHtml(status)}</span>`;
        }
        if (lower.includes('utgå') || lower.includes('discontinued')) {
            return `<span class="badge badge-warning">${this.escapeHtml(status)}</span>`;
        }
        if (lower.includes('aktiv')) {
            return `<span class="badge badge-ok">${this.escapeHtml(status)}</span>`;
        }
        return `<span class="badge badge-info">${this.escapeHtml(status)}</span>`;
    }

    static renderUrgencyBadge(level) {
        if (level === 'HIGH') return '<span class="badge badge-critical" style="color:#d32f2f;font-weight:bold;">HØY</span>';
        if (level === 'MEDIUM') return '<span class="badge badge-warning" style="color:#e65100;font-weight:bold;">MEDIUM</span>';
        return '<span class="badge badge-ok" style="color:#9e9e9e;">LAV</span>';
    }

    static renderRecommendationBadge(rec) {
        if (rec === 'Ingen handling') return `<span style="color:#9e9e9e;">${rec}</span>`;
        if (rec.startsWith('Flytt SA nå')) return `<span style="color:#d32f2f;font-weight:bold;">${this.escapeHtml(rec)}</span>`;
        if (rec.includes('tøm lager')) return `<span style="color:#e65100;font-weight:bold;">${this.escapeHtml(rec)}</span>`;
        return `<span style="color:#1565c0;">${this.escapeHtml(rec)}</span>`;
    }

    static renderSortableHeader(label, key, tooltip) {
        const indicator = this.sortColumn === key
            ? (this.sortDirection === 'asc' ? ' &#9650;' : ' &#9660;')
            : '';
        const titleAttr = tooltip ? ` title="${this.escapeHtml(tooltip)}"` : '';
        return `<th class="sortable-header"${titleAttr} onclick="SAMigrationMode.handleSort('${key}')">${label}${indicator}</th>`;
    }

    // ════════════════════════════════════════════════════
    //  FILTERING & SORTING
    // ════════════════════════════════════════════════════

    static filterResults(rows) {
        let filtered = rows;

        // Dropdown filter
        switch (this.currentFilter) {
            case 'highUrgency':
                filtered = filtered.filter(r => r.urgencyLevel === 'HIGH');
                break;
            case 'migrationRequired':
                filtered = filtered.filter(r => r.saMigrationRequired);
                break;
            case 'withStock':
                filtered = filtered.filter(r => r.stock > 0);
                break;
        }

        // Quick-filter toggles (combinable)
        if (this.toggleMigrationOnly) {
            filtered = filtered.filter(r => r.saMigrationRequired);
        }
        if (this.toggleHighOnly) {
            filtered = filtered.filter(r => r.urgencyLevel === 'HIGH');
        }
        if (this.toggleExposureOnly) {
            filtered = filtered.filter(r => r.oldExposure > 0);
        }
        if (this.toggleBorregaardOnly) {
            filtered = filtered.filter(r => {
                const dept = r.salesByDepartment || {};
                return Object.keys(dept).some(k => k.startsWith('424186'));
            });
        }

        // Text search
        if (this.searchTerm) {
            const term = this.searchTerm.toLowerCase();
            filtered = filtered.filter(r =>
                r.toolsNr.toLowerCase().includes(term) ||
                r.saNumber.toLowerCase().includes(term) ||
                r.description.toLowerCase().includes(term) ||
                r.replacementNr.toLowerCase().includes(term) ||
                r.replacementSaNumber.toLowerCase().includes(term) ||
                r.replacementDescription.toLowerCase().includes(term)
            );
        }

        return filtered;
    }

    static sortResults(rows) {
        // No explicit column → use default multi-key sort
        if (!this.sortColumn) {
            return [...rows].sort((a, b) =>
                (b.saMigrationRequired ? 1 : 0) - (a.saMigrationRequired ? 1 : 0) ||
                b.urgencySort - a.urgencySort ||
                b.oldExposure - a.oldExposure
            );
        }

        const col = this.sortColumn;
        const dir = this.sortDirection === 'asc' ? 1 : -1;

        return [...rows].sort((a, b) => {
            let aVal = a[col];
            let bVal = b[col];

            if (aVal == null) aVal = '';
            if (bVal == null) bVal = '';

            if (typeof aVal === 'boolean') {
                return ((aVal ? 1 : 0) - (bVal ? 1 : 0)) * dir;
            }
            if (typeof aVal === 'number' && typeof bVal === 'number') {
                return (aVal - bVal) * dir;
            }
            return String(aVal).localeCompare(String(bVal), 'nb-NO') * dir;
        });
    }

    // ════════════════════════════════════════════════════
    //  EVENT HANDLERS
    // ════════════════════════════════════════════════════

    static handleFilterChange(filter) {
        this.currentFilter = filter;
        this.refreshAll();
    }

    static handleSearch(term) {
        this.searchTerm = term;
        this.refreshAll();
    }

    static handleSort(column) {
        if (this.sortColumn === column) {
            // Third click on same column → reset to default multi-key sort
            if (this.sortDirection === 'desc') {
                this.sortColumn = null;
                this.sortDirection = 'desc';
            } else {
                this.sortDirection = 'desc';
            }
        } else {
            this.sortColumn = column;
            this.sortDirection = column === 'urgencySort' || column === 'saMigrationRequired' ? 'desc' : 'asc';
        }
        this.refreshAll();
    }

    static handleToggle(prop, checked) {
        this[prop] = checked;
        this.refreshAll();
    }

    static refreshAll() {
        const moduleContent = document.getElementById('moduleContent');
        if (moduleContent && this.dataStore) {
            moduleContent.innerHTML = this.render(this.dataStore);
        }
    }

    // ════════════════════════════════════════════════════
    //  CSV EXPORT
    // ════════════════════════════════════════════════════

    static exportCSV() {
        const analysis = this.analyze(this.dataStore);
        let filtered = this.filterResults(analysis.rows);
        filtered = this.sortResults(filtered);

        // Collect all unique department keys across all rows for CSV columns
        const allDeptKeys = new Set();
        filtered.forEach(r => {
            Object.keys(r.salesByDepartment || {}).forEach(k => allDeptKeys.add(k));
        });
        const deptKeysSorted = Array.from(allDeptKeys).sort();

        const headers = [
            'Tools Nr',
            'SA-nummer',
            'Beskrivelse',
            'Saldo',
            'Innkommende',
            'Eksponering',
            'Status',
            'Estimert verdi',
            'Erstatning Nr',
            'Erstatning Beskrivelse',
            'Erstatning SA',
            'Erstatning Saldo',
            'Erstatning Innkommende',
            'Erstatning Eksponering',
            'Erstatning Status',
            'Salg 12m',
            'Salg 3m',
            'Erstatning Salg 12m',
            'Erstatning Salg 3m',
            'Q1',
            'Q2',
            'Q3',
            'Q4',
            'Hastegrad',
            'SA-migrering påkrevd',
            'Anbefalt handling',
            // Dynamic department columns
            ...deptKeysSorted.map(k => `Dept ${k} 12m`),
            ...deptKeysSorted.map(k => `Dept ${k} 3m`)
        ];

        const rows = filtered.map(r => {
            const base = [
                r.toolsNr,
                r.saNumber,
                `"${(r.description || '').replace(/"/g, '""')}"`,
                r.stock,
                r.bestAntLev,
                r.oldExposure,
                r.status,
                Math.round(r.estimertVerdi),
                r.replacementNr,
                `"${(r.replacementDescription || '').replace(/"/g, '""')}"`,
                r.replacementSaNumber,
                r.replacementStock,
                r.replacementBestAntLev,
                r.replacementExposure,
                r.replacementStatus,
                r.salesLast12m,
                r.salesLast3m,
                r.replacementSalesLast12m,
                r.replacementSalesLast3m,
                r.quarterlySales.Q1,
                r.quarterlySales.Q2,
                r.quarterlySales.Q3,
                r.quarterlySales.Q4,
                r.urgencyLevel,
                r.saMigrationRequired ? 'JA' : 'NEI',
                `"${r.recommendation}"`
            ];
            // Append department 12m values
            deptKeysSorted.forEach(k => {
                base.push((r.salesByDepartment[k] || {}).sales12m || 0);
            });
            // Append department 3m values
            deptKeysSorted.forEach(k => {
                base.push((r.salesByDepartment[k] || {}).sales3m || 0);
            });
            return base;
        });

        const csv = [headers.join(';'), ...rows.map(r => r.join(';'))].join('\n');
        const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `sa-migrering-${new Date().toISOString().split('T')[0]}.csv`;
        a.click();
        URL.revokeObjectURL(url);
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

    static sumField(rows, quarter) {
        return this.formatNumber(rows.reduce((sum, r) => sum + (r.quarterlySales[quarter] || 0), 0));
    }
}

// Eksporter til global scope
window.SAMigrationMode = SAMigrationMode;
