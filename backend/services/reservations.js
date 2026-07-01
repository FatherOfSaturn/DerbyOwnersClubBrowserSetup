// services/reservations.js

const RESERVATION_DURATION_MS = 15 * 60 * 1000; // 15 minutes
const HEARTBEAT_TIMEOUT_MS = 45 * 1000;          // 45 seconds

const SATELLITES = ['sat1', 'sat2', 'sat3', 'sat4'];

// { sat1: { email, socketId, reservedAt, expiresAt, expiryTimer, heartbeatTimer } | null }
const state = {};
for (const sat of SATELLITES) state[sat] = null;

function getAll() {
    const result = {};
    for (const sat of SATELLITES) {
        const res = state[sat];
        result[sat] = res
            ? { email: res.email, reservedAt: res.reservedAt, expiresAt: res.expiresAt }
            : null;
    }
    return result;
}

function reserve(satellite, email, socketId, onExpire) {
    if (!SATELLITES.includes(satellite)) return { error: 'Unknown satellite' };
    if (state[satellite]) return { error: 'Satellite already reserved' };

    const now = Date.now();

    const expiryTimer = setTimeout(() => {
        _clear(satellite);
        onExpire(satellite, 'expired');
    }, RESERVATION_DURATION_MS);

    const heartbeatTimer = setTimeout(() => {
        _clear(satellite);
        onExpire(satellite, 'heartbeat_timeout');
    }, HEARTBEAT_TIMEOUT_MS);

    state[satellite] = {
        email,
        socketId,
        reservedAt: now,
        expiresAt: now + RESERVATION_DURATION_MS,
        expiryTimer,
        heartbeatTimer,
        onExpire,
    };

    return { success: true };
}

function _clear(satellite) {
    const res = state[satellite];
    if (!res) return;
    clearTimeout(res.expiryTimer);
    clearTimeout(res.heartbeatTimer);
    state[satellite] = null;
}

function release(satellite, requestingEmail) {
    if (!SATELLITES.includes(satellite)) return { error: 'Unknown satellite' };
    if (!state[satellite]) return { error: 'Satellite not reserved' };
    if (requestingEmail !== null && state[satellite].email !== requestingEmail) {
        return { error: 'Not your reservation' };
    }
    _clear(satellite);
    return { success: true };
}

function heartbeat(socketId) {
    for (const sat of SATELLITES) {
        const res = state[sat];
        if (!res || res.socketId !== socketId) continue;

        clearTimeout(res.heartbeatTimer);
        res.heartbeatTimer = setTimeout(() => {
            _clear(sat);
            res.onExpire(sat, 'heartbeat_timeout');
        }, HEARTBEAT_TIMEOUT_MS);
    }
}

function releaseBySocket(socketId) {
    const released = [];
    for (const sat of SATELLITES) {
        const res = state[sat];
        if (res && res.socketId === socketId) {
            _clear(sat);
            released.push(sat);
        }
    }
    return released;
}

function getReservation(satellite) {
    return state[satellite] || null;
}

module.exports = {
    SATELLITES,
    getAll,
    reserve,
    release,
    heartbeat,
    releaseBySocket,
    getReservation,
};