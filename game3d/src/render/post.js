import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

// The frame after the scene is drawn: ambient occlusion, bloom, then filmic tone mapping.
//
//   - Ambient occlusion (three's GTAO) darkens where surfaces meet — a hull on the water, a wall on
//     the ground, the underside of a canopy — which is most of what makes a lit model look like it
//     is standing *in* the scene rather than pasted on it.
//   - Bloom lets the things that are meant to be bright (sun glitter on the sea, lanterns, lit
//     windows, muzzle flashes) spill a little light.
//   - Tone mapping (ACES) is done once, at the end, on the HDR frame. Under a composer three turns
//     off in-material tone mapping and the sRGB encode by itself, so every shader patch here mixes
//     in linear light and never needs to know.
//
// Anything that is *about* the game rather than in it — selection rings, health bars, placement
// hexes, particles — carries `userData.noAO` and is left out of the occlusion pass; otherwise a
// health bar would cast a dark halo on the sea.

export function createPost(renderer, scene, camera, { ao = true, bloom = true } = {}) {
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  const size = renderer.getDrawingBufferSize(new THREE.Vector2());
  const target = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples: 4 });
  const composer = new EffectComposer(renderer, target);
  composer.addPass(new RenderPass(scene, camera));

  let gtao = null;
  if (ao) {
    gtao = new GTAOPass(scene, camera, size.x, size.y);
    gtao.blendIntensity = 0.85;
    gtao.updateGtaoMaterial({ radius: 1.6, distanceExponent: 1.4, thickness: 2.0, scale: 1.15, samples: 12, distanceFallOff: 1, screenSpaceRadius: false });
    gtao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, radiusExponent: 1, rings: 2, samples: 12 });
    const hide = gtao._overrideVisibility.bind(gtao);
    gtao._overrideVisibility = function () {
      hide();
      const cache = this._visibilityCache;
      scene.traverse((o) => { if (o.userData.noAO && o.visible) { o.visible = false; cache.push(o); } });
    };
    composer.addPass(gtao);
  }
  let glow = null;
  if (bloom) {
    glow = new UnrealBloomPass(new THREE.Vector2(size.x, size.y), 0.32, 0.55, 0.92);
    composer.addPass(glow);
  }
  composer.addPass(new OutputPass());

  return {
    composer, gtao, bloom: glow,
    setSize(w, h) {
      composer.setPixelRatio(renderer.getPixelRatio());
      composer.setSize(w, h);
    },
    render() { composer.render(); },
  };
}

/**
 * Image-based ambient light from the sky dome itself: the dome is rendered into a small prefiltered
 * environment map once, so metals have something to reflect and shaded faces pick up sky colour
 * from above and sea colour from below, instead of one flat ambient tone.
 */
export function skyEnvironment(renderer, sky, groundColor) {
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envScene = new THREE.Scene();
  const dome = sky.clone();
  envScene.add(dome);
  const floor = new THREE.Mesh(new THREE.CircleGeometry(1300, 24).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: groundColor }));
  floor.position.y = -40;
  envScene.add(floor);
  const tex = pmrem.fromScene(envScene, 0, 1, 3000).texture;
  pmrem.dispose();
  return tex;
}
