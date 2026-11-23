import { parseArgs } from 'node:util';
import { Quaternion, Vector3 } from 'three';
import { validateDefinition, validateTrack } from '../src/levels/contract.js';
import { loadLevel } from './level-checks/level-contract.mjs';

const jumpStations = ['takeoff', 'landingStart', 'landingEnd', 'recovery'];

async function loadRoute(slug) {
  const { createLevel } = await loadLevel(slug);
  const level = validateDefinition(await createLevel({ shape: false }), slug);
  return validateTrack(await level.createTrack());
}

function summarize(track, slug) {
  return {
    slug,
    trackId: track.id,
    geometryVersion: track.geometryVersion ?? null,
    closed: track.closed !== false,
    length: track.length,
    width: track.width,
    finishDistance: track.finishDistance ?? null,
    checkpoints: track.checkpoints.map(({ distance, s }) => distance ?? s),
    jumps: (track.jumps ?? []).map((jump) => ({
      id: jump.id,
      ...Object.fromEntries(jumpStations.map((key) => [key, jump[key]])),
    })),
  };
}

function compareStations(baseline, variant, intervals) {
  const length = Math.min(baseline.length, variant.length);
  const includeEndpoint = baseline.closed === false && variant.closed === false;
  const samples = intervals + Number(includeEndpoint);
  const centerline = { metres: 0, station: 0 };
  const frame = { radians: 0, station: 0 };
  const position = new Vector3();
  const quaternion = new Quaternion();
  for (let index = 0; index < samples; index++) {
    const station = (index * length) / intervals;
    const first = baseline.sample(station);
    position.copy(first.position);
    quaternion.copy(first.quaternion);
    const second = variant.sample(station);
    const metres = position.distanceTo(second.position);
    const radians = quaternion.angleTo(second.quaternion);
    if (!Number.isFinite(metres) || !Number.isFinite(radians))
      throw new Error(`Nonfinite track frame at ${station} m.`);
    if (metres > centerline.metres)
      Object.assign(centerline, { metres, station });
    if (radians > frame.radians) Object.assign(frame, { radians, station });
  }
  return { samples, spacing: length / intervals, centerline, frame };
}

function compare(baseline, variant, geometry, options) {
  const differences = [];
  const check = (label, first, second, tolerance = options.metres) => {
    if (first === second && (Number.isFinite(first) || first === null)) return;
    if (
      !Number.isFinite(first) ||
      !Number.isFinite(second) ||
      Math.abs(second - first) > tolerance
    )
      differences.push({ field: label, baseline: first, variant: second });
  };
  if (baseline.closed !== variant.closed)
    differences.push({
      field: 'closed',
      baseline: baseline.closed,
      variant: variant.closed,
    });
  check('length', baseline.length, variant.length);
  check('finishDistance', baseline.finishDistance, variant.finishDistance);
  check('centerlineMetres', 0, geometry.centerline.metres);
  check('frameRadians', 0, geometry.frame.radians, options.radians);
  if (options.width !== undefined) check('width', options.width, variant.width);
  check(
    'checkpoints.length',
    baseline.checkpoints.length,
    variant.checkpoints.length,
    0,
  );
  baseline.checkpoints
    .slice(0, variant.checkpoints.length)
    .forEach((station, index) => {
      check(`checkpoints[${index}]`, station, variant.checkpoints[index]);
    });
  check('jumps.length', baseline.jumps.length, variant.jumps.length, 0);
  baseline.jumps.slice(0, variant.jumps.length).forEach((jump, index) => {
    for (const key of jumpStations)
      check(`jumps[${index}].${key}`, jump[key], variant.jumps[index][key]);
  });
  return differences;
}

try {
  const { positionals, values } = parseArgs({
    allowPositionals: true,
    options: {
      step: { type: 'string', default: '1' },
      metres: { type: 'string', default: '0.0001' },
      radians: { type: 'string', default: '0.0001' },
      width: { type: 'string' },
      help: { type: 'boolean' },
    },
  });
  const usage =
    'Usage: npm run check:route-variant -- <baseline> <variant> [--width metres] [--step 1] [--metres 0.0001] [--radians 0.0001]';
  if (values.help) {
    console.log(usage);
  } else {
    if (positionals.length !== 2) throw new Error(usage);
    const options = Object.fromEntries(
      Object.entries(values).map(([key, value]) => [key, Number(value)]),
    );
    for (const [key, value] of Object.entries(options))
      if (!Number.isFinite(value) || value <= 0)
        throw new Error(`--${key} needs a finite, positive number.`);
    const [baseline, variant] = await Promise.all(positionals.map(loadRoute));
    const intervals = Math.ceil(
      Math.min(baseline.length, variant.length) / options.step,
    );
    if (intervals < 4 || intervals > 25000)
      throw new Error('Choose --step to produce 4–25000 sampling intervals.');
    const original = summarize(baseline, positionals[0]);
    const revised = summarize(variant, positionals[1]);
    const geometry = compareStations(baseline, variant, intervals);
    const differences = compare(original, revised, geometry, options);
    console.log(
      JSON.stringify(
        {
          baseline: original,
          variant: revised,
          widthChangeMetres: revised.width - original.width,
          expectedWidth: options.width ?? null,
          tolerances: { metres: options.metres, radians: options.radians },
          ...geometry,
          differences,
        },
        null,
        2,
      ),
    );
    if (differences.length) process.exitCode = 1;
  }
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
