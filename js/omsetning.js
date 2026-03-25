/**
 * OmsetningMode — Daglig omsetningshistorikk
 * Viser Delivered value, Delivered quantity, Gross profit og Gross margin
 * med filtrering på periode og aggregering per dag/uke/måned.
 */
class OmsetningMode {

    constructor(app) {
        this.app = app;
        this.visning = 'dag';       // 'dag' | 'uke' | 'maaned'
        this.fraDato = null;        // Date-objekt eller null
        this.tilDato = null;
        this._parsedRows = null;
    }

    // ── Dataparsing ──────────────────────────────────────────────────────────

    _parseRows() {
        if (this._parsedRows) return this._parsedRows;
        const raw = this.app.salgsData || [];
        this._parsedRows = raw.map(r => ({
            dato:      new Date(r['Date']),
            nok:       parseFloat(r['Delivered value'])  || 0,
            dg:        parseFloat(r['Delivered quantity'])|| 0,
            bruttofort:parseFloat(r['Gross profit'])     || 0,
            margin:    parseFloat(r['Gross margin'])     || 0,
        })).filter(r => !isNaN(r.dato.getTime()))
           .sort((a, b) => a.dato - b.dato);
        return this._parsedRows;
    }

    _filtrer(rows) {
        return rows.filter(r => {
            if (this.fraDato && r.dato < this.fraDato) return false;
            if (this.tilDato && r.dato > this.tilDato) return false;
            return true;
        });
    }

    // ISO-ukenummer (Mandag = start)
    _isoUke(dato) {
        const d = new Date(Date.UTC(dato.getFullYear(), dato.getMonth(), dato.getDate()));
        d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
        const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
        const uke = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
        return `${d.getUTCFullYear()}-U${String(uke).padStart(2, '0')}`;
    }

    _grupperRader(rows) {
        if (this.visning === 'dag') return rows.map(r => ({
            label: r.dato.toLocaleDateString('nb-NO', { day:'2-digit', month:'2-digit', year:'numeric' }),
            nok: r.nok, dg: r.dg, bruttofort: r.bruttofort, margin: r.margin, antallDager: 1
        }));

        const map = new Map();
        rows.forEach(r => {
            const key = this.visning === 'uke'
                ? this._isoUke(r.dato)
                : `${r.dato.getFullYear()}-${String(r.dato.getMonth()+1).padStart(2,'0')}`;
            if (!map.has(key)) map.set(key, { label: key, nok: 0, dg: 0, bruttofort: 0, antallDager: 0, marginSum: 0 });
            const g = map.get(key);
            g.nok        += r.nok;
            g.dg         += r.dg;
            g.bruttofort += r.bruttofort;
            g.antallDager++;
            g.marginSum  += r.margin;
        });
        return Array.from(map.values()).map(g => ({
            ...g,
            margin: g.antallDager > 0 ? g.marginSum / g.antallDager : 0
        }));
    }

    // ── Nøkkeltall ───────────────────────────────────────────────────────────

    _nokkelTall(rows) {
        if (!rows.length) return { totalNok: 0, totalDg: 0, snittNok: 0, snittDg: 0, besteDag: null, snittMargin: 0 };
        const totalNok   = rows.reduce((s, r) => s + r.nok, 0);
        const totalDg    = rows.reduce((s, r) => s + r.dg, 0);
        const snittMargin= rows.reduce((s, r) => s + r.margin, 0) / rows.length;
        const besteDag   = rows.reduce((b, r) => r.nok > b.nok ? r : b, rows[0]);
        return { totalNok, totalDg, snittNok: totalNok/rows.length, snittDg: totalDg/rows.length, besteDag, snittMargin };
    }

    // ── Render ───────────────────────────────────────────────────────────────

    render(container) {
        const rows    = this._filtrer(this._parseRows());
        const grouped = this._grupperRader(rows);
        const kpi     = this._nokkelTall(rows);

        const fmt  = v => Math.round(v).toLocaleString('nb-NO') + ' kr';
        const fmtDg= v => v.toLocaleString('nb-NO', { maximumFractionDigits: 1 });
        const fmtPct=v => (v * 100).toFixed(1) + ' %';

        container.innerHTML = `
        <div class="omsetning-panel">
           <!-- Nøkkeltall-kort -->
          <div class="omsetning-kpi-grid">
            <div class="kpi-kort">
              <div class="kpi-label">Total omsetning (periode)</div>
              <div class="kpi-verdi">${fmt(kpi.totalNok)}</div>
            </div>
            <div class="kpi-kort">
              <div class="kpi-label">Snitt per dag</div>
              <div class="kpi-verdi">${fmt(kpi.snittNok)}</div>
            </div>
            <div class="kpi-kort">
              <div class="kpi-label">Total DG (periode)</div>
              <div class="kpi-verdi">${fmtDg(kpi.totalDg)}</div>
            </div>
            <div class="kpi-kort">
              <div class="kpi-label">Snitt DG per dag</div>
              <div class="kpi-verdi">${fmtDg(kpi.snittDg)}</div>
            </div>
            <div class="kpi-kort">
              <div class="kpi-label">Snitt bruttomargin</div>
              <div class="kpi-verdi">${fmtPct(kpi.snittMargin)}</div>
            </div>
            ${kpi.besteDag ? `
            <div class="kpi-kort kpi-highlight">
              <div class="kpi-label">Beste dag (NOK)</div>
              <div class="kpi-verdi">${fmt(kpi.besteDag.nok)}</div>
              <div class="kpi-sub">${kpi.besteDag.dato.toLocaleDateString('nb-NO')}</div>
            </div>` : ''}
          </div>

           <!-- Kontroller -->
          <div class="omsetning-kontroller">
            <div class="kontroll-gruppe">
              <label>Fra dato:</label>
              <input type="date" id="omsFra" value="${this._dateTilInput(this.fraDato)}">
              <label>Til dato:</label>
              <input type="date" id="omsTil" value="${this._dateTilInput(this.tilDato)}">
              <button id="omsFiltrerBtn" class="btn-sekundaer">Filtrer</button>
              <button id="omsNullstillBtn" class="btn-sekundaer">Nullstill</button>
            </div>
            <div class="kontroll-gruppe">
              <label>Vis per:</label>
              <button class="visning-btn ${this.visning==='dag'?'aktiv':''}" data-visning="dag">Dag</button>
              <button class="visning-btn ${this.visning==='uke'?'aktiv':''}" data-visning="uke">Uke</button>
              <button class="visning-btn ${this.visning==='maaned'?'aktiv':''}" data-visning="maaned">Måned</button>
            </div>
          </div>

           <!-- Tabell -->
          <div class="omsetning-tabell-wrapper">
            <table class="omsetning-tabell">
              <thead>
                <tr>
                  <th>Periode</th>
                  <th class="tall">Omsetning (kr)</th>
                  <th class="tall">DG</th>
                  <th class="tall">Bruttofortjeneste (kr)</th>
                  <th class="tall">Margin</th>
                  ${this.visning !== 'dag' ? '<th class="tall">Ant. dager</th>' : ''}
                </tr>
              </thead>
              <tbody>
                ${grouped.length === 0
                  ? `<tr><td colspan="5" class="ingen-data">Ingen data i valgt periode</td></tr>`
                  : grouped.map(g => `
                    <tr>
                      <td>${g.label}</td>
                      <td class="tall">${Math.round(g.nok).toLocaleString('nb-NO')}</td>
                      <td class="tall">${fmtDg(g.dg)}</td>
                      <td class="tall">${Math.round(g.bruttofort).toLocaleString('nb-NO')}</td>
                      <td class="tall">${fmtPct(g.margin)}</td>
                      ${this.visning !== 'dag' ? `<td class="tall">${g.antallDager}</td>` : ''}
                    </tr>`).join('')
                }
              </tbody>
              ${grouped.length > 1 ? `
              <tfoot>
                <tr class="sum-rad">
                  <td><strong>Sum</strong></td>
                  <td class="tall"><strong>${Math.round(grouped.reduce((s,g)=>s+g.nok,0)).toLocaleString('nb-NO')}</strong></td>
                  <td class="tall"><strong>${fmtDg(grouped.reduce((s,g)=>s+g.dg,0))}</strong></td>
                  <td class="tall"><strong>${Math.round(grouped.reduce((s,g)=>s+g.bruttofort,0)).toLocaleString('nb-NO')}</strong></td>
                  <td class="tall"></td>
                  ${this.visning !== 'dag' ? `<td class="tall"><strong>${grouped.reduce((s,g)=>s+g.antallDager,0)}</strong></td>` : ''}
                </tr>
              </tfoot>` : ''}
            </table>
          </div>
        </div>`;

        this._bindEvents(container);
    }

    _dateTilInput(d) {
        if (!d) return '';
        return d.toISOString().split('T')[0];
    }

    _bindEvents(container) {
        container.querySelector('#omsFiltrerBtn')?.addEventListener('click', () => {
            const fra = container.querySelector('#omsFra').value;
            const til = container.querySelector('#omsTil').value;
            this.fraDato = fra ? new Date(fra) : null;
            this.tilDato = til ? new Date(til + 'T23:59:59') : null;
            this._parsedRows = null;
            this.render(container);
        });

        container.querySelector('#omsNullstillBtn')?.addEventListener('click', () => {
            this.fraDato = null;
            this.tilDato = null;
            this._parsedRows = null;
            this.render(container);
        });

        container.querySelectorAll('.visning-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                this.visning = btn.dataset.visning;
                this._parsedRows = null;
                this.render(container);
            });
        });
    }
}
