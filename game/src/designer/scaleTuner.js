// Live sprite-scale tuner for the Designer panel.
// Lets the user adjust how big each entity's sprite is rendered at runtime
// (debug mode only) so they can dial in a value, then copy it into sprites/*.js.

import { PORTS, SETTLEMENTS, TOWERS, SHIPS } from "../sprites/index.js";

// Allowed scale range for slider/input
export const SCALE_MIN = 0.1;
export const SCALE_MAX = 3.0;

/**
 * Build the deduplicated list of sprites that can be live-tuned.
 * Each entry: { key, label, defaultScale }
 *
 * `key` is the sprite name used at draw time (e.g. 'tower', 'home-port',
 * 'cutter', 'pirate'). Multiple entity types that share a sprite collapse
 * into one row.
 */
export function getTunableSprites() {
    const seen = new Map();  // key → { key, label, defaultScale }

    const add = (key, label, defaultScale) => {
        if (!key || seen.has(key)) return;
        seen.set(key, { key, label, defaultScale });
    };

    // Ports: scale field is `spriteScale`
    for (const [, data] of Object.entries(PORTS)) {
        if (data.imageSprite) add(data.imageSprite, data.name, data.spriteScale ?? 1);
    }
    // Settlements: no scale field today (defaults to 1)
    for (const [, data] of Object.entries(SETTLEMENTS)) {
        if (data.imageSprite) add(data.imageSprite, data.name, data.spriteScale ?? 1);
    }
    // Towers: scale field is `imageScale`
    for (const [, data] of Object.entries(TOWERS)) {
        if (data.imageSprite) add(data.imageSprite, data.name, data.imageScale ?? 1);
    }
    // Ships: directional sheets use `directionalSprite`, others `imageSprite`.
    // Both share `spriteScale` for the multiplier.
    for (const [, data] of Object.entries(SHIPS)) {
        const key = data.directionalSprite || data.imageSprite;
        if (key) add(key, data.name, data.spriteScale ?? 1);
    }

    return Array.from(seen.values());
}

/**
 * Returns the effective render scale for a sprite, applying the designer
 * panel override if one is set, otherwise the default from metadata.
 */
export function getRenderScale(gameState, spriteKey, defaultScale) {
    const overrides = gameState?.designerPanel?.scaleOverrides;
    if (overrides && spriteKey in overrides) {
        return overrides[spriteKey];
    }
    return defaultScale;
}

/**
 * Clamp a scale value into the allowed range, and round to 3 decimals.
 */
export function clampScale(value) {
    if (!Number.isFinite(value)) return null;
    const clamped = Math.max(SCALE_MIN, Math.min(SCALE_MAX, value));
    return Math.round(clamped * 1000) / 1000;
}
