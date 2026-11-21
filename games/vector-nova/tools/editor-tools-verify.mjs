import { revealEditorAction, openEditorSection } from './editor-controls.mjs';
import assert from 'node:assert/strict';
import * as T from 'three';
import { routeCurve } from '../src/editor/route.js';
import { createDocument, generateDocument } from '../src/editor/document.js';
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
const cameraOnly = process.argv.includes('--map-camera');
const escapeOnly = process.argv.includes('--escape');
const trackChecksOnly = process.argv.includes('--track-checks');
const fileOnly = process.argv.includes('--file');
const name = 'Editor tool verification';
const tools = [
  ['draw', 'draw-mode', 'd'],
  ['move', 'select-mode', 'v'],
  ['height', 'height-mode', 'h'],
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
  await (await revealEditorAction(page, 'save')).click();
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
  await openEditorSection(page, 'library');
  const choose = page.waitForEvent('filechooser', { timeout: 20000 });
  await (await revealEditorAction(page, 'import')).click();
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
  await ready(page);
}

async function expectTool(page, id) {
  assert.equal((await state(page)).tool, id, `${id} stays the active tool`);
  assert.equal((await state(page)).drawMode, id === 'draw');
  const active = page.locator(
    '[data-editor-tool-palette] [data-editor-tool][aria-pressed="true"]',
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
  if (responsive) await page.touchscreen.tap(point.x, point.y);
  else await page.mouse.click(point.x, point.y);
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
  await (await revealEditorAction(page, 'draw-mode')).scrollIntoViewIfNeeded();
  for (const [id, value] of tools) {
    const button = action(page, value);
    await button.scrollIntoViewIfNeeded();
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
  const reset = await revealEditorAction(page, 'reset-track');
  assert(await reset.isVisible(), 'Reset road is visible in File');
  await action(page, 'tab-library').click();
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

async function escapeChecks(page) {
  await page.setViewportSize({ width: 1440, height: 900 });
  await ready(page);
  if ((await state(page)).points)
    await (await revealEditorAction(page, 'reset-track')).click();
  await (await revealEditorAction(page, 'draw-mode')).click();
  await ready(page);
  for (const [x, y] of [
    [490, 540],
    [700, 580],
    [860, 650],
    [650, 740],
  ])
    await page.mouse.click(x, y);
  const original = await save(page);
  assert.equal(
    original.points.length,
    4,
    'real 3D ground clicks create the Escape fixture',
  );
  assert.equal((await state(page)).selectedPoint, 3);
  await expectTool(page, 'draw');

  const editing = async () => {
    assert.equal(
      await page.evaluate(() => window.__VN_FRONTEND.getState().screen),
      'editor',
      'Escape keeps the Workshop open while editing',
    );
    assert(await page.locator('.track-workshop').isVisible());
  };
  const deselected = async (tool = 'move') => {
    await editing();
    const editor = await state(page);
    assert.equal(editor.selectedPoint, -1);
    assert.equal(editor.selectedProp, -1);
    assert.equal(editor.selectionRange, null);
    assert(
      !editor.preview.interaction.span,
      'deselection clears the road-span highlight',
    );
    await expectTool(page, tool);
  };
  const repeatEscape = async (control) => {
    await control.focus();
    for (let i = 0; i < 4; i++)
      await control.dispatchEvent('keydown', {
        key: 'Escape',
        code: 'Escape',
        bubbles: true,
        repeat: true,
      });
    await editing();
  };
  const pointAt = async (index) => {
    await ready(page);
    const point = (await state(page)).preview.interaction.points[index];
    assert(point?.visible, `point ${index + 1} is visible for real selection`);
    const box = await canvas(page).boundingBox();
    return { x: box.x + point.x, y: box.y + point.y };
  };
  const selectPoint = async (index) => {
    const point = await pointAt(index);
    await page.mouse.click(point.x, point.y);
    assert.equal((await state(page)).selectedPoint, index);
  };

  await canvas(page).focus();
  await page.keyboard.press('Escape');
  await deselected();
  assert(
    await action(page, 'select-mode').evaluate(
      (el) => el === document.activeElement,
    ),
    'leaving Draw focuses the active native tool',
  );
  await repeatEscape(action(page, 'select-mode'));
  await deselected();
  assert.deepEqual(
    await save(page),
    original,
    'Escape and held-key repeats preserve every authored point',
  );
  console.log(
    'PASS drawing Escape switches to Select and clears selection; held repeats keep editor and geometry',
  );

  await selectPoint(0);
  await pad(page, 1);
  await deselected();
  assert.deepEqual(
    await save(page),
    original,
    'controller B deselects without changing the track',
  );
  await selectPoint(0);
  const second = await pointAt(1);
  await page.keyboard.down('Shift');
  await page.mouse.click(second.x, second.y);
  await page.keyboard.up('Shift');
  assert.deepEqual((await state(page)).selectionRange, { start: 0, end: 1 });
  await openEditorSection(page, 'shape');
  await action(page, 'tab-shape').click();
  assert(
    (await state(page)).preview.interaction.span,
    'a Bank span is visible before deselection',
  );
  await pad(page, 1);
  await deselected();
  console.log(
    'PASS controller B deselects points/ranges and clears the visible Bank span',
  );

  await selectPoint(0);
  await (await revealEditorAction(page, 'height-mode')).click();
  await page.keyboard.press('Escape');
  await deselected('height');
  assert(
    await action(page, 'height-mode').evaluate(
      (el) => el === document.activeElement,
    ),
    'Height deselection returns focus to the retained native tool',
  );
  assert.deepEqual(await save(page), original);
  await (await revealEditorAction(page, 'select-mode')).click();

  await selectPoint(0);
  await (await revealEditorAction(page, 'draw-mode')).click();
  const selection = () =>
    state(page).then(({ selectedPoint, tool }) => ({ selectedPoint, tool }));
  const selected = await selection();
  await openEditorSection(page, 'route');
  await page.keyboard.press('Escape');
  assert.equal((await state(page)).authorGroup, '');
  assert.deepEqual(
    await selection(),
    selected,
    'inline group closes before deselecting or leaving Draw',
  );
  await repeatEscape(action(page, 'tab-route'));
  assert.deepEqual(
    await selection(),
    selected,
    'held Escape cannot fall through a closed group',
  );
  await openEditorSection(page, 'generate');
  await page.keyboard.press('Escape');
  assert.equal((await state(page)).globalGroup, '');
  assert.deepEqual(
    await selection(),
    selected,
    'global drawer closes before deselection',
  );
  await (await revealEditorAction(page, 'view-map')).click();
  await page.keyboard.press('Escape');
  assert.equal((await state(page)).mapOpen, false);
  assert.deepEqual(
    await selection(),
    selected,
    'Map closes before deselection',
  );
  await (await revealEditorAction(page, 'fly-camera')).click();
  assert((await state(page)).flyActive);
  await page.keyboard.press('Escape');
  assert.equal((await state(page)).flyActive, false);
  assert.deepEqual(await selection(), selected, 'Fly exits before deselection');
  await editing();
  assert.deepEqual(await save(page), original);
  console.log(
    'PASS inline/global groups, Map and Fly keep their Escape priority without changing selection',
  );

  await (await revealEditorAction(page, 'select-mode')).click();
  await selectPoint(0);
  const point = await pointAt(0);
  await page.mouse.move(point.x, point.y);
  await page.mouse.down();
  await page.mouse.move(point.x + 55, point.y + 18, { steps: 8 });
  assert(
    (await state(page)).dirty,
    'a real point drag starts a geometry transaction',
  );
  await page.keyboard.press('Escape');
  await page.mouse.up();
  await editing();
  assert.equal(
    (await state(page)).selectedPoint,
    0,
    'active drag cancels before deselection',
  );
  await expectTool(page, 'move');
  assert.deepEqual(
    await save(page),
    original,
    'Escape cancels the whole active drag transaction',
  );
  await canvas(page).focus();
  await page.keyboard.press('Escape');
  await deselected();
  await repeatEscape(action(page, 'select-mode'));
  assert.deepEqual(await save(page), original);
  await canvas(page).focus();
  await page.keyboard.press('Escape');
  await page.waitForFunction(
    () => window.__VN_FRONTEND.getState().screen !== 'editor',
  );
  assert.equal(
    await page.locator('.track-workshop').isVisible(),
    false,
    'a distinct idle Escape retains the normal Back behavior',
  );
  assert.deepEqual(faults, []);
  console.log(
    'PASS active drag cancels atomically; deselection stays open and a later fresh idle Escape exits',
  );
}

async function mapCameraChecks(page) {
  const choose = async (name) => {
    const control = await revealEditorAction(page, name);
    if (responsive) await control.tap();
    else await control.click();
  };
  const openMap = async () => {
    if (!(await state(page)).mapOpen) await choose('view-map');
    await page.locator('[data-editor-map-wrap]').waitFor({ state: 'visible' });
    assert.equal((await state(page)).view, 'world');
    assert(await canvas(page).isVisible(), 'Map authoring keeps 3D visible');
  };
  if ((await state(page)).points) await choose('reset-track');
  await ready(page);
  await choose('draw-mode');
  await openMap();
  for (const [x, y] of [
    [350, 250],
    [650, 300],
    [600, 460],
  ])
    await mapClick(page, x, y);
  let before = await save(page);
  assert.equal(
    before.points.length,
    3,
    'Map Draw creates three real road points',
  );
  await choose('height-mode');
  await openMap();
  const beforeHeight = await mapPoint(page, 2);
  await drag(page, beforeHeight, 18, -32);
  assert.deepEqual(
    await mapPoint(page, 2),
    beforeHeight,
    'Map Height leaves projected X/Z fixed',
  );
  await expectTool(page, 'height');
  expectHeightOnly(before, await save(page), 2);
  await choose('draw-mode');
  await openMap();
  await mapClick(page, 420, 490);
  const beforeMove = await save(page);
  assert.equal(
    beforeMove.points.length,
    4,
    'Map drawing resumes after a Height edit',
  );
  await choose('select-mode');
  await openMap();
  await drag(page, await mapPoint(page, 1), 38, 24);
  const afterMove = await save(page);
  assert(
    Math.hypot(
      afterMove.points[1].x - beforeMove.points[1].x,
      afterMove.points[1].z - beforeMove.points[1].z,
    ) > 5,
    'Map Select/move edits real X/Z geometry',
  );
  const restored = structuredClone(afterMove);
  restored.points[1].x = beforeMove.points[1].x;
  restored.points[1].z = beforeMove.points[1].z;
  assert.deepEqual(
    restored,
    beforeMove,
    'Map movement changes only the selected X/Z',
  );
  await choose('height-mode');
  await openMap();
  const cancelPoint = await mapPoint(page, 2);
  await page.mouse.move(cancelPoint.x, cancelPoint.y);
  await page.mouse.down();
  await page.mouse.move(cancelPoint.x, cancelPoint.y - 38, { steps: 8 });
  assert((await state(page)).dirty);
  await page
    .locator('#workshop-route-map')
    .dispatchEvent('pointercancel', { pointerId: 1 });
  await page.mouse.up();
  assert.deepEqual(
    await save(page),
    afterMove,
    'canceled Map Height restores the whole transaction',
  );
  await choose('undo');
  assert.deepEqual(
    await save(page),
    beforeMove,
    'one Undo restores the completed Map movement; cancellation adds no history',
  );
  console.log(
    'PASS Map popover Draw/Select/Height, continued drawing and atomic cancel/Undo with 3D retained',
  );

  await choose('select-mode');
  before = await save(page);
  if (!responsive) {
    for (const button of ['right', 'middle']) {
      const cameraBefore = (await state(page)).preview.camera;
      const box = await canvas(page).boundingBox();
      await page.mouse.move(
        box.x + box.width * 0.42,
        box.y + box.height * 0.55,
      );
      await page.mouse.down({ button });
      await page.mouse.move(
        box.x + box.width * 0.42 + 65,
        box.y + box.height * 0.55 + 25,
        { steps: 8 },
      );
      await page.mouse.up({ button });
      assert.notDeepEqual(
        (await state(page)).preview.camera,
        cameraBefore,
        `${button} camera gesture still works without a separate mode/button`,
      );
      assert.deepEqual(
        await save(page),
        before,
        'camera gesture never changes authored geometry',
      );
    }
  }
  const cameraBeforeZoom = (await state(page)).preview.camera;
  await choose('zoom-in');
  await page.waitForFunction(
    (position) =>
      JSON.stringify(
        window.__VN_FRONTEND.getState().editor.preview.camera.position,
      ) !== JSON.stringify(position),
    cameraBeforeZoom.position,
  );
  assert.notDeepEqual(
    (await state(page)).preview.camera.position,
    cameraBeforeZoom.position,
  );
  await choose('zoom-out');
  await choose('focus-selection');
  await choose('fit');
  if (!responsive) {
    await action(page, 'fly-camera').focus();
    await pad(page, 0);
    assert(
      (await state(page)).flyActive,
      'controller can activate the permanent Fly control',
    );
    await pad(page, 1);
    assert.equal((await state(page)).flyActive, false);
    assert(
      await action(page, 'fly-camera').evaluate(
        (el) => el === document.activeElement,
      ),
    );
  }
  assert.deepEqual(
    await save(page),
    before,
    'the reduced camera controls change no authored data',
  );
  assert.deepEqual(faults, []);
  console.log(
    'PASS retained camera gestures and permanent Zoom/Focus/Overview/Fly controls',
  );
}

async function warningRepair(page, fixture) {
  fixture.name = 'Editor warning verification';
  await importTrack(page, fixture);
  const before = await save(page, fixture.name);
  const issue = (await state(page)).focusedIssue;
  assert.equal(
    issue?.kind,
    'bend',
    'the imported generated road has a tight-corner warning',
  );
  assert(await action(page, 'test').isEnabled());
  await openEditorSection(page, 'warnings');
  assert.match(
    await action(page, 'show-issue').innerText(),
    new RegExp(`Point ${issue.pointIndex + 1}.*(?:Sharp turn|Sharp crest)`),
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
    'the warning marker identifies the same numbered point',
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
  await (await revealEditorAction(page, 'undo')).click();
  assert.deepEqual(
    await save(page, fixture.name),
    before,
    'one Undo exactly restores the imported broken road',
  );
  console.log(
    'PASS numbered warning link, focused point/label, valid local Auto fix and exact Undo',
  );
}

async function trackChecks(page) {
  const clean = createDocument({ blank: true });
  clean.points = Array.from({ length: 8 }, (_, index) => ({
    id: `point-${index}`,
    x: 650 * Math.cos((index * Math.PI) / 4),
    y: 100,
    z: 650 * Math.sin((index * Math.PI) / 4),
    bank: 0,
    roll: 0,
  }));
  const obstructed = structuredClone(clean);
  obstructed.props.push({
    id: 'blocked-road',
    type: 'building',
    distance: 0.3,
    lateral: 0,
    scale: 1,
    rotation: 0,
  });

  await importTrack(page, clean);
  assert(await action(page, 'test').isEnabled());
  const warnings = action(page, 'toggle-warnings');
  const panel = page.locator('[data-editor-validation]');
  assert.match(await warnings.innerText(), /^Warnings\s+0$/);
  assert(await panel.isHidden(), 'clean tracks keep the warning panel closed');
  await importTrack(page, obstructed);
  assert(await action(page, 'test').isEnabled());
  assert.equal((await state(page)).focusedIssue?.kind, 'clearance');
  assert.match(await warnings.innerText(), /Warnings\s+[1-9]/);
  assert.equal(await warnings.getAttribute('aria-expanded'), 'false');
  await warnings.focus();
  await page.keyboard.press('Enter');
  assert(await panel.isVisible());
  assert.match(await panel.innerText(), /Driving notes.*Move this road away/s);
  assert(
    await action(page, 'show-issue').evaluate(
      (el) => el === document.activeElement,
    ),
  );
  await page.keyboard.press('Enter');
  assert.equal(
    (await state(page)).selectedPoint,
    (await state(page)).focusedIssue.pointIndex,
  );
  await page.keyboard.press('Escape');
  assert(await panel.isHidden());
  assert(await warnings.evaluate((el) => el === document.activeElement));

  await action(page, 'undo').click();
  assert.equal((await state(page)).focusedIssue, null);
  await action(page, 'redo').click();
  assert.equal((await state(page)).focusedIssue?.kind, 'clearance');

  await (await revealEditorAction(page, 'regenerate-environment')).click();
  assert(await action(page, 'test').isEnabled());
  assert.equal((await state(page)).focusedIssue, null);
  console.log(
    'PASS Track Warnings disclose and locate an obstruction, restore keyboard focus, and allow Practice',
  );
}

async function filePopoverChecks(page) {
  const file = action(page, 'tab-library');
  const menu = page.locator('[data-editor-section="library"]');
  const heading = page.locator('[data-editor-details="new-track"] > summary');
  await ready(page);
  const world = await openEditorSection(page, 'world');
  assert(await world.isVisible(), 'Scenery opens its swatch palette');
  if (!responsive) {
    const palette = world.getByRole('group', { name: 'Scenery swatches' });
    assert(await palette.isVisible());
    assert(await action(page, 'fit').isVisible());
  }
  const before = await canvas(page).boundingBox();
  const camera = (await state(page)).preview.camera;

  if (responsive) await file.tap();
  else {
    await file.focus();
    await page.keyboard.press('Enter');
  }
  await menu.waitFor({ state: 'visible' });
  assert.equal(await file.getAttribute('aria-expanded'), 'true');
  assert(await world.isVisible(), 'File keeps left scenery settings visible');
  assert.deepEqual(await canvas(page).boundingBox(), before);
  assert.deepEqual((await state(page)).preview.camera, camera);
  assert(await heading.evaluate((el) => el === document.activeElement));
  const box = await menu.boundingBox();
  const buttonBox = await file.boundingBox();
  assert(
    box.x >= 0 &&
      box.x + box.width <= page.viewportSize().width &&
      box.y >= buttonBox.y + buttonBox.height &&
      box.y + box.height <= page.viewportSize().height,
    'File popover stays below its button and inside the viewport',
  );

  if (responsive) await file.tap();
  else {
    await page.keyboard.press('Escape');
    assert(await file.evaluate((el) => el === document.activeElement));
    await pad(page, 0);
    await menu.waitFor({ state: 'visible' });
    assert(await heading.evaluate((el) => el === document.activeElement));
    await pad(page, 0);
    await action(page, 'blank').waitFor({ state: 'visible' });
    await pad(page, 1);
    assert(await file.evaluate((el) => el === document.activeElement));
  }
  await menu.waitFor({ state: 'hidden' });
  assert.equal(await file.getAttribute('aria-expanded'), 'false');
  assert(await world.isVisible());
  assert.deepEqual(await canvas(page).boundingBox(), before);

  await file.click();
  await page.locator('[data-editor-field="name"]').focus();
  await menu.waitFor({ state: 'hidden' });
  assert(await world.isVisible());
  console.log(
    'PASS File overlays the canvas without replacing scenery, dismisses and returns focus',
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
  if (!trackChecksOnly && !fileOnly) {
    for (const [width, height] of responsive
      ? [[390, 844]]
      : [
          [1440, 900],
          [1280, 800],
        ]) {
      await page.setViewportSize({ width, height });
      await ready(page);
      await paletteLayout(page);
    }
    await expectTool(page, 'draw');
  }

  if (fileOnly) {
    await filePopoverChecks(page);
  } else if (trackChecksOnly) {
    await trackChecks(page);
  } else if (escapeOnly) {
    await escapeChecks(page);
  } else if (cameraOnly) {
    await mapCameraChecks(page);
  } else {
    if (responsive) {
      for (const [id, value] of tools) {
        await (await revealEditorAction(page, value)).tap();
        await expectTool(page, id);
      }
      await (await revealEditorAction(page, 'draw-mode')).tap();
      await (await revealEditorAction(page, 'quick-start')).tap();
      await ready(page);
      const before = await save(page);
      await (await revealEditorAction(page, 'reset-track')).tap();
      assert.equal((await save(page)).points.length, 0);
      await (await revealEditorAction(page, 'undo')).tap();
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
      assert.equal(
        before.points.length,
        2,
        'two ground clicks start the draft',
      );
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
      await (await revealEditorAction(page, 'undo')).click();

      await (await revealEditorAction(page, 'height-mode')).click();
      await expectTool(page, 'height');
      before = await save(page);
      const selected = (await state(page)).selectedPoint;
      await drag(page, await handle(page), 22, -28);
      expectHeightOnly(before, await save(page), selected);
      await expectTool(page, 'height');
      await (await revealEditorAction(page, 'draw-mode')).click();
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
      await (await revealEditorAction(page, 'draw-mode')).focus();
      const reached = new Set();
      for (let i = 0; i < 65 && reached.size < tools.length; i++) {
        const id = await page.evaluate(
          () => document.activeElement.dataset.editorTool,
        );
        if (id) reached.add(id);
        if (reached.size < tools.length) await page.keyboard.press('Tab');
      }
      assert.equal(reached.size, tools.length, 'Tab reaches all preview tools');
      for (const [id, , key] of tools) {
        await canvas(page).focus();
        await page.keyboard.press(key);
        await expectTool(page, id);
      }
      await nameField.focus();
      await page.keyboard.press(
        process.platform === 'darwin' ? 'Meta+ArrowRight' : 'End',
      );
      await page.keyboard.type('dvhpo');
      await expectTool(page, 'height');
      const typedName = await nameField.inputValue();
      assert(
        typedName.endsWith('dvhpo'),
        `typing tool letters edits the name: ${JSON.stringify(typedName)}`,
      );
      await nameField.fill(name);
      await nameField.press('Tab');
      await (await revealEditorAction(page, 'draw-mode')).focus();
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

      await mapCameraChecks(page);

      await (await revealEditorAction(page, 'reset-track')).click();
      await (await revealEditorAction(page, 'quick-start')).click();
      await ready(page);
      await openEditorSection(page, 'world');
      await (await revealEditorAction(page, 'preset-industrial')).click();
      await ready(page);
      before = await save(page);
      assert(
        before.points.length > 4 &&
          before.jumps.length > 0 &&
          before.pickups.devices.length > 0,
        'reset fixture has authored points, jumps, and pickups',
      );
      await (await revealEditorAction(page, 'reset-track')).click();
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
      await (await revealEditorAction(page, 'undo')).click();
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
      generatorVersion: 1,
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
  }
  assert.deepEqual(faults, []);
} finally {
  clearTimeout(watchdog);
  await context.close();
  await browser.close();
}
