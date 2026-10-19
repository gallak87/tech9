import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { cupDefinition } from '../src/race/cup.js';
const cup = cupDefinition(process.env.VN_CUP_ID ?? 'founders');
assert.ok(cup, 'VN_CUP_ID must name an available cup');
const base = process.env.VN_URL;
if (!base) throw Error('Set VN_URL to a dev server');
const [width, height] = (process.env.VN_CUP_VIEWPORT ?? '1440x900')
  .split('x')
  .map(Number);
const touch = width < 900;
const browser = await chromium.launch({ headless: true, channel: 'chrome' });
const context = await browser.newContext({
  viewport: { width, height },
  hasTouch: touch,
});
const faults = [];
try {
  await context.addInitScript(() =>
    localStorage.setItem(
      'vector-nova.settings',
      JSON.stringify({
        quality: 'low',
        volume: 0,
        reducedMotion: true,
        difficulty: 'easy',
      }),
    ),
  );
  await context.route('**/src/core/game.js*', async (route) => {
    const response = await route.fetch();
    const source = await response.text();
    assert.ok(source.includes('      getSnapshot() {'));
    await route.fulfill({
      response,
      body: source.replace(
        '      getSnapshot() {',
        `
      verifyCupStep(ticks) {
        cancelCountdown();
        if (cupFinalResult) return this.getSnapshot();
        mode = 'racing';
        for (let i = 0; i < ticks; i++) {
          const finished = race.history.length >= (track.closed === false ? 1 : 2);
          if (finished && finishAt === null) finishAt = state.time;
          advanceTick(finished ? { throttle: 0, brake: 1, steer: 0, boost: false, airbrake: false } : racerModule.getRacerControl(state, track, { runtime, difficulty: 'easy' }));
          if (finishAt !== null && state.time - finishAt >= CUP_FINISH_GRACE) break;
        }
        if (finishAt !== null && state.time - finishAt >= 2.4) mode = 'results';
        else pause();
        return this.getSnapshot();
      },
      getSnapshot() {`,
      ),
    });
  });
  const page = await context.newPage();
  page.on('pageerror', (e) => faults.push(e.message));
  const click = async (action) =>
    page
      .locator(`[data-action="${action}"]`)
      .first()
      [touch ? 'tap' : 'click']();
  const state = () => page.evaluate(() => window.__VN_FRONTEND.getState());
  async function fits() {
    const overflow = await page
      .locator('#front-shell, .cup-panel')
      .evaluateAll((nodes) =>
        nodes.some((node) => node.scrollWidth > node.clientWidth + 1),
      );
    assert.equal(overflow, false, 'cup content fits the viewport width');
  }
  async function ready(level) {
    await page.waitForFunction(
      (level) =>
        window.__VN?.ready &&
        window.__VN_FRONTEND.getState().loadedId === level &&
        window.__VN_FRONTEND.getState().screen === 'race',
      level,
      { timeout: 120000 },
    );
    await page.evaluate(() => window.__VN.pause());
    const snap = await page.evaluate(() => window.__VN.getSnapshot());
    assert.equal(snap.ship.id, 'shrike');
    assert.equal(snap.competition.difficulty, 'easy');
    assert.ok(snap.cup);
    assert.equal((await state()).cup.state.cupId, cup.id);
  }
  async function finish() {
    for (
      let n = 0;
      n < 65 && (await state()).cup.state.phase !== 'results';
      n++
    ) {
      await page.evaluate(() => window.__VN.verifyCupStep(1200));
      await page.waitForTimeout(30);
    }
    const s = await state();
    assert.equal(
      s.cup.state.phase,
      'results',
      JSON.stringify(await page.evaluate(() => window.__VN.getSnapshot().race)),
    );
    assert.equal(s.cup.state.results.at(-1).length, 10);
    assert.ok(s.cup.state.results.at(-1).some((r) => r.status === 'finished'));
    assert.equal(await page.locator('.cup-standings tbody tr').count(), 10);
    await fits();
    console.log(
      'PASS event',
      s.cup.state.eventIndex + 1,
      s.cup.state.results.at(-1).find((r) => r.id === 'player'),
    );
  }
  await page.goto(base + '?music=0');
  await click('cup-hub');
  await page.locator(`[data-cup="${cup.id}"]`)[touch ? 'tap' : 'click']();
  assert.equal(await page.locator('.cup-panel h1').textContent(), cup.name);
  await fits();
  await page.locator('[data-ship="shrike"]')[touch ? 'tap' : 'click']();
  await click('cup-start');
  await ready(cup.tracks[0]);
  if (touch) {
    await page.locator('#resume').tap();
    await page.waitForFunction(
      () => window.__VN.getSnapshot().mode === 'racing',
    );
    const pad = page.locator('[data-touch-control="power"]');
    assert.equal(await pad.isVisible(), true);
    const bounds = await pad.boundingBox();
    const session = await context.newCDPSession(page);
    await session.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [
        { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height * 0.12 },
      ],
    });
    await page.waitForFunction(
      () => window.__VN.getSnapshot().vehicle.speed > 5,
    );
    assert.equal(await pad.getAttribute('data-power'), 'boost');
    await session.send('Input.dispatchTouchEvent', {
      type: 'touchEnd',
      touchPoints: [],
    });
    assert.equal(await pad.getAttribute('data-active'), 'false');
    await page.locator('#pause-button').tap();
    assert.equal(await page.locator('#pause-difficulty').isVisible(), false);
    await page.locator('#restart').tap();
    assert.equal(
      (await page.evaluate(() => window.__VN.getSnapshot())).vehicle.energy,
      100,
    );
    await ready(cup.tracks[0]);
    await session.detach();
  }
  await page.locator('#home')[touch ? 'tap' : 'click']();
  assert.equal((await state()).screen, 'cup');
  await click('cup-resume');
  await page.evaluate(() => window.__VN.pause());
  await finish();
  const first = (await state()).cup.state.results[0];
  await page.reload();
  await click('cup-hub');
  assert.equal((await state()).cup.state.phase, 'results');
  assert.deepEqual((await state()).cup.state.results[0], first);
  await click('cup-next');
  await ready(cup.tracks[1]);
  await page.reload();
  await click('cup-hub');
  assert.equal((await state()).cup.state.eventIndex, 1);
  await click('cup-resume');
  await ready(cup.tracks[1]);
  await finish();
  await click('cup-retry');
  await ready(cup.tracks[1]);
  assert.deepEqual((await state()).cup.state.results, [first]);
  await finish();
  await click('cup-next');
  await ready(cup.tracks[2]);
  await finish();
  assert.equal((await state()).cup.state.results.length, 3);
  await page.getByText('Final cup standings', { exact: true }).waitFor();
  await page.reload();
  await click('cup-hub');
  await page.getByText('Final cup standings', { exact: true }).waitFor();
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
    false,
  );
  await click('cup-restart');
  await click('cup-cancel');
  assert.equal((await state()).cup.state.results.length, 3);
  await click('cup-restart');
  await click('cup-confirm');
  await ready(cup.tracks[0]);
  assert.equal((await state()).cup.state.results.length, 0);
  await page.locator('#home')[touch ? 'tap' : 'click']();
  await click('cup-abandon');
  await click('cup-confirm');
  assert.equal((await state()).cup.state, null);
  await page.reload();
  assert.equal((await state()).cup.state, null);
  assert.deepEqual(faults, []);
  console.log(
    `PASS ${cup.name} ${width}x${height}: full real-physics cup, ship lock, reload, retry, final results, restart and abandon`,
  );
} finally {
  await context.close();
  await browser.close();
}
