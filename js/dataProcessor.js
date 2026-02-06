// ===================================
// DATA PROCESSOR
// Master.xlsx er SINGLE SOURCE OF TRUTH
// Ordrer_Jeeves.xlsx brukes KUN for salg/etterspørsel
// ===================================

/**
 * DataProcessor - Koordinerer dataflyt fra filer til UnifiedDataStore
 *
 * ARCHITECTURE DECISION (LOCKED):
 *   Master.xlsx  → article identity, status, stock, reserved, available,
 *                  incoming orders (BestAntLev), alternatives (Ersätts av artikel)
 *   Ordrer_Jeeves.xlsx → sales history, demand patterns, top sellers
 *
 * OPTIONAL enrichment files:
 *   SA-nummer.xlsx → SA-number enrichment (merged into UnifiedItem)
 *
 * DEPRECATED files (NOT used):
 *   - Lagerbeholdning_Jeeves.xlsx
 *   - Bestillinger_Jeeves.xlsx
 *   - artikkelstatus.xlsx
 *   - Alternativ_artikkel_Jeeves.xlsx
 */
class DataProcessor {

    // ── Hard-bound Master.xlsx column names (NO autodetection) ──
    static MASTER_COLUMNS = {
        articleNumber: 'Artikelnr',
        description: 'Artikelbeskrivning',
        articleStatus: 'Artikelstatus',
        totalStock: 'TotLagSaldo',
        availableStock: 'DispLagSaldo',
        reserved: 'ReservAnt',

        kalkylPris: 'Kalkylpris bas',

        orderedQty: 'BestAntLev',
        orderNumber: 'Beställningsnummer',
        replacedBy: 'Ersätts av artikel',
        replaces: 'Ersätter artikel',
        location: 'Lokasjon'
    };


    // ── Column variants for Ordrer_Jeeves.xlsx (sales data) ──
    static ORDRER_COLUMN_VARIANTS = {
        articleNumber: [
            'Artikelnr', 'Tools art.nr', 'Tools artnr',
            'Artikkelnr', 'Article No', 'ArticleNo', 'ItemNo', 'Varenr'
        ],
        description: [
            'Artikelbeskrivning', 'Artikelbeskrivelse', 'Artikelbeskr',
            'Beskrivelse', 'Description', 'Varebeskrivelse', 'Namn'
        ],
        orderNoOut: [
            'OrderNr', 'Ordrenr', 'Order number', 'OrderNo', 'Ordre'
        ],
        quantityOut: [
            'OrdRadAnt', 'Ordreantall', 'Order Qty', 'Quantity', 'Antall'
        ],
        invoiceDate: [
            'FaktDat', 'Fakturadato', 'Invoice date', 'Faktureringsdato'
        ],
        customer: [
            'Företagsnamn', 'Kundenavn', 'Customer', 'Kunde', 'Customer Name'
        ],
        deliveryLocation: [
            'LevPlFtgKod', 'DH', 'Leveringslager', 'Delivery Warehouse',
            'Leveringssted', 'Del. Warehouse'
        ],
        date: [
            'Dato', 'Date', 'FaktDat', 'BerLevDat'
        ],
        quantity: [
            'Antall', 'Quantity', 'Qty', 'OrdRadAnt'
        ],
        orderNo: [
            'OrderNr', 'Ordrenr', 'Order number'
        ]
    };

    // ── Column variants for SA-nummer file (optional enrichment) ──
    static SA_COLUMN_VARIANTS = {
        articleNumber: [
            'Artikelnr', 'Artikelnummer', 'Tools art.nr', 'Tools artnr',
            'Artikkelnr', 'Article No', 'ArticleNo', 'Varenr'
        ],
        saNummer: [
            'SA-nummer', 'SA nummer', 'SA Number', 'SA-nr', 'SAnummer',
            'SA', 'SAnr', 'SA-Nummer'
        ],
        saType: [
            'SA-type', 'SA type', 'SAtype', 'Type', 'Avtaletype'
        ],
        gyldigFra: [
            'Gyldig fra', 'GyldigFra', 'Valid from', 'Fra dato', 'Startdato',
            'Fra', 'Start'
        ],
        gyldigTil: [
            'Gyldig til', 'GyldigTil', 'Valid to', 'Til dato', 'Sluttdato',
            'Til', 'Slutt'
        ]
    };

    /**
     * Prosesser alle filer og bygg UnifiedDataStore
     *
     * Input:
     *   files.master    → Master.xlsx   (REQUIRED)
     *   files.ordersOut → Ordrer_Jeeves.xlsx (REQUIRED)
     *   files.sa        → SA-nummer.xlsx (OPTIONAL)
     *
     * @param {Object} files - { master: File, ordersOut: File, sa?: File }
     * @param {Function} statusCallback
     * @returns {Promise<UnifiedDataStore>}
     */
    static async processAllFiles(files, statusCallback = () => { }) {
        const store = new UnifiedDataStore();

        console.log('========================================');
        console.log('Master.xlsx is used as the single source of truth');
        console.log('========================================');

        try {
            // ── 1. Load and process Master.xlsx (REQUIRED) ──
            if (!files.master) {
                throw new Error('Master.xlsx er påkrevd! Last opp Master.xlsx som inneholder all artikkelinformasjon.');
            }

            statusCallback('Laster Master.xlsx...');
            const masterData = await this.loadFile(files.master);
            console.log('Master.xlsx kolonner:', masterData.columns);
            console.log(`Master.xlsx rader: ${masterData.rowCount}`);

            this.processMasterData(masterData.data, masterData.columns, store);
            console.log(`Master.xlsx prosessert: ${store.items.size} artikler`);

            // ── 2. Load and process Ordrer_Jeeves.xlsx (REQUIRED — sales only) ──
            if (!files.ordersOut) {
                throw new Error('Ordrer_Jeeves.xlsx er påkrevd for salgsanalyse.');
            }

            statusCallback('Laster Ordrer_Jeeves.xlsx (salgsdata)...');
            const ordersOutData = await this.loadFile(files.ordersOut);
            console.log('Ordrer_Jeeves.xlsx kolonner:', ordersOutData.columns);
            console.log(`Ordrer_Jeeves.xlsx rader: ${ordersOutData.rowCount}`);

            this.processOrdersOutData(ordersOutData.data, store);
            console.log('Ordrer_Jeeves.xlsx prosessert (sales/demand)');

            // ── 3. Load and process SA-nummer file (OPTIONAL enrichment) ──
            if (files.sa) {
                statusCallback('Laster SA-nummer fil...');
                try {
                    const saData = await this.loadFile(files.sa);
                    console.log('SA-nummer fil kolonner:', saData.columns);
                    console.log(`SA-nummer fil rader: ${saData.rowCount}`);

                    this.processSAData(saData.data, saData.columns, store);
                    console.log('SA-nummer fil prosessert (enrichment)');
                } catch (saError) {
                    console.warn('SA-nummer fil kunne ikke prosesseres:', saError.message);
                    // SA file is optional — do not throw
                }
            }

            // ── 4. Calculate derived values ──
            statusCallback('Beregner verdier...');
            store.calculateAll();

            // ── 5. Log data quality ──
            const quality = store.getDataQualityReport();
            console.log('Datakvalitet:', quality);
            console.log(`  Artikler totalt: ${quality.totalArticles}`);
            console.log(`  Med innkommende (BestAntLev > 0): ${quality.withIncoming}`);
            console.log(`  Med salgshistorikk: ${quality.withOutgoing}`);
            console.log('Master.xlsx is used as the single source of truth');

            return store;

        } catch (error) {
            console.error('Feil ved prosessering:', error);
            throw error;
        }
    }

    /**
     * Last fil (CSV eller Excel)
     */
    static async loadFile(file) {
        const fileName = file.name.toLowerCase();

        if (fileName.endsWith('.csv')) {
            return await DataLoader.loadCSV(file);
        } else if (fileName.endsWith('.xlsx') || fileName.endsWith('.xls')) {
            return await DataLoader.loadExcel(file);
        } else {
            throw new Error(`Ugyldig filformat: ${file.name}. Kun CSV og XLSX støttes.`);
        }
    }

    // ════════════════════════════════════════════════════
    //  MASTER.XLSX PROCESSING — HARD-BOUND COLUMNS
    // ════════════════════════════════════════════════════

    /**
     * Prosesser Master.xlsx — SINGLE SOURCE OF TRUTH
     *
     * Hard-bound columns (NO autodetection):
     *   Artikelnr           → toolsArticleNumber (primary key)
     *   Artikelbeskrivning  → description
     *   Artikelstatus       → status / _status / isDiscontinued
     *   TotLagSaldo         → stock
     *   DispLagSaldo        → available
     *   ReservAnt           → reserved
     *   BestAntLev          → bestAntLev (incoming orders)
     *   Beställningsnummer  → bestillingsNummer
     *   Ersätts av artikel  → ersattAvArtikel (alternative/replacement)
     *   Ersätter artikel    → ersatterArtikel
     *   Lokasjon            → location
     *
     * If a column is missing → FAIL LOUDLY with clear error.
     */
    static processMasterData(data, columns, store) {
        if (!data || data.length === 0) {
            throw new Error('Master.xlsx inneholder ingen data!');
        }

        // ── Resolve actual header names (case-insensitive) ──
        const colMap = this.resolveMasterColumns(columns);

        console.log('=== Master.xlsx: Hard-bound kolonnemapping ===');
        for (const [logical, actual] of Object.entries(colMap)) {
            console.log(`  ${logical} → "${actual}"`);
        }

        // ── Build alternative articles mapping ──
        if (!store.alternativeArticles) {
            store.alternativeArticles = new Map();
        }

        let processedCount = 0;
        let incomingCount = 0;
        let alternativeCount = 0;
        let selfRefSkipped = 0;

        data.forEach(row => {
            const articleNo = this.getMasterValue(row, colMap.articleNumber);
            if (!articleNo) return;

            const item = store.getOrCreate(articleNo);
            if (!item) return;

            processedCount++;

            // ── Article identity ──
            item.description = this.getMasterValue(row, colMap.description) || item.description;
            item.location = this.getMasterValue(row, colMap.location) || '';
            item.shelf = item.location;

            // ── Artikelstatus → status + _status + isDiscontinued ──
            const rawStatus = this.getMasterValue(row, colMap.articleStatus) || '';
            item.status = rawStatus;
            item._status = normalizeItemStatus(rawStatus);
            item.statusText = rawStatus;

            if (item._status === 'UTGAENDE' || item._status === 'UTGAATT') {
                item.isDiscontinued = true;
            } else {
                // Also check for text patterns
                const lowerStatus = rawStatus.toLowerCase();
                if (lowerStatus.includes('utgå') || lowerStatus.includes('discontinued') ||
                    lowerStatus.includes('avvikle') || lowerStatus.includes('utgående')) {
                    item.isDiscontinued = true;
                    if (item._status === 'AKTIV' || item._status === 'UKJENT') {
                        item._status = 'UTGAENDE';
                    }
                }
            }

            // ── Stock levels from Master ──
            item.stock = this.parseNumber(this.getMasterValue(row, colMap.totalStock));
            item.available = this.parseNumber(this.getMasterValue(row, colMap.availableStock));
            item.reserved = this.parseNumber(this.getMasterValue(row, colMap.reserved));
            // ── Kalkylepris from Master ──
            item.kalkylPris = this.parseNumber(
                this.getMasterValue(row, colMap.kalkylPris)
            );


            // ── Incoming orders from Master ──
            const bestAntLev = this.parseNumber(this.getMasterValue(row, colMap.orderedQty));
            item.bestAntLev = bestAntLev;
            item.bestillingsNummer = this.getMasterValue(row, colMap.orderNumber) || '';

            if (bestAntLev > 0) {
                incomingCount++;
                item.hasIncomingOrders = true;
                // Create a synthetic incoming order for backward compat
                item.addIncomingOrder({
                    orderNo: item.bestillingsNummer,
                    quantity: bestAntLev,
                    expectedDate: null,
                    supplier: '',
                    status: 'Åpen'
                });
            }

            // ── Alternatives from Master ──
            const ersattAv = this.getMasterValue(row, colMap.replacedBy) || '';
            const ersatter = this.getMasterValue(row, colMap.replaces) || '';

            item.ersattAvArtikel = ersattAv.trim();
            item.ersatterArtikel = ersatter.trim();

            // Build alternative mapping: source → [{altArticle}]
            if (ersattAv.trim() && ersattAv.trim() !== articleNo) {
                if (!store.alternativeArticles.has(articleNo)) {
                    store.alternativeArticles.set(articleNo, []);
                }
                store.alternativeArticles.get(articleNo).push({
                    altArticle: ersattAv.trim()
                });
                alternativeCount++;
            } else if (ersattAv.trim() && ersattAv.trim() === articleNo) {
                selfRefSkipped++;
            }

            // ── Compute available if missing ──
            if (item.available === 0 && item.stock > 0) {
                item.available = item.stock - item.reserved;
            }
        });

        console.log(`Master.xlsx resultat:`);
        console.log(`  Artikler prosessert: ${processedCount}`);
        console.log(`  Med innkommende (BestAntLev > 0): ${incomingCount}`);
        console.log(`  Med alternativ (Ersätts av artikel): ${alternativeCount}`);
        if (selfRefSkipped > 0) {
            console.log(`  Selv-referanser ignorert: ${selfRefSkipped}`);
        }
    }

    /**
     * Resolve Master.xlsx column names with case-insensitive matching.
     * Fails loudly if any required column is missing.
     *
     * @param {string[]} columns - Actual column headers from file
     * @returns {Object} Map of logical name → actual column name
     */
    static resolveMasterColumns(columns) {
        const result = {};
        const missing = [];

        for (const [logical, expected] of Object.entries(this.MASTER_COLUMNS)) {
            // Case-insensitive exact match
            const actual = columns.find(c =>
                c.trim().toLowerCase() === expected.toLowerCase()
            );

            if (actual) {
                result[logical] = actual;
            } else {
                missing.push(`"${expected}" (${logical})`);
            }
        }

        if (missing.length > 0) {
            const errorMsg = `Master.xlsx: Følgende påkrevde kolonner mangler!\n` +
                `  Mangler: ${missing.join(', ')}\n` +
                `  Tilgjengelige kolonner: ${columns.join(', ')}\n` +
                `  ALLE kolonner i Master.xlsx er påkrevd. Ingen fallback tillatt.`;
            console.error(errorMsg);
            throw new Error(errorMsg);
        }

        return result;
    }

    /**
     * Get value from a row using the resolved column name
     */
    static getMasterValue(row, columnName) {
        if (!columnName) return '';
        const val = row[columnName];
        if (val === undefined || val === null) return '';
        return val.toString().trim();
    }

    // ════════════════════════════════════════════════════
    //  ORDRER_JEEVES.XLSX PROCESSING — SALES / DEMAND ONLY
    // ════════════════════════════════════════════════════

    /**
     * Prosesser fakturert UT / Ordrer (Ordrer_Jeeves.xlsx)
     *
     * Used ONLY for: sales history, demand patterns, top sellers, frequency analysis
     *
     * JOIN RULE: Ordrer_Jeeves.Artikelnr === Master.Artikelnr
     *
     * Jeeves-kolonner:
     *   Artikelnr      → toolsArticleNumber (join key)
     *   OrderNr        → orderNo
     *   OrdRadAnt      → quantity
     *   FaktDat        → deliveryDate
     *   Företagsnamn   → customer
     *   LevPlFtgKod    → deliveryLocation
     */
    static processOrdersOutData(data, store) {
        let joinedCount = 0;
        let unmatchedCount = 0;

        data.forEach(row => {
            const articleNo = this.getColumnValue(row, 'articleNumber');
            if (!articleNo) return;

            const item = store.getOrCreate(articleNo);
            if (!item) return;

            // Oppdater beskrivelse hvis tom
            if (!item.description) {
                item.description = this.getColumnValue(row, 'description');
            }

            // Hent mengde (Jeeves: OrdRadAnt)
            const quantity = this.parseNumber(
                this.getColumnValue(row, 'quantityOut') || this.getColumnValue(row, 'quantity')
            );

            // Hopp over rader uten mengde
            if (quantity <= 0) return;

            joinedCount++;

            // Legg til salgsordre
            item.addOutgoingOrder({
                orderNo: this.getColumnValue(row, 'orderNoOut') || this.getColumnValue(row, 'orderNo'),
                quantity: quantity,
                deliveryDate: this.parseDate(
                    this.getColumnValue(row, 'invoiceDate') || this.getColumnValue(row, 'date')
                ),
                customer: this.getColumnValue(row, 'customer'),
                deliveryLocation: this.getColumnValue(row, 'deliveryLocation'),
                invoiceNo: null
            });
        });

        console.log(`Ordrer_Jeeves.xlsx: ${joinedCount} salgslinjer prosessert`);
        if (unmatchedCount > 0) {
            console.log(`  Ikke matchet mot Master: ${unmatchedCount}`);
        }
    }

    // ════════════════════════════════════════════════════
    //  SA-NUMMER FILE PROCESSING — OPTIONAL ENRICHMENT
    // ════════════════════════════════════════════════════

    /**
     * Prosesser SA-nummer fil — ADDITIVE enrichment only
     *
     * Merges SA data INTO existing UnifiedItem instances.
     * Does NOT create new items. Does NOT overwrite Master data.
     *
     * JOIN KEY: Artikelnr (toolsArticleNumber)
     *
     * @param {Array} data - Parsed rows from SA file
     * @param {string[]} columns - Column headers from SA file
     * @param {UnifiedDataStore} store - Data store with existing items
     */
    static processSAData(data, columns, store) {
        if (!data || data.length === 0) {
            console.warn('SA-nummer fil er tom');
            return;
        }

        let matchedCount = 0;
        let unmatchedCount = 0;

        data.forEach(row => {
            const articleNo = this.getSAColumnValue(row, columns, 'articleNumber');
            if (!articleNo) return;

            const key = articleNo.toString().trim();
            const item = store.items.get(key);

            if (!item) {
                // Item does not exist in Master — ignore silently
                unmatchedCount++;
                return;
            }

            matchedCount++;

            // Build SA data object
            const saData = {
                saNummer: this.getSAColumnValue(row, columns, 'saNummer'),
                saType: this.getSAColumnValue(row, columns, 'saType'),
                saGyldigFra: this.parseDate(this.getSAColumnValue(row, columns, 'gyldigFra')),
                saGyldigTil: this.parseDate(this.getSAColumnValue(row, columns, 'gyldigTil'))
            };

            // Apply SA data to existing item (additive)
            item.setSAData(saData);

            // Also update the SA mapping in the store
            if (saData.saNummer) {
                store.setSAMapping(key, saData.saNummer);
            }
        });

        console.log(`SA-nummer resultat:`);
        console.log(`  Matchet mot Master: ${matchedCount}`);
        if (unmatchedCount > 0) {
            console.log(`  Ikke matchet (ignorert): ${unmatchedCount}`);
        }
    }

    /**
     * Get value from SA file row using flexible column matching
     *
     * @param {Object} row - Data row
     * @param {string[]} columns - Available column headers
     * @param {string} fieldName - Logical field name from SA_COLUMN_VARIANTS
     * @returns {string} Value or empty string
     */
    static getSAColumnValue(row, columns, fieldName) {
        const variants = this.SA_COLUMN_VARIANTS[fieldName] || [fieldName];
        const keys = Object.keys(row);

        for (const variant of variants) {
            // Exact match
            if (row[variant] !== undefined && row[variant] !== null && row[variant] !== '') {
                return row[variant].toString().trim();
            }

            // Case-insensitive match
            const lowerVariant = variant.toLowerCase().trim();
            for (const key of keys) {
                if (key.toLowerCase().trim() === lowerVariant) {
                    if (row[key] !== undefined && row[key] !== null && row[key] !== '') {
                        return row[key].toString().trim();
                    }
                }
            }
        }

        return '';
    }

    // ════════════════════════════════════════════════════
    //  UTILITY METHODS
    // ════════════════════════════════════════════════════

    /**
     * Finn kolonneverdi med fleksibel matching (for Ordrer_Jeeves.xlsx)
     */
    static getColumnValue(row, ...columnTypes) {
        const keys = Object.keys(row);

        for (const columnType of columnTypes) {
            const variants = this.ORDRER_COLUMN_VARIANTS[columnType] || [columnType];

            for (const variant of variants) {
                // Eksakt match
                if (row[variant] !== undefined && row[variant] !== null && row[variant] !== '') {
                    return row[variant];
                }

                // Case-insensitive match
                const lowerVariant = variant.toLowerCase().trim();
                for (const key of keys) {
                    if (key.toLowerCase().trim() === lowerVariant) {
                        if (row[key] !== undefined && row[key] !== null && row[key] !== '') {
                            return row[key];
                        }
                    }
                }

                // Delvis match
                for (const key of keys) {
                    const lowerKey = key.toLowerCase();
                    if (lowerKey.includes(lowerVariant) || lowerVariant.includes(lowerKey)) {
                        if (row[key] !== undefined && row[key] !== null && row[key] !== '') {
                            return row[key];
                        }
                    }
                }
            }
        }

        return '';
    }

    /**
     * Parse numerisk verdi (håndterer norsk format)
     */
    static parseNumber(value) {
        if (value === null || value === undefined || value === '') {
            return 0;
        }

        if (typeof value === 'number') {
            return isNaN(value) ? 0 : value;
        }

        let str = value.toString().trim();
        str = str.replace(/\s/g, '');

        if (str.includes(',') && str.includes('.')) {
            str = str.replace(/\./g, '').replace(',', '.');
        } else if (str.includes(',')) {
            str = str.replace(',', '.');
        }

        const num = parseFloat(str);
        return isNaN(num) ? 0 : num;
    }

    /**
     * Parse dato (håndterer flere formater)
     */
    static parseDate(value) {
        if (!value) return null;

        if (value instanceof Date) {
            return isNaN(value.getTime()) ? null : value;
        }

        if (typeof DataLoader !== 'undefined' && DataLoader.parseDate) {
            return DataLoader.parseDate(value);
        }

        const str = value.toString().trim();

        let date = new Date(str);
        if (!isNaN(date.getTime())) return date;

        const ddmmyyyy = str.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
        if (ddmmyyyy) {
            return new Date(ddmmyyyy[3], ddmmyyyy[2] - 1, ddmmyyyy[1]);
        }

        const slashFormat = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
        if (slashFormat) {
            return new Date(slashFormat[3], slashFormat[2] - 1, slashFormat[1]);
        }

        return null;
    }
}

// Eksporter til global scope
window.DataProcessor = DataProcessor;
