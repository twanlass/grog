// Sprite utility functions

// Draw a pixel sprite at given position with scale and optional opacity
export function drawSprite(k, sprite, x, y, scale = 4, opacity = 1.0) {
    const height = sprite.length;
    const width = sprite[0].length;

    for (let row = 0; row < height; row++) {
        for (let col = 0; col < width; col++) {
            const pixel = sprite[row][col];
            if (pixel) {
                k.drawRect({
                    pos: k.vec2(x + col * scale, y + row * scale),
                    width: scale,
                    height: scale,
                    color: k.rgb(pixel[0], pixel[1], pixel[2]),
                    opacity: opacity,
                });
            }
        }
    }
}

// Draw a pixel sprite with rotation (angle in radians)
export function drawSpriteRotated(k, sprite, centerX, centerY, scale = 4, angle = 0) {
    const height = sprite.length;
    const width = sprite[0].length;
    const halfWidth = (width * scale) / 2;
    const halfHeight = (height * scale) / 2;

    // Use Kaplay's transform system for rotation
    k.pushTransform();
    k.pushTranslate(centerX, centerY);
    k.pushRotate(angle * (180 / Math.PI)); // Convert radians to degrees

    // Draw sprite centered at origin (transform handles positioning)
    for (let row = 0; row < height; row++) {
        for (let col = 0; col < width; col++) {
            const pixel = sprite[row][col];
            if (pixel) {
                k.drawRect({
                    pos: k.vec2(col * scale - halfWidth, row * scale - halfHeight),
                    width: scale,
                    height: scale,
                    color: k.rgb(pixel[0], pixel[1], pixel[2]),
                });
            }
        }
    }

    k.popTransform();
}

// Get sprite dimensions
export function getSpriteSize(sprite, scale = 4) {
    return {
        width: sprite[0].length * scale,
        height: sprite.length * scale,
    };
}

// Draw a pixel sprite with health-based grayscale and tint (matches healthOverlay shader)
export function drawSpriteHealthTint(k, sprite, x, y, scale = 4, healthPercent = 1.0) {
    const height = sprite.length;
    const width = sprite[0].length;

    // Calculate health-based tint: green (100%) -> orange (50%) -> red (0%)
    let tintR, tintG, tintB;
    if (healthPercent > 0.5) {
        // Green to orange (100% to 50%)
        const t = (healthPercent - 0.5) * 2.0;
        tintR = 1.0 * (1 - t) + 0.2 * t;  // orange.r to green.r
        tintG = 0.5 * (1 - t) + 0.8 * t;  // orange.g to green.g
        tintB = 0.0 * (1 - t) + 0.2 * t;  // orange.b to green.b
    } else {
        // Orange to red (50% to 0%)
        const t = healthPercent * 2.0;
        tintR = 1.0 * (1 - t) + 1.0 * t;  // red.r to orange.r
        tintG = 0.1 * (1 - t) + 0.5 * t;  // red.g to orange.g
        tintB = 0.1 * (1 - t) + 0.0 * t;  // red.b to orange.b
    }

    for (let row = 0; row < height; row++) {
        for (let col = 0; col < width; col++) {
            const pixel = sprite[row][col];
            if (pixel) {
                // Convert to grayscale using luminance weights
                const gray = pixel[0] * 0.299 + pixel[1] * 0.587 + pixel[2] * 0.114;

                // Apply tint to grayscale
                const r = gray * tintR;
                const g = gray * tintG;
                const b = gray * tintB;

                k.drawRect({
                    pos: k.vec2(x + col * scale, y + row * scale),
                    width: scale,
                    height: scale,
                    color: k.rgb(
                        Math.min(255, Math.floor(r)),
                        Math.min(255, Math.floor(g)),
                        Math.min(255, Math.floor(b))
                    ),
                });
            }
        }
    }
}

// Draw a white flash overlay on a sprite (for hit feedback)
export function drawSpriteFlash(k, sprite, x, y, scale = 4, flashIntensity = 1.0) {
    const height = sprite.length;
    const width = sprite[0].length;

    for (let row = 0; row < height; row++) {
        for (let col = 0; col < width; col++) {
            const pixel = sprite[row][col];
            if (pixel) {
                k.drawRect({
                    pos: k.vec2(x + col * scale, y + row * scale),
                    width: scale,
                    height: scale,
                    color: k.rgb(255, 255, 255),
                    opacity: flashIntensity * 0.8,
                });
            }
        }
    }
}
