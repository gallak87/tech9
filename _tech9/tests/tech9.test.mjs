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
import { forkStarter, loadCatalog, loadPlan } from '../tools/lib/project.mjs';
import { validateCatalog, validatePlan } from '../tools/lib/validation.mjs';
import { run } from '../tools/tech9.mjs';

const execute = promisify(execFile);
const json = (value) => `${JSON.stringify(value, null, 2)}\n`;
const hash = (value) => createHash('sha256').update(value).digest('hex');
const scenePath = '_tech9/scenes/scene-test';
const prettierCli = fileURLToPath(
  new URL('./bin/prettier.cjs', import.meta.resolve('prettier')),
);

function catalog() {
  return {
    schemaVersion: 1,
    scenes: [
      {
        id: 'alder-vale',
        version: '1.1.0',
        path: scenePath,
        manifest: 'scene.json',
      },
    ],
    starters: [
      {
        id: 'forest-exploration',
        version: '0.1.0',
        scene: 'alder-vale',
        status: 'available',
        description: 'A bounded forest starter.',
        provides: ['fly-camera'],
        excludes: ['gameplay'],
      },
    ],
    modules: [],
  };
}

function plan() {
  return {
    schemaVersion: 1,
    id: 'sample-game',
    title: 'Sample Game',
    pitch: 'Restore a signal in the forest.',
    starter: { id: 'forest-exploration', version: '0.1.0' },
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
  await write('_tech9/catalog.json', json(catalog()));
  await write('_tech9/runs/sample-game/plan.json', json(plan()));
  await write(
    `${scenePath}/scene.json`,
    json({ id: 'alder-vale', version: '1.1.0' }),
  );
  await write(
    `${scenePath}/package.json`,
    json({
      name: 'scene-test',
      version: '1.0.0',
      type: 'module',
      scripts: {
        dev: 'vite --port 4399',
        preview: 'vite preview --port 4400',
        build: 'vite build',
        prepare: 'broken old hook',
      },
    }),
  );
  await write(
    `${scenePath}/package-lock.json`,
    json({
      name: 'scene-test',
      lockfileVersion: 3,
      packages: { '': { name: 'scene-test', version: '1.0.0' } },
    }),
  );
  await write(
    `${scenePath}/src/main.js`,
    "import { sample } from './world.js';\nconsole.log(sample);\n",
  );
  await write(
    `${scenePath}/src/world.js`,
    "export const sample = 'standalone-ready';\n",
  );
  await write(`${scenePath}/public/assets/LICENSE.md`, 'CC0 fixture asset\n');
  await write(
    `${scenePath}/public/assets/forest.glb`,
    Buffer.from([0, 1, 2, 255]),
  );
  await write(`${scenePath}/art/forest.blend`, 'editable source');
  await write(`${scenePath}/art/forest.blend1`, 'backup');
  await write(`${scenePath}/node_modules/large.txt`, 'installed dependencies');
  await write(`${scenePath}/dist/bundle.js`, 'built output');
  await write(`${scenePath}/.artifacts/frame.png`, 'disposable image');
  await write(`${scenePath}/.husky/pre-commit`, 'old repository hook');
  await write(`${scenePath}/docs/reviews/round.json`, 'old evidence');
  await write(`${scenePath}/docs/EXTENDING.md`, 'extension guide');
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
    root,
    starterId: 'forest-exploration',
    slug: 'sample-game',
    planPath: '_tech9/runs/sample-game/plan.json',
    port: 4410,
  };
  return {
    root,
    write,
    git,
    args,
    source: path.join(root, scenePath),
    destination: path.join(root, '_tech9/games/sample-game'),
  };
}

test('validates the minimal execution contract and exact catalog versions', () => {
  assert.equal(validatePlan(plan(), catalog()).id, 'sample-game');
  const changed = plan();
  changed.starter.version = '9.0.0';
  assert.throws(() => validatePlan(changed, catalog()), /version mismatch/);
  const unavailable = catalog();
  unavailable.starters[0].status = 'planned';
  assert.throws(() => validatePlan(plan(), unavailable), /not available/);
});

test('rejects malformed plans, duplicate IDs and unknown dependencies', () => {
  for (const modify of [
    (p) => {
      p.schemaVersion = 2;
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
    assert.throws(() => validatePlan(candidate, catalog()));
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

test('rejects duplicate catalog IDs, unknown scenes and path traversal', () => {
  const duplicate = catalog();
  duplicate.scenes.push(structuredClone(duplicate.scenes[0]));
  assert.throws(() => validateCatalog(duplicate), /Duplicate/);
  const unknown = catalog();
  unknown.starters[0].scene = 'missing';
  assert.throws(() => validateCatalog(unknown), /unknown scene/);
  for (const unsafe of [
    '../outside',
    '/tmp/x',
    'C:/x',
    'a\\b',
    'a/../b',
    'a//b',
  ]) {
    const candidate = catalog();
    candidate.scenes[0].path = unsafe;
    assert.throws(() => validateCatalog(candidate));
  }
});

test('standalone fork preserves source/assets/licenses, excludes generated files and records provenance', async (t) => {
  const f = await fixture(t);
  const originalPackage = await readFile(path.join(f.source, 'package.json'));
  const result = await forkStarter(f.args);
  assert.equal(result.status, 'scaffolded');
  assert.equal(result.destination, '_tech9/games/sample-game');
  assert.equal(result.next[0], 'cd _tech9/games/sample-game');
  const receipt = JSON.parse(
    await readFile(path.join(f.destination, 'tech9.json')),
  );
  assert.equal(receipt.status, 'scaffolded');
  assert.equal(receipt.source.commit, await f.git('rev-parse', 'HEAD'));
  assert.equal(receipt.source.path, scenePath);
  assert.equal(receipt.starter.version, '0.1.0');
  assert.equal(receipt.scene.version, '1.1.0');
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
  await forkStarter(f.args);
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
  const result = await forkStarter({ ...f.args, dryRun: true });
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
    await assert.rejects(forkStarter({ ...f.args, slug }), /slug/);
  }
  for (const port of [0, 1023, 65535, '4410;touch', 44.1]) {
    await assert.rejects(forkStarter({ ...f.args, port }), /Port/);
  }
});

test('never overwrites an existing destination, including an empty directory', async (t) => {
  const f = await fixture(t);
  await mkdir(f.destination, { recursive: true });
  await assert.rejects(forkStarter(f.args), /already exists/);
  await f.write('_tech9/games/sample-game/keep.txt', 'existing game');
  await assert.rejects(forkStarter(f.args), /already exists/);
  assert.equal(
    await readFile(path.join(f.destination, 'keep.txt'), 'utf8'),
    'existing game',
  );
});

test('rejects draft plans and mismatched slug or starter', async (t) => {
  const f = await fixture(t);
  const draft = plan();
  draft.status = 'draft';
  await f.write(f.args.planPath, json(draft));
  await assert.rejects(forkStarter(f.args), /approved execution plan/);
  await f.write(f.args.planPath, json(plan()));
  await assert.rejects(
    forkStarter({ ...f.args, slug: 'other-game' }),
    /match.*plan id/,
  );
  await assert.rejects(
    forkStarter({ ...f.args, starterId: 'unknown' }),
    /starter must match/,
  );
});

test('requires clean committed source but allows unrelated repository work', async (t) => {
  const f = await fixture(t);
  await f.write('unrelated-work.txt', 'concurrent game work');
  assert.equal(
    (await forkStarter({ ...f.args, dryRun: true })).status,
    'dry-run',
  );
  await f.write(`${scenePath}/src/world.js`, 'uncommitted edit');
  await assert.rejects(forkStarter(f.args), /clean and committed/);
  await f.git('restore', `${scenePath}/src/world.js`);
  await f.write(`${scenePath}/src/untracked.js`, 'untracked code');
  await assert.rejects(forkStarter(f.args), /clean and committed/);
});

test('rejects symlinked source assets and plan files', async (t) => {
  const f = await fixture(t);
  await symlink(
    path.join(f.root, f.args.planPath),
    path.join(f.root, 'plan-link.json'),
  );
  await assert.rejects(
    loadPlan(f.root, 'plan-link.json', catalog()),
    /Symlinks/,
  );
  await symlink(
    path.join(f.root, f.args.planPath),
    path.join(f.source, 'src/link.json'),
  );
  await f.git('add', `${scenePath}/src/link.json`);
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
  await assert.rejects(forkStarter(f.args), /Source symlink/);
});

test('rejects outside plan paths and symlinked destination parents', async (t) => {
  const f = await fixture(t);
  await assert.rejects(
    loadPlan(f.root, '../outside.json', catalog()),
    /traversal/,
  );
  const outside = await mkdtemp(path.join(os.tmpdir(), 'tech9-outside-'));
  t.after(() => rm(outside, { recursive: true, force: true }));
  await symlink(outside, path.join(f.root, '_tech9/games'));
  await assert.rejects(forkStarter(f.args), /Symlinks/);
  assert.deepEqual(await readdir(outside), []);
});

test('rejects ignored but uncommitted source files instead of silently copying them', async (t) => {
  const f = await fixture(t);
  await f.write(`${scenePath}/.gitignore`, 'secret.env\n');
  await f.git('add', `${scenePath}/.gitignore`);
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
  await f.write(`${scenePath}/secret.env`, 'not an asset');
  await assert.rejects(forkStarter(f.args), /not committed/);
});

test('catalog validation checks scene manifests and paths', async (t) => {
  const f = await fixture(t);
  assert.equal((await loadCatalog(f.root)).scenes.length, 1);
  await f.write(
    `${scenePath}/scene.json`,
    json({ id: 'wrong-scene', version: '1.1.0' }),
  );
  await assert.rejects(loadCatalog(f.root), /manifest id\/version/);
});

test('concurrent forks cannot replace each other or leak temporary directories', async (t) => {
  const f = await fixture(t);
  const results = await Promise.allSettled([
    forkStarter(f.args),
    forkStarter(f.args),
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
  await f.write(`${scenePath}/package-lock.json`, '{invalid lock file');
  await f.git('add', `${scenePath}/package-lock.json`);
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
  await assert.rejects(forkStarter(f.args), /Cannot read JSON.*package-lock/);
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

test('CLI reports help/catalog/validation and rejects unknown options', async (t) => {
  const f = await fixture(t);
  const output = [];
  const options = { root: f.root, output: (value) => output.push(value) };
  await run(['--help'], options);
  assert.match(output.pop(), /not completed games/);
  await run(['catalog'], options);
  assert.equal(JSON.parse(output.pop()).starters[0].id, 'forest-exploration');
  await run(['validate', f.args.planPath], options);
  assert.equal(JSON.parse(output.pop()).valid, true);
  await assert.rejects(
    run(['fork', '--wat'], options),
    /Unknown fork argument/,
  );
  await assert.rejects(run(['fork', '--starter'], options), /needs a value/);
  await assert.rejects(run(['unknown'], options), /Unknown command/);
});

test('CLI npm-prefix invocation keeps plans relative to the repository', async (t) => {
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
      '--starter',
      f.args.starterId,
      '--slug',
      f.args.slug,
      '--plan',
      f.args.planPath,
    ],
    { cwd: path.join(f.root, '_tech9') },
  );
  assert.equal(JSON.parse(fork.stdout).destination, '_tech9/games/sample-game');
  await readFile(path.join(f.destination, 'tech9.json'));
  await assert.rejects(readdir(path.join(f.root, 'games')), { code: 'ENOENT' });
});

test('fork relocates historical quality attribution into provenance without inheriting a review', async (t) => {
  const f = await fixture(t);
  await f.write(
    `${scenePath}/scene.json`,
    json({
      id: 'alder-vale',
      version: '1.1.0',
      qualityEvidence: 'docs/reviews/round.json',
      qualityStatus: { score: 6.2, target: 8, passed: false },
    }),
  );
  await f.git('add', `${scenePath}/scene.json`);
  await f.git(
    '-c',
    'user.name=Tech9 test',
    '-c',
    'user.email=tech9-test@example.invalid',
    'commit',
    '--quiet',
    '-m',
    'quality fixture',
  );
  await forkStarter(f.args);
  const receipt = JSON.parse(
    await readFile(path.join(f.destination, 'tech9.json')),
  );
  const manifest = JSON.parse(
    await readFile(path.join(f.destination, 'scene.json')),
  );
  assert.equal(manifest.qualityEvidence, undefined);
  assert.equal(manifest.qualityStatus, undefined);
  assert.equal(
    receipt.source.qualityEvidence.path,
    `${scenePath}/docs/reviews/round.json`,
  );
  assert.equal(receipt.source.qualityEvidence.status.passed, false);
  assert.equal(receipt.source.commit, await f.git('rev-parse', 'HEAD'));
  assert.match(
    receipt.source.qualityEvidence.note,
    /not a review of this game/,
  );
  assert.equal(
    JSON.parse(await readFile(path.join(f.source, 'scene.json'))).qualityStatus
      .score,
    6.2,
  );
});

for (const existingIgnore of [
  undefined,
  '# Preserve starter rules\r\nart/sources/\r\n!GAME_PLAN.json',
]) {
  test(`fork protects provenance from game formatting ${existingIgnore === undefined ? 'without' : 'with'} an existing ignore file`, async (t) => {
    const f = await fixture(t);
    await f.write(`${scenePath}/.prettierrc.json`, json({ tabWidth: 4 }));
    if (existingIgnore !== undefined) {
      await f.write(`${scenePath}/.prettierignore`, existingIgnore);
    }
    await f.git('add', scenePath);
    await f.git(
      '-c',
      'user.name=Tech9 test',
      '-c',
      'user.email=tech9-test@example.invalid',
      'commit',
      '--quiet',
      '-m',
      'starter formatting rules',
    );
    await forkStarter(f.args);
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
