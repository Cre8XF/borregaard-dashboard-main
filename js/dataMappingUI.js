/**
 * DATA MAPPING UI - BORREGAARD DASHBOARD
 * =======================================
 * Håndterer visning av datamapping-status i dashboardet.
 */

// ===========================
// GLOBALE VARIABLER
// ===========================

const DATA_TYPES = {
  articles: {
    id: 'articles',
    name: 'Artikler',
    badgeId: 'articlesStatusBadge',
    textId: 'articlesStatusText',
    detailsId: 'articlesDetails'
  },
  orders_internal: {
    id: 'orders_internal',
    name: 'Interne ordre',
    badgeId: 'ordersInternalStatusBadge',
    textId: 'ordersInternalStatusText',
    detailsId: 'ordersInternalDetails'
  },
  orders_external: {
    id: 'orders_external',
    name: 'Eksterne innkjøp',
    badgeId: 'ordersExternalStatusBadge',
    textId: 'ordersExternalStatusText',
    detailsId: 'ordersExternalDetails'
  }
};

// ===========================
// INITIALISERING
// ===========================

document.addEventListener('DOMContentLoaded', () => {
  initDataMappingUI();
});

/**
 * Initialiserer datamapping UI
 */
function initDataMappingUI() {
  // Sett opp refresh-knapp
  const refreshBtn = document.getElementById('refreshDataBtn');
  if (refreshBtn) {
    refreshBtn.addEventListener('click', refreshAllDataStatus);
  }

  // Last status for alle datatyper ved oppstart
  refreshAllDataStatus();
}

// ===========================
// STATUS OPPDATERING
// ===========================

/**
 * Oppdaterer status for alle datatyper
 */
async function refreshAllDataStatus() {
  // Oppdater status for hver datatype
  for (const dataTypeKey in DATA_TYPES) {
    await updateDataTypeStatus(dataTypeKey);
  }
}

/**
 * Oppdaterer status for én datatype
 * @param {String} dataType - 'articles', 'orders_internal', eller 'orders_external'
 */
async function updateDataTypeStatus(dataType) {
  const config = DATA_TYPES[dataType];

  if (!config) {
    console.error('Ukjent datatype:', dataType);
    return;
  }

  const badge = document.getElementById(config.badgeId);
  const text = document.getElementById(config.textId);
  const details = document.getElementById(config.detailsId);

  if (!badge || !text || !details) {
    console.error('Kunne ikke finne UI-elementer for', dataType);
    return;
  }

  // Vis lasting-status
  badge.className = 'status-badge';
  badge.textContent = 'Laster...';
  text.textContent = 'Sjekker data og mapping...';
  details.innerHTML = '';

  try {
    // Prosesser data via DataMapper
    const result = await window.DataMapper.processDataType(dataType);

    // Oppdater UI basert på resultat
    updateUIWithResult(config, result);

  } catch (error) {
    console.error('Feil ved oppdatering av status:', error);
    badge.className = 'status-badge critical';
    badge.textContent = 'Feil';
    text.textContent = `Kunne ikke laste data: ${error.message}`;
  }
}

/**
 * Oppdaterer UI-elementer basert på prosesseringsresultat
 * @param {Object} config - Konfigurasjon for datatype
 * @param {Object} result - Resultat fra processDataType
 */
function updateUIWithResult(config, result) {
  const badge = document.getElementById(config.badgeId);
  const text = document.getElementById(config.textId);
  const details = document.getElementById(config.detailsId);

  // Generer hovedtekst
  let statusText = '';
  let badgeClass = 'status-badge';
  let badgeText = '';

  if (!result.rawDataLoaded) {
    statusText = `CSV-fil ikke funnet (data/raw/${result.dataType}.csv)`;
    badgeClass = 'status-badge warning';
    badgeText = 'Ingen data';

  } else if (!result.mappingLoaded) {
    statusText = `CSV lastet (${result.rowsParsed} rader) – Mapping-fil ikke funnet`;
    badgeClass = 'status-badge warning';
    badgeText = 'Mapping mangler';

  } else if (!result.mappingValid) {
    statusText = `CSV lastet (${result.rowsParsed} rader) – Mapping er tom eller ugyldig`;
    badgeClass = 'status-badge warning';
    badgeText = 'Mapping tom';

  } else if (result.rowsMapped === 0) {
    statusText = `CSV lastet (${result.rowsParsed} rader) – Mapping definert – 0 gyldige rader`;
    badgeClass = 'status-badge critical';
    badgeText = '0 gyldige rader';

  } else {
    statusText = `CSV lastet – Mapping OK – ${result.rowsMapped} av ${result.rowsParsed} rader mappet`;
    badgeClass = 'status-badge ok';
    badgeText = `${result.rowsMapped} rader`;
  }

  // Oppdater badge
  badge.className = badgeClass;
  badge.textContent = badgeText;

  // Oppdater hovedtekst
  text.textContent = statusText;
  text.className = result.errors.length > 0 ? 'placeholder' : '';

  // Generer detaljert info
  let detailsHTML = '';

  if (result.errors.length > 0) {
    detailsHTML += '<p style="color: #e74c3c; margin: 5px 0;"><strong>Feil:</strong></p>';
    detailsHTML += '<ul style="margin: 0; padding-left: 20px;">';
    result.errors.forEach(error => {
      detailsHTML += `<li style="color: #e74c3c;">${error}</li>`;
    });
    detailsHTML += '</ul>';
  }

  // Vis aggregert info hvis data er mappet
  if (result.rowsMapped > 0 && result.data.length > 0) {
    const summary = window.DataAggregator.generateSummary(result.data, result.dataType);

    detailsHTML += '<div style="margin-top: 10px; padding: 10px; background: #f0f0f0; border-radius: 4px;">';
    detailsHTML += `<p style="margin: 0 0 5px 0;"><strong>Oppsummering:</strong></p>`;
    detailsHTML += `<p style="margin: 3px 0;">📊 Totalt: ${summary.totalRows} rader</p>`;
    detailsHTML += `<p style="margin: 3px 0;">🏷️ Unike artikler: ${summary.uniqueArticles}</p>`;

    // Vis breakdown basert på datatype
    if (summary.breakdown) {
      if (summary.breakdown.byCategory) {
        detailsHTML += '<p style="margin: 3px 0;">📁 Per kategori:</p>';
        detailsHTML += '<ul style="margin: 0; padding-left: 20px;">';
        Object.entries(summary.breakdown.byCategory).forEach(([category, count]) => {
          detailsHTML += `<li>${category}: ${count}</li>`;
        });
        detailsHTML += '</ul>';
      }

      if (summary.breakdown.byWarehouse) {
        detailsHTML += '<p style="margin: 3px 0;">🏭 Per lager:</p>';
        detailsHTML += '<ul style="margin: 0; padding-left: 20px;">';
        Object.entries(summary.breakdown.byWarehouse).forEach(([warehouse, count]) => {
          detailsHTML += `<li>${warehouse}: ${count} ordre</li>`;
        });
        detailsHTML += '</ul>';
      }

      if (summary.breakdown.bySupplier) {
        detailsHTML += '<p style="margin: 3px 0;">🚚 Per leverandør:</p>';
        detailsHTML += '<ul style="margin: 0; padding-left: 20px;">';
        Object.entries(summary.breakdown.bySupplier).forEach(([supplier, count]) => {
          detailsHTML += `<li>${supplier}: ${count} innkjøp</li>`;
        });
        detailsHTML += '</ul>';
      }
    }

    if (summary.totalQuantity) {
      detailsHTML += `<p style="margin: 3px 0;">📦 Total mengde: ${summary.totalQuantity}</p>`;
    }

    detailsHTML += '</div>';
  }

  // Legg til instruksjoner hvis mapping mangler
  if (!result.mappingValid && result.rawDataLoaded) {
    detailsHTML += '<div style="margin-top: 10px; padding: 10px; background: #fff3cd; border-radius: 4px; border-left: 4px solid #ffc107;">';
    detailsHTML += '<p style="margin: 0 0 5px 0;"><strong>💡 Slik konfigurerer du mapping:</strong></p>';
    detailsHTML += `<ol style="margin: 5px 0; padding-left: 20px; font-size: 13px;">`;
    detailsHTML += `<li>Åpne filen <code>data/mapping/${result.dataType}.map.json</code></li>`;
    detailsHTML += `<li>Fyll inn kolonnenavn fra CSV-filen for hvert felt</li>`;
    detailsHTML += `<li>Lagre filen og klikk "Oppdater datamapping-status"</li>`;
    detailsHTML += `</ol>`;
    detailsHTML += '</div>';
  }

  details.innerHTML = detailsHTML;
}

// ===========================
// EKSPORT
// ===========================

window.DataMappingUI = {
  refreshAllDataStatus,
  updateDataTypeStatus
};
