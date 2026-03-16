// ===================================
// MODUS: ARTIKKEL OPPSLAG – Global søkemotor
// Søk på Tools nr, SA-nummer, lokasjon, leverandør, beskrivelse
// ===================================

class ArtikkelOppslagMode {
    static _store        = null;
    static _fuse         = null;
    static _allItems     = null;
    static _searchTerm   = '';
    static _activeFilters = new Set(); // tomt Set = vis alle; AND-kombinert
    static _lastResults  = [];
    static _searchMode   = 'exact'; // 'exact' | 'fuzzy'
    static _selectedItems = new Set(); // Set av toolsArticleNumber
    static _showLageroversikt = false;
    static _lageroversiktItems = [];

    // ════════════════════════════════════════════════════
    //  MAIN RENDER
    // ════════════════════════════════════════════════════

    static render(store) {
        this._store = store;
        this._initFuse(store);

        // Sjekk om vi ble navigert hit fra sammendragskortet «Mangler lokasjon»
        const pendingFilter = sessionStorage.getItem('filter_artikkelOppslag');
        if (pendingFilter) {
            sessionStorage.removeItem('filter_artikkelOppslag');
            const mapped = (pendingFilter === 'mangler-lokasjon') ? 'uten-lokasjon' : pendingFilter;
            this._activeFilters.clear();
            this._activeFilters.add(mapped);
        }

        if (this._searchTerm.length >= 2) {
            this._runSearch();
        } else if (this._activeFilters.size > 0) {
            this._runFilterOnly();
        } else {
            this._lastResults = [];
        }

        return this._buildHTML();
    }

    /** Vis alle artikler som matcher aktive filtre, uten søketerm. */
    static _runFilterOnly() {
        if (!this._allItems) { this._lastResults = []; return; }
        const filtered = this._applyFilters(this._allItems);
        filtered.sort((a, b) => {
            const locCmp = this._cmpLocation(a.location || '', b.location || '');
            if (locCmp !== 0) return locCmp;
            return (a.toolsArticleNumber || '').localeCompare(b.toolsArticleNumber || '', 'nb-NO');
        });
        this._lastResults = filtered;
    }

    static _initFuse(store) {
        const allItems = store.getAllItems();

        // Recreate Fuse when store changes or not yet initialised
        if (this._allItems === allItems && this._fuse) return;

        this._allItems = allItems;

        if (typeof Fuse === 'undefined') {
            console.warn('[ArtikkelOppslag] Fuse.js ikke lastet – faller tilbake til enkel søk');
            this._fuse = null;
            return;
        }

        this._fuse = new Fuse(allItems, {
            keys: [
                'toolsArticleNumber',
                'saNumber',
                'location',
                'supplierId',
                'supplier',
                'supplierArticleNumber',
                'description'
            ],
            threshold: 0.3,
            ignoreLocation: true,
            minMatchCharLength: 2
        });
    }

    // ════════════════════════════════════════════════════
    //  BUILD HTML
    // ════════════════════════════════════════════════════

    static _buildHTML() {
        const term = this._searchTerm;
        const active = this._activeFilters;
        const all = this._allItems || [];

        // Pre-count per filter across all items (not search results)
        const counts = {
            'med-lager':     all.filter(i => (i.stock || 0) > 0).length,
            'uten-lager':    all.filter(i => (i.stock || 0) === 0).length,
            'aktiv':         all.filter(i => {
                                 const vs = (i.vareStatus || '').toLowerCase();
                                 return !vs.includes('discontinued') && !vs.includes('utgå');
                             }).length,
            'utgaende':      all.filter(i => {
                                 const s = (i._status || i.status || '').toUpperCase();
                                 const vs = (i.vareStatus || '').toLowerCase();
                                 return s.includes('UTGÅ') || s.includes('DISCONTINUED') ||
                                        vs.includes('discontinued') || vs.includes('planned discontinued');
                             }).length,
            'uten-lokasjon': all.filter(i => !i.location || i.location.trim() === '').length,
        };

        const FILTER_DEFS = [
            { id: 'med-lager',     label: 'Med beholdning',  color: '#2e7d32' },
            { id: 'uten-lager',    label: 'Uten beholdning', color: '#e65100' },
            { id: 'aktiv',         label: 'Kun aktive',      color: '#1565c0' },
            { id: 'utgaende',      label: 'Utgående',        color: '#c62828' },
            { id: 'uten-lokasjon', label: 'Uten lokasjon',   color: '#6a1b9a' },
        ];

        const filterHTML = FILTER_DEFS.map(f => {
            const isActive = active.has(f.id);
            const cnt = all.length > 0 ? ` (${counts[f.id].toLocaleString('nb-NO')})` : '';
            return `<button
                onclick="ArtikkelOppslagMode.toggleFilter('${f.id}')"
                style="font-size:12px;padding:4px 12px;border-radius:4px;cursor:pointer;
                       border:2px solid ${f.color};font-weight:600;white-space:nowrap;
                       background:${isActive ? f.color : '#fff'};
                       color:${isActive ? '#fff' : f.color};"
            >${this.esc(f.label)}${cnt}</button>`;
        }).join('');

        const clearLink = active.size > 0
            ? `<button onclick="ArtikkelOppslagMode.clearFilters()"
                       style="font-size:12px;color:#666;background:none;border:none;
                              cursor:pointer;text-decoration:underline;padding:2px 4px;">
                   Nullstill filter
               </button>`
            : '';

        const exportBtn = `<button onclick="ArtikkelOppslagMode.exportExcel()"
                style="font-size:12px;padding:4px 12px;border-radius:4px;cursor:pointer;
                       border:2px solid #374151;background:#374151;color:#fff;
                       font-weight:600;white-space:nowrap;margin-left:auto;">
            ⬇ Excel
        </button>`;

        return `
            <div class="module-header">
                <h2>Artikkel Oppslag</h2>
                <p class="module-description">
                    Søk etter Tools nr, SA-nummer, lokasjon, leverandørartikkel eller beskrivelse.
                </p>
            </div>

            <div class="module-controls" style="flex-direction:column;gap:12px;align-items:stretch;">
                ${this._selectedItems.size > 0 ? `
                <div id="artikkelKurvIndicator" style="display:flex;align-items:center;gap:10px;
                            padding:6px 12px;background:#e0f2fe;border-radius:6px;
                            margin-bottom:8px;font-size:13px;">
                    <span style="color:#0369a1;font-weight:600;">
                        🛒 ${this._selectedItems.size} artikler i kurven
                    </span>
                    <button onclick="ArtikkelOppslagMode.nullstillValg()"
                            style="font-size:11px;padding:2px 8px;border-radius:4px;
                                   background:#fff;border:1px solid #7dd3fc;color:#0369a1;
                                   cursor:pointer;">
                        Tøm kurv
                    </button>
                </div>` : `<div id="artikkelKurvIndicator" style="display:none;"></div>`}
                <div style="display:flex;align-items:center;">
                    <div style="position:relative;flex:1;">
                        <span style="position:absolute;left:12px;top:50%;transform:translateY(-50%);
                                     font-size:18px;pointer-events:none;line-height:1;">🔎</span>
                        <input
                            type="text"
                            id="artikkelOppslagSearch"
                            placeholder="Søk etter artikkel..."
                            value="${this.esc(term)}"
                            oninput="ArtikkelOppslagMode.onInput(this.value)"
                            autocomplete="off"
                            style="width:100%;box-sizing:border-box;padding:12px 16px 12px 44px;
                                   font-size:16px;border:2px solid #cbd5e1;border-radius:8px;
                                   outline:none;transition:border-color 0.2s;"
                            onfocus="this.style.borderColor='#3498db'"
                            onblur="this.style.borderColor='#cbd5e1'"
                        />
                    </div>
                    <button onclick="ArtikkelOppslagMode.toggleFuzzy()"
                            title="Bytt mellom eksakt og fuzzy søk"
                            style="padding:6px 12px;border-radius:4px;cursor:pointer;font-size:12px;
                                   font-weight:600;white-space:nowrap;margin-left:6px;
                                   border:2px solid ${this._searchMode === 'fuzzy' ? '#6b7280' : '#d1d5db'};
                                   background:${this._searchMode === 'fuzzy' ? '#6b7280' : '#fff'};
                                   color:${this._searchMode === 'fuzzy' ? '#fff' : '#6b7280'};">
                        ≈ Fuzzy
                    </button>
                </div>
                <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;">
                    <span style="font-size:12px;color:#666;font-weight:600;">Filter:</span>
                    ${filterHTML}
                    ${clearLink}
                    ${exportBtn}
                </div>
            </div>

            <div style="display:flex;align-items:center;gap:12px;padding:8px 0;flex-wrap:wrap;">
                <span id="artikkelValgCount" style="font-size:13px;color:#555;min-width:80px;">
                    ${this._selectedItems.size > 0 ? this._selectedItems.size + ' valgt' : ''}
                </span>
                <button id="artikkelGenererBtn"
                        onclick="ArtikkelOppslagMode.genererLageroversikt()"
                        ${this._selectedItems.size === 0 ? 'disabled' : ''}
                        style="background:#1a237e;color:#fff;border:none;padding:7px 16px;
                               border-radius:4px;cursor:pointer;font-size:13px;font-weight:600;
                               opacity:${this._selectedItems.size === 0 ? '0.5' : '1'};">
                    Generer lageroversikt (${this._selectedItems.size} valgt)
                </button>
                ${this._selectedItems.size > 0 ? `
                    <button onclick="ArtikkelOppslagMode.nullstillValg()"
                            style="background:#fff;border:1px solid #ccc;padding:6px 12px;
                                   border-radius:4px;cursor:pointer;font-size:12px;color:#555;">
                        Nullstill valg
                    </button>` : ''}
            </div>

            <div id="artikkelOppslagResults">
                ${this._buildResultsHTML()}
            </div>

            ${this._showLageroversikt && this._lageroversiktItems && this._lageroversiktItems.length > 0 ? `
            <div style="margin-top:24px;border-top:2px solid #e5e7eb;padding-top:16px;">
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
                    <h3 style="margin:0;font-size:15px;font-weight:700;">
                        Lageroversikt — ${this._lageroversiktItems.length} artikler
                    </h3>
                    <div style="display:flex;gap:8px;">
                        <button onclick="ArtikkelOppslagMode.kopierLageroversikt()"
                                style="background:#fff;border:1px solid #ccc;padding:6px 14px;
                                       border-radius:4px;cursor:pointer;font-size:13px;">
                            Kopier til utklippstavle
                        </button>
                        <button onclick="ArtikkelOppslagMode.lukkLageroversikt()"
                                style="background:#fff;border:1px solid #ccc;padding:6px 14px;
                                       border-radius:4px;cursor:pointer;font-size:13px;color:#dc2626;">
                            ✕ Lukk
                        </button>
                    </div>
                </div>
                <table style="width:100%;border-collapse:collapse;font-size:13px;">
                    <thead>
                        <tr style="background:#1a237e;color:#fff;">
                            <th style="padding:8px 12px;text-align:left;">ART.NR</th>
                            <th style="padding:8px 12px;text-align:left;">BESKRIVELSE</th>
                            <th style="padding:8px 12px;text-align:right;">SALDO</th>
                            <th style="padding:8px 12px;text-align:right;">I BESTILLING</th>
                            <th style="padding:8px 12px;text-align:left;">LAGERPLASS</th>
                            <th style="padding:8px 12px;text-align:left;">SA</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${[...this._lageroversiktItems]
                            .sort((a, b) => (b.stock || 0) - (a.stock || 0))
                            .map((item, i) => {
                                const bg = i % 2 === 0 ? '#f0f4ff' : '#fff';
                                const saldoFarge = (item.stock || 0) > 0 ? '#16a34a' : '#dc2626';
                                return `<tr style="background:${bg};">
                                    <td style="padding:6px 12px;font-family:monospace;">${item.toolsArticleNumber || ''}</td>
                                    <td style="padding:6px 12px;">${item.description || ''}</td>
                                    <td style="padding:6px 12px;text-align:right;font-weight:700;color:${saldoFarge};">${item.stock ?? 0}</td>
                                    <td style="padding:6px 12px;text-align:right;">${item.bestAntLev || 0}</td>
                                    <td style="padding:6px 12px;">${item.location || '–'}</td>
                                    <td style="padding:6px 12px;font-family:monospace;">${item.saNumber || ''}</td>
                                </tr>`;
                            }).join('')}
                    </tbody>
                </table>
            </div>` : ''}
        `;
    }

    static _buildResultsHTML() {
        const term    = this._searchTerm;
        const results = this._lastResults;

        if (term.length < 2 && this._activeFilters.size === 0) {
            return `<div class="alert alert-info" style="margin-top:16px;">Skriv minst 2 tegn for å søke.</div>`;
        }
        if (results.length === 0) {
            return `<div class="alert alert-info" style="margin-top:16px;">Ingen artikler funnet.</div>`;
        }
        return this._renderTable(results);
    }

    // ════════════════════════════════════════════════════
    //  SEARCH ENGINE
    // ════════════════════════════════════════════════════

    static _runSearch() {
        if (!this._allItems) { this._lastResults = []; return; }
        const term = this._searchTerm.toLowerCase().trim();
        if (!term) { this._lastResults = []; return; }

        if (this._searchMode === 'fuzzy' && this._fuse) {
            // Fuzzy-modus: bruk Fuse.js
            const fuseResults = this._fuse.search(term);
            let results = fuseResults.map(r => r.item);
            results = this._applyFilters(results);
            results.sort((a, b) => {
                const locCmp = this._cmpLocation(a.location || '', b.location || '');
                if (locCmp !== 0) return locCmp;
                return (a.toolsArticleNumber || '').localeCompare(b.toolsArticleNumber || '', 'nb-NO');
            });
            this._lastResults = results;
            return;
        }

        // Standard eksakt inneholder-søk (som Lageroppslag)
        // Søker i: toolsArticleNumber, saNumber, description, location, supplier, supplierArticleNumber
        const filtered = this._allItems.filter(item => {
            return (
                (item.toolsArticleNumber || '').toLowerCase().includes(term) ||
                (item.saNumber || '').toLowerCase().includes(term) ||
                (item.description || '').toLowerCase().includes(term) ||
                (item.location || '').toLowerCase().includes(term) ||
                (item.supplier || '').toLowerCase().includes(term) ||
                (item.supplierArticleNumber || '').toLowerCase().includes(term)
            );
        });

        const withFilters = this._applyFilters(filtered);
        withFilters.sort((a, b) => {
            const locCmp = this._cmpLocation(a.location || '', b.location || '');
            if (locCmp !== 0) return locCmp;
            return (a.toolsArticleNumber || '').localeCompare(b.toolsArticleNumber || '', 'nb-NO');
        });
        this._lastResults = withFilters;
        this._searchMode = 'exact';
    }

    static _applyFilters(items) {
        if (this._activeFilters.size === 0) return items;
        return items.filter(item => {
            for (const f of this._activeFilters) {
                if (!this._matchFilter(item, f)) return false;
            }
            return true;
        });
    }

    static _matchFilter(item, filterId) {
        switch (filterId) {
            case 'med-lager':
                return (item.stock || 0) > 0;
            case 'uten-lager':
                return (item.stock || 0) === 0;
            case 'aktiv': {
                const vs = (item.vareStatus || '').toLowerCase();
                return !vs.includes('discontinued') && !vs.includes('utgå');
            }
            case 'utgaende': {
                const s = (item._status || item.status || '').toUpperCase();
                const vs = (item.vareStatus || '').toLowerCase();
                return s.includes('UTGÅ') || s.includes('DISCONTINUED') ||
                       vs.includes('discontinued') || vs.includes('planned discontinued');
            }
            case 'uten-lokasjon':
                return !item.location || item.location.trim() === '';
            default:
                return true;
        }
    }

    static toggleFilter(filterId) {
        if (this._activeFilters.has(filterId)) {
            this._activeFilters.delete(filterId);
        } else {
            // Gjensidig utelukkende par
            if (filterId === 'med-lager')  this._activeFilters.delete('uten-lager');
            if (filterId === 'uten-lager') this._activeFilters.delete('med-lager');
            if (filterId === 'aktiv')      this._activeFilters.delete('utgaende');
            if (filterId === 'utgaende')   this._activeFilters.delete('aktiv');
            this._activeFilters.add(filterId);
        }

        if (this._searchTerm.length >= 2) {
            this._runSearch();
        } else if (this._activeFilters.size > 0) {
            this._runFilterOnly();
        } else {
            this._lastResults = [];
        }

        // Rebuild full HTML (oppdaterer knapper og resultater)
        const contentDiv = document.getElementById('moduleContent');
        if (!contentDiv || !this._store) return;
        contentDiv.innerHTML = this._buildHTML();

        const input = document.getElementById('artikkelOppslagSearch');
        if (input) {
            input.focus();
            const len = input.value.length;
            input.setSelectionRange(len, len);
        }
    }

    static clearFilters() {
        this._activeFilters.clear();
        if (this._searchTerm.length >= 2) {
            this._runSearch();
        } else {
            this._lastResults = [];
        }
        const contentDiv = document.getElementById('moduleContent');
        if (!contentDiv || !this._store) return;
        contentDiv.innerHTML = this._buildHTML();
        const input = document.getElementById('artikkelOppslagSearch');
        if (input) { input.focus(); }
    }

    // Natural sort for warehouse locations like "11-10-A", "2-3-B"
    static _cmpLocation(a, b) {
        if (!a && !b) return 0;
        if (!a) return 1;   // Empty location → sort last
        if (!b) return -1;

        const partsA = a.split(/[-\s\/]+/);
        const partsB = b.split(/[-\s\/]+/);
        const len = Math.max(partsA.length, partsB.length);

        for (let i = 0; i < len; i++) {
            const pA = partsA[i] || '';
            const pB = partsB[i] || '';
            const nA = parseInt(pA, 10);
            const nB = parseInt(pB, 10);

            if (!isNaN(nA) && !isNaN(nB)) {
                if (nA !== nB) return nA - nB;
            } else {
                const cmp = pA.localeCompare(pB, 'nb-NO');
                if (cmp !== 0) return cmp;
            }
        }
        return 0;
    }

    // ════════════════════════════════════════════════════
    //  TABLE RENDERING
    // ════════════════════════════════════════════════════

    static _renderTable(results) {
        const MAX = 50;
        // Only cap fuzzy results — exact and location searches show all matching rows
        const truncated = this._searchMode === 'fuzzy' && results.length > MAX;
        const shown     = truncated ? results.slice(0, MAX) : results;

        // Mode badge shown alongside the result count
        let modeBadge;
        if (this._searchMode === 'exact') {
            modeBadge = `<span style="font-size:11px;background:#d1fae5;color:#065f46;
                                      padding:2px 8px;border-radius:4px;font-weight:600;
                                      margin-left:8px;">✓ Eksakt treff</span>`;
        } else if (this._searchMode === 'location') {
            modeBadge = `<span style="font-size:11px;background:#dbeafe;color:#1e40af;
                                      padding:2px 8px;border-radius:4px;font-weight:600;
                                      margin-left:8px;">📍 Lokasjon</span>`;
        } else {
            modeBadge = `<span style="font-size:11px;background:#f3f4f6;color:#6b7280;
                                      padding:2px 8px;border-radius:4px;
                                      margin-left:8px;">≈ Fuzzy søk</span>`;
        }

        const truncMsg = truncated
            ? `<div class="alert alert-info" style="margin-top:8px;font-size:13px;">
                   Viser de ${MAX} beste treffene. ${results.length} totalt funnet.
               </div>`
            : '';

        const rows = shown.map((item, idx) => {
            const loc      = this.esc(item.location || '–');
            const toolsNr  = this.esc(item.toolsArticleNumber || '–');
            const saNr     = this.esc(item.saNumber || '–');
            const desc     = this.esc(this.trunc(item.description || '–', 45));
            const supplier = this.esc(this.trunc(item.supplier || '–', 30));
            const levArt   = this.esc(item.supplierArticleNumber || '–');
            const toolsNrRaw = this.esc(item.toolsArticleNumber || '');

            const erValgt = this._selectedItems.has(item.toolsArticleNumber);
            const radBg     = erValgt ? '#e8eaf6' : (idx % 2 === 0 ? '#ffffff' : '#f8fafc');
            const radBorder = erValgt ? 'border-left: 3px solid #1a237e;' : '';

            const stockVal = item.stock || 0;
            const stockCell = stockVal > 0
                ? `<span style="color:#16a34a;font-weight:700;">${stockVal.toLocaleString('nb-NO')}</span>`
                : `<span style="color:#dc2626;font-weight:700;">0</span>`;

            const incomingVal = item.bestAntLev || 0;
            const incomingCell = incomingVal > 0
                ? `<span style="color:#1565c0;">${incomingVal.toLocaleString('nb-NO')}</span>`
                : `<span style="color:#aaa;">–</span>`;

            return `
                <tr style="cursor:pointer;background:${radBg};${radBorder}"
                    onclick="ArtikkelOppslagMode.openCard(${idx})"
                    title="Klikk for detaljer">
                    <td style="padding:6px 8px;" onclick="event.stopPropagation()">
                        <input type="checkbox"
                               class="artikkel-checkbox"
                               value="${toolsNrRaw}"
                               ${this._selectedItems.has(item.toolsArticleNumber) ? 'checked' : ''}
                               onchange="ArtikkelOppslagMode.toggleSelectItem('${toolsNrRaw}', this.checked)">
                    </td>
                    <td style="font-weight:600;white-space:nowrap;font-size:11px;">${loc}</td>
                    <td style="font-size:11px;font-family:monospace;white-space:nowrap;">${toolsNr}</td>
                    <td style="font-size:11px;white-space:nowrap;">${saNr}</td>
                    <td style="font-size:12px;" title="${this.esc(item.description || '')}">${desc}</td>
                    <td style="font-size:11px;">${supplier}</td>
                    <td style="font-size:11px;font-family:monospace;">${levArt}</td>
                    <td style="text-align:right;">${stockCell}</td>
                    <td style="text-align:right;">${incomingCell}</td>
                    <td>${this._statusBadge(item)}</td>
                </tr>
            `;
        }).join('');

        return `
            <div class="table-wrapper" style="margin-top:12px;">
                <table class="data-table compact">
                    <thead>
                        <tr>
                            <th style="width:36px;padding:8px;">
                                <input type="checkbox" id="artikkelVelgAlle"
                                       onchange="ArtikkelOppslagMode.toggleSelectAll(this.checked)"
                                       title="Velg alle">
                            </th>
                            <th>Lokasjon</th>
                            <th>Tools nr</th>
                            <th>SA-nummer</th>
                            <th>Beskrivelse</th>
                            <th>Leverandør</th>
                            <th>Lev.art.nr</th>
                            <th style="text-align:right;">Lager</th>
                            <th style="text-align:right;">Innkommende</th>
                            <th>Status</th>
                        </tr>
                    </thead>
                    <tbody>${rows}</tbody>
                </table>
            </div>
            <div class="table-footer">
                <p class="text-muted" style="display:flex;align-items:center;flex-wrap:wrap;gap:4px;">
                    Viser ${shown.length} av ${results.length} treff
                    ${modeBadge}
                </p>
            </div>
            ${truncMsg}
        `;
    }

    static _statusBadge(item) {
        const s = (item._status || item.status || '').toUpperCase();
        const vare = (item.vareStatus || '').toLowerCase();

        if (s === 'A' || s === 'AKTIV' || s === 'ACTIVE' || vare === 'sellable') {
            return '<span class="badge badge-ok" style="font-size:10px;">Aktiv</span>';
        }
        if (s.includes('UTGÅ') || s.includes('UTGA') || s === 'U' ||
            vare.includes('planned discontinued')) {
            return '<span class="badge badge-warning" style="font-size:10px;white-space:nowrap;">Utgående</span>';
        }
        if (s.includes('UTGATT') || s.includes('UTGÅTT') || s === 'X' ||
            vare === 'discontinued') {
            return '<span class="badge badge-critical" style="font-size:10px;white-space:nowrap;">Utgått</span>';
        }
        if (s) {
            return `<span style="font-size:10px;color:#666;">${this.esc(item._status || item.status || '')}</span>`;
        }
        return '<span style="color:#aaa;font-size:10px;">–</span>';
    }

    // ════════════════════════════════════════════════════
    //  ARTICLE DETAIL CARD (POPUP)
    // ════════════════════════════════════════════════════

    static openCard(idx) {
        const item = this._lastResults[idx];
        if (!item) return;

        // Remove any existing modal
        const existing = document.getElementById('artikkelOppslagModal');
        if (existing) existing.remove();

        const stock    = (item.stock || 0).toLocaleString('nb-NO');
        const incoming = (item.bestAntLev || 0) > 0
            ? (item.bestAntLev).toLocaleString('nb-NO')
            : '–';

        const bp = item.bestillingspunkt != null
            ? item.bestillingspunkt.toLocaleString('nb-NO')
            : null;

        const coverageDays = (item.daysToEmpty != null && item.daysToEmpty < 999999)
            ? Math.round(item.daysToEmpty)
            : null;

        const statusHtml = this._statusBadge(item);

        // Safe values for inline onclick strings (no single quotes in data)
        const safeTools = (item.toolsArticleNumber || '').replace(/'/g, '&#39;');
        const safeSa    = (item.saNumber           || '').replace(/'/g, '&#39;');
        const safeLoc   = (item.location            || '').replace(/'/g, '&#39;');

        // Status line: badge + optional BP / Dekning / Erstattet
        const statusLineExtra = [
            bp != null
                ? `<span style="font-size:12px;color:#64748b;">
                       <b style="color:#374151;font-weight:600;">BP</b>&nbsp;${bp}
                   </span>`
                : '',
            coverageDays != null
                ? `<span style="font-size:12px;color:#64748b;">
                       <b style="color:#374151;font-weight:600;">Dekning</b>&nbsp;${coverageDays}&nbsp;dager
                   </span>`
                : '',
            item.ersattAvArtikel
                ? `<span style="font-size:12px;color:#64748b;">
                       <b style="color:#374151;font-weight:600;">Erstattet&nbsp;av</b>&nbsp;<span style="font-family:monospace;">${this.esc(item.ersattAvArtikel)}</span>
                   </span>`
                : ''
        ].filter(Boolean).join('');

        const modal = document.createElement('div');
        modal.id = 'artikkelOppslagModal';
        modal.className = 'modal-overlay';
        modal.style.cssText = 'display:flex;align-items:center;justify-content:center;z-index:9999;';
        modal.onclick = (e) => { if (e.target === modal) modal.remove(); };

        // Shared section styles (override the CSS auto-styling on .modal-body > div)
        const S = 'background:#fff;border-radius:0;padding:0;margin-bottom:0;border-bottom:1px solid #e5e7eb;';
        const SA = 'background:#f8fafc;border-radius:0;padding:0;margin-bottom:0;border-bottom:1px solid #e5e7eb;';

        modal.innerHTML = `
            <div class="modal" onclick="event.stopPropagation()">
                <div class="modal-header">
                    <h3 style="margin:0;font-size:15px;font-weight:600;line-height:1.35;
                                max-width:calc(100% - 36px);">
                        ${this.esc(item.description || item.toolsArticleNumber || 'Artikkel')}
                    </h3>
                    <button class="modal-close"
                            onclick="document.getElementById('artikkelOppslagModal').remove()"
                            style="font-size:22px;background:none;border:none;cursor:pointer;
                                   color:#666;line-height:1;padding:0 4px;flex-shrink:0;">&times;</button>
                </div>
                <div class="modal-body">

                    <!-- S2: Identifikasjon -->
                    <div style="${S}padding:10px 16px;display:grid;
                                 grid-template-columns:auto 1fr;align-items:center;gap:5px 16px;">
                        <span style="font-size:10px;font-weight:700;color:#94a3b8;
                                     text-transform:uppercase;white-space:nowrap;">Tools art.nr</span>
                        <span style="font-size:13px;font-family:monospace;font-weight:700;
                                     color:#111827;">${this.esc(item.toolsArticleNumber || '–')}</span>

                        <span style="font-size:10px;font-weight:700;color:#94a3b8;
                                     text-transform:uppercase;white-space:nowrap;">SA-nummer</span>
                        <span style="font-size:13px;font-family:monospace;
                                     color:#374151;">${this.esc(item.saNumber || '–')}</span>

                        <span style="font-size:10px;font-weight:700;color:#94a3b8;
                                     text-transform:uppercase;white-space:nowrap;">Lokasjon</span>
                        <span style="font-size:13px;font-weight:600;
                                     color:#374151;">${this.esc(item.location || '–')}</span>
                    </div>

                    <!-- S3: Leverandør -->
                    <div style="${SA}padding:10px 16px;display:flex;gap:24px;flex-wrap:wrap;">
                        <div>
                            <div style="font-size:10px;font-weight:700;color:#94a3b8;
                                        text-transform:uppercase;margin-bottom:3px;">Leverandør</div>
                            <div style="font-size:13px;color:#374151;">
                                ${this.esc(item.supplier || '–')}
                            </div>
                        </div>
                        <div>
                            <div style="font-size:10px;font-weight:700;color:#94a3b8;
                                        text-transform:uppercase;margin-bottom:3px;">Lev.art.nr</div>
                            <div style="font-size:13px;font-family:monospace;color:#374151;">
                                ${this.esc(item.supplierArticleNumber || '–')}
                            </div>
                        </div>
                    </div>

                    <!-- S4: Lagerstatus -->
                    <div style="${S}padding:10px 16px;">
                        <div style="font-size:10px;font-weight:700;color:#94a3b8;
                                    text-transform:uppercase;margin-bottom:8px;">Lagerstatus</div>
                        <div style="display:flex;gap:32px;flex-wrap:wrap;">
                            <div>
                                <div style="font-size:10px;color:#94a3b8;margin-bottom:2px;">Beholdning</div>
                                <div style="font-size:22px;font-weight:700;line-height:1;
                                            color:${(item.stock||0)>0?'#16a34a':'#dc2626'};">
                                    ${stock}
                                </div>
                            </div>
                            <div>
                                <div style="font-size:10px;color:#94a3b8;margin-bottom:2px;">Innkommende</div>
                                <div style="font-size:22px;font-weight:700;line-height:1;
                                            color:${(item.bestAntLev||0)>0?'#1565c0':'#94a3b8'};">
                                    ${incoming}
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- S5: Status + BP + Dekning + Erstattet av -->
                    <div style="${SA}padding:10px 16px;display:flex;
                                 align-items:center;gap:10px;flex-wrap:wrap;">
                        ${statusHtml}
                        ${statusLineExtra}
                    </div>

                    <!-- S6: Prisinfo (FASE 9.0) -->
                    <div style="${S}border-bottom:none;padding:10px 16px 2px;">
                        ${this._buildPrisInfoHTML(item)}
                    </div>

                    <!-- S7: Kjøpshistorikk -->
                    <div style="${S}border-bottom:none;padding:10px 16px 2px;">
                        ${this._buildPurchaseHistoryHTML(item)}
                    </div>

                    <!-- S7: Kopieringsknapper -->
                    <div style="background:#f8fafc;border-radius:0;padding:10px 16px;
                                display:flex;gap:8px;flex-wrap:wrap;
                                border-top:1px solid #e5e7eb;margin-bottom:0;">
                        <button class="btn-secondary btn-small"
                                onclick="ArtikkelOppslagMode._copy('${safeTools}', this)"
                                style="font-size:12px;">
                            📋 Copy Tools nr
                        </button>
                        <button class="btn-secondary btn-small"
                                onclick="ArtikkelOppslagMode._copy('${safeSa}', this)"
                                style="font-size:12px;">
                            📋 Copy SA nr
                        </button>
                        <button class="btn-secondary btn-small"
                                onclick="ArtikkelOppslagMode._copy('${safeLoc}', this)"
                                style="font-size:12px;">
                            📋 Copy lokasjon
                        </button>
                    </div>

                </div>
            </div>
        `;

        document.body.appendChild(modal);

        // Close on Escape
        const onKeydown = (e) => {
            if (e.key === 'Escape') {
                modal.remove();
                document.removeEventListener('keydown', onKeydown);
            }
        };
        document.addEventListener('keydown', onKeydown);
    }

    // ════════════════════════════════════════════════════
    //  EVENT HANDLERS
    // ════════════════════════════════════════════════════

    static onInput(value) {
        this._searchTerm = value;

        if (value.length >= 2) {
            this._runSearch();
        } else if (this._activeFilters.size > 0) {
            this._runFilterOnly();
        } else {
            this._lastResults = [];
        }

        // Only update results div to avoid focus loss
        const resultsDiv = document.getElementById('artikkelOppslagResults');
        if (resultsDiv) {
            resultsDiv.innerHTML = this._buildResultsHTML();
        }
    }

    // ════════════════════════════════════════════════════
    //  FUZZY TOGGLE
    // ════════════════════════════════════════════════════

    static toggleFuzzy() {
        this._searchMode = this._searchMode === 'fuzzy' ? 'exact' : 'fuzzy';
        if (this._searchTerm.length >= 2) {
            this._runSearch();
        }
        const contentDiv = document.getElementById('moduleContent');
        if (contentDiv && this._store) {
            contentDiv.innerHTML = this._buildHTML();
            const input = document.getElementById('artikkelOppslagSearch');
            if (input) { input.focus(); const len = input.value.length; input.setSelectionRange(len, len); }
        }
    }

    // ════════════════════════════════════════════════════
    //  CHECKBOX OG LAGEROVERSIKT
    // ════════════════════════════════════════════════════

    static toggleSelectItem(toolsNr, checked) {
        if (checked) this._selectedItems.add(toolsNr);
        else this._selectedItems.delete(toolsNr);
        this._updateSelectionBar();
    }

    static toggleSelectAll(checked) {
        this._lastResults.forEach(item => {
            if (checked) this._selectedItems.add(item.toolsArticleNumber);
            else this._selectedItems.delete(item.toolsArticleNumber);
        });
        document.querySelectorAll('.artikkel-checkbox').forEach(cb => { cb.checked = checked; });
        this._updateSelectionBar();
    }

    static _updateSelectionBar() {
        const count = this._selectedItems.size;
        const btn = document.getElementById('artikkelGenererBtn');
        if (btn) {
            btn.textContent = `Generer lageroversikt (${count} valgt)`;
            btn.disabled = count === 0;
            btn.style.opacity = count === 0 ? '0.5' : '1';
        }
        const countEl = document.getElementById('artikkelValgCount');
        if (countEl) countEl.textContent = count > 0 ? `${count} valgt` : '';

        // Oppdater kurv-indikator øverst
        const kurvEl = document.getElementById('artikkelKurvIndicator');
        if (kurvEl) {
            if (count > 0) {
                kurvEl.style.display = 'flex';
                kurvEl.style.alignItems = 'center';
                kurvEl.style.gap = '10px';
                kurvEl.style.padding = '6px 12px';
                kurvEl.style.background = '#e0f2fe';
                kurvEl.style.borderRadius = '6px';
                kurvEl.style.marginBottom = '8px';
                kurvEl.style.fontSize = '13px';
                kurvEl.innerHTML = `
                    <span style="color:#0369a1;font-weight:600;">
                        🛒 ${count} artikler i kurven
                    </span>
                    <button onclick="ArtikkelOppslagMode.nullstillValg()"
                            style="font-size:11px;padding:2px 8px;border-radius:4px;
                                   background:#fff;border:1px solid #7dd3fc;color:#0369a1;
                                   cursor:pointer;">
                        Tøm kurv
                    </button>`;
            } else {
                kurvEl.style.display = 'none';
                kurvEl.innerHTML = '';
            }
        }
    }

    static genererLageroversikt() {
        const valgte = this._allItems
            ? this._allItems.filter(i => this._selectedItems.has(i.toolsArticleNumber))
            : [];
        if (valgte.length === 0) return;
        this._showLageroversikt = true;
        this._lageroversiktItems = valgte;

        const contentDiv = document.getElementById('moduleContent');
        if (contentDiv && this._store) {
            contentDiv.innerHTML = this._buildHTML();
        }
    }

    static lukkLageroversikt() {
        this._showLageroversikt = false;
        this._lageroversiktItems = [];
        const contentDiv = document.getElementById('moduleContent');
        if (contentDiv && this._store) {
            contentDiv.innerHTML = this._buildHTML();
        }
    }

    static nullstillValg() {
        this._selectedItems.clear();
        document.querySelectorAll('.artikkel-checkbox').forEach(cb => { cb.checked = false; });
        const velgAlle = document.getElementById('artikkelVelgAlle');
        if (velgAlle) velgAlle.checked = false;
        this._updateSelectionBar();
    }

    static async kopierLageroversikt() {
        if (!this._lageroversiktItems || this._lageroversiktItems.length === 0) return;
        const lines = this._lageroversiktItems
            .sort((a, b) => (b.stock || 0) - (a.stock || 0))
            .map(item =>
                `${item.toolsArticleNumber || ''}\t${item.description || ''}\t${item.stock ?? 0}\t${item.bestAntLev || 0}\t${item.location || ''}\t${item.saNumber || ''}`
            );
        const header = 'ART.NR\tBESKRIVELSE\tSALDO\tI BESTILLING\tLAGERPLASS\tSA';
        const text = [header, ...lines].join('\n');
        await this._copy(text, document.querySelector('button[onclick*="kopierLageroversikt"]'));
    }

    // ════════════════════════════════════════════════════
    //  EXCEL-EKSPORT
    // ════════════════════════════════════════════════════

    static exportExcel() {
        if (typeof XLSX === 'undefined') {
            alert('XLSX-biblioteket er ikke lastet. Kan ikke eksportere.');
            return;
        }
        const rows = this._lastResults;
        if (!rows || rows.length === 0) {
            alert('Ingen artikler å eksportere. Bruk søk eller filter for å hente en liste.');
            return;
        }

        const data = rows.map(item => ({
            'TOOLS NR':     item.toolsArticleNumber || '',
            'SA-NUMMER':    item.saNumber           || '',
            'BESKRIVELSE':  item.description        || '',
            'LOKASJON':     item.location           || '',
            'LAGER':        item.stock              ?? 0,
            'INNKOMMENDE':  item.bestAntLev         ?? 0,
            'STATUS':       item.vareStatus         || (item._status || item.status || ''),
            'LEVERANDØR':   item.supplier           || '',
            'NY LOKASJON':  '',   // Tom kolonne for håndskriving
        }));

        const ws = XLSX.utils.json_to_sheet(data);

        // Kolonnebredder (tegnbredde)
        ws['!cols'] = [
            { wch: 15 }, // TOOLS NR
            { wch: 15 }, // SA-NUMMER
            { wch: 40 }, // BESKRIVELSE
            { wch: 15 }, // LOKASJON
            { wch: 8  }, // LAGER
            { wch: 12 }, // INNKOMMENDE
            { wch: 20 }, // STATUS
            { wch: 20 }, // LEVERANDØR
            { wch: 20 }, // NY LOKASJON
        ];

        // Frys første rad
        ws['!views'] = [{ state: 'frozen', ySplit: 1, xSplit: 0, topLeftCell: 'A2', activePane: 'bottomLeft' }];

        // Autofilter
        const lastCol = XLSX.utils.encode_col(data[0] ? Object.keys(data[0]).length - 1 : 8);
        ws['!autofilter'] = { ref: `A1:${lastCol}${data.length + 1}` };

        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Artikler');

        const date = new Date().toISOString().slice(0, 10);
        const hasUtenLokasjon = this._activeFilters.has('uten-lokasjon');
        const filename = hasUtenLokasjon
            ? `Artikler_uten_lokasjon_${date}.xlsx`
            : `Artikkel_Oppslag_${date}.xlsx`;

        XLSX.writeFile(wb, filename);
    }

    // ════════════════════════════════════════════════════
    //  COPY UTILITY
    // ════════════════════════════════════════════════════

    static async _copy(text, btn) {
        if (!text || text === '–') return;
        try {
            await navigator.clipboard.writeText(text);
            const orig = btn.textContent;
            btn.textContent = '✔ Kopiert!';
            btn.style.color = '#16a34a';
            setTimeout(() => {
                btn.textContent = orig;
                btn.style.color = '';
            }, 1500);
        } catch (_) {
            // Clipboard API fallback
            const ta = document.createElement('textarea');
            ta.value = text;
            ta.style.cssText = 'position:fixed;opacity:0;top:0;left:0;';
            document.body.appendChild(ta);
            ta.focus();
            ta.select();
            document.execCommand('copy');
            ta.remove();
        }
    }

    // ════════════════════════════════════════════════════
    //  PRISINFO PANEL (FASE 9.0)
    // ════════════════════════════════════════════════════

    /**
     * Bygg prisinfo-panel for artikkelkort
     * Vises mellom lagerstatus og kjøpshistorikk
     * FASE 9.0
     */
    static _buildPrisInfoHTML(item) {
        if (!item.iInPrisliste) {
            return `
                <div style="margin-bottom:14px;border:1px solid #e2e8f0;border-radius:8px;overflow:hidden;">
                    <div style="background:#f1f5f9;padding:8px 12px;font-size:11px;font-weight:700;
                                color:#475569;text-transform:uppercase;letter-spacing:0.05em;">
                        Prisliste
                    </div>
                    <div style="padding:10px 12px;font-size:12px;color:#94a3b8;font-style:italic;">
                        Ikke i prisliste
                    </div>
                </div>`;
        }

        const fmt = (v) => v > 0 ? v.toFixed(2).replace('.', ',') + ' kr' : '–';
        const fmtPct = (v) => v !== 0 ? (v > 0 ? '+' : '') + v.toFixed(1) + '%' : '–';

        const avvikFarge = Math.abs(item.prisAvvik) > 10 ? '#dc2626' :
                           Math.abs(item.prisAvvik) > 5  ? '#d97706' : '#16a34a';

        const prisStatusHtml = item.prisStatus
            ? `<span style="background:#fef3c7;color:#92400e;padding:2px 8px;
                            border-radius:4px;font-size:11px;font-weight:600;">
                   ${item.prisStatus}
               </span>`
            : '';

        return `
            <div style="margin-bottom:14px;border:1px solid #e2e8f0;border-radius:8px;overflow:hidden;">
                <div style="background:#f1f5f9;padding:8px 12px;font-size:11px;font-weight:700;
                            color:#475569;text-transform:uppercase;letter-spacing:0.05em;
                            display:flex;justify-content:space-between;align-items:center;">
                    <span>Prisliste</span>
                    ${prisStatusHtml}
                </div>
                <div style="padding:10px 12px;">
                    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;font-size:12px;">
                        <div>
                            <div style="color:#94a3b8;font-size:10px;margin-bottom:2px;">Avtalepris (inkl. 3%)</div>
                            <div style="font-weight:700;color:#1e40af;font-size:15px;">${fmt(item.avtalepris)}</div>
                        </div>
                        <div>
                            <div style="color:#94a3b8;font-size:10px;margin-bottom:2px;">Listpris</div>
                            <div style="font-weight:600;color:#374151;">${fmt(item.listpris)}</div>
                        </div>
                        <div>
                            <div style="color:#94a3b8;font-size:10px;margin-bottom:2px;">Dekningsgrad</div>
                            <div style="font-weight:600;color:#374151;">${item.nyDG > 0 ? (item.nyDG * 100).toFixed(1) + '%' : '–'}</div>
                        </div>
                        <div>
                            <div style="color:#94a3b8;font-size:10px;margin-bottom:2px;">Prisavvik (liste vs MV2)</div>
                            <div style="font-weight:600;color:${avvikFarge};">${fmtPct(item.prisAvvik)}</div>
                        </div>
                    </div>
                    ${item.prisAnbefaling && !item.prisAnbefaling.startsWith('OK') ? `
                        <div style="margin-top:8px;padding:6px 10px;background:#fef9c3;
                                    border-radius:6px;font-size:11px;color:#854d0e;">
                            ⚠️ ${item.prisAnbefaling}
                        </div>` : ''}
                </div>
            </div>`;
    }

    // ════════════════════════════════════════════════════
    //  KJØPSHISTORIKK PANEL
    // ════════════════════════════════════════════════════

    static _buildPurchaseHistoryHTML(item) {
        const toolsNr = item.toolsArticleNumber || '';

        // Jeeves-data ikke lastet inn ennå
        if (!this._store || !this._store.jeevesMap) {
            return `
                <div style="margin-bottom:14px;border:1px solid #e2e8f0;border-radius:8px;overflow:hidden;">
                    <div style="background:#f1f5f9;padding:8px 12px;font-size:11px;font-weight:700;
                                color:#475569;text-transform:uppercase;letter-spacing:0.05em;">
                        Kjøpshistorikk (Jeeves)
                    </div>
                    <div style="padding:10px 12px;font-size:12px;color:#94a3b8;font-style:italic;">
                        Last inn Ordrer_Jeeves.xlsx for å se kjøpshistorikk
                    </div>
                </div>`;
        }

        const hist = toolsNr ? this._store.jeevesMap[toolsNr] : null;

        // Ingen historikk funnet for denne artikkelen
        if (!hist) {
            return `
                <div style="margin-bottom:14px;border:1px solid #e2e8f0;border-radius:8px;overflow:hidden;">
                    <div style="background:#f1f5f9;padding:8px 12px;font-size:11px;font-weight:700;
                                color:#475569;text-transform:uppercase;letter-spacing:0.05em;">
                        Kjøpshistorikk (Jeeves)
                    </div>
                    <div style="padding:10px 12px;font-size:12px;color:#94a3b8;font-style:italic;">
                        Ingen kjøpshistorikk i Jeeves-data
                    </div>
                </div>`;
        }

        // Format quantity: show 1 decimal if not integer
        const fmtQty = (n) => {
            if (n == null) return '–';
            return Number.isInteger(n) ? n.toString() : n.toFixed(1);
        };

        const summaryRows = `
            <div style="display:grid;grid-template-columns:auto 1fr;gap:2px 12px;
                        font-size:12px;padding:10px 12px;">
                <span style="color:#64748b;white-space:nowrap;">Totalt kjøpt</span>
                <span style="font-weight:600;">${hist.totalOrders} ganger</span>
                <span style="color:#64748b;white-space:nowrap;">Siste kjøp</span>
                <span style="font-weight:600;">${hist.lastDate || '–'}</span>
                <span style="color:#64748b;white-space:nowrap;">Snitt/ordre</span>
                <span style="font-weight:600;">${fmtQty(hist.avgQty)} stk</span>
                <span style="color:#64748b;white-space:nowrap;">Min / Maks</span>
                <span style="font-weight:600;">${fmtQty(hist.minQty)} / ${fmtQty(hist.maxQty)} stk</span>
            </div>`;

        // Per-location breakdown (only if more than one location, or always if present)
        const locationKeys = Object.keys(hist.byLocation || {});
        let locationHTML = '';
        if (locationKeys.length > 0) {
            const rows = locationKeys.map(loc => {
                const l = hist.byLocation[loc];
                return `
                    <div style="display:flex;gap:6px;align-items:baseline;
                                font-size:11px;padding:2px 0;border-top:1px solid #f1f5f9;">
                        <span style="font-family:monospace;font-weight:600;min-width:80px;
                                     color:#334155;">${this.esc(loc)}</span>
                        <span style="color:#64748b;">${l.orders} kjøp</span>
                        <span style="color:#94a3b8;">|</span>
                        <span style="color:#64748b;">snitt ${fmtQty(l.avgQty)} stk</span>
                        <span style="color:#94a3b8;">|</span>
                        <span style="color:#64748b;">sist ${l.lastDate || '–'}</span>
                    </div>`;
            }).join('');

            locationHTML = `
                <div style="padding:6px 12px 10px 12px;border-top:1px solid #e2e8f0;">
                    <div style="font-size:10px;color:#94a3b8;font-weight:600;
                                text-transform:uppercase;margin-bottom:4px;">Per leveringssted</div>
                    ${rows}
                </div>`;
        }

        return `
            <div style="margin-bottom:14px;border:1px solid #e2e8f0;border-radius:8px;overflow:hidden;">
                <div style="background:#f1f5f9;padding:8px 12px;font-size:11px;font-weight:700;
                            color:#475569;text-transform:uppercase;letter-spacing:0.05em;">
                    Kjøpshistorikk (Jeeves)
                </div>
                ${summaryRows}
                ${locationHTML}
            </div>`;
    }

    // ════════════════════════════════════════════════════
    //  UTILITY
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
}

// Eksporter til global scope
window.ArtikkelOppslagMode = ArtikkelOppslagMode;
