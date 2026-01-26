// ===================================
// LOCATION ANALYZER - BORREGAARD DASHBOARD
// Per-location sales analysis with Butler integration
// ===================================

/**
 * LocationAnalyzer - Detaljert analyse per leveringslokasjon
 *
 * WHY THIS MODULE EXISTS:
 * - Tools → Borregaard data contains "Delivery location ID" which identifies
 *   which of the 9 warehouses/locations ordered each item
 * - This allows per-warehouse analysis instead of just totals
 * - Combined with Butler data, we can identify which locations need restocking
 *
 * KEY DATA:
 * - 14,330 order lines
 * - 2,302 unique items
 * - 9 delivery locations (7 satellites + main warehouse + special warehouse)
 * - Period: 2025-01-02 to 2026-01-23
 */
class LocationAnalyzer {
    /**
     * Location ID to Name mapping
     * Based on actual data from c2409b41-9fae-4adb-b5c1-4d2b84c8dc5a.xlsx
     */
    static LOCATIONS = {
        '424186': 'Hovedlager',
        '424186-1': 'Satellitt 1',
        '424186-2': 'Satellitt 2',
        '424186-3': 'Satellitt 3',
        '424186-4': 'Satellitt 4',
        '424186-5': 'Satellitt 5',
        '424186-6': 'Satellitt 6',
        '424186-7': 'Satellitt 7',
        '10003790': 'Spesiallager'
    };

    /**
     * Column mapping for flexible data import
     * Supports multiple naming conventions from different export systems
     */
    static ORDER_COLUMNS = {
        date: ['Date', 'Dato', 'Order Date', 'OrdDtm'],
        customerId: ['Customer ID', 'Customer', 'Kundenr', 'Företagsnamn'],
        deliveryLocationId: ['Delivery location ID', 'Delivery Location ID', 'Location ID', 'Leveringssted'],
        itemId: ['Item ID', 'Artikelnr', 'Item Number', 'ItemNo'],
        itemName: ['Item', 'Item Name', 'Beskrivelse', 'Artikelbeskrivning', 'Description'],
        orderNumber: ['Order number', 'Ordrenr', 'Order Nr', 'OrderNr'],
        quantity: ['Delivered quantity', 'Antall', 'Quantity', 'OrdRadAnt'],
        value: ['Delivered value', 'Value', 'Verdi', 'Ord.radbelopp val']
    };

    /**
     * Internal storage for analysis results
     */
    static _analysis = null;
    static _enrichedData = null;

    /**
     * Update the location analysis display
     * @param {Array} data - Raw order data from file upload
     */
    static update(data) {
        const resultsDiv = document.getElementById('locationResults');
        const statusBadge = document.getElementById('locationStatus');

        if (!resultsDiv) {
            console.warn('LocationAnalyzer: #locationResults not found');
            return;
        }

        if (!data || data.length === 0) {
            resultsDiv.innerHTML = `
                <p class="placeholder">
                    Last opp salgshistorikk med leveringslokasjoner for analyse.
                    <br><br>
                    <strong>Forventet:</strong> Fil med "Delivery location ID" kolonne
                    <br>
                    <strong>Eksempel:</strong> c2409b41-9fae-4adb-b5c1-4d2b84c8dc5a.xlsx
                </p>
            `;
            if (statusBadge) {
                statusBadge.textContent = 'Ingen data';
                statusBadge.className = 'status-badge';
            }
            return;
        }

        // Enrich data with standardized field names
        const enrichedData = this.enrichData(data);

        if (enrichedData.length === 0) {
            resultsDiv.innerHTML = `
                <div class="alert alert-warning">
                    <p><strong>Ingen gyldige rader funnet.</strong></p>
                    <p>Sjekk at filen inneholder kolonnene:</p>
                    <ul>
                        <li>Delivery location ID</li>
                        <li>Item ID</li>
                        <li>Delivered quantity</li>
                    </ul>
                </div>
            `;
            return;
        }

        // Update status badge
        const uniqueLocations = new Set(enrichedData.map(row => row._locationId)).size;
        if (statusBadge) {
            statusBadge.textContent = `${uniqueLocations} lokasjoner`;
            statusBadge.className = 'status-badge ok';
        }

        // Analyze by location
        const analysis = this.analyzeByLocation(enrichedData);

        // Store for cross-module access
        this._analysis = analysis;
        this._enrichedData = enrichedData;

        // Render dashboard
        resultsDiv.innerHTML = this.renderLocationDashboard(analysis, enrichedData);

        // Initialize sortable tables after render
        setTimeout(() => {
            if (window.SortableTable) {
                window.SortableTable.init('locationSummaryTable');
            }
        }, 100);

        console.log(`LocationAnalyzer: Loaded ${enrichedData.length} rows, ${uniqueLocations} locations`);
    }

    /**
     * Enrich order data with mapped fields
     * @param {Array} data - Raw data rows
     * @returns {Array} Enriched data with _prefixed standardized fields
     */
    static enrichData(data) {
        return data.map(row => {
            const enriched = { ...row };

            // Map each field using column variants
            Object.keys(this.ORDER_COLUMNS).forEach(field => {
                const variants = this.ORDER_COLUMNS[field];
                for (const variant of variants) {
                    if (row[variant] !== undefined && row[variant] !== '') {
                        enriched[`_${field}`] = row[variant];
                        break;
                    }
                }
            });

            // Normalize location ID (handle with/without leading zeros)
            if (enriched._deliveryLocationId) {
                enriched._locationId = String(enriched._deliveryLocationId).trim();
            }

            // Parse date using centralized DateParser
            if (enriched._date && window.DateParser) {
                enriched._dateObj = window.DateParser.parse(enriched._date);
                if (enriched._dateObj) {
                    enriched._week = window.DateParser.getWeekNumber(enriched._dateObj);
                    enriched._year = enriched._dateObj.getFullYear();
                    enriched._month = enriched._dateObj.getMonth() + 1;
                }
            }

            // Parse numeric values
            if (window.DateParser) {
                enriched._quantityNum = window.DateParser.parseNumber(enriched._quantity);
                enriched._valueNum = window.DateParser.parseNumber(enriched._value);
            } else {
                enriched._quantityNum = parseFloat(enriched._quantity) || 0;
                enriched._valueNum = parseFloat(enriched._value) || 0;
            }

            return enriched;
        }).filter(row => row._itemId && row._locationId);
    }

    /**
     * Analyze data grouped by location
     * @param {Array} data - Enriched data
     * @returns {Array} Location analysis objects sorted by order count
     */
    static analyzeByLocation(data) {
        const locations = {};

        data.forEach(row => {
            const loc = row._locationId;
            const item = row._itemId;

            if (!locations[loc]) {
                locations[loc] = {
                    id: loc,
                    name: this.LOCATIONS[loc] || loc,
                    totalOrders: 0,
                    totalValue: 0,
                    totalQuantity: 0,
                    uniqueItems: new Set(),
                    items: {},
                    dateRange: { min: null, max: null }
                };
            }

            const locData = locations[loc];
            locData.totalOrders++;
            locData.totalValue += row._valueNum;
            locData.totalQuantity += row._quantityNum;
            locData.uniqueItems.add(item);

            // Track date range
            if (row._dateObj) {
                if (!locData.dateRange.min || row._dateObj < locData.dateRange.min) {
                    locData.dateRange.min = row._dateObj;
                }
                if (!locData.dateRange.max || row._dateObj > locData.dateRange.max) {
                    locData.dateRange.max = row._dateObj;
                }
            }

            // Track per-item data
            if (!locData.items[item]) {
                locData.items[item] = {
                    itemId: item,
                    itemName: row._itemName || '',
                    totalQty: 0,
                    totalValue: 0,
                    orderCount: 0,
                    orders: []
                };
            }

            const itemData = locData.items[item];
            itemData.totalQty += row._quantityNum;
            itemData.totalValue += row._valueNum;
            itemData.orderCount++;
            itemData.orders.push({
                date: row._dateObj,
                qty: row._quantityNum,
                value: row._valueNum,
                orderNumber: row._orderNumber
            });
        });

        // Convert to array and calculate derived metrics
        return Object.values(locations).map(loc => {
            loc.uniqueItemCount = loc.uniqueItems.size;
            delete loc.uniqueItems; // Remove Set for cleaner data

            // Sort items by order count (frequency)
            loc.topItems = Object.values(loc.items)
                .sort((a, b) => b.orderCount - a.orderCount)
                .slice(0, 20);

            // Calculate frequently ordered items (≥3 orders)
            loc.frequentItems = Object.values(loc.items)
                .filter(item => item.orderCount >= 3)
                .sort((a, b) => b.orderCount - a.orderCount);

            loc.frequentItemCount = loc.frequentItems.length;

            return loc;
        }).sort((a, b) => b.totalOrders - a.totalOrders);
    }

    /**
     * Render location dashboard
     * @param {Array} locations - Analyzed location data
     * @param {Array} enrichedData - All enriched order data
     * @returns {string} HTML content
     */
    static renderLocationDashboard(locations, enrichedData) {
        let html = '';

        // Summary cards
        const totalOrders = locations.reduce((sum, loc) => sum + loc.totalOrders, 0);
        const totalValue = locations.reduce((sum, loc) => sum + loc.totalValue, 0);
        const totalItems = new Set(enrichedData.map(r => r._itemId)).size;

        html += '<div class="summary-cards">';
        html += `<div class="summary-card">
            <div class="card-value">${locations.length}</div>
            <div class="card-label">Leveringslokasjoner</div>
        </div>`;
        html += `<div class="summary-card">
            <div class="card-value">${totalOrders.toLocaleString('no-NO')}</div>
            <div class="card-label">Totalt ordrelinjer</div>
        </div>`;
        html += `<div class="summary-card">
            <div class="card-value">${totalItems.toLocaleString('no-NO')}</div>
            <div class="card-label">Unike artikler</div>
        </div>`;
        html += `<div class="summary-card">
            <div class="card-value">${(totalValue / 1000000).toFixed(1)}M</div>
            <div class="card-label">Total verdi (NOK)</div>
        </div>`;
        html += '</div>';

        // Date range info
        const allDates = enrichedData.map(r => r._dateObj).filter(d => d);
        if (allDates.length > 0) {
            const minDate = new Date(Math.min(...allDates));
            const maxDate = new Date(Math.max(...allDates));
            const formatDate = window.DateParser ? window.DateParser.toNorwegian : d => d.toLocaleDateString('no-NO');
            html += `<p class="text-muted" style="margin-top: 10px;">
                Periode: ${formatDate(minDate)} - ${formatDate(maxDate)}
            </p>`;
        }

        // Location summary table
        html += '<h3 style="margin-top: 25px;">Per lokasjon</h3>';
        html += '<table class="data-table" id="locationSummaryTable">';
        html += '<thead><tr>';
        html += '<th>Lokasjon</th>';
        html += '<th>Ordrelinjer</th>';
        html += '<th>Andel</th>';
        html += '<th>Unike artikler</th>';
        html += '<th>Ofte kjøpt (≥3)</th>';
        html += '<th>Total verdi</th>';
        html += '<th>Snitt/ordre</th>';
        html += '<th class="no-sort">Handling</th>';
        html += '</tr></thead><tbody>';

        locations.forEach(loc => {
            const pct = ((loc.totalOrders / totalOrders) * 100).toFixed(1);
            const avgValue = loc.totalValue / loc.totalOrders;

            html += '<tr>';
            html += `<td><strong>${loc.name}</strong></td>`;
            html += `<td style="text-align: right;">${loc.totalOrders.toLocaleString('no-NO')}</td>`;
            html += `<td style="text-align: right;">${pct}%</td>`;
            html += `<td style="text-align: right;">${loc.uniqueItemCount}</td>`;
            html += `<td style="text-align: right;">${loc.frequentItemCount}</td>`;
            html += `<td style="text-align: right;">${(loc.totalValue / 1000).toFixed(0)}k</td>`;
            html += `<td style="text-align: right;">${avgValue.toFixed(0)} kr</td>`;
            html += `<td>
                <button onclick="LocationAnalyzer.showLocationDetails('${loc.id}')"
                        class="btn-small">Se artikler</button>
            </td>`;
            html += '</tr>';
        });

        html += '</tbody></table>';

        // Warehouse grid (visual cards)
        html += '<h3 style="margin-top: 30px;">Visuell oversikt</h3>';
        html += '<div class="warehouse-grid">';

        locations.forEach(loc => {
            const pct = ((loc.totalOrders / totalOrders) * 100).toFixed(0);
            const cardClass = pct >= 50 ? 'card-highlight' : '';

            html += `<div class="warehouse-card ${cardClass}">
                <h4>${loc.name}</h4>
                <div class="warehouse-stats">
                    <span class="stat stat-primary">${pct}%</span>
                    <span class="stat stat-ok">${loc.totalOrders} ordre</span>
                </div>
                <div style="margin-top: 8px; font-size: 12px; color: var(--text-muted);">
                    <p>${loc.uniqueItemCount} artikler</p>
                    <p>${loc.frequentItemCount} ofte kjøpt</p>
                </div>
            </div>`;
        });

        html += '</div>';

        return html;
    }

    /**
     * Show detailed modal for a specific location
     * @param {string} locationId - Location ID
     */
    static showLocationDetails(locationId) {
        const loc = this._analysis?.find(l => l.id === locationId);
        if (!loc) {
            console.warn(`LocationAnalyzer: Location ${locationId} not found`);
            return;
        }

        // Create modal
        const modal = document.createElement('div');
        modal.className = 'modal-overlay';
        modal.onclick = (e) => {
            if (e.target === modal) modal.remove();
        };

        let html = '<div class="modal-content" style="max-width: 1000px;">';
        html += '<div class="modal-header">';
        html += `<h3>${loc.name} - Top 20 artikler</h3>`;
        html += '<button class="modal-close" onclick="this.closest(\'.modal-overlay\').remove()">&times;</button>';
        html += '</div>';

        html += '<div class="modal-body">';

        // Summary stats
        html += '<div class="summary-cards" style="margin-bottom: 20px;">';
        html += `<div class="summary-card">
            <div class="card-value">${loc.totalOrders}</div>
            <div class="card-label">Ordrelinjer</div>
        </div>`;
        html += `<div class="summary-card">
            <div class="card-value">${loc.uniqueItemCount}</div>
            <div class="card-label">Unike artikler</div>
        </div>`;
        html += `<div class="summary-card">
            <div class="card-value">${loc.frequentItemCount}</div>
            <div class="card-label">Ofte kjøpt (≥3)</div>
        </div>`;
        html += `<div class="summary-card">
            <div class="card-value">${(loc.totalValue / 1000).toFixed(0)}k</div>
            <div class="card-label">Total verdi</div>
        </div>`;
        html += '</div>';

        // Top items table
        html += '<table class="data-table" id="locationDetailTable">';
        html += '<thead><tr>';
        html += '<th>Rang</th>';
        html += '<th>Artikelnr</th>';
        html += '<th>Beskrivelse</th>';
        html += '<th>Antall ordre</th>';
        html += '<th>Total mengde</th>';
        html += '<th>Snitt/ordre</th>';
        html += '<th>Total verdi</th>';
        html += '</tr></thead><tbody>';

        loc.topItems.forEach((item, index) => {
            const avgQty = item.totalQty / item.orderCount;

            html += '<tr>';
            html += `<td style="text-align: center;">${index + 1}</td>`;
            html += `<td><strong>${item.itemId}</strong></td>`;
            html += `<td>${item.itemName || '-'}</td>`;
            html += `<td style="text-align: right;">${item.orderCount}</td>`;
            html += `<td style="text-align: right;">${item.totalQty.toFixed(0)}</td>`;
            html += `<td style="text-align: right;">${avgQty.toFixed(1)}</td>`;
            html += `<td style="text-align: right;">${item.totalValue.toFixed(0)} kr</td>`;
            html += '</tr>';
        });

        html += '</tbody></table>';
        html += '</div>';

        html += '<div class="modal-footer">';
        html += `<button class="btn-secondary" onclick="LocationAnalyzer.exportLocationData('${locationId}')">Eksporter CSV</button>`;
        html += '<button class="btn-primary" onclick="this.closest(\'.modal-overlay\').remove()">Lukk</button>';
        html += '</div>';
        html += '</div>';

        modal.innerHTML = html;
        document.body.appendChild(modal);

        // Initialize sortable after modal is in DOM
        setTimeout(() => {
            if (window.SortableTable) {
                window.SortableTable.init('locationDetailTable');
            }
        }, 100);
    }

    /**
     * Export location data to CSV
     * @param {string} locationId - Location ID
     */
    static exportLocationData(locationId) {
        const loc = this._analysis?.find(l => l.id === locationId);
        if (!loc) return;

        const headers = [
            'Artikelnr',
            'Beskrivelse',
            'Antall ordre',
            'Total mengde',
            'Snitt per ordre',
            'Total verdi (NOK)'
        ];

        let csv = headers.join(';') + '\n';

        Object.values(loc.items).sort((a, b) => b.orderCount - a.orderCount).forEach(item => {
            const avgQty = item.totalQty / item.orderCount;
            csv += [
                item.itemId,
                `"${(item.itemName || '').replace(/"/g, '""')}"`,
                item.orderCount,
                item.totalQty.toFixed(0),
                avgQty.toFixed(1),
                item.totalValue.toFixed(0)
            ].join(';') + '\n';
        });

        const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${loc.name.replace(/\s+/g, '_')}_artikler_${new Date().toISOString().split('T')[0]}.csv`;
        a.click();
        URL.revokeObjectURL(url);
    }

    /**
     * Get frequent items for a location (for cross-module use)
     * @param {string} locationId - Location ID
     * @param {number} minOrders - Minimum order count (default: 3)
     * @returns {Array} Items with orderCount >= minOrders
     */
    static getFrequentItems(locationId, minOrders = 3) {
        if (!this._analysis) return [];

        const loc = this._analysis.find(l => l.id === locationId);
        if (!loc) return [];

        return Object.values(loc.items)
            .filter(item => item.orderCount >= minOrders)
            .sort((a, b) => b.orderCount - a.orderCount);
    }

    /**
     * Get all locations
     * @returns {Array} All analyzed locations
     */
    static getAllLocations() {
        return this._analysis || [];
    }

    /**
     * Get item data across all locations
     * @param {string} itemId - Item ID
     * @returns {Object} Item data per location
     */
    static getItemAcrossLocations(itemId) {
        if (!this._analysis) return {};

        const result = {};
        this._analysis.forEach(loc => {
            if (loc.items[itemId]) {
                result[loc.id] = {
                    locationName: loc.name,
                    ...loc.items[itemId]
                };
            }
        });

        return result;
    }
}

// Export for use in other modules
window.LocationAnalyzer = LocationAnalyzer;
