import { chromium } from 'playwright';
import assert from 'node:assert/strict';
const base = process.env.VN_URL || 'http://127.0.0.1:5179';
const pngIndex = process.argv.indexOf('--png-fixture');
const pngFixture = pngIndex >= 0 ? process.argv[pngIndex + 1] : null;
if (pngIndex >= 0 && !pngFixture)
  throw new Error('--png-fixture requires a GLB path');
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const context = await browser.newContext({
  viewport: { width: 1600, height: 1000 },
});
const page = await context.newPage();
await page.route('**/loader-fixture', (r) =>
  r.fulfill({ contentType: 'text/html', body: '<!doctype html><body></body>' }),
);
await page.goto(base + '/loader-fixture');
await page.evaluate(async () => {
  window.cache = await import('/src/ships/model-cache.js');
  window.previewModule = await import('/src/frontend/ship-preview.js');
  window.memory = await import('/src/renderer/texture-memory.js');
  window.instances = [];
  window.uploads = [];
  window.workerCounts = { created: 0, terminated: 0 };
  const Native = window.Worker;
  window.Worker = class extends Native {
    constructor(...args) {
      super(...args);
      window.workerCounts.created++;
    }
    terminate() {
      window.workerCounts.terminated++;
      return super.terminate();
    }
  };
  for (const method of ['compressedTexImage2D', 'compressedTexSubImage2D']) {
    const original = WebGL2RenderingContext.prototype[method];
    WebGL2RenderingContext.prototype[method] = function (...args) {
      window.uploads.push({
        method,
        format: args[method === 'compressedTexImage2D' ? 2 : 6],
      });
      return original.apply(this, args);
    };
  }
  window.startPreview = () => {
    window.preview = window.previewModule.createShipPreview();
    document.body.append(window.preview.element);
    window.preview.element.style.cssText = 'width:800px;height:600px';
    return window.preview;
  };
  window.mapStats = (model) => {
    const maps = new Set();
    model.traverse((o) => {
      for (const m of [o.material].flat())
        if (m) for (const v of Object.values(m)) if (v?.isTexture) maps.add(v);
    });
    return [...maps].map((t) => ({
      name: t.name,
      space: t.colorSpace,
      mips: t.mipmaps?.length,
      ...window.memory.textureMemory(t),
    }));
  };
});
try {
  if (process.argv.includes('--png-fixture')) {
    await page.route('**/png-fixture.glb', (r) =>
      r.fulfill({ path: pngFixture, contentType: 'model/gltf-binary' }),
    );
    const png = await page.evaluate(async (base) => {
      const loader = await import('/src/ships/texture-loader.js');
      const start = performance.now();
      const { scene } = await loader.loadFleetGLTF(base + '/png-fixture.glb');
      const ms = performance.now() - start;
      const maps = window.mapStats(scene);
      scene.traverse((o) => {
        o.geometry?.dispose();
        o.material?.dispose();
      });
      return { ms, maps };
    }, base);
    assert.ok(png.maps.length);
    assert.ok(png.maps.every((m) => !m.compressed));
    assert.equal(await page.evaluate(() => window.workerCounts.created), 0);
    console.log(
      'PASS ordinary PNG without renderer or decoder',
      JSON.stringify(png),
    );
  }
  // Disposal while waiting for capabilities must reject rather than deadlock.
  await page.evaluate(() => {
    window.cancelled = window.cache.loadShipModel('kestrel').then(
      () => false,
      (e) => e.name === 'AbortError',
    );
  });
  await page.waitForTimeout(300);
  assert.equal(
    await page.evaluate(async () => {
      window.cache.disposeShipCache();
      return await window.cancelled;
    }),
    true,
  );
  assert.equal(await page.evaluate(() => window.workerCounts.created), 0);
  // Compressed preload before renderer must wait and never initialize Basis.
  await page.evaluate(() => {
    window.pending = window.cache.loadShipModel('kestrel');
    window.settled = false;
    window.pending.finally(() => (window.settled = true));
  });
  await page.waitForTimeout(500);
  assert.equal(await page.evaluate(() => window.settled), false);
  assert.equal(await page.evaluate(() => window.workerCounts.created), 0);
  const cold = await page.evaluate(async () => {
    const start = performance.now();
    window.startPreview();
    const model = await window.pending;
    await window.preview.setShip('kestrel');
    return {
      gatedPreviewMs: performance.now() - start,
      maps: window.mapStats(model),
    };
  });
  await page.waitForTimeout(250);
  const gpu = await page.evaluate(() => ({
    uploads: window.uploads,
    workers: window.workerCounts,
    preview: window.preview.getState(),
  }));
  assert.ok(cold.maps.some((m) => m.compressed));
  assert.ok(gpu.uploads.length > 0);
  assert.equal(gpu.preview.error, '');
  assert.ok(cold.maps.filter((m) => m.compressed).every((m) => m.mips >= 10));
  const warm = await page.evaluate(async () => {
    const start = performance.now();
    await window.cache.loadShipModel('kestrel');
    return performance.now() - start;
  });
  console.log('GPU', JSON.stringify({ cold, warmMs: warm, gpu }));
  // Cached clones survive other previews being disposed; cache/worker retirement
  // allows a new load using the retained real GPU capability snapshot.
  for (let i = 0; i < 3; i++) {
    const state = await page.evaluate(async () => {
      window.preview.dispose();
      window.cache.disposeShipCache();
      await new Promise((r) => setTimeout(r, 30));
      const start = performance.now();
      await window.cache.loadShipModel('kestrel');
      const loadMs = performance.now() - start;
      window.startPreview();
      await window.preview.setShip('kestrel');
      return {
        loadMs,
        preview: window.preview.getState(),
        workers: window.workerCounts,
      };
    });
    assert.equal(state.preview.error, '');
    assert.ok(state.workers.created - state.workers.terminated <= 2);
    console.log('cycle', i, JSON.stringify(state));
  }
  await page.evaluate(() => {
    window.preview.dispose();
    window.cache.disposeShipCache();
  });
  // Aborted transfer cannot later insert a parsed source into the cache.
  let held;
  await page.route('**/assets/ships/kestrel/kestrel.glb', (r) => {
    held = r;
  });
  await page.evaluate(() => {
    window.cancelled = window.cache.loadShipModel('kestrel').then(
      () => false,
      (e) => e.name === 'AbortError',
    );
  });
  await page.waitForTimeout(100);
  assert.ok(held);
  assert.equal(
    await page.evaluate(async () => {
      window.cache.disposeShipCache();
      return await window.cancelled;
    }),
    true,
  );
  await held.abort();
  await page.unroute('**/assets/ships/kestrel/kestrel.glb');
  // A decoder transfer failure rejects instead of returning an untextured model.
  await page.route('**/assets/ships/decoder/basis_transcoder.wasm', (r) =>
    r.abort(),
  );
  const failed = await page.evaluate(() =>
    window.cache.loadShipModel('kestrel').then(
      () => false,
      () => true,
    ),
  );
  assert.ok(failed);
  await page.unroute('**/assets/ships/decoder/basis_transcoder.wasm');
  assert.ok(
    await page.evaluate(async () =>
      window
        .mapStats(await window.cache.loadShipModel('kestrel'))
        .some((m) => m.compressed),
    ),
  );
  await page.evaluate(() => window.cache.disposeShipCache());
  // Simulate worker startup that never calls onRuntimeInitialized. A real bounded
  // timeout must retire those workers and let the next selection retry.
  await page.route('**/assets/ships/decoder/basis_transcoder.js', (r) =>
    r.fulfill({
      contentType: 'text/javascript',
      body: 'var BASIS = function() { return new Promise(function() {}); };',
    }),
  );
  const hung = await page.evaluate(async () => {
    const start = performance.now();
    try {
      await window.cache.loadShipModel('kestrel');
      return { failed: false };
    } catch (e) {
      return {
        failed: true,
        message: e.message,
        ms: performance.now() - start,
      };
    }
  });
  assert.ok(hung.failed);
  assert.match(hung.message, /timed out/);
  assert.ok(hung.ms < 35000);
  await page.unroute('**/assets/ships/decoder/basis_transcoder.js');
  assert.ok(
    await page.evaluate(async () =>
      window
        .mapStats(await window.cache.loadShipModel('kestrel'))
        .some((m) => m.compressed),
    ),
  );
  console.log(
    'PASS capability gate, actual compressed GPU uploads, warm cache, preview disposal, cancellation, decoder failure/retry and worker timeout',
    JSON.stringify(hung),
  );
  await page.evaluate(() => {
    window.cache.disposeShipCache();
  });
  await page.waitForTimeout(100);
  const workers = await page.evaluate(() => window.workerCounts);
  assert.equal(workers.created, workers.terminated);
  console.log('workers', workers);
} finally {
  await browser.close();
}
