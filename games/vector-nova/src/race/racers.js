import {
  createVehicleState,
  getVehiclePace,
  STEERING_ASSIST,
} from '../physics/index.js';
import { getShip } from '../ships/catalog.js';
import { createRace } from './index.js';
import {
  courseIdentity,
  distanceAhead,
  presentationDistance,
  sprintRunoutControl,
} from './course.js';
import { createRelativeTiming } from './relative-timing.js';
import {
  sweptVectorContacts,
  VECTOR_PROPULSION,
} from '../pickups/simulation.js';

export const RACE_LAPS = 2;
export const RACE_DIFFICULTIES = Object.freeze(['easy', 'medium', 'hard']);
export const RACE_GRID = Object.freeze({
  player: Object.freeze({ distance: 0, lateral: 4 }),
  rook: Object.freeze({ distance: 0, lateral: -4 }),
  latch: Object.freeze({ distance: -12, lateral: 4 }),
  mule: Object.freeze({ distance: -12, lateral: -4 }),
});
export const RACE_OPPONENTS = Object.freeze([
  Object.freeze({
    id: 'rook',
    name: 'Rook',
    shipId: 'kestrel',
    lane: -4,
    pace: 0.96,
  }),
  Object.freeze({
    id: 'latch',
    name: 'Latch',
    shipId: 'shrike',
    lane: 4,
    pace: 0.99,
  }),
  Object.freeze({
    id: 'mule',
    name: 'Mule',
    shipId: 'bastion',
    lane: -4,
    pace: 0.94,
  }),
]);

const DRIVER_PROFILES = Object.freeze({
  easy: {
    cornerLoad: 28,
    pace: 0.04,
    boostCurvature: 0.0018,
    boostReserve: 60,
    boostFloor: 35,
  },
  medium: {
    cornerLoad: 48,
    pace: 0.12,
    boostCurvature: 0.0046,
    boostReserve: 40,
    boostFloor: 16,
  },
  hard: {
    cornerLoad: 80,
    pace: 0.16,
    boostCurvature: 0.008,
    boostReserve: 14,
    boostFloor: 0,
  },
});

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const copy = (value) => JSON.parse(JSON.stringify(value));
const raceFields = [
  'lap',
  'checkpoint',
  'elapsed',
  'lastLap',
  'best',
  'valid',
  'complete',
  'startDistance',
  'history',
  'completedTransfers',
];
const captureRace = (race) =>
  Object.fromEntries(raceFields.map((key) => [key, copy(race[key])]));

function finishFrom(race) {
  const lapsRequired = race.course.format === 'sprint' ? 1 : RACE_LAPS;
  if (race.history.length < lapsRequired) return null;
  const laps = race.history.slice(0, lapsRequired);
  return {
    lapTimes: laps.map((lap) => lap.duration),
    lapValidity: laps.map((lap) => lap.valid),
    totalTime: laps.reduce((total, lap) => total + lap.duration, 0),
    valid: laps.every((lap) => lap.valid),
  };
}

// A driver, not a route-position animation: inputs pass through the same
// magnetic physics and independent automatic-device simulation as the player.
function controlsFor(opponent, track, devices, nearby, difficulty = 'easy') {
  const state = opponent.state;
  const profile = DRIVER_PROFILES[difficulty];
  if (track.closed === false && opponent.finish)
    return sprintRunoutControl(track, state);
  if (opponent.runtime?.pose(1)?.grounded === false)
    return { throttle: 1, brake: 0, steer: 0, boost: false, airbrake: false };
  const handling = getShip(state.shipId).handling;
  const coursePace = getVehiclePace(state.shipId, track.pace);
  const speedProfile = coursePace ?? handling;
  const surface = track.sampleSurface?.(state.distance, state.lateral);
  const frame = surface ?? track.sample(state.distance);
  const aheadDistance = state.distance + Math.max(45, state.speed * 0.65);
  const lookahead =
    track.sampleSurface?.(aheadDistance, state.lateral) ??
    track.sample(aheadDistance);
  const laneDelta = (from, to) =>
    surface?.period > 0
      ? ((((to - from + surface.period / 2) % surface.period) +
          surface.period) %
          surface.period) -
        surface.period / 2
      : to - from;
  const curvature = Math.max(
    Math.abs(frame.curvature),
    Math.abs(lookahead.curvature),
  );
  const cornerSpeed = clamp(
    Math.sqrt(profile.cornerLoad / Math.max(curvature, 0.000001)),
    63,
    Math.max(speedProfile.boostSpeed, VECTOR_PROPULSION.cruiseSpeed),
  );
  // Plan boost from the road and the ship's own reserve. Hard must race at
  // full intent even when the player never presses boost.
  let wantsBoost =
    curvature < profile.boostCurvature &&
    state.speed > 35 &&
    state.speed < cornerSpeed - 3 &&
    state.energy > (state.boosting ? profile.boostFloor : profile.boostReserve);
  const pace = opponent.specification.pace + profile.pace;
  let targetSpeed = Math.min(
    wantsBoost ? speedProfile.boostSpeed : speedProfile.cruiseSpeed * pace,
    cornerSpeed,
  );
  // Braking is for a corner or traffic, not for throwing away earned strip
  // momentum merely because it exceeds the driver's preferred cruise pace.
  let brakeSpeed = cornerSpeed;
  let targetLane = opponent.specification.lane;
  // Readable lane changes toward the next shield; boosts already span broad
  // driving lines. Only closed circuits wrap to the next lap.
  const upcoming = devices.find((device) => {
    const ahead = distanceAhead(track, state.distance, device.distance);
    return device.type === 'aegis' && ahead >= 0 && ahead < 150;
  });
  if (upcoming) targetLane = upcoming.lateral;
  for (const other of nearby) {
    if (other === state) continue;
    const gap = other.distance - state.distance;
    if (
      gap > -12 &&
      gap < 34 &&
      Math.abs(laneDelta(targetLane, other.lateral)) < 4.8
    ) {
      const alternative = other.lateral > 0 ? -5.7 : 5.7;
      targetLane = alternative;
      if (
        gap > 0 &&
        gap < 20 &&
        Math.abs(laneDelta(state.lateral, other.lateral)) < 4.8
      ) {
        brakeSpeed = Math.min(brakeSpeed, Math.max(40, other.speed - 6));
        targetSpeed = Math.min(targetSpeed, brakeSpeed);
      }
    }
  }
  const jump = (track.jumps ?? []).find((entry) => {
    const ahead = distanceAhead(track, state.distance, entry.takeoff);
    return !entry.optional && ahead >= 0 && ahead < 260;
  });
  if (jump) {
    // Earn takeoff speed with the selected ship's own boost/reserve. Optional
    // branches remain ordinary route choices rather than forced AI transfers.
    const launchSpeed = Math.min(
      speedProfile.boostSpeed,
      jump.targetSpeed ?? 112,
    );
    // Arrive at the authored launch speed; carrying extra strip momentum into
    // a gap can overshoot the receiving deck even with a clean launch line.
    targetSpeed = launchSpeed;
    brakeSpeed = launchSpeed;
    targetLane = 0;
    wantsBoost = state.energy > 3 && state.speed < launchSpeed - 1;
  }
  targetLane =
    surface?.period > 0
      ? laneDelta(0, targetLane)
      : clamp(
          targetLane,
          (surface?.bounds?.min ?? -track.width / 2) + 4.5,
          (surface?.bounds?.max ?? track.width / 2) - 4.5,
        );
  const speed = Math.max(18, state.speed);
  const sidewaysLoad =
    -frame.curvature * speed * speed * 0.75 - 9.81 * frame.right.y;
  const targetSideways = clamp(
    laneDelta(state.lateral, targetLane) * 1.5,
    -9,
    9,
  );
  let desiredHeading = clamp(
    Math.asin(
      clamp(
        (targetSideways - sidewaysLoad / (7.2 * handling.grip)) / speed,
        -0.4,
        0.4,
      ),
    ),
    -0.24,
    0.24,
  );
  if (Number.isFinite(jump?.launchAlignment) && jump.launchAlignment > 0) {
    // A long declared flight needs a settled launch vector more than one final
    // lane correction. Ease out centering over the first third of the straight,
    // then use grounded steering to cancel residual launch-side velocity.
    const ahead = distanceAhead(track, state.distance, jump.takeoff);
    const blend = clamp(
      (jump.launchAlignment - ahead) / (jump.launchAlignment * 0.35),
      0,
      1,
    );
    const weight = blend * blend * (3 - 2 * blend);
    const aligned = Math.asin(
      clamp((-state.lateralSpeed * 0.15) / speed, -0.2, 0.2),
    );
    desiredHeading += (aligned - desiredHeading) * weight;
  }
  const authority = (1 - STEERING_ASSIST) * 1.5 * handling.turn;
  const feedforward = (-frame.curvature * state.speed) / (1.5 * handling.turn);
  const steer = clamp(
    feedforward - ((desiredHeading - state.heading) * 4.4) / authority,
    -1,
    1,
  );
  // Use the same swept hull/strip contact as device physics, including the
  // next tick's leading-edge entry. Braking here would cancel the catapult.
  const onVector =
    sweptVectorContacts(
      state,
      { ...state, distance: state.distance + Math.max(2, state.speed / 120) },
      devices.filter((device) => device.type === 'vector'),
      track.length,
      track.closed !== false,
    ).length > 0;
  return {
    throttle:
      onVector ||
      state.speed <= targetSpeed + 3 ||
      (state.speed > speedProfile.cruiseSpeed + 3 &&
        state.speed <= brakeSpeed + 3)
        ? 1
        : 0.35,
    brake: onVector
      ? 0
      : clamp((state.speed - brakeSpeed - (jump ? 1 : 8)) / 28, 0, 0.65),
    steer,
    boost: wantsBoost && !onVector,
    airbrake: false,
  };
}

export function getRacerControl(
  state,
  track,
  {
    lane = 0,
    pace = 1,
    nearby = [],
    difficulty = 'easy',
    devices = [],
    runtime = null,
  } = {},
) {
  return controlsFor(
    { state, specification: { lane, pace }, runtime },
    track,
    devices,
    nearby,
    difficulty,
  );
}

export function createRacers({
  track,
  devices = [],
  createRuntime,
  dynamics = null,
}) {
  if (typeof createRuntime !== 'function')
    throw new Error('Racers require the circuit simulation factory');
  const sprint = track.closed === false;
  const lapsRequired = sprint ? 1 : RACE_LAPS;
  const course = courseIdentity(track);
  const relativeTiming = createRelativeTiming(Object.keys(RACE_GRID));
  const opponents = RACE_OPPONENTS.map((specification) => ({
    specification,
    state: createVehicleState(specification.shipId),
    prev: null,
    race: null,
    runtime: createRuntime(),
    finish: null,
    boostSeconds: 0,
  }));
  let enabled = false,
    elapsed = 0,
    playerFinish = null,
    disposed = false,
    difficulty = 'easy';
  let staged = null;
  const sharedDynamics =
    dynamics &&
    opponents.every(
      ({ runtime }) =>
        typeof runtime.beginAdvance === 'function' &&
        typeof runtime.finishAdvance === 'function',
    );

  function reset({
    enabled: nextEnabled = true,
    difficulty: nextDifficulty = 'easy',
  } = {}) {
    if (!RACE_DIFFICULTIES.includes(nextDifficulty))
      throw new Error('Unknown race difficulty');
    staged = null;
    enabled = nextEnabled === true;
    difficulty = nextDifficulty;
    elapsed = 0;
    playerFinish = null;
    relativeTiming.reset(
      Object.fromEntries(
        Object.entries(RACE_GRID).map(([id, pose]) => [id, pose.distance]),
      ),
    );
    for (const opponent of opponents) {
      const { specification } = opponent;
      opponent.state = {
        ...createVehicleState(specification.shipId),
        ...RACE_GRID[specification.id],
      };
      opponent.prev = { ...opponent.state };
      opponent.race = createRace(track, {
        rulesId: `${opponent.runtime.rulesId}:ai:${specification.id}`,
      });
      opponent.finish = null;
      opponent.boostSeconds = 0;
      opponent.runtime.reset({ reason: 'restart', state: opponent.state });
    }
  }
  reset({ enabled: false });

  function prepareTick(
    step,
    { playerState, playerRace, playerPrevious, playerPose } = {},
  ) {
    elapsed += step;
    const nearby = opponents.map((opponent) => ({ ...opponent.state }));
    if (playerState) nearby.push({ ...(playerPrevious ?? playerState) });
    const controls = opponents.map((opponent, index) =>
      controlsFor(
        opponent,
        track,
        devices,
        nearby.filter((_, otherIndex) => otherIndex !== index),
        difficulty,
      ),
    );
    opponents.forEach((opponent) => {
      opponent.prev = { ...opponent.state };
    });
    return { step, controls, playerState, playerRace, playerPose };
  }

  function finishTick(
    { step, controls, playerState, playerPose },
    shared = false,
  ) {
    const events = [];
    opponents.forEach((opponent, index) => {
      const vehicleEvents = shared
        ? opponent.runtime.finishAdvance(opponent.state)
        : opponent.runtime.advance(opponent.state, controls[index], step);
      if (opponent.state.boosting) opponent.boostSeconds += step;
      // Grid positions behind the start line are staging, not a lap crossing.
      opponent.race.step(
        Math.max(0, opponent.prev.distance),
        Math.max(0, opponent.state.distance),
        step,
        vehicleEvents,
        { grounded: opponent.runtime.pose(1)?.grounded !== false },
      );
      // CPU adapters have no presentation. Drain pending decorative events.
      opponent.runtime.update({});
      relativeTiming.update(
        opponent.specification.id,
        presentationDistance(track, opponent.state, opponent.runtime.pose(1)),
        elapsed,
      );
      const wasFinished = !!opponent.finish;
      if (!opponent.finish) opponent.finish = finishFrom(opponent.race);
      if (opponent.finish && !wasFinished)
        events.push({
          type: 'racer-complete',
          payload: {
            id: opponent.specification.id,
            ...copy(opponent.finish),
          },
        });
    });
    if (playerState)
      relativeTiming.update(
        'player',
        presentationDistance(track, playerState, playerPose),
        elapsed,
      );
    return events;
  }

  function finishPlayerRace(playerRace, events) {
    if (!playerFinish && playerRace) {
      playerFinish = finishFrom(playerRace);
      if (playerFinish)
        events.push({
          type: 'player-race-complete',
          payload: copy(playerFinish),
        });
    }
    return events;
  }

  function beginAdvance(dt, context = {}) {
    if (disposed || !enabled || !Number.isFinite(dt) || dt <= 0) return;
    if (staged) throw new Error('Racer advance is already staged');
    staged = prepareTick(dt, context);
    opponents.forEach((opponent, index) => {
      opponent.runtime.beginAdvance(opponent.state, staged.controls[index], dt);
    });
  }

  function finishAdvance({ playerPose } = {}) {
    if (!staged) return [];
    if (playerPose !== undefined) staged.playerPose = playerPose;
    const events = finishTick(staged, true);
    finishPlayerRace(staged.playerRace, events);
    staged = null;
    return events;
  }

  function advance(dt, context = {}) {
    if (disposed || !enabled || !Number.isFinite(dt) || dt <= 0) return [];
    // Core advances at 120 Hz. Subdivide verification calls at the same bound.
    const duration = Math.min(0.1, dt);
    const steps = Math.ceil(duration * 120 - 1e-10);
    const events = [];
    for (let tick = 0; tick < steps; tick++) {
      const step = duration / steps;
      if (sharedDynamics) {
        beginAdvance(step, context);
        dynamics.step(step);
        events.push(...finishAdvance());
      } else events.push(...finishTick(prepareTick(step, context)));
    }
    return finishPlayerRace(context.playerRace, events);
  }

  function row(id, name, state, race, finish, pose) {
    const completedLaps = Math.min(lapsRequired, race.history.length);
    const displayDistance = presentationDistance(track, state, pose);
    return {
      id,
      name,
      position: null,
      distance: displayDistance,
      checkpointDistance: state.distance,
      lateral: state.lateral,
      speed: state.speed,
      lap: Math.min(lapsRequired, completedLaps + 1),
      completedLaps,
      progress: clamp(
        displayDistance /
          (sprint ? track.finishDistance : RACE_LAPS * track.length),
        0,
        1,
      ),
      lapTimes: finish
        ? [...finish.lapTimes]
        : race.history.slice(0, lapsRequired).map((lap) => lap.duration),
      lapValidity: finish
        ? [...finish.lapValidity]
        : race.history.slice(0, lapsRequired).map((lap) => lap.valid),
      currentLapTime: race.elapsed,
      totalTime: finish?.totalTime ?? null,
      finished: !!finish,
      valid: finish?.valid ?? race.valid,
    };
  }

  function snapshot({ playerState, playerRace, playerPose } = {}) {
    const standings = opponents.map((opponent) =>
      row(
        opponent.specification.id,
        opponent.specification.name,
        opponent.state,
        opponent.race,
        opponent.finish,
        opponent.runtime.pose(1),
      ),
    );
    const currentFinish =
      playerFinish ?? (playerRace ? finishFrom(playerRace) : null);
    if (playerState && playerRace)
      standings.push(
        row(
          'player',
          `You · ${getShip(playerState.shipId).name}`,
          playerState,
          playerRace,
          currentFinish,
          playerPose,
        ),
      );
    standings.sort((a, b) => {
      const classifiedA = a.finished && a.valid;
      const classifiedB = b.finished && b.valid;
      if (classifiedA !== classifiedB) return classifiedA ? -1 : 1;
      if (classifiedA)
        return a.totalTime - b.totalTime || a.id.localeCompare(b.id);
      return (
        b.progress - a.progress ||
        b.distance - a.distance ||
        a.id.localeCompare(b.id)
      );
    });
    let position = 0;
    standings.forEach((entry) => {
      // An invalid completed run is visible but cannot claim a timed place.
      if (!entry.finished || entry.valid) entry.position = ++position;
    });
    const playerIndex = standings.findIndex((entry) => entry.id === 'player');
    const player = standings[playerIndex];
    const relative = (entry, ahead) =>
      entry
        ? {
            id: entry.id,
            name: entry.name,
            position: entry.position,
            direction:
              entry.id === 'player' ? 'self' : ahead ? 'ahead' : 'behind',
            seconds:
              entry.id === 'player'
                ? 0
                : relativeTiming.gap(
                    ahead ? entry.id : 'player',
                    ahead ? 'player' : entry.id,
                    elapsed,
                  ),
            lapGap: sprint
              ? 0
              : Math.floor(
                  Math.abs(entry.distance - player.distance) / track.length,
                ),
            finished: entry.finished,
          }
        : null;
    return {
      enabled,
      difficulty,
      laps: lapsRequired,
      courseFormat: course.format,
      elapsed,
      // First completed sprint, or the first two circuit laps, valid or invalid.
      playerFinished: (enabled || sprint) && !!currentFinish,
      standings: enabled
        ? standings
        : sprint
          ? standings.filter((entry) => entry.id === 'player')
          : [],
      relative:
        enabled && player && !currentFinish
          ? {
              ahead: relative(standings[playerIndex - 1], true),
              behind: relative(standings[playerIndex + 1], false),
              field: standings.map((entry, index) =>
                relative(entry, index < playerIndex),
              ),
            }
          : null,
      results:
        (enabled || sprint) && currentFinish
          ? {
              laps: lapsRequired,
              courseFormat: course.format,
              difficulty,
              standings: copy(
                enabled
                  ? standings
                  : standings.filter((entry) => entry.id === 'player'),
              ),
              playerLapTimes: [...currentFinish.lapTimes],
              playerTotalTime: currentFinish.totalTime,
              playerValid: currentFinish.valid,
            }
          : null,
    };
  }

  function serialize() {
    return {
      course: copy(course),
      trackId: track.id,
      relativeTiming: relativeTiming.serialize(),
      enabled,
      difficulty,
      elapsed,
      playerFinish: copy(playerFinish),
      opponents: opponents.map((opponent) => ({
        id: opponent.specification.id,
        state: copy(opponent.state),
        prev: copy(opponent.prev),
        race: captureRace(opponent.race),
        runtime: opponent.runtime.snapshot(),
        finish: copy(opponent.finish),
        boostSeconds: opponent.boostSeconds,
      })),
    };
  }

  function restore(data) {
    if (
      !data ||
      JSON.stringify(data.course) !== JSON.stringify(course) ||
      data.trackId !== track.id ||
      typeof data.enabled !== 'boolean' ||
      !RACE_DIFFICULTIES.includes(data.difficulty) ||
      !Number.isFinite(data.elapsed) ||
      data.elapsed < 0 ||
      data.opponents?.length !== opponents.length
    )
      throw new Error('Racer state mismatch');
    const finiteTree = (value) =>
      typeof value === 'number'
        ? Number.isFinite(value)
        : !value ||
          typeof value !== 'object' ||
          Object.values(value).every(finiteTree);
    if (!finiteTree(data)) throw new Error('Racer state must remain finite');
    const validFinish = (finish) =>
      finish === null ||
      (!!finish &&
        Array.isArray(finish.lapTimes) &&
        finish.lapTimes.length === lapsRequired &&
        finish.lapTimes.every(
          (duration) => Number.isFinite(duration) && duration > 0,
        ) &&
        Array.isArray(finish.lapValidity) &&
        finish.lapValidity.length === lapsRequired &&
        finish.lapValidity.every((valid) => typeof valid === 'boolean') &&
        Number.isFinite(finish.totalTime) &&
        finish.totalTime > 0 &&
        typeof finish.valid === 'boolean');
    if (!validFinish(data.playerFinish))
      throw new Error('Player race finish mismatch');
    for (const [index, saved] of data.opponents.entries()) {
      const opponent = opponents[index];
      if (
        saved.id !== opponent.specification.id ||
        saved.state?.shipId !== opponent.specification.shipId ||
        !saved.prev ||
        !saved.race ||
        !Array.isArray(saved.race.history) ||
        !Array.isArray(saved.race.completedTransfers) ||
        !saved.race.completedTransfers.every(
          (key) => typeof key === 'string' && /^-?\d+:.+$/.test(key),
        ) ||
        typeof saved.race.complete !== 'boolean' ||
        !raceFields.every((key) => key in saved.race) ||
        !Number.isFinite(saved.boostSeconds) ||
        saved.boostSeconds < 0
      )
        throw new Error('Racer identity mismatch');
      const defaults = createVehicleState(opponent.specification.shipId);
      for (const state of [saved.state, saved.prev])
        if (
          !Object.entries(defaults).every(
            ([key, value]) => typeof state[key] === typeof value,
          ) ||
          state.shipId !== opponent.specification.shipId
        )
          throw new Error('Racer vehicle state mismatch');
      if (
        !Number.isSafeInteger(saved.race.lap) ||
        saved.race.lap < 1 ||
        !Number.isSafeInteger(saved.race.checkpoint) ||
        saved.race.checkpoint < 0 ||
        saved.race.checkpoint >= track.checkpoints.length ||
        !Number.isFinite(saved.race.elapsed) ||
        saved.race.elapsed < 0 ||
        typeof saved.race.valid !== 'boolean' ||
        !validFinish(saved.finish) ||
        !saved.race.history.every(
          (lap) =>
            Number.isFinite(lap.duration) &&
            lap.duration > 0 &&
            typeof lap.valid === 'boolean' &&
            typeof lap.rulesId === 'string',
        )
      )
        throw new Error('Racer checkpoint state mismatch');
      // Validate pickup state before changing the live model.
      const engine = dynamics?.snapshot();
      let validation;
      try {
        validation = createRuntime();
        validation.restore(saved.runtime);
      } finally {
        validation?.dispose();
        if (dynamics) dynamics.restore(engine);
      }
    }
    relativeTiming.restore(data.relativeTiming);
    staged = null;
    enabled = data.enabled;
    difficulty = data.difficulty;
    elapsed = data.elapsed;
    playerFinish = copy(data.playerFinish);
    opponents.forEach((opponent, index) => {
      const saved = data.opponents[index];
      opponent.state = copy(saved.state);
      opponent.prev = copy(saved.prev);
      Object.assign(opponent.race, copy(saved.race));
      opponent.runtime.restore(copy(saved.runtime));
      opponent.finish = copy(saved.finish);
      opponent.boostSeconds = saved.boostSeconds;
    });
  }

  return {
    get enabled() {
      return enabled;
    },
    opponents,
    reset,
    advance,
    ...(sharedDynamics ? { beginAdvance, finishAdvance } : {}),
    snapshot,
    serialize,
    restore,
    dispose() {
      if (disposed) return;
      disposed = true;
      staged = null;
      opponents.forEach((opponent) => opponent.runtime.dispose());
    },
  };
}

export { createRacerPresentation } from './racer-presentation.js';
