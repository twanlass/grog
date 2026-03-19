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
      combat.js            # Combat, projectiles, damage
      aiPlayer.js          # AI opponent decisions (versus mode)
      inputHandler.js      # Click interaction handlers
    networking/
      peerConnection.js    # WebRTC/PeerJS connection lifecycle
      commands.js          # Command/message type definitions
      commandProcessor.js  # Host-side guest command execution
      stateSync.js         # State snapshot extraction/application
    scenes/
      gameScene.js    # Main game loop and rendering
      multiplayerLobbyScene.js # Multiplayer lobby UI
      galleryScene.js # Unit showcase
    sprites/
      ships.js        # Ship definitions and pixel art
      ports.js        # Port definitions and pixel art
      settlements.js  # Settlement definitions and pixel art
      towers.js       # Tower definitions and pixel art
```

## Feature Documentation
See `docs/features/` for detailed feature docs. **Read the relevant feature doc before modifying a feature** to understand the data structures, key functions, and edge cases.

- [Adding Features](docs/features/adding-features.md) - Where to add new game features
- [AI Opponent](docs/features/ai-opponent.md) - Versus mode AI
- [Fog of War](docs/features/fog-of-war.md)
- [Multiplayer](docs/features/multiplayer.md) - P2P WebRTC multiplayer via PeerJS
- [Ship Building](docs/features/ship-building.md)
- [Port Building](docs/features/port-building.md)
- [Settlement Building](docs/features/settlement-building.md)
- [Tower Building](docs/features/tower-building.md)
- [Trade Routes](docs/features/trade-routes.md)
- [Patrol Routes](docs/features/patrol.md)
- [Repair](docs/features/repair.md)
- [Tooltips](docs/features/tooltips.md)

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
