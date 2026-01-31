// ===================================
// DATA PROCESSOR
// Håndterer lasting, mapping og sammenstilling av 4 datafiler
// ===================================

/**
 * DataProcessor - Koordinerer dataflyt fra filer til UnifiedDataStore
 */
class DataProcessor {
    /**
     * Kolonnevarianter for automatisk gjenkjenning
     * Prioritert rekkefølge: Jeeves-kolonner først, deretter fallbacks
     */
    static COLUMN_VARIANTS = {
        // Artikkelnummer (primærnøkkel)
        // Jeeves: Artikelnr | SA-fil: Tools art.nr
        articleNumber: [
            'Artikelnr', 'Tools art.nr', 'Tools artnr',
            'Artikkelnr', 'Article No', 'ArticleNo', 'Item ID', 'ItemNo', 'Varenr'
        ],

        // SA-nummer (kun i SA-Nummer.xlsx)
        // Faktisk kolonne: Kunds artikelnummer
        saNumber: [
            'Kunds artikelnummer', 'SA-nummer', 'SA nummer', 'SA-nr', 'SAnr', 'SA'
        ],

        // Beskrivelse
        // Jeeves: Artikelbeskrivning
        description: [
            'Artikelbeskrivning', 'Artikelbeskrivelse', 'Artikelbeskr',
            'Beskrivelse', 'Description', 'Varebeskrivelse', 'Navn'
        ],

        // Lagersaldo
        // Jeeves: Lagersaldo
        stock: [
            'Lagersaldo', 'Saldo', 'Stock', 'Beholdning', 'On Hand'
        ],

        // Reservert
        // Jeeves: ReservAnt
        reserved: [
            'ReservAnt', 'Reservert', 'Reserved', 'Reservert antall'
        ],

        // Disponibel
        // Jeeves: DispLagSaldo
        available: [
            'DispLagSaldo', 'Disponibel', 'Available', 'Tilgjengelig', 'Disp'
        ],

        // Bestillingspunkt
        // Jeeves: BP
        bp: [
            'BP', 'Bestillingspunkt', 'Reorder Point', 'Min'
        ],

        // Maksimum lager
        // Jeeves: Maxlager
        max: [
            'Maxlager', 'Max', 'Maximum', 'Max Stock'
        ],

        // Status
        // Jeeves: Artikelstatus (hvis finnes)
        status: [
            'Artikelstatus', 'Status', 'Varestatus', 'ItemStatus'
        ],

        // Tekstlig artikkelstatus (planned discontinued / skal utgå)
        // Jeeves: itemstsbeskr, Teknisk Status, eller annen tekstlig status
        statusText: [
            'itemstsbeskr', 'Teknisk Status', 'Artikelstatusbeskrivning',
            'Status beskrivning', 'StatusText', 'Item Status Description'
        ],

        // Kategori / Varugrupp
        // Jeeves: Varugrupp, Artikelgrupp, Produktgrupp
        category: [
            'Varugrupp', 'Artikelgrupp', 'Produktgrupp',
            'Varegruppe', 'Artikkelgruppe', 'Produktgruppe',
            'Item Group', 'Product Group', 'Category'
        ],

        // Leverandør
        // Jeeves Lagerbeholdning: Företagsnamn | Jeeves Bestillinger: Leverantör
        supplier: [
            'Företagsnamn', 'Leverantör', 'Leverandør', 'Supplier', 'Supplier Name', 'Vendor'
        ],

        // Plasseringslokasjon (fra SA-Nummer.xlsx kolonne G: Artikelbeskrivning)
        // OBS: I SA-filen er dette lokasjon, IKKE beskrivelse
        placementLocation: [
            'Artikelbeskrivning'
        ],

        // Lokasjon/Lagersted
        // Jeeves: Lagerställe
        location: [
            'Lagerställe', 'Lokasjon', 'Location', 'Warehouse', 'Lager', 'Hylle'
        ],

        // Siste bevegelse
        // Jeeves: Senaste rörelse
        lastMovement: [
            'Senaste rörelse', 'Siste bevegelse', 'Last Movement', 'LastMovement'
        ],

        // ===== BESTILLINGER INN (Jeeves) =====

        // Bestillingsnummer
        // Jeeves: Beställningsnummer
        orderNoIn: [
            'Beställningsnummer', 'Bestillingsnr', 'Bestillingsnummer', 'PO Number'
        ],

        // Restantall (åpen mengde)
        // Jeeves: RestAntLgrEnh
        quantityIn: [
            'RestAntLgrEnh', 'Restantall', 'Open Qty', 'Åpen mengde', 'Bestilt antall'
        ],

        // Forventet leveringsdato
        // Jeeves: BerLevDat
        expectedDate: [
            'BerLevDat', 'Forventet dato', 'Expected date', 'Leveringsdato', 'Forventet levering'
        ],

        // ===== ORDRER UT / FAKTURERT (Jeeves) =====

        // Ordrenummer (salg)
        // Jeeves: OrderNr
        orderNoOut: [
            'OrderNr', 'Ordrenr', 'Order number', 'OrderNo', 'Ordre'
        ],

        // Ordreantall
        // Jeeves: OrdRadAnt
        quantityOut: [
            'OrdRadAnt', 'Ordreantall', 'Order Qty', 'Quantity', 'Antall'
        ],

        // Fakturadato
        // Jeeves: FaktDat
        invoiceDate: [
            'FaktDat', 'Fakturadato', 'Invoice date', 'Faktureringsdato'
        ],

        // Kunde
        // Jeeves: Företagsnamn
        customer: [
            'Företagsnamn', 'Kundenavn', 'Customer', 'Kunde', 'Customer Name'
        ],

        // Leveringslager (DH)
        // Jeeves Ordrer: DH (kolonne for leveringslager/leveringssted)
        deliveryLocation: [
            'DH', 'Leveringslager', 'Delivery Warehouse', 'Leveringssted', 'Del. Warehouse'
        ],

        // ===== LEGACY/FALLBACK =====

        // Generisk dato (fallback)
        date: [
            'Dato', 'Date', 'FaktDat', 'BerLevDat'
        ],

        // Generisk antall (fallback)
        quantity: [
            'Antall', 'Quantity', 'Qty', 'OrdRadAnt', 'RestAntLgrEnh'
        ],

        // Generisk ordrenummer (fallback)
        orderNo: [
            'OrderNr', 'Beställningsnummer', 'Ordrenr', 'Order number'
        ]
    };

    /**
     * Prosesser alle filer og bygg UnifiedDataStore
     * @param {Object} files - Objekt med filinput-verdier
     * @param {Function} statusCallback - Callback for statusoppdateringer
     * @returns {Promise<UnifiedDataStore>}
     */
    static async processAllFiles(files, statusCallback = () => {}) {
        const store = new UnifiedDataStore();

        try {
            // 1. Last og prosesser Lagerbeholdning (påkrevd)
            if (files.inventory) {
                statusCallback('Laster lagerbeholdning...');
                const inventoryData = await this.loadFile(files.inventory);
                console.log('Lagerbeholdning kolonner:', inventoryData.columns);
                this.processInventoryData(inventoryData.data, store);
                console.log(`Lagerbeholdning: ${store.items.size} artikler`);
            } else {
                throw new Error('Lagerbeholdning.xlsx er påkrevd');
            }

            // 2. Last og prosesser SA-Nummer (valgfri, men gjøres tidlig for kobling)
            if (files.saNumber) {
                statusCallback('Laster SA-nummer mapping...');
                const saData = await this.loadFile(files.saNumber);
                console.log('SA-Nummer kolonner:', saData.columns);
                this.processSANumberData(saData.data, store);
                store.applySANumbers();
                console.log(`SA-nummer: ${store.saMapping.size} mappinger`);
            }

            // 3. Last og prosesser Bestillinger INN (påkrevd)
            if (files.ordersIn) {
                statusCallback('Laster bestillinger...');
                const ordersInData = await this.loadFile(files.ordersIn);
                console.log('Bestillinger kolonner:', ordersInData.columns);
                this.processOrdersInData(ordersInData.data, store);
                console.log(`Bestillinger: prosessert`);
            } else {
                throw new Error('Bestillinger.xlsx er påkrevd');
            }

            // 4. Last og prosesser Fakturert UT (påkrevd)
            if (files.ordersOut) {
                statusCallback('Laster fakturert historikk...');
                const ordersOutData = await this.loadFile(files.ordersOut);
                console.log('Fakturert kolonner:', ordersOutData.columns);
                this.processOrdersOutData(ordersOutData.data, store);
                console.log(`Fakturert: prosessert`);
            } else {
                throw new Error('Fakturert.xlsx er påkrevd');
            }

            // 5. Beregn alle avledede verdier
            statusCallback('Beregner verdier...');
            store.calculateAll();

            // 6. Logg datakvalitet
            const quality = store.getDataQualityReport();
            console.log('Datakvalitet:', quality);

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

    /**
     * Finn kolonneverdi med fleksibel matching
     */
    static getColumnValue(row, ...columnTypes) {
        const keys = Object.keys(row);

        for (const columnType of columnTypes) {
            // Sjekk om det er en kjent kolonnetype
            const variants = this.COLUMN_VARIANTS[columnType] || [columnType];

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

                // Delvis match (kolonne inneholder søketerm)
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

        // Hvis allerede tall
        if (typeof value === 'number') {
            return isNaN(value) ? 0 : value;
        }

        // Konverter til string og parse
        let str = value.toString().trim();

        // Fjern mellomrom (tusen-separator)
        str = str.replace(/\s/g, '');

        // Håndter norsk format (1.234,56 -> 1234.56)
        if (str.includes(',') && str.includes('.')) {
            // Anta at komma er desimalseparator
            str = str.replace(/\./g, '').replace(',', '.');
        } else if (str.includes(',')) {
            // Kun komma - anta desimalseparator
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

        // Hvis allerede Date-objekt
        if (value instanceof Date) {
            return isNaN(value.getTime()) ? null : value;
        }

        // Bruk DataLoader sin parseDate hvis tilgjengelig
        if (typeof DataLoader !== 'undefined' && DataLoader.parseDate) {
            return DataLoader.parseDate(value);
        }

        // Fallback parsing
        const str = value.toString().trim();

        // ISO format (YYYY-MM-DD)
        let date = new Date(str);
        if (!isNaN(date.getTime())) return date;

        // DD.MM.YYYY (norsk)
        const ddmmyyyy = str.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
        if (ddmmyyyy) {
            return new Date(ddmmyyyy[3], ddmmyyyy[2] - 1, ddmmyyyy[1]);
        }

        // DD/MM/YYYY
        const slashFormat = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
        if (slashFormat) {
            return new Date(slashFormat[3], slashFormat[2] - 1, slashFormat[1]);
        }

        return null;
    }

    /**
     * Prosesser lagerbeholdningsdata (Lagerbeholdning_Jeeves.xlsx)
     *
     * Jeeves-kolonner som brukes:
     * - Artikelnr → toolsArticleNumber
     * - Artikelbeskrivning → description
     * - Lagerställe → location
     * - Lagersaldo → stock
     * - ReservAnt → reserved
     * - DispLagSaldo → available
     * - BP → bp
     * - Maxlager → max
     * - Senaste rörelse → lastMovementDate (hvis finnes)
     */
    static processInventoryData(data, store) {
        let missingColumns = [];

        data.forEach(row => {
            const articleNo = this.getColumnValue(row, 'articleNumber');
            if (!articleNo) return;

            const item = store.getOrCreate(articleNo);
            if (!item) return;

            // Grunndata fra Jeeves
            item.description = this.getColumnValue(row, 'description') || item.description;
            item.location = this.getColumnValue(row, 'location');
            item.shelf = item.location; // Alias

            // Lagerstatus fra Jeeves
            item.stock = this.parseNumber(this.getColumnValue(row, 'stock'));
            item.reserved = this.parseNumber(this.getColumnValue(row, 'reserved'));
            item.available = this.parseNumber(this.getColumnValue(row, 'available'));

            // Bestillingspunkter fra Jeeves
            item.bp = this.parseNumber(this.getColumnValue(row, 'bp'));
            item.max = this.parseNumber(this.getColumnValue(row, 'max'));

            // Status (hvis finnes)
            item.status = this.getColumnValue(row, 'status');

            // Tekstlig artikkelstatus (planned discontinued / skal utgå)
            const statusTextValue = this.getColumnValue(row, 'statusText');
            if (statusTextValue) {
                item.statusText = statusTextValue;
                const lowerStatus = statusTextValue.toLowerCase();
                item.isDiscontinued =
                    lowerStatus.includes('discontinued') ||
                    lowerStatus.includes('utgå') ||
                    lowerStatus.includes('avvikles') ||
                    lowerStatus.includes('utgående');
            }

            // Kategori fra Jeeves (Varugrupp/Artikelgrupp/Produktgrupp)
            const categoryValue = this.getColumnValue(row, 'category');
            if (categoryValue) {
                item.category = categoryValue;
            }

            // Leverandør fra Jeeves (Företagsnamn)
            const supplierValue = this.getColumnValue(row, 'supplier');
            if (supplierValue) {
                item.supplier = supplierValue;
            }

            // Siste bevegelse fra Jeeves (Senaste rörelse)
            const lastMovementStr = this.getColumnValue(row, 'lastMovement');
            if (lastMovementStr) {
                item.lastMovementDate = this.parseDate(lastMovementStr);
            }

            // Beregn tilgjengelig hvis ikke satt
            if (item.available === 0 && item.stock > 0) {
                item.available = item.stock - item.reserved;
            }
        });

        // Logg warning for første rad hvis kolonner mangler
        if (data.length > 0) {
            const firstRow = data[0];
            const expectedCols = ['articleNumber', 'description', 'location', 'stock', 'reserved', 'available', 'bp', 'max'];
            expectedCols.forEach(col => {
                if (!this.getColumnValue(firstRow, col)) {
                    console.warn(`Lagerbeholdning: Kolonne '${col}' ikke funnet`);
                }
            });
        }
    }

    /**
     * Prosesser SA-nummer mapping og plasseringslokasjon
     *
     * SA-Nummer.xlsx kolonner:
     * - Artikelnr → toolsArticleNumber (primærnøkkel)
     * - Kunds artikelnummer → saNumber
     * - Artikelbeskrivning (kolonne G) → placementLocation (IKKE beskrivelse!)
     */
    static processSANumberData(data, store) {
        data.forEach(row => {
            const articleNo = this.getColumnValue(row, 'articleNumber');
            const saNumber = this.getColumnValue(row, 'saNumber');
            const placementLocation = this.getColumnValue(row, 'placementLocation');

            if (articleNo && saNumber) {
                store.setSAMapping(articleNo, saNumber);
            }

            // Lagre plasseringslokasjon på artikkelen
            if (articleNo && placementLocation) {
                store.setPlacementLocation(articleNo, placementLocation);
            }
        });
    }

    /**
     * Prosesser bestillinger INN (Bestillinger_Jeeves.xlsx)
     *
     * Jeeves-kolonner som brukes:
     * - Artikelnr → toolsArticleNumber
     * - Beställningsnummer → orderNo
     * - RestAntLgrEnh → quantity (åpen mengde)
     * - BerLevDat → expectedDate
     * - Leverantör → supplier
     *
     * Ignorerer: pris, CO2, valuta, økonomiske felt
     */
    static processOrdersInData(data, store) {
        data.forEach(row => {
            const articleNo = this.getColumnValue(row, 'articleNumber');
            if (!articleNo) return;

            const item = store.getOrCreate(articleNo);
            if (!item) return;

            // Oppdater beskrivelse hvis tom
            if (!item.description) {
                item.description = this.getColumnValue(row, 'description');
            }

            // Hent mengde (Jeeves: RestAntLgrEnh = åpen restmengde)
            const quantity = this.parseNumber(
                this.getColumnValue(row, 'quantityIn') || this.getColumnValue(row, 'quantity')
            );

            // Hopp over rader uten åpen mengde (fullførte bestillinger)
            if (quantity <= 0) return;

            // Legg til bestilling med Jeeves-kolonner
            item.addIncomingOrder({
                orderNo: this.getColumnValue(row, 'orderNoIn') || this.getColumnValue(row, 'orderNo'),
                quantity: quantity,
                expectedDate: this.parseDate(
                    this.getColumnValue(row, 'expectedDate') || this.getColumnValue(row, 'date')
                ),
                supplier: this.getColumnValue(row, 'supplier'),
                status: this.getColumnValue(row, 'status')
            });
        });

        // Logg warning for første rad hvis kolonner mangler
        if (data.length > 0) {
            const firstRow = data[0];
            if (!this.getColumnValue(firstRow, 'orderNoIn') && !this.getColumnValue(firstRow, 'orderNo')) {
                console.warn('Bestillinger: Kolonne for ordrenummer ikke funnet');
            }
            if (!this.getColumnValue(firstRow, 'quantityIn') && !this.getColumnValue(firstRow, 'quantity')) {
                console.warn('Bestillinger: Kolonne for antall ikke funnet');
            }
        }
    }

    /**
     * Prosesser fakturert UT / Ordrer (Ordrer_Jeeves.xlsx)
     *
     * Jeeves-kolonner som brukes:
     * - Artikelnr → toolsArticleNumber
     * - OrderNr → orderNo
     * - OrdRadAnt → quantity
     * - FaktDat → deliveryDate
     * - Företagsnamn → customer
     *
     * Brukes til beregning av:
     * - sales12m, salesVolume, orderCount
     * - monthlyConsumption, lastMovementDate
     */
    static processOrdersOutData(data, store) {
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

            // Legg til salgsordre med Jeeves-kolonner
            item.addOutgoingOrder({
                orderNo: this.getColumnValue(row, 'orderNoOut') || this.getColumnValue(row, 'orderNo'),
                quantity: quantity,
                deliveryDate: this.parseDate(
                    this.getColumnValue(row, 'invoiceDate') || this.getColumnValue(row, 'date')
                ),
                customer: this.getColumnValue(row, 'customer'),
                deliveryLocation: this.getColumnValue(row, 'deliveryLocation'),
                invoiceNo: null // Ikke brukt fra Jeeves
            });
        });

        // Logg warning for første rad hvis kolonner mangler
        if (data.length > 0) {
            const firstRow = data[0];
            if (!this.getColumnValue(firstRow, 'orderNoOut') && !this.getColumnValue(firstRow, 'orderNo')) {
                console.warn('Ordrer: Kolonne for ordrenummer ikke funnet');
            }
            if (!this.getColumnValue(firstRow, 'quantityOut') && !this.getColumnValue(firstRow, 'quantity')) {
                console.warn('Ordrer: Kolonne for antall ikke funnet');
            }
            if (!this.getColumnValue(firstRow, 'customer')) {
                console.warn('Ordrer: Kolonne for kunde (Företagsnamn) ikke funnet');
            }
        }
    }

    /**
     * Logg oppdagede kolonner fra fil
     */
    static logDiscoveredColumns(fileName, columns) {
        console.log(`=== Kolonner i ${fileName} ===`);
        columns.forEach((col, index) => {
            console.log(`  ${index + 1}. ${col}`);
        });

        // Forsøk å matche til kjente kolonnetyper
        const matches = {};
        columns.forEach(col => {
            for (const [type, variants] of Object.entries(this.COLUMN_VARIANTS)) {
                const lowerCol = col.toLowerCase();
                for (const variant of variants) {
                    if (lowerCol === variant.toLowerCase() || lowerCol.includes(variant.toLowerCase())) {
                        matches[col] = type;
                        break;
                    }
                }
            }
        });

        if (Object.keys(matches).length > 0) {
            console.log('  Gjenkjente kolonner:');
            for (const [col, type] of Object.entries(matches)) {
                console.log(`    ${col} -> ${type}`);
            }
        }
    }
}

// Eksporter til global scope
window.DataProcessor = DataProcessor;
