/**
 * DATA AGGREGATOR - BORREGAARD DASHBOARD
 * =======================================
 * Enkel aggregering av mappede data.
 *
 * VIKTIG:
 * - Jobber KUN med interne standardiserte felt
 * - Ingen avhengighet til CSV-kolonnenavn
 * - Enkle aggregeringer (telling, gruppering)
 * - Ingen avansert analyse eller grafer
 */

// ===========================
// GRUNNLEGGENDE STATISTIKK
// ===========================

/**
 * Teller antall rader per artikkel.
 *
 * @param {Array<Object>} data - Mappede data med articleId-felt
 * @returns {Object} Objekt med articleId som nøkkel og antall som verdi
 */
function countByArticle(data) {
  if (!data || data.length === 0) {
    return {};
  }

  const counts = {};

  data.forEach(row => {
    const articleId = row.articleId;
    if (articleId) {
      counts[articleId] = (counts[articleId] || 0) + 1;
    }
  });

  return counts;
}

/**
 * Teller antall rader per lager (for interne ordre).
 *
 * @param {Array<Object>} data - Mappede data med warehouse-felt
 * @returns {Object} Objekt med warehouse som nøkkel og antall som verdi
 */
function countByWarehouse(data) {
  if (!data || data.length === 0) {
    return {};
  }

  const counts = {};

  data.forEach(row => {
    const warehouse = row.warehouse;
    if (warehouse) {
      counts[warehouse] = (counts[warehouse] || 0) + 1;
    }
  });

  return counts;
}

/**
 * Teller antall rader per leverandør (for eksterne innkjøp).
 *
 * @param {Array<Object>} data - Mappede data med supplier-felt
 * @returns {Object} Objekt med supplier som nøkkel og antall som verdi
 */
function countBySupplier(data) {
  if (!data || data.length === 0) {
    return {};
  }

  const counts = {};

  data.forEach(row => {
    const supplier = row.supplier;
    if (supplier) {
      counts[supplier] = (counts[supplier] || 0) + 1;
    }
  });

  return counts;
}

/**
 * Teller antall rader per kategori (for artikler).
 *
 * @param {Array<Object>} data - Mappede data med category-felt
 * @returns {Object} Objekt med category som nøkkel og antall som verdi
 */
function countByCategory(data) {
  if (!data || data.length === 0) {
    return {};
  }

  const counts = {};

  data.forEach(row => {
    const category = row.category;
    if (category) {
      counts[category] = (counts[category] || 0) + 1;
    }
  });

  return counts;
}

// ===========================
// SUMMERING
// ===========================

/**
 * Summerer quantity-felt (for ordre).
 *
 * @param {Array<Object>} data - Mappede data med quantity-felt
 * @returns {Number} Total sum
 */
function sumQuantity(data) {
  if (!data || data.length === 0) {
    return 0;
  }

  return data.reduce((sum, row) => {
    const qty = parseFloat(row.quantity) || 0;
    return sum + qty;
  }, 0);
}

/**
 * Summerer quantity per artikkel.
 *
 * @param {Array<Object>} data - Mappede data med articleId og quantity
 * @returns {Object} Objekt med articleId som nøkkel og total quantity som verdi
 */
function sumQuantityByArticle(data) {
  if (!data || data.length === 0) {
    return {};
  }

  const sums = {};

  data.forEach(row => {
    const articleId = row.articleId;
    const qty = parseFloat(row.quantity) || 0;

    if (articleId) {
      sums[articleId] = (sums[articleId] || 0) + qty;
    }
  });

  return sums;
}

// ===========================
// FILTRERING
// ===========================

/**
 * Filtrerer data etter artikkel-ID.
 *
 * @param {Array<Object>} data - Mappede data
 * @param {String} articleId - Artikkel-ID å filtrere på
 * @returns {Array<Object>} Filtrerte data
 */
function filterByArticle(data, articleId) {
  if (!data || data.length === 0 || !articleId) {
    return [];
  }

  return data.filter(row => row.articleId === articleId);
}

/**
 * Filtrerer data etter lager.
 *
 * @param {Array<Object>} data - Mappede data
 * @param {String} warehouse - Lager å filtrere på
 * @returns {Array<Object>} Filtrerte data
 */
function filterByWarehouse(data, warehouse) {
  if (!data || data.length === 0 || !warehouse) {
    return [];
  }

  return data.filter(row => row.warehouse === warehouse);
}

/**
 * Filtrerer data etter leverandør.
 *
 * @param {Array<Object>} data - Mappede data
 * @param {String} supplier - Leverandør å filtrere på
 * @returns {Array<Object>} Filtrerte data
 */
function filterBySupplier(data, supplier) {
  if (!data || data.length === 0 || !supplier) {
    return [];
  }

  return data.filter(row => row.supplier === supplier);
}

// ===========================
// GENERELL AGGREGERING
// ===========================

/**
 * Genererer en enkel oppsummering av data.
 *
 * @param {Array<Object>} data - Mappede data
 * @param {String} dataType - Datatype ('articles', 'orders_internal', 'orders_external')
 * @returns {Object} Oppsummeringsobjekt
 */
function generateSummary(data, dataType) {
  const summary = {
    dataType: dataType,
    totalRows: data ? data.length : 0,
    uniqueArticles: 0,
    breakdown: {}
  };

  if (!data || data.length === 0) {
    return summary;
  }

  // Unik antall artikler
  const articleIds = new Set(data.map(row => row.articleId).filter(id => id));
  summary.uniqueArticles = articleIds.size;

  // Datatype-spesifikk oppsummering
  switch (dataType) {
    case 'articles':
      summary.breakdown.byCategory = countByCategory(data);
      break;

    case 'orders_internal':
      summary.breakdown.byWarehouse = countByWarehouse(data);
      summary.totalQuantity = sumQuantity(data);
      break;

    case 'orders_external':
      summary.breakdown.bySupplier = countBySupplier(data);
      summary.totalQuantity = sumQuantity(data);
      break;
  }

  return summary;
}

// ===========================
// EKSPORT
// ===========================

window.DataAggregator = {
  countByArticle,
  countByWarehouse,
  countBySupplier,
  countByCategory,
  sumQuantity,
  sumQuantityByArticle,
  filterByArticle,
  filterByWarehouse,
  filterBySupplier,
  generateSummary
};
