import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import husky from 'husky';

// Installation is deliberately explicit: dependency installation must not
// replace another game's repository-level hooksPath.
const framework = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);
const repository = execFileSync(
  'git',
  ['-C', framework, 'rev-parse', '--show-toplevel'],
  { encoding: 'utf8' },
).trim();
const hookPath = path
  .relative(repository, path.join(framework, '.husky'))
  .split(path.sep)
  .join('/');
process.chdir(repository);
const previous = execFileSync(
  'git',
  ['config', '--get', '--default', '', 'core.hooksPath'],
  {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  },
).trim();
const result = husky(hookPath);
if (result) {
  console.error(result);
  process.exitCode = 1;
} else {
  console.log(
    `Tech9 hook installed at ${hookPath}/_ (previous: ${previous || 'Git default'}).`,
  );
  console.log(
    'Staged framework files use their nearest package configuration.',
  );
}
