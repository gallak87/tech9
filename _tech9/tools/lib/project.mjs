import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import { constants } from 'node:fs';
import {
  access,
  chmod,
  copyFile,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  realpath,
  rename,
  rm,
  rmdir,
  writeFile,
} from 'node:fs/promises';
import {
  fail,
  safeRelative,
  SLUG,
  validateCatalog,
  validatePlan,
} from './validation.mjs';

const execute = promisify(execFile);
const EXCLUDED_NAMES = new Set([
  'node_modules',
  'dist',
  '.artifacts',
  '.git',
  '.husky',
  '.DS_Store',
]);
const GENERATED_FILES = new Set(['tech9.json', 'GAME_PLAN.json']);
const hash = (value) => createHash('sha256').update(value).digest('hex');
const json = (value) => `${JSON.stringify(value, null, 2)}\n`;

export async function readJson(file) {
  try {
    return JSON.parse(await readFile(file, 'utf8'));
  } catch (error) {
    fail(`Cannot read JSON ${file}: ${error.message}`);
  }
}

export async function confinedPath(
  root,
  relative,
  { allowMissing = false } = {},
) {
  safeRelative(relative);
  const canonicalRoot = await realpath(root);
  let cursor = canonicalRoot;
  for (const component of relative.split('/')) {
    cursor = path.join(cursor, component);
    try {
      const stat = await lstat(cursor);
      if (stat.isSymbolicLink()) fail(`Symlinks are not allowed: ${cursor}`);
    } catch (error) {
      if (allowMissing && error.code === 'ENOENT') continue;
      throw error;
    }
  }
  return cursor;
}

export async function loadCatalog(root) {
  const catalog = validateCatalog(
    await readJson(await confinedPath(root, '_tech9/catalog.json')),
  );
  for (const scene of catalog.scenes) {
    const directory = await confinedPath(root, scene.path);
    if (!(await lstat(directory)).isDirectory())
      fail(`Scene path is not a directory: ${scene.path}`);
    const manifest = await readJson(
      await confinedPath(directory, scene.manifest),
    );
    if (manifest.id !== scene.id || manifest.version !== scene.version)
      fail(`Scene manifest id/version differs from catalog: ${scene.id}`);
  }
  for (const module of catalog.modules) await confinedPath(root, module.path);
  return catalog;
}

export async function loadPlan(root, planPath, catalog) {
  const canonicalRoot = await realpath(root);
  const absolute = path.resolve(canonicalRoot, planPath);
  let relative = path
    .relative(canonicalRoot, absolute)
    .split(path.sep)
    .join('/');
  // macOS exposes /var through /private/var. Accept an absolute path expressed
  // through the caller's root alias without resolving away any inner symlink.
  if (path.isAbsolute(planPath) && relative.startsWith('../')) {
    relative = path
      .relative(path.resolve(root), path.resolve(planPath))
      .split(path.sep)
      .join('/');
  }
  return validatePlan(
    await readJson(await confinedPath(root, relative)),
    catalog,
  );
}

function excluded(relative) {
  const components = relative.split('/');
  return (
    components.some((entry) => EXCLUDED_NAMES.has(entry)) ||
    relative === 'docs/reviews' ||
    relative.startsWith('docs/reviews/') ||
    /\.blend\d+$/.test(relative)
  );
}

async function sourceFiles(directory, prefix = '') {
  const files = [];
  const entries = await readdir(path.join(directory, prefix), {
    withFileTypes: true,
  });
  entries.sort((a, b) => a.name.localeCompare(b.name, 'en'));
  for (const entry of entries) {
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (excluded(relative)) continue;
    if (entry.isSymbolicLink())
      fail(`Source symlink is not allowed: ${relative}`);
    if (entry.isDirectory())
      files.push(...(await sourceFiles(directory, relative)));
    else if (entry.isFile()) files.push(relative);
    else fail(`Source contains a non-regular file: ${relative}`);
  }
  return files;
}

async function git(root, args) {
  try {
    const result = await execute('git', ['-C', root, ...args], {
      maxBuffer: 32 * 1024 * 1024,
    });
    return result.stdout;
  } catch (error) {
    fail(
      `Git provenance check failed: ${(error.stderr || error.message).trim()}`,
    );
  }
}

async function snapshotSource(root, scene) {
  const repository = await realpath(
    (await git(root, ['rev-parse', '--show-toplevel'])).trim(),
  );
  if (repository !== (await realpath(root)))
    fail('Fork root must be the Git repository root');
  const commit = (await git(root, ['rev-parse', '--verify', 'HEAD'])).trim();
  const changes = await git(root, [
    'status',
    '--porcelain=v1',
    '--untracked-files=all',
    '--',
    scene.path,
  ]);
  if (changes.trim())
    fail(
      `Source scene must be clean and committed before forking:\n${changes.trim()}`,
    );
  const source = await confinedPath(root, scene.path);
  const files = await sourceFiles(source);
  const tracked = new Set(
    (await git(root, ['ls-files', '-z', '--', scene.path]))
      .split('\0')
      .filter(Boolean),
  );
  if (files.length === 0) fail('Source scene contains no files');
  const records = [];
  for (const file of files) {
    if (!tracked.has(`${scene.path}/${file}`))
      fail(`Source file is not committed: ${scene.path}/${file}`);
    if (GENERATED_FILES.has(file))
      fail(`Source contains reserved fork output ${file}`);
    const content = await readFile(path.join(source, file));
    records.push({ path: file, bytes: content.length, sha256: hash(content) });
  }
  return {
    source,
    commit,
    records,
    sha256: hash(
      records.map((entry) => `${entry.path}\0${entry.sha256}\n`).join(''),
    ),
  };
}

function portNumber(value) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < 1024 || number > 65534)
    fail('Port must be an integer from 1024 to 65534');
  return number;
}

async function absent(destination) {
  try {
    await lstat(destination);
    fail(`Destination already exists; never overwriting: ${destination}`);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
}

export async function forkStarter({
  root,
  starterId,
  slug,
  planPath,
  port = 4410,
  dryRun = false,
}) {
  if (typeof slug !== 'string' || !SLUG.test(slug) || slug.length > 64)
    fail(
      'Game slug must be lowercase letters, digits and single hyphens, begin with a letter, and be at most 64 characters',
    );
  const devPort = portNumber(port);
  const catalog = await loadCatalog(root);
  const plan = await loadPlan(root, planPath, catalog);
  if (plan.status !== 'approved')
    fail('Fork requires an approved execution plan');
  if (plan.starter.id !== starterId)
    fail('Requested starter must match the execution plan');
  if (plan.id !== slug) fail('Game slug must match the execution plan id');
  const starter = catalog.starters.find((entry) => entry.id === starterId);
  const scene = catalog.scenes.find((entry) => entry.id === starter.scene);
  const destination = await confinedPath(root, `games/${slug}`, {
    allowMissing: true,
  });
  await absent(destination);
  const snapshot = await snapshotSource(root, scene);
  const sourcePackage = await readJson(
    path.join(snapshot.source, 'package.json'),
  );
  const sourceManifest = await readJson(
    await confinedPath(snapshot.source, scene.manifest),
  );
  let qualityEvidence;
  if (sourceManifest.qualityEvidence) {
    await confinedPath(snapshot.source, sourceManifest.qualityEvidence);
    qualityEvidence = {
      path: `${scene.path}/${sourceManifest.qualityEvidence}`,
      ...(sourceManifest.qualityStatus
        ? { status: sourceManifest.qualityStatus }
        : {}),
      note: 'Historical source review at source.commit; not a review of this game. Review files are not copied.',
    };
  }
  if (!sourcePackage.scripts?.dev || !sourcePackage.scripts?.build)
    fail('Starter scene must have dev and build package scripts');
  const result = {
    status: dryRun ? 'dry-run' : 'scaffolded',
    destination: `games/${slug}`,
    starter: { id: starter.id, version: starter.version },
    scene: { id: scene.id, version: scene.version },
    sourceCommit: snapshot.commit,
    sourceSha256: snapshot.sha256,
    files: snapshot.records.length,
    ports: { dev: devPort, preview: devPort + 1 },
    next: [`cd games/${slug}`, 'npm ci', 'npm run dev'],
  };
  if (dryRun) return result;
  const games = await confinedPath(root, 'games', { allowMissing: true });
  await mkdir(games, { recursive: true });
  const temporary = await mkdtemp(path.join(games, `.${slug}.tech9-`));
  let reserved = false;
  try {
    for (const file of snapshot.records) {
      const source = await confinedPath(snapshot.source, file.path);
      const target = path.join(temporary, file.path);
      await mkdir(path.dirname(target), { recursive: true });
      await copyFile(source, target, constants.COPYFILE_EXCL);
      await chmod(target, (await lstat(source)).mode & 0o777);
      if (hash(await readFile(target)) !== file.sha256)
        fail(`Source changed while copying: ${file.path}`);
    }
    const packageFile = path.join(temporary, 'package.json');
    const packageJson = await readJson(packageFile);
    packageJson.name = slug;
    packageJson.scripts.dev = `vite --host 127.0.0.1 --port ${devPort}`;
    packageJson.scripts.preview = `vite preview --host 127.0.0.1 --port ${devPort + 1}`;
    packageJson.config = {
      ...packageJson.config,
      devPort,
      previewPort: devPort + 1,
    };
    delete packageJson.scripts.prepare;
    await writeFile(packageFile, json(packageJson));
    // A fork has not been reviewed. Preserve historical ratings only as source
    // provenance rather than a dangling local review link or a game rating.
    if (sourceManifest.qualityEvidence || sourceManifest.qualityStatus) {
      delete sourceManifest.qualityEvidence;
      delete sourceManifest.qualityStatus;
      await writeFile(
        path.join(temporary, scene.manifest),
        json(sourceManifest),
      );
    }
    const lockFile = path.join(temporary, 'package-lock.json');
    try {
      await access(lockFile);
      const lock = await readJson(lockFile);
      lock.name = slug;
      if (lock.packages?.['']) lock.packages[''].name = slug;
      await writeFile(lockFile, json(lock));
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
    // These artifacts record exact provenance bytes. Normal game formatting
    // must not rewrite the hashed plan or the receipt that describes it.
    const prettierIgnoreFile = path.join(temporary, '.prettierignore');
    let prettierIgnore = '';
    try {
      prettierIgnore = await readFile(prettierIgnoreFile, 'utf8');
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
    await writeFile(
      prettierIgnoreFile,
      `${prettierIgnore}${prettierIgnore && !prettierIgnore.endsWith('\n') ? '\n' : ''}# Immutable fork provenance.\ntech9.json\nGAME_PLAN.json\n`,
    );
    const receipt = {
      schemaVersion: 1,
      id: slug,
      status: 'scaffolded',
      createdAt: new Date().toISOString(),
      starter: result.starter,
      scene: result.scene,
      source: {
        path: scene.path,
        commit: snapshot.commit,
        snapshotSha256: snapshot.sha256,
        files: snapshot.records,
        ...(qualityEvidence ? { qualityEvidence } : {}),
      },
      plan: { path: 'GAME_PLAN.json', sha256: hash(json(plan)) },
      ports: result.ports,
      note: 'A standalone source fork. Gameplay, validation and critic gates in GAME_PLAN.json still need execution. No live dependency on the starter.',
    };
    await writeFile(path.join(temporary, 'GAME_PLAN.json'), json(plan), {
      flag: 'wx',
    });
    await writeFile(path.join(temporary, 'tech9.json'), json(receipt), {
      flag: 'wx',
    });
    // Detect edits made while the snapshot was copied, before publishing the fork.
    const after = await snapshotSource(root, scene);
    if (after.sha256 !== snapshot.sha256 || after.commit !== snapshot.commit)
      fail(
        'Source changed while forking; retry from a stable committed checkpoint',
      );
    // Exclusive mkdir protects against concurrent fork attempts and user-created
    // directories. The reservation is ours, so rename never replaces user data.
    await mkdir(destination);
    reserved = true;
    await rename(temporary, destination);
    reserved = false;
    return result;
  } catch (error) {
    if (reserved) {
      // Only remove an empty directory we reserved, never another writer's files.
      await rmdir(destination).catch(() => {});
    }
    throw error;
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
}
