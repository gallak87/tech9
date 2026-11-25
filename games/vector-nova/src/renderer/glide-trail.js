import {
  BufferGeometry,
  Color,
  DoubleSide,
  DynamicDrawUsage,
  Float32BufferAttribute,
  MathUtils,
  Mesh,
  ShaderMaterial,
  UniformsLib,
  UniformsUtils,
} from 'three';
import { glideWakeAnchor, wakeProfileGLSL } from './wake-profile.js';

const onset = 75 / 3.6;
const headFeather = 0.45;
const tailEnd = -6.3;
const segments = 12;

// The inspection ship stays on its plinth, so the preview uses a fixed planar
// footprint that can fade in place when the drive audition is released.
export function createInspectionGlideTrail() {
  const geometry = new BufferGeometry();
  const vertices = (segments + 1) * 2;
  const positions = new Float32BufferAttribute(vertices * 3, 3);
  const fades = new Float32BufferAttribute(vertices, 1);
  const across = new Float32Array(vertices);
  const indices = [];
  for (let row = 0; row <= segments; row++) {
    const left = row * 2;
    across.set([-1, 1], left);
    if (row < segments)
      indices.push(left, left + 1, left + 2, left + 1, left + 3, left + 2);
  }
  geometry.setAttribute('position', positions.setUsage(DynamicDrawUsage));
  geometry.setAttribute('fade', fades.setUsage(DynamicDrawUsage));
  geometry.setAttribute('across', new Float32BufferAttribute(across, 1));
  geometry.setIndex(indices);
  geometry.setDrawRange(0, 0);

  const accentColor = new Color(0x9ed9ec);
  const origin = { value: 0 };
  const material = new ShaderMaterial({
    uniforms: {
      ...UniformsUtils.clone(UniformsLib.fog),
      accent: { value: accentColor },
      origin,
    },
    transparent: true,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
    forceSinglePass: true,
    side: DoubleSide,
    toneMapped: false,
    fog: true,
    vertexShader: `
      attribute float fade, across;
      varying vec3 trail;
      #include <fog_pars_vertex>
      void main() {
        trail = vec3(across, fade, position.z);
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: `
      uniform vec3 accent;
      uniform float origin;
      varying vec3 trail;
      #include <fog_pars_fragment>
      ${wakeProfileGLSL}
      void main() {
        float lead = smoothstep(0.0, ${headFeather}, origin - trail.z);
        vec4 profile = wakeProfile(accent, trail.x);
        gl_FragColor = vec4(profile.rgb, min(0.8, trail.y * lead * profile.a));
        #include <colorspace_fragment>
        #include <fog_fragment>
      }`,
  });
  const mesh = new Mesh(geometry, material);
  mesh.name = 'Inspector / road glide trail';
  mesh.userData.aoExclude = mesh.userData.reflectionExclude = true;
  mesh.frustumCulled = false;
  mesh.renderOrder = 2;
  mesh.visible = false;
  let disposed = false;

  function hide() {
    geometry.setDrawRange(0, 0);
    mesh.visible = false;
  }

  return {
    mesh,
    update({
      active,
      speed,
      boost = 0,
      accent = 0x9ed9ec,
      tail = 0,
      hullWidth = 4,
      fadeScale = 1,
    }) {
      if (disposed) return;
      const head = glideWakeAnchor(tail);
      if (!(active && head > tailEnd && fadeScale > 0 && speed > onset)) {
        hide();
        return;
      }

      const pressure = MathUtils.clamp(boost, 0, 1);
      const width = hullWidth * (0.3 + 0.025 * pressure);
      const power =
        0.48 * MathUtils.smoothstep(speed, onset, 87 / 3.6) +
        0.52 * MathUtils.smoothstep(speed, 83 / 3.6, 140 / 3.6);
      const strength =
        (0.28 + pressure * 0.1) * power * MathUtils.clamp(fadeScale, 0, 1);
      for (let row = 0; row <= segments; row++) {
        const fraction = row / segments;
        const z = MathUtils.lerp(head, tailEnd, fraction);
        const fade = strength * (1 - MathUtils.smoothstep(fraction, 0.3, 1));
        const left = row * 2;
        positions.setXYZ(left, -width, 0, z);
        positions.setXYZ(left + 1, width, 0, z);
        fades.setX(left, fade);
        fades.setX(left + 1, fade);
      }
      origin.value = head;
      accentColor.set(accent);
      positions.needsUpdate = fades.needsUpdate = true;
      geometry.setDrawRange(0, indices.length);
      mesh.visible = true;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      hide();
      mesh.removeFromParent();
      geometry.dispose();
      material.dispose();
    },
  };
}
