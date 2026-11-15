import * as T from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { replaceShader } from '../renderer/shader-patch.js';
import {
  retainGeometry,
  releaseGeometry,
  retainInstances,
  releaseInstances,
  equalArray,
  equalGeometry,
} from './geometry-reuse.js';

// Campaign finish helpers are authored against static meshes. Supply physical
// instance coordinates and metre UVs without changing the campaign materials.
export function instanceFinish(material, repeat = null) {
  const finish = material.onBeforeCompile,
    cacheKey = material.customProgramCacheKey();
  material.onBeforeCompile = (shader, renderer) => {
    finish(shader, renderer);
    shader.vertexShader =
      `
vec3 editorWorldPoint(vec3 p){vec4 w=vec4(p,1.);
#ifdef USE_INSTANCING
w=instanceMatrix*w;
#endif
return (modelMatrix*w).xyz;}
vec2 editorMetreUV(vec3 p,vec3 n){
#ifdef USE_INSTANCING
p*=vec3(length(instanceMatrix[0].xyz),length(instanceMatrix[1].xyz),length(instanceMatrix[2].xyz));
#endif
return abs(n.y)>.5?p.xz:(abs(n.x)>.5?p.zy:p.xy);}
` +
      shader.vertexShader
        .replaceAll(
          '(modelMatrix*vec4(position,1.)).xyz',
          'editorWorldPoint(position)',
        )
        .replace('castUV=uv;', 'castUV=editorMetreUV(position,normal);');
    if (repeat !== null)
      shader.vertexShader = replaceShader(
        shader.vertexShader,
        '#include <uv_vertex>',
        `#include <uv_vertex>
#ifdef USE_MAP
vMapUv=editorMetreUV(position,normal)*${repeat.toFixed(6)};
#endif`,
      );
  };
  material.customProgramCacheKey = () => cacheKey + '-editor-instances-v1';
  material.needsUpdate = true;
}

export function createEditorOwner(
  name,
  preview = false,
  { previous = null, regional = false } = {},
) {
  const group = new T.Group();
  group.name = name;
  const geometries = new Set(),
    textures = new Set(),
    materials = new Set(),
    borrowed = [];
  const batches = new Map();
  const chunks = new Map();
  const geometryKinds = new Map(),
    geometryKeys = new WeakMap();
  const incremental = { reusedChunks: 0, rebuiltChunks: 0, reusedInstances: 0 };
  const addGeometry = (geometry) => {
    if (!geometries.has(geometry)) {
      geometries.add(geometry);
      retainGeometry(geometry);
    }
  };
  const box = new T.BoxGeometry(1, 1, 1);
  const formed = preview ? box : new RoundedBoxGeometry(1, 1, 1, 1, 0.04);
  addGeometry(box);
  addGeometry(formed);
  function geometryKey(geometry) {
    if (geometry === box) return 'box';
    if (geometry === formed) return 'formed';
    if (geometryKeys.has(geometry)) return geometryKeys.get(geometry);
    const key = geometry.type + JSON.stringify(geometry.parameters ?? 'custom');
    const family = geometryKinds.get(key) ?? [];
    let index = family.findIndex((value) => equalGeometry(value, geometry));
    if (index < 0) {
      index = family.length;
      family.push(geometry);
      geometryKinds.set(key, family);
    }
    const result = key + ':' + index;
    geometryKeys.set(geometry, result);
    return result;
  }
  function material(name, values, finish) {
    const result = new T.MeshStandardMaterial({ name, ...values });
    finish?.(result);
    if (finish) instanceFinish(result);
    materials.add(result);
    return result;
  }
  function solid(name, geometry, material, info, collectSolid) {
    addGeometry(geometry);
    const mesh = new T.Mesh(geometry, material);
    mesh.name = name;
    mesh.castShadow = mesh.receiveShadow = true;
    if (info?.kind === 'deck')
      mesh.userData.roadSurface = mesh.userData.drivingSurface = true;
    group.add(mesh);
    if (collectSolid && info) collectSolid({ name, geometry, ...info });
    return mesh;
  }
  function block(
    name,
    material,
    position,
    scale,
    quaternion = new T.Quaternion(),
    collectSolid,
    rounded = false,
  ) {
    const geometry = rounded ? formed : box;
    instance(
      name,
      geometry,
      material,
      position,
      scale,
      quaternion,
      collectSolid,
    );
  }
  function instance(
    name,
    geometry,
    material,
    position,
    scale,
    quaternion = new T.Quaternion(),
    collectSolid,
  ) {
    addGeometry(geometry);
    // Bounded spatial batches let a small road edit leave distant buffers live.
    // Legacy and road owners retain their former global material batches.
    const tile = regional
      ? `:${Math.floor(position.x / 8192)}:${Math.floor(position.z / 8192)}`
      : '';
    const geometryKind = geometryKey(geometry);
    const key = regional
      ? material.name + ':' + geometryKind + tile
      : material.uuid + ':' + geometry.uuid;
    let batch = batches.get(key);
    if (!batch) {
      batch = { material, geometry, list: [] };
      batches.set(key, batch);
    }
    const matrix = new T.Matrix4().compose(position, quaternion, scale);
    batch.list.push(matrix);
    if (collectSolid)
      collectSolid({ name, geometry, matrix, kind: 'structure' });
  }
  let finished = false;
  function finish() {
    if (finished) return;
    finished = true;
    const prior = previous?.chunks;
    // Each new owner borrows buffers, never an ancestor owner/lifetime chain.
    previous = null;
    for (const [key, { material, geometry, list }] of batches) {
      const values = new Float32Array(list.length * 16);
      list.forEach((matrix, i) => matrix.toArray(values, i * 16));
      const cached = prior?.get(key);
      const reusable =
        cached?.isInstancedMesh &&
        cached.material.name === material.name &&
        equalGeometry(cached.geometry, geometry) &&
        equalArray(cached.instanceMatrix.array, values);
      const mesh = new T.InstancedMesh(
        reusable ? cached.geometry : geometry,
        material,
        list.length,
      );
      mesh.name = material.name;
      if (reusable) {
        addGeometry(cached.geometry);
        mesh.instanceMatrix = cached.instanceMatrix;
        incremental.reusedChunks++;
        incremental.reusedInstances += list.length;
      } else {
        mesh.instanceMatrix.array.set(values);
        incremental.rebuiltChunks++;
      }
      retainInstances(mesh);
      mesh.castShadow = mesh.receiveShadow = true;
      group.add(mesh);
      chunks.set(key, mesh);
    }
    const solidIndices = new Map();
    for (const mesh of group.children.filter(
      (child) => child.isMesh && !child.isInstancedMesh,
    )) {
      const index = solidIndices.get(mesh.name) ?? 0;
      solidIndices.set(mesh.name, index + 1);
      const key = 'solid:' + mesh.name + ':' + index;
      const cached = prior?.get(key);
      if (
        cached &&
        cached.material.name === mesh.material.name &&
        equalGeometry(cached.geometry, mesh.geometry)
      ) {
        addGeometry(cached.geometry);
        mesh.geometry = cached.geometry;
        incremental.reusedChunks++;
      } else incremental.rebuiltChunks++;
      chunks.set(key, mesh);
    }
    const used = new Set(
      [...group.children]
        .filter((child) => child.isMesh)
        .map((mesh) => mesh.geometry),
    );
    for (const geometry of geometries) {
      if (!used.has(geometry) && geometry !== box && geometry !== formed) {
        geometries.delete(geometry);
        releaseGeometry(geometry);
      }
    }
    batches.clear();
    geometryKinds.clear();
  }
  const ownedTextures = () =>
    new Set([
      ...textures,
      ...borrowed.flatMap((part) => [...(part.ownedTextures ?? [])]),
    ]);
  // Shared renderer diagnostics include textures leased through shader hooks.
  group.userData.getOwnedTextures = ownedTextures;
  let disposed = false;
  return {
    group,
    material,
    solid,
    block,
    instance,
    finish,
    geometries,
    addGeometry,
    textures,
    get ownedTextures() {
      return ownedTextures();
    },
    materials,
    borrowed,
    chunks,
    incremental,
    isDisposed: () => disposed,
    setReflection(texture) {
      for (const m of materials) {
        m.envMap = texture;
        m.envMapIntensity = 0.7;
        m.needsUpdate = true;
      }
      for (const part of borrowed) part.setReflection?.(texture);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      // Borrowed kits own their descendants and instance buffers separately.
      for (const mesh of chunks.values())
        if (mesh.isInstancedMesh) releaseInstances(mesh);
      borrowed.forEach((part) => part.dispose());
      geometries.forEach(releaseGeometry);
      geometries.clear();
      chunks.clear();
      previous = null;
      batches.clear();
      geometryKinds.clear();
      textures.forEach((t) => t.dispose());
      textures.clear();
      borrowed.length = 0;
      materials.forEach((m) => m.dispose());
      group.clear();
    },
  };
}
