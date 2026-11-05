import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import * as T from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import createLevel from '../src/levels/ravel/index.js';
import { createCameraRig } from '../src/camera/index.js';
import { createVehicleState } from '../src/physics/index.js';
import { projectMagneticBody } from '../src/physics/magnetic-body.js';

const level = createLevel();
const track = level.createTrack();
// Actual fleet geometry supplies the same local Box3 used by the production
// rig. Only browser texture decoding is replaced in this geometry-only check.
const loader = new GLTFLoader()
  .register(() => ({
    name: 'KHR_texture_basisu',
    loadTexture: async () => new T.Texture(),
  }))
  .register(() => ({
    name: 'CPU_TEXTURES',
    loadTexture: async () => new T.Texture(),
  }));
const bytes = await readFile(
  new URL('../public/assets/ships/kestrel/kestrel.glb', import.meta.url),
);
const model = (
  await loader.parseAsync(
    bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
    '',
  )
).scene;
const bounds = new T.Box3().setFromObject(model);
const corners = [];
for (const x of [bounds.min.x, bounds.max.x])
  for (const y of [bounds.min.y, bounds.max.y])
    for (const z of [bounds.min.z, bounds.max.z])
      corners.push(new T.Vector3(x, y, z));
const resolve = (value, state) =>
  typeof value === 'function' ? value(track, state) : value;
const middle = (track.braid.splitEnd + track.braid.mergeStart) / 2;
const hero = track.jumps.find((jump) => jump.hero);
const cases = [
  ['inner branch', middle, -100],
  ['middle branch', middle, 0],
  ['outer branch', middle, 100],
  ['open left wall', 700, -400],
  ['curved right wall', 700, 400],
  ['overhanging upper wall', 700, 620],
  ['inner wing', middle + 80, -400],
  ['outer wing', middle + 80, 400],
  ['overhanging outer wing', middle + 80, 570],
  ['ordinary main road', 1450, 0],
  ['giant jump approach', hero.takeoff - 150, 0],
];

function cameraScene({ aspect = 16 / 9, viewBlend } = {}) {
  const camera = new T.PerspectiveCamera(68, aspect, 0.2, 22000);
  const subject = new T.Object3D();
  const rig = createCameraRig(camera, level.camera, bounds);
  let samples = [];
  const cameraTrack = {
    ...track,
    sampleSurface(distance, lateral) {
      const surface = track.sampleSurface(distance, lateral);
      samples.push({ distance, lateral, surface });
      return viewBlend === undefined ? surface : { ...surface, viewBlend };
    },
  };
  function frame(state) {
    track.presentationTime = state.time;
    samples = [];
    const surface = track.sampleSurface(state.distance, state.lateral);
    subject.position.copy(surface.position).addScaledVector(surface.up, 0.78);
    subject.quaternion.copy(surface.quaternion);
    const pose = {
      position: subject.position,
      quaternion: subject.quaternion,
      grounded: true,
    };
    rig.update(cameraTrack, state, 1 / 60, { subject, worldPose: pose });
    camera.updateMatrixWorld();
    subject.updateWorldMatrix(true, false);
    const projected = corners.map((corner) =>
      corner.clone().applyMatrix4(subject.matrixWorld).project(camera),
    );
    const aheadDistance =
      state.distance +
      resolve(level.camera.lookAhead, state) +
      state.speed * 0.18;
    const backDistance =
      state.distance -
      resolve(level.camera.chaseDistance, state) -
      state.speed * 0.025;
    const next = track.sampleSurface(aheadDistance, state.lateral);
    const aheadSample = samples
      .filter((sample) => Math.abs(sample.distance - aheadDistance) < 1e-6)
      .at(-1);
    const backSample = samples
      .filter((sample) => Math.abs(sample.distance - backDistance) < 1e-6)
      .at(-1);
    const projection = projectMagneticBody(
      track,
      camera.position,
      backDistance,
      state.lateral,
    );
    const clearance = camera.position
      .clone()
      .sub(projection.frame.position)
      .dot(projection.frame.up);
    return {
      surface,
      projected,
      next,
      nextScreen: next.position.clone().project(camera),
      aheadSample,
      backSample,
      clearance,
    };
  }
  return { camera, rig, frame };
}

function verify(scene, result, state, label) {
  const { camera } = scene;
  for (const point of result.projected) {
    assert.ok(
      point.x >= level.camera.safeFrame.left - 0.001 &&
        point.x <= level.camera.safeFrame.right + 0.001 &&
        point.y >= level.camera.safeFrame.bottom - 0.001 &&
        point.y <= level.camera.safeFrame.top + 0.001 &&
        point.z > -1 &&
        point.z < 1,
      `${label}: actual craft clipped at ${state.distance}: ${point.toArray()}`,
    );
  }
  assert.equal(
    result.aheadSample.lateral,
    state.lateral,
    `${label}: lookahead changed the chosen physical path`,
  );
  assert.equal(
    result.backSample.lateral,
    state.lateral,
    `${label}: eye moved to a different lateral chart`,
  );
  assert.ok(
    Math.abs(result.nextScreen.x) < 0.65 &&
      Math.abs(result.nextScreen.y) < 0.65 &&
      result.nextScreen.z > -1 &&
      result.nextScreen.z < 1,
    `${label}: chosen next surface is unreadable: ${result.nextScreen.toArray()}`,
  );
  assert.ok(
    camera.getWorldDirection(new T.Vector3()).dot(result.next.tangent) > 0.75,
    `${label}: chase looks away from the chosen path`,
  );
  assert.ok(
    result.clearance > 2.8 && result.clearance < 12,
    `${label}: eye entered the actual road: ${result.clearance}`,
  );
  assert.ok(
    camera.up.dot(result.surface.up) > 0.85,
    `${label}: horizon detached from the local bank`,
  );
  assert.ok([...camera.position, ...camera.quaternion].every(Number.isFinite));
  assert.ok(Math.abs(camera.quaternion.length() - 1) < 1e-8);
}

for (const aspect of [16 / 9, 16 / 10]) {
  test(`production Ravel chase frames the real craft and its chosen surface at desktop aspect ${aspect}`, () => {
    for (const [label, distance, lateral] of cases) {
      const scene = cameraScene({ aspect });
      const state = {
        ...createVehicleState(),
        distance,
        lateral,
        speed: 135,
        time: 1.37,
      };
      verify(scene, scene.frame(state), state, label);
    }
  });
}

test('split-route camera regression detects the former lateral scaling onto the middle road', () => {
  for (const lateral of [-100, 100]) {
    const state = {
      ...createVehicleState(),
      distance: middle,
      lateral,
      speed: 135,
      time: 0,
    };
    const broken = cameraScene({ viewBlend: 0 });
    const old = broken.frame(state);
    assert.equal(
      old.aheadSample.surface.branchId,
      'middle',
      'negative control reproduces the actual route-switching bug',
    );
    assert.throws(
      () => verify(broken, old, state, 'old lateral scaling'),
      /clipped|chosen physical path|lateral chart/,
    );
    const production = cameraScene();
    const corrected = production.frame(state);
    assert.equal(
      corrected.aheadSample.surface.branchId,
      lateral < 0 ? 'inner' : 'outer',
    );
    verify(production, corrected, state, 'production chosen branch');
  }
});

test('moving production chase transports smoothly across bank changes on branches and curled walls', () => {
  const runs = [
    ...[-100, 0, 100].map((lateral) => [
      `branch ${lateral}`,
      track.braid.splitEnd + 130,
      track.braid.mergeStart - 150,
      lateral,
    ]),
    ...[-400, 400, 620].map((lateral) => [
      `wall ${lateral}`,
      600,
      900,
      lateral,
    ]),
    ...[-400, 400, 570].map((lateral) => [
      `wing ${lateral}`,
      middle + 40,
      middle + 150,
      lateral,
    ]),
    ['ordinary main', 1350, 1550, 0],
    ['giant approach', hero.takeoff - 230, hero.takeoff - 110, 0],
  ];
  for (const [label, start, end, lateral] of runs) {
    const scene = cameraScene();
    let previous;
    for (let distance = start; distance <= end; distance += 2) {
      const state = {
        ...createVehicleState(),
        distance,
        lateral,
        speed: 135,
        time: (distance - start) / 135,
      };
      const result = scene.frame(state);
      verify(scene, result, state, label);
      if (previous) {
        assert.ok(
          scene.camera.quaternion.angleTo(previous.quaternion) < 0.15,
          `${label}: bank caused an orientation snap at ${distance}`,
        );
        assert.ok(
          scene.camera.position.distanceTo(previous.position) < 8,
          `${label}: bank caused an eye snap at ${distance}`,
        );
      }
      previous = {
        quaternion: scene.camera.quaternion.clone(),
        position: scene.camera.position.clone(),
      };
    }
  }
});
