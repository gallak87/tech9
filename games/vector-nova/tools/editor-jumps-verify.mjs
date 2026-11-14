import assert from 'node:assert/strict';
import {
  revealEditorField,
  revealEditorAction,
  openEditorSection,
} from './editor-controls.mjs';
import { generateDocument } from '../src/editor/document.js';
import {
  createCareerSlots,
  createMemoryStorage,
} from '../src/progression/careers.js';
import {
  launchVerificationBrowser,
  collectPageErrors,
} from './verification-browser.mjs';

const base = process.env.VN_URL;
if (!base) throw new Error('Set VN_URL to the editor dev server.');
const responsive = process.argv.includes('--responsive');
const values = createMemoryStorage();
createCareerSlots({ storage: () => values, now: () => 1 }).create(1);
const seed = Array.from({ length: values.length }, (_, i) => {
  const key = values.key(i);
  return [key, values.getItem(key)];
});
const browser = await launchVerificationBrowser();
const context = await browser.newContext({
  viewport: responsive
    ? { width: 390, height: 844 }
    : { width: 1440, height: 1000 },
  hasTouch: responsive,
});
const faults = [];
const action = (page, name) =>
  page.locator(`[data-editor-action="${name}"]:visible`).first();
const field = (page, name) => page.locator(`[data-editor-field="${name}"]`);
const draft = (page) =>
  page.evaluate(() =>
    Object.keys(localStorage)
      .filter((key) => key.startsWith('vector-nova.tracks.v1.'))
      .map((key) => JSON.parse(localStorage.getItem(key)).document)
      .find((doc) => doc.name === 'Huge downhill verification'),
  );
async function panel(page, name) {
  await openEditorSection(page, name);
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
async function save(page) {
  await (await revealEditorAction(page, 'save')).click();
  await page.waitForFunction(() =>
    document
      .querySelector('[data-editor-status]')
      ?.textContent.includes('Track saved'),
  );
}
const watchdog = setTimeout(() => {
  console.error('Jump browser check exceeded four minutes');
  process.exit(1);
}, 240000);
let page;
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
  }, seed);
  page = await context.newPage();
  collectPageErrors(page, faults);
  await page.goto(new URL('?intro=0&music=0&editor=1', base).href);
  await field(page, 'name').waitFor({ timeout: 90000 });
  const fixture = generateDocument({
    generatorVersion: 1,
    seed: 42017,
    length: 4800,
    courseType: 'downhill',
    seedJumps: false,
  });
  fixture.name = 'Huge downhill verification';
  await openEditorSection(page, 'library');
  const chooser = page.waitForEvent('filechooser');
  await (await revealEditorAction(page, 'import')).click();
  await (
    await chooser
  ).setFiles({
    name: 'manual-jump-fixture.vntrack.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(fixture)),
  });
  await page.waitForFunction(() =>
    document
      .querySelector('[data-editor-status]')
      ?.textContent.includes('Track imported'),
  );
  await panel(page, 'jumps');
  await (await revealEditorAction(page, 'find-jump-section')).click();
  await page.waitForFunction(
    () =>
      !window.__VN_FRONTEND.getState().editor.busy &&
      !document.querySelector('[data-editor-action="add-jump"]')?.disabled,
  );
  assert.equal(
    await page.evaluate(() => window.__VN_FRONTEND.getState().editor.jumpCount),
    0,
    'a suggested section remains uncommitted',
  );
  await (await revealEditorAction(page, 'add-jump')).click();
  assert.equal(
    await page.evaluate(() => window.__VN_FRONTEND.getState().editor.jumpCount),
    1,
    'explicit Add commits a prepared safe section',
  );
  await (await revealEditorAction(page, 'undo')).click();
  assert.equal(
    await page.evaluate(() => window.__VN_FRONTEND.getState().editor.jumpCount),
    0,
  );
  await (await revealEditorAction(page, 'find-jump-section')).click();
  await page.waitForFunction(
    () =>
      !window.__VN_FRONTEND.getState().editor.busy &&
      !document.querySelector('[data-editor-action="add-jump"]')?.disabled,
  );
  await change(page, 'jump-start', 3);
  await change(page, 'jump-end', 5);
  await change(page, 'jump-receiving', 300);
  await (await revealEditorField(page, 'jump-ramp')).check();
  await (await revealEditorAction(page, 'add-jump')).click();
  await page.waitForFunction(
    () => window.__VN_FRONTEND.getState().editor?.jumpCount === 1,
  );
  await page.waitForFunction(
    () =>
      document.querySelector('[data-editor-flight="boost"]')?.dataset
        .flightStatus === 'landed',
    null,
    { timeout: 30000 },
  );
  assert.notEqual(
    await page
      .locator('[data-editor-flight="cruise"]')
      .getAttribute('data-flight-status'),
    'landed',
    'large jump advisory distinguishes cruise from boost',
  );
  assert.equal(await action(page, 'test').isEnabled(), true);
  await save(page);
  const authored = await draft(page);
  assert.equal(authored.courseType, 'downhill');
  assert.equal(authored.jumps.length, 1);
  assert(
    authored.jumps[0].launchPointId && authored.jumps[0].landingPointId,
    'gap lips remain anchored',
  );
  console.log(
    'PASS explicit downhill starter, assisted large gap, ship-specific cruise/boost advisory',
  );

  await (await revealEditorAction(page, 'undo')).click();
  assert.equal(
    await page.evaluate(() => window.__VN_FRONTEND.getState().editor.jumpCount),
    0,
  );
  await (await revealEditorAction(page, 'redo')).click();
  await page.waitForFunction(
    () =>
      window.__VN_FRONTEND.getState().editor.jumpCount === 1 &&
      window.__VN_FRONTEND.getState().editor.jumpPreview?.boost === 'landed',
  );
  await (await revealEditorAction(page, 'inspect-jump')).click();
  await page.waitForFunction(
    () => window.__VN_FRONTEND.getState().editor.preview?.estimatedGpuBytes > 0,
    null,
    { timeout: 60000 },
  );
  await (await revealEditorAction(page, 'view-map')).click();
  await page.locator('[data-editor-map-wrap]').waitFor({ state: 'visible' });
  assert.equal(
    await page.evaluate(() => window.__VN_FRONTEND.getState().editor.view),
    'world',
    'jump inspection keeps the world visible behind Map',
  );
  await panel(page, 'pickups');
  await (await revealEditorAction(page, 'fill-pickups')).click();
  await save(page);
  const withDevices = await draft(page);
  assert(withDevices.pickups.devices.length > 0);
  console.log(
    'PASS gap history, owned flight-path preview, safe pickup fill and saved anchors',
  );

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
        closed: track.closed,
        length: track.length,
        finish: track.finishDistance,
        jump: { ...track.jumps[0] },
        course: window.__VN.getSnapshot().lap.course,
      };
    });
    assert.equal(course.closed, false);
    assert.equal(course.course.format, 'sprint');
    assert.equal(Math.round(course.length - course.finish), 600);
    assert(
      course.jump.landingStart - course.jump.takeoff > 600,
      'the actual gap is huge, not a decorative ramp',
    );
    // Existing development scenario API supplies a bounded approach fixture.
    // All takeoff, free flight, terrain contacts and landing use the live engine.
    await page.evaluate(() => {
      const api = window.__VN,
        track = api.getTrack(),
        jump = track.jumps[0];
      const speed = api.getSnapshot().handling.boostSpeed ?? 146;
      track.scenarios['browser-jump-approach'] = {
        distance: jump.takeoff - 25,
        speed: speed - 4,
        lateral: 0,
        heading: 0,
        energy: 100,
      };
      api.loadScenario('browser-jump-approach', 7);
      api.pause();
    });
    await page.locator('#resume').click();
    await page.keyboard.down('w');
    await page.keyboard.down('Shift');
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
    await page.keyboard.up('Shift');
    await page.keyboard.up('w');
    const flown = await page.evaluate(() => window.__VN.getSnapshot());
    assert(flown.events.some((event) => event.type === 'jump-launch'));
    assert(
      flown.events.some(
        (event) =>
          event.type === 'jump-transfer' && event.payload.outcome === 'landed',
      ),
      JSON.stringify(flown.events),
    );
    assert.equal(flown.vehicle.resetCount, 0);
    console.log(
      'PASS real ballistic launch and landing across a 600m+ gap with live Rapier/collision',
    );
    await page.evaluate(() => {
      const api = window.__VN,
        track = api.getTrack();
      track.scenarios['browser-finish'] = {
        distance: track.finishDistance - 20,
        speed: 65,
        lateral: 0,
        heading: 0,
      };
      api.loadScenario('browser-finish', 7);
    });
    await page.waitForFunction(
      () => window.__VN.getSnapshot().lap.complete,
      null,
      { timeout: 10000 },
    );
    await page.locator('#sprint-home').waitFor();
    assert(
      (await page.locator('#sprint-home').textContent()).includes(
        'Back to editor',
      ),
    );
    await page.locator('#sprint-home').click();
    await action(page, 'test').waitFor();
    assert.deepEqual(
      await page.evaluate(() =>
        Object.entries(localStorage)
          .filter(([key]) => key.includes('career'))
          .sort(),
      ),
      careerBefore,
    );
    console.log(
      'PASS terminal downhill finish/runout, return to draft and career isolation',
    );
  }

  await page.reload();
  await action(page, 'tab-library').waitFor({ timeout: 90000 });
  await openEditorSection(page, 'library');
  await page.waitForFunction(
    () =>
      document.querySelector('[data-editor-field="saved"]')?.options.length > 0,
  );
  await (await revealEditorField(page, 'saved')).selectOption(authored.id);
  await (await revealEditorAction(page, 'load')).click();
  await page.waitForFunction(() =>
    document
      .querySelector('[data-editor-status]')
      ?.textContent.includes('Track loaded'),
  );
  await openEditorSection(page, 'generate');
  assert.equal(await field(page, 'course-type').inputValue(), 'downhill');
  await panel(page, 'jumps');
  await page.waitForFunction(
    () =>
      window.__VN_FRONTEND.getState().editor.jumpPreview?.boost === 'landed',
  );
  await (await revealEditorAction(page, 'remove-jump')).click();
  assert.equal(
    await page.evaluate(() => window.__VN_FRONTEND.getState().editor.jumpCount),
    0,
  );
  await (await revealEditorAction(page, 'undo')).click();
  assert.equal(
    await page.evaluate(() => window.__VN_FRONTEND.getState().editor.jumpCount),
    1,
  );
  await openEditorSection(page, 'generate');
  await change(page, 'jump-frequency', 'normal');
  await change(page, 'jump-size', 'mixed');
  await (await revealEditorAction(page, 'generate')).click();
  await page.waitForFunction(() => {
    const editor = window.__VN_FRONTEND.getState().editor;
    return !editor.busy && editor.jumpCount === 3;
  });
  assert.equal(
    await page.evaluate(() => window.__VN_FRONTEND.getState().editor.jumpCount),
    3,
    'new downhill seed replaces old gaps with three authored starter jumps',
  );
  await (await revealEditorAction(page, 'undo')).click();
  assert.equal(
    await page.evaluate(() => window.__VN_FRONTEND.getState().editor.jumpCount),
    1,
  );
  assert.deepEqual(faults, []);
  console.log(
    `PASS downhill/gap reload, remove/undo and regenerate/undo (${responsive ? 'responsive' : 'desktop'})`,
  );
} catch (error) {
  console.error(error.stack || error);
  console.error(
    'JUMP DIAGNOSTIC',
    faults,
    await page?.locator('body').innerText(),
  );
  throw error;
} finally {
  clearTimeout(watchdog);
  await context.close();
  await browser.close();
}
