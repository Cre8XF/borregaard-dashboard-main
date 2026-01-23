# 📊 Datamapping-system - Borregaard Dashboard

## Hovedprinsipp

Dashboardet er **IKKE** avhengig av faktiske kolonnenavn i CSV/Excel-filer.

### Hvordan det fungerer:

1. **Interne standardiserte felt** - Dashboardet bruker kun egne feltnavn
2. **Mapping-filer** - Kobler CSV-kolonner til interne felt
3. **Dynamisk parsing** - CSV-filer lastes uten antakelser om kolonnenavn

---

## 📁 Filstruktur

```
data/
├── raw/                          # CSV-filer (rådata)
│   ├── articles.csv              # Artikkeldata
│   ├── orders_internal.csv       # Interne ordre/etterfylling
│   └── orders_external.csv       # Eksterne innkjøp
│
└── mapping/                      # Mapping-konfigurasjon
    ├── articles.map.json         # Mapping for artikler
    ├── orders_internal.map.json  # Mapping for interne ordre
    └── orders_external.map.json  # Mapping for eksterne innkjøp
```

---

## 🧩 Datatyper og interne felt

### 1️⃣ Artikler (`articles`)

**Interne standardiserte felt:**
- `articleId` - Artikkel-ID (påkrevd)
- `description` - Beskrivelse
- `category` - Kategori/produktgruppe
- `isStockItem` - Om artikkelen er lagerført (Ja/Nei)

**Eksempel CSV:**
```csv
Artikkel-ID;Beskrivelse;Produktkategori;Lagerført
ART-001;Testprodukt 1;Kategori A;Ja
ART-002;Testprodukt 2;Kategori B;Nei
```

### 2️⃣ Interne ordre / etterfylling (`orders_internal`)

**Interne standardiserte felt:**
- `articleId` - Artikkel-ID (påkrevd)
- `warehouse` - Lager (Lager 1-7)
- `quantity` - Antall/mengde
- `date` - Ordredato

**Eksempel CSV:**
```csv
Varenummer;Lager;Antall;Ordredato
ART-001;Lager 1;50;2026-01-15
ART-002;Lager 3;25;2026-01-16
```

### 3️⃣ Eksterne innkjøp (`orders_external`)

**Interne standardiserte felt:**
- `articleId` - Artikkel-ID (påkrevd)
- `supplier` - Leverandør
- `quantity` - Antall/mengde
- `expectedDate` - Forventet leveringsdato

**Eksempel CSV:**
```csv
Produkt-ID;Leverandørnavn;Mengde;Forventet levering
ART-001;Leverandør AS;200;2026-02-01
ART-002;Supplier AB;150;2026-02-05
```

---

## ⚙️ Slik konfigurerer du mapping

### Steg 1: Identifiser kolonnenavn i din CSV-fil

Åpne CSV-filen i Excel eller en teksteditor og noter kolonnenavn.

**Eksempel:** Din CSV for artikler har følgende kolonner:
```
Varenr;Produkt navn;Gruppe;På lager
```

### Steg 2: Åpne mapping-filen

Åpne tilsvarende mapping-fil, f.eks. `data/mapping/articles.map.json`

**Standard (tom) mapping:**
```json
{
  "_comment": "Mapping mellom CSV-kolonner og interne felter for artikler",
  "_instructions": "Fyll inn kolonnenavn fra CSV-filen...",
  "articleId": "",
  "description": "",
  "category": "",
  "isStockItem": ""
}
```

### Steg 3: Fyll inn kolonnenavn

Koble hver intern felt til riktig CSV-kolonne:

```json
{
  "_comment": "Mapping mellom CSV-kolonner og interne felter for artikler",
  "_instructions": "Fyll inn kolonnenavn fra CSV-filen...",
  "articleId": "Varenr",
  "description": "Produkt navn",
  "category": "Gruppe",
  "isStockItem": "På lager"
}
```

### Steg 4: Lagre og test

1. Lagre mapping-filen
2. Gå til dashboardet (index.html)
3. Klikk "🔄 Oppdater datamapping-status"
4. Sjekk at data vises korrekt

---

## ✅ Validering og feilhåndtering

Dashboardet håndterer følgende tilfeller automatisk:

| Situasjon | Resultat |
|-----------|----------|
| CSV-fil ikke funnet | Viser "Ingen data" |
| Mapping-fil ikke funnet | Viser "Mapping mangler" |
| Mapping er tom | Viser "Mapping tom" |
| Kolonnenavn matcher ikke | Viser "0 gyldige rader" |
| Alt OK | Viser antall mappede rader + aggregering |

---

## 🔄 Hvordan legge til nye kolonner

Hvis CSV-filen får nye kolonner, trenger du **IKKE** endre kode.

**Eksempel:** CSV får ny kolonne "Leverandør"

1. Åpne mapping-filen
2. Legg til nytt felt:
```json
{
  "articleId": "Varenr",
  "description": "Produkt navn",
  "category": "Gruppe",
  "isStockItem": "På lager",
  "supplier": "Leverandør"  // <-- Ny mapping
}
```

**OBS:** Hvis du vil bruke dette nye feltet i dashboardet, må du:
1. Legge til feltet i `DATA_TYPE_FIELDS` i `dataMapper.js`
2. Oppdatere aggregeringslogikk om nødvendig

---

## 🚀 Slik legger du til ny datatype

Hvis du trenger en ny datatype (f.eks. "leverandører"):

### Steg 1: Definer interne felt

I `js/dataMapper.js`, legg til:
```javascript
const SUPPLIER_FIELDS = ['supplierId', 'supplierName', 'country'];

const DATA_TYPE_FIELDS = {
  articles: ARTICLE_FIELDS,
  orders_internal: INTERNAL_ORDER_FIELDS,
  orders_external: EXTERNAL_ORDER_FIELDS,
  suppliers: SUPPLIER_FIELDS  // <-- Ny datatype
};
```

### Steg 2: Opprett mapping-fil

Opprett `data/mapping/suppliers.map.json`:
```json
{
  "supplierId": "",
  "supplierName": "",
  "country": ""
}
```

### Steg 3: Legg til CSV-fil

Plasser CSV-fil i `data/raw/suppliers.csv`

### Steg 4: Oppdater UI

Legg til ny seksjon i `index.html` for å vise status.

---

## 📝 Viktige prinsipper

### ✅ GJØR DETTE:
- Bruk kun interne feltnavn i all kode
- Oppdater mapping-filer når CSV-kolonner endres
- Valider at mapping matcher faktiske kolonnenavn

### ❌ IKKE GJØR DETTE:
- Hardkode kolonnenavn i JavaScript
- Anta rekkefølge på kolonner
- Bruk CSV-kolonnenavn direkte i logikk

---

## 🐛 Feilsøking

### Problem: "0 gyldige rader" selv om mapping er fylt inn

**Løsning:**
1. Åpne CSV-filen og sjekk eksakte kolonnenavn (case-sensitive)
2. Sammenlign med mapping-fil
3. Pass på at det ikke er ekstra mellomrom eller usynlige tegn

### Problem: Dashboardet viser "Mapping mangler"

**Løsning:**
1. Sjekk at mapping-fil eksisterer i `data/mapping/`
2. Sjekk at filnavnet stemmer (f.eks. `articles.map.json`)
3. Sjekk at JSON-syntaksen er korrekt

### Problem: CSV vises ikke

**Løsning:**
1. Sjekk at CSV-fil ligger i `data/raw/`
2. Sjekk at filnavnet stemmer
3. Sjekk at CSV har riktig format (header-linje + data)

---

## 📚 API-dokumentasjon

### DataMapper.processDataType(dataType)

Hovedfunksjon for å prosessere data.

**Parametre:**
- `dataType` (String): 'articles', 'orders_internal', eller 'orders_external'

**Returnerer:**
```javascript
{
  dataType: 'articles',
  rawDataLoaded: true,
  mappingLoaded: true,
  mappingValid: true,
  rowsParsed: 100,
  rowsMapped: 95,
  data: [...],
  errors: []
}
```

### DataAggregator.generateSummary(data, dataType)

Genererer oppsummering av mappet data.

**Parametre:**
- `data` (Array): Mappet data
- `dataType` (String): Datatype

**Returnerer:**
```javascript
{
  dataType: 'articles',
  totalRows: 95,
  uniqueArticles: 45,
  breakdown: {
    byCategory: { 'Kategori A': 30, 'Kategori B': 65 }
  }
}
```

---

## 🎯 Neste steg

1. ✅ Fyll inn mapping-filer med riktige kolonnenavn
2. ✅ Test at data vises korrekt i dashboardet
3. ✅ Bygg videre funksjonalitet basert på mappet data
4. ✅ Hold mapping-filer oppdatert når CSV-format endres

---

## 📞 Support

Hvis du har spørsmål eller problemer, sjekk:
1. Denne README-filen
2. Kommentarer i JavaScript-filene
3. Nettleserens console for feilmeldinger

---

**Versjon:** 1.0
**Sist oppdatert:** 2026-01-22
