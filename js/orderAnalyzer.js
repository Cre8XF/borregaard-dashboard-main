// ===================================
// ORDER ANALYZER
// Tools → Borregaard order history analysis
// Analyzes purchase patterns, frequency, seasonality, and customer behavior
// ===================================

/**
 * OrderAnalyzer - Order history analysis module
 * Handles order data from Tools to analyze buying patterns
 */
class OrderAnalyzer {
    // ===================================
    // V3 CONFIGURATION - Seasonal Analysis
    // ===================================
    static V3_CONFIG = {
        // Focus weeks for seasonal analysis
        FOCUS_WEEKS: [16, 42],
        // Default selected week
        DEFAULT_WEEK: 16,
        // Safety factor for order suggestions (20% = 1.2)
        SAFETY_FACTOR: 1.2,
        // Spike threshold: qty_focus must be this many times qty_before to be RED
        SPIKE_THRESHOLD: 2.0,
        // Minimum qty in focus week to be considered for analysis
        MIN_FOCUS_QTY: 1
    };

    // ===================================
    // V3 CONFIGURATION - Purchase Frequency (Qlik-based)
    // ===================================
    /**
     * Thresholds for purchase status classification.
     * Based on delivery date analysis from Qlik exports.
     *
     * WHY THESE VALUES:
     * - OK threshold (1.2): 20% buffer above median covers normal variation
     * - FOLLOW_UP threshold (1.6): 60% above median signals attention needed
     * - Above 1.6 = Bør bestilles (overdue, likely needs reorder)
     */
    static V3_FREQUENCY_CONFIG = {
        // Status thresholds (multipliers of median days)
        OK_THRESHOLD: 1.2,           // daysSinceLast <= median * 1.2 = OK
        FOLLOW_UP_THRESHOLD: 1.6,    // daysSinceLast <= median * 1.6 = Følg med
        // Above FOLLOW_UP_THRESHOLD = Bør bestilles

        // Minimum valid intervals required for reliable analysis
        // WHY 3: With < 3 intervals, median is unreliable (could be single outlier)
        MIN_INTERVALS_REQUIRED: 3,

        // Maximum interval to consider valid (days)
        // WHY 365: Intervals > 1 year are likely project orders, not regular consumption
        MAX_VALID_INTERVAL_DAYS: 365
    };

    // Store selected week for v3 analysis
    static _selectedSeasonalWeek = null;

    /**
     * Column mapping for order history data
     * Supports both:
     * - Legacy Tools/Swedish format (OrdDtm = order date)
     * - V3 Qlik export format (Date = delivery date, authoritative for consumption analysis)
     */
    static ORDER_COLUMNS = {
        orderNo: ['OrderNr', 'Ordrenr', 'OrderNo', 'Order Number', 'Ordernummer', 'Order number'],
        itemNo: ['Artikelnr', 'Artikelnummer', 'ItemNo', 'Item Number', 'Item ID'],
        description: ['Artikelbeskrivning', 'Artikelbeskrivelse', 'Beskrivelse', 'Item Name', 'Description', 'Item'],
        quantity: ['OrdRadAnt', 'Antall', 'Quantity', 'Qty', 'Mengde', 'Delivered quantity'],
        // V3: 'Date' from Qlik = delivery date (authoritative)
        // Legacy: 'OrdDtm' = order date (fallback for old data)
        date: ['Date', 'Dato', 'OrdDtm', 'OrderDate', 'Ordredato', 'Delivery date'],
        customer: ['Företagsnamn', 'Kunde', 'Customer', 'Kundenr', 'CustomerNo'],
        price: ['Pris', 'Price', 'UnitPrice'],
        total: ['Ord.radbelopp val', 'Radvärde i basvaluta', 'Totalt', 'Total', 'Amount', 'Delivered value'],
        // V3: Delivery location for future location-level filtering
        deliveryLocationId: ['Delivery location ID', 'DeliveryLocationId', 'LocationId', 'Leveringssted']
    };

    /**
     * Update the order analysis display
     */
    static update(data) {
        const resultsDiv = document.getElementById('orderResults');
        const statusBadge = document.getElementById('orderStatus');
        const tabs = document.querySelector('.order-tabs');

        if (!data || data.length === 0) {
            resultsDiv.innerHTML = `
                <p class="placeholder">
                    Ingen ordre data lastet inn ennå.
                    <br><br>
                    <strong>Tips:</strong> Last opp ordre historikk fra Tools
                </p>
            `;
            statusBadge.textContent = 'Ingen data';
            statusBadge.className = 'status-badge';
            if (tabs) tabs.style.display = 'none';
            return;
        }

        // Show tabs when data is loaded
        if (tabs) tabs.style.display = 'flex';

        // Update status badge
        statusBadge.textContent = `${data.length} ordre`;
        statusBadge.className = 'status-badge ok';

        // Store enriched data
        this._enrichedData = this.enrichData(data);

        // Initialize tabs
        this.initializeTabs();

        // Load default view
        this.loadView('top-sellers');
    }

    /**
     * Enrich order data with parsed values
     *
     * V3 DESIGN DECISION - WHY DELIVERY DATE IS AUTHORITATIVE:
     * - Order date reflects when customer placed order, not when goods were consumed
     * - Delivery date reflects actual receipt/consumption timing
     * - For purchase frequency analysis, we need consumption patterns, not ordering patterns
     * - Qlik exports provide actual delivery dates; legacy OrdDtm is fallback only
     */
    static enrichData(data) {
        console.log('OrderAnalyzer: Enriching data...', data.length, 'rows');
        let warningCount = 0;

        const enriched = data.map((row, index) => {
            const enrichedRow = { ...row };

            // Map order columns to standard fields
            Object.keys(this.ORDER_COLUMNS).forEach(field => {
                const variants = this.ORDER_COLUMNS[field];
                for (let variant of variants) {
                    if (row[variant] !== undefined && row[variant] !== null && row[variant] !== '') {
                        enrichedRow[`_${field}`] = row[variant];
                        break;
                    }
                }
            });

            // Debug first row
            if (index === 0) {
                console.log('OrderAnalyzer v3: First row enriched fields:', {
                    _orderNo: enrichedRow._orderNo,
                    _itemNo: enrichedRow._itemNo,
                    _description: enrichedRow._description,
                    _quantity: enrichedRow._quantity,
                    _date: enrichedRow._date,
                    _customer: enrichedRow._customer,
                    _total: enrichedRow._total,
                    _deliveryLocationId: enrichedRow._deliveryLocationId
                });
            }

            // Parse numeric values
            enrichedRow._quantityNum = this.parseNumber(enrichedRow._quantity);
            enrichedRow._priceNum = this.parseNumber(enrichedRow._price);
            enrichedRow._totalNum = this.parseNumber(enrichedRow._total);

            // V3: Parse date with priority order:
            // 1. Standard date formats (YYYY-MM-DD, DD.MM.YYYY, DD/MM/YYYY) from Qlik
            // 2. Legacy YYMMDD format (OrdDtm) as fallback
            //
            // WHY THIS ORDER: Qlik exports use standard ISO/European date formats
            // for delivery dates. Legacy OrdDtm is only for backwards compatibility.
            const parsedDate = this.parseDateV3(enrichedRow._date);
            if (parsedDate) {
                enrichedRow._dateObj = parsedDate;
                enrichedRow._year = parsedDate.getFullYear();
                enrichedRow._month = parsedDate.getMonth() + 1;
                enrichedRow._week = this.getWeekNumber(parsedDate);
            } else if (enrichedRow._date) {
                // Log warning for unparseable dates (but don't crash)
                warningCount++;
                if (warningCount <= 5) {
                    console.warn(`OrderAnalyzer v3: Could not parse date: "${enrichedRow._date}" (row ${index + 1})`);
                }
            }

            // V3: Preserve delivery location ID for future filtering
            // (stored but not yet used in UI)
            enrichedRow._locationId = enrichedRow._deliveryLocationId || null;

            return enrichedRow;
        });

        if (warningCount > 5) {
            console.warn(`OrderAnalyzer v3: ... and ${warningCount - 5} more date parsing warnings`);
        }
        console.log(`OrderAnalyzer v3: Enriched ${enriched.length} rows, ${warningCount} date warnings`);

        return enriched;
    }

    /**
     * Parse number from string
     */
    static parseNumber(value) {
        if (value === undefined || value === null || value === '') return 0;
        let str = value.toString().trim();
        str = str.replace(',', '.');
        str = str.replace(/\s/g, '');
        const num = parseFloat(str);
        return isNaN(num) ? 0 : num;
    }

    /**
     * Parse OrdDtm date (YYMMDD format) - Legacy format
     * Kept for backwards compatibility with old Tools exports
     */
    static parseOrdDtm(val) {
        if (!val) return null;
        const s = String(val).trim();
        if (!/^\d{6}$/.test(s)) return null;

        const y = 2000 + parseInt(s.slice(0, 2), 10);
        const m = parseInt(s.slice(2, 4), 10) - 1;
        const d = parseInt(s.slice(4, 6), 10);

        const date = new Date(y, m, d);
        const today = new Date();

        // Block future dates - they are invalid for purchase analysis
        if (isNaN(date.getTime()) || date > today) return null;
        return date;
    }

    /**
     * V3: Parse date from multiple formats
     *
     * WHY DELIVERY DATE IS AUTHORITATIVE:
     * - Delivery date = when goods were actually received/consumed
     * - Order date = when customer placed order (irrelevant for consumption patterns)
     * - For purchase frequency analysis, we measure time between consumption events
     *
     * Supported formats:
     * - YYYY-MM-DD (ISO, Qlik default)
     * - DD.MM.YYYY (Norwegian/European)
     * - DD/MM/YYYY (Alternative European)
     * - YYMMDD (Legacy OrdDtm format)
     */
    static parseDateV3(val) {
        if (!val) return null;
        const s = String(val).trim();
        const today = new Date();
        let date = null;

        // Try ISO format: YYYY-MM-DD
        if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
            const [y, m, d] = s.split('-').map(Number);
            date = new Date(y, m - 1, d);
        }
        // Try Norwegian format: DD.MM.YYYY
        else if (/^\d{2}\.\d{2}\.\d{4}$/.test(s)) {
            const [d, m, y] = s.split('.').map(Number);
            date = new Date(y, m - 1, d);
        }
        // Try alternative European format: DD/MM/YYYY
        else if (/^\d{2}\/\d{2}\/\d{4}$/.test(s)) {
            const [d, m, y] = s.split('/').map(Number);
            date = new Date(y, m - 1, d);
        }
        // Try legacy YYMMDD format
        else if (/^\d{6}$/.test(s)) {
            return this.parseOrdDtm(s);
        }
        // Try JavaScript Date constructor as last resort (handles timestamps, etc.)
        else {
            const parsed = new Date(s);
            if (!isNaN(parsed.getTime())) {
                date = parsed;
            }
        }

        // Validate: must be valid date and not in the future
        if (date && !isNaN(date.getTime()) && date <= today) {
            return date;
        }

        return null;
    }

    /**
     * Get ISO week number
     */
    static getWeekNumber(date) {
        const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
        const dayNum = d.getUTCDay() || 7;
        d.setUTCDate(d.getUTCDate() + 4 - dayNum);
        const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
        return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
    }

    /**
     * Helper: Group array by key function
     */
    static _groupBy(array, keyFn) {
        const groups = new Map();
        array.forEach(item => {
            const key = keyFn(item);
            if (!groups.has(key)) {
                groups.set(key, []);
            }
            groups.get(key).push(item);
        });
        return groups;
    }

    /**
     * Helper: Calculate average
     */
    static _avg(numbers) {
        if (!numbers || numbers.length === 0) return 0;
        return numbers.reduce((a, b) => a + b, 0) / numbers.length;
    }

    /**
     * Helper: Calculate median
     */
    static _median(numbers) {
        if (!numbers || numbers.length === 0) return null;
        const sorted = [...numbers].sort((a, b) => a - b);
        const mid = Math.floor(sorted.length / 2);
        if (sorted.length % 2 === 0) {
            return (sorted[mid - 1] + sorted[mid]) / 2;
        }
        return sorted[mid];
    }

    /**
     * Helper: Get unique delivery dates per order for an item
     * Returns one date per unique OrderNr (sorted ascending)
     *
     * V3: Now returns DELIVERY dates (when goods arrived), not order dates
     * This is critical for accurate consumption pattern analysis
     */
    static _getUniquePurchaseDates(rows) {
        const orderDates = new Map();
        rows.forEach(r => {
            if (r._orderNo && r._dateObj) {
                if (!orderDates.has(r._orderNo)) {
                    orderDates.set(r._orderNo, r._dateObj);
                }
            }
        });
        return Array.from(orderDates.values()).sort((a, b) => a - b);
    }

    /**
     * Helper: Calculate purchase intervals (days between consecutive deliveries)
     *
     * V3: Filters out intervals > MAX_VALID_INTERVAL_DAYS (365 days)
     *
     * WHY FILTER OUTLIERS:
     * - Intervals > 1 year typically indicate project orders, not regular consumption
     * - Including them would skew the median and make status unreliable
     * - Regular replenishment items rarely have gaps > 1 year
     */
    static _getPurchaseIntervals(dates) {
        if (!dates || dates.length < 2) return [];

        const { MAX_VALID_INTERVAL_DAYS } = this.V3_FREQUENCY_CONFIG;
        const intervals = [];

        for (let i = 1; i < dates.length; i++) {
            const days = Math.round((dates[i] - dates[i - 1]) / (1000 * 60 * 60 * 24));
            // V3: Only include intervals within valid range
            if (days > 0 && days <= MAX_VALID_INTERVAL_DAYS) {
                intervals.push(days);
            }
        }

        return intervals;
    }

    /**
     * V3: Determine purchase status (traffic light)
     *
     * Status classification:
     * - OK (GREEN): daysSinceLast <= median × 1.2
     * - Følg med (YELLOW): daysSinceLast between median × 1.2 and median × 1.6
     * - Bør bestilles (RED): daysSinceLast > median × 1.6
     * - For lite historikk (GRAY): insufficient data (handled separately)
     *
     * WHY THESE THRESHOLDS:
     * - 1.2 (20% over median): Normal variation buffer
     * - 1.6 (60% over median): Clearly overdue, action needed
     */
    static _getPurchaseStatus(daysSinceLast, medianDays) {
        if (medianDays === null || daysSinceLast === null) return 'GREEN';

        const { OK_THRESHOLD, FOLLOW_UP_THRESHOLD } = this.V3_FREQUENCY_CONFIG;

        if (daysSinceLast > medianDays * FOLLOW_UP_THRESHOLD) {
            return 'RED';  // Bør bestilles
        }
        if (daysSinceLast > medianDays * OK_THRESHOLD) {
            return 'YELLOW';  // Følg med
        }
        return 'GREEN';  // OK
    }

    /**
     * Helper: Get status emoji
     * V3: Added GRAY for insufficient data
     */
    static _getStatusEmoji(status) {
        switch (status) {
            case 'RED': return '\u{1F534}';      // Red circle
            case 'YELLOW': return '\u{1F7E1}';   // Yellow circle
            case 'GREEN': return '\u{1F7E2}';    // Green circle
            case 'GRAY': return '\u{26AA}';      // White/gray circle
            default: return '\u{1F7E2}';
        }
    }

    /**
     * V3: Get suggestion text based on status
     *
     * For RED (Bør bestilles):
     * - Suggests: median consumption × median interval (read-only, no ERP writes)
     *
     * @param {string} status - Traffic light status
     * @param {number} suggestedQty - Pre-calculated suggested quantity (for RED)
     * @param {number} validIntervalCount - Number of valid intervals for the item
     */
    static _getSuggestionText(status, suggestedQty, validIntervalCount) {
        const { MIN_INTERVALS_REQUIRED } = this.V3_FREQUENCY_CONFIG;

        // Check for insufficient history
        if (validIntervalCount < MIN_INTERVALS_REQUIRED) {
            return 'For lite historikk';
        }

        switch (status) {
            case 'RED':
                return suggestedQty > 0 ? `Bestill ca. ${Math.round(suggestedQty)} stk` : 'Bør bestilles';
            case 'YELLOW':
                return 'Forventet kjøp snart';
            case 'GREEN':
                return 'Ingen handling nå';
            case 'GRAY':
                return 'For lite historikk';
            default:
                return 'Ingen handling nå';
        }
    }

    /**
     * Helper: Get median quantity per order
     */
    static _getMedianQtyPerOrder(rows) {
        const orderQty = new Map();
        rows.forEach(r => {
            if (r._orderNo) {
                if (!orderQty.has(r._orderNo)) {
                    orderQty.set(r._orderNo, 0);
                }
                orderQty.set(r._orderNo, orderQty.get(r._orderNo) + r._quantityNum);
            }
        });
        const quantities = Array.from(orderQty.values());
        return this._median(quantities) || 0;
    }

    /**
     * Helper: Days between dates
     */
    static _daysBetween(dates) {
        if (!dates || dates.length < 2) return 0;
        const sorted = dates.sort((a, b) => a - b);
        const intervals = [];
        for (let i = 1; i < sorted.length; i++) {
            const days = (sorted[i] - sorted[i - 1]) / (1000 * 60 * 60 * 24);
            intervals.push(days);
        }
        return this._avg(intervals);
    }

    /**
     * Helper: Format number (Norwegian style)
     */
    static _fmt(num, decimals = 0) {
        if (num === null || num === undefined || isNaN(num)) return '-';
        return num.toFixed(decimals).replace(/\B(?=(\d{3})+(?!\d))/g, ' ').replace('.', ',');
    }

    /**
     * Initialize tab event listeners
     */
    static initializeTabs() {
        const tabs = document.querySelectorAll('.order-tabs .tab');

        tabs.forEach(tab => {
            tab.addEventListener('click', (e) => {
                // Update active tab
                tabs.forEach(t => t.classList.remove('active'));
                e.target.classList.add('active');

                // Load the selected view
                const view = e.target.getAttribute('data-view');
                this.loadView(view);

                // Store active tab in localStorage
                localStorage.setItem('orderActiveTab', view);
            });
        });
    }

    /**
     * Load a specific view
     */
    static loadView(viewType) {
        const resultsDiv = document.getElementById('orderResults');

        if (!this._enrichedData || this._enrichedData.length === 0) {
            resultsDiv.innerHTML = '<p class="text-muted">Ingen data tilgjengelig</p>';
            return;
        }

        let html = '';

        switch (viewType) {
            case 'top-sellers':
                html = this.renderTopSellers();
                break;
            case 'frequent':
                html = this.renderFrequent();
                break;
            case 'seasonal':
                html = this.renderSeasonal();
                break;
            case 'customers':
                html = this.renderCustomers();
                break;
            case 'timeline':
                html = this.renderTimeline();
                break;
            case 'seasonal-v3':
                html = this.renderSeasonalV3();
                break;
            default:
                html = '<p>Ukjent visning</p>';
        }

        resultsDiv.innerHTML = html;
    }

    /**
     * Render top sellers view
     */
    static renderTopSellers() {
        const grouped = this._groupBy(this._enrichedData, item => item._itemNo);

        const aggregated = Array.from(grouped.entries()).map(([itemNo, rows]) => {
            const totalQty = rows.reduce((sum, r) => sum + r._quantityNum, 0);
            const totalValue = rows.reduce((sum, r) => sum + r._totalNum, 0);
            const description = rows[0]._description || '';

            return {
                itemNo,
                description,
                totalQty,
                totalValue
            };
        });

        // Sort by quantity descending
        aggregated.sort((a, b) => b.totalQty - a.totalQty);

        // Take top 50
        const top50 = aggregated.slice(0, 50);

        let html = '<h3 style="margin-top: 20px;">🏆 Mest solgt</h3>';

        // Summary stats
        const totalItems = aggregated.length;
        const totalQtyAll = aggregated.reduce((sum, a) => sum + a.totalQty, 0);
        const totalValueAll = aggregated.reduce((sum, a) => sum + a.totalValue, 0);

        html += '<div class="stats-row" style="margin: 20px 0; display: flex; gap: 20px;">';
        html += `<div class="stat-box"><strong>${totalItems}</strong><br>Unike artikler</div>`;
        html += `<div class="stat-box"><strong>${this._fmt(totalQtyAll)}</strong><br>Total mengde</div>`;
        html += `<div class="stat-box"><strong>${this._fmt(totalValueAll, 0)} kr</strong><br>Total verdi</div>`;
        html += '</div>';

        html += '<div class="butler-table-wrapper">';
        html += '<table class="data-table">';
        html += '<thead><tr>';
        html += '<th>Rang</th>';
        html += '<th>Artikkel</th>';
        html += '<th>Beskrivelse</th>';
        html += '<th style="text-align: right;">Totalt antall</th>';
        html += '<th style="text-align: right;">Total verdi</th>';
        html += '</tr></thead><tbody>';

        top50.forEach((item, index) => {
            html += '<tr>';
            html += `<td>${index + 1}</td>`;
            html += `<td>${item.itemNo || '-'}</td>`;
            html += `<td>${item.description || '-'}</td>`;
            html += `<td style="text-align: right;">${this._fmt(item.totalQty)}</td>`;
            html += `<td style="text-align: right;">${this._fmt(item.totalValue, 0)} kr</td>`;
            html += '</tr>';
        });

        html += '</tbody></table></div>';

        return html;
    }

    /**
     * Render frequent purchases view (v3)
     * Prioritized work list with median-based statistics, status classification, and order suggestions
     *
     * V3 CHANGES:
     * - Uses delivery date (not order date) for all calculations
     * - Filters outlier intervals (>365 days)
     * - Requires MIN_INTERVALS_REQUIRED (3) for reliable analysis
     * - Updated thresholds: OK (≤1.2×), Følg med (≤1.6×), Bør bestilles (>1.6×)
     * - Bestillingsforslag = median consumption × (median interval / 30) for monthly estimate
     *
     * WHY MEDIAN INSTEAD OF AVERAGE:
     * - Median is robust to outliers (one large project order won't skew results)
     * - Better represents "typical" purchase pattern
     * - More reliable for planning and reorder suggestions
     */
    static renderFrequent() {
        const { MIN_INTERVALS_REQUIRED } = this.V3_FREQUENCY_CONFIG;
        const grouped = this._groupBy(this._enrichedData, item => item._itemNo);
        const today = new Date();

        const aggregated = Array.from(grouped.entries()).map(([itemNo, rows]) => {
            const description = rows[0]._description || '';

            // Count unique orders
            const uniqueOrders = new Set(rows.map(r => r._orderNo)).size;

            // Get unique delivery dates (one per OrderNr)
            // V3: These are now DELIVERY dates, not order dates
            const deliveryDates = this._getUniquePurchaseDates(rows);

            // Calculate delivery intervals (with outlier filtering)
            // V3: Intervals >365 days are excluded as project/outliers
            const intervals = this._getPurchaseIntervals(deliveryDates);
            const validIntervalCount = intervals.length;

            // Calculate median days between deliveries
            const medianDaysBetween = this._median(intervals);

            // Calculate days since last delivery
            // V3: Must always be positive, never overflow
            let daysSinceLastDelivery = null;
            if (deliveryDates.length > 0) {
                const lastDeliveryDate = deliveryDates[deliveryDates.length - 1];
                const diffMs = today - lastDeliveryDate;
                // Ensure positive value (should always be, since future dates are blocked)
                daysSinceLastDelivery = Math.max(0, Math.round(diffMs / (1000 * 60 * 60 * 24)));
            }

            // Calculate median quantity per order
            const medianQtyPerOrder = this._getMedianQtyPerOrder(rows);

            // Determine purchase status
            // V3: GRAY if insufficient history, otherwise normal classification
            let purchaseStatus;
            if (validIntervalCount < MIN_INTERVALS_REQUIRED) {
                purchaseStatus = 'GRAY';  // For lite historikk
            } else {
                purchaseStatus = this._getPurchaseStatus(daysSinceLastDelivery, medianDaysBetween);
            }

            // V3: Calculate suggested order quantity for RED items
            // Formula: median consumption × median interval
            // This represents the typical amount ordered over typical interval
            let suggestedOrderQty = 0;
            if (purchaseStatus === 'RED' && medianQtyPerOrder > 0) {
                suggestedOrderQty = medianQtyPerOrder;  // Simple: reorder typical quantity
            }

            // Generate suggestion text
            const suggestionText = this._getSuggestionText(purchaseStatus, suggestedOrderQty, validIntervalCount);

            return {
                itemNo,
                description,
                orderCount: uniqueOrders,
                medianDaysBetween,
                daysSinceLastDelivery,
                medianQtyPerOrder,
                purchaseStatus,
                suggestionText,
                validIntervalCount
            };
        });

        // Sort by priority: RED first, then YELLOW, then GREEN, then GRAY (insufficient data)
        // Within same status: sort by daysSinceLastDelivery DESC
        const statusPriority = { 'RED': 0, 'YELLOW': 1, 'GREEN': 2, 'GRAY': 3 };
        aggregated.sort((a, b) => {
            const priorityDiff = statusPriority[a.purchaseStatus] - statusPriority[b.purchaseStatus];
            if (priorityDiff !== 0) return priorityDiff;
            // Within same status, higher daysSinceLastDelivery comes first
            const aDays = a.daysSinceLastDelivery !== null ? a.daysSinceLastDelivery : -1;
            const bDays = b.daysSinceLastDelivery !== null ? b.daysSinceLastDelivery : -1;
            return bDays - aDays;
        });

        // Count statuses for summary
        const redCount = aggregated.filter(a => a.purchaseStatus === 'RED').length;
        const yellowCount = aggregated.filter(a => a.purchaseStatus === 'YELLOW').length;
        const greenCount = aggregated.filter(a => a.purchaseStatus === 'GREEN').length;
        const grayCount = aggregated.filter(a => a.purchaseStatus === 'GRAY').length;

        let html = '<h3 style="margin-top: 20px;">\u26A1 Oftest kjøpt (v3)</h3>';

        // Info box explaining v3 changes
        html += '<div style="background: #e8f4fd; padding: 12px 16px; border-radius: 6px; margin: 15px 0; font-size: 13px; border-left: 3px solid #0d6efd;">';
        html += '<strong>V3:</strong> Basert på leveringsdato fra Qlik. ';
        html += 'Median brukes for robusthet mot prosjektordre. ';
        html += `Artikler med < ${MIN_INTERVALS_REQUIRED} gyldige intervaller markeres som "For lite historikk".`;
        html += '</div>';

        // Summary stats
        html += '<div class="stats-row" style="margin: 20px 0; display: flex; gap: 20px; flex-wrap: wrap;">';
        html += `<div class="stat-box" style="border-left: 4px solid #dc3545;"><strong>${redCount}</strong><br>\u{1F534} Bør bestilles</div>`;
        html += `<div class="stat-box" style="border-left: 4px solid #ffc107;"><strong>${yellowCount}</strong><br>\u{1F7E1} Følg med</div>`;
        html += `<div class="stat-box" style="border-left: 4px solid #28a745;"><strong>${greenCount}</strong><br>\u{1F7E2} OK</div>`;
        html += `<div class="stat-box" style="border-left: 4px solid #6c757d;"><strong>${grayCount}</strong><br>\u{26AA} For lite historikk</div>`;
        html += `<div class="stat-box"><strong>${aggregated.length}</strong><br>Unike artikler</div>`;
        html += '</div>';

        html += '<div class="butler-table-wrapper">';
        html += '<table class="data-table">';
        html += '<thead><tr>';
        html += '<th>Rang</th>';
        html += '<th>Artikkel</th>';
        html += '<th>Beskrivelse</th>';
        html += '<th style="text-align: right;">Median dager</th>';
        html += '<th style="text-align: right;">Dager siden sist</th>';
        html += '<th style="text-align: center;">Status</th>';
        html += '<th>Forslag</th>';
        html += '</tr></thead><tbody>';

        // Display all items (no limit), but show actionable ones first
        aggregated.forEach((item, index) => {
            const statusEmoji = this._getStatusEmoji(item.purchaseStatus);
            let rowStyle = '';
            if (item.purchaseStatus === 'RED') {
                rowStyle = 'background-color: rgba(220, 53, 69, 0.1);';
            } else if (item.purchaseStatus === 'YELLOW') {
                rowStyle = 'background-color: rgba(255, 193, 7, 0.1);';
            } else if (item.purchaseStatus === 'GRAY') {
                rowStyle = 'background-color: rgba(108, 117, 125, 0.05);';
            }

            html += `<tr style="${rowStyle}">`;
            html += `<td>${index + 1}</td>`;
            html += `<td>${item.itemNo || '-'}</td>`;
            html += `<td>${item.description || '-'}</td>`;
            html += `<td style="text-align: right;">${item.medianDaysBetween !== null ? this._fmt(item.medianDaysBetween, 0) : '\u2014'}</td>`;
            html += `<td style="text-align: right;">${item.daysSinceLastDelivery !== null ? this._fmt(item.daysSinceLastDelivery, 0) : '\u2014'}</td>`;
            html += `<td style="text-align: center;">${statusEmoji}</td>`;
            html += `<td>${item.suggestionText}</td>`;
            html += '</tr>';
        });

        html += '</tbody></table></div>';

        return html;
    }

    /**
     * Render seasonal patterns view
     */
    static renderSeasonal() {
        // Group by month
        const byMonth = new Array(12).fill(0);
        this._enrichedData.forEach(row => {
            if (row._month) {
                byMonth[row._month - 1] += row._quantityNum;
            }
        });

        // Group by week
        const byWeek = new Array(53).fill(0);
        this._enrichedData.forEach(row => {
            if (row._week) {
                byWeek[row._week - 1] += row._quantityNum;
            }
        });

        const monthNames = ['Januar', 'Februar', 'Mars', 'April', 'Mai', 'Juni',
                           'Juli', 'August', 'September', 'Oktober', 'November', 'Desember'];

        let html = '<h3 style="margin-top: 20px;">📅 Sesongmønstre</h3>';

        // Monthly aggregation
        html += '<h4 style="margin-top: 30px;">Salg per måned (alle år aggregert)</h4>';
        html += '<div class="butler-table-wrapper">';
        html += '<table class="data-table">';
        html += '<thead><tr><th>Måned</th><th style="text-align: right;">Total mengde</th></tr></thead><tbody>';

        byMonth.forEach((qty, index) => {
            html += '<tr>';
            html += `<td>${monthNames[index]}</td>`;
            html += `<td style="text-align: right;">${this._fmt(qty)}</td>`;
            html += '</tr>';
        });

        html += '</tbody></table></div>';

        // Weekly aggregation - show top 20 weeks
        const weekData = byWeek.map((qty, index) => ({ week: index + 1, qty }))
                                .filter(w => w.qty > 0)
                                .sort((a, b) => b.qty - a.qty)
                                .slice(0, 20);

        html += '<h4 style="margin-top: 30px;">Topp 20 uker (alle år aggregert)</h4>';
        html += '<div class="butler-table-wrapper">';
        html += '<table class="data-table">';
        html += '<thead><tr><th>Uke</th><th style="text-align: right;">Total mengde</th></tr></thead><tbody>';

        weekData.forEach(w => {
            html += '<tr>';
            html += `<td>Uke ${w.week}</td>`;
            html += `<td style="text-align: right;">${this._fmt(w.qty)}</td>`;
            html += '</tr>';
        });

        html += '</tbody></table></div>';

        return html;
    }

    /**
     * Render customers view
     */
    static renderCustomers() {
        const grouped = this._groupBy(this._enrichedData, item => item._customer || 'Ukjent');

        const aggregated = Array.from(grouped.entries()).map(([customer, rows]) => {
            // Count unique orders
            const uniqueOrders = new Set(rows.map(r => r._orderNo)).size;

            const totalQty = rows.reduce((sum, r) => sum + r._quantityNum, 0);
            const totalValue = rows.reduce((sum, r) => sum + r._totalNum, 0);

            return {
                customer,
                orderCount: uniqueOrders,
                totalQty,
                totalValue
            };
        });

        // Sort by value descending
        aggregated.sort((a, b) => b.totalValue - a.totalValue);

        let html = '<h3 style="margin-top: 20px;">👥 Per kunde</h3>';

        // Summary
        const totalCustomers = aggregated.length;
        const totalOrders = aggregated.reduce((sum, a) => sum + a.orderCount, 0);
        const totalValue = aggregated.reduce((sum, a) => sum + a.totalValue, 0);

        html += '<div class="stats-row" style="margin: 20px 0; display: flex; gap: 20px;">';
        html += `<div class="stat-box"><strong>${totalCustomers}</strong><br>Kunder</div>`;
        html += `<div class="stat-box"><strong>${totalOrders}</strong><br>Ordre totalt</div>`;
        html += `<div class="stat-box"><strong>${this._fmt(totalValue, 0)} kr</strong><br>Total verdi</div>`;
        html += '</div>';

        html += '<div class="butler-table-wrapper">';
        html += '<table class="data-table">';
        html += '<thead><tr>';
        html += '<th>Rang</th>';
        html += '<th>Kunde</th>';
        html += '<th style="text-align: right;">Antall ordre</th>';
        html += '<th style="text-align: right;">Totalt antall</th>';
        html += '<th style="text-align: right;">Total verdi</th>';
        html += '</tr></thead><tbody>';

        aggregated.forEach((item, index) => {
            html += '<tr>';
            html += `<td>${index + 1}</td>`;
            html += `<td>${item.customer || '-'}</td>`;
            html += `<td style="text-align: right;">${item.orderCount}</td>`;
            html += `<td style="text-align: right;">${this._fmt(item.totalQty)}</td>`;
            html += `<td style="text-align: right;">${this._fmt(item.totalValue, 0)} kr</td>`;
            html += '</tr>';
        });

        html += '</tbody></table></div>';

        return html;
    }

    /**
     * Render timeline view
     */
    static renderTimeline() {
        // Group by year-month
        const byMonth = new Map();

        this._enrichedData.forEach(row => {
            if (row._dateObj) {
                const year = row._dateObj.getFullYear();
                const month = row._dateObj.getMonth() + 1;
                const key = `${year}-${String(month).padStart(2, '0')}`;

                if (!byMonth.has(key)) {
                    byMonth.set(key, { totalQty: 0, totalValue: 0 });
                }

                const stats = byMonth.get(key);
                stats.totalQty += row._quantityNum;
                stats.totalValue += row._totalNum;
            }
        });

        // Convert to array and sort
        const timeline = Array.from(byMonth.entries())
            .map(([month, stats]) => ({ month, ...stats }))
            .sort((a, b) => a.month.localeCompare(b.month));

        let html = '<h3 style="margin-top: 20px;">📈 Tidslinje</h3>';

        if (timeline.length === 0) {
            html += '<p class="text-muted">Ingen datodata tilgjengelig</p>';
            return html;
        }

        // Summary
        const totalQty = timeline.reduce((sum, t) => sum + t.totalQty, 0);
        const totalValue = timeline.reduce((sum, t) => sum + t.totalValue, 0);
        const avgQtyPerMonth = totalQty / timeline.length;
        const avgValuePerMonth = totalValue / timeline.length;

        html += '<div class="stats-row" style="margin: 20px 0; display: flex; gap: 20px;">';
        html += `<div class="stat-box"><strong>${timeline.length}</strong><br>Måneder</div>`;
        html += `<div class="stat-box"><strong>${this._fmt(avgQtyPerMonth, 0)}</strong><br>Snitt antall/måned</div>`;
        html += `<div class="stat-box"><strong>${this._fmt(avgValuePerMonth, 0)} kr</strong><br>Snitt verdi/måned</div>`;
        html += '</div>';

        html += '<div class="butler-table-wrapper">';
        html += '<table class="data-table">';
        html += '<thead><tr>';
        html += '<th>Måned</th>';
        html += '<th style="text-align: right;">Totalt antall</th>';
        html += '<th style="text-align: right;">Total verdi</th>';
        html += '</tr></thead><tbody>';

        timeline.forEach(t => {
            html += '<tr>';
            html += `<td>${t.month}</td>`;
            html += `<td style="text-align: right;">${this._fmt(t.totalQty)}</td>`;
            html += `<td style="text-align: right;">${this._fmt(t.totalValue, 0)} kr</td>`;
            html += '</tr>';
        });

        html += '</tbody></table></div>';

        return html;
    }

    // ===================================
    // V3: SEASONAL ANALYSIS (Week 16/42)
    // ===================================

    /**
     * Get ISO week and year from a date
     * Returns { week: number, year: number }
     */
    static _getISOWeekYear(date) {
        const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
        const dayNum = d.getUTCDay() || 7;
        d.setUTCDate(d.getUTCDate() + 4 - dayNum);
        const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
        const week = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
        return { week, year: d.getUTCFullYear() };
    }

    /**
     * V3: Get seasonal classification status
     * @param {number} qtyBefore - Quantity in week before
     * @param {number} qtyFocus - Quantity in focus week
     * @param {number} qtyAfter - Quantity in week after
     * @returns {'RED'|'YELLOW'|'GREEN'} Status
     */
    static _getSeasonalStatus(qtyBefore, qtyFocus, qtyAfter) {
        const { SPIKE_THRESHOLD, MIN_FOCUS_QTY } = this.V3_CONFIG;

        // Must have activity in focus week
        if (qtyFocus < MIN_FOCUS_QTY) return 'GREEN';

        // RED: Seasonal spike detected
        // qty_focus >> qty_before AND (qty_after = 0 OR missing)
        if (qtyBefore > 0 && qtyFocus >= qtyBefore * SPIKE_THRESHOLD && qtyAfter === 0) {
            return 'RED';
        }
        // Also RED if no before but significant focus and no after (pure spike)
        if (qtyBefore === 0 && qtyFocus >= MIN_FOCUS_QTY && qtyAfter === 0) {
            return 'RED';
        }

        // YELLOW: Event-driven / one-off
        // qty_focus > 0 AND qty_before = 0 AND qty_after = 0
        if (qtyFocus > 0 && qtyBefore === 0 && qtyAfter === 0) {
            return 'YELLOW';
        }

        // GREEN: Stable demand
        // qty_focus > 0 AND (qty_before > 0 OR qty_after > 0)
        if (qtyFocus > 0 && (qtyBefore > 0 || qtyAfter > 0)) {
            return 'GREEN';
        }

        return 'GREEN';
    }

    /**
     * V3: Calculate recommended order quantity
     * Uses median of historical focus week quantities + safety factor
     */
    static _getRecommendedQty(historicalFocusQtys, currentFocusQty) {
        const { SAFETY_FACTOR } = this.V3_CONFIG;

        if (!historicalFocusQtys || historicalFocusQtys.length === 0) {
            // Fallback to current focus qty if no history
            return Math.ceil(currentFocusQty * SAFETY_FACTOR);
        }

        const median = this._median(historicalFocusQtys);
        if (median === null) {
            return Math.ceil(currentFocusQty * SAFETY_FACTOR);
        }

        return Math.ceil(median * SAFETY_FACTOR);
    }

    /**
     * V3: Aggregate data for seasonal week analysis
     * @param {number} focusWeek - The focus week (16 or 42)
     * @returns {Array} Aggregated article data
     */
    static _aggregateSeasonalData(focusWeek) {
        const preWeek = focusWeek - 1;
        const postWeek = focusWeek + 1;

        // Group by article
        const grouped = this._groupBy(this._enrichedData, item => item._itemNo);

        const aggregated = Array.from(grouped.entries()).map(([itemNo, rows]) => {
            const description = rows[0]._description || '';

            // Track quantities per year for historical median calculation
            const yearlyFocusQtys = new Map();

            let qtyBefore = 0;
            let qtyFocus = 0;
            let qtyAfter = 0;
            let ordersFocus = 0;
            const focusOrderNos = new Set();

            rows.forEach(r => {
                if (!r._dateObj) return;

                const { week, year } = this._getISOWeekYear(r._dateObj);

                if (week === preWeek) {
                    qtyBefore += r._quantityNum;
                } else if (week === focusWeek) {
                    qtyFocus += r._quantityNum;
                    if (r._orderNo) {
                        focusOrderNos.add(r._orderNo);
                    }
                    // Track per-year focus quantities for median
                    if (!yearlyFocusQtys.has(year)) {
                        yearlyFocusQtys.set(year, 0);
                    }
                    yearlyFocusQtys.set(year, yearlyFocusQtys.get(year) + r._quantityNum);
                } else if (week === postWeek) {
                    qtyAfter += r._quantityNum;
                }
            });

            ordersFocus = focusOrderNos.size;
            const totalQty = qtyBefore + qtyFocus + qtyAfter;

            // Get status
            const status = this._getSeasonalStatus(qtyBefore, qtyFocus, qtyAfter);

            // Calculate recommended qty (only for RED items)
            const historicalQtys = Array.from(yearlyFocusQtys.values());
            const recommendedQty = status === 'RED'
                ? this._getRecommendedQty(historicalQtys, qtyFocus)
                : null;

            return {
                itemNo,
                description,
                qtyBefore,
                qtyFocus,
                qtyAfter,
                totalQty,
                ordersFocus,
                status,
                recommendedQty,
                historicalYears: yearlyFocusQtys.size
            };
        });

        // Filter to only items with activity in the 3-week window
        const filtered = aggregated.filter(a => a.totalQty > 0);

        // Sort: RED first, then YELLOW, then GREEN
        // Within same status: sort by qtyFocus DESC
        const statusPriority = { 'RED': 0, 'YELLOW': 1, 'GREEN': 2 };
        filtered.sort((a, b) => {
            const priorityDiff = statusPriority[a.status] - statusPriority[b.status];
            if (priorityDiff !== 0) return priorityDiff;
            return b.qtyFocus - a.qtyFocus;
        });

        return filtered;
    }

    /**
     * V3: Handle week selection change
     */
    static _onSeasonalWeekChange(week) {
        this._selectedSeasonalWeek = parseInt(week, 10);
        // Store preference (not full dataset)
        localStorage.setItem('orderSeasonalWeek', this._selectedSeasonalWeek);
        // Re-render
        this.loadView('seasonal-v3');
    }

    /**
     * V3: Render seasonal analysis view
     * Focus on weeks 16 and 42 with bestillingsforslag
     */
    static renderSeasonalV3() {
        const { FOCUS_WEEKS, DEFAULT_WEEK, SAFETY_FACTOR } = this.V3_CONFIG;

        // Get selected week from storage or default
        if (this._selectedSeasonalWeek === null) {
            const stored = localStorage.getItem('orderSeasonalWeek');
            this._selectedSeasonalWeek = stored ? parseInt(stored, 10) : DEFAULT_WEEK;
        }
        const focusWeek = this._selectedSeasonalWeek;

        // Aggregate data for selected week
        const aggregated = this._aggregateSeasonalData(focusWeek);

        // Count statuses
        const redCount = aggregated.filter(a => a.status === 'RED').length;
        const yellowCount = aggregated.filter(a => a.status === 'YELLOW').length;
        const greenCount = aggregated.filter(a => a.status === 'GREEN').length;
        const totalArticles = aggregated.length;

        // Build HTML
        let html = `<h3 style="margin-top: 20px;">\u{1F4CA} Sesonganalyse (v3)</h3>`;

        // Week selector
        html += '<div style="margin: 20px 0; display: flex; align-items: center; gap: 15px;">';
        html += '<label for="seasonalWeekSelect" style="font-weight: 600;">Velg uke:</label>';
        html += '<select id="seasonalWeekSelect" style="padding: 8px 12px; border-radius: 4px; border: 1px solid #ccc; font-size: 14px;">';
        FOCUS_WEEKS.forEach(w => {
            const selected = w === focusWeek ? 'selected' : '';
            html += `<option value="${w}" ${selected}>Uke ${w}</option>`;
        });
        html += '</select>';
        html += `<span style="color: #666; font-size: 13px;">Analyserer uke ${focusWeek - 1}, ${focusWeek}, ${focusWeek + 1}</span>`;
        html += '</div>';

        // KPI summary
        html += '<div class="stats-row" style="margin: 20px 0; display: flex; gap: 20px; flex-wrap: wrap;">';
        html += `<div class="stat-box" style="border-left: 4px solid #dc3545;"><strong>${redCount}</strong><br>\u{1F534} Bør bestilles</div>`;
        html += `<div class="stat-box" style="border-left: 4px solid #ffc107;"><strong>${yellowCount}</strong><br>\u{1F7E1} Følg med</div>`;
        html += `<div class="stat-box" style="border-left: 4px solid #28a745;"><strong>${greenCount}</strong><br>\u{1F7E2} OK</div>`;
        html += `<div class="stat-box"><strong>${totalArticles}</strong><br>Totalt unike artikler</div>`;
        html += '</div>';

        // Info box
        html += '<div style="background: #f8f9fa; padding: 12px 16px; border-radius: 6px; margin-bottom: 20px; font-size: 13px; border-left: 3px solid #6c757d;">';
        html += '<strong>Klassifisering:</strong> ';
        html += '\u{1F534} Sesongtopp (spike) – bestill nå &nbsp;|&nbsp; ';
        html += '\u{1F7E1} Engangs/event – følg med &nbsp;|&nbsp; ';
        html += '\u{1F7E2} Stabil etterspørsel – OK';
        html += `<br><small style="color: #666;">Forslag inkluderer ${Math.round((SAFETY_FACTOR - 1) * 100)}% sikkerhetsmargin basert på median historikk.</small>`;
        html += '</div>';

        // Table
        html += '<div class="butler-table-wrapper">';
        html += '<table class="data-table">';
        html += '<thead><tr>';
        html += '<th>Rang</th>';
        html += '<th>Artikelnr</th>';
        html += '<th>Beskrivelse</th>';
        html += `<th style="text-align: right;">Uke ${focusWeek - 1}</th>`;
        html += `<th style="text-align: right;">Uke ${focusWeek}</th>`;
        html += `<th style="text-align: right;">Uke ${focusWeek + 1}</th>`;
        html += '<th style="text-align: center;">Status</th>';
        html += '<th style="text-align: right;">Forslag</th>';
        html += '</tr></thead><tbody>';

        // Take top 100 for display
        const displayed = aggregated.slice(0, 100);

        displayed.forEach((item, index) => {
            const statusEmoji = this._getStatusEmoji(item.status);
            const rowStyle = item.status === 'RED' ? 'background-color: rgba(220, 53, 69, 0.1);' :
                             item.status === 'YELLOW' ? 'background-color: rgba(255, 193, 7, 0.1);' : '';

            let suggestionText = '\u2014';
            if (item.status === 'RED' && item.recommendedQty !== null) {
                suggestionText = `Bestill ${this._fmt(item.recommendedQty)} stk`;
            } else if (item.status === 'YELLOW') {
                suggestionText = 'Følg med';
            } else if (item.status === 'GREEN') {
                suggestionText = 'Ingen handling';
            }

            html += `<tr style="${rowStyle}">`;
            html += `<td>${index + 1}</td>`;
            html += `<td>${item.itemNo || '-'}</td>`;
            html += `<td>${item.description || '-'}</td>`;
            html += `<td style="text-align: right;">${this._fmt(item.qtyBefore)}</td>`;
            html += `<td style="text-align: right; font-weight: 600;">${this._fmt(item.qtyFocus)}</td>`;
            html += `<td style="text-align: right;">${this._fmt(item.qtyAfter)}</td>`;
            html += `<td style="text-align: center;">${statusEmoji}</td>`;
            html += `<td style="text-align: right;">${suggestionText}</td>`;
            html += '</tr>';
        });

        if (aggregated.length === 0) {
            html += '<tr><td colspan="8" style="text-align: center; padding: 20px; color: #666;">Ingen data for valgt uke</td></tr>';
        }

        html += '</tbody></table></div>';

        // Add event listener after render
        setTimeout(() => {
            const select = document.getElementById('seasonalWeekSelect');
            if (select) {
                select.addEventListener('change', (e) => {
                    this._onSeasonalWeekChange(e.target.value);
                });
            }
        }, 0);

        return html;
    }
}

// Export to window for global access
window.OrderAnalyzer = OrderAnalyzer;
