// ===================================
// SHUTDOWN ANALYZER
// Week 16 & 42 maintenance planning
// ===================================

class ShutdownAnalyzer {
    static update(data) {
        const resultsDiv = document.getElementById('shutdownResults');
        const statusBadge = document.getElementById('shutdownStatus');
        
        if (!data || data.length === 0) {
            resultsDiv.innerHTML = '<p class="placeholder">Ingen data lastet inn ennå.</p>';
            statusBadge.textContent = 'Ingen data';
            statusBadge.className = 'status-badge';
            return;
        }

        // Analyze data
        const analysis = this.analyzeShutdownPeriods(data);
        
        // Update status
        statusBadge.textContent = `${analysis.criticalItems.length} kritiske varer`;
        statusBadge.className = 'status-badge ' + (analysis.criticalItems.length > 0 ? 'warning' : 'ok');
        
        // Render results
        resultsDiv.innerHTML = this.renderAnalysis(analysis);
    }

    static analyzeShutdownPeriods(data) {
        const week16Items = [];
        const week42Items = [];
        
        data.forEach(row => {
            const week = this.extractWeek(row);
            
            if (week >= 14 && week <= 16) {
                week16Items.push(row);
            } else if (week >= 40 && week <= 42) {
                week42Items.push(row);
            }
        });

        // Aggregate by item
        const aggregated16 = this.aggregateByItem(week16Items);
        const aggregated42 = this.aggregateByItem(week42Items);
        
        // Find critical items (appear in both periods)
        const criticalItems = this.findCriticalItems(aggregated16, aggregated42);

        return {
            week16Items: aggregated16,
            week42Items: aggregated42,
            criticalItems: criticalItems,
            totalOrders16: week16Items.length,
            totalOrders42: week42Items.length
        };
    }

    static extractWeek(row) {
        // Try to extract week number from various column names
        const weekFields = ['Week', 'week', 'Uke', 'uke', 'Week Number', 'Ukenummer'];
        
        for (let field of weekFields) {
            if (row[field]) {
                const num = parseInt(row[field]);
                if (!isNaN(num)) return num;
            }
        }
        
        // Try to extract from date fields
        const dateFields = ['Order Date', 'Date', 'Dato', 'OrderDate'];
        for (let field of dateFields) {
            if (row[field]) {
                const week = this.getWeekNumber(new Date(row[field]));
                if (week) return week;
            }
        }
        
        return 0;
    }

    static getWeekNumber(date) {
        if (!(date instanceof Date) || isNaN(date)) return 0;
        
        const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
        const dayNum = d.getUTCDay() || 7;
        d.setUTCDate(d.getUTCDate() + 4 - dayNum);
        const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
        return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
    }

    static aggregateByItem(items) {
        const aggregated = {};
        
        items.forEach(item => {
            const itemNo = item['Item'] || item['Item Number'] || item['Varenummer'] || item['Artikkel'];
            const quantity = parseFloat(item['Quantity'] || item['Antall'] || 0);
            
            if (!itemNo) return;
            
            if (!aggregated[itemNo]) {
                aggregated[itemNo] = {
                    itemNo: itemNo,
                    name: item['Item Name'] || item['Navn'] || '',
                    totalQty: 0,
                    orderCount: 0
                };
            }
            
            aggregated[itemNo].totalQty += quantity;
            aggregated[itemNo].orderCount += 1;
        });
        
        return Object.values(aggregated).sort((a, b) => b.totalQty - a.totalQty);
    }

    static findCriticalItems(items16, items42) {
        const map16 = new Map(items16.map(i => [i.itemNo, i]));
        const map42 = new Map(items42.map(i => [i.itemNo, i]));
        
        const critical = [];
        
        map16.forEach((item, itemNo) => {
            if (map42.has(itemNo)) {
                critical.push({
                    ...item,
                    qty42: map42.get(itemNo).totalQty
                });
            }
        });
        
        return critical.sort((a, b) => (b.totalQty + b.qty42) - (a.totalQty + a.qty42));
    }

    static renderAnalysis(analysis) {
        if (analysis.criticalItems.length === 0) {
            return '<p>Ingen kritiske varer identifisert i datasettet.</p>';
        }

        let html = '<h3>Kritiske varer (forekommer i begge stoppperioder)</h3>';
        html += '<table>';
        html += '<thead><tr>';
        html += '<th>Varenr</th>';
        html += '<th>Navn</th>';
        html += '<th>Antall (Uke 16)</th>';
        html += '<th>Antall (Uke 42)</th>';
        html += '<th>Ordrelinjer</th>';
        html += '</tr></thead><tbody>';
        
        analysis.criticalItems.slice(0, 20).forEach(item => {
            html += '<tr>';
            html += `<td>${item.itemNo}</td>`;
            html += `<td>${item.name}</td>`;
            html += `<td>${item.totalQty.toFixed(0)}</td>`;
            html += `<td>${item.qty42.toFixed(0)}</td>`;
            html += `<td>${item.orderCount}</td>`;
            html += '</tr>';
        });
        
        html += '</tbody></table>';
        
        return html;
    }
}

window.ShutdownAnalyzer = ShutdownAnalyzer;