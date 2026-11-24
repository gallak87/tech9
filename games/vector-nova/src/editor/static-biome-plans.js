import * as T from 'three';
import { roadsideScenerySites } from './roadside-scenery.js';

const roadsideAssets = {
  ravel: ['gallery', 'crown', 'cutter'],
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
  glasswake: [
    'glacier-escarpment',
    'glacier-terrace',
    'glacier-seracs',
    'glacier-buttress',
  ],
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

function trackSite(track, station) {
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
}

function sites(track, plan, count = 16) {
  if (!track)
    return plan.districts.slice(0, count).map((site) => ({
      ...site,
      height: site.y + 100,
      right: new T.Vector3(Math.cos(site.yaw), 0, -Math.sin(site.yaw)),
    }));
  return Array.from({ length: count }, (_, i) =>
    trackSite(track, (track.length * (i + 0.5)) / count),
  );
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
  function add(asset, options, parentBounds = null) {
    const source = assets[asset];
    if (triangles + source.visualTriangles > limit) return false;
    const bounds = new T.Box3(
      new T.Vector3(...source.bounds[0]),
      new T.Vector3(...source.bounds[1]),
    ).applyMatrix4(options.matrix);
    const far = source.proxy === 'none';
    if (parentBounds) {
      if (!parentBounds.containsBox(bounds)) return false;
    } else if (far) {
      const centre = bounds.getCenter(new T.Vector3());
      if (distance(centre.x, centre.z) < 700) return false;
    }
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
  const { density, sceneryPreset } = doc.settings;
  const basilica = sceneryPreset === 'basilica-isles-v1';
  const random = placement.random;
  const firstSide = random() < 0.5 ? -1 : 1;
  const phase = random();
  const length = track?.length ?? 5000;
  const stationCount = T.MathUtils.clamp(Math.round(length / 360), 8, 32);
  const anchors = track
    ? Array.from({ length: stationCount * 2 }, (_, i) =>
        trackSite(track, length * ((phase + i * 0.61803398875) % 1)),
      )
    : sites(track, plan, stationCount);
  const islandSites = anchors.map((site, i) => ({
    site,
    id: 'isle-' + i,
    side: i % 2 ? -firstSide : firstSide,
    asset: i % (basilica ? 3 : 4) === 2 ? 'shard-light' : 'terrace-light',
    spread: (basilica ? 1.58 : 1.85) + random() * 0.94,
    tall: 0.92 + random() * 0.9,
    yaw: site.yaw + (random() - 0.5) * 1.3,
    shelf: i % 3 === 0 ? 32 + random() * 68 : -32 - random() * 145,
  }));

  // Set the skyline first. At higher fullness an occupied island answers it
  // from the other end of the course, separated by the smaller terraces.
  const skyline = [];
  const districtCount = density >= 0.72 ? 2 : 1;
  for (const site of anchors) {
    const index = skyline.length;
    const side = index ? -firstSide : firstSide;
    const yaw = site.yaw + (random() - 0.5) * 0.65;
    if (
      skyline.some(
        (point) => Math.hypot(site.x - point.x, site.z - point.z) < 850,
      )
    )
      continue;
    const island = [side, -side].some((bank) => {
      const terrace = stage.outside('terrace', site, bank, {
        id: 'abbey-isle-' + index,
        offsets: [900, 1160, 1450],
        y: site.height - (basilica ? 185 : 240),
        scale: basilica ? [3, 1.65, 3.4] : [3.35, 1.4, 3.75],
        yaw,
        embed: 0,
      });
      if (!terrace) return false;
      const bounds = terrace.bounds;
      stage.place(basilica !== Boolean(index) ? 'abbey' : 'needle', {
        id: 'abbey-' + index,
        x: (bounds.min.x + bounds.max.x) / 2,
        z: (bounds.min.z + bounds.max.z) / 2,
        y: bounds.max.y - 24,
        yaw,
        scale: index ? 1.55 : 2.05,
        embed: 0.08,
        overlap: true,
      });
      [-bank, bank].some((other) =>
        stage.outside('halo', site, other, {
          id: 'rose-' + index,
          offsets: [290, 420, 580, 760],
          y: site.height - 75,
          scale: index ? 0.95 : 1.25,
          yaw: site.yaw + (index ? 0.4 : 0.8),
          embed: 0,
        }),
      );
      return true;
    });
    if (island) skyline.push(site);
    if (skyline.length >= districtCount) break;
  }

  // Work to an accepted count. The same seeded sequence falls on both sides
  // of the route and leaves open cloud between islands at lower settings.
  const target = Math.round(stationCount * 1.27 * density ** 0.9);
  let occupied = 0;
  for (const {
    site,
    id,
    side,
    asset,
    spread,
    tall,
    yaw,
    shelf,
  } of islandSites) {
    if (occupied >= target) break;
    const [width, height, depth] = dimensions(assets[asset]);
    for (const [extra, fit, drop] of [
      [0, 1, 0],
      [70, 0.82, 0],
      [160, 1, 0],
      [140, 0.86, 200],
      [315, 0.92, 65],
      [515, 1, 95],
      [735, 0.85, 135],
    ]) {
      const scale = [spread * fit, tall, spread * fit * 1.12];
      const radius = Math.hypot(width * scale[0], depth * scale[2]) * 0.5;
      const offset = radius + (track?.width ?? 40) * 0.5 + 50 + extra;
      if (
        [side, -side].some((bank) =>
          stage.outside(asset, site, bank, {
            id,
            offsets: [offset],
            y: site.height + shelf - height * tall - drop,
            yaw,
            scale,
            embed: 0,
          }),
        )
      ) {
        occupied++;
        break;
      }
    }
  }
}

export function planGlasswake(doc, track, plan, placement, assets) {
  const stage = staging(assets, plan, placement, 260000);
  const { sceneryPreset, density } = doc.settings;
  const glacier = sceneryPreset === 'glacier-v1';
  const length = track?.finishDistance ?? track?.length ?? 4000;
  const count = Math.min(72, Math.max(3, Math.round(length / 310)));
  const random = placement.random;
  const firstSide = random() < 0.5 ? -1 : 1;
  const breakPhase = Math.floor(random() * 5);
  const crownPhase = random() * Math.PI * 2;
  const anchors = track
    ? Array.from({ length: count }, (_, i) =>
        trackSite(track, (length * (i + 0.32 + random() * 0.36)) / count),
      )
    : sites(track, plan, count);
  const profiles = structuralAssets.glasswake;
  const lastProfile = new Map();
  const candidates = [];

  // A seed changes the profile, height, and the dominant side of each run.
  // Assign the choices before trying clearance so rejections do not reroll them.
  for (const [i, site] of anchors.entries()) {
    const alternate = Math.floor((i + breakPhase) / 5) % 2;
    const dominant = alternate ? -firstSide : firstSide;
    const open = (i + breakPhase) % 8 === 7;
    const rise = 0.5 + 0.5 * Math.sin(i * 0.53 + crownPhase);
    for (const side of [dominant, -dominant]) {
      const primary = side === dominant;
      const last = lastProfile.get(side);
      const choices = profiles.filter((profile) => profile !== last);
      const asset = choices[Math.floor(random() * choices.length)];
      lastProfile.set(side, asset);
      const backbone = (i + breakPhase) % 3 === 0;
      const threshold = primary
        ? backbone
          ? 0
          : 0.29 + random() * 0.37
        : (open ? 0.99 : 0.5) + random() * (glacier ? 0.58 : 0.67);
      candidates.push({
        i,
        site,
        side,
        asset,
        threshold,
        yaw: site.yaw + (side < 0 ? Math.PI : 0) + (random() - 0.5) * 0.42,
        depth: (glacier ? 0.95 : 1.25) + random() * 0.32,
        span: (glacier ? 1.02 : 1.28) + random() * 0.38,
        crown: glacier
          ? 250 + 170 * rise + random() * 140
          : 105 + 110 * rise + random() * 80,
      });
    }
  }

  const wallCenters = [];
  const walls = [];
  candidates.sort((a, b) => a.threshold - b.threshold);
  for (const candidate of candidates) {
    const { i, site, side, asset, threshold, yaw, depth, span, crown } =
      candidate;
    if (threshold > density) continue;
    const [width, height] = dimensions(assets[asset]);
    const inFlight = track?.isJumpProtected?.(site.station);
    const setback = (track?.width ?? 40) / 2 + (inFlight ? 115 : 57);
    // Neighbouring modules can meet, including at bends. Suppress duplicate
    // centres where separate road spans look onto the same patch of terrain.
    // Fit a shallower profile on tight stretches before stepping away.
    for (const [extra, fit] of [
      [0, 1],
      [30, 0.72],
      [85, 0.72],
      [138, 1],
      [230, 1],
      [345, 1],
    ]) {
      const thickness = depth * fit;
      const offset = setback + (width * thickness) / 2 + extra;
      const x = site.x + site.right.x * offset * side;
      const z = site.z + site.right.z * offset * side;
      if (
        wallCenters.some(
          (point) => (x - point.x) ** 2 + (z - point.z) ** 2 < 145 ** 2,
        )
      )
        continue;
      const embed = 0.19;
      const ground = plan.surfaceHeight(x, z);
      const vertical = T.MathUtils.clamp(
        (site.height + crown - ground) / (height * (1 - embed)),
        glacier ? 0.7 : 0.44,
        glacier ? 1.65 : 1.16,
      );
      if (
        stage.place(asset, {
          id: `glacier-wall-${i}-${side}`,
          x,
          z,
          yaw,
          embed,
          scale: [thickness, vertical, span * (0.65 + 0.35 * fit)],
          overlap: true,
        })
      ) {
        wallCenters.push({ x, z });
        walls.push({ ...candidate, x, z });
        break;
      }
    }
  }

  for (const { i, site, side, threshold, yaw, x, z } of walls) {
    if (threshold + 0.15 > density || (i + (side > 0 ? 1 : 0)) % 2) continue;
    // Bury slumped ice at the foot and keep its irregular front in the same
    // geology as the wall, with the road and jump reservations still active.
    stage.place('glacier-talus', {
      id: `glacier-foot-${i}-${side}`,
      x: x - site.right.x * 100 * side,
      z: z - site.right.z * 100 * side,
      yaw: yaw + 0.17,
      scale: [1.45, glacier ? 1.3 : 0.9, 1.55],
      embed: 0.23,
      overlap: true,
    });
  }

  for (const { i, site, side, threshold, yaw, x, z } of walls) {
    if (threshold + 0.24 > density || i % 4 !== (side > 0 ? 1 : 3)) continue;
    // Carry some cliff runs into broader glacial shelves behind the face.
    // The high face remains closest to the road and keeps its own silhouette.
    const outboard = glacier ? 288 : 335;
    const along = side * 102;
    stage.place(side > 0 ? 'glacier-terrace' : 'glacier-buttress', {
      id: `glacier-shelf-${i}-${side}`,
      x: x + site.right.x * outboard * side - site.right.z * along,
      z: z + site.right.z * outboard * side + site.right.x * along,
      yaw: yaw + side * 0.23,
      scale: [2.8, glacier ? 0.69 : 0.51, 1.75],
      embed: 0.23,
      overlap: true,
    });
  }
}

export function planSaffron(doc, track, plan, placement, assets) {
  const stage = staging(assets, plan, placement, 650000);
  const fossilFields = doc.settings.sceneryPreset === 'fossil-fields-v1';
  const density = doc.settings.density;
  const random = placement.random;
  const firstSide = random() < 0.5 ? -1 : 1;

  // The skull and bone beds are separate encounters in an open desert.
  for (const [i, site] of sites(track, plan, fossilFields ? 2 : 1).entries()) {
    const side = i ? -firstSide : firstSide;
    const angle = 0.47 + random() * 0.7;
    for (const candidate of [side, -side])
      if (
        stage.outside(i ? 'scapula' : 'skull', site, candidate, {
          id: 'ancient-fossil-' + i,
          offsets: [740, 925, 1160, 1430],
          yaw: site.yaw + candidate * angle,
          scale: i ? 2.65 : 2.15,
          embed: 0.19,
        })
      )
        break;
  }

  const duneCount = Math.round(8 + density * 10);
  for (const [i, site] of sites(track, plan, duneCount).entries()) {
    const side = Math.floor(i / 3) % 2 ? -firstSide : firstSide;
    stage.outside(random() < 0.5 ? 'dune' : 'dune-1', site, side, {
      id: 'dune-' + i,
      offsets: [330, 485, 640, 820],
      yaw: site.yaw + (random() - 0.5) * 1.1,
      scale: [2.1 + random() * 0.45, 1.95, 2.2 + random() * 0.55],
      embed: 0.1,
      overlap: true,
    });
    if (i % 3)
      stage.outside(i % 2 ? 'outcrop' : 'outcrop-1', site, -side, {
        id: 'outcrop-' + i,
        offsets: [180, 275, 420],
        scale: [1.6, 1.25 + random() * 0.4, 2.1],
        embed: 0.19,
      });
  }
  const beds = Math.round((fossilFields ? 4 : 2) + density * 3);
  for (const [i, site] of sites(track, plan, beds).entries()) {
    const side = i % 2 ? -firstSide : firstSide;
    const asset = random() > 0.55 ? 'vertebra-1' : 'rib';
    for (let j = 0; j < (density >= 0.65 ? 3 : 2); j++) {
      const along = (j - 1) * 105;
      const anchor = {
        ...site,
        x: site.x - site.right.z * along,
        z: site.z + site.right.x * along,
      };
      stage.outside(asset, anchor, side, {
        id: 'fossil-bed-' + i + '-' + j,
        offsets: [205 + j * 30, 330 + j * 30, 490 + j * 30],
        yaw: site.yaw + side * (0.43 + (j - 1) * 0.24),
        scale: [1.25, 1.3 + random() * 0.55, 1.5],
        embed: 0.21 + j * 0.055,
        overlap: true,
      });
    }
  }
  if (!placement.placements.some((record) => record.asset === 'skull'))
    stage.landmark('skull', {
      id: 'ancient-skull',
      scale: 2.15,
      embed: 0.25,
      yaw: random() * Math.PI * 2,
    });
}

export function planHelion(doc, track, plan, placement, assets) {
  const stage = staging(assets, plan, placement);
  const observatory = doc.settings.sceneryPreset === 'observatory-v1';
  const density = doc.settings.density;
  const random = placement.random;
  const firstSide = random() < 0.5 ? -1 : 1;
  const count = Math.round((observatory ? 4 : 6) + density * 7);
  for (const [i, site] of sites(track, plan, count).entries()) {
    const side = Math.floor(i / 2) % 2 ? -firstSide : firstSide;
    const tower = observatory ? i % 3 !== 1 : i % 5 === 3;
    const station = tower
      ? 'instrumenttower'
      : i % 3
        ? 'sunshield'
        : 'radiatorfan';
    const yaw = site.yaw + (side * Math.PI) / 2 + (random() - 0.5) * 0.48;
    const bank = stage.outside(station, site, side, {
      id: 'thermal-station-' + i,
      offsets: [255, 365, 515, 680],
      scale: tower ? [1.85, 2.25, 1.85] : [2.35, 2.0, 1.35],
      yaw,
      y: site.height - 120 - random() * 78,
      embed: 0,
    });
    if (!bank) continue;
    const centre = bank.bounds.getCenter(new T.Vector3());
    const along = 145 + random() * 78;
    stage.place(tower ? 'sunshield' : 'radiatorfan', {
      id: 'thermal-wing-' + i,
      x: centre.x + site.right.x * 68 * side - site.right.z * along,
      z: centre.z + site.right.z * 68 * side + site.right.x * along,
      scale: [1.7, 1.3 + random() * 0.55, 1.45],
      yaw: yaw - side * 0.24,
      y: bank.bounds.min.y + (tower ? 28 : 68),
      embed: 0,
      overlap: true,
    });
    if (density > 0.55)
      stage.place('servicegantry', {
        id: 'thermal-gallery-' + i,
        x: centre.x - site.right.x * 64 * side,
        z: centre.z - site.right.z * 64 * side,
        scale: [2.7, 1.15, 2],
        yaw,
        y: bank.bounds.min.y + 36,
        embed: 0,
        overlap: true,
      });
  }
}

export function planUmbra(doc, track, plan, placement, assets) {
  const stage = staging(assets, plan, placement);
  const quiet = doc.settings.sceneryPreset === 'quiet-vaults-v1';
  const density = doc.settings.density;
  const random = placement.random;
  const firstSide = random() < 0.5 ? -1 : 1;
  for (const [i, site] of sites(track, plan, quiet ? 1 : 2).entries())
    stage.outside(i ? 'instrument' : 'lens', site, i ? -firstSide : firstSide, {
      id: 'observatory-' + i,
      offsets: [735, 920, 1140],
      y: site.height - 140,
      yaw: site.yaw + (random() - 0.5) * 0.62,
      scale: i ? 2.6 : 2.8,
      embed: 0,
    });

  const count = Math.round((quiet ? 6 : 8) + density * 8);
  for (const [i, site] of sites(track, plan, count).entries()) {
    const side = Math.floor(i / 2) % 2 ? -firstSide : firstSide;
    const house = quiet ? 'vault' : 'wall-breach';
    const yaw = site.yaw + side * 0.42 + (random() - 0.5) * 0.7;
    const base = stage.outside('terrace', site, side, {
      id: 'ruined-foundation-' + i,
      offsets: [215, 320, 480, 640],
      y: site.height - 165 - random() * 70,
      yaw,
      scale: [1.65 + random() * 0.35, 1.42, 2.05],
      embed: 0,
    });
    if (!base) continue;
    const centre = base.bounds.getCenter(new T.Vector3());
    const along = (random() - 0.5) * 100;
    stage.place(i % 4 === 3 ? 'pier' : house, {
      id: 'ruined-hall-' + i,
      x: centre.x + site.right.x * side * 37 - site.right.z * along,
      z: centre.z + site.right.z * side * 37 + site.right.x * along,
      y: base.bounds.max.y - 60,
      yaw: yaw + side * 0.2,
      scale: [1.5, 1.6 + random() * 0.4, 1.45],
      embed: 0,
      overlap: true,
    });
    if (i % 3 === 0 && density > 0.55)
      stage.outside('rib', site, -side, {
        id: 'bearing-' + i,
        y: site.height - 75,
        offsets: [155, 260, 380],
        yaw: site.yaw,
        scale: 1.9,
        embed: 0,
      });
  }
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
  const random = placement.random;
  const firstSide = random() < 0.5 ? -1 : 1;
  const convoySize = Math.round(2 + doc.settings.density * 3);
  for (const [i, site] of sites(track, plan, convoySize).entries()) {
    const scale = 1.1 + random() * 0.35,
      source = assets.carrier;
    const side = Math.floor(i / 2) % 2 ? -firstSide : firstSide;
    const yaw = site.yaw + side * (0.46 + random() * 0.3);
    for (const offset of [760, 930, 1210, 1560]) {
      const x = site.x + site.right.x * offset * side,
        z = site.z + site.right.z * offset * side;
      const matrix = new T.Matrix4()
        .compose(
          new T.Vector3(x, plan.surfaceHeight(x, z), z),
          new T.Quaternion().setFromAxisAngle(UP, yaw),
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
      const convoyTriangles =
        source.visualTriangles + 18 * assets.wheel.visualTriangles;
      if (
        !placement.clears(assembly) ||
        placement.placements.length + 19 > 180 ||
        stage.triangles + convoyTriangles > 650000
      )
        continue;
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
          stage.add(
            'wheel',
            {
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
            },
            assembly,
          );
      break;
    }
  }
}

export function planOriel(doc, track, plan, placement, assets) {
  const stage = staging(assets, plan, placement, 500000);
  const gardens = doc.settings.sceneryPreset === 'civic-gardens-v1';
  const count = T.MathUtils.clamp(
    Math.ceil(((track?.length ?? 3000) / 360) * doc.settings.density),
    3,
    32,
  );
  const leadSide = placement.random() > 0.5 ? 1 : -1;
  for (const [i, site] of sites(track, plan, count).entries()) {
    const side = (i % 3 === 1 ? -1 : 1) * leadSide;
    const courtyard = i % 3 === 0 ? !gardens : gardens;
    const yaw = site.yaw + (placement.random() - 0.5) * 0.75;
    const scale = 2.3 + placement.random() * 1.1;
    const core = stage.outside(
      courtyard ? 'gardencourtfar' : 'waterfrontfar',
      site,
      side,
      {
        id: 'civic-' + i,
        offsets: [185, 250, 340, 455],
        yaw,
        scale,
        embed: 0.09,
      },
    );
    if (!core) continue;
    const district = core.bounds.getCenter(new T.Vector3());
    const forwardX = -site.right.z,
      forwardZ = site.right.x;
    // Group the tall civic pieces around the connected court and waterfront
    // assemblies rather than spreading individual buildings across empty land.
    for (const direction of [-1, 1]) {
      const offset = 120 + scale * 29;
      stage.place(direction === 1 ? 'tower' : 'pavilion', {
        id: 'civic-wing-' + i + '-' + direction,
        x:
          district.x + forwardX * offset * direction + site.right.x * side * 45,
        z:
          district.z + forwardZ * offset * direction + site.right.z * side * 45,
        yaw,
        scale: scale * (direction === 1 ? 0.95 : 0.75),
        embed: 0.1,
      });
    }
  }
  for (const [i, site] of sites(track, plan, count + 3).entries())
    stage.outside(i % 3 ? 'pavilion' : 'sunbracket', site, i % 2 ? 1 : -1, {
      id: 'promenade-' + i,
      offsets: [112, 175, 270, 370],
      scale: 1.65 + placement.random() * 0.5,
      embed: 0.12,
    });
}

export function planWorldspire(doc, track, plan, placement, assets) {
  const stage = staging(assets, plan, placement, 250000);
  const cloudRidges = doc.settings.sceneryPreset === 'cloud-ridges-v1';
  const scale = cloudRidges ? 0.35 : 0.43;
  const yaw = (placement.random() - 0.5) * 1.2;
  const approaches = track
    ? [0.03, 0.09, 0.13, 0.31, 0.38, 0.49, 0.63, 0.78, 0.87]
        .map((fraction) => trackSite(track, fraction * track.length))
        .filter((site) => !track.isJumpProtected(site.station))
    : [];
  const candidates = [];
  for (const site of approaches) {
    for (const distance of cloudRidges ? [3450, 4300] : [2300, 3000, 3850]) {
      for (const offset of [-950, -460, 460, 950]) {
        const x = site.x - site.right.z * distance + site.right.x * offset;
        const z = site.z + site.right.x * distance + site.right.z * offset;
        const score = approaches.reduce((sum, approach, i) => {
          const dx = x - approach.x,
            dz = z - approach.z;
          const range = Math.max(1, Math.hypot(dx, dz));
          const alignment =
            (-approach.right.z * dx + approach.right.x * dz) / range;
          const visibility = T.MathUtils.smoothstep(alignment, 0.72, 0.98);
          return sum + (visibility * (i < 3 ? 1.55 : 1)) / (1 + range / 9000);
        }, 0);
        candidates.push({ x, z, score });
      }
    }
  }
  candidates.sort((a, b) => b.score - a.score);
  // Retain the complete authored monolith. Arbitrary sector extraction would
  // expose cut passage boundaries and turn the one spire into repeated props.
  const b = plan.bounds,
    centreZ = (b.min.z + b.max.z) * 0.5;
  for (const distance of [1600, 2600, 3500])
    candidates.push(
      { x: b.min.x - distance, z: centreZ },
      { x: b.max.x + distance, z: centreZ },
    );
  for (const { x, z } of candidates)
    if (
      stage.place('monolith', {
        id: 'worldspire',
        x,
        z,
        scale,
        yaw,
        embed: 0.12,
      })
    )
      return;
}
