import * as T from 'three';
import { createEditorOwner } from './world-owner.js';
import { createRegionPlan } from './region-plan.js';
import { buildRegionEnvironment } from './region-environment.js';
import { createFarGroundGeometry } from './far-ground.js';
import { createRouteClearance } from '../environment/placement.js';
import { editorBiome } from './biomes.js';
import {
  createAssetKit,
  assetKitBounds,
  loadEditorStaticAsset,
} from './asset-kit.js';

const UP = new T.Vector3(0, 1, 0);
function randomFor(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let v = Math.imul(state ^ (state >>> 15), 1 | state);
    v ^= v + Math.imul(v ^ (v >>> 7), 61 | v);
    return ((v ^ (v >>> 14)) >>> 0) / 4294967296;
  };
}

/** Shared CPU placement contract for immutable production art and procedural
 * assemblies. Reservations are accepted before any visible or physical emit. */
export function createProductionPlacement(
  doc,
  track,
  plan,
  { assets = {}, limit = 180, margin = 0 } = {},
) {
  const native = track
    ? createRouteClearance(track, {
        spacing: 8,
        sidePadding: 30,
        localVertical: [-22, 44],
      }).clears
    : () => true;
  const placements = [],
    accepted = [],
    occupied = [];
  const familySeed = [...doc.biome].reduce(
    (seed, character) => Math.imul(seed ^ character.charCodeAt(0), 16777619),
    plan.seed,
  );
  const random = randomFor(familySeed);
  function clears(value) {
    const bounds = value.clone().expandByScalar(margin);
    if (
      bounds.isEmpty() ||
      [...bounds.min.toArray(), ...bounds.max.toArray()].some(
        (n) => !Number.isFinite(n),
      )
    )
      return false;
    const centre = bounds.getCenter(new T.Vector3()),
      size = bounds.getSize(new T.Vector3());
    if (!(size.x > 0 && size.z > 0)) return false;
    return (
      plan.clears(
        centre.x,
        centre.z,
        size.x,
        size.z,
        bounds.max.y,
        0,
        bounds.min.y,
      ) &&
      native(centre.x, centre.z, size.x, size.z, bounds.max.y, 0, bounds.min.y)
    );
  }
  function acceptBounds(bounds, info = {}) {
    if (accepted.length >= limit || !clears(bounds)) return false;
    if (!info.overlap && occupied.some((other) => other.intersectsBox(bounds)))
      return false;
    const centre = bounds.getCenter(new T.Vector3());
    const distance = plan.roadSamples?.length
      ? Math.sqrt(
          plan.roadSamples.reduce(
            (best, p) =>
              Math.min(best, (p.x - centre.x) ** 2 + (p.z - centre.z) ** 2),
            Infinity,
          ),
        )
      : Infinity;
    const details = { ...info };
    delete details.matrix;
    accepted.push({
      ...details,
      x: centre.x,
      y: bounds.min.y,
      z: centre.z,
      lod:
        info.lod ?? (distance < 550 ? 'near' : distance < 1400 ? 'mid' : 'far'),
      bounds: { min: bounds.min.toArray(), max: bounds.max.toArray() },
    });
    if (!info.overlap) occupied.push(bounds.clone());
    return true;
  }
  function add(record) {
    const asset = assets[record.asset];
    if (!asset)
      throw new Error('Unknown registered production asset: ' + record.asset);
    if (
      !record.matrix?.isMatrix4 ||
      record.matrix.elements.some((n) => !Number.isFinite(n))
    )
      throw new Error('Production placement needs a finite matrix');
    const bounds = assetKitBounds(asset, record.matrix);
    if (!acceptBounds(bounds, record)) return false;
    const result = { ...record, matrix: record.matrix.clone(), bounds };
    placements.push(result);
    return result;
  }
  function place(
    assetId,
    {
      id = assetId + '-' + placements.length,
      x,
      z,
      y = null,
      yaw = 0,
      quaternion = null,
      scale = 1,
      embed = 0.2,
      solid = true,
      overlap = false,
      lod,
    } = {},
  ) {
    const asset = assets[assetId];
    if (!asset)
      throw new Error('Unknown registered production asset: ' + assetId);
    const [min, max] = asset.bounds;
    const size = scale?.isVector3
      ? scale.clone()
      : Array.isArray(scale)
        ? new T.Vector3(...scale)
        : new T.Vector3().setScalar(scale);
    const rotation =
      quaternion?.clone() ?? new T.Quaternion().setFromAxisAngle(UP, yaw);
    const local = new T.Matrix4()
      .compose(new T.Vector3(), rotation, size)
      .multiply(
        new T.Matrix4().makeTranslation(
          -(min[0] + max[0]) / 2,
          -min[1],
          -(min[2] + max[2]) / 2,
        ),
      );
    const transformed = assetKitBounds(asset, local),
      height = transformed.max.y - transformed.min.y;
    const radius =
      Math.max(
        transformed.max.x - transformed.min.x,
        transformed.max.z - transformed.min.z,
      ) / 2;
    const ground =
      y ??
      Math.min(
        plan.surfaceHeight(x, z),
        plan.surfaceHeight(x - radius * 0.45, z),
        plan.surfaceHeight(x + radius * 0.45, z),
        plan.surfaceHeight(x, z - radius * 0.45),
        plan.surfaceHeight(x, z + radius * 0.45),
      );
    // Rotate first, then seat the actual transformed minimum. Tilted/fallen
    // assemblies therefore never inherit a yaw-only grounding assumption.
    local.premultiply(
      new T.Matrix4().makeTranslation(
        x,
        ground - transformed.min.y - height * embed,
        z,
      ),
    );
    return add({ id, asset: assetId, matrix: local, solid, overlap, lod });
  }
  return {
    placements,
    accepted,
    random,
    clears,
    acceptBounds,
    add,
    place,
    surfaceHeight: plan.surfaceHeight,
    waterHeight: plan.waterHeight,
  };
}

/** Own common surveyed land and a production kit without importing a campaign
 * route, mechanism or lifetime. Custom builders share this same clearance API. */
export function createProductionEnvironment(
  doc,
  track,
  {
    descriptor,
    renderer = null,
    backdropAssets,
    plan = null,
    collectSolid = null,
    preview = false,
    previous = null,
  } = {},
) {
  if (!descriptor)
    throw new Error('A production environment descriptor is required');
  plan ??= createRegionPlan(doc, track);
  const biome = editorBiome(doc.biome),
    profile = biome.environment;
  const name = descriptor.name ?? biome.label;
  const owner = createEditorOwner(
    'Editor / ' + name + ' production world',
    preview,
    { previous, regional: true },
  );
  const placement = createProductionPlacement(doc, track, plan, {
    assets: descriptor.assets,
    limit: descriptor.limit ?? 180,
    margin: descriptor.clearanceMargin ?? 0,
  });
  const context = {
    doc,
    track,
    plan,
    owner,
    placement,
    collectSolid,
    preview,
    renderer,
    backdropAssets,
  };
  let finish, part, kit;
  const borrow = (value) => {
    if (!value || value === owner) return;
    if (value.then)
      throw new Error(
        'Production builders return a synchronous owner with an async ready promise',
      );
    owner.borrowed.push(value);
    if (value.group && value.group !== owner.group)
      owner.group.add(value.group);
  };
  try {
    finish = collectSolid ? null : descriptor.createFinish?.(context);
    context.finish = finish;
    borrow(finish);
    const soil = owner.material(name + ' / surveyed terrain', {
      color: profile.terrain,
      roughness: 0.94,
    });
    const concrete = owner.material(name + ' / structural ground', {
      color: profile.structure,
      roughness: 0.8,
    });
    const water = owner.material(name + ' / regional water', {
      color: profile.water,
      roughness: 0.25,
      metalness: 0.2,
    });
    const materials = {
      soil,
      concrete,
      paving: concrete,
      roof: concrete,
      occupied: concrete,
      water,
      ...descriptor.materials?.(owner, context),
    };
    context.materials = materials;
    const grounded = descriptor.grounded ?? !biome.road.suspended;
    const waterEnabled = descriptor.waterEnabled ?? profile.waterEnabled;
    const hasFarGround = grounded && (descriptor.farGround ?? !waterEnabled);
    const region = buildRegionEnvironment(
      {
        ...plan,
        chunks: grounded ? plan.chunks : [],
        parcels: [],
        landmarks: [],
        paths: [],
        basins: [],
      },
      { owner, materials, collectSolid },
    );
    if (!waterEnabled)
      for (const mesh of [...owner.group.children])
        if (mesh.userData.regionWater) owner.group.remove(mesh);
    if (hasFarGround) {
      const far = owner.solid(
        name + ' / distant land',
        createFarGroundGeometry(plan, { relief: descriptor.exteriorRelief }),
        materials.soil,
        { kind: 'terrain' },
        collectSolid,
      );
      far.castShadow = false;
      far.userData.regionFarGround = true;
      if (waterEnabled && !collectSolid) {
        // Carry the reservoir surface into the next hillside so water never
        // cuts off on the edge of the rectangular survey.
        const exteriorWater = createFarGroundGeometry(
          {
            ...plan,
            seaLevel: plan.seaLevel - 2,
            terrain: { ...plan.terrain, heights: plan.terrain.waterHeights },
          },
          { size: 1, relief: { offsets: [620], heightAt: () => 0 } },
        );
        const banks = owner.solid(
          name + ' / distant reservoir banks',
          exteriorWater,
          materials.water,
        );
        banks.castShadow = false;
      }
    }
    const records = descriptor.plan?.(doc, track, plan, placement);
    if (records?.then)
      throw new Error('Production placement plans must be synchronous');
    for (const record of records ?? [])
      if (!placement.placements.some((placed) => placed.id === record.id))
        placement.add(record);
    part = descriptor.build?.(context);
    borrow(part);
    if (descriptor.assets && placement.placements.length) {
      const loadAsset = descriptor.loadAsset ?? loadEditorStaticAsset;
      kit = createAssetKit({
        name: name + ' / registered art',
        assets: descriptor.assets,
        placements: placement.placements,
        collectSolid,
        textures: descriptor.textures,
        configureTexture: descriptor.configureTexture,
        finishMaterial(material, asset, textures) {
          descriptor.finishMaterial?.(material, asset, textures, context);
          finish?.finishMaterial?.(material, asset, textures, context);
        },
        ...(descriptor.prepareGeometry || finish?.prepareGeometry
          ? {
              prepareGeometry(geometry, asset, node) {
                descriptor.prepareGeometry?.(geometry, asset, node, context);
                finish?.prepareGeometry?.(geometry, asset, node, context);
              },
            }
          : {}),
        preparationReady: finish?.ready,
        loadAsset,
        ...(descriptor.loadTexture
          ? { loadTexture: descriptor.loadTexture }
          : {}),
        tileSize: descriptor.tileSize ?? 4096,
        tileOffset: descriptor.tileOffset,
      });
      borrow(kit);
    }
    owner.finish();
    owner.ready = Promise.all([finish?.ready, part?.ready, kit?.ready])
      .then(() => {
        if (!owner.isDisposed() && !collectSolid)
          descriptor.finishTerrain?.(materials, kit?.textures ?? {}, context);
      })
      .catch((error) => {
        owner.dispose();
        throw error;
      });
    owner.update = (frame) => {
      finish?.update?.(frame);
      part?.update?.(frame);
      descriptor.update?.(frame, context);
    };
    owner.group.userData.biome = doc.biome;
    owner.group.userData.region = {
      ...region.stats,
      assemblies: placement.accepted.length,
      productionAssets: placement.placements.length,
      near: placement.accepted.filter((p) => p.lod === 'near').length,
      mid: placement.accepted.filter((p) => p.lod === 'mid').length,
      far: placement.accepted.filter((p) => p.lod === 'far').length,
      terrainStyle:
        descriptor.terrainStyle ??
        (grounded ? 'surveyed-ground' : 'floating-regions'),
      ...(hasFarGround ? { farGroundY: plan.seaLevel - 28 } : {}),
      features: {
        [descriptor.feature ?? doc.biome + '-production']:
          placement.accepted.length,
      },
      ...(part?.stats ?? {}),
    };
    owner.group.userData.regionalPlacements = placement.accepted;
    owner.group.userData.productionKit = descriptor.id ?? doc.biome;
    return owner;
  } catch (error) {
    owner.dispose();
    throw error;
  }
}
