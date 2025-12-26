# Trade Routes

Ships can collect resources from foreign ports and automatically transport them to the home port.

## Home Port
The "home port" is determined dynamically:
- The **home island** is the landmass where your first port was placed
- The **home port** is the most recent completed port on that island
- If the home port is destroyed and rebuilt, it automatically becomes the home port again
- Trade routes store the home port index when created

## Behavior
- Select a ship, then Command+click on a foreign port (not home port) to set up a trade route
- Ship navigates to the foreign port and loads available wood/food
- Loading takes 1 second per resource unit
- Once loaded, ship automatically returns to home port to unload
- After unloading, ship returns to foreign port (auto-loop continues indefinitely)
- Command+click a new destination to cancel the trade route

## Resource Flow
1. Foreign ports collect resources from their nearby settlements (+5 wood, +5 food every 30s)
2. Resources are stored in the foreign port's local storage
3. Ships load from `port.storage` into `ship.cargo` (ratio-based)
4. Ships unload from `ship.cargo` into `gameState.resources` (global stockpile)

## Ratio-Based Loading
Ships load resources proportionally based on the foreign port's current ratio:

| Port Storage | Ship Cargo (2) | Result |
|--------------|----------------|--------|
| 5 wood, 5 food | 1 wood, 1 food | 50/50 ratio |
| 8 wood, 2 food | 2 wood, 0 food | 80/20 ratio |
| 0 wood, 10 food | 0 wood, 2 food | 100% food |

The ratio is calculated at the start of loading. If one resource runs out mid-load, the ship takes more of the remaining resource.

## Ship Cargo Capacity

| Ship | Cargo Capacity |
|------|----------------|
| Cutter | 2 |
| Schooner | 4 |
| Brigantine | 6 |
| Galleon | 12 |

## Manual Unload
- If a trade route is interrupted, ships may have cargo with no destination
- Select ship with cargo, Command+click home port to navigate and unload
- Ship shows "RETURNING" status during this one-time unload

## Waiting System
When a dock is occupied by another ship:
- Ship navigates to a nearby water hex (2+ hexes from port)
- Ship enters "WAITING" status
- Every 2 seconds, ship checks if dock is free
- When free, ship navigates to dock and resumes operation

## Status Indicators
Ship info panel (bottom-right) shows current status:

| Status | Color | Meaning |
|--------|-------|---------|
| AUTO-LOOP | Cyan | Active trade route, traveling |
| LOADING | Green | Loading cargo at foreign port |
| UNLOADING | Gold | Unloading cargo at port |
| WAITING | Yellow | Waiting for dock to be free |
| RETURNING | Tan | One-time return to home port |

## Progress Bar
- Appears above ship during loading/unloading
- Green fill for loading, gold fill for unloading
- Duration = cargo units × 1 second per unit

## Files

| File | Purpose |
|------|---------|
| `game/src/gameState.js` | Ship state properties, helper functions |
| `game/src/scenes/gameScene.js` | Trade route state machine, UI, click handling |

## Key Functions

### gameState.js
- `createShip()` - Creates ship with `tradeRoute`, `cargo`, `dockingState`, `waitingForDock`
- `isShipAdjacentToPort(ship, port)` - Checks if ship is in hex adjacent to port
- `getCargoSpace(ship, shipDefs)` - Returns remaining cargo capacity
- `cancelTradeRoute(ship)` - Clears trade route and related state
- `findNearbyWaitingHex(map, portQ, portR, ships)` - Finds water hex for waiting (not adjacent to port)

## Data Structures

### Ship trade route state
```javascript
ship = {
    // ... existing properties
    tradeRoute: { foreignPortIndex: 1, homePortIndex: 0 } | null,
    cargo: { wood: 0, food: 0 },
    dockingState: {
        action: 'loading' | 'unloading',
        progress: 0,
        totalUnits: 4,
        unitsTransferred: 0,
        targetPortIndex: 1,
        // Ratio-based loading (only for 'loading' action)
        targetWood: 2,      // Target wood to load based on port ratio
        targetFood: 2,      // Target food to load
        woodLoaded: 0,      // Wood loaded so far
        foodLoaded: 0,      // Food loaded so far
    } | null,
    waitingForDock: { portIndex: 1, retryTimer: 0 } | null,
    pendingUnload: false,  // For one-time manual unload
}
```

### Port storage (foreign ports only)
```javascript
port.storage = { wood: 0, food: 0 }
```

## State Machine Flow

```
Command+click foreign port with ship selected
    ↓
TRAVELING_TO_FOREIGN (waypoint set)
    ↓
Arrived at foreign port
    ↓
Resources available? ──No──→ Wait (check each frame)
    ↓ Yes
LOADING (dockingState.action = 'loading')
    ↓
Loading complete (cargo full or port empty)
    ↓
TRAVELING_TO_HOME (waypoint to home port)
    ↓
Arrived at home port
    ↓
UNLOADING (dockingState.action = 'unloading')
    ↓
Unloading complete
    ↓
TRAVELING_TO_FOREIGN (auto-loop continues)
```

## Edge Cases
- **Dock occupied**: Ship waits nearby, retries every 2 seconds
- **No waiting spot available**: Ship waits in place
- **Foreign port empty**: Ship waits at dock until resources generated
- **Trade route cancelled**: Command+click any other destination, route cleared
- **Foreign port destroyed**: Trade route cancelled
- **Home port destroyed**: Trade route continues if another port is built on home island
- **No home port exists**: Cannot create new trade routes
- **Ship stuck**: Catch-all logic re-navigates ship to appropriate port
- **Multiple ships same route**: Each operates independently
- **Pathfinding fails**: Ship enters waiting mode, retries navigation

## Constants

| Constant | Value | Location |
|----------|-------|----------|
| `LOAD_TIME_PER_UNIT` | 1.0 seconds | gameScene.js |
| `DOCK_RETRY_INTERVAL` | 2.0 seconds | gameScene.js |
| `GENERATION_INTERVAL` | 30 seconds | gameScene.js |
| `GENERATION_AMOUNT` | 5 (wood + food) | gameScene.js |
