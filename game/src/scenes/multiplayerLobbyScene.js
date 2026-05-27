// Multiplayer lobby scene — host/join pre-game connection screen
import { createHost, joinHost, disconnect, getPeerCode, getConnectionState, CONNECTION_STATE, sendMessage } from '../networking/peerConnection.js';
import { MESSAGE_TYPES, createMessage } from '../networking/commands.js';
import {
    requestMic,
    attachHostCallHandler,
    startGuestCall,
    writeVoicePreference,
    isVoiceEnabled,
} from '../networking/voiceChat.js';

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

        // Voice chat toggle state — module state is source of truth
        let voiceStatus = ''; // user-facing feedback ('', 'denied', 'unavailable', 'ready')
        let voiceRequesting = false;

        // Auto-join if launched via ?join= link.
        // Land in 'joining_input' (rather than 'joining') so the player has a
        // chance to enable voice chat and confirm before connecting.
        const initialJoinCode = getInitialJoinCode ? getInitialJoinCode() : null;
        if (initialJoinCode) {
            inputCode = initialJoinCode;
            mode = 'joining_input';
            console.log(`[Grog MP] Auto-join code prefilled: ${initialJoinCode}`);
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
                        voiceEnabled: isVoiceEnabled(),
                        // Callbacks populated during game
                        onGuestCommand: null,
                        onStateSnapshot: null,
                        onDisconnect: null,
                    };
                    sendMessage(createMessage(MESSAGE_TYPES.GAME_INIT, {
                        mapSeed,
                        config: { startingResources: { wood: 25 } },
                    }));
                    // If mic was already enabled in lobby, listen for the guest's call
                    if (isVoiceEnabled()) {
                        attachHostCallHandler();
                    }
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
                            voiceEnabled: isVoiceEnabled(),
                            onGuestCommand: null,
                            onStateSnapshot: null,
                            onDisconnect: null,
                        };
                        // Dial the host's voice channel if mic was enabled in lobby.
                        // Small delay lets the host attach its call handler first.
                        if (isVoiceEnabled()) {
                            k.wait(0.3, () => startGuestCall());
                        }
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
        // Voice chat toggle
        // ============================================================
        async function toggleVoice() {
            if (voiceRequesting) return;
            if (isVoiceEnabled()) {
                // Can't disable mid-lobby without losing the connection setup;
                // user can mute in-game with V instead. No-op for now.
                voiceStatus = 'on';
                return;
            }
            voiceRequesting = true;
            voiceStatus = 'requesting';
            try {
                await requestMic();
                voiceStatus = 'ready';
                writeVoicePreference(true);
            } catch (err) {
                voiceStatus = (err && err.name === 'NotAllowedError') ? 'denied' : 'unavailable';
                writeVoicePreference(false);
                console.warn('[Grog Voice] Mic request failed:', err);
            } finally {
                voiceRequesting = false;
            }
        }

        // Voice toggle button bounds (so click + draw share geometry)
        function getVoiceButtonBounds() {
            const cx = k.width() / 2;
            const y = k.height() - 60;
            const w = 240;
            const h = 32;
            return { x: cx - w / 2, y: y - h / 2, width: w, height: h };
        }

        function drawVoiceToggle() {
            const b = getVoiceButtonBounds();
            const mp = k.mousePos();
            const hover = mp.x >= b.x && mp.x <= b.x + b.width && mp.y >= b.y && mp.y <= b.y + b.height;
            const active = isVoiceEnabled();
            const fill = active
                ? (hover ? k.rgb(40, 90, 60) : k.rgb(30, 70, 45))
                : (hover ? k.rgb(40, 55, 75) : panelColor);
            const outline = active ? k.rgb(120, 220, 140) : accentColor;

            k.drawRect({
                width: b.width, height: b.height, radius: 6,
                pos: k.vec2(b.x + b.width / 2, b.y + b.height / 2), anchor: "center",
                color: fill,
                outline: { width: 1.5, color: outline },
            });

            let label;
            if (voiceRequesting) label = "Requesting mic...";
            else if (active) label = "Voice chat: ON  (V to mute in-game)";
            else if (voiceStatus === 'denied') label = "Mic blocked — check browser settings";
            else if (voiceStatus === 'unavailable') label = "Voice chat unavailable";
            else label = "Enable voice chat";

            k.drawText({
                text: label,
                size: 13, pos: k.vec2(b.x + b.width / 2, b.y + b.height / 2), anchor: "center",
                color: active ? k.rgb(180, 240, 200) : textColor,
            });
        }

        function voiceButtonClicked() {
            const b = getVoiceButtonBounds();
            const mp = k.mousePos();
            return mp.x >= b.x && mp.x <= b.x + b.width && mp.y >= b.y && mp.y <= b.y + b.height;
        }

        // ============================================================
        // Input: keyboard for code entry
        // ============================================================
        k.onKeyPress((key) => {
            if (mode === 'choose' || mode === 'joining_input') {
                // Code input
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

            // Voice chat toggle — visible in pre-connection screens
            if (mode === 'choose' || mode === 'hosting' || mode === 'joining_input') {
                drawVoiceToggle();
            }

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

                // Copy link button (centered below game code)
                if (gameCode) {
                    const btnX = cx;
                    const btnY = cy + 15;
                    const btnW = 120;
                    const btnH = 30;
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
                    size: 16, pos: k.vec2(cx, cy + 50), anchor: "center",
                    color: dimColor,
                });
                k.drawText({
                    text: "Share the link with your friend",
                    size: 12, pos: k.vec2(cx, cy + 80), anchor: "center",
                    color: dimColor,
                });
                k.drawText({
                    text: "Press ESC to cancel",
                    size: 12, pos: k.vec2(cx, cy + 120), anchor: "center",
                    color: dimColor,
                });

            } else if (mode === 'joining_input') {
                k.drawText({
                    text: "Host code:",
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

                // Connect button (also triggered by ENTER)
                const connectBtnY = cy + 25;
                const connectEnabled = inputCode.length >= 5;
                const connectHover = isMouseInRect(cx - 80, connectBtnY - 18, 160, 36);
                k.drawRect({
                    width: 160, height: 36, radius: 6,
                    pos: k.vec2(cx, connectBtnY), anchor: "center",
                    color: connectEnabled
                        ? (connectHover ? k.rgb(40, 90, 60) : k.rgb(30, 70, 45))
                        : panelColor,
                    outline: { width: 1.5, color: connectEnabled ? k.rgb(120, 220, 140) : dimColor },
                });
                k.drawText({
                    text: "CONNECT",
                    size: 16, pos: k.vec2(cx, connectBtnY), anchor: "center",
                    color: connectEnabled ? k.rgb(180, 240, 200) : dimColor,
                });

                k.drawText({
                    text: "Press ESC to go back",
                    size: 12, pos: k.vec2(cx, cy + 75), anchor: "center",
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

            // Voice toggle hit test (works in choose/hosting/joining_input screens)
            if ((mode === 'choose' || mode === 'hosting' || mode === 'joining_input') && voiceButtonClicked()) {
                toggleVoice();
                return;
            }

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

            if (mode === 'joining_input' && inputCode.length >= 5) {
                // Connect button
                const connectBtnY = cy + 25;
                if (isMouseInRect(cx - 80, connectBtnY - 18, 160, 36)) {
                    joinGame();
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
                // Copy link button hit test (centered below game code)
                const btnX = cx;
                const btnY = cy + 15;
                const btnW = 120;
                const btnH = 30;
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
