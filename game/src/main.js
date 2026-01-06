import kaplay from "kaplay";
import { createGameScene } from "./scenes/gameScene.js";
import { SCENARIOS, DEFAULT_SCENARIO_ID } from "./scenarios/index.js";
import { generateMap, getTileColor, getStippleColors, placeIslandTemplate } from "./mapGenerator.js";
import { findPath } from "./pathfinding.js";
import { hexKey } from "./hex.js";
import { STARTER_ISLAND_TEMPLATES } from "./islandTemplates.js";
import { hexToPixel, pixelToHex, HEX_SIZE } from "./hex.js";
import { createRenderContext } from "./rendering/renderContext.js";
import { drawTiles, drawDecorations } from "./rendering/tileRenderer.js";
import { computeIslands, drawIslandWaves } from "./rendering/waveRenderer.js";

const k = kaplay({
    background: [0, 0, 0], // Pitch black - edge of the world
});

// Selected scenario ID (persists between title screen visits)
let selectedScenarioId = null; // No mode selected by default

// Selected AI strategy for versus mode (null = random)
let selectedAIStrategy = null;

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
// Load colored cutter variants (3x5: 3 anim frames, 5 directions)
k.loadSprite("cutter-red", "sprites/assets/cutter-red.png", {
    sliceX: 3,
    sliceY: 5,
});
k.loadSprite("cutter-green", "sprites/assets/cutter-green.png", {
    sliceX: 3,
    sliceY: 5,
});
k.loadSprite("cutter-blue", "sprites/assets/cutter-blue.png", {
    sliceX: 3,
    sliceY: 5,
});
k.loadSprite("cutter-orange", "sprites/assets/cutter-orange.png", {
    sliceX: 3,
    sliceY: 5,
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

// Load tower sprites (2 frames: normal, flash)
k.loadSprite("watchtower", "sprites/assets/watchtower.png", {
    sliceX: 2,
    sliceY: 1,
});

// Load UI sprites
k.loadSprite("rally-point", "sprites/assets/rally-point.png");
k.loadSprite("barrel", "sprites/assets/barrel.png");
k.loadSprite("resource-wood", "sprites/assets/resource-wood.png");
k.loadSprite("resource-crew", "sprites/assets/resource-crew.png");

// Load sounds
k.loadSound("title-music", "sounds/grog-title.mp3");
k.loadSound("mode-skirmish", "sounds/mode-skirmish.mp3");
k.loadSound("mode-defend", "sounds/mode-defend.mp3");
k.loadSound("mode-sandbox", "sounds/mode-sandbox.mp3");
k.loadSound("ui-click", "sounds/ui/ui-click.mp3");

// Load ship selection sounds
k.loadSound("select-ship-1", "sounds/units/ships/selected-1.mp3");
k.loadSound("select-ship-2", "sounds/units/ships/selected-2.mp3");
k.loadSound("select-ship-3", "sounds/units/ships/selected-3.mp3");
k.loadSound("select-ship-4", "sounds/units/ships/selected-4.mp3");
k.loadSound("select-ship-5", "sounds/units/ships/selected-5.mp3");

// Load cannon fire sounds
k.loadSound("cannon-fire-1", "sounds/units/cannons/fire-1.mp3");
k.loadSound("cannon-fire-2", "sounds/units/cannons/fire-2.mp3");
k.loadSound("cannon-fire-3", "sounds/units/cannons/fire-3.mp3");
k.loadSound("cannon-fire-4", "sounds/units/cannons/fire-4.mp3");

// Load cannon impact sounds
k.loadSound("cannon-impact-1", "sounds/units/cannons/impact-1.mp3");
k.loadSound("cannon-impact-2", "sounds/units/cannons/impact-2.mp3");
k.loadSound("cannon-impact-3", "sounds/units/cannons/impact-3.mp3");
k.loadSound("cannon-impact-4", "sounds/units/cannons/impact-4.mp3");
k.loadSound("cannon-impact-5", "sounds/units/cannons/impact-5.mp3");

// Load ambient sounds
k.loadSound("ambient-ocean", "sounds/ambient/ocean.mp3");
k.loadSound("ambient-music", "sounds/ambient/background-music.mp3");

// Load shaders - use color.a channel to pass flash intensity
k.loadShader("whiteFlash", null, `
    vec4 frag(vec2 pos, vec2 uv, vec4 color, sampler2D tex) {
        vec4 texColor = texture2D(tex, uv);
        // Use color.a as flash intensity (passed via opacity property)
        // When opacity < 1.0, that's the flash amount (1.0 - opacity)
        float flash = 1.0 - color.a;
        vec4 result = mix(texColor, vec4(1.0, 1.0, 1.0, texColor.a), flash);
        result.a = texColor.a;  // Preserve original alpha
        return result;
    }
`);

// Register scenes
k.scene("title", () => {
    // === TITLE MUSIC ===
    let titleMusic = null;
    let musicStarted = false;

    function playTitleMusic() {
        titleMusic = k.play("title-music", { volume: 0.5 });
        titleMusic.onEnd(() => {
            // 10 second delay before repeating
            k.wait(10, () => {
                playTitleMusic();
            });
        });
    }

    // Start music on first user interaction (browsers block autoplay)
    function startMusicOnInteraction() {
        if (!musicStarted) {
            musicStarted = true;
            playTitleMusic();
        }
    }
    k.onClick(() => startMusicOnInteraction());
    k.onKeyPress(() => startMusicOnInteraction());

    // === GENERATE MAP FOR BACKGROUND ===
    // Extra tall map to cover the parallelogram shape of hex grid
    const titleMap = generateMap({
        width: 80,
        height: 75,
        seed: Date.now(),
        versusMode: false,
    });

    // Place a nice starter island near the center for the camera to start on
    const randomTemplate = STARTER_ISLAND_TEMPLATES[Math.floor(Math.random() * STARTER_ISLAND_TEMPLATES.length)];
    const islandCenterQ = Math.floor(titleMap.width / 4);  // Left-center of map
    const islandCenterR = Math.floor(titleMap.height / 2);
    placeIslandTemplate(titleMap.tiles, randomTemplate, islandCenterQ, islandCenterR, titleMap.height);
    const islandStartPos = hexToPixel(islandCenterQ, islandCenterR);

    // Mark coastal hexes as port sites so they get sandy beach color
    const placedIslandHexes = new Set(randomTemplate.hexes.map(h =>
        hexKey(islandCenterQ + h.q, islandCenterR + h.r)
    ));
    for (const key of placedIslandHexes) {
        const tile = titleMap.tiles.get(key);
        if (!tile) continue;
        const [q, r] = key.split(',').map(Number);
        const neighbors = [
            { q: q + 1, r: r },
            { q: q - 1, r: r },
            { q: q, r: r + 1 },
            { q: q, r: r - 1 },
            { q: q + 1, r: r - 1 },
            { q: q - 1, r: r + 1 },
        ];
        // If any neighbor is water, this is a coastal/port site
        for (const n of neighbors) {
            const neighborTile = titleMap.tiles.get(hexKey(n.q, n.r));
            if (neighborTile && (neighborTile.type === 'shallow' || neighborTile.type === 'deep_ocean')) {
                tile.isPortSite = true;
                break;
            }
        }
    }

    // Find coastal and inland hexes on the placed island for structures
    const islandHexes = randomTemplate.hexes.map(h => ({
        q: islandCenterQ + h.q,
        r: islandCenterR + h.r
    }));
    const islandHexSet = new Set(islandHexes.map(h => `${h.q},${h.r}`));

    // Coastal = has at least one water neighbor, Inland = all neighbors are land
    const coastalHexes = [];
    const inlandHexes = [];
    for (const hex of islandHexes) {
        const neighbors = [
            { q: hex.q + 1, r: hex.r },
            { q: hex.q - 1, r: hex.r },
            { q: hex.q, r: hex.r + 1 },
            { q: hex.q, r: hex.r - 1 },
            { q: hex.q + 1, r: hex.r - 1 },
            { q: hex.q - 1, r: hex.r + 1 },
        ];
        const allNeighborsLand = neighbors.every(n => islandHexSet.has(`${n.q},${n.r}`));
        if (allNeighborsLand) {
            inlandHexes.push(hex);
        } else {
            coastalHexes.push(hex);
        }
    }

    // Place structures: 1 port (coastal), 1 tower (inland), 2 settlements (inland)
    const titleStructures = [];
    if (coastalHexes.length > 0) {
        titleStructures.push({ type: 'port', ...coastalHexes[0] });
    }
    if (inlandHexes.length > 0) {
        titleStructures.push({ type: 'tower', ...inlandHexes[0] });
    }
    if (inlandHexes.length > 1) {
        titleStructures.push({ type: 'settlement', ...inlandHexes[1] });
    }
    if (inlandHexes.length > 2) {
        titleStructures.push({ type: 'settlement', ...inlandHexes[2] });
    }

    // Spawn settlements on other islands (computed after islands are ready)
    function spawnSettlementsOnOtherIslands() {
        for (const island of islands) {
            // Skip the starter island (check if center is near our placed island)
            const distToStarter = Math.abs(island.center.x - islandStartPos.x) + Math.abs(island.center.y - islandStartPos.y);
            if (distToStarter < 100) continue;

            // Find inland hexes on this island
            const islandInland = [];
            for (const key of island.tiles) {
                const [q, r] = key.split(',').map(Number);
                const neighbors = [
                    { q: q + 1, r: r },
                    { q: q - 1, r: r },
                    { q: q, r: r + 1 },
                    { q: q, r: r - 1 },
                    { q: q + 1, r: r - 1 },
                    { q: q - 1, r: r + 1 },
                ];
                const allNeighborsLand = neighbors.every(n => island.tiles.has(hexKey(n.q, n.r)));
                if (allNeighborsLand) {
                    islandInland.push({ q, r });
                }
            }

            // Place a settlement on a random inland hex (if any)
            if (islandInland.length > 0) {
                const spot = islandInland[Math.floor(Math.random() * islandInland.length)];
                titleStructures.push({ type: 'settlement', ...spot });
            }
        }
    }

    // Pre-calculate world positions for all tiles
    const tilePositions = new Map();
    for (const tile of titleMap.tiles.values()) {
        const pos = hexToPixel(tile.q, tile.r);
        tilePositions.set(tile, pos);
    }

    // Pre-create tile colors
    const tileColors = new Map();
    for (const tile of titleMap.tiles.values()) {
        const [r, g, b] = getTileColor(tile);
        tileColors.set(tile, k.rgb(r, g, b));
    }

    // Pre-calculate stipple data per tile
    const tileStipples = new Map();
    for (const tile of titleMap.tiles.values()) {
        const colors = getStippleColors(tile);
        const stippleColors = colors.map(([r, g, b]) => k.rgb(r, g, b));
        const seed = tile.q * 1000 + tile.r;
        const dots = [];
        const numDots = 6;

        for (let i = 0; i < numDots; i++) {
            const hash = Math.sin(seed * 9999 + i * 7777) * 10000;
            const rx = (hash - Math.floor(hash)) * 2 - 1;
            const hash2 = Math.sin(seed * 3333 + i * 5555) * 10000;
            const ry = (hash2 - Math.floor(hash2)) * 2 - 1;
            const hash3 = Math.sin(seed * 1111 + i * 2222) * 10000;
            const colorIdx = Math.floor((hash3 - Math.floor(hash3)) * 3);

            const dist = Math.sqrt(rx * rx + ry * ry);
            if (dist < 0.8) {
                dots.push({ rx, ry, colorIdx });
            }
        }
        tileStipples.set(tile, { colors: stippleColors, dots });
    }

    // Seeded random for deterministic decoration placement
    function seededRandom(seed) {
        const x = Math.sin(seed * 12.9898) * 43758.5453;
        return x - Math.floor(x);
    }

    // Generate tile decorations (grass, trees, palms) for land tiles
    const GRASS_MIN = 3, GRASS_MAX = 10;
    const TREE_MIN = 2, TREE_MAX = 5;
    const PALM_MIN = 1, PALM_MAX = 3;
    const tileDecorations = new Map();
    for (const tile of titleMap.tiles.values()) {
        if (tile.type !== 'land') continue;
        if (tile.isPortSite) continue;

        const key = `${tile.q},${tile.r}`;
        const seed = tile.q * 1000 + tile.r;
        const decorations = [];

        if (tile.climate === 'temperate') {
            const grassCount = Math.floor(seededRandom(seed) * (GRASS_MAX - GRASS_MIN + 1)) + GRASS_MIN;
            for (let i = 0; i < grassCount; i++) {
                decorations.push({
                    type: 'grass',
                    rx: seededRandom(seed + i * 10) * 1.4 - 0.7,
                    ry: seededRandom(seed + i * 10 + 1) * 1.4 - 0.7,
                });
            }
            const treeCount = Math.floor(seededRandom(seed + 100) * (TREE_MAX - TREE_MIN + 1)) + TREE_MIN;
            for (let i = 0; i < treeCount; i++) {
                decorations.push({
                    type: 'tree',
                    rx: seededRandom(seed + 100 + i * 10) * 1.2 - 0.6,
                    ry: seededRandom(seed + 101 + i * 10) * 1.2 - 0.6,
                });
            }
        } else if (tile.climate === 'tropical') {
            const palmCount = Math.floor(seededRandom(seed) * (PALM_MAX - PALM_MIN + 1)) + PALM_MIN;
            for (let i = 0; i < palmCount; i++) {
                decorations.push({
                    type: 'palm',
                    rx: seededRandom(seed + i * 10) * 1.2 - 0.6,
                    ry: seededRandom(seed + i * 10 + 1) * 1.2 - 0.6,
                });
            }
        }

        if (decorations.length > 0) {
            tileDecorations.set(key, decorations);
        }
    }

    // Pre-compute islands for wave rendering
    const islands = computeIslands(titleMap);

    // Now spawn settlements on other islands
    spawnSettlementsOnOtherIslands();

    // Calculate map bounds in world coordinates
    let mapMinX = Infinity, mapMaxX = -Infinity;
    let mapMinY = Infinity, mapMaxY = -Infinity;
    for (const pos of tilePositions.values()) {
        mapMinX = Math.min(mapMinX, pos.x);
        mapMaxX = Math.max(mapMaxX, pos.x);
        mapMinY = Math.min(mapMinY, pos.y);
        mapMaxY = Math.max(mapMaxY, pos.y);
    }

    // === CAMERA STATE ===
    const zoom = 1;
    const PAN_SPEED = 5;  // World units per second
    const FADE_SPEED = 2;  // Opacity change per second

    // Calculate safe camera bounds (viewport never shows map edges)
    const halfViewW = (k.width() / 2) / zoom;
    const halfViewH = (k.height() / 2) / zoom;
    const leftBound = mapMinX + halfViewW + HEX_SIZE * 2;
    const rightBound = mapMaxX - halfViewW - HEX_SIZE * 2;
    const mapCenterY = (mapMinY + mapMaxY) / 2;

    // Hex grid slant: as x increases, y increases by sqrt(3)/3 * x
    // We need to follow this slope to pan horizontally along hex rows
    const HEX_SLOPE = Math.sqrt(3) / 3;

    // Start camera at the placed island
    let cameraX = islandStartPos.x;
    let cameraY = islandStartPos.y;
    let fadeOpacity = 0;
    let isFadingOut = false;
    let isFadingIn = false;
    let animTime = 0;

    // Create a ship that wanders using A* pathfinding
    const SHIP_SPEED = 60;  // World units per second

    // Find a water tile near the island to start the ship
    function findRandomWaterTile() {
        const waterTiles = [];
        for (const tile of titleMap.tiles.values()) {
            if (tile.type === 'shallow' || tile.type === 'deep_ocean') {
                waterTiles.push(tile);
            }
        }
        return waterTiles[Math.floor(Math.random() * waterTiles.length)];
    }

    // Find water tile near the island
    function findWaterNearIsland() {
        for (const hex of coastalHexes) {
            const neighbors = [
                { q: hex.q + 1, r: hex.r },
                { q: hex.q - 1, r: hex.r },
                { q: hex.q, r: hex.r + 1 },
                { q: hex.q, r: hex.r - 1 },
                { q: hex.q + 1, r: hex.r - 1 },
                { q: hex.q - 1, r: hex.r + 1 },
            ];
            for (const n of neighbors) {
                const tile = titleMap.tiles.get(hexKey(n.q, n.r));
                if (tile && (tile.type === 'shallow' || tile.type === 'deep_ocean')) {
                    return tile;
                }
            }
        }
        return findRandomWaterTile();
    }

    const startWater = findWaterNearIsland();
    const startPos = hexToPixel(startWater.q, startWater.r);
    const titleShip = {
        q: startWater.q,
        r: startWater.r,
        x: startPos.x,
        y: startPos.y,
        targetX: startPos.x,
        targetY: startPos.y,
        heading: 0,
        path: [],
        pathIndex: 0,
        trail: [],
        trailTimer: 0,
        animFrame: 0,
        animTimer: 0,
    };

    // Direction mapping for cutter sprite (5 rows with mirroring for 8 directions)
    function headingToSpriteDir(heading) {
        let deg = ((heading * 180 / Math.PI) % 360 + 360) % 360;
        if (deg >= 247.5 && deg < 292.5) return { row: 3, flipX: false };  // N
        if (deg >= 292.5 && deg < 337.5) return { row: 1, flipX: false };  // NE
        if (deg >= 337.5 || deg < 22.5) return { row: 4, flipX: false };   // E
        if (deg >= 22.5 && deg < 67.5) return { row: 2, flipX: false };    // SE
        if (deg >= 67.5 && deg < 112.5) return { row: 0, flipX: false };   // S
        if (deg >= 112.5 && deg < 157.5) return { row: 2, flipX: true };   // SW
        if (deg >= 157.5 && deg < 202.5) return { row: 4, flipX: true };   // W
        return { row: 1, flipX: true };                                     // NW
    }

    // Create a pirate ship that wanders the ocean
    const pirateStart = findRandomWaterTile();
    const pirateStartPos = hexToPixel(pirateStart.q, pirateStart.r);
    const pirateShip = {
        q: pirateStart.q,
        r: pirateStart.r,
        x: pirateStartPos.x,
        y: pirateStartPos.y,
        heading: 0,
        path: [],
        pathIndex: 0,
    };

    // Find water tiles adjacent to the island (for circling)
    const islandAdjacentWater = [];
    for (const hex of coastalHexes) {
        const neighbors = [
            { q: hex.q + 1, r: hex.r },
            { q: hex.q - 1, r: hex.r },
            { q: hex.q, r: hex.r + 1 },
            { q: hex.q, r: hex.r - 1 },
            { q: hex.q + 1, r: hex.r - 1 },
            { q: hex.q - 1, r: hex.r + 1 },
        ];
        for (const n of neighbors) {
            const tile = titleMap.tiles.get(hexKey(n.q, n.r));
            if (tile && (tile.type === 'shallow' || tile.type === 'deep_ocean')) {
                // Check if not already added
                if (!islandAdjacentWater.some(w => w.q === n.q && w.r === n.r)) {
                    islandAdjacentWater.push({ q: n.q, r: n.r });
                }
            }
        }
    }

    // Pick a destination near the island for circling
    function pickNewShipDestination() {
        // Pick a random water tile adjacent to the island
        const dest = islandAdjacentWater[Math.floor(Math.random() * islandAdjacentWater.length)];
        const path = findPath(titleMap, titleShip.q, titleShip.r, dest.q, dest.r);
        if (path && path.length > 0) {
            titleShip.path = path;
            titleShip.pathIndex = 0;
        }
    }
    pickNewShipDestination();

    // Pick a random destination for the pirate ship
    function pickNewPirateDestination() {
        const dest = findRandomWaterTile();
        const path = findPath(titleMap, pirateShip.q, pirateShip.r, dest.q, dest.r);
        if (path && path.length > 0) {
            pirateShip.path = path;
            pirateShip.pathIndex = 0;
        }
    }
    pickNewPirateDestination();

    // Create a flock of birds flying from bottom-left to top-right
    const BIRD_COUNT = 7;
    const BIRD_SPEED = 40;  // World units per second
    const birds = [];
    for (let i = 0; i < BIRD_COUNT; i++) {
        birds.push({
            // Start off-screen bottom-left, staggered
            offsetX: -200 - Math.random() * 300,
            offsetY: 200 + Math.random() * 200,
            // Slight variation in speed
            speed: BIRD_SPEED * (0.8 + Math.random() * 0.4),
            // Animation
            frame: 0,
            flapTimer: Math.random(),  // Stagger flap timing
            scale: 0.8 + Math.random() * 0.4,
        });
    }

    // Cloud state - fluffy clouds floating across the title screen
    const WIND_DIRECTION = -Math.PI * 0.25; // Wind blowing bottom-left to top-right
    const titleMapPixelWidth = titleMap.width * HEX_SIZE * 1.5;
    const titleMapPixelHeight = titleMap.height * HEX_SIZE * 1.732;

    function generateCloudShape() {
        const puffs = [];
        const numPuffs = 3 + Math.floor(Math.random() * 3);
        const puffCenters = [];

        for (let i = 0; i < numPuffs; i++) {
            puffCenters.push({
                q: (i - numPuffs / 2) * 1.2 + (Math.random() - 0.5) * 0.8,
                r: (Math.random() - 0.5) * 1.5
            });
        }

        // Shadow layer
        for (const puff of puffCenters) {
            const puffRadius = 1.2 + Math.random() * 0.6;
            for (let dq = -2; dq <= 2; dq++) {
                for (let dr = -2; dr <= 2; dr++) {
                    const dist = Math.sqrt(dq * dq + dr * dr);
                    if (dist <= puffRadius) {
                        const edgeFade = 1 - (dist / puffRadius);
                        puffs.push({
                            dq: puff.q + dq + 0.3,
                            dr: puff.r + dr + 0.3,
                            opacity: edgeFade * 0.3,
                            size: 0.5 + Math.random() * 0.8,
                            color: [180, 180, 190],
                            phase: Math.random() * Math.PI * 2,
                            speed: 0.3 + Math.random() * 0.4,
                        });
                    }
                }
            }
        }

        // Base layer
        for (const puff of puffCenters) {
            const puffRadius = 1.4 + Math.random() * 0.5;
            for (let dq = -2; dq <= 2; dq++) {
                for (let dr = -2; dr <= 2; dr++) {
                    const dist = Math.sqrt(dq * dq + dr * dr);
                    if (dist <= puffRadius) {
                        const edgeFade = 1 - (dist / puffRadius) * 0.6;
                        puffs.push({
                            dq: puff.q + dq,
                            dr: puff.r + dr,
                            opacity: edgeFade * 0.7,
                            size: 0.6 + Math.random() * 0.9,
                            color: [240, 240, 245],
                            phase: Math.random() * Math.PI * 2,
                            speed: 0.3 + Math.random() * 0.4,
                        });
                    }
                }
            }
        }

        // Highlight layer
        for (const puff of puffCenters) {
            const puffRadius = 1.0 + Math.random() * 0.4;
            for (let dq = -1; dq <= 1; dq++) {
                for (let dr = -1; dr <= 1; dr++) {
                    const dist = Math.sqrt(dq * dq + dr * dr);
                    if (dist <= puffRadius) {
                        const edgeFade = 1 - (dist / puffRadius);
                        puffs.push({
                            dq: puff.q + dq - 0.2,
                            dr: puff.r + dr - 0.2,
                            opacity: edgeFade * 0.5,
                            size: 0.4 + Math.random() * 0.7,
                            color: [255, 255, 255],
                            phase: Math.random() * Math.PI * 2,
                            speed: 0.3 + Math.random() * 0.4,
                        });
                    }
                }
            }
        }

        return puffs;
    }

    const cloudStates = [];
    // Spawn clouds in bottom-left formation relative to camera start
    for (let i = 0; i < 10; i++) {
        cloudStates.push({
            // Start bottom-left of screen (camera starts at islandStartPos)
            x: islandStartPos.x - 500 + Math.random() * 300 - i * 60,
            y: islandStartPos.y + 150 + Math.random() * 250 + i * 30,
            puffs: generateCloudShape(),
            baseOpacity: 0.5 + Math.random() * 0.4,
            driftSpeed: 4 + Math.random() * 4,
            scale: 0.4 + Math.random() * 0.3,
        });
    }

    // === UPDATE LOOP ===
    k.onUpdate(() => {
        const dt = k.dt();
        animTime += dt;

        // Update ship - follow A* path with smooth interpolation
        if (titleShip.path.length > 0 && titleShip.pathIndex < titleShip.path.length) {
            const waypoint = titleShip.path[titleShip.pathIndex];
            const waypointPos = hexToPixel(waypoint.q, waypoint.r);

            // Calculate direction to waypoint
            const dx = waypointPos.x - titleShip.x;
            const dy = waypointPos.y - titleShip.y;
            const dist = Math.sqrt(dx * dx + dy * dy);

            // Update heading to face waypoint
            if (dist > 0.1) {
                titleShip.heading = Math.atan2(dy, dx);
            }

            // Move toward waypoint
            const moveAmount = SHIP_SPEED * dt;
            if (dist <= moveAmount) {
                // Reached waypoint
                titleShip.x = waypointPos.x;
                titleShip.y = waypointPos.y;
                titleShip.q = waypoint.q;
                titleShip.r = waypoint.r;
                titleShip.pathIndex++;

                // Check if path complete
                if (titleShip.pathIndex >= titleShip.path.length) {
                    pickNewShipDestination();
                }
            } else {
                // Move toward waypoint
                titleShip.x += (dx / dist) * moveAmount;
                titleShip.y += (dy / dist) * moveAmount;
            }
        } else {
            // No path, pick new destination
            pickNewShipDestination();
        }

        // Update cutter trail
        const TRAIL_SPAWN_INTERVAL = 0.05;
        const TRAIL_FADE_DURATION = 0.5;
        const TRAIL_MAX_LENGTH = 10;
        titleShip.trailTimer += dt;
        if (titleShip.trailTimer >= TRAIL_SPAWN_INTERVAL) {
            titleShip.trailTimer = 0;
            titleShip.trail.unshift({ x: titleShip.x, y: titleShip.y, age: 0 });
            if (titleShip.trail.length > TRAIL_MAX_LENGTH) {
                titleShip.trail.pop();
            }
        }
        // Age trail segments and remove expired ones
        for (const segment of titleShip.trail) {
            segment.age += dt;
        }
        titleShip.trail = titleShip.trail.filter(s => s.age < TRAIL_FADE_DURATION);

        // Update cutter animation
        titleShip.animTimer += dt;
        if (titleShip.animTimer >= 0.15) {
            titleShip.animTimer = 0;
            titleShip.animFrame = (titleShip.animFrame + 1) % 3;
        }

        // Update pirate ship - follow A* path
        if (pirateShip.path.length > 0 && pirateShip.pathIndex < pirateShip.path.length) {
            const waypoint = pirateShip.path[pirateShip.pathIndex];
            const waypointPos = hexToPixel(waypoint.q, waypoint.r);

            const dx = waypointPos.x - pirateShip.x;
            const dy = waypointPos.y - pirateShip.y;
            const dist = Math.sqrt(dx * dx + dy * dy);

            if (dist > 0.1) {
                pirateShip.heading = Math.atan2(dy, dx);
            }

            const moveAmount = SHIP_SPEED * 0.8 * dt;  // Pirate slightly slower
            if (dist <= moveAmount) {
                pirateShip.x = waypointPos.x;
                pirateShip.y = waypointPos.y;
                pirateShip.q = waypoint.q;
                pirateShip.r = waypoint.r;
                pirateShip.pathIndex++;

                if (pirateShip.pathIndex >= pirateShip.path.length) {
                    pickNewPirateDestination();
                }
            } else {
                pirateShip.x += (dx / dist) * moveAmount;
                pirateShip.y += (dy / dist) * moveAmount;
            }
        } else {
            pickNewPirateDestination();
        }

        // Update birds - fly from bottom-left to top-right
        for (const bird of birds) {
            bird.offsetX += bird.speed * dt;
            bird.offsetY -= bird.speed * 0.6 * dt;  // Fly upward at angle
            bird.flapTimer += dt;
            if (bird.flapTimer > 0.25) {  // Flap every 0.25s
                bird.flapTimer = 0;
                bird.frame = bird.frame === 0 ? 1 : 0;
            }
            // Reset bird when it goes off-screen top-right
            if (bird.offsetX > k.width() + 100 || bird.offsetY < -100) {
                bird.offsetX = -100 - Math.random() * 200;
                bird.offsetY = k.height() + Math.random() * 100;
            }
        }

        // Update clouds - drift with wind direction (bottom-left to top-right)
        for (const cloud of cloudStates) {
            cloud.x += Math.cos(WIND_DIRECTION) * cloud.driftSpeed * dt;
            cloud.y += Math.sin(WIND_DIRECTION) * cloud.driftSpeed * dt;

            // When cloud goes off top-right, respawn in bottom-left
            const screenX = (cloud.x - cameraX) * zoom + k.width() / 2;
            const screenY = (cloud.y - cameraY) * zoom + k.height() / 2;
            if (screenX > k.width() + 300 || screenY < -300) {
                cloud.x = cameraX - 500 + Math.random() * 200;
                cloud.y = cameraY + 400 + Math.random() * 200;
            }
        }

        if (isFadingOut) {
            fadeOpacity += FADE_SPEED * dt;
            if (fadeOpacity >= 1) {
                fadeOpacity = 1;
                isFadingOut = false;
                isFadingIn = true;
                cameraX = islandStartPos.x;  // Reset to island
                cameraY = islandStartPos.y;
            }
        } else if (isFadingIn) {
            fadeOpacity -= FADE_SPEED * dt;
            if (fadeOpacity <= 0) {
                fadeOpacity = 0;
                isFadingIn = false;
            }
        } else {
            // Pan right, following hex row slope
            cameraX += PAN_SPEED * dt;
            cameraY += PAN_SPEED * HEX_SLOPE * dt;
            if (cameraX >= rightBound) {
                isFadingOut = true;
            }
        }
    });

    // === MAP RENDERING (before UI elements) ===
    k.onDraw(() => {
        const ctx = createRenderContext(k, zoom, cameraX, cameraY);
        drawTiles(ctx, titleMap, tilePositions, tileColors, tileStipples, animTime);
        drawIslandWaves(ctx, islands, animTime);

        // Draw decorations (trees, grass, palms)
        // Create fake gameState for drawDecorations to check structure positions
        const fakeGameState = {
            settlements: titleStructures.filter(s => s.type === 'settlement'),
            towers: titleStructures.filter(s => s.type === 'tower'),
        };
        drawDecorations(ctx, titleMap, tilePositions, tileDecorations, fakeGameState);

        // Draw structures on the island
        const halfWidth = k.width() / 2;
        const halfHeight = k.height() / 2;
        for (const structure of titleStructures) {
            const pos = hexToPixel(structure.q, structure.r);
            const screenX = (pos.x - cameraX) * zoom + halfWidth;
            const screenY = (pos.y - cameraY) * zoom + halfHeight;

            let spriteName;
            if (structure.type === 'port') spriteName = 'home-port';
            else if (structure.type === 'tower') spriteName = 'watchtower';
            else spriteName = 'settlement';

            k.drawSprite({
                sprite: spriteName,
                pos: k.vec2(screenX, screenY),
                anchor: 'center',
                scale: zoom,
            });
        }

        // Draw cutter water trail
        const TRAIL_BASE_OPACITY = 0.4;
        const TRAIL_FADE_DURATION = 0.5;
        for (let i = 1; i < titleShip.trail.length; i++) {
            const segment = titleShip.trail[i];
            const progress = segment.age / TRAIL_FADE_DURATION;
            const opacity = TRAIL_BASE_OPACITY * (1 - progress);
            const size = (8 - i * 0.8) * zoom;

            const trailScreenX = (segment.x - cameraX) * zoom + halfWidth;
            const trailScreenY = (segment.y - cameraY) * zoom + halfHeight;

            k.drawRect({
                pos: k.vec2(trailScreenX, trailScreenY),
                width: size * 2,
                height: size * 2,
                anchor: 'center',
                color: k.rgb(200, 220, 255),
                opacity: opacity,
            });
        }

        // Draw the sailing ship (cutter) using directional sprite
        const shipScreenX = (titleShip.x - cameraX) * zoom + halfWidth;
        const shipScreenY = (titleShip.y - cameraY) * zoom + halfHeight;
        const shipDir = headingToSpriteDir(titleShip.heading);
        const shipFrame = shipDir.row * 3 + titleShip.animFrame;
        k.drawSprite({
            sprite: 'cutter-red',
            frame: shipFrame,
            pos: k.vec2(shipScreenX, shipScreenY),
            anchor: 'center',
            scale: zoom * 0.75,
            flipX: shipDir.flipX,
        });

        // Draw the pirate ship
        const pirateScreenX = (pirateShip.x - cameraX) * zoom + halfWidth;
        const pirateScreenY = (pirateShip.y - cameraY) * zoom + halfHeight;
        const pirateRotation = pirateShip.heading * (180 / Math.PI) + 90;
        k.drawSprite({
            sprite: 'pirate',
            pos: k.vec2(pirateScreenX, pirateScreenY),
            anchor: 'center',
            scale: zoom * 0.75,
            angle: pirateRotation,
        });

        // Draw birds flying across the screen
        for (const bird of birds) {
            // Bird position is in screen space (independent of camera)
            // Travel direction: up-right (dx=1, dy=-0.6), plus 60° sprite offset
            const travelAngle = Math.atan2(-0.6, 1);  // Direction of flight
            const rotationRad = travelAngle + Math.PI / 3;  // 60° offset for sprite alignment
            const rotationDeg = rotationRad * (180 / Math.PI);
            k.drawSprite({
                sprite: 'bird',
                pos: k.vec2(bird.offsetX, bird.offsetY),
                frame: bird.frame,
                anchor: 'center',
                scale: bird.scale,
                angle: rotationDeg,
            });
        }

        // Draw clouds floating across the screen
        for (const cloud of cloudStates) {
            for (const puff of cloud.puffs) {
                // Animate puff position, size, and opacity over time
                const t = animTime * puff.speed + puff.phase;
                const wobbleX = Math.sin(t) * 0.15;
                const wobbleY = Math.cos(t * 0.7) * 0.1;
                const sizeWobble = 1 + Math.sin(t * 0.5) * 0.15;
                const opacityWobble = 1 + Math.sin(t * 0.3 + 1) * 0.1;

                const puffX = cloud.x + (puff.dq + wobbleX) * HEX_SIZE * 1.5 * cloud.scale;
                const puffY = cloud.y + (puff.dr + wobbleY + puff.dq * 0.5) * HEX_SIZE * 1.732 * cloud.scale;

                const screenX = (puffX - cameraX) * zoom + halfWidth;
                const screenY = (puffY - cameraY) * zoom + halfHeight;

                // Skip if off screen
                if (screenX < -100 || screenX > k.width() + 100 ||
                    screenY < -100 || screenY > k.height() + 100) {
                    continue;
                }

                const opacity = cloud.baseOpacity * puff.opacity * opacityWobble;
                const radius = HEX_SIZE * cloud.scale * zoom * 0.9 * (puff.size || 1.0) * sizeWobble;
                const [r, g, b] = puff.color || [255, 255, 255];

                // Draw hexagonal puff
                const hexPts = [];
                for (let i = 0; i < 6; i++) {
                    const angle = (Math.PI / 3) * i - Math.PI / 2;
                    hexPts.push(k.vec2(
                        Math.cos(angle) * radius,
                        Math.sin(angle) * radius
                    ));
                }
                k.drawPolygon({
                    pts: hexPts,
                    pos: k.vec2(screenX, screenY),
                    color: k.rgb(r, g, b),
                    opacity: Math.min(opacity, 0.9),
                });
            }
        }

        // Darken overlay for text readability
        k.drawRect({
            pos: k.vec2(0, 0),
            width: k.width(),
            height: k.height(),
            color: k.rgb(0, 0, 0),
            opacity: 0.3,
        });

        // Fade overlay for pan loop transition
        if (fadeOpacity > 0) {
            k.drawRect({
                pos: k.vec2(0, 0),
                width: k.width(),
                height: k.height(),
                color: k.rgb(0, 0, 0),
                opacity: fadeOpacity,
            });
        }
    });

    // Vertical offset to center menu content (content spans ~425px total)
    const menuOffsetY = -60;

    // Title text
    k.add([
        k.text("Grog", { size: 64 }),
        k.pos(k.center().x, k.center().y - 100 + menuOffsetY),
        k.anchor("center"),
        k.color(255, 255, 255),
    ]);

    // Subtitle
    k.add([
        k.text("A fun lil' retro RTS game", { size: 20 }),
        k.pos(k.center().x, k.center().y - 50 + menuOffsetY),
        k.anchor("center"),
        k.color(200, 220, 255),
    ]);

    // Scenario cards layout
    const cardWidth = 220;
    const cardHeight = 100;
    const cardSpacing = 30;
    const totalWidth = SCENARIOS.length * cardWidth + (SCENARIOS.length - 1) * cardSpacing;
    const startX = k.center().x - totalWidth / 2 + cardWidth / 2;
    const cardY = k.center().y + 143 + menuOffsetY;

    // Mode selection label
    k.add([
        k.text("Choose your mode:", { size: 16 }),
        k.pos(startX - cardWidth / 2, cardY - cardHeight / 2 - 15),
        k.anchor("left"),
        k.color(255, 255, 255),
    ]);

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
            k.color(0, 0, 0),
            k.outline(isSelected ? 3 : 1, isSelected ? k.rgb(255, 200, 0) : k.rgb(80, 100, 120)),
            k.area(),
            `card-${scenario.id}`,
        ]);
        cardBackgrounds.push({ entity: cardBg, scenarioId: scenario.id });

        // Scenario name
        k.add([
            k.text(scenario.name.toUpperCase(), { size: 18 }),
            k.pos(cardX, cardY - 15),
            k.anchor("center"),
            k.color(255, 255, 255),
        ]);

        // Scenario description
        k.add([
            k.text(scenario.description, { size: 12 }),
            k.pos(cardX, cardY + 15),
            k.anchor("center"),
            k.color(180, 200, 220),
        ]);

        // Click handler
        k.onClick(`card-${scenario.id}`, () => {
            selectedScenarioId = scenario.id;
            updateCardSelection();
            playModeSound(scenario.id);
        });
    });

    // Function to update card selection visuals
    function updateCardSelection() {
        cardBackgrounds.forEach(({ entity, scenarioId }) => {
            const isSelected = scenarioId === selectedScenarioId;
            entity.color = k.rgb(0, 0, 0);
            entity.outline.color = isSelected ? k.rgb(255, 200, 0) : k.rgb(80, 100, 120);
            entity.outline.width = isSelected ? 3 : 1;
        });
        updateStartButton();
    }

    // Start button
    const playY = cardY + cardHeight / 2 + 70;
    const startBtnWidth = 120;
    const startBtnHeight = 60;
    const startBtnBg = k.add([
        k.rect(startBtnWidth, startBtnHeight, { radius: 6 }),
        k.pos(k.center().x, playY),
        k.anchor("center"),
        k.color(0, 0, 0),
        k.outline(1, k.rgb(50, 50, 60)),
        k.area(),
        "playBtn",
    ]);
    const startBtnText = k.add([
        k.text("Start", { size: 22 }),
        k.pos(k.center().x, playY),
        k.anchor("center"),
        k.color(80, 80, 80), // Dimmed initially
    ]);

    // Update start button visual based on selection
    function updateStartButton() {
        if (selectedScenarioId === null) {
            startBtnBg.outline.color = k.rgb(50, 50, 60);
            startBtnText.color = k.rgb(80, 80, 80);
        } else {
            startBtnBg.outline.color = k.rgb(80, 100, 120);
            startBtnText.color = k.rgb(255, 255, 255);
        }
    }

    // Copyright
    const copyrightY = k.height() - 20;
    k.add([
        k.text("v0.05 | (c) 2026", { size: 14 }),
        k.pos(k.center().x - 69, copyrightY),
        k.anchor("center"),
        k.color(255, 255, 255),
    ]);
    const authorLink = k.add([
        k.text("Tyler Wanlass", { size: 14 }),
        k.pos(k.center().x + 67, copyrightY),
        k.anchor("center"),
        k.color(255, 255, 255),
        k.area(),
        "copyrightLink",
    ]);
    // Underline for author name
    k.add([
        k.rect(105, 1),
        k.pos(k.center().x + 67, copyrightY + 8),
        k.anchor("center"),
        k.color(255, 255, 255),
    ]);

    k.onClick("copyrightLink", () => {
        window.open("https://tyler.cv", "_blank");
    });

    // Helper to stop music and start game
    function startGame() {
        // Don't start if no mode selected
        if (selectedScenarioId === null) return;

        if (titleMusic) {
            titleMusic.stop();
        }
        k.go("game");
    }

    // Button interactions
    k.onClick("playBtn", () => {
        selectedAIStrategy = null;  // Reset to random when using Play button
        startGame();
    });

    // Keyboard shortcuts
    k.onKeyPress("enter", () => startGame());
    k.onKeyPress("space", () => startGame());
    // Helper to play mode sound
    let currentModeSound = null;
    function playModeSound(scenarioId) {
        // Stop previous mode sound if playing
        if (currentModeSound) {
            currentModeSound.stop();
        }
        const soundMap = { versus: 'mode-skirmish', defend: 'mode-defend', sandbox: 'mode-sandbox' };
        const soundName = soundMap[scenarioId];
        if (soundName) {
            currentModeSound = k.play(soundName, { volume: 0.6 });
        }
    }

    k.onKeyPress("left", () => {
        const currentIndex = SCENARIOS.findIndex(s => s.id === selectedScenarioId);
        if (currentIndex > 0) {
            selectedScenarioId = SCENARIOS[currentIndex - 1].id;
            updateCardSelection();
            playModeSound(selectedScenarioId);
        } else if (selectedScenarioId === null) {
            // If nothing selected, select last one
            selectedScenarioId = SCENARIOS[SCENARIOS.length - 1].id;
            updateCardSelection();
            playModeSound(selectedScenarioId);
        }
    });
    k.onKeyPress("right", () => {
        const currentIndex = SCENARIOS.findIndex(s => s.id === selectedScenarioId);
        if (currentIndex < SCENARIOS.length - 1 && currentIndex >= 0) {
            selectedScenarioId = SCENARIOS[currentIndex + 1].id;
            updateCardSelection();
            playModeSound(selectedScenarioId);
        } else if (selectedScenarioId === null) {
            // If nothing selected, select first one
            selectedScenarioId = SCENARIOS[0].id;
            updateCardSelection();
            playModeSound(selectedScenarioId);
        }
    });
});

// Pass selected scenario and AI strategy to game scene
k.scene("game", createGameScene(k, () => selectedScenarioId, () => selectedAIStrategy));

// Start with title screen
k.go("title");