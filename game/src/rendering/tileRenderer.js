// Tile and fog of war rendering
import { hexCorners, HEX_SIZE } from "../hex.js";
import { isHexExplored, isHexVisible, getHexFogOpacity } from "../fogOfWar.js";

// Decoration rendering config
const TREE_SCALE = 1.4;        // Tree size multiplier (base * zoom)
const PALM_SCALE = 2.4;        // Palm tree size multiplier
const GRASS_LENGTH = 4;        // Grass blade length in pixels (scaled by zoom)

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
 * Draw decorations (grass, trees) on land hexes
 * @param {object} ctx - Render context
 * @param {Map} map - The game map
 * @param {Map} tilePositions - Pre-calculated tile world positions
 * @param {Map} tileDecorations - Pre-calculated decoration data per tile
 * @param {object} gameState - Game state (to check for settlements)
 */
export function drawDecorations(ctx, map, tilePositions, tileDecorations, gameState) {
    const { k, zoom, cameraX, cameraY, halfWidth, halfHeight, screenWidth, screenHeight, scaledHexSize } = ctx;
    const margin = HEX_SIZE * zoom * 2;

    // Build set of hexes with settlements for quick lookup
    const settlementHexes = new Set();
    for (const s of gameState.settlements) {
        settlementHexes.add(`${s.q},${s.r}`);
    }
    // Also skip hexes with towers
    for (const t of gameState.towers) {
        settlementHexes.add(`${t.q},${t.r}`);
    }

    for (const [key, decorations] of tileDecorations) {
        // Skip if settlement or tower built here
        if (settlementHexes.has(key)) continue;

        const tile = map.tiles.get(key);
        if (!tile) continue;

        const pos = tilePositions.get(tile);
        const screenX = (pos.x - cameraX) * zoom + halfWidth;
        const screenY = (pos.y - cameraY) * zoom + halfHeight;

        // Culling
        if (screenX < -margin || screenX > screenWidth + margin ||
            screenY < -margin || screenY > screenHeight + margin) continue;

        for (const dec of decorations) {
            const dx = dec.rx * scaledHexSize * 0.4;
            const dy = dec.ry * scaledHexSize * 0.4;

            if (dec.type === 'grass') {
                // Draw grass as small green lines (V shape)
                const grassColor = k.rgb(60, 120, 50);
                k.drawLine({
                    p1: k.vec2(screenX + dx, screenY + dy),
                    p2: k.vec2(screenX + dx - 2 * zoom, screenY + dy - GRASS_LENGTH * zoom),
                    width: 1,
                    color: grassColor,
                });
                k.drawLine({
                    p1: k.vec2(screenX + dx, screenY + dy),
                    p2: k.vec2(screenX + dx + 2 * zoom, screenY + dy - GRASS_LENGTH * zoom),
                    width: 1,
                    color: grassColor,
                });
            } else if (dec.type === 'tree') {
                // Draw tree as triangle (foliage) + rectangle (trunk)
                const trunkColor = k.rgb(80, 50, 30);
                const foliageColor = k.rgb(40, 100, 40);
                const treeScale = zoom * TREE_SCALE;

                // Trunk
                k.drawRect({
                    pos: k.vec2(screenX + dx - 1.5 * treeScale, screenY + dy),
                    width: 3 * treeScale,
                    height: 6 * treeScale,
                    color: trunkColor,
                });

                // Foliage (triangle)
                k.drawPolygon({
                    pts: [
                        k.vec2(screenX + dx, screenY + dy - 10 * treeScale),
                        k.vec2(screenX + dx - 6 * treeScale, screenY + dy + 2 * treeScale),
                        k.vec2(screenX + dx + 6 * treeScale, screenY + dy + 2 * treeScale),
                    ],
                    color: foliageColor,
                });
            } else if (dec.type === 'palm') {
                // Draw palm tree with trunk and fronds
                const trunkColor = k.rgb(139, 90, 43);
                const frondColor = k.rgb(34, 139, 34);
                const palmScale = zoom * PALM_SCALE;

                // Frond origin (top of trunk)
                const topX = screenX + dx;
                const topY = screenY + dy - 8 * palmScale;

                // Trunk - extends from frond origin down to ground
                k.drawRect({
                    pos: k.vec2(screenX + dx - 1.5 * palmScale, topY),
                    width: 3 * palmScale,
                    height: 10 * palmScale,
                    color: trunkColor,
                });

                // Fronds (lines radiating from top of trunk)
                const frondLength = 8 * palmScale;

                // Draw 5 fronds in a fan pattern
                for (let f = -2; f <= 2; f++) {
                    const angle = (f * 25) * Math.PI / 180 - Math.PI / 2; // -50 to +50 degrees from vertical
                    const endX = topX + Math.cos(angle) * frondLength;
                    const endY = topY + Math.sin(angle) * frondLength * 0.7;
                    k.drawLine({
                        p1: k.vec2(topX, topY),
                        p2: k.vec2(endX, endY),
                        width: 2 * palmScale,
                        color: frondColor,
                    });
                }
            }
        }
    }
}

/**
 * Draw fog of war overlay with animated transitions:
 * - Currently visible: no fog (or fading in from shroud)
 * - Explored but not visible: partial fog (or fading to shroud)
 * - Never seen: full dark fog with hatching
 * @param {object} ctx - Render context
 * @param {Map} map - The game map
 * @param {Map} tilePositions - Pre-calculated tile world positions
 * @param {object} fogState - Fog of war state
 * @param {number} currentTime - Current game time for animations
 */
export function drawFogOfWar(ctx, map, tilePositions, fogState, currentTime = 0) {
    const { k, zoom, cameraX, cameraY, halfWidth, halfHeight, screenWidth, screenHeight } = ctx;
    const margin = HEX_SIZE * zoom * 2;
    const scaledSize = HEX_SIZE * zoom;

    // Full fog colors (never seen)
    const fogBaseColor = k.rgb(15, 20, 30);
    const fogHatchColor = k.rgb(25, 35, 50);
    const hatchSpacing = Math.max(4, 6 * zoom);

    // Partial fog color (explored but not visible)
    const shroudColor = k.rgb(30, 40, 50);

    for (const tile of map.tiles.values()) {
        // Get animated fog opacity
        const { shroudOpacity, unexploredOpacity } = getHexFogOpacity(fogState, tile.q, tile.r, currentTime);

        // Skip fully visible hexes (no fog)
        if (shroudOpacity === 0 && unexploredOpacity === 0) continue;

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

        if (unexploredOpacity > 0) {
            // Never seen - full dark fog with hatching
            k.drawPolygon({
                pts,
                color: fogBaseColor,
                opacity: unexploredOpacity,
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
                    opacity: 0.4 * (unexploredOpacity / 0.92), // Scale with fog opacity
                });
            }
        } else if (shroudOpacity > 0) {
            // Explored but not fully visible - partial fog (shroud) with animation
            k.drawPolygon({
                pts,
                color: shroudColor,
                opacity: shroudOpacity,
            });
        }
    }
}
