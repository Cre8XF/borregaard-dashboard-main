// ===================================
// MODUS 6: ARTIKLER UTEN SA-NUMMER
// Viser: Master-artikler som ikke er i SA-universet
// ===================================

/**
 * NoSaArticlesMode - Artikler uten SA-nummer
 *
 * Viser artikler fra Master.xlsx som ikke har tilknyttet SA-nummer.
 * Delt i to grupper:
 *   A) Med saldo (KRITISK) — binder kapital uten SA-avtale
 *   B) Uten saldo — informativt
 *
 * Datakilde: UnifiedDataStore.masterOnlyArticles (via getArticlesWithoutSA())
 */
class NoSaArticlesMode {
    static currentView = 'withStock';
    static searchTerm = '';
    static sortColumn = null;
    static sortDirection = 'asc';
    static dataStore = null;
    static currentLimit = 50;

    /**
     * Render seksjonen
     * @param {UnifiedDataStore} store
     * @returns {string} HTML
     */
    static render(store) {
        this.dataStore = store;

        const data = store.getArticlesWithoutSA();

        const totalValueWithStock = data.withStock.reduce((sum, i) => sum + i.estimertVerdi, 0);

        return `
            <div class="module-header">
                <h2>Artikler uten SA-nummer</h2>
                <p class="module-description">Master-artikler som ikke er del av SA-avtalen</p>
            </div>

            <div class="no-sa-summary">
                <div class="stat-card ${data.withStock.length > 0 ? 'critical' : 'ok'}">
                    <div class="stat-value">${data.withStock.length}</div>
                    <div class="stat-label">Med saldo</div>
                    <div class="stat-sub">Binder kapital uten SA</div>
                </div>
                <div class="stat-card">
                    <div class="stat-value">${data.noStock.length}</div>
                    <div class="stat-label">Uten saldo</div>
                    <div class="stat-sub">Ingen lagerbinding</div>
                </div>
                <div class="stat-card ${totalValueWithStock > 0 ? 'warning' : ''}">
                    <div class="stat-value">${this.formatCurrency(totalValueWithStock)}</div>
                    <div class="stat-label">Estimert verdi</div>
                    <div class="stat-sub">Artikler med saldo</div>
                </div>
                <div class="stat-card">
                    <div class="stat-value">${data.total}</div>
                    <div class="stat-label">Totalt</div>
                    <div class="stat-sub">Uten SA-nummer</div>
                </div>
            </div>

            <div class="view-tabs">
                <button class="view-tab ${this.currentView === 'withStock' ? 'active' : ''}"
                        onclick="NoSaArticlesMode.switchView('withStock')">
                    Med saldo (${data.withStock.length})
                </button>
                <button class="view-tab ${this.currentView === 'noStock' ? 'active' : ''}"
                        onclick="NoSaArticlesMode.switchView('noStock')">
                    Uten saldo (${data.noStock.length})
                </button>
            </div>

            <div class="module-controls">
                <div class="filter-group">
                    <label>Vis:</label>
                    <select id="noSaLimitFilter" class="filter-select"
                            onchange="NoSaArticlesMode.handleLimitChange(this.value)">
                        <option value="20" ${this.currentLimit === 20 ? 'selected' : ''}>Top 20</option>
                        <option value="50" ${this.currentLimit === 50 ? 'selected' : ''}>Top 50</option>
                        <option value="100" ${this.currentLimit === 100 ? 'selected' : ''}>Top 100</option>
                        <option value="all" ${this.currentLimit === 'all' ? 'selected' : ''}>Alle</option>
                    </select>
                </div>
                <div class="search-group">
                    <input type="text" id="noSaSearch" placeholder="Sok artikkel..."
                           class="search-input" value="${this.searchTerm}"
                           onkeyup="NoSaArticlesMode.handleSearch(this.value)">
                </div>
                <button onclick="NoSaArticlesMode.exportCSV()" class="btn-export">Eksporter CSV</button>
            </div>

            <div id="noSaContent">
                ${this.renderCurrentView(data)}
            </div>
        `;
    }

    /**
     * Render gjeldende visning
     */
    static renderCurrentView(data) {
        const items = this.currentView === 'withStock' ? data.withStock : data.noStock;
        const isWithStock = this.currentView === 'withStock';

        let filtered = this.applySearch(items);
        filtered = this.applySort(filtered);

        const displayItems = this.currentLimit === 'all'
            ? filtered
            : filtered.slice(0, this.currentLimit);

        if (displayItems.length === 0) {
            const emptyMsg = isWithStock
                ? 'Ingen artikler uten SA-nummer med lagersaldo.'
                : 'Ingen artikler uten SA-nummer uten lagersaldo.';
            return `
                <div class="view-insight ok">
                    <p><strong>${emptyMsg}</strong></p>
                </div>
            `;
        }

        if (isWithStock) {
            return `
                <div class="view-insight critical">
                    <p><strong>${displayItems.length} artikler har lagersaldo uten SA-avtale.</strong>
                    Disse binder kapital (${this.formatCurrency(displayItems.reduce((s, i) => s + i.estimertVerdi, 0))})
                    og bor vurderes for SA-tilknytning eller avvikling.</p>
                </div>
                ${this.renderTable(displayItems, true)}
                ${filtered.length > displayItems.length ? `<div class="table-footer">Viser ${displayItems.length} av ${filtered.length}</div>` : ''}
            `;
        }

        return `
            <div class="view-insight info">
                <p><strong>${displayItems.length} artikler uten SA-nummer og uten lagersaldo.</strong>
                Disse binder ingen kapital, men kan indikere utdaterte artikler i Master.</p>
            </div>
            ${this.renderTable(displayItems, false)}
            ${filtered.length > displayItems.length ? `<div class="table-footer">Viser ${displayItems.length} av ${filtered.length}</div>` : ''}
        `;
    }

    /**
     * Render tabell
     */
    static renderTable(items, isWithStock) {
        return `
            <div class="table-wrapper">
                <table class="data-table compact">
                    <thead>
                        <tr>
                            <th class="sortable-header" onclick="NoSaArticlesMode.handleSort('toolsArticleNumber')">
                                Artikkelnr ${this.getSortIndicator('toolsArticleNumber')}
                            </th>
                            <th class="sortable-header" onclick="NoSaArticlesMode.handleSort('description')">
                                Beskrivelse ${this.getSortIndicator('description')}
                            </th>
                            <th class="sortable-header" onclick="NoSaArticlesMode.handleSort('stock')">
                                Lager ${this.getSortIndicator('stock')}
                            </th>
                            <th class="sortable-header" onclick="NoSaArticlesMode.handleSort('estimertVerdi')">
                                Est. verdi ${this.getSortIndicator('estimertVerdi')}
                            </th>
                            <th class="sortable-header" onclick="NoSaArticlesMode.handleSort('artikkelstatus')">
                                Status ${this.getSortIndicator('artikkelstatus')}
                            </th>
                            <th class="sortable-header" onclick="NoSaArticlesMode.handleSort('brand')">
                                Brand ${this.getSortIndicator('brand')}
                            </th>
                            <th class="sortable-header" onclick="NoSaArticlesMode.handleSort('supplier')">
                                Leverandor ${this.getSortIndicator('supplier')}
                            </th>
                            <th class="sortable-header" onclick="NoSaArticlesMode.handleSort('supplierId')">
                                Lev. ID ${this.getSortIndicator('supplierId')}
                            </th>
                        </tr>
                    </thead>
                    <tbody>
                        ${items.map(item => this.renderRow(item, isWithStock)).join('')}
                    </tbody>
                </table>
            </div>
        `;
    }

    /**
     * Render en rad
     */
    static renderRow(item, isWithStock) {
        const rowClass = isWithStock ? 'row-warning' : '';
        const stockBadge = isWithStock
            ? `<span class="badge badge-warning">SALDO UTEN SA</span>`
            : '';

        const statusClass = this.getStatusBadgeClass(item._status);

        return `
            <tr class="${rowClass}">
                <td>
                    <strong>${this.escapeHtml(item.toolsArticleNumber)}</strong>
                    ${stockBadge}
                </td>
                <td>${this.escapeHtml(item.description)}</td>
                <td class="qty-cell ${item.stock > 0 ? 'positive' : ''}">${item.stock.toLocaleString('nb-NO')}</td>
                <td class="qty-cell">${this.formatCurrency(item.estimertVerdi)}</td>
                <td><span class="badge ${statusClass}">${this.escapeHtml(item.artikkelstatus)}</span></td>
                <td>${item.brand ? this.escapeHtml(item.brand) : '<span class="text-muted">-</span>'}</td>
                <td>${item.supplier ? this.escapeHtml(item.supplier) : '<span class="text-muted">-</span>'}</td>
                <td>${item.supplierId ? this.escapeHtml(item.supplierId) : '<span class="text-muted">-</span>'}</td>
            </tr>
        `;
    }

    // ── Interaksjonshandlere ──

    static switchView(view) {
        this.currentView = view;
        this.searchTerm = '';
        this.sortColumn = null;
        this.sortDirection = 'asc';
        if (window.app && window.app.dataStore) {
            window.app.renderCurrentModule();
        }
    }

    static handleLimitChange(value) {
        this.currentLimit = value === 'all' ? 'all' : parseInt(value);
        this.refreshContent();
    }

    static handleSearch(value) {
        this.searchTerm = value;
        this.refreshContent();
    }

    static handleSort(column) {
        if (this.sortColumn === column) {
            this.sortDirection = this.sortDirection === 'asc' ? 'desc' : 'asc';
        } else {
            this.sortColumn = column;
            this.sortDirection = 'asc';
        }
        this.refreshContent();
    }

    static refreshContent() {
        if (!this.dataStore) return;
        const contentDiv = document.getElementById('noSaContent');
        if (contentDiv) {
            const data = this.dataStore.getArticlesWithoutSA();
            contentDiv.innerHTML = this.renderCurrentView(data);
        }
    }

    // ── Filtrering & sortering ──

    static applySearch(items) {
        if (!this.searchTerm) return items;
        const term = this.searchTerm.toLowerCase();
        return items.filter(item =>
            (item.toolsArticleNumber && item.toolsArticleNumber.toLowerCase().includes(term)) ||
            (item.description && item.description.toLowerCase().includes(term)) ||
            (item.brand && item.brand.toLowerCase().includes(term)) ||
            (item.supplier && item.supplier.toLowerCase().includes(term)) ||
            (item.supplierId && item.supplierId.toLowerCase().includes(term))
        );
    }

    static applySort(items) {
        if (!this.sortColumn) return items;
        const col = this.sortColumn;
        const dir = this.sortDirection === 'asc' ? 1 : -1;

        return [...items].sort((a, b) => {
            let aVal = a[col];
            let bVal = b[col];

            // Null-safe: nulls sorteres sist
            if (aVal == null && bVal == null) return 0;
            if (aVal == null) return 1;
            if (bVal == null) return -1;

            if (typeof aVal === 'number' && typeof bVal === 'number') {
                return (aVal - bVal) * dir;
            }

            return aVal.toString().localeCompare(bVal.toString(), 'nb-NO') * dir;
        });
    }

    // ── Formatering ──

    static formatCurrency(value) {
        if (!value || value === 0) return '0 kr';
        return Math.round(value).toLocaleString('nb-NO') + ' kr';
    }

    static getStatusBadgeClass(status) {
        switch (status) {
            case 'AKTIV': return 'badge-ok';
            case 'UTGAENDE': return 'badge-warning';
            case 'UTGAATT': return 'badge-critical';
            default: return 'badge-inactive';
        }
    }

    static getSortIndicator(column) {
        if (this.sortColumn !== column) return '';
        return this.sortDirection === 'asc' ? ' ↑' : ' ↓';
    }

    static escapeHtml(str) {
        if (!str) return '';
        return str.toString()
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    // ── CSV-eksport ──

    static exportCSV() {
        if (!this.dataStore) return;
        const data = this.dataStore.getArticlesWithoutSA();
        const items = this.currentView === 'withStock' ? data.withStock : data.noStock;
        const filtered = this.applySearch(items);

        const header = 'Artikkelnr;Beskrivelse;Lager;Est. verdi;Status;Brand;Leverandor;Lev. ID';
        const rows = filtered.map(item =>
            [
                item.toolsArticleNumber,
                item.description,
                item.stock,
                Math.round(item.estimertVerdi),
                item.artikkelstatus,
                item.brand || '',
                item.supplier || '',
                item.supplierId || ''
            ].join(';')
        );

        const csv = [header, ...rows].join('\n');
        const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `artikler_uten_sa_${this.currentView}_${new Date().toISOString().slice(0, 10)}.csv`;
        link.click();
        URL.revokeObjectURL(url);
    }
}

// Eksporter til global scope
window.NoSaArticlesMode = NoSaArticlesMode;
