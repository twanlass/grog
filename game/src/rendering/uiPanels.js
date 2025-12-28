// UI panel rendering: resource panel, build panels, ship info panel
import { drawSprite, getSpriteSize, SHIPS, PORTS, SETTLEMENTS, TOWERS } from "../sprites/index.js";
import { getBuildableShips, getNextPortType, getNextTowerType, isPortBuildingSettlement, canAfford, computeCrewStatus, canAffordCrew } from "../gameState.js";
import { getRepairCost, getRepairTime } from "../systems/repair.js";
import {
    drawPanelContainer,
    drawStatusBadge,
    drawProgressBar,
    drawCooldownBar,
    drawHealthDisplay,
    drawSectionHeader,
    PANEL_COLORS,
} from "./uiPrimitives.js";

/**
 * Draw the resource panel (top right)
 */
export function drawResourcePanel(ctx, gameState) {
    const { k, screenWidth } = ctx;

    const panelWidth = 200;
    const panelHeight = 70;
    const panelX = screenWidth - panelWidth - 15;
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
    const iconSize = 16;
    const iconOffset = iconSize + 8;

    // Wood section
    const woodIconX = panelX + 15;
    const woodIconY = resY - 8;

    // Wood sprite icon
    k.drawSprite({
        sprite: "resource-wood",
        pos: k.vec2(woodIconX, woodIconY),
        width: iconSize,
        height: iconSize,
    });

    // Wood label and value
    k.drawText({
        text: `Wood`,
        pos: k.vec2(woodIconX + iconOffset, resY - 10),
        size: 10,
        color: k.rgb(139, 90, 43),
    });
    k.drawText({
        text: `${res.wood}`,
        pos: k.vec2(woodIconX + iconOffset, resY + 6),
        size: 18,
        color: k.rgb(200, 150, 100),
    });

    // Crew section (right side of panel)
    const crewStatus = computeCrewStatus(gameState);
    const crewIconX = panelX + 110;
    const crewIconY = resY - 8;

    // Crew sprite icon
    k.drawSprite({
        sprite: "resource-crew",
        pos: k.vec2(crewIconX, crewIconY),
        width: iconSize,
        height: iconSize,
    });

    // Crew label
    k.drawText({
        text: `Crew`,
        pos: k.vec2(crewIconX + iconOffset, resY - 10),
        size: 10,
        color: k.rgb(140, 160, 180),
    });

    // Crew value (used/cap format)
    const isOverCap = crewStatus.used > crewStatus.cap;
    const crewColor = isOverCap ? k.rgb(255, 100, 100) : k.rgb(180, 200, 220);
    k.drawText({
        text: `${crewStatus.used}/${crewStatus.cap}`,
        pos: k.vec2(crewIconX + iconOffset, resY + 6),
        size: 18,
        color: crewColor,
    });

}

/**
 * Draw game title and controls hint (top left)
 */
export function drawGameTitle(ctx) {
    const { k } = ctx;

    k.drawText({
        text: "Grog",
        pos: k.vec2(20, 20),
        size: 28,
        color: k.rgb(255, 255, 255),
    });

    k.drawText({
        text: "Drag: Select | Shift+click: Add to selection | Click: Set waypoint (when ships selected)",
        pos: k.vec2(20, 52),
        size: 12,
        color: k.rgb(120, 120, 120),
    });
}

/**
 * Draw time scale indicator (bottom left)
 */
export function drawTimeIndicator(ctx, timeScale) {
    const { k, screenHeight } = ctx;

    const timeLabel = timeScale === 0 ? "PAUSED" : `${timeScale}x`;
    const timeColor = timeScale === 0
        ? k.rgb(255, 100, 100)
        : k.rgb(150, 200, 150);

    k.drawText({
        text: timeLabel,
        pos: k.vec2(20, screenHeight - 25),
        size: 18,
        color: timeColor,
    });
}

/**
 * Draw pirate kill counter at bottom center of screen
 */
export function drawPirateKillCounter(ctx, pirateKills) {
    const { k, screenWidth, screenHeight } = ctx;

    const label = `Pirates Sunk: ${pirateKills}`;
    const textWidth = label.length * 8;  // Approximate width

    k.drawText({
        text: label,
        pos: k.vec2(screenWidth / 2 - textWidth / 2, screenHeight - 25),
        size: 16,
        color: k.rgb(200, 80, 80),
    });
}

/**
 * Draw wave status indicator for Defend mode (top center of screen)
 */
export function drawWaveStatus(ctx, waveStatus) {
    if (!waveStatus) return;

    const { k, screenWidth } = ctx;

    // Background panel
    const panelWidth = 200;
    const panelHeight = 50;
    const panelX = screenWidth / 2 - panelWidth / 2;
    const panelY = 10;

    k.drawRect({
        pos: k.vec2(panelX, panelY),
        width: panelWidth,
        height: panelHeight,
        color: k.rgb(20, 30, 40),
        radius: 6,
        opacity: 0.9,
    });

    // Wave number
    const waveNum = waveStatus.wave || 1;
    k.drawText({
        text: `WAVE ${waveNum}`,
        pos: k.vec2(screenWidth / 2, panelY + 15),
        size: 16,
        anchor: "center",
        color: k.rgb(255, 200, 100),
    });

    // Status message
    let statusColor;
    let statusText;
    if (waveStatus.phase === 'preparing') {
        statusColor = k.rgb(100, 200, 255);
        statusText = `Starting in ${waveStatus.timer}s`;
    } else if (waveStatus.phase === 'active') {
        statusColor = k.rgb(255, 100, 100);
        statusText = `${waveStatus.remaining} pirates remaining`;
    } else if (waveStatus.phase === 'rebuild') {
        statusColor = k.rgb(100, 255, 150);
        statusText = `Next wave in ${waveStatus.timer}s`;
    }

    k.drawText({
        text: statusText,
        pos: k.vec2(screenWidth / 2, panelY + 35),
        size: 12,
        anchor: "center",
        color: statusColor,
    });
}

/**
 * Draw ship info panel (bottom right, when single ship is selected)
 * Returns bounds for repair button click detection
 */
export function drawShipInfoPanel(ctx, ship, gameState) {
    if (!ship) return null;

    const { k, screenWidth, screenHeight } = ctx;
    const shipData = SHIPS[ship.type];
    const maxHealth = shipData.health;
    const isDamaged = ship.health < maxHealth;
    const isRepairing = !!ship.repair;
    const canRepair = ship.type !== 'pirate';  // Pirates can't be repaired

    // Calculate panel height based on whether repair button is shown (not when already repairing - bar shows above unit)
    const repairSectionHeight = (canRepair && isDamaged && !isRepairing) ? 50 : 0;
    const infoPanelWidth = 140;
    const infoPanelHeight = 130 + repairSectionHeight;
    const infoPanelX = screenWidth - infoPanelWidth - 15;
    const infoPanelY = screenHeight - infoPanelHeight - 50;

    const bounds = {
        x: infoPanelX,
        y: infoPanelY,
        width: infoPanelWidth,
        height: infoPanelHeight,
        repairButton: null,
    };

    // Panel background
    k.drawRect({
        pos: k.vec2(infoPanelX, infoPanelY),
        width: infoPanelWidth,
        height: infoPanelHeight,
        color: k.rgb(20, 30, 40),
        radius: 6,
        opacity: 0.9,
    });

    // Ship name
    k.drawText({
        text: shipData.name,
        pos: k.vec2(infoPanelX + infoPanelWidth / 2, infoPanelY + 14),
        size: 13,
        anchor: "center",
        color: k.rgb(200, 200, 200),
    });

    // Status indicator
    let statusText = "";
    let statusColor = k.rgb(100, 100, 100);

    // Pirate AI state
    if (ship.aiState) {
        switch (ship.aiState) {
            case 'patrol':
                statusText = "PATROL";
                statusColor = k.rgb(120, 120, 120);
                break;
            case 'chase':
                statusText = "CHASE";
                statusColor = k.rgb(255, 160, 60);
                break;
            case 'attack':
                statusText = "ATTACK";
                statusColor = k.rgb(220, 60, 60);
                break;
            case 'retreat':
                statusText = "RETREAT";
                statusColor = k.rgb(80, 140, 220);
                break;
        }
    } else if (ship.tradeRoute) {
        if (ship.waitingForDock) {
            statusText = "WAITING";
            statusColor = k.rgb(220, 180, 80);
        } else if (ship.dockingState?.action === 'loading') {
            statusText = "LOADING";
            statusColor = k.rgb(80, 180, 80);
        } else if (ship.dockingState?.action === 'unloading') {
            statusText = "UNLOADING";
            statusColor = k.rgb(220, 180, 80);
        } else {
            statusText = "AUTO-LOOP";
            statusColor = k.rgb(100, 180, 220);
        }
    } else if (ship.pendingUnload) {
        if (ship.waitingForDock) {
            statusText = "WAITING";
            statusColor = k.rgb(220, 180, 80);
        } else if (ship.dockingState?.action === 'unloading') {
            statusText = "UNLOADING";
            statusColor = k.rgb(220, 180, 80);
        } else {
            statusText = "RETURNING";
            statusColor = k.rgb(180, 140, 100);
        }
    }

    if (statusText) {
        const badgeWidth = 70;
        const badgeHeight = 14;
        const badgeX = infoPanelX + infoPanelWidth / 2 - badgeWidth / 2;
        const badgeY = infoPanelY + 26;

        k.drawRect({
            pos: k.vec2(badgeX, badgeY),
            width: badgeWidth,
            height: badgeHeight,
            color: statusColor,
            radius: 3,
            opacity: 0.3,
        });

        k.drawText({
            text: statusText,
            pos: k.vec2(infoPanelX + infoPanelWidth / 2, badgeY + badgeHeight / 2),
            size: 10,
            anchor: "center",
            color: statusColor,
        });
    }

    // Cargo section
    const cargoWood = ship.cargo?.wood || 0;
    const maxCargo = shipData.cargo;

    k.drawText({
        text: "CARGO",
        pos: k.vec2(infoPanelX + infoPanelWidth / 2, infoPanelY + 48),
        size: 10,
        anchor: "center",
        color: k.rgb(120, 120, 120),
    });

    k.drawText({
        text: `Wood: ${cargoWood}`,
        pos: k.vec2(infoPanelX + 12, infoPanelY + 66),
        size: 11,
        anchor: "left",
        color: k.rgb(180, 130, 70),
    });

    k.drawText({
        text: `${cargoWood}/${maxCargo}`,
        pos: k.vec2(infoPanelX + infoPanelWidth - 12, infoPanelY + 66),
        size: 11,
        anchor: "right",
        color: cargoWood > 0 ? k.rgb(180, 180, 180) : k.rgb(100, 100, 100),
    });

    // Cooldown section
    const cooldown = ship.attackCooldown || 0;
    const maxCooldown = shipData.fireCooldown;

    drawCooldownBar(ctx, infoPanelX + infoPanelWidth / 2, infoPanelY + 96, 100, cooldown, maxCooldown);

    // Repair button (only if damaged and not already repairing - repair bar shows above unit)
    if (canRepair && isDamaged && !isRepairing && gameState) {
        // Show repair button
        const repairCost = getRepairCost('ship', ship);
        const canAffordRepair = gameState.resources.wood >= repairCost.wood;

        k.drawLine({
            p1: k.vec2(infoPanelX + 10, infoPanelY + 115),
            p2: k.vec2(infoPanelX + infoPanelWidth - 10, infoPanelY + 115),
            width: 1,
            color: k.rgb(60, 70, 80),
        });

        const btnY = infoPanelY + 122;
        const btnHeight = 36;
        const mousePos = k.mousePos();

        bounds.repairButton = { y: btnY, height: btnHeight };

        const isHovered = canAffordRepair &&
            mousePos.x >= infoPanelX && mousePos.x <= infoPanelX + infoPanelWidth &&
            mousePos.y >= btnY && mousePos.y <= btnY + btnHeight;

        // Button background
        k.drawRect({
            pos: k.vec2(infoPanelX + 5, btnY),
            width: infoPanelWidth - 10,
            height: btnHeight,
            color: isHovered ? k.rgb(60, 80, 60) : k.rgb(40, 50, 60),
            radius: 4,
        });

        // Repair text
        const costColor = canAffordRepair ? k.rgb(180, 200, 180) : k.rgb(200, 100, 100);
        k.drawText({
            text: "Repair (R)",
            pos: k.vec2(infoPanelX + infoPanelWidth / 2, btnY + 12),
            size: 10,
            anchor: "center",
            color: canAffordRepair ? k.rgb(200, 220, 200) : k.rgb(150, 150, 150),
        });

        // Cost
        k.drawText({
            text: `${repairCost.wood} wood`,
            pos: k.vec2(infoPanelX + infoPanelWidth / 2, btnY + 26),
            size: 9,
            anchor: "center",
            color: costColor,
        });
    }

    return bounds;
}

/**
 * Draw tower info panel (bottom right, when tower is selected)
 * Returns bounds for upgrade button click detection
 */
export function drawTowerInfoPanel(ctx, tower, gameState) {
    if (!tower) return null;

    const { k, screenWidth, screenHeight } = ctx;
    const towerData = TOWERS[tower.type];
    const nextTowerType = getNextTowerType(tower.type);
    const canUpgrade = nextTowerType && !tower.construction && !tower.repair;
    const maxHealth = towerData.health;
    const isDamaged = tower.health < maxHealth;
    const isRepairing = !!tower.repair;

    const infoPanelWidth = 160;
    const upgradeHeight = canUpgrade ? 50 : 0;
    // Only show repair button when damaged and not already repairing (repair bar shows above unit)
    const repairHeight = (isDamaged && !isRepairing) && !tower.construction ? 50 : 0;
    const infoPanelHeight = 100 + upgradeHeight + repairHeight;
    const infoPanelX = screenWidth - infoPanelWidth - 15;
    const infoPanelY = screenHeight - infoPanelHeight - 50;

    const bounds = {
        x: infoPanelX,
        y: infoPanelY,
        width: infoPanelWidth,
        height: infoPanelHeight,
        upgradeButton: null,
        repairButton: null,
    };

    // Panel background
    drawPanelContainer(ctx, infoPanelX, infoPanelY, infoPanelWidth, infoPanelHeight);

    // Tower name
    k.drawText({
        text: towerData.name,
        pos: k.vec2(infoPanelX + infoPanelWidth / 2, infoPanelY + 14),
        size: 13,
        anchor: "center",
        color: k.rgb(200, 200, 200),
    });

    // Construction/upgrade status or stats
    if (tower.construction) {
        const progress = tower.construction.progress || 0;
        const buildTime = tower.construction.buildTime;
        const progressPercent = Math.floor((progress / buildTime) * 100);

        // Check if upgrading
        const isUpgrading = !!tower.construction.upgradeTo;
        const statusText = isUpgrading ? "UPGRADING" : "BUILDING";
        const targetText = isUpgrading ? `→ ${TOWERS[tower.construction.upgradeTo].name}` : null;

        k.drawText({
            text: statusText,
            pos: k.vec2(infoPanelX + infoPanelWidth / 2, infoPanelY + 36),
            size: 10,
            anchor: "center",
            color: k.rgb(220, 180, 80),
        });

        if (targetText) {
            k.drawText({
                text: targetText,
                pos: k.vec2(infoPanelX + infoPanelWidth / 2, infoPanelY + 48),
                size: 10,
                anchor: "center",
                color: k.rgb(180, 200, 220),
            });
        }

        // Progress bar
        const barWidth = 120;
        const barX = infoPanelX + (infoPanelWidth - barWidth) / 2;
        const barY = infoPanelY + (isUpgrading ? 62 : 50);

        drawProgressBar(ctx, barX, barY, barWidth, progress / buildTime, {
            fillColor: { r: 220, g: 180, b: 80 }
        });

        k.drawText({
            text: `${progressPercent}%`,
            pos: k.vec2(infoPanelX + infoPanelWidth / 2, barY + 18),
            size: 10,
            anchor: "center",
            color: k.rgb(180, 150, 80),
        });
    } else {
        // Health display
        const health = tower.health || towerData.health;
        const maxHealth = towerData.health;

        drawHealthDisplay(ctx, infoPanelX + infoPanelWidth / 2, infoPanelY + 36, health, maxHealth);

        // Cooldown section (only for combat towers)
        if (towerData.attackRange) {
            const cooldown = tower.attackCooldown || 0;
            const maxCooldown = towerData.fireCooldown;

            drawCooldownBar(ctx, infoPanelX + infoPanelWidth / 2, infoPanelY + 56, 120, cooldown, maxCooldown);
        } else {
            // Non-combat towers show their sight range instead
            k.drawText({
                text: `Sight: ${towerData.sightDistance} hexes`,
                pos: k.vec2(infoPanelX + infoPanelWidth / 2, infoPanelY + 60),
                size: 10,
                anchor: "center",
                color: k.rgb(150, 180, 200),
            });
        }

        // Upgrade section
        if (canUpgrade) {
            const nextTowerData = TOWERS[nextTowerType];
            const upgradeAffordable = canAfford(gameState.resources, nextTowerData.cost);

            // Separator
            const sepY = infoPanelY + 85;
            k.drawLine({
                p1: k.vec2(infoPanelX + 10, sepY),
                p2: k.vec2(infoPanelX + infoPanelWidth - 10, sepY),
                width: 1,
                color: k.rgb(60, 70, 80),
            });

            // Upgrade button
            const btnY = sepY + 5;
            const btnHeight = 36;
            const mousePos = k.mousePos();

            bounds.upgradeButton = { y: btnY, height: btnHeight, towerType: nextTowerType };

            const isHovered = upgradeAffordable &&
                mousePos.x >= infoPanelX && mousePos.x <= infoPanelX + infoPanelWidth &&
                mousePos.y >= btnY && mousePos.y <= btnY + btnHeight;

            // Button background
            k.drawRect({
                pos: k.vec2(infoPanelX + 5, btnY),
                width: infoPanelWidth - 10,
                height: btnHeight,
                color: isHovered ? k.rgb(60, 80, 60) : k.rgb(40, 50, 60),
                radius: 4,
            });

            // Upgrade arrow and name
            const costColor = upgradeAffordable ? k.rgb(180, 200, 180) : k.rgb(200, 100, 100);
            k.drawText({
                text: `↑ ${nextTowerData.name} (U)`,
                pos: k.vec2(infoPanelX + infoPanelWidth / 2, btnY + 12),
                size: 10,
                anchor: "center",
                color: upgradeAffordable ? k.rgb(200, 220, 200) : k.rgb(150, 150, 150),
            });

            // Cost
            k.drawText({
                text: `${nextTowerData.cost.wood} wood`,
                pos: k.vec2(infoPanelX + infoPanelWidth / 2, btnY + 26),
                size: 10,
                anchor: "center",
                color: costColor,
            });
        }

        // Repair button (only if damaged and not repairing - repair bar shows above unit)
        if (isDamaged && !isRepairing) {
            // Show repair button
            const repairCost = getRepairCost('tower', tower);
            const canAffordRepair = gameState.resources.wood >= repairCost.wood;

            const repairY = infoPanelY + 85 + upgradeHeight;

            k.drawLine({
                p1: k.vec2(infoPanelX + 10, repairY),
                p2: k.vec2(infoPanelX + infoPanelWidth - 10, repairY),
                width: 1,
                color: k.rgb(60, 70, 80),
            });

            const btnY = repairY + 5;
            const btnHeight = 36;
            const mousePos = k.mousePos();

            bounds.repairButton = { y: btnY, height: btnHeight };

            const isHovered = canAffordRepair &&
                mousePos.x >= infoPanelX && mousePos.x <= infoPanelX + infoPanelWidth &&
                mousePos.y >= btnY && mousePos.y <= btnY + btnHeight;

            // Button background
            k.drawRect({
                pos: k.vec2(infoPanelX + 5, btnY),
                width: infoPanelWidth - 10,
                height: btnHeight,
                color: isHovered ? k.rgb(60, 80, 60) : k.rgb(40, 50, 60),
                radius: 4,
            });

            // Repair text
            const costColor = canAffordRepair ? k.rgb(180, 200, 180) : k.rgb(200, 100, 100);
            k.drawText({
                text: "Repair (R)",
                pos: k.vec2(infoPanelX + infoPanelWidth / 2, btnY + 12),
                size: 10,
                anchor: "center",
                color: canAffordRepair ? k.rgb(200, 220, 200) : k.rgb(150, 150, 150),
            });

            // Cost
            k.drawText({
                text: `${repairCost.wood} wood`,
                pos: k.vec2(infoPanelX + infoPanelWidth / 2, btnY + 26),
                size: 10,
                anchor: "center",
                color: costColor,
            });
        }
    }

    return bounds;
}

/**
 * Draw a generic panel button (reusable for build panels)
 * @returns {object} Button bounds { y, height, ... }
 */
export function drawPanelButton(ctx, panelX, panelWidth, btnY, btnHeight, spriteData, name, cost, buildTime, isHovered, isAffordable, extraData = {}) {
    const { k } = ctx;
    const canBuild = isAffordable && !extraData.isBusy;

    // Button background (highlight on hover, only if can build)
    if (isHovered && canBuild) {
        k.drawRect({
            pos: k.vec2(panelX + 4, btnY),
            width: panelWidth - 8,
            height: btnHeight,
            color: k.rgb(60, 80, 100),
            radius: 4,
        });
    }

    // Draw sprite thumbnail
    const thumbScale = 1.2;
    const spriteSize = getSpriteSize(spriteData.sprite, thumbScale);
    const spriteX = panelX + 10;
    const spriteY = btnY + (btnHeight - spriteSize.height) / 2;
    drawSprite(k, spriteData.sprite, spriteX, spriteY, thumbScale, canBuild ? 1.0 : 0.4);

    // Name (greyed out if can't build)
    k.drawText({
        text: name,
        pos: k.vec2(panelX + 44, btnY + 10),
        size: 13,
        anchor: "left",
        color: !canBuild ? k.rgb(80, 80, 80) : isHovered ? k.rgb(255, 255, 255) : k.rgb(200, 200, 200),
    });

    // Cost
    const costText = cost.wood ? `${cost.wood} wood` : "Free";
    k.drawText({
        text: costText,
        pos: k.vec2(panelX + 44, btnY + 26),
        size: 10,
        anchor: "left",
        color: !canBuild ? k.rgb(100, 60, 60) : k.rgb(120, 120, 120),
    });

    // Build time (right side)
    k.drawText({
        text: `${buildTime}s`,
        pos: k.vec2(panelX + panelWidth - 12, btnY + btnHeight / 2),
        size: 11,
        anchor: "right",
        color: !canBuild ? k.rgb(80, 80, 80) : k.rgb(150, 150, 150),
    });

    return { y: btnY, height: btnHeight };
}

/**
 * Draw panel separator line
 */
export function drawPanelSeparator(ctx, panelX, panelWidth, y) {
    const { k } = ctx;
    k.drawLine({
        p1: k.vec2(panelX + 8, y - 4),
        p2: k.vec2(panelX + panelWidth - 8, y - 4),
        width: 1,
        color: k.rgb(60, 70, 80),
    });
}

/**
 * Draw panel section header
 */
export function drawPanelHeader(ctx, panelX, panelWidth, y, text) {
    const { k } = ctx;
    k.drawText({
        text: text,
        pos: k.vec2(panelX + panelWidth / 2, y + 10),
        size: 11,
        anchor: "center",
        color: k.rgb(150, 150, 150),
    });
}

/**
 * Draw construction status panel (when a port is under construction)
 */
export function drawConstructionStatusPanel(ctx, port) {
    const { k, screenHeight } = ctx;

    const conProgress = Math.min(port.construction.progress / port.construction.buildTime, 1);
    const conPercent = Math.floor(conProgress * 100);
    const isUpgrading = !!port.construction.upgradeTo;

    const cpWidth = 160;
    const cpHeight = isUpgrading ? 85 : 70;
    const cpX = 15;
    const cpY = screenHeight - 50 - cpHeight;

    k.drawRect({
        pos: k.vec2(cpX, cpY),
        width: cpWidth,
        height: cpHeight,
        color: k.rgb(20, 30, 40),
        radius: 6,
        opacity: 0.9,
    });

    if (isUpgrading) {
        const targetPortData = PORTS[port.construction.upgradeTo];

        k.drawText({
            text: "UPGRADING",
            pos: k.vec2(cpX + cpWidth / 2, cpY + 16),
            size: 10,
            anchor: "center",
            color: k.rgb(150, 150, 150),
        });

        k.drawText({
            text: `→ ${targetPortData.name}`,
            pos: k.vec2(cpX + cpWidth / 2, cpY + 38),
            size: 14,
            anchor: "center",
            color: k.rgb(100, 200, 150),
        });

        k.drawText({
            text: `${conPercent}%`,
            pos: k.vec2(cpX + cpWidth / 2, cpY + 62),
            size: 18,
            anchor: "center",
            color: k.rgb(100, 200, 150),
        });
    } else {
        k.drawText({
            text: "UNDER CONSTRUCTION",
            pos: k.vec2(cpX + cpWidth / 2, cpY + 20),
            size: 10,
            anchor: "center",
            color: k.rgb(150, 150, 150),
        });

        k.drawText({
            text: `${conPercent}%`,
            pos: k.vec2(cpX + cpWidth / 2, cpY + 45),
            size: 18,
            anchor: "center",
            color: k.rgb(80, 180, 220),
        });
    }
}

/**
 * Draw port storage display (for non-home ports with stored resources)
 */
export function drawPortStorage(ctx, port, panelX, panelWidth, panelY) {
    const { k } = ctx;

    k.drawText({
        text: "STORED",
        pos: k.vec2(panelX + panelWidth / 2, panelY + 12),
        size: 10,
        anchor: "center",
        color: k.rgb(150, 150, 150),
    });

    // Wood
    k.drawText({
        text: `${port.storage.wood}`,
        pos: k.vec2(panelX + panelWidth / 2, panelY + 32),
        size: 16,
        anchor: "center",
        color: k.rgb(180, 120, 60),
    });
    k.drawText({
        text: "wood",
        pos: k.vec2(panelX + panelWidth / 2, panelY + 46),
        size: 10,
        anchor: "center",
        color: k.rgb(120, 80, 40),
    });
}

/**
 * Draw ship building status (when a port is building a ship)
 */
export function drawShipBuildingStatus(ctx, port, panelX, panelWidth, y) {
    const { k } = ctx;

    const progress = Math.min(port.buildQueue.progress / port.buildQueue.buildTime, 1);
    const percent = Math.floor(progress * 100);
    const shipName = SHIPS[port.buildQueue.shipType].name;

    k.drawText({
        text: "BUILDING",
        pos: k.vec2(panelX + panelWidth / 2, y + 14),
        size: 11,
        anchor: "center",
        color: k.rgb(150, 150, 150),
    });

    k.drawText({
        text: `${shipName}`,
        pos: k.vec2(panelX + panelWidth / 2, y + 38),
        size: 14,
        anchor: "center",
        color: k.rgb(220, 180, 80),
    });

    k.drawText({
        text: `${percent}%`,
        pos: k.vec2(panelX + panelWidth / 2, y + 60),
        size: 18,
        anchor: "center",
        color: k.rgb(255, 255, 255),
    });
}

/**
 * Draw ship build panel (bottom left, when docked ship is selected)
 * Returns bounds for click detection
 */
export function drawShipBuildPanel(ctx, ship, shipIndex, gameState, isShipDocked) {
    if (!ship || !isShipDocked) return null;

    const { k, screenHeight } = ctx;
    const buildablePortTypes = ['dock'];
    const watchtowerData = TOWERS.watchtower;

    const sbpWidth = 200;
    const sbpRowHeight = 44;
    const sbpPadding = 8;
    const sbpHeaderHeight = 20;
    const defenseSectionHeight = sbpHeaderHeight + sbpRowHeight; // Just Watchtower
    const sbpHeight = sbpHeaderHeight + sbpPadding + buildablePortTypes.length * sbpRowHeight + sbpPadding + defenseSectionHeight;
    const sbpX = 15;
    const sbpY = screenHeight - 50 - sbpHeight;

    // Store bounds for click detection
    const bounds = {
        x: sbpX,
        y: sbpY,
        width: sbpWidth,
        height: sbpHeight,
        buttons: [],
        towerButton: null,
        shipIndex: shipIndex,
    };

    // Panel background
    drawPanelContainer(ctx, sbpX, sbpY, sbpWidth, sbpHeight);

    // Panel title
    k.drawText({
        text: "BUILD PORT",
        pos: k.vec2(sbpX + sbpWidth / 2, sbpY + 14),
        size: 11,
        anchor: "center",
        color: k.rgb(150, 150, 150),
    });

    const mousePos = k.mousePos();

    // Port buttons
    for (let i = 0; i < buildablePortTypes.length; i++) {
        const portType = buildablePortTypes[i];
        const portData = PORTS[portType];
        const btnY = sbpY + sbpHeaderHeight + sbpPadding + i * sbpRowHeight;
        const btnHeight = sbpRowHeight - 4;
        const portAffordable = canAfford(gameState.resources, portData.cost);

        bounds.buttons.push({ y: btnY, height: btnHeight, portType: portType });

        const isHovered = portAffordable && mousePos.x >= sbpX && mousePos.x <= sbpX + sbpWidth &&
                          mousePos.y >= btnY && mousePos.y <= btnY + btnHeight;

        drawPanelButton(ctx, sbpX, sbpWidth, btnY, btnHeight, portData, portData.name,
            portData.cost, portData.buildTime, isHovered, portAffordable);
    }

    // Tower section
    const towerSectionY = sbpY + sbpHeaderHeight + sbpPadding + buildablePortTypes.length * sbpRowHeight + sbpPadding;

    drawPanelSeparator(ctx, sbpX, sbpWidth, towerSectionY);

    k.drawText({
        text: "BUILD DEFENSE",
        pos: k.vec2(sbpX + sbpWidth / 2, towerSectionY + 10),
        size: 11,
        anchor: "center",
        color: k.rgb(150, 150, 150),
    });

    // Watchtower button
    const towerBtnY = towerSectionY + sbpHeaderHeight;
    const towerBtnHeight = sbpRowHeight - 4;
    const towerAffordable = canAfford(gameState.resources, watchtowerData.cost) &&
                            canAffordCrew(gameState, watchtowerData.crewCost || 0);

    bounds.towerButton = { y: towerBtnY, height: towerBtnHeight };

    const towerHovered = towerAffordable && mousePos.x >= sbpX && mousePos.x <= sbpX + sbpWidth &&
                         mousePos.y >= towerBtnY && mousePos.y <= towerBtnY + towerBtnHeight;

    drawPanelButton(ctx, sbpX, sbpWidth, towerBtnY, towerBtnHeight, watchtowerData, `${watchtowerData.name} (T)`,
        watchtowerData.cost, watchtowerData.buildTime, towerHovered, towerAffordable);

    return bounds;
}

/**
 * Draw port build panel (bottom left, when port is selected)
 * Returns bounds for click detection
 */
export function drawPortBuildPanel(ctx, port, portIndex, gameState, helpers) {
    if (!port) return null;

    const { k, screenHeight } = ctx;
    const { isPortBuildingSettlement: checkBuildingSettlement } = helpers;
    const portData = PORTS[port.type];
    const maxHealth = portData.health;
    const isDamaged = port.health < maxHealth;
    const isRepairing = !!port.repair;

    // Handle construction/upgrading status
    if (port.construction) {
        drawConstructionStatusPanel(ctx, port);
        return null;
    }

    // Port is complete - show full build panel
    const buildableShips = getBuildableShips(port);
    const nextPortType = getNextPortType(port.type);
    const isBuildingSettlement = checkBuildingSettlement(portIndex, gameState.settlements);
    const portBusy = port.buildQueue || isBuildingSettlement;
    const canUpgrade = nextPortType && !portBusy && !isRepairing;
    const canBuildSettlement = !isBuildingSettlement && !gameState.settlementBuildMode.active && !isRepairing;
    const canBuildDefense = !gameState.towerBuildMode.active && !isRepairing;

    const hasStorage = portIndex > 0 && port.storage && port.storage.wood > 0;
    const storageHeight = hasStorage ? 45 : 0;

    const bpWidth = 200;
    const bpRowHeight = 44;
    const bpPadding = 8;
    const bpHeaderHeight = 20;
    const shipBuildStatusHeight = 70; // Height of the ship build status display
    const shipButtonsHeight = bpHeaderHeight + bpPadding + buildableShips.length * bpRowHeight;
    const shipSectionHeight = port.buildQueue ? shipBuildStatusHeight : shipButtonsHeight;
    const settlementHeight = canBuildSettlement ? (bpHeaderHeight + bpRowHeight) : 0;
    const defenseHeight = canBuildDefense ? (bpHeaderHeight + bpRowHeight) : 0; // Just Watchtower
    const upgradeHeight = canUpgrade ? (bpHeaderHeight + bpRowHeight) : 0;
    // Only show repair button when damaged and not already repairing (repair bar shows above unit)
    const repairHeight = (isDamaged && !isRepairing) ? 50 : 0;
    // New order: Settlement, Ships, Watchtower, Upgrades, Repair
    const bpHeight = storageHeight + settlementHeight + shipSectionHeight + bpPadding + defenseHeight + upgradeHeight + repairHeight;
    const bpX = 15;
    const bpY = screenHeight - 50 - bpHeight;

    const bounds = {
        x: bpX,
        y: bpY,
        width: bpWidth,
        height: bpHeight,
        buttons: [],
        upgradeButton: null,
        settlementButton: null,
        towerButton: null,
        repairButton: null,
        portIndex: portIndex,
    };

    // Panel background
    drawPanelContainer(ctx, bpX, bpY, bpWidth, bpHeight);

    // Storage section for non-home ports
    if (hasStorage) {
        drawPortStorage(ctx, port, bpX, bpWidth, bpY);
        k.drawLine({
            p1: k.vec2(bpX + 8, bpY + storageHeight - 4),
            p2: k.vec2(bpX + bpWidth - 8, bpY + storageHeight - 4),
            width: 1,
            color: k.rgb(60, 70, 80),
        });
    }

    const mousePos = k.mousePos();

    // Track current Y position for sections (after storage)
    let currentY = bpY + storageHeight;

    // 1. Settlement section (first)
    if (canBuildSettlement) {
        const settlementData = SETTLEMENTS.settlement;
        const alreadyBuildingSettlement = isBuildingSettlement;
        const settlementAffordable = canAfford(gameState.resources, settlementData.cost);
        const canBuildSettlementNow = settlementAffordable && !alreadyBuildingSettlement;

        k.drawText({
            text: "BUILD SETTLEMENT",
            pos: k.vec2(bpX + bpWidth / 2, currentY + 10),
            size: 11,
            anchor: "center",
            color: k.rgb(150, 150, 150),
        });

        const settlementBtnY = currentY + bpHeaderHeight;
        const settlementBtnHeight = bpRowHeight - 4;
        bounds.settlementButton = { y: settlementBtnY, height: settlementBtnHeight };

        const isSettlementHovered = canBuildSettlementNow &&
                                    mousePos.x >= bpX && mousePos.x <= bpX + bpWidth &&
                                    mousePos.y >= settlementBtnY && mousePos.y <= settlementBtnY + settlementBtnHeight;

        const settlementName = alreadyBuildingSettlement ? `${settlementData.name} (building...)` : `${settlementData.name} (S)`;
        drawPanelButton(ctx, bpX, bpWidth, settlementBtnY, settlementBtnHeight, settlementData, settlementName,
            settlementData.cost, settlementData.buildTime, isSettlementHovered, canBuildSettlementNow);

        currentY += settlementHeight;
    }

    // 2. Ship section
    if (port.buildQueue) {
        drawShipBuildingStatus(ctx, port, bpX, bpWidth, currentY);
        currentY += shipSectionHeight;
    } else {
        drawPanelSeparator(ctx, bpX, bpWidth, currentY);
        k.drawText({
            text: "BUILD SHIP",
            pos: k.vec2(bpX + bpWidth / 2, currentY + 14),
            size: 11,
            anchor: "center",
            color: k.rgb(150, 150, 150),
        });

        // Ship buttons
        for (let i = 0; i < buildableShips.length; i++) {
            const shipType = buildableShips[i];
            const shipData = SHIPS[shipType];
            const btnY = currentY + bpHeaderHeight + bpPadding + i * bpRowHeight;
            const btnHeight = bpRowHeight - 4;
            const affordable = canAfford(gameState.resources, shipData.cost) &&
                               canAffordCrew(gameState, shipData.crewCost || 0);
            const canBuildShip = affordable && !port.buildQueue && !isRepairing;

            bounds.buttons.push({ y: btnY, height: btnHeight, shipType: shipType });

            const isHovered = canBuildShip && mousePos.x >= bpX && mousePos.x <= bpX + bpWidth &&
                              mousePos.y >= btnY && mousePos.y <= btnY + btnHeight;

            // Add hotkey hint to ship name (C for Cutter)
            const hotkey = shipType === 'cutter' ? ' (C)' : '';
            drawPanelButton(ctx, bpX, bpWidth, btnY, btnHeight, shipData, shipData.name + hotkey,
                shipData.cost, shipData.build_time, isHovered, canBuildShip);
        }
        currentY += shipSectionHeight;
    }

    // 3. Defense section (Watchtower only - upgrades via tower panel)
    if (canBuildDefense) {
        const watchtowerData = TOWERS.watchtower;
        const towerAffordable = canAfford(gameState.resources, watchtowerData.cost) &&
                                canAffordCrew(gameState, watchtowerData.crewCost || 0);

        drawPanelSeparator(ctx, bpX, bpWidth, currentY);
        k.drawText({
            text: "BUILD DEFENSE",
            pos: k.vec2(bpX + bpWidth / 2, currentY + 10),
            size: 11,
            anchor: "center",
            color: k.rgb(150, 150, 150),
        });

        const towerBtnY = currentY + bpHeaderHeight;
        const towerBtnHeight = bpRowHeight - 4;
        bounds.towerButton = { y: towerBtnY, height: towerBtnHeight };

        const isTowerHovered = towerAffordable && mousePos.x >= bpX && mousePos.x <= bpX + bpWidth &&
                               mousePos.y >= towerBtnY && mousePos.y <= towerBtnY + towerBtnHeight;

        drawPanelButton(ctx, bpX, bpWidth, towerBtnY, towerBtnHeight, watchtowerData, `${watchtowerData.name} (T)`,
            watchtowerData.cost, watchtowerData.buildTime, isTowerHovered, towerAffordable);

        currentY += defenseHeight;
    }

    // 4. Upgrade section
    if (canUpgrade) {
        const nextPortData = PORTS[nextPortType];
        const upgradeAffordable = canAfford(gameState.resources, nextPortData.cost);

        drawPanelSeparator(ctx, bpX, bpWidth, currentY);
        k.drawText({
            text: "UPGRADE",
            pos: k.vec2(bpX + bpWidth / 2, currentY + 8),
            size: 10,
            anchor: "center",
            color: k.rgb(150, 150, 150),
        });

        const upgradeBtnY = currentY + bpHeaderHeight;
        const upgradeBtnHeight = bpRowHeight - 4;
        bounds.upgradeButton = { y: upgradeBtnY, height: upgradeBtnHeight, portType: nextPortType };

        const isUpgradeHovered = upgradeAffordable && mousePos.x >= bpX && mousePos.x <= bpX + bpWidth &&
                                 mousePos.y >= upgradeBtnY && mousePos.y <= upgradeBtnY + upgradeBtnHeight;

        drawPanelButton(ctx, bpX, bpWidth, upgradeBtnY, upgradeBtnHeight, nextPortData, nextPortData.name,
            nextPortData.cost, nextPortData.buildTime, isUpgradeHovered, upgradeAffordable);

        currentY += upgradeHeight;
    }

    // 5. Repair button (only if damaged and not repairing - repair bar shows above unit)
    if (isDamaged && !isRepairing) {
        // Show repair button
        const repairCost = getRepairCost('port', port);
        const canAffordRepair = gameState.resources.wood >= repairCost.wood;

        drawPanelSeparator(ctx, bpX, bpWidth, currentY);

        const btnY = currentY + 7;
        const btnHeight = 36;

        bounds.repairButton = { y: btnY, height: btnHeight };

        const isHovered = canAffordRepair &&
            mousePos.x >= bpX && mousePos.x <= bpX + bpWidth &&
            mousePos.y >= btnY && mousePos.y <= btnY + btnHeight;

        // Button background
        k.drawRect({
            pos: k.vec2(bpX + 5, btnY),
            width: bpWidth - 10,
            height: btnHeight,
            color: isHovered ? k.rgb(60, 80, 60) : k.rgb(40, 50, 60),
            radius: 4,
        });

        // Repair text
        const costColor = canAffordRepair ? k.rgb(180, 200, 180) : k.rgb(200, 100, 100);
        k.drawText({
            text: "Repair (R)",
            pos: k.vec2(bpX + bpWidth / 2, btnY + 12),
            size: 10,
            anchor: "center",
            color: canAffordRepair ? k.rgb(200, 220, 200) : k.rgb(150, 150, 150),
        });

        // Cost
        k.drawText({
            text: `${repairCost.wood} wood`,
            pos: k.vec2(bpX + bpWidth / 2, btnY + 26),
            size: 9,
            anchor: "center",
            color: costColor,
        });
    }

    return bounds;
}

/**
 * Draw all simple UI panels (resource, title, time, pirate kills, wave status)
 */
export function drawSimpleUIPanels(ctx, gameState, waveStatus = null) {
    drawResourcePanel(ctx, gameState);
    drawGameTitle(ctx);
    drawTimeIndicator(ctx, gameState.timeScale);
    drawPirateKillCounter(ctx, gameState.pirateKills);
    drawWaveStatus(ctx, waveStatus);
}
