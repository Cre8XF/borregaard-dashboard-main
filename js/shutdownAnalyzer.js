// ===================================
// SHUTDOWN ANALYZER - ENHANCED
// Week 16 & 42 maintenance planning with predictive intelligence
// Historical comparison, risk scoring, and recommendations
// ===================================

/**
 * ShutdownAnalyzer - Advanced maintenance shutdown planner
 * Analyzes historical order data to predict critical items for shutdowns
 */
class ShutdownAnalyzer {
    /**
     * Update the shutdown analysis display
     */
    static update(data) {
        const resultsDiv = document.getElementById('shutdownResults');
        const statusBadge = document.getElementById('shutdownStatus');

        if (!data || data.length === 0) {
            resultsDiv.innerHTML = `
                <p class="placeholder">
                    Last opp historiske ordredata for å analysere kritiske produkter før stopp.
                    <br><br>
                    <strong>Tips:</strong> Filen bør inneholde kolonner som: Varenummer, Dato/Uke, Antall
                </p>
            `;
            statusBadge.textContent = 'Ingen data';
            statusBadge.className = 'status-badge';
            return;
        }

        // Enrich data with dates and weeks
        const enrichedData = this.enrichData(data);

        // Perform comprehensive analysis
        const analysis = this.analyzeShutdownPeriods(enrichedData);

        // Update status badge
        const criticalCount = analysis.criticalItems.length;
        statusBadge.textContent = `${criticalCount} kritiske varer`;
        statusBadge.className = 'status-badge ' +
            (criticalCount > 20 ? 'critical' : criticalCount > 0 ? 'warning' : 'ok');

        // Render comprehensive analysis
        resultsDiv.innerHTML = this.renderAnalysis(analysis, enrichedData);
    }

    /**
     * Enrich data with parsed dates and week numbers
     */
    static enrichData(data) {
        return data.map(row => {
            const enriched = { ...row };

            // Extract or calculate week number
            enriched._week = this.extractWeek(row);

            // Extract year
            enriched._year = this.extractYear(row);

            // Extract item number
            enriched._item = this.extractItem(row);

            // Extract quantity
            enriched._quantity = this.extractQuantity(row);

            return enriched;
        }).filter(row => row._item); // Filter out rows without item numbers
    }

    /**
     * Extract week number from row
     */
    static extractWeek(row) {
        // Try week column first
        const weekFields = ['Week', 'week', 'Uke', 'uke', 'Week Number', 'Ukenummer'];

        for (let field of weekFields) {
            if (row[field]) {
                const num = parseInt(row[field]);
                if (!isNaN(num) && num >= 1 && num <= 53) return num;
            }
        }

        // Try to extract from date fields
        const dateFields = ['Order Date', 'Date', 'Dato', 'Ordredato', 'OrderDate', 'date'];
        for (let field of dateFields) {
            if (row[field]) {
                const date = DataLoader.parseDate(row[field]);
                if (date && !isNaN(date.getTime())) {
                    return DataLoader.getWeekNumber(date);
                }
            }
        }

        return 0;
    }

    /**
     * Extract year from row
     */
    static extractYear(row) {
        const yearFields = ['Year', 'year', 'År', 'år'];

        for (let field of yearFields) {
            if (row[field]) {
                const year = parseInt(row[field]);
                if (!isNaN(year) && year >= 2000 && year <= 2100) return year;
            }
        }

        // Try to extract from date
        const dateFields = ['Order Date', 'Date', 'Dato', 'Ordredato', 'OrderDate', 'date'];
        for (let field of dateFields) {
            if (row[field]) {
                const date = DataLoader.parseDate(row[field]);
                if (date && !isNaN(date.getTime())) {
                    return date.getFullYear();
                }
            }
        }

        return new Date().getFullYear(); // Default to current year
    }

    /**
     * Extract item number from row
     */
    static extractItem(row) {
        const itemFields = ['Item', 'ItemNo', 'Item Number', 'Varenummer', 'Artikkel', 'item', 'itemNo'];

        for (let field of itemFields) {
            if (row[field]) {
                return row[field].toString().trim();
            }
        }

        return null;
    }

    /**
     * Extract quantity from row
     */
    static extractQuantity(row) {
        const qtyFields = ['Quantity', 'Qty', 'Antall', 'Mengde', 'quantity', 'qty'];

        for (let field of qtyFields) {
            if (row[field]) {
                const qty = parseFloat(row[field]);
                if (!isNaN(qty)) return qty;
            }
        }

        return 1; // Default to 1 if no quantity found
    }

    /**
     * Analyze shutdown periods comprehensively
     */
    static analyzeShutdownPeriods(data) {
        // Filter data for shutdown periods (weeks 14-16 and 40-42)
        const week16Data = data.filter(row => row._week >= 14 && row._week <= 16);
        const week42Data = data.filter(row => row._week >= 40 && row._week <= 42);

        // Group by year and item
        const byYear = this.groupByYear(data);

        // Aggregate items for each shutdown period
        const aggregated16 = this.aggregateByItem(week16Data);
        const aggregated42 = this.aggregateByItem(week42Data);

        // Find critical items (appear in both periods)
        const criticalItems = this.findCriticalItems(aggregated16, aggregated42);

        // Calculate historical trends for critical items
        const withTrends = this.calculateTrends(criticalItems, byYear);

        // Risk scoring
        const withRisk = this.calculateRiskScores(withTrends);

        // Generate recommendations
        const recommendations = this.generateRecommendations(withRisk, byYear);

        return {
            week16Items: aggregated16,
            week42Items: aggregated42,
            criticalItems: withRisk,
            recommendations: recommendations,
            totalOrders16: week16Data.length,
            totalOrders42: week42Data.length,
            uniqueItems16: aggregated16.length,
            uniqueItems42: aggregated42.length,
            yearsCovered: Object.keys(byYear).length
        };
    }

    /**
     * Group data by year
     */
    static groupByYear(data) {
        const byYear = {};

        data.forEach(row => {
            const year = row._year;
            if (!byYear[year]) {
                byYear[year] = [];
            }
            byYear[year].push(row);
        });

        return byYear;
    }

    /**
     * Aggregate items with quantities and order counts
     */
    static aggregateByItem(items) {
        const aggregated = {};

        items.forEach(item => {
            const itemNo = item._item;
            const quantity = item._quantity;

            if (!itemNo) return;

            if (!aggregated[itemNo]) {
                aggregated[itemNo] = {
                    itemNo: itemNo,
                    name: item['Item Name'] || item['Navn'] || item.name || '',
                    totalQty: 0,
                    orderCount: 0,
                    orders: []
                };
            }

            aggregated[itemNo].totalQty += quantity;
            aggregated[itemNo].orderCount += 1;
            aggregated[itemNo].orders.push({
                week: item._week,
                year: item._year,
                qty: quantity
            });
        });

        return Object.values(aggregated).sort((a, b) => b.totalQty - a.totalQty);
    }

    /**
     * Find critical items appearing in both shutdown periods
     */
    static findCriticalItems(items16, items42) {
        const map16 = new Map(items16.map(i => [i.itemNo, i]));
        const map42 = new Map(items42.map(i => [i.itemNo, i]));

        const critical = [];

        map16.forEach((item, itemNo) => {
            if (map42.has(itemNo)) {
                const item42 = map42.get(itemNo);
                critical.push({
                    itemNo: item.itemNo,
                    name: item.name,
                    qty16: item.totalQty,
                    qty42: item42.totalQty,
                    orders16: item.orderCount,
                    orders42: item42.orderCount,
                    totalQty: item.totalQty + item42.totalQty,
                    totalOrders: item.orderCount + item42.orderCount,
                    allOrders: [...item.orders, ...item42.orders]
                });
            }
        });

        return critical.sort((a, b) => b.totalQty - a.totalQty);
    }

    /**
     * Calculate historical trends for items
     */
    static calculateTrends(items, byYear) {
        const years = Object.keys(byYear).map(y => parseInt(y)).sort();

        return items.map(item => {
            const yearlyData = {};

            years.forEach(year => {
                const yearData = byYear[year];
                const itemInYear = yearData.filter(row =>
                    row._item === item.itemNo &&
                    ((row._week >= 14 && row._week <= 16) || (row._week >= 40 && row._week <= 42))
                );

                yearlyData[year] = {
                    orders: itemInYear.length,
                    totalQty: itemInYear.reduce((sum, row) => sum + row._quantity, 0)
                };
            });

            // Calculate trend (increasing/decreasing/stable)
            const qtyValues = years.map(y => yearlyData[y].totalQty);
            const trend = this.calculateTrendDirection(qtyValues);

            // Find max quantity across all years
            const maxQty = Math.max(...qtyValues, 0);

            return {
                ...item,
                yearlyData: yearlyData,
                trend: trend,
                maxHistoricalQty: maxQty,
                years: years
            };
        });
    }

    /**
     * Calculate trend direction from values
     */
    static calculateTrendDirection(values) {
        if (values.length < 2) return 'new';

        const recent = values.slice(-3); // Last 3 years
        const avg = recent.reduce((a, b) => a + b, 0) / recent.length;

        const increasing = recent.filter((v, i) => i > 0 && v > recent[i - 1]).length;
        const decreasing = recent.filter((v, i) => i > 0 && v < recent[i - 1]).length;

        if (increasing > decreasing) return 'increasing';
        if (decreasing > increasing) return 'decreasing';
        return 'stable';
    }

    /**
     * Calculate risk scores for items
     */
    static calculateRiskScores(items) {
        return items.map(item => {
            let score = 0;
            let level = 'low';
            const factors = [];

            // Factor 1: Total orders (weight: 30)
            if (item.totalOrders >= 10) {
                score += 30;
                factors.push('Høy ordrefrekvens');
            } else if (item.totalOrders >= 5) {
                score += 20;
                factors.push('Moderat ordrefrekvens');
            } else if (item.totalOrders >= 3) {
                score += 10;
            }

            // Factor 2: Trend (weight: 25)
            if (item.trend === 'increasing') {
                score += 25;
                factors.push('Økende trend');
            } else if (item.trend === 'stable') {
                score += 15;
            } else if (item.trend === 'new') {
                score += 10;
                factors.push('Ny vare');
            }

            // Factor 3: Total quantity (weight: 25)
            if (item.totalQty > 100) {
                score += 25;
                factors.push('Høyt volum');
            } else if (item.totalQty > 50) {
                score += 15;
            } else if (item.totalQty > 20) {
                score += 10;
            }

            // Factor 4: Appears in both periods (weight: 20)
            score += 20; // All critical items are in both periods
            factors.push('Begge stoppperioder');

            // Calculate level based on score
            if (score >= 70) {
                level = 'critical';
            } else if (score >= 50) {
                level = 'high';
            } else if (score >= 30) {
                level = 'medium';
            } else {
                level = 'low';
            }

            return {
                ...item,
                riskScore: score,
                riskLevel: level,
                riskFactors: factors
            };
        });
    }

    /**
     * Generate intelligent recommendations
     */
    static generateRecommendations(items, byYear) {
        const recommendations = [];

        // Top critical items
        const topCritical = items.filter(i => i.riskLevel === 'critical').slice(0, 10);
        if (topCritical.length > 0) {
            recommendations.push({
                type: 'critical',
                title: `${topCritical.length} kritiske varer må på lager før stopp`,
                items: topCritical.map(i => ({
                    itemNo: i.itemNo,
                    name: i.name,
                    recommendedQty: Math.ceil(i.maxHistoricalQty * 1.2), // +20% buffer
                    reason: `Historisk maks: ${i.maxHistoricalQty}, Trend: ${this.translateTrend(i.trend)}`
                }))
            });
        }

        // Increasing trend items
        const increasing = items.filter(i => i.trend === 'increasing').slice(0, 5);
        if (increasing.length > 0) {
            recommendations.push({
                type: 'warning',
                title: `${increasing.length} varer med økende etterspørsel`,
                items: increasing.map(i => ({
                    itemNo: i.itemNo,
                    name: i.name,
                    recommendedQty: Math.ceil(i.maxHistoricalQty * 1.3), // +30% buffer for growth
                    reason: 'Økende trend - vurder høyere lagerbeholdning'
                }))
            });
        }

        // New items (not in historical data)
        const newItems = items.filter(i => i.trend === 'new').slice(0, 5);
        if (newItems.length > 0) {
            recommendations.push({
                type: 'info',
                title: `${newItems.length} nye varer uten historikk`,
                items: newItems.map(i => ({
                    itemNo: i.itemNo,
                    name: i.name,
                    recommendedQty: Math.ceil(i.totalQty * 1.5),
                    reason: 'Ny vare - basert på nåværende data'
                }))
            });
        }

        return recommendations;
    }

    /**
     * Translate trend to Norwegian
     */
    static translateTrend(trend) {
        const translations = {
            'increasing': 'Økende',
            'decreasing': 'Synkende',
            'stable': 'Stabil',
            'new': 'Ny'
        };
        return translations[trend] || trend;
    }

    /**
     * Render comprehensive analysis
     */
    static renderAnalysis(analysis, rawData) {
        if (analysis.criticalItems.length === 0) {
            return `
                <p>Ingen kritiske varer identifisert i datasettet.</p>
                <p class="text-muted">Tips: Sørg for at dataene inneholder ordre fra uke 14-16 og 40-42.</p>
            `;
        }

        let html = '';

        // Summary cards
        html += '<div class="summary-cards">';
        html += `
            <div class="summary-card">
                <div class="card-value">${analysis.criticalItems.length}</div>
                <div class="card-label">Kritiske varer</div>
            </div>
            <div class="summary-card">
                <div class="card-value">${analysis.totalOrders16 + analysis.totalOrders42}</div>
                <div class="card-label">Totalt ordrelinjer</div>
            </div>
            <div class="summary-card">
                <div class="card-value">${analysis.yearsCovered}</div>
                <div class="card-label">År med data</div>
            </div>
        `;
        html += '</div>';

        // Export buttons
        html += '<div class="action-buttons" style="margin: 20px 0;">';
        html += '<button onclick="ShutdownAnalyzer.exportCriticalItems()" class="btn-secondary">📥 Eksporter kritiske varer (CSV)</button>';
        html += '<button onclick="ShutdownAnalyzer.exportRecommendations()" class="btn-secondary">📋 Eksporter anbefalinger</button>';
        html += '</div>';

        // Recommendations
        html += '<h3>Anbefalinger</h3>';
        html += '<div class="recommendations">';

        analysis.recommendations.forEach(rec => {
            const iconMap = {
                critical: '🔴',
                warning: '⚠️',
                info: 'ℹ️'
            };

            html += `<div class="recommendation recommendation-${rec.type}">`;
            html += `<h4>${iconMap[rec.type]} ${rec.title}</h4>`;
            html += '<table class="recommendation-table"><thead><tr>';
            html += '<th>Varenr</th><th>Navn</th><th>Anbefalt lager</th><th>Begrunnelse</th>';
            html += '</tr></thead><tbody>';

            rec.items.forEach(item => {
                html += '<tr>';
                html += `<td><strong>${item.itemNo}</strong></td>`;
                html += `<td>${item.name}</td>`;
                html += `<td class="qty-cell">${item.recommendedQty}</td>`;
                html += `<td class="text-muted">${item.reason}</td>`;
                html += '</tr>';
            });

            html += '</tbody></table></div>';
        });

        html += '</div>';

        // Critical items table with full details
        html += '<h3>Detaljert oversikt - Kritiske varer</h3>';
        html += '<div class="table-controls">';
        html += '<input type="text" id="shutdownSearch" placeholder="Søk etter varenummer eller navn..." class="search-input">';
        html += '<select id="riskFilter" class="filter-select">';
        html += '<option value="all">Alle risikonivåer</option>';
        html += '<option value="critical">Kun kritiske</option>';
        html += '<option value="high">Høy risiko</option>';
        html += '<option value="medium">Medium risiko</option>';
        html += '</select>';
        html += '</div>';

        html += '<table class="data-table" id="criticalItemsTable">';
        html += '<thead><tr>';
        html += '<th>Varenr</th>';
        html += '<th>Navn</th>';
        html += '<th>Risiko</th>';
        html += '<th>Ant. Uke 16</th>';
        html += '<th>Ant. Uke 42</th>';
        html += '<th>Ordrelinjer</th>';
        html += '<th>Trend</th>';
        html += '<th>Maks historisk</th>';
        html += '</tr></thead><tbody>';

        analysis.criticalItems.forEach(item => {
            const riskClass = 'risk-' + item.riskLevel;
            const trendIcon = {
                'increasing': '📈',
                'decreasing': '📉',
                'stable': '➡️',
                'new': '🆕'
            }[item.trend] || '';

            html += `<tr class="risk-row ${riskClass}" data-risk="${item.riskLevel}">`;
            html += `<td><strong>${item.itemNo}</strong></td>`;
            html += `<td>${item.name}</td>`;
            html += `<td><span class="risk-badge ${riskClass}">${item.riskLevel.toUpperCase()} (${item.riskScore})</span></td>`;
            html += `<td class="qty-cell">${item.qty16.toFixed(0)}</td>`;
            html += `<td class="qty-cell">${item.qty42.toFixed(0)}</td>`;
            html += `<td>${item.totalOrders}</td>`;
            html += `<td>${trendIcon} ${this.translateTrend(item.trend)}</td>`;
            html += `<td class="qty-cell">${item.maxHistoricalQty.toFixed(0)}</td>`;
            html += '</tr>';
        });

        html += '</tbody></table>';

        // Add search and filter functionality
        html += `
        <script>
            (function() {
                const searchInput = document.getElementById('shutdownSearch');
                const riskFilter = document.getElementById('riskFilter');
                const table = document.getElementById('criticalItemsTable');
                const rows = table.querySelectorAll('tbody tr');

                function filterTable() {
                    const searchTerm = searchInput.value.toLowerCase();
                    const riskLevel = riskFilter.value;

                    rows.forEach(row => {
                        const text = row.textContent.toLowerCase();
                        const rowRisk = row.getAttribute('data-risk');

                        const matchesSearch = text.includes(searchTerm);
                        const matchesRisk = riskLevel === 'all' || rowRisk === riskLevel;

                        row.style.display = matchesSearch && matchesRisk ? '' : 'none';
                    });
                }

                if (searchInput) searchInput.addEventListener('input', filterTable);
                if (riskFilter) riskFilter.addEventListener('change', filterTable);
            })();
        </script>
        `;

        return html;
    }

    /**
     * Export critical items as CSV
     */
    static exportCriticalItems() {
        if (!window.app || !window.app.data.shutdown.length) {
            alert('Ingen data å eksportere');
            return;
        }

        const enrichedData = this.enrichData(window.app.data.shutdown);
        const analysis = this.analyzeShutdownPeriods(enrichedData);

        if (analysis.criticalItems.length === 0) {
            alert('Ingen kritiske varer funnet');
            return;
        }

        const headers = [
            'Varenummer',
            'Navn',
            'Risikonivå',
            'Risikoscore',
            'Antall Uke 16',
            'Antall Uke 42',
            'Totalt',
            'Ordrelinjer',
            'Trend',
            'Maks historisk',
            'Anbefalt lager',
            'Risikofaktorer'
        ];

        let csv = headers.join(',') + '\n';

        analysis.criticalItems.forEach(item => {
            const recommendedQty = Math.ceil(item.maxHistoricalQty * 1.2);
            const row = [
                item.itemNo,
                `"${item.name}"`,
                item.riskLevel,
                item.riskScore,
                item.qty16.toFixed(0),
                item.qty42.toFixed(0),
                item.totalQty.toFixed(0),
                item.totalOrders,
                this.translateTrend(item.trend),
                item.maxHistoricalQty.toFixed(0),
                recommendedQty,
                `"${item.riskFactors.join('; ')}"`
            ];

            csv += row.join(',') + '\n';
        });

        const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `kritiske-varer-vedlikeholdsstopp-${new Date().toISOString().split('T')[0]}.csv`;
        a.click();
        URL.revokeObjectURL(url);
    }

    /**
     * Export recommendations
     */
    static exportRecommendations() {
        if (!window.app || !window.app.data.shutdown.length) {
            alert('Ingen data å eksportere');
            return;
        }

        const enrichedData = this.enrichData(window.app.data.shutdown);
        const analysis = this.analyzeShutdownPeriods(enrichedData);

        const headers = ['Type', 'Varenummer', 'Navn', 'Anbefalt lager', 'Begrunnelse'];
        let csv = headers.join(',') + '\n';

        analysis.recommendations.forEach(rec => {
            rec.items.forEach(item => {
                csv += [
                    rec.type,
                    item.itemNo,
                    `"${item.name}"`,
                    item.recommendedQty,
                    `"${item.reason}"`
                ].join(',') + '\n';
            });
        });

        const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `anbefalinger-vedlikeholdsstopp-${new Date().toISOString().split('T')[0]}.csv`;
        a.click();
        URL.revokeObjectURL(url);
    }

    /**
     * Get critical count for summary
     */
    static getCriticalCount(data) {
        if (!data || data.length === 0) return 0;

        const enrichedData = this.enrichData(data);
        const analysis = this.analyzeShutdownPeriods(enrichedData);
        return analysis.criticalItems.filter(i => i.riskLevel === 'critical').length;
    }
}

window.ShutdownAnalyzer = ShutdownAnalyzer;
