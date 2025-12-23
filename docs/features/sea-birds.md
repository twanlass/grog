# Sea Birds

Animated birds that circle above the home port, adding visual life to the game world.

## Behavior
- Bird spawns above home port at game start
- Circles the port in a continuous orbit (~20 seconds per revolution)
- Flaps wings at ~4 FPS animation
- Moves with camera pan/zoom (exists in world space)
- Renders above all other units

## Technical Details
- **Sprite:** `game/src/sprites/assets/bird.png`
- **Size:** 64×32 pixels (two 32×32 frames)
- **Scale:** 1× zoom level
- **Orbit radius:** 50 pixels from port center
- **Orbit speed:** 0.3 radians/second

## Files

| File | Purpose |
|------|---------|
| `game/src/main.js` | Loads sprite with `k.loadSprite()` |
| `game/src/scenes/gameScene.js` | State, animation, and rendering |
| `game/src/sprites/assets/bird.png` | Spritesheet (2 frames) |

## Implementation

### Sprite Loading (main.js)
```js
k.loadSprite("bird", "src/sprites/assets/bird.png", {
    sliceX: 2,
    sliceY: 1,
    anims: {
        flap: { from: 0, to: 1, loop: true, speed: 4 },
    },
});
```

### State Structure (gameScene.js)
```js
birdState = {
    q, r,           // Hex coords (home port position)
    frame,          // Current animation frame (0 or 1)
    frameTimer,     // Time since last frame change
    angle,          // Current orbit angle (radians)
    orbitRadius,    // Distance from center (50px)
    orbitSpeed,     // Radians per second (0.3)
}
```

### Rendering Order
1. Terrain tiles
2. Fog overlay
3. Ports
4. Settlements
5. Ships + progress bars
6. **Bird** ← rendered here
7. Selection indicators
8. UI panels

## Parameters
Adjustable in `birdState` initialization:
- `orbitRadius: 50` - Distance from port center
- `orbitSpeed: 0.3` - Speed of orbit (~20s per revolution)

## Notes
- First Kaplay-loaded image sprite in the game (others use pixel arrays)
- Uses manual camera transforms to match existing rendering system
- Animation uses `rawDt` so bird keeps flapping even when game is paused
