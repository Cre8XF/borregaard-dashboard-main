// ===================================
// MAIN APPLICATION CONTROLLER
// Plass Responsible Dashboard
// Enhanced with import wizard and advanced features
// MERGED VERSION - Keep all existing + add wizard
// ===================================

/**
 * DashboardApp - Main application controller
 * Manages data flow, file uploads, and module coordination
 */
class DashboardApp {
    constructor() {
        this.data = {
            shutdown: [],
            inventory: [],
            flowIssues: [],
            assortment: [],
            butlerData: [],
            orderHistory: [],
            saMappingData: []  // SA-nummer mapping from Jeeves
        };

        this.settings = {
            autoSave: true,
            theme: 'light'
        };

        this.init();
    }

    /**
     * Initialize the dashboard
     */
    init() {
        console.log('Dashboard initializing...');
        this.setupEventListeners();
        this.loadStoredData();
        this.updateAllModules();
        this.showWelcomeMessage();
    }

    /**
     * Set up all event listeners
     */
    setupEventListeners() {
        // File upload
        const uploadBtn = document.getElementById('uploadBtn');
        const fileInput = document.getElementById('fileInput');

        if (uploadBtn) {
            uploadBtn.addEventListener('click', () => this.handleFileUpload());
        }

        // Drag and drop support
        if (fileInput) {
            const uploadSection = document.querySelector('.upload-section');

            uploadSection.addEventListener('dragover', (e) => {
                e.preventDefault();
                uploadSection.classList.add('drag-over');
            });

            uploadSection.addEventListener('dragleave', () => {
                uploadSection.classList.remove('drag-over');
            });

            uploadSection.addEventListener('drop', (e) => {
                e.preventDefault();
                uploadSection.classList.remove('drag-over');

                const files = e.dataTransfer.files;
                fileInput.files = files;
                this.handleFileUpload();
            });
        }

        // Module-specific buttons
        const addIssueBtn = document.getElementById('addIssueBtn');
        if (addIssueBtn) {
            addIssueBtn.addEventListener('click', () => this.addFlowIssue());
        }

        const addItemBtn = document.getElementById('addItemBtn');
        if (addItemBtn) {
            addItemBtn.addEventListener('click', () => this.addAssortmentItem());
        }

        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            // Ctrl+S to save
            if (e.ctrlKey && e.key === 's') {
                e.preventDefault();
                this.saveData();
                this.showToast('Data lagret', 'success');
            }
        });
    }

    /**
     * Handle file upload with import wizard
     * ENHANCED: Now shows wizard for user to select module
     */
    async handleFileUpload() {
        const fileInput = document.getElementById('fileInput');
        const files = fileInput.files;

        if (files.length === 0) {
            this.showStatus('Vennligst velg minst én fil', 'error');
            return;
        }

        // Show import wizard for module selection
        this.showImportWizard(files);
    }

    /**
     * NEW: Import Wizard - Let user choose where data goes
     */
    showImportWizard(files) {
        const modal = document.createElement('div');
        modal.className = 'modal-overlay';
        modal.innerHTML = `
            <div class="modal-content import-wizard">
                <h2>📥 Last inn data</h2>
                <p style="color: #7f8c8d; margin-bottom: 20px;">Velg hvor hver fil skal importeres:</p>
                <div id="fileList"></div>
                <div class="modal-actions">
                    <button class="btn-secondary" onclick="this.closest('.modal-overlay').remove()">
                        Avbryt
                    </button>
                    <button class="btn-primary" id="confirmImport">
                        Last inn alle
                    </button>
                </div>
            </div>
        `;
        
        document.body.appendChild(modal);
        
        // Render file list with dropdowns
        const fileList = document.getElementById('fileList');
        const fileConfigs = [];
        
        Array.from(files).forEach((file, index) => {
            const suggested = this.suggestModule(file.name);
            
            const fileRow = document.createElement('div');
            fileRow.className = 'file-row';
            fileRow.innerHTML = `
                <div class="file-info">
                    <strong>${file.name}</strong>
                    <small>${(file.size / 1024).toFixed(1)} KB</small>
                </div>
                <select class="module-selector" data-index="${index}">
                    <option value="shutdown" ${suggested === 'shutdown' ? 'selected' : ''}>
                        📊 Vedlikeholdsstopp (Uke 16/42)
                    </option>
                    <option value="inventory" ${suggested === 'inventory' ? 'selected' : ''}>
                        📦 Lagerrisiko (7 lagre)
                    </option>
                    <option value="assortment" ${suggested === 'assortment' ? 'selected' : ''}>
                        📋 Kundesortiment
                    </option>
                    <option value="flowIssues" ${suggested === 'flowIssues' ? 'selected' : ''}>
                        ⚠️ SAP/Jeeves problemer
                    </option>
                    <option value="butlerData" ${suggested === 'butlerData' ? 'selected' : ''}>
                        🏭 Butler Analyse (2800 artikler)
                    </option>
                    <option value="saMappingData" ${suggested === 'saMappingData' ? 'selected' : ''}>
                        🔗 SA-nummer mapping (Jeeves)
                    </option>
                    <option value="orderHistory" ${suggested === 'orderHistory' ? 'selected' : ''}>
                        📦 Ordre Historikk (Tools)
                    </option>
                </select>
            `;
            
            fileList.appendChild(fileRow);
            fileConfigs.push({ file, module: suggested });
        });
        
        // Update configs when user changes selection
        document.querySelectorAll('.module-selector').forEach(select => {
            select.addEventListener('change', (e) => {
                const index = parseInt(e.target.dataset.index);
                fileConfigs[index].module = e.target.value;
            });
        });
        
        // Confirm import
        document.getElementById('confirmImport').addEventListener('click', async () => {
            modal.remove();
            await this.processFilesWithConfig(fileConfigs);
        });
    }

    /**
     * NEW: Suggest module based on filename
     */
    suggestModule(fileName) {
        const fn = fileName.toLowerCase();

        // Check for SA-mapping file (Jeeves artikkelknytte) - FIRST PRIORITY
        if (fn.includes('artikkel') && (fn.includes('knytte') || fn.includes('knyt')) ||
            fn.includes('sa-nummer') ||
            fn.includes('kunds') ||
            fn.includes('kundens artikkel')) {
            return 'saMappingData';
        }

        // Check for Butler files
        if (fn.includes('butler')) {
            return 'butlerData';
        }

        // Check for order history from Tools
        if (fn.includes('tools') || fn.includes('historikk') || fn.includes('history')) {
            return 'orderHistory';
        }

        // Shutdown/maintenance (vedlikehold)
        if (fn.includes('vedlikehold') || fn.includes('stopp') || fn.includes('shutdown')) {
            return 'shutdown';
        }

        if (fn.includes('inventory') || fn.includes('lager') || fn.includes('stock') || fn.includes('beholdning')) {
            return 'inventory';
        }
        if (fn.includes('assortiment') || fn.includes('sortiment') || fn.includes('katalog')) {
            return 'assortment';
        }
        if (fn.includes('issue') || fn.includes('problem') || fn.includes('sap') || fn.includes('jeeves')) {
            return 'flowIssues';
        }

        // Default to shutdown
        return 'shutdown';
    }

    /**
     * NEW: Process files with user-selected modules
     */
    async processFilesWithConfig(fileConfigs) {
        const statusDiv = document.getElementById('uploadStatus');
        this.showLoadingState(true);
        statusDiv.innerHTML = `<div class="loading-spinner"></div> Behandler ${fileConfigs.length} fil(er)...`;

        const results = {
            success: 0,
            failed: 0,
            errors: []
        };

        try {
            for (let i = 0; i < fileConfigs.length; i++) {
                const config = fileConfigs[i];
                this.updateProgress(i + 1, fileConfigs.length);

                try {
                    await this.processFileWithModule(config.file, config.module);
                    results.success++;
                } catch (error) {
                    results.failed++;
                    results.errors.push({ file: config.file.name, error: error.message });
                    console.error(`Error processing ${config.file.name}:`, error);
                }
            }

            // Show results
            if (results.success > 0) {
                this.showStatus(
                    `✓ ${results.success} fil(er) lastet inn${results.failed > 0 ? `, ${results.failed} feilet` : ''}`,
                    results.failed > 0 ? 'warning' : 'success'
                );

                this.updateAllModules();
                this.saveData();
            } else {
                this.showStatus('Alle filer feilet', 'error');
            }

            // Show error details if any
            if (results.errors.length > 0) {
                const errorDetails = results.errors.map(e =>
                    `${e.file}: ${e.error}`
                ).join('<br>');

                setTimeout(() => {
                    this.showStatus(`Feil:<br>${errorDetails}`, 'error');
                }, 2000);
            }

        } catch (error) {
            this.showStatus('Feil ved innlasting: ' + error.message, 'error');
            console.error('Upload error:', error);
        } finally {
            this.showLoadingState(false);
            const fileInput = document.getElementById('fileInput');
            if (fileInput) fileInput.value = ''; // Reset file input
        }
    }

    /**
     * Process a single file with specified module
     */
    async processFileWithModule(file, targetModule) {
        const fileName = file.name.toLowerCase();
        let loadedData;

        // Load file based on type
        if (fileName.endsWith('.csv')) {
            loadedData = await DataLoader.loadCSV(file);
        } else if (fileName.endsWith('.xlsx') || fileName.endsWith('.xls')) {
            loadedData = await DataLoader.loadExcel(file);
        } else {
            throw new Error('Ugyldig filformat. Kun CSV og XLSX støttes.');
        }

        // Auto-detect column mapping
        const mapping = DataLoader.detectColumnMapping(loadedData.columns);

        // Apply mapping
        const mappedData = DataLoader.applyColumnMapping(loadedData.data, mapping);

        // Validate data
        const validation = DataLoader.validateData(mappedData);

        if (!validation.valid && validation.errors.length > 5) {
            throw new Error(`Valideringsfeil: ${validation.errors[0]} (og ${validation.errors.length - 1} flere)`);
        }

        // Store data in user-selected module
        this.data[targetModule] = mappedData;

        // Generate quality report
        const quality = DataLoader.generateQualityReport(mappedData);
        console.log(`Data quality for ${file.name} -> ${targetModule}:`, quality);

        return {
            module: targetModule,
            rowCount: loadedData.rowCount,
            quality
        };
    }

    /**
     * Update progress indicator
     */
    updateProgress(current, total) {
        const statusDiv = document.getElementById('uploadStatus');
        const percentage = Math.round((current / total) * 100);

        statusDiv.innerHTML = `
            <div class="progress-bar">
                <div class="progress-fill" style="width: ${percentage}%"></div>
            </div>
            <div class="progress-text">Behandler fil ${current} av ${total}...</div>
        `;
    }

    /**
     * Update all modules with current data
     */
    updateAllModules() {
        // Update shutdown module
        if (window.ShutdownAnalyzer) {
            window.ShutdownAnalyzer.update(this.data.shutdown);
        }

        // Update inventory module
        if (window.InventoryRisk) {
            window.InventoryRisk.update(this.data.inventory);
        }

        // Update flow issues
        if (window.FlowIssues) {
            window.FlowIssues.update(this.data.flowIssues);
        }

        // Update assortment
        if (window.Assortment) {
            window.Assortment.update(this.data.assortment);
        }

        // Update Butler analyzer WITH SA-mapping
        if (window.ButlerAnalyzer) {
            // Enrich Butler data with SA numbers before updating
            if (this.data.saMappingData && this.data.saMappingData.length > 0) {
                console.log(`🔗 Enriching Butler data with ${this.data.saMappingData.length} SA-mappings...`);
                const enrichedData = window.ButlerAnalyzer.enrichWithSANumbers(
                    this.data.butlerData,
                    this.data.saMappingData
                );
                window.ButlerAnalyzer.update(enrichedData);
            } else {
                console.log('ℹ️ No SA-mapping data loaded, showing Butler data without SA-numbers');
                window.ButlerAnalyzer.update(this.data.butlerData);
            }
        }

        // Update Order analyzer
        if (window.OrderAnalyzer) {
            window.OrderAnalyzer.update(this.data.orderHistory);
        }
    }

    /**
     * Add new flow issue
     */
    addFlowIssue() {
        if (window.FlowIssues) {
            window.FlowIssues.addNew();
        }
    }

    /**
     * Add new assortment item
     */
    addAssortmentItem() {
        if (window.Assortment) {
            window.Assortment.addNew();
        }
    }

    /**
     * Show status message
     */
    showStatus(message, type = 'info') {
        const statusDiv = document.getElementById('uploadStatus');
        statusDiv.innerHTML = message;
        statusDiv.className = 'status-message ' + type;

        // Auto-hide success messages
        if (type === 'success') {
            setTimeout(() => {
                statusDiv.className = 'status-message';
                statusDiv.innerHTML = '';
            }, 5000);
        }
    }

    /**
     * Show toast notification
     */
    showToast(message, type = 'info') {
        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        toast.textContent = message;

        document.body.appendChild(toast);

        setTimeout(() => toast.classList.add('show'), 10);
        setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    }

    /**
     * Show/hide loading state
     */
    showLoadingState(show) {
        const uploadBtn = document.getElementById('uploadBtn');
        const fileInput = document.getElementById('fileInput');

        if (show) {
            if (uploadBtn) {
                uploadBtn.disabled = true;
                uploadBtn.textContent = 'Behandler...';
            }
            if (fileInput) fileInput.disabled = true;
        } else {
            if (uploadBtn) {
                uploadBtn.disabled = false;
                uploadBtn.textContent = 'Last inn filer';
            }
            if (fileInput) fileInput.disabled = false;
        }
    }

    /**
     * Save data to localStorage
     */
    saveData() {
        try {
            const dataToSave = {
                data: this.data,
                settings: this.settings,
                timestamp: new Date().toISOString()
            };

            localStorage.setItem('dashboardData', JSON.stringify(dataToSave));
            console.log('Data saved to localStorage');
            return true;
        } catch (error) {
            console.error('Could not save to localStorage:', error);

            // Check if quota exceeded
            if (error.name === 'QuotaExceededError') {
                this.showToast('Lagringskvote overskredet. Vennligst eksporter data.', 'error');
            }

            return false;
        }
    }

    /**
     * Load data from localStorage
     */
    loadStoredData() {
        try {
            const stored = localStorage.getItem('dashboardData');

            if (stored) {
                const parsed = JSON.parse(stored);

                this.data = parsed.data || this.data;
                this.settings = parsed.settings || this.settings;

                console.log('Loaded stored data from:', parsed.timestamp);

                // Show notification if data was loaded
                if (this.data.shutdown.length > 0 ||
                    this.data.inventory.length > 0 ||
                    this.data.flowIssues.length > 0 ||
                    this.data.assortment.length > 0 ||
                    this.data.butlerData.length > 0 ||
                    this.data.orderHistory.length > 0 ||
                    this.data.saMappingData.length > 0) {
                    this.showToast('Data lastet fra forrige økt', 'success');
                }
            }
        } catch (error) {
            console.error('Could not load from localStorage:', error);
            this.showToast('Kunne ikke laste tidligere data', 'warning');
        }
    }

    /**
     * Clear all data
     */
    clearAllData() {
        if (confirm('Er du sikker på at du vil slette all data? Dette kan ikke angres.')) {
            this.data = {
                shutdown: [],
                inventory: [],
                flowIssues: [],
                assortment: [],
                butlerData: [],
                orderHistory: [],
                saMappingData: []
            };

            localStorage.removeItem('dashboardData');
            this.updateAllModules();
            this.showToast('All data slettet', 'success');
        }
    }

    /**
     * Export all data as JSON
     */
    exportAllData() {
        const exportData = {
            version: '1.0',
            exported: new Date().toISOString(),
            data: this.data
        };

        const json = JSON.stringify(exportData, null, 2);
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');

        a.href = url;
        a.download = `borregaard-dashboard-${new Date().toISOString().split('T')[0]}.json`;
        a.click();

        URL.revokeObjectURL(url);
        this.showToast('Data eksportert', 'success');
    }

    /**
     * Import data from JSON
     */
    async importData(file) {
        try {
            const text = await file.text();
            const imported = JSON.parse(text);

            if (imported.data) {
                if (confirm('Vil du erstatte eksisterende data eller legge til?')) {
                    // Replace
                    this.data = imported.data;
                } else {
                    // Merge
                    Object.keys(imported.data).forEach(key => {
                        if (this.data[key]) {
                            this.data[key] = [...this.data[key], ...imported.data[key]];
                        }
                    });
                }

                this.saveData();
                this.updateAllModules();
                this.showToast('Data importert', 'success');
            }
        } catch (error) {
            this.showToast('Feil ved import: ' + error.message, 'error');
        }
    }

    /**
     * Show welcome message for first-time users
     */
    showWelcomeMessage() {
        const hasData = Object.values(this.data).some(arr => arr.length > 0);

        if (!hasData && !localStorage.getItem('welcomeShown')) {
            setTimeout(() => {
                this.showToast('Velkommen! Last opp CSV eller Excel filer for å komme i gang.', 'info');
                localStorage.setItem('welcomeShown', 'true');
            }, 1000);
        }
    }

    /**
     * Get summary statistics
     */
    getSummary() {
        return {
            shutdown: {
                count: this.data.shutdown.length,
                critical: window.ShutdownAnalyzer ?
                    window.ShutdownAnalyzer.getCriticalCount(this.data.shutdown) : 0
            },
            inventory: {
                count: this.data.inventory.length,
                critical: window.InventoryRisk ?
                    window.InventoryRisk.getCriticalCount(this.data.inventory) : 0
            },
            flowIssues: {
                count: this.data.flowIssues.length,
                open: this.data.flowIssues.filter(i => i.status !== 'Closed' && i.status !== 'Lukket').length
            },
            assortment: {
                count: this.data.assortment.length,
                active: this.data.assortment.filter(i => i.status === 'Active' || i.status === 'Aktiv').length
            }
        };
    }
}

// Initialize app when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    window.app = new DashboardApp();
});

// ===================================
// VISUAL ENHANCEMENTS & INTERACTIONS
// Adding life to the dashboard
// ===================================

/**
 * Initialize visual enhancements when DOM is ready
 */
document.addEventListener('DOMContentLoaded', () => {
    initDragDropVisuals();
    initModuleFadeIn();
    initToastSystem();
    initLoadingStates();
});

/**
 * Enhanced drag and drop visual feedback
 */
function initDragDropVisuals() {
    const uploadSection = document.querySelector('.upload-section');
    if (!uploadSection) return;

    let dragCounter = 0;

    uploadSection.addEventListener('dragenter', (e) => {
        e.preventDefault();
        dragCounter++;
        uploadSection.classList.add('drag-over');
    });

    uploadSection.addEventListener('dragleave', (e) => {
        e.preventDefault();
        dragCounter--;
        if (dragCounter === 0) {
            uploadSection.classList.remove('drag-over');
        }
    });

    uploadSection.addEventListener('dragover', (e) => {
        e.preventDefault();
    });

    uploadSection.addEventListener('drop', (e) => {
        e.preventDefault();
        dragCounter = 0;
        uploadSection.classList.remove('drag-over');

        // Trigger file upload with dropped files
        const fileInput = document.getElementById('fileInput');
        if (fileInput && e.dataTransfer.files.length > 0) {
            fileInput.files = e.dataTransfer.files;
            
            // Show success feedback
            showToast(`${e.dataTransfer.files.length} fil(er) valgt`, 'success');
        }
    });
}

/**
 * Fade in modules on page load with stagger effect
 */
function initModuleFadeIn() {
    const modules = document.querySelectorAll('.module');
    
    modules.forEach((module, index) => {
        module.style.opacity = '0';
        
        setTimeout(() => {
            module.classList.add('fade-in');
            module.style.opacity = '1';
        }, index * 150);
    });

    // Fade in summary cards if they exist
    const summaryCards = document.querySelectorAll('.summary-card');
    summaryCards.forEach((card, index) => {
        card.style.opacity = '0';
        setTimeout(() => {
            card.classList.add('fade-in');
            card.style.opacity = '1';
        }, index * 100);
    });
}

/**
 * Enhanced toast notification system
 */
function initToastSystem() {
    window.showToast = function(message, type = 'success') {
        // Remove existing toasts
        const existingToasts = document.querySelectorAll('.toast');
        existingToasts.forEach(toast => toast.remove());

        // Create new toast
        const toast = document.createElement('div');
        toast.className = `toast ${type} show`;
        
        // Add icon based on type
        const icons = {
            success: '✓',
            error: '✗',
            warning: '⚠',
            info: 'ℹ'
        };
        
        const icon = icons[type] || 'ℹ';
        toast.innerHTML = `<strong>${icon}</strong> ${message}`;
        
        document.body.appendChild(toast);

        // Auto remove after 3 seconds
        setTimeout(() => {
            toast.style.animation = 'slideOut 0.3s ease forwards';
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    };
}

/**
 * Loading states management
 */
function initLoadingStates() {
    window.showLoading = function(elementId, message = 'Laster data...') {
        const el = document.getElementById(elementId);
        if (!el) return;

        el.innerHTML = `
            <div class="spinner"></div>
            <p style="text-align: center; color: var(--text-muted); margin-top: 10px;">
                <span class="loading-dots">${message}</span>
            </p>
        `;
    };

    window.hideLoading = function(elementId) {
        const el = document.getElementById(elementId);
        if (!el) return;

        const spinner = el.querySelector('.spinner');
        if (spinner) {
            spinner.style.animation = 'fadeOut 0.3s ease';
            setTimeout(() => {
                spinner.remove();
                const loadingText = el.querySelector('p');
                if (loadingText) loadingText.remove();
            }, 300);
        }
    };

    window.showProgress = function(elementId, current, total) {
        const el = document.getElementById(elementId);
        if (!el) return;

        const percentage = Math.round((current / total) * 100);
        
        el.innerHTML = `
            <div class="progress-bar">
                <div class="progress-fill" style="width: ${percentage}%"></div>
            </div>
            <p style="text-align: center; color: var(--text-muted); margin-top: 10px; font-size: 13px;">
                Behandler fil ${current} av ${total} (${percentage}%)
            </p>
        `;
    };
}

// Continue with rest of visual enhancements...
// (Rest of the code remains the same as original)

console.log('✨ Dashboard with Import Wizard loaded');