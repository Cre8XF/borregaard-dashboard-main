// ===================================
// INACTIVE ITEMS MODULE
// Shows items with stock but inactive status
// ===================================

/**
 * Inactive status codes to flag
 */
const INACTIVE_STATUSES = [
    '9',            // Discontinued / Utgått ur sortiment
    '10',           // Blocked for sale
    '3',            // Planned discontinued / Skall utgå
    'Utgått',
    'utgått',
    'Inaktiv',
    'inaktiv',
    'Blokkert',
    'blokkert',
    'Discontinued',
    'Blocked',
    'Phased out'
];

/**
 * Status translations
 */
const STATUS_TRANSLATIONS = {
    '9': 'Utgått',
    '10': 'Blokkert for salg',
    '3': 'Skal utgå',
    'Utgått': 'Utgått',
    'Inaktiv': 'Inaktiv',
    'Blokkert': 'Blokkert',
    'Discontinued': 'Utgått',
    'Blocked': 'Blokkert',
    'Phased out': 'Utfases'
};

/**
 * InactiveItems - Display items with stock but inactive status
 */
class InactiveItems {
    static currentData = [];
    static sortColumn = 'stock';
    static sortDirection = 'desc';

    /**
     * Render the inactive items view
     * @param {Array} data - Processed item data
     * @returns {string} HTML content
     */
    static render(data) {
        this.currentData = this.filterInactiveItems(data);

        return `
            <div class="module-header">
                <h2>Inaktive varer - Artikler med beholdning men inaktiv status</h2>
                <div class="module-controls">
                    <button onclick="InactiveItems.exportCSV()" class="btn-export">Eksporter</button>
                </div>
            </div>

            <div class="alert alert-warning">
                <strong>Obs:</strong> Disse artiklene er merket som inaktive/utgått,
                men du har fortsatt lager. Vurder retur, bytte til erstatning, eller avskriving.
            </div>

            <div id="inactiveItemsContent">
                ${this.renderContent()}
            </div>
        `;
    }

    /**
     * Filter inactive items with stock
     */
    static filterInactiveItems(data) {
        return data.filter(item =>
            INACTIVE_STATUSES.includes(item.status) &&
            item.stock > 0
        );
    }

    /**
     * Render content
     */
    static renderContent() {
        let data = this.currentData;

        if (data.length === 0) {
            return `
                <div class="alert alert-success">
                    <strong>Ingen inaktive varer med beholdning!</strong>
                    Alle inaktive artikler er allerede tømt.
                </div>
            `;
        }

        // Sort
        data = this.sortData(data);

        // Calculate totals
        const totalValue = data.reduce((sum, item) => sum + this.estimateValue(item), 0);
        const totalStock = data.reduce((sum, item) => sum + item.stock, 0);

        // Group by status
        const byStatus = {};
        data.forEach(item => {
            const status = this.translateStatus(item.status);
            if (!byStatus[status]) byStatus[status] = 0;
            byStatus[status]++;
        });

        return `
            <div class="summary-cards" style="margin-bottom: 20px;">
                <div class="summary-card card-critical">
                    <div class="card-value">${data.length}</div>
                    <div class="card-label">Inaktive artikler</div>
                </div>
                <div class="summary-card">
                    <div class="card-value">${this.formatNumber(totalStock)}</div>
                    <div class="card-label">Total beholdning</div>
                </div>
                <div class="summary-card card-warning">
                    <div class="card-value">${this.formatNumber(totalValue)}</div>
                    <div class="card-label">Estimert verdi (kr)</div>
                </div>
            </div>

            <div class="table-wrapper">
                <table class="data-table">
                    <thead>
                        <tr>
                            <th class="sortable" onclick="InactiveItems.handleSort('itemNo')">
                                Artikelnr ${this.getSortIndicator('itemNo')}
                            </th>
                            <th class="sortable" onclick="InactiveItems.handleSort('description')">
                                Beskrivelse ${this.getSortIndicator('description')}
                            </th>
                            <th class="sortable" onclick="InactiveItems.handleSort('stock')">
                                Saldo ${this.getSortIndicator('stock')}
                            </th>
                            <th>Verdi (ca)</th>
                            <th class="sortable" onclick="InactiveItems.handleSort('status')">
                                Status ${this.getSortIndicator('status')}
                            </th>
                            <th>Leverandør</th>
                            <th>Anbefalt handling</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${data.map(item => `
                            <tr>
                                <td><strong>${item.itemNo}</strong></td>
                                <td>${this.truncate(item.description, 35)}</td>
                                <td class="qty-cell">${this.formatNumber(item.stock)}</td>
                                <td class="qty-cell">${this.formatNumber(this.estimateValue(item))} kr</td>
                                <td>
                                    <span class="badge ${this.getStatusClass(item.status)}">
                                        ${this.translateStatus(item.status)}
                                    </span>
                                </td>
                                <td>${this.truncate(item.supplier, 20)}</td>
                                <td>${this.getRecommendation(item)}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        `;
    }

    /**
     * Translate status code
     */
    static translateStatus(status) {
        return STATUS_TRANSLATIONS[status] || status || 'Ukjent';
    }

    /**
     * Get CSS class for status
     */
    static getStatusClass(status) {
        switch (status) {
            case '10':
            case 'Blokkert':
            case 'blokkert':
            case 'Blocked':
                return 'badge-critical';
            case '9':
            case 'Utgått':
            case 'utgått':
            case 'Discontinued':
                return 'badge-warning';
            case '3':
            case 'Phased out':
                return 'badge-info';
            default:
                return 'badge-inactive';
        }
    }

    /**
     * Get recommendation for item
     */
    static getRecommendation(item) {
        switch (item.status) {
            case '10':
            case 'Blokkert':
            case 'blokkert':
            case 'Blocked':
                return '<span class="badge badge-critical">Retur leverandør (blokkert)</span>';

            case '3':
            case 'Phased out':
                return '<span class="badge badge-warning">Selg ut eller bytt til ny</span>';

            case '9':
            case 'Utgått':
            case 'utgått':
            case 'Discontinued':
                if (item.stock > 10) {
                    return '<span class="badge badge-critical">Avskriv eller retur</span>';
                }
                return '<span class="badge badge-warning">Selg ut restlager</span>';

            default:
                return '<span class="badge badge-info">Vurder handling</span>';
        }
    }

    /**
     * Estimate item value
     */
    static estimateValue(item) {
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
     * Update content
     */
    static updateContent() {
        const container = document.getElementById('inactiveItemsContent');
        if (container) {
            container.innerHTML = this.renderContent();
        }
    }

    /**
     * Export to CSV
     */
    static exportCSV() {
        const data = this.sortData(this.currentData);

        const headers = ['Artikelnr', 'Beskrivelse', 'Saldo', 'Estimert verdi', 'Status', 'Leverandør', 'Anbefaling'];
        const rows = data.map(item => {
            let rec = 'Vurder handling';
            if (item.status === '10' || item.status === 'Blokkert') {
                rec = 'Retur leverandør';
            } else if (item.status === '3') {
                rec = 'Selg ut eller bytt';
            } else if (item.status === '9' || item.status === 'Utgått') {
                rec = item.stock > 10 ? 'Avskriv' : 'Selg ut';
            }

            return [
                item.itemNo,
                `"${(item.description || '').replace(/"/g, '""')}"`,
                item.stock,
                this.estimateValue(item),
                this.translateStatus(item.status),
                `"${(item.supplier || '').replace(/"/g, '""')}"`,
                rec
            ];
        });

        const csv = [headers.join(';'), ...rows.map(r => r.join(';'))].join('\n');

        const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `inaktive-varer-${new Date().toISOString().split('T')[0]}.csv`;
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
     * Get count of inactive items with stock
     */
    static getCount(data) {
        return this.filterInactiveItems(data).length;
    }
}

// Export to global scope
window.InactiveItems = InactiveItems;
