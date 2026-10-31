import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { RACE_OPPONENTS } from '../src/race/roster.js';
import { CUPS, cupDefinition } from '../src/race/cup.js';
import { careerKey, seedVerificationCareer } from './verification-career.mjs';
const cup = cupDefinition(process.env.VN_CUP_ID ?? 'founders');
assert.ok(cup, 'VN_CUP_ID must name an available cup');
const lastCup = CUPS.at(-1);
const lastCupNames = await Promise.all(
  lastCup.tracks.map(
    async (id) =>
      (await import(`../src/levels/${id}/metadata.js`)).default.name,
  ),
);
const base = process.env.VN_URL;
if (!base) throw Error('Set VN_URL to a dev server');
const [width, height] = (process.env.VN_CUP_VIEWPORT ?? '1440x900')
  .split('x')
  .map(Number);
const browser = await chromium.launch({
  args: ['--mute-audio'],
  headless: true,
  channel: 'chrome',
});
const context = await browser.newContext({
  viewport: { width, height },
  hasTouch: width < 900,
});
try {
  await seedVerificationCareer(context);
  await context.addInitScript(() =>
    localStorage.setItem(
      'vector-nova.settings',
      JSON.stringify({ quality: 'low', volume: 0, reducedMotion: true }),
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
        '      verifyCupResults(data) { onResults?.(data); },\n      getSnapshot() {',
      ),
    });
  });
  const page = await context.newPage();
  const openCup = async () => {
    await page.locator('[data-action="cup-hub"]').click();
    if (width < 900) await page.locator('[data-action="circuits"]').click();
    // Keep stationary pointer hover from competing with keyboard previews.
    await page.mouse.move(0, 0);
  };
  const faults = [];
  page.on('pageerror', (e) => faults.push(e.message));
  await page.goto(base + '?intro=0&music=0');
  await openCup();
  await page.locator('[data-cup="founders"]').focus();
  await page.keyboard.press('End');
  assert.equal(
    await page
      .locator(`[data-cup="${lastCup.id}"]`)
      .getAttribute('aria-pressed'),
    'true',
  );
  assert.equal(
    await page.evaluate(() => document.activeElement.dataset.cup),
    lastCup.id,
  );
  assert.equal(await page.locator('.cup-title').textContent(), lastCup.name);
  assert.deepEqual(
    await page.locator('.cup-route strong').allTextContents(),
    lastCupNames,
  );
  assert.equal(
    (await page.evaluate(() => window.__VN_FRONTEND.getState())).loadedId,
    null,
  );
  await page.keyboard.press('KeyS');
  await page.locator('[data-action="settings-back"]').waitFor();
  await page.keyboard.press('Escape');
  assert.equal(
    await page.evaluate(() => document.activeElement.dataset.cup),
    lastCup.id,
  );
  await page.keyboard.press('Home');
  assert.equal(
    await page.locator('[data-cup="founders"]').getAttribute('aria-pressed'),
    'true',
  );
  await page.locator(`[data-cup="${cup.id}"]`).click();
  assert.match(
    await page.locator('.cup-grid-progress').textContent(),
    /Starting grid: P10 \/ 10/,
  );
  await page.locator('[data-action="cup-start"]').click();
  await page.waitForFunction(
    () =>
      window.__VN?.ready &&
      window.__VN_FRONTEND.getState().screen === 'race' &&
      window.__VN.getSnapshot().cup,
    null,
    { timeout: 120000 },
  );
  await page.evaluate(() => window.__VN.pause());
  const order = RACE_OPPONENTS.map((r) => r.id);
  order.splice(4, 0, 'player');
  const rows = order.map((id, i) => ({
    id,
    name: id,
    position: i + 1,
    finished: id === 'player',
    valid: true,
    totalTime: id === 'player' ? 104 : null,
  }));
  const snapshot = await page.evaluate(() => window.__VN.getSnapshot());
  const laps = snapshot.track.closed ? 2 : 1;
  const waiting = {
    mode: 'cup',
    final: false,
    remaining: 25,
    standings: rows,
    playerValid: true,
    playerTotalTime: 104,
    courseFormat: snapshot.competition.courseFormat,
    playerLapTimes: Array(laps).fill(104 / laps),
    laps,
    difficulty: 'easy',
  };
  await page.evaluate((data) => window.__VN.verifyCupResults(data), waiting);
  assert.equal(
    await page.locator('.result-panel .kicker').textContent(),
    snapshot.track.closed ? 'CUP / RACE FINISH' : 'CUP / SPRINT FINISH',
  );
  await page.locator('[data-action="cup-hub"]').focus();
  const panel = await page.locator('.cup-waiting').elementHandle();
  const hubButton = await page
    .locator('[data-action="cup-hub"]')
    .elementHandle();
  for (let remaining = 24; remaining >= 20; remaining--) {
    await page.evaluate((data) => window.__VN.verifyCupResults(data), {
      ...waiting,
      remaining,
      standings: rows.map((row, i) => ({
        ...row,
        finished: i <= 24 - remaining || row.finished,
        totalTime: 100 + i,
      })),
    });
    assert.equal(
      await panel.evaluate((node) => node.isConnected),
      true,
      'waiting panel must not remount and replay its entrance',
    );
    assert.equal(
      await hubButton.evaluate((node) => node === document.activeElement),
      true,
      'focused control stays mounted',
    );
  }
  assert.equal(
    await page.locator('.results-note').textContent(),
    'Waiting for the field · 20s',
  );
  assert.equal(await page.locator('.results-list li').count(), 5);
  assert.equal(
    await page.evaluate(() => document.activeElement.dataset.action),
    'cup-hub',
  );
  const final = {
    ...waiting,
    final: true,
    remaining: 0,
    standings: rows.map((r, i) => ({
      ...r,
      finished: true,
      totalTime: 100 + i,
    })),
  };
  await page.evaluate((data) => window.__VN.verifyCupResults(data), final);
  assert.equal(await page.evaluate(() => document.activeElement.tagName), 'H1');
  assert.equal(
    await page.locator('#front-shell').evaluate((node) => node.scrollTop),
    0,
    'classification opens at the top even after scrolling the waiting panel',
  );
  assert.equal(await page.locator('.cup-standings tbody tr').count(), 5);
  assert.match(
    await page.locator('.cup-grid-progress').textContent(),
    /Next grid: P10 \/ 10/,
  );
  assert.deepEqual(
    await page
      .locator('.cup-standings tbody tr td:first-child')
      .allTextContents(),
    ['3', '4', '5', '6', '7'],
  );
  assert.equal(
    await page.locator('.cup-standings .you td:last-child').textContent(),
    '10',
  );
  assert.equal(
    await page.locator('.cup-personal dd').nth(1).textContent(),
    '+10',
  );
  assert.equal(
    await page.locator('.cup-race-details').getAttribute('open'),
    null,
  );
  assert.equal(
    await page
      .locator('.cup-results-panel .cup-route [aria-current]')
      .evaluate((node) => getComputedStyle(node, '::after').animationName),
    'none',
  );
  await page.evaluate(() => document.body.classList.remove('reduced-motion'));
  assert.equal(
    await page
      .locator('.cup-results-panel .cup-route [aria-current]')
      .evaluate((node) => getComputedStyle(node, '::after').animationName),
    'cup-scored-pulse',
  );
  await page.emulateMedia({ reducedMotion: 'reduce' });
  assert.equal(
    await page
      .locator('.cup-results-panel .cup-route [aria-current]')
      .evaluate((node) => getComputedStyle(node, '::after').animationName),
    'none',
  );
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.evaluate(() => document.body.classList.add('reduced-motion'));
  const fits = async () => {
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      true,
      'no horizontal overflow',
    );
    assert.equal(
      await page
        .locator('#front-shell, .cup-panel')
        .evaluateAll((nodes) =>
          nodes.some((node) => node.scrollWidth > node.clientWidth + 1),
        ),
      false,
      'cup content fits its containers',
    );
    if (width >= 1200 && height >= 900) {
      await page.locator('#front-shell').evaluate((node) => {
        node.scrollTop = 0;
      });
      const layout = await page
        .locator('.cup-results-panel')
        .evaluate((node) => {
          const heading = node
            .querySelector('.cup-result-heading')
            .getBoundingClientRect();
          const actions = node
            .querySelector('.cup-result-actions > .front-actions')
            .getBoundingClientRect();
          const table = node.querySelector('.cup-standings');
          return {
            headingBottom: heading.bottom,
            actionsTop: actions.top,
            actionsBottom: actions.bottom,
            tableFits: table.scrollHeight <= table.clientHeight + 1,
          };
        });
      assert.ok(
        layout.actionsTop >= layout.headingBottom - 1 &&
          layout.actionsTop - layout.headingBottom < 120,
        'cup result actions stay near the heading',
      );
      assert.ok(
        layout.actionsBottom <= height,
        'primary cup result actions are in the first viewport',
      );
      assert.equal(
        layout.tableFits,
        true,
        'standings have no internal scrolling',
      );
      const rewards = page.locator('.earned-rewards .earned-reward');
      if (await rewards.count()) {
        await rewards.last().scrollIntoViewIfNeeded();
        const bounds = await rewards.last().boundingBox();
        assert.ok(
          bounds.y >= 0 && bounds.y + bounds.height <= height + 1,
          'earned rewards remain reachable through outer-page scrolling',
        );
        await page.locator('#front-shell').evaluate((node) => {
          node.scrollTop = 0;
        });
      }
    }
  };
  await fits();
  await page.locator('.cup-options > summary').focus();
  await page.keyboard.press('Space');
  await page.locator('[data-action="cup-abandon"]').focus();
  await page.keyboard.press('Enter');
  assert.equal(
    await page.evaluate(() => document.activeElement.dataset.action),
    'cup-cancel',
  );
  assert.equal(await page.locator('.cup-confirm').isVisible(), true);
  await page.keyboard.press('Escape');
  assert.equal(
    await page.evaluate(() => document.activeElement.dataset.action),
    'cup-abandon',
  );
  assert.equal(await page.locator('.cup-confirm').count(), 0);
  assert.equal(
    (await page.evaluate(() => window.__VN_FRONTEND.getState())).screen,
    'results',
  );
  await page.keyboard.press('KeyS');
  await page.locator('[data-action="settings-back"]').waitFor();
  await page.keyboard.press('Escape');
  assert.equal(
    await page.evaluate(() => document.activeElement.dataset.action),
    'cup-abandon',
    'Settings returns focus inside the reopened cup options',
  );
  const saved = await page.evaluate(
    () => window.__VN_FRONTEND.getState().cup.state,
  );
  assert.equal(saved.cupId, cup.id);
  await page.reload();
  await openCup();
  assert.equal(await page.locator('.cup-title').textContent(), cup.name);
  assert.match(
    await page.locator('.cup-grid-progress').textContent(),
    /Next grid: P10 \/ 10/,
  );
  assert.equal(await page.locator('[data-cup]').count(), 0);
  assert.equal(
    await page.locator('#front-shell').getAttribute('class'),
    'cinematic-menu',
  );
  if (width < 900) await page.locator('[data-action="home"]').first().click();
  assert.match(
    await page.locator('.race-menu [data-action="ship-step"]').textContent(),
    /Locked for this cup/,
  );
  await page.locator('.race-menu [data-action="ship-step"]').click();
  await page.locator('.dedicated-garage').waitFor();
  assert.equal(
    await page
      .locator('.garage-fleet [aria-pressed="true"]')
      .getAttribute('data-ship'),
    saved.shipId,
  );
  assert.equal(
    (await page.evaluate(() => window.__VN_FRONTEND.getState())).shipId,
    saved.shipId,
  );
  await page.locator('[data-action="race-tab"]').click();
  assert.equal(await page.locator('[data-difficulty]').count(), 0);
  if (width < 900) await page.locator('[data-action="circuits"]').click();
  await page.locator('.cup-scores > summary').click();
  assert.equal(await page.locator('.cup-standings').isVisible(), true);
  await page.locator('.cup-scores > summary').click();
  if (width < 900) await page.locator('[data-action="home"]').first().click();
  await page.locator('[data-action="time-trial"]').click();
  await openCup();
  assert.deepEqual(
    await page.evaluate(() => window.__VN_FRONTEND.getState().cup.state),
    saved,
  );
  await page.locator('[data-action="cup-abandon"]').click();
  await page.keyboard.press('Enter');
  assert.equal(
    await page.evaluate(() => document.activeElement.dataset.action),
    'cup-abandon',
  );
  assert.deepEqual(
    await page.evaluate(() => window.__VN_FRONTEND.getState().cup.state),
    saved,
  );
  await page.locator('[data-action="cup-abandon"]').click();
  await page.keyboard.press('Tab');
  assert.equal(
    await page.evaluate(() => document.activeElement.dataset.action),
    'cup-confirm',
  );
  await page.keyboard.press('Enter');
  const otherCup = cup.id === 'founders' ? 'frontier' : 'founders';
  await page.locator(`[data-cup="${otherCup}"]`).click();
  await page.locator('[data-action="cup-start"]').click();
  await page.waitForFunction(
    (id) =>
      window.__VN?.ready &&
      window.__VN_FRONTEND.getState().screen === 'race' &&
      window.__VN_FRONTEND.getState().loadedId === id,
    cupDefinition(otherCup).tracks[0],
    { timeout: 120000 },
  );
  assert.equal(
    await page.evaluate(() => window.__VN_FRONTEND.getState().cup.state.cupId),
    otherCup,
  );
  assert.deepEqual(
    await page.evaluate(
      () => window.__VN_FRONTEND.getState().cup.state.results,
    ),
    [],
  );
  // Resume a saved final event, then classify it through the same frontend callback.
  const finalState = {
    ...saved,
    eventIndex: cup.tracks.length - 1,
    phase: 'racing',
    results: Array.from(
      { length: cup.tracks.length - 1 },
      () => saved.results[0],
    ),
  };
  await page.evaluate(
    ({ key, state }) => localStorage.setItem(key, JSON.stringify(state)),
    { key: careerKey('vector-nova.cup.v1'), state: finalState },
  );
  await page.reload();
  await openCup();
  await page.locator('[data-action="cup-resume"]').click();
  await page.waitForFunction(
    (id) =>
      window.__VN?.ready &&
      window.__VN_FRONTEND.getState().screen === 'race' &&
      window.__VN_FRONTEND.getState().loadedId === id,
    cup.tracks.at(-1),
    { timeout: 120000 },
  );
  await page.evaluate(() => window.__VN.pause());
  await page.evaluate((data) => window.__VN.verifyCupResults(data), final);
  assert.equal(await page.locator('.cup-standings tbody tr').count(), 10);
  assert.equal(await page.locator('.cup-grid-progress').count(), 0);
  assert.equal(
    await page.locator('.cup-standings caption').textContent(),
    'Final cup standings',
  );
  await fits();
  await page.locator('[data-action="cup-abandon"]').focus();
  await page.keyboard.press('Enter');
  await page.keyboard.press('Escape');
  assert.equal(
    await page.evaluate(() => document.activeElement.dataset.action),
    'cup-abandon',
  );
  assert.equal(
    (await page.evaluate(() => window.__VN_FRONTEND.getState())).cup.state
      .results.length,
    cup.tracks.length,
  );
  assert.deepEqual(faults, []);
  console.log(
    `PASS ${cup.name} ${width}x${height}: stable waiting panel, nearby/final standings, keyboard confirmation, saved identity and switching cups`,
  );
} finally {
  await context.close();
  await browser.close();
}
