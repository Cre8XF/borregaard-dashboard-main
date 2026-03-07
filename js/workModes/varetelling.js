// ===================================
// MODUS: VARETELLING
// Tre faner: Lokasjonssøk | Telleplan | Avvikslogg
// Lokasjonssøk og Excel-eksport er uendret fra original.
// ===================================

class VartellingMode {
    static _store        = null;
    static locationFrom  = '';
    static locationTo    = '';
    static _lastFiltered = [];
    static _activeTab    = 'lokasjonssok'; // 'lokasjonssok' | 'telleplan' | 'avvikslogg'
    static _pendingRader = null;           // Buffer for fullforTelling-data

    static TELLEPLAN_KEY  = 'borregaard_telleplan_v1';
    static AVVIKSLOGG_KEY = 'borregaard_avvikslogg_v1';

    // ════════════════════════════════════════════════════
    //  localStorage helpers
    // ════════════════════════════════════════════════════

    static getTelleplan() {
        try {
            const raw = localStorage.getItem(this.TELLEPLAN_KEY);
            return raw ? JSON.parse(raw) : [];
        } catch (e) { return []; }
    }

    static saveTelleplan(plan) {
        localStorage.setItem(this.TELLEPLAN_KEY, JSON.stringify(plan));
    }

    static getAvvikslogg() {
        try {
            const raw = localStorage.getItem(this.AVVIKSLOGG_KEY);
            return raw ? JSON.parse(raw) : [];
        } catch (e) { return []; }
    }

    static saveAvvikslogg(log) {
        localStorage.setItem(this.AVVIKSLOGG_KEY, JSON.stringify(log));
    }

    // ════════════════════════════════════════════════════
    //  MAIN RENDER
    // ════════════════════════════════════════════════════

    static render(store) {
        this._store = store;

        const items    = store.getAllItems();
        const filtered = this.filterByLocationRange(items, this.locationFrom, this.locationTo);
        this._lastFiltered = filtered;

        return `
            <div class="module-header">
                <h2>Varetelling</h2>
            </div>

            ${this.renderTabs()}

            <div id="varetelling-tab-content">
                ${this._activeTab === 'lokasjonssok' ? this.renderLokasjonssok(filtered)
                : this._activeTab === 'telleplan'    ? this.renderTelleplan()
                :                                      this.renderAvvikslogg()}
            </div>
        `;
    }

    static renderTabs() {
        const tabs = [
            { id: 'lokasjonssok', label: 'Lokasjonssøk' },
            { id: 'telleplan',    label: 'Telleplan' },
            { id: 'avvikslogg',   label: 'Avvikslogg' }
        ];
        return `
            <div style="display:flex;gap:0;margin-bottom:20px;border-bottom:2px solid #e0e0e0;">
                ${tabs.map(t => `
                    <button
                        onclick="VartellingMode.switchTab('${t.id}')"
                        style="padding:9px 22px;border:none;background:${this._activeTab === t.id ? '#fff' : 'transparent'};
                               border-bottom:${this._activeTab === t.id ? '2px solid #1a6b2c' : '2px solid transparent'};
                               margin-bottom:-2px;font-weight:${this._activeTab === t.id ? '700' : '400'};
                               color:${this._activeTab === t.id ? '#1a6b2c' : '#666'};cursor:pointer;font-size:14px;">
                        ${t.label}
                    </button>
                `).join('')}
            </div>
        `;
    }

    static switchTab(tab) {
        this._activeTab = tab;
        this.refreshAll();
    }

    // ════════════════════════════════════════════════════
    //  FANE: LOKASJONSSØK
    // ════════════════════════════════════════════════════

    static renderLokasjonssok(filtered) {
        const totalValue = filtered.reduce((s, item) => s + (item.estimertVerdi || 0), 0);
        const hasSearch  = this.locationFrom || this.locationTo;

        return `
            <div class="module-description" style="margin-bottom:12px;">
                <p>Angi lokasjonsintervall (f.eks. <strong>11-10-A</strong> til <strong>11-11-C</strong>)
                for å generere telleliste. Eksporter til Excel for utskrift på lager.</p>
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

            ${filtered.length > 0 ? `
                <div style="margin-top:16px;padding:12px 16px;background:#f5f5f5;border-radius:6px;border:1px solid #e0e0e0;display:flex;align-items:center;gap:14px;flex-wrap:wrap;">
                    <span style="font-size:13px;color:#555;">Ferdig med å telle dette intervallet?</span>
                    <button onclick="VartellingMode.fullforTelling()"
                            style="padding:8px 18px;background:#1565c0;color:#fff;border:none;border-radius:4px;cursor:pointer;font-weight:600;font-size:13px;">
                        ✓ Fullfør telling og lagre
                    </button>
                </div>
            ` : ''}
        `;
    }

    // ════════════════════════════════════════════════════
    //  FANE: TELLEPLAN
    // ════════════════════════════════════════════════════

    static renderTelleplan() {
        const plan  = this.getTelleplan();
        const items = this._store ? this._store.getAllItems() : [];
        const today = new Date();

        return `
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;flex-wrap:wrap;gap:10px;">
                <p style="color:#555;font-size:13px;margin:0;">
                    Definer soner for rullerende varetelling.
                    Klikk <strong>Tell nå</strong> for å starte lokasjonssøk for en sone.
                </p>
                <button onclick="VartellingMode.toggleAddSoneForm()"
                        style="padding:7px 16px;background:#1a6b2c;color:#fff;border:none;border-radius:4px;cursor:pointer;font-weight:600;font-size:13px;">
                    + Legg til sone
                </button>
            </div>

            <div id="add-sone-form" style="display:none;background:#f5f9f5;border:1px solid #c8e6c9;border-radius:6px;padding:16px;margin-bottom:16px;">
                <strong style="font-size:13px;color:#2e7d32;">Ny sone</strong>
                <div style="display:flex;gap:12px;flex-wrap:wrap;margin-top:10px;align-items:flex-end;">
                    <div style="display:flex;flex-direction:column;gap:4px;">
                        <label style="font-size:11px;font-weight:600;color:#555;">Sonenavn</label>
                        <input id="new-sone-navn" type="text" placeholder="f.eks. T-1 sonen"
                               style="padding:6px 10px;border:1px solid #ccc;border-radius:4px;font-size:13px;min-width:160px;">
                    </div>
                    <div style="display:flex;flex-direction:column;gap:4px;">
                        <label style="font-size:11px;font-weight:600;color:#555;">Fra lokasjon</label>
                        <input id="new-sone-fra" type="text" placeholder="f.eks. T-1-1"
                               style="padding:6px 10px;border:1px solid #ccc;border-radius:4px;font-size:13px;min-width:120px;">
                    </div>
                    <div style="display:flex;flex-direction:column;gap:4px;">
                        <label style="font-size:11px;font-weight:600;color:#555;">Til lokasjon</label>
                        <input id="new-sone-til" type="text" placeholder="f.eks. T-1-9"
                               style="padding:6px 10px;border:1px solid #ccc;border-radius:4px;font-size:13px;min-width:120px;">
                    </div>
                    <button onclick="VartellingMode.saveSone()"
                            style="padding:7px 16px;background:#1a6b2c;color:#fff;border:none;border-radius:4px;cursor:pointer;font-weight:600;font-size:13px;height:34px;">
                        Lagre sone
                    </button>
                    <button onclick="VartellingMode.toggleAddSoneForm()"
                            style="padding:7px 12px;background:#aaa;color:#fff;border:none;border-radius:4px;cursor:pointer;font-size:13px;height:34px;">
                        Avbryt
                    </button>
                </div>
            </div>

            ${plan.length === 0 ? `
                <div class="alert alert-info">Ingen soner definert ennå. Klikk «+ Legg til sone» for å starte.</div>
            ` : `
                <div class="table-wrapper">
                    <table class="data-table compact">
                        <thead>
                            <tr>
                                <th>Sone</th>
                                <th>Fra lok</th>
                                <th>Til lok</th>
                                <th style="text-align:right;">Artikler</th>
                                <th>Sist telt</th>
                                <th style="text-align:right;">Avvik</th>
                                <th>Status</th>
                                <th>Handling</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${plan.map((sone, idx) => {
                                const artCount = this.filterByLocationRange(items, sone.fra, sone.til).length;
                                const status   = this.soneStatus(sone.sist_telt, today);
                                return `
                                    <tr>
                                        <td style="font-weight:600;">${this.esc(sone.navn)}</td>
                                        <td style="font-family:monospace;font-size:12px;">${this.esc(sone.fra)}</td>
                                        <td style="font-family:monospace;font-size:12px;">${this.esc(sone.til)}</td>
                                        <td style="text-align:right;">${artCount}</td>
                                        <td style="font-size:12px;">${sone.sist_telt ? this.esc(sone.sist_telt) : '—'}</td>
                                        <td style="text-align:right;">${sone.sist_telt && sone.avvik != null ? sone.avvik : '—'}</td>
                                        <td>${status}</td>
                                        <td style="white-space:nowrap;">
                                            <button onclick="VartellingMode.tellNa(${idx})"
                                                    style="padding:4px 10px;background:#1a6b2c;color:#fff;border:none;border-radius:3px;cursor:pointer;font-size:12px;margin-right:4px;">
                                                Tell nå
                                            </button>
                                            <button onclick="VartellingMode.slettSone(${idx})"
                                                    style="padding:4px 8px;background:#e53935;color:#fff;border:none;border-radius:3px;cursor:pointer;font-size:12px;"
                                                    title="Slett sone">
                                                ✕
                                            </button>
                                        </td>
                                    </tr>
                                `;
                            }).join('')}
                        </tbody>
                    </table>
                </div>
            `}
        `;
    }

    static soneStatus(sistTelt, today) {
        if (!sistTelt) return '<span style="color:#e53935;font-weight:600;">🔴 Ikke telt</span>';
        const dato = new Date(sistTelt);
        const uker = Math.floor((today - dato) / (7 * 24 * 60 * 60 * 1000));
        if (uker < 4)  return '<span style="color:#2e7d32;font-weight:600;">✅ Ferdig</span>';
        if (uker < 8)  return `<span style="color:#e65100;font-weight:600;">⚠️ ${uker} uker</span>`;
        return `<span style="color:#e53935;font-weight:600;">🔴 ${uker} uker</span>`;
    }

    // ════════════════════════════════════════════════════
    //  FANE: AVVIKSLOGG
    // ════════════════════════════════════════════════════

    static renderAvvikslogg() {
        const logg = this.getAvvikslogg();
        const reversed = logg.slice().reverse(); // nyeste øverst

        return `
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;flex-wrap:wrap;gap:10px;">
                <p style="color:#555;font-size:13px;margin:0;">
                    Historikk over alle gjennomførte tellinger. Klikk <strong>Se</strong> for detaljer per telling.
                </p>
                <button onclick="VartellingMode.exportAvvikslogg()"
                        ${logg.length === 0 ? 'disabled' : ''}
                        style="padding:7px 14px;background:#1a6b2c;color:#fff;border:none;border-radius:4px;cursor:pointer;font-size:13px;">
                    Eksporter logg
                </button>
            </div>

            ${reversed.length === 0 ? `
                <div class="alert alert-info">Ingen tellinger registrert ennå. Fullfør en telling i Lokasjonssøk-fanen for å registrere her.</div>
            ` : `
                <div class="table-wrapper">
                    <table class="data-table compact">
                        <thead>
                            <tr>
                                <th>Dato</th>
                                <th>Sone</th>
                                <th>Fra</th>
                                <th>Til</th>
                                <th style="text-align:right;">Artikler</th>
                                <th style="text-align:right;">Avvik</th>
                                <th style="text-align:right;">Verdi avvik</th>
                                <th></th>
                            </tr>
                        </thead>
                        <tbody>
                            ${reversed.map((entry, displayIdx) => {
                                const realIdx       = logg.length - 1 - displayIdx;
                                const avvikVerdi    = Math.round(entry.avviksverdi_nok || 0);
                                const harAvvik      = (entry.antall_avvik || 0) > 0;
                                return `
                                    <tr>
                                        <td style="white-space:nowrap;">${this.esc(entry.dato)}</td>
                                        <td>${this.esc(entry.sone || '—')}</td>
                                        <td style="font-family:monospace;font-size:12px;">${this.esc(entry.fra_lok || '')}</td>
                                        <td style="font-family:monospace;font-size:12px;">${this.esc(entry.til_lok || '')}</td>
                                        <td style="text-align:right;">${entry.antall_artikler || 0}</td>
                                        <td style="text-align:right;color:${harAvvik ? '#e53935' : 'inherit'};">${entry.antall_avvik || 0}</td>
                                        <td style="text-align:right;color:${avvikVerdi !== 0 ? '#e53935' : 'inherit'};">${avvikVerdi.toLocaleString('nb-NO')} kr</td>
                                        <td>
                                            <button onclick="VartellingMode.visDetaljer(${realIdx})"
                                                    style="padding:3px 10px;background:#1565c0;color:#fff;border:none;border-radius:3px;cursor:pointer;font-size:12px;">
                                                Se
                                            </button>
                                        </td>
                                    </tr>
                                `;
                            }).join('')}
                        </tbody>
                    </table>
                </div>
            `}
        `;
    }

    // ════════════════════════════════════════════════════
    //  FILTER LOGIC (uendret)
    // ════════════════════════════════════════════════════

    static parseLocation(loc) {
        if (!loc) return null;
        const parts = loc.trim().toUpperCase().split('-');
        return {
            zone:    parseInt(parts[0], 10) || 0,
            row:     parseInt(parts[1], 10) || 0,
            section: parts[2] || ''
        };
    }

    static compareLocations(a, b) {
        if (!a && !b) return 0;
        if (!a) return 1;
        if (!b) return -1;
        if (a.zone !== b.zone) return a.zone - b.zone;
        if (a.row  !== b.row)  return a.row  - b.row;
        return a.section.localeCompare(b.section);
    }

    static filterByLocationRange(items, from, to) {
        const startStr = (from || '').trim();
        const endStr   = (to   || '').trim();

        if (!startStr && !endStr) return [...items];

        const fromLoc = startStr ? this.parseLocation(startStr) : null;
        const toLoc   = endStr   ? this.parseLocation(endStr)   : null;

        return items.filter(item => {
            const raw = (item.location || item.lagerplass || '').trim();
            if (!raw) return false;
            const itemLoc = this.parseLocation(raw);
            if (fromLoc && this.compareLocations(itemLoc, fromLoc) < 0) return false;
            if (toLoc   && this.compareLocations(itemLoc, toLoc)   > 0) return false;
            return true;
        });
    }

    // ════════════════════════════════════════════════════
    //  RENDERING HELPERS (renderSummary uendret)
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

    // renderTable: nå med digitale inputfelt for "Tellet antall"
    static renderTable(items, hasSearch) {
        if (items.length === 0) {
            if (!hasSearch) {
                return `<div class="alert alert-info">Angi lokasjon fra/til og trykk Søk for å generere telleliste.</div>`;
            }
            const range = [this.esc(this.locationFrom), this.esc(this.locationTo)].filter(Boolean).join(' – ');
            return `<div class="alert alert-info">Ingen artikler funnet i lokasjonsintervallet «${range}».</div>`;
        }

        const sorted = [...items].sort((a, b) => {
            const cmp = this.compareLocations(
                this.parseLocation(a.location || a.lagerplass || ''),
                this.parseLocation(b.location || b.lagerplass || '')
            );
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
                            <th style="text-align:right;width:90px;">Tellet antall</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${sorted.map((item, idx) => {
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
                                    <td style="padding:2px 4px;">
                                        <input type="number"
                                               id="tellet-${idx}"
                                               min="0"
                                               style="width:76px;text-align:right;padding:3px 6px;border:1px solid #ccc;border-radius:3px;font-size:13px;">
                                    </td>
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

    static bindEvents() {
        const runLocationSearch = () => {
            const from = document.getElementById('locationFrom').value;
            const to   = document.getElementById('locationTo').value;
            VartellingMode.handleSearch(from, to);
        };

        const btn    = document.getElementById('searchLocations');
        const fromEl = document.getElementById('locationFrom');
        const toEl   = document.getElementById('locationTo');

        if (btn)    btn.addEventListener('click', runLocationSearch);
        if (fromEl) fromEl.addEventListener('keypress', e => { if (e.key === 'Enter') runLocationSearch(); });
        if (toEl)   toEl.addEventListener('keypress',   e => { if (e.key === 'Enter') runLocationSearch(); });
    }

    static refreshAll() {
        const contentDiv = document.getElementById('moduleContent');
        if (contentDiv && this._store) {
            contentDiv.innerHTML = this.render(this._store);
            this.bindEvents();
        }
    }

    // ── Telleplan-handlinger ──

    static toggleAddSoneForm() {
        const form = document.getElementById('add-sone-form');
        if (form) form.style.display = form.style.display === 'none' ? 'block' : 'none';
    }

    static saveSone() {
        const navn = (document.getElementById('new-sone-navn').value || '').trim();
        const fra  = (document.getElementById('new-sone-fra').value  || '').trim();
        const til  = (document.getElementById('new-sone-til').value  || '').trim();

        if (!navn || !fra || !til) {
            alert('Alle feltene (Sonenavn, Fra lokasjon, Til lokasjon) må fylles ut.');
            return;
        }

        const plan = this.getTelleplan();
        plan.push({ id: Date.now(), navn, fra, til, sist_telt: null, avvik: null });
        this.saveTelleplan(plan);
        this.refreshAll();
    }

    static slettSone(idx) {
        if (!confirm('Slette denne sonen fra telleplanen?')) return;
        const plan = this.getTelleplan();
        plan.splice(idx, 1);
        this.saveTelleplan(plan);
        this.refreshAll();
    }

    static tellNa(idx) {
        const plan = this.getTelleplan();
        const sone = plan[idx];
        if (!sone) return;
        this.locationFrom = sone.fra;
        this.locationTo   = sone.til;
        this._activeTab   = 'lokasjonssok';
        this.refreshAll();
    }

    // ── Fullfør telling ──

    static fullforTelling() {
        if (!this._lastFiltered || this._lastFiltered.length === 0) {
            alert('Ingen artikler i listen. Søk på et lokasjonsintervall først.');
            return;
        }

        // Samle inn tellet antall — re-sortert identisk til renderTable
        const sorted = [...this._lastFiltered].sort((a, b) => {
            const cmp = this.compareLocations(
                this.parseLocation(a.location || a.lagerplass || ''),
                this.parseLocation(b.location || b.lagerplass || '')
            );
            if (cmp !== 0) return cmp;
            return (a.toolsArticleNumber || '').localeCompare(b.toolsArticleNumber || '', 'nb-NO');
        });

        const rader = sorted.map((item, idx) => {
            const input      = document.getElementById(`tellet-${idx}`);
            const telletRaw  = input ? input.value.trim() : '';
            const tellet     = telletRaw !== '' ? parseInt(telletRaw, 10) : null;
            const system     = item.stock || 0;
            const avvik      = tellet !== null ? tellet - system : null;
            const kalkylPris = item.kalkylPris || 0;
            return {
                sa:            item.saNumber || '',
                tools_nr:      item.toolsArticleNumber || '',
                beskrivelse:   item.description || '',
                lokasjon:      item.location || item.lagerplass || '',
                system_antall: system,
                tellet_antall: tellet,
                avvik:         avvik,
                avviksverdi:   avvik !== null ? avvik * kalkylPris : 0
            };
        });

        const raderMedTelling = rader.filter(r => r.tellet_antall !== null);
        if (raderMedTelling.length === 0) {
            alert('Fyll inn tellet antall for minst én rad i tabellen.');
            return;
        }

        const raderMedAvvik    = rader.filter(r => r.avvik !== null && r.avvik !== 0);
        const totalAvviksverdi = rader.reduce((s, r) => s + (r.avvik !== null ? (r.avviksverdi || 0) : 0), 0);

        // Lagre rader i buffer for bruk i _lagreTelling
        this._pendingRader = rader;

        const plan = this.getTelleplan();
        const soneOptions = [
            '<option value="">— Ingen / ukjent sone —</option>',
            ...plan.map((s, i) =>
                `<option value="${i}">${this.esc(s.navn)} (${this.esc(s.fra)} – ${this.esc(s.til)})</option>`)
        ].join('');

        const avvikFarge = raderMedAvvik.length > 0 ? '#e65100' : '#2e7d32';
        const avvikBg    = raderMedAvvik.length > 0 ? '#fff3e0' : '#e8f5e9';
        const verdiFarge = totalAvviksverdi !== 0 ? '#e65100' : '#2e7d32';
        const verdiBg    = totalAvviksverdi !== 0 ? '#fff3e0' : '#e8f5e9';

        const modalHtml = `
            <div id="fullfor-modal-overlay"
                 style="position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.5);z-index:9999;display:flex;align-items:center;justify-content:center;">
                <div style="background:#fff;border-radius:8px;padding:28px;max-width:520px;width:92%;box-shadow:0 8px 32px rgba(0,0,0,0.25);">
                    <h3 style="margin:0 0 18px;font-size:16px;">Fullfør telling</h3>

                    <div style="display:flex;gap:12px;flex-wrap:wrap;margin-bottom:18px;">
                        <div style="padding:10px 14px;background:#e3f2fd;border-radius:6px;text-align:center;flex:1;min-width:90px;">
                            <div style="font-size:22px;font-weight:700;color:#1565c0;">${raderMedTelling.length}</div>
                            <div style="font-size:11px;color:#1565c0;">rader telt</div>
                        </div>
                        <div style="padding:10px 14px;background:${avvikBg};border-radius:6px;text-align:center;flex:1;min-width:90px;">
                            <div style="font-size:22px;font-weight:700;color:${avvikFarge};">${raderMedAvvik.length}</div>
                            <div style="font-size:11px;color:${avvikFarge};">rader med avvik</div>
                        </div>
                        <div style="padding:10px 14px;background:${verdiBg};border-radius:6px;text-align:center;flex:1;min-width:90px;">
                            <div style="font-size:16px;font-weight:700;color:${verdiFarge};">${Math.round(totalAvviksverdi).toLocaleString('nb-NO')} kr</div>
                            <div style="font-size:11px;color:${verdiFarge};">total avviksverdi</div>
                        </div>
                    </div>

                    <div style="margin-bottom:18px;">
                        <label style="font-size:12px;font-weight:600;color:#555;display:block;margin-bottom:6px;">
                            Tilhører dette en sone i telleplanen?
                        </label>
                        <select id="fullfor-sone-valg"
                                style="width:100%;padding:7px 10px;border:1px solid #ccc;border-radius:4px;font-size:13px;">
                            ${soneOptions}
                        </select>
                    </div>

                    <div style="display:flex;gap:10px;justify-content:flex-end;">
                        <button onclick="document.getElementById('fullfor-modal-overlay').remove();VartellingMode._pendingRader=null;"
                                style="padding:8px 18px;background:#aaa;color:#fff;border:none;border-radius:4px;cursor:pointer;font-size:13px;">
                            Avbryt
                        </button>
                        <button onclick="VartellingMode._lagreTelling()"
                                style="padding:8px 18px;background:#1a6b2c;color:#fff;border:none;border-radius:4px;cursor:pointer;font-weight:600;font-size:13px;">
                            Lagre telling
                        </button>
                    </div>
                </div>
            </div>
        `;

        document.body.insertAdjacentHTML('beforeend', modalHtml);
    }

    static _lagreTelling() {
        const rader = this._pendingRader;
        if (!rader) return;

        const soneValgEl = document.getElementById('fullfor-sone-valg');
        const soneValg   = soneValgEl ? soneValgEl.value : '';

        const plan    = this.getTelleplan();
        const soneIdx = soneValg !== '' ? parseInt(soneValg, 10) : null;
        const sone    = soneIdx !== null ? plan[soneIdx] : null;

        const dato             = new Date().toISOString().slice(0, 10);
        const raderMedAvvik    = rader.filter(r => r.avvik !== null && r.avvik !== 0);
        const totalAvviksverdi = rader.reduce((s, r) => s + (r.avvik !== null ? (r.avviksverdi || 0) : 0), 0);

        const entry = {
            dato,
            sone:            sone ? sone.navn : '',
            fra_lok:         this.locationFrom,
            til_lok:         this.locationTo,
            antall_artikler: rader.filter(r => r.tellet_antall !== null).length,
            antall_avvik:    raderMedAvvik.length,
            avviksverdi_nok: totalAvviksverdi,
            rader
        };

        const logg = this.getAvvikslogg();
        logg.push(entry);
        this.saveAvvikslogg(logg);

        // Oppdater sone i telleplanen
        if (sone !== null && soneIdx !== null) {
            plan[soneIdx].sist_telt = dato;
            plan[soneIdx].avvik     = raderMedAvvik.length;
            this.saveTelleplan(plan);
        }

        this._pendingRader = null;

        const overlay = document.getElementById('fullfor-modal-overlay');
        if (overlay) overlay.remove();

        const msg = raderMedAvvik.length > 0
            ? `Telling lagret! ${raderMedAvvik.length} avvik registrert.`
            : 'Telling lagret! Ingen avvik.';
        alert(msg);

        this._activeTab = 'avvikslogg';
        this.refreshAll();
    }

    // ── Avvikslogg-handlinger ──

    static visDetaljer(idx) {
        const logg  = this.getAvvikslogg();
        const entry = logg[idx];
        if (!entry) return;

        const raderRows = (entry.rader || []).map(r => {
            const harAvvik   = r.avvik !== null && r.avvik !== 0;
            const avvikTekst = r.avvik != null ? (r.avvik > 0 ? '+' + r.avvik : '' + r.avvik) : '–';
            return `
                <tr>
                    <td style="font-family:monospace;font-size:11px;">${this.esc(r.lokasjon || '')}</td>
                    <td style="font-size:11px;">${this.esc(r.tools_nr || '')}</td>
                    <td style="font-size:11px;" title="${this.esc(r.beskrivelse || '')}">${this.esc(this.trunc(r.beskrivelse || '', 35))}</td>
                    <td style="text-align:right;">${r.system_antall != null ? r.system_antall : '–'}</td>
                    <td style="text-align:right;">${r.tellet_antall != null ? r.tellet_antall : '–'}</td>
                    <td style="text-align:right;color:${harAvvik ? '#e53935' : 'inherit'};">${avvikTekst}</td>
                    <td style="text-align:right;color:${(r.avviksverdi || 0) !== 0 ? '#e53935' : 'inherit'};">
                        ${r.avvik != null ? Math.round(r.avviksverdi || 0).toLocaleString('nb-NO') + ' kr' : '–'}
                    </td>
                </tr>
            `;
        }).join('');

        const modalHtml = `
            <div id="detaljer-modal-overlay"
                 style="position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.5);z-index:9999;display:flex;align-items:center;justify-content:center;">
                <div style="background:#fff;border-radius:8px;padding:24px;max-width:820px;width:95%;max-height:82vh;overflow-y:auto;box-shadow:0 8px 32px rgba(0,0,0,0.25);">
                    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
                        <h3 style="margin:0;font-size:15px;">
                            Telledetaljer — ${this.esc(entry.dato)}${entry.sone ? ` — ${this.esc(entry.sone)}` : ''}
                        </h3>
                        <button onclick="document.getElementById('detaljer-modal-overlay').remove()"
                                style="border:none;background:none;cursor:pointer;font-size:22px;color:#777;line-height:1;">×</button>
                    </div>
                    <div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:16px;">
                        <div style="padding:7px 12px;background:#f5f5f5;border-radius:4px;font-size:12px;">
                            <strong>Intervall:</strong> ${this.esc(entry.fra_lok || '')} – ${this.esc(entry.til_lok || '')}
                        </div>
                        <div style="padding:7px 12px;background:#f5f5f5;border-radius:4px;font-size:12px;">
                            <strong>Artikler telt:</strong> ${entry.antall_artikler || 0}
                        </div>
                        <div style="padding:7px 12px;background:${(entry.antall_avvik || 0) > 0 ? '#fff3e0' : '#f5f5f5'};border-radius:4px;font-size:12px;">
                            <strong>Avvik:</strong> ${entry.antall_avvik || 0}
                        </div>
                        <div style="padding:7px 12px;background:${(entry.avviksverdi_nok || 0) !== 0 ? '#fff3e0' : '#f5f5f5'};border-radius:4px;font-size:12px;">
                            <strong>Avviksverdi:</strong> ${Math.round(entry.avviksverdi_nok || 0).toLocaleString('nb-NO')} kr
                        </div>
                    </div>
                    <div class="table-wrapper">
                        <table class="data-table compact" style="font-size:12px;">
                            <thead>
                                <tr>
                                    <th>Lokasjon</th>
                                    <th>Tools nr</th>
                                    <th>Beskrivelse</th>
                                    <th style="text-align:right;">System</th>
                                    <th style="text-align:right;">Telt</th>
                                    <th style="text-align:right;">Avvik</th>
                                    <th style="text-align:right;">Verdi avvik</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${raderRows}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        `;

        document.body.insertAdjacentHTML('beforeend', modalHtml);
    }

    static exportAvvikslogg() {
        const logg = this.getAvvikslogg();
        if (logg.length === 0) {
            alert('Ingen logg å eksportere.');
            return;
        }
        if (typeof XLSX === 'undefined') {
            alert('XLSX-biblioteket er ikke tilgjengelig.');
            return;
        }

        const wb = XLSX.utils.book_new();

        // Oppsummeringsark (nyeste øverst)
        const oversiktRows = logg.slice().reverse().map(entry => ({
            'Dato':             entry.dato,
            'Sone':             entry.sone || '',
            'Fra':              entry.fra_lok || '',
            'Til':              entry.til_lok || '',
            'Artikler telt':    entry.antall_artikler || 0,
            'Avvik':            entry.antall_avvik || 0,
            'Avviksverdi (kr)': Math.round(entry.avviksverdi_nok || 0)
        }));
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(oversiktRows), 'Avvikslogg');

        // Detaljark (alle rader fra alle tellinger)
        const detaljRows = [];
        logg.slice().reverse().forEach(entry => {
            (entry.rader || []).forEach(r => {
                if (r.tellet_antall === null) return;
                detaljRows.push({
                    'Dato':              entry.dato,
                    'Sone':              entry.sone || '',
                    'SA-nummer':         r.sa || '',
                    'Tools nr':          r.tools_nr || '',
                    'Beskrivelse':       r.beskrivelse || '',
                    'Lokasjon':          r.lokasjon || '',
                    'System antall':     r.system_antall,
                    'Tellet antall':     r.tellet_antall,
                    'Avvik':             r.avvik,
                    'Avviksverdi (kr)':  Math.round(r.avviksverdi || 0)
                });
            });
        });
        if (detaljRows.length > 0) {
            XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(detaljRows), 'Avviksdetaljer');
        }

        const fileDate = new Date().toISOString().slice(0, 10);
        XLSX.writeFile(wb, `avvikslogg_${fileDate}.xlsx`);
    }

    // ════════════════════════════════════════════════════
    //  EXCEL EKSPORT (uendret — tom kolonne for papirbruk)
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

        const sorted = [...this._lastFiltered].sort((a, b) => {
            const cmp = this.compareLocations(
                this.parseLocation(a.location || a.lagerplass || ''),
                this.parseLocation(b.location || b.lagerplass || '')
            );
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
            'Tellet antall': ''
        }));

        const ws = XLSX.utils.json_to_sheet(rows);
        const wb = XLSX.utils.book_new();
        const sheetName = `${from}_${to}`.slice(0, 31);
        XLSX.utils.book_append_sheet(wb, ws, sheetName);
        XLSX.writeFile(wb, `telleliste_${from}_${to}_${fileDate}.xlsx`);
    }

    // ════════════════════════════════════════════════════
    //  UTILITY (uendret)
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
