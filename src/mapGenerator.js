// Procedural map generation for Trade Winds
import { hexKey, hexNeighbors } from "./hex.js";

// Tile types
export const TILE_TYPES = {
    DEEP_OCEAN: "deep_ocean",
    SHALLOW: "shallow",
    LAND: "land",
};

// Climate zones based on vertical position
export const CLIMATE_ZONES = {
    ARCTIC: "arctic",
    TEMPERATE: "temperate",
    TROPICAL: "tropical",
};

// Climate zone goods
export const ZONE_GOODS = {
    [CLIMATE_ZONES.ARCTIC]: ["Pelts", "Whale Oil", "Timber"],
    [CLIMATE_ZONES.TEMPERATE]: ["Grain", "Textiles", "Wine"],
    [CLIMATE_ZONES.TROPICAL]: ["Fruit", "Sugar", "Spices"],
};

// Simple seeded random number generator
function seededRandom(seed) {
    let state = seed;
    return function () {
        state = (state * 1103515245 + 12345) & 0x7fffffff;
        return state / 0x7fffffff;
    };
}

// Simple 2D noise function (value noise)
function createNoise(seed) {
    const random = seededRandom(seed);
    const permutation = [];
    for (let i = 0; i < 256; i++) permutation[i] = i;

    // Shuffle
    for (let i = 255; i > 0; i--) {
        const j = Math.floor(random() * (i + 1));
        [permutation[i], permutation[j]] = [permutation[j], permutation[i]];
    }

    const perm = [...permutation, ...permutation];

    function fade(t) {
        return t * t * t * (t * (t * 6 - 15) + 10);
    }

    function lerp(a, b, t) {
        return a + t * (b - a);
    }

    function grad(hash, x, y) {
        const h = hash & 3;
        const u = h < 2 ? x : y;
        const v = h < 2 ? y : x;
        return ((h & 1) ? -u : u) + ((h & 2) ? -v : v);
    }

    return function noise(x, y) {
        const X = Math.floor(x) & 255;
        const Y = Math.floor(y) & 255;

        x -= Math.floor(x);
        y -= Math.floor(y);

        const u = fade(x);
        const v = fade(y);

        const a = perm[X] + Y;
        const b = perm[X + 1] + Y;

        return lerp(
            lerp(grad(perm[a], x, y), grad(perm[b], x - 1, y), u),
            lerp(grad(perm[a + 1], x, y - 1), grad(perm[b + 1], x - 1, y - 1), u),
            v
        );
    };
}

// Generate the game map
export function generateMap(options = {}) {
    const {
        width = 30,        // Map width in hexes
        height = 20,       // Map height in hexes
        seed = Date.now(), // Random seed
        landThreshold = 0.3,     // Higher = less land
        islandScale = 0.15,      // Controls island size/clustering
    } = options;

    const noise = createNoise(seed);
    const random = seededRandom(seed + 1);
    const tiles = new Map();

    // Generate hex grid (rectangular shape using offset coordinates)
    for (let row = 0; row < height; row++) {
        for (let col = 0; col < width; col++) {
            // Convert offset coords to axial coords for rectangular pixel bounds
            const q = col - Math.floor(row / 2);
            const r = row;
            const key = hexKey(q, r);

            // Sample noise at this position
            const noiseVal = noise(q * islandScale, r * islandScale);

            // Add some variation
            const variation = (random() - 0.5) * 0.2;

            // Determine tile type
            let type;
            const value = noiseVal + variation;

            if (value > landThreshold) {
                type = TILE_TYPES.LAND;
            } else if (value > landThreshold - 0.15) {
                type = TILE_TYPES.SHALLOW;
            } else {
                type = TILE_TYPES.DEEP_OCEAN;
            }

            // Determine climate zone based on row
            const normalizedR = r / height;
            let climate;
            if (normalizedR < 0.33) {
                climate = CLIMATE_ZONES.ARCTIC;
            } else if (normalizedR < 0.66) {
                climate = CLIMATE_ZONES.TEMPERATE;
            } else {
                climate = CLIMATE_ZONES.TROPICAL;
            }

            tiles.set(key, {
                q,
                r,
                type,
                climate,
                isPortSite: false,
                hasPort: false,
                hasFort: false,
            });
        }
    }

    // Second pass: identify coastal tiles as port sites
    for (const tile of tiles.values()) {
        if (tile.type === TILE_TYPES.LAND) {
            const neighbors = hexNeighbors(tile.q, tile.r);
            const hasWaterNeighbor = neighbors.some(n => {
                const neighborTile = tiles.get(hexKey(n.q, n.r));
                return neighborTile && (
                    neighborTile.type === TILE_TYPES.SHALLOW ||
                    neighborTile.type === TILE_TYPES.DEEP_OCEAN
                );
            });
            if (hasWaterNeighbor) {
                tile.isPortSite = true;
            }
        }
    }

    return {
        tiles,
        width,
        height,
        seed,
    };
}

// Get tile color based on type and climate
export function getTileColor(tile) {
    if (tile.type === TILE_TYPES.DEEP_OCEAN) {
        return [20, 60, 120];
    }

    if (tile.type === TILE_TYPES.SHALLOW) {
        return [40, 100, 160];
    }

    // Port sites get a distinct sandy/dock color
    if (tile.isPortSite) {
        switch (tile.climate) {
            case CLIMATE_ZONES.ARCTIC:
                return [180, 190, 200]; // Icy dock
            case CLIMATE_ZONES.TEMPERATE:
                return [160, 140, 100]; // Wooden dock
            case CLIMATE_ZONES.TROPICAL:
                return [220, 200, 150]; // Sandy beach
            default:
                return [150, 130, 100];
        }
    }

    // Inland land colors by climate
    switch (tile.climate) {
        case CLIMATE_ZONES.ARCTIC:
            return [220, 230, 240]; // Snowy white
        case CLIMATE_ZONES.TEMPERATE:
            return [80, 140, 70];   // Green
        case CLIMATE_ZONES.TROPICAL:
            return [200, 180, 100]; // Sandy
        default:
            return [100, 100, 100];
    }
}

// Get 3 stipple colors for tile texture (base + 2 variations)
export function getStippleColors(tile) {
    if (tile.type === TILE_TYPES.DEEP_OCEAN) {
        return [
            [15, 50, 100],   // Darker
            [20, 60, 120],   // Base
            [30, 75, 140],   // Lighter
        ];
    }

    if (tile.type === TILE_TYPES.SHALLOW) {
        return [
            [35, 85, 140],   // Darker
            [40, 100, 160],  // Base
            [55, 120, 175],  // Lighter
        ];
    }

    // Port sites
    if (tile.isPortSite) {
        switch (tile.climate) {
            case CLIMATE_ZONES.ARCTIC:
                return [[165, 175, 190], [180, 190, 200], [195, 205, 215]];
            case CLIMATE_ZONES.TEMPERATE:
                return [[140, 120, 85], [160, 140, 100], [175, 155, 115]];
            case CLIMATE_ZONES.TROPICAL:
                return [[200, 180, 130], [220, 200, 150], [235, 215, 170]];
            default:
                return [[130, 110, 85], [150, 130, 100], [165, 145, 115]];
        }
    }

    // Inland land by climate
    switch (tile.climate) {
        case CLIMATE_ZONES.ARCTIC:
            return [[200, 210, 225], [220, 230, 240], [235, 245, 250]];
        case CLIMATE_ZONES.TEMPERATE:
            return [[65, 120, 55], [80, 140, 70], [95, 155, 85]];
        case CLIMATE_ZONES.TROPICAL:
            return [[180, 160, 85], [200, 180, 100], [215, 195, 115]];
        default:
            return [[85, 85, 85], [100, 100, 100], [115, 115, 115]];
    }
}
