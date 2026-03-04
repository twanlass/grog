// WebRTC connection lifecycle via PeerJS
import { Peer } from 'peerjs';
import { MESSAGE_TYPES, createMessage } from './commands.js';

// Connection state enum
export const CONNECTION_STATE = {
    DISCONNECTED: 'disconnected',
    CONNECTING: 'connecting',
    CONNECTED: 'connected',
    ERROR: 'error',
};

// Generate a short game code (e.g., "GROG-X7K2M")
function generateGameCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // No I/O/0/1 to avoid confusion
    let code = '';
    for (let i = 0; i < 5; i++) {
        code += chars[Math.floor(Math.random() * chars.length)];
    }
    return `GROG-${code}`;
}

// Singleton state
let peer = null;
let connection = null;
let connectionState = CONNECTION_STATE.DISCONNECTED;
let isHost = false;
let gameCode = null;
let latency = 0;
let lastPingTime = 0;
let heartbeatInterval = null;
let disconnectTimeout = null;
let callbacks = {};

// ============================================================
// Public API
// ============================================================

/**
 * Create a host peer and wait for a guest to connect.
 * @param {Object} cbs - Callbacks: { onGuestConnected, onData, onDisconnect, onError }
 * @returns {Promise<string>} - The game code for the guest to use
 */
export function createHost(cbs = {}) {
    return new Promise((resolve, reject) => {
        callbacks = cbs;
        isHost = true;
        gameCode = generateGameCode();

        // Use the game code as the PeerJS peer ID (lowercase for PeerJS compatibility)
        const peerId = gameCode.toLowerCase().replace('-', '');

        peer = new Peer(peerId, {
            debug: 0, // Minimal logging
        });

        peer.on('open', () => {
            connectionState = CONNECTION_STATE.CONNECTING; // Waiting for guest
            resolve(gameCode);
        });

        peer.on('connection', (conn) => {
            connection = conn;
            setupConnection(conn);
        });

        peer.on('error', (err) => {
            connectionState = CONNECTION_STATE.ERROR;
            if (callbacks.onError) callbacks.onError(err);
            reject(err);
        });
    });
}

/**
 * Connect to a host using their game code.
 * @param {string} hostCode - The host's game code (e.g., "GROG-X7K2M")
 * @param {Object} cbs - Callbacks: { onConnected, onData, onDisconnect, onError }
 * @returns {Promise<void>}
 */
export function joinHost(hostCode, cbs = {}) {
    return new Promise((resolve, reject) => {
        callbacks = cbs;
        isHost = false;
        gameCode = hostCode.toUpperCase();

        const peerId = `guest-${Date.now()}`;
        const hostPeerId = gameCode.toLowerCase().replace('-', '');

        peer = new Peer(peerId, {
            debug: 0,
        });

        peer.on('open', () => {
            connectionState = CONNECTION_STATE.CONNECTING;
            connection = peer.connect(hostPeerId, {
                reliable: true,
            });
            setupConnection(connection, resolve, reject);
        });

        peer.on('error', (err) => {
            connectionState = CONNECTION_STATE.ERROR;
            if (callbacks.onError) callbacks.onError(err);
            reject(err);
        });
    });
}

/**
 * Send a command or message to the remote peer.
 * @param {Object} msg - Message object to send
 */
export function sendMessage(msg) {
    if (connection && connection.open) {
        connection.send(msg);
    }
}

/**
 * Send a state snapshot to the guest (host only).
 * @param {Object} snapshot - The state snapshot object
 */
export function sendStateSnapshot(snapshot) {
    sendMessage(createMessage(MESSAGE_TYPES.STATE_SNAPSHOT, { snapshot }));
}

/**
 * Send a player command to the host (guest only).
 * @param {Object} command - The command object
 */
export function sendPlayerCommand(command) {
    sendMessage(createMessage(MESSAGE_TYPES.PLAYER_COMMAND, { command }));
}

/**
 * Disconnect and clean up all resources.
 */
export function disconnect() {
    if (heartbeatInterval) {
        clearInterval(heartbeatInterval);
        heartbeatInterval = null;
    }
    if (disconnectTimeout) {
        clearTimeout(disconnectTimeout);
        disconnectTimeout = null;
    }
    if (connection) {
        try { connection.close(); } catch (e) { /* ignore */ }
        connection = null;
    }
    if (peer) {
        try { peer.destroy(); } catch (e) { /* ignore */ }
        peer = null;
    }
    connectionState = CONNECTION_STATE.DISCONNECTED;
    callbacks = {};
    gameCode = null;
    latency = 0;
}

// ============================================================
// Status Queries
// ============================================================

export function getConnectionState() { return connectionState; }
export function getIsHost() { return isHost; }
export function getPeerCode() { return gameCode; }
export function getLatency() { return latency; }
export function isConnected() { return connectionState === CONNECTION_STATE.CONNECTED; }

// ============================================================
// Internal
// ============================================================

function setupConnection(conn, resolvePromise, rejectPromise) {
    conn.on('open', () => {
        connectionState = CONNECTION_STATE.CONNECTED;
        startHeartbeat();

        if (isHost && callbacks.onGuestConnected) {
            callbacks.onGuestConnected();
        }
        if (!isHost && callbacks.onConnected) {
            callbacks.onConnected();
        }
        if (resolvePromise) resolvePromise();
    });

    conn.on('data', (data) => {
        // Handle heartbeat internally
        if (data.messageType === MESSAGE_TYPES.PING) {
            sendMessage(createMessage(MESSAGE_TYPES.PONG, { pingTimestamp: data.timestamp }));
            resetDisconnectTimer();
            return;
        }
        if (data.messageType === MESSAGE_TYPES.PONG) {
            latency = Date.now() - (data.pingTimestamp || lastPingTime);
            resetDisconnectTimer();
            return;
        }

        // Forward all other messages to callback
        if (callbacks.onData) {
            callbacks.onData(data);
        }
    });

    conn.on('close', () => {
        connectionState = CONNECTION_STATE.DISCONNECTED;
        if (callbacks.onDisconnect) callbacks.onDisconnect();
        cleanup();
    });

    conn.on('error', (err) => {
        connectionState = CONNECTION_STATE.ERROR;
        if (callbacks.onError) callbacks.onError(err);
        if (rejectPromise) rejectPromise(err);
    });
}

function startHeartbeat() {
    // Send ping every 2 seconds
    heartbeatInterval = setInterval(() => {
        lastPingTime = Date.now();
        sendMessage(createMessage(MESSAGE_TYPES.PING));
    }, 2000);

    resetDisconnectTimer();
}

function resetDisconnectTimer() {
    if (disconnectTimeout) clearTimeout(disconnectTimeout);
    // Disconnect after 10 seconds of no heartbeat response
    disconnectTimeout = setTimeout(() => {
        connectionState = CONNECTION_STATE.DISCONNECTED;
        if (callbacks.onDisconnect) callbacks.onDisconnect();
        cleanup();
    }, 10000);
}

function cleanup() {
    if (heartbeatInterval) {
        clearInterval(heartbeatInterval);
        heartbeatInterval = null;
    }
    if (disconnectTimeout) {
        clearTimeout(disconnectTimeout);
        disconnectTimeout = null;
    }
}
