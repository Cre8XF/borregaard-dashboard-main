// ===================================
// MODUS: LAGEROPPSLAG
// Fritekst-søk og lageroversikt for enkeltartikler
// Isolert modul — leser KUN fra dataStore, endrer ingenting
// ===================================

/**
 * LagerLookupMode — Lageroppslag
 *
 * Gir operatøren rask tilgang til lagerstatus per artikkel.
 * Støtter fritekst-søk på artikkelnummer, beskrivelse og SA-nummer.
 * Valgte artikler kan eksporteres som en enkel lageroversikt.
 *
 * ISOLASJON:
 *   - Leser kun fra dataStore (ingen skriving)
 *   - Bruker egen lokal state (selectedLookupItems, searchTerm)
 *   - Endrer ikke analyse-filter, rapport-generator eller selectedItems i andre moduler
 */
class LagerLookupMode {
    // ── Lokal state (isolert fra andre moduler) ──
    static dataStore = null;
    static selectedLookupItems = new Set(); // Set<toolsArticleNumber>
    static searchTerm = '';
    static _lastGeneratedItems = [];        // Sist genererte liste (for clipboard)

    // ════════════════════════════════════════════════════
    //  MAIN RENDER
    // ════════════════════════════════════════════════════

    /**
     * Render lageroppslag-modulen.
     * @param {UnifiedDataStore} store
     * @returns {string} HTML
     */
    static render(store) {
        this.dataStore = store;

        // Ingen data lastet
        if (!store || store.items.size === 0) {
            return `
                <div class="module-header">
                    <h2>Lageroppslag</h2>
                </div>
                <div class="placeholder-content">
                    <div class="placeholder-icon">🔎</div>
                    <h3>Ingen data tilgjengelig</h3>
                    <p>Last opp data for å bruke lageroppslag.</p>
                </div>
            `;
        }

        const items = store.getAllItems();
        const filtered = this.filterItems(items, this.searchTerm);

        return `
            <div class="module-header">
                <h2>Lageroppslag</h2>
                <p class="module-description">
                    Søk på artikkelnummer, beskrivelse eller SA-nummer.
                    Velg artikler og generer lageroversikt.
                </p>
            </div>

            <!-- Søkefelt -->
            <div style="margin-bottom:16px;">
                <input type="text"
                       id="lagerLookupSearch"
                       value="${this.escapeHtml(this.searchTerm)}"
                       placeholder="Søk på artikkelnummer, beskrivelse eller SA-nummer..."
                       oninput="LagerLookupMode.handleSearch(this.value)"
                       style="width:100%;padding:10px 14px;font-size:14px;border:2px solid #bdc3c7;
                              border-radius:6px;box-sizing:border-box;outline:none;
                              transition:border-color 0.2s;"
                       onfocus="this.style.borderColor='#3498db'"
                       onblur="this.style.borderColor='#bdc3c7'">
            </div>

            <!-- Resultatliste -->
            <div id="lagerLookupTableContainer">
                ${this.renderResultsTable(filtered)}
            </div>

            <!-- Generer-knapp (vises kun når minst én artikkel er valgt) -->
            <div id="lagerGenerateBtnContainer" style="margin:16px 0;">
                ${this.selectedLookupItems.size > 0 ? this.renderGenerateButton() : ''}
            </div>

            <!-- Generert lageroversikt -->
            <div id="lagerOverviewContainer"></div>
        `;
    }

    // ════════════════════════════════════════════════════
    //  SØKING OG FILTRERING
    // ════════════════════════════════════════════════════

    /**
     * Filtrer artikler basert på søketerm.
     * Matcher mot: toolsArticleNumber, description, saNumber.
     * @param {UnifiedItem[]} items
     * @param {string} term
     * @returns {UnifiedItem[]}
     */
    static filterItems(items, term) {
        if (!term || term.trim() === '') return items;
        const q = term.toLowerCase().trim();
        return items.filter(item =>
            (item.toolsArticleNumber || '').toLowerCase().includes(q) ||
            (item.description       || '').toLowerCase().includes(q) ||
            (item.saNumber          || '').toLowerCase().includes(q)
        );
    }

    /**
     * Håndter input i søkefeltet.
     * Oppdater kun tabellen — ikke hele modulen — for å bevare inputfokus.
     * @param {string} term
     */
    static handleSearch(term) {
        this.searchTerm = term;
        this.updateTableContent();
    }

    // ════════════════════════════════════════════════════
    //  RESULTATTABELL
    // ════════════════════════════════════════════════════

    /**
     * Render resultattabellen med valgte kolonner og lagerstatus-farger.
     * @param {UnifiedItem[]} items
     * @returns {string} HTML
     */
    static renderResultsTable(items) {
        // Ingen treff
        if (items.length === 0) {
            const msg = this.searchTerm.trim()
                ? 'Ingen artikler funnet'
                : 'Ingen data tilgjengelig';
            return `
                <div class="placeholder-content" style="padding:20px 0;">
                    <p style="color:#7f8c8d;font-size:14px;">${msg}</p>
                </div>`;
        }

        const rows = items.map(item => {
            const stockQty = item.stock       || 0;
            const orderQty = item.bestAntLev  || 0;

            // Lagerstatus-farge (jf. spec)
            let stockClass = 'stock-red';
            if (stockQty > 0) {
                stockClass = 'stock-green';
            } else if (stockQty === 0 && orderQty > 0) {
                stockClass = 'stock-yellow';
            }

            // Bruk data-attributt for å unngå escaping-problemer i onclick
            const artNr       = this.escapeHtml(item.toolsArticleNumber || '');
            const desc        = this.escapeHtml(item.description        || '');
            const lagerplass  = this.escapeHtml(item.location           || item.lagerplass || '');
            const saNum       = this.escapeHtml(item.saNumber           || '');
            const checked     = this.selectedLookupItems.has(item.toolsArticleNumber) ? 'checked' : '';

            return `
                <tr>
                    <td style="width:40px;text-align:center;padding:8px 4px;">
                        <input type="checkbox" ${checked}
                               data-artnr="${artNr}"
                               onchange="LagerLookupMode.handleCheckbox(this.dataset.artnr, this.checked)">
                    </td>
                    <td style="padding:8px;white-space:nowrap;">${artNr}</td>
                    <td style="padding:8px;">${desc}</td>
                    <td class="${stockClass}" style="padding:8px;text-align:right;font-weight:600;">${stockQty}</td>
                    <td style="padding:8px;text-align:right;">${orderQty}</td>
                    <td style="padding:8px;white-space:nowrap;">${lagerplass}</td>
                    <td style="padding:8px;white-space:nowrap;">${saNum}</td>
                </tr>`;
        }).join('');

        return `
            <div style="overflow-x:auto;">
                <table style="width:100%;border-collapse:collapse;font-size:13px;background:#fff;
                              border-radius:6px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.08);">
                    <thead>
                        <tr style="background:#f5f5f5;border-bottom:2px solid #bdc3c7;">
                            <th style="padding:10px 4px;text-align:center;width:40px;"></th>
                            <th style="padding:10px 8px;text-align:left;font-size:12px;text-transform:uppercase;color:#7f8c8d;letter-spacing:0.5px;">Art.nr</th>
                            <th style="padding:10px 8px;text-align:left;font-size:12px;text-transform:uppercase;color:#7f8c8d;letter-spacing:0.5px;">Beskrivelse</th>
                            <th style="padding:10px 8px;text-align:right;font-size:12px;text-transform:uppercase;color:#7f8c8d;letter-spacing:0.5px;">Saldo</th>
                            <th style="padding:10px 8px;text-align:right;font-size:12px;text-transform:uppercase;color:#7f8c8d;letter-spacing:0.5px;">I bestilling</th>
                            <th style="padding:10px 8px;text-align:left;font-size:12px;text-transform:uppercase;color:#7f8c8d;letter-spacing:0.5px;">Lagerplass</th>
                            <th style="padding:10px 8px;text-align:left;font-size:12px;text-transform:uppercase;color:#7f8c8d;letter-spacing:0.5px;">SA-nummer</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${rows}
                    </tbody>
                </table>
            </div>
            <p style="margin-top:6px;font-size:12px;color:#95a5a6;">${items.length.toLocaleString('nb-NO')} artikler vist</p>
        `;
    }

    /**
     * Render "Generer lageroversikt"-knapp.
     * @returns {string} HTML
     */
    static renderGenerateButton() {
        const count = this.selectedLookupItems.size;
        return `
            <button class="btn-primary"
                    onclick="LagerLookupMode.generateOverview()"
                    style="padding:10px 20px;font-size:14px;">
                Generer lageroversikt (${count} valgt)
            </button>`;
    }

    // ════════════════════════════════════════════════════
    //  EVENT HANDLERS
    // ════════════════════════════════════════════════════

    /**
     * Håndter checkbox-endring.
     * Legger artikkelnummer til / fjerner fra selectedLookupItems.
     * @param {string} articleNumber  (toolsArticleNumber)
     * @param {boolean} checked
     */
    static handleCheckbox(articleNumber, checked) {
        if (checked) {
            this.selectedLookupItems.add(articleNumber);
        } else {
            this.selectedLookupItems.delete(articleNumber);
        }
        // Oppdater kun knapp-container (tabell bevares)
        this.updateGenerateButton();
    }

    // ════════════════════════════════════════════════════
    //  MÅLRETTEDE DOM-OPPDATERINGER (uten full re-render)
    // ════════════════════════════════════════════════════

    /**
     * Oppdater kun tabellinnholdet (brukes ved søk).
     */
    static updateTableContent() {
        const container = document.getElementById('lagerLookupTableContainer');
        if (!container || !this.dataStore) return;
        const items   = this.dataStore.getAllItems();
        const filtered = this.filterItems(items, this.searchTerm);
        container.innerHTML = this.renderResultsTable(filtered);
    }

    /**
     * Oppdater kun generer-knapp (brukes ved checkbox-endring).
     */
    static updateGenerateButton() {
        const container = document.getElementById('lagerGenerateBtnContainer');
        if (!container) return;
        container.innerHTML = this.selectedLookupItems.size > 0
            ? this.renderGenerateButton()
            : '';
    }

    // ════════════════════════════════════════════════════
    //  GENERER LAGEROVERSIKT
    // ════════════════════════════════════════════════════

    /**
     * Generer lageroversikt for alle valgte artikler.
     * Resultatet vises under resultatlisten, sortert etter artikkelnummer.
     */
    static generateOverview() {
        if (!this.dataStore || this.selectedLookupItems.size === 0) return;

        // Hent UnifiedItem for hvert valgt artikkelnummer
        const selectedItems = [];
        this.selectedLookupItems.forEach(artNr => {
            const item = this.dataStore.getByToolsArticleNumber(artNr);
            if (item) {
                selectedItems.push(item);
            }
        });

        // Sorter etter artikkelnummer (stigende)
        selectedItems.sort((a, b) =>
            (a.toolsArticleNumber || '').localeCompare(b.toolsArticleNumber || '', 'nb')
        );

        // Lagre for clipboard-bruk
        this._lastGeneratedItems = selectedItems;

        if (selectedItems.length === 0) {
            document.getElementById('lagerOverviewContainer').innerHTML =
                '<p style="color:#e74c3c;margin-top:16px;">Ingen gyldige artikler funnet.</p>';
            return;
        }

        // Bygg tabell-rader
        const rows = selectedItems.map(item => {
            const stockQty = item.stock      || 0;
            const orderQty = item.bestAntLev || 0;
            let stockClass = 'stock-red';
            if (stockQty > 0)                         stockClass = 'stock-green';
            else if (stockQty === 0 && orderQty > 0)  stockClass = 'stock-yellow';

            return `
                <tr>
                    <td style="padding:8px;">${this.escapeHtml(item.toolsArticleNumber || '')}</td>
                    <td class="${stockClass}" style="padding:8px;text-align:right;font-weight:600;">${stockQty}</td>
                    <td style="padding:8px;text-align:right;">${orderQty}</td>
                    <td style="padding:8px;">${this.escapeHtml(item.location || item.lagerplass || '')}</td>
                    <td style="padding:8px;">${this.escapeHtml(item.saNumber || '')}</td>
                </tr>`;
        }).join('');

        const html = `
            <div style="margin-top:24px;border-top:2px solid #bdc3c7;padding-top:20px;">
                <h3 style="margin-bottom:12px;font-size:15px;color:#2c3e50;">
                    Lageroversikt — ${selectedItems.length} artikler
                </h3>
                <div style="overflow-x:auto;">
                    <table style="width:100%;border-collapse:collapse;font-size:13px;background:#fff;
                                  border-radius:6px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.08);">
                        <thead>
                            <tr style="background:#e8f4fd;border-bottom:2px solid #3498db;">
                                <th style="padding:10px 8px;text-align:left;font-size:12px;text-transform:uppercase;color:#2980b9;letter-spacing:0.5px;">Art.nr</th>
                                <th style="padding:10px 8px;text-align:right;font-size:12px;text-transform:uppercase;color:#2980b9;letter-spacing:0.5px;">Saldo</th>
                                <th style="padding:10px 8px;text-align:right;font-size:12px;text-transform:uppercase;color:#2980b9;letter-spacing:0.5px;">I bestilling</th>
                                <th style="padding:10px 8px;text-align:left;font-size:12px;text-transform:uppercase;color:#2980b9;letter-spacing:0.5px;">Lagerplass</th>
                                <th style="padding:10px 8px;text-align:left;font-size:12px;text-transform:uppercase;color:#2980b9;letter-spacing:0.5px;">SA</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${rows}
                        </tbody>
                    </table>
                </div>

                <!-- Kopier til utklippstavle -->
                <div style="margin-top:12px;display:flex;align-items:center;gap:10px;">
                    <button class="btn-secondary"
                            onclick="LagerLookupMode.copyToClipboard()"
                            style="padding:8px 16px;font-size:13px;">
                        Kopier til utklippstavle
                    </button>
                    <span id="lagerCopyStatus"
                          style="font-size:12px;color:#27ae60;display:none;font-weight:600;">
                        Kopiert!
                    </span>
                </div>
            </div>
        `;

        document.getElementById('lagerOverviewContainer').innerHTML = html;
    }

    // ════════════════════════════════════════════════════
    //  KOPIER TIL UTKLIPPSTAVLE
    // ════════════════════════════════════════════════════

    /**
     * Kopier lageroversikten som ren tab-separert tekst til utklippstavlen.
     * Viser toast-notifikasjon og inline "Kopiert!"-tekst ved suksess.
     */
    static copyToClipboard() {
        if (!this._lastGeneratedItems || this._lastGeneratedItems.length === 0) return;

        // Bygg tab-separert tabellformat (kompatibelt med Excel/LibreOffice)
        const header = ['Art.nr', 'Saldo', 'I bestilling', 'Lagerplass', 'SA'].join('\t');
        const rows = this._lastGeneratedItems.map(item =>
            [
                item.toolsArticleNumber || '',
                item.stock      || 0,
                item.bestAntLev || 0,
                item.location   || item.lagerplass || '',
                item.saNumber   || ''
            ].join('\t')
        );
        const text = [header, ...rows].join('\n');

        navigator.clipboard.writeText(text)
            .then(() => {
                // Toast-notifikasjon via app
                this.showToast('Kopiert!', 'success');

                // Inline bekreftelse i UI
                const statusEl = document.getElementById('lagerCopyStatus');
                if (statusEl) {
                    statusEl.style.display = 'inline';
                    setTimeout(() => { statusEl.style.display = 'none'; }, 2500);
                }
            })
            .catch(err => {
                console.error('[LagerLookup] Clipboard write failed:', err);
                this.showToast('Kopiering feilet', 'error');
            });
    }

    // ════════════════════════════════════════════════════
    //  UTILITIES
    // ════════════════════════════════════════════════════

    /**
     * Escape HTML-tegn for sikker innsetting i DOM.
     * Hindrer XSS ved innhold fra dataStore.
     * @param {*} str
     * @returns {string}
     */
    static escapeHtml(str) {
        return String(str)
            .replace(/&/g,  '&amp;')
            .replace(/</g,  '&lt;')
            .replace(/>/g,  '&gt;')
            .replace(/"/g,  '&quot;')
            .replace(/'/g,  '&#39;');
    }

    /**
     * Vis toast-notifikasjon.
     * Gjenbruker app.showToast hvis tilgjengelig.
     * @param {string} message
     * @param {string} type  'success' | 'error' | 'info'
     */
    static showToast(message, type = 'success') {
        if (window.app && typeof window.app.showToast === 'function') {
            window.app.showToast(message, type);
        }
    }
}

// Eksporter til global scope (samme mønster som øvrige moduler)
window.LagerLookupMode = LagerLookupMode;
