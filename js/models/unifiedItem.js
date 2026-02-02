// ===================================
// UNIFIED ITEM MODEL
// Normalisert datamodell for Borregaard Dashboard
// ===================================

/**
 * UnifiedItem - Normalisert datastruktur som samler data fra alle kilder
 *
 * Primærnøkkel: toolsArticleNumber
 * Sekundærnøkkel: saNumber (der det finnes)
 */
class UnifiedItem {
    constructor(toolsArticleNumber) {
        // Identifikatorer
        this.toolsArticleNumber = toolsArticleNumber;
        this.saNumber = null;
        this.description = '';

        // Lagerbeholdning (fra Lagerbeholdning.xlsx)
        this.location = '';
        this.stock = 0;
        this.reserved = 0;
        this.available = 0;
        this.bp = 0;          // Bestillingspunkt
        this.max = 0;         // Maksimum lager
        this.status = '';     // Artikkelstatus
        this.statusText = null;   // Tekstlig artikkelstatus (f.eks. "planned discontinued")
        this.isDiscontinued = false; // Flagg: artikkel skal utgå
        this.supplier = '';
        this.shelf = '';      // Hylleplassering
        this.placementLocation = ''; // Plasseringslokasjon fra SA-fil
        this.category = null; // Varugrupp/Artikelgrupp fra Jeeves
        this._status = 'UKJENT'; // Lifecycle-status fra artikkelstatus.xlsx (Qlik)

        // Bestillinger INN (fra Bestillinger.xlsx)
        this.incomingOrders = [];

        // Ordrer UT (fra Fakturert.xlsx)
        this.outgoingOrders = [];

        // Beregnede felt (populeres etter datasamling)
        this.sales6m = 0;
        this.sales12m = 0;
        this.orderCount = 0;
        this.monthlyConsumption = 0;
        this.daysToEmpty = 999999;
        this.lastMovementDate = null;
        this.lastSaleDate = null;
        this.lastOrderDate = null;

        // Metadata
        this.hasSANumber = false;
        this.hasIncomingOrders = false;
        this.hasOutgoingOrders = false;
    }

    /**
     * Legg til innkommende bestilling
     */
    addIncomingOrder(order) {
        this.incomingOrders.push({
            orderNo: order.orderNo || '',
            quantity: parseFloat(order.quantity) || 0,
            expectedDate: order.expectedDate || null,
            supplier: order.supplier || '',
            status: order.status || ''
        });
        this.hasIncomingOrders = true;
    }

    /**
     * Legg til utgående ordre (salg)
     */
    addOutgoingOrder(order) {
        this.outgoingOrders.push({
            orderNo: order.orderNo || '',
            quantity: parseFloat(order.quantity) || 0,
            deliveryDate: order.deliveryDate || null,
            customer: order.customer || '',
            deliveryLocation: order.deliveryLocation || '',
            invoiceNo: order.invoiceNo || ''
        });
        this.hasOutgoingOrders = true;
    }

    /**
     * Sett SA-nummer
     */
    setSANumber(saNumber) {
        if (saNumber && saNumber.toString().trim() !== '') {
            this.saNumber = saNumber.toString().trim();
            this.hasSANumber = true;
        }
    }

    /**
     * Beregn alle avledede verdier
     * Skal kalles etter at all data er samlet
     */
    calculate() {
        const now = new Date();
        const sixMonthsAgo = new Date();
        sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
        const oneYearAgo = new Date();
        oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);

        // Beregn salg siste 6 og 12 måneder
        this.sales6m = 0;
        this.sales12m = 0;
        this.orderCount = 0;

        const uniqueOrders = new Set();
        let latestSaleDate = null;

        this.outgoingOrders.forEach(order => {
            const orderDate = order.deliveryDate;
            const qty = order.quantity || 0;

            if (orderDate) {
                // Oppdater siste salgsdato
                if (!latestSaleDate || orderDate > latestSaleDate) {
                    latestSaleDate = orderDate;
                }

                // Akkumuler salg
                if (orderDate >= oneYearAgo) {
                    this.sales12m += qty;
                    uniqueOrders.add(order.orderNo || Math.random().toString());
                }
                if (orderDate >= sixMonthsAgo) {
                    this.sales6m += qty;
                }
            } else {
                // Hvis ingen dato, anta nylig
                this.sales12m += qty;
                uniqueOrders.add(order.orderNo || Math.random().toString());
            }
        });

        this.orderCount = uniqueOrders.size;
        this.lastSaleDate = latestSaleDate;

        // Beregn månedlig forbruk og dager til tomt
        this.monthlyConsumption = this.sales12m / 12;

        if (this.monthlyConsumption > 0) {
            const dailyConsumption = this.sales12m / 365;
            this.daysToEmpty = Math.round(this.stock / dailyConsumption);
        } else {
            this.daysToEmpty = 999999;
        }

        // Finn siste innkommende bestillingsdato
        let latestOrderDate = null;
        this.incomingOrders.forEach(order => {
            if (order.expectedDate && (!latestOrderDate || order.expectedDate > latestOrderDate)) {
                latestOrderDate = order.expectedDate;
            }
        });
        this.lastOrderDate = latestOrderDate;

        // Siste bevegelse (salg eller bestilling)
        if (latestSaleDate && latestOrderDate) {
            this.lastMovementDate = latestSaleDate > latestOrderDate ? latestSaleDate : latestOrderDate;
        } else {
            this.lastMovementDate = latestSaleDate || latestOrderDate;
        }

        // Beregn tilgjengelig mengde hvis ikke satt
        if (this.available === 0 && this.stock > 0) {
            this.available = this.stock - this.reserved;
        }
    }

    /**
     * Sjekk om artikkelen har problemer (for Oversikt-modus)
     */
    getIssues() {
        const issues = [];

        // Negativ saldo
        if (this.stock < 0) {
            issues.push({ type: 'critical', code: 'NEGATIVE_STOCK', message: 'Negativ saldo' });
        }

        // Under bestillingspunkt
        if (this.bp > 0 && this.stock < this.bp && this.stock >= 0) {
            issues.push({ type: 'warning', code: 'BELOW_BP', message: 'Under bestillingspunkt' });
        }

        // Reservert > saldo
        if (this.reserved > this.stock) {
            issues.push({ type: 'critical', code: 'OVERRESERVED', message: 'Reservert overstiger saldo' });
        }

        // Ingen bevegelse siste 90 dager
        if (this.lastMovementDate) {
            const daysSinceMovement = Math.floor((new Date() - this.lastMovementDate) / (1000 * 60 * 60 * 24));
            if (daysSinceMovement > 90) {
                issues.push({ type: 'info', code: 'NO_MOVEMENT', message: `Ingen bevegelse på ${daysSinceMovement} dager` });
            }
        }

        // Mangler SA-nummer (datakvalitet)
        if (!this.hasSANumber) {
            issues.push({ type: 'data', code: 'NO_SA_NUMBER', message: 'Mangler SA-nummer' });
        }

        // Tom saldo men har bestillinger på vei
        if (this.stock === 0 && this.hasIncomingOrders) {
            const pendingQty = this.incomingOrders.reduce((sum, o) => sum + (o.quantity || 0), 0);
            if (pendingQty > 0) {
                issues.push({ type: 'info', code: 'EMPTY_WITH_INCOMING', message: `Tom, men ${pendingQty} på vei` });
            }
        }

        return issues;
    }

    /**
     * Konverter til enkelt objekt for visning
     */
    toDisplayObject() {
        return {
            toolsArticleNumber: this.toolsArticleNumber,
            saNumber: this.saNumber,
            description: this.description,
            location: this.location,
            stock: this.stock,
            reserved: this.reserved,
            available: this.available,
            bp: this.bp,
            max: this.max,
            status: this.status,
            statusText: this.statusText,
            isDiscontinued: this.isDiscontinued,
            supplier: this.supplier,
            shelf: this.shelf,
            placementLocation: this.placementLocation,
            category: this.category,
            _status: this._status,
            sales6m: Math.round(this.sales6m),
            sales12m: Math.round(this.sales12m),
            orderCount: this.orderCount,
            monthlyConsumption: this.monthlyConsumption,
            daysToEmpty: this.daysToEmpty,
            lastSaleDate: this.lastSaleDate,
            lastMovementDate: this.lastMovementDate,
            hasSANumber: this.hasSANumber,
            incomingOrderCount: this.incomingOrders.length,
            incomingQuantity: this.incomingOrders.reduce((sum, o) => sum + (o.quantity || 0), 0),
            issues: this.getIssues()
        };
    }
}

/**
 * UnifiedDataStore - Samler og håndterer alle UnifiedItem-objekter
 */
class UnifiedDataStore {
    constructor() {
        this.items = new Map(); // toolsArticleNumber -> UnifiedItem
        this.saMapping = new Map(); // toolsArticleNumber -> saNumber
        this.placementMapping = new Map(); // toolsArticleNumber -> placementLocation
        this.dataQuality = {
            totalArticles: 0,
            withSANumber: 0,
            withoutSANumber: 0,
            withIncoming: 0,
            withOutgoing: 0,
            withIssues: 0
        };
    }

    /**
     * Hent eller opprett artikkel
     */
    getOrCreate(toolsArticleNumber) {
        if (!toolsArticleNumber || toolsArticleNumber.toString().trim() === '') {
            return null;
        }

        const key = toolsArticleNumber.toString().trim();

        if (!this.items.has(key)) {
            this.items.set(key, new UnifiedItem(key));
        }

        return this.items.get(key);
    }

    /**
     * Sett SA-nummer mapping
     */
    setSAMapping(toolsArticleNumber, saNumber) {
        if (toolsArticleNumber && saNumber) {
            this.saMapping.set(toolsArticleNumber.toString().trim(), saNumber.toString().trim());
        }
    }

    /**
     * Sett plasseringslokasjon mapping (fra SA-fil)
     */
    setPlacementLocation(toolsArticleNumber, placementLocation) {
        if (toolsArticleNumber && placementLocation) {
            this.placementMapping.set(toolsArticleNumber.toString().trim(), placementLocation.toString().trim());
        }
    }

    /**
     * Apliser SA-nummer og plasseringslokasjon til alle artikler
     */
    applySANumbers() {
        // Apliser SA-nummer
        this.saMapping.forEach((saNumber, toolsArticleNumber) => {
            const item = this.items.get(toolsArticleNumber);
            if (item) {
                item.setSANumber(saNumber);
            }
        });

        // Apliser plasseringslokasjon
        this.placementMapping.forEach((placementLocation, toolsArticleNumber) => {
            const item = this.items.get(toolsArticleNumber);
            if (item) {
                item.placementLocation = placementLocation;
            }
        });
    }

    /**
     * Beregn alle artikler og oppdater datakvalitet
     */
    calculateAll() {
        this.dataQuality = {
            totalArticles: this.items.size,
            withSANumber: 0,
            withoutSANumber: 0,
            withIncoming: 0,
            withOutgoing: 0,
            withIssues: 0
        };

        this.items.forEach(item => {
            item.calculate();

            if (item.hasSANumber) {
                this.dataQuality.withSANumber++;
            } else {
                this.dataQuality.withoutSANumber++;
            }

            if (item.hasIncomingOrders) {
                this.dataQuality.withIncoming++;
            }

            if (item.hasOutgoingOrders) {
                this.dataQuality.withOutgoing++;
            }

            if (item.getIssues().length > 0) {
                this.dataQuality.withIssues++;
            }
        });
    }

    /**
     * Hent alle artikler som array
     */
    getAllItems() {
        return Array.from(this.items.values());
    }

    /**
     * Hent alle artikler som display-objekter
     */
    getAllDisplayItems() {
        return this.getAllItems().map(item => item.toDisplayObject());
    }

    /**
     * Hent artikler med spesifikke issues
     */
    getItemsWithIssue(issueCode) {
        return this.getAllItems().filter(item =>
            item.getIssues().some(issue => issue.code === issueCode)
        );
    }

    /**
     * Hent datakvalitetsrapport
     */
    getDataQualityReport() {
        return {
            ...this.dataQuality,
            saNumberCoverage: this.dataQuality.totalArticles > 0
                ? Math.round((this.dataQuality.withSANumber / this.dataQuality.totalArticles) * 100)
                : 0
        };
    }

    /**
     * Tøm alle data
     */
    clear() {
        this.items.clear();
        this.saMapping.clear();
        this.placementMapping.clear();
        this.dataQuality = {
            totalArticles: 0,
            withSANumber: 0,
            withoutSANumber: 0,
            withIncoming: 0,
            withOutgoing: 0,
            withIssues: 0
        };
    }
}

// Eksporter til global scope
window.UnifiedItem = UnifiedItem;
window.UnifiedDataStore = UnifiedDataStore;
