import * as T from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { assetURL } from '../assets/url.js';
import { createBatches } from '../levels/nacre/environment/geometry.js';
import { addObservatory } from '../levels/nacre/environment/observatory.js';
import { createNacreMaterials } from '../levels/nacre/environment/materials.js';
import { createNacreMineralSurface } from '../levels/nacre/environment/mineral-surface.js';
import { createNacreWater } from '../levels/nacre/environment/water.js';
import {
  createProceduralAssemblies,
  planManufacturedSites,
} from './procedural-assemblies.js';

/** Bake canonical local instance transforms/colors into one immutable local
 * mesh per material. No source library scene or instance is moved or reused. */
export function flattenNacreBatches(group) {
  const result = new T.Group(),
    oldGeometries = new Set();
  group.updateMatrixWorld(true);
  group.traverse((source) => {
    if (!source.isMesh) return;
    oldGeometries.add(source.geometry);
    const count = source.isInstancedMesh ? source.count : 1,
      parts = [];
    for (let i = 0; i < count; i++) {
      const geometry = source.geometry.clone(),
        matrix = new T.Matrix4();
      if (source.isInstancedMesh) source.getMatrixAt(i, matrix);
      matrix.premultiply(source.matrixWorld);
      geometry.applyMatrix4(matrix);
      const position = geometry.attributes.position,
        oldColors = geometry.attributes.color;
      const color = new T.Color(1, 1, 1);
      if (source.instanceColor) source.getColorAt(i, color);
      const colors = new Float32Array(position.count * 3),
        tissue = new Float32Array(position.count);
      for (let vertex = 0; vertex < position.count; vertex++) {
        const r = oldColors?.getX(vertex) ?? 1,
          g = oldColors?.getY(vertex) ?? 1,
          b = oldColors?.getZ(vertex) ?? 1;
        tissue[vertex] = g;
        colors.set([r * color.r, g * color.g, b * color.b], vertex * 3);
      }
      geometry.setAttribute('color', new T.BufferAttribute(colors, 3));
      geometry.setAttribute(
        'nacreSourceTissueTone',
        new T.BufferAttribute(tissue, 1),
      );
      parts.push(geometry);
    }
    const geometry = mergeGeometries(parts, false);
    parts.forEach((part) => part.dispose());
    if (!geometry)
      throw new Error('Canonical reef parts could not be flattened');
    const mesh = new T.Mesh(geometry, source.material);
    mesh.name = source.name;
    result.add(mesh);
    if (source.isInstancedMesh) source.dispose();
  });
  oldGeometries.forEach((geometry) => geometry.dispose());
  group.clear();
  return result;
}

function nacreSource(context, waterY) {
  const time = { value: 0 };
  const loader = new T.TextureLoader();
  const mineral =
    context.renderer && !context.collectSolid
      ? createNacreMineralSurface({
          loadTexture: (_url, kind) =>
            loader.loadAsync(
              assetURL(
                kind === 'color'
                  ? 'assets/editor/surfaces/forest-granite-diff.jpg'
                  : 'assets/editor/surfaces/rock-boulder-normal-1k.jpg',
              ),
            ),
        })
      : null;
  const materials = createNacreMaterials(time, waterY, {
    mineralSurface: mineral,
  });
  for (const key of [
    'fan',
    'fanEdge',
    'ribbon',
    'kelp',
    'glow',
    'amber',
    'coral',
    'warmCoral',
  ])
    materials[key].userData.editorVisualOnly = true;
  // Canonical calcareous shading derives tissue tone before instance tint;
  // flattening preserves that independent scalar in an explicit attribute.
  const originalFinish = materials.reefCoral.onBeforeCompile,
    originalKey = materials.reefCoral.customProgramCacheKey();
  materials.reefCoral.onBeforeCompile = (shader, renderer) => {
    originalFinish(shader, renderer);
    shader.vertexShader =
      'attribute float nacreSourceTissueTone;\n' +
      shader.vertexShader.replace(
        'nacreTissueTone=color.g;',
        'nacreTissueTone=nacreSourceTissueTone;',
      );
  };
  materials.reefCoral.customProgramCacheKey = () =>
    originalKey + '-editor-flattened-tissue';
  const prototypes = {};
  {
    const batch = createBatches();
    batch.add(
      'shoreShelf',
      materials.basalt,
      [0, 10, 0],
      [145, 90, 120],
      [0, 0.2, 0],
      '#899a98',
    );
    for (const [x, z, height] of [
      [-35, -15, 170],
      [24, 10, 115],
      [50, -22, 75],
    ])
      batch.add(
        x < 0 ? 'basaltA' : 'basaltB',
        materials.basalt,
        [x, height * 0.28, z],
        [43, height, 42],
        [0, x * 0.031, 0],
        '#9aaba6',
      );
    prototypes.headland = flattenNacreBatches(
      batch.finish('Nacre / rooted basalt headland'),
    );
  }
  {
    const batch = createBatches();
    batch.add(
      'reefShelf',
      materials.basalt,
      [0, -20, 0],
      [88, 40, 82],
      [0, 0.2, 0],
      '#718d84',
    );
    for (const [i, [x, z]] of [
      [-35, -20],
      [-10, 28],
      [33, -12],
      [38, 31],
    ].entries()) {
      const ground =
        batch.surface(
          'reefShelf',
          [0, -20, 0],
          [88, 40, 82],
          [0, 0.2, 0],
          x,
          z,
        ) ?? -12;
      batch.add(
        'reefRoot',
        materials.reefCoral,
        [x, ground + 4, z],
        [17, 46, 16],
        [0, i * 1.7, 0],
        '#b6c7a3',
      );
      batch.add(
        'reefSponge',
        materials.reefCoral,
        [x + 5, ground + 27, z],
        [17, 22, 15],
        [0, i * 1.7, 0],
        '#a8c2a2',
      );
      batch.add(
        'canopyFan',
        materials.fan,
        [x, ground + 37, z],
        [42 + i * 3, 52, 27],
        [0, i * 1.6, 0.05],
        '#98d1b8',
      );
      batch.add(
        'ribbon',
        materials.ribbon,
        [x + 8, ground + 30, z + 7],
        [16, 44, 15],
        [0, i * 1.1, 0],
        '#a394bd',
      );
    }
    prototypes.reef = flattenNacreBatches(
      batch.finish('Nacre / living reef shelf'),
    );
  }
  {
    const batch = createBatches();
    addObservatory(batch, materials, new T.Vector3(), 0, -75);
    prototypes.observatory = flattenNacreBatches(
      batch.finish('Nacre / tidal observatory'),
    );
  }
  const geometries = new Set();
  Object.values(prototypes).forEach((group) =>
    group.traverse((node) => {
      if (!node.geometry) return;
      geometries.add(node.geometry);
      // Basalt shelves/spires and the observatory's actual piers/body/roof keep
      // exact contact. Soft porous growth, pressure glazing and narrow trim do
      // not add expensive off-road collision to every scenic reef habitat.
      if (
        /\/\s*(reefRoot|reefSponge|observatoryRim|ring|lens)\s*\//.test(
          node.name,
        )
      )
        node.userData.editorCollisionGeometry = false;
    }),
  );
  return {
    prototypes,
    maxContactFaces: 90000,
    ready: mineral?.ready,
    get ownedTextures() {
      return new Set([mineral?.color, mineral?.normal].filter(Boolean));
    },
    update(frame) {
      time.value = frame.time ?? 0;
    },
    dispose() {
      geometries.forEach((g) => g.dispose());
      Object.values(materials).forEach((m) => m.dispose());
      mineral?.dispose();
    },
  };
}

export const nacreBiomeDescriptor = {
  name: 'Nacre living reef and ocean',
  limit: 85,
  waterEnabled: false,
  farGround: false,
  build(context) {
    const waterY = context.plan.oceanWaterY;
    if (!Number.isFinite(waterY))
      throw new Error(
        'Nacre production scenery needs its surveyed ocean datum',
      );
    const kit = createProceduralAssemblies(
      context,
      nacreSource(context, waterY),
    );
    const open = context.doc.settings.sceneryPreset.includes('open-water');
    planManufacturedSites(context, kit, {
      families: open
        ? ['headland', 'headland', 'reef', 'observatory']
        : ['reef', 'headland', 'reef', 'observatory'],
      limit: open ? 35 : 50,
      spacing: 240,
    });
    // The civil survey intentionally has no dry districts across a seabed.
    // Small rooted reef habitats occupy that water region independently of
    // the road stations, instead of disappearing with its land-only parcels.
    const random = context.placement.random,
      bounds = context.plan.bounds;
    for (let i = 0; i < (open ? 18 : 30); i++) {
      const x = T.MathUtils.lerp(
        bounds.min.x,
        bounds.max.x,
        0.1 + random() * 0.8,
      );
      const z = T.MathUtils.lerp(
        bounds.min.z,
        bounds.max.z,
        0.1 + random() * 0.8,
      );
      kit.emit(i % 5 === 0 ? 'headland' : 'reef', {
        id: 'reef-habitat-' + i,
        x,
        z,
        yaw: random() * Math.PI * 2,
        scale: 0.6 + random() * 0.35,
      });
    }
    const group = new T.Group();
    let water = null;
    if (!context.collectSolid) {
      const size =
        Math.max(bounds.max.x - bounds.min.x, bounds.max.z - bounds.min.z) +
        18000;
      water = createNacreWater(size, waterY, { track: null });
      water.position.x = (bounds.min.x + bounds.max.x) / 2;
      water.position.z = (bounds.min.z + bounds.max.z) / 2;
      water.userData.editorOcean = true;
      water.userData.editorWaterY = waterY;
      water.userData.editorVisualOnly = true;
      water.userData.setQuality(context.preview ? 'low' : 'high');
      group.add(water);
    }
    let disposed = false;
    return {
      group,
      ready: kit.ready,
      get ownedTextures() {
        const textures = new Set(kit.ownedTextures);
        for (const uniform of Object.values(water?.material.uniforms ?? {}))
          if (uniform?.value?.isTexture) textures.add(uniform.value);
        return textures;
      },
      update(frame) {
        kit.update(frame);
        if (water) {
          water.material.uniforms.time.value = frame.time ?? 0;
          water.userData.setQuality(
            context.preview ? 'low' : (frame.settings?.quality ?? 'high'),
          );
        }
      },
      dispose() {
        if (disposed) return;
        disposed = true;
        kit.dispose();
        if (water) {
          water.userData.dispose();
          water.userData.geometries.forEach((geometry) => geometry.dispose());
          water.material.dispose();
        }
        group.clear();
      },
    };
  },
};
