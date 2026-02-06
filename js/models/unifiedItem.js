// ===================================
// UNIFIED ITEM MODEL
// Normalisert datamodell for Borregaard Dashboard
// Master.xlsx er SINGLE SOURCE OF TRUTH
// ===================================

/**
 * UnifiedItem - Normalisert datastruktur som samler data fra alle kilder
 *
 * Primærnøkkel: toolsArticleNumber (Artikelnr fra Master.xlsx)
 *
 * FAST DATAANSVAR (4 kilder):
 *   1. Master.xlsx (REQUIRED) → artikkelidentitet, status, lagersaldo,
 *      disponibelt, reservert, BestAntLev, alternativer, kalkylpris, leverandør
 *   2. SA-Nummer.xlsx (OPTIONAL) → SA-nummer mapping (kundens art.nr)
 *   3. Ordrer_Jeeves.xlsx (REQUIRED) → salgshistorikk (KUN salg)
 *   4. Analyse_Lagerplan.xlsx (OPTIONAL) → bestillingspunkt (BP), ordrekvantitet (EOK)
 *
 * AVLEDET VERDI:
 *   estimertVerdi = kalkylPris * lagersaldo (beregnes KUN i modellen)
 *   Ingen hardkodede priser. Ingen fallback-verdier.
 */
class UnifiedItem {
    constructor(toolsArticleNumber) {
        // Identifikatorer
        this.toolsArticleNumber = toolsArticleNumber;
        this.saNumber = null;
        this.description = '';

        // ── Master.xlsx: lagerbeholdning ──
        this.location = '';       // Lokasjon
        this.stock = 0;           // TotLagSaldo
        this.reserved = 0;        // ReservAnt
        this.available = 0;       // DispLagSaldo
        this.kalkylPris = 0;        // Kalkylepris per stk
        this.estimertVerdi = 0;    // kalkylPris × saldo
        this.bp = 0;              // Bestillingspunkt (if present)
        this.max = 0;             // Maksimum lager (if present)
        this.status = '';         // Artikelstatus (raw value)
        this.statusText = null;   // Readable status text
        this.isDiscontinued = false;
        this.supplier = '';
        this.shelf = '';
        this.placementLocation = '';
        this.category = null;
        this._status = 'UKJENT';  // Normalized lifecycle status

        // ── Master.xlsx: incoming orders ──
        this.bestAntLev = 0;            // BestAntLev from Master
        this.bestillingsNummer = '';     // Beställningsnummer from Master

        // ── Master.xlsx: alternatives ──
        this.ersattAvArtikel = '';       // Ersätts av artikel (replacement FOR this article)
        this.ersatterArtikel = '';       // Ersätter artikel (this article REPLACES)

        // ── Legacy incoming orders array (populated from Master BestAntLev) ──
        this.incomingOrders = [];

        // ── Ordrer_Jeeves.xlsx: ordrer UT ──
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

        // ── Planlegging (fra Analyse_Lagerplan.xlsx, valgfri) ──
        // Disse verdiene skal IKKE beregnes og IKKE ha fallback.
        // null = ikke satt / mangler i kildedata
        this.bestillingspunkt = null;  // BP fra Analyse_Lagerplan (reorder point)
        this.ordrekvantitet = null;    // EOK fra Analyse_Lagerplan (order quantity)

        // ── SA-nummer enrichment (from SA-nummer file, optional) ──
        this.saType = null;           // SA-type (e.g. 'Rammeavtale')
        this.saGyldigFra = null;      // Gyldig fra (valid from date)
        this.saGyldigTil = null;      // Gyldig til (valid to date)

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
     * Legg til utgående ordre (salg) — fra Ordrer_Jeeves.xlsx
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
     * Sett SA-data (full enrichment from SA-nummer file)
     * Additive only — never overwrites Master data
     */
    setSAData(saData) {
        if (!saData) return;

        if (saData.saNummer) {
            this.setSANumber(saData.saNummer);
        }
        if (saData.saType != null && saData.saType !== '') {
            this.saType = saData.saType.toString().trim();
        }
        if (saData.saGyldigFra != null) {
            this.saGyldigFra = saData.saGyldigFra;
        }
        if (saData.saGyldigTil != null) {
            this.saGyldigTil = saData.saGyldigTil;
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

        // Beregn salg siste 6 og 12 måneder (fra Ordrer_Jeeves.xlsx)
        this.sales6m = 0;
        this.sales12m = 0;
        this.orderCount = 0;

        const uniqueOrders = new Set();
        let latestSaleDate = null;

        this.outgoingOrders.forEach(order => {
            const orderDate = order.deliveryDate;
            const qty = order.quantity || 0;

            if (orderDate) {
                if (!latestSaleDate || orderDate > latestSaleDate) {
                    latestSaleDate = orderDate;
                }
                if (orderDate >= oneYearAgo) {
                    this.sales12m += qty;
                    uniqueOrders.add(order.orderNo || Math.random().toString());
                }
                if (orderDate >= sixMonthsAgo) {
                    this.sales6m += qty;
                }
            } else {
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

        // Incoming: basert på BestAntLev fra Master.xlsx
        if (this.bestAntLev > 0) {
            this.hasIncomingOrders = true;
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
        // ── Beregn estimert verdi (kalkylepris × saldo) ──
        if (this.kalkylPris > 0 && this.stock > 0) {
            this.estimertVerdi = this.kalkylPris * this.stock;
        } else {
            this.estimertVerdi = 0;
        }

    }

    /**
     * Sjekk om artikkelen har problemer (for Oversikt-modus)
     *
     * Classification rules (Master.xlsx as source):
     *   CRITICAL: DispLagSaldo <= 0 AND BestAntLev == 0
     *   WARNING:  DispLagSaldo > 0 AND DispLagSaldo < threshold
     *   INCOMING: BestAntLev > 0
     */
    getIssues() {
        const issues = [];
        const WARNING_THRESHOLD = 5; // Configurable threshold for low available stock

        // ── CRITICAL: Negativ saldo ──
        if (this.stock < 0) {
            issues.push({ type: 'critical', code: 'NEGATIVE_STOCK', message: 'Negativ saldo' });
        }

        // ── CRITICAL: Reservert > saldo ──
        if (this.reserved > this.stock && this.stock >= 0) {
            issues.push({ type: 'critical', code: 'OVERRESERVED', message: 'Reservert overstiger saldo' });
        }

        // ── CRITICAL: DispLagSaldo <= 0 AND BestAntLev == 0 ──
        if (this.available <= 0 && this.bestAntLev === 0 && this.stock >= 0 && this.sales12m > 0) {
            issues.push({ type: 'critical', code: 'NO_STOCK_NO_INCOMING', message: 'Ingen tilgjengelig og ingen på vei inn' });
        }

        // ── WARNING: Under bestillingspunkt ──
        if (this.bp > 0 && this.stock < this.bp && this.stock >= 0) {
            issues.push({ type: 'warning', code: 'BELOW_BP', message: 'Under bestillingspunkt' });
        }

        // ── WARNING: Lav disponibel beholdning ──
        if (this.available > 0 && this.available < WARNING_THRESHOLD && this.sales12m > 0) {
            issues.push({ type: 'warning', code: 'LOW_AVAILABLE', message: `Lav disponibel (${this.available})` });
        }

        // ── INFO: Ingen bevegelse siste 90 dager ──
        if (this.lastMovementDate) {
            const daysSinceMovement = Math.floor((new Date() - this.lastMovementDate) / (1000 * 60 * 60 * 24));
            if (daysSinceMovement > 90) {
                issues.push({ type: 'info', code: 'NO_MOVEMENT', message: `Ingen bevegelse på ${daysSinceMovement} dager` });
            }
        }

        // ── INFO: Tom saldo men har bestillinger på vei (BestAntLev) ──
        if (this.stock === 0 && this.bestAntLev > 0) {
            issues.push({ type: 'info', code: 'EMPTY_WITH_INCOMING', message: `Tom, men ${this.bestAntLev} på vei` });
        }

        // ── DATA: Mangler SA-nummer ──
        // FASE 6: Artikler uten SA vises ikke i operative visninger (getActiveItems).
        // Beholdt for diagnostikk dersom noen kaller getIssues() på ikke-SA-artikler.
        if (!this.hasSANumber) {
            issues.push({ type: 'data', code: 'NO_SA_NUMBER', message: 'Mangler SA-nummer' });
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
            estimertVerdi: this.estimertVerdi,
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
            bestAntLev: this.bestAntLev,
            bestillingsNummer: this.bestillingsNummer,
            ersattAvArtikel: this.ersattAvArtikel,
            ersatterArtikel: this.ersatterArtikel,
            bestillingspunkt: this.bestillingspunkt,
            ordrekvantitet: this.ordrekvantitet,
            sales6m: Math.round(this.sales6m),
            sales12m: Math.round(this.sales12m),
            orderCount: this.orderCount,
            monthlyConsumption: this.monthlyConsumption,
            daysToEmpty: this.daysToEmpty,
            lastSaleDate: this.lastSaleDate,
            lastMovementDate: this.lastMovementDate,
            hasSANumber: this.hasSANumber,
            saType: this.saType,
            saGyldigFra: this.saGyldigFra,
            saGyldigTil: this.saGyldigTil,
            incomingOrderCount: this.incomingOrders.length,
            incomingQuantity: this.bestAntLev || this.incomingOrders.reduce((sum, o) => sum + (o.quantity || 0), 0),
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
        this.alternativeArticles = new Map(); // sourceArticle -> [{altArticle}]
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
     * Sett plasseringslokasjon mapping
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
        this.saMapping.forEach((saNumber, toolsArticleNumber) => {
            const item = this.items.get(toolsArticleNumber);
            if (item) {
                item.setSANumber(saNumber);
            }
        });
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

            // Incoming: BestAntLev > 0 from Master.xlsx
            if (item.bestAntLev > 0 || item.hasIncomingOrders) {
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
     * Hent ALLE artikler som array (hele Master-listen).
     * Brukes kun internt for diagnostikk og dataprocessing.
     * For operativt innhold, bruk getActiveItems().
     */
    getAllItems() {
        return Array.from(this.items.values());
    }

    /**
     * Hent kun SA-artikler (det operative universet).
     *
     * FASE 6: SA-Nummer.xlsx definerer det operative universet.
     * Alle KPI-er, lister og analyser skal bruke denne metoden.
     * Artikler uten SA-nummer er fortsatt i minne (items), men
     * påvirker ikke tall eller visninger.
     *
     * @returns {UnifiedItem[]} Kun artikler med hasSANumber === true
     */
    getActiveItems() {
        return Array.from(this.items.values()).filter(item => item.hasSANumber);
    }

    /**
     * Hent alle artikler som display-objekter
     */
    getAllDisplayItems() {
        return this.getAllItems().map(item => item.toDisplayObject());
    }

    /**
     * Hent artikler med spesifikke issues (kun SA-artikler)
     */
    getItemsWithIssue(issueCode) {
        return this.getActiveItems().filter(item =>
            item.getIssues().some(issue => issue.code === issueCode)
        );
    }

    /**
     * Hent datakvalitetsrapport
     *
     * FASE 6: Inkluderer nå aktive (SA) artikkelstatistikk.
     * activeArticles = antall SA-artikler (operativt univers)
     * totalArticles = antall rader i Master (databank)
     */
    getDataQualityReport() {
        const active = this.getActiveItems();
        const activeWithIncoming = active.filter(i => i.bestAntLev > 0 || i.hasIncomingOrders).length;
        const activeWithOutgoing = active.filter(i => i.hasOutgoingOrders).length;
        const activeWithIssues = active.filter(i => i.getIssues().length > 0).length;

        return {
            ...this.dataQuality,
            // Operativt univers (SA-artikler)
            activeArticles: active.length,
            activeWithIncoming,
            activeWithOutgoing,
            activeWithIssues,
            // SA-dekning relativt til Master
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
        this.alternativeArticles.clear();
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
