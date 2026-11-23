import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { SMAAPass } from 'three/addons/postprocessing/SMAAPass.js';
import { racingLens } from '../renderer/racing-lens.js';
import { ExhaustHeatPass } from './exhaust-heat-pass.js';

// Inspection previews may supply a driving lens alongside the nozzle heat.
export function createInspectionPipeline(
  renderer,
  scene,
  camera,
  { lens } = {},
) {
  let composer, heat, blur;
  let size = '';
  let disposed = false;
  const passes = [];
  const projected = new THREE.Vector3();
  const craftCenter = new THREE.Vector2();
  function updateBlur(subject) {
    if (!blur) return;
    blur.enabled = Boolean(subject && lens.strength > 0.0001);
    if (!blur.enabled) return;
    const uniforms = blur.uniforms;
    uniforms.strength.value = lens.strength;
    uniforms.pressure.value = lens.pressure;
    uniforms.time.value = lens.time;
    const { min, max } = subject.userData.bounds;
    subject.updateWorldMatrix(true, false);
    camera.updateMatrixWorld();
    projected
      .set((min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2)
      .applyMatrix4(subject.matrixWorld)
      .project(camera);
    craftCenter.set(projected.x * 0.5 + 0.5, projected.y * 0.5 + 0.5);
    uniforms.craftCenter.value.copy(craftCenter);
    let radius = 0.1;
    for (let corner = 0; corner < 8; corner++) {
      projected
        .set(
          (corner & 1 ? max : min)[0],
          (corner & 2 ? max : min)[1],
          (corner & 4 ? max : min)[2],
        )
        .applyMatrix4(subject.matrixWorld)
        .project(camera);
      radius = Math.max(
        radius,
        Math.hypot(
          projected.x * 0.5 + 0.5 - craftCenter.x,
          (projected.y * 0.5 + 0.5 - craftCenter.y) * 0.82,
        ),
      );
    }
    uniforms.craftRadius.value = radius + 0.012;
  }
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
    render({ heat: enabled = true, quality = 'high', subject } = {}) {
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
        passes.push(new RenderPass(scene, camera), heat);
        if (lens) {
          blur = new ShaderPass(racingLens);
          passes.push(blur);
        }
        passes.push(new OutputPass(), new SMAAPass());
        for (const pass of passes) composer.addPass(pass);
      }
      resize();
      heat.enabled = enabled;
      updateBlur(subject);
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
