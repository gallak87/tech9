import assert from 'node:assert/strict';
import { createDocument } from '../src/editor/document.js';
import { TRACK_LIBRARY_KEY } from '../src/editor/library.js';
import { seedVerificationCareer } from './verification-career.mjs';
import {
  collectPageErrors,
  launchVerificationBrowser,
} from './verification-browser.mjs';

const base = process.env.VN_URL;
if (!base) throw new Error('Set VN_URL to an isolated full-edition server.');
const browser = await launchVerificationBrowser();
try {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    reducedMotion: 'reduce',
  });
  await seedVerificationCareer(context);
  await context.addInitScript(() => {
    localStorage.setItem(
      'vector-nova.settings',
      JSON.stringify({ quality: 'low', volume: 0, reducedMotion: true }),
    );
  });
  const page = await context.newPage();
  await context.routeWebSocket('**/*', () => {});
  const errors = collectPageErrors(page, [], console.error);
  const action = (name) => page.locator(`[data-action="${name}"]`).first();
  const editor = (name) =>
    page.locator(`[data-editor-action="${name}"]`).first();
  page.setDefaultTimeout(60000);
  await page.goto(new URL('?intro=0&music=0', base).href);
  console.log('Opened game setup');
  await action('custom-levels').press('Enter');
  await page.getByRole('heading', { name: 'No custom levels yet' }).waitFor();
  assert.equal(await action('launch').count(), 0);
  await action('create-level').press('Enter');
  console.log('Opened empty custom library');
  await editor('starter-palette-waterfront').click();
  await page.waitForFunction(
    () => window.__VN_FRONTEND?.getState().editor?.points >= 4,
  );
  const name = page.locator('[data-editor-field="name"]');
  await name.fill('Verification waterfront');
  await name.press('Tab');
  await editor('save').click();
  await page.waitForFunction(() =>
    Object.keys(localStorage).some(
      (key) =>
        key.startsWith('vector-nova.tracks.v1.') &&
        JSON.parse(localStorage[key]).document.name ===
          'Verification waterfront',
    ),
  );
  await editor('exit').click();
  console.log('Saved a Workshop level');
  const saved = await page
    .getByRole('button', { name: /Verification waterfront Circuit/i })
    .getAttribute('data-level');
  const level = page.locator(`[data-level="${saved}"][aria-pressed="true"]`);
  await level.waitFor();
  assert.equal(
    await action('custom-levels').getAttribute('aria-pressed'),
    'true',
  );
  assert.ok(
    (await page.locator('.custom-library .circuit-hero path').getAttribute('d'))
      .length > 100,
  );
  for (const mode of ['quick-race', 'practice', 'time-trial']) {
    await action(mode).click();
    await level.waitFor();
    console.log('Launching', mode);
    await action('launch').click();
    await page.waitForFunction(
      () =>
        document.body.dataset.screen === 'race' &&
        window.__VN?.getSnapshot().sessionActive,
      null,
      { timeout: 120000 },
    );
    const state = await page.evaluate(() => {
      const snapshot = window.__VN.getSnapshot();
      return {
        active: snapshot.sessionActive,
        rivals: snapshot.competition?.standings?.length ?? 0,
        trial: Boolean(snapshot.timeTrial),
        level: window.__VN_FRONTEND.getState().loadedId,
      };
    });
    assert.equal(state.level, saved);
    assert.equal(state.rivals, mode === 'quick-race' ? 10 : 0);
    assert.equal(state.trial, mode === 'time-trial');
    await page.locator('#pause-button').click();
    assert.equal(await page.locator('#home').innerText(), 'Race setup');
    await page.locator('#home').click();
    console.log(mode, state);
  }
  await action('cup-hub').click();
  assert.equal(await action('custom-levels').count(), 0);
  await action('quick-race').click();
  await action('custom-levels').click();
  await level.waitFor();
  await action('edit-level').click();
  await name.waitFor();
  assert.equal(await name.inputValue(), 'Verification waterfront');
  await name.fill('Revised waterfront');
  await name.press('Tab');
  await editor('save').click();
  await page.waitForFunction(() =>
    Object.keys(localStorage).some(
      (key) =>
        key.startsWith('vector-nova.tracks.v1.') &&
        JSON.parse(localStorage[key]).document.name === 'Revised waterfront',
    ),
  );
  await editor('exit').click();
  await page.getByRole('heading', { name: 'Revised waterfront' }).waitFor();
  // The browser's developer start places the ship just before the finish.
  // Real physics crosses the line and the production results handlers run.
  const draft = createDocument({ blank: true });
  draft.name = 'Unfinished route';
  const sprint = createDocument({ blank: true, courseType: 'downhill' });
  sprint.name = 'Twin descent';
  sprint.points = Array.from({ length: 10 }, (_, i) => ({
    id: 'p' + i,
    x: i === 2 ? 30 : 0,
    y: 300 - 12 * i,
    z: i * 320,
    bank: 0,
    roll: 0,
  }));
  const twin = structuredClone(sprint);
  twin.id = 'track-twin';
  twin.points[2].x += 90;
  await page.evaluate(
    ({ documents, prefix }) => {
      for (const document of documents)
        localStorage.setItem(
          prefix + document.id,
          JSON.stringify({ document, updatedAt: Date.now() }),
        );
    },
    { documents: [draft, sprint, twin], prefix: TRACK_LIBRARY_KEY },
  );
  await page.goto(new URL('?intro=0&dev=1&music=0', base).href);
  await action('custom-levels').click();
  const cards = page.locator('button.circuit-card[data-level]');
  await page.waitForFunction(
    () =>
      document.querySelectorAll('.custom-library button[data-level]').length ===
      4,
  );
  assert.equal(
    await page.getByRole('button', { name: 'Twin descent Downhill' }).count(),
    2,
  );
  await cards.filter({ hasText: 'Unfinished route' }).click();
  assert.equal(await action('launch').isDisabled(), true);
  await page
    .getByText('Add at least four road points in the Editor.')
    .waitFor();
  await action('edit-level').click();
  assert.equal(await name.inputValue(), 'Unfinished route');
  await editor('exit').click();
  await page
    .locator(`button[data-level="custom-${draft.id}"][aria-pressed="true"]`)
    .waitFor();
  const profile = () =>
    page.evaluate(() => window.__VN_FRONTEND.getState().career.state);
  const originalCareer = await profile();
  for (const mode of ['quick-race', 'time-trial']) {
    await action(mode).click();
    await page.locator(`button[data-level="custom-${sprint.id}"]`).click();
    await page.waitForFunction(
      () =>
        document.querySelector('[data-action="launch"]')?.disabled === false,
    );
    await action('launch').click();
    await page.waitForFunction(
      () =>
        document.body.dataset.screen === 'race' &&
        window.__VN?.getSnapshot().sessionActive,
      null,
      { timeout: 120000 },
    );
    const route = await page.evaluate(() => window.__VN.getSnapshot().track);
    assert.equal(route.closed, false);
    assert.ok(Math.abs(route.length - route.finishDistance - 600) < 1e-6);
    await page.evaluate(() => window.__VN.devSetup({ finish: true }));
    await page.keyboard.down('ArrowUp');
    await page.waitForFunction(
      () =>
        document.body.dataset.screen === 'results' ||
        window.__VN_FRONTEND.getState().error,
      null,
      { timeout: 45000 },
    );
    await page.keyboard.up('ArrowUp');
    const result = await page.evaluate(
      () => window.__VN.getSnapshot().lastResults,
    );
    assert.equal(result.playerValid, true);
    assert.equal(result.laps, 1);
    assert.deepEqual(await profile(), originalCareer);
    assert.equal(await page.locator('.result-rewards').count(), 0);
    console.log('Finished custom descent', mode, route.id);
    await action('change').click();
  }
  await action('records').click();
  const record = page.locator('.records-list button[data-record-track]');
  await record.waitFor();
  assert.equal(await record.count(), 1);
  assert.equal(
    await record.getAttribute('data-record-track'),
    'custom-' + sprint.id,
  );
  await record.click();
  assert.equal(
    await page
      .locator('.custom-library .circuit-card[aria-pressed="true"]')
      .getAttribute('data-level'),
    'custom-' + sprint.id,
  );
  await page.locator(`button[data-level="custom-${twin.id}"]`).click();
  await page.waitForFunction(
    () => document.querySelector('[data-action="launch"]')?.disabled === false,
  );
  await action('launch').click();
  await page.waitForFunction(
    () =>
      document.body.dataset.screen === 'race' &&
      window.__VN?.getSnapshot().sessionActive,
    null,
    { timeout: 120000 },
  );
  const trial = await page.evaluate(() => window.__VN.getSnapshot().timeTrial);
  assert.ok(trial);
  assert.ok(!trial.best);
  console.log(
    'Duplicate names, incomplete draft return and geometry-scoped personal records passed',
  );
  assert.deepEqual(errors, []);
  console.log('Custom library create, save, play, edit, and return passed.');
} finally {
  await browser.close();
}
