# P2P Multiplayer

Two-player peer-to-peer multiplayer over WebRTC using PeerJS. The host runs the full game simulation; the guest sends commands and receives state snapshots.

## Architecture

**Host-authoritative model**: The host runs the game loop (physics, combat, AI, construction) and broadcasts state snapshots at 10Hz. The guest sends player commands (move, build, attack) which the host validates and applies. This prevents desync — the host's state is always the source of truth.

```
Host                          Guest
┌──────────┐  state @ 10Hz   ┌──────────┐
│ Full sim │ ───────────────> │ Apply +  │
│ + guest  │                  │ interpolate│
│ commands │ <─────────────── │ Commands │
└──────────┘  player commands └──────────┘
```

## Connection Flow

1. Host creates a PeerJS peer with ID derived from game code (e.g., `grogx7k2m`)
2. Guest connects using the game code (entered manually or via `?join=` URL param)
3. On connection, host sends `GAME_INIT` message with map seed and config
4. 3-second countdown, then both enter the game scene
5. Host sends state snapshots at `STATE_SYNC_INTERVAL` (100ms)
6. Guest sends commands as player actions occur

### ICE/TURN

TURN credentials are fetched from Metered (`grog-rts.metered.live`) at connection time. Falls back to Google STUN servers if fetch fails. This enables connections across NATs and firewalls.

### Heartbeat

Ping/pong every 2 seconds. If no response in 10 seconds, connection is considered dropped and a disconnect overlay is shown.

## Behavior

- Host is always `player` (owner), guest is always `player2`
- Guest uses `player2Resources` and can only control entities with `owner === 'player2'`
- Game speed is fixed at 1x in multiplayer (pause/speed controls hidden)
- Guest camera starts centered on their home island (`player2HomeIslandHex`)
- Game over is inverted for guest (host's "win" = guest's "lose" and vice versa)
- Host continues sending snapshots after game over so guest receives the final result

## Guest-Side Interpolation

Between snapshots, the guest locally advances:
- **Ship movement**: `moveProgress += speed * dt` along existing paths
- **Projectile progress**: `progress += speed * dt`, removed when `>= 1`

The next snapshot corrects any drift, keeping visuals smooth at 60fps despite 10Hz updates.

## State Sync

Snapshots include all gameplay-relevant state: ships, ports, settlements, towers, projectiles, resources, visual effects (explosions, debris, splashes), and game over status.

**Entity reconciliation** (`reconcileEntities`): Matches entities by `id` field. Snapshot fields override local state, but local-only rendering fields (`animFrame`, `animTimer`) are preserved. `hitFlash` uses `Math.max(local, snapshot)` so combat feedback doesn't flicker.

**Selection stability** (`updateSelectionIndices`): After reconciliation, entity array indices may shift. Selected units store an `entityId` which is used to remap the `index` field to the new position.

## Command System

Guest commands use **entity IDs** (not array indices) for network safety. The host's `commandProcessor.js` resolves IDs to indices and validates ownership before applying.

### Command Types (Guest → Host)

| Command | Data |
|---------|------|
| `MOVE_SHIPS` | `shipIds[], waypoints[], append` |
| `ATTACK` | `shipIds[], targetType, targetId` |
| `BUILD_PORT` | `builderShipId, portType, q, r` |
| `BUILD_SETTLEMENT` | `builderPortId, q, r` |
| `BUILD_TOWER` | `builderShipId?, builderPortId?, q, r` |
| `BUILD_SHIP` | `portId, shipType` |
| `CANCEL_BUILD` | `portId, queueIndex` |
| `SET_TRADE_ROUTE` | `shipIds[], foreignPortId, homePortId, isPlunder` |
| `SET_PATROL` | `shipIds[], waypoints[]` |
| `SET_RALLY` | `portId, q, r` |
| `UNLOAD_CARGO` | `shipIds[], portId` |
| `PLUNDER` | `shipIds[], targetPortId` |
| `UPGRADE_PORT` | `portId` |
| `UPGRADE_TOWER` | `towerId` |
| `REPAIR` | `entityType, entityId` |
| `CANCEL_TRADE_ROUTE` | `shipIds[]` |

### Message Types (Bidirectional)

| Message | Direction | Purpose |
|---------|-----------|---------|
| `GAME_INIT` | Host → Guest | Map seed, config |
| `STATE_SNAPSHOT` | Host → Guest | Full state at 10Hz |
| `PLAYER_COMMAND` | Guest → Host | Wrapped command |
| `PING` / `PONG` | Both | Heartbeat + latency |

## Files

| File | Purpose |
|------|---------|
| `src/networking/peerConnection.js` | WebRTC lifecycle, PeerJS wrapper, heartbeat |
| `src/networking/commands.js` | Command/message type definitions and constructors |
| `src/networking/commandProcessor.js` | Host-side command validation and execution |
| `src/networking/stateSync.js` | State snapshot extraction, application, reconciliation |
| `src/scenes/multiplayerLobbyScene.js` | Pre-game lobby (host/join UI, countdown) |
| `src/scenes/gameScene.js` | Multiplayer paths in update loop and input handling |
| `src/rendering/uiPanels.js` | Hides pause/speed menu in multiplayer |
| `src/gameState.js` | `entityId` stored on selections for sync stability |
| `src/main.js` | Scene registration, `?join=` URL param handling |

## Key Functions

### peerConnection.js
- `createHost(callbacks)` — Create host peer, fetch TURN servers, wait for guest
- `joinHost(hostCode, callbacks)` — Connect to host peer by game code
- `sendStateSnapshot(snapshot)` — Host sends state to guest
- `sendPlayerCommand(command)` — Guest sends command to host
- `disconnect()` — Clean up peer, connection, heartbeat

### stateSync.js
- `extractNetworkState(gameState)` — Strip rendering fields, create serializable snapshot
- `applyNetworkState(gameState, snapshot)` — Reconcile snapshot into local state
- `reconcileEntities(local, snapshot)` — ID-based merge preserving local rendering state

### commandProcessor.js
- `processGuestCommand(command, gameState, map, fogState)` — Validate ownership, resolve IDs, apply command

### multiplayerLobbyScene.js
- `hostGame()` — Create host, generate game code, wait for guest
- `joinGame()` — Connect to host using entered/URL code
- `copyJoinLink()` — Copy shareable URL with `?join=` param

### gameScene.js Integration
- **Initialization**: `mpConfig` wired to callbacks for commands/snapshots/disconnect
- **Guest update path**: Apply snapshots, interpolate ships/projectiles, decay hit flash, handle explosions
- **Host update path**: Process pending guest commands, send snapshots (continues after game over)
- **Input**: Guest actions call `sendPlayerCommand()` instead of modifying state directly
- **Rendering**: Disconnect overlay, latency display, hidden speed controls

## Lobby Flow

1. **Choose screen**: Host Game / Join Game buttons
2. **Hosting**: Shows game code + "Copy Link" button, waits for guest
3. **Joining**: Manual code entry (supports dashes) or auto-join via `?join=` URL param
4. **Connected**: 3-second countdown, then transitions to game scene
5. **Error**: Shows error message with retry button, 15-second join timeout

## Edge Cases / Notes

- PeerJS race condition: `conn.open` may already be true when `on('open')` listener is attached — handled by checking both
- Chrome pauses tab updates when not visible — players should use separate windows, not tabs
- Camera shake is cleared on game over for guest to prevent stuck shake loops
- Guest fog of war is recalculated locally from the reconciled entity positions
