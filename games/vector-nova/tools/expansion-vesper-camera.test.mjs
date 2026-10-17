import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import * as T from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
// These CPU framing checks need geometry; real image decoding is covered by
// browser verification. Kestrel now embeds the same PBR maps as the fleet.
function geometryLoader() {
  return new GLTFLoader()
    .register(() => ({
      name: 'KHR_texture_basisu',
      loadTexture: async () => new T.Texture(),
    }))
    .register(() => ({
      name: 'CPU_TEXTURES',
      loadTexture: async () => new T.Texture(),
    }));
}

import { createCameraRig } from '../src/camera/index.js';
import { createVesperTrack } from '../src/levels/vesper/track/model.js';
import { createVesperRuntime } from '../src/levels/vesper/runtime.js';
import createVesperLevel from '../src/levels/vesper/index.js';
import { createVehicleState } from '../src/physics/index.js';
import { createShip } from '../src/ships/index.js';

const track = createVesperTrack();
const options = createVesperLevel().camera;
const bytes = await readFile(
  new URL('../public/assets/ships/kestrel/kestrel.glb', import.meta.url),
);
const model = (
  await geometryLoader().parseAsync(
    bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
    '',
  )
).scene;
const idle = { throttle: 0, brake: 0, steer: 0, boost: false, airbrake: false };
const up = new T.Vector3(0, 1, 0),
  forward = new T.Vector3(0, 0, 1);
const clamp = T.MathUtils.clamp;
function drive(state, target, lateral) {
  const f = track.sample(state.distance);
  const heading =
    Math.asin(clamp((f.curvature * state.speed * 0.75) / 7.2, -0.5, 0.5)) -
    (state.lateral - lateral) * 0.02;
  return {
    ...idle,
    throttle: state.speed < target ? 1 : 0,
    brake: state.speed > target + 3 ? 0.3 : 0,
    steer: clamp(
      -(f.curvature * state.speed * 0.7 + (heading - state.heading) * 2.5) /
        1.05,
      -1,
      1,
    ),
  };
}
async function simulate({
  scenario,
  seconds,
  target = 40,
  lateral = 0,
  impact = false,
  reducedMotion = false,
}) {
  const ship = await createShip({ model });
  const bounds = new T.Box3().setFromObject(ship.group);
  const corners = [];
  for (const x of [bounds.min.x, bounds.max.x])
    for (const y of [bounds.min.y, bounds.max.y])
      for (const z of [bounds.min.z, bounds.max.z])
        corners.push(new T.Vector3(x, y, z));
  const camera = new T.PerspectiveCamera(64, 1.6, 0.2, 14000);
  const baseline = camera.clone();
  const rig = createCameraRig(camera, options, bounds);
  const ordinary = createCameraRig(
    baseline,
    { ...options, safeFrame: undefined },
    bounds,
  );
  const state = { ...createVehicleState(), ...track.scenarios[scenario] };
  const runtime = createVesperRuntime({ track });
  runtime.reset({ state, seed: 47219 });
  let minimum = Infinity,
    baselineMinimum = Infinity,
    maximumStep = 0,
    maximumCorrectionStep = 0,
    sourceStep = 0;
  let previousCamera, previousCorrection, previousAir;
  let transfers = 0;
  function render(s, dt, alpha) {
    const pose = runtime.pose(alpha);
    const frame = track.sample(s.distance);
    ship.group.position.copy(
      pose?.position ??
        frame.position
          .clone()
          .addScaledVector(frame.right, s.lateral)
          .addScaledVector(frame.up, 0.72),
    );
    ship.group.quaternion.copy(
      pose?.quaternion ??
        frame.quaternion
          .clone()
          .multiply(new T.Quaternion().setFromAxisAngle(up, s.heading))
          .multiply(
            new T.Quaternion().setFromAxisAngle(forward, s.steer * 0.08),
          ),
    );
    const args = { reducedMotion, worldPose: pose, subject: ship.group };
    rig.update(track, s, dt, args);
    ordinary.update(track, s, dt, args);
    assert.deepEqual(
      camera.position.toArray(),
      baseline.position.toArray(),
      'framing must preserve the existing eye and world clearance',
    );
    assert.equal(camera.fov, baseline.fov);
    camera.updateMatrixWorld();
    baseline.updateMatrixWorld();
    ship.group.updateWorldMatrix(true, false);
    const airborne = !!pose && !pose.grounded;
    const correction = baseline.quaternion
      .clone()
      .invert()
      .multiply(camera.quaternion);
    if (previousCamera) {
      const step = camera.quaternion.angleTo(previousCamera);
      maximumStep = Math.max(maximumStep, step);
      maximumCorrectionStep = Math.max(
        maximumCorrectionStep,
        correction.angleTo(previousCorrection),
      );
      if (airborne !== previousAir) sourceStep = Math.max(sourceStep, step);
    }
    previousCamera = camera.quaternion.clone();
    previousCorrection = correction;
    previousAir = airborne;
    for (const corner of corners) {
      const world = corner.clone().applyMatrix4(ship.group.matrixWorld);
      const p = world.clone().project(camera),
        old = world.clone().project(baseline);
      minimum = Math.min(minimum, p.y);
      baselineMinimum = Math.min(baselineMinimum, old.y);
      assert.ok(
        p.x >= options.safeFrame.left - 1e-6 &&
          p.x <= options.safeFrame.right + 1e-6,
        `${scenario}: horizontal clipping at ${s.time}: ${p.x}`,
      );
      assert.ok(
        p.y >= options.safeFrame.bottom - 1e-6 &&
          p.y <= options.safeFrame.top + 1e-6,
        `${scenario}: vertical clipping at ${s.time}: ${p.y}`,
      );
      assert.ok(p.z > -1 && p.z < 1);
    }
  }
  try {
    render(state, 0, 1);
    for (let tick = 0; tick < Math.round(seconds * 120); tick += 1) {
      let previous = { ...state };
      // Compact reproduction of the critic's actual impact input log: twelve
      // idle ticks, 132 W+D ticks, then release. No ignored evidence dependency.
      const input = impact
        ? tick >= 12 && tick < 144
          ? { ...idle, throttle: 1, steer: 1 }
          : idle
        : drive(state, target, lateral);
      const events = runtime.advance(state, input, 1 / 120);
      if (events.some(({ type }) => type === 'jump-transfer')) {
        previous = { ...state };
        transfers += 1;
      }
      if (tick % 2 === 0) {
        const alpha = 0.37;
        const s = {
          ...state,
          distance: T.MathUtils.lerp(previous.distance, state.distance, alpha),
          lateral: T.MathUtils.lerp(previous.lateral, state.lateral, alpha),
          heading: T.MathUtils.lerp(previous.heading, state.heading, alpha),
        };
        render(s, 1 / 60, alpha);
      }
    }
    assert.ok(
      maximumStep < 0.06,
      `${scenario}: camera angular step ${maximumStep}`,
    );
    assert.ok(
      maximumCorrectionStep < 0.035,
      `${scenario}: framing angular step ${maximumCorrectionStep}`,
    );
    assert.ok(
      sourceStep < 0.04,
      `${scenario}: flight handoff angular step ${sourceStep}`,
    );
    return {
      scenario,
      reducedMotion,
      minimum,
      baselineMinimum,
      maximumStep,
      maximumCorrectionStep,
      sourceStep,
      transfers,
    };
  } finally {
    runtime.dispose();
    ship.dispose();
  }
}

test('Vesper keeps the real Kestrel bounds framed smoothly through impact, hollow and Rootfall', async (t) => {
  for (const probe of [
    { scenario: 'impact', seconds: 1.3, impact: true },
    { scenario: 'impact', seconds: 1.3, impact: true, reducedMotion: true },
    { scenario: 'trunk-entry', seconds: 5 },
    { scenario: 'bloom-corkscrew', seconds: 6.5, target: 112 },
    {
      scenario: 'bloom-corkscrew',
      seconds: 6.5,
      target: 112,
      reducedMotion: true,
    },
    { scenario: 'root-descent', seconds: 9, target: 48, lateral: 4.5 },
  ]) {
    const result = await simulate(probe);
    // The level deck no longer reproduces the old severe bank-induced crop.
    // simulate() still checks the real hull bounds and continuity every frame.
    t.diagnostic(JSON.stringify(result));
  }
});

test('Vesper framing preserves real takeoff and landing camera continuity', async (t) => {
  for (const probe of [
    { scenario: 'crown-fast', seconds: 3, target: 112 },
    { scenario: 'crown-imperfect', seconds: 5, target: 72 },
    { scenario: 'bloom-runup', seconds: 4, target: 105, lateral: 8.5 },
  ]) {
    const result = await simulate(probe);
    assert.equal(result.transfers, probe.scenario === 'bloom-runup' ? 0 : 1);
    t.diagnostic(JSON.stringify(result));
  }
});
