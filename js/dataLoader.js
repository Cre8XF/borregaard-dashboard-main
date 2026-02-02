// ===================================
// ENHANCED DATA LOADER
// CSV/XLSX parsing with smart column mapping and validation
// ===================================

/**
 * DataLoader - Robust data import and validation engine
 * Handles CSV/XLSX files with intelligent column detection
 * Supports Norwegian characters and multiple date formats
 */
class DataLoader {
    /**
     * Column name variations for auto-detection
     * Maps standardized names to common variations
     */
    static COLUMN_VARIANTS = {
        // Item identifiers
        item: ['Item', 'ItemNo', 'Item Number', 'Item No', 'Varenummer', 'Artikkel', 'ArtikkelNr', 'Varenr'],
        itemName: ['Item Name', 'ItemName', 'Name', 'Navn', 'Beskrivelse', 'Description'],

        // Quantities
        quantity: ['Quantity', 'Qty', 'Antall', 'Mengde', 'Kvantitet'],
        stock: ['Stock', 'On Hand', 'Beholdning', 'Lagerbeholdning'],
        min: ['Min', 'Minimum', 'Min Stock', 'Minbeholdning'],
        max: ['Max', 'Maximum', 'Max Stock', 'Maksbeholdning'],

        // Dates and time
        date: ['Date', 'Order Date', 'Dato', 'Ordredato', 'OrderDate'],
        week: ['Week', 'Week Number', 'Uke', 'Ukenummer', 'WeekNo'],
        year: ['Year', 'År', 'Årgang'],

        // Warehouse
        warehouse: ['Warehouse', 'Location', 'Lager', 'Lokasjon'],

        // Customer
        customer: ['Customer', 'CustomerNo', 'Customer Number', 'Kunde', 'Kundenr'],
        customerName: ['Customer Name', 'CustomerName', 'Kundenavn'],

        // Supplier
        supplier: ['Supplier', 'Vendor', 'Leverandør', 'Leverandørnr'],

        // Status
        status: ['Status', 'State', 'Tilstand'],

        // Catalog
        catalog: ['Catalog', 'Katalog', 'Category', 'Kategori'],

        // Price
        price: ['Price', 'Pris', 'Unit Price', 'Enhetspris'],

        // Order
        orderNo: ['Order', 'OrderNo', 'Order Number', 'Ordrenr', 'Ordrenummer'],

        // Lead time
        leadTime: ['Lead Time', 'LeadTime', 'Leveringstid', 'Tid'],

        // Replacement
        replacement: ['Replacement', 'Replace With', 'Erstatning', 'Erstatter'],

        // Notes
        notes: ['Notes', 'Comments', 'Notater', 'Kommentarer', 'Beskrivelse']
    };

    /**
     * Load and parse CSV file
     * @param {File} file - CSV file to load
     * @returns {Promise<Object>} Parsed data with metadata
     */
    static async loadCSV(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();

            reader.onload = (e) => {
                try {
                    const text = e.target.result;
                    const parsed = DataLoader.parseCSV(text);

                    resolve({
                        data: parsed.data,
                        columns: parsed.columns,
                        rowCount: parsed.data.length,
                        fileName: file.name,
                        fileType: 'CSV'
                    });
                } catch (error) {
                    reject(new Error(`CSV parsing feil: ${error.message}`));
                }
            };

            reader.onerror = () => reject(new Error('Kunne ikke lese CSV-fil'));

            // Read with UTF-8 encoding to support Norwegian characters
            reader.readAsText(file, 'UTF-8');
        });
    }

    /**
     * Parse CSV text with proper handling of quotes and delimiters
     * @param {string} text - CSV text content
     * @returns {Object} Parsed data and columns
     */
    static parseCSV(text) {
        if (!text || text.trim().length === 0) {
            throw new Error('Filen er tom');
        }

        // Detect delimiter (comma, semicolon, or tab)
        const delimiter = this.detectDelimiter(text);

        // Split into lines, handling different line endings
        const lines = text.split(/\r?\n/).filter(line => line.trim());

        if (lines.length === 0) {
            throw new Error('Ingen data funnet i filen');
        }

        // Parse header row
        const headers = this.parseCSVRow(lines[0], delimiter);

        if (headers.length === 0) {
            throw new Error('Ingen kolonner funnet');
        }

        // Parse data rows
        const data = [];
        const errors = [];

        for (let i = 1; i < lines.length; i++) {
            try {
                const values = this.parseCSVRow(lines[i], delimiter);

                // Skip empty rows
                if (values.every(v => !v || v.trim() === '')) {
                    continue;
                }

                const obj = {};
                headers.forEach((header, index) => {
                    obj[header] = values[index] ? values[index].trim() : '';
                });

                data.push(obj);
            } catch (error) {
                errors.push({ line: i + 1, error: error.message });
            }
        }

        if (errors.length > 0 && data.length === 0) {
            throw new Error(`Parsing feilet: ${errors.length} rader med feil`);
        }

        return {
            data: data,
            columns: headers,
            errors: errors
        };
    }

    /**
     * Detect CSV delimiter
     */
    static detectDelimiter(text) {
        const firstLine = text.split(/\r?\n/)[0];

        const delimiters = [',', ';', '\t'];
        const counts = delimiters.map(d => ({
            delimiter: d,
            count: (firstLine.match(new RegExp('\\' + d, 'g')) || []).length
        }));

        counts.sort((a, b) => b.count - a.count);
        return counts[0].count > 0 ? counts[0].delimiter : ',';
    }

    /**
     * Parse a single CSV row handling quotes properly
     */
    static parseCSVRow(row, delimiter = ',') {
        const values = [];
        let current = '';
        let inQuotes = false;

        for (let i = 0; i < row.length; i++) {
            const char = row[i];
            const nextChar = row[i + 1];

            if (char === '"') {
                if (inQuotes && nextChar === '"') {
                    current += '"';
                    i++; // Skip next quote
                } else {
                    inQuotes = !inQuotes;
                }
            } else if (char === delimiter && !inQuotes) {
                values.push(current);
                current = '';
            } else {
                current += char;
            }
        }

        values.push(current);
        return values.map(v => v.trim());
    }

    /**
     * Load and parse Excel file
     * @param {File} file - Excel file to load
     * @returns {Promise<Object>} Parsed data with metadata
     */
    static async loadExcel(file) {
        return new Promise((resolve, reject) => {
            if (typeof XLSX === 'undefined') {
                reject(new Error('XLSX library ikke lastet. Vennligst last ned xlsx.full.min.js til lib/ mappen.'));
                return;
            }

            const reader = new FileReader();

            reader.onload = (e) => {
                try {
                    const data = new Uint8Array(e.target.result);
                    const workbook = XLSX.read(data, { type: 'array', cellDates: true });

                    // Use first sheet
                    const firstSheetName = workbook.SheetNames[0];
                    const worksheet = workbook.Sheets[firstSheetName];

                    // Convert to JSON
                    const jsonData = XLSX.utils.sheet_to_json(worksheet, {
                        raw: false,
                        defval: '',
                        dateNF: 'yyyy-mm-dd'
                    });

                    if (jsonData.length === 0) {
                        reject(new Error('Excel-arket er tomt'));
                        return;
                    }

                    const columns = Object.keys(jsonData[0]);

                    resolve({
                        data: jsonData,
                        columns: columns,
                        rowCount: jsonData.length,
                        fileName: file.name,
                        fileType: 'Excel',
                        sheetName: firstSheetName
                    });
                } catch (error) {
                    reject(new Error(`Excel parsing feil: ${error.message}`));
                }
            };

            reader.onerror = () => reject(new Error('Kunne ikke lese Excel-fil'));
            reader.readAsArrayBuffer(file);
        });
    }

    /**
     * Auto-detect column mapping based on column names
     * @param {Array} columns - Actual column names from file
     * @returns {Object} Mapping from standard names to actual column names
     */
    static detectColumnMapping(columns) {
        const mapping = {};
        const normalizedColumns = columns.map(col => ({
            original: col,
            normalized: this.normalizeColumnName(col)
        }));

        // Try to match each standard column
        Object.keys(this.COLUMN_VARIANTS).forEach(standardName => {
            const variants = this.COLUMN_VARIANTS[standardName];

            for (const variant of variants) {
                const normalizedVariant = this.normalizeColumnName(variant);
                const match = normalizedColumns.find(nc => nc.normalized === normalizedVariant);

                if (match) {
                    mapping[standardName] = match.original;
                    break;
                }
            }
        });

        return mapping;
    }

    /**
     * Normalize column name for comparison
     */
    static normalizeColumnName(name) {
        return name
            .toLowerCase()
            .replace(/[_\s-]/g, '')
            .replace(/[æå]/g, 'a')
            .replace(/ø/g, 'o');
    }

    /**
     * Validate data against required columns
     * @param {Array} data - Data to validate
     * @param {Array} requiredColumns - Required column names
     * @returns {Object} Validation result with details
     */
    static validateData(data, requiredColumns = []) {
        const errors = [];
        const warnings = [];

        // Check if data exists
        if (!data || data.length === 0) {
            return {
                valid: false,
                errors: ['Ingen data å validere'],
                warnings: []
            };
        }

        // Check for required columns
        const actualColumns = Object.keys(data[0]);
        const missingColumns = requiredColumns.filter(col => !actualColumns.includes(col));

        if (missingColumns.length > 0) {
            errors.push(`Mangler påkrevde kolonner: ${missingColumns.join(', ')}`);
        }

        // Validate data types and values
        data.forEach((row, index) => {
            const lineNumber = index + 2; // +2 because index starts at 0 and row 1 is headers

            // Check for completely empty rows
            const values = Object.values(row);
            if (values.every(v => !v || v.toString().trim() === '')) {
                warnings.push(`Linje ${lineNumber}: Tom rad`);
            }

            // Validate numeric fields
            const numericFields = ['quantity', 'stock', 'min', 'max', 'price'];
            numericFields.forEach(field => {
                if (row[field] && row[field] !== '') {
                    const num = parseFloat(row[field]);
                    if (isNaN(num)) {
                        errors.push(`Linje ${lineNumber}: ${field} er ikke et gyldig tall`);
                    } else if (num < 0) {
                        warnings.push(`Linje ${lineNumber}: ${field} er negativt`);
                    }
                }
            });

            // Validate date fields
            if (row.date && row.date !== '') {
                const date = this.parseDate(row.date);
                if (!date || isNaN(date.getTime())) {
                    errors.push(`Linje ${lineNumber}: Ugyldig dato format`);
                }
            }
        });

        return {
            valid: errors.length === 0,
            errors: errors,
            warnings: warnings,
            rowCount: data.length,
            columnCount: actualColumns.length
        };
    }

    /**
     * Parse date from multiple formats
     * @param {string} dateStr - Date string to parse
     * @returns {Date} Parsed date object
     */
    static parseDate(dateStr) {
        if (!dateStr) return null;

        // Try ISO format (YYYY-MM-DD)
        let date = new Date(dateStr);
        if (!isNaN(date.getTime())) return date;

        // Try DD.MM.YYYY format (Norwegian)
        const ddmmyyyy = dateStr.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
        if (ddmmyyyy) {
            return new Date(ddmmyyyy[3], ddmmyyyy[2] - 1, ddmmyyyy[1]);
        }

        // Try DD/MM/YYYY format
        const ddmmyyyy2 = dateStr.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
        if (ddmmyyyy2) {
            return new Date(ddmmyyyy2[3], ddmmyyyy2[2] - 1, ddmmyyyy2[1]);
        }

        return null;
    }

    /**
     * Calculate ISO week number from date
     * @param {Date} date - Date object
     * @returns {number} ISO week number
     */
    static getWeekNumber(date) {
        if (!(date instanceof Date) || isNaN(date.getTime())) return 0;

        const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
        const dayNum = d.getUTCDay() || 7;
        d.setUTCDate(d.getUTCDate() + 4 - dayNum);
        const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
        return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
    }

    /**
     * Auto-categorize data based on filename and column structure
     * @param {Object} loadedData - Data loaded from file
     * @returns {string} Category name
     */
    static categorizeData(loadedData) {
        const fileName = loadedData.fileName.toLowerCase();
        const columns = loadedData.columns.map(c => c.toLowerCase()).join('|');

        // Check filename first
        if (fileName.includes('order') || fileName.includes('ordre')) {
            return 'shutdown';
        }
        if (fileName.includes('inventory') || fileName.includes('lager') || fileName.includes('stock')) {
            return 'inventory';
        }
        if (fileName.includes('assort') || fileName.includes('sortiment') || fileName.includes('catalog')) {
            return 'assortment';
        }
        if (fileName.includes('issue') || fileName.includes('problem') || fileName.includes('flow')) {
            return 'flowIssues';
        }

        // Check column structure
        if (columns.includes('warehouse') || columns.includes('lager')) {
            if (columns.includes('stock') || columns.includes('beholdning') || columns.includes('min')) {
                return 'inventory';
            }
        }

        if (columns.includes('week') || columns.includes('uke')) {
            return 'shutdown';
        }

        if (columns.includes('status') && (columns.includes('catalog') || columns.includes('katalog'))) {
            return 'assortment';
        }

        // Default to shutdown (order data)
        return 'shutdown';
    }

    /**
     * Apply column mapping to data
     * @param {Array} data - Original data
     * @param {Object} mapping - Column mapping
     * @returns {Array} Data with standardized column names
     */
    static applyColumnMapping(data, mapping) {
        return data.map(row => {
            const mappedRow = { ...row };

            Object.keys(mapping).forEach(standardName => {
                const actualName = mapping[standardName];
                if (row[actualName] !== undefined) {
                    mappedRow[standardName] = row[actualName];
                }
            });

            return mappedRow;
        });
    }

    /**
     * Generate data quality report
     * @param {Array} data - Data to analyze
     * @returns {Object} Quality report
     */
    static generateQualityReport(data) {
        if (!data || data.length === 0) {
            return { quality: 'unknown', issues: ['No data'] };
        }

        const report = {
            totalRows: data.length,
            totalColumns: Object.keys(data[0]).length,
            emptyValues: 0,
            uniqueRows: 0,
            duplicates: 0,
            quality: 'good',
            issues: []
        };

        // Count empty values
        data.forEach(row => {
            Object.values(row).forEach(value => {
                if (!value || value.toString().trim() === '') {
                    report.emptyValues++;
                }
            });
        });

        // Calculate completeness
        const totalCells = report.totalRows * report.totalColumns;
        const completeness = ((totalCells - report.emptyValues) / totalCells * 100).toFixed(1);

        if (completeness < 70) {
            report.quality = 'poor';
            report.issues.push(`Lav datakvalitet: ${completeness}% komplett`);
        } else if (completeness < 90) {
            report.quality = 'fair';
            report.issues.push(`Moderat datakvalitet: ${completeness}% komplett`);
        }

        report.completeness = completeness;

        return report;
    }
}

/**
 * Normaliser Item status fra artikkelstatus.xlsx til lifecycle-kategori
 * @param {string} raw - Rå status-streng fra Qlik-eksport
 * @returns {string} 'AKTIV' | 'UTGAENDE' | 'UTGAATT' | 'UKJENT'
 */
function normalizeItemStatus(raw) {
    if (!raw) return 'UKJENT';
    const s = raw.toString().trim();
    if (!s) return 'UKJENT';
    if (s.startsWith('3 -')) return 'UTGAENDE';
    if (s.startsWith('4 -')) return 'UTGAATT';
    return 'AKTIV';
}

// Export for use in other modules
window.DataLoader = DataLoader;
window.normalizeItemStatus = normalizeItemStatus;
