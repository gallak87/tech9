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
import { createIndustrialKit } from '@worldkit/environment/industrial';
import { createIndustrialBiomeFinish } from './static-biome-finishes.js';
import {
  createProceduralAssemblies,
  planManufacturedSites,
} from './procedural-assemblies.js';
import { cindercoilBiomeDescriptor } from './cindercoil-biome.js';
import { nacreBiomeDescriptor } from './nacre-biome.js';
import { createDistrictWater } from './district-water.js';
import { fillRoadsideKit, roadsideScenerySites } from './roadside-scenery.js';

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
    planManufacturedSites(context, kit, {
      floating: true,
      limit: 34,
      spacing: 340,
      families: observatories
        ? ['observatory', 'solarGarden', 'wheelStation', 'habitat', 'relay']
        : [
            'drydock',
            'fuelDepot',
            'freightPort',
            'solarGarden',
            'habitat',
            'relay',
          ],
    });
    fillRoadsideKit(context, kit, {
      families: observatories
        ? ['relay', 'habitat']
        : ['relay', 'fuelDepot', 'solarGarden'],
      floating: true,
      limit: 13,
    });
    return kit;
  },
};

function halcyonBlock(batch) {
  const buildings = [
    [-42, 0, 35, 94, 106, '#b1a497'],
    [17, -34, 67, 25, 86, '#97a5a6'],
    [19, 37, 64, 24, 136, '#a9a29e'],
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
    -9,
    0,
    128,
    18,
    110,
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
    128,
    1,
    14,
    0,
    false,
    '#8e989b',
    true,
  );
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
    ['borough', 'borough', 0],
  ]) {
    const group = new T.Group(),
      batch = createBatches(group, surfaces);
    if (id === 'borough') halcyonBlock(batch);
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
        id === 'borough' ||
        (!['brick', 'roof', 'ribbonGlass', 'silverGlass'].includes(role) &&
          !(['lens', 'crown'].includes(id) && role === 'stone'))
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
    return finish ? { water: finish.water } : {};
  },
  build(context) {
    const kit = createProceduralAssemblies(
      context,
      halcyonSource(context.renderer, Boolean(context.collectSolid)),
    );
    const garden = context.doc.settings.sceneryPreset.includes('garden');
    planManufacturedSites(context, kit, {
      limit: garden ? 38 : 52,
      spacing: 230,
      families: garden
        ? ['civic', 'loft', 'civic', 'lens']
        : ['civic', 'loft', 'lens', 'crown'],
    });
    fillHalcyonBlocks(context, kit, garden);
    return kit;
  },
};

function fillHalcyonBlocks({ doc, track, plan, placement }, kit, garden) {
  const density = doc.settings.density;
  let blocks = 0;
  function place(id, x, z, yaw, scale) {
    const corners = [
      [-64, -55],
      [-64, 55],
      [64, -55],
      [64, 55],
    ];
    const heights = corners.map(([a, b]) => {
      const px = x + (a * Math.cos(yaw) + b * Math.sin(yaw)) * scale;
      const pz = z + (b * Math.cos(yaw) - a * Math.sin(yaw)) * scale;
      const ground = plan.surfaceHeight(px, pz);
      return ground > plan.waterHeight(px, pz) + 4 ? ground : -Infinity;
    });
    const base = Math.min(...heights);
    if (!Number.isFinite(base) || Math.max(...heights) - base > 20 * scale)
      return false;
    if (
      kit.emit('borough', {
        id: 'borough-' + id,
        x,
        z,
        y: base,
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
    if (blocks >= Math.ceil((garden ? 8 : 16) * density)) break;
    const scale = 1.12 + placement.random() * 0.28;
    for (const offset of site.offsets) {
      const lateral = offset + Math.sign(offset) * 72;
      const { x, z } = site.position
        .clone()
        .addScaledVector(site.right, lateral);
      if (place('roadside-' + site.id, x, z, site.yaw, scale)) break;
    }
  }
  for (const parcel of plan.parcels) {
    if (blocks >= Math.ceil((garden ? 20 : 32) * density)) break;
    if (parcel.lod === 'far' || parcel.type === 'trees') continue;
    place(
      parcel.id,
      parcel.x,
      parcel.z,
      parcel.yaw,
      0.98 + placement.random() * 0.18,
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

const colossus = {
  name: 'Colossus factory assemblies',
  limit: 75,
  build(context) {
    const kit = createProceduralAssemblies(
      context,
      colossusSource(context.renderer, Boolean(context.collectSolid)),
    );
    const quarry = context.doc.settings.sceneryPreset.includes('quarry');
    planManufacturedSites(context, kit, {
      limit: 48,
      spacing: 240,
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
    fillColossusYards(context, kit);
    return kit;
  },
};

function fillColossusYards({ track, plan, placement, doc }, kit) {
  let yards = 0;
  for (const frame of roadsideScenerySites(track, doc.settings.density, 14)) {
    if (yards >= Math.ceil(6 * doc.settings.density)) break;
    const { id: i, right, forward, yaw } = frame;
    const scale = 1.4 + 0.35 * placement.random();
    const side = i % 2 ? -1 : 1;
    for (const offset of [248, -248, 375, -375]) {
      const site = frame.position.clone().addScaledVector(right, side * offset);
      const y = plan.surfaceHeight(site.x, site.z);
      if (frame.position.y - y > 215 || y - frame.position.y > 45) continue;
      if (
        !kit.emit('factoryBay', {
          id: 'assembly-yard-' + i,
          x: site.x,
          z: site.z,
          yaw,
          scale,
          decorative: true,
        })
      )
        continue;
      for (const [asset, distance] of [
        ['factoryBay', -122],
        ['hydraulicBank', 143],
      ]) {
        const connected = site
          .clone()
          .addScaledVector(forward, distance * scale);
        kit.emit(asset, {
          id: 'assembly-yard-' + i + '-' + distance,
          x: connected.x,
          z: connected.z,
          yaw,
          scale,
          decorative: true,
        });
      }
      yards++;
      break;
    }
  }
}

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
