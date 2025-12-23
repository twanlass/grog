// Gallery scene - Display ships and ports
import { SHIPS, PORTS, drawSprite, getSpriteSize } from "../sprites/index.js";

export function createGalleryScene(k) {
    return function galleryScene() {
        const ships = Object.values(SHIPS);
        const ports = Object.values(PORTS);
        const scale = 3; // Scale for gallery view
        const cardWidth = 180;
        const shipCardHeight = 180;
        const portCardHeight = 160;
        const gap = 12;

        // Ships row
        const shipsTotalWidth = ships.length * cardWidth + (ships.length - 1) * gap;
        const shipsStartX = (k.width() - shipsTotalWidth) / 2;
        const shipsStartY = 70;

        // Ports row
        const portsTotalWidth = ports.length * cardWidth + (ports.length - 1) * gap;
        const portsStartX = (k.width() - portsTotalWidth) / 2;
        const portsStartY = shipsStartY + shipCardHeight + 50;

        // Title
        k.add([
            k.text("Unit Gallery", { size: 36 }),
            k.pos(k.center().x, 30),
            k.anchor("center"),
            k.color(255, 255, 255),
        ]);

        k.onDraw(() => {
            // Section label: Ships
            k.drawText({
                text: "SHIPS",
                pos: k.vec2(shipsStartX, shipsStartY - 20),
                size: 16,
                color: k.rgb(100, 200, 255),
            });

            // Draw ship cards
            ships.forEach((ship, index) => {
                const cardX = shipsStartX + index * (cardWidth + gap);
                const cardY = shipsStartY;

                // Card background
                k.drawRect({
                    pos: k.vec2(cardX, cardY),
                    width: cardWidth,
                    height: shipCardHeight,
                    color: k.rgb(30, 50, 70),
                    radius: 6,
                });

                // Ship name
                k.drawText({
                    text: ship.name,
                    pos: k.vec2(cardX + cardWidth / 2, cardY + 14),
                    size: 18,
                    anchor: "center",
                    color: k.rgb(255, 255, 255),
                });

                // Draw sprite
                const spriteSize = getSpriteSize(ship.sprite, scale);
                const spriteX = cardX + (cardWidth - spriteSize.width) / 2;
                const spriteY = cardY + 32;
                drawSprite(k, ship.sprite, spriteX, spriteY, scale);

                // Stats
                const statsY = cardY + 115;
                const statsX = cardX + 10;

                k.drawText({
                    text: `Spd:${ship.speed} Crg:${ship.cargo} Cbt:${ship.combat}`,
                    pos: k.vec2(cardX + cardWidth / 2, statsY),
                    size: 11,
                    anchor: "center",
                    color: k.rgb(150, 150, 150),
                });

                // Description
                k.drawText({
                    text: ship.description,
                    pos: k.vec2(cardX + cardWidth / 2, cardY + shipCardHeight - 14),
                    size: 10,
                    anchor: "center",
                    color: k.rgb(120, 120, 120),
                });
            });

            // Section label: Ports
            k.drawText({
                text: "PORTS",
                pos: k.vec2(portsStartX, portsStartY - 20),
                size: 16,
                color: k.rgb(255, 180, 100),
            });

            // Draw port cards
            ports.forEach((port, index) => {
                const cardX = portsStartX + index * (cardWidth + gap);
                const cardY = portsStartY;

                // Card background
                k.drawRect({
                    pos: k.vec2(cardX, cardY),
                    width: cardWidth,
                    height: portCardHeight,
                    color: k.rgb(50, 40, 30),
                    radius: 6,
                });

                // Port name
                k.drawText({
                    text: port.name,
                    pos: k.vec2(cardX + cardWidth / 2, cardY + 14),
                    size: 18,
                    anchor: "center",
                    color: k.rgb(255, 255, 255),
                });

                // Draw sprite
                const spriteSize = getSpriteSize(port.sprite, scale);
                const spriteX = cardX + (cardWidth - spriteSize.width) / 2;
                const spriteY = cardY + 32;
                drawSprite(k, port.sprite, spriteX, spriteY, scale);

                // Stats
                k.drawText({
                    text: `Capacity: ${port.capacity} ships`,
                    pos: k.vec2(cardX + cardWidth / 2, cardY + 105),
                    size: 11,
                    anchor: "center",
                    color: k.rgb(150, 150, 150),
                });

                // Description
                k.drawText({
                    text: port.description,
                    pos: k.vec2(cardX + cardWidth / 2, cardY + portCardHeight - 14),
                    size: 10,
                    anchor: "center",
                    color: k.rgb(120, 120, 120),
                });
            });
        });

        // Back button
        k.add([
            k.text("[ SPACE to return ]", { size: 14 }),
            k.pos(k.center().x, k.height() - 25),
            k.anchor("center"),
            k.color(100, 100, 100),
        ]);

        k.onKeyPress("space", () => {
            k.go("title");
        });

        k.onClick(() => {
            k.go("title");
        });
    };
}
