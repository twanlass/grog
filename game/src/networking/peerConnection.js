// WebRTC connection lifecycle via PeerJS
// Supports multiple guest connections (up to 3 guests for 4-player games)
import { Peer } from 'peerjs';
import { MESSAGE_TYPES, createMessage } from './commands.js';

// Connection state enum
export const CONNECTION_STATE = {
    DISCONNECTED: 'disconnected',
    CONNECTING: 'connecting',
    CONNECTED: 'connected',
    ERROR: 'error',
};

const MAX_GUESTS = 3;

// Player ID assignment order
const GUEST_PLAYER_IDS = ['player2', 'player3', 'player4'];

// Generate a short game code (e.g., "GROG-X7K2M")
function generateGameCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // No I/O/0/1 to avoid confusion
    let code = '';
    for (let i = 0; i < 5; i++) {
        code += chars[Math.floor(Math.random() * chars.length)];
    }
    return `GROG-${code}`;
}

// Fetch TURN credentials from Metered, fall back to STUN-only
async function fetchIceServers() {
    const fallback = [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
    ];
    try {
        const resp = await fetch(
            'https://grog-rts.metered.live/api/v1/turn/credentials?apiKey=1e0da7d4dc827b3c1b80bb97f47bf0be3886',
        );
        const servers = await resp.json();
        console.log(`[Grog MP] Fetched ${servers.length} TURN servers from Metered`);
        return [...fallback, ...servers];
    } catch (e) {
        console.warn('[Grog MP] Failed to fetch TURN servers, using STUN only:', e);
        return fallback;
    }
}

function makePeerConfig(iceServers) {
    return { debug: 1, config: { iceServers } };
}

// Singleton state
let peer = null;
let connectionState = CONNECTION_STATE.DISCONNECTED;
let isHost = false;
let gameCode = null;
let callbacks = {};

// Host: multiple guest connections
// Map of peerId → { conn, playerId, latency, lastPingTime, heartbeatInterval, disconnectTimeout }
let connections = new Map();

// Track which player IDs have been assigned (survives reconnects)
let nextPlayerIndex = 0;

// Guest: single connection to host
let guestConnection = null;
let guestLatency = 0;
let guestLastPingTime = 0;
let guestHeartbeatInterval = null;
let guestDisconnectTimeout = null;
// Guest's assigned player ID (received from host)
let localPlayerId = null;

// ============================================================
// Public API
// ============================================================

/**
 * Create a host peer and wait for guests to connect.
 * @param {Object} cbs - Callbacks: { onGuestConnected(playerId), onGuestDisconnected(playerId), onData(data, playerId), onError }
 * @returns {Promise<string>} - The game code for guests to use
 */
export async function createHost(cbs = {}) {
    const iceServers = await fetchIceServers();
    return new Promise((resolve, reject) => {
        callbacks = cbs;
        isHost = true;
        gameCode = generateGameCode();
        localPlayerId = 'player';
        nextPlayerIndex = 0;

        // Use the game code as the PeerJS peer ID (lowercase for PeerJS compatibility)
        const peerId = gameCode.toLowerCase().replace('-', '');

        console.log(`[Grog MP] Hosting as peer: ${peerId}`);

        peer = new Peer(peerId, makePeerConfig(iceServers));

        peer.on('open', (id) => {
            console.log(`[Grog MP] Host peer open with id: ${id}`);
            connectionState = CONNECTION_STATE.CONNECTING; // Waiting for guests
            resolve(gameCode);
        });

        peer.on('connection', (conn) => {
            if (connections.size >= MAX_GUESTS) {
                console.warn(`[Grog MP] Rejecting connection — max ${MAX_GUESTS} guests reached`);
                try { conn.close(); } catch (e) { /* ignore */ }
                return;
            }

            // Assign next available player ID
            const playerId = GUEST_PLAYER_IDS[nextPlayerIndex++];
            console.log(`[Grog MP] Guest connected as ${playerId}! Setting up DataChannel...`);

            const connState = {
                conn,
                playerId,
                latency: 0,
                lastPingTime: 0,
                heartbeatInterval: null,
                disconnectTimeout: null,
            };
            connections.set(conn.peer, connState);

            setupHostConnection(conn, connState);
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
export async function joinHost(hostCode, cbs = {}) {
    const iceServers = await fetchIceServers();
    return new Promise((resolve, reject) => {
        callbacks = cbs;
        isHost = false;
        gameCode = hostCode.toUpperCase();

        const peerId = `guest-${Date.now()}`;
        const hostPeerId = gameCode.toLowerCase().replace('-', '');

        console.log(`[Grog MP] Joining as ${peerId}, looking for host ${hostPeerId}`);

        peer = new Peer(peerId, makePeerConfig(iceServers));

        peer.on('open', (id) => {
            console.log(`[Grog MP] Guest peer open with id: ${id}, connecting to host...`);
            connectionState = CONNECTION_STATE.CONNECTING;
            guestConnection = peer.connect(hostPeerId, {
                reliable: true,
                serialization: 'json',
            });
            setupGuestConnection(guestConnection, resolve, reject);
        });

        peer.on('error', (err) => {
            console.error(`[Grog MP] Peer error:`, err.type, err.message);
            connectionState = CONNECTION_STATE.ERROR;
            if (callbacks.onError) callbacks.onError(err);
            reject(err);
        });
    });
}

/**
 * Send a message to all guests (host) or to the host (guest).
 * @param {Object} msg - Message object to send
 */
export function sendMessage(msg) {
    if (isHost) {
        // Broadcast to all connected guests
        for (const connState of connections.values()) {
            if (connState.conn?.open) connState.conn.send(msg);
        }
    } else {
        if (guestConnection && guestConnection.open) {
            guestConnection.send(msg);
        }
    }
}

/**
 * Send a message to a specific guest by peerId (host only).
 */
export function sendMessageToPeer(msg, peerId) {
    const connState = connections.get(peerId);
    if (connState?.conn?.open) connState.conn.send(msg);
}

/**
 * Send a state snapshot to all guests (host only).
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
 * Broadcast a lobby state update to all guests (host only).
 * @param {Object} lobbyState - { players: [{playerId, connected}] }
 */
export function sendLobbyState(lobbyState) {
    sendMessage(createMessage(MESSAGE_TYPES.LOBBY_STATE, lobbyState));
}

/**
 * Disconnect and clean up all resources.
 */
export function disconnect() {
    // Clean up all host connections
    for (const connState of connections.values()) {
        if (connState.heartbeatInterval) clearInterval(connState.heartbeatInterval);
        if (connState.disconnectTimeout) clearTimeout(connState.disconnectTimeout);
        try { connState.conn.close(); } catch (e) { /* ignore */ }
    }
    connections.clear();

    // Clean up guest connection
    if (guestHeartbeatInterval) {
        clearInterval(guestHeartbeatInterval);
        guestHeartbeatInterval = null;
    }
    if (guestDisconnectTimeout) {
        clearTimeout(guestDisconnectTimeout);
        guestDisconnectTimeout = null;
    }
    if (guestConnection) {
        try { guestConnection.close(); } catch (e) { /* ignore */ }
        guestConnection = null;
    }

    if (peer) {
        try { peer.destroy(); } catch (e) { /* ignore */ }
        peer = null;
    }
    connectionState = CONNECTION_STATE.DISCONNECTED;
    callbacks = {};
    gameCode = null;
    guestLatency = 0;
    localPlayerId = null;
    nextPlayerIndex = 0;
}

// ============================================================
// Status Queries
// ============================================================

export function getConnectionState() { return connectionState; }
export function getIsHost() { return isHost; }
export function getPeerCode() { return gameCode; }
export function getLocalPlayerId() { return localPlayerId; }

export function getLatency() {
    if (isHost) {
        let maxLat = 0;
        for (const connState of connections.values()) {
            maxLat = Math.max(maxLat, connState.latency);
        }
        return maxLat;
    }
    return guestLatency;
}

export function isConnected() {
    if (isHost) {
        return connections.size > 0;
    }
    return connectionState === CONNECTION_STATE.CONNECTED;
}

export function getConnectedPlayerCount() {
    return connections.size + 1; // +1 for host
}

export function getConnectedPlayerIds() {
    const ids = ['player'];
    for (const connState of connections.values()) {
        ids.push(connState.playerId);
    }
    return ids;
}

// ============================================================
// Internal: Host-side connection setup
// ============================================================

function setupHostConnection(conn, connState) {
    function handleOpen() {
        if (connState._opened) return;
        connState._opened = true;
        console.log(`[Grog MP] DataChannel open for ${connState.playerId}!`);
        connectionState = CONNECTION_STATE.CONNECTED;
        startHostHeartbeat(connState);

        if (callbacks.onGuestConnected) {
            callbacks.onGuestConnected(connState.playerId);
        }
    }

    conn.on('open', handleOpen);

    // PeerJS race condition: connection may already be open
    if (conn.open) {
        console.log(`[Grog MP] Connection already open for ${connState.playerId}`);
        handleOpen();
    }

    // Diagnostic: monitor WebRTC state
    monitorRTC(conn);

    conn.on('data', (data) => {
        // Handle heartbeat internally
        if (data.messageType === MESSAGE_TYPES.PING) {
            if (connState.conn?.open) {
                connState.conn.send(createMessage(MESSAGE_TYPES.PONG, { pingTimestamp: data.timestamp }));
            }
            resetHostDisconnectTimer(connState);
            return;
        }
        if (data.messageType === MESSAGE_TYPES.PONG) {
            connState.latency = Date.now() - (data.pingTimestamp || connState.lastPingTime);
            resetHostDisconnectTimer(connState);
            return;
        }

        // Forward all other messages to callback with playerId
        if (callbacks.onData) {
            callbacks.onData(data, connState.playerId);
        }
    });

    conn.on('close', () => {
        handleHostGuestDisconnect(conn.peer);
    });

    conn.on('error', (err) => {
        console.error(`[Grog MP] Connection error for ${connState.playerId}:`, err);
        handleHostGuestDisconnect(conn.peer);
    });
}

function handleHostGuestDisconnect(peerId) {
    const connState = connections.get(peerId);
    if (!connState) return;

    const playerId = connState.playerId;
    if (connState.heartbeatInterval) clearInterval(connState.heartbeatInterval);
    if (connState.disconnectTimeout) clearTimeout(connState.disconnectTimeout);
    connections.delete(peerId);

    console.log(`[Grog MP] Guest ${playerId} disconnected. ${connections.size} guests remain.`);

    if (callbacks.onGuestDisconnected) {
        callbacks.onGuestDisconnected(playerId);
    }
}

function startHostHeartbeat(connState) {
    connState.heartbeatInterval = setInterval(() => {
        connState.lastPingTime = Date.now();
        if (connState.conn?.open) {
            connState.conn.send(createMessage(MESSAGE_TYPES.PING));
        }
    }, 2000);

    resetHostDisconnectTimer(connState);
}

function resetHostDisconnectTimer(connState) {
    if (connState.disconnectTimeout) clearTimeout(connState.disconnectTimeout);
    connState.disconnectTimeout = setTimeout(() => {
        handleHostGuestDisconnect(connState.conn?.peer);
    }, 10000);
}

// ============================================================
// Internal: Guest-side connection setup
// ============================================================

function setupGuestConnection(conn, resolvePromise, rejectPromise) {
    function handleOpen() {
        if (connectionState === CONNECTION_STATE.CONNECTED) return;
        console.log(`[Grog MP] DataChannel open! Connected to host.`);
        connectionState = CONNECTION_STATE.CONNECTED;
        startGuestHeartbeat();

        if (callbacks.onConnected) {
            callbacks.onConnected();
        }
        if (resolvePromise) resolvePromise();
    }

    conn.on('open', handleOpen);

    // PeerJS race condition
    if (conn.open) {
        console.log(`[Grog MP] Connection already open when listener attached`);
        handleOpen();
    }

    // Diagnostic: monitor WebRTC state
    monitorRTC(conn);

    conn.on('data', (data) => {
        // Handle heartbeat internally
        if (data.messageType === MESSAGE_TYPES.PING) {
            sendMessage(createMessage(MESSAGE_TYPES.PONG, { pingTimestamp: data.timestamp }));
            resetGuestDisconnectTimer();
            return;
        }
        if (data.messageType === MESSAGE_TYPES.PONG) {
            guestLatency = Date.now() - (data.pingTimestamp || guestLastPingTime);
            resetGuestDisconnectTimer();
            return;
        }

        // Store assigned player ID from GAME_INIT
        if (data.messageType === MESSAGE_TYPES.GAME_INIT && data.playerId) {
            localPlayerId = data.playerId;
            console.log(`[Grog MP] Assigned player ID: ${localPlayerId}`);
        }

        // Forward all other messages to callback
        if (callbacks.onData) {
            callbacks.onData(data);
        }
    });

    conn.on('close', () => {
        connectionState = CONNECTION_STATE.DISCONNECTED;
        if (callbacks.onDisconnect) callbacks.onDisconnect();
        cleanupGuest();
    });

    conn.on('error', (err) => {
        connectionState = CONNECTION_STATE.ERROR;
        if (callbacks.onError) callbacks.onError(err);
        if (rejectPromise) rejectPromise(err);
    });
}

function startGuestHeartbeat() {
    guestHeartbeatInterval = setInterval(() => {
        guestLastPingTime = Date.now();
        sendMessage(createMessage(MESSAGE_TYPES.PING));
    }, 2000);

    resetGuestDisconnectTimer();
}

function resetGuestDisconnectTimer() {
    if (guestDisconnectTimeout) clearTimeout(guestDisconnectTimeout);
    guestDisconnectTimeout = setTimeout(() => {
        connectionState = CONNECTION_STATE.DISCONNECTED;
        if (callbacks.onDisconnect) callbacks.onDisconnect();
        cleanupGuest();
    }, 10000);
}

function cleanupGuest() {
    if (guestHeartbeatInterval) {
        clearInterval(guestHeartbeatInterval);
        guestHeartbeatInterval = null;
    }
    if (guestDisconnectTimeout) {
        clearTimeout(guestDisconnectTimeout);
        guestDisconnectTimeout = null;
    }
}

// ============================================================
// Shared: RTC monitoring
// ============================================================

function monitorRTC(conn) {
    function doMonitor(pc) {
        console.log(`[Grog MP] RTCPeerConnection state: ${pc.connectionState}, ICE: ${pc.iceConnectionState}`);
        pc.addEventListener('iceconnectionstatechange', () => console.log(`[Grog MP] ICE state: ${pc.iceConnectionState}`));
        pc.addEventListener('connectionstatechange', () => console.log(`[Grog MP] Connection state: ${pc.connectionState}`));
        pc.addEventListener('icecandidate', (e) => {
            if (e.candidate) {
                console.log(`[Grog MP] ICE candidate: ${e.candidate.candidate}`);
            } else {
                console.log(`[Grog MP] ICE gathering complete`);
            }
        });
    }

    const pc = conn.peerConnection;
    if (pc) {
        doMonitor(pc);
    } else {
        let pollCount = 0;
        const pollInterval = setInterval(() => {
            pollCount++;
            if (conn.peerConnection) {
                doMonitor(conn.peerConnection);
                clearInterval(pollInterval);
            }
            if (pollCount > 50) clearInterval(pollInterval);
        }, 100);
    }
}
