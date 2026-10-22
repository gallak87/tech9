import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import {
  mkdtemp,
  mkdir,
  readFile,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';
import { LANDSCAPE_ASSETS, FOREST_MATERIAL_ASSETS } from '../src/forest.js';
import {
  livingForestBarkURL,
  livingForestLeafURL,
} from '../src/living-forest.js';

const root = fileURLToPath(new URL('..', import.meta.url));
const scratch = await mkdtemp(path.join(tmpdir(), 'worldkit-package-'));
try {
  const packed = JSON.parse(
    execFileSync(
      'npm',
      [
        'pack',
        '--json',
        '--ignore-scripts',
        '--pack-destination',
        scratch,
        '--cache',
        path.join(scratch, 'cache'),
      ],
      { cwd: root, encoding: 'utf8' },
    ),
  )[0];
  const paths = new Set(packed.files.map((file) => file.path));
  assert.ok(
    ![...paths].some((name) =>
      /^(games|baselines|scaffolds|tools|schemas)\//.test(name),
    ),
    'Legacy applications and orchestration do not ship',
  );
  const manifest = JSON.parse(
    await readFile(path.join(root, 'package.json'), 'utf8'),
  );
  for (const entry of Object.values(manifest.exports))
    assert.ok(paths.has(entry.slice(2)), entry);
  const urls = [
    livingForestBarkURL,
    livingForestLeafURL,
    ...Object.values(LANDSCAPE_ASSETS),
    ...Object.values(FOREST_MATERIAL_ASSETS),
  ];
  for (const url of urls)
    assert.ok(paths.has(path.relative(root, fileURLToPath(url))), url);
  for (const notice of [
    'NOTICE.md',
    'modules/landscape/assets/runtime/ASSETS.md',
    'modules/landscape/assets/runtime/textures/SOURCES.md',
    'modules/landscape/assets/art/asset-report.json',
    'modules/landscape/assets/art/sources/manifest.json',
    'modules/pond-water/THREE-LICENSE.txt',
    'modules/pond-water/assets/LICENSE.md',
    'modules/weather/NOTICE.md',
    'modules/living-forest/assets/provenance.json',
  ])
    assert.ok(paths.has(notice), notice);

  const consumer = path.join(scratch, 'consumer');
  const installed = path.join(consumer, 'node_modules/@worldkit/environment');
  await mkdir(installed, { recursive: true });
  execFileSync('tar', [
    '-xzf',
    path.join(scratch, packed.filename),
    '--strip-components=1',
    '-C',
    installed,
  ]);
  const threeRoot = path.dirname(fileURLToPath(import.meta.resolve('three')));
  await symlink(
    path.dirname(threeRoot),
    path.join(consumer, 'node_modules/three'),
    'dir',
  );
  await writeFile(
    path.join(consumer, 'package.json'),
    JSON.stringify({ type: 'module', private: true }),
  );
  await writeFile(
    path.join(consumer, 'index.html'),
    '<!doctype html><script type="module" src="/main.js"></script>',
  );
  await writeFile(
    path.join(consumer, 'main.js'),
    `
    import * as worldkit from '@worldkit/environment';
    import * as forest from '@worldkit/environment/forest';
    import * as landscape from '@worldkit/environment/landscape';
    import * as ocean from '@worldkit/environment/ocean';
    import * as water from '@worldkit/environment/water';
    import * as weather from '@worldkit/environment/weather';
    window.worldkitConsumer = { worldkit, forest, landscape, ocean, water, weather };
  `,
  );
  const result = await build({
    root: consumer,
    configFile: false,
    logLevel: 'error',
    base: '/worldkit-consumer/',
    resolve: { dedupe: ['three'] },
    build: { write: false, assetsInlineLimit: 0 },
  });
  const outputs = (Array.isArray(result) ? result : [result]).flatMap(
    (item) => item.output,
  );
  const assets = outputs.filter((output) => output.type === 'asset');
  const javascript = outputs
    .filter((output) => output.type === 'chunk')
    .map((output) => output.code)
    .join('\n');
  assert.ok(
    assets.some((asset) => asset.fileName.endsWith('.glb')),
    'Packed GLB emitted by Vite',
  );
  assert.ok(
    assets.filter((asset) => /\.(jpg|png)$/.test(asset.fileName)).length >= 14,
    'Canonical textures emitted',
  );
  assert.ok(
    javascript.includes('/worldkit-consumer/assets/'),
    'Non-root deploy base applied',
  );
  assert.ok(
    !javascript.includes('file:///'),
    'No filesystem URL in browser bundle',
  );
  assert.ok(
    !javascript.includes('../modules/landscape/assets/'),
    'No unresolved source asset URL',
  );
  // A selective consumer must not ship floor, path, rock or pine textures merely
  // because forest helpers and canonical bark URLs share a public entry point.
  await writeFile(
    path.join(consumer, 'main.js'),
    `
    import { BARK_MATERIAL_ASSETS, loadForestKit, prepareForestParts, disposeForestKit } from '@worldkit/environment/forest/kit';
    window.worldkitForestConsumer = { BARK_MATERIAL_ASSETS, loadForestKit, prepareForestParts, disposeForestKit };
  `,
  );
  const narrow = await build({
    root: consumer,
    configFile: false,
    logLevel: 'error',
    base: '/worldkit-consumer/',
    resolve: { dedupe: ['three'] },
    build: { write: false, assetsInlineLimit: 0 },
  });
  const narrowOutputs = (Array.isArray(narrow) ? narrow : [narrow]).flatMap(
    (item) => item.output,
  );
  const narrowArt = narrowOutputs.filter(
    (item) => item.type === 'asset' && /\.(jpg|png|glb)$/.test(item.fileName),
  );
  assert.equal(
    narrowArt.length,
    4,
    `Bark/kit consumer emitted unnecessary assets: ${narrowArt.map((item) => item.fileName).join(', ')}`,
  );
  assert.ok(
    narrowArt.every((item) => /bark_brown_02_|forest-kit-/.test(item.fileName)),
  );
  await writeFile(
    path.join(consumer, 'main.js'),
    `
    import {livingForestBarkURL, livingForestLeafURL, createLivingForestKit, createLivingHollow} from '@worldkit/environment/living-forest';
    window.livingForestConsumer = {livingForestBarkURL, livingForestLeafURL, createLivingForestKit, createLivingHollow};
  `,
  );
  const living = await build({
    root: consumer,
    configFile: false,
    logLevel: 'error',
    base: '/worldkit-consumer/',
    resolve: { dedupe: ['three'] },
    build: { write: false, assetsInlineLimit: 0 },
  });
  const livingOutputs = (Array.isArray(living) ? living : [living]).flatMap(
    (item) => item.output,
  );
  const livingArt = livingOutputs.filter(
    (item) => item.type === 'asset' && /\.(jpg|png|glb)$/.test(item.fileName),
  );
  assert.equal(
    livingArt.length,
    2,
    'Living Forest must not emit legacy forest assets',
  );
  assert.ok(
    livingArt.some((item) =>
      /silver-bark-color-v1-.*\.png$/.test(item.fileName),
    ),
  );
  assert.ok(
    livingArt.some((item) => /leaf-spray-v1-.*\.png$/.test(item.fileName)),
  );
  assert.ok(
    livingOutputs.some(
      (item) =>
        item.type === 'chunk' &&
        item.code.includes('/worldkit-consumer/assets/silver-bark-color-v1-'),
    ),
  );
  console.log(
    `Worldkit packed-consumer build passed: ${paths.size} package files, ${assets.length} emitted assets; all exports resolved.`,
  );
} finally {
  await rm(scratch, { recursive: true, force: true });
}
