import {
  AdditiveBlending,
  Color,
  DoubleSide,
  Group,
  Matrix4,
  Mesh,
  ShaderMaterial,
} from 'three';
import { DEVICE_COLORS } from './theme.js';
import { createQualityPresentation } from './quality.js';
import { createLowHitFeedback } from './low-feedback.js';

export function createHitFeedback(ship, settings = {}) {
  // Capture hull parts before attaching feedback or the inspector's dev target.
  // A quality change must not accidentally include those later descendants.
  const hull = [];
  ship.traverse((object) => {
    if (
      !object.isMesh ||
      object.userData.exhaustHeat ||
      object.userData.aoExclude
    )
      return;
    const materials = Array.isArray(object.material)
      ? object.material
      : [object.material];
    if (!materials.every((material) => material.transparent)) hull.push(object);
  });
  return createQualityPresentation(
    settings,
    (quality) =>
      quality === 'low'
        ? createLowHitFeedback(ship, hull)
        : createDetailedHitFeedback(ship, hull),
    (_age, nextSettings) => nextSettings,
  );
}

// Borrow the actual hull geometry so the response covers every chassis part.
// Device-colored envelopes preserve the chassis detail and its own materials.
function createDetailedHitFeedback(ship, hull) {
  const group = new Group();
  group.name = 'Combat / hull hit outline';
  group.visible = false;
  const material = new ShaderMaterial({
    name: 'Combat / hull response',
    transparent: true,
    depthWrite: false,
    side: DoubleSide,
    forceSinglePass: true,
    toneMapped: false,
    uniforms: {
      color: { value: new Color(DEVICE_COLORS.arc) },
      strength: { value: 0 },
      expansion: { value: 0.055 },
      interference: { value: 0 },
      time: { value: 0 },
      worldToHull: { value: new Matrix4() },
    },
    vertexShader: `
      varying vec3 vNormal, vView, vHull;
      uniform float expansion;
      uniform mat4 worldToHull;
      void main() {
        vec4 p = modelViewMatrix * vec4(position + normal * expansion, 1.);
        vNormal = normalize(normalMatrix * normal);
        vView = -p.xyz;
        vHull = (worldToHull * modelMatrix * vec4(position, 1.)).xyz;
        gl_Position = projectionMatrix * p;
      }`,
    fragmentShader: `
      varying vec3 vNormal, vView, vHull;
      uniform vec3 color;
      uniform float strength, interference, time;
      void main() {
        float rim = pow(1. - abs(dot(normalize(vNormal), normalize(vView))), 2.);
        float opacity = gl_FrontFacing ? .18 + rim * .3 : .75;
        float band = pow(.5 + .5 * sin(vHull.z * 1.5 + vHull.x * .55 - time * 4.), 3.);
        opacity *= mix(1., .3 + band * .7, interference);
        gl_FragColor = vec4(color, opacity * strength);
      }`,
  });
  // A wider additive rim complements the detailed hull outline.
  const glow = material.clone();
  glow.name = 'Combat / hit halo';
  glow.blending = AdditiveBlending;
  glow.uniforms.expansion.value = 0.2;
  glow.uniforms.color.value.multiplyScalar(1.8);
  glow.fragmentShader = `
    varying vec3 vNormal, vView, vHull;
    uniform vec3 color;
    uniform float strength, interference, time;
    void main() {
      float rim = pow(1. - abs(dot(normalize(vNormal), normalize(vView))), 2.);
      float band = pow(.5 + .5 * sin(vHull.z * 1.5 + vHull.x * .55 - time * 4.), 3.);
      gl_FragColor = vec4(color, rim * .32 * strength * mix(1., .3 + band * .7, interference));
    }`;
  const parts = [];
  for (const object of hull) {
    for (const surface of [material, glow]) {
      const mesh = new Mesh(object.geometry, surface);
      mesh.name = 'Combat hit / ' + object.name;
      mesh.matrixAutoUpdate = false;
      mesh.userData.aoExclude = mesh.userData.reflectionExclude = true;
      group.add(mesh);
      parts.push({ source: object, mesh });
    }
  }
  ship.add(group);
  const inverse = new Matrix4();
  let disposed = false;
  return {
    group,
    update(
      age,
      { reducedMotion = false } = {},
      kind = 'arc',
      { ionContact = 0, time = 0 } = {},
    ) {
      if (disposed) return;
      const hit =
        ['arc', 'repulsor', 'ion'].includes(kind) &&
        Number.isFinite(age) &&
        age >= 0 &&
        age < 0.55;
      const exposure = Number.isFinite(ionContact)
        ? Math.max(0, Math.min(1, ionContact))
        : 0;
      group.visible = hit || exposure > 0.001;
      if (!group.visible) {
        material.uniforms.strength.value = 0;
        glow.uniforms.strength.value = 0;
        return;
      }
      if (!hit) kind = 'ion';
      for (const surface of [material, glow]) {
        surface.uniforms.interference.value = hit ? 0 : 1;
        surface.uniforms.time.value = reducedMotion ? 0 : time;
      }
      material.uniforms.color.value.setHex(DEVICE_COLORS[kind]);
      glow.uniforms.color.value
        .setHex(DEVICE_COLORS[kind])
        .multiplyScalar(kind === 'arc' ? 1.8 : 2);
      glow.uniforms.expansion.value =
        kind === 'repulsor' ? 0.28 : kind === 'ion' ? 0.24 : 0.2;
      const smooth = (value) => value * value * (3 - 2 * value);
      const attack = hit ? smooth(Math.min(1, age / 0.08)) : 0;
      const release = hit ? 1 - smooth(Math.max(0, (age - 0.08) / 0.47)) : 0;
      material.uniforms.strength.value = hit
        ? attack * release * (reducedMotion ? 0.45 : 1)
        : exposure * (reducedMotion ? 0.18 : 0.38);
      glow.uniforms.strength.value = material.uniforms.strength.value;
      ship.updateWorldMatrix(true, true);
      inverse.copy(ship.matrixWorld).invert();
      material.uniforms.worldToHull.value.copy(inverse);
      glow.uniforms.worldToHull.value.copy(inverse);
      for (const { source, mesh } of parts) {
        mesh.visible = source.visible;
        mesh.matrix.multiplyMatrices(inverse, source.matrixWorld);
      }
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      group.removeFromParent();
      group.clear();
      material.dispose(); // Geometry belongs to the racer, never to this effect.
      glow.dispose();
    },
  };
}
