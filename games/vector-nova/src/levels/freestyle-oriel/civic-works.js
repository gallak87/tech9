import * as T from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { assetURL } from '../../assets/url.js';

export function foundedSunvaultFootY(position, heading) {
  const xValues = [];
  for (const x of [-55, 55])
    for (const z of [-65, 65])
      xValues.push(
        new T.Vector3(x, 0, z).applyQuaternion(heading).x + position.x,
      );
  if (Math.min(...xValues) <= 0 && Math.max(...xValues) >= 0) return -4010;
  return (
    Math.min(
      ...xValues.map((x) => 1000 - Math.sqrt(Math.max(1, 5000 ** 2 - x ** 2))),
    ) - 10
  );
}

/** Nearby cells retain instancing without submitting every distant court and
 * grove into each chase/shadow frustum. Geometry/placements remain identical. */
export function addSunvaultInstances({
  group,
  lifetime,
  geometry,
  material,
  matrices,
  name,
  shadows = true,
}) {
  const cells = new Map(),
    meshes = [];
  for (const matrix of matrices) {
    const key = `${Math.floor(matrix.elements[12] / 1000)}:${Math.floor(matrix.elements[14] / 1000)}`;
    if (!cells.has(key)) cells.set(key, []);
    cells.get(key).push(matrix);
  }
  for (const [cell, placements] of cells) {
    const mesh = lifetime.own(
      new T.InstancedMesh(geometry, material, placements.length),
    );
    mesh.name = `${name} / cell ${cell}`;
    placements.forEach((matrix, index) => mesh.setMatrixAt(index, matrix));
    mesh.castShadow = shadows;
    mesh.receiveShadow = true;
    mesh.computeBoundingBox();
    mesh.computeBoundingSphere();
    group.add(mesh);
    meshes.push(mesh);
  }
  return meshes;
}

/** Course-local founded assemblies, exported from the editable Blender kit. */
export async function createSunvaultWorks(lifetime, maps) {
  const { scene } = await new GLTFLoader().loadAsync(
    assetURL('assets/levels/freestyle-oriel/sunvault-civic-works.glb'),
  );
  scene.updateMatrixWorld(true);
  const prototypes = {},
    materials = new Set(),
    originals = new Set();
  scene.traverse((mesh) => {
    if (!mesh.isMesh) return;
    let root = mesh;
    while (root.parent && root.parent !== scene) root = root.parent;
    const geometry = lifetime.own(
      mesh.geometry.clone().applyMatrix4(mesh.matrixWorld),
    );
    maps.coordinates(geometry);
    originals.add(mesh.geometry);
    for (const material of [mesh.material].flat()) materials.add(material);
    (prototypes[root.name] ??= []).push({ geometry, material: mesh.material });
  });
  for (const geometry of originals) geometry.dispose();
  for (const material of materials) {
    lifetime.own(material);
    if (material.name === 'WarmLimestone') {
      maps.apply(material);
      material.color.set('#d7c8a7');
    } else if (material.name === 'coolrecess') {
      material.color.set('#3d6267');
      material.roughness = 0.68;
      material.metalness = 0.08;
      material.emissive.set('#143139');
      material.emissiveIntensity = 0.12;
    } else {
      material.color.set('#826b43');
      material.metalness = 0.64;
      material.roughness = 0.46;
    }
  }
  for (const name of ['anchor_pier', 'arrival_terrace', 'load_cradle'])
    if (!prototypes[name]?.length)
      throw new Error(`Missing Sunvault assembly: ${name}`);
  return { prototypes, materials };
}
