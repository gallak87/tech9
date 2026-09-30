import * as T from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export function seededRandom(seed = 81733) {
  return () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}

export function disposeResources(roots, extraMaterials = []) {
  const geometries = new Set();
  const materials = new Set(extraMaterials);
  const textures = new Set();
  for (const root of roots.filter(Boolean)) {
    root.traverse((object) => {
      if (object.geometry) geometries.add(object.geometry);
      for (const material of [object.material].flat().filter(Boolean)) {
        materials.add(material);
        for (const value of Object.values(material))
          if (
            value?.isTexture &&
            !material.userData.borrowedTextures?.includes(value)
          )
            textures.add(value);
      }
    });
  }
  for (const geometry of geometries) geometry.dispose();
  for (const material of materials) material.dispose();
  const bitmaps = new Set();
  for (const texture of textures) {
    texture.dispose();
    const bitmap = texture.source?.data;
    if (typeof bitmap?.close === 'function') bitmaps.add(bitmap);
  }
  // Embedded glTF images may share one ImageBitmap across several tinted maps.
  for (const bitmap of bitmaps) bitmap.close();
}

export function tube(points, radius = 1, segments = 32, sides = 7) {
  return new T.TubeGeometry(
    new T.CatmullRomCurve3(
      points.map((point) =>
        point.isVector3 ? point : new T.Vector3(...point),
      ),
    ),
    segments,
    radius,
    sides,
    false,
  );
}

export function instanceTemplate(
  template,
  placements,
  group,
  { shadow = false, name = template.name, cellSize = 500 } = {},
) {
  if (!placements.length) return [];
  // Separate distant instance bounds let camera and shadow frusta reject whole
  // forest cells instead of submitting every tree on the circuit in every pass.
  if (cellSize && placements.length > 5) {
    const cells = new Map();
    for (const placement of placements) {
      const [x, , z] = placement.position;
      const key = `${Math.floor(x / cellSize)},${Math.floor(z / cellSize)}`;
      if (!cells.has(key)) cells.set(key, []);
      cells.get(key).push(placement);
    }
    return [...cells.values()].flatMap((cell) =>
      instanceTemplate(template, cell, group, { shadow, name, cellSize: 0 }),
    );
  }
  template.updateMatrixWorld(true);
  const inverse = template.matrixWorld.clone().invert();
  const local = new T.Matrix4();
  const dummy = new T.Object3D();
  const matrix = new T.Matrix4();
  const meshes = [];
  template.traverse((source) => {
    if (!source.isMesh) return;
    local.multiplyMatrices(inverse, source.matrixWorld);
    const mesh = new T.InstancedMesh(
      source.geometry,
      source.material,
      placements.length,
    );
    mesh.name = `${name} / ${source.name}`;
    mesh.castShadow = shadow;
    mesh.receiveShadow = true;
    placements.forEach((placement, index) => {
      dummy.position.fromArray(placement.position);
      dummy.rotation.set(0, placement.yaw ?? 0, 0);
      dummy.scale.fromArray(placement.scale ?? [1, 1, 1]);
      dummy.updateMatrix();
      matrix.multiplyMatrices(dummy.matrix, local);
      mesh.setMatrixAt(index, matrix);
    });
    mesh.computeBoundingSphere();
    group.add(mesh);
    meshes.push(mesh);
  });
  return meshes;
}

/** Tests organic supports against every camera corridor, including overpasses. */
export function createSceneryClearance(track) {
  const frames = [];
  for (let s = 0; s < track.length; s += 6) frames.push(track.sample(s));
  return (points, radius = 4) => {
    const curve = new T.CatmullRomCurve3(points);
    const samples = curve.getSpacedPoints(
      Math.max(2, Math.ceil(curve.getLength() / 3)),
    );
    for (const p of samples)
      for (const f of frames) {
        const dx = p.x - f.position.x,
          dy = p.y - f.position.y,
          dz = p.z - f.position.z;
        if (Math.abs(dx) > 58 || Math.abs(dy) > 58 || Math.abs(dz) > 58)
          continue;
        const lateral = dx * f.right.x + dy * f.right.y + dz * f.right.z;
        const height = dx * f.up.x + dy * f.up.y + dz * f.up.z;
        const forward = dx * f.tangent.x + dy * f.tangent.y + dz * f.tangent.z;
        if (
          Math.abs(lateral) < track.width / 2 + 12 + radius &&
          height > -13 - radius &&
          height < 29 + radius &&
          Math.abs(forward) < 6 + radius
        )
          return false;
      }
    return true;
  };
}

// Static distant families share materials. Joining their cells keeps distinct
// silhouettes while avoiding a separate draw for every template/material pair.
export function consolidateStaticInstances(group) {
  const bins = new Map();
  const matrix = new T.Matrix4();
  const position = new T.Vector3();
  for (const mesh of [...group.children]) {
    if (!mesh.isInstancedMesh) continue;
    for (let i = 0; i < mesh.count; i++) {
      mesh.getMatrixAt(i, matrix);
      position.setFromMatrixPosition(matrix);
      const key = `${mesh.material.uuid}/${mesh.castShadow}/${Math.floor(position.x / 500)}/${Math.floor(position.z / 500)}`;
      if (!bins.has(key))
        bins.set(key, {
          parts: [],
          material: mesh.material,
          shadow: mesh.castShadow,
        });
      bins.get(key).parts.push(mesh.geometry.clone().applyMatrix4(matrix));
    }
    group.remove(mesh);
    mesh.dispose();
  }
  for (const { parts, material, shadow } of bins.values()) {
    const geometry = mergeGeometries(parts);
    parts.forEach((part) => part.dispose());
    const mesh = new T.Mesh(geometry, material);
    mesh.name = 'Vesper / spatially batched forest material';
    mesh.castShadow = shadow;
    mesh.receiveShadow = true;
    group.add(mesh);
  }
}
