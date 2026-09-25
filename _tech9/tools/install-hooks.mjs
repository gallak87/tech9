import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import husky from 'husky';

// Installation is deliberately explicit: dependency installation must not
// replace another game's repository-level hooksPath.
const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../..',
);
process.chdir(root);
const previous = execFileSync(
  'git',
  ['config', '--get', '--default', '', 'core.hooksPath'],
  {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  },
).trim();
const result = husky('_tech9/.husky');
if (result) {
  console.error(result);
  process.exitCode = 1;
} else {
  console.log(
    `Tech9 hook installed at _tech9/.husky/_ (previous: ${previous || 'Git default'}).`,
  );
  console.log(
    'Only staged files under _tech9 are checked, using their nearest package configuration.',
  );
}
