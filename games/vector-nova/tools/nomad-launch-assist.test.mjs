import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import createLevel from '../src/levels/nomad/index.js';
import { createVehicleState } from '../src/physics/index.js';
import {
  assistedNomadStep,
  nomadLaunchAssistance,
  nomadLaunchStripAt,
  NOMAD_LAUNCH_ASSIST_RULES as RULES,
} from '../src/levels/nomad/launch-assist.js';
import {
  nomadLaunchPlan,
  nomadLaunchTarget,
} from '../src/levels/nomad/pilot.js';

const definition = createLevel();
const track = definition.createTrack();
const majors = track.jumps.filter((jump) => jump.bigAir);
const DT = 1 / 120;
const grounded = { grounded: true, recovering: false };
const drive = {
  throttle: 1,
  brake: 0,
  steer: 0,
  boost: false,
  airbrake: false,
};
const initial = (jump = majors.at(-1), changes = {}) => ({
  ...createVehicleState(),
  distance: jump.takeoff - 15,
  speed: 125,
  time: 0,
  ...changes,
});
const copy = (value) => JSON.parse(JSON.stringify(value));
let collisionWorld, dynamics;
async function world() {
  if (dynamics) return;
  collisionWorld = definition.createCollisionWorld({ track });
  dynamics = await definition.createDynamics({ track, collisionWorld });
}
after(() => {
  dynamics?.dispose();
  collisionWorld?.dispose();
});

test('launch field is confined to supported final straights and yields to driver overrides', () => {
  for (const jump of majors) {
    assert.equal(nomadLaunchStripAt(track, jump.takeoff - RULES.length), jump);
    assert.equal(nomadLaunchStripAt(track, jump.takeoff), null);
    assert.equal(
      nomadLaunchStripAt(track, jump.takeoff - RULES.length - 0.01),
      null,
    );
  }
  for (const jump of track.jumps.filter((entry) => !entry.bigAir))
    assert.equal(nomadLaunchStripAt(track, jump.takeoff - 10), null);
  const state = initial();
  for (const [changes, input, pose] of [
    [{ distance: majors.at(-1).takeoff }, drive, grounded],
    [{ distance: majors.at(-1).takeoff - 51 }, drive, grounded],
    [{ lateral: track.width }, drive, grounded],
    [{ speed: 0 }, drive, grounded],
    [{ heading: 0.8 }, drive, grounded],
    [{}, { ...drive, throttle: 0 }, grounded],
    [{}, { ...drive, brake: 0.2 }, grounded],
    [{}, { ...drive, airbrake: true }, grounded],
    [{}, { ...drive, steer: 0.6 }, grounded],
    [{}, drive, { grounded: false }],
    [{}, drive, { grounded: true, recovering: true }],
  ])
    assert.equal(
      nomadLaunchAssistance(track, { ...state, ...changes }, input, pose),
      null,
    );
});

test('finite capped controls preserve inputs and use moving forecasts and actual held boost intent', () => {
  for (const jump of majors)
    for (const time of [0, 9, 19, 30]) {
      const state = initial(jump, { time });
      const before = copy(state),
        input = { ...drive };
      const help = nomadLaunchAssistance(track, state, input, grounded);
      assert.ok(help);
      assert.ok(Math.abs(help.steerCorrection) <= RULES.maximumSteerCorrection);
      assert.ok(
        help.forwardAcceleration >= 0 &&
          help.forwardAcceleration <= RULES.maximumAcceleration,
      );
      assert.ok(
        Math.abs(help.lateralAcceleration) <= RULES.maximumLateralAcceleration,
      );
      assert.ok(
        Object.values(help)
          .filter((value) => typeof value === 'number')
          .every(Number.isFinite),
      );
      assert.deepEqual(state, before);
      assert.deepEqual(input, drive);
      assert.equal(
        nomadLaunchAssistance(track, { ...state, speed: 220 }, drive, grounded)
          .forwardAcceleration,
        0,
      );
    }
  const state = initial(),
    modifiers = {
      shield: true,
      surface: { grip: 0.8, forwardAcceleration: 2, lateralAcceleration: 3 },
    };
  const help = nomadLaunchAssistance(track, state, drive, grounded);
  assert.ok(help.forwardAcceleration > 0);
  const result = assistedNomadStep(track, state, drive, modifiers, grounded);
  assert.equal(
    result.modifiers.surface.forwardAcceleration,
    2 + help.forwardAcceleration,
  );
  assert.equal(
    result.modifiers.surface.lateralAcceleration,
    3 + help.lateralAcceleration,
  );
  assert.equal(result.modifiers.surface.grip, 0.8);
  assert.equal(result.modifiers.shield, true);
  assert.equal(modifiers.surface.forwardAcceleration, 2);
  assert.deepEqual(
    assistedNomadStep(track, state, drive, modifiers, { grounded: false }),
    { input: drive, modifiers },
  );
  const empty = initial(majors.at(-1), { energy: 0, speed: 100 });
  const held = nomadLaunchAssistance(
    track,
    empty,
    { ...drive, boost: true },
    grounded,
  );
  assert.equal(
    held.shortfall,
    nomadLaunchPlan(track, empty, majors.at(-1), {
      boost: true,
      catchInset: RULES.safeLandingInset,
    }).shortfall,
  );
  assert.notEqual(
    held.shortfall,
    nomadLaunchPlan(track, empty, majors.at(-1), {
      boost: false,
      catchInset: RULES.safeLandingInset,
    }).shortfall,
  );
});

test('existing AI interception points retain their pre-assistance numeric behavior', () => {
  for (const [index, time, speed, boost, expected] of [
    [
      0,
      0,
      125,
      false,
      [312.39722106037533, 107.35500499520461, 2300.7959296231425],
    ],
    [
      1,
      19,
      170,
      true,
      [655.5761892591969, -278.18344174327825, 4063.3054929121145],
    ],
    [
      2,
      28.5,
      155,
      true,
      [1151.6924481166452, -1228.9553482782774, 8469.147996765247],
    ],
    [
      3,
      27,
      130,
      false,
      [1709.1860992017553, -2201.4660952197864, 12914.530799830198],
    ],
  ]) {
    const jump = majors[index];
    const state = initial(jump, { distance: jump.takeoff - 20, time, speed });
    const actual = nomadLaunchTarget(track, state, jump, { boost }).toArray();
    actual.forEach((value, axis) =>
      assert.ok(Math.abs(value - expected[axis]) < 1e-9),
    );
  }
});

function encounter(
  jump,
  {
    speed = 170,
    time = 0,
    boost = true,
    assist = true,
    heading = 0,
    land = true,
  } = {},
) {
  dynamics.reset();
  const runtime = definition.createRuntime({
    track,
    collisionWorld,
    dynamics,
    launchAssist: assist,
  });
  const state = initial(jump, {
    distance: jump.takeoff - 55,
    speed,
    time,
    heading,
  });
  runtime.reset({ reason: 'scenario', state });
  const input = { ...drive, boost };
  let launch = null,
    landing = null,
    contacts = 0,
    misses = 0,
    postAirChecks = 0;
  try {
    for (let tick = 0; tick < 1800 && !landing; tick++) {
      if (runtime.pose(1)?.grounded === false) {
        assert.equal(
          nomadLaunchAssistance(track, state, input, runtime.pose(1)),
          null,
        );
        postAirChecks++;
      }
      const events = runtime.advance(state, input, DT);
      contacts += events.filter((event) => event.type === 'impact').length;
      misses += events.filter((event) =>
        ['jump-miss', 'road-departure'].includes(event.type),
      ).length;
      if (events.some((event) => event.type === 'jump-launch')) {
        const body = runtime.snapshot().flight;
        const frame = track.surfaceAtTime(
          state.distance,
          state.lateral,
          state.time,
        );
        const target = nomadLaunchPlan(track, state, jump, {
          boost,
        }).target.sub(frame.position);
        const targetHeading = Math.atan2(
          target.dot(frame.right),
          target.dot(frame.tangent),
        );
        const velocity = frame.position.clone().fromArray(body.velocity);
        const rayHeading = Math.atan2(
          velocity.dot(frame.right),
          velocity.dot(frame.tangent),
        );
        launch = {
          speed: state.speed,
          heading: state.heading,
          targetHeading,
          rayHeading,
          error: Math.abs(targetHeading - state.heading),
          rayError: Math.abs(targetHeading - rayHeading),
          velocity: body.velocity,
          time: state.time,
        };
        if (!land) break;
      }
      const transfer = events.find((event) => event.type === 'jump-transfer');
      if (transfer)
        landing = {
          outcome: transfer.payload.outcome,
          distance: state.distance,
        };
    }
    assert.ok(launch, `${jump.id}: actual physical release`);
    if (land) {
      assert.equal(
        landing?.outcome,
        'landed',
        `${jump.id}: ${JSON.stringify({ launch, landing, contacts, misses })}`,
      );
      assert.equal(contacts, 0, `${jump.id}: zero actual contacts`);
      assert.equal(misses, 0, `${jump.id}: no recovery shortcut`);
      assert.ok(postAirChecks > 100);
      assert.equal(runtime.pose(1).grounded, true);
      const from = state.distance;
      for (let tick = 0; tick < 25; tick++)
        runtime.advance(state, { ...drive, brake: 0.5 }, DT);
      assert.equal(runtime.pose(1).grounded, true);
      assert.ok(state.distance > from + 20);
    }
    return { launch, landing, contacts, misses };
  } finally {
    runtime.dispose();
  }
}

test('four real Native launch-strip encounters retain clean powered catches and grounded driving', async () => {
  await world();
  for (const jump of majors) encounter(jump);
  const hero = majors.find((jump) => jump.hero);
  const receiver = track.carriers.find(
    (carrier) => carrier.id === hero.receivingCarrierId,
  );
  encounter(hero, { time: receiver.motion.period * 0.75 });
});

test('weak Native launches receive bounded physical speed help', async (context) => {
  await world();
  const jump = majors.at(-1);
  const weak = encounter(jump, { speed: 125, boost: false, land: false });
  const baseline = encounter(jump, {
    speed: 125,
    boost: false,
    assist: false,
    land: false,
  });
  const gain = weak.launch.speed - baseline.launch.speed;
  assert.ok(
    gain > 1 && gain < 60 / 3.6,
    `bounded actual ground-speed gain ${gain * 3.6}km/h`,
  );
  assert.notDeepEqual(
    weak.launch.velocity,
    baseline.launch.velocity,
    'the real Native actor receives the field',
  );
  assert.ok(
    Math.abs(weak.launch.heading) < 0.12,
    'ordinary yaw changes remain gradual',
  );
  context.diagnostic(
    `Weak 125m/s approach: ${baseline.launch.speed.toFixed(3)}→${weak.launch.speed.toFixed(3)}m/s actual launch, +${(gain * 3.6).toFixed(2)}km/h field contribution.`,
  );
});

test('Native launch alignment reduces a small direction error and still catches the actual receiver', async (context) => {
  await world();
  const jump = majors[0];
  const assisted = encounter(jump, { heading: 0.06 });
  const baseline = encounter(jump, {
    heading: 0.06,
    assist: false,
    land: false,
  });
  assert.ok(
    assisted.launch.error < baseline.launch.error * 0.8,
    `actual intercept yaw error ${baseline.launch.error}→${assisted.launch.error}`,
  );
  assert.ok(
    assisted.launch.rayError < baseline.launch.rayError * 0.8,
    `actual velocity ray error ${baseline.launch.rayError}→${assisted.launch.rayError}`,
  );
  context.diagnostic(
    `Misaligned launch: actual velocity ray error ${((baseline.launch.rayError * 180) / Math.PI).toFixed(2)}°→${((assisted.launch.rayError * 180) / Math.PI).toFixed(2)}°, clean Native catch.`,
  );
});

test('Native launch assistance is replayable and independent of presentation and outer frame splitting', async () => {
  await world();
  const jump = majors.at(-1);
  const replay = (dt, presentation = true) => {
    dynamics.reset();
    const runtime = definition.createRuntime({
      track,
      collisionWorld,
      dynamics,
      presentation,
    });
    const state = initial(jump, { distance: jump.takeoff - 45 });
    try {
      runtime.reset({ state });
      for (let i = 0; i < Math.round(0.1 / dt); i++)
        runtime.advance(state, drive, dt);
      const saved = {
        state: copy(state),
        runtime: copy(runtime.snapshot()),
        world: dynamics.snapshot(),
      };
      for (let i = 0; i < 8; i++) runtime.advance(state, drive, DT);
      const expected = {
        state: copy(state),
        runtime: copy(runtime.snapshot()),
      };
      Object.assign(state, saved.state);
      runtime.restore(saved.runtime);
      dynamics.restore(saved.world);
      for (let i = 0; i < 8; i++) runtime.advance(state, drive, DT);
      assert.deepEqual({ state, runtime: runtime.snapshot() }, expected);
      return expected;
    } finally {
      runtime.dispose();
    }
  };
  assert.deepEqual(replay(1 / 60), replay(1 / 120));
  assert.deepEqual(replay(1 / 120, false), replay(1 / 120, true));
  const rival = definition.racing.createMotion({
    track,
    collisionWorld,
    dynamics,
  });
  const player = definition.createRuntime({ track, collisionWorld, dynamics });
  assert.notEqual(rival.rulesId, player.rulesId);
  rival.dispose();
  player.dispose();
});
