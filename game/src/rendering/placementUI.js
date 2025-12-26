// Placement mode UI rendering: port, settlement, tower placement previews
import { hexToPixel, hexCorners, hexDistance, HEX_SIZE } from "../hex.js";
import { isHexRevealed } from "../fogOfWar.js";
import { TOWERS } from "../sprites/index.js";
import { drawHexRangeFilled, drawHexRangeOutline } from "./renderHelpers.js";

/**
 * Draw a placement highlight for a single hex
 */
function drawPlacementHighlight(ctx, screenX, screenY, isHovered) {
    const { k, scaledHexSize } = ctx;

    const corners = hexCorners(screenX, screenY, scaledHexSize);
    const pts = corners.map(c => k.vec2(c.x, c.y));

    // Highlight color (brighter if hovered)
    const highlightColor = isHovered
        ? k.rgb(100, 255, 100)  // Bright green for hovered
        : k.rgb(80, 180, 80);   // Dimmer green for valid

    // Draw highlight overlay
    k.drawPolygon({
        pts,
        color: highlightColor,
        opacity: isHovered ? 0.5 : 0.25,
    });

    // Draw outline
    for (let i = 0; i < pts.length; i++) {
        const p1 = pts[i];
        const p2 = pts[(i + 1) % pts.length];
        k.drawLine({
            p1, p2,
            width: isHovered ? 3 : 2,
            color: highlightColor,
        });
    }
}

/**
 * Draw hint text at bottom of screen
 */
function drawPlacementHint(ctx, text) {
    const { k, screenWidth, screenHeight } = ctx;
    k.drawText({
        text,
        pos: k.vec2(screenWidth / 2, screenHeight - 60),
        size: 14,
        anchor: "center",
        color: k.rgb(255, 255, 200),
    });
}

/**
 * Draw port placement mode highlights
 */
export function drawPortPlacementMode(ctx, gameState, map, tilePositions, fogState, pixelToHex, isValidPortSite) {
    if (!gameState.portBuildMode.active) return;

    const { k, zoom, cameraX, cameraY, halfWidth, halfHeight, screenWidth, screenHeight, scaledHexSize } = ctx;
    const margin = HEX_SIZE * zoom * 2;

    const builderShip = gameState.ships[gameState.portBuildMode.builderShipIndex];
    const MAX_BUILD_DISTANCE = 5;

    // Get current mouse position in world coords
    const mouseX = k.mousePos().x;
    const mouseY = k.mousePos().y;
    const worldMX = (mouseX - halfWidth) / zoom + cameraX;
    const worldMY = (mouseY - halfHeight) / zoom + cameraY;
    const hoverHex = pixelToHex(worldMX, worldMY);

    // Check if hovered hex is a valid port site AND within range
    const hoverDistance = hexDistance(builderShip.q, builderShip.r, hoverHex.q, hoverHex.r);
    const isValidHover = isValidPortSite(map, hoverHex.q, hoverHex.r, gameState.ports) &&
                         hoverDistance <= MAX_BUILD_DISTANCE;
    gameState.portBuildMode.hoveredHex = isValidHover ? hoverHex : null;

    // Draw highlights on all valid port sites within range
    for (const tile of map.tiles.values()) {
        if (!tile.isPortSite) continue;
        if (!isHexRevealed(fogState, tile.q, tile.r)) continue;

        const dist = hexDistance(builderShip.q, builderShip.r, tile.q, tile.r);
        if (dist > MAX_BUILD_DISTANCE) continue;

        const hasPort = gameState.ports.some(p => p.q === tile.q && p.r === tile.r);
        if (hasPort) continue;

        const pos = tilePositions.get(tile);
        const screenX = (pos.x - cameraX) * zoom + halfWidth;
        const screenY = (pos.y - cameraY) * zoom + halfHeight;

        // Culling
        if (screenX < -margin || screenX > screenWidth + margin ||
            screenY < -margin || screenY > screenHeight + margin) continue;

        const isHovered = gameState.portBuildMode.hoveredHex &&
                          tile.q === gameState.portBuildMode.hoveredHex.q &&
                          tile.r === gameState.portBuildMode.hoveredHex.r;

        drawPlacementHighlight(ctx, screenX, screenY, isHovered);
    }

    drawPlacementHint(ctx, "Click to place port | ESC to cancel");
}

/**
 * Draw settlement placement mode highlights
 */
export function drawSettlementPlacementMode(ctx, gameState, map, tilePositions, fogState, pixelToHex, isValidSettlementSite) {
    if (!gameState.settlementBuildMode.active) return;

    const { k, zoom, cameraX, cameraY, halfWidth, halfHeight, screenWidth, screenHeight, scaledHexSize } = ctx;
    const margin = HEX_SIZE * zoom * 2;

    const builderPort = gameState.ports[gameState.settlementBuildMode.builderPortIndex];
    const MAX_SETTLEMENT_BUILD_DISTANCE = 10;

    // Get current mouse position in world coords
    const mouseX = k.mousePos().x;
    const mouseY = k.mousePos().y;
    const worldMX = (mouseX - halfWidth) / zoom + cameraX;
    const worldMY = (mouseY - halfHeight) / zoom + cameraY;
    const hoverHex = pixelToHex(worldMX, worldMY);

    // Check if hovered hex is valid (including land connectivity check)
    const hoverDistance = hexDistance(builderPort.q, builderPort.r, hoverHex.q, hoverHex.r);
    const isValidHover = isValidSettlementSite(map, hoverHex.q, hoverHex.r, gameState.settlements, gameState.ports, builderPort) &&
                         hoverDistance <= MAX_SETTLEMENT_BUILD_DISTANCE;
    gameState.settlementBuildMode.hoveredHex = isValidHover ? hoverHex : null;

    // Draw highlights on all valid settlement sites within range
    for (const tile of map.tiles.values()) {
        if (tile.type !== 'land') continue;
        if (!isHexRevealed(fogState, tile.q, tile.r)) continue;

        const dist = hexDistance(builderPort.q, builderPort.r, tile.q, tile.r);
        if (dist > MAX_SETTLEMENT_BUILD_DISTANCE) continue;

        // Use full validation including land connectivity
        if (!isValidSettlementSite(map, tile.q, tile.r, gameState.settlements, gameState.ports, builderPort)) continue;

        const pos = tilePositions.get(tile);
        const screenX = (pos.x - cameraX) * zoom + halfWidth;
        const screenY = (pos.y - cameraY) * zoom + halfHeight;

        // Culling
        if (screenX < -margin || screenX > screenWidth + margin ||
            screenY < -margin || screenY > screenHeight + margin) continue;

        const isHovered = gameState.settlementBuildMode.hoveredHex &&
                          tile.q === gameState.settlementBuildMode.hoveredHex.q &&
                          tile.r === gameState.settlementBuildMode.hoveredHex.r;

        drawPlacementHighlight(ctx, screenX, screenY, isHovered);
    }

    drawPlacementHint(ctx, "Click to place settlement | ESC to cancel");
}

/**
 * Draw tower placement mode highlights
 */
export function drawTowerPlacementMode(ctx, gameState, map, tilePositions, fogState, pixelToHex, isValidTowerSite) {
    if (!gameState.towerBuildMode.active) return;

    const { k, zoom, cameraX, cameraY, halfWidth, halfHeight, screenWidth, screenHeight } = ctx;
    const margin = HEX_SIZE * zoom * 2;

    // Get builder position (ship or port)
    let builderQ, builderR;
    if (gameState.towerBuildMode.builderShipIndex !== null) {
        const builderShip = gameState.ships[gameState.towerBuildMode.builderShipIndex];
        builderQ = builderShip.q;
        builderR = builderShip.r;
    } else if (gameState.towerBuildMode.builderPortIndex !== null) {
        const builderPort = gameState.ports[gameState.towerBuildMode.builderPortIndex];
        builderQ = builderPort.q;
        builderR = builderPort.r;
    }
    const MAX_TOWER_BUILD_DISTANCE = 5;

    // Get current mouse position in world coords
    const mouseX = k.mousePos().x;
    const mouseY = k.mousePos().y;
    const worldMX = (mouseX - halfWidth) / zoom + cameraX;
    const worldMY = (mouseY - halfHeight) / zoom + cameraY;
    const hoverHex = pixelToHex(worldMX, worldMY);

    // Check if hovered hex is valid
    const hoverDistance = hexDistance(builderQ, builderR, hoverHex.q, hoverHex.r);
    const isValidHover = isValidTowerSite(map, hoverHex.q, hoverHex.r, gameState.towers, gameState.ports, gameState.settlements) &&
                         hoverDistance <= MAX_TOWER_BUILD_DISTANCE;
    gameState.towerBuildMode.hoveredHex = isValidHover ? hoverHex : null;

    // Draw highlights on all valid tower sites within range
    for (const tile of map.tiles.values()) {
        if (tile.type !== 'land') continue;
        if (!isHexRevealed(fogState, tile.q, tile.r)) continue;

        const dist = hexDistance(builderQ, builderR, tile.q, tile.r);
        if (dist > MAX_TOWER_BUILD_DISTANCE) continue;

        const hasTower = gameState.towers.some(t => t.q === tile.q && t.r === tile.r);
        const hasSettlement = gameState.settlements.some(s => s.q === tile.q && s.r === tile.r);
        const hasPort = gameState.ports.some(p => p.q === tile.q && p.r === tile.r);
        if (hasTower || hasSettlement || hasPort) continue;

        const pos = tilePositions.get(tile);
        const screenX = (pos.x - cameraX) * zoom + halfWidth;
        const screenY = (pos.y - cameraY) * zoom + halfHeight;

        // Culling
        if (screenX < -margin || screenX > screenWidth + margin ||
            screenY < -margin || screenY > screenHeight + margin) continue;

        const isHovered = gameState.towerBuildMode.hoveredHex &&
                          tile.q === gameState.towerBuildMode.hoveredHex.q &&
                          tile.r === gameState.towerBuildMode.hoveredHex.r;

        drawPlacementHighlight(ctx, screenX, screenY, isHovered);
    }

    // Draw attack range preview when hovering a valid placement hex
    if (gameState.towerBuildMode.hoveredHex) {
        const hoverQ = gameState.towerBuildMode.hoveredHex.q;
        const hoverR = gameState.towerBuildMode.hoveredHex.r;
        const attackRange = TOWERS.tower.attackRange;
        const rangeColor = k.rgb(100, 200, 255);
        drawHexRangeFilled(ctx, hoverQ, hoverR, attackRange, rangeColor, 0.2);
        drawHexRangeOutline(ctx, hoverQ, hoverR, attackRange, rangeColor, 2);
    }

    drawPlacementHint(ctx, "Click to place tower | ESC to cancel");
}

/**
 * Draw all placement mode UI elements
 */
export function drawAllPlacementUI(ctx, gameState, map, tilePositions, fogState, pixelToHex, validators) {
    const { isValidPortSite, isValidSettlementSite, isValidTowerSite } = validators;

    drawPortPlacementMode(ctx, gameState, map, tilePositions, fogState, pixelToHex, isValidPortSite);
    drawSettlementPlacementMode(ctx, gameState, map, tilePositions, fogState, pixelToHex, isValidSettlementSite);
    drawTowerPlacementMode(ctx, gameState, map, tilePositions, fogState, pixelToHex, isValidTowerSite);
}
