#!/usr/bin/env node
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  forkBaseline,
  loadBaseline,
  loadModules,
  loadPlan,
} from './lib/project.mjs';

export const HELP = `tech9 — game modules and baseline

From the framework directory:
  ./run run t9 -- modules
  ./run run t9 -- validate [runs/my-game/plan.json]
  ./run run t9 -- fork --slug my-game --plan runs/my-game/plan.json [--port 4410] [--dry-run]

modules   List reusable modules and versions.
validate  Check module paths and an optional execution plan.
fork      Copy the baseline into games/<slug> using an approved plan.

Paths are relative to the framework directory, regardless of working directory.
The baseline must be clean and committed. Fork never overwrites an existing
package. --dry-run validates without writes. Default ports are 4410 and 4411.
`;

function forkOptions(args) {
  const options = {};
  const values = new Set(['--slug', '--plan', '--port']);
  for (let index = 0; index < args.length; index += 1) {
    const name = args[index];
    if (name === '--dry-run') {
      if (options.dryRun) throw new Error('Duplicate --dry-run');
      options.dryRun = true;
    } else if (values.has(name)) {
      const value = args[++index];
      if (!value || value.startsWith('--'))
        throw new Error(`${name} needs a value`);
      const key = {
        '--slug': 'slug',
        '--plan': 'planPath',
        '--port': 'port',
      }[name];
      if (options[key] !== undefined) throw new Error(`Duplicate ${name}`);
      options[key] = value;
    } else throw new Error(`Unknown fork argument: ${name}`);
  }
  for (const key of ['slug', 'planPath'])
    if (!options[key])
      throw new Error(`Missing ${key === 'planPath' ? '--plan' : '--slug'}`);
  return options;
}

export async function run(
  args,
  {
    root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'),
    output = console.log,
  } = {},
) {
  const [command, ...rest] = args;
  if (!command || command === '--help' || command === 'help') {
    output(HELP);
    return;
  }
  if (command === 'modules') {
    if (rest.length) throw new Error('modules takes no arguments');
    output(JSON.stringify(await loadModules(root), null, 2));
  } else if (command === 'validate') {
    if (rest.length > 1 || rest[0]?.startsWith('--'))
      throw new Error('validate accepts one optional plan path');
    const registry = await loadModules(root);
    const plan = rest[0]
      ? await loadPlan(root, rest[0], (await loadBaseline(root)).version)
      : null;
    output(
      JSON.stringify(
        {
          valid: true,
          modules: registry.modules.length,
          ...(plan ? { plan: plan.id, status: plan.status } : {}),
        },
        null,
        2,
      ),
    );
  } else if (command === 'fork') {
    output(
      JSON.stringify(
        await forkBaseline({ root, ...forkOptions(rest) }),
        null,
        2,
      ),
    );
  } else throw new Error(`Unknown command: ${command}. Run with --help.`);
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  run(process.argv.slice(2)).catch((error) => {
    console.error(`tech9: ${error.message}`);
    process.exitCode = 1;
  });
}
