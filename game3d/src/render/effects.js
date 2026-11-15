import * as THREE from 'three';
import { hexToPixel } from '@grog/hex.js';
import { shouldRenderEntity, isHexVisible } from '@grog/fogOfWar.js';
import { getShipVisualPos } from '@grog/systems/shipMovement.js';
import { PALETTE } from '../palette.js';
import { bakeColor, propMaterial, unlitMaterial } from '../util/geo.js';
import { hexToWorld, grogToWorld, PX_PER_UNIT } from '../world.js';

// Combat and weather effects, drawn from the arrays the sim already keeps: projectiles,
// shipExplosions, waterSplashes, floatingDebris, lootDrops, woodSplinters, cannonSmoke. Each kind
// is one InstancedMesh refilled every frame — a handful of draws however busy the battle.
//
// Every one sets `frustumCulled = false`: sim-taxi's trap — three computes an InstancedMesh's
// bounding sphere once, from the instances as they stood on the first culled frame, and never
// again, so an effect pool that opened empty would latch a sphere of radius −1 and vanish.

const MAX = 256;
const dummy = new THREE.Object3D();
const col = new THREE.Color();

function pool(geometry, material, name, { shadow = false } = {}) {
  const mesh = new THREE.InstancedMesh(geometry, material, MAX);
  mesh.name = name;
  mesh.frustumCulled = false;
  mesh.count = 0;
  mesh.castShadow = shadow;
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.setColorAt(0, col.set('#ffffff'));
  return mesh;
}

function white(g) { return bakeColor(g, '#ffffff'); }

export function createEffects(scene) {
  const lit = propMaterial({ key: 'fx' });
  const glow = unlitMaterial({ vertexColors: true });
  const group = new THREE.Group();
  group.name = 'effects';
  scene.add(group);

  const balls = pool(white(new THREE.IcosahedronGeometry(0.28, 1)), lit, 'cannonballs', { shadow: true });
  const arrowGeo = white(new THREE.BoxGeometry(0.9, 0.06, 0.06));
  const arrows = pool(arrowGeo, lit, 'arrows');
  const fire = pool(white(new THREE.IcosahedronGeometry(1, 0)), glow, 'fire');
  const smoke = pool(white(new THREE.IcosahedronGeometry(1, 0)), lit, 'smoke');
  const splash = pool(white(new THREE.CylinderGeometry(0.25, 0.55, 1, 7).translate(0, 0.5, 0)), glow, 'splash');
  const planks = pool(white(new THREE.BoxGeometry(0.9, 0.12, 0.28)), lit, 'debris', { shadow: true });
  const barrels = pool(white(new THREE.CylinderGeometry(0.42, 0.42, 0.75, 8)), lit, 'loot', { shadow: true });
  const wake = pool(white(new THREE.CircleGeometry(1, 7).rotateX(-Math.PI / 2)), unlitMaterial({ vertexColors: true, transparent: true, opacity: 0.55, depthWrite: false }), 'wake');
  wake.renderOrder = 2;
  group.add(balls, arrows, fire, smoke, splash, planks, barrels, wake);

  const wakes = [];        // { x, z, age, life, size }
  const lastWake = new Map();

  function put(mesh, i, x, y, z, s, color, rot = null, sv = null) {
    if (i >= MAX) return i;
    dummy.position.set(x, y, z);
    if (rot) dummy.rotation.copy(rot); else dummy.rotation.set(0, 0, 0);
    if (sv) dummy.scale.copy(sv); else dummy.scale.setScalar(s);
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
    mesh.setColorAt(i, col.set(color));
    return i + 1;
  }
  function finish(mesh, n) {
    mesh.count = n;
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }

  const rot = new THREE.Euler();
  const sv = new THREE.Vector3();
  const fireA = new THREE.Color(PALETTE.fireCore);
  const fireB = new THREE.Color(PALETTE.fire);
  const smokeC = new THREE.Color(PALETTE.smoke);

  return {
    update(gameState, fogState, time, dt) {
      // --- Projectiles: the 2D arc (peak 40px for a ball, 12px for an arrow), now a real height.
      let nb = 0, na = 0;
      for (const p of gameState.projectiles) {
        if (p.sourceShipIndex !== undefined) {
          const s = gameState.ships[p.sourceShipIndex];
          if (s && !shouldRenderEntity(fogState, s)) continue;
        }
        if (p.sourceTowerIndex !== undefined) {
          const t = gameState.towers[p.sourceTowerIndex];
          if (t && !shouldRenderEntity(fogState, t)) continue;
        }
        const a = hexToWorld(p.fromQ, p.fromR);
        const b = hexToWorld(p.toQ, p.toR);
        const t = THREE.MathUtils.clamp(p.progress, 0, 1);
        const arrow = p.projectileType === 'arrow';
        const peak = arrow ? 2.2 : 5.5;
        const x = a.x + (b.x - a.x) * t;
        const z = a.z + (b.z - a.z) * t;
        const y = 1.2 + peak * 4 * t * (1 - t);
        if (arrow) {
          const vy = peak * 4 * (1 - 2 * t);
          const horiz = Math.hypot(b.x - a.x, b.z - a.z);
          rot.set(0, Math.atan2(-(b.z - a.z), b.x - a.x), Math.atan2(vy, horiz), 'YZX');
          na = put(arrows, na, x, y, z, 1, PALETTE.woodDark, rot);
        } else {
          nb = put(balls, nb, x, y, z, 1, PALETTE.cannonball);
        }
      }
      finish(balls, nb); finish(arrows, na);

      // --- Explosions: a fireball that blooms then cools to smoke, plus the TNT chain's offsets.
      let nf = 0, ns = 0;
      for (const e of gameState.shipExplosions) {
        if (!e.ignoreFog && !isHexVisible(fogState, e.q, e.r)) continue;
        const delay = e.delay || 0;
        const age = e.age - delay;
        if (age < 0) continue;
        const u = THREE.MathUtils.clamp(age / e.duration, 0, 1);
        const c = hexToWorld(e.q, e.r);
        const x = c.x + (e.offsetX || 0) / PX_PER_UNIT;
        const z = c.z + (e.offsetY || 0) / PX_PER_UNIT;
        const big = e.massive ? 2.6 : 1;
        const r = big * (0.8 + 2.4 * Math.sqrt(u));
        col.copy(fireA).lerp(fireB, Math.min(1, u * 2));
        if (u < 0.55) nf = put(fire, nf, x, 0.6 + r * 0.5, z, r * (1 - u * 0.6), col.getStyle());
        const sr = r * (0.6 + u);
        ns = put(smoke, ns, x + u * 0.8, 0.8 + r * 0.6 + u * 3, z - u * 0.6, sr * 0.7,
          col.copy(smokeC).lerp(fireB, Math.max(0, 0.4 - u)).getStyle());
      }
      // Cannon smoke puffs and wood splinters: short-lived; the sim never ages these two, so the
      // renderer does (2D draws and ages them the same way, in effectsRenderer).
      for (let i = gameState.cannonSmoke.length - 1; i >= 0; i--) {
        const s = gameState.cannonSmoke[i];
        s.age += dt;
        if (s.age >= s.duration) { gameState.cannonSmoke.splice(i, 1); continue; }
        if (!isHexVisible(fogState, s.q, s.r)) continue;
        const c = hexToWorld(s.q, s.r);
        const u = s.age / s.duration;
        for (const p of s.particles) ns = put(smoke, ns, c.x + p.dx * u, 1.5 + u * 1.5, c.z + p.dy * u, p.size * (0.6 + u), '#cfcfcf');
      }
      for (let i = gameState.woodSplinters.length - 1; i >= 0; i--) {
        const s = gameState.woodSplinters[i];
        s.age += dt;
        if (s.age >= s.duration) { gameState.woodSplinters.splice(i, 1); continue; }
      }

      // TNT: a sputtering spark at the stern of any ship with a lit fuse.
      for (const ship of gameState.ships) {
        if (!(ship.tntFuse > 0) || !shouldRenderEntity(fogState, ship)) continue;
        const p = getShipVisualPos(hexToPixel, ship);
        const w = grogToWorld(p.x, p.y);
        const flick = 0.35 + 0.25 * Math.abs(Math.sin(time * 31 + w.x));
        nf = put(fire, nf, w.x, 1.4 + Math.sin(time * 9) * 0.1, w.z, flick, PALETTE.fireCore);
      }
      finish(fire, nf); finish(smoke, ns);

      // --- Splashes: a white column that rises and falls.
      let nsp = 0;
      for (const s of gameState.waterSplashes) {
        if (!isHexVisible(fogState, s.q, s.r)) continue;
        const u = s.age / s.duration;
        const c = hexToWorld(s.q, s.r);
        sv.set(1 + u, Math.sin(Math.PI * u) * 2.6 + 0.05, 1 + u);
        nsp = put(splash, nsp, c.x, -0.1, c.z, 1, PALETTE.splash, null, sv);
      }
      finish(splash, nsp);

      // --- Debris: planks bobbing on the swell, sinking over their last second.
      let np = 0;
      for (const d of gameState.floatingDebris) {
        if (!isHexVisible(fogState, d.q, d.r)) continue;
        const c = hexToWorld(d.q, d.r);
        const left = d.duration - d.age;
        const sink = left < 1 ? (1 - left) * 0.6 : 0;
        const colr = d.debrisType === 'stone' ? PALETTE.stoneDark : PALETTE.wood;
        const pieces = d.pieces || [];
        for (let k = 0; k < Math.min(pieces.length, 8); k++) {
          const pc = pieces[k];
          const drift = Math.min(d.age, 3) / 3;
          const x = c.x + ((pc.offsetX || 0) + (pc.driftX || 0) * drift) / PX_PER_UNIT;
          const z = c.z + ((pc.offsetY || 0) + (pc.driftY || 0) * drift) / PX_PER_UNIT;
          rot.set(Math.sin(time * 2 + k) * 0.2, (pc.rotation || 0) + d.age * 0.2, 0);
          np = put(planks, np, x, 0.05 + Math.sin(time * 1.7 + k) * 0.06 - sink, z, (pc.size || 6) / 7, colr, rot);
        }
      }
      finish(planks, np);

      // --- Loot: barrels bobbing where a pirate went down.
      let nl = 0;
      for (const l of gameState.lootDrops) {
        if (!isHexVisible(fogState, l.q, l.r)) continue;
        const c = hexToWorld(l.q, l.r);
        rot.set(Math.PI / 2 + Math.sin(time * 1.4) * 0.15, l.age * 0.3, 0);
        nl = put(barrels, nl, c.x, 0.15 + Math.sin(time * 2.1 + c.x) * 0.1, c.z, 1, PALETTE.wood, rot);
      }
      finish(barrels, nl);

      // --- Wakes: foam discs dropped behind moving ships, spreading and fading.
      for (const ship of gameState.ships) {
        if (!(ship.path && ship.path.length) || !shouldRenderEntity(fogState, ship)) continue;
        const last = lastWake.get(ship.id) || 0;
        if (time - last < 0.18) continue;
        lastWake.set(ship.id, time);
        const p = getShipVisualPos(hexToPixel, ship);
        const w = grogToWorld(p.x, p.y);
        wakes.push({ x: w.x - Math.cos(ship.heading || 0) * 1.4, z: w.z - Math.sin(ship.heading || 0) * 1.4, age: 0, life: 1.6 });
      }
      let nw = 0;
      for (let i = wakes.length - 1; i >= 0; i--) {
        const k = wakes[i];
        k.age += dt;
        if (k.age >= k.life || wakes.length > MAX) { wakes.splice(i, 1); continue; }
        const u = k.age / k.life;
        col.set(PALETTE.foam).multiplyScalar(1 - u * 0.4);
        nw = put(wake, nw, k.x, 0.42, k.z, 0.5 + u * 1.3, col.getStyle());
      }
      finish(wake, nw);
    },
  };
}
