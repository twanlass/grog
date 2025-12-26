// Tile and fog of war rendering
import { hexCorners, HEX_SIZE } from "../hex.js";
import { isHexRevealed } from "../fogOfWar.js";

/**
 * Draw all visible map tiles
 * @param {object} ctx - Render context
 * @param {Map} map - The game map
 * @param {Map} tilePositions - Pre-calculated tile world positions
 * @param {Map} tileColors - Pre-calculated tile colors
 * @param {Map} tileStipples - Pre-calculated stipple data per tile
 * @param {number} stippleAnimTime - Animation time for water twinkling
 */
export function drawTiles(ctx, map, tilePositions, tileColors, tileStipples, stippleAnimTime) {
    const { k, zoom, cameraX, cameraY, halfWidth, halfHeight, screenWidth, screenHeight } = ctx;
    const margin = HEX_SIZE * zoom * 2;
    const scaledSize = HEX_SIZE * zoom;

    for (const tile of map.tiles.values()) {
        const pos = tilePositions.get(tile);
        const screenX = (pos.x - cameraX) * zoom + halfWidth;
        const screenY = (pos.y - cameraY) * zoom + halfHeight;

        // Culling - skip off-screen hexes
        if (screenX < -margin || screenX > screenWidth + margin ||
            screenY < -margin || screenY > screenHeight + margin) {
            continue;
        }

        // Get pre-calculated corners
        const corners = hexCorners(screenX, screenY, scaledSize);
        const pts = corners.map(c => k.vec2(c.x, c.y));

        // Draw hex base
        k.drawPolygon({
            pts,
            color: tileColors.get(tile),
        });

        // Draw stipple dots (only when zoomed in enough)
        if (zoom > 0.5) {
            const stipple = tileStipples.get(tile);
            const dotSize = Math.max(1.5, 2.5 * zoom);
            const isWater = tile.type === 'deep_ocean' || tile.type === 'shallow';

            for (const dot of stipple.dots) {
                // Twinkling effect for water tiles
                if (isWater) {
                    const dotPhase = Math.sin(dot.rx * 3 + dot.ry * 5);
                    const blinkCycle = Math.sin(stippleAnimTime * 3 + dotPhase * Math.PI);
                    if (blinkCycle < 0) continue;  // Skip this dot half the time
                }

                const dotX = screenX + dot.rx * scaledSize * 0.65;
                const dotY = screenY + dot.ry * scaledSize * 0.65;
                k.drawCircle({
                    pos: k.vec2(dotX, dotY),
                    radius: dotSize,
                    color: stipple.colors[dot.colorIdx],
                });
            }
        }
    }
}

/**
 * Draw fog of war overlay for unrevealed hexes
 * @param {object} ctx - Render context
 * @param {Map} map - The game map
 * @param {Map} tilePositions - Pre-calculated tile world positions
 * @param {object} fogState - Fog of war state
 */
export function drawFogOfWar(ctx, map, tilePositions, fogState) {
    const { k, zoom, cameraX, cameraY, halfWidth, halfHeight, screenWidth, screenHeight } = ctx;
    const margin = HEX_SIZE * zoom * 2;
    const scaledSize = HEX_SIZE * zoom;

    const fogBaseColor = k.rgb(15, 20, 30);
    const fogHatchColor = k.rgb(25, 35, 50);
    const hatchSpacing = Math.max(4, 6 * zoom);

    for (const tile of map.tiles.values()) {
        // Skip revealed hexes
        if (isHexRevealed(fogState, tile.q, tile.r)) continue;

        const pos = tilePositions.get(tile);
        const screenX = (pos.x - cameraX) * zoom + halfWidth;
        const screenY = (pos.y - cameraY) * zoom + halfHeight;

        // Culling - skip off-screen hexes
        if (screenX < -margin || screenX > screenWidth + margin ||
            screenY < -margin || screenY > screenHeight + margin) {
            continue;
        }

        const corners = hexCorners(screenX, screenY, scaledSize);
        const pts = corners.map(c => k.vec2(c.x, c.y));

        // Draw fog base polygon
        k.drawPolygon({
            pts,
            color: fogBaseColor,
            opacity: 0.92,
        });

        // Draw diagonal hatching pattern
        const hexRadius = scaledSize;
        for (let i = -4; i <= 4; i++) {
            const offset = i * hatchSpacing;
            k.drawLine({
                p1: k.vec2(screenX + offset - hexRadius, screenY - hexRadius),
                p2: k.vec2(screenX + offset + hexRadius, screenY + hexRadius),
                width: 1,
                color: fogHatchColor,
                opacity: 0.4,
            });
        }
    }
}
