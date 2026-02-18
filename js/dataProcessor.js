// ===================================
// DATA PROCESSOR — FASE 6.1
// SA-Nummer.xlsx OPPRETTER items
// Master.xlsx BERIKER items
// Ordrer_Jeeves.xlsx aggregerer salg
// ===================================

/**
 * DataProcessor - Koordinerer dataflyt fra filer til UnifiedDataStore
 *
 * FASE 6.1 PIPELINE ORDER:
 *   1. SA-Nummer.xlsx  → OPPRETTER items (definerer operativt univers)
 *   2. Master.xlsx     → BERIKER: stock, status, incoming, alternatives, kalkylpris
 *   3. Ordrer_Jeeves.xlsx → BERIKER: salgshistorikk, ordredata
 *   4. Analyse_Lagerplan.xlsx → BERIKER: BP, EOK (valgfri)
 *
 * Items som ikke finnes i SA-Nummer.xlsx eksisterer IKKE i dashboardet.
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
        location: 'Lokasjon',

        supplier: 'Företagsnamn',
        category: 'Varugrupp'
    };


    // ── Column variants for Ordrer_Jeeves.xlsx (sales data) ──
    static ORDRER_COLUMN_VARIANTS = {
        articleNumber: [
            'Item ID',
            'Artikelnr', 'Tools art.nr', 'Tools artnr',
            'Artikkelnr', 'Article No', 'ArticleNo', 'ItemNo', 'Varenr'
        ],
        description: [
            'Item',
            'Artikelbeskrivning', 'Artikelbeskrivelse', 'Artikelbeskr',
            'Beskrivelse', 'Description', 'Varebeskrivelse', 'Namn'
        ],
        orderNoOut: [
            'OrderNr', 'Ordrenr', 'Order number', 'OrderNo', 'Ordre'
        ],
        quantityOut: [
            'Delivered quantity',
            'OrdRadAnt', 'Ordreantall', 'Order Qty', 'Quantity', 'Antall'
        ],
        deliveredValue: [
            'Delivered value'
        ],
        invoiceDate: [
            'FaktDat', 'Fakturadato', 'Invoice date', 'Faktureringsdato'
        ],
        customer: [
            'Företagsnamn', 'Kundenavn', 'Customer', 'Kunde', 'Customer Name'
        ],
        deliveryLocation: [
            'Delivery location ID',
            'LevPlFtgKod', 'DH', 'Leveringslager', 'Delivery Warehouse',
            'Leveringssted', 'Del. Warehouse'
        ],
        brand: [
            'Brand', 'Merke', 'Varemerke', 'Merk'
        ],
        supplierId: [
            'Supplier ID', 'SupplierID', 'Leverandør ID', 'LeverandørID',
            'Supplier No', 'SupplierNo', 'Lev.nr', 'LevNr'
        ],
        supplierName: [
            'Supplier', 'Leverandør', 'Leverandørnavn', 'Supplier Name'
        ],
        date: [
            'Dato', 'Date', 'FaktDat', 'BerLevDat'
        ],
        quantity: [
            'Delivered quantity',
            'Antall', 'Quantity', 'Qty', 'OrdRadAnt'
        ],
        orderNo: [
            'OrderNr', 'Ordrenr', 'Order number'
        ]
    };

    // ── Column variants for SA-nummer file (REQUIRED — creates items) ──
    static SA_COLUMN_VARIANTS = {
        articleNumber: [
            'Artikelnr', 'Artikelnummer', 'Tools art.nr', 'Tools artnr',
            'Artikkelnr', 'Article No', 'ArticleNo', 'Varenr'
        ],
        saNummer: [
            'Kunds artikkelnummer', 'Kunds art.nr', 'Kunds artnr',
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

    // ── Column variants for Analyse_Lagerplan.xlsx ──
    static LAGERPLAN_COLUMN_VARIANTS = {
        articleNumber: [
            'Artikelnr', 'Artikelnummer', 'Tools art.nr', 'Tools artnr',
            'Artikkelnr', 'Article No', 'ArticleNo', 'Varenr'
        ],
        bp: [
            'BP', 'Bestillingspunkt', 'Reorder Point', 'Bestillingspkt',
            'Best.pkt', 'BestPkt', 'Reorder', 'Min', 'Minimum'
        ],
        eok: [
            'EOK', 'Ordrekvantitet', 'Order Quantity', 'OrderQty',
            'Bestillingskvantitet', 'Best.kvant', 'BestKvant', 'EOQ'
        ]
    };

    /**
     * Prosesser alle filer og bygg UnifiedDataStore
     *
     * FASE 6.1 PIPELINE:
     *   1. SA-Nummer.xlsx (REQUIRED) → oppretter items
     *   2. Master.xlsx (REQUIRED)    → beriker items
     *   3. Ordrer_Jeeves.xlsx (REQUIRED) → salgsdata
     *   4. Analyse_Lagerplan.xlsx (OPTIONAL) → BP/EOK
     *
     * @param {Object} files - { master: File, ordersOut: File, sa: File, lagerplan?: File }
     * @param {Function} statusCallback
     * @returns {Promise<UnifiedDataStore>}
     */
    static async processAllFiles(files, statusCallback = () => { }) {
        const store = new UnifiedDataStore();

        console.log('========================================');
        console.log('[FASE 6.1] SA-nummer er primærnøkkel');
        console.log('[FASE 6.1] Pipeline: SA → Master → Ordrer → Lagerplan');
        console.log('========================================');

        try {
            // ── FASE 6.1: Validering ──
            console.log('========================================');
            console.log('FASE 6.1: Datavalidering starter');
            console.log('========================================');

            // ── 1. Load and process SA-Nummer.xlsx (REQUIRED — creates items) ──
            if (!files.sa) {
                throw new Error('SA-Nummer.xlsx er påkrevd! Denne filen definerer det operative universet av artikler.');
            }

            statusCallback('Laster SA-Nummer.xlsx (oppretter artikler)...');
            const saData = await this.loadFile(files.sa);
            console.log(`[FASE 6.1] SA-Nummer.xlsx lastet:`);
            console.log(`  Filnavn: ${files.sa.name}`);
            console.log(`  Kolonner (${saData.columns.length}): ${saData.columns.join(', ')}`);
            console.log(`  Rader: ${saData.rowCount}`);

            this.processSAData(saData.data, saData.columns, store);
            const saArticleCount = store.items.size;
            console.log(`[FASE 6.1] SA-Nummer.xlsx prosessert: ${saArticleCount} SA-artikler opprettet`);

            if (saArticleCount === 0) {
                throw new Error('SA-Nummer.xlsx inneholdt ingen gyldige artikler. Sjekk kolonnenavn (trenger "Kunds artikkelnummer" og "Artikelnr").');
            }

            // ── 2. Load and process Master.xlsx (REQUIRED — enrichment) ──
            if (!files.master) {
                throw new Error('Master.xlsx er påkrevd! Last opp Master.xlsx som inneholder all artikkelinformasjon.');
            }

            statusCallback('Laster Master.xlsx (beriker artikler)...');
            const masterData = await this.loadFile(files.master);
            console.log(`[FASE 6.1] Master.xlsx lastet:`);
            console.log(`  Filnavn: ${files.master.name}`);
            console.log(`  Kolonner (${masterData.columns.length}): ${masterData.columns.join(', ')}`);
            console.log(`  Rader: ${masterData.rowCount}`);

            this.processMasterData(masterData.data, masterData.columns, store);
            store.masterRowCount = masterData.rowCount;
            const enrichedFromMaster = store.items.size - store.masterUnmatchedCount;
            console.log(`[FASE 6.1] Master.xlsx prosessert:`);
            console.log(`  Master-rader totalt: ${masterData.rowCount}`);
            console.log(`  Beriket SA-artikler: ${saArticleCount - store.masterUnmatchedCount}`);
            console.log(`  Master-rader uten SA-match (ignorert): ${store.masterUnmatchedCount}`);

            // ── 3. Load and process Ordrer_Jeeves.xlsx (REQUIRED — sales only) ──
            if (!files.ordersOut) {
                throw new Error('Ordrer_Jeeves.xlsx er påkrevd for salgsanalyse.');
            }

            statusCallback('Laster Ordrer_Jeeves.xlsx (salgsdata)...');
            const ordersOutData = await this.loadFile(files.ordersOut);
            console.log(`[FASE 6.1] Ordrer_Jeeves.xlsx lastet:`);
            console.log(`  Filnavn: ${files.ordersOut.name}`);
            console.log(`  Kolonner (${ordersOutData.columns.length}): ${ordersOutData.columns.join(', ')}`);
            console.log(`  Rader: ${ordersOutData.rowCount}`);

            this.processOrdersOutData(ordersOutData.data, store);
            const withSales = store.getAllItems().filter(i => i.outgoingOrders.length > 0).length;
            console.log(`[FASE 6.1] Ordrer_Jeeves.xlsx prosessert:`);
            console.log(`  SA-artikler med salgsdata: ${withSales} av ${saArticleCount} (${Math.round(withSales/saArticleCount*100)}%)`);
            console.log(`  Ordrelinjer uten SA-match (ignorert): ${store.ordersUnmatchedCount}`);

            // ── 4. Load and process Analyse_Lagerplan.xlsx (OPTIONAL — planning params) ──
            if (files.lagerplan) {
                statusCallback('Laster Analyse_Lagerplan.xlsx (planlegging)...');
                try {
                    const lagerplanData = await this.loadFile(files.lagerplan);
                    console.log(`[FASE 6.1] Analyse_Lagerplan.xlsx lastet:`);
                    console.log(`  Filnavn: ${files.lagerplan.name}`);
                    console.log(`  Kolonner (${lagerplanData.columns.length}): ${lagerplanData.columns.join(', ')}`);
                    console.log(`  Rader: ${lagerplanData.rowCount}`);

                    this.processLagerplanData(lagerplanData.data, lagerplanData.columns, store);
                    const withBP = store.getAllItems().filter(i => i.bestillingspunkt !== null).length;
                    const withEOK = store.getAllItems().filter(i => i.ordrekvantitet !== null).length;
                    console.log(`[FASE 6.1] Analyse_Lagerplan.xlsx prosessert:`);
                    console.log(`  SA-artikler med BP: ${withBP} av ${saArticleCount}`);
                    console.log(`  SA-artikler med EOK: ${withEOK} av ${saArticleCount}`);
                } catch (lpError) {
                    console.warn('[FASE 6.1] Analyse_Lagerplan.xlsx kunne ikke prosesseres:', lpError.message);
                    // Lagerplan is optional — do not throw
                }
            } else {
                console.log('[FASE 6.1] Analyse_Lagerplan.xlsx: Ikke lastet (valgfri)');
            }

            // ── 5. Calculate derived values ──
            statusCallback('Beregner verdier...');
            store.calculateAll();

            // ── 6. FASE 6.1 sluttrapport ──
            const quality = store.getDataQualityReport();
            console.log('========================================');
            console.log('FASE 6.1: Datavalidering fullført');
            console.log('========================================');
            console.log(`  SA-artikler (operativt univers): ${quality.totalArticles}`);
            console.log(`  Master-rader totalt: ${store.masterRowCount}`);
            console.log(`  Master-rader uten SA (ignorert): ${store.masterUnmatchedCount}`);
            console.log(`  Ordrelinjer uten SA (ignorert): ${store.ordersUnmatchedCount}`);
            console.log(`  Med innkommende (BestAntLev > 0): ${quality.withIncoming}`);
            console.log(`  Med salgshistorikk: ${quality.withOutgoing}`);
            console.log(`  Med bestillingspunkt (BP): ${store.getAllItems().filter(i => i.bestillingspunkt !== null).length}`);
            console.log(`  Med ordrekvantitet (EOK): ${store.getAllItems().filter(i => i.ordrekvantitet !== null).length}`);
            console.log(`  Med estimert verdi > 0: ${store.getAllItems().filter(i => i.estimertVerdi > 0).length}`);
            console.log('────────────────────────────────────────');
            console.log(`  FASE 6.1: Alle ${quality.totalArticles} items ER SA-artikler`);
            console.log(`  Ingen items uten SA-nummer eksisterer`);
            console.log('────────────────────────────────────────');

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
    //  SA-NUMMER.XLSX PROCESSING — CREATES ITEMS (FASE 6.1)
    // ════════════════════════════════════════════════════

    /**
     * Prosesser SA-nummer fil — OPPRETTER items i store
     *
     * FASE 6.1: SA-Nummer.xlsx definerer det operative universet.
     * Hver rad oppretter en UnifiedItem med saNumber som primærnøkkel
     * og toolsArticleNumber som sekundær koblingsnøkkel.
     *
     * @param {Array} data - Parsed rows from SA file
     * @param {string[]} columns - Column headers from SA file
     * @param {UnifiedDataStore} store - Data store (initially empty)
     */
    static processSAData(data, columns, store) {
        if (!data || data.length === 0) {
            throw new Error('SA-Nummer.xlsx er tom — ingen artikler kan opprettes.');
        }

        let createdCount = 0;
        let skippedCount = 0;
        let duplicateCount = 0;

        data.forEach(row => {
            const toolsArticleNo = this.getSAColumnValue(row, columns, 'articleNumber');
            const saNumber = this.getSAColumnValue(row, columns, 'saNummer');

            if (!saNumber) {
                skippedCount++;
                return;
            }

            // Opprett item via store (handles dedup)
            const existedBefore = store.items.has(saNumber.toString().trim());
            const item = store.createFromSA(saNumber, toolsArticleNo);

            if (!item) {
                skippedCount++;
                return;
            }

            if (existedBefore) {
                duplicateCount++;
            } else {
                createdCount++;
            }

            // Apply SA agreement data
            const saData = {
                saType: this.getSAColumnValue(row, columns, 'saType'),
                saGyldigFra: this.parseDate(this.getSAColumnValue(row, columns, 'gyldigFra')),
                saGyldigTil: this.parseDate(this.getSAColumnValue(row, columns, 'gyldigTil'))
            };
            item.setSAData(saData);
        });

        console.log(`[FASE 6.1] SA-nummer resultat:`);
        console.log(`  Opprettet: ${createdCount} SA-artikler`);
        if (duplicateCount > 0) {
            console.log(`  Duplikater (sammenslått): ${duplicateCount}`);
        }
        if (skippedCount > 0) {
            console.log(`  Hoppet over (mangler SA-nr): ${skippedCount}`);
        }
    }

    /**
     * Get value from SA file row using flexible column matching
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
    //  MASTER.XLSX PROCESSING — ENRICHMENT ONLY (FASE 6.1)
    // ════════════════════════════════════════════════════

    /**
     * Prosesser Master.xlsx — BERIKER eksisterende SA-artikler
     *
     * FASE 6.1: Master.xlsx oppretter IKKE nye items.
     * Slår opp via toolsArticleNumber → saNumber (reverse lookup).
     * Rader uten SA-match logges og ignoreres.
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
        let unmatchedCount = 0;
        let incomingCount = 0;
        let alternativeCount = 0;
        let selfRefSkipped = 0;

        data.forEach(row => {
            const articleNo = this.getMasterValue(row, colMap.articleNumber);
            if (!articleNo) return;

            // FASE 6.1: Slå opp via toolsArticleNumber
            const item = store.getByToolsArticleNumber(articleNo);
            if (!item) {
                // Master-rad uten SA-nummer — lagre i masterOnlyArticles for alt-oppslag
                unmatchedCount++;

                // FASE 2.2: Lagre basisdata for alternative-lookups
                const rawStatus = this.getMasterValue(row, colMap.articleStatus) || '';
                const normalizedStatus = normalizeItemStatus(rawStatus);
                const isDisc = normalizedStatus === 'UTGAENDE' || normalizedStatus === 'UTGAATT' ||
                    rawStatus.toLowerCase().includes('utgå') || rawStatus.toLowerCase().includes('discontinued');

                store.masterOnlyArticles.set(articleNo, {
                    toolsArticleNumber: articleNo,
                    description: this.getMasterValue(row, colMap.description) || '',
                    stock: this.parseNumber(this.getMasterValue(row, colMap.totalStock)),
                    bestAntLev: this.parseNumber(this.getMasterValue(row, colMap.orderedQty)),
                    kalkylPris: this.parseNumber(this.getMasterValue(row, colMap.kalkylPris)),
                    supplier: this.getMasterValue(row, colMap.supplier) || null,
                    statusText: rawStatus,
                    _status: normalizedStatus,
                    isDiscontinued: isDisc,
                    brand: null,
                    supplierId: null
                });
                return;
            }

            processedCount++;

            // ── Article identity ──
            item.description = this.getMasterValue(row, colMap.description) || item.description;
            item.location = this.getMasterValue(row, colMap.location) || '';
            item.supplier = this.getMasterValue(row, colMap.supplier) || item.supplier || '';
            item.category = this.getMasterValue(row, colMap.category) || item.category || '';

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

            item.ersattAvArtikel = ersattAv.trim();

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

        // Record unmatched count for diagnostics
        store.masterUnmatchedCount = unmatchedCount;

        console.log(`[FASE 6.1] Master.xlsx resultat:`);
        console.log(`  SA-artikler beriket: ${processedCount}`);
        console.log(`  Master-rader uten SA-match: ${unmatchedCount} (lagret i masterOnlyArticles for alt-oppslag)`);
        console.log(`  Med innkommende (BestAntLev > 0): ${incomingCount}`);
        console.log(`  Med alternativ (Ersätts av artikel): ${alternativeCount}`);
        if (selfRefSkipped > 0) {
            console.log(`  Selv-referanser ignorert: ${selfRefSkipped}`);
        }
    }

    // Columns that are enrichment-only and should not block processing if missing
    static MASTER_OPTIONAL_COLUMNS = new Set(['supplier', 'category']);

    /**
     * Resolve Master.xlsx column names with case-insensitive matching.
     * Fails loudly if any required column is missing.
     * Optional columns (supplier, category) log a warning instead.
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
            } else if (this.MASTER_OPTIONAL_COLUMNS.has(logical)) {
                console.warn(`Master.xlsx: Valgfri kolonne "${expected}" (${logical}) ikke funnet — hopper over`);
                result[logical] = null;
            } else {
                missing.push(`"${expected}" (${logical})`);
            }
        }

        if (missing.length > 0) {
            const errorMsg = `Master.xlsx: Følgende påkrevde kolonner mangler!\n` +
                `  Mangler: ${missing.join(', ')}\n` +
                `  Tilgjengelige kolonner: ${columns.join(', ')}\n` +
                `  ALLE påkrevde kolonner i Master.xlsx mangler. Ingen fallback tillatt.`;
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
    //  ORDRER_JEEVES.XLSX PROCESSING — ENRICHMENT ONLY (FASE 6.1)
    // ════════════════════════════════════════════════════

    /**
     * Prosesser fakturert UT / Ordrer (Ordrer_Jeeves.xlsx)
     *
     * FASE 6.1: Slår opp via toolsArticleNumber → saNumber.
     * Ordrelinjer uten SA-match ignoreres (logges som info).
     */
    static processOrdersOutData(data, store) {
        let joinedCount = 0;
        let unmatchedCount = 0;

        data.forEach(row => {
            const articleNo = this.getColumnValue(row, 'articleNumber');
            if (!articleNo) return;

            // Hent Brand/SupplierID fra ordrelinje (kan være tom)
            const rowBrand = this.getColumnValue(row, 'brand') || null;
            const rowSupplierId = this.getColumnValue(row, 'supplierId') || null;
            const rowSupplierName = this.getColumnValue(row, 'supplierName') || null;

            // FASE 6.1: Slå opp via toolsArticleNumber
            const item = store.getByToolsArticleNumber(articleNo);
            if (!item) {
                unmatchedCount++;

                // Berik masterOnlyArticles med Brand/SupplierID fra ordrelinjer
                const masterOnly = store.masterOnlyArticles.get(articleNo.toString().trim());
                if (masterOnly) {
                    if (rowBrand && !masterOnly.brand) masterOnly.brand = rowBrand.toString().trim();
                    if (rowSupplierId && !masterOnly.supplierId) masterOnly.supplierId = rowSupplierId.toString().trim();
                    if (rowSupplierName && !masterOnly.supplier) masterOnly.supplier = rowSupplierName.toString().trim();
                }
                return;
            }

            // Oppdater Brand/SupplierID på UnifiedItem (første verdi vinner)
            if (rowBrand && !item.brand) item.brand = rowBrand.toString().trim();
            if (rowSupplierId && !item.supplierId) item.supplierId = rowSupplierId.toString().trim();

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

        // Record unmatched count for diagnostics
        store.ordersUnmatchedCount = unmatchedCount;

        console.log(`[FASE 6.1] Ordrer_Jeeves.xlsx: ${joinedCount} salgslinjer koblet til SA-artikler`);
        if (unmatchedCount > 0) {
            console.log(`  Ordrelinjer uten SA-match (ignorert): ${unmatchedCount}`);
        }
    }

    // ════════════════════════════════════════════════════
    //  ANALYSE_LAGERPLAN.XLSX — ENRICHMENT ONLY (FASE 6.1)
    // ════════════════════════════════════════════════════

    /**
     * Prosesser Analyse_Lagerplan.xlsx — planleggingsparametre
     *
     * FASE 6.1: Slår opp via toolsArticleNumber → saNumber.
     * Rader uten SA-match ignoreres.
     */
    static processLagerplanData(data, columns, store) {
        if (!data || data.length === 0) {
            console.warn('Analyse_Lagerplan.xlsx er tom');
            return;
        }

        let matchedCount = 0;
        let unmatchedCount = 0;
        let bpCount = 0;
        let eokCount = 0;

        data.forEach(row => {
            const articleNo = this.getLagerplanColumnValue(row, columns, 'articleNumber');
            if (!articleNo) return;

            // FASE 6.1: Slå opp via toolsArticleNumber
            const item = store.getByToolsArticleNumber(articleNo.toString().trim());

            if (!item) {
                unmatchedCount++;
                return;
            }

            matchedCount++;

            // BP → bestillingspunkt (kun hvis verdi finnes)
            const bpRaw = this.getLagerplanColumnValue(row, columns, 'bp');
            if (bpRaw !== '' && bpRaw !== null && bpRaw !== undefined) {
                const bpVal = this.parseNumber(bpRaw);
                if (bpVal > 0) {
                    item.bestillingspunkt = bpVal;
                    bpCount++;
                }
            }

            // EOK → ordrekvantitet (kun hvis verdi finnes)
            const eokRaw = this.getLagerplanColumnValue(row, columns, 'eok');
            if (eokRaw !== '' && eokRaw !== null && eokRaw !== undefined) {
                const eokVal = this.parseNumber(eokRaw);
                if (eokVal > 0) {
                    item.ordrekvantitet = eokVal;
                    eokCount++;
                }
            }
        });

        console.log(`[FASE 6.1] Analyse_Lagerplan.xlsx resultat:`);
        console.log(`  Matchet mot SA-artikler: ${matchedCount}`);
        console.log(`  Med BP-verdi: ${bpCount}`);
        console.log(`  Med EOK-verdi: ${eokCount}`);
        if (unmatchedCount > 0) {
            console.log(`  Ikke matchet (ignorert): ${unmatchedCount}`);
        }
    }

    /**
     * Get value from Lagerplan file row using flexible column matching
     */
    static getLagerplanColumnValue(row, columns, fieldName) {
        const variants = this.LAGERPLAN_COLUMN_VARIANTS[fieldName] || [fieldName];
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

                // Delvis match (krev minst 4 tegn for å unngå falske treff
                // som "Item" → "ItemNo" → ville returnert beskrivelse som artikkelnr)
                for (const key of keys) {
                    const lowerKey = key.toLowerCase();
                    if (lowerKey.length >= 4 && lowerVariant.length >= 4 &&
                        (lowerKey.includes(lowerVariant) || lowerVariant.includes(lowerKey))) {
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
