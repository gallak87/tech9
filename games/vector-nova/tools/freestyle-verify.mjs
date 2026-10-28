import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const url = process.env.VN_URL ?? 'http://127.0.0.1:5213';
const browser = await chromium.launch({
  channel: 'chrome',
  headless: true,
  args: ['--mute-audio'],
});
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));

// Fixed ticks run the unchanged live session, with ordinary normalized controls.
// This response-only probe is never present in the application or its builds.
await page.route('**/src/core/game.js*', async (route) => {
  const response = await route.fetch(),
    body = await response.text();
  assert.ok(body.includes('getSnapshot() {'));
  await route.fulfill({
    response,
    body: body.replace(
      'getSnapshot() {',
      `
    stepFreestyle(n,control={}){
      cancelCountdown();mode='racing';ui.setMode(mode);
      for(let i=0;i<Math.min(n,1200)&&mode==='racing';i++)
        advanceTick(typeof control==='function'?control({state:{...state},motion:runtime.snapshot(),pose:runtime.pose(1),track}):control);
      if(mode==='racing')pause();return this.getSnapshot();
    },getSnapshot() {`,
    ),
  });
});

export function pilot({ state, motion, track }) {
  const f = motion.freestyle;
  const jump =
    track.jumps.find((j) => j.id === f.flight?.id) ??
    track.jumps[Math.min(f.legs.length, 4)];
  const airborne = !!motion.flight;
  const steer = Math.max(
    -0.9,
    Math.min(
      0.9,
      (state.lateral - jump.targetLateral) * 0.04 +
        state.heading * 1.8 +
        state.lateralSpeed * 0.03 -
        (track.sample(state.distance).curvature * state.speed) / (1.5 * 1.24),
    ),
  );
  return {
    throttle: 1,
    brake: 0,
    steer,
    boost: false,
    airbrake:
      airborne &&
      f.touchdown != null &&
      f.touchdown < 0.35 &&
      f.touchdown > 0.03,
    aerialRoll:
      airborne &&
      motion.flight.elapsed > 0.15 &&
      f.flight?.tricks.length === 0 &&
      f.progress[2] < 5.45
        ? -1
        : 0,
    aerialPitch: 0,
    aerialYaw: 0,
  };
}

try {
  await page.goto(`${url}/?level=launchworks&music=0`);
  await page.waitForFunction(
    () => window.__VN_FRONTEND?.getState().screen === 'home',
  );
  await page.setViewportSize({ width: 1280, height: 720 });
  assert.equal(
    await page.evaluate(() => !!window.__VN),
    false,
    'setup does not load a world',
  );
  const fit = await page.locator('#front-shell').evaluate((node) => ({
    vertical: node.scrollHeight - node.clientHeight,
    horizontal: node.scrollWidth - node.clientWidth,
  }));
  assert.ok(
    fit.vertical <= 1 && fit.horizontal <= 1,
    'the pilot menu fits a short desktop viewport',
  );
  await page.locator('[data-action="quick-race"]').click();
  assert.notEqual(
    await page.evaluate(() => window.__VN_FRONTEND.getState().selected),
    'launchworks',
  );
  assert.equal(
    await page.locator('[data-level="launchworks"]').count(),
    0,
    'normal races exclude the freestyle course',
  );
  await page.locator('[data-action="freestyle"]').focus();
  await page.keyboard.press('Enter');
  assert.equal(
    await page.evaluate(() => window.__VN_FRONTEND.getState().selected),
    'launchworks',
  );
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page
    .getByRole('button', { name: 'Start Freestyle', exact: false })
    .click();
  await page.waitForFunction(
    () =>
      window.__VN?.ready &&
      window.__VN_FRONTEND?.getState().screen === 'race' &&
      !window.__VN_FRONTEND.getState().loading,
  );
  await page.waitForFunction(
    () => window.__VN.getSnapshot().camera.position[2] < -12,
  );
  assert.ok(
    (await page.evaluate(() => window.__VN.getSnapshot().vehicle.distance)) < 1,
    'the chase camera starts behind the grid before driving',
  );
  for (const [modifier, directions, expected] of [
    [
      'ControlLeft',
      ['KeyW', 'KeyA'],
      { aerialPitch: -1, aerialRoll: 1, aerialYaw: 0, boost: false },
    ],
    ['ControlLeft', ['KeyD'], { aerialRoll: -1, boost: false }],
    ['ControlLeft', ['KeyQ'], { aerialYaw: 1, boost: false }],
    ['ShiftLeft', ['KeyD'], { aerialRoll: 0, boost: true }],
  ]) {
    await page.evaluate(() => window.__VN.loadScenario('jump1-success'));
    await page.keyboard.down(modifier);
    for (const key of directions) await page.keyboard.down(key);
    const sampled = await page.evaluate(() => window.__VN.getSnapshot().input);
    for (const [axis, value] of Object.entries(expected))
      assert.equal(sampled[axis], value);
    await page.waitForFunction(
      () => window.__VN.getSnapshot().runtime.state.flight?.elapsed > 0.5,
    );
    const held = await page.evaluate(() => {
      window.__VN.pause();
      return window.__VN.getSnapshot();
    });
    if (modifier === 'ShiftLeft')
      assert.equal(
        Math.hypot(...held.runtime.state.freestyle.angular),
        0,
        'boost never requests a trick',
      );
    else
      assert.ok(
        Math.hypot(...held.runtime.state.flight.angularVelocity) > 1,
        'held directions rotate the actual hull',
      );
    assert.ok(
      Math.abs(held.camera.up[0]) < 0.08 && held.camera.up[1] > 0.95,
      `the camera keeps a readable horizon with ordinary speed feedback: ${held.camera.up}`,
    );
    for (const key of directions) await page.keyboard.up(key);
    await page.keyboard.up(modifier);
    await page.waitForTimeout(150);
    assert.equal(
      await page.evaluate(
        () => window.__VN.getSnapshot().runtime.state.freestyle.clock,
      ),
      held.runtime.state.freestyle.clock,
      'pause freezes trick physics',
    );
  }
  console.log(
    'PASS · compact setup, keyboard entry, held directional input and pause',
  );
  await page.evaluate(() => {
    window.__testPad = {
      id: 'freestyle-check',
      index: 0,
      mapping: 'standard',
      connected: true,
      axes: [-0.8, -1, 0.6, 0],
      buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })),
    };
    Object.defineProperty(navigator, 'getGamepads', {
      configurable: true,
      value: () => [window.__testPad],
    });
    window.__VN.loadScenario('jump1-success');
  });
  await page.waitForFunction(() => window.__VN.getSnapshot().gamepadPresent);
  await page.evaluate(() => {
    window.__testPad.buttons[2] = { pressed: true, value: 1 };
  });
  await page.waitForFunction(
    () => window.__VN.getSnapshot().input.aerialPitch < -0.9,
  );
  const stick = await page.evaluate(() => {
    const input = window.__VN.getSnapshot().input;
    window.__VN.pause();
    return input;
  });
  assert.ok(
    stick.aerialRoll > 0.7 && stick.aerialYaw < -0.4,
    'one held controller modifier combines all three axes',
  );
  assert.equal(stick.boost, false);
  await page.evaluate(() => {
    window.__testPad.connected = false;
    window.__testPad.buttons[2] = { pressed: false, value: 0 };
  });
  console.log(
    'PASS · one controller modifier, mixed left stick and right-stick spin',
  );
  const run = await page.evaluate((driver) => {
    const v = window.__VN,
      control = eval(`(${driver})`);
    v.restart();
    v.pause();
    for (
      let i = 0;
      i < 7 && !v.getSnapshot().runtime.state.freestyle.result;
      i++
    )
      v.stepFreestyle(1200, control);
    const s = v.getSnapshot();
    return {
      state: s.vehicle ?? s.state,
      mode: s.mode,
      freestyle: s.runtime.state.freestyle,
      vectorEntries: s.events.filter(
        (event) =>
          event.type === 'pickup-activate' && event.payload.kind === 'vector',
      ).length,
      errors: s.errors,
    };
  }, pilot.toString());
  console.log(
    JSON.stringify({
      check: 'five actual transfers from rest',
      score: run.freestyle.score,
      chain: run.freestyle.bestChain,
      reserve: run.state.energy,
      elapsed: run.state.time,
      legs: run.freestyle.legs.map(({ tricks, reason, bank }) => ({
        tricks,
        reason,
        bank,
      })),
    }),
  );
  assert.ok(run.freestyle.result, 'the real course reaches its result');
  assert.equal(run.freestyle.legs.length, 5);
  assert.equal(
    run.vectorEntries,
    5,
    'each real approach strip supplies launch propulsion',
  );
  assert.equal(
    run.state.energy,
    100,
    'the complete curved course needs no manual boost',
  );
  assert.equal(
    run.freestyle.bestChain,
    5,
    'five clean trick links are physically possible',
  );
  assert.ok(run.freestyle.legs.every((leg) => leg.tricks.includes('roll')));
  assert.ok(run.freestyle.score >= 27000, 'five well-linked rolls earn gold');
  await page
    .getByRole('button', { name: 'Retry Freestyle', exact: false })
    .click();
  await page.waitForFunction(
    () => window.__VN.getSnapshot().runtime.state.freestyle.score === 0,
  );
  console.log('PASS · real five-transfer chain, scoring, results and retry');
  for (const [axis, sign] of [
    ['aerialRoll', 1],
    ['aerialPitch', 1],
    ['aerialPitch', -1],
    ['aerialYaw', 1],
    ['compound', 1],
  ]) {
    const leg = await page.evaluate(
      ({ axis, sign }) => {
        const v = window.__VN;
        v.loadScenario('jump1-success');
        v.pause();
        let released = false;
        v.stepFreestyle(680, ({ motion }) => {
          const f = motion.freestyle,
            t = motion.flight?.elapsed ?? 0;
          const index = { aerialPitch: 0, aerialYaw: 1, aerialRoll: 2 }[axis];
          if (
            (axis === 'compound' ? f.compoundProgress : f.progress[index]) >=
            (axis === 'compound' ? 5.5 : 5.45)
          )
            released = true;
          const turn =
            !!motion.flight &&
            t > 0.15 &&
            !released &&
            f.flight?.tricks.length === 0;
          return {
            throttle: 1,
            brake: 0,
            steer: 0,
            boost: false,
            airbrake:
              !!motion.flight &&
              f.touchdown != null &&
              f.touchdown < 0.35 &&
              f.touchdown > 0.03,
            aerialPitch: axis === 'compound' && turn ? 1 : 0,
            aerialYaw: 0,
            aerialRoll: axis === 'compound' && turn ? 1 : 0,
            ...(axis === 'compound' ? {} : { [axis]: turn ? sign : 0 }),
          };
        });
        const snapshot = v.getSnapshot();
        return {
          leg: snapshot.runtime.state.freestyle.legs[0],
          errors: snapshot.errors,
        };
      },
      { axis, sign },
    );
    console.log(
      JSON.stringify({ check: `directional ${axis}/${sign}`, ...leg }),
    );
    assert.equal(leg.leg?.clean, true);
    assert.ok(
      leg.leg.tricks.includes(
        {
          aerialRoll: 'roll',
          aerialPitch: 'flip',
          aerialYaw: 'spin',
          compound: 'corkscrew',
        }[axis],
      ),
    );
    assert.deepEqual(leg.errors, []);
  }
  for (const mistake of ['held-catch', 'late-flip']) {
    const outcome = await page.evaluate((mistake) => {
      const v = window.__VN;
      v.loadScenario('jump1-success');
      v.pause();
      v.stepFreestyle(1000, ({ motion }) => ({
        throttle: 1,
        brake: 0,
        steer: 0,
        boost: false,
        airbrake: mistake === 'held-catch',
        aerialPitch:
          mistake === 'late-flip' && (motion.flight?.elapsed ?? 0) > 3 ? 1 : 0,
        aerialYaw: 0,
        aerialRoll: 0,
      }));
      const s = v.getSnapshot();
      return {
        freestyle: s.runtime.state.freestyle,
        events: s.events.filter((e) =>
          ['impact', 'jump-miss'].includes(e.type),
        ),
      };
    }, mistake);
    assert.equal(outcome.freestyle.chain, 0);
    assert.equal(outcome.freestyle.score, 0);
    assert.equal(outcome.freestyle.legs[0]?.clean, false);
    if (mistake === 'late-flip')
      assert.ok(
        outcome.events.length,
        'late rotation has a real contact/recovery consequence',
      );
    console.log(`PASS · ${mistake} cannot auto-bank a chain`);
  }
  assert.deepEqual(errors, []);
} finally {
  await browser.close();
}
