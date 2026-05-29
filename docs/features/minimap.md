# Minimap

A circular minimap in the bottom-right corner shows explored terrain, the camera
viewport, and off-screen attack alerts. It also accepts clicks for navigation and,
when an action mode is active, for issuing orders at distant map locations.

## Rendering

`drawMinimap()` in `rendering/minimap.js` draws (in order):

1. Black background circle (unexplored)
2. Explored/visible tiles (terrain color when visible, dim gray when only explored)
3. Camera viewport rectangle (red outline)
4. Off-screen attack alerts — pulsing red border + flashing X markers at attacked
   island centers (see `gameState.attackedStructures`)

Tile positions are pre-computed once in `createMinimapState()` and color-cached;
the cache is rebuilt only when the explored-hex count changes. Diameter is smaller
on touch devices (`getMinimapDiameter()`).

## Click → World

`minimapClickToWorld(mouseX, mouseY, minimapBounds, minimapState)` returns
`{ hit, worldX, worldY }`. It rejects clicks outside the circle, then maps the
in-circle position to world coordinates using the cached world bounds.

`drawMinimap()` returns `minimapBounds` each frame (center, radius, map origin,
draw size); `gameScene.js` stashes it in `minimapBounds` for the click handlers.

## Interactions

| Input | Behavior |
|-------|----------|
| Left-click (desktop) / tap (mobile), no action mode | Recenter camera on that location |
| Double-tap (mobile) | Snap camera home (`snapCameraHome()`) |
| Left-click / tap **with an action mode active** | Issue that order at the clicked location instead of moving the camera |

### Action clicks (`handleMinimapActionClick`)

When `gameState.actionMode.active` is set and the minimap is clicked, the order is
applied at the clicked hex rather than navigating the camera. This lets you e.g.
press **A** then click the far side of the map to send a scout out on attack-move
without leaving your current view.

Because the minimap can't resolve a precise unit, every supported mode is
**location-based**:

| Mode | Order issued |
|------|--------------|
| `move` | Waypoint at the location (`handleWaypointClick`), then exit mode |
| `attack` | **Attack-move**: waypoint + `guardMode = true` so ships auto-acquire enemies en route, then exit mode |
| `patrol` | Append a patrol waypoint (`handlePatrolWaypointClick`); stays in mode for more points |
| `rally` | Set selected port rally point (`handlePortRallyPointClick`), then exit mode |
| `broadside` | Not supported (needs a precise enemy target) — falls back to camera navigation |

Multiplayer guests send the same commands as the equivalent world-click paths
(`MOVE_SHIPS`, `SET_PATROL`, `SET_RALLY`). If the underlying handler can't act
(e.g. no reachable water for the location), the click falls back to camera
navigation.

## Files

| File | Purpose |
|------|---------|
| `game/src/rendering/minimap.js` | `createMinimapState`, `drawMinimap`, `minimapClickToWorld`, `getMinimapDiameter` |
| `game/src/scenes/gameScene.js` | `minimapBounds` capture, desktop/mobile click routing, `handleMinimapActionClick` |
