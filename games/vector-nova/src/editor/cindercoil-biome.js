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

export const cindercoilBiomeDescriptor = {
  name: 'Cindercoil caldera geology',
  limit: 120,
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
    const random = placement.random;
    const furnace = doc.settings.sceneryPreset.includes('furnace');
    const families = furnace
      ? [
          'hollow-tower',
          'broken-lava-tube',
          'fractured-ridge',
          'basalt-cluster',
        ]
      : ['basalt-cluster', 'talus-apron', 'fractured-ridge', 'ash-pocket'];
    for (const [i, district] of plan.districts.entries()) {
      const asset = families[i % families.length];
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
        scale: (160 + random() * 150) / width,
        embed: asset === 'hollow-tower' ? 0.08 : 0.28,
        solid: false,
      });
    }
    // The complete distant geology remains visible and reserved; exact CPU
    // contact is spent on the actual roadside formations, with a bounded cost.
    let remainingContactFaces = 90000;
    if (track)
      for (
        let i = 0, n = Math.min(42, Math.ceil(track.length / 190));
        i < n;
        i++
      ) {
        const distance = ((i + 0.4) / n) * track.length;
        if (track.isJumpProtected?.(distance)) continue;
        const frame = track.sample(distance),
          right = new T.Vector3(frame.right.x, 0, frame.right.z).normalize();
        const asset =
          i % 4 === 0 && furnace
            ? 'hollow-tower'
            : i % 3
              ? 'basalt-cluster'
              : 'fractured-ridge';
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
              scale: (110 + random() * 70) / width,
              embed: 0.22,
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
      const asset = vents[site.id % vents.length];
      const [min, max] = assets[asset].bounds;
      const scale =
        (95 + random() * 50) / Math.max(max[0] - min[0], max[2] - min[2]);
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
