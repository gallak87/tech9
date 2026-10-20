import test from 'node:test';
import assert from 'node:assert/strict';
import { createVesperTrack } from '../src/levels/vesper/track/model.js';
import {
  createVesperRuntime,
  VESPER_FLIGHT,
} from '../src/levels/vesper/runtime.js';
import { sampleVesperSurface } from '../src/levels/vesper/surface.js';
import {
  createVehicleState,
  stepVehicle,
  STEERING_ASSIST,
} from '../src/physics/index.js';
import { getRacerControl } from '../src/race/racers.js';
import { SHIPS } from '../src/ships/catalog.js';
import { createRace } from '../src/race/index.js';
import {
  advanceSession,
  captureInitial,
  restoreReplayInitial,
  runtimeIdentity,
  compatibleRuntime,
} from '../src/core/session-runtime.js';

const track = createVesperTrack();
const DT = 1 / 120;
const idle = { throttle: 0, brake: 0, steer: 0, boost: false, airbrake: false };
const copy = (value) => JSON.parse(JSON.stringify(value));
const runtime = (settings = {}) => createVesperRuntime({ track, settings });
function jumpState(jump, speed, initial = {}) {
  return {
    ...createVehicleState(),
    distance: jump.takeoff - 0.1,
    speed,
    lateral: jump.optional ? 8.5 : 0,
    ...initial,
  };
}
function runJump(jump, speed, initial = {}) {
  const state = jumpState(jump, speed, initial);
  const adapter = runtime();
  adapter.reset({ state, seed: 47219 });
  const events = [];
  let sawFlight = false;
  for (let tick = 0; tick < 1800; tick += 1) {
    const next = adapter.advance(state, idle, DT);
    events.push(...next.map((event) => ({ ...event, time: state.time })));
    if (adapter.snapshot().mode === 'flight') {
      sawFlight = true;
      assert.ok(
        Math.abs(state.distance - jump.takeoff) < 1e-9,
        'distance is held at the lip in flight',
      );
      assert.equal(adapter.pose().grounded, false);
    }
    if (next.some(({ type }) => type === 'jump-transfer')) break;
  }
  assert.ok(sawFlight);
  return {
    state,
    adapter,
    events,
    transfer: events.find(({ type }) => type === 'jump-transfer'),
  };
}

// This checks real swept contacts, including nearby speeds that previously
// exposed isolated false-negative landings on the curved receiving deck.
test('the crown flight covers its contiguous sampled launch window', (t) => {
  const failures = [];
  for (const [index, low, high] of [[0, 95, 173]]) {
    const jump = track.jumps[index];
    const landed = [];
    for (let speed = low; speed <= high; speed += 1) {
      const result = runJump(jump, speed);
      if (result.transfer?.payload.outcome !== 'landed')
        failures.push({
          jump: jump.id,
          speed,
          outcome: result.transfer?.payload.outcome,
        });
      else {
        assert.ok(
          result.state.distance >= jump.landingStart &&
            result.state.distance <= jump.landingEnd,
        );
        assert.ok(
          Math.abs(result.state.lateral) <=
            jump.halfWidth - VESPER_FLIGHT.rules.halfWidth,
        );
        landed.push(speed);
      }
      result.adapter.dispose();
    }
    t.diagnostic(
      JSON.stringify({
        jump: jump.id,
        testedStart: low,
        testedEnd: high,
        landedCount: landed.length,
      }),
    );
  }
  assert.deepEqual(
    failures,
    [],
    'a centered ballistic landing cannot disappear at isolated interior speeds',
  );
});

test('every chassis has cruise landing margin and retains the fast crown approach', () => {
  for (const ship of SHIPS) {
    for (const speed of [
      95,
      100,
      103,
      105,
      ship.handling.cruiseSpeed,
      600 / 3.6,
    ]) {
      const result = runJump(track.jumps[0], speed, {
        shipId: ship.id,
        lateral: 2,
      });
      try {
        assert.equal(
          result.transfer?.payload.outcome,
          'landed',
          `${ship.id} at ${speed} m/s`,
        );
        assert.ok(result.state.distance < track.jumps[0].landingEnd - 25);
        assert.equal(result.state.resetCount, 0);
      } finally {
        result.adapter.dispose();
      }
    }
    for (const speed of [95, 105]) {
      for (const side of [-1, 1]) {
        const result = runJump(track.jumps[0], speed, {
          shipId: ship.id,
          lateral: side * 5,
          heading: side * 0.04,
        });
        try {
          assert.equal(
            result.transfer?.payload.outcome,
            'landed',
            `${ship.id} at ${speed} m/s, lane ${side * 5}, heading ${side * 0.04}`,
          );
          assert.equal(result.state.resetCount, 0);
        } finally {
          result.adapter.dispose();
        }
      }
    }
  }
});

test('short and misaligned launches recover once after elapsed simulation time', () => {
  for (const [jump, speed, initial] of [
    [track.jumps[0], 65, {}],
    [track.jumps[0], 112, { lateral: 8.5, heading: 0.08 }],
  ]) {
    const result = runJump(jump, speed, initial);
    const { adapter, state, events, transfer } = result;
    try {
      assert.equal(transfer?.payload.outcome, 'recovered');
      assert.ok(Math.abs(state.distance - jump.recovery) < 1e-9);
      assert.equal(state.speed, 0);
      assert.equal(state.resetCount, 0);
      assert.equal(
        events.filter(({ type }) => type === 'jump-launch').length,
        1,
      );
      assert.equal(events.filter(({ type }) => type === 'jump-miss').length, 1);
      const miss = events.find(({ type }) => type === 'jump-miss');
      assert.ok(
        Math.abs(
          transfer.time - miss.time - VESPER_FLIGHT.rules.recoveryDelay,
        ) <
          DT + 1e-9,
      );
      assert.equal(adapter.snapshot().mode, 'magnetic');
      assert.equal(adapter.snapshot().flight, null);
    } finally {
      adapter.dispose();
    }
  }
});

test('Bloomspan is continuous full-width road throughout the former optional hop', () => {
  const start = track.scenarios['bloom-runup'].distance;
  for (let s = start; s < start + 350; s += 1)
    for (const lateral of [-11, 0, 8.5, 11])
      assert.equal(track.isGap(s, lateral), false);
  assert.equal(track.jumps.length, 1);
  const state = { ...createVehicleState(), distance: start, speed: 160 };
  const adapter = runtime();
  try {
    adapter.reset({ state });
    while (state.distance < start + 350) {
      const input = getRacerControl(state, track, {
        runtime: adapter,
        difficulty: 'hard',
      });
      const events = adapter.advance(state, input, DT);
      assert.equal(
        events.some(({ type }) => type.startsWith('jump-')),
        false,
      );
      assert.equal(adapter.snapshot().mode, 'magnetic');
    }
  } finally {
    adapter.dispose();
  }
});

test('sap slows equal-speed approaches while resin and ordinary roads preserve baseline', (t) => {
  assert.equal(STEERING_ASSIST, 0.3);
  for (const zone of track.sapZones) {
    const measured = [];
    for (const lateral of [
      zone.resinCenter,
      zone.resinCenter + (zone.resinCenter > 0 ? -5 : 5),
    ]) {
      const state = {
        ...createVehicleState(),
        distance: zone.start + 3,
        speed: 70,
        lateral,
      };
      const adapter = runtime();
      adapter.reset({ state, seed: 47219 });
      const events = [];
      try {
        for (let tick = 0; tick < 30; tick += 1)
          events.push(...adapter.advance(state, { ...idle, throttle: 1 }, DT));
        assert.equal(
          events.some(({ type }) => type === 'impact'),
          false,
        );
        measured.push({
          speed: state.speed,
          surface: adapter.snapshot().surface.id,
          energy: state.energy,
        });
      } finally {
        adapter.dispose();
      }
    }
    assert.equal(measured[0].surface, 'resin');
    assert.equal(measured[1].surface, 'sap');
    assert.ok(measured[0].speed - measured[1].speed > 0.9);
    assert.equal(
      measured[0].energy,
      measured[1].energy,
      'sap is drag, not hidden reserve damage',
    );
    t.diagnostic(
      JSON.stringify({
        zone: zone.id,
        resinSpeed: measured[0].speed,
        sapSpeed: measured[1].speed,
        seconds: 0.25,
      }),
    );
  }
  for (const distance of [
    0,
    90,
    track.landmarks.hollow.spiralStart,
    track.sections.find(({ id }) => id === 'dawnscar').start,
  ]) {
    const state = { ...createVehicleState(), distance, speed: 45 };
    const baseline = { ...state };
    const adapter = runtime();
    try {
      for (let tick = 0; tick < 90; tick += 1) {
        assert.equal(sampleVesperSurface(track, state).drag, 0);
        const input = {
          ...idle,
          throttle: tick < 35 ? 1 : 0,
          brake: tick > 60 ? 0.5 : 0,
          steer: Math.sin(tick / 10) * 0.2,
        };
        const events = adapter
          .advance(state, input, DT)
          .filter(({ type }) => type !== 'surface-change');
        assert.deepEqual(events, stepVehicle(baseline, input, track, DT));
        assert.deepEqual(state, baseline);
      }
    } finally {
      adapter.dispose();
    }
  }
});

test('sap enter/exit feedback follows physical boundaries and resets without stale state', () => {
  for (const zone of track.sapZones) {
    const lateral = zone.resinCenter + (zone.resinCenter > 0 ? -5 : 5);
    for (const [distance, from, to] of [
      [zone.start - 0.1, 'resin', 'sap'],
      [zone.end - 0.1, 'sap', 'resin'],
    ]) {
      const state = { ...createVehicleState(), distance, speed: 70, lateral };
      const adapter = runtime();
      try {
        adapter.reset({ state, seed: 47219 });
        assert.equal(adapter.snapshot().surface.id, from);
        const changes = adapter
          .advance(state, idle, DT)
          .filter(({ type }) => type === 'surface-change');
        assert.equal(changes.length, 1);
        assert.equal(changes[0].payload.from, from);
        assert.equal(changes[0].payload.to, to);
        assert.deepEqual(
          adapter.snapshot().surface,
          sampleVesperSurface(track, state),
        );
        const parked = {
          ...createVehicleState(),
          distance: zone.start + 3,
          lateral,
        };
        adapter.reset({ state: parked, seed: 52 });
        assert.equal(adapter.snapshot().surface.id, 'sap');
        assert.equal(adapter.snapshot().flight, null);
        assert.equal(adapter.pose(), null);
        const events = adapter.advance(parked, idle, DT);
        assert.equal(
          events.some(({ type }) => type === 'surface-change'),
          false,
        );
        assert.equal(parked.speed, 0);
        assert.equal(parked.distance, zone.start + 3);
      } finally {
        adapter.dispose();
      }
    }
  }
});

test('flight, recovery, landing settle and sap snapshots replay deterministically across presentation settings', () => {
  const cases = [
    {
      name: 'flight',
      state: jumpState(track.jumps[0], 112),
      until: (snapshot) =>
        snapshot.mode === 'flight' && snapshot.flight.elapsed > 0.1,
    },
    {
      name: 'recovery',
      state: jumpState(track.jumps[0], 65),
      until: (snapshot) => snapshot.mode === 'recovery',
    },
    {
      name: 'settle',
      state: jumpState(track.jumps[0], 112),
      until: (snapshot) => !!snapshot.landingSettle,
    },
    {
      name: 'sap',
      state: {
        ...createVehicleState(),
        distance: track.sapZones[0].start + 3,
        speed: 70,
      },
      until: (snapshot) => snapshot.surface.id === 'sap',
    },
  ];
  for (const scenario of cases) {
    const state = { ...scenario.state };
    const original = runtime({ quality: 'high', reducedMotion: false });
    const restored = runtime({ quality: 'low', reducedMotion: true });
    try {
      original.reset({ state, seed: 47219 });
      let found = false;
      for (let tick = 0; tick < 1200; tick += 1) {
        original.advance(state, idle, DT);
        if (scenario.until(original.snapshot())) {
          found = true;
          break;
        }
      }
      assert.ok(found, scenario.name);
      const saved = captureInitial(state, original);
      const replayState = createVehicleState();
      restoreReplayInitial(copy(saved), saved, replayState, restored);
      assert.deepEqual(restored.snapshot(), original.snapshot());
      assert.throws(
        () =>
          restoreReplayInitial(
            { ...saved, vehicle: { ...saved.vehicle, speed: -1 } },
            saved,
            replayState,
            restored,
          ),
        /initial state mismatch/,
      );
      const beforePause = original.snapshot();
      original.update({ state, dt: 0, time: state.time, mode: 'paused' });
      assert.deepEqual(original.snapshot(), beforePause);
      for (let tick = 0; tick < 500; tick += 1) {
        const input = { ...idle, throttle: tick > 300 ? 1 : 0 };
        assert.deepEqual(
          original.advance(state, input, DT),
          restored.advance(replayState, input, DT),
          `${scenario.name}: events at ${tick}`,
        );
        assert.deepEqual(
          state,
          replayState,
          `${scenario.name}: vehicle at ${tick}`,
        );
        assert.deepEqual(
          original.snapshot(),
          restored.snapshot(),
          `${scenario.name}: runtime at ${tick}`,
        );
      }
      assert.ok(compatibleRuntime(original, runtimeIdentity(original)));
      assert.equal(
        compatibleRuntime(original, {
          ...runtimeIdentity(original),
          rulesId: `${original.rulesId}:changed`,
        }),
        false,
      );
    } finally {
      original.dispose();
      restored.dispose();
    }
  }
});

test('bounded 0.3-assistance input traverses the ordered lap with either landed or recovered crown credit', (t) => {
  for (const fastCrown of [true, false]) {
    const state = createVehicleState();
    const adapter = runtime();
    const race = createRace(track, { rulesId: adapter.rulesId });
    const events = [];
    let maximumLateral = 0;
    try {
      for (
        let tick = 0;
        tick < 20000 && !events.some(({ type }) => type === 'lap');
        tick += 1
      ) {
        const { steer } = getRacerControl(state, track, {
          runtime: adapter,
          difficulty: 'hard',
        });
        const fast =
          fastCrown &&
          state.distance > track.jumps[0].takeoff - 220 &&
          state.distance < track.jumps[0].takeoff;
        const target = fast ? 112 : 40;
        const input = {
          ...idle,
          throttle: state.speed < target ? 1 : 0,
          brake: state.speed > target + 3 ? 0.3 : 0,
          steer,
          boost: fast && state.speed < 110,
        };
        advanceSession({
          state,
          input,
          dt: DT,
          runtime: adapter,
          race,
          emit: (event) => events.push(event),
        });
        maximumLateral = Math.max(maximumLateral, Math.abs(state.lateral));
      }
      const lap = events.find(({ type }) => type === 'lap');
      assert.ok(lap?.payload.valid);
      assert.equal(lap.payload.rulesId, adapter.rulesId);
      assert.equal(events.filter(({ type }) => type === 'impact').length, 0);
      assert.ok(
        maximumLateral < track.width / 6,
        `lane error ${maximumLateral}`,
      );
      assert.deepEqual(
        events
          .filter(({ type }) => type === 'checkpoint')
          .map(({ payload }) => payload.index),
        [...track.checkpoints.slice(1).map(({ index }) => index), 0],
      );
      const transfers = events.filter(({ type }) => type === 'jump-transfer');
      assert.equal(
        transfers.length,
        1,
        'the crown is the only flight on the lap',
      );
      assert.equal(
        transfers[0].payload.outcome,
        fastCrown ? 'landed' : 'recovered',
      );
      t.diagnostic(
        JSON.stringify({
          fastCrown,
          seconds: lap.payload.duration,
          maximumLateral,
          outcome: transfers[0].payload.outcome,
        }),
      );
    } finally {
      adapter.dispose();
    }
  }
});

test('reset after flight removes prior motion and reproduces the same input log', () => {
  const initial = jumpState(track.jumps[0], 112);
  const state = { ...initial };
  const adapter = runtime();
  const logs = [];
  try {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      Object.assign(state, initial);
      adapter.reset({ state, seed: 47219, reason: 'restart' });
      assert.equal(adapter.pose(), null);
      assert.equal(adapter.snapshot().flight, null);
      assert.equal(adapter.snapshot().landingSettle, null);
      const events = [];
      for (let tick = 0; tick < 240; tick += 1) {
        const input = { ...idle, throttle: tick > 150 ? 1 : 0 };
        events.push(
          ...adapter
            .advance(state, input, DT)
            .map((event) => ({ tick, ...event })),
        );
      }
      assert.ok(
        events.some(
          (event) =>
            event.type === 'jump-transfer' &&
            event.payload.outcome === 'landed',
        ),
      );
      logs.push(copy({ events, state, runtime: adapter.snapshot() }));
    }
    assert.deepEqual(logs[1], logs[0]);
  } finally {
    adapter.dispose();
  }
});
