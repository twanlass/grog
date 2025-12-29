import kaplay from "kaplay";
import { createGameScene } from "./scenes/gameScene.js";
import { createGalleryScene } from "./scenes/galleryScene.js";
import { SCENARIOS, DEFAULT_SCENARIO_ID } from "./scenarios/index.js";

const k = kaplay({
    background: [0, 0, 0], // Pitch black - edge of the world
});

// Selected scenario ID (persists between title screen visits)
let selectedScenarioId = DEFAULT_SCENARIO_ID;

// Custom cursor (CSS-based for smooth performance)
k.setCursor("url('sprites/assets/cursor.png'), auto");

// Load animated sprites
k.loadSprite("bird", "sprites/assets/bird.png", {
    sliceX: 2,
    sliceY: 1,
    anims: {
        flap: { from: 0, to: 1, loop: true, speed: 4 },
    },
});

// Load ship sprites (2 frames: normal, flash)
k.loadSprite("cutter", "sprites/assets/cutter.png", {
    sliceX: 2,
    sliceY: 1,
});
k.loadSprite("schooner", "sprites/assets/schooner.png", {
    sliceX: 2,
    sliceY: 1,
});
k.loadSprite("pirate", "sprites/assets/pirate.png", {
    sliceX: 2,
    sliceY: 1,
});

// Load port sprites (2 frames: normal, flash)
k.loadSprite("home-port", "sprites/assets/home-port.png", {
    sliceX: 2,
    sliceY: 1,
});

// Load settlement sprites (2 frames: normal, flash)
k.loadSprite("settlement", "sprites/assets/settlement.png", {
    sliceX: 2,
    sliceY: 1,
});

// Load UI sprites
k.loadSprite("rally-point", "sprites/assets/rally-point.png");
k.loadSprite("barrel", "sprites/assets/barrel.png");
k.loadSprite("resource-wood", "sprites/assets/resource-wood.png");
k.loadSprite("resource-crew", "sprites/assets/resource-crew.png");

// Register scenes
k.scene("title", () => {
    // Title text
    k.add([
        k.text("Grog", { size: 64 }),
        k.pos(k.center().x, k.center().y - 100),
        k.anchor("center"),
        k.color(255, 255, 255),
    ]);

    // Subtitle
    k.add([
        k.text("Trade, steal, and plunder your way to empire", { size: 20 }),
        k.pos(k.center().x, k.center().y - 50),
        k.anchor("center"),
        k.color(200, 220, 255),
    ]);

    // Scenario cards layout
    const cardWidth = 150;
    const cardHeight = 100;
    const cardSpacing = 30;
    const totalWidth = SCENARIOS.length * cardWidth + (SCENARIOS.length - 1) * cardSpacing;
    const startX = k.center().x - totalWidth / 2 + cardWidth / 2;
    const cardY = k.center().y + 30;

    // Track card entities for selection highlighting
    const cardBackgrounds = [];

    // Create scenario cards
    SCENARIOS.forEach((scenario, index) => {
        const cardX = startX + index * (cardWidth + cardSpacing);
        const isSelected = scenario.id === selectedScenarioId;

        // Card background
        const cardBg = k.add([
            k.rect(cardWidth, cardHeight, { radius: 8 }),
            k.pos(cardX, cardY),
            k.anchor("center"),
            k.color(isSelected ? 60 : 30, isSelected ? 80 : 40, isSelected ? 100 : 50),
            k.outline(isSelected ? 3 : 1, isSelected ? k.rgb(150, 200, 255) : k.rgb(80, 100, 120)),
            k.area(),
            `card-${scenario.id}`,
        ]);
        cardBackgrounds.push({ entity: cardBg, scenarioId: scenario.id });

        // Scenario name
        k.add([
            k.text(scenario.name.toUpperCase(), { size: 18 }),
            k.pos(cardX, cardY - 25),
            k.anchor("center"),
            k.color(255, 255, 255),
        ]);

        // Scenario description
        k.add([
            k.text(scenario.description, { size: 12 }),
            k.pos(cardX, cardY + 5),
            k.anchor("center"),
            k.color(180, 200, 220),
        ]);

        // Click handler
        k.onClick(`card-${scenario.id}`, () => {
            selectedScenarioId = scenario.id;
            updateCardSelection();
        });
    });

    // Function to update card selection visuals
    function updateCardSelection() {
        cardBackgrounds.forEach(({ entity, scenarioId }) => {
            const isSelected = scenarioId === selectedScenarioId;
            entity.color = isSelected ? k.rgb(60, 80, 100) : k.rgb(30, 40, 50);
            entity.outline.color = isSelected ? k.rgb(150, 200, 255) : k.rgb(80, 100, 120);
            entity.outline.width = isSelected ? 3 : 1;
        });
    }

    // Play button
    const playY = cardY + cardHeight / 2 + 50;
    k.add([
        k.text("[ Play ]", { size: 22 }),
        k.pos(k.center().x, playY),
        k.anchor("center"),
        k.color(150, 200, 255),
        k.area(),
        "playBtn",
    ]);

    // Unit Gallery button
    k.add([
        k.text("[ Unit Gallery ]", { size: 18 }),
        k.pos(k.center().x, playY + 40),
        k.anchor("center"),
        k.color(120, 150, 180),
        k.area(),
        "galleryBtn",
    ]);

    // Copyright
    k.add([
        k.text("(c) 2026 Tyler Wanlass / https://tyler.cv", { size: 12 }),
        k.pos(k.center().x, k.height() - 20),
        k.anchor("center"),
        k.color(80, 90, 100),
    ]);

    // Button interactions
    k.onClick("playBtn", () => {
        k.go("game");
    });

    k.onClick("galleryBtn", () => {
        k.go("gallery");
    });

    // Keyboard shortcuts
    k.onKeyPress("enter", () => k.go("game"));
    k.onKeyPress("space", () => k.go("game"));
    k.onKeyPress("left", () => {
        const currentIndex = SCENARIOS.findIndex(s => s.id === selectedScenarioId);
        if (currentIndex > 0) {
            selectedScenarioId = SCENARIOS[currentIndex - 1].id;
            updateCardSelection();
        }
    });
    k.onKeyPress("right", () => {
        const currentIndex = SCENARIOS.findIndex(s => s.id === selectedScenarioId);
        if (currentIndex < SCENARIOS.length - 1) {
            selectedScenarioId = SCENARIOS[currentIndex + 1].id;
            updateCardSelection();
        }
    });
    k.onKeyPress("g", () => k.go("gallery"));
});

// Pass selected scenario to game scene
k.scene("game", createGameScene(k, () => selectedScenarioId));
k.scene("gallery", createGalleryScene(k));

// Start with title screen
k.go("title");