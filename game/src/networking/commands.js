// Command type definitions for multiplayer communication
// All commands use entity IDs (not array indices) for network safety

// ============================================================
// Command Types (Guest → Host)
// ============================================================

export const COMMAND_TYPES = {
    // Ship movement
    MOVE_SHIPS: 'MOVE_SHIPS',           // { shipIds[], waypoints[], append }
    ATTACK: 'ATTACK',                   // { shipIds[], targetType, targetId }

    // Building
    BUILD_PORT: 'BUILD_PORT',           // { builderShipId, portType, q, r }
    BUILD_SETTLEMENT: 'BUILD_SETTLEMENT', // { builderPortId, q, r }
    BUILD_TOWER: 'BUILD_TOWER',         // { builderShipId?, builderPortId?, q, r }
    BUILD_SHIP: 'BUILD_SHIP',           // { portId, shipType }
    CANCEL_BUILD: 'CANCEL_BUILD',       // { portId, queueIndex }

    // Trade & cargo
    SET_TRADE_ROUTE: 'SET_TRADE_ROUTE', // { shipIds[], foreignPortId, homePortId, isPlunder }
    SET_PATROL: 'SET_PATROL',           // { shipIds[], waypoints[] }
    SET_RALLY: 'SET_RALLY',             // { portId, q, r }
    UNLOAD_CARGO: 'UNLOAD_CARGO',       // { shipIds[], portId }
    PLUNDER: 'PLUNDER',                 // { shipIds[], targetPortId }

    // Upgrades & repair
    UPGRADE_PORT: 'UPGRADE_PORT',       // { portId }
    UPGRADE_TOWER: 'UPGRADE_TOWER',     // { towerId }
    REPAIR: 'REPAIR',                   // { entityType, entityId }

    // Selection (for tracking what guest has selected - not authoritative)
    CANCEL_TRADE_ROUTE: 'CANCEL_TRADE_ROUTE', // { shipIds[] }
};

// ============================================================
// Message Types (bidirectional)
// ============================================================

export const MESSAGE_TYPES = {
    // Connection lifecycle
    GAME_INIT: 'GAME_INIT',             // Host → Guest: map seed, config, positions, playerId
    STATE_SNAPSHOT: 'STATE_SNAPSHOT',     // Host → Guest: full game state snapshot
    PLAYER_COMMAND: 'PLAYER_COMMAND',     // Guest → Host: player action command
    LOBBY_STATE: 'LOBBY_STATE',          // Host → All Guests: lobby player list updates

    // Heartbeat
    PING: 'PING',                        // Either → Either
    PONG: 'PONG',                        // Either → Either

    // Lifecycle
    DISCONNECT: 'DISCONNECT',            // Either → Either
};

// ============================================================
// Command Constructors
// ============================================================

export function createCommand(type, data) {
    return {
        type,
        timestamp: Date.now(),
        ...data,
    };
}

export function createMessage(type, data) {
    return {
        messageType: type,
        timestamp: Date.now(),
        ...data,
    };
}

// Helper: wrap a command in a PLAYER_COMMAND message
export function wrapCommand(command) {
    return createMessage(MESSAGE_TYPES.PLAYER_COMMAND, { command });
}
