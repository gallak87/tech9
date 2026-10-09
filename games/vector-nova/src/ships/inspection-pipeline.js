import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { SMAAPass } from 'three/addons/postprocessing/SMAAPass.js';
import { ExhaustHeatPass } from './exhaust-heat-pass.js';

// Inspection uses the same live nozzle refraction as racing, without inheriting
// a circuit's weather, speed blur or lighting. Allocate only when first viewed.
export function createInspectionPipeline(renderer, scene, camera) {
  let composer, heat;
  let size = '';
  let disposed = false;
  const passes = [];
  function resize() {
    if (!composer) return;
    const dimensions = renderer.getSize(new THREE.Vector2());
    const ratio = renderer.getPixelRatio();
    const next = `${dimensions.x}x${dimensions.y}@${ratio}`;
    if (next === size) return;
    size = next;
    composer.setPixelRatio(ratio);
    composer.setSize(dimensions.x, dimensions.y);
  }
  return {
    render({ heat: enabled = true, quality = 'high' } = {}) {
      if (disposed) return;
      if (quality === 'low') {
        renderer.render(scene, camera);
        return;
      }
      if (!composer) {
        const target = new THREE.WebGLRenderTarget(1, 1, {
          type: THREE.HalfFloatType,
          depthTexture: new THREE.DepthTexture(1, 1, THREE.UnsignedIntType),
        });
        composer = new EffectComposer(renderer, target);
        heat = new ExhaustHeatPass(scene, camera);
        passes.push(
          new RenderPass(scene, camera),
          heat,
          new OutputPass(),
          new SMAAPass(),
        );
        for (const pass of passes) composer.addPass(pass);
      }
      resize();
      heat.enabled = enabled;
      composer.render(0);
    },
    resize,
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const pass of passes) pass.dispose();
      composer?.dispose();
    },
  };
}
