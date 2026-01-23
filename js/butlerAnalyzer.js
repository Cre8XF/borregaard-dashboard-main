// ===================================
// BUTLER DATA ANALYZER
// Daily warehouse analysis for ~2800 items with 70+ columns
// Five predefined views with filtering, search, and export
// ===================================

/**
 * ButlerAnalyzer - Warehouse data analysis module
 * Handles Butler exports with Swedish/Norwegian column headers
 * Provides multiple filtered views and detailed item inspection
 */
class ButlerAnalyzer {
    /**
     * Column mapping from Butler's Swedish/Norwegian headers to internal fields
     */
    static BUTLER_COLUMNS = {
        // Item identification
        itemNo: ['Artikelnr', 'Artikelnummer', 'ItemNo', 'Item Number'],
        itemName: ['Artikelbeskrivelse', 'Beskrivelse', 'Item Name', 'Description'],

        // Stock levels
        stock: ['Lagersaldo', 'Stock', 'Beholdning', 'OnHand'],
        availableStock: ['DispLagSaldo', 'Disponibel', 'Available', 'AvailableStock'],
        reserved: ['ReservAnt', 'Reservert', 'Reserved', 'ReservedQty'],

        // Min/Max levels
        min: ['BP', 'Beställningspunkt', 'Min', 'Minimum', 'ReorderPoint'],
        max: ['Maxlager', 'Max', 'Maximum', 'MaxStock'],

        // Status
        status: ['Artikelstatus', 'Status', 'ItemStatus'],

        // Sales data
        r12Sales: ['R12 Del Qty', 'R12', 'Rolling12', 'R12Sales'],

        // Supplier
        supplier: ['Supplier Name', 'Leverandør', 'Leverandørnavn', 'Supplier'],

        // Location
        location: ['Lagerhylla', 'Hylla', 'Location', 'Bin', 'ShelfLocation'],

        // Additional useful fields
        category: ['Kategori', 'Category', 'ProductGroup'],
        unit: ['Enhet', 'Unit', 'UoM'],
        price: ['Pris', 'Price', 'UnitPrice'],
        leadTime: ['Leveranstid', 'Leveringstid', 'LeadTime']
    };

    /**
     * Update the Butler analysis display
     */
    static update(data) {
        const resultsDiv = document.getElementById('butlerResults');
        const statusBadge = document.getElementById('butlerStatus');

        if (!data || data.length === 0) {
            resultsDiv.innerHTML = `
                <p class="placeholder">
                    Last opp daglig Butler Excel-eksport for å analysere lagerdata.
                    <br><br>
                    <strong>Forventet format:</strong> Excel-fil med kolonner som Artikelnr, Lagersaldo, DispLagSaldo, BP, R12 Del Qty, etc.
                </p>
            `;
            statusBadge.textContent = 'Ingen data';
            statusBadge.className = 'status-badge';
            return;
        }

        // Enrich data with parsed values and flags
        const enrichedData = this.enrichData(data);

        // Update status badge
        statusBadge.textContent = `${enrichedData.length} artikkler`;
        statusBadge.className = 'status-badge ok';

        // Render the Butler module with tabs
        resultsDiv.innerHTML = this.renderButlerModule(enrichedData);

        // Initialize event listeners
        this.initializeEventListeners(enrichedData);

        // Store enriched data for later use
        this._enrichedData = enrichedData;
    }

    /**
     * Enrich data with parsed values and calculated flags
     */
    static enrichData(data) {
        return data.map(row => {
            const enriched = { ...row };

            // Map Butler columns to standard fields
            Object.keys(this.BUTLER_COLUMNS).forEach(field => {
                const variants = this.BUTLER_COLUMNS[field];
                for (let variant of variants) {
                    if (row[variant] !== undefined && row[variant] !== '') {
                        enriched[`_${field}`] = row[variant];
                        break;
                    }
                }
            });

            // Parse numeric values
            enriched._stockNum = this.parseNumber(enriched._stock);
            enriched._availableStockNum = this.parseNumber(enriched._availableStock);
            enriched._reservedNum = this.parseNumber(enriched._reserved);
            enriched._minNum = this.parseNumber(enriched._min);
            enriched._maxNum = this.parseNumber(enriched._max);
            enriched._r12SalesNum = this.parseNumber(enriched._r12Sales);

            // Boolean flags for filtering
            enriched._isActive = (enriched._status === '0' || enriched._status === 'Active' || enriched._status === 'Aktiv');
            enriched._isZeroStock = enriched._stockNum === 0;
            enriched._isNegative = enriched._stockNum < 0;
            enriched._hasBelowMin = enriched._stockNum < enriched._minNum && enriched._minNum > 0;
            enriched._hasNoMovement = enriched._r12SalesNum === 0;

            // High reservation: reserved > 70% of stock
            if (enriched._stockNum > 0 && enriched._reservedNum > 0) {
                const reservePercent = (enriched._reservedNum / enriched._stockNum) * 100;
                enriched._hasHighReserve = reservePercent > 70;
                enriched._reservePercent = reservePercent;
            } else {
                enriched._hasHighReserve = false;
                enriched._reservePercent = 0;
            }

            return enriched;
        });
    }

    /**
     * Parse number from string, handling Norwegian/Swedish formats
     */
    static parseNumber(value) {
        if (value === undefined || value === null || value === '') return 0;

        // Convert to string and clean
        let str = value.toString().trim();

        // Replace comma with dot for decimal separator
        str = str.replace(',', '.');

        // Remove spaces
        str = str.replace(/\s/g, '');

        const num = parseFloat(str);
        return isNaN(num) ? 0 : num;
    }

    /**
     * Render the Butler module with tabs
     */
    static renderButlerModule(data) {
        let html = '';

        // Tab navigation
        html += '<div class="butler-tabs">';
        html += '<button class="tab active" data-view="zeroStock">0 i saldo (Aktiv)</button>';
        html += '<button class="tab" data-view="negative">Negativ saldo</button>';
        html += '<button class="tab" data-view="belowMin">Under minimum</button>';
        html += '<button class="tab" data-view="noMovement">Ingen bevegelse R12</button>';
        html += '<button class="tab" data-view="highReserve">Høy reservasjon</button>';
        html += '</div>';

        // Results area for each view
        html += '<div id="butlerViewContent"></div>';

        return html;
    }

    /**
     * Initialize event listeners for tabs, search, and export
     */
    static initializeEventListeners(data) {
        const tabs = document.querySelectorAll('.butler-tabs .tab');

        tabs.forEach(tab => {
            tab.addEventListener('click', (e) => {
                // Update active tab
                tabs.forEach(t => t.classList.remove('active'));
                e.target.classList.add('active');

                // Render the selected view
                const view = e.target.getAttribute('data-view');
                this.renderView(view, data);

                // Store active tab in localStorage
                localStorage.setItem('butlerActiveTab', view);
            });
        });

        // Load initial view (restore from localStorage or default)
        const savedTab = localStorage.getItem('butlerActiveTab') || 'zeroStock';
        const activeTab = document.querySelector(`.butler-tabs .tab[data-view="${savedTab}"]`);
        if (activeTab) {
            activeTab.click();
        } else {
            this.renderView('zeroStock', data);
        }
    }

    /**
     * Render a specific view
     */
    static renderView(viewName, data) {
        const contentDiv = document.getElementById('butlerViewContent');

        let filteredData = [];
        let viewTitle = '';
        let columns = [];

        switch(viewName) {
            case 'zeroStock':
                filteredData = data.filter(item => item._isActive && item._isZeroStock);
                viewTitle = '0 i saldo (Aktiv)';
                columns = ['_itemNo', '_itemName', '_availableStock', '_reserved', '_min', '_r12Sales', '_supplier'];
                break;

            case 'negative':
                filteredData = data.filter(item => item._isNegative);
                viewTitle = 'Negativ saldo';
                columns = ['_itemNo', '_itemName', '_stock', '_availableStock', '_reserved', '_location', '_supplier'];
                break;

            case 'belowMin':
                filteredData = data.filter(item => item._hasBelowMin);
                viewTitle = 'Under minimum (BP)';
                columns = ['_itemNo', '_itemName', '_stock', '_min', '_max', '_r12Sales', '_supplier'];
                break;

            case 'noMovement':
                filteredData = data.filter(item => item._hasNoMovement && item._isActive);
                viewTitle = 'Ingen bevegelse R12';
                columns = ['_itemNo', '_itemName', '_stock', '_availableStock', '_r12Sales', '_location', '_supplier'];
                break;

            case 'highReserve':
                filteredData = data.filter(item => item._hasHighReserve);
                viewTitle = 'Høy reservasjon (>70%)';
                columns = ['_itemNo', '_itemName', '_stock', '_reserved', '_reservePercent', '_availableStock', '_supplier'];
                break;

            default:
                filteredData = data.filter(item => item._isActive && item._isZeroStock);
                viewTitle = '0 i saldo (Aktiv)';
                columns = ['_itemNo', '_itemName', '_availableStock', '_reserved', '_min', '_r12Sales', '_supplier'];
        }

        let html = '';

        // Header with count
        html += `<h3 style="margin-top: 20px;">${viewTitle} <span style="color: #7f8c8d; font-weight: normal;">(${filteredData.length} artikkler)</span></h3>`;

        // Table controls (search + export)
        html += '<div class="table-controls">';
        html += `<input type="text" id="butlerSearch" placeholder="Søk i tabellen..." class="search-input">`;
        html += `<button onclick="ButlerAnalyzer.exportCurrentView('${viewName}', '${viewTitle}')" class="btn-secondary">📥 Eksporter til CSV</button>`;
        html += '</div>';

        if (filteredData.length === 0) {
            html += '<p class="text-muted">Ingen artikkler funnet for dette filteret.</p>';
            contentDiv.innerHTML = html;
            return;
        }

        // Data table
        html += '<div style="overflow-x: auto;">';
        html += '<table class="data-table" id="butlerDataTable">';
        html += '<thead><tr>';

        // Column headers
        const columnLabels = {
            '_itemNo': 'Artikelnr',
            '_itemName': 'Beskrivelse',
            '_stock': 'Saldo',
            '_availableStock': 'Disponibel',
            '_reserved': 'Reservert',
            '_min': 'BP (Min)',
            '_max': 'Max',
            '_r12Sales': 'R12',
            '_supplier': 'Leverandør',
            '_location': 'Hylla',
            '_reservePercent': 'Reserv %'
        };

        columns.forEach(col => {
            html += `<th>${columnLabels[col] || col}</th>`;
        });
        html += '<th>Detaljer</th>';
        html += '</tr></thead><tbody>';

        // Data rows
        filteredData.forEach((item, index) => {
            html += '<tr>';

            columns.forEach(col => {
                let value = item[col] || '';

                // Format numeric columns
                if (col.includes('stock') || col.includes('reserved') || col.includes('min') || col.includes('max') || col.includes('r12')) {
                    const num = this.parseNumber(value);
                    value = num.toFixed(0);
                    html += `<td class="qty-cell">${value}</td>`;
                } else if (col === '_reservePercent') {
                    value = item._reservePercent.toFixed(1) + '%';
                    html += `<td class="qty-cell">${value}</td>`;
                } else {
                    html += `<td>${value}</td>`;
                }
            });

            // Details button
            html += `<td><button class="btn-small" onclick="ButlerAnalyzer.showDetails(${index}, '${viewName}')">Detaljer</button></td>`;
            html += '</tr>';
        });

        html += '</tbody></table>';
        html += '</div>';

        contentDiv.innerHTML = html;

        // Store current view data for export and details
        this._currentViewData = filteredData;
        this._currentViewName = viewName;

        // Initialize search
        this.initializeSearch();
    }

    /**
     * Initialize search functionality
     */
    static initializeSearch() {
        const searchInput = document.getElementById('butlerSearch');
        const table = document.getElementById('butlerDataTable');

        if (!searchInput || !table) return;

        searchInput.addEventListener('input', (e) => {
            const searchTerm = e.target.value.toLowerCase();
            const rows = table.querySelectorAll('tbody tr');

            rows.forEach(row => {
                const text = row.textContent.toLowerCase();
                row.style.display = text.includes(searchTerm) ? '' : 'none';
            });
        });
    }

    /**
     * Show detail modal for an item
     */
    static showDetails(index, viewName) {
        const item = this._currentViewData[index];
        if (!item) return;

        const modal = document.createElement('div');
        modal.className = 'modal-overlay';

        let html = '<div class="modal-content" style="max-width: 800px;">';

        // Header
        html += '<div class="modal-header">';
        html += `<h3>Detaljer: ${item._itemNo || 'Ukjent'}</h3>`;
        html += '<button class="modal-close" onclick="this.closest(\'.modal-overlay\').remove()">×</button>';
        html += '</div>';

        // Body
        html += '<div class="modal-body">';

        // Key metrics in grid
        html += '<h4>Hovedinformasjon</h4>';
        html += '<div class="detail-grid">';

        const keyFields = [
            { label: 'Artikelnr', value: item._itemNo },
            { label: 'Beskrivelse', value: item._itemName },
            { label: 'Status', value: item._status + (item._isActive ? ' (Aktiv)' : ' (Inaktiv)') },
            { label: 'Lagersaldo', value: item._stockNum },
            { label: 'Disponibel', value: item._availableStockNum },
            { label: 'Reservert', value: item._reservedNum },
            { label: 'BP (Min)', value: item._minNum },
            { label: 'Max', value: item._maxNum },
            { label: 'R12 Salg', value: item._r12SalesNum },
            { label: 'Leverandør', value: item._supplier },
            { label: 'Hylla', value: item._location },
            { label: 'Reservasjon %', value: item._reservePercent.toFixed(1) + '%' }
        ];

        keyFields.forEach(field => {
            html += '<div class="detail-item">';
            html += `<strong>${field.label}</strong>`;
            html += `<div>${field.value || '-'}</div>`;
            html += '</div>';
        });

        html += '</div>';

        // All original Butler fields in expandable section
        html += '<h4 style="margin-top: 20px; cursor: pointer;" onclick="this.nextElementSibling.style.display = this.nextElementSibling.style.display === \'none\' ? \'block\' : \'none\'">▶ Alle felt fra Butler (klikk for å vise/skjule)</h4>';
        html += '<div style="display: none; max-height: 400px; overflow-y: auto; margin-top: 10px;">';
        html += '<table class="data-table">';
        html += '<thead><tr><th>Felt</th><th>Verdi</th></tr></thead><tbody>';

        Object.keys(item).sort().forEach(key => {
            if (!key.startsWith('_')) {  // Show only original Butler columns
                html += '<tr>';
                html += `<td><strong>${key}</strong></td>`;
                html += `<td>${item[key] || '-'}</td>`;
                html += '</tr>';
            }
        });

        html += '</tbody></table>';
        html += '</div>';

        html += '</div>';

        // Footer
        html += '<div class="modal-footer">';
        html += '<button class="btn-primary" onclick="this.closest(\'.modal-overlay\').remove()">Lukk</button>';
        html += '</div>';

        html += '</div>';

        modal.innerHTML = html;
        document.body.appendChild(modal);
    }

    /**
     * Export current view to CSV
     */
    static exportCurrentView(viewName, viewTitle) {
        const data = this._currentViewData;

        if (!data || data.length === 0) {
            alert('Ingen data å eksportere');
            return;
        }

        // Prepare headers
        const headers = [
            'Artikelnr',
            'Beskrivelse',
            'Status',
            'Lagersaldo',
            'Disponibel',
            'Reservert',
            'BP (Min)',
            'Max',
            'R12 Salg',
            'Leverandør',
            'Hylla',
            'Reservasjon %'
        ];

        // Build CSV with UTF-8 BOM for Norwegian characters
        let csv = headers.join(';') + '\n';

        data.forEach(item => {
            const row = [
                item._itemNo || '',
                `"${(item._itemName || '').replace(/"/g, '""')}"`,
                item._status || '',
                item._stockNum || 0,
                item._availableStockNum || 0,
                item._reservedNum || 0,
                item._minNum || 0,
                item._maxNum || 0,
                item._r12SalesNum || 0,
                `"${(item._supplier || '').replace(/"/g, '""')}"`,
                item._location || '',
                item._reservePercent.toFixed(1)
            ];

            csv += row.join(';') + '\n';
        });

        // Create blob with UTF-8 BOM
        const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;

        const filename = `butler-${viewName}-${new Date().toISOString().split('T')[0]}.csv`;
        a.download = filename;
        a.click();

        URL.revokeObjectURL(url);
    }
}

// Export to window for global access
window.ButlerAnalyzer = ButlerAnalyzer;
