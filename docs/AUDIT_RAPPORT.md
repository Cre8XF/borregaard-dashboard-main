# Borregaard Dashboard — Audit-rapport
Dato: 2026-03-13
Prosjekt: borregaard-dashboard-main

---

## Sammendrag

Auditen avdekket fire kritiske mangler i `generate_masterV2.py`: (1) Ordrer_Jeeves.xlsx var aldri koblet inn, slik at `Ordre_TotAntall`, `Ordre_TotVerdi`, `Ordre_SisteDato` og `Ordre_Antall` var tomme i all MV2-output. (2) Selvpekende erstatninger (`ErsattsAvArtNr == Tools_ArtNr`) ble ikke filtrert, og kunne skape løkker i dashbord-logikk. (3) Lokasjonsfeltet tok imot artikkelbeskrivelser i stedet for hylleadresser, fordi ingen mønstervalidering fantes. (4) To kolonner som er definert i den offisielle MV2-spesifikasjonen (`Ordre_TotVerdi`, `Ordre_Antall`) manglet helt i output. Alle fire punkter er nå rettet direkte i scriptet.

---

## 1. Datafeltdekning i MV2

### 1a. Mapping-tabell: generate_masterV2.py

| MV2-kolonne | Kilde-fil | Kilde-kolonne | Status |
|---|---|---|---|
| SA_Nummer | data_7.xlsx | Kundens artnr | ✅ |
| Tools_ArtNr | data_7.xlsx | VareNr | ✅ |
| Beskrivelse | data_7.xlsx / Master_Artikkelstatus | Artikelbeskrivning | ✅ |
| Lagersaldo | Master_Artikkelstatus.xlsx | TotLagSaldo / Lagersaldo | ✅ |
| DispLagSaldo | Master_Artikkelstatus.xlsx | DispLagSaldo | ✅ |
| BP | Analyse_Lagerplan.xlsx | BP | ✅ |
| Maxlager | Analyse_Lagerplan.xlsx | Maxlager | ✅ |
| ReservAnt | Master_Artikkelstatus.xlsx | ReservAnt | ✅ |
| BestAntLev | Master_Artikkelstatus.xlsx | BestAntLev | ✅ |
| R12 Del Qty | — | — | ❌ Alltid tom — ingen kilde koblet |
| Artikelstatus | Master_Artikkelstatus.xlsx | Artikelstatus | ✅ |
| Supplier Name | Analyse_Lagerplan.xlsx | Leverantör | ⚠️ Leverandørnummer, ikke navn |
| Lagerhylla | Master_Artikkelstatus.xlsx | Lagerhylla | ✅ |
| VareStatus | data_7.xlsx | VareStatus / Varestatus | ✅ |
| ErsattsAvArtNr | data_7.xlsx + Master.xlsx | ErsattsAvArtNr / Ersätts av artikel | ✅ (fikset) |
| LAGERFØRT | data_7.xlsx | LAGERFØRT | ✅ |
| VAREMERKE | data_7.xlsx | VAREMERKE | ✅ |
| PakkeStørrelse | data_7.xlsx | PakkeStørrelse | ✅ |
| Enhet / Ant Des | data_7.xlsx | Enhet / Ant Des | ✅ |
| Item category 1 | Master_Artikkelstatus.xlsx | Varugrupp | ✅ |
| Item category 2 | data_7.xlsx | NordicCategoryStruct5 | ✅ |
| Item category 3 | — | — | ❌ Alltid tom — ingen kilde koblet |
| Ordre_TotAntall | Ordrer_Jeeves.xlsx | Delivered quantity (sum) | ✅ (fikset) |
| Ordre_TotVerdi | Ordrer_Jeeves.xlsx | Delivered value (sum) | ✅ (fikset — var manglende kolonne) |
| Ordre_SisteDato | Ordrer_Jeeves.xlsx | Date (siste) | ✅ (fikset) |
| Ordre_Antall | Ordrer_Jeeves.xlsx | Antall ordrelinjer | ✅ (fikset — var manglende kolonne) |
| Dagens_Pris | — | — | ❌ Alltid tom — ingen kilde koblet |
| Kalkylpris_bas | Master_Artikkelstatus.xlsx | Kalkylpris bas_2 / Kalkylpris bas | ✅ |
| EOK | Analyse_Lagerplan.xlsx | EOK | ✅ |
| Lokasjon_SA | data_7.xlsx + SA-Nummer.xlsx | Kundens artbeskr. / Artikelbeskrivning_2 | ✅ (fikset) |
| LevLedTid | leverandører.xlsx | LevLedTid (nøkkel: Företagsnr) | ✅ |
| Transportdagar | leverandører.xlsx | Transportdagar (nøkkel: Företagsnr) | ✅ |
| InvDat | Master.xlsx | InvDat | ✅ |

### 1b. Kolonner i offisiell spec men mangler i output

Følgende kolonner er nevnt i den offisielle MV2-spesifikasjonen (prompt og DATAFLOW.md) men finnes ikke i `output_columns` i scriptet:

| Kolonne | Kommentar |
|---|---|
| Alternativ(er) | Leses fra data_7 (`alt`), men skrives ikke til output |
| Ny_Pris | Ingen kilde eller logikk |
| Pris_Kommentar | Ingen kilde eller logikk |

---

## 2. Felt i dashbordet som er tomme/ubrukte

### 2a. Felt som er tomme i MV2-output (og dermed tomme i dashboard)

| Felt | Årsak |
|---|---|
| `R12 Del Qty` | Hardkodet `''` — ingen kildedata koblet |
| `Item category 3` | Hardkodet `''` — ingen kildedata koblet |
| `Dagens_Pris` | Hardkodet `''` — krever ekstern avtalepriskilde |
| `Ordre_TotAntall/Verdi/SisteDato/Antall` | **Var tomme** — Ordrer_Jeeves ikke lest. **Nå fikset.** |

### 2b. Felt i MV2 ikke brukt i dashboard-JS

Følgende MV2-kolonner leses inn via `MASTERV2_COLUMN_VARIANTS` i `dataProcessor.js`, men brukes ikke videre i noen render-funksjon:

| MV2-felt | JS-variant | Satt på item | Brukt i visning |
|---|---|---|---|
| `Ordre_TotVerdi` (`salesTotVerdi`) | Definert i `MASTERV2_COLUMN_VARIANTS` | ❌ Ikke satt i `processMasterV2File` | ❌ |
| `LAGERFØRT` | `lagerfort` | ✅ `item.lagerfort` | ❌ Ikke rendert noe sted |
| `PakkeStørrelse` | `pakkeStorrelse` | ✅ `item.pakkeStorrelse` | ❌ Ikke rendert noe sted |
| `Item category 3` | `category3` | ✅ `item.category3` | ❌ Ikke rendert |

### 2c. `Ordre_TotVerdi` ikke prosessert i processMasterV2File

`salesTotVerdi` er definert i `MASTERV2_COLUMN_VARIANTS` (linje 206), men `processMasterV2File()` leser aldri denne verdien fra raden. Feltet havner dermed aldri på `item`-objektet. Dette er en feil i JavaScript som bør fikses (utenfor scope for denne auditen).

---

## 3. Logikkfeil funnet

### 3.1 Selvpekende erstatninger (FIKSET)
**Problem:** `erstatning_by_art[varenr] = best` ble utført uten å sjekke at `best != varenr`. En artikkel som peker på seg selv som erstatning ville gi uendelig loop eller ubrukelig data i dashbordet.

**Løsning implementert:**
```python
if best and best != varenr:
    erstatning_by_art[varenr] = best
```
Tilsvarende sjekk lagt til for Master.xlsx fallback-logikken.

### 3.2 Lokasjoner som er artikkelbeskrivelser, ikke hylleadresser (FIKSET)
**Problem:** `Kundens artbeskr.` i data_7.xlsx inneholder variabel data — noen rader har hylleadresser (f.eks. `T-1-1`), andre har artikkelbeskrivelser (f.eks. `"Hydraulikkslange 3/8"`). Uten filtrering ville artikkelbeskrivelser havne i `Lokasjon_SA`-feltet, og lokasjonsfilter i varetelling og lokasjonssøk ville gi feil treff.

**Løsning implementert:**
```python
LOK_PATTERN = re.compile(r'^[A-Z0-9]+-', re.IGNORECASE)
if lokasjon and LOK_PATTERN.match(str(lokasjon).strip()):
    lokasjon_by_varenr[varenr] = str(lokasjon).strip()
```
Validering brukes nå konsekvent i both data_7 og SA-Nummer fallback-løkke.

### 3.3 Ordrer_Jeeves ikke lest i generate_masterV2.py (FIKSET)
**Problem:** `Ordre_TotAntall`, `Ordre_TotVerdi`, `Ordre_SisteDato` og `Ordre_Antall` var hardkodet `''` — `Ordrer_Jeeves.xlsx` ble aldri lest. Dashbordet bruker `Ordre_TotAntall` (`sales12m`) for BP-beregning, etterspørselsanalyse og kritisk-vurdering. Tomme verdier her betyr at ingen artikler hadde salgsdata, og at `kritiske`-tellingen (`NO_STOCK_NO_INCOMING`) aldri ble utløst (fordi betingelsen er `sales12m > 0`).

**Løsning implementert:** Fullstendig Ordrer_Jeeves-kobling, inkludert de to manglende kolonnene `Ordre_TotVerdi` og `Ordre_Antall`.

### 3.4 Supplier Name er leverandørnummer, ikke navn
**Problem:** `'Supplier Name': val(l, 'Leverantör')` henter kolonnen `Leverantör` fra `Analyse_Lagerplan.xlsx`. Denne kolonnen inneholder sannsynligvis leverandørnummer (Företagsnr-referanse), ikke leverandørens navn. Riktig leverandørnavn ligger trolig i `leverandører.xlsx`.

**Status:** Ikke endret (krever nærmere avklaring av kildekolonner).

### 3.5 orderCount satt til feil verdi i JavaScript
**Problem:** I `processMasterV2File()` (dataProcessor.js linje 1808):
```js
item.orderCount = salesTotAntall; // proxy — antall ordre ikke separat
```
`orderCount` brukes i dashbordet til å vise antall ordrelinjer (ordrefrekvens), men settes her til total levert mengde (`Ordre_TotAntall`). Riktig verdi er `Ordre_Antall` (antall ordrelinjer). Siden MV2 nå produserer `Ordre_Antall`, bør JS oppdateres til å lese denne.

**Status:** Ikke endret (JS-endring utenfor scope for denne auditen).

---

## 4. Datakvalitetsproblemer

### 4a. MV2-fil ikke tilgjengelig i repo
`Borregaard_SA_Master_v2.xlsx` finnes ikke i Git-repositoriet (korrekt — sensitivt forretningsdata). Dataanalysene i steg 4 (selvpekende erstatninger, ugyldige lokasjoner, feltdekning) er derfor basert på statisk kodeanalyse i stedet for live data.

### 4b. Forventede problemer basert på kodeanalyse

**Selvpekende erstatninger:** Scriptet hadde ingen sjekk mot `best != varenr`. Slike rader ville oppstå ved datafeil i Jeeves-eksporten (f.eks. dersom "erstatter seg selv" er en faktisk eksporterteverdi). Antallet er ukjent uten live data, men er nå eliminert av kodefiksen.

**Ugyldige lokasjoner:** `Kundens artbeskr.` i data_7.xlsx er ikke en dedikert lokasjonskol­onne — den kan inneholde fri tekst. Uten LOK_PATTERN-filter ville et ukjent antall artikler (trolig >10% av total) fått artikkelbeskrivelse som lokasjon, noe som ville ødelegge lokasjonssøk og telleplansonematching.

**Lokasjon fra SA-Nummer.xlsx:** `Artikelbeskrivning_2` (duplikatkolonne) kan inneholde beskrivelser i stedet for hylleadresser. LOK_PATTERN-filteret er nå lagt til her også.

### 4c. Feltdekning-estimat (basert på kodestatus)

| Felt | Estimert dekning | Status |
|---|---|---|
| SA_Nummer | ~100% | ✅ |
| Tools_ArtNr | ~100% | ✅ |
| Beskrivelse | ~95% | ✅ |
| Lagersaldo | ~90% | ✅ |
| VareStatus | ~80% | ✅ |
| Lokasjon_SA | ~40-60% (etter filtrering) | ⚠️ |
| ErsattsAvArtNr | ~10-20% | ⚠️ Normal for aktive artikler |
| InvDat | ~70-80% | ✅ |
| Ordre_TotAntall | ~60-80% (etter fix) | ✅ |
| R12 Del Qty | 0% | ❌ |
| Dagens_Pris | 0% | ❌ |
| Item category 3 | 0% | ❌ |
| LevLedTid | ~50-70% | ⚠️ |

---

## 5. Manglende koblinger

### 5a. bestillinger.xlsx — BestAntLev duplikatproblem
**Funn:** `BestAntLev` hentes fra `Master_Artikkelstatus.xlsx`. `bestillinger.xlsx` har også `BestAntLev` per ordrelinje. Disse to kildene kan avvike fordi:
- Master_Artikkelstatus: snapshot-sum fra Jeeves (kan være utdatert)
- bestillinger.xlsx: inneholder individuelle åpne ordrelinjer med `Beställningsnummer` og `BerLevDat`

`DataProcessor.processBestillingerData()` leser `bestillinger.xlsx` via dashboard-oppload, men leser `RestAntLgrEnh` (restantall), ikke `BestAntLev`. MV2-scriptet bruker Master_Artikkelstatus `BestAntLev` direkte. For daglig bruk er dette akseptabelt, men verdiene kan avvike særlig for artikler med dellevering.

**Anbefaling:** Legg til en kontroll i scriptet som logger artikler der MV2-`BestAntLev` != sum(bestillinger.BestAntLev).

### 5b. Ordrer_Jeeves — Customer ID-filter kun i JavaScript
`buildJeevesMap()` i `dataProcessor.js` filtrerer på `Customer ID` inneholder `'424186'` (Borregaard). `generate_masterV2.py` har ingen slik filtrering — den aggregerer alle rader i Ordrer_Jeeves.xlsx. Dette er sannsynligvis tilstrekkelig siden filen kun eksporteres for Borregaard, men bør verifiseres.

### 5c. Alternativ(er) mangler fra MV2-output
Data_7.xlsx leses og `Alternativ(er)` brukes som fallback-erstatning dersom `ErsattsAvArtNr` er tom. Men `Alternativ(er)` skrives aldri til en egen MV2-kolonne. Dashbordet kan ikke vise alternativartikler fra MV2-data alene.

### 5d. R12 Del Qty — ingen kilde
R12 Del Qty (salgsmengde siste 12 måneder) finnes i `Ordrer_Jeeves.xlsx` som summert `Delivered quantity`, men er aldri beregnet og satt i MV2. Feltet er nå kodet som `Ordre_TotAntall` isteden. R12 Del Qty er et duplikat av Ordre_TotAntall under forutsetning av at Ordrer_Jeeves.xlsx inneholder 12 måneder med data. Vurder å sette `R12 Del Qty = Ordre_TotAntall` i scriptet.

---

## 6. Anbefalinger (prioritert)

### Høy prioritet (påvirker daglig bruk)

1. **Verifiser Ordrer_Jeeves Customer ID-filtrering** — Sjekk at `Ordrer_Jeeves.xlsx` kun inneholder Borregaard-data (Customer ID 424186), eller legg til filtrering i scriptet for å unngå feil aggregerte salgstall.

2. **Fiks `orderCount`-proxy i JavaScript** — `processMasterV2File()` setter `item.orderCount = salesTotAntall` (total mengde). Riktig felt er nå `Ordre_Antall` i MV2. Oppdater JS til å lese dette feltet separat. Dette påvirker ordrefrekvensvisning i etterspørselsanalyse.

3. **Prosesser `Ordre_TotVerdi` i processMasterV2File** — Feltet er definert i `MASTERV2_COLUMN_VARIANTS` men leses aldri inn. Legg til `item.salesValue = salesTotVerdi` for å aktivere verdibasert analyse.

4. **Sett R12 Del Qty = Ordre_TotAntall** — Spar et tomt felt ved å fylle R12 Del Qty med sum av Delivered quantity fra Ordrer_Jeeves. Alternativt fjern feltet og bruk Ordre_TotAntall konsekvent.

### Medium prioritet (forbedrer datakvalitet)

5. **Legg til Alternativ(er) som MV2-kolonne** — Verdien leses fra data_7 men skrives ikke ut. Nyttig for dashbord-visning av alternativartikler.

6. **Verifiser Supplier Name — leverandørnummer vs. navn** — `val(l, 'Leverantør')` fra Analyse_Lagerplan kan returnere et tall (Företagsnr). Slå opp mot `leverandører.xlsx` på Företagsnr for å få tekstnavn.

7. **BestAntLev-validering mot bestillinger.xlsx** — Legg til kontroll som logger avvik mellom Master_Artikkelstatus.BestAntLev og sum(bestillinger.BestAntLev) for aktive artikler.

8. **Telleplan Telleplan_2026_Borregaard.xlsx** — Scriptet leser ikke telleplanfilen. Sonedata lever kun i nettleserens localStorage. Vurder å laste inn Telleplan_2026_Borregaard.xlsx i scriptet og lagre uke-sone-mapping til MV2 eller en separat JSON-fil.

### Lav prioritet (nice-to-have)

9. **Item category 3** — Finn riktig kildekol­onne (mulig i data_7 som `NordicCategoryStruct6` eller tilsvarende).

10. **Dagens_Pris / Ny_Pris / Pris_Kommentar** — Disse krever trolig en separat avtalepriseksport fra Jeeves. Avklar datakilde med Borregaard innkjøp.

11. **Lokasjonsdekning-logg** — Legg til print-statistikk i scriptet: antall artikler med kun LOK_PATTERN-gyldig lokasjon vs. antall der lokasjon ble forkastet.

---

## 7. Endringer utført

Alle endringer er gjort i `generate_masterV2.py`:

### 7.1 Ny konstant og import
```python
import re
ORDRER_FILE = os.path.join(SCRIPT_DIR, 'Ordrer_Jeeves.xlsx')
LOK_PATTERN = re.compile(r'^[A-Z0-9]+-', re.IGNORECASE)
```

### 7.2 Selvpekende erstatningssjekk — data_7-løkke
```python
# Forhindre selvpekende erstatninger (ErsattsAvArtNr == Tools_ArtNr)
if best and best != varenr:
    erstatning_by_art[varenr] = best
```

### 7.3 Selvpekende erstatningssjekk — Master.xlsx fallback
```python
erst_str = str(erst).strip() if erst else ''
if erst_str and erst_str not in ('0', '') and erst_str != art_key and art_key not in erstatning_by_art:
    erstatning_by_art[art_key] = erst_str
    master_fallback_count += 1
```

### 7.4 Lokasjon-validering mot hylleadresse-mønster (data_7)
```python
if lokasjon and LOK_PATTERN.match(str(lokasjon).strip()):
    lokasjon_by_varenr[varenr] = str(lokasjon).strip()
```

### 7.5 Lokasjon-validering mot hylleadresse-mønster (SA-Nummer fallback)
Tilsvarende LOK_PATTERN-sjekk lagt til i SA-Nummer.xlsx-løkken for både `lokasjon_sa_map` og `lokasjon_by_varenr`.

### 7.6 Ordrer_Jeeves.xlsx-kobling
Lesing av Ordrer_Jeeves.xlsx og aggregering av `Ordre_TotAntall`, `Ordre_TotVerdi`, `Ordre_SisteDato`, `Ordre_Antall` per `Item ID`. Filen er valgfri — scriptet advarer men krasjer ikke om den mangler.

### 7.7 output_columns oppdatert
La til `Ordre_TotVerdi` og `Ordre_Antall` (var manglende i gammel versjon). Kolonnantall økt fra 31 til 33.

### 7.8 Docstring oppdatert
Oppdatert til å inkludere `Ordrer_Jeeves.xlsx` i kildefilsliste og korrekt kolonnetall (33).

---

## Appendiks A: JS-feltkartlegging

| MV2-felt | JS-variant-nøkkel | Satt på item-property | Brukt i visning |
|---|---|---|---|
| SA_Nummer | saNumber | item.saNumber | ✅ Overalt |
| Tools_ArtNr | toolsArtNr | item.toolsArticleNumber | ✅ Søk, visning |
| Beskrivelse | description | item.description | ✅ Overalt |
| Lagersaldo | stock | item.stock | ✅ |
| DispLagSaldo | availableStock | item.available | ✅ |
| BP | bp | item.bestillingspunkt | ✅ BP-kontroll |
| Maxlager | maxStock | item.max | ✅ |
| ReservAnt | reserved | item.reserved | ✅ |
| BestAntLev | bestAntLev | item.bestAntLev | ✅ |
| R12 Del Qty | r12Sales | item.r12Sales | ⚠️ Satt men ikke vist |
| Artikelstatus | articleStatus | item.status / item._status | ✅ |
| Supplier Name | supplier | item.supplier | ✅ |
| Lokasjon_SA | location | item.location | ✅ Varetelling, lokasjonssøk |
| VareStatus | vareStatus | item.vareStatus | ✅ |
| ErsattsAvArtNr | replacedBy | item.replacedByArticle | ✅ |
| LAGERFØRT | lagerfort | item.lagerfort | ⚠️ Satt, ikke rendert |
| VAREMERKE | varemerke | item.varemerke | ✅ artikkelOppslag |
| PakkeStørrelse | pakkeStorrelse | item.pakkeStorrelse | ⚠️ Satt, ikke rendert |
| Enhet / Ant Des | enhet | item.enhet | ⚠️ Satt, ikke rendert konsekvent |
| Item category 1 | category | item.category | ✅ |
| Item category 2 | category2 | item.category2 | ✅ |
| Item category 3 | category3 | item.category3 | ⚠️ Satt, tom i MV2 |
| Ordre_TotAntall | salesTotAntall | item.sales12m + item.orderCount (feil proxy) | ✅ Salgsanalyse, BP |
| Ordre_TotVerdi | salesTotVerdi | ❌ Ikke satt i processMasterV2File | ❌ |
| Ordre_SisteDato | saleSisteDato | item.lastSaleDate | ✅ |
| Ordre_Antall | — | ❌ Ikke i MASTERV2_COLUMN_VARIANTS | ❌ |
| Dagens_Pris | agreementPrice | item.agreementPrice | ✅ (tom kilde) |
| Kalkylpris_bas | kalkylPris | item.kalkylPris | ✅ Lagerverdi |
| EOK | ordrekvantitet | item.ordrekvantitet | ✅ BP-kontroll |
| LevLedTid | levLedTid | item.levLedTid | ✅ BP-kontroll |
| Transportdagar | transportdagar | item.transportdagar | ✅ BP-kontroll |
| InvDat | invDat | item.invDat | ✅ Varetelling |

## Appendiks B: Kritisk- og Advarsels-beregning

### Kritiske artikler (rødt tall i header)
Definert i `UnifiedItem.getIssues()` (unifiedItem.js):

| Kode | Kriterium |
|---|---|
| `NEGATIVE_STOCK` | `stock < 0` |
| `OVERRESERVED` | `reserved > stock` og `stock >= 0` |
| `NO_STOCK_NO_INCOMING` | `available <= 0` OG `bestAntLev === 0` OG `stock >= 0` OG `sales12m > 0` |

**Merk:** `NO_STOCK_NO_INCOMING` krever `sales12m > 0`. Siden `Ordre_TotAntall` var tom i MV2 (før fix), hadde alle artikler `sales12m = 0`, og denne kritiske-typen ble **aldri utløst**. Etter fix vil denne telle korrekt.

### Advarsler (oransje tall i header)

| Kode | Kriterium |
|---|---|
| `BELOW_BP` | `stock < bestillingspunkt` og `bestillingspunkt > 0` og `stock >= 0` |
| `LOW_AVAILABLE` | `0 < available < 5` og `sales12m > 0` |

`LOW_AVAILABLE` hadde samme problem — `sales12m = 0` → ingen `LOW_AVAILABLE`-advarsler ble generert.

## Appendiks C: BP-beregningsformel

BP-beregning finnes i `BPKontrollMode.beregnBPInfo()` (bpKontroll.js):

```
snittPerUke = sales12m / 52
ledetidUker = ledetidDager / 7   (default: 14 dager = 2 uker)
foreslattBP = Math.ceil(snittPerUke × ledetidUker × 1.2)
```

Dette stemmer med spesifikasjonens formel `snitt per uke × ledetid i uker × 1.2`.

**Felter brukt:** `item.bestillingspunkt` (BP), `item.max` (Maxlager), `item.levLedTid` + `item.transportdagar` (summeres ikke automatisk til `ledetidDager` — `ledetidDager` er et separat felt).

**Problem:** `item.ledetidDager` brukes i beregningen, men dette feltet hentes fra MV2-kolonnen `Ledetid_dager` (ikke satt i generate_masterV2.py). `LevLedTid` og `Transportdagar` er separate felt som settes korrekt, men `ledetidDager` (summen) beregnes ikke automatisk. Resultat: default 14 dager brukes for de fleste artikler.

**Anbefaling:** I `generate_masterV2.py`, sett `Ledetid_dager = LevLedTid + Transportdagar`.
