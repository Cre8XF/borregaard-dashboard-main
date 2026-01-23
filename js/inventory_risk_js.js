// ===================================
// INVENTORY RISK
// 7 satellite warehouse monitoring
// ===================================

class InventoryRisk {
    static update(data) {
        const resultsDiv = document.getElementById('inventoryResults');
        const statusBadge = document.getElementById('inventoryStatus');
        
        if (!data || data.length === 0) {
            resultsDiv.innerHTML = '<p class="placeholder">Ingen lagerdata lastet inn ennå.</p>';
            statusBadge.textContent = 'Ingen data';
            statusBadge.className = 'status-badge';
            return;
        }

        // Analyze inventory risk
        const analysis = this.analyzeInventory(data);
        
        // Update status badge
        const riskLevel = this.calculateOverallRisk(analysis);
        statusBadge.textContent = riskLevel.text;
        statusBadge.className = 'status-badge ' + riskLevel.class;
        
        // Render results
        resultsDiv.innerHTML = this.renderInventoryStatus(analysis);
    }

    static analyzeInventory(data) {
        const byWarehouse = {};
        
        data.forEach(row => {
            const warehouse = row['Warehouse'] || row['Lager'] || 'Unknown';
            const item = row['Item'] || row['Varenummer'] || '';
            const stock = parseFloat(row['Stock'] || row['Beholdning'] || 0);
            const min = parseFloat(row['Min'] || row['Minimum'] || 0);
            const max = parseFloat(row['Max'] || row['Maksimum'] || 0);
            
            if (!byWarehouse[warehouse]) {
                byWarehouse[warehouse] = {
                    name: warehouse,
                    items: [],
                    critical: 0,
                    warning: 0,
                    ok: 0
                };
            }
            
            const riskStatus = this.calculateRiskStatus(stock, min, max);
            
            byWarehouse[warehouse].items.push({
                item,
                stock,
                min,
                max,
                status: riskStatus
            });
            
            byWarehouse[warehouse][riskStatus]++;
        });
        
        return Object.values(byWarehouse);
    }

    static calculateRiskStatus(stock, min, max) {
        if (stock === 0) return 'critical';
        if (stock < min) return 'critical';
        if (stock < min * 1.5) return 'warning';
        return 'ok';
    }

    static calculateOverallRisk(warehouses) {
        let totalCritical = 0;
        let totalWarning = 0;
        
        warehouses.forEach(wh => {
            totalCritical += wh.critical;
            totalWarning += wh.warning;
        });
        
        if (totalCritical > 0) {
            return { text: `${totalCritical} kritisk`, class: 'critical' };
        } else if (totalWarning > 0) {
            return { text: `${totalWarning} advarsel`, class: 'warning' };
        } else {
            return { text: 'Alt OK', class: 'ok' };
        }
    }

    static renderInventoryStatus(warehouses) {
        if (warehouses.length === 0) {
            return '<p>Ingen lagerdata å vise.</p>';
        }

        let html = '<div class="warehouse-grid">';
        
        warehouses.forEach(wh => {
            const statusClass = wh.critical > 0 ? 'critical' : 
                               wh.warning > 0 ? 'warning' : 'ok';
            
            html += `<div class="warehouse-card ${statusClass}">`;
            html += `<h4>${wh.name}</h4>`;
            html += `<div class="warehouse-stats">`;
            html += `<span class="stat critical">Kritisk: ${wh.critical}</span>`;
            html += `<span class="stat warning">Advarsel: ${wh.warning}</span>`;
            html += `<span class="stat ok">OK: ${wh.ok}</span>`;
            html += `</div>`;
            
            // Show critical items if any
            if (wh.critical > 0) {
                html += '<div class="critical-items">';
                html += '<strong>Kritiske varer:</strong><ul>';
                wh.items.filter(i => i.status === 'critical').slice(0, 5).forEach(item => {
                    html += `<li>${item.item} (Beholdning: ${item.stock})</li>`;
                });
                html += '</ul></div>';
            }
            
            html += `</div>`;
        });
        
        html += '</div>';
        
        // Add inline styles for warehouse cards
        html += `<style>
            .warehouse-grid { 
                display: grid; 
                grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); 
                gap: 15px; 
                margin-top: 15px; 
            }
            .warehouse-card { 
                padding: 15px; 
                border-radius: 6px; 
                border: 2px solid #ecf0f1; 
            }
            .warehouse-card.critical { border-color: #e74c3c; background: #fadbd8; }
            .warehouse-card.warning { border-color: #f39c12; background: #fef5e7; }
            .warehouse-card.ok { border-color: #27ae60; background: #d5f4e6; }
            .warehouse-card h4 { margin-bottom: 10px; font-size: 16px; }
            .warehouse-stats { display: flex; gap: 10px; margin-bottom: 10px; }
            .stat { font-size: 13px; padding: 3px 8px; border-radius: 3px; }
            .stat.critical { background: #e74c3c; color: white; }
            .stat.warning { background: #f39c12; color: white; }
            .stat.ok { background: #27ae60; color: white; }
            .critical-items { margin-top: 10px; font-size: 13px; }
            .critical-items ul { margin-left: 20px; margin-top: 5px; }
        </style>`;
        
        return html;
    }
}

window.InventoryRisk = InventoryRisk;