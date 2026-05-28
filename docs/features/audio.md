# Audio

Centralized sound playback with per-category volume controls (Music + SFX).

## Categories

- **Music**: composed background tracks — title music, mode-card stingers, and the in-game `ambient-music` loop.
- **SFX**: everything else — UI clicks, ship selection, cannon fire/impact, arrow fire, port waypoint, and the looping `ambient-ocean` ambience.

## Controls

Open the in-game menu panel (`/` key or the menu button) and adjust the two sliders under the AUDIO section. Values 0-100% are clamped per category and persisted to `localStorage` under the key `grog.audio.v1`.

- Desktop: click+drag on a slider track.
- Touch: tap anywhere on a slider track to jump the thumb.

Opening the controls panel pauses the game (`timeScale = 0`) but the ambient music and ocean loops keep playing so the sliders give live audible feedback while dragging. Auto-pausing ambient audio is suppressed for as long as `menuPanelOpen` is true (see `gameScene.js`).

## Implementation

`src/audio.js` exports:

- `playMusic(k, name, opts)` / `playSfx(k, name, opts)` — wrap `k.play()`, multiplying the caller's `opts.volume` by the current category multiplier.
- `getMusicVolume()` / `getSfxVolume()` — read current values (0.0-1.0).
- `setMusicVolume(v)` / `setSfxVolume(v)` — clamp + persist + update any tracked looping handles live so slider drags change ambience without restarting the loop.

Looping plays (`opts.loop = true`) are tracked in a set and have their `.stop` wrapped to clean up the entry; one-shots aren't tracked since they finish before a slider drag matters.

Add new sounds by calling `playSfx` or `playMusic` — never call `k.play()` directly so the new clip respects the user's volume settings.
