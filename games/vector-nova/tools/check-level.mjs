import { parseArgs } from 'node:util';
import {
  assertLevelContract,
  loadLevel,
} from './level-checks/level-contract.mjs';

try {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      step: { type: 'string' },
      'arc-tolerance': { type: 'string' },
      'max-frame-turn': { type: 'string' },
    },
  });
  if (positionals.length !== 1)
    throw new Error(
      'Usage: npm run check:level -- <slug> [--step 1] [--arc-tolerance .01] [--max-frame-turn .1]',
    );
  const options = {};
  for (const [flag, key] of [
    ['step', 'step'],
    ['arc-tolerance', 'arcTolerance'],
    ['max-frame-turn', 'maxFrameTurnPerMetre'],
  ])
    if (values[flag] !== undefined) options[key] = Number(values[flag]);
  const report = await assertLevelContract(
    await loadLevel(positionals[0]),
    options,
  );
  console.log(JSON.stringify(report, null, 2));
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
