import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const execute = promisify(execFile);
const lintStagedCli = fileURLToPath(
  new URL('../bin/lint-staged.js', import.meta.resolve('lint-staged')),
);

test('scoped hook ignores root/older-game files and uses each scene/game package directory', async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'tech9-hooks-test-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const write = async (relative, content) => {
    const target = path.join(root, relative);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, content);
  };
  const git = (...args) =>
    execute('git', ['-C', root, '-c', 'core.hooksPath=/dev/null', ...args]);
  await write(
    'record.mjs',
    `import { appendFileSync } from 'node:fs';
appendFileSync(new URL('./executed.jsonl', import.meta.url), JSON.stringify({ cwd: process.cwd(), files: process.argv.slice(2) }) + '\\n');
`,
  );
  for (const [directory, command] of [
    ['', 'node record.mjs'],
    ['games/older', 'node ../../record.mjs'],
    ['_tech9', 'node ../record.mjs'],
    ['_tech9/scenes/forest', 'node ../../../record.mjs'],
    ['_tech9/games/pilot', 'node ../../../record.mjs'],
  ]) {
    await write(
      path.join(directory, 'package.json'),
      JSON.stringify({ 'lint-staged': { '*.md': command } }),
    );
  }
  await git('init', '--quiet');
  await git('add', '.');
  await git(
    '-c',
    'user.name=Tech9 test',
    '-c',
    'user.email=tech9-test@example.invalid',
    'commit',
    '--quiet',
    '-m',
    'fixture',
  );
  for (const directory of [
    '',
    'games/older',
    '_tech9',
    '_tech9/scenes/forest',
    '_tech9/games/pilot',
  ]) {
    await write(path.join(directory, 'README.md'), 'fixture\n');
  }
  await git('add', '.');
  await execute(process.execPath, [lintStagedCli], {
    cwd: path.join(root, '_tech9'),
  });
  const calls = (await readFile(path.join(root, 'executed.jsonl'), 'utf8'))
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line));
  assert.equal(calls.length, 3);
  assert.deepEqual(
    calls.map((call) => call.cwd.slice(call.cwd.lastIndexOf('/_tech9'))).sort(),
    ['/_tech9', '/_tech9/games/pilot', '/_tech9/scenes/forest'],
  );
  assert.ok(
    calls.every(
      (call) =>
        call.files.length === 1 && call.files[0] === `${call.cwd}/README.md`,
    ),
  );
  // Running tooling does not install/repoint repository hooks.
  assert.equal(
    (
      await execute('git', [
        '-C',
        root,
        'config',
        '--get',
        '--default',
        '',
        'core.hooksPath',
      ])
    ).stdout.trim(),
    '',
  );
});
