// ===================================
// MODUS 2: ETTERSPØRSEL & SALG
// Viser: Hva selges – og hva bør følges opp?
// ===================================

/**
 * DemandMode - Analyse av etterspørsel og salgsmønstre
 *
 * Viser:
 * - Top artikler (6/12 mnd)
 * - Gjentakende bestillinger (frekvens)
 * - Kundeavhengighet per artikkel
 * - Salgstrend og sesongvariasjon
 * - Leveringslager-trender (salg per leveringssted)
 * - Etterspørselskritiske artikler – 3018:
 *     Denne visningen brukes til å sikre at artikler med stabil etterspørsel
 *     mot flere leveringslagre alltid er tilgjengelige på hovedlager (3018),
 *     og ikke er utgående eller feil styrt.
 *     Erstatningslogikk og sortimentskoblinger kommer i senere fase.
 */
class DemandMode {
    static currentView = 'topSellers';
    static currentPeriod = '12m';
    static searchTerm = '';
    static sortColumn = 'sales';
    static sortDirection = 'desc';
    static dataStore = null;
    static currentLimit = 50;
    static currentDeliveryLocation = 'all';
    static currentCategory = 'all';

    /**
     * Render etterspørselsvisningen
     * @param {UnifiedDataStore} store - Data store med alle artikler
     * @returns {string} HTML content
     */
    static render(store) {
        this.dataStore = store;

        const stats = this.calculateStats(store);

        return `
            <div class="module-header">
                <h2>Etterspørsel & Salg</h2>
                <p class="module-description">Hva selges – og hva bør følges opp?</p>
            </div>

            ${this.renderSummaryCards(stats)}

            <div class="view-tabs">
                <button class="view-tab ${this.currentView === 'topSellers' ? 'active' : ''}"
                        onclick="DemandMode.switchView('topSellers')">
                    Toppsellere
                </button>
                <button class="view-tab ${this.currentView === 'frequency' ? 'active' : ''}"
                        onclick="DemandMode.switchView('frequency')">
                    Bestillingsfrekvens
                </button>
                <button class="view-tab ${this.currentView === 'customers' ? 'active' : ''}"
                        onclick="DemandMode.switchView('customers')">
                    Kundeavhengighet
                </button>
                <button class="view-tab ${this.currentView === 'trends' ? 'active' : ''}"
                        onclick="DemandMode.switchView('trends')">
                    Trender
                </button>
                <button class="view-tab ${this.currentView === 'warehouse' ? 'active' : ''}"
                        onclick="DemandMode.switchView('warehouse')">
                    Leveringslager-trender
                </button>
                <button class="view-tab ${this.currentView === 'critical' ? 'active' : ''}"
                        onclick="DemandMode.switchView('critical')">
                    Kritisk 3018
                </button>
            </div>

            <div class="module-controls">
                <div class="filter-group">
                    <label>Periode:</label>
                    <select id="periodFilter" class="filter-select" onchange="DemandMode.handlePeriodChange(this.value)">
                        <option value="6m" ${this.currentPeriod === '6m' ? 'selected' : ''}>Siste 6 mnd</option>
                        <option value="12m" ${this.currentPeriod === '12m' ? 'selected' : ''}>Siste 12 mnd</option>
                    </select>
                </div>
                ${this.currentView === 'warehouse' || this.currentView === 'critical' ? `
                <div class="filter-group">
                    <label>Leveringslager:</label>
                    <select id="deliveryLocationFilter" class="filter-select" onchange="DemandMode.handleDeliveryLocationChange(this.value)">
                        <option value="all" ${this.currentDeliveryLocation === 'all' ? 'selected' : ''}>Alle lagre</option>
                        ${this.getDeliveryLocations(store).map(loc =>
                            `<option value="${loc}" ${this.currentDeliveryLocation === loc ? 'selected' : ''}>${loc}</option>`
                        ).join('')}
                    </select>
                </div>
                <div class="filter-group">
                    <label>Kategori:</label>
                    <select id="whCategoryFilter" class="filter-select" onchange="DemandMode.handleCategoryChange(this.value)">
                        <option value="all" ${this.currentCategory === 'all' ? 'selected' : ''}>Alle kategorier</option>
                        ${this.getCategories(store).map(cat =>
                            `<option value="${cat}" ${this.currentCategory === cat ? 'selected' : ''}>${cat}</option>`
                        ).join('')}
                    </select>
                </div>
                ` : `
                <div class="filter-group">
                    <label>Vis:</label>
                    <select id="limitFilter" class="filter-select" onchange="DemandMode.handleLimitChange(this.value)">
                        <option value="20" ${this.currentLimit === 20 ? 'selected' : ''}>Top 20</option>
                        <option value="50" ${this.currentLimit === 50 ? 'selected' : ''}>Top 50</option>
                        <option value="100" ${this.currentLimit === 100 ? 'selected' : ''}>Top 100</option>
                        <option value="all" ${this.currentLimit === 'all' ? 'selected' : ''}>Alle</option>
                    </select>
                </div>
                `}
                <div class="search-group">
                    <input type="text" id="demandSearch" placeholder="Søk artikkel..."
                           class="search-input" value="${this.searchTerm}"
                           onkeyup="DemandMode.handleSearch(this.value)">
                </div>
                <button onclick="DemandMode.exportCSV()" class="btn-export">Eksporter CSV</button>
            </div>

            <div id="demandContent">
                ${this.renderCurrentView()}
            </div>
        `;
    }

    /**
     * Render sammendragskort
     */
    static renderSummaryCards(stats) {
        return `
            <div class="demand-summary">
                <div class="stat-card">
                    <div class="stat-value">${this.formatNumber(stats.totalSales)}</div>
                    <div class="stat-label">Totalt solgt (${this.currentPeriod})</div>
                </div>
                <div class="stat-card">
                    <div class="stat-value">${this.formatNumber(stats.activeArticles)}</div>
                    <div class="stat-label">Aktive artikler</div>
                </div>
                <div class="stat-card">
                    <div class="stat-value">${this.formatNumber(stats.totalOrders)}</div>
                    <div class="stat-label">Antall ordrer</div>
                </div>
                <div class="stat-card highlight">
                    <div class="stat-value">${stats.top10Share}%</div>
                    <div class="stat-label">Top 10 andel av salg</div>
                </div>
            </div>
        `;
    }

    /**
     * Beregn statistikk
     */
    static calculateStats(store) {
        const items = store.getAllItems();
        const salesField = this.currentPeriod === '6m' ? 'sales6m' : 'sales12m';

        let totalSales = 0;
        let totalOrders = 0;
        let activeArticles = 0;

        const salesByArticle = [];

        items.forEach(item => {
            const sales = item[salesField] || 0;
            if (sales > 0) {
                totalSales += sales;
                totalOrders += item.orderCount || 0;
                activeArticles++;
                salesByArticle.push(sales);
            }
        });

        // Beregn top 10 andel
        salesByArticle.sort((a, b) => b - a);
        const top10Sales = salesByArticle.slice(0, 10).reduce((sum, s) => sum + s, 0);
        const top10Share = totalSales > 0 ? Math.round((top10Sales / totalSales) * 100) : 0;

        return {
            totalSales,
            totalOrders,
            activeArticles,
            top10Share
        };
    }

    /**
     * Render nåværende visning
     */
    static renderCurrentView() {
        switch (this.currentView) {
            case 'topSellers':
                return this.renderTopSellers();
            case 'frequency':
                return this.renderFrequencyAnalysis();
            case 'customers':
                return this.renderCustomerDependency();
            case 'trends':
                return this.renderTrends();
            case 'warehouse':
                return this.renderWarehouseTrends();
            case 'critical':
                return this.renderCriticalDemand();
            default:
                return this.renderTopSellers();
        }
    }

    /**
     * Render toppsellere
     */
    static renderTopSellers() {
        const items = this.getFilteredItems();
        const salesField = this.currentPeriod === '6m' ? 'sales6m' : 'sales12m';

        // Sorter etter salg
        let sorted = [...items].sort((a, b) => (b[salesField] || 0) - (a[salesField] || 0));

        // Filtrer til kun artikler med salg
        sorted = sorted.filter(item => (item[salesField] || 0) > 0);

        // Begrens antall
        const limit = this.currentLimit === 'all' ? sorted.length : parseInt(this.currentLimit);
        const displayData = sorted.slice(0, limit);

        if (displayData.length === 0) {
            return `<div class="alert alert-info">Ingen salgsdata funnet for valgt periode.</div>`;
        }

        // Beregn totalsum for andel
        const totalSales = sorted.reduce((sum, item) => sum + (item[salesField] || 0), 0);

        return `
            <div class="table-wrapper">
                <table class="data-table">
                    <thead>
                        <tr>
                            <th>#</th>
                            <th class="sortable" onclick="DemandMode.handleSort('articleNumber')">
                                Artikelnr ${this.getSortIndicator('articleNumber')}
                            </th>
                            <th>SA-nr</th>
                            <th class="sortable" onclick="DemandMode.handleSort('description')">
                                Beskrivelse ${this.getSortIndicator('description')}
                            </th>
                            <th class="sortable" onclick="DemandMode.handleSort('sales')">
                                Solgt (${this.currentPeriod}) ${this.getSortIndicator('sales')}
                            </th>
                            <th>Andel</th>
                            <th class="sortable" onclick="DemandMode.handleSort('orders')">
                                Ordrer ${this.getSortIndicator('orders')}
                            </th>
                            <th class="sortable" onclick="DemandMode.handleSort('stock')">
                                Saldo ${this.getSortIndicator('stock')}
                            </th>
                            <th>Status</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${displayData.map((item, i) => {
                            const sales = item[salesField] || 0;
                            const share = totalSales > 0 ? ((sales / totalSales) * 100).toFixed(1) : 0;
                            return `
                                <tr class="clickable" onclick="DemandMode.showDetails('${item.toolsArticleNumber}')">
                                    <td>${i + 1}</td>
                                    <td><strong>${item.toolsArticleNumber}</strong></td>
                                    <td>${item.saNumber || '-'}</td>
                                    <td>${this.truncate(item.description, 35)}</td>
                                    <td class="qty-cell">${this.formatNumber(sales)}</td>
                                    <td class="qty-cell">${share}%</td>
                                    <td class="qty-cell">${item.orderCount || 0}</td>
                                    <td class="qty-cell ${item.stock < 0 ? 'negative' : ''}">${this.formatNumber(item.stock)}</td>
                                    <td>${this.getStockStatus(item)}</td>
                                </tr>
                            `;
                        }).join('')}
                    </tbody>
                </table>
            </div>
            <div class="table-footer">
                <p class="text-muted">Viser ${displayData.length} av ${sorted.length} artikler med salg</p>
            </div>
        `;
    }

    /**
     * Render bestillingsfrekvens-analyse
     */
    static renderFrequencyAnalysis() {
        const items = this.getFilteredItems();
        const salesField = this.currentPeriod === '6m' ? 'sales6m' : 'sales12m';
        const months = this.currentPeriod === '6m' ? 6 : 12;

        // Beregn frekvens (ordrer per måned)
        const withFrequency = items
            .filter(item => item.orderCount > 0)
            .map(item => ({
                ...item,
                frequency: item.orderCount / months,
                avgOrderSize: (item[salesField] || 0) / (item.orderCount || 1)
            }))
            .sort((a, b) => b.frequency - a.frequency);

        const limit = this.currentLimit === 'all' ? withFrequency.length : parseInt(this.currentLimit);
        const displayData = withFrequency.slice(0, limit);

        if (displayData.length === 0) {
            return `<div class="alert alert-info">Ingen ordredata funnet for analyse.</div>`;
        }

        return `
            <div class="frequency-insight">
                <div class="insight-card">
                    <h4>Hyppige bestillinger</h4>
                    <p>Artikler med høy bestillingsfrekvens kan være kandidater for økt BP eller lageravtale.</p>
                </div>
            </div>
            <div class="table-wrapper">
                <table class="data-table">
                    <thead>
                        <tr>
                            <th>#</th>
                            <th>Artikelnr</th>
                            <th>SA-nr</th>
                            <th>Beskrivelse</th>
                            <th>Ordrer/mnd</th>
                            <th>Totalt ordrer</th>
                            <th>Gj.snitt per ordre</th>
                            <th>Totalt solgt</th>
                            <th>Anbefaling</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${displayData.map((item, i) => {
                            const recommendation = this.getFrequencyRecommendation(item);
                            return `
                                <tr class="clickable" onclick="DemandMode.showDetails('${item.toolsArticleNumber}')">
                                    <td>${i + 1}</td>
                                    <td><strong>${item.toolsArticleNumber}</strong></td>
                                    <td>${item.saNumber || '-'}</td>
                                    <td>${this.truncate(item.description, 30)}</td>
                                    <td class="qty-cell highlight">${item.frequency.toFixed(1)}</td>
                                    <td class="qty-cell">${item.orderCount}</td>
                                    <td class="qty-cell">${Math.round(item.avgOrderSize)}</td>
                                    <td class="qty-cell">${this.formatNumber(item[salesField] || 0)}</td>
                                    <td><span class="recommendation ${recommendation.type}">${recommendation.text}</span></td>
                                </tr>
                            `;
                        }).join('')}
                    </tbody>
                </table>
            </div>
            <div class="table-footer">
                <p class="text-muted">Viser ${displayData.length} av ${withFrequency.length} artikler med ordrer</p>
            </div>
        `;
    }

    /**
     * Render kundeavhengighetsanalyse
     */
    static renderCustomerDependency() {
        const items = this.dataStore.getAllItems();

        // Analyser kundefordeling per artikkel
        const articleCustomers = [];

        items.forEach(item => {
            if (item.outgoingOrders.length === 0) return;

            // Tell unike kunder
            const customers = new Map();
            item.outgoingOrders.forEach(order => {
                const customer = order.customer || 'Ukjent';
                if (!customers.has(customer)) {
                    customers.set(customer, { count: 0, quantity: 0 });
                }
                customers.get(customer).count++;
                customers.get(customer).quantity += order.quantity || 0;
            });

            // Beregn konsentrasjon
            const totalQty = item.sales12m || 0;
            const customerArray = Array.from(customers.entries())
                .map(([name, data]) => ({
                    name,
                    ...data,
                    share: totalQty > 0 ? (data.quantity / totalQty) * 100 : 0
                }))
                .sort((a, b) => b.quantity - a.quantity);

            const topCustomerShare = customerArray[0]?.share || 0;

            articleCustomers.push({
                ...item,
                customerCount: customers.size,
                topCustomer: customerArray[0]?.name || '-',
                topCustomerShare: topCustomerShare,
                isConcentrated: topCustomerShare > 50
            });
        });

        // Sorter etter konsentrasjon (høyest først for å vise risiko)
        const sorted = articleCustomers
            .filter(a => a.customerCount > 0)
            .sort((a, b) => b.topCustomerShare - a.topCustomerShare);

        const limit = this.currentLimit === 'all' ? sorted.length : parseInt(this.currentLimit);
        const displayData = sorted.slice(0, limit);

        if (displayData.length === 0) {
            return `<div class="alert alert-info">Ingen kundedata tilgjengelig for analyse.</div>`;
        }

        const concentratedCount = sorted.filter(a => a.isConcentrated).length;

        return `
            <div class="dependency-insight">
                <div class="insight-card ${concentratedCount > 0 ? 'warning' : 'ok'}">
                    <h4>Kundeavhengighet</h4>
                    <p><strong>${concentratedCount}</strong> artikler har >50% av salget til én kunde.</p>
                    <p class="text-muted">Høy konsentrasjon = risiko ved kundefrafall</p>
                </div>
            </div>
            <div class="table-wrapper">
                <table class="data-table">
                    <thead>
                        <tr>
                            <th>Artikelnr</th>
                            <th>SA-nr</th>
                            <th>Beskrivelse</th>
                            <th>Ant. kunder</th>
                            <th>Største kunde</th>
                            <th>Kundeandel</th>
                            <th>Solgt 12m</th>
                            <th>Risiko</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${displayData.map(item => `
                            <tr class="${item.isConcentrated ? 'row-warning' : ''} clickable"
                                onclick="DemandMode.showDetails('${item.toolsArticleNumber}')">
                                <td><strong>${item.toolsArticleNumber}</strong></td>
                                <td>${item.saNumber || '-'}</td>
                                <td>${this.truncate(item.description, 30)}</td>
                                <td class="qty-cell">${item.customerCount}</td>
                                <td>${this.truncate(item.topCustomer, 20)}</td>
                                <td class="qty-cell ${item.topCustomerShare > 50 ? 'warning' : ''}">${item.topCustomerShare.toFixed(0)}%</td>
                                <td class="qty-cell">${this.formatNumber(item.sales12m || 0)}</td>
                                <td>${this.getDependencyRisk(item)}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
            <div class="table-footer">
                <p class="text-muted">Viser ${displayData.length} av ${sorted.length} artikler med kundedata</p>
            </div>
        `;
    }

    /**
     * Render trendanalyse
     */
    static renderTrends() {
        const items = this.dataStore.getAllItems();

        // Beregn trend (6m vs 12m sammenligning)
        const withTrend = items
            .filter(item => item.sales12m > 0)
            .map(item => {
                const sales6m = item.sales6m || 0;
                const sales12m = item.sales12m || 0;
                const firstHalf = sales12m - sales6m; // Første 6 mnd

                // Trend: positiv = økende, negativ = synkende
                let trend = 0;
                if (firstHalf > 0) {
                    trend = ((sales6m - firstHalf) / firstHalf) * 100;
                } else if (sales6m > 0) {
                    trend = 100; // Ny artikkel
                }

                return {
                    ...item,
                    sales6m,
                    firstHalf,
                    trend,
                    trendDirection: trend > 10 ? 'up' : trend < -10 ? 'down' : 'stable'
                };
            })
            .sort((a, b) => b.trend - a.trend);

        const rising = withTrend.filter(i => i.trendDirection === 'up').length;
        const falling = withTrend.filter(i => i.trendDirection === 'down').length;
        const stable = withTrend.filter(i => i.trendDirection === 'stable').length;

        const limit = this.currentLimit === 'all' ? withTrend.length : parseInt(this.currentLimit);
        const displayData = withTrend.slice(0, limit);

        return `
            <div class="trend-insight">
                <div class="trend-cards">
                    <div class="trend-card up">
                        <div class="trend-icon">↑</div>
                        <div class="trend-value">${rising}</div>
                        <div class="trend-label">Økende</div>
                    </div>
                    <div class="trend-card stable">
                        <div class="trend-icon">→</div>
                        <div class="trend-value">${stable}</div>
                        <div class="trend-label">Stabile</div>
                    </div>
                    <div class="trend-card down">
                        <div class="trend-icon">↓</div>
                        <div class="trend-value">${falling}</div>
                        <div class="trend-label">Synkende</div>
                    </div>
                </div>
                <p class="trend-note">Sammenligner siste 6 mnd mot foregående 6 mnd</p>
            </div>
            <div class="table-wrapper">
                <table class="data-table">
                    <thead>
                        <tr>
                            <th>Artikelnr</th>
                            <th>SA-nr</th>
                            <th>Beskrivelse</th>
                            <th>Første 6 mnd</th>
                            <th>Siste 6 mnd</th>
                            <th>Endring</th>
                            <th>Trend</th>
                            <th>Saldo</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${displayData.map(item => `
                            <tr class="clickable" onclick="DemandMode.showDetails('${item.toolsArticleNumber}')">
                                <td><strong>${item.toolsArticleNumber}</strong></td>
                                <td>${item.saNumber || '-'}</td>
                                <td>${this.truncate(item.description, 30)}</td>
                                <td class="qty-cell">${this.formatNumber(item.firstHalf)}</td>
                                <td class="qty-cell">${this.formatNumber(item.sales6m)}</td>
                                <td class="qty-cell ${item.trend > 0 ? 'positive' : item.trend < 0 ? 'negative' : ''}">${item.trend > 0 ? '+' : ''}${item.trend.toFixed(0)}%</td>
                                <td>${this.getTrendBadge(item.trendDirection)}</td>
                                <td class="qty-cell">${this.formatNumber(item.stock)}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
            <div class="table-footer">
                <p class="text-muted">Viser ${displayData.length} av ${withTrend.length} artikler med salgshistorikk</p>
            </div>
        `;
    }

    /**
     * Render leveringslager-trender
     */
    static renderWarehouseTrends() {
        const aggregated = this.aggregateByWarehouse();

        if (aggregated.length === 0) {
            return `<div class="alert alert-info">Ingen leveringslagerdata funnet for valgt periode og filtre.</div>`;
        }

        // Apply sorting
        const sorted = this.sortWarehouseItems(aggregated);

        return `
            <div class="table-wrapper">
                <table class="data-table">
                    <thead>
                        <tr>
                            <th class="sortable-header ${this.sortColumn === 'articleNumber' ? 'active' : ''}"
                                onclick="DemandMode.handleSort('articleNumber')">
                                Art.nr ${this.getSortIndicator('articleNumber')}
                            </th>
                            <th class="sortable-header ${this.sortColumn === 'description' ? 'active' : ''}"
                                onclick="DemandMode.handleSort('description')">
                                Beskrivelse ${this.getSortIndicator('description')}
                            </th>
                            <th class="sortable-header ${this.sortColumn === 'deliveryLocation' ? 'active' : ''}"
                                onclick="DemandMode.handleSort('deliveryLocation')">
                                Leveringslager ${this.getSortIndicator('deliveryLocation')}
                            </th>
                            <th class="sortable-header ${this.sortColumn === 'orderCount' ? 'active' : ''}"
                                onclick="DemandMode.handleSort('orderCount')">
                                Ordrer ${this.getSortIndicator('orderCount')}
                            </th>
                            <th class="sortable-header ${this.sortColumn === 'avgPerOrder' ? 'active' : ''}"
                                onclick="DemandMode.handleSort('avgPerOrder')">
                                Snitt pr ordre ${this.getSortIndicator('avgPerOrder')}
                            </th>
                            <th class="sortable-header ${this.sortColumn === 'totalQuantity' ? 'active' : ''}"
                                onclick="DemandMode.handleSort('totalQuantity')">
                                Totalt solgt ${this.getSortIndicator('totalQuantity')}
                            </th>
                        </tr>
                    </thead>
                    <tbody>
                        ${sorted.map(row => `
                            <tr class="clickable" onclick="DemandMode.showDetails('${row.toolsArticleNumber}')">
                                <td><strong>${row.toolsArticleNumber}</strong></td>
                                <td>${this.truncate(row.description, 35)}</td>
                                <td>${row.deliveryLocation || '-'}</td>
                                <td class="qty-cell">${row.orderCount}</td>
                                <td class="qty-cell">${Math.round(row.avgPerOrder)}</td>
                                <td class="qty-cell">${this.formatNumber(row.totalQuantity)}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
            <div class="table-footer">
                <p class="text-muted">Viser ${sorted.length} artikkel-lager-kombinasjoner</p>
            </div>
        `;
    }

    /**
     * Aggreger utgående ordrer per artikkel + leveringslager
     */
    static aggregateByWarehouse() {
        const items = this.dataStore.getAllItems();
        const periodMonths = this.currentPeriod === '6m' ? 6 : 12;
        const cutoffDate = new Date();
        cutoffDate.setMonth(cutoffDate.getMonth() - periodMonths);

        // Map key: "toolsArticleNumber|deliveryLocation"
        const aggregation = new Map();

        items.forEach(item => {
            // Apply category filter
            if (this.currentCategory !== 'all' && item.category !== this.currentCategory) {
                return;
            }

            // Apply search filter
            if (this.searchTerm) {
                const term = this.searchTerm.toLowerCase();
                const matches =
                    item.toolsArticleNumber.toLowerCase().includes(term) ||
                    (item.description && item.description.toLowerCase().includes(term)) ||
                    (item.saNumber && item.saNumber.toLowerCase().includes(term));
                if (!matches) return;
            }

            item.outgoingOrders.forEach(order => {
                // Period filter
                if (order.deliveryDate && order.deliveryDate < cutoffDate) return;

                const loc = order.deliveryLocation || 'Ukjent';

                // Apply delivery location filter
                if (this.currentDeliveryLocation !== 'all' && loc !== this.currentDeliveryLocation) {
                    return;
                }

                const key = `${item.toolsArticleNumber}|${loc}`;
                if (!aggregation.has(key)) {
                    aggregation.set(key, {
                        toolsArticleNumber: item.toolsArticleNumber,
                        description: item.description,
                        deliveryLocation: loc,
                        totalQuantity: 0,
                        orderCount: 0,
                        avgPerOrder: 0
                    });
                }

                const agg = aggregation.get(key);
                agg.totalQuantity += order.quantity || 0;
                agg.orderCount++;
            });
        });

        // Calculate averages
        aggregation.forEach(agg => {
            agg.avgPerOrder = agg.orderCount > 0 ? agg.totalQuantity / agg.orderCount : 0;
        });

        return Array.from(aggregation.values());
    }

    /**
     * Sorter leveringslager-resultater
     */
    static sortWarehouseItems(items) {
        const col = this.sortColumn;
        const dir = this.sortDirection === 'asc' ? 1 : -1;

        return [...items].sort((a, b) => {
            let valA, valB;
            switch (col) {
                case 'articleNumber':
                    valA = a.toolsArticleNumber || '';
                    valB = b.toolsArticleNumber || '';
                    return dir * valA.localeCompare(valB, 'nb');
                case 'description':
                    valA = a.description || '';
                    valB = b.description || '';
                    return dir * valA.localeCompare(valB, 'nb');
                case 'deliveryLocation':
                    valA = a.deliveryLocation || '';
                    valB = b.deliveryLocation || '';
                    return dir * valA.localeCompare(valB, 'nb');
                case 'orderCount':
                    return dir * ((a.orderCount || 0) - (b.orderCount || 0));
                case 'avgPerOrder':
                    return dir * ((a.avgPerOrder || 0) - (b.avgPerOrder || 0));
                case 'totalQuantity':
                    return dir * ((a.totalQuantity || 0) - (b.totalQuantity || 0));
                default:
                    return dir * ((a.totalQuantity || 0) - (b.totalQuantity || 0));
            }
        });
    }

    /**
     * Hent unike leveringslagre fra utgående ordrer
     */
    static getDeliveryLocations(store) {
        const locations = new Set();
        store.getAllItems().forEach(item => {
            item.outgoingOrders.forEach(order => {
                if (order.deliveryLocation && order.deliveryLocation.trim() !== '') {
                    locations.add(order.deliveryLocation.trim());
                }
            });
        });
        return Array.from(locations).sort((a, b) => a.localeCompare(b, 'nb'));
    }

    /**
     * Hent unike kategorier
     */
    static getCategories(store) {
        const categories = new Set();
        store.getAllItems().forEach(item => {
            if (item.category && item.category.toString().trim() !== '') {
                categories.add(item.category.toString().trim());
            }
        });
        return Array.from(categories).sort((a, b) => a.localeCompare(b, 'nb'));
    }

    /**
     * Analyser etterspørselskritiske artikler mot lager 3018
     *
     * Seleksjon (alle må være oppfylt):
     *   1. Har salg siste 12 mnd
     *   2. Selges til ≥ 2 ulike leveringslagre (LevPlFtgKod)
     *   3. Finnes i lagerbeholdning for lager 3018 (alle lagerbeholdningsdata er 3018)
     *
     * Risikovurdering:
     *   KRITISK – Utgående artikkel OG etterspørsel > 0
     *   RISIKO  – Aktiv artikkel + lav saldo (< 4 ukers snittforbruk)
     *   OK      – Aktiv artikkel + saldo > 0
     */
    static analyzeCriticalDemand() {
        const items = this.dataStore.getAllItems();
        const periodWeeks = 52; // alltid 12 mnd for denne visningen
        const cutoffDate = new Date();
        cutoffDate.setMonth(cutoffDate.getMonth() - 12);

        const results = [];

        items.forEach(item => {
            // Criterion 1: must have sales last 12 months
            if ((item.sales12m || 0) <= 0) return;

            // Apply category filter
            if (this.currentCategory !== 'all' && item.category !== this.currentCategory) {
                return;
            }

            // Apply search filter
            if (this.searchTerm) {
                const term = this.searchTerm.toLowerCase();
                const matches =
                    item.toolsArticleNumber.toLowerCase().includes(term) ||
                    (item.description && item.description.toLowerCase().includes(term)) ||
                    (item.saNumber && item.saNumber.toLowerCase().includes(term));
                if (!matches) return;
            }

            // Aggregate orders within 12 months
            const warehouseSet = new Set();
            let totalSold = 0;
            let orderCount = 0;

            item.outgoingOrders.forEach(order => {
                if (order.deliveryDate && order.deliveryDate < cutoffDate) return;

                const loc = order.deliveryLocation || 'Ukjent';

                // Apply delivery location filter
                if (this.currentDeliveryLocation !== 'all' && loc !== this.currentDeliveryLocation) {
                    return;
                }

                warehouseSet.add(loc);
                totalSold += order.quantity || 0;
                orderCount++;
            });

            if (orderCount === 0) return;

            const warehouseCount = warehouseSet.size;

            // Criterion 2: must be sold to ≥2 unique delivery warehouses
            if (warehouseCount < 2) return;

            const avgPerWeek = periodWeeks > 0 ? totalSold / periodWeeks : 0;
            const stock3018 = item.stock || 0;

            const articleStatus = item.isDiscontinued ? 'Utgående' : 'Aktiv';

            // Risk assessment (rule-based)
            let risk;
            if (item.isDiscontinued) {
                // Utgående artikkel med etterspørsel → alltid kritisk
                risk = 'CRITICAL';
            } else if (stock3018 <= 0 || (avgPerWeek > 0 && stock3018 < avgPerWeek * 4)) {
                // Aktiv artikkel med lav/tom saldo (< 4 ukers forbruk)
                risk = 'RISK';
            } else {
                // Aktiv artikkel med tilstrekkelig saldo
                risk = 'OK';
            }

            results.push({
                toolsArticleNumber: item.toolsArticleNumber,
                description: item.description,
                warehouseCount,
                orderCount,
                avgPerWeek,
                stock3018,
                articleStatus,
                risk
            });
        });

        return results;
    }

    /**
     * Render etterspørselskritiske artikler – 3018
     */
    static renderCriticalDemand() {
        const analyzed = this.analyzeCriticalDemand();

        if (analyzed.length === 0) {
            return `<div class="alert alert-info">Ingen artikler oppfyller kriteriene (salg 12 mnd + ≥2 leveringslagre) for valgt filtre.</div>`;
        }

        const sorted = this.sortCriticalItems(analyzed);

        const criticalCount = sorted.filter(r => r.risk === 'CRITICAL').length;
        const riskCount = sorted.filter(r => r.risk === 'RISK').length;

        return `
            <div class="critical-insight">
                <div class="insight-card ${criticalCount > 0 ? 'warning' : 'ok'}">
                    <h4>Etterspørselskritiske artikler – 3018</h4>
                    <p><strong>${criticalCount}</strong> kritiske og <strong>${riskCount}</strong> risikoartikler blant ${sorted.length} forsyningsartikler.</p>
                    <p class="text-muted">Artikler med salg siste 12 mnd som leveres til ≥ 2 leveringslagre</p>
                </div>
            </div>
            <div class="table-wrapper">
                <table class="data-table">
                    <thead>
                        <tr>
                            <th class="sortable-header ${this.sortColumn === 'articleNumber' ? 'active' : ''}"
                                onclick="DemandMode.handleSort('articleNumber')">
                                Art.nr ${this.getSortIndicator('articleNumber')}
                            </th>
                            <th class="sortable-header ${this.sortColumn === 'description' ? 'active' : ''}"
                                onclick="DemandMode.handleSort('description')">
                                Beskrivelse ${this.getSortIndicator('description')}
                            </th>
                            <th class="sortable-header ${this.sortColumn === 'warehouseCount' ? 'active' : ''}"
                                onclick="DemandMode.handleSort('warehouseCount')">
                                Ant. lev.lagre ${this.getSortIndicator('warehouseCount')}
                            </th>
                            <th class="sortable-header ${this.sortColumn === 'orderCount' ? 'active' : ''}"
                                onclick="DemandMode.handleSort('orderCount')">
                                Ordrer (12 mnd) ${this.getSortIndicator('orderCount')}
                            </th>
                            <th class="sortable-header ${this.sortColumn === 'avgPerWeek' ? 'active' : ''}"
                                onclick="DemandMode.handleSort('avgPerWeek')">
                                Snitt pr uke ${this.getSortIndicator('avgPerWeek')}
                            </th>
                            <th class="sortable-header ${this.sortColumn === 'stock3018' ? 'active' : ''}"
                                onclick="DemandMode.handleSort('stock3018')">
                                Saldo 3018 ${this.getSortIndicator('stock3018')}
                            </th>
                            <th class="sortable-header ${this.sortColumn === 'status' ? 'active' : ''}"
                                onclick="DemandMode.handleSort('status')">
                                Artikkelstatus ${this.getSortIndicator('status')}
                            </th>
                            <th class="sortable-header ${this.sortColumn === 'risk' ? 'active' : ''}"
                                onclick="DemandMode.handleSort('risk')">
                                Risikovurdering ${this.getSortIndicator('risk')}
                            </th>
                        </tr>
                    </thead>
                    <tbody>
                        ${sorted.map(row => {
                            const rowClass = row.risk === 'CRITICAL' ? 'row-critical' : row.risk === 'RISK' ? 'row-warning' : '';
                            return `
                            <tr class="${rowClass} clickable" onclick="DemandMode.showDetails('${row.toolsArticleNumber}')">
                                <td><strong>${row.toolsArticleNumber}</strong></td>
                                <td>${this.truncate(row.description, 30)}</td>
                                <td class="qty-cell">${row.warehouseCount}</td>
                                <td class="qty-cell">${row.orderCount}</td>
                                <td class="qty-cell">${row.avgPerWeek.toFixed(1)}</td>
                                <td class="qty-cell ${row.stock3018 <= 0 ? 'negative' : ''}">${this.formatNumber(row.stock3018)}</td>
                                <td>${row.articleStatus === 'Utgående' ? '<span class="badge badge-critical">Utgående</span>' : '<span class="badge badge-ok">Aktiv</span>'}</td>
                                <td>${this.getCriticalRiskBadge(row.risk)}</td>
                            </tr>
                            `;
                        }).join('')}
                    </tbody>
                </table>
            </div>
            <div class="table-footer">
                <p class="text-muted">Viser ${sorted.length} forsyningsartikler (kritisk: ${criticalCount}, risiko: ${riskCount}, ok: ${sorted.length - criticalCount - riskCount})</p>
            </div>
        `;
    }

    /**
     * Sorter etterspørselskritiske resultater
     */
    static sortCriticalItems(items) {
        const col = this.sortColumn;
        const dir = this.sortDirection === 'asc' ? 1 : -1;

        return [...items].sort((a, b) => {
            let valA, valB;
            switch (col) {
                case 'articleNumber':
                    valA = a.toolsArticleNumber || '';
                    valB = b.toolsArticleNumber || '';
                    return dir * valA.localeCompare(valB, 'nb');
                case 'description':
                    valA = a.description || '';
                    valB = b.description || '';
                    return dir * valA.localeCompare(valB, 'nb');
                case 'warehouseCount':
                    return dir * ((a.warehouseCount || 0) - (b.warehouseCount || 0));
                case 'orderCount':
                    return dir * ((a.orderCount || 0) - (b.orderCount || 0));
                case 'avgPerWeek':
                    return dir * ((a.avgPerWeek || 0) - (b.avgPerWeek || 0));
                case 'stock3018':
                    return dir * ((a.stock3018 || 0) - (b.stock3018 || 0));
                case 'status':
                    valA = a.articleStatus || '';
                    valB = b.articleStatus || '';
                    return dir * valA.localeCompare(valB, 'nb');
                case 'risk': {
                    const riskOrder = { 'CRITICAL': 0, 'RISK': 1, 'OK': 2 };
                    return dir * ((riskOrder[a.risk] ?? 2) - (riskOrder[b.risk] ?? 2));
                }
                default: {
                    // Default: sort by risk (CRITICAL first)
                    const riskOrder = { 'CRITICAL': 0, 'RISK': 1, 'OK': 2 };
                    return (riskOrder[a.risk] ?? 2) - (riskOrder[b.risk] ?? 2);
                }
            }
        });
    }

    /**
     * Risk badge for critical demand view
     */
    static getCriticalRiskBadge(risk) {
        if (risk === 'CRITICAL') {
            return '<span class="badge badge-critical">KRITISK</span>';
        } else if (risk === 'RISK') {
            return '<span class="badge badge-warning">RISIKO</span>';
        }
        return '<span class="badge badge-ok">OK</span>';
    }

    /**
     * Hent filtrerte items
     */
    static getFilteredItems() {
        let items = this.dataStore.getAllItems();

        if (this.searchTerm) {
            const term = this.searchTerm.toLowerCase();
            items = items.filter(item =>
                item.toolsArticleNumber.toLowerCase().includes(term) ||
                (item.description && item.description.toLowerCase().includes(term)) ||
                (item.saNumber && item.saNumber.toLowerCase().includes(term))
            );
        }

        return items;
    }

    /**
     * Hjelpefunksjoner
     */
    static getStockStatus(item) {
        if (item.stock <= 0) {
            return '<span class="badge badge-critical">TOM</span>';
        }
        const monthlyConsumption = item.monthlyConsumption || 0;
        if (monthlyConsumption > 0 && item.stock < monthlyConsumption * 2) {
            return '<span class="badge badge-warning">LAV</span>';
        }
        return '<span class="badge badge-ok">OK</span>';
    }

    static getFrequencyRecommendation(item) {
        if (item.frequency >= 2) {
            return { type: 'high', text: 'Vurder økt BP' };
        } else if (item.frequency >= 1) {
            return { type: 'medium', text: 'Følg opp' };
        }
        return { type: 'low', text: 'OK' };
    }

    static getDependencyRisk(item) {
        if (item.topCustomerShare > 80) {
            return '<span class="badge badge-critical">HØY</span>';
        } else if (item.topCustomerShare > 50) {
            return '<span class="badge badge-warning">MIDDELS</span>';
        }
        return '<span class="badge badge-ok">LAV</span>';
    }

    static getTrendBadge(direction) {
        if (direction === 'up') {
            return '<span class="badge badge-ok">↑ ØKENDE</span>';
        } else if (direction === 'down') {
            return '<span class="badge badge-warning">↓ SYNKENDE</span>';
        }
        return '<span class="badge badge-info">→ STABIL</span>';
    }

    static getSortIndicator(column) {
        if (this.sortColumn !== column) return '';
        return this.sortDirection === 'asc' ? '↑' : '↓';
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

        // Reset sort state to sensible default per view
        if (view === 'critical') {
            this.sortColumn = 'risk';
            this.sortDirection = 'asc';
        } else if (view === 'warehouse') {
            this.sortColumn = 'totalQuantity';
            this.sortDirection = 'desc';
        } else if (['totalQuantity', 'avgPerOrder', 'deliveryLocation', 'warehouseCount', 'avgPerWeek', 'stock3018', 'risk'].includes(this.sortColumn)) {
            this.sortColumn = 'sales';
            this.sortDirection = 'desc';
        }

        // Full re-render to update controls (filters change per view)
        this.refreshAll();
    }

    static handlePeriodChange(period) {
        this.currentPeriod = period;
        this.refreshAll();
    }

    static handleLimitChange(limit) {
        this.currentLimit = limit === 'all' ? 'all' : parseInt(limit);
        this.updateContent();
    }

    static handleSearch(term) {
        this.searchTerm = term;
        this.updateContent();
    }

    static handleSort(column) {
        if (this.sortColumn === column) {
            this.sortDirection = this.sortDirection === 'asc' ? 'desc' : 'asc';
        } else {
            this.sortColumn = column;
            this.sortDirection = ['description', 'articleNumber', 'deliveryLocation', 'status'].includes(column) ? 'asc' : 'desc';
        }
        this.updateContent();
    }

    static handleDeliveryLocationChange(location) {
        this.currentDeliveryLocation = location;
        this.updateContent();
    }

    static handleCategoryChange(category) {
        this.currentCategory = category;
        this.updateContent();
    }

    static updateContent() {
        const container = document.getElementById('demandContent');
        if (container) {
            container.innerHTML = this.renderCurrentView();
        }
    }

    static refreshAll() {
        // Re-render hele modulen
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

        const salesField = this.currentPeriod === '6m' ? 'sales6m' : 'sales12m';
        const sales = item[salesField] || 0;

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
                        </div>
                    </div>

                    <div class="detail-section">
                        <h4>Salgsstatistikk</h4>
                        <div class="detail-grid">
                            <div class="detail-item highlight">
                                <strong>Solgt ${this.currentPeriod}</strong>
                                ${this.formatNumber(sales)} stk
                            </div>
                            <div class="detail-item">
                                <strong>Solgt 12 mnd</strong>
                                ${this.formatNumber(item.sales12m)} stk
                            </div>
                            <div class="detail-item">
                                <strong>Antall ordrer</strong>
                                ${item.orderCount || 0}
                            </div>
                            <div class="detail-item">
                                <strong>Månedlig forbruk</strong>
                                ${(item.monthlyConsumption || 0).toFixed(1)} stk/mnd
                            </div>
                        </div>
                    </div>

                    <div class="detail-section">
                        <h4>Lagerstatus</h4>
                        <div class="detail-grid">
                            <div class="detail-item ${item.stock < 0 ? 'critical' : ''}">
                                <strong>Saldo</strong>
                                ${this.formatNumber(item.stock)}
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
                                <strong>Dager til tomt</strong>
                                ${item.daysToEmpty === 999999 ? '∞' : item.daysToEmpty}
                            </div>
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
     * Eksporter til CSV
     */
    static exportCSV() {
        if (this.currentView === 'critical') {
            return this.exportCriticalCSV();
        }

        const items = this.getFilteredItems();
        const salesField = this.currentPeriod === '6m' ? 'sales6m' : 'sales12m';

        const sorted = [...items]
            .filter(item => (item[salesField] || 0) > 0)
            .sort((a, b) => (b[salesField] || 0) - (a[salesField] || 0));

        const limit = this.currentLimit === 'all' ? sorted.length : parseInt(this.currentLimit);
        const data = sorted.slice(0, limit);

        const headers = ['Rang', 'Artikelnr', 'SA-nummer', 'Beskrivelse', `Solgt ${this.currentPeriod}`, 'Ordrer', 'Saldo', 'Leverandør'];
        const rows = data.map((item, i) => [
            i + 1,
            item.toolsArticleNumber,
            item.saNumber || '',
            `"${(item.description || '').replace(/"/g, '""')}"`,
            item[salesField] || 0,
            item.orderCount || 0,
            item.stock || 0,
            `"${(item.supplier || '').replace(/"/g, '""')}"`
        ]);

        this.downloadCSV(headers, rows, `ettersporsel-${this.currentView}`);
    }

    /**
     * Eksporter kritisk 3018-visning til CSV
     */
    static exportCriticalCSV() {
        const analyzed = this.analyzeCriticalDemand();
        const sorted = this.sortCriticalItems(analyzed);

        const headers = ['Art.nr', 'Beskrivelse', 'Leveringslagre (antall)', 'Ordrer (12 mnd)', 'Snitt pr uke', 'Saldo 3018', 'Artikkelstatus', 'Risikovurdering'];
        const rows = sorted.map(row => [
            row.toolsArticleNumber,
            `"${(row.description || '').replace(/"/g, '""')}"`,
            row.warehouseCount,
            row.orderCount,
            row.avgPerWeek.toFixed(1),
            row.stock3018,
            row.articleStatus,
            row.risk === 'CRITICAL' ? 'KRITISK' : row.risk === 'RISK' ? 'RISIKO' : 'OK'
        ]);

        this.downloadCSV(headers, rows, 'etterspørselskritisk-3018');
    }

    /**
     * Felles CSV-nedlasting
     */
    static downloadCSV(headers, rows, filenameBase) {
        const csv = [headers.join(';'), ...rows.map(r => r.join(';'))].join('\n');
        const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${filenameBase}-${new Date().toISOString().split('T')[0]}.csv`;
        a.click();
        URL.revokeObjectURL(url);
    }
}

// Eksporter til global scope
window.DemandMode = DemandMode;
