import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import createLevel from '../src/levels/colossus/index.js';
import { createColossusConveyors } from '../src/levels/colossus/environment/conveyors.js';
import { createVehicleState } from '../src/physics/index.js';
import { SHIPS } from '../src/ships/catalog.js';
import { createRaceFeedback } from '../src/effects/race-feedback.js';
import { createSurfaceProjector } from '../src/pickups/surface-projector.js';
import { collectRoadSurfaces } from '../src/pickups/device-mount.js';
import {
  CROSSFEED_RULES,
  crossfeedBounds,
  crossfeedTravel,
  sampleCrossfeed,
} from '../src/levels/colossus/mechanics.js';

const level = createLevel(),
  track = level.createTrack();
const input = {
  throttle: 1,
  brake: 0,
  steer: 0,
  boost: false,
  airbrake: false,
};
const contactEvents = (events) =>
  events.filter((event) => event.type === 'colossus-conveyor-contact');

// Rendering and force must agree even while paused/reduced-motion inspection
// changes how the camera responds to the same factual machine movement.
test('crossfeed plates and raised drive drums share the force direction and simulation clock', () => {
  const owner = createColossusConveyors({ track });
  const treads = [],
    drums = [];
  owner.group.traverse((object) => {
    if (object.name.endsWith(' / moving linked tread')) treads.push(object);
    if (object.name === 'Conveyor / live crossfeed drive drum')
      drums.push(object);
  });
  try {
    assert.equal(treads.length, track.belts.length);
    assert.ok(drums.length >= 16);
    owner.update({ time: 2, settings: { reducedMotion: true } });
    treads.forEach((tread, index) => {
      const belt = track.belts[index];
      assert.equal(tread.material.userData.travel.value, crossfeedTravel(2));
      assert.equal(tread.material.userData.side.value, belt.side);
      const { min, max } = crossfeedBounds(belt);
      const distance = (belt.start + belt.end) / 2;
      assert.equal(sampleCrossfeed(track, distance, min - 0.01, 2), null);
      assert.equal(sampleCrossfeed(track, distance, max + 0.01, 2), null);
      for (let time = 0; time < 2; time += 0.1)
        assert.ok(
          sampleCrossfeed(track, distance, belt.side * 12, time)
            .lateralAcceleration *
            belt.side >
            0,
        );
      const shader = {
        uniforms: {},
        vertexShader: '#include <common>\n#include <begin_vertex>',
        fragmentShader:
          '#include <common>\n#include <map_fragment>\n#include <roughnessmap_fragment>',
      };
      tread.material.onBeforeCompile(shader);
      assert.equal(
        shader.uniforms.crossfeedTravel,
        tread.material.userData.travel,
      );
      assert.match(
        shader.fragmentShader,
        /conveyorCoord.y\*crossfeedSide-crossfeedTravel/,
      );
      assert.doesNotMatch(shader.fragmentShader, /totalEmissiveRadiance/);
    });
    for (const drum of drums) {
      const side = Math.sign(drum.position.x);
      assert.ok(
        drum.position.y > 4,
        'drive is visible above the existing 1.25 m rim',
      );
      assert.ok(
        Math.abs(drum.position.x) - 3.5 > 36,
        'rotating drive stays off the working sheet',
      );
      assert.equal(drum.rotation.z, (-side * crossfeedTravel(2)) / 3.2);
    }
    const before = drums.map((drum) => drum.rotation.z);
    owner.update({ time: 3, settings: { reducedMotion: true } });
    assert.ok(drums.every((drum, index) => drum.rotation.z !== before[index]));
    assert.ok(
      owner.group.children.filter((object) => object.isInstancedMesh).length <=
        8,
    );
  } finally {
    owner.dispose();
  }
});

test('every tread and stationary sill follows the rendered banked triangles without adding a physical obstacle', () => {
  const road = level.createRoad({ track });
  const projector = createSurfaceProjector(
    track,
    collectRoadSurfaces(road.group),
  );
  const owner = createColossusConveyors({ track });
  const resources = new Set();
  let count = 0;
  try {
    owner.group.traverse((object) => {
      if (object.geometry) resources.add(object.geometry);
      if (object.material) resources.add(object.material);
      if (!object.userData.conveyorSurface) return;
      assert.ok(!object.userData.drivingSurface);
      const positions = object.geometry.attributes.position,
        normals = object.geometry.attributes.normal,
        coordinates = object.geometry.attributes.roadCoord;
      assert.ok(positions.count > 0);
      for (let i = 0; i < positions.count; i++) {
        const base = projector.sample(coordinates.getX(i), coordinates.getY(i));
        const point = new T.Vector3()
          .fromBufferAttribute(positions, i)
          .addScaledVector(
            new T.Vector3().fromBufferAttribute(normals, i),
            -object.userData.surfaceLift,
          );
        assert.ok(
          point.distanceTo(base) < 0.003,
          `${object.name} follows its actual triangle`,
        );
      }
      count++;
    });
    assert.equal(count, track.belts.length * 6);
    const disposed = new Map([...resources].map((resource) => [resource, 0]));
    for (const resource of resources)
      resource.addEventListener('dispose', () =>
        disposed.set(resource, disposed.get(resource) + 1),
      );
    owner.dispose();
    owner.dispose();
    assert.ok(
      [...disposed.values()].every((value) => value === 1),
      'all owned resources release exactly once',
    );
  } finally {
    owner.dispose();
    projector.dispose();
    road.dispose();
  }
});

for (const shared of [false, true])
  test(`conveyor traction, bounded contacts and replay remain physical (${shared ? 'shared dynamics' : 'standalone'})`, async () => {
    const collisionWorld = shared
      ? level.createCollisionWorld({ track })
      : null;
    const dynamics = shared
      ? await level.createDynamics({ track, collisionWorld })
      : null;
    const belt = track.belts[0];
    const makeState = () => ({
      ...createVehicleState(),
      distance: belt.start + 35,
      lateral: belt.side * 12,
      speed: 70,
    });
    const state = makeState();
    const runtime = level.createRuntime({
      track,
      collisionWorld,
      dynamics,
      presentation: false,
    });
    const step = () => {
      if (!shared) return runtime.advance(state, input, 1 / 120);
      runtime.beginAdvance(state, input, 1 / 120);
      dynamics.step(1 / 120);
      return runtime.finishAdvance(state);
    };
    try {
      runtime.reset({ state });
      const observed = [];
      for (let i = 0; i < 60; i++)
        for (const event of contactEvents(step()))
          observed.push({ ...event, time: state.time });
      assert.equal(observed[0].payload.contact, 'engage');
      assert.ok(observed.length >= 4 && observed.length <= 6);
      for (let i = 1; i < observed.length; i++)
        assert.ok(
          observed[i].time - observed[i - 1].time >=
            CROSSFEED_RULES.contactInterval - 1e-8,
        );
      assert.equal(state.energy, 100, 'conveyors do not damage the ship');
      const displacedLateral = state.lateral;
      const displacedSpeed = state.speed;
      const saved = {
        state: { ...state },
        runtime: runtime.snapshot(),
        dynamics: dynamics?.snapshot(),
      };
      const expected = [];
      for (let i = 0; i < 30; i++) expected.push(...step());
      const expectedState = { ...state };
      Object.assign(state, saved.state);
      runtime.restore(saved.runtime);
      if (dynamics) dynamics.restore(saved.dynamics);
      const actual = [];
      for (let i = 0; i < 30; i++) actual.push(...step());
      assert.deepEqual(state, expectedState);
      assert.deepEqual(actual, expected);
      runtime.reset({
        state: Object.assign(state, makeState(), { lateral: -belt.side * 22 }),
      });
      assert.equal(
        contactEvents(step()).length,
        0,
        'quiet strip produces no conveyor contact',
      );
      runtime.dispose();
      dynamics?.reset();
      const quietTrack = { ...track, belts: [] };
      const baseline = level.createRuntime({
        track: quietTrack,
        collisionWorld,
        dynamics,
        presentation: false,
      });
      const control = makeState();
      try {
        baseline.reset({ state: control });
        for (let i = 0; i < 60; i++) baseline.advance(control, input, 1 / 120);
        assert.ok(
          (displacedLateral - control.lateral) * belt.side > 0.5,
          'the moving belt carries the ship sideways relative to the identical bank and turn',
        );
        assert.ok(
          displacedSpeed < control.speed * 0.7,
          'grinder contact substantially reduces speed even against throttle',
        );
      } finally {
        baseline.dispose();
      }
    } finally {
      runtime.dispose();
      dynamics?.dispose();
      collisionWorld?.dispose();
    }
  });

test('grinder engagement is directional, settles on exit, and respects reduced motion', () => {
  const frame = (time, reducedMotion = false) => ({
    state: { time, speed: 70 },
    mode: 'racing',
    reducedMotion,
  });
  const mechanical = createRaceFeedback(),
    combat = createRaceFeedback();
  mechanical.event({
    type: 'colossus-conveyor-contact',
    time: 1,
    payload: { contact: 'engage', side: -1 },
  });
  combat.event({
    type: 'combat-hit',
    time: 1,
    payload: { kind: 'arc', side: -1 },
  });
  const bump = mechanical.update(frame(1.035));
  assert.ok(bump.position[0] < 0);
  assert.ok(Math.abs(bump.hullHeave) > 0);
  assert.ok(Math.abs(bump.hullRoll) > 0);
  assert.ok(Math.abs(bump.position[1]) > 0);
  assert.ok(bump.impact < combat.update(frame(1.035)).impact);
  assert.deepEqual(mechanical.update(frame(1.3)).position, [0, 0, 0]);
  mechanical.event({
    type: 'colossus-conveyor-contact',
    time: 2,
    payload: { contact: 'engage', side: 1 },
  });
  assert.deepEqual(mechanical.update(frame(2.03, true)).position, [0, 0, 0]);
  assert.deepEqual(mechanical.update(frame(2.04, true)).rotation, [0, 0, 0]);
});

test('every hull loses most of its speed on the grinder even under boost, without being trapped or damaged', () => {
  const belt = track.belts[0];
  for (const ship of SHIPS)
    for (const boost of [false, true]) {
      const speeds = [];
      for (const active of [false, true]) {
        const runtime = level.createRuntime({
          track: active ? track : { ...track, belts: [] },
          presentation: false,
        });
        const state = {
          ...createVehicleState(ship.id),
          distance: belt.start + 35,
          lateral: belt.side * 4,
          speed: 120,
        };
        try {
          runtime.reset({ state });
          for (let i = 0; i < 120; i++)
            runtime.advance(state, { ...input, boost }, 1 / 120);
          speeds.push(state.speed);
          assert.equal(state.resetCount, 0);
          if (!boost) assert.equal(state.energy, 100);
        } finally {
          runtime.dispose();
        }
      }
      assert.ok(
        speeds[1] < speeds[0] * 0.5,
        `${ship.id} boost=${boost}: ${speeds}`,
      );
      assert.ok(speeds[1] > 15, 'forward progress remains available');
    }
});

test('continuous grinder contact sustains bounded hull rattle and clears after exit or reduced motion', () => {
  const feedback = createRaceFeedback();
  let peak = 0;
  for (let i = 0; i < 240; i++) {
    const time = i / 120;
    if (i % 12 === 0)
      feedback.event({
        type: 'colossus-conveyor-contact',
        time,
        payload: { contact: i ? 'tread' : 'engage', side: 1, intensity: 1 },
      });
    const value = feedback.update({
      state: { time, speed: 50 },
      mode: 'racing',
    });
    peak = Math.max(peak, Math.abs(value.hullHeave));
    assert.ok(Math.abs(value.hullHeave) <= 0.145);
    assert.ok(Math.abs(value.hullRoll) <= 0.022);
  }
  assert.ok(peak > 0.12, 'the hull visibly rattles throughout contact');
  const frame = { state: { time: 2.3, speed: 50 }, mode: 'racing' };
  assert.equal(Math.abs(feedback.update(frame).hullHeave), 0);
  feedback.event({
    type: 'colossus-conveyor-contact',
    time: 2.3,
    payload: { side: 1 },
  });
  assert.equal(feedback.update({ ...frame, reducedMotion: true }).hullHeave, 0);
});

test('leaving a grinder or launching clears only mechanical rattle, preserving impacts', () => {
  for (const type of ['colossus-conveyor-exit', 'jump-launch']) {
    const mixed = createRaceFeedback(),
      impact = createRaceFeedback();
    mixed.event({
      type: 'colossus-conveyor-contact',
      time: 1,
      payload: { side: 1 },
    });
    for (const feedback of [mixed, impact])
      feedback.event({ type: 'impact', time: 1.01, payload: { side: -1 } });
    mixed.event({ type, time: 1.02 });
    const frame = { state: { time: 1.04, speed: 50 }, mode: 'racing' };
    assert.deepEqual(mixed.update(frame), impact.update(frame));
  }
});
