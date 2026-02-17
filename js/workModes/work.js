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

            <div style="margin-top:28px;border-top:2px solid #e0e0e0;padding-top:20px;">
                <h3 style="margin:0 0 12px 0;font-size:15px;color:#555;">Detaljvisning</h3>
                <div class="view-tabs" style="margin-bottom:0;">
                    <button class="view-tab ${this.currentSubTab === 'saMigration' ? 'active' : ''}"
                            onclick="WorkMode.switchSubTab('saMigration')">
                        SA-migrering (${stats.saMigrationHigh})
                    </button>
                    <button class="view-tab ${this.currentSubTab === 'noSa' ? 'active' : ''}"
                            onclick="WorkMode.switchSubTab('noSa')">
                        Lager uten SA (${stats.noSaWithStock})
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

        return {
            saMigrationHigh,
            discWithExposure,
            discExposureValueKr: Math.round(discExposureValueKr),
            discWithStock,
            discStockValueKr: Math.round(discStockValueKr),
            noSaWithStock,
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
                <div style="${rowStyle}"><span>Lager uten SA</span><span style="${valStyle}color:#e65100;">${stats.noSaWithStock} stk</span></div>
                <div style="${rowStyle}border-top:1px solid #ffe082;padding-top:8px;margin-top:4px;"><span>Kapital i utgående</span><span style="${valStyle}color:#e65100;">${this.fmtKr(stats.discStockValueKr)}</span></div>
            </div>
            <div style="${blockStyle}background:#f5f5f5;border:1px solid #e0e0e0;">
                <h4 style="margin:0 0 10px 0;font-size:13px;font-weight:700;color:#616161;text-transform:uppercase;letter-spacing:0.5px;">Opprydding</h4>
                <div style="${rowStyle}"><span>Død lager</span><span style="${valStyle}color:#616161;">${stats.deadStockCount} stk</span></div>
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
        if (typeof NoSaArticlesMode !== 'undefined') {
            return NoSaArticlesMode.render(store);
        }
        return '<p>NoSaArticlesMode er ikke lastet.</p>';
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
}

// Eksporter til global scope
window.WorkMode = WorkMode;
