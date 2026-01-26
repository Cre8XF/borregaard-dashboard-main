/**
 * CENTRALIZED DATE PARSER - BORREGAARD DASHBOARD
 * ===============================================
 * Handles all date formats from Butler, Tools, and manual inputs.
 *
 * WHY THIS EXISTS:
 * - Before: Date parsing duplicated in orderAnalyzer, butlerAnalyzer, shutdownAnalyzer
 * - Now: Single source of truth for all date/number parsing
 * - Supports: ISO (YYYY-MM-DD), Norwegian (DD.MM.YYYY), Swedish formats
 */
class DateParser {
    /**
     * Parse date from multiple formats
     * @param {string|Date} dateStr - Date string to parse
     * @returns {Date|null} Parsed date object or null
     *
     * Supported formats:
     * - ISO: 2025-01-26
     * - Norwegian: 26.01.2025 or 26/01/2025
     * - Excel serial: 45678 (days since 1900-01-01)
     */
    static parse(dateStr) {
        if (!dateStr) return null;

        // Already a Date object
        if (dateStr instanceof Date) {
            return isNaN(dateStr.getTime()) ? null : dateStr;
        }

        // Convert to string
        const str = String(dateStr).trim();
        if (!str) return null;

        // Try ISO format first (YYYY-MM-DD or YYYY-MM-DDTHH:MM:SS)
        if (/^\d{4}-\d{2}-\d{2}/.test(str)) {
            const date = new Date(str);
            if (!isNaN(date.getTime())) return date;
        }

        // Try Norwegian/European format (DD.MM.YYYY or DD/MM/YYYY)
        const europeanMatch = str.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/);
        if (europeanMatch) {
            const day = parseInt(europeanMatch[1], 10);
            const month = parseInt(europeanMatch[2], 10) - 1; // 0-indexed
            const year = parseInt(europeanMatch[3], 10);
            const date = new Date(year, month, day);
            if (!isNaN(date.getTime())) return date;
        }

        // Try Excel serial date (number of days since 1900-01-01)
        const serialNum = parseFloat(str);
        if (!isNaN(serialNum) && serialNum > 1000 && serialNum < 100000) {
            // Excel serial date conversion
            // Excel incorrectly treats 1900 as leap year, so adjust
            const excelEpoch = new Date(1899, 11, 30); // Dec 30, 1899
            const date = new Date(excelEpoch.getTime() + serialNum * 24 * 60 * 60 * 1000);
            if (!isNaN(date.getTime())) return date;
        }

        // Try parsing as generic date string
        const genericDate = new Date(str);
        if (!isNaN(genericDate.getTime())) return genericDate;

        return null;
    }

    /**
     * Get ISO week number (1-53)
     * @param {Date} date - Date object
     * @returns {number} ISO week number (1-53), or 0 if invalid
     *
     * Uses ISO 8601 week numbering:
     * - Week 1 is the week containing the first Thursday of the year
     * - Weeks start on Monday
     */
    static getWeekNumber(date) {
        if (!(date instanceof Date) || isNaN(date.getTime())) return 0;

        // Copy date to avoid mutation
        const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));

        // Set to nearest Thursday: current date + 4 - current day number
        // Make Sunday's day number 7
        const dayNum = d.getUTCDay() || 7;
        d.setUTCDate(d.getUTCDate() + 4 - dayNum);

        // Get first day of year
        const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));

        // Calculate week number
        const weekNum = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);

        return weekNum;
    }

    /**
     * Get ISO week year (can differ from calendar year at year boundaries)
     * @param {Date} date - Date object
     * @returns {number} ISO week year
     */
    static getWeekYear(date) {
        if (!(date instanceof Date) || isNaN(date.getTime())) return 0;

        const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
        const dayNum = d.getUTCDay() || 7;
        d.setUTCDate(d.getUTCDate() + 4 - dayNum);

        return d.getUTCFullYear();
    }

    /**
     * Parse number from string (handles Norwegian/Swedish formats)
     * @param {string|number} value - Value to parse
     * @returns {number} Parsed number or 0
     *
     * Handles:
     * - Norwegian decimal: 1 234,56
     * - Swedish decimal: 1 234,56
     * - Standard: 1234.56
     * - With currency: 1234 kr, 1234 NOK
     */
    static parseNumber(value) {
        if (value === undefined || value === null || value === '') return 0;

        // Already a number
        if (typeof value === 'number') {
            return isNaN(value) ? 0 : value;
        }

        let str = String(value).trim();

        // Remove common suffixes
        str = str.replace(/\s*(kr|nok|sek|stk|pcs|dager|days|%)\s*$/i, '');

        // Remove thousand separators (space or non-breaking space)
        str = str.replace(/[\s\u00A0]/g, '');

        // Replace comma with dot (Norwegian/Swedish decimal separator)
        str = str.replace(',', '.');

        // Remove any remaining non-numeric characters except dot and minus
        str = str.replace(/[^\d.\-]/g, '');

        const num = parseFloat(str);
        return isNaN(num) ? 0 : num;
    }

    /**
     * Format date to Norwegian format (DD.MM.YYYY)
     * @param {Date|string} date - Date object or string
     * @returns {string} Formatted date or empty string
     */
    static toNorwegian(date) {
        const parsed = date instanceof Date ? date : this.parse(date);
        if (!parsed || isNaN(parsed.getTime())) return '';

        const day = String(parsed.getDate()).padStart(2, '0');
        const month = String(parsed.getMonth() + 1).padStart(2, '0');
        const year = parsed.getFullYear();

        return `${day}.${month}.${year}`;
    }

    /**
     * Format date to ISO format (YYYY-MM-DD)
     * @param {Date|string} date - Date object or string
     * @returns {string} Formatted date or empty string
     */
    static toISO(date) {
        const parsed = date instanceof Date ? date : this.parse(date);
        if (!parsed || isNaN(parsed.getTime())) return '';

        return parsed.toISOString().split('T')[0];
    }

    /**
     * Calculate days between two dates
     * @param {Date|string} date1 - First date
     * @param {Date|string} date2 - Second date (defaults to today)
     * @returns {number} Number of days (positive if date2 > date1)
     */
    static daysBetween(date1, date2 = new Date()) {
        const d1 = date1 instanceof Date ? date1 : this.parse(date1);
        const d2 = date2 instanceof Date ? date2 : this.parse(date2);

        if (!d1 || !d2) return 0;

        const diffTime = d2.getTime() - d1.getTime();
        return Math.floor(diffTime / (1000 * 60 * 60 * 24));
    }

    /**
     * Check if date falls within a specific ISO week
     * @param {Date|string} date - Date to check
     * @param {number} week - Week number (1-53)
     * @param {number} year - Optional year (defaults to date's year)
     * @returns {boolean} True if date is in specified week
     */
    static isInWeek(date, week, year = null) {
        const parsed = date instanceof Date ? date : this.parse(date);
        if (!parsed) return false;

        const dateWeek = this.getWeekNumber(parsed);
        const dateYear = year ? this.getWeekYear(parsed) : null;

        if (year !== null) {
            return dateWeek === week && dateYear === year;
        }

        return dateWeek === week;
    }

    /**
     * Format number to Norwegian format (1 234,56)
     * @param {number} value - Number to format
     * @param {number} decimals - Number of decimal places (default: 0)
     * @returns {string} Formatted number
     */
    static formatNumber(value, decimals = 0) {
        if (typeof value !== 'number' || isNaN(value)) return '0';

        const parts = value.toFixed(decimals).split('.');
        parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ' ');

        return parts.join(',');
    }
}

// Export for use in other modules
window.DateParser = DateParser;
