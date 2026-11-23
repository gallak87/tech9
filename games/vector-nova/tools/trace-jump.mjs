import { parseArgs } from 'node:util';
import { advanceSession } from '../src/core/session-runtime.js';
import {
  createSimulationActors,
  createSimulationWorld,
} from '../src/core/simulation.js';
import { validateDefinition } from '../src/levels/contract.js';
import { createVehicleState, STEERING_ASSIST } from '../src/physics/index.js';
import { createRace } from '../src/race/index.js';
import { SHIPS } from '../src/ships/catalog.js';
import { loadLevel } from './level-checks/level-contract.mjs';

const tickSeconds = 1 / 120;
const seed = 7;
const shipIds = SHIPS.map(({ id }) => id);
const usage = `Usage: node tools/trace-jump.mjs <slug> [options]
  --list                    List the circuit's authored jump playtest cases
  --case <id>               Select a playtest case (default: circuit default)
  --scenario <id>           Select a runtime or track scenario instead
  --ships <id,id,...>       Trace each chassis independently (default: kestrel)
                            Available: ${shipIds.join(', ')}
  --ticks <1-3600>          Maximum fixed ticks per run (default: 1440)
  --settle-ticks <0-600>    Extra ticks after the first transfer (default: 0)
  --speed <m/s>             Override starting speed; keep authored value by default
  --lateral=<m>             Override starting lateral offset
  --heading=<radians>       Override starting heading
  --throttle <0-1>          Constant throttle (default: 0)
  --steer=<-1 to 1>        Constant steering (default: 0)
  --boost                   Hold boost alongside throttle

Prints fixed-tick events and the final physical pose as JSON. The production
collision world, devices and chassis run in a solo, untimed jump playtest.`;

function numericOption(values, flag, min, max, integer = false) {
  if (values[flag] === undefined) return undefined;
  const raw = values[flag].trim();
  const value = Number(raw);
  if (
    !raw ||
    !Number.isFinite(value) ||
    value < min ||
    value > max ||
    (integer && !Number.isInteger(value))
  )
    throw new Error(`Invalid --${flag}. Use --help for supported values.`);
  return value;
}

function snapshotPose(runtime) {
  const pose = runtime.pose(1);
  if (!pose) return null;
  return {
    position: pose.position.toArray(),
    quaternion: pose.quaternion.toArray(),
    grounded: pose.grounded,
    recovering: pose.recovering,
  };
}

async function traceShip(world, playtest, scenario, ship, options) {
  const { track, dynamics } = world;
  const actors = createSimulationActors(world, {
    settings: { steeringAssist: STEERING_ASSIST },
  });
  try {
    const { motion, runtime } = await actors.createActor({
      combatId: 'player',
      context: { playtest, presentation: false },
    });
    const source =
      (Object.hasOwn(runtime.scenarios ?? {}, scenario) &&
        runtime.scenarios[scenario]?.state) ||
      (Object.hasOwn(track.scenarios ?? {}, scenario) &&
        track.scenarios[scenario]);
    if (!source) throw new Error(`Unknown scenario: ${scenario}`);
    const state = {
      ...createVehicleState(ship),
      ...source,
      ...options.overrides,
      shipId: ship,
    };
    dynamics?.reset();
    runtime.reset({ reason: 'scenario', state, scenario, seed });
    const race = createRace(track, { rulesId: runtime.rulesId, untimed: true });
    race.placeScenario(state.distance);
    const start = { ...state };
    const events = [];
    let transferTick = null;
    let executedTicks = 0;
    let stop = 'tick-limit';
    for (let tick = 1; tick <= options.ticks; tick++) {
      const current = advanceSession({
        state,
        input: options.input,
        dt: tickSeconds,
        runtime,
        race,
        dynamics,
        presentation: false,
        emit: () => {},
      });
      executedTicks = tick;
      for (const event of current) {
        events.push({ ...structuredClone(event), tick, time: state.time });
        if (event.type === 'jump-transfer') transferTick ??= tick;
      }
      if (transferTick !== null && tick - transferTick >= options.settleTicks) {
        stop = 'transfer';
        break;
      }
    }
    const pose = snapshotPose(runtime);
    if (
      !Object.values(state).every(
        (value) => typeof value !== 'number' || Number.isFinite(value),
      ) ||
      (pose && ![...pose.position, ...pose.quaternion].every(Number.isFinite))
    )
      throw new Error(
        `${ship}: non-finite simulation state at tick ${executedTicks}`,
      );
    return {
      ship,
      runtime: runtime.id,
      start,
      ticks: executedTicks,
      stop,
      mode: motion.status?.()?.mode ?? motion.snapshot()?.mode ?? null,
      state,
      pose,
      events,
    };
  } finally {
    actors.dispose();
  }
}

async function main() {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      help: { type: 'boolean', short: 'h' },
      list: { type: 'boolean' },
      case: { type: 'string' },
      scenario: { type: 'string' },
      ships: { type: 'string', default: 'kestrel' },
      ticks: { type: 'string', default: '1440' },
      'settle-ticks': { type: 'string', default: '0' },
      speed: { type: 'string' },
      lateral: { type: 'string' },
      heading: { type: 'string' },
      throttle: { type: 'string', default: '0' },
      steer: { type: 'string', default: '0' },
      boost: { type: 'boolean', default: false },
    },
  });
  if (values.help) return console.log(usage);
  if (positionals.length !== 1) throw new Error(usage);
  if (values.case !== undefined && values.scenario !== undefined)
    throw new Error('Choose either --case or --scenario.');
  const [slug] = positionals;
  const { createLevel } = await loadLevel(slug);
  const definition = validateDefinition(
    await createLevel({ shape: false }),
    slug,
  );
  const playtest = definition.playtests?.jump;
  if (!playtest) throw new Error(`${slug} has no authored jump playtest.`);
  const cases = playtest.cases ?? [
    { id: 'default', label: playtest.label, scenario: playtest.scenario },
  ];
  const defaultCase = cases.find(
    ({ scenario }) => scenario === playtest.scenario,
  );
  if (values.list)
    return console.log(
      JSON.stringify(
        { level: slug, defaultCase: defaultCase.id, cases },
        null,
        2,
      ),
    );
  const selected =
    values.case === undefined
      ? defaultCase
      : cases.find(({ id }) => id === values.case);
  if (!selected)
    throw new Error(`Unknown case: ${values.case}. Use --list to see cases.`);
  const scenario = values.scenario ?? selected.scenario;
  const ships = values.ships.split(',').map((id) => id.trim());
  if (
    ships.some((id) => !shipIds.includes(id)) ||
    new Set(ships).size !== ships.length
  )
    throw new Error(`Supply distinct player ship IDs: ${shipIds.join(', ')}.`);
  const options = {
    ticks: numericOption(values, 'ticks', 1, 3600, true),
    settleTicks: numericOption(values, 'settle-ticks', 0, 600, true),
    overrides: Object.fromEntries(
      ['speed', 'lateral', 'heading']
        .filter((flag) => values[flag] !== undefined)
        .map((flag) => [
          flag,
          numericOption(
            values,
            flag,
            flag === 'speed' ? 0 : -Infinity,
            Infinity,
          ),
        ]),
    ),
    input: {
      throttle: numericOption(values, 'throttle', 0, 1),
      steer: numericOption(values, 'steer', -1, 1),
      brake: 0,
      boost: values.boost,
      airbrake: false,
    },
  };
  const world = await createSimulationWorld(definition);
  try {
    const runs = [];
    for (const ship of ships)
      runs.push(await traceShip(world, playtest, scenario, ship, options));
    console.log(
      JSON.stringify(
        {
          level: slug,
          track: world.track.id,
          case: values.scenario === undefined ? selected.id : null,
          scenario,
          seed,
          tickHz: 1 / tickSeconds,
          ...options,
          runs,
        },
        null,
        2,
      ),
    );
  } finally {
    world.dispose();
  }
}

try {
  await main();
} catch (error) {
  console.error(error);
  process.exitCode = 1;
}
