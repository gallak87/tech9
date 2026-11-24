import * as T from 'three';
import {
  createLivingForestKit,
  createWoodGeometry,
} from '@worldkit/environment/living-forest';
import { createFoliageWind } from '@worldkit/environment/weather';
import { assetURL } from '../assets/url.js';
import { createProceduralAssemblies } from './procedural-assemblies.js';
import { createDistrictWater } from './district-water.js';

const forestHorizon = {
  offsets: [420, 1050, 1950, 3350, 5600, 8800, 14000],
  heightAt(x, z, offset, plan) {
    const phase = (plan.seed % 701) * 0.06;
    const ridge = 0.54 + 0.46 * Math.sin(x * 0.0012 + z * 0.0008 + phase) ** 2;
    const foothill = (offset - 2050) / 1700;
    const distance = (offset - 5750) / 3100;
    return (
      ridge *
      (240 * Math.exp(-foothill * foothill) +
        475 * Math.exp(-distance * distance))
    );
  },
};

function forestSource(context) {
  const kit = createLivingForestKit({
    detail: 'low',
    branchFinish: 'natural',
    foliageWind: true,
    seed: 7319,
  });
  const prototypes = {},
    ownedTextures = new Set(kit.textures),
    contactGeometry = new Set();
  const wind = createFoliageWind({ maxOffset: 2.4, response: 0.6 });
  let disposed = false;
  kit.materials.wood.bumpScale = 0.75;
  kit.materials.leaf.userData.editorVisualOnly = true;
  function group(parts, name) {
    const result = new T.Group();
    result.name = name;
    for (const part of parts) {
      const mesh = new T.Mesh(part.geometry, part.material);
      mesh.name = name + ' / ' + part.kind;
      result.add(mesh);
    }
    return result;
  }
  kit.prototypes.forEach((tree, i) => {
    const prototype = group(tree.treeParts, tree.name);
    // The production kit's trunk recipe at bounded contact resolution. Branches
    // and leaves remain decorative; the complete visible canopy still reserves
    // the road/flight corridor before placement.
    const stature = [1, 0.91, 1.12][i],
      lean = [
        [6, -5],
        [17, 5],
        [-9, 7],
      ][i];
    const points = [0, 18, 44, 65, 94].map(
      (y) =>
        new T.Vector3(
          lean[0] * Math.pow(y / 90, 1.35) + Math.sin(y / 25) * 2.6,
          y * stature,
          (lean[1] * y) / 90,
        ),
    );
    const proxy = createWoodGeometry(
      points,
      [10, 7.8, 5.5, 3.7, 0.06].map((r) => r * 0.8),
      {
        segments: 12,
        sides: 8,
        lobes: 7,
        seed: (7319 + i * 517) % 17,
        fluting: 0.23,
      },
    );
    contactGeometry.add(proxy);
    for (const mesh of prototype.children)
      if (mesh.material === kit.materials.wood)
        mesh.userData.editorCollisionGeometry = proxy;
    prototypes['grove-' + i] = prototype;
  });
  prototypes.understory = group(
    kit.shrubParts,
    'Living Forest / rooted understory',
  );
  kit.rockParts.forEach((rock, i) => {
    prototypes['slate-' + i] = group(
      [rock],
      'Living Forest / slate bearing ' + i,
    );
  });
  const ready = context.collectSolid
    ? Promise.resolve()
    : (async () => {
        const loader = new T.TextureLoader();
        const names = [
          'silver-bark-color-v1.png',
          'leaf-spray-v1.png',
          'forest-granite-diff.jpg',
          'rock-boulder-normal-1k.jpg',
        ];
        const results = await Promise.allSettled(
          names.map((name) =>
            loader
              .loadAsync(assetURL('assets/editor/surfaces/' + name))
              .then((texture) => {
                if (disposed) {
                  texture.dispose();
                  return null;
                }
                ownedTextures.add(texture);
                texture.colorSpace = name.includes('normal')
                  ? T.NoColorSpace
                  : T.SRGBColorSpace;
                texture.wrapS = texture.wrapT = T.RepeatWrapping;
                texture.anisotropy = 8;
                return texture;
              }),
          ),
        );
        const failed = results.find((r) => r.status === 'rejected');
        if (failed)
          throw new Error('Vesper editor surfaces failed to load', {
            cause: failed.reason,
          });
        if (disposed) return;
        const [bark, leaf, rock, normal] = results.map((r) => r.value);
        const relief = bark.clone();
        relief.source = new T.TextureSource(bark.source.data);
        relief.colorSpace = T.NoColorSpace;
        relief.needsUpdate = true;
        ownedTextures.add(relief);
        Object.assign(kit.materials.wood, {
          map: bark,
          bumpMap: relief,
          needsUpdate: true,
        });
        Object.assign(kit.materials.leaf, { map: leaf, needsUpdate: true });
        Object.assign(kit.materials.rock, {
          map: rock,
          normalMap: normal,
          needsUpdate: true,
        });
      })();
  return {
    prototypes,
    ready,
    ownedTextures,
    kit,
    wind,
    update(frame) {
      wind.update(
        {
          time: frame.time ?? 0,
          windX: 0.35,
          windZ: 0.18,
          paused: frame.mode === 'paused',
        },
        { reducedMotion: frame.settings?.reducedMotion },
      );
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      wind.dispose();
      for (const geometry of contactGeometry) geometry.dispose();
      contactGeometry.clear();
      kit.dispose();
      // The palette owns its placeholder, while loaded surfaces belong here.
      for (const texture of ownedTextures)
        if (!kit.textures.includes(texture)) texture.dispose();
      ownedTextures.clear();
    },
  };
}

export const vesperBiomeDescriptor = {
  name: 'Vesper Living Forest',
  id: 'vesper-living-forest-v1',
  grounded: true,
  waterEnabled: true,
  farGround: true,
  exteriorRelief: forestHorizon,
  limit: 245,
  clearanceMargin: 3,
  createFinish(context) {
    return createDistrictWater(context, {
      name: 'Vesper / sheltered forest water',
      color: '#174f52',
    });
  },
  materials(owner, { finish }) {
    return finish ? { water: finish.water } : {};
  },
  build(context) {
    const source = forestSource(context);
    context.vesperSource = source;
    const kit = createProceduralAssemblies(context, source);
    const { placement, plan, track, doc, owner } = context;
    const random = placement.random;
    const wet = doc.settings.sceneryPreset.includes('river');
    const density = doc.settings.density;
    const limit = Math.round(65 + density * 84);
    const rootedGroves = [];
    let trees = 0;
    const tree = (id, asset, x, z, scale, yaw) => {
      if (trees >= limit) return;
      if (
        rootedGroves.some(
          (grove) => (x - grove.x) ** 2 + (z - grove.z) ** 2 < 54 ** 2,
        )
      )
        return false;
      if (
        kit.emit(asset, {
          id,
          x,
          z,
          scale,
          yaw,
          embed: 0.035,
          overlap: true,
        })
      ) {
        trees++;
        rootedGroves.push({ x, z });
        return true;
      }
      return false;
    };
    if (track) {
      const length = track.finishDistance ?? track.length;
      const stations = Math.min(76, Math.ceil(length / 155));
      const phase = Math.floor(random() * 7);
      for (let i = 0; i < stations; i++) {
        const distance = ((i + 0.24 + 0.5 * random()) / stations) * length;
        if (track.isJumpProtected?.(distance)) continue;
        const frame = track.sample(distance);
        const forward = frame.tangent.clone().setY(0).normalize();
        const right = new T.Vector3(forward.z, 0, -forward.x);
        const primary = Math.floor((i + phase) / 4) % 2 ? -1 : 1;
        const clearing = (i + phase) % 7 === 6;
        for (const side of [primary, -primary]) {
          const leaf = random();
          const variation = random();
          const yaw = random() * Math.PI * 2;
          const asset = 'grove-' + Math.floor(leaf * 3);
          const height = kit.localBounds[asset].getSize(new T.Vector3()).y;
          if (side !== primary && (clearing || variation > density * 0.94))
            continue;
          const along = (variation - 0.5) * 85;
          for (const offset of [110, 158, 220, 294, 365]) {
            const p = frame.position
              .clone()
              .addScaledVector(right, side * offset)
              .addScaledVector(forward, along);
            const ground = plan.surfaceHeight(p.x, p.z);
            if (ground < plan.waterHeight(p.x, p.z) - (wet ? 2 : 7)) continue;
            // Place the canopy at racing height even along high bridges.
            // Broad scaled roots are still seated in the regional slope.
            const crown = frame.position.y + (wet ? 42 : 64) + 72 * variation;
            const scale = T.MathUtils.clamp(
              (crown - ground) / (height * 0.82),
              1.08,
              wet ? 2.8 : 3.25,
            );
            const id = 'road-grove-' + i + '-' + side;
            if (!tree(id, asset, p.x, p.z, scale, yaw)) continue;
            if (!clearing && variation < 0.3 + density * 0.42) {
              p.addScaledVector(right, 63 * side).addScaledVector(
                forward,
                variation < 0.4 ? -64 : 68,
              );
              if (plan.surfaceHeight(p.x, p.z) >= plan.waterHeight(p.x, p.z))
                tree(
                  id + '-sister',
                  'grove-' + ((Math.floor(leaf * 3) + 1) % 3),
                  p.x,
                  p.z,
                  0.72 * scale,
                  yaw + 1.35,
                );
            }
            break;
          }
        }
      }
    }
    const b = plan.bounds,
      step = 190;
    const candidates = [];
    for (let z = b.min.z + 200; z < b.max.z - 180; z += step)
      for (let x = b.min.x + 200; x < b.max.x - 180; x += step) {
        const px = x + (random() - 0.5) * 130,
          pz = z + (random() - 0.5) * 130;
        if (
          plan.surfaceHeight(px, pz) <
          plan.waterHeight(px, pz) + (wet ? 12 : 4)
        )
          continue;
        candidates.push({ x: px, z: pz, rank: random() });
      }
    // Fill the regional canopy in seeded order instead of exhausting the
    // stand budget in the first corner of the survey grid.
    candidates.sort((a, b) => a.rank - b.rank);
    for (const [index, { x, z }] of candidates.entries()) {
      if (trees >= limit) break;
      tree(
        'interior-grove-' + index,
        'grove-' + Math.floor(random() * 3),
        x,
        z,
        0.8 + random() * 0.7,
        random() * Math.PI * 2,
      );
    }
    // A small number of old-growth silhouettes anchor the broad grove field.
    for (const [i, district] of plan.districts.entries()) {
      if (i % 7 || i > 21) continue;
      kit.emit('grove-' + (i % 3), {
        id: 'old-growth-' + i,
        x: district.x,
        z: district.z,
        yaw: district.yaw,
        scale: 2.35,
        embed: 0.035,
        overlap: true,
      });
    }
    let understory = 0;
    for (const p of placement.accepted.slice()) {
      if (understory >= 78) break;
      if (!p.id?.includes('grove')) continue;
      for (const side of [-1, 1]) {
        const x = p.x + side * (32 + random() * 32),
          z = p.z + (random() - 0.5) * 60;
        if (plan.surfaceHeight(x, z) < plan.waterHeight(x, z) + 3) continue;
        if (
          kit.emit('understory', {
            id: 'fern-bank-' + understory,
            x,
            z,
            scale: 0.75 + random() * 0.5,
            yaw: random() * 6,
            embed: 0.025,
            overlap: true,
          })
        )
          understory++;
      }
    }
    const ready = kit.ready.then(() => {
      if (owner.isDisposed() || context.collectSolid) return;
      owner.group.traverse((mesh) => {
        if (mesh.isInstancedMesh && mesh.geometry.getAttribute('windAnchor'))
          source.wind.bind(mesh);
      });
    });
    return {
      ready,
      update: kit.update,
      dispose: kit.dispose,
      get ownedTextures() {
        return kit.ownedTextures;
      },
      stats: { groveTrees: trees, understory },
    };
  },
  finishTerrain(materials, textures, context) {
    const rock = context.vesperSource.kit.materials.rock;
    materials.soil.map = rock.map;
    materials.soil.normalMap = rock.normalMap;
    materials.soil.normalScale.set(0.35, 0.35);
    materials.soil.roughness = 0.96;
    materials.soil.needsUpdate = true;
  },
};
