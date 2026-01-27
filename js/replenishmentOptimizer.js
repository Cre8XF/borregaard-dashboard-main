// ===================================
// REPLENISHMENT OPTIMIZER - BP Analysis
// Intelligent bestillingspunkt optimization
// Combines Butler, Sales, and Purchase data
// ===================================

/**
 * ReplenishmentOptimizer - Analyzes and optimizes reorder points (BP)
 * Combines 3 data sources: Butler inventory, Sales orders, Purchase orders
 */
class ReplenishmentOptimizer {
    // Column mappings for each data source
    static BUTLER_COLUMNS = {
        itemNo: ['Artikelnr', 'Item No', 'ItemNo', 'Article No', 'Item ID'],
        description: ['Artikelbeskrivning', 'Description', 'Beskrivelse', 'Item'],
        stock: ['Lagersaldo', 'Stock', 'Saldo', 'Qty'],
        available: ['DispLagSaldo', 'Available', 'Disponibel'],
        reserved: ['ReservAnt', 'Reserved', 'Reservert'],
        bp: ['BP', 'Bestillingspunkt', 'Reorder Point', 'ROP'],
        max: ['Maxlager', 'Max', 'Maximum', 'Max Stock'],
        status: ['Artikelstatus', 'Status', 'Item Status'],
        warehouse: ['LstK', 'Warehouse', 'Lager', 'Location'],
        supplier: ['Supplier Name', 'Leverandor', 'Leverandør', 'Supplier'],
        supplierNo: ['SupplierNo', 'Leverandornr', 'Supplier No'],
        r12Sales: ['R12 Del Qty', 'R12 Sales', 'Rolling 12'],
        onOrder: ['BestAntLev', 'On Order', 'På ordre', 'Ordered'],
        shelf: ['Hylla 1', 'Shelf', 'Hylle', 'Location'],
        purchaseGroup: ['Purchase order group', 'Innkjøpsgruppe']
    };

    static SALES_COLUMNS = {
        itemNo: ['Item ID', 'Artikelnr', 'Item No', 'ItemNo'],
        description: ['Item', 'Description', 'Beskrivelse'],
        date: ['Date', 'Dato', 'Order Date', 'Delivery Date'],
        quantity: ['Delivered quantity', 'Quantity', 'Antall', 'Qty'],
        value: ['Delivered value', 'Value', 'Verdi', 'Amount'],
        customer: ['Customer ID', 'Kunde', 'Customer'],
        deliveryLocation: ['Delivery location ID', 'Location', 'Leveringssted'],
        orderNo: ['Order number', 'Ordrenr', 'Order No']
    };

    static PURCHASE_COLUMNS = {
        itemNo: ['Main item ID', 'Item ID', 'Artikelnr', 'Item No'],
        description: ['Item', 'Description', 'Beskrivelse'],
        date: ['Order date', 'Date', 'Dato', 'Bestillingsdato'],
        quantity: ['Order intake quantity', 'Quantity', 'Antall', 'Qty'],
        value: ['Order intake', 'Value', 'Verdi', 'Amount'],
        supplier: ['Supplier', 'Leverandor', 'Leverandør'],
        status: ['Item status', 'Status'],
        orderNo: ['Order number', 'Ordrenr', 'Order No'],
        customer: ['Customer ID', 'Kunde'],
        deliveryLocation: ['Delivery location ID', 'Location'],
        spec: ['Order specification text', 'Spec', 'Specification']
    };

    // Risk categories
    static RISK_CATEGORIES = {
        BP_TOO_LOW: { level: 'critical', icon: '🔴', priority: 1 },
        TOO_MANY_ORDERS: { level: 'warning', icon: '🟡', priority: 2 },
        BP_OPTIMAL: { level: 'ok', icon: '🟢', priority: 3 },
        BP_TOO_HIGH: { level: 'info', icon: '⚪', priority: 4 },
        UNKNOWN: { level: 'unknown', icon: '❓', priority: 5 }
    };

    /**
     * Main update method - called by app.js
     */
    static update(butlerData, salesData, purchaseData) {
        const resultsDiv = document.getElementById('replenishmentResults');
        const statusBadge = document.getElementById('replenishmentStatus');
        const tabsContainer = document.querySelector('.replenishment-tabs');
        const placeholder = document.querySelector('#replenishmentModule .placeholder');

        // Check if we have any data
        const hasButler = butlerData && butlerData.length > 0;
        const hasSales = salesData && salesData.length > 0;
        const hasPurchases = purchaseData && purchaseData.length > 0;

        if (!hasButler && !hasSales && !hasPurchases) {
            if (placeholder) placeholder.style.display = 'block';
            if (tabsContainer) tabsContainer.style.display = 'none';
            if (resultsDiv) resultsDiv.innerHTML = '';
            if (statusBadge) {
                statusBadge.textContent = 'Ingen data';
                statusBadge.className = 'status-badge';
            }
            return;
        }

        // Show loading state
        if (resultsDiv) {
            resultsDiv.innerHTML = `
                <div style="text-align: center; padding: 40px;">
                    <div class="loading-spinner"></div>
                    <p style="margin-top: 15px; color: var(--text-muted);">Analyserer data...</p>
                </div>
            `;
        }

        // Process data after a brief delay for UI feedback
        setTimeout(() => {
            this.processData(butlerData, salesData, purchaseData, resultsDiv, statusBadge, tabsContainer, placeholder);
        }, 100);
    }

    /**
     * Process and analyze all data
     */
    static processData(butlerData, salesData, purchaseData, resultsDiv, statusBadge, tabsContainer, placeholder) {
        // Enrich data with standardized fields
        const enrichedButler = this.enrichButlerData(butlerData || []);
        const enrichedSales = this.enrichSalesData(salesData || []);
        const enrichedPurchases = this.enrichPurchaseData(purchaseData || []);

        // Match items across all 3 data sources
        const matchedItems = this.matchItems(enrichedButler, enrichedSales, enrichedPurchases);

        // Analyze each item
        const analyzedItems = matchedItems.map(item => this.analyzeItem(item));

        // Categorize by risk
        const categories = this.categorizeByRisk(analyzedItems);

        // Store for export
        this.lastAnalysis = {
            items: analyzedItems,
            categories,
            timestamp: new Date().toISOString()
        };

        // Update UI
        if (placeholder) placeholder.style.display = 'none';
        if (tabsContainer) tabsContainer.style.display = 'flex';

        // Update status badge
        const criticalCount = categories.critical.length;
        const warningCount = categories.warning.length;
        const totalMatched = analyzedItems.filter(i => i.hasAllData).length;

        if (statusBadge) {
            if (criticalCount > 0) {
                statusBadge.textContent = `${criticalCount} kritiske`;
                statusBadge.className = 'status-badge critical';
            } else if (warningCount > 0) {
                statusBadge.textContent = `${warningCount} advarsler`;
                statusBadge.className = 'status-badge warning';
            } else {
                statusBadge.textContent = `${totalMatched} artikler`;
                statusBadge.className = 'status-badge ok';
            }
        }

        // Setup tabs and render initial view
        this.setupTabs(categories, analyzedItems, resultsDiv);
        this.renderView('critical', categories, analyzedItems, resultsDiv);
    }

    /**
     * Enrich Butler data with standardized fields
     */
    static enrichButlerData(data) {
        return data.map(row => {
            const enriched = { ...row };

            // Map to standardized fields
            enriched._itemNo = String(this.findValue(row, this.BUTLER_COLUMNS.itemNo) || '').trim();
            enriched._description = this.findValue(row, this.BUTLER_COLUMNS.description) || '';
            enriched._stock = parseFloat(this.findValue(row, this.BUTLER_COLUMNS.stock)) || 0;
            enriched._available = parseFloat(this.findValue(row, this.BUTLER_COLUMNS.available)) || 0;
            enriched._reserved = parseFloat(this.findValue(row, this.BUTLER_COLUMNS.reserved)) || 0;
            enriched._bp = parseFloat(this.findValue(row, this.BUTLER_COLUMNS.bp)) || 0;
            enriched._max = parseFloat(this.findValue(row, this.BUTLER_COLUMNS.max)) || 0;
            enriched._status = this.findValue(row, this.BUTLER_COLUMNS.status);
            enriched._warehouse = String(this.findValue(row, this.BUTLER_COLUMNS.warehouse) || '');
            enriched._supplier = this.findValue(row, this.BUTLER_COLUMNS.supplier) || '';
            enriched._supplierNo = this.findValue(row, this.BUTLER_COLUMNS.supplierNo) || '';
            enriched._r12Sales = parseFloat(this.findValue(row, this.BUTLER_COLUMNS.r12Sales)) || 0;
            enriched._onOrder = parseFloat(this.findValue(row, this.BUTLER_COLUMNS.onOrder)) || 0;
            enriched._shelf = this.findValue(row, this.BUTLER_COLUMNS.shelf) || '';
            enriched._purchaseGroup = this.findValue(row, this.BUTLER_COLUMNS.purchaseGroup) || '';

            return enriched;
        }).filter(item => {
            // Filter for main warehouse (3018) and active items
            const isMainWarehouse = item._warehouse === '3018' || item._warehouse === 3018;
            const isActive = item._status === 0 || item._status === '0' ||
                           item._status === 0.0 || item._status === '0.0' ||
                           !item._status || item._status === '';
            return item._itemNo && isMainWarehouse && isActive;
        });
    }

    /**
     * Enrich Sales data with standardized fields
     */
    static enrichSalesData(data) {
        return data.map(row => {
            const enriched = { ...row };

            enriched._itemNo = String(this.findValue(row, this.SALES_COLUMNS.itemNo) || '').trim();
            enriched._description = this.findValue(row, this.SALES_COLUMNS.description) || '';
            enriched._date = this.parseDate(this.findValue(row, this.SALES_COLUMNS.date));
            enriched._quantity = parseFloat(this.findValue(row, this.SALES_COLUMNS.quantity)) || 0;
            enriched._value = parseFloat(this.findValue(row, this.SALES_COLUMNS.value)) || 0;
            enriched._customer = this.findValue(row, this.SALES_COLUMNS.customer) || '';
            enriched._deliveryLocation = this.findValue(row, this.SALES_COLUMNS.deliveryLocation) || '';
            enriched._orderNo = this.findValue(row, this.SALES_COLUMNS.orderNo) || '';

            return enriched;
        }).filter(item => item._itemNo && item._quantity > 0);
    }

    /**
     * Enrich Purchase data with standardized fields
     */
    static enrichPurchaseData(data) {
        return data.map(row => {
            const enriched = { ...row };

            enriched._itemNo = String(this.findValue(row, this.PURCHASE_COLUMNS.itemNo) || '').trim();
            enriched._description = this.findValue(row, this.PURCHASE_COLUMNS.description) || '';
            enriched._date = this.parseDate(this.findValue(row, this.PURCHASE_COLUMNS.date));
            enriched._quantity = parseFloat(this.findValue(row, this.PURCHASE_COLUMNS.quantity)) || 0;
            enriched._value = parseFloat(this.findValue(row, this.PURCHASE_COLUMNS.value)) || 0;
            enriched._supplier = this.findValue(row, this.PURCHASE_COLUMNS.supplier) || '';
            enriched._status = this.findValue(row, this.PURCHASE_COLUMNS.status);
            enriched._orderNo = this.findValue(row, this.PURCHASE_COLUMNS.orderNo) || '';

            return enriched;
        }).filter(item => item._itemNo && item._quantity > 0);
    }

    /**
     * Match items across all 3 data sources
     */
    static matchItems(butlerData, salesData, purchaseData) {
        // Group sales and purchases by item number
        const salesByItem = this.groupByItemNo(salesData);
        const purchasesByItem = this.groupByItemNo(purchaseData);

        return butlerData.map(butlerItem => {
            const itemNo = butlerItem._itemNo;
            const salesForItem = salesByItem[itemNo] || [];
            const purchasesForItem = purchasesByItem[itemNo] || [];

            return {
                // Butler data (current state)
                itemNo: itemNo,
                description: butlerItem._description,
                stock: butlerItem._stock,
                available: butlerItem._available,
                reserved: butlerItem._reserved,
                bp: butlerItem._bp,
                max: butlerItem._max,
                onOrder: butlerItem._onOrder,
                supplier: butlerItem._supplier,
                supplierNo: butlerItem._supplierNo,
                r12Sales: butlerItem._r12Sales,
                shelf: butlerItem._shelf,
                purchaseGroup: butlerItem._purchaseGroup,

                // Sales data (order lines)
                salesOrders: salesForItem,

                // Purchase data (order lines)
                purchaseOrders: purchasesForItem,

                // Flag for complete data
                hasAllData: salesForItem.length > 0 && purchasesForItem.length > 0,
                hasSalesData: salesForItem.length > 0,
                hasPurchaseData: purchasesForItem.length > 0
            };
        });
    }

    /**
     * Analyze a single item
     */
    static analyzeItem(item) {
        // Calculate sales statistics
        const salesTotal = item.salesOrders.reduce((sum, order) => sum + order._quantity, 0);
        const salesOrderCount = item.salesOrders.length;
        const salesDates = item.salesOrders.map(o => o._date).filter(d => d);
        const lastSaleDate = salesDates.length > 0 ? new Date(Math.max(...salesDates)) : null;

        const sales = {
            total: salesTotal,
            orderCount: salesOrderCount,
            avgPerMonth: salesTotal / 12,
            avgPerWeek: salesTotal / 52,
            avgOrderSize: salesOrderCount > 0 ? salesTotal / salesOrderCount : 0,
            lastSaleDate: lastSaleDate,
            daysSinceLastSale: lastSaleDate ? Math.floor((new Date() - lastSaleDate) / (1000 * 60 * 60 * 24)) : 999,
            topLocation: this.findTopLocation(item.salesOrders)
        };

        // Calculate purchase statistics
        const purchaseTotal = item.purchaseOrders.reduce((sum, order) => sum + order._quantity, 0);
        const purchaseOrderCount = item.purchaseOrders.length;
        const purchaseDates = item.purchaseOrders.map(o => o._date).filter(d => d);
        const lastPurchaseDate = purchaseDates.length > 0 ? new Date(Math.max(...purchaseDates)) : null;

        const purchases = {
            total: purchaseTotal,
            orderCount: purchaseOrderCount,
            avgOrderSize: purchaseOrderCount > 0 ? purchaseTotal / purchaseOrderCount : 0,
            ordersPerYear: purchaseOrderCount,
            mainSupplier: this.findMainSupplier(item.purchaseOrders),
            lastPurchaseDate: lastPurchaseDate,
            daysSinceLastPurchase: lastPurchaseDate ? Math.floor((new Date() - lastPurchaseDate) / (1000 * 60 * 60 * 24)) : 999
        };

        // Current state
        const current = {
            stock: item.stock,
            available: item.available,
            reserved: item.reserved,
            bp: item.bp,
            max: item.max,
            onOrder: item.onOrder
        };

        // Calculate risk
        const risk = this.calculateRisk(current, sales, purchases, item.hasAllData);

        // Generate recommendations
        const recommendations = this.generateRecommendations(current, sales, purchases, risk);

        return {
            itemNo: item.itemNo,
            description: item.description,
            supplier: item.supplier,
            shelf: item.shelf,
            purchaseGroup: item.purchaseGroup,
            current,
            sales,
            purchases,
            risk,
            recommendations,
            hasAllData: item.hasAllData,
            hasSalesData: item.hasSalesData,
            hasPurchaseData: item.hasPurchaseData
        };
    }

    /**
     * Calculate risk category for an item
     */
    static calculateRisk(current, sales, purchases, hasAllData) {
        const monthlyDemand = sales.avgPerMonth;
        const daysOfStock = sales.avgPerWeek > 0 ? (current.available / (sales.avgPerWeek / 7)) : 999;
        const bpCoverage = monthlyDemand > 0 ? (current.bp / monthlyDemand) : 0;

        // Category 1: BP too low (CRITICAL)
        if (current.bp < monthlyDemand && sales.orderCount >= 6 && hasAllData) {
            return {
                level: 'critical',
                category: 'BP_TOO_LOW',
                message: `BP ${current.bp.toFixed(0)} < Mndforbruk ${monthlyDemand.toFixed(0)}`,
                daysUntilEmpty: Math.floor(daysOfStock),
                priority: 1,
                icon: '🔴'
            };
        }

        // Category 2: Too many orders (WARNING)
        if (purchases.ordersPerYear > 12 && monthlyDemand > 10 && hasAllData) {
            return {
                level: 'warning',
                category: 'TOO_MANY_ORDERS',
                message: `${purchases.ordersPerYear} ordre/år - kan optimaliseres`,
                daysUntilEmpty: Math.floor(daysOfStock),
                priority: 2,
                icon: '🟡'
            };
        }

        // Category 3: BP too high (INFO)
        if ((current.bp > monthlyDemand * 2 || (current.stock > monthlyDemand * 3 && sales.orderCount < 3)) && hasAllData) {
            return {
                level: 'info',
                category: 'BP_TOO_HIGH',
                message: 'BP kan reduseres - binder kapital',
                daysUntilEmpty: Math.floor(daysOfStock),
                priority: 4,
                icon: '⚪'
            };
        }

        // Category 4: Optimal BP (OK)
        if (bpCoverage >= 0.8 && bpCoverage <= 1.5 && purchases.ordersPerYear <= 12 && hasAllData) {
            return {
                level: 'ok',
                category: 'BP_OPTIMAL',
                message: 'Balansert flyt',
                daysUntilEmpty: Math.floor(daysOfStock),
                priority: 3,
                icon: '🟢'
            };
        }

        // Category 5: Unknown (missing data)
        return {
            level: 'unknown',
            category: 'UNKNOWN',
            message: hasAllData ? 'Analyser videre' : 'Mangler salgs/innkjøpsdata',
            daysUntilEmpty: Math.floor(daysOfStock),
            priority: 5,
            icon: '❓'
        };
    }

    /**
     * Generate recommendations for an item
     */
    static generateRecommendations(current, sales, purchases, risk) {
        const monthlyDemand = sales.avgPerMonth;

        const recs = {
            newBP: current.bp,
            newMax: current.max,
            newOrderSize: purchases.avgOrderSize,
            expectedFrequency: purchases.ordersPerYear,
            reasoning: [],
            savings: []
        };

        if (risk.category === 'BP_TOO_LOW') {
            recs.newBP = Math.ceil(monthlyDemand * 1.5);
            recs.newMax = Math.ceil(monthlyDemand * 4);
            recs.newOrderSize = Math.ceil(monthlyDemand * 2);
            recs.expectedFrequency = 6;

            recs.reasoning.push(`Opp BP fra ${current.bp.toFixed(0)} til ${recs.newBP} (1.5x mndforbruk)`);
            recs.reasoning.push(`Storre ordrestorrelse (${recs.newOrderSize}) reduserer risiko`);

            recs.savings.push('Redusert risiko for tomme hyller');
            recs.savings.push('Bedre service til satellittlagre');
        }

        if (risk.category === 'TOO_MANY_ORDERS') {
            recs.newOrderSize = Math.ceil(purchases.avgOrderSize * 1.5);
            recs.newBP = Math.ceil(monthlyDemand * 1.2);
            recs.expectedFrequency = Math.max(6, Math.ceil(purchases.ordersPerYear / 2));

            recs.reasoning.push(`Opp ordrestorrelse til ${recs.newOrderSize} (fra ${purchases.avgOrderSize.toFixed(0)})`);
            recs.reasoning.push(`Reduser frekvens til ${recs.expectedFrequency} ordre/ar`);

            recs.savings.push(`${purchases.ordersPerYear - recs.expectedFrequency} farre ordre/ar`);
            recs.savings.push('Redusert admin-kostnad');
        }

        if (risk.category === 'BP_TOO_HIGH') {
            recs.newBP = Math.ceil(monthlyDemand * 1.2);
            recs.newMax = Math.ceil(monthlyDemand * 3);

            const reducedStock = current.bp - recs.newBP;
            recs.reasoning.push(`Ned BP fra ${current.bp.toFixed(0)} til ${recs.newBP}`);
            recs.reasoning.push('Frigjoer kapital uten a oeke risiko');

            recs.savings.push(`Frigjoer ${reducedStock.toFixed(0)} stk lagerkapital`);
        }

        if (risk.category === 'BP_OPTIMAL') {
            recs.reasoning.push('BP er allerede optimalt');
            recs.savings.push('Fortsett navarende strategi');
        }

        return recs;
    }

    /**
     * Categorize items by risk level
     */
    static categorizeByRisk(items) {
        return {
            critical: items.filter(i => i.risk.category === 'BP_TOO_LOW'),
            warning: items.filter(i => i.risk.category === 'TOO_MANY_ORDERS'),
            optimal: items.filter(i => i.risk.category === 'BP_OPTIMAL'),
            tooHigh: items.filter(i => i.risk.category === 'BP_TOO_HIGH'),
            unknown: items.filter(i => i.risk.category === 'UNKNOWN')
        };
    }

    /**
     * Setup tab navigation
     */
    static setupTabs(categories, allItems, resultsDiv) {
        const tabsContainer = document.querySelector('.replenishment-tabs');
        if (!tabsContainer) return;

        // Update tab labels with counts
        tabsContainer.innerHTML = `
            <button class="tab active" data-view="critical">
                🔴 BP for lavt (${categories.critical.length})
            </button>
            <button class="tab" data-view="tooMany">
                🟡 For mange ordre (${categories.warning.length})
            </button>
            <button class="tab" data-view="optimal">
                🟢 Optimal BP (${categories.optimal.length})
            </button>
            <button class="tab" data-view="tooHigh">
                ⚪ BP for hoyt (${categories.tooHigh.length})
            </button>
            <button class="tab" data-view="all">
                📊 Alle (${allItems.filter(i => i.hasAllData).length})
            </button>
        `;

        // Add click handlers
        tabsContainer.querySelectorAll('.tab').forEach(tab => {
            tab.addEventListener('click', (e) => {
                tabsContainer.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
                e.target.classList.add('active');
                this.renderView(e.target.dataset.view, categories, allItems, resultsDiv);
            });
        });
    }

    /**
     * Render a specific view
     */
    static renderView(view, categories, allItems, resultsDiv) {
        let items = [];
        let title = '';
        let description = '';

        switch (view) {
            case 'critical':
                items = categories.critical;
                title = '🔴 BP for lavt - Kritiske artikler';
                description = 'Artikler hvor bestillingspunkt er lavere enn månedsforbruk. Høy risiko for tomme hyller.';
                break;
            case 'tooMany':
                items = categories.warning;
                title = '🟡 For mange ordre - Kan optimaliseres';
                description = 'Artikler med mer enn 12 innkjøpsordre per år. Kan redusere admin-kostnad ved større ordre.';
                break;
            case 'optimal':
                items = categories.optimal;
                title = '🟢 Optimal BP - Balanserte artikler';
                description = 'Artikler med god balanse mellom BP og faktisk forbruk.';
                break;
            case 'tooHigh':
                items = categories.tooHigh;
                title = '⚪ BP for høyt - Binder kapital';
                description = 'Artikler hvor BP kan reduseres for å frigjøre kapital.';
                break;
            case 'all':
                items = allItems.filter(i => i.hasAllData);
                title = '📊 Alle artikler med komplett data';
                description = `Totalt ${items.length} artikler med data fra alle 3 kilder.`;
                break;
        }

        resultsDiv.innerHTML = this.renderDashboard(items, title, description, view, categories);
        this.attachEventHandlers(resultsDiv);
    }

    /**
     * Render the dashboard HTML
     */
    static renderDashboard(items, title, description, view, categories) {
        const sortedItems = [...items].sort((a, b) => a.risk.priority - b.risk.priority);

        return `
            <div class="replenishment-dashboard">
                <!-- Summary Cards -->
                ${this.renderSummaryCards(categories)}

                <!-- View Header -->
                <div class="view-header" style="margin: 20px 0; padding: 15px; background: #f8f9fa; border-radius: 6px;">
                    <h3 style="margin: 0 0 5px 0; color: #2c3e50;">${title}</h3>
                    <p style="margin: 0; color: #7f8c8d; font-size: 13px;">${description}</p>
                </div>

                <!-- Action Buttons -->
                <div class="action-buttons" style="margin-bottom: 15px;">
                    <button class="btn-primary" onclick="ReplenishmentOptimizer.exportResults('${view}')">
                        📥 Eksporter til CSV
                    </button>
                    <button class="btn-secondary" onclick="ReplenishmentOptimizer.exportAllRecommendations()">
                        📋 Eksporter alle anbefalinger
                    </button>
                </div>

                <!-- Search -->
                <div class="table-controls">
                    <input type="text"
                           class="search-input"
                           id="replenishmentSearch"
                           placeholder="Sok etter artikkel, beskrivelse eller leverandor..."
                           style="max-width: 400px;">
                    <span class="butler-result-count" id="replenishmentCount">
                        ${sortedItems.length} artikler
                    </span>
                </div>

                <!-- Data Table -->
                ${sortedItems.length > 0 ? this.renderTable(sortedItems) : `
                    <div style="text-align: center; padding: 40px; color: #7f8c8d;">
                        <p>Ingen artikler i denne kategorien.</p>
                    </div>
                `}
            </div>
        `;
    }

    /**
     * Render summary cards
     */
    static renderSummaryCards(categories) {
        return `
            <div class="summary-cards">
                <div class="summary-card card-critical">
                    <div class="card-value">${categories.critical.length}</div>
                    <div class="card-label">🔴 BP for lavt</div>
                </div>
                <div class="summary-card card-warning">
                    <div class="card-value">${categories.warning.length}</div>
                    <div class="card-label">🟡 For mange ordre</div>
                </div>
                <div class="summary-card card-ok">
                    <div class="card-value">${categories.optimal.length}</div>
                    <div class="card-label">🟢 Optimal BP</div>
                </div>
                <div class="summary-card">
                    <div class="card-value">${categories.tooHigh.length}</div>
                    <div class="card-label">⚪ BP for hoyt</div>
                </div>
            </div>
        `;
    }

    /**
     * Render data table
     */
    static renderTable(items) {
        return `
            <div class="butler-table-wrapper" style="max-height: 500px;">
                <table class="data-table sortable">
                    <thead>
                        <tr>
                            <th>Artikelnr</th>
                            <th>Beskrivelse</th>
                            <th>Leverandor</th>
                            <th class="qty-cell">Saldo</th>
                            <th class="qty-cell">BP</th>
                            <th class="qty-cell">Mnd.salg</th>
                            <th class="qty-cell">Ordre/år</th>
                            <th>Status</th>
                            <th>Anbefaling</th>
                            <th></th>
                        </tr>
                    </thead>
                    <tbody id="replenishmentTableBody">
                        ${items.map(item => this.renderTableRow(item)).join('')}
                    </tbody>
                </table>
            </div>
        `;
    }

    /**
     * Render a single table row
     */
    static renderTableRow(item) {
        const riskClass = {
            critical: 'risk-critical',
            warning: 'risk-medium',
            ok: 'risk-low',
            info: 'risk-low',
            unknown: ''
        }[item.risk.level] || '';

        return `
            <tr data-itemno="${item.itemNo}">
                <td><strong>${item.itemNo}</strong></td>
                <td class="text-truncate" style="max-width: 200px;" title="${item.description}">
                    ${item.description || '-'}
                </td>
                <td class="text-truncate" style="max-width: 120px;" title="${item.supplier}">
                    ${item.supplier || '-'}
                </td>
                <td class="qty-cell">${item.current.stock.toFixed(0)}</td>
                <td class="qty-cell">${item.current.bp.toFixed(0)}</td>
                <td class="qty-cell">${item.sales.avgPerMonth.toFixed(1)}</td>
                <td class="qty-cell">${item.purchases.ordersPerYear}</td>
                <td>
                    <span class="risk-badge ${riskClass}">
                        ${item.risk.icon} ${item.risk.category.replace(/_/g, ' ')}
                    </span>
                </td>
                <td style="font-size: 12px; max-width: 150px;">
                    ${item.recommendations.reasoning[0] || '-'}
                </td>
                <td>
                    <button class="btn-small" onclick="ReplenishmentOptimizer.showDetails('${item.itemNo}')">
                        Detaljer
                    </button>
                </td>
            </tr>
        `;
    }

    /**
     * Attach event handlers
     */
    static attachEventHandlers(resultsDiv) {
        // Search functionality
        const searchInput = resultsDiv.querySelector('#replenishmentSearch');
        const tableBody = resultsDiv.querySelector('#replenishmentTableBody');
        const countBadge = resultsDiv.querySelector('#replenishmentCount');

        if (searchInput && tableBody) {
            searchInput.addEventListener('input', (e) => {
                const searchTerm = e.target.value.toLowerCase();
                const rows = tableBody.querySelectorAll('tr');
                let visibleCount = 0;

                rows.forEach(row => {
                    const text = row.textContent.toLowerCase();
                    const match = text.includes(searchTerm);
                    row.style.display = match ? '' : 'none';
                    if (match) visibleCount++;
                });

                if (countBadge) {
                    countBadge.textContent = `${visibleCount} artikler`;
                }
            });
        }
    }

    /**
     * Show item details in modal
     */
    static showDetails(itemNo) {
        if (!this.lastAnalysis) return;

        const item = this.lastAnalysis.items.find(i => i.itemNo === itemNo);
        if (!item) return;

        const modal = document.createElement('div');
        modal.className = 'modal-overlay';
        modal.innerHTML = `
            <div class="modal-content" style="max-width: 700px;">
                <div class="modal-header">
                    <h3>📦 ${item.itemNo} - ${item.description || 'Ingen beskrivelse'}</h3>
                    <button class="modal-close" onclick="this.closest('.modal-overlay').remove()">&times;</button>
                </div>
                <div class="modal-body" style="max-height: 70vh; overflow-y: auto;">
                    <!-- Risk Status -->
                    <div style="padding: 15px; background: #f8f9fa; border-radius: 6px; margin-bottom: 20px;">
                        <span class="risk-badge ${item.risk.level === 'critical' ? 'risk-critical' : item.risk.level === 'warning' ? 'risk-medium' : 'risk-low'}" style="font-size: 14px; padding: 8px 15px;">
                            ${item.risk.icon} ${item.risk.message}
                        </span>
                    </div>

                    <!-- Current State -->
                    <h4 style="margin-bottom: 10px; color: #2c3e50;">📊 Dagens tilstand (Butler)</h4>
                    <div class="detail-grid" style="margin-bottom: 20px;">
                        <div class="detail-item">
                            <strong>Lagersaldo</strong>
                            ${item.current.stock.toFixed(0)} stk
                        </div>
                        <div class="detail-item">
                            <strong>Disponibel</strong>
                            ${item.current.available.toFixed(0)} stk
                        </div>
                        <div class="detail-item">
                            <strong>Reservert</strong>
                            ${item.current.reserved.toFixed(0)} stk
                        </div>
                        <div class="detail-item">
                            <strong>Bestillingspunkt (BP)</strong>
                            ${item.current.bp.toFixed(0)} stk
                        </div>
                        <div class="detail-item">
                            <strong>Max lager</strong>
                            ${item.current.max.toFixed(0)} stk
                        </div>
                        <div class="detail-item">
                            <strong>Pa ordre</strong>
                            ${item.current.onOrder.toFixed(0)} stk
                        </div>
                    </div>

                    <!-- Sales Analysis -->
                    <h4 style="margin-bottom: 10px; color: #2c3e50;">📈 Salgsanalyse (12 mnd)</h4>
                    <div class="detail-grid" style="margin-bottom: 20px;">
                        <div class="detail-item">
                            <strong>Totalt solgt</strong>
                            ${item.sales.total.toFixed(0)} stk
                        </div>
                        <div class="detail-item">
                            <strong>Snitt per maned</strong>
                            ${item.sales.avgPerMonth.toFixed(1)} stk
                        </div>
                        <div class="detail-item">
                            <strong>Antall ordrer</strong>
                            ${item.sales.orderCount}
                        </div>
                        <div class="detail-item">
                            <strong>Snitt ordrestorrelse</strong>
                            ${item.sales.avgOrderSize.toFixed(1)} stk
                        </div>
                        <div class="detail-item">
                            <strong>Topp lokasjon</strong>
                            ${item.sales.topLocation || '-'}
                        </div>
                        <div class="detail-item">
                            <strong>Siste salg</strong>
                            ${item.sales.lastSaleDate ? item.sales.lastSaleDate.toLocaleDateString('no-NO') : '-'}
                        </div>
                    </div>

                    <!-- Purchase Analysis -->
                    <h4 style="margin-bottom: 10px; color: #2c3e50;">🛒 Innkjopsanalyse (12 mnd)</h4>
                    <div class="detail-grid" style="margin-bottom: 20px;">
                        <div class="detail-item">
                            <strong>Totalt kjopt</strong>
                            ${item.purchases.total.toFixed(0)} stk
                        </div>
                        <div class="detail-item">
                            <strong>Antall ordrer</strong>
                            ${item.purchases.orderCount}
                        </div>
                        <div class="detail-item">
                            <strong>Snitt ordrestorrelse</strong>
                            ${item.purchases.avgOrderSize.toFixed(1)} stk
                        </div>
                        <div class="detail-item">
                            <strong>Hovedleverandor</strong>
                            ${item.purchases.mainSupplier || item.supplier || '-'}
                        </div>
                        <div class="detail-item">
                            <strong>Siste innkjop</strong>
                            ${item.purchases.lastPurchaseDate ? item.purchases.lastPurchaseDate.toLocaleDateString('no-NO') : '-'}
                        </div>
                    </div>

                    <!-- Recommendations -->
                    <h4 style="margin-bottom: 10px; color: #2c3e50;">💡 Anbefalinger</h4>
                    <div style="background: #e8f4f8; border-left: 4px solid #3498db; padding: 15px; border-radius: 0 6px 6px 0;">
                        ${item.recommendations.reasoning.length > 0 ? `
                            <ul style="margin: 0 0 10px 20px; padding: 0;">
                                ${item.recommendations.reasoning.map(r => `<li>${r}</li>`).join('')}
                            </ul>
                        ` : '<p>Ingen spesifikke anbefalinger.</p>'}

                        ${item.recommendations.savings.length > 0 ? `
                            <p style="margin: 10px 0 0 0; font-weight: 600; color: #27ae60;">
                                ✓ ${item.recommendations.savings.join(' | ')}
                            </p>
                        ` : ''}
                    </div>

                    ${item.recommendations.newBP !== item.current.bp ? `
                        <div style="margin-top: 15px; padding: 15px; background: #d5f4e6; border-radius: 6px;">
                            <strong>Foreslatte endringer:</strong><br>
                            BP: ${item.current.bp.toFixed(0)} → <strong>${item.recommendations.newBP}</strong> |
                            Max: ${item.current.max.toFixed(0)} → <strong>${item.recommendations.newMax}</strong>
                        </div>
                    ` : ''}
                </div>
                <div class="modal-footer">
                    <button class="btn-secondary" onclick="this.closest('.modal-overlay').remove()">
                        Lukk
                    </button>
                    <button class="btn-primary" onclick="ReplenishmentOptimizer.exportSingleItem('${item.itemNo}')">
                        📥 Eksporter
                    </button>
                </div>
            </div>
        `;

        document.body.appendChild(modal);
    }

    /**
     * Export results to CSV
     */
    static exportResults(view) {
        if (!this.lastAnalysis) {
            alert('Ingen data a eksportere');
            return;
        }

        let items = [];
        const categories = this.lastAnalysis.categories;

        switch (view) {
            case 'critical':
                items = categories.critical;
                break;
            case 'tooMany':
                items = categories.warning;
                break;
            case 'optimal':
                items = categories.optimal;
                break;
            case 'tooHigh':
                items = categories.tooHigh;
                break;
            case 'all':
            default:
                items = this.lastAnalysis.items.filter(i => i.hasAllData);
        }

        this.downloadCSV(items, `bp-optimalisering-${view}-${new Date().toISOString().split('T')[0]}.csv`);
    }

    /**
     * Export all recommendations
     */
    static exportAllRecommendations() {
        if (!this.lastAnalysis) {
            alert('Ingen data a eksportere');
            return;
        }

        const items = this.lastAnalysis.items.filter(i =>
            i.hasAllData && i.risk.category !== 'BP_OPTIMAL' && i.risk.category !== 'UNKNOWN'
        );

        this.downloadCSV(items, `bp-anbefalinger-${new Date().toISOString().split('T')[0]}.csv`);
    }

    /**
     * Export single item
     */
    static exportSingleItem(itemNo) {
        if (!this.lastAnalysis) return;

        const item = this.lastAnalysis.items.find(i => i.itemNo === itemNo);
        if (!item) return;

        this.downloadCSV([item], `bp-analyse-${itemNo}-${new Date().toISOString().split('T')[0]}.csv`);
    }

    /**
     * Download CSV file
     */
    static downloadCSV(items, filename) {
        const headers = [
            'Artikelnr', 'Beskrivelse', 'Hylle', 'Leverandor',
            'Saldo', 'Disponibel', 'Reservert', 'BP', 'Max', 'Pa_ordre',
            'Salg_Total_12mnd', 'Salg_Per_Maned', 'Salg_Antall_Ordre', 'Salg_Sist_Dato', 'Salg_Topp_Lokasjon',
            'Innkjop_Total_12mnd', 'Innkjop_Antall_Ordre', 'Innkjop_Snitt_Storrelse', 'Innkjop_Sist_Dato',
            'Risiko_Kategori', 'Risiko_Niva', 'Risiko_Beskrivelse', 'Dager_Til_Tomt',
            'Anbefalt_BP', 'Anbefalt_Max', 'Anbefalt_Ordre_Storrelse', 'Anbefalt_Frekvens',
            'Begrunnelse', 'Besparelse'
        ];

        const rows = items.map(item => [
            item.itemNo,
            `"${(item.description || '').replace(/"/g, '""')}"`,
            item.shelf || '',
            `"${(item.supplier || '').replace(/"/g, '""')}"`,
            item.current.stock.toFixed(0),
            item.current.available.toFixed(0),
            item.current.reserved.toFixed(0),
            item.current.bp.toFixed(0),
            item.current.max.toFixed(0),
            item.current.onOrder.toFixed(0),
            item.sales.total.toFixed(0),
            item.sales.avgPerMonth.toFixed(1),
            item.sales.orderCount,
            item.sales.lastSaleDate ? item.sales.lastSaleDate.toISOString().split('T')[0] : '',
            item.sales.topLocation || '',
            item.purchases.total.toFixed(0),
            item.purchases.orderCount,
            item.purchases.avgOrderSize.toFixed(1),
            item.purchases.lastPurchaseDate ? item.purchases.lastPurchaseDate.toISOString().split('T')[0] : '',
            item.risk.category,
            item.risk.level,
            `"${item.risk.message}"`,
            item.risk.daysUntilEmpty,
            item.recommendations.newBP,
            item.recommendations.newMax,
            item.recommendations.newOrderSize.toFixed(0),
            item.recommendations.expectedFrequency,
            `"${item.recommendations.reasoning.join('; ')}"`,
            `"${item.recommendations.savings.join('; ')}"`
        ]);

        const csv = '\ufeff' + headers.join(';') + '\n' + rows.map(r => r.join(';')).join('\n');
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(url);
    }

    // ===============================
    // HELPER METHODS
    // ===============================

    /**
     * Find value from multiple possible column names
     */
    static findValue(row, possibleNames) {
        for (const name of possibleNames) {
            if (row[name] !== undefined && row[name] !== null && row[name] !== '') {
                return row[name];
            }
        }
        return null;
    }

    /**
     * Parse date from various formats
     */
    static parseDate(value) {
        if (!value) return null;
        if (value instanceof Date) return value;

        // Handle Excel serial date
        if (typeof value === 'number') {
            const date = new Date((value - 25569) * 86400 * 1000);
            return isNaN(date.getTime()) ? null : date;
        }

        // Try parsing string
        const parsed = new Date(value);
        return isNaN(parsed.getTime()) ? null : parsed;
    }

    /**
     * Group items by item number
     */
    static groupByItemNo(items) {
        const grouped = {};
        items.forEach(item => {
            const itemNo = item._itemNo;
            if (!grouped[itemNo]) {
                grouped[itemNo] = [];
            }
            grouped[itemNo].push(item);
        });
        return grouped;
    }

    /**
     * Find top delivery location by quantity
     */
    static findTopLocation(salesOrders) {
        if (!salesOrders || salesOrders.length === 0) return null;

        const locationCounts = {};
        salesOrders.forEach(order => {
            const loc = order._deliveryLocation || 'Ukjent';
            locationCounts[loc] = (locationCounts[loc] || 0) + order._quantity;
        });

        let topLoc = null;
        let maxQty = 0;
        for (const [loc, qty] of Object.entries(locationCounts)) {
            if (qty > maxQty) {
                maxQty = qty;
                topLoc = loc;
            }
        }
        return topLoc;
    }

    /**
     * Find main supplier by quantity purchased
     */
    static findMainSupplier(purchaseOrders) {
        if (!purchaseOrders || purchaseOrders.length === 0) return null;

        const supplierCounts = {};
        purchaseOrders.forEach(order => {
            const sup = order._supplier || 'Ukjent';
            supplierCounts[sup] = (supplierCounts[sup] || 0) + order._quantity;
        });

        let topSup = null;
        let maxQty = 0;
        for (const [sup, qty] of Object.entries(supplierCounts)) {
            if (qty > maxQty) {
                maxQty = qty;
                topSup = sup;
            }
        }
        return topSup;
    }
}

// Register module globally
window.ReplenishmentOptimizer = ReplenishmentOptimizer;

console.log('🎯 ReplenishmentOptimizer module loaded');
