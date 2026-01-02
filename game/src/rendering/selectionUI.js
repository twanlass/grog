// Selection UI rendering: selection indicators, waypoints, attack targets, paths
import { hexToPixel, hexCorners, hexNeighbors, HEX_SIZE } from "../hex.js";
import { isSelected } from "../gameState.js";
import { TOWERS } from "../sprites/index.js";
import { drawHexRangeFilled, drawHexRangeOutline } from "./renderHelpers.js";
import { findPath } from "../pathfinding.js";
import { shouldRenderEntity } from "../fogOfWar.js";

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
 * Draw selection indicator at a world position (for moving units)
 */
function drawSelectionAtPosition(ctx, worldX, worldY, color, lineWidth = 3) {
    const { k, zoom, cameraX, cameraY, halfWidth, halfHeight, scaledHexSize } = ctx;
    const screenX = (worldX - cameraX) * zoom + halfWidth;
    const screenY = (worldY - cameraY) * zoom + halfHeight;

    const corners = hexCorners(screenX, screenY, scaledHexSize);
    const pts = corners.map(c => k.vec2(c.x, c.y));

    for (let j = 0; j < pts.length; j++) {
        const p1 = pts[j];
        const p2 = pts[(j + 1) % pts.length];
        k.drawLine({ p1, p2, width: lineWidth, color });
    }
}

/**
 * Draw merged selection outlines - skips edges shared between adjacent selected hexes
 */
function drawMergedSelectionOutlines(ctx, selectedHexes, color, lineWidth = 3) {
    const { k, zoom, cameraX, cameraY, halfWidth, halfHeight, scaledHexSize } = ctx;

    // Build set of selected hex keys for fast lookup
    const selectedKeys = new Set(selectedHexes.map(h => `${h.q},${h.r}`));

    for (const hex of selectedHexes) {
        const pos = hexToPixel(hex.q, hex.r);
        const screenX = (pos.x - cameraX) * zoom + halfWidth;
        const screenY = (pos.y - cameraY) * zoom + halfHeight;
        const corners = hexCorners(screenX, screenY, scaledHexSize);
        const neighbors = hexNeighbors(hex.q, hex.r);

        // Only draw edges where neighbor is NOT selected
        for (let i = 0; i < 6; i++) {
            const neighborKey = `${neighbors[i].q},${neighbors[i].r}`;
            if (selectedKeys.has(neighborKey)) continue;  // Skip shared edges

            const c1 = (6 - i) % 6;
            const c2 = (c1 + 1) % 6;
            k.drawLine({
                p1: k.vec2(corners[c1].x, corners[c1].y),
                p2: k.vec2(corners[c2].x, corners[c2].y),
                width: lineWidth,
                color: color,
                cap: "round",
            });
        }
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
 * Draw patrol waypoint marker (dot)
 */
function drawPatrolWaypointMarker(ctx, q, r) {
    const { k, zoom, cameraX, cameraY, halfWidth, halfHeight } = ctx;
    const wpPos = hexToPixel(q, r);
    const wpScreenX = (wpPos.x - cameraX) * zoom + halfWidth;
    const wpScreenY = (wpPos.y - cameraY) * zoom + halfHeight;

    const dotRadius = 5 * zoom;
    const dotColor = k.rgb(180, 40, 40);

    k.drawCircle({
        pos: k.vec2(wpScreenX, wpScreenY),
        radius: dotRadius,
        color: dotColor,
    });
}

/**
 * Draw rally point flag marker (for port spawn destinations)
 */
function drawRallyPointFlag(ctx, q, r) {
    const { k, zoom, cameraX, cameraY, halfWidth, halfHeight } = ctx;
    const pos = hexToPixel(q, r);
    const screenX = (pos.x - cameraX) * zoom + halfWidth;
    const screenY = (pos.y - cameraY) * zoom + halfHeight;

    const scale = zoom * 1.5;

    k.drawSprite({
        sprite: "rally-point",
        pos: k.vec2(screenX, screenY),
        anchor: "center",
        scale: k.vec2(scale, scale),
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
 * Draw additional ship selection indicators (waypoints, attack targets, paths)
 * Note: Hex outlines are now drawn by drawAllSelectionUI using merged outlines
 */
export function drawShipSelectionIndicators(ctx, gameState, getShipVisualPosLocal) {
    const { k, zoom, cameraX, cameraY, halfWidth, halfHeight } = ctx;

    let pathDrawn = false; // Only show path for first selected ship

    for (let i = 0; i < gameState.ships.length; i++) {
        if (!isSelected(gameState, 'ship', i)) continue;
        const ship = gameState.ships[i];

        // Calculate screen position (needed for path drawing)
        const pos = hexToPixel(ship.q, ship.r);
        const screenX = (pos.x - cameraX) * zoom + halfWidth;
        const screenY = (pos.y - cameraY) * zoom + halfHeight;

        // Draw A* path from ship to waypoint (dashed orange line)
        // Note: Waypoint marker itself is drawn earlier by drawWaypointsAndRallyPoints
        // Only draw for the first selected ship when multiple are selected
        // TODO: Re-enable via settings/options menu
        const showPathLine = false;
        if (showPathLine && !pathDrawn && ship.waypoints.length > 0 && ship.path && ship.path.length > 0) {
            drawDashedPath(ctx, ship.path, screenX, screenY);
            pathDrawn = true;
        }
    }

    // Draw red hex outline for globally tracked attack target
    // This persists until a new player unit is selected or new attack target chosen
    if (gameState.attackTargetShipIndex !== null) {
        const target = gameState.ships[gameState.attackTargetShipIndex];
        if (target && target.type === 'pirate') {
            const targetIsMoving = target.path && target.path.length > 0;
            // Only show hex outline when target is stationary
            if (!targetIsMoving) {
                const attackColor = k.rgb(220, 50, 50);
                drawSelectionHexOutline(ctx, target.q, target.r, attackColor);
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
 * Draw attack range indicators for selected towers
 * Note: Hex outlines are now drawn by drawAllSelectionUI using merged outlines
 */
export function drawTowerSelectionIndicators(ctx, gameState) {
    const { k } = ctx;

    for (let i = 0; i < gameState.towers.length; i++) {
        if (!isSelected(gameState, 'tower', i)) continue;
        const tower = gameState.towers[i];

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
export function drawUnitHoverHighlight(ctx, gameState, getShipVisualPos, selectionRadius, fogState) {
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
        // Skip non-player units in fog
        if (!shouldRenderEntity(fogState, ship)) continue;
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
        // Skip non-player units in fog
        if (!shouldRenderEntity(fogState, port)) continue;
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
        // Skip non-player units in fog
        if (!shouldRenderEntity(fogState, settlement)) continue;
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
        // Skip non-player units in fog
        if (!shouldRenderEntity(fogState, tower)) continue;
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
 * Draw dashed route line from ship through all waypoints using A* paths
 */
function drawWaypointRoute(ctx, ship, getShipVisualPos, map) {
    const { k, zoom, cameraX, cameraY, halfWidth, halfHeight } = ctx;

    if (ship.waypoints.length === 0) return;

    const dashLength = 8 * zoom;
    const gapLength = 6 * zoom;
    const pathColor = k.rgb(180, 40, 40);  // Same red as waypoint X marker

    // Helper to draw dashed line between two screen points
    function drawDashedSegment(fromX, fromY, toX, toY) {
        const dx = toX - fromX;
        const dy = toY - fromY;
        const segmentLength = Math.sqrt(dx * dx + dy * dy);

        if (segmentLength > 0) {
            const nx = dx / segmentLength;
            const ny = dy / segmentLength;

            let traveled = 0;
            while (traveled < segmentLength) {
                const dashStart = traveled;
                const dashEnd = Math.min(traveled + dashLength, segmentLength);

                k.drawLine({
                    p1: k.vec2(fromX + nx * dashStart, fromY + ny * dashStart),
                    p2: k.vec2(fromX + nx * dashEnd, fromY + ny * dashEnd),
                    width: 2,
                    color: pathColor,
                    opacity: 0.8,
                });

                traveled += dashLength + gapLength;
            }
        }
    }

    // Helper to draw A* path as dashed line
    function drawPathSegments(path, startX, startY) {
        let prevX = startX;
        let prevY = startY;

        for (const node of path) {
            const nodePos = hexToPixel(node.q, node.r);
            const nodeScreenX = (nodePos.x - cameraX) * zoom + halfWidth;
            const nodeScreenY = (nodePos.y - cameraY) * zoom + halfHeight;

            drawDashedSegment(prevX, prevY, nodeScreenX, nodeScreenY);

            prevX = nodeScreenX;
            prevY = nodeScreenY;
        }

        return { x: prevX, y: prevY };
    }

    // Start from ship's visual position
    const shipPos = getShipVisualPos ? getShipVisualPos(ship) : hexToPixel(ship.q, ship.r);
    let currentX = (shipPos.x - cameraX) * zoom + halfWidth;
    let currentY = (shipPos.y - cameraY) * zoom + halfHeight;
    let currentQ = ship.q;
    let currentR = ship.r;

    // For the first waypoint, use ship's existing path if available
    if (ship.path && ship.path.length > 0) {
        const endPos = drawPathSegments(ship.path, currentX, currentY);
        currentX = endPos.x;
        currentY = endPos.y;
        // Update current position to end of path (should be first waypoint)
        const lastNode = ship.path[ship.path.length - 1];
        currentQ = lastNode.q;
        currentR = lastNode.r;
    }

    // For subsequent waypoints, calculate A* paths between them
    for (let i = 1; i < ship.waypoints.length; i++) {
        const prevWp = ship.waypoints[i - 1];
        const wp = ship.waypoints[i];

        // Calculate A* path from previous waypoint to this one
        const path = findPath(map, prevWp.q, prevWp.r, wp.q, wp.r, new Set());

        if (path && path.length > 0) {
            // Start from previous waypoint position
            const prevWpPos = hexToPixel(prevWp.q, prevWp.r);
            const startX = (prevWpPos.x - cameraX) * zoom + halfWidth;
            const startY = (prevWpPos.y - cameraY) * zoom + halfHeight;

            drawPathSegments(path, startX, startY);
        } else {
            // Fallback to straight line if no path found
            const prevWpPos = hexToPixel(prevWp.q, prevWp.r);
            const wpPos = hexToPixel(wp.q, wp.r);
            const startX = (prevWpPos.x - cameraX) * zoom + halfWidth;
            const startY = (prevWpPos.y - cameraY) * zoom + halfHeight;
            const endX = (wpPos.x - cameraX) * zoom + halfWidth;
            const endY = (wpPos.y - cameraY) * zoom + halfHeight;

            drawDashedSegment(startX, startY, endX, endY);
        }
    }
}

/**
 * Draw solid patrol route line connecting all patrol waypoints in a loop
 */
function drawPatrolRoute(ctx, ship, getShipVisualPos, map) {
    const { k, zoom, cameraX, cameraY, halfWidth, halfHeight } = ctx;

    if (ship.patrolRoute.length === 0) return;

    const pathColor = k.rgb(180, 40, 40);
    const lineWidth = 2;

    // Helper to draw solid line between two screen points
    function drawSolidSegment(fromX, fromY, toX, toY) {
        k.drawLine({
            p1: k.vec2(fromX, fromY),
            p2: k.vec2(toX, toY),
            width: lineWidth,
            color: pathColor,
            opacity: 0.8,
        });
    }

    // Helper to draw A* path as solid line
    function drawPathSegments(path, startX, startY) {
        let prevX = startX;
        let prevY = startY;

        for (const node of path) {
            const nodePos = hexToPixel(node.q, node.r);
            const nodeScreenX = (nodePos.x - cameraX) * zoom + halfWidth;
            const nodeScreenY = (nodePos.y - cameraY) * zoom + halfHeight;

            drawSolidSegment(prevX, prevY, nodeScreenX, nodeScreenY);

            prevX = nodeScreenX;
            prevY = nodeScreenY;
        }

        return { x: prevX, y: prevY };
    }

    // Draw from ship to first waypoint (current path)
    const shipPos = getShipVisualPos ? getShipVisualPos(ship) : hexToPixel(ship.q, ship.r);
    let currentX = (shipPos.x - cameraX) * zoom + halfWidth;
    let currentY = (shipPos.y - cameraY) * zoom + halfHeight;

    if (ship.path && ship.path.length > 0) {
        drawPathSegments(ship.path, currentX, currentY);
    }

    // Draw connections between all patrol waypoints
    for (let i = 0; i < ship.patrolRoute.length; i++) {
        const wp = ship.patrolRoute[i];
        const nextWp = ship.patrolRoute[(i + 1) % ship.patrolRoute.length];

        const path = findPath(map, wp.q, wp.r, nextWp.q, nextWp.r, new Set());

        const wpPos = hexToPixel(wp.q, wp.r);
        const startX = (wpPos.x - cameraX) * zoom + halfWidth;
        const startY = (wpPos.y - cameraY) * zoom + halfHeight;

        if (path && path.length > 0) {
            drawPathSegments(path, startX, startY);
        } else {
            // Fallback to straight line
            const nextWpPos = hexToPixel(nextWp.q, nextWp.r);
            const endX = (nextWpPos.x - cameraX) * zoom + halfWidth;
            const endY = (nextWpPos.y - cameraY) * zoom + halfHeight;
            drawSolidSegment(startX, startY, endX, endY);
        }
    }
}

/**
 * Draw waypoints and rally points (should be called BEFORE units to render underneath)
 */
export function drawWaypointsAndRallyPoints(ctx, gameState, getShipVisualPos, map) {
    // Draw ship waypoints
    for (let i = 0; i < gameState.ships.length; i++) {
        if (!isSelected(gameState, 'ship', i)) continue;
        const ship = gameState.ships[i];

        // Only draw waypoints if not attacking (attack has its own indicator)
        if (!ship.attackTarget) {
            if (ship.isPatrolling && ship.patrolRoute.length > 0) {
                // Patrol mode: solid lines, dots for markers, always show full loop
                drawPatrolRoute(ctx, ship, getShipVisualPos, map);
                for (const wp of ship.patrolRoute) {
                    drawPatrolWaypointMarker(ctx, wp.q, wp.r);
                }
            } else if (ship.waypoints.length > 0) {
                // Regular waypoints: dashed lines, X markers
                if (ship.showRouteLine || ship.waypoints.length > 1) {
                    drawWaypointRoute(ctx, ship, getShipVisualPos, map);
                }
                for (const wp of ship.waypoints) {
                    drawWaypointMarker(ctx, wp.q, wp.r);
                }
            }
        }
    }

    // Draw port rally points
    for (let i = 0; i < gameState.ports.length; i++) {
        if (!isSelected(gameState, 'port', i)) continue;
        const port = gameState.ports[i];
        if (port.rallyPoint) {
            drawRallyPointFlag(ctx, port.rallyPoint.q, port.rallyPoint.r);
        }
    }
}

/**
 * Draw all selection UI elements (selection outlines, paths, attack targets)
 */
export function drawAllSelectionUI(ctx, gameState, getShipVisualPosLocal, selectionState) {
    const { k } = ctx;
    const selectionColor = k.rgb(255, 220, 50);

    // Collect all selected stationary unit hexes for merged outline
    const selectedHexes = [];
    // Track moving ships separately (they need visual position indicators)
    const movingSelectedShips = [];

    // Collect selected ships - stationary ones go to merged outline, moving ones to separate list
    for (let i = 0; i < gameState.ships.length; i++) {
        if (!isSelected(gameState, 'ship', i)) continue;
        const ship = gameState.ships[i];
        const isMoving = ship.path && ship.path.length > 0;
        if (!isMoving) {
            selectedHexes.push({ q: ship.q, r: ship.r });
        } else {
            movingSelectedShips.push(ship);
        }
    }

    // Collect selected ports
    for (let i = 0; i < gameState.ports.length; i++) {
        if (!isSelected(gameState, 'port', i)) continue;
        const port = gameState.ports[i];
        selectedHexes.push({ q: port.q, r: port.r });
    }

    // Collect selected settlements
    for (let i = 0; i < gameState.settlements.length; i++) {
        if (!isSelected(gameState, 'settlement', i)) continue;
        const settlement = gameState.settlements[i];
        selectedHexes.push({ q: settlement.q, r: settlement.r });
    }

    // Collect selected towers
    for (let i = 0; i < gameState.towers.length; i++) {
        if (!isSelected(gameState, 'tower', i)) continue;
        const tower = gameState.towers[i];
        selectedHexes.push({ q: tower.q, r: tower.r });
    }

    // Draw merged selection outlines for all selected units
    if (selectedHexes.length > 0) {
        drawMergedSelectionOutlines(ctx, selectedHexes, selectionColor);
    }

    // Draw selection indicators for moving ships at their visual position
    for (const ship of movingSelectedShips) {
        const pos = getShipVisualPosLocal(ship);
        drawSelectionAtPosition(ctx, pos.x, pos.y, selectionColor);
    }

    // Draw additional ship-specific indicators (attack targets, paths - waypoints drawn earlier)
    drawShipSelectionIndicators(ctx, gameState, getShipVisualPosLocal);

    // Draw tower attack range indicators
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
