import assert from 'node:assert/strict';
import { generateDocument, GENERATOR_VERSION } from '../src/editor/document.js';
import {
  revealEditorField,
  revealEditorAction,
  openEditorSection,
  enterRecoveredWorkspace,
} from './editor-controls.mjs';
import { readFile } from 'node:fs/promises';
import {
  createCareerSlots,
  createMemoryStorage,
} from '../src/progression/careers.js';
import {
  launchVerificationBrowser,
  collectPageErrors,
} from './verification-browser.mjs';

// Public controls and synthetic hardware only; no production editing/test hooks.
const base = process.env.VN_URL;
if (!base) throw new Error('Set VN_URL to the worktree dev server.');
const responsive = process.argv.includes('--responsive');
const source = createMemoryStorage();
createCareerSlots({ storage: () => source, now: () => 1 }).create(1);
const careerSeed = Array.from({ length: source.length }, (_, i) => {
  const key = source.key(i);
  return [key, source.getItem(key)];
});
const browser = await launchVerificationBrowser();
const context = await browser.newContext({
  viewport: responsive
    ? { width: 390, height: 844 }
    : { width: 1440, height: 1000 },
  hasTouch: responsive,
  acceptDownloads: true,
});
const errors = [];
const watchdog = setTimeout(() => {
  console.error('Editor verification exceeded four minutes');
  process.exit(1);
}, 240000);
const action = (page, name) =>
  page.locator(`[data-editor-action="${name}"]`).first();
const field = (page, name) => page.locator(`[data-editor-field="${name}"]`);
const savedDocuments = (page) =>
  page.evaluate(() =>
    Object.keys(localStorage)
      .filter((key) => key.startsWith('vector-nova.tracks.v1.'))
      .map((key) => JSON.parse(localStorage.getItem(key)).document),
  );
async function panel(page, name) {
  await openEditorSection(page, name);
}
async function roadDetails(page) {
  await panel(page, 'route');
}
async function change(page, name, value) {
  const control = await revealEditorField(page, name);
  if (await control.evaluate((node) => node.tagName === 'SELECT'))
    await control.selectOption(String(value));
  else {
    await control.fill(String(value));
    await control.press('Tab');
  }
}
async function pad(page, button) {
  await page.evaluate(async (index) => {
    window.__editorPad.buttons[index] = { pressed: true, value: 1 };
    await new Promise((done) =>
      requestAnimationFrame(() => requestAnimationFrame(done)),
    );
    window.__editorPad.buttons[index] = { pressed: false, value: 0 };
    await new Promise((done) =>
      requestAnimationFrame(() => requestAnimationFrame(done)),
    );
  }, button);
}
async function save(page) {
  await (await revealEditorAction(page, 'save')).click();
  await page.waitForFunction(() =>
    document
      .querySelector('[data-editor-status]')
      ?.textContent.includes('Track saved'),
  );
}
try {
  await context.routeWebSocket('**/*', () => {});
  await context.addInitScript((seed) => {
    for (const [key, value] of seed)
      if (localStorage.getItem(key) === null) localStorage.setItem(key, value);
    localStorage.setItem('startUpMusicOn', 'false');
    localStorage.setItem(
      'vector-nova.settings',
      JSON.stringify({ quality: 'low', volume: 0, reducedMotion: true }),
    );
    window.__editorPad = {
      id: 'Editor verification controller',
      index: 0,
      connected: true,
      mapping: 'standard',
      axes: [0, 0, 0, 0],
      buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })),
    };
    Object.defineProperty(navigator, 'getGamepads', {
      configurable: true,
      value: () => [window.__editorPad],
    });
  }, careerSeed);
  const page = await context.newPage();
  collectPageErrors(page, errors);
  await page.goto(new URL('?intro=0&music=0', base).href);
  const entry = page.locator('[data-action="track-editor"]');
  await entry.waitFor({ timeout: 90000 });
  assert.equal(
    await entry.evaluate((node) => !!node.closest('.menu-top-tabs')),
    true,
    'Editor is a top-level main navigation tab',
  );
  assert.equal(await entry.textContent(), 'Editor');
  await entry.focus();
  await page.keyboard.press('Enter');
  await action(page, 'test').waitFor();
  assert.equal(
    await action(page, 'test').isDisabled(),
    true,
    'blank draft cannot drive',
  );
  await (await revealEditorField(page, 'name')).fill('Unblurred quick save');
  await (
    await revealEditorField(page, 'name')
  ).press(process.platform === 'darwin' ? 'Meta+s' : 'Control+s');
  await page.waitForFunction(() =>
    document
      .querySelector('[data-editor-status]')
      ?.textContent.includes('Track saved'),
  );
  assert.equal(
    (await savedDocuments(page))[0].name,
    'Unblurred quick save',
    'keyboard save commits the active text field',
  );
  assert.equal(
    await field(page, 'name').evaluate(
      (node) => node === document.activeElement,
    ),
    true,
    'keyboard save restores text focus',
  );
  await change(page, 'name', 'Nightweir verification');
  await save(page);
  assert.equal(
    await action(page, 'save').evaluate(
      (node) => node === document.activeElement,
    ),
    true,
    'async Save restores its initiating button',
  );
  let documents = await savedDocuments(page);
  assert.equal(documents.length, 1);
  assert.deepEqual(documents[0].points, []);
  const originalId = documents[0].id;
  console.log('PASS blank slate, keyboard entry, draft save');

  await openEditorSection(page, 'generate');
  await change(page, 'seed', 123456);
  await change(page, 'length', 5000);
  await change(page, 'jump-frequency', 'none');
  await (await revealEditorAction(page, 'generate')).click();
  await page.waitForFunction(
    () => !window.__VN_FRONTEND.getState().editor.busy,
  );
  assert.equal(await action(page, 'test').isEnabled(), true);
  await save(page);
  const generated = (await savedDocuments(page)).find(
    (doc) => doc.id === originalId,
  );
  assert.equal(
    generated.generator.version,
    GENERATOR_VERSION,
    'Generate uses the current varied layout',
  );
  assert.equal(
    generated.jumps.length,
    0,
    'the None jump option changes the actual course',
  );
  // The following fixed station/roll regressions retain their original saved fixture.
  const legacy = generateDocument({
    generatorVersion: 1,
    seed: 123456,
    length: 5000,
    seedJumps: false,
  });
  legacy.id = originalId;
  legacy.name = generated.name;
  await openEditorSection(page, 'library');
  const legacyChooser = page.waitForEvent('filechooser');
  await (await revealEditorAction(page, 'import')).click();
  await (
    await legacyChooser
  ).setFiles({
    name: 'legacy-authoring.vntrack.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(legacy)),
  });
  await page.waitForFunction(() =>
    document
      .querySelector('[data-editor-status]')
      ?.textContent.includes('Track imported'),
  );
  await roadDetails(page);
  assert.equal(await action(page, 'test').isEnabled(), true);
  const originalX = Number(await field(page, 'point-x').inputValue());
  await (await revealEditorAction(page, 'east')).focus();
  await pad(page, 0);
  assert.equal(
    Number(await field(page, 'point-x').inputValue()),
    originalX + 20,
  );
  await (await revealEditorAction(page, 'undo')).click();
  assert.equal(Number(await field(page, 'point-x').inputValue()), originalX);
  await (await revealEditorAction(page, 'redo')).click();
  assert.equal(
    Number(await field(page, 'point-x').inputValue()),
    originalX + 20,
  );
  const originalY = Number(await field(page, 'point-y').inputValue());
  await (await revealEditorField(page, 'point-y')).focus();
  await pad(page, 15);
  assert(
    Number(await field(page, 'point-y').inputValue()) > originalY,
    'controller adjusts elevation',
  );
  await save(page);
  documents = await savedDocuments(page);
  const edited = documents.find((doc) => doc.id === originalId);
  assert.equal(edited.generator.seed, 123456);
  assert.equal(edited.points.length, 16);
  assert(edited.points[0].y > originalY);
  console.log('PASS seeded circuit, controller movement/elevation, undo/redo');

  await panel(page, 'shape');
  for (const preset of ['90', '180', '270']) {
    await change(page, 'shape-start', 1);
    await change(page, 'shape-end', 5);
    await change(page, 'shape-preset', preset);
    await change(page, 'shape-direction', 'right');
    await (await revealEditorAction(page, 'apply-shape')).focus();
    await pad(page, 0);
    await save(page);
    const shaped = (await savedDocuments(page)).find(
      (doc) => doc.id === originalId,
    );
    assert(
      Math.abs(shaped.points[5].roll - (Number(preset) * Math.PI) / 180) < 1e-8,
    );
    assert.equal(
      shaped.points[6].roll,
      shaped.points[5].roll,
      'following straight holds chunk exit angle',
    );
    assert.equal(
      await action(page, 'test').isEnabled(),
      true,
      'preset creates driveable geometry',
    );
    await (await revealEditorAction(page, 'undo')).click();
  }
  await change(page, 'shape-preset', 'straight');
  await (await revealEditorAction(page, 'apply-shape')).click();
  await save(page);
  const straight = (await savedDocuments(page)).find(
    (doc) => doc.id === originalId,
  );
  const a = straight.points[1],
    b = straight.points[5];
  for (const point of straight.points.slice(2, 5)) {
    assert(
      Math.abs((point.x - a.x) * (b.z - a.z) - (point.z - a.z) * (b.x - a.x)) <
        1e-5,
      'Straight aligns the road itself',
    );
    assert.equal(point.roll, a.roll);
  }
  await (await revealEditorAction(page, 'undo')).click();
  for (const [start, end, preset] of [
    [1, 5, '90'],
    [5, 9, '180'],
    [9, 13, '90'],
  ]) {
    await change(page, 'shape-start', start);
    await change(page, 'shape-end', end);
    await change(page, 'shape-preset', preset);
    await (await revealEditorAction(page, 'apply-shape')).click();
  }
  await save(page);
  const chained = (await savedDocuments(page)).find(
    (doc) => doc.id === originalId,
  );
  assert(
    Math.abs(chained.points[13].roll - Math.PI * 2) < 1e-8,
    'chunks compose a complete screw',
  );
  assert.equal(await action(page, 'test').isEnabled(), true);
  await panel(page, 'pickups');
  await (await revealEditorAction(page, 'fill-pickups')).click();
  const pickupCount = await page.evaluate(
    () => window.__VN_FRONTEND.getState().editor.pickupCount,
  );
  assert(pickupCount > 0);
  assert.equal(await page.locator('[data-map-pickup]').count(), pickupCount);
  await (await revealEditorAction(page, 'clear-pickups')).click();
  assert.equal(await page.locator('[data-map-pickup]').count(), 0);
  await (await revealEditorAction(page, 'undo')).click();
  assert.equal(await page.locator('[data-map-pickup]').count(), pickupCount);
  await (await revealEditorAction(page, 'redo')).click();
  assert.equal(await page.locator('[data-map-pickup]').count(), 0);
  await (await revealEditorAction(page, 'undo')).click();
  await save(page);
  console.log(
    'PASS 90/180/270 chunks, straight connections, cumulative full roll, Fill/Clear pickups and undo',
  );
  await panel(page, 'world');
  await (await revealEditorAction(page, 'preset-industrial')).click();
  await (await revealEditorAction(page, 'regenerate-environment')).click();
  await save(page);
  documents = await savedDocuments(page);
  assert.equal(
    documents.find((doc) => doc.id === originalId).settings.sceneryPreset,
    'industrial',
  );
  await openEditorSection(page, 'library');

  const downloadEvent = page.waitForEvent('download', { timeout: 20000 });
  await (await revealEditorAction(page, 'export')).click();
  const download = await downloadEvent;

  const exported = JSON.parse(await readFile(await download.path(), 'utf8'));

  assert.equal(exported.settings.sceneryPreset, 'industrial');
  assert.equal(exported.pickups.devices.length, pickupCount);
  assert(Math.abs(exported.points[13].roll - Math.PI * 2) < 1e-8);
  assert.equal(exported.points[0].x, edited.points[0].x);

  const choose = page.waitForEvent('filechooser', { timeout: 20000 });
  await (await revealEditorAction(page, 'import')).click();
  await (
    await choose
  ).setFiles({
    name: 'roundtrip.vntrack.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(exported)),
  });
  await page.waitForFunction(() =>
    document
      .querySelector('[data-editor-status]')
      ?.textContent.includes('Track imported'),
  );

  const badChoose = page.waitForEvent('filechooser', { timeout: 20000 });
  await (await revealEditorAction(page, 'import')).click();
  await (
    await badChoose
  ).setFiles({
    name: 'bad.json',
    mimeType: 'application/json',
    buffer: Buffer.from('{bad'),
  });
  await page.waitForFunction(
    () =>
      document.querySelector('[data-editor-status]')?.dataset.kind === 'error',
  );
  assert.equal(
    (await savedDocuments(page)).length,
    1,
    'bad import preserves library',
  );
  await (await revealEditorAction(page, 'save-copy')).click();
  await page.waitForFunction(() =>
    document
      .querySelector('[data-editor-status]')
      ?.textContent.includes('Track saved'),
  );
  documents = await savedDocuments(page);
  assert.equal(documents.length, 2);
  assert.notEqual(documents[0].id, documents[1].id);
  console.log(
    'PASS curated world preset, file import/export, damaged file recovery, independent copy',
  );

  if (!responsive) {
    assert.equal(
      await page.locator('[data-editor-world]').isVisible(),
      true,
      'the world preview stays visible',
    );
    await page.waitForFunction(
      () =>
        window.__VN_FRONTEND.getState().editor?.preview?.estimatedGpuBytes >
          0 && window.__VN_FRONTEND.getState().editor.preview.calls > 10,
      null,
      { timeout: 60000 },
    );
    for (const cameraAction of ['zoom-in', 'zoom-out', 'zoom-in', 'zoom-out']) {
      const frame = await page.evaluate(
        () => window.__VN_FRONTEND.getState().editor.preview.frames,
      );
      await (await revealEditorAction(page, cameraAction)).click();
      await page.waitForFunction(
        (frame) =>
          window.__VN_FRONTEND.getState().editor.preview.frames > frame,
        frame,
      );
    }
    const preview = await page.evaluate(
      () => window.__VN_FRONTEND.getState().editor.preview,
    );
    assert(preview.triangles > 0);
    assert(preview.calls < 150);
    await (await revealEditorAction(page, 'zoom-in')).focus();
    await pad(page, 0);
    await (await revealEditorAction(page, 'fly-camera')).click();
    await page.waitForFunction(
      () => window.__VN_FRONTEND.getState().editor.flyActive,
    );
    const flyBefore = await page.evaluate(
      () => window.__VN_FRONTEND.getState().editor.preview.camera,
    );
    await page.keyboard.down('w');
    await page.waitForTimeout(350);
    await page.keyboard.up('w');
    const flyAfter = await page.evaluate(
      () => window.__VN_FRONTEND.getState().editor.preview.camera,
    );
    assert(
      Math.hypot(
        ...flyAfter.position.map((v, i) => v - flyBefore.position[i]),
      ) > 5,
      'free camera flies through the actual world',
    );
    const canvas = await page
      .locator('[data-editor-world] canvas')
      .boundingBox();
    await page.mouse.move(
      canvas.x + canvas.width * 0.5,
      canvas.y + canvas.height * 0.5,
    );
    await page.mouse.down();
    await page.mouse.move(
      canvas.x + canvas.width * 0.5 + 80,
      canvas.y + canvas.height * 0.5 + 25,
      { steps: 5 },
    );
    await page.mouse.up();
    const looked = await page.evaluate(
      () => window.__VN_FRONTEND.getState().editor.preview.camera,
    );
    assert(
      looked.quaternion.some(
        (v, i) => Math.abs(v - flyAfter.quaternion[i]) > 0.01,
      ),
      'drag look changes camera orientation',
    );
    await page.evaluate(() => {
      window.__editorPad.axes = [0, -1, 0.6, -0.25];
    });
    await page.waitForTimeout(250);
    const padMoved = await page.evaluate(
      () => window.__VN_FRONTEND.getState().editor.preview.camera,
    );
    assert(
      Math.hypot(...padMoved.position.map((v, i) => v - looked.position[i])) >
        2,
      'controller flies instead of navigating menus',
    );
    await page.evaluate(() => {
      window.__editorPad.axes = [0, 0, 0, 0];
    });
    await pad(page, 1);
    await page.waitForFunction(
      () => !window.__VN_FRONTEND.getState().editor.flyActive,
    );
    assert.equal(
      await action(page, 'fly-camera').evaluate(
        (node) => node === document.activeElement,
      ),
      true,
    );
    assert.equal(
      await action(page, 'test').count(),
      1,
      'B exits camera without closing the editor',
    );
    await (await revealEditorAction(page, 'fly-camera')).click();
    await page.keyboard.press('Escape');
    assert.equal(
      await page.evaluate(
        () => window.__VN_FRONTEND.getState().editor.flyActive,
      ),
      false,
    );
    await (await revealEditorAction(page, 'view-map')).click();
    await page.locator('[data-editor-map-wrap]').waitFor({ state: 'visible' });
    assert.equal(
      await page.evaluate(() => window.__VN_FRONTEND.getState().editor.view),
      'world',
      'Map opens over the live world preview',
    );
    assert.equal(
      await page.evaluate(() => window.__VN_FRONTEND.getState().editor.mapOpen),
      true,
    );
    console.log(
      'PASS free camera keyboard flight, drag look, analog controller, Back and focus handoff',
    );
    console.log(
      'PASS owned 3D preview, controller camera',
      JSON.stringify({ ...preview, interaction: undefined }),
    );
    const beforeCareer = await page.evaluate(() =>
      Object.entries(localStorage)
        .filter(([key]) => key.includes('career'))
        .sort(),
    );
    await (await revealEditorAction(page, 'test')).click();
    await page.waitForFunction(
      () =>
        document.querySelector('#hud') &&
        !document.querySelector('#hud').classList.contains('hidden'),
      null,
      { timeout: 120000 },
    );
    await page.locator('#speed').waitFor();
    await page.waitForFunction(() => window.__VN?.ready, null, {
      timeout: 60000,
    });
    const before = await page.evaluate(() => window.__VN.getSnapshot());
    await page.keyboard.down('w');
    await page.waitForTimeout(3800);
    await page.keyboard.up('w');
    const after = await page.evaluate(() => window.__VN.getSnapshot());
    assert(
      after.vehicle.distance > before.vehicle.distance + 1,
      'actual physics drives the generated road',
    );
    assert(
      after.events.some(
        (event) =>
          event.type === 'pickup-activate' && event.payload?.kind === 'vector',
      ),
      'generated Vector activates in actual driving',
    );
    await page.keyboard.press('Escape');
    await page.locator('#pause-settings').click();
    await page.locator('[data-action="settings-back"]').click();
    await page.locator('#pause-panel:not(.hidden) #home').waitFor();
    assert.equal(
      await page.locator('#pause-panel').count(),
      1,
      'settings return has only the active practice controls',
    );
    assert.equal(await page.locator('#home').textContent(), 'Back to editor');
    await page.locator('#home').click();
    await action(page, 'test').waitFor();
    assert.deepEqual(
      await page.evaluate(() =>
        Object.entries(localStorage)
          .filter(([key]) => key.includes('career'))
          .sort(),
      ),
      beforeCareer,
    );
    assert.equal(
      await page
        .locator('[data-editor-action="test"]')
        .evaluate((node) => node === document.activeElement),
      true,
    );
    console.log(
      'PASS real test drive, Settings/back, draft/focus restore, career isolation',
    );
  }

  if (responsive) {
    if (await page.locator('[data-editor-map-wrap]').isVisible())
      await (await revealEditorAction(page, 'map-close')).tap();
    await page.waitForFunction(
      () =>
        window.__VN_FRONTEND.getState().editor?.preview?.estimatedGpuBytes > 0,
      null,
      { timeout: 60000 },
    );
    await (await revealEditorAction(page, 'zoom-in')).tap();
    await (await revealEditorAction(page, 'view-map')).tap();
    await page.locator('[data-editor-map-wrap]').waitFor({ state: 'visible' });
    assert.equal(
      await page.evaluate(() => window.__VN_FRONTEND.getState().editor.view),
      'world',
      'the narrow Map overlays the world preview',
    );
    await (await revealEditorAction(page, 'test')).tap();
    await page.waitForFunction(
      () =>
        window.__VN?.ready &&
        document.querySelector('#hud') &&
        !document.querySelector('#hud').classList.contains('hidden'),
      null,
      { timeout: 120000 },
    );
    await page.locator('.touch-power').waitFor();
    const power = await page.locator('.touch-power').boundingBox();
    const start = await page.evaluate(
      () => window.__VN.getSnapshot().vehicle.distance,
    );
    const touch = await context.newCDPSession(page);
    await touch.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [
        { x: power.x + power.width / 2, y: power.y + power.height * 0.37 },
      ],
    });
    await page.waitForTimeout(650);
    await touch.send('Input.dispatchTouchEvent', {
      type: 'touchEnd',
      touchPoints: [],
    });
    assert(
      (await page.evaluate(() => window.__VN.getSnapshot().vehicle.distance)) >
        start + 1,
    );
    await page.keyboard.press('Escape');
    await page.locator('#pause-panel').waitFor();
    assert.equal(await page.locator('#home').textContent(), 'Back to editor');
    await page.locator('#home').tap();
    await action(page, 'test').waitFor();
    await touch.detach();
    const layout = await page.evaluate(() => ({
      width: innerWidth,
      body: document.documentElement.scrollWidth,
      editor: document.querySelector('#track-editor-host').scrollWidth,
    }));
    assert(
      layout.body <= layout.width && layout.editor <= layout.width,
      'responsive controls stay within viewport width',
    );
    console.log(
      'PASS responsive preview, real touch driving, pause and editable draft return',
    );
  }
  await page.reload();
  await entry.waitFor({ timeout: 90000 });
  await entry.click();
  await enterRecoveredWorkspace(page);
  await openEditorSection(page, 'library');
  await page.waitForFunction(
    () =>
      document.querySelector('[data-editor-field="saved"]')?.options.length ===
      2,
  );
  await (await revealEditorField(page, 'saved')).selectOption(originalId);
  await (await revealEditorAction(page, 'load')).click();
  await page.waitForFunction(() =>
    document
      .querySelector('[data-editor-status]')
      ?.textContent.includes('Track loaded'),
  );
  await roadDetails(page);
  assert.equal(
    await field(page, 'name').inputValue(),
    'Nightweir verification',
  );
  assert.equal(
    Number(await field(page, 'point-x').inputValue()),
    Number(edited.points[0].x.toFixed(1)),
  );
  assert.equal(
    (await savedDocuments(page)).find((doc) => doc.id === originalId).settings
      .sceneryPreset,
    'industrial',
  );
  assert.equal(
    await page.evaluate(
      () => window.__VN_FRONTEND.getState().editor.pickupCount,
    ),
    pickupCount,
  );
  await (await revealEditorAction(page, 'save')).click();
  const reloaded = (await savedDocuments(page)).find(
    (doc) => doc.id === originalId,
  );
  assert.deepEqual(reloaded.pickups.devices, exported.pickups.devices);
  assert.deepEqual(
    reloaded.points.map((point) => point.roll),
    exported.points.map((point) => point.roll),
  );
  await (await revealEditorAction(page, 'exit')).focus();
  await pad(page, 0);
  await entry.waitFor();
  assert.equal(
    await entry.evaluate((node) => node === document.activeElement),
    true,
  );
  if (!responsive) {
    await page.locator('[data-action="practice"]').click();
    await page.locator('[data-action="launch"]').click();
    await page.waitForFunction(
      () =>
        window.__VN?.ready &&
        !window.__VN.getSnapshot().track.id.startsWith('custom-'),
      null,
      { timeout: 120000 },
    );
    await page.locator('#speed').waitFor();
    await page.keyboard.down('w');
    await page.waitForTimeout(450);
    await page.keyboard.up('w');
    await page.keyboard.press('Escape');
    const retained = await page.evaluate(() => window.__VN.getSnapshot());
    await page.locator('#home').click();
    await entry.click();
    await action(page, 'test').waitFor({ timeout: 90000 });
    await (await revealEditorAction(page, 'test')).click();
    await page.waitForFunction(
      () =>
        window.__VN?.ready &&
        window.__VN.getSnapshot().track.id.startsWith('custom-'),
      null,
      { timeout: 120000 },
    );
    await page.locator('#speed').waitFor();
    await page.keyboard.press('Escape');
    await page.locator('#home').click();
    await action(page, 'test').waitFor();
    await (await revealEditorAction(page, 'exit')).click();
    await page.locator('[data-action="resume-session"]').click();
    await page.locator('#pause-panel:not(.hidden) #resume').waitFor();
    const restored = await page.evaluate(() => window.__VN.getSnapshot());
    assert.equal(restored.track.id, retained.track.id);
    assert.equal(restored.vehicle.distance, retained.vehicle.distance);
    assert.equal(restored.mode, 'paused');
    console.log(
      'PASS retained campaign practice survives custom driving unchanged',
    );
  }
  assert.deepEqual(errors, []);
  console.log(
    `PASS reload and exact hand-edit recovery, controller exit/focus (${responsive ? '390x844 responsive' : '1440x1000 desktop'})`,
  );
} catch (error) {
  console.error(error.stack || error);
  console.error(
    'EDITOR DIAGNOSTIC',
    errors,
    await context.pages()[0]?.locator('body').innerText(),
  );
  throw error;
} finally {
  clearTimeout(watchdog);
  await context.close();
  await browser.close();
}
