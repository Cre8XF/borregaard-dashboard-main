// ===================================
// MODUS: ARTIKKEL OPPSLAG – Global søkemotor
// Søk på Tools nr, SA-nummer, lokasjon, leverandør, beskrivelse
// ===================================

class ArtikkelOppslagMode {
    static _store        = null;
    static _fuse         = null;
    static _allItems     = null;
    static _searchTerm   = '';
    static _activeFilter = 'alle';   // 'alle' | 'med-lager' | 'utgaende' | 'uten-lokasjon'
    static _lastResults  = [];
    static _searchMode   = 'fuzzy'; // 'exact' | 'location' | 'fuzzy'

    // ════════════════════════════════════════════════════
    //  MAIN RENDER
    // ════════════════════════════════════════════════════

    static render(store) {
        this._store = store;
        this._initFuse(store);

        if (this._searchTerm.length >= 2) {
            this._runSearch();
        } else {
            this._lastResults = [];
        }

        return this._buildHTML();
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
        const term   = this._searchTerm;
        const filter = this._activeFilter;

        const filters = [
            { id: 'alle',          label: 'Alle' },
            { id: 'med-lager',     label: 'Kun med lager' },
            { id: 'utgaende',      label: 'Utgående' },
            { id: 'uten-lokasjon', label: 'Uten lokasjon' }
        ];

        const filterHTML = filters.map(f => `
            <button
                class="btn-${f.id === filter ? 'primary' : 'secondary'} btn-small"
                onclick="ArtikkelOppslagMode.setFilter('${f.id}')"
                style="font-size:12px;padding:4px 12px;"
            >${this.esc(f.label)}</button>
        `).join('');

        return `
            <div class="module-header">
                <h2>Artikkel Oppslag</h2>
                <p class="module-description">
                    Søk etter Tools nr, SA-nummer, lokasjon, leverandørartikkel eller beskrivelse.
                </p>
            </div>

            <div class="module-controls" style="flex-direction:column;gap:12px;align-items:stretch;">
                <div style="position:relative;">
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
                <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;">
                    <span style="font-size:12px;color:#666;font-weight:600;">Filter:</span>
                    ${filterHTML}
                </div>
            </div>

            <div id="artikkelOppslagResults">
                ${this._buildResultsHTML()}
            </div>
        `;
    }

    static _buildResultsHTML() {
        const term    = this._searchTerm;
        const results = this._lastResults;

        if (term.length < 2) {
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
        if (!this._store || !this._allItems) { this._lastResults = []; return; }

        const term      = this._searchTerm.trim();
        const termUpper = term.toUpperCase();
        let candidates  = [];

        // ── STEP 1: Exact match on article identifier fields (case-insensitive) ──
        // Returns immediately if any of the unique ID fields match exactly.
        candidates = this._allItems.filter(item =>
            (item.toolsArticleNumber    || '').toUpperCase() === termUpper ||
            (item.saNumber              || '').toUpperCase() === termUpper ||
            (item.supplierArticleNumber || '').toUpperCase() === termUpper
        );
        if (candidates.length > 0) {
            this._searchMode = 'exact';
        }

        // ── STEP 2: Exact location match ──
        // If no identifier hit, return all items at that exact location.
        if (candidates.length === 0) {
            candidates = this._allItems.filter(item =>
                (item.location || '').toUpperCase() === termUpper
            );
            if (candidates.length > 0) {
                this._searchMode = 'location';
            }
        }

        // ── STEP 3: Fuzzy search — only when steps 1 and 2 both returned nothing ──
        if (candidates.length === 0) {
            this._searchMode = 'fuzzy';
            if (this._fuse && term.length >= 2) {
                candidates = this._fuse.search(term).map(r => r.item);
            } else {
                // Simple substring fallback (no Fuse.js)
                const t = term.toLowerCase();
                candidates = this._allItems.filter(item =>
                    (item.toolsArticleNumber    || '').toLowerCase().includes(t) ||
                    (item.saNumber              || '').toLowerCase().includes(t) ||
                    (item.location              || '').toLowerCase().includes(t) ||
                    (item.supplier              || '').toLowerCase().includes(t) ||
                    (item.supplierId            || '').toLowerCase().includes(t) ||
                    (item.supplierArticleNumber || '').toLowerCase().includes(t) ||
                    (item.description           || '').toLowerCase().includes(t)
                );
            }
        }

        candidates = this._applyFilter(candidates);

        // Sort: location ASC (natural), then toolsArticleNumber ASC
        candidates.sort((a, b) => {
            const locCmp = this._cmpLocation(a.location || '', b.location || '');
            if (locCmp !== 0) return locCmp;
            return (a.toolsArticleNumber || '').localeCompare(b.toolsArticleNumber || '', 'nb-NO');
        });

        this._lastResults = candidates;
    }

    static _applyFilter(items) {
        switch (this._activeFilter) {
            case 'med-lager':
                return items.filter(i => (i.stock || 0) > 0);
            case 'utgaende': {
                return items.filter(i => {
                    const s = (i._status || i.status || '').toUpperCase();
                    return s.includes('UTGÅ') || s.includes('UTGA') ||
                           s === 'U' || s.includes('DISCONTINUED') ||
                           (i.vareStatus || '').toLowerCase().includes('discontinued');
                });
            }
            case 'uten-lokasjon':
                return items.filter(i => !i.location || i.location.trim() === '');
            default:
                return items;
        }
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

            const stockVal = item.stock || 0;
            const stockCell = stockVal > 0
                ? `<span style="color:#16a34a;font-weight:700;">${stockVal.toLocaleString('nb-NO')}</span>`
                : `<span style="color:#dc2626;font-weight:700;">0</span>`;

            const incomingVal = item.bestAntLev || 0;
            const incomingCell = incomingVal > 0
                ? `<span style="color:#1565c0;">${incomingVal.toLocaleString('nb-NO')}</span>`
                : `<span style="color:#aaa;">–</span>`;

            return `
                <tr style="cursor:pointer;"
                    onclick="ArtikkelOppslagMode.openCard(${idx})"
                    title="Klikk for detaljer">
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

        const optionalRows = [
            bp != null ? `
                <div class="detail-item">
                    <span class="detail-label">BP</span>
                    <span class="detail-value">${bp}</span>
                </div>` : '',
            coverageDays != null ? `
                <div class="detail-item">
                    <span class="detail-label">Dekning</span>
                    <span class="detail-value">${coverageDays} dager</span>
                </div>` : '',
            item.ersattAvArtikel ? `
                <div class="detail-item">
                    <span class="detail-label">Erstattet av</span>
                    <span class="detail-value" style="font-family:monospace;">${this.esc(item.ersattAvArtikel)}</span>
                </div>` : ''
        ].join('');

        const statusHtml = this._statusBadge(item);

        // Safe values for inline onclick strings (no single quotes in data)
        const safeTools = (item.toolsArticleNumber || '').replace(/'/g, '&#39;');
        const safeSa    = (item.saNumber           || '').replace(/'/g, '&#39;');
        const safeLoc   = (item.location            || '').replace(/'/g, '&#39;');

        const modal = document.createElement('div');
        modal.id = 'artikkelOppslagModal';
        modal.className = 'modal-overlay';
        modal.style.cssText = 'display:flex;align-items:center;justify-content:center;z-index:9999;';
        modal.onclick = (e) => { if (e.target === modal) modal.remove(); };

        modal.innerHTML = `
            <div class="modal"
                 style="max-width:520px;width:95%;max-height:85vh;overflow-y:auto;"
                 onclick="event.stopPropagation()">
                <div class="modal-header">
                    <h3 style="margin:0;font-size:16px;">
                        ${this.esc(item.description || item.toolsArticleNumber || 'Artikkel')}
                    </h3>
                    <button class="modal-close"
                            onclick="document.getElementById('artikkelOppslagModal').remove()"
                            style="font-size:22px;background:none;border:none;cursor:pointer;
                                   color:#666;line-height:1;padding:0 4px;">&times;</button>
                </div>
                <div class="modal-body" style="padding:16px;">

                    <!-- Identifikasjon -->
                    <div class="detail-section" style="margin-bottom:14px;">
                        <div class="detail-item">
                            <span class="detail-label">TOOLS ART.NR</span>
                            <span class="detail-value"
                                  style="font-family:monospace;font-weight:700;">
                                ${this.esc(item.toolsArticleNumber || '–')}
                            </span>
                        </div>
                        <div class="detail-item">
                            <span class="detail-label">SA-NUMMER</span>
                            <span class="detail-value" style="font-family:monospace;">
                                ${this.esc(item.saNumber || '–')}
                            </span>
                        </div>
                        <div class="detail-item">
                            <span class="detail-label">LOKASJON</span>
                            <span class="detail-value" style="font-weight:600;">
                                ${this.esc(item.location || '–')}
                            </span>
                        </div>
                    </div>

                    <!-- Beskrivelse -->
                    <div style="padding:10px 12px;background:#f8f9fa;border-radius:6px;
                                margin-bottom:14px;">
                        <div style="font-size:11px;color:#666;font-weight:600;
                                    text-transform:uppercase;margin-bottom:4px;">Beskrivelse</div>
                        <div style="font-size:14px;">${this.esc(item.description || '–')}</div>
                    </div>

                    <!-- Leverandør -->
                    <div class="detail-section" style="margin-bottom:14px;">
                        <div class="detail-item">
                            <span class="detail-label">LEVERANDØR</span>
                            <span class="detail-value">${this.esc(item.supplier || '–')}</span>
                        </div>
                        <div class="detail-item">
                            <span class="detail-label">LEVERANDØR ART.NR</span>
                            <span class="detail-value" style="font-family:monospace;">
                                ${this.esc(item.supplierArticleNumber || '–')}
                            </span>
                        </div>
                    </div>

                    <!-- Lagerstatus -->
                    <div class="detail-section" style="margin-bottom:14px;">
                        <div style="font-size:11px;color:#666;font-weight:600;
                                    text-transform:uppercase;margin-bottom:6px;">Lagerstatus</div>
                        <div class="detail-item">
                            <span class="detail-label">Beholdning</span>
                            <span class="detail-value"
                                  style="font-weight:700;color:${(item.stock||0)>0?'#16a34a':'#dc2626'};">
                                ${stock}
                            </span>
                        </div>
                        <div class="detail-item">
                            <span class="detail-label">Innkommende</span>
                            <span class="detail-value" style="color:#1565c0;">${incoming}</span>
                        </div>
                    </div>

                    <!-- Status -->
                    <div class="detail-section" style="margin-bottom:14px;">
                        <div style="font-size:11px;color:#666;font-weight:600;
                                    text-transform:uppercase;margin-bottom:6px;">Status</div>
                        ${statusHtml}
                    </div>

                    <!-- Valgfrie felt -->
                    ${optionalRows ? `
                        <div class="detail-section" style="margin-bottom:14px;">
                            ${optionalRows}
                        </div>` : ''}

                    <!-- Kopieringsknapper -->
                    <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:16px;
                                padding-top:14px;border-top:1px solid #e5e7eb;">
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
        } else {
            this._lastResults = [];
        }

        // Only update results div to avoid focus loss
        const resultsDiv = document.getElementById('artikkelOppslagResults');
        if (resultsDiv) {
            resultsDiv.innerHTML = this._buildResultsHTML();
        }
    }

    static setFilter(filterId) {
        this._activeFilter = filterId;

        if (this._searchTerm.length >= 2) {
            this._runSearch();
        }

        // Rebuild full HTML to update active filter button style
        const contentDiv = document.getElementById('moduleContent');
        if (!contentDiv || !this._store) return;
        contentDiv.innerHTML = this._buildHTML();

        // Return focus to search input
        const input = document.getElementById('artikkelOppslagSearch');
        if (input) {
            input.focus();
            const len = input.value.length;
            input.setSelectionRange(len, len);
        }
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
