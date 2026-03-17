// ===================================
// MODUS: DG-KONTROLL (FASE 9.x)
// Overvåker DG%-avvik per artikkel via Orderingang.xlsx
// Formål: Oppdage at leverandøren (Tools AS) har økt
//         innkjøpspris uten tilsvarende justering av avtalepris.
// ===================================

class DGKontrollMode {
    static _avviksterskel  = -5;    // Vis kun artikler der dg_avvik < terskel
    static _minOrdrer      = 3;     // Min. antall ordrer siste 12 mnd
    static _sortering      = 'avvik'; // 'avvik' | 'dato' | 'alfa'

    // ── Hjelpefunksjoner ──────────────────────────────────────────────────────

    static esc(str) {
        return (str || '').toString()
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }

    static fmtNum(n, des = 1) {
        if (n === null || n === undefined || isNaN(n)) return '—';
        return Number(n).toFixed(des);
    }

    static fmtKr(n) {
        if (n === null || n === undefined || isNaN(n)) return '—';
        return Number(n).toFixed(2).replace('.', ',') + ' kr';
    }

    // ── Bygg SA-nummer-oppslag fra store.masterData ───────────────────────────

    static byggSaLookup(store) {
        const lookup = {};
        if (!store) return lookup;
        try {
            store.getAllItems().forEach(item => {
                if (item.toolsArticleNumber) {
                    lookup[String(item.toolsArticleNumber).trim()] = item.saNumber || '';
                }
            });
        } catch (e) { /* ignore */ }
        return lookup;
    }

    // ── Hoved-render ─────────────────────────────────────────────────────────

    static render(store) {
        const dgData = store?.dashboardData?.dgKontroll || {};
        const saLookup = this.byggSaLookup(store);

        const alleArtikler = Object.entries(dgData).map(([artNr, v]) => ({
            artNr,
            beskrivelse:     v.beskrivelse      || '',
            saNummerFra:     saLookup[artNr]    || '',
            dg_snitt_12mnd:  v.dg_snitt_12mnd   ?? 0,
            dg_siste:        v.dg_siste         ?? 0,
            dg_avvik:        v.dg_avvik         ?? 0,
            siste_pris:      v.siste_pris        ?? 0,
            siste_ksv:       v.siste_ksv         ?? 0,
            siste_ordredato: v.siste_ordredato  || '',
            antall_ordrer_12mnd: v.antall_ordrer_12mnd ?? 0,
        }));

        // Filtrer etter terskel og min. ordrer
        const filtrert = alleArtikler.filter(a =>
            a.dg_avvik < this._avviksterskel &&
            a.antall_ordrer_12mnd >= this._minOrdrer
        );

        // Sorter
        const sortert = [...filtrert].sort((a, b) => {
            if (this._sortering === 'avvik') return a.dg_avvik - b.dg_avvik;
            if (this._sortering === 'dato')  return b.siste_ordredato.localeCompare(a.siste_ordredato);
            return a.beskrivelse.localeCompare(b.beskrivelse, 'nb');
        });

        // Sammendrag
        const antAvvik  = filtrert.length;
        const snittAvvik = antAvvik > 0
            ? (filtrert.reduce((s, a) => s + a.dg_avvik, 0) / antAvvik).toFixed(1)
            : '0.0';
        const antNegDG  = alleArtikler.filter(a => a.dg_siste < 0).length;

        const ingenData = Object.keys(dgData).length === 0;

        return `
            <div class="module-header">
                <h2>DG-kontroll</h2>
            </div>

            ${ingenData ? `
                <div style="padding:20px;background:#fff8e1;border-left:4px solid #f9a825;
                            border-radius:4px;margin-bottom:20px;font-size:14px;color:#555;">
                    ℹ️ Ingen DG-kontroll data tilgjengelig.<br>
                    Kjør <strong>oppdater_dashboard.py</strong> med
                    <strong>Orderingang.xlsx</strong> tilstede i
                    <code>01-Daglig</code>-mappen.
                </div>
            ` : ''}

            ${this._renderSammendrags(antAvvik, snittAvvik, antNegDG)}
            ${this._renderFilter()}
            ${sortert.length > 0 ? this._renderTabell(sortert) : `
                <div style="padding:20px;background:#f1f8e9;border-left:4px solid #43a047;
                            border-radius:4px;font-size:14px;color:#2e7d32;">
                    ✅ Ingen artikler med DG-avvik under terskelen
                    (${this._avviksterskel} pp) og minst ${this._minOrdrer} ordrer.
                </div>
            `}
        `;
    }

    // ── Sammendragskort ───────────────────────────────────────────────────────

    static _renderSammendrags(antAvvik, snittAvvik, antNegDG) {
        const kortStyle = `
            display:inline-flex;flex-direction:column;align-items:center;
            padding:12px 24px;border-radius:8px;margin:0 8px 16px 0;
            border:1px solid #ddd;background:#fafafa;min-width:120px;
        `;
        return `
            <div style="display:flex;flex-wrap:wrap;margin-bottom:8px;">
                <div style="${kortStyle}border-color:${antAvvik > 0 ? '#c62828' : '#43a047'};
                             background:${antAvvik > 0 ? '#ffebee' : '#f1f8e9'};">
                    <span style="font-size:28px;font-weight:700;
                                 color:${antAvvik > 0 ? '#c62828' : '#2e7d32'};">
                        ${antAvvik}
                    </span>
                    <span style="font-size:12px;color:#666;margin-top:4px;">
                        Artikler under terskel
                    </span>
                </div>
                <div style="${kortStyle}">
                    <span style="font-size:28px;font-weight:700;color:#e65100;">
                        ${snittAvvik} pp
                    </span>
                    <span style="font-size:12px;color:#666;margin-top:4px;">
                        Gj.snitt avvik
                    </span>
                </div>
                <div style="${kortStyle}border-color:${antNegDG > 0 ? '#b71c1c' : '#ddd'};
                             background:${antNegDG > 0 ? '#ffcdd2' : '#fafafa'};">
                    <span style="font-size:28px;font-weight:700;
                                 color:${antNegDG > 0 ? '#b71c1c' : '#333'};">
                        ${antNegDG}
                    </span>
                    <span style="font-size:12px;color:#666;margin-top:4px;">
                        Negativ DG (&lt; 0%)
                    </span>
                </div>
            </div>
        `;
    }

    // ── Filterkontroller ──────────────────────────────────────────────────────

    static _renderFilter() {
        return `
            <div style="display:flex;flex-wrap:wrap;gap:16px;align-items:flex-end;
                        padding:12px 16px;background:#f5f5f5;border-radius:6px;
                        margin-bottom:16px;">
                <div>
                    <label style="display:block;font-size:12px;font-weight:600;
                                  color:#555;margin-bottom:4px;">
                        Avviksterskel (pp)
                    </label>
                    <input type="number" id="dgTerskel" value="${this._avviksterskel}"
                           step="1" style="width:80px;padding:5px 8px;border:1px solid #ccc;
                                           border-radius:4px;font-size:13px;"
                           onchange="DGKontrollMode.oppdaterFilter()"
                           title="Vis kun artikler der DG-avvik er lavere enn dette (negativt = fall)">
                </div>
                <div>
                    <label style="display:block;font-size:12px;font-weight:600;
                                  color:#555;margin-bottom:4px;">
                        Min. antall ordrer
                    </label>
                    <input type="number" id="dgMinOrdrer" value="${this._minOrdrer}"
                           min="1" step="1" style="width:70px;padding:5px 8px;
                                                   border:1px solid #ccc;border-radius:4px;
                                                   font-size:13px;"
                           onchange="DGKontrollMode.oppdaterFilter()"
                           title="Filtrer bort artikler med for lite historikk">
                </div>
                <div>
                    <label style="display:block;font-size:12px;font-weight:600;
                                  color:#555;margin-bottom:4px;">
                        Sortering
                    </label>
                    <select id="dgSortering" style="padding:5px 8px;border:1px solid #ccc;
                                                    border-radius:4px;font-size:13px;"
                            onchange="DGKontrollMode.oppdaterFilter()">
                        <option value="avvik"  ${this._sortering === 'avvik' ? 'selected' : ''}>
                            Størst avvik først
                        </option>
                        <option value="dato"   ${this._sortering === 'dato'  ? 'selected' : ''}>
                            Siste ordre
                        </option>
                        <option value="alfa"   ${this._sortering === 'alfa'  ? 'selected' : ''}>
                            Alfabetisk
                        </option>
                    </select>
                </div>
                <div style="margin-left:auto;">
                    <button onclick="DGKontrollMode.exportExcel()"
                            style="padding:7px 14px;background:#1a6b2c;color:#fff;border:none;
                                   border-radius:4px;cursor:pointer;font-size:13px;
                                   white-space:nowrap;">
                        📥 Eksporter Excel
                    </button>
                </div>
            </div>
        `;
    }

    // ── Tabell ────────────────────────────────────────────────────────────────

    static _avvikFarge(avvik) {
        if (avvik < -5)  return '#c62828'; // rød
        if (avvik < -2)  return '#e65100'; // gul/oransje
        if (avvik >= 0)  return '#2e7d32'; // grønn
        return '#555';
    }

    static _renderTabell(rader) {
        const rows = rader.map(a => {
            const avvikFarge = this._avvikFarge(a.dg_avvik);
            const artNrLink = `
                <span style="font-family:monospace;font-size:12px;cursor:pointer;
                             color:#1565c0;text-decoration:underline;"
                      onclick="navigateToModule('artikkeloppslag');
                               setTimeout(() => {
                                   const s = document.getElementById('artikkelOppslagSearch');
                                   if(s){s.value='${this.esc(a.artNr)}';s.dispatchEvent(new Event('input'));}
                               }, 300);"
                      title="Åpne i Artikkel Oppslag">
                    ${this.esc(a.artNr)}
                </span>`;

            return `
                <tr>
                    <td>${artNrLink}</td>
                    <td style="font-size:12px;">${this.esc(a.beskrivelse)}</td>
                    <td style="font-family:monospace;font-size:12px;color:#555;">
                        ${this.esc(a.saNummerFra || '—')}
                    </td>
                    <td style="text-align:right;">${this.fmtNum(a.dg_snitt_12mnd)}%</td>
                    <td style="text-align:right;">${this.fmtNum(a.dg_siste)}%</td>
                    <td style="text-align:right;font-weight:700;color:${avvikFarge};">
                        ${a.dg_avvik >= 0 ? '+' : ''}${this.fmtNum(a.dg_avvik)} pp
                    </td>
                    <td style="text-align:right;">${this.fmtKr(a.siste_pris)}</td>
                    <td style="text-align:right;">${this.fmtKr(a.siste_ksv)}</td>
                    <td style="font-size:12px;">${this.esc(a.siste_ordredato)}</td>
                    <td style="text-align:right;">${a.antall_ordrer_12mnd}</td>
                </tr>
            `;
        }).join('');

        return `
            <div class="table-wrapper">
                <table class="data-table compact">
                    <thead>
                        <tr>
                            <th>Tools art.nr</th>
                            <th>Beskrivelse</th>
                            <th>SA-nummer</th>
                            <th style="text-align:right;" title="Gjennomsnittlig DG% siste 12 måneder">
                                Snitt DG% (12 mnd)
                            </th>
                            <th style="text-align:right;" title="DG% på seneste ordre">
                                Siste DG%
                            </th>
                            <th style="text-align:right;"
                                title="Avvik: siste DG% minus snitt. Negativt = DG har falt.">
                                Avvik (pp)
                            </th>
                            <th style="text-align:right;">Siste pris</th>
                            <th style="text-align:right;">Siste KSV</th>
                            <th>Siste ordre</th>
                            <th style="text-align:right;" title="Antall ordrelinjer siste 12 mnd">
                                Antall ordrer
                            </th>
                        </tr>
                    </thead>
                    <tbody>${rows}</tbody>
                </table>
            </div>
            <p style="font-size:12px;color:#888;margin-top:8px;">
                Viser ${rader.length} artikler — terskel: avvik &lt; ${this._avviksterskel} pp,
                min. ${this._minOrdrer} ordrer siste 12 mnd
            </p>
        `;
    }

    // ── Filter oppdatering ────────────────────────────────────────────────────

    static oppdaterFilter() {
        const terskel  = document.getElementById('dgTerskel');
        const minOrd   = document.getElementById('dgMinOrdrer');
        const sorter   = document.getElementById('dgSortering');

        if (terskel)  this._avviksterskel = parseFloat(terskel.value)  || -5;
        if (minOrd)   this._minOrdrer     = parseInt(minOrd.value, 10) || 3;
        if (sorter)   this._sortering     = sorter.value || 'avvik';

        this.refreshAll();
    }

    static refreshAll() {
        const el = document.getElementById('moduleContent');
        if (el && window.app?.dataStore) {
            el.innerHTML = this.render(window.app.dataStore);
        }
    }

    // ── Excel-eksport ─────────────────────────────────────────────────────────

    static exportExcel() {
        if (typeof XLSX === 'undefined') {
            alert('XLSX-biblioteket er ikke lastet. Kan ikke eksportere.');
            return;
        }
        const store = window.app?.dataStore;
        if (!store) return;

        const dgData   = store.dashboardData?.dgKontroll || {};
        const saLookup = this.byggSaLookup(store);

        const rader = Object.entries(dgData)
            .map(([artNr, v]) => ({
                'Tools art.nr':       artNr,
                'SA-nummer':          saLookup[artNr] || '',
                'Beskrivelse':        v.beskrivelse || '',
                'Snitt DG% (12 mnd)': v.dg_snitt_12mnd ?? 0,
                'Siste DG%':          v.dg_siste ?? 0,
                'Avvik (pp)':         v.dg_avvik ?? 0,
                'Siste pris (kr)':    v.siste_pris ?? 0,
                'Siste KSV (kr)':     v.siste_ksv ?? 0,
                'Siste ordredato':    v.siste_ordredato || '',
                'Antall ordrer 12 mnd': v.antall_ordrer_12mnd ?? 0,
            }))
            .sort((a, b) => a['Avvik (pp)'] - b['Avvik (pp)']);

        if (rader.length === 0) {
            alert('Ingen DG-kontroll data å eksportere.');
            return;
        }

        const ws = XLSX.utils.json_to_sheet(rader);

        ws['!cols'] = [
            { wch: 16 }, // Tools art.nr
            { wch: 14 }, // SA-nummer
            { wch: 40 }, // Beskrivelse
            { wch: 18 }, // Snitt DG%
            { wch: 12 }, // Siste DG%
            { wch: 12 }, // Avvik
            { wch: 16 }, // Siste pris
            { wch: 14 }, // Siste KSV
            { wch: 14 }, // Siste ordredato
            { wch: 18 }, // Antall ordrer
        ];

        ws['!views'] = [{ state: 'frozen', ySplit: 1, xSplit: 0,
                          topLeftCell: 'A2', activePane: 'bottomLeft' }];

        const lastCol = XLSX.utils.encode_col(Object.keys(rader[0]).length - 1);
        ws['!autofilter'] = { ref: `A1:${lastCol}${rader.length + 1}` };

        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'DG-kontroll');

        const dato = new Date().toISOString().slice(0, 10);
        XLSX.writeFile(wb, `DG_kontroll_${dato}.xlsx`);
    }
}

window.DGKontrollMode = DGKontrollMode;
