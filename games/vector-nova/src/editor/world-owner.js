import * as T from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { replaceShader } from '../renderer/shader-patch.js';

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

export function createEditorOwner(name, preview = false) {
  const group = new T.Group();
  group.name = name;
  const geometries = new Set(),
    textures = new Set(),
    materials = new Set(),
    borrowed = [];
  const batches = new Map();
  const box = new T.BoxGeometry(1, 1, 1);
  const formed = preview ? box : new RoundedBoxGeometry(1, 1, 1, 1, 0.04);
  geometries.add(box);
  geometries.add(formed);
  function material(name, values, finish) {
    const result = new T.MeshStandardMaterial({ name, ...values });
    finish?.(result);
    if (finish) instanceFinish(result);
    materials.add(result);
    return result;
  }
  function solid(name, geometry, material, info, collectSolid) {
    geometries.add(geometry);
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
    geometries.add(geometry);
    const key = material.uuid + ':' + geometry.uuid;
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
  function finish() {
    for (const { material, geometry, list } of batches.values()) {
      const mesh = new T.InstancedMesh(geometry, material, list.length);
      mesh.name = material.name;
      list.forEach((matrix, i) => mesh.setMatrixAt(i, matrix));
      mesh.castShadow = mesh.receiveShadow = true;
      group.add(mesh);
    }
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
    textures,
    get ownedTextures() {
      return ownedTextures();
    },
    materials,
    borrowed,
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
      group.traverse((o) => {
        if (o.isInstancedMesh) o.dispose();
      });
      borrowed.forEach((part) => part.dispose());
      geometries.forEach((g) => g.dispose());
      textures.forEach((t) => t.dispose());
      textures.clear();
      borrowed.length = 0;
      materials.forEach((m) => m.dispose());
      group.clear();
    },
  };
}
