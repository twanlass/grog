// Runtime sprite hot-swap helpers for the designer panel.
// Re-calling k.loadSprite(name, ...) overwrites the existing asset (Kaplay's
// internal AssetBucket uses Map.set under the hood), so the next draw frame
// automatically picks up the new artwork.

import { findSlot } from './assetSlots.js';

const modifiedSlots = new Set();

export function isModified(key) {
    return modifiedSlots.has(key);
}

export function getModifiedSlots() {
    return new Set(modifiedSlots);
}

function loadOpts(slot) {
    const opts = { sliceX: slot.sliceX, sliceY: slot.sliceY };
    if (slot.anims) opts.anims = slot.anims;
    return opts;
}

/**
 * Read a File (from <input type="file">) into a data URL and overwrite the
 * sprite registered under slot.key.
 * @returns Promise<void>
 */
export function uploadSprite(k, slot, file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
            try {
                k.loadSprite(slot.key, reader.result, loadOpts(slot));
                modifiedSlots.add(slot.key);
                resolve();
            } catch (err) {
                reject(err);
            }
        };
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(file);
    });
}

/**
 * Restore the original on-disk asset for a slot.
 */
export function resetSprite(k, slot) {
    k.loadSprite(slot.key, slot.originalPath, loadOpts(slot));
    modifiedSlots.delete(slot.key);
}

/**
 * Restore every modified slot. Useful when toggling debug mode off.
 */
export function resetAllSprites(k) {
    for (const key of Array.from(modifiedSlots)) {
        const slot = findSlot(key);
        if (slot) resetSprite(k, slot);
    }
}
