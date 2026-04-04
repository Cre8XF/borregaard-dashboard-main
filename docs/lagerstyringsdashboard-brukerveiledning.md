# 📊 Lagerstyringsdashboard – Brukerveiledning

## Innledning

Dette dashboardet er ditt daglige verktøy for lagerstyring og innkjøpsplanlegging. Det samler data fra Butler, Jeeves og andre systemer for å gi deg ett sted å se status, identifisere problemer og ta beslutninger.

**Målgruppe:** Plassansvarlige, innkjøpere og lagerplanleggere som jobber operativt med vareflyt og lagernivåer.

---

## 1. Oversikt – Daglig kontroll

### Formål

Dette er din daglige kontrollside – **første stopp hver morgen**. Her får du en rask oversikt over hvilke artikler som krever oppmerksomhet akkurat nå. Siden filtrerer automatisk frem problemer basert på alvorlighetsgrad.

### Statuskort (4 stk)

Kortene viser antall artikler innenfor hver kategori. Klikk på et kort for å filtrere tabellen under.

#### 1. **Kritiske** (rødt kort)

**Hva kortet representerer:**  
Artikler som krever umiddelbar handling – typisk 0 i saldo, negativ saldo, eller aktive artikler uten lager.

**Hvilke artikler havner her:**
- Artikler med saldo = 0 (og status aktiv)
- Negativ saldo (reservert mer enn tilgjengelig)
- Under minimumsnivå (BP) uten ordre på vei

**Hva du bør gjøre:**
- Sjekk om det allerede er ordre på vei (se kolonne "Handling")
- Bestill umiddelbart hvis ingen ordre finnes
- Varsle salg/kunde hvis leveringstid er lang

---

#### 2. **Advarsler** (gult kort)

**Hva kortet representerer:**  
Artikler som nærmer seg kritisk nivå eller har uvanlige forhold.

**Hvilke artikler havner her:**
- Under BP, men med ordre på vei
- Høy reservasjon (>70% av saldo)
- Lav bevegelse kombinert med høyt lager

**Hva du bør gjøre:**
- Følg med på leveringsdato for pågående ordre
- Vurder om reservert mengde er korrekt (feilregistrering?)
- Planlegg neste bestilling

---

#### 3. **Info** (blått kort)

**Hva kortet representerer:**  
Artikler med forhold som er verdt å vite om, men ikke akutt.

**Hvilke artikler havner her:**
- Artikler med innkommende ordre
- Planlagte endringer
- Artikler med alternative erstatninger

**Hva du bør gjøre:**
- Bruk dette til orientering
- Gjennomgå ved ukentlig planlegging
- Hold oversikt over hva som er på vei

---

#### 4. **Datakvalitet** (grått kort)

**Hva kortet representerer:**  
Artikler hvor data mangler eller er inkonsistent.

**Hvilke artikler havner her:**
- Mangler SA-nummer
- Mangler beskrivelse
- Manglende eller feil BP/Max-verdier
- Artikler i Master.xlsx som ikke finnes i Butler

**Hva du bør gjøre:**
- Rapporter til systemansvarlig
- Rett opp enkle feil (f.eks. manglende BP)
- Vurder om artikkelen er aktiv eller skal fases ut

---

### Tabellvisning

**Kolonner:**
- **Type:** Ikon som viser alvorlighetsgrad (🔴 kritisk, ⚠️ advarsel, ℹ️ info)
- **Artikkelnr:** Tools artikkelnummer (primærnøkkel)
- **SA-nr:** SAP-artikkel nummer (hvis tilgjengelig)
- **Beskrivelse:** Hva artikkelen heter
- **Problem:** Kort forklaring på hvorfor artikkelen vises
- **Saldo:** Nåværende lagerbeholdning
- **BP:** Bestillingspunkt (minimumsnivå før påfyll)
- **Handling:** Anbefalt neste steg

**Hvordan lese raden:**

Eksempel 1:  
```
🔴 | 12345 | SA-9876 | Kuleventil DN50 | Tom, ingen ordre | 0 | 5 | Bestill nå
```
→ Kritisk: Artikkelen er tom og ingen bestilling er lagt inn. Bestill umiddelbart.

Eksempel 2:  
```
⚠️ | 23456 | SA-8765 | Pakning EPDM | Tom, men 6 på vei | 0 | 3 | Følg opp levering
```
→ Advarsel: Artikkelen er tom nå, men bestilling er på vei. Ikke kritisk, men sjekk leveringsdato.

Eksempel 3:  
```
ℹ️ | 34567 | SA-7654 | Filter 100µm | 12 på lager | 12 | 8 | OK – til orientering
```
→ Info: Alt er OK, vises kun for oversikt.

---

## 2. Etterspørsel – Salg & mønstre

### Formål

Her analyserer du **historisk salgsdata** for å forstå etterspørselsmønstre. Siden hjelper deg med å:
- Se hvilke artikler som selges mest
- Identifisere bestillingsbehov basert på salgstrend
- Oppdage sesongvariasjoner

### Hva vises

**Mest solgt (12 mnd / 6 mnd):**  
Toppselgere rangert etter totalt solgt volum. Brukes til å sikre at høyvolumartikler alltid er på lager.

**Bestillingsfrekvens:**  
Viser hvor ofte artikkelen kjøpes, og median dager mellom leveranser. Artiklene er klassifisert med "trafikklys":
- 🟢 **OK** – Kjøpt nylig i forhold til normalt mønster
- 🟡 **Følg med** – Nærmer seg tid for ny bestilling
- 🔴 **Bør bestilles** – Overtidig i forhold til vanlig kjøpsmønster

**Sesonganalyse (uke 16 & 42):**  
Spesiell analyse for vedlikeholdsuker. Viser artikler som typisk bestilles i disse periodene, klassifisert som:
- **Sesongspike** – Kun aktivitet i vedlikeholdsuker
- **Engangsordre** – Bestilt én gang i perioden
- **Stabil etterspørsel** – Bestilles også utenom vedlikeholdsuker

### Praktisk bruk

**Når bruke denne siden:**
- Før ukentlig innkjøpsmøte – se hvem som nærmer seg bestillingstidspunkt
- Ved usikkerhet om en artikkel brukes mye eller lite
- Før vedlikeholdsstopp (uke 16/42) – se hva som typisk trengs

**Eksempel:**  
Hvis en artikkel viser 🔴 "Bør bestilles" og median er 30 dager, men det har gått 50 dager siden sist kjøp → bestill nå.

---

## 3. Sortiment – Rydding

### Formål

Denne siden brukes til **sortimentsoptimalisering** – identifisere artikler som bør fases ut, reduseres eller erstattes.

### Typiske funn

**Slow movers:**  
Artikler med lager som tar over 1 år å selge ut ved nåværende tempo.  
→ Vurder: Skal vi ha denne på lager, eller bestille ved behov?

**Null-salg:**  
Artikler med saldo, men ingen salg siste 12 måneder.  
→ Vurder: Retur til leverandør, intern overføring eller avskriving.

**Inaktive artikler:**  
Artikler med status "Utgått" eller "Blokkert", men som fortsatt har lagerbeholdning.  
→ Handling: Selg ut, skriv av, eller reaktiver hvis feilmerket.

**Utgående artikler:**  
Artikler merket "Planned discontinued" med saldo.  
→ Handling: Selg ut eller bytt til erstatningsartikkel.

### Beslutningsstøtte

Denne siden gir deg grunnlag til å:
- **Redusere bundet kapital** – identifiser "dødt" lager
- **Frigjøre lagerplass** – få vekk artikler som ikke omsettes
- **Planlegge erstatning** – se hvilke artikler som må byttes ut

**Anbefalt bruksfrekvens:**  
Månedlig gjennomgang, eller ved behov for lageroptimalisering.

---

## 4. Planlegging – Forberedelser

### Formål

Her planlegger du **fremover i tid** – hva må vi ha på plass før gitte hendelser?

### Fokusområder

**Bestillingsforslag:**  
Viser artikler som basert på salgstrend og lagernivå bør bestilles nå for å unngå tomgang senere.  
- Sortert etter prioritet (høy/medium/lav)
- Viser foreslått bestillingsmengde
- Gir årsak (f.eks. "Under BP", "Høyt salg siste 3 mnd")

**Sesongplanlegging:**  
Forbered vedlikeholdsstopp (uke 16 & 42) ved å se historiske bestillinger og anbefalte lagernivåer.

**Innkommende ordre:**  
Oversikt over hva som allerede er bestilt og forventet leveringsdato.

### Praktisk verdi

Denne siden hjelper deg å være **proaktiv i stedet for reaktiv**:
- Bestill før artikkelen blir tom
- Forbered sesonger/stopp i god tid
- Unngå hastebestillinger og ekstra kostnader

**Eksempel:**  
Hvis du ser at en artikkel med høy prioritet har foreslått mengde 20 stk, og årsak er "Høyt salg + nær BP", bør du bestille innen 1-2 dager.

---

## 5. Alternativer – Utgående analyse

### Formål

Når en artikkel er utgående, tom, eller vanskelig å få tak i – hva kan vi tilby i stedet?

### Hva analyseres

**Erstatningsartikler:**  
Artikler som er registrert som direkte erstatning (felt "Ersätts av artikel" fra Master.xlsx).  
→ Systemet viser hvilken artikkel som skal erstatte den utgående.

**Alternative produkter:**  
Lignende artikler basert på funksjon, leverandør eller kategori.  
→ Kan brukes hvis kunden aksepterer alternativ løsning.

**Sammenheng mellom hovedartikkel og alternativ:**  
Tabellen viser:
- Hovedartikkel (utgående)
- Erstatningsartikkel (aktiv)
- Status for begge (utgående vs aktiv)
- Lagerbeholdning for begge

### Bruk i praksis

Denne siden støtter:
- **Kundealternativ** – "Vi har ikke X, men kan tilby Y"
- **Mersalg** – Vise oppgradert alternativ
- **Redusert restordre** – Unngå ventetid ved å tilby alternativ med lager

**Eksempel:**  
Kunde spør etter artikkel 12345 (utgående, 0 på lager).  
Dashboardet viser: Erstattes av 12399 (aktiv, 15 på lager).  
→ Du kan tilby kunden 12399 umiddelbart.

---

## 📌 Generelle prinsipper

### Anbefalt daglig bruk (rekkefølge)

1. **Start med Oversikt** – Håndter kritiske artikler først
2. **Sjekk Etterspørsel** – Se om noen nærmer seg bestillingstidspunkt
3. **Ukentlig: Planlegging** – Forbered kommende bestillinger
4. **Månedlig: Sortiment** – Rydd opp i slow movers og utgående artikler
5. **Ved behov: Alternativer** – Når kunder spør etter utgående produkter

### Handling vs Informasjon

**Krever handling:**
- Kritiske artikler (rødt kort)
- Advarsler (gult kort) – innen 1-2 dager
- Bestillingsforslag med høy prioritet

**Til informasjon:**
- Info (blått kort)
- Datakvalitet (grått kort) – rapporter til systemansvarlig
- Historiske salgstall

### Dashboardet som beslutningsverktøy

Dette dashboardet er **ikke bare visning** – det er ment som **beslutningsstøtte**:
- Tallene er beregnet for å hjelpe deg prioritere
- Anbefalingene er basert på salgsdata og lagernivåer
- Bruk det aktivt for å ta informerte beslutninger

**Merk:** Alle anbefalinger er beslutningsstøtte. Du kjenner din kunde og situasjon best – bruk dashboardet som grunnlag, ikke automatikk.

---

**Versjon:** 1.0  
**Sist oppdatert:** Februar 2025  
**Spørsmål?** Kontakt systemansvarlig eller IT-support.
