// Main game scene - renders the hex map
import { hexToPixel, hexCorners, HEX_SIZE, pixelToHex, hexKey } from "../hex.js";
import { generateMap, getTileColor, TILE_TYPES } from "../mapGenerator.js";
import { createGameState, createShip, createPort, findStartingPosition, findAdjacentWater, selectUnit, addToSelection, toggleSelection, isSelected, clearSelection, getSelectedUnits, getSelectedShips } from "../gameState.js";
import { drawSprite, getSpriteSize, PORTS, SHIPS } from "../sprites.js";
import { findPath, findNearestWater, findNearestAvailable } from "../pathfinding.js";

export function createGameScene(k) {
    return function gameScene() {
        // Generate the map (random each time)
        const map = generateMap({
            width: 30,
            height: 30,
        });

        // Initialize game state
        const gameState = createGameState();

        // Find starting position and place initial units
        const startTile = findStartingPosition(map);
        if (startTile) {
            // Place outpost
            gameState.ports.push(createPort('outpost', startTile.q, startTile.r));

            // Find adjacent water for first ship
            const waterTile = findAdjacentWater(map, startTile.q, startTile.r);
            if (waterTile) {
                gameState.ships.push(createShip('cutter', waterTile.q, waterTile.r));

                // Find another water tile for second ship
                const waterTile2 = findAdjacentWater(map, waterTile.q, waterTile.r);
                if (waterTile2 && (waterTile2.q !== startTile.q || waterTile2.r !== startTile.r)) {
                    gameState.ships.push(createShip('sloop', waterTile2.q, waterTile2.r));
                }
            }
        }

        // Selection hit detection radius (in world units)
        const SELECTION_RADIUS = HEX_SIZE * 1.2;

        // Camera state
        let cameraX = 0;
        let cameraY = 0;
        let zoom = 1;

        // Selection box state (left-drag)
        let isLeftMouseDown = false;
        let isSelecting = false;
        let selectStartX = 0;
        let selectStartY = 0;
        let selectEndX = 0;
        let selectEndY = 0;
        const DRAG_THRESHOLD = 5;

        // Pan state (right-drag)
        let isPanning = false;
        let panStartX = 0;
        let panStartY = 0;
        let cameraStartX = 0;
        let cameraStartY = 0;

        // Pre-calculate world positions for all tiles (once at load)
        const tilePositions = new Map();
        for (const tile of map.tiles.values()) {
            const pos = hexToPixel(tile.q, tile.r);
            tilePositions.set(tile, pos);
        }

        // Pre-create reusable color objects
        const tileColors = new Map();
        for (const tile of map.tiles.values()) {
            const [r, g, b] = getTileColor(tile);
            tileColors.set(tile, k.rgb(r, g, b));
        }

        // Ship movement update loop
        k.onUpdate(() => {
            const dt = k.dt() * gameState.timeScale;
            if (dt === 0) return; // Paused

            // Build set of occupied hexes (all ships)
            const occupiedHexes = new Set();
            for (const s of gameState.ships) {
                occupiedHexes.add(hexKey(s.q, s.r));
            }

            for (const ship of gameState.ships) {
                if (!ship.waypoint) continue;

                // Build blocked hexes (other ships, not this one)
                const blockedHexes = new Set(occupiedHexes);
                blockedHexes.delete(hexKey(ship.q, ship.r));

                // Calculate path if needed
                if (!ship.path) {
                    // Check if destination is blocked by another ship
                    const destKey = hexKey(ship.waypoint.q, ship.waypoint.r);
                    let targetQ = ship.waypoint.q;
                    let targetR = ship.waypoint.r;

                    if (blockedHexes.has(destKey)) {
                        // Find nearest available hex to the destination
                        const alt = findNearestAvailable(map, ship.waypoint.q, ship.waypoint.r, blockedHexes);
                        if (alt) {
                            targetQ = alt.q;
                            targetR = alt.r;
                        } else {
                            // No available hex nearby - clear waypoint
                            ship.waypoint = null;
                            continue;
                        }
                    }

                    ship.path = findPath(map, ship.q, ship.r, targetQ, targetR, blockedHexes);

                    // No valid path - clear waypoint
                    if (!ship.path) {
                        ship.waypoint = null;
                        continue;
                    }
                }

                // Move along path
                if (ship.path && ship.path.length > 0) {
                    const speed = SHIPS[ship.type].speed;
                    const currentKey = hexKey(ship.q, ship.r);

                    // Check ahead: is next hex going to be blocked?
                    const next = ship.path[0];
                    const nextKey = hexKey(next.q, next.r);

                    if (occupiedHexes.has(nextKey) && nextKey !== currentKey) {
                        // Next hex is blocked - find alternative destination near waypoint
                        const alt = findNearestAvailable(map, ship.waypoint.q, ship.waypoint.r, blockedHexes);
                        if (alt && (alt.q !== ship.q || alt.r !== ship.r)) {
                            // Recalculate path to alternative destination
                            const newPath = findPath(map, ship.q, ship.r, alt.q, alt.r, blockedHexes);
                            if (newPath && newPath.length > 0) {
                                ship.path = newPath;
                                // Don't reset moveProgress - continue smooth movement
                            } else {
                                // No valid path - stop and wait
                                ship.path = null;
                                ship.moveProgress = 0;
                            }
                        } else {
                            // Already at or near destination - stop
                            ship.waypoint = null;
                            ship.path = null;
                            ship.moveProgress = 0;
                        }
                        continue;
                    }

                    // Safe to move - update progress
                    ship.moveProgress += speed * dt;

                    // Move to next hex(es) when progress >= 1
                    while (ship.moveProgress >= 1 && ship.path.length > 0) {
                        const nextHex = ship.path[0];
                        const nextHexKey = hexKey(nextHex.q, nextHex.r);
                        const currKey = hexKey(ship.q, ship.r);

                        // Double-check occupancy (another ship may have moved here)
                        if (occupiedHexes.has(nextHexKey) && nextHexKey !== currKey) {
                            ship.path = null;
                            break;
                        }

                        // Move ship
                        ship.moveProgress -= 1;
                        ship.path.shift();
                        occupiedHexes.delete(currKey);
                        ship.q = nextHex.q;
                        ship.r = nextHex.r;
                        occupiedHexes.add(nextHexKey);
                    }

                    // Arrived at destination
                    if (ship.path && ship.path.length === 0) {
                        ship.waypoint = null;
                        ship.path = null;
                        ship.moveProgress = 0;
                    }
                }
            }
        });

        // Get interpolated visual position for smooth ship movement
        function getShipVisualPos(ship) {
            const currentPos = hexToPixel(ship.q, ship.r);

            // If moving and has next target, interpolate
            if (ship.path && ship.path.length > 0 && ship.moveProgress > 0) {
                const nextHex = ship.path[0];
                const nextPos = hexToPixel(nextHex.q, nextHex.r);

                // Lerp between current and next position
                return {
                    x: currentPos.x + (nextPos.x - currentPos.x) * ship.moveProgress,
                    y: currentPos.y + (nextPos.y - currentPos.y) * ship.moveProgress,
                };
            }

            return currentPos;
        }

        // Main render loop
        k.onDraw(() => {
            const halfWidth = k.width() / 2;
            const halfHeight = k.height() / 2;
            const margin = HEX_SIZE * zoom * 2;
            const scaledSize = HEX_SIZE * zoom;

            // Draw all visible tiles
            for (const tile of map.tiles.values()) {
                const pos = tilePositions.get(tile);
                const screenX = (pos.x - cameraX) * zoom + halfWidth;
                const screenY = (pos.y - cameraY) * zoom + halfHeight;

                // Culling - skip off-screen hexes
                if (
                    screenX < -margin ||
                    screenX > k.width() + margin ||
                    screenY < -margin ||
                    screenY > k.height() + margin
                ) {
                    continue;
                }

                // Get pre-calculated corners
                const corners = hexCorners(screenX, screenY, scaledSize);
                const pts = corners.map(c => k.vec2(c.x, c.y));

                // Draw hex
                k.drawPolygon({
                    pts,
                    color: tileColors.get(tile),
                });
            }

            // Draw ports
            const unitScale = zoom * 1.5;
            for (const port of gameState.ports) {
                const pos = hexToPixel(port.q, port.r);
                const screenX = (pos.x - cameraX) * zoom + halfWidth;
                const screenY = (pos.y - cameraY) * zoom + halfHeight;

                // Skip if off screen
                if (screenX < -100 || screenX > k.width() + 100 ||
                    screenY < -100 || screenY > k.height() + 100) continue;

                const portData = PORTS[port.type];
                const spriteSize = getSpriteSize(portData.sprite, unitScale);
                drawSprite(k, portData.sprite,
                    screenX - spriteSize.width / 2,
                    screenY - spriteSize.height / 2,
                    unitScale);
            }

            // Draw ships (with smooth interpolated movement)
            for (const ship of gameState.ships) {
                const pos = getShipVisualPos(ship);
                const screenX = (pos.x - cameraX) * zoom + halfWidth;
                const screenY = (pos.y - cameraY) * zoom + halfHeight;

                // Skip if off screen
                if (screenX < -100 || screenX > k.width() + 100 ||
                    screenY < -100 || screenY > k.height() + 100) continue;

                const shipData = SHIPS[ship.type];
                const spriteSize = getSpriteSize(shipData.sprite, unitScale);
                drawSprite(k, shipData.sprite,
                    screenX - spriteSize.width / 2,
                    screenY - spriteSize.height / 2,
                    unitScale);
            }

            // Draw selection indicators for all selected units
            for (let i = 0; i < gameState.ships.length; i++) {
                if (!isSelected(gameState, 'ship', i)) continue;
                const ship = gameState.ships[i];
                const pos = getShipVisualPos(ship);
                const screenX = (pos.x - cameraX) * zoom + halfWidth;
                const screenY = (pos.y - cameraY) * zoom + halfHeight;

                // Draw selection circle
                k.drawCircle({
                    pos: k.vec2(screenX, screenY),
                    radius: HEX_SIZE * zoom * 1.3,
                    color: k.rgb(255, 220, 50),
                    fill: false,
                    outline: { width: 3, color: k.rgb(255, 220, 50) },
                });

                // Draw path and waypoint if ship has one
                if (ship.waypoint) {
                    const wpPos = hexToPixel(ship.waypoint.q, ship.waypoint.r);
                    const wpScreenX = (wpPos.x - cameraX) * zoom + halfWidth;
                    const wpScreenY = (wpPos.y - cameraY) * zoom + halfHeight;

                    // Draw waypoint marker (red diamond)
                    const wpSize = HEX_SIZE * zoom * 0.5;
                    k.drawPolygon({
                        pts: [
                            k.vec2(wpScreenX, wpScreenY - wpSize),
                            k.vec2(wpScreenX + wpSize, wpScreenY),
                            k.vec2(wpScreenX, wpScreenY + wpSize),
                            k.vec2(wpScreenX - wpSize, wpScreenY),
                        ],
                        color: k.rgb(220, 50, 50),
                    });

                    // Draw A* path from ship to waypoint
                    if (ship.path && ship.path.length > 0) {
                        let prevX = screenX;
                        let prevY = screenY;
                        for (const node of ship.path) {
                            const nodePos = hexToPixel(node.q, node.r);
                            const nodeScreenX = (nodePos.x - cameraX) * zoom + halfWidth;
                            const nodeScreenY = (nodePos.y - cameraY) * zoom + halfHeight;
                            k.drawLine({
                                p1: k.vec2(prevX, prevY),
                                p2: k.vec2(nodeScreenX, nodeScreenY),
                                width: 2,
                                color: k.rgb(220, 50, 50),
                                opacity: 0.6,
                            });
                            prevX = nodeScreenX;
                            prevY = nodeScreenY;
                        }
                    }
                }
            }

            // Draw selection indicators for selected ports
            for (let i = 0; i < gameState.ports.length; i++) {
                if (!isSelected(gameState, 'port', i)) continue;
                const port = gameState.ports[i];
                const pos = hexToPixel(port.q, port.r);
                const screenX = (pos.x - cameraX) * zoom + halfWidth;
                const screenY = (pos.y - cameraY) * zoom + halfHeight;

                k.drawCircle({
                    pos: k.vec2(screenX, screenY),
                    radius: HEX_SIZE * zoom * 1.3,
                    color: k.rgb(255, 220, 50),
                    fill: false,
                    outline: { width: 3, color: k.rgb(255, 220, 50) },
                });
            }

            // Draw selection box if selecting
            if (isSelecting) {
                const boxX = Math.min(selectStartX, selectEndX);
                const boxY = Math.min(selectStartY, selectEndY);
                const boxW = Math.abs(selectEndX - selectStartX);
                const boxH = Math.abs(selectEndY - selectStartY);
                k.drawRect({
                    pos: k.vec2(boxX, boxY),
                    width: boxW,
                    height: boxH,
                    color: k.rgb(100, 200, 255),
                    opacity: 0.2,
                });
                k.drawRect({
                    pos: k.vec2(boxX, boxY),
                    width: boxW,
                    height: boxH,
                    fill: false,
                    outline: { width: 2, color: k.rgb(100, 200, 255) },
                });
            }

            // UI overlay - Resource panel (top right)
            const panelWidth = 280;
            const panelHeight = 70;
            const panelX = k.width() - panelWidth - 15;
            const panelY = 15;

            // Panel background
            k.drawRect({
                pos: k.vec2(panelX, panelY),
                width: panelWidth,
                height: panelHeight,
                color: k.rgb(20, 30, 40),
                radius: 6,
                opacity: 0.9,
            });

            // Panel title
            k.drawText({
                text: "STOCKPILE",
                pos: k.vec2(panelX + panelWidth / 2, panelY + 12),
                size: 12,
                anchor: "center",
                color: k.rgb(150, 150, 150),
            });

            // Resource values
            const res = gameState.resources;
            const resY = panelY + 38;
            const resSpacing = 68;

            // Wood (brown)
            k.drawText({
                text: `Wood`,
                pos: k.vec2(panelX + 15, resY - 10),
                size: 10,
                color: k.rgb(139, 90, 43),
            });
            k.drawText({
                text: `${res.wood}`,
                pos: k.vec2(panelX + 15, resY + 6),
                size: 18,
                color: k.rgb(200, 150, 100),
            });

            // Steel (gray)
            k.drawText({
                text: `Steel`,
                pos: k.vec2(panelX + 15 + resSpacing, resY - 10),
                size: 10,
                color: k.rgb(100, 100, 120),
            });
            k.drawText({
                text: `${res.steel}`,
                pos: k.vec2(panelX + 15 + resSpacing, resY + 6),
                size: 18,
                color: k.rgb(180, 180, 200),
            });

            // Food (green)
            k.drawText({
                text: `Food`,
                pos: k.vec2(panelX + 15 + resSpacing * 2, resY - 10),
                size: 10,
                color: k.rgb(80, 140, 80),
            });
            k.drawText({
                text: `${res.food}`,
                pos: k.vec2(panelX + 15 + resSpacing * 2, resY + 6),
                size: 18,
                color: k.rgb(120, 200, 120),
            });

            // Grog (amber)
            k.drawText({
                text: `Grog`,
                pos: k.vec2(panelX + 15 + resSpacing * 3, resY - 10),
                size: 10,
                color: k.rgb(180, 120, 40),
            });
            k.drawText({
                text: `${res.grog}`,
                pos: k.vec2(panelX + 15 + resSpacing * 3, resY + 6),
                size: 18,
                color: k.rgb(220, 180, 80),
            });

            // Game title (top left)
            k.drawText({
                text: "Grog",
                pos: k.vec2(20, 20),
                size: 28,
                color: k.rgb(255, 255, 255),
            });

            // Controls hint
            k.drawText({
                text: "Drag: Select | Shift+click: Add to selection | Ctrl+click: Set waypoint",
                pos: k.vec2(20, 52),
                size: 12,
                color: k.rgb(120, 120, 120),
            });

            // Time scale indicator (bottom left)
            const timeLabel = gameState.timeScale === 0 ? "PAUSED" : `${gameState.timeScale}x`;
            const timeColor = gameState.timeScale === 0
                ? k.rgb(255, 100, 100)
                : k.rgb(150, 200, 150);
            k.drawText({
                text: timeLabel,
                pos: k.vec2(20, k.height() - 25),
                size: 18,
                color: timeColor,
            });
        });

        // Left-click/drag for selection
        k.onMousePress("left", () => {
            isLeftMouseDown = true;
            selectStartX = k.mousePos().x;
            selectStartY = k.mousePos().y;
            selectEndX = selectStartX;
            selectEndY = selectStartY;
        });

        k.onMouseRelease("left", () => {
            const dx = k.mousePos().x - selectStartX;
            const dy = k.mousePos().y - selectStartY;
            const dist = Math.sqrt(dx * dx + dy * dy);

            if (dist > DRAG_THRESHOLD && isSelecting) {
                // Selection box drag - select units in box
                handleSelectionBox();
            } else {
                // Click - handle unit selection or waypoint
                handleClick();
            }
            isLeftMouseDown = false;
            isSelecting = false;
        });

        // Right-click/drag for panning
        k.onMousePress("right", () => {
            isPanning = true;
            panStartX = k.mousePos().x;
            panStartY = k.mousePos().y;
            cameraStartX = cameraX;
            cameraStartY = cameraY;
        });

        k.onMouseRelease("right", () => {
            isPanning = false;
        });

        k.onMouseMove(() => {
            // Selection box dragging (only when left mouse is held)
            if (isLeftMouseDown) {
                const dx = k.mousePos().x - selectStartX;
                const dy = k.mousePos().y - selectStartY;
                if (Math.sqrt(dx * dx + dy * dy) > DRAG_THRESHOLD) {
                    isSelecting = true;
                }
                selectEndX = k.mousePos().x;
                selectEndY = k.mousePos().y;
            }

            // Camera panning with right-drag
            if (isPanning) {
                const pdx = k.mousePos().x - panStartX;
                const pdy = k.mousePos().y - panStartY;
                cameraX = cameraStartX - pdx / zoom;
                cameraY = cameraStartY - pdy / zoom;
            }
        });

        // WASD and edge scrolling for camera panning
        const EDGE_SCROLL_MARGIN = 20; // pixels from edge to trigger scroll
        k.onUpdate(() => {
            const panSpeed = 300 / zoom;
            const mouse = k.mousePos();

            // WASD panning
            if (k.isKeyDown("w") || k.isKeyDown("up")) cameraY -= panSpeed * k.dt();
            if (k.isKeyDown("s") || k.isKeyDown("down")) cameraY += panSpeed * k.dt();
            if (k.isKeyDown("a") || k.isKeyDown("left")) cameraX -= panSpeed * k.dt();
            if (k.isKeyDown("d") || k.isKeyDown("right")) cameraX += panSpeed * k.dt();

            // Edge scrolling (only when not dragging selection box)
            if (!isSelecting) {
                if (mouse.x < EDGE_SCROLL_MARGIN) cameraX -= panSpeed * k.dt();
                if (mouse.x > k.width() - EDGE_SCROLL_MARGIN) cameraX += panSpeed * k.dt();
                if (mouse.y < EDGE_SCROLL_MARGIN) cameraY -= panSpeed * k.dt();
                if (mouse.y > k.height() - EDGE_SCROLL_MARGIN) cameraY += panSpeed * k.dt();
            }
        });

        // Scroll to zoom
        k.onScroll((delta) => {
            const zoomFactor = 1.1;
            if (delta.y < 0) {
                zoom = Math.min(zoom * zoomFactor, 3);
            } else {
                zoom = Math.max(zoom / zoomFactor, 0.3);
            }
        });

        // Time scale controls
        k.onKeyPress("1", () => { gameState.timeScale = 1; });
        k.onKeyPress("2", () => { gameState.timeScale = 2; });
        k.onKeyPress("3", () => { gameState.timeScale = 3; });
        k.onKeyPress("space", () => {
            gameState.timeScale = gameState.timeScale === 0 ? 1 : 0;
        });

        // Click handler for selection and waypoints
        function handleClick() {
            const worldX = (k.mousePos().x - k.width() / 2) / zoom + cameraX;
            const worldY = (k.mousePos().y - k.height() / 2) / zoom + cameraY;
            const clickedHex = pixelToHex(worldX, worldY);

            // Check if ctrl is held (for waypoint placement)
            if (k.isKeyDown("control") || k.isKeyDown("meta")) {
                // Set waypoint for all selected ships
                const selectedShips = getSelectedShips(gameState);
                if (selectedShips.length > 0) {
                    const tile = map.tiles.get(hexKey(clickedHex.q, clickedHex.r));

                    let targetQ = clickedHex.q;
                    let targetR = clickedHex.r;

                    // If land, find nearest coast
                    if (tile && tile.type === 'land') {
                        const coast = findNearestWater(map, clickedHex.q, clickedHex.r);
                        if (coast) {
                            targetQ = coast.q;
                            targetR = coast.r;
                        } else {
                            // No water found - can't set waypoint
                            return;
                        }
                    }

                    // Set waypoint for each selected ship
                    for (const ship of selectedShips) {
                        ship.waypoint = { q: targetQ, r: targetR };
                        ship.path = null;  // Clear cached path to recalculate
                        ship.moveProgress = 0;
                    }
                    console.log(`Set waypoint at (${targetQ}, ${targetR}) for ${selectedShips.length} ship(s)`);
                }
                return;
            }

            // Check if shift is held (for multi-select toggle)
            const isShiftHeld = k.isKeyDown("shift");

            // Try to select a unit at click position
            let foundUnit = false;

            // Check ships first
            for (let i = 0; i < gameState.ships.length; i++) {
                const ship = gameState.ships[i];
                const shipPos = hexToPixel(ship.q, ship.r);
                const dx = worldX - shipPos.x;
                const dy = worldY - shipPos.y;
                const dist = Math.sqrt(dx * dx + dy * dy);

                if (dist < SELECTION_RADIUS) {
                    if (isShiftHeld) {
                        toggleSelection(gameState, 'ship', i);
                    } else {
                        selectUnit(gameState, 'ship', i);
                    }
                    foundUnit = true;
                    console.log(`Selected ship: ${ship.type}`);
                    break;
                }
            }

            // Check ports if no ship found
            if (!foundUnit) {
                for (let i = 0; i < gameState.ports.length; i++) {
                    const port = gameState.ports[i];
                    const portPos = hexToPixel(port.q, port.r);
                    const dx = worldX - portPos.x;
                    const dy = worldY - portPos.y;
                    const dist = Math.sqrt(dx * dx + dy * dy);

                    if (dist < SELECTION_RADIUS) {
                        if (isShiftHeld) {
                            toggleSelection(gameState, 'port', i);
                        } else {
                            selectUnit(gameState, 'port', i);
                        }
                        foundUnit = true;
                        console.log(`Selected port: ${port.type}`);
                        break;
                    }
                }
            }

            // Clear selection if clicked on empty space (only without shift)
            if (!foundUnit && !isShiftHeld) {
                clearSelection(gameState);
            }
        }

        // Selection box handler - select all units within box bounds
        function handleSelectionBox() {
            const halfWidth = k.width() / 2;
            const halfHeight = k.height() / 2;

            // Box bounds in screen coordinates
            const boxLeft = Math.min(selectStartX, selectEndX);
            const boxRight = Math.max(selectStartX, selectEndX);
            const boxTop = Math.min(selectStartY, selectEndY);
            const boxBottom = Math.max(selectStartY, selectEndY);

            // Clear selection first
            clearSelection(gameState);

            // Check each ship
            for (let i = 0; i < gameState.ships.length; i++) {
                const ship = gameState.ships[i];
                const pos = getShipVisualPos(ship);
                const screenX = (pos.x - cameraX) * zoom + halfWidth;
                const screenY = (pos.y - cameraY) * zoom + halfHeight;

                if (screenX >= boxLeft && screenX <= boxRight &&
                    screenY >= boxTop && screenY <= boxBottom) {
                    addToSelection(gameState, 'ship', i);
                }
            }

            // Check each port
            for (let i = 0; i < gameState.ports.length; i++) {
                const port = gameState.ports[i];
                const pos = hexToPixel(port.q, port.r);
                const screenX = (pos.x - cameraX) * zoom + halfWidth;
                const screenY = (pos.y - cameraY) * zoom + halfHeight;

                if (screenX >= boxLeft && screenX <= boxRight &&
                    screenY >= boxTop && screenY <= boxBottom) {
                    addToSelection(gameState, 'port', i);
                }
            }

            const count = gameState.selectedUnits.length;
            if (count > 0) {
                console.log(`Selected ${count} unit(s)`);
            }
        }

        // Center camera on starting position (or map center if no start)
        if (startTile) {
            const startPos = hexToPixel(startTile.q, startTile.r);
            cameraX = startPos.x;
            cameraY = startPos.y;
        } else {
            const centerQ = Math.floor(map.width / 2);
            const centerR = Math.floor(map.height / 2);
            const centerPos = hexToPixel(centerQ, centerR);
            cameraX = centerPos.x;
            cameraY = centerPos.y;
        }
    };
}
