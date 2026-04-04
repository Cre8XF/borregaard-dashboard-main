// ===================================
// MODUS: UTSKUTTE LAGER (FASE 12)
// Operativ oversikt over 6 manuelle VMI-lokasjoner på Borregaard.
// Data hentes fra utskutteLager-arrayen i dashboard-data.json
// (bygget fra Ordrer_Jeeves.xlsx i oppdater_dashboard.py).
// ===================================

class UtskutteLagerMode {

    static _aktivLokasjon = 'alle';
    static _periode       = 'alle';
    static _sokTekst      = '';
    static _expanderte    = new Set();
    static _sortering     = 'dato';
    static _sorterAsc     = false;

    // ── Hjelpere ──────────────────────────────────────────────────────────────

    static esc(s) {
        return (s || '').toString()
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }

    static fmtNum(n, des = 0) {
        if (n === null || n === undefined || isNaN(n)) return '—';
        return Number(n).toLocaleString('nb-NO', { minimumFractionDigits: des, maximumFractionDigits: des });
    }

    static fmtKr(n) {
        if (n === null || n === undefined || isNaN(n)) return '—';
        return Number(n).toLocaleString('nb-NO', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' kr';
    }

    // ── Lokasjonsdefinisjon (fast rekkefølge) ─────────────────────────────────

    static _lokasjoner() {
        return [
            { id: '424186-2', navn: 'ØST: Spriten',    rampe: 'R-229' },
            { id: '424186-3', navn: 'VEST: Cellulose',  rampe: 'R-275' },
            { id: '424186-4', navn: 'Kokeri',           rampe: 'R-125' },
            { id: '424186-5', navn: 'ALVA',             rampe: 'R-265' },
            { id: '424186-6', navn: 'SENTRALV.',        rampe: 'R-156' },
            { id: '424186-7', navn: 'Grace',            rampe: ''      },
        ];
    }

    // ── Aggreger per lokasjon ─────────────────────────────────────────────────

    static _aggreger(records) {
        const agg = {};
        this._lokasjoner().forEach(lok => { agg[lok.id] = { linjer: 0, verdi: 0, antall: 0, sisteDato: null }; });

        records.forEach(r => {
            if (!agg[r.deliv_id]) return;
            agg[r.deliv_id].linjer++;
            agg[r.deliv_id].verdi  += r.verdi  || 0;
            agg[r.deliv_id].antall += r.antall || 0;
            if (!agg[r.deliv_id].sisteDato || r.dato > agg[r.deliv_id].sisteDato) {
                agg[r.deliv_id].sisteDato = r.dato;
            }
        });
        return agg;
    }

    // ── Filtrer og sorter ordrelinjer ─────────────────────────────────────────

    static _filtrer(records) {
        let liste = this._aktivLokasjon === 'alle'
            ? records.slice()
            : records.filter(r => r.deliv_id === this._aktivLokasjon);

        const felt = this._sortering;
        liste.sort((a, b) => {
            let va, vb;
            if (felt === 'dato')        { va = a.dato;   vb = b.dato; }
            else if (felt === 'verdi')  { va = a.verdi;  vb = b.verdi; }
            else if (felt === 'antall') { va = a.antall; vb = b.antall; }
            else /* item */             { va = (a.item || '').toLowerCase(); vb = (b.item || '').toLowerCase(); }

            if (va < vb) return this._sorterAsc ? -1 : 1;
            if (va > vb) return this._sorterAsc ?  1 : -1;
            return 0;
        });
        return liste;
    }

    // ── Filtrer på periode ─────────────────────────────────────────────────────

    static _filtrerPeriode(records) {
        if (this._periode === 'alle') return records;
        const dager = parseInt(this._periode, 10);
        const grense = new Date();
        grense.setDate(grense.getDate() - dager);
        const grenseStr = grense.toISOString().slice(0, 10);
        return records.filter(r => r.dato >= grenseStr);
    }

    // ── Grupper linjer i runder (dato + ordre_nr + deliv_id) ──────────────────

    static _gruppert(linjer) {
        const map    = new Map();
        const lokMap = {};
        this._lokasjoner().forEach(l => { lokMap[l.id] = l; });

        linjer.forEach(r => {
            const key = `${r.dato}|${r.ordre_nr}|${r.deliv_id}`;
            if (!map.has(key)) {
                const lokInfo = lokMap[r.deliv_id] || {};
                map.set(key, {
                    key,
                    dato:     r.dato,
                    ordre_nr: r.ordre_nr,
                    deliv_id: r.deliv_id,
                    lokNavn:  lokInfo.navn || r.deliv_id,
                    rampe:    lokInfo.rampe || '',
                    linjer:   [],
                    verdi:    0,
                });
            }
            const g = map.get(key);
            g.linjer.push(r);
            g.verdi += r.verdi || 0;
        });

        const runder = [...map.values()];
        runder.sort((a, b) => {
            let cmp = 0;
            if (this._sortering === 'dato') {
                cmp = a.dato < b.dato ? 1 : a.dato > b.dato ? -1 : 0;
            } else if (this._sortering === 'verdi') {
                cmp = a.verdi < b.verdi ? 1 : a.verdi > b.verdi ? -1 : 0;
            } else if (this._sortering === 'antall') {
                cmp = a.linjer.length < b.linjer.length ? 1 : a.linjer.length > b.linjer.length ? -1 : 0;
            }
            return this._sorterAsc ? -cmp : cmp;
        });
        return runder;
    }

    // ── Søk på tvers av item_id og item ───────────────────────────────────────

    static _filtrerSok(runder) {
        const q = this._sokTekst.trim().toLowerCase();
        if (!q) return runder;
        return runder.filter(g =>
            g.linjer.some(r =>
                (r.item_id || '').toLowerCase().includes(q) ||
                (r.item    || '').toLowerCase().includes(q)
            )
        );
    }

    // ── Render sammendragskort ────────────────────────────────────────────────

    static _renderKort(agg) {
        return this._lokasjoner().map(lok => {
            const a   = agg[lok.id] || { linjer: 0, verdi: 0, antall: 0, sisteDato: null };
            const akt = this._aktivLokasjon === lok.id ? ' utskutte-kort--aktiv' : '';
            const rampeStr = lok.rampe ? `<span class="utskutte-rampe">${this.esc(lok.rampe)}</span>` : '';

            return `
<button class="utskutte-kort${akt}" onclick="UtskutteLagerMode.velgLokasjon('${lok.id}')">
  <div class="utskutte-kort-header">
    <span class="utskutte-kort-navn">${this.esc(lok.navn)}</span>
    ${rampeStr}
  </div>
  <div class="utskutte-kort-stats">
    <div class="utskutte-stat">
      <span class="utskutte-stat-num">${a.linjer}</span>
      <span class="utskutte-stat-lbl">linjer</span>
    </div>
    <div class="utskutte-stat">
      <span class="utskutte-stat-num">${this.fmtKr(a.verdi)}</span>
      <span class="utskutte-stat-lbl">verdi</span>
    </div>
    <div class="utskutte-stat">
      <span class="utskutte-stat-num">${a.sisteDato || '—'}</span>
      <span class="utskutte-stat-lbl">siste levering</span>
    </div>
  </div>
</button>`;
        }).join('');
    }

    // ── Render gruppert tabell med accordion ──────────────────────────────────

    static _sortHeader(felt, label) {
        const aktiv = this._sortering === felt;
        const pil   = aktiv ? (this._sorterAsc ? ' ▲' : ' ▼') : '';
        return `<th class="utskutte-th${aktiv ? ' utskutte-th--aktiv' : ''}" onclick="UtskutteLagerMode.sorter('${felt}')">${label}${pil}</th>`;
    }

    static _renderGruppertTabell(runder) {
        if (runder.length === 0) {
            return `<p class="utskutte-tom">Ingen runder funnet for valgt filter.</p>`;
        }

        const visLokKol = this._aktivLokasjon === 'alle';
        const kolAntall = visLokKol ? 6 : 5;

        const rader = runder.map(g => {
            const exp      = this._expanderte.has(g.key);
            const pil      = exp ? '▼' : '▶';
            const safeKey  = g.key.replace(/\\/g, '\\\\').replace(/'/g, "\\'");

            const lokKol = visLokKol
                ? `<td class="utskutte-td">
                     ${this.esc(g.lokNavn)}
                     ${g.rampe ? `<span class="utskutte-rampe">${this.esc(g.rampe)}</span>` : ''}
                   </td>`
                : '';

            const gruppeRad = `<tr class="utskutte-gruppe-rad${exp ? ' utskutte-gruppe-rad--exp' : ''}"
     onclick="UtskutteLagerMode.toggleRunde('${safeKey}')">
  <td class="utskutte-td utskutte-pil-kol">
    <span class="utskutte-pil-ikon${exp ? ' utskutte-pil-ikon--exp' : ''}">${pil}</span>
  </td>
  <td class="utskutte-td utskutte-dato">${this.esc(g.dato)}</td>
  ${lokKol}
  <td class="utskutte-td">${this.esc(g.ordre_nr)}</td>
  <td class="utskutte-td utskutte-num">${g.linjer.length}</td>
  <td class="utskutte-td utskutte-num">${this.fmtKr(g.verdi)}</td>
</tr>`;

            if (!exp) return gruppeRad;

            const artikkelRader = g.linjer.map(r => `<tr class="utskutte-artikkel-rad">
  <td class="utskutte-art-td utskutte-art-id">${this.esc(r.item_id)}</td>
  <td class="utskutte-art-td utskutte-item">${this.esc(r.item)}</td>
  <td class="utskutte-art-td utskutte-num">${this.fmtNum(r.antall, 1)}</td>
  <td class="utskutte-art-td utskutte-num">${this.fmtKr(r.verdi)}</td>
</tr>`).join('');

            const ekspRad = `<tr class="utskutte-exp-row">
  <td colspan="${kolAntall}" style="padding:0">
    <div class="utskutte-exp-body">
      <table class="utskutte-art-tabell">
        <thead><tr>
          <th class="utskutte-art-th">Art.nr</th>
          <th class="utskutte-art-th">Artikkel</th>
          <th class="utskutte-art-th utskutte-num">Antall</th>
          <th class="utskutte-art-th utskutte-num">Verdi</th>
        </tr></thead>
        <tbody>${artikkelRader}</tbody>
      </table>
    </div>
  </td>
</tr>`;

            return gruppeRad + ekspRad;
        }).join('');

        const lokTh = visLokKol ? `<th class="utskutte-th">Lokasjon</th>` : '';

        return `
<table class="utskutte-tabell">
  <thead>
    <tr>
      <th class="utskutte-th utskutte-pil-th"></th>
      ${this._sortHeader('dato',   'Dato')}
      ${lokTh}
      <th class="utskutte-th">Ordre nr</th>
      ${this._sortHeader('antall', 'Antall linjer')}
      ${this._sortHeader('verdi',  'Verdi')}
    </tr>
  </thead>
  <tbody>${rader}</tbody>
</table>`;
    }

    // ── Hoved-render ─────────────────────────────────────────────────────────

    static render(records) {
        if (!records || !Array.isArray(records)) records = [];
        const agg = this._aggreger(records);

        // Pipeline: lokasjon-filter → periode-filter → grupper → søk
        const etterLok     = this._filtrer(records);
        const etterPeriode = this._filtrerPeriode(etterLok);
        const runder       = this._gruppert(etterPeriode);
        const synlige      = this._filtrerSok(runder);

        const totLinjer = records.length;
        const totVerdi  = records.reduce((s, r) => s + (r.verdi || 0), 0);
        const aktNavn   = this._aktivLokasjon === 'alle'
            ? 'Alle lokasjoner'
            : (this._lokasjoner().find(l => l.id === this._aktivLokasjon)?.navn || this._aktivLokasjon);

        const periodeVals = [
            { v: 'alle', l: 'Alle' },
            { v: '7',    l: '7 dager' },
            { v: '30',   l: '30 dager' },
            { v: '90',   l: '90 dager' },
        ];

        return `
<style>
/* ── Utskutte lager modul ──────────────────────────────────────── */
.utskutte-wrap        { padding: 16px; max-width: 1200px; }
.utskutte-header      { display: flex; align-items: baseline; gap: 12px; margin-bottom: 4px; }
.utskutte-tittel      { font-size: 1.25rem; font-weight: 700; color: var(--color-text-primary, #1a1a2e); }
.utskutte-subtitle    { font-size: 0.85rem; color: var(--color-text-tertiary, #666); }
.utskutte-total       { font-size: 0.82rem; color: var(--color-text-secondary, #444); margin-bottom: 16px; }

.utskutte-kort-grid   { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 10px; margin-bottom: 20px; }
.utskutte-kort        { background: var(--color-background-primary, #fff); border: 2px solid var(--color-border-tertiary, #e0e0e0); border-radius: 8px; padding: 12px; text-align: left; cursor: pointer; transition: border-color 0.15s, box-shadow 0.15s; }
.utskutte-kort:hover  { border-color: #1565c0; box-shadow: 0 2px 8px rgba(21,101,192,.15); }
.utskutte-kort--aktiv { border-color: #1565c0; background: #e8f0fe; }

.utskutte-kort-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px; }
.utskutte-kort-navn   { font-weight: 600; font-size: 0.9rem; color: var(--color-text-primary, #1a1a2e); }
.utskutte-rampe       { font-size: 0.72rem; background: #e3e8f0; color: #444; border-radius: 4px; padding: 1px 5px; font-family: monospace; }

.utskutte-kort-stats  { display: flex; flex-direction: column; gap: 4px; }
.utskutte-stat        { display: flex; justify-content: space-between; align-items: baseline; }
.utskutte-stat-num    { font-size: 0.88rem; font-weight: 600; color: #1565c0; }
.utskutte-stat-lbl    { font-size: 0.72rem; color: var(--color-text-tertiary, #888); }

.utskutte-filter-bar  { display: flex; align-items: center; gap: 8px; margin-bottom: 12px; flex-wrap: wrap; }
.utskutte-filter-lbl  { font-size: 0.82rem; color: var(--color-text-secondary, #555); }
.utskutte-filter-btn  { font-size: 0.8rem; padding: 4px 10px; border: 1px solid var(--color-border-tertiary, #ccc); border-radius: 4px; background: var(--color-background-primary, #fafafa); cursor: pointer; }
.utskutte-filter-btn:hover { background: #e8f0fe; border-color: #1565c0; }
.utskutte-filter-btn--aktiv { background: #1565c0; color: #fff; border-color: #1565c0; }
.utskutte-periode-sel { font-size: 0.8rem; padding: 4px 8px; border: 1px solid var(--color-border-tertiary, #ccc); border-radius: 4px; background: var(--color-background-primary, #fafafa); cursor: pointer; }
.utskutte-sok-input   { font-size: 0.8rem; padding: 4px 8px; border: 1px solid var(--color-border-tertiary, #ccc); border-radius: 4px; background: var(--color-background-primary, #fafafa); min-width: 190px; }
.utskutte-sok-input:focus { outline: 2px solid #1565c0; border-color: #1565c0; }

.utskutte-tabell      { width: 100%; border-collapse: collapse; font-size: 0.83rem; }
.utskutte-pil-th      { width: 28px; }
.utskutte-th          { background: var(--color-background-secondary, #f5f6fa); padding: 7px 10px; text-align: left; border-bottom: 2px solid var(--color-border-tertiary, #ddd); font-weight: 600; white-space: nowrap; cursor: pointer; user-select: none; }
.utskutte-th:hover    { background: #e8f0fe; }
.utskutte-th--aktiv   { color: #1565c0; }
.utskutte-pil-th      { cursor: default; }
.utskutte-pil-th:hover { background: var(--color-background-secondary, #f5f6fa); }
.utskutte-td          { padding: 6px 10px; border-bottom: 1px solid var(--color-border-tertiary, #eee); vertical-align: middle; }
.utskutte-num         { text-align: right; font-variant-numeric: tabular-nums; }
.utskutte-dato        { white-space: nowrap; color: var(--color-text-secondary, #555); }
.utskutte-item        { max-width: 260px; }
.utskutte-tom         { color: var(--color-text-tertiary, #888); font-style: italic; padding: 16px 0; }
.utskutte-antall-lbl  { font-size: 0.82rem; color: var(--color-text-secondary, #555); margin-bottom: 8px; }

.utskutte-pil-kol     { width: 28px; text-align: center; padding: 6px 4px; }
.utskutte-pil-ikon    { display: inline-block; font-size: 0.68rem; color: var(--color-text-tertiary, #999); transition: color 0.12s; }
.utskutte-pil-ikon--exp { color: #1565c0; }

.utskutte-gruppe-rad  { cursor: pointer; }
.utskutte-gruppe-rad:hover td { background: #f0f4ff; }
.utskutte-gruppe-rad--exp > td { background: var(--color-background-secondary, #f5f6fa); font-weight: 500; }

.utskutte-exp-row > td { padding: 0 !important; border-bottom: 2px solid var(--color-border-tertiary, #ddd); }
.utskutte-exp-body    { background: var(--color-background-secondary, #f8f9fc); padding: 8px 16px 12px 44px; border-top: 1px solid var(--color-border-tertiary, #e0e0e0); }

.utskutte-art-tabell  { width: 100%; border-collapse: collapse; font-size: 0.81rem; }
.utskutte-art-th      { padding: 4px 8px; text-align: left; color: var(--color-text-tertiary, #888); font-weight: 600; border-bottom: 1px solid var(--color-border-tertiary, #ddd); font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.03em; }
.utskutte-art-th.utskutte-num { text-align: right; }
.utskutte-art-td      { padding: 4px 8px; border-bottom: 1px solid var(--color-border-tertiary, #eee); vertical-align: middle; }
.utskutte-artikkel-rad:last-child .utskutte-art-td { border-bottom: none; }
.utskutte-art-id      { font-family: monospace; font-size: 0.79rem; color: var(--color-text-secondary, #555); white-space: nowrap; }
</style>

<div class="utskutte-wrap">
  <div class="utskutte-header">
    <span class="utskutte-tittel">Utskutte lager</span>
    <span class="utskutte-subtitle">6 manuelle VMI-lokasjoner</span>
  </div>
  <div class="utskutte-total">
    Totalt: <strong>${totLinjer}</strong> ordrelinjer &nbsp;|&nbsp; Samlet verdi: <strong>${this.fmtKr(totVerdi)}</strong>
  </div>

  <div class="utskutte-kort-grid">
    ${this._renderKort(agg)}
  </div>

  <div class="utskutte-filter-bar">
    <span class="utskutte-filter-lbl">Vis:</span>
    <button class="utskutte-filter-btn${this._aktivLokasjon === 'alle' ? ' utskutte-filter-btn--aktiv' : ''}"
            onclick="UtskutteLagerMode.velgLokasjon('alle')">Alle</button>
    ${this._lokasjoner().map(l =>
        `<button class="utskutte-filter-btn${this._aktivLokasjon === l.id ? ' utskutte-filter-btn--aktiv' : ''}"
                 onclick="UtskutteLagerMode.velgLokasjon('${l.id}')">${this.esc(l.navn)}</button>`
    ).join('')}
    <span class="utskutte-filter-lbl" style="margin-left:8px">Periode:</span>
    <select class="utskutte-periode-sel" onchange="UtskutteLagerMode.velgPeriode(this.value)">
      ${periodeVals.map(p =>
        `<option value="${p.v}"${this._periode === p.v ? ' selected' : ''}>${p.l}</option>`
      ).join('')}
    </select>
    <input class="utskutte-sok-input"
           type="search"
           placeholder="Søk art.nr eller artikkelnavn…"
           value="${this.esc(this._sokTekst)}"
           oninput="UtskutteLagerMode.oppdaterSok(this.value)" />
  </div>

  <div class="utskutte-antall-lbl">
    Viser <strong>${synlige.length}</strong> runder
    (${synlige.reduce((s, g) => s + g.linjer.length, 0)} linjer)
    for: <em>${this.esc(aktNavn)}</em>
  </div>

  ${this._renderGruppertTabell(synlige)}
</div>`;
    }

    // ── Event-handlers (kalles fra onclick i HTML) ────────────────────────────

    static velgLokasjon(id) {
        this._aktivLokasjon = id;
        if (window.app) window.app.renderCurrentModule();
    }

    static velgPeriode(v) {
        this._periode = v;
        if (window.app) window.app.renderCurrentModule();
    }

    static oppdaterSok(v) {
        this._sokTekst = v;
        if (window.app) window.app.renderCurrentModule();
    }

    static toggleRunde(key) {
        if (this._expanderte.has(key)) {
            this._expanderte.delete(key);
        } else {
            this._expanderte.add(key);
        }
        if (window.app) window.app.renderCurrentModule();
    }

    static sorter(felt) {
        if (this._sortering === felt) {
            this._sorterAsc = !this._sorterAsc;
        } else {
            this._sortering = felt;
            this._sorterAsc = false;
        }
        if (window.app) window.app.renderCurrentModule();
    }
}
