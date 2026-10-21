import { listPackage, extractFile, statFile } from '@electron/asar';
import { getCurrentFuseWire, FuseV1Options } from '@electron/fuses';
import { resolve, join } from 'node:path';
import assert from 'node:assert/strict';
import {
  editionPolicy,
  includePublic,
  forbiddenRendererText,
} from './policy.mjs';
export async function auditPackage(directory, edition, platform) {
  const policy = editionPolicy(edition);
  const app = join(directory, `${policy.name}.app`);
  const archive =
    platform === 'darwin'
      ? join(app, 'Contents/Resources/app.asar')
      : join(directory, 'resources/app.asar');
  const binary =
    platform === 'darwin' ? app : join(directory, `${policy.executable}.exe`);
  const inventory = listPackage(archive).map((path) =>
    path.replaceAll('\\', '/').replace(/^\//, ''),
  );
  const manifest = JSON.parse(
    extractFile(archive, 'release-manifest.json').toString(),
  );
  assert.equal(manifest.edition, edition);
  assert.deepEqual(manifest.levels, policy.levels);
  assert.deepEqual(manifest.ships, policy.ships);
  assert.equal(manifest.devTools, false);
  const expectedFiles = new Set([
    ...manifest.files.map(({ path }) => path),
    'release-manifest.json',
  ]);
  for (const path of inventory) {
    if (!statFile(archive, path).files)
      assert(expectedFiles.has(path), `Unexpected packaged file: ${path}`);
    assert(
      !/(^|\/)(?:node_modules|tools|src|\.git)(\/|$)|\.map$|steam_appid\.txt$/.test(
        path,
      ),
      `Development file shipped: ${path}`,
    );
    if (
      path.startsWith('dist/assets/levels/') ||
      path.startsWith('dist/assets/ships/') ||
      path.startsWith('dist/assets/menu/')
    )
      assert(
        includePublic(path.slice(5), edition) ||
          !/\.[^/]+$/.test(path.split('/').at(-1)),
        `Excluded public asset: ${path}`,
      );
    if (path.startsWith('dist/') && path.endsWith('.js')) {
      const text = extractFile(archive, path).toString();
      for (const marker of forbiddenRendererText)
        assert(!text.includes(marker), `Developer marker: ${marker}`);
    }
  }
  for (const { path, sha256 } of manifest.files) {
    const { createHash } = await import('node:crypto');
    assert.equal(
      createHash('sha256').update(extractFile(archive, path)).digest('hex'),
      sha256,
      `Archive differs from build: ${path}`,
    );
  }
  const wire = await getCurrentFuseWire(binary);
  for (const key of [
    FuseV1Options.RunAsNode,
    FuseV1Options.EnableNodeOptionsEnvironmentVariable,
    FuseV1Options.EnableNodeCliInspectArguments,
    FuseV1Options.GrantFileProtocolExtraPrivileges,
  ])
    assert.equal(wire[key], 48, `Fuse ${key} must be disabled`);
  for (const key of [
    FuseV1Options.EnableEmbeddedAsarIntegrityValidation,
    FuseV1Options.OnlyLoadAppFromAsar,
  ])
    assert.equal(wire[key], 49, `Fuse ${key} must be enabled`);
  console.log(
    `Verified packaged content, SHA-256 inventory and Electron fuses: ${edition} ${platform}`,
  );
}
if (process.argv[1] && resolve(process.argv[1]) === import.meta.filename)
  await auditPackage(
    resolve(process.argv[2]),
    process.argv[3],
    process.argv[4],
  );
