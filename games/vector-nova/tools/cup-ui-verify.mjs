import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { RACE_OPPONENTS } from '../src/race/roster.js';
import {
  CUPS,
  CUP_STORAGE_KEY,
  cupDefinition,
  createCupStore,
} from '../src/race/cup.js';
import { careerKey, seedVerificationCareer } from './verification-career.mjs';
const sessionReturnOnly = process.argv.includes('--session-return');
assert.ok(process.argv.slice(2).every((flag) => flag === '--session-return'));
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
await (async () => {
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
    const assertSettingsResume = async (name) => {
      await page.locator('[data-action="settings-back"]').waitFor();
      assert.equal(
        await page.locator('.session-return').count(),
        Number(!!name),
      );
      assert.equal(
        await page.locator('[data-action="resume-session"]').count(),
        Number(!!name),
      );
      if (name)
        assert.equal(
          await page.locator('.session-return strong').textContent(),
          `Resume ${name}`,
        );
      assert.ok(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      );
    };
    if (sessionReturnOnly) {
      const order = RACE_OPPONENTS.map((racer) => racer.id);
      order.splice(4, 0, 'player');
      const result = {
        mode: 'cup',
        final: true,
        remaining: 0,
        playerValid: true,
        playerTotalTime: 104,
        courseFormat: 'circuit',
        laps: 2,
        playerLapTimes: [52, 52],
        difficulty: 'easy',
        standings: order.map((id, i) => ({
          id,
          name: id,
          position: i + 1,
          finished: true,
          valid: true,
          totalTime: 100 + i,
        })),
      };
      const winning = {
        ...result,
        playerTotalTime: 100,
        playerLapTimes: [50, 50],
        standings: ['player', ...RACE_OPPONENTS.map((racer) => racer.id)].map(
          (id, i) => ({
            id,
            name: id,
            position: i + 1,
            finished: true,
            valid: true,
            totalTime: 100 + i,
          }),
        ),
      };
      const savedFinal = (classification, complete = false) => {
        const values = new Map();
        const store = createCupStore(() => ({
          getItem: (key) => values.get(key),
          setItem: (key, value) => values.set(key, value),
        }));
        store.start(cup.id, 'shrike', 'easy');
        for (let i = 0; i < cup.tracks.length - 1; i++) {
          store.finish(classification);
          store.next();
        }
        if (complete) store.finish(classification);
        return store.snapshot().state;
      };
      await context.addInitScript(
        ({ key, state }) => {
          if (localStorage.getItem(key) === null)
            localStorage.setItem(key, JSON.stringify(state));
        },
        { key: careerKey(CUP_STORAGE_KEY), state: savedFinal(result) },
      );
      await context.addInitScript(() => {
        window.__cupResumePad = {
          id: 'Cup Settings verification',
          index: 0,
          mapping: 'standard',
          connected: true,
          axes: [0, 0],
          buttons: Array.from({ length: 17 }, () => ({
            pressed: false,
            value: 0,
          })),
        };
        Object.defineProperty(navigator, 'getGamepads', {
          value: () => [window.__cupResumePad],
        });
      });
      const pad = async (index) => {
        for (const pressed of [true, false])
          await page.evaluate(
            ({ index, pressed }) => {
              window.__cupResumePad.buttons[index] = {
                pressed,
                value: Number(pressed),
              };
              return new Promise((resolve) =>
                requestAnimationFrame(() => requestAnimationFrame(resolve)),
              );
            },
            { index, pressed },
          );
      };
      const state = () => page.evaluate(() => window.__VN_FRONTEND.getState());
      const storedCup = () =>
        page.evaluate(
          (key) => JSON.parse(localStorage.getItem(key) ?? 'null'),
          careerKey(CUP_STORAGE_KEY),
        );
      const settings = page.locator('.menu-top-tabs [data-action="settings"]');
      const settingsRoundTrip = async (name, controller = false) => {
        const before = (await state()).screen;
        await settings.focus();
        if (controller) await pad(0);
        else await page.keyboard.press('Enter');
        await assertSettingsResume(name);
        if (controller) await pad(1);
        else await page.keyboard.press('Escape');
        assert.equal((await state()).screen, before);
        assert.ok(
          await settings.evaluate(
            (element) => element === document.activeElement,
          ),
          'Settings Back restores its opener',
        );
      };
      const resumeFinal = async () => {
        await openCup();
        await page.locator('[data-action="cup-resume"]').click();
        await page.waitForFunction(
          () =>
            window.__VN?.ready &&
            window.__VN_FRONTEND.getState().screen === 'race',
          null,
          { timeout: 120000 },
        );
        await page.evaluate(() => {
          window.__VN.pause();
          window.retainedCupRuntime = window.__VN;
        });
      };
      const assertCleared = async () => {
        const current = await state();
        assert.equal(
          current.cup.state,
          null,
          'leaving final results clears the active cup',
        );
        assert.equal(
          await storedCup(),
          null,
          'the scoped active-cup save is cleared',
        );
        assert.equal(
          current.selectedCup,
          cup.id,
          'the finished cup remains selected',
        );
        assert.equal(
          current.sessionCup,
          false,
          'the completed cup runtime is no longer retained',
        );
        assert.equal(
          await page
            .locator(
              '.mode-cup-trophy, .cup-confirm, [data-action="resume-session"], [data-action="cup-resume"]',
            )
            .count(),
          0,
        );
        assert.equal(
          await page
            .locator('.mode-picker [data-action="cup-hub"]')
            .getAttribute('aria-describedby'),
          null,
        );
        assert.equal(
          await page
            .locator('.race-actions > .primary')
            .getAttribute('data-action'),
          current.intent === 'cup' ? 'cup-start' : 'launch',
        );
        if (await page.evaluate(() => !!window.__VN))
          assert.equal(
            await page.evaluate(() => window.__VN.hasSession()),
            false,
          );
      };
      await page.goto(base + '?intro=0&music=0');
      await resumeFinal();
      await page.locator('#home').click();
      await settingsRoundTrip('Cup Race');
      await settingsRoundTrip('Cup Race', true);
      await page.locator('[data-action="cup-resume"]').click();
      await page.waitForFunction(
        () => window.__VN_FRONTEND.getState().screen === 'race',
      );
      await page.evaluate(() => window.__VN.pause());
      await page.evaluate((data) => window.__VN.verifyCupResults(data), result);
      const completed = (await state()).cup.state;
      assert.equal(
        await page
          .locator(
            '[data-action="cup-retry"], [data-action="cup-restart"], [data-action="cup-abandon"]',
          )
          .count(),
        0,
      );
      await page.locator('[data-action="cup-hub"]').focus();
      await page.keyboard.press('KeyS');
      await assertSettingsResume(null);
      assert.deepEqual(
        (await state()).cup.state,
        completed,
        'Settings retains the final cup',
      );
      await page.keyboard.press('Escape');
      assert.equal((await state()).screen, 'results');
      assert.equal(
        await page.evaluate(() => document.activeElement.dataset.action),
        'cup-hub',
      );
      assert.equal(
        await page.locator('.cup-standings caption').textContent(),
        'Final cup standings',
      );
      await page.keyboard.press('KeyS');
      await page.locator('.menu-top-tabs [data-action="career"]').click();
      assert.deepEqual(
        (await state()).cup.state,
        completed,
        'Career retains the final cup',
      );
      await page.keyboard.press('Escape');
      assert.equal((await state()).screen, 'results');
      await page.keyboard.press('Escape');
      await assertCleared();
      assert.equal(
        await page.evaluate(() => document.activeElement.dataset.action),
        'cup-hub',
      );
      await page.locator('[data-action="garage-tab"]').focus();
      await page.keyboard.press('Enter');
      assert.equal(
        await page.locator('.garage-fleet button:disabled').count(),
        0,
        'the ship picker is no longer cup locked',
      );
      await page.keyboard.press('Escape');

      // A winning final uses the same result callback; B reveals standings before
      // the primary action clears the run. Rewards and trophies have separate owners.
      await page.evaluate(
        ({ key, state }) => localStorage.setItem(key, JSON.stringify(state)),
        { key: careerKey(CUP_STORAGE_KEY), state: savedFinal(winning) },
      );
      await page.reload();
      await resumeFinal();
      await page.evaluate(
        (data) => window.__VN.verifyCupResults(data),
        winning,
      );
      await page.locator('.cup-victory').waitFor();
      await pad(1);
      assert.equal((await state()).screen, 'results');
      assert.equal(
        (await state()).cup.state.results.length,
        cup.tracks.length,
        'controller Back first reveals final standings',
      );
      assert.equal(
        await page.locator('.cup-standings caption').textContent(),
        'Final cup standings',
      );
      const awarded = await state();
      assert.ok(awarded.career.state.cups.includes(cup.id));
      assert.ok(awarded.cupCollection.cups[cup.id]);
      await page.locator('[data-action="cup-hub"]').focus();
      await pad(0);
      await assertCleared();
      assert.deepEqual(
        (await state()).career.state,
        awarded.career.state,
        'clearing preserves earned progress/rewards',
      );
      assert.deepEqual(
        (await state()).cupCollection,
        awarded.cupCollection,
        'clearing preserves the trophy',
      );
      for (const [action, label] of [
        ['practice', 'Practice'],
        ['quick-race', 'Quick Race'],
      ]) {
        await page.locator('[data-action="race-tab"]').click();
        await page.locator(`[data-action="${action}"]`).click();
        await page.locator('[data-action="launch"]').click();
        await page.waitForFunction(
          () => window.__VN_FRONTEND.getState().screen === 'race',
        );
        await page.evaluate(() => window.__VN.pause());
        await page.locator('#home').click();
        assert.equal((await state()).cup.state, null);
        await settingsRoundTrip(label, action === 'quick-race');
        assert.ok(
          await page.evaluate(() => window.__VN === window.retainedCupRuntime),
          'checks reuse the loaded final-event world',
        );
      }
      await page.evaluate(
        ({ key, state }) => localStorage.setItem(key, JSON.stringify(state)),
        { key: careerKey(CUP_STORAGE_KEY), state: savedFinal(winning, true) },
      );
      await page.reload();
      await page.locator('[data-action="cup-hub"]').waitFor();
      await assertCleared();
      assert.deepEqual(
        (await state()).career.state,
        awarded.career.state,
        'startup cleanup preserves earned progress',
      );
      assert.deepEqual(
        (await state()).cupCollection,
        awarded.cupCollection,
        'startup cleanup preserves the trophy',
      );
      assert.deepEqual(faults, []);
      console.log(
        `PASS cup completion lifecycle ${width}x${height}: Settings/Career retention, keyboard/controller exit, rewards, startup cleanup and noncup Resume`,
      );
      return;
    }
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
    assert.equal(
      await page.evaluate(() => document.activeElement.tagName),
      'H1',
    );
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
    await assertSettingsResume('Cup Race');
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
      await page.evaluate(
        () => window.__VN_FRONTEND.getState().cup.state.cupId,
      ),
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
    assert.equal(
      await page
        .locator(
          '[data-action="cup-retry"], [data-action="cup-restart"], [data-action="cup-abandon"]',
        )
        .count(),
      0,
    );
    const completedCup = (
      await page.evaluate(() => window.__VN_FRONTEND.getState())
    ).cup.state;
    await page.locator('[data-action="cup-hub"]').focus();
    await page.keyboard.press('KeyS');
    await assertSettingsResume(null);
    await page.keyboard.press('Escape');
    assert.equal(
      await page.evaluate(() => document.activeElement.dataset.action),
      'cup-hub',
    );
    assert.deepEqual(
      (await page.evaluate(() => window.__VN_FRONTEND.getState())).cup.state,
      completedCup,
      'Settings keeps final standings available',
    );
    await page.keyboard.press('Enter');
    assert.equal(
      (await page.evaluate(() => window.__VN_FRONTEND.getState())).cup.state,
      null,
    );
    assert.equal(
      await page.evaluate(
        (key) => JSON.parse(localStorage.getItem(key) ?? 'null'),
        careerKey(CUP_STORAGE_KEY),
      ),
      null,
    );
    assert.equal(
      await page
        .locator(
          '.cup-confirm, .mode-cup-trophy, [data-action="resume-session"]',
        )
        .count(),
      0,
    );
    assert.deepEqual(faults, []);
    console.log(
      `PASS ${cup.name} ${width}x${height}: stable waiting panel, nearby/final standings, keyboard confirmation, saved identity and switching cups`,
    );
  } finally {
    await context.close();
    await browser.close();
  }
})();
