import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import {
  cupDefinition,
  cupRaceRows,
  cupStandings,
  cupGridOrder,
  cupChampion,
  CUP_POINTS,
  CUP_STORAGE_KEY,
  createCupStore,
} from '../src/race/cup.js';
import { createRaceGrid, RACE_ORDER } from '../src/race/roster.js';
import { createMemoryStorage } from '../src/progression/careers.js';
import { createProfileStore } from '../src/progression/profile.js';
import { REWARDS } from '../src/progression/catalog.js';
import { SHIPS } from '../src/ships/catalog.js';
import { careerKey, seedVerificationCareer } from './verification-career.mjs';
// VN_CUP_ID=horizon VN_CUP_FINAL_ONLY=1 VN_CUP_SHIP=bastion selects the
// actual sprint finale with only its two earlier event scores seeded.
const cup = cupDefinition(process.env.VN_CUP_ID ?? 'founders');
assert.ok(cup, 'VN_CUP_ID must name an available cup');
const finalOnly = process.env.VN_CUP_FINAL_ONLY === '1';
const profileFinish = process.env.VN_CUP_PROFILE === '1';
assert.ok(
  !finalOnly || cup.id === 'horizon',
  'Final-only mode uses Horizon Cup',
);
const shipId = process.env.VN_CUP_SHIP ?? 'shrike';
assert.ok(
  SHIPS.some((ship) => ship.id === shipId),
  'VN_CUP_SHIP must name a player chassis',
);
const base = process.env.VN_URL;
if (!base) throw Error('Set VN_URL to a dev server');
const [width, height] = (process.env.VN_CUP_VIEWPORT ?? '1440x900')
  .split('x')
  .map(Number);
const touch = width < 900;
const browser = await chromium.launch({
  args: ['--mute-audio'],
  headless: true,
  channel: 'chrome',
});
const context = await browser.newContext({
  viewport: { width, height },
  hasTouch: touch,
});
const faults = [];
try {
  await seedVerificationCareer(context);
  const fixture = createMemoryStorage();
  const profile = createProfileStore(() => fixture);
  const shipReward = REWARDS.find((reward) => reward.ship === shipId);
  if (shipReward?.requirement.cup)
    profile.recordCup(shipReward.requirement.cup);
  if (finalOnly) {
    const store = createCupStore(() => fixture);
    store.start(cup.id, shipId, 'easy');
    for (let event = 0; event < cup.tracks.length - 1; event++) {
      const state = store.snapshot().state;
      store.finish({
        standings: RACE_ORDER.map((id, index) => ({
          id,
          finished: true,
          valid: true,
          totalTime: 100 + index,
        })),
      });
      profile.recordRace({ id: `${state.runId}:${event}`, position: 1 });
      store.next();
    }
  }
  await context.addInitScript(
    ({ marker, entries }) => {
      if (localStorage.getItem(marker)) return;
      for (const [key, value] of entries) localStorage.setItem(key, value);
      localStorage.setItem(marker, '1');
    },
    {
      marker: careerKey('cup-verification-seeded'),
      entries: Array.from({ length: fixture.length }, (_, index) => {
        const key = fixture.key(index);
        return [careerKey(key), fixture.getItem(key)];
      }),
    },
  );
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
  if (profileFinish)
    await context.route('**/src/core/cup-finish.js*', async (route) => {
      const response = await route.fetch();
      const source = await response.text();
      const signature = 'export function createCupFinish(';
      assert.ok(source.includes(signature));
      await route.fulfill({
        response,
        body:
          source.replace(signature, 'function createUnprofiledCupFinish(') +
          `
export function createCupFinish(options) {
  const profile = window.__cupForecastProfile = {
    startedAt: performance.now(), rafStart: window.__cupForecastRafs ?? 0,
    batches: 0, batchMs: 0, maxBatchMs: 0,
    resolveCount: 0, resolveMs: null,
  };
  const resolver = createUnprofiledCupFinish({
    ...options,
    async resolve() {
      const start = performance.now();
      profile.resolveCount++;
      try { return await options.resolve(); }
      finally { profile.resolveMs = performance.now() - start; }
    },
  });
  return { ...resolver, advance(dt) {
    const start = performance.now();
    try { return resolver.advance(dt); }
    finally {
      const elapsed = performance.now() - start;
      profile.batches++;
      profile.batchMs += elapsed;
      profile.maxBatchMs = Math.max(profile.maxBatchMs, elapsed);
    }
  } };
}
`,
      });
    });
  await context.route('**/src/core/game.js*', async (route) => {
    const response = await route.fetch();
    const source = await response.text();
    assert.ok(source.includes('      getSnapshot() {'));
    const instrumented = profileFinish
      ? source.replace(
          '    function render(now) {',
          `    function render(now) {
      window.__cupForecastRafs = (window.__cupForecastRafs ?? 0) + 1;`,
        )
      : source;
    await route.fulfill({
      response,
      body: instrumented.replace(
        '      getSnapshot() {',
        `
      verifyCupMotion() {
        return {
          at: performance.now(), tick, time: state.time,
          forecast: {
            complete: cupProgress?.complete ?? false,
            ready: cupProgress?.ready ?? false,
            result: !!cupProgress?.result,
            final: !!cupFinalResult,
            finishAt, resultsDismissed, suspended,
            profile: window.__cupForecastProfile && {
              ...window.__cupForecastProfile,
              wallMs: performance.now() - window.__cupForecastProfile.startedAt,
              rafs: (window.__cupForecastRafs ?? 0) - window.__cupForecastProfile.rafStart,
            },
          },
          opponents: racers.opponents.map(({ specification, runtime }) => ({
            id: specification.id, position: runtime.pose(1).position.toArray(),
          })),
        };
      },
      verifyCupStep(ticks) {
        cancelCountdown();
        if (cupFinalResult) return this.getSnapshot();
        mode = 'racing';
        for (let i = 0; i < ticks; i++) {
          const finished = race.history.length >= (track.closed === false ? 1 : 2);
          if (finished) break;
          advanceTick(racerModule.getRacerControl(state, track, { runtime, difficulty: 'hard' }));
        }
        if (race.history.length >= (track.closed === false ? 1 : 2))
          window.__cupPlayerFinishStepAt ??= performance.now();
        if (race.history.length < (track.closed === false ? 1 : 2)) pause();
        return this.getSnapshot();
      },
      getSnapshot() {`,
      ),
    });
  });
  const page = await context.newPage();
  const navigations = [];
  page.on('framenavigated', (frame) => {
    if (frame === page.mainFrame())
      navigations.push({ url: frame.url(), at: Date.now() });
  });
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
    console.log(`Checking ${level}`);
    try {
      await page.waitForFunction(
        (level) => {
          const frontend = window.__VN_FRONTEND?.getState();
          return (
            frontend?.error ||
            (window.__VN?.ready &&
              frontend?.loadedId === level &&
              frontend.screen === 'race')
          );
        },
        level,
        { timeout: 120000 },
      );
      assert.equal((await state()).error, '', 'race setup succeeds');
    } catch (error) {
      const diagnostic = await page.evaluate(() => {
        const frontend = window.__VN_FRONTEND?.getState();
        const runtime = window.__VN?.getSnapshot?.();
        return {
          frontend: frontend && {
            screen: frontend.screen,
            loadedId: frontend.loadedId,
            loading: frontend.loading,
            error: frontend.error,
            cup: frontend.cup.state && {
              cupId: frontend.cup.state.cupId,
              eventIndex: frontend.cup.state.eventIndex,
              phase: frontend.cup.state.phase,
              scored: frontend.cup.state.results.length,
            },
          },
          runtime: {
            present: !!window.__VN,
            ready: window.__VN?.ready,
            mode: runtime?.mode,
            tick: runtime?.tick,
            errors: runtime?.errors,
          },
          visible: document.body.innerText.slice(-1500),
        };
      });
      console.error(
        'Cup entry diagnostic',
        JSON.stringify({ faults, ...diagnostic }),
      );
      throw error;
    }
    await page.evaluate(() => window.__VN.pause());
    const snap = await page.evaluate(() => window.__VN.getSnapshot());
    assert.equal(snap.ship.id, shipId);
    assert.equal(snap.competition.difficulty, 'easy');
    assert.ok(snap.cup);
    assert.equal(
      snap.competition.courseFormat,
      snap.track.closed ? 'circuit' : 'sprint',
    );
    assert.equal(snap.competition.laps, snap.track.closed ? 2 : 1);
    assert.equal(snap.competition.standings.length, 10);
    assert.equal(snap.lap.history.length, 0);
    assert.equal(snap.vehicle.energy, 100);
    const current = (await state()).cup.state;
    assert.equal(current.cupId, cup.id);
    const order = cupGridOrder(current);
    const grid = createRaceGrid(order);
    assert.deepEqual(snap.cup.gridOrder, order);
    assert.deepEqual(
      snap.competition.standings.map((row) => row.id),
      order,
    );
    for (const row of snap.competition.standings) {
      assert.equal(row.distance, grid[row.id].distance);
      assert.equal(row.lateral, grid[row.id].lateral);
    }
    console.log(`PASS native cup grid: ${level} / ${shipId}`);
  }
  let checkedFinishPause = false;
  function realRate(before, after) {
    const wallSeconds = (after.at - before.at) / 1000;
    assert.ok(after.time >= before.time, 'live simulation time never rewinds');
    assert.ok(
      after.time - before.time <= wallSeconds + 0.2,
      'visible physics advances at ordinary real time while classification runs',
    );
    assert.ok(
      after.tick - before.tick <= 120 * (wallSeconds + 0.2),
      'classification never adds forecast ticks to the live world',
    );
  }
  async function reportFinish(error) {
    const diagnostic = await page.evaluate(() => {
      const frontend = window.__VN_FRONTEND?.getState();
      const runtime = window.__VN?.getSnapshot?.();
      const metrics = window.__VN?.getMetrics?.();
      return {
        url: location.href,
        readyState: document.readyState,
        visible: frontend ? undefined : document.body.innerText.slice(-1500),
        frontend: frontend && {
          screen: frontend.screen,
          intent: frontend.intent,
          sessionCup: frontend.sessionCup,
          cup: frontend.cup.state && {
            cupId: frontend.cup.state.cupId,
            eventIndex: frontend.cup.state.eventIndex,
            phase: frontend.cup.state.phase,
            scored: frontend.cup.state.results.length,
          },
          progress: {
            points: frontend.career.state.points,
            cups: frontend.career.state.cups,
            claims: frontend.career.state.claims,
          },
        },
        runtime: runtime && {
          mode: runtime.mode,
          tick: runtime.tick,
          time: runtime.vehicle.time,
          competition: runtime.competition,
          errors: runtime.errors,
        },
        motion: window.__VN?.verifyCupMotion?.(),
        metrics: metrics && {
          frames: metrics.frames,
          frameMs: metrics.frameMs,
          calls: metrics.calls,
          triangles: metrics.triangles,
        },
      };
    });
    console.error(
      'Cup finish diagnostic',
      JSON.stringify({
        error: error && { name: error.name, message: error.message },
        faults,
        navigations,
        ...diagnostic,
      }),
    );
  }
  async function finish() {
    await page.evaluate(() => {
      window.cupWaitingSeen = false;
      window.__cupPlayerFinishStepAt = null;
      window.__cupResultsObservedAt = null;
      window.cupWaitingObserver?.disconnect();
      window.cupWaitingObserver = new MutationObserver(() => {
        window.cupWaitingSeen ||= !!document.querySelector('.cup-waiting');
        const frontend = window.__VN_FRONTEND?.getState();
        if (
          frontend?.cup.state?.phase === 'results' &&
          frontend.screen === 'results'
        )
          window.__cupResultsObservedAt ??= performance.now();
      });
      window.cupWaitingObserver.observe(document.body, {
        childList: true,
        subtree: true,
      });
    });
    for (let n = 0; n < 65; n++) {
      const current = await state();
      if (current.cup.state.phase === 'results' && current.screen === 'results')
        break;
      const stepped = await page.evaluate(() =>
        window.__VN.verifyCupStep(1200),
      );
      if (stepped.competition.playerFinished) {
        await page.locator('#race-finish').waitFor({ state: 'visible' });
        const finishMotion = await page.evaluate(() =>
          window.__VN.verifyCupMotion(),
        );
        if (!checkedFinishPause) {
          await page.keyboard.press('Escape');
          const paused = await page.evaluate(() => window.__VN.getSnapshot());
          assert.equal(paused.mode, 'paused');
          await page.waitForTimeout(350);
          assert.equal(
            (await page.evaluate(() => window.__VN.getSnapshot())).tick,
            paused.tick,
            'pause freezes live physics while classification may finish',
          );
          await page.locator('#resume')[touch ? 'tap' : 'click']();
          checkedFinishPause = true;
        }
        try {
          await page.waitForFunction(
            () => {
              const frontend = window.__VN_FRONTEND.getState();
              return (
                frontend.cup.state?.phase === 'results' &&
                frontend.screen === 'results'
              );
            },
            null,
            { timeout: profileFinish ? 30000 : 15000 },
          );
        } catch (error) {
          try {
            await reportFinish(error);
          } catch (diagnosticError) {
            console.error(
              'Cup finish diagnostic unavailable',
              JSON.stringify({
                error: error.message,
                diagnosticError: diagnosticError.message,
                faults,
                navigations,
                url: page.url(),
              }),
            );
          }
          throw error;
        }
        if (profileFinish) await reportFinish();
        const elapsed = await page.evaluate(
          () => window.__cupResultsObservedAt - window.__cupPlayerFinishStepAt,
        );
        assert.ok(Number.isFinite(elapsed));
        const resolved = await page.evaluate(() =>
          window.__VN.verifyCupMotion(),
        );
        realRate(finishMotion, resolved);
        await page.waitForTimeout(350);
        const continuing = await page.evaluate(() =>
          window.__VN.verifyCupMotion(),
        );
        realRate(resolved, continuing);
        assert.ok(
          continuing.opponents.some((rival, index) =>
            rival.position.some(
              (value, axis) =>
                Math.abs(value - resolved.opponents[index].position[axis]) >
                1e-5,
            ),
          ),
          'opponents keep driving behind the results at ordinary speed',
        );
        assert.ok(
          elapsed >= 2000,
          'the finish banner uses real presentation time',
        );
        const remaining = stepped.competition.standings.filter(
          (r) => !r.finished,
        ).length;
        console.log(
          `PASS production cup classification: ${elapsed}ms to presented standings, ${remaining} rivals still racing at player finish; live field continues at real time`,
        );
        break;
      }
      await page.waitForTimeout(30);
    }
    const s = await state();
    if (s.cupCelebration) {
      await page.locator('.cup-victory').waitFor();
      await click('cup-standings');
    }
    assert.equal(
      await page.evaluate(() => window.cupWaitingSeen),
      false,
      'finish goes directly to scored standings',
    );
    assert.equal(
      s.cup.state.phase,
      'results',
      JSON.stringify(await page.evaluate(() => window.__VN.getSnapshot().lap)),
    );
    assert.equal(s.cup.state.results.at(-1).length, 10);
    const snapshot = await page.evaluate(() => window.__VN.getSnapshot());
    const result = snapshot.competition.results;
    const laps = snapshot.track.closed ? 2 : 1;
    assert.equal(result.laps, laps);
    assert.equal(result.playerLapTimes.length, laps);
    assert.equal(
      result.playerValid,
      true,
      'the player completes a valid course',
    );
    assert.equal(snapshot.lap.history.length, laps);
    assert.equal(
      s.cup.state.results.at(-1).find((r) => r.id === 'player').status,
      'finished',
    );
    const scored = cupRaceRows(s.cup.state.results.at(-1));
    assert.equal(scored[0].points, 25);
    for (const row of scored)
      assert.equal(
        row.points,
        row.status === 'finished' ? CUP_POINTS[row.position - 1] : 0,
      );
    assert.equal(
      scored.find((r) => r.id === 'player').timeMs,
      Math.round(result.playerTotalTime * 1000),
    );
    const formats = await page.locator('.cup-route small').allTextContents();
    assert.match(
      formats[s.cup.state.eventIndex],
      snapshot.track.closed
        ? /Circuit · 2 laps · Scored/
        : /Sprint · 1 descent · Scored/,
    );
    const standings = cupStandings(s.cup.state);
    const playerIndex = standings.findIndex((row) => row.id === 'player');
    const expected =
      s.cup.state.results.length === cup.tracks.length
        ? standings
        : standings.slice(Math.max(0, playerIndex - 2), playerIndex + 3);
    assert.deepEqual(
      await page
        .locator('.cup-standings tbody tr td:nth-of-type(2)')
        .allTextContents(),
      expected.map((r) => String(r.points)),
    );
    if (!snapshot.track.closed) {
      assert.equal(snapshot.lap.complete, true);
      const saved = s.cup.state;
      await page.evaluate(() => window.__VN.verifyCupStep(1200));
      assert.deepEqual(
        (await state()).cup.state,
        saved,
        'the sprint is scored only once',
      );
      assert.equal(
        (await page.evaluate(() => window.__VN.getSnapshot())).competition
          .results.playerTotalTime,
        result.playerTotalTime,
      );
    }
    assert.equal(
      await page.locator('.cup-standings tbody tr').count(),
      expected.length,
    );
    await fits();
    console.log(
      'PASS event',
      s.cup.state.eventIndex + 1,
      s.cup.state.results.at(-1).find((r) => r.id === 'player'),
    );
    await page.evaluate(() => window.cupWaitingObserver.disconnect());
  }
  await page.goto(base + '?intro=0&music=0');
  await click('cup-hub');
  if (touch) await click('circuits');
  if (finalOnly) {
    assert.equal(
      (await state()).cup.state.results.length,
      cup.tracks.length - 1,
    );
    await click('cup-resume');
    await ready(cup.tracks.at(-1));
    await finish();
  } else {
    await page.locator(`[data-cup="${cup.id}"]`)[touch ? 'tap' : 'click']();
    assert.equal(await page.locator('.cup-title').textContent(), cup.name);
    await fits();
    if (touch) await click('home');
    await click('ship-step');
    await page.locator(`[data-ship="${shipId}"]`)[touch ? 'tap' : 'click']();
    await click('race-tab');
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
          {
            x: bounds.x + bounds.width / 2,
            y: bounds.y + bounds.height * 0.12,
          },
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
    const beforeRestart = (await state()).cup.state;
    await page.locator('.cup-options > summary').click();
    await click('cup-restart');
    await click('cup-cancel');
    assert.deepEqual((await state()).cup.state, beforeRestart);
    await page.locator('.cup-options > summary').click();
    await click('cup-restart');
    await click('cup-confirm');
    await ready(cup.tracks[0]);
    assert.equal((await state()).cup.state.results.length, 0);
    assert.notEqual((await state()).cup.state.runId, beforeRestart.runId);
    await finish();
    await click('cup-retry');
    await ready(cup.tracks[0]);
    assert.equal((await state()).cup.state.results.length, 0);
    await finish();
    const first = (await state()).cup.state.results[0];
    await page.reload();
    await click('cup-hub');
    if (touch) await click('circuits');
    assert.equal((await state()).cup.state.phase, 'results');
    assert.deepEqual((await state()).cup.state.results[0], first);
    for (let event = 1; event < cup.tracks.length; event++) {
      const prior = (await state()).cup.state.results;
      await click('cup-next');
      await ready(cup.tracks[event]);
      // An unfinished circuit or sprint restarts after reload with prior scores intact.
      await page.reload();
      await click('cup-hub');
      if (touch) await click('circuits');
      assert.equal((await state()).cup.state.eventIndex, event);
      assert.deepEqual((await state()).cup.state.results, prior);
      await click('cup-resume');
      await ready(cup.tracks[event]);
      await finish();
      if (event < cup.tracks.length - 1) {
        await click('cup-retry');
        await ready(cup.tracks[event]);
        assert.deepEqual((await state()).cup.state.results, prior);
        await finish();
      }
    }
  }
  const completed = await state();
  assert.equal(completed.cup.state.results.length, cup.tracks.length);
  if (finalOnly) {
    const champion = cupChampion(completed.cup.state);
    assert.ok(champion, 'the actual final race earns the Horizon championship');
    assert.ok(completed.career.state.cups.includes(cup.id));
    assert.ok(completed.career.state.claims.includes('ship-kestrel'));
    assert.equal(completed.cupCollection.cups[cup.id].points, champion.points);
  }
  const assertCompleted = async () => {
    const current = await state();
    assert.deepEqual(current.cup.state, completed.cup.state);
    assert.deepEqual(current.career.state, completed.career.state);
    assert.deepEqual(current.cupCollection.cups, completed.cupCollection.cups);
  };
  for (const action of ['cup-next', 'cup-retry', 'cup-restart', 'cup-abandon'])
    assert.equal(
      await page.locator(`[data-action="${action}"]`).count(),
      0,
      `completed cups have no ${action} control`,
    );
  await page.getByText('Final cup standings', { exact: true }).waitFor();
  await click('settings');
  assert.equal((await state()).screen, 'settings');
  await assertCompleted();
  await click('settings-back');
  assert.equal((await state()).screen, 'results');
  await assertCompleted();
  await click('settings');
  await click('career');
  assert.equal((await state()).screen, 'career');
  await assertCompleted();
  await page.locator('[data-progression-career] [data-close]').click();
  assert.equal((await state()).screen, 'results');
  await assertCompleted();
  await page.getByText('Final cup standings', { exact: true }).waitFor();
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
    false,
  );
  const chooseAnother = page.locator(
    '.cup-result-actions .primary[data-action="cup-hub"]',
  );
  assert.match(await chooseAnother.textContent(), /Choose another cup/);
  if (touch) await chooseAnother.tap();
  else {
    await chooseAnother.focus();
    await page.keyboard.press('Enter');
  }
  const assertCleared = async ({ preserveSelection = true } = {}) => {
    const current = await state();
    assert.equal(current.cup.state, null);
    if (preserveSelection) assert.equal(current.selectedCup, cup.id);
    assert.equal(current.sessionCup, false);
    assert.deepEqual(current.career.state, completed.career.state);
    assert.deepEqual(current.cupCollection.cups, completed.cupCollection.cups);
    assert.equal(await page.locator('.cup-confirm').count(), 0);
  };
  assert.equal((await state()).screen, touch ? 'home' : 'cup');
  await assertCleared();
  // Reopen the actual completed save as if the page closed on final standings.
  await page.evaluate(
    ({ key, saved }) => localStorage.setItem(key, JSON.stringify(saved)),
    { key: careerKey(CUP_STORAGE_KEY), saved: completed.cup.state },
  );
  await page.reload();
  await page.locator('[data-action="cup-hub"]').first().waitFor();
  assert.equal((await state()).screen, 'home');
  await assertCleared();
  await click('cup-hub');
  if (touch) await click('circuits');
  if (!finalOnly) {
    await click('cup-start');
    await ready(cup.tracks[0]);
    assert.equal((await state()).cup.state.results.length, 0);
    await page.locator('#home')[touch ? 'tap' : 'click']();
    await click('cup-abandon');
    await click('cup-cancel');
    assert.equal((await state()).cup.state.phase, 'racing');
    await click('cup-abandon');
    await click('cup-confirm');
    await assertCleared();
    await page.reload();
    await page.locator('[data-action="cup-hub"]').first().waitFor();
    await assertCleared({ preserveSelection: false });
  }
  assert.deepEqual(faults, []);
  console.log(
    `PASS ${cup.name} ${width}x${height} ${shipId}: ${finalOnly ? 'native final race with two seeded prior scores' : 'full real-physics cup, ship lock, reload, unfinished retry/restart/abandon'}, final utility returns and automatic completed-cup exit`,
  );
} finally {
  await context.close();
  await browser.close();
}
