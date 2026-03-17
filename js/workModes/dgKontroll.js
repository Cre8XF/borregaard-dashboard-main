// ===================================
// MODUS: DG-KONTROLL (FASE 9.x v2)
// Overvåker DG%-avvik per artikkel via Orderingang.xlsx
// Formål: Oppdage at leverandøren (Tools AS) har økt
//         innkjøpspris uten tilsvarende justering av avtalepris.
// v2: trend-indikator, fritekst-søk, vis alle artikler, vis uten SA
// ===================================

class DGKontrollMode {
    static _avviksterskel  = -5;      // Vis kun artikler der dg_avvik < terskel
    static _minOrdrer      = 3;       // Min. antall ordrer siste 12 mnd
    static _sortering      = 'avvik'; // 'avvik' | 'dato' | 'alfa'
    static _visAlleArtikler = false;  // false = kun avvik under terskel
    static _soketekst      = '';      // fritekst-søk på beskrivelse/artNr
    static _visUtenSA      = false;   // vis kun artikler uten SA-nummer

    // Sist filtrerte resultat — brukes av exportExcel
    static _sisteFiltrerte = [];

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

    // ── SA-nummer-oppslag fra store.masterData ────────────────────────────────

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

    // ── Fargekoding ───────────────────────────────────────────────────────────

    static _avvikFarge(avvik) {
        if (avvik < -5)  return '#c62828'; // rød
        if (avvik < -2)  return '#e65100'; // oransje
        if (avvik >= 0)  return '#2e7d32'; // grønn
        return '#555';
    }

    // Trend-ikon: viser om avviket er vedvarende (begge under terskel) eller engangstilfelle
    static _trendIkon(a) {
        if (a.antall_ordrer_12mnd < 3) return '';
        const sistUnder  = a.dg_siste   < this._avviksterskel;
        const trend3Under = a.dg_trend_3 < this._avviksterskel;
        if (sistUnder && trend3Under) return ' <span title="Vedvarende: snitt siste 3 ordrer er også under terskelen">🔴</span>';
        if (sistUnder && !trend3Under) return ' <span title="Engangstilfelle: snitt siste 3 ordrer er OK">🟡</span>';
        return '';
    }

    // ── Hoved-render ─────────────────────────────────────────────────────────

    static render(store) {
        const dgData   = store?.dashboardData?.dgKontroll || {};
        const saLookup = this.byggSaLookup(store);

        const alleArtikler = Object.entries(dgData).map(([artNr, v]) => ({
            artNr,
            beskrivelse:         v.beskrivelse         || '',
            saNummerFra:         saLookup[artNr]       || '',
            dg_snitt_12mnd:      v.dg_snitt_12mnd      ?? 0,
            dg_siste:            v.dg_siste            ?? 0,
            dg_trend_3:          v.dg_trend_3          ?? v.dg_siste ?? 0,
            dg_avvik:            v.dg_avvik            ?? 0,
            siste_pris:          v.siste_pris          ?? 0,
            siste_ksv:           v.siste_ksv           ?? 0,
            siste_ordredato:     v.siste_ordredato     || '',
            antall_ordrer_12mnd: v.antall_ordrer_12mnd ?? 0,
        }));

        // ── Sammendragsberegninger (hele datasettet, kun terskel + minOrdrer) ──
        const alleMedAvvik = alleArtikler.filter(a =>
            a.antall_ordrer_12mnd >= this._minOrdrer &&
            a.dg_avvik < this._avviksterskel
        );
        const antAvvik    = alleMedAvvik.length;
        const snittAvvik  = antAvvik > 0
            ? (alleMedAvvik.reduce((s, a) => s + a.dg_avvik, 0) / antAvvik).toFixed(1)
            : '0.0';
        const antNegDG    = alleArtikler.filter(a => a.dg_siste < 0).length;
        const antVedvar   = alleMedAvvik.filter(a =>
            a.antall_ordrer_12mnd >= 3 &&
            a.dg_trend_3 < this._avviksterskel
        ).length;

        // ── Filtrer for tabellen ──────────────────────────────────────────────
        const q = this._soketekst.trim().toLowerCase();
        const synlige = alleArtikler.filter(a => {
            if (a.antall_ordrer_12mnd < this._minOrdrer) return false;
            if (!this._visAlleArtikler && a.dg_avvik >= this._avviksterskel) return false;
            if (this._visUtenSA && a.saNummerFra) return false;
            if (q && !a.beskrivelse.toLowerCase().includes(q) &&
                    !a.artNr.toLowerCase().includes(q)) return false;
            return true;
        });

        // ── Sorter ────────────────────────────────────────────────────────────
        const sortert = [...synlige].sort((a, b) => {
            if (this._sortering === 'avvik') return a.dg_avvik - b.dg_avvik;
            if (this._sortering === 'dato')  return b.siste_ordredato.localeCompare(a.siste_ordredato);
            return a.beskrivelse.localeCompare(b.beskrivelse, 'nb');
        });

        this._sisteFiltrerte = sortert;

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

            <div id="dg-sammendrags-container">
                ${this._renderSammendrags(antAvvik, snittAvvik, antNegDG, antVedvar)}
            </div>
            ${this._renderFilter()}
            <div id="dg-tabell-container">
                ${sortert.length > 0 ? this._renderTabell(sortert) : `
                    <div style="padding:20px;background:#f1f8e9;border-left:4px solid #43a047;
                                border-radius:4px;font-size:14px;color:#2e7d32;">
                        ✅ Ingen artikler samsvarer med gjeldende filtre.
                    </div>
                `}
            </div>
        `;
    }

    // ── Sammendragskort ───────────────────────────────────────────────────────

    static _renderSammendrags(antAvvik, snittAvvik, antNegDG, antVedvar) {
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
                    <span style="font-size:12px;color:#666;margin-top:4px;text-align:center;">
                        Artikler under terskel
                    </span>
                </div>
                <div style="${kortStyle}">
                    <span style="font-size:28px;font-weight:700;color:#e65100;">
                        ${snittAvvik} pp
                    </span>
                    <span style="font-size:12px;color:#666;margin-top:4px;text-align:center;">
                        Gj.snitt avvik
                    </span>
                </div>
                <div style="${kortStyle}border-color:${antNegDG > 0 ? '#b71c1c' : '#ddd'};
                             background:${antNegDG > 0 ? '#ffcdd2' : '#fafafa'};">
                    <span style="font-size:28px;font-weight:700;
                                 color:${antNegDG > 0 ? '#b71c1c' : '#333'};">
                        ${antNegDG}
                    </span>
                    <span style="font-size:12px;color:#666;margin-top:4px;text-align:center;">
                        Negativ DG (&lt; 0%)
                    </span>
                </div>
                <div style="${kortStyle}border-color:${antVedvar > 0 ? '#b71c1c' : '#ddd'};
                             background:${antVedvar > 0 ? '#ffcdd2' : '#fafafa'};"
                     title="Artikler der snitt siste 3 ordrer er også under terskelen — trolig reell prisøkning">
                    <span style="font-size:28px;font-weight:700;
                                 color:${antVedvar > 0 ? '#b71c1c' : '#333'};">
                        🔴 ${antVedvar}
                    </span>
                    <span style="font-size:12px;color:#666;margin-top:4px;text-align:center;">
                        Vedvarende avvik
                    </span>
                </div>
            </div>
        `;
    }

    // ── Filterpanel ───────────────────────────────────────────────────────────

    static _renderFilter() {
        const inputStyle = 'padding:5px 8px;border:1px solid #ccc;border-radius:4px;font-size:13px;';
        const labelStyle = 'display:block;font-size:12px;font-weight:600;color:#555;margin-bottom:4px;';
        const cbStyle    = 'cursor:pointer;';

        return `
            <div style="background:#f5f5f5;border-radius:6px;padding:14px 16px;margin-bottom:8px;">

                <!-- Rad 1: Terskel, Min. ordrer, Sortering, Eksport -->
                <div style="display:flex;flex-wrap:wrap;gap:16px;align-items:flex-end;margin-bottom:12px;">
                    <div>
                        <label style="${labelStyle}">Avviksterskel (pp)</label>
                        <input type="number" id="dgTerskel" value="${this._avviksterskel}" step="1"
                               style="${inputStyle}width:80px;"
                               oninput="DGKontrollMode.oppdaterFilter()"
                               title="Vis kun artikler der DG-avvik er lavere enn dette">
                    </div>
                    <div>
                        <label style="${labelStyle}">Min. antall ordrer</label>
                        <input type="number" id="dgMinOrdrer" value="${this._minOrdrer}" min="1" step="1"
                               style="${inputStyle}width:70px;"
                               oninput="DGKontrollMode.oppdaterFilter()"
                               title="Filtrer bort artikler med for lite historikk">
                    </div>
                    <div>
                        <label style="${labelStyle}">Sortering</label>
                        <select id="dgSortering" style="${inputStyle}"
                                onchange="DGKontrollMode.oppdaterFilter()">
                            <option value="avvik" ${this._sortering === 'avvik' ? 'selected' : ''}>Størst avvik først</option>
                            <option value="dato"  ${this._sortering === 'dato'  ? 'selected' : ''}>Siste ordre</option>
                            <option value="alfa"  ${this._sortering === 'alfa'  ? 'selected' : ''}>Beskrivelse A–Å</option>
                        </select>
                    </div>
                    <div style="margin-left:auto;">
                        <button onclick="DGKontrollMode.exportExcel()"
                                style="padding:7px 14px;background:#1a6b2c;color:#fff;border:none;
                                       border-radius:4px;cursor:pointer;font-size:13px;white-space:nowrap;">
                            📥 Eksporter Excel
                        </button>
                    </div>
                </div>

                <!-- Rad 2: Fritekst-søk og toggles -->
                <div style="display:flex;flex-wrap:wrap;gap:20px;align-items:center;">
                    <div>
                        <label style="${labelStyle}">Fritekst-søk</label>
                        <input type="text" id="dgSoketekst" value="${this.esc(this._soketekst)}"
                               placeholder="Beskrivelse eller art.nr..."
                               style="${inputStyle}width:220px;"
                               oninput="DGKontrollMode.oppdaterFilter()"
                               title="Søk i beskrivelse og Tools art.nr">
                    </div>
                    <div style="display:flex;gap:20px;align-items:center;padding-top:18px;">
                        <label style="${cbStyle}display:flex;align-items:center;gap:6px;
                                      font-size:13px;color:#444;" title="Slå av for å se alle artikler uavhengig av avvik">
                            <input type="checkbox" id="dgVisKunAvvik"
                                   ${!this._visAlleArtikler ? 'checked' : ''}
                                   onchange="DGKontrollMode.oppdaterFilter()">
                            Vis kun avvik
                        </label>
                        <label style="${cbStyle}display:flex;align-items:center;gap:6px;
                                      font-size:13px;color:#444;" title="Vis kun artikler som ikke finnes i MV2 (ikke lagerført)">
                            <input type="checkbox" id="dgVisUtenSA"
                                   ${this._visUtenSA ? 'checked' : ''}
                                   onchange="DGKontrollMode.oppdaterFilter()">
                            Vis kun uten SA-nummer
                        </label>
                    </div>
                </div>
            </div>

            <!-- Trend-forklaring -->
            <div style="font-size:12px;color:#777;margin-bottom:14px;padding:0 2px;">
                Trend: 🔴 Vedvarende (snitt siste 3 ordrer også under terskel — trolig reell prisøkning) &nbsp;|&nbsp;
                🟡 Engangstilfelle (snitt siste 3 ordrer OK) &nbsp;|&nbsp;
                Ingen ikon = under 3 ordrer
            </div>
        `;
    }

    // ── Tabell ────────────────────────────────────────────────────────────────

    static _renderTabell(rader) {
        const rows = rader.map(a => {
            const avvikFarge   = this._avvikFarge(a.dg_avvik);
            const trend3Farge  = this._avvikFarge(a.dg_trend_3 - a.dg_snitt_12mnd);
            const trendIkon    = this._trendIkon(a);

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
                    <td style="text-align:right;color:${trend3Farge};"
                        title="Snitt DG% på de 3 siste ordrene">
                        ${this.fmtNum(a.dg_trend_3)}%
                    </td>
                    <td style="text-align:right;font-weight:700;color:${avvikFarge};white-space:nowrap;">
                        ${a.dg_avvik >= 0 ? '+' : ''}${this.fmtNum(a.dg_avvik)} pp${trendIkon}
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
                            <th style="text-align:right;" title="Snitt DG% på de 3 siste ordrene — trend-indikator">
                                Snitt siste 3
                            </th>
                            <th style="text-align:right;"
                                title="Avvik: siste DG% minus snitt 12 mnd. Negativt = DG har falt. Ikon viser om trenden er vedvarende.">
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
                Viser ${rader.length} artikler
                ${!this._visAlleArtikler ? `— terskel: avvik &lt; ${this._avviksterskel} pp` : '— alle artikler'}
                ${this._minOrdrer > 1    ? `, min. ${this._minOrdrer} ordrer` : ''}
                ${this._soketekst       ? `, søk: "${this.esc(this._soketekst)}"` : ''}
                ${this._visUtenSA       ? `, kun uten SA` : ''}
            </p>
        `;
    }

    // ── Filter-oppdatering ────────────────────────────────────────────────────

    static oppdaterFilter() {
        const v = id => document.getElementById(id);

        const terskel = v('dgTerskel');
        const minOrd  = v('dgMinOrdrer');
        const sorter  = v('dgSortering');
        const sokEl   = v('dgSoketekst');
        const kunAvvEl = v('dgVisKunAvvik');
        const utenSAEl = v('dgVisUtenSA');

        if (terskel)  this._avviksterskel  = parseFloat(terskel.value) || -5;
        if (minOrd)   this._minOrdrer      = parseInt(minOrd.value, 10) || 3;
        if (sorter)   this._sortering      = sorter.value || 'avvik';
        if (sokEl)    this._soketekst      = sokEl.value  || '';
        if (kunAvvEl) this._visAlleArtikler = !kunAvvEl.checked;
        if (utenSAEl) this._visUtenSA      = utenSAEl.checked;

        this._oppdaterTabellInplace();
    }

    // Oppdater kun innhold under filterpanelet uten å gjenrendere hele modulen
    static _oppdaterTabellInplace() {
        const store = window.app?.dataStore;
        if (!store) return;

        const dgData   = store.dashboardData?.dgKontroll || {};
        const saLookup = this.byggSaLookup(store);

        const alleArtikler = Object.entries(dgData).map(([artNr, v]) => ({
            artNr,
            beskrivelse:         v.beskrivelse         || '',
            saNummerFra:         saLookup[artNr]       || '',
            dg_snitt_12mnd:      v.dg_snitt_12mnd      ?? 0,
            dg_siste:            v.dg_siste            ?? 0,
            dg_trend_3:          v.dg_trend_3          ?? v.dg_siste ?? 0,
            dg_avvik:            v.dg_avvik            ?? 0,
            siste_pris:          v.siste_pris          ?? 0,
            siste_ksv:           v.siste_ksv           ?? 0,
            siste_ordredato:     v.siste_ordredato     || '',
            antall_ordrer_12mnd: v.antall_ordrer_12mnd ?? 0,
        }));

        const q = this._soketekst.trim().toLowerCase();
        const synlige = alleArtikler.filter(a => {
            if (a.antall_ordrer_12mnd < this._minOrdrer) return false;
            if (!this._visAlleArtikler && a.dg_avvik >= this._avviksterskel) return false;
            if (this._visUtenSA && a.saNummerFra) return false;
            if (q && !a.beskrivelse.toLowerCase().includes(q) &&
                    !a.artNr.toLowerCase().includes(q)) return false;
            return true;
        });

        const sortert = [...synlige].sort((a, b) => {
            if (this._sortering === 'avvik') return a.dg_avvik - b.dg_avvik;
            if (this._sortering === 'dato')  return b.siste_ordredato.localeCompare(a.siste_ordredato);
            return a.beskrivelse.localeCompare(b.beskrivelse, 'nb');
        });

        this._sisteFiltrerte = sortert;

        // Oppdater sammendragskort (terskel + minOrdrer, ikke søk/SA-filter)
        const alleMedAvvik = alleArtikler.filter(a =>
            a.antall_ordrer_12mnd >= this._minOrdrer &&
            a.dg_avvik < this._avviksterskel
        );
        const antAvvik   = alleMedAvvik.length;
        const snittAvvik = antAvvik > 0
            ? (alleMedAvvik.reduce((s, a) => s + a.dg_avvik, 0) / antAvvik).toFixed(1) : '0.0';
        const antNegDG   = alleArtikler.filter(a => a.dg_siste < 0).length;
        const antVedvar  = alleMedAvvik.filter(a =>
            a.antall_ordrer_12mnd >= 3 && a.dg_trend_3 < this._avviksterskel
        ).length;

        const samEl = document.getElementById('dg-sammendrags-container');
        const tabEl = document.getElementById('dg-tabell-container');

        if (!samEl || !tabEl) {
            // Containers missing — full re-render
            const moduleEl = document.getElementById('moduleContent');
            if (moduleEl) moduleEl.innerHTML = this.render(store);
            return;
        }

        samEl.innerHTML = this._renderSammendrags(antAvvik, snittAvvik, antNegDG, antVedvar);

        tabEl.innerHTML = sortert.length > 0 ? this._renderTabell(sortert) : `
            <div style="padding:20px;background:#f1f8e9;border-left:4px solid #43a047;
                        border-radius:4px;font-size:14px;color:#2e7d32;">
                ✅ Ingen artikler samsvarer med gjeldende filtre.
            </div>`;
    }

    static refreshAll() {
        const el = document.getElementById('moduleContent');
        if (el && window.app?.dataStore) {
            el.innerHTML = this.render(window.app.dataStore);
        }
    }

    // ── Excel-eksport (eksporterer synlige rader etter filtrering) ────────────

    static exportExcel() {
        if (typeof XLSX === 'undefined') {
            alert('XLSX-biblioteket er ikke lastet. Kan ikke eksportere.');
            return;
        }

        const raderRaw = this._sisteFiltrerte;
        if (!raderRaw || raderRaw.length === 0) {
            alert('Ingen artikler å eksportere (prøv å justere filtrene).');
            return;
        }

        const rader = raderRaw.map(a => ({
            'Tools art.nr':        a.artNr,
            'SA-nummer':           a.saNummerFra || '',
            'Beskrivelse':         a.beskrivelse || '',
            'Snitt DG% (12 mnd)':  a.dg_snitt_12mnd ?? 0,
            'Siste DG%':           a.dg_siste    ?? 0,
            'Snitt siste 3 ordrer': a.dg_trend_3  ?? 0,
            'Avvik (pp)':          a.dg_avvik    ?? 0,
            'Trend':               (() => {
                if (a.antall_ordrer_12mnd < 3) return '';
                return (a.dg_siste < this._avviksterskel && a.dg_trend_3 < this._avviksterskel)
                    ? 'Vedvarende' : 'Engangstilfelle';
            })(),
            'Siste pris (kr)':     a.siste_pris  ?? 0,
            'Siste KSV (kr)':      a.siste_ksv   ?? 0,
            'Siste ordredato':     a.siste_ordredato || '',
            'Antall ordrer 12 mnd': a.antall_ordrer_12mnd ?? 0,
        }));

        const ws = XLSX.utils.json_to_sheet(rader);

        ws['!cols'] = [
            { wch: 16 }, // Tools art.nr
            { wch: 14 }, // SA-nummer
            { wch: 40 }, // Beskrivelse
            { wch: 18 }, // Snitt DG%
            { wch: 12 }, // Siste DG%
            { wch: 20 }, // Snitt siste 3
            { wch: 12 }, // Avvik
            { wch: 16 }, // Trend
            { wch: 16 }, // Siste pris
            { wch: 14 }, // Siste KSV
            { wch: 14 }, // Siste ordredato
            { wch: 18 }, // Antall ordrer
        ];

        ws['!views'] = [{ state: 'frozen', ySplit: 1, xSplit: 0,
                          topLeftCell: 'A2', activePane: 'bottomLeft' }];
        ws['!autofilter'] = { ref: `A1:L${rader.length + 1}` };

        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'DG-kontroll');

        const dato = new Date().toISOString().slice(0, 10);
        XLSX.writeFile(wb, `DG_kontroll_${dato}.xlsx`);
    }
}

window.DGKontrollMode = DGKontrollMode;
