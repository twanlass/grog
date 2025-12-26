// Selection UI rendering: selection indicators, waypoints, attack targets, paths
import { hexToPixel, hexCorners, HEX_SIZE } from "../hex.js";
import { isSelected } from "../gameState.js";
import { TOWERS } from "../sprites/index.js";
import { drawHexRangeFilled, drawHexRangeOutline } from "./renderHelpers.js";

/**
 * Draw selection indicator for a single unit (hex outline)
 */
function drawSelectionHexOutline(ctx, q, r, color, lineWidth = 3) {
    const { k, zoom, cameraX, cameraY, halfWidth, halfHeight, scaledHexSize } = ctx;
    const pos = hexToPixel(q, r);
    const screenX = (pos.x - cameraX) * zoom + halfWidth;
    const screenY = (pos.y - cameraY) * zoom + halfHeight;

    const corners = hexCorners(screenX, screenY, scaledHexSize);
    const pts = corners.map(c => k.vec2(c.x, c.y));

    for (let j = 0; j < pts.length; j++) {
        const p1 = pts[j];
        const p2 = pts[(j + 1) % pts.length];
        k.drawLine({ p1, p2, width: lineWidth, color });
    }
}

/**
 * Draw waypoint marker (X marks the spot!)
 */
function drawWaypointMarker(ctx, q, r) {
    const { k, zoom, cameraX, cameraY, halfWidth, halfHeight } = ctx;
    const wpPos = hexToPixel(q, r);
    const wpScreenX = (wpPos.x - cameraX) * zoom + halfWidth;
    const wpScreenY = (wpPos.y - cameraY) * zoom + halfHeight;

    const wpSize = HEX_SIZE * zoom * 0.3;
    const xWidth = 4 * zoom;
    const xColor = k.rgb(180, 40, 40);

    // Rotate 6 degrees clockwise
    const angle = 6 * Math.PI / 180;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);

    // Draw chunky X with two crossing lines (rotated)
    k.drawLine({
        p1: k.vec2(wpScreenX + (-wpSize * cos - -wpSize * sin), wpScreenY + (-wpSize * sin + -wpSize * cos)),
        p2: k.vec2(wpScreenX + (wpSize * cos - wpSize * sin), wpScreenY + (wpSize * sin + wpSize * cos)),
        width: xWidth,
        color: xColor,
    });
    k.drawLine({
        p1: k.vec2(wpScreenX + (wpSize * cos - -wpSize * sin), wpScreenY + (wpSize * sin + -wpSize * cos)),
        p2: k.vec2(wpScreenX + (-wpSize * cos - wpSize * sin), wpScreenY + (-wpSize * sin + wpSize * cos)),
        width: xWidth,
        color: xColor,
    });
}

/**
 * Draw dashed path from ship to waypoint
 */
function drawDashedPath(ctx, path, startScreenX, startScreenY) {
    const { k, zoom, cameraX, cameraY, halfWidth, halfHeight } = ctx;

    let prevX = startScreenX;
    let prevY = startScreenY;
    const dashLength = 8 * zoom;
    const gapLength = 6 * zoom;
    const pathColor = k.rgb(255, 165, 0);

    for (const node of path) {
        const nodePos = hexToPixel(node.q, node.r);
        const nodeScreenX = (nodePos.x - cameraX) * zoom + halfWidth;
        const nodeScreenY = (nodePos.y - cameraY) * zoom + halfHeight;

        // Calculate segment properties
        const dx = nodeScreenX - prevX;
        const dy = nodeScreenY - prevY;
        const segmentLength = Math.sqrt(dx * dx + dy * dy);
        const nx = dx / segmentLength;
        const ny = dy / segmentLength;

        // Draw dashed line segment
        let traveled = 0;
        while (traveled < segmentLength) {
            const dashStart = traveled;
            const dashEnd = Math.min(traveled + dashLength, segmentLength);

            k.drawLine({
                p1: k.vec2(prevX + nx * dashStart, prevY + ny * dashStart),
                p2: k.vec2(prevX + nx * dashEnd, prevY + ny * dashEnd),
                width: 2,
                color: pathColor,
                opacity: 0.8,
            });

            traveled += dashLength + gapLength;
        }

        prevX = nodeScreenX;
        prevY = nodeScreenY;
    }
}

/**
 * Draw all selection indicators for ships
 * @param {function} getShipVisualPosLocal - Function to get ship visual position
 */
export function drawShipSelectionIndicators(ctx, gameState, getShipVisualPosLocal) {
    const { k, zoom, cameraX, cameraY, halfWidth, halfHeight, scaledHexSize } = ctx;
    const selectionColor = k.rgb(255, 220, 50);

    for (let i = 0; i < gameState.ships.length; i++) {
        if (!isSelected(gameState, 'ship', i)) continue;
        const ship = gameState.ships[i];
        const isMoving = ship.path && ship.path.length > 0;

        // Calculate screen position (needed for path drawing)
        const pos = hexToPixel(ship.q, ship.r);
        const screenX = (pos.x - cameraX) * zoom + halfWidth;
        const screenY = (pos.y - cameraY) * zoom + halfHeight;

        // Only show hex outline when stationary
        if (!isMoving) {
            drawSelectionHexOutline(ctx, ship.q, ship.r, selectionColor);
        }

        // Draw attack target indicator (red hex outline) or waypoint marker
        if (ship.attackTarget && ship.attackTarget.type === 'ship') {
            const target = gameState.ships[ship.attackTarget.index];
            if (target) {
                const targetIsMoving = target.path && target.path.length > 0;

                // Only show hex outline when target is stationary
                if (!targetIsMoving) {
                    const attackColor = k.rgb(220, 50, 50);
                    drawSelectionHexOutline(ctx, target.q, target.r, attackColor);
                }
            }
        } else if (ship.waypoint) {
            drawWaypointMarker(ctx, ship.waypoint.q, ship.waypoint.r);

            // Draw A* path from ship to waypoint (dashed orange line)
            if (ship.path && ship.path.length > 0) {
                drawDashedPath(ctx, ship.path, screenX, screenY);
            }
        }
    }
}

/**
 * Draw selection indicators for ports
 */
export function drawPortSelectionIndicators(ctx, gameState) {
    const { k } = ctx;
    const selectionColor = k.rgb(255, 220, 50);

    for (let i = 0; i < gameState.ports.length; i++) {
        if (!isSelected(gameState, 'port', i)) continue;
        const port = gameState.ports[i];
        drawSelectionHexOutline(ctx, port.q, port.r, selectionColor);
    }
}

/**
 * Draw selection indicators for settlements
 */
export function drawSettlementSelectionIndicators(ctx, gameState) {
    const { k } = ctx;
    const selectionColor = k.rgb(255, 220, 50);

    for (let i = 0; i < gameState.settlements.length; i++) {
        if (!isSelected(gameState, 'settlement', i)) continue;
        const settlement = gameState.settlements[i];
        drawSelectionHexOutline(ctx, settlement.q, settlement.r, selectionColor);
    }
}

/**
 * Draw selection indicators and attack range for towers
 */
export function drawTowerSelectionIndicators(ctx, gameState) {
    const { k, cameraX, cameraY } = ctx;
    const selectionColor = k.rgb(255, 220, 50);

    for (let i = 0; i < gameState.towers.length; i++) {
        if (!isSelected(gameState, 'tower', i)) continue;
        const tower = gameState.towers[i];

        // Draw selection outline
        drawSelectionHexOutline(ctx, tower.q, tower.r, selectionColor);

        // Draw attack range for completed towers
        if (!tower.construction) {
            const attackRange = TOWERS[tower.type].attackRange;
            const rangeColor = k.rgb(100, 200, 255);
            drawHexRangeFilled(ctx, tower.q, tower.r, attackRange, rangeColor, 0.2);
            drawHexRangeOutline(ctx, tower.q, tower.r, attackRange, rangeColor, 2);
        }
    }
}

/**
 * Draw selection box (drag-select rectangle)
 */
export function drawSelectionBox(ctx, isSelecting, selectStartX, selectStartY, selectEndX, selectEndY) {
    if (!isSelecting) return;

    const { k } = ctx;
    const boxX = Math.min(selectStartX, selectEndX);
    const boxY = Math.min(selectStartY, selectEndY);
    const boxW = Math.abs(selectEndX - selectStartX);
    const boxH = Math.abs(selectEndY - selectStartY);

    // Fill
    k.drawRect({
        pos: k.vec2(boxX, boxY),
        width: boxW,
        height: boxH,
        color: k.rgb(100, 200, 255),
        opacity: 0.2,
    });

    // Outline
    k.drawRect({
        pos: k.vec2(boxX, boxY),
        width: boxW,
        height: boxH,
        fill: false,
        outline: { width: 2, color: k.rgb(100, 200, 255) },
    });
}

/**
 * Draw hover highlight for any unit under the mouse cursor
 */
export function drawUnitHoverHighlight(ctx, gameState, getShipVisualPos, selectionRadius) {
    const { k, zoom, cameraX, cameraY, halfWidth, halfHeight } = ctx;

    const mouseX = k.mousePos().x;
    const mouseY = k.mousePos().y;
    const worldMX = (mouseX - halfWidth) / zoom + cameraX;
    const worldMY = (mouseY - halfHeight) / zoom + cameraY;

    // Helper to draw the highlight at a position
    const drawHighlight = (worldX, worldY) => {
        const screenX = (worldX - cameraX) * zoom + halfWidth;
        const screenY = (worldY - cameraY) * zoom + halfHeight;
        const corners = hexCorners(screenX, screenY, HEX_SIZE * zoom);

        // Draw filled hex with transparency
        k.drawPolygon({
            pts: corners.map(c => k.vec2(c.x, c.y)),
            color: k.rgb(255, 255, 255),
            opacity: 0.15,
        });

        // Draw subtle outline
        const pts = corners.map(c => k.vec2(c.x, c.y));
        for (let j = 0; j < pts.length; j++) {
            k.drawLine({
                p1: pts[j],
                p2: pts[(j + 1) % pts.length],
                width: 2,
                color: k.rgb(255, 255, 255),
                opacity: 0.3,
            });
        }
    };

    // Check ships (use visual position for smooth movement)
    for (const ship of gameState.ships) {
        const { x: shipX, y: shipY } = getShipVisualPos(ship);
        const dx = worldMX - shipX;
        const dy = worldMY - shipY;
        if (Math.sqrt(dx * dx + dy * dy) < selectionRadius) {
            drawHighlight(shipX, shipY);
            return;
        }
    }

    // Check ports
    for (const port of gameState.ports) {
        const pos = hexToPixel(port.q, port.r);
        const dx = worldMX - pos.x;
        const dy = worldMY - pos.y;
        if (Math.sqrt(dx * dx + dy * dy) < selectionRadius) {
            drawHighlight(pos.x, pos.y);
            return;
        }
    }

    // Check settlements
    for (const settlement of gameState.settlements) {
        const pos = hexToPixel(settlement.q, settlement.r);
        const dx = worldMX - pos.x;
        const dy = worldMY - pos.y;
        if (Math.sqrt(dx * dx + dy * dy) < selectionRadius) {
            drawHighlight(pos.x, pos.y);
            return;
        }
    }

    // Check towers
    for (const tower of gameState.towers) {
        const pos = hexToPixel(tower.q, tower.r);
        const dx = worldMX - pos.x;
        const dy = worldMY - pos.y;
        if (Math.sqrt(dx * dx + dy * dy) < selectionRadius) {
            drawHighlight(pos.x, pos.y);
            return;
        }
    }
}

/**
 * Draw all selection UI elements
 */
export function drawAllSelectionUI(ctx, gameState, getShipVisualPosLocal, selectionState) {
    drawShipSelectionIndicators(ctx, gameState, getShipVisualPosLocal);
    drawPortSelectionIndicators(ctx, gameState);
    drawSettlementSelectionIndicators(ctx, gameState);
    drawTowerSelectionIndicators(ctx, gameState);

    if (selectionState) {
        drawSelectionBox(
            ctx,
            selectionState.isSelecting,
            selectionState.startX,
            selectionState.startY,
            selectionState.endX,
            selectionState.endY
        );
    }
}
