import * as T from 'three';

export const UP = new T.Vector3(0, 1, 0);

export function randomSequence(seed = 0x5aff204) {
  return () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}

/** Resources belong to this component even while an asset is still loading. */
export function createResources() {
  const geometries = new Set();
  const materials = new Set();
  const textures = new Set();
  let disposed = false;
  return {
    geometry(value) {
      if (disposed) value.dispose();
      else geometries.add(value);
      return value;
    },
    material(value) {
      if (disposed) value.dispose();
      else materials.add(value);
      return value;
    },
    collect(group) {
      group.traverse((object) => {
        if (object.geometry) {
          if (disposed) object.geometry.dispose();
          else geometries.add(object.geometry);
        }
        for (const material of [object.material].flat().filter(Boolean)) {
          if (disposed) material.dispose();
          else materials.add(material);
          for (const value of Object.values(material)) {
            if (!value?.isTexture) continue;
            if (disposed) value.dispose();
            else textures.add(value);
          }
        }
      });
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const geometry of geometries) geometry.dispose();
      for (const material of materials) material.dispose();
      for (const texture of textures) texture.dispose();
      geometries.clear();
      materials.clear();
      textures.clear();
    },
  };
}

/** Copy the scratch route sample. World scenery remains upright through banks. */
export function horizontalFrame(track, s) {
  const frame = track.sample(s);
  const forward = frame.tangent.clone().setY(0).normalize();
  if (forward.lengthSq() < 0.5) forward.set(0, 0, 1);
  const right = new T.Vector3().crossVectors(UP, forward).normalize();
  return {
    position: frame.position.clone(),
    forward,
    right,
    quaternion: new T.Quaternion().setFromRotationMatrix(
      new T.Matrix4().makeBasis(right, UP, forward),
    ),
  };
}

export function routePosition(track, s, lateral = 0, height = 0) {
  const frame = horizontalFrame(track, s);
  return frame.position
    .addScaledVector(frame.right, lateral)
    .addScaledVector(UP, height);
}

export function sectionRange(track, pattern, fallback) {
  const section = track.sections.find((entry) =>
    pattern.test(`${entry.id} ${entry.name}`),
  );
  return section
    ? [section.start, section.end]
    : fallback.map((value) => value * track.length);
}

export function instanced(group, name, geometry, material, transforms) {
  if (!transforms.length) return null;
  const mesh = new T.InstancedMesh(geometry, material, transforms.length);
  mesh.name = name;
  transforms.forEach((matrix, i) => mesh.setMatrixAt(i, matrix));
  mesh.instanceMatrix.needsUpdate = true;
  mesh.receiveShadow = true;
  mesh.castShadow = false;
  mesh.computeBoundingSphere();
  group.add(mesh);
  return mesh;
}

export function matrixAt(position, scale, quaternion = new T.Quaternion()) {
  return new T.Matrix4().compose(position, quaternion, scale);
}

export function beam(group, resources, name, a, b, radius, material) {
  const geometry = resources.geometry(
    new T.CylinderGeometry(radius, radius, a.distanceTo(b), 6),
  );
  const mesh = new T.Mesh(geometry, material);
  mesh.name = name;
  mesh.position.copy(a).add(b).multiplyScalar(0.5);
  mesh.quaternion.setFromUnitVectors(UP, b.clone().sub(a).normalize());
  group.add(mesh);
  return mesh;
}

export function countResources(group) {
  let meshes = 0;
  let triangles = 0;
  group.traverse((object) => {
    if (!object.isMesh) return;
    meshes += 1;
    triangles +=
      ((object.geometry.index?.count ??
        object.geometry.attributes.position.count) /
        3) *
      (object.isInstancedMesh ? object.count : 1);
  });
  return {
    meshCount: meshes,
    triangleCount: triangles,
    textures: 0,
    additionalRenderPasses: 0,
  };
}
