// ===================================
// MODUS: BP-KONTROLL (FASE 7.3)
// Tre faner: Øk BP | Reduser BP | Alle artikler
// ===================================

class BPKontrollMode {
    static _activeTab = 'ok-bp'; // 'ok-bp' | 'reduser-bp' | 'alle'
    static _sortField = 'dekningUker';
    static _sortAsc   = true;

    // ── Beregn BP-analyse per item ──
    static beregnBPInfo(item) {
        const bp          = item.bestillingspunkt ?? 0;
        const saldo       = item.stock ?? 0;
        const bestilt     = item.aapentBestiltAntall ?? item.bestAntLev ?? 0;
        const ledetid     = item.ledetidDager ?? 14; // default 14 dager
        const ledetidUker = ledetid / 7;
        const sales12m    = item.sales12m ?? 0;
        const snittPerUke = sales12m > 0 ? sales12m / 52 : 0;

        // Dekning = (saldo + bestilt) / snitt per uke
        const totalTilgjengelig = saldo + bestilt;
        const dekningUker = snittPerUke > 0
            ? totalTilgjengelig / snittPerUke
            : 999;

        // Foreslått BP = snitt per uke × ledetid i uker × 1.2 (20% buffer)
        const foreslattBP = snittPerUke > 0
            ? Math.ceil(snittPerUke * ledetidUker * 1.2)
            : null;

        // Vurdering
        let vurdering = 'ok';
        if (bp === 0 && snittPerUke === 0) vurdering = 'ingen-salg';
        else if (snittPerUke === 0)        vurdering = 'ingen-salg';
        else if (dekningUker < ledetidUker) vurdering = 'ok-bp';  // under BP allerede eller snart
        else if (foreslattBP !== null && bp > foreslattBP * 1.5)  vurdering = 'reduser-bp';
        else if (foreslattBP !== null && bp < foreslattBP * 0.7)  vurdering = 'ok-bp';

        return {
            bp, saldo, bestilt, ledetidUker,
            snittPerUke, dekningUker, foreslattBP,
            vurdering, totalTilgjengelig,
            verdi: (saldo * (item.kalkylPris || 0))
        };
    }

    static render(store) {
        const items = store.getAllItems();

        // Beregn for alle
        const analyse = items
            .map(item => ({ item, info: this.beregnBPInfo(item) }));

        const okBP     = analyse.filter(a => a.info.vurdering === 'ok-bp');
        const redserBP = analyse.filter(a => a.info.vurdering === 'reduser-bp');
        const alle     = analyse.filter(a => a.info.snittPerUke > 0);

        return `
            <div class="module-header">
                <h2>BP-kontroll</h2>
            </div>

            ${this.renderTabs(okBP.length, redserBP.length, alle.length)}

            <div id="bp-tab-content">
                ${this._activeTab === 'ok-bp'
                    ? this.renderListe(okBP, '🔴 Vurder å øke BP',
                        'Disse artiklene har lavere BP enn forbruk × ledetid tilsier. Risiko for tomgang.')
                : this._activeTab === 'reduser-bp'
                    ? this.renderListe(redserBP, '🟢 Vurder å senke BP',
                        'Disse artiklene har BP satt mye høyere enn faktisk forbruk tilsier. Binder kapital unødvendig.')
                :   this.renderListe(alle, '📋 Alle artikler med salg',
                        'Alle artikler med registrert salg siste 12 måneder.')}
            </div>
        `;
    }

    static renderTabs(antOk, antReduser, antAlle) {
        const tabs = [
            { id: 'ok-bp',      label: '🔴 Øk BP',   antall: antOk },
            { id: 'reduser-bp', label: '🟢 Senk BP',  antall: antReduser },
            { id: 'alle',       label: '📋 Alle',      antall: antAlle }
        ];
        return `
            <div style="display:flex;gap:0;margin-bottom:20px;border-bottom:2px solid #e0e0e0;">
                ${tabs.map(t => `
                    <button onclick="BPKontrollMode.switchTab('${t.id}')"
                        style="padding:9px 22px;border:none;cursor:pointer;font-size:13px;font-weight:600;
                               background:${this._activeTab === t.id ? '#fff' : 'transparent'};
                               border-bottom:${this._activeTab === t.id ? '3px solid #1a6b2c' : '3px solid transparent'};
                               color:${this._activeTab === t.id ? '#1a6b2c' : '#666'};">
                        ${t.label}
                        <span style="margin-left:6px;background:#eee;border-radius:10px;
                                     padding:1px 7px;font-size:11px;color:#555;">
                            ${t.antall}
                        </span>
                    </button>
                `).join('')}
            </div>
        `;
    }

    static renderListe(analyse, tittel, beskrivelse) {
        if (analyse.length === 0) {
            return `<div class="alert alert-info">Ingen artikler i denne kategorien.</div>`;
        }

        // Sorter
        const sortert = [...analyse].sort((a, b) => {
            const va = a.info[this._sortField] ?? 0;
            const vb = b.info[this._sortField] ?? 0;
            return this._sortAsc ? va - vb : vb - va;
        });

        const rows = sortert.map(({ item, info }) => {
            const dekFarge = info.dekningUker < info.ledetidUker ? '#c62828'
                           : info.dekningUker < info.ledetidUker * 2 ? '#e65100'
                           : '#2e7d32';

            const bpFarge = info.foreslattBP !== null && info.bp < info.foreslattBP * 0.7
                          ? '#c62828'
                          : info.foreslattBP !== null && info.bp > info.foreslattBP * 1.5
                          ? '#e65100' : '#333';

            const levDato = item.nesteForventetLevering
                ? `<span style="font-size:11px;color:#1565c0;">📦 ${item.nesteForventetLevering}</span>`
                : '';

            return `
                <tr>
                    <td style="font-family:monospace;font-size:12px;">
                        ${this.esc(item.toolsArticleNumber || item.saNumber)}
                    </td>
                    <td style="font-size:12px;">${this.esc(item.description || '—')}</td>
                    <td style="font-family:monospace;font-size:12px;">${this.esc(item.location || item.lagerplass || '—')}</td>
                    <td style="text-align:right;">${info.saldo}</td>
                    <td style="text-align:right;color:#1565c0;">
                        ${info.bestilt > 0 ? `+${info.bestilt}` : '—'}
                        ${levDato}
                    </td>
                    <td style="text-align:right;font-weight:600;color:${bpFarge};">${info.bp}</td>
                    <td style="text-align:right;">${info.snittPerUke.toFixed(1)}</td>
                    <td style="text-align:right;">${Math.round(info.ledetidUker * 7)} dgr</td>
                    <td style="text-align:right;font-weight:600;color:${dekFarge};">
                        ${info.dekningUker === 999 ? '∞' : info.dekningUker.toFixed(1)} uker
                    </td>
                    <td style="text-align:right;font-weight:600;color:#1a6b2c;">
                        ${info.foreslattBP !== null ? info.foreslattBP : '—'}
                    </td>
                </tr>
            `;
        }).join('');

        return `
            <div style="margin-bottom:12px;display:flex;justify-content:space-between;align-items:flex-end;">
                <div>
                    <h3 style="margin:0 0 4px;font-size:15px;">${tittel}</h3>
                    <p style="margin:0;font-size:13px;color:#666;">${beskrivelse}</p>
                </div>
                <button onclick="BPKontrollMode.exportExcel()"
                        style="padding:7px 14px;background:#1a6b2c;color:#fff;border:none;
                               border-radius:4px;cursor:pointer;font-size:13px;">
                    📥 Eksporter Excel
                </button>
            </div>

            <div class="table-wrapper">
                <table class="data-table compact">
                    <thead>
                        <tr>
                            <th>Art.nr</th>
                            <th>Beskrivelse</th>
                            <th>Lokasjon</th>
                            <th style="text-align:right;">Saldo</th>
                            <th style="text-align:right;">Bestilt</th>
                            <th style="text-align:right;" title="Nåværende bestillingspunkt">BP nå</th>
                            <th style="text-align:right;">Snitt/uke</th>
                            <th style="text-align:right;">Ledetid</th>
                            <th style="text-align:right;cursor:pointer;" onclick="BPKontrollMode.sortBy('dekningUker')"
                                title="Klikk for å sortere">
                                Dekning ↕
                            </th>
                            <th style="text-align:right;" title="Foreslått BP basert på forbruk × ledetid × 1.2">
                                Foreslått BP
                            </th>
                        </tr>
                    </thead>
                    <tbody>${rows}</tbody>
                </table>
            </div>
        `;
    }

    static switchTab(tab) {
        this._activeTab = tab;
        this.refreshAll();
    }

    static sortBy(field) {
        if (this._sortField === field) this._sortAsc = !this._sortAsc;
        else { this._sortField = field; this._sortAsc = true; }
        this.refreshAll();
    }

    static refreshAll() {
        const el = document.getElementById('moduleContent');
        if (el && window.app?.dataStore) {
            el.innerHTML = this.render(window.app.dataStore);
        }
    }

    static exportExcel() {
        if (typeof XLSX === 'undefined') return;
        const store = window.app?.dataStore;
        if (!store) return;

        const items = store.getAllItems();
        const rows = items
            .map(item => {
                const info = this.beregnBPInfo(item);
                if (info.snittPerUke === 0) return null;
                return {
                    'Art.nr':           item.toolsArticleNumber || '',
                    'SA-nummer':        item.saNumber || '',
                    'Beskrivelse':      item.description || '',
                    'Lokasjon':         item.location || item.lagerplass || '',
                    'Saldo':            info.saldo,
                    'Bestilt (åpent)':  info.bestilt,
                    'Neste levering':   item.nesteForventetLevering || '',
                    'BP nå':            info.bp,
                    'Snitt/uke':        Math.round(info.snittPerUke * 10) / 10,
                    'Ledetid (dager)':  Math.round(info.ledetidUker * 7),
                    'Dekning (uker)':   info.dekningUker === 999 ? '' : Math.round(info.dekningUker * 10) / 10,
                    'Foreslått BP':     info.foreslattBP ?? '',
                    'Vurdering':        info.vurdering === 'ok-bp' ? 'Vurder å øke'
                                      : info.vurdering === 'reduser-bp' ? 'Vurder å senke' : 'OK'
                };
            })
            .filter(Boolean);

        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), 'BP-analyse');
        XLSX.writeFile(wb, `bp_kontroll_${new Date().toISOString().slice(0,10)}.xlsx`);
    }

    static esc(str) {
        return (str || '').toString()
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }
}

window.BPKontrollMode = BPKontrollMode;
