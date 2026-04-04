// ===================================
// MODUS: UTSKUTTE LAGER (FASE 12)
// Operativ oversikt over 6 manuelle VMI-lokasjoner på Borregaard.
// Data hentes fra utskutteLager-arrayen i dashboard-data.json
// (bygget fra Ordrer_Jeeves.xlsx i oppdater_dashboard.py).
// ===================================

class UtskutteLagerMode {

    static _aktivLokasjon = 'alle';   // 'alle' | deliv_id-streng
    static _sortering     = 'dato';   // 'dato' | 'verdi' | 'antall' | 'item'
    static _sorterAsc     = false;    // false = nyeste/høyeste først

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
            if (felt === 'dato')   { va = a.dato;  vb = b.dato; }
            else if (felt === 'verdi')  { va = a.verdi;  vb = b.verdi; }
            else if (felt === 'antall') { va = a.antall; vb = b.antall; }
            else /* item */        { va = (a.item || '').toLowerCase(); vb = (b.item || '').toLowerCase(); }

            if (va < vb) return this._sorterAsc ? -1 : 1;
            if (va > vb) return this._sorterAsc ?  1 : -1;
            return 0;
        });
        return liste;
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

    // ── Render tabell ─────────────────────────────────────────────────────────

    static _sortHeader(felt, label) {
        const aktiv = this._sortering === felt;
        const pil   = aktiv ? (this._sorterAsc ? ' ▲' : ' ▼') : '';
        return `<th class="utskutte-th${aktiv ? ' utskutte-th--aktiv' : ''}" onclick="UtskutteLagerMode.sorter('${felt}')">${label}${pil}</th>`;
    }

    static _renderTabell(linjer) {
        if (linjer.length === 0) {
            return `<p class="utskutte-tom">Ingen ordrelinjer funnet for valgt lokasjon.</p>`;
        }

        const rader = linjer.map(r => {
            const visLok = this._aktivLokasjon === 'alle'
                ? `<td class="utskutte-td">${this.esc(r.lokasjon)}${r.rampe ? ' <span class="utskutte-rampe">' + this.esc(r.rampe) + '</span>' : ''}</td>`
                : '';
            return `<tr>
  <td class="utskutte-td utskutte-dato">${this.esc(r.dato)}</td>
  ${visLok}
  <td class="utskutte-td">${this.esc(r.ordre_nr)}</td>
  <td class="utskutte-td">${this.esc(r.item_id)}</td>
  <td class="utskutte-td utskutte-item">${this.esc(r.item)}</td>
  <td class="utskutte-td utskutte-num">${this.fmtNum(r.antall, 1)}</td>
  <td class="utskutte-td utskutte-num">${this.fmtKr(r.verdi)}</td>
</tr>`;
        }).join('');

        const lokKol = this._aktivLokasjon === 'alle'
            ? `<th class="utskutte-th">Lokasjon</th>`
            : '';

        return `
<table class="utskutte-tabell">
  <thead>
    <tr>
      ${this._sortHeader('dato',  'Dato')}
      ${lokKol}
      <th class="utskutte-th">Ordre nr</th>
      <th class="utskutte-th">Art.nr</th>
      ${this._sortHeader('item',  'Artikkel')}
      ${this._sortHeader('antall','Antall')}
      ${this._sortHeader('verdi', 'Verdi')}
    </tr>
  </thead>
  <tbody>${rader}</tbody>
</table>`;
    }

    // ── Hoved-render ─────────────────────────────────────────────────────────

    static render(records) {
        if (!records || !Array.isArray(records)) records = [];
        const agg    = this._aggreger(records);
        const linjer = this._filtrer(records);

        const totLinjer = records.length;
        const totVerdi  = records.reduce((s, r) => s + (r.verdi || 0), 0);
        const aktNavn   = this._aktivLokasjon === 'alle'
            ? 'Alle lokasjoner'
            : (this._lokasjoner().find(l => l.id === this._aktivLokasjon)?.navn || this._aktivLokasjon);

        return `
<style>
/* ── Utskutte lager modul ──────────────────────────────────────── */
.utskutte-wrap        { padding: 16px; max-width: 1200px; }
.utskutte-header      { display: flex; align-items: baseline; gap: 12px; margin-bottom: 4px; }
.utskutte-tittel      { font-size: 1.25rem; font-weight: 700; color: #1a1a2e; }
.utskutte-subtitle    { font-size: 0.85rem; color: #666; }
.utskutte-total       { font-size: 0.82rem; color: #444; margin-bottom: 16px; }

.utskutte-kort-grid   { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 10px; margin-bottom: 20px; }
.utskutte-kort        { background: #fff; border: 2px solid #e0e0e0; border-radius: 8px; padding: 12px; text-align: left; cursor: pointer; transition: border-color 0.15s, box-shadow 0.15s; }
.utskutte-kort:hover  { border-color: #1565c0; box-shadow: 0 2px 8px rgba(21,101,192,.15); }
.utskutte-kort--aktiv { border-color: #1565c0; background: #e8f0fe; }

.utskutte-kort-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px; }
.utskutte-kort-navn   { font-weight: 600; font-size: 0.9rem; color: #1a1a2e; }
.utskutte-rampe       { font-size: 0.72rem; background: #e3e8f0; color: #444; border-radius: 4px; padding: 1px 5px; font-family: monospace; }

.utskutte-kort-stats  { display: flex; flex-direction: column; gap: 4px; }
.utskutte-stat        { display: flex; justify-content: space-between; align-items: baseline; }
.utskutte-stat-num    { font-size: 0.88rem; font-weight: 600; color: #1565c0; }
.utskutte-stat-lbl    { font-size: 0.72rem; color: #888; }

.utskutte-filter-bar  { display: flex; align-items: center; gap: 8px; margin-bottom: 12px; flex-wrap: wrap; }
.utskutte-filter-lbl  { font-size: 0.82rem; color: #555; }
.utskutte-filter-btn  { font-size: 0.8rem; padding: 4px 10px; border: 1px solid #ccc; border-radius: 4px; background: #fafafa; cursor: pointer; }
.utskutte-filter-btn:hover { background: #e8f0fe; border-color: #1565c0; }
.utskutte-filter-btn--aktiv { background: #1565c0; color: #fff; border-color: #1565c0; }

.utskutte-tabell      { width: 100%; border-collapse: collapse; font-size: 0.83rem; }
.utskutte-th          { background: #f5f6fa; padding: 7px 10px; text-align: left; border-bottom: 2px solid #ddd; font-weight: 600; white-space: nowrap; cursor: pointer; user-select: none; }
.utskutte-th:hover    { background: #e8f0fe; }
.utskutte-th--aktiv   { color: #1565c0; }
.utskutte-td          { padding: 6px 10px; border-bottom: 1px solid #eee; vertical-align: top; }
.utskutte-tabell tbody tr:hover td { background: #f0f4ff; }
.utskutte-num         { text-align: right; font-variant-numeric: tabular-nums; }
.utskutte-dato        { white-space: nowrap; color: #555; }
.utskutte-item        { max-width: 260px; }
.utskutte-tom         { color: #888; font-style: italic; padding: 16px 0; }
.utskutte-antall-lbl  { font-size: 0.82rem; color: #555; margin-bottom: 8px; }
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
  </div>

  <div class="utskutte-antall-lbl">Viser <strong>${linjer.length}</strong> linjer for: <em>${this.esc(aktNavn)}</em></div>

  ${this._renderTabell(linjer)}
</div>`;
    }

    // ── Event-handlers (kalles fra onclick i HTML) ────────────────────────────

    static velgLokasjon(id) {
        this._aktivLokasjon = id;
        if (window.app) window.app.renderCurrentModule();
    }

    static sorter(felt) {
        if (this._sortering === felt) {
            this._sorterAsc = !this._sorterAsc;
        } else {
            this._sortering = felt;
            this._sorterAsc = felt === 'item'; // tekst: A-Z først; tall/dato: høyest/nyest først
        }
        if (window.app) window.app.renderCurrentModule();
    }
}
