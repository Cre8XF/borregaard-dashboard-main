// ===================================
// MODUS 5: UTGÅENDE ARTIKLER – ALTERNATIV-ANALYSE
// Viser: Har utgående artikler gyldige alternativer?
// ===================================

/**
 * AlternativeAnalysisMode - Analyserer utgående artikler og deres alternativer
 *
 * Logikk:
 * 1. Identifiser alle artikler med status "Utgående" (_status UTGAENDE/UTGAATT eller isDiscontinued)
 * 2. For hver utgående artikkel:
 *    a. Finn matchende alternativ(er) fra alternativeArticles
 *    b. For hvert alternativ: sjekk om det finnes i lagerbeholdning, hent status
 * 3. Klassifiser resultat
 */
class AlternativeAnalysisMode {
    static dataStore = null;
    static searchTerm = '';
    static sortColumn = null;
    static sortDirection = 'asc';
    static currentFilter = 'all'; // all | withAlt | withoutAlt | critical

    /**
     * Render alternativ-analyse visningen
     * @param {UnifiedDataStore} store
     * @returns {string} HTML
     */
    static render(store) {
        this.dataStore = store;

        const analysis = this.analyzeOutgoingArticles(store);

        // Console log for column detection and summary
        console.log('=== Utgående artikler – alternativanalyse ===');
        console.log(`  Totalt utgående artikler: ${analysis.totalOutgoing}`);
        console.log(`  Med gyldig alternativ: ${analysis.withValidAlternative}`);
        console.log(`  Uten alternativ: ${analysis.missingAlternative}`);

        return `
            <div class="module-header">
                <h2>Utgående artikler – Alternativanalyse</h2>
                <p class="module-description">Har utgående artikler gyldige alternativer i systemet?</p>
            </div>

            ${this.renderSummaryCards(analysis)}

            <div class="module-controls">
                <div class="filter-group">
                    <label>Filter:</label>
                    <select class="filter-select" onchange="AlternativeAnalysisMode.handleFilterChange(this.value)">
                        <option value="all" ${this.currentFilter === 'all' ? 'selected' : ''}>Alle utgående (${analysis.totalOutgoing})</option>
                        <option value="withAlt" ${this.currentFilter === 'withAlt' ? 'selected' : ''}>Med alternativ (${analysis.withAlternative})</option>
                        <option value="withoutAlt" ${this.currentFilter === 'withoutAlt' ? 'selected' : ''}>Uten alternativ (${analysis.missingAlternative})</option>
                        <option value="critical" ${this.currentFilter === 'critical' ? 'selected' : ''}>Kritiske (${analysis.criticalCount})</option>
                    </select>
                </div>
                <div class="search-group">
                    <input type="text" class="search-input" placeholder="Søk artikkel..."
                           value="${this.searchTerm}"
                           onkeyup="AlternativeAnalysisMode.handleSearch(this.value)">
                </div>
                <button onclick="AlternativeAnalysisMode.exportCSV()" class="btn-export">Eksporter CSV</button>
            </div>

            ${this.renderNoAlternativeFileWarning(store)}

            <div id="altAnalysisContent">
                ${this.renderTable(analysis)}
            </div>
        `;
    }

    /**
     * Analyserer alle utgående artikler og deres alternativer
     */
    static analyzeOutgoingArticles(store) {
        const items = store.getAllItems();
        const altMap = store.alternativeArticles || new Map();
        const results = [];

        let totalOutgoing = 0;
        let withAlternative = 0;
        let withValidAlternative = 0;
        let missingAlternative = 0;
        let criticalCount = 0;

        // Dynamisk deteksjon av artikkelstatus-felt
        // Vi bruker _status (fra artikkelstatus.xlsx) og isDiscontinued (fra lagerbeholdning statusText)
        const statusFields = [];
        if (items.length > 0) {
            const sample = items[0];
            if (sample._status !== undefined) statusFields.push('_status');
            if (sample.isDiscontinued !== undefined) statusFields.push('isDiscontinued');
            if (sample.statusText !== undefined) statusFields.push('statusText');
            if (sample.status !== undefined) statusFields.push('status');
            console.log('  Artikkelstatus-felt detektert:', statusFields);
        }

        items.forEach(item => {
            // Identifiser utgående artikkel
            const isOutgoing = this.isArticleOutgoing(item);
            if (!isOutgoing) return;

            totalOutgoing++;

            // Finn alternativer
            const alternatives = altMap.get(item.toolsArticleNumber) || [];

            if (alternatives.length === 0) {
                // Ingen alternativ definert
                missingAlternative++;
                criticalCount++;
                results.push({
                    sourceArticle: item.toolsArticleNumber,
                    sourceDescription: item.description || '',
                    sourceStatus: this.getStatusLabel(item),
                    sourceStock: item.stock || 0,
                    altArticle: '-',
                    altDescription: '',
                    altExistsInInventory: false,
                    altStatus: '-',
                    classification: 'Ingen alternativ definert',
                    classType: 'critical',
                    _item: item
                });
            } else {
                withAlternative++;
                let hasValidAlt = false;

                alternatives.forEach(alt => {
                    const altItem = store.items.get(alt.altArticle);
                    let classification;
                    let classType;

                    if (altItem) {
                        const altOutgoing = this.isArticleOutgoing(altItem);
                        if (!altOutgoing) {
                            classification = 'Har alternativ – finnes og er aktiv';
                            classType = 'ok';
                            hasValidAlt = true;
                        } else {
                            classification = 'Har alternativ – finnes men er ikke aktiv';
                            classType = 'warning';
                        }
                    } else {
                        classification = 'Har alternativ – finnes ikke i lager';
                        classType = 'warning';
                    }

                    results.push({
                        sourceArticle: item.toolsArticleNumber,
                        sourceDescription: item.description || '',
                        sourceStatus: this.getStatusLabel(item),
                        sourceStock: item.stock || 0,
                        altArticle: alt.altArticle,
                        altDescription: alt.altDescription || (altItem ? altItem.description : ''),
                        altExistsInInventory: !!altItem,
                        altStatus: altItem ? this.getStatusLabel(altItem) : '-',
                        classification: classification,
                        classType: classType,
                        _item: item
                    });
                });

                if (hasValidAlt) {
                    withValidAlternative++;
                } else {
                    criticalCount++;
                }
            }
        });

        return {
            results,
            totalOutgoing,
            withAlternative,
            withValidAlternative,
            missingAlternative,
            criticalCount
        };
    }

    /**
     * Sjekk om en artikkel er utgående
     * Dynamisk: bruker alle tilgjengelige status-felt
     */
    static isArticleOutgoing(item) {
        // Sjekk _status fra artikkelstatus.xlsx
        if (item._status === 'UTGAENDE' || item._status === 'UTGAATT') {
            return true;
        }

        // Sjekk isDiscontinued flagg (satt av statusText-matching)
        if (item.isDiscontinued) {
            return true;
        }

        // Sjekk statusText direkte
        if (item.statusText) {
            const lower = item.statusText.toLowerCase();
            if (lower.includes('utgå') || lower.includes('discontinued') ||
                lower.includes('avvikle') || lower.includes('utgående')) {
                return true;
            }
        }

        // Sjekk numerisk status (Jeeves)
        if (item.status) {
            const statusStr = item.status.toString().trim();
            // Status 3 = Utgående, 4 = Utgått i Jeeves
            if (statusStr === '3' || statusStr === '4' ||
                statusStr.startsWith('3 -') || statusStr.startsWith('4 -')) {
                return true;
            }
        }

        return false;
    }

    /**
     * Hent lesbar statuslabel
     */
    static getStatusLabel(item) {
        if (item._status === 'UTGAENDE') return 'Utgående';
        if (item._status === 'UTGAATT') return 'Utgått';
        if (item._status === 'AKTIV') return 'Aktiv';
        if (item.statusText) return item.statusText;
        if (item.status) return item.status.toString();
        return 'Ukjent';
    }

    /**
     * Render sammendragskort
     */
    static renderSummaryCards(analysis) {
        const validPercent = analysis.totalOutgoing > 0
            ? Math.round((analysis.withValidAlternative / analysis.totalOutgoing) * 100)
            : 0;

        return `
            <div class="alt-analysis-summary">
                <div class="stat-card">
                    <div class="stat-value">${analysis.totalOutgoing}</div>
                    <div class="stat-label">Utgående artikler</div>
                    <div class="stat-sub">Totalt identifisert</div>
                </div>
                <div class="stat-card ok">
                    <div class="stat-value">${analysis.withValidAlternative}</div>
                    <div class="stat-label">Med gyldig alternativ</div>
                    <div class="stat-sub">Finnes og er aktiv</div>
                </div>
                <div class="stat-card warning">
                    <div class="stat-value">${analysis.withAlternative - analysis.withValidAlternative}</div>
                    <div class="stat-label">Alternativ med problem</div>
                    <div class="stat-sub">Finnes ikke / ikke aktiv</div>
                </div>
                <div class="stat-card critical">
                    <div class="stat-value">${analysis.missingAlternative}</div>
                    <div class="stat-label">Uten alternativ</div>
                    <div class="stat-sub">Ingen definert</div>
                </div>
                <div class="stat-card ${validPercent >= 70 ? 'ok' : validPercent >= 40 ? 'warning' : 'critical'}">
                    <div class="stat-value">${validPercent}%</div>
                    <div class="stat-label">Dekningsgrad</div>
                    <div class="stat-sub">Andel med gyldig alt.</div>
                </div>
            </div>
        `;
    }

    /**
     * Render advarsel hvis alternativ-fil ikke er lastet
     */
    static renderNoAlternativeFileWarning(store) {
        if (store.alternativeArticles && store.alternativeArticles.size > 0) {
            return '';
        }
        return `
            <div class="view-insight warning">
                <p><strong>Alternativ_artikkel_Jeeves.xlsx er ikke lastet.</strong></p>
                <p>Last opp filen for å se koblinger mellom utgående artikler og deres alternativer.
                Uten denne filen vises alle utgående artikler som "Ingen alternativ definert".</p>
            </div>
        `;
    }

    /**
     * Render hovedtabellen
     */
    static renderTable(analysis) {
        let filtered = this.filterResults(analysis.results);
        filtered = this.sortResults(filtered);

        if (filtered.length === 0) {
            return `<div class="alert alert-info">Ingen utgående artikler funnet med gjeldende filter.</div>`;
        }

        return `
            <div class="table-wrapper">
                <table class="data-table compact alt-analysis-table">
                    <thead>
                        <tr>
                            ${this.renderSortableHeader('Utgående art.nr', 'sourceArticle')}
                            ${this.renderSortableHeader('Beskrivelse', 'sourceDescription')}
                            ${this.renderSortableHeader('Saldo', 'sourceStock')}
                            ${this.renderSortableHeader('Alternativ art.nr', 'altArticle')}
                            <th>Alt. beskrivelse</th>
                            ${this.renderSortableHeader('I lager', 'altExistsInInventory')}
                            ${this.renderSortableHeader('Alt. status', 'altStatus')}
                            ${this.renderSortableHeader('Vurdering', 'classType')}
                        </tr>
                    </thead>
                    <tbody>
                        ${filtered.map(row => this.renderRow(row)).join('')}
                    </tbody>
                </table>
            </div>
            <div class="table-footer">
                <p class="text-muted">Viser ${filtered.length} rader</p>
            </div>
        `;
    }

    /**
     * Render en tabellrad
     */
    static renderRow(row) {
        const rowClass = row.classType === 'critical' ? 'row-critical' :
                         row.classType === 'warning' ? 'row-warning' : '';

        return `
            <tr class="${rowClass}">
                <td><strong>${this.escapeHtml(row.sourceArticle)}</strong></td>
                <td>${this.truncate(row.sourceDescription, 30)}</td>
                <td class="qty-cell">${this.formatNumber(row.sourceStock)}</td>
                <td>${row.altArticle !== '-' ? `<strong>${this.escapeHtml(row.altArticle)}</strong>` : '<span class="text-muted">-</span>'}</td>
                <td>${this.truncate(row.altDescription, 25)}</td>
                <td>${row.altArticle !== '-' ? (row.altExistsInInventory ? '<span class="badge badge-ok">Ja</span>' : '<span class="badge badge-warning">Nei</span>') : '<span class="text-muted">-</span>'}</td>
                <td>${row.altStatus !== '-' ? this.renderStatusBadge(row.altStatus) : '<span class="text-muted">-</span>'}</td>
                <td>${this.renderClassificationBadge(row.classification, row.classType)}</td>
            </tr>
        `;
    }

    /**
     * Render statusbadge
     */
    static renderStatusBadge(status) {
        const lower = status.toLowerCase();
        if (lower.includes('aktiv') && !lower.includes('utgå') && !lower.includes('inaktiv')) {
            return `<span class="badge badge-ok">${this.escapeHtml(status)}</span>`;
        }
        if (lower.includes('utgå') || lower.includes('discontinued')) {
            return `<span class="badge badge-warning">${this.escapeHtml(status)}</span>`;
        }
        return `<span class="badge badge-info">${this.escapeHtml(status)}</span>`;
    }

    /**
     * Render klassifiseringsbadge
     */
    static renderClassificationBadge(text, type) {
        const badgeClass = type === 'critical' ? 'badge-critical' :
                          type === 'warning' ? 'badge-warning' : 'badge-ok';
        return `<span class="badge ${badgeClass}">${this.escapeHtml(text)}</span>`;
    }

    /**
     * Filtrer resultater
     */
    static filterResults(results) {
        let filtered = results;

        switch (this.currentFilter) {
            case 'withAlt':
                filtered = filtered.filter(r => r.altArticle !== '-');
                break;
            case 'withoutAlt':
                filtered = filtered.filter(r => r.altArticle === '-');
                break;
            case 'critical':
                filtered = filtered.filter(r => r.classType === 'critical' || r.classType === 'warning');
                break;
        }

        if (this.searchTerm) {
            const term = this.searchTerm.toLowerCase();
            filtered = filtered.filter(r =>
                r.sourceArticle.toLowerCase().includes(term) ||
                r.sourceDescription.toLowerCase().includes(term) ||
                r.altArticle.toLowerCase().includes(term) ||
                r.altDescription.toLowerCase().includes(term)
            );
        }

        return filtered;
    }

    /**
     * Sorter resultater
     */
    static sortResults(results) {
        if (!this.sortColumn) return results;

        const col = this.sortColumn;
        const dir = this.sortDirection === 'asc' ? 1 : -1;

        return [...results].sort((a, b) => {
            let aVal = a[col];
            let bVal = b[col];

            if (aVal == null) aVal = '';
            if (bVal == null) bVal = '';

            if (typeof aVal === 'boolean') {
                return ((aVal ? 1 : 0) - (bVal ? 1 : 0)) * dir;
            }
            if (typeof aVal === 'number' && typeof bVal === 'number') {
                return (aVal - bVal) * dir;
            }
            return String(aVal).localeCompare(String(bVal), 'nb-NO') * dir;
        });
    }

    /**
     * Render sorterbar header
     */
    static renderSortableHeader(label, key) {
        const indicator = this.sortColumn === key
            ? (this.sortDirection === 'asc' ? ' &#9650;' : ' &#9660;')
            : '';
        return `<th class="sortable-header" onclick="AlternativeAnalysisMode.handleSort('${key}')">${label}${indicator}</th>`;
    }

    /**
     * Event handlers
     */
    static handleFilterChange(filter) {
        this.currentFilter = filter;
        this.refreshAll();
    }

    static handleSearch(term) {
        this.searchTerm = term;
        this.refreshAll();
    }

    static handleSort(column) {
        if (this.sortColumn === column) {
            this.sortDirection = this.sortDirection === 'asc' ? 'desc' : 'asc';
        } else {
            this.sortColumn = column;
            this.sortDirection = 'asc';
        }
        this.refreshAll();
    }

    static refreshAll() {
        const moduleContent = document.getElementById('moduleContent');
        if (moduleContent && this.dataStore) {
            moduleContent.innerHTML = this.render(this.dataStore);
        }
    }

    /**
     * Eksporter til CSV
     */
    static exportCSV() {
        const analysis = this.analyzeOutgoingArticles(this.dataStore);
        let filtered = this.filterResults(analysis.results);
        filtered = this.sortResults(filtered);

        const headers = [
            'Utgående artikkelnummer',
            'Beskrivelse',
            'Saldo',
            'Alternativ artikkelnummer',
            'Alternativ beskrivelse',
            'Alternativ finnes i lager',
            'Alternativ status',
            'Vurdering'
        ];

        const rows = filtered.map(r => [
            r.sourceArticle,
            `"${(r.sourceDescription || '').replace(/"/g, '""')}"`,
            r.sourceStock,
            r.altArticle,
            `"${(r.altDescription || '').replace(/"/g, '""')}"`,
            r.altExistsInInventory ? 'Ja' : 'Nei',
            r.altStatus,
            r.classification
        ]);

        const csv = [headers.join(';'), ...rows.map(r => r.join(';'))].join('\n');
        const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `utgaende-alternativanalyse-${new Date().toISOString().split('T')[0]}.csv`;
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

    static escapeHtml(str) {
        if (!str) return '';
        return str.toString()
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }
}

// Eksporter til global scope
window.AlternativeAnalysisMode = AlternativeAnalysisMode;
