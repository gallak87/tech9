import * as THREE from 'three';
import { createRandom } from './terrain.js';

function geometryFromTriangles(positions, colors, uv = []) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(positions, 3),
  );
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  if (uv.length)
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}

/** Slender arching blades with smooth normals across their five curved segments. */
export function createGrassGeometry(seed = 19) {
  const random = createRandom(seed);
  const positions = [],
    colors = [],
    normals = [],
    uv = [];
  const segments = 5;
  for (let blade = 0; blade < 9; blade++) {
    const angle = random() * Math.PI * 2;
    const radius = random() * 0.25;
    const height = 0.25 + random() * 0.48;
    const width = 0.008 + random() * 0.018;
    const lean = 0.22 + random() * 0.49;
    const outward = new THREE.Vector3(Math.cos(angle), 0, Math.sin(angle));
    const across = new THREE.Vector3(-Math.sin(angle), 0, Math.cos(angle));
    const shade = new THREE.Color().setHSL(
      0.22 + random() * 0.042,
      0.36 + random() * 0.16,
      0.11 + random() * 0.07,
    );
    for (let step = 0; step < segments; step++) {
      for (const [index, side] of [
        [step, -1],
        [step, 1],
        [step + 1, -1],
        [step, 1],
        [step + 1, 1],
        [step + 1, -1],
      ]) {
        const t = index / segments;
        const w = width * (1 - t * 0.99);
        const position = outward
          .clone()
          .multiplyScalar(radius + lean * t * t)
          .addScaledVector(across, side * w);
        position.y = height * Math.sin(t * 1.72);
        const tangent = outward.clone().multiplyScalar(2 * lean * t);
        tangent.y = height * 1.72 * Math.cos(t * 1.72);
        const normal = across
          .clone()
          .cross(tangent)
          .normalize()
          .addScaledVector(across, side * 0.22)
          .normalize();
        const multiplier = 0.35 + t * 0.74;
        positions.push(position.x, position.y, position.z);
        normals.push(normal.x, normal.y, normal.z);
        colors.push(
          shade.r * multiplier,
          shade.g * multiplier,
          shade.b * multiplier,
        );
        uv.push(side < 0 ? 0 : 1, t);
      }
    }
  }
  const geometry = geometryFromTriangles(positions, colors, uv);
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  return geometry;
}

function addLeaf(positions, colors, uv, base, end, width, shade) {
  const direction = end.clone().sub(base);
  const side = new THREE.Vector3(-direction.z, 0, direction.x).normalize();
  const strips = [];
  for (let segment = 0; segment <= 4; segment++) {
    const t = segment / 4;
    const center = base.clone().lerp(end, t);
    center.y += Math.sin(t * Math.PI) * width * 0.38;
    const halfWidth = width * (0.025 + Math.pow(Math.sin(t * Math.PI), 0.72));
    strips.push([
      center.clone().addScaledVector(side, -halfWidth),
      center.clone().addScaledVector(side, halfWidth),
    ]);
  }
  for (let segment = 0; segment < 4; segment++) {
    for (const [row, edge] of [
      [segment, 0],
      [segment, 1],
      [segment + 1, 0],
      [segment, 1],
      [segment + 1, 1],
      [segment + 1, 0],
    ]) {
      const point = strips[row][edge];
      const t = row / 4;
      positions.push(point.x, point.y, point.z);
      uv.push(edge, t);
      const factor = 0.75 + Math.sin(t * Math.PI) * 0.28 + edge * 0.04;
      colors.push(shade.r * factor, shade.g * factor, shade.b * factor);
    }
  }
}

export function createFernGeometry() {
  const random = createRandom(572);
  const positions = [];
  const colors = [];
  const uv = [];
  for (let frond = 0; frond < 6; frond++) {
    const angle = (frond / 6) * Math.PI * 2 + random() * 0.3;
    const length = 0.65 + random() * 0.5;
    const height = 0.46 + random() * 0.4;
    const forward = new THREE.Vector3(Math.cos(angle), 0, Math.sin(angle));
    const sideways = new THREE.Vector3(-forward.z, 0, forward.x);
    const color = new THREE.Color().setHSL(
      0.255 + random() * 0.025,
      0.4,
      0.11 + random() * 0.055,
    );
    for (let pair = 0; pair < 7; pair++) {
      const t = 0.15 + (pair / 7) * 0.8;
      const base = forward.clone().multiplyScalar(length * t);
      base.y = Math.sin(t * Math.PI * 0.79) * height;
      const leafLength = (0.05 + Math.sin(t * Math.PI) * 0.21) * length;
      for (const side of [-1, 1]) {
        const end = base
          .clone()
          .addScaledVector(sideways, leafLength * side)
          .addScaledVector(forward, leafLength * 0.42);
        end.y += 0.012 - t * 0.045;
        addLeaf(positions, colors, uv, base, end, leafLength * 0.17, color);
      }
    }
  }
  return geometryFromTriangles(positions, colors, uv);
}

export function createShrubGeometry() {
  const random = createRandom(6314);
  const positions = [];
  const colors = [];
  const uv = [];
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
      const length = 0.055 + random() * 0.085;
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
        0.25 + random() * 0.04,
        0.32 + random() * 0.14,
        0.08 + random() * 0.065,
      );
      addLeaf(positions, colors, uv, base, end, length * 0.33, shade);
    }
  }
  return geometryFromTriangles(positions, colors, uv);
}

export function vegetationMaterial(windUniform, windScale = 1) {
  const material = new THREE.MeshStandardMaterial({
    vertexColors: true,
    side: THREE.DoubleSide,
    roughness: 0.93,
    metalness: 0,
    emissive: '#22301b',
    emissiveIntensity: 0.04,
  });
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uWindTime = windUniform;
    shader.vertexShader = shader.vertexShader.replace(
      '#include <common>',
      '#include <common>\nuniform float uWindTime;\nvarying vec2 vLeafUv;',
    );
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <common>',
      '#include <common>\nvarying vec2 vLeafUv;',
    );
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <color_fragment>',
      `#include <color_fragment>
      float leafVein = exp(-pow((vLeafUv.x - 0.5) * 80.0, 2.0));
      float leafRibs = pow(abs(sin(vLeafUv.y * 105.0 + abs(vLeafUv.x - 0.5) * 22.0)), 9.0);
      float mottle = sin(vLeafUv.x * 38.0 + vLeafUv.y * 43.0) * sin(vLeafUv.y * 37.0 - vLeafUv.x * 27.0);
      diffuseColor.rgb *= 0.86 + leafVein * 0.14 + leafRibs * 0.09 + mottle * 0.055;
    `,
    );
    // A thin leaf receives light from both faces. The soft diffuse fill represents
    // transmitted canopy light without costly alpha cards or full SSS passes.
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <lights_fragment_end>',
      '#include <lights_fragment_end>\nreflectedLight.indirectDiffuse += diffuseColor.rgb * 0.045;',
    );
    shader.vertexShader = shader.vertexShader.replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>
      vLeafUv = uv;
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
