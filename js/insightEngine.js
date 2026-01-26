// ===================================
// INSIGHT ENGINE - BORREGAARD DASHBOARD
// Cross-module intelligence: Butler + Location + Order history
// ===================================

/**
 * InsightEngine - Kombinerer innsikt fra alle moduler
 *
 * WHY THIS MODULE EXISTS:
 * - Butler tells us WHAT items are critical (0 stock, below min)
 * - LocationAnalyzer tells us WHERE items are frequently ordered
 * - InsightEngine COMBINES these to give actionable recommendations
 *
 * KEY OUTPUT:
 * - Prioritized replenishment list per location
 * - Risk scores combining stock status + order frequency
 * - Suggested order quantities based on historical median
 *
 * TRUST LEVEL: Medium-High
 * - Recommendations are for decision support, not automatic ordering
 * - All suggestions should be reviewed by warehouse manager
 */
class InsightEngine {
    /**
     * Sort state for tables
     */
    static _sortState = {
        column: 'riskScore',
        direction: 'desc'
    };

    /**
     * Current insights (for export and re-sorting)
     */
    static _currentInsights = null;

    /**
     * Generate comprehensive insights by combining Butler and Location data
     * @param {Array} butlerData - Data from ButlerAnalyzer
     * @param {Array} locationData - Data from LocationAnalyzer (unused, we use LocationAnalyzer._analysis)
     * @returns {Object} Insights object with multiple analysis types
     */
    static generateInsights(butlerData, locationData) {
        const insights = {
            criticalAndFrequent: [],      // Items critical in Butler AND frequently ordered
            locationSpecificRisks: [],     // Top items per location with low Butler stock
            replenishmentPriority: [],     // Filtered high-priority items (score ≥70)
            underutilizedStock: [],        // Items with stock but no movement
            summary: {
                totalCritical: 0,
                totalLocationsAffected: 0,
                totalSuggestedValue: 0
            }
        };

        if (!butlerData || butlerData.length === 0) {
            console.log('InsightEngine: No Butler data available');
            return insights;
        }

        if (!window.LocationAnalyzer?._analysis) {
            console.log('InsightEngine: No Location data available');
            return insights;
        }

        // 1. Find items that are both critical in Butler AND frequently ordered at locations
        insights.criticalAndFrequent = this.findCriticalAndFrequent(butlerData);

        // 2. Find location-specific risks (top items with low stock)
        insights.locationSpecificRisks = this.findLocationRisks(butlerData);

        // 3. Calculate replenishment priority (high risk score items)
        insights.replenishmentPriority = this.calculateReplenishmentPriority(
            insights.criticalAndFrequent
        );

        // 4. Find underutilized stock (stock but no recent orders)
        insights.underutilizedStock = this.findUnderutilizedStock(butlerData);

        // 5. Calculate summary
        insights.summary.totalCritical = insights.replenishmentPriority.length;
        insights.summary.totalLocationsAffected = new Set(
            insights.replenishmentPriority.map(i => i.locationId)
        ).size;
        insights.summary.totalSuggestedValue = insights.replenishmentPriority.reduce(
            (sum, item) => sum + (item.suggestedOrder * (item.avgValue || 0)), 0
        );

        console.log(`InsightEngine: Generated ${insights.replenishmentPriority.length} priority items`);

        return insights;
    }

    /**
     * Find items that are both critical in Butler and frequently ordered
     * @param {Array} butlerData - Butler inventory data
     * @returns {Array} Combined insights sorted by risk score
     */
    static findCriticalAndFrequent(butlerData) {
        const insights = [];
        const locations = window.LocationAnalyzer._analysis;

        if (!locations) return insights;

        // Get critical items from Butler (0 stock, below min, or negative)
        const criticalItems = butlerData.filter(item =>
            item._isZeroStock || item._hasBelowMin || item._isNegative
        );

        console.log(`InsightEngine: Found ${criticalItems.length} critical items in Butler`);

        criticalItems.forEach(butlerItem => {
            const itemNo = butlerItem._itemNo;
            if (!itemNo) return;

            // Check each location for this item
            locations.forEach(loc => {
                const locItem = loc.items[itemNo];

                // Only include if item is ordered at this location (≥1 order)
                // and has meaningful frequency (≥3 orders for "frequent")
                if (locItem && locItem.orderCount >= 1) {
                    // Calculate median quantity from order history
                    const quantities = locItem.orders
                        .map(o => o.qty)
                        .filter(q => q > 0)
                        .sort((a, b) => a - b);

                    const medianQty = quantities.length > 0
                        ? quantities[Math.floor(quantities.length / 2)]
                        : 0;

                    // Calculate average value per unit
                    const avgValue = locItem.totalQty > 0
                        ? locItem.totalValue / locItem.totalQty
                        : 0;

                    // Calculate days since last order
                    const sortedOrders = locItem.orders
                        .filter(o => o.date)
                        .sort((a, b) => b.date - a.date);

                    const lastOrderDate = sortedOrders.length > 0 ? sortedOrders[0].date : null;
                    const daysSinceLastOrder = lastOrderDate
                        ? Math.floor((new Date() - lastOrderDate) / (1000 * 60 * 60 * 24))
                        : 999;

                    // Calculate risk reasons (human-readable)
                    const reasons = [];
                    if (butlerItem._isZeroStock) reasons.push('0-saldo');
                    if (butlerItem._isNegative) reasons.push('Negativ');
                    if (butlerItem._hasBelowMin) reasons.push('Under min');
                    if (locItem.orderCount >= 10) reasons.push('Svært ofte');
                    else if (locItem.orderCount >= 6) reasons.push('Ofte kjøpt');
                    else if (locItem.orderCount >= 3) reasons.push('Jevnlig');
                    if (daysSinceLastOrder <= 7) reasons.push('Nylig');
                    else if (daysSinceLastOrder <= 30) reasons.push('Aktiv');
                    if (locItem.totalValue >= 10000) reasons.push('Høy verdi');

                    // Calculate risk score
                    const riskScore = this.calculateRiskScore(
                        butlerItem, locItem, daysSinceLastOrder
                    );

                    insights.push({
                        // Location info
                        locationId: loc.id,
                        locationName: loc.name,

                        // Item info
                        itemId: itemNo,
                        itemName: butlerItem._description || butlerItem._itemName || locItem.itemName || '',

                        // Butler status
                        butlerStock: butlerItem._stockNum || 0,
                        butlerAvailable: butlerItem._availableNum || 0,
                        butlerMin: butlerItem._minNum || 0,
                        butlerMax: butlerItem._maxNum || 0,
                        butlerStatus: butlerItem._isZeroStock ? 'Tom'
                            : butlerItem._isNegative ? 'Negativ'
                            : 'Under minimum',
                        butlerSupplier: butlerItem._supplierName || '',

                        // Location order history
                        orderCount: locItem.orderCount,
                        totalQty: locItem.totalQty,
                        totalValue: locItem.totalValue,
                        avgQty: locItem.totalQty / locItem.orderCount,
                        avgValue: avgValue,
                        medianQty: medianQty,
                        daysSinceLastOrder: daysSinceLastOrder,
                        lastOrderDate: lastOrderDate,

                        // Calculated metrics
                        riskScore: riskScore,
                        riskReasons: reasons.join(', '),
                        suggestedOrder: Math.ceil(medianQty * 1.2), // +20% safety buffer
                        suggestedValue: Math.ceil(medianQty * 1.2 * avgValue)
                    });
                }
            });
        });

        // Sort by risk score descending
        return insights.sort((a, b) => b.riskScore - a.riskScore);
    }

    /**
     * Calculate risk score for an item at a location
     * Score range: 0-100
     *
     * Factors:
     * - Butler status (0-40 points): How critical is the stock situation?
     * - Order frequency (0-30 points): How often is this ordered?
     * - Recent activity (0-20 points): Has it been ordered recently?
     * - Value (0-10 points): High value = higher priority
     */
    static calculateRiskScore(butlerItem, locItem, daysSinceLastOrder) {
        let score = 0;

        // Butler status (0-40 points)
        if (butlerItem._isZeroStock) score += 40;
        else if (butlerItem._isNegative) score += 35;
        else if (butlerItem._hasBelowMin) score += 20;

        // Order frequency (0-30 points)
        if (locItem.orderCount >= 10) score += 30;
        else if (locItem.orderCount >= 6) score += 20;
        else if (locItem.orderCount >= 3) score += 10;
        else if (locItem.orderCount >= 1) score += 5;

        // Recent activity (0-20 points)
        if (daysSinceLastOrder <= 7) score += 20;
        else if (daysSinceLastOrder <= 14) score += 18;
        else if (daysSinceLastOrder <= 30) score += 15;
        else if (daysSinceLastOrder <= 60) score += 10;
        else if (daysSinceLastOrder <= 90) score += 5;

        // Value (0-10 points)
        if (locItem.totalValue >= 10000) score += 10;
        else if (locItem.totalValue >= 5000) score += 7;
        else if (locItem.totalValue >= 1000) score += 5;
        else if (locItem.totalValue >= 500) score += 3;

        return Math.min(score, 100);
    }

    /**
     * Find location-specific risks (top items at each location with low Butler stock)
     */
    static findLocationRisks(butlerData) {
        const risks = [];
        const locations = window.LocationAnalyzer?._analysis;

        if (!locations) return risks;

        locations.forEach(loc => {
            // Get top 10 items at this location
            const topItems = Object.values(loc.items)
                .sort((a, b) => b.orderCount - a.orderCount)
                .slice(0, 10);

            topItems.forEach(locItem => {
                // Find corresponding Butler item
                const butlerItem = butlerData.find(b => b._itemNo === locItem.itemId);

                if (butlerItem && (butlerItem._isZeroStock || butlerItem._hasBelowMin || butlerItem._isNegative)) {
                    risks.push({
                        locationId: loc.id,
                        locationName: loc.name,
                        itemId: locItem.itemId,
                        itemName: locItem.itemName || butlerItem._description || '',
                        butlerStock: butlerItem._stockNum || 0,
                        butlerMin: butlerItem._minNum || 0,
                        orderCount: locItem.orderCount,
                        risk: 'Top-artikel med kritisk beholdning'
                    });
                }
            });
        });

        return risks;
    }

    /**
     * Calculate replenishment priority (filter to high-risk items)
     */
    static calculateReplenishmentPriority(criticalAndFrequent) {
        return criticalAndFrequent
            .filter(item => item.riskScore >= 50) // Lowered threshold for more visibility
            .sort((a, b) => {
                // Primary: risk score
                if (b.riskScore !== a.riskScore) return b.riskScore - a.riskScore;
                // Secondary: order count
                if (b.orderCount !== a.orderCount) return b.orderCount - a.orderCount;
                // Tertiary: total value
                return b.totalValue - a.totalValue;
            })
            .slice(0, 100); // Limit to top 100
    }

    /**
     * Find stock with no recent movement
     */
    static findUnderutilizedStock(butlerData) {
        const underutilized = [];
        const enrichedData = window.LocationAnalyzer?._enrichedData;

        if (!enrichedData) return underutilized;

        // Look for items with no orders in last 6 months
        const sixMonthsAgo = new Date();
        sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

        butlerData.forEach(butlerItem => {
            // Only check items with stock and no R12 movement
            if (butlerItem._stockNum > 0 && butlerItem._hasNoMovement) {
                const itemNo = butlerItem._itemNo;

                // Check if ordered in last 6 months at any location
                const hasRecentOrders = enrichedData.some(order =>
                    order._itemId === itemNo &&
                    order._dateObj &&
                    order._dateObj >= sixMonthsAgo
                );

                if (!hasRecentOrders) {
                    underutilized.push({
                        itemId: itemNo,
                        itemName: butlerItem._description || butlerItem._itemName || '',
                        stock: butlerItem._stockNum,
                        r12Sales: butlerItem._r12SalesNum || 0,
                        status: 'Ingen bevegelse siste 6 mnd',
                        stockValue: butlerItem._stockNum * (butlerItem._priceNum || 0)
                    });
                }
            }
        });

        return underutilized.sort((a, b) => b.stockValue - a.stockValue);
    }

    /**
     * Render insights dashboard
     * @param {Object} insights - Generated insights object
     * @returns {string} HTML content
     */
    static renderInsights(insights) {
        let html = '';

        // Store for export and re-sorting
        this._currentInsights = insights;

        // Disclaimer (important for trust)
        html += '<div class="alert alert-info" style="margin-bottom: 20px;">';
        html += '<p style="margin: 0;"><strong>Viktig:</strong> Forslagene er beregnet basert på historikk og lagerstatus. ';
        html += 'Endelig bestilling vurderes manuelt av plassansvarlig.</p>';
        html += '</div>';

        // Summary cards
        html += '<div class="summary-cards">';
        html += `<div class="summary-card card-warning">
            <div class="card-value">${insights.summary.totalCritical}</div>
            <div class="card-label">Høyprioritet artikler</div>
        </div>`;
        html += `<div class="summary-card">
            <div class="card-value">${insights.summary.totalLocationsAffected}</div>
            <div class="card-label">Lokasjoner berørt</div>
        </div>`;
        html += `<div class="summary-card">
            <div class="card-value">${insights.criticalAndFrequent.length}</div>
            <div class="card-label">Kritisk + Kjøpes ofte</div>
        </div>`;
        html += `<div class="summary-card">
            <div class="card-value">${insights.underutilizedStock.length}</div>
            <div class="card-label">Uten bevegelse</div>
        </div>`;
        html += '</div>';

        // Criteria explanation
        html += '<div class="alert alert-info" style="margin-top: 20px; margin-bottom: 20px;">';
        html += '<h4 style="margin-top: 0;">Prioritetsliste viser artikler som er:</h4>';
        html += '<ul style="margin-bottom: 0;">';
        html += '<li>Kritisk lav/tom i Butler (0-saldo, negativ, eller under minimum)</li>';
        html += '<li>Kjøpes på minst én lokasjon</li>';
        html += '<li>Risikoscore ≥50 (kombinasjon av lagerstatus, frekvens, nylig aktivitet)</li>';
        html += '</ul>';
        html += '</div>';

        if (insights.replenishmentPriority.length === 0) {
            html += '<p class="text-muted">Ingen høyprioritet artikler funnet med gjeldende kriterier.</p>';
            html += '<p class="text-muted">Dette kan bety at Butler-dataene og lokasjonsdataene ikke overlapper på kritiske artikler.</p>';
            return html;
        }

        // Export button
        html += '<div class="action-buttons" style="margin-bottom: 15px;">';
        html += '<button onclick="InsightEngine.exportPriorityList()" class="btn-secondary">Eksporter prioritetsliste (CSV)</button>';
        html += '</div>';

        // Priority table
        html += '<table class="data-table" id="insightPriorityTable">';
        html += '<thead><tr>';
        html += '<th style="width: 60px;">Risiko</th>';
        html += '<th>Lokasjon</th>';
        html += '<th>Artikelnr</th>';
        html += '<th>Beskrivelse</th>';
        html += '<th>Hvorfor?</th>';
        html += '<th style="text-align: right;">Butler</th>';
        html += '<th style="text-align: right;">Min/Max</th>';
        html += '<th style="text-align: right;">Ordre</th>';
        html += '<th style="text-align: right;">Median</th>';
        html += '<th style="text-align: right;">Forslag</th>';
        html += '<th style="text-align: right;">Dager</th>';
        html += '</tr></thead><tbody>';

        insights.replenishmentPriority.forEach(item => {
            const riskClass = item.riskScore >= 80 ? 'risk-critical'
                : item.riskScore >= 60 ? 'risk-high'
                : 'risk-medium';

            html += '<tr>';
            html += `<td style="text-align: center;"><span class="risk-badge ${riskClass}">${item.riskScore}</span></td>`;
            html += `<td>${item.locationName}</td>`;
            html += `<td><strong>${item.itemId}</strong></td>`;
            html += `<td class="text-truncate" style="max-width: 200px;" title="${item.itemName}">${item.itemName}</td>`;
            html += `<td><span class="text-muted" style="font-size: 11px;">${item.riskReasons}</span></td>`;
            html += `<td style="text-align: right;">${item.butlerStock}</td>`;
            html += `<td style="text-align: right;">${item.butlerMin}/${item.butlerMax}</td>`;
            html += `<td style="text-align: right;">${item.orderCount}</td>`;
            html += `<td style="text-align: right;">${item.medianQty.toFixed(0)}</td>`;
            html += `<td style="text-align: right;"><strong>${item.suggestedOrder}</strong></td>`;
            html += `<td style="text-align: right;">${item.daysSinceLastOrder}</td>`;
            html += '</tr>';
        });

        html += '</tbody></table>';

        // Underutilized stock section (collapsible)
        if (insights.underutilizedStock.length > 0) {
            html += '<details style="margin-top: 30px;">';
            html += `<summary style="cursor: pointer; font-weight: bold; padding: 10px;">
                Artikler uten bevegelse (${insights.underutilizedStock.length} stk)
            </summary>`;
            html += '<table class="data-table" id="underutilizedTable" style="margin-top: 10px;">';
            html += '<thead><tr>';
            html += '<th>Artikelnr</th>';
            html += '<th>Beskrivelse</th>';
            html += '<th style="text-align: right;">Beholdning</th>';
            html += '<th style="text-align: right;">R12 salg</th>';
            html += '<th>Status</th>';
            html += '</tr></thead><tbody>';

            insights.underutilizedStock.slice(0, 50).forEach(item => {
                html += '<tr>';
                html += `<td><strong>${item.itemId}</strong></td>`;
                html += `<td>${item.itemName}</td>`;
                html += `<td style="text-align: right;">${item.stock}</td>`;
                html += `<td style="text-align: right;">${item.r12Sales}</td>`;
                html += `<td class="text-muted">${item.status}</td>`;
                html += '</tr>';
            });

            html += '</tbody></table>';
            html += '</details>';
        }

        return html;
    }

    /**
     * Export priority list to CSV
     */
    static exportPriorityList() {
        if (!this._currentInsights?.replenishmentPriority?.length) {
            alert('Ingen data å eksportere');
            return;
        }

        const items = this._currentInsights.replenishmentPriority;

        const headers = [
            'Risikoscore',
            'Lokasjon',
            'Artikelnr',
            'Beskrivelse',
            'Hvorfor',
            'Butler saldo',
            'Butler min',
            'Butler max',
            'Leverandør',
            'Antall ordre',
            'Total mengde',
            'Median per ordre',
            'Foreslått bestilling',
            'Dager siden siste ordre',
            'Total verdi (NOK)'
        ];

        let csv = headers.join(';') + '\n';

        items.forEach(item => {
            csv += [
                item.riskScore,
                item.locationName,
                item.itemId,
                `"${(item.itemName || '').replace(/"/g, '""')}"`,
                `"${(item.riskReasons || '').replace(/"/g, '""')}"`,
                item.butlerStock,
                item.butlerMin,
                item.butlerMax,
                `"${(item.butlerSupplier || '').replace(/"/g, '""')}"`,
                item.orderCount,
                item.totalQty.toFixed(0),
                item.medianQty.toFixed(0),
                item.suggestedOrder,
                item.daysSinceLastOrder,
                item.totalValue.toFixed(0)
            ].join(';') + '\n';
        });

        const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `prioritetsliste_${new Date().toISOString().split('T')[0]}.csv`;
        a.click();
        URL.revokeObjectURL(url);
    }

    /**
     * Update the insight display
     * Called from app.js when both Butler and Location data are available
     */
    static update(butlerData, locationData) {
        const resultsDiv = document.getElementById('insightResults');
        const statusBadge = document.getElementById('insightStatus');

        if (!resultsDiv) {
            console.warn('InsightEngine: #insightResults not found');
            return;
        }

        // Check prerequisites
        if (!butlerData || butlerData.length === 0) {
            resultsDiv.innerHTML = `
                <p class="placeholder">
                    Last opp Butler-data for å aktivere innsiktsanalyse.
                </p>
            `;
            if (statusBadge) {
                statusBadge.textContent = 'Mangler Butler';
                statusBadge.className = 'status-badge';
            }
            return;
        }

        if (!window.LocationAnalyzer?._analysis) {
            resultsDiv.innerHTML = `
                <p class="placeholder">
                    Last opp salgshistorikk med leveringslokasjoner for å aktivere innsiktsanalyse.
                </p>
            `;
            if (statusBadge) {
                statusBadge.textContent = 'Mangler lokasjoner';
                statusBadge.className = 'status-badge';
            }
            return;
        }

        // Generate insights
        const insights = this.generateInsights(butlerData, locationData);

        // Render
        if (insights.replenishmentPriority.length > 0) {
            if (statusBadge) {
                statusBadge.textContent = `${insights.replenishmentPriority.length} forslag`;
                statusBadge.className = 'status-badge warning';
            }
            resultsDiv.innerHTML = this.renderInsights(insights);

            // Initialize sortable table
            setTimeout(() => {
                if (window.SortableTable) {
                    window.SortableTable.init('insightPriorityTable');
                    window.SortableTable.init('underutilizedTable');
                }
            }, 100);
        } else {
            if (statusBadge) {
                statusBadge.textContent = 'Ingen kritiske funn';
                statusBadge.className = 'status-badge ok';
            }
            resultsDiv.innerHTML = `
                <p class="text-muted">Ingen høyprioritet artikler identifisert.</p>
                <p class="text-muted">Dette er positivt - det betyr at Butler-kritiske artikler ikke overlapper med ofte-kjøpte artikler.</p>
            `;
        }
    }
}

// Export for use in other modules
window.InsightEngine = InsightEngine;
