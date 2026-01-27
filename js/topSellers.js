// ===================================
// TOP SELLERS MODULE
// Shows most sold items in the last 12 months
// ===================================

/**
 * TopSellers - Display and manage top selling items
 */
class TopSellers {
    static currentData = [];
    static currentLimit = 50;
    static searchTerm = '';
    static sortColumn = 'sales12m';
    static sortDirection = 'desc';

    /**
     * Render the top sellers view
     * @param {Array} data - Processed item data
     * @returns {string} HTML content
     */
    static render(data) {
        this.currentData = data.filter(item => item.sales12m > 0);

        return `
            <div class="module-header">
                <h2>Toppsellere - Mest solgte siste 12 måneder</h2>
                <div class="module-controls">
                    <input type="text" id="topSearch" placeholder="Søk artikkel..." class="search-input"
                           onkeyup="TopSellers.handleSearch(this.value)">
                    <select id="topLimit" class="filter-select" onchange="TopSellers.handleLimitChange(this.value)">
                        <option value="20">Top 20</option>
                        <option value="50" selected>Top 50</option>
                        <option value="100">Top 100</option>
                        <option value="all">Alle</option>
                    </select>
                    <button onclick="TopSellers.exportCSV()" class="btn-export">Eksporter CSV</button>
                </div>
            </div>

            <div id="topSellersContent">
                ${this.renderTable()}
            </div>
        `;
    }

    /**
     * Render the data table
     * @returns {string} HTML table
     */
    static renderTable() {
        let filtered = this.currentData;

        // Apply search filter
        if (this.searchTerm) {
            const term = this.searchTerm.toLowerCase();
            filtered = filtered.filter(item =>
                item.itemNo.toLowerCase().includes(term) ||
                (item.description && item.description.toLowerCase().includes(term)) ||
                (item.supplier && item.supplier.toLowerCase().includes(term))
            );
        }

        // Sort data
        filtered = this.sortData(filtered);

        // Apply limit
        const limit = this.currentLimit === 'all' ? filtered.length : parseInt(this.currentLimit);
        const displayData = filtered.slice(0, limit);

        if (displayData.length === 0) {
            return `<div class="alert alert-info">Ingen artikler funnet.</div>`;
        }

        return `
            <div class="table-wrapper">
                <table class="data-table" id="topSellersTable">
                    <thead>
                        <tr>
                            <th>#</th>
                            <th class="sortable" onclick="TopSellers.handleSort('itemNo')">
                                Artikelnr ${this.getSortIndicator('itemNo')}
                            </th>
                            <th class="sortable" onclick="TopSellers.handleSort('description')">
                                Beskrivelse ${this.getSortIndicator('description')}
                            </th>
                            <th class="sortable" onclick="TopSellers.handleSort('sales12m')">
                                Solgt 12m ${this.getSortIndicator('sales12m')}
                            </th>
                            <th class="sortable" onclick="TopSellers.handleSort('orderCount')">
                                Ant. ordre ${this.getSortIndicator('orderCount')}
                            </th>
                            <th class="sortable" onclick="TopSellers.handleSort('stock')">
                                Saldo ${this.getSortIndicator('stock')}
                            </th>
                            <th>Leverandør</th>
                            <th>Status</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${displayData.map((item, i) => `
                            <tr class="clickable" onclick="TopSellers.showDetails('${item.itemNo}')">
                                <td>${i + 1}</td>
                                <td><strong>${item.itemNo}</strong></td>
                                <td>${this.truncate(item.description, 40)}</td>
                                <td class="qty-cell">${this.formatNumber(item.sales12m)}</td>
                                <td class="qty-cell">${item.orderCount}</td>
                                <td class="qty-cell">${this.formatNumber(item.stock)}</td>
                                <td>${this.truncate(item.supplier, 25)}</td>
                                <td>${this.getStatusBadge(item)}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
            <div class="table-footer">
                <p class="text-muted">Viser ${displayData.length} av ${filtered.length} artikler</p>
            </div>
        `;
    }

    /**
     * Get sort indicator for column header
     */
    static getSortIndicator(column) {
        if (this.sortColumn !== column) return '';
        return this.sortDirection === 'asc' ? '↑' : '↓';
    }

    /**
     * Sort data by current column and direction
     */
    static sortData(data) {
        return [...data].sort((a, b) => {
            let aVal = a[this.sortColumn];
            let bVal = b[this.sortColumn];

            // Handle numeric vs string sorting
            if (typeof aVal === 'number' && typeof bVal === 'number') {
                return this.sortDirection === 'asc' ? aVal - bVal : bVal - aVal;
            }

            // String comparison
            aVal = (aVal || '').toString().toLowerCase();
            bVal = (bVal || '').toString().toLowerCase();

            if (this.sortDirection === 'asc') {
                return aVal.localeCompare(bVal, 'no');
            } else {
                return bVal.localeCompare(aVal, 'no');
            }
        });
    }

    /**
     * Handle sort column change
     */
    static handleSort(column) {
        if (this.sortColumn === column) {
            this.sortDirection = this.sortDirection === 'asc' ? 'desc' : 'asc';
        } else {
            this.sortColumn = column;
            this.sortDirection = column === 'itemNo' || column === 'description' ? 'asc' : 'desc';
        }
        this.updateTable();
    }

    /**
     * Handle search input
     */
    static handleSearch(term) {
        this.searchTerm = term;
        this.updateTable();
    }

    /**
     * Handle limit change
     */
    static handleLimitChange(limit) {
        this.currentLimit = limit;
        this.updateTable();
    }

    /**
     * Update table content
     */
    static updateTable() {
        const container = document.getElementById('topSellersContent');
        if (container) {
            container.innerHTML = this.renderTable();
        }
    }

    /**
     * Get status badge HTML
     */
    static getStatusBadge(item) {
        if (item.stock === 0) {
            return '<span class="badge badge-critical">TOM</span>';
        }

        const monthlyConsumption = item.sales12m / 12;
        if (monthlyConsumption > 0 && item.stock < monthlyConsumption) {
            return '<span class="badge badge-warning">LAV</span>';
        }

        return '<span class="badge badge-ok">OK</span>';
    }

    /**
     * Show item details in a modal
     */
    static showDetails(itemNo) {
        const item = this.currentData.find(i => i.itemNo === itemNo);
        if (!item) return;

        const monthlyConsumption = item.sales12m / 12;
        const daysToEmpty = monthlyConsumption > 0 ? Math.round(item.stock / (item.sales12m / 365)) : '∞';

        const modal = document.createElement('div');
        modal.className = 'modal-overlay';
        modal.innerHTML = `
            <div class="modal-content">
                <div class="modal-header">
                    <h3>${item.itemNo}</h3>
                    <button class="modal-close" onclick="this.closest('.modal-overlay').remove()">×</button>
                </div>
                <div class="modal-body">
                    <div class="detail-grid">
                        <div class="detail-item">
                            <strong>Beskrivelse</strong>
                            ${item.description || '-'}
                        </div>
                        <div class="detail-item">
                            <strong>Leverandør</strong>
                            ${item.supplier || '-'}
                        </div>
                        <div class="detail-item">
                            <strong>Solgt siste 12 mnd</strong>
                            ${this.formatNumber(item.sales12m)} stk
                        </div>
                        <div class="detail-item">
                            <strong>Antall ordre</strong>
                            ${item.orderCount}
                        </div>
                        <div class="detail-item">
                            <strong>Lagersaldo</strong>
                            ${this.formatNumber(item.stock)} stk
                        </div>
                        <div class="detail-item">
                            <strong>Disponibel</strong>
                            ${this.formatNumber(item.available)} stk
                        </div>
                        <div class="detail-item">
                            <strong>BP (Bestillingspunkt)</strong>
                            ${item.bp || '-'}
                        </div>
                        <div class="detail-item">
                            <strong>Månedlig forbruk</strong>
                            ${monthlyConsumption.toFixed(1)} stk/mnd
                        </div>
                        <div class="detail-item">
                            <strong>Dager til tomt</strong>
                            ${daysToEmpty} dager
                        </div>
                        <div class="detail-item">
                            <strong>Artikkelstatus</strong>
                            ${item.status || '-'}
                        </div>
                        <div class="detail-item">
                            <strong>Hylleplassering</strong>
                            ${item.shelf || '-'}
                        </div>
                        <div class="detail-item">
                            <strong>Siste salg</strong>
                            ${item.lastSaleDate || '-'}
                        </div>
                    </div>
                </div>
                <div class="modal-footer">
                    <button class="btn-secondary" onclick="this.closest('.modal-overlay').remove()">Lukk</button>
                </div>
            </div>
        `;

        document.body.appendChild(modal);
    }

    /**
     * Export data to CSV
     */
    static exportCSV() {
        let data = this.currentData;

        // Apply current filters
        if (this.searchTerm) {
            const term = this.searchTerm.toLowerCase();
            data = data.filter(item =>
                item.itemNo.toLowerCase().includes(term) ||
                (item.description && item.description.toLowerCase().includes(term))
            );
        }

        // Sort
        data = this.sortData(data);

        // Apply limit
        const limit = this.currentLimit === 'all' ? data.length : parseInt(this.currentLimit);
        data = data.slice(0, limit);

        // Create CSV content
        const headers = ['Rangering', 'Artikelnr', 'Beskrivelse', 'Solgt 12m', 'Antall ordre', 'Saldo', 'Leverandør', 'Status'];
        const rows = data.map((item, i) => [
            i + 1,
            item.itemNo,
            `"${(item.description || '').replace(/"/g, '""')}"`,
            item.sales12m,
            item.orderCount,
            item.stock,
            `"${(item.supplier || '').replace(/"/g, '""')}"`,
            item.stock === 0 ? 'TOM' : (item.stock < item.sales12m / 12 ? 'LAV' : 'OK')
        ]);

        const csv = [headers.join(';'), ...rows.map(r => r.join(';'))].join('\n');

        // Download
        const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `toppsellere-${new Date().toISOString().split('T')[0]}.csv`;
        a.click();
        URL.revokeObjectURL(url);
    }

    /**
     * Utility: Format number with thousands separator
     */
    static formatNumber(num) {
        if (num === null || num === undefined) return '-';
        return Math.round(num).toLocaleString('nb-NO');
    }

    /**
     * Utility: Truncate text
     */
    static truncate(text, maxLength) {
        if (!text) return '-';
        return text.length > maxLength ? text.substring(0, maxLength) + '...' : text;
    }

    /**
     * Get count of top sellers for summary card
     */
    static getCount(data) {
        return data.filter(item => item.sales12m > 0).length;
    }
}

// Export to global scope
window.TopSellers = TopSellers;
