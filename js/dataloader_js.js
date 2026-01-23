// ===================================
// DATA LOADER
// CSV/XLSX parsing utilities
// ===================================

class DataLoader {
    static async loadCSV(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            
            reader.onload = (e) => {
                try {
                    const text = e.target.result;
                    const parsed = DataLoader.parseCSV(text);
                    resolve(parsed);
                } catch (error) {
                    reject(error);
                }
            };
            
            reader.onerror = () => reject(new Error('Failed to read CSV file'));
            reader.readAsText(file);
        });
    }

    static parseCSV(text) {
        const lines = text.split('\n').filter(line => line.trim());
        if (lines.length === 0) return [];
        
        const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, ''));
        
        const data = lines.slice(1).map(line => {
            const values = line.split(',').map(v => v.trim().replace(/"/g, ''));
            const obj = {};
            headers.forEach((header, i) => {
                obj[header] = values[i] || '';
            });
            return obj;
        });
        
        return data;
    }

    static async loadExcel(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            
            reader.onload = (e) => {
                try {
                    const data = new Uint8Array(e.target.result);
                    const workbook = XLSX.read(data, { type: 'array' });
                    const firstSheetName = workbook.SheetNames[0];
                    const worksheet = workbook.Sheets[firstSheetName];
                    const jsonData = XLSX.utils.sheet_to_json(worksheet);
                    
                    resolve(jsonData);
                } catch (error) {
                    reject(error);
                }
            };
            
            reader.onerror = () => reject(new Error('Failed to read Excel file'));
            reader.readAsArrayBuffer(file);
        });
    }

    static detectColumnMapping(data, expectedColumns) {
        if (!data || data.length === 0) return {};
        
        const actualColumns = Object.keys(data[0]);
        const mapping = {};
        
        expectedColumns.forEach(expected => {
            // Try exact match first
            if (actualColumns.includes(expected)) {
                mapping[expected] = expected;
                return;
            }
            
            // Try fuzzy match
            const normalized = expected.toLowerCase().replace(/[_\s]/g, '');
            const match = actualColumns.find(col => 
                col.toLowerCase().replace(/[_\s]/g, '') === normalized
            );
            
            if (match) {
                mapping[expected] = match;
            }
        });
        
        return mapping;
    }

    static validateData(data, requiredColumns) {
        if (!data || data.length === 0) {
            return { valid: false, error: 'No data provided' };
        }
        
        const columns = Object.keys(data[0]);
        const missing = requiredColumns.filter(col => !columns.includes(col));
        
        if (missing.length > 0) {
            return { 
                valid: false, 
                error: `Missing columns: ${missing.join(', ')}` 
            };
        }
        
        return { valid: true };
    }
}

// Export for use in other modules
window.DataLoader = DataLoader;