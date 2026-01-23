const stepStart = document.getElementById('step-start')
const stepRegister = document.getElementById('step-register')

const lagerSelect = document.getElementById('lagerSelect')
const startBtn = document.getElementById('startBtn')

const aktivtLagerEl = document.getElementById('aktivtLager')
const aktivUkeEl = document.getElementById('aktivUke')

const artnrInput = document.getElementById('artnr')
const antallInput = document.getElementById('antall')
const kommentarInput = document.getElementById('kommentar')
const addBtn = document.getElementById('addBtn')

const itemsList = document.getElementById('itemsList')
const finishBtn = document.getElementById('finishBtn')
const resetBtn = document.getElementById('resetBtn')

const scanBtn = document.getElementById('scanBtn')
const cancelScanBtn = document.getElementById('cancelScanBtn')

let activeStream = null
let activeScanInterval = null

let session = {
  lager: null,
  lagerNavn: null,
  uke: null,
  dato: null,
  items: [],
}

/* ---------- INIT ---------- */
init()

async function init() {
  await loadLagre()
  setDateInfo()
}

/* ---------- LAGRE ---------- */
async function loadLagre() {
  try {
    const res = await fetch('data/lagre.json')
    if (!res.ok) throw new Error(`HTTP ${res.status}`)

    const lagre = await res.json()
    const aktive = lagre.filter((l) => l.aktiv)

    if (aktive.length === 0) {
      console.warn('Ingen aktive lagre funnet')
      return
    }

    aktive.forEach((l) => {
      const opt = document.createElement('option')
      opt.value = l.id
      opt.textContent = l.navn
      lagerSelect.appendChild(opt)
    })

    console.log(`Lastet ${aktive.length} aktive lagre`)
  } catch (err) {
    console.error('Feil ved lasting av lagre:', err)
    alert('Kunne ikke laste lagre. Sjekk at data/lagre.json finnes.')
  }
}

/* ---------- DATO / UKE ---------- */
function setDateInfo() {
  const now = new Date()
  document.getElementById('dato').textContent = now.toLocaleDateString('no-NO')

  const week = getWeekNumber(now)
  document.getElementById('uke').textContent = week

  session.dato = now.toISOString().slice(0, 10)
  session.uke = week
}

function getWeekNumber(d) {
  d = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()))
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7))
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
  return Math.ceil(((d - yearStart) / 86400000 + 1) / 7)
}

/* ---------- START RUNDE ---------- */
lagerSelect.addEventListener('change', () => {
  startBtn.disabled = !lagerSelect.value
})

startBtn.addEventListener('click', () => {
  session.lager = lagerSelect.value
  session.lagerNavn = lagerSelect.options[lagerSelect.selectedIndex].text

  aktivtLagerEl.textContent = session.lagerNavn

  aktivUkeEl.textContent = session.uke

  console.log(
    `Startet runde: ${session.lager}, Uke ${session.uke}, ${session.dato}`
  )

  stepStart.classList.remove('active')
  stepRegister.classList.add('active')
})

/* ---------- LEGG TIL VARE ---------- */
addBtn.addEventListener('click', () => {
  const artnr = artnrInput.value.trim()
  const antall = antallInput.value
  const kommentar = kommentarInput.value.trim()

  if (!artnr || !antall) return

  // FUTURE: Validate against article master data (Excel)
  // This will support multiple article numbers per item:
  // - Tools article number
  // - Supplier article number
  // - Borregaard article number
  // validateArticleNumber(artnr)

  session.items.push({ artnr, antall, kommentar })
  renderList()

  artnrInput.value = ''
  antallInput.value = ''
  kommentarInput.value = ''
  artnrInput.focus()
})

function renderList() {
  itemsList.innerHTML = ''
  session.items.forEach((item, index) => {
    const li = document.createElement('li')
    li.dataset.index = index

    const contentDiv = document.createElement('div')
    contentDiv.className = 'item-content'

    const infoDiv = document.createElement('div')
    infoDiv.className = 'item-info'
    infoDiv.innerHTML = `
      <div><strong>${item.artnr}</strong> – ${item.antall} stk</div>
      ${item.kommentar ? `<div class="item-comment">${escapeHtml(item.kommentar)}</div>` : ''}
    `

    const actionsDiv = document.createElement('div')
    actionsDiv.className = 'item-actions'

    const editBtn = document.createElement('button')
    editBtn.textContent = '✏️'
    editBtn.className = 'edit-btn'
    editBtn.onclick = () => editItem(index)

    const deleteBtn = document.createElement('button')
    deleteBtn.textContent = '🗑️'
    deleteBtn.className = 'delete-btn'
    deleteBtn.onclick = () => deleteItem(index)

    actionsDiv.appendChild(editBtn)
    actionsDiv.appendChild(deleteBtn)

    contentDiv.appendChild(infoDiv)
    contentDiv.appendChild(actionsDiv)
    li.appendChild(contentDiv)

    itemsList.appendChild(li)
  })
}

function escapeHtml(text) {
  const div = document.createElement('div')
  div.textContent = text
  return div.innerHTML
}

/* ---------- EDIT / DELETE ---------- */
function deleteItem(index) {
  if (confirm('Slett denne varen?')) {
    session.items.splice(index, 1)
    renderList()
  }
}

function editItem(index) {
  const item = session.items[index]
  const li = itemsList.querySelector(`li[data-index="${index}"]`)

  li.innerHTML = `
    <div class="edit-inputs">
      <input type="text" value="${escapeHtml(item.artnr)}" id="edit-artnr-${index}" placeholder="Artikkelnummer" />
      <input type="number" value="${item.antall}" id="edit-antall-${index}" placeholder="Antall" />
      <input type="text" value="${escapeHtml(item.kommentar)}" id="edit-kommentar-${index}" placeholder="Kommentar" />
      <button onclick="saveEdit(${index})">💾</button>
      <button onclick="renderList()">❌</button>
    </div>
  `
}

function saveEdit(index) {
  const artnrInput = document.getElementById(`edit-artnr-${index}`)
  const antallInput = document.getElementById(`edit-antall-${index}`)
  const kommentarInput = document.getElementById(`edit-kommentar-${index}`)

  const artnr = artnrInput.value.trim()
  const antall = antallInput.value
  const kommentar = kommentarInput.value.trim()

  if (!artnr || !antall) {
    alert('Artikkelnummer og antall må fylles ut')
    return
  }

  // FUTURE: Validate against article master data (Excel)
  // validateArticleNumber(artnr)

  session.items[index].artnr = artnr
  session.items[index].antall = antall
  session.items[index].kommentar = kommentar

  renderList()
}

/* ---------- BARCODE SKANNING ---------- */

scanBtn.addEventListener('click', async () => {
  if (!('BarcodeDetector' in window)) {
    alert('Strekkodeskanner støttes ikke på denne enheten')
    return
  }

  try {
    const detector = new BarcodeDetector({ formats: ['qr_code', 'ean_13', 'code_128'] })

    activeStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'environment' },
    })

    const video = document.createElement('video')
    video.id = 'barcode-video'
    video.srcObject = activeStream
    video.play()

    document.body.appendChild(video)

    scanBtn.style.display = 'none'
    cancelScanBtn.style.display = 'block'

    activeScanInterval = setInterval(async () => {
      const barcodes = await detector.detect(video)
      if (barcodes.length > 0) {
        artnrInput.value = barcodes[0].rawValue
        stopScanning()
        antallInput.focus()
      }
    }, 500)
  } catch (err) {
    console.error('Feil ved oppstart av kamera:', err)
    alert('Kunne ikke starte kamera. Sjekk tillatelser.')
    stopScanning()
  }
})

cancelScanBtn.addEventListener('click', () => {
  stopScanning()
})

function stopScanning() {
  if (activeStream) {
    activeStream.getTracks().forEach((t) => t.stop())
    activeStream = null
  }

  if (activeScanInterval) {
    clearInterval(activeScanInterval)
    activeScanInterval = null
  }

  const video = document.getElementById('barcode-video')
  if (video) {
    video.remove()
  }

  scanBtn.style.display = 'block'
  cancelScanBtn.style.display = 'none'
}

/* ---------- AVSLUTT OG EKSPORTER ---------- */
finishBtn.addEventListener('click', () => {
  if (session.items.length === 0) {
    alert('Ingen varer registrert ennå')
    return
  }

  const csv = generateCSV()
  const filename = generateFilename()
  downloadCSV(csv, filename)

  console.log(`Eksportert ${session.items.length} varer til ${filename}`)

  if (confirm('Vil du starte en ny runde?')) {
    session.items = []
    renderList()
    stepRegister.classList.remove('active')
    stepStart.classList.add('active')
  }
})

/* ---------- SLETT RUNDE / START PÅ NYTT ---------- */
resetBtn.addEventListener('click', () => {
  if (session.items.length === 0) {
    // If no items, just go back to start
    stepRegister.classList.remove('active')
    stepStart.classList.add('active')
    return
  }

  if (confirm('Er du sikker på at du vil slette denne runden?\n\nAlle registrerte varer vil bli fjernet (dette påvirker ikke tidligere nedlastede CSV-filer).')) {
    session.items = []
    renderList()
    stepRegister.classList.remove('active')
    stepStart.classList.add('active')
    console.log('Runde slettet')
  }
})

function generateCSV() {
  const header = 'Dato;Uke;Lager;Artikkelnummer;Antall;Kommentar'
  const rows = session.items.map((item) => {
    const kommentar = item.kommentar ? csvEscape(item.kommentar) : ''
    return `${session.dato};${session.uke};${session.lager};${item.artnr};${item.antall};${kommentar}`
  })
  return [header, ...rows].join('\n')
}

function generateFilename() {
  // Sanitize warehouse name for filename (remove spaces, special chars, convert to lowercase)
  const lagerSanitized = (session.lagerNavn || session.lager)
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')

  // Format: lagerkontroll-uke{N}-{lager}.csv
  // Example: lagerkontroll-uke4-demo.csv
  return `lagerkontroll-uke${session.uke}-${lagerSanitized}.csv`
}

function csvEscape(text) {
  if (!text) return ''
  if (text.includes(';') || text.includes('"') || text.includes('\n')) {
    return `"${text.replace(/"/g, '""')}"`
  }
  return text
}

function downloadCSV(content, filename) {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' })
  const link = document.createElement('a')
  link.href = URL.createObjectURL(blob)
  link.download = filename
  link.click()
  URL.revokeObjectURL(link.href)
}

/* ---------- ARTICLE MASTER DATA (FUTURE) ---------- */
// Structure for future Excel-based article validation
//
// Expected data model:
// {
//   toolsArticleNo: "12345",
//   supplierArticleNo: "SUP-67890",
//   borregaardArticleNo: "BRG-ABC",
//   description: "Product name",
//   status: "active" | "discontinued" | "inactive"
// }
//
// Future implementation:
// 1. Load Excel data (via file input or fetch)
// 2. Parse and store in memory or localStorage
// 3. Validate on scan/manual entry:
//    - Check if article exists (any of the 3 number types)
//    - Warn if discontinued/inactive
//    - Auto-complete description
//
// function validateArticleNumber(scannedValue) {
//   const article = articleMasterData.find(item =>
//     item.toolsArticleNo === scannedValue ||
//     item.supplierArticleNo === scannedValue ||
//     item.borregaardArticleNo === scannedValue
//   )
//
//   if (!article) {
//     return { valid: false, message: 'Artikkelnummer ikke funnet' }
//   }
//
//   if (article.status === 'discontinued') {
//     return { valid: true, warning: 'OBS: Vare utgått' }
//   }
//
//   if (article.status === 'inactive') {
//     return { valid: true, warning: 'OBS: Vare inaktiv' }
//   }
//
//   return { valid: true, article }
// }
