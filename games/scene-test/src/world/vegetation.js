import * as THREE from 'three';
import { createRandom } from './terrain.js';

function geometryFromTriangles(positions, colors) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(positions, 3),
  );
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}

/** Curved ribbons, not billboard grass. Six triangles describe each tapered blade. */
export function createGrassGeometry(seed = 19) {
  const random = createRandom(seed);
  const positions = [];
  const colors = [];
  for (let blade = 0; blade < 11; blade++) {
    const angle = random() * Math.PI * 2;
    const radius = random() * 0.24;
    const height = 0.22 + random() * 0.58;
    const width = 0.009 + random() * 0.023;
    const lean = 0.1 + random() * 0.34;
    const baseX = Math.cos(angle) * radius;
    const baseZ = Math.sin(angle) * radius;
    const center = (t) =>
      new THREE.Vector3(
        baseX + Math.cos(angle) * lean * t * t,
        height * t,
        baseZ + Math.sin(angle) * lean * t * t,
      );
    const left = [];
    const right = [];
    const shade = new THREE.Color().setHSL(
      0.205 + random() * 0.047,
      0.28 + random() * 0.2,
      0.19 + random() * 0.085,
    );
    for (let step = 0; step < 4; step++) {
      const t = step / 3;
      const p = center(t);
      const w = width * (1 - t * 0.97);
      left.push([p.x - Math.sin(angle) * w, p.y, p.z + Math.cos(angle) * w]);
      right.push([p.x + Math.sin(angle) * w, p.y, p.z - Math.cos(angle) * w]);
    }
    for (let step = 0; step < 3; step++) {
      for (const [point, t] of [
        [left[step], step],
        [right[step], step],
        [left[step + 1], step + 1],
        [right[step], step],
        [right[step + 1], step + 1],
        [left[step + 1], step + 1],
      ]) {
        positions.push(...point);
        const multiplier = 0.42 + t * 0.19;
        colors.push(
          shade.r * multiplier,
          shade.g * multiplier,
          shade.b * multiplier,
        );
      }
    }
  }
  return geometryFromTriangles(positions, colors);
}

function addLeaf(positions, colors, base, end, width, shade) {
  const delta = end.clone().sub(base);
  const side = new THREE.Vector3(-delta.z, 0.025, delta.x)
    .normalize()
    .multiplyScalar(width);
  const center = base.clone().lerp(end, 0.47);
  center.y += width * 0.16;
  const left = center.clone().add(side);
  const right = center.clone().sub(side);
  const ridge = center.clone();
  ridge.y += width * 0.32;
  for (const [a, b, c, factor] of [
    [base, left, ridge, 0.86],
    [base, ridge, right, 1],
    [left, end, ridge, 0.93],
    [ridge, end, right, 1.06],
  ]) {
    for (const point of [a, b, c]) {
      positions.push(point.x, point.y, point.z);
      colors.push(shade.r * factor, shade.g * factor, shade.b * factor);
    }
  }
}

export function createFernGeometry() {
  const random = createRandom(572);
  const positions = [];
  const colors = [];
  for (let frond = 0; frond < 7; frond++) {
    const angle = (frond / 7) * Math.PI * 2 + random() * 0.3;
    const length = 0.65 + random() * 0.5;
    const height = 0.46 + random() * 0.4;
    const forward = new THREE.Vector3(Math.cos(angle), 0, Math.sin(angle));
    const sideways = new THREE.Vector3(-forward.z, 0, forward.x);
    const color = new THREE.Color().setHSL(
      0.225 + random() * 0.025,
      0.42,
      0.17 + random() * 0.045,
    );
    for (let pair = 0; pair < 9; pair++) {
      const t = 0.15 + (pair / 9) * 0.8;
      const base = forward.clone().multiplyScalar(length * t);
      base.y = Math.sin(t * Math.PI * 0.79) * height;
      const leafLength = (0.05 + Math.sin(t * Math.PI) * 0.21) * length;
      for (const side of [-1, 1]) {
        const end = base
          .clone()
          .addScaledVector(sideways, leafLength * side)
          .addScaledVector(forward, leafLength * 0.42);
        end.y += 0.012 - t * 0.045;
        addLeaf(positions, colors, base, end, leafLength * 0.17, color);
      }
    }
  }
  return geometryFromTriangles(positions, colors);
}

export function createShrubGeometry() {
  const random = createRandom(6314);
  const positions = [];
  const colors = [];
  for (let branch = 0; branch < 14; branch++) {
    const angle = random() * Math.PI * 2;
    const direction = new THREE.Vector3(Math.cos(angle), 0, Math.sin(angle));
    const reach = 0.4 + random() * 0.72;
    const lift = 0.25 + random() * 0.6;
    for (let leaf = 0; leaf < 13; leaf++) {
      const t = 0.2 + random() * 0.8;
      const base = direction.clone().multiplyScalar(reach * t);
      base.x += (random() - 0.5) * 0.3;
      base.z += (random() - 0.5) * 0.3;
      base.y = lift * Math.sin(t * 1.7) + random() * 0.14;
      const leafAngle = angle + (random() - 0.5) * 4;
      const length = 0.09 + random() * 0.15;
      const end = base
        .clone()
        .add(
          new THREE.Vector3(
            Math.cos(leafAngle) * length,
            0.05,
            Math.sin(leafAngle) * length,
          ),
        );
      const shade = new THREE.Color().setHSL(
        0.215 + random() * 0.04,
        0.32 + random() * 0.14,
        0.105 + random() * 0.095,
      );
      addLeaf(positions, colors, base, end, length * 0.34, shade);
    }
  }
  return geometryFromTriangles(positions, colors);
}

export function vegetationMaterial(windUniform, windScale = 1) {
  const material = new THREE.MeshStandardMaterial({
    vertexColors: true,
    side: THREE.DoubleSide,
    roughness: 0.93,
    metalness: 0,
    emissive: '#29351a',
    emissiveIntensity: 0.055,
  });
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uWindTime = windUniform;
    shader.vertexShader = shader.vertexShader.replace(
      '#include <common>',
      '#include <common>\nuniform float uWindTime;',
    );
    shader.vertexShader = shader.vertexShader.replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>
      #ifdef USE_INSTANCING
        float phase = uWindTime * 0.9 + instanceMatrix[3].x * 0.28 + instanceMatrix[3].z * 0.19;
        float sway = sin(phase) * 0.55 + sin(phase * 1.73) * 0.25;
        transformed.x += sway * pow(max(position.y, 0.0), 1.6) * ${Number(windScale * 0.065).toFixed(4)};
        transformed.z += cos(phase * 0.8) * pow(max(position.y, 0.0), 1.6) * ${Number(windScale * 0.035).toFixed(4)};
      #endif`,
    );
  };
  material.customProgramCacheKey = () => `forest-wind-${windScale}`;
  return material;
}
