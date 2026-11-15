import * as THREE from 'three';
import { getHexFogOpacity } from '@grog/fogOfWar.js';
import { FOG_UNIFORMS } from '../util/geo.js';
import { PALETTE } from '../palette.js';

// Fog of war as a map-sized texture the lit materials sample per fragment (see FOG_UNIFORMS in
// util/geo.js for why it is per surface rather than a sheet). The values come straight from the
// sim's getHexFogOpacity — the same ring-by-ring reveal timing the 2D game animates — written as
// red = shroud (0..0.5), green = unexplored (0..0.92).

export function createFog(map) {
  const w = map.width;
  const h = map.height;
  const data = new Uint8Array(w * h * 4);
  const tex = new THREE.DataTexture(data, w, h, THREE.RGBAFormat);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.needsUpdate = true;
  FOG_UNIFORMS.tFog.value = tex;
  FOG_UNIFORMS.uFogSize.value.set(w, h);
  FOG_UNIFORMS.uFogColor.value.set(PALETTE.fogUnexplored);
  FOG_UNIFORMS.uFogOn.value = 1;

  const tiles = [...map.tiles.values()];
  let last = -1;

  return {
    texture: tex,
    update(fogState, time, force = false) {
      const animating = fogState.revealingHexes.size > 0 || fogState.shroudingHexes.size > 0;
      const stamp = fogState.visibleHexes.size * 100003 + fogState.exploredHexes.size;
      if (!force && !animating && stamp === last) return;
      last = stamp;
      for (const t of tiles) {
        const col = t.q + Math.floor(t.r / 2);
        const i = (t.r * w + col) * 4;
        const f = getHexFogOpacity(fogState, t.q, t.r, time);
        data[i] = Math.round(f.shroudOpacity * 255);
        data[i + 1] = Math.round(f.unexploredOpacity * 255);
      }
      tex.needsUpdate = true;
    },
    setEnabled(on) { FOG_UNIFORMS.uFogOn.value = on ? 1 : 0; },
  };
}
