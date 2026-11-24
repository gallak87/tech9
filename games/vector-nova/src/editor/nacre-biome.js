import * as T from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { assetURL } from '../assets/url.js';
import { createBatches } from '../levels/nacre/environment/geometry.js';
import { addObservatory } from '../levels/nacre/environment/observatory.js';
import { createNacreMaterials } from '../levels/nacre/environment/materials.js';
import { createNacreMineralSurface } from '../levels/nacre/environment/mineral-surface.js';
import { createNacreWater } from '../levels/nacre/environment/water.js';
import {
  sampleNacreWater,
  nacreWaterCrossingBlend,
} from '../levels/nacre/environment/atmosphere.js';
import { NACRE_OCEAN_PROFILE } from '../levels/nacre/environment/ocean-waves.js';
import { createAmbientClock } from '../presentation/ambient-clock.js';
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
  for (const [id, profile] of [
    [
      'headland',
      [
        [-48, -15, 148, 51, 53],
        [15, 10, 113, 60, 49],
        [57, -18, 68, 58, 67],
      ],
    ],
    [
      'seaStacks',
      [
        [-40, -20, 204, 36, 37],
        [13, 13, 157, 38, 43],
        [53, -15, 111, 32, 37],
      ],
    ],
  ]) {
    const batch = createBatches();
    batch.add(
      'shoreShelf',
      materials.basalt,
      [0, 10, 0],
      [168, 83, 127],
      [0, 0.2, 0],
      '#899a98',
    );
    for (const [x, z, height, width, depth] of profile)
      batch.add(
        x < 0 ? 'basaltA' : 'basaltB',
        materials.basalt,
        [x, height * 0.28, z],
        [width, height, depth],
        [0, x * 0.031, 0],
        '#9aaba6',
      );
    prototypes[id] = flattenNacreBatches(batch.finish('Nacre / ' + id));
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

/** Raise signature coast forms above the wave crests from the surveyed seabed.
 * The ordinary reef habitats can stay submerged or only surface occasionally. */
function placeCoastalLandmarks({ doc, track, placement, plan }, kit, open) {
  if (!track) return;
  const random = placement.random;
  const { density } = doc.settings;
  const crest =
    plan.oceanWaterY +
    NACRE_OCEAN_PROFILE.waves.reduce(
      (height, wave) => height + wave.amplitude * (1 + wave.sharpness),
      0,
    );
  const length = track.finishDistance ?? track.length;
  const firstSide = random() < 0.5 ? -1 : 1;
  function place(id, asset, station, side, top, initialScale) {
    if (track.isJumpProtected?.(station)) return false;
    const frame = track.sample(station);
    const forward = frame.tangent.clone().setY(0).normalize();
    if (forward.lengthSq() < 0.5) return false;
    const right = new T.Vector3(forward.z, 0, -forward.x);
    const yaw = Math.atan2(forward.x, forward.z) + (random() - 0.5) * 0.85;
    const size = kit.localBounds[asset].getSize(new T.Vector3());
    const minimumTop = Math.max(top, frame.position.y + (open ? 14 : 45));
    for (const sign of [side, -side])
      for (const offset of [210, 330, 465, 620]) {
        const { x, z } = frame.position
          .clone()
          .addScaledVector(right, sign * offset);
        const radius = Math.max(size.x, size.z) * initialScale * 0.26;
        const ground = Math.min(
          plan.surfaceHeight(x, z),
          plan.surfaceHeight(x - radius, z),
          plan.surfaceHeight(x + radius, z),
          plan.surfaceHeight(x, z - radius),
          plan.surfaceHeight(x, z + radius),
        );
        const scale = Math.max(
          initialScale,
          (minimumTop - ground + 10) / size.y,
        );
        if (scale > 3) continue;
        if (
          kit.emit(asset, {
            id,
            x,
            z,
            y: ground - 10,
            yaw,
            scale,
            embed: 0,
            decorative: asset !== 'observatory',
          })
        )
          return true;
      }
    return false;
  }
  // One high lens supplies a distinct navigational landmark for each seed.
  for (const f of [0.18, 0.26, 0.43, 0.65])
    if (
      place(
        'tide-observatory',
        'observatory',
        f * length,
        firstSide,
        crest + 240,
        1.2,
      )
    )
      break;
  const count = Math.min(
    open ? 8 : 18,
    Math.ceil(length / (open ? 1360 - 480 * density : 950 - 665 * density)),
  );
  for (let i = 0; i < count; i++) {
    const station = i + 0.33 + 0.32 * random();
    const asset = random() < (open ? 0.33 : 0.52) ? 'seaStacks' : 'headland';
    const top = crest + (asset === 'seaStacks' ? 125 : 58) + random() * 85;
    const scale = 1.25 + random() * 0.5;
    for (const shift of [0, 0.29, -0.29])
      if (
        place(
          'roadside-coast-' + i,
          asset,
          ((station + shift) / count) * length,
          (i % 2 ? -1 : 1) * firstSide,
          top,
          scale,
        )
      )
        break;
  }
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
    placeCoastalLandmarks(context, kit, open);
    planManufacturedSites(context, kit, {
      families: open ? ['reef', 'headland'] : ['reef', 'reef', 'headland'],
      limit: open ? 20 : 32,
      spacing: open ? 480 : 340,
    });
    // The civil survey intentionally has no dry districts across a seabed.
    // Small rooted reef habitats occupy that water region independently of
    // the road stations, instead of disappearing with its land-only parcels.
    const random = context.placement.random,
      bounds = context.plan.bounds;
    const habitatCount = Math.floor(
      (open ? 18 : 30) * context.doc.settings.density,
    );
    for (let i = 0; i < habitatCount; i++) {
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
    const oceanClock = createAmbientClock();
    const viewDirection = new T.Vector3();
    let water = null;
    if (!context.collectSolid) {
      water = createNacreWater(14000, waterY, {
        skyTexture: context.backdropAssets?.skyTexture,
        horizon: 400000,
      });
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
        if (!water) return;
        const quality = context.preview
          ? 'low'
          : (frame.settings?.quality ?? 'high');
        water.userData.setQuality(quality);
        const u = water.material.uniforms;
        u.time.value = frame.settings?.reducedMotion ? 0 : oceanClock(frame);
        const camera = frame.camera?.position;
        if (camera) {
          // Wave phase is world-space. Snap the dense mesh by whole cells so
          // short crests resolve around the viewer anywhere on a custom route.
          const { lowSpacing, highSpacing } = NACRE_OCEAN_PROFILE.mesh;
          const step = quality === 'low' ? lowSpacing : highSpacing;
          // An overview camera can stand kilometres behind the visible road.
          // Aim the fine grid at the visible sea, with bounded look-ahead at the horizon.
          frame.camera.getWorldDirection(viewDirection);
          const height = waterY - camera.y;
          const reach =
            Math.abs(viewDirection.y) > 0.01
              ? T.MathUtils.clamp(
                  height / viewDirection.y,
                  0,
                  Math.abs(height) * 2.5,
                )
              : 0;
          water.position.x =
            Math.round((camera.x + reach * viewDirection.x) / step) * step;
          water.position.z =
            Math.round((camera.z + reach * viewDirection.z) / step) * step;
          u.wetness.value = sampleNacreWater(camera.y, waterY).submerged;
          u.nearSurface.value = nacreWaterCrossingBlend(camera.y, waterY);
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
