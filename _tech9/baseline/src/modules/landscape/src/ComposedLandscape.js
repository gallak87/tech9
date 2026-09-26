import * as THREE from 'three';
import {
  loadForestKit,
  loadForestTextures,
  prepareForestParts,
  disposeForestKit,
} from './forestAssets.js';
import { createForestFloorMaterial } from './forestFloor.js';
import { softenShadowSampling } from './softShadows.js';
const QUALITY_DENSITY = { balanced: 0.66, high: 1, ultra: 1.08 };
function terrainMaterial(textures) {
  const material = createForestFloorMaterial(textures, { vertexColors: true });
  const configureFloor = material.onBeforeCompile;
  material.onBeforeCompile = (shader) => {
    configureFloor(shader);
    shader.vertexShader = shader.vertexShader.replace(
      '#include <common>',
      '#include <common>\nattribute float trail;\nvarying float vTrail;\nvarying vec3 vTerrainPosition;',
    );
    shader.vertexShader = shader.vertexShader.replace(
      '#include <begin_vertex>',
      '#include <begin_vertex>\nvTrail = trail;\nvTerrainPosition = position;',
    );
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <common>',
      `#include <common>
      varying float vTrail;
      varying vec3 vTerrainPosition;
      float terrainNoise(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
    `,
    );
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <map_fragment>',
      `
      vec4 floorSample = texture2D(map, vMapUv);
      vec4 dirtSample = texture2D(pathTexture, vMapUv * 1.28 + vec2(0.213, 0.782));
      float edgeNoise = (floorSample.g - floorSample.r) * 2.0 + (floorSample.r - 0.3) * 0.36;
      float pathBlend = smoothstep(0.16, 0.88, vTrail + edgeNoise * (1.0 - abs(vTrail * 2.0 - 1.0)));
      diffuseColor *= mix(floorSample, dirtSample * vec4(1.46, 1.28, 1.07, 1.0), pathBlend);
      float soilMoisture = 0.9 + 0.1 * sin(vTerrainPosition.x * 0.39 + cos(vTerrainPosition.z * 0.17)) * sin(vTerrainPosition.z * 0.23);
      diffuseColor.rgb *= mix(1.0, soilMoisture, pathBlend);
    `,
    );
  };
  material.customProgramCacheKey = () => 'composed-forest-terrain-v1';
  return material;
}

function buildTerrain(textures, terrain) {
  const {
    bounds,
    segments: resolution,
    groundHeight,
    pathMask,
    tint,
  } = terrain;
  const geometry = new THREE.PlaneGeometry(
    bounds.maxX - bounds.minX,
    bounds.maxZ - bounds.minZ,
    resolution,
    resolution,
  );
  geometry.rotateX(-Math.PI / 2);
  geometry.translate(
    (bounds.minX + bounds.maxX) / 2,
    0,
    (bounds.minZ + bounds.maxZ) / 2,
  );
  const position = geometry.attributes.position;
  const uv = geometry.attributes.uv;
  const trail = new Float32Array(position.count);
  const colors = new Float32Array(position.count * 3);
  const shade = new THREE.Color();
  for (let i = 0; i < position.count; i++) {
    const x = position.getX(i);
    const z = position.getZ(i);
    position.setY(i, groundHeight(x, z));
    uv.setXY(i, x / 3.2, z / 3.2);
    trail[i] = THREE.MathUtils.clamp(pathMask(x, z), 0, 1);
    shade.fromArray(tint(x, z));
    shade.toArray(colors, i * 3);
  }
  geometry.setAttribute('trail', new THREE.BufferAttribute(trail, 1));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  const mesh = new THREE.Mesh(geometry, terrainMaterial(textures));
  mesh.name = 'Scanned forest floor and worn trail';
  mesh.receiveShadow = true;
  return mesh;
}

/** Bounded mesh batches keep culling useful without an entity system or per-object updates. */
function createBatches(
  group,
  geometry,
  material,
  entries,
  name,
  {
    chunkSize = 40,
    shadow = false,
    density = false,
    color = false,
    originX = 0,
    originZ = 0,
  } = {},
) {
  const chunks = new Map();
  for (const entry of entries) {
    const key = `${Math.floor((entry.x - originX) / chunkSize)}:${Math.floor((entry.z - originZ) / chunkSize)}`;
    if (!chunks.has(key)) chunks.set(key, []);
    chunks.get(key).push(entry);
  }
  const batches = [];
  for (const [key, instances] of chunks) {
    const mesh = new THREE.InstancedMesh(geometry, material, instances.length);
    mesh.name = `${name} ${key}`;
    mesh.castShadow = shadow;
    mesh.receiveShadow = true;
    mesh.userData.maxCount = instances.length;
    mesh.userData.baseCount = instances.filter(
      (instance) => !instance.reserve,
    ).length;
    mesh.userData.density = density;
    for (let i = 0; i < instances.length; i++) {
      const entry = instances[i];
      mesh.setMatrixAt(i, entry.matrix);
      if (color && entry.color) mesh.setColorAt(i, entry.color);
    }
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
    group.add(mesh);
    batches.push(mesh);
  }
  return batches;
}

/** Fixed authored placements; no default scene layout, second loop or renderer. */
export function createComposedLandscape({
  id = 'landscape',
  terrain,
  placements,
  assetURL,
} = {}) {
  if (
    !terrain?.bounds ||
    typeof terrain.groundHeight !== 'function' ||
    typeof terrain.pathMask !== 'function' ||
    typeof terrain.tint !== 'function' ||
    !Array.isArray(placements)
  )
    throw new TypeError(
      'Composed landscape requires terrain callbacks and placements.',
    );
  const { bounds } = terrain;
  if (
    !['minX', 'maxX', 'minZ', 'maxZ'].every((key) =>
      Number.isFinite(bounds[key]),
    ) ||
    bounds.maxX <= bounds.minX ||
    bounds.maxZ <= bounds.minZ
  )
    throw new RangeError('Invalid composed landscape bounds.');
  terrain = { ...terrain, segments: terrain.segments ?? 256 };
  if (
    !Number.isInteger(terrain.segments) ||
    terrain.segments < 1 ||
    terrain.segments > 1024
  )
    throw new RangeError('Terrain segments must be 1–1024.');
  const rootURL = assetURL ? new URL(String(assetURL), import.meta.url) : null;
  const group = new THREE.Group();
  group.name = 'Composed landscape';
  const resources = new Set(),
    densityBatches = [];
  let settings = { quality: 'high', richness: 1 },
    context,
    kit,
    ownedKit = false,
    initializing = false,
    disposed = false;
  const stats = {
    trees: 0,
    saplings: 0,
    batches: 0,
    terrainArea: (bounds.maxX - bounds.minX) * (bounds.maxZ - bounds.minZ),
    asset: 'Blender forest-kit.glb',
    vegetationInstances: 0,
  };
  const release = () => {
    group.removeFromParent();
    group.traverse((o) => {
      if (o.isInstancedMesh) o.dispose();
    });
    group.clear();
    resources.forEach((resource) => resource.dispose());
    resources.clear();
    densityBatches.length = 0;
    if (ownedKit) disposeForestKit(kit);
    kit = null;
  };
  const layer = {
    id,
    stats,
    getWeatherTargets() {
      const materials = new Map();
      group.traverse((o) => {
        if (o.isMesh)
          materials.set(o.material, {
            material: o.material,
            ...o.material.userData.weather,
          });
      });
      return [...materials.values()];
    },
    async init(value) {
      if (context || disposed)
        throw new Error(
          'Create a fresh composed landscape for each activation.',
        );
      if (!value?.scene || !value?.renderer)
        throw new TypeError('Composed landscape needs scene and renderer.');
      context = value;
      initializing = true;
      try {
        const supplied =
          value.assets instanceof Map
            ? value.assets.get('forestKit')
            : value.assets?.forestKit;
        kit = supplied
          ? supplied.scene || supplied
          : await loadForestKit(rootURL);
        ownedKit = !supplied;
        if (disposed) return;
        const textures = await loadForestTextures(context.renderer, rootURL);
        textures.forEach((texture) => resources.add(texture));
        if (disposed) return;
        const floor = buildTerrain(textures, terrain);
        resources.add(floor.geometry);
        resources.add(floor.material);
        softenShadowSampling(floor.material);
        group.add(floor);
        for (const placement of placements) {
          const { prototype, entries } = placement;
          if (!Array.isArray(entries))
            throw new TypeError('Placement entries must be an array.');
          const parts = prepareForestParts(kit, prototype, {
            grassBrightness: 1.58,
            transmission: true,
          });
          for (const { geometry, material, plant } of parts) {
            resources.add(geometry);
            resources.add(material);
            if (!material.userData.weather)
              material.userData.weather = {
                foliage: material.alphaTest > 0,
                snow:
                  material.alphaTest > 0
                    ? prototype.startsWith('pine_')
                      ? 0.61
                      : 0.34
                    : 1,
                wind: plant ? 0.7 : material.alphaTest > 0 ? 0.11 : 0,
              };
            softenShadowSampling(material);
            const made = createBatches(
              group,
              geometry,
              material,
              entries,
              prototype,
              { originX: bounds.minX, originZ: bounds.minZ, ...placement },
            );
            stats.batches += made.length;
            if (placement.density) densityBatches.push(...made);
          }
          if (['pine_a', 'pine_b', 'pine_c'].includes(prototype))
            stats.trees += entries.length;
          if (prototype === 'pine_sapling') stats.saplings += entries.length;
        }
        context.scene.add(group);
        context.renderer.shadowMap.needsUpdate = true;
        layer.configure(settings);
      } catch (error) {
        disposed = true;
        throw error;
      } finally {
        initializing = false;
        if (disposed) release();
      }
    },
    configure(patch = {}) {
      if (
        patch.quality !== undefined &&
        !Object.hasOwn(QUALITY_DENSITY, patch.quality)
      )
        throw new RangeError('Unknown landscape quality.');
      if (
        patch.richness !== undefined &&
        (!Number.isFinite(patch.richness) ||
          patch.richness < 0 ||
          patch.richness > 1.6)
      )
        throw new RangeError('Richness must be 0–1.6.');
      const changed =
        (patch.quality !== undefined && patch.quality !== settings.quality) ||
        (patch.richness !== undefined && patch.richness !== settings.richness);
      settings = { ...settings, ...patch };
      const ratio = QUALITY_DENSITY[settings.quality] * settings.richness;
      stats.vegetationInstances = 0;
      for (const mesh of densityBatches) {
        mesh.count = Math.max(
          1,
          Math.min(
            mesh.userData.maxCount,
            Math.round(mesh.userData.baseCount * ratio),
          ),
        );
        stats.vegetationInstances += mesh.count;
      }
      if (context && changed) context.renderer.shadowMap.needsUpdate = true;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      if (!initializing) release();
    },
  };
  return layer;
}
