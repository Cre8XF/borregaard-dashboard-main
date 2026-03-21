// ===================================
// BORREGAARD DASHBOARD v4.3
// FASE 6.1: SA-nummer er primærnøkkel
// SA-Nummer.xlsx → Master.xlsx → Ordrer → Lagerplan
// ===================================

/**
 * DashboardApp - Hovedkontroller for applikasjonen
 * Koordinerer dataflyt, filopplasting og modulvisning
 *
 * FASE 6.1 ARCHITECTURE:
 *   SA-Nummer.xlsx → creates items (defines operative universe)
 *   Master.xlsx → enriches: stock, status, incoming, alternatives, kalkylpris
 *   Ordrer_Jeeves.xlsx → enriches: sales / demand analysis
 *   Analyse_Lagerplan.xlsx → enriches: BP, EOK (optional)
 */
class DashboardApp {
    constructor() {
        // Datakilder — MV2-modus (standard): Borregaard_SA_Master_v2.xlsx + Ordrer_Jeeves.xlsx
        // Fallback-modus: Master.xlsx + SA-nummer.xlsx + Ordrer_Jeeves.xlsx (FASE 6.1)
        this.files = {
            masterV2: null,         // Borregaard_SA_Master_v2.xlsx (FASE 7.0 — erstatter alle 4)
            master: null,           // Master.xlsx (REQUIRED)
            ordersOut: null,        // Ordrer_Jeeves.xlsx (REQUIRED)
            sa: null,               // SA-nummer.xlsx (REQUIRED — FASE 6.1)
            lagerplan: null,        // Analyse_Lagerplan.xlsx (OPTIONAL — BP/EOK)
            artikkelstatus: null,   // Master_Artikkelstatus.xlsx (OPTIONAL — Lagerhylla override)
            agreement: null,        // Avtalefil/katalog (OPTIONAL — inAgreement, pris, leverandør)
            replacement: null,      // data(4).xlsx (OPTIONAL — replacedByArticle, vareStatus)
            bestillinger: null      // bestillinger.xlsx — åpne innkjøpsordrer (OPTIONAL)
        };

        // Pending files from drag-and-drop (replaces DOM file inputs)
        this.pendingFiles = { masterV2: null, master: null, ordersOut: null, sa: null, lagerplan: null, artikkelstatus: null, agreement: null, replacement: null, bestillinger: null };

        // Samlet datastruktur
        this.dataStore = null;

        // FASE 8.1: varetelling-metadata fra JSON
        this.vartellingMeta = null;

        // Nåværende arbeidsmodus
        this.currentModule = 'work';

        this.init();
    }

    /**
     * Initialiser applikasjonen
     */
    init() {
        console.log('Borregaard Dashboard v4.3 initializing...');
        console.log('[FASE 6.1] SA-nummer er primærnøkkel');
        this.setupEventListeners();
        this.setupDropZone();
        this.loadStoredData();
        this.autoLoad();
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

        // Daglige verktøy-kort
        document.querySelectorAll('.daily-card[data-module]').forEach(card => {
            card.addEventListener('click', (e) => {
                const module = e.currentTarget.dataset.module;
                if (module) this.switchModule(module);
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
     * FASE 7.x (standard): 2 filer påkrevd:
     *   masterV2  → Borregaard_SA_Master_v2.xlsx
     *   ordersOut → Ordrer_Jeeves.xlsx
     *
     * FASE 6.1 (fallback): 3 filer påkrevd:
     *   sa        → SA-nummer.xlsx
     *   master    → Master.xlsx
     *   ordersOut → Ordrer_Jeeves.xlsx
     */
    async handleMultiFileDrop(files) {
        this.updateDropStatus([{ status: 'info', message: `Identifiserer ${files.length} fil(er)...` }]);

        const results = [];
        const routed = { masterV2: null, master: null, ordersOut: null, sa: null, lagerplan: null, kategori: null, artikkelstatus: null, agreement: null, replacement: null, bestillinger: null };

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

        // Store files on instance for later processing
        if (routed.masterV2) this.pendingFiles.masterV2 = routed.masterV2;
        if (routed.master) this.pendingFiles.master = routed.master;
        if (routed.ordersOut) this.pendingFiles.ordersOut = routed.ordersOut;
        if (routed.sa) this.pendingFiles.sa = routed.sa;
        if (routed.lagerplan) this.pendingFiles.lagerplan = routed.lagerplan;
        if (routed.artikkelstatus) this.pendingFiles.artikkelstatus = routed.artikkelstatus;
        if (routed.agreement) this.pendingFiles.agreement = routed.agreement;
        if (routed.replacement) this.pendingFiles.replacement = routed.replacement;
        if (routed.bestillinger) this.pendingFiles.bestillinger = routed.bestillinger;

        // Slot assignment debug log — helps diagnose "mangler" false positives
        console.log('FILE SLOTS after drop:', {
            masterV2:      this.pendingFiles.masterV2?.name      ?? '(tom)',
            master:        this.pendingFiles.master?.name        ?? '(tom)',
            ordersOut:     this.pendingFiles.ordersOut?.name     ?? '(tom)',
            sa:            this.pendingFiles.sa?.name            ?? '(tom)',
            lagerplan:     this.pendingFiles.lagerplan?.name     ?? '(tom)',
            artikkelstatus:this.pendingFiles.artikkelstatus?.name ?? '(tom)',
            agreement:     this.pendingFiles.agreement?.name     ?? '(tom)',
            replacement:   this.pendingFiles.replacement?.name   ?? '(tom)'
        });

        // Parse Kategori.xlsx if present (optional, for Reports module)
        if (routed.kategori) {
            try {
                const katFile = routed.kategori;
                const arrayBuffer = await new Promise((resolve, reject) => {
                    const reader = new FileReader();
                    reader.onload = (e) => resolve(e.target.result);
                    reader.onerror = () => reject(new Error('Read error'));
                    reader.readAsArrayBuffer(katFile);
                });
                const wb = XLSX.read(new Uint8Array(arrayBuffer), { type: 'array' });
                const ws = wb.Sheets[wb.SheetNames[0]];
                const jsonRows = XLSX.utils.sheet_to_json(ws);
                this.categoryData = jsonRows.map(row => ({
                    toolsArticleNumber: (row['Item ID'] || '').toString().trim(),
                    category1: (row['Item category 1'] || '').toString().trim(),
                    category2: (row['Item category 2'] || '').toString().trim(),
                    category3: (row['Item category 3'] || '').toString().trim(),
                    category4: (row['Item category 4'] || '').toString().trim(),
                    category5: (row['Item category 5'] || '').toString().trim(),
                    supplier: (row['Supplier'] || '').toString().trim(),
                    deliveredValue: parseFloat(row['Delivered value']) || 0,
                    deliveredQuantity: parseFloat(row['Delivered quantity']) || 0,
                    inventoryValue: parseFloat(row['Inventory Value']) || 0
                })).filter(r => r.toolsArticleNumber);
                results.push({ status: 'ok', message: `Kategori: ${katFile.name} (${this.categoryData.length} rader)` });
            } catch (e) {
                console.warn('Failed to parse Kategori.xlsx:', e);
                results.push({ status: 'error', message: 'Feil ved parsing av Kategori.xlsx' });
            }
        }

        // Add missing file warnings
        if (routed.masterV2) {
            // FASE 7.x: MV2 er lastet — vis status for MV2 + Ordrer
            results.push({ status: 'ok', message: 'Borregaard_SA_Master_v2.xlsx gjenkjent — alle lagerdata lastes fra én fil' });
            if (!routed.ordersOut) {
                results.push({ status: 'warning', message: 'Ordrer_Jeeves.xlsx mangler (påkrevd for salgshistorikk)' });
            }
            if (!routed.bestillinger) results.push({ status: 'info', message: 'bestillinger.xlsx ikke funnet (valgfri — åpne innkjøpsordrer)' });
        } else {
            // Fallback: gammel modus med separate filer
            if (!routed.master) results.push({ status: 'warning', message: 'Master.xlsx mangler (påkrevd)' });
            if (!routed.ordersOut) results.push({ status: 'warning', message: 'Ordrer_Jeeves.xlsx mangler (påkrevd)' });
            if (!routed.sa) results.push({ status: 'warning', message: 'SA-nummer.xlsx mangler (påkrevd)' });
            if (!routed.lagerplan) results.push({ status: 'info', message: 'Analyse_Lagerplan.xlsx ikke funnet (valgfri)' });
            if (!routed.agreement) results.push({ status: 'info', message: 'Avtalefil ikke funnet (valgfri)' });
            if (!routed.replacement) results.push({ status: 'info', message: 'data(4).xlsx ikke funnet (valgfri – erstatning/vareStatus)' });
        }

        this.updateDropStatus(results);

        // Auto-trigger analysis if all required files are present
        // FASE 7.0: masterV2 alene er nok
        if (routed.masterV2) {
            this.handleFileUpload();
        } else if (routed.master && routed.ordersOut && routed.sa) {
            // FASE 6.1: de 3 originale filene
            this.handleFileUpload();
        }
    }

    /**
     * Detekter filtype basert på filnavn (primært) og kolonner (fallback)
     *
     * Recognizes:
     *   master    → filename contains 'master'
     *   ordersOut → filename contains 'ordrer'
     *   sa        → filename contains 'sa-nummer', 'sa_nummer', 'sanummer', or 'data ('
     *               (also column-based: varenr + kundens artnr, or artikelnr + sa-nummer)
     *   lagerplan → filename contains 'lagerplan'
     *
     * @param {File} file
     * @returns {Promise<string|null>} 'master' | 'ordersOut' | 'sa' | 'lagerplan' | null
     */
    async detectFileType(file) {
        const name = file.name.toLowerCase();

        // Primary: filename-based detection
        // IMPORTANT rule ordering:
        //   'master_artikkelstatus' → type 'master'  (it IS the master file; Lagerhylla is
        //      read from it via MASTER_COLUMNS.location = 'Lagerhylla')
        //   A standalone 'artikkelstatus' file (no 'master' in name) → 'artikkelstatus' slot
        //      (runs as a post-master location-only override pass)
        //   Generic 'master' → type 'master'
        const filenameRules = [
            { match: 'borregaard_sa_master',  type: 'masterV2' },       // FASE 7.0 — én fil erstatter alle 4
            { match: 'kategori',              type: 'kategori' },
            { match: 'bestillinger',           type: 'bestillinger' },   // FASE 7.3 — åpne innkjøpsordrer
            { match: 'master_artikkelstatus', type: 'master' },         // IS the master file
            { match: 'artikkelstatus',        type: 'artikkelstatus' }, // standalone enrichment only
            { match: 'master',                type: 'master' },
            { match: 'ordrer',                type: 'ordersOut' },
            { match: 'sa-nummer',             type: 'sa' },
            { match: 'sa_nummer',             type: 'sa' },
            { match: 'sanummer',              type: 'sa' },
            { match: 'data (',                type: 'replacement' },    // data (4).xlsx → erstatnings-/varestatus-fil
            { match: 'analyse_lagerplan',     type: 'lagerplan' },
            { match: 'analyse-lagerplan',     type: 'lagerplan' },
            { match: 'analyselagerplan',      type: 'lagerplan' },
            { match: 'lagerplan',             type: 'lagerplan' },
            { match: 'agreement',             type: 'agreement' },      // Avtalefil/katalog
            { match: 'avtale',                type: 'agreement' },
            { match: 'katalog',               type: 'agreement' },
            { match: 'prisliste',             type: 'agreement' }
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

            // Master.xlsx: must have TotLagSaldo and Artikelstatus
            if (colSet.has('totlagsaldo') && colSet.has('artikelstatus')) {
                return 'master';
            }

            // Ordrer: Artikelnr + LevPlFtgKod or OrdRadAnt
            if (colSet.has('artikelnr') && (colSet.has('levplftgkod') || colSet.has('ordradant') || colSet.has('faktdat'))) {
                return 'ordersOut';
            }

            // Replacement / data(4).xlsx: har ErsattsAvArtNr eller VareStatus (BEFORE SA check,
            // because data(4) may also contain VareNr/Kundens artnr columns)
            const hasReplacementCol = colSet.has('ersattsavartrnr') || colSet.has('varestatus') ||
                colSet.has('alternativ(er)') || colSet.has('alternativ') ||
                [...colSet].some(c => c.includes('ersattsav') || c.includes('ersatt av') ||
                                      c === 'varestatus' || c === 'varstatus');
            if (hasReplacementCol) {
                return 'replacement';
            }

            // SA-fil: old format (Artikelnr + SA-/Kunds-column) or
            //         new data (4).xlsx format (VareNr + Kundens artnr)
            const hasSAColumn = [...colSet].some(c =>
                c.includes('sa-nummer') || c.includes('sa nummer') || c === 'sa' ||
                c.includes('sanummer') || c.includes('kunds artikkelnummer') ||
                c.includes('kunds art.nr') || c.includes('kundens artnr')
            );
            if (colSet.has('artikelnr') && hasSAColumn) {
                return 'sa';
            }
            // New format: VareNr + Kundens artnr (without Artikelnr)
            if (colSet.has('varenr') && [...colSet].some(c => c.includes('kundens artnr'))) {
                return 'sa';
            }

            // Kategori: Item ID + Item category 1
            if (colSet.has('item id') && colSet.has('item category 1')) {
                return 'kategori';
            }

            // Agreement/katalog: har Tools art.nr + Kalkylpris bas + Varugrupp
            const hasAgreementArticleCol = colSet.has('tools art.nr') || colSet.has('artikelnr');
            const hasAgreementPriceCol = colSet.has('kalkylpris bas') || colSet.has('kalkylpris');
            const hasAgreementCatCol = colSet.has('varugrupp') || colSet.has('varegruppe');
            if (hasAgreementArticleCol && (hasAgreementPriceCol || hasAgreementCatCol)) {
                // Ikke master (master har TotLagSaldo) — sjekk at det ikke er master
                if (!colSet.has('totlagsaldo') && !colSet.has('artikelstatus')) {
                    return 'agreement';
                }
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
            masterV2: 'Masterfil v2 (SA-Oversikt)',
            master: 'Master',
            ordersOut: 'Ordrer (salg ut)',
            sa: 'SA-nummer',
            lagerplan: 'Analyse Lagerplan',
            kategori: 'Kategori',
            artikkelstatus: 'Artikkelstatus (hylleinfo)',
            agreement: 'Avtale/Katalog',
            replacement: 'Erstatning/VareStatus (data(4))',
            bestillinger: 'Bestillinger (innkjøpsordrer)'
        };
        return labels[type] || type;
    }

    /**
     * Håndter filopplasting
     *
     * FASE 6.1: SA-Nummer.xlsx er nå PÅKREVD sammen med Master og Ordrer.
     */
    async handleFileUpload() {
        // Hent filer fra pending (satt av drag-and-drop)
        const masterV2File = this.pendingFiles.masterV2 || null;
        const masterFile = this.pendingFiles.master;
        const ordersOutFile = this.pendingFiles.ordersOut;
        const saFile = this.pendingFiles.sa || null;
        const lagerplanFile = this.pendingFiles.lagerplan || null;
        const artikkelstatusFile = this.pendingFiles.artikkelstatus || null;
        const agreementFile = this.pendingFiles.agreement || null;
        const replacementFile = this.pendingFiles.replacement || null;
        const bestillingerFile = this.pendingFiles.bestillinger || null;

        // FASE 7.0: masterV2 alene er nok — hopp over validering av individuelle filer
        if (!masterV2File) {
            // FASE 6.1: Valider alle 3 påkrevde filer
            const missing = [];
            if (!masterFile) missing.push('Master.xlsx');
            if (!ordersOutFile) missing.push('Ordrer_Jeeves.xlsx');
            if (!saFile) missing.push('SA-nummer.xlsx');

            if (missing.length > 0) {
                this.showStatus(`Mangler påkrevde filer: ${missing.join(', ')}`, 'error');
                return;
            }
        }

        this.showStatus('Behandler filer...', 'info');
        this.setLoadingState(true);

        try {
            // Prosesser alle filer via DataProcessor
            this.dataStore = await DataProcessor.processAllFiles({
                masterV2: masterV2File,
                master: masterFile,
                ordersOut: ordersOutFile,
                sa: saFile,
                lagerplan: lagerplanFile,
                artikkelstatus: artikkelstatusFile,
                agreement: agreementFile,
                replacement: replacementFile,
                bestillinger: bestillingerFile
            }, (status) => this.showStatus(status, 'info'));

            console.log(`[FASE 6.1] Prosessert: ${this.dataStore.items.size} SA-artikler`);

            // Oppdater UI
            this.updateSummaryCards();
            this.renderCurrentModule();
            this.saveData();

            const quality = this.dataStore.getDataQualityReport();
            this.showStatus(
                `Ferdig! ${quality.totalArticles} SA-artikler analysert. Innkommende: ${quality.withIncoming}`,
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
     * Oppdater sammendragskort
     *
     * FASE 6.1: Alle items ER SA-artikler. getActiveItems() = getAllItems().
     */
    updateSummaryCards() {
        if (!this.dataStore) return;

        const quality = this.dataStore.getDataQualityReport();
        const items = this.dataStore.getAllItems();

        // Totalt SA-artikler (operativt univers)
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

        // SA-nummer dekning (alltid 100% i FASE 6.1)
        const saEl = document.getElementById('saNumberCoverage');
        if (saEl) {
            saEl.textContent = `${quality.saNumberCoverage}%`;
        }

        // Innkommende bestillinger
        const incomingEl = document.getElementById('incomingCount');
        if (incomingEl) {
            incomingEl.textContent = quality.withIncoming.toLocaleString('nb-NO');
        }

        // Mangler lokasjon
        const manglerLokasjonEl = document.getElementById('manglerLokasjonCount');
        if (manglerLokasjonEl) {
            const manglerLokasjon = items.filter(item =>
                !item.location || item.location.trim() === ''
            ).length;
            manglerLokasjonEl.textContent = manglerLokasjon.toLocaleString('nb-NO');
        }

        // Nærmeste forventet levering (sublabel på "På vei inn"-kortet)
        const nesteLeveringEl = document.getElementById('nesteLeveringLabel');
        if (nesteLeveringEl) {
            const datoer = items
                .map(i => i.nesteForventetLevering)
                .filter(Boolean)
                .sort();
            if (datoer.length > 0) {
                const first = datoer[0];
                let datoVist = first;
                try {
                    const dt = (first instanceof Date) ? first : new Date(first);
                    if (!isNaN(dt.getTime())) {
                        datoVist = `${String(dt.getDate()).padStart(2,'0')}.${String(dt.getMonth()+1).padStart(2,'0')}.${dt.getFullYear()}`;
                    }
                } catch (e) { /* bruk rå verdi */ }
                nesteLeveringEl.textContent = `Nærmeste: ${datoVist}`;
            } else {
                nesteLeveringEl.textContent = '';
            }
        }

        // Under BP – ingen åpen ordre (ny card)
        const underBPEl = document.getElementById('underBPUtenOrdreCount');
        const underBPCard = document.getElementById('underBPCard');
        if (underBPEl) {
            const antall = items.filter(item => {
                const bp = item.bestillingspunkt ?? 0;
                const sales12m = item.sales12m ?? 0;
                const aapent = item.aapentBestiltAntall ?? 0;
                return bp > 0 && (item.stock ?? 0) < bp && aapent === 0 && sales12m > 0;
            }).length;
            underBPEl.textContent = antall.toLocaleString('nb-NO');
            if (underBPCard) {
                underBPCard.style.borderLeft = antall > 0 ? '4px solid #c62828' : '4px solid #2e7d32';
                underBPCard.style.background = antall > 0 ? '#fff5f5' : '';
            }
            const underBPValEl = document.querySelector('#underBPCard .card-value');
            if (underBPValEl) underBPValEl.style.color = antall > 0 ? '#c62828' : '#2e7d32';
        }

        // Dager til tomt < ledetid (ny card)
        const dagerTilTomtEl = document.getElementById('dagerTilTomtCount');
        const dagerTilTomtCard = document.getElementById('dagerTilTomtCard');
        if (dagerTilTomtEl) {
            const antall = items.filter(item => {
                const days = item.daysToEmpty ?? 0;
                const ledetid = (parseFloat(item.levLedTid) || 0) + (parseFloat(item.transportdagar) || 0) || (item.ledetidDager || 14);
                const sales12m = item.sales12m ?? 0;
                return days > 0 && days < 999999 && days < ledetid && sales12m > 0;
            }).length;
            dagerTilTomtEl.textContent = antall.toLocaleString('nb-NO');
            if (dagerTilTomtCard) {
                dagerTilTomtCard.style.borderLeft = antall > 0 ? '4px solid #c62828' : '4px solid #2e7d32';
                dagerTilTomtCard.style.background = antall > 0 ? '#fff5f5' : '';
            }
            const dagerValEl = document.querySelector('#dagerTilTomtCard .card-value');
            if (dagerValEl) dagerValEl.style.color = antall > 0 ? '#c62828' : '#2e7d32';
        }

        // Status-pills og dagligkort-statistikk
        const setPill = (id, val) => {
            const el = document.getElementById(id);
            if (el) el.textContent = val;
        };

        const manglerLokasjonCount = items.filter(item =>
            !item.location || item.location.trim() === ''
        ).length;

        const underBpCount = items.filter(item => {
            const bp = item.bestillingspunkt ?? 0;
            const sales12m = item.sales12m ?? 0;
            const aapent = item.aapentBestiltAntall ?? 0;
            return bp > 0 && (item.stock ?? 0) < bp && aapent === 0 && sales12m > 0;
        }).length;

        setPill('pill-kritiske',  criticalCount.toLocaleString('nb-NO'));
        setPill('pill-advarsler', warningCount.toLocaleString('nb-NO'));
        setPill('pill-lokasjon',  manglerLokasjonCount.toLocaleString('nb-NO'));
        setPill('pill-bp',        underBpCount.toLocaleString('nb-NO'));
        setPill('pill-paavei',    quality.withIncoming.toLocaleString('nb-NO'));
        setPill('pill-sadekning', quality.saNumberCoverage + '%');
        setPill('pill-totalt',    quality.totalArticles.toLocaleString('nb-NO'));

        // Dagligkort — Artikkel oppslag
        setPill('stat-artikler', quality.totalArticles.toLocaleString('nb-NO'));

        // Dagligkort — Varetelling (FASE 8.1: bruk varetelling_meta hvis tilgjengelig)
        const vtMeta = this.vartellingMeta;
        let telt2026, totaltArtikler, teltPst;
        if (vtMeta && vtMeta.omfang > 0) {
            telt2026       = vtMeta.antall_telt;
            totaltArtikler = vtMeta.omfang;
            teltPst        = vtMeta.prosent_telt;
        } else {
            telt2026 = items.filter(item => {
                const d = item.invDat ? String(item.invDat).replace(/\D/g, '') : '';
                return d.length === 8 && d >= '20260101';
            }).length;
            totaltArtikler = items.length || 1;
            teltPst        = Math.round((telt2026 / totaltArtikler) * 100);
        }
        setPill('stat-telt-pst', teltPst + '%');
        setPill('stat-telt-sub', `telt · ${telt2026} / ${totaltArtikler} artikler`);
        const bar = document.getElementById('stat-telt-bar');
        if (bar) bar.style.width = teltPst + '%';

        // Prislisteavvik (FASE 9.0) — kun synlig hvis prisliste er lastet
        const prisEl = document.getElementById('prisStatusEndringerCount');
        const prisCard = document.getElementById('prislisteavvikCard');
        if (prisEl && this.dataStore && this.dataStore.prisMap) {
            if (prisCard) prisCard.style.display = '';
            const prisEndringer = this.checkPrislisteStatusEndringer();
            prisEl.textContent = prisEndringer.length > 0 ? prisEndringer.length : '✓';
            prisEl.parentElement.classList.toggle('card-warning', prisEndringer.length > 0);
            prisEl.parentElement.classList.toggle('card-ok', prisEndringer.length === 0);
        } else if (prisCard) {
            prisCard.style.display = 'none';
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

        // Oppdater aktiv-tilstand for daglige verktøy-kort og sekundære tabs
        document.querySelectorAll('.daily-card').forEach(c => {
            c.classList.toggle('active-module', c.dataset.module === moduleName);
        });
        document.querySelectorAll('.sec-tab').forEach(t => {
            t.classList.toggle('active', t.dataset.module === moduleName);
        });

        // Nullstill artikkelOppslag-valg når brukeren navigerer bort fra modulen
        if (this.currentModule === 'artikkelOppslag' && moduleName !== 'artikkelOppslag') {
            if (typeof ArtikkelOppslagMode !== 'undefined') {
                ArtikkelOppslagMode._selectedItems.clear();
                ArtikkelOppslagMode._showLageroversikt = false;
                ArtikkelOppslagMode._lageroversiktItems = [];
            }
        }

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
                        <li><strong>SA-nummer.xlsx</strong> - Definerer det operative artikkeluniverset (påkrevd)</li>
                        <li><strong>Master.xlsx</strong> - Artikkelmasterdata: saldo, status, bestillinger, alternativer (påkrevd)</li>
                        <li><strong>Ordrer_Jeeves.xlsx</strong> - Salgsordrer ut: etterspørselsanalyse (påkrevd)</li>
                        <li><strong>Analyse_Lagerplan.xlsx</strong> - BP og EOK per artikkel (valgfri)</li>
                    </ul>
                    <p class="text-muted">Støttede formater: .xlsx, .csv</p>
                </div>
            `;
            return;
        }

        // Render basert på valgt modus
        switch (this.currentModule) {
            case 'work':
                if (typeof WorkMode !== 'undefined') {
                    contentDiv.innerHTML = WorkMode.render(this.dataStore);
                }
                break;

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

            case 'noSaArticles':
                if (typeof NoSaArticlesMode !== 'undefined') {
                    contentDiv.innerHTML = NoSaArticlesMode.render(this.dataStore);
                }
                break;

            case 'saMigration':
                if (typeof SAMigrationMode !== 'undefined') {
                    contentDiv.innerHTML = SAMigrationMode.render(this.dataStore);
                }
                break;

            case 'reports':
                if (typeof ReportsMode !== 'undefined') {
                    contentDiv.innerHTML = ReportsMode.render(this.dataStore);
                }
                break;

            case 'varetelling':
                if (typeof VartellingMode !== 'undefined') {
                    contentDiv.innerHTML = VartellingMode.render(this.dataStore);
                    VartellingMode.bindEvents();
                }
                break;

            case 'articleLookup':
                if (typeof ArticleLookupMode !== 'undefined') {
                    contentDiv.innerHTML = ArticleLookupMode.render(this.dataStore);
                }
                break;

            case 'artikkelOppslag':
                if (typeof ArtikkelOppslagMode !== 'undefined') {
                    contentDiv.innerHTML = ArtikkelOppslagMode.render(this.dataStore);
                    // Focus search input after render
                    const searchInput = document.getElementById('artikkelOppslagSearch');
                    if (searchInput) searchInput.focus();
                }
                break;

            case 'bpKontroll':
                if (typeof BPKontrollMode !== 'undefined') {
                    contentDiv.innerHTML = BPKontrollMode.render(this.dataStore);
                }
                break;

            case 'dgKontroll':
                if (typeof DGKontrollMode !== 'undefined') {
                    contentDiv.innerHTML = DGKontrollMode.render(this.dataStore);
                }
                break;

            default:
                if (typeof WorkMode !== 'undefined') {
                    contentDiv.innerHTML = WorkMode.render(this.dataStore);
                } else {
                    contentDiv.innerHTML = OverviewMode.render(this.dataStore);
                }
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

        if (loading) {
            if (uploadBtn) {
                uploadBtn.disabled = true;
                uploadBtn.textContent = 'Behandler...';
            }
        } else {
            if (uploadBtn) {
                uploadBtn.disabled = false;
                uploadBtn.textContent = 'Analyser data';
            }
        }
    }

    /**
     * Lagre data til localStorage
     *
     * FASE 6.1: Items are keyed by saNumber. No separate saMapping needed.
     */
    saveData() {
        try {
            const dataToSave = {
                version: '4.3',
                currentModule: this.currentModule,
                timestamp: new Date().toISOString(),
                items: this.dataStore ? this.dataStore.getAllItems().map(i => i.toDisplayObject()) : [],
                toolsLookup: this.dataStore ? Array.from(this.dataStore.toolsLookup.entries()) : [],
                alternativeArticles: this.dataStore && this.dataStore.alternativeArticles
                    ? Array.from(this.dataStore.alternativeArticles.entries())
                    : [],
                masterOnlyArticles: this.dataStore && this.dataStore.masterOnlyArticles
                    ? Array.from(this.dataStore.masterOnlyArticles.entries())
                    : [],
                dataQuality: this.dataStore ? this.dataStore.getDataQualityReport() : null
            };

            localStorage.setItem('borregaardDashboardV4', JSON.stringify(dataToSave));
            console.log('[FASE 6.1] Data lagret til localStorage');
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

                if (parsed.version === '4.3' && parsed.items && parsed.items.length > 0) {
                    this.dataStore = this.rebuildDataStore(parsed);
                    this.currentModule = parsed.currentModule || 'work';

                    console.log('[FASE 6.1] Lastet lagret data fra:', parsed.timestamp);

                    this.updateSummaryCards();
                    this.renderCurrentModule();
                    this.showToast('Data lastet fra forrige økt', 'success');
                } else if (parsed.version && parsed.version !== '4.3') {
                    console.log(`[FASE 6.1] Gammel versjon ${parsed.version} — krever ny opplasting`);
                }
            }
        } catch (error) {
            console.error('Kunne ikke laste fra localStorage:', error);
        }
    }

    /**
     * Gjenoppbygg dataStore fra lagrede data
     *
     * FASE 6.1: Items keyed by saNumber, created via createFromSA()
     */
    rebuildDataStore(parsed) {
        const store = new UnifiedDataStore();

        // Gjenoppbygg alternativ artikkel mapping
        if (parsed.alternativeArticles) {
            parsed.alternativeArticles.forEach(([key, value]) => {
                store.alternativeArticles.set(key, value);
            });
        }

        // Gjenoppbygg masterOnlyArticles (FASE 2.2: for alt-oppslag utenfor SA)
        if (parsed.masterOnlyArticles) {
            parsed.masterOnlyArticles.forEach(([key, value]) => {
                store.masterOnlyArticles.set(key, value);
            });
        }

        // Gjenoppbygg items (FASE 6.1: keyed by saNumber)
        if (parsed.items) {
            parsed.items.forEach(itemData => {
                if (!itemData.saNumber) return;

                const item = store.createFromSA(itemData.saNumber, itemData.toolsArticleNumber);
                if (!item) return;

                item.description = itemData.description;
                item.location = itemData.location;
                item.lagerplass = itemData.lagerplass ?? null;
                item.stock = itemData.stock || 0;
                item.reserved = itemData.reserved || 0;
                item.available = itemData.available || 0;
                item.max = itemData.max || 0;
                item.status = itemData.status;
                item.supplier = itemData.supplier;
                item.supplierArticleNumber = itemData.supplierArticleNumber || '';
                item.supplierId = itemData.supplierId || null;
                item.brand = itemData.brand || null;
                item.saType = itemData.saType || null;
                item.saGyldigFra = itemData.saGyldigFra ? new Date(itemData.saGyldigFra) : null;
                item.saGyldigTil = itemData.saGyldigTil ? new Date(itemData.saGyldigTil) : null;
                item._status = itemData._status || 'UKJENT';
                item.bestAntLev = itemData.bestAntLev || 0;
                item.bestillingsNummer = itemData.bestillingsNummer || '';
                item.ersattAvArtikel = itemData.ersattAvArtikel || '';
                item.bestillingspunkt = itemData.bestillingspunkt ?? null;
                item.ordrekvantitet = itemData.ordrekvantitet ?? null;
                item.kalkylPris = itemData.kalkylPris || 0;
                item.estimertVerdi = itemData.estimertVerdi || 0;
                // Avtalefil-felt (agreement)
                item.inAgreement = itemData.inAgreement || false;
                item.agreementPrice = itemData.agreementPrice ?? null;
                item.agreementSupplier = itemData.agreementSupplier ?? null;
                item.agreementVarugrupp = itemData.agreementVarugrupp ?? null;
                item.agreementStatus = itemData.agreementStatus ?? null;
                // Replacement file fields (data(4).xlsx)
                item.replacedByArticle = itemData.replacedByArticle || '';
                item.alternativeArticlesRaw = itemData.alternativeArticlesRaw || '';
                item.vareStatus = itemData.vareStatus || '';

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
            });
        }

        store.calculateAll();

        return store;
    }

    /**
     * Auto-last data/dashboard-data.json ved oppstart (FASE 8.0)
     *
     * Henter JSON-filen som genereres av oppdater_dashboard.py og commites til repo.
     * Lykkes → opplastingsfeltet skjules.
     * Feiler → opplastingsfeltet forblir synlig som fallback.
     */
    async autoLoad() {
        const statusEl = document.getElementById('data-status-text');
        if (statusEl) statusEl.textContent = '⏳ Laster data...';

        try {
            const res = await fetch('./data/dashboard-data.json');
            if (!res.ok) throw new Error(`HTTP ${res.status}`);

            const payload = await res.json();

            if (statusEl) {
                const ts = payload.generert || new Date().toLocaleString('nb-NO');
                statusEl.textContent = `✅ Data fra ${ts}`;
            }

            await this.processJsonData({
                master:              payload.master              || [],
                orders:              payload.orders              || [],
                bestillinger:        payload.bestillinger        || [],
                prisliste:           payload.prisliste           || [],   // FASE 9.0
                dgKontroll:          payload.dgKontroll          || {},   // FASE 9.x
                vedlikeholdsstopp:   payload.vedlikeholdsstopp   || { uke16: {}, uke42: {} },  // FASE 10.x
                lavverdiListe:       payload.lavverdiListe        || [],   // FASE 11.0
                bevegelse:           payload.bevegelse            || {},   // FASE 11.x
                varetelling_meta:    payload.varetelling_meta     || null, // FASE 8.1
                ordrestockanalys:    payload.ordrestockanalys     || [],   // FASE 9.1
            });

        } catch (err) {
            console.warn('Auto-load feilet:', err.message);
            if (statusEl) statusEl.textContent = '⚠️ Ingen data — kjør oppdater_dashboard.bat';
        }
    }

    /**
     * Prosesser JSON-data fra dashboard-data.json (FASE 8.0)
     *
     * Tilsvarer FASE 7.0-stien i DataProcessor.processAllFiles, men med
     * JSON-arrays i stedet for File-objekter. Mater data inn i eksisterende
     * DataProcessor-pipeline via de statiske metodene direkte.
     *
     * @param {Object} param0 - { master, orders, bestillinger } — arrays av objekter
     */
    async processJsonData({ master, orders, bestillinger, prisliste, dgKontroll, vedlikeholdsstopp, lavverdiListe, bevegelse, varetelling_meta, ordrestockanalys }) {
        if (!master || master.length === 0) {
            throw new Error('master-arrayen er tom — ingen artikler å prosessere.');
        }

        const store = new UnifiedDataStore();

        // Master (SA-Oversikt fra MV2) — oppretter og beriker alle SA-items
        DataProcessor.processMasterV2File(master, store);

        // Ordrer_Jeeves — beriker items med salgshistorikk og avdelingsdata
        if (orders && orders.length > 0) {
            DataProcessor.processOrdersOutData(orders, store);
            store.jeevesMap = DataProcessor.buildJeevesMap(orders);
        }

        // Bestillinger — åpne innkjøpsordrer
        if (bestillinger && bestillinger.length > 0) {
            DataProcessor.processBestillingerData(bestillinger, store);
        }

        store.calculateAll();

        // FASE 9.0: Bygg prisMap og berik alle items med prisdata
        if (prisliste && prisliste.length > 0) {
            store.prisMap = DataProcessor.buildPrisMap(prisliste);

            store.getAllItems().forEach(item => {
                const pris = store.prisMap[item.toolsArticleNumber];
                if (pris) {
                    item.avtalepris     = pris.avtalepris;
                    item.listpris       = pris.listpris;
                    item.prisKalkyl     = pris.kalkylpris;
                    item.nyDG           = pris.nyDG;
                    item.prisStatus     = pris.status;
                    item.prisAnbefaling = pris.anbefaling;
                    item.iInPrisliste   = true;
                }
            });

            // Beregn prisavvik på nytt etter beriking
            store.getAllItems().forEach(item => item.calculate());

            console.log(`[FASE 9.0] Prisdata beriket for ${Object.keys(store.prisMap).length} artikler`);
        }

        // FASE 9.1: Bygg stocksMap fra Ordrestockanalys
        if (ordrestockanalys && ordrestockanalys.length > 0) {
            store.stocksMap = DataProcessor.buildStocksMap(ordrestockanalys);

            // Berik items med DG% og åpne ordrer
            store.getAllItems().forEach(item => {
                const stocks = store.stocksMap.get(item.toolsArticleNumber);
                if (stocks) {
                    item.dgPctAvg       = stocks.dgPctAvg;
                    item.dgValueTotal   = stocks.dgValueTotal;
                    item.openOrderCount = stocks.openOrders.length;
                    item.openOrderValue = Math.round(stocks.openOrders.reduce((s, o) => s + (o.value || 0), 0));
                }
            });

            console.log(`[FASE 9.1] Ordrestockanalys beriket ${store.stocksMap.size} artikler med DG% og åpne ordrer`);
        } else {
            store.stocksMap = new Map();
        }

        // FASE 9.x: DG-kontroll data
        // FASE 10.x: Vedlikeholdsstopp historikkdata
        const vs = vedlikeholdsstopp || { uke16: {}, uke42: {} };
        store.dashboardData = {
            dgKontroll:        dgKontroll || {},
            vedlikeholdsstopp: vs,
            lavverdiListe:     lavverdiListe || [],
            bevegelse:         bevegelse      || {},
        };
        if (dgKontroll && Object.keys(dgKontroll).length > 0) {
            console.log(`[FASE 9.x] DG-kontroll lastet: ${Object.keys(dgKontroll).length} artikler`);
        }
        const vs16 = Object.keys(vs.uke16 || {}).length;
        const vs42 = Object.keys(vs.uke42 || {}).length;
        if (vs16 > 0 || vs42 > 0) {
            console.log(`[FASE 10.x] Vedlikeholdsstopp historikk: uke16=${vs16} artikler, uke42=${vs42} artikler`);
        }

        this.dataStore = store;

        // FASE 8.1: lagre varetelling-metadata for bruk i varetelling.js
        if (varetelling_meta) {
            this.vartellingMeta = varetelling_meta;
        }

        this.updateSummaryCards();
        this.renderCurrentModule();
        this.saveData();

        const quality = store.getDataQualityReport();
        console.log(`[FASE 8.0] JSON-data prosessert: ${quality.totalArticles} SA-artikler`);
    }

    /**
     * Sjekk om noen artikler har endret VareStatus siden prislisten ble satt opp.
     * Flagg artikler der VareStatus er Planned Discontinued/Discontinued
     * men prisAnbefaling sier "OK — aktiv vare".
     * FASE 9.0
     */
    checkPrislisteStatusEndringer() {
        if (!this.dataStore || !this.dataStore.prisMap) return [];

        const endringer = [];
        this.dataStore.getAllItems().forEach(item => {
            if (!item.iInPrisliste) return;

            const erAktivIPrisliste = item.prisAnbefaling.startsWith('OK —');
            const erUtgaaende = ['Planned Discontinued', 'Discontinued'].includes(item.vareStatus);

            if (erAktivIPrisliste && erUtgaaende) {
                endringer.push({
                    toolsNr:     item.toolsArticleNumber,
                    saNummer:    item.saNumber,
                    beskrivelse: item.description,
                    vareStatus:  item.vareStatus,
                    anbefaling:  item.prisAnbefaling,
                });
            }
        });

        return endringer;
    }

    /**
     * Nullstill data — kalt fra statusbar-knappen (FASE 11.0)
     */
    nullstillData() {
        this.clearAllData();
    }

    /**
     * Slett all data
     */
    clearAllData() {
        if (confirm('Er du sikker på at du vil slette all data? Dette kan ikke angres.')) {
            this.files = {
                masterV2: null,
                master: null,
                ordersOut: null,
                sa: null,
                lagerplan: null,
                artikkelstatus: null,
                agreement: null,
                replacement: null,
                bestillinger: null
            };
            this.dataStore = null;

            localStorage.removeItem('borregaardDashboardV4');
            localStorage.removeItem('borregaardDashboardV3');

            // Nullstill pending files og statusbar
            this.pendingFiles = { masterV2: null, master: null, ordersOut: null, sa: null, lagerplan: null, artikkelstatus: null, agreement: null, replacement: null, bestillinger: null };
            const statusText = document.getElementById('data-status-text');
            if (statusText) statusText.textContent = '⚠️ Ingen data — kjør oppdater_dashboard.bat';

            // Nullstill sammendragskort
            ['totalItems', 'criticalCount', 'warningCount', 'saNumberCoverage', 'incomingCount',
             'manglerLokasjonCount', 'underBPUtenOrdreCount', 'dagerTilTomtCount', 'prisStatusEndringerCount']
                .forEach(id => {
                    const el = document.getElementById(id);
                    if (el) el.textContent = '-';
                });
            const prisCard = document.getElementById('prislisteavvikCard');
            if (prisCard) prisCard.style.display = 'none';
            const nesteLeveringEl = document.getElementById('nesteLeveringLabel');
            if (nesteLeveringEl) nesteLeveringEl.textContent = '';
            ['underBPCard', 'dagerTilTomtCard'].forEach(id => {
                const card = document.getElementById(id);
                if (card) { card.style.borderLeft = ''; card.style.background = ''; }
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

/**
 * Naviger til en modul fra sammendragskort.
 * Bruker data-module-attributter fra tab-navigasjonen.
 */
function navigateToModule(moduleId, options = {}) {
    const moduleMap = {
        'arbeid':          'work',
        'rapporter':       'reports',
        'varetelling':     'varetelling',
        'bp-kontroll':     'bpKontroll',
        'artikkeloppslag': 'artikkelOppslag',
        'dg-kontroll':     'dgKontroll',
    };

    const actualModule = moduleMap[moduleId] || moduleId;

    if (options.filter) {
        sessionStorage.setItem(`filter_${actualModule}`, options.filter);
    }

    if (window.app) {
        window.app.switchModule(actualModule);
    }

    setTimeout(() => {
        const moduleEl = document.querySelector('#moduleContent');
        if (moduleEl) moduleEl.scrollIntoView({ behavior: 'smooth' });
    }, 100);
}

console.log('Borregaard Dashboard v4.3 loaded');
console.log('[FASE 6.1] SA-nummer er primærnøkkel');
