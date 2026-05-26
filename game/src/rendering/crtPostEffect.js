// CRT post-processing shader. Renders the scene through a curved screen with
// scanlines, vignette, chromatic aberration, an RGB aperture grille, and a
// subtle flicker. Hooks into Kaplay's built-in usePostEffect — Kaplay already
// renders the scene to an offscreen framebuffer and then draws a fullscreen
// quad to the canvas, so we only need to supply the fragment shader for that
// final pass. The post-effect runs after all in-world drawing, so game input
// and hex picking still operate on the un-warped scene coordinates.

// Tweak these in code; they're read fresh each frame via the uniform getter,
// so edits take effect on the next frame without a reload. The in-game debug
// panel exposes the same fields as sliders for live tuning.
//
// Reference presets are listed in CRT_PRESETS below — these defaults are a
// hand-tuned mix (heavier scanlines, lighter curvature/vignette/aperture/
// aberration than "Classic").
export const CRT_CONFIG = {
    enabled: true,
    curvature: 0.11,
    scanline: 0.59,
    vignette: 0.27,
    aberration: 0.0005,
    aperture: 0.06,
    flicker: 0.020,
};

// Slider metadata used by the debug panel. Each entry's `key` must match a
// CRT_CONFIG field; min/max bound the slider; precision controls how many
// decimal places the live value display shows.
export const CRT_SLIDERS = [
    { key: 'curvature',  label: 'Curvature',  min: 0.0, max: 0.6,   precision: 2 },
    { key: 'scanline',   label: 'Scanlines',  min: 0.0, max: 1.0,   precision: 2 },
    { key: 'vignette',   label: 'Vignette',   min: 0.0, max: 1.0,   precision: 2 },
    { key: 'aberration', label: 'Aberration', min: 0.0, max: 0.015, precision: 4 },
    { key: 'aperture',   label: 'Aperture',   min: 0.0, max: 0.7,   precision: 2 },
    { key: 'flicker',    label: 'Flicker',    min: 0.0, max: 0.1,   precision: 3 },
];

// One-click recipes from the demo. `classic` matches CRT_CONFIG's defaults.
export const CRT_PRESETS = [
    { id: 'subtle',  label: 'Subtle',  values: { curvature: 0.10, scanline: 0.15, vignette: 0.25, aberration: 0.001, aperture: 0.10, flicker: 0.01 } },
    { id: 'classic', label: 'Classic', values: { curvature: 0.20, scanline: 0.35, vignette: 0.45, aberration: 0.003, aperture: 0.25, flicker: 0.02 } },
    { id: 'heavy',   label: 'Heavy',   values: { curvature: 0.40, scanline: 0.60, vignette: 0.70, aberration: 0.008, aperture: 0.50, flicker: 0.05 } },
];

export function applyCRTPreset(presetId) {
    const preset = CRT_PRESETS.find((p) => p.id === presetId);
    if (preset) Object.assign(CRT_CONFIG, preset.values);
}

// Kaplay wraps user fragment code in a template that supplies v_uv as the
// `uv` parameter and u_tex as the `tex` sampler. The scanline math is tuned
// against u_resolution.y (output pixels), and the aperture grille uses
// gl_FragCoord.x so stripes stay one screen pixel wide regardless of zoom.
const CRT_FRAG = `
uniform vec2 u_resolution;
uniform float u_time;
uniform float u_curvature;
uniform float u_scanline;
uniform float u_vignette;
uniform float u_aberration;
uniform float u_aperture;
uniform float u_flicker;

vec2 crtCurve(vec2 uv) {
    uv = uv * 2.0 - 1.0;
    vec2 offset = abs(uv.yx) * u_curvature;
    uv = uv + uv * offset * offset;
    return uv * 0.5 + 0.5;
}

vec4 frag(vec2 pos, vec2 uvIn, vec4 color, sampler2D tex) {
    vec2 uv = crtCurve(uvIn);

    if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) {
        return vec4(0.0, 0.0, 0.0, 1.0);
    }

    vec2 center = uv - 0.5;
    float edge = dot(center, center);
    vec2 dir = normalize(center + 0.0001);
    float ab = u_aberration * (1.0 + edge * 6.0);
    float r = texture2D(tex, uv - dir * ab).r;
    float g = texture2D(tex, uv).g;
    float b = texture2D(tex, uv + dir * ab).b;
    vec3 col = vec3(r, g, b);

    float scan = sin(uv.y * u_resolution.y * 1.6) * 0.5 + 0.5;
    col *= mix(1.0, scan, u_scanline);

    float ap = mod(gl_FragCoord.x, 3.0);
    vec3 mask = vec3(1.0);
    if (ap < 1.0) mask = vec3(1.15, 0.85, 0.85);
    else if (ap < 2.0) mask = vec3(0.85, 1.15, 0.85);
    else mask = vec3(0.85, 0.85, 1.15);
    col *= mix(vec3(1.0), mask, u_aperture);

    vec2 vig = uv * (1.0 - uv.yx);
    float v = pow(vig.x * vig.y * 15.0, 0.3);
    col *= mix(1.0, clamp(v, 0.0, 1.0), u_vignette);

    float fl = 1.0 + (sin(u_time * 8.0) * 0.5 + 0.5) * u_flicker - u_flicker * 0.5;
    col *= fl;

    col *= 1.0 + u_scanline * 0.3;

    return vec4(col, 1.0);
}
`;

let installed = false;

export function installCRTPostEffect(k) {
    if (installed) return;
    installed = true;

    k.loadShader("crt", null, CRT_FRAG);

    const startTime = performance.now();
    let activeShader = null; // tracks what we last passed to usePostEffect

    // Uniform getter — Kaplay calls this every frame, so live edits to
    // CRT_CONFIG show up next frame. u_resolution uses the physical canvas
    // pixel size (k.canvas.width/height already accounts for pixelDensity)
    // because the aperture grille is keyed to gl_FragCoord which is in
    // physical pixels of the output canvas.
    const uniformGetter = () => ({
        "u_resolution": k.vec2(k.canvas.width, k.canvas.height),
        "u_time": (performance.now() - startTime) / 1000.0,
        "u_curvature": CRT_CONFIG.curvature,
        "u_scanline": CRT_CONFIG.scanline,
        "u_vignette": CRT_CONFIG.vignette,
        "u_aberration": CRT_CONFIG.aberration,
        "u_aperture": CRT_CONFIG.aperture,
        "u_flicker": CRT_CONFIG.flicker,
    });

    const sync = () => {
        const want = CRT_CONFIG.enabled ? "crt" : null;
        if (want === activeShader) return;
        // Passing null clears Kaplay's postShader so the final framebuffer
        // blit uses the default passthrough — no CRT math runs.
        k.usePostEffect(want, want ? uniformGetter : null);
        activeShader = want;
    };

    sync();

    // Poll once per animation frame so toggling CRT_CONFIG.enabled at runtime
    // takes effect without a restart. Lives outside Kaplay's scene lifecycle
    // so it survives k.go() transitions.
    const tick = () => {
        sync();
        requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
}
