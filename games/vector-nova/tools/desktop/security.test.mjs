import test from 'node:test';
import assert from 'node:assert/strict';
import { resolve, sep } from 'node:path';
import { createRequire } from 'node:module';
import { editionPolicy, includePublic } from './policy.mjs';
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
    pause: true,
    camera: false,
    music: false,
    x: 0,
    y: -1,
  });
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
  const { fileURLToPath } = await import('node:url');
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

test('desktop editions include every reward icon but omit artwork sources and prompts', async () => {
  const { REWARDS } = await import('../../src/progression/catalog.js');
  for (const edition of ['demo', 'full']) {
    for (const reward of REWARDS)
      assert.equal(
        includePublic(`assets/rewards/icons-v2/${reward.id}.png`, edition),
        true,
      );
    for (const file of ['source/speed-1.png', 'provenance.json', 'unknown.png'])
      assert.equal(
        includePublic(`assets/rewards/icons-v2/${file}`, edition),
        false,
      );
  }
});
