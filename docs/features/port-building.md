# Port Building

Ships can construct new ports when docked at shore. This allows players to expand their territory.

## Behavior

### Docking
- A ship is "docked" when:
  - On a water hex adjacent to land
  - Stationary (no active waypoint)
- Any stationary ship shows the "BUILD PORT" panel (bottom-left), even when not adjacent to land. Clicking a valid shore sails the ship to a water hex adjacent to it and builds on arrival; a ship already docked there builds immediately (see Sail-and-build below).

### Placement Mode
- Click a port type in the panel to enter placement mode
- Green highlights show valid shore hexes within placement range (≤5 hexes of the ship); amber highlights show valid shores farther out
- Brighter highlight on currently hovered hex
- A port is always built from a water hex **directly adjacent to the chosen shore**. Click any valid shore (green or amber) and the ship sails there to build — green just means a shorter trip
- If the ship is already docked adjacent to the clicked shore, construction starts immediately
- Press ESC or right-click to cancel

### Sail-and-build
- Clicking a shore the ship isn't already docked at sets a waypoint to the nearest water tile adjacent to the target and stores `ship.pendingBuild = { portType, q, r }`
- Resource cost is **not** deducted until the build actually starts (on arrival), so a player who runs out of resources mid-voyage will simply wait at the target until they can afford it
- On each frame, the construction system checks ships with `pendingBuild`. When the ship is stationary AND docked adjacent (within `PORT_DOCK_DISTANCE`, 1 hex) of the target AND the site is still valid AND affordable, construction starts automatically
- If the target site becomes invalid mid-voyage (another player/AI built there), the intent is cleared with a "Build site no longer available" notification
- Issuing a manual move (Cmd+click), attack click, or attack command to the ship clears its `pendingBuild` — the new command overrides the deferred build

### Construction
- Port appears semi-transparent with "BUILDING" label and progress bar
- Progress bar is teal/blue (distinct from ship building's amber)
- Ports under construction cannot build ships
- Fog of war reveals only when construction completes
- **Builder ship is locked** - cannot move until construction completes
- **One port at a time** - ship cannot start another port while building

### Cancelling
- While a port is under construction (or upgrading), selecting it shows a "Cancel Build" / "Cancel Upgrade" button in the construction status panel
- Cancelling a new build removes the in-progress port and refunds the full wood cost
- Cancelling an upgrade clears the upgrade progress, leaves the port at its current tier, and refunds the upgrade cost

## Costs

Ports require wood to build. Cost is deducted when construction actually starts — on arrival for a sail-and-build, or immediately if the ship is already docked.

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
- Construction only starts once the ship is docked on water adjacent to the shore (it sails there first if needed)
- Cannot place where a port already exists
- Ship must not already be building a port
- Must be able to afford the wood cost (checked when construction starts)

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

### combat.js
- `cancelPortConstruction(gameState, portIndex, resources, fogState)` - Cancels an in-progress port build (removes the port) or upgrade (clears construction state). Refunds the cost to the supplied resources object and returns `true` on success.

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
