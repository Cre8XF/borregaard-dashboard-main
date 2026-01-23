/**
 * KONTAKTOVERSIKT - BORREGAARD DASHBOARD
 * =======================================
 * Håndterer visning og filtrering av kontaktpersoner per lager.
 * Data lastes fra data/contacts.json.
 */

// ===========================
// GLOBALE VARIABLER
// ===========================

let allContacts = []; // Alle kontakter fra JSON
let currentFilter = 'Alle'; // Aktivt filter

// ===========================
// DOM-ELEMENTER
// ===========================

const departmentFilter = document.getElementById('departmentFilter');
const contactsGrid = document.getElementById('contactsGrid');
const contactCount = document.getElementById('contactCount');
const statusBadge = document.getElementById('statusBadge');

// ===========================
// INITIALISERING
// ===========================

/**
 * Kjøres når siden lastes.
 * Laster kontakter og setter opp event listeners.
 */
document.addEventListener('DOMContentLoaded', () => {
  loadContacts();
  setupEventListeners();
});

// ===========================
// EVENT LISTENERS
// ===========================

/**
 * Setter opp event listeners for filter
 */
function setupEventListeners() {
  departmentFilter.addEventListener('change', (e) => {
    currentFilter = e.target.value;
    renderContacts();
  });
}

// ===========================
// DATA LASTING
// ===========================

/**
 * Laster kontakter fra JSON-fil
 */
async function loadContacts() {
  try {
    const response = await fetch('data/contacts.json');

    if (!response.ok) {
      throw new Error('Kunne ikke laste kontakter');
    }

    allContacts = await response.json();
    renderContacts();
    updateStatusBadge('ok');

  } catch (error) {
    console.error('Feil ved lasting av kontakter:', error);
    showError('Kunne ikke laste kontakter. Sjekk at data/contacts.json eksisterer.');
    updateStatusBadge('error');
  }
}

// ===========================
// VISNING
// ===========================

/**
 * Viser kontakter basert på aktivt filter
 */
function renderContacts() {
  // Filtrer kontakter
  const filteredContacts = filterContacts();

  // Oppdater antall
  updateContactCount(filteredContacts.length);

  // Hvis ingen kontakter
  if (filteredContacts.length === 0) {
    contactsGrid.innerHTML = '<p class="placeholder">Ingen kontakter funnet for valgt filter.</p>';
    return;
  }

  // Generer HTML for alle kontakter
  const html = filteredContacts.map(contact => createContactCard(contact)).join('');
  contactsGrid.innerHTML = html;
}

/**
 * Filtrerer kontakter basert på aktivt filter
 * @returns {Array} Filtrerte kontakter
 */
function filterContacts() {
  // Hvis "Alle", vis alle aktive kontakter
  if (currentFilter === 'Alle') {
    return allContacts.filter(c => c.active);
  }

  // Hvis spesifikt lager, filtrer på department
  return allContacts.filter(c => c.active && c.department === currentFilter);
}

/**
 * Lager HTML for ett kontaktkort
 * @param {Object} contact - Kontaktobjekt
 * @returns {String} HTML-streng
 */
function createContactCard(contact) {
  // E-post: Hvis finnes, lag klikkbar lenke
  const emailHtml = contact.email
    ? `<a href="mailto:${contact.email}" style="color: var(--primary); text-decoration: none;">${contact.email}</a>`
    : '<span class="text-muted">Ingen e-post</span>';

  // Telefon: Hvis finnes, vis det. Ellers vis "Ingen telefon"
  const phoneHtml = contact.phone && contact.phone.trim() !== ''
    ? `<a href="tel:${contact.phone.replace(/\s/g, '')}" style="color: var(--primary); text-decoration: none;">${contact.phone}</a>`
    : '<span class="text-muted">Ingen telefon</span>';

  return `
    <div class="warehouse-card">
      <h4>${contact.name}</h4>
      <div class="warehouse-stats">
        <span class="stat stat-ok">${contact.department}</span>
      </div>
      <div style="margin-top: 10px; font-size: 14px;">
        <p style="margin: 5px 0;"><strong>Rolle:</strong> ${contact.role}</p>
        <p style="margin: 5px 0;"><strong>E-post:</strong> ${emailHtml}</p>
        <p style="margin: 5px 0;"><strong>Telefon:</strong> ${phoneHtml}</p>
      </div>
    </div>
  `;
}

// ===========================
// HJELPEFUNKSJONER
// ===========================

/**
 * Oppdaterer antall kontakter som vises
 * @param {Number} count - Antall kontakter
 */
function updateContactCount(count) {
  contactCount.textContent = `${count} kontakt${count !== 1 ? 'er' : ''}`;
}

/**
 * Oppdaterer status badge
 * @param {String} status - 'ok', 'error', 'warning'
 */
function updateStatusBadge(status) {
  statusBadge.className = 'status-badge';

  switch (status) {
    case 'ok':
      statusBadge.classList.add('ok');
      statusBadge.textContent = 'Aktiv';
      break;
    case 'error':
      statusBadge.classList.add('critical');
      statusBadge.textContent = 'Feil';
      break;
    case 'warning':
      statusBadge.classList.add('warning');
      statusBadge.textContent = 'Advarsel';
      break;
    default:
      statusBadge.textContent = 'Ukjent';
  }
}

/**
 * Viser feilmelding i grid
 * @param {String} message - Feilmeldingen
 */
function showError(message) {
  contactsGrid.innerHTML = `
    <div class="alert alert-danger">
      <h4>Feil</h4>
      <p>${message}</p>
    </div>
  `;
}
