// Multiplayer lobby scene — host/join pre-game connection screen
// Supports 2-4 player multiplayer via host waiting room
import { createHost, joinHost, disconnect, getPeerCode, getConnectionState, CONNECTION_STATE, sendMessage, sendLobbyState, sendGameInitToAll, getConnectedPlayerIds, getConnectedPlayerCount, getLocalPlayerId } from '../networking/peerConnection.js';
import { MESSAGE_TYPES, createMessage } from '../networking/commands.js';

export function createMultiplayerLobbyScene(k, onStartGame, getInitialJoinCode) {
    return function multiplayerLobbyScene() {
        k.setCursor("url('/sprites/assets/cursor.png'), auto");

        // State
        let mode = 'choose'; // 'choose' | 'hosting' | 'joining' | 'joining_input' | 'lobby_guest' | 'connected' | 'error'
        let gameCode = '';
        let inputCode = '';
        let errorMessage = '';
        let countdown = 3;
        let countdownActive = false;
        let copyFeedbackTimer = 0;

        let joiningTimer = 0;
        const JOIN_TIMEOUT = 15;

        // Player list for lobby
        let lobbyPlayers = [];

        // Auto-join if launched via ?join= link
        const initialJoinCode = getInitialJoinCode ? getInitialJoinCode() : null;
        if (initialJoinCode) {
            inputCode = initialJoinCode;
            mode = 'joining';
            console.log(`[Grog MP] Auto-joining with code: ${initialJoinCode}`);
            k.wait(0.1, () => joinGame());
        }

        // Network callback holders
        let pendingGuestCommands = [];
        let latestSnapshot = null;

        // Multiplayer config that will be passed to game scene
        let mpConfig = null;

        const bgColor = k.rgb(10, 15, 25);
        const panelColor = k.rgb(20, 30, 45);
        const accentColor = k.rgb(255, 200, 0);
        const textColor = k.rgb(220, 230, 240);
        const dimColor = k.rgb(120, 140, 160);
        const errorColor = k.rgb(255, 80, 80);

        // Player faction colors for lobby display
        const PLAYER_COLORS = {
            player: k.rgb(180, 60, 60),
            player2: k.rgb(60, 160, 80),
            player3: k.rgb(60, 120, 200),
            player4: k.rgb(220, 140, 40),
        };

        const PLAYER_LABELS = {
            player: 'Player 1 (Host)',
            player2: 'Player 2',
            player3: 'Player 3',
            player4: 'Player 4',
        };

        function updateLobbyPlayers() {
            const ids = getConnectedPlayerIds();
            lobbyPlayers = ids.map(id => ({ playerId: id, connected: true }));
            sendLobbyState({ players: lobbyPlayers });
        }

        // ============================================================
        // Host Game
        // ============================================================
        function hostGame() {
            mode = 'hosting';
            lobbyPlayers = [{ playerId: 'player', connected: true }];

            createHost({
                onGuestConnected: (playerId) => {
                    console.log(`[Grog MP] Guest ${playerId} joined the lobby`);
                    updateLobbyPlayers();
                },
                onGuestDisconnected: (playerId) => {
                    console.log(`[Grog MP] Guest ${playerId} left the lobby`);
                    updateLobbyPlayers();

                    if (countdownActive && getConnectedPlayerCount() < 2) {
                        countdownActive = false;
                    }

                    if (mpConfig?.onGuestDisconnected) mpConfig.onGuestDisconnected(playerId);
                },
                onData: (data, playerId) => {
                    if (data.messageType === MESSAGE_TYPES.PLAYER_COMMAND && data.command) {
                        pendingGuestCommands.push({ command: data.command, playerId });
                        if (mpConfig?.onGuestCommand) {
                            mpConfig.onGuestCommand(data.command, playerId);
                        }
                    }
                },
                onError: (err) => {
                    mode = 'error';
                    errorMessage = err.message || 'Connection error';
                },
            }).then(code => {
                gameCode = code;
            }).catch(err => {
                mode = 'error';
                errorMessage = err.message || 'Failed to create host';
            });
        }

        function startGame() {
            const playerIds = getConnectedPlayerIds();
            if (playerIds.length < 2) return;

            const mapSeed = Date.now();
            mpConfig = {
                isHost: true,
                isGuest: false,
                mapSeed,
                localPlayerId: 'player',
                playerCount: playerIds.length,
                playerOwners: playerIds,
                onGuestCommand: null,
                onStateSnapshot: null,
                onDisconnect: null,
                onGuestDisconnected: null,
            };

            // Send personalized GAME_INIT to each guest (includes their playerId)
            sendGameInitToAll({
                mapSeed,
                config: { startingResources: { wood: 25 } },
                playerOwners: playerIds,
            });

            startCountdown();
        }

        // ============================================================
        // Join Game
        // ============================================================
        function joinGame() {
            if (inputCode.length < 5) return;

            const fullCode = inputCode.includes('-') ? inputCode.toUpperCase() : `GROG-${inputCode.toUpperCase()}`;
            console.log(`[Grog MP] joinGame() called with code: ${fullCode}`);
            mode = 'joining';
            joiningTimer = 0;

            joinHost(fullCode, {
                onConnected: () => {
                    // Wait for LOBBY_STATE / GAME_INIT from host
                },
                onData: (data) => {
                    if (data.messageType === MESSAGE_TYPES.LOBBY_STATE) {
                        lobbyPlayers = data.players || [];
                        if (mode === 'joining') {
                            mode = 'lobby_guest';
                        }
                    }
                    if (data.messageType === MESSAGE_TYPES.GAME_INIT) {
                        mode = 'connected';
                        const playerOwners = data.playerOwners || ['player', 'player2'];

                        // Determine our local player ID from peerConnection
                        let myPlayerId = getLocalPlayerId();

                        // If not set by peerConnection, infer from lobby position
                        if (!myPlayerId) {
                            const guestPlayers = lobbyPlayers.filter(p => p.playerId !== 'player');
                            myPlayerId = guestPlayers.length > 0 ? guestPlayers[guestPlayers.length - 1].playerId : 'player2';
                        }

                        mpConfig = {
                            isHost: false,
                            isGuest: true,
                            mapSeed: data.mapSeed,
                            localPlayerId: myPlayerId,
                            playerCount: playerOwners.length,
                            playerOwners: playerOwners,
                            onGuestCommand: null,
                            onStateSnapshot: null,
                            onDisconnect: null,
                        };
                        startCountdown();
                    }
                    if (data.messageType === MESSAGE_TYPES.STATE_SNAPSHOT && data.snapshot) {
                        latestSnapshot = data.snapshot;
                        if (mpConfig?.onStateSnapshot) {
                            mpConfig.onStateSnapshot(data.snapshot);
                        }
                    }
                },
                onDisconnect: () => {
                    if (mode !== 'error') {
                        mode = 'error';
                        errorMessage = 'Host disconnected.';
                    }
                    if (mpConfig?.onDisconnect) mpConfig.onDisconnect();
                },
                onError: (err) => {
                    mode = 'error';
                    errorMessage = err.message || 'Connection error';
                },
            }).catch(err => {
                mode = 'error';
                errorMessage = err.message || 'Failed to connect';
            });
        }

        function startCountdown() {
            countdownActive = true;
            countdown = 3;
        }

        // ============================================================
        // Input
        // ============================================================
        k.onKeyPress((key) => {
            if (mode === 'choose' || mode === 'joining_input') {
                if (key.length === 1 && /[a-zA-Z0-9\-]/.test(key) && inputCode.length < 15) {
                    inputCode += key.toUpperCase();
                }
                if (key === 'backspace' && inputCode.length > 0) {
                    inputCode = inputCode.slice(0, -1);
                }
                if (key === 'enter' && mode === 'joining_input') {
                    joinGame();
                }
            }
            if (key === 'escape') {
                if (mode === 'joining_input') {
                    mode = 'choose';
                    inputCode = '';
                } else {
                    disconnect();
                    k.go("title");
                }
            }
        });

        // ============================================================
        // Update loop
        // ============================================================
        let elapsed = 0;
        k.onUpdate(() => {
            elapsed += k.dt();

            if (copyFeedbackTimer > 0) {
                copyFeedbackTimer -= k.dt();
            }

            if (mode === 'joining') {
                joiningTimer += k.dt();
                if (joiningTimer >= JOIN_TIMEOUT) {
                    mode = 'error';
                    errorMessage = 'Connection timed out. Host may not be available.';
                    disconnect();
                }
            } else {
                joiningTimer = 0;
            }

            if (countdownActive) {
                countdown -= k.dt();
                if (countdown <= 0) {
                    countdownActive = false;
                    onStartGame(mpConfig);
                }
            }
        });

        // ============================================================
        // Rendering
        // ============================================================
        k.onDraw(() => {
            const cx = k.width() / 2;
            const cy = k.height() / 2;

            k.drawRect({ width: k.width(), height: k.height(), pos: k.vec2(0, 0), color: bgColor });

            k.drawText({
                text: "MULTIPLAYER",
                size: 36, pos: k.vec2(cx, 60), anchor: "center", color: accentColor,
            });

            if (mode === 'choose') {
                const hostBtnY = cy - 60;
                const hostHover = isMouseInRect(cx - 120, hostBtnY - 25, 240, 50);
                k.drawRect({ width: 240, height: 50, radius: 8, pos: k.vec2(cx, hostBtnY), anchor: "center", color: hostHover ? k.rgb(40, 55, 75) : panelColor, outline: { width: 2, color: accentColor } });
                k.drawText({ text: "HOST GAME", size: 20, pos: k.vec2(cx, hostBtnY), anchor: "center", color: textColor });

                const joinBtnY = cy + 10;
                const joinHover = isMouseInRect(cx - 120, joinBtnY - 25, 240, 50);
                k.drawRect({ width: 240, height: 50, radius: 8, pos: k.vec2(cx, joinBtnY), anchor: "center", color: joinHover ? k.rgb(40, 55, 75) : panelColor, outline: { width: 2, color: accentColor } });
                k.drawText({ text: "JOIN GAME", size: 20, pos: k.vec2(cx, joinBtnY), anchor: "center", color: textColor });

                k.drawText({ text: "Press ESC to go back", size: 12, pos: k.vec2(cx, cy + 100), anchor: "center", color: dimColor });

            } else if (mode === 'hosting') {
                drawHostLobby(cx, cy, elapsed);

            } else if (mode === 'lobby_guest') {
                drawGuestLobby(cx, cy, elapsed);

            } else if (mode === 'joining_input') {
                k.drawText({ text: "Enter host code:", size: 18, pos: k.vec2(cx, cy - 60), anchor: "center", color: dimColor });
                k.drawRect({ width: 240, height: 50, radius: 8, pos: k.vec2(cx, cy - 15), anchor: "center", color: k.rgb(15, 20, 30), outline: { width: 2, color: accentColor } });
                const cursor = Math.floor(elapsed * 2) % 2 === 0 ? '_' : '';
                k.drawText({ text: (inputCode || '') + cursor, size: 28, pos: k.vec2(cx, cy - 15), anchor: "center", color: textColor });
                k.drawText({ text: "Type the code and press ENTER", size: 12, pos: k.vec2(cx, cy + 30), anchor: "center", color: dimColor });
                k.drawText({ text: "Press ESC to go back", size: 12, pos: k.vec2(cx, cy + 60), anchor: "center", color: dimColor });

            } else if (mode === 'joining') {
                const dots = '.'.repeat(1 + Math.floor(elapsed * 2) % 3);
                k.drawText({ text: `Connecting${dots}`, size: 20, pos: k.vec2(cx, cy), anchor: "center", color: dimColor });

            } else if (mode === 'connected') {
                const secs = Math.ceil(Math.max(0, countdown));
                const playerCount = mpConfig?.playerCount || 2;
                k.drawText({ text: `${playerCount} players connected!`, size: 22, pos: k.vec2(cx, cy - 30), anchor: "center", color: k.rgb(100, 255, 100) });
                k.drawText({ text: `Starting in ${secs}...`, size: 28, pos: k.vec2(cx, cy + 15), anchor: "center", color: accentColor });

            } else if (mode === 'error') {
                k.drawText({ text: errorMessage, size: 18, pos: k.vec2(cx, cy - 15), anchor: "center", color: errorColor });
                if (inputCode) {
                    const retryBtnY = cy + 30;
                    const retryHover = isMouseInRect(cx - 80, retryBtnY - 18, 160, 36);
                    k.drawRect({ width: 160, height: 36, radius: 6, pos: k.vec2(cx, retryBtnY), anchor: "center", color: retryHover ? k.rgb(40, 55, 75) : panelColor, outline: { width: 1.5, color: accentColor } });
                    k.drawText({ text: "Retry", size: 16, pos: k.vec2(cx, retryBtnY), anchor: "center", color: textColor });
                }
                k.drawText({ text: "Press ESC to return to menu", size: 14, pos: k.vec2(cx, cy + 75), anchor: "center", color: dimColor });
            }
        });

        function drawHostLobby(cx, cy, elapsed) {
            k.drawText({ text: "Your game code:", size: 18, pos: k.vec2(cx, cy - 100), anchor: "center", color: dimColor });
            k.drawText({ text: gameCode || "Creating...", size: 40, pos: k.vec2(cx, cy - 60), anchor: "center", color: accentColor });

            if (gameCode) {
                const btnY = cy - 25;
                const copyHover = isMouseInRect(cx - 60, btnY - 15, 120, 30);
                const showCopied = copyFeedbackTimer > 0;
                k.drawRect({ width: 120, height: 30, radius: 6, pos: k.vec2(cx, btnY), anchor: "center", color: showCopied ? k.rgb(40, 100, 40) : (copyHover ? k.rgb(40, 55, 75) : panelColor), outline: { width: 1.5, color: showCopied ? k.rgb(100, 255, 100) : accentColor } });
                k.drawText({ text: showCopied ? "Copied!" : "Copy Link", size: 14, pos: k.vec2(cx, btnY), anchor: "center", color: showCopied ? k.rgb(100, 255, 100) : textColor });
            }

            k.drawText({ text: "Players:", size: 16, pos: k.vec2(cx, cy + 10), anchor: "center", color: textColor });
            drawPlayerList(cx, cy + 35);

            const canStart = lobbyPlayers.length >= 2 && !countdownActive;
            if (canStart) {
                const startBtnY = cy + 40 + lobbyPlayers.length * 25 + 10;
                const startHover = isMouseInRect(cx - 100, startBtnY - 20, 200, 40);
                k.drawRect({ width: 200, height: 40, radius: 8, pos: k.vec2(cx, startBtnY), anchor: "center", color: startHover ? k.rgb(40, 100, 40) : k.rgb(30, 80, 30), outline: { width: 2, color: k.rgb(100, 255, 100) } });
                k.drawText({ text: "START GAME", size: 18, pos: k.vec2(cx, startBtnY), anchor: "center", color: k.rgb(100, 255, 100) });
            } else if (!countdownActive) {
                const dots = '.'.repeat(1 + Math.floor(elapsed * 2) % 3);
                k.drawText({ text: `Waiting for players${dots}`, size: 14, pos: k.vec2(cx, cy + 40 + lobbyPlayers.length * 25 + 10), anchor: "center", color: dimColor });
            }

            if (countdownActive) {
                const secs = Math.ceil(Math.max(0, countdown));
                k.drawText({ text: `Starting in ${secs}...`, size: 22, pos: k.vec2(cx, cy + 40 + lobbyPlayers.length * 25 + 10), anchor: "center", color: accentColor });
            }

            k.drawText({ text: "Share the link with your friends", size: 12, pos: k.vec2(cx, k.height() - 60), anchor: "center", color: dimColor });
            k.drawText({ text: "Press ESC to cancel", size: 12, pos: k.vec2(cx, k.height() - 40), anchor: "center", color: dimColor });
        }

        function drawGuestLobby(cx, cy, elapsed) {
            k.drawText({ text: "Connected to host", size: 20, pos: k.vec2(cx, cy - 60), anchor: "center", color: k.rgb(100, 255, 100) });
            k.drawText({ text: "Players:", size: 16, pos: k.vec2(cx, cy - 20), anchor: "center", color: textColor });
            drawPlayerList(cx, cy + 5);

            const dots = '.'.repeat(1 + Math.floor(elapsed * 2) % 3);
            k.drawText({ text: `Waiting for host to start${dots}`, size: 14, pos: k.vec2(cx, cy + 10 + lobbyPlayers.length * 25 + 10), anchor: "center", color: dimColor });
            k.drawText({ text: "Press ESC to leave", size: 12, pos: k.vec2(cx, k.height() - 40), anchor: "center", color: dimColor });
        }

        function drawPlayerList(cx, startY) {
            for (let i = 0; i < lobbyPlayers.length; i++) {
                const p = lobbyPlayers[i];
                const y = startY + i * 25;
                const color = PLAYER_COLORS[p.playerId] || dimColor;
                const label = PLAYER_LABELS[p.playerId] || p.playerId;
                k.drawText({ text: label, size: 14, pos: k.vec2(cx, y), anchor: "center", color: color });
            }
        }

        // ============================================================
        // Click handlers
        // ============================================================
        k.onMousePress("left", () => {
            const cx = k.width() / 2;
            const cy = k.height() / 2;

            if (mode === 'choose') {
                if (isMouseInRect(cx - 120, cy - 60 - 25, 240, 50)) hostGame();
                if (isMouseInRect(cx - 120, cy + 10 - 25, 240, 50)) { mode = 'joining_input'; inputCode = ''; }
            }

            if (mode === 'error' && inputCode) {
                const retryBtnY = cy + 30;
                if (isMouseInRect(cx - 80, retryBtnY - 18, 160, 36)) { disconnect(); joiningTimer = 0; joinGame(); }
            }

            if (mode === 'hosting' && gameCode) {
                // Copy link
                if (isMouseInRect(cx - 60, cy - 25 - 15, 120, 30)) copyJoinLink();

                // Start Game
                const canStart = lobbyPlayers.length >= 2 && !countdownActive;
                if (canStart) {
                    const startBtnY = cy + 40 + lobbyPlayers.length * 25 + 10;
                    if (isMouseInRect(cx - 100, startBtnY - 20, 200, 40)) startGame();
                }
            }
        });

        function copyJoinLink() {
            if (!gameCode) return;
            const url = `${window.location.origin}${window.location.pathname}?join=${gameCode}`;
            navigator.clipboard.writeText(url).then(() => { copyFeedbackTimer = 2; }).catch(() => { navigator.clipboard.writeText(gameCode).catch(() => {}); copyFeedbackTimer = 2; });
        }

        function isMouseInRect(x, y, w, h) {
            const mp = k.mousePos();
            return mp.x >= x && mp.x <= x + w && mp.y >= y && mp.y <= y + h;
        }
    };
}
