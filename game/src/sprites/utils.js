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
