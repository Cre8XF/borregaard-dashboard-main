// ===================================
// MODUS: ARBEID – OPERATIV KONTROLLSENTRAL
// Prioritert arbeidsliste + detaljvisning
// SA-migrering, Lager uten SA, Utgående, Død lager
// ===================================

class WorkMode {
    static dataStore = null;
    static currentSubTab = 'saMigration';

    // Detail sub-tab state
    static searchTerm = '';
    static sortColumn = null;
    static sortDirection = 'desc';

    // Priority queue state
    static priorityQueue = [];
    static activeFilters = new Set(); // 'high' | 'exposure' | 'stock' | 'noSa'
    static pqSearch = '';
    static archiveExpanded = false;

    // ════════════════════════════════════════════════════
    //  MAIN RENDER
    // ════════════════════════════════════════════════════

    static render(store) {
        this.dataStore = store;
        const stats = this.computeStats(store);
        this.priorityQueue = this.buildPriorityQueue(store);

        return `
            <div class="module-header">
                <h2>Operativ kontrollsentral</h2>
                <p class="module-description">Prioritert arbeidsliste med samlet oversikt over SA-migrering, utgående, lager uten SA og død lager</p>
            </div>

            ${this.renderOperativStatus(stats)}

            <div id="prioritySection">
                ${this.renderPriorityContent()}
            </div>

            <div id="maintenanceStopSection">
                ${this.renderMaintenanceStopSection(store)}
            </div>

            <div style="margin-top:28px;border-top:2px solid #e0e0e0;padding-top:20px;">
                <h3 style="margin:0 0 12px 0;font-size:15px;color:#555;">Detaljvisning</h3>
                <div class="view-tabs" style="margin-bottom:0;">
                    <button class="view-tab ${this.currentSubTab === 'saMigration' ? 'active' : ''}"
                            onclick="WorkMode.switchSubTab('saMigration')">
                        SA-migrering (${stats.saMigrationHigh})
                    </button>
                    <button class="view-tab ${this.currentSubTab === 'noSa' ? 'active' : ''}"
                            onclick="WorkMode.switchSubTab('noSa')">
                        Uten SA (${stats.noSaDriftsrelevante} aktive / ${stats.noSaArkivkandidater} arkiv)
                    </button>
                    <button class="view-tab ${this.currentSubTab === 'outgoing' ? 'active' : ''}"
                            onclick="WorkMode.switchSubTab('outgoing')">
                        Utgående (${stats.discWithStock})
                    </button>
                    <button class="view-tab ${this.currentSubTab === 'deadStock' ? 'active' : ''}"
                            onclick="WorkMode.switchSubTab('deadStock')">
                        Død lager (${stats.deadStockCount})
                    </button>
                </div>
                <div id="workSubContent">
                    ${this.renderSubTab(store)}
                </div>
            </div>
        `;
    }

    // ════════════════════════════════════════════════════
    //  STATS COMPUTATION
    // ════════════════════════════════════════════════════

    static computeStats(store) {
        const items = store.getAllItems();
        let saMigrationHigh = 0;
        let discWithExposure = 0;
        let discExposureValueKr = 0;
        let discWithStock = 0;
        let discStockValueKr = 0;
        let deadStockCount = 0;
        let deadStockValueKr = 0;

        items.forEach(item => {
            const isDisc = this.isDiscontinued(item);
            const stock = item.stock || 0;
            const bestAntLev = item.bestAntLev || 0;
            const exposure = stock + bestAntLev;
            const sales12m = item.sales12m || 0;
            const kalkylPris = item.kalkylPris || 0;

            // SA-migration HIGH
            if (isDisc) {
                const replNr = (item.ersattAvArtikel || '').trim();
                if (replNr && replNr !== item.toolsArticleNumber && item.saNumber) {
                    const replItem = store.getByToolsArticleNumber(replNr);
                    const replSa = replItem ? replItem.saNumber : '';
                    if (!replSa) {
                        const hasSales3m = this.hasRecentSales(item);
                        if (stock > 0 || hasSales3m) saMigrationHigh++;
                    }
                }
            }

            if (isDisc && exposure > 0) {
                discWithExposure++;
                discExposureValueKr += exposure * kalkylPris;
            }

            if (isDisc && stock > 0) {
                discWithStock++;
                discStockValueKr += stock * kalkylPris;
            }

            if (stock > 0 && sales12m === 0) {
                deadStockCount++;
                deadStockValueKr += stock * kalkylPris;
            }
        });

        const noSaData = store.getArticlesWithoutSA();
        const noSaWithStock = noSaData.withStock ? noSaData.withStock.length : 0;

        // Driftsrelevante vs Arkivkandidater (all masterOnlyArticles)
        let noSaDriftsrelevante = 0;
        let noSaArkivkandidater = 0;
        let noSaDriftsVerdiKr = 0;
        if (store.masterOnlyArticles) {
            store.masterOnlyArticles.forEach(data => {
                const s = data.stock || 0;
                const b = data.bestAntLev || 0;
                if (s > 0 || b > 0) {
                    noSaDriftsrelevante++;
                    noSaDriftsVerdiKr += s * (data.kalkylPris || 0);
                } else {
                    noSaArkivkandidater++;
                }
            });
        }

        return {
            saMigrationHigh,
            discWithExposure,
            discExposureValueKr: Math.round(discExposureValueKr),
            discWithStock,
            discStockValueKr: Math.round(discStockValueKr),
            noSaWithStock,
            noSaDriftsrelevante,
            noSaArkivkandidater,
            noSaDriftsVerdiKr: Math.round(noSaDriftsVerdiKr),
            deadStockCount,
            deadStockValueKr: Math.round(deadStockValueKr)
        };
    }

    // ════════════════════════════════════════════════════
    //  PRIORITY QUEUE
    // ════════════════════════════════════════════════════

    static buildPriorityQueue(store) {
        const items = store.getAllItems();
        const queue = new Map();

        items.forEach(item => {
            const toolsNr = item.toolsArticleNumber;
            const stock = item.stock || 0;
            const bestAntLev = item.bestAntLev || 0;
            const exposure = stock + bestAntLev;
            const sales12m = item.sales12m || 0;
            const sales3m = this.getSales3m(item);
            const kalkylPris = item.kalkylPris || 0;
            const exposureKr = exposure * kalkylPris;
            const isDisc = this.isDiscontinued(item);

            let score = 0;
            let type = '';
            let problem = '';
            let recommendation = '';

            // Score 100: SA-migrering HIGH
            if (isDisc) {
                const replNr = (item.ersattAvArtikel || '').trim();
                if (replNr && replNr !== toolsNr && item.saNumber) {
                    const replItem = store.getByToolsArticleNumber(replNr);
                    const replSa = replItem ? replItem.saNumber : '';
                    if (!replSa && (stock > 0 || sales3m > 0)) {
                        score = 100;
                        type = 'SA-migrering';
                        problem = 'Erstatning mangler SA-nummer';
                        if (exposure > 0 && sales3m > 0) recommendation = 'Flytt SA nå (selger + lager)';
                        else if (exposure > 0) recommendation = 'Flytt SA \u2013 tøm lager';
                        else recommendation = 'Flytt SA (aktiv vare)';
                    }
                }
            }

            // Score 80: Utgående med eksponering
            if (score < 80 && isDisc && exposure > 0) {
                score = 80;
                type = 'Utgående';
                problem = 'Utgående med eksponering';
                recommendation = sales3m > 0 ? 'Styr etterspørsel + tøm lager' : 'Overfør eller avhend lager';
            }

            // Score 60: Utgående med lager (fallback)
            if (score < 60 && isDisc && stock > 0) {
                score = 60;
                type = 'Utgående';
                problem = 'Utgående med lagersaldo';
                recommendation = 'Tøm eller overfør lager';
            }

            // Score 20: Død lager
            if (score < 20 && stock > 0 && sales12m === 0) {
                score = 20;
                type = 'Død lager';
                problem = 'Lager uten salg siste 12 mnd';
                recommendation = exposureKr > 1000 ? 'Vurder kampanje / avhending' : 'Vurder utfasing';
            }

            if (score > 0) {
                queue.set(toolsNr, {
                    toolsNr,
                    saNumber: item.saNumber || '',
                    stock,
                    exposure,
                    exposureKr: Math.round(exposureKr),
                    sales3m,
                    score,
                    type,
                    problem,
                    recommendation,
                    hasSa: !!item.saNumber
                });
            }
        });

        // Score 40: Lager uten SA — from masterOnlyArticles
        if (store.masterOnlyArticles) {
            store.masterOnlyArticles.forEach((data, toolsNr) => {
                const stock = data.stock || 0;
                if (stock <= 0) return;
                if (queue.has(toolsNr) && queue.get(toolsNr).score >= 40) return;

                const kalkylPris = data.kalkylPris || 0;
                queue.set(toolsNr, {
                    toolsNr,
                    saNumber: '',
                    stock,
                    exposure: stock,
                    exposureKr: Math.round(stock * kalkylPris),
                    sales3m: 0,
                    score: 40,
                    type: 'Lager uten SA',
                    problem: 'Fysisk lager uten SA-nummer',
                    recommendation: 'Opprett SA eller avhend',
                    hasSa: false
                });
            });
        }

        // Sort: score DESC, exposure DESC, sales3m DESC
        return Array.from(queue.values()).sort((a, b) =>
            b.score - a.score || b.exposure - a.exposure || b.sales3m - a.sales3m
        );
    }

    static getFilteredQueue() {
        let queue = this.priorityQueue;

        if (this.activeFilters.has('high')) {
            queue = queue.filter(r => r.score >= 80);
        }
        if (this.activeFilters.has('exposure')) {
            queue = queue.filter(r => r.exposure > 0);
        }
        if (this.activeFilters.has('stock')) {
            queue = queue.filter(r => r.stock > 0);
        }
        if (this.activeFilters.has('noSa')) {
            queue = queue.filter(r => !r.hasSa);
        }

        if (this.pqSearch) {
            const term = this.pqSearch.toLowerCase();
            queue = queue.filter(r =>
                r.toolsNr.toLowerCase().includes(term) ||
                r.type.toLowerCase().includes(term) ||
                r.problem.toLowerCase().includes(term)
            );
        }

        return queue;
    }

    // ════════════════════════════════════════════════════
    //  RENDER: OPERATIV STATUS (3 blocks)
    // ════════════════════════════════════════════════════

    static renderOperativStatus(stats) {
        const blockStyle = 'border-radius:8px;padding:16px;';
        const rowStyle = 'display:flex;justify-content:space-between;align-items:center;padding:4px 0;font-size:13px;';
        const valStyle = 'font-weight:700;font-size:14px;';

        return `
        <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:16px;margin-bottom:24px;">
            <div style="${blockStyle}background:#fdf4f4;border:1px solid #ffcdd2;">
                <h4 style="margin:0 0 10px 0;font-size:13px;font-weight:700;color:#c62828;text-transform:uppercase;letter-spacing:0.5px;">Kritisk</h4>
                <div style="${rowStyle}"><span>SA-migrering HØY</span><span style="${valStyle}color:#c62828;">${stats.saMigrationHigh} stk</span></div>
                <div style="${rowStyle}"><span>Utgående m/eksponering</span><span style="${valStyle}color:#c62828;">${stats.discWithExposure} stk</span></div>
                <div style="${rowStyle}border-top:1px solid #ffcdd2;padding-top:8px;margin-top:4px;"><span>Eksponert verdi</span><span style="${valStyle}color:#c62828;">${this.fmtKr(stats.discExposureValueKr)}</span></div>
            </div>
            <div style="${blockStyle}background:#fff8e1;border:1px solid #ffe082;">
                <h4 style="margin:0 0 10px 0;font-size:13px;font-weight:700;color:#e65100;text-transform:uppercase;letter-spacing:0.5px;">Risiko</h4>
                <div style="${rowStyle}"><span>Utgående med lager</span><span style="${valStyle}color:#e65100;">${stats.discWithStock} stk</span></div>
                <div style="${rowStyle}"><span>Driftsrel. uten SA</span><span style="${valStyle}color:#e65100;">${stats.noSaDriftsrelevante} stk</span></div>
                <div style="${rowStyle}border-top:1px solid #ffe082;padding-top:8px;margin-top:4px;"><span>Kapital i utgående</span><span style="${valStyle}color:#e65100;">${this.fmtKr(stats.discStockValueKr)}</span></div>
            </div>
            <div style="${blockStyle}background:#f5f5f5;border:1px solid #e0e0e0;">
                <h4 style="margin:0 0 10px 0;font-size:13px;font-weight:700;color:#616161;text-transform:uppercase;letter-spacing:0.5px;">Opprydding</h4>
                <div style="${rowStyle}"><span>Død lager</span><span style="${valStyle}color:#616161;">${stats.deadStockCount} stk</span></div>
                <div style="${rowStyle}"><span>Arkivkandidater</span><span style="${valStyle}color:#616161;">${stats.noSaArkivkandidater} stk</span></div>
                <div style="${rowStyle}border-top:1px solid #e0e0e0;padding-top:8px;margin-top:4px;"><span>Kapital i dødt lager</span><span style="${valStyle}color:#616161;">${this.fmtKr(stats.deadStockValueKr)}</span></div>
            </div>
        </div>
        `;
    }

    // ════════════════════════════════════════════════════
    //  RENDER: PRIORITY SECTION (re-renderable)
    // ════════════════════════════════════════════════════

    static renderPriorityContent() {
        const filtered = this.getFilteredQueue();
        const totalExposureKr = filtered.reduce((s, r) => s + r.exposureKr, 0);
        const showing = Math.min(filtered.length, 30);
        const isActive = (name) => this.activeFilters.has(name);
        const btnBase = 'display:inline-block;padding:5px 12px;border-radius:4px;font-size:12px;cursor:pointer;border:1px solid;margin-right:6px;';
        const btnOn = 'background:#1565c0;color:#fff;border-color:#1565c0;font-weight:600;';
        const btnOff = 'background:#fff;color:#555;border-color:#bdbdbd;';

        return `
            <div style="margin-bottom:16px;">
                <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;margin-bottom:12px;">
                    <h3 style="margin:0;font-size:16px;">Prioritert arbeidsliste</h3>
                    <div style="background:#e3f2fd;padding:6px 14px;border-radius:4px;font-size:13px;font-weight:600;color:#1565c0;">
                        Totalt eksponert i arbeidskø: ${this.fmtKr(totalExposureKr)}
                    </div>
                </div>

                <div style="display:flex;align-items:center;flex-wrap:wrap;gap:8px;margin-bottom:12px;">
                    <span onclick="WorkMode.toggleFilter('high')" style="${btnBase}${isActive('high') ? btnOn : btnOff}">Kun HØY</span>
                    <span onclick="WorkMode.toggleFilter('exposure')" style="${btnBase}${isActive('exposure') ? btnOn : btnOff}">Kun eksponering &gt; 0</span>
                    <span onclick="WorkMode.toggleFilter('stock')" style="${btnBase}${isActive('stock') ? btnOn : btnOff}">Kun lager &gt; 0</span>
                    <span onclick="WorkMode.toggleFilter('noSa')" style="${btnBase}${isActive('noSa') ? btnOn : btnOff}">Kun SA mangler</span>
                    <input type="text" class="search-input" placeholder="Søk i arbeidsliste..."
                           value="${this.esc(this.pqSearch)}"
                           onkeyup="WorkMode.handlePqSearch(this.value)"
                           style="margin-left:auto;max-width:200px;font-size:12px;padding:5px 10px;">
                </div>

                ${filtered.length === 0
                    ? '<div class="alert alert-info" style="font-size:13px;">Ingen elementer i arbeidskø med valgte filtre.</div>'
                    : `
                    <div class="table-wrapper">
                        <table class="data-table compact" style="font-size:12px;">
                            <thead>
                                <tr>
                                    <th>Prioritet</th>
                                    <th>Type</th>
                                    <th>Tools nr</th>
                                    <th>Lager (stk)</th>
                                    <th>Eksponering (kr)</th>
                                    <th>Salg 3m (kr)</th>
                                    <th>Problem</th>
                                    <th>Anbefalt handling</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${filtered.slice(0, 30).map(r => `
                                    <tr class="${r.score >= 80 ? 'row-critical' : r.score >= 40 ? 'row-warning' : ''}">
                                        <td>${this.priorityBadge(r.score)}</td>
                                        <td style="white-space:nowrap;">${this.esc(r.type)}</td>
                                        <td><strong>${this.esc(r.toolsNr)}</strong></td>
                                        <td class="qty-cell">${this.fmt(r.stock)}</td>
                                        <td class="qty-cell">${this.fmtKr(r.exposureKr)}</td>
                                        <td class="qty-cell">${this.fmtKr(r.sales3m)}</td>
                                        <td style="font-size:11px;">${this.esc(r.problem)}</td>
                                        <td style="font-size:11px;font-weight:600;">${this.esc(r.recommendation)}</td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    </div>
                    <div class="table-footer">
                        <p class="text-muted">Viser ${showing} av ${filtered.length} elementer${this.activeFilters.size > 0 ? ' (filtrert)' : ''}</p>
                    </div>
                    `}
            </div>
        `;
    }

    // ════════════════════════════════════════════════════
    //  SUB-TAB ROUTING (detail views)
    // ════════════════════════════════════════════════════

    static renderSubTab(store) {
        switch (this.currentSubTab) {
            case 'saMigration':
                if (typeof SAMigrationMode !== 'undefined') {
                    return SAMigrationMode.render(store);
                }
                return '<p>SAMigrationMode er ikke lastet.</p>';

            case 'noSa':
                return this.renderNoSaTab(store);

            case 'outgoing':
                return this.renderOutgoingTab(store);

            case 'deadStock':
                return this.renderDeadStockTab(store);

            default:
                return '';
        }
    }

    // ════════════════════════════════════════════════════
    //  SUB-TAB: Lager uten SA
    // ════════════════════════════════════════════════════

    static renderNoSaTab(store) {
        // Build items directly from masterOnlyArticles
        const allItems = [];
        if (store.masterOnlyArticles) {
            store.masterOnlyArticles.forEach((data, toolsNr) => {
                const stock = data.stock || 0;
                const bestAntLev = data.bestAntLev || 0;
                const kalkylPris = data.kalkylPris || 0;
                allItems.push({
                    toolsNr,
                    description: data.description || '',
                    stock,
                    bestAntLev,
                    bestillingspunkt: 0, // BP only available for SA-articles via Analyse_Lagerplan
                    estimertVerdi: stock > 0 ? Math.round(stock * kalkylPris) : 0,
                    supplier: data.supplier || '',
                    _status: data._status || 'UKJENT',
                    brand: data.brand || '',
                    supplierId: data.supplierId || ''
                });
            });
        }

        // Split: Driftsrelevante vs Arkivkandidater
        const operational = allItems.filter(i => i.stock > 0 || i.bestAntLev > 0 || i.bestillingspunkt > 0);
        const archive = allItems.filter(i => i.stock === 0 && i.bestAntLev === 0 && i.bestillingspunkt === 0);

        // Apply search
        let filteredOps = operational;
        let filteredArc = archive;
        if (this.searchTerm) {
            const term = this.searchTerm.toLowerCase();
            const searchFn = r =>
                r.toolsNr.toLowerCase().includes(term) ||
                r.description.toLowerCase().includes(term) ||
                r.supplier.toLowerCase().includes(term);
            filteredOps = filteredOps.filter(searchFn);
            filteredArc = filteredArc.filter(searchFn);
        }

        // Sort
        filteredOps = this.applySortToRows(filteredOps, 'stock', [
            (a, b) => b.stock - a.stock,
            (a, b) => b.bestAntLev - a.bestAntLev
        ]);
        filteredArc = this.applySortToRows(filteredArc, 'toolsNr', [
            (a, b) => a.toolsNr.localeCompare(b.toolsNr, 'nb-NO')
        ]);

        const totalDriftsVerdi = operational.reduce((s, i) => s + i.estimertVerdi, 0);

        // ── Summary cards ──
        const summaryHtml = `
            <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:12px;margin:12px 0;">
                <div style="padding:14px;background:#e8f5e9;border-radius:6px;border:1px solid #c8e6c9;">
                    <div style="font-size:24px;font-weight:700;color:#2e7d32;">${operational.length}</div>
                    <div style="font-size:13px;font-weight:600;color:#2e7d32;">Driftsrelevante uten SA</div>
                    <div style="font-size:11px;color:#558b2f;margin-top:4px;">Bundet kapital: ${this.fmtKr(totalDriftsVerdi)}</div>
                </div>
                <div style="padding:14px;background:#fafafa;border-radius:6px;border:1px solid #e0e0e0;">
                    <div style="font-size:24px;font-weight:700;color:#9e9e9e;">${archive.length}</div>
                    <div style="font-size:13px;font-weight:600;color:#757575;">Arkivkandidater</div>
                    <div style="font-size:11px;color:#9e9e9e;margin-top:4px;">Ingen kapitalbinding</div>
                </div>
            </div>
        `;

        // ── Search ──
        const searchHtml = `
            <div class="module-controls" style="margin-top:8px;">
                <div class="search-group">
                    <input type="text" class="search-input" placeholder="Søk artikkel..."
                           value="${this.searchTerm}"
                           onkeyup="WorkMode.handleSearch(this.value)">
                </div>
            </div>
        `;

        // ── Section A: Driftsrelevante ──
        let sectionA;
        if (filteredOps.length === 0) {
            sectionA = '<div class="alert alert-info" style="font-size:13px;">Ingen driftsrelevante artikler uten SA funnet.</div>';
        } else {
            sectionA = `
                <h4 style="margin:16px 0 8px 0;font-size:14px;color:#2e7d32;">Driftsrelevante uten SA</h4>
                <div class="table-wrapper">
                    <table class="data-table compact">
                        <thead>
                            <tr>
                                ${this.th('Tools nr', 'toolsNr')}
                                ${this.th('Beskrivelse', 'description')}
                                ${this.th('Lager (stk)', 'stock')}
                                ${this.th('Innkommende (stk)', 'bestAntLev')}
                                ${this.th('BP', 'bestillingspunkt')}
                                ${this.th('Est. verdi', 'estimertVerdi')}
                                ${this.th('Leverandør', 'supplier')}
                                <th>Prioritet</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${filteredOps.map(r => `
                                <tr>
                                    <td><strong>${this.esc(r.toolsNr)}</strong></td>
                                    <td style="max-width:220px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${this.esc(r.description)}</td>
                                    <td class="qty-cell">${this.fmt(r.stock)}</td>
                                    <td class="qty-cell">${r.bestAntLev > 0 ? this.fmt(r.bestAntLev) : '-'}</td>
                                    <td class="qty-cell">${r.bestillingspunkt > 0 ? this.fmt(r.bestillingspunkt) : '-'}</td>
                                    <td class="qty-cell">${r.estimertVerdi > 0 ? this.fmtKr(r.estimertVerdi) : '-'}</td>
                                    <td>${this.esc(r.supplier)}</td>
                                    <td>${this.noSaBadges(r)}</td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
                <div class="table-footer"><p class="text-muted">Viser ${filteredOps.length} driftsrelevante artikler</p></div>
            `;
        }

        // ── Section B: Arkivkandidater (collapsed by default) ──
        const arcLimit = 100;
        const arcDisplay = this.archiveExpanded ? filteredArc.slice(0, arcLimit) : [];
        const sectionB = `
            <div style="margin-top:20px;border-top:1px solid #e0e0e0;padding-top:12px;">
                <div style="display:flex;align-items:center;justify-content:space-between;cursor:pointer;"
                     onclick="WorkMode.toggleArchive()">
                    <h4 style="margin:0;font-size:14px;color:#757575;">
                        ${this.archiveExpanded ? '&#9660;' : '&#9654;'} Arkivkandidater (${archive.length})
                    </h4>
                    <span style="font-size:12px;color:#9e9e9e;">${this.archiveExpanded ? 'Skjul' : 'Vis'}</span>
                </div>
                ${this.archiveExpanded ? `
                    <p style="font-size:12px;color:#9e9e9e;margin:8px 0;">Artikler uten lager, innkommende og bestillingspunkt. Kandidater for opprydding i Master.</p>
                    ${filteredArc.length === 0
                        ? '<div class="alert alert-info" style="font-size:13px;">Ingen arkivkandidater funnet med valgt søk.</div>'
                        : `
                        <div class="table-wrapper">
                            <table class="data-table compact" style="font-size:12px;">
                                <thead>
                                    <tr>
                                        ${this.th('Tools nr', 'toolsNr')}
                                        ${this.th('Beskrivelse', 'description')}
                                        ${this.th('Lager (stk)', 'stock')}
                                        ${this.th('Innkommende (stk)', 'bestAntLev')}
                                        ${this.th('BP', 'bestillingspunkt')}
                                        ${this.th('Status', '_status')}
                                        ${this.th('Leverandør', 'supplier')}
                                    </tr>
                                </thead>
                                <tbody>
                                    ${arcDisplay.map(r => `
                                        <tr>
                                            <td>${this.esc(r.toolsNr)}</td>
                                            <td style="max-width:220px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${this.esc(r.description)}</td>
                                            <td class="qty-cell">0</td>
                                            <td class="qty-cell">0</td>
                                            <td class="qty-cell">-</td>
                                            <td>${this.statusBadge(r._status)}</td>
                                            <td>${this.esc(r.supplier)}</td>
                                        </tr>
                                    `).join('')}
                                </tbody>
                            </table>
                        </div>
                        ${filteredArc.length > arcLimit
                            ? `<div class="table-footer"><p class="text-muted">Viser ${arcLimit} av ${filteredArc.length} arkivkandidater</p></div>`
                            : `<div class="table-footer"><p class="text-muted">Viser ${arcDisplay.length} arkivkandidater</p></div>`}
                        `}
                ` : ''}
            </div>
        `;

        return summaryHtml + searchHtml + sectionA + sectionB;
    }

    // ════════════════════════════════════════════════════
    //  SUB-TAB: Utgående
    // ════════════════════════════════════════════════════

    static renderOutgoingTab(store) {
        const items = store.getAllItems();
        let rows = [];

        items.forEach(item => {
            if (!this.isDiscontinued(item)) return;

            const stock = item.stock || 0;
            const bestAntLev = item.bestAntLev || 0;
            const replacementNr = (item.ersattAvArtikel || '').trim();
            let replacementStock = 0;

            if (replacementNr && replacementNr !== item.toolsArticleNumber) {
                const replItem = store.getByToolsArticleNumber(replacementNr);
                if (replItem) replacementStock = replItem.stock || 0;
                else {
                    const masterData = store.masterOnlyArticles.get(replacementNr);
                    if (masterData) replacementStock = masterData.stock || 0;
                }
            }

            const sales12m = item.sales12m || 0;
            const sales3m = this.getSales3m(item);

            const urgency = (stock > 0 || sales3m > 0) ? 'HIGH' :
                            sales12m > 0 ? 'MEDIUM' : 'LOW';
            const urgencySort = urgency === 'HIGH' ? 3 : urgency === 'MEDIUM' ? 2 : 1;

            rows.push({
                toolsNr: item.toolsArticleNumber,
                saNumber: item.saNumber || '',
                stock,
                bestAntLev,
                sales3m,
                sales12m,
                replacementNr: replacementNr || '-',
                replacementStock,
                urgency,
                urgencySort
            });
        });

        if (this.searchTerm) {
            const term = this.searchTerm.toLowerCase();
            rows = rows.filter(r =>
                r.toolsNr.toLowerCase().includes(term) ||
                r.saNumber.toLowerCase().includes(term) ||
                r.replacementNr.toLowerCase().includes(term)
            );
        }

        rows = this.applySortToRows(rows, 'urgencySort', [
            (a, b) => b.urgencySort - a.urgencySort,
            (a, b) => b.stock - a.stock
        ]);

        if (rows.length === 0) {
            return '<div class="alert alert-info">Ingen utgående artikler funnet.</div>';
        }

        return `
            <div class="module-controls" style="margin-top:8px;">
                <div class="search-group">
                    <input type="text" class="search-input" placeholder="Søk artikkel..."
                           value="${this.searchTerm}"
                           onkeyup="WorkMode.handleSearch(this.value)">
                </div>
            </div>
            <div class="table-wrapper">
                <table class="data-table compact">
                    <thead>
                        <tr>
                            ${this.th('Tools nr', 'toolsNr')}
                            ${this.th('SA', 'saNumber')}
                            ${this.th('Lager', 'stock')}
                            ${this.th('Innkommende', 'bestAntLev')}
                            ${this.th('Salg 3m', 'sales3m')}
                            ${this.th('Salg 12m', 'sales12m')}
                            ${this.th('Erstatning', 'replacementNr')}
                            ${this.th('Erst. lager', 'replacementStock')}
                            ${this.th('Hastegrad', 'urgencySort')}
                        </tr>
                    </thead>
                    <tbody>
                        ${rows.map(r => `
                            <tr class="${r.urgency === 'HIGH' ? 'row-critical' : r.urgency === 'MEDIUM' ? 'row-warning' : ''}">
                                <td><strong>${this.esc(r.toolsNr)}</strong></td>
                                <td>${this.esc(r.saNumber)}</td>
                                <td class="qty-cell">${this.fmt(r.stock)}</td>
                                <td class="qty-cell">${r.bestAntLev > 0 ? this.fmt(r.bestAntLev) : '-'}</td>
                                <td class="qty-cell">${this.fmt(r.sales3m)}</td>
                                <td class="qty-cell">${this.fmt(r.sales12m)}</td>
                                <td>${this.esc(r.replacementNr)}</td>
                                <td class="qty-cell">${this.fmt(r.replacementStock)}</td>
                                <td>${this.urgencyBadge(r.urgency)}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
            <div class="table-footer"><p class="text-muted">Viser ${rows.length} utgående artikler</p></div>
        `;
    }

    // ════════════════════════════════════════════════════
    //  SUB-TAB: Død lager
    // ════════════════════════════════════════════════════

    static renderDeadStockTab(store) {
        const items = store.getAllItems();
        let rows = [];

        items.forEach(item => {
            const stock = item.stock || 0;
            const sales12m = item.sales12m || 0;
            if (stock <= 0 || sales12m > 0) return;

            rows.push({
                toolsNr: item.toolsArticleNumber,
                stock,
                estimertVerdi: item.estimertVerdi || 0,
                category: item.category || '',
                supplier: item.supplier || '',
                status: item._status || 'UKJENT'
            });
        });

        if (this.searchTerm) {
            const term = this.searchTerm.toLowerCase();
            rows = rows.filter(r =>
                r.toolsNr.toLowerCase().includes(term) ||
                r.category.toLowerCase().includes(term) ||
                r.supplier.toLowerCase().includes(term)
            );
        }

        rows = this.applySortToRows(rows, 'estimertVerdi', [
            (a, b) => b.estimertVerdi - a.estimertVerdi
        ]);

        if (rows.length === 0) {
            return '<div class="alert alert-info">Ingen artikler med lager uten salg siste 12 måneder.</div>';
        }

        const totalValue = rows.reduce((s, r) => s + r.estimertVerdi, 0);

        return `
            <div class="module-controls" style="margin-top:8px;">
                <div class="search-group">
                    <input type="text" class="search-input" placeholder="Søk artikkel..."
                           value="${this.searchTerm}"
                           onkeyup="WorkMode.handleSearch(this.value)">
                </div>
            </div>
            <div style="margin:8px 0;padding:8px 12px;background:#fff3e0;border-radius:4px;font-size:13px;">
                <strong>${rows.length} artikler</strong> med lager men null salg siste 12 måneder.
                Estimert bundet kapital: <strong>${Math.round(totalValue).toLocaleString('nb-NO')} kr</strong>
            </div>
            <div class="table-wrapper">
                <table class="data-table compact">
                    <thead>
                        <tr>
                            ${this.th('Tools nr', 'toolsNr')}
                            ${this.th('Lager', 'stock')}
                            ${this.th('Est. verdi', 'estimertVerdi')}
                            ${this.th('Varegruppe', 'category')}
                            ${this.th('Leverandør', 'supplier')}
                            ${this.th('Status', 'status')}
                        </tr>
                    </thead>
                    <tbody>
                        ${rows.map(r => `
                            <tr>
                                <td><strong>${this.esc(r.toolsNr)}</strong></td>
                                <td class="qty-cell">${this.fmt(r.stock)}</td>
                                <td class="qty-cell">${Math.round(r.estimertVerdi).toLocaleString('nb-NO')} kr</td>
                                <td>${this.esc(r.category)}</td>
                                <td>${this.esc(r.supplier)}</td>
                                <td>${this.statusBadge(r.status)}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
            <div class="table-footer"><p class="text-muted">Viser ${rows.length} artikler</p></div>
        `;
    }

    // ════════════════════════════════════════════════════
    //  EVENT HANDLERS
    // ════════════════════════════════════════════════════

    static switchSubTab(tab) {
        this.currentSubTab = tab;
        this.searchTerm = '';
        this.sortColumn = null;
        this.sortDirection = 'desc';
        if (window.app && window.app.dataStore) {
            window.app.renderCurrentModule();
        }
    }

    static handleSearch(value) {
        this.searchTerm = value;
        const el = document.getElementById('workSubContent');
        if (el && this.dataStore) {
            el.innerHTML = this.renderSubTab(this.dataStore);
        }
    }

    static handleSort(column) {
        if (this.sortColumn === column) {
            this.sortDirection = this.sortDirection === 'asc' ? 'desc' : 'asc';
        } else {
            this.sortColumn = column;
            this.sortDirection = column === 'urgencySort' || column === 'estimertVerdi' || column === 'stock' ? 'desc' : 'asc';
        }
        const el = document.getElementById('workSubContent');
        if (el && this.dataStore) {
            el.innerHTML = this.renderSubTab(this.dataStore);
        }
    }

    static toggleFilter(name) {
        if (this.activeFilters.has(name)) {
            this.activeFilters.delete(name);
        } else {
            this.activeFilters.add(name);
        }
        this.refreshPriority();
    }

    static handlePqSearch(value) {
        this.pqSearch = value;
        this.refreshPriority();
    }

    static toggleArchive() {
        this.archiveExpanded = !this.archiveExpanded;
        const el = document.getElementById('workSubContent');
        if (el && this.dataStore) {
            el.innerHTML = this.renderSubTab(this.dataStore);
        }
    }

    static refreshPriority() {
        const el = document.getElementById('prioritySection');
        if (el) {
            el.innerHTML = this.renderPriorityContent();
        }
    }

    // ════════════════════════════════════════════════════
    //  HELPERS
    // ════════════════════════════════════════════════════

    static hasRecentSales(item) {
        if (!item.outgoingOrders || item.outgoingOrders.length === 0) return false;
        const threeMonthsAgo = new Date();
        threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
        return item.outgoingOrders.some(o => {
            if (o.quantity <= 0) return false;
            const d = o.deliveryDate instanceof Date ? o.deliveryDate :
                      o.deliveryDate ? new Date(o.deliveryDate) : null;
            return d && !isNaN(d.getTime()) && d >= threeMonthsAgo;
        });
    }

    static isDiscontinued(item) {
        if (item._status === 'UTGAENDE' || item._status === 'UTGAATT') return true;
        if (item.isDiscontinued) return true;
        const raw = (item.status || '').toString().toLowerCase();
        if (raw.includes('utgå') || raw.includes('discontinued') || raw.includes('avvikle')) return true;
        if (raw === '3' || raw === '4' || raw.startsWith('3 -') || raw.startsWith('4 -')) return true;
        return false;
    }

    static getSales3m(item) {
        if (item.outgoingOrders && item.outgoingOrders.length > 0) {
            const threeMonthsAgo = new Date();
            threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
            let total = 0;
            item.outgoingOrders.forEach(o => {
                if (o.quantity <= 0) return;
                const d = o.deliveryDate instanceof Date ? o.deliveryDate :
                          o.deliveryDate ? new Date(o.deliveryDate) : null;
                if (d && !isNaN(d.getTime()) && d >= threeMonthsAgo) total += o.quantity;
            });
            return Math.round(total);
        }
        return item.sales6m ? Math.round(item.sales6m / 2) : 0;
    }

    static applySortToRows(rows, defaultCol, defaultComparators) {
        if (!this.sortColumn) {
            return rows.sort((a, b) => {
                for (const cmp of defaultComparators) {
                    const result = cmp(a, b);
                    if (result !== 0) return result;
                }
                return 0;
            });
        }

        const col = this.sortColumn;
        const dir = this.sortDirection === 'asc' ? 1 : -1;
        return [...rows].sort((a, b) => {
            let aVal = a[col];
            let bVal = b[col];
            if (aVal == null) aVal = '';
            if (bVal == null) bVal = '';
            if (typeof aVal === 'number' && typeof bVal === 'number') return (aVal - bVal) * dir;
            return String(aVal).localeCompare(String(bVal), 'nb-NO') * dir;
        });
    }

    static th(label, key) {
        const indicator = this.sortColumn === key
            ? (this.sortDirection === 'asc' ? ' &#9650;' : ' &#9660;')
            : '';
        return `<th class="sortable-header" onclick="WorkMode.handleSort('${key}')">${label}${indicator}</th>`;
    }

    static priorityBadge(score) {
        if (score >= 100) return '<span style="display:inline-block;padding:2px 8px;border-radius:3px;font-size:11px;font-weight:700;background:#ffcdd2;color:#c62828;">Kritisk</span>';
        if (score >= 80) return '<span style="display:inline-block;padding:2px 8px;border-radius:3px;font-size:11px;font-weight:700;background:#ffe0b2;color:#e65100;">Høy</span>';
        if (score >= 40) return '<span style="display:inline-block;padding:2px 8px;border-radius:3px;font-size:11px;font-weight:600;background:#fff9c4;color:#f57f17;">Medium</span>';
        return '<span style="display:inline-block;padding:2px 8px;border-radius:3px;font-size:11px;color:#757575;background:#f5f5f5;">Lav</span>';
    }

    static noSaBadges(item) {
        const badges = [];
        const bs = 'display:inline-block;padding:2px 6px;border-radius:3px;font-size:10px;font-weight:600;margin-right:3px;';
        if (item.stock > 0) badges.push(`<span style="${bs}background:#c8e6c9;color:#2e7d32;">Har lager</span>`);
        if (item.bestillingspunkt > 0) badges.push(`<span style="${bs}background:#bbdefb;color:#1565c0;">Har BP</span>`);
        if (item.bestAntLev > 0) badges.push(`<span style="${bs}background:#fff9c4;color:#f57f17;">Innkommende</span>`);
        return badges.length > 0 ? badges.join('') : '-';
    }

    static urgencyBadge(level) {
        if (level === 'HIGH') return '<span class="badge badge-critical" style="color:#d32f2f;font-weight:bold;">HØY</span>';
        if (level === 'MEDIUM') return '<span class="badge badge-warning" style="color:#e65100;font-weight:bold;">MEDIUM</span>';
        return '<span class="badge badge-ok" style="color:#9e9e9e;">LAV</span>';
    }

    static statusBadge(status) {
        if (status === 'AKTIV') return '<span class="badge badge-ok">Aktiv</span>';
        if (status === 'UTGAENDE') return '<span class="badge badge-warning">Utgående</span>';
        if (status === 'UTGAATT') return '<span class="badge badge-critical">Utgått</span>';
        return `<span class="badge badge-info">${this.esc(status)}</span>`;
    }

    static fmt(num) {
        if (num === null || num === undefined) return '-';
        return Math.round(num).toLocaleString('nb-NO');
    }

    static fmtKr(num) {
        if (num === null || num === undefined) return '-';
        return Math.round(num).toLocaleString('nb-NO') + ' kr';
    }

    static esc(str) {
        if (!str) return '';
        return str.toString()
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    // ════════════════════════════════════════════════════
    //  VEDLIKEHOLDSSTOPP – PLANLEGGING 2026
    // ════════════════════════════════════════════════════

    static buildMaintenanceStopData(store, fromDate, toDate) {
        const START = new Date(fromDate);
        const END = new Date(toDate);
        END.setHours(23, 59, 59, 999);

        const items = store.getAllItems();
        const aggregated = new Map();

        // Step 1: Aggregate orders within date range — ALL items, no filtering
        items.forEach(item => {
            if (!item.outgoingOrders || item.outgoingOrders.length === 0) return;

            item.outgoingOrders.forEach(order => {
                if (order.quantity <= 0) return;

                const d = order.deliveryDate instanceof Date ? order.deliveryDate :
                    order.deliveryDate ? new Date(order.deliveryDate) : null;
                if (!d || isNaN(d.getTime())) return;

                if (d < START || d > END) return;

                const toolsNr = item.toolsArticleNumber;
                if (!aggregated.has(toolsNr)) {
                    aggregated.set(toolsNr, { item, totalQty: 0 });
                }
                aggregated.get(toolsNr).totalQty += order.quantity;
            });
        });

        // Step 2: Build result rows — ALL items with period sales, no exclusions
        const rows = [];

        aggregated.forEach(({ item, totalQty }, toolsNr) => {
            const stock = item.stock || 0;
            const bestAntLev = item.bestAntLev || 0;
            const kalkylPris = item.kalkylPris || 0;
            const disc = this.isDiscontinued(item);

            // Alternative cross-check via existing resolver
            let hasAlternative = false;
            let altItemNo = '';
            let altStock = 0;
            let altBestAntLev = 0;
            let altStatusText = '';

            if (typeof store.resolveAlternativeStatus === 'function') {
                const altInfo = store.resolveAlternativeStatus(item);
                if (altInfo.classification !== 'NO_ALTERNATIVE') {
                    hasAlternative = true;
                    altItemNo = altInfo.altToolsArtNr || '';
                    altStock = altInfo.altStock || 0;
                    altBestAntLev = altInfo.altBestAntLev || 0;
                    altStatusText = altInfo.altStatus || '';
                }
            }

            // Effective available: use alternative supply if discontinued with alternative
            let effectiveAvailable;
            if (disc && hasAlternative) {
                effectiveAvailable = altStock + altBestAntLev;
            } else {
                effectiveAvailable = stock + bestAntLev;
            }

            const coveredByAlternative = disc && hasAlternative &&
                (altStock + altBestAntLev) >= totalQty;

            const stopForecast = Math.ceil(totalQty * 1.15);
            const suggestedPurchase = Math.max(0, stopForecast - effectiveAvailable);

            // Status logic with alternative awareness
            let statusLabel, statusClass;
            if (disc && coveredByAlternative) {
                statusLabel = 'Dekket av alternativ';
                statusClass = 'altCovered';
            } else if (disc && !coveredByAlternative) {
                statusLabel = 'Utg\u00E5ende \u2013 risiko';
                statusClass = 'critical';
            } else if (effectiveAvailable < totalQty) {
                statusLabel = 'Kritisk';
                statusClass = 'critical';
            } else if (effectiveAvailable < stopForecast) {
                statusLabel = 'Lav buffer';
                statusClass = 'warning';
            } else {
                statusLabel = 'OK';
                statusClass = 'ok';
            }

            rows.push({
                toolsNr,
                description: item.description || '',
                periodQty: Math.round(totalQty),
                stopForecast,
                stock,
                bestAntLev,
                suggestedPurchase,
                valueNok: Math.round(suggestedPurchase * kalkylPris),
                kalkylPris,
                statusLabel,
                statusClass,
                itemStatus: item._status || 'UKJENT',
                disc,
                hasAlternative,
                altItemNo,
                altStock,
                altBestAntLev,
                coveredByAlternative
            });
        });

        // Step 3: Sort by periodQty DESC (total consumption)
        rows.sort((a, b) => b.periodQty - a.periodQty);

        // Step 4: Compute summary stats
        const totalPeriodQty = rows.reduce((s, r) => s + r.periodQty, 0);
        const totalForecastValue = rows.reduce((s, r) => s + Math.round(r.stopForecast * r.kalkylPris), 0);
        const totalPurchaseValue = rows.reduce((s, r) => s + r.valueNok, 0);
        const criticalCount = rows.filter(r => r.suggestedPurchase > 0).length;
        const discCount = rows.filter(r => r.disc).length;
        const coveredCount = rows.filter(r => r.coveredByAlternative).length;

        return { rows, totalPeriodQty, totalForecastValue, totalPurchaseValue, criticalCount, discCount, coveredCount };
    }

    static getStopDates() {
        const fromSaved = localStorage.getItem('stopFrom');
        const toSaved = localStorage.getItem('stopTo');
        return {
            from: fromSaved || '2025-04-14',
            to: toSaved || '2025-04-20'
        };
    }

    static renderStopContent(data, periodLabel) {
        const { rows, totalPeriodQty, totalForecastValue, totalPurchaseValue, criticalCount, discCount, coveredCount } = data;

        const cardStyle = 'padding:14px;border-radius:8px;text-align:center;';
        const valStyle = 'font-size:20px;font-weight:700;margin-bottom:4px;';
        const lblStyle = 'font-size:11px;font-weight:600;';

        const summaryHtml = `
            <div style="display:grid;grid-template-columns:repeat(6,1fr);gap:10px;margin-bottom:20px;">
                <div style="${cardStyle}background:#e3f2fd;border:1px solid #bbdefb;">
                    <div style="${valStyle}color:#1565c0;">${this.fmt(totalPeriodQty)}</div>
                    <div style="${lblStyle}color:#1565c0;">Total periodeforbruk</div>
                    <div style="font-size:10px;color:#42a5f5;margin-top:2px;">${this.esc(periodLabel)}</div>
                </div>
                <div style="${cardStyle}background:#e8f5e9;border:1px solid #c8e6c9;">
                    <div style="${valStyle}color:#2e7d32;">${this.fmtKr(totalForecastValue)}</div>
                    <div style="${lblStyle}color:#2e7d32;">Forecast-verdi</div>
                    <div style="font-size:10px;color:#66bb6a;margin-top:2px;">Antall \u00D7 kalkylpris</div>
                </div>
                <div style="${cardStyle}background:#fff3e0;border:1px solid #ffe0b2;">
                    <div style="${valStyle}color:#e65100;">${this.fmtKr(totalPurchaseValue)}</div>
                    <div style="${lblStyle}color:#e65100;">Innkj\u00F8psbehov verdi</div>
                    <div style="font-size:10px;color:#ffa726;margin-top:2px;">Foresl\u00E5tt innkj\u00F8p</div>
                </div>
                <div style="${cardStyle}background:${criticalCount > 0 ? '#fdf4f4' : '#f5f5f5'};border:1px solid ${criticalCount > 0 ? '#ffcdd2' : '#e0e0e0'};">
                    <div style="${valStyle}color:${criticalCount > 0 ? '#c62828' : '#757575'};">${criticalCount}</div>
                    <div style="${lblStyle}color:${criticalCount > 0 ? '#c62828' : '#757575'};">Kritiske artikler</div>
                    <div style="font-size:10px;color:${criticalCount > 0 ? '#ef9a9a' : '#9e9e9e'};margin-top:2px;">M\u00E5 kj\u00F8pes &gt; 0</div>
                </div>
                <div style="${cardStyle}background:${discCount > 0 ? '#fff3e0' : '#f5f5f5'};border:1px solid ${discCount > 0 ? '#ffe0b2' : '#e0e0e0'};">
                    <div style="${valStyle}color:${discCount > 0 ? '#e65100' : '#757575'};">${discCount}</div>
                    <div style="${lblStyle}color:${discCount > 0 ? '#e65100' : '#757575'};">Utg\u00E5ende i perioden</div>
                    <div style="font-size:10px;color:${discCount > 0 ? '#ffa726' : '#9e9e9e'};margin-top:2px;">Utgående / utg\u00E5tt</div>
                </div>
                <div style="${cardStyle}background:${coveredCount > 0 ? '#e8f5e9' : '#f5f5f5'};border:1px solid ${coveredCount > 0 ? '#c8e6c9' : '#e0e0e0'};">
                    <div style="${valStyle}color:${coveredCount > 0 ? '#2e7d32' : '#757575'};">${coveredCount}</div>
                    <div style="${lblStyle}color:${coveredCount > 0 ? '#2e7d32' : '#757575'};">Dekket av alternativ</div>
                    <div style="font-size:10px;color:${coveredCount > 0 ? '#66bb6a' : '#9e9e9e'};margin-top:2px;">Alt. lager \u2265 behov</div>
                </div>
            </div>
        `;

        let tableHtml;
        if (rows.length === 0) {
            tableHtml = '<div class="alert alert-info" style="font-size:13px;">Ingen vedlikeholdsstopp-data funnet for perioden ' + this.esc(periodLabel) + '.</div>';
        } else {
            tableHtml = `
                <div class="table-wrapper">
                    <table class="data-table compact" style="font-size:12px;">
                        <thead>
                            <tr>
                                <th>Artikkel</th>
                                <th>Beskrivelse</th>
                                <th>Periode</th>
                                <th>Forecast 2026</th>
                                <th>Lager</th>
                                <th>I bestilling</th>
                                <th>M\u00E5 kj\u00F8pes</th>
                                <th>Verdi NOK</th>
                                <th>Status n\u00E5</th>
                                <th>Alternativ</th>
                                <th>Alt. lager</th>
                                <th>Dekket?</th>
                                <th>Vurdering</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${rows.map(r => `
                                <tr class="${r.statusClass === 'critical' ? 'row-critical' : r.statusClass === 'warning' ? 'row-warning' : ''}">
                                    <td><strong>${this.esc(r.toolsNr)}</strong></td>
                                    <td style="max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${this.esc(r.description)}</td>
                                    <td class="qty-cell">${this.fmt(r.periodQty)}</td>
                                    <td class="qty-cell">${this.fmt(r.stopForecast)}</td>
                                    <td class="qty-cell">${this.fmt(r.stock)}</td>
                                    <td class="qty-cell">${r.bestAntLev > 0 ? this.fmt(r.bestAntLev) : '-'}</td>
                                    <td class="qty-cell" style="font-weight:${r.suggestedPurchase > 0 ? '700' : '400'};color:${r.suggestedPurchase > 0 ? '#c62828' : '#757575'};">${r.suggestedPurchase > 0 ? this.fmt(r.suggestedPurchase) : '0'}</td>
                                    <td class="qty-cell">${r.valueNok > 0 ? this.fmtKr(r.valueNok) : '-'}</td>
                                    <td>${this.itemStatusBadge(r.itemStatus)}</td>
                                    <td>${r.altItemNo ? this.esc(r.altItemNo) : '-'}</td>
                                    <td class="qty-cell">${r.hasAlternative ? this.fmt(r.altStock) : '-'}</td>
                                    <td>${this.coveredBadge(r.disc, r.hasAlternative, r.coveredByAlternative)}</td>
                                    <td>${this.stopStatusBadge(r.statusLabel, r.statusClass)}</td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
                <div class="table-footer">
                    <p class="text-muted">Viser ${rows.length} artikler | Periode: ${this.esc(periodLabel)} | Forecast = historikk \u00D7 1.15</p>
                </div>
            `;
        }

        return summaryHtml + tableHtml;
    }

    static renderMaintenanceStopSection(store) {
        const dates = this.getStopDates();
        const data = this.buildMaintenanceStopData(store, dates.from, dates.to);
        const periodLabel = `${dates.from} \u2013 ${dates.to}`;

        const datePickerHtml = `
            <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:16px;padding:12px;background:#f5f5f5;border-radius:6px;border:1px solid #e0e0e0;">
                <label style="font-size:13px;font-weight:600;color:#555;">Periode:</label>
                <input type="date" id="stopFrom" value="${this.esc(dates.from)}"
                       style="padding:5px 10px;border:1px solid #bdbdbd;border-radius:4px;font-size:13px;">
                <span style="font-size:13px;color:#757575;">til</span>
                <input type="date" id="stopTo" value="${this.esc(dates.to)}"
                       style="padding:5px 10px;border:1px solid #bdbdbd;border-radius:4px;font-size:13px;">
                <button id="runStopAnalysis" onclick="WorkMode.runStopAnalysis()"
                        style="padding:6px 16px;background:#1565c0;color:#fff;border:none;border-radius:4px;font-size:13px;font-weight:600;cursor:pointer;">
                    Analyser periode
                </button>
            </div>
        `;

        return `
            <div style="margin-top:28px;border-top:2px solid #1565c0;padding-top:20px;">
                <div style="display:flex;align-items:center;gap:10px;margin-bottom:16px;">
                    <h3 style="margin:0;font-size:16px;color:#1565c0;">Vedlikeholdsstopp \u2013 Planlegging 2026</h3>
                </div>
                ${datePickerHtml}
                <div id="stopAnalysisContent">
                    ${this.renderStopContent(data, periodLabel)}
                </div>
            </div>
        `;
    }

    static runStopAnalysis() {
        const fromEl = document.getElementById('stopFrom');
        const toEl = document.getElementById('stopTo');
        if (!fromEl || !toEl || !this.dataStore) return;

        const fromDate = fromEl.value;
        const toDate = toEl.value;
        if (!fromDate || !toDate) return;

        localStorage.setItem('stopFrom', fromDate);
        localStorage.setItem('stopTo', toDate);

        const data = this.buildMaintenanceStopData(this.dataStore, fromDate, toDate);
        const periodLabel = `${fromDate} \u2013 ${toDate}`;

        const el = document.getElementById('stopAnalysisContent');
        if (el) {
            el.innerHTML = this.renderStopContent(data, periodLabel);
        }
    }

    static stopStatusBadge(label, statusClass) {
        if (statusClass === 'critical') {
            return '<span style="display:inline-block;padding:2px 8px;border-radius:3px;font-size:11px;font-weight:700;background:#ffcdd2;color:#c62828;">' + this.esc(label) + '</span>';
        }
        if (statusClass === 'warning') {
            return '<span style="display:inline-block;padding:2px 8px;border-radius:3px;font-size:11px;font-weight:600;background:#fff9c4;color:#f57f17;">' + this.esc(label) + '</span>';
        }
        if (statusClass === 'altCovered') {
            return '<span style="display:inline-block;padding:2px 8px;border-radius:3px;font-size:11px;font-weight:600;background:#e0f2f1;color:#00695c;">' + this.esc(label) + '</span>';
        }
        return '<span style="display:inline-block;padding:2px 8px;border-radius:3px;font-size:11px;color:#2e7d32;background:#e8f5e9;">OK</span>';
    }

    static itemStatusBadge(status) {
        if (status === 'AKTIV') return '<span style="display:inline-block;padding:2px 6px;border-radius:3px;font-size:10px;font-weight:600;background:#e8f5e9;color:#2e7d32;">Aktiv</span>';
        if (status === 'UTGAENDE') return '<span style="display:inline-block;padding:2px 6px;border-radius:3px;font-size:10px;font-weight:600;background:#fff9c4;color:#f57f17;">Utg\u00E5ende</span>';
        if (status === 'UTGAATT') return '<span style="display:inline-block;padding:2px 6px;border-radius:3px;font-size:10px;font-weight:600;background:#ffcdd2;color:#c62828;">Utg\u00E5tt</span>';
        return '<span style="display:inline-block;padding:2px 6px;border-radius:3px;font-size:10px;color:#757575;background:#f5f5f5;">' + this.esc(status) + '</span>';
    }

    static coveredBadge(disc, hasAlt, covered) {
        if (!disc) return '<span style="font-size:11px;color:#9e9e9e;">\u2013</span>';
        if (!hasAlt) return '<span style="display:inline-block;padding:2px 6px;border-radius:3px;font-size:10px;font-weight:600;background:#ffcdd2;color:#c62828;">Ingen alt.</span>';
        if (covered) return '<span style="display:inline-block;padding:2px 6px;border-radius:3px;font-size:10px;font-weight:600;background:#e8f5e9;color:#2e7d32;">Ja</span>';
        return '<span style="display:inline-block;padding:2px 6px;border-radius:3px;font-size:10px;font-weight:600;background:#fff9c4;color:#f57f17;">Nei</span>';
    }
}

// Eksporter til global scope
window.WorkMode = WorkMode;
