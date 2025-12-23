# Port Building

Ships can construct new ports when docked at shore. This allows players to expand their territory.

## Behavior

### Docking
- A ship is "docked" when:
  - On a water hex adjacent to land
  - Stationary (no active waypoint)
- Docked ships show a "BUILD PORT" panel (bottom-left)

### Placement Mode
- Click a port type in the panel to enter placement mode
- Green highlights show valid placement hexes (shore hexes within range)
- Brighter highlight on currently hovered hex
- Click a valid hex to start construction
- Press ESC or right-click to cancel

### Construction
- Port appears semi-transparent with "BUILDING" label and progress bar
- Progress bar is teal/blue (distinct from ship building's amber)
- Ports under construction cannot build ships
- Fog of war reveals only when construction completes
- **Builder ship is locked** - cannot move until construction completes
- **One port at a time** - ship cannot start another port while building

## Costs

Ports require wood to build. Costs are deducted when placement is confirmed.

| Port Type | Wood | Build Time |
|-----------|------|------------|
| Dock | 20 | 25s |
| Port | 50 | 100s |
| Stronghold | 100 | 200s |

## Port Storage

Non-home ports (built during gameplay) have local resource storage:
- Settlements attached to built ports deposit resources into `port.storage`
- Storage displayed at top of build panel when port is selected
- Resources must be collected by ships (future feature)

## Restrictions
- Can only place on shore hexes (land adjacent to water)
- Must be within max build distance of the ship (5 hexes)
- Cannot place where a port already exists
- Ship must not already be building a port
- Must be able to afford the wood cost

## Files

| File | Purpose |
|------|---------|
| `game/src/gameState.js` | Placement mode state, port creation, validation |
| `game/src/scenes/gameScene.js` | UI rendering, click handling, construction updates |
| `game/src/sprites/ports.js` | Port definitions with `buildTime` and `cost` |
| `game/src/hex.js` | `hexDistance` for range checking |

## Key Functions

### gameState.js
- `createPort(type, q, r, isConstructing, builderShipIndex)` - Creates port with `storage: { wood: 0, food: 0 }`
- `enterPortBuildMode(gameState, shipIndex, portType)` - Activates placement mode
- `exitPortBuildMode(gameState)` - Cancels/exits placement mode
- `isValidPortSite(map, q, r, existingPorts)` - Checks if hex is valid for port placement
- `isShipBuildingPort(shipIndex, ports)` - Returns true if ship is currently building a port
- `canAfford(resources, cost)` - Checks if player has enough resources
- `deductCost(resources, cost)` - Subtracts cost from resources

## Data Structures

### Port with storage
```javascript
port = {
    type: 'dock',
    q, r,
    buildQueue: null,
    storage: { wood: 0, food: 0 },  // Local resource storage
    construction: {
        progress: 0,
        buildTime: 25,
        builderShipIndex: 0,
    } | null,
}
```

### Placement mode state
```javascript
gameState.portBuildMode = {
    active: false,
    builderShipIndex: null,
    portType: null,
    hoveredHex: null,
}
```

## Edge Cases
- **Can't afford**: Button greyed out, costs shown in red
- **Ship moves during placement**: Placement mode stays active
- **Hex already occupied**: Validation prevents placement
- **Port under construction selected**: Shows "UNDER CONSTRUCTION" panel
- **Game paused**: Construction progress pauses (uses timeScale)
- **Builder ship given waypoint**: Movement command ignored until construction completes
