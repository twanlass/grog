import kaplay from "kaplay";
import { createGameScene } from "./scenes/gameScene.js";
import { createGalleryScene } from "./scenes/galleryScene.js";

const k = kaplay({
    background: [0, 0, 0], // Pitch black - edge of the world
});

// Custom cursor (CSS-based for smooth performance)
k.setCursor("url('src/sprites/assets/cursor.png'), auto");

// Load animated sprites
k.loadSprite("bird", "src/sprites/assets/bird.png", {
    sliceX: 2,
    sliceY: 1,
    anims: {
        flap: { from: 0, to: 1, loop: true, speed: 4 },
    },
});

// Load ship sprites (2 frames: normal, flash)
k.loadSprite("cutter", "src/sprites/assets/cutter.png", {
    sliceX: 2,
    sliceY: 1,
});

// Register scenes
k.scene("title", () => {
    // Title text
    k.add([
        k.text("Grog", { size: 64 }),
        k.pos(k.center().x, k.center().y - 40),
        k.anchor("center"),
        k.color(255, 255, 255),
    ]);

    // Subtitle
    k.add([
        k.text("Trade, steal, and plunder your way to empire", { size: 24 }),
        k.pos(k.center().x, k.center().y + 20),
        k.anchor("center"),
        k.color(200, 220, 255),
    ]);

    // Menu options
    const menuY = k.center().y + 100;

    // Play button
    k.add([
        k.text("[ Play ]", { size: 22 }),
        k.pos(k.center().x, menuY),
        k.anchor("center"),
        k.color(150, 200, 255),
        k.area(),
        "playBtn",
    ]);

    // Gallery button
    k.add([
        k.text("[ Gallery ]", { size: 22 }),
        k.pos(k.center().x, menuY + 40),
        k.anchor("center"),
        k.color(150, 200, 255),
        k.area(),
        "galleryBtn",
    ]);

    // Button interactions
    k.onClick("playBtn", () => {
        k.go("game");
    });

    k.onClick("galleryBtn", () => {
        k.go("gallery");
    });

    // Keyboard shortcuts
    k.onKeyPress("1", () => k.go("game"));
    k.onKeyPress("2", () => k.go("gallery"));
});

k.scene("game", createGameScene(k));
k.scene("gallery", createGalleryScene(k));

// Start with title screen
k.go("title");