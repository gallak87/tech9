import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { basename } from 'node:path';
import {
  openEditorSection,
  revealEditorAction,
  revealEditorField,
} from './editor-controls.mjs';
import { seedVerificationCareer } from './verification-career.mjs';
import {
  collectPageErrors,
  launchVerificationBrowser,
} from './verification-browser.mjs';

// Native custom-course smoke check for regional-ground rendering. The optional
// pose/report stage matched views; headless RAF intervals do not certify FPS.
const base = process.env.VN_URL;
const sourcePath = process.env.VN_TRACK;
if (!base || !sourcePath)
  throw new Error('Set VN_URL to an isolated server and VN_TRACK to a course.');
const source = await readFile(sourcePath);
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const sourceHash = hash(source);
const document = JSON.parse(source.toString('utf8'));
const pose = process.env.VN_GROUND_VIEW
  ? JSON.parse(process.env.VN_GROUND_VIEW)
  : {
      position: [-337.0647, 54.8458, -133.2313],
      target: [-366.7621, 5.3058, -51.5988],
      fov: 64,
    };
const browser = await launchVerificationBrowser();
const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
});
const errors = [],
  glErrors = [],
  results = [];
const choose = async (page, name) =>
  (await revealEditorAction(page, name)).click();
const state = async (page) =>
  page.evaluate(() => window.__VN_FRONTEND.getState().editor);
const watchdog = setTimeout(() => {
  process.exitCode = 1;
  void browser.close();
}, 180000);
async function ready(page) {
  await page.waitForFunction(
    () => {
      const editor = window.__VN_FRONTEND?.getState().editor;
      return editor && !editor.busy && editor.preview?.worldReady;
    },
    null,
    { timeout: 60000 },
  );
}
async function frames(page, count = 3) {
  return page.evaluate(
    (count) =>
      new Promise((resolve) => {
        function frame() {
          if (--count <= 0) resolve();
          else requestAnimationFrame(frame);
        }
        requestAnimationFrame(frame);
      }),
    count,
  );
}
async function savedDocument(page) {
  await choose(page, 'save');
  await page.waitForFunction(() =>
    globalThis.document
      .querySelector('[data-editor-status]')
      ?.textContent.includes('Track saved'),
  );
  const saved = await page.evaluate(
    (id) =>
      Object.keys(localStorage)
        .filter((key) => key.startsWith('vector-nova.tracks.v1.'))
        .map((key) => JSON.parse(localStorage.getItem(key)).document)
        .find((value) => value.id === id),
    document.id,
  );
  assert(saved, 'public Save retains the imported document');
  return saved;
}
async function sample(page) {
  return page.evaluate(async () => {
    const intervals = [];
    let previous;
    await new Promise((resolve) => {
      function frame(now) {
        if (previous !== undefined) intervals.push(now - previous);
        previous = now;
        if (intervals.length >= 120) resolve();
        else requestAnimationFrame(frame);
      }
      requestAnimationFrame(frame);
    });
    const sorted = [...intervals].sort((a, b) => a - b);
    const snapshot = window.__VN.getSnapshot(),
      metrics = window.__VN.getMetrics();
    return {
      quality: snapshot.settings.quality,
      camera: snapshot.camera,
      mode: snapshot.mode,
      time: snapshot.vehicle.time,
      steeringAssist: snapshot.handling.steeringAssist,
      calls: metrics.calls,
      triangles: metrics.triangles,
      textures: metrics.textures,
      textureMiB: metrics.textureMiB,
      estimatedGpuMiB: metrics.estimatedGpuMiB,
      gpu: metrics.gpu,
      viewport: metrics.viewport,
      pipeline: metrics.pipeline,
      warmRafMs: {
        mean:
          intervals.reduce((sum, value) => sum + value, 0) / intervals.length,
        p95: sorted[Math.floor(sorted.length * 0.95)],
      },
      errors: snapshot.errors,
    };
  });
}

try {
  await seedVerificationCareer(context);
  await context.addInitScript(() =>
    localStorage.setItem(
      'vector-nova.settings',
      JSON.stringify({
        quality: 'high',
        volume: 0,
        masterVolume: 0,
        musicVolume: 0,
        musicEnabled: false,
        reducedMotion: true,
      }),
    ),
  );
  const page = await context.newPage();
  collectPageErrors(page, errors);
  page.on('console', (message) => {
    if (
      message.type() === 'error' &&
      /WebGL|GL_INVALID|OUT_OF_MEMORY|shader|context lost/i.test(message.text())
    )
      glErrors.push(message.text());
  });
  await page.goto(new URL('?editor=1&intro=0&music=0', base).href);
  await page.locator('[data-editor-field="name"]').waitFor({ timeout: 60000 });
  await ready(page);
  await openEditorSection(page, 'library');
  const chooser = page.waitForEvent('filechooser');
  await choose(page, 'import');
  await (
    await chooser
  ).setFiles({
    name: basename(sourcePath),
    mimeType: 'application/json',
    buffer: source,
  });
  await page.waitForFunction(
    (count) => window.__VN_FRONTEND.getState().editor?.points === count,
    document.points.length,
  );
  await ready(page);
  const applied = await savedDocument(page);
  await choose(page, 'fly-camera');
  await page.waitForFunction(
    () => window.__VN_FRONTEND.getState().editor.preview.camera.mode === 'fly',
  );
  const previewBefore = (await state(page)).preview.camera;
  await page.keyboard.down('w');
  await page.waitForTimeout(180);
  await page.keyboard.up('w');
  await page.keyboard.down('e');
  await page.waitForTimeout(120);
  await page.keyboard.up('e');
  await frames(page);
  const previewAfter = (await state(page)).preview.camera;
  assert(
    Math.hypot(
      ...previewAfter.position.map(
        (value, i) => value - previewBefore.position[i],
      ),
    ) > 10,
    'native preview flight moves through the applied environment',
  );
  await page.keyboard.press('Escape');
  assert.equal((await state(page)).preview.camera.mode, 'orbit');
  assert.equal((await state(page)).points, document.points.length);
  assert.deepEqual(
    await savedDocument(page),
    applied,
    'preview flight leaves authored geometry and environment settings unchanged',
  );
  await (
    await revealEditorField(page, 'point')
  ).selectOption(String(Math.min(8, document.points.length - 1)));
  const career = await page.evaluate(() =>
    Object.fromEntries(
      Object.entries(localStorage).filter(([key]) =>
        /careers|profile|cups/.test(key),
      ),
    ),
  );
  await choose(page, 'test-point');
  await page.waitForFunction(
    () =>
      window.__VN?.ready &&
      window.__VN_FRONTEND.getState().editor.testDriving &&
      !window.__VN_FRONTEND.getState().editor.loadingTest,
    null,
    { timeout: 90000 },
  );
  await page.keyboard.press('f');
  await page.waitForFunction(() => window.__VN.getSnapshot().mode === 'fly');
  await page.keyboard.press('p');
  const graphics = page.locator('#fly-settings [data-setting="quality"]');
  await graphics.waitFor({ state: 'visible' });
  for (const quality of ['high', 'low', 'high']) {
    await graphics.selectOption(quality);
    await page.evaluate((pose) => window.__VN.setFlyView(pose), pose);
    await frames(page);
    const before = await sample(page);
    assert.equal(before.quality, quality);
    assert.equal(before.mode, 'fly');
    assert.equal(before.pipeline.ambientOcclusion, false);
    assert.equal(before.pipeline.shadowSize, quality === 'high' ? 3072 : 1024);
    assert.equal(before.steeringAssist, 0.3);
    assert.deepEqual(before.errors, []);
    if (process.env.VN_EVIDENCE)
      await page.screenshot({
        path: `${process.env.VN_EVIDENCE}-${results.length}-${quality}.png`,
      });
    await page.locator('#fly-settings-close').click();
    await page.keyboard.down('w');
    await page.waitForTimeout(200);
    await page.keyboard.up('w');
    await page.keyboard.down('e');
    await page.waitForTimeout(150);
    await page.keyboard.up('e');
    await page.mouse.move(1000, 400);
    await page.mouse.down();
    await page.mouse.move(1030, 420, { steps: 4 });
    await page.mouse.up();
    const after = await page.evaluate(() => window.__VN.getSnapshot());
    assert(
      Math.hypot(
        ...after.camera.position.map(
          (value, i) => value - before.camera.position[i],
        ),
      ) > 10,
      'native free-camera input moves in space',
    );
    assert.notDeepEqual(
      after.camera.quaternion,
      before.camera.quaternion,
      'native drag changes the viewing angle',
    );
    assert.equal(
      after.vehicle.time,
      before.time,
      'free camera leaves simulation frozen',
    );
    await page.keyboard.press('p');
    results.push(before);
  }
  assert.equal(
    results[0].calls,
    results[2].calls,
    'High returns to the same draw count after Low',
  );
  assert.equal(
    results[0].triangles,
    results[2].triangles,
    'quality roundtrip preserves geometry',
  );
  await page.locator('#fly-settings-close').click();
  await page.keyboard.press('f');
  assert.notEqual(
    (await page.evaluate(() => window.__VN.getSnapshot())).mode,
    'fly',
  );
  await page.keyboard.press('Escape');
  const returnButton = page.getByRole('button', {
    name: /back to editor|return to editor/i,
  });
  await returnButton.waitFor({ state: 'visible' });
  await returnButton.click();
  await ready(page);
  assert.deepEqual(
    await savedDocument(page),
    applied,
    'Test Drive and graphics changes leave the authored course unchanged',
  );
  if (process.argv.includes('--responsive')) {
    await page.setViewportSize({ width: 390, height: 844 });
    await frames(page);
    await ready(page);
    const preview = (await state(page)).preview;
    assert(preview.camera.position.every(Number.isFinite));
    assert(
      preview.calls > 0 && preview.triangles > 0,
      'the final portrait preview draws the ground and world',
    );
    assert.deepEqual(
      await savedDocument(page),
      applied,
      'responsive preview retains the course',
    );
  }
  assert.deepEqual(
    await page.evaluate(() =>
      Object.fromEntries(
        Object.entries(localStorage).filter(([key]) =>
          /careers|profile|cups/.test(key),
        ),
      ),
    ),
    career,
  );
  assert.equal(
    hash(await readFile(sourcePath)),
    sourceHash,
    'the original course is unchanged',
  );
  assert.deepEqual(errors, []);
  assert.deepEqual(glErrors, []);
  if (process.env.VN_REPORT)
    await writeFile(process.env.VN_REPORT, JSON.stringify(results, null, 2));
  console.log(
    'PASS exact import, preview flight, Test Drive, High/Low/High, native camera movement/look, frozen simulation, editor return',
    JSON.stringify({ sourceHash, results, errors, glErrors }),
  );
} finally {
  clearTimeout(watchdog);
  await context.close();
  await browser.close();
}
