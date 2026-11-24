import * as T from 'three';
import metadata from './kits/cindercoil-assets.json' with { type: 'json' };
import { assetURL } from '../assets/url.js';
import { roadsideScenerySites } from './roadside-scenery.js';
import {
  createCindercoilMaterials,
  applyCindercoilAssetMaterials,
} from '../levels/cindercoil/environment/materials.js';
import {
  colorCalderaTerrain,
  createLavaPool,
} from '../levels/cindercoil/environment/geometry.js';

const assets = Object.fromEntries(
  Object.entries(metadata).map(([id, entry]) => [
    id,
    { ...entry, url: assetURL(entry.url) },
  ]),
);

const scarpParts = ['rupture-wall', 'cascade-0', 'cascade-1', 'cascade-2'];
const scarpBounds = scarpParts.reduce(
  (result, id) => {
    const [min, max] = assets[id].bounds;
    return result.union(
      new T.Box3(new T.Vector3(...min), new T.Vector3(...max)),
    );
  },
  // Include the molten apron below the three curtains.
  new T.Box3(new T.Vector3(-174, -1, 43), new T.Vector3(174, 3, 174)),
);
const up = new T.Vector3(0, 1, 0);
const calderaRim = {
  offsets: [170, 350, 540, 790, 1080, 1550, 2250, 3550, 5800],
  heightAt(x, z, offset, plan) {
    const terrain = plan.terrain;
    const angle = Math.atan2(
      z - terrain.minZ - (terrain.nz * terrain.dz) / 2,
      x - terrain.minX - (terrain.nx * terrain.dx) / 2,
    );
    const phase = (plan.seed % 997) * 0.037;
    const breakInRim = 0.31 + 0.69 * Math.abs(Math.sin(angle + phase)) ** 0.5;
    const crest =
      0.8 + 0.16 * Math.sin(angle * 5 + phase) + 0.08 * Math.sin(angle * 17);
    const inner = (offset - 790) / 530;
    const outer = (offset - 2870) / 1300;
    return (
      (890 * Math.exp(-(inner ** 2)) + 465 * Math.exp(-(outer ** 2))) *
      breakInRim *
      crest
    );
  },
};

function placeMoltenScarp(track, plan, placement, density) {
  if (!track) return;
  const random = placement.random;
  const firstSide = random() < 0.5 ? -1 : 1;
  const scale = 0.93 + random() * 0.26;
  const length = track.finishDistance ?? track.length;
  const matrix = new T.Matrix4();
  const bounds = new T.Box3();
  const rotation = new T.Quaternion();
  for (const [index, fractions] of [
    [0, [0.21, 0.29, 0.4, 0.51]],
    [1, [0.64, 0.75, 0.87]],
  ]) {
    if (index && (density < 0.85 || length < 5100)) break;
    placeSection(index, fractions);
  }

  function placeSection(index, fractions) {
    for (const fraction of fractions) {
      const station = length * fraction;
      if (track.isJumpProtected?.(station)) continue;
      const frame = track.sample(station);
      const heading = Math.atan2(frame.tangent.x, frame.tangent.z);
      const right = new T.Vector3(Math.cos(heading), 0, -Math.sin(heading));
      const preferredSide = index ? -firstSide : firstSide;
      for (const side of [preferredSide, -preferredSide]) {
        rotation.setFromAxisAngle(up, heading - side * (Math.PI / 2 - 0.21));
        for (const offset of [385, 520, 655]) {
          const position = frame.position
            .clone()
            .addScaledVector(right, offset * side);
          position.y = plan.surfaceHeight(position.x, position.z) + 3;
          matrix.compose(position, rotation, new T.Vector3().setScalar(scale));
          if (
            !placement.acceptBounds(
              bounds.copy(scarpBounds).applyMatrix4(matrix),
              {
                id: 'molten-scarp-' + index,
                asset: 'rupture-wall',
                solid: false,
              },
            )
          )
            continue;
          for (const asset of scarpParts)
            placement.add({
              id: 'molten-scarp-' + index + '-' + asset,
              asset,
              matrix,
              overlap: true,
              solid: false,
            });
          return true;
        }
      }
    }
    return false;
  }
}

export const cindercoilBiomeDescriptor = {
  name: 'Cindercoil caldera geology',
  limit: 120,
  exteriorRelief: calderaRim,
  assets,
  textures: {
    basalt: assetURL('assets/levels/cindercoil/basalt-albedo-v1.png'),
  },
  configureTexture(texture) {
    texture.colorSpace = T.SRGBColorSpace;
    texture.wrapS = texture.wrapT = T.RepeatWrapping;
    texture.anisotropy = 8;
  },
  createFinish(context) {
    const time = { value: 0 },
      rock = { value: null };
    const materials = createCindercoilMaterials({ rockTexture: rock });
    context.cinder = { time, rock, materials };
    return {
      finishMaterial(material, asset, textures) {
        rock.value = textures.basalt;
        const node = new T.Object3D();
        node.material = material;
        applyCindercoilAssetMaterials(node, time, rock);
      },
      update(frame) {
        time.value = frame.time ?? 0;
        materials.lava.uniforms.time.value = time.value;
      },
      dispose() {
        materials.basalt.dispose();
        materials.lava.dispose();
      },
    };
  },
  materials(owner, context) {
    if (context.collectSolid) return {};
    // The canonical terrain finish and GLBs share one mineral source. This
    // material is borrowed from the finish owner rather than double-owned.
    const soil = context.cinder.materials.basalt;
    soil.name = 'Cindercoil / caldera basalt';
    return { soil };
  },
  finishTerrain(materials, textures, context) {
    context.cinder.rock.value = textures.basalt;
    materials.soil.map = textures.basalt;
    materials.soil.needsUpdate = true;
  },
  plan(doc, track, plan, placement) {
    placeMoltenScarp(track, plan, placement, doc.settings.density);
    const random = placement.random;
    const furnace = doc.settings.sceneryPreset.includes('furnace');
    const families = furnace
      ? [
          'hollow-tower',
          'broken-lava-tube',
          'fractured-ridge',
          'basalt-cluster',
        ]
      : ['basalt-cluster', 'fractured-ridge', 'talus-apron', 'hollow-tower'];
    for (const [i, district] of plan.districts.entries()) {
      if (random() > doc.settings.density) continue;
      const asset = families[Math.floor(random() * families.length)];
      const range = assets[asset].bounds;
      const width = Math.max(
        range[1][0] - range[0][0],
        range[1][2] - range[0][2],
      );
      placement.place(asset, {
        id: 'caldera-' + i,
        x: district.x,
        z: district.z,
        yaw: district.yaw + (random() - 0.5) * 0.8,
        scale: (205 + random() * 215) / width,
        embed: asset === 'hollow-tower' ? 0.08 : 0.28,
        solid: false,
      });
    }
    // The complete distant geology remains visible and reserved; exact CPU
    // contact is spent on the actual roadside formations, with a bounded cost.
    let remainingContactFaces = 90000;
    if (track)
      for (
        let i = 0,
          n = Math.min(
            42,
            Math.ceil(track.length / (540 - doc.settings.density * 345)),
          );
        i < n;
        i++
      ) {
        const distance = ((i + 0.4) / n) * track.length;
        if (track.isJumpProtected?.(distance)) continue;
        const frame = track.sample(distance),
          right = new T.Vector3(frame.right.x, 0, frame.right.z).normalize();
        const asset = families[Math.floor(random() * families.length)];
        const range = assets[asset].bounds,
          width = Math.max(
            range[1][0] - range[0][0],
            range[1][2] - range[0][2],
          );
        const side = i % 2 ? -1 : 1;
        for (const offset of [145, 215, 305]) {
          const p = frame.position
            .clone()
            .addScaledVector(right, side * offset);
          const solid = assets[asset].visualTriangles <= remainingContactFaces;
          if (
            placement.place(asset, {
              id: 'road-strata-' + i,
              x: p.x,
              z: p.z,
              yaw: Math.atan2(frame.tangent.x, frame.tangent.z),
              scale: (150 + random() * 115) / width,
              embed: asset === 'hollow-tower' ? 0.11 : 0.22,
              solid,
            })
          ) {
            if (solid) remainingContactFaces -= assets[asset].visualTriangles;
            break;
          }
        }
      }
    // Alternate fractured walls and broken tubes, with isolated taller vent
    // stacks marking the caldera skyline. Height is measured from real ground.
    const vents = furnace
      ? ['hollow-tower', 'broken-lava-tube', 'fractured-ridge']
      : ['fractured-ridge', 'broken-lava-tube', 'hollow-tower', 'talus-apron'];
    for (const site of roadsideScenerySites(track, doc.settings.density, 24)) {
      const asset = vents[Math.floor(random() * vents.length)];
      const [min, max] = assets[asset].bounds;
      const scale =
        (115 + random() * 70) / Math.max(max[0] - min[0], max[2] - min[2]);
      const footprint =
        (Math.hypot(max[0] - min[0], max[2] - min[2]) * scale) / 2;
      for (const offset of site.offsets) {
        const position = site.position
          .clone()
          .addScaledVector(
            site.right,
            offset + Math.sign(offset) * (footprint + track.width / 2),
          );
        if (
          placement.place(asset, {
            id: 'roadside-vent-' + site.id,
            x: position.x,
            z: position.z,
            yaw: site.yaw + Math.sign(offset) * 0.38,
            scale,
            embed: asset === 'hollow-tower' ? 0.11 : 0.18,
            solid: false,
          })
        )
          break;
      }
    }
    return placement.placements;
  },
  build(context) {
    if (context.collectSolid) return;
    for (const mesh of context.owner.group.children)
      if (mesh.material === context.materials.soil)
        colorCalderaTerrain(mesh.geometry);
    for (const scarp of context.placement.placements) {
      if (scarp.asset !== 'rupture-wall') continue;
      const lava = createLavaPool(
        165,
        58,
        context.cinder.materials.lava,
        (context.plan.seed & 255) + 7,
      ).geometry;
      lava.translate(0, 1, 108);
      lava.applyMatrix4(scarp.matrix);
      const toe = context.owner.solid(
        'Cindercoil / lava crust at the foot of the escarpment',
        lava,
        context.cinder.materials.lava,
      );
      toe.castShadow = false;
    }
    // Lava remains a landscape surface. Active floor heat is a separately
    // deferred hazard feature; its visual never covers the road or flight path.
    for (const [i, basin] of context.plan.basins.entries()) {
      const radiusX = basin.radiusX * 0.8,
        radiusZ = basin.radiusZ * 0.8,
        y = basin.waterY - 1;
      const bounds = new T.Box3(
        new T.Vector3(basin.x - radiusX, y - 2, basin.z - radiusZ),
        new T.Vector3(basin.x + radiusX, y + 2, basin.z + radiusZ),
      );
      if (
        !context.placement.acceptBounds(bounds, {
          id: 'lava-basin-' + i,
          asset: 'lava-basin',
          overlap: true,
          solid: false,
        })
      )
        continue;
      const geometry = createLavaPool(
        radiusX,
        radiusZ,
        context.cinder.materials.lava,
        i + 3,
      ).geometry;
      geometry.translate(basin.x, y, basin.z);
      const mesh = context.owner.solid(
        'Cindercoil / retained lava basin',
        geometry,
        context.cinder.materials.lava,
      );
      mesh.castShadow = false;
    }
  },
};
