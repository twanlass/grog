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

### Combat
- Completed towers automatically fire at pirates within 3 hexes
- Towers fire every 4 seconds (fireCooldown)
- Each shot deals 5 damage (same as ships)
- Towers have 30 HP and can be destroyed by pirates
- Towers show a health bar when selected or in combat
- Hit flash effect when taking damage

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
- `buildTime`: 15 seconds
- `health`: 30 HP
- `cost`: 25 wood
- `attackRange`: 3 hexes
- `fireCooldown`: 4 seconds
- `damage`: 5 per shot
- `sightDistance`: 3 hexes (fog reveal on completion)
- `MAX_TOWER_BUILD_DISTANCE`: 5 hexes from ship

## Edge Cases
- **Ship already building port/tower**: Build panel hidden
- **Port already building tower**: Tower button disabled
- **Can't afford (< 25 wood)**: Button greyed out, red cost text
- **Builder ship destroyed**: Construction cancelled, tower removed
- **Tower destroyed**: Cleaned up from arrays, pirate AI retargets
- **Game paused**: Construction and attacks pause (uses timeScale)
