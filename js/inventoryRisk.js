// ===================================
// INVENTORY RISK - ENHANCED
// 7 satellite warehouse monitoring with predictive analytics
// Advanced risk calculation, lead time awareness, and transfer suggestions
// ===================================

/**
 * InventoryRisk - Advanced multi-warehouse inventory monitoring
 * Tracks stock levels, calculates risk scores, and suggests actions
 */
class InventoryRisk {
    /**
     * Update inventory risk display
     */
    static update(data) {
        const resultsDiv = document.getElementById('inventoryResults');
        const statusBadge = document.getElementById('inventoryStatus');

        if (!data || data.length === 0) {
            resultsDiv.innerHTML = `
                <p class="placeholder">
                    Last opp lagerdata for å se risikooversikt.
                    <br><br>
                    <strong>Tips:</strong> Filen bør inneholde: Lager, Varenummer, Beholdning, Min, Max
                </p>
            `;
            statusBadge.textContent = 'Ingen data';
            statusBadge.className = 'status-badge';
            return;
        }

        // Enrich data with calculated fields
        const enrichedData = this.enrichInventoryData(data);

        // Perform comprehensive analysis
        const analysis = this.analyzeInventory(enrichedData);

        // Update status badge
        const riskLevel = this.calculateOverallRisk(analysis);
        statusBadge.textContent = riskLevel.text;
        statusBadge.className = 'status-badge ' + riskLevel.class;

        // Render comprehensive dashboard
        resultsDiv.innerHTML = this.renderInventoryDashboard(analysis, enrichedData);
    }

    /**
     * Enrich inventory data with calculated fields
     */
    static enrichInventoryData(data) {
        return data.map(row => {
            const enriched = { ...row };

            // Extract standardized fields
            enriched._warehouse = this.extractWarehouse(row);
            enriched._item = this.extractItem(row);
            enriched._stock = this.extractStock(row);
            enriched._min = this.extractMin(row);
            enriched._max = this.extractMax(row);
            enriched._leadTime = this.extractLeadTime(row);
            enriched._consumption = this.extractConsumption(row);

            // Calculate risk score
            enriched._riskScore = this.calculateRiskScore(
                enriched._stock,
                enriched._min,
                enriched._max,
                enriched._leadTime,
                enriched._consumption
            );

            // Calculate days until critical
            enriched._daysUntilCritical = this.calculateDaysUntilCritical(
                enriched._stock,
                enriched._min,
                enriched._consumption
            );

            // Calculate runway (days of stock remaining)
            enriched._runway = this.calculateRunway(enriched._stock, enriched._consumption);

            return enriched;
        }).filter(row => row._item); // Filter out rows without item numbers
    }

    /**
     * Extract warehouse from row
     */
    static extractWarehouse(row) {
        const fields = ['Warehouse', 'warehouse', 'Lager', 'lager', 'Location', 'Lokasjon'];
        for (let field of fields) {
            if (row[field]) return row[field].toString().trim();
        }
        return 'Ukjent';
    }

    /**
     * Extract item number from row
     */
    static extractItem(row) {
        const fields = ['Item', 'ItemNo', 'Item Number', 'Varenummer', 'Artikkel', 'item'];
        for (let field of fields) {
            if (row[field]) return row[field].toString().trim();
        }
        return null;
    }

    /**
     * Extract stock from row
     */
    static extractStock(row) {
        const fields = ['Stock', 'On Hand', 'Beholdning', 'Lagerbeholdning', 'stock', 'Qty'];
        for (let field of fields) {
            if (row[field] !== undefined) {
                const val = parseFloat(row[field]);
                return isNaN(val) ? 0 : val;
            }
        }
        return 0;
    }

    /**
     * Extract min stock from row
     */
    static extractMin(row) {
        const fields = ['Min', 'Minimum', 'Min Stock', 'Minbeholdning', 'min'];
        for (let field of fields) {
            if (row[field] !== undefined) {
                const val = parseFloat(row[field]);
                return isNaN(val) ? 0 : val;
            }
        }
        return 0;
    }

    /**
     * Extract max stock from row
     */
    static extractMax(row) {
        const fields = ['Max', 'Maximum', 'Max Stock', 'Maksbeholdning', 'max'];
        for (let field of fields) {
            if (row[field] !== undefined) {
                const val = parseFloat(row[field]);
                return isNaN(val) ? 0 : val;
            }
        }
        return 0;
    }

    /**
     * Extract lead time from row
     */
    static extractLeadTime(row) {
        const fields = ['Lead Time', 'LeadTime', 'Leveringstid', 'lead_time'];
        for (let field of fields) {
            if (row[field] !== undefined) {
                const val = parseFloat(row[field]);
                return isNaN(val) ? 0 : val;
            }
        }
        return 0; // Unknown lead time
    }

    /**
     * Extract consumption rate from row
     */
    static extractConsumption(row) {
        const fields = ['Consumption', 'Daily Usage', 'Forbruk', 'Daglig forbruk', 'consumption'];
        for (let field of fields) {
            if (row[field] !== undefined) {
                const val = parseFloat(row[field]);
                return isNaN(val) ? 0 : val;
            }
        }
        return 0; // Unknown consumption
    }

    /**
     * Calculate advanced risk score
     * Score from 0-100, where 100 is critical
     */
    static calculateRiskScore(stock, min, max, leadTime, consumption) {
        let score = 0;

        // Factor 1: Stock vs Min (40 points)
        if (stock === 0) {
            score += 40;
        } else if (min > 0) {
            const ratio = stock / min;
            if (ratio <= 0) score += 40;
            else if (ratio <= 0.5) score += 30;
            else if (ratio <= 0.75) score += 20;
            else if (ratio <= 1) score += 10;
        }

        // Factor 2: Lead time risk (30 points)
        if (leadTime > 0 && consumption > 0) {
            const daysOfStock = stock / consumption;
            if (daysOfStock < leadTime) {
                score += 30; // Can't be replenished in time
            } else if (daysOfStock < leadTime * 1.5) {
                score += 20;
            } else if (daysOfStock < leadTime * 2) {
                score += 10;
            }
        }

        // Factor 3: Consumption rate (20 points)
        if (consumption > 0) {
            const runway = stock / consumption;
            if (runway < 7) score += 20;
            else if (runway < 14) score += 10;
            else if (runway < 30) score += 5;
        }

        // Factor 4: Zero stock (10 points)
        if (stock === 0) {
            score += 10;
        }

        return Math.min(score, 100);
    }

    /**
     * Calculate days until stock becomes critical
     */
    static calculateDaysUntilCritical(stock, min, consumption) {
        if (stock <= min) return 0;
        if (consumption === 0) return Infinity;

        return Math.floor((stock - min) / consumption);
    }

    /**
     * Calculate runway (days of stock remaining)
     */
    static calculateRunway(stock, consumption) {
        if (consumption === 0 || consumption === null) return Infinity;
        if (stock <= 0) return 0;

        return Math.floor(stock / consumption);
    }

    /**
     * Analyze inventory comprehensively
     */
    static analyzeInventory(data) {
        // Group by warehouse
        const byWarehouse = this.groupByWarehouse(data);

        // Find multi-warehouse items
        const multiWarehouseItems = this.findMultiWarehouseItems(data);

        // Generate transfer suggestions
        const transferSuggestions = this.generateTransferSuggestions(multiWarehouseItems);

        // Get critical items needing attention
        const criticalItems = data.filter(item => item._riskScore >= 70)
            .sort((a, b) => b._riskScore - a._riskScore);

        // Get items with short runway
        const shortRunway = data.filter(item => item._runway > 0 && item._runway < 14)
            .sort((a, b) => a._runway - b._runway);

        return {
            warehouses: byWarehouse,
            multiWarehouseItems: multiWarehouseItems,
            transferSuggestions: transferSuggestions,
            criticalItems: criticalItems,
            shortRunway: shortRunway,
            totalItems: data.length,
            criticalCount: criticalItems.length
        };
    }

    /**
     * Group data by warehouse
     */
    static groupByWarehouse(data) {
        const warehouses = {};

        data.forEach(item => {
            const wh = item._warehouse;

            if (!warehouses[wh]) {
                warehouses[wh] = {
                    name: wh,
                    items: [],
                    critical: 0,
                    high: 0,
                    medium: 0,
                    low: 0,
                    ok: 0
                };
            }

            warehouses[wh].items.push(item);

            // Categorize by risk score
            if (item._riskScore >= 70) warehouses[wh].critical++;
            else if (item._riskScore >= 50) warehouses[wh].high++;
            else if (item._riskScore >= 30) warehouses[wh].medium++;
            else if (item._riskScore >= 10) warehouses[wh].low++;
            else warehouses[wh].ok++;
        });

        return Object.values(warehouses);
    }

    /**
     * Find items that exist in multiple warehouses
     */
    static findMultiWarehouseItems(data) {
        const byItem = {};

        data.forEach(row => {
            const item = row._item;
            if (!byItem[item]) {
                byItem[item] = {
                    itemNo: item,
                    warehouses: []
                };
            }

            byItem[item].warehouses.push({
                warehouse: row._warehouse,
                stock: row._stock,
                min: row._min,
                max: row._max,
                riskScore: row._riskScore
            });
        });

        // Filter to only items in multiple warehouses
        return Object.values(byItem)
            .filter(item => item.warehouses.length > 1)
            .map(item => {
                item.totalStock = item.warehouses.reduce((sum, wh) => sum + wh.stock, 0);
                item.hasCritical = item.warehouses.some(wh => wh.riskScore >= 70);
                return item;
            });
    }

    /**
     * Generate transfer suggestions between warehouses
     */
    static generateTransferSuggestions(multiWarehouseItems) {
        const suggestions = [];

        multiWarehouseItems.forEach(item => {
            // Find warehouses with excess and deficit
            const critical = item.warehouses.filter(wh => wh.riskScore >= 70);
            const ok = item.warehouses.filter(wh => wh.riskScore < 30 && wh.stock > wh.min * 1.5);

            if (critical.length > 0 && ok.length > 0) {
                critical.forEach(critWh => {
                    ok.forEach(okWh => {
                        const deficit = Math.max(critWh.min - critWh.stock, 0);
                        const excess = Math.max(okWh.stock - okWh.min * 1.5, 0);
                        const transferQty = Math.min(deficit, excess);

                        if (transferQty > 0) {
                            suggestions.push({
                                itemNo: item.itemNo,
                                from: okWh.warehouse,
                                to: critWh.warehouse,
                                quantity: Math.ceil(transferQty),
                                priority: critWh.riskScore >= 90 ? 'high' : 'medium',
                                reason: `${critWh.warehouse} har kritisk lav beholdning, ${okWh.warehouse} har overskudd`
                            });
                        }
                    });
                });
            }
        });

        return suggestions.sort((a, b) => {
            if (a.priority === 'high' && b.priority !== 'high') return -1;
            if (a.priority !== 'high' && b.priority === 'high') return 1;
            return 0;
        });
    }

    /**
     * Calculate overall risk level
     */
    static calculateOverallRisk(analysis) {
        const critical = analysis.criticalCount;

        if (critical >= 10) {
            return { text: `${critical} kritisk`, class: 'critical' };
        } else if (critical > 0) {
            return { text: `${critical} kritisk`, class: 'warning' };
        } else {
            return { text: 'Alt OK', class: 'ok' };
        }
    }

    /**
     * Render comprehensive inventory dashboard
     */
    static renderInventoryDashboard(analysis, rawData) {
        let html = '';

        // Summary cards
        html += '<div class="summary-cards">';
        html += `
            <div class="summary-card card-critical">
                <div class="card-value">${analysis.criticalCount}</div>
                <div class="card-label">Kritiske varer</div>
            </div>
            <div class="summary-card">
                <div class="card-value">${analysis.warehouses.length}</div>
                <div class="card-label">Lagre</div>
            </div>
            <div class="summary-card">
                <div class="card-value">${analysis.totalItems}</div>
                <div class="card-label">Totalt varer</div>
            </div>
            <div class="summary-card">
                <div class="card-value">${analysis.transferSuggestions.length}</div>
                <div class="card-label">Forslag til flytting</div>
            </div>
        `;
        html += '</div>';

        // Action buttons
        html += '<div class="action-buttons" style="margin: 20px 0;">';
        html += '<button onclick="InventoryRisk.exportCritical()" class="btn-secondary">📥 Eksporter kritiske varer</button>';
        html += '<button onclick="InventoryRisk.exportTransfers()" class="btn-secondary">🔄 Eksporter flytteforslag</button>';
        html += '</div>';

        // Transfer suggestions
        if (analysis.transferSuggestions.length > 0) {
            html += '<div class="alert alert-info">';
            html += `<h3>🔄 Forslag til lagerflytting (${analysis.transferSuggestions.length})</h3>`;
            html += '<table class="data-table"><thead><tr>';
            html += '<th>Prioritet</th><th>Varenr</th><th>Fra lager</th><th>Til lager</th><th>Antall</th><th>Begrunnelse</th>';
            html += '</tr></thead><tbody>';

            analysis.transferSuggestions.slice(0, 10).forEach(sug => {
                html += `<tr class="priority-${sug.priority}">`;
                html += `<td><span class="priority-badge ${sug.priority}">${sug.priority === 'high' ? 'HØY' : 'MEDIUM'}</span></td>`;
                html += `<td><strong>${sug.itemNo}</strong></td>`;
                html += `<td>${sug.from}</td>`;
                html += `<td>${sug.to}</td>`;
                html += `<td class="qty-cell">${sug.quantity}</td>`;
                html += `<td class="text-muted">${sug.reason}</td>`;
                html += '</tr>';
            });

            html += '</tbody></table></div>';
        }

        // Warehouse cards
        html += '<h3>Lageroversikt</h3>';
        html += '<div class="warehouse-grid">';

        analysis.warehouses.forEach(wh => {
            const statusClass = wh.critical > 0 ? 'critical' :
                wh.high > 0 ? 'warning' : 'ok';

            html += `<div class="warehouse-card ${statusClass}">`;
            html += `<h4>${wh.name}</h4>`;
            html += `<div class="warehouse-stats">`;
            html += `<span class="stat stat-critical">Kritisk: ${wh.critical}</span>`;
            html += `<span class="stat stat-high">Høy: ${wh.high}</span>`;
            html += `<span class="stat stat-medium">Medium: ${wh.medium}</span>`;
            html += `<span class="stat stat-ok">OK: ${wh.ok}</span>`;
            html += `</div>`;

            // Show critical items
            if (wh.critical > 0) {
                html += '<div class="critical-items">';
                html += '<strong>Kritiske varer:</strong><ul>';
                wh.items.filter(i => i._riskScore >= 70).slice(0, 5).forEach(item => {
                    html += `<li>${item._item} - Beholdning: ${item._stock.toFixed(0)}, Min: ${item._min.toFixed(0)}`;
                    if (item._runway > 0 && item._runway < 100) {
                        html += ` (${item._runway} dager igjen)`;
                    }
                    html += `</li>`;
                });
                html += '</ul></div>';
            }

            html += `</div>`;
        });

        html += '</div>';

        // Critical items requiring immediate attention
        if (analysis.criticalItems.length > 0) {
            html += '<h3>⚠️ Varer som krever handling nå</h3>';
            html += '<div class="table-controls">';
            html += '<input type="text" id="inventorySearch" placeholder="Søk..." class="search-input">';
            html += '</div>';

            html += '<table class="data-table" id="criticalInventoryTable">';
            html += '<thead><tr>';
            html += '<th>Lager</th><th>Varenr</th><th>Beholdning</th><th>Min</th><th>Max</th>';
            html += '<th>Risiko</th><th>Dager igjen</th><th>Handling</th>';
            html += '</tr></thead><tbody>';

            analysis.criticalItems.forEach(item => {
                const riskClass = item._riskScore >= 90 ? 'risk-critical' :
                    item._riskScore >= 70 ? 'risk-high' : 'risk-medium';

                html += `<tr class="${riskClass}">`;
                html += `<td>${item._warehouse}</td>`;
                html += `<td><strong>${item._item}</strong></td>`;
                html += `<td class="qty-cell">${item._stock.toFixed(0)}</td>`;
                html += `<td class="qty-cell">${item._min.toFixed(0)}</td>`;
                html += `<td class="qty-cell">${item._max.toFixed(0)}</td>`;
                html += `<td><span class="risk-badge ${riskClass}">${item._riskScore}</span></td>`;

                if (item._runway === 0) {
                    html += `<td class="text-critical">TOMT</td>`;
                } else if (item._runway === Infinity) {
                    html += `<td>-</td>`;
                } else {
                    html += `<td>${item._runway} dager</td>`;
                }

                html += `<td class="text-muted">`;
                if (item._stock === 0) {
                    html += 'Bestill umiddelbart';
                } else if (item._stock < item._min) {
                    html += 'Under minimum';
                } else {
                    html += 'Sjekk tilgjengelighet';
                }
                html += `</td>`;

                html += '</tr>';
            });

            html += '</tbody></table>';

            // Add search functionality
            html += `
            <script>
                (function() {
                    const searchInput = document.getElementById('inventorySearch');
                    if (searchInput) {
                        searchInput.addEventListener('input', function(e) {
                            const searchTerm = e.target.value.toLowerCase();
                            const rows = document.querySelectorAll('#criticalInventoryTable tbody tr');
                            rows.forEach(row => {
                                const text = row.textContent.toLowerCase();
                                row.style.display = text.includes(searchTerm) ? '' : 'none';
                            });
                        });
                    }
                })();
            </script>
            `;
        }

        return html;
    }

    /**
     * Export critical items
     */
    static exportCritical() {
        if (!window.app || !window.app.data.inventory.length) {
            alert('Ingen data å eksportere');
            return;
        }

        const enrichedData = this.enrichInventoryData(window.app.data.inventory);
        const analysis = this.analyzeInventory(enrichedData);

        if (analysis.criticalItems.length === 0) {
            alert('Ingen kritiske varer funnet');
            return;
        }

        const headers = [
            'Lager',
            'Varenummer',
            'Beholdning',
            'Minimum',
            'Maksimum',
            'Risikoscore',
            'Dager igjen',
            'Leveringstid',
            'Handling'
        ];

        let csv = headers.join(',') + '\n';

        analysis.criticalItems.forEach(item => {
            const daysLeft = item._runway === Infinity ? 'Ukjent' :
                item._runway === 0 ? 'TOMT' : item._runway;

            csv += [
                `"${item._warehouse}"`,
                item._item,
                item._stock.toFixed(0),
                item._min.toFixed(0),
                item._max.toFixed(0),
                item._riskScore,
                daysLeft,
                item._leadTime || 'Ukjent',
                item._stock === 0 ? 'Bestill umiddelbart' : 'Under minimum'
            ].join(',') + '\n';
        });

        const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `kritiske-lagervarer-${new Date().toISOString().split('T')[0]}.csv`;
        a.click();
        URL.revokeObjectURL(url);
    }

    /**
     * Export transfer suggestions
     */
    static exportTransfers() {
        if (!window.app || !window.app.data.inventory.length) {
            alert('Ingen data å eksportere');
            return;
        }

        const enrichedData = this.enrichInventoryData(window.app.data.inventory);
        const analysis = this.analyzeInventory(enrichedData);

        if (analysis.transferSuggestions.length === 0) {
            alert('Ingen flytteforslag funnet');
            return;
        }

        const headers = ['Prioritet', 'Varenummer', 'Fra lager', 'Til lager', 'Antall', 'Begrunnelse'];
        let csv = headers.join(',') + '\n';

        analysis.transferSuggestions.forEach(sug => {
            csv += [
                sug.priority,
                sug.itemNo,
                `"${sug.from}"`,
                `"${sug.to}"`,
                sug.quantity,
                `"${sug.reason}"`
            ].join(',') + '\n';
        });

        const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `lagerflytting-forslag-${new Date().toISOString().split('T')[0]}.csv`;
        a.click();
        URL.revokeObjectURL(url);
    }

    /**
     * Get critical count for summary
     */
    static getCriticalCount(data) {
        if (!data || data.length === 0) return 0;

        const enrichedData = this.enrichInventoryData(data);
        return enrichedData.filter(item => item._riskScore >= 70).length;
    }
}

window.InventoryRisk = InventoryRisk;
