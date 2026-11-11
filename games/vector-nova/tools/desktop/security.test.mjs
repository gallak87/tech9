import test from 'node:test';
import assert from 'node:assert/strict';
import { resolve, sep } from 'node:path';
import { createRequire } from 'node:module';
import { editionPolicy, includePublic, forbiddenModules } from './policy.mjs';
import { menuIntent } from '../../src/input/menu-gamepad.js';
const { resourcePath, forbiddenArguments, trustedSender, CSP } = createRequire(
  import.meta.url,
)('../../desktop/security.cjs');

test('demo contains two worlds and one player ship; shared materials do not ship their worlds', () => {
  assert.deepEqual(editionPolicy('demo').levels, ['halcyon', 'nacre']);
  assert.deepEqual(editionPolicy('demo').ships, ['kestrel']);
  for (const path of [
    'assets/levels/halcyon/halcyon-clouds-v1.png',
    'assets/ships/kestrel/kestrel.glb',
    'assets/menu/ships/kestrel.jpg',
    'assets/ships/rivals/rook/rook.glb',
    'assets/ships/decoder/basis_transcoder.wasm',
    'assets/levels/helion/ceramic/normal.ktx2',
    'assets/levels/nightweir/fired-brick-v1.png',
  ])
    assert(includePublic(path, 'demo'), path);
  for (const path of [
    'assets/ships/needle/needle.glb',
    'assets/menu/ships/needle.jpg',
    'assets/levels/helion/thermal-observatory.glb',
    'assets/levels/nightweir/nightweir-city.glb.gz',
    'assets/menu/orbital.webp',
    'assets/menu/previews.json',
    'assets/levels/halcyon/source.blend',
  ])
    assert(!includePublic(path, 'demo'), path);
  assert.throws(() => editionPolicy('unlocked'));
});
test('full packages every original and bonus course without exposing bonus content in the demo', () => {
  assert.equal(editionPolicy('full').levels.length, 26);
  for (const id of ['ravel', 'nomad', 'oriel']) {
    assert.equal(editionPolicy('full').levels.includes(id), true);
    assert.equal(includePublic(`assets/menu/${id}.webp`, 'full'), true);
    assert.equal(includePublic(`assets/levels/${id}/world.glb`, 'full'), true);
    assert.equal(includePublic(`assets/levels/${id}/world.glb`, 'demo'), false);
  }
});
test('the full policy includes all nine sequential mode courses and their runtime stills, while the demo excludes them', () => {
  const expected = [
    'zephyr-skywell',
    'freestyle-oriel',
    'freestyle-ravel',
    'eliminator-glasswake',
    'eliminator-saffron',
    'eliminator-nomad',
    'interceptor',
    'interceptor-helion',
    'interceptor-nightweir',
  ];
  const full = editionPolicy('full');
  assert.equal(new Set(full.levels).size, full.levels.length);
  for (const id of expected) {
    const assetDirectory = id === 'zephyr-skywell' ? 'launchworks' : id;
    assert.equal(full.levels.includes(id), true, id);
    assert.equal(editionPolicy('demo').levels.includes(id), false, id);
    for (const path of [
      `assets/menu/${id}.webp`,
      `assets/levels/${assetDirectory}/runtime.glb`,
      `assets/levels/${assetDirectory}/finish.png`,
    ]) {
      assert.equal(includePublic(path, 'full'), true, path);
      assert.equal(includePublic(path, 'demo'), false, path);
    }
    for (const path of [
      `assets/levels/${id}/source.blend`,
      `assets/levels/${id}/build.py`,
      `assets/levels/${id}/README.md`,
    ])
      assert.equal(includePublic(path, 'full'), false, path);
  }
  assert.equal(full.levels.includes('crucible'), false);
  assert.equal(includePublic('assets/menu/crucible.webp', 'full'), false);
  assert.equal(
    includePublic('assets/levels/crucible/world.glb', 'full'),
    false,
  );
});
test('mode courses retain their borrowed canonical biome exports without pulling the worlds into the demo', () => {
  for (const path of [
    'assets/levels/launchworks/arrival-beacon.glb',
    'assets/levels/launchworks/veil-spill-lip.glb',
    'assets/levels/zephyr/cathedral-facade.glb',
    'assets/levels/zephyr/zephyr-limestone-v1.png',
    'assets/levels/oriel/oriel-civic-kit.glb',
    'assets/levels/ravel/anchor-fleet.glb',
    'assets/levels/glasswake/glasswake-environment-v5.glb',
    'assets/levels/saffron/leviathan-kit.glb',
    'assets/levels/nomad/carrier-kit.glb',
    'assets/levels/colossus/colossus-sky-v1.png',
    'assets/levels/nightweir/nightweir-city.glb.gz',
    'assets/levels/shatterline/limestone-v1.png',
    'assets/levels/helion/thermal-observatory.glb',
  ]) {
    assert.equal(includePublic(path, 'full'), true, path);
    assert.equal(includePublic(path, 'demo'), false, path);
  }
  // The demo's existing tiny material borrow remains an individual-file rule.
  assert.equal(
    includePublic('assets/levels/nightweir/fired-brick-v1.png', 'demo'),
    true,
  );
  assert.equal(
    includePublic('assets/levels/helion/ceramic/normal.ktx2', 'demo'),
    true,
  );
});
test('only the four final native finale records and provenance manifest ship in the full edition', () => {
  for (const file of [
    'kestrel.json.gz',
    'shrike.json.gz',
    'bastion.json.gz',
    'needle.json.gz',
    'manifest.json',
  ]) {
    const path = `assets/completion/shatterline-v1/${file}`;
    assert.equal(includePublic(path, 'full'), true, path);
    assert.equal(includePublic(path, 'demo'), false, path);
  }
  for (const file of [
    'kestrel.json',
    'test.json.gz',
    'kestrel.webm',
    'capture.log',
    'source.js',
    '../needle.json.gz',
  ])
    assert.equal(
      includePublic(`assets/completion/shatterline-v1/${file}`, 'full'),
      false,
      file,
    );
  assert.equal(
    includePublic('assets/completion/old/needle.json.gz', 'full'),
    false,
  );
  for (const tool of ['completion-capture', 'capture-completion-runs'])
    assert.equal(
      forbiddenModules.test(`/project/tools/${tool}.mjs`),
      true,
      'offline capture tools never enter the renderer bundle',
    );
  assert.equal(
    forbiddenModules.test('/project/src/frontend/completion-run.js'),
    false,
  );
});
test('custom protocol confines requests to the renderer root', () => {
  const root = resolve('example/dist');
  assert.equal(resourcePath('vn-game://app/', root), root + sep + 'index.html');
  assert.equal(
    resourcePath('vn-game://app/assets/menu/nacre.webp?anything=1', root),
    resolve(root, 'assets/menu/nacre.webp'),
  );
  for (const url of [
    'file:///etc/passwd',
    'https://app/index.html',
    'vn-game://other/index.html',
    'vn-game://user@app/index.html',
    'vn-game://app/%2e%2e%2fmain.cjs',
    'vn-game://app/%5c..%5cmain.cjs',
    'vn-game://app/%00',
    'vn-game://app/%zz',
  ])
    assert.equal(resourcePath(url, root), null, url);
  assert(!CSP.includes("'unsafe-eval'"));
  assert(CSP.includes("connect-src 'self'"));
});

test('cup art ships only approved runtime exports for each edition', () => {
  for (const cup of ['founders', 'frontier', 'horizon', 'apex'])
    for (const kind of ['trophy', 'background']) {
      const path = `assets/menu/cups/${cup}-${kind}.webp`;
      assert.equal(includePublic(path, 'full'), true);
      assert.equal(includePublic(path, 'demo'), cup === 'founders');
    }
  assert.equal(includePublic('assets/menu/cups/source.png', 'full'), false);
  assert.equal(
    includePublic('assets/menu/cups/encore-trophy.webp', 'full'),
    true,
  );
  assert.equal(
    includePublic('assets/menu/cups/encore-trophy.webp', 'demo'),
    false,
  );
  assert.equal(
    includePublic('assets/menu/cups/encore-background.webp', 'full'),
    false,
  );
  assert.equal(
    includePublic('assets/menu/cups/encore-trophy.png', 'full'),
    false,
  );
});
test('native operations require the window main frame', () => {
  const mainFrame = { url: 'vn-game://app/index.html' };
  const webContents = { mainFrame };
  const window = { isDestroyed: () => false, webContents };
  assert(
    trustedSender({ sender: webContents, senderFrame: mainFrame }, window),
  );
  assert(
    !trustedSender(
      { sender: webContents, senderFrame: { url: mainFrame.url } },
      window,
    ),
  );
  mainFrame.url = 'https://app.example/';
  assert(
    !trustedSender({ sender: webContents, senderFrame: mainFrame }, window),
  );
});
test('debugging and unsafe launch flags are rejected', () => {
  for (const arg of [
    '--inspect',
    '--inspect-brk=0',
    '--remote-debugging-port=9222',
    '--remote-debugging-pipe',
    '--no-sandbox',
    '--load-extension=/tmp/ext',
    '--js-flags=--expose-gc',
  ])
    assert(forbiddenArguments([arg]));
  assert(
    !forbiddenArguments([
      'VectorNova.exe',
      '--fullscreen',
      '-applaunch',
      '123',
    ]),
  );
});
test('controller navigation dead zone and buttons are independent from driving', () => {
  assert.deepEqual(menuIntent(null), {
    accept: false,
    back: false,
    secondary: false,
    pause: false,
    camera: false,
    music: false,
    x: 0,
    y: 0,
  });
  const pad = {
    axes: [0.2, -0.8],
    buttons: Array.from({ length: 16 }, () => ({ pressed: false })),
  };
  pad.buttons[9].pressed = true;
  assert.deepEqual(menuIntent(pad), {
    accept: false,
    back: false,
    secondary: false,
    pause: true,
    camera: false,
    music: false,
    x: 0,
    y: -1,
  });
  pad.buttons[3].pressed = true;
  assert.equal(menuIntent(pad).secondary, true);
  assert.equal(menuIntent(pad).accept, false);
  assert.equal(menuIntent(pad).back, false);
});

test('local asset streaming supports music ranges and confines the decoder eval policy', async () => {
  const { mkdtemp, mkdir, writeFile, rm } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const { serveResource } = createRequire(import.meta.url)(
    '../../desktop/security.cjs',
  );
  const root = await mkdtemp(join(tmpdir(), 'vn-resource-'));
  try {
    await mkdir(join(root, 'assets'));
    await writeFile(join(root, 'assets/music.mp3'), '0123456789');
    await writeFile(join(root, 'assets/decoder-worker.js'), 'worker');
    const request = (path, options) =>
      new Request(`vn-game://app/${path}`, options);
    const response = await serveResource(
      request('assets/music.mp3', { headers: { range: 'bytes=2-5' } }),
      root,
    );
    assert.equal(response.status, 206);
    assert.equal(response.headers.get('content-range'), 'bytes 2-5/10');
    assert.equal(await response.text(), '2345');
    assert(
      !response.headers
        .get('content-security-policy')
        .includes("'unsafe-eval'"),
    );
    const suffix = await serveResource(
      request('assets/music.mp3', { headers: { range: 'bytes=-2' } }),
      root,
    );
    assert.equal(await suffix.text(), '89');
    const head = await serveResource(
      request('assets/music.mp3', { method: 'HEAD' }),
      root,
    );
    assert.equal(head.headers.get('content-length'), '10');
    assert.equal(await head.text(), '');
    assert.equal(
      (
        await serveResource(
          request('assets/music.mp3', { headers: { range: 'bytes=99-' } }),
          root,
        )
      ).status,
      416,
    );
    assert.equal((await serveResource(request('missing'), root)).status, 404);
    const worker = await serveResource(
      request('assets/decoder-worker.js'),
      root,
    );
    assert(
      worker.headers.get('content-security-policy').includes("'unsafe-eval'"),
    );
    assert.equal(await worker.text(), 'worker');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('full desktop staging preserves registered Worldkit provenance byte-for-byte while demo omits it', async () => {
  const { mkdtemp, readFile, readdir, rm, stat } =
    await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const { fileURLToPath, pathToFileURL } = await import('node:url');
  const { copyWorldkitNotices } = await import('./notices.mjs');
  const scratch = await mkdtemp(join(tmpdir(), 'vn-worldkit-notices-'));
  const appRoot = fileURLToPath(new URL('../..', import.meta.url));
  try {
    const demo = join(scratch, 'demo');
    assert.deepEqual(
      await copyWorldkitNotices(demo, editionPolicy('demo')),
      [],
    );
    await assert.rejects(stat(demo), { code: 'ENOENT' });
    const full = join(scratch, 'full');
    const staged = await copyWorldkitNotices(full, editionPolicy('full'));
    const manifest = JSON.parse(
      await readFile(join(appRoot, 'docs/ASSET_MANIFEST.json'), 'utf8'),
    );
    const assets = manifest.assets.filter(
      (entry) => entry.id === 'worldkit-forest-art',
    );
    assert.equal(assets.length, 1);
    for (const record of new Set(
      assets.flatMap((asset) => asset.provenanceRecords),
    )) {
      const relative = record.replace(/^\.\.\/\.\.\/worldkit\//, 'worldkit/');
      assert.ok(
        staged.includes(relative),
        `Registered provenance is staged: ${record}`,
      );
      assert.deepEqual(
        await readFile(join(full, relative)),
        await readFile(resolve(appRoot, record)),
      );
    }
    assert.ok(staged.includes('worldkit/modules/landscape/THREE-LICENSE.txt'));
    assert.ok(
      staged.includes(
        'worldkit/modules/landscape/assets/runtime/textures/SOURCES.md',
      ),
    );
    const guides = [
      'modules/living-forest/art/sapling/README.md',
      'modules/living-forest/art/ancient-oak/README.md',
    ];
    for (const guide of guides) {
      assert.ok(staged.includes(`worldkit/${guide}`));
      assert.deepEqual(
        await readFile(join(full, 'worldkit', guide)),
        await readFile(resolve(appRoot, '../../worldkit', guide)),
      );
    }
    for (const record of ['NOTICE.md', ...guides]) {
      const document = await readFile(join(full, 'worldkit', record), 'utf8');
      for (const [, link] of document.matchAll(/\[[^\]]*\]\(([^)]+)\)/g)) {
        if (/^https?:/.test(link) || link.startsWith('#')) continue;
        const target = new URL(
          link,
          pathToFileURL(join(full, 'worldkit', record)),
        );
        assert.ok(
          (await stat(target)).isFile(),
          `Staged attribution link resolves: ${record} -> ${link}`,
        );
      }
    }
    assert.ok(
      staged.every((path) => /\.(md|txt|json)$/.test(path)),
      'Only notices and source metadata, no copied runtime art',
    );
    assert.deepEqual(await readdir(full), ['worldkit']);
  } finally {
    await rm(scratch, { recursive: true, force: true });
  }
});

test('full edition includes all fleet rail stills without shipping their source notes', () => {
  for (const id of editionPolicy('full').ships)
    assert.equal(includePublic(`assets/menu/ships/${id}.jpg`, 'full'), true);
  assert.equal(includePublic('assets/menu/ships/README.md', 'full'), false);
});

test('desktop editions include their reward icons but omit artwork sources and prompts', async () => {
  const { REWARDS } = await import('../../src/progression/catalog.js');
  const { DEMO_REQUIREMENTS } =
    await import('../../src/progression/edition.js');
  for (const edition of ['demo', 'full']) {
    for (const reward of REWARDS)
      assert.equal(
        includePublic(`assets/rewards/icons-v2/${reward.id}.png`, edition),
        edition === 'full' || Object.hasOwn(DEMO_REQUIREMENTS, reward.id),
      );
    for (const file of ['source/speed-1.png', 'provenance.json', 'unknown.png'])
      assert.equal(
        includePublic(`assets/rewards/icons-v2/${file}`, edition),
        false,
      );
  }
});
