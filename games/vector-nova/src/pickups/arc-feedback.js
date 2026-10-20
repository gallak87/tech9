import * as T from 'three';
import { DEVICE_COLORS } from './theme.js';

// A branching corona fans outward from the hull shoulders. Crossed ribbons keep the thin
// filaments readable in the chase view and as the inspector rotates the ship.
export function createArcFeedback() {
  const positions = [];
  const coordinates = [];
  function segment(start, end, strength) {
    const a = new T.Vector3(...start);
    const b = new T.Vector3(...end);
    const direction = b.clone().sub(a).normalize();
    const side = direction
      .clone()
      .cross(new T.Vector3(0, 1, 0))
      .normalize();
    const normal = direction.clone().cross(side).normalize();
    for (const across of [side, normal]) {
      across.multiplyScalar(0.065);
      for (const [point, sign] of [
        [a, -1],
        [a, 1],
        [b, -1],
        [b, -1],
        [a, 1],
        [b, 1],
      ]) {
        positions.push(
          ...point.clone().addScaledVector(across, sign).toArray(),
        );
        coordinates.push(sign, strength);
      }
    }
  }
  function path(points, strength) {
    for (let index = 1; index < points.length; index++)
      segment(points[index - 1], points[index], strength);
  }
  for (const side of [-1, 1]) {
    for (const [index, z] of [-2, -1, 0.1, 1.1, 2.1].entries()) {
      const x = [1.3, 1.5, 1.3, 1.15, 0.65][index];
      const reach = [2.2, 2.9, 3.4, 2.7, 2.2][index];
      const drift = [-1, 0.65, -0.3, 0.8, 1.4][index];
      const lift = index % 2 ? 0.4 : 0.75;
      const points = [
        [side * x, 0.18, z],
        [side * (x + reach * 0.22), 0.38, z + drift * 0.2 + 0.18],
        [side * (x + reach * 0.39), 0.26 + lift * 0.3, z + drift * 0.4 - 0.16],
        [side * (x + reach * 0.58), 0.55 + lift * 0.4, z + drift * 0.6 + 0.2],
        [side * (x + reach * 0.74), 0.43 + lift * 0.7, z + drift * 0.8 - 0.12],
        [side * (x + reach), 0.65 + lift, z + drift],
      ];
      path(points, index === 2 ? 1 : 0.75);
      path(
        [
          points[2],
          [
            side * (x + reach * 0.51),
            0.18 + lift * 0.2,
            z + drift * 0.3 - 0.45,
          ],
          [side * (x + reach * 0.68), 0.34, z + drift * 0.4 - 0.35],
          [side * (x + reach * 0.9), 0.3 + lift * 0.4, z + drift * 0.5 - 0.8],
        ],
        0.42,
      );
      path(
        [
          points[4],
          [
            side * (x + reach * 0.86),
            0.75 + lift * 0.8,
            z + drift * 0.8 + 0.35,
          ],
          [side * (x + reach * 1.05), 0.9 + lift, z + drift + 0.65],
        ],
        0.3,
      );
    }
  }
  const geometry = new T.BufferGeometry();
  geometry.setAttribute('position', new T.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new T.Float32BufferAttribute(coordinates, 2));
  geometry.computeBoundingSphere();
  const material = new T.ShaderMaterial({
    name: 'Arc / branching hull corona',
    transparent: true,
    depthWrite: false,
    side: T.DoubleSide,
    blending: T.AdditiveBlending,
    toneMapped: false,
    uniforms: {
      color: { value: new T.Color(DEVICE_COLORS.arc) },
      strength: { value: 0 },
    },
    vertexShader: `
      varying vec2 filament;
      void main() {
        filament = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.);
      }`,
    fragmentShader: `
      varying vec2 filament;
      uniform vec3 color;
      uniform float strength;
      void main() {
        float core = exp(-filament.x * filament.x * 70.);
        float glow = exp(-filament.x * filament.x * 6.) * .22;
        float alpha = (core + glow) * filament.y * strength;
        if (alpha < .002) discard;
        gl_FragColor = vec4(mix(color * 1.8, vec3(1.8), core * .45), alpha);
      }`,
  });
  const mesh = new T.Mesh(geometry, material);
  mesh.name = 'Arc / branching hull discharge';
  mesh.userData.aoExclude = mesh.userData.reflectionExclude = true;
  mesh.visible = false;
  return mesh;
}
