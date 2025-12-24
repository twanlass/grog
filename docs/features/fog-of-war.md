# Fog of War

Shrouds unexplored areas in darkness. Ships and settlements reveal the map.

## Behavior
- Game starts with entire map covered in fog
- Ports reveal a 2-hex radius at game start
- Ships reveal based on their `sightDistance` stat:
  - Cutter: 1 hex
  - Schooner: 1 hex
  - Brigantine: 2 hexes
  - Galleon: 3 hexes
- Ships reveal their sight radius as they move to new hexes
- Settlements reveal a 3-hex radius when construction completes
- Revealed areas stay permanently visible

## Visual Style
- Dark base polygon (rgb 15, 20, 30) at 0.92 opacity
- Diagonal hatching pattern overlay (rgb 25, 35, 50) at 0.4 opacity
- Hatching scales with zoom level

## Files

| File | Purpose |
|------|---------|
| `game/src/fogOfWar.js` | State management module |
| `game/src/scenes/gameScene.js` | Integration and rendering |
| `game/src/sprites/ships.js` | Ship `sightDistance` values |
| `game/src/sprites/settlements.js` | Settlement `sightDistance` value |

## Key Functions

### fogOfWar.js
- `createFogState()` - Creates `{ revealedHexes: Set }`
- `revealRadius(fogState, q, r, radius)` - Reveals hex + all hexes within radius
- `isHexRevealed(fogState, q, r)` - Check if hex is visible
- `initializeFog(fogState, gameState)` - Reveal around initial units

### gameScene.js Integration Points
- **Initialization**: Fog state initialized after game state
- **Ship movement**: `revealRadius()` called when ship moves to new hex
- **Settlement completion**: `revealRadius()` called with settlement's `sightDistance`
- **Rendering**: Fog drawn after terrain, before units

## Rendering Order
1. Terrain tiles
2. Fog overlay (unrevealed hexes only)
3. Ports
4. Settlements
5. Floating numbers
6. Ships
7. UI
