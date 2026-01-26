/**
 * SORTABLE TABLE UTILITY - BORREGAARD DASHBOARD
 * ==============================================
 * Makes tables sortable by clicking column headers.
 * Norwegian number format aware (1 234,56 kr)
 *
 * USAGE:
 *   SortableTable.init('myTableId');
 *
 * FEATURES:
 * - Click column header to sort ascending
 * - Click again to sort descending
 * - Third click returns to original order
 * - Handles Norwegian/Swedish number formats
 * - Handles dates (DD.MM.YYYY)
 * - Visual indicators (arrows)
 */
class SortableTable {
    /**
     * Store for original row order per table
     */
    static _originalOrders = {};

    /**
     * Store for sort state per table
     */
    static _sortStates = {};

    /**
     * Make a table sortable
     * @param {string} tableId - ID of table element
     * @param {Object} options - Configuration options
     * @param {Array<number>} options.excludeColumns - Column indices to exclude from sorting
     * @param {boolean} options.persistent - Remember sort state (default: false)
     */
    static init(tableId, options = {}) {
        const table = document.getElementById(tableId);
        if (!table) {
            console.warn(`SortableTable: Table #${tableId} not found`);
            return;
        }

        const thead = table.querySelector('thead');
        const tbody = table.querySelector('tbody');
        if (!thead || !tbody) {
            console.warn(`SortableTable: Table #${tableId} missing thead or tbody`);
            return;
        }

        const headers = thead.querySelectorAll('th');
        const excludeColumns = options.excludeColumns || [];

        // Store original row order
        this._originalOrders[tableId] = Array.from(tbody.querySelectorAll('tr'));

        // Initialize sort state
        this._sortStates[tableId] = {
            column: -1,
            direction: 'none' // 'none', 'asc', 'desc'
        };

        // Setup headers
        headers.forEach((header, index) => {
            // Skip if marked as non-sortable or excluded
            if (header.classList.contains('no-sort') || excludeColumns.includes(index)) {
                return;
            }

            // Make clickable
            header.style.cursor = 'pointer';
            header.style.userSelect = 'none';
            header.classList.add('sortable');

            // Add sort indicator if not already present
            if (!header.querySelector('.sort-indicator')) {
                const indicator = document.createElement('span');
                indicator.className = 'sort-indicator';
                indicator.innerHTML = ' \u21C5'; // Up-down arrow
                indicator.style.opacity = '0.5';
                header.appendChild(indicator);
            }

            // Click handler
            header.addEventListener('click', () => {
                this.handleHeaderClick(tableId, index, headers);
            });
        });
    }

    /**
     * Handle header click
     */
    static handleHeaderClick(tableId, columnIndex, headers) {
        const state = this._sortStates[tableId];
        const table = document.getElementById(tableId);
        const tbody = table.querySelector('tbody');

        // Determine new sort direction
        if (state.column !== columnIndex) {
            // New column - start with ascending
            state.column = columnIndex;
            state.direction = 'asc';
        } else {
            // Same column - cycle through: asc -> desc -> none
            if (state.direction === 'asc') {
                state.direction = 'desc';
            } else if (state.direction === 'desc') {
                state.direction = 'none';
                state.column = -1;
            } else {
                state.direction = 'asc';
            }
        }

        // Update indicators
        headers.forEach((header, i) => {
            const indicator = header.querySelector('.sort-indicator');
            if (indicator) {
                if (i === columnIndex && state.direction !== 'none') {
                    indicator.innerHTML = state.direction === 'asc' ? ' \u25B2' : ' \u25BC';
                    indicator.style.opacity = '1';
                } else {
                    indicator.innerHTML = ' \u21C5';
                    indicator.style.opacity = '0.5';
                }
            }
        });

        // Sort or restore original order
        if (state.direction === 'none') {
            // Restore original order
            const originalRows = this._originalOrders[tableId];
            originalRows.forEach(row => tbody.appendChild(row));
        } else {
            // Sort
            this.sortTable(table, columnIndex, state.direction === 'asc');
        }
    }

    /**
     * Sort table by column
     */
    static sortTable(table, columnIndex, ascending) {
        const tbody = table.querySelector('tbody');
        const rows = Array.from(tbody.querySelectorAll('tr'));

        rows.sort((a, b) => {
            const aCell = a.cells[columnIndex];
            const bCell = b.cells[columnIndex];

            if (!aCell || !bCell) return 0;

            let aVal = aCell.textContent.trim();
            let bVal = bCell.textContent.trim();

            // Try to parse as number
            const aNum = this.parseValue(aVal);
            const bNum = this.parseValue(bVal);

            if (aNum !== null && bNum !== null) {
                // Both are numbers
                return ascending ? aNum - bNum : bNum - aNum;
            }

            // Try to parse as date (DD.MM.YYYY)
            const aDate = this.parseDate(aVal);
            const bDate = this.parseDate(bVal);

            if (aDate !== null && bDate !== null) {
                return ascending ? aDate - bDate : bDate - aDate;
            }

            // String comparison (Norwegian locale)
            return ascending
                ? aVal.localeCompare(bVal, 'no', { sensitivity: 'base' })
                : bVal.localeCompare(aVal, 'no', { sensitivity: 'base' });
        });

        // Re-append rows in sorted order
        rows.forEach(row => tbody.appendChild(row));
    }

    /**
     * Parse value to number (handles Norwegian format)
     * Returns null if not a number
     */
    static parseValue(str) {
        if (!str) return null;

        // Remove common suffixes
        str = str.replace(/\s*(kr|nok|sek|stk|pcs|dager|days|%)\s*$/i, '').trim();

        // Remove thousand separators (space or non-breaking space)
        str = str.replace(/[\s\u00A0]/g, '');

        // Replace comma with dot (Norwegian decimal)
        str = str.replace(',', '.');

        // Remove any remaining non-numeric except dot and minus
        const cleaned = str.replace(/[^\d.\-]/g, '');

        const num = parseFloat(cleaned);
        return isNaN(num) ? null : num;
    }

    /**
     * Parse date string (DD.MM.YYYY or YYYY-MM-DD)
     * Returns timestamp or null
     */
    static parseDate(str) {
        if (!str) return null;

        // Try Norwegian format (DD.MM.YYYY)
        const norwegianMatch = str.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
        if (norwegianMatch) {
            const date = new Date(
                parseInt(norwegianMatch[3]),
                parseInt(norwegianMatch[2]) - 1,
                parseInt(norwegianMatch[1])
            );
            return isNaN(date.getTime()) ? null : date.getTime();
        }

        // Try ISO format (YYYY-MM-DD)
        const isoMatch = str.match(/^(\d{4})-(\d{2})-(\d{2})$/);
        if (isoMatch) {
            const date = new Date(str);
            return isNaN(date.getTime()) ? null : date.getTime();
        }

        return null;
    }

    /**
     * Destroy sortable functionality for a table
     */
    static destroy(tableId) {
        delete this._originalOrders[tableId];
        delete this._sortStates[tableId];

        const table = document.getElementById(tableId);
        if (table) {
            const headers = table.querySelectorAll('th.sortable');
            headers.forEach(header => {
                header.style.cursor = '';
                header.style.userSelect = '';
                header.classList.remove('sortable');
                const indicator = header.querySelector('.sort-indicator');
                if (indicator) indicator.remove();
            });
        }
    }

    /**
     * Reset sort to original order
     */
    static reset(tableId) {
        const table = document.getElementById(tableId);
        const tbody = table?.querySelector('tbody');
        const originalRows = this._originalOrders[tableId];

        if (tbody && originalRows) {
            originalRows.forEach(row => tbody.appendChild(row));

            // Reset state
            this._sortStates[tableId] = {
                column: -1,
                direction: 'none'
            };

            // Reset indicators
            table.querySelectorAll('th .sort-indicator').forEach(indicator => {
                indicator.innerHTML = ' \u21C5';
                indicator.style.opacity = '0.5';
            });
        }
    }
}

// Export for use in other modules
window.SortableTable = SortableTable;
