// ===================================
// MODUS: VARETELLING – LOKASJONSSØK
// Generer tellelister basert på lokasjonsintervall (FRA–TIL).
// Input: fra-lokasjon + til-lokasjon → filtrert artikkelliste + Excel-eksport
// Søk trigges kun ved knappetrykk eller Enter.
// ===================================

class VartellingMode {
    static _store        = null;
    static locationFrom  = '';   // Nåværende fra-lokasjon
    static locationTo    = '';   // Nåværende til-lokasjon
    static _lastFiltered = [];   // Siste filtrerte artikler (for eksport)

    // ════════════════════════════════════════════════════
    //  MAIN RENDER
    // ════════════════════════════════════════════════════

    static render(store) {
        this._store = store;

        const items    = store.getAllItems();
        const filtered = this.filterByLocationRange(items, this.locationFrom, this.locationTo);
        this._lastFiltered = filtered;

        const totalValue = filtered.reduce((s, item) => s + (item.estimertVerdi || 0), 0);

        const hasSearch = this.locationFrom || this.locationTo;

        return `
            <div class="module-header">
                <h2>Varetelling – Lokasjonssøk</h2>
                <p class="module-description">
                    Angi lokasjonsintervall (f.eks. <strong>11-10-A</strong> til <strong>11-11-C</strong>)
                    for å generere telleliste. Eksporter til Excel for utskrift på lager.
                </p>
            </div>

            <div class="module-controls location-search" style="align-items:flex-end;gap:12px;flex-wrap:wrap;">
                <div style="display:flex;flex-direction:column;gap:4px;">
                    <label style="font-size:12px;font-weight:600;color:#555;">Lokasjon fra</label>
                    <input id="locationFrom"
                           type="text"
                           class="search-input"
                           value="${this.esc(this.locationFrom)}"
                           placeholder="f.eks. 11-10-A"
                           style="min-width:140px;font-size:14px;padding:7px 12px;">
                </div>
                <div style="display:flex;flex-direction:column;gap:4px;">
                    <label style="font-size:12px;font-weight:600;color:#555;">Lokasjon til</label>
                    <input id="locationTo"
                           type="text"
                           class="search-input"
                           value="${this.esc(this.locationTo)}"
                           placeholder="f.eks. 11-11-C"
                           style="min-width:140px;font-size:14px;padding:7px 12px;">
                </div>
                <button id="searchLocations" class="btn-primary" style="height:36px;">
                    Søk
                </button>
                <button onclick="VartellingMode.exportExcel()"
                        class="btn-export"
                        style="height:36px;background:#1a6b2c;"
                        ${filtered.length === 0 ? 'disabled' : ''}>
                    Eksporter Excel
                </button>
            </div>

            ${this.renderSummary(filtered, totalValue, hasSearch)}

            ${this.renderTable(filtered, hasSearch)}

            <script>
                (function() {
                    function runLocationSearch() {
                        const from = document.getElementById('locationFrom').value;
                        const to   = document.getElementById('locationTo').value;
                        VartellingMode.handleSearch(from, to);
                    }

                    const btn = document.getElementById('searchLocations');
                    if (btn) btn.addEventListener('click', runLocationSearch);

                    const toInput = document.getElementById('locationTo');
                    if (toInput) {
                        toInput.addEventListener('keypress', function(e) {
                            if (e.key === 'Enter') runLocationSearch();
                        });
                    }

                    const fromInput = document.getElementById('locationFrom');
                    if (fromInput) {
                        fromInput.addEventListener('keypress', function(e) {
                            if (e.key === 'Enter') runLocationSearch();
                        });
                    }
                })();
            </script>
        `;
    }

    // ════════════════════════════════════════════════════
    //  FILTER LOGIC
    // ════════════════════════════════════════════════════

    /**
     * Filtrer artikler på lokasjonsintervall (string range, case-insensitive).
     * Returnerer alle artikler hvis begge felt er tomme.
     * Kun fra: returnerer alle lokasjoner >= fra.
     * Kun til: returnerer alle lokasjoner <= til.
     */
    static filterByLocationRange(items, from, to) {
        const start = (from || '').trim().toUpperCase();
        const end   = (to   || '').trim().toUpperCase();

        if (!start && !end) return [...items];

        return items.filter(item => {
            const location = (item.location || item.lagerplass || '').trim().toUpperCase();
            if (!location) return false;
            if (start && location < start) return false;
            if (end   && location > end)   return false;
            return true;
        });
    }

    // ════════════════════════════════════════════════════
    //  RENDERING
    // ════════════════════════════════════════════════════

    static renderSummary(items, totalValue, hasSearch) {
        if (items.length === 0 && !hasSearch) return '';
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

    static renderTable(items, hasSearch) {
        if (items.length === 0) {
            if (!hasSearch) {
                return `<div class="alert alert-info">Angi lokasjon fra/til og trykk Søk for å generere telleliste.</div>`;
            }
            const range = [this.esc(this.locationFrom), this.esc(this.locationTo)].filter(Boolean).join(' – ');
            return `<div class="alert alert-info">Ingen artikler funnet i lokasjonsintervallet «${range}».</div>`;
        }

        // Sort: lokasjon ASC (localeCompare), deretter toolsNr ASC
        const sorted = [...items].sort((a, b) => {
            const locA = (a.location || a.lagerplass || '');
            const locB = (b.location || b.lagerplass || '');
            const cmp = locA.localeCompare(locB, 'nb-NO');
            if (cmp !== 0) return cmp;
            return (a.toolsArticleNumber || '').localeCompare(b.toolsArticleNumber || '', 'nb-NO');
        });

        const rangeLabel = [this.locationFrom, this.locationTo].filter(Boolean).join(' – ');

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
                            const loc        = item.location || item.lagerplass || '';
                            const stock      = item.stock || 0;
                            const bestAntLev = item.bestAntLev || 0;
                            const status     = item._status || '';
                            const rowClass   = status === 'UTGAENDE' ? 'row-warning'
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
                <p class="text-muted">Viser ${sorted.length} artikler${rangeLabel ? ` i intervall «${this.esc(rangeLabel)}»` : ''}</p>
            </div>
        `;
    }

    // ════════════════════════════════════════════════════
    //  EVENT HANDLERS
    // ════════════════════════════════════════════════════

    static handleSearch(from, to) {
        this.locationFrom = (from || '').trim();
        this.locationTo   = (to   || '').trim();
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
            alert('Ingen artikler å eksportere. Søk på et lokasjonsintervall først.');
            return;
        }
        if (typeof XLSX === 'undefined') {
            alert('XLSX-biblioteket er ikke tilgjengelig.');
            return;
        }

        const from     = this.locationFrom || 'start';
        const to       = this.locationTo   || 'slutt';
        const fileDate = new Date().toISOString().slice(0, 10);

        // Sort: lokasjon ASC, deretter toolsNr ASC
        const sorted = [...this._lastFiltered].sort((a, b) => {
            const locA = (a.location || a.lagerplass || '');
            const locB = (b.location || b.lagerplass || '');
            const cmp = locA.localeCompare(locB, 'nb-NO');
            if (cmp !== 0) return cmp;
            return (a.toolsArticleNumber || '').localeCompare(b.toolsArticleNumber || '', 'nb-NO');
        });

        const rows = sorted.map(item => ({
            'Lokasjon':      item.location || item.lagerplass || '',
            'Tools nr':      item.toolsArticleNumber || '',
            'Beskrivelse':   item.description || '',
            'Leverandørnr':  item.supplierId || item.supplier || '',
            'SA-nummer':     item.saNumber || '',
            'Beholdning':    item.stock || 0,
            'Innkommende':   item.bestAntLev || 0,
            'Status':        item._status || '',
            'Tellet antall': ''   // Tom kolonne for manuell utfylling
        }));

        const ws = XLSX.utils.json_to_sheet(rows);
        const wb = XLSX.utils.book_new();
        const sheetName = `${from}_${to}`.slice(0, 31);
        XLSX.utils.book_append_sheet(wb, ws, sheetName);
        XLSX.writeFile(wb, `telleliste_${from}_${to}_${fileDate}.xlsx`);
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
