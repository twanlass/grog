// State snapshot extraction and application for multiplayer sync
// Host extracts snapshots at 10Hz, guest applies them to reconcile state

/**
 * Extract a network-safe state snapshot from the full game state.
 * Strips rendering-only data, keeps positions/health/construction/resources.
 * @param {Object} gameState - The full game state
 * @returns {Object} - Serializable snapshot
 */
export function extractNetworkState(gameState) {
    return {
        // Resources
        resources: { ...gameState.resources },
        player2Resources: gameState.player2Resources ? { ...gameState.player2Resources } : null,

        // Ships (strip rendering-only fields)
        ships: gameState.ships.map(s => ({
            id: s.id,
            owner: s.owner,
            type: s.type,
            q: s.q,
            r: s.r,
            waypoints: s.waypoints,
            path: s.path,
            moveProgress: s.moveProgress,
            heading: s.heading,
            tradeRoute: s.tradeRoute,
            cargo: s.cargo ? { ...s.cargo } : { wood: 0 },
            dockingState: s.dockingState,
            pendingUnload: s.pendingUnload,
            isPlundering: s.isPlundering,
            waitingForDock: s.waitingForDock,
            health: s.health,
            attackCooldown: s.attackCooldown,
            attackTarget: s.attackTarget,
            repair: s.repair,
            patrolRoute: s.patrolRoute,
            isPatrolling: s.isPatrolling,
            guardMode: s.guardMode,
            aiState: s.aiState,
            aiTarget: s.aiTarget,
        })),

        // Ports
        ports: gameState.ports.map(p => ({
            id: p.id,
            owner: p.owner,
            type: p.type,
            q: p.q,
            r: p.r,
            buildQueue: p.buildQueue,
            storage: p.storage ? { ...p.storage } : { wood: 0 },
            rallyPoint: p.rallyPoint,
            construction: p.construction,
            health: p.health,
            repair: p.repair,
        })),

        // Settlements
        settlements: gameState.settlements.map(s => ({
            id: s.id,
            owner: s.owner,
            q: s.q,
            r: s.r,
            parentPortIndex: s.parentPortIndex,
            generationTimer: s.generationTimer,
            health: s.health,
            construction: s.construction,
        })),

        // Towers
        towers: gameState.towers.map(t => ({
            id: t.id,
            owner: t.owner,
            type: t.type,
            q: t.q,
            r: t.r,
            health: t.health,
            attackCooldown: t.attackCooldown,
            construction: t.construction,
            repair: t.repair,
        })),

        // Projectiles
        projectiles: gameState.projectiles.map(p => ({
            sourceShipIndex: p.sourceShipIndex,
            targetType: p.targetType,
            targetIndex: p.targetIndex,
            fromQ: p.fromQ,
            fromR: p.fromR,
            toQ: p.toQ,
            toR: p.toR,
            progress: p.progress,
            damage: p.damage,
            speed: p.speed,
        })),

        // Visual effects (lightweight, for guest rendering)
        shipExplosions: gameState.shipExplosions,
        floatingDebris: gameState.floatingDebris,
        waterSplashes: gameState.waterSplashes,
        lootDrops: gameState.lootDrops,
        woodSplinters: gameState.woodSplinters,
        cannonSmoke: gameState.cannonSmoke,

        // Game state
        gameOver: gameState.gameOver,
        notification: gameState.notification,
        homeIslandHex: gameState.homeIslandHex,

        // Pirate state
        pirateKills: gameState.pirateKills,
    };
}

/**
 * Apply a network state snapshot to the guest's local game state.
 * Reconciles entities by ID, preserving local-only state (selection, build modes).
 * @param {Object} gameState - The local game state to update
 * @param {Object} snapshot - The state snapshot from the host
 */
export function applyNetworkState(gameState, snapshot) {
    // Resources
    gameState.resources = snapshot.resources;
    if (snapshot.player2Resources) {
        gameState.player2Resources = snapshot.player2Resources;
    }

    // Reconcile ships by ID
    gameState.ships = reconcileEntities(gameState.ships, snapshot.ships);

    // Reconcile ports by ID
    gameState.ports = reconcileEntities(gameState.ports, snapshot.ports);

    // Reconcile settlements by ID
    gameState.settlements = reconcileEntities(gameState.settlements, snapshot.settlements);

    // Reconcile towers by ID
    gameState.towers = reconcileEntities(gameState.towers, snapshot.towers);

    // Direct copy for simple arrays
    gameState.projectiles = snapshot.projectiles;
    gameState.shipExplosions = snapshot.shipExplosions || [];
    gameState.floatingDebris = snapshot.floatingDebris || [];
    gameState.waterSplashes = snapshot.waterSplashes || [];
    gameState.lootDrops = snapshot.lootDrops || [];
    gameState.woodSplinters = snapshot.woodSplinters || [];
    gameState.cannonSmoke = snapshot.cannonSmoke || [];

    // Game state
    gameState.gameOver = snapshot.gameOver;
    gameState.notification = snapshot.notification;
    gameState.homeIslandHex = snapshot.homeIslandHex;
    gameState.pirateKills = snapshot.pirateKills;

    // Update selected unit indices (they may have shifted due to entity add/remove)
    updateSelectionIndices(gameState);
}

/**
 * Reconcile a local entity array with a snapshot array by ID.
 * Preserves local-only fields (like animation state) when entities match.
 * @param {Array} localEntities - Current local entities
 * @param {Array} snapshotEntities - Entities from snapshot
 * @returns {Array} - Reconciled entity array
 */
function reconcileEntities(localEntities, snapshotEntities) {
    // Build ID→local entity map for quick lookup
    const localById = new Map();
    for (const entity of localEntities) {
        if (entity.id) localById.set(entity.id, entity);
    }

    // Build new array from snapshot, merging local-only fields
    return snapshotEntities.map(snapEntity => {
        const local = localById.get(snapEntity.id);
        if (local) {
            // Merge: snapshot fields override, but keep local-only rendering fields
            return {
                ...snapEntity,
                // Preserve local-only rendering state
                animFrame: local.animFrame || 0,
                animTimer: local.animTimer || 0,
                hitFlash: local.hitFlash || 0,
            };
        }
        // New entity from host — add with default rendering state
        return {
            ...snapEntity,
            animFrame: 0,
            animTimer: 0,
            hitFlash: 0,
        };
    });
}

/**
 * After reconciliation, selection indices may be stale (entities reordered/removed).
 * Update selectedUnits indices based on entity IDs.
 */
function updateSelectionIndices(gameState) {
    if (!gameState.selectedUnits || gameState.selectedUnits.length === 0) return;

    // Build ID→index maps
    const shipIdToIndex = new Map();
    gameState.ships.forEach((s, i) => { if (s.id) shipIdToIndex.set(s.id, i); });
    const portIdToIndex = new Map();
    gameState.ports.forEach((p, i) => { if (p.id) portIdToIndex.set(p.id, i); });
    const settlementIdToIndex = new Map();
    gameState.settlements.forEach((s, i) => { if (s.id) settlementIdToIndex.set(s.id, i); });
    const towerIdToIndex = new Map();
    gameState.towers.forEach((t, i) => { if (t.id) towerIdToIndex.set(t.id, i); });

    // We need to store entity IDs on selection entries for this to work
    // For now, just validate that indices are still in range
    gameState.selectedUnits = gameState.selectedUnits.filter(sel => {
        if (sel.type === 'ship') return sel.index < gameState.ships.length;
        if (sel.type === 'port') return sel.index < gameState.ports.length;
        if (sel.type === 'settlement') return sel.index < gameState.settlements.length;
        if (sel.type === 'tower') return sel.index < gameState.towers.length;
        return false;
    });
}
