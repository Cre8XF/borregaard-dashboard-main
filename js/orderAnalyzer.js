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
    /**
     * Column mapping for order history data (Swedish column names from Tools)
     */
    static ORDER_COLUMNS = {
        orderNo: ['OrderNr', 'Ordrenr', 'OrderNo', 'Order Number', 'Ordernummer'],
        itemNo: ['Artikelnr', 'Artikelnummer', 'ItemNo', 'Item Number'],
        description: ['Artikelbeskrivning', 'Artikelbeskrivelse', 'Beskrivelse', 'Item Name', 'Description'],
        quantity: ['OrdRadAnt', 'Antall', 'Quantity', 'Qty', 'Mengde'],
        date: ['OrdDtm', 'Dato', 'Date', 'OrderDate', 'Orderdato'],
        customer: ['Företagsnamn', 'Kunde', 'Customer', 'Kundenr', 'CustomerNo'],
        price: ['Pris', 'Price', 'UnitPrice'],
        total: ['Ord.radbelopp val', 'Radvärde i basvaluta', 'Totalt', 'Total', 'Amount']
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
     */
    static enrichData(data) {
        console.log('OrderAnalyzer: Enriching data...', data.length, 'rows');

        return data.map((row, index) => {
            const enriched = { ...row };

            // Map order columns to standard fields
            Object.keys(this.ORDER_COLUMNS).forEach(field => {
                const variants = this.ORDER_COLUMNS[field];
                for (let variant of variants) {
                    if (row[variant] !== undefined && row[variant] !== null && row[variant] !== '') {
                        enriched[`_${field}`] = row[variant];
                        break;
                    }
                }
            });

            // Debug first row
            if (index === 0) {
                console.log('First row enriched fields:', {
                    _orderNo: enriched._orderNo,
                    _itemNo: enriched._itemNo,
                    _description: enriched._description,
                    _quantity: enriched._quantity,
                    _date: enriched._date,
                    _customer: enriched._customer,
                    _total: enriched._total
                });
            }

            // Parse numeric values
            enriched._quantityNum = this.parseNumber(enriched._quantity);
            enriched._priceNum = this.parseNumber(enriched._price);
            enriched._totalNum = this.parseNumber(enriched._total);

            // Parse date
            if (enriched._date) {
                const parsedDate = this.parseDate(enriched._date);
                if (parsedDate) {
                    enriched._dateObj = parsedDate;
                    enriched._year = parsedDate.getFullYear();
                    enriched._month = parsedDate.getMonth() + 1;
                    enriched._week = this.getWeekNumber(parsedDate);
                }
            }

            return enriched;
        });
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
     * Parse date from various formats
     */
    static parseDate(dateStr) {
        if (!dateStr) return null;

        // Try ISO format first
        let date = new Date(dateStr);
        if (!isNaN(date.getTime())) return date;

        // Try Norwegian format (DD.MM.YYYY or DD/MM/YYYY)
        const parts = dateStr.split(/[./-]/);
        if (parts.length === 3) {
            const day = parseInt(parts[0]);
            const month = parseInt(parts[1]) - 1;
            const year = parseInt(parts[2]);
            date = new Date(year, month, day);
            if (!isNaN(date.getTime())) return date;
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
     * Render frequent purchases view
     */
    static renderFrequent() {
        const grouped = this._groupBy(this._enrichedData, item => item._itemNo);

        const aggregated = Array.from(grouped.entries()).map(([itemNo, rows]) => {
            const description = rows[0]._description || '';

            // Count unique orders
            const uniqueOrders = new Set(rows.map(r => r._orderNo)).size;

            // Average quantity per order
            const totalQty = rows.reduce((sum, r) => sum + r._quantityNum, 0);
            const avgQtyPerOrder = uniqueOrders > 0 ? totalQty / uniqueOrders : 0;

            // Average days between purchases
            const dates = rows
                .filter(r => r._dateObj)
                .map(r => r._dateObj)
                .sort((a, b) => a - b);
            const avgDays = this._daysBetween(dates);

            return {
                itemNo,
                description,
                orderCount: uniqueOrders,
                avgQtyPerOrder,
                avgDays
            };
        });

        // Sort by order count descending
        aggregated.sort((a, b) => b.orderCount - a.orderCount);

        // Take top 50
        const top50 = aggregated.slice(0, 50);

        let html = '<h3 style="margin-top: 20px;">⚡ Oftest kjøpt</h3>';

        html += '<div class="butler-table-wrapper">';
        html += '<table class="data-table">';
        html += '<thead><tr>';
        html += '<th>Rang</th>';
        html += '<th>Artikkel</th>';
        html += '<th>Beskrivelse</th>';
        html += '<th style="text-align: right;">Antall ordre</th>';
        html += '<th style="text-align: right;">Snitt antall/ordre</th>';
        html += '<th style="text-align: right;">Snitt dager mellom kjøp</th>';
        html += '</tr></thead><tbody>';

        top50.forEach((item, index) => {
            html += '<tr>';
            html += `<td>${index + 1}</td>`;
            html += `<td>${item.itemNo || '-'}</td>`;
            html += `<td>${item.description || '-'}</td>`;
            html += `<td style="text-align: right;">${item.orderCount}</td>`;
            html += `<td style="text-align: right;">${this._fmt(item.avgQtyPerOrder, 1)}</td>`;
            html += `<td style="text-align: right;">${this._fmt(item.avgDays, 0)}</td>`;
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
}

// Export to window for global access
window.OrderAnalyzer = OrderAnalyzer;
