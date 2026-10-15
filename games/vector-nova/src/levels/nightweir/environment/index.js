import * as T from 'three';
import { Pass } from 'three/addons/postprocessing/Pass.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { assetURL } from '../../../assets/url.js';
import { createHelionCeramicMaps } from '../../helion/track/ceramic-maps.js';
import { finishNightweirMetal, finishNightweirDeposits } from './materials.js';
import { createNightweirWater } from './water.js';
import { finishNightweirConcrete } from './materials.js';
import kit from '../../../../assets/levels/nightweir/water-kit.json' with { type: 'json' };
async function loadCity(url) {
  const response = await fetch(url);
  if (!response.ok)
    throw new Error('Nightweir city failed to load: ' + response.status);
  // Servers may send Content-Encoding: gzip, which fetch already decodes.
  // Sniff the payload so bare static-file hosting and HTTP decoding both work.
  let bytes = await response.arrayBuffer();
  const signature = new Uint8Array(bytes, 0, Math.min(2, bytes.byteLength));
  if (signature[0] === 0x1f && signature[1] === 0x8b) {
    const stream = new Response(bytes).body.pipeThrough(
      new DecompressionStream('gzip'),
    );
    bytes = await new Response(stream).arrayBuffer();
  }
  return new GLTFLoader().parseAsync(bytes, '');
}
export async function createNightweirEnvironment({
  track,
  view,
  shape = false,
  loadAsset = loadCity,
}) {
  const group = new T.Group();
  group.name = 'Nightweir / occupied stormwater city';
  if (shape)
    return {
      group,
      dispose() {
        group.clear();
      },
    };
  const { scene: root } = await loadAsset(
    assetURL('assets/levels/nightweir/nightweir-city.glb.gz'),
  );
  const concrete = [];
  root.traverse((o) => {
    if (!o.isMesh) return;
    o.castShadow = true;
    o.receiveShadow = true;
    for (const m of [o.material].flat()) {
      if (/precast|retaining|limestone|service stone/i.test(m.name)) {
        concrete.push(m);
        finishNightweirConcrete(m);
        m.normalScale.set(0.75, 0.75);
        m.envMapIntensity = 0.7;
      }
      if (/oxide|ironwork|sluice enamel/i.test(m.name)) finishNightweirMetal(m);
      if (/return contact deposits/i.test(m.name)) {
        finishNightweirDeposits(m);
        o.castShadow = false;
      }
    }
  });
  const maps = createHelionCeramicMaps(view?.renderer, concrete);
  try {
    await maps.ready;
  } catch (e) {
    maps.dispose();
    root.traverse((o) => {
      o.geometry?.dispose();
      for (const m of [o.material].flat().filter(Boolean)) m.dispose();
    });
    throw e;
  }
  // Transparent falling water must blend in linear HDR before tone mapping on
  // both presets. This borrowed pipeline marker keeps Low's AO/bloom disabled;
  // it adds no draw, target or shader of its own.
  const linearWater = new Pass();
  linearWater.needsSwap = false;
  linearWater.render = () => {};
  const detachComposition = view?.attachWorldPass?.(linearWater);
  group.add(root);
  const water = createNightweirWater(track);
  group.add(water.group);
  const gateLamps = Array.from({ length: 3 }, () => {
    const l = new T.PointLight('#ffd1a1', 0, 145, 2);
    group.add(l);
    return l;
  });
  const gateFixtures = track.curtains.map((c) => {
    const f = track.sample(c.s),
      right = f.right.clone().setY(0).normalize(),
      forward = new T.Vector3().crossVectors(right, new T.Vector3(0, 1, 0));
    return {
      center: f.position,
      points: [
        [-34, 57, -17, 1600],
        [34, 57, -17, 1600],
        [0, 66, -23, 2800],
      ].map(([x, y, z, power]) => ({
        p: f.position
          .clone()
          .addScaledVector(right, x)
          .add(new T.Vector3(0, y, 0))
          .addScaledVector(forward, z),
        power,
      })),
    };
  });
  const windows = Array.from({ length: 4 }, () => {
    const l = new T.PointLight('#ffc18a', 0, 100, 2);
    group.add(l);
    return l;
  });
  const fixtures = kit.lights
    .filter((l) => l.power < 3000)
    .map((l) => ({ ...l, p: new T.Vector3(...l.p) }));
  let disposed = false;
  return {
    group,
    setReflection(texture) {
      water.setReflection(texture);
      root.traverse((o) => {
        for (const m of [o.material].flat().filter(Boolean)) {
          m.envMap = texture;
          m.envMapIntensity = 0.85;
          m.needsUpdate = true;
        }
      });
    },
    update(frame = {}) {
      water.update(frame);
      if (frame.camera) {
        const gate = gateFixtures.reduce(
          (best, g) =>
            !best ||
            g.center.distanceToSquared(frame.camera.position) <
              best.center.distanceToSquared(frame.camera.position)
              ? g
              : best,
          null,
        );
        // Keep the renderer's light count constant: visibility changes compile
        // new material shaders mid-race. Zero power preserves the same culling.
        const gateActive =
          gate &&
          gate.center.distanceToSquared(frame.camera.position) < 480 * 480;
        gateLamps.forEach((l, i) => {
          l.intensity = gateActive ? gate.points[i].power : 0;
          if (gate) l.position.copy(gate.points[i].p);
        });
        const ordered = fixtures
          .map((f) => ({
            ...f,
            d: f.p.distanceToSquared(frame.camera.position),
          }))
          .sort((a, b) => a.d - b.d);
        const pockets = ordered
          .filter((f) => f.pocket && f.d < 600 * 600)
          .slice(0, 2);
        const near = [
          ...pockets,
          ...ordered
            .filter((f) => !pockets.includes(f))
            .slice(0, 4 - pockets.length),
        ];
        windows.forEach((l, i) => {
          const f = near[i];
          l.intensity =
            f && f.d < (f.pocket ? 600 * 600 : 220 * 220) ? f.power : 0;
          if (f) {
            l.position.copy(f.p);
            l.color.set(f.color);
          }
        });
      }
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      detachComposition?.();
      linearWater.dispose();
      water.dispose();
      maps.dispose();
      const gs = new Set(),
        ms = new Set();
      root.traverse((o) => {
        if (o.geometry) gs.add(o.geometry);
        for (const m of [o.material].flat().filter(Boolean)) ms.add(m);
      });
      gs.forEach((g) => g.dispose());
      ms.forEach((m) => m.dispose());
      group.clear();
    },
  };
}
