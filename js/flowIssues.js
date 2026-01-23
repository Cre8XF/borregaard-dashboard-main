// ===================================
// FLOW ISSUES - ENHANCED KNOWLEDGE BASE
// SAP ↔ Jeeves integration issue tracking and analytics
// Structured logging, root cause analysis, and trend detection
// ===================================

/**
 * FlowIssues - Comprehensive issue tracking and knowledge base
 * Tracks SAP/Jeeves integration problems with full workflow
 */
class FlowIssues {
    /**
     * Issue categories
     */
    static CATEGORIES = {
        'Order': 'Ordre',
        'Item': 'Vare',
        'Invoice': 'Faktura',
        'Pricing': 'Prising',
        'Stock': 'Lagerbeholdning',
        'Customer': 'Kunde',
        'Transfer': 'Overføring',
        'Other': 'Annet'
    };

    /**
     * Systems
     */
    static SYSTEMS = {
        'SAP': 'SAP',
        'Jeeves': 'Jeeves',
        'Both': 'Begge',
        'Other': 'Annet'
    };

    /**
     * Severity levels
     */
    static SEVERITIES = {
        'Low': 'Lav',
        'Medium': 'Medium',
        'High': 'Høy',
        'Critical': 'Kritisk'
    };

    /**
     * Status workflow
     */
    static STATUSES = {
        'Open': 'Åpen',
        'Investigating': 'Undersøkes',
        'Workaround': 'Midlertidig løsning',
        'Monitoring': 'Overvåkes',
        'Closed': 'Lukket'
    };

    /**
     * Common root causes
     */
    static ROOT_CAUSES = [
        'Data sync forsinkelse',
        'Manglende mapping',
        'Feil i hoveddata',
        'Tilgangsproblem',
        'API timeout',
        'Duplikat oppføring',
        'Manglende validering',
        'Format feil',
        'Versjonsmismatch',
        'Annet'
    ];

    /**
     * Update flow issues display
     */
    static update(data) {
        const resultsDiv = document.getElementById('flowResults');
        const statusBadge = document.getElementById('flowStatus');

        if (!data || data.length === 0) {
            resultsDiv.innerHTML = `
                <p class="placeholder">Ingen problemer registrert ennå.</p>
                <p class="text-muted">Bruk knappen over for å logge et nytt problem.</p>
            `;
            statusBadge.textContent = '0 åpne';
            statusBadge.className = 'status-badge ok';
            return;
        }

        // Analyze issues
        const analysis = this.analyzeIssues(data);

        // Update badge
        const openCount = analysis.byStatus['Open'] || 0;
        const investigatingCount = analysis.byStatus['Investigating'] || 0;
        const totalOpen = openCount + investigatingCount;

        statusBadge.textContent = `${totalOpen} åpne`;
        statusBadge.className = 'status-badge ' + (totalOpen > 5 ? 'critical' : totalOpen > 0 ? 'warning' : 'ok');

        // Render comprehensive dashboard
        resultsDiv.innerHTML = this.renderIssueDashboard(data, analysis);
    }

    /**
     * Analyze issues for insights
     */
    static analyzeIssues(data) {
        const analysis = {
            total: data.length,
            byStatus: {},
            byCategory: {},
            bySystem: {},
            bySeverity: {},
            byRootCause: {},
            recentIssues: [],
            recurringIssues: [],
            avgResolutionTime: 0
        };

        // Count by status
        data.forEach(issue => {
            const status = issue.status || 'Open';
            analysis.byStatus[status] = (analysis.byStatus[status] || 0) + 1;

            const category = issue.category || 'Other';
            analysis.byCategory[category] = (analysis.byCategory[category] || 0) + 1;

            const system = issue.system || 'Other';
            analysis.bySystem[system] = (analysis.bySystem[system] || 0) + 1;

            const severity = issue.severity || 'Medium';
            analysis.bySeverity[severity] = (analysis.bySeverity[severity] || 0) + 1;

            if (issue.rootCause) {
                analysis.byRootCause[issue.rootCause] = (analysis.byRootCause[issue.rootCause] || 0) + 1;
            }
        });

        // Find recent issues (last 30 days)
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

        analysis.recentIssues = data.filter(issue => {
            if (!issue.date) return false;
            const issueDate = new Date(issue.date);
            return issueDate >= thirtyDaysAgo;
        }).sort((a, b) => new Date(b.date) - new Date(a.date));

        // Find recurring issues (same root cause multiple times)
        Object.keys(analysis.byRootCause).forEach(rootCause => {
            if (analysis.byRootCause[rootCause] >= 3) {
                analysis.recurringIssues.push({
                    rootCause: rootCause,
                    count: analysis.byRootCause[rootCause]
                });
            }
        });

        analysis.recurringIssues.sort((a, b) => b.count - a.count);

        // Calculate average resolution time (for closed issues)
        const closedIssues = data.filter(issue => {
            return issue.status === 'Closed' && issue.date && issue.closedDate;
        });

        if (closedIssues.length > 0) {
            const totalDays = closedIssues.reduce((sum, issue) => {
                const start = new Date(issue.date);
                const end = new Date(issue.closedDate);
                const days = Math.floor((end - start) / (1000 * 60 * 60 * 24));
                return sum + days;
            }, 0);

            analysis.avgResolutionTime = Math.round(totalDays / closedIssues.length);
        }

        return analysis;
    }

    /**
     * Render comprehensive issue dashboard
     */
    static renderIssueDashboard(data, analysis) {
        let html = '';

        // Summary cards
        html += '<div class="summary-cards">';
        html += `
            <div class="summary-card">
                <div class="card-value">${analysis.total}</div>
                <div class="card-label">Totalt problemer</div>
            </div>
            <div class="summary-card card-warning">
                <div class="card-value">${(analysis.byStatus['Open'] || 0) + (analysis.byStatus['Investigating'] || 0)}</div>
                <div class="card-label">Åpne</div>
            </div>
            <div class="summary-card">
                <div class="card-value">${analysis.byStatus['Closed'] || 0}</div>
                <div class="card-label">Lukket</div>
            </div>
            <div class="summary-card">
                <div class="card-value">${analysis.recurringIssues.length}</div>
                <div class="card-label">Tilbakevendende</div>
            </div>
        `;
        html += '</div>';

        // Analytics charts (text-based summary for now)
        html += '<div class="analytics-grid">';

        // By category
        html += '<div class="analytics-card">';
        html += '<h4>Problemer per kategori</h4>';
        const sortedCategories = Object.entries(analysis.byCategory)
            .sort((a, b) => b[1] - a[1]);
        html += '<ul class="stats-list">';
        sortedCategories.forEach(([cat, count]) => {
            const pct = Math.round((count / analysis.total) * 100);
            html += `<li><span class="stat-label">${this.CATEGORIES[cat] || cat}</span> <span class="stat-value">${count} (${pct}%)</span></li>`;
        });
        html += '</ul>';
        html += '</div>';

        // By system
        html += '<div class="analytics-card">';
        html += '<h4>Problemer per system</h4>';
        const sortedSystems = Object.entries(analysis.bySystem)
            .sort((a, b) => b[1] - a[1]);
        html += '<ul class="stats-list">';
        sortedSystems.forEach(([sys, count]) => {
            const pct = Math.round((count / analysis.total) * 100);
            html += `<li><span class="stat-label">${this.SYSTEMS[sys] || sys}</span> <span class="stat-value">${count} (${pct}%)</span></li>`;
        });
        html += '</ul>';
        html += '</div>';

        html += '</div>';

        // Recurring issues warning
        if (analysis.recurringIssues.length > 0) {
            html += '<div class="alert alert-warning">';
            html += '<h4>⚠️ Tilbakevendende problemer</h4>';
            html += '<p>Følgende problemer gjentar seg ofte og bør få permanent løsning:</p>';
            html += '<ul>';
            analysis.recurringIssues.forEach(issue => {
                html += `<li><strong>${issue.rootCause}</strong> - ${issue.count} ganger</li>`;
            });
            html += '</ul>';
            html += '</div>';
        }

        // Action buttons
        html += '<div class="action-buttons" style="margin: 20px 0;">';
        html += '<button onclick="FlowIssues.exportIssues()" class="btn-secondary">📥 Eksporter alle problemer</button>';
        html += '<button onclick="FlowIssues.exportAnalytics()" class="btn-secondary">📊 Eksporter analyse</button>';
        html += '</div>';

        // Search and filter
        html += '<div class="table-controls">';
        html += '<input type="text" id="issueSearch" placeholder="Søk i problemer..." class="search-input">';
        html += '<select id="statusFilter" class="filter-select">';
        html += '<option value="all">Alle statuser</option>';
        Object.keys(this.STATUSES).forEach(status => {
            html += `<option value="${status}">${this.STATUSES[status]}</option>`;
        });
        html += '</select>';
        html += '<select id="severityFilter" class="filter-select">';
        html += '<option value="all">Alle alvorlighetsgrader</option>';
        Object.keys(this.SEVERITIES).forEach(sev => {
            html += `<option value="${sev}">${this.SEVERITIES[sev]}</option>`;
        });
        html += '</select>';
        html += '</div>';

        // Issues table
        html += '<table class="data-table" id="issuesTable">';
        html += '<thead><tr>';
        html += '<th>Dato</th>';
        html += '<th>Type</th>';
        html += '<th>System</th>';
        html += '<th>Alvorlighet</th>';
        html += '<th>Problem</th>';
        html += '<th>Status</th>';
        html += '<th>Handling</th>';
        html += '</tr></thead><tbody>';

        // Sort by date (newest first)
        const sortedData = [...data].sort((a, b) => {
            const dateA = a.date ? new Date(a.date) : new Date(0);
            const dateB = b.date ? new Date(b.date) : new Date(0);
            return dateB - dateA;
        });

        sortedData.forEach((issue, index) => {
            const statusClass = this.getStatusClass(issue.status);
            const severityClass = this.getSeverityClass(issue.severity);

            html += `<tr data-status="${issue.status || 'Open'}" data-severity="${issue.severity || 'Medium'}">`;
            html += `<td>${this.formatDate(issue.date)}</td>`;
            html += `<td>${this.CATEGORIES[issue.category] || issue.category || 'N/A'}</td>`;
            html += `<td>${this.SYSTEMS[issue.system] || issue.system || 'N/A'}</td>`;
            html += `<td><span class="severity-badge ${severityClass}">${this.SEVERITIES[issue.severity] || 'Medium'}</span></td>`;
            html += `<td class="issue-description">${issue.description || 'N/A'}</td>`;
            html += `<td><span class="status-tag ${statusClass}">${this.STATUSES[issue.status] || 'Åpen'}</span></td>`;
            html += `<td>`;
            html += `<button onclick="FlowIssues.viewIssue(${index})" class="btn-small">Se</button> `;
            html += `<button onclick="FlowIssues.editIssue(${index})" class="btn-small">Rediger</button>`;
            html += `</td>`;
            html += '</tr>';
        });

        html += '</tbody></table>';

        // Add filtering functionality
        html += `
        <script>
            (function() {
                const searchInput = document.getElementById('issueSearch');
                const statusFilter = document.getElementById('statusFilter');
                const severityFilter = document.getElementById('severityFilter');
                const table = document.getElementById('issuesTable');
                const rows = table.querySelectorAll('tbody tr');

                function filterTable() {
                    const searchTerm = searchInput ? searchInput.value.toLowerCase() : '';
                    const statusValue = statusFilter ? statusFilter.value : 'all';
                    const severityValue = severityFilter ? severityFilter.value : 'all';

                    rows.forEach(row => {
                        const text = row.textContent.toLowerCase();
                        const status = row.getAttribute('data-status');
                        const severity = row.getAttribute('data-severity');

                        const matchesSearch = text.includes(searchTerm);
                        const matchesStatus = statusValue === 'all' || status === statusValue;
                        const matchesSeverity = severityValue === 'all' || severity === severityValue;

                        row.style.display = matchesSearch && matchesStatus && matchesSeverity ? '' : 'none';
                    });
                }

                if (searchInput) searchInput.addEventListener('input', filterTable);
                if (statusFilter) statusFilter.addEventListener('change', filterTable);
                if (severityFilter) severityFilter.addEventListener('change', filterTable);
            })();
        </script>
        `;

        return html;
    }

    /**
     * Get status CSS class
     */
    static getStatusClass(status) {
        const map = {
            'Open': 'critical',
            'Investigating': 'warning',
            'Workaround': 'info',
            'Monitoring': 'info',
            'Closed': 'ok'
        };
        return map[status] || 'warning';
    }

    /**
     * Get severity CSS class
     */
    static getSeverityClass(severity) {
        const map = {
            'Critical': 'critical',
            'High': 'high',
            'Medium': 'medium',
            'Low': 'low'
        };
        return map[severity] || 'medium';
    }

    /**
     * Format date
     */
    static formatDate(dateStr) {
        if (!dateStr) return 'N/A';

        const date = new Date(dateStr);
        if (isNaN(date.getTime())) return dateStr;

        return date.toLocaleDateString('no-NO');
    }

    /**
     * Add new issue with comprehensive form
     */
    static addNew() {
        const modal = this.createIssueModal();
        document.body.appendChild(modal);
    }

    /**
     * View issue details
     */
    static viewIssue(index) {
        if (!window.app || !window.app.data.flowIssues[index]) return;

        const issue = window.app.data.flowIssues[index];
        const modal = this.createIssueDetailModal(issue, index);
        document.body.appendChild(modal);
    }

    /**
     * Edit issue
     */
    static editIssue(index) {
        if (!window.app || !window.app.data.flowIssues[index]) return;

        const issue = window.app.data.flowIssues[index];
        const modal = this.createIssueModal(issue, index);
        document.body.appendChild(modal);
    }

    /**
     * Create issue form modal
     */
    static createIssueModal(existingIssue = null, index = null) {
        const isEdit = existingIssue !== null;

        const modal = document.createElement('div');
        modal.className = 'modal';
        modal.innerHTML = `
            <div class="modal-content">
                <div class="modal-header">
                    <h3>${isEdit ? 'Rediger problem' : 'Nytt problem'}</h3>
                    <button class="modal-close" onclick="this.closest('.modal').remove()">×</button>
                </div>
                <div class="modal-body">
                    <form id="issueForm">
                        <div class="form-row">
                            <div class="form-group">
                                <label>Dato *</label>
                                <input type="date" name="date" value="${existingIssue?.date || new Date().toISOString().split('T')[0]}" required>
                            </div>
                            <div class="form-group">
                                <label>Kategori *</label>
                                <select name="category" required>
                                    ${Object.keys(this.CATEGORIES).map(key =>
            `<option value="${key}" ${existingIssue?.category === key ? 'selected' : ''}>${this.CATEGORIES[key]}</option>`
        ).join('')}
                                </select>
                            </div>
                        </div>
                        <div class="form-row">
                            <div class="form-group">
                                <label>System *</label>
                                <select name="system" required>
                                    ${Object.keys(this.SYSTEMS).map(key =>
            `<option value="${key}" ${existingIssue?.system === key ? 'selected' : ''}>${this.SYSTEMS[key]}</option>`
        ).join('')}
                                </select>
                            </div>
                            <div class="form-group">
                                <label>Alvorlighet *</label>
                                <select name="severity" required>
                                    ${Object.keys(this.SEVERITIES).map(key =>
            `<option value="${key}" ${existingIssue?.severity === key ? 'selected' : ''}>${this.SEVERITIES[key]}</option>`
        ).join('')}
                                </select>
                            </div>
                        </div>
                        <div class="form-group">
                            <label>Beskrivelse av problem *</label>
                            <textarea name="description" rows="3" required>${existingIssue?.description || ''}</textarea>
                        </div>
                        <div class="form-group">
                            <label>Påvirket kunde/ordre</label>
                            <input type="text" name="affected" value="${existingIssue?.affected || ''}">
                        </div>
                        <div class="form-group">
                            <label>Grunnårsak</label>
                            <select name="rootCause">
                                <option value="">Velg...</option>
                                ${this.ROOT_CAUSES.map(cause =>
            `<option value="${cause}" ${existingIssue?.rootCause === cause ? 'selected' : ''}>${cause}</option>`
        ).join('')}
                            </select>
                        </div>
                        <div class="form-group">
                            <label>Midlertidig løsning</label>
                            <textarea name="tempFix" rows="2">${existingIssue?.tempFix || ''}</textarea>
                        </div>
                        <div class="form-group">
                            <label>Permanent løsning</label>
                            <textarea name="permFix" rows="2">${existingIssue?.permFix || ''}</textarea>
                        </div>
                        <div class="form-row">
                            <div class="form-group">
                                <label>Status *</label>
                                <select name="status" required>
                                    ${Object.keys(this.STATUSES).map(key =>
            `<option value="${key}" ${existingIssue?.status === key ? 'selected' : ''}>${this.STATUSES[key]}</option>`
        ).join('')}
                                </select>
                            </div>
                            <div class="form-group">
                                <label>Ansvarlig</label>
                                <input type="text" name="responsible" value="${existingIssue?.responsible || ''}">
                            </div>
                        </div>
                        <div class="form-group">
                            <label>Kommentarer</label>
                            <textarea name="notes" rows="2">${existingIssue?.notes || ''}</textarea>
                        </div>
                    </form>
                </div>
                <div class="modal-footer">
                    <button class="btn-secondary" onclick="this.closest('.modal').remove()">Avbryt</button>
                    <button class="btn-primary" onclick="FlowIssues.saveIssue(${index})">Lagre</button>
                </div>
            </div>
        `;

        return modal;
    }

    /**
     * Create issue detail view modal
     */
    static createIssueDetailModal(issue, index) {
        const modal = document.createElement('div');
        modal.className = 'modal';

        const statusClass = this.getStatusClass(issue.status);
        const severityClass = this.getSeverityClass(issue.severity);

        modal.innerHTML = `
            <div class="modal-content">
                <div class="modal-header">
                    <h3>Problem detaljer</h3>
                    <button class="modal-close" onclick="this.closest('.modal').remove()">×</button>
                </div>
                <div class="modal-body">
                    <div class="detail-grid">
                        <div class="detail-item">
                            <strong>Dato:</strong> ${this.formatDate(issue.date)}
                        </div>
                        <div class="detail-item">
                            <strong>Kategori:</strong> ${this.CATEGORIES[issue.category] || issue.category}
                        </div>
                        <div class="detail-item">
                            <strong>System:</strong> ${this.SYSTEMS[issue.system] || issue.system}
                        </div>
                        <div class="detail-item">
                            <strong>Alvorlighet:</strong> <span class="severity-badge ${severityClass}">${this.SEVERITIES[issue.severity] || 'Medium'}</span>
                        </div>
                        <div class="detail-item">
                            <strong>Status:</strong> <span class="status-tag ${statusClass}">${this.STATUSES[issue.status] || 'Åpen'}</span>
                        </div>
                        ${issue.responsible ? `<div class="detail-item"><strong>Ansvarlig:</strong> ${issue.responsible}</div>` : ''}
                    </div>
                    <div class="detail-section">
                        <strong>Beskrivelse:</strong>
                        <p>${issue.description || 'Ingen beskrivelse'}</p>
                    </div>
                    ${issue.affected ? `
                        <div class="detail-section">
                            <strong>Påvirket:</strong>
                            <p>${issue.affected}</p>
                        </div>
                    ` : ''}
                    ${issue.rootCause ? `
                        <div class="detail-section">
                            <strong>Grunnårsak:</strong>
                            <p>${issue.rootCause}</p>
                        </div>
                    ` : ''}
                    ${issue.tempFix ? `
                        <div class="detail-section">
                            <strong>Midlertidig løsning:</strong>
                            <p>${issue.tempFix}</p>
                        </div>
                    ` : ''}
                    ${issue.permFix ? `
                        <div class="detail-section">
                            <strong>Permanent løsning:</strong>
                            <p>${issue.permFix}</p>
                        </div>
                    ` : ''}
                    ${issue.notes ? `
                        <div class="detail-section">
                            <strong>Kommentarer:</strong>
                            <p>${issue.notes}</p>
                        </div>
                    ` : ''}
                </div>
                <div class="modal-footer">
                    <button class="btn-secondary" onclick="this.closest('.modal').remove()">Lukk</button>
                    <button class="btn-primary" onclick="FlowIssues.editIssue(${index}); this.closest('.modal').remove();">Rediger</button>
                </div>
            </div>
        `;

        return modal;
    }

    /**
     * Save issue from form
     */
    static saveIssue(index) {
        const form = document.getElementById('issueForm');
        const formData = new FormData(form);

        const issue = {
            date: formData.get('date'),
            category: formData.get('category'),
            system: formData.get('system'),
            severity: formData.get('severity'),
            description: formData.get('description'),
            affected: formData.get('affected'),
            rootCause: formData.get('rootCause'),
            tempFix: formData.get('tempFix'),
            permFix: formData.get('permFix'),
            status: formData.get('status'),
            responsible: formData.get('responsible'),
            notes: formData.get('notes')
        };

        // Add closed date if status is Closed
        if (issue.status === 'Closed' && (!window.app.data.flowIssues[index] || window.app.data.flowIssues[index].status !== 'Closed')) {
            issue.closedDate = new Date().toISOString().split('T')[0];
        }

        if (window.app) {
            if (index !== null) {
                // Edit existing
                window.app.data.flowIssues[index] = issue;
            } else {
                // Add new
                window.app.data.flowIssues.push(issue);
            }

            window.app.saveData();
            this.update(window.app.data.flowIssues);
        }

        // Close modal
        document.querySelector('.modal').remove();
    }

    /**
     * Export all issues
     */
    static exportIssues() {
        if (!window.app || !window.app.data.flowIssues.length) {
            alert('Ingen problemer å eksportere');
            return;
        }

        const headers = [
            'Dato', 'Kategori', 'System', 'Alvorlighet', 'Beskrivelse',
            'Påvirket', 'Grunnårsak', 'Midlertidig løsning', 'Permanent løsning',
            'Status', 'Ansvarlig', 'Kommentarer'
        ];

        let csv = headers.join(',') + '\n';

        window.app.data.flowIssues.forEach(issue => {
            csv += [
                issue.date || '',
                this.CATEGORIES[issue.category] || issue.category || '',
                this.SYSTEMS[issue.system] || issue.system || '',
                this.SEVERITIES[issue.severity] || issue.severity || '',
                `"${(issue.description || '').replace(/"/g, '""')}"`,
                `"${(issue.affected || '').replace(/"/g, '""')}"`,
                issue.rootCause || '',
                `"${(issue.tempFix || '').replace(/"/g, '""')}"`,
                `"${(issue.permFix || '').replace(/"/g, '""')}"`,
                this.STATUSES[issue.status] || issue.status || '',
                issue.responsible || '',
                `"${(issue.notes || '').replace(/"/g, '""')}"`
            ].join(',') + '\n';
        });

        const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `sap-jeeves-problemer-${new Date().toISOString().split('T')[0]}.csv`;
        a.click();
        URL.revokeObjectURL(url);
    }

    /**
     * Export analytics
     */
    static exportAnalytics() {
        if (!window.app || !window.app.data.flowIssues.length) {
            alert('Ingen data å eksportere');
            return;
        }

        const analysis = this.analyzeIssues(window.app.data.flowIssues);

        let csv = 'SAP ↔ Jeeves Problem Analyse\n\n';

        csv += 'SAMMENDRAG\n';
        csv += `Totalt problemer,${analysis.total}\n`;
        csv += `Gjennomsnittlig løsningstid,${analysis.avgResolutionTime} dager\n\n`;

        csv += 'PER STATUS\n';
        Object.entries(analysis.byStatus).forEach(([status, count]) => {
            csv += `${this.STATUSES[status] || status},${count}\n`;
        });

        csv += '\nPER KATEGORI\n';
        Object.entries(analysis.byCategory).forEach(([cat, count]) => {
            csv += `${this.CATEGORIES[cat] || cat},${count}\n`;
        });

        csv += '\nPER SYSTEM\n';
        Object.entries(analysis.bySystem).forEach(([sys, count]) => {
            csv += `${this.SYSTEMS[sys] || sys},${count}\n`;
        });

        csv += '\nTILBAKEVENDENDE PROBLEMER\n';
        analysis.recurringIssues.forEach(issue => {
            csv += `${issue.rootCause},${issue.count} ganger\n`;
        });

        const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `problem-analyse-${new Date().toISOString().split('T')[0]}.csv`;
        a.click();
        URL.revokeObjectURL(url);
    }
}

window.FlowIssues = FlowIssues;
