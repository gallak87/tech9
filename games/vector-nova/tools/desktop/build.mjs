import { build } from 'vite';
import { KTX2Loader } from 'three/addons/loaders/KTX2Loader.js';
import { cp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { resolve, dirname, relative } from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { menuCatalog } from '../menu-catalog.mjs';
import { copyWorldkitNotices } from './notices.mjs';
import {
  editionPolicy,
  includePublic,
  forbiddenModules,
  forbiddenRendererText,
} from './policy.mjs';

export const root = resolve(import.meta.dirname, '../..');
export async function files(dir) {
  const found = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (entry.isSymbolicLink())
      throw new Error(`Unexpected symlink: ${entry.name}`);
    const path = resolve(dir, entry.name);
    if (entry.isDirectory()) found.push(...(await files(path)));
    else found.push(path);
  }
  return found;
}
export async function buildDesktop(edition) {
  const policy = editionPolicy(edition);
  const stage = resolve(root, '.desktop', edition);
  await rm(stage, { recursive: true, force: true });
  await mkdir(stage, { recursive: true });
  const moduleIds = new Set();
  const levelCatalog = '\0desktop-level-catalog';
  await build({
    configFile: false,
    resolve: { dedupe: ['three'] },
    root,
    base: './',
    publicDir: false,
    define: {
      'import.meta.env.VN_DESKTOP': 'true',
      'import.meta.env.VN_EDITION': JSON.stringify(edition),
    },
    build: {
      outDir: resolve(stage, 'dist'),
      sourcemap: false,
      emptyOutDir: true,
    },
    plugins: [
      {
        name: 'desktop-content-boundary',
        enforce: 'pre',
        resolveId(id, importer) {
          if (id === 'virtual:menu-catalog') return '\0virtual:menu-catalog';
          if (
            importer &&
            id.startsWith('.') &&
            resolve(dirname(importer), id) ===
              resolve(root, 'src/levels/catalog.js')
          )
            return levelCatalog;
        },
        transform(code, id) {
          if (
            !id
              .replaceAll('\\', '/')
              .endsWith('/three/examples/jsm/loaders/KTX2Loader.js')
          )
            return;
          const original =
            'this.workerSourceURL = URL.createObjectURL( new Blob( [ body ] ) );';
          if (!code.includes(original))
            throw new Error(
              'Three KTX2 worker contract changed; review the desktop decoder integration',
            );
          return {
            code: code.replace(
              original,
              "this.workerSourceURL = new URL('assets/decoder-worker.js', document.baseURI).href;",
            ),
            map: null,
          };
        },
        async buildStart() {
          const basis = await readFile(
            resolve(root, 'public/assets/ships/decoder/basis_transcoder.js'),
            'utf8',
          );
          const worker = KTX2Loader.BasisWorker.toString();
          const source = [
            ...[
              'EngineFormat',
              'EngineType',
              'TranscoderFormat',
              'BasisFormat',
            ].map(
              (name) => `let _${name} = ${JSON.stringify(KTX2Loader[name])};`,
            ),
            basis,
            worker.slice(worker.indexOf('{') + 1, worker.lastIndexOf('}')),
          ].join('\n');
          this.emitFile({
            type: 'asset',
            fileName: 'assets/decoder-worker.js',
            source,
          });
        },
        async load(id) {
          if (id === '\0virtual:menu-catalog')
            return `export default ${JSON.stringify(await menuCatalog({ levelIds: policy.levels }))}`;
          if (
            id === levelCatalog ||
            id === resolve(root, 'src/levels/catalog.js')
          ) {
            const module = (path) => JSON.stringify(resolve(root, path));
            return (
              `import { createCatalog } from ${module('src/levels/contract.js')};\n` +
              policy.levels
                .map(
                  (id, i) =>
                    `import m${i} from ${module(`src/levels/${id}/metadata.js`)};`,
                )
                .join('\n') +
              `\nexport function discoverLevels() { return createCatalog({${policy.levels.map((id, i) => `${JSON.stringify(`./${id}/metadata.js`)}:m${i}`).join(',')}}, {${policy.levels.map((id) => `${JSON.stringify(`./${id}/index.js`)}:()=>import(${module(`src/levels/${id}/index.js`)})`).join(',')}}); }`
            );
          }
        },
        generateBundle(_options, bundle) {
          for (const chunk of Object.values(bundle)) {
            if (chunk.type !== 'chunk') continue;
            for (const [id, info] of Object.entries(chunk.modules)) {
              if (!info.renderedLength) continue;
              moduleIds.add(relative(root, id).replaceAll('\\', '/'));
              if (forbiddenModules.test(id.replaceAll('\\', '/')))
                throw new Error(`Developer module shipped: ${id}`);
              const level = id.match(/\/src\/levels\/([^/]+)\/index\.js$/)?.[1];
              if (level && !policy.levels.includes(level))
                throw new Error(`Excluded world shipped: ${level}`);
            }
            for (const marker of forbiddenRendererText)
              if (chunk.code.includes(marker))
                throw new Error(
                  `Developer API shipped: ${marker} in ${chunk.fileName}`,
                );
          }
        },
      },
    ],
  });
  for (const file of await files(resolve(root, 'public'))) {
    const path = relative(resolve(root, 'public'), file).replaceAll('\\', '/');
    if (!includePublic(path, edition)) continue;
    const target = resolve(stage, 'dist', path);
    await mkdir(dirname(target), { recursive: true });
    await cp(file, target);
  }
  for (const file of ['main.cjs', 'preload.cjs', 'security.cjs'])
    await cp(resolve(root, 'desktop', file), resolve(stage, file));
  const sourcePackage = JSON.parse(
    await readFile(resolve(root, 'package.json')),
  );
  await writeFile(
    resolve(stage, 'package.json'),
    JSON.stringify(
      {
        name: `vector-nova-${edition}`,
        productName: policy.name,
        version: sourcePackage.version,
        description: 'An offline single-player anti-gravity racer',
        author: 'VECTOR//NOVA contributors',
        main: 'main.cjs',
        edition,
      },
      null,
      2,
    ) + '\n',
  );
  const notices = resolve(stage, 'notices');
  await mkdir(notices, { recursive: true });
  await cp(resolve(root, 'docs/licenses'), notices, { recursive: true });
  const worldkitNotices = await copyWorldkitNotices(notices, policy);
  for (const [name, license] of [
    ['three', 'LICENSE'],
    ['@dimforge/rapier3d-compat', 'LICENSE'],
    ['electron', 'LICENSE'],
  ])
    await cp(
      resolve(root, 'node_modules', name, license),
      resolve(notices, name.replaceAll('/', '-') + '-LICENSE.txt'),
    );
  await cp(
    resolve(root, 'docs/ASSET_MANIFEST.json'),
    resolve(notices, 'ASSET_MANIFEST.json'),
  );
  await writeFile(
    resolve(notices, 'README.txt'),
    'VECTOR//NOVA includes project-authored and generated art/music, and CC0 materials listed in ASSET_MANIFEST.json. The manifest describes the source project; only the edition assets listed in release-manifest.json are distributed. Electron/Chromium notices also accompany the platform executable.\n' +
      (worldkitNotices.length
        ? 'Worldkit package notices and original forest asset/source metadata are preserved under worldkit/. Runtime images and models are listed in release-manifest.json.\n'
        : ''),
  );
  const inventory = [];
  for (const file of await files(stage)) {
    const bytes = await readFile(file);
    inventory.push({
      path: relative(stage, file).replaceAll('\\', '/'),
      bytes: bytes.length,
      sha256: createHash('sha256').update(bytes).digest('hex'),
    });
  }
  const manifest = {
    schema: 1,
    sourceRevision: execFileSync('git', ['rev-parse', 'HEAD'], {
      cwd: root,
      encoding: 'utf8',
    }).trim(),
    sourceDirty: !!execFileSync('git', ['status', '--porcelain'], {
      cwd: root,
      encoding: 'utf8',
    }).trim(),
    ...policy,
    version: sourcePackage.version,
    electron: sourcePackage.devDependencies.electron,
    devTools: false,
    modules: [...moduleIds].sort(),
    files: inventory.sort((a, b) => a.path.localeCompare(b.path)),
  };
  await writeFile(
    resolve(stage, 'release-manifest.json'),
    JSON.stringify(manifest, null, 2) + '\n',
  );
  console.log(`Built ${policy.name}: ${stage} (${inventory.length} files)`);
  return { stage, policy, manifest };
}
if (process.argv[1] && resolve(process.argv[1]) === import.meta.filename)
  await buildDesktop(process.argv[2]);
