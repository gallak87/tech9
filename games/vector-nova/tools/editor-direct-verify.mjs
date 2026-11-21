import assert from 'node:assert/strict';
import * as T from 'three';
import {
  revealEditorField,
  revealEditorAction,
  openEditorSection,
  enterRecoveredWorkspace,
} from './editor-controls.mjs';
import {
  createDocument,
  generateDocument,
  GENERATOR_VERSION,
} from '../src/editor/document.js';
import {
  createCareerSlots,
  createMemoryStorage,
} from '../src/progression/careers.js';
import {
  launchVerificationBrowser,
  collectPageErrors,
} from './verification-browser.mjs';

// Exercise the public interface with actual pointer gestures and native controls.
const base = process.env.VN_URL;
if (!base) throw new Error('Set VN_URL to the isolated editor server.');
const responsive = process.argv.includes('--responsive');
const storage = createMemoryStorage();
createCareerSlots({ storage: () => storage, now: () => 1 }).create(1);
const entries = Array.from({ length: storage.length }, (_, i) => {
  const key = storage.key(i);
  return [key, storage.getItem(key)];
});
const browser = await launchVerificationBrowser();
const context = await browser.newContext({
  viewport: responsive
    ? { width: 390, height: 844 }
    : { width: 1440, height: 1000 },
  hasTouch: responsive,
});
const faults = [];
const watchdog = setTimeout(() => {
  console.error('Direct editor verification exceeded five minutes');
  process.exit(1);
}, 300000);
const action = (page, name) =>
  page.locator(`[data-editor-action="${name}"]`).first();
const field = (page, name) => page.locator(`[data-editor-field="${name}"]`);
const state = (page) =>
  page.evaluate(() => window.__VN_FRONTEND.getState().editor);
async function change(page, name, value) {
  const control = await revealEditorField(page, name);
  if (await control.evaluate((el) => el.tagName === 'SELECT'))
    await control.selectOption(String(value));
  else {
    await control.fill(String(value));
    await control.press('Tab');
  }
}
async function save(page) {
  await (await revealEditorAction(page, 'save')).click();
  await page.waitForFunction(() =>
    document
      .querySelector('[data-editor-status]')
      ?.textContent.includes('Track saved'),
  );
  return page.evaluate(() =>
    Object.keys(localStorage)
      .filter((key) => key.startsWith('vector-nova.tracks.v1.'))
      .map((key) => JSON.parse(localStorage.getItem(key)).document)
      .find((doc) => doc.name === 'Direct manipulation verification'),
  );
}
async function ready(page) {
  await page.waitForFunction(
    () => {
      const editor = window.__VN_FRONTEND.getState().editor;
      return !editor?.busy && editor?.preview?.worldReady;
    },
    null,
    { timeout: 90000 },
  );
  await page.evaluate(
    () =>
      new Promise((done) =>
        requestAnimationFrame(() => requestAnimationFrame(done)),
      ),
  );
}
function project(point, preview, rect) {
  const camera = new T.PerspectiveCamera(
    48,
    rect.width / rect.height,
    0.5,
    200000,
  );
  camera.position.fromArray(preview.camera.position);
  camera.quaternion.fromArray(preview.camera.quaternion);
  camera.updateMatrixWorld();
  const p = new T.Vector3(point.x, point.y, point.z).project(camera);
  return {
    x: rect.x + ((p.x + 1) / 2) * rect.width,
    y: rect.y + ((1 - p.y) / 2) * rect.height,
    visible: p.z > -1 && p.z < 1 && Math.abs(p.x) < 0.8 && Math.abs(p.y) < 0.7,
  };
}
try {
  await context.routeWebSocket('**/*', () => {});
  await context.addInitScript((seed) => {
    for (const [key, value] of seed) localStorage.setItem(key, value);
    localStorage.setItem('startUpMusicOn', 'false');
    localStorage.setItem(
      'vector-nova.settings',
      JSON.stringify({ quality: 'low', volume: 0, reducedMotion: true }),
    );
  }, entries);
  const page = await context.newPage();
  collectPageErrors(page, faults);
  await page.goto(new URL('?intro=0&editor=1', base).href);
  await page.waitForFunction(
    () =>
      (document.body.dataset.screen === 'editor' &&
        document.querySelector('[data-editor-field="name"]')) ||
      document.querySelector('.loading-page .transfer-status.failed'),
    null,
    { timeout: 90000 },
  );
  assert.equal(
    await field(page, 'name').count(),
    1,
    await page.locator('body').innerText(),
  );
  await change(page, 'name', 'Direct manipulation verification');
  assert.equal(
    (await state(page)).view,
    'world',
    '3D is the primary editing view',
  );
  for (const [width, height] of responsive
    ? [[390, 844]]
    : [
        [1100, 720],
        [1440, 1000],
        [1920, 1080],
      ]) {
    await page.setViewportSize({ width, height });
    assert(await page.locator('[data-music-player].is-collapsed').isVisible());
    for (const name of ['save', 'test', 'undo', 'redo']) {
      assert(await action(page, name).isVisible(), `${name} stays visible`);
      assert(
        await action(page, name).evaluate((el) => {
          const r = el.getBoundingClientRect();
          return el.contains(
            document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2),
          );
        }),
        `${name} is not covered by another overlay`,
      );
    }
    await action(page, 'draw-mode').focus();
    await page.keyboard.press('/');
    await page.locator('[data-music-player]').waitFor({ state: 'visible' });
    const musicBox = await page.locator('[data-music-player]').boundingBox();
    assert(
      musicBox.y < 32 && musicBox.x + musicBox.width > width * 0.9,
      'Tunes uses the game transport in the upper right',
    );
    for (const name of ['save', 'test'])
      assert(
        await action(page, name).evaluate((el) => {
          const r = el.getBoundingClientRect();
          return (
            el.disabled ||
            el.contains(
              document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2),
            )
          );
        }),
        `Tunes does not cover ${name}`,
      );
    await page.keyboard.press('Escape');
    assert(await page.locator('[data-music-player].is-collapsed').isVisible());
    assert(
      await action(page, 'draw-mode').evaluate(
        (el) => el === document.activeElement,
      ),
    );
  }
  if (!responsive) await page.setViewportSize({ width: 1440, height: 1000 });
  await ready(page);
  await action(page, 'draw-mode').focus();
  await page.keyboard.press('/');
  await page.locator('[data-music-player]').waitFor({ state: 'visible' });
  await (await revealEditorAction(page, 'view-map')).focus();
  await page.keyboard.press('Enter');
  await page.locator('[data-editor-map-wrap]').waitFor({ state: 'visible' });
  assert(await page.locator('[data-music-player].is-collapsed').isVisible());
  assert.equal((await state(page)).view, 'world');
  assert.equal((await state(page)).mapOpen, true);
  assert(
    await action(page, 'map-close').evaluate(
      (el) => el === document.activeElement,
    ),
    'keyboard opening Map leaves focus in the Map dialog',
  );
  await page.keyboard.press('Escape');
  assert.equal((await state(page)).mapOpen, false);
  assert(
    await action(page, 'view-map').evaluate(
      (el) => el === document.activeElement,
    ),
    'closing Map returns focus to its permanent button',
  );
  console.log(
    'PASS clear primary toolbar, Tunes placement and keyboard Map/Tunes exclusivity',
  );

  await (await revealEditorAction(page, 'quick-start')).focus();
  await page.keyboard.press('Enter');
  await ready(page);
  assert(
    (await state(page)).jumpCount > 0,
    'one-click starter includes a real jump',
  );
  assert(
    (await state(page)).pickupCount > 0,
    'the starter is already filled with pickups',
  );
  assert(await action(page, 'test').isEnabled());
  await openEditorSection(page, 'jumps');
  if (!(await field(page, 'jump-selected').isVisible()))
    await page.getByText(/^Your jumps · \d+$/).click();
  assert(
    await field(page, 'jump-selected').isVisible(),
    'Your jumps opens the gap inspector',
  );
  if (!responsive) {
    await (await revealEditorAction(page, 'focus-selection')).click();
    await ready(page);
    const before = (await state(page)).preview.camera;
    await (await revealEditorAction(page, 'context-raise')).click();
    await (await revealEditorAction(page, 'undo')).click();
    await ready(page);
    assert.deepEqual(
      (await state(page)).preview.camera.position,
      before.position,
      'Undo preserves the focused camera',
    );
    await (await revealEditorAction(page, 'redo')).click();
    await ready(page);
    assert.deepEqual(
      (await state(page)).preview.camera.position,
      before.position,
      'Redo preserves the focused camera',
    );
    await (await revealEditorAction(page, 'undo')).click();
  }
  await openEditorSection(page, 'generate');
  await (await revealEditorAction(page, 'blank')).click();
  await ready(page);
  await change(page, 'name', 'Direct manipulation verification');
  console.log(
    'PASS one-click starter, automatic pickups, direct Jumps and stable history camera',
  );

  if (!responsive) {
    await page.setViewportSize({ width: 1440, height: 900 });
    await ready(page);
    await (await revealEditorAction(page, 'draw-mode')).click();
    for (const [x, y] of [
      [490, 540],
      [700, 580],
      [860, 650],
      [650, 740],
    ]) {
      await page.mouse.click(x, y);
    }
    assert.equal(
      (await state(page)).points,
      4,
      'blank road is drawn with four clicks',
    );
    await (await revealEditorAction(page, 'finish-drawing')).click();
    assert.equal(
      (await state(page)).drawMode,
      false,
      'Finish drawing enters road editing',
    );
    assert(
      Number.isInteger((await state(page)).focusedIssue?.pointIndex),
      'a pinched corner is identified',
    );
    await (await revealEditorAction(page, 'show-issue')).click();
    assert.equal(
      (await state(page)).selectedPoint,
      (await state(page)).focusedIssue.pointIndex,
    );
    await (await revealEditorAction(page, 'spread-road')).click();
    await ready(page);
    assert(
      await action(page, 'test').isEnabled(),
      'one explicit repair gives the novice drawing enough physical room',
    );
    await (await revealEditorAction(page, 'test')).click();
    await page.waitForFunction(
      () =>
        window.__VN?.ready &&
        !document.querySelector('#hud')?.classList.contains('hidden'),
      null,
      { timeout: 120000 },
    );
    await page.keyboard.down('w');
    await page.waitForTimeout(250);
    await page.keyboard.up('w');
    await page.keyboard.press('Escape');
    await page
      .getByRole('button', { name: 'Back to editor', exact: true })
      .click();
    await action(page, 'test').waitFor();
    await ready(page);
    await (await revealEditorAction(page, 'view-map')).click();
    await page.locator('[data-editor-map-wrap]').waitFor({ state: 'visible' });
    assert.equal((await state(page)).view, 'world');
    assert.equal((await state(page)).mapOpen, true);
    assert(await page.locator('[data-editor-world]').isVisible());
    const mapPoints = await page
      .locator('[data-map-point]')
      .evaluateAll((nodes) =>
        nodes.map((node) => {
          const m = node.transform.baseVal.consolidate().matrix;
          return [m.e, m.f];
        }),
      );
    assert.equal(mapPoints.length, 4);
    assert(
      mapPoints.every(([x, y]) => x > 12 && x < 988 && y > 12 && y < 668),
      'Map opens with the full road visible',
    );
    const cameraBeforeMapSelection = (await state(page)).preview.camera;
    await page.locator('[data-map-point="1"] circle').click();
    assert.equal((await state(page)).selectedPoint, 1);
    assert.equal((await state(page)).view, 'world');
    assert.equal((await state(page)).mapOpen, true);
    assert.deepEqual(
      (await state(page)).preview.camera.position,
      cameraBeforeMapSelection.position,
      'Map selection preserves the underlying 3D camera',
    );
    await (await revealEditorAction(page, 'map-close')).click();
    assert.equal((await state(page)).mapOpen, false);
    await page.setViewportSize({ width: 1440, height: 1000 });
    await ready(page);
    console.log(
      'PASS novice four-click drawing, focused feedback, one-click repair and fitted Map',
    );
  } else {
    const fixture = createDocument({ blank: true });
    fixture.name = 'Direct manipulation verification';
    fixture.points = [
      { id: 'p-a', x: -420, y: 52, z: -90, bank: 0 },
      { id: 'p-b', x: 20, y: 52, z: -20, bank: 0 },
      { id: 'p-c', x: 420, y: 52, z: 90, bank: 0 },
      { id: 'p-d', x: 0, y: 52, z: 260, bank: 0 },
    ];
    await openEditorSection(page, 'library');
    const chooser = page.waitForEvent('filechooser');
    await (await revealEditorAction(page, 'import')).click();
    await (
      await chooser
    ).setFiles({
      name: 'pinched-road.vntrack.json',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify(fixture)),
    });
    await page.waitForFunction(() =>
      document
        .querySelector('[data-editor-status]')
        ?.textContent.includes('Track imported'),
    );
    await ready(page);
    await openEditorSection(page, 'warnings');
    for (const name of ['show-issue', 'spread-road']) {
      const box = await action(page, name).boundingBox();
      assert(box && box.x >= 0 && box.x + box.width <= 390, `${name} fits`);
      assert(
        await action(page, name).evaluate((el) => {
          const r = el.getBoundingClientRect();
          return el.contains(
            document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2),
          );
        }),
        `${name} is available to touch`,
      );
    }
    await (await revealEditorAction(page, 'spread-road')).tap();
    await ready(page);
    assert(
      await action(page, 'test').isEnabled(),
      'touch repair opens the road',
    );
    assert.equal(
      await page.evaluate(() => document.body.scrollWidth),
      390,
      'repair feedback does not overflow the viewport',
    );
    console.log('PASS visible touch repair actions on a narrow invalid road');
  }

  await openEditorSection(page, 'generate');
  await change(page, 'course-type', 'circuit');
  await change(page, 'seed', 42017);
  await change(page, 'length', 3000);
  await change(page, 'jump-frequency', 'normal');
  await change(page, 'jump-size', 'mixed');
  await (await revealEditorAction(page, 'generate')).click();
  await ready(page);
  let doc = await save(page);
  assert.equal(
    doc.generator.version,
    GENERATOR_VERSION,
    'public Generate uses the current varied layout',
  );
  assert(
    doc.jumps.length > 0,
    'the ordinary circuit includes real seeded jumps',
  );
  // Fixed return-bend pointer targets below intentionally exercise the v2 fixture.
  const legacy = generateDocument({
    generatorVersion: 2,
    seed: 42017,
    length: 3000,
    courseType: 'circuit',
  });
  legacy.id = doc.id;
  legacy.name = doc.name;
  await openEditorSection(page, 'library');
  const legacyChooser = page.waitForEvent('filechooser');
  await (await revealEditorAction(page, 'import')).click();
  await (
    await legacyChooser
  ).setFiles({
    name: 'legacy-pointer.vntrack.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(legacy)),
  });
  await page.waitForFunction(() =>
    document
      .querySelector('[data-editor-status]')
      ?.textContent.includes('Track imported'),
  );
  await ready(page);
  doc = await save(page);
  await openEditorSection(page, 'jumps');
  await change(page, 'jump-receiving', 600);
  assert(
    await field(page, 'jump-receiving').isVisible(),
    'new jump controls remain directly available while editing',
  );
  await (await revealEditorAction(page, 'clear-jumps')).click();
  assert.equal(
    (await state(page)).jumpCount,
    0,
    'clear all restores supported road',
  );
  await (await revealEditorAction(page, 'undo')).click();
  assert.deepEqual(
    (await save(page)).jumps,
    doc.jumps,
    'Undo restores all seeded gaps',
  );
  await ready(page);
  if (!responsive) {
    await (await revealEditorAction(page, 'fit')).click();
    await ready(page);
    const canvas = page.locator('[data-editor-world] canvas');
    const box = await canvas.boundingBox();
    const preview = (await state(page)).preview;
    const a = doc.points[doc.points.length - 14],
      b = doc.points[doc.points.length - 13];
    const between = project(
      { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, z: (a.z + b.z) / 2 },
      preview,
      box,
    );
    assert(between.visible, 'ordinary road is visible for insertion');
    await page.mouse.dblclick(between.x, between.y);
    assert.equal(
      (await state(page)).points,
      doc.points.length + 1,
      'double-click on road inserts a point in Select mode',
    );
    await (await revealEditorAction(page, 'undo')).click();
    assert.deepEqual(
      await save(page),
      doc,
      'Undo restores the complete road after insertion',
    );
    await ready(page);
    const positions = doc.points.map((p) => project(p, preview, box));
    const index = positions.findIndex(
      (p, i) =>
        p.visible &&
        positions.every(
          (q, j) => i === j || Math.hypot(q.x - p.x, q.y - p.y) > 28,
        ),
    );
    assert(index >= 0, 'a clear road handle is visible after framing');
    const point = positions[index];
    await page.mouse.move(point.x, point.y);
    await page.mouse.down();
    await page.mouse.move(point.x + 55, point.y + 25, { steps: 12 });
    await page.mouse.up();
    assert.equal(
      (await state(page)).selectedPoint,
      index,
      '3D handle selects the point',
    );
    let moved = await save(page);
    assert(
      Math.hypot(
        moved.points[index].x - doc.points[index].x,
        moved.points[index].z - doc.points[index].z,
      ) > 5,
      'drag moves road geometry',
    );
    await (await revealEditorAction(page, 'undo')).click();
    assert.deepEqual(
      (await save(page)).points,
      doc.points,
      'one Undo restores the whole drag',
    );
    const active = (await state(page)).preview.interaction.points[index];
    const movedBox = await canvas.boundingBox();
    await page.mouse.move(movedBox.x + active.x, movedBox.y + active.y);
    await page.mouse.down();
    await page.mouse.move(
      movedBox.x + active.x + 40,
      movedBox.y + active.y - 15,
      { steps: 6 },
    );
    await canvas.dispatchEvent('pointercancel', { pointerId: 1 });
    await page.mouse.up();
    assert.deepEqual(
      (await save(page)).points,
      doc.points,
      'cancelled pointer transaction restores the draft',
    );
    await (await revealEditorAction(page, 'context-raise')).click();
    moved = await save(page);
    assert(
      moved.points[index].y > doc.points[index].y,
      'selection has immediate elevation controls',
    );
    await (await revealEditorAction(page, 'undo')).click();
    await ready(page);
    const height = (await state(page)).preview.interaction.heightHandle;
    const heightBox = await canvas.boundingBox();
    assert(height.visible, 'selected point has a visible height handle');
    await page.mouse.move(heightBox.x + height.x, heightBox.y + height.y);
    await page.mouse.down();
    await page.mouse.move(heightBox.x + height.x, heightBox.y + height.y - 35, {
      steps: 8,
    });
    await page.mouse.up();
    assert(
      (await save(page)).points[index].y > doc.points[index].y,
      'height handle changes actual elevation',
    );
    await (await revealEditorAction(page, 'undo')).click();
    await ready(page);
    const rangeBox = await canvas.boundingBox();
    const handles = (await state(page)).preview.interaction.points;
    const from = handles[doc.points.length - 14],
      to = handles[doc.points.length - 3];
    assert(from.visible && to.visible, 'return-bend section is visible');
    await page.mouse.click(rangeBox.x + from.x, rangeBox.y + from.y);
    await page.keyboard.down('Shift');
    await page.mouse.click(rangeBox.x + to.x, rangeBox.y + to.y);
    await page.keyboard.up('Shift');
    await page.evaluate(
      () => new Promise((done) => requestAnimationFrame(done)),
    );
    assert(
      (await state(page)).selectionRange,
      'Shift-click selects a road section',
    );
    assert(
      (await state(page)).preview.interaction.span,
      'selected section is highlighted in 3D',
    );
    await openEditorSection(page, 'shape');
    await page.getByRole('button', { name: 'Twist section right' }).click();
    const shapeStatus = await page.locator('[data-editor-status]').innerText();
    const shaped = await save(page);
    assert(
      shaped.points.some((p) => Math.abs(p.roll ?? 0) > 0.01),
      shapeStatus,
    );
    assert(
      await action(page, 'test').isEnabled(),
      'automatic circuit return keeps a shaped seeded course drivable',
    );
    await (await revealEditorAction(page, 'undo')).click();
    assert.deepEqual(
      await save(page),
      doc,
      'contextual shape and its automatic return are a single undoable edit',
    );
    const orbitBox = await canvas.boundingBox();
    const cameraBefore = (await state(page)).preview.camera;
    await page.mouse.move(
      orbitBox.x + orbitBox.width / 2,
      orbitBox.y + orbitBox.height / 2,
    );
    await page.mouse.down({ button: 'right' });
    await page.mouse.move(
      orbitBox.x + orbitBox.width / 2 + 70,
      orbitBox.y + orbitBox.height / 2 + 30,
      { steps: 8 },
    );
    await page.mouse.up({ button: 'right' });
    assert.notDeepEqual(
      (await state(page)).preview.camera.quaternion,
      cameraBefore.quaternion,
      'right drag orbits',
    );
    assert.deepEqual(
      (await save(page)).points,
      doc.points,
      'camera gesture does not edit road',
    );
    console.log(
      'PASS 3D selection/drag/cancel, height handle, highlighted section, contextual rotation and single-step Undo',
    );
  }

  await openEditorSection(page, 'world');
  assert(
    await page
      .locator('[data-editor-global-tools]')
      .evaluate((el) => el.scrollTop < 1),
    'opening a new tool starts at the top instead of inheriting another panel scroll',
  );
  const roadBeforeWorld = doc.points;
  for (const preset of ['industrial', 'reclaimed', 'waterfront']) {
    await (await revealEditorAction(page, `preset-${preset}`)).click();
    await (await revealEditorAction(page, 'regenerate-environment')).click();
    await ready(page);
    const themed = await save(page);
    assert.equal(themed.settings.sceneryPreset, preset);
    assert.deepEqual(
      themed.points,
      roadBeforeWorld,
      'world choices preserve the authored road',
    );
    assert.deepEqual(
      themed.jumps,
      doc.jumps,
      'world choices preserve jump geometry',
    );
  }
  const beforeWorldSeed = await save(page);
  await (await revealEditorAction(page, 'new-world-seed')).click();
  await ready(page);
  const reseededWorld = await save(page);
  assert.notEqual(
    reseededWorld.environment.seed,
    beforeWorldSeed.environment.seed,
  );
  assert.equal(reseededWorld.generator.seed, beforeWorldSeed.generator.seed);
  assert.deepEqual(
    reseededWorld.points,
    beforeWorldSeed.points,
    'world reseeding leaves road intact',
  );
  await (await revealEditorAction(page, 'undo')).click();
  assert.equal(
    (await save(page)).environment.seed,
    beforeWorldSeed.environment.seed,
  );
  assert.equal(
    await action(page, 'add-prop').count(),
    0,
    'the world flow does not require individual object placement',
  );
  console.log(
    'PASS three seeded world presets, independent scenery reseeding, persistence and Undo',
  );

  if (!(await field(page, 'length').isVisible()))
    await openEditorSection(page, 'generate');
  await change(page, 'length', 5000);
  await (await revealEditorAction(page, 'generate')).click();
  await ready(page);
  const regenerated = await save(page);
  assert.equal(
    regenerated.generator.version,
    GENERATOR_VERSION,
    'regeneration returns to the current layout',
  );
  assert(regenerated.jumps.length > 0, 'long circuit includes seeded jumps');

  for (const length of responsive
    ? [20000]
    : [3000, 5000, 10000, 15000, 20000]) {
    if (!(await field(page, 'length').isVisible()))
      await openEditorSection(page, 'generate');
    await change(page, 'course-type', 'downhill');
    await change(page, 'length', length);
    await (await revealEditorAction(page, 'generate')).click();
    await ready(page);
    doc = await save(page);
    assert.equal(doc.generator.length, length);
    assert.equal(doc.jumps.length, length < 10000 ? 3 : 4);
    assert.equal(
      await action(page, 'test').isEnabled(),
      true,
      `${length} m seed passes course checks`,
    );
    const metrics = (await state(page)).preview;
    console.log(
      `PASS ${length / 1000} km downhill: ${doc.jumps.length} jumps; preview ${metrics.triangles} triangles / ${metrics.calls} draw calls`,
    );
  }
  await (await revealEditorAction(page, 'view-map')).click();
  await page.locator('[data-editor-map-wrap]').waitFor({ state: 'visible' });
  assert.equal((await state(page)).view, 'world');
  assert.equal((await state(page)).mapOpen, true);
  assert(await page.locator('[data-editor-world]').isVisible());
  const fitted = await page.locator('[data-map-point]').evaluateAll((nodes) =>
    nodes.map((node) => {
      const m = node.transform.baseVal.consolidate().matrix;
      return [m.e, m.f];
    }),
  );
  assert(
    fitted.every(([x, y]) => x > 24 && x < 976 && y > 24 && y < 656),
    'a20kmMap includes screen space for every handle and endpoint label',
  );
  await (await revealEditorAction(page, 'map-close')).click();
  await ready(page);
  if (!responsive) {
    const careerBefore = await page.evaluate(() =>
      Object.entries(localStorage)
        .filter(([key]) => key.includes('career'))
        .sort(),
    );
    await (await revealEditorAction(page, 'test')).click();
    await page.waitForFunction(
      () =>
        window.__VN?.ready &&
        !document.querySelector('#hud')?.classList.contains('hidden'),
      null,
      { timeout: 120000 },
    );
    const course = await page.evaluate(() => {
      const track = window.__VN.getTrack();
      return {
        length: track.length,
        finish: track.finishDistance,
        jumps: track.jumps.length,
      };
    });
    assert(Math.abs(course.length - 20000) < 50);
    assert.equal(Math.round(course.length - course.finish), 600);
    assert.equal(course.jumps, 4);
    for (let index = 0; index < course.jumps; index++) {
      await page.evaluate((index) => {
        const api = window.__VN,
          track = api.getTrack(),
          jump = track.jumps[index];
        track.scenarios['seeded-browser-approach'] = {
          distance: jump.takeoff - 20,
          speed: api.getSnapshot().handling.cruiseSpeed,
          lateral: 0,
          heading: 0,
          energy: 100,
        };
        api.loadScenario('seeded-browser-approach', 7);
        api.pause();
      }, index);
      await page.locator('#resume').click();
      await page.keyboard.down('w');
      await page.waitForFunction(
        () =>
          window.__VN
            .getSnapshot()
            .events.some(
              (event) =>
                event.type === 'jump-transfer' || event.type === 'jump-miss',
            ),
        null,
        { timeout: 25000 },
      );
      await page.keyboard.up('w');
      const flown = await page.evaluate(() => window.__VN.getSnapshot());
      assert(flown.events.some((event) => event.type === 'jump-launch'));
      assert(
        flown.events.some(
          (event) =>
            event.type === 'jump-transfer' &&
            event.payload.outcome === 'landed',
        ),
        JSON.stringify(flown.events),
      );
      assert.equal(flown.vehicle.resetCount, 0);
    }
    console.log(
      'PASS actual 20 km world, all four generated jump landings and supported 600 m finish runout',
    );
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('#home').textContent(), 'Back to editor');
    await page.locator('#home').click();
    await action(page, 'test').waitFor();
    assert.deepEqual(
      await page.evaluate(() =>
        Object.entries(localStorage)
          .filter(([key]) => key.includes('career'))
          .sort(),
      ),
      careerBefore,
    );
  }
  await page.reload();
  await enterRecoveredWorkspace(page);
  await openEditorSection(page, 'library');
  await page.waitForFunction(
    (id) =>
      [...document.querySelectorAll('[data-editor-field="saved"] option')].some(
        (option) => option.value === id,
      ),
    doc.id,
  );
  await (await revealEditorField(page, 'saved')).selectOption(doc.id);
  await (await revealEditorAction(page, 'load')).click();
  await ready(page);
  const loaded = await save(page);
  assert.deepEqual(loaded.points, doc.points);
  assert.deepEqual(loaded.jumps, doc.jumps);
  assert.deepEqual(loaded.settings, doc.settings);
  console.log(
    'PASS saved 20 km geometry, jumps and world preset survive browser reload',
  );
  assert.deepEqual(faults, []);
} finally {
  clearTimeout(watchdog);
  await context.close();
  await browser.close();
}
