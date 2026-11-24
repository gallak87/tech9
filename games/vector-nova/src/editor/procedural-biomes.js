import * as T from 'three';
import {
  drydock,
  solarGarden,
  habitat,
  freightPort,
  relay,
} from '../levels/orbital/environment/models.js';
import {
  fuelDepot,
  observatory,
  wheelStation,
} from '../levels/orbital/environment/stations.js';
import { compileSite } from '../levels/orbital/environment/geometry.js';
import { createOrbitalMaterials } from '../levels/orbital/environment/materials.js';
import {
  createBatches,
  facadeGeometry,
  roofGeometry,
} from '../levels/halcyon/environment/geometry.js';
import { buildRoadsideArchitecture } from '../levels/halcyon/environment/roadside.js';
import { buildSkyline } from '../levels/halcyon/environment/skyline.js';
import { createSurfaces } from '../levels/halcyon/environment/surfaces.js';
import { createColossusLandform } from '../levels/colossus/environment/mountains.js';
import { createIndustrialKit } from '@worldkit/environment/industrial';
import { assetURL } from '../assets/url.js';
import { createIndustrialBiomeFinish } from './static-biome-finishes.js';
import {
  createProceduralAssemblies,
  planManufacturedSites,
} from './procedural-assemblies.js';
import { cindercoilBiomeDescriptor } from './cindercoil-biome.js';
import { nacreBiomeDescriptor } from './nacre-biome.js';
import { createDistrictWater } from './district-water.js';
import { createFarGroundGeometry } from './far-ground.js';
import { fillRoadsideKit, roadsideScenerySites } from './roadside-scenery.js';

function placeTrackLandmark(
  { track, plan, placement },
  kit,
  { id, asset, stations, scale, floating = false, dry = false },
) {
  if (!track) return false;
  const random = placement.random;
  const firstSide = random() < 0.5 ? 1 : -1;
  const size = kit.localBounds[asset].getSize(new T.Vector3());
  const halfFootprint = (Math.hypot(size.x, size.z) * scale) / 2;
  for (const fraction of stations) {
    const station = fraction * (track.finishDistance ?? track.length);
    if (track.isJumpProtected?.(station)) continue;
    const frame = track.sample(station);
    const heading = Math.atan2(frame.tangent.x, frame.tangent.z);
    const right = new T.Vector3(Math.cos(heading), 0, -Math.sin(heading));
    for (const side of [firstSide, -firstSide])
      for (const extra of [70, 145, 260]) {
        const { x, z } = frame.position
          .clone()
          .addScaledVector(
            right,
            side * (halfFootprint + track.width / 2 + extra),
          );
        const terrain = plan.surfaceHeight(x, z);
        if (dry && terrain < plan.waterHeight(x, z) + 5) continue;
        if (!floating && terrain + size.y * scale < frame.position.y - 100)
          continue;
        if (
          kit.emit(asset, {
            id,
            x,
            z,
            y: floating ? frame.position.y - size.y * scale * 0.36 : null,
            yaw: heading + side * 0.19,
            scale,
          })
        )
          return true;
      }
  }
  return false;
}

function resourcesFor(prototypes) {
  const geometries = new Set(),
    materials = new Set(),
    textures = new Set();
  for (const prototype of Object.values(prototypes))
    prototype.traverse((node) => {
      if (node.geometry) geometries.add(node.geometry);
      for (const material of [node.material].flat().filter(Boolean)) {
        materials.add(material);
        for (const value of Object.values(material))
          if (value?.isTexture) textures.add(value);
      }
    });
  return { geometries, materials, textures };
}

function orbitalSource() {
  const materials = createOrbitalMaterials();
  Object.entries(materials).forEach(([key, material]) => {
    material.name = 'Asterion / ' + key;
  });
  const prototypes = {},
    contacts = {};
  for (const [id, create] of Object.entries({
    drydock,
    solarGarden,
    habitat,
    freightPort,
    relay,
    fuelDepot,
    observatory,
    wheelStation,
  })) {
    const parts = create();
    prototypes[id] = compileSite(
      parts,
      materials,
      new T.Matrix4(),
      'Asterion / ' + id,
    ).group;
    // Retain exact primary manufactured surfaces. Fine rings, fasteners,
    // glazing and thermal trim are decorative, as in the campaign scenery.
    const entries = parts.entries.filter((entry) => {
      if (entry.detail || ['glass', 'amber', 'solar'].includes(entry.material))
        return false;
      const size = entry.geometry.boundingBox
        .clone()
        .applyMatrix4(entry.matrix)
        .getSize(new T.Vector3());
      const faces =
        (entry.geometry.index?.count ??
          entry.geometry.attributes.position.count) / 3;
      return (
        faces <= 160 &&
        Math.max(size.x, size.y, size.z) > 30 &&
        size.x * size.y * size.z > 500
      );
    });
    contacts[id] = compileSite(
      { entries },
      materials,
      new T.Matrix4(),
      'Asterion / ' + id,
    ).group;
    const byName = new Map(
      contacts[id].children.map((node) => [node.name, node.geometry]),
    );
    prototypes[id].traverse((node) => {
      if (node.isMesh)
        node.userData.editorCollisionGeometry = byName.get(node.name) ?? false;
    });
    parts.dispose();
  }
  const resources = resourcesFor({
    ...prototypes,
    ...Object.fromEntries(
      Object.entries(contacts).map(([id, group]) => [id + '-contact', group]),
    ),
  });
  return {
    prototypes,
    maxContactFaces: 90000,
    ownedTextures: resources.textures,
    dispose() {
      resources.geometries.forEach((g) => g.dispose());
      Object.values(materials).forEach((m) => m.dispose());
      resources.textures.forEach((t) => t.dispose());
    },
  };
}

const orbital = {
  name: 'Asterion Orbital dockyards',
  suspended: true,
  limit: 42,
  build(context) {
    const kit = createProceduralAssemblies(context, orbitalSource());
    const observatories =
      context.doc.settings.sceneryPreset.includes('observatory');
    // Keep one large serviced structure near the road and let long space
    // intervals separate it from the secondary docking area.
    placeTrackLandmark(context, kit, {
      id: 'orbital-principal-station',
      asset: observatories ? 'wheelStation' : 'drydock',
      stations: [0.21, 0.33, 0.46],
      scale: observatories ? 1.47 : 1.55,
      floating: true,
    });
    placeTrackLandmark(context, kit, {
      id: 'orbital-outer-platform',
      asset: observatories ? 'observatory' : 'freightPort',
      stations: [0.67, 0.78, 0.87],
      scale: observatories ? 1.58 : 1.33,
      floating: true,
    });
    planManufacturedSites(context, kit, {
      floating: true,
      limit: observatories ? 18 : 28,
      spacing: observatories ? 575 : 415,
      families: observatories
        ? ['solarGarden', 'freightPort', 'habitat', 'relay']
        : [
            'fuelDepot',
            'freightPort',
            'solarGarden',
            'habitat',
            'relay',
            'wheelStation',
          ],
    });
    fillRoadsideKit(context, kit, {
      families: observatories
        ? ['relay', 'habitat']
        : ['relay', 'fuelDepot', 'solarGarden'],
      floating: true,
      limit: observatories ? 5 : 10,
    });
    return kit;
  },
};

function halcyonBlock(batch, garden) {
  const buildings = garden
    ? [
        [-61, -38, 63, 38, 69, '#b1a497'],
        [-61, 40, 64, 46, 57, '#a99587'],
        [56, 44, 57, 49, 100, '#97a5a6'],
      ]
    : [
        [-61, -40, 61, 55, 134, '#b1a497'],
        [-65, 37, 55, 61, 94, '#a9988a'],
        [56, -38, 63, 48, 107, '#97a5a6'],
        [37, 39, 39, 46, 72, '#b9b1a3'],
        [77, 43, 34, 56, 164, '#a9a29e'],
      ];
  for (const [x, z, width, depth, height, tint] of buildings) {
    const facade = facadeGeometry(width, depth, height, 1, 0.04);
    const roof = roofGeometry(width, depth, 0.04);
    batch.add(facade, 'stoneWindows', x, 0, z, 1, 1, 1, 0, false, tint, true);
    batch.add(roof, 'roof', x, height, z, 1, 1, 1, 0, false, tint, true);
    facade.dispose();
    roof.dispose();
  }
  batch.primitive(
    'box',
    'pavement',
    0,
    -14,
    0,
    208,
    28,
    164,
    0,
    false,
    '#a8aaa2',
    true,
  );
  batch.primitive(
    'plane',
    'road',
    0,
    0.03,
    0,
    208,
    1,
    14,
    0,
    false,
    '#8e989b',
    true,
  );
  batch.primitive(
    'plane',
    'road',
    0,
    0.035,
    0,
    164,
    1,
    14,
    Math.PI / 2,
    false,
    '#8e989b',
    true,
  );
  if (garden) {
    batch.primitive(
      'box',
      'landscape',
      53,
      0.45,
      -42,
      59,
      0.9,
      48,
      0,
      false,
      '#798b73',
      true,
    );
    for (const [x, z, height] of [
      [37, -45, 8],
      [52, -31, 11],
      [69, -50, 9],
    ])
      batch.primitive(
        'shrub',
        'vegetation',
        x,
        height * 0.48,
        z,
        14,
        height,
        12,
        0,
        false,
        '#8c9a82',
        true,
      );
  }
}

function halcyonSource(renderer, collisionOnly) {
  const fallback = {};
  const surface = !collisionOnly && renderer ? createSurfaces(renderer) : null;
  const surfaces =
    surface?.surfaces ??
    new Proxy(fallback, {
      get(target, key) {
        return (target[key] ??= new T.MeshStandardMaterial({
          name: 'Halcyon / ' + String(key),
          color: '#a6afad',
          vertexColors: true,
        }));
      },
    });
  if (surface)
    Object.entries(surfaces).forEach(([key, material]) => {
      material.name = 'Halcyon / ' + key;
    });
  const prototypes = {},
    batches = [];
  for (const [id, style, height] of [
    ['civic', 'civic', 92.4],
    ['loft', 'loft', 63],
    ['lens', 'lens', 260],
    ['crown', 'crown', 215],
    ['riverSpire', 'lens', 435],
    ['borough', 'borough', 0],
    ['gardenBorough', 'borough', 0],
  ]) {
    const group = new T.Group(),
      batch = createBatches(group, surfaces);
    if (style === 'borough') halcyonBlock(batch, id === 'gardenBorough');
    else if (id === 'civic' || id === 'loft')
      buildRoadsideArchitecture({ groundY: 0 }, batch, [
        {
          x: 0,
          z: 0,
          yaw: 0,
          w: id === 'civic' ? 38 : 32,
          d: id === 'civic' ? 96 : 78,
          height,
          style,
        },
      ]);
    else
      buildSkyline({ groundY: 0 }, batch, [
        { x: 0, z: 0, yaw: 0, height, style },
      ]);
    batches.push(batch.finish());
    // Recessed brick cores, tower shells and roofs retain their exact contact.
    // The dense exposed mullions/stringcourses remain decorative surfaces.
    group.traverse((node) => {
      if (!node.isMesh) return;
      const role = node.material.name.split('/').at(-1).trim();
      if (
        style === 'borough' ||
        (!['brick', 'roof', 'ribbonGlass', 'silverGlass'].includes(role) &&
          !(['lens', 'crown'].includes(style) && role === 'stone'))
      )
        node.userData.editorCollisionGeometry = false;
    });
    prototypes[id] = group;
  }
  const originalMaterials = new Set(
    Object.values(surface?.surfaces ?? fallback),
  );
  return {
    prototypes,
    maxContactFaces: 90000,
    ready: surface?.ready,
    ownedTextures: surface?.textures ?? [],
    update: (frame) => surface?.update(frame.time ?? 0),
    dispose() {
      batches.forEach((b) => b.dispose());
      originalMaterials.forEach((m) => m.dispose());
      surface?.textures.forEach((t) => t.dispose());
      surface?.dispose();
    },
  };
}

const halcyon = {
  name: 'Halcyon civic architecture',
  limit: 90,
  createFinish(context) {
    return createDistrictWater(context, {
      name: 'Halcyon / civic canals',
      color: '#4b6d7b',
    });
  },
  materials(owner, { finish }) {
    const soil = owner.material('Halcyon / city foundations', {
      color: '#596260',
      roughness: 0.91,
    });
    return finish ? { soil, water: finish.water } : { soil };
  },
  build(context) {
    const outskirts = context.owner.solid(
      'Halcyon / distant city foundations',
      createFarGroundGeometry(context.plan),
      context.materials.soil,
    );
    outskirts.castShadow = false;
    const kit = createProceduralAssemblies(
      context,
      halcyonSource(context.renderer, Boolean(context.collectSolid)),
    );
    const garden = context.doc.settings.sceneryPreset.includes('garden');
    placeTrackLandmark(context, kit, {
      id: 'halcyon-river-spire',
      asset: 'riverSpire',
      stations: [0.25, 0.43, 0.55, 0.76],
      scale: garden ? 0.88 : 1.15,
      dry: true,
    });
    fillHalcyonBlocks(context, kit, garden);
    planManufacturedSites(context, kit, {
      limit: garden ? 32 : 47,
      spacing: 230,
      dry: true,
      families: garden
        ? ['civic', 'loft', 'civic', 'lens']
        : ['civic', 'loft', 'lens', 'crown'],
    });
    return kit;
  },
};

function fillHalcyonBlocks({ doc, track, plan, placement }, kit, garden) {
  const density = doc.settings.density;
  const profile = garden ? 'gardenBorough' : 'borough';
  let blocks = 0;
  function place(id, x, z, yaw, scale) {
    const corners = [
      [-102, -80],
      [-102, 80],
      [102, -80],
      [102, 80],
    ];
    const heights = corners.map(([a, b]) => {
      const px = x + (a * Math.cos(yaw) + b * Math.sin(yaw)) * scale;
      const pz = z + (b * Math.cos(yaw) - a * Math.sin(yaw)) * scale;
      const ground = plan.surfaceHeight(px, pz);
      return ground > plan.waterHeight(px, pz) + 4 ? ground : -Infinity;
    });
    const base = Math.min(...heights);
    if (!Number.isFinite(base) || Math.max(...heights) - base > 26 * scale)
      return false;
    if (
      kit.emit(profile, {
        id: 'borough-' + id,
        x,
        z,
        y: base - 15 * scale,
        yaw,
        scale,
        embed: 0,
        decorative: true,
      })
    ) {
      blocks++;
      return true;
    }
    return false;
  }
  for (const site of roadsideScenerySites(track, density, 28)) {
    if (blocks >= Math.ceil((garden ? 8 : 14) * density)) break;
    const scale = 0.92 + placement.random() * 0.3;
    for (const offset of site.offsets) {
      const lateral =
        offset + Math.sign(offset) * (104 * scale + track.width / 2);
      const { x, z } = site.position
        .clone()
        .addScaledVector(site.right, lateral);
      if (!place('roadside-' + site.id, x, z, site.yaw, scale)) continue;
      const inFront = site.forward.clone().multiplyScalar(168 * scale);
      place('street-' + site.id, x + inFront.x, z + inFront.z, site.yaw, scale);
      const beside = 218 * scale * Math.sign(offset);
      place(
        'cross-street-' + site.id,
        x + site.right.x * beside,
        z + site.right.z * beside,
        site.yaw,
        scale,
      );
      break;
    }
  }
  for (const parcel of plan.parcels) {
    if (blocks >= Math.ceil((garden ? 24 : 39) * density)) break;
    if (parcel.type === 'trees' && !garden) continue;
    place(
      parcel.id,
      parcel.x,
      parcel.z,
      parcel.yaw,
      0.77 + placement.random() * 0.27,
    );
  }
}

function colossusSource(renderer, collisionOnly) {
  const finish = createIndustrialBiomeFinish(
    { renderer, collectSolid: collisionOnly },
    'colossus',
  );
  const industrial = createIndustrialKit();
  const prototypes = {};
  for (const id of [
    'factoryBay',
    'pressFrame',
    'gantry',
    'serviceTower',
    'coolingBank',
    'hydraulicBank',
    'transferBed',
    'driveGearbox',
    'serviceDeck',
  ]) {
    prototypes[id] = industrial.createAssembly(id);
    prototypes[id].traverse((node) => {
      if (!node.isMesh) return;
      const role = node.geometry.name.split(' / ').at(-1);
      // Keep actual open cast frames, casing and principal bearing supports;
      // pipe runs, retainers and exposed internal machinery are decorative.
      if (
        !['cast', 'shell'].includes(role) &&
        !(
          ['factoryBay', 'gantry', 'serviceTower'].includes(id) &&
          role === 'steel'
        ) &&
        !(id === 'factoryBay' && role === 'dark')
      )
        node.userData.editorCollisionGeometry = false;
    });
  }
  // The same presses and beds used by the campaign make two complete yards.
  // Place them atomically so a rejected frame cannot leave an isolated feed.
  const yard = (parts) => {
    const group = new T.Group();
    for (const [id, x, y, z, yaw] of parts) {
      const part = prototypes[id].clone(true);
      part.position.set(x, y, z);
      part.rotation.y = yaw;
      group.add(part);
    }
    return group;
  };
  prototypes.pressYard = yard([
    ['factoryBay', 0, 0, -62, 0],
    ['factoryBay', 0, 0, 69, 0],
    ['pressFrame', 0, 0, -6, 0],
    ['transferBed', 0, 0, 134, 0],
    ['hydraulicBank', 133, -1, -7, 0],
    ['serviceDeck', -79, 95, 2, 0],
  ]);
  prototypes.quarryYard = yard([
    ['gantry', 0, 0, -53, 0],
    ['transferBed', 0, 0, 0, 0],
    ['transferBed', 0, 0, 145, 0],
    ['driveGearbox', 74, 9, -22, Math.PI / 2],
    ['coolingBank', 116, 0, -75, 0],
    ['serviceTower', -74, 0, 59, 0],
  ]);
  const ready = Promise.resolve(finish?.ready).then(() => {
    for (const [kind, material] of Object.entries(industrial.materials))
      finish?.finishMaterial(material, {
        industrialKind: kind,
        industrialCoordinates: kind === 'machined' ? 'part' : 'world',
      });
  });
  return {
    prototypes,
    maxContactFaces: 90000,
    ready,
    ownedTextures: finish?.ownedTextures ?? [],
    dispose() {
      industrial.dispose();
      finish?.dispose();
    },
  };
}

const quarryLandforms = new WeakMap();
const colossusRim = {
  offsets: [270, 490, 910, 1570, 2450, 3850, 5800, 8500],
  heightAt(x, z, offset, plan) {
    let landform = quarryLandforms.get(plan);
    if (!landform) {
      const bounds = new T.Box3();
      for (const point of plan.roadSamples)
        bounds.expandByPoint(new T.Vector3(point.x, point.y, point.z));
      if (bounds.isEmpty())
        bounds.set(
          new T.Vector3(-1200, 0, -1200),
          new T.Vector3(1200, 0, 1200),
        );
      landform = createColossusLandform({ bounds });
      quarryLandforms.set(plan, landform);
    }
    const { center, heightAt } = landform;
    const dx = x - center.x;
    const dz = z - center.z;
    const angle = (plan.seed % 360) * (Math.PI / 180);
    const rotatedX = center.x + dx * Math.cos(angle) - dz * Math.sin(angle);
    const rotatedZ = center.z + dx * Math.sin(angle) + dz * Math.cos(angle);
    return (
      heightAt(rotatedX, rotatedZ) *
      0.52 *
      T.MathUtils.smoothstep(offset, 80, 1300) *
      (1 - T.MathUtils.smoothstep(offset, 5800, 8500))
    );
  },
};

function quarrySurface(context) {
  if (!context.renderer) return;
  const soil = context.owner.material('Colossus / exposed quarry rock', {
    color: '#797b70',
    roughness: 0.95,
  });
  let disposed = false;
  let map = null;
  const ready = new T.TextureLoader()
    .loadAsync(assetURL('assets/editor/surfaces/forest-granite-diff.jpg'))
    .then((texture) => {
      if (disposed) {
        texture.dispose();
        return;
      }
      map = texture;
      map.colorSpace = T.SRGBColorSpace;
      map.wrapS = map.wrapT = T.RepeatWrapping;
      map.anisotropy = Math.min(
        4,
        context.renderer.capabilities.getMaxAnisotropy(),
      );
      soil.map = map;
      soil.bumpMap = map;
      soil.bumpScale = 0.26;
      soil.needsUpdate = true;
    });
  return {
    soil,
    ready,
    get ownedTextures() {
      return map ? [map] : [];
    },
    dispose() {
      disposed = true;
      map?.dispose();
    },
  };
}

const colossus = {
  name: 'Colossus factory assemblies',
  limit: 75,
  exteriorRelief: colossusRim,
  createFinish: quarrySurface,
  materials(_owner, { finish }) {
    return finish ? { soil: finish.soil } : {};
  },
  build(context) {
    const kit = createProceduralAssemblies(
      context,
      colossusSource(context.renderer, Boolean(context.collectSolid)),
    );
    const quarry = context.doc.settings.sceneryPreset.includes('quarry');
    const yard = quarry ? 'quarryYard' : 'pressYard';
    placeTrackLandmark(context, kit, {
      id: 'colossus-main-works',
      asset: yard,
      stations: [0.25, 0.34, 0.46],
      scale: quarry ? 1.55 : 1.74,
    });
    placeTrackLandmark(context, kit, {
      id: 'colossus-service-works',
      asset: quarry ? 'pressYard' : 'quarryYard',
      stations: [0.63, 0.71, 0.86],
      scale: 1.21,
    });
    planManufacturedSites(context, kit, {
      limit: quarry ? 31 : 42,
      spacing: quarry ? 370 : 275,
      families: quarry
        ? [
            'gantry',
            'transferBed',
            'serviceTower',
            'driveGearbox',
            'factoryBay',
          ]
        : [
            'factoryBay',
            'pressFrame',
            'coolingBank',
            'hydraulicBank',
            'serviceTower',
          ],
    });
    return kit;
  },
};

export function proceduralBiomeDescriptor(id) {
  return (
    {
      orbital,
      halcyon,
      colossus,
      cindercoil: cindercoilBiomeDescriptor,
      nacre: nacreBiomeDescriptor,
    }[id] ?? null
  );
}
