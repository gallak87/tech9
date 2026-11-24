import assert from 'node:assert/strict';
import {
  revealEditorField,
  revealEditorAction,
  openEditorSection,
} from './editor-controls.mjs';
import {
  createCareerSlots,
  createMemoryStorage,
} from '../src/progression/careers.js';
import {
  launchVerificationBrowser,
  collectPageErrors,
} from './verification-browser.mjs';

const base = process.env.VN_URL;
if (!base) throw new Error('Set VN_URL to the isolated editor server.');
const responsive = process.argv.includes('--responsive');
const name = 'Track Workshop verification';
const authorGroups = ['route', 'shape', 'jumps'];
const globalGroups = [
  'tab-generate',
  'context-environment',
  'tab-pickups',
  'tab-library',
];
const modeIds = ['draw', 'move', 'height', 'pan'];
const cameraActions = [
  'focus-selection',
  'fit',
  'zoom-out',
  'zoom-in',
  'fly-camera',
  'view-map',
  'view-profile',
];
const cameraOnly = process.argv.includes('--map-camera');
const primary = ['undo', 'redo', 'save', 'test', 'exit'];
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
const action = (page, key) => page.locator(`[data-editor-action="${key}"]`);
const section = (page, key) => page.locator(`[data-editor-section="${key}"]`);
const inspector = (page) => page.locator('[data-editor-authoring]');
const toolbar = (page) => page.getByRole('group', { name: 'Viewport tools' });
const wordmark = (page) =>
  page.getByRole('button', {
    name: 'VECTOR//NOVA Track Editor — Return to main menu',
  });
const state = (page) =>
  page.evaluate(() => window.__VN_FRONTEND.getState().editor);
const tapOrClick = (control) => (responsive ? control.tap() : control.click());
const openTunes = (page) =>
  tapOrClick(
    page
      .locator('[data-music-player]')
      .getByRole('button', { name: /^Expand (music player|Tunes)$/ })
      .first(),
  );
const choose = async (page, key) =>
  tapOrClick(await revealEditorAction(page, key));
const watchdog = setTimeout(() => {
  console.error('Preview strip verification exceeded four minutes');
  process.exit(1);
}, 240000);

async function ready(page) {
  await page.waitForFunction(
    () => {
      const editor = window.__VN_FRONTEND.getState().editor;
      return editor && !editor.busy && editor.preview?.worldReady;
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
async function save(page) {
  await choose(page, 'save');
  await page.waitForFunction(() =>
    document
      .querySelector('[data-editor-status]')
      ?.textContent.includes('Track saved'),
  );
  return page.evaluate(
    (trackName) =>
      Object.keys(localStorage)
        .filter((key) => key.startsWith('vector-nova.tracks.v1.'))
        .map((key) => JSON.parse(localStorage.getItem(key)).document)
        .find((document) => document.name === trackName),
    name,
  );
}
async function pad(page, button) {
  await page.evaluate(async (index) => {
    window.__stripPad.buttons[index] = { pressed: true, value: 1 };
    await new Promise((done) =>
      requestAnimationFrame(() => requestAnimationFrame(done)),
    );
    window.__stripPad.buttons[index] = { pressed: false, value: 0 };
    await new Promise((done) =>
      requestAnimationFrame(() => requestAnimationFrame(done)),
    );
  }, button);
}
async function uncovered(control, label) {
  assert(await control.isVisible(), `${label} is visible`);
  assert(
    await control.evaluate((el) => {
      const r = el.getBoundingClientRect();
      return (
        r.x >= 0 &&
        r.y >= 0 &&
        r.right <= innerWidth + 1 &&
        r.bottom <= innerHeight + 1 &&
        (el.disabled ||
          el.contains(
            document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2),
          ))
      );
    }),
    `${label} fits and is not covered`,
  );
}
async function closeGroups(page) {
  const active = (await state(page)).authorGroup;
  if (active) await choose(page, `tab-${active}`);
  if ((await state(page)).globalGroup)
    await openEditorSection(page, 'road-home');
}
async function structure(page) {
  const root = page.locator('.track-workshop');
  assert.equal(await inspector(page).count(), 1, 'exactly one Inspector');
  assert(
    await inspector(page).evaluate((el) => !el.closest('.workshop-canvas')),
    'the Inspector leaves the viewport clear',
  );
  assert.equal(
    await root
      .locator(
        '[data-editor-action="context-more"], .workshop-context-popup, .workshop-footer, [data-editor-test-feedback]',
      )
      .count(),
    0,
    'no redundant More menu or permanent feedback bars',
  );
  assert.equal(
    await toolbar(page).locator('[data-editor-tool]').count(),
    modeIds.length,
  );
  for (const id of modeIds)
    await uncovered(
      toolbar(page).locator(`[data-editor-tool="${id}"]`),
      `${id} mode`,
    );
  const cameras = toolbar(page).getByRole('group', { name: 'Camera controls' });
  assert.equal(
    await cameras.count(),
    1,
    'camera controls have one permanent group',
  );
  for (const key of cameraActions)
    await uncovered(
      cameras.locator(`[data-editor-action="${key}"]`),
      `permanent ${key}`,
    );
  assert.equal(
    await root
      .locator(
        '[data-editor-action="tab-view"], [data-editor-action="view-world"], [data-editor-action^="orbit-"], [data-editor-action^="tilt-"], [data-editor-action="reset-view"]',
      )
      .count(),
    0,
    'no Camera popup or redundant camera buttons',
  );
  for (const key of authorGroups) {
    assert.equal(
      await inspector(page)
        .locator(`[data-editor-action="tab-${key}"]`)
        .count(),
      1,
    );
    assert(
      await section(page, key).evaluate(
        (el) => !!el.closest('[data-editor-authoring]'),
      ),
      `${key} opens in the Inspector`,
    );
    assert.equal(
      await section(page, key).locator('[data-editor-section]').count(),
      0,
      'group options have no nested group',
    );
  }
  for (const key of primary) {
    assert(
      await action(page, key).evaluate(
        (el) =>
          !!el.closest('[data-editor-header]') &&
          !el.closest('.workshop-canvas'),
      ),
      `${key} stays in the global header`,
    );
    await uncovered(action(page, key), key);
  }
  for (const key of ['name', 'course-type'])
    assert(
      await page
        .locator(`[data-editor-field="${key}"]`)
        .evaluate(
          (el) =>
            !!el.closest('[data-editor-header]') &&
            !el.closest('.workshop-canvas'),
        ),
    );
  const course = page.getByRole('combobox', { name: 'Course type' });
  const exit = page.getByRole('button', { name: 'Exit Editor', exact: true });
  await uncovered(course, 'course selector');
  await uncovered(exit, 'Exit Editor');
  await uncovered(wordmark(page), 'Track Editor wordmark');
  assert.equal(await exit.innerText(), 'Exit Editor');
  assert.doesNotMatch(
    await page.locator('.workshop-header-course').innerText(),
    /course type/i,
    'the selector retains its accessible label without visible label text',
  );
  const courseBox = await course.boundingBox();
  const exitBox = await exit.boundingBox();
  assert(
    Math.abs(
      courseBox.y + courseBox.height / 2 - (exitBox.y + exitBox.height / 2),
    ) <= 1,
    'the course selector is vertically centered on the header actions',
  );
  for (const key of globalGroups)
    assert(
      await action(page, key).evaluate((el) => !el.closest('.workshop-canvas')),
      `${key} belongs outside the preview`,
    );
  for (const attr of ['data-editor-action', 'data-editor-field']) {
    const duplicates = await root
      .locator(`[${attr}]`)
      .evaluateAll((nodes, attribute) => {
        const counts = new Map();
        for (const node of nodes) {
          const value = node.getAttribute(attribute);
          counts.set(value, (counts.get(value) ?? 0) + 1);
        }
        return [...counts].filter(([, count]) => count > 1);
      }, attr);
    assert.deepEqual(duplicates, [], `unique ${attr} controls`);
  }
  assert.equal(
    await action(page, 'draw-mode').evaluate((el) =>
      parseFloat(getComputedStyle(el).borderTopLeftRadius),
    ),
    0,
    'viewport tools match the game’s square menu controls',
  );
}

async function exitChecks(page) {
  const editorEntry = page.locator('[data-action="track-editor"]');
  const expectMainMenu = async () => {
    await page.waitForFunction(
      () => window.__VN_FRONTEND.getState().screen === 'home',
    );
    assert(
      await editorEntry.evaluate((el) => el === document.activeElement),
      'leaving the editor returns focus to its main-menu entry',
    );
  };
  if (responsive) await tapOrClick(action(page, 'exit'));
  else {
    await action(page, 'context-road').focus();
    await pad(page, 12);
    assert(
      await action(page, 'exit').evaluate(
        (el) => el === document.activeElement,
      ),
    );
    await pad(page, 0);
  }
  await expectMainMenu();
  await tapOrClick(editorEntry);
  await ready(page);
  if (responsive) await tapOrClick(wordmark(page));
  else {
    await action(page, 'tab-library').press('Shift+Tab');
    assert(
      await wordmark(page).evaluate((el) => el === document.activeElement),
    );
    await page.keyboard.press('Enter');
  }
  await expectMainMenu();
  console.log('PASS Exit Editor and wordmark return to the main menu');
}

async function mapCameraChecks(page) {
  await closeGroups(page);
  await choose(page, 'quick-start');
  await ready(page);
  await choose(page, 'select-mode');
  await closeGroups(page);
  const original = await save(page);
  const map = page.locator('[data-editor-map-wrap]');
  const canvas = page.locator('[data-editor-world] canvas');
  const ownedCanvas = await canvas.elementHandle();
  if (!responsive) {
    await choose(page, 'pan-mode');
    const before = (await state(page)).preview.camera.position;
    const box = await canvas.boundingBox();
    const x = box.x + box.width / 2;
    const y = box.y + box.height / 2;
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x + 75, y + 30, { steps: 5 });
    await page.mouse.up();
    const after = (await state(page)).preview.camera.position;
    assert.notDeepEqual(after, before, 'Pan moves the camera');
    assert.equal(after[1], before[1], 'Pan preserves camera elevation');
    assert.deepEqual(await save(page), original, 'Pan only changes the view');
    await choose(page, 'select-mode');
  }
  const openMap = async () => {
    if (!(await state(page)).mapOpen) await choose(page, 'view-map');
    await map.waitFor({ state: 'visible' });
    assert.equal((await state(page)).view, 'world');
    assert((await state(page)).preview.worldReady);
    assert(await canvas.isVisible(), '3D remains visible behind the Map');
    assert(
      await ownedCanvas.evaluate(
        (el) =>
          el.isConnected &&
          el === document.querySelector('[data-editor-world] canvas'),
      ),
      'Map keeps the same owned 3D canvas',
    );
  };
  for (const [width, height] of responsive
    ? [[390, 844]]
    : [
        [1440, 900],
        [1280, 800],
        [1100, 720],
      ]) {
    await page.setViewportSize({ width, height });
    await ready(page);
    const before = await canvas.boundingBox();
    await openMap();
    const box = await map.boundingBox();
    const preview = await page.locator('.workshop-canvas').boundingBox();
    assert.equal(await map.getAttribute('role'), 'dialog');
    assert(
      box.x >= preview.x &&
        box.y >= preview.y &&
        box.x + box.width <= preview.x + preview.width + 1 &&
        box.y + box.height <= preview.y + preview.height + 1,
      'Map is a bounded overlay within the preview',
    );
    assert(
      box.height < preview.height,
      'Map does not replace the full 3D area',
    );
    assert.deepEqual(
      await canvas.boundingBox(),
      before,
      'opening Map never resizes the 3D area',
    );
    assert(
      await action(page, 'map-close').evaluate(
        (el) => el === document.activeElement,
      ),
      'Map opens with native close focus',
    );
    for (const key of cameraActions)
      await uncovered(
        action(page, key),
        `${key} remains available with Map open`,
      );
    await choose(page, 'view-map');
    assert.equal(
      (await state(page)).mapOpen,
      false,
      'Map toggle can close its own popover',
    );
  }
  console.log(
    'PASS permanent camera controls and bounded Map over the same visible 3D canvas',
  );

  await openMap();
  await page.keyboard.press('Escape');
  assert.equal((await state(page)).mapOpen, false);
  assert(
    await action(page, 'view-map').evaluate(
      (el) => el === document.activeElement,
    ),
    'Escape dismisses only Map and returns focus to its toggle',
  );
  await openMap();
  await page
    .locator('[data-editor-header]')
    .click({ position: { x: 1, y: 1 } });
  assert.equal(
    (await state(page)).mapOpen,
    false,
    'outside pointer dismisses Map',
  );
  await openMap();
  await page.locator('[data-editor-field="name"]').focus();
  assert.equal(
    (await state(page)).mapOpen,
    false,
    'outside focus dismisses Map',
  );
  const profile = page.getByRole('dialog', { name: 'Elevation profile' });
  await openMap();
  await choose(page, 'view-profile');
  assert.equal((await state(page)).mapOpen, false);
  assert(await profile.isVisible());
  assert(await profile.locator('.workshop-profile-road').count());
  const profilePoint = profile.locator('[data-editor-field="profile-point"]');
  await profilePoint.press('Home');
  await profilePoint.press('ArrowRight');
  await profilePoint.press('ArrowRight');
  assert.equal((await state(page)).selectedPoint, 1);
  await choose(page, 'view-map');
  assert.equal(await profile.isVisible(), false);
  await choose(page, 'view-profile');
  await page.keyboard.press('Escape');
  assert.equal(await profile.isVisible(), false);
  assert(
    await action(page, 'view-profile').evaluate(
      (el) => el === document.activeElement,
    ),
  );
  console.log(
    'PASS Profile samples the route, shares point selection and restores focus',
  );

  await page.evaluate(() => {
    const button = document.createElement('button');
    button.id = 'outside-editor-map-check';
    button.textContent = 'Outside';
    button.style.cssText = 'position:fixed;left:1px;top:1px;z-index:9999';
    document.body.append(button);
  });
  const outside = page.locator('#outside-editor-map-check');
  await openMap();
  await outside.focus();
  assert.equal(
    (await state(page)).mapOpen,
    false,
    'focus in a widget outside the editor also dismisses Map',
  );
  await openMap();
  await outside.click();
  assert.equal(
    (await state(page)).mapOpen,
    false,
    'pointer in a widget outside the editor also dismisses Map',
  );
  await outside.evaluate((el) => el.remove());
  await openMap();
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  assert.equal((await state(page)).mapOpen, false, 'window blur dismisses Map');

  await openTunes(page);
  const player = page.locator('[data-music-player]');
  await player.waitFor({ state: 'visible' });
  await action(page, 'view-map').focus();
  assert(
    await player.evaluate((el) => el.classList.contains('is-collapsed')),
    'moving keyboard focus to the Workshop collapses Tunes',
  );
  await page.keyboard.press('Enter');
  await map.waitFor({ state: 'visible' });
  assert(
    await player.isVisible(),
    'transport remains in its normal position with Map open',
  );
  assert(
    await action(page, 'map-close').evaluate(
      (el) => el === document.activeElement,
    ),
    'Tunes focus return cannot dismiss the newly opened Map',
  );
  await openTunes(page);
  assert.equal((await state(page)).mapOpen, false, 'opening Tunes closes Map');
  await player
    .getByRole('button', { name: /^Collapse (music player|Tunes)$/ })
    .first()
    .click();
  console.log(
    'PASS Map toggle, Escape, outside app/input/window dismissal and keyboard Tunes exclusivity',
  );

  const beforeZoom = (await state(page)).preview.camera.position;
  if (responsive) await choose(page, 'zoom-in');
  else {
    await action(page, 'zoom-in').focus();
    await pad(page, 0);
  }
  await page.waitForFunction(
    (position) =>
      JSON.stringify(
        window.__VN_FRONTEND.getState().editor.preview.camera.position,
      ) !== JSON.stringify(position),
    beforeZoom,
  );
  assert.notDeepEqual(
    (await state(page)).preview.camera.position,
    beforeZoom,
    'persistent Zoom supports touch or native controller activation',
  );
  await choose(page, 'zoom-out');
  await choose(page, 'focus-selection');
  await choose(page, 'fit');
  await openMap();
  await action(page, 'fly-camera').focus();
  await page.keyboard.press('Enter');
  assert((await state(page)).flyActive);
  assert.equal((await state(page)).mapOpen, false);
  await page.keyboard.press('Escape');
  assert.equal((await state(page)).flyActive, false);
  assert(
    await action(page, 'fly-camera').evaluate(
      (el) => el === document.activeElement,
    ),
    'Fly exits to its permanently visible launcher',
  );
  assert.deepEqual(
    await save(page),
    original,
    'camera and Map presentation never edit the authored track',
  );
  assert.deepEqual(faults, []);
  console.log(
    'PASS persistent Zoom/Focus/Overview/Fly keyboard/controller and unchanged authored data',
  );
}

try {
  await context.routeWebSocket('**/*', () => {});
  await context.addInitScript(
    ({ seed, controller }) => {
      for (const [key, value] of seed) localStorage.setItem(key, value);
      localStorage.setItem('startUpMusicOn', 'false');
      localStorage.setItem(
        'vector-nova.settings',
        JSON.stringify({ quality: 'low', volume: 0, reducedMotion: true }),
      );
      if (controller) {
        window.__stripPad = {
          id: 'Preview strip verification controller',
          index: 0,
          connected: true,
          mapping: 'standard',
          axes: [0, 0, 0, 0],
          buttons: Array.from({ length: 17 }, () => ({
            pressed: false,
            value: 0,
          })),
        };
        Object.defineProperty(navigator, 'getGamepads', {
          configurable: true,
          value: () => [window.__stripPad],
        });
      }
    },
    { seed: entries, controller: !responsive },
  );
  const page = await context.newPage();
  collectPageErrors(page, faults);
  await page.goto(new URL('?intro=0&editor=1', base).href);
  const nameField = page.locator('[data-editor-field="name"]');
  await nameField.waitFor({ timeout: 90000 });
  await nameField.fill(name);
  await nameField.press('Tab');
  await ready(page);
  await choose(page, 'quick-start');
  await ready(page);
  await choose(page, 'draw-mode');

  for (const [width, height] of responsive
    ? [[390, 844]]
    : [
        [1440, 900],
        [1280, 800],
        [1100, 720],
      ]) {
    await page.setViewportSize({ width, height });
    await ready(page);
    await closeGroups(page);
    await structure(page);
    const collapsed = await inspector(page).boundingBox();
    const canvasBefore = await page.locator('.workshop-canvas').boundingBox();
    if (!responsive)
      assert(
        collapsed.x >= canvasBefore.x + canvasBefore.width - 1,
        'the Inspector sits to the right of the viewport',
      );

    for (const key of authorGroups) {
      await choose(page, `tab-${key}`);
      assert(await section(page, key).isVisible());
      assert.equal((await state(page)).authorGroup, key);
      for (const other of authorGroups.filter((id) => id !== key))
        assert.equal(await section(page, other).isVisible(), false);
      const expanded = await inspector(page).boundingBox();
      const canvasAfter = await page.locator('.workshop-canvas').boundingBox();
      if (responsive) {
        assert(expanded.height <= 300, 'the touch Inspector stays bounded');
        assert(canvasAfter.height >= 220, 'the touch viewport remains usable');
      } else {
        assert.equal(expanded.width, collapsed.width);
        assert.deepEqual(
          canvasAfter,
          canvasBefore,
          'the desktop viewport stays put',
        );
      }
      assert.equal(
        (await state(page)).tool,
        'draw',
        'opening a group preserves the selected mode',
      );
      for (const id of modeIds)
        await uncovered(
          toolbar(page).locator(`[data-editor-tool="${id}"]`),
          `${id} remains available with ${key} open`,
        );
    }
    await closeGroups(page);
    await openEditorSection(page, 'generate');
    const globalBox = await page.locator('.workshop-palette').boundingBox();
    assert.equal((await state(page)).authorGroup, '');
    assert(globalBox, 'Generate opens inside the Palette');
    assert(
      await page
        .locator('.workshop-palette')
        .evaluate((el) => !el.closest('.workshop-canvas')),
    );
    if (!responsive) {
      const mainBox = await page.locator('.workshop-main').boundingBox();
      assert(
        globalBox.x + globalBox.width <= mainBox.x + 1,
        'global settings occupy a separate left column',
      );
    }
    for (const key of cameraActions)
      await uncovered(
        action(page, key),
        `${key} remains available beside global settings`,
      );
    await closeGroups(page);
  }
  console.log(
    'PASS palette, viewport toolbar and single-group Inspector at all tested sizes',
  );

  if (!cameraOnly) {
    if (!responsive) {
      await page.setViewportSize({ width: 1440, height: 900 });
      await action(page, 'draw-mode').focus();
      for (let i = 0; i < modeIds.length; i++) {
        if (i) await pad(page, 15);
        assert.equal(
          await page.evaluate(() => document.activeElement.dataset.editorTool),
          modeIds[i],
        );
        await pad(page, 0);
        assert.equal((await state(page)).tool, modeIds[i]);
      }
      await action(page, 'tab-route').focus();
      await page.keyboard.press('Enter');
      assert(await section(page, 'route').isVisible());
      await page.keyboard.press('Escape');
      assert.equal((await state(page)).authorGroup, '');
      assert(await section(page, 'route').isVisible());
      assert(
        await action(page, 'tab-route').evaluate(
          (el) => el === document.activeElement,
        ),
      );
      await nameField.focus();
      await page.keyboard.type('dvhpo');
      assert.equal(
        (await state(page)).tool,
        'pan',
        'typing in a global field excludes preview shortcuts',
      );
      await nameField.fill(name);
      await nameField.press('Tab');
      console.log(
        'PASS native keyboard/controller modes, inline group Escape and global text input',
      );
    }

    await choose(page, 'quick-start');
    await ready(page);
    await choose(page, 'draw-mode');
    await closeGroups(page);
    const original = await save(page);
    const selected = (await state(page)).selectedPoint;
    const heightControl = await revealEditorField(page, 'point-y');
    await heightControl.focus();
    const scrollBefore = await page
      .locator('[data-editor-tools]')
      .evaluate((el) => el.scrollTop);
    await heightControl.press(
      (await heightControl.getAttribute('type')) === 'range'
        ? 'ArrowRight'
        : 'ArrowUp',
    );
    await ready(page);
    assert(
      await section(page, 'route').isVisible(),
      'native parameter editing keeps the inline group open',
    );
    assert.equal((await state(page)).tool, 'draw');
    assert.equal(
      await page.evaluate(() => document.activeElement.dataset.editorField),
      'point-y',
    );
    assert(
      Math.abs(
        (await page
          .locator('[data-editor-tools]')
          .evaluate((el) => el.scrollTop)) - scrollBefore,
      ) <= 2,
      'parameter editing preserves inline scroll',
    );
    const edited = await save(page);
    assert(edited.points[selected].y > original.points[selected].y);
    await choose(page, 'context-raise');
    assert(await section(page, 'route').isVisible());
    assert.equal(
      (await state(page)).tool,
      'draw',
      'executing a point option keeps the active selection and mode',
    );
    assert(
      await action(page, 'context-raise').evaluate(
        (el) => el === document.activeElement,
      ),
      'the point action retains focus',
    );
    await choose(page, 'undo');
    assert.deepEqual(
      await save(page),
      edited,
      'the point action remains one undoable geometry edit',
    );
    console.log('PASS scalar edits, point actions, focus and exact Undo');

    const bank = await revealEditorField(page, 'shape-start');
    await bank.focus();
    await bank.press('ArrowDown');
    assert(
      await section(page, 'shape').isVisible(),
      'bank parameters do not collapse before Apply',
    );
    await closeGroups(page);
    await choose(page, 'inspect-jump');
    await section(page, 'jumps').waitFor({ state: 'hidden' });
    assert.equal((await state(page)).tool, 'draw');
    const beforeZoom = (await state(page)).preview.camera;
    await choose(page, 'zoom-in');
    await page.waitForFunction(
      (position) =>
        JSON.stringify(
          window.__VN_FRONTEND.getState().editor.preview.camera.position,
        ) !== JSON.stringify(position),
      beforeZoom.position,
    );
    assert.notDeepEqual(
      (await state(page)).preview.camera.position,
      beforeZoom.position,
    );
    assert.deepEqual(
      await save(page),
      edited,
      'jump inspection and camera options change no authored data',
    );
    console.log(
      'PASS Bank/Jumps stay inline while camera controls remain directly available',
    );

    await openEditorSection(page, 'route');
    const cameraBefore = (await state(page)).preview.camera;
    const beforeIsolation = await save(page);
    const input = await revealEditorField(page, 'point-x');
    const inputBox = await input.boundingBox();
    await page.mouse.move(inputBox.x + 5, inputBox.y + 5);
    await page.mouse.down();
    await page.mouse.move(inputBox.x + 25, inputBox.y + 5, { steps: 4 });
    await page.mouse.up();
    const groupButton = await action(page, 'tab-route').boundingBox();
    await page.mouse.move(groupButton.x + 8, groupButton.y + 8);
    await page.mouse.wheel(0, 180);
    assert.deepEqual(
      (await state(page)).preview.camera,
      cameraBefore,
      'strip pointer/wheel input never controls the camera underneath',
    );
    assert.deepEqual(
      await save(page),
      beforeIsolation,
      'strip pointer input never draws or moves road geometry',
    );
    await closeGroups(page);

    await openTunes(page);
    const player = page.locator('[data-music-player]');
    await player.waitFor({ state: 'visible' });
    const musicBox = await player.boundingBox();
    assert(
      musicBox.x >= 0 &&
        musicBox.y >= 0 &&
        musicBox.x + musicBox.width <= page.viewportSize().width + 1 &&
        musicBox.y + musicBox.height <= page.viewportSize().height + 1,
      'Tunes fits the window',
    );
    for (const key of ['save', 'test'])
      await uncovered(action(page, key), `Tunes leaves ${key} available`);
    await tapOrClick(
      player
        .getByRole('button', { name: /^Collapse (music player|Tunes)$/ })
        .first(),
    );
    assert(
      await player.evaluate((el) => el.classList.contains('is-collapsed')),
    );
    const expand = player
      .getByRole('button', { name: /^Expand (music player|Tunes)$/ })
      .first();
    await expand.focus();
    await page.keyboard.press('Enter');
    await page.keyboard.press('Escape');
    assert(
      await expand.evaluate((el) => el === document.activeElement),
      'Escape returns to the shared Tunes opener',
    );
    assert.equal(
      await player.getAttribute('data-menu-active'),
      null,
      'collapsed controls release menu navigation',
    );
    console.log('PASS preview input isolation and independent global Tunes');

    await choose(page, 'reset-track');
    await ready(page);
    await choose(page, 'draw-mode');
    const canvas = page.locator('[data-editor-world] canvas');
    const box = await canvas.boundingBox();
    for (const [x, y] of [
      [0.28, 0.5],
      [0.48, 0.62],
    ]) {
      const point = { x: box.x + box.width * x, y: box.y + box.height * y };
      if (responsive) await page.touchscreen.tap(point.x, point.y);
      else await page.mouse.click(point.x, point.y);
    }
    assert.equal((await save(page)).points.length, 2);
    const y = await revealEditorField(page, 'point-y');
    await y.press(
      (await y.getAttribute('type')) === 'range' ? 'ArrowRight' : 'ArrowUp',
    );
    await closeGroups(page);
    const point = { x: box.x + box.width * 0.65, y: box.y + box.height * 0.7 };
    if (responsive) await page.touchscreen.tap(point.x, point.y);
    else await page.mouse.click(point.x, point.y);
    assert.equal(
      (await save(page)).points.length,
      3,
      'drawing continues after changing a point in the inline group',
    );
    assert.deepEqual(faults, []);
    console.log('PASS Draw continues after inline point-height editing');
  }
  await mapCameraChecks(page);
  await exitChecks(page);
} finally {
  clearTimeout(watchdog);
  await context.close();
  await browser.close();
}
