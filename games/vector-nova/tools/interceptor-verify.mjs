import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const base = process.env.VN_URL ?? 'http://127.0.0.1:5215';
const browser = await chromium.launch({
  channel: 'chrome',
  headless: true,
  args: ['--mute-audio'],
});
const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });
const faults = [];
page.on('pageerror', (error) => faults.push(error.message));
await page.addInitScript(() => {
  localStorage.setItem(
    'vector-nova.settings',
    JSON.stringify({
      quality: 'low',
      volume: 0,
      reducedMotion: true,
      difficulty: 'easy',
    }),
  );
  window.__checkPad = {
    id: 'interceptor-controller-check',
    index: 0,
    connected: false,
    mapping: 'standard',
    axes: [0, 0, 0, 0],
    buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })),
  };
  Object.defineProperty(navigator, 'getGamepads', {
    configurable: true,
    value: () => [window.__checkPad],
  });
});

// Diagnostics exist only in this intercepted dev response. All motion,
// weapon requests, impacts and damage still use the unchanged live session.
await page.route('**/src/core/game.js*', async (route) => {
  const response = await route.fetch(),
    source = await response.text();
  assert.ok(source.includes('getSnapshot() {'));
  assert.ok(source.includes('onHit(payload) {'));
  const audited = source.replace(
    'onHit(payload) {',
    `onHit(payload) {
    (window.__missionProbeContacts??=[]).push(structuredClone(payload));`,
  );
  await route.fulfill({
    response,
    body: audited.replace(
      'getSnapshot() {',
      `
    stepMission(n,control={}) {
      if(interceptor?.snapshot().result)return this.getSnapshot();
      cancelCountdown();mode='racing';ui.setMode(mode);
      for(let i=0;i<Math.min(n,1200)&&mode==='racing';i++)
        advanceTick(typeof control==='function'?control({state:{...state},motion:runtime.snapshot(),track,racers,devices,avoidance:runtime.avoidance?.()}):control);
      if(mode==='racing')pause();return this.getSnapshot();
    },
    missionDiagnostics() {
      let boss=null;scene.traverse(object=>{if(object.userData.rivalId==='goliath')boss=object;});
      return {actors:dynamics?.snapshot().actors.map(actor=>({id:actor.id,active:actor.active,shape:actor.contactShape?{id:actor.contactShape.id,bounds:actor.contactShape.bounds,parts:actor.contactShape.parts?.length}:null}))??[],
        opponents:racers.opponents.map(opponent=>({id:opponent.specification.id,state:{...opponent.state},hitBounds:opponent.specification.hitBounds})),
        boss:boss?{name:boss.name,bounds:boss.userData.bounds,scale:boss.scale.toArray()}:null,
        combat:combat?.snapshot(),queuedFire:structuredClone(pendingMissionFire),
        contacts:structuredClone(window.__missionProbeContacts??[]),draws:renderer.info.render.calls};
    },getSnapshot() {`,
    ),
  });
});
const front = () => page.evaluate(() => window.__VN_FRONTEND.getState());
const snapshot = () => page.evaluate(() => window.__VN.getSnapshot());
const pressButton = async (selector) => {
  await page.locator(selector).focus();
  await page.keyboard.press('Enter');
};
const still = {
  throttle: 0,
  brake: 0,
  steer: 0,
  boost: false,
  airbrake: false,
  equipment1: false,
  equipment2: false,
};
const padButton = async (index, pressed) => {
  await page.evaluate(
    ({ index, pressed }) => {
      window.__checkPad.buttons[index] = { pressed, value: Number(pressed) };
    },
    { index, pressed },
  );
  await page.waitForTimeout(70);
};
const issued = (snapshot) =>
  snapshot.runtime.state.equipment.slots.filter(Boolean).map((slot) => slot.id);
const clearAudit = () =>
  page.evaluate(() => {
    window.__missionProbeContacts = [];
  });

async function installPilot() {
  await page.evaluate(async () => {
    const { getRacerControl } = await import('/src/race/racers.js');
    window.__missionPilot = ({
      state,
      motion,
      track,
      racers,
      devices,
      avoidance,
    }) => {
      const target = racers.opponents.find(
        (opponent) => opponent.specification.id === 'goliath',
      ).state;
      const gap = target.distance - state.distance;
      const input = getRacerControl(state, track, {
        difficulty: 'hard',
        pace: 1,
        lane: target.lateral,
        nearby: [state, ...racers.opponents.map((opponent) => opponent.state)],
        devices: devices.filter((device) =>
          ['vector', 'aegis'].includes(device.type),
        ),
        runtime: {
          pose: () => ({ grounded: motion.mode !== 'flight' }),
          avoidance: () => avoidance,
        },
      });
      // Follow an ordinary road line behind the courier and match its speed;
      // these are driver inputs, with no state correction or weapon teleport.
      const followSpeed =
        target.speed + Math.max(-30, Math.min(40, (gap - 100) * 0.5));
      if (gap < 145) {
        input.boost = false;
        if (state.speed > followSpeed + 2) {
          input.throttle = Math.min(input.throttle, 0.3);
          input.brake = Math.max(
            input.brake,
            Math.min(0.65, (state.speed - followSpeed) / 35),
          );
        }
      }
      input.boost &&= gap > 145 && state.energy > (state.boosting ? 12 : 25);
      input.equipment1 = gap > 35 && gap < 440;
      input.equipment2 =
        state.energy < 35 && motion.equipment?.slots[1]?.remaining === 0;
      return input;
    };
  });
}
function verifyCombatAudit(mission, contacts) {
  let health = mission.maxHealth,
    player = 0,
    allied = 0,
    hits = 0;
  const seen = new Set(),
    allies = new Set(['rook', 'kite', 'manta']);
  for (const contact of contacts) {
    if (
      health <= 0 ||
      contact.target !== 'goliath' ||
      contact.shielded ||
      !(contact.source === 'player' || allies.has(contact.source))
    )
      continue;
    const lance = contact.equipment === 'lance';
    if (!(contact.kind === 'arc' || (contact.kind === 'repulsor' && lance)))
      continue;
    const key = `${contact.hitId}:${contact.source}:${contact.target}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const damage = Math.min(
      health,
      lance
        ? contact.source === 'player'
          ? 18
          : 3
        : contact.source === 'player'
          ? 5
          : 1,
    );
    health -= damage;
    hits++;
    if (contact.source === 'player') player += damage;
    else allied += damage;
  }
  assert.equal(
    mission.health,
    health,
    'mission hull changes only with actual unblocked combat impacts',
  );
  assert.equal(
    mission.playerDamage,
    player,
    'player damage matches real player impacts',
  );
  assert.equal(
    mission.alliedDamage,
    allied,
    'support damage matches real allied impacts',
  );
  assert.equal(mission.hits, hits, 'each actual impact is credited once');
  assert.equal(
    mission.playerDamage + mission.alliedDamage + mission.health,
    mission.maxHealth,
  );
}
async function runMission(label, driver) {
  await clearAudit();
  let result = null;
  for (let batch = 0; batch < 20 && !result; batch++) {
    const current = await page.evaluate((driver) => {
      const game = window.__VN;
      game.stepMission(
        1200,
        driver === 'pilot'
          ? window.__missionPilot
          : {
              throttle: 0,
              brake: 0,
              steer: 0,
              boost: false,
              airbrake: false,
              equipment1: false,
              equipment2: false,
            },
      );
      return {
        snapshot: game.getSnapshot(),
        diagnostics: game.missionDiagnostics(),
      };
    }, driver);
    verifyCombatAudit(
      current.snapshot.interceptor,
      current.diagnostics.contacts,
    );
    assert.equal(
      current.diagnostics.actors.filter((actor) => actor.active).length,
      5,
      'all five actual physical actors remain in the pursuit',
    );
    assert.deepEqual(current.snapshot.errors, []);
    if (current.snapshot.interceptor.result)
      result = {
        ...current.snapshot.interceptor.result,
        diagnostics: current.diagnostics,
        vehicle: current.snapshot.vehicle,
      };
  }
  assert.ok(result, 'the physical pursuit reaches disable or escape');
  console.log(
    JSON.stringify({
      check: label,
      won: result.won,
      reason: result.reason,
      time: result.elapsed,
      health: result.health,
      playerDamage: result.playerDamage,
      alliedDamage: result.alliedDamage,
      hits: result.hits,
      targetDistance: result.targetDistance,
      playerDistance: result.vehicle.distance,
      valid: result.playerValid,
      draws: result.diagnostics.draws,
    }),
  );
  return result;
}

try {
  await page.goto(new URL('?level=halcyon&music=0', base).href);
  await page.waitForFunction(
    () => window.__VN_FRONTEND?.getState().screen === 'home',
  );
  assert.equal(await page.evaluate(() => !!window.__VN), false);
  await pressButton('[data-action="interceptor"]');
  assert.equal((await front()).intent, 'interceptor');
  assert.equal((await front()).selected, 'interceptor');
  assert.equal(await page.locator('.circuit-card').count(), 1);
  assert.equal(
    await page.evaluate(() => !!window.__VN),
    false,
    'mission selection stays lazy',
  );
  await page.setViewportSize({ width: 1280, height: 720 });
  const fit = await page.locator('#front-shell').evaluate((element) => ({
    vertical: element.scrollHeight - element.clientHeight,
    horizontal: element.scrollWidth - element.clientWidth,
  }));
  assert.ok(
    fit.vertical <= 1 && fit.horizontal <= 1,
    `mission setup fits1280x720: ${JSON.stringify(fit)}`,
  );
  await pressButton('[data-action="quick-race"]');
  assert.equal((await front()).selected, 'halcyon');
  await pressButton('[data-action="interceptor"]');
  await page.setViewportSize({ width: 1440, height: 960 });
  await pressButton('[data-action="launch"]');
  await page.waitForFunction(
    () =>
      window.__VN_FRONTEND.getState().error ||
      (window.__VN?.ready &&
        window.__VN_FRONTEND.getState().screen === 'race' &&
        !window.__VN_FRONTEND.getState().loading),
    null,
    { timeout: 60000 },
  );
  assert.equal(
    (await front()).error,
    '',
    `mission load failed: ${JSON.stringify(faults)}`,
  );
  const start = await snapshot();
  assert.deepEqual(issued(start), ['lance', 'injector']);
  assert.deepEqual(start.vehicle.enhancements, {});
  assert.equal(start.interceptor.health, 240);
  assert.equal(start.interceptor.elapsed, 0);
  await page.evaluate(
    (control) => window.__VN.stepMission(120, control),
    still,
  );
  const first = await page.evaluate(() => ({
    snapshot: window.__VN.getSnapshot(),
    diagnostics: window.__VN.missionDiagnostics(),
  }));
  assert.equal(
    first.snapshot.interceptor.health,
    240,
    'a second without weapon contacts never damages the target',
  );
  assert.deepEqual(
    first.diagnostics.opponents.map((opponent) => opponent.id).sort(),
    ['goliath', 'kite', 'manta', 'rook'],
  );
  assert.equal(
    first.diagnostics.actors.filter((actor) => actor.active).length,
    5,
  );
  const hull = first.diagnostics.actors.find(
    (actor) => actor.shape?.id === 'goliath',
  )?.shape;
  assert.ok(hull?.parts > 5, 'Goliath has its own compound physical hull');
  assert.ok(
    hull.bounds.max[2] - hull.bounds.min[2] >= 40,
    'the physical target is40m long',
  );
  assert.ok(first.diagnostics.boss, 'the target renders its authored model');
  assert.ok(
    first.diagnostics.boss.bounds.max[2] -
      first.diagnostics.boss.bounds.min[2] >=
      40,
    'rendered and physical target scale agree',
  );
  console.log(
    'PASS · native lazy mission entry, issued stock gear and five physical actors with a full-size Goliath',
  );

  await page.keyboard.press('Escape');
  await page.waitForFunction(() => window.__VN.getSnapshot().mode === 'racing');
  await page.keyboard.down('KeyQ');
  assert.equal((await snapshot()).input.equipment1, true);
  await page.waitForFunction(() =>
    window.__VN
      .getSnapshot()
      .events.some(
        (event) =>
          event.type === 'equipment-activate' && event.payload.kind === 'lance',
      ),
  );
  await page.keyboard.up('KeyQ');
  await page.keyboard.press('Escape');
  const paused = await snapshot();
  await page.waitForTimeout(180);
  assert.equal(
    (await snapshot()).interceptor.elapsed,
    paused.interceptor.elapsed,
  );
  assert.equal(
    (await snapshot()).interceptor.health,
    paused.interceptor.health,
  );
  await page.evaluate(
    (control) => window.__VN.stepMission(180, control),
    still,
  );
  const fireCount = (await snapshot()).events.filter(
    (event) =>
      event.type === 'equipment-activate' && event.payload.kind === 'lance',
  ).length;
  await page.evaluate(() => {
    window.__checkPad.connected = true;
  });
  await page.waitForTimeout(100);
  await page.keyboard.press('Escape');
  await padButton(2, true);
  assert.equal(
    (await snapshot()).input.equipment1,
    true,
    'controller X maps to the issued Lance',
  );
  await page.waitForFunction(
    (count) =>
      window.__VN
        .getSnapshot()
        .events.filter(
          (event) =>
            event.type === 'equipment-activate' &&
            event.payload.kind === 'lance',
        ).length > count,
    fireCount,
  );
  await padButton(2, false);
  await padButton(9, true);
  await page.waitForFunction(() => window.__VN.getSnapshot().mode === 'paused');
  await padButton(9, false);
  await page.evaluate(() => {
    window.__checkPad.connected = false;
  });
  console.log(
    'PASS · native Q and controller X fire real Lance shots; pause freezes clock and hull',
  );

  await page.evaluate(() => window.__VN.restartRace());
  await clearAudit();
  await installPilot();
  const beforeWin = (await front()).career.state;
  const win = await runMission(
    'stock player + three allies / real weapon hits',
    'pilot',
  );
  assert.equal(
    win.won,
    true,
    'ordinary stock driving and issued weapons can disable the physical target',
  );
  assert.equal(win.playerValid, true);
  assert.ok(win.playerDamage > 0);
  assert.ok(win.alliedDamage > 0);
  assert.equal(win.health, 0);
  await page.waitForFunction(
    () => window.__VN_FRONTEND.getState().screen === 'results',
  );
  assert.match(
    await page.locator('.interceptor-results h1').textContent(),
    /disabled/,
  );
  const afterWin = (await front()).career.state;
  assert.equal(afterWin.finishes, beforeWin.finishes + 1);
  assert.equal(afterWin.points, beforeWin.points + 5);
  assert.equal(afterWin.wins, beforeWin.wins + 1);
  await page.evaluate(() => {
    window.__VN.showResults();
    window.__VN.showResults();
  });
  assert.deepEqual((await front()).career.state, afterWin);
  await pressButton('[data-action="retry-race"]');
  const retry = await snapshot();
  assert.equal(retry.interceptor.elapsed, 0);
  assert.equal(retry.interceptor.health, 240);
  assert.equal(retry.vehicle.distance, 0);
  assert.deepEqual(issued(retry), ['lance', 'injector']);
  assert.deepEqual(
    (await page.evaluate(() => window.__VN.missionDiagnostics())).queuedFire,
    [],
  );
  console.log(
    'PASS · real-hit victory, one mission award and native full retry',
  );

  const beforeLoss = (await front()).career.state;
  const loss = await runMission(
    'inactive player / physical target escape',
    'inactive',
  );
  assert.equal(
    loss.won,
    false,
    'allies cannot complete the mission while the player remains inactive',
  );
  assert.equal(loss.reason, 'escaped');
  assert.equal(loss.playerDamage, 0);
  assert.ok(loss.health > 0);
  assert.ok(loss.targetDistance >= loss.escapeDistance);
  assert.match(
    await page.locator('.interceptor-results h1').textContent(),
    /escaped/,
  );
  const afterLoss = (await front()).career.state;
  assert.equal(afterLoss.finishes, beforeLoss.finishes + 1);
  assert.equal(afterLoss.points, beforeLoss.points + 1);
  assert.equal(afterLoss.wins, beforeLoss.wins);
  await page.evaluate(() => {
    window.__VN.showResults();
    window.__VN.showResults();
  });
  assert.deepEqual((await front()).career.state, afterLoss);
  await pressButton('[data-action="change"]');
  assert.equal((await front()).intent, 'interceptor');
  assert.equal((await front()).selected, 'interceptor');
  await pressButton('[data-action="quick-race"]');
  assert.equal((await front()).selected, 'halcyon');
  console.log(
    'PASS · honest physical escape, one failure award and native Back/mode return',
  );
  assert.deepEqual(faults, [], 'no uncaught browser exceptions');
} finally {
  await browser.close();
}
