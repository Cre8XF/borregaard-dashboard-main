// ===================================
// MODUS 1: OVERSIKT - DAGLIG KONTROLL
// Viser: Hva er galt nå?
// ===================================

/**
 * OverviewMode - Daglig kontrollvisning
 *
 * Viser:
 * - Negativ saldo
 * - Under bestillingspunkt (BP)
 * - Reservert > saldo
 * - Artikler uten bevegelse
 * - Manglende SA-nummer (datakvalitet)
 * - Åpne bestillinger på vei
 */
class OverviewMode {
    static currentFilter = 'all';
    static searchTerm = '';
    static sortColumn = 'severity';
    static sortDirection = 'desc';
    static dataStore = null;

    /**
     * Render oversiktsvisningen
     * @param {UnifiedDataStore} store - Data store med alle artikler
     * @returns {string} HTML content
     */
    static render(store) {
        this.dataStore = store;

        const issues = this.collectAllIssues(store);
        const summary = this.calculateSummary(issues);

        return `
            <div class="module-header">
                <h2>Oversikt - Daglig kontroll</h2>
                <p class="module-description">Hva krever oppmerksomhet akkurat nå?</p>
            </div>

            ${this.renderSummaryCards(summary)}

            <div class="module-controls">
                <div class="filter-group">
                    <label>Filter:</label>
                    <select id="issueFilter" class="filter-select" onchange="OverviewMode.handleFilterChange(this.value)">
                        <option value="all" ${this.currentFilter === 'all' ? 'selected' : ''}>Alle problemer (${issues.length})</option>
                        <option value="critical" ${this.currentFilter === 'critical' ? 'selected' : ''}>Kritiske (${summary.critical})</option>
                        <option value="warning" ${this.currentFilter === 'warning' ? 'selected' : ''}>Advarsler (${summary.warning})</option>
                        <option value="info" ${this.currentFilter === 'info' ? 'selected' : ''}>Info (${summary.info})</option>
                        <option value="data" ${this.currentFilter === 'data' ? 'selected' : ''}>Datakvalitet (${summary.data})</option>
                    </select>
                </div>
                <div class="search-group">
                    <input type="text" id="overviewSearch" placeholder="Søk artikkel..."
                           class="search-input" value="${this.searchTerm}"
                           onkeyup="OverviewMode.handleSearch(this.value)">
                </div>
                <button onclick="OverviewMode.exportCSV()" class="btn-export">Eksporter CSV</button>
            </div>

            <div id="overviewContent">
                ${this.renderIssuesTable(issues)}
            </div>

            ${this.renderDataQuality(store.getDataQualityReport())}
            ${this.renderIncomingOrders(store)}
            ${this.renderBelowBPSection(store)}
            ${this.renderMissingBPEOKSection(store)}
            ${this.renderOutgoingWithStockSection(store)}
        `;
    }

    /**
     * Render sammendragskort
     */
    static renderSummaryCards(summary) {
        return `
            <div class="overview-summary">
                <div class="issue-card critical" onclick="OverviewMode.handleFilterChange('critical')">
                    <div class="issue-count">${summary.critical}</div>
                    <div class="issue-label">Kritiske</div>
                    <div class="issue-desc">Krever umiddelbar handling</div>
                </div>
                <div class="issue-card warning" onclick="OverviewMode.handleFilterChange('warning')">
                    <div class="issue-count">${summary.warning}</div>
                    <div class="issue-label">Advarsler</div>
                    <div class="issue-desc">Bør følges opp</div>
                </div>
                <div class="issue-card info" onclick="OverviewMode.handleFilterChange('info')">
                    <div class="issue-count">${summary.info}</div>
                    <div class="issue-label">Info</div>
                    <div class="issue-desc">Til orientering</div>
                </div>
                <div class="issue-card data" onclick="OverviewMode.handleFilterChange('data')">
                    <div class="issue-count">${summary.data}</div>
                    <div class="issue-label">Datakvalitet</div>
                    <div class="issue-desc">Manglende data</div>
                </div>
            </div>
        `;
    }

    /**
     * Samle alle issues fra SA-artikler (operativt univers)
     */
    static collectAllIssues(store) {
        const allIssues = [];

        // FASE 6: Kun SA-artikler i issue-listen
        store.getActiveItems().forEach(item => {
            const issues = item.getIssues();
            issues.forEach(issue => {
                allIssues.push({
                    ...issue,
                    item: item.toDisplayObject()
                });
            });
        });

        return allIssues;
    }

    /**
     * Beregn sammendrag
     */
    static calculateSummary(issues) {
        return {
            total: issues.length,
            critical: issues.filter(i => i.type === 'critical').length,
            warning: issues.filter(i => i.type === 'warning').length,
            info: issues.filter(i => i.type === 'info').length,
            data: issues.filter(i => i.type === 'data').length
        };
    }

    /**
     * Render issues-tabell
     */
    static renderIssuesTable(issues) {
        let filtered = issues;

        // Filtrer på type
        if (this.currentFilter !== 'all') {
            filtered = filtered.filter(i => i.type === this.currentFilter);
        }

        // Filtrer på søk
        if (this.searchTerm) {
            const term = this.searchTerm.toLowerCase();
            filtered = filtered.filter(i =>
                i.item.toolsArticleNumber.toLowerCase().includes(term) ||
                (i.item.description && i.item.description.toLowerCase().includes(term)) ||
                (i.item.saNumber && i.item.saNumber.toLowerCase().includes(term))
            );
        }

        // Sorter
        filtered = this.sortIssues(filtered);

        if (filtered.length === 0) {
            return `
                <div class="alert alert-success">
                    <strong>Ingen problemer funnet!</strong>
                    ${this.currentFilter !== 'all' ? 'Prøv å endre filteret.' : 'Alt ser bra ut.'}
                </div>
            `;
        }

        return `
            <div class="table-wrapper">
                <table class="data-table issues-table">
                    <thead>
                        <tr>
                            <th class="sortable" onclick="OverviewMode.handleSort('type')">
                                Type ${this.getSortIndicator('type')}
                            </th>
                            <th class="sortable" onclick="OverviewMode.handleSort('articleNumber')">
                                Artikelnr ${this.getSortIndicator('articleNumber')}
                            </th>
                            <th>SA-nr</th>
                            <th class="sortable" onclick="OverviewMode.handleSort('description')">
                                Beskrivelse ${this.getSortIndicator('description')}
                            </th>
                            <th>Problem</th>
                            <th class="sortable" onclick="OverviewMode.handleSort('stock')">
                                Saldo ${this.getSortIndicator('stock')}
                            </th>
                            <th>BP</th>
                            <th>Handling</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${filtered.map(issue => this.renderIssueRow(issue)).join('')}
                    </tbody>
                </table>
            </div>
            <div class="table-footer">
                <p class="text-muted">Viser ${filtered.length} av ${issues.length} problemer</p>
            </div>
        `;
    }

    /**
     * Render enkelt issue-rad
     */
    static renderIssueRow(issue) {
        const item = issue.item;
        const severityClass = this.getSeverityClass(issue.type);
        const action = this.getSuggestedAction(issue);

        return `
            <tr class="${severityClass}" onclick="OverviewMode.showDetails('${item.toolsArticleNumber}')">
                <td>
                    <span class="badge badge-${issue.type}">${this.getTypeLabel(issue.type)}</span>
                </td>
                <td><strong>${item.toolsArticleNumber}</strong></td>
                <td>${item.saNumber || '-'}</td>
                <td>${this.truncate(item.description, 35)}</td>
                <td>${issue.message}</td>
                <td class="qty-cell ${item.stock < 0 ? 'negative' : ''}">${this.formatNumber(item.stock)}</td>
                <td class="qty-cell">${item.bp || '-'}</td>
                <td><span class="action-hint">${action}</span></td>
            </tr>
        `;
    }

    /**
     * Render datakvalitetsrapport
     */
    static renderDataQuality(report) {
        return `
            <div class="data-quality-section">
                <h3>Datakvalitet (SA-artikler)</h3>
                <div class="quality-grid">
                    <div class="quality-item">
                        <span class="quality-label">SA-artikler (operativt univers):</span>
                        <span class="quality-value">${this.formatNumber(report.activeArticles)}</span>
                    </div>
                    <div class="quality-item">
                        <span class="quality-label">Totalt i Master:</span>
                        <span class="quality-value">${this.formatNumber(report.totalArticles)}</span>
                    </div>
                    <div class="quality-item">
                        <span class="quality-label">SA-dekning av Master:</span>
                        <span class="quality-value">${report.saNumberCoverage}%</span>
                    </div>
                    <div class="quality-item">
                        <span class="quality-label">SA-artikler med innkommende:</span>
                        <span class="quality-value">${this.formatNumber(report.activeWithIncoming)}</span>
                    </div>
                    <div class="quality-item">
                        <span class="quality-label">SA-artikler med salgshistorikk:</span>
                        <span class="quality-value">${this.formatNumber(report.activeWithOutgoing)}</span>
                    </div>
                </div>
            </div>
        `;
    }

    /**
     * Render innkommende bestillinger (kun SA-artikler)
     */
    static renderIncomingOrders(store) {
        // FASE 6: Kun SA-artikler
        const itemsWithIncoming = store.getActiveItems()
            .filter(item => item.hasIncomingOrders && item.incomingOrders.length > 0)
            .sort((a, b) => {
                const aQty = a.incomingOrders.reduce((sum, o) => sum + o.quantity, 0);
                const bQty = b.incomingOrders.reduce((sum, o) => sum + o.quantity, 0);
                return bQty - aQty;
            })
            .slice(0, 10);

        if (itemsWithIncoming.length === 0) {
            return '';
        }

        return `
            <div class="incoming-orders-section">
                <h3>Bestillinger på vei (topp 10)</h3>
                <div class="table-wrapper">
                    <table class="data-table compact">
                        <thead>
                            <tr>
                                <th>Artikelnr</th>
                                <th>Beskrivelse</th>
                                <th>Nåværende saldo</th>
                                <th>Antall på vei</th>
                                <th>Antall bestillinger</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${itemsWithIncoming.map(item => {
                                const totalIncoming = item.incomingOrders.reduce((sum, o) => sum + o.quantity, 0);
                                return `
                                    <tr onclick="OverviewMode.showDetails('${item.toolsArticleNumber}')">
                                        <td><strong>${item.toolsArticleNumber}</strong></td>
                                        <td>${this.truncate(item.description, 30)}</td>
                                        <td class="qty-cell">${this.formatNumber(item.stock)}</td>
                                        <td class="qty-cell positive">${this.formatNumber(totalIncoming)}</td>
                                        <td class="qty-cell">${item.incomingOrders.length}</td>
                                    </tr>
                                `;
                            }).join('')}
                        </tbody>
                    </table>
                </div>
            </div>
        `;
    }

    // ════════════════════════════════════════════════════
    //  FASE 4: NYE SEKSJONER (uten å fjerne gamle)
    // ════════════════════════════════════════════════════

    /**
     * Seksjon 1: Under bestillingspunkt
     * Artikler der lagersaldo < bestillingspunkt (BP fra Analyse_Lagerplan.xlsx)
     * Vises kun dersom BP-data er lastet.
     */
    static renderBelowBPSection(store) {
        // FASE 6: Kun SA-artikler
        const activeItems = store.getActiveItems();
        const items = activeItems.filter(item =>
            item.bestillingspunkt !== null &&
            item.bestillingspunkt > 0 &&
            item.stock < item.bestillingspunkt
        );

        // Ikke vis seksjonen dersom ingen SA-artikler har BP satt
        const anyBP = activeItems.some(i => i.bestillingspunkt !== null);
        if (!anyBP) return '';

        return `
            <div class="new-section below-bp-section">
                <h3>Under bestillingspunkt (${items.length})</h3>
                <p class="section-description">SA-artikler der lagersaldo er under BP fra Analyse_Lagerplan.xlsx. Bør bestilles.</p>
                ${items.length === 0
                    ? '<div class="alert alert-success">Alle artikler er over bestillingspunkt.</div>'
                    : `
                    <div class="table-wrapper">
                        <table class="data-table compact">
                            <thead>
                                <tr>
                                    <th>Artikelnr</th>
                                    <th>SA-nr</th>
                                    <th>Beskrivelse</th>
                                    <th>Saldo</th>
                                    <th>BP</th>
                                    <th>Manko</th>
                                    <th>EOK</th>
                                    <th>Status</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${items
                                    .sort((a, b) => (a.stock - a.bestillingspunkt) - (b.stock - b.bestillingspunkt))
                                    .slice(0, 50)
                                    .map(item => `
                                    <tr class="severity-warning clickable" onclick="OverviewMode.showDetails('${item.toolsArticleNumber}')">
                                        <td><strong>${item.toolsArticleNumber}</strong></td>
                                        <td>${item.saNumber || '-'}</td>
                                        <td>${this.truncate(item.description, 30)}</td>
                                        <td class="qty-cell ${item.stock <= 0 ? 'negative' : ''}">${this.formatNumber(item.stock)}</td>
                                        <td class="qty-cell">${this.formatNumber(item.bestillingspunkt)}</td>
                                        <td class="qty-cell negative">${this.formatNumber(item.stock - item.bestillingspunkt)}</td>
                                        <td class="qty-cell">${item.ordrekvantitet !== null ? this.formatNumber(item.ordrekvantitet) : '-'}</td>
                                        <td>${item._status}</td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    </div>
                    <div class="table-footer">
                        <p class="text-muted">Viser ${Math.min(items.length, 50)} av ${items.length} artikler under BP</p>
                    </div>
                `}
            </div>
        `;
    }

    /**
     * Seksjon 2: Mangler BP / EOK
     * Artikler med SA-nummer men uten planleggingsparametre.
     * Indikerer kritiske hull i planleggingsdata.
     */
    static renderMissingBPEOKSection(store) {
        // FASE 6: Kun SA-artikler (alle i activeItems har allerede SA)
        const activeItems = store.getActiveItems();

        // Kun relevant dersom Analyse_Lagerplan er lastet
        const anyPlanningData = activeItems.some(i =>
            i.bestillingspunkt !== null || i.ordrekvantitet !== null
        );
        if (!anyPlanningData) return '';

        const itemsMissingBP = activeItems.filter(item =>
            item.bestillingspunkt === null &&
            item.sales12m > 0
        );

        const itemsMissingEOK = activeItems.filter(item =>
            item.ordrekvantitet === null &&
            item.sales12m > 0
        );

        // Unik kombinasjon: mangler begge
        const missingBoth = activeItems.filter(item =>
            item.bestillingspunkt === null &&
            item.ordrekvantitet === null &&
            item.sales12m > 0
        );

        return `
            <div class="new-section missing-planning-section">
                <h3>Mangler planleggingsdata (BP / EOK)</h3>
                <p class="section-description">SA-artikler med salg men uten BP og/eller EOK fra Analyse_Lagerplan. Kritiske hull i planlegging.</p>
                <div class="planning-gap-summary">
                    <div class="stat-card warning">
                        <div class="stat-value">${itemsMissingBP.length}</div>
                        <div class="stat-label">Mangler BP</div>
                    </div>
                    <div class="stat-card warning">
                        <div class="stat-value">${itemsMissingEOK.length}</div>
                        <div class="stat-label">Mangler EOK</div>
                    </div>
                    <div class="stat-card critical">
                        <div class="stat-value">${missingBoth.length}</div>
                        <div class="stat-label">Mangler begge</div>
                    </div>
                </div>
                ${missingBoth.length > 0 ? `
                    <div class="table-wrapper">
                        <table class="data-table compact">
                            <thead>
                                <tr>
                                    <th>Artikelnr</th>
                                    <th>SA-nr</th>
                                    <th>Beskrivelse</th>
                                    <th>Saldo</th>
                                    <th>Solgt 12m</th>
                                    <th>Mnd. forbr.</th>
                                    <th>Mangler</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${missingBoth
                                    .sort((a, b) => b.sales12m - a.sales12m)
                                    .slice(0, 50)
                                    .map(item => `
                                    <tr class="severity-warning clickable" onclick="OverviewMode.showDetails('${item.toolsArticleNumber}')">
                                        <td><strong>${item.toolsArticleNumber}</strong></td>
                                        <td>${item.saNumber || '-'}</td>
                                        <td>${this.truncate(item.description, 30)}</td>
                                        <td class="qty-cell">${this.formatNumber(item.stock)}</td>
                                        <td class="qty-cell">${this.formatNumber(item.sales12m)}</td>
                                        <td class="qty-cell">${Math.round(item.monthlyConsumption)}</td>
                                        <td>BP + EOK</td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    </div>
                    <div class="table-footer">
                        <p class="text-muted">Viser ${Math.min(missingBoth.length, 50)} av ${missingBoth.length} artikler uten BP og EOK (sortert etter salg)</p>
                    </div>
                ` : '<div class="alert alert-success">Alle SA-artikler med salg har planleggingsdata.</div>'}
            </div>
        `;
    }

    /**
     * Seksjon 3: Utgående med saldo
     * Artikler med status UTGAENDE eller UTGAATT som fortsatt har lagersaldo > 0.
     * Disse binder kapital og bør selges ut eller avhendes.
     */
    static renderOutgoingWithStockSection(store) {
        // FASE 6: Kun SA-artikler
        const items = store.getActiveItems().filter(item =>
            (item._status === 'UTGAENDE' || item._status === 'UTGAATT') &&
            item.stock > 0
        );

        if (items.length === 0) return '';

        const totalValue = items.reduce((sum, i) => sum + (i.estimertVerdi || 0), 0);

        return `
            <div class="new-section outgoing-stock-section">
                <h3>Utgående artikler med saldo (${items.length})</h3>
                <p class="section-description">
                    SA-artikler under utfasing som fortsatt har lagersaldo. Binder kapital.
                    ${totalValue > 0 ? `Estimert bundet verdi: <strong>${this.formatNumber(totalValue)} kr</strong>` : ''}
                </p>
                <div class="table-wrapper">
                    <table class="data-table compact">
                        <thead>
                            <tr>
                                <th>Artikelnr</th>
                                <th>SA-nr</th>
                                <th>Beskrivelse</th>
                                <th>Status</th>
                                <th>Saldo</th>
                                <th>Estimert verdi</th>
                                <th>Erstatter</th>
                                <th>Solgt 12m</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${items
                                .sort((a, b) => (b.estimertVerdi || 0) - (a.estimertVerdi || 0))
                                .slice(0, 50)
                                .map(item => `
                                <tr class="severity-info clickable" onclick="OverviewMode.showDetails('${item.toolsArticleNumber}')">
                                    <td><strong>${item.toolsArticleNumber}</strong></td>
                                    <td>${item.saNumber || '-'}</td>
                                    <td>${this.truncate(item.description, 30)}</td>
                                    <td><span class="badge badge-warning">${item._status}</span></td>
                                    <td class="qty-cell">${this.formatNumber(item.stock)}</td>
                                    <td class="qty-cell">${this.formatNumber(item.estimertVerdi || 0)} kr</td>
                                    <td>${item.ersattAvArtikel || '-'}</td>
                                    <td class="qty-cell">${this.formatNumber(item.sales12m)}</td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
                <div class="table-footer">
                    <p class="text-muted">Viser ${Math.min(items.length, 50)} av ${items.length} utgående artikler med saldo</p>
                </div>
            </div>
        `;
    }

    /**
     * Sorter issues
     */
    static sortIssues(issues) {
        const severityOrder = { critical: 0, warning: 1, info: 2, data: 3 };

        return [...issues].sort((a, b) => {
            let aVal, bVal;

            switch (this.sortColumn) {
                case 'type':
                case 'severity':
                    aVal = severityOrder[a.type] || 99;
                    bVal = severityOrder[b.type] || 99;
                    break;
                case 'articleNumber':
                    aVal = a.item.toolsArticleNumber || '';
                    bVal = b.item.toolsArticleNumber || '';
                    break;
                case 'description':
                    aVal = a.item.description || '';
                    bVal = b.item.description || '';
                    break;
                case 'stock':
                    aVal = a.item.stock || 0;
                    bVal = b.item.stock || 0;
                    break;
                default:
                    aVal = severityOrder[a.type] || 99;
                    bVal = severityOrder[b.type] || 99;
            }

            if (typeof aVal === 'string') {
                return this.sortDirection === 'asc'
                    ? aVal.localeCompare(bVal, 'no')
                    : bVal.localeCompare(aVal, 'no');
            }

            return this.sortDirection === 'asc' ? aVal - bVal : bVal - aVal;
        });
    }

    /**
     * Hent foreslått handling
     */
    static getSuggestedAction(issue) {
        const actions = {
            'NEGATIVE_STOCK': 'Sjekk tellefeil eller uregistrert uttak',
            'BELOW_BP': 'Vurder bestilling',
            'OVERRESERVED': 'Sjekk reservasjoner',
            'NO_MOVEMENT': 'Vurder utfasing',
            'NO_SA_NUMBER': 'Registrer SA-nummer',
            'EMPTY_WITH_INCOMING': 'Avvent leveranse'
        };
        return actions[issue.code] || '-';
    }

    /**
     * Hent type-etikett
     */
    static getTypeLabel(type) {
        const labels = {
            critical: 'KRITISK',
            warning: 'ADVARSEL',
            info: 'INFO',
            data: 'DATA'
        };
        return labels[type] || type.toUpperCase();
    }

    /**
     * Hent severity-klasse
     */
    static getSeverityClass(type) {
        return `severity-${type}`;
    }

    /**
     * Hent sorterings-indikator
     */
    static getSortIndicator(column) {
        if (this.sortColumn !== column) return '';
        return this.sortDirection === 'asc' ? '↑' : '↓';
    }

    /**
     * Håndter filterendring
     */
    static handleFilterChange(filter) {
        this.currentFilter = filter;

        // Oppdater dropdown
        const dropdown = document.getElementById('issueFilter');
        if (dropdown) dropdown.value = filter;

        this.updateContent();
    }

    /**
     * Håndter søk
     */
    static handleSearch(term) {
        this.searchTerm = term;
        this.updateContent();
    }

    /**
     * Håndter sortering
     */
    static handleSort(column) {
        if (this.sortColumn === column) {
            this.sortDirection = this.sortDirection === 'asc' ? 'desc' : 'asc';
        } else {
            this.sortColumn = column;
            this.sortDirection = column === 'description' || column === 'articleNumber' ? 'asc' : 'desc';
        }
        this.updateContent();
    }

    /**
     * Oppdater tabellinnhold
     */
    static updateContent() {
        const container = document.getElementById('overviewContent');
        if (container && this.dataStore) {
            const issues = this.collectAllIssues(this.dataStore);
            container.innerHTML = this.renderIssuesTable(issues);
        }
    }

    /**
     * Vis artikkeldetaljer
     */
    static showDetails(articleNumber) {
        if (!this.dataStore) return;

        const item = this.dataStore.items.get(articleNumber);
        if (!item) return;

        const display = item.toDisplayObject();
        const issues = item.getIssues();

        const modal = document.createElement('div');
        modal.className = 'modal-overlay';
        modal.innerHTML = `
            <div class="modal-content modal-large">
                <div class="modal-header">
                    <h3>${item.toolsArticleNumber}</h3>
                    ${item.saNumber ? `<span class="sa-badge">SA: ${item.saNumber}${item.saType ? ' (' + item.saType + ')' : ''}</span>` : ''}
                    <button class="modal-close" onclick="this.closest('.modal-overlay').remove()">×</button>
                </div>
                <div class="modal-body">
                    <div class="detail-section">
                        <h4>Grunndata</h4>
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
                                <strong>Lokasjon</strong>
                                ${item.location || item.shelf || '-'}
                            </div>
                            <div class="detail-item">
                                <strong>Status</strong>
                                ${item.status || '-'}
                            </div>
                        </div>
                    </div>

                    ${item.saNumber ? `
                    <div class="detail-section">
                        <h4>SA-avtale</h4>
                        <div class="detail-grid">
                            <div class="detail-item">
                                <strong>SA-nummer</strong>
                                ${item.saNumber}
                            </div>
                            <div class="detail-item">
                                <strong>SA-type</strong>
                                ${item.saType || '-'}
                            </div>
                            <div class="detail-item">
                                <strong>Gyldig fra</strong>
                                ${display.saGyldigFra ? this.formatDate(display.saGyldigFra) : '-'}
                            </div>
                            <div class="detail-item">
                                <strong>Gyldig til</strong>
                                ${display.saGyldigTil ? this.formatDate(display.saGyldigTil) : '-'}
                            </div>
                        </div>
                    </div>
                    ` : ''}

                    <div class="detail-section">
                        <h4>Lagerstatus</h4>
                        <div class="detail-grid">
                            <div class="detail-item ${item.stock < 0 ? 'critical' : ''}">
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
                                <strong>BP</strong>
                                ${item.bp || '-'}
                            </div>
                            <div class="detail-item">
                                <strong>Max</strong>
                                ${item.max || '-'}
                            </div>
                        </div>
                    </div>

                    <div class="detail-section">
                        <h4>Salgsstatistikk</h4>
                        <div class="detail-grid">
                            <div class="detail-item">
                                <strong>Solgt 12 mnd</strong>
                                ${this.formatNumber(display.sales12m)}
                            </div>
                            <div class="detail-item">
                                <strong>Solgt 6 mnd</strong>
                                ${this.formatNumber(display.sales6m)}
                            </div>
                            <div class="detail-item">
                                <strong>Antall ordre</strong>
                                ${display.orderCount}
                            </div>
                            <div class="detail-item">
                                <strong>Månedlig forbruk</strong>
                                ${display.monthlyConsumption.toFixed(1)}
                            </div>
                            <div class="detail-item">
                                <strong>Dager til tomt</strong>
                                ${display.daysToEmpty === 999999 ? '∞' : display.daysToEmpty}
                            </div>
                            <div class="detail-item">
                                <strong>Siste salg</strong>
                                ${display.lastSaleDate ? this.formatDate(display.lastSaleDate) : '-'}
                            </div>
                        </div>
                    </div>

                    ${display.incomingOrderCount > 0 ? `
                        <div class="detail-section">
                            <h4>Innkommende bestillinger</h4>
                            <p>${display.incomingOrderCount} bestillinger, totalt ${this.formatNumber(display.incomingQuantity)} stk på vei</p>
                        </div>
                    ` : ''}

                    ${issues.length > 0 ? `
                        <div class="detail-section">
                            <h4>Aktive problemer</h4>
                            <ul class="issue-list">
                                ${issues.map(i => `
                                    <li class="issue-item ${i.type}">
                                        <span class="badge badge-${i.type}">${this.getTypeLabel(i.type)}</span>
                                        ${i.message}
                                    </li>
                                `).join('')}
                            </ul>
                        </div>
                    ` : ''}
                </div>
                <div class="modal-footer">
                    <button class="btn-secondary" onclick="this.closest('.modal-overlay').remove()">Lukk</button>
                </div>
            </div>
        `;

        document.body.appendChild(modal);
    }

    /**
     * Eksporter til CSV
     */
    static exportCSV() {
        if (!this.dataStore) return;

        const issues = this.collectAllIssues(this.dataStore);
        let filtered = issues;

        if (this.currentFilter !== 'all') {
            filtered = filtered.filter(i => i.type === this.currentFilter);
        }

        if (this.searchTerm) {
            const term = this.searchTerm.toLowerCase();
            filtered = filtered.filter(i =>
                i.item.toolsArticleNumber.toLowerCase().includes(term) ||
                (i.item.description && i.item.description.toLowerCase().includes(term))
            );
        }

        const headers = ['Type', 'Artikelnr', 'SA-nummer', 'Beskrivelse', 'Problem', 'Saldo', 'BP', 'Handling'];
        const rows = filtered.map(issue => [
            this.getTypeLabel(issue.type),
            issue.item.toolsArticleNumber,
            issue.item.saNumber || '',
            `"${(issue.item.description || '').replace(/"/g, '""')}"`,
            issue.message,
            issue.item.stock,
            issue.item.bp || '',
            this.getSuggestedAction(issue)
        ]);

        const csv = [headers.join(';'), ...rows.map(r => r.join(';'))].join('\n');
        const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `oversikt-problemer-${new Date().toISOString().split('T')[0]}.csv`;
        a.click();
        URL.revokeObjectURL(url);
    }

    /**
     * Hjelpefunksjoner
     */
    static formatNumber(num) {
        if (num === null || num === undefined) return '-';
        return Math.round(num).toLocaleString('nb-NO');
    }

    static truncate(text, maxLength) {
        if (!text) return '-';
        return text.length > maxLength ? text.substring(0, maxLength) + '...' : text;
    }

    static formatDate(date) {
        if (!date) return '-';
        if (typeof date === 'string') return date;
        try {
            return date.toLocaleDateString('nb-NO');
        } catch {
            return '-';
        }
    }

    /**
     * Hent antall issues for sammendragskort
     */
    static getIssueCount(store) {
        return this.collectAllIssues(store).filter(i => i.type === 'critical' || i.type === 'warning').length;
    }
}

// Eksporter til global scope
window.OverviewMode = OverviewMode;
