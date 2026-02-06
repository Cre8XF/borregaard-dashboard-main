// ===================================
// BORREGAARD DASHBOARD v4.2
// Master.xlsx er SINGLE SOURCE OF TRUTH
// Ordrer_Jeeves.xlsx brukes KUN for salg/etterspørsel
// ===================================

/**
 * DashboardApp - Hovedkontroller for applikasjonen
 * Koordinerer dataflyt, filopplasting og modulvisning
 *
 * ARCHITECTURE:
 *   Master.xlsx → all article data (stock, status, incoming, alternatives)
 *   Ordrer_Jeeves.xlsx → sales / demand analysis only
 */
class DashboardApp {
    constructor() {
        // Datakilder (4 filer)
        this.files = {
            master: null,       // Master.xlsx (REQUIRED)
            ordersOut: null,    // Ordrer_Jeeves.xlsx (REQUIRED)
            sa: null,           // SA-nummer.xlsx (OPTIONAL)
            lagerplan: null     // Analyse_Lagerplan.xlsx (OPTIONAL — BP/EOK)
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
        console.log('Borregaard Dashboard v4.2 initializing...');
        console.log('Master.xlsx is used as the single source of truth');
        this.setupEventListeners();
        this.setupDropZone();
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
     * Sett opp multi-file drop zone
     */
    setupDropZone() {
        const dropZone = document.getElementById('multiDropZone');
        if (!dropZone) return;

        // Prevent default drag behaviors on the whole page
        ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
            document.body.addEventListener(eventName, (e) => {
                e.preventDefault();
                e.stopPropagation();
            });
        });

        // Highlight on drag enter/over
        ['dragenter', 'dragover'].forEach(eventName => {
            dropZone.addEventListener(eventName, () => {
                dropZone.classList.add('drag-active');
            });
        });

        // Remove highlight on drag leave/drop
        ['dragleave', 'drop'].forEach(eventName => {
            dropZone.addEventListener(eventName, () => {
                dropZone.classList.remove('drag-active');
            });
        });

        // Handle drop
        dropZone.addEventListener('drop', (e) => {
            const files = Array.from(e.dataTransfer.files);
            const xlsxFiles = files.filter(f =>
                f.name.endsWith('.xlsx') || f.name.endsWith('.csv')
            );

            if (xlsxFiles.length === 0) {
                this.updateDropStatus([{ status: 'error', message: 'Ingen Excel/CSV-filer funnet' }]);
                return;
            }

            this.handleMultiFileDrop(xlsxFiles);
        });
    }

    /**
     * Håndter multi-file drop — detekter og ruter filer til riktig input
     *
     * Only 2 file types are recognized:
     *   master    → Master.xlsx
     *   ordersOut → Ordrer_Jeeves.xlsx
     */
    async handleMultiFileDrop(files) {
        this.updateDropStatus([{ status: 'info', message: `Identifiserer ${files.length} fil(er)...` }]);

        const results = [];
        const routed = { master: null, ordersOut: null, sa: null, lagerplan: null };

        for (const file of files) {
            try {
                const fileType = await this.detectFileType(file);

                if (fileType && !routed[fileType]) {
                    routed[fileType] = file;
                    results.push({ status: 'ok', message: this.getFileTypeLabel(fileType) + ': ' + file.name });
                } else if (fileType && routed[fileType]) {
                    routed[fileType] = file;
                    results.push({ status: 'ok', message: this.getFileTypeLabel(fileType) + ': ' + file.name + ' (overskrevet)' });
                } else {
                    results.push({ status: 'error', message: 'Ukjent fil ignorert: ' + file.name });
                }
            } catch (err) {
                results.push({ status: 'error', message: 'Feil ved lesing: ' + file.name });
            }
        }

        // Place files into input elements
        this.setFileInput('masterFile', routed.master);
        this.setFileInput('ordersOutFile', routed.ordersOut);
        this.setFileInput('saFile', routed.sa);
        this.setFileInput('lagerplanFile', routed.lagerplan);

        // Add missing file warnings
        if (!routed.master) results.push({ status: 'warning', message: 'Master.xlsx mangler (påkrevd)' });
        if (!routed.ordersOut) results.push({ status: 'warning', message: 'Ordrer_Jeeves.xlsx mangler (påkrevd)' });
        if (!routed.sa) results.push({ status: 'info', message: 'SA-nummer fil ikke funnet (valgfri)' });
        if (!routed.lagerplan) results.push({ status: 'info', message: 'Analyse_Lagerplan.xlsx ikke funnet (valgfri)' });

        this.updateDropStatus(results);

        // Auto-trigger analysis if all required files are present
        if (routed.master && routed.ordersOut) {
            this.handleFileUpload();
        }
    }

    /**
     * Detekter filtype basert på filnavn (primært) og kolonner (fallback)
     *
     * Recognizes:
     *   master    → filename contains 'master'
     *   ordersOut → filename contains 'ordrer'
     *   sa        → filename contains 'sa-nummer' or 'sa_nummer' or 'sanummer'
     *
     * @param {File} file
     * @returns {Promise<string|null>} 'master' | 'ordersOut' | 'sa' | null
     */
    async detectFileType(file) {
        const name = file.name.toLowerCase();

        // Primary: filename-based detection
        const filenameRules = [
            { match: 'master',           type: 'master' },
            { match: 'ordrer',           type: 'ordersOut' },
            { match: 'sa-nummer',        type: 'sa' },
            { match: 'sa_nummer',        type: 'sa' },
            { match: 'sanummer',         type: 'sa' },
            { match: 'analyse_lagerplan', type: 'lagerplan' },
            { match: 'analyse-lagerplan', type: 'lagerplan' },
            { match: 'analyselagerplan',  type: 'lagerplan' },
            { match: 'lagerplan',         type: 'lagerplan' }
        ];

        for (const rule of filenameRules) {
            if (name.includes(rule.match)) {
                return rule.type;
            }
        }

        // Fallback: column-based detection
        try {
            const columns = await this.peekColumns(file);
            const colSet = new Set(columns.map(c => c.toLowerCase().trim()));

            // Master.xlsx: must have TotLagSaldo and Artikelstatus and Ersätts av artikel
            if (colSet.has('totlagsaldo') && colSet.has('artikelstatus')) {
                return 'master';
            }

            // Ordrer: Artikelnr + LevPlFtgKod or OrdRadAnt
            if (colSet.has('artikelnr') && (colSet.has('levplftgkod') || colSet.has('ordradant') || colSet.has('faktdat'))) {
                return 'ordersOut';
            }

            // SA-nummer: Artikelnr + SA-nummer/SA nummer
            const hasSAColumn = [...colSet].some(c =>
                c.includes('sa-nummer') || c.includes('sa nummer') || c === 'sa' || c.includes('sanummer')
            );
            if (colSet.has('artikelnr') && hasSAColumn) {
                return 'sa';
            }

            // Analyse_Lagerplan: har BP og/eller EOK kolonner
            const hasBP = colSet.has('bp') || colSet.has('bestillingspunkt') || colSet.has('bestillingspkt');
            const hasEOK = colSet.has('eok') || colSet.has('ordrekvantitet') || colSet.has('eoq');
            if (colSet.has('artikelnr') && (hasBP || hasEOK)) {
                return 'lagerplan';
            }
        } catch (e) {
            console.warn('Column detection failed for', file.name, e);
        }

        return null;
    }

    /**
     * Les kolonneoverskrifter fra en Excel/CSV-fil uten å parse hele filen
     */
    async peekColumns(file) {
        if (file.name.endsWith('.csv')) {
            const text = await file.text();
            const firstLine = text.split(/\r?\n/)[0] || '';
            const delimiter = [';', ',', '\t'].reduce((best, d) => {
                const count = (firstLine.match(new RegExp('\\' + d, 'g')) || []).length;
                return count > best.count ? { d, count } : best;
            }, { d: ',', count: 0 }).d;
            return firstLine.split(delimiter).map(h => h.replace(/"/g, '').trim());
        }

        // Excel: use XLSX to read just the header
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                try {
                    const data = new Uint8Array(e.target.result);
                    const wb = XLSX.read(data, { type: 'array', sheetRows: 1 });
                    const ws = wb.Sheets[wb.SheetNames[0]];
                    const rows = XLSX.utils.sheet_to_json(ws, { header: 1 });
                    resolve(rows[0] ? rows[0].map(c => String(c)) : []);
                } catch (err) {
                    reject(err);
                }
            };
            reader.onerror = () => reject(new Error('Read error'));
            reader.readAsArrayBuffer(file);
        });
    }

    /**
     * Plasser fil i et input-element via DataTransfer
     */
    setFileInput(inputId, file) {
        const input = document.getElementById(inputId);
        if (!input) return;

        if (file) {
            const dt = new DataTransfer();
            dt.items.add(file);
            input.files = dt.files;
        }
    }

    /**
     * Oppdater drop-status visning
     */
    updateDropStatus(results) {
        const container = document.getElementById('dropStatus');
        if (!container) return;

        const icons = { ok: '✔', warning: '⚠', error: '✘', info: 'ℹ' };

        container.innerHTML = results.map(r =>
            `<div class="drop-status-line drop-status-${r.status}">
                <span class="drop-status-icon">${icons[r.status] || ''}</span>
                ${r.message}
            </div>`
        ).join('');
    }

    /**
     * Hent label for filtype
     */
    getFileTypeLabel(type) {
        const labels = {
            master: 'Master',
            ordersOut: 'Ordrer (salg ut)',
            sa: 'SA-nummer',
            lagerplan: 'Analyse Lagerplan'
        };
        return labels[type] || type;
    }

    /**
     * Håndter filopplasting
     */
    async handleFileUpload() {
        // Hent filer fra input-elementer
        const masterFile = document.getElementById('masterFile')?.files[0];
        const ordersOutFile = document.getElementById('ordersOutFile')?.files[0];
        const saFile = document.getElementById('saFile')?.files[0] || null;
        const lagerplanFile = document.getElementById('lagerplanFile')?.files[0] || null;

        // Valider påkrevde filer
        if (!masterFile || !ordersOutFile) {
            this.showStatus('Master.xlsx og Ordrer_Jeeves.xlsx er påkrevd!', 'error');
            return;
        }

        this.showStatus('Behandler filer...', 'info');
        this.setLoadingState(true);

        try {
            // Prosesser alle filer via DataProcessor
            this.dataStore = await DataProcessor.processAllFiles({
                master: masterFile,
                ordersOut: ordersOutFile,
                sa: saFile,
                lagerplan: lagerplanFile
            }, (status) => this.showStatus(status, 'info'));

            // Generer legacy processedData for bakoverkompatibilitet
            this.processedData = this.generateLegacyData();

            console.log(`Prosessert: ${this.dataStore.items.size} artikler`);
            console.log('Master.xlsx is used as the single source of truth');

            // Oppdater UI
            this.updateSummaryCards();
            this.renderCurrentModule();
            this.saveData();

            const quality = this.dataStore.getDataQualityReport();
            this.showStatus(
                `Ferdig! ${quality.totalArticles} artikler analysert fra Master.xlsx. Innkommende: ${quality.withIncoming}`,
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

        // FASE 6: Kun SA-artikler i legacy-formatet
        return this.dataStore.getActiveItems().map(item => {
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
                price: item.kalkylPris || 0,  // Fra Master.xlsx Kalkylpris bas — ingen hardkodet fallback
                estimertVerdi: item.estimertVerdi || 0
            };
        });
    }

    /**
     * Oppdater sammendragskort
     *
     * FASE 6: Bruker getActiveItems() (SA-artikler) for alle KPI-er.
     * Master-artikler uten SA påvirker ikke toppkortene.
     */
    updateSummaryCards() {
        if (!this.dataStore) return;

        const quality = this.dataStore.getDataQualityReport();
        // FASE 6: Kun SA-artikler i KPI-er
        const items = this.dataStore.getActiveItems();

        // Totalt SA-artikler (operativt univers)
        const totalEl = document.getElementById('totalItems');
        if (totalEl) {
            totalEl.textContent = quality.activeArticles.toLocaleString('nb-NO');
        }

        // Kritiske issues (kun SA-artikler)
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

        // SA-nummer dekning (relativt til hele Master)
        const saEl = document.getElementById('saNumberCoverage');
        if (saEl) {
            saEl.textContent = `${quality.saNumberCoverage}%`;
        }

        // Innkommende bestillinger (kun SA-artikler)
        const incomingEl = document.getElementById('incomingCount');
        if (incomingEl) {
            incomingEl.textContent = quality.activeWithIncoming.toLocaleString('nb-NO');
        }
    }

    /**
     * Bytt arbeidsmodus/tab
     */
    switchModule(moduleName) {
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
                    <p>Last opp de 2 påkrevde filene for å begynne analysen.</p>
                    <ul class="file-checklist">
                        <li><strong>Master.xlsx</strong> - Artikkelmasterdata (saldo, status, bestillinger, alternativer)</li>
                        <li><strong>Ordrer_Jeeves.xlsx</strong> - Salgsordrer ut (etterspørselsanalyse)</li>
                        <li><strong>SA-nummer.xlsx</strong> - SA-nummer per artikkel (valgfri)</li>
                        <li><strong>Analyse_Lagerplan.xlsx</strong> - BP og EOK per artikkel (valgfri)</li>
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

            case 'alternatives':
                if (typeof AlternativeAnalysisMode !== 'undefined') {
                    contentDiv.innerHTML = AlternativeAnalysisMode.render(this.dataStore);
                }
                break;

            // ── FASE 5: Legacy-moduler (kandidater for fjerning) ──
            // Disse modulene bruker legacy processedData-formatet i stedet for UnifiedDataStore.
            // De overlapper delvis med funksjonalitet i de 5 arbeidsmodusene:
            //   - topSellers → delvis dekket av DemandMode
            //   - orderSuggestions → delvis dekket av PlanningMode
            //   - slowMovers → delvis dekket av AssortmentMode
            //   - inactiveItems → delvis dekket av AssortmentMode
            // Bør fjernes når nye seksjoner er verifisert og godkjent.
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
            const dataToSave = {
                version: '4.2',
                currentModule: this.currentModule,
                timestamp: new Date().toISOString(),
                items: this.dataStore ? this.dataStore.getAllDisplayItems() : [],
                saMapping: this.dataStore ? Array.from(this.dataStore.saMapping.entries()) : [],
                alternativeArticles: this.dataStore && this.dataStore.alternativeArticles
                    ? Array.from(this.dataStore.alternativeArticles.entries())
                    : [],
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

                if (parsed.version === '4.2' && parsed.items && parsed.items.length > 0) {
                    this.dataStore = this.rebuildDataStore(parsed);
                    this.processedData = this.generateLegacyData();
                    this.currentModule = parsed.currentModule || 'overview';

                    console.log('Lastet lagret data fra:', parsed.timestamp);
                    console.log('Master.xlsx is used as the single source of truth');

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

        // Gjenoppbygg alternativ artikkel mapping
        if (parsed.alternativeArticles) {
            parsed.alternativeArticles.forEach(([key, value]) => {
                store.alternativeArticles.set(key, value);
            });
        }

        // Gjenoppbygg items
        if (parsed.items) {
            parsed.items.forEach(itemData => {
                const item = store.getOrCreate(itemData.toolsArticleNumber);
                if (item) {
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
                    item.saType = itemData.saType || null;
                    item.saGyldigFra = itemData.saGyldigFra ? new Date(itemData.saGyldigFra) : null;
                    item.saGyldigTil = itemData.saGyldigTil ? new Date(itemData.saGyldigTil) : null;
                    item._status = itemData._status || 'UKJENT';
                    item.bestAntLev = itemData.bestAntLev || 0;
                    item.bestillingsNummer = itemData.bestillingsNummer || '';
                    item.ersattAvArtikel = itemData.ersattAvArtikel || '';
                    item.ersatterArtikel = itemData.ersatterArtikel || '';
                    item.bestillingspunkt = itemData.bestillingspunkt ?? null;
                    item.ordrekvantitet = itemData.ordrekvantitet ?? null;
                    // Synk bp med bestillingspunkt fra Analyse_Lagerplan
                    if (item.bestillingspunkt !== null) {
                        item.bp = item.bestillingspunkt;
                    }

                    // Beregn verdier (simuler)
                    item.sales6m = itemData.sales6m || 0;
                    item.sales12m = itemData.sales12m || 0;
                    item.orderCount = itemData.orderCount || 0;
                    item.monthlyConsumption = itemData.monthlyConsumption || 0;
                    item.daysToEmpty = itemData.daysToEmpty || 999999;

                    // Restore incoming flag
                    if (item.bestAntLev > 0) {
                        item.hasIncomingOrders = true;
                    }
                }
            });
        }

        store.calculateAll();

        return store;
    }

    /**
     * Slett all data
     */
    clearAllData() {
        if (confirm('Er du sikker på at du vil slette all data? Dette kan ikke angres.')) {
            this.files = {
                master: null,
                ordersOut: null,
                sa: null,
                lagerplan: null
            };
            this.dataStore = null;
            this.processedData = [];

            localStorage.removeItem('borregaardDashboardV4');
            localStorage.removeItem('borregaardDashboardV3');

            // Nullstill file inputs og drop-status
            document.querySelectorAll('input[type="file"]').forEach(input => {
                input.value = '';
            });
            const dropStatus = document.getElementById('dropStatus');
            if (dropStatus) dropStatus.innerHTML = '';

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

console.log('Borregaard Dashboard v4.2 loaded');
console.log('Master.xlsx is used as the single source of truth');
