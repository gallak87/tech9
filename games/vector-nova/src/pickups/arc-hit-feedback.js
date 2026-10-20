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

// Borrow the actual hull geometry so the response covers every chassis part.
// One quiet blue envelope replaces a flashing bounding shell or material swap.
export function createArcHitFeedback(ship) {
  const group = new Group();
  group.name = 'Arc / hull hit outline';
  group.visible = false;
  const material = new ShaderMaterial({
    name: 'Arc / dim blue hull response',
    transparent: true,
    depthWrite: false,
    side: DoubleSide,
    forceSinglePass: true,
    toneMapped: false,
    uniforms: {
      color: { value: new Color(DEVICE_COLORS.arc) },
      strength: { value: 0 },
      expansion: { value: 0.055 },
    },
    vertexShader: `
      varying vec3 vNormal, vView;
      uniform float expansion;
      void main() {
        vec4 p = modelViewMatrix * vec4(position + normal * expansion, 1.);
        vNormal = normalize(normalMatrix * normal);
        vView = -p.xyz;
        gl_Position = projectionMatrix * p;
      }`,
    fragmentShader: `
      varying vec3 vNormal, vView;
      uniform vec3 color;
      uniform float strength;
      void main() {
        float rim = pow(1. - abs(dot(normalize(vNormal), normalize(vView))), 2.);
        float opacity = gl_FrontFacing ? .18 + rim * .3 : .75;
        gl_FragColor = vec4(color, opacity * strength);
      }`,
  });
  // A wider additive rim stays visible at Low quality without a bloom pass.
  const glow = material.clone();
  glow.name = 'Arc / blue hit halo';
  glow.blending = AdditiveBlending;
  glow.uniforms.expansion.value = 0.2;
  glow.uniforms.color.value.multiplyScalar(1.8);
  glow.fragmentShader = `
    varying vec3 vNormal, vView;
    uniform vec3 color;
    uniform float strength;
    void main() {
      float rim = pow(1. - abs(dot(normalize(vNormal), normalize(vView))), 2.);
      gl_FragColor = vec4(color, rim * .32 * strength);
    }`;
  const parts = [];
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
    if (materials.every((entry) => entry.transparent)) return;
    for (const surface of [material, glow]) {
      const mesh = new Mesh(object.geometry, surface);
      mesh.name = 'Arc hit / ' + object.name;
      mesh.matrixAutoUpdate = false;
      mesh.userData.aoExclude = mesh.userData.reflectionExclude = true;
      group.add(mesh);
      parts.push({ source: object, mesh });
    }
  });
  ship.add(group);
  const inverse = new Matrix4();
  let disposed = false;
  return {
    group,
    update(age, { reducedMotion = false } = {}) {
      if (disposed) return;
      group.visible = Number.isFinite(age) && age >= 0 && age < 0.55;
      if (!group.visible) {
        material.uniforms.strength.value = 0;
        glow.uniforms.strength.value = 0;
        return;
      }
      const smooth = (value) => value * value * (3 - 2 * value);
      const attack = smooth(Math.min(1, age / 0.08));
      const release = 1 - smooth(Math.max(0, (age - 0.08) / 0.47));
      material.uniforms.strength.value =
        attack * release * (reducedMotion ? 0.45 : 1);
      glow.uniforms.strength.value = material.uniforms.strength.value;
      ship.updateWorldMatrix(true, true);
      inverse.copy(ship.matrixWorld).invert();
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
