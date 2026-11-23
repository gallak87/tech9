import * as T from 'three';
import { roadsideScenerySites } from './roadside-scenery.js';

const roadsideAssets = {
  zephyr: ['terrace', 'halo', 'shard'],
  glasswake: ['cliff-0', 'bell-vault', 'rubble-shelf', 'cliff-1'],
  saffron: ['rib', 'vertebra-1', 'outcrop'],
  helion: ['instrumenttower', 'servicegantry', 'radiatorfan'],
  umbra: ['rib', 'pier', 'vault'],
  ravel: ['gallery', 'crown', 'cutter'],
  nomad: ['freight', 'service', 'freight'],
  oriel: ['gardencourtfar', 'tower', 'waterfrontfar', 'pavilion'],
  nightweir: ['public-gallery', 'residential-court', 'brick-pressureworks'],
};

/** Spend the remaining art budget where players can see it. Existing structural
 * contact selections have already been frozen before these markers are placed. */
export function fillStaticRoadside(
  doc,
  track,
  plan,
  placement,
  assets,
  options,
) {
  const families = roadsideAssets[doc.biome];
  if (!families) return;
  const { grounded, waterEnabled } = options;
  let triangles = placement.placements.reduce(
    (sum, item) => sum + assets[item.asset].visualTriangles,
    0,
  );
  for (const site of roadsideScenerySites(track, doc.settings.density, 18)) {
    const assetId = families[site.id % families.length];
    const asset = assets[assetId];
    if (triangles + asset.visualTriangles > 700000) continue;
    const [width, height, depth] = dimensions(asset);
    const scale = 1.05 + placement.random() * 0.38;
    const margin = track.width / 2 + (Math.hypot(width, depth) * scale) / 2;
    for (const offset of site.offsets) {
      const { x, z } = site.position
        .clone()
        .addScaledVector(site.right, offset + Math.sign(offset) * margin);
      const terrain = plan.surfaceHeight(x, z);
      if (grounded && site.position.y - terrain > height * scale + 155)
        continue;
      if (grounded && waterEnabled) {
        const radius = Math.hypot(width, depth) * scale * 0.225;
        const anchors = [
          [x, z],
          [x - radius, z],
          [x + radius, z],
          [x, z - radius],
          [x, z + radius],
        ];
        const bank = Math.min(
          ...anchors.map(([px, pz]) => plan.surfaceHeight(px, pz)),
        );
        const water = Math.max(
          ...anchors.map(([px, pz]) => plan.waterHeight(px, pz)),
        );
        if (bank - height * scale * 0.1 < water + 2) continue;
      }
      if (
        placement.place(assetId, {
          id: 'roadside-' + site.id,
          x,
          z,
          y: grounded ? null : site.position.y - height * scale * 0.56,
          yaw: site.yaw,
          scale,
          embed: grounded ? 0.1 : 0,
          solid: false,
        })
      ) {
        triangles += asset.visualTriangles;
        const assembly = placement.placements.at(-1);
        assembly.role = 'decorative';
        assembly.contactFaces = 0;
        Object.assign(placement.accepted.at(-1), {
          role: 'decorative',
          contactFaces: 0,
        });
        break;
      }
    }
  }
}

const UP = new T.Vector3(0, 1, 0);
const dimensions = (asset) =>
  asset.bounds[1].map((value, i) => value - asset.bounds[0][i]);

export const STATIC_CONTACT_FACE_LIMIT = 100000;

export function staticContactFaceCount(asset) {
  const proxy = asset.collision;
  if (!proxy) return asset.triangles?.length ?? 0;
  if (typeof proxy.indices !== 'string') return proxy.indices.length / 3;
  const bytes =
    (proxy.indices.length * 3) / 4 -
    (proxy.indices.endsWith('==') ? 2 : proxy.indices.endsWith('=') ? 1 : 0);
  return bytes / (proxy.indexType === 'u16' ? 6 : 12);
}

const structuralAssets = {
  glasswake: ['bell-vault', 'bridge-arch', 'cliff-0', 'cliff-1'],
  nomad: ['receiver', 'interior', 'service', 'armour'],
  oriel: ['pavilion', 'tower'],
};

/** Campaign scenery is principally decorative. Keep that same contract for
 * generated worlds: a few nearby complete structures have their exact contact
 * faces; all other art remains explicitly decorative. Every visible assembly
 * still passes the full road, support, camera and flight clearance checks.
 * This budget never changes a visual placement or fills an authored opening. */
export function applyStaticContactPolicy(doc, region, placement, assets) {
  const samples = region.roadSamples;
  const distances = new Map(),
    point = new T.Vector3();
  const distance = (record) => {
    if (!distances.has(record)) {
      let best = samples.length ? Infinity : 0;
      for (const sample of samples)
        best = Math.min(
          best,
          record.bounds.distanceToPoint(
            point.set(sample.x, sample.y, sample.z),
          ),
        );
      distances.set(record, best);
    }
    return distances.get(record);
  };
  const preferred = structuralAssets[doc.biome];
  const candidates = placement.placements.filter(
    (record) => staticContactFaceCount(assets[record.asset]) > 0,
  );
  candidates.sort(
    (a, b) =>
      Number(preferred && !preferred.includes(a.asset)) -
        Number(preferred && !preferred.includes(b.asset)) ||
      distance(a) - distance(b) ||
      a.id.localeCompare(b.id),
  );
  const structural = new Set();
  let faces = 0;
  for (const record of candidates) {
    const count = staticContactFaceCount(assets[record.asset]);
    if (structural.size === 4) break;
    if (faces + count > STATIC_CONTACT_FACE_LIMIT) continue;
    structural.add(record.id);
    faces += count;
  }
  for (const record of placement.placements) {
    record.solid = structural.has(record.id);
    record.role = record.solid ? 'structural-contact' : 'decorative';
    record.contactFaces = record.solid
      ? staticContactFaceCount(assets[record.asset])
      : 0;
    Object.assign(
      placement.accepted.find((accepted) => accepted.id === record.id),
      {
        solid: record.solid,
        role: record.role,
        contactFaces: record.contactFaces,
      },
    );
  }
}

export function staticContactStats(placement) {
  return {
    artContactPolicy: 'limited-exact-structures-and-decorative-scenery',
    structuralContactAssemblies: placement.placements.filter(
      (record) => record.solid,
    ).length,
    decorativeAssemblies: placement.placements.filter((record) => !record.solid)
      .length,
    artContactFaces: placement.placements.reduce(
      (sum, record) => sum + record.contactFaces,
      0,
    ),
  };
}

function sites(track, plan, count = 16) {
  if (!track)
    return plan.districts.slice(0, count).map((site) => ({
      ...site,
      height: site.y + 100,
      right: new T.Vector3(Math.cos(site.yaw), 0, -Math.sin(site.yaw)),
    }));
  return Array.from({ length: count }, (_, i) => {
    const station = (track.length * (i + 0.5)) / count;
    const frame = track.sample(station);
    const forward = frame.tangent.clone().setY(0).normalize();
    if (forward.lengthSq() < 0.5) forward.set(0, 0, 1);
    return {
      x: frame.position.x,
      z: frame.position.z,
      height: frame.position.y,
      right: new T.Vector3(forward.z, 0, -forward.x),
      yaw: Math.atan2(forward.x, forward.z),
      station,
    };
  });
}

/** Families retain their own composition, while all candidates consume the
 * same hard source-triangle and exact trusted-bound clearance budget. */
function staging(assets, plan, placement, limit = 700000) {
  let triangles = 0;
  const samples = plan.roadSamples.filter((_, i) => i % 6 === 0);
  const distance = (x, z) =>
    Math.sqrt(
      samples.reduce(
        (best, p) => Math.min(best, (p.x - x) ** 2 + (p.z - z) ** 2),
        Infinity,
      ),
    );
  function place(asset, options) {
    const source = assets[asset];
    if (triangles + source.visualTriangles > limit) return false;
    const far = source.proxy === 'none';
    if (far && distance(options.x, options.z) < 700) return false;
    const record = placement.place(asset, {
      ...options,
      solid: !far,
      ...(far ? { lod: 'far' } : {}),
    });
    if (record) triangles += source.visualTriangles;
    return record;
  }
  function outside(asset, site, side, options = {}) {
    const {
      offsets = assets[asset].proxy === 'none'
        ? [820, 1080, 1400]
        : [220, 320, 450],
      ...values
    } = options;
    for (const offset of offsets) {
      const record = place(asset, {
        x: site.x + site.right.x * offset * side,
        z: site.z + site.right.z * offset * side,
        yaw: site.yaw,
        ...values,
      });
      if (record) return record;
    }
    return false;
  }
  function add(asset, options) {
    const source = assets[asset];
    if (triangles + source.visualTriangles > limit) return false;
    const centre = new T.Box3(
      new T.Vector3(...source.bounds[0]),
      new T.Vector3(...source.bounds[1]),
    )
      .applyMatrix4(options.matrix)
      .getCenter(new T.Vector3());
    const far = source.proxy === 'none';
    if (far && distance(centre.x, centre.z) < 700) return false;
    const record = placement.add({
      ...options,
      asset,
      solid: !far,
      ...(far ? { lod: 'far' } : {}),
    });
    if (record) triangles += source.visualTriangles;
    return record;
  }
  function landmark(asset, options) {
    const b = plan.bounds;
    for (const [x, z] of [
      [b.min.x + 250, (b.min.z + b.max.z) / 2],
      [b.max.x - 250, (b.min.z + b.max.z) / 2],
      [(b.min.x + b.max.x) / 2, b.min.z + 250],
      [(b.min.x + b.max.x) / 2, b.max.z - 250],
    ]) {
      const record = place(asset, { x, z, ...options });
      if (record) return record;
    }
    return false;
  }
  return {
    place,
    outside,
    add,
    landmark,
    distance,
    get triangles() {
      return triangles;
    },
  };
}

export function planZephyr(doc, track, plan, placement, assets) {
  const stage = staging(assets, plan, placement);
  const basilica = doc.settings.sceneryPreset === 'basilica-isles-v1';
  const anchors = sites(track, plan, Math.round(7 + doc.settings.density * 5));
  for (const [i, site] of anchors.entries()) {
    const asset = i % 3 === 0 ? 'shard' : 'terrace';
    const scale = 1.05 + placement.random() * 0.65;
    stage.outside(asset, site, i % 2 ? -1 : 1, {
      id: 'isle-' + i,
      y: site.height - dimensions(assets[asset])[1] * scale - 10,
      embed: 0,
      scale,
    });
  }
  // Abbey precincts and their land bearings stay complete, well out of flight
  // space. Their original masonry is visible at an architectural scale.
  for (const [i, site] of sites(track, plan, basilica ? 3 : 2).entries()) {
    const island = stage.outside('terrace', site, i % 2 ? 1 : -1, {
      id: 'abbey-isle-' + i,
      offsets: [820, 1080, 1400],
      y: site.height - 190,
      scale: 1.5,
      embed: 0,
      overlap: true,
      solid: false,
    });
    if (!island) continue;
    const bounds = island.bounds;
    stage.place(i === 1 && !basilica ? 'needle' : 'abbey', {
      id: 'abbey-' + i,
      x: (bounds.min.x + bounds.max.x) / 2,
      z: (bounds.min.z + bounds.max.z) / 2,
      y: bounds.max.y - 14,
      yaw: site.yaw,
      scale: basilica ? 1.15 : 0.95,
      embed: 0.08,
      overlap: true,
    });
  }
  for (const [i, site] of sites(track, plan, 2).entries())
    stage.outside('halo', site, i ? -1 : 1, {
      id: 'halo-' + i,
      y: site.height - 65,
      scale: 0.8,
      embed: 0,
    });
}

export function planGlasswake(doc, track, plan, placement, assets) {
  const stage = staging(assets, plan, placement, 450000);
  const glacier = doc.settings.sceneryPreset === 'glacier-v1';
  for (const [i, site] of sites(
    track,
    plan,
    Math.round(22 + doc.settings.density * 18),
  ).entries()) {
    stage.outside(
      i % 3 ? 'basal-strata' : 'far-fragment',
      site,
      i % 2 ? 1 : -1,
      {
        id: 'ice-bed-' + i,
        scale: 0.95 + placement.random() * 0.8,
        embed: 0.3,
        overlap: true,
      },
    );
    if (i % 3 === 0)
      stage.outside(
        glacier ? (i % 2 ? 'cliff-0' : 'cliff-1') : 'rubble-shelf',
        site,
        i % 2 ? -1 : 1,
        {
          id: 'ice-cut-' + i,
          scale: glacier ? 1.1 + placement.random() : 1.3,
          embed: 0.16,
          overlap: true,
        },
      );
    if (i % 8 === 0)
      stage.outside('bell-vault', site, 1, {
        id: 'vault-' + i,
        offsets: [360, 480, 620],
        scale: 1.4,
        embed: 0.06,
      });
    if (i % 5 === 0)
      stage.outside('dock-mast', site, -1, {
        id: 'mast-' + i,
        offsets: [100, 160, 260],
        scale: 1.1,
        embed: 0.06,
      });
  }
}

export function planSaffron(doc, track, plan, placement, assets) {
  const stage = staging(assets, plan, placement, 650000);
  const fossilFields = doc.settings.sceneryPreset === 'fossil-fields-v1';
  for (const [i, site] of sites(
    track,
    plan,
    Math.round(14 + doc.settings.density * 18),
  ).entries()) {
    stage.outside(i % 2 ? 'dune' : 'dune-1', site, i % 2 ? -1 : 1, {
      id: 'dune-' + i,
      scale: 1.4 + placement.random() * 0.8,
      embed: 0.1,
      overlap: true,
    });
    stage.outside(i % 2 ? 'outcrop' : 'outcrop-1', site, i % 2 ? 1 : -1, {
      id: 'outcrop-' + i,
      scale: 1 + placement.random(),
      embed: 0.2,
      overlap: true,
    });
    if (i % (fossilFields ? 2 : 4) === 0)
      stage.outside(i % 4 ? 'rib' : 'vertebra-1', site, i % 2 ? -1 : 1, {
        id: 'fossil-' + i,
        scale: 1.2 + placement.random() * 0.6,
        embed: 0.25,
      });
  }
  for (const [i, site] of sites(track, plan, fossilFields ? 2 : 1).entries())
    stage.outside(i ? 'scapula' : 'skull', site, i % 2 ? 1 : -1, {
      id: 'ancient-fossil-' + i,
      scale: 1.3,
      embed: 0.22,
    });
  if (!placement.placements.some((record) => record.asset === 'skull'))
    stage.landmark('skull', {
      id: 'ancient-skull',
      scale: 1.8,
      embed: 0.25,
      yaw: placement.random() * Math.PI * 2,
    });
}

export function planHelion(doc, track, plan, placement, assets) {
  const stage = staging(assets, plan, placement, 700000);
  const observatory = doc.settings.sceneryPreset === 'observatory-v1';
  for (const [i, site] of sites(
    track,
    plan,
    Math.round(8 + doc.settings.density * 7),
  ).entries()) {
    const asset =
      observatory && i % 3 === 0
        ? 'instrumenttower'
        : i % 2
          ? 'radiatorfan'
          : 'sunshield';
    stage.outside(asset, site, i % 2 ? -1 : 1, {
      id: 'thermal-station-' + i,
      scale: 1.25 + placement.random() * 0.5,
      y: site.height - 145,
      embed: 0,
    });
    stage.outside('servicegantry', site, i % 2 ? 1 : -1, {
      id: 'service-' + i,
      offsets: [90, 150, 230],
      y: site.height - 26,
      scale: 1.4,
      embed: 0,
    });
  }
}

export function planUmbra(doc, track, plan, placement, assets) {
  const stage = staging(assets, plan, placement, 700000);
  const quiet = doc.settings.sceneryPreset === 'quiet-vaults-v1';
  for (const [i, site] of sites(
    track,
    plan,
    Math.round(12 + doc.settings.density * 7),
  ).entries()) {
    const asset = quiet
      ? i % 3
        ? 'vault'
        : 'terrace'
      : i % 3
        ? 'wall-breach'
        : 'terrace';
    const record = stage.outside(asset, site, i % 2 ? 1 : -1, {
      id: 'ruin-' + i,
      y: site.height - 90,
      scale: 1.05 + placement.random() * 0.4,
      embed: 0,
    });
    if (record && i % 3 === 0)
      stage.outside('rib', site, i % 2 ? -1 : 1, {
        id: 'bearing-' + i,
        y: site.height - 60,
        offsets: [150, 250, 360],
        scale: 1.3,
        embed: 0,
      });
  }
  for (const [i, site] of sites(track, plan, quiet ? 1 : 2).entries())
    stage.outside(i ? 'instrument' : 'lens', site, i ? -1 : 1, {
      id: 'observatory-' + i,
      y: site.height - 100,
      scale: 1.9,
      embed: 0,
    });
}

export function planRavel(doc, track, plan, placement, assets) {
  const stage = staging(assets, plan, placement, 700000);
  const folded = doc.settings.sceneryPreset === 'folded-canopies-v1';
  for (const [i, site] of sites(
    track,
    plan,
    Math.round(10 + doc.settings.density * 8),
  ).entries()) {
    stage.outside(
      i % 3 === 0 ? 'cutter' : folded ? 'crown' : 'gallery',
      site,
      i % 2 ? -1 : 1,
      {
        id: 'loom-anchor-' + i,
        y: site.height - 70,
        scale: 1 + placement.random() * 0.5,
        embed: 0,
      },
    );
  }
  for (const [i, site] of sites(track, plan, 3).entries())
    stage.outside(i % 2 ? 'spindle' : 'carrier', site, i % 2 ? 1 : -1, {
      id: 'anchor-fleet-' + i,
      y: site.height - 125,
      scale: 1.1,
      embed: 0,
    });
  if (!placement.placements.some((record) => record.asset === 'carrier'))
    stage.landmark('carrier', {
      id: 'distant-loom-carrier',
      y: track ? track.sample(track.length / 2).position.y - 70 : 80,
      scale: 1.25,
      embed: 0,
    });
}

export function planNomad(doc, track, plan, placement, assets) {
  const stage = staging(assets, plan, placement, 650000);
  const freight = doc.settings.sceneryPreset === 'freight-yards-v1';
  for (const [i, site] of sites(
    track,
    plan,
    Math.round(14 + doc.settings.density * 8),
  ).entries()) {
    const asset = i % 3 ? (freight ? 'interior' : 'service') : 'receiver';
    stage.outside(asset, site, i % 2 ? -1 : 1, {
      id: 'salt-works-' + i,
      scale: 0.75 + placement.random() * 0.6,
      embed: 0.1,
    });
    for (const j of [0, 1])
      stage.outside('freight', site, i % 2 ? 1 : -1, {
        id: 'freight-' + i + '-' + j,
        offsets: [120 + j * 65, 250 + j * 65, 420 + j * 65],
        scale: 1.15,
        embed: 0.04,
      });
  }
  for (const [i, site] of sites(track, plan, 3).entries()) {
    const scale = 0.9 + i * 0.1,
      source = assets.carrier;
    for (const offset of [900, 1250, 1650]) {
      const side = i % 2 ? -1 : 1;
      const x = site.x + site.right.x * offset * side,
        z = site.z + site.right.z * offset * side;
      const matrix = new T.Matrix4()
        .compose(
          new T.Vector3(x, plan.surfaceHeight(x, z), z),
          new T.Quaternion().setFromAxisAngle(UP, site.yaw),
          new T.Vector3().setScalar(scale),
        )
        .multiply(
          new T.Matrix4().makeTranslation(
            -(source.bounds[0][0] + source.bounds[1][0]) / 2,
            0,
            -(source.bounds[0][2] + source.bounds[1][2]) / 2,
          ),
        );
      const assembly = new T.Box3(
        new T.Vector3(...source.bounds[0]).setY(0),
        new T.Vector3(...source.bounds[1]),
      ).applyMatrix4(matrix);
      if (!placement.clears(assembly)) continue;
      const carrier = stage.add('carrier', {
        id: 'parked-carrier-' + i,
        matrix,
        overlap: true,
      });
      if (!carrier) continue;
      // Original carrier-kit wheel anchors: parked, complete vehicles retain
      // every axle rather than rendering a floating wheel-less hull.
      for (const side of [-1, 1])
        for (let axle = 0; axle < 9; axle++)
          stage.add('wheel', {
            id: 'carrier-wheel-' + i + '-' + side + '-' + axle,
            matrix: matrix
              .clone()
              .multiply(
                new T.Matrix4().makeTranslation(
                  side * 96,
                  30,
                  -312 + axle * 78,
                ),
              ),
            overlap: true,
          });
      break;
    }
  }
}

export function planOriel(doc, track, plan, placement, assets) {
  const stage = staging(assets, plan, placement, 500000);
  const gardens = doc.settings.sceneryPreset === 'civic-gardens-v1';
  for (const [i, district] of plan.districts.entries()) {
    const asset =
      i % 3 ? (gardens ? 'gardencourtfar' : 'waterfrontfar') : 'pavilion';
    stage.place(asset, {
      id: 'civic-' + i,
      x: district.x,
      z: district.z,
      yaw: district.yaw,
      scale: 1.1 + placement.random() * 0.6,
      embed: 0.06,
    });
    stage.place('tower', {
      id: 'civic-tower-' + i,
      x: district.x + Math.cos(district.yaw) * 120,
      z: district.z - Math.sin(district.yaw) * 120,
      yaw: district.yaw,
      scale: 1.2 + placement.random() * 0.8,
      embed: 0.06,
    });
  }
  for (const [i, site] of sites(track, plan, 12).entries())
    stage.outside(i % 3 ? 'pavilion' : 'sunbracket', site, i % 2 ? 1 : -1, {
      id: 'promenade-' + i,
      offsets: [110, 180, 280],
      scale: 1.3,
      embed: 0.06,
    });
}

export function planWorldspire(doc, track, plan, placement, assets) {
  const stage = staging(assets, plan, placement, 250000);
  const b = plan.bounds,
    centreZ = (b.min.z + b.max.z) / 2;
  const scale = doc.settings.sceneryPreset === 'cloud-ridges-v1' ? 0.46 : 0.56;
  // Retain the complete authored monolith. Arbitrary sector extraction would
  // expose cut passage boundaries and turn the one spire into repeated props.
  for (const side of [-1, 1])
    for (const distance of [1800, 2600, 3500]) {
      const x = side < 0 ? b.min.x - distance : b.max.x + distance;
      if (
        stage.place('monolith', {
          id: 'worldspire',
          x,
          z: centreZ,
          y: plan.seaLevel - 260,
          scale,
          yaw: placement.random() * Math.PI * 2,
          embed: 0,
        })
      )
        return;
    }
}
