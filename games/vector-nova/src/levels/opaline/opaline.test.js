import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import { createOpalineTrack } from './track/model.js';
import { createSurgeFlow } from './environment/flow.js';
import { createLifetime } from '../../core/lifecycle.js';
import {
  createOpalineSurfaceGeometry,
  createOpalineConnectorRailGeometry,
  roadIntervals,
} from './track/geometry.js';
import { createOpalineCollisionWorld } from './collision.js';
import { createOpalineRuntime, opalineGroundOptions } from './runtime.js';
import { createDevices } from './devices.js';
import { createDeviceRuntime } from '../../pickups/runtime.js';
import {
  OPALINE_SURGE_RULES,
  sampleOpalineSurge,
  sampleOpalineSurface,
} from './surges.js';
import { createVehicleState } from '../../physics/index.js';
import { createRace } from '../../race/index.js';
import { createRapierWorld } from '../../physics/rapier-world.js';
import { withMagneticBoundaries } from '../../physics/magnetic-boundaries.js';
import { advanceSession, runtimeIdentity } from '../../core/session-runtime.js';
const track = createOpalineTrack(),
  DT = 1 / 120;
const COAST = {
  throttle: 0,
  brake: 0,
  steer: 0,
  boost: false,
  airbrake: false,
};
const copy = (value) => JSON.parse(JSON.stringify(value));
const stateAt = (distance, speed = 0, time = 0, lateral = 0) => ({
  ...createVehicleState(),
  distance,
  speed,
  time,
  lateral,
});

function cross(jump, speed) {
  const state = stateAt(jump.takeoff - 0.01, speed),
    runtime = createOpalineRuntime({ track }),
    race = createRace(track, { rulesId: runtime.rulesId }),
    events = [];
  runtime.reset({ state, seed: 7 });
  race.placeScenario(state.distance);
  race.valid = true;
  for (let i = 0; i < 1200; i++) {
    const before = state.distance,
      next = runtime.advance(state, COAST, DT);
    events.push(...next);
    race.step(before, state.distance, DT, next);
    if (next.some((e) => e.type === 'jump-transfer')) break;
  }
  runtime.dispose();
  return {
    state,
    events,
    race,
    transfer: events.find((e) => e.type === 'jump-transfer'),
  };
}

test('Opaline is a closed six-kilometre route with smooth finite banked frames and two honest gaps', () => {
  assert.ok(track.length > 5500 && track.length < 6500);
  assert.equal(track.width, 32);
  assert.equal(track.closed, true);
  let maxCurve = 0,
    maxTurn = 0,
    low = Infinity,
    high = -Infinity;
  for (let s = 0; s < track.length; s += 2) {
    const f = track.sample(s);
    for (const key of ['position', 'up', 'right', 'tangent'])
      assert.ok(f[key].toArray().every(Number.isFinite));
    assert.ok(Math.abs(f.up.length() - 1) < 1e-8);
    assert.ok(Math.abs(f.up.dot(f.tangent)) < 1e-8);
    assert.ok(f.right.clone().cross(f.up).dot(f.tangent) > 0.99999);
    maxCurve = Math.max(maxCurve, Math.abs(f.curvature));
    maxTurn = Math.max(maxTurn, f.up.angleTo(track.sample(s + 1).up));
    low = Math.min(low, f.position.y);
    high = Math.max(high, f.position.y);
  }
  assert.ok(high - low > 120);
  assert.ok(maxCurve < 0.026, `curvature ${maxCurve}`);
  assert.ok(maxTurn < 0.025, `frame step ${maxTurn}`);
  assert.ok(
    track.sample(0).position.distanceTo(track.sample(track.length).position) <
      1e-8,
  );
  assert.ok(track.sample(-0.01).up.angleTo(track.sample(0.01).up) < 0.001);
  for (const jump of track.jumps) {
    assert.ok(track.isGap((jump.takeoff + jump.landingStart) / 2));
    assert.ok(jump.landingEnd - jump.landingStart > 240);
    assert.equal(
      track.checkpoints.filter(
        (c) => c.distance > jump.takeoff && c.distance <= jump.recovery,
      ).length,
      1,
    );
  }
  const devices = createDevices(track);
  assert.deepEqual([...new Set(devices.map((device) => device.type))].sort(), [
    'aegis',
    'arc',
    'ion',
    'repulsor',
    'vector',
  ]);
  assert.ok(
    devices.every(
      (device, index) =>
        index === 0 || device.distance > devices[index - 1].distance,
    ),
  );
});

test('visible and collision shelf tops share finite exact coordinates, material cuts and empty gaps', () => {
  const geometry = createOpalineSurfaceGeometry(track),
    world = createOpalineCollisionWorld({ track });
  try {
    const pos = geometry.attributes.position,
      coords = geometry.attributes.roadCoord;
    for (let i = 0; i < pos.count; i++) {
      const s = coords.getX(i),
        lateral = coords.getY(i),
        expected = track
          .sample(s)
          .position.addScaledVector(track.sample(s).right, lateral),
        actual = new T.Vector3().fromBufferAttribute(pos, i);
      assert.ok(actual.distanceTo(expected) < 0.001, `top at ${s}/${lateral}`);
      assert.ok(Math.abs(lateral) <= 16);
      assert.ok(
        !track.jumps.some(
          (j) => s > j.takeoff + 0.001 && s < j.landingStart - 0.001,
        ),
      );
    }
    for (const triangle of world.triangles.filter((t) => t.kind === 'deck'))
      assert.ok(
        triangle.roadCoordinates &&
          triangle.roadCoordinates.every(
            ([s, x]) =>
              Number.isFinite(s) &&
              x >= -16 &&
              x <= (track.sampleSurface(s, x)?.bounds.max ?? 16) + 0.001,
          ),
      );
    const spans = roadIntervals(track);
    assert.ok(
      spans.some((s) => s.constructed) && spans.some((s) => !s.constructed),
    );
    for (const span of spans)
      assert.ok(!track.isGap((span.start + span.end) / 2));
    assert.equal(
      withMagneticBoundaries(track, world).triangles.length,
      world.triangles.length,
    );
    assert.ok(
      world.triangles
        .filter((t) => t.kind === 'rail')
        .every((t) =>
          track.constructedIntervals.some(
            (span) => t.start === span.start && t.end === span.end,
          ),
        ),
    );
    for (const side of [-1, 1]) {
      const rail = createOpalineConnectorRailGeometry(track, {
        ...track.constructedIntervals[0],
        side,
      });
      assert.ok([...rail.attributes.roadCoord.array].every(Number.isFinite));
      rail.dispose();
    }
  } finally {
    geometry.dispose();
    world.dispose();
  }
});

test('three-second pressure warnings precede moving currents, and inner shelter reduces their force', () => {
  for (const zone of track.surgeZones) {
    const warningTime = (((2.9 - zone.phaseOffset) % 18) + 18) % 18,
      activeTime = (((6 - zone.phaseOffset) % 18) + 18) % 18;
    const warning = sampleOpalineSurge(zone, warningTime);
    assert.ok(warning.warning > 0.99);
    assert.equal(warning.active, false);
    assert.equal(warning.strength, 0);
    const active = sampleOpalineSurge(zone, activeTime);
    assert.equal(active.active, true);
    assert.equal(active.warning, 0);
    assert.ok(
      Math.abs(active.headDistance - (zone.start + zone.end) / 2) < 1e-8,
    );
    const exposed = sampleOpalineSurface(
        track,
        stateAt(active.headDistance, 65, activeTime, -8),
      ),
      shelter = sampleOpalineSurface(
        track,
        stateAt(active.headDistance, 65, activeTime, 12),
      );
    assert.ok(exposed.strength > 0.99);
    assert.ok(
      Math.abs(
        shelter.strength / exposed.strength -
          OPALINE_SURGE_RULES.shelteredForce,
      ) < 1e-8,
    );
    if (zone.kind === 'along') {
      assert.ok(exposed.forwardAcceleration > 17);
      assert.equal(exposed.lateralAcceleration, 0);
    } else {
      assert.ok(exposed.lateralAcceleration < -8);
      assert.equal(exposed.forwardAcceleration, 0);
    }
    assert.deepEqual(
      sampleOpalineSurge(zone, activeTime),
      sampleOpalineSurge(zone, activeTime + 18),
    );
    assert.deepEqual(
      sampleOpalineSurge(zone, activeTime),
      sampleOpalineSurge(zone, activeTime),
    );
    const later = sampleOpalineSurge(zone, activeTime + 0.5);
    assert.ok(later.headDistance > active.headDistance);
  }
});

test('current sampling is pure, pause-stable and presentation-independent; runtime snapshots continue exactly', () => {
  const zone = track.surgeZones[0],
    state = stateAt((zone.start + zone.end) / 2, 65, 6, -8),
    before = copy(state);
  assert.deepEqual(
    opalineGroundOptions(track, state),
    opalineGroundOptions(track, state),
  );
  assert.deepEqual(state, before);
  const high = createOpalineRuntime({ track, settings: { quality: 'high' } }),
    low = createOpalineRuntime({
      track,
      settings: { quality: 'low', reducedMotion: true },
    });
  assert.deepEqual(runtimeIdentity(high), runtimeIdentity(low));
  high.reset({ state, seed: 7 });
  for (let i = 0; i < 20; i++) high.advance(state, COAST, DT);
  const twin = copy(state);
  low.restore(copy(high.snapshot()));
  const paused = copy(state),
    snapshot = copy(high.snapshot());
  assert.deepEqual(high.advance(state, COAST, 0), []);
  assert.deepEqual(state, paused);
  assert.deepEqual(high.snapshot(), snapshot);
  for (let i = 0; i < 80; i++)
    assert.deepEqual(
      high.advance(state, COAST, DT),
      low.advance(twin, COAST, DT),
    );
  assert.deepEqual(state, twin);
  assert.deepEqual(high.snapshot(), low.snapshot());
  high.dispose();
  low.dispose();
});

test('tail currents accelerate and cross currents push the moving craft; shelter reduces displacement', () => {
  for (const zone of track.surgeZones.slice(0, 2)) {
    const clock = (((6 - zone.phaseOffset) % 18) + 18) % 18,
      results = [];
    for (const lateral of [-8, 12]) {
      const state = stateAt((zone.start + zone.end) / 2, 65, clock, lateral),
        runtime = createOpalineRuntime({ track });
      runtime.reset({ state, seed: 7 });
      for (let i = 0; i < 45; i++) runtime.advance(state, COAST, DT);
      results.push(state);
      runtime.dispose();
    }
    if (zone.kind === 'along')
      assert.ok(results[0].speed - results[1].speed > 2);
    else assert.ok(results[0].lateralSpeed < results[1].lateralSpeed - 0.5);
  }
});

test('both fractures land at ordinary and boosted speeds while short approaches recover with a time cost', () => {
  for (const jump of track.jumps) {
    for (const speed of [65, 90, 112, 140]) {
      const result = cross(jump, speed);
      assert.equal(
        result.transfer?.payload.outcome,
        'landed',
        `${jump.id}/${speed}`,
      );
      assert.ok(result.race.valid);
      assert.equal(
        result.race.checkpoint,
        track.checkpoints.findIndex((c) => c.distance === jump.landingStart),
      );
      assert.ok(result.state.distance < jump.landingEnd);
    }
    const short = cross(jump, 40);
    assert.equal(short.transfer?.payload.outcome, 'recovered');
    assert.ok(short.state.time >= 1.5);
    assert.ok(Math.abs(short.state.distance - jump.recovery) < 1e-8);
    assert.ok(
      short.events.some(
        (e) => e.type === 'jump-miss' && e.payload.reason === 'short',
      ),
    );
  }
});

test('ground-only currents do not alter airborne motion or its replay continuation', () => {
  const jump = track.jumps[0],
    state = stateAt(jump.takeoff - 0.01, 102, 6),
    a = createOpalineRuntime({ track });
  a.reset({ state, seed: 9 });
  for (let i = 0; i < 35; i++) a.advance(state, COAST, DT);
  assert.equal(a.snapshot().mode, 'flight');
  const altered = {
    ...track,
    surgeZones: [
      {
        id: 'air-force-fixture',
        kind: 'cross',
        start: jump.takeoff - 100,
        end: jump.takeoff + 100,
        phaseOffset: 0,
      },
    ],
  };
  const b = createOpalineRuntime({ track: altered }),
    other = copy(state);
  b.restore(copy(a.snapshot()));
  assert.ok(sampleOpalineSurface(altered, other).strength > 0);
  for (let i = 0; i < 45; i++) {
    assert.deepEqual(a.advance(state, COAST, DT), b.advance(other, COAST, DT));
    assert.deepEqual(state, other);
  }
  assert.deepEqual(a.pose(1).position, b.pose(1).position);
  a.dispose();
  b.dispose();
});

test('production dynamics lands on the shared mineral top and allows a genuine exposed-edge fall', async (t) => {
  const collisionWorld = createOpalineCollisionWorld({ track }),
    dynamics = await createRapierWorld({
      collisionWorld: withMagneticBoundaries(track, collisionWorld),
    });
  t.after(() => {
    dynamics.dispose();
    collisionWorld.dispose();
  });
  for (const jump of track.jumps) {
    const runtime = createOpalineRuntime({ track, collisionWorld, dynamics }),
      state = stateAt(jump.takeoff - 2, 102),
      race = createRace(track, { rulesId: runtime.rulesId, untimed: true }),
      events = [];
    runtime.reset({ state, seed: 7 });
    race.placeScenario(state.distance);
    for (let i = 0; i < 600; i++) {
      const next = [];
      advanceSession({
        state,
        runtime,
        dynamics,
        race,
        input: COAST,
        dt: DT,
        emit: (event) => next.push(event),
      });
      events.push(...next);
      if (next.some((e) => e.type === 'jump-transfer')) break;
    }
    assert.equal(
      events.find((e) => e.type === 'jump-transfer')?.payload.outcome,
      'landed',
      jump.id,
    );
    assert.ok(!events.some((e) => e.type === 'jump-miss'));
    runtime.dispose();
  }
  const runtime = createOpalineRuntime({ track, collisionWorld, dynamics }),
    state = {
      ...stateAt(track.sections[1].start + 90, 60, 0, -15.5),
      lateralSpeed: -8,
      heading: -0.18,
    },
    race = createRace(track, { rulesId: runtime.rulesId, untimed: true });
  runtime.reset({ state, seed: 7 });
  race.placeScenario(state.distance);
  let falling = false;
  for (let i = 0; i < 60; i++) {
    advanceSession({
      state,
      runtime,
      dynamics,
      race,
      input: COAST,
      dt: DT,
      emit() {},
    });
    if (runtime.pose(1)?.recovering) {
      falling = true;
      break;
    }
  }
  assert.ok(
    falling,
    'finite shelf support must release beyond its exposed edge',
  );
  runtime.dispose();
});

test('both jump approaches work from rest through actual throttle and authored Vector strips', async (t) => {
  const collisionWorld = createOpalineCollisionWorld({ track }),
    dynamics = await createRapierWorld({
      collisionWorld: withMagneticBoundaries(track, collisionWorld),
    });
  t.after(() => {
    dynamics.dispose();
    collisionWorld.dispose();
  });
  for (const [index, jump] of track.jumps.entries()) {
    const runtime = createDeviceRuntime({
      track,
      devices: createDevices(track),
      motion: createOpalineRuntime({ track, collisionWorld, dynamics }),
    });
    const state = stateAt(index === 0 ? 0 : jump.takeoff - 125),
      race = createRace(track, { rulesId: runtime.rulesId, untimed: true }),
      events = [];
    runtime.reset({ state, seed: 7 });
    race.placeScenario(state.distance);
    for (let i = 0; i < 1500; i++) {
      const next = [];
      advanceSession({
        state,
        runtime,
        dynamics,
        race,
        input: { ...COAST, throttle: 1 },
        dt: DT,
        emit: (e) => next.push(e),
      });
      events.push(...next);
      if (next.some((e) => e.type === 'jump-transfer')) break;
    }
    assert.ok(
      events.some(
        (e) => e.type === 'pickup-activate' && e.payload.kind === 'vector',
      ),
    );
    assert.equal(
      events.find((e) => e.type === 'jump-transfer')?.payload.outcome,
      'landed',
      jump.id,
    );
    assert.ok(
      !events.some((e) => e.type === 'road-recovery' || e.type === 'jump-miss'),
      jump.id,
    );
    runtime.dispose();
  }
});

test('production staged currents push or accelerate the real body, with reduced force in the sheltered lane', async () => {
  const collisionWorld = createOpalineCollisionWorld({ track });
  const physicalWorld = withMagneticBoundaries(track, collisionWorld);
  async function trial(zone, lateral, withCurrent) {
    const rulesTrack = withCurrent ? track : { ...track, surgeZones: [] };
    const dynamics = await createRapierWorld({ collisionWorld: physicalWorld }),
      runtime = createOpalineRuntime({
        track: rulesTrack,
        collisionWorld,
        dynamics,
      });
    const time = (((6 - zone.phaseOffset) % 18) + 18) % 18,
      state = stateAt((zone.start + zone.end) / 2, 65, time, lateral),
      race = createRace(rulesTrack, {
        rulesId: runtime.rulesId,
        untimed: true,
      });
    runtime.reset({ state, seed: 7 });
    race.placeScenario(state.distance);
    try {
      for (let tick = 0; tick < 120; tick++)
        advanceSession({
          state,
          runtime,
          dynamics,
          race,
          input: COAST,
          dt: DT,
          emit() {},
        });
      assert.ok(
        runtime.pose(1).grounded,
        'comparison stays on the actual road skin',
      );
      return { lateral: state.lateral, speed: state.speed };
    } finally {
      runtime.dispose();
      dynamics.dispose();
    }
  }
  try {
    for (const zone of track.surgeZones.slice(0, 2)) {
      const changes = [];
      for (const lateral of [-8, 12]) {
        const calm = await trial(zone, lateral, false),
          current = await trial(zone, lateral, true);
        changes.push(
          zone.kind === 'cross'
            ? current.lateral - calm.lateral
            : current.speed - calm.speed,
        );
      }
      const [exposed, sheltered] = changes;
      if (zone.kind === 'cross')
        assert.ok(exposed < -0.25, `outward displacement ${exposed}`);
      else assert.ok(exposed > 3, `forward speed gain ${exposed}`);
      assert.ok(
        Math.abs(sheltered) < Math.abs(exposed) * 0.45,
        `sheltered ${sheltered}, exposed ${exposed}`,
      );
      assert.equal(Math.sign(sheltered), Math.sign(exposed));
    }
  } finally {
    collisionWorld.dispose();
  }
});

// The exact sheet owns the road. Source/drain curtains must not overpaint its
// sheltered lane or pretend to occupy a different lane in the force shader.
test('cross-current curtains meet the road edges with truthful shelter coordinates', () => {
  const lifetime = createLifetime();
  try {
    for (const zone of track.surgeZones.filter(
      (zone) => zone.kind === 'cross',
    )) {
      const flow = createSurgeFlow(track, zone, lifetime);
      assert.equal(flow.curtains.length, 2);
      for (const curtain of flow.curtains) {
        const { position, roadCoord } = curtain.geometry.attributes;
        for (let i = 0; i < position.count; i++) {
          const s = roadCoord.getX(i),
            lateral = roadCoord.getY(i);
          assert.ok(Math.abs(lateral) >= track.width / 2);
          const frame = track.sample(s);
          const actual = new T.Vector3()
            .fromBufferAttribute(position, i)
            .sub(frame.position)
            .dot(frame.right);
          assert.ok(
            Math.abs(actual - lateral) < 0.001,
            `curtain lane ${actual}/${lateral}`,
          );
        }
      }
    }
  } finally {
    lifetime.dispose();
  }
});
