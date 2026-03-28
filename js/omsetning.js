/**
 * OmsetningMode — Daglig omsetningshistorikk med drill-down
 *
 * Rad-struktur fra JSON:
 *   Date, Customer, Item, "Main item ID", "Order number",
 *   "Delivered value", "Delivered quantity", "Gross profit", "Gross margin"
 *
 * Visning:
 *   - Dagstabell (aggregert) — klikk på rad åpner modal
 *   - Modal: ordrer for valgt dag, gruppert på Order number
 *   - Inne i modal: ekspander ordre → artikkellinjene
 *   - Søkefelt: søk på art.nr, ordrenummer eller varebeskrivelse
 */
class OmsetningMode {

    constructor(app) {
        this.app      = app;
        this.visning  = 'dag';   // 'dag' | 'uke' | 'maaned'
        this.fraDato  = null;
        this.tilDato  = null;
        this._rows    = null;    // parsed + sortert cache
        this._sokTerm = '';
        this._sokResultatInfo = '';
    }

    // ── Parsing ──────────────────────────────────────────────────────────────

    _getRows() {
        if (this._rows) return this._rows;
        const raw    = this.app.salgsData || [];
        const dgMap  = this.app.dataStore?.orderingangDGMap || {};
        this._rows = raw.map(r => {
            const dgKey = `${r['Order number']}|${r['Main item ID']}`;
            return {
                dato:    new Date(r['Date']),
                item:    r['Item']          || '',
                artNr:   r['Main item ID']  || '',
                ordreNr: String(r['Order number'] || ''),
                nok:     parseFloat(r['Delivered value'])    || 0,
                dg:      parseFloat(r['Delivered quantity']) || 0,
                gp:      parseFloat(r['Gross profit'])       || 0,
                margin:  r['Gross margin'] === '-' ? null
                           : parseFloat(r['Gross margin'])   || 0,
                dgPct:   dgMap[dgKey] ?? null,
            };
        }).filter(r => !isNaN(r.dato.getTime()))
          .sort((a, b) => a.dato - b.dato);
        return this._rows;
    }

    _filtrer(rows) {
        return rows.filter(r => {
            if (this.fraDato && r.dato < this.fraDato) return false;
            if (this.tilDato && r.dato > this.tilDato) return false;
            return true;
        });
    }

    _datoKey(dato) {
        return dato.toISOString().split('T')[0];
    }

    _isoUke(dato) {
        const d = new Date(Date.UTC(dato.getFullYear(), dato.getMonth(), dato.getDate()));
        d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
        const y0 = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
        const uke = Math.ceil((((d - y0) / 86400000) + 1) / 7);
        return `${d.getUTCFullYear()}-U${String(uke).padStart(2, '0')}`;
    }

    // ── Aggregering ──────────────────────────────────────────────────────────

    _grupperPerDag(rows) {
        const map = new Map();
        rows.forEach(r => {
            const key = this._datoKey(r.dato);
            if (!map.has(key)) map.set(key, {
                key, label: r.dato.toLocaleDateString('nb-NO'),
                nok: 0, dg: 0, gp: 0, marginSum: 0, marginCount: 0, antRader: 0
            });
            const g = map.get(key);
            g.nok += r.nok; g.dg += r.dg; g.gp += r.gp; g.antRader++;
            if (r.margin !== null) { g.marginSum += r.margin; g.marginCount++; }
        });
        return Array.from(map.values()).map(g => ({
            ...g, margin: g.marginCount > 0 ? g.marginSum / g.marginCount : null
        }));
    }

    _grupperPerUke(rows) {
        const map = new Map();
        rows.forEach(r => {
            const key = this._isoUke(r.dato);
            if (!map.has(key)) map.set(key, {
                key, label: key,
                nok: 0, dg: 0, gp: 0, marginSum: 0, marginCount: 0, antDager: new Set()
            });
            const g = map.get(key);
            g.nok += r.nok; g.dg += r.dg; g.gp += r.gp;
            g.antDager.add(this._datoKey(r.dato));
            if (r.margin !== null) { g.marginSum += r.margin; g.marginCount++; }
        });
        return Array.from(map.values()).map(g => ({
            ...g,
            antRader: g.antDager.size,
            margin: g.marginCount > 0 ? g.marginSum / g.marginCount : null
        }));
    }

    _grupperPerMaaned(rows) {
        const map = new Map();
        rows.forEach(r => {
            const key = `${r.dato.getFullYear()}-${String(r.dato.getMonth()+1).padStart(2,'0')}`;
            const label = r.dato.toLocaleDateString('nb-NO', { month: 'long', year: 'numeric' });
            if (!map.has(key)) map.set(key, {
                key, label,
                nok: 0, dg: 0, gp: 0, marginSum: 0, marginCount: 0, antDager: new Set()
            });
            const g = map.get(key);
            g.nok += r.nok; g.dg += r.dg; g.gp += r.gp;
            g.antDager.add(this._datoKey(r.dato));
            if (r.margin !== null) { g.marginSum += r.margin; g.marginCount++; }
        });
        return Array.from(map.values()).map(g => ({
            ...g,
            antRader: g.antDager.size,
            margin: g.marginCount > 0 ? g.marginSum / g.marginCount : null
        }));
    }

    _grupper(rows) {
        if (this.visning === 'dag')    return this._grupperPerDag(rows);
        if (this.visning === 'uke')    return this._grupperPerUke(rows);
        return this._grupperPerMaaned(rows);
    }

    _kpi(rows) {
        if (!rows.length) return {};
        const totalNok = rows.reduce((s,r) => s+r.nok, 0);
        const dagKeys  = new Set(rows.map(r => this._datoKey(r.dato)));
        const antDager = dagKeys.size;
        const margins  = rows.filter(r => r.margin !== null).map(r => r.margin);
        const snittMargin = margins.length ? margins.reduce((a,b)=>a+b,0)/margins.length : 0;

        // beste dag
        const dagMap = new Map();
        rows.forEach(r => {
            const k = this._datoKey(r.dato);
            dagMap.set(k, (dagMap.get(k)||0) + r.nok);
        });
        let besteDatoKey = '', besteNok = 0;
        dagMap.forEach((v,k) => { if (v > besteNok) { besteNok = v; besteDatoKey = k; }});

        return {
            totalNok,
            snittNok:  totalNok / antDager,
            totalDg:   rows.reduce((s,r) => s+r.dg, 0),
            snittDg:   rows.reduce((s,r) => s+r.dg, 0) / antDager,
            snittMargin,
            besteNok,
            besteDato: besteDatoKey
                ? new Date(besteDatoKey).toLocaleDateString('nb-NO')
                : '',
        };
    }

    // ── Søk ──────────────────────────────────────────────────────────────────

    _matcherSok(row) {
        if (!this._sokTerm) return true;
        const t = this._sokTerm.toLowerCase();
        return (
            (row.artNr   || '').toString().toLowerCase().includes(t) ||
            (row.ordreNr || '').toString().toLowerCase().includes(t) ||
            (row.item    || '').toString().toLowerCase().includes(t)
        );
    }

    _formatDatoKort(dato) {
        return `${dato.getDate()}.${dato.getMonth() + 1}.${dato.getFullYear()}`;
    }

    _renderSokResultater(allRows) {
        const treff = allRows.filter(r => this._matcherSok(r));

        // Grupper på ordrenummer, behold tidligste dato per ordre
        const ordreMap = new Map();
        treff.forEach(r => {
            if (!ordreMap.has(r.ordreNr)) ordreMap.set(r.ordreNr, {
                ordreNr: r.ordreNr, dato: r.dato, linjer: [], nok: 0, dg: 0, gp: 0
            });
            const o = ordreMap.get(r.ordreNr);
            o.linjer.push(r);
            o.nok += r.nok; o.dg += r.dg; o.gp += r.gp;
            if (r.dato < o.dato) o.dato = r.dato;
        });

        const ordrer = Array.from(ordreMap.values())
            .sort((a, b) => b.dato - a.dato || b.nok - a.nok);

        this._sokResultatInfo = treff.length === 0
            ? 'Ingen treff'
            : `${treff.length} treff på ${ordrer.length} ordre${ordrer.length !== 1 ? 'r' : ''}`;

        if (ordrer.length === 0) {
            return `<div style="padding:24px;text-align:center;color:#94a3b8;font-size:14px;">Ingen treff for «${this._sokTerm}»</div>`;
        }

        const fmtNok = v => Math.round(v).toLocaleString('nb-NO');
        const fmtDg  = v => v.toLocaleString('nb-NO', { maximumFractionDigits: 1 });
        const fmtPct = v => v !== null ? (v * 100).toFixed(1) + ' %' : '–';

        return `
        <div style="display:flex;flex-direction:column;gap:8px;">
          ${ordrer.map(o => `
          <div class="oms-ordre-blokk" style="border:1px solid #e2e8f0;border-radius:6px;overflow:hidden;">
            <div style="display:flex;align-items:center;justify-content:space-between;
                        padding:10px 16px;background:#f0f7ff;border-left:3px solid #2e75b6;">
              <span style="font-weight:700;font-size:14px;">
                Ordre ${o.ordreNr}
                <span style="font-size:12px;color:#64748b;font-weight:400;margin-left:8px;">
                  — ${this._formatDatoKort(o.dato)}
                </span>
              </span>
              <span style="font-size:13px;color:#2e75b6;font-weight:600;">${fmtNok(o.nok)} kr
                <span style="color:#64748b;font-weight:400;margin-left:8px;">DG: ${fmtDg(o.dg)}&nbsp;&nbsp;GP: ${fmtNok(o.gp)} kr</span>
              </span>
            </div>
            <div>
              <table class="oms-linjer-tabell">
                <thead><tr>
                  <th>Art.nr</th><th>Beskrivelse</th>
                  <th class="tall">NOK</th><th class="tall">Ant</th><th class="tall">DG</th>
                  <th class="tall">GP</th><th class="tall">DG%</th>
                </tr></thead>
                <tbody>
                  ${o.linjer.map(l => `
                  <tr>
                    <td class="art-nr">${l.artNr}</td>
                    <td>${l.item}</td>
                    <td class="tall">${fmtNok(l.nok)}</td>
                    <td class="tall">${Math.round(l.dg).toLocaleString('nb-NO')}</td>
                    <td class="tall">${fmtDg(l.dg)}</td>
                    <td class="tall">${fmtNok(l.gp)}</td>
                    <td class="tall">${l.dgPct !== null ? l.dgPct.toFixed(1) + ' %' : (l.margin !== null ? (l.margin * 100).toFixed(1) + ' %' : '–')}</td>
                  </tr>`).join('')}
                </tbody>
              </table>
            </div>
          </div>`).join('')}
        </div>`;
    }

    _renderTabell(grouped) {
        const fmtDg  = v => v.toLocaleString('nb-NO', { maximumFractionDigits: 1 });
        const fmtPct = v => v !== null ? (v * 100).toFixed(1) + ' %' : '–';
        const klikk  = this.visning === 'dag' ? 'oms-dag-klikk' : '';

        return `
        <div class="omsetning-tabell-wrapper">
          <table class="omsetning-tabell">
            <thead><tr>
              <th>Periode</th>
              <th class="tall">Omsetning (kr)</th>
              <th class="tall">DG</th>
              <th class="tall">Bruttofortjeneste (kr)</th>
              <th class="tall">Margin</th>
              ${this.visning !== 'dag' ? '<th class="tall">Ant. dager</th>' : ''}
            </tr></thead>
            <tbody>
              ${grouped.length === 0
                ? `<tr><td colspan="6" class="ingen-data">Ingen data i valgt periode</td></tr>`
                : grouped.map(g => `
                  <tr class="${klikk}" data-key="${g.key}" title="${this.visning==='dag'?'Klikk for detaljer':''}">
                    <td>${g.label}${this.visning==='dag' ? ' <span class="drill-ikon">🔍</span>' : ''}</td>
                    <td class="tall">${Math.round(g.nok).toLocaleString('nb-NO')}</td>
                    <td class="tall">${fmtDg(g.dg)}</td>
                    <td class="tall">${Math.round(g.gp).toLocaleString('nb-NO')}</td>
                    <td class="tall">${fmtPct(g.margin)}</td>
                    ${this.visning !== 'dag' ? `<td class="tall">${g.antRader}</td>` : ''}
                  </tr>`).join('')
              }
            </tbody>
            ${grouped.length > 1 ? `
            <tfoot><tr class="sum-rad">
              <td><strong>Sum</strong></td>
              <td class="tall"><strong>${Math.round(grouped.reduce((s,g)=>s+g.nok,0)).toLocaleString('nb-NO')}</strong></td>
              <td class="tall"><strong>${fmtDg(grouped.reduce((s,g)=>s+g.dg,0))}</strong></td>
              <td class="tall"><strong>${Math.round(grouped.reduce((s,g)=>s+g.gp,0)).toLocaleString('nb-NO')}</strong></td>
              <td></td>
              ${this.visning !== 'dag' ? `<td class="tall"><strong>${grouped.reduce((s,g)=>s+(g.antRader||0),0)}</strong></td>` : ''}
            </tr></tfoot>` : ''}
          </table>
        </div>`;
    }

    _renderOrdreContainer(allRows, grouped) {
        if (this._sokTerm) {
            return this._renderSokResultater(allRows);
        }
        return this._renderTabell(grouped);
    }

    _oppdaterOmsetningVisning(container, allRows) {
        const grouped = this._grupper(allRows);

        const ordreContainer = container.querySelector('#omsetningOrdreContainer');
        if (ordreContainer) {
            ordreContainer.innerHTML = this._renderOrdreContainer(allRows, grouped);
            if (!this._sokTerm) {
                ordreContainer.querySelectorAll('.oms-dag-klikk').forEach(tr => {
                    tr.addEventListener('click', () => {
                        this._aapneDag(tr.dataset.key, allRows, container);
                    });
                });
            }
        }

        // Oppdater søkestatus (nullstill-knapp + treff-info)
        const sokStatus = container.querySelector('#omsetningSearchStatus');
        if (sokStatus) {
            if (this._sokTerm) {
                sokStatus.innerHTML = `
                  <button id="omsetningNullstill"
                          style="padding:7px 14px;border-radius:8px;border:1.5px solid #e2e8f0;
                                 background:#fff;color:#64748b;font-size:12px;cursor:pointer;
                                 white-space:nowrap;">
                    ✕ Nullstill
                  </button>
                  <span style="font-size:12px;color:#64748b;">${this._sokResultatInfo}</span>`;
                sokStatus.querySelector('#omsetningNullstill')?.addEventListener('click', () => {
                    this._sokTerm = '';
                    const searchEl = container.querySelector('#omsetningSearch');
                    if (searchEl) searchEl.value = '';
                    this._oppdaterOmsetningVisning(container, allRows);
                });
            } else {
                sokStatus.innerHTML = '';
            }
        }
    }

    // ── Render hoved-panel ───────────────────────────────────────────────────

    render(container) {
        const allRows = this._filtrer(this._getRows());
        const grouped = this._grupper(allRows);
        const kpi     = this._kpi(allRows);

        // Pre-populate sokResultatInfo if søk er aktivt ved render
        if (this._sokTerm) {
            this._renderSokResultater(allRows);
        }

        const fmtNok = v => Math.round(v).toLocaleString('nb-NO') + ' kr';
        const fmtDg  = v => v.toLocaleString('nb-NO', { maximumFractionDigits: 1 });
        const fmtPct = v => v !== null ? (v * 100).toFixed(1) + ' %' : '–';

        container.innerHTML = `
        <div class="omsetning-panel">

          <div class="omsetning-kpi-grid">
            <div class="kpi-kort"><div class="kpi-label">Total omsetning</div><div class="kpi-verdi">${fmtNok(kpi.totalNok||0)}</div></div>
            <div class="kpi-kort"><div class="kpi-label">Snitt per dag</div><div class="kpi-verdi">${fmtNok(kpi.snittNok||0)}</div></div>
            <div class="kpi-kort"><div class="kpi-label">Total DG</div><div class="kpi-verdi">${fmtDg(kpi.totalDg||0)}</div></div>
            <div class="kpi-kort"><div class="kpi-label">Snitt DG per dag</div><div class="kpi-verdi">${fmtDg(kpi.snittDg||0)}</div></div>
            <div class="kpi-kort"><div class="kpi-label">Snitt bruttomargin</div><div class="kpi-verdi">${fmtPct(kpi.snittMargin||0)}</div></div>
            ${kpi.besteDato ? `<div class="kpi-kort kpi-highlight">
              <div class="kpi-label">Beste dag</div>
              <div class="kpi-verdi">${fmtNok(kpi.besteNok)}</div>
              <div class="kpi-sub">${kpi.besteDato}</div>
            </div>` : ''}
          </div>

          <!-- Ordresøk-bar -->
          <div style="display:flex;align-items:center;gap:10px;margin:0 0 14px 0;">
            <div style="position:relative;flex:1;max-width:420px;">
              <span style="position:absolute;left:10px;top:50%;transform:translateY(-50%);
                           color:#94a3b8;font-size:15px;pointer-events:none;">🔍</span>
              <input
                id="omsetningSearch"
                type="text"
                placeholder="Søk art.nr eller ordrenummer…"
                value="${this._sokTerm.replace(/"/g, '&quot;')}"
                style="width:100%;padding:8px 12px 8px 34px;border:1.5px solid #cbd5e1;
                       border-radius:8px;font-size:13px;outline:none;box-sizing:border-box;
                       transition:border-color .15s;"
                onfocus="this.style.borderColor='#2e75b6'"
                onblur="this.style.borderColor='#cbd5e1'">
            </div>
            <div id="omsetningSearchStatus" style="display:flex;align-items:center;gap:8px;">
              ${this._sokTerm ? `
                <button id="omsetningNullstill"
                        style="padding:7px 14px;border-radius:8px;border:1.5px solid #e2e8f0;
                               background:#fff;color:#64748b;font-size:12px;cursor:pointer;
                               white-space:nowrap;">
                  ✕ Nullstill
                </button>
                <span style="font-size:12px;color:#64748b;">${this._sokResultatInfo}</span>
              ` : ''}
            </div>
          </div>

          <div class="omsetning-kontroller">
            <div class="kontroll-gruppe">
              <label>Fra:</label>
              <input type="date" id="omsFra" value="${this._d2i(this.fraDato)}">
              <label>Til:</label>
              <input type="date" id="omsTil" value="${this._d2i(this.tilDato)}">
              <button id="omsFiltrerBtn" class="btn-sekundaer">Filtrer</button>
              <button id="omsNullstillBtn" class="btn-sekundaer">Nullstill</button>
            </div>
            <div class="kontroll-gruppe">
              <label>Vis per:</label>
              <button class="visning-btn ${this.visning==='dag'?'aktiv':''}" data-v="dag">Dag</button>
              <button class="visning-btn ${this.visning==='uke'?'aktiv':''}" data-v="uke">Uke</button>
              <button class="visning-btn ${this.visning==='maaned'?'aktiv':''}" data-v="maaned">Måned</button>
            </div>
            ${this.visning === 'dag' && !this._sokTerm ? `<div class="kontroll-hint">💡 Klikk på en dag for å se ordrer og artikler</div>` : ''}
          </div>

          <div id="omsetningOrdreContainer">
            ${this._renderOrdreContainer(allRows, grouped)}
          </div>
        </div>

        <!-- Modal -->
        <div id="omsModal" class="oms-modal-overlay" style="display:none">
          <div class="oms-modal">
            <div class="oms-modal-header">
              <h3 id="omsModalTittel"></h3>
              <button id="omsModalLukk" class="oms-lukk-btn">✕</button>
            </div>
            <div id="omsModalInnhold" class="oms-modal-innhold"></div>
          </div>
        </div>`;

        this._bindEvents(container, allRows);
    }

    // ── Drill-down modal ─────────────────────────────────────────────────────

    _aapneDag(datoKey, allRows, container) {
        const dagsRader = allRows.filter(r => this._datoKey(r.dato) === datoKey);
        if (!dagsRader.length) return;

        const dato = new Date(datoKey).toLocaleDateString('nb-NO', {
            weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
        });

        // Grupper på ordrenummer
        const ordreMap = new Map();
        dagsRader.forEach(r => {
            if (!ordreMap.has(r.ordreNr)) ordreMap.set(r.ordreNr, {
                ordreNr: r.ordreNr, linjer: [], nok: 0, dg: 0, gp: 0
            });
            const o = ordreMap.get(r.ordreNr);
            o.linjer.push(r);
            o.nok += r.nok; o.dg += r.dg; o.gp += r.gp;
        });

        const fmtNok = v => Math.round(v).toLocaleString('nb-NO');
        const fmtDg  = v => v.toLocaleString('nb-NO', { maximumFractionDigits: 1 });
        const fmtPct = v => v !== null ? (v * 100).toFixed(1) + ' %' : '–';

        const ordrer = Array.from(ordreMap.values())
            .sort((a,b) => b.nok - a.nok);

        const totalNok = dagsRader.reduce((s,r)=>s+r.nok,0);
        const totalDg  = dagsRader.reduce((s,r)=>s+r.dg,0);
        const totalGp  = dagsRader.reduce((s,r)=>s+r.gp,0);

        container.querySelector('#omsModalTittel').textContent =
            `${dato.charAt(0).toUpperCase() + dato.slice(1)}`;

        container.querySelector('#omsModalInnhold').innerHTML = `
          <div class="oms-dag-summary">
            <span><strong>Omsetning:</strong> ${fmtNok(totalNok)} kr</span>
            <span><strong>DG:</strong> ${fmtDg(totalDg)}</span>
            <span><strong>Bruttofortjeneste:</strong> ${fmtNok(totalGp)} kr</span>
            <span><strong>Antall ordrer:</strong> ${ordrer.length}</span>
          </div>
          ${ordrer.map(o => `
          <div class="oms-ordre-blokk">
            <div class="oms-ordre-header" data-ordre="${o.ordreNr}">
              <span class="oms-ordre-pil">▶</span>
              <span class="oms-ordre-nr">Ordre ${o.ordreNr}</span>
              <span class="oms-ordre-nok">${fmtNok(o.nok)} kr</span>
              <span class="oms-ordre-dg">DG: ${fmtDg(o.dg)}</span>
              <span class="oms-ordre-gp">GP: ${fmtNok(o.gp)} kr</span>
            </div>
            <div class="oms-ordre-linjer" id="linjer-${o.ordreNr}" style="display:none">
              <table class="oms-linjer-tabell">
                <thead><tr>
                  <th>Art.nr</th><th>Beskrivelse</th>
                  <th class="tall">NOK</th><th class="tall">Ant</th><th class="tall">DG</th>
                  <th class="tall">GP</th><th class="tall">DG%</th>
                </tr></thead>
                <tbody>
                  ${o.linjer.map(l => `
                  <tr>
                    <td class="art-nr">${l.artNr}</td>
                    <td>${l.item}</td>
                    <td class="tall">${fmtNok(l.nok)}</td>
                    <td class="tall">${Math.round(l.dg).toLocaleString('nb-NO')}</td>
                    <td class="tall">${fmtDg(l.dg)}</td>
                    <td class="tall">${fmtNok(l.gp)}</td>
                    <td class="tall">${l.dgPct !== null ? l.dgPct.toFixed(1) + ' %' : (l.margin !== null ? (l.margin * 100).toFixed(1) + ' %' : '–')}</td>
                  </tr>`).join('')}
                </tbody>
              </table>
            </div>
          </div>`).join('')}`;

        container.querySelector('#omsModal').style.display = 'flex';

        // Ekspander/kollaps ordre
        container.querySelectorAll('.oms-ordre-header').forEach(h => {
            h.addEventListener('click', () => {
                const id  = h.dataset.ordre;
                const div = container.querySelector(`#linjer-${id}`);
                const pil = h.querySelector('.oms-ordre-pil');
                const vis = div.style.display === 'none';
                div.style.display = vis ? 'block' : 'none';
                pil.textContent   = vis ? '▼' : '▶';
            });
        });

        // Auto-ekspander hvis bare én ordre
        if (ordrer.length === 1) {
            const eneste = container.querySelector('.oms-ordre-header');
            if (eneste) eneste.click();
        }
    }

    // ── Events ───────────────────────────────────────────────────────────────

    _bindEvents(container, allRows) {
        // Søk
        container.querySelector('#omsetningSearch')?.addEventListener('input', e => {
            this._sokTerm = e.target.value.trim();
            this._oppdaterOmsetningVisning(container, allRows);
        });

        // Nullstill søk (initial render, hvis synlig)
        container.querySelector('#omsetningNullstill')?.addEventListener('click', () => {
            this._sokTerm = '';
            const searchEl = container.querySelector('#omsetningSearch');
            if (searchEl) searchEl.value = '';
            this._oppdaterOmsetningVisning(container, allRows);
        });

        container.querySelector('#omsFiltrerBtn')?.addEventListener('click', () => {
            const fra = container.querySelector('#omsFra').value;
            const til = container.querySelector('#omsTil').value;
            this.fraDato = fra ? new Date(fra) : null;
            this.tilDato = til ? new Date(til + 'T23:59:59') : null;
            this._rows = null;
            this.render(container);
        });

        container.querySelector('#omsNullstillBtn')?.addEventListener('click', () => {
            this.fraDato = null; this.tilDato = null;
            this._rows = null;
            this.render(container);
        });

        container.querySelectorAll('.visning-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                this.visning = btn.dataset.v;
                this._rows = null;
                this.render(container);
            });
        });

        // Dag-klikk → modal (kun i normal modus uten søk)
        if (!this._sokTerm) {
            container.querySelectorAll('.oms-dag-klikk').forEach(tr => {
                tr.addEventListener('click', () => {
                    this._aapneDag(tr.dataset.key, allRows, container);
                });
            });
        }

        // Lukk modal
        container.querySelector('#omsModalLukk')?.addEventListener('click', () => {
            container.querySelector('#omsModal').style.display = 'none';
        });
        container.querySelector('#omsModal')?.addEventListener('click', e => {
            if (e.target.id === 'omsModal')
                container.querySelector('#omsModal').style.display = 'none';
        });
    }

    _d2i(d) { return d ? d.toISOString().split('T')[0] : ''; }
}
