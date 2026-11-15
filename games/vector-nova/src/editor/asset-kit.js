import * as T from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const defaultLoadAsset = (url) => new GLTFLoader().loadAsync(url);
const defaultLoadTexture = (url) => new T.TextureLoader().loadAsync(url);
const canceled = () =>
  new DOMException('Editor asset kit canceled', 'AbortError');

function sourceResources(value) {
  const geometries = new Set(),
    materials = new Set(),
    textures = new Set();
  if (value?.isTexture) textures.add(value);
  value?.scene?.traverse((node) => {
    if (node.geometry) geometries.add(node.geometry);
    for (const material of [node.material].flat().filter(Boolean)) {
      materials.add(material);
      for (const item of Object.values(material))
        if (item?.isTexture) textures.add(item);
    }
  });
  return { geometries, materials, textures };
}

/** Retain parsed CPU sources while overlapping editor owners share immutable
 * geometry. No cached texture object is ever exposed to a quality budget. */
export function createAssetSourceCache({ maxEntries = 32 } = {}) {
  const entries = new Map();
  let clock = 0;
  function releaseGPU(entry) {
    entry.resources?.geometries.forEach((resource) => resource.dispose());
    entry.resources?.materials.forEach((resource) => resource.dispose());
    entry.resources?.textures.forEach((resource) => resource.dispose());
  }
  function trim() {
    const idle = [...entries]
      .filter(([, e]) => !e.refs && e.value)
      .sort((a, b) => a[1].used - b[1].used);
    for (const [key, entry] of idle) {
      if (entries.size <= maxEntries) break;
      entries.delete(key);
      for (const texture of entry.resources.textures) texture.image?.close?.();
    }
  }
  return {
    async acquire(key, load) {
      let entry = entries.get(key);
      if (!entry) {
        entry = { refs: 0, used: ++clock };
        entries.set(key, entry);
        entry.promise = Promise.resolve()
          .then(load)
          .then(
            (value) => {
              entry.value = value;
              entry.resources = sourceResources(value);
              return value;
            },
            (error) => {
              entries.delete(key);
              throw error;
            },
          );
      }
      entry.refs++;
      entry.used = ++clock;
      let released = false;
      const release = () => {
        if (released) return;
        released = true;
        entry.refs--;
        entry.used = ++clock;
        if (!entry.refs && entry.value) releaseGPU(entry);
        trim();
      };
      try {
        const value = await entry.promise;
        return { value, release };
      } catch (error) {
        release();
        throw error;
      }
    },
    get size() {
      return entries.size;
    },
  };
}

const sharedCache = createAssetSourceCache();

function localBounds(asset) {
  if (
    !Array.isArray(asset.bounds) ||
    asset.bounds.length !== 2 ||
    asset.bounds.some(
      (p) =>
        !Array.isArray(p) ||
        p.length !== 3 ||
        p.some((n) => !Number.isFinite(n)),
    )
  )
    throw new TypeError('Editor asset needs finite local bounds');
  const bounds = new T.Box3(
    new T.Vector3(...asset.bounds[0]),
    new T.Vector3(...asset.bounds[1]),
  );
  if (bounds.isEmpty()) throw new TypeError('Editor asset bounds are empty');
  return bounds;
}

/** Bounds are trusted baked metadata, available before asynchronous art loads. */
export function assetKitBounds(asset, matrix = new T.Matrix4()) {
  return localBounds(asset).applyMatrix4(matrix);
}

function cloneTexture(source) {
  const texture = source.clone();
  // Texture.clone shares Source, whose mutable data is changed by Low quality.
  // Keep the immutable image bytes but give every owner its own Source/mips.
  texture.source = new T.TextureSource(source.source.data);
  texture.mipmaps = source.mipmaps.map((mip) => ({ ...mip }));
  texture.needsUpdate = true;
  return texture;
}

/** Static production art adapted to deterministic editor placement records.
 * CPU collision never waits on graphics: only explicit baked faces are solid. */
export function createAssetKit({
  name = 'Editor production asset kit',
  assets,
  placements,
  textures: textureURLs = {},
  configureTexture = null,
  finishMaterial = null,
  collectSolid = null,
  loadAsset = defaultLoadAsset,
  loadTexture = defaultLoadTexture,
  cache = sharedCache,
  tileSize = 8192,
  signal = null,
}) {
  const group = new T.Group();
  group.name = name;
  const records = placements.map((record) => {
    const asset = assets[record.asset];
    if (!asset || typeof asset.url !== 'string')
      throw new TypeError('Unknown editor asset: ' + record.asset);
    localBounds(asset);
    if (
      !record.matrix?.isMatrix4 ||
      record.matrix.elements.some((n) => !Number.isFinite(n))
    )
      throw new TypeError('Editor asset placement needs a finite matrix');
    return { ...record, matrix: record.matrix.clone() };
  });
  if (!(tileSize > 0) || !Number.isFinite(tileSize))
    throw new TypeError('Invalid editor asset tile size');
  const materials = new Set(),
    ownedTextures = new Set(),
    proxyGeometries = new Set();
  const textureCopies = new Map(),
    leases = [],
    textures = {};
  let disposed = false,
    reflection = null;
  const copyTexture = (source) => {
    if (!textureCopies.has(source)) {
      const texture = cloneTexture(source);
      textureCopies.set(source, texture);
      ownedTextures.add(texture);
    }
    return textureCopies.get(source);
  };
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    signal?.removeEventListener('abort', dispose);
    group.traverse((node) => {
      if (node.isInstancedMesh) node.dispose();
    });
    materials.forEach((material) => material.dispose());
    ownedTextures.forEach((texture) => texture.dispose());
    proxyGeometries.forEach((geometry) => geometry.dispose());
    leases.splice(0).forEach((lease) => lease.release());
    materials.clear();
    ownedTextures.clear();
    proxyGeometries.clear();
    textureCopies.clear();
    for (const key of Object.keys(textures)) delete textures[key];
    group.clear();
  };
  const setReflection = (texture) => {
    if (disposed) return;
    reflection = texture;
    for (const material of materials) {
      if (!material.isMeshStandardMaterial) continue;
      material.envMap = texture;
      material.envMapIntensity = 0.7;
      material.needsUpdate = true;
    }
  };
  group.userData.getOwnedTextures = () => new Set(ownedTextures);
  const owner = {
    group,
    textures,
    materials,
    ownedTextures,
    dispose,
    setReflection,
    isDisposed: () => disposed,
    ready: null,
  };
  if (collectSolid) {
    const proxies = new Map();
    try {
      for (const record of records) {
        if (record.solid === false) continue;
        const faces = assets[record.asset].triangles;
        if (!faces?.length) continue;
        if (!proxies.has(record.asset)) {
          if (
            faces.some(
              (face) =>
                face.length !== 3 ||
                face.some(
                  (p) => p.length !== 3 || p.some((n) => !Number.isFinite(n)),
                ),
            )
          )
            throw new TypeError(
              'Editor collision proxy needs finite triangle faces',
            );
          const geometry = new T.BufferGeometry();
          geometry.setAttribute(
            'position',
            new T.Float32BufferAttribute(faces.flat(2), 3),
          );
          proxyGeometries.add(geometry);
          proxies.set(record.asset, geometry);
        }
        collectSolid({
          name: `${name} / ${record.id}`,
          geometry: proxies.get(record.asset),
          matrix: record.matrix.clone(),
          kind: 'structure',
          asset: record.asset,
        });
      }
    } catch (error) {
      dispose();
      throw error;
    }
    owner.ready = Promise.resolve();
    return owner;
  }
  signal?.addEventListener('abort', dispose, { once: true });
  if (signal?.aborted) dispose();
  const acquire = async (key, load) => {
    const lease = await cache.acquire(key, load);
    if (disposed) {
      lease.release();
      throw canceled();
    }
    leases.push(lease);
    return lease.value;
  };
  const ids = [...new Set(records.map((record) => record.asset))];
  owner.ready = (async () => {
    if (disposed) throw canceled();
    const jobs = [
      ...ids.map((id) =>
        acquire('asset:' + assets[id].url, () => loadAsset(assets[id].url)),
      ),
      ...Object.values(textureURLs).map((url) =>
        acquire('texture:' + url, () => loadTexture(url)),
      ),
    ];
    const loaded = await Promise.allSettled(jobs);
    const failure = loaded.find((result) => result.status === 'rejected');
    if (failure || disposed) {
      dispose();
      throw failure?.reason ?? canceled();
    }
    try {
      Object.keys(textureURLs).forEach((key, index) => {
        textures[key] = copyTexture(loaded[ids.length + index].value);
        configureTexture?.(textures[key], key);
      });
      for (const [index, id] of ids.entries()) {
        const source = loaded[index].value.scene;
        if (!source?.isObject3D)
          throw new TypeError('Editor asset has no scene: ' + id);
        source.updateMatrixWorld(true);
        const expected = localBounds(assets[id]).expandByScalar(0.02);
        const actual = new T.Box3().setFromObject(source);
        if (!expected.containsBox(actual))
          throw new Error('Editor asset exceeds its baked bounds: ' + id);
        const copies = new Map(),
          batches = new Map();
        for (const record of records.filter((record) => record.asset === id)) {
          const e = record.matrix.elements;
          const key = `${Math.floor(e[12] / tileSize)}:${Math.floor(e[14] / tileSize)}`;
          if (!batches.has(key)) batches.set(key, []);
          batches.get(key).push(record);
        }
        const copyMaterial = (sourceMaterial) => {
          if (copies.has(sourceMaterial)) return copies.get(sourceMaterial);
          const material = sourceMaterial.clone();
          materials.add(material);
          for (const [key, value] of Object.entries(sourceMaterial))
            if (value?.isTexture) material[key] = copyTexture(value);
          finishMaterial?.(material, id, textures);
          copies.set(sourceMaterial, material);
          return material;
        };
        source.traverseVisible((node) => {
          if (!node.isMesh) return;
          if (
            node.isSkinnedMesh ||
            Object.keys(node.geometry.morphAttributes).length
          )
            throw new Error(
              'Editor static kit cannot instance animated geometry: ' + id,
            );
          const material = Array.isArray(node.material)
            ? node.material.map(copyMaterial)
            : copyMaterial(node.material);
          for (const [tile, batch] of batches) {
            const mesh = new T.InstancedMesh(
              node.geometry,
              material,
              batch.length,
            );
            mesh.name = `${name} / ${id} / ${node.name} / ${tile}`;
            mesh.castShadow = assets[id].castShadow !== false;
            mesh.receiveShadow = true;
            mesh.userData.editorAsset = id;
            mesh.userData.placementIds = batch.map((record) => record.id);
            batch.forEach((record, i) =>
              mesh.setMatrixAt(
                i,
                new T.Matrix4().multiplyMatrices(
                  record.matrix,
                  node.matrixWorld,
                ),
              ),
            );
            mesh.computeBoundingBox();
            mesh.computeBoundingSphere();
            group.add(mesh);
          }
        });
      }
      if (reflection) setReflection(reflection);
    } catch (error) {
      dispose();
      throw error;
    }
  })();
  return owner;
}
