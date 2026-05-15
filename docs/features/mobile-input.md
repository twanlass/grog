# Mobile Input

Touch-based input for phones and tablets. Mirrors the desktop interaction set (select, command, pan, zoom, drag-select) using single-finger and multi-finger gestures.

## Gesture Vocabulary

| Gesture | Action | Desktop equivalent |
|---------|--------|--------------------|
| Single tap | Select unit / tap UI / set destination | Left click |
| Single-finger drag | Pan camera | Spacebar + left-drag |
| Pinch | Zoom in / out | Mouse wheel |
| Two-finger drag | Pan camera | Right-drag |
| Long-press (300ms) then release | Issue command (waypoint / attack / trade) | Right click |
| Long-press (300ms) then drag | Selection box (drag-select units) | Left-drag |

The selection box and right-click command share the same starting gesture (hold for 300ms). After the hold:
- **Lift without moving** → fires the right-click command at the hold position.
- **Drag** → grows a selection box from the hold position; on release, units inside are selected.

A short haptic pulse (`navigator.vibrate(15)`) fires when the 300ms hold arms, so players can feel the mode change before deciding to drag or release. In parallel, `drawSelectionBox` renders a fixed-size (~90px) blue hint box centered on the touch point while the selection rect is still degenerate, giving a visual cue that drag-select is now active. Once the finger moves past `DRAG_THRESHOLD` the natural box growth from the start point takes over. iOS Safari silently ignores `navigator.vibrate`, so the visual hint is the only cue there.

## Implementation

### Key files

- `game/src/systems/touchHandler.js` — generic touch event handler. Owns gesture state (pinch, two-finger pan, single-touch drag) and converts raw `touchstart` / `touchmove` / `touchend` into callback events.
- `game/src/scenes/gameScene.js` — wires `touchHandler` callbacks to game actions (selection, commands, camera, zoom). Search for `=== MOBILE TOUCH SUPPORT ===`.

### Touch handler callbacks

`initTouchHandlers(canvas, callbacks)` accepts:

| Callback | Fires when |
|---|---|
| `onTap(x, y)` | Quick tap, no movement, no long-press |
| `onLongPressArm(x, y)` | 300ms hold reached without movement — drag-select mode armed |
| `onLongPress(x, y)` | Armed long-press released without dragging |
| `onSelectionDragStart/Move/End(x, y)` | After arm, finger moves past drag threshold |
| `onDragStart/Move/End(x, y, dx, dy, wasDrag)` | Single-finger drag that started **without** a long-press arm — used for pan |
| `onPinchStart/Move/End(scale, cx, cy)` | Two-finger pinch |
| `onTwoFingerPanStart/Move/End(x, y, dx, dy)` | Two-finger drag |

`isTouchDevice()` detects touch support; `resetTouchState()` clears in-flight gesture state when switching scenes.

### Adding or changing a gesture

1. If the gesture maps to a new event (e.g., three-finger swipe), add detection in `touchHandler.js` and expose a callback.
2. Otherwise wire the existing callback in `gameScene.js`'s `initTouchHandlers({...})` block.
3. When a callback needs the unified mouse-position path (e.g., click handlers that read `k.mousePos()`), set `virtualMousePos = { x, y }` before calling and clear it after — see the existing `onTap` / `onLongPress` wiring.

### Selection box state

Selection box uses the same scene-level variables as desktop drag-select:

- `selectStartX`, `selectStartY`, `selectEndX`, `selectEndY` — screen-space rectangle
- `isSelecting` — whether `drawSelectionBox` renders this frame
- `handleSelectionBox()` — collects units inside the rectangle into `gameState.selectedUnits`

`onLongPressArm` primes `selectStart*` and sets `isSelecting = true` so the box can render immediately (zero size). `onSelectionDragMove` updates `selectEnd*`. `onSelectionDragEnd` calls `handleSelectionBox()` and clears `isSelecting`.

## Edge cases

- **Second finger lands during arm:** when a second touch begins, the armed state is cleared so pinch / two-finger pan take over.
- **Touch cancelled by OS:** `handleTouchCancel` clears all gesture state including `longPressArmed` and `isSelectionDragging`.
- **Scene change mid-gesture:** call `resetTouchState()` from the scene's teardown / new-scene init.
- **`navigator.vibrate` unsupported:** guarded by an `if`; absent haptics fall through silently.

## Tuning knobs

In `touchHandler.js`:

| Constant | Default | Purpose |
|---|---|---|
| `LONG_PRESS_DURATION` | 300ms | Hold time before arming drag-select / right-click |
| `TAP_MOVE_THRESHOLD` | 15px | Movement budget before a touch stops counting as a tap |
| `DRAG_THRESHOLD` | 10px | Movement needed before drag callbacks start firing |
