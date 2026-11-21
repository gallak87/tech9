import assert from 'node:assert/strict';
import { createDocument } from '../src/editor/document.js';
import { openEditorSection, revealEditorAction } from './editor-controls.mjs';
import { seedVerificationCareer } from './verification-career.mjs';
import {
  collectPageErrors,
  launchVerificationBrowser,
} from './verification-browser.mjs';

const base = process.env.VN_URL;
if (!base) throw new Error('Set VN_URL to the isolated editor server.');
const fixture = createDocument({ blank: true });
fixture.name = 'Selection workflow verification';
fixture.points = Array.from({ length: 8 }, (_, index) => ({
  id: `selection-point-${index + 1}`,
  x: 650 * Math.cos((index * Math.PI) / 4),
  y: 100 + index * 8,
  z: 650 * Math.sin((index * Math.PI) / 4),
  bank: 0,
  roll: index * 0.06,
}));
// Keep one ordinary short section so a modest roll scrub crosses the rate limit.
for (const axis of ['x', 'z'])
  fixture.points[4][axis] =
    fixture.points[3][axis] +
    (fixture.points[4][axis] - fixture.points[3][axis]) * 0.16;

const browser = await launchVerificationBrowser();
const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
});
const faults = [];
try {
  await context.routeWebSocket('**/*', () => {});
  await seedVerificationCareer(context);
  await context.addInitScript(() => {
    localStorage.setItem('startUpMusicOn', 'false');
    localStorage.setItem(
      'vector-nova.settings',
      JSON.stringify({ quality: 'low', volume: 0, reducedMotion: true }),
    );
  });
  const page = await context.newPage();
  collectPageErrors(page, faults);
  const state = () =>
    page.evaluate(() => window.__VN_FRONTEND.getState().editor);
  const choose = async (id) => (await revealEditorAction(page, id)).click();
  const ready = () =>
    page.waitForFunction(
      () => {
        const editor = window.__VN_FRONTEND.getState().editor;
        return editor?.preview?.worldReady && !editor.busy;
      },
      null,
      { timeout: 90000 },
    );
  const map = page.locator('[data-editor-map-wrap]');
  const point = (index) => map.locator(`[data-map-point="${index}"] circle`);
  const openMap = async () => {
    if (!(await map.isVisible())) await choose('view-map');
  };
  const save = async () => {
    await choose('save');
    await page.waitForFunction(() =>
      document
        .querySelector('[data-editor-status]')
        ?.textContent.includes('Track saved'),
    );
    return page.evaluate(
      (id) =>
        JSON.parse(localStorage.getItem(`vector-nova.tracks.v1.${id}`))
          .document,
      fixture.id,
    );
  };

  await page.goto(new URL('?intro=0&music=0&editor=1', base).href);
  await page.locator('[data-editor-field="name"]').waitFor({ timeout: 90000 });
  await openEditorSection(page, 'library');
  const chooser = page.waitForEvent('filechooser');
  await choose('import');
  await (
    await chooser
  ).setFiles({
    name: 'section-selection.vntrack.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(fixture)),
  });
  await ready();
  const before = await save();

  await openMap();
  await point(2).click();
  await point(5).click({ modifiers: ['Shift'] });
  assert.deepEqual((await state()).selectedPoints, [2, 3, 4, 5]);
  await point(4).click({ modifiers: ['Shift'] });
  assert.deepEqual((await state()).selectedPoints, [2, 3, 4]);
  await point(7).click({ modifiers: ['Control'] });
  assert.deepEqual((await state()).selectedPoints, [2, 3, 4, 7]);
  assert.equal((await state()).selectionRange, null);
  assert(await page.locator('[data-point-turn="1"]').isDisabled());
  const groupHeight = page.locator('[data-point-axis="y"]');
  await groupHeight.fill(String(before.points[7].y + 20));
  await groupHeight.press('Tab');
  await ready();
  const elevated = await save();
  elevated.points.forEach((member, index) => {
    assert.equal(
      member.y - before.points[index].y,
      [2, 3, 4, 7].includes(index) ? 20 : 0,
    );
  });
  await choose('undo');
  await ready();
  assert.deepEqual(await save(), before);
  assert.deepEqual((await state()).selectedPoints, [2, 3, 4, 7]);
  await openMap();
  await point(7).click({ modifiers: ['Control'] });
  assert.deepEqual((await state()).selectedPoints, [2, 3, 4]);

  const handle = await point(3).boundingBox();
  assert(handle);
  const x = handle.x + handle.width / 2,
    y = handle.y + handle.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + 32, y + 12, { steps: 5 });
  await page.mouse.up();
  await ready();
  assert.deepEqual((await state()).selectedPoints, [2, 3, 4]);
  const after = await save();
  const dx = after.points[3].x - before.points[3].x;
  const dz = after.points[3].z - before.points[3].z;
  assert(Math.hypot(dx, dz) > 1);
  for (const index of [2, 3, 4]) {
    assert(
      Math.abs(after.points[index].x - before.points[index].x - dx) < 1e-9,
    );
    assert(
      Math.abs(after.points[index].z - before.points[index].z - dz) < 1e-9,
    );
    assert.equal(after.points[index].y, before.points[index].y);
  }
  assert.deepEqual(after.points[7], before.points[7]);

  await choose('undo');
  await ready();
  assert.deepEqual(
    (await state()).selectedPointIds,
    fixture.points.slice(2, 5).map(({ id }) => id),
  );
  assert.deepEqual(await save(), before);
  await choose('redo');
  await ready();
  assert.deepEqual(await save(), after);

  const rollScrub = await page.locator('[data-scrub="roll"]').boundingBox();
  assert(rollScrub);
  const scrubX = rollScrub.x + rollScrub.width / 2,
    scrubY = rollScrub.y + rollScrub.height / 2;
  await page.mouse.move(scrubX, scrubY);
  await page.mouse.down();
  await page.mouse.move(scrubX + 18, scrubY, { steps: 5 });
  await page.mouse.up();
  await ready();
  const rolled = await save();
  rolled.points.forEach((member, index) => {
    const expected = [2, 3, 4].includes(index) ? (18 * Math.PI) / 180 : 0;
    assert(Math.abs(member.roll - after.points[index].roll - expected) < 1e-9);
  });
  await choose('undo');
  await ready();
  assert.deepEqual(await save(), after);

  await openMap();
  await point(3).click();
  const liveTwists = () =>
    state().then(({ preview }) => preview.interaction.twistSections);
  const fastMapPaths = map.locator('path:has(> title:text-is("Fast twist"))');
  assert.deepEqual(await liveTwists(), []);
  assert.equal(await fastMapPaths.count(), 0);
  const moveRollPastLimit = async () => {
    const scrub = await page.locator('[data-scrub="roll"]').boundingBox();
    const x = scrub.x + scrub.width / 2,
      y = scrub.y + scrub.height / 2;
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x + 200, y, { steps: 5 });
    return { x, y };
  };
  const scrub = await moveRollPastLimit();
  assert(
    (await liveTwists()).length > 0,
    '3D already marks excess twist while the pointer is held',
  );
  assert(
    (await fastMapPaths.count()) > 0,
    'open Map marks the same affected span while scrubbing',
  );
  // Wait beyond the ordinary world rebuild debounce with the pointer held.
  await page.waitForTimeout(240);
  assert(
    (await state()).preview.worldReady,
    'roll scrubbing retains the committed road world',
  );
  await page.mouse.move(scrub.x, scrub.y, { steps: 5 });
  assert.deepEqual(await liveTwists(), []);
  assert.equal(await fastMapPaths.count(), 0);
  await page.mouse.move(scrub.x + 200, scrub.y, { steps: 5 });
  assert((await liveTwists()).length > 0);
  await page.keyboard.press('Escape');
  await page.mouse.up();
  assert.deepEqual(await liveTwists(), []);
  assert.equal(await fastMapPaths.count(), 0);
  assert.deepEqual(await save(), after);

  await openMap();
  await moveRollPastLimit();
  const previewed = await liveTwists();
  await page.mouse.up();
  await ready();
  assert.deepEqual(
    await liveTwists(),
    previewed,
    'commit reports the same intervals as live preview',
  );
  await choose('undo');
  await ready();
  assert.deepEqual(await liveTwists(), []);
  assert.deepEqual(await save(), after);
  console.log(
    'PASS live twist highlights appear, clear, cancel and Undo without a held world rebuild',
  );
  assert.deepEqual(faults, []);
  console.log(
    'PASS map modifiers, rigid group translation, disjoint height entry, roll scrub and one-step Undo/Redo by authored point identity',
  );
} finally {
  await context.close();
  await browser.close();
}
