# Grog - Project Context for Claude Code

A hex-based naval trading game built with Kaplay.

## Quick Start
```bash
cd game && npm run dev
```

## Project Structure
```
game/
  src/
    main.js           # Entry point, scene registration
    hex.js            # Hex grid utilities (axial coords)
    gameState.js      # Game state management
    mapGenerator.js   # Procedural map generation
    pathfinding.js    # A* pathfinding for hex grids
    fogOfWar.js       # Fog of war state
    systems/
      shipMovement.js      # Ship navigation and pathfinding
      tradeRoutes.js       # Cargo loading/unloading logic
      construction.js      # Port/settlement building progress
      resourceGeneration.js # Settlement resource production
      inputHandler.js      # Click interaction handlers
    scenes/
      gameScene.js    # Main game loop and rendering
      galleryScene.js # Unit showcase
    sprites/
      ships.js        # Ship definitions and pixel art
      ports.js        # Port definitions and pixel art
      settlements.js  # Settlement definitions and pixel art
```

## Feature Documentation
See `docs/features/` for detailed feature docs:
- [Adding Features](docs/features/adding-features.md) - Where to add new game features
- [Fog of War](docs/features/fog-of-war.md)
- [Ship Building](docs/features/ship-building.md)
- [Port Building](docs/features/port-building.md)
- [Settlement Building](docs/features/settlement-building.md)
- [Trade Routes](docs/features/trade-routes.md)

## Key Patterns

### Hex Coordinates
Uses axial (q, r) coordinates. Key utilities in `hex.js`:
- `hexToPixel(q, r)` / `pixelToHex(x, y)` - coordinate conversion
- `hexNeighbors(q, r)` - returns 6 adjacent hexes
- `hexKey(q, r)` - creates "q,r" string for Map/Set keys

### Rendering
All rendering happens in `gameScene.js` via `k.onDraw()`. Layer order:
1. Terrain tiles
2. Fog overlay
3. Ports
4. Ships
5. Selection indicators
6. UI

### Game State
Centralized in `gameState.js`. Ships/ports stored as arrays with `{type, q, r}` objects.
