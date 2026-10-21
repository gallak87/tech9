import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  mkdtemp,
  cp,
  mkdir,
  readFile,
  readdir,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { format } from 'prettier';
import {
  forkBaseline,
  loadBaseline,
  loadModules,
  loadPlan,
} from '../tools/lib/project.mjs';
import { validateModules, validatePlan } from '../tools/lib/validation.mjs';
import { run } from '../tools/tech9.mjs';
import { STARTING_POINTS } from '../tools/lib/starting-points.mjs';

const execute = promisify(execFile);
const json = (value) => `${JSON.stringify(value, null, 2)}\n`;
const hash = (value) => createHash('sha256').update(value).digest('hex');
const baselinePath = '_tech9/baselines/web-3d-world';
const prettierCli = fileURLToPath(
  new URL('./bin/prettier.cjs', import.meta.resolve('prettier')),
);

function registry() {
  return { schemaVersion: 1, modules: [{ id: 'walking', version: '1.0.0' }] };
}

function plan() {
  return {
    schemaVersion: 2,
    id: 'sample-game',
    title: 'Sample Game',
    pitch: 'Restore a signal in the forest.',
    baselineVersion: '1.0.0',
    status: 'approved',
    authorization: {
      mode: 'delegated',
      basis: 'The user explicitly delegated the bounded prototype.',
    },
    scope: {
      mustHave: ['A playable interaction and reset loop'],
      outOfScope: ['Combat'],
    },
    milestones: [
      {
        id: 'playable',
        title: 'Playable loop',
        deliverables: ['A running game'],
        acceptance: ['Complete the objective and restart'],
      },
    ],
    lanes: [
      { id: 'builder', role: 'build', owns: ['src/game/**'], dependsOn: [] },
      {
        id: 'qa',
        role: 'qa',
        owns: ['tests/game.test.js'],
        dependsOn: ['builder'],
      },
      { id: 'critic', role: 'critic', owns: [], dependsOn: ['qa'] },
    ],
    validation: {
      commands: ['npm test'],
      playthrough: ['Finish and restart using real input'],
      performance: {
        targetFps: 60,
        viewport: { width: 1600, height: 1000 },
        quality: 'high',
      },
    },
    artGate: { threshold: 8, maxRounds: 4 },
    stopAfter: 'Commit evidence and pause for the next game idea.',
  };
}

async function fixture(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'tech9-cli-test-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const write = async (relative, content) => {
    const target = path.join(root, relative);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, content);
  };
  const git = async (...args) =>
    (
      await execute('git', [
        '-C',
        root,
        '-c',
        'core.hooksPath=/dev/null',
        ...args,
      ])
    ).stdout.trim();
  await write('_tech9/modules.json', json(registry()));
  await write('_tech9/modules/walking/src/walk.js', 'export const speed = 3;');
  await write('_tech9/runs/sample-game/plan.json', json(plan()));
  await write(
    `${baselinePath}/package.json`,
    json({
      name: 'tech9-baseline',
      version: '1.0.0',
      type: 'module',
      tech9: { runtime: 'web', renderer: 'three', modules: ['walking'] },
      scripts: {
        dev: 'vite --port 4399',
        preview: 'vite preview --port 4400',
        build: 'vite build',
        prepare: 'broken old hook',
      },
    }),
  );
  await write(
    `${baselinePath}/package-lock.json`,
    json({
      name: 'tech9-baseline',
      lockfileVersion: 3,
      packages: { '': { name: 'tech9-baseline', version: '1.0.0' } },
    }),
  );
  await write(
    `${baselinePath}/src/main.js`,
    "import { sample } from './world.js';\nconsole.log(sample);\n",
  );
  await write(
    `${baselinePath}/src/world.js`,
    "export const sample = 'standalone-ready';\n",
  );
  await write(
    `${baselinePath}/public/assets/LICENSE.md`,
    'CC0 fixture asset\n',
  );
  await write(
    `${baselinePath}/public/assets/forest.glb`,
    Buffer.from([0, 1, 2, 255]),
  );
  await write(`${baselinePath}/art/forest.blend`, 'editable source');
  await write(`${baselinePath}/art/forest.blend1`, 'backup');
  await write(
    `${baselinePath}/node_modules/large.txt`,
    'installed dependencies',
  );
  await write(`${baselinePath}/dist/bundle.js`, 'built output');
  await write(`${baselinePath}/.artifacts/frame.png`, 'disposable image');
  await write(`${baselinePath}/.husky/pre-commit`, 'old repository hook');
  await write(`${baselinePath}/docs/reviews/round.json`, 'old evidence');
  await write(`${baselinePath}/docs/EXTENDING.md`, 'extension guide');
  for (const [name, selected] of Object.entries(STARTING_POINTS)) {
    if (name === 'web-3d-world') continue;
    const relative = `_tech9/${selected.path}`;
    await cp(path.join(root, baselinePath), path.join(root, relative), {
      recursive: true,
    });
    const manifest = JSON.parse(
      await readFile(path.join(root, relative, 'package.json')),
    );
    manifest.name = name;
    manifest.version = '2.0.0';
    manifest.tech9.renderer = selected.renderer;
    await write(`${relative}/package.json`, json(manifest));
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
  const args = {
    root: path.join(root, '_tech9'),
    slug: 'sample-game',
    planPath: 'runs/sample-game/plan.json',
    port: 4410,
  };
  return {
    root,
    framework: args.root,
    write,
    git,
    args,
    source: path.join(root, baselinePath),
    destination: path.join(root, '_tech9/games/sample-game'),
  };
}

test('validates the execution contract and baseline version', () => {
  assert.equal(validatePlan(plan(), '1.0.0').id, 'sample-game');
  const extended = plan();
  extended.authorization.basis = 'The user requested up to 20 critic rounds.';
  extended.artGate.maxRounds = 20;
  assert.equal(validatePlan(extended, '1.0.0').artGate.maxRounds, 20);
  const changed = plan();
  changed.baselineVersion = '9.0.0';
  assert.throws(() => validatePlan(changed, '1.0.0'), /version mismatch/);
});

test('rejects malformed plans, duplicate IDs and unknown dependencies', () => {
  for (const modify of [
    (p) => {
      p.schemaVersion = 3;
    },
    (p) => {
      p.scope.mustHave = [];
    },
    (p) => {
      p.authorization.basis = ' ';
    },
    (p) => {
      p.validation.performance.targetFps = 0;
    },
    (p) => {
      p.milestones.push(structuredClone(p.milestones[0]));
    },
    (p) => {
      p.lanes[1].dependsOn = ['missing'];
    },
  ]) {
    const candidate = plan();
    modify(candidate);
    assert.throws(() => validatePlan(candidate, '1.0.0'));
  }
  for (const maxRounds of [0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
    const candidate = plan();
    candidate.artGate.maxRounds = maxRounds;
    assert.throws(() => validatePlan(candidate, '1.0.0'), /maxRounds/);
  }
});

test('rejects cycles and ambiguous or unsafe lane ownership', () => {
  const cycle = plan();
  cycle.lanes[0].dependsOn = ['critic'];
  assert.throws(() => validatePlan(cycle), /dependency cycle/);
  for (const owned of [
    'src/game/state.js',
    'src/**',
    '../outside',
    '/absolute',
    'src/*.js',
  ]) {
    const overlapping = plan();
    overlapping.lanes[1].owns = [owned];
    assert.throws(() => validatePlan(overlapping));
  }
});

test('rejects duplicate module IDs and invalid module names', () => {
  const duplicate = registry();
  duplicate.modules.push(structuredClone(duplicate.modules[0]));
  assert.throws(() => validateModules(duplicate), /Duplicate/);
  for (const id of ['../outside', '/tmp/x', 'C:/x', 'a/b', 'UPPER']) {
    const candidate = registry();
    candidate.modules[0].id = id;
    assert.throws(() => validateModules(candidate));
  }
});

test('standalone fork preserves source/assets/licenses, excludes generated files and records provenance', async (t) => {
  const f = await fixture(t);
  const originalPackage = await readFile(path.join(f.source, 'package.json'));
  const result = await forkBaseline(f.args);
  assert.equal(result.status, 'scaffolded');
  assert.equal(result.destination, 'games/sample-game');
  assert.equal(result.next[0], 'cd games/sample-game');
  const receipt = JSON.parse(
    await readFile(path.join(f.destination, 'tech9.json')),
  );
  assert.equal(receipt.status, 'scaffolded');
  assert.equal(receipt.source.commit, await f.git('rev-parse', 'HEAD'));
  assert.equal(receipt.source.path, baselinePath);
  assert.equal(receipt.source.version, '1.0.0');
  assert.ok(Number.isFinite(Date.parse(receipt.createdAt)));
  for (const record of receipt.source.files) {
    const content = await readFile(path.join(f.source, record.path));
    assert.equal(record.sha256, hash(content));
    assert.equal(record.bytes, content.length);
  }
  assert.equal(
    receipt.source.snapshotSha256,
    hash(
      receipt.source.files
        .map((file) => `${file.path}\0${file.sha256}\n`)
        .join(''),
    ),
  );
  assert.equal(
    receipt.plan.sha256,
    hash(await readFile(path.join(f.destination, 'GAME_PLAN.json'))),
  );
  assert.deepEqual(
    JSON.parse(await readFile(path.join(f.destination, 'GAME_PLAN.json'))),
    plan(),
  );
  const copiedPackage = JSON.parse(
    await readFile(path.join(f.destination, 'package.json')),
  );
  const copiedLock = JSON.parse(
    await readFile(path.join(f.destination, 'package-lock.json')),
  );
  assert.equal(copiedPackage.name, 'sample-game');
  assert.equal(copiedLock.name, 'sample-game');
  assert.equal(copiedLock.packages[''].name, 'sample-game');
  assert.equal(copiedPackage.scripts.prepare, undefined);
  assert.match(copiedPackage.scripts.dev, /4410$/);
  assert.match(copiedPackage.scripts.preview, /4411$/);
  assert.deepEqual(copiedPackage.config, { devPort: 4410, previewPort: 4411 });
  assert.deepEqual(
    await readFile(path.join(f.source, 'package.json')),
    originalPackage,
  );
  assert.equal(
    await readFile(
      path.join(f.destination, 'public/assets/LICENSE.md'),
      'utf8',
    ),
    'CC0 fixture asset\n',
  );
  assert.equal(
    await readFile(path.join(f.destination, 'art/forest.blend'), 'utf8'),
    'editable source',
  );
  for (const omitted of [
    'node_modules',
    'dist',
    '.artifacts',
    '.husky',
    'docs/reviews',
    'art/forest.blend1',
  ]) {
    await assert.rejects(readFile(path.join(f.destination, omitted)), {
      code: 'ENOENT',
    });
  }
  assert.ok(
    (await readdir(path.join(f.root, '_tech9/games'))).every(
      (name) => !name.startsWith('.'),
    ),
  );
  // Removing the original verifies the fork has no live source-file dependency.
  await rm(f.source, { recursive: true });
  assert.equal(
    (
      await execute(process.execPath, ['src/main.js'], { cwd: f.destination })
    ).stdout.trim(),
    'standalone-ready',
  );
});

test('new forks leave an existing legacy root game untouched', async (t) => {
  const f = await fixture(t);
  await f.write('games/sample-game/keep.txt', 'legacy game');
  const before = await readdir(path.join(f.root, 'games'));
  await forkBaseline(f.args);
  assert.deepEqual(await readdir(path.join(f.root, 'games')), before);
  assert.equal(
    await readFile(path.join(f.root, 'games/sample-game/keep.txt'), 'utf8'),
    'legacy game',
  );
  assert.equal(
    JSON.parse(await readFile(path.join(f.destination, 'tech9.json'))).id,
    'sample-game',
  );
});

test('dry-run performs all checks without creating a destination or temporary files', async (t) => {
  const f = await fixture(t);
  const before = await f.git('status', '--porcelain');
  const result = await forkBaseline({ ...f.args, dryRun: true });
  assert.equal(result.status, 'dry-run');
  assert.ok(result.files > 0);
  await assert.rejects(readdir(path.join(f.root, '_tech9/games')), {
    code: 'ENOENT',
  });
  assert.equal(await f.git('status', '--porcelain'), before);
});

test('rejects malicious slugs and invalid ports before any copy', async (t) => {
  const f = await fixture(t);
  for (const slug of [
    '../escape',
    '/tmp/escape',
    'game;touch',
    'game$(id)',
    'UPPER',
    'two--hyphens',
    '',
    'a'.repeat(65),
  ]) {
    await assert.rejects(forkBaseline({ ...f.args, slug }), /slug/);
  }
  for (const port of [0, 1023, 65535, '4410;touch', 44.1]) {
    await assert.rejects(forkBaseline({ ...f.args, port }), /Port/);
  }
});

test('never overwrites an existing destination, including an empty directory', async (t) => {
  const f = await fixture(t);
  await mkdir(f.destination, { recursive: true });
  await assert.rejects(forkBaseline(f.args), /already exists/);
  await f.write('_tech9/games/sample-game/keep.txt', 'existing game');
  await assert.rejects(forkBaseline(f.args), /already exists/);
  assert.equal(
    await readFile(path.join(f.destination, 'keep.txt'), 'utf8'),
    'existing game',
  );
});

test('rejects draft plans and mismatched slug', async (t) => {
  const f = await fixture(t);
  const draft = plan();
  draft.status = 'draft';
  await f.write(`_tech9/${f.args.planPath}`, json(draft));
  await assert.rejects(forkBaseline(f.args), /approved execution plan/);
  await f.write(`_tech9/${f.args.planPath}`, json(plan()));
  await assert.rejects(
    forkBaseline({ ...f.args, slug: 'other-game' }),
    /match.*plan id/,
  );
});

test('requires clean committed source but allows unrelated repository work', async (t) => {
  const f = await fixture(t);
  await f.write('unrelated-work.txt', 'concurrent game work');
  assert.equal(
    (await forkBaseline({ ...f.args, dryRun: true })).status,
    'dry-run',
  );
  await f.write(`${baselinePath}/src/world.js`, 'uncommitted edit');
  await assert.rejects(forkBaseline(f.args), /clean and committed/);
  await f.git('restore', `${baselinePath}/src/world.js`);
  await f.write(`${baselinePath}/src/untracked.js`, 'untracked code');
  await assert.rejects(forkBaseline(f.args), /clean and committed/);
});

test('rejects symlinked source assets and plan files', async (t) => {
  const f = await fixture(t);
  await symlink(
    path.join(f.framework, f.args.planPath),
    path.join(f.framework, 'plan-link.json'),
  );
  await assert.rejects(
    loadPlan(f.framework, 'plan-link.json', '1.0.0'),
    /Symlinks/,
  );
  await symlink(
    path.join(f.framework, f.args.planPath),
    path.join(f.source, 'src/link.json'),
  );
  await f.git('add', `${baselinePath}/src/link.json`);
  await f.git(
    '-c',
    'user.name=Tech9 test',
    '-c',
    'user.email=tech9-test@example.invalid',
    'commit',
    '--quiet',
    '-m',
    'symlink fixture',
  );
  await assert.rejects(forkBaseline(f.args), /Source symlink/);
});

test('rejects outside plan paths and symlinked destination parents', async (t) => {
  const f = await fixture(t);
  await assert.rejects(
    loadPlan(f.framework, '../outside.json', '1.0.0'),
    /traversal/,
  );
  const outside = await mkdtemp(path.join(os.tmpdir(), 'tech9-outside-'));
  t.after(() => rm(outside, { recursive: true, force: true }));
  await symlink(outside, path.join(f.root, '_tech9/games'));
  await assert.rejects(forkBaseline(f.args), /Symlinks/);
  assert.deepEqual(await readdir(outside), []);
});

test('rejects ignored but uncommitted source files instead of silently copying them', async (t) => {
  const f = await fixture(t);
  await f.write(`${baselinePath}/.gitignore`, 'secret.env\n');
  await f.git('add', `${baselinePath}/.gitignore`);
  await f.git(
    '-c',
    'user.name=Tech9 test',
    '-c',
    'user.email=tech9-test@example.invalid',
    'commit',
    '--quiet',
    '-m',
    'ignore fixture',
  );
  await f.write(`${baselinePath}/secret.env`, 'not an asset');
  await assert.rejects(forkBaseline(f.args), /not committed/);
});

test('module validation checks registered directories', async (t) => {
  const f = await fixture(t);
  assert.equal((await loadModules(f.framework)).modules.length, 1);
  await rm(path.join(f.framework, 'modules/walking'), { recursive: true });
  await assert.rejects(loadModules(f.framework), { code: 'ENOENT' });
});

test('concurrent forks cannot replace each other or leak temporary directories', async (t) => {
  const f = await fixture(t);
  const results = await Promise.allSettled([
    forkBaseline(f.args),
    forkBaseline(f.args),
  ]);
  assert.equal(
    results.filter((result) => result.status === 'fulfilled').length,
    1,
  );
  assert.equal(
    results.filter((result) => result.status === 'rejected').length,
    1,
  );
  assert.deepEqual(await readdir(path.join(f.root, '_tech9/games')), [
    'sample-game',
  ]);
  assert.equal(
    JSON.parse(await readFile(path.join(f.destination, 'tech9.json'))).status,
    'scaffolded',
  );
});

test('failed copying preparation removes only its temporary files', async (t) => {
  const f = await fixture(t);
  await f.write(`${baselinePath}/package-lock.json`, '{invalid lock file');
  await f.git('add', `${baselinePath}/package-lock.json`);
  await f.git(
    '-c',
    'user.name=Tech9 test',
    '-c',
    'user.email=tech9-test@example.invalid',
    'commit',
    '--quiet',
    '-m',
    'invalid lock fixture',
  );
  await f.write('_tech9/games/another-game/keep.txt', 'preserve this game');
  await assert.rejects(forkBaseline(f.args), /Cannot read JSON.*package-lock/);
  assert.deepEqual(await readdir(path.join(f.root, '_tech9/games')), [
    'another-game',
  ]);
  assert.equal(
    await readFile(
      path.join(f.root, '_tech9/games/another-game/keep.txt'),
      'utf8',
    ),
    'preserve this game',
  );
  assert.equal(
    await readFile(path.join(f.source, 'package-lock.json'), 'utf8'),
    '{invalid lock file',
  );
});

test('CLI reports help/modules/validation and rejects unknown options', async (t) => {
  const f = await fixture(t);
  const output = [];
  const options = { root: f.framework, output: (value) => output.push(value) };
  await run(['--help'], options);
  assert.match(output.pop(), /game modules and baseline/);
  await run(['modules'], options);
  assert.equal(JSON.parse(output.pop()).modules[0].id, 'walking');
  await run(['validate', f.args.planPath], options);
  assert.equal(JSON.parse(output.pop()).valid, true);
  await assert.rejects(
    run(['fork', '--wat'], options),
    /Unknown fork argument/,
  );
  await assert.rejects(run(['fork', '--slug'], options), /needs a value/);
  await assert.rejects(run(['unknown'], options), /Unknown command/);
});

test('CLI npm-prefix invocation keeps plans relative to the framework', async (t) => {
  const f = await fixture(t);
  const foundation = path.resolve(
    fileURLToPath(new URL('..', import.meta.url)),
  );
  await cp(path.join(foundation, 'tools'), path.join(f.root, '_tech9/tools'), {
    recursive: true,
  });
  await f.write(
    '_tech9/package.json',
    json({ scripts: { t9: 'node tools/tech9.mjs' } }),
  );
  const result = await execute(
    'npm',
    [
      '--prefix',
      '_tech9',
      'run',
      '--silent',
      't9',
      '--',
      'validate',
      f.args.planPath,
    ],
    {
      cwd: f.root,
    },
  );
  assert.equal(JSON.parse(result.stdout).plan, 'sample-game');
  const nested = await execute(
    process.execPath,
    ['tools/tech9.mjs', 'validate', f.args.planPath],
    {
      cwd: path.join(f.root, '_tech9'),
    },
  );
  assert.equal(JSON.parse(nested.stdout).plan, 'sample-game');
  const fork = await execute(
    process.execPath,
    [
      'tools/tech9.mjs',
      'fork',
      '--slug',
      f.args.slug,
      '--plan',
      f.args.planPath,
    ],
    { cwd: path.join(f.root, '_tech9') },
  );
  assert.equal(JSON.parse(fork.stdout).destination, 'games/sample-game');
  await readFile(path.join(f.destination, 'tech9.json'));
  await assert.rejects(readdir(path.join(f.root, 'games')), { code: 'ENOENT' });
});

for (const existingIgnore of [
  undefined,
  '# Preserve baseline rules\r\nart/sources/\r\n!GAME_PLAN.json',
]) {
  test(`fork protects provenance from game formatting ${existingIgnore === undefined ? 'without' : 'with'} an existing ignore file`, async (t) => {
    const f = await fixture(t);
    await f.write(`${baselinePath}/.prettierrc.json`, json({ tabWidth: 4 }));
    if (existingIgnore !== undefined) {
      await f.write(`${baselinePath}/.prettierignore`, existingIgnore);
    }
    await f.git('add', baselinePath);
    await f.git(
      '-c',
      'user.name=Tech9 test',
      '-c',
      'user.email=tech9-test@example.invalid',
      'commit',
      '--quiet',
      '-m',
      'baseline formatting rules',
    );
    await forkBaseline(f.args);
    const ignore = await readFile(
      path.join(f.destination, '.prettierignore'),
      'utf8',
    );
    assert.ok(ignore.startsWith(existingIgnore ?? ''));
    assert.ok(ignore.endsWith('\ntech9.json\nGAME_PLAN.json\n'));
    const before = {};
    for (const file of ['tech9.json', 'GAME_PLAN.json']) {
      before[file] = await readFile(path.join(f.destination, file));
      // The files would change without the generated exclusions.
      assert.notEqual(
        await format(before[file].toString(), { parser: 'json', tabWidth: 4 }),
        before[file].toString(),
      );
    }
    await execute(process.execPath, [prettierCli, '--write', '.'], {
      cwd: f.destination,
    });
    await execute(process.execPath, [prettierCli, '--check', '.'], {
      cwd: f.destination,
    });
    for (const file of Object.keys(before)) {
      assert.deepEqual(
        await readFile(path.join(f.destination, file)),
        before[file],
      );
    }
    const receipt = JSON.parse(before['tech9.json']);
    assert.equal(receipt.plan.sha256, hash(before['GAME_PLAN.json']));
    if (existingIgnore !== undefined) {
      assert.equal(
        await readFile(path.join(f.source, '.prettierignore'), 'utf8'),
        existingIgnore,
      );
      const sourceRecord = receipt.source.files.find(
        (file) => file.path === '.prettierignore',
      );
      assert.equal(sourceRecord.sha256, hash(existingIgnore));
    }
  });
}

for (const [name, selected] of Object.entries(STARTING_POINTS)) {
  test(`selected starting package ${name} is independently versioned, copied and recorded`, async (t) => {
    const f = await fixture(t);
    const candidate = {
      ...plan(),
      startingPoint: name,
      baselineVersion: name === 'web-3d-world' ? '1.0.0' : '2.0.0',
    };
    await f.write(`_tech9/${f.args.planPath}`, json(candidate));
    const result = await forkBaseline({ ...f.args, from: name });
    assert.equal(result.startingPoint.name, name);
    const receipt = JSON.parse(
      await readFile(path.join(f.destination, 'tech9.json')),
    );
    assert.equal(receipt.source.path, `_tech9/${selected.path}`);
    assert.equal(receipt.source.startingPoint, name);
    assert.equal(receipt.source.runtime, selected.runtime);
    assert.equal(receipt.source.renderer, selected.renderer);
    assert.equal(receipt.source.kind, selected.kind);
    assert.equal(receipt.source.version, candidate.baselineVersion);
    assert.equal(
      JSON.parse(await readFile(path.join(f.destination, 'package.json'))).tech9
        .renderer,
      selected.renderer,
    );
    const bytes = await readFile(path.join(f.destination, 'tech9.json'));
    await assert.rejects(
      forkBaseline({ ...f.args, from: name }),
      /already exists/,
    );
    assert.deepEqual(
      await readFile(path.join(f.destination, 'tech9.json')),
      bytes,
    );
  });
}

test('starting point names have their own catalog and cannot select paths or native engines', async (t) => {
  const f = await fixture(t);
  for (const startingPoint of [
    '../escape',
    'baselines/web-3d-world',
    'godot',
    '',
    null,
    ['web-3d-world'],
  ]) {
    assert.throws(
      () => validatePlan({ ...plan(), startingPoint }),
      /Unknown starting point/,
    );
  }
  await assert.rejects(
    forkBaseline({ ...f.args, from: 'web-pixi' }),
    /match.*execution plan/,
  );
  const candidate = { ...plan(), startingPoint: 'web-pixi' };
  await f.write(`_tech9/${f.args.planPath}`, json(candidate));
  await assert.rejects(forkBaseline(f.args), /version mismatch/);
  const outputs = [];
  await run(['starting-points'], {
    root: f.framework,
    output: (value) => outputs.push(value),
  });
  assert.deepEqual(
    JSON.parse(outputs[0]).map((point) => point.name),
    Object.keys(STARTING_POINTS),
  );
  await assert.rejects(
    run(['starting-points', 'extra'], { root: f.framework }),
    /takes no arguments/,
  );
});

test('a selected package checks its own source, manifest and output boundaries', async (t) => {
  const f = await fixture(t);
  const candidate = {
    ...plan(),
    startingPoint: 'web-pixi',
    baselineVersion: '2.0.0',
  };
  await f.write(`_tech9/${f.args.planPath}`, json(candidate));
  await f.write(`${baselinePath}/src/world.js`, 'unrelated baseline edit');
  assert.equal(
    (await forkBaseline({ ...f.args, dryRun: true })).status,
    'dry-run',
  );
  for (const outputDirectory of [
    '../escape',
    '/tmp/game',
    'scaffolds',
    'scaffolds/web-pixi',
    'scaffolds/web-pixi/child',
  ])
    await assert.rejects(
      forkBaseline({ ...f.args, outputDirectory }),
      /traversal|relative|overlap/,
    );
  await f.write(
    '_tech9/scaffolds/web-pixi/src/world.js',
    'dirty selected source',
  );
  await assert.rejects(forkBaseline(f.args), /clean and committed/);
  const manifest = await loadBaseline(f.framework, 'web-pixi');
  delete manifest.tech9;
  await f.write('_tech9/scaffolds/web-pixi/package.json', json(manifest));
  await assert.rejects(loadBaseline(f.framework, 'web-pixi'), /must declare/);
});

test('verification forks can live entirely inside ignored artifacts', async (t) => {
  const f = await fixture(t);
  const result = await forkBaseline({
    ...f.args,
    outputDirectory: '.artifacts/generation/packages',
  });
  assert.equal(
    result.destination,
    '.artifacts/generation/packages/sample-game',
  );
  await readFile(path.join(f.framework, result.destination, 'tech9.json'));
  await assert.rejects(readdir(path.join(f.framework, 'games')), {
    code: 'ENOENT',
  });
});

test('registry validates concrete renderer, runtime and package requirements', () => {
  const base = () => ({
    schemaVersion: 1,
    modules: [
      {
        id: 'walking',
        version: '1.0.0',
        requires: {
          runtime: 'web',
          renderer: 'pixi',
          dependencies: { 'pixi.js': '8.16.0' },
          modules: ['collision'],
        },
      },
      { id: 'collision', version: '1.0.0' },
    ],
  });
  assert.equal(validateModules(base()).modules.length, 2);
  for (const requires of [
    null,
    [],
    { runtime: 'godot' },
    { renderer: 'phaser' },
    { modules: 'collision' },
    { modules: ['missing'] },
    { modules: ['walking'] },
    { modules: ['collision', 'collision'] },
    { dependencies: [] },
    { dependencies: { '../outside': '1.0.0' } },
    { dependencies: { three: '*' } },
    { unknown: true },
  ]) {
    const candidate = base();
    candidate.modules[0].requires = requires;
    assert.throws(() => validateModules(candidate));
  }
});
