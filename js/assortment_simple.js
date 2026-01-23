// ===================================
// ASSORTMENT MANAGER
// Customer-specific catalog control
// ===================================

class Assortment {
  static update(data) {
    const resultsDiv = document.getElementById('assortmentResults')
    const statusBadge = document.getElementById('assortmentStatus')

    if (!data || data.length === 0) {
      resultsDiv.innerHTML =
        '<p class="placeholder">Ingen sortimentsdata lastet inn ennå.</p>'
      statusBadge.textContent = 'Ingen data'
      statusBadge.className = 'status-badge'
      return
    }

    // Count active items
    const activeCount = data.filter(
      (item) => item.status === 'Active' || item.status === 'Aktiv'
    ).length

    statusBadge.textContent = `${activeCount} aktive`
    statusBadge.className = 'status-badge ok'

    // Render assortment table
    resultsDiv.innerHTML = this.renderAssortment(data)
  }

  static renderAssortment(items) {
    let html = '<div class="assortment-controls">'
    html +=
      '<input type="text" id="assortmentSearch" placeholder="Søk etter varenummer eller navn..." style="width: 300px; padding: 8px; margin-bottom: 10px;">'
    html +=
      '<button onclick="Assortment.exportCSV()" class="btn-secondary" style="margin-left: 10px;">Eksporter CSV</button>'
    html += '</div>'

    html += '<table class="assortment-table">'
    html += '<thead><tr>'
    html += '<th>Varenummer</th>'
    html += '<th>Status</th>'
    html += '<th>Erstatning</th>'
    html += '<th>Katalog</th>'
    html += '<th>Leverandør</th>'
    html += '<th>Notater</th>'
    html += '<th>Handling</th>'
    html += '</tr></thead><tbody id="assortmentTableBody">'

    items.forEach((item, index) => {
      const statusClass =
        item.status === 'Active' || item.status === 'Aktiv'
          ? 'ok'
          : item.status === 'Outgoing' || item.status === 'Utgående'
          ? 'warning'
          : ''

      html += '<tr>'
      html += `<td>${item.itemNo || item['Item Number'] || ''}</td>`
      html += `<td><span class="status-tag ${statusClass}">${
        item.status || 'N/A'
      }</span></td>`
      html += `<td>${item.replacement || item['Replacement'] || '-'}</td>`
      html += `<td>${item.catalog || item['Catalog'] || '-'}</td>`
      html += `<td>${item.supplier || item['Supplier'] || '-'}</td>`
      html += `<td>${item.notes || item['Notes'] || '-'}</td>`
      html += `<td><button onclick="Assortment.editItem(${index})" class="btn-small">Rediger</button></td>`
      html += '</tr>'
    })

    html += '</tbody></table>'

    // Add search functionality
    html += `<script>
            document.getElementById('assortmentSearch')?.addEventListener('input', function(e) {
                const searchTerm = e.target.value.toLowerCase();
                const rows = document.querySelectorAll('#assortmentTableBody tr');
                rows.forEach(row => {
                    const text = row.textContent.toLowerCase();
                    row.style.display = text.includes(searchTerm) ? '' : 'none';
                });
            });
        </script>`

    html += `<style>
            .assortment-controls { margin-bottom: 15px; }
            .assortment-table { width: 100%; font-size: 13px; }
            .assortment-table td { padding: 8px; }
            .status-tag {
                padding: 3px 8px;
                border-radius: 3px;
                font-size: 11px;
                font-weight: 600;
            }
            .status-tag.ok { background: #27ae60; color: white; }
            .status-tag.warning { background: #f39c12; color: white; }
            .btn-small {
                padding: 4px 10px;
                font-size: 12px;
                background: #3498db;
                color: white;
                border: none;
                border-radius: 3px;
                cursor: pointer;
            }
        </style>`

    return html
  }

  static addNew() {
    const newItem = {
      itemNo: prompt('Varenummer:') || '',
      status: prompt('Status (Active / Outgoing / Replacement):') || 'Active',
      replacement: prompt('Erstatningsprodukt (hvis relevant):') || '',
      catalog: prompt('Katalog (A / Outside):') || 'A',
      supplier: prompt('Leverandør:') || '',
      notes: prompt('Notater:') || '',
    }

    if (newItem.itemNo) {
      if (window.app) {
        window.app.data.assortment.push(newItem)
        window.app.saveData()
        this.update(window.app.data.assortment)
      }
    }
  }

  static editItem(index) {
    if (window.app && window.app.data.assortment[index]) {
      const item = window.app.data.assortment[index]

      const newStatus = prompt(
        'Status (Active / Outgoing / Replacement):',
        item.status
      )
      const newNotes = prompt('Notater:', item.notes)

      if (newStatus) item.status = newStatus
      if (newNotes !== null) item.notes = newNotes

      window.app.saveData()
      this.update(window.app.data.assortment)
    }
  }

  static exportCSV() {
    if (!window.app || !window.app.data.assortment.length) {
      alert('Ingen data å eksportere')
      return
    }

    const items = window.app.data.assortment
    const headers = [
      'Varenummer',
      'Status',
      'Erstatning',
      'Katalog',
      'Leverandør',
      'Notater',
    ]

    let csv = headers.join(',') + '\n'

    items.forEach((item) => {
      csv +=
        [
          item.itemNo || '',
          item.status || '',
          item.replacement || '',
          item.catalog || '',
          item.supplier || '',
          item.notes || '',
        ].join(',') + '\n'
    })

    // Download
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = window.URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'sortiment_' + new Date().toISOString().split('T')[0] + '.csv'
    a.click()
  }
}

window.Assortment = Assortment
