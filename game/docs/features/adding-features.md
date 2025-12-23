# Adding New Features

This guide explains where to add different types of game features based on the modular architecture.

## Architecture Overview

The game logic is split into focused system modules under `src/systems/`:

```
src/
├── systems/
│   ├── shipMovement.js      - Ship navigation and pathfinding
│   ├── tradeRoutes.js       - Cargo loading/unloading, trade logic
│   ├── construction.js      - Building progress for ports and farms
│   ├── resourceGeneration.js - Farm resource production
│   └── inputHandler.js      - Click interaction handlers
└── scenes/
    └── gameScene.js         - Rendering, UI panels, camera, scene setup
```

## Where to Add Features

### Ship Behavior
**File:** `src/systems/shipMovement.js`

Examples: new movement patterns, ship abilities, visibility mechanics

The `updateShipMovement()` function handles:
- Waypoint navigation and pathfinding
- Collision avoidance with other ships
- Fog of war revelation on movement
- Water trail animation

### Trade & Cargo Mechanics
**File:** `src/systems/tradeRoutes.js`

Examples: new cargo types, trading rules, dock priorities

The `updateTradeRoutes()` function handles:
- Docking state machine (approaching, loading, unloading)
- Cargo transfer between ships and ports
- Dock waiting and retry logic

### Building & Construction
**File:** `src/systems/construction.js`

Examples: new building types, construction requirements, build queues

The `updateConstruction()` function handles:
- Port ship-building queue progress
- Port construction and upgrade progress
- Farm construction progress

### Resource Production
**File:** `src/systems/resourceGeneration.js`

Examples: new resource types, production rates, bonuses

The `updateResourceGeneration()` function handles:
- Farm resource generation timers
- Resource distribution (global vs port storage)
- Floating number animations

### Click Interactions
**File:** `src/systems/inputHandler.js`

Examples: new click actions, selection modes, command interactions

Available handler functions:
- `handlePortPlacementClick()` - Port placement mode
- `handleFarmPlacementClick()` - Farm placement mode
- `handleShipBuildPanelClick()` - Ship's port-building panel
- `handleBuildPanelClick()` - Port's build panel (ships, upgrades, farms)
- `handleTradeRouteClick()` - Cmd+click on foreign port
- `handleHomePortUnloadClick()` - Cmd+click on home port with cargo
- `handleUnitSelection()` - Clicking on ships, ports, farms
- `handleWaypointClick()` - Cmd+click on water/land

### UI Panels & Rendering
**File:** `src/scenes/gameScene.js`

Examples: new UI panels, visual effects, status indicators

The `k.onDraw()` callback handles all rendering in layer order:
1. Terrain tiles
2. Fog of war overlay
3. Ports and farms
4. Ships and trails
5. Selection indicators
6. Placement mode highlights
7. UI panels (resources, build options)

## Adding a New System

If your feature doesn't fit existing systems, create a new module:

1. Create `src/systems/yourSystem.js`
2. Export an update function: `export function updateYourSystem(gameState, ...args, dt)`
3. Import and call it in `gameScene.js` inside `k.onUpdate()`

```js
// In gameScene.js
import { updateYourSystem } from "../systems/yourSystem.js";

k.onUpdate(() => {
    // ... existing systems ...
    updateYourSystem(gameState, map, dt);
});
```

## Conventions

- Systems receive `dt` (delta time, already scaled by `gameState.timeScale`)
- Systems mutate `gameState` directly (no return values)
- Check `if (dt === 0) return;` at start to handle pause state
- Use `console.log()` for debugging, remove before committing
- Helper functions can be local to the module or exported if reused
