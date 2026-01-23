/**
 * DATA MAPPER - BORREGAARD DASHBOARD
 * ====================================
 * Håndterer mapping mellom CSV-kolonner og interne standardiserte felter.
 *
 * HOVEDPRINSIPP:
 * - Dashboardet skal ALDRI være avhengig av faktiske kolonnenavn i CSV
 * - All logikk bruker kun interne standardiserte feltnavn
 * - Mapping-filer kobler CSV-kolonner → interne felt
 * - Systemet fungerer selv uten mapping (viser passende meldinger)
 */

// ===========================
// DATATYPE DEFINISJONER
// ===========================

/**
 * Interne felter for artikler (STANDARD)
 */
const ARTICLE_FIELDS = ['articleId', 'description', 'category', 'isStockItem'];

/**
 * Interne felter for interne ordre (STANDARD)
 */
const INTERNAL_ORDER_FIELDS = ['articleId', 'warehouse', 'quantity', 'date'];

/**
 * Interne felter for eksterne innkjøp (STANDARD)
 */
const EXTERNAL_ORDER_FIELDS = ['articleId', 'supplier', 'quantity', 'expectedDate'];

/**
 * Mapping mellom datatype og interne felter
 */
const DATA_TYPE_FIELDS = {
  articles: ARTICLE_FIELDS,
  orders_internal: INTERNAL_ORDER_FIELDS,
  orders_external: EXTERNAL_ORDER_FIELDS
};

// ===========================
// CSV PARSING
// ===========================

/**
 * Parser CSV-tekst til array av objekter.
 * VIKTIG: Gjør INGEN antakelser om kolonnenavn eller rekkefølge.
 *
 * @param {String} csvText - Rå CSV-tekst
 * @param {String} delimiter - Skilletegn (default: ';')
 * @returns {Array<Object>} Array av objekter med kolonnenavn som nøkler
 */
function parseCSV(csvText, delimiter = ';') {
  if (!csvText || csvText.trim() === '') {
    return [];
  }

  const lines = csvText.trim().split('\n');

  if (lines.length < 2) {
    return []; // Ingen data (kun header eller tom fil)
  }

  // Første linje er alltid header (kolonnenavn)
  const headers = lines[0].split(delimiter).map(h => h.trim());

  // Parse resterende linjer
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(delimiter).map(v => v.trim());

    // Opprett objekt med header som nøkkel
    const row = {};
    headers.forEach((header, index) => {
      row[header] = values[index] || '';
    });

    rows.push(row);
  }

  return rows;
}

// ===========================
// MAPPING LASTING
// ===========================

/**
 * Laster mapping-fil for en datatype.
 *
 * @param {String} dataType - 'articles', 'orders_internal', eller 'orders_external'
 * @returns {Promise<Object>} Mapping-objekt
 */
async function loadMapping(dataType) {
  try {
    const response = await fetch(`data/mapping/${dataType}.map.json`);

    if (!response.ok) {
      throw new Error(`Kunne ikke laste mapping: ${dataType}`);
    }

    const mapping = await response.json();

    // Fjern kommentarfelter (starter med _)
    const cleanMapping = {};
    Object.keys(mapping).forEach(key => {
      if (!key.startsWith('_')) {
        cleanMapping[key] = mapping[key];
      }
    });

    return cleanMapping;

  } catch (error) {
    console.error('Feil ved lasting av mapping:', error);
    return null;
  }
}

/**
 * Sjekker om en mapping er gyldig (har minst én ikke-tom verdi).
 *
 * @param {Object} mapping - Mapping-objekt
 * @returns {Boolean} True hvis minst én mapping er definert
 */
function isMappingValid(mapping) {
  if (!mapping) return false;

  return Object.values(mapping).some(value => value && value.trim() !== '');
}

// ===========================
// DATA MAPPING
// ===========================

/**
 * Mapper CSV-rader til interne standardiserte felter.
 *
 * @param {Array<Object>} csvRows - Parsede CSV-rader
 * @param {Object} mapping - Mapping mellom CSV-kolonner og interne felt
 * @param {String} dataType - Datatype ('articles', 'orders_internal', 'orders_external')
 * @returns {Array<Object>} Mappede rader med interne feltnavn
 */
function mapDataRows(csvRows, mapping, dataType) {
  if (!csvRows || csvRows.length === 0) {
    return [];
  }

  if (!mapping || !isMappingValid(mapping)) {
    return []; // Ingen gyldig mapping = ingen mappede rader
  }

  const internalFields = DATA_TYPE_FIELDS[dataType];
  const mappedRows = [];

  csvRows.forEach(csvRow => {
    const mappedRow = {};
    let hasRequiredFields = true;

    // Mappe hvert internt felt til tilsvarende CSV-kolonne
    internalFields.forEach(internalField => {
      const csvColumn = mapping[internalField];

      // Hvis mapping mangler for dette feltet, eller kolonnen ikke finnes i CSV
      if (!csvColumn || csvColumn.trim() === '' || !(csvColumn in csvRow)) {
        mappedRow[internalField] = null;
        // Vi kan fortsatt godta rader med noen manglende felt
      } else {
        mappedRow[internalField] = csvRow[csvColumn];
      }
    });

    // Valider at minst articleId finnes (kritisk felt for alle datatyper)
    if (mappedRow.articleId && mappedRow.articleId.trim() !== '') {
      mappedRows.push(mappedRow);
    }
  });

  return mappedRows;
}

// ===========================
// KOMPLETT DATAPROSESSERING
// ===========================

/**
 * Laster, parser og mapper data for en datatype.
 * Dette er hovedfunksjonen som skal brukes av dashboardet.
 *
 * @param {String} dataType - 'articles', 'orders_internal', eller 'orders_external'
 * @param {File} csvFile - CSV-fil fra file input (valgfri, hvis ikke angitt lastes fra data/raw)
 * @returns {Promise<Object>} Resultat-objekt med status og data
 */
async function processDataType(dataType, csvFile = null) {
  const result = {
    dataType: dataType,
    rawDataLoaded: false,
    mappingLoaded: false,
    mappingValid: false,
    rowsParsed: 0,
    rowsMapped: 0,
    data: [],
    errors: []
  };

  try {
    // 1. Last CSV (fra fil eller fra data/raw)
    let csvText = '';

    if (csvFile) {
      // Last fra opplastet fil
      csvText = await csvFile.text();
    } else {
      // Last fra data/raw
      const response = await fetch(`data/raw/${dataType}.csv`);
      if (response.ok) {
        csvText = await response.text();
      }
    }

    if (!csvText || csvText.trim() === '') {
      result.errors.push('Ingen CSV-data funnet');
      return result;
    }

    result.rawDataLoaded = true;

    // 2. Parse CSV
    const csvRows = parseCSV(csvText);
    result.rowsParsed = csvRows.length;

    if (csvRows.length === 0) {
      result.errors.push('CSV-filen inneholder ingen data');
      return result;
    }

    // 3. Last mapping
    const mapping = await loadMapping(dataType);
    result.mappingLoaded = (mapping !== null);

    if (!mapping) {
      result.errors.push('Kunne ikke laste mapping-fil');
      return result;
    }

    result.mappingValid = isMappingValid(mapping);

    if (!result.mappingValid) {
      result.errors.push('Mapping er tom eller ugyldig');
      return result;
    }

    // 4. Mappe data
    const mappedData = mapDataRows(csvRows, mapping, dataType);
    result.rowsMapped = mappedData.length;
    result.data = mappedData;

    if (mappedData.length === 0) {
      result.errors.push('Ingen gyldige rader etter mapping (sjekk at mapping matcher CSV-kolonner)');
    }

  } catch (error) {
    result.errors.push(`Feil ved prosessering: ${error.message}`);
    console.error('Feil i processDataType:', error);
  }

  return result;
}

// ===========================
// EKSPORT (for bruk i andre moduler)
// ===========================

// Disse funksjonene er tilgjengelige globalt
window.DataMapper = {
  parseCSV,
  loadMapping,
  isMappingValid,
  mapDataRows,
  processDataType,
  DATA_TYPE_FIELDS
};
