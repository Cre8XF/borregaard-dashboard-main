// ===================================
// SLOW MOVERS MODULE
// Identifies items with little/no movement
// ===================================

/**
 * Slow mover criteria
 */
const SLOW_MOVER_CRITERIA = {
    daysToEmpty: 365,        // >365 days to empty
    minStock: 1,             // Must have stock
    maxSales12m: 10          // Max 10 units sold last year
};

/**
 * SlowMovers - Display items with little or no movement
 */
class SlowMovers {
    static currentData = [];
    static departmentsData = null;
    static searchTerm = '';
    static sortColumn = 'daysToEmpty';
    static sortDirection = 'desc';

    /**
     * Render the slow movers view
     * @param {Array} data - Processed item data
     * @param {Array} departments - Other departments data (optional)
     * @returns {string} HTML content
     */
    static render(data, departments = null) {
        this.currentData = this.filterSlowMovers(data);
        this.departmentsData = departments;

        return `
            <div class="module-header">
                <h2>Ukurans - Varer med lite/ingen bevegelse</h2>
                <div class="module-controls">
                    <input type="text" id="slowSearch" placeholder="Søk artikkel..." class="search-input"
                           onkeyup="SlowMovers.handleSearch(this.value)">
                    <button onclick="SlowMovers.exportCSV()" class="btn-export">Eksporter</button>
                </div>
            </div>

            <div class="alert alert-info">
                <strong>Tips:</strong> Grønn rad = Andre avdelinger kan bruke dette (intern-salg mulig).
                Gul/rød rad = Vurder retur eller avskriving.
            </div>

            <div id="slowMoversContent">
                ${this.renderContent()}
            </div>
        `;
    }

    /**
     * Filter slow moving items
     */
    static filterSlowMovers(data) {
        return data.filter(item =>
            item.stock > 0 &&
            item.daysToEmpty > SLOW_MOVER_CRITERIA.daysToEmpty &&
            item.sales12m <= SLOW_MOVER_CRITERIA.maxSales12m
        );
    }

    /**
     * Render content
     */
    static renderContent() {
        let filtered = this.currentData;

        // Apply search
        if (this.searchTerm) {
            const term = this.searchTerm.toLowerCase();
            filtered = filtered.filter(item =>
                item.itemNo.toLowerCase().includes(term) ||
                (item.description && item.description.toLowerCase().includes(term))
            );
        }

        // Sort
        filtered = this.sortData(filtered);

        if (filtered.length === 0) {
            return `<div class="alert alert-success">Ingen ukuransvarer funnet!</div>`;
        }

        // Summary by value
        const totalValue = filtered.reduce((sum, item) => sum + this.estimateValue(item), 0);

        return `
            <div class="summary-cards" style="margin-bottom: 20px;">
                <div class="summary-card card-warning">
                    <div class="card-value">${filtered.length}</div>
                    <div class="card-label">Ukuransvarer</div>
                </div>
                <div class="summary-card">
                    <div class="card-value">${this.formatNumber(totalValue)}</div>
                    <div class="card-label">Estimert verdi (kr)</div>
                </div>
                <div class="summary-card card-ok">
                    <div class="card-value">${filtered.filter(i => this.hasOpportunity(i)).length}</div>
                    <div class="card-label">Intern-salg mulig</div>
                </div>
            </div>

            <div class="table-wrapper">
                <table class="data-table">
                    <thead>
                        <tr>
                            <th class="sortable" onclick="SlowMovers.handleSort('itemNo')">
                                Artikelnr ${this.getSortIndicator('itemNo')}
                            </th>
                            <th class="sortable" onclick="SlowMovers.handleSort('description')">
                                Beskrivelse ${this.getSortIndicator('description')}
                            </th>
                            <th class="sortable" onclick="SlowMovers.handleSort('stock')">
                                Saldo ${this.getSortIndicator('stock')}
                            </th>
                            <th class="sortable" onclick="SlowMovers.handleSort('sales12m')">
                                Salg 12m ${this.getSortIndicator('sales12m')}
                            </th>
                            <th class="sortable" onclick="SlowMovers.handleSort('daysToEmpty')">
                                Dager→tom ${this.getSortIndicator('daysToEmpty')}
                            </th>
                            <th>Andre avdelinger</th>
                            <th>Anbefalt handling</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${filtered.map(item => {
                            const opportunities = this.findInternalOpportunities(item);
                            const hasOpp = opportunities.some(o => o.sales > 50);
                            const rowClass = hasOpp ? 'row-success' : 'row-warning';

                            return `
                                <tr class="${rowClass}">
                                    <td><strong>${item.itemNo}</strong></td>
                                    <td>${this.truncate(item.description, 35)}</td>
                                    <td class="qty-cell">${this.formatNumber(item.stock)}</td>
                                    <td class="qty-cell">${item.sales12m}</td>
                                    <td class="qty-cell">${item.daysToEmpty > 9999 ? '∞' : this.formatNumber(item.daysToEmpty)}</td>
                                    <td>
                                        ${opportunities.length > 0 ?
                                            opportunities.map(o =>
                                                `<div>${o.department}: ${o.stock} stk (${o.sales}/år)</div>`
                                            ).join('') :
                                            '<em class="text-muted">Ingen data</em>'
                                        }
                                    </td>
                                    <td>${this.getRecommendation(item, opportunities)}</td>
                                </tr>
                            `;
                        }).join('')}
                    </tbody>
                </table>
            </div>
        `;
    }

    /**
     * Find internal sale opportunities in other departments
     */
    static findInternalOpportunities(item) {
        const opportunities = [];

        if (!this.departmentsData || this.departmentsData.length === 0) {
            return opportunities;
        }

        // Group departments data by department name
        const deptGroups = {};
        this.departmentsData.forEach(deptItem => {
            const deptName = deptItem.department || deptItem.warehouse || 'Ukjent';
            if (!deptGroups[deptName]) {
                deptGroups[deptName] = [];
            }
            deptGroups[deptName].push(deptItem);
        });

        // Check each department
        Object.keys(deptGroups).forEach(deptName => {
            const deptItems = deptGroups[deptName];
            const deptItem = deptItems.find(d =>
                d.itemNo === item.itemNo ||
                d['Artikelnr'] === item.itemNo
            );

            if (deptItem) {
                const sales = deptItem.sales12m || deptItem.r12 || 0;
                const stock = deptItem.stock || deptItem['Lagersaldo'] || 0;

                if (sales > 50) {
                    opportunities.push({
                        department: deptName,
                        stock: stock,
                        sales: sales,
                        recommendation: 'Flytt til ' + deptName
                    });
                } else if (sales < 10) {
                    opportunities.push({
                        department: deptName,
                        stock: stock,
                        sales: sales,
                        recommendation: 'Også ukurans - vurder retur/avskriving'
                    });
                }
            }
        });

        return opportunities;
    }

    /**
     * Check if item has internal sale opportunity
     */
    static hasOpportunity(item) {
        const opportunities = this.findInternalOpportunities(item);
        return opportunities.some(o => o.sales > 50);
    }

    /**
     * Get recommendation for item
     */
    static getRecommendation(item, opportunities) {
        const hasActiveOpp = opportunities.some(o => o.sales > 50);

        if (hasActiveOpp) {
            const bestOpp = opportunities.find(o => o.sales > 50);
            return `<span class="badge badge-ok">Tilby ${bestOpp.department}</span>`;
        }

        if (item.sales12m === 0 && item.stock > 10) {
            return `<span class="badge badge-critical">Avskriv/Retur</span>`;
        }

        return `<span class="badge badge-warning">Retur leverandør</span>`;
    }

    /**
     * Estimate item value (rough calculation)
     */
    static estimateValue(item) {
        // Rough estimate: 50kr per unit if no price available
        const unitPrice = item.price || 50;
        return item.stock * unitPrice;
    }

    /**
     * Sort data
     */
    static sortData(data) {
        return [...data].sort((a, b) => {
            let aVal = a[this.sortColumn];
            let bVal = b[this.sortColumn];

            if (typeof aVal === 'number' && typeof bVal === 'number') {
                return this.sortDirection === 'asc' ? aVal - bVal : bVal - aVal;
            }

            aVal = (aVal || '').toString().toLowerCase();
            bVal = (bVal || '').toString().toLowerCase();

            if (this.sortDirection === 'asc') {
                return aVal.localeCompare(bVal, 'no');
            }
            return bVal.localeCompare(aVal, 'no');
        });
    }

    /**
     * Get sort indicator
     */
    static getSortIndicator(column) {
        if (this.sortColumn !== column) return '';
        return this.sortDirection === 'asc' ? '↑' : '↓';
    }

    /**
     * Handle sort
     */
    static handleSort(column) {
        if (this.sortColumn === column) {
            this.sortDirection = this.sortDirection === 'asc' ? 'desc' : 'asc';
        } else {
            this.sortColumn = column;
            this.sortDirection = column === 'itemNo' || column === 'description' ? 'asc' : 'desc';
        }
        this.updateContent();
    }

    /**
     * Handle search
     */
    static handleSearch(term) {
        this.searchTerm = term;
        this.updateContent();
    }

    /**
     * Update content
     */
    static updateContent() {
        const container = document.getElementById('slowMoversContent');
        if (container) {
            container.innerHTML = this.renderContent();
        }
    }

    /**
     * Export to CSV
     */
    static exportCSV() {
        let data = this.currentData;

        if (this.searchTerm) {
            const term = this.searchTerm.toLowerCase();
            data = data.filter(item =>
                item.itemNo.toLowerCase().includes(term) ||
                (item.description && item.description.toLowerCase().includes(term))
            );
        }

        data = this.sortData(data);

        const headers = ['Artikelnr', 'Beskrivelse', 'Saldo', 'Salg 12m', 'Dager til tom', 'Leverandør', 'Anbefaling'];
        const rows = data.map(item => {
            const opportunities = this.findInternalOpportunities(item);
            const hasActiveOpp = opportunities.some(o => o.sales > 50);
            const rec = hasActiveOpp ? 'Intern-salg mulig' : 'Retur/Avskriv';

            return [
                item.itemNo,
                `"${(item.description || '').replace(/"/g, '""')}"`,
                item.stock,
                item.sales12m,
                item.daysToEmpty > 9999 ? '∞' : item.daysToEmpty,
                `"${(item.supplier || '').replace(/"/g, '""')}"`,
                rec
            ];
        });

        const csv = [headers.join(';'), ...rows.map(r => r.join(';'))].join('\n');

        const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `ukurans-${new Date().toISOString().split('T')[0]}.csv`;
        a.click();
        URL.revokeObjectURL(url);
    }

    /**
     * Format number
     */
    static formatNumber(num) {
        if (num === null || num === undefined) return '-';
        return Math.round(num).toLocaleString('nb-NO');
    }

    /**
     * Truncate text
     */
    static truncate(text, maxLength) {
        if (!text) return '-';
        return text.length > maxLength ? text.substring(0, maxLength) + '...' : text;
    }

    /**
     * Get count of slow movers
     */
    static getCount(data) {
        return this.filterSlowMovers(data).length;
    }
}

// Export to global scope
window.SlowMovers = SlowMovers;
