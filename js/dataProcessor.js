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
     * Utvides basert på faktiske kolonnenavn i filene
     */
    static COLUMN_VARIANTS = {
        // Artikkelnummer (primærnøkkel)
        articleNumber: [
            'Artikelnr', 'Artikkelnr', 'Artikkel nr', 'Article No', 'ArticleNo',
            'Item ID', 'ItemNo', 'Item No', 'Item', 'Varenr', 'Varenummer',
            'Art.nr', 'Art nr', 'Artnr', 'Tools art.nr', 'Tools artnr'
        ],

        // SA-nummer
        saNumber: [
            'SA-nummer', 'SA nummer', 'SA-nr', 'SA nr', 'SAnr', 'SA',
            'SA Number', 'SANumber'
        ],

        // Beskrivelse
        description: [
            'Beskrivelse', 'Artikelbeskrivelse', 'Artikelbeskr', 'Description',
            'Item Description', 'ItemDesc', 'Varebeskrivelse', 'Navn', 'Name',
            'Artikkelbeskrivelse', 'Tekst'
        ],

        // Lagersaldo
        stock: [
            'Lagersaldo', 'Saldo', 'Stock', 'On Hand', 'Beholdning',
            'Lagerbeholdning', 'Lager', 'Ant på lager', 'Antall på lager'
        ],

        // Reservert
        reserved: [
            'Reservert', 'ReservAnt', 'Reserved', 'Reservert antall',
            'Reservert ant', 'Res'
        ],

        // Disponibel
        available: [
            'Disponibel', 'DispLagSaldo', 'Available', 'Disp', 'Tilgjengelig',
            'Disponibelt', 'Ledig'
        ],

        // Bestillingspunkt
        bp: [
            'BP', 'Bestillingspunkt', 'Reorder Point', 'Min', 'Minimum',
            'Min Stock', 'Minbeholdning', 'Bestillingsgrense'
        ],

        // Maksimum lager
        max: [
            'Max', 'Maxlager', 'Maximum', 'Max Stock', 'Maksbeholdning',
            'Maks', 'Maksimum'
        ],

        // Status
        status: [
            'Status', 'Artikelstatus', 'Varestatus', 'ItemStatus', 'State',
            'Tilstand', 'Artikkelstatus'
        ],

        // Leverandør
        supplier: [
            'Leverandør', 'Supplier', 'Supplier Name', 'Leverandørnavn',
            'Vendor', 'Lev', 'Levnr'
        ],

        // Lokasjon/Hylle
        location: [
            'Lokasjon', 'Location', 'Lager', 'Warehouse', 'Hylla 1', 'Hylle',
            'Shelf', 'Hylleplassering', 'Plass'
        ],

        // Dato
        date: [
            'Dato', 'Date', 'Delivery date', 'Leveringsdato', 'Order Date',
            'Ordredato', 'Invoice date', 'Fakturadato', 'Forventet dato',
            'Expected date', 'Leveringsdato', 'Bestillingsdato'
        ],

        // Antall/Kvantum
        quantity: [
            'Antall', 'Quantity', 'Qty', 'Mengde', 'Kvantitet', 'Ant',
            'Invoiced quantity', 'Fakturert antall', 'Bestilt antall',
            'Order quantity', 'Ordreantall'
        ],

        // Ordrenummer
        orderNo: [
            'Ordrenr', 'Ordrenummer', 'Order number', 'OrderNo', 'Order No',
            'Order', 'Ordre', 'Bestillingsnr'
        ],

        // Kundenummer/navn
        customer: [
            'Kunde', 'Kundenr', 'Customer', 'CustomerNo', 'Customer Name',
            'Kundenavn', 'Cust', 'Klient'
        ],

        // Fakturanummer
        invoiceNo: [
            'Fakturanr', 'Fakturanummer', 'Invoice No', 'InvoiceNo',
            'Invoice number', 'Faktura'
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
     * Prosesser lagerbeholdningsdata
     */
    static processInventoryData(data, store) {
        data.forEach(row => {
            const articleNo = this.getColumnValue(row, 'articleNumber');
            if (!articleNo) return;

            const item = store.getOrCreate(articleNo);
            if (!item) return;

            item.description = this.getColumnValue(row, 'description') || item.description;
            item.stock = this.parseNumber(this.getColumnValue(row, 'stock'));
            item.reserved = this.parseNumber(this.getColumnValue(row, 'reserved'));
            item.available = this.parseNumber(this.getColumnValue(row, 'available'));
            item.bp = this.parseNumber(this.getColumnValue(row, 'bp'));
            item.max = this.parseNumber(this.getColumnValue(row, 'max'));
            item.status = this.getColumnValue(row, 'status');
            item.supplier = this.getColumnValue(row, 'supplier');
            item.location = this.getColumnValue(row, 'location');
            item.shelf = this.getColumnValue(row, 'location'); // Alias

            // Beregn tilgjengelig hvis ikke satt
            if (item.available === 0 && item.stock > 0) {
                item.available = item.stock - item.reserved;
            }
        });
    }

    /**
     * Prosesser SA-nummer mapping
     */
    static processSANumberData(data, store) {
        data.forEach(row => {
            const articleNo = this.getColumnValue(row, 'articleNumber');
            const saNumber = this.getColumnValue(row, 'saNumber');

            if (articleNo && saNumber) {
                store.setSAMapping(articleNo, saNumber);
            }
        });
    }

    /**
     * Prosesser bestillinger INN (innkjøp)
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

            // Legg til bestilling
            item.addIncomingOrder({
                orderNo: this.getColumnValue(row, 'orderNo'),
                quantity: this.parseNumber(this.getColumnValue(row, 'quantity')),
                expectedDate: this.parseDate(this.getColumnValue(row, 'date')),
                supplier: this.getColumnValue(row, 'supplier'),
                status: this.getColumnValue(row, 'status')
            });
        });
    }

    /**
     * Prosesser fakturert UT (salg)
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

            // Legg til salgsordre
            item.addOutgoingOrder({
                orderNo: this.getColumnValue(row, 'orderNo'),
                quantity: this.parseNumber(this.getColumnValue(row, 'quantity')),
                deliveryDate: this.parseDate(this.getColumnValue(row, 'date')),
                customer: this.getColumnValue(row, 'customer'),
                invoiceNo: this.getColumnValue(row, 'invoiceNo')
            });
        });
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
