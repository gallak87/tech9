import * as T from 'three';
import { createRouteClearance } from '../environment/placement.js';
import { editorRandom } from './document.js';
import { buildRegionEnvironment } from './region-environment.js';
import { applyNightweirGround } from './nightweir-ground.js';
import { buildNightweirLocks } from './nightweir-locks.js';
import { enrichNightweirPlan } from './nightweir-quarters.js';
import assets from './kits/nightweir-assets.json' with { type: 'json' };

const up = new T.Vector3(0, 1, 0);
const MAX_DETAILED = 96;

function frontageMaterial(owner, name, color) {
  const material = owner.material(name, { color, roughness: 0.86 });
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
varying vec3 nwLotPosition;
varying vec3 nwLotNormal;`,
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
nwLotNormal=normal;
nwLotPosition=position;
#ifdef USE_INSTANCING
nwLotPosition*=vec3(length(instanceMatrix[0].xyz),length(instanceMatrix[1].xyz),length(instanceMatrix[2].xyz));
#endif`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
varying vec3 nwLotPosition;
varying vec3 nwLotNormal;`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
vec2 coord=vec2(abs(nwLotNormal.x)>.5?nwLotPosition.z:nwLotPosition.x,nwLotPosition.y)/vec2(5.6,4.25);
vec2 aa=clamp(fwidth(coord),.015,.49);
vec2 aperture=1.-smoothstep(vec2(.19,.23)-aa*.5,vec2(.19,.23)+aa*.5,abs(fract(coord)-.5));
float room=aperture.x*aperture.y*(1.-abs(nwLotNormal.y));
float occupied=step(.62,fract(sin(dot(floor(coord/vec2(3.,2.)),vec2(37.2,91.3)))*27123.1));
diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.048,.082,.096),room);
`,
      )
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
totalEmissiveRadiance+=room*occupied*vec3(.46,.24,.093);`,
      );
  };
  return material;
}

function yardStreet(district, paths) {
  const dx = Math.cos(district.yaw) * district.radius * 0.9;
  const dz = -Math.sin(district.yaw) * district.radius * 0.9;
  const ends = [
    { x: district.x - dx, z: district.z - dz },
    { x: district.x + dx, z: district.z + dz },
  ];
  const street = {
    id: district.id + '-lane',
    a: ends[0],
    b: ends[1],
    width: 12,
  };
  let best = Infinity,
    connector = null;
  for (const p of paths) {
    const vx = p.b.x - p.a.x,
      vz = p.b.z - p.a.z;
    for (const end of ends) {
      const t = T.MathUtils.clamp(
        ((end.x - p.a.x) * vx + (end.z - p.a.z) * vz) /
          (vx * vx + vz * vz || 1),
        0,
        1,
      );
      const b = { x: p.a.x + t * vx, z: p.a.z + t * vz };
      const distance = Math.hypot(end.x - b.x, end.z - b.z);
      if (distance < best) {
        best = distance;
        connector = { id: district.id + '-approach', a: end, b, width: 10 };
      }
    }
  }
  return connector && best > 4 && best < 720 ? [street, connector] : [street];
}

// Populate the connecting avenues as well as the district centres. A street
// crossing a canal stays a bridge; its frontages stop at the surveyed bank.
function avenuePlots(paths, plan, density) {
  const plots = [];
  for (const [i, path] of paths.entries()) {
    if (!path.id.startsWith('civic-link-') && !path.id.endsWith('-approach'))
      continue;
    const dx = path.b.x - path.a.x,
      dz = path.b.z - path.a.z,
      length = Math.hypot(dx, dz);
    if (length < 90) continue;
    const ux = dx / length,
      uz = dz / length;
    const count = Math.min(100, Math.floor(length / 64));
    for (let bay = 0; bay < count; bay++) {
      const t = (bay + 0.5) / count;
      const cx = path.a.x + t * dx,
        cz = path.a.z + t * dz;
      if (plan.surfaceHeight(cx, cz) < plan.waterHeight(cx, cz) + 1) continue;
      for (const side of [-1, 1]) {
        const seed =
          (plan.seed ^
            Math.imul(i + 1, 73477) ^
            Math.imul(bay * 2 + side + 2, 79999)) >>>
          0;
        const random = editorRandom(seed);
        if (random() > 0.38 + 0.58 * density) continue;
        const scale = 1.05 + random() * 0.35;
        const setback = path.width / 2 + 22 * scale;
        const x = cx - side * uz * setback,
          z = cz + side * ux * setback;
        plots.push({
          id: path.id + '-' + bay + '-' + side,
          x,
          z,
          yaw: Math.atan2(-uz, ux),
          type:
            plan.preset === 'reclaimed' && random() < 0.68
              ? 'trees'
              : random() < 0.24
                ? 'warehouse'
                : 'building',
          scale,
          seed,
          lod: 'far',
        });
      }
    }
  }
  return plots;
}

// The survey already owns dry district terraces, basin walls and a road graph.
// Dress those actual parcels. The expensive civic kit is reserved for foreground
// facades; a block farther away still has occupied wings, a roof and a street.
export function buildNightweirDistricts({
  doc,
  track,
  plan,
  placement,
  owner,
  materials,
  collectSolid,
}) {
  const town = enrichNightweirPlan(doc, track, plan, { foundedQuays: true });
  const paths = [...plan.paths];
  for (const ward of town.districts.slice(plan.districts.length))
    paths.push(...yardStreet(ward, plan.paths));
  if (!collectSolid) applyNightweirGround(owner, materials.soil, town, paths);
  const clears = track
    ? createRouteClearance(track, {
        spacing: 8,
        sidePadding: 30,
        localVertical: [-22, 44],
      }).clears
    : undefined;
  const paving = owner.material('Nightweir / wet quay streets', {
    color: '#565c5a',
    roughness: 0.74,
  });
  const roof = owner.material('Nightweir / zinc parapets', {
    color: '#67767a',
    roughness: 0.62,
    metalness: 0.28,
  });
  const glow = owner.material('Nightweir / sheltered quay lamps', {
    color: '#cbb089',
    emissive: '#d99b59',
    emissiveIntensity: 0.62,
  });
  const { stats } = buildRegionEnvironment(
    { ...town, chunks: [], landmarks: [], parcels: [], paths },
    {
      owner,
      materials: { ...materials, paving, roof, occupied: glow },
      clears,
      roundedBlocks: false,
    },
  );
  const locks = buildNightweirLocks({
    doc,
    plan,
    placement,
    owner,
    materials,
    roof,
    glow,
  });
  // Seat the paired streetfronts on one connected quay. Its quay wall reaches
  // the surveyed bed and its upper surface remains above the entire shoreline.
  const decks = new Map();
  for (const d of town.districts.slice(plan.districts.length)) {
    if (d.kind === 'garden') continue;
    const c = Math.cos(d.yaw),
      s = Math.sin(d.yaw);
    let top = -Infinity,
      bottom = Infinity;
    for (const u of [-82, 0, 82])
      for (const v of [-64, 0, 64]) {
        const x = d.x + u * c + v * s,
          z = d.z - u * s + v * c;
        const ground = plan.surfaceHeight(x, z);
        bottom = Math.min(bottom, ground - 1);
        top = Math.max(top, ground + 0.65, plan.waterHeight(x, z) + 3.5);
      }
    if (top - bottom > 36) continue;
    const rotation = new T.Quaternion().setFromAxisAngle(up, d.yaw);
    const bounds = new T.Box3(
      new T.Vector3(-82, bottom, -64),
      new T.Vector3(82, top + 0.4, 64),
    ).applyMatrix4(
      new T.Matrix4().makeRotationY(d.yaw).setPosition(d.x, 0, d.z),
    );
    if (!placement.clears(bounds)) continue;
    const slab = (material, x, y, z, w, h, l) =>
      owner.block(
        material.name,
        material,
        new T.Vector3(d.x + x * c + z * s, y, d.z - x * s + z * c),
        new T.Vector3(w, h, l),
        rotation,
      );
    slab(materials.concrete, 0, (top + bottom) / 2, 0, 164, top - bottom, 128);
    slab(paving, 0, top + 0.18, 0, 164, 0.36, 128);
    // The lane and pale quay nosings stay readable from elevated viaducts.
    slab(roof, 0, top + 0.37, -0.5, 163, 0.06, 12);
    for (const side of [-1, 1])
      slab(materials.concrete, 0, top + 0.37, side * 62.5, 164, 0.08, 2);
    decks.set(d.id, top + 0.38);
  }
  const brick = frontageMaterial(
    owner,
    'Nightweir / waterfront brick streetfront',
    '#986d57',
  );
  const plaster = frontageMaterial(
    owner,
    'Nightweir / pale waterfront streetfront',
    '#b6ab93',
  );
  const leaf = owner.material('Nightweir / park canopy', {
    color: '#5a7358',
    roughness: 0.96,
    flatShading: true,
  });
  const bark = owner.material('Nightweir / park trunks', {
    color: '#665748',
    roughness: 0.95,
  });
  const crown = new T.IcosahedronGeometry(1, 0);
  owner.addGeometry(crown);
  const districts = new Map(town.districts.map((d) => [d.id, d]));
  const industrial = doc.settings.sceneryPreset === 'industrial';
  const budget = Math.round(
    MAX_DETAILED * (0.55 + 0.45 * doc.settings.density),
  );
  const plots = [
    ...town.parcels,
    ...avenuePlots(paths, plan, doc.settings.density),
  ]
    .map((parcel) => {
      const district = districts.get(parcel.districtId);
      const near =
        parcel.districtId?.startsWith('quay-ward-') ||
        district?.band === 'near';
      const random = editorRandom(parcel.seed);
      const priority =
        random() +
        (!district ? -1 : near ? 1 : district.band === 'mid' ? 0.45 : 0);
      return { parcel, random, priority };
    })
    .sort((a, b) => b.priority - a.priority);
  const q = new T.Quaternion(),
    point = new T.Vector3(),
    size = new T.Vector3();
  const transform = new T.Matrix4(),
    box = new T.Box3();
  let blocks = 0,
    parks = 0;
  for (const { parcel: p, random } of plots) {
    const yaw = p.yaw,
      c = Math.cos(yaw),
      s = Math.sin(yaw);
    const garden = p.type === 'trees',
      works = p.type === 'warehouse' || p.type === 'pump';
    const wardDeck = decks.get(p.districtId);
    const landmarks = random();
    const asset = garden
      ? null
      : works
        ? p.type === 'warehouse'
          ? 'generating-house'
          : 'brick-pressureworks'
        : landmarks > 0.76
          ? 'municipal-wing'
          : landmarks < 0.16
            ? 'public-gallery'
            : 'residential-court';
    const detailed =
      p.districtId &&
      !garden &&
      placement.placements.length < budget &&
      (p.lod !== 'far' || landmarks > 0.72);
    const [lo, hi] = detailed
      ? assets[asset].bounds
      : [
          [0, 0, 0],
          [1, 1, 1],
        ];
    const width = (garden ? 42 : works ? 49 : 39) * p.scale;
    const depth = (garden ? 37 : works ? 37 : 32) * p.scale;
    const height = garden
      ? 21 * p.scale
      : ((detailed ? hi[1] - lo[1] : works ? 24 : 37) *
          (0.88 + random() * 0.44) +
          (landmarks > 0.76 && !works
            ? wardDeck !== undefined
              ? 67
              : 30
            : 0)) *
        p.scale;
    const y = [];
    let highestWater = -Infinity;
    for (const [u, v] of [
      [0, 0],
      [-0.5, -0.5],
      [0.5, -0.5],
      [-0.5, 0.5],
      [0.5, 0.5],
    ]) {
      const x = p.x + u * (width + 4) * c + v * (depth + 4) * s,
        z = p.z - u * (width + 4) * s + v * (depth + 4) * c;
      const h = plan.surfaceHeight(x, z);
      y.push(h);
      highestWater = Math.max(highestWater, plan.waterHeight(x, z));
    }
    const base = wardDeck ?? Math.max(...y) + 0.35,
      foot = wardDeck !== undefined ? base - 0.12 : Math.min(...y) - 0.45;
    if (foot < highestWater + 0.25 || base - foot > (garden ? 15 : 11))
      continue;
    q.setFromAxisAngle(up, yaw);
    transform.makeRotationFromQuaternion(q).setPosition(p.x, 0, p.z);
    box.min.set(-width / 2 - 2, foot, -depth / 2 - 2);
    box.max.set(width / 2 + 2, base + height + 0.8, depth / 2 + 2);
    box.applyMatrix4(transform);
    const id = 'frontage-' + p.id;
    if (detailed) {
      if (
        !placement.clears(box) ||
        !placement.place(asset, {
          id,
          x: p.x,
          z: p.z,
          y: base,
          embed: 0,
          yaw,
          scale: [
            width / (hi[0] - lo[0]),
            height / (hi[1] - lo[1]),
            depth / (hi[2] - lo[2]),
          ],
          solid: false,
        })
      )
        continue;
    } else if (
      !placement.acceptBounds(box, {
        id,
        solid: false,
        contactRole: 'decorative',
        type: garden ? 'grove' : 'frontage',
      })
    )
      continue;
    const block = (material, u, h, v, w, dy, d) => {
      point.set(p.x + u * c + v * s, h, p.z - u * s + v * c);
      owner.block(material.name, material, point, size.set(w, dy, d), q);
    };
    if (garden) {
      for (const [u, v] of [
        [-0.28, -0.18],
        [0.22, 0.18],
        [0.04, -0.28],
      ]) {
        const x = p.x + u * width * c + v * depth * s,
          z = p.z - u * width * s + v * depth * c;
        const h = height * (0.62 + 0.34 * random()),
          ground = plan.surfaceHeight(x, z);
        block(
          bark,
          u * width,
          ground + h * 0.28,
          v * depth,
          1.5,
          h * 0.58,
          1.5,
        );
        point.set(x, ground + h * 0.71, z);
        owner.instance(
          leaf.name,
          crown,
          leaf,
          point,
          size.set(width * 0.18, h * 0.29, depth * 0.19),
          q,
        );
      }
      parks++;
      continue;
    }
    if (wardDeck === undefined)
      block(
        materials.concrete,
        0,
        (foot + base) / 2,
        0,
        width + 4,
        base - foot,
        depth + 4,
      );
    if (detailed) continue;
    const wall = random() > (industrial ? 0.76 : 0.48) ? plaster : brick;
    const main = height * (works ? 0.76 : 0.68);
    block(wall, 0, base + main / 2, 0, width, main, depth);
    block(roof, 0, base + main + 0.45, 0, width + 1, 0.9, depth + 1);
    block(
      wall,
      -width * 0.12,
      base + (height + main) / 2,
      -depth * 0.13,
      width * 0.64,
      height - main,
      depth * 0.62,
    );
    block(
      roof,
      -width * 0.12,
      base + height + 0.4,
      -depth * 0.13,
      width * 0.66,
      0.8,
      depth * 0.64,
    );
    blocks++;
  }
  // Keep a small, representative set of detailed native collision meshes.
  const structural = new Set();
  const acceptedById = new Map(placement.accepted.map((p) => [p.id, p]));
  for (const record of placement.placements) {
    if (structural.has(record.asset) || structural.size >= 4) continue;
    record.solid = true;
    Object.assign(acceptedById.get(record.id), {
      solid: true,
      contactRole: 'structural',
    });
    structural.add(record.asset);
  }
  return {
    stats: {
      paths: stats.paths,
      quays: stats.quays,
      locks,
      streetfronts: blocks,
      parkGroves: parks,
      foundedQuarters: decks.size,
    },
    // Geometry, instance buffers and materials all belong to the regional owner.
    dispose() {},
  };
}
