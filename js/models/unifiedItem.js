// ===================================
// UNIFIED ITEM MODEL — FASE 6.1
// SA-nummer (Kunds artikkelnummer) er primærnøkkel
// Master.xlsx er datakilde for lager/status
// ===================================

/**
 * UnifiedItem - Normalisert datastruktur for Borregaard Dashboard
 *
 * FASE 6.1: Re-keyed til SA-nummer som primær identitet.
 *
 * Primærnøkkel: saNumber (Kundens artnr fra SA-fil)
 * Sekundær:     toolsArticleNumber (Artikelnr fra Master.xlsx)
 *
 * FAST DATAANSVAR (4 kilder):
 *   1. SA-fil (REQUIRED) → oppretter items, definerer operativt univers
 *   2. Master.xlsx (REQUIRED) → lagersaldo, status, kalkylpris, alternativer, leverandør
 *   3. Ordrer_Jeeves.xlsx (REQUIRED) → salgshistorikk (KUN salg)
 *   4. Analyse_Lagerplan.xlsx (OPTIONAL) → bestillingspunkt (BP), ordrekvantitet (EOK)
 *
 * AVLEDET VERDI:
 *   estimertVerdi = kalkylPris * lagersaldo (beregnes KUN i modellen)
 */
class UnifiedItem {
    constructor(saNumber, toolsArticleNumber) {
        // ── Identitet (FASE 6.1) ──
        // saNumber = primær ID (Kunds artikkelnummer)
        // toolsArticleNumber = sekundær koblingsnøkkel (teknisk)
        this.saNumber = saNumber;
        this.toolsArticleNumber = toolsArticleNumber || '';
        this.description = '';

        // ── Master.xlsx: lagerbeholdning ──
        this.location = '';       // Lokasjon
        this.stock = 0;           // TotLagSaldo
        this.reserved = 0;        // ReservAnt
        this.available = 0;       // DispLagSaldo
        this.kalkylPris = 0;      // Kalkylepris per stk
        this.estimertVerdi = 0;   // kalkylPris × saldo
        this.max = 0;             // Maksimum lager
        this.status = '';         // Artikelstatus (raw value)
        this.statusText = null;   // Readable status text
        this.isDiscontinued = false;
        this.supplier = '';
        this.supplierId = null;   // Supplier ID (from Ordrer_Jeeves.xlsx)
        this.brand = null;        // Brand (from Ordrer_Jeeves.xlsx)
        this.category = null;
        this._status = 'UKJENT';  // Normalized lifecycle status

        // ── Master.xlsx: incoming orders ──
        this.bestAntLev = 0;            // BestAntLev from Master
        this.bestillingsNummer = '';     // Beställningsnummer from Master

        // ── Master.xlsx: alternatives ──
        this.ersattAvArtikel = '';       // Ersätts av artikel

        // ── Incoming orders array (populated from Master BestAntLev) ──
        this.incomingOrders = [];

        // ── Ordrer_Jeeves.xlsx: ordrer UT ──
        this.outgoingOrders = [];

        // ── Beregnede felt ──
        this.sales6m = 0;
        this.sales12m = 0;
        this.orderCount = 0;
        this.monthlyConsumption = 0;
        this.daysToEmpty = 999999;
        this.lastMovementDate = null;
        this.lastSaleDate = null;
        this.lastOrderDate = null;

        // ── Planlegging (fra Analyse_Lagerplan.xlsx, valgfri) ──
        this.bestillingspunkt = null;  // BP fra Analyse_Lagerplan
        this.ordrekvantitet = null;    // EOK fra Analyse_Lagerplan

        // ── SA-fil: hylleplassering ──
        this.lagerplass = null;   // Kundens artbeskr. fra SA-fil (data (4).xlsx)

        // ── SA-avtaleinformasjon (from SA-nummer file) ──
        this.saType = null;
        this.saGyldigFra = null;
        this.saGyldigTil = null;

        // ── Metadata ──
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
     * Sett SA-avtaleinformasjon (type, gyldighet)
     */
    setSAData(saData) {
        if (!saData) return;
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
     */
    calculate() {
        const sixMonthsAgo = new Date();
        sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
        const oneYearAgo = new Date();
        oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);

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

        this.monthlyConsumption = this.sales12m / 12;

        if (this.monthlyConsumption > 0) {
            const dailyConsumption = this.sales12m / 365;
            this.daysToEmpty = Math.round(this.stock / dailyConsumption);
        } else {
            this.daysToEmpty = 999999;
        }

        if (this.bestAntLev > 0) {
            this.hasIncomingOrders = true;
        }

        let latestOrderDate = null;
        this.incomingOrders.forEach(order => {
            if (order.expectedDate && (!latestOrderDate || order.expectedDate > latestOrderDate)) {
                latestOrderDate = order.expectedDate;
            }
        });
        this.lastOrderDate = latestOrderDate;

        if (latestSaleDate && latestOrderDate) {
            this.lastMovementDate = latestSaleDate > latestOrderDate ? latestSaleDate : latestOrderDate;
        } else {
            this.lastMovementDate = latestSaleDate || latestOrderDate;
        }

        if (this.available === 0 && this.stock > 0) {
            this.available = this.stock - this.reserved;
        }

        if (this.kalkylPris > 0 && this.stock > 0) {
            this.estimertVerdi = this.kalkylPris * this.stock;
        } else {
            this.estimertVerdi = 0;
        }
    }

    /**
     * Canonical discontinued check.
     * Detects utgående / discontinued / inactive statuses from Master.xlsx normalization.
     */
    isItemDiscontinued() {
        if (this._status === 'UTGAENDE' || this._status === 'UTGAATT') return true;
        if (this.isDiscontinued) return true;
        const raw = (this.status || '').toString().toLowerCase();
        if (raw.includes('utgå') || raw.includes('discontinued') || raw.includes('avvikle')) return true;
        if (raw === '3' || raw === '4' || raw.startsWith('3 -') || raw.startsWith('4 -')) return true;
        return false;
    }

    /**
     * Get effective availability for BP checks (alternative-aware).
     *
     * For discontinued items: resolves alternative via store and uses alt's availability.
     * For active items: stock + bestAntLev.
     *
     * @param {UnifiedDataStore} [store] - Required for alternative resolution on discontinued items
     * @returns {{ effectiveAvailable: number, altItemNo: string|null, altAvailable: number|null, bpStatus: string }}
     */
    getEffectiveAvailability(store) {
        const bpVal = this.bestillingspunkt;
        const ownAvailable = this.stock + (this.bestAntLev || 0);

        if (!this.isItemDiscontinued() || !store) {
            // Active item — straightforward
            const bpStatus = (bpVal !== null && bpVal > 0 && ownAvailable < bpVal) ? 'Under BP' : 'OK';
            return { effectiveAvailable: ownAvailable, altItemNo: null, altAvailable: null, bpStatus };
        }

        // Discontinued — resolve alternative
        const altStatus = store.resolveAlternativeStatus(this);
        if (altStatus.classification === 'NO_ALTERNATIVE' || altStatus.classification === 'NOT_IN_SA') {
            // No usable alt — use own availability, but flag transition
            const bpStatus = (bpVal !== null && bpVal > 0)
                ? 'Utgående – overgang mangler' : 'Utgående';
            return { effectiveAvailable: ownAvailable, altItemNo: null, altAvailable: null, bpStatus };
        }

        const altAvail = (altStatus.altStock || 0) + (altStatus.altBestAntLev || 0);

        if (bpVal !== null && bpVal > 0 && altAvail >= bpVal) {
            return {
                effectiveAvailable: altAvail,
                altItemNo: altStatus.altToolsArtNr,
                altAvailable: altAvail,
                bpStatus: 'Utgående – dekket av alternativ'
            };
        }

        return {
            effectiveAvailable: altAvail,
            altItemNo: altStatus.altToolsArtNr,
            altAvailable: altAvail,
            bpStatus: (bpVal !== null && bpVal > 0) ? 'Utgående – overgang mangler' : 'Utgående'
        };
    }

    /**
     * Sjekk om artikkelen har problemer
     */
    getIssues() {
        const issues = [];
        const WARNING_THRESHOLD = 5;

        if (this.stock < 0) {
            issues.push({ type: 'critical', code: 'NEGATIVE_STOCK', message: 'Negativ saldo' });
        }

        if (this.reserved > this.stock && this.stock >= 0) {
            issues.push({ type: 'critical', code: 'OVERRESERVED', message: 'Reservert overstiger saldo' });
        }

        if (this.available <= 0 && this.bestAntLev === 0 && this.stock >= 0 && this.sales12m > 0) {
            issues.push({ type: 'critical', code: 'NO_STOCK_NO_INCOMING', message: 'Ingen tilgjengelig og ingen på vei inn' });
        }

        if (this.bestillingspunkt !== null && this.bestillingspunkt > 0 && this.stock < this.bestillingspunkt && this.stock >= 0) {
            if (this.isItemDiscontinued()) {
                issues.push({ type: 'warning', code: 'BELOW_BP', message: 'Under BP – utgående, overgang nødvendig' });
            } else {
                issues.push({ type: 'warning', code: 'BELOW_BP', message: 'Under bestillingspunkt' });
            }
        }

        if (this.available > 0 && this.available < WARNING_THRESHOLD && this.sales12m > 0) {
            issues.push({ type: 'warning', code: 'LOW_AVAILABLE', message: `Lav disponibel (${this.available})` });
        }

        if (this.lastMovementDate) {
            const daysSinceMovement = Math.floor((new Date() - this.lastMovementDate) / (1000 * 60 * 60 * 24));
            if (daysSinceMovement > 90) {
                issues.push({ type: 'info', code: 'NO_MOVEMENT', message: `Ingen bevegelse på ${daysSinceMovement} dager` });
            }
        }

        if (this.stock === 0 && this.bestAntLev > 0) {
            issues.push({ type: 'info', code: 'EMPTY_WITH_INCOMING', message: `Tom, men ${this.bestAntLev} på vei` });
        }

        // FASE 6.1: Ikke lenger behov for NO_SA_NUMBER — alle items HAR SA-nummer

        return issues;
    }

    /**
     * Konverter til enkelt objekt for visning
     */
    toDisplayObject() {
        return {
            saNumber: this.saNumber,
            toolsArticleNumber: this.toolsArticleNumber,
            description: this.description,
            location: this.location,
            stock: this.stock,
            estimertVerdi: this.estimertVerdi,
            reserved: this.reserved,
            available: this.available,
            bestillingspunkt: this.bestillingspunkt,
            max: this.max,
            status: this.status,
            statusText: this.statusText,
            isDiscontinued: this.isDiscontinued,
            supplier: this.supplier,
            supplierId: this.supplierId,
            brand: this.brand,
            category: this.category,
            _status: this._status,
            bestAntLev: this.bestAntLev,
            bestillingsNummer: this.bestillingsNummer,
            ersattAvArtikel: this.ersattAvArtikel,
            ordrekvantitet: this.ordrekvantitet,
            sales6m: Math.round(this.sales6m),
            sales12m: Math.round(this.sales12m),
            orderCount: this.orderCount,
            monthlyConsumption: this.monthlyConsumption,
            daysToEmpty: this.daysToEmpty,
            lastSaleDate: this.lastSaleDate,
            lastMovementDate: this.lastMovementDate,
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
 * UnifiedDataStore - Samler alle UnifiedItem-objekter
 *
 * FASE 6.1: items er nå keyed på saNumber (Kunds artikkelnummer).
 * toolsLookup gir reverse-oppslag fra toolsArticleNumber → saNumber.
 * Alle items HAR SA-nummer — det finnes ingen items uten.
 */
class UnifiedDataStore {
    constructor() {
        // Primær map: saNumber → UnifiedItem
        this.items = new Map();
        // Reverse lookup: toolsArticleNumber → saNumber (for Master/Ordrer-enrichment)
        this.toolsLookup = new Map();
        // Alternative articles mapping (toolsArticleNumber-based from Master)
        this.alternativeArticles = new Map();
        // Master-only articles: Tools art.nr → basic Master data for articles NOT in SA
        // Used for alternative article lookups when alt is not in SA universe
        this.masterOnlyArticles = new Map();
        // Diagnostic counters (set during processing)
        this.masterRowCount = 0;
        this.masterUnmatchedCount = 0;
        this.ordersUnmatchedCount = 0;
        this.dataQuality = {
            totalArticles: 0,
            withIncoming: 0,
            withOutgoing: 0,
            withIssues: 0
        };
    }

    /**
     * Opprett SA-artikkel (kun fra SA-nummer.xlsx)
     * @param {string} saNumber - Kunds artikkelnummer (primærnøkkel)
     * @param {string} toolsArticleNumber - Tools Artikelnr (sekundær)
     * @returns {UnifiedItem|null}
     */
    createFromSA(saNumber, toolsArticleNumber) {
        if (!saNumber || saNumber.toString().trim() === '') return null;

        const saKey = saNumber.toString().trim();
        const toolsKey = toolsArticleNumber ? toolsArticleNumber.toString().trim() : '';

        if (!this.items.has(saKey)) {
            this.items.set(saKey, new UnifiedItem(saKey, toolsKey));
        }

        // Registrer reverse lookup
        if (toolsKey) {
            this.toolsLookup.set(toolsKey, saKey);
        }

        return this.items.get(saKey);
    }

    /**
     * Slå opp item via toolsArticleNumber (for Master/Ordrer-enrichment)
     * @param {string} toolsArticleNumber
     * @returns {UnifiedItem|null}
     */
    getByToolsArticleNumber(toolsArticleNumber) {
        if (!toolsArticleNumber) return null;
        const toolsKey = toolsArticleNumber.toString().trim();
        const saKey = this.toolsLookup.get(toolsKey);
        if (!saKey) return null;
        return this.items.get(saKey) || null;
    }

    /**
     * Beregn alle artikler og oppdater datakvalitet
     */
    calculateAll() {
        this.dataQuality = {
            totalArticles: this.items.size,
            withIncoming: 0,
            withOutgoing: 0,
            withIssues: 0
        };

        this.items.forEach(item => {
            item.calculate();

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
     * Hent alle artikler som array.
     * FASE 6.1: Alle items ER SA-artikler — ingen filtrering nødvendig.
     */
    getAllItems() {
        return Array.from(this.items.values());
    }

    /**
     * Backward-compat alias: getActiveItems() = getAllItems()
     * FASE 6.1: Alle items er SA-artikler, så aktiv = alle.
     */
    getActiveItems() {
        return this.getAllItems();
    }

    /**
     * Hent datakvalitetsrapport
     *
     * FASE 6.1: Alle items er SA-artikler.
     * totalArticles = items.size = antall SA-artikler
     * masterRowCount = antall rader i Master.xlsx
     * masterUnmatchedCount = Master-rader uten SA
     */
    getDataQualityReport() {
        return {
            ...this.dataQuality,
            // FASE 6.1: alle items er SA-artikler
            activeArticles: this.items.size,
            activeWithIncoming: this.dataQuality.withIncoming,
            activeWithOutgoing: this.dataQuality.withOutgoing,
            activeWithIssues: this.dataQuality.withIssues,
            // Transparens: Master vs SA
            masterRowCount: this.masterRowCount,
            masterUnmatchedCount: this.masterUnmatchedCount,
            ordersUnmatchedCount: this.ordersUnmatchedCount,
            // SA-dekning = alltid 100% (alle items har SA)
            saNumberCoverage: 100
        };
    }

    /**
     * FASE 2.2: Sentral alternativ-resolver.
     *
     * Tar en utgående UnifiedItem og returnerer fullstendig alternativ-status.
     * All alternativ-logikk samles her — UI skal ALDRI vurdere selv.
     *
     * Oppslag:
     *   1. item.ersattAvArtikel (Tools art.nr fra Master "Ersätts av artikel")
     *   2. getByToolsArticleNumber() — finnes alternativ i SA-universet?
     *   3. Fallback: masterOnlyArticles — finnes alternativ i Master (utenfor SA)?
     *
     * Lagerstatus leses fra:
     *   - SA-item: stock + bestAntLev (beriket fra Master.xlsx)
     *   - Master-only: stock + bestAntLev (lagret direkte fra Master.xlsx)
     *
     * @param {UnifiedItem} item - Utgående artikkel
     * @returns {Object} Komplett alternativ-status
     */
    resolveAlternativeStatus(item) {
        const altToolsArtNr = (item.ersattAvArtikel || '').trim();

        // ── Ingen alternativ definert ──
        if (!altToolsArtNr) {
            return {
                classification: 'NO_ALTERNATIVE',
                classType: 'critical',
                label: 'INGEN ALTERNATIV DEFINERT',
                altToolsArtNr: '',
                altSaNumber: null,
                altDescription: '',
                altStock: 0,
                altBestAntLev: 0,
                altStatus: '-',
                altIsDiscontinued: false,
                altExistsInSA: false,
                altExistsInMaster: false
            };
        }

        // ── Selv-referanse ──
        if (altToolsArtNr === item.toolsArticleNumber) {
            return {
                classification: 'NO_ALTERNATIVE',
                classType: 'critical',
                label: 'INGEN ALTERNATIV DEFINERT',
                altToolsArtNr: altToolsArtNr,
                altSaNumber: null,
                altDescription: '(selv-referanse ignorert)',
                altStock: 0,
                altBestAntLev: 0,
                altStatus: '-',
                altIsDiscontinued: false,
                altExistsInSA: false,
                altExistsInMaster: false
            };
        }

        // ── Forsøk oppslag i SA-universet ──
        const altItem = this.getByToolsArticleNumber(altToolsArtNr);

        if (altItem) {
            // Alternativ finnes i SA — bruk SA-item data (beriket fra Master)
            const altStock = altItem.stock || 0;
            const altBestAntLev = altItem.bestAntLev || 0;
            const altIsDiscontinued = altItem.isDiscontinued;

            console.debug('[ALT-RESOLVE]',
                item.saNumber, '→', altToolsArtNr,
                'SA:', altItem.saNumber,
                'saldo:', altStock,
                'bestAntLev:', altBestAntLev,
                'utgående:', altIsDiscontinued
            );

            if (altIsDiscontinued) {
                return {
                    classification: 'ALT_DISCONTINUED',
                    classType: 'warning',
                    label: 'Har alternativ – alternativ også utgående',
                    altToolsArtNr, altSaNumber: altItem.saNumber,
                    altDescription: altItem.description || '',
                    altStock, altBestAntLev,
                    altStatus: altItem._status || 'UKJENT',
                    altIsDiscontinued: true,
                    altExistsInSA: true, altExistsInMaster: true
                };
            }

            if (altStock > 0) {
                return {
                    classification: 'OK_ON_STOCK',
                    classType: 'ok',
                    label: 'Har alternativ – aktiv, på lager',
                    altToolsArtNr, altSaNumber: altItem.saNumber,
                    altDescription: altItem.description || '',
                    altStock, altBestAntLev,
                    altStatus: altItem._status || 'AKTIV',
                    altIsDiscontinued: false,
                    altExistsInSA: true, altExistsInMaster: true
                };
            }

            if (altBestAntLev > 0) {
                return {
                    classification: 'OK_INCOMING',
                    classType: 'ok',
                    label: 'Har alternativ – aktiv, bestilling på vei',
                    altToolsArtNr, altSaNumber: altItem.saNumber,
                    altDescription: altItem.description || '',
                    altStock, altBestAntLev,
                    altStatus: altItem._status || 'AKTIV',
                    altIsDiscontinued: false,
                    altExistsInSA: true, altExistsInMaster: true
                };
            }

            return {
                classification: 'ACTIVE_NO_STOCK',
                classType: 'warning',
                label: 'Har alternativ – aktiv, ikke på lager',
                altToolsArtNr, altSaNumber: altItem.saNumber,
                altDescription: altItem.description || '',
                altStock: 0, altBestAntLev: 0,
                altStatus: altItem._status || 'AKTIV',
                altIsDiscontinued: false,
                altExistsInSA: true, altExistsInMaster: true
            };
        }

        // ── Ikke i SA — sjekk masterOnlyArticles (fallback fra Master.xlsx) ──
        const masterData = this.masterOnlyArticles.get(altToolsArtNr);

        if (masterData) {
            const altStock = masterData.stock || 0;
            const altBestAntLev = masterData.bestAntLev || 0;

            console.debug('[ALT-RESOLVE]',
                item.saNumber, '→', altToolsArtNr,
                'MASTER-ONLY saldo:', altStock,
                'bestAntLev:', altBestAntLev,
                'utgående:', masterData.isDiscontinued
            );

            if (masterData.isDiscontinued) {
                return {
                    classification: 'ALT_DISCONTINUED',
                    classType: 'warning',
                    label: 'Har alternativ – ikke i SA, også utgående',
                    altToolsArtNr, altSaNumber: null,
                    altDescription: masterData.description || '',
                    altStock, altBestAntLev,
                    altStatus: masterData.statusText || 'Utgående',
                    altIsDiscontinued: true,
                    altExistsInSA: false, altExistsInMaster: true
                };
            }

            if (altStock > 0) {
                return {
                    classification: 'OK_ON_STOCK',
                    classType: 'ok',
                    label: 'Har alternativ – ikke i SA, men på lager',
                    altToolsArtNr, altSaNumber: null,
                    altDescription: masterData.description || '',
                    altStock, altBestAntLev,
                    altStatus: masterData.statusText || 'Aktiv',
                    altIsDiscontinued: false,
                    altExistsInSA: false, altExistsInMaster: true
                };
            }

            if (altBestAntLev > 0) {
                return {
                    classification: 'OK_INCOMING',
                    classType: 'ok',
                    label: 'Har alternativ – ikke i SA, bestilling på vei',
                    altToolsArtNr, altSaNumber: null,
                    altDescription: masterData.description || '',
                    altStock, altBestAntLev,
                    altStatus: masterData.statusText || 'Aktiv',
                    altIsDiscontinued: false,
                    altExistsInSA: false, altExistsInMaster: true
                };
            }

            return {
                classification: 'ACTIVE_NO_STOCK',
                classType: 'warning',
                label: 'Har alternativ – ikke i SA, ikke på lager',
                altToolsArtNr, altSaNumber: null,
                altDescription: masterData.description || '',
                altStock: 0, altBestAntLev: 0,
                altStatus: masterData.statusText || 'Ukjent',
                altIsDiscontinued: false,
                altExistsInSA: false, altExistsInMaster: true
            };
        }

        // ── Finnes verken i SA eller Master ──
        console.debug('[ALT-RESOLVE]',
            item.saNumber, '→', altToolsArtNr,
            'IKKE FUNNET (verken SA eller Master)'
        );

        return {
            classification: 'NOT_IN_SA',
            classType: 'warning',
            label: 'Har alternativ – finnes ikke i data',
            altToolsArtNr, altSaNumber: null,
            altDescription: '',
            altStock: 0, altBestAntLev: 0,
            altStatus: '-',
            altIsDiscontinued: false,
            altExistsInSA: false, altExistsInMaster: false
        };
    }

    /**
     * Hent artikler uten SA-nummer (fra Master.xlsx, ikke i SA-universet).
     *
     * Returnerer tre gjensidig eksklusive grupper:
     *
     *   A) withStock     — stock > 0
     *      LAGER: Reell kapitalbinding uten SA-avtale. Høyest prioritet.
     *
     *   B) withIncoming  — stock == 0 OG bestAntLev > 0
     *      BESTILLING: Planlagt bevegelse, ikke fysisk lager. Medium prioritet.
     *
     *   C) noActivity    — stock == 0 OG bestAntLev == 0
     *      INGEN BEVEGELSE: Systemstøy / kandidater for avvikling. Lav prioritet.
     *
     * estimertVerdi beregnes KUN for gruppe A (stock > 0).
     *
     * @returns {{ withStock: Object[], withIncoming: Object[], noActivity: Object[], total: number }}
     */
    getArticlesWithoutSA() {
        const withStock = [];
        const withIncoming = [];
        const noActivity = [];

        this.masterOnlyArticles.forEach((data, toolsArtNr) => {
            const stock = data.stock || 0;
            const bestAntLev = data.bestAntLev || 0;
            const kalkylPris = data.kalkylPris || 0;
            // estimertVerdi KUN for fysisk lager (stock > 0)
            const estimertVerdi = (kalkylPris > 0 && stock > 0) ? kalkylPris * stock : 0;

            const statusText = data._status || 'UKJENT';
            let artikkelstatus;
            if (statusText === 'AKTIV') {
                artikkelstatus = 'Aktiv';
            } else if (statusText === 'UTGAENDE') {
                artikkelstatus = 'Utgående';
            } else if (statusText === 'UTGAATT') {
                artikkelstatus = 'Utgått';
            } else {
                artikkelstatus = 'Ukjent';
            }

            const entry = {
                toolsArticleNumber: toolsArtNr,
                description: data.description || '',
                stock: stock,
                bestAntLev: bestAntLev,
                estimertVerdi: estimertVerdi,
                artikkelstatus: artikkelstatus,
                _status: data._status || 'UKJENT',
                brand: data.brand || null,
                supplier: data.supplier || null,
                supplierId: data.supplierId || null
            };

            // Gjensidig eksklusive grupper:
            if (stock > 0) {
                // A: Fysisk lager — reell kapitalbinding
                withStock.push(entry);
            } else if (bestAntLev > 0) {
                // B: Ingen lager, men bestilling på vei
                withIncoming.push(entry);
            } else {
                // C: Verken lager eller bestilling
                noActivity.push(entry);
            }
        });

        // A: Sorter etter estimert verdi (høyest først)
        withStock.sort((a, b) => b.estimertVerdi - a.estimertVerdi);
        // B: Sorter etter bestilt antall (høyest først)
        withIncoming.sort((a, b) => b.bestAntLev - a.bestAntLev);
        // C: Sorter alfabetisk
        noActivity.sort((a, b) => a.toolsArticleNumber.localeCompare(b.toolsArticleNumber));

        return {
            withStock,
            withIncoming,
            noActivity,
            total: withStock.length + withIncoming.length + noActivity.length
        };
    }

    /**
     * Tøm alle data
     */
    clear() {
        this.items.clear();
        this.toolsLookup.clear();
        this.alternativeArticles.clear();
        this.masterOnlyArticles.clear();
        this.masterRowCount = 0;
        this.masterUnmatchedCount = 0;
        this.ordersUnmatchedCount = 0;
        this.dataQuality = {
            totalArticles: 0,
            withIncoming: 0,
            withOutgoing: 0,
            withIssues: 0
        };
    }
}

// Eksporter til global scope
window.UnifiedItem = UnifiedItem;
window.UnifiedDataStore = UnifiedDataStore;
