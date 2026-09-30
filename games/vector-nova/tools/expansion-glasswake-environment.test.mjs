import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import * as T from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { createGlasswakeTrack } from '../src/levels/glasswake/track/model.js';
import { createGlasswakeRuntime } from '../src/levels/glasswake/runtime.js';
import { createVehicleState } from '../src/physics/index.js';
import { createGlasswakeEnvironment } from '../src/levels/glasswake/environment/index.js';
import {
  sampleCalvingState,
  sampleCaveBlend,
} from '../src/levels/glasswake/environment/event.js';
const track = createGlasswakeTrack();
const assetPath = new URL(
  '../public/assets/levels/glasswake/glasswake-environment.glb',
  import.meta.url,
);
async function loadAsset() {
  const bytes = await readFile(assetPath);
  return new GLTFLoader().parseAsync(
    bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
    '',
  );
}
const pose = (group) => {
  const result = [];
  group.traverse((node) => {
    if (/^calving_(chunk|chip)_/.test(node.name) && node.isGroup)
      result.push([...node.position.toArray(), ...node.quaternion.toArray()]);
  });
  return result;
};
test('calving cracks precede separation; distance seeking and lap reset are exact', () => {
  assert.equal(sampleCalvingState(track, { distance: 0 }).phase, 'intact');
  assert.equal(
    sampleCaveBlend(
      track,
      track.sections.find(({ id }) => id === 'gallery').start,
    ),
    1,
  );
  const warned = sampleCalvingState(track, { distance: track.bridge.start });
  assert.ok(warned.crack > 0.95);
  assert.equal(warned.separation, 0);
  assert.equal(warned.phase, 'cracking');
  assert.equal(
    sampleCalvingState(track, { distance: track.bridge.end }).phase,
    'open',
  );
  assert.deepEqual(
    sampleCalvingState(track, { distance: track.length }),
    sampleCalvingState(track, { distance: 0 }),
  );
  assert.ok(
    sampleCaveBlend(
      track,
      track.sections.find(({ id }) => id === 'gallery').showcase,
    ) > 0.9,
  );
  assert.equal(
    sampleCaveBlend(
      track,
      track.sections.find(({ id }) => id === 'rim').showcase,
    ),
    0,
  );
});
test('authored GLB builds bounded layered world and restores borrowed scene ownership', async () => {
  const scene = new T.Scene();
  const originalFog = new T.FogExp2('#111111', 0.001);
  scene.fog = originalFog;
  scene.environmentIntensity = 0.8;
  const sun = new T.DirectionalLight('#ffffff', 2);
  scene.add(sun);
  const env = createGlasswakeEnvironment({ track, view: { scene }, loadAsset });
  assert.equal(await env.ready, true);
  const report = env.group.userData.clearanceReport;
  assert.ok(report.placements.length > 250);
  for (const name of [
    'cliff_0',
    'cliff_1',
    'cliff_2',
    'cave_roof',
    'ice_curtain',
    'dark_inclusion',
    'dock_mast',
    'bell_vault',
    'landing_shelf',
    'bridge_arch',
    'basal_strata',
  ])
    assert.ok(
      report.placements.some((p) => p.name === name),
      name,
    );
  for (let s = 0; s < track.length; s += 8) {
    const p = track.sample(s).position;
    for (const entry of report.placements.filter((x) => x.checked)) {
      const [min, max] = entry.bounds;
      const hit =
        p.x >= min[0] - 27 &&
        p.x <= max[0] + 27 &&
        p.z >= min[2] - 27 &&
        p.z <= max[2] + 27 &&
        p.y + 34 >= min[1] &&
        p.y - 13 <= max[1];
      assert.equal(hit, false, `${entry.name} intersects camera/route at ${s}`);
    }
  }
  const state = { distance: track.bridge.start + 330, time: 12 };
  env.update({ state, settings: { quality: 'high', reducedMotion: false } });
  const high = pose(env.group);
  const cavityLight = env.group.getObjectByName(
    'Glasswake / revealed cavern practical',
  );
  assert.ok(cavityLight?.isPointLight);
  assert.equal(cavityLight.castShadow, false);
  const revealedIntensity = cavityLight.intensity;
  assert.ok(revealedIntensity > 0);

  assert.equal(high.length, 15);
  env.update({ state: { distance: 0, time: 0 } });
  env.update({ state, settings: { quality: 'low', reducedMotion: true } });
  assert.deepEqual(pose(env.group), high);
  assert.equal(cavityLight.intensity, revealedIntensity);
  env.update({ state: { ...state, time: 50 }, mode: 'paused' });
  assert.deepEqual(pose(env.group), high);
  assert.equal(cavityLight.intensity, revealedIntensity);
  env.reset();
  assert.equal(env.group.userData.calving.phase, 'intact');
  assert.equal(cavityLight.intensity, 0);
  assert.ok(
    pose(env.group).every((values) => values.slice(0, 3).every((x) => x === 0)),
  );
  env.update({
    state: {
      distance: track.sections.find((x) => x.id === 'gallery').showcase,
    },
  });
  assert.ok(sun.intensity < 1);
  const reflection = new T.Texture();
  let borrowedDisposed = false;
  reflection.addEventListener('dispose', () => {
    borrowedDisposed = true;
  });
  env.setReflection(reflection);
  const geometries = new Set();
  const materials = new Set();
  env.group.traverse((x) => {
    if (x.geometry) geometries.add(x.geometry);
    if (x.material) materials.add(x.material);
  });
  let geometryDisposals = 0;
  for (const geometry of geometries)
    geometry.addEventListener('dispose', () => geometryDisposals++);
  env.dispose();
  env.dispose();
  assert.equal(geometryDisposals, geometries.size);
  assert.equal(borrowedDisposed, false);
  assert.equal(scene.fog, originalFog);
  assert.equal(scene.environmentIntensity, 0.8);
  assert.equal(sun.intensity, 2);
  assert.equal(env.group.children.length, 0);
});
test('shape does not fetch assets; late asset completion disposes and failed loading rejects', async () => {
  let calls = 0;
  const shape = createGlasswakeEnvironment({
    track,
    shape: true,
    loadAsset: () => {
      calls++;
    },
  });
  await shape.ready;
  assert.equal(calls, 0);
  shape.dispose();
  let deliver;
  const late = createGlasswakeEnvironment({
    track,
    loadAsset: () =>
      new Promise((resolve) => {
        deliver = resolve;
      }),
  });
  await Promise.resolve();
  late.dispose();
  deliver(await loadAsset());
  assert.equal(await late.ready, false);
  assert.equal(late.group.children.length, 0);
  const failed = createGlasswakeEnvironment({
    track,
    loadAsset: () => Promise.reject(new Error('synthetic unavailable asset')),
  });
  await assert.rejects(failed.ready, /Glasswake environment failed to load/);
  assert.equal(failed.group.children.length, 0);
  failed.dispose();
});

test('Thawlight warms only its bounded return section and restores borrowed colors', () => {
  const scene = new T.Scene();
  const sun = new T.DirectionalLight('#d9efff', 2);
  sun.castShadow = true;
  const fill = new T.DirectionalLight('#82b4e0', 0.4);
  const ambient = new T.HemisphereLight('#7ba8db', '#203954', 0.6);
  scene.add(sun, fill, ambient);
  const baseline = [sun, fill, ambient].map((light) => light.color.toArray());
  const env = createGlasswakeEnvironment({ track, view: { scene } });
  const returnSection = track.sections.find(({ id }) => id === 'return');
  const midway = (returnSection.start + returnSection.end) * 0.5;
  env.update({ state: { distance: midway }, settings: { quality: 'high' } });
  const warm = [sun, fill, ambient].map((light) => light.color.toArray());
  assert.notDeepEqual(warm[0], baseline[0]);
  assert.notDeepEqual(warm[1], baseline[1]);
  assert.deepEqual(warm[2], baseline[2]);
  env.update({
    state: { distance: midway },
    settings: { quality: 'low', reducedMotion: true },
  });
  assert.deepEqual(
    [sun, fill, ambient].map((light) => light.color.toArray()),
    warm,
  );
  env.update({
    state: {
      distance: track.sections.find(({ id }) => id === 'gallery').showcase,
    },
  });
  assert.deepEqual(
    [sun, fill, ambient].map((light) => light.color.toArray()),
    baseline,
  );
  env.update({ state: { distance: returnSection.start } });
  assert.deepEqual(
    [sun, fill, ambient].map((light) => light.color.toArray()),
    baseline,
  );
  env.update({ state: { distance: midway } });
  env.reset();
  assert.deepEqual(
    [sun, fill, ambient].map((light) => light.color.toArray()),
    baseline,
  );
  env.update({ state: { distance: midway } });
  env.dispose();
  assert.deepEqual(
    [sun, fill, ambient].map((light) => light.color.toArray()),
    baseline,
  );
});

test('actual calving meshes clear the banked route and sampled flight/camera envelopes in five poses', async (context) => {
  const env = createGlasswakeEnvironment({ track, loadAsset });
  await env.ready;
  const corridors = [];
  // Corners use the actual rolled route frame. The box is deliberately wider
  // than the 30m deck and includes fins, ship and the ordinary chase camera.
  for (let s = 0; s < track.length; s += 4) {
    const frame = track.sample(s);
    const box = new T.Box3();
    for (const lateral of [-27, 27])
      for (const height of [-13, 34])
        for (const along of [-2.5, 2.5]) {
          box.expandByPoint(
            frame.position
              .clone()
              .addScaledVector(frame.right, lateral)
              .addScaledVector(frame.up, height)
              .addScaledVector(frame.tangent, along),
          );
        }
    corridors.push({ kind: 'route', s, box });
  }
  const routeSamples = corridors.length;
  let flightSamples = 0;
  const controls = {
    throttle: 0,
    brake: 0,
    steer: 0,
    boost: false,
    airbrake: false,
  };
  // Real runtime trajectories cover both nominal jumps, slow/long misses and
  // angled departures. Each center is expanded for the hull and chase view.
  for (const jump of track.jumps)
    for (const [speed, heading] of [
      [52, 0],
      [112, 0],
      [157, 0],
      [112, -0.27],
      [112, 0.27],
    ]) {
      const runtime = createGlasswakeRuntime({ track });
      const state = Object.assign(createVehicleState(), {
        distance: jump.takeoff - 0.25,
        speed,
        heading,
      });
      let launched = false;
      for (let step = 0; step < 1200; step++) {
        const events = runtime.advance(state, controls, 1 / 120);
        const pose = runtime.pose();
        if (runtime.snapshot().mode === 'flight' && pose) {
          launched = true;
          flightSamples++;
          const center = pose.position;
          corridors.push({
            kind: `flight ${jump.id} speed${speed} heading${heading}`,
            s: state.distance,
            box: new T.Box3(
              center.clone().add(new T.Vector3(-27, -13, -27)),
              center.clone().add(new T.Vector3(27, 34, 27)),
            ),
          });
        }
        if (events.some((event) => event.type === 'jump-transfer')) break;
      }
      assert.ok(launched, `${jump.id} sampled trajectory launched`);
      runtime.dispose();
    }
  const separationDistance = (target) => {
    if (target === 0) return track.bridge.start - 180;
    if (target === 1) return track.bridge.end;
    let low = track.bridge.start + 40;
    let high = low + 430;
    for (let step = 0; step < 40; step++) {
      const middle = (low + high) * 0.5;
      if (sampleCalvingState(track, { distance: middle }).separation < target)
        low = middle;
      else high = middle;
    }
    return (low + high) * 0.5;
  };
  let comparisons = 0;
  let meshCount = 0;
  let minimumBoundsSeparation = Infinity;
  const shelf = env.group.getObjectByName(
    'Glasswake / calving shelf and revealed cavern',
  );
  assert.ok(shelf);
  for (const fraction of [0, 0.25, 0.5, 0.75, 1]) {
    env.update({ state: { distance: separationDistance(fraction) } });
    env.group.updateMatrixWorld(true);
    const actual = [];
    shelf.traverse((mesh) => {
      if (!mesh.isMesh) return;
      mesh.geometry.computeBoundingBox();
      actual.push({
        name: mesh.name,
        box: mesh.geometry.boundingBox.clone().applyMatrix4(mesh.matrixWorld),
      });
    });
    meshCount = actual.length;
    assert.ok(
      meshCount > 70,
      'test includes the actual multipart cavity, veins, seams and moving faces',
    );
    for (const mesh of actual)
      for (const corridor of corridors) {
        comparisons++;
        const a = mesh.box,
          b = corridor.box;
        const dx = Math.max(a.min.x - b.max.x, b.min.x - a.max.x, 0);
        const dy = Math.max(a.min.y - b.max.y, b.min.y - a.max.y, 0);
        const dz = Math.max(a.min.z - b.max.z, b.min.z - a.max.z, 0);
        minimumBoundsSeparation = Math.min(
          minimumBoundsSeparation,
          Math.hypot(dx, dy, dz),
        );
        assert.equal(
          a.intersectsBox(b),
          false,
          `${mesh.name}, separation ${fraction}, ${corridor.kind} at route distance ${corridor.s.toFixed(2)}`,
        );
      }
  }
  context.diagnostic(
    JSON.stringify({
      poses: 5,
      meshCount,
      routeSamples,
      flightSamples,
      comparisons,
      minimumBoundsSeparationMetres: Number(minimumBoundsSeparation.toFixed(3)),
      scope:
        'Conservative world AABBs at five absolute event poses; route frame samples every4m and real flight at120Hz. This bounds selected poses/trajectories, not every possible player trajectory or continuous-time swept scenery.',
    }),
  );
  env.dispose();
});
