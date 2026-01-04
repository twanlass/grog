// Effects rendering: projectiles, explosions, debris, trails, health bars
import { hexToPixel, HEX_SIZE } from "../hex.js";
import { SHIPS, PORTS, TOWERS, SETTLEMENTS } from "../sprites/index.js";
import { isHexVisible, shouldRenderEntity } from "../fogOfWar.js";

/**
 * Generate hexagon vertices centered at origin
 */
function getHexPoints(k, radius) {
    const points = [];
    for (let i = 0; i < 6; i++) {
        const angle = (Math.PI / 3) * i - Math.PI / 2; // Start at top
        points.push(k.vec2(
            Math.cos(angle) * radius,
            Math.sin(angle) * radius
        ));
    }
    return points;
}

/**
 * Draw ship water trails (behind ships)
 */
export function drawShipTrails(ctx, gameState, fogState) {
    const { k, zoom, cameraX, cameraY, halfWidth, halfHeight, screenWidth, screenHeight } = ctx;

    const TRAIL_FADE_DURATION = 0.5;
    const TRAIL_BASE_OPACITY = 0.4;

    for (const ship of gameState.ships) {
        if (!ship.trail || ship.trail.length < 2) continue;

        // Hide non-player ship trails in fog
        if (!shouldRenderEntity(fogState, ship)) continue;

        // Use ship's wakeSize property for trail sizing
        const shipData = SHIPS[ship.type];
        const baseSize = shipData.wakeSize || 8;
        const sizeDecay = baseSize * 0.1;

        for (let i = 1; i < ship.trail.length; i++) {
            const segment = ship.trail[i];
            const progress = segment.age / TRAIL_FADE_DURATION;
            const opacity = TRAIL_BASE_OPACITY * (1 - progress);
            const size = (baseSize - i * sizeDecay) * zoom;

            const screenX = (segment.x - cameraX) * zoom + halfWidth;
            const screenY = (segment.y - cameraY) * zoom + halfHeight;

            // Skip if off screen
            if (screenX < -50 || screenX > screenWidth + 50 ||
                screenY < -50 || screenY > screenHeight + 50) continue;

            // Draw water splash square (retro style)
            k.drawRect({
                pos: k.vec2(screenX, screenY),
                width: size * 2,
                height: size * 2,
                anchor: "center",
                color: k.rgb(200, 220, 255),
                opacity: opacity,
            });
        }
    }
}

/**
 * Draw floating debris from destroyed units (ships, ports, towers)
 */
export function drawFloatingDebris(ctx, floatingDebris, fogState) {
    const { k, zoom, cameraX, cameraY, halfWidth, halfHeight, screenWidth, screenHeight } = ctx;

    for (const debris of floatingDebris) {
        // Hide debris in fog
        if (!isHexVisible(fogState, debris.q, debris.r)) continue;

        const pos = hexToPixel(debris.q, debris.r);
        const screenX = (pos.x - cameraX) * zoom + halfWidth;
        const screenY = (pos.y - cameraY) * zoom + halfHeight;

        // Skip if off screen
        if (screenX < -100 || screenX > screenWidth + 100 ||
            screenY < -100 || screenY > screenHeight + 100) continue;

        const progress = debris.age / debris.duration;
        // Fade out in the last 30% of duration
        const opacity = progress < 0.7 ? 1 : 1 - ((progress - 0.7) / 0.3);

        // Draw dust clouds (for buildings on land)
        if (debris.hasDustClouds && debris.rings) {
            for (const ring of debris.rings) {
                const ringProgress = Math.max(0, (debris.age - ring.delay) / 2.0);
                if (ringProgress > 0 && ringProgress < 1) {
                    const ringRadius = (ring.baseRadius + ringProgress * ring.growthRadius) * zoom;
                    const ringOpacity = (1 - ringProgress) * 0.5;

                    // Dust cloud (filled tan square - retro style)
                    k.drawRect({
                        pos: k.vec2(screenX, screenY),
                        width: ringRadius * 2,
                        height: ringRadius * 2,
                        anchor: "center",
                        color: k.rgb(180, 160, 130),  // Dusty tan
                        opacity: ringOpacity * 0.4,
                    });
                }
            }
        }

        // Draw water rings (sinking effect for ships)
        if (debris.hasWaterRings && debris.rings) {
            for (const ring of debris.rings) {
                const ringProgress = Math.max(0, (debris.age - ring.delay) / 2.0);
                if (ringProgress > 0 && ringProgress < 1) {
                    const ringRadius = (ring.baseRadius + ringProgress * ring.growthRadius) * zoom;
                    const ringOpacity = (1 - ringProgress) * 0.4;
                    // Water ring (hexagonal - matches hex grid)
                    k.drawPolygon({
                        pos: k.vec2(screenX, screenY),
                        pts: getHexPoints(k, ringRadius),
                        outline: { color: k.rgb(180, 210, 240), width: 2 * zoom },
                        fill: false,
                        opacity: ringOpacity,
                    });
                }
            }
        }

        // Determine debris color based on type
        const debrisColor = debris.debrisType === 'stone'
            ? k.rgb(120, 115, 110)  // Gray stone
            : k.rgb(139, 90, 43);   // Brown wood

        // Draw debris pieces
        for (const piece of debris.pieces) {
            const px = screenX + (piece.offsetX + piece.driftX * progress) * zoom;
            const py = screenY + (piece.offsetY + piece.driftY * progress) * zoom;
            const size = piece.size * zoom;

            k.drawRect({
                pos: k.vec2(px - size / 2, py - size / 4),
                width: size,
                height: size * 0.4,
                color: debrisColor,
                opacity: opacity,
                angle: piece.rotation + progress * 0.3,  // Slow rotation
            });
        }
    }
}

/**
 * Draw projectiles (cannon balls) with fiery trails
 */
export function drawProjectiles(ctx, gameState, fogState) {
    const { k, zoom, cameraX, cameraY, halfWidth, halfHeight, screenWidth, screenHeight } = ctx;

    for (const proj of gameState.projectiles) {
        // Hide projectiles from non-player units in fog
        if (proj.sourceShipIndex !== undefined) {
            const sourceShip = gameState.ships[proj.sourceShipIndex];
            if (sourceShip && !shouldRenderEntity(fogState, sourceShip)) continue;
        }
        if (proj.sourceTowerIndex !== undefined) {
            const sourceTower = gameState.towers[proj.sourceTowerIndex];
            if (sourceTower && !shouldRenderEntity(fogState, sourceTower)) continue;
        }

        // Interpolate position based on progress
        const fromPos = hexToPixel(proj.fromQ, proj.fromR);
        const toPos = hexToPixel(proj.toQ, proj.toR);
        const x = fromPos.x + (toPos.x - fromPos.x) * proj.progress;
        const y = fromPos.y + (toPos.y - fromPos.y) * proj.progress;

        // Add arc: parabola that peaks at midpoint (progress = 0.5)
        const arcHeight = 40;
        const arcFactor = 4 * proj.progress * (1 - proj.progress);
        const arcOffset = arcHeight * arcFactor;

        // Scale up at peak to simulate coming closer to camera
        const sizeScale = 0.8 + 0.4 * arcFactor;

        const screenX = (x - cameraX) * zoom + halfWidth;
        const screenY = (y - cameraY) * zoom + halfHeight - (arcOffset * zoom);

        // Skip if off screen
        if (screenX < -50 || screenX > screenWidth + 50 ||
            screenY < -50 || screenY > screenHeight + 50) continue;

        // Draw fiery trail (multiple particles behind the ball)
        const trailSegments = 5;
        const trailLength = 0.15;

        for (let t = trailSegments; t >= 1; t--) {
            const trailProgress = proj.progress - (t / trailSegments) * trailLength;
            if (trailProgress < 0) continue;

            const trailX = fromPos.x + (toPos.x - fromPos.x) * trailProgress;
            const trailY = fromPos.y + (toPos.y - fromPos.y) * trailProgress;
            const trailArcFactor = 4 * trailProgress * (1 - trailProgress);
            const trailArcOffset = arcHeight * trailArcFactor;

            const trailScreenX = (trailX - cameraX) * zoom + halfWidth;
            const trailScreenY = (trailY - cameraY) * zoom + halfHeight - (trailArcOffset * zoom);

            const fadeRatio = 1 - (t / trailSegments);
            const trailOpacity = 0.7 * fadeRatio;
            const trailSize = (2.55 + 1.7 * fadeRatio) * zoom * sizeScale;

            // Fiery colors: orange to red gradient
            const r = 255;
            const g = Math.floor(100 + 80 * fadeRatio);
            const b = Math.floor(30 * fadeRatio);

            // Fiery trail square (retro style)
            k.drawRect({
                pos: k.vec2(trailScreenX, trailScreenY),
                width: trailSize * 2,
                height: trailSize * 2,
                anchor: "center",
                color: k.rgb(r, g, b),
                opacity: trailOpacity,
            });
        }

        // Draw cannon ball (keep round)
        k.drawCircle({
            pos: k.vec2(screenX, screenY),
            radius: 3.4 * zoom * sizeScale,
            color: k.rgb(30, 30, 30),
        });
    }
}

/**
 * Draw water splashes (from missed projectiles)
 */
export function drawWaterSplashes(ctx, gameState, fogState) {
    const { k, zoom, cameraX, cameraY, halfWidth, halfHeight, screenWidth, screenHeight } = ctx;

    for (const splash of gameState.waterSplashes) {
        // Hide splashes in fog
        if (!isHexVisible(fogState, splash.q, splash.r)) continue;

        const pos = hexToPixel(splash.q, splash.r);
        const screenX = (pos.x - cameraX) * zoom + halfWidth;
        const screenY = (pos.y - cameraY) * zoom + halfHeight;

        // Skip if off screen
        if (screenX < -50 || screenX > screenWidth + 50 ||
            screenY < -50 || screenY > screenHeight + 50) continue;

        const progress = splash.age / splash.duration;
        const radius = (8 + progress * 15) * zoom;
        const opacity = (1 - progress) * 0.6;

        // Expanding hexagonal ring
        k.drawPolygon({
            pos: k.vec2(screenX, screenY),
            pts: getHexPoints(k, radius),
            outline: { color: k.rgb(200, 220, 255), width: 2 * zoom },
            fill: false,
            opacity: opacity,
        });

        // Center splash hexagon (only in first 30% of animation)
        if (progress < 0.3) {
            const splashRadius = (5 - progress * 10) * zoom;
            k.drawPolygon({
                pos: k.vec2(screenX, screenY),
                pts: getHexPoints(k, splashRadius),
                color: k.rgb(220, 235, 255),
                opacity: (0.3 - progress) * 2,
            });
        }
    }
}

/**
 * Draw ship explosions (constrained to hex bounds)
 */
export function drawExplosions(ctx, gameState, fogState) {
    const { k, zoom, cameraX, cameraY, halfWidth, halfHeight, screenWidth, screenHeight } = ctx;

    for (const explosion of gameState.shipExplosions) {
        // Hide explosions in fog
        if (!isHexVisible(fogState, explosion.q, explosion.r)) continue;

        const pos = hexToPixel(explosion.q, explosion.r);
        const screenX = (pos.x - cameraX) * zoom + halfWidth;
        const screenY = (pos.y - cameraY) * zoom + halfHeight;

        // Skip if off screen
        if (screenX < -100 || screenX > screenWidth + 100 ||
            screenY < -100 || screenY > screenHeight + 100) continue;

        const progress = explosion.age / explosion.duration;
        const maxRadius = 22 * zoom;

        // Multiple expanding fiery particles
        for (let i = 0; i < 10; i++) {
            const angle = (i / 10) * Math.PI * 2 + progress * 0.5;
            const dist = progress * maxRadius * (0.6 + (i % 3) * 0.15);
            const px = screenX + Math.cos(angle) * dist;
            const py = screenY + Math.sin(angle) * dist;
            const size = (7 - progress * 4) * zoom;

            // Fiery colors: orange -> red -> dark
            const r = 255;
            const g = Math.floor(200 * (1 - progress));
            const b = Math.floor(50 * (1 - progress));

            // Fire particle square (retro style)
            const particleSize = Math.max(size, 1) * 2;
            k.drawRect({
                pos: k.vec2(px, py),
                width: particleSize,
                height: particleSize,
                anchor: "center",
                color: k.rgb(r, g, b),
                opacity: 1 - progress,
            });
        }

        // Center flash (retro style)
        const flashSize = (15 - progress * 10) * zoom * 2;
        k.drawRect({
            pos: k.vec2(screenX, screenY),
            width: flashSize,
            height: flashSize,
            anchor: "center",
            color: k.rgb(255, 255, 200),
            opacity: (1 - progress) * 0.8,
        });
    }
}

/**
 * Draw health bars for units in combat
 * @param {function} getShipVisualPosLocal - Function to get ship visual position
 * @param {Object} fogState - Fog of war state for visibility checks
 */
export function drawHealthBars(ctx, gameState, getShipVisualPosLocal, fogState) {
    const { k, zoom, cameraX, cameraY, halfWidth, halfHeight, screenWidth, screenHeight } = ctx;

    // Track entities to avoid duplicate health bars
    const healthBarUnits = new Set();

    // Selected units
    for (const sel of gameState.selectedUnits) {
        if (sel.type === 'ship' || sel.type === 'port' || sel.type === 'tower' || sel.type === 'settlement') {
            healthBarUnits.add(`${sel.type}:${sel.index}`);
        }
    }

    // Pirates in attack mode
    for (const ship of gameState.ships) {
        if (ship.type !== 'pirate' || ship.aiState !== 'attack') continue;

        const pirateIndex = gameState.ships.indexOf(ship);
        healthBarUnits.add(`ship:${pirateIndex}`);

        if (ship.aiTarget && ship.aiTarget.index >= 0) {
            healthBarUnits.add(`${ship.aiTarget.type}:${ship.aiTarget.index}`);
        }
    }

    // Player ships with attack targets
    for (let i = 0; i < gameState.ships.length; i++) {
        const ship = gameState.ships[i];
        if (ship.type === 'pirate') continue;
        if (!ship.attackTarget) continue;

        healthBarUnits.add(`ship:${i}`);
        if (ship.attackTarget.index >= 0) {
            healthBarUnits.add(`${ship.attackTarget.type}:${ship.attackTarget.index}`);
        }
    }

    // Draw health bars for all units
    for (const key of healthBarUnits) {
        const [type, indexStr] = key.split(':');
        const index = parseInt(indexStr);

        let entity, maxHealth, pos;
        if (type === 'ship') {
            entity = gameState.ships[index];
            if (!entity) continue;
            if (!shouldRenderEntity(fogState, entity)) continue;
            maxHealth = SHIPS[entity.type].health;
            pos = getShipVisualPosLocal(entity);
        } else if (type === 'port') {
            entity = gameState.ports[index];
            if (!entity) continue;
            if (!shouldRenderEntity(fogState, entity)) continue;
            maxHealth = PORTS[entity.type].health;
            pos = hexToPixel(entity.q, entity.r);
        } else if (type === 'tower') {
            entity = gameState.towers[index];
            if (!entity) continue;
            if (!shouldRenderEntity(fogState, entity)) continue;
            maxHealth = TOWERS[entity.type].health;
            pos = hexToPixel(entity.q, entity.r);
        } else if (type === 'settlement') {
            entity = gameState.settlements[index];
            if (!entity) continue;
            if (!shouldRenderEntity(fogState, entity)) continue;
            maxHealth = SETTLEMENTS.settlement.health;
            pos = hexToPixel(entity.q, entity.r);
        } else {
            continue;
        }

        const screenX = (pos.x - cameraX) * zoom + halfWidth;
        const screenY = (pos.y - cameraY) * zoom + halfHeight;

        // Skip if off screen
        if (screenX < -100 || screenX > screenWidth + 100 ||
            screenY < -100 || screenY > screenHeight + 100) continue;

        const barWidth = 40 * zoom;
        const barHeight = 5 * zoom;
        const barY = screenY + 32 * zoom;  // ~4px below hex outline

        // Check if unit is repairing - show repair bar centered on unit (like build bar)
        if (entity.repair) {
            const repairPercent = Math.max(0, entity.repair.progress / entity.repair.totalTime);
            const repairBarWidth = 50 * zoom;
            const repairBarHeight = 8 * zoom;

            // Background bar (dark) - centered on unit
            k.drawRect({
                pos: k.vec2(screenX - repairBarWidth / 2, screenY),
                width: repairBarWidth,
                height: repairBarHeight,
                color: k.rgb(40, 40, 40),
                radius: 2,
            });

            // Repair progress fill (cyan/blue)
            k.drawRect({
                pos: k.vec2(screenX - repairBarWidth / 2, screenY),
                width: repairBarWidth * repairPercent,
                height: repairBarHeight,
                color: k.rgb(80, 180, 220),
                radius: 2,
            });
        } else {
            const healthPercent = Math.max(0, entity.health / maxHealth);

            // Background bar (dark)
            k.drawRect({
                pos: k.vec2(screenX - barWidth / 2, barY),
                width: barWidth,
                height: barHeight,
                color: k.rgb(40, 40, 40),
                radius: 2,
            });

            // Health fill (red to green gradient based on health)
            const r = Math.floor(255 * (1 - healthPercent));
            const g = Math.floor(180 * healthPercent);
            k.drawRect({
                pos: k.vec2(screenX - barWidth / 2, barY),
                width: barWidth * healthPercent,
                height: barHeight,
                color: k.rgb(r, g, 40),
                radius: 2,
            });
        }
    }
}

/**
 * Draw loot drops floating on the water
 */
export function drawLootDrops(ctx, lootDrops, fogState) {
    const { k, zoom, cameraX, cameraY, halfWidth, halfHeight, screenWidth, screenHeight } = ctx;

    for (const loot of lootDrops) {
        // Hide loot in fog
        if (!isHexVisible(fogState, loot.q, loot.r)) continue;

        const pos = hexToPixel(loot.q, loot.r);
        const screenX = (pos.x - cameraX) * zoom + halfWidth;
        const screenY = (pos.y - cameraY) * zoom + halfHeight;

        // Skip if off screen
        if (screenX < -50 || screenX > screenWidth + 50 ||
            screenY < -50 || screenY > screenHeight + 50) continue;

        // Bob up and down animation (slower)
        const bobOffset = Math.sin(loot.age * 1.5) * 3 * zoom;

        // Draw barrel sprite
        k.drawSprite({
            sprite: "barrel",
            pos: k.vec2(screenX, screenY + bobOffset),
            anchor: "center",
            scale: zoom * 1.25,
        });
    }
}

/**
 * Draw loot collection sparkles
 */
export function drawLootSparkles(ctx, lootSparkles) {
    const { k, zoom, cameraX, cameraY, halfWidth, halfHeight, screenWidth, screenHeight } = ctx;

    for (const sparkle of lootSparkles) {
        const pos = hexToPixel(sparkle.q, sparkle.r);
        const screenX = (pos.x - cameraX) * zoom + halfWidth;
        const screenY = (pos.y - cameraY) * zoom + halfHeight;

        // Skip if off screen
        if (screenX < -100 || screenX > screenWidth + 100 ||
            screenY < -100 || screenY > screenHeight + 100) continue;

        const progress = sparkle.age / sparkle.duration;
        const opacity = 1 - progress;

        // Draw expanding sparkle particles
        for (const particle of sparkle.particles) {
            const px = screenX + particle.dx * progress * 30 * zoom;
            const py = screenY + particle.dy * progress * 30 * zoom - progress * 20 * zoom;
            const size = (3 + particle.size * 2) * zoom * (1 - progress * 0.5);

            // Yellow sparkle (retro style)
            k.drawRect({
                pos: k.vec2(px, py),
                width: size * 2,
                height: size * 2,
                anchor: "center",
                color: k.rgb(255, 220, 80),
                opacity: opacity,
            });
        }
    }
}
