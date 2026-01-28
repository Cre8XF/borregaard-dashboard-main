// ===================================
// MODUS 4: PLANLEGGING
// Viser: Hva må forberedes?
// ===================================

/**
 * PlanningMode - Planlegging og forberedelse
 *
 * Viser:
 * - Kritiske artikler per lokasjon
 * - Kommende bestillinger vs historisk salg
 * - Risikoartikler (høyt forbruk, lav saldo)
 * - Foreslått innkjøp
 */
class PlanningMode {
    static currentView = 'critical';
    static searchTerm = '';
    static dataStore = null;
    static currentLimit = 50;

    /**
     * Render planleggingsvisningen
     * @param {UnifiedDataStore} store - Data store med alle artikler
     * @returns {string} HTML content
     */
    static render(store) {
        this.dataStore = store;

        const planning = this.analyzePlanning(store);

        return `
            <div class="module-header">
                <h2>Planlegging</h2>
                <p class="module-description">Hva må forberedes?</p>
            </div>

            ${this.renderSummaryCards(planning)}

            <div class="view-tabs">
                <button class="view-tab ${this.currentView === 'critical' ? 'active' : ''}"
                        onclick="PlanningMode.switchView('critical')">
                    Kritiske artikler (${planning.criticalItems.length})
                </button>
                <button class="view-tab ${this.currentView === 'reorder' ? 'active' : ''}"
                        onclick="PlanningMode.switchView('reorder')">
                    Bestillingsforslag (${planning.reorderSuggestions.length})
                </button>
                <button class="view-tab ${this.currentView === 'incoming' ? 'active' : ''}"
                        onclick="PlanningMode.switchView('incoming')">
                    På vei inn (${planning.incomingItems.length})
                </button>
                <button class="view-tab ${this.currentView === 'risk' ? 'active' : ''}"
                        onclick="PlanningMode.switchView('risk')">
                    Risikoartikler (${planning.riskItems.length})
                </button>
            </div>

            <div class="module-controls">
                <div class="filter-group">
                    <label>Vis:</label>
                    <select id="limitFilter" class="filter-select" onchange="PlanningMode.handleLimitChange(this.value)">
                        <option value="20" ${this.currentLimit === 20 ? 'selected' : ''}>Top 20</option>
                        <option value="50" ${this.currentLimit === 50 ? 'selected' : ''}>Top 50</option>
                        <option value="100" ${this.currentLimit === 100 ? 'selected' : ''}>Top 100</option>
                        <option value="all" ${this.currentLimit === 'all' ? 'selected' : ''}>Alle</option>
                    </select>
                </div>
                <div class="search-group">
                    <input type="text" id="planningSearch" placeholder="Søk artikkel..."
                           class="search-input" value="${this.searchTerm}"
                           onkeyup="PlanningMode.handleSearch(this.value)">
                </div>
                <button onclick="PlanningMode.exportCSV()" class="btn-export">Eksporter CSV</button>
            </div>

            <div id="planningContent">
                ${this.renderCurrentView(planning)}
            </div>
        `;
    }

    /**
     * Analyser planleggingsbehov
     */
    static analyzePlanning(store) {
        const items = store.getAllItems();
        const planning = {
            criticalItems: [],
            reorderSuggestions: [],
            incomingItems: [],
            riskItems: [],
            totalIncoming: 0,
            criticalCount: 0
        };

        items.forEach(item => {
            // Kritiske artikler (tom eller under BP med salg)
            if (this.isCritical(item)) {
                planning.criticalItems.push({
                    ...item,
                    urgency: this.calculateUrgency(item),
                    reason: this.getCriticalReason(item)
                });
                planning.criticalCount++;
            }

            // Bestillingsforslag (under BP eller nærmer seg)
            const suggestion = this.getReorderSuggestion(item);
            if (suggestion) {
                planning.reorderSuggestions.push({
                    ...item,
                    ...suggestion
                });
            }

            // Artikler med innkommende bestillinger
            if (item.hasIncomingOrders && item.incomingOrders.length > 0) {
                const totalIncoming = item.incomingOrders.reduce((sum, o) => sum + (o.quantity || 0), 0);
                planning.incomingItems.push({
                    ...item,
                    incomingQuantity: totalIncoming,
                    incomingOrders: item.incomingOrders.length,
                    coverageDays: this.calculateCoverage(item, totalIncoming)
                });
                planning.totalIncoming += totalIncoming;
            }

            // Risikoartikler (høy etterspørsel, synkende beholdning)
            const risk = this.assessRisk(item);
            if (risk.score >= 3) {
                planning.riskItems.push({
                    ...item,
                    riskScore: risk.score,
                    riskFactors: risk.factors
                });
            }
        });

        // Sorter lister
        planning.criticalItems.sort((a, b) => b.urgency - a.urgency);
        planning.reorderSuggestions.sort((a, b) => b.priority - a.priority);
        planning.incomingItems.sort((a, b) => b.incomingQuantity - a.incomingQuantity);
        planning.riskItems.sort((a, b) => b.riskScore - a.riskScore);

        return planning;
    }

    /**
     * Sjekk om artikkel er kritisk
     */
    static isCritical(item) {
        // Tom med salg
        if (item.stock <= 0 && (item.sales12m || 0) > 0) return true;

        // Under BP med høyt salg
        if (item.bp > 0 && item.stock < item.bp && item.monthlyConsumption > 0) return true;

        // Mindre enn 14 dager til tomt med aktiv etterspørsel
        if (item.daysToEmpty < 14 && item.daysToEmpty !== 999999 && item.monthlyConsumption > 0) return true;

        return false;
    }

    /**
     * Beregn urgency score
     */
    static calculateUrgency(item) {
        let urgency = 0;

        if (item.stock <= 0) urgency += 5;
        else if (item.stock < item.bp) urgency += 3;

        if (item.daysToEmpty < 7) urgency += 4;
        else if (item.daysToEmpty < 14) urgency += 2;
        else if (item.daysToEmpty < 30) urgency += 1;

        if (item.monthlyConsumption > 100) urgency += 2;
        else if (item.monthlyConsumption > 50) urgency += 1;

        if (item.reserved > item.stock) urgency += 3;

        return urgency;
    }

    /**
     * Hent kritisk årsak
     */
    static getCriticalReason(item) {
        if (item.stock <= 0) return 'Tom beholdning';
        if (item.reserved > item.stock) return 'Reservert > saldo';
        if (item.stock < item.bp) return 'Under bestillingspunkt';
        if (item.daysToEmpty < 14) return 'Under 14 dager til tomt';
        return 'Kritisk nivå';
    }

    /**
     * Generer bestillingsforslag
     */
    static getReorderSuggestion(item) {
        // Kun artikler med aktivt salg
        if ((item.sales12m || 0) === 0) return null;

        // Sjekk om vi bør bestille
        const shouldReorder = item.stock <= item.bp ||
            item.daysToEmpty < 30 ||
            (item.available < item.monthlyConsumption * 2);

        if (!shouldReorder) return null;

        // Beregn foreslått mengde
        const targetStock = Math.max(item.max || item.bp * 2, item.monthlyConsumption * 3);
        const suggestedQty = Math.max(0, Math.ceil(targetStock - item.stock - this.getIncomingQty(item)));

        if (suggestedQty <= 0) return null;

        // Bestem prioritet
        let priority = 1;
        if (item.stock <= 0) priority = 5;
        else if (item.stock < item.bp) priority = 4;
        else if (item.daysToEmpty < 14) priority = 3;
        else if (item.daysToEmpty < 30) priority = 2;

        return {
            suggestedQty,
            priority,
            reason: this.getReorderReason(item),
            targetStock: Math.round(targetStock)
        };
    }

    /**
     * Hent innkommende mengde
     */
    static getIncomingQty(item) {
        if (!item.hasIncomingOrders) return 0;
        return item.incomingOrders.reduce((sum, o) => sum + (o.quantity || 0), 0);
    }

    /**
     * Hent bestillingsårsak
     */
    static getReorderReason(item) {
        if (item.stock <= 0) return 'Tom beholdning';
        if (item.stock < item.bp) return 'Under BP';
        if (item.daysToEmpty < 30) return 'Lav dekning';
        return 'Optimalisering';
    }

    /**
     * Beregn dekningsgrad
     */
    static calculateCoverage(item, incomingQty) {
        const totalAvailable = item.stock + incomingQty;
        if (item.monthlyConsumption <= 0) return 999;
        return Math.round(totalAvailable / (item.monthlyConsumption / 30)); // dager
    }

    /**
     * Vurder risiko
     */
    static assessRisk(item) {
        const factors = [];
        let score = 0;

        // Kun artikler med salg
        if ((item.sales12m || 0) === 0) return { score: 0, factors: [] };

        // Lav dekning
        if (item.daysToEmpty < 30 && item.daysToEmpty !== 999999) {
            score += 2;
            factors.push('Lav dekning (<30 dager)');
        }

        // Under BP uten innkommende
        if (item.stock < item.bp && !item.hasIncomingOrders) {
            score += 2;
            factors.push('Under BP, ingen bestillinger');
        }

        // Høy etterspørsel
        if (item.monthlyConsumption > 100) {
            score += 1;
            factors.push('Høy etterspørsel');
        }

        // Økende trend (6m > første 6m)
        const firstHalf = (item.sales12m || 0) - (item.sales6m || 0);
        if ((item.sales6m || 0) > firstHalf * 1.2) {
            score += 1;
            factors.push('Økende salg');
        }

        // Reservert > disponibel
        if (item.reserved > item.available) {
            score += 2;
            factors.push('Høy reservasjon');
        }

        // Kun én leverandør (antatt)
        if (item.orderCount > 5 && !item.hasIncomingOrders) {
            score += 0.5;
            factors.push('Mulig leveringsrisiko');
        }

        return { score, factors };
    }

    /**
     * Render sammendragskort
     */
    static renderSummaryCards(planning) {
        return `
            <div class="planning-summary">
                <div class="stat-card critical">
                    <div class="stat-value">${planning.criticalItems.length}</div>
                    <div class="stat-label">Kritiske</div>
                    <div class="stat-sub">Krever umiddelbar handling</div>
                </div>
                <div class="stat-card warning">
                    <div class="stat-value">${planning.reorderSuggestions.length}</div>
                    <div class="stat-label">Bestillingsforslag</div>
                    <div class="stat-sub">Bør vurderes</div>
                </div>
                <div class="stat-card ok">
                    <div class="stat-value">${this.formatNumber(planning.totalIncoming)}</div>
                    <div class="stat-label">På vei inn</div>
                    <div class="stat-sub">stk i bestilling</div>
                </div>
                <div class="stat-card">
                    <div class="stat-value">${planning.riskItems.length}</div>
                    <div class="stat-label">Risikoartikler</div>
                    <div class="stat-sub">Bør overvåkes</div>
                </div>
            </div>
        `;
    }

    /**
     * Render nåværende visning
     */
    static renderCurrentView(planning) {
        switch (this.currentView) {
            case 'critical':
                return this.renderCriticalItems(planning.criticalItems);
            case 'reorder':
                return this.renderReorderSuggestions(planning.reorderSuggestions);
            case 'incoming':
                return this.renderIncomingItems(planning.incomingItems);
            case 'risk':
                return this.renderRiskItems(planning.riskItems);
            default:
                return this.renderCriticalItems(planning.criticalItems);
        }
    }

    /**
     * Render kritiske artikler
     */
    static renderCriticalItems(items) {
        let filtered = this.filterItems(items);
        const limit = this.currentLimit === 'all' ? filtered.length : parseInt(this.currentLimit);
        const displayData = filtered.slice(0, limit);

        if (displayData.length === 0) {
            return `<div class="alert alert-success">Ingen kritiske artikler! Alt er under kontroll.</div>`;
        }

        return `
            <div class="view-insight critical">
                <p><strong>Kritiske artikler</strong> krever umiddelbar handling for å unngå leveringsproblemer.</p>
            </div>
            <div class="table-wrapper">
                <table class="data-table">
                    <thead>
                        <tr>
                            <th>Prioritet</th>
                            <th>Artikelnr</th>
                            <th>SA-nr</th>
                            <th>Beskrivelse</th>
                            <th>Saldo</th>
                            <th>BP</th>
                            <th>Dager til tomt</th>
                            <th>Årsak</th>
                            <th>Handling</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${displayData.map(item => `
                            <tr class="row-critical clickable" onclick="PlanningMode.showDetails('${item.toolsArticleNumber}')">
                                <td>${this.getPriorityBadge(item.urgency)}</td>
                                <td><strong>${item.toolsArticleNumber}</strong></td>
                                <td>${item.saNumber || '-'}</td>
                                <td>${this.truncate(item.description, 25)}</td>
                                <td class="qty-cell ${item.stock <= 0 ? 'negative' : ''}">${this.formatNumber(item.stock)}</td>
                                <td class="qty-cell">${item.bp || '-'}</td>
                                <td class="qty-cell warning">${item.daysToEmpty === 999999 ? '∞' : item.daysToEmpty}</td>
                                <td>${item.reason}</td>
                                <td><span class="recommendation critical">Bestill NÅ</span></td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
            <div class="table-footer">
                <p class="text-muted">Viser ${displayData.length} av ${filtered.length} kritiske artikler</p>
            </div>
        `;
    }

    /**
     * Render bestillingsforslag
     */
    static renderReorderSuggestions(items) {
        let filtered = this.filterItems(items);
        const limit = this.currentLimit === 'all' ? filtered.length : parseInt(this.currentLimit);
        const displayData = filtered.slice(0, limit);

        if (displayData.length === 0) {
            return `<div class="alert alert-success">Ingen bestillingsforslag. Lagernivåene er gode.</div>`;
        }

        const totalSuggested = displayData.reduce((sum, i) => sum + i.suggestedQty, 0);

        return `
            <div class="view-insight">
                <p><strong>Bestillingsforslag</strong> basert på salgstrender og lagernivåer.</p>
                <p class="text-muted">Total foreslått mengde: <strong>${this.formatNumber(totalSuggested)} stk</strong></p>
            </div>
            <div class="table-wrapper">
                <table class="data-table">
                    <thead>
                        <tr>
                            <th>Pri</th>
                            <th>Artikelnr</th>
                            <th>SA-nr</th>
                            <th>Beskrivelse</th>
                            <th>Saldo</th>
                            <th>Mnd. forbr.</th>
                            <th>Foreslått ant.</th>
                            <th>Årsak</th>
                            <th>Leverandør</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${displayData.map(item => `
                            <tr class="clickable" onclick="PlanningMode.showDetails('${item.toolsArticleNumber}')">
                                <td>${this.getPriorityBadge(item.priority)}</td>
                                <td><strong>${item.toolsArticleNumber}</strong></td>
                                <td>${item.saNumber || '-'}</td>
                                <td>${this.truncate(item.description, 25)}</td>
                                <td class="qty-cell">${this.formatNumber(item.stock)}</td>
                                <td class="qty-cell">${Math.round(item.monthlyConsumption)}</td>
                                <td class="qty-cell highlight">${this.formatNumber(item.suggestedQty)}</td>
                                <td>${item.reason}</td>
                                <td>${this.truncate(item.supplier, 15)}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
            <div class="table-footer">
                <p class="text-muted">Viser ${displayData.length} av ${filtered.length} forslag</p>
            </div>
        `;
    }

    /**
     * Render innkommende bestillinger
     */
    static renderIncomingItems(items) {
        let filtered = this.filterItems(items);
        const limit = this.currentLimit === 'all' ? filtered.length : parseInt(this.currentLimit);
        const displayData = filtered.slice(0, limit);

        if (displayData.length === 0) {
            return `<div class="alert alert-info">Ingen aktive innkommende bestillinger registrert.</div>`;
        }

        return `
            <div class="view-insight ok">
                <p><strong>Varer på vei</strong> - oversikt over åpne bestillinger fra leverandører.</p>
            </div>
            <div class="table-wrapper">
                <table class="data-table">
                    <thead>
                        <tr>
                            <th>Artikelnr</th>
                            <th>SA-nr</th>
                            <th>Beskrivelse</th>
                            <th>Nåv. saldo</th>
                            <th>På vei</th>
                            <th>Ant. bestillinger</th>
                            <th>Dekning etter</th>
                            <th>Status</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${displayData.map(item => {
                            const statusClass = item.stock <= 0 ? 'critical' : item.stock < item.bp ? 'warning' : 'ok';
                            return `
                                <tr class="clickable" onclick="PlanningMode.showDetails('${item.toolsArticleNumber}')">
                                    <td><strong>${item.toolsArticleNumber}</strong></td>
                                    <td>${item.saNumber || '-'}</td>
                                    <td>${this.truncate(item.description, 25)}</td>
                                    <td class="qty-cell ${item.stock <= 0 ? 'negative' : ''}">${this.formatNumber(item.stock)}</td>
                                    <td class="qty-cell positive">${this.formatNumber(item.incomingQuantity)}</td>
                                    <td class="qty-cell">${item.incomingOrders}</td>
                                    <td class="qty-cell">${item.coverageDays === 999 ? '∞' : item.coverageDays} dager</td>
                                    <td><span class="badge badge-${statusClass}">${statusClass === 'critical' ? 'HASTER' : statusClass === 'warning' ? 'FØLG OPP' : 'OK'}</span></td>
                                </tr>
                            `;
                        }).join('')}
                    </tbody>
                </table>
            </div>
            <div class="table-footer">
                <p class="text-muted">Viser ${displayData.length} av ${filtered.length} artikler med innkommende bestillinger</p>
            </div>
        `;
    }

    /**
     * Render risikoartikler
     */
    static renderRiskItems(items) {
        let filtered = this.filterItems(items);
        const limit = this.currentLimit === 'all' ? filtered.length : parseInt(this.currentLimit);
        const displayData = filtered.slice(0, limit);

        if (displayData.length === 0) {
            return `<div class="alert alert-success">Ingen høyrisikoartikler identifisert.</div>`;
        }

        return `
            <div class="view-insight warning">
                <p><strong>Risikoartikler</strong> har faktorer som kan føre til leveringsproblemer.</p>
                <p class="text-muted">Overvåk disse nøye og vurder proaktive tiltak.</p>
            </div>
            <div class="table-wrapper">
                <table class="data-table">
                    <thead>
                        <tr>
                            <th>Risiko</th>
                            <th>Artikelnr</th>
                            <th>SA-nr</th>
                            <th>Beskrivelse</th>
                            <th>Saldo</th>
                            <th>Mnd. forbr.</th>
                            <th>Risikofaktorer</th>
                            <th>Tiltak</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${displayData.map(item => `
                            <tr class="clickable" onclick="PlanningMode.showDetails('${item.toolsArticleNumber}')">
                                <td>${this.getRiskBadge(item.riskScore)}</td>
                                <td><strong>${item.toolsArticleNumber}</strong></td>
                                <td>${item.saNumber || '-'}</td>
                                <td>${this.truncate(item.description, 25)}</td>
                                <td class="qty-cell">${this.formatNumber(item.stock)}</td>
                                <td class="qty-cell">${Math.round(item.monthlyConsumption)}</td>
                                <td class="factors-cell">${item.riskFactors.slice(0, 2).join(', ')}</td>
                                <td><span class="recommendation warning">Overvåk</span></td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
            <div class="table-footer">
                <p class="text-muted">Viser ${displayData.length} av ${filtered.length} risikoartikler</p>
            </div>
        `;
    }

    /**
     * Filtrer items
     */
    static filterItems(items) {
        if (!this.searchTerm) return items;

        const term = this.searchTerm.toLowerCase();
        return items.filter(item =>
            item.toolsArticleNumber.toLowerCase().includes(term) ||
            (item.description && item.description.toLowerCase().includes(term)) ||
            (item.saNumber && item.saNumber.toLowerCase().includes(term))
        );
    }

    /**
     * Hjelpefunksjoner
     */
    static getPriorityBadge(priority) {
        if (priority >= 5) return '<span class="priority-badge p1">P1</span>';
        if (priority >= 4) return '<span class="priority-badge p2">P2</span>';
        if (priority >= 3) return '<span class="priority-badge p3">P3</span>';
        if (priority >= 2) return '<span class="priority-badge p4">P4</span>';
        return '<span class="priority-badge p5">P5</span>';
    }

    static getRiskBadge(score) {
        if (score >= 5) return '<span class="risk-badge high">HØY</span>';
        if (score >= 4) return '<span class="risk-badge medium">MIDDELS</span>';
        return '<span class="risk-badge low">LAV</span>';
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

        const incomingQty = this.getIncomingQty(item);

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
                                <strong>Lokasjon</strong>
                                ${item.location || item.shelf || '-'}
                            </div>
                        </div>
                    </div>

                    <div class="detail-section">
                        <h4>Lagerstatus</h4>
                        <div class="detail-grid">
                            <div class="detail-item ${item.stock <= 0 ? 'critical' : item.stock < item.bp ? 'warning' : ''}">
                                <strong>Saldo</strong>
                                ${this.formatNumber(item.stock)}
                            </div>
                            <div class="detail-item">
                                <strong>Reservert</strong>
                                ${this.formatNumber(item.reserved)}
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
                        <h4>Forbruk og dekning</h4>
                        <div class="detail-grid">
                            <div class="detail-item">
                                <strong>Månedlig forbruk</strong>
                                ${Math.round(item.monthlyConsumption || 0)} stk/mnd
                            </div>
                            <div class="detail-item ${item.daysToEmpty < 30 ? 'warning' : ''}">
                                <strong>Dager til tomt</strong>
                                ${item.daysToEmpty === 999999 ? '∞' : item.daysToEmpty}
                            </div>
                            <div class="detail-item">
                                <strong>Solgt 12 mnd</strong>
                                ${this.formatNumber(item.sales12m)}
                            </div>
                        </div>
                    </div>

                    ${incomingQty > 0 ? `
                        <div class="detail-section">
                            <h4>Innkommende bestillinger</h4>
                            <div class="incoming-summary">
                                <p><strong>${this.formatNumber(incomingQty)}</strong> stk på vei i <strong>${item.incomingOrders.length}</strong> bestilling(er)</p>
                            </div>
                        </div>
                    ` : ''}

                    <div class="detail-section">
                        <h4>Planleggingsanbefaling</h4>
                        <div class="planning-advice">
                            ${this.getPlanningAdvice(item)}
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
     * Hent planleggingsanbefaling
     */
    static getPlanningAdvice(item) {
        const advices = [];

        if (item.stock <= 0) {
            advices.push({
                type: 'critical',
                text: 'HASTER: Artikkelen er tom. Bestill umiddelbart eller finn alternativ.'
            });
        } else if (item.stock < item.bp) {
            advices.push({
                type: 'warning',
                text: 'Under bestillingspunkt. Legg inn bestilling snart.'
            });
        }

        if (item.daysToEmpty < 14 && item.daysToEmpty !== 999999) {
            advices.push({
                type: 'warning',
                text: `Kun ${item.daysToEmpty} dager til tomt ved nåværende tempo.`
            });
        }

        const incomingQty = this.getIncomingQty(item);
        if (incomingQty > 0) {
            const coverage = this.calculateCoverage(item, incomingQty);
            advices.push({
                type: 'info',
                text: `${this.formatNumber(incomingQty)} stk på vei - gir ${coverage === 999 ? 'god' : coverage + ' dagers'} dekning.`
            });
        }

        if (advices.length === 0) {
            advices.push({
                type: 'ok',
                text: 'Lagersituasjonen ser bra ut. Ingen umiddelbar handling nødvendig.'
            });
        }

        return advices.map(a => `
            <div class="advice-item ${a.type}">
                ${a.text}
            </div>
        `).join('');
    }

    /**
     * Eksporter til CSV
     */
    static exportCSV() {
        const planning = this.analyzePlanning(this.dataStore);
        let items;

        switch (this.currentView) {
            case 'critical':
                items = planning.criticalItems;
                break;
            case 'reorder':
                items = planning.reorderSuggestions;
                break;
            case 'incoming':
                items = planning.incomingItems;
                break;
            case 'risk':
                items = planning.riskItems;
                break;
            default:
                items = planning.criticalItems;
        }

        items = this.filterItems(items);
        const limit = this.currentLimit === 'all' ? items.length : parseInt(this.currentLimit);
        items = items.slice(0, limit);

        const headers = ['Artikelnr', 'SA-nummer', 'Beskrivelse', 'Saldo', 'BP', 'Mnd. forbruk', 'Dager til tomt', 'Leverandør'];
        const rows = items.map(item => [
            item.toolsArticleNumber,
            item.saNumber || '',
            `"${(item.description || '').replace(/"/g, '""')}"`,
            item.stock || 0,
            item.bp || 0,
            Math.round(item.monthlyConsumption || 0),
            item.daysToEmpty === 999999 ? 'Uendelig' : (item.daysToEmpty || 0),
            `"${(item.supplier || '').replace(/"/g, '""')}"`
        ]);

        const csv = [headers.join(';'), ...rows.map(r => r.join(';'))].join('\n');
        const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `planlegging-${this.currentView}-${new Date().toISOString().split('T')[0]}.csv`;
        a.click();
        URL.revokeObjectURL(url);
    }
}

// Eksporter til global scope
window.PlanningMode = PlanningMode;
