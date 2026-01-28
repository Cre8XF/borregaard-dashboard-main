// ===================================
// BORREGAARD DASHBOARD v4.0
// Arbeidsrettet beslutningstøtte
// ===================================

/**
 * DashboardApp - Hovedkontroller for applikasjonen
 * Koordinerer dataflyt, filopplasting og modulvisning
 */
class DashboardApp {
    constructor() {
        // Datakilder (rå filer)
        this.files = {
            inventory: null,    // Lagerbeholdning.xlsx
            ordersIn: null,     // Bestillinger.xlsx
            ordersOut: null,    // Fakturert.xlsx
            saNumber: null      // SA-Nummer.xlsx (valgfri)
        };

        // Samlet datastruktur
        this.dataStore = null;

        // Legacy data (for bakoverkompatibilitet)
        this.processedData = [];

        // Nåværende arbeidsmodus
        this.currentModule = 'overview';

        this.init();
    }

    /**
     * Initialiser applikasjonen
     */
    init() {
        console.log('Borregaard Dashboard v4.0 initializing...');
        this.setupEventListeners();
        this.loadStoredData();
    }

    /**
     * Sett opp event listeners
     */
    setupEventListeners() {
        // Upload-knapp
        const uploadBtn = document.getElementById('uploadBtn');
        if (uploadBtn) {
            uploadBtn.addEventListener('click', () => this.handleFileUpload());
        }

        // Nullstill-knapp
        const clearBtn = document.getElementById('clearBtn');
        if (clearBtn) {
            clearBtn.addEventListener('click', () => this.clearAllData());
        }

        // Tab-navigasjon (arbeidsmoduser)
        document.querySelectorAll('.tab-navigation .tab').forEach(tab => {
            tab.addEventListener('click', (e) => {
                const module = e.currentTarget.dataset.module;
                if (module) {
                    this.switchModule(module);
                }
            });
        });

        // Tastatursnarvei: Ctrl+S for å lagre
        document.addEventListener('keydown', (e) => {
            if (e.ctrlKey && e.key === 's') {
                e.preventDefault();
                this.saveData();
                this.showToast('Data lagret', 'success');
            }
        });
    }

    /**
     * Håndter filopplasting
     */
    async handleFileUpload() {
        // Hent filer fra input-elementer
        const inventoryFile = document.getElementById('inventoryFile')?.files[0];
        const ordersInFile = document.getElementById('ordersInFile')?.files[0];
        const ordersOutFile = document.getElementById('ordersOutFile')?.files[0];
        const saNumberFile = document.getElementById('saNumberFile')?.files[0];

        // Valider påkrevde filer
        if (!inventoryFile || !ordersInFile || !ordersOutFile) {
            this.showStatus('Lagerbeholdning, Bestillinger og Fakturert er påkrevd!', 'error');
            return;
        }

        this.showStatus('Behandler filer...', 'info');
        this.setLoadingState(true);

        try {
            // Prosesser alle filer via DataProcessor
            this.dataStore = await DataProcessor.processAllFiles({
                inventory: inventoryFile,
                ordersIn: ordersInFile,
                ordersOut: ordersOutFile,
                saNumber: saNumberFile
            }, (status) => this.showStatus(status, 'info'));

            // Generer legacy processedData for bakoverkompatibilitet
            this.processedData = this.generateLegacyData();

            console.log(`Prosessert: ${this.dataStore.items.size} artikler`);

            // Oppdater UI
            this.updateSummaryCards();
            this.renderCurrentModule();
            this.saveData();

            const quality = this.dataStore.getDataQualityReport();
            this.showStatus(
                `Ferdig! ${quality.totalArticles} artikler analysert. SA-dekning: ${quality.saNumberCoverage}%`,
                'success'
            );

        } catch (error) {
            console.error('Upload error:', error);
            this.showStatus('Feil ved lasting: ' + error.message, 'error');
        } finally {
            this.setLoadingState(false);
        }
    }

    /**
     * Generer legacy-format for bakoverkompatibilitet
     */
    generateLegacyData() {
        if (!this.dataStore) return [];

        return this.dataStore.getAllItems().map(item => {
            const display = item.toDisplayObject();
            return {
                itemNo: item.toolsArticleNumber,
                description: item.description,
                stock: item.stock,
                available: item.available,
                reserved: item.reserved,
                bp: item.bp,
                max: item.max,
                status: item.status,
                supplier: item.supplier,
                shelf: item.shelf,
                sales12m: display.sales12m,
                orderCount: display.orderCount,
                monthlyConsumption: display.monthlyConsumption,
                daysToEmpty: display.daysToEmpty,
                lastSaleDate: display.lastSaleDate,
                r12: display.sales12m,
                price: 50 // Default
            };
        });
    }

    /**
     * Oppdater sammendragskort
     */
    updateSummaryCards() {
        if (!this.dataStore) return;

        const quality = this.dataStore.getDataQualityReport();
        const items = this.dataStore.getAllItems();

        // Totalt artikler
        const totalEl = document.getElementById('totalItems');
        if (totalEl) {
            totalEl.textContent = quality.totalArticles.toLocaleString('nb-NO');
        }

        // Kritiske issues
        let criticalCount = 0;
        let warningCount = 0;
        items.forEach(item => {
            const issues = item.getIssues();
            criticalCount += issues.filter(i => i.type === 'critical').length;
            warningCount += issues.filter(i => i.type === 'warning').length;
        });

        const criticalEl = document.getElementById('criticalCount');
        if (criticalEl) {
            criticalEl.textContent = criticalCount.toLocaleString('nb-NO');
        }

        const warningEl = document.getElementById('warningCount');
        if (warningEl) {
            warningEl.textContent = warningCount.toLocaleString('nb-NO');
        }

        // SA-nummer dekning
        const saEl = document.getElementById('saNumberCoverage');
        if (saEl) {
            saEl.textContent = `${quality.saNumberCoverage}%`;
        }

        // Innkommende bestillinger
        const incomingEl = document.getElementById('incomingCount');
        if (incomingEl) {
            incomingEl.textContent = quality.withIncoming.toLocaleString('nb-NO');
        }
    }

    /**
     * Bytt arbeidsmodus/tab
     */
    switchModule(moduleName) {
        // Oppdater aktiv tab
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
     * Render nåværende modul
     */
    renderCurrentModule() {
        const contentDiv = document.getElementById('moduleContent');
        if (!contentDiv) return;

        // Sjekk om vi har data
        if (!this.dataStore || this.dataStore.items.size === 0) {
            contentDiv.innerHTML = `
                <div class="placeholder-content">
                    <div class="placeholder-icon">📊</div>
                    <h3>Last opp data for å starte</h3>
                    <p>Last opp de 3 påkrevde filene for å begynne analysen.</p>
                    <ul class="file-checklist">
                        <li><strong>Lagerbeholdning.xlsx</strong> - Nåværende saldo og lokasjoner</li>
                        <li><strong>Bestillinger.xlsx</strong> - Åpne innkjøpsordrer</li>
                        <li><strong>Fakturert.xlsx</strong> - Salgshistorikk</li>
                        <li class="optional"><strong>SA-Nummer.xlsx</strong> - Valgfri koblingsfil</li>
                    </ul>
                    <p class="text-muted">Støttede formater: .xlsx, .csv</p>
                </div>
            `;
            return;
        }

        // Render basert på valgt modus
        switch (this.currentModule) {
            case 'overview':
                contentDiv.innerHTML = OverviewMode.render(this.dataStore);
                break;

            case 'demand':
                contentDiv.innerHTML = DemandMode.render(this.dataStore);
                break;

            case 'assortment':
                contentDiv.innerHTML = AssortmentMode.render(this.dataStore);
                break;

            case 'planning':
                contentDiv.innerHTML = PlanningMode.render(this.dataStore);
                break;

            // Legacy-moduler (bakoverkompatibilitet)
            case 'topSellers':
                if (typeof TopSellers !== 'undefined') {
                    contentDiv.innerHTML = TopSellers.render(this.processedData);
                }
                break;

            case 'orderSuggestions':
                if (typeof OrderSuggestions !== 'undefined') {
                    contentDiv.innerHTML = OrderSuggestions.render(this.processedData);
                }
                break;

            case 'slowMovers':
                if (typeof SlowMovers !== 'undefined') {
                    contentDiv.innerHTML = SlowMovers.render(this.processedData, []);
                }
                break;

            case 'inactiveItems':
                if (typeof InactiveItems !== 'undefined') {
                    contentDiv.innerHTML = InactiveItems.render(this.processedData);
                }
                break;

            default:
                contentDiv.innerHTML = OverviewMode.render(this.dataStore);
        }
    }

    /**
     * Render placeholder for moduler som ikke er implementert ennå
     */
    renderPlaceholder(title, message) {
        return `
            <div class="module-header">
                <h2>${title}</h2>
            </div>
            <div class="placeholder-content">
                <div class="placeholder-icon">🚧</div>
                <h3>${message}</h3>
                <p class="text-muted">Denne modulen er under utvikling.</p>
            </div>
        `;
    }

    /**
     * Vis statusmelding
     */
    showStatus(message, type = 'info') {
        const statusDiv = document.getElementById('uploadStatus');
        if (!statusDiv) return;

        statusDiv.textContent = message;
        statusDiv.className = 'status-message ' + type;

        // Auto-skjul suksessmeldinger
        if (type === 'success') {
            setTimeout(() => {
                statusDiv.className = 'status-message';
                statusDiv.textContent = '';
            }, 5000);
        }
    }

    /**
     * Vis toast-notifikasjon
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
     * Sett lasting-tilstand
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
     * Lagre data til localStorage
     */
    saveData() {
        try {
            // Lagre serialisert versjon av dataStore
            const dataToSave = {
                version: '4.0',
                currentModule: this.currentModule,
                timestamp: new Date().toISOString(),
                // Lagre som array av display-objekter
                items: this.dataStore ? this.dataStore.getAllDisplayItems() : [],
                saMapping: this.dataStore ? Array.from(this.dataStore.saMapping.entries()) : [],
                dataQuality: this.dataStore ? this.dataStore.getDataQualityReport() : null
            };

            localStorage.setItem('borregaardDashboardV4', JSON.stringify(dataToSave));
            console.log('Data lagret til localStorage');
            return true;
        } catch (error) {
            console.error('Kunne ikke lagre til localStorage:', error);
            if (error.name === 'QuotaExceededError') {
                this.showToast('Lagringskvote overskredet', 'error');
            }
            return false;
        }
    }

    /**
     * Last data fra localStorage
     */
    loadStoredData() {
        try {
            const stored = localStorage.getItem('borregaardDashboardV4');

            if (stored) {
                const parsed = JSON.parse(stored);

                if (parsed.version === '4.0' && parsed.items && parsed.items.length > 0) {
                    // Gjenoppbygg dataStore fra lagrede data
                    this.dataStore = this.rebuildDataStore(parsed);
                    this.processedData = this.generateLegacyData();
                    this.currentModule = parsed.currentModule || 'overview';

                    console.log('Lastet lagret data fra:', parsed.timestamp);

                    this.updateSummaryCards();
                    this.renderCurrentModule();
                    this.showToast('Data lastet fra forrige økt', 'success');
                }
            }
        } catch (error) {
            console.error('Kunne ikke laste fra localStorage:', error);
        }
    }

    /**
     * Gjenoppbygg dataStore fra lagrede data
     */
    rebuildDataStore(parsed) {
        const store = new UnifiedDataStore();

        // Gjenoppbygg SA-mapping
        if (parsed.saMapping) {
            parsed.saMapping.forEach(([key, value]) => {
                store.setSAMapping(key, value);
            });
        }

        // Gjenoppbygg items
        if (parsed.items) {
            parsed.items.forEach(itemData => {
                const item = store.getOrCreate(itemData.toolsArticleNumber);
                if (item) {
                    // Kopier alle felter
                    item.saNumber = itemData.saNumber;
                    item.description = itemData.description;
                    item.location = itemData.location;
                    item.stock = itemData.stock || 0;
                    item.reserved = itemData.reserved || 0;
                    item.available = itemData.available || 0;
                    item.bp = itemData.bp || 0;
                    item.max = itemData.max || 0;
                    item.status = itemData.status;
                    item.supplier = itemData.supplier;
                    item.shelf = itemData.shelf;
                    item.hasSANumber = itemData.hasSANumber;

                    // Beregn verdier (simuler)
                    item.sales6m = itemData.sales6m || 0;
                    item.sales12m = itemData.sales12m || 0;
                    item.orderCount = itemData.orderCount || 0;
                    item.monthlyConsumption = itemData.monthlyConsumption || 0;
                    item.daysToEmpty = itemData.daysToEmpty || 999999;
                }
            });
        }

        // Oppdater datakvalitet
        store.calculateAll();

        return store;
    }

    /**
     * Slett all data
     */
    clearAllData() {
        if (confirm('Er du sikker på at du vil slette all data? Dette kan ikke angres.')) {
            this.files = {
                inventory: null,
                ordersIn: null,
                ordersOut: null,
                saNumber: null
            };
            this.dataStore = null;
            this.processedData = [];

            localStorage.removeItem('borregaardDashboardV4');
            localStorage.removeItem('borregaardDashboardV3'); // Fjern også gammel versjon

            // Nullstill file inputs
            document.querySelectorAll('input[type="file"]').forEach(input => {
                input.value = '';
            });

            // Nullstill sammendragskort
            ['totalItems', 'criticalCount', 'warningCount', 'saNumberCoverage', 'incomingCount']
                .forEach(id => {
                    const el = document.getElementById(id);
                    if (el) el.textContent = '-';
                });

            // Nullstill innhold
            this.renderCurrentModule();

            this.showToast('All data slettet', 'success');
        }
    }
}

// Initialiser app når DOM er klar
document.addEventListener('DOMContentLoaded', () => {
    window.app = new DashboardApp();
});

console.log('Borregaard Dashboard v4.0 loaded');
