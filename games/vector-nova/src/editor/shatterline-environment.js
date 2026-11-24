import * as T from 'three';
import metadata from './kits/shatterline-assets.json' with { type: 'json' };
import { assetURL } from '../assets/url.js';
import { createEditorOwner } from './world-owner.js';
import { createAssetKit, assetKitBounds } from './asset-kit.js';
import { createRegionPlan } from './region-plan.js';
import { buildRegionEnvironment } from './region-environment.js';
import { createFarGroundGeometry } from './far-ground.js';
import { createRouteClearance } from '../environment/placement.js';
import { finishShatterlineMaterial } from '../levels/shatterline/environment/materials.js';

const UP = new T.Vector3(0, 1, 0);
export const SHATTERLINE_KIT_LIMIT = 220;
const assets = Object.fromEntries(
  Object.entries(metadata).map(([id, value]) => [
    id,
    { ...value, url: assetURL(value.url) },
  ]),
);
const horizonEnd = 16800;
const limestoneHorizon = {
  offsets: [760, 1530, 2700, 4450, 6800, 10600, horizonEnd],
  heightAt(x, z, offset, plan) {
    if (offset === horizonEnd) return 0;
    const phase = (plan.seed % 769) * 0.043;
    const fault = x * 0.0012 - z * 0.00086 + phase;
    const ashlar = 0.32 + 0.68 * Math.abs(Math.sin(fault)) ** 1.7;
    const front = (offset - 2950) / 2000;
    const rear = (offset - 7150) / 3600;
    return (
      ashlar * (920 * Math.exp(-front * front) + 680 * Math.exp(-rear * rear))
    );
  },
};
function randomFor(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let v = Math.imul(state ^ (state >>> 15), 1 | state);
    v ^= v + Math.imul(v ^ (v >>> 7), 61 | v);
    return ((v ^ (v >>> 14)) >>> 0) / 4294967296;
  };
}

/** A CPU-only scenery plan: trusted asset bounds reserve both the visible mesh
 * and its baked collision proxy before a single GLB is loaded. */
export function planShatterlineKit(doc, track, plan) {
  const random = randomFor(plan.seed ^ 0x53484154);
  const routeClear = track
    ? createRouteClearance(track, {
        spacing: 8,
        sidePadding: 30,
        localVertical: [-22, 44],
      }).clears
    : () => true;
  const placements = [];
  const occupied = [];
  const campus = doc.settings.sceneryPreset === 'receiving-campus-v1';
  const fullness = doc.settings.density;
  function place(
    id,
    asset,
    x,
    z,
    scale,
    yaw,
    { embed = 0.2, y = null, overlap = false } = {},
  ) {
    if (placements.length >= SHATTERLINE_KIT_LIMIT) return false;
    const source = metadata[asset];
    const [min, max] = source.bounds;
    const size = Array.isArray(scale)
      ? new T.Vector3(...scale)
      : new T.Vector3().setScalar(scale);
    const height = (max[1] - min[1]) * size.y;
    const radius =
      Math.max((max[0] - min[0]) * size.x, (max[2] - min[2]) * size.z) / 2;
    const soil =
      y ??
      Math.min(
        plan.surfaceHeight(x, z),
        plan.surfaceHeight(x - radius * 0.45, z),
        plan.surfaceHeight(x + radius * 0.45, z),
        plan.surfaceHeight(x, z - radius * 0.45),
        plan.surfaceHeight(x, z + radius * 0.45),
      );
    const matrix = new T.Matrix4()
      .compose(
        new T.Vector3(x, soil - height * embed, z),
        new T.Quaternion().setFromAxisAngle(UP, yaw),
        size,
      )
      .multiply(
        new T.Matrix4().makeTranslation(
          -(min[0] + max[0]) / 2,
          -min[1],
          -(min[2] + max[2]) / 2,
        ),
      );
    const bounds = assetKitBounds(source, matrix);
    const centre = bounds.getCenter(new T.Vector3());
    const extent = bounds.getSize(new T.Vector3());
    if (
      !plan.clears(
        centre.x,
        centre.z,
        extent.x,
        extent.z,
        bounds.max.y,
        0,
        bounds.min.y,
      ) ||
      !routeClear(
        centre.x,
        centre.z,
        extent.x,
        extent.z,
        bounds.max.y,
        0,
        bounds.min.y,
      )
    )
      return false;
    if (
      !overlap &&
      occupied.some((other) =>
        other.clone().expandByScalar(12).intersectsBox(bounds),
      )
    )
      return false;
    const record = { id, asset, matrix, solid: true, bounds };
    placements.push(record);
    if (!asset.startsWith('geology-')) occupied.push(bounds);
    return record;
  }
  // Fractured outcrops grow into the connected terrain, with long horizontal
  // bedding rather than repeated isolated upright boulders.
  const b = plan.bounds;
  const step = Math.max(
    600,
    Math.sqrt(
      ((b.max.x - b.min.x) * (b.max.z - b.min.z)) / (20 + fullness * 20),
    ),
  );
  let rockIndex = 0;
  for (let z = b.min.z + 320; z < b.max.z - 280; z += step)
    for (let x = b.min.x + 320; x < b.max.x - 280; x += step) {
      if (random() > 0.46 + fullness * 0.5) continue;
      const px = x + (random() - 0.5) * step * 0.55;
      const pz = z + (random() - 0.5) * step * 0.55;
      place(
        'fault-' + rockIndex++,
        random() > 0.42 ? 'geology-bedded-ridge' : 'geology-eroded-bluff',
        px,
        pz,
        [
          0.26 + random() * 0.23,
          0.16 + random() * 0.28,
          0.24 + random() * 0.19,
        ],
        0.25 + random() * 0.75 + (rockIndex % 2) * Math.PI,
        { embed: 0.37, overlap: true },
      );
    }
  // Readable roadside geology and civic anchors at racing scale. These are
  // candidates around the route, never replacements for the authored road.
  if (track) {
    const stations = Math.min(40, Math.ceil(track.length / 190));
    const bankPhase = Math.floor(random() * 8);
    for (let i = 0; i < stations; i++) {
      const distance = ((i + 0.4) / stations) * track.length;
      if (track.isJumpProtected?.(distance)) continue;
      const frame = track.sample(distance);
      const flatRight = new T.Vector3(
        frame.right.x,
        0,
        frame.right.z,
      ).normalize();
      const yaw = Math.atan2(frame.tangent.x, frame.tangent.z);
      const highBank = Math.floor((i + bankPhase) / 4) % 2 ? -1 : 1;
      for (const bank of [highBank, -highBank]) {
        // Several consecutive shelves form a single fault face. Lower cuts
        // on the opposite bank leave sightlines through the canyon exits.
        const scale = 0.86 + random() * 0.38;
        const high = bank === highBank;
        if (!high && random() > 0.26 + fullness * 0.44) continue;
        for (const offset of [230, 310, 410, 530]) {
          const p = frame.position
            .clone()
            .addScaledVector(flatRight, bank * offset);
          if (
            plan.surfaceHeight(p.x, p.z) <
            frame.position.y - (high ? 72 : 18)
          )
            continue;
          if (
            place(
              'road-cut-' + i + '-' + bank,
              i % 3 ? 'geology-bedded-ridge' : 'geology-eroded-bluff',
              p.x,
              p.z,
              [0.13 * scale, (high ? 0.23 : 0.125) * scale, 0.23 * scale],
              yaw + (bank > 0 ? 0.14 : Math.PI - 0.13),
              { embed: 0.41, overlap: true },
            )
          )
            break;
        }
      }
      if (i % (campus ? 2 : 3) === 0) {
        const asset = i % 2 ? 'crown-broken' : 'crown-severed';
        const variance = random();
        const scale = 0.82 + variance * 0.33;
        const remnantYaw = yaw + (random() - 0.5) * 0.22;
        for (const offset of [185 + variance * 55, 290, 390]) {
          const p = frame.position
            .clone()
            .addScaledVector(flatRight, -highBank * offset);
          const start = placements.length,
            reserved = occupied.length;
          const crown = place(
            'accelerator-remnant-' + i,
            asset,
            p.x,
            p.z,
            scale,
            remnantYaw,
            { embed: 0.2 },
          );
          if (!crown) continue;
          let supported = true;
          // Broad original load-bearing pylons visibly hold the broken upper
          // cassettes. Reject the entire assembly if a bearing would hit a road.
          const r = asset === 'crown-broken' ? 112 : 145;
          const cy = asset === 'crown-broken' ? 66 : 92;
          for (const side of [-1, 1]) {
            const bearing = new T.Vector3(
              side * r * 0.7,
              cy + r * 0.75,
              26,
            ).applyMatrix4(crown.matrix);
            const ground = plan.surfaceHeight(bearing.x, bearing.z);
            const height = Math.max(15, (bearing.y - ground + 4) / 0.965);
            supported &&= Boolean(
              place(
                'ruin-bearing-' + i + '-' + side,
                'load-foundation',
                bearing.x,
                bearing.z,
                [0.66 * scale, height / 173.75, 0.85 * scale],
                remnantYaw,
                { embed: 0.035, y: ground, overlap: true },
              ),
            );
          }
          if (!supported) {
            placements.length = start;
            occupied.length = reserved;
          } else break;
        }
      }
    }
  }
  // Founded service precincts provide a second scale below the ancient ruins.
  for (const [i, district] of plan.districts.entries()) {
    if (!campus && i % 2) continue;
    const yaw = district.yaw;
    const x = district.x,
      z = district.z;
    place(
      'shelter-' + i,
      'service-shelter',
      x,
      z,
      1.05 + random() * 0.65,
      yaw,
      { embed: 0.14 },
    );
    place(
      'receiver-' + i,
      'receiving-tower',
      x + Math.cos(yaw) * 190,
      z - Math.sin(yaw) * 190,
      0.7 + random() * 0.45,
      yaw,
      { embed: 0.08 },
    );
    place(
      'service-gallery-' + i,
      'service-gallery',
      x - Math.cos(yaw) * 155,
      z + Math.sin(yaw) * 155,
      1.3,
      yaw,
      { embed: 0.16 },
    );
    if (campus)
      place(
        'cassette-' + i,
        'fractured-cassette',
        x + Math.sin(yaw) * 160,
        z + Math.cos(yaw) * 160,
        1.8,
        yaw + 0.3,
        { embed: 0.08 },
      );
  }
  return placements;
}

export function createShatterlineEditorEnvironment(
  doc,
  track,
  { collectSolid = null, preview = false, plan = null, previous = null } = {},
) {
  plan ??= createRegionPlan(doc, track);
  const owner = createEditorOwner(
    'Editor / Shatterline production landscape',
    preview,
    { previous, regional: true },
  );
  const soil = owner.material(
    'Shatterline / limestone fault terrain',
    { color: '#b7b3a0', roughness: 0.95 },
    finishShatterlineMaterial,
  );
  const structural = owner.material(
    'Shatterline / graphite civil foundations',
    { color: '#686f70', roughness: 0.83, metalness: 0.12 },
    finishShatterlineMaterial,
  );
  const region = buildRegionEnvironment(
    { ...plan, parcels: [], landmarks: [], basins: [], paths: [] },
    {
      owner,
      materials: {
        soil,
        concrete: structural,
        paving: structural,
        roof: structural,
        occupied: structural,
        water: structural,
      },
      collectSolid,
    },
  );
  for (const mesh of [...owner.group.children])
    if (mesh.userData.regionWater) {
      owner.group.remove(mesh);
    }
  const far = owner.solid(
    'Shatterline / distant limestone land',
    createFarGroundGeometry(plan, { relief: limestoneHorizon }),
    soil,
    { kind: 'terrain' },
    collectSolid,
  );
  far.castShadow = false;
  far.userData.regionFarGround = true;
  const placements = planShatterlineKit(doc, track, plan);
  const kit = createAssetKit({
    name: 'Shatterline / production scenery',
    assets,
    placements,
    collectSolid,
    tileSize: 8192,
    tileOffset: 4096,
    textures: {
      limestone: assetURL('assets/levels/shatterline/limestone-v1.png'),
    },
    configureTexture(texture) {
      texture.colorSpace = T.SRGBColorSpace;
      texture.wrapS = texture.wrapT = T.RepeatWrapping;
      texture.anisotropy = 8;
    },
    finishMaterial(material, asset, textures) {
      finishShatterlineMaterial(material, { rockTexture: textures.limestone });
    },
  });
  owner.borrowed.push(kit);
  owner.group.add(kit.group);
  owner.finish();
  owner.ready = kit.ready.then(() => {
    if (!owner.isDisposed() && !collectSolid)
      finishShatterlineMaterial(soil, { rockTexture: kit.textures.limestone });
  });
  owner.group.userData.biome = 'shatterline';
  owner.group.userData.region = {
    ...region.stats,
    assemblies: placements.length,
    productionAssets: placements.length,
    terrainStyle: 'faulted-limestone',
    farGroundY: plan.seaLevel - 28,
    features: { 'fractured-mass-driver': placements.length },
  };
  owner.group.userData.regionalPlacements = placements.map(
    ({ id, asset, bounds }) => ({
      id,
      asset,
      x: (bounds.min.x + bounds.max.x) / 2,
      y: bounds.min.y,
      z: (bounds.min.z + bounds.max.z) / 2,
      bounds: { min: bounds.min.toArray(), max: bounds.max.toArray() },
    }),
  );
  return owner;
}
