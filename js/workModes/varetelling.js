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
    static _activeTab    = 'lokasjonssok'; // 'lokasjonssok' | 'telleplan' | 'avvikslogg' | 'lavverdi'
    static _pendingRader = null;           // Buffer for fullforTelling-data
    static _utestaaendeIdx = null;         // Hvilken sone som har utestående-panelet åpent
    static _visFullforte  = false;

    static TELLEPLAN_KEY  = 'borregaard_telleplan_v1';
    static AVVIKSLOGG_KEY = 'borregaard_avvikslogg_v1';

    // ════════════════════════════════════════════════════
    //  AVVIK-LOGIKK FOR FORHÅNDSUTFYLT TELLELISTE
    // ════════════════════════════════════════════════════

    /**
     * Returnerer true hvis artikkelen er en bulk-vare (bolt, mutter, skive, splint osv.)
     * som typisk telles med 20–50 stk avvik.
     */
    static _erBulkArtikkel(beskrivelse) {
        const b = (beskrivelse || '').toLowerCase();
        return [
            'bolt','mutter','skive','stoppskive','splint','spennstift',
            'settskrue','sporskr','sylhskr','sylh.mask','nagle','blindnagle',
            'nagler','skruer','skrue',' skr ','din125','din934','din912',
            'din963','din84','din916','din1481','iso4762','iso1234',
            'spiker','låsering','underlagsskive','låsskive'
        ].some(kw => b.includes(kw));
    }

    /**
     * Beregner forhåndsutfylt «Tellet antall» basert på saldo og beskrivelse.
     * Bruker deterministisk pseudo-tilfeldig basert på artikkelnummer som seed
     * slik at samme artikkel alltid får samme avvik (stabilt på tvers av eksporter).
     *
     * Avvik-regler:
     *   Bulk-artikler (bolt/mutter/skive/splint osv.):
     *     saldo > 500  → ±20–50 stk (70% sjanse under saldo)
     *     saldo > 100  → ±10–30 stk
     *     saldo > 50   → ±5–20 stk
     *     saldo ≤ 50   → ±1–5 stk
     *   Vanlige artikler:
     *     saldo ≤ 5    → av og til ±1, ofte eksakt
     *     saldo > 5    → 8–15% avvik (60% sjanse under saldo)
     *   saldo = 0      → alltid 0
     */
    static _beregnTelletAntall(saldo, beskrivelse, artnr) {
        if (!saldo || saldo <= 0) return 0;

        // Deterministisk seed fra artikkelnummer
        let seed = 0;
        const s = String(artnr || '');
        for (let i = 0; i < s.length; i++) {
            seed = ((seed << 5) - seed + s.charCodeAt(i)) | 0;
        }
        // Enkel LCG-generator
        const rng = () => {
            seed = (Math.imul(1664525, seed) + 1013904223) | 0;
            return (seed >>> 0) / 4294967296;
        };
        const randInt = (min, max) => min + Math.floor(rng() * (max - min + 1));

        let avvik, retning;

        if (this._erBulkArtikkel(beskrivelse)) {
            if      (saldo > 500) avvik = randInt(20, 50);
            else if (saldo > 100) avvik = randInt(10, 30);
            else if (saldo > 50)  avvik = randInt(5,  20);
            else                  avvik = randInt(1,  5);
            retning = rng() < 0.70 ? -1 : 1;
        } else {
            if (saldo <= 5) {
                const jitter = rng() < 0.4 ? (rng() < 0.5 ? 1 : -1) : 0;
                return Math.max(0, saldo + jitter);
            }
            const pst = 0.08 + rng() * 0.07; // 8–15%
            avvik = Math.max(1, Math.round(saldo * pst));
            retning = rng() < 0.60 ? -1 : 1;
        }

        return Math.max(0, saldo + retning * avvik);
    }

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
                : this._activeTab === 'lavverdi'     ? this.renderLavverdi()
                :                                      this.renderAvvikslogg()}
            </div>
        `;
    }

    static renderTabs() {
        const tabs = [
            { id: 'lokasjonssok', label: 'Lokasjonssøk' },
            { id: 'telleplan',    label: 'Telleplan' },
            { id: 'avvikslogg',   label: 'Avvikslogg' },
            { id: 'lavverdi',     label: '💰 Lavverdi' }
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
                <button onclick="VartellingMode.exportExcelMedAvvik()"
                        class="btn-export"
                        title="Forhåndsutfyllt tellet antall: bulk-artikler ±20–50 stk, andre ±10–15%"
                        style="height:36px;background:#1565c0;"
                        ${filtered.length === 0 ? 'disabled' : ''}>
                    Eksporter med avvik
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
        const rawPlan = this.getTelleplan();
        const items   = this._store ? this._store.getAllItems() : [];
        const today   = new Date();
        const currentWeek = this.getISOWeek(today);

        // Sort by uke, nulls last
        const plan = [...rawPlan].sort((a, b) => {
            const ua = (a.uke != null) ? a.uke : 9999;
            const ub = (b.uke != null) ? b.uke : 9999;
            return ua - ub;
        });

        // ── Totaltelling 2026 — FASE 8.1: bruk varetelling_meta hvis tilgjengelig ──
        const meta = window.app && window.app.vartellingMeta;
        const totaltArtikler  = meta ? meta.omfang      : items.length;
        const teltI2026Totalt = meta ? meta.antall_telt  : items.filter(item => {
            const d = item.invDat ? String(item.invDat).replace(/\D/g, '') : '';
            return d.length === 8 && d >= '20260101';
        }).length;
        const pstTotalt = meta
            ? meta.prosent_telt
            : (totaltArtikler > 0 ? Math.round((teltI2026Totalt / totaltArtikler) * 100) : 0);

        // sisteTeltTotalt beholdes fra InvDat (kun brukt til «Sist: dato»)
        const alleDatoer2026 = items
            .map(i => String(i.invDat || '').replace(/\D/g, ''))
            .filter(d => d.length === 8 && d >= '20260101')
            .sort();
        const sisteTeltTotalt = alleDatoer2026.length > 0
            ? alleDatoer2026[alleDatoer2026.length - 1]
            : null;

        const fylte   = Math.round(pstTotalt / 5);
        const tomme   = 20 - fylte;
        const barFyll = '█'.repeat(fylte);
        const barTom  = '░'.repeat(tomme);

        const pstFarge = pstTotalt >= 80 ? '#2e7d32'
                       : pstTotalt >= 40 ? '#e65100'
                       : '#c62828';

        // Beregn info for alle sesjoner og del i aktive/fullførte
        const sesjonInfoList = plan.map((sone) => ({
            sone,
            rawIdx: rawPlan.indexOf(sone),
            info: this.beregnSoneTelleinfo(sone, items)
        }));
        const aktive    = sesjonInfoList.filter(({ info }) => !(info.totalt > 0 && info.teltI2026 >= info.totalt));
        const fullforte = sesjonInfoList.filter(({ info }) =>   info.totalt > 0 && info.teltI2026 >= info.totalt);

        return `
            <div style="background:#f5f9f5;border:1px solid #c8e6c9;border-radius:8px;
                        padding:16px 20px;margin-bottom:18px;
                        display:flex;align-items:center;justify-content:space-between;
                        flex-wrap:wrap;gap:12px;">

                <div>
                    <div style="font-size:12px;font-weight:600;color:#555;
                                text-transform:uppercase;letter-spacing:0.5px;margin-bottom:4px;">
                        📊 Varetelling 2026 — Borregaard lager 3018
                    </div>
                    <div style="display:flex;align-items:baseline;gap:10px;flex-wrap:wrap;">
                        <span style="font-size:22px;font-weight:700;color:${pstFarge};">
                            ${pstTotalt}%
                        </span>
                        <span style="font-size:13px;color:#555;">
                            ${teltI2026Totalt.toLocaleString('nb-NO')} / ${totaltArtikler.toLocaleString('nb-NO')} artikler telt
                        </span>
                        ${sisteTeltTotalt ? `
                            <span style="font-size:12px;color:#888;">
                                · Sist: ${sisteTeltTotalt}
                            </span>
                        ` : ''}
                    </div>
                </div>

                <div style="display:flex;flex-direction:column;gap:4px;align-items:flex-end;">
                    <div style="font-family:monospace;font-size:15px;letter-spacing:1px;
                                color:${pstFarge};">
                        ${barFyll}<span style="color:#ccc;">${barTom}</span>
                    </div>
                    <div style="font-size:11px;color:#888;">
                        ${totaltArtikler - teltI2026Totalt} artikler gjenstår
                    </div>
                </div>

            </div>

            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;flex-wrap:wrap;gap:10px;">
                <div>
                    <p style="color:#555;font-size:13px;margin:0 0 4px 0;">
                        Definer soner for rullerende varetelling.
                        Klikk <strong>Tell nå</strong> for å starte lokasjonssøk for en sone.
                    </p>
                    <p style="font-size:11px;color:#888;margin:0;">
                        ℹ️ Tellingsomfang: Sellable (alle) + Planned Discontinued/Discontinued med saldo.
                        Telt-teller: Inventeringshistorikk.xlsx matchet mot Borregaard-katalogen.
                    </p>
                </div>
                <div style="display:flex;gap:8px;flex-wrap:wrap;">
                    <button onclick="VartellingMode.lastInnStandardplan()"
                            style="padding:7px 14px;background:#78909c;color:#fff;border:none;border-radius:4px;cursor:pointer;font-size:13px;">
                        📋 Last inn 2026-telleplan
                    </button>
                    <button onclick="VartellingMode.importerInventeringshistorikk()"
                            style="padding:7px 14px;background:#2e7d32;color:#fff;border:none;border-radius:4px;cursor:pointer;font-size:13px;"
                            title="Importer Inventeringshistorikk.xlsx fra Jeeves for automatisk utfylling av telleplan og avvikslogg">
                        📥 Importer Inventeringshistorikk
                    </button>
                    <input type="file" id="inv-hist-file-input" accept=".xlsx" style="display:none"
                           onchange="VartellingMode._onInventeringshistorikkSelected(this.files[0])">
                    <button onclick="VartellingMode.toggleAddSoneForm()"
                            style="padding:7px 16px;background:#1a6b2c;color:#fff;border:none;border-radius:4px;cursor:pointer;font-weight:600;font-size:13px;">
                        + Legg til sone
                    </button>
                    <button onclick="VartellingMode.triggerTelleplanUpload()"
                            style="padding:7px 14px;background:#5c6bc0;color:#fff;border:none;border-radius:4px;cursor:pointer;font-size:13px;">
                        📂 Last opp telleplan fra Excel
                    </button>
                    <input type="file" id="telleplan-file-input" accept=".xlsx"
                           style="display:none;"
                           onchange="VartellingMode.lastOppTelleplanFraExcel(event)">
                </div>
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
                    <div style="display:flex;flex-direction:column;gap:4px;">
                        <label style="font-size:11px;font-weight:600;color:#555;">Ukenr</label>
                        <input id="new-sone-uke" type="number" min="1" max="52" placeholder="f.eks. 11"
                               style="padding:6px 10px;border:1px solid #ccc;border-radius:4px;font-size:13px;min-width:70px;">
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
                <div class="alert alert-info">Ingen soner definert ennå. Klikk «+ Legg til sone» eller «📋 Last inn 2026-telleplan» for å starte.</div>
            ` : `
                <div class="table-wrapper">
                    <table class="data-table compact">
                        <thead>
                            <tr>
                                <th style="text-align:center;">Uke</th>
                                <th>Sone</th>
                                <th>Fra lok</th>
                                <th>Til lok</th>
                                <th style="text-align:right;">Artikler</th>
                                <th>Bevegelse</th>
                                <th style="text-align:right;">Telt 2026</th>
                                <th>Sist telt / Status</th>
                                <th>Handling</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${aktive.map(({ sone, rawIdx, info }) =>
                                this.renderSesjonRad(sone, rawIdx, info, items, currentWeek)
                            ).join('')}
                        </tbody>
                    </table>
                </div>
                ${fullforte.length > 0 ? `
                    <div style="margin-top:16px;">
                        <button
                            onclick="VartellingMode.toggleVisFullforte()"
                            style="
                                width:100%;
                                padding:10px 16px;
                                background:#f1f8f1;
                                border:1px solid #a5d6a7;
                                border-radius:6px;
                                cursor:pointer;
                                font-size:13px;
                                font-weight:600;
                                color:#2e7d32;
                                text-align:left;
                                display:flex;
                                justify-content:space-between;
                                align-items:center;
                            ">
                            <span>✅ Fullførte sesjoner (${fullforte.length})</span>
                            <span style="font-size:16px;">${this._visFullforte ? '▲' : '▼'}</span>
                        </button>
                        ${this._visFullforte ? `
                            <div style="margin-top:4px;border:1px solid #c8e6c9;border-radius:0 0 6px 6px;overflow:hidden;">
                                <table class="data-table compact" style="margin:0;opacity:0.75;">
                                    <thead>
                                        <tr>
                                            <th>UKE</th>
                                            <th>SONE</th>
                                            <th>FRA LOK</th>
                                            <th>TIL LOK</th>
                                            <th>ARTIKLER</th>
                                            <th>BEVEGELSE</th>
                                            <th>TELT 2026</th>
                                            <th>SIST TELT / STATUS</th>
                                            <th>HANDLING</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        ${fullforte.map(({ sone, rawIdx, info }) =>
                                            this.renderSesjonRad(sone, rawIdx, info, items, currentWeek)
                                        ).join('')}
                                    </tbody>
                                </table>
                            </div>
                        ` : ''}
                    </div>
                ` : ''}
            `}
        `;
    }

    static renderSesjonRad(sone, rawIdx, info, items, currentWeek) {
        const artCount = info.totalt;
        const status   = this.renderTelleStatus(sone, info);
        const isCurrWk = sone.uke != null && sone.uke === currentWeek;
        const isFuture = sone.uke != null && !sone.sist_telt && sone.uke > currentWeek;
        const ukeStyle = isCurrWk
            ? 'background:#1565c0;color:#fff;font-weight:700;border-radius:3px;padding:2px 6px;display:inline-block;'
            : '';
        const planlagtTekst = isFuture
            ? `<br><span style="color:#1565c0;font-size:11px;">📅 Planlagt uke ${sone.uke}</span>`
            : '';
        return `
            <tr>
                <td style="text-align:center;white-space:nowrap;">
                    ${sone.uke != null ? `<span style="${ukeStyle}">${sone.uke}</span>` : '—'}
                </td>
                <td style="font-weight:600;">${this.esc(sone.navn)}</td>
                <td style="font-family:monospace;font-size:12px;">${this.esc(sone.fra)}</td>
                <td style="font-family:monospace;font-size:12px;">${this.esc(sone.til)}</td>
                <td style="text-align:right;">${artCount}</td>
                <td style="white-space:nowrap;font-size:12px;">
                    <span style="color:#2e7d32;" title="Trygge">✅ ${info.trygge}</span>
                    <span style="color:#b45309;margin-left:4px;" title="Sjekk">⚠️ ${info.sjekk}</span>
                    <span style="color:#b91c1c;margin-left:4px;" title="Aktive">🔴 ${info.aktive}</span>
                </td>
                <td style="text-align:right;font-weight:600;color:${
                    info.teltI2026 === 0 ? '#c62828'
                    : info.teltI2026 < info.totalt ? '#e65100'
                    : '#2e7d32'
                };">
                    ${info.teltI2026} / ${info.totalt}
                </td>
                <td>${status}${planlagtTekst}</td>
                <td style="white-space:nowrap;">
                    <button onclick="VartellingMode.tellNa(${rawIdx})"
                            style="padding:4px 10px;background:#1a6b2c;color:#fff;border:none;border-radius:3px;cursor:pointer;font-size:12px;margin-right:4px;">
                        Tell nå
                    </button>
                    <button onclick="VartellingMode.visUtestaaende(${rawIdx})"
                            title="Vis artikler ikke telt i 2026"
                            style="padding:4px 8px;background:${this._utestaaendeIdx === rawIdx ? '#f9a825' : '#fff8e1'};color:#e65100;border:1px solid #f9a825;border-radius:3px;cursor:pointer;font-size:13px;font-weight:600;margin-right:4px;">
                        ⏳
                    </button>
                    <button onclick="VartellingMode.toggleEditRow(${rawIdx})"
                            style="padding:4px 8px;background:#1565c0;color:#fff;border:none;border-radius:3px;cursor:pointer;font-size:12px;margin-right:4px;"
                            title="Rediger sone">
                        ✏️
                    </button>
                    <button onclick="VartellingMode.slettSone(${rawIdx})"
                            style="padding:4px 8px;background:#e53935;color:#fff;border:none;border-radius:3px;cursor:pointer;font-size:12px;"
                            title="Slett sone">
                        ✕
                    </button>
                </td>
            </tr>
            ${this._utestaaendeIdx === rawIdx
                ? this.renderUtestaaendePanel(sone, items)
                : ''}
            <tr id="edit-row-${rawIdx}" style="display:none;background:#f0f4ff;">
                <td colspan="9" style="padding:10px 12px;">
                    <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:flex-end;">
                        <div style="display:flex;flex-direction:column;gap:3px;">
                            <label style="font-size:10px;font-weight:600;color:#555;">Sonenavn</label>
                            <input id="edit-navn-${rawIdx}" type="text" value="${this.esc(sone.navn)}"
                                   style="padding:5px 8px;border:1px solid #90a4ae;border-radius:3px;font-size:12px;min-width:150px;">
                        </div>
                        <div style="display:flex;flex-direction:column;gap:3px;">
                            <label style="font-size:10px;font-weight:600;color:#555;">Fra lok</label>
                            <input id="edit-fra-${rawIdx}" type="text" value="${this.esc(sone.fra)}"
                                   style="padding:5px 8px;border:1px solid #90a4ae;border-radius:3px;font-size:12px;min-width:100px;">
                        </div>
                        <div style="display:flex;flex-direction:column;gap:3px;">
                            <label style="font-size:10px;font-weight:600;color:#555;">Til lok</label>
                            <input id="edit-til-${rawIdx}" type="text" value="${this.esc(sone.til)}"
                                   style="padding:5px 8px;border:1px solid #90a4ae;border-radius:3px;font-size:12px;min-width:100px;">
                        </div>
                        <div style="display:flex;flex-direction:column;gap:3px;">
                            <label style="font-size:10px;font-weight:600;color:#555;">Uke</label>
                            <input id="edit-uke-${rawIdx}" type="number" min="1" max="52" value="${sone.uke != null ? sone.uke : ''}"
                                   style="padding:5px 8px;border:1px solid #90a4ae;border-radius:3px;font-size:12px;min-width:60px;">
                        </div>
                        <div style="display:flex;flex-direction:column;gap:4px;">
                            <label style="font-size:11px;font-weight:600;color:#555;">
                                Manuell sist telt-dato
                                <span style="font-weight:400;color:#888;">(overstyrer MV2 — la stå tom for automatisk)</span>
                            </label>
                            <input id="edit-sone-sist-telt-${rawIdx}" type="date"
                                   value="${sone.sist_telt || ''}"
                                   style="padding:6px 10px;border:1px solid #ccc;border-radius:4px;font-size:13px;">
                        </div>
                        <button onclick="VartellingMode.lagreEditSone(${rawIdx})"
                                style="padding:5px 12px;background:#1a6b2c;color:#fff;border:none;border-radius:3px;cursor:pointer;font-size:12px;">
                            Lagre
                        </button>
                        <button onclick="VartellingMode.nullstillManuelDato(${rawIdx})"
                                style="padding:5px 10px;background:#fff;color:#c62828;border:1px solid #c62828;border-radius:4px;cursor:pointer;font-size:12px;">
                            🗑 Nullstill manuell dato
                        </button>
                        <button onclick="VartellingMode.toggleEditRow(${rawIdx})"
                                style="padding:5px 10px;background:#aaa;color:#fff;border:none;border-radius:3px;cursor:pointer;font-size:12px;">
                            Avbryt
                        </button>
                    </div>
                </td>
            </tr>
        `;
    }

    static toggleVisFullforte() {
        this._visFullforte = !this._visFullforte;
        this.refreshAll();
    }

    static lastInnStandardplan() {
        const plan = this.getTelleplan();
        if (plan.length > 0) {
            if (!confirm('Dette vil erstatte eksisterende telleplan med 2026-standardplanen. Fortsett?')) return;
        }

        const standardplan = [
            { id: 1001, uke: 11, navn: "T-1 sonen (del 1) — T-1-1 til T-1-4",      fra: "T-1-1",     til: "T-1-4",      sist_telt: null, avvik: null },
            { id: 1002, uke: 12, navn: "T-1 sonen (del 2) — T-1-5 til T-1-8",      fra: "T-1-5",     til: "T-1-8",      sist_telt: null, avvik: null },
            { id: 1003, uke: 13, navn: "T-2 sonen (del 1) — T-2-1",                 fra: "T-2-1",     til: "T-2-1",      sist_telt: null, avvik: null },
            { id: 1004, uke: 14, navn: "T-2 sonen (del 2) — T-2-2",                 fra: "T-2-2",     til: "T-2-2",      sist_telt: null, avvik: null },
            { id: 1005, uke: 15, navn: "T-3 sonen — T-3-1 til T-3-4",               fra: "T-3-1",     til: "T-3-4",      sist_telt: null, avvik: null },
            { id: 1006, uke: 17, navn: "T-4 sonen — T-4-1 til T-4-4",               fra: "T-4-1",     til: "T-4-4",      sist_telt: null, avvik: null },
            { id: 1007, uke: 18, navn: "19-sonen (del 1) — 19-1 til 19-6",          fra: "19-1-A",    til: "19-6-C",     sist_telt: null, avvik: null },
            { id: 1008, uke: 19, navn: "19-sonen (del 2) — 19-7 til 19-12",         fra: "19-7-A",    til: "19-12-C",    sist_telt: null, avvik: null },
            { id: 1009, uke: 20, navn: "18-sonen — 18-1 til 18-12",                 fra: "18-1-A",    til: "18-12-C",    sist_telt: null, avvik: null },
            { id: 1010, uke: 21, navn: "23-sonen (del 1) — 23-1 til 23-3",          fra: "23-1-A",    til: "23-3-C",     sist_telt: null, avvik: null },
            { id: 1011, uke: 22, navn: "23-sonen (del 2) — 23-4 til 23-6",          fra: "23-4-A",    til: "23-6-C",     sist_telt: null, avvik: null },
            { id: 1012, uke: 23, navn: "22-sonen — 22-1 til 22-9",                  fra: "22-1-A",    til: "22-9-C",     sist_telt: null, avvik: null },
            { id: 1013, uke: 24, navn: "21-sonen — 21-1 til 21-6",                  fra: "21-1-A",    til: "21-6-B",     sist_telt: null, avvik: null },
            { id: 1014, uke: 25, navn: "20-sonen — 20-1 til 20-6",                  fra: "20-1-A",    til: "20-6-C",     sist_telt: null, avvik: null },
            { id: 1015, uke: 26, navn: "52-sonen — 52-1 til 52-2",                  fra: "52-1-A",    til: "52-2-C",     sist_telt: null, avvik: null },
            { id: 1016, uke: 27, navn: "51-sonen — 51-1 til 51-2",                  fra: "51-1-A",    til: "51-2-B",     sist_telt: null, avvik: null },
            { id: 1017, uke: 28, navn: "12-sonen (del 1) — 12-1 til 12-6",          fra: "12-1-A",    til: "12-6-C",     sist_telt: null, avvik: null },
            { id: 1018, uke: 29, navn: "12-sonen (del 2) — 12-7 til 12-12",         fra: "12-7-A",    til: "12-12-C",    sist_telt: null, avvik: null },
            { id: 1019, uke: 30, navn: "50-sonen — 50-1 til 50-2",                  fra: "50-1-A",    til: "50-2-C",     sist_telt: null, avvik: null },
            { id: 1020, uke: 31, navn: "54-, 55- og 56-sonen",                      fra: "54-1-A",    til: "56-11-C",    sist_telt: null, avvik: null },
            { id: 1021, uke: 32, navn: "53- og 59-sonen",                           fra: "53-1-A",    til: "59-12-C",    sist_telt: null, avvik: null },
            { id: 1022, uke: 33, navn: "62-sonen",                                  fra: "62-1-A",    til: "62-9-C",     sist_telt: null, avvik: null },
            { id: 1023, uke: 34, navn: "42-, 43- og 44-sonen",                      fra: "42-1-A",    til: "44-9-C",     sist_telt: null, avvik: null },
            { id: 1024, uke: 35, navn: "24-, 25- og 26-sonen",                      fra: "24-1-A",    til: "26-4-B",     sist_telt: null, avvik: null },
            { id: 1025, uke: 36, navn: "16- og 17-sonen",                           fra: "16-1-A",    til: "17-12-B",    sist_telt: null, avvik: null },
            { id: 1026, uke: 37, navn: "45-, 46- og 49-sonen",                      fra: "45-1-A",    til: "49-2-C",     sist_telt: null, avvik: null },
            { id: 1027, uke: 38, navn: "11-, 13- og 14-sonen",                      fra: "11-1-A",    til: "14-9-C",     sist_telt: null, avvik: null },
            { id: 1028, uke: 39, navn: "146-, 147-, 148- og 149-sonen",             fra: "146-1-A",   til: "149-1-C",    sist_telt: null, avvik: null },
            // OLJEBOD: med string-fallback sorterer subsoner leksikografisk:
            // OLJEBOD-12 < OLJEBOD-13 < ... < OLJEBOD-17 < OLJEBOD-7 (fordi '1' < '7')
            // → fra=OLJEBOD-12, til=OLJEBOD-7 dekker alle 7 subsoner korrekt
            { id: 1029, uke: 40, navn: "OLJEBOD — alle hyller",                     fra: "OLJEBOD-12", til: "OLJEBOD-7",  sist_telt: null, avvik: null },
            { id: 1030, uke: 41, navn: "BORSKUFF — alle skuffer",                   fra: "BORSKUFF",   til: "BORSKUFF",  sist_telt: null, avvik: null },
            // SLANGEREOL og P-sonen: 'P-5-4' < 'SLANGEREOL' (P < S) — uten TORGET
            { id: 1031, uke: 43, navn: "SLANGEREOL og P-sonen",                     fra: "P-5-4",      til: "SLANGEREOL", sist_telt: null, avvik: null },
            { id: 1033, uke: 43, navn: "TORGET",                                    fra: "TORGET",     til: "TORGET",    sist_telt: null, avvik: null },
            // LAGER1/LAGER2S1/NYARTBUT: 'LAGER1' < 'LAGER2S1' < 'NYARTBUT' (L < N < T)
            // til=NYARTBUT (ikke TRANSITT) fordi 'TORGET' < 'TRANSITT' og TORGET er egen sesjon
            { id: 1032, uke: 44, navn: "LAGER1 · LAGER2S1 · NYARTBUT",             fra: "LAGER1",     til: "NYARTBUT",  sist_telt: null, avvik: null },
            // TRANSITT: egen sesjon for å unngå at TORGET faller innenfor LAGER–TRANSITT
            { id: 1034, uke: 44, navn: "TRANSITT",                                  fra: "TRANSITT",   til: "TRANSITT",  sist_telt: null, avvik: null },
        ];

        this.saveTelleplan(standardplan);
        this.refreshAll();
    }

    /**
     * Beregn tellefremdrift for en sone basert på Sist_telt fra MV2.
     *
     * @param {object} sone  - Soneobjekt med fra, til, sist_telt (manuell overstyring)
     * @param {Array}  items - Alle items fra store.getAllItems()
     * @returns {object} { totalt, teltI2026, sisteTelledato, harManuell }
     */
    static beregnSoneTelleinfo(sone, items) {
        const sonArtikler = this.filterByLocationRange(items, sone.fra, sone.til);
        const totalt = sonArtikler.length;

        const teltI2026 = sonArtikler.filter(item => {
            const d = item.invDat ? String(item.invDat).replace(/\D/g, '') : '';
            return d.length === 8 && d >= '20260101';
        }).length;

        // Nyeste telledato blant artikler telt i 2026 (fra InvDat, format YYYYMMDD → DD.MM.YYYY)
        const datoer = sonArtikler
            .map(i => String(i.invDat || '').replace(/\D/g, ''))
            .filter(d => d.length === 8)
            .sort();
        const sisteTeltRaw = datoer.length > 0 ? datoer[datoer.length - 1] : null;
        const sisteTelledato = sisteTeltRaw
            ? `${sisteTeltRaw.slice(6)}.${sisteTeltRaw.slice(4, 6)}.${sisteTeltRaw.slice(0, 4)}`
            : null;

        // Manuell overstyring fra localStorage overstyrer MV2-verdien
        const harManuell = !!(sone.sist_telt);

        // Bevegelsesindikatorer per artikkel i sonen
        const bevegelse = this._store?.dashboardData?.bevegelse || {};
        const [cutoff3m, cutoff9m] = this._bevCutoffs();
        let trygge = 0, sjekk = 0, aktive = 0;
        sonArtikler.forEach(item => {
            const bev = (bevegelse[item.toolsArticleNumber] || {}).siste_bevegelse || null;
            if (!bev || bev < cutoff9m) trygge++;
            else if (bev < cutoff3m)    sjekk++;
            else                        aktive++;
        });

        return { totalt, teltI2026, sisteTelledato, harManuell, trygge, sjekk, aktive };
    }

    /**
     * Render status-celle for en sone i telleplantabellen.
     */
    static renderTelleStatus(sone, info) {
        const { totalt, teltI2026, sisteTelledato, harManuell } = info;

        // Manuell overstyring vises alltid øverst
        if (harManuell) {
            const erJeevesImport = !!sone.journal_nr;
            const ikon  = erJeevesImport ? '📥' : '✏️';
            const tekst = erJeevesImport ? 'Jeeves-import' : 'Manuelt satt';
            const farge = erJeevesImport ? '#2e7d32' : '#1565c0';
            const ekstra = erJeevesImport
                ? `<br><span style="font-size:11px;color:#888;">Journal ${this.esc(sone.journal_nr)}${sone.utfort_av ? ' · ' + this.esc(sone.utfort_av) : ''}</span>`
                : '';
            return `
                <span style="color:${farge};font-weight:600;">${ikon} ${tekst}</span><br>
                <span style="font-size:11px;color:#555;">${this.esc(sone.sist_telt)}</span>${ekstra}
            `;
        }

        if (totalt === 0) {
            return `<span style="color:#999;font-size:12px;">Ingen artikler</span>`;
        }

        const pst   = Math.round((teltI2026 / totalt) * 100);
        const alle  = teltI2026 >= totalt;
        const ingen = teltI2026 === 0;

        const farge   = alle ? '#2e7d32' : ingen ? '#c62828' : '#e65100';
        const bgFarge = alle ? '#e8f5e9' : ingen ? '#ffebee' : '#fff3e0';
        const ikon    = alle ? '✅' : ingen ? '🔴' : '🟡';
        const datoTekst = sisteTelledato
            ? `<br><span style="font-size:11px;color:#555;">Sist: ${sisteTelledato}</span>`
            : '';

        return `
            <span style="display:inline-block;background:${bgFarge};color:${farge};
                         font-weight:600;font-size:12px;padding:2px 7px;border-radius:10px;
                         white-space:nowrap;">
                ${ikon} ${teltI2026} / ${totalt}
                ${!alle && !ingen ? `<span style="font-weight:400;">(${pst}%)</span>` : ''}
            </span>
            ${datoTekst}
        `;
    }

    static visUtestaaende(idx) {
        this._utestaaendeIdx = (this._utestaaendeIdx === idx) ? null : idx;
        this.refreshAll();
    }

    /**
     * Render panel med artikler som ikke er telt i 2026 for en sone.
     */
    static renderUtestaaendePanel(sone, items) {
        const alleISone = this.filterByLocationRange(items, sone.fra, sone.til);

        // Artikler IKKE telt i 2026 (basert på InvDat fra MV2)
        const utestaaende = alleISone.filter(item => {
            const d = item.invDat ? String(item.invDat).replace(/\D/g, '') : '';
            return !(d.length === 8 && d >= '20260101');
        });

        if (utestaaende.length === 0) {
            return `
                <tr class="utestaaende-panel-row">
                    <td colspan="9" style="padding:0;">
                        <div style="background:#e8f5e9;border-left:4px solid #2e7d32;
                                    padding:12px 20px;font-size:13px;color:#2e7d32;font-weight:600;">
                            ✅ Alle artikler i denne sonen er telt i 2026!
                        </div>
                    </td>
                </tr>
            `;
        }

        // Sorter etter lokasjon
        const sortert = [...utestaaende].sort((a, b) => {
            const la = a.location || a.lagerplass || '';
            const lb = b.location || b.lagerplass || '';
            return this.compareLocations(this.parseLocation(la), this.parseLocation(lb));
        });

        const bevegelse        = this._store?.dashboardData?.bevegelse || {};
        const [cutoff3m, cutoff9m] = this._bevCutoffs();

        const rader = sortert.map(item => {
            const lok       = item.location || item.lagerplass || '—';
            const invDatRaw = String(item.invDat || '').replace(/\D/g, '');
            const invDatVist = invDatRaw.length === 8
                ? `${invDatRaw.slice(6)}.${invDatRaw.slice(4, 6)}.${invDatRaw.slice(0, 4)}`
                : '–– aldri telt ––';
            const erGammel  = invDatRaw.length === 8 && invDatRaw < '20260101';
            const datoFarge = erGammel ? '#e65100' : '#888';
            const ind       = this._bevInd(item.toolsArticleNumber || '', bevegelse, cutoff3m, cutoff9m);

            return `
                <tr style="background:#fffde7;">
                    <td style="text-align:center;font-size:13px;padding:5px 8px;"
                        title="${ind.label}${ind.bev ? ' — siste: ' + ind.bev : ''}">
                        ${ind.ikon}
                    </td>
                    <td style="font-family:monospace;font-size:12px;padding:5px 10px;">
                        ${this.esc(item.toolsArticleNumber || item.saNumber || '—')}
                    </td>
                    <td style="font-size:12px;padding:5px 10px;">
                        ${this.esc(item.description || '—')}
                    </td>
                    <td style="font-family:monospace;font-size:12px;padding:5px 10px;">
                        ${this.esc(lok)}
                    </td>
                    <td style="font-size:12px;color:${datoFarge};padding:5px 10px;">
                        ${this.esc(invDatVist)}
                    </td>
                </tr>
            `;
        }).join('');

        const eksporterOnclick = `VartellingMode.exportUtestaaende(${JSON.stringify(sone.navn)}, ${JSON.stringify(sone.fra)}, ${JSON.stringify(sone.til)})`;

        return `
            <tr class="utestaaende-panel-row">
                <td colspan="9" style="padding:0;">
                    <div style="background:#fffde7;border-left:4px solid #f9a825;padding:0;">

                        <div style="display:flex;justify-content:space-between;align-items:center;
                                    padding:10px 16px;border-bottom:1px solid #f0e0a0;">
                            <span style="font-size:13px;font-weight:600;color:#e65100;">
                                ⏳ ${utestaaende.length} artikler ikke telt i 2026
                            </span>
                            <div style="display:flex;gap:8px;">
                                <button onclick="${eksporterOnclick}"
                                        style="padding:5px 12px;background:#1a6b2c;color:#fff;border:none;
                                               border-radius:4px;cursor:pointer;font-size:12px;">
                                    📥 Eksporter Excel
                                </button>
                            </div>
                        </div>

                        <div style="max-height:320px;overflow-y:auto;">
                            <table style="width:100%;border-collapse:collapse;">
                                <thead>
                                    <tr style="background:#f5e6a0;font-size:11px;font-weight:600;color:#555;">
                                        <th style="padding:5px 8px;text-align:center;">Trygg</th>
                                        <th style="padding:5px 10px;text-align:left;">Art.nr</th>
                                        <th style="padding:5px 10px;text-align:left;">Beskrivelse</th>
                                        <th style="padding:5px 10px;text-align:left;">Lokasjon</th>
                                        <th style="padding:5px 10px;text-align:left;">Sist telt</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${rader}
                                </tbody>
                            </table>
                        </div>

                    </div>
                </td>
            </tr>
        `;
    }

    static exportUtestaaende(sonenavn, fra, til) {
        if (typeof XLSX === 'undefined') {
            alert('XLSX-biblioteket er ikke tilgjengelig.');
            return;
        }

        const items     = this._store ? this._store.getAllItems() : [];
        const alleISone = this.filterByLocationRange(items, fra, til);

        const utestaaende = alleISone
            .filter(item => {
                const d = item.invDat ? String(item.invDat).replace(/\D/g, '') : '';
                return !(d.length === 8 && d >= '20260101');
            })
            .sort((a, b) => {
                const la = a.location || a.lagerplass || '';
                const lb = b.location || b.lagerplass || '';
                return this.compareLocations(this.parseLocation(la), this.parseLocation(lb));
            });

        if (utestaaende.length === 0) {
            alert('Ingen utestående artikler å eksportere.');
            return;
        }

        const rows = utestaaende.map(item => {
            const d = String(item.invDat || '').replace(/\D/g, '');
            const invDatVist = d.length === 8
                ? `${d.slice(6)}.${d.slice(4, 6)}.${d.slice(0, 4)}`
                : '';
            return {
                'Art.nr':        item.toolsArticleNumber || '',
                'SA-nummer':     item.saNumber || '',
                'Beskrivelse':   item.description || '',
                'Lokasjon':      item.location || item.lagerplass || '',
                'Sist telt':     invDatVist,
                'Saldo':         item.stock ?? '',
                'Tellet antall': '',   // tom kolonne for papirbruk
                'Avvik':         ''    // tom kolonne for papirbruk
            };
        });

        const wb  = XLSX.utils.book_new();
        const ws  = XLSX.utils.json_to_sheet(rows);

        // ── Kolonnebredder ──
        ws['!cols'] = [
            { wch: 14 },  // Art.nr
            { wch: 14 },  // SA-nummer
            { wch: 42 },  // Beskrivelse
            { wch: 12 },  // Lokasjon
            { wch: 12 },  // Sist telt
            { wch: 11 },  // Saldo
            { wch: 16 },  // Tellet antall
            { wch: 12 },  // Avvik
        ];
        ws['!freeze']     = { xSplit: 0, ySplit: 1 };
        ws['!autofilter'] = { ref: `A1:H${rows.length + 1}` };

        XLSX.utils.book_append_sheet(wb, ws, 'Utestående');

        const dato    = new Date().toISOString().slice(0, 10);
        const filnavn = `utestaaende_${sonenavn.replace(/[^a-zA-Z0-9]/g, '_')}_${dato}.xlsx`;
        XLSX.writeFile(wb, filnavn);
    }

    static nullstillManuelDato(idx) {
        const plan = this.getTelleplan();
        if (plan[idx]) {
            plan[idx].sist_telt = null;
            this.saveTelleplan(plan);
            this.refreshAll();
        }
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
                <div style="display:flex;gap:8px;flex-wrap:wrap;">
                    <button onclick="VartellingMode.exportAvviksrapport2026()"
                            ${logg.length === 0 ? 'disabled' : ''}
                            style="padding:7px 14px;background:#1565c0;color:#fff;border:none;border-radius:4px;cursor:pointer;font-size:13px;">
                        📋 Avviksrapport 2026
                    </button>
                    <button onclick="VartellingMode.exportAvvikslogg()"
                            ${logg.length === 0 ? 'disabled' : ''}
                            style="padding:7px 14px;background:#1a6b2c;color:#fff;border:none;border-radius:4px;cursor:pointer;font-size:13px;">
                        Eksporter logg
                    </button>
                </div>
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
                                        <td>${entry.kilde === 'jeeves_import' ? '<span title="Jeeves-import">📥 </span>' : ''}${this.esc(entry.sone || '—')}${entry.journal_nr ? `<br><span style="font-size:10px;color:#888;">Journal ${this.esc(entry.journal_nr)}${entry.utfort_av ? ' · ' + this.esc(entry.utfort_av) : ''}</span>` : ''}</td>
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
        if (!loc) return { zone: 0, row: 0, section: '', raw: '' };
        const s     = loc.trim().toUpperCase();
        const parts = s.split('-');
        const zone  = parseInt(parts[0], 10);

        // Numerisk sone: "19-3-B", "12-1-A" osv.
        if (!isNaN(zone)) {
            return {
                zone,
                row:     parseInt(parts[1], 10) || 0,
                section: parts[2] || '',
                raw:     s
            };
        }

        // Navngitt sone: "BORSKUFF", "TORGET", "OLJEBOD-12", "LAGER1", "SLANGEREOL", "T-1-1"
        // zone=-1 signaliserer at raw string-sammenligning skal brukes
        return {
            zone:    -1,
            row:     parseInt(parts[1], 10) || 0,
            section: parts[2] || '',
            raw:     s
        };
    }

    static compareLocations(a, b) {
        // Begge er navngitte soner (zone === -1): bruk raw string-sammenligning
        if (a.zone === -1 && b.zone === -1) {
            return a.raw < b.raw ? -1 : a.raw > b.raw ? 1 : 0;
        }
        // En navngitt og en numerisk: hold dem separert (navngitte sorteres sist)
        if (a.zone === -1) return 1;
        if (b.zone === -1) return -1;
        // Begge numeriske: eksisterende logikk
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
                            <th title="Dato for siste registrerte salg fra Ordrer_Jeeves">Sist solgt</th>
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
                                    <td style="font-size:11px;color:${item.lastSaleDate ? '#555' : '#aaa'};">${(() => { try { const d = item.lastSaleDate; if (!d) return '–'; const dt = (d instanceof Date) ? d : new Date(d); if (isNaN(dt.getTime())) return '–'; return `${String(dt.getDate()).padStart(2,'0')}.${String(dt.getMonth()+1).padStart(2,'0')}.${dt.getFullYear()}`; } catch(e) { return '–'; } })()}</td>
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
    //  FANE: LAVVERDI-TELLELISTE
    // ════════════════════════════════════════════════════

    static _lavverdiSearch    = '';
    static _lavverdiSort      = 'lokasjon';
    static _lavverdiTryggOnly = false;

    // Beregn bevegelsesindikator for en artnr: returnerer { ikon, label, bev }
    static _bevInd(artnr, bevegelse, cutoff3m, cutoff9m) {
        const bev = (bevegelse[artnr] || {}).siste_bevegelse || null;
        if (!bev || bev < cutoff9m) return { ikon: '✅', label: 'Trygg', farge: '#2e7d32', bev };
        if (bev < cutoff3m)         return { ikon: '⚠️', label: 'Sjekk', farge: '#b45309', bev };
        return                              { ikon: '🔴', label: 'Aktiv', farge: '#b91c1c', bev };
    }

    // ISO-kuttpunkter — returnerer [cutoff3m, cutoff9m] som YYYY-MM-DD strenger
    static _bevCutoffs() {
        const d3 = new Date(); d3.setMonth(d3.getMonth() - 3);
        const d9 = new Date(); d9.setMonth(d9.getMonth() - 9);
        return [d3.toISOString().slice(0, 10), d9.toISOString().slice(0, 10)];
    }

    static renderLavverdi() {
        const store     = this._store;
        const liste     = (store && store.dashboardData && store.dashboardData.lavverdiListe) || [];
        const bevegelse = (store && store.dashboardData && store.dashboardData.bevegelse) || {};

        if (liste.length === 0) {
            return `
                <div style="padding:24px;background:#fff8e1;border:1px solid #ffe082;border-radius:8px;color:#856404;font-size:14px;">
                    ⚠️ <strong>Lavverdi_Telleliste_2026.xlsx</strong> ikke funnet i pipeline. Generer filen på nytt.
                </div>
            `;
        }

        const [cutoff3m, cutoff9m] = this._bevCutoffs();
        const søk       = this._lavverdiSearch.toLowerCase();
        const sort      = this._lavverdiSort;
        const tryggOnly = this._lavverdiTryggOnly;

        // Filtrer + beregn indikator
        let rows = liste
            .map(r => ({
                ...r,
                _bev: this._bevInd(r.tools_artnr || '', bevegelse, cutoff3m, cutoff9m),
            }))
            .filter(r => {
                if (tryggOnly && r._bev.label !== 'Trygg') return false;
                if (!søk) return true;
                return (r.beskrivelse || '').toLowerCase().includes(søk)
                    || (r.tools_artnr || '').toLowerCase().includes(søk)
                    || (r.sa_nummer   || '').toLowerCase().includes(søk)
                    || (r.lokasjon    || '').toLowerCase().includes(søk);
            });

        if (sort === 'verdi') {
            rows = rows.slice().sort((a, b) => (b.est_verdi || 0) - (a.est_verdi || 0));
        } else if (sort === 'beskrivelse') {
            rows = rows.slice().sort((a, b) => (a.beskrivelse || '').localeCompare(b.beskrivelse || '', 'nb-NO'));
        } else {
            rows = rows.slice().sort((a, b) => (a.lokasjon || '').localeCompare(b.lokasjon || '', 'nb-NO'));
        }

        const totalVerdi   = rows.reduce((s, r) => s + (r.est_verdi || 0), 0);
        const nTrygge      = liste.filter(r => this._bevInd(r.tools_artnr||'', bevegelse, cutoff3m, cutoff9m).label === 'Trygg').length;
        const nSjekk       = liste.filter(r => this._bevInd(r.tools_artnr||'', bevegelse, cutoff3m, cutoff9m).label === 'Sjekk').length;
        const nAktive      = liste.filter(r => this._bevInd(r.tools_artnr||'', bevegelse, cutoff3m, cutoff9m).label === 'Aktiv').length;
        const totalListeVerdi = liste.reduce((s, r) => s + (r.est_verdi || 0), 0);

        const sixMonthsAgo = new Date();
        sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

        const verdiFarge = (v) => {
            if (v < 100)  return '#2e7d32';
            if (v <= 300) return '#b45309';
            return '#b91c1c';
        };

        const fmtDato = (s) => {
            if (!s || s === 'None' || s === 'nan') return '–';
            return s;
        };

        const datoRød = (s) => {
            if (!s || s === 'None' || s === 'nan') return false;
            try { const d = new Date(s); return !isNaN(d.getTime()) && d < sixMonthsAgo; }
            catch (e) { return false; }
        };

        const fmtBevDato = (s) => {
            if (!s) return '<span style="color:#bbb;">–</span>';
            // YYYY-MM-DD → DD.MM.ÅÅÅÅ
            const p = s.split('-');
            return p.length === 3 ? `${p[2]}.${p[1]}.${p[0]}` : s;
        };

        return `
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;flex-wrap:wrap;gap:8px;">
                <div style="font-size:13px;color:#555;">
                    <strong>${liste.length.toLocaleString('nb-NO')}</strong> artikler &nbsp;·&nbsp;
                    Est. total: <strong>${Math.round(totalListeVerdi).toLocaleString('nb-NO')} kr</strong>
                    &nbsp;·&nbsp; ✅ <strong>${nTrygge}</strong> trygge
                    &nbsp;·&nbsp; ⚠️ <strong>${nSjekk}</strong> sjekk
                    &nbsp;·&nbsp; 🔴 <strong>${nAktive}</strong> aktive
                </div>
                <button onclick="VartellingMode.exportLavverdi()"
                        style="padding:6px 14px;background:#1a6b2c;color:#fff;border:none;border-radius:4px;cursor:pointer;font-size:13px;">
                    Eksporter til Excel
                </button>
            </div>

            <div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:10px;align-items:center;">
                <input type="text"
                       id="lavverdi-søk"
                       placeholder="Søk beskrivelse, Tools nr, SA-nr, lokasjon..."
                       value="${this.esc(this._lavverdiSearch)}"
                       oninput="VartellingMode.lavverdiSøk(this.value)"
                       style="flex:1;min-width:220px;padding:6px 10px;border:1px solid #ccc;border-radius:4px;font-size:13px;">
                <select onchange="VartellingMode.lavverdiSort(this.value)"
                        style="padding:6px 10px;border:1px solid #ccc;border-radius:4px;font-size:13px;">
                    <option value="lokasjon"    ${sort==='lokasjon'?'selected':''}>Sorter: Lokasjon</option>
                    <option value="verdi"       ${sort==='verdi'?'selected':''}>Sorter: Est. verdi (høyest)</option>
                    <option value="beskrivelse" ${sort==='beskrivelse'?'selected':''}>Sorter: Beskrivelse A–Å</option>
                </select>
                <label style="display:flex;align-items:center;gap:5px;font-size:13px;cursor:pointer;">
                    <input type="checkbox"
                           ${tryggOnly ? 'checked' : ''}
                           onchange="VartellingMode.lavverdiTryggOnly(this.checked)">
                    Vis kun ✅ trygge
                </label>
                <span style="font-size:12px;color:#888;">${rows.length.toLocaleString('nb-NO')} treff</span>
            </div>

            <div style="overflow-x:auto;">
                <table class="data-table compact" style="width:100%;">
                    <thead>
                        <tr>
                            <th title="Bevegelsesindikator">Trygg</th>
                            <th>Lokasjon</th>
                            <th>Tools nr</th>
                            <th>SA-nummer</th>
                            <th>Beskrivelse</th>
                            <th style="text-align:right;">Saldo</th>
                            <th style="text-align:right;">Kalkylpris</th>
                            <th style="text-align:right;">Est. verdi</th>
                            <th>Sist telt</th>
                            <th>Siste salg</th>
                            <th>Siste innlev.</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${rows.length === 0 ? `<tr><td colspan="11" style="text-align:center;color:#999;padding:20px;">Ingen treff</td></tr>` :
                        rows.map(r => {
                            const verdi = r.est_verdi || 0;
                            const fc    = verdiFarge(verdi);
                            const dato  = fmtDato(r.sist_telt);
                            const rød   = datoRød(r.sist_telt);
                            const ind   = r._bev;
                            const bevObj = bevegelse[r.tools_artnr || ''] || {};
                            return `
                                <tr>
                                    <td style="text-align:center;white-space:nowrap;font-size:13px;"
                                        title="${ind.label}${ind.bev ? ' — siste: ' + ind.bev : ''}">
                                        ${ind.ikon}
                                    </td>
                                    <td style="font-weight:700;white-space:nowrap;">${this.esc(r.lokasjon||'–')}</td>
                                    <td style="font-size:11px;white-space:nowrap;">
                                        <a href="#" onclick="VartellingMode.åpneArtikkelOppslag('${this.esc(r.tools_artnr||'')}');return false;"
                                           style="color:#1a6b2c;text-decoration:underline;">${this.esc(r.tools_artnr||'–')}</a>
                                    </td>
                                    <td style="font-size:11px;white-space:nowrap;">${this.esc(r.sa_nummer||'–')}</td>
                                    <td style="font-size:11px;" title="${this.esc(r.beskrivelse||'')}">${this.esc(this.trunc(r.beskrivelse||'', 50))}</td>
                                    <td style="text-align:right;">${(r.saldo||0).toLocaleString('nb-NO')}</td>
                                    <td style="text-align:right;">${(r.kalkylpris||0).toLocaleString('nb-NO', {minimumFractionDigits:2, maximumFractionDigits:2})}</td>
                                    <td style="text-align:right;font-weight:700;color:${fc};">${Math.round(verdi).toLocaleString('nb-NO')} kr</td>
                                    <td style="font-size:11px;color:${rød?'#b91c1c':'inherit'};font-weight:${rød?'700':'400'};">${this.esc(dato)}</td>
                                    <td style="font-size:11px;color:#555;">${fmtBevDato(bevObj.siste_salg || null)}</td>
                                    <td style="font-size:11px;color:#555;">${fmtBevDato(bevObj.siste_inlev || null)}</td>
                                </tr>
                            `;
                        }).join('')}
                    </tbody>
                </table>
            </div>
            <div style="margin-top:6px;font-size:12px;color:#888;">
                Viser ${rows.length} av ${liste.length} artikler &nbsp;·&nbsp;
                Filtrert totalverdi: ${Math.round(totalVerdi).toLocaleString('nb-NO')} kr
            </div>
        `;
    }

    static lavverdiSøk(val) {
        this._lavverdiSearch = val;
        this.refreshAll();
    }

    static lavverdiSort(val) {
        this._lavverdiSort = val;
        this.refreshAll();
    }

    static lavverdiTryggOnly(val) {
        this._lavverdiTryggOnly = !!val;
        this.refreshAll();
    }

    static åpneArtikkelOppslag(toolsNr) {
        if (!toolsNr) return;
        if (window.ArtikelOppslagMode && window.ArtikelOppslagMode.openModal) {
            window.ArtikelOppslagMode.openModal(toolsNr);
        } else if (window.app) {
            window.app.switchModule('artikkelOppslag');
        }
    }

    static exportLavverdi() {
        const store     = this._store;
        const alle      = (store && store.dashboardData && store.dashboardData.lavverdiListe) || [];
        const bevegelse = (store && store.dashboardData && store.dashboardData.bevegelse) || {};
        const søk       = this._lavverdiSearch.toLowerCase();
        const [cutoff3m, cutoff9m] = this._bevCutoffs();

        let rows = alle
            .map(r => ({ ...r, _bev: this._bevInd(r.tools_artnr||'', bevegelse, cutoff3m, cutoff9m) }))
            .filter(r => {
                if (this._lavverdiTryggOnly && r._bev.label !== 'Trygg') return false;
                if (!søk) return true;
                return (r.beskrivelse || '').toLowerCase().includes(søk)
                    || (r.tools_artnr || '').toLowerCase().includes(søk)
                    || (r.sa_nummer   || '').toLowerCase().includes(søk)
                    || (r.lokasjon    || '').toLowerCase().includes(søk);
            });

        if (this._lavverdiSort === 'verdi') {
            rows = rows.slice().sort((a, b) => (b.est_verdi || 0) - (a.est_verdi || 0));
        } else if (this._lavverdiSort === 'beskrivelse') {
            rows = rows.slice().sort((a, b) => (a.beskrivelse || '').localeCompare(b.beskrivelse || '', 'nb-NO'));
        } else {
            rows = rows.slice().sort((a, b) => (a.lokasjon || '').localeCompare(b.lokasjon || '', 'nb-NO'));
        }

        const headers = ['Trygg', 'Lokasjon', 'Tools nr', 'SA-nummer', 'Beskrivelse', 'Saldo', 'Kalkylpris', 'Est. verdi (kr)', 'Sist telt', 'Siste salg', 'Siste innlev.'];
        const data = rows.map(r => {
            const bevObj = bevegelse[r.tools_artnr || ''] || {};
            return [
                r._bev.label,
                r.lokasjon    || '',
                r.tools_artnr || '',
                r.sa_nummer   || '',
                r.beskrivelse || '',
                r.saldo       || 0,
                r.kalkylpris  || 0,
                r.est_verdi   || 0,
                r.sist_telt   || '',
                bevObj.siste_salg  || '',
                bevObj.siste_inlev || '',
            ];
        });

        try {
            const wb = XLSX.utils.book_new();
            const wsData = [headers, ...data];
            const ws = XLSX.utils.aoa_to_sheet(wsData);
            XLSX.utils.book_append_sheet(wb, ws, 'Lavverdi');
            XLSX.writeFile(wb, `Lavverdi_Telleliste_eksport_${new Date().toISOString().slice(0,10)}.xlsx`);
        } catch (e) {
            alert('Eksport feilet: ' + e.message);
        }
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

    static triggerTelleplanUpload() {
        document.getElementById('telleplan-file-input')?.click();
    }

    static lastOppTelleplanFraExcel(event) {
        const file = event.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const data = new Uint8Array(e.target.result);
                const wb   = XLSX.read(data, { type: 'array' });

                // Finn riktig ark — prøv "Telleplan 2026" først, fall tilbake til første ark
                const sheetName = wb.SheetNames.includes('Telleplan 2026')
                    ? 'Telleplan 2026'
                    : wb.SheetNames[0];
                const ws = wb.Sheets[sheetName];

                // Les fra rad 4 (header er rad 3, 0-indeksert = rad index 2)
                // SheetJS: bruk sheet_to_json med header:1 for å få arrays per rad
                const allRows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });

                // Finn header-rad (den som inneholder "UKE" i kolonne A)
                let dataStartRow = 3; // default: rad 4 (0-indeksert: 3)
                for (let i = 0; i < Math.min(allRows.length, 10); i++) {
                    const val = String(allRows[i][0] || '').trim().toUpperCase();
                    if (val === 'UKE') { dataStartRow = i + 1; break; }
                }

                const SKIP_KEYWORDS = ['VEDLIKEHOLDSSTOPP', 'BUFFER', 'ÅRSAVSLUTNING'];

                const nyPlan = [];
                for (let i = dataStartRow; i < allRows.length; i++) {
                    const row  = allRows[i];
                    const ukeRaw  = row[0];
                    const navn    = String(row[1] || '').trim();
                    const fra     = String(row[2] || '').trim();
                    const til     = String(row[3] || '').trim();

                    // Hopp over tomme/buffer/stopp-rader
                    if (!navn) continue;
                    if (SKIP_KEYWORDS.some(kw => navn.toUpperCase().includes(kw))) continue;
                    if (!fra || fra === '—' || fra === '-') continue;

                    const uke = ukeRaw !== '' && !isNaN(Number(ukeRaw))
                        ? parseInt(ukeRaw)
                        : null;

                    nyPlan.push({
                        id:        Date.now() + i,
                        uke:       uke,
                        navn:      navn,
                        fra:       fra,
                        til:       til || fra,
                        sist_telt: null,
                        avvik:     null
                    });
                }

                if (nyPlan.length === 0) {
                    alert('Fant ingen gyldige soner i filen. Sjekk at filen har riktig format.');
                    return;
                }

                const eksisterende = this.getTelleplan();
                let bekreft = true;
                if (eksisterende.length > 0) {
                    bekreft = confirm(
                        `Dette vil erstatte eksisterende telleplan (${eksisterende.length} soner) ` +
                        `med ${nyPlan.length} soner fra "${file.name}".\n\nFortsett?`
                    );
                }

                if (bekreft) {
                    this.saveTelleplan(nyPlan);
                    this.refreshAll();
                    // Vis bekreftelse i konsoll
                    console.log(`[Telleplan] Lastet inn ${nyPlan.length} soner fra ${file.name}`);
                }

            } catch (err) {
                console.error('[Telleplan] Feil ved parsing av Excel:', err);
                alert(`Kunne ikke lese filen: ${err.message}`);
            }

            // Reset file input slik at samme fil kan lastes inn igjen
            event.target.value = '';
        };
        reader.readAsArrayBuffer(file);
    }

    static toggleAddSoneForm() {
        const form = document.getElementById('add-sone-form');
        if (form) form.style.display = form.style.display === 'none' ? 'block' : 'none';
    }

    static saveSone() {
        const navn   = (document.getElementById('new-sone-navn').value || '').trim();
        const fra    = (document.getElementById('new-sone-fra').value  || '').trim();
        const til    = (document.getElementById('new-sone-til').value  || '').trim();
        const ukeEl  = document.getElementById('new-sone-uke');
        const uke    = ukeEl && ukeEl.value ? parseInt(ukeEl.value) || null : null;

        if (!navn || !fra || !til) {
            alert('Alle feltene (Sonenavn, Fra lokasjon, Til lokasjon) må fylles ut.');
            return;
        }

        const plan = this.getTelleplan();
        plan.push({ id: Date.now(), uke, navn, fra, til, sist_telt: null, avvik: null });
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

    static toggleEditRow(idx) {
        const row = document.getElementById(`edit-row-${idx}`);
        if (row) row.style.display = row.style.display === 'none' ? 'table-row' : 'none';
    }

    static lagreEditSone(idx) {
        const navn = (document.getElementById(`edit-navn-${idx}`)?.value || '').trim();
        const fra  = (document.getElementById(`edit-fra-${idx}`)?.value  || '').trim();
        const til  = (document.getElementById(`edit-til-${idx}`)?.value  || '').trim();
        const ukeEl = document.getElementById(`edit-uke-${idx}`);
        const uke  = ukeEl && ukeEl.value ? parseInt(ukeEl.value) || null : null;
        const sistTeltEl = document.getElementById(`edit-sone-sist-telt-${idx}`);
        const sist_telt = sistTeltEl && sistTeltEl.value ? sistTeltEl.value : null;
        if (!navn || !fra || !til) {
            alert('Sonenavn, Fra og Til lokasjon må fylles ut.');
            return;
        }
        this.oppdaterSone(idx, { navn, fra, til, uke, sist_telt });
    }

    static oppdaterSone(idx, data) {
        const plan = this.getTelleplan();
        if (!plan[idx]) return;
        plan[idx] = { ...plan[idx], ...data };
        this.saveTelleplan(plan);
        this.refreshAll();
    }

    static getISOWeek(date) {
        const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
        const dayNum = d.getUTCDay() || 7;
        d.setUTCDate(d.getUTCDate() + 4 - dayNum);
        const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
        return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
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
                    <td style="font-size:11px;" title="${this.esc(r.beskrivelse || '')}">${this.esc(this.trunc(r.beskrivelse || '', 60))}</td>
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
                <div style="background:#fff;border-radius:8px;padding:24px;max-width:1100px;width:96vw;max-height:88vh;overflow-y:auto;box-shadow:0 8px 32px rgba(0,0,0,0.25);">
                    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
                        <h3 style="margin:0;font-size:15px;">
                            Telledetaljer — ${this.esc(entry.dato)}${entry.sone ? ` — ${this.esc(entry.sone)}` : ''}
                        </h3>
                        <div style="display:flex;align-items:center;gap:10px;">
                            <button onclick="VartellingMode.exportDetaljer(${idx})"
                                    style="padding:6px 14px;background:#1a6b2c;color:#fff;
                                           border:none;border-radius:4px;cursor:pointer;
                                           font-size:12px;font-weight:600;">
                                ⬇ Eksporter Excel
                            </button>
                            <button onclick="document.getElementById('detaljer-modal-overlay').remove()"
                                    style="border:none;background:none;cursor:pointer;font-size:22px;color:#777;line-height:1;">×</button>
                        </div>
                    </div>
                    <div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:16px;">
                        ${entry.kilde === 'jeeves_import' ? `
                        <div style="padding:7px 12px;background:#e8f5e9;border-radius:4px;font-size:12px;border:1px solid #c8e6c9;">
                            📥 <strong>Jeeves-import</strong>
                            ${entry.journal_nr ? ` · Journal ${this.esc(entry.journal_nr)}` : ''}
                            ${entry.utfort_av  ? ` · ${this.esc(entry.utfort_av)}` : ''}
                        </div>
                        ` : ''}
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

    static exportDetaljer(idx) {
        const logg  = this.getAvvikslogg();
        const entry = logg[idx];
        if (!entry || typeof XLSX === 'undefined') return;

        const wb = XLSX.utils.book_new();

        // Ark 1: Sammendrag
        const sammendrag = [
            ['Felt', 'Verdi'],
            ['Dato',             entry.dato || ''],
            ['Sone',             entry.sone || ''],
            ['Fra lokasjon',     entry.fra_lok || ''],
            ['Til lokasjon',     entry.til_lok || ''],
            ['Journal nr',       entry.journal_nr || ''],
            ['Utført av',        entry.utfort_av || ''],
            ['Artikler telt',    entry.antall_artikler || 0],
            ['Antall avvik',     entry.antall_avvik || 0],
            ['Verdi avvik (kr)', Math.round(entry.avviksverdi_nok || 0)],
            ['Kilde',            entry.kilde || ''],
        ];
        const ws1 = XLSX.utils.aoa_to_sheet(sammendrag);
        ws1['!cols'] = [{ wch: 20 }, { wch: 30 }];
        XLSX.utils.book_append_sheet(wb, ws1, 'Sammendrag');

        // Ark 2: Avviksdetaljer (alle rader med avvik)
        const headers = [
            'Lokasjon', 'Tools nr', 'SA-nummer', 'Beskrivelse',
            'System antall', 'Telt antall', 'Avvik', 'Avviksverdi (kr)', 'Kalkylpris'
        ];
        const raderData = (entry.rader || []).map(r => [
            r.lokasjon    || '',
            r.tools_nr    || '',
            r.sa_nummer   || '',
            r.beskrivelse || '',
            r.system_antall != null ? r.system_antall : '',
            r.tellet_antall != null ? r.tellet_antall : '',
            r.avvik       != null   ? r.avvik         : '',
            r.avvik       != null   ? Math.round(r.avviksverdi || 0) : '',
            r.kalkylpris  != null   ? r.kalkylpris    : '',
        ]);
        const ws2 = XLSX.utils.aoa_to_sheet([headers, ...raderData]);
        ws2['!cols'] = [
            { wch: 12 }, { wch: 14 }, { wch: 14 }, { wch: 40 },
            { wch: 12 }, { wch: 12 }, { wch: 8  }, { wch: 16 }, { wch: 12 }
        ];
        XLSX.utils.book_append_sheet(wb, ws2, 'Avviksdetaljer');

        const sonenavn = (entry.sone || 'telling')
            .replace(/[^a-zA-Z0-9æøåÆØÅ\-_ ]/g, '')
            .replace(/\s+/g, '_')
            .slice(0, 40);
        const filnavn = `telledetaljer_${sonenavn}_${entry.dato || 'ukjent'}.xlsx`;
        XLSX.writeFile(wb, filnavn);
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
            'Avviksverdi (kr)': Math.round(entry.avviksverdi_nok || 0),
            'Journal nr':       entry.journal_nr || '',
            'Utført av':        entry.utfort_av || '',
            'Kilde':            entry.kilde || 'manuell'
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

    static exportAvviksrapport2026() {
        const logg = this.getAvvikslogg();
        if (typeof XLSX === 'undefined') {
            alert('XLSX-biblioteket er ikke tilgjengelig.');
            return;
        }

        // Filtrer kun tellinger fra 2026
        const logg2026 = logg.filter(entry =>
            entry.dato && entry.dato >= '2026-01-01'
        );

        if (logg2026.length === 0) {
            alert('Ingen tellinger fra 2026 funnet i avviksloggen.');
            return;
        }

        // Flatten til artikkel-nivå — kun rader med avvik
        // Hvis samme artikkel finnes i flere sesjoner: behold nyeste dato
        const artikkelMap = new Map();

        for (const entry of logg2026) {
            for (const r of (entry.rader || [])) {
                if (!r.avvik || r.avvik === 0) continue;

                const key = (r.tools_nr || r.sa_nummer || '').toLowerCase().trim();
                if (!key) continue;

                const eksisterende = artikkelMap.get(key);

                if (!eksisterende || entry.dato > eksisterende._dato) {
                    artikkelMap.set(key, {
                        _dato:       entry.dato,
                        _sone:       entry.sone || '',
                        _journal:    entry.journal_nr || '',
                        lokasjon:    r.lokasjon       || '',
                        tools_nr:    r.tools_nr        || '',
                        sa_nummer:   r.sa_nummer       || '',
                        beskrivelse: r.beskrivelse     || '',
                        system:      r.system_antall   != null ? r.system_antall  : '',
                        telt:        r.tellet_antall   != null ? r.tellet_antall  : '',
                        avvik:       r.avvik           != null ? r.avvik          : '',
                        avviksverdi: r.avvik           != null
                                       ? Math.round(r.avviksverdi || 0)
                                       : '',
                        kalkylpris:  r.kalkylpris      != null ? r.kalkylpris     : '',
                    });
                }
            }
        }

        if (artikkelMap.size === 0) {
            alert('Ingen avvik funnet i 2026-tellinger.');
            return;
        }

        // Sorter: negativt avvik (system > telt) øverst — disse er mest kritiske
        const rader = [...artikkelMap.values()].sort((a, b) => {
            const av = typeof a.avvik === 'number' ? a.avvik : 0;
            const bv = typeof b.avvik === 'number' ? b.avvik : 0;
            if (av < 0 && bv >= 0) return -1;
            if (bv < 0 && av >= 0) return 1;
            return Math.abs(bv) - Math.abs(av);
        });

        const wb = XLSX.utils.book_new();

        // Ark 1: Avviksliste
        const headers = [
            'Dato telt', 'Sone', 'Journal nr',
            'Lokasjon', 'Tools nr', 'SA-nummer', 'Beskrivelse',
            'System antall', 'Telt antall', 'Avvik (stk)',
            'Avviksverdi (kr)', 'Kalkylpris'
        ];
        const dataRader = rader.map(r => [
            r._dato, r._sone, r._journal,
            r.lokasjon, r.tools_nr, r.sa_nummer, r.beskrivelse,
            r.system, r.telt, r.avvik,
            r.avviksverdi, r.kalkylpris
        ]);
        const ws = XLSX.utils.aoa_to_sheet([headers, ...dataRader]);
        ws['!cols'] = [
            { wch: 12 }, { wch: 28 }, { wch: 12 },
            { wch: 12 }, { wch: 14 }, { wch: 14 }, { wch: 42 },
            { wch: 12 }, { wch: 12 }, { wch: 12 },
            { wch: 16 }, { wch: 12 },
        ];
        ws['!freeze'] = { xSplit: 0, ySplit: 1 };
        XLSX.utils.book_append_sheet(wb, ws, 'Avvik 2026');

        // Ark 2: Sammendrag
        const totalAvvikVerdi = rader.reduce((sum, r) =>
            sum + (typeof r.avviksverdi === 'number' ? r.avviksverdi : 0), 0
        );
        const negativAvvik = rader.filter(r => typeof r.avvik === 'number' && r.avvik < 0);
        const positivAvvik = rader.filter(r => typeof r.avvik === 'number' && r.avvik > 0);

        const sammendrag = [
            ['Avviksrapport 2026 — Borregaard Lager 3018', ''],
            ['Generert', new Date().toLocaleDateString('nb-NO')],
            ['', ''],
            ['Tellinger inkludert (2026)', logg2026.length],
            ['Unike artikler med avvik',   artikkelMap.size],
            ['', ''],
            ['Negativt avvik (system > telt)', negativAvvik.length],
            ['  Mulig uregistrert uttak fra lager', ''],
            ['Positivt avvik (telt > system)', positivAvvik.length],
            ['  Mulig feilregistrering eller retur', ''],
            ['', ''],
            ['Total avviksverdi (kr)', totalAvvikVerdi],
        ];
        const ws2 = XLSX.utils.aoa_to_sheet(sammendrag);
        ws2['!cols'] = [{ wch: 42 }, { wch: 20 }];
        XLSX.utils.book_append_sheet(wb, ws2, 'Sammendrag');

        const dato = new Date().toISOString().split('T')[0];
        XLSX.writeFile(wb, `Avviksrapport_2026_${dato}.xlsx`);
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
            return (a.toolsArticleNumber || '').localeCompare(
                b.toolsArticleNumber || '', 'nb-NO'
            );
        });

        // Bygg data som array-of-arrays for full kontroll over formatering
        const headers = [
            'Lokasjon', 'Tools nr', 'Beskrivelse',
            'SA-nummer', 'Beholdning', 'Innkommende',
            'Status', 'Sist solgt', 'Tellet antall'
        ];

        const dataRows = sorted.map(item => {
            // Formater sist-solgt dato
            let sistSolgt = '';
            if (item.lastSaleDate) {
                const d = String(item.lastSaleDate).replace(/\D/g, '');
                if (d.length === 8) {
                    sistSolgt = `${d.slice(6)}.${d.slice(4,6)}.${d.slice(0,4)}`;
                } else {
                    sistSolgt = item.lastSaleDate;
                }
            }

            return [
                item.location     || item.lagerplass || '',
                item.toolsArticleNumber || '',
                item.description  || '',
                item.saNumber     || '',
                item.stock        ?? 0,
                item.bestAntLev   || 0,
                item._status      || '',
                sistSolgt,
                ''   // Tom kolonne for håndskriving på lageret
            ];
        });

        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.aoa_to_sheet([headers, ...dataRows]);

        // ── Kolonnebredder ──
        ws['!cols'] = [
            { wch: 12 },  // Lokasjon
            { wch: 14 },  // Tools nr
            { wch: 42 },  // Beskrivelse
            { wch: 14 },  // SA-nummer
            { wch: 11 },  // Beholdning
            { wch: 12 },  // Innkommende
            { wch: 12 },  // Status
            { wch: 12 },  // Sist solgt
            { wch: 16 },  // Tellet antall
        ];

        // ── Frys header-rad ──
        ws['!freeze'] = { xSplit: 0, ySplit: 1 };

        // ── Autofilter på alle kolonner ──
        const lastCol = XLSX.utils.encode_col(headers.length - 1);
        ws['!autofilter'] = { ref: `A1:${lastCol}${dataRows.length + 1}` };

        // ── Legg til sammendragsark ──
        const infoData = [
            ['Telleliste', `${from} — ${to}`],
            ['Dato eksportert', fileDate],
            ['Antall artikler', sorted.length],
            ['Estimert verdi (kr)', Math.round(
                sorted.reduce((s, i) => s + (i.estimertVerdi || 0), 0)
            )],
        ];
        const wsInfo = XLSX.utils.aoa_to_sheet(infoData);
        wsInfo['!cols'] = [{ wch: 20 }, { wch: 30 }];

        // Ark 1: Telleliste, Ark 2: Info
        const sheetName = `${from}–${to}`.slice(0, 31);
        XLSX.utils.book_append_sheet(wb, ws, sheetName);
        XLSX.utils.book_append_sheet(wb, wsInfo, 'Info');

        XLSX.writeFile(wb, `telleliste_${from}_${to}_${fileDate}.xlsx`);
    }

    /**
     * Eksporter telleliste med forhåndsutfylt «Tellet antall» basert på avvik-logikk.
     * Bulk-artikler (bolt/mutter/skive/splint): 20–50 stk avvik.
     * Vanlige artikler: 10–15% avvik.
     * Brukes når man vil komme raskt over telleprosenten uten å fysisk telle alt.
     */
    static exportExcelMedAvvik() {
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

        // Formater sist solgt-dato
        const fmtDato = (item) => {
            if (!item.outgoingOrders || item.outgoingOrders.length === 0) return '';
            const siste = item.outgoingOrders
                .map(o => o.deliveryDate instanceof Date ? o.deliveryDate
                        : o.deliveryDate ? new Date(o.deliveryDate) : null)
                .filter(d => d && !isNaN(d.getTime()))
                .sort((a, b) => b - a)[0];
            if (!siste) return '';
            return siste.toISOString().slice(0, 10);
        };

        const rows = sorted.map(item => {
            const saldo  = item.stock || 0;
            const beskr  = item.description || '';
            const artnr  = item.toolsArticleNumber || '';
            const tellet = this._beregnTelletAntall(saldo, beskr, artnr);
            return {
                'Lokasjon':      item.location || item.lagerplass || '',
                'Tools nr':      artnr,
                'Beskrivelse':   beskr,
                'SA-nummer':     item.saNumber || '',
                'Beholdning':    saldo,
                'Sist levert':   fmtDato(item),
                'Tellet antall': tellet,
            };
        });

        const ws = XLSX.utils.json_to_sheet(rows);

        ws['!cols'] = [
            { wch: 13 }, // Lokasjon
            { wch: 15 }, // Tools nr
            { wch: 43 }, // Beskrivelse
            { wch: 15 }, // SA-nummer
            { wch: 12 }, // Beholdning
            { wch: 13 }, // Sist levert
            { wch: 16 }, // Tellet antall
        ];

        ws['!views'] = [{
            state: 'frozen', ySplit: 1, xSplit: 0,
            topLeftCell: 'A2', activePane: 'bottomLeft'
        }];

        // Info-ark
        const wb = XLSX.utils.book_new();
        const sheetName = `${from}–${to}`.slice(0, 31);
        XLSX.utils.book_append_sheet(wb, ws, sheetName);

        const infoData = [
            { 'Felt': 'Telleliste',      'Verdi': `${from} — ${to}` },
            { 'Felt': 'Dato eksportert', 'Verdi': fileDate },
            { 'Felt': 'Antall artikler', 'Verdi': rows.length },
            { 'Felt': 'Tellet antall',   'Verdi': 'Forhåndsutfylt med avvik — bulk (bolt/mutter/skive/splint): 20–50 stk, andre: 10–15%' },
            { 'Felt': 'Merknad',         'Verdi': 'Overskriv «Tellet antall» der du faktisk teller noe annet' },
        ];
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(infoData), 'Info');

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

    // ════════════════════════════════════════════════════
    //  JEEVES INVENTERINGSHISTORIKK IMPORT
    // ════════════════════════════════════════════════════

    static importerInventeringshistorikk() {
        const input = document.getElementById('inv-hist-file-input');
        if (input) {
            input.value = '';
            input.click();
        }
    }

    static _onInventeringshistorikkSelected(file) {
        if (!file) return;
        this.parseInventeringshistorikk(file)
            .then(journals => {
                if (!journals || journals.length === 0) {
                    alert('Ingen journaler funnet i filen. Sjekk at du har valgt riktig Inventeringshistorikk.xlsx.');
                    return;
                }
                this._processImportedJournals(journals);
            })
            .catch(err => {
                alert('Feil ved lesing av fil: ' + err.message);
                console.error('Inventeringshistorikk parse error:', err);
            });
    }

    /**
     * Parser Inventeringshistorikk.xlsx fra Jeeves.
     * Kolonner (0-indeksert):
     *   0: InvJl, 2: Artikelnr, 3: InvAnt, 4: Lagersaldo,
     *   5: Sign, 6: CreDt (YYMMDD), 14: Artikelbeskrivning,
     *   23: Inv diff belopp (NOK), 24: Physical count diff, 27: Kalkylpris bas
     */
    static async parseInventeringshistorikk(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = e => {
                try {
                    if (typeof XLSX === 'undefined') {
                        throw new Error('XLSX-biblioteket er ikke tilgjengelig.');
                    }
                    const wb      = XLSX.read(e.target.result, { type: 'binary' });
                    const ws      = wb.Sheets[wb.SheetNames[0]];
                    const allRows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });

                    if (allRows.length < 2) { resolve([]); return; }

                    const parseNum = (val) => {
                        if (val === null || val === undefined || val === '') return 0;
                        const n = parseFloat(String(val).replace(',', '.'));
                        return isNaN(n) ? 0 : n;
                    };

                    // Grupper rader per journalnummer (kolonne 0)
                    const journalMap = new Map();
                    for (let i = 1; i < allRows.length; i++) {
                        const row   = allRows[i];
                        const invJl = String(row[0] || '').trim();
                        if (!invJl) continue;
                        if (!journalMap.has(invJl)) journalMap.set(invJl, []);
                        journalMap.get(invJl).push({
                            artikelnr:   String(row[2]  || '').toLowerCase().trim(),
                            beskrivelse: String(row[14] || '').trim(),
                            invAnt:      parseNum(row[3]),
                            lagersaldo:  parseNum(row[4]),
                            physDiff:    parseNum(row[24]),
                            // "Inv diff belopp" finnes i to kolonner (idx 7 og idx 23).
                            // Hvilken som er utfylt varierer mellom journaler.
                            // Bruk den med høyest absoluttverdi — den er alltid korrekt.
                            diffBelopp: (() => { const v7 = parseNum(row[7]), v23 = parseNum(row[23]); return Math.abs(v7) >= Math.abs(v23) ? v7 : v23; })(),
                            kalkylpris:  parseNum(row[27]),
                            _sign:       String(row[5] || '').trim(),
                            _creDt:      String(row[6] || '').trim()
                        });
                    }

                    const journals = [];
                    journalMap.forEach((rader, journalNr) => {
                        const first = rader[0];
                        const sign  = first._sign || '';
                        const creDt = first._creDt || '';
                        // YYMMDD → YYYY-MM-DD
                        const dato  = creDt.length === 6
                            ? `20${creDt.slice(0, 2)}-${creDt.slice(2, 4)}-${creDt.slice(4, 6)}`
                            : creDt;

                        const cleanRader = rader
                            .map(r => ({
                                artikelnr:   r.artikelnr,
                                beskrivelse: r.beskrivelse,
                                invAnt:      r.invAnt,
                                lagersaldo:  r.lagersaldo,
                                physDiff:    r.physDiff,
                                diffBelopp:  r.diffBelopp,
                                kalkylpris:  r.kalkylpris
                            }))
                            .filter(r => r.artikelnr);

                        journals.push({ journalNr, dato, sign, rader: cleanRader });
                    });

                    resolve(journals);
                } catch (err) {
                    reject(err);
                }
            };
            reader.onerror = () => reject(new Error('Kunne ikke lese filen.'));
            reader.readAsBinaryString(file);
        });
    }

    /**
     * Test om en lokasjon ligger innenfor et fra–til-intervall,
     * konsistent med filterByLocationRange sin parseLocation-logikk.
     */
    static _lokInRange(lok, fra, til) {
        if (!lok) return false;
        return this.filterByLocationRange([{ location: lok }], fra, til).length > 0;
    }

    /**
     * Match journalrader mot telleplan-sesjoner.
     * Returnerer { sesjonIdx, treff, totalt } for sesjonen med flest artikkeltreff,
     * eller null hvis ingen sesjon dekker journalen.
     */
    static _matchJournalToSession(journalRows, sessions, toolsToLok) {
        const sessionHits = new Array(sessions.length).fill(0);

        journalRows.forEach(row => {
            const lok = toolsToLok.get(row.artikelnr);
            if (!lok) return;
            sessions.forEach((sesjon, idx) => {
                if (this._lokInRange(lok, sesjon.fra, sesjon.til)) {
                    sessionHits[idx]++;
                }
            });
        });

        const maxHits = Math.max(...sessionHits);
        if (maxHits === 0) return null;

        const bestIdx = sessionHits.indexOf(maxHits);
        return { sesjonIdx: bestIdx, treff: maxHits, totalt: journalRows.length };
    }

    /**
     * Prosesser importerte journaler:
     *  1. Duplikat-sjekk per journal
     *  2. Match journal → tellesone
     *  3. Oppdater telleplan-sesjon
     *  4. Legg til avvikslogg-entry
     */
    static _processImportedJournals(journals) {
        const store = this._store;
        if (!store) {
            alert('Datastore ikke lastet. Last inn data først.');
            return;
        }

        // Bygg oppslagskart: artikelnr (lowercase) → lokasjon
        const toolsToLok = new Map();
        store.getAllItems().forEach(item => {
            if (item.toolsArticleNumber && item.location) {
                toolsToLok.set(
                    String(item.toolsArticleNumber).toLowerCase().trim(),
                    item.location
                );
            }
        });

        const plan = this.getTelleplan();
        const logg = this.getAvvikslogg();

        // Finn alle duplikater på forhånd
        const eksisterendeJournaler = new Set(
            logg
                .filter(e => e.journal_nr)
                .map(e => String(e.journal_nr))
        );
        const duplikater = journals.filter(j =>  eksisterendeJournaler.has(String(j.journalNr)));
        const nye        = journals.filter(j => !eksisterendeJournaler.has(String(j.journalNr)));

        let skalOverskrive = false;
        if (duplikater.length > 0) {
            const liste = duplikater.map(j => j.journalNr).join(', ');
            skalOverskrive = confirm(
                `${duplikater.length} journal${duplikater.length > 1 ? 'er' : ''} er allerede importert:\n${liste}\n\nOverskrive alle?`
            );
        }

        const skalImporteres = skalOverskrive ? journals : nye;

        let importert  = 0;
        let hoppetOver = duplikater.length > 0 && !skalOverskrive ? duplikater.length : 0;

        for (const journal of skalImporteres) {
            // Fjern eksisterende logg-entry hvis vi overskriver
            const eksIdx = logg.findIndex(e => String(e.journal_nr) === String(journal.journalNr));
            if (eksIdx !== -1) logg.splice(eksIdx, 1);

            // Match journal til sesjon
            const match     = this._matchJournalToSession(journal.rader, plan, toolsToLok);
            const sesjonIdx = match ? match.sesjonIdx : null;
            const sesjon    = sesjonIdx !== null ? plan[sesjonIdx] : null;

            // Sjekk om sesjon allerede er manuelt merket
            if (sesjon && sesjon.sist_telt && !sesjon.journal_nr) {
                const svar = confirm(
                    `Sesjon uke ${sesjon.uke} (${sesjon.navn}) er allerede merket som telt manuelt (${sesjon.sist_telt}).\n\nOverskrive med Jeeves-import fra journal ${journal.journalNr}?`
                );
                if (!svar) { hoppetOver++; continue; }
            }

            // Oppdater telleplan-sesjon
            if (sesjon !== null && sesjonIdx !== null) {
                // Kun oppdater sist_telt/journal_nr/utfort_av hvis ny dato er nyere
                const nyDato        = journal.dato; // format 'YYYY-MM-DD'
                const gjeldendeDato = plan[sesjonIdx].sist_telt || '';
                if (nyDato > gjeldendeDato) {
                    plan[sesjonIdx].sist_telt  = journal.dato;
                    plan[sesjonIdx].utfort_av  = journal.sign;
                    plan[sesjonIdx].journal_nr = journal.journalNr;
                }
                // Aggregerte verdier oppdateres alltid
                plan[sesjonIdx].antall_artikler_telt = journal.rader.length;
                plan[sesjonIdx].antall_avvik         = journal.rader.filter(r => r.physDiff !== 0).length;
                plan[sesjonIdx].avviksverdi_nok      = journal.rader.reduce((sum, r) => sum + (r.diffBelopp || 0), 0);
            }

            // Bygg avvikslogg-entry
            const avvikRader       = journal.rader.filter(r => r.physDiff !== 0);
            const totalAvviksverdi = journal.rader.reduce((sum, r) => sum + (r.diffBelopp || 0), 0);

            const mapRad = r => {
                const item = store.getByToolsArticleNumber(r.artikelnr);
                return {
                    lokasjon:      item?.location || toolsToLok.get(r.artikelnr) || null,
                    tools_nr:      r.artikelnr,
                    sa_nummer:     item?.saNumber || null,
                    beskrivelse:   r.beskrivelse,
                    system_antall: r.lagersaldo,
                    tellet_antall: r.invAnt,
                    avvik:         r.physDiff,
                    avviksverdi:   r.diffBelopp,
                    kalkylpris:    r.kalkylpris
                };
            };

            const entry = {
                dato:            journal.dato,
                sone:            sesjon ? sesjon.navn : 'Øvrig telling (utenfor telleplan)',
                fra_lok:         sesjon ? sesjon.fra  : null,
                til_lok:         sesjon ? sesjon.til  : null,
                journal_nr:      journal.journalNr,
                utfort_av:       journal.sign,
                antall_artikler: journal.rader.length,
                antall_avvik:    avvikRader.length,
                avviksverdi_nok: totalAvviksverdi,
                kilde:           'jeeves_import',
                sesjon_treff:    match ? { treff: match.treff, totalt: match.totalt } : null,
                rader:           avvikRader.map(mapRad),
                alle_rader:      journal.rader.map(mapRad)
            };

            logg.push(entry);
            importert++;
        }

        this.saveTelleplan(plan);
        this.saveAvvikslogg(logg);

        const msg = hoppetOver > 0
            ? `Importert ${importert} journal(er). ${hoppetOver} hoppet over.`
            : `Importert ${importert} journal(er) fra Jeeves.`;
        alert(msg);

        this._activeTab = 'avvikslogg';
        this.refreshAll();
    }
}

// Eksporter til global scope
window.VartellingMode = VartellingMode;
