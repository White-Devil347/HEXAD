// Format date to YYYY-MM-DD (ISO)
const toMySQLDate = (date) => {
    if (!date) return null;
    const d = new Date(date);
    return d.toISOString().slice(0, 10);
};

// Format datetime to YYYY-MM-DD HH:mm:ss (ISO-like)
const toMySQLDateTime = (date) => {
    if (!date) return null;
    const d = new Date(date);
    return d.toISOString().slice(0, 19).replace('T', ' ');
};

// Get current server time (authoritative)
const getServerTime = () => {
    return new Date();
};

// Get current server datetime string (authoritative)
const getMySQLNow = () => {
    return toMySQLDateTime(getServerTime());
};

// Add minutes to date
const addMinutes = (date, minutes) => {
    return new Date(date.getTime() + minutes * 60000);
};

// Add hours to date
const addHours = (date, hours) => {
    return new Date(date.getTime() + hours * 3600000);
};

// Check if date is within range
const isWithinRange = (date, startDate, endDate) => {
    const d = new Date(date);
    return d >= new Date(startDate) && d <= new Date(endDate);
};

// Get date range for queries
const getDateRange = (period) => {
    const now = new Date();
    let startDate;
    
    switch (period) {
        case 'today':
            startDate = new Date(now.setHours(0, 0, 0, 0));
            break;
        case 'week':
            startDate = new Date(now.setDate(now.getDate() - 7));
            break;
        case 'month':
            startDate = new Date(now.setMonth(now.getMonth() - 1));
            break;
        case 'year':
            startDate = new Date(now.setFullYear(now.getFullYear() - 1));
            break;
        default:
            startDate = new Date(now.setDate(now.getDate() - 30));
    }
    
    return {
        startDate: toMySQLDate(startDate),
        endDate: toMySQLDate(new Date())
    };
};

module.exports = {
    toMySQLDate,
    toMySQLDateTime,
    getServerTime,
    getMySQLNow,
    addMinutes,
    addHours,
    isWithinRange,
    getDateRange
};
