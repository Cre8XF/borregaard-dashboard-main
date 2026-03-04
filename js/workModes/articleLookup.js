// ===================================
// MODUS: ARTIKKELOPPSLAG – BP KONTROLL
// Lim inn liste med Tools art.nr / SA-nummer → BP, EOK, lager, status
// ===================================

class ArticleLookupMode {
    static _store        = null;
    static _lastResults  = [];   // Siste søkeresultater (for eksport)
    static _inputText    = '';   // Bevarer input mellom refresh

    // ════════════════════════════════════════════════════
    //  MAIN RENDER
    // ════════════════════════════════════════════════════

    static render(store) {
        this._store = store;

        const results = this._lastResults;
        const summary = this.buildSummary(results);
        const hasResults = results.length > 0;

        return `
            <div class="module-header">
                <h2>Artikkeloppslag – BP kontroll</h2>
                <p class="module-description">
                    Lim inn en liste med <strong>Tools art.nr</strong> eller <strong>SA-nummer</strong>
                    for å sjekke beholdning, bestillingspunkt og ordrebehov.
                </p>
            </div>

            <div class="module-controls" style="align-items:flex-start;gap:16px;flex-wrap:wrap;">
                <div style="display:flex;flex-direction:column;gap:6px;flex:1;min-width:240px;">
                    <label style="font-size:12px;font-weight:600;color:#555;">
                        Lim inn Tools art.nr eller SA-nummer (ett per linje, komma eller mellomrom):
                    </label>
                    <textarea id="articleLookupInput"
                              rows="6"
                              placeholder="SA09001037&#10;SA09001038&#10;7400191671"
                              style="width:100%;font-family:monospace;font-size:13px;padding:8px 10px;
                                     border:1px solid #ccc;border-radius:4px;resize:vertical;
                                     box-sizing:border-box;"
                    >${this.esc(this._inputText)}</textarea>
                </div>
                <div style="display:flex;flex-direction:column;gap:8px;padding-top:22px;">
                    <button onclick="ArticleLookupMode.runLookup()"
                            class="btn-primary" style="min-width:110px;">
                        Analyser
                    </button>
                    <button onclick="ArticleLookupMode.clearAll()"
                            class="btn-secondary" style="min-width:110px;">
                        Tøm
                    </button>
                    <button onclick="ArticleLookupMode.exportExcel()"
                            class="btn-export"
                            style="min-width:110px;background:#1a6b2c;"
                            ${!hasResults ? 'disabled' : ''}>
                        Eksporter Excel
                    </button>
                </div>
            </div>

            ${hasResults ? this.renderSummaryCards(summary) : ''}

            ${hasResults ? this.renderTable(results) : '<div class="alert alert-info" style="margin-top:16px;">Lim inn artikkelnumre og trykk Analyser.</div>'}
        `;
    }

    // ════════════════════════════════════════════════════
    //  PARSING + LOOKUP
    // ════════════════════════════════════════════════════

    static parseArticleInput(text) {
        return text
            .split(/[\s,;]+/)
            .map(v => v.trim().toUpperCase())
            .filter(v => v.length > 0);
    }

    static lookupArticles(inputCodes, items) {
        const set = new Set(inputCodes);
        return items.filter(item =>
            set.has((item.toolsArticleNumber || '').toUpperCase()) ||
            set.has((item.saNumber || '').toUpperCase())
        );
    }

    // ════════════════════════════════════════════════════
    //  STATUS + BEREGNING
    // ════════════════════════════════════════════════════

    static calculateBPStatus(stock, bp) {
        if (!bp || bp <= 0) return 'Ingen BP';
        if (stock === 0)    return 'Tom lager';
        if (stock < bp)     return 'Under BP';
        return 'OK';
    }

    static buildResults(matchedItems) {
        return matchedItems.map(item => {
            const stock = item.stock || 0;
            const bp    = item.bestillingspunkt || null;
            const eok   = item.ordrekvantitet   || null;
            const avvik = (bp !== null) ? stock - bp : null;
            const status = this.calculateBPStatus(stock, bp);
            return { item, stock, bp, eok, avvik, status };
        }).sort((a, b) => {
            const order = { 'Tom lager': 1, 'Under BP': 2, 'OK': 3, 'Ingen BP': 4 };
            return (order[a.status] || 9) - (order[b.status] || 9);
        });
    }

    static buildSummary(results) {
        return {
            total:    results.length,
            tom:      results.filter(r => r.status === 'Tom lager').length,
            underBP:  results.filter(r => r.status === 'Under BP').length,
            ok:       results.filter(r => r.status === 'OK').length,
            ingenBP:  results.filter(r => r.status === 'Ingen BP').length
        };
    }

    // ════════════════════════════════════════════════════
    //  RENDERING
    // ════════════════════════════════════════════════════

    static renderSummaryCards(s) {
        return `
            <div style="display:flex;gap:12px;flex-wrap:wrap;margin:16px 0 12px;">
                <div style="padding:10px 16px;background:#f3f4f6;border-radius:6px;border:1px solid #d1d5db;min-width:90px;text-align:center;">
                    <div style="font-size:22px;font-weight:700;color:#374151;">${s.total}</div>
                    <div style="font-size:12px;color:#6b7280;">artikler</div>
                </div>
                ${s.tom > 0 ? `
                <div style="padding:10px 16px;background:#fee2e2;border-radius:6px;border:1px solid #fca5a5;min-width:90px;text-align:center;">
                    <div style="font-size:22px;font-weight:700;color:#dc2626;">${s.tom}</div>
                    <div style="font-size:12px;color:#dc2626;">tom lager</div>
                </div>` : ''}
                ${s.underBP > 0 ? `
                <div style="padding:10px 16px;background:#fff7ed;border-radius:6px;border:1px solid #fdba74;min-width:90px;text-align:center;">
                    <div style="font-size:22px;font-weight:700;color:#ea580c;">${s.underBP}</div>
                    <div style="font-size:12px;color:#ea580c;">under BP</div>
                </div>` : ''}
                ${s.ok > 0 ? `
                <div style="padding:10px 16px;background:#f0fdf4;border-radius:6px;border:1px solid #86efac;min-width:90px;text-align:center;">
                    <div style="font-size:22px;font-weight:700;color:#16a34a;">${s.ok}</div>
                    <div style="font-size:12px;color:#16a34a;">OK</div>
                </div>` : ''}
                ${s.ingenBP > 0 ? `
                <div style="padding:10px 16px;background:#f8f9fa;border-radius:6px;border:1px solid #dee2e6;min-width:90px;text-align:center;">
                    <div style="font-size:22px;font-weight:700;color:#6c757d;">${s.ingenBP}</div>
                    <div style="font-size:12px;color:#6c757d;">ingen BP</div>
                </div>` : ''}
            </div>
        `;
    }

    static renderTable(results) {
        if (results.length === 0) {
            return `<div class="alert alert-info">Ingen artikler funnet for de oppgitte numrene.</div>`;
        }

        const rows = results.map(r => {
            const { item, stock, bp, eok, avvik, status } = r;
            const rowBg = status === 'Tom lager' ? 'background:#fee2e2;'
                        : status === 'Under BP'  ? 'background:#fff7ed;'
                        : status === 'OK'        ? 'background:#f0fdf4;' : '';
            const statusBadge = this.statusBadge(status);
            const avvikStr = avvik !== null
                ? `<span style="color:${avvik < 0 ? '#dc2626' : '#16a34a'};font-weight:700;">${avvik >= 0 ? '+' : ''}${avvik.toLocaleString('nb-NO')}</span>`
                : '<span style="color:#aaa;">–</span>';

            return `
                <tr style="${rowBg}">
                    <td style="font-size:11px;font-weight:700;white-space:nowrap;">${this.esc(item.toolsArticleNumber || '') || '–'}</td>
                    <td style="font-size:11px;white-space:nowrap;color:${item.saNumber ? 'inherit' : '#aaa'};">${this.esc(item.saNumber || '') || '–'}</td>
                    <td style="font-size:11px;" title="${this.esc(item.description || '')}">${this.esc(this.trunc(item.description || '', 45))}</td>
                    <td style="text-align:right;font-weight:700;">${bp !== null ? bp.toLocaleString('nb-NO') : '<span style="color:#aaa;">–</span>'}</td>
                    <td style="text-align:right;">${eok !== null ? eok.toLocaleString('nb-NO') : '<span style="color:#aaa;">–</span>'}</td>
                    <td style="text-align:right;font-weight:700;">${stock > 0 ? stock.toLocaleString('nb-NO') : '<span style="color:#dc2626;font-weight:700;">0</span>'}</td>
                    <td style="text-align:right;color:${(item.bestAntLev || 0) > 0 ? '#1565c0' : '#aaa'};">${(item.bestAntLev || 0) > 0 ? (item.bestAntLev).toLocaleString('nb-NO') : '–'}</td>
                    <td style="text-align:right;">${avvikStr}</td>
                    <td>${statusBadge}</td>
                </tr>
            `;
        }).join('');

        return `
            <div class="table-wrapper">
                <table class="data-table compact">
                    <thead>
                        <tr>
                            <th>Tools nr</th>
                            <th>SA-nummer</th>
                            <th>Beskrivelse</th>
                            <th style="text-align:right;">BP</th>
                            <th style="text-align:right;">Ordrekvantitet</th>
                            <th style="text-align:right;">Lager</th>
                            <th style="text-align:right;">Innkommende</th>
                            <th style="text-align:right;">Avvik</th>
                            <th>Status</th>
                        </tr>
                    </thead>
                    <tbody>${rows}</tbody>
                </table>
            </div>
            <div class="table-footer">
                <p class="text-muted">Viser ${results.length} artikler</p>
            </div>
        `;
    }

    // ════════════════════════════════════════════════════
    //  EVENT HANDLERS
    // ════════════════════════════════════════════════════

    static runLookup() {
        const textarea = document.getElementById('articleLookupInput');
        const text = textarea ? textarea.value : '';
        this._inputText = text;

        if (!this._store) return;

        const codes   = this.parseArticleInput(text);
        const matched = this.lookupArticles(codes, this._store.getAllItems());
        this._lastResults = this.buildResults(matched);

        this.refreshAll();
    }

    static clearAll() {
        this._inputText  = '';
        this._lastResults = [];
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
        if (!this._lastResults || this._lastResults.length === 0) {
            alert('Ingen resultater å eksportere. Kjør Analyser først.');
            return;
        }
        if (typeof XLSX === 'undefined') {
            alert('XLSX-biblioteket er ikke tilgjengelig.');
            return;
        }

        const fileDate = new Date().toISOString().slice(0, 10);

        const rows = this._lastResults.map(r => ({
            'Tools nr':       r.item.toolsArticleNumber || '',
            'SA-nummer':      r.item.saNumber || '',
            'Beskrivelse':    r.item.description || '',
            'BP':             r.bp !== null ? r.bp : '',
            'Ordrekvantitet': r.eok !== null ? r.eok : '',
            'Lager':          r.stock,
            'Innkommende':    r.item.bestAntLev || 0,
            'Avvik':          r.avvik !== null ? r.avvik : '',
            'Status':         r.status
        }));

        const ws = XLSX.utils.json_to_sheet(rows);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'BP Kontroll');
        XLSX.writeFile(wb, `bp_kontroll_${fileDate}.xlsx`);
    }

    // ════════════════════════════════════════════════════
    //  UTILITY
    // ════════════════════════════════════════════════════

    static statusBadge(status) {
        if (status === 'Tom lager') return '<span class="badge badge-critical" style="font-size:10px;white-space:nowrap;">Tom lager</span>';
        if (status === 'Under BP')  return '<span class="badge badge-warning"  style="font-size:10px;white-space:nowrap;">Under BP</span>';
        if (status === 'OK')        return '<span class="badge badge-ok"       style="font-size:10px;">OK</span>';
        return `<span style="color:#aaa;font-size:10px;">${this.esc(status)}</span>`;
    }

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
}

// Eksporter til global scope
window.ArticleLookupMode = ArticleLookupMode;
