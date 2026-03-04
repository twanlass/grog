// Multiplayer lobby scene — host/join pre-game connection screen
import { createHost, joinHost, disconnect, getPeerCode, getConnectionState, CONNECTION_STATE, sendMessage } from '../networking/peerConnection.js';
import { MESSAGE_TYPES, createMessage } from '../networking/commands.js';

export function createMultiplayerLobbyScene(k, onStartGame, getInitialJoinCode) {
    return function multiplayerLobbyScene() {
        k.setCursor("url('/sprites/assets/cursor.png'), auto");

        // State
        let mode = 'choose'; // 'choose' | 'hosting' | 'joining' | 'connected' | 'error'
        let gameCode = '';
        let inputCode = '';
        let errorMessage = '';
        let countdown = 3;
        let countdownActive = false;
        let connection = null;
        let copyFeedbackTimer = 0; // shows "Copied!" briefly

        let joiningTimer = 0; // tracks how long we've been in 'joining' state
        const JOIN_TIMEOUT = 15; // seconds before showing timeout error

        // Auto-join if launched via ?join= link
        const initialJoinCode = getInitialJoinCode ? getInitialJoinCode() : null;
        if (initialJoinCode) {
            inputCode = initialJoinCode;
            mode = 'joining';
            console.log(`[Grog MP] Auto-joining with code: ${initialJoinCode}`);
            // Defer joinGame() to after scene is fully initialized
            k.wait(0.1, () => joinGame());
        }

        // Network callback holders (will be wired to game scene)
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

        // ============================================================
        // Host Game
        // ============================================================
        function hostGame() {
            mode = 'hosting';
            createHost({
                onGuestConnected: () => {
                    mode = 'connected';
                    // Generate map seed and send GAME_INIT
                    const mapSeed = Date.now();
                    mpConfig = {
                        isHost: true,
                        isGuest: false,
                        mapSeed,
                        // Callbacks populated during game
                        onGuestCommand: null,
                        onStateSnapshot: null,
                        onDisconnect: null,
                    };
                    sendMessage(createMessage(MESSAGE_TYPES.GAME_INIT, {
                        mapSeed,
                        config: { startingResources: { wood: 25 } },
                    }));
                    // Start countdown
                    startCountdown();
                },
                onData: (data) => {
                    if (data.messageType === MESSAGE_TYPES.PLAYER_COMMAND && data.command) {
                        pendingGuestCommands.push(data.command);
                        // Forward to mpConfig callback if game is running
                        if (mpConfig?.onGuestCommand) {
                            mpConfig.onGuestCommand(data.command);
                        }
                    }
                },
                onDisconnect: () => {
                    if (mode === 'hosting' || mode === 'connected') {
                        mode = 'error';
                        errorMessage = 'Guest disconnected.';
                    }
                    if (mpConfig?.onDisconnect) mpConfig.onDisconnect();
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
                    // Wait for GAME_INIT from host
                },
                onData: (data) => {
                    if (data.messageType === MESSAGE_TYPES.GAME_INIT) {
                        mode = 'connected';
                        mpConfig = {
                            isHost: false,
                            isGuest: true,
                            mapSeed: data.mapSeed,
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
                    if (data.messageType === MESSAGE_TYPES.PLAYER_COMMAND && data.command) {
                        // Guest shouldn't receive commands, but handle gracefully
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
        // Input: keyboard for code entry
        // ============================================================
        k.onKeyPress((key) => {
            if (mode === 'choose' || mode === 'joining_input') {
                // Code input
                if (key.length === 1 && /[a-zA-Z0-9]/.test(key) && inputCode.length < 10) {
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

            // Track joining timeout
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
                    // Transition to game
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

            // Background
            k.drawRect({ width: k.width(), height: k.height(), pos: k.vec2(0, 0), color: bgColor });

            // Title
            k.drawText({
                text: "MULTIPLAYER",
                size: 36,
                pos: k.vec2(cx, 60),
                anchor: "center",
                color: accentColor,
            });

            if (mode === 'choose') {
                // Host button
                const hostBtnY = cy - 60;
                const hostHover = isMouseInRect(cx - 120, hostBtnY - 25, 240, 50);
                k.drawRect({
                    width: 240, height: 50, radius: 8,
                    pos: k.vec2(cx, hostBtnY), anchor: "center",
                    color: hostHover ? k.rgb(40, 55, 75) : panelColor,
                    outline: { width: 2, color: accentColor },
                });
                k.drawText({
                    text: "HOST GAME",
                    size: 20, pos: k.vec2(cx, hostBtnY), anchor: "center",
                    color: textColor,
                });

                // Join button
                const joinBtnY = cy + 10;
                const joinHover = isMouseInRect(cx - 120, joinBtnY - 25, 240, 50);
                k.drawRect({
                    width: 240, height: 50, radius: 8,
                    pos: k.vec2(cx, joinBtnY), anchor: "center",
                    color: joinHover ? k.rgb(40, 55, 75) : panelColor,
                    outline: { width: 2, color: accentColor },
                });
                k.drawText({
                    text: "JOIN GAME",
                    size: 20, pos: k.vec2(cx, joinBtnY), anchor: "center",
                    color: textColor,
                });

                // Back hint
                k.drawText({
                    text: "Press ESC to go back",
                    size: 12, pos: k.vec2(cx, cy + 100), anchor: "center",
                    color: dimColor,
                });

            } else if (mode === 'hosting') {
                k.drawText({
                    text: "Your game code:",
                    size: 18, pos: k.vec2(cx, cy - 60), anchor: "center",
                    color: dimColor,
                });
                k.drawText({
                    text: gameCode || "Creating...",
                    size: 40, pos: k.vec2(cx, cy - 20), anchor: "center",
                    color: accentColor,
                });

                // Copy link button (right of game code)
                if (gameCode) {
                    const codeWidth = gameCode.length * 22; // rough text width
                    const btnX = cx + codeWidth / 2 + 20;
                    const btnY = cy - 20;
                    const btnW = 120;
                    const btnH = 34;
                    const copyHover = isMouseInRect(btnX - btnW / 2, btnY - btnH / 2, btnW, btnH);
                    const showCopied = copyFeedbackTimer > 0;

                    k.drawRect({
                        width: btnW, height: btnH, radius: 6,
                        pos: k.vec2(btnX, btnY), anchor: "center",
                        color: showCopied ? k.rgb(40, 100, 40) : (copyHover ? k.rgb(40, 55, 75) : panelColor),
                        outline: { width: 1.5, color: showCopied ? k.rgb(100, 255, 100) : accentColor },
                    });
                    k.drawText({
                        text: showCopied ? "Copied!" : "Copy Link",
                        size: 14, pos: k.vec2(btnX, btnY), anchor: "center",
                        color: showCopied ? k.rgb(100, 255, 100) : textColor,
                    });
                }

                // Pulsing dots
                const dots = '.'.repeat(1 + Math.floor(elapsed * 2) % 3);
                k.drawText({
                    text: `Waiting for opponent${dots}`,
                    size: 16, pos: k.vec2(cx, cy + 30), anchor: "center",
                    color: dimColor,
                });
                k.drawText({
                    text: "Share the link with your friend",
                    size: 12, pos: k.vec2(cx, cy + 60), anchor: "center",
                    color: dimColor,
                });
                k.drawText({
                    text: "Press ESC to cancel",
                    size: 12, pos: k.vec2(cx, cy + 100), anchor: "center",
                    color: dimColor,
                });

            } else if (mode === 'joining_input') {
                k.drawText({
                    text: "Enter host code:",
                    size: 18, pos: k.vec2(cx, cy - 60), anchor: "center",
                    color: dimColor,
                });
                // Input box
                k.drawRect({
                    width: 240, height: 50, radius: 8,
                    pos: k.vec2(cx, cy - 15), anchor: "center",
                    color: k.rgb(15, 20, 30),
                    outline: { width: 2, color: accentColor },
                });
                const displayCode = inputCode || '';
                const cursor = Math.floor(elapsed * 2) % 2 === 0 ? '_' : '';
                k.drawText({
                    text: displayCode + cursor,
                    size: 28, pos: k.vec2(cx, cy - 15), anchor: "center",
                    color: textColor,
                });
                k.drawText({
                    text: "Type the code and press ENTER",
                    size: 12, pos: k.vec2(cx, cy + 30), anchor: "center",
                    color: dimColor,
                });
                k.drawText({
                    text: "Press ESC to go back",
                    size: 12, pos: k.vec2(cx, cy + 60), anchor: "center",
                    color: dimColor,
                });

            } else if (mode === 'joining') {
                const dots = '.'.repeat(1 + Math.floor(elapsed * 2) % 3);
                k.drawText({
                    text: `Connecting${dots}`,
                    size: 20, pos: k.vec2(cx, cy), anchor: "center",
                    color: dimColor,
                });

            } else if (mode === 'connected') {
                const secs = Math.ceil(Math.max(0, countdown));
                k.drawText({
                    text: "Opponent connected!",
                    size: 22, pos: k.vec2(cx, cy - 30), anchor: "center",
                    color: k.rgb(100, 255, 100),
                });
                k.drawText({
                    text: `Starting in ${secs}...`,
                    size: 28, pos: k.vec2(cx, cy + 15), anchor: "center",
                    color: accentColor,
                });

            } else if (mode === 'error') {
                k.drawText({
                    text: errorMessage,
                    size: 18, pos: k.vec2(cx, cy - 15), anchor: "center",
                    color: errorColor,
                });

                // Retry button (if we have a code to retry with)
                if (inputCode) {
                    const retryBtnY = cy + 30;
                    const retryHover = isMouseInRect(cx - 80, retryBtnY - 18, 160, 36);
                    k.drawRect({
                        width: 160, height: 36, radius: 6,
                        pos: k.vec2(cx, retryBtnY), anchor: "center",
                        color: retryHover ? k.rgb(40, 55, 75) : panelColor,
                        outline: { width: 1.5, color: accentColor },
                    });
                    k.drawText({
                        text: "Retry",
                        size: 16, pos: k.vec2(cx, retryBtnY), anchor: "center",
                        color: textColor,
                    });
                }

                k.drawText({
                    text: "Press ESC to return to menu",
                    size: 14, pos: k.vec2(cx, cy + 75), anchor: "center",
                    color: dimColor,
                });
            }
        });

        // ============================================================
        // Click handlers
        // ============================================================
        k.onMousePress("left", () => {
            const mx = k.mousePos().x;
            const my = k.mousePos().y;
            const cx = k.width() / 2;
            const cy = k.height() / 2;

            if (mode === 'choose') {
                // Host button
                if (isMouseInRect(cx - 120, cy - 60 - 25, 240, 50)) {
                    hostGame();
                }
                // Join button
                if (isMouseInRect(cx - 120, cy + 10 - 25, 240, 50)) {
                    mode = 'joining_input';
                    inputCode = '';
                }
            }

            if (mode === 'error' && inputCode) {
                // Retry button hit test
                const retryBtnY = cy + 30;
                if (isMouseInRect(cx - 80, retryBtnY - 18, 160, 36)) {
                    disconnect();
                    joiningTimer = 0;
                    joinGame();
                }
            }

            if (mode === 'hosting' && gameCode) {
                // Copy link button hit test
                const codeWidth = gameCode.length * 22;
                const btnX = cx + codeWidth / 2 + 20;
                const btnY = cy - 20;
                const btnW = 120;
                const btnH = 34;
                if (isMouseInRect(btnX - btnW / 2, btnY - btnH / 2, btnW, btnH)) {
                    copyJoinLink();
                }
            }
        });

        function copyJoinLink() {
            if (!gameCode) return;
            const url = `${window.location.origin}${window.location.pathname}?join=${gameCode}`;
            navigator.clipboard.writeText(url).then(() => {
                copyFeedbackTimer = 2; // show "Copied!" for 2 seconds
            }).catch(() => {
                // Fallback: try copying just the code
                navigator.clipboard.writeText(gameCode).catch(() => {});
                copyFeedbackTimer = 2;
            });
        }

        function isMouseInRect(x, y, w, h) {
            const mp = k.mousePos();
            return mp.x >= x && mp.x <= x + w && mp.y >= y && mp.y <= y + h;
        }
    };
}
