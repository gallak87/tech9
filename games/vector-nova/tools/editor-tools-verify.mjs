import assert from 'node:assert/strict';
import * as T from 'three';
import { routeCurve } from '../src/editor/route.js';
import { generateDocument } from '../src/editor/document.js';
import {
  createCareerSlots,
  createMemoryStorage,
} from '../src/progression/careers.js';
import {
  collectPageErrors,
  launchVerificationBrowser,
} from './verification-browser.mjs';

// Public controls, real pointer gestures, and documents written by Save.
const base = process.env.VN_URL;
if (!base) throw new Error('Set VN_URL to the isolated editor server.');
const responsive = process.argv.includes('--responsive');
const name = 'Editor tool verification';
const tools = [
  ['draw', 'draw-mode', 'd'],
  ['move', 'select-mode', 'v'],
  ['height', 'height-mode', 'h'],
  ['orbit', 'orbit-mode', 'o'],
  ['pan', 'pan-mode', 'p'],
];
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
    : { width: 1440, height: 900 },
  hasTouch: responsive,
});
const faults = [];
const watchdog = setTimeout(() => {
  console.error('Editor tool verification exceeded five minutes');
  process.exit(1);
}, 300000);
const action = (page, value) =>
  page.locator(`[data-editor-action="${value}"]`).first();
const state = (page) =>
  page.evaluate(() => window.__VN_FRONTEND.getState().editor);
const canvas = (page) => page.locator('[data-editor-world] canvas');

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

async function save(page, trackName = name) {
  await action(page, 'save').click();
  await page.waitForFunction(() =>
    document
      .querySelector('[data-editor-status]')
      ?.textContent.includes('Track saved'),
  );
  const doc = await page.evaluate(
    (trackName) =>
      Object.keys(localStorage)
        .filter((key) => key.startsWith('vector-nova.tracks.v1.'))
        .map((key) => JSON.parse(localStorage.getItem(key)).document)
        .find((value) => value.name === trackName),
    trackName,
  );
  assert(doc, 'Save writes the authored track to the public track library');
  return doc;
}

async function importTrack(page, document) {
  await action(page, 'tab-library').click();
  const choose = page.waitForEvent('filechooser', { timeout: 20000 });
  await action(page, 'import').click();
  await (
    await choose
  ).setFiles({
    name: 'editor-warning.vntrack.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(document)),
  });
  await page.waitForFunction(() =>
    document
      .querySelector('[data-editor-status]')
      ?.textContent.includes('Track imported'),
  );
  await action(page, 'panel-close').click();
  await ready(page);
}

async function expectTool(page, id) {
  assert.equal((await state(page)).tool, id, `${id} stays the active tool`);
  assert.equal((await state(page)).drawMode, id === 'draw');
  const active = page.locator(
    '[data-editor-tool-palette] button[aria-pressed="true"]',
  );
  assert.equal(await active.count(), 1, 'exactly one palette tool is pressed');
  assert.equal(await active.getAttribute('data-editor-tool'), id);
  assert.equal(
    await active.evaluate((el) => el.tagName),
    'BUTTON',
    'tool selection uses a native button',
  );
}

async function pad(page, index) {
  await page.evaluate(async (button) => {
    window.__editorToolsPad.buttons[button] = { pressed: true, value: 1 };
    await new Promise((done) =>
      requestAnimationFrame(() => requestAnimationFrame(done)),
    );
    window.__editorToolsPad.buttons[button] = { pressed: false, value: 0 };
    await new Promise((done) =>
      requestAnimationFrame(() => requestAnimationFrame(done)),
    );
  }, index);
}

async function drag(page, from, dx, dy) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x + dx, from.y + dy, { steps: 10 });
  await page.mouse.up();
}

async function handle(page, kind = 'point') {
  await ready(page);
  const editor = await state(page);
  const point =
    kind === 'height'
      ? editor.preview.interaction.heightHandle
      : editor.preview.interaction.points[editor.selectedPoint];
  assert(point?.visible, `${kind} handle is visible for the actual gesture`);
  const box = await canvas(page).boundingBox();
  return { x: box.x + point.x, y: box.y + point.y };
}

async function mapPoint(page, index) {
  return page.locator(`[data-map-point="${index}"]`).evaluate((el) => {
    const p = new DOMPoint(0, 0).matrixTransform(el.getScreenCTM());
    return { x: p.x, y: p.y };
  });
}

async function mapClick(page, x, y) {
  const point = await page.locator('#workshop-route-map').evaluate(
    (el, p) => {
      const screen = new DOMPoint(p.x, p.y).matrixTransform(el.getScreenCTM());
      return { x: screen.x, y: screen.y };
    },
    { x, y },
  );
  await page.mouse.click(point.x, point.y);
}

function expectHeightOnly(before, after, index) {
  assert(
    after.points[index].y > before.points[index].y,
    'drag raises the road',
  );
  const restored = structuredClone(after);
  restored.points[index].y = before.points[index].y;
  assert.deepEqual(
    restored,
    before,
    'height dragging changes only the selected Y',
  );
}

async function paletteLayout(page) {
  for (const [id, value] of tools) {
    const button = action(page, value);
    assert(await button.isVisible(), `${id} is visible in the preview palette`);
    assert(
      await button.evaluate((el) => {
        const r = el.getBoundingClientRect();
        return (
          r.x >= 0 &&
          r.y >= 0 &&
          r.right <= innerWidth &&
          r.bottom <= innerHeight &&
          el.contains(
            document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2),
          )
        );
      }),
      `${id} fits and is not covered by the canvas or another overlay`,
    );
  }
  assert(
    await action(page, 'reset-track').isVisible(),
    'Reset track is visible',
  );
  const normal = await action(page, 'select-mode').evaluate((el) => ({
    border: getComputedStyle(el).borderLeftColor,
    background: getComputedStyle(el).backgroundColor,
  }));
  const pressed = await action(page, 'draw-mode').evaluate((el) => ({
    border: getComputedStyle(el).borderLeftColor,
    background: getComputedStyle(el).backgroundColor,
  }));
  assert.notDeepEqual(
    pressed,
    normal,
    'the active tool has a visible pressed style',
  );
}

async function warningRepair(page, fixture) {
  fixture.name = 'Editor warning verification';
  await importTrack(page, fixture);
  const before = await save(page, fixture.name);
  const issue = (await state(page)).primaryIssue;
  assert.equal(
    issue?.kind,
    'bend',
    'the imported generated road has a tight-corner warning',
  );
  assert.equal(await action(page, 'test').isEnabled(), false);
  assert.match(
    await action(page, 'show-issue').innerText(),
    new RegExp(`Point ${issue.pointIndex + 1}.*Tight corner`),
  );
  for (const value of ['show-issue', 'smooth-corner', 'spread-road']) {
    const button = action(page, value);
    if (!(await button.count())) continue;
    assert(await button.isVisible(), `${value} is visible for the broken road`);
    assert(
      await button.evaluate((el) => {
        const r = el.getBoundingClientRect();
        return (
          r.x >= 0 &&
          r.y >= 0 &&
          r.right <= innerWidth &&
          r.bottom <= innerHeight &&
          el.contains(
            document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2),
          )
        );
      }),
      `${value} fits the viewport and is not covered by another overlay`,
    );
  }
  await action(page, 'show-issue')[responsive ? 'tap' : 'click']();
  await ready(page);
  const focused = await state(page);
  assert.equal(
    focused.selectedPoint,
    issue.pointIndex,
    'warning link selects the authored problem point',
  );
  assert.equal(
    focused.preview.interaction.problemMarker.number,
    issue.pointIndex + 1,
    'the red marker identifies the same numbered point',
  );
  assert(
    focused.preview.interaction.problemMarker.visible,
    'warning focus puts the actual point onscreen',
  );
  const label = page.locator('[data-editor-problem-label]');
  assert(await label.isVisible(), 'the numbered warning label is visible');
  assert.match(
    await label.innerText(),
    new RegExp(`Point ${issue.pointIndex + 1}\\b`),
  );
  assert(
    await label.evaluate((el) => {
      const r = el.getBoundingClientRect();
      return (
        r.x >= 0 && r.y >= 0 && r.right <= innerWidth && r.bottom <= innerHeight
      );
    }),
    'the warning label fits onscreen',
  );
  await action(page, 'smooth-corner')[responsive ? 'tap' : 'click']();
  await ready(page);
  assert(
    await action(page, 'test').isEnabled(),
    await page.locator('[data-editor-status]').innerText(),
  );
  const repaired = await save(page, fixture.name);
  assert.equal(
    repaired.points.length,
    before.points.length,
    'local repair keeps the road stations',
  );
  const changed = before.points.flatMap((point, index) =>
    JSON.stringify(point) === JSON.stringify(repaired.points[index])
      ? []
      : [index],
  );
  assert(
    changed.length > 0 && changed.length < before.points.length / 2,
    'Auto fix changes a bounded local part of the road',
  );
  const untouched = structuredClone(repaired);
  untouched.points = before.points;
  assert.deepEqual(
    untouched,
    before,
    'Auto fix preserves identity, world, jumps and pickups',
  );
  await action(page, 'undo').click();
  assert.deepEqual(
    await save(page, fixture.name),
    before,
    'one Undo exactly restores the imported broken road',
  );
  console.log(
    'PASS numbered warning link, focused point/label, valid local Auto fix and exact Undo',
  );
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
    window.__editorToolsPad = {
      id: 'Editor tool verification controller',
      index: 0,
      connected: true,
      mapping: 'standard',
      axes: [0, 0, 0, 0],
      buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })),
    };
    Object.defineProperty(navigator, 'getGamepads', {
      configurable: true,
      value: () => [window.__editorToolsPad],
    });
  }, entries);
  const page = await context.newPage();
  collectPageErrors(page, faults);
  await page.goto(new URL('?intro=0&editor=1', base).href);
  const nameField = page.locator('[data-editor-field="name"]');
  await nameField.waitFor({ timeout: 90000 });
  await nameField.fill(name);
  await nameField.press('Tab');
  await ready(page);
  for (const [width, height] of responsive
    ? [[390, 844]]
    : [
        [1440, 900],
        [1280, 800],
      ]) {
    await page.setViewportSize({ width, height });
    await paletteLayout(page);
  }
  await expectTool(page, 'draw');

  if (responsive) {
    for (const [id, value] of tools) {
      await action(page, value).tap();
      await expectTool(page, id);
    }
    await action(page, 'draw-mode').tap();
    await action(page, 'quick-start').tap();
    await ready(page);
    const before = await save(page);
    await action(page, 'reset-track').tap();
    assert.equal((await save(page)).points.length, 0);
    await action(page, 'undo').tap();
    assert.deepEqual(await save(page), before);
    console.log('PASS final touch palette layout, tool taps, Reset and Undo');
  } else {
    await page.setViewportSize({ width: 1440, height: 900 });
    await ready(page);
    for (const [x, y] of [
      [490, 540],
      [700, 580],
    ])
      await page.mouse.click(x, y);
    let before = await save(page);
    assert.equal(before.points.length, 2, 'two ground clicks start the draft');
    await drag(page, await handle(page, 'height'), 0, -28);
    await expectTool(page, 'draw');
    expectHeightOnly(before, await save(page), 1);
    await page.mouse.click(860, 650);
    assert.equal(
      (await save(page)).points.length,
      3,
      'Draw continues after height-arrow dragging',
    );
    before = await save(page);
    await page.keyboard.down('Shift');
    await drag(page, await handle(page), 0, -26);
    await page.keyboard.up('Shift');
    await expectTool(page, 'draw');
    expectHeightOnly(before, await save(page), 2);
    await page.mouse.click(650, 740);
    assert.equal(
      (await save(page)).points.length,
      4,
      'Draw continues after Shift-dragging height',
    );
    console.log(
      'PASS reported blank-drawing workflow through height-arrow and Shift-drag edits',
    );

    // The actual displayed centreline supplies a deck target away from handles.
    before = await save(page);
    const preview = (await state(page)).preview;
    const box = await canvas(page).boundingBox();
    const camera = new T.PerspectiveCamera(
      48,
      box.width / box.height,
      0.5,
      200000,
    );
    camera.position.fromArray(preview.camera.position);
    camera.quaternion.fromArray(preview.camera.quaternion);
    camera.updateMatrixWorld();
    const curve = routeCurve(before);
    let deck;
    for (const fraction of [0.12, 0.22, 0.38, 0.62, 0.78]) {
      const p = curve.getPointAt(fraction).project(camera);
      const candidate = {
        x: box.x + ((p.x + 1) / 2) * box.width,
        y: box.y + ((1 - p.y) / 2) * box.height,
      };
      if (p.z < -1 || p.z > 1) continue;
      if (
        preview.interaction.points.some(
          (h) =>
            Math.hypot(box.x + h.x - candidate.x, box.y + h.y - candidate.y) <
            34,
        )
      )
        continue;
      if (
        await canvas(page).evaluate(
          (el, point) => document.elementFromPoint(point.x, point.y) === el,
          candidate,
        )
      ) {
        deck = candidate;
        break;
      }
    }
    assert(deck, 'an uncovered road deck is visible away from point handles');
    await page.mouse.click(deck.x, deck.y);
    assert.equal(
      (await save(page)).points.length,
      before.points.length + 1,
      'Draw clicks on the road deck add a point',
    );
    await expectTool(page, 'draw');
    await action(page, 'undo').click();

    await action(page, 'height-mode').click();
    await expectTool(page, 'height');
    before = await save(page);
    const selected = (await state(page)).selectedPoint;
    await drag(page, await handle(page), 22, -28);
    expectHeightOnly(before, await save(page), selected);
    await expectTool(page, 'height');
    await action(page, 'draw-mode').click();
    await page.mouse.click(980, 600);
    assert.equal(
      (await save(page)).points.length,
      before.points.length + 1,
      'explicit Draw resumes after the Height tool',
    );
    console.log(
      'PASS Draw on deck and explicit Height tool with Y-only movement',
    );

    // Real Tab navigation must reach every native palette button.
    await nameField.focus();
    const reached = new Set();
    for (let i = 0; i < 65 && reached.size < tools.length; i++) {
      await page.keyboard.press('Tab');
      const id = await page.evaluate(
        () => document.activeElement.dataset.editorTool,
      );
      if (id) reached.add(id);
    }
    assert.equal(reached.size, tools.length, 'Tab reaches all preview tools');
    for (const [id, , key] of tools) {
      await canvas(page).focus();
      await page.keyboard.press(key);
      await expectTool(page, id);
    }
    await nameField.focus();
    await page.keyboard.press('End');
    await page.keyboard.type('dvhpo');
    await expectTool(page, 'pan');
    assert(
      (await nameField.inputValue()).endsWith('dvhpo'),
      'typing tool letters edits the name',
    );
    await nameField.fill(name);
    await nameField.press('Tab');
    await action(page, 'draw-mode').focus();
    for (let i = 0; i < tools.length; i++) {
      if (i) await pad(page, 13);
      assert.equal(
        await page.evaluate(() => document.activeElement.dataset.editorTool),
        tools[i][0],
        'controller reaches the next native palette button',
      );
      await pad(page, 0);
      await expectTool(page, tools[i][0]);
    }
    console.log(
      'PASS native Tab/controller palette and keyboard shortcuts excluding name typing',
    );

    before = await save(page);
    for (const [id, value] of tools.filter(([id]) =>
      ['orbit', 'pan'].includes(id),
    )) {
      await action(page, value).click();
      const cameraBefore = (await state(page)).preview.camera;
      const start = await handle(page);
      await drag(page, start, 75, 30);
      await expectTool(page, id);
      assert.notDeepEqual(
        (await state(page)).preview.camera,
        cameraBefore,
        `${id} primary drag moves the camera even over a road handle`,
      );
      assert.deepEqual(
        await save(page),
        before,
        `${id} never edits the authored document`,
      );
    }
    console.log('PASS primary Orbit/Pan drags move only the camera');

    const cameraMenu = page.locator('.workshop-camera-menu');
    const cameraSummary = cameraMenu.locator('summary');
    await cameraSummary.focus();
    await page.keyboard.press('Enter');
    assert(
      await cameraMenu.evaluate((el) => el.open),
      'keyboard opens native Camera controls',
    );
    const cameraBeforePan = (await state(page)).preview.camera;
    await action(page, 'pan-left').focus();
    await pad(page, 0);
    assert.notDeepEqual(
      (await state(page)).preview.camera.position,
      cameraBeforePan.position,
      'controller activates the native Pan left camera action',
    );
    assert.deepEqual(
      await save(page),
      before,
      'native camera panning leaves the document unchanged',
    );
    await page.keyboard.press('Escape');
    assert.equal(
      await cameraMenu.evaluate((el) => el.open),
      false,
      'Escape closes Camera before leaving the editor',
    );
    assert(
      await cameraSummary.evaluate((el) => el === document.activeElement),
      'closing Camera returns focus to its summary',
    );
    console.log('PASS keyboard/controller Camera Pan and Escape focus return');

    await action(page, 'reset-track').click();
    await ready(page);
    await action(page, 'view-map').click();
    await action(page, 'draw-mode').click();
    for (const [x, y] of [
      [350, 250],
      [650, 300],
      [600, 460],
    ])
      await mapClick(page, x, y);
    before = await save(page);
    assert.equal(
      before.points.length,
      3,
      'Map Draw creates a readable three-point draft',
    );
    await action(page, 'height-mode').click();
    const mapBeforeHeight = await mapPoint(page, 2);
    await drag(page, mapBeforeHeight, 20, -35);
    await expectTool(page, 'height');
    expectHeightOnly(before, await save(page), 2);
    assert.deepEqual(
      await mapPoint(page, 2),
      mapBeforeHeight,
      'Map Height keeps the node in the same X/Z screen position',
    );
    await action(page, 'draw-mode').click();
    await mapClick(page, 420, 490);
    await expectTool(page, 'draw');
    const beforeMove = await save(page);
    assert.equal(
      beforeMove.points.length,
      4,
      'Map Draw resumes and adds exactly one point after Height',
    );
    await action(page, 'select-mode').click();
    await drag(page, await mapPoint(page, 1), 45, 25);
    await expectTool(page, 'move');
    const afterMove = await save(page);
    assert(
      Math.hypot(
        afterMove.points[1].x - beforeMove.points[1].x,
        afterMove.points[1].z - beforeMove.points[1].z,
      ) > 5,
      'Map Move drags actual X/Z geometry',
    );
    const restoredMove = structuredClone(afterMove);
    restoredMove.points[1].x = beforeMove.points[1].x;
    restoredMove.points[1].z = beforeMove.points[1].z;
    assert.deepEqual(
      restoredMove,
      beforeMove,
      'Map Move changes only the selected X/Z coordinates',
    );
    await action(page, 'pan-mode').click();
    const mapBeforePan = await mapPoint(page, 1);
    await drag(page, mapBeforePan, 55, 25);
    await expectTool(page, 'pan');
    assert.notDeepEqual(
      await mapPoint(page, 1),
      mapBeforePan,
      'Map Pan moves the displayed node coordinates',
    );
    assert.deepEqual(
      await save(page),
      afterMove,
      'Map Pan leaves the saved document unchanged',
    );
    await cameraSummary.focus();
    await page.keyboard.press('Enter');
    const mapBeforeNativePan = await mapPoint(page, 1);
    await action(page, 'pan-up').focus();
    await page.keyboard.press('Enter');
    assert.notDeepEqual(
      await mapPoint(page, 1),
      mapBeforeNativePan,
      'native Camera Pan moves the Map view too',
    );
    assert.deepEqual(
      await save(page),
      afterMove,
      'native Map Pan leaves the document unchanged',
    );
    await page.keyboard.press('Escape');
    assert.equal(await cameraMenu.evaluate((el) => el.open), false);
    assert(await cameraSummary.evaluate((el) => el === document.activeElement));
    await action(page, 'height-mode').click();
    const cancelPoint = await mapPoint(page, 2);
    await page.mouse.move(cancelPoint.x, cancelPoint.y);
    await page.mouse.down();
    await page.mouse.move(cancelPoint.x, cancelPoint.y - 45, { steps: 8 });
    assert(
      (await state(page)).dirty,
      'the canceled Map height gesture actually begins an edit',
    );
    await page
      .locator('#workshop-route-map')
      .dispatchEvent('pointercancel', { pointerId: 1 });
    await page.mouse.up();
    assert.deepEqual(
      await save(page),
      afterMove,
      'pointercancel restores the complete Map height transaction',
    );
    await action(page, 'undo').click();
    assert.deepEqual(
      await save(page),
      beforeMove,
      'one Undo restores the prior completed Map drag; cancellation adds no history',
    );
    console.log(
      'PASS Map Draw/Height/Move/Pan, continued drawing, Y-only height and canceled transaction',
    );

    await action(page, 'reset-track').click();
    await action(page, 'quick-start').click();
    await ready(page);
    await action(page, 'tab-world').click();
    await action(page, 'preset-industrial').click();
    await action(page, 'panel-close').click();
    await ready(page);
    before = await save(page);
    assert(
      before.points.length > 4 &&
        before.jumps.length > 0 &&
        before.pickups.devices.length > 0,
      'reset fixture has authored points, jumps, and pickups',
    );
    await action(page, 'reset-track').click();
    const cleared = await save(page);
    assert.equal(cleared.points.length, 0);
    assert.equal(cleared.jumps.length, 0);
    assert.equal(cleared.pickups.devices.length, 0);
    for (const key of [
      'id',
      'name',
      'settings',
      'generator',
      'width',
      'courseType',
    ])
      assert.deepEqual(cleared[key], before[key], `Reset preserves ${key}`);
    await expectTool(page, 'draw');
    await action(page, 'undo').click();
    assert.deepEqual(
      await save(page),
      before,
      'one Undo restores the entire track after Reset',
    );
    console.log(
      'PASS Reset clears road/jumps/pickups, preserves identity/world, and one Undo restores all',
    );
  }
  const broken = generateDocument({
    seed: 42017,
    length: 5000,
    courseType: 'circuit',
    seedJumps: false,
  });
  for (const key of ['x', 'z'])
    broken.points[12][key] = T.MathUtils.lerp(
      broken.points[11][key],
      broken.points[13][key],
      0.9,
    );
  await warningRepair(page, broken);
  assert.deepEqual(faults, []);
} finally {
  clearTimeout(watchdog);
  await context.close();
  await browser.close();
}
