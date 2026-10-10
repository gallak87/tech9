import assert from 'node:assert/strict';
import { readFile, readdir, stat } from 'node:fs/promises';
import { resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const manifest = JSON.parse(
  await readFile(resolve(root, 'docs/ASSET_MANIFEST.json'), 'utf8'),
);
const listed = new Set(
  manifest.assets
    .flatMap((asset) => [
      asset.runtimeAsset,
      ...(asset.runtimeAssets ?? []),
      ...(asset.runtimeMaps ?? []),
    ])
    .filter((path) => typeof path === 'string'),
);
// Menu assets declare a bounded wildcard; resolve it through their existing
// fingerprint manifest so stale/unlisted files are still rejected below.
if (manifest.assets.some((asset) => asset.id === 'circuit-menu-previews')) {
  const previews = JSON.parse(
    await readFile(resolve(root, 'public/assets/menu/previews.json'), 'utf8'),
  );
  listed.add('public/assets/menu/previews.json');
  for (const id of Object.keys(previews))
    listed.add(`public/assets/menu/${id}.webp`);
}
assert.equal(
  new Set(manifest.assets.map((asset) => asset.id)).size,
  manifest.assets.length,
  'unique asset identities',
);
async function files(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map((entry) =>
      entry.isDirectory()
        ? files(resolve(directory, entry.name))
        : [resolve(directory, entry.name)],
    ),
  );
  return nested.flat();
}
const runtime = await files(resolve(root, 'public/assets'));
let bytes = 0;
for (const file of runtime) {
  const path = relative(root, file);
  assert.match(
    path,
    /^public\/assets\/(levels\/[a-z][a-z0-9-]*\/|ships\/(?:rivals\/)?[a-z][a-z0-9-]*\/|menu\/)/,
    `canonical ownership: ${path}`,
  );
  assert.ok(listed.has(path), `unindexed or obsolete runtime export: ${path}`);
  const data = await readFile(file);
  bytes += data.byteLength;
  if (path.endsWith('.glb')) {
    assert.equal(data.readUInt32LE(0), 0x46546c67, `${path}: GLB header`);
    assert.equal(data.readUInt32LE(8), data.length, `${path}: complete GLB`);
    const json = JSON.parse(
      data.subarray(20, 20 + data.readUInt32LE(12)).toString('utf8'),
    );
    assert.ok(
      (json.images ?? []).every(
        (image) => image.bufferView !== undefined && !image.uri,
      ),
      `${path}: embedded textures`,
    );
    assert.ok(
      json.buffers.every((buffer) => !buffer.uri),
      `${path}: embedded geometry`,
    );
  }
}
for (const path of listed)
  assert.ok(
    (await stat(resolve(root, path))).isFile(),
    `missing indexed export: ${path}`,
  );
for (const asset of manifest.assets) {
  for (const path of [
    asset.provenanceRecord,
    asset.promptRecord,
    asset.skyProvenance,
    ...(asset.provenanceRecords ?? []),
  ].filter(Boolean))
    assert.ok(
      (await stat(resolve(root, path))).isFile(),
      `missing provenance: ${path}`,
    );
}
console.log(
  `${runtime.length} canonical runtime assets, ${(bytes / 1048576).toFixed(2)} MiB; index, provenance and embedded GLB dependencies passed.`,
);
