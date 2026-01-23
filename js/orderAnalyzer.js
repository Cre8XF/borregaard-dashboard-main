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
     * Column mapping for order history data
     */
    static ORDER_COLUMNS = {
        itemNo: ['Artikelnr', 'Artikelnummer', 'ItemNo', 'Item Number'],
        description: ['Artikelbeskrivelse', 'Beskrivelse', 'Item Name', 'Description'],
        date: ['Dato', 'Date', 'OrderDate', 'Orderdato'],
        quantity: ['Antall', 'Quantity', 'Qty', 'Mengde'],
        customer: ['Kunde', 'Customer', 'Kundenr', 'CustomerNo'],
        orderNo: ['Ordrenr', 'OrderNo', 'Order Number', 'Ordernummer'],
        price: ['Pris', 'Price', 'UnitPrice'],
        total: ['Totalt', 'Total', 'Amount']
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
        return data.map(row => {
            const enriched = { ...row };

            // Map order columns to standard fields
            Object.keys(this.ORDER_COLUMNS).forEach(field => {
                const variants = this.ORDER_COLUMNS[field];
                for (let variant of variants) {
                    if (row[variant] !== undefined && row[variant] !== '') {
                        enriched[`_${field}`] = row[variant];
                        break;
                    }
                }
            });

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
     * Render top sellers view (placeholder)
     */
    static renderTopSellers() {
        return `
            <h3 style="margin-top: 20px;">🏆 Mest solgt</h3>
            <p class="text-muted" style="margin: 20px 0;">
                Denne visningen vil vise de mest solgte artiklene basert på totalt antall solgt.
                <br><br>
                <strong>Kommer snart:</strong>
                <ul style="margin-left: 20px; margin-top: 10px;">
                    <li>Topp 50 mest solgte artikler</li>
                    <li>Total mengde og verdi</li>
                    <li>Trend over tid</li>
                    <li>Eksport til CSV</li>
                </ul>
            </p>
        `;
    }

    /**
     * Render frequent purchases view (placeholder)
     */
    static renderFrequent() {
        return `
            <h3 style="margin-top: 20px;">⚡ Oftest kjøpt</h3>
            <p class="text-muted" style="margin: 20px 0;">
                Denne visningen vil vise artikler som kjøpes oftest (høyest ordrefrekvens).
                <br><br>
                <strong>Kommer snart:</strong>
                <ul style="margin-left: 20px; margin-top: 10px;">
                    <li>Artikler sortert etter antall ordre</li>
                    <li>Gjennomsnittlig antall per ordre</li>
                    <li>Gjennomsnittlig tid mellom kjøp</li>
                </ul>
            </p>
        `;
    }

    /**
     * Render seasonal patterns view (placeholder)
     */
    static renderSeasonal() {
        return `
            <h3 style="margin-top: 20px;">📅 Sesongmønstre</h3>
            <p class="text-muted" style="margin: 20px 0;">
                Denne visningen vil vise sesongmessige kjøpsmønstre per måned og uke.
                <br><br>
                <strong>Kommer snart:</strong>
                <ul style="margin-left: 20px; margin-top: 10px;">
                    <li>Salg per måned (alle år)</li>
                    <li>Salg per uke (alle år)</li>
                    <li>Identifisering av sesongvarer</li>
                    <li>Prognoser basert på historikk</li>
                </ul>
            </p>
        `;
    }

    /**
     * Render customers view (placeholder)
     */
    static renderCustomers() {
        return `
            <h3 style="margin-top: 20px;">👥 Per kunde</h3>
            <p class="text-muted" style="margin: 20px 0;">
                Denne visningen vil vise kjøpsmønstre per kunde.
                <br><br>
                <strong>Kommer snart:</strong>
                <ul style="margin-left: 20px; margin-top: 10px;">
                    <li>Topp kunder etter volum</li>
                    <li>Kundesspesifikke produkter</li>
                    <li>Kjøpsfrekvens per kunde</li>
                    <li>Kundeverdi over tid</li>
                </ul>
            </p>
        `;
    }

    /**
     * Render timeline view (placeholder)
     */
    static renderTimeline() {
        return `
            <h3 style="margin-top: 20px;">📈 Tidslinje</h3>
            <p class="text-muted" style="margin: 20px 0;">
                Denne visningen vil vise salg over tid med trendlinjer.
                <br><br>
                <strong>Kommer snart:</strong>
                <ul style="margin-left: 20px; margin-top: 10px;">
                    <li>Salg per dag/uke/måned</li>
                    <li>Trendlinjer og prognoser</li>
                    <li>Sammenligning år-over-år</li>
                    <li>Visualisering med grafer</li>
                </ul>
            </p>
        `;
    }
}

// Export to window for global access
window.OrderAnalyzer = OrderAnalyzer;
