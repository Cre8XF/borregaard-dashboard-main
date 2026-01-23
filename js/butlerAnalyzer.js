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
        description: ['Artikelbeskrivelse', 'Beskrivelse', 'Item Name', 'Description'],

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
        shelf1: ['Hylla 1', 'Shelf1', 'Shelf 1'],

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

        // Update status badge with detailed info
        const criticalIssues = enrichedData.filter(item =>
            (item._isActive && item._isZeroStock && item._minNum > 0) ||
            item._isNegative ||
            (item._hasBelowMin && item._stockNum < item._minNum * 0.5)
        ).length;

        statusBadge.textContent = `${enrichedData.length} artikkler lastet`;
        statusBadge.className = 'status-badge ' + (criticalIssues > 50 ? 'critical' : criticalIssues > 0 ? 'warning' : 'ok');

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

        // Tab navigation with icons
        html += '<div class="butler-tabs">';
        html += '<button class="tab active" data-view="zeroStock">⚠️ 0 i saldo (Aktiv)</button>';
        html += '<button class="tab" data-view="negative">🔴 Negativ saldo</button>';
        html += '<button class="tab" data-view="belowMin">📉 Under minimum</button>';
        html += '<button class="tab" data-view="noMovement">💤 Ingen bevegelse R12</button>';
        html += '<button class="tab" data-view="highReserve">🔒 Høy reservasjon</button>';
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
        let viewIcon = '';

        switch(viewName) {
            case 'zeroStock':
                filteredData = data.filter(item => item._isActive && item._isZeroStock);
                viewTitle = '0 i saldo (Aktiv)';
                viewIcon = '⚠️';
                columns = ['_itemNo', '_description', '_shelf1', '_availableStock', '_reserved', '_min', '_r12Sales', '_supplier'];
                break;

            case 'negative':
                filteredData = data.filter(item => item._isNegative);
                viewTitle = 'Negativ saldo';
                viewIcon = '🔴';
                columns = ['_itemNo', '_description', '_shelf1', '_stock', '_availableStock', '_reserved', '_supplier'];
                break;

            case 'belowMin':
                filteredData = data.filter(item => item._hasBelowMin);
                viewTitle = 'Under minimum (BP)';
                viewIcon = '📉';
                columns = ['_itemNo', '_description', '_shelf1', '_stock', '_min', '_max', '_r12Sales', '_supplier'];
                break;

            case 'noMovement':
                filteredData = data.filter(item => item._hasNoMovement && item._isActive);
                viewTitle = 'Ingen bevegelse R12';
                viewIcon = '💤';
                columns = ['_itemNo', '_description', '_shelf1', '_stock', '_availableStock', '_r12Sales', '_supplier'];
                break;

            case 'highReserve':
                filteredData = data.filter(item => item._hasHighReserve);
                viewTitle = 'Høy reservasjon (>70%)';
                viewIcon = '🔒';
                columns = ['_itemNo', '_description', '_shelf1', '_stock', '_reserved', '_reservePercent', '_availableStock', '_supplier'];
                break;

            default:
                filteredData = data.filter(item => item._isActive && item._isZeroStock);
                viewTitle = '0 i saldo (Aktiv)';
                viewIcon = '⚠️';
                columns = ['_itemNo', '_description', '_shelf1', '_availableStock', '_reserved', '_min', '_r12Sales', '_supplier'];
        }

        let html = '';

        // Quick stats card
        html += this.renderStatsCard(filteredData, data, viewName);

        // Header with count
        html += `<h3 style="margin-top: 20px; margin-bottom: 15px;">${viewIcon} ${viewTitle}</h3>`;

        // Table controls (search + result count + export)
        html += '<div class="table-controls">';
        html += '<div class="butler-search-wrapper">';
        html += `<input type="text" id="butlerSearch" placeholder="Søk etter artikelnr, beskrivelse, leverandør..." class="search-input">`;
        html += `<button class="butler-search-clear" id="butlerSearchClear">Tøm</button>`;
        html += '</div>';
        html += `<span class="butler-result-count" id="butlerResultCount">Viser ${filteredData.length} av ${filteredData.length} artikkler</span>`;
        html += `<button onclick="ButlerAnalyzer.exportCurrentView('${viewName}', '${viewTitle}')" class="btn-secondary">📥 Eksporter til CSV</button>`;
        html += '</div>';

        if (filteredData.length === 0) {
            html += '<p class="text-muted">Ingen artikkler funnet for dette filteret.</p>';
            contentDiv.innerHTML = html;
            return;
        }

        // Initialize pagination
        this._currentPage = 1;
        this._itemsPerPage = 100;
        this._allFilteredData = filteredData;

        // Render table with pagination
        html += this.renderTableWithPagination(filteredData, columns, viewName);

        contentDiv.innerHTML = html;

        // Store current view data for export and details
        this._currentViewData = filteredData;
        this._currentViewName = viewName;

        // Initialize search and pagination
        this.initializeSearch();
        this.initializePagination();
    }

    /**
     * Render stats card for the current view
     */
    static renderStatsCard(filteredData, allData, viewName) {
        let html = '<div class="butler-stats-card">';

        // Total items in view
        html += '<div class="butler-stat-item">';
        html += '<div class="stat-icon">📊</div>';
        html += `<span class="stat-value">${filteredData.length}</span>`;
        html += '<div class="stat-label">Artikkler i visning</div>';
        html += '</div>';

        // Total items loaded
        html += '<div class="butler-stat-item ok">';
        html += '<div class="stat-icon">🏭</div>';
        html += `<span class="stat-value">${allData.length}</span>`;
        html += '<div class="stat-label">Totalt lastet</div>';
        html += '</div>';

        // View-specific stats
        if (viewName === 'zeroStock') {
            const criticalCount = filteredData.filter(i => i._minNum > 0).length;
            html += `<div class="butler-stat-item ${criticalCount > 0 ? 'critical' : 'ok'}">`;
            html += '<div class="stat-icon">🚨</div>';
            html += `<span class="stat-value">${criticalCount}</span>`;
            html += '<div class="stat-label">Har definert minimum</div>';
            html += '</div>';
        } else if (viewName === 'negative') {
            const veryNegative = filteredData.filter(i => i._stockNum < -10).length;
            html += `<div class="butler-stat-item ${veryNegative > 0 ? 'critical' : 'warning'}">`;
            html += '<div class="stat-icon">⚠️</div>';
            html += `<span class="stat-value">${veryNegative}</span>`;
            html += '<div class="stat-label">Under -10</div>';
            html += '</div>';
        } else if (viewName === 'belowMin') {
            const critical = filteredData.filter(i => i._stockNum < (i._minNum * 0.5)).length;
            html += `<div class="butler-stat-item ${critical > 0 ? 'critical' : 'warning'}">`;
            html += '<div class="stat-icon">🔴</div>';
            html += `<span class="stat-value">${critical}</span>`;
            html += '<div class="stat-label">Under 50% av minimum</div>';
            html += '</div>';
        } else if (viewName === 'noMovement') {
            const hasStock = filteredData.filter(i => i._stockNum > 0).length;
            html += `<div class="butler-stat-item warning">`;
            html += '<div class="stat-icon">📦</div>';
            html += `<span class="stat-value">${hasStock}</span>`;
            html += '<div class="stat-label">Med lagerbeholdning</div>';
            html += '</div>';
        } else if (viewName === 'highReserve') {
            const veryHigh = filteredData.filter(i => i._reservePercent > 90).length;
            html += `<div class="butler-stat-item ${veryHigh > 0 ? 'critical' : 'warning'}">`;
            html += '<div class="stat-icon">🔒</div>';
            html += `<span class="stat-value">${veryHigh}</span>`;
            html += '<div class="stat-label">Over 90% reservert</div>';
            html += '</div>';
        }

        html += '</div>';
        return html;
    }

    /**
     * Render table with pagination
     */
    static renderTableWithPagination(filteredData, columns, viewName) {
        const startIdx = (this._currentPage - 1) * this._itemsPerPage;
        const endIdx = Math.min(startIdx + this._itemsPerPage, filteredData.length);
        const pageData = filteredData.slice(startIdx, endIdx);
        const totalPages = Math.ceil(filteredData.length / this._itemsPerPage);

        let html = '';

        // Data table with wrapper for sticky header
        html += '<div class="butler-table-wrapper">';
        html += '<table class="data-table" id="butlerDataTable">';
        html += '<thead><tr>';

        // Column headers
        const columnLabels = {
            '_itemNo': 'Artikelnr',
            '_itemName': 'Beskrivelse',
            '_description': 'Beskrivelse',
            '_shelf1': 'Hylla',
            '_stock': 'Saldo',
            '_availableStock': 'Disponibel',
            '_reserved': 'Reservert',
            '_min': 'BP (Min)',
            '_max': 'Max',
            '_r12Sales': 'R12',
            '_supplier': 'Leverandør',
            '_location': 'Lokasjon',
            '_reservePercent': 'Reserv %'
        };

        columns.forEach(col => {
            html += `<th>${columnLabels[col] || col}</th>`;
        });
        html += '<th>Detaljer</th>';
        html += '</tr></thead><tbody>';

        // Data rows
        pageData.forEach((item, index) => {
            const absoluteIndex = startIdx + index;
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
            html += `<td><button class="btn-small" onclick="ButlerAnalyzer.showDetails(${absoluteIndex}, '${viewName}')">Detaljer</button></td>`;
            html += '</tr>';
        });

        html += '</tbody></table>';
        html += '</div>';

        // Pagination controls
        if (totalPages > 1) {
            html += '<div class="butler-pagination">';
            html += `<button onclick="ButlerAnalyzer.goToPage(1)" ${this._currentPage === 1 ? 'disabled' : ''}>⏮️ Første</button>`;
            html += `<button onclick="ButlerAnalyzer.goToPage(${this._currentPage - 1})" ${this._currentPage === 1 ? 'disabled' : ''}>◀️ Forrige</button>`;
            html += `<span class="page-info">Side ${this._currentPage} av ${totalPages} (Viser ${startIdx + 1}-${endIdx} av ${filteredData.length})</span>`;
            html += `<button onclick="ButlerAnalyzer.goToPage(${this._currentPage + 1})" ${this._currentPage === totalPages ? 'disabled' : ''}>Neste ▶️</button>`;
            html += `<button onclick="ButlerAnalyzer.goToPage(${totalPages})" ${this._currentPage === totalPages ? 'disabled' : ''}>Siste ⏭️</button>`;
            html += '</div>';
        }

        return html;
    }

    /**
     * Go to specific page
     */
    static goToPage(pageNum) {
        const totalPages = Math.ceil(this._allFilteredData.length / this._itemsPerPage);

        if (pageNum < 1 || pageNum > totalPages) return;

        this._currentPage = pageNum;

        // Re-render the view
        this.renderView(this._currentViewName, this._enrichedData);
    }

    /**
     * Initialize pagination
     */
    static initializePagination() {
        // Pagination is handled via onclick handlers in the HTML
    }

    /**
     * Initialize search functionality with debouncing
     */
    static initializeSearch() {
        const searchInput = document.getElementById('butlerSearch');
        const searchClear = document.getElementById('butlerSearchClear');
        const table = document.getElementById('butlerDataTable');
        const resultCount = document.getElementById('butlerResultCount');

        if (!searchInput || !table) return;

        let searchTimeout;

        // Search with debouncing
        searchInput.addEventListener('input', (e) => {
            clearTimeout(searchTimeout);

            const searchTerm = e.target.value.toLowerCase();

            // Show/hide clear button
            if (searchClear) {
                searchClear.classList.toggle('visible', searchTerm.length > 0);
            }

            // Debounce search by 300ms
            searchTimeout = setTimeout(() => {
                const rows = table.querySelectorAll('tbody tr');
                let visibleCount = 0;

                rows.forEach(row => {
                    const text = row.textContent.toLowerCase();
                    const matches = text.includes(searchTerm);
                    row.style.display = matches ? '' : 'none';
                    if (matches) visibleCount++;
                });

                // Update result count
                if (resultCount) {
                    const totalCount = this._currentViewData.length;
                    if (searchTerm) {
                        resultCount.textContent = `Viser ${visibleCount} av ${totalCount} artikkler`;
                    } else {
                        resultCount.textContent = `Viser ${totalCount} av ${totalCount} artikkler`;
                    }
                }
            }, 300);
        });

        // Clear button
        if (searchClear) {
            searchClear.addEventListener('click', () => {
                searchInput.value = '';
                searchClear.classList.remove('visible');
                const rows = table.querySelectorAll('tbody tr');
                rows.forEach(row => row.style.display = '');

                // Reset result count
                if (resultCount) {
                    const totalCount = this._currentViewData.length;
                    resultCount.textContent = `Viser ${totalCount} av ${totalCount} artikkler`;
                }
            });
        }
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
            { label: 'Beskrivelse', value: item._description || item._itemName },
            { label: 'Hylla', value: item._shelf1 },
            { label: 'Status', value: item._status + (item._isActive ? ' (Aktiv)' : ' (Inaktiv)') },
            { label: 'Lagersaldo', value: item._stockNum },
            { label: 'Disponibel', value: item._availableStockNum },
            { label: 'Reservert', value: item._reservedNum },
            { label: 'BP (Min)', value: item._minNum },
            { label: 'Max', value: item._maxNum },
            { label: 'R12 Salg', value: item._r12SalesNum },
            { label: 'Leverandør', value: item._supplier },
            { label: 'Lokasjon', value: item._location },
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
            'Hylla',
            'Status',
            'Lagersaldo',
            'Disponibel',
            'Reservert',
            'BP (Min)',
            'Max',
            'R12 Salg',
            'Leverandør',
            'Lokasjon',
            'Reservasjon %'
        ];

        // Build CSV with UTF-8 BOM for Norwegian characters
        let csv = headers.join(';') + '\n';

        data.forEach(item => {
            const row = [
                item._itemNo || '',
                `"${((item._description || item._itemName) || '').replace(/"/g, '""')}"`,
                item._shelf1 || '',
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
