import * as T from 'three';
import { Pass } from 'three/addons/postprocessing/Pass.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { assetURL } from '../../../assets/url.js';
import { createHelionCeramicMaps } from '../../helion/track/ceramic-maps.js';
import { finishNightweirMetal, finishNightweirDeposits } from './materials.js';
import { createNightweirWater } from './water.js';
import {
  createNightweirBlackstart,
  finishNightweirWindows,
} from './blackstart.js';
import {
  finishNightweirConcrete,
  finishNightweirRock,
  finishNightweirBrick,
  finishNightweirRoof,
  finishNightweirSkyVisibility,
} from './materials.js';
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
  loadTexture = (url) => new T.TextureLoader().loadAsync(url),
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
  const blackstart = createNightweirBlackstart(track, kit);
  const concrete = [],
    rocks = new Set(),
    brick = new Set(),
    roofs = new Set();
  const ownedSurfaceTextures = new Set();
  root.traverse((o) => {
    if (!o.isMesh) return;
    o.castShadow = true;
    o.receiveShadow = true;
    for (const m of [o.material].flat()) {
      if (/wet gorge bedrock|fractured gorge outcrop/.test(m.name))
        rocks.add(m);
      if (/fired brick/.test(m.name)) brick.add(m);
      if (/weathered zinc roofing/.test(m.name)) roofs.add(m);
      if (/precast|retaining|limestone|service stone/i.test(m.name)) {
        concrete.push(m);
        finishNightweirConcrete(m, kit.basins);
        m.normalScale.set(0.48, 0.48);
        m.envMapIntensity = 0.7;
      }
      if (/oxide|ironwork|sluice enamel/i.test(m.name)) finishNightweirMetal(m);
      if (
        /occupied amber rooms|occupied pale rooms|recessed blue glass/i.test(
          m.name,
        )
      )
        finishNightweirWindows(m, blackstart.uniforms);
      if (/return contact deposits/i.test(m.name)) {
        finishNightweirDeposits(m);
        o.castShadow = false;
      }
    }
  });
  const maps = createHelionCeramicMaps(view?.renderer, concrete);
  try {
    const results = await Promise.allSettled([
      maps.ready,
      roofs.size
        ? loadTexture(
            assetURL('assets/levels/nightweir/zinc-roof-v1.png'),
          ).then((texture) => {
            ownedSurfaceTextures.add(texture);
            texture.wrapS = texture.wrapT = T.RepeatWrapping;
            texture.colorSpace = T.SRGBColorSpace;
            texture.repeat.setScalar(1 / 8);
            texture.anisotropy = Math.min(
              8,
              view?.renderer?.capabilities.getMaxAnisotropy() ?? 1,
            );
            for (const material of roofs)
              finishNightweirRoof(material, texture);
          })
        : Promise.resolve(),
      brick.size
        ? loadTexture(
            assetURL('assets/levels/nightweir/fired-brick-v1.png'),
          ).then((texture) => {
            ownedSurfaceTextures.add(texture);
            texture.wrapS = texture.wrapT = T.RepeatWrapping;
            texture.colorSpace = T.SRGBColorSpace;
            texture.repeat.setScalar(1 / 1.25);
            texture.anisotropy = Math.min(
              8,
              view?.renderer?.capabilities.getMaxAnisotropy() ?? 1,
            );
            for (const material of brick)
              finishNightweirBrick(material, texture);
          })
        : Promise.resolve(),
      rocks.size
        ? (async () => {
            const loaded = await Promise.allSettled(
              [
                'assets/levels/shatterline/limestone-v1.png',
                'assets/levels/nightweir/gorge-strata-v1.png',
                'assets/levels/nightweir/damp-scree-v1.png',
              ].map(async (path) => {
                const texture = await loadTexture(assetURL(path));
                ownedSurfaceTextures.add(texture);
                texture.wrapS = texture.wrapT = T.RepeatWrapping;
                texture.colorSpace = T.SRGBColorSpace;
                texture.anisotropy = Math.min(
                  8,
                  view?.renderer?.capabilities.getMaxAnisotropy() ?? 1,
                );
                return texture;
              }),
            );
            const failure = loaded.find(
              (result) => result.status === 'rejected',
            );
            if (failure) throw failure.reason;
            for (const material of rocks)
              finishNightweirRock(
                material,
                loaded[0].value,
                loaded[1].value,
                loaded[2].value,
              );
          })()
        : Promise.resolve(),
    ]);
    const failure = results.find((result) => result.status === 'rejected');
    if (failure) throw failure.reason;
  } catch (e) {
    maps.dispose();
    ownedSurfaceTextures.forEach((texture) => texture.dispose());
    blackstart.dispose();
    root.traverse((o) => {
      o.geometry?.dispose();
      for (const m of [o.material].flat().filter(Boolean)) m.dispose();
    });
    throw e;
  }
  const shaded = new Set();
  root.traverse((o) => {
    if (!o.isMesh) return;
    for (const material of [o.material].flat()) {
      if (shaded.has(material)) continue;
      shaded.add(material);
      finishNightweirSkyVisibility(material);
    }
  });
  // Transparent falling water must blend in linear HDR before tone mapping on
  // both presets. This borrowed pipeline marker keeps Low's AO/bloom disabled;
  // it adds no draw, target or shader of its own.
  const linearWater = new Pass();
  linearWater.needsSwap = false;
  linearWater.render = () => {};
  const detachComposition = view?.attachWorldPass?.(linearWater);
  group.add(root);
  const water = createNightweirWater(track);
  group.add(water.group, blackstart.group);
  const gateLamps = Array.from({ length: 3 }, () => {
    const l = new T.PointLight('#ffd1a1', 0, 145, 2);
    group.add(l);
    return l;
  });
  const gateFixtures = (
    kit.gates ?? track.curtains.map((_, sourceIndex) => ({ sourceIndex }))
  ).map(({ sourceIndex }) => {
    const c = track.curtains[sourceIndex];
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
    .filter((l) => l.power < 3000 || l.yard || l.landmark || l.pocket)
    .map((l) => ({ ...l, p: new T.Vector3(...l.p) }));
  let disposed = false;
  return {
    group,
    setReflection(texture) {
      water.setReflection(texture);
      blackstart.setReflection(texture);
      root.traverse((o) => {
        for (const m of [o.material].flat().filter(Boolean)) {
          m.envMap = texture;
          m.envMapIntensity = rocks.has(m)
            ? 0.35
            : /occupied amber rooms|occupied pale rooms|recessed blue glass/.test(
                  m.name,
                )
              ? 0.6
              : 0.85;
          m.needsUpdate = true;
        }
      });
    },
    update(frame = {}) {
      water.update(frame);
      blackstart.update({ ...frame, time: water.group.userData.flowTime });
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
        // A distant working destination keeps one of the same four warmed
        // slots during its flight; nearby decorative fixtures cannot crowd it out.
        const hero = track.jumps.find(
          (j) =>
            j.hero &&
            (frame.state?.distance ?? 0) >= j.takeoff - 550 &&
            (frame.state?.distance ?? 0) <= j.landingEnd + 100,
        );
        const landmark =
          hero &&
          ordered.find((f) => f.landmark === hero.id && f.d < 1400 * 1400);
        // An authored working facility can retain one existing slot while it
        // is the visible destination of an ordinary bend. This prevents four
        // close doorway lamps from blacking out the deeper machinery hall.
        const distance = frame.state?.distance ?? 0;
        const feature = ordered.find(
          (f) =>
            f.focusRange &&
            distance >= f.focusRange[0] &&
            distance <= f.focusRange[1] &&
            f.d < 1000 * 1000,
        );
        const priority = landmark || feature;
        // The visible hydraulic impact retains one of the same four warmed
        // slots alongside the rotor; nearby doorways cannot darken its spray.
        const hydraulic = ordered.find(
          (f) =>
            f.hydraulic &&
            f.focusRange &&
            distance >= f.focusRange[0] &&
            distance <= f.focusRange[1] &&
            f.d < 1400 * 1400,
        );
        const reserved = [...new Set([priority, hydraulic].filter(Boolean))];
        const pockets = ordered
          .filter(
            (f) =>
              !reserved.includes(f) &&
              !f.landmark &&
              f.pocket &&
              f.d < 600 * 600,
          )
          .slice(0, Math.min(2, 4 - reserved.length));
        const near = [
          ...reserved,
          ...pockets,
          ...ordered
            .filter(
              (f) =>
                !reserved.includes(f) && !f.landmark && !pockets.includes(f),
            )
            .slice(0, 4 - pockets.length - reserved.length),
        ];
        windows.forEach((l, i) => {
          const f = near[i];
          l.intensity =
            f &&
            f.d <
              (f.landmark || f === hydraulic
                ? 1400 * 1400
                : f === feature
                  ? 1000 * 1000
                  : f.pocket
                    ? 600 * 600
                    : 220 * 220)
              ? f.power *
                (0.12 +
                  0.88 *
                    T.MathUtils.smoothstep(
                      blackstart.uniforms.front.value,
                      f.p.z - 90,
                      f.p.z + 90,
                    ))
              : 0;
          if (f) {
            l.position.copy(f.p);
            l.color.set(f.color);
            l.distance = f.radius ?? 100;
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
      blackstart.dispose();
      maps.dispose();
      ownedSurfaceTextures.forEach((texture) => texture.dispose());
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
