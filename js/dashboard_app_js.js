// ===================================
// MAIN APPLICATION CONTROLLER
// Plass Responsible Dashboard
// ===================================

class DashboardApp {
    constructor() {
        this.data = {
            shutdown: [],
            inventory: [],
            flowIssues: [],
            assortment: []
        };
        
        this.init();
    }

    init() {
        console.log('Dashboard initializing...');
        this.setupEventListeners();
        this.loadStoredData();
        this.updateAllModules();
    }

    setupEventListeners() {
        // File upload
        const uploadBtn = document.getElementById('uploadBtn');
        const fileInput = document.getElementById('fileInput');
        
        if (uploadBtn) {
            uploadBtn.addEventListener('click', () => this.handleFileUpload());
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
    }

    async handleFileUpload() {
        const fileInput = document.getElementById('fileInput');
        const files = fileInput.files;
        const statusDiv = document.getElementById('uploadStatus');

        if (files.length === 0) {
            this.showStatus('Vennligst velg minst én fil', 'error');
            return;
        }

        statusDiv.innerHTML = 'Laster inn filer...';
        
        try {
            for (let file of files) {
                await this.processFile(file);
            }
            
            this.showStatus(`${files.length} fil(er) lastet inn`, 'success');
            this.updateAllModules();
            this.saveData();
            
        } catch (error) {
            this.showStatus('Feil ved innlasting: ' + error.message, 'error');
            console.error('Upload error:', error);
        }
    }

    async processFile(file) {
        const fileName = file.name.toLowerCase();
        
        if (fileName.endsWith('.csv')) {
            return this.processCSV(file);
        } else if (fileName.endsWith('.xlsx') || fileName.endsWith('.xls')) {
            return this.processExcel(file);
        } else {
            throw new Error('Ugyldig filformat. Kun CSV og XLSX støttes.');
        }
    }

    async processCSV(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            
            reader.onload = (e) => {
                try {
                    const text = e.target.result;
                    const rows = text.split('\n').map(row => row.split(','));
                    const headers = rows[0].map(h => h.trim());
                    const data = rows.slice(1).map(row => {
                        const obj = {};
                        headers.forEach((header, i) => {
                            obj[header] = row[i]?.trim() || '';
                        });
                        return obj;
                    });
                    
                    this.categorizeData(data, file.name);
                    resolve();
                } catch (error) {
                    reject(error);
                }
            };
            
            reader.onerror = () => reject(new Error('Kunne ikke lese CSV-fil'));
            reader.readAsText(file);
        });
    }

    async processExcel(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            
            reader.onload = (e) => {
                try {
                    const data = new Uint8Array(e.target.result);
                    const workbook = XLSX.read(data, { type: 'array' });
                    const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
                    const jsonData = XLSX.utils.sheet_to_json(firstSheet);
                    
                    this.categorizeData(jsonData, file.name);
                    resolve();
                } catch (error) {
                    reject(error);
                }
            };
            
            reader.onerror = () => reject(new Error('Kunne ikke lese Excel-fil'));
            reader.readAsArrayBuffer(file);
        });
    }

    categorizeData(data, fileName) {
        // Smart categorization based on filename and columns
        const fn = fileName.toLowerCase();
        
        if (fn.includes('order') || fn.includes('ordre')) {
            this.data.shutdown = [...this.data.shutdown, ...data];
        } else if (fn.includes('inventory') || fn.includes('lager')) {
            this.data.inventory = [...this.data.inventory, ...data];
        } else if (fn.includes('assortment') || fn.includes('sortiment')) {
            this.data.assortment = [...this.data.assortment, ...data];
        } else {
            // Default: try to detect by columns
            if (data[0]) {
                const cols = Object.keys(data[0]).join('|').toLowerCase();
                
                if (cols.includes('stock') || cols.includes('warehouse')) {
                    this.data.inventory = [...this.data.inventory, ...data];
                } else {
                    this.data.shutdown = [...this.data.shutdown, ...data];
                }
            }
        }
    }

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
    }

    addFlowIssue() {
        if (window.FlowIssues) {
            window.FlowIssues.addNew();
        }
    }

    addAssortmentItem() {
        if (window.Assortment) {
            window.Assortment.addNew();
        }
    }

    showStatus(message, type) {
        const statusDiv = document.getElementById('uploadStatus');
        statusDiv.textContent = message;
        statusDiv.className = 'status-message ' + type;
    }

    saveData() {
        try {
            localStorage.setItem('dashboardData', JSON.stringify(this.data));
        } catch (error) {
            console.error('Could not save to localStorage:', error);
        }
    }

    loadStoredData() {
        try {
            const stored = localStorage.getItem('dashboardData');
            if (stored) {
                this.data = JSON.parse(stored);
                console.log('Loaded stored data:', this.data);
            }
        } catch (error) {
            console.error('Could not load from localStorage:', error);
        }
    }
}

// Initialize app when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    window.app = new DashboardApp();
});