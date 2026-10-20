import * as THREE from 'three';
import { DEVICE_COLORS } from './theme.js';

// Projected edge light keeps the running surface readable on banks and rolls.
// High's shader supplies soft spill; Low uses plain projected markings.
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
      kind: { value: 0 },
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
      uniform float age, reducedMotion, kind;
      void main() {
        float radius = length(coord);
        float theta=atan(coord.y,coord.x), pattern=0.;
        if(kind<.5) {
          float x=abs(abs(coord.x)-.55);
          pattern=exp(-x*60.)*(1.-smoothstep(.2,.95,coord.y))*smoothstep(-1.,-.7,coord.y);
        } else if(kind<1.5) {
          float hex=radius*cos(mod(theta+3.14159/6.,3.14159/3.)-3.14159/6.);
          pattern=exp(-pow((hex-.75)/.02,2.))*.65;
        } else if(kind<2.5) {
          float target=.85-age*.55;
          pattern=exp(-pow((radius-target)/.04,2.))*pow(.5+.5*cos(theta*3.),4.);
        } else if(kind<3.5) {
          float x=abs(abs(coord.x)-.6-.03*sin(coord.y*25.));
          pattern=exp(-x*90.)*smoothstep(-.7,-.3,coord.y)*(1.-smoothstep(.6,1.,coord.y));
        } else {
          float x=abs(abs(coord.x)-.35-.18*(1.-coord.y));
          pattern=exp(-x*45.)*smoothstep(-1.,-.7,coord.y)*(1.-smoothstep(.2,.7,coord.y));
        }
        float alpha=pattern*pow(1.-age,1.5)*mix(.8,.3,reducedMotion);
        if (alpha < .002) discard;
        gl_FragColor = vec4(color * 2., alpha);
      }`,
  });
  const geometry = new THREE.PlaneGeometry(2, 2);
  geometry.rotateX(-Math.PI / 2);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.y = 0.2;
  mesh.visible = false;
  mesh.name = 'Device collection / shaped energy transfer';
  mesh.userData.aoExclude = mesh.userData.reflectionExclude = true;
  return mesh;
}
