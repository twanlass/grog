import * as THREE from 'three';

// The RTS camera: sim-taxi's fixed orthographic 3/4 view (parallel lines stay parallel, so a fleet
// at the top of the screen is the same size as one under the cursor), but tilted straight on
// rather than down a 45° diagonal. Grog's map is a rhombus that already sits at ~30° in pixel
// space; a diagonal yaw on top of that throws it into a lopsided kite, and the 2D player's sense of
// "north is up" goes with it. ELEVATION and YAW are the two knobs.

export const ELEVATION = THREE.MathUtils.degToRad(52);
export const YAW = 0;
export const DISTANCE = 600;

/** Frustum half-height bounds, world units. 2D Grog's zoom range is about 0.4–2.5×. */
export const ZOOM_MIN = 7;
export const ZOOM_MAX = 150;
export const ZOOM_DEFAULT = 30;

export const VIEW_DIR = new THREE.Vector3(
  Math.sin(YAW) * Math.cos(ELEVATION),
  Math.sin(ELEVATION),
  Math.cos(YAW) * Math.cos(ELEVATION),
).normalize();

/** Screen right and screen "up" projected onto the ground, for panning. */
export const GROUND_RIGHT = new THREE.Vector3(Math.cos(YAW), 0, -Math.sin(YAW));
export const GROUND_UP = new THREE.Vector3(-Math.sin(YAW), 0, -Math.cos(YAW));

/** The orientation every billboard (health bar, label) wears — constant, the view never turns. */
export const BILLBOARD = new THREE.Quaternion();

export function createCamera() {
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 1, DISTANCE * 3);
  const state = {
    target: new THREE.Vector3(0, 0, 0),
    zoom: ZOOM_DEFAULT,
    aspect: 1,
    shake: 0,
    bounds: null,
  };
  const up = new THREE.Vector3(0, 1, 0);
  const shakeOff = new THREE.Vector3();

  function apply() {
    const h = state.zoom;
    const w = h * state.aspect;
    camera.left = -w; camera.right = w; camera.top = h; camera.bottom = -h;
    camera.updateProjectionMatrix();
    shakeOff.set(0, 0, 0);
    if (state.shake > 0.01) {
      shakeOff.set((Math.random() - 0.5) * state.shake, 0, (Math.random() - 0.5) * state.shake);
    }
    camera.position.copy(state.target).add(shakeOff).addScaledVector(VIEW_DIR, DISTANCE);
    camera.up.copy(up);
    camera.lookAt(state.target.x + shakeOff.x, state.target.y, state.target.z + shakeOff.z);
    BILLBOARD.copy(camera.quaternion);
  }

  function clampTarget() {
    const b = state.bounds;
    if (!b) return;
    state.target.x = THREE.MathUtils.clamp(state.target.x, b.minX, b.maxX);
    // The camera looks *up* the map, so the visible ground sits up-screen of the target; let the
    // target run a little past the bottom edge so the southern coast can reach mid-screen.
    state.target.z = THREE.MathUtils.clamp(state.target.z, b.minZ, b.maxZ);
  }

  return {
    camera,
    state,
    resize(w, h) { state.aspect = w / h; apply(); },
    panScreen(dxPx, dyPx, viewH) {
      // Pixels → world: the frustum is 2*zoom tall; ground "up" is foreshortened by sin(elev).
      const perPx = (2 * state.zoom) / viewH;
      state.target.addScaledVector(GROUND_RIGHT, -dxPx * perPx);
      state.target.addScaledVector(GROUND_UP, dyPx * perPx / Math.sin(ELEVATION));
      clampTarget();
    },
    panWorld(dx, dz) { state.target.x += dx; state.target.z += dz; clampTarget(); },
    zoomBy(f) { state.zoom = THREE.MathUtils.clamp(state.zoom * f, ZOOM_MIN, ZOOM_MAX); },
    lookAt(x, z) { state.target.set(x, 0, z); clampTarget(); },
    setBounds(b) { state.bounds = b; clampTarget(); },
    update(dt) {
      state.shake *= Math.pow(0.02, dt);
      apply();
    },
  };
}

const ndc = new THREE.Vector2();
const ray = new THREE.Raycaster();
const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const hit = new THREE.Vector3();

/** Screen pixel → point on a horizontal plane at height `y` (default: the sea). */
export function screenToGround(camera, px, py, w, h, y = 0) {
  ndc.set((px / w) * 2 - 1, -(py / h) * 2 + 1);
  ray.setFromCamera(ndc, camera);
  plane.constant = -y;
  return ray.ray.intersectPlane(plane, hit) ? hit.clone() : null;
}

const proj = new THREE.Vector3();
/** World point → screen pixel. */
export function worldToScreen(camera, x, y, z, w, h) {
  proj.set(x, y, z).project(camera);
  return { x: (proj.x + 1) / 2 * w, y: (1 - proj.y) / 2 * h, z: proj.z };
}
