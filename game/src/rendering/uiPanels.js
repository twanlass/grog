// UI panel rendering: resource panel, build panels, ship info panel
import { drawSprite, getSpriteSize, SHIPS, PORTS, SETTLEMENTS, TOWERS } from "../sprites/index.js";
import { getBuildableShips, getNextPortType, isPortBuildingSettlement, canAfford } from "../gameState.js";

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
    const infoPanelHeight = 100;
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
 * Draw all simple UI panels (resource, title, time)
 */
export function drawSimpleUIPanels(ctx, gameState) {
    drawResourcePanel(ctx, gameState);
    drawGameTitle(ctx);
    drawTimeIndicator(ctx, gameState.timeScale);
}
