// ===================================
// BORREGAARD LAGERANALYSE v3.0
// Simplified Dashboard Application
// ===================================

/**
 * DashboardApp - Main application controller
 * Manages data flow, file uploads, and module coordination
 */
class DashboardApp {
    constructor() {
        this.data = {
            butler: [],        // Butler/Lagerbeholdning data
            sales: [],         // Fakturaer/salgshistorikk
            departments: []    // Andre avdelinger (valgfri)
        };

        this.processedData = [];
        this.currentModule = 'topSellers';

        this.init();
    }

    /**
     * Initialize the dashboard
     */
    init() {
        console.log('Borregaard Lageranalyse v3.0 initializing...');
        this.setupEventListeners();
        this.loadStoredData();
    }

    /**
     * Set up event listeners
     */
    setupEventListeners() {
        // Upload button
        const uploadBtn = document.getElementById('uploadBtn');
        if (uploadBtn) {
            uploadBtn.addEventListener('click', () => this.handleFileUpload());
        }

        // Clear button
        const clearBtn = document.getElementById('clearBtn');
        if (clearBtn) {
            clearBtn.addEventListener('click', () => this.clearAllData());
        }

        // Tab navigation
        document.querySelectorAll('.tab-navigation .tab').forEach(tab => {
            tab.addEventListener('click', (e) => {
                this.switchModule(e.target.dataset.module);
            });
        });

        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            if (e.ctrlKey && e.key === 's') {
                e.preventDefault();
                this.saveData();
                this.showToast('Data lagret', 'success');
            }
        });
    }

    /**
     * Handle file upload
     */
    async handleFileUpload() {
        const butlerFile = document.getElementById('butlerFile').files[0];
        const salesFile = document.getElementById('salesFile').files[0];
        const deptsFile = document.getElementById('departmentsFile').files[0];

        if (!butlerFile || !salesFile) {
            this.showStatus('Butler og Fakturaer er påkrevd!', 'error');
            return;
        }

        this.showStatus('Behandler filer...', 'info');
        this.setLoadingState(true);

        try {
            // Load Butler data
            this.showStatus('Laster lagerbeholdning...', 'info');
            const butlerResult = await this.loadFile(butlerFile);
            this.data.butler = butlerResult.data;
            console.log(`Butler: ${this.data.butler.length} rader lastet`);

            // Load Sales data
            this.showStatus('Laster salgshistorikk...', 'info');
            const salesResult = await this.loadFile(salesFile);
            this.data.sales = salesResult.data;
            console.log(`Sales: ${this.data.sales.length} rader lastet`);

            // Load departments (optional)
            if (deptsFile) {
                this.showStatus('Laster avdelingsdata...', 'info');
                const deptsResult = await this.loadFile(deptsFile);
                this.data.departments = deptsResult.data;
                console.log(`Departments: ${this.data.departments.length} rader lastet`);
            }

            // Process data
            this.showStatus('Analyserer data...', 'info');
            this.processedData = this.processData();
            console.log(`Processed: ${this.processedData.length} artikler`);

            // Update UI
            this.updateSummaryCards();
            this.renderCurrentModule();
            this.saveData();

            this.showStatus(`Ferdig! ${this.processedData.length} artikler analysert.`, 'success');

        } catch (error) {
            console.error('Upload error:', error);
            this.showStatus('Feil ved lasting: ' + error.message, 'error');
        } finally {
            this.setLoadingState(false);
        }
    }

    /**
     * Load a file (CSV or Excel)
     */
    async loadFile(file) {
        const fileName = file.name.toLowerCase();

        if (fileName.endsWith('.csv')) {
            return await DataLoader.loadCSV(file);
        } else if (fileName.endsWith('.xlsx') || fileName.endsWith('.xls')) {
            return await DataLoader.loadExcel(file);
        } else {
            throw new Error('Ugyldig filformat. Kun CSV og XLSX støttes.');
        }
    }

    /**
     * Get value from object with flexible column name matching
     * Handles variations in casing, spaces, and column names
     */
    getColumnValue(row, ...columnNames) {
        // First try exact matches
        for (const name of columnNames) {
            if (row[name] !== undefined && row[name] !== null && row[name] !== '') {
                return row[name];
            }
        }

        // Then try case-insensitive matches
        const keys = Object.keys(row);
        for (const name of columnNames) {
            const lowerName = name.toLowerCase().trim();
            for (const key of keys) {
                if (key.toLowerCase().trim() === lowerName) {
                    if (row[key] !== undefined && row[key] !== null && row[key] !== '') {
                        return row[key];
                    }
                }
            }
        }

        // Try partial matches (column contains the search term)
        for (const name of columnNames) {
            const lowerName = name.toLowerCase();
            for (const key of keys) {
                if (key.toLowerCase().includes(lowerName) || lowerName.includes(key.toLowerCase())) {
                    if (row[key] !== undefined && row[key] !== null && row[key] !== '') {
                        return row[key];
                    }
                }
            }
        }

        return '';
    }

    /**
     * Process data - match Butler with Sales
     */
    processData() {
        const processed = [];
        const oneYearAgo = new Date();
        oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);

        // Build article number lookup
        const butlerItems = this.data.butler;

        // Debug: Log first item column names
        if (butlerItems.length > 0) {
            console.log('Butler columns:', Object.keys(butlerItems[0]));
        }

        butlerItems.forEach(butlerItem => {
            // Get item number (try different column names)
            const itemNo = this.getColumnValue(butlerItem,
                'Artikelnr', 'Item ID', 'ItemNo', 'Varenr', 'Item', 'ArticleNo', 'Artikkelnr'
            );

            if (!itemNo) return;

            // Get description from Butler - this is the primary source
            const description = this.getColumnValue(butlerItem,
                'Artikelbeskrivelse', 'Artikelbeskr', 'Description', 'Beskrivelse',
                'Item Description', 'ItemDesc', 'Varebeskrivelse', 'Navn', 'Name'
            );

            // Find sales for this item
            const itemSales = this.data.sales.filter(sale => {
                const saleItemNo = this.getColumnValue(sale,
                    'Item ID', 'Artikelnr', 'ItemNo', 'Item', 'Varenr'
                );
                return saleItemNo === itemNo || String(saleItemNo) === String(itemNo);
            });

            // Filter to last 12 months
            const recentSales = itemSales.filter(sale => {
                const dateStr = this.getColumnValue(sale,
                    'Delivery date', 'Dato', 'Date', 'Invoice date', 'Fakturadato'
                );
                if (!dateStr) return true;
                const saleDate = DataLoader.parseDate(dateStr);
                return saleDate && saleDate >= oneYearAgo;
            });

            // Calculate metrics
            const sales12m = recentSales.reduce((sum, s) => {
                const qty = parseFloat(this.getColumnValue(s,
                    'Invoiced quantity', 'Antall', 'Quantity', 'Qty', 'Fakturert antall'
                ) || 0);
                return sum + (isNaN(qty) ? 0 : qty);
            }, 0);

            const orderNumbers = new Set(recentSales.map(s =>
                this.getColumnValue(s, 'Order number', 'Ordrenr', 'OrderNo', 'Order') || Math.random().toString()
            ));
            const orderCount = orderNumbers.size;

            const stock = parseFloat(this.getColumnValue(butlerItem,
                'Lagersaldo', 'Stock', 'Beholdning', 'Lager', 'OnHand'
            ) || 0) || 0;

            const bp = parseFloat(this.getColumnValue(butlerItem,
                'BP', 'Bestillingspunkt', 'Reorder Point', 'Min'
            ) || 0) || 0;

            const monthlyConsumption = sales12m / 12;
            const daysToEmpty = monthlyConsumption > 0 ?
                Math.round(stock / (sales12m / 365)) : 999999;

            // Get last sale date
            let lastSaleDate = null;
            if (recentSales.length > 0) {
                const dates = recentSales
                    .map(s => this.getColumnValue(s, 'Delivery date', 'Dato', 'Date') || '')
                    .filter(d => d)
                    .sort()
                    .reverse();
                lastSaleDate = dates[0] || null;
            }

            processed.push({
                itemNo: itemNo,
                description: description,
                stock: stock,
                available: parseFloat(this.getColumnValue(butlerItem,
                    'DispLagSaldo', 'Available', 'Disponibel', 'Disp'
                ) || stock) || 0,
                reserved: parseFloat(this.getColumnValue(butlerItem,
                    'ReservAnt', 'Reserved', 'Reservert'
                ) || 0) || 0,
                bp: bp,
                max: parseFloat(this.getColumnValue(butlerItem,
                    'Maxlager', 'Max', 'Maximum'
                ) || 0) || 0,
                status: this.getColumnValue(butlerItem,
                    'Artikelstatus', 'Status', 'ItemStatus', 'Varestatus'
                ),
                supplier: this.getColumnValue(butlerItem,
                    'Supplier Name', 'Leverandør', 'Supplier', 'Vendor', 'Leverandørnavn'
                ),
                r12: parseFloat(this.getColumnValue(butlerItem,
                    'R12 Del Qty', 'R12', 'Rolling12'
                ) || 0) || 0,
                shelf: this.getColumnValue(butlerItem,
                    'Hylla 1', 'Shelf', 'Hylleplassering', 'Location', 'Lokasjon'
                ),
                sales12m: Math.round(sales12m),
                orderCount: orderCount,
                monthlyConsumption: monthlyConsumption,
                daysToEmpty: daysToEmpty,
                lastSaleDate: lastSaleDate,
                price: parseFloat(this.getColumnValue(butlerItem,
                    'Price', 'Pris', 'Unit Price', 'Enhetspris'
                ) || 50) || 50
            });
        });

        return processed;
    }

    /**
     * Update summary cards
     */
    updateSummaryCards() {
        // Total items
        document.getElementById('totalItems').textContent =
            this.processedData.length.toLocaleString('nb-NO');

        // Top sellers (items with sales > 0)
        const topSellersCount = TopSellers.getCount(this.processedData);
        document.getElementById('topSellersCount').textContent =
            topSellersCount.toLocaleString('nb-NO');

        // Action items (need BP adjustment)
        const actionItemsCount = OrderSuggestions.getCount(this.processedData);
        document.getElementById('actionItemsCount').textContent =
            actionItemsCount.toLocaleString('nb-NO');

        // Slow movers
        const slowMoversCount = SlowMovers.getCount(this.processedData);
        document.getElementById('slowMoversCount').textContent =
            slowMoversCount.toLocaleString('nb-NO');

        // Inactive with stock
        const inactiveCount = InactiveItems.getCount(this.processedData);
        document.getElementById('inactiveCount').textContent =
            inactiveCount.toLocaleString('nb-NO');
    }

    /**
     * Switch module/tab
     */
    switchModule(moduleName) {
        // Update active tab
        document.querySelectorAll('.tab-navigation .tab').forEach(tab => {
            tab.classList.remove('active');
            if (tab.dataset.module === moduleName) {
                tab.classList.add('active');
            }
        });

        this.currentModule = moduleName;
        this.renderCurrentModule();
    }

    /**
     * Render current module
     */
    renderCurrentModule() {
        const contentDiv = document.getElementById('moduleContent');

        if (this.processedData.length === 0) {
            contentDiv.innerHTML = `
                <div class="placeholder-content">
                    <p>Last opp Butler-data og salgshistorikk for å starte analysen.</p>
                    <p class="text-muted">Støttede formater: .xlsx, .csv</p>
                </div>
            `;
            return;
        }

        switch (this.currentModule) {
            case 'topSellers':
                contentDiv.innerHTML = TopSellers.render(this.processedData);
                break;
            case 'orderSuggestions':
                contentDiv.innerHTML = OrderSuggestions.render(this.processedData);
                break;
            case 'slowMovers':
                contentDiv.innerHTML = SlowMovers.render(
                    this.processedData,
                    this.data.departments
                );
                break;
            case 'inactiveItems':
                contentDiv.innerHTML = InactiveItems.render(this.processedData);
                break;
            default:
                contentDiv.innerHTML = TopSellers.render(this.processedData);
        }
    }

    /**
     * Show status message
     */
    showStatus(message, type = 'info') {
        const statusDiv = document.getElementById('uploadStatus');
        if (!statusDiv) return;

        statusDiv.textContent = message;
        statusDiv.className = 'status-message ' + type;

        // Auto-hide success messages
        if (type === 'success') {
            setTimeout(() => {
                statusDiv.className = 'status-message';
                statusDiv.textContent = '';
            }, 5000);
        }
    }

    /**
     * Show toast notification
     */
    showToast(message, type = 'success') {
        const existingToasts = document.querySelectorAll('.toast');
        existingToasts.forEach(t => t.remove());

        const toast = document.createElement('div');
        toast.className = `toast ${type} show`;
        toast.textContent = message;

        document.body.appendChild(toast);

        setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    }

    /**
     * Set loading state
     */
    setLoadingState(loading) {
        const uploadBtn = document.getElementById('uploadBtn');
        const fileInputs = document.querySelectorAll('input[type="file"]');

        if (loading) {
            if (uploadBtn) {
                uploadBtn.disabled = true;
                uploadBtn.textContent = 'Behandler...';
            }
            fileInputs.forEach(input => input.disabled = true);
        } else {
            if (uploadBtn) {
                uploadBtn.disabled = false;
                uploadBtn.textContent = 'Analyser data';
            }
            fileInputs.forEach(input => input.disabled = false);
        }
    }

    /**
     * Save data to localStorage
     */
    saveData() {
        try {
            const dataToSave = {
                processedData: this.processedData,
                currentModule: this.currentModule,
                timestamp: new Date().toISOString()
            };

            localStorage.setItem('borregaardDashboardV3', JSON.stringify(dataToSave));
            console.log('Data saved to localStorage');
            return true;
        } catch (error) {
            console.error('Could not save to localStorage:', error);
            if (error.name === 'QuotaExceededError') {
                this.showToast('Lagringskvote overskredet', 'error');
            }
            return false;
        }
    }

    /**
     * Load data from localStorage
     */
    loadStoredData() {
        try {
            const stored = localStorage.getItem('borregaardDashboardV3');

            if (stored) {
                const parsed = JSON.parse(stored);

                if (parsed.processedData && parsed.processedData.length > 0) {
                    this.processedData = parsed.processedData;
                    this.currentModule = parsed.currentModule || 'topSellers';

                    console.log('Loaded stored data from:', parsed.timestamp);

                    this.updateSummaryCards();
                    this.renderCurrentModule();
                    this.showToast('Data lastet fra forrige økt', 'success');
                }
            }
        } catch (error) {
            console.error('Could not load from localStorage:', error);
        }
    }

    /**
     * Clear all data
     */
    clearAllData() {
        if (confirm('Er du sikker på at du vil slette all data? Dette kan ikke angres.')) {
            this.data = {
                butler: [],
                sales: [],
                departments: []
            };
            this.processedData = [];

            localStorage.removeItem('borregaardDashboardV3');

            // Reset file inputs
            document.querySelectorAll('input[type="file"]').forEach(input => {
                input.value = '';
            });

            // Reset summary cards
            ['totalItems', 'topSellersCount', 'actionItemsCount', 'slowMoversCount', 'inactiveCount']
                .forEach(id => {
                    const el = document.getElementById(id);
                    if (el) el.textContent = '-';
                });

            // Reset content
            const contentDiv = document.getElementById('moduleContent');
            if (contentDiv) {
                contentDiv.innerHTML = `
                    <div class="placeholder-content">
                        <p>Last opp Butler-data og salgshistorikk for å starte analysen.</p>
                        <p class="text-muted">Støttede formater: .xlsx, .csv</p>
                    </div>
                `;
            }

            this.showToast('All data slettet', 'success');
        }
    }
}

// Initialize app when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    window.app = new DashboardApp();
});

console.log('Borregaard Lageranalyse v3.0 loaded');
