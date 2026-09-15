// npm convenience entry point; Python remains usable without Node/npm.
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const [command, ...args] = process.argv.slice(2);
const candidates = process.platform === 'win32'
  ? [['py', '-3'], ['python'], ['python3']]
  : [['python3'], ['python']];
const python = candidates.find(([bin, ...prefix]) =>
  spawnSync(bin, [...prefix, '-c', 'import sys; sys.exit(sys.version_info < (3, 9))'], {stdio: 'ignore'}).status === 0);
if (!python) {
  console.error('Python 3.9+ is required. See _prep/README.md.');
  process.exit(1);
}
function run(script, forwarded) {
  const result = spawnSync(python[0], [...python.slice(1), path.join(here, script), ...forwarded], {stdio: 'inherit'});
  if (result.error) console.error(result.error.message);
  if (result.status !== 0) process.exit(result.status ?? 1);
}
switch (command) {
  case 'setup':
    run('aseprite.py', ['setup', ...args]);
    run('sprites.py', ['smoke']);
    break;
  case 'aseprite': run('aseprite.py', args); break;
  case 'sprites': run('sprites.py', args); break;
  case 'kaida': run('../sources/kaida-run-v2/build.py', args); break;
  case 'test':
    run('../tests/test_workflow.py', args);
    run('../tests/test_run.py', args);
    break;
  default: console.error('Expected setup, aseprite, sprites, kaida, or test'); process.exit(1);
}
