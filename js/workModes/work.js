// ===================================
// MODUS: ARBEID – OPERATIV KONTROLL
// Samler operativ funksjonalitet i én fane
// Sub-tabs: SA-migrering, Lager uten SA, Utgående, Død lager
// ===================================

class WorkMode {
    static dataStore = null;
    static currentSubTab = 'saMigration';

    // Sub-tab for Utgående / Død lager
    static searchTerm = '';
    static sortColumn = null;
    static sortDirection = 'desc';

    /**
     * Render Arbeid module
     * @param {UnifiedDataStore} store
     * @returns {string} HTML
     */
    static render(store) {
        this.dataStore = store;

        const stats = this.computeStats(store);

        return `
            <div class="module-header">
                <h2>Arbeid – Operativ kontroll</h2>
                <p class="module-description">Samlet operativ oversikt: SA-migrering, lager uten SA, utgående artikler og død lager</p>
            </div>

            ${this.renderStatCards(stats)}

            <div class="view-tabs" style="margin-bottom:0;">
                <button class="view-tab ${this.currentSubTab === 'saMigration' ? 'active' : ''}"
                        onclick="WorkMode.switchSubTab('saMigration')">
                    SA-migrering (${stats.saMigrationHigh})
                </button>
                <button class="view-tab ${this.currentSubTab === 'noSa' ? 'active' : ''}"
                        onclick="WorkMode.switchSubTab('noSa')">
                    Lager uten SA (${stats.noSaWithStock})
                </button>
                <button class="view-tab ${this.currentSubTab === 'outgoing' ? 'active' : ''}"
                        onclick="WorkMode.switchSubTab('outgoing')">
                    Utgående (${stats.discontinuedWithStock})
                </button>
                <button class="view-tab ${this.currentSubTab === 'deadStock' ? 'active' : ''}"
                        onclick="WorkMode.switchSubTab('deadStock')">
                    Død lager (${stats.deadStockCount})
                </button>
            </div>

            <div id="workSubContent">
                ${this.renderSubTab(store)}
            </div>
        `;
    }

    // ════════════════════════════════════════════════════
    //  STAT CARDS
    // ════════════════════════════════════════════════════

    static computeStats(store) {
        const items = store.getAllItems();
        let saMigrationHigh = 0;
        let discontinuedWithStock = 0;
        let deadStockCount = 0;
        let noMovement12m = 0;

        items.forEach(item => {
            const isDisc = this.isDiscontinued(item);
            const stock = item.stock || 0;
            const sales12m = item.sales12m || 0;

            if (isDisc && stock > 0) discontinuedWithStock++;
            if (stock > 0 && sales12m === 0) deadStockCount++;
            if (stock === 0 && sales12m === 0 && !item.hasOutgoingOrders) noMovement12m++;

            // SA-migration HIGH count (discontinued + replacement + no SA on replacement)
            if (isDisc) {
                const replNr = (item.ersattAvArtikel || '').trim();
                if (replNr && replNr !== item.toolsArticleNumber && item.saNumber) {
                    const replItem = store.getByToolsArticleNumber(replNr);
                    const replSa = replItem ? replItem.saNumber : '';
                    if (!replSa) {
                        // Check urgency = HIGH (stock > 0 or recent sales)
                        const hasSales3m = this.hasRecentSales(item);
                        if (stock > 0 || hasSales3m) saMigrationHigh++;
                    }
                }
            }
        });

        // Lager uten SA
        const noSaData = store.getArticlesWithoutSA();
        const noSaWithStock = noSaData.withStock ? noSaData.withStock.length : 0;

        return { saMigrationHigh, noSaWithStock, discontinuedWithStock, deadStockCount, noMovement12m };
    }

    /**
     * Quick check for recent sales (3m) without full calculateSales
     */
    static hasRecentSales(item) {
        if (!item.outgoingOrders || item.outgoingOrders.length === 0) return false;
        const threeMonthsAgo = new Date();
        threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
        return item.outgoingOrders.some(o => {
            if (o.quantity <= 0) return false;
            const d = o.deliveryDate instanceof Date ? o.deliveryDate :
                      o.deliveryDate ? new Date(o.deliveryDate) : null;
            return d && !isNaN(d.getTime()) && d >= threeMonthsAgo;
        });
    }

    static isDiscontinued(item) {
        if (item._status === 'UTGAENDE' || item._status === 'UTGAATT') return true;
        if (item.isDiscontinued) return true;
        const raw = (item.status || '').toString().toLowerCase();
        if (raw.includes('utgå') || raw.includes('discontinued') || raw.includes('avvikle')) return true;
        if (raw === '3' || raw === '4' || raw.startsWith('3 -') || raw.startsWith('4 -')) return true;
        return false;
    }

    static renderStatCards(stats) {
        return `
            <div class="alt-analysis-summary">
                <div class="stat-card critical">
                    <div class="stat-value">${stats.saMigrationHigh}</div>
                    <div class="stat-label">SA-migr. HØY</div>
                    <div class="stat-sub">Påkrevd + hastegrad HØY</div>
                </div>
                <div class="stat-card ${stats.noSaWithStock > 0 ? 'warning' : 'ok'}">
                    <div class="stat-value">${stats.noSaWithStock}</div>
                    <div class="stat-label">Lager uten SA</div>
                    <div class="stat-sub">Fysisk lager &gt; 0</div>
                </div>
                <div class="stat-card ${stats.discontinuedWithStock > 0 ? 'warning' : ''}">
                    <div class="stat-value">${stats.discontinuedWithStock}</div>
                    <div class="stat-label">Utgående m/saldo</div>
                    <div class="stat-sub">Utgående med lager</div>
                </div>
                <div class="stat-card ${stats.deadStockCount > 0 ? 'warning' : ''}">
                    <div class="stat-value">${stats.deadStockCount}</div>
                    <div class="stat-label">Død lager</div>
                    <div class="stat-sub">Lager uten salg 12m</div>
                </div>
                <div class="stat-card">
                    <div class="stat-value">${stats.noMovement12m}</div>
                    <div class="stat-label">Ingen bevegelse</div>
                    <div class="stat-sub">Null salg + null lager 12m</div>
                </div>
            </div>
        `;
    }

    // ════════════════════════════════════════════════════
    //  SUB-TAB ROUTING
    // ════════════════════════════════════════════════════

    static renderSubTab(store) {
        switch (this.currentSubTab) {
            case 'saMigration':
                // Delegate fully to SAMigrationMode
                if (typeof SAMigrationMode !== 'undefined') {
                    return SAMigrationMode.render(store);
                }
                return '<p>SAMigrationMode er ikke lastet.</p>';

            case 'noSa':
                return this.renderNoSaTab(store);

            case 'outgoing':
                return this.renderOutgoingTab(store);

            case 'deadStock':
                return this.renderDeadStockTab(store);

            default:
                return '';
        }
    }

    // ════════════════════════════════════════════════════
    //  SUB-TAB: Lager uten SA
    // ════════════════════════════════════════════════════

    static renderNoSaTab(store) {
        // Delegate to NoSaArticlesMode — it has its own full UI
        if (typeof NoSaArticlesMode !== 'undefined') {
            return NoSaArticlesMode.render(store);
        }
        return '<p>NoSaArticlesMode er ikke lastet.</p>';
    }

    // ════════════════════════════════════════════════════
    //  SUB-TAB: Utgående
    // ════════════════════════════════════════════════════

    static renderOutgoingTab(store) {
        const items = store.getAllItems();
        let rows = [];

        items.forEach(item => {
            if (!this.isDiscontinued(item)) return;

            const stock = item.stock || 0;
            const bestAntLev = item.bestAntLev || 0;
            const replacementNr = (item.ersattAvArtikel || '').trim();
            let replacementStock = 0;

            if (replacementNr && replacementNr !== item.toolsArticleNumber) {
                const replItem = store.getByToolsArticleNumber(replacementNr);
                if (replItem) replacementStock = replItem.stock || 0;
                else {
                    const masterData = store.masterOnlyArticles.get(replacementNr);
                    if (masterData) replacementStock = masterData.stock || 0;
                }
            }

            // Sales from pre-calculated fields
            const sales12m = item.sales12m || 0;
            const sales3m = this.getSales3m(item);

            // Urgency
            const urgency = (stock > 0 || sales3m > 0) ? 'HIGH' :
                            sales12m > 0 ? 'MEDIUM' : 'LOW';
            const urgencySort = urgency === 'HIGH' ? 3 : urgency === 'MEDIUM' ? 2 : 1;

            rows.push({
                toolsNr: item.toolsArticleNumber,
                saNumber: item.saNumber || '',
                stock,
                bestAntLev,
                sales3m,
                sales12m,
                replacementNr: replacementNr || '-',
                replacementStock,
                urgency,
                urgencySort
            });
        });

        // Apply search
        if (this.searchTerm) {
            const term = this.searchTerm.toLowerCase();
            rows = rows.filter(r =>
                r.toolsNr.toLowerCase().includes(term) ||
                r.saNumber.toLowerCase().includes(term) ||
                r.replacementNr.toLowerCase().includes(term)
            );
        }

        // Sort
        rows = this.applySortToRows(rows, 'urgencySort', [
            (a, b) => b.urgencySort - a.urgencySort,
            (a, b) => b.stock - a.stock
        ]);

        if (rows.length === 0) {
            return '<div class="alert alert-info">Ingen utgående artikler funnet.</div>';
        }

        return `
            <div class="module-controls" style="margin-top:8px;">
                <div class="search-group">
                    <input type="text" class="search-input" placeholder="Søk artikkel..."
                           value="${this.searchTerm}"
                           onkeyup="WorkMode.handleSearch(this.value)">
                </div>
            </div>
            <div class="table-wrapper">
                <table class="data-table compact">
                    <thead>
                        <tr>
                            ${this.th('Tools nr', 'toolsNr')}
                            ${this.th('SA', 'saNumber')}
                            ${this.th('Lager', 'stock')}
                            ${this.th('Innkommende', 'bestAntLev')}
                            ${this.th('Salg 3m', 'sales3m')}
                            ${this.th('Salg 12m', 'sales12m')}
                            ${this.th('Erstatning', 'replacementNr')}
                            ${this.th('Erst. lager', 'replacementStock')}
                            ${this.th('Hastegrad', 'urgencySort')}
                        </tr>
                    </thead>
                    <tbody>
                        ${rows.map(r => `
                            <tr class="${r.urgency === 'HIGH' ? 'row-critical' : r.urgency === 'MEDIUM' ? 'row-warning' : ''}">
                                <td><strong>${this.esc(r.toolsNr)}</strong></td>
                                <td>${this.esc(r.saNumber)}</td>
                                <td class="qty-cell">${this.fmt(r.stock)}</td>
                                <td class="qty-cell">${r.bestAntLev > 0 ? this.fmt(r.bestAntLev) : '-'}</td>
                                <td class="qty-cell">${this.fmt(r.sales3m)}</td>
                                <td class="qty-cell">${this.fmt(r.sales12m)}</td>
                                <td>${this.esc(r.replacementNr)}</td>
                                <td class="qty-cell">${this.fmt(r.replacementStock)}</td>
                                <td>${this.urgencyBadge(r.urgency)}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
            <div class="table-footer"><p class="text-muted">Viser ${rows.length} utgående artikler</p></div>
        `;
    }

    // ════════════════════════════════════════════════════
    //  SUB-TAB: Død lager
    // ════════════════════════════════════════════════════

    static renderDeadStockTab(store) {
        const items = store.getAllItems();
        let rows = [];

        items.forEach(item => {
            const stock = item.stock || 0;
            const sales12m = item.sales12m || 0;
            if (stock <= 0 || sales12m > 0) return;

            rows.push({
                toolsNr: item.toolsArticleNumber,
                stock,
                estimertVerdi: item.estimertVerdi || 0,
                category: item.category || '',
                supplier: item.supplier || '',
                status: item._status || 'UKJENT'
            });
        });

        // Apply search
        if (this.searchTerm) {
            const term = this.searchTerm.toLowerCase();
            rows = rows.filter(r =>
                r.toolsNr.toLowerCase().includes(term) ||
                r.category.toLowerCase().includes(term) ||
                r.supplier.toLowerCase().includes(term)
            );
        }

        // Sort
        rows = this.applySortToRows(rows, 'estimertVerdi', [
            (a, b) => b.estimertVerdi - a.estimertVerdi
        ]);

        if (rows.length === 0) {
            return '<div class="alert alert-info">Ingen artikler med lager uten salg siste 12 måneder.</div>';
        }

        const totalValue = rows.reduce((s, r) => s + r.estimertVerdi, 0);

        return `
            <div class="module-controls" style="margin-top:8px;">
                <div class="search-group">
                    <input type="text" class="search-input" placeholder="Søk artikkel..."
                           value="${this.searchTerm}"
                           onkeyup="WorkMode.handleSearch(this.value)">
                </div>
            </div>
            <div style="margin:8px 0;padding:8px 12px;background:#fff3e0;border-radius:4px;font-size:13px;">
                <strong>${rows.length} artikler</strong> med lager men null salg siste 12 måneder.
                Estimert bundet kapital: <strong>${Math.round(totalValue).toLocaleString('nb-NO')} kr</strong>
            </div>
            <div class="table-wrapper">
                <table class="data-table compact">
                    <thead>
                        <tr>
                            ${this.th('Tools nr', 'toolsNr')}
                            ${this.th('Lager', 'stock')}
                            ${this.th('Est. verdi', 'estimertVerdi')}
                            ${this.th('Varegruppe', 'category')}
                            ${this.th('Leverandør', 'supplier')}
                            ${this.th('Status', 'status')}
                        </tr>
                    </thead>
                    <tbody>
                        ${rows.map(r => `
                            <tr>
                                <td><strong>${this.esc(r.toolsNr)}</strong></td>
                                <td class="qty-cell">${this.fmt(r.stock)}</td>
                                <td class="qty-cell">${Math.round(r.estimertVerdi).toLocaleString('nb-NO')} kr</td>
                                <td>${this.esc(r.category)}</td>
                                <td>${this.esc(r.supplier)}</td>
                                <td>${this.statusBadge(r.status)}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
            <div class="table-footer"><p class="text-muted">Viser ${rows.length} artikler</p></div>
        `;
    }

    // ════════════════════════════════════════════════════
    //  EVENT HANDLERS
    // ════════════════════════════════════════════════════

    static switchSubTab(tab) {
        this.currentSubTab = tab;
        this.searchTerm = '';
        this.sortColumn = null;
        this.sortDirection = 'desc';
        // Full re-render to update stat cards and sub-tab buttons
        if (window.app && window.app.dataStore) {
            window.app.renderCurrentModule();
        }
    }

    static handleSearch(value) {
        this.searchTerm = value;
        const el = document.getElementById('workSubContent');
        if (el && this.dataStore) {
            el.innerHTML = this.renderSubTab(this.dataStore);
        }
    }

    static handleSort(column) {
        if (this.sortColumn === column) {
            this.sortDirection = this.sortDirection === 'asc' ? 'desc' : 'asc';
        } else {
            this.sortColumn = column;
            this.sortDirection = column === 'urgencySort' || column === 'estimertVerdi' || column === 'stock' ? 'desc' : 'asc';
        }
        const el = document.getElementById('workSubContent');
        if (el && this.dataStore) {
            el.innerHTML = this.renderSubTab(this.dataStore);
        }
    }

    // ════════════════════════════════════════════════════
    //  HELPERS
    // ════════════════════════════════════════════════════

    /**
     * Get approximate 3m sales from pre-calculated fields
     */
    static getSales3m(item) {
        if (item.outgoingOrders && item.outgoingOrders.length > 0) {
            const threeMonthsAgo = new Date();
            threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
            let total = 0;
            item.outgoingOrders.forEach(o => {
                if (o.quantity <= 0) return;
                const d = o.deliveryDate instanceof Date ? o.deliveryDate :
                          o.deliveryDate ? new Date(o.deliveryDate) : null;
                if (d && !isNaN(d.getTime()) && d >= threeMonthsAgo) total += o.quantity;
            });
            return Math.round(total);
        }
        return item.sales6m ? Math.round(item.sales6m / 2) : 0;
    }

    /**
     * Apply sort to rows array, with default sort as fallback
     */
    static applySortToRows(rows, defaultCol, defaultComparators) {
        if (!this.sortColumn) {
            return rows.sort((a, b) => {
                for (const cmp of defaultComparators) {
                    const result = cmp(a, b);
                    if (result !== 0) return result;
                }
                return 0;
            });
        }

        const col = this.sortColumn;
        const dir = this.sortDirection === 'asc' ? 1 : -1;
        return [...rows].sort((a, b) => {
            let aVal = a[col];
            let bVal = b[col];
            if (aVal == null) aVal = '';
            if (bVal == null) bVal = '';
            if (typeof aVal === 'number' && typeof bVal === 'number') return (aVal - bVal) * dir;
            return String(aVal).localeCompare(String(bVal), 'nb-NO') * dir;
        });
    }

    static th(label, key) {
        const indicator = this.sortColumn === key
            ? (this.sortDirection === 'asc' ? ' &#9650;' : ' &#9660;')
            : '';
        return `<th class="sortable-header" onclick="WorkMode.handleSort('${key}')">${label}${indicator}</th>`;
    }

    static urgencyBadge(level) {
        if (level === 'HIGH') return '<span class="badge badge-critical" style="color:#d32f2f;font-weight:bold;">HØY</span>';
        if (level === 'MEDIUM') return '<span class="badge badge-warning" style="color:#e65100;font-weight:bold;">MEDIUM</span>';
        return '<span class="badge badge-ok" style="color:#9e9e9e;">LAV</span>';
    }

    static statusBadge(status) {
        if (status === 'AKTIV') return '<span class="badge badge-ok">Aktiv</span>';
        if (status === 'UTGAENDE') return '<span class="badge badge-warning">Utgående</span>';
        if (status === 'UTGAATT') return '<span class="badge badge-critical">Utgått</span>';
        return `<span class="badge badge-info">${this.esc(status)}</span>`;
    }

    static fmt(num) {
        if (num === null || num === undefined) return '-';
        return Math.round(num).toLocaleString('nb-NO');
    }

    static esc(str) {
        if (!str) return '';
        return str.toString()
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }
}

// Eksporter til global scope
window.WorkMode = WorkMode;
