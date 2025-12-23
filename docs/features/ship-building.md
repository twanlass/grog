# Ship Building

Ports can construct new ships. Different port types unlock different ship classes.

## Behavior
- Select a port to see the build panel (bottom-left)
- Click a ship type to start construction (if affordable and port not busy)
- Progress bar appears above the port during building
- Ship spawns on adjacent water hex when complete
- If no free water hex, build waits until space is available

## Costs

Ships require wood and food to build. Costs are deducted when construction starts.

| Ship | Wood | Food | Build Time |
|------|------|------|------------|
| Cutter | 10 | 5 | 5s |
| Schooner | 25 | 10 | 10s |
| Brigantine | 50 | 20 | 25s |
| Galleon | 100 | 30 | 50s |

## Port Types & Buildable Ships

| Port Type | Can Build |
|-----------|-----------|
| Dock | Cutter |
| Port | Cutter, Schooner |
| Stronghold | Cutter, Schooner, Brigantine, Galleon |

## Restrictions
- Port can only build one thing at a time (ship, settlement, or upgrade)
- Ships greyed out if can't afford or port is busy
- Costs shown next to each ship option (e.g., "10w 5f | 5s")

## Visual Style
- Build panel: Dark background (rgb 20,30,40), opacity 0.9, radius 6
- Progress bar: 40px wide, 6px tall, amber fill (rgb 220,180,80)
- Buttons highlight on hover (rgb 60,80,100)
- Greyed out: rgb 80,80,80 text, rgb 120,60,60 costs

## Files

| File | Purpose |
|------|---------|
| `game/src/gameState.js` | Build state, `canAfford`, `deductCost` |
| `game/src/scenes/gameScene.js` | UI rendering, progress updates, click handling |
| `game/src/sprites/ships.js` | Ship definitions with `build_time` and `cost` |
| `game/src/sprites/ports.js` | Port definitions with `canBuild` arrays |

## Key Functions

### gameState.js
- `createPort(type, q, r)` - Creates port with `buildQueue: null`
- `getBuildableShips(port)` - Returns array of ship types port can build
- `startBuilding(port, shipType)` - Initializes build queue with progress tracking
- `findFreeAdjacentWater(map, q, r, ships)` - Finds unoccupied water hex for spawning
- `canAfford(resources, cost)` - Checks if player has enough resources
- `deductCost(resources, cost)` - Subtracts cost from resources

## Data Structures

### Ship cost
```javascript
SHIPS.cutter = {
    name: "Cutter",
    build_time: 5,
    cost: { wood: 10, food: 5 },
    // ...
}
```

### Port buildQueue
```javascript
port.buildQueue = {
    shipType: 'cutter',
    progress: 0,
    buildTime: 5,
} | null
```

## Edge Cases
- **No free water**: Build stays at 100% until hex becomes available
- **Already building**: Panel shows "Building: [Ship] (X%)" instead of buttons
- **Can't afford**: Button greyed out, costs shown in red
- **Port busy (building settlement)**: All ship buttons greyed out
- **Game paused**: Build progress pauses (uses timeScale)
