import * as THREE from 'three';
import { DEVICE_COLORS } from './theme.js';

// Projected edge light keeps the running surface readable on banks and rolls.
// A shader supplies soft spill even with bloom disabled in the Low preset.
export function createDeviceSignal(device, projector, mountHeight) {
  const width = device.width / 2;
  const length = device.length / 2;
  const x = device.lateral;
  const s = device.distance;
  const uniforms = {
    color: { value: new THREE.Color(DEVICE_COLORS[device.type]) },
    deviceBounds: { value: new THREE.Vector4(x, s, width, length) },
    time: { value: 0 },
    motion: { value: 1 },
    energy: { value: 1 },
    pop: { value: 0 },
  };
  const material = new THREE.ShaderMaterial({
    name: 'Device / projected edge light',
    uniforms,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
    vertexShader: `
      attribute vec2 roadCoord;
      varying vec2 coord;
      void main() {
        coord = roadCoord;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.);
      }`,
    fragmentShader: `
      uniform vec3 color;
      uniform vec4 deviceBounds;
      uniform float time, motion, energy, pop;
      varying vec2 coord;
      void main() {
        vec2 p = abs(coord - deviceBounds.xy) - deviceBounds.zw;
        float edge = max(p.x, p.y);
        float core = exp(-abs(edge) * 14.);
        float spill = exp(-abs(edge) * 2.4) * .18;
        float chase = mix(.8, .65 + .35 * sin(coord.y * .85 - time * 5.), motion);
        float alpha = (core * .6 + spill) * (energy * chase + pop * 1.3);
        if (alpha < .002) discard;
        gl_FragColor = vec4(color * 1.8, alpha);
      }`,
  });
  const mesh = new THREE.Mesh(
    projector.geometry(
      [
        [
          [x - width - 1.4, s - length - 1.4],
          [x + width + 1.4, s - length - 1.4],
          [x + width + 1.4, s + length + 1.4],
          [x - width - 1.4, s + length + 1.4],
        ],
      ],
      mountHeight + 0.105,
    ),
    material,
  );
  mesh.name = device.id + ' / edge light';
  mesh.userData.aoExclude = mesh.userData.reflectionExclude = true;
  let acquiredAt = -Infinity;
  return {
    mesh,
    activate(time) {
      acquiredAt = time;
    },
    update({ time, reducedMotion, available }) {
      uniforms.time.value = time;
      uniforms.motion.value = reducedMotion ? 0 : 1;
      uniforms.energy.value = available ? (device.signalScale ?? 1) : 0.025;
      uniforms.pop.value =
        Math.max(0, 1 - (time - acquiredAt) / 0.55) * (reducedMotion ? 0.3 : 1);
    },
    reset() {
      acquiredAt = -Infinity;
    },
  };
}

export function createAcquisitionFlash() {
  const material = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
    uniforms: {
      color: { value: new THREE.Color() },
      age: { value: 1 },
      reducedMotion: { value: 0 },
    },
    vertexShader: `
      varying vec2 coord;
      void main() {
        coord = uv * 2. - 1.;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.);
      }`,
    fragmentShader: `
      varying vec2 coord;
      uniform vec3 color;
      uniform float age, reducedMotion;
      void main() {
        float radius = length(coord);
        float ring = exp(-pow((radius - .78) / .025, 2.));
        float glow = exp(-pow((radius - .78) / .14, 2.)) * .2;
        float spokes = pow(abs(cos(atan(coord.y, coord.x) * 6.)), 24.);
        spokes *= smoothstep(.8, .84, radius) * (1. - smoothstep(.9, 1., radius));
        float alpha = (ring + glow + spokes * .6) * (1.-age) * mix(.8,.3,reducedMotion);
        if (alpha < .002) discard;
        gl_FragColor = vec4(color * 2., alpha);
      }`,
  });
  const geometry = new THREE.PlaneGeometry(2, 2);
  geometry.rotateX(-Math.PI / 2);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.y = 0.2;
  mesh.visible = false;
  mesh.name = 'Device collection / colored ignition ring';
  mesh.userData.aoExclude = mesh.userData.reflectionExclude = true;
  return mesh;
}
