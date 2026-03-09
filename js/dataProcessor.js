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

    // ── Master.xlsx column variants (case-insensitive, first match wins) ──
    // Replaces hard-bound MASTER_COLUMNS to handle minor header changes in exports.
    static MASTER_COLUMN_VARIANTS = {
        articleNumber:  ['Artikelnr', 'Item ID', 'VareNr', 'Artikkelnr',
                         'Article No', 'ArticleNo', 'Tools art.nr', 'Tools artnr'],
        description:    ['Artikelbeskrivning', 'Item', 'Artikelbeskrivelse',
                         'Beskrivelse', 'Description', 'Artikelbeskr'],
        articleStatus:  ['Artikelstatus', 'Item status', 'Artikkelstatus', 'Status'],
        totalStock:     ['TotLagSaldo', 'Lagersaldo', 'Stock', 'Saldo'],
        availableStock: ['DispLagSaldo', 'Available', 'Disponibelt', 'Disp. Lagsaldo'],
        reserved:       ['ReservAnt', 'Reserved', 'Reserverat', 'Reservert'],
        kalkylPris:     ['Kalkylpris bas', 'Beräknat kalkylpris', 'Calc price',
                         'Kalkylpris', 'Kalkyle pris'],
        orderedQty:     ['BestAntLev', 'On order', 'I bestilling', 'Bestilt ant.',
                         'BestAnt', 'Ordered Qty'],
        orderNumber:    ['Beställningsnummer', 'Order No', 'Ordrenr', 'Bestillingsnr'],
        replacedBy:     ['Ersätts av artikel', 'Ersatts av artnr', 'ErsattsAvArtNr',
                         'ReplacedBy', 'Replaced by'],
        location:       ['Lagerhylla', 'Location', 'Hylle', 'Lagerhylle', 'Lokasjon'],
        supplier:       ['Företagsnamn', 'Supplier Name', 'Supplier', 'Leverandør',
                         'Leverantör', 'Leverandørnavn'],
        category:       ['Varugrupp', 'Varegruppe', 'Category', 'Kategori']
    };

    // Kept for backward compat — code that references MASTER_COLUMNS still works.
    // Each entry resolves to the first matched actual column at runtime.
    static MASTER_COLUMNS = {
        articleNumber: 'Artikelnr', description: 'Artikelbeskrivning',
        articleStatus: 'Artikelstatus', totalStock: 'TotLagSaldo',
        availableStock: 'DispLagSaldo', reserved: 'ReservAnt',
        kalkylPris: 'Kalkylpris bas', orderedQty: 'BestAntLev',
        orderNumber: 'Beställningsnummer', replacedBy: 'Ersätts av artikel',
        location: 'Lagerhylla', supplier: 'Företagsnamn', category: 'Varugrupp'
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

    // ── Column variants for SA-fil (REQUIRED — creates items) ──
    // Supports both old SA-Nummer.xlsx format and new data (4).xlsx format.
    static SA_COLUMN_VARIANTS = {
        // data (4).xlsx: VareNr — old format: Artikelnr / Varenr
        articleNumber: [
            'VareNr', 'Artikelnr', 'Artikelnummer', 'Tools art.nr', 'Tools artnr',
            'Artikkelnr', 'Article No', 'ArticleNo', 'Varenr'
        ],
        // data (4).xlsx: Kundens artnr — old format: Kunds artikkelnummer
        saNummer: [
            'Kundens artnr', 'Kunds artikkelnummer', 'Kunds art.nr', 'Kunds artnr',
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
        ],
        // SA-Nummer.xlsx: Beskrivelse → item.description (initial value; Master overrides)
        description: [
            'Beskrivelse', 'Description', 'Artikelbeskrivelse', 'Varebeskrivelse', 'Namn'
        ],
        // SA-Nummer.xlsx: Artikelbeskrivning → item.location (warehouse shelf location)
        location: [
            'Artikelbeskrivning', 'Artikelbeskrivelse', 'Lokasjon', 'Location'
        ],
        // data (4).xlsx: Kundens artbeskr. → item.lagerplass
        lagerplass: [
            'Kundens artbeskr.', 'Kundens artbeskrivelse', 'Kundebeskr',
            'Hylleplass', 'Lagerplass', 'Shelf', 'Location'
        ]
    };

    // ── Column variants for Agreement/katalog file (OPTIONAL) ──
    static AGREEMENT_COLUMN_VARIANTS = {
        articleNumber: [
            'Tools art.nr', 'Artikelnr', 'Artikelnummer', 'VareNr',
            'Artikkelnr', 'Article No', 'ArticleNo', 'Varenr'
        ],
        price: [
            'Kalkylpris bas', 'Kalkylpris', 'Pris bas', 'Pris', 'Price'
        ],
        supplier: [
            'Leverantör', 'Leverandør', 'Supplier', 'Firma', 'Leverandørnavn'
        ],
        varugrupp: [
            'Varugrupp', 'Varegruppe', 'Category', 'Kategori', 'Varekategori'
        ],
        articleStatus: [
            'Artikelstatus', 'Artikkelstatus', 'Status', 'Articlestatus'
        ]
    };

    // ── Column variants for data(4).xlsx / replacement+status file ──
    static REPLACEMENT_COLUMN_VARIANTS = {
        articleNumber: ['VareNr', 'VarNr', 'Item ID', 'Artikelnr'],
        replacedBy:    ['ErsattsAvArtNr', 'ErsattAvArtNr', 'Ersatts av artnr', 'ReplacedBy',
                        'Ersätts av artikel', 'Ersatt av'],
        alternatives:  ['Alternativ(er)', 'Alternativ', 'Alternatives', 'AlternativArtNr'],
        vareStatus:    ['VareStatus', 'VarStatus', 'Status']
    };

    // ── Column variants for Borregaard_SA_Master_v2.xlsx (FASE 7.0) ──
    static MASTERV2_COLUMN_VARIANTS = {
        saNumber:      ['SA_Nummer', 'SA-Nummer', 'SA Nummer'],
        toolsArtNr:    ['Tools_ArtNr', 'Tools ArtNr', 'Tools art.nr', 'Artikelnr'],
        description:   ['Beskrivelse', 'Artikelbeskrivning', 'Beskrivning'],
        stock:         ['Lagersaldo', 'TotLagSaldo', 'Saldo'],
        availableStock:['DispLagSaldo', 'Disponibelt', 'Disp.'],
        bp:            ['BP', 'Bestillingspunkt'],
        maxStock:      ['Maxlager', 'Max', 'Maxbeholdning'],
        reserved:      ['ReservAnt', 'Reservert'],
        bestAntLev:    ['BestAntLev', 'Bestilt ant.', 'Innkommende'],
        r12Sales:      ['R12 Del Qty', 'R12', 'R12 salg'],
        articleStatus: ['Artikelstatus', 'Status'],
        supplier:      ['Supplier Name', 'Leverandør', 'Leverantör'],
        location:      ['Lokasjon_SA', 'Lagerhylla', 'Lokasjon', 'Location'],
        vareStatus:    ['VareStatus', 'Varestatus'],
        replacedBy:    ['ErsattsAvArtNr', 'Ersätts av artikel', 'ReplacedBy', 'Erstatning', 'Ersatts av'],
        lagerfort:     ['LAGERFØRT', 'Lagerfort', 'Lagerført'],
        varemerke:     ['VAREMERKE', 'Varemerke', 'Brand'],
        pakkeStorrelse:['PakkeStørrelse', 'Pakke', 'PakkeStr'],
        enhet:         ['Enhet / Ant Des', 'Enhet', 'Unit'],
        category:      ['Item category 1', 'Kategori 1', 'Kategori'],
        category2:     ['Item category 2', 'Kategori 2'],
        category3:     ['Item category 3', 'Kategori 3'],
        salesTotAntall:['Ordre_TotAntall', 'TotAntall', 'Salg antall'],
        salesTotVerdi: ['Ordre_TotVerdi', 'TotVerdi', 'Salg verdi'],
        saleSisteDato: ['Ordre_SisteDato', 'SisteDato', 'Sist solgt'],
        agreementPrice:['Dagens_Pris', 'Pris', 'Avtalepris'],
        kalkylPris:    ['Kalkylpris_bas', 'Kalkylpris bas', 'Kalkylpris'],    // FASE 7.1
        ordrekvantitet:['EOK', 'Ordrekvantitet'],                            // FASE 7.1
        sistTelt:      ['Sist_telt', 'SistTelt', 'InvDat', 'sist_telt'],    // FASE 7.2
        ledetidDager:  ['Ledetid_dager', 'LedetidDager', 'Ledetid dager'],  // FASE 7.3
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
     *   5. Master_Artikkelstatus.xlsx (OPTIONAL) → Lagerhylla override
     *   6. Agreement/katalog (OPTIONAL) → inAgreement, pris, leverandør, varugrupp
     *
     * @param {Object} files - { master, ordersOut, sa, lagerplan?, artikkelstatus?, agreement? }
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
            // ── FASE 7.0: masterV2 — én fil erstatter SA + Master + Lagerplan ──
            // Ordrer_Jeeves.xlsx forblir alltid en separat fil og prosesseres her.
            if (files.masterV2) {
                console.log('========================================');
                console.log('[FASE 7.0] Masterfil v2 (SA-Oversikt) oppdaget');
                console.log('[FASE 7.0] Fil erstatter SA + Master + Lagerplan');
                console.log('[FASE 7.0] Ordrer_Jeeves prosesseres separat hvis tilgjengelig');
                console.log('========================================');

                statusCallback('Laster masterfil v2 (SA-Oversikt)...');
                const masterV2Raw = await this.loadMasterV2File(files.masterV2);
                this.processMasterV2File(masterV2Raw, store);

                // ── Ordrer_Jeeves.xlsx (OPTIONAL i MV2-sti, men nødvendig for Rapporter) ──
                // processOrdersOutData() beriker items med outgoingOrders[].deliveryLocation,
                // som ReportsMode.collectDepartments() trenger for avdelingsrapporter.
                if (files.ordersOut) {
                    statusCallback('Laster Ordrer_Jeeves.xlsx (avdelingsdata)...');
                    const ordersOutData = await this.loadFile(files.ordersOut);
                    console.log(`[FASE 7.0] Ordrer_Jeeves.xlsx lastet:`);
                    console.log(`  Filnavn: ${files.ordersOut.name}`);
                    console.log(`  Kolonner (${ordersOutData.columns.length}): ${ordersOutData.columns.join(', ')}`);
                    console.log(`  Rader: ${ordersOutData.rowCount}`);
                    this.processOrdersOutData(ordersOutData.data, store);
                } else {
                    console.log('[FASE 7.0] Ordrer_Jeeves.xlsx: ikke lastet (Rapporter vil mangle avdelingsdata)');
                }

                // FASE 7.3 — Bestillinger (valgfri)
                if (files.bestillinger) {
                    statusCallback('Leser bestillinger.xlsx...');
                    const bestillingerData = await this.loadFile(files.bestillinger);
                    this.processBestillingerData(bestillingerData.data, store);
                }

                store.calculateAll();

                const quality = store.getDataQualityReport();
                console.log('========================================');
                console.log('[FASE 7.0] Masterfil v2 prosessering fullført');
                console.log(`  SA-artikler: ${quality.totalArticles}`);
                console.log(`  Med innkommende: ${quality.withIncoming}`);
                console.log(`  Med salgshistorikk: ${quality.withOutgoing}`);
                console.log(`  Ordrelinjer uten SA (ignorert): ${store.ordersUnmatchedCount}`);
                console.log('========================================');

                return store;
            }

            // ── FASE 6.1: Validering ──
            console.log('========================================');
            console.log('FASE 6.1: Datavalidering starter');
            console.log('========================================');

            // ── 1. Load and process SA-fil (REQUIRED — creates items) ──
            if (!files.sa) {
                throw new Error('SA-filen er påkrevd! Denne filen definerer det operative universet av artikler.');
            }

            statusCallback('Laster SA-fil (oppretter artikler)...');
            const saData = await this.loadFile(files.sa);
            console.log(`[FASE 6.1] SA-fil lastet:`);
            console.log(`  Filnavn: ${files.sa.name}`);
            console.log(`  Kolonner (${saData.columns.length}): ${saData.columns.join(', ')}`);
            console.log(`  Rader: ${saData.rowCount}`);

            this.processSAData(saData.data, saData.columns, store);
            const saArticleCount = store.items.size;
            console.log(`[FASE 6.1] SA-fil prosessert: ${saArticleCount} SA-artikler opprettet`);

            if (saArticleCount === 0) {
                throw new Error('SA-filen inneholdt ingen gyldige artikler. Sjekk kolonnenavn (trenger "Kundens artnr" og "VareNr", eller "Kunds artikkelnummer" og "Artikelnr").');
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

            // ── 5. Load and process Master_Artikkelstatus.xlsx (OPTIONAL — Lagerhylla override) ──
            // Runs AFTER processMasterData so its location value always wins.
            if (files.artikkelstatus) {
                statusCallback('Laster Master_Artikkelstatus.xlsx (hyllelokasjon)...');
                try {
                    const asData = await this.loadFile(files.artikkelstatus);
                    console.log(`[FASE 6.1] Master_Artikkelstatus.xlsx lastet:`);
                    console.log(`  Filnavn: ${files.artikkelstatus.name}`);
                    console.log(`  Kolonner (${asData.columns.length}): ${asData.columns.join(', ')}`);
                    console.log(`  Rader: ${asData.rowCount}`);

                    this.processArtikkelstatusData(asData.data, asData.columns, store);
                } catch (asError) {
                    console.warn('[FASE 6.1] Master_Artikkelstatus.xlsx kunne ikke prosesseres:', asError.message);
                    // Optional — do not throw
                }
            } else {
                console.log('[FASE 6.1] Master_Artikkelstatus.xlsx: Ikke lastet (valgfri)');
            }

            // ── 6. Load and process Agreement/katalog file (OPTIONAL) ──
            if (files.agreement) {
                statusCallback('Laster avtalefil (agreement/katalog)...');
                try {
                    const agreementData = await this.loadFile(files.agreement);
                    console.log(`[Agreement] Avtalefil lastet:`);
                    console.log(`  Filnavn: ${files.agreement.name}`);
                    console.log(`  Kolonner (${agreementData.columns.length}): ${agreementData.columns.join(', ')}`);
                    console.log(`  Rader: ${agreementData.rowCount}`);

                    this.processAgreementData(agreementData.data, agreementData.columns, store);
                } catch (agError) {
                    console.warn('[Agreement] Avtalefil kunne ikke prosesseres:', agError.message);
                    // Valgfri — ikke kast feil
                }
            } else {
                console.log('[Agreement] Avtalefil: Ikke lastet (valgfri)');
            }

            // ── 7. Load and process Replacement file (data(4).xlsx — OPTIONAL) ──
            if (files.replacement) {
                statusCallback('Laster erstatnings-/varestatusfil (data(4))...');
                try {
                    const replData = await this.loadFile(files.replacement);
                    console.log(`[Replacement] Erstatningsfil lastet:`);
                    console.log(`  Filnavn: ${files.replacement.name}`);
                    console.log(`  Kolonner (${replData.columns.length}): ${replData.columns.join(', ')}`);
                    console.log(`  Rader: ${replData.rowCount}`);

                    this.processReplacementData(replData.data, replData.columns, store);
                } catch (replError) {
                    console.warn('[Replacement] Erstatningsfil kunne ikke prosesseres:', replError.message);
                    // Valgfri — ikke kast feil
                }
            } else {
                console.log('[Replacement] Erstatningsfil (data(4)): Ikke lastet (valgfri)');
            }

            // ── 8. Calculate derived values ──
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
            console.log(`  I avtalefil (inAgreement): ${store.getAllItems().filter(i => i.inAgreement).length}`);
            console.log(`  Med replacedByArticle:     ${store.getAllItems().filter(i => i.replacedByArticle).length}`);
            console.log(`  Med vareStatus satt:       ${store.getAllItems().filter(i => i.vareStatus).length}`);
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
            throw new Error('SA-filen er tom — ingen artikler kan opprettes.');
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

            // Description from SA file (Artikelbeskrivning).
            // Acts as initial value — Master.xlsx overrides if it has a description.
            const saDescription = this.getSAColumnValue(row, columns, 'description');
            if (saDescription) {
                item.description = saDescription;
            }

            // Lagerplass from SA file (Kundens artbeskr.).
            // Graceful: null if column is absent or row value is empty.
            const lagerplass = this.getSAColumnValue(row, columns, 'lagerplass');
            item.lagerplass = lagerplass || null;

            // Location from SA file (Artikelbeskrivning = warehouse shelf location).
            // Only stored when the value looks like a real shelf code; plain text
            // descriptions are ignored to avoid false-positive overwrites.
            // Acts as initial value — Master.xlsx / Master_Artikkelstatus.xlsx override if available.
            const saLocation = this.getSAColumnValue(row, columns, 'location');
            if (saLocation && this._looksLikeLocation(saLocation)) {
                const normalized = saLocation.trim()
                    .toUpperCase()
                    .replace(/\s+/g, '')
                    .replace(/–/g, '-');
                item.location = normalized;
            }
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
     * Returns true when a string looks like a warehouse shelf code rather than
     * a plain article description.  Used to guard the Artikelbeskrivning→location
     * assignment in processSaData() so that free-text descriptions are ignored.
     *
     * Accepted patterns:
     *   Numeric shelf : 11-10-A, 106-6-C, 12-1-C   (digits-digits-letter)
     *   Named zone    : Ojebod-17, Ext-2, BOKS1      (letters + optional sep + digits)
     */
    static _looksLikeLocation(value) {
        if (!value) return false;
        const v = String(value).trim();
        if (v.length === 0 || v.length > 20) return false;
        const numericShelf = /^\d{1,3}-\d{1,3}-[A-ZÆØÅa-zæøå]{1,3}$/i;
        const namedZone    = /^[A-ZÆØÅa-zæøå]{2,}[- ]?\d{1,3}$/i;
        return numericShelf.test(v) || namedZone.test(v);
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

        // ── Resolve actual header names via MASTER_COLUMN_VARIANTS ──
        const colMap = this.resolveMasterColumns(columns);

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
            item.location = this.getMasterValue(row, colMap.location) || item.location || '';
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

    // Columns that are enrichment-only and should not block processing if missing.
    static MASTER_OPTIONAL_COLUMNS = new Set([
        'supplier', 'category', 'location', 'replacedBy', 'orderNumber', 'availableStock', 'reserved'
    ]);

    /**
     * Resolve Master.xlsx column names using MASTER_COLUMN_VARIANTS (case-insensitive, first match).
     * Required columns (articleNumber, description, articleStatus, totalStock,
     *   kalkylPris, orderedQty) throw if missing.
     * Optional columns log a warning and resolve to null (safe default in getMasterValue).
     */
    static resolveMasterColumns(columns) {
        const result = {};
        const missing = [];
        const colLower = columns.map(c => c.trim().toLowerCase());

        for (const [logical, variants] of Object.entries(this.MASTER_COLUMN_VARIANTS)) {
            let found = null;

            for (const variant of variants) {
                // Exact case-insensitive match
                const idx = colLower.indexOf(variant.toLowerCase().trim());
                if (idx !== -1) {
                    found = columns[idx];
                    break;
                }
            }

            if (found) {
                result[logical] = found;
            } else if (this.MASTER_OPTIONAL_COLUMNS.has(logical)) {
                console.warn(`Master.xlsx: Valgfri kolonne "${variants[0]}" (${logical}) ikke funnet — hopper over`);
                result[logical] = null;
            } else {
                missing.push(`"${variants[0]}" (${logical})`);
            }
        }

        if (missing.length > 0) {
            const errorMsg = `Master.xlsx: Følgende påkrevde kolonner mangler!\n` +
                `  Mangler: ${missing.join(', ')}\n` +
                `  Tilgjengelige kolonner: ${columns.join(', ')}\n` +
                `  Sjekk at kolonnenavn stemmer med MASTER_COLUMN_VARIANTS.`;
            console.error(errorMsg);
            throw new Error(errorMsg);
        }

        console.log('=== Master.xlsx: Kolonnemapping (variants) ===');
        for (const [logical, actual] of Object.entries(result)) {
            if (actual) console.log(`  ${logical} → "${actual}"`);
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

        // Tell unike deliveryLocation-verdier (brukes av Rapporter-modulen)
        const deliveryLocations = new Set();
        store.getAllItems().forEach(item => {
            item.outgoingOrders.forEach(o => {
                if (o.deliveryLocation) deliveryLocations.add(o.deliveryLocation);
            });
        });

        console.log(`[Ordrer_Jeeves] Prosessert: ${joinedCount} salgslinjer koblet til SA-artikler`);
        console.log(`  Unike deliveryLocation-verdier: ${deliveryLocations.size} — ${[...deliveryLocations].join(', ') || '(ingen)'}`);
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

    // ════════════════════════════════════════════════════
    //  MASTER_ARTIKKELSTATUS.XLSX — location enrichment only
    // ════════════════════════════════════════════════════

    /**
     * processArtikkelstatusData(data, columns, store)
     *
     * Reads ONLY the "Lagerhylla" (column D) value from Master_Artikkelstatus.xlsx
     * and writes it to item.location, overriding whatever processMasterData() set.
     *
     * Deliberately minimal: no other fields touched, no logic changed.
     */
    static processArtikkelstatusData(data, columns, store) {
        if (!data || data.length === 0) {
            console.warn('[FASE 6.1] Master_Artikkelstatus.xlsx: ingen rader, hopper over');
            return;
        }

        // Case-insensitive column lookup
        const colLower = columns.map(c => c.trim().toLowerCase());
        const lagerhyllaCol = columns[colLower.indexOf('lagerhylla')] || null;
        const articleCol    = columns[colLower.indexOf('artikelnr')]  || null;

        // LevArtNr — supplier article number (several common spellings)
        const levArtIdx = colLower.findIndex(c =>
            c === 'levArtnr'.toLowerCase() || c === 'lev.artnr' ||
            c === 'lev art nr' || c === 'lev artnr' || c === 'levart.nr'
        );
        const levArtNrCol = levArtIdx !== -1 ? columns[levArtIdx] : null;

        if (!lagerhyllaCol) {
            console.warn('[FASE 6.1] Master_Artikkelstatus.xlsx: kolonne "Lagerhylla" ikke funnet — lokasjon oppdateres ikke');
            console.warn(`  Tilgjengelige kolonner: ${columns.join(', ')}`);
            return;
        }
        if (!articleCol) {
            console.warn('[FASE 6.1] Master_Artikkelstatus.xlsx: kolonne "Artikelnr" ikke funnet — kan ikke matche artikler');
            return;
        }

        let matched = 0;
        let withLocation = 0;
        let withLevArtNr = 0;

        data.forEach(row => {
            const artNr = row[articleCol];
            if (!artNr) return;

            const item = store.getByToolsArticleNumber(artNr.toString().trim());
            if (!item) return;

            matched++;

            // ── Lagerhylla → item.location ──
            const rawLoc = row[lagerhyllaCol];
            if (rawLoc !== undefined && rawLoc !== null) {
                const val = rawLoc.toString().trim();
                if (val) {
                    item.location = val;   // Override — same property, no new field
                    withLocation++;
                }
            }

            // ── LevArtNr → item.supplierArticleNumber ──
            if (levArtNrCol) {
                const rawLev = row[levArtNrCol];
                if (rawLev !== undefined && rawLev !== null) {
                    const val = rawLev.toString().trim();
                    if (val) {
                        item.supplierArticleNumber = val;
                        withLevArtNr++;
                    }
                }
            }
        });

        console.log(`[FASE 6.1] Master_Artikkelstatus.xlsx prosessert:`);
        console.log(`  Matchet SA-artikler: ${matched}`);
        console.log(`  Oppdatert item.location (Lagerhylla): ${withLocation}`);
        console.log(`  Oppdatert item.supplierArticleNumber (LevArtNr): ${withLevArtNr}`);
    }

    // ════════════════════════════════════════════════════
    //  AGREEMENT/KATALOG — ENRICHMENT ONLY (VALGFRI)
    // ════════════════════════════════════════════════════

    /**
     * Prosesser avtalefil (katalog/prisliste) — BERIKER eksisterende SA-artikler.
     * Oppretter INGEN nye items. Filen er valgfri — systemet fungerer uten den.
     *
     * Kolonner:
     *   Tools art.nr / Artikelnr → koblingsnøkkel (toolsArticleNumber)
     *   Kalkylpris bas           → item.agreementPrice
     *   Leverantör               → item.agreementSupplier
     *   Varugrupp                → item.agreementVarugrupp
     *   Artikelstatus            → item.agreementStatus
     *
     * Console-sammendrag:
     *   Totalt i avtale   – SA-artikler som ble matchet
     *   I avtale uten SA  – rader i avtalefil som ikke fantes i SA-universet
     *   SA uten avtale    – SA-artikler som ikke finnes i avtalefil
     */
    static processAgreementData(data, columns, store) {
        if (!data || data.length === 0) {
            console.warn('[Agreement] Avtalefil er tom, hopper over');
            return;
        }

        let matchedCount = 0;
        let unmatchedCount = 0;

        data.forEach(row => {
            const articleNo = this.getAgreementColumnValue(row, columns, 'articleNumber');
            if (!articleNo) return;

            // Slå opp via toolsArticleNumber (FASE 6.1: beriker kun SA-artikler)
            const item = store.getByToolsArticleNumber(articleNo.toString().trim());
            if (!item) {
                unmatchedCount++;
                return;
            }

            matchedCount++;
            item.inAgreement = true;

            const price = this.getAgreementColumnValue(row, columns, 'price');
            if (price) {
                const priceNum = this.parseNumber(price);
                if (priceNum > 0) item.agreementPrice = priceNum;
            }

            const supplier = this.getAgreementColumnValue(row, columns, 'supplier');
            if (supplier) item.agreementSupplier = supplier;

            const varugrupp = this.getAgreementColumnValue(row, columns, 'varugrupp');
            if (varugrupp) item.agreementVarugrupp = varugrupp;

            const status = this.getAgreementColumnValue(row, columns, 'articleStatus');
            if (status) item.agreementStatus = status;
        });

        // Console-sammendrag
        const allItems = store.getAllItems();
        const saWithoutAgreement = allItems.filter(i => !i.inAgreement).length;

        console.log('[Agreement] Avtalefil prosessert:');
        console.log(`  Totalt i avtale:    ${matchedCount}  (SA-artikler matchet fra avtalefil)`);
        console.log(`  I avtale uten SA:   ${unmatchedCount}  (avtalerader uten SA-match – ignorert)`);
        console.log(`  SA uten avtale:     ${saWithoutAgreement}  (SA-artikler ikke i avtalefil)`);
    }

    /**
     * Hent kolonneverdi fra avtalefil med fleksibel matching (case-insensitiv)
     */
    static getAgreementColumnValue(row, columns, fieldName) {
        const variants = this.AGREEMENT_COLUMN_VARIANTS[fieldName] || [fieldName];
        const keys = Object.keys(row);

        for (const variant of variants) {
            // Eksakt match
            if (row[variant] !== undefined && row[variant] !== null && row[variant] !== '') {
                return row[variant].toString().trim();
            }
            // Case-insensitiv match
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
    //  REPLACEMENT FILE (data(4).xlsx) — ENRICHMENT ONLY
    // ════════════════════════════════════════════════════

    /**
     * Prosesser erstatnings-/varestatus-fil (data(4).xlsx) — BERIKER eksisterende SA-artikler.
     *
     * Setter på SA-items:
     *   item.replacedByArticle      ← ErsattsAvArtNr
     *   item.alternativeArticlesRaw ← Alternativ(er)
     *   item.vareStatus             ← VareStatus (Sellable/Planned Discontinued/Discontinued)
     *
     * Oppretter INGEN nye items. Rader uten SA-match hoppes over (stille).
     *
     * Import-sammendrag logges etter prosessering.
     */
    static processReplacementData(data, columns, store) {
        if (!data || data.length === 0) {
            console.warn('[Replacement] Erstatningsfil er tom, hopper over');
            return;
        }

        let matchedCount = 0;
        let skippedCount = 0;
        let withReplacedBy = 0;
        let withVareStatus = 0;

        data.forEach(row => {
            const articleNo = this.getReplacementColumnValue(row, columns, 'articleNumber');
            if (!articleNo) return;

            const item = store.getByToolsArticleNumber(articleNo.toString().trim());
            if (!item) {
                skippedCount++;
                return;
            }

            matchedCount++;

            const replacedBy = this.getReplacementColumnValue(row, columns, 'replacedBy');
            if (replacedBy && replacedBy !== articleNo) {
                item.replacedByArticle = replacedBy.trim();
                withReplacedBy++;
            }

            const alternatives = this.getReplacementColumnValue(row, columns, 'alternatives');
            if (alternatives) item.alternativeArticlesRaw = alternatives.trim();

            const vareStatus = this.getReplacementColumnValue(row, columns, 'vareStatus');
            if (vareStatus) {
                item.vareStatus = vareStatus.trim();
                withVareStatus++;
            }
        });

        console.log('[Replacement] data(4).xlsx prosessert:');
        console.log(`  Rader lest:               ${data.length}`);
        console.log(`  Matchet SA-artikler:       ${matchedCount}`);
        console.log(`  Hoppet over (ikke i SA):  ${skippedCount}`);
        console.log(`  Med erstatning satt:       ${withReplacedBy}`);
        console.log(`  Med VareStatus satt:       ${withVareStatus}`);
    }

    /**
     * Hent kolonneverdi fra erstatningsfil med fleksibel matching (case-insensitiv)
     */
    static getReplacementColumnValue(row, columns, fieldName) {
        const variants = this.REPLACEMENT_COLUMN_VARIANTS[fieldName] || [fieldName];
        const keys = Object.keys(row);

        for (const variant of variants) {
            if (row[variant] !== undefined && row[variant] !== null && row[variant] !== '') {
                return row[variant].toString().trim();
            }
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

    // ════════════════════════════════════════════════════
    //  SA-MIGRERING: PRIORITETSSCORE
    // ════════════════════════════════════════════════════

    /**
     * Beregn migrationPriorityScore og migrationPriorityLabel for et item.
     *
     * Forutsetning: item er utgående (isDiscontinuing eller isDiscontinued).
     * Returnerer score = 0 hvis ikke utgående.
     *
     * Prioriteringslogikk (score 4 = høyest prioritet):
     *   P1 (score 4): Utgående + tom (stock=0, onOrder=0) + har erstatning
     *     → Kritisk: erstatning kan bestilles nå
     *   P2 (score 3): Utgående + tom (stock=0, onOrder=0) + mangler erstatning
     *     → Kritisk: må avklares, ingenting å bestille
     *   P3 (score 2): Utgående + tom (stock=0) + innkommende bestilling
     *     → Medium: stopp/overvåk bestilling
     *   P4 (score 1): Utgående + har saldo (stock>0)
     *     → Lav: planlegg overgang
     *   Ikke utgående → score 0
     *
     * P1 er over P2 fordi P1 er handlingsbar (erstatning kan bestilles).
     * P2 krever avklaring først — like kritisk, men ikke handlingsbar uten videre.
     *
     * @param {UnifiedItem} item
     * @returns {{ score: number, label: string }}
     */
    static computeMigrationPriority(item) {
        // Sjekk om utgående (fra Master _status eller vareStatus fra data(4))
        const masterDisc = item._status === 'UTGAENDE' || item._status === 'UTGAATT' ||
            item.isDiscontinued;
        const vareStatusDisc = (() => {
            const vs = (item.vareStatus || '').toLowerCase();
            return vs === 'discontinued' || vs.includes('planned discontinued');
        })();

        if (!masterDisc && !vareStatusDisc) {
            return { score: 0, label: '' };
        }

        const stock = item.stock || 0;
        const onOrder = item.bestAntLev || 0;
        const hasReplacement = !!((item.replacedByArticle || item.ersattAvArtikel || '').trim());

        if (stock === 0 && onOrder === 0 && hasReplacement) {
            return { score: 4, label: 'P1 – Kritisk: bestill erstatning' };
        }
        if (stock === 0 && onOrder === 0 && !hasReplacement) {
            return { score: 3, label: 'P2 – Kritisk: avklar erstatning' };
        }
        if (stock === 0 && onOrder > 0) {
            return { score: 2, label: 'P3 – Medium: overvåk bestilling' };
        }
        // stock > 0
        return { score: 1, label: 'P4 – Lav: planlegg overgang' };
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

    // ════════════════════════════════════════════════════
    //  MASTERFIL V2 (FASE 7.0) — Borregaard_SA_Master_v2.xlsx
    //  Én fil erstatter SA + Master + Ordrer + Lagerplan
    // ════════════════════════════════════════════════════

    /**
     * Last Borregaard_SA_Master_v2.xlsx og returner rader fra arket "SA-Oversikt".
     * Kaster feil med tydelig melding hvis arket ikke finnes.
     *
     * @param {File} file
     * @returns {Promise<Array>} Radene fra SA-Oversikt-arket
     */
    static async loadMasterV2File(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                try {
                    const data = new Uint8Array(e.target.result);
                    const wb = XLSX.read(data, { type: 'array', cellDates: true });

                    // Finn arket "SA-Oversikt" (bruk første ark som fallback)
                    const sheetName = wb.SheetNames.includes('SA-Oversikt')
                        ? 'SA-Oversikt'
                        : wb.SheetNames[0];

                    if (!wb.SheetNames.includes('SA-Oversikt')) {
                        console.warn(`[FASE 7.0] Arket 'SA-Oversikt' ikke funnet. Bruker første ark: "${sheetName}"`);
                        console.warn(`  Tilgjengelige ark: ${wb.SheetNames.join(', ')}`);
                    }

                    const ws = wb.Sheets[sheetName];
                    const rows = XLSX.utils.sheet_to_json(ws, { defval: '' });

                    console.log(`[FASE 7.0] Lastet ark "${sheetName}": ${rows.length} rader`);
                    if (rows.length > 0) {
                        console.log(`[FASE 7.0] Kolonner: ${Object.keys(rows[0]).join(', ')}`);
                    }

                    resolve(rows);
                } catch (err) {
                    reject(err);
                }
            };
            reader.onerror = () => reject(new Error('Feil ved lesing av masterfil v2'));
            reader.readAsArrayBuffer(file);
        });
    }

    /**
     * Hent verdi fra en rad i masterfil v2 med fleksibel kolonnematching
     */
    static getMasterV2Value(row, fieldName) {
        const variants = this.MASTERV2_COLUMN_VARIANTS[fieldName] || [fieldName];
        const keys = Object.keys(row);

        for (const variant of variants) {
            // Eksakt match
            if (row[variant] !== undefined && row[variant] !== null && row[variant] !== '') {
                return row[variant];
            }
            // Case-insensitiv match
            const lowerVariant = variant.toLowerCase().trim();
            for (const key of keys) {
                if (key.toLowerCase().trim() === lowerVariant) {
                    if (row[key] !== undefined && row[key] !== null && row[key] !== '') {
                        return row[key];
                    }
                }
            }
        }
        return '';
    }

    /**
     * Prosesser rader fra Borregaard_SA_Master_v2.xlsx (arket "SA-Oversikt").
     *
     * Én fil erstatter hele FASE 6.1-pipelinen:
     *   - Oppretter SA-items (tilsvarende processSAData)
     *   - Beriker med lagerstatus (tilsvarende processMasterData)
     *   - Beriker med salgsdata (tilsvarende processOrdersOutData)
     *   - Setter BP/planleggingsparametre (tilsvarende processLagerplanData)
     *
     * @param {Array} rows - Rader fra SA-Oversikt-arket
     * @param {UnifiedDataStore} store - Tom datastore
     */
    static processMasterV2File(rows, store) {
        if (!rows || rows.length === 0) {
            throw new Error('Masterfil v2 er tom — ingen artikler kan opprettes.');
        }

        // Valider at SA_Nummer-kolonnen finnes
        const firstRow = rows[0];
        const saNummerFound = this.MASTERV2_COLUMN_VARIANTS.saNumber.some(variant => {
            const lv = variant.toLowerCase().trim();
            return Object.keys(firstRow).some(k => k.toLowerCase().trim() === lv);
        });

        if (!saNummerFound) {
            throw new Error(
                "Kolonnen 'SA_Nummer' ikke funnet. Kontroller at filen er generert av riktig eksportskript.\n" +
                `Tilgjengelige kolonner: ${Object.keys(firstRow).join(', ')}`
            );
        }

        let createdCount = 0;
        let enrichedCount = 0;
        let skippedCount = 0;

        rows.forEach(row => {
            const saNumberRaw = this.getMasterV2Value(row, 'saNumber');
            if (!saNumberRaw) {
                skippedCount++;
                return;
            }
            const saNumber = saNumberRaw.toString().trim();
            if (!saNumber) {
                skippedCount++;
                return;
            }

            const toolsArtNr = this.getMasterV2Value(row, 'toolsArtNr').toString().trim();

            // 1. Opprett item (tilsvarende processSAData)
            const existedBefore = store.items.has(saNumber);
            const item = store.createFromSA(saNumber, toolsArtNr);
            if (!item) {
                skippedCount++;
                return;
            }
            if (!existedBefore) createdCount++;

            // 2. Beskrivelsesfelt
            const desc = this.getMasterV2Value(row, 'description').toString().trim();
            if (desc) item.description = desc;

            // 3. Lagerstatus (tilsvarende setMasterData)
            const stockRaw = this.getMasterV2Value(row, 'stock');
            item.stock = this.parseNumber(stockRaw);

            const availRaw = this.getMasterV2Value(row, 'availableStock');
            item.available = this.parseNumber(availRaw);

            const bpRaw = this.getMasterV2Value(row, 'bp');
            const bpVal = this.parseNumber(bpRaw);
            if (bpVal > 0) item.bestillingspunkt = bpVal;

            const maxRaw = this.getMasterV2Value(row, 'maxStock');
            const maxVal = this.parseNumber(maxRaw);
            if (maxVal > 0) item.max = maxVal;

            const reservedRaw = this.getMasterV2Value(row, 'reserved');
            item.reserved = this.parseNumber(reservedRaw);

            const bestAntLevRaw = this.getMasterV2Value(row, 'bestAntLev');
            const bestAntLev = this.parseNumber(bestAntLevRaw);
            if (bestAntLev > 0) {
                item.bestAntLev = bestAntLev;
                item.hasIncomingOrders = true;
            }

            // 4. R12 Del Qty — historisk salg (nytt felt)
            const r12Raw = this.getMasterV2Value(row, 'r12Sales');
            item.r12Sales = this.parseNumber(r12Raw);

            // 5. Artikelstatus / livssyklus
            const statusRaw = this.getMasterV2Value(row, 'articleStatus').toString().trim();
            if (statusRaw) {
                item.status = statusRaw;
                item._status = normalizeItemStatus(statusRaw);
                item.isDiscontinued = item._status === 'UTGAENDE' || item._status === 'UTGAATT';
            }

            // 6. Leverandør
            const supplierRaw = this.getMasterV2Value(row, 'supplier').toString().trim();
            if (supplierRaw) item.supplier = supplierRaw;

            // 7. Lokasjon / Lagerhylla
            const locationRaw = this.getMasterV2Value(row, 'location').toString().trim();
            if (locationRaw) item.location = locationRaw;

            // 8. VareStatus og erstatning (replacement-enrichment)
            const vareStatusRaw = this.getMasterV2Value(row, 'vareStatus').toString().trim();
            if (vareStatusRaw) item.vareStatus = vareStatusRaw;

            const replacedByRaw = this.getMasterV2Value(row, 'replacedBy').toString().trim();
            if (replacedByRaw && replacedByRaw !== toolsArtNr) {
                item.replacedByArticle = replacedByRaw;
            }

            // 9. Nye felt fra masterfil v2
            const lagerfortRaw = this.getMasterV2Value(row, 'lagerfort').toString().trim();
            if (lagerfortRaw) item.lagerfort = lagerfortRaw;

            const varemerkeRaw = this.getMasterV2Value(row, 'varemerke').toString().trim();
            if (varemerkeRaw) item.varemerke = varemerkeRaw;

            const pakkeRaw = this.getMasterV2Value(row, 'pakkeStorrelse');
            if (pakkeRaw !== '' && pakkeRaw !== null && pakkeRaw !== undefined) {
                const pakkeVal = this.parseNumber(pakkeRaw);
                if (pakkeVal > 0) item.pakkeStorrelse = pakkeVal;
            }

            const enhetRaw = this.getMasterV2Value(row, 'enhet').toString().trim();
            if (enhetRaw) item.enhet = enhetRaw;

            // 10. Kategorier
            const cat1Raw = this.getMasterV2Value(row, 'category').toString().trim();
            if (cat1Raw) item.category = cat1Raw;

            const cat2Raw = this.getMasterV2Value(row, 'category2').toString().trim();
            if (cat2Raw) item.category2 = cat2Raw;

            const cat3Raw = this.getMasterV2Value(row, 'category3').toString().trim();
            if (cat3Raw) item.category3 = cat3Raw;

            // 11. Salgsdata (tilsvarende processOrdersOutData)
            const salesTotAntallRaw = this.getMasterV2Value(row, 'salesTotAntall');
            const salesTotAntall = this.parseNumber(salesTotAntallRaw);
            if (salesTotAntall > 0) {
                item.sales12m = salesTotAntall;
                item.orderCount = salesTotAntall; // proxy — antall ordre ikke separat
                item.hasOutgoingOrders = true;
            }

            const saleSisteDatoRaw = this.getMasterV2Value(row, 'saleSisteDato');
            if (saleSisteDatoRaw) {
                const parsedDate = this.parseDate(saleSisteDatoRaw);
                if (parsedDate) item.lastSaleDate = parsedDate;
            }

            // 12. Avtalepris (agreement-enrichment)
            const agreementPriceRaw = this.getMasterV2Value(row, 'agreementPrice');
            if (agreementPriceRaw !== '' && agreementPriceRaw !== null) {
                const priceVal = this.parseNumber(agreementPriceRaw);
                if (priceVal > 0) {
                    item.agreementPrice = priceVal;
                    item.inAgreement = true;
                }
            }

            // 13. Kalkylpris (FASE 7.1 — fra Kalkylpris_bas-kolonnen i MV2)
            // estimertVerdi beregnes automatisk av UnifiedItem.calculate() via kalkylPris × stock
            const kalkylPrisRaw = this.getMasterV2Value(row, 'kalkylPris');
            if (kalkylPrisRaw !== '' && kalkylPrisRaw !== null) {
                const kpVal = this.parseNumber(kalkylPrisRaw);
                if (kpVal > 0) item.kalkylPris = kpVal;
            }

            // 14. EOK / ordrekvantitet (FASE 7.1 — fra EOK-kolonnen i MV2)
            const eokRaw = this.getMasterV2Value(row, 'ordrekvantitet');
            if (eokRaw !== '' && eokRaw !== null) {
                const eokVal = this.parseNumber(eokRaw);
                if (eokVal > 0) item.ordrekvantitet = eokVal;
            }

            // 15. Sist telt (FASE 7.2 — fra Sist_telt-kolonnen i MV2)
            const sistTeltRaw = this.getMasterV2Value(row, 'sistTelt');
            if (sistTeltRaw && sistTeltRaw.toString().trim() !== '') {
                item.sistTelt = sistTeltRaw.toString().trim(); // 'YYYY-MM-DD'
            }

            // 16. Ledetid (FASE 7.3)
            const ledetidRaw = this.getMasterV2Value(row, 'ledetidDager');
            if (ledetidRaw !== '' && ledetidRaw !== null) {
                const ldVal = this.parseNumber(ledetidRaw);
                if (ldVal > 0) item.ledetidDager = ldVal;
            }

            enrichedCount++;
        });

        if (createdCount === 0 && enrichedCount === 0) {
            throw new Error(
                `Masterfil v2: 0 artikler opprettet.\n` +
                `Rader lest: ${rows.length}\n` +
                `Kolonner funnet: ${Object.keys(rows[0] || {}).join(', ')}`
            );
        }

        console.log(`[FASE 7.2] Masterfil v2 prosessert:`);
        console.log(`  Nye SA-artikler opprettet: ${createdCount}`);
        console.log(`  Rader beriket: ${enrichedCount}`);
        console.log(`  Med kalkylPris: ${store.getAllItems().filter(i => i.kalkylPris > 0).length}`);
        console.log(`  Med ordrekvantitet (EOK): ${store.getAllItems().filter(i => i.ordrekvantitet !== null).length}`);
        console.log(`[FASE 7.2] sistTelt lastet: ${store.getAllItems().filter(i => i.sistTelt !== null).length} artikler`);
        if (skippedCount > 0) {
            console.log(`  Hoppet over (mangler SA-nr): ${skippedCount}`);
        }
    }

    // ════════════════════════════════════════════════════
    //  BESTILLINGER.XLSX PROCESSING — FASE 7.3
    // ════════════════════════════════════════════════════

    /**
     * Prosesser bestillinger.xlsx — berik items med åpne innkjøpsordrer
     *
     * @param {Array} rows - Array of objects fra DataLoader.loadExcel/loadFile
     * @param {UnifiedDataStore} store
     */
    static processBestillingerData(rows, store) {
        if (!rows || rows.length === 0) return;

        // Hjelpefunksjon: finn verdi fra rad via kolonnenavnvarianter
        const findValue = (row, variants) => {
            for (const v of variants) {
                const key = Object.keys(row).find(k => k.toLowerCase() === v.toLowerCase());
                if (key !== undefined && row[key] !== '' && row[key] !== null && row[key] !== undefined) {
                    return row[key];
                }
            }
            return null;
        };

        let matchCount = 0;

        for (const row of rows) {
            const artNr = findValue(row, ['Artikelnr', 'Item ID', 'Artikkelnr'])?.toString().trim();
            if (!artNr) continue;

            const restAntRaw = findValue(row, ['RestAntLgrEnh', 'RestAnt', 'Restantall']);
            const restAnt = parseFloat((restAntRaw || '0').toString().replace(',', '.')) || 0;

            // Hopp over nullrestantall
            if (restAnt <= 0) continue;

            // Finn item via toolsLookup
            const item = store.getByToolsArticleNumber(artNr);
            if (!item) continue;

            // Parse leveringsdato (format: YYYYMMDD eller YYMMDD)
            let berLevDat = null;
            const datRaw = findValue(row, ['BerLevDat', 'Beregnet levdato', 'BerLevDato'])?.toString().trim();
            if (datRaw && datRaw.length >= 6) {
                const d = datRaw.length === 6
                    ? `20${datRaw.slice(0,2)}-${datRaw.slice(2,4)}-${datRaw.slice(4,6)}`
                    : `${datRaw.slice(0,4)}-${datRaw.slice(4,6)}-${datRaw.slice(6,8)}`;
                berLevDat = d;
            }

            const ordreNr = findValue(row, ['Beställningsnummer', 'OrdreNr', 'Ordrenr'])?.toString().trim() || '';
            const status  = findValue(row, ['BesSt', 'Status', 'Bestillingsstatus'])?.toString().trim() || '';

            item.addOpenOrder({ ordreNr, restAntall: restAnt, berLevDat, status });
            matchCount++;
        }

        console.log(`[FASE 7.3] Bestillinger: ${matchCount} åpne ordrelinjer koblet`);
    }
}

// Eksporter til global scope
window.DataProcessor = DataProcessor;
