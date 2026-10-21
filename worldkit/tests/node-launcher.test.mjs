import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, mkdir, writeFile, chmod, rm, cp } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import test from 'node:test';
import { supportedNode } from '../tools/node-version.mjs';
import { npmExecutable } from '../tools/run.mjs';

const execute = promisify(execFile);
const framework = fileURLToPath(new URL('..', import.meta.url));
const quote = (value) => `'${value.replaceAll("'", "'\\''")}'`;

test('runtime predicate matches engines, including excluded Node 23', () => {
  for (const version of ['22.13.0', '22.99.3', '24.0.0', '25.1.0'])
    assert.equal(supportedNode(version), true, version);
  for (const version of [
    '20.19.0',
    '22.12.9',
    '23.12.0',
    '24.0.0-rc.1',
    '',
    'broken',
  ])
    assert.equal(supportedNode(version), false, version);
});

async function fixture(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'tech9-launcher-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(path.join(root, 'tools'));
  await cp(path.join(framework, 'run'), path.join(root, 'run'));
  await cp(
    path.join(framework, 'tools/node-version.mjs'),
    path.join(root, 'tools/node-version.mjs'),
  );
  await writeFile(
    path.join(root, 'tools/run.mjs'),
    'console.log(JSON.stringify({execPath:process.execPath,args:process.argv.slice(2)}));\n',
  );
  return root;
}

test('explicit runtime preserves spaced arguments and shell literals from any cwd', async (t) => {
  const root = await fixture(t);
  const args = ['run', 'test script', '--', 'literal$(do-not-execute)', 'a; b'];
  const result = await execute('/bin/sh', [path.join(root, 'run'), ...args], {
    cwd: os.tmpdir(),
    env: { ...process.env, TECH9_NODE: process.execPath },
  });
  const output = JSON.parse(result.stdout);
  assert.deepEqual(output.args, args);
  assert.equal(output.execPath, process.execPath);
});

test('invalid explicit runtime fails instead of silently choosing another', async (t) => {
  const root = await fixture(t);
  await assert.rejects(
    execute('/bin/sh', [path.join(root, 'run'), '--runtime'], {
      env: { ...process.env, TECH9_NODE: path.join(root, 'missing') },
    }),
    /TECH9_NODE must name/,
  );
});

test('unsupported PATH runtime falls back to installed bundled runtime without mutating PATH parent', async (t) => {
  const root = await fixture(t);
  const bin = path.join(root, 'bin');
  const bundled = path.join(
    root,
    '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin',
  );
  await mkdir(bin);
  await mkdir(bundled, { recursive: true });
  await writeFile(path.join(bin, 'node'), '#!/bin/sh\nexit 1\n');
  await writeFile(
    path.join(bundled, 'node'),
    `#!/bin/sh\nexec ${quote(process.execPath)} "$@"\n`,
  );
  await chmod(path.join(bin, 'node'), 0o755);
  await chmod(path.join(bundled, 'node'), 0o755);
  const result = await execute('/bin/sh', [path.join(root, 'run'), 'test'], {
    env: {
      ...process.env,
      TECH9_NODE: '',
      HOME: root,
      PATH: `${bin}:/usr/bin:/bin`,
    },
  });
  assert.deepEqual(JSON.parse(result.stdout).args, ['test']);
});

test('npm resolution prefers the selected runtime and reports missing npm', async (t) => {
  const root = await fixture(t);
  const bin = path.join(root, 'bin');
  await mkdir(bin);
  await writeFile(path.join(bin, 'npm'), '#!/bin/sh\nexit 0\n');
  await chmod(path.join(bin, 'npm'), 0o755);
  assert.equal(
    await npmExecutable(path.join(bin, 'node'), { PATH: '/missing' }),
    path.join(bin, 'npm'),
  );
  await assert.rejects(
    npmExecutable('/not-installed/node', { PATH: '/also-missing' }),
    /npm was not found/,
  );
});
