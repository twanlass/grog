# Voice Chat

Optional in-game voice chat for 1v1 multiplayer. Piggybacks on the existing
PeerJS peer with a `MediaConnection` running alongside the `DataConnection`
used for game state. Mic permission is requested explicitly from the lobby —
never implicitly when entering a game.

## Behavior

- Toggle is shown in the lobby on the `choose`, `hosting`, and `joining_input`
  screens. Clicking it triggers `navigator.mediaDevices.getUserMedia({ audio })`.
- If permission is denied or the device has no mic, the toggle shows a friendly
  status and connection proceeds without voice.
- Voice chat must be enabled **before** the data channel opens. The host
  attaches its `peer.on('call')` listener in `onGuestConnected`; the guest
  dials `peer.call(hostId, stream)` ~300 ms after receiving `GAME_INIT` (so the
  host's listener is definitely attached).
- In-game: `V` toggles mute. A mic button is rendered in the top-right HUD
  next to the menu button (only while voice is active). A green outline pulses
  on the mic button when the partner is talking (best-effort, via WebAudio
  analyser on the remote stream).
- Mute state is persisted in `localStorage` (`grog.voiceMuted`) so it survives
  reconnects within a session.

## Architecture

```
Host                                Guest
┌──────────────┐                    ┌──────────────┐
│ DataChannel  │ <── game state ──> │ DataChannel  │
│ MediaCall    │ <── audio ───────> │ MediaCall    │
└──────────────┘                    └──────────────┘
        ▲                                   ▲
        │ peer.on('call', answer)           │ peer.call(hostId, stream)
```

Both `DataConnection` and `MediaConnection` are managed by the same PeerJS
`Peer` instance, so the existing TURN/STUN config carries over.

## Files

| File | Purpose |
|------|---------|
| `src/networking/voiceChat.js` | Module owning the mic stream, `MediaCall`, hidden `<audio>` element, mute state, and a cheap WebAudio analyser for the speaking indicator |
| `src/networking/peerConnection.js` | Exposes `getPeer()` / `getRemotePeerId()` and calls `voiceChat.teardown()` from `disconnect()` |
| `src/scenes/multiplayerLobbyScene.js` | "Enable voice chat" button + permission flow; wires `attachHostCallHandler` (host) and `startGuestCall` (guest) |
| `src/scenes/gameScene.js` | `V` hotkey for mute; refreshes `gameState.voiceChat` snapshot each draw; mic-button click handler |
| `src/rendering/uiPanels.js` | Renders the mic button in `drawTopRightButtons`; reads `gameState.voiceChat` (`active`, `muted`, `partnerSpeaking`) |

## Key Functions (`voiceChat.js`)

- `requestMic()` — Prompt the browser for mic, store the stream. Throws on
  denial; caller catches.
- `attachHostCallHandler()` — Register a `peer.on('call')` listener that
  answers with our local stream. Idempotent.
- `startGuestCall()` — Dial the host's peer id with our local stream.
- `toggleMute()` — Flip enabled state of local audio tracks; returns new muted
  state and persists it.
- `isVoiceEnabled()`, `isMuted()`, `isRemoteSpeaking()`, `hasActiveCall()` —
  status queries used by the UI.
- `teardown()` — Closes call, stops mic tracks, removes audio element, clears
  the analyser. Called from `peerConnection.disconnect()`.

## Edge Cases

- **`getUserMedia` requires HTTPS** — production already runs on https; local
  dev over `http://localhost` is also allowed by browsers.
- **Autoplay gating** — Some browsers block remote-stream playback until a
  user gesture. The remote `<audio>` element calls `.play()` and swallows the
  rejection; the first user click in the game scene unblocks it.
- **Missed calls on race condition** — Host attaches `peer.on('call')`
  synchronously inside `onGuestConnected` (which fires before guest receives
  `GAME_INIT`); guest dials 300 ms after `GAME_INIT`, so the listener is
  always ready.
- **Lobby toggle is one-way** — Once mic is enabled in the lobby, the toggle
  becomes "ON" and clicking it doesn't release the stream. Users mute with
  `V` in-game or by ending the session.
- **Tab not visible** — Browser may throttle the mic stream when the tab is
  hidden; this is the same constraint that affects gameplay (see
  `docs/features/multiplayer.md`).
- **Speaking indicator failure** — If `AudioContext` can't be created, the
  indicator stays off; voice chat itself still works.
