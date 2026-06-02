const { rtdb } = require('../firebase/firebase');
const streamRegistry = require('./streamRegistry');

const state = {
    lastProbeAtMs: 0,
    lastWriteTestTimestamp: null,
    lastWriteTestTimestampMs: null,
    lastDbConnection: null
};

const PROBE_TTL_MS = 10_000;

const probeDb = async () => {
    const nowMs = Date.now();

    if (state.lastProbeAtMs && nowMs - state.lastProbeAtMs < PROBE_TTL_MS) {
        return {
            dbConnection: Boolean(state.lastDbConnection),
            lastWriteTestTimestamp: state.lastWriteTestTimestamp,
            lastWriteTestTimestampMs: state.lastWriteTestTimestampMs
        };
    }

    state.lastProbeAtMs = nowMs;

    try {
        await rtdb().ref('_health/last_write_test_ms').set(nowMs);
        state.lastDbConnection = true;
        state.lastWriteTestTimestampMs = nowMs;
        state.lastWriteTestTimestamp = new Date(nowMs).toISOString();
    } catch (e) {
        state.lastDbConnection = false;
        // Keep lastWriteTestTimestamp as last known good write.
    }

    return {
        dbConnection: Boolean(state.lastDbConnection),
        lastWriteTestTimestamp: state.lastWriteTestTimestamp,
        lastWriteTestTimestampMs: state.lastWriteTestTimestampMs
    };
};

const getHealthSnapshot = async () => {
    const db = await probeDb();
    return {
        status: 'ok',
        timestamp: new Date().toISOString(),
        service: 'HEXAD API',
        dbConnection: db.dbConnection,
        lastWriteTestTimestamp: db.lastWriteTestTimestamp,
        activeStreamsCount: streamRegistry.getActiveStreamsCount()
    };
};

module.exports = {
    getHealthSnapshot,
    probeDb
};
