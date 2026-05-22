# Tower Building

Ships can construct defensive towers on nearby land. Towers automatically attack pirates within range.

## Behavior

### Placement
- Select a docked ship (adjacent to land) to see the build panel
- Click "Tower" in the BUILD DEFENSE section to enter placement mode
- Green highlights show valid placement hexes (land within range)
- Click a valid hex to start construction (costs 25 wood)
- Press ESC or right-click to cancel

### Construction
- Tower appears semi-transparent with "BUILDING" label and progress bar
- Progress bar is cyan/blue
- Construction takes 15 seconds
- Ship must remain docked during construction (moving cancels it)
- Fog of war reveals (3-hex radius) when construction completes

### Cancelling
- Selecting a tower while it is building or upgrading shows a "Cancel Build" / "Cancel Upgrade" button in the tower info panel
- Cancelling a new build removes the tower and refunds the wood cost (and frees the crew slot it had reserved)
- Cancelling an upgrade clears the upgrade progress, keeps the tower at its current tier, and refunds the upgrade cost

### Combat
- Completed combat towers automatically fire at enemies within their `attackRange`
- Per-tier stats (see `TOWERS` in `sprites/towers.js`):
  - **Watchtower** — scout only, no weapons; 40 HP
  - **Crossbow Tower** — 3 arrows per volley, 2 damage each, every 3s, range 4; 60 HP
  - **Cannon Battery** — 2 cannonballs per volley, 5 damage each, every 4s, range 5; 100 HP
- Multi-shot volleys are staggered: first shot fires immediately, remaining shots queue into `tower.pendingShots` with per-tower `staggerDelay` (falls back to `SHOT_STAGGER_DELAY` = 0.3s)
- Crossbow shots render as low-arc brown arrows (`projectileType: 'arrow'`); other shots render as cannonballs with fiery trails
- Towers show a health bar when selected or in combat; hit flash on damage

## Restrictions
- Ship can only build one thing at a time (port or tower)
- Port can only build one tower at a time
- Must be placed on land hex within 5 hexes of ship
- Cannot place on hex already occupied by port, settlement, or tower
- Requires 25 wood

## Files

| File | Purpose |
|------|---------|
| `game/src/sprites/towers.js` | Tower sprite and metadata |
| `game/src/gameState.js` | Tower creation, placement mode, validation |
| `game/src/systems/inputHandler.js` | Placement click handling, UI button clicks |
| `game/src/systems/construction.js` | Construction progress updates |
| `game/src/systems/combat.js` | Tower attacks, damage, destruction |
| `game/src/systems/shipMovement.js` | Pirate AI targeting towers |
| `game/src/scenes/gameScene.js` | Rendering, UI, selection, placement highlights |

## Key Functions

### gameState.js
- `createTower(type, q, r, isConstructing, builderShipIndex, builderPortIndex)` - Creates tower with health and cooldown
- `enterTowerBuildMode(gameState, shipIndex)` - Activates placement mode
- `exitTowerBuildMode(gameState)` - Cancels/exits placement mode
- `isValidTowerSite(map, q, r, towers, ports, settlements)` - Checks if hex is valid
- `isShipBuildingTower(shipIndex, towers)` - Returns true if ship is building a tower
- `isPortBuildingTower(portIndex, towers)` - Returns true if port is building a tower

### combat.js
- `handleTowerAttacks(gameState, dt)` - Towers auto-fire at nearest pirate in range
- `destroyTower(gameState, towerIndex)` - Removes tower and cleans up references
- `cancelTowerConstruction(gameState, towerIndex, resources, fogState)` - Cancels an in-progress tower build (removes the tower) or upgrade (clears construction state). Refunds the cost and returns `true` on success.

### inputHandler.js
- `handleTowerPlacementClick(gameState)` - Handles click to place tower

## Data Structures

### Tower
```javascript
tower = {
    type: 'tower',
    q, r,
    health: 30,
    attackCooldown: 0,           // Timer for next shot
    hitFlash: 0,                 // Flash effect timer
    construction: {
        progress: 0,
        buildTime: 15,
        builderShipIndex: 0,     // Ship building this tower (null if port)
        builderPortIndex: null,  // Port building this tower (null if ship)
    } | null,
}
```

### Placement mode state
```javascript
gameState.towerBuildMode = {
    active: false,
    builderShipIndex: null,
    hoveredHex: null,
}
```

### Tower metadata (sprites/towers.js)
```javascript
TOWERS = {
    tower: {
        name: "Tower",
        sprite: TOWER,
        buildTime: 15,
        health: 30,
        cost: { wood: 25 },
        attackRange: 3,      // hexes
        fireCooldown: 4,     // seconds between shots
        damage: 5,
        sightDistance: 3,
    },
}
```

## Constants
- `buildTime`: 15 seconds (all tiers)
- `cost`: 25 wood (all tiers)
- `MAX_TOWER_BUILD_DISTANCE`: 5 hexes from ship
- Per-tier `health` / `attackRange` / `fireCooldown` / `damage` / `projectileCount` / `staggerDelay` / `sightDistance` live in `TOWERS` in `game/src/sprites/towers.js` — see Combat above for the current numbers

## Edge Cases
- **Ship already building port/tower**: Build panel hidden
- **Port already building tower**: Tower button disabled
- **Can't afford (< 25 wood)**: Button greyed out, red cost text
- **Builder ship destroyed**: Construction cancelled, tower removed
- **Tower destroyed**: Cleaned up from arrays, pirate AI retargets
- **Game paused**: Construction and attacks pause (uses timeScale)
