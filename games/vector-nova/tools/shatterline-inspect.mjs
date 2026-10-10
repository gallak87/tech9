import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import * as THREE from 'three';
import { createShatterlineTrack } from '../src/levels/shatterline/track/model.js';
import { createShatterlineRuntime } from '../src/levels/shatterline/runtime.js';
import { createVehicleState } from '../src/physics/index.js';
import { SHIPS } from '../src/ships/catalog.js';
import { createDevices } from '../src/levels/shatterline/devices.js';
import { createDeviceRuntime } from '../src/pickups/runtime.js';
import { createRacers, getRacerControl, RACE_GRID } from '../src/race/racers.js';
import { createRace } from '../src/race/index.js';
import { advanceSession } from '../src/core/session-runtime.js';

export const FLIGHT_STEP = 1 / 120;
export const COAST = Object.freeze({ throttle: 0, brake: 0, steer: 0, boost: false, airbrake: false });

/** Actual production flight from just before a lip; never a direct launch or target path. */
export function inspectJump({
  track,
  jump,
  shipId = 'kestrel',
  speed = 130,
  lateral = 0,
  heading = 0,
  input = COAST,
  runtime = createShatterlineRuntime({ track, presentation: false }),
  maxSeconds = 11,
  retainTrace = false,
}) {
  const state = { ...createVehicleState(shipId), distance: jump.takeoff - 0.1, speed, lateral, heading };
  runtime.reset({ state });
  const events = [], trace = [];
  let launchTime = null, airborne = 0, flightSamples = 0, transfer = null, beforeTransfer = null;
  for (let tick = 0; tick < Math.ceil(maxSeconds / FLIGHT_STEP); tick++) {
    const before = runtime.snapshot();
    const emitted = runtime.advance(state, input, FLIGHT_STEP);
    const after = runtime.snapshot();
    if (emitted.some(({ type }) => type === 'jump-launch'))
      launchTime = state.time - (after.flight?.elapsed ?? 0);
    if (after.mode === 'flight') {
      airborne = after.flight.elapsed;
      flightSamples++;
    }
    events.push(...emitted.map(event => ({ ...event, time: state.time })));
    if (retainTrace && after.flight)
      trace.push({ time: state.time, mode: after.mode, position: after.currentPose.position, velocity: after.flight.velocity });
    transfer = emitted.find(({ type }) => type === 'jump-transfer');
    if (transfer) {
      beforeTransfer = before;
      if (transfer.payload.outcome === 'landed') airborne = state.time - launchTime;
      break;
    }
  }
  const next = track.jumps.find(candidate => candidate.takeoff > jump.takeoff);
  const result = {
    jump: jump.id,
    hero: jump.hero,
    ship: shipId,
    requestedSpeed: speed,
    launchSpeed: events.find(({ type }) => type === 'jump-launch')?.payload.speed ?? null,
    outcome: transfer?.payload.outcome ?? runtime.snapshot().mode,
    airtime: airborne,
    elapsed: state.time,
    landedDistance: transfer?.payload.outcome === 'landed' ? state.distance : null,
    landingRemainder: transfer?.payload.outcome === 'landed' ? jump.landingEnd - state.distance : null,
    groundedBeforeNext: transfer?.payload.outcome === 'landed' ? (next?.takeoff ?? track.finishDistance) - state.distance : null,
    landingSpeed: transfer?.payload.outcome === 'landed' ? state.speed : null,
    failure: events.find(({ type }) => type === 'jump-miss')?.payload ?? null,
    flightSamples,
    events,
    state,
    beforeTransfer,
    trace,
  };
  runtime.dispose();
  return result;
}

export function flightMatrix(track = createShatterlineTrack()) {
  return track.jumps.flatMap(jump => SHIPS.flatMap(ship =>
    [55, ship.handling.cruiseSpeed, 130, 166, ship.handling.boostSpeed].map(speed =>
      inspectJump({ track, jump, shipId: ship.id, speed }))));
}

/** Six off-centre lip crossings against production solids; no direct launch setup. */
export async function inspectHeroClearance({ progress = () => {} } = {}) {
  const { default: createLevel } = await import('../src/levels/shatterline/index.js');
  const level = createLevel(), track = level.createTrack();
  const collisionWorld = level.createCollisionWorld({ track });
  const dynamics = await level.createDynamics({ track, collisionWorld });
  const cases = [
    { shipId: 'shrike', speed: 101, lateral: -10 },
    { shipId: 'needle', speed: 178, lateral: 10 },
  ];
  const rows = [];
  try {
    for (const jump of track.jumps.filter(candidate => candidate.hero)) {
      for (const entry of cases) {
        dynamics.reset();
        const runtime = level.createRuntime({ track, collisionWorld, dynamics, presentation: false });
        const row = { lateral: entry.lateral, ...inspectJump({ track, jump, runtime, ...entry }) };
        rows.push(row);
        progress({ jump: row.jump, ship: row.ship, speed: row.requestedSpeed, lateral: row.lateral,
          outcome: row.outcome, airtime: row.airtime, landingRemainder: row.landingRemainder,
          failure: row.failure, impacts: row.events.filter(event => event.type === 'impact') });
      }
    }
    return { geometryVersion: track.geometryVersion,
      collision: { id: collisionWorld.id, version: collisionWorld.version, triangleCount: collisionWorld.triangleCount, rulesId: collisionWorld.rulesId },
      rows };
  } finally {
    dynamics.dispose();
    collisionWorld.dispose();
  }
}

/** Bounded ordinary-input drive through an authored section, without teleporting along it. */
export function inspectDescent({ track, descent, shipId = 'kestrel', speed = 112, maxSeconds = 45, collisionWorld, dynamics }) {
  const devices = createDevices(track);
  const runtime = createDeviceRuntime({ track, devices, motion: createShatterlineRuntime({ track, collisionWorld, dynamics, presentation: false }) });
  const state = { ...createVehicleState(shipId), distance: Math.max(0, descent.start - 30), speed };
  const end = descent.end + 60;
  const events = [];
  let maxLateral = 0, maxHeading = 0, minSpeed = speed, maxSpeed = speed, invertedSeconds = 0, ungroundedTicks = 0;
  runtime.reset({ state });
  try {
    for (let tick = 0; tick < maxSeconds * 120 && state.distance < end; tick++) {
      const input = getRacerControl(state, track, { runtime, devices, difficulty: 'medium', pace: 1 });
      events.push(...runtime.advance(state, input, FLIGHT_STEP));
      runtime.update({});
      const frame = track.sample(state.distance), pose = runtime.pose(1);
      if (!pose.grounded) ungroundedTicks++;
      if (frame.up.y < 0) invertedSeconds += FLIGHT_STEP;
      maxLateral = Math.max(maxLateral, Math.abs(state.lateral));
      maxHeading = Math.max(maxHeading, Math.abs(state.heading));
      minSpeed = Math.min(minSpeed, state.speed);
      maxSpeed = Math.max(maxSpeed, state.speed);
    }
    return { descent: descent.id, ship: shipId, requestedSpeed: speed,
      complete: state.distance >= end, elapsed: state.time, invertedSeconds, ungroundedTicks,
      maxLateral, maxHeading, minSpeed, maxSpeed,
      impacts: events.filter(event => event.type === 'impact'),
      launches: events.filter(event => event.type === 'jump-launch'),
      landings: events.filter(event => event.type === 'jump-transfer' && event.payload.outcome === 'landed'),
      misses: events.filter(event => event.type === 'jump-miss'),
      recoveries: events.filter(event => event.type === 'jump-transfer' && event.payload.outcome === 'recovered'),
      state };
  } finally {
    runtime.dispose();
  }
}

/** Slow/fast physical drive pairs exercise the support geometry around each new descent. */
export async function inspectDescentClearance({ progress = () => {} } = {}) {
  const { default: createLevel } = await import('../src/levels/shatterline/index.js');
  const level = createLevel(), track = level.createTrack();
  const collisionWorld = level.createCollisionWorld({ track });
  const dynamics = await level.createDynamics({ track, collisionWorld });
  const rows = [];
  try {
    for (const descent of [...track.descents, ...track.variations]) {
      for (const entry of [{ shipId: 'shrike', speed: 101 }, { shipId: 'needle', speed: 178 }]) {
        dynamics.reset();
        const row = inspectDescent({ track, descent, collisionWorld, dynamics, maxSeconds: 60, ...entry });
        rows.push(row);
        progress({ descent: row.descent, ship: row.ship, speed: row.requestedSpeed,
          complete: row.complete, elapsed: row.elapsed, invertedSeconds: row.invertedSeconds,
          ungroundedTicks: row.ungroundedTicks, maxLateral: row.maxLateral,
          impacts: row.impacts, launches: row.launches, landings: row.landings, misses: row.misses, recoveries: row.recoveries });
      }
    }
    return { geometryVersion: track.geometryVersion,
      collision: { id: collisionWorld.id, version: collisionWorld.version, triangleCount: collisionWorld.triangleCount, rulesId: collisionWorld.rulesId },
      rows };
  } finally {
    dynamics.dispose();
    collisionWorld.dispose();
  }
}

/** Accelerated CPU driver; obeys ordinary controls, devices and the sprint lifecycle. */
export function inspectSprint({ track, shipId = 'kestrel', collisionWorld, dynamics, maxSeconds = 180 }) {
  const devices = createDevices(track);
  const runtime = createDeviceRuntime({ track, devices, motion: createShatterlineRuntime({ track, collisionWorld, dynamics, presentation: false }) });
  const state = createVehicleState(shipId);
  const race = createRace(track, { rulesId: runtime.rulesId });
  const events = [], flights = [];
  let launchTime = null, launch = null, miss = null, finishedAt = null;
  runtime.reset({ state, reason: 'fresh-lap' });
  try {
    for (let tick = 0; tick < maxSeconds * 120; tick++) {
      const input = getRacerControl(state, track, { runtime, devices, difficulty: 'medium', pace: 1 });
      advanceSession({ state, input, dt: FLIGHT_STEP, runtime, race, dynamics,
        emit(event) {
          events.push({ ...event, time: state.time,
            ...(event.type === 'impact' ? { distance: state.distance, lateral: state.lateral, speed: state.speed } : {}) });
          if (event.type === 'jump-launch') {
            launchTime = state.time;
            launch = { ...event.payload, lateral: state.lateral };
            miss = null;
          }
          if (event.type === 'jump-miss') miss = event.payload;
          if (event.type === 'jump-transfer') flights.push({ ...event.payload, launch, miss, duration: state.time - launchTime });
        },
      });
      runtime.update({});
      if (race.complete && finishedAt === null) finishedAt = state.time;
      if (race.complete && state.speed === 0) break;
    }
    return {
      ship: shipId, complete: race.complete, valid: race.valid, finishedAt,
      elapsed: state.time, stopped: state.speed === 0, distance: state.distance,
      result: race.history.map(({ duration, valid }) => ({ duration, valid })), flights,
      impacts: events.filter(event => event.type === 'impact').length,
      impactEvents: events.filter(event => event.type === 'impact'),
      launches: events.filter(event => event.type === 'jump-launch').length,
      recoveries: flights.filter(flight => flight.outcome === 'recovered').length,
    };
  } finally {
    runtime.dispose();
  }
}

/** Six bounded direct-contact setups. Automatic checkpoint recovery stays disabled. */
export function inspectContacts({ track, collisionWorld, dynamics, caseIds }) {
  const jump = track.jumps.find(candidate => candidate.hero);
  const cases = [
    { id: 'left-wall', lateral: track.width / 2 - 2.5, height: 3, velocity: [25, -4, 40], steer: -0.25, supported: true },
    { id: 'right-wall', lateral: 2.5 - track.width / 2, height: 3, velocity: [-25, -4, 40], steer: 0.25, supported: true },
    { id: 'rolled-top', height: 8, velocity: [0, -22, 45], roll: 2.4, supported: true },
    { id: 'underside', height: -10, velocity: [0, 25, 5] },
    { id: 'receiving-front', along: -22, height: -3, velocity: [0, 0, 60] },
    { id: 'late-overrun', endOffset: -20, height: 10, velocity: [0, -20, 173] },
  ];
  if (caseIds?.some(id => !cases.some(entry => entry.id === id))) throw new Error('Unknown contact case.');
  return cases.filter(entry => !caseIds || caseIds.includes(entry.id)).map(entry => {
    dynamics.reset();
    const runtime = createShatterlineRuntime({ track, collisionWorld, dynamics, presentation: false, playtest: { automaticRecovery: false } });
    const state = { ...createVehicleState(), distance: jump.takeoff - 0.1 };
    const distance = entry.endOffset === undefined ? jump.landingStart + (entry.along ?? 100) : jump.landingEnd + entry.endOffset;
    const frame = track.sample(distance);
    const quaternion = frame.quaternion.clone();
    if (entry.roll) quaternion.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), entry.roll));
    const setup = {
      jump: jump.id,
      position: frame.position.clone().addScaledVector(frame.right, entry.lateral ?? 0).addScaledVector(frame.up, entry.height).toArray(),
      velocity: frame.right.clone().multiplyScalar(entry.velocity[0]).addScaledVector(frame.up, entry.velocity[1]).addScaledVector(frame.tangent, entry.velocity[2]).toArray(),
      quaternion: quaternion.toArray(),
    };
    runtime.launch(state, setup);
    const events = [];
    let supportedTicks = 0, transfer = null;
    try {
      for (let tick = 0; tick < 360; tick++) {
        const emitted = runtime.advance(state, { ...COAST, throttle: 1, steer: entry.steer ?? 0 }, FLIGHT_STEP);
        events.push(...emitted);
        transfer ??= emitted.find(event => event.type === 'jump-transfer');
        if (runtime.snapshot().mode === 'magnetic') supportedTicks++;
        if (supportedTicks >= 120) break;
        if (!entry.supported && tick >= 120 && events.some(event => event.type === 'impact')) break;
      }
      return { id: entry.id, expectedSupport: Boolean(entry.supported), setup, elapsed: state.time, mode: runtime.snapshot().mode, supportedTicks, transfer: transfer?.payload ?? null, events };
    } finally {
      runtime.dispose();
    }
  });
}

/** Complete competitive run against production solids, with one shared engine tick. */
export async function inspectCompetition({ difficulty = 'medium', maxSeconds = 180, verifyReplay = difficulty === 'medium', captureDeparture = null, progress = () => {} } = {}) {
  const { default: createLevel } = await import('../src/levels/shatterline/index.js');
  const level = createLevel(), track = level.createTrack();
  const collisionWorld = level.createCollisionWorld({ track });
  const dynamics = await level.createDynamics({ track, collisionWorld });
  const devices = level.racing.createDevices(track);
  const makeRuntime = () => createDeviceRuntime({ track, devices, motion: level.createRuntime({ track, collisionWorld, dynamics, presentation: false }) });
  const runtime = makeRuntime();
  const state = { ...createVehicleState(), ...RACE_GRID.player };
  const race = createRace(track, { rulesId: runtime.rulesId });
  const racers = createRacers({ track, devices, createRuntime: makeRuntime, dynamics });
  let departure = null;
  let records = Object.fromEntries(['player', ...racers.opponents.map(opponent => opponent.specification.id)].map(id => [id, { launches: [], transfers: [], misses: [], impacts: [], lastLaunch: null }]));
  const recordRuntime = (adapter, id) => {
    if (captureDeparture?.racer === id) {
      const begin = adapter.beginAdvance.bind(adapter);
      const jump = track.jumps.find(candidate => candidate.id === captureDeparture.jump);
      adapter.beginAdvance = (vehicle, input, dt) => {
        const remaining = jump.takeoff - vehicle.distance;
        if (!departure && remaining > 0 && remaining <= 8)
          departure = { racer: id, jump: jump.id, beforeLip: remaining, state: structuredClone(vehicle), runtime: structuredClone(adapter.snapshot()), controls: [], complete: false };
        if (departure && !departure.complete) {
          const previous = departure.controls.at(-1);
          if (previous && JSON.stringify(previous.input) === JSON.stringify(input)) previous.ticks++;
          else departure.controls.push({ ticks: 1, input: structuredClone(input) });
        }
        return begin(vehicle, input, dt);
      };
    }
    const finish = adapter.finishAdvance.bind(adapter);
    adapter.finishAdvance = vehicle => {
      const emitted = finish(vehicle), record = records[id];
      for (const event of emitted) {
        const data = { ...event.payload, time: vehicle.time };
        if (event.type === 'jump-launch') {
          const launch = { ...data, ship: vehicle.shipId, lateral: vehicle.lateral, lateralSpeed: vehicle.lateralSpeed };
          record.launches.push(launch); record.lastLaunch = launch;
        }
        if (event.type === 'jump-transfer') {
          record.transfers.push({ ...data, airtime: vehicle.time - record.lastLaunch.time });
          if (departure?.racer === id && departure.jump === data.id) departure.complete = true;
        }
        if (event.type === 'jump-miss') {
          record.misses.push(data);
          progress({ difficulty, physicalFailure: { racer: id, ...data, launch: record.lastLaunch } });
        }
        if (event.type === 'impact') record.impacts.push({ ...data,
          distance: vehicle.distance, lateral: vehicle.lateral, speed: vehicle.speed });
      }
      return emitted;
    };
  };
  recordRuntime(runtime, 'player');
  for (const opponent of racers.opponents) recordRuntime(opponent.runtime, opponent.specification.id);
  dynamics.reset();
  runtime.reset({ state, reason: 'restart' });
  racers.reset({ enabled: true, difficulty });
  const tick = () => {
    const input = getRacerControl(state, track, { runtime, devices, difficulty, nearby: racers.opponents.map(opponent => opponent.state) });
    advanceSession({ state, input, dt: FLIGHT_STEP, runtime, race, dynamics, racers, emit() {} });
    runtime.update({});
  };
  const copy = value => JSON.parse(JSON.stringify(value));
  const capture = () => copy({ state, race, runtime: runtime.snapshot(), racers: racers.serialize(), dynamics: dynamics.snapshot(), records });
  const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
  let replay = null, nextProgress = 10;
  const started = performance.now();
  try {
    while (state.time < maxSeconds) {
      tick();
      if (verifyReplay && !replay && records.player.lastLaunch?.id === 'severance' && state.time - records.player.lastLaunch.time >= 2) {
        const saved = capture();
        for (let index = 0; index < 420; index++) tick();
        const expected = capture();
        Object.assign(state, saved.state);
        Object.assign(race, saved.race);
        runtime.restore(saved.runtime);
        racers.restore(saved.racers);
        dynamics.restore(saved.dynamics);
        records = copy(saved.records);
        for (let index = 0; index < 420; index++) tick();
        const actual = capture();
        const components = Object.fromEntries(Object.keys(expected).map(key => [key, digest(expected[key]) === digest(actual[key])]));
        replay = { at: saved.state.time, duration: 420 * FLIGHT_STEP, exact: Object.values(components).every(Boolean), components };
        progress({ difficulty, replay });
      }
      if (state.time >= nextProgress) {
        progress({ difficulty, elapsed: state.time, playerDistance: state.distance, finished: [race.complete, ...racers.opponents.map(opponent => Boolean(opponent.finish))], wallSeconds: (performance.now() - started) / 1000 });
        nextProgress += 10;
      }
      if (race.complete && state.speed === 0 && racers.opponents.every(opponent => opponent.finish && opponent.state.speed === 0)) break;
    }
    const summarize = (id, vehicle, actorRace, adapter) => ({
      id, ship: vehicle.shipId, finish: actorRace.history.map(({ duration, valid }) => ({ duration, valid })),
      complete: actorRace.complete, stopped: vehicle.speed === 0, distance: vehicle.distance,
      supportedRunout: vehicle.distance >= track.finishDistance && vehicle.distance < track.length && adapter.pose(1)?.grounded !== false,
      launches: records[id].launches.length,
      landed: records[id].transfers.filter(transfer => transfer.outcome === 'landed').length,
      recovered: records[id].transfers.filter(transfer => transfer.outcome === 'recovered').length,
      transfers: records[id].transfers, misses: records[id].misses, impacts: records[id].impacts,
    });
    return {
      difficulty, geometryVersion: track.geometryVersion,
      collision: { id: collisionWorld.id, version: collisionWorld.version, triangleCount: collisionWorld.triangleCount, rulesId: collisionWorld.rulesId },
      elapsed: state.time, wallSeconds: (performance.now() - started) / 1000, replay, departure,
      racers: [summarize('player', state, race, runtime), ...racers.opponents.map(opponent => summarize(opponent.specification.id, opponent.state, opponent.race, opponent.runtime))],
      standings: racers.snapshot({ playerState: state, playerRace: race, playerPose: runtime.pose(1) }).results?.standings ?? null,
    };
  } finally {
    racers.dispose(); runtime.dispose(); dynamics.dispose(); collisionWorld.dispose();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const track = createShatterlineTrack();
  if (process.argv.includes('--race')) {
    const { mkdir, writeFile } = await import('node:fs/promises');
    const directory = '.experiments/shatterline-flight';
    await mkdir(directory, { recursive: true });
    for (const difficulty of ['easy', 'medium', 'hard']) {
      const result = await inspectCompetition({ difficulty, progress: entry => console.log(JSON.stringify({ progress: entry })) });
      await writeFile(`${directory}/race-${difficulty}.json`, JSON.stringify(result, null, 2));
      console.log(JSON.stringify({ difficulty, elapsed: result.elapsed, wallSeconds: result.wallSeconds, replay: result.replay, racers: result.racers.map(({ impacts, ...summary }) => {
        delete summary.transfers;
        return { ...summary, impacts: impacts.length };
      }) }));
      if (result.racers.some(actor => !actor.complete || !actor.stopped || !actor.supportedRunout || actor.finish.length !== 1 || !actor.finish[0].valid) || result.replay?.exact === false) process.exitCode = 1;
    }
    process.exit(process.exitCode ?? 0);
  }
  if (process.argv.includes('--contacts')) {
    const { default: createLevel } = await import('../src/levels/shatterline/index.js');
    const level = createLevel();
    const collisionWorld = level.createCollisionWorld({ track });
    const dynamics = await level.createDynamics({ track, collisionWorld });
    try {
      console.log(JSON.stringify(inspectContacts({ track, collisionWorld, dynamics }), null, 2));
    } finally {
      dynamics.dispose();
      collisionWorld.dispose();
    }
    process.exit(0);
  }
  if (process.argv.includes('--route')) {
    console.log(JSON.stringify(SHIPS.map(ship => inspectSprint({ track, shipId: ship.id })), null, 2));
    process.exit(0);
  }
  const rows = flightMatrix(track);
  if (process.argv.includes('--json'))
    console.log(JSON.stringify(rows.map(row => {
      const summary = { ...row };
      for (const key of ['events', 'state', 'beforeTransfer', 'trace']) delete summary[key];
      return summary;
    }), null, 2));
  else {
    console.table(track.jumps.map(jump => {
      const cases = rows.filter(row => row.jump === jump.id);
      const nominal = cases.filter(row => row.requestedSpeed === 130);
      const prepared = cases.filter(row => row.requestedSpeed >= 100);
      const landed = prepared.filter(row => row.outcome === 'landed');
      const range = values => values.length ? `${Math.min(...values).toFixed(2)}–${Math.max(...values).toFixed(2)}` : '—';
      return {
        jump: jump.id,
        nominal: range(nominal.map(row => row.airtime)),
        prepared: `${landed.length}/${prepared.length}`,
        flight: range(landed.map(row => row.airtime)),
        deckRemaining: range(landed.map(row => row.landingRemainder)),
        nextLaunch: range(landed.map(row => row.groundedBeforeNext)),
        failures: prepared.filter(row => row.outcome !== 'landed').map(row => `${row.ship}@${row.requestedSpeed}`).join(', '),
      };
    }));
  }
}
