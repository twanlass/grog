// UI panel rendering: resource panel, build panels, ship info panel
import { drawSprite, getSpriteSize, SHIPS, PORTS, SETTLEMENTS, TOWERS } from "../sprites/index.js";
import { getBuildableShips, getNextPortType, getNextTowerType, isPortBuildingSettlement, canAfford } from "../gameState.js";
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

    const panelWidth = 280;
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
    const resSpacing = 68;
    const iconSize = 12;
    const iconOffset = iconSize + 6;

    // Wood icon (log with rings)
    const woodIconX = panelX + 15;
    const woodIconY = resY - 4;
    // Log body (brown rectangle)
    k.drawRect({
        pos: k.vec2(woodIconX, woodIconY - 4),
        width: iconSize,
        height: 8,
        color: k.rgb(139, 90, 43),
        radius: 1,
    });
    // Wood rings (lighter circles on end)
    k.drawCircle({
        pos: k.vec2(woodIconX + iconSize - 1, woodIconY),
        radius: 4,
        color: k.rgb(180, 130, 80),
    });
    k.drawCircle({
        pos: k.vec2(woodIconX + iconSize - 1, woodIconY),
        radius: 2,
        color: k.rgb(139, 90, 43),
    });

    // Wood (brown)
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

    // Food icon (t-bone steak)
    const foodIconX = panelX + 15 + resSpacing * 2;
    const foodIconY = resY - 4;
    // Meat (pink/red oval)
    k.drawEllipse({
        pos: k.vec2(foodIconX + 6, foodIconY),
        radiusX: 6,
        radiusY: 4,
        color: k.rgb(180, 80, 80),
    });
    // Bone (white/cream line)
    k.drawRect({
        pos: k.vec2(foodIconX + 8, foodIconY - 1),
        width: 6,
        height: 2,
        color: k.rgb(240, 230, 210),
        radius: 1,
    });
    // Bone knob
    k.drawCircle({
        pos: k.vec2(foodIconX + 13, foodIconY),
        radius: 2,
        color: k.rgb(240, 230, 210),
    });

    // Food (green)
    k.drawText({
        text: `Food`,
        pos: k.vec2(foodIconX + iconOffset, resY - 10),
        size: 10,
        color: k.rgb(80, 140, 80),
    });
    k.drawText({
        text: `${res.food}`,
        pos: k.vec2(foodIconX + iconOffset, resY + 6),
        size: 18,
        color: k.rgb(120, 200, 120),
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
 * Draw ship info panel (bottom right, when single ship is selected)
 */
export function drawShipInfoPanel(ctx, ship) {
    if (!ship) return;

    const { k, screenWidth, screenHeight } = ctx;
    const shipData = SHIPS[ship.type];

    const infoPanelWidth = 140;
    const infoPanelHeight = 130;
    const infoPanelX = screenWidth - infoPanelWidth - 15;
    const infoPanelY = screenHeight - infoPanelHeight - 50;

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
            size: 9,
            anchor: "center",
            color: statusColor,
        });
    }

    // Cargo section
    const cargoWood = ship.cargo?.wood || 0;
    const cargoFood = ship.cargo?.food || 0;
    const maxCargo = shipData.cargo;
    const totalCargo = cargoWood + cargoFood;

    k.drawText({
        text: "CARGO",
        pos: k.vec2(infoPanelX + infoPanelWidth / 2, infoPanelY + 48),
        size: 9,
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
        text: `Food: ${cargoFood}`,
        pos: k.vec2(infoPanelX + 12, infoPanelY + 80),
        size: 11,
        anchor: "left",
        color: k.rgb(100, 160, 80),
    });

    k.drawText({
        text: `${totalCargo}/${maxCargo}`,
        pos: k.vec2(infoPanelX + infoPanelWidth - 12, infoPanelY + 73),
        size: 11,
        anchor: "right",
        color: totalCargo > 0 ? k.rgb(180, 180, 180) : k.rgb(100, 100, 100),
    });

    // Cooldown section
    const cooldown = ship.attackCooldown || 0;
    const maxCooldown = shipData.fireCooldown;

    drawCooldownBar(ctx, infoPanelX + infoPanelWidth / 2, infoPanelY + 96, 100, cooldown, maxCooldown);
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
    const canUpgrade = nextTowerType && !tower.construction;

    const infoPanelWidth = 160;
    const upgradeHeight = canUpgrade ? 50 : 0;
    const infoPanelHeight = 100 + upgradeHeight;
    const infoPanelX = screenWidth - infoPanelWidth - 15;
    const infoPanelY = screenHeight - infoPanelHeight - 50;

    const bounds = {
        x: infoPanelX,
        y: infoPanelY,
        width: infoPanelWidth,
        height: infoPanelHeight,
        upgradeButton: null,
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
            size: 9,
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
            size: 9,
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
                size: 9,
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
    const costText = cost.food
        ? `${cost.wood} wood, ${cost.food} food`
        : cost.wood
            ? `${cost.wood} wood`
            : "Free";
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
        pos: k.vec2(panelX + panelWidth / 4, panelY + 32),
        size: 16,
        anchor: "center",
        color: k.rgb(180, 120, 60),
    });
    k.drawText({
        text: "wood",
        pos: k.vec2(panelX + panelWidth / 4, panelY + 46),
        size: 9,
        anchor: "center",
        color: k.rgb(120, 80, 40),
    });

    // Food
    k.drawText({
        text: `${port.storage.food}`,
        pos: k.vec2(panelX + panelWidth * 3 / 4, panelY + 32),
        size: 16,
        anchor: "center",
        color: k.rgb(80, 180, 80),
    });
    k.drawText({
        text: "food",
        pos: k.vec2(panelX + panelWidth * 3 / 4, panelY + 46),
        size: 9,
        anchor: "center",
        color: k.rgb(50, 120, 50),
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
    const towerAffordable = canAfford(gameState.resources, watchtowerData.cost);

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
    const canUpgrade = nextPortType && !portBusy;
    const canBuildSettlement = !isBuildingSettlement && !gameState.settlementBuildMode.active;
    const canBuildDefense = !gameState.towerBuildMode.active;

    const hasStorage = portIndex > 0 && port.storage && (port.storage.wood > 0 || port.storage.food > 0);
    const storageHeight = hasStorage ? 45 : 0;

    const bpWidth = 200;
    const bpRowHeight = 44;
    const bpPadding = 8;
    const bpHeaderHeight = 20;
    const shipBuildStatusHeight = 70; // Height of the ship build status display
    const shipButtonsHeight = bpHeaderHeight + bpPadding + buildableShips.length * bpRowHeight;
    const shipSectionHeight = port.buildQueue ? shipBuildStatusHeight : shipButtonsHeight;
    const upgradeHeight = canUpgrade ? (bpHeaderHeight + bpRowHeight) : 0;
    const settlementHeight = canBuildSettlement ? (bpHeaderHeight + bpRowHeight) : 0;
    const defenseHeight = canBuildDefense ? (bpHeaderHeight + bpRowHeight) : 0; // Just Watchtower
    const bpHeight = storageHeight + shipSectionHeight + bpPadding + upgradeHeight + settlementHeight + defenseHeight;
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

    // Ship building in progress - show status instead of buttons
    if (port.buildQueue) {
        drawShipBuildingStatus(ctx, port, bpX, bpWidth, bpY + storageHeight);
    } else {
        // Build ship section
        k.drawText({
            text: "BUILD SHIP",
            pos: k.vec2(bpX + bpWidth / 2, bpY + storageHeight + 14),
            size: 11,
            anchor: "center",
            color: k.rgb(150, 150, 150),
        });

        // Ship buttons
        for (let i = 0; i < buildableShips.length; i++) {
            const shipType = buildableShips[i];
            const shipData = SHIPS[shipType];
            const btnY = bpY + storageHeight + bpHeaderHeight + bpPadding + i * bpRowHeight;
            const btnHeight = bpRowHeight - 4;
            const affordable = canAfford(gameState.resources, shipData.cost);
            const canBuildShip = affordable && !port.buildQueue;

            bounds.buttons.push({ y: btnY, height: btnHeight, shipType: shipType });

            const isHovered = canBuildShip && mousePos.x >= bpX && mousePos.x <= bpX + bpWidth &&
                              mousePos.y >= btnY && mousePos.y <= btnY + btnHeight;

            drawPanelButton(ctx, bpX, bpWidth, btnY, btnHeight, shipData, shipData.name,
                shipData.cost, shipData.build_time, isHovered, canBuildShip);
        }
    }

    // Upgrade section
    if (canUpgrade) {
        const upgradeY = bpY + storageHeight + shipSectionHeight + bpPadding;
        const nextPortData = PORTS[nextPortType];
        const upgradeAffordable = canAfford(gameState.resources, nextPortData.cost);

        drawPanelSeparator(ctx, bpX, bpWidth, upgradeY);
        k.drawText({
            text: "UPGRADE",
            pos: k.vec2(bpX + bpWidth / 2, upgradeY + 8),
            size: 10,
            anchor: "center",
            color: k.rgb(150, 150, 150),
        });

        const upgradeBtnY = upgradeY + bpHeaderHeight;
        const upgradeBtnHeight = bpRowHeight - 4;
        bounds.upgradeButton = { y: upgradeBtnY, height: upgradeBtnHeight, portType: nextPortType };

        const isUpgradeHovered = upgradeAffordable && mousePos.x >= bpX && mousePos.x <= bpX + bpWidth &&
                                 mousePos.y >= upgradeBtnY && mousePos.y <= upgradeBtnY + upgradeBtnHeight;

        drawPanelButton(ctx, bpX, bpWidth, upgradeBtnY, upgradeBtnHeight, nextPortData, nextPortData.name,
            nextPortData.cost, nextPortData.buildTime, isUpgradeHovered, upgradeAffordable);
    }

    // Settlement section
    if (canBuildSettlement) {
        const settlementY = bpY + storageHeight + shipSectionHeight + bpPadding + upgradeHeight;
        const settlementData = SETTLEMENTS.settlement;
        const alreadyBuildingSettlement = isBuildingSettlement;
        const settlementAffordable = canAfford(gameState.resources, settlementData.cost);
        const canBuildSettlementNow = settlementAffordable && !alreadyBuildingSettlement;

        drawPanelSeparator(ctx, bpX, bpWidth, settlementY);
        k.drawText({
            text: "BUILD SETTLEMENT",
            pos: k.vec2(bpX + bpWidth / 2, settlementY + 10),
            size: 11,
            anchor: "center",
            color: k.rgb(150, 150, 150),
        });

        const settlementBtnY = settlementY + bpHeaderHeight;
        const settlementBtnHeight = bpRowHeight - 4;
        bounds.settlementButton = { y: settlementBtnY, height: settlementBtnHeight };

        const isSettlementHovered = canBuildSettlementNow &&
                                    mousePos.x >= bpX && mousePos.x <= bpX + bpWidth &&
                                    mousePos.y >= settlementBtnY && mousePos.y <= settlementBtnY + settlementBtnHeight;

        const settlementName = alreadyBuildingSettlement ? `${settlementData.name} (building...)` : `${settlementData.name} (S)`;
        drawPanelButton(ctx, bpX, bpWidth, settlementBtnY, settlementBtnHeight, settlementData, settlementName,
            settlementData.cost, settlementData.buildTime, isSettlementHovered, canBuildSettlementNow);
    }

    // Defense section (Watchtower only - upgrades via tower panel)
    if (canBuildDefense) {
        const defenseY = bpY + storageHeight + shipSectionHeight + bpPadding + upgradeHeight + settlementHeight;
        const watchtowerData = TOWERS.watchtower;
        const towerAffordable = canAfford(gameState.resources, watchtowerData.cost);

        drawPanelSeparator(ctx, bpX, bpWidth, defenseY);
        k.drawText({
            text: "BUILD DEFENSE",
            pos: k.vec2(bpX + bpWidth / 2, defenseY + 10),
            size: 11,
            anchor: "center",
            color: k.rgb(150, 150, 150),
        });

        // Watchtower button
        const towerBtnY = defenseY + bpHeaderHeight;
        const towerBtnHeight = bpRowHeight - 4;
        bounds.towerButton = { y: towerBtnY, height: towerBtnHeight };

        const isTowerHovered = towerAffordable && mousePos.x >= bpX && mousePos.x <= bpX + bpWidth &&
                               mousePos.y >= towerBtnY && mousePos.y <= towerBtnY + towerBtnHeight;

        drawPanelButton(ctx, bpX, bpWidth, towerBtnY, towerBtnHeight, watchtowerData, `${watchtowerData.name} (T)`,
            watchtowerData.cost, watchtowerData.buildTime, isTowerHovered, towerAffordable);
    }

    return bounds;
}

/**
 * Draw all simple UI panels (resource, title, time)
 */
export function drawSimpleUIPanels(ctx, gameState) {
    drawResourcePanel(ctx, gameState);
    drawGameTitle(ctx);
    drawTimeIndicator(ctx, gameState.timeScale);
}
