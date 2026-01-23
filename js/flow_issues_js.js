// ===================================
// FLOW ISSUES
// SAP ↔ Jeeves integration tracking
// ===================================

class FlowIssues {
    static update(data) {
        const resultsDiv = document.getElementById('flowResults');
        const statusBadge = document.getElementById('flowStatus');
        
        if (!data || data.length === 0) {
            resultsDiv.innerHTML = '<p class="placeholder">Ingen problemer registrert ennå.</p>';
            statusBadge.textContent = '0 åpne';
            statusBadge.className = 'status-badge ok';
            return;
        }

        // Count open issues
        const openIssues = data.filter(issue => issue.status !== 'Closed').length;
        
        // Update badge
        statusBadge.textContent = `${openIssues} åpne`;
        statusBadge.className = 'status-badge ' + (openIssues > 0 ? 'warning' : 'ok');
        
        // Render issues
        resultsDiv.innerHTML = this.renderIssues(data);
    }

    static renderIssues(issues) {
        let html = '<table class="issues-table">';
        html += '<thead><tr>';
        html += '<th>Dato</th>';
        html += '<th>Type</th>';
        html += '<th>System</th>';
        html += '<th>Problem</th>';
        html += '<th>Status</th>';
        html += '<th>Handling</th>';
        html += '</tr></thead><tbody>';
        
        issues.forEach((issue, index) => {
            const statusClass = issue.status === 'Closed' ? 'ok' : 
                               issue.status === 'Monitoring' ? 'warning' : 'critical';
            
            html += '<tr>';
            html += `<td>${issue.date || 'N/A'}</td>`;
            html += `<td>${issue.type || 'N/A'}</td>`;
            html += `<td>${issue.system || 'N/A'}</td>`;
            html += `<td>${issue.description || 'N/A'}</td>`;
            html += `<td><span class="status-tag ${statusClass}">${issue.status || 'Open'}</span></td>`;
            html += `<td><button onclick="FlowIssues.editIssue(${index})" class="btn-small">Rediger</button></td>`;
            html += '</tr>';
        });
        
        html += '</tbody></table>';
        
        html += `<style>
            .issues-table { width: 100%; font-size: 13px; }
            .issues-table td { padding: 8px; }
            .status-tag { 
                padding: 3px 8px; 
                border-radius: 3px; 
                font-size: 11px; 
                font-weight: 600; 
            }
            .status-tag.ok { background: #27ae60; color: white; }
            .status-tag.warning { background: #f39c12; color: white; }
            .status-tag.critical { background: #e74c3c; color: white; }
            .btn-small { 
                padding: 4px 10px; 
                font-size: 12px; 
                background: #3498db; 
                color: white; 
                border: none; 
                border-radius: 3px; 
                cursor: pointer; 
            }
        </style>`;
        
        return html;
    }

    static addNew() {
        const date = new Date().toISOString().split('T')[0];
        
        const newIssue = {
            date: date,
            type: prompt('Type (Order / Item / Invoice):') || 'Order',
            system: prompt('System (SAP / Jeeves):') || 'SAP',
            description: prompt('Beskrivelse av problem:') || '',
            rootCause: '',
            tempFix: '',
            permFix: '',
            status: 'Open'
        };
        
        if (newIssue.description) {
            // Get current issues from app
            if (window.app) {
                window.app.data.flowIssues.push(newIssue);
                window.app.saveData();
                this.update(window.app.data.flowIssues);
            }
        }
    }

    static editIssue(index) {
        if (window.app && window.app.data.flowIssues[index]) {
            const issue = window.app.data.flowIssues[index];
            
            const newStatus = prompt('Status (Open / Monitoring / Closed):', issue.status);
            if (newStatus) {
                issue.status = newStatus;
                window.app.saveData();
                this.update(window.app.data.flowIssues);
            }
        }
    }
}

window.FlowIssues = FlowIssues;