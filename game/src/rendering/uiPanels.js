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
 * Draw the resource panel (top left)
 */
export function drawResourcePanel(ctx, gameState) {
    const { k } = ctx;

    const padding = 12;
    const panelX = 15;
    const panelY = 15;
    const panelHeight = 56;
    const iconSize = 16;
    const iconOffset = iconSize + 8;
    const valueFontSize = 18;
    const sectionGap = 16; // Gap between wood and crew sections

    // Resource values
    const res = gameState.resources;
    const crewStatus = computeCrewStatus(gameState);

    // Estimate text widths (approximate character width for the font)
    const charWidth = valueFontSize * 0.6;
    const woodValueText = `${res.wood}`;
    const crewValueText = `${crewStatus.used}/${crewStatus.cap}`;

    // Calculate section widths
    const woodSectionWidth = iconSize + 8 + Math.max(
        4 * 6, // "Wood" label width (4 chars * ~6px)
        woodValueText.length * charWidth
    );
    const crewSectionWidth = iconSize + 8 + Math.max(
        4 * 6, // "Crew" label width (4 chars * ~6px)
        crewValueText.length * charWidth
    );

    // Calculate total panel width dynamically
    const panelWidth = padding + woodSectionWidth + sectionGap + crewSectionWidth + padding;

    // Panel background (black)
    k.drawRect({
        pos: k.vec2(panelX, panelY),
        width: panelWidth,
        height: panelHeight,
        color: k.rgb(0, 0, 0),
        radius: 6,
        opacity: 0.85,
    });

    const contentY = panelY + padding;
    const valueY = contentY + 16;  // Y position of the value text

    // Wood section
    const woodIconX = panelX + padding;
    // Center icon vertically with the value text (value text baseline + half font height)
    const woodIconY = valueY + (valueFontSize / 2) - (iconSize / 2);

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
        pos: k.vec2(woodIconX + iconOffset, contentY),
        size: 10,
        color: k.rgb(139, 90, 43),
    });
    k.drawText({
        text: woodValueText,
        pos: k.vec2(woodIconX + iconOffset, valueY),
        size: valueFontSize,
        color: k.rgb(200, 150, 100),
    });

    // Crew section (right side of panel, positioned dynamically)
    const crewIconX = panelX + padding + woodSectionWidth + sectionGap;
    const crewIconY = valueY + (valueFontSize / 2) - (iconSize / 2);

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
        pos: k.vec2(crewIconX + iconOffset, contentY),
        size: 10,
        color: k.rgb(140, 160, 180),
    });

    // Crew value (used/cap format)
    const isAtOrOverCap = crewStatus.used >= crewStatus.cap;
    const crewColor = isAtOrOverCap ? k.rgb(255, 100, 100) : k.rgb(180, 200, 220);
    k.drawText({
        text: crewValueText,
        pos: k.vec2(crewIconX + iconOffset, valueY),
        size: valueFontSize,
        color: crewColor,
    });

}

/**
 * Draw top right menu button (hamburger icon)
 * Returns bounds for click detection
 */
export function drawTopRightButtons(ctx, gameState) {
    const { k, screenWidth } = ctx;

    const buttonWidth = 36;
    const buttonHeight = 36;
    const buttonY = 15;
    const mousePos = k.mousePos();

    // Menu button (hamburger icon)
    const menuX = screenWidth - buttonWidth - 15;
    const menuHovered = mousePos.x >= menuX && mousePos.x <= menuX + buttonWidth &&
                        mousePos.y >= buttonY && mousePos.y <= buttonY + buttonHeight;

    k.drawRect({
        pos: k.vec2(menuX, buttonY),
        width: buttonWidth,
        height: buttonHeight,
        color: k.rgb(0, 0, 0),
        radius: 6,
        opacity: menuHovered ? 1.0 : 0.85,
    });

    // Hamburger icon (three horizontal lines)
    const centerX = menuX + buttonWidth / 2;
    const centerY = buttonY + buttonHeight / 2;
    const lineColor = menuHovered ? k.rgb(200, 210, 220) : k.rgb(150, 160, 170);
    const lineWidth = 16;
    const lineHeight = 2;
    const lineSpacing = 5;

    for (let i = -1; i <= 1; i++) {
        k.drawRect({
            pos: k.vec2(centerX - lineWidth / 2, centerY + i * lineSpacing - lineHeight / 2),
            width: lineWidth,
            height: lineHeight,
            color: lineColor,
            radius: 1,
        });
    }

    return {
        menuButton: { x: menuX, y: buttonY, width: buttonWidth, height: buttonHeight },
    };
}

/**
 * Draw game menu dropdown
 * Returns bounds for click detection on menu items
 */
export function drawGameMenu(ctx, gameState, menuState) {
    if (!menuState.open) return null;

    const { k, screenWidth } = ctx;
    const mousePos = k.mousePos();

    // Menu positioning (below the hamburger button)
    const menuWidth = 130;
    const itemHeight = 32;
    const padding = 8;
    const menuX = screenWidth - menuWidth - 15;
    const menuY = 15 + 36 + 8;  // Below button

    const menuItems = [
        { id: 'controls', label: 'Controls', hotkey: '?' },
        { id: 'speed', label: 'Speed', hotkey: '>', showSubmenu: true },
        { id: 'pause', label: gameState.timeScale === 0 ? 'Resume' : 'Pause', hotkey: '.' },
        { id: 'debug', label: 'Debug', hotkey: '' },
        { id: 'quit', label: 'Quit', hotkey: '' },
    ];

    const menuHeight = menuItems.length * itemHeight + padding * 2;

    // Draw menu background
    k.drawRect({
        pos: k.vec2(menuX, menuY),
        width: menuWidth,
        height: menuHeight,
        color: k.rgb(0, 0, 0),
        radius: 6,
        opacity: 0.95,
    });

    const bounds = {
        menu: { x: menuX, y: menuY, width: menuWidth, height: menuHeight },
        items: [],
        speedSubmenu: null,
    };

    // Draw menu items
    for (let i = 0; i < menuItems.length; i++) {
        const item = menuItems[i];
        const itemY = menuY + padding + i * itemHeight;
        const isHovered = mousePos.x >= menuX && mousePos.x <= menuX + menuWidth &&
                          mousePos.y >= itemY && mousePos.y <= itemY + itemHeight;
        const isSpeedItem = item.id === 'speed';
        const isSpeedSubmenuOpen = isSpeedItem && menuState.speedSubmenuOpen;

        // Highlight on hover
        if (isHovered || isSpeedSubmenuOpen) {
            k.drawRect({
                pos: k.vec2(menuX + 4, itemY),
                width: menuWidth - 8,
                height: itemHeight,
                color: k.rgb(60, 70, 80),
                radius: 4,
            });
        }

        // Item label
        const textColor = isHovered || isSpeedSubmenuOpen ? k.rgb(255, 255, 255) : k.rgb(180, 190, 200);
        k.drawText({
            text: item.label,
            pos: k.vec2(menuX + 12, itemY + itemHeight / 2),
            size: 14,
            anchor: "left",
            color: textColor,
        });

        // Hotkey or current speed indicator
        let hotkeyText = item.hotkey;
        if (isSpeedItem) {
            hotkeyText = `${gameState.timeScale || 1}x >`;
        }
        if (hotkeyText) {
            k.drawText({
                text: hotkeyText,
                pos: k.vec2(menuX + menuWidth - 12, itemY + itemHeight / 2),
                size: 12,
                anchor: "right",
                color: k.rgb(120, 130, 140),
            });
        }

        bounds.items.push({
            id: item.id,
            x: menuX,
            y: itemY,
            width: menuWidth,
            height: itemHeight,
        });
    }

    // Draw speed submenu if open
    if (menuState.speedSubmenuOpen) {
        const speedSubmenuWidth = 70;
        const speedSubmenuX = menuX - speedSubmenuWidth - 4;
        const speedItemY = menuY + padding + 1 * itemHeight;  // Aligned with Speed item
        const speeds = [1, 2, 3, 4, 5];
        const speedSubmenuHeight = speeds.length * itemHeight + padding * 2;

        k.drawRect({
            pos: k.vec2(speedSubmenuX, speedItemY),
            width: speedSubmenuWidth,
            height: speedSubmenuHeight,
            color: k.rgb(0, 0, 0),
            radius: 6,
            opacity: 0.95,
        });

        bounds.speedSubmenu = {
            menu: { x: speedSubmenuX, y: speedItemY, width: speedSubmenuWidth, height: speedSubmenuHeight },
            items: [],
        };

        for (let i = 0; i < speeds.length; i++) {
            const speed = speeds[i];
            const sItemY = speedItemY + padding + i * itemHeight;
            const isCurrentSpeed = gameState.timeScale === speed;
            const isHovered = mousePos.x >= speedSubmenuX && mousePos.x <= speedSubmenuX + speedSubmenuWidth &&
                              mousePos.y >= sItemY && mousePos.y <= sItemY + itemHeight;

            if (isHovered) {
                k.drawRect({
                    pos: k.vec2(speedSubmenuX + 4, sItemY),
                    width: speedSubmenuWidth - 8,
                    height: itemHeight,
                    color: k.rgb(60, 70, 80),
                    radius: 4,
                });
            }

            const speedTextColor = isCurrentSpeed ? k.rgb(100, 200, 100) :
                                   isHovered ? k.rgb(255, 255, 255) : k.rgb(180, 190, 200);
            k.drawText({
                text: `${speed}x`,
                pos: k.vec2(speedSubmenuX + speedSubmenuWidth / 2, sItemY + itemHeight / 2),
                size: 14,
                anchor: "center",
                color: speedTextColor,
            });

            if (isCurrentSpeed) {
                k.drawText({
                    text: "✓",
                    pos: k.vec2(speedSubmenuX + speedSubmenuWidth - 10, sItemY + itemHeight / 2),
                    size: 12,
                    anchor: "center",
                    color: k.rgb(100, 200, 100),
                });
            }

            bounds.speedSubmenu.items.push({
                speed: speed,
                x: speedSubmenuX,
                y: sItemY,
                width: speedSubmenuWidth,
                height: itemHeight,
            });
        }
    }

    return bounds;
}

/**
 * Draw time scale indicator (top right, left of pause button) with clickable speed selector
 * Returns bounds for click detection
 */
export function drawTimeIndicator(ctx, timeScale, speedMenuOpen = false) {
    const { k, screenWidth } = ctx;

    // Position constants (matching top right buttons)
    const buttonWidth = 36;
    const buttonHeight = 36;
    const buttonSpacing = 8;
    const buttonY = 15;

    // Calculate position: left of pause button
    const menuBtnX = screenWidth - buttonWidth - 15;
    const pauseX = menuBtnX - buttonWidth - buttonSpacing;
    const indicatorWidth = 44;
    const x = pauseX - indicatorWidth - buttonSpacing;
    const y = buttonY;

    const timeLabel = timeScale === 0 ? "||" : `${timeScale}x`;
    const mousePos = k.mousePos();
    const isHovered = mousePos.x >= x && mousePos.x <= x + indicatorWidth &&
                      mousePos.y >= y && mousePos.y <= y + buttonHeight;

    // Draw button background
    k.drawRect({
        pos: k.vec2(x, y),
        width: indicatorWidth,
        height: buttonHeight,
        color: k.rgb(0, 0, 0),
        radius: 6,
        opacity: isHovered ? 1.0 : 0.85,
    });

    // Draw speed text centered
    const textColor = isHovered ? k.rgb(200, 210, 220) : k.rgb(150, 160, 170);
    k.drawText({
        text: timeLabel,
        pos: k.vec2(x + indicatorWidth / 2, y + buttonHeight / 2),
        size: 16,
        anchor: "center",
        color: textColor,
    });

    // Calculate bounds for click detection
    const bounds = {
        x: x,
        y: y,
        width: indicatorWidth,
        height: buttonHeight,
    };

    // Draw speed menu if open (dropdown below)
    if (speedMenuOpen) {
        const menuX = x;
        const menuY = y + buttonHeight + 4;  // Below the indicator
        const menuWidth = 80;
        const itemHeight = 28;
        const menuHeight = 5 * itemHeight + 8;  // 5 options + padding

        // Menu background
        k.drawRect({
            pos: k.vec2(menuX, menuY),
            width: menuWidth,
            height: menuHeight,
            color: k.rgb(0, 0, 0),
            radius: 6,
            opacity: 0.9,
        });

        bounds.menuItems = [];

        // Speed options 1x - 5x
        for (let i = 1; i <= 5; i++) {
            const itemY = menuY + 4 + (i - 1) * itemHeight;
            const isCurrentSpeed = timeScale === i;
            const isItemHovered = mousePos.x >= menuX && mousePos.x <= menuX + menuWidth &&
                             mousePos.y >= itemY && mousePos.y <= itemY + itemHeight;

            bounds.menuItems.push({
                y: itemY,
                height: itemHeight,
                speed: i,
            });

            // Highlight on hover
            if (isItemHovered) {
                k.drawRect({
                    pos: k.vec2(menuX + 4, itemY),
                    width: menuWidth - 8,
                    height: itemHeight,
                    color: k.rgb(60, 80, 100),
                    radius: 4,
                });
            }

            // Speed label
            const labelColor = isCurrentSpeed ? k.rgb(100, 200, 100) : k.rgb(200, 200, 200);
            const textY = itemY + itemHeight / 2;
            k.drawText({
                text: `${i}x`,
                pos: k.vec2(menuX + 14, textY),
                size: 14,
                anchor: "left",
                color: labelColor,
            });

            // Hotkey hint
            k.drawText({
                text: `(${i})`,
                pos: k.vec2(menuX + menuWidth - 14, textY),
                size: 12,
                anchor: "right",
                color: k.rgb(120, 120, 120),
            });
        }

        bounds.menu = {
            x: menuX,
            y: menuY,
            width: menuWidth,
            height: menuHeight,
        };
    }

    return bounds;
}

/**
 * Draw pirate kill counter (top, right of wave status panel in defend mode)
 */
export function drawPirateKillCounter(ctx, pirateKills) {
    const { k, screenWidth } = ctx;

    const padding = 10;
    const fontSize = 16;
    const spacing = 6;
    const spriteScale = 0.75;
    const spriteWidth = 48 * spriteScale;

    // Calculate dynamic width based on text length
    const text = `x ${pirateKills}`;
    const textWidth = text.length * 10;  // Approximate width
    const panelWidth = padding + spriteWidth + spacing + textWidth + padding;
    const panelHeight = 50;  // Match wave status height

    // Position to the right of wave status panel (200px wide, centered)
    const waveStatusRight = screenWidth / 2 + 100;
    const panelX = waveStatusRight + 8;
    const panelY = 15;  // Match wave status Y position

    // Panel background (black)
    k.drawRect({
        pos: k.vec2(panelX, panelY),
        width: panelWidth,
        height: panelHeight,
        color: k.rgb(0, 0, 0),
        radius: 6,
        opacity: 0.85,
    });

    // Draw pirate ship sprite
    const spriteX = panelX + padding + spriteWidth / 2;
    const spriteY = panelY + panelHeight / 2;
    k.drawSprite({
        sprite: "pirate",
        pos: k.vec2(spriteX, spriteY),
        anchor: "center",
        scale: spriteScale,
    });

    // Draw kill count with "x" prefix
    const textX = spriteX + spriteWidth / 2 + spacing;
    const textY = spriteY;
    k.drawText({
        text: text,
        pos: k.vec2(textX, textY),
        size: fontSize,
        anchor: "left",
        color: k.rgb(255, 255, 255),
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
    const panelY = 15;

    k.drawRect({
        pos: k.vec2(panelX, panelY),
        width: panelWidth,
        height: panelHeight,
        color: k.rgb(0, 0, 0),
        radius: 6,
        opacity: 0.85,
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
 * Draw ship info panel (bottom left, when single ship is selected)
 * Returns bounds for repair button click detection
 */
export function drawShipInfoPanel(ctx, ship, gameState) {
    if (!ship) return null;

    const { k, screenHeight } = ctx;
    const shipData = SHIPS[ship.type];
    const maxHealth = shipData.health;
    const isDamaged = ship.health < maxHealth;
    const isRepairing = !!ship.repair;

    // Determine if we have a status to show
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

    // Calculate panel height based on content
    const baseHeight = 40; // Header only
    const statusHeight = statusText ? 20 : 0;
    const cargoHeight = shipData.cargo > 0 ? 30 : 0;
    const infoPanelWidth = 160;
    const infoPanelHeight = baseHeight + statusHeight + cargoHeight;
    const infoPanelX = 15;  // Bottom left
    const infoPanelY = screenHeight - infoPanelHeight - 15;

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
        color: k.rgb(0, 0, 0),
        radius: 6,
        opacity: 0.85,
    });

    // Ship name (left-aligned)
    k.drawText({
        text: shipData.name,
        pos: k.vec2(infoPanelX + 14, infoPanelY + 14),
        size: 16,
        anchor: "left",
        color: k.rgb(200, 200, 200),
    });

    let currentY = infoPanelY + 32;

    // Status indicator
    if (statusText) {
        const badgeWidth = 70;
        const badgeHeight = 14;
        const badgeX = infoPanelX + 14;

        k.drawRect({
            pos: k.vec2(badgeX, currentY),
            width: badgeWidth,
            height: badgeHeight,
            color: statusColor,
            radius: 3,
            opacity: 0.3,
        });

        k.drawText({
            text: statusText,
            pos: k.vec2(badgeX + badgeWidth / 2, currentY + badgeHeight / 2),
            size: 10,
            anchor: "center",
            color: statusColor,
        });

        currentY += 20;
    }

    // Cargo section - only show if ship has cargo capacity
    if (shipData.cargo > 0) {
        const cargoWood = ship.cargo?.wood || 0;
        const maxCargo = shipData.cargo;
        const cargoY = currentY + 8;

        // Draw wood sprite
        k.drawSprite({
            sprite: "resource-wood",
            pos: k.vec2(infoPanelX + 24, cargoY),
            anchor: "center",
        });

        // Draw cargo count: "0/10"
        k.drawText({
            text: `${cargoWood}/${maxCargo}`,
            pos: k.vec2(infoPanelX + 42, cargoY),
            size: 14,
            anchor: "left",
            color: cargoWood > 0 ? k.rgb(200, 150, 100) : k.rgb(120, 120, 120),
        });
    }

    return bounds;
}

/**
 * Draw tower info panel (bottom left, when tower is selected)
 * Returns bounds for upgrade button click detection
 */
export function drawTowerInfoPanel(ctx, tower, gameState) {
    if (!tower) return null;

    const { k, screenHeight } = ctx;
    const towerData = TOWERS[tower.type];
    const nextTowerType = getNextTowerType(tower.type);
    const canUpgrade = nextTowerType && !tower.construction && !tower.repair;
    const maxHealth = towerData.health;
    const isDamaged = tower.health < maxHealth;
    const isRepairing = !!tower.repair;

    // Calculate dynamic width based on upgrade text
    let infoPanelWidth = 240;
    if (canUpgrade) {
        const nextTowerData = TOWERS[nextTowerType];
        const upgradeText = "Upgrade to " + nextTowerData.name;
        // Estimate text width: ~8px per char at size 13, plus sprite (38px) and padding (20px)
        const estimatedWidth = upgradeText.length * 8 + 38 + 30;
        infoPanelWidth = Math.max(infoPanelWidth, estimatedWidth);
    }
    const infoPanelX = 15;  // Bottom left
    const bpRowHeight = 44;
    const bpPadding = 10;
    const headerHeight = 24;
    const constructionHeight = tower.construction ? 55 : 0;
    const upgradeHeight = canUpgrade ? bpRowHeight : 0;
    // Only show repair button when damaged and not already repairing (repair bar shows above unit)
    const repairHeight = (isDamaged && !isRepairing) && !tower.construction ? 50 : 0;
    const infoPanelHeight = bpPadding + headerHeight + constructionHeight + upgradeHeight + repairHeight + bpPadding;
    const infoPanelY = screenHeight - infoPanelHeight - 15;

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

    // Tower name (left-aligned)
    k.drawText({
        text: towerData.name,
        pos: k.vec2(infoPanelX + 14, infoPanelY + bpPadding + 8),
        size: 16,
        anchor: "left",
        color: k.rgb(200, 200, 200),
    });

    const mousePos = k.mousePos();
    let currentY = infoPanelY + bpPadding + headerHeight;

    // Construction/upgrade status
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
            pos: k.vec2(infoPanelX + infoPanelWidth / 2, currentY + 6),
            size: 10,
            anchor: "center",
            color: k.rgb(220, 180, 80),
        });

        if (targetText) {
            k.drawText({
                text: targetText,
                pos: k.vec2(infoPanelX + infoPanelWidth / 2, currentY + 18),
                size: 10,
                anchor: "center",
                color: k.rgb(180, 200, 220),
            });
        }

        // Progress bar
        const barWidth = 120;
        const barX = infoPanelX + (infoPanelWidth - barWidth) / 2;
        const barY = currentY + (isUpgrading ? 32 : 20);

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
        // Upgrade section using drawPanelButton (like port panel)
        if (canUpgrade) {
            const nextTowerData = TOWERS[nextTowerType];
            const crewDiff = (nextTowerData.crewCost || 0) - (towerData.crewCost || 0);
            const upgradeAffordable = canAfford(gameState.resources, nextTowerData.cost) &&
                                      canAffordCrew(gameState, crewDiff);

            const upgradeBtnY = currentY;
            const upgradeBtnHeight = bpRowHeight - 4;
            bounds.upgradeButton = { y: upgradeBtnY, height: upgradeBtnHeight, towerType: nextTowerType };

            const isUpgradeHovered = upgradeAffordable && mousePos.x >= infoPanelX && mousePos.x <= infoPanelX + infoPanelWidth &&
                                     mousePos.y >= upgradeBtnY && mousePos.y <= upgradeBtnY + upgradeBtnHeight;

            drawPanelButton(ctx, infoPanelX, infoPanelWidth, upgradeBtnY, upgradeBtnHeight, nextTowerData, "Upgrade to " + nextTowerData.name,
                nextTowerData.cost, nextTowerData.buildTime, isUpgradeHovered, upgradeAffordable);

            // Tooltips for tower upgrades
            const isMouseOverUpgrade = mousePos.x >= infoPanelX && mousePos.x <= infoPanelX + infoPanelWidth &&
                                       mousePos.y >= upgradeBtnY && mousePos.y <= upgradeBtnY + upgradeBtnHeight;
            if (isMouseOverUpgrade) {
                if (nextTowerType === 'mortarTower') {
                    bounds.tooltip = {
                        x: infoPanelX + infoPanelWidth + 8,
                        y: upgradeBtnY,
                        text: "Armed defensive structure with a single cannon. Auto-fires at enemies within range.",
                    };
                } else if (nextTowerType === 'cannonBattery') {
                    bounds.tooltip = {
                        x: infoPanelX + infoPanelWidth + 8,
                        y: upgradeBtnY,
                        text: "Heavy fortification with dual cannons. Maximum firepower for holding key positions.",
                    };
                }
            }

            currentY += upgradeHeight;
        }

        // Repair button (only if damaged and not repairing - repair bar shows above unit)
        if (isDamaged && !isRepairing) {
            const repairCost = getRepairCost('tower', tower);
            const canAffordRepair = gameState.resources.wood >= repairCost.wood;

            const btnY = currentY + 5;
            const btnHeight = 36;

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
 * Draw the settlement info panel (bottom left, when settlement is selected)
 */
export function drawSettlementInfoPanel(ctx, settlement, gameState) {
    if (!settlement) return null;

    const { k, screenHeight } = ctx;
    const settlementData = SETTLEMENTS.settlement;
    const maxHealth = settlementData.health;
    const isDamaged = settlement.health < maxHealth;
    const isRepairing = !!settlement.repair;
    const isConstructing = !!settlement.construction;

    const infoPanelWidth = 160;
    // Base height for title only, add construction or repair sections as needed
    const baseHeight = 40;
    const constructionHeight = isConstructing ? 45 : 0;
    // Only show repair button when damaged and not already repairing
    const repairHeight = (isDamaged && !isRepairing && !isConstructing) ? 50 : 0;
    const infoPanelHeight = baseHeight + constructionHeight + repairHeight;
    const infoPanelX = 15;  // Bottom left
    const infoPanelY = screenHeight - infoPanelHeight - 15;

    const bounds = {
        x: infoPanelX,
        y: infoPanelY,
        width: infoPanelWidth,
        height: infoPanelHeight,
        repairButton: null,
    };

    // Panel background
    drawPanelContainer(ctx, infoPanelX, infoPanelY, infoPanelWidth, infoPanelHeight);

    // Settlement name (left-aligned)
    k.drawText({
        text: settlementData.name,
        pos: k.vec2(infoPanelX + 14, infoPanelY + 14),
        size: 16,
        anchor: "left",
        color: k.rgb(200, 200, 200),
    });

    // Construction status
    if (isConstructing) {
        const progress = settlement.construction.progress || 0;
        const buildTime = settlement.construction.buildTime;
        const progressPercent = Math.floor((progress / buildTime) * 100);

        k.drawText({
            text: "BUILDING",
            pos: k.vec2(infoPanelX + infoPanelWidth / 2, infoPanelY + 36),
            size: 10,
            anchor: "center",
            color: k.rgb(220, 180, 80),
        });

        // Progress bar
        const barWidth = 120;
        const barX = infoPanelX + (infoPanelWidth - barWidth) / 2;
        const barY = infoPanelY + 50;

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
        // Repair button (only if damaged and not repairing)
        if (isDamaged && !isRepairing) {
            const repairCost = getRepairCost('settlement', settlement);
            const canAffordRepair = gameState.resources.wood >= repairCost.wood;

            const repairY = infoPanelY + baseHeight - 5;

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
    const sidePadding = 10;

    // Button background (highlight on hover, only if can build)
    if (isHovered && canBuild) {
        k.drawRect({
            pos: k.vec2(panelX + sidePadding, btnY),
            width: panelWidth - sidePadding * 2,
            height: btnHeight,
            color: k.rgb(60, 80, 100),
            radius: 4,
        });
    }

    // Draw sprite thumbnail
    const thumbScale = 1.2;
    const spriteX = panelX + sidePadding + 4;

    // Use PNG sprite if available, otherwise fall back to pixel art
    if (spriteData.directionalSprite) {
        // For directional sprites, use player's red variant, SE facing (row 2, frame 0)
        const frame = 2 * 3 + 0;  // row 2 (SE) * 3 cols + frame 0
        const pngScale = (spriteData.spriteScale || 1) * 0.8;
        const spriteY = btnY + btnHeight / 2;
        k.drawSprite({
            sprite: 'cutter-red',  // Always show player's color in build menu
            frame: frame,
            pos: k.vec2(spriteX + 14, spriteY),
            anchor: "center",
            scale: pngScale,
            opacity: canBuild ? 1.0 : 0.4,
        });
    } else if (spriteData.imageSprite) {
        // For rotation-based sprites, use frame 0
        const pngScale = (spriteData.spriteScale || 1) * 0.8;
        const spriteY = btnY + btnHeight / 2;
        k.drawSprite({
            sprite: spriteData.imageSprite,
            frame: 0,
            pos: k.vec2(spriteX + 14, spriteY),
            anchor: "center",
            scale: pngScale,
            opacity: canBuild ? 1.0 : 0.4,
        });
    } else {
        // Fall back to pixel art
        const spriteSize = getSpriteSize(spriteData.sprite, thumbScale);
        const spriteY = btnY + (btnHeight - spriteSize.height) / 2;
        drawSprite(k, spriteData.sprite, spriteX, spriteY, thumbScale, canBuild ? 1.0 : 0.4);
    }

    // Parse name and hotkey (e.g., "Cutter (C)" -> "Cutter" and "(C)")
    const hotkeyMatch = name.match(/^(.+?)(\s*\([A-Z]\))$/);
    const displayName = hotkeyMatch ? hotkeyMatch[1] : name;
    const hotkey = hotkeyMatch ? hotkeyMatch[2] : null;

    // Name (greyed out if can't build)
    k.drawText({
        text: displayName,
        pos: k.vec2(panelX + sidePadding + 38, btnY + 10),
        size: 13,
        anchor: "left",
        color: !canBuild ? k.rgb(80, 80, 80) : isHovered ? k.rgb(255, 255, 255) : k.rgb(200, 200, 200),
    });

    // Hotkey hint (slightly off-white, matching speed menu)
    if (hotkey) {
        k.drawText({
            text: hotkey.trim(),
            pos: k.vec2(panelX + panelWidth - sidePadding - 4, btnY + 10),
            size: 12,
            anchor: "right",
            color: !canBuild ? k.rgb(60, 60, 60) : k.rgb(120, 120, 120),
        });
    }

    // Cost (wood and crew)
    const crewCost = spriteData.crewCost || 0;
    let costText = cost.wood ? `${cost.wood} wood` : "Free";
    if (crewCost > 0) {
        costText += `, ${crewCost} crew`;
    }
    k.drawText({
        text: costText,
        pos: k.vec2(panelX + sidePadding + 38, btnY + 26),
        size: 10,
        anchor: "left",
        color: !canBuild ? k.rgb(100, 60, 60) : k.rgb(120, 120, 120),
    });

    return { y: btnY, height: btnHeight };
}

/**
 * Draw panel separator line
 */
export function drawPanelSeparator(ctx, panelX, panelWidth, y) {
    const { k } = ctx;
    const sidePadding = 10;
    k.drawLine({
        p1: k.vec2(panelX + sidePadding, y),
        p2: k.vec2(panelX + panelWidth - sidePadding, y),
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
    const cpY = screenHeight - 15 - cpHeight;

    k.drawRect({
        pos: k.vec2(cpX, cpY),
        width: cpWidth,
        height: cpHeight,
        color: k.rgb(0, 0, 0),
        radius: 6,
        opacity: 0.85,
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
            text: "BUILDING",
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

    const activeItem = port.buildQueue[0];
    const progress = Math.min(activeItem.progress / activeItem.buildTime, 1);
    const percent = Math.floor(progress * 100);
    const shipName = SHIPS[activeItem.shipType].name;

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
    const shipData = SHIPS[ship.type];
    const buildablePortTypes = ['dock'];
    const watchtowerData = TOWERS.watchtower;

    const sbpWidth = 240;
    const sbpRowHeight = 44;
    const sbpPadding = 10;
    const headerHeight = 24;
    const sectionGap = 4;
    const portSectionHeight = buildablePortTypes.length * sbpRowHeight;
    const towerSectionHeight = sbpRowHeight;
    const sbpHeight = sbpPadding + headerHeight + portSectionHeight + sectionGap + towerSectionHeight + sbpPadding;
    const sbpX = 15;
    const sbpY = screenHeight - 15 - sbpHeight;

    // Store bounds for click detection
    const bounds = {
        x: sbpX,
        y: sbpY,
        width: sbpWidth,
        height: sbpHeight,
        buttons: [],
        towerButton: null,
        shipIndex: shipIndex,
        tooltip: null,
    };

    // Panel background
    drawPanelContainer(ctx, sbpX, sbpY, sbpWidth, sbpHeight);

    // Ship name header (left-aligned)
    k.drawText({
        text: shipData.name,
        pos: k.vec2(sbpX + 14, sbpY + sbpPadding + 8),
        size: 16,
        anchor: "left",
        color: k.rgb(200, 200, 200),
    });

    const mousePos = k.mousePos();
    let currentY = sbpY + sbpPadding + headerHeight;

    // Port buttons
    for (let i = 0; i < buildablePortTypes.length; i++) {
        const portType = buildablePortTypes[i];
        const portData = PORTS[portType];
        const btnY = currentY + i * sbpRowHeight;
        const btnHeight = sbpRowHeight - 4;
        const portAffordable = canAfford(gameState.resources, portData.cost);

        bounds.buttons.push({ y: btnY, height: btnHeight, portType: portType });

        const isHovered = portAffordable && mousePos.x >= sbpX && mousePos.x <= sbpX + sbpWidth &&
                          mousePos.y >= btnY && mousePos.y <= btnY + btnHeight;

        drawPanelButton(ctx, sbpX, sbpWidth, btnY, btnHeight, portData, `Build ${portData.name}`,
            portData.cost, portData.buildTime, isHovered, portAffordable);

        // Tooltip for Dock
        if (portType === 'dock') {
            const isMouseOverPort = mousePos.x >= sbpX && mousePos.x <= sbpX + sbpWidth &&
                                    mousePos.y >= btnY && mousePos.y <= btnY + btnHeight;
            if (isMouseOverPort) {
                bounds.tooltip = {
                    x: sbpX + sbpWidth + 8,
                    y: btnY,
                    text: "Basic coastal port. Can build Cutters and settlements.",
                };
            }
        }
    }

    currentY += portSectionHeight + sectionGap;

    // Watchtower button
    const towerBtnY = currentY;
    const towerBtnHeight = sbpRowHeight - 4;
    const towerAffordable = canAfford(gameState.resources, watchtowerData.cost) &&
                            canAffordCrew(gameState, watchtowerData.crewCost || 0);

    bounds.towerButton = { y: towerBtnY, height: towerBtnHeight };

    const isTowerHovered = towerAffordable && mousePos.x >= sbpX && mousePos.x <= sbpX + sbpWidth &&
                           mousePos.y >= towerBtnY && mousePos.y <= towerBtnY + towerBtnHeight;

    drawPanelButton(ctx, sbpX, sbpWidth, towerBtnY, towerBtnHeight, watchtowerData, `Build ${watchtowerData.name} (T)`,
        watchtowerData.cost, watchtowerData.buildTime, isTowerHovered, towerAffordable);

    // Tooltip for Watchtower
    const isMouseOverTower = mousePos.x >= sbpX && mousePos.x <= sbpX + sbpWidth &&
                             mousePos.y >= towerBtnY && mousePos.y <= towerBtnY + towerBtnHeight;
    if (isMouseOverTower) {
        bounds.tooltip = {
            x: sbpX + sbpWidth + 8,
            y: towerBtnY,
            text: "Extends vision across nearby hexes. No weapons—upgrade to Mortar Tower for defense.",
        };
    }

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
    const isBuilding = port.buildQueue.length > 0;
    const maxQueueSize = PORTS[port.type]?.maxQueueSize || 3;
    const isQueueFull = port.buildQueue.length >= maxQueueSize;
    const portBusy = isBuilding || isBuildingSettlement;

    // Track what CAN be built (for enabling/disabling buttons)
    const canUpgrade = nextPortType && !portBusy && !isRepairing;
    const canBuildSettlement = !isBuildingSettlement && !gameState.settlementBuildMode.active && !isRepairing;
    const canBuildDefense = !gameState.towerBuildMode.active && !isRepairing;

    // Track what SHOULD be shown (always show these sections for consistent height)
    const showSettlement = true;  // Always show settlement option
    const showDefense = true;     // Always show watchtower option
    const showUpgrade = !!nextPortType;  // Only show if there's an upgrade available

    const hasStorage = portIndex > 0 && port.storage && port.storage.wood > 0;
    const storageHeight = hasStorage ? 45 : 0;

    const bpWidth = 240;
    const bpRowHeight = 44;
    const bpPadding = 10;
    const headerHeight = 24; // Height for port name header
    const sectionGap = 4; // Gap between sections
    const shipButtonsHeight = buildableShips.length * bpRowHeight;
    // Always show ship buttons (queue allows adding while building)
    const shipSectionHeight = shipButtonsHeight;
    const settlementHeight = showSettlement ? bpRowHeight : 0;
    const defenseHeight = showDefense ? bpRowHeight : 0; // Just Watchtower
    const upgradeHeight = showUpgrade ? bpRowHeight : 0;
    // Only show repair button when damaged and not already repairing (repair bar shows above unit)
    const repairHeight = (isDamaged && !isRepairing) ? 50 : 0;
    // Count number of section gaps needed
    const numSections = [settlementHeight > 0, shipSectionHeight > 0, defenseHeight > 0, upgradeHeight > 0, repairHeight > 0].filter(Boolean).length;
    const totalSectionGaps = Math.max(0, numSections - 1) * sectionGap;
    // New order: Header, Settlement, Ships, Watchtower, Upgrades, Repair (with padding top/bottom)
    const bpHeight = bpPadding + headerHeight + storageHeight + settlementHeight + shipSectionHeight + defenseHeight + upgradeHeight + repairHeight + totalSectionGaps + bpPadding;
    const bpX = 15;
    const bpY = screenHeight - 15 - bpHeight;

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

    // Port name header
    k.drawText({
        text: portData.name,
        pos: k.vec2(bpX + 14, bpY + bpPadding + 8),
        size: 16,
        anchor: "left",
        color: k.rgb(200, 200, 200),
    });

    // Storage section for non-home ports
    if (hasStorage) {
        drawPortStorage(ctx, port, bpX, bpWidth, bpY + bpPadding + headerHeight);
        k.drawLine({
            p1: k.vec2(bpX + 8, bpY + bpPadding + headerHeight + storageHeight - 4),
            p2: k.vec2(bpX + bpWidth - 8, bpY + bpPadding + headerHeight + storageHeight - 4),
            width: 1,
            color: k.rgb(60, 70, 80),
        });
    }

    const mousePos = k.mousePos();

    // Track current Y position for sections (after top padding, header and storage)
    let currentY = bpY + bpPadding + headerHeight + storageHeight;
    let hasPreviousSection = false;

    // 1. Settlement section (always visible)
    if (showSettlement) {
        const settlementData = SETTLEMENTS.settlement;
        const alreadyBuildingSettlement = isBuildingSettlement;
        const settlementAffordable = canAfford(gameState.resources, settlementData.cost);
        const canBuildSettlementNow = canBuildSettlement && settlementAffordable && !alreadyBuildingSettlement;

        const settlementBtnY = currentY;
        const settlementBtnHeight = bpRowHeight - 4;
        bounds.settlementButton = canBuildSettlement ? { y: settlementBtnY, height: settlementBtnHeight } : null;

        // Check if mouse is over settlement button (for highlighting when affordable)
        const isMouseOverSettlement = mousePos.x >= bpX && mousePos.x <= bpX + bpWidth &&
                                      mousePos.y >= settlementBtnY && mousePos.y <= settlementBtnY + settlementBtnHeight;
        const isSettlementHovered = canBuildSettlementNow && isMouseOverSettlement;

        const settlementName = `Build ${settlementData.name} (S)`;
        drawPanelButton(ctx, bpX, bpWidth, settlementBtnY, settlementBtnHeight, settlementData, settlementName,
            settlementData.cost, settlementData.buildTime, isSettlementHovered, canBuildSettlementNow);

        // Store tooltip info if mouse is over (show regardless of affordability)
        if (isMouseOverSettlement) {
            bounds.tooltip = {
                x: bpX + bpWidth + 8,
                y: settlementBtnY,
                text: "Produces wood and increases your crew cap allowing you to build more ships and structures",
            };
        }

        currentY += settlementHeight;
        hasPreviousSection = true;
    }

    // 2. Ship section (always visible - queue allows adding while building)
    if (buildableShips.length > 0) {
        if (hasPreviousSection) {
            currentY += sectionGap;
        }

        // Ship buttons
        for (let i = 0; i < buildableShips.length; i++) {
            const shipType = buildableShips[i];
            const shipData = SHIPS[shipType];
            const btnY = currentY + i * bpRowHeight;
            const btnHeight = bpRowHeight - 4;
            const affordable = canAfford(gameState.resources, shipData.cost) &&
                               canAffordCrew(gameState, shipData.crewCost || 0);
            // Can build if queue not full and not repairing (affordability only matters for first item)
            const canBuildShip = !isQueueFull && !isRepairing && (isBuilding || affordable);

            bounds.buttons.push({ y: btnY, height: btnHeight, shipType: shipType });

            const isHovered = canBuildShip && mousePos.x >= bpX && mousePos.x <= bpX + bpWidth &&
                              mousePos.y >= btnY && mousePos.y <= btnY + btnHeight;

            // Add hotkey hint to ship name (C for Cutter)
            const hotkey = shipType === 'cutter' ? ' (C)' : '';
            drawPanelButton(ctx, bpX, bpWidth, btnY, btnHeight, shipData, `Build ${shipData.name}` + hotkey,
                shipData.cost, shipData.build_time, isHovered, canBuildShip);

            // Tooltip for Cutter
            if (shipType === 'cutter') {
                const isMouseOverShip = mousePos.x >= bpX && mousePos.x <= bpX + bpWidth &&
                                        mousePos.y >= btnY && mousePos.y <= btnY + btnHeight;
                if (isMouseOverShip) {
                    bounds.tooltip = {
                        x: bpX + bpWidth + 8,
                        y: btnY,
                        text: "Fast, cheap scout. Great for exploration and harassing enemies, but fragile in direct combat.",
                    };
                }
            }
        }
        currentY += shipSectionHeight;
        hasPreviousSection = true;
    }

    // 3. Defense section (Watchtower only - always visible)
    if (showDefense) {
        const watchtowerData = TOWERS.watchtower;
        const towerAffordable = canBuildDefense && canAfford(gameState.resources, watchtowerData.cost) &&
                                canAffordCrew(gameState, watchtowerData.crewCost || 0);

        if (hasPreviousSection) {
            currentY += sectionGap;
        }

        const towerBtnY = currentY;
        const towerBtnHeight = bpRowHeight - 4;
        bounds.towerButton = canBuildDefense ? { y: towerBtnY, height: towerBtnHeight } : null;

        const isTowerHovered = towerAffordable && mousePos.x >= bpX && mousePos.x <= bpX + bpWidth &&
                               mousePos.y >= towerBtnY && mousePos.y <= towerBtnY + towerBtnHeight;

        drawPanelButton(ctx, bpX, bpWidth, towerBtnY, towerBtnHeight, watchtowerData, `Build ${watchtowerData.name} (T)`,
            watchtowerData.cost, watchtowerData.buildTime, isTowerHovered, towerAffordable);

        // Tooltip for Watchtower
        const isMouseOverTower = mousePos.x >= bpX && mousePos.x <= bpX + bpWidth &&
                                 mousePos.y >= towerBtnY && mousePos.y <= towerBtnY + towerBtnHeight;
        if (isMouseOverTower) {
            bounds.tooltip = {
                x: bpX + bpWidth + 8,
                y: towerBtnY,
                text: "Extends vision across nearby hexes. No weapons—upgrade to Mortar Tower for defense.",
            };
        }

        currentY += defenseHeight;
        hasPreviousSection = true;
    }

    // 4. Upgrade section (only if there's an upgrade available)
    if (showUpgrade) {
        const nextPortData = PORTS[nextPortType];
        const upgradeAffordable = canUpgrade && canAfford(gameState.resources, nextPortData.cost);

        if (hasPreviousSection) {
            currentY += sectionGap;
        }

        const upgradeBtnY = currentY;
        const upgradeBtnHeight = bpRowHeight - 4;
        bounds.upgradeButton = canUpgrade ? { y: upgradeBtnY, height: upgradeBtnHeight, portType: nextPortType } : null;

        const isUpgradeHovered = upgradeAffordable && mousePos.x >= bpX && mousePos.x <= bpX + bpWidth &&
                                 mousePos.y >= upgradeBtnY && mousePos.y <= upgradeBtnY + upgradeBtnHeight;

        drawPanelButton(ctx, bpX, bpWidth, upgradeBtnY, upgradeBtnHeight, nextPortData, "Upgrade to " + nextPortData.name,
            nextPortData.cost, nextPortData.buildTime, isUpgradeHovered, upgradeAffordable);

        // Tooltip for Shipyard upgrade
        if (nextPortType === 'shipyard') {
            const isMouseOverUpgrade = mousePos.x >= bpX && mousePos.x <= bpX + bpWidth &&
                                       mousePos.y >= upgradeBtnY && mousePos.y <= upgradeBtnY + upgradeBtnHeight;
            if (isMouseOverUpgrade) {
                bounds.tooltip = {
                    x: bpX + bpWidth + 8,
                    y: upgradeBtnY,
                    text: "Unlocks Schooners, increases crew capacity, and adds a second build slot.",
                };
            }
        }

        currentY += upgradeHeight;
        hasPreviousSection = true;
    }

    // 5. Repair button (only if damaged and not repairing - repair bar shows above unit)
    if (isDamaged && !isRepairing) {
        // Show repair button
        const repairCost = getRepairCost('port', port);
        const canAffordRepair = gameState.resources.wood >= repairCost.wood;

        if (hasPreviousSection) {
            currentY += sectionGap;
        }

        const btnY = currentY;
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
 * Draw controls menu panel (center of screen)
 * Returns bounds for click detection
 */
export function drawMenuPanel(ctx) {
    const { k, screenWidth, screenHeight } = ctx;

    const panelWidth = 320;
    const panelHeight = 385;
    const panelX = screenWidth / 2 - panelWidth / 2;
    const panelY = screenHeight / 2 - panelHeight / 2;

    // Panel background
    k.drawRect({
        pos: k.vec2(panelX, panelY),
        width: panelWidth,
        height: panelHeight,
        color: k.rgb(0, 0, 0),
        radius: 8,
        opacity: 0.95,
    });

    // Title
    k.drawText({
        text: "CONTROLS",
        pos: k.vec2(screenWidth / 2, panelY + 25),
        size: 20,
        anchor: "center",
        color: k.rgb(255, 255, 255),
    });

    // Separator
    k.drawLine({
        p1: k.vec2(panelX + 20, panelY + 50),
        p2: k.vec2(panelX + panelWidth - 20, panelY + 50),
        width: 1,
        color: k.rgb(60, 70, 80),
    });

    // Controls list
    const controls = [
        { key: "Left Click", action: "Select units" },
        { key: "Shift + Click", action: "Add to selection" },
        { key: "Left Drag", action: "Box select" },
        { key: "Right Click", action: "Move / Attack" },
        { key: "Right Drag", action: "Pan camera" },
        { key: "Scroll", action: "Zoom in/out" },
        { key: "P", action: "Set patrol route" },
        { key: "H", action: "Return to home port" },
        { key: "1-5", action: "Set game speed" },
        { key: ".", action: "Pause / Resume" },
        { key: "/", action: "Toggle this menu" },
    ];

    const startY = panelY + 70;
    const rowHeight = 26;

    for (let i = 0; i < controls.length; i++) {
        const y = startY + i * rowHeight;

        // Key
        k.drawText({
            text: controls[i].key,
            pos: k.vec2(panelX + 25, y),
            size: 13,
            color: k.rgb(180, 200, 220),
        });

        // Action
        k.drawText({
            text: controls[i].action,
            pos: k.vec2(panelX + 140, y),
            size: 13,
            color: k.rgb(150, 150, 150),
        });
    }

    // Close hint
    k.drawText({
        text: "Click anywhere to close",
        pos: k.vec2(screenWidth / 2, panelY + panelHeight - 25),
        size: 11,
        anchor: "center",
        color: k.rgb(100, 100, 100),
    });

    return {
        x: panelX,
        y: panelY,
        width: panelWidth,
        height: panelHeight,
    };
}

/**
 * Draw debug panel modal with toggleable options
 * @param {Object} ctx - Drawing context
 * @param {Object} debugState - Current debug state { hideFog: boolean, ... }
 * @returns {Object} Bounds for click detection
 */
export function drawDebugPanel(ctx, debugState) {
    const { k, screenWidth, screenHeight } = ctx;
    const mousePos = k.mousePos();

    const panelWidth = 280;
    const panelHeight = 160;
    const panelX = screenWidth / 2 - panelWidth / 2;
    const panelY = screenHeight / 2 - panelHeight / 2;

    // Panel background
    k.drawRect({
        pos: k.vec2(panelX, panelY),
        width: panelWidth,
        height: panelHeight,
        color: k.rgb(0, 0, 0),
        radius: 8,
        opacity: 0.95,
    });

    // Title
    k.drawText({
        text: "DEBUG OPTIONS",
        pos: k.vec2(screenWidth / 2, panelY + 25),
        size: 20,
        anchor: "center",
        color: k.rgb(255, 255, 255),
    });

    // Separator
    k.drawLine({
        p1: k.vec2(panelX + 20, panelY + 50),
        p2: k.vec2(panelX + panelWidth - 20, panelY + 50),
        width: 1,
        color: k.rgb(60, 70, 80),
    });

    // Debug options with checkboxes
    const options = [
        { id: 'hideFog', label: 'Hide fog of war', value: debugState.hideFog },
    ];

    const startY = panelY + 70;
    const rowHeight = 30;
    const checkboxSize = 18;
    const bounds = {
        panel: { x: panelX, y: panelY, width: panelWidth, height: panelHeight },
        options: [],
    };

    for (let i = 0; i < options.length; i++) {
        const opt = options[i];
        const y = startY + i * rowHeight;
        const checkboxX = panelX + 25;
        const checkboxY = y - checkboxSize / 2 + 2;

        // Check if hovering this row
        const isHovered = mousePos.x >= panelX + 20 && mousePos.x <= panelX + panelWidth - 20 &&
                          mousePos.y >= y - rowHeight / 2 && mousePos.y <= y + rowHeight / 2;

        // Highlight on hover
        if (isHovered) {
            k.drawRect({
                pos: k.vec2(panelX + 15, y - 10),
                width: panelWidth - 30,
                height: rowHeight - 4,
                color: k.rgb(40, 50, 60),
                radius: 4,
            });
        }

        // Checkbox box
        k.drawRect({
            pos: k.vec2(checkboxX, checkboxY),
            width: checkboxSize,
            height: checkboxSize,
            color: k.rgb(30, 40, 50),
            radius: 3,
            outline: { color: k.rgb(100, 110, 120), width: 1 },
        });

        // Checkmark if enabled
        if (opt.value) {
            k.drawText({
                text: "✓",
                pos: k.vec2(checkboxX + checkboxSize / 2, checkboxY + checkboxSize / 2 + 1),
                size: 14,
                anchor: "center",
                color: k.rgb(100, 200, 100),
            });
        }

        // Label (vertically centered with checkbox)
        k.drawText({
            text: opt.label,
            pos: k.vec2(checkboxX + checkboxSize + 12, checkboxY + checkboxSize / 2),
            size: 14,
            anchor: "left",
            color: isHovered ? k.rgb(255, 255, 255) : k.rgb(180, 190, 200),
        });

        bounds.options.push({
            id: opt.id,
            x: panelX + 15,
            y: y - 10,
            width: panelWidth - 30,
            height: rowHeight - 4,
        });
    }

    // Close hint
    k.drawText({
        text: "Click outside to close",
        pos: k.vec2(screenWidth / 2, panelY + panelHeight - 20),
        size: 11,
        anchor: "center",
        color: k.rgb(100, 100, 100),
    });

    return bounds;
}

/**
 * Draw all simple UI panels (resource, buttons, time, pirate kills, wave status)
 * Returns bounds for button click detection
 */
export function drawSimpleUIPanels(ctx, gameState, waveStatus = null) {
    drawResourcePanel(ctx, gameState);
    const buttonBounds = drawTopRightButtons(ctx, gameState);
    // Only show pirate kill counter in defend mode
    if (gameState.scenario && gameState.scenario.gameMode === 'defend') {
        drawPirateKillCounter(ctx, gameState.pirateKills);
    }
    drawWaveStatus(ctx, waveStatus);

    return buttonBounds;
}

/**
 * Draw a tooltip box at specified position
 */
export function drawTooltip(ctx, tooltip) {
    if (!tooltip) return;

    const { k, screenWidth, screenHeight } = ctx;
    const { x: initialX, y: initialY, text } = tooltip;

    const padding = 12;
    const fontSize = 14;
    const maxWidth = 220;
    const lineHeight = fontSize + 6;
    const screenMargin = 10;

    // Word wrap text to fit within maxWidth
    const words = text.split(' ');
    const lines = [];
    let currentLine = '';
    const charWidth = fontSize * 0.65; // Monospace font is wider

    for (const word of words) {
        const testLine = currentLine ? `${currentLine} ${word}` : word;
        const testWidth = testLine.length * charWidth;
        if (testWidth > maxWidth && currentLine) {
            lines.push(currentLine);
            currentLine = word;
        } else {
            currentLine = testLine;
        }
    }
    if (currentLine) {
        lines.push(currentLine);
    }

    // Calculate tooltip dimensions
    const longestLine = lines.reduce((max, line) => Math.max(max, line.length), 0);
    const tooltipWidth = longestLine * charWidth + padding * 2 + 8; // Extra buffer for font rendering
    const tooltipHeight = lines.length * lineHeight + padding * 2;

    // Adjust position to keep tooltip on screen
    let x = initialX;
    let y = initialY;

    // Check right edge
    if (x + tooltipWidth > screenWidth - screenMargin) {
        x = screenWidth - tooltipWidth - screenMargin;
    }
    // Check left edge
    if (x < screenMargin) {
        x = screenMargin;
    }
    // Check bottom edge
    if (y + tooltipHeight > screenHeight - screenMargin) {
        y = screenHeight - tooltipHeight - screenMargin;
    }
    // Check top edge
    if (y < screenMargin) {
        y = screenMargin;
    }

    // Background
    k.drawRect({
        pos: k.vec2(x, y),
        width: tooltipWidth,
        height: tooltipHeight,
        color: k.rgb(30, 35, 45),
        radius: 4,
        opacity: 0.95,
    });

    // Border
    k.drawRect({
        pos: k.vec2(x, y),
        width: tooltipWidth,
        height: tooltipHeight,
        color: k.rgb(80, 90, 100),
        radius: 4,
        fill: false,
        outline: { width: 1, color: k.rgb(80, 90, 100) },
    });

    // Draw each line of text
    for (let i = 0; i < lines.length; i++) {
        k.drawText({
            text: lines[i],
            pos: k.vec2(x + padding, y + padding + i * lineHeight),
            size: fontSize,
            color: k.rgb(220, 220, 220),
        });
    }
}

/**
 * Draw notification message at bottom center of screen
 */
export function drawNotification(ctx, notification) {
    if (!notification) return;

    const { k, screenWidth, screenHeight } = ctx;
    const message = notification.message;

    const x = screenWidth / 2;
    const y = screenHeight - 60;

    // Draw text with black outline
    const outlineOffsets = [
        [-1, -1], [0, -1], [1, -1],
        [-1, 0],          [1, 0],
        [-1, 1],  [0, 1],  [1, 1],
    ];

    for (const [ox, oy] of outlineOffsets) {
        k.drawText({
            text: message,
            pos: k.vec2(x + ox, y + oy),
            size: 16,
            anchor: "center",
            color: k.rgb(0, 0, 0),
        });
    }

    // Draw white text on top
    k.drawText({
        text: message,
        pos: k.vec2(x, y),
        size: 16,
        anchor: "center",
        color: k.rgb(255, 255, 255),
    });
}

/**
 * Draw the build queue panel at bottom center of screen
 * Shows active build + queued items for the selected port
 * Returns bounds for click detection (cancel buttons)
 */
export function drawBuildQueuePanel(ctx, port, mousePos) {
    if (!port || port.buildQueue.length === 0) return null;

    const { k, screenWidth, screenHeight } = ctx;

    const itemSize = 48; // Size of ship sprite area
    const itemSpacing = 8;
    const progressBarHeight = 6;
    const panelPadding = 12;
    const queueCount = port.buildQueue.length;

    // Calculate panel dimensions
    const panelWidth = queueCount * itemSize + (queueCount - 1) * itemSpacing + panelPadding * 2;
    const panelHeight = itemSize + progressBarHeight + panelPadding * 2 + 8;
    const panelX = screenWidth / 2 - panelWidth / 2;
    const panelY = screenHeight - panelHeight - 15;

    // Draw panel background
    k.drawRect({
        pos: k.vec2(panelX, panelY),
        width: panelWidth,
        height: panelHeight,
        color: k.rgb(0, 0, 0),
        radius: 6,
        opacity: 0.85,
    });

    const bounds = {
        x: panelX,
        y: panelY,
        width: panelWidth,
        height: panelHeight,
        items: [],
    };

    // Draw each queue item
    for (let i = 0; i < port.buildQueue.length; i++) {
        const item = port.buildQueue[i];
        const shipData = SHIPS[item.shipType];
        const isActive = item.progress !== null;  // Any item with progress is active (parallel builds)

        // Calculate item position (active on left, queued to the right)
        const itemX = panelX + panelPadding + i * (itemSize + itemSpacing);
        const itemY = panelY + panelPadding;

        // Store bounds for click detection
        bounds.items.push({
            index: i,
            x: itemX,
            y: itemY,
            width: itemSize,
            height: itemSize,
            shipType: item.shipType,
            isActive,
        });

        // Check if mouse is hovering this item
        const isHovered = mousePos &&
            mousePos.x >= itemX && mousePos.x <= itemX + itemSize &&
            mousePos.y >= itemY && mousePos.y <= itemY + itemSize;

        // Draw item background
        k.drawRect({
            pos: k.vec2(itemX, itemY),
            width: itemSize,
            height: itemSize,
            color: isHovered ? k.rgb(80, 40, 40) : k.rgb(40, 45, 55),
            radius: 4,
        });

        // Draw ship sprite (use PNG sprite if available)
        const spriteX = itemX + itemSize / 2;
        const spriteY = itemY + itemSize / 2;

        if (shipData.directionalSprite) {
            // For directional sprites, use player's red variant, SE facing (row 2, frame 0)
            const frame = 2 * 3 + 0;  // row 2 (SE) * 3 cols + frame 0
            const pngScale = (shipData.spriteScale || 1) * 1.0;
            k.drawSprite({
                sprite: 'cutter-red',  // Always show player's color in build queue
                frame: frame,
                pos: k.vec2(spriteX, spriteY),
                anchor: "center",
                scale: pngScale,
                opacity: isActive ? 1.0 : 0.5,
            });
        } else if (shipData.imageSprite) {
            const pngScale = (shipData.spriteScale || 1) * 1.0;
            k.drawSprite({
                sprite: shipData.imageSprite,
                frame: 0,
                pos: k.vec2(spriteX, spriteY),
                anchor: "center",
                scale: pngScale,
                opacity: isActive ? 1.0 : 0.5,
            });
        } else {
            // Fallback to pixel art sprite
            const spriteScale = 1;
            const spriteSize = getSpriteSize(shipData.sprite);
            const sx = itemX + (itemSize - spriteSize.width * spriteScale) / 2;
            const sy = itemY + (itemSize - spriteSize.height * spriteScale) / 2;
            drawSprite(k, shipData.sprite, sx, sy, spriteScale, isActive ? 1.0 : 0.5);
        }

        // Draw red X on hover (cancel indicator)
        if (isHovered) {
            const xSize = 12;
            const xThickness = 2;
            const xColor = k.rgb(220, 60, 60);
            const cx = itemX + itemSize / 2;
            const cy = itemY + itemSize / 2;

            // Draw X with two lines
            k.drawLine({
                p1: k.vec2(cx - xSize / 2, cy - xSize / 2),
                p2: k.vec2(cx + xSize / 2, cy + xSize / 2),
                width: xThickness,
                color: xColor,
            });
            k.drawLine({
                p1: k.vec2(cx + xSize / 2, cy - xSize / 2),
                p2: k.vec2(cx - xSize / 2, cy + xSize / 2),
                width: xThickness,
                color: xColor,
            });
        }

        // Draw progress bar for active item
        if (isActive) {
            const barY = itemY + itemSize + 4;
            const progress = Math.min(item.progress / item.buildTime, 1);

            // Background
            k.drawRect({
                pos: k.vec2(itemX, barY),
                width: itemSize,
                height: progressBarHeight,
                color: k.rgb(40, 40, 40),
                radius: 2,
            });

            // Fill
            if (progress > 0) {
                k.drawRect({
                    pos: k.vec2(itemX, barY),
                    width: itemSize * progress,
                    height: progressBarHeight,
                    color: k.rgb(80, 180, 220),
                    radius: 2,
                });
            }
        }

        // Draw queue position number for non-active items
        if (!isActive) {
            k.drawText({
                text: `${i}`,
                pos: k.vec2(itemX + itemSize - 8, itemY + 10),
                size: 10,
                anchor: "center",
                color: k.rgb(150, 150, 150),
            });
        }
    }

    return bounds;
}
