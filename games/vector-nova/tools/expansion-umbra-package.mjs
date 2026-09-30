import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir, stat, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const app = fileURLToPath(new URL('../', import.meta.url));
const repo = path.resolve(app, '../..');
const foundation = '66b6400617942a63a157c44c6b651bb627f47f7a';
const owned = [
  'games/vector-nova/src/levels/umbra',
  'games/vector-nova/assets/levels/umbra',
  'games/vector-nova/public/assets/levels/umbra',
  'games/vector-nova/docs/expansion/umbra',
  'games/vector-nova/tools/expansion-umbra-*',
];
const git = (...args) =>
  execFileSync('git', args, { cwd: repo, encoding: 'utf8' }).trim();
const dirty = git('status', '--porcelain', '--', ...owned);
if (dirty)
  throw new Error(`Commit the owned candidate before packaging:\n${dirty}`);
const head = git('rev-parse', 'HEAD');
const output = path.resolve(app, '.experiments/expansion/umbra/package');
await mkdir(output, { recursive: true });
const patch = execFileSync(
  'git',
  ['diff', '--binary', foundation, head, '--', ...owned],
  { cwd: repo, maxBuffer: 32 * 1024 * 1024 },
);
await writeFile(path.join(output, 'umbra-owned.patch'), patch);
const names = git('diff', '--name-only', foundation, head, '--', ...owned)
  .split('\n')
  .filter(Boolean);
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const files = [];
for (const name of names) {
  const location = path.join(repo, name);
  const bytes = await readFile(location);
  files.push({
    path: name,
    bytes: (await stat(location)).size,
    sha256: hash(bytes),
  });
}
const build = [];
for (const name of await readdir(path.join(app, 'dist/assets'))) {
  if (!/\.(js|css)$/.test(name)) continue;
  const bytes = await readFile(path.join(app, 'dist/assets', name));
  build.push({
    url: `/assets/${name}`,
    bytes: bytes.length,
    sha256: hash(bytes),
  });
}
const status = JSON.parse(
  await readFile(path.join(app, 'docs/expansion/umbra/STATUS.json'), 'utf8'),
);
const manifest = {
  slug: 'umbra',
  foundation,
  sourceCommit: head,
  sharedDependencies: status.sharedExtensions,
  productionURL: 'http://127.0.0.1:5214/?level=umbra',
  shapeURL: 'http://127.0.0.1:5214/?level=umbra&review=shape',
  humanApproved: false,
  patch: {
    path: 'umbra-owned.patch',
    bytes: patch.length,
    sha256: hash(patch),
  },
  files,
  build,
  note: 'Patch contains only Umbra-owned paths against the frozen foundation. Apply shared dependency commits once separately. dist is excluded; rebuild in destination.',
};
await writeFile(
  path.join(output, 'manifest.json'),
  JSON.stringify(manifest, null, 2) + '\n',
);
console.log(
  JSON.stringify(
    {
      output,
      sourceCommit: head,
      ownedFiles: files.length,
      patchBytes: patch.length,
      patchSha256: manifest.patch.sha256,
    },
    null,
    2,
  ),
);
