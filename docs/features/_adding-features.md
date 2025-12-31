# Adding New Features

This guide explains where to add different types of game features based on the modular architecture.

## Architecture Overview

The codebase is split into three main areas:

```
src/
├── systems/              # Game logic (runs in update loop)
│   ├── shipMovement.js      - Ship navigation, pathfinding, pirate AI
│   ├── tradeRoutes.js       - Cargo loading/unloading, trade logic
│   ├── construction.js      - Building progress for ports/settlements/towers
│   ├── resourceGeneration.js - Settlement resource production
│   ├── combat.js            - Combat, projectiles, damage, respawns
│   ├── aiPlayer.js          - AI opponent decisions (versus mode)
│   └── inputHandler.js      - Click interaction handlers
│
├── rendering/            # Visual rendering (runs in draw loop)
│   ├── renderContext.js     - Shared context for all renderers
│   ├── renderHelpers.js     - Progress bars, hex outlines, range display
│   ├── tileRenderer.js      - Map tiles, fog of war overlay
│   ├── unitRenderer.js      - Ships, ports, settlements, towers, birds
│   ├── effectsRenderer.js   - Projectiles, explosions, debris, trails
│   ├── selectionUI.js       - Selection indicators, waypoints, paths
│   ├── placementUI.js       - Build mode placement previews
│   ├── uiPanels.js          - Resource panel, info panels, buttons
│   └── index.js             - Re-exports all rendering modules
│
├── sprites/              # Entity definitions and pixel art
│   ├── ships.js, ports.js, settlements.js, towers.js
│   └── index.js             - Re-exports all sprite modules
│
└── scenes/
    └── gameScene.js         - Scene setup, state, input handling, UI panels
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
- Settlement and tower construction progress

### Resource Production
**File:** `src/systems/resourceGeneration.js`

Examples: new resource types, production rates, bonuses

The `updateResourceGeneration()` function handles:
- Settlement resource generation timers
- Resource distribution (global vs port storage)
- Floating number animations

### Combat & Projectiles
**File:** `src/systems/combat.js`

Examples: new weapons, damage types, special attacks

The `updateCombat()` function handles:
- Attack cooldowns and firing
- Projectile movement and hit detection
- Damage application and unit destruction
- Pirate respawn timers

### AI Opponent
**File:** `src/systems/aiPlayer.js`

Examples: AI strategy improvements, new AI behaviors, difficulty levels

The `updateAIPlayer()` function handles:
- Strategic priority adjustments (every 5s)
- Build decisions: ships, settlements, towers (every 3s)
- Ship commands: patrol, chase, attack (every 2s)
- Threat response when attacked

Key helper functions:
- `updateStrategicPriorities()` - Adjusts AI priorities based on power ratio
- `evaluateBuildOptions()` - Decides what to build next
- `updateShipCommands()` - Commands AI ships to patrol/attack
- `findNearestEnemy()` - Finds closest player entity

### Click Interactions
**File:** `src/systems/inputHandler.js`

Examples: new click actions, selection modes, command interactions

Available handler functions:
- `handlePortPlacementClick()` - Port placement mode
- `handleSettlementPlacementClick()` - Settlement placement mode
- `handleTowerPlacementClick()` - Tower placement mode
- `handleShipBuildPanelClick()` - Ship's port-building panel
- `handleBuildPanelClick()` - Port's build panel (ships, upgrades, settlements)
- `handleTradeRouteClick()` - Cmd+click on foreign port
- `handleHomePortUnloadClick()` - Cmd+click on home port with cargo
- `handleUnitSelection()` - Clicking on ships, ports, settlements
- `handleWaypointClick()` - Cmd+click on water/land
- `handleAttackClick()` - Cmd+click on enemy units

---

## Adding Visual Features (Rendering)

Rendering is modularized into focused files under `src/rendering/`.

### New Entity Rendering
**File:** `src/rendering/unitRenderer.js`

Add functions to draw new unit types:
- `drawPorts()`, `drawSettlements()`, `drawTowers()`, `drawShips()`
- `drawFloatingNumbers()`, `drawBirds()`, `drawDockingProgress()`

### New Visual Effects
**File:** `src/rendering/effectsRenderer.js`

Add functions for new effects:
- `drawProjectiles()` - Flying objects with trails
- `drawExplosions()` - Particle effects
- `drawWaterSplashes()` - Impact effects
- `drawShipTrails()` - Movement wake
- `drawFloatingDebris()` - Destruction debris
- `drawHealthBars()` - Health display

### Selection & Placement UI
**Files:** `src/rendering/selectionUI.js`, `src/rendering/placementUI.js`

- Selection indicators for new unit types
- Placement mode previews for new buildings
- Attack range displays

### UI Panels
**File:** `src/rendering/uiPanels.js`

- Resource displays
- Build menus
- Info panels

Use helpers from `renderHelpers.js`:
- `drawProgressBar()` - Generic progress bars
- `drawConstructionProgressBar()` - Building progress
- `drawHealthBar()` - Health bars
- `drawHexRangeFilled()`, `drawHexRangeOutline()` - Range display

### Render Context

All rendering functions receive a shared context object:

```js
const ctx = createRenderContext(k, zoom, cameraX, cameraY);
// ctx contains: k, zoom, cameraX, cameraY, halfWidth, halfHeight,
//               screenWidth, screenHeight, scaledHexSize, HEX_SIZE
```

### Draw Order

Rendering happens in `gameScene.js` `k.onDraw()` in this order:

1. **World tiles:** `drawTiles()`, `drawFogOfWar()`
2. **Buildings:** `drawPorts()`, `drawSettlements()`, `drawTowers()`
3. **Effects behind units:** `drawFloatingNumbers()`, `drawShipTrails()`, `drawFloatingDebris()`
4. **Units:** `drawShips()`
5. **Effects above units:** `drawProjectiles()`, `drawWaterSplashes()`, `drawExplosions()`
6. **Overlays:** `drawHealthBars()`, `drawDockingProgress()`, `drawBirds()`
7. **Selection UI:** `drawAllSelectionUI()`
8. **Placement UI:** `drawAllPlacementUI()`, `drawSelectionBox()`
9. **Screen UI:** `drawSimpleUIPanels()`, build panels

---

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

## Adding a New Renderer

1. Create function in appropriate `src/rendering/*.js` file
2. Accept `ctx` as first parameter
3. Export from the file
4. Add to `src/rendering/index.js` exports
5. Import and call in `gameScene.js` `k.onDraw()`

```js
// src/rendering/effectsRenderer.js
export function drawMyEffect(ctx, effectsArray) {
    const { k, zoom, cameraX, cameraY, halfWidth, halfHeight } = ctx;

    for (const effect of effectsArray) {
        const screenX = (effect.x - cameraX) * zoom + halfWidth;
        const screenY = (effect.y - cameraY) * zoom + halfHeight;

        // Cull off-screen elements
        if (screenX < -50 || screenX > ctx.screenWidth + 50) continue;

        k.drawCircle({ pos: k.vec2(screenX, screenY), ... });
    }
}
```

## Conventions

- Systems receive `dt` (delta time, already scaled by `gameState.timeScale`)
- Systems mutate `gameState` directly (no return values)
- Check `if (dt === 0) return;` at start to handle pause state
- Renderers receive `ctx` as first parameter
- Always cull off-screen elements for performance
- Use `console.log()` for debugging, remove before committing
