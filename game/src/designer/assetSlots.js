// Catalog of every sprite a designer can hot-swap from the in-game Designer panel.
// Each slot mirrors the corresponding `k.loadSprite(...)` call in src/main.js so we
// can reload the asset with the same name (Kaplay overwrites by name) without the
// renderers needing to know anything changed.

export const ASSET_CATEGORIES = ['ships', 'directional', 'structures', 'vfx', 'ui'];

export const ASSET_SLOTS = [
    // Base ship sprites (pirates have no directional variant — single 2-frame strip)
    { key: 'pirate', label: 'Pirate', category: 'ships', originalPath: 'sprites/assets/pirate.png', sliceX: 2, sliceY: 1, expectedSize: '64×32 (2×1)' },

    // Directional ship sheets (3 anim frames × 5 directions). The `group` field is
    // used by the Designer panel to collapse all colors of one ship under one header.
    { key: 'cutter-red', label: 'Cutter Red', category: 'directional', group: 'cutter', originalPath: 'sprites/assets/cutter-red.png', sliceX: 3, sliceY: 5, expectedSize: '96×160 (3×5, 32×32 cells)' },
    { key: 'cutter-green', label: 'Cutter Green', category: 'directional', group: 'cutter', originalPath: 'sprites/assets/cutter-green.png', sliceX: 3, sliceY: 5, expectedSize: '96×160 (3×5, 32×32 cells)' },
    { key: 'cutter-blue', label: 'Cutter Blue', category: 'directional', group: 'cutter', originalPath: 'sprites/assets/cutter-blue.png', sliceX: 3, sliceY: 5, expectedSize: '96×160 (3×5, 32×32 cells)' },
    { key: 'cutter-orange', label: 'Cutter Orange', category: 'directional', group: 'cutter', originalPath: 'sprites/assets/cutter-orange.png', sliceX: 3, sliceY: 5, expectedSize: '96×160 (3×5, 32×32 cells)' },
    { key: 'schooner-red', label: 'Schooner Red', category: 'directional', group: 'schooner', originalPath: 'sprites/assets/schooner-red.png', sliceX: 3, sliceY: 5, expectedSize: '96×160 (3×5, 32×32 cells)' },
    { key: 'schooner-green', label: 'Schooner Green', category: 'directional', group: 'schooner', originalPath: 'sprites/assets/schooner-green.png', sliceX: 3, sliceY: 5, expectedSize: '96×160 (3×5, 32×32 cells)' },
    { key: 'schooner-blue', label: 'Schooner Blue', category: 'directional', group: 'schooner', originalPath: 'sprites/assets/schooner-blue.png', sliceX: 3, sliceY: 5, expectedSize: '96×160 (3×5, 32×32 cells)' },
    { key: 'schooner-orange', label: 'Schooner Orange', category: 'directional', group: 'schooner', originalPath: 'sprites/assets/schooner-orange.png', sliceX: 3, sliceY: 5, expectedSize: '96×160 (3×5, 32×32 cells)' },

    // Structures (2-frame strips: normal + flash)
    { key: 'home-port', label: 'Dock', category: 'structures', originalPath: 'sprites/assets/home-port.png', sliceX: 2, sliceY: 1, expectedSize: '64×32 (2×1)' },
    { key: 'settlement', label: 'Settlement', category: 'structures', originalPath: 'sprites/assets/settlement.png', sliceX: 2, sliceY: 1, expectedSize: '64×32 (2×1)' },
    // Colored watchtower variants (3-frame strips: animated flag)
    { key: 'tower-red', label: 'Watchtower Red', category: 'structures', group: 'tower', originalPath: 'sprites/assets/tower-red.png', sliceX: 3, sliceY: 1, expectedSize: '114×67 (3×1)' },
    { key: 'tower-green', label: 'Watchtower Green', category: 'structures', group: 'tower', originalPath: 'sprites/assets/tower-green.png', sliceX: 3, sliceY: 1, expectedSize: '114×67 (3×1)' },
    { key: 'tower-blue', label: 'Watchtower Blue', category: 'structures', group: 'tower', originalPath: 'sprites/assets/tower-blue.png', sliceX: 3, sliceY: 1, expectedSize: '114×67 (3×1)' },
    { key: 'tower-orange', label: 'Watchtower Orange', category: 'structures', group: 'tower', originalPath: 'sprites/assets/tower-orange.png', sliceX: 3, sliceY: 1, expectedSize: '114×67 (3×1)' },
    // Colored mortar tower variants (3-frame strips: animated flag)
    { key: 'mortar-tower-red', label: 'Mortar Tower Red', category: 'structures', group: 'mortar-tower', originalPath: 'sprites/assets/mortar-tower-red.png', sliceX: 3, sliceY: 1, expectedSize: '162×91 (3×1)' },
    { key: 'mortar-tower-green', label: 'Mortar Tower Green', category: 'structures', group: 'mortar-tower', originalPath: 'sprites/assets/mortar-tower-green.png', sliceX: 3, sliceY: 1, expectedSize: '162×91 (3×1)' },
    { key: 'mortar-tower-blue', label: 'Mortar Tower Blue', category: 'structures', group: 'mortar-tower', originalPath: 'sprites/assets/mortar-tower-blue.png', sliceX: 3, sliceY: 1, expectedSize: '162×91 (3×1)' },
    { key: 'mortar-tower-orange', label: 'Mortar Tower Orange', category: 'structures', group: 'mortar-tower', originalPath: 'sprites/assets/mortar-tower-orange.png', sliceX: 3, sliceY: 1, expectedSize: '162×91 (3×1)' },
    // Colored cannon battery variants (4-frame strips: animated flag)
    { key: 'cannon-battery-red', label: 'Cannon Battery Red', category: 'structures', group: 'cannon-battery', originalPath: 'sprites/assets/cannon-battery-red.png', sliceX: 4, sliceY: 1, expectedSize: '184×97 (4×1)' },
    { key: 'cannon-battery-green', label: 'Cannon Battery Green', category: 'structures', group: 'cannon-battery', originalPath: 'sprites/assets/cannon-battery-green.png', sliceX: 4, sliceY: 1, expectedSize: '184×97 (4×1)' },
    { key: 'cannon-battery-blue', label: 'Cannon Battery Blue', category: 'structures', group: 'cannon-battery', originalPath: 'sprites/assets/cannon-battery-blue.png', sliceX: 4, sliceY: 1, expectedSize: '184×97 (4×1)' },
    { key: 'cannon-battery-orange', label: 'Cannon Battery Orange', category: 'structures', group: 'cannon-battery', originalPath: 'sprites/assets/cannon-battery-orange.png', sliceX: 4, sliceY: 1, expectedSize: '184×97 (4×1)' },

    // VFX
    { key: 'damage', label: 'Damage flipbook', category: 'vfx', originalPath: 'sprites/assets/damage.png', sliceX: 4, sliceY: 1, expectedSize: '128×32 (4×1)' },
    { key: 'barrel', label: 'Barrel (loot)', category: 'vfx', originalPath: 'sprites/assets/barrel.png', sliceX: 1, sliceY: 1, expectedSize: '32×32' },
    { key: 'bird', label: 'Sea bird', category: 'vfx', originalPath: 'sprites/assets/bird.png', sliceX: 2, sliceY: 1, expectedSize: '64×32 (2×1)', anims: { flap: { from: 0, to: 1, loop: true, speed: 4 } } },

    // UI
    { key: 'rally-point', label: 'Rally point', category: 'ui', originalPath: 'sprites/assets/rally-point.png', sliceX: 1, sliceY: 1, expectedSize: '32×32' },
    { key: 'resource-wood', label: 'Wood icon', category: 'ui', originalPath: 'sprites/assets/resource-wood.png', sliceX: 1, sliceY: 1, expectedSize: '16×16 or 32×32' },
    { key: 'resource-crew', label: 'Crew icon', category: 'ui', originalPath: 'sprites/assets/resource-crew.png', sliceX: 1, sliceY: 1, expectedSize: '16×16 or 32×32' },
    { key: 'cursor-default', label: 'Cursor (default)', category: 'ui', originalPath: 'sprites/assets/cursor.png', sliceX: 1, sliceY: 1, expectedSize: '32×32' },
    { key: 'cursor-attack', label: 'Cursor (attack)', category: 'ui', originalPath: 'sprites/assets/cursor-attack.png', sliceX: 1, sliceY: 1, expectedSize: '32×32' },
];

export const CATEGORY_LABELS = {
    ships: 'Ships (base)',
    directional: 'Directional sheets',
    structures: 'Structures',
    vfx: 'VFX',
    ui: 'UI',
};

// Ordered list of directional groups (id → display label). Drives the collapsible
// sub-headers inside the Directional category.
export const DIRECTIONAL_GROUPS = [
    { id: 'cutter', label: 'Cutter (all colors)' },
    { id: 'schooner', label: 'Schooner (all colors)' },
];

export function getSlotsByCategory() {
    const grouped = {};
    for (const cat of ASSET_CATEGORIES) grouped[cat] = [];
    for (const slot of ASSET_SLOTS) grouped[slot.category].push(slot);
    return grouped;
}

export function findSlot(key) {
    return ASSET_SLOTS.find(s => s.key === key) || null;
}

// Quick Spawn grid (3 columns × 2 rows). Player-faction units enter placement mode
// on click and drop on the next map click. `kind: 'action'` buttons fire immediately.
export const QUICK_SPAWN_OPTIONS = [
    { id: 'cutter', label: 'Cutter', kind: 'ship', shipType: 'cutter' },
    { id: 'schooner', label: 'Schooner', kind: 'ship', shipType: 'schooner' },
    { id: 'dock', label: 'Dock', kind: 'port', portType: 'dock' },
    { id: 'settlement', label: 'Settlement', kind: 'settlement' },
    { id: 'watchtower', label: 'Watchtower', kind: 'tower', towerType: 'watchtower' },
    { id: 'spawn-enemies', label: 'Spawn AIs', kind: 'action' },
];
