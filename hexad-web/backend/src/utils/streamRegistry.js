const registry = {
    total: 0,
    byName: {}
};

const clampNonNegativeInt = (value) => {
    const n = Number(value);
    if (!Number.isFinite(n)) return 0;
    return Math.max(0, Math.floor(n));
};

const increment = (name = 'unknown') => {
    const key = String(name || 'unknown');
    registry.total = clampNonNegativeInt(registry.total + 1);
    registry.byName[key] = clampNonNegativeInt((registry.byName[key] || 0) + 1);
    return registry.total;
};

const decrement = (name = 'unknown') => {
    const key = String(name || 'unknown');
    registry.total = clampNonNegativeInt(registry.total - 1);
    registry.byName[key] = clampNonNegativeInt((registry.byName[key] || 0) - 1);
    return registry.total;
};

const getActiveStreamsCount = () => registry.total;

const getBreakdown = () => ({ ...registry.byName });

module.exports = {
    increment,
    decrement,
    getActiveStreamsCount,
    getBreakdown
};
