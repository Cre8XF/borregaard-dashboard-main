// ===================================
// MODUS: VARETELLING – LOKASJONSSØK
// Generer tellelister basert på lagerlokasjon.
// Input: lokasjonsprefiks (f.eks. "1-5") → filtrert artikkelliste + Excel-eksport
// ===================================

class VartellingMode {
    static _store     = null;
    static searchPrefix = '';   // Nåværende lokasjonsprefiks
    static _lastFiltered = [];  // Siste filtrerte artikler (for eksport)

    // ════════════════════════════════════════════════════
    //  MAIN RENDER
    // ════════════════════════════════════════════════════

    static render(store) {
        this._store = store;

        const items   = store.getAllItems();
        const filtered = this.filterByLocation(items, this.searchPrefix);
        this._lastFiltered = filtered;

        const totalValue = filtered.reduce((s, item) => s + (item.estimertVerdi || 0), 0);

        return `
            <div class="module-header">
                <h2>Varetelling – Lokasjonssøk</h2>
                <p class="module-description">
                    Søk på lokasjonsprefiks (f.eks. <strong>1-5</strong>) for å generere telleliste.
                    Eksporter til Excel for utskrift på lager.
                </p>
            </div>

            <div class="module-controls" style="align-items:flex-end;gap:12px;flex-wrap:wrap;">
                <div style="display:flex;flex-direction:column;gap:4px;">
                    <label style="font-size:12px;font-weight:600;color:#555;">Lokasjon:</label>
                    <input id="varetelling-input"
                           type="text"
                           class="search-input"
                           value="${this.esc(this.searchPrefix)}"
                           placeholder="F.eks. 1-5 eller A-3"
                           oninput="VartellingMode.handleSearch(this.value)"
                           style="min-width:160px;font-size:14px;padding:7px 12px;">
                </div>
                <button onclick="VartellingMode.handleSearch(document.getElementById('varetelling-input').value)"
                        class="btn-primary" style="height:36px;">
                    Søk
                </button>
                <button onclick="VartellingMode.exportExcel()"
                        class="btn-export"
                        style="height:36px;background:#1a6b2c;"
                        ${filtered.length === 0 ? 'disabled' : ''}>
                    Eksporter Excel
                </button>
            </div>

            ${this.renderSummary(filtered, totalValue)}

            ${this.renderTable(filtered)}
        `;
    }

    // ════════════════════════════════════════════════════
    //  FILTER LOGIC
    // ════════════════════════════════════════════════════

    /**
     * Filtrer artikler på lokasjonsprefiks.
     * Bruker item.location (fra Master.xlsx Lokasjon).
     * Returnerer alle artikler hvis prefix er tom.
     */
    static filterByLocation(items, prefix) {
        if (!prefix || !prefix.trim()) return [...items];
        const p = prefix.trim().toLowerCase();
        return items.filter(item => {
            const loc = (item.location || item.lagerplass || '').toLowerCase();
            return loc.startsWith(p);
        });
    }

    // ════════════════════════════════════════════════════
    //  RENDERING
    // ════════════════════════════════════════════════════

    static renderSummary(items, totalValue) {
        if (items.length === 0 && !this.searchPrefix) return '';
        return `
            <div style="display:flex;gap:16px;flex-wrap:wrap;margin-bottom:12px;">
                <div style="padding:10px 16px;background:#e3f2fd;border-radius:6px;border:1px solid #bbdefb;">
                    <span style="font-size:22px;font-weight:700;color:#1565c0;">${items.length}</span>
                    <span style="font-size:13px;color:#1565c0;margin-left:6px;">artikler</span>
                </div>
                <div style="padding:10px 16px;background:#e8f5e9;border-radius:6px;border:1px solid #c8e6c9;">
                    <span style="font-size:22px;font-weight:700;color:#2e7d32;">${items.filter(i => (i.stock || 0) > 0).length}</span>
                    <span style="font-size:13px;color:#2e7d32;margin-left:6px;">med beholdning</span>
                </div>
                ${totalValue > 0 ? `
                <div style="padding:10px 16px;background:#fff8e1;border-radius:6px;border:1px solid #ffe082;">
                    <span style="font-size:22px;font-weight:700;color:#e65100;">${Math.round(totalValue).toLocaleString('nb-NO')} kr</span>
                    <span style="font-size:13px;color:#e65100;margin-left:6px;">estimert verdi</span>
                </div>` : ''}
            </div>
        `;
    }

    static renderTable(items) {
        if (items.length === 0) {
            if (!this.searchPrefix) {
                return `<div class="alert alert-info">Skriv inn en lokasjonsprefiks for å søke.</div>`;
            }
            return `<div class="alert alert-info">Ingen artikler funnet på lokasjon «${this.esc(this.searchPrefix)}».</div>`;
        }

        // Sort: location ASC, then toolsNr ASC
        const sorted = [...items].sort((a, b) => {
            const locA = (a.location || a.lagerplass || '').toLowerCase();
            const locB = (b.location || b.lagerplass || '').toLowerCase();
            if (locA !== locB) return locA.localeCompare(locB, 'nb-NO');
            return (a.toolsArticleNumber || '').localeCompare(b.toolsArticleNumber || '', 'nb-NO');
        });

        return `
            <div class="table-wrapper">
                <table class="data-table compact">
                    <thead>
                        <tr>
                            <th>Lokasjon</th>
                            <th>Tools nr</th>
                            <th>Beskrivelse</th>
                            <th>Leverandørnr</th>
                            <th>SA-nummer</th>
                            <th style="text-align:right;">Beholdning</th>
                            <th style="text-align:right;">Innkommende</th>
                            <th>Status</th>
                            <th style="text-align:right;width:80px;">Tellet antall</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${sorted.map(item => {
                            const loc    = item.location || item.lagerplass || '';
                            const stock  = item.stock || 0;
                            const bestAntLev = item.bestAntLev || 0;
                            const status = item._status || '';
                            const rowClass = status === 'UTGAENDE' ? 'row-warning'
                                           : status === 'UTGAATT'  ? 'row-critical' : '';
                            return `
                                <tr class="${rowClass}">
                                    <td style="font-weight:700;white-space:nowrap;">${this.esc(loc) || '–'}</td>
                                    <td style="font-size:11px;font-weight:700;white-space:nowrap;">${this.esc(item.toolsArticleNumber || '')}</td>
                                    <td style="font-size:11px;" title="${this.esc(item.description || '')}">${this.esc(this.trunc(item.description || '', 45))}</td>
                                    <td style="font-size:11px;white-space:nowrap;color:${item.supplierId ? 'inherit' : '#aaa'};">${this.esc(item.supplierId || item.supplier || '') || '–'}</td>
                                    <td style="font-size:11px;white-space:nowrap;color:${item.saNumber ? 'inherit' : '#aaa'};">${this.esc(item.saNumber || '') || '–'}</td>
                                    <td style="text-align:right;font-weight:700;">${stock > 0 ? stock.toLocaleString('nb-NO') : '<span style="color:#aaa;">0</span>'}</td>
                                    <td style="text-align:right;color:${bestAntLev > 0 ? 'inherit' : '#aaa'};">${bestAntLev > 0 ? bestAntLev.toLocaleString('nb-NO') : '–'}</td>
                                    <td>${this.statusBadge(status)}</td>
                                    <td style="background:#fafafa;border:1px dashed #bbb;"></td>
                                </tr>
                            `;
                        }).join('')}
                    </tbody>
                </table>
            </div>
            <div class="table-footer">
                <p class="text-muted">Viser ${sorted.length} artikler${this.searchPrefix ? ` på lokasjon «${this.esc(this.searchPrefix)}»` : ''}</p>
            </div>
        `;
    }

    // ════════════════════════════════════════════════════
    //  EVENT HANDLERS
    // ════════════════════════════════════════════════════

    static handleSearch(prefix) {
        this.searchPrefix = prefix || '';
        this.refreshAll();
    }

    static refreshAll() {
        const contentDiv = document.getElementById('moduleContent');
        if (contentDiv && this._store) {
            contentDiv.innerHTML = this.render(this._store);
        }
    }

    // ════════════════════════════════════════════════════
    //  EXCEL EKSPORT
    // ════════════════════════════════════════════════════

    static exportExcel() {
        if (!this._lastFiltered || this._lastFiltered.length === 0) {
            alert('Ingen artikler å eksportere. Søk på en lokasjon først.');
            return;
        }
        if (typeof XLSX === 'undefined') {
            alert('XLSX-biblioteket er ikke tilgjengelig.');
            return;
        }

        const location = this.searchPrefix.trim() || 'alle';
        const fileDate = new Date().toISOString().slice(0, 10);

        // Sort: location ASC, then toolsNr ASC
        const sorted = [...this._lastFiltered].sort((a, b) => {
            const locA = (a.location || a.lagerplass || '').toLowerCase();
            const locB = (b.location || b.lagerplass || '').toLowerCase();
            if (locA !== locB) return locA.localeCompare(locB, 'nb-NO');
            return (a.toolsArticleNumber || '').localeCompare(b.toolsArticleNumber || '', 'nb-NO');
        });

        const rows = sorted.map(item => ({
            'Lokasjon':        item.location || item.lagerplass || '',
            'Tools nr':        item.toolsArticleNumber || '',
            'Beskrivelse':     item.description || '',
            'Leverandørnr':    item.supplierId || item.supplier || '',
            'SA-nummer':       item.saNumber || '',
            'Beholdning':      item.stock || 0,
            'Innkommende':     item.bestAntLev || 0,
            'Status':          item._status || '',
            'Tellet antall':   ''      // Tom kolonne for manuell utfylling
        }));

        const ws = XLSX.utils.json_to_sheet(rows);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, `Lokasjon ${location}`.slice(0, 31));
        XLSX.writeFile(wb, `telleliste_${location}_${fileDate}.xlsx`);
    }

    // ════════════════════════════════════════════════════
    //  UTILITY
    // ════════════════════════════════════════════════════

    static esc(str) {
        if (!str) return '';
        return str.toString()
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    static trunc(str, max) {
        if (!str) return '';
        return str.length > max ? str.slice(0, max) + '\u2026' : str;
    }

    static statusBadge(status) {
        if (status === 'AKTIV')    return '<span class="badge badge-ok" style="font-size:10px;">Aktiv</span>';
        if (status === 'UTGAENDE') return '<span class="badge badge-warning" style="font-size:10px;">Utgående</span>';
        if (status === 'UTGAATT')  return '<span class="badge badge-critical" style="font-size:10px;">Utgått</span>';
        if (!status)               return '<span style="color:#aaa;font-size:10px;">–</span>';
        return `<span class="badge badge-info" style="font-size:10px;">${this.esc(status)}</span>`;
    }
}

// Eksporter til global scope
window.VartellingMode = VartellingMode;
