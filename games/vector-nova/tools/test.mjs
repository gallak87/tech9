import { readdir } from 'node:fs/promises';
import { resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { FAST_TESTS } from './fast-tests.mjs';

const projectRoot = resolve(import.meta.dirname, '..');
export async function discoverTests(root = projectRoot) {
  async function walk(directory, suffix) {
    const files = [];
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = resolve(directory, entry.name);
      if (entry.isDirectory()) files.push(...(await walk(path, suffix)));
      else if (entry.isFile() && entry.name.endsWith(suffix))
        files.push(relative(root, path).replaceAll('\\', '/'));
    }
    return files;
  }
  return (
    await Promise.all([
      walk(resolve(root, 'src'), '.test.js'),
      walk(resolve(root, 'tools'), '.test.mjs'),
    ])
  )
    .flat()
    .sort();
}

export function selectTests(files, tier = 'all', fastFiles = FAST_TESTS) {
  if (!['all', 'fast', 'integration'].includes(tier))
    throw new Error(
      'Usage: node tools/test.mjs [all|fast|integration] [--list]',
    );
  const known = new Set(files),
    fast = new Set(fastFiles);
  if (fast.size !== fastFiles.length)
    throw new Error('Fast test allowlist contains duplicate entries.');
  for (const file of fast)
    if (!known.has(file)) throw new Error(`Fast test file is missing: ${file}`);
  return ['fast', 'integration']
    .filter((name) => tier === 'all' || tier === name)
    .map((name) => ({
      name,
      files: files.filter((file) => fast.has(file) === (name === 'fast')),
    }));
}

function runGroup(files, { cwd, concurrency }) {
  return new Promise((done, reject) => {
    const child = spawn(
      process.execPath,
      ['--test', `--test-concurrency=${concurrency}`, ...files],
      { cwd, stdio: 'inherit' },
    );
    child.once('error', reject);
    child.once('exit', (code) => done(code ?? 1));
  });
}

export async function main(
  args = process.argv.slice(2),
  {
    root = projectRoot,
    env = process.env,
    write = console.log,
    run = runGroup,
  } = {},
) {
  const positional = args.filter((arg) => arg !== '--list');
  if (
    positional.length > 1 ||
    args.filter((arg) => arg === '--list').length > 1
  )
    throw new Error(
      'Usage: node tools/test.mjs [all|fast|integration] [--list]',
    );
  const groups = selectTests(await discoverTests(root), positional[0] ?? 'all');
  const concurrency = Number(env.VN_TEST_CONCURRENCY ?? 1);
  if (!Number.isSafeInteger(concurrency) || concurrency < 1)
    throw new Error('VN_TEST_CONCURRENCY must be a positive safe integer.');
  let status = 0;
  for (const group of groups) {
    const limit = group.name === 'fast' ? 2 : concurrency;
    write(`${group.name}: ${group.files.length} files (concurrency ${limit})`);
    if (args.includes('--list')) group.files.forEach((file) => write(file));
    else if (group.files.length) {
      const code = await run(group.files, { cwd: root, concurrency: limit });
      status ||= code;
    }
  }
  return status;
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    process.exitCode = await main();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
