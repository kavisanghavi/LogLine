/**
 * Date Formatting Utilities
 * Generates date headings for Google Doc entries
 */

/**
 * Get formatted date heading for a given date
 * @param {Date} date - Date to format
 * @returns {string} Formatted heading like "Monday, December 30th, 2025"
 */
function getDateHeading(date = new Date()) {
    const days = [
        'Sunday', 'Monday', 'Tuesday', 'Wednesday',
        'Thursday', 'Friday', 'Saturday'
    ];

    const months = [
        'January', 'February', 'March', 'April', 'May', 'June',
        'July', 'August', 'September', 'October', 'November', 'December'
    ];

    const dayName = days[date.getDay()];
    const monthName = months[date.getMonth()];
    const dayOfMonth = date.getDate();
    const year = date.getFullYear();

    const suffix = getOrdinalSuffix(dayOfMonth);

    return `${dayName}, ${monthName} ${dayOfMonth}${suffix}, ${year}`;
}

/**
 * Get ordinal suffix for a number (1st, 2nd, 3rd, etc.)
 * @param {number} n - Number
 * @returns {string} Ordinal suffix
 */
function getOrdinalSuffix(n) {
    const s = ['th', 'st', 'nd', 'rd'];
    const v = n % 100;
    return s[(v - 20) % 10] || s[v] || s[0];
}

/**
 * Get date heading for today in a specific timezone
 * @param {string} timezone - IANA timezone string
 * @returns {string} Formatted heading
 */
function getTodayHeading(timezone = 'America/New_York') {
    const now = new Date();
    // Create a date in the user's timezone
    const options = { timeZone: timezone };
    const localDateStr = now.toLocaleDateString('en-US', options);
    const localDate = new Date(localDateStr);

    return getDateHeading(localDate);
}

/**
 * Get the start of the week (Monday) for a given date
 * @param {Date} date - Date to get week start for
 * @returns {Date} Start of week
 */
function getWeekStart(date = new Date()) {
    const d = new Date(date);
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Adjust for Sunday
    d.setDate(diff);
    d.setHours(0, 0, 0, 0);
    return d;
}

/**
 * Get the end of the week (Sunday) for a given date
 * @param {Date} date - Date to get week end for
 * @returns {Date} End of week
 */
function getWeekEnd(date = new Date()) {
    const start = getWeekStart(date);
    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    end.setHours(23, 59, 59, 999);
    return end;
}

/**
 * Format a date range for weekly summary
 * @param {Date} start - Start date
 * @param {Date} end - End date
 * @returns {string} Formatted range like "Dec 23-30"
 */
function formatDateRange(start, end) {
    const months = [
        'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
        'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
    ];

    const startMonth = months[start.getMonth()];
    const endMonth = months[end.getMonth()];

    if (startMonth === endMonth) {
        return `${startMonth} ${start.getDate()}-${end.getDate()}`;
    }

    return `${startMonth} ${start.getDate()} - ${endMonth} ${end.getDate()}`;
}

module.exports = {
    getDateHeading,
    getTodayHeading,
    getOrdinalSuffix,
    getWeekStart,
    getWeekEnd,
    formatDateRange,
};
