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
  validateModules,
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
const GAMES_DIRECTORY = 'games';
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

export async function loadModules(root) {
  const registry = validateModules(
    await readJson(await confinedPath(root, 'modules.json')),
  );
  for (const module of registry.modules) {
    const directory = await confinedPath(root, `modules/${module.id}`);
    if (!(await lstat(directory)).isDirectory())
      fail(`Module path is not a directory: ${module.id}`);
  }
  return registry;
}

export async function loadBaseline(root) {
  const packageJson = await readJson(
    await confinedPath(root, 'baseline/package.json'),
  );
  if (!packageJson.scripts?.dev || !packageJson.scripts?.build)
    fail('Baseline must have dev and build package scripts');
  return packageJson;
}

export async function loadPlan(root, planPath, baselineVersion) {
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
    baselineVersion,
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

async function snapshotSource(root) {
  const repository = await realpath(
    (await git(root, ['rev-parse', '--show-toplevel'])).trim(),
  );
  const source = await confinedPath(root, 'baseline');
  const sourcePath = path
    .relative(repository, source)
    .split(path.sep)
    .join('/');
  const commit = (
    await git(repository, ['rev-parse', '--verify', 'HEAD'])
  ).trim();
  const changes = await git(repository, [
    'status',
    '--porcelain=v1',
    '--untracked-files=all',
    '--',
    sourcePath,
  ]);
  if (changes.trim())
    fail(
      `Baseline must be clean and committed before forking:\n${changes.trim()}`,
    );
  const files = await sourceFiles(source);
  const tracked = new Set(
    (await git(repository, ['ls-files', '-z', '--', sourcePath]))
      .split('\0')
      .filter(Boolean),
  );
  if (files.length === 0) fail('Baseline contains no files');
  const records = [];
  for (const file of files) {
    if (!tracked.has(`${sourcePath}/${file}`))
      fail(`Source file is not committed: ${sourcePath}/${file}`);
    if (GENERATED_FILES.has(file))
      fail(`Source contains reserved fork output ${file}`);
    const content = await readFile(path.join(source, file));
    records.push({ path: file, bytes: content.length, sha256: hash(content) });
  }
  return {
    source,
    path: sourcePath,
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

export async function forkBaseline({
  root,
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
  const sourcePackage = await loadBaseline(root);
  const plan = await loadPlan(root, planPath, sourcePackage.version);
  if (plan.status !== 'approved')
    fail('Fork requires an approved execution plan');
  if (plan.id !== slug) fail('Game slug must match the execution plan id');
  const destinationPath = `${GAMES_DIRECTORY}/${slug}`;
  const destination = await confinedPath(root, destinationPath, {
    allowMissing: true,
  });
  await absent(destination);
  const snapshot = await snapshotSource(root);
  const result = {
    status: dryRun ? 'dry-run' : 'scaffolded',
    destination: destinationPath,
    baselineVersion: sourcePackage.version,
    sourceCommit: snapshot.commit,
    sourceSha256: snapshot.sha256,
    files: snapshot.records.length,
    ports: { dev: devPort, preview: devPort + 1 },
    next: [`cd ${destinationPath}`, 'npm ci', 'npm run dev'],
  };
  if (dryRun) return result;
  const games = await confinedPath(root, GAMES_DIRECTORY, {
    allowMissing: true,
  });
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
    packageJson.scripts.dev = `vite --host 127.0.0.1 --strictPort --port ${devPort}`;
    packageJson.scripts.preview = `vite preview --host 127.0.0.1 --strictPort --port ${devPort + 1}`;
    packageJson.config = {
      ...packageJson.config,
      devPort,
      previewPort: devPort + 1,
    };
    delete packageJson.scripts.prepare;
    await writeFile(packageFile, json(packageJson));
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
      schemaVersion: 2,
      id: slug,
      status: 'scaffolded',
      createdAt: new Date().toISOString(),
      source: {
        path: snapshot.path,
        version: sourcePackage.version,
        commit: snapshot.commit,
        snapshotSha256: snapshot.sha256,
        files: snapshot.records,
      },
      plan: { path: 'GAME_PLAN.json', sha256: hash(json(plan)) },
      ports: result.ports,
    };
    await writeFile(path.join(temporary, 'GAME_PLAN.json'), json(plan), {
      flag: 'wx',
    });
    await writeFile(path.join(temporary, 'tech9.json'), json(receipt), {
      flag: 'wx',
    });
    // Detect edits made while the snapshot was copied, before publishing the fork.
    const after = await snapshotSource(root);
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
