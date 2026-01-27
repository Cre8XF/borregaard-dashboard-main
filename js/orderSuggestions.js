// ===================================
// ORDER SUGGESTIONS MODULE
// Shows items that need BP adjustments
// ===================================

/**
 * Priority categories for ordering suggestions
 */
const PRIORITY_CATEGORIES = {
    CRITICAL: {
        level: 1,
        icon: '🔴',
        label: 'Kritisk',
        cssClass: 'priority-critical'
    },
    HIGH: {
        level: 2,
        icon: '🟡',
        label: 'Viktig',
        cssClass: 'priority-high'
    },
    MEDIUM: {
        level: 3,
        icon: '🟢',
        label: 'Optimalisering',
        cssClass: 'priority-medium'
    }
};

/**
 * OrderSuggestions - Display BP optimization recommendations
 */
class OrderSuggestions {
    static currentData = [];
    static suggestions = [];
    static filterPriority = 'all';
    static completedItems = new Set();

    /**
     * Render the order suggestions view
     * @param {Array} data - Processed item data
     * @returns {string} HTML content
     */
    static render(data) {
        this.currentData = data;
        this.suggestions = this.analyzaItems(data);

        return `
            <div class="module-header">
                <h2>Bestillingsforslag - Artikler som krever handling</h2>
                <div class="module-controls">
                    <select id="priorityFilter" class="filter-select" onchange="OrderSuggestions.handleFilterChange(this.value)">
                        <option value="all">Alle prioriteter</option>
                        <option value="CRITICAL">🔴 Kritisk</option>
                        <option value="HIGH">🟡 Viktig</option>
                        <option value="MEDIUM">🟢 Optimalisering</option>
                    </select>
                    <button onclick="OrderSuggestions.exportCSV()" class="btn-export">Eksporter aksjonsliste</button>
                </div>
            </div>

            <div id="suggestionsContent">
                ${this.renderContent()}
            </div>
        `;
    }

    /**
     * Render the main content
     */
    static renderContent() {
        let filtered = this.suggestions;

        // Apply priority filter
        if (this.filterPriority !== 'all') {
            filtered = filtered.filter(s => s.priority === this.filterPriority);
        }

        // Remove completed items
        filtered = filtered.filter(s => !this.completedItems.has(s.itemNo));

        if (filtered.length === 0) {
            return `
                <div class="alert alert-success">
                    <strong>Ingen handlinger nødvendig!</strong> Alle BP-verdier er optimale.
                </div>
            `;
        }

        // Summary stats
        const criticalCount = this.suggestions.filter(s => s.priority === 'CRITICAL' && !this.completedItems.has(s.itemNo)).length;
        const highCount = this.suggestions.filter(s => s.priority === 'HIGH' && !this.completedItems.has(s.itemNo)).length;
        const mediumCount = this.suggestions.filter(s => s.priority === 'MEDIUM' && !this.completedItems.has(s.itemNo)).length;

        return `
            <div class="summary-cards" style="margin-bottom: 20px;">
                <div class="summary-card card-critical">
                    <div class="card-value">${criticalCount}</div>
                    <div class="card-label">🔴 Kritisk</div>
                </div>
                <div class="summary-card card-warning">
                    <div class="card-value">${highCount}</div>
                    <div class="card-label">🟡 Viktig</div>
                </div>
                <div class="summary-card card-ok">
                    <div class="card-value">${mediumCount}</div>
                    <div class="card-label">🟢 Optimalisering</div>
                </div>
                <div class="summary-card">
                    <div class="card-value">${this.completedItems.size}</div>
                    <div class="card-label">Utført</div>
                </div>
            </div>

            <div class="table-wrapper">
                <table class="data-table">
                    <thead>
                        <tr>
                            <th>Prioritet</th>
                            <th>Artikelnr</th>
                            <th>Beskrivelse</th>
                            <th>BP nå</th>
                            <th>Anbefalt</th>
                            <th>Handling</th>
                            <th>Begrunnelse</th>
                            <th>Utført</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${filtered.map(item => `
                            <tr class="${PRIORITY_CATEGORIES[item.priority].cssClass}">
                                <td>
                                    <span class="badge ${this.getPriorityBadgeClass(item.priority)}">
                                        ${PRIORITY_CATEGORIES[item.priority].icon} ${PRIORITY_CATEGORIES[item.priority].label}
                                    </span>
                                </td>
                                <td><strong>${item.itemNo}</strong></td>
                                <td>${this.truncate(item.description, 30)}</td>
                                <td class="qty-cell">${item.currentBP}</td>
                                <td class="qty-cell"><strong>${item.recommendedBP}</strong></td>
                                <td><span class="badge badge-info">${item.action}</span></td>
                                <td>${item.reasoning}</td>
                                <td class="action-cell">
                                    <input type="checkbox" id="done-${item.itemNo}"
                                           onchange="OrderSuggestions.markDone('${item.itemNo}', this.checked)">
                                    <label for="done-${item.itemNo}">Utført</label>
                                </td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        `;
    }

    /**
     * Analyze items and generate suggestions
     */
    static analyzaItems(data) {
        const suggestions = [];

        data.forEach(item => {
            const suggestion = this.analyzeItem(item);
            if (suggestion) {
                suggestions.push({
                    ...suggestion,
                    itemNo: item.itemNo,
                    description: item.description
                });
            }
        });

        // Sort by priority level
        return suggestions.sort((a, b) => {
            const levelA = PRIORITY_CATEGORIES[a.priority].level;
            const levelB = PRIORITY_CATEGORIES[b.priority].level;
            return levelA - levelB;
        });
    }

    /**
     * Analyze a single item
     */
    static analyzeItem(item) {
        const monthlyConsumption = item.sales12m / 12;
        const currentBP = item.bp || 0;
        const currentStock = item.stock || 0;
        const orderCount = item.orderCount || 0;

        // Skip items with no sales
        if (item.sales12m === 0) return null;

        // CRITICAL: BP is too low - risk of stockout
        if (currentBP < monthlyConsumption && orderCount >= 6) {
            return {
                priority: 'CRITICAL',
                action: 'Øk BP',
                currentBP: currentBP,
                recommendedBP: Math.ceil(monthlyConsumption * 1.5),
                reasoning: 'For mange ordre - risiko for tomt lager',
                savings: 0
            };
        }

        // CRITICAL: Stock is zero with active sales
        if (currentStock === 0 && item.sales12m > 0 && orderCount > 3) {
            return {
                priority: 'CRITICAL',
                action: 'Bestill nå',
                currentBP: currentBP,
                recommendedBP: Math.ceil(monthlyConsumption * 2),
                reasoning: 'Tomt lager med aktive salg',
                savings: 0
            };
        }

        // HIGH: BP is too high - tying up capital
        if (currentBP > monthlyConsumption * 2 && monthlyConsumption > 0) {
            const newBP = Math.ceil(monthlyConsumption * 1.2);
            return {
                priority: 'HIGH',
                action: 'Reduser BP',
                currentBP: currentBP,
                recommendedBP: newBP,
                reasoning: 'Binder unødvendig kapital',
                savings: currentBP - newBP
            };
        }

        // HIGH: Too many orders - inefficient
        if (orderCount > 12 && monthlyConsumption > 5) {
            return {
                priority: 'HIGH',
                action: 'Øk ordre-størrelse',
                currentBP: currentBP,
                recommendedBP: Math.ceil(monthlyConsumption * 2),
                reasoning: 'Reduser ordrefrekvens - spar administrasjon',
                savings: 0
            };
        }

        // MEDIUM: Optimization opportunity
        if (currentBP > monthlyConsumption * 1.5 && currentStock > monthlyConsumption * 3) {
            const newBP = Math.ceil(monthlyConsumption * 1.2);
            return {
                priority: 'MEDIUM',
                action: 'Optimaliser BP',
                currentBP: currentBP,
                recommendedBP: newBP,
                reasoning: 'Overskuddslager - reduser BP gradvis',
                savings: currentBP - newBP
            };
        }

        return null; // No action needed
    }

    /**
     * Get priority badge CSS class
     */
    static getPriorityBadgeClass(priority) {
        switch (priority) {
            case 'CRITICAL': return 'badge-critical';
            case 'HIGH': return 'badge-warning';
            case 'MEDIUM': return 'badge-ok';
            default: return 'badge-info';
        }
    }

    /**
     * Handle filter change
     */
    static handleFilterChange(priority) {
        this.filterPriority = priority;
        this.updateContent();
    }

    /**
     * Mark item as done
     */
    static markDone(itemNo, isDone) {
        if (isDone) {
            this.completedItems.add(itemNo);
        } else {
            this.completedItems.delete(itemNo);
        }
        // Don't update content here to prevent checkbox from disappearing
    }

    /**
     * Update content
     */
    static updateContent() {
        const container = document.getElementById('suggestionsContent');
        if (container) {
            container.innerHTML = this.renderContent();
        }
    }

    /**
     * Export suggestions to CSV
     */
    static exportCSV() {
        let data = this.suggestions;

        // Apply filter
        if (this.filterPriority !== 'all') {
            data = data.filter(s => s.priority === this.filterPriority);
        }

        // Exclude completed
        data = data.filter(s => !this.completedItems.has(s.itemNo));

        const headers = ['Prioritet', 'Artikelnr', 'Beskrivelse', 'BP nå', 'Anbefalt BP', 'Handling', 'Begrunnelse'];
        const rows = data.map(item => [
            PRIORITY_CATEGORIES[item.priority].label,
            item.itemNo,
            `"${(item.description || '').replace(/"/g, '""')}"`,
            item.currentBP,
            item.recommendedBP,
            item.action,
            `"${item.reasoning}"`
        ]);

        const csv = [headers.join(';'), ...rows.map(r => r.join(';'))].join('\n');

        const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `bestillingsforslag-${new Date().toISOString().split('T')[0]}.csv`;
        a.click();
        URL.revokeObjectURL(url);
    }

    /**
     * Utility: Truncate text
     */
    static truncate(text, maxLength) {
        if (!text) return '-';
        return text.length > maxLength ? text.substring(0, maxLength) + '...' : text;
    }

    /**
     * Get count of items needing action
     */
    static getCount(data) {
        const suggestions = this.analyzaItems(data);
        return suggestions.length;
    }
}

// Export to global scope
window.OrderSuggestions = OrderSuggestions;
