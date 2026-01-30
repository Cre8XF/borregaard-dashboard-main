// ===================================
// MODUS 3: SORTIMENT & RYDDING
// Viser: Hva bør bort, erstattes eller vurderes?
// ===================================

/**
 * AssortmentMode - Sortimentanalyse og opprydding
 *
 * Viser:
 * - Slow movers (>365 dager til tomt)
 * - Null-salg over 12 mnd
 * - Artikler med lager men ingen etterspørsel
 * - Kandidater for erstatning
 * - Inaktive artikler med saldo
 */
class AssortmentMode {
    static currentView = 'slowMovers';
    static searchTerm = '';
    static sortColumn = 'value';
    static sortDirection = 'desc';
    static dataStore = null;
    static currentLimit = 50;
    static currentCategory = 'all';

    /**
     * Render sortimentvisningen
     * @param {UnifiedDataStore} store - Data store med alle artikler
     * @returns {string} HTML content
     */
    static render(store) {
        this.dataStore = store;

        const analysis = this.analyzeAssortment(store);

        return `
            <div class="module-header">
                <h2>Sortiment & Rydding</h2>
                <p class="module-description">Hva bør bort, erstattes eller vurderes?</p>
            </div>

            ${this.renderSummaryCards(analysis)}

            <div class="view-tabs">
                <button class="view-tab ${this.currentView === 'slowMovers' ? 'active' : ''}"
                        onclick="AssortmentMode.switchView('slowMovers')">
                    Slow movers (${analysis.slowMovers.length})
                </button>
                <button class="view-tab ${this.currentView === 'noSales' ? 'active' : ''}"
                        onclick="AssortmentMode.switchView('noSales')">
                    Null-salg (${analysis.noSales.length})
                </button>
                <button class="view-tab ${this.currentView === 'inactive' ? 'active' : ''}"
                        onclick="AssortmentMode.switchView('inactive')">
                    Inaktive (${analysis.inactive.length})
                </button>
                <button class="view-tab ${this.currentView === 'discontinued' ? 'active' : ''}"
                        onclick="AssortmentMode.switchView('discontinued')">
                    Utgående med saldo (${analysis.discontinued.length})
                </button>
                <button class="view-tab ${this.currentView === 'candidates' ? 'active' : ''}"
                        onclick="AssortmentMode.switchView('candidates')">
                    Utfasings­kandidater
                </button>
            </div>

            <div class="module-controls">
                <div class="filter-group">
                    <label>Vis:</label>
                    <select id="limitFilter" class="filter-select" onchange="AssortmentMode.handleLimitChange(this.value)">
                        <option value="20" ${this.currentLimit === 20 ? 'selected' : ''}>Top 20</option>
                        <option value="50" ${this.currentLimit === 50 ? 'selected' : ''}>Top 50</option>
                        <option value="100" ${this.currentLimit === 100 ? 'selected' : ''}>Top 100</option>
                        <option value="all" ${this.currentLimit === 'all' ? 'selected' : ''}>Alle</option>
                    </select>
                </div>
                <div class="filter-group">
                    <label>Kategori:</label>
                    <select id="categoryFilter" class="filter-select" onchange="AssortmentMode.handleCategoryChange(this.value)">
                        <option value="all" ${this.currentCategory === 'all' ? 'selected' : ''}>Alle kategorier</option>
                        ${this.getCategories(store).map(cat => `
                            <option value="${cat}" ${this.currentCategory === cat ? 'selected' : ''}>${cat}</option>
                        `).join('')}
                    </select>
                </div>
                <div class="search-group">
                    <input type="text" id="assortmentSearch" placeholder="Søk artikkel..."
                           class="search-input" value="${this.searchTerm}"
                           onkeyup="AssortmentMode.handleSearch(this.value)">
                </div>
                <button onclick="AssortmentMode.exportCSV()" class="btn-export">Eksporter CSV</button>
            </div>

            <div id="assortmentContent">
                ${this.renderCurrentView(analysis)}
            </div>
        `;
    }

    /**
     * Analyser sortiment
     */
    static analyzeAssortment(store) {
        const items = store.getAllItems();
        const analysis = {
            slowMovers: [],
            noSales: [],
            inactive: [],
            discontinued: [],
            candidates: [],
            totalValue: 0,
            slowMoverValue: 0
        };

        const SLOW_MOVER_THRESHOLD = 365; // dager til tomt
        const INACTIVE_STATUSES = ['9', '10', '3', 'Utgått', 'Inaktiv', 'Blokkert', 'utgått', 'inaktiv', 'blokkert'];

        items.forEach(item => {
            const estimatedValue = (item.stock || 0) * 50; // Estimert verdi (default pris)

            // Sjekk om inaktiv
            const isInactive = INACTIVE_STATUSES.some(s =>
                item.status && item.status.toString().toLowerCase().includes(s.toLowerCase())
            );

            if (isInactive && item.stock > 0) {
                analysis.inactive.push({
                    ...item,
                    estimatedValue,
                    reason: 'Inaktiv artikkel med saldo'
                });
            }

            // Sjekk utgående (planned discontinued med saldo)
            if (item.isDiscontinued && item.stock > 0) {
                analysis.discontinued.push({
                    ...item,
                    estimatedValue,
                    reason: 'Utgående artikkel med lagersaldo'
                });
            }

            // Sjekk slow movers
            if (item.stock > 0 && item.daysToEmpty > SLOW_MOVER_THRESHOLD && !isInactive) {
                analysis.slowMovers.push({
                    ...item,
                    estimatedValue,
                    daysToEmpty: item.daysToEmpty === 999999 ? Infinity : item.daysToEmpty
                });
                analysis.slowMoverValue += estimatedValue;
            }

            // Sjekk null-salg
            if (item.stock > 0 && (item.sales12m || 0) === 0 && !isInactive) {
                analysis.noSales.push({
                    ...item,
                    estimatedValue,
                    reason: 'Ingen salg siste 12 mnd'
                });
            }

            analysis.totalValue += estimatedValue;
        });

        // Generer utfasingskandidater (kombinasjon av faktorer)
        analysis.candidates = this.identifyCandidates(items);

        // Sorter lister
        analysis.slowMovers.sort((a, b) => b.estimatedValue - a.estimatedValue);
        analysis.noSales.sort((a, b) => b.estimatedValue - a.estimatedValue);
        analysis.inactive.sort((a, b) => b.stock - a.stock);
        analysis.discontinued.sort((a, b) => b.stock - a.stock);

        return analysis;
    }

    /**
     * Identifiser utfasingskandidater
     */
    static identifyCandidates(items) {
        const candidates = [];

        items.forEach(item => {
            const score = this.calculateCandidateScore(item);

            if (score.total >= 3) {
                candidates.push({
                    ...item,
                    score: score.total,
                    reasons: score.reasons,
                    estimatedValue: (item.stock || 0) * 50,
                    recommendation: this.getRecommendation(score)
                });
            }
        });

        return candidates.sort((a, b) => b.score - a.score);
    }

    /**
     * Beregn kandidatscore
     */
    static calculateCandidateScore(item) {
        const reasons = [];
        let score = 0;

        // Ingen salg
        if ((item.sales12m || 0) === 0 && item.stock > 0) {
            score += 3;
            reasons.push('Ingen salg 12 mnd');
        } else if ((item.sales12m || 0) < 10 && item.stock > 0) {
            score += 1;
            reasons.push('Lavt salg (<10 stk/år)');
        }

        // Lang tid til tomt
        if (item.daysToEmpty > 730) { // >2 år
            score += 2;
            reasons.push('Over 2 år til tomt');
        } else if (item.daysToEmpty > 365) {
            score += 1;
            reasons.push('Over 1 år til tomt');
        }

        // Høy lagerbeholdning relativt til salg
        const monthlyConsumption = item.monthlyConsumption || 0;
        if (monthlyConsumption > 0 && item.stock > monthlyConsumption * 24) {
            score += 2;
            reasons.push('Lager for >2 års forbruk');
        }

        // Ingen SA-nummer (mulig duplikat/uorganisert)
        if (!item.hasSANumber) {
            score += 0.5;
            reasons.push('Mangler SA-nummer');
        }

        // Kun én kunde og lavt salg
        if (item.orderCount <= 2 && (item.sales12m || 0) < 50) {
            score += 1;
            reasons.push('Få ordrer, lavt volum');
        }

        return { total: score, reasons };
    }

    /**
     * Hent anbefaling basert på score
     */
    static getRecommendation(score) {
        if (score.total >= 5) {
            return { text: 'Vurder utfasing', class: 'critical' };
        } else if (score.total >= 4) {
            return { text: 'Undersøk nærmere', class: 'warning' };
        }
        return { text: 'Følg med', class: 'info' };
    }

    /**
     * Render sammendragskort
     */
    static renderSummaryCards(analysis) {
        const slowMoverPercent = analysis.totalValue > 0
            ? Math.round((analysis.slowMoverValue / analysis.totalValue) * 100)
            : 0;

        return `
            <div class="assortment-summary">
                <div class="stat-card warning">
                    <div class="stat-value">${analysis.slowMovers.length}</div>
                    <div class="stat-label">Slow movers</div>
                    <div class="stat-sub">>1 år til tomt</div>
                </div>
                <div class="stat-card critical">
                    <div class="stat-value">${analysis.noSales.length}</div>
                    <div class="stat-label">Null-salg</div>
                    <div class="stat-sub">12 mnd uten salg</div>
                </div>
                <div class="stat-card">
                    <div class="stat-value">${analysis.inactive.length}</div>
                    <div class="stat-label">Inaktive m/saldo</div>
                    <div class="stat-sub">Utgåtte artikler</div>
                </div>
                <div class="stat-card critical">
                    <div class="stat-value">${analysis.discontinued.length}</div>
                    <div class="stat-label">Utgående med saldo</div>
                    <div class="stat-sub">Skal utgå (discontinued)</div>
                </div>
                <div class="stat-card highlight">
                    <div class="stat-value">${slowMoverPercent}%</div>
                    <div class="stat-label">Bundet kapital</div>
                    <div class="stat-sub">i slow movers</div>
                </div>
            </div>
        `;
    }

    /**
     * Render nåværende visning
     */
    static renderCurrentView(analysis) {
        switch (this.currentView) {
            case 'slowMovers':
                return this.renderSlowMovers(analysis.slowMovers);
            case 'noSales':
                return this.renderNoSales(analysis.noSales);
            case 'inactive':
                return this.renderInactive(analysis.inactive);
            case 'discontinued':
                return this.renderDiscontinued(analysis.discontinued);
            case 'candidates':
                return this.renderCandidates(analysis.candidates);
            default:
                return this.renderSlowMovers(analysis.slowMovers);
        }
    }

    /**
     * Render slow movers
     */
    static renderSlowMovers(items) {
        let filtered = this.filterItems(items);
        const limit = this.currentLimit === 'all' ? filtered.length : parseInt(this.currentLimit);
        const displayData = filtered.slice(0, limit);

        if (displayData.length === 0) {
            return `<div class="alert alert-success">Ingen slow movers funnet!</div>`;
        }

        const totalValue = displayData.reduce((sum, i) => sum + i.estimatedValue, 0);

        return `
            <div class="view-insight">
                <p><strong>Slow movers</strong> er artikler med lager som tar over 1 år å selge ut ved nåværende tempo.</p>
                <p class="text-muted">Estimert bundet kapital i visningen: <strong>${this.formatNumber(totalValue)} kr</strong></p>
            </div>
            <div class="table-wrapper">
                <table class="data-table">
                    <thead>
                        <tr>
                            <th>Artikelnr</th>
                            <th>SA-nr</th>
                            <th>Beskrivelse</th>
                            <th>Saldo</th>
                            <th>Solgt 12m</th>
                            <th>Dager til tomt</th>
                            <th>Est. verdi</th>
                            <th>Handling</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${displayData.map(item => `
                            <tr class="clickable" onclick="AssortmentMode.showDetails('${item.toolsArticleNumber}')">
                                <td><strong>${item.toolsArticleNumber}</strong></td>
                                <td>${item.saNumber || '-'}</td>
                                <td>${this.truncate(item.description, 30)}</td>
                                <td class="qty-cell">${this.formatNumber(item.stock)}</td>
                                <td class="qty-cell">${this.formatNumber(item.sales12m || 0)}</td>
                                <td class="qty-cell warning">${item.daysToEmpty === Infinity ? '∞' : this.formatNumber(item.daysToEmpty)}</td>
                                <td class="qty-cell">${this.formatNumber(item.estimatedValue)} kr</td>
                                <td>${this.getActionButton(item)}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
            <div class="table-footer">
                <p class="text-muted">Viser ${displayData.length} av ${filtered.length} slow movers</p>
            </div>
        `;
    }

    /**
     * Render null-salg artikler
     */
    static renderNoSales(items) {
        let filtered = this.filterItems(items);
        const limit = this.currentLimit === 'all' ? filtered.length : parseInt(this.currentLimit);
        const displayData = filtered.slice(0, limit);

        if (displayData.length === 0) {
            return `<div class="alert alert-success">Alle artikler med lager har hatt salg!</div>`;
        }

        const totalValue = displayData.reduce((sum, i) => sum + i.estimatedValue, 0);

        return `
            <div class="view-insight warning">
                <p><strong>Null-salg artikler</strong> har lager men ingen salg siste 12 måneder.</p>
                <p>Dette er kandidater for retur til leverandør, intern overføring eller avskrivning.</p>
                <p class="text-muted">Estimert verdi: <strong>${this.formatNumber(totalValue)} kr</strong></p>
            </div>
            <div class="table-wrapper">
                <table class="data-table">
                    <thead>
                        <tr>
                            <th>Artikelnr</th>
                            <th>SA-nr</th>
                            <th>Beskrivelse</th>
                            <th>Saldo</th>
                            <th>Reservert</th>
                            <th>Est. verdi</th>
                            <th>Leverandør</th>
                            <th>Anbefaling</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${displayData.map(item => `
                            <tr class="row-warning clickable" onclick="AssortmentMode.showDetails('${item.toolsArticleNumber}')">
                                <td><strong>${item.toolsArticleNumber}</strong></td>
                                <td>${item.saNumber || '-'}</td>
                                <td>${this.truncate(item.description, 30)}</td>
                                <td class="qty-cell">${this.formatNumber(item.stock)}</td>
                                <td class="qty-cell">${this.formatNumber(item.reserved || 0)}</td>
                                <td class="qty-cell">${this.formatNumber(item.estimatedValue)} kr</td>
                                <td>${this.truncate(item.supplier, 20)}</td>
                                <td><span class="recommendation warning">Vurder utfasing</span></td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
            <div class="table-footer">
                <p class="text-muted">Viser ${displayData.length} av ${filtered.length} artikler uten salg</p>
            </div>
        `;
    }

    /**
     * Render inaktive artikler
     */
    static renderInactive(items) {
        let filtered = this.filterItems(items);
        const limit = this.currentLimit === 'all' ? filtered.length : parseInt(this.currentLimit);
        const displayData = filtered.slice(0, limit);

        if (displayData.length === 0) {
            return `<div class="alert alert-success">Ingen inaktive artikler med saldo!</div>`;
        }

        const totalStock = displayData.reduce((sum, i) => sum + (i.stock || 0), 0);

        return `
            <div class="view-insight critical">
                <p><strong>Inaktive artikler</strong> er merket som utgått/blokkert, men har fortsatt lagerbeholdning.</p>
                <p>Disse må håndteres: retur, salg, overføring eller avskrivning.</p>
                <p class="text-muted">Total saldo i inaktive: <strong>${this.formatNumber(totalStock)} stk</strong></p>
            </div>
            <div class="table-wrapper">
                <table class="data-table">
                    <thead>
                        <tr>
                            <th>Artikelnr</th>
                            <th>SA-nr</th>
                            <th>Beskrivelse</th>
                            <th>Status</th>
                            <th>Saldo</th>
                            <th>Reservert</th>
                            <th>Est. verdi</th>
                            <th>Handling</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${displayData.map(item => `
                            <tr class="row-critical clickable" onclick="AssortmentMode.showDetails('${item.toolsArticleNumber}')">
                                <td><strong>${item.toolsArticleNumber}</strong></td>
                                <td>${item.saNumber || '-'}</td>
                                <td>${this.truncate(item.description, 30)}</td>
                                <td><span class="badge badge-critical">${item.status || 'Ukjent'}</span></td>
                                <td class="qty-cell">${this.formatNumber(item.stock)}</td>
                                <td class="qty-cell">${this.formatNumber(item.reserved || 0)}</td>
                                <td class="qty-cell">${this.formatNumber(item.estimatedValue)} kr</td>
                                <td><span class="recommendation critical">Krever handling</span></td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
            <div class="table-footer">
                <p class="text-muted">Viser ${displayData.length} av ${filtered.length} inaktive artikler med saldo</p>
            </div>
        `;
    }

    /**
     * Render utgående artikler med saldo (planned discontinued)
     */
    static renderDiscontinued(items) {
        let filtered = this.filterItems(items);
        const limit = this.currentLimit === 'all' ? filtered.length : parseInt(this.currentLimit);
        const displayData = filtered.slice(0, limit);

        if (displayData.length === 0) {
            return `<div class="alert alert-success">Ingen utgående artikler med lagersaldo!</div>`;
        }

        const totalStock = displayData.reduce((sum, i) => sum + (i.stock || 0), 0);
        const totalValue = displayData.reduce((sum, i) => sum + i.estimatedValue, 0);

        return `
            <div class="view-insight critical">
                <p><strong>Utgående artikler med saldo</strong> er merket som "planned discontinued" / "skal utgå" i Jeeves, men har fortsatt lagerbeholdning.</p>
                <p>Disse bør selges ut, returneres eller avskrives før utfasing fullføres.</p>
                <p class="text-muted">Totalt: <strong>${this.formatNumber(totalStock)} stk</strong> &mdash; Est. verdi: <strong>${this.formatNumber(totalValue)} kr</strong></p>
            </div>
            <div class="table-wrapper">
                <table class="data-table">
                    <thead>
                        <tr>
                            <th>Artikelnr</th>
                            <th>SA-nr</th>
                            <th>Beskrivelse</th>
                            <th>Leverandør</th>
                            <th>Lokasjon</th>
                            <th>Saldo</th>
                            <th>Status</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${displayData.map(item => `
                            <tr class="row-critical clickable" onclick="AssortmentMode.showDetails('${item.toolsArticleNumber}')">
                                <td><strong>${item.toolsArticleNumber}</strong></td>
                                <td>${item.saNumber || '-'}</td>
                                <td>${this.truncate(item.description, 30)}</td>
                                <td>${this.truncate(item.supplier, 20)}</td>
                                <td>${item.location || item.placementLocation || '-'}</td>
                                <td class="qty-cell">${this.formatNumber(item.stock)}</td>
                                <td><span class="badge badge-critical">${item.statusText || 'Utgående'}</span></td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
            <div class="table-footer">
                <p class="text-muted">Viser ${displayData.length} av ${filtered.length} utgående artikler med saldo</p>
            </div>
        `;
    }

    /**
     * Render utfasingskandidater
     */
    static renderCandidates(items) {
        let filtered = this.filterItems(items);
        const limit = this.currentLimit === 'all' ? filtered.length : parseInt(this.currentLimit);
        const displayData = filtered.slice(0, limit);

        if (displayData.length === 0) {
            return `<div class="alert alert-info">Ingen tydelige utfasingskandidater identifisert.</div>`;
        }

        return `
            <div class="view-insight">
                <p><strong>Utfasingskandidater</strong> er artikler som scorer høyt på flere risikofaktorer.</p>
                <p class="text-muted">Faktorer: null-salg, lang omløpstid, høyt lager relativt til forbruk, manglende SA-nummer.</p>
            </div>
            <div class="table-wrapper">
                <table class="data-table">
                    <thead>
                        <tr>
                            <th>Score</th>
                            <th>Artikelnr</th>
                            <th>SA-nr</th>
                            <th>Beskrivelse</th>
                            <th>Årsaker</th>
                            <th>Saldo</th>
                            <th>Est. verdi</th>
                            <th>Anbefaling</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${displayData.map(item => `
                            <tr class="clickable" onclick="AssortmentMode.showDetails('${item.toolsArticleNumber}')">
                                <td><span class="score-badge ${item.recommendation.class}">${item.score.toFixed(1)}</span></td>
                                <td><strong>${item.toolsArticleNumber}</strong></td>
                                <td>${item.saNumber || '-'}</td>
                                <td>${this.truncate(item.description, 25)}</td>
                                <td class="reasons-cell">${item.reasons.slice(0, 2).join(', ')}</td>
                                <td class="qty-cell">${this.formatNumber(item.stock)}</td>
                                <td class="qty-cell">${this.formatNumber(item.estimatedValue)} kr</td>
                                <td><span class="recommendation ${item.recommendation.class}">${item.recommendation.text}</span></td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
            <div class="table-footer">
                <p class="text-muted">Viser ${displayData.length} av ${filtered.length} kandidater</p>
            </div>
        `;
    }

    /**
     * Filtrer items basert på søk og kategori
     */
    static filterItems(items) {
        let filtered = items;

        // Kategorifilter (orthogonal – påvirker ikke KPI-tellinger)
        if (this.currentCategory && this.currentCategory !== 'all') {
            filtered = filtered.filter(item =>
                item.category && item.category === this.currentCategory
            );
        }

        // Tekstsøk
        if (this.searchTerm) {
            const term = this.searchTerm.toLowerCase();
            filtered = filtered.filter(item =>
                item.toolsArticleNumber.toLowerCase().includes(term) ||
                (item.description && item.description.toLowerCase().includes(term)) ||
                (item.saNumber && item.saNumber.toLowerCase().includes(term)) ||
                (item.supplier && item.supplier.toLowerCase().includes(term))
            );
        }

        return filtered;
    }

    /**
     * Hent unike kategorier fra datastore, sortert alfabetisk
     */
    static getCategories(store) {
        const categories = new Set();
        store.getAllItems().forEach(item => {
            if (item.category) {
                categories.add(item.category);
            }
        });
        return Array.from(categories).sort((a, b) =>
            a.localeCompare(b, 'nb-NO')
        );
    }

    /**
     * Hjelpefunksjoner
     */
    static getActionButton(item) {
        if ((item.sales12m || 0) === 0) {
            return '<span class="recommendation critical">Vurder utfasing</span>';
        } else if (item.daysToEmpty > 730) {
            return '<span class="recommendation warning">Reduser lager</span>';
        }
        return '<span class="recommendation info">Følg opp</span>';
    }

    static formatNumber(num) {
        if (num === null || num === undefined) return '-';
        return Math.round(num).toLocaleString('nb-NO');
    }

    static truncate(text, maxLength) {
        if (!text) return '-';
        return text.length > maxLength ? text.substring(0, maxLength) + '...' : text;
    }

    /**
     * Event handlers
     */
    static switchView(view) {
        this.currentView = view;
        this.refreshAll();
    }

    static handleLimitChange(limit) {
        this.currentLimit = limit === 'all' ? 'all' : parseInt(limit);
        this.refreshAll();
    }

    static handleSearch(term) {
        this.searchTerm = term;
        this.refreshAll();
    }

    static handleCategoryChange(category) {
        this.currentCategory = category;
        this.refreshAll();
    }

    static refreshAll() {
        const moduleContent = document.getElementById('moduleContent');
        if (moduleContent && this.dataStore) {
            moduleContent.innerHTML = this.render(this.dataStore);
        }
    }

    /**
     * Vis artikkeldetaljer
     */
    static showDetails(articleNumber) {
        if (!this.dataStore) return;

        const item = this.dataStore.items.get(articleNumber);
        if (!item) return;

        const modal = document.createElement('div');
        modal.className = 'modal-overlay';
        modal.innerHTML = `
            <div class="modal-content modal-large">
                <div class="modal-header">
                    <h3>${item.toolsArticleNumber}</h3>
                    ${item.saNumber ? `<span class="sa-badge">SA: ${item.saNumber}</span>` : ''}
                    <button class="modal-close" onclick="this.closest('.modal-overlay').remove()">×</button>
                </div>
                <div class="modal-body">
                    <div class="detail-section">
                        <h4>Artikkelinfo</h4>
                        <div class="detail-grid">
                            <div class="detail-item">
                                <strong>Beskrivelse</strong>
                                ${item.description || '-'}
                            </div>
                            <div class="detail-item">
                                <strong>Leverandør</strong>
                                ${item.supplier || '-'}
                            </div>
                            <div class="detail-item">
                                <strong>Status</strong>
                                ${item.status || 'Aktiv'}
                            </div>
                            <div class="detail-item">
                                <strong>Lokasjon</strong>
                                ${item.location || item.shelf || '-'}
                            </div>
                        </div>
                    </div>

                    <div class="detail-section">
                        <h4>Lagerstatus</h4>
                        <div class="detail-grid">
                            <div class="detail-item">
                                <strong>Saldo</strong>
                                ${this.formatNumber(item.stock)}
                            </div>
                            <div class="detail-item">
                                <strong>Reservert</strong>
                                ${this.formatNumber(item.reserved)}
                            </div>
                            <div class="detail-item">
                                <strong>Disponibel</strong>
                                ${this.formatNumber(item.available)}
                            </div>
                            <div class="detail-item">
                                <strong>Est. verdi</strong>
                                ${this.formatNumber((item.stock || 0) * 50)} kr
                            </div>
                        </div>
                    </div>

                    <div class="detail-section">
                        <h4>Salg og forbruk</h4>
                        <div class="detail-grid">
                            <div class="detail-item ${(item.sales12m || 0) === 0 ? 'critical' : ''}">
                                <strong>Solgt 12 mnd</strong>
                                ${this.formatNumber(item.sales12m || 0)}
                            </div>
                            <div class="detail-item">
                                <strong>Antall ordrer</strong>
                                ${item.orderCount || 0}
                            </div>
                            <div class="detail-item ${item.daysToEmpty > 365 ? 'warning' : ''}">
                                <strong>Dager til tomt</strong>
                                ${item.daysToEmpty === 999999 ? '∞' : this.formatNumber(item.daysToEmpty)}
                            </div>
                            <div class="detail-item">
                                <strong>Månedlig forbruk</strong>
                                ${(item.monthlyConsumption || 0).toFixed(1)}
                            </div>
                        </div>
                    </div>

                    <div class="detail-section">
                        <h4>Vurdering</h4>
                        <div class="assessment-box">
                            ${this.getDetailedAssessment(item)}
                        </div>
                    </div>
                </div>
                <div class="modal-footer">
                    <button class="btn-secondary" onclick="this.closest('.modal-overlay').remove()">Lukk</button>
                </div>
            </div>
        `;

        document.body.appendChild(modal);
    }

    /**
     * Hent detaljert vurdering for artikkel
     */
    static getDetailedAssessment(item) {
        const assessments = [];

        if ((item.sales12m || 0) === 0 && item.stock > 0) {
            assessments.push({
                type: 'critical',
                text: 'Ingen salg siste 12 mnd - vurder utfasing eller retur til leverandør'
            });
        }

        if (item.daysToEmpty > 730) {
            assessments.push({
                type: 'warning',
                text: 'Over 2 års lager - vurder å redusere beholdning'
            });
        } else if (item.daysToEmpty > 365) {
            assessments.push({
                type: 'info',
                text: 'Over 1 års lager - følg med på utviklingen'
            });
        }

        if (!item.hasSANumber) {
            assessments.push({
                type: 'info',
                text: 'Mangler SA-nummer - sjekk om dette er korrekt artikkel'
            });
        }

        if (assessments.length === 0) {
            assessments.push({
                type: 'ok',
                text: 'Ingen spesielle bekymringer identifisert'
            });
        }

        return assessments.map(a => `
            <div class="assessment-item ${a.type}">
                ${a.text}
            </div>
        `).join('');
    }

    /**
     * Eksporter til CSV
     */
    static exportCSV() {
        const analysis = this.analyzeAssortment(this.dataStore);
        let items;

        switch (this.currentView) {
            case 'slowMovers':
                items = analysis.slowMovers;
                break;
            case 'noSales':
                items = analysis.noSales;
                break;
            case 'inactive':
                items = analysis.inactive;
                break;
            case 'discontinued':
                items = analysis.discontinued;
                break;
            case 'candidates':
                items = analysis.candidates;
                break;
            default:
                items = analysis.slowMovers;
        }

        items = this.filterItems(items);
        const limit = this.currentLimit === 'all' ? items.length : parseInt(this.currentLimit);
        items = items.slice(0, limit);

        const headers = ['Artikelnr', 'SA-nummer', 'Beskrivelse', 'Leverandør', 'Lokasjon', 'Saldo', 'Solgt 12m', 'Dager til tomt', 'Est. verdi', 'Status', 'Statusbeskrivelse'];
        const rows = items.map(item => [
            item.toolsArticleNumber,
            item.saNumber || '',
            `"${(item.description || '').replace(/"/g, '""')}"`,
            `"${(item.supplier || '').replace(/"/g, '""')}"`,
            item.location || item.placementLocation || '',
            item.stock || 0,
            item.sales12m || 0,
            item.daysToEmpty === Infinity ? 'Uendelig' : (item.daysToEmpty || 0),
            item.estimatedValue || 0,
            item.status || '',
            item.statusText || ''
        ]);

        const csv = [headers.join(';'), ...rows.map(r => r.join(';'))].join('\n');
        const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `sortiment-${this.currentView}-${new Date().toISOString().split('T')[0]}.csv`;
        a.click();
        URL.revokeObjectURL(url);
    }
}

// Eksporter til global scope
window.AssortmentMode = AssortmentMode;
