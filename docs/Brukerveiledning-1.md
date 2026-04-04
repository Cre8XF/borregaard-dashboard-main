# Brukerveiledning — Borregaard Lagerstyringsdashboard

**Versjon:** 4.3 (FASE 7.2)
**Sist oppdatert:** Mars 2026

---

## Innledning

Dette dashboardet er ditt daglige verktøy for lagerstyring ved Borregaard AS. Det samler data fra MV2-masterfilen og Jeeves slik at du har ett sted å se artikkelstatus, gjennomføre varetelling, analysere kjøpshistorikk og planlegge vedlikeholdsstopp.

**Målgruppe:** Plassansvarlig og andre som jobber operativt med lagerflyt og innkjøp for de 7 satellittlagrene.

---

## 1. Komme i gang — laste inn data

### Første gang (eller etter MV2-oppdatering)

1. Åpne dashboardet i nettleseren
2. Dra filene inn i opplastingsfeltet, eller klikk for å velge:
   - **`Borregaard_SA_Master_v2.xlsx`** (påkrevd)
   - **`Ordrer_Jeeves.xlsx`** (påkrevd)
   - `bestillinger.xlsx` (valgfri — åpne innkjøpsordrer)
3. Klikk **Last inn data**
4. Systemet viser fremdrift og bekrefter antall artikler lastet

### Neste gang

Data bevares automatisk mellom nettleserøkter. Du trenger ikke laste inn på nytt med mindre du har en ny MV2-eksport.

### Nullstille data

Klikk **Nullstill** for å slette alt og starte med ferske filer. Bruk dette når du skal laste en ny MV2-versjon.

---

## 2. Arbeidsmoduser

### 📦 Varetelling

**Formål:** Rullerende varetelling etter 32-sesjoners plan for 2026 (uke 11–44, hopper over uke 16 og 42).

**Hva du ser:**
- Samlet fremdriftsbar: prosent telt, antall artikler gjenstår, sist telt totalt
- Ukens soner med artikkeltall og ansvarlig
- Per-sesjon: lokasjoner, artikler, og dato sist telt (fra `InvDat` i MV2)

**Slik bruker du det:**
- Finn riktig sesjon for inneværende uke
- Klikk **Tell nå** for å starte lokasjonssøk
- Etter at telling er registrert i systemet og MV2 er oppdatert, vil `InvDat` oppdateres automatisk neste gang du laster inn

**Tips:** Oppdater MV2-filen ukentlig for å holde telledatoene ferske.

---

### 🔍 Artikkel Oppslag

**Formål:** Slå opp én artikkel raskt — uansett om du har Tools-nummer, SA-nummer, lokasjon eller bare deler av beskrivelsen.

**Søk på:**
- Tools artikkelnummer
- SA-nummer
- Lokasjon / hylle (f.eks. `12-3-B`)
- Leverandørnummer
- Beskrivelse (støtter fuzzy-søk)

**Hva du ser per artikkel:**
- Status (Aktiv / Utgår / Erstattet med nytt artikkelnummer)
- Lager, disponibelt, reservert
- BP, EOK, kalkylpris
- Leverandør og lokasjon
- **Kjøpshistorikk-panel** fra Jeeves: totalt antall ordre, siste ordredato, snitt-antall, min/maks, og fordeling per leveringslager

**Filtre:**
- Alle / Kun med lager / Utgående / Uten lokasjon

---

### 📊 Order Analyzer

**Formål:** Analysere kjøpsfrekvens og identifisere varer som bør bestilles eller forberedes til vedlikeholdsstopp.

**Faner:**

| Fane | Innhold |
|------|---------|
| **Mest solgt** | Topp 50 artikler etter totalkvantitet |
| **Oftest kjøpt** | Trafikklys-liste basert på median dager mellom kjøp |
| **Sesonganalyse** | Artikler med mønster rundt uke 16 og 42 |
| **Sesongmønstre** | Aggregert salg per måned og uke |
| **Per kunde** | Kunder sortert etter verdi |
| **Tidslinje** | Månedlig utvikling av salg |

**Trafikklys — slik leses det:**
- 🟢 **OK** — Nylig kjøpt, innenfor normalt intervall
- 🟡 **Følg med** — Nærmer seg bestillingstidspunkt
- 🔴 **Bør bestilles** — Overskrider median med mer enn 60 %
- ⬜ **For lite historikk** — Færre enn 3 gyldige kjøpsintervaller

**Sesonganalyse (uke 16 og 42):**
- 🔴 Sesongspike — høy aktivitet i fokusuke, ingenting etter
- 🟡 Engangs/event — aktivitet kun i fokusuke
- 🟢 Stabil etterspørsel — aktivitet også utenfor fokusuke

---

### 🏭 Butler Analyzer

**Formål:** Daglig lagerstatussjekk — hvilke artikler krever oppmerksomhet nå?

**5 forhåndsdefinerte visninger:**

| Visning | Hva den viser |
|---------|--------------|
| **0 i saldo (Aktiv)** | Aktive artikler med lagersaldo = 0 |
| **Negativ saldo** | Artikler med saldo < 0 (feilregistrering?) |
| **Under minimum** | Saldo under BP uten ordre på vei |
| **Ingen bevegelse R12** | Aktive artikler uten R12-salg |
| **Høy reservasjon** | Reservert > 70 % av saldo |

**Per artikkel vises:** Artikkelnr, SA-nr, beskrivelse, hylle, saldo, disponibelt, reservert, BP, max, R12-salg, leverandør.

**Eksporter** til CSV for videre behandling i Excel.

---

### 🔧 Shutdown Planner

**Formål:** Forberede vedlikeholdsstopp (uke 16 og uke 42) — hvilke varer må være på lager, og hvor mye?

**Hva du ser:**
- Antall kritiske varer
- Anbefalinger gruppert etter kritikalitet
- Historisk maks, trend og risikoscore per artikkel
- Anbefalt lagernivå (median historisk × 1.2)

**Bruk:** Gå gjennom listen 4–6 uker før stoppuke. Bestill varer med rødt flagg umiddelbart.

---

### ⚠️ Flow Issues

**Formål:** Loggføre og følge opp integrasjonsproblemer mellom SAP og Jeeves.

**Hva du kan gjøre:**
- Registrere nye problemer med kategori, system og rotårsak
- Se åpne/lukkede problemer og tilbakevendende mønstre
- Filtrere og søke i problemloggen

---

## 3. Oppdatere MV2-masterfilen

MV2-filen er "sannhetskilden" for all artikkeldata. Den bør oppdateres:
- **Ukentlig** (for å holde `InvDat` og lagersaldo fersk)
- **Etter større sortimentsendringer** (nye artikler, statusendringer)

### Slik genereres ny MV2

1. Sørg for at disse kildefilene er oppdaterte og tilgjengelige lokalt:
   - `SANummer.xlsx`
   - `Master_Artikkelstatus.xlsx`
2. Kjør: `python generate_masterV2.py`
3. Filen `Borregaard_SA_Master_v2.xlsx` oppdateres
4. Last den inn i dashboardet (nullstill og last inn på nytt)

---

## 4. Vanlige situasjoner

### En artikkel viser ⚠️ UTGÅR

Artikkelen er markert som utgående i systemet. Sjekk om `ErsattsAvArtNr` viser et erstatningsnummer. Bytt etikett på hylla hvis erstatningsvaren er på plass.

### En artikkel viser 🔴 BYTT ETIKETT

Artikkelen er erstattet av en annen. Gammel etikett på hylla må byttes til det nye artikkelnummeret.

### Scanning-appen viser utgått artikkel

Tools-Lagerkontroll-appen gjør live oppslag mot MV2 ved skanning. Hvis en artikkel flagges som utgående eller erstattet ved skannetidspunkt, håndter det der og da — ikke tilbake på kontoret.

### Datakvalitet — artikkelen mangler SA-nummer

Artikler uten `SANummer` i MV2 eksisterer ikke i dashboardet. Følg opp mot Tools / systemansvarlig for å få SA-nummeret registrert.

---

## 5. Tastatursnarveier

| Snarvei | Funksjon |
|---------|---------|
| `Ctrl + S` | Lagre gjeldende datasett til localStorage |

---

## 6. Begrensninger

- Ingen direkte API-integrasjon mot Butler, SAP eller Jeeves — all data lastes via Excel-eksport
- `localStorage` har en grense på ca. 5–10 MB; ved svært store datasett kan kvoten overskrides
- LibreOffice kan gi feil ved Excel-formler med automatisk omberegning — bruk Excel for å regenerere MV2 hvis formler er involvert

---

## 7. Nøkkelbegreper

| Begrep | Forklaring |
|--------|-----------|
| SA-nummer | Borregaards interne artikkelnummer (primærnøkkel) |
| Tools nr | Tools AS sitt artikkelnummer |
| MV2 | `Borregaard_SA_Master_v2.xlsx` — hoved-datasource |
| BP | Bestillingspunkt (minimumsnivå) |
| EOK | Ekonomisk ordrekvantitet |
| InvDat | Dato for siste godkjente varetelling |
| ukurans | Artikler uten bevegelse siste 12 måneder |
| vedlikeholdsstopp | Produksjonsstopp uke 16 og uke 42 |
