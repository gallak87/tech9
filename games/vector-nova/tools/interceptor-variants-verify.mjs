import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const base = process.env.VN_URL ?? 'http://127.0.0.1:5213';
const encounters = [
  {
    level: 'interceptor',
    boss: 'goliath',
    name: 'Goliath',
    kind: 'lance',
    progress: 0.25,
  },
  {
    level: 'interceptor-orbital',
    boss: 'wraith',
    name: 'Wraith',
    kind: 'arc',
    progress: 0.65,
  },
  {
    level: 'interceptor-halcyon',
    boss: 'bulwark',
    name: 'Bulwark',
    kind: 'ion',
    progress: 0.65,
  },
];
const browser = await chromium.launch({
  channel: 'chrome',
  headless: true,
  args: ['--mute-audio'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const faults = [];
page.on('pageerror', (error) => faults.push(error.stack ?? error.message));
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
  window.__variantPad = {
    id: 'variant-controller',
    index: 0,
    connected: false,
    mapping: 'standard',
    axes: [0, 0, 0, 0],
    buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })),
  };
  Object.defineProperty(navigator, 'getGamepads', {
    configurable: true,
    value: () => [window.__variantPad],
  });
});

// Test-only response instrumentation advances ordinary controls through the
// actual session and observes real physics/combat. It supplies no result state.
await page.route('**/src/core/game.js*', async (route) => {
  const response = await route.fetch(),
    source = await response.text();
  assert.ok(source.includes('getSnapshot() {'));
  assert.ok(source.includes('onHit(payload) {'));
  const observed = source.replace(
    'onHit(payload) {',
    'onHit(payload) { (window.__variantContacts ??= []).push(structuredClone(payload));',
  );
  await route.fulfill({
    response,
    body: observed.replace(
      'getSnapshot() {',
      `
    stepVariant(ticks) {
      cancelCountdown();mode='racing';ui.setMode(mode);
      const audit = window.__variantAudit ??= {maxSpeed:0,maxStep:0,maxRouteStep:0,maxHeight:0,maxLateral:0,phases:[],shots:[],wakes:0,maxWeave:0};
      const shotIds = window.__variantShotIds ??= new Set();
      for(let i=0;i<Math.min(ticks,1200)&&mode==='racing';i++) {
        advanceTick(window.__variantPilot({state:{...state},track,racers,devices,runtime}));
        const target = racers.opponents.find(opponent=>opponent.specification.id===missionBoss.id);
        const physical = target.runtime.pose(1), frame = track.sample(target.state.distance), error = physical.position.clone().sub(frame.position);
        audit.maxSpeed = Math.max(audit.maxSpeed,physical.velocity?.length()??Math.abs(target.state.speed));
        audit.maxHeight = Math.max(audit.maxHeight,Math.abs(error.dot(frame.up)));
        audit.maxLateral = Math.max(audit.maxLateral,Math.abs(error.dot(frame.right)));
        if(audit.previous) {
          audit.maxStep = Math.max(audit.maxStep,physical.position.distanceTo(new T.Vector3().fromArray(audit.previous.position)));
          audit.maxRouteStep = Math.max(audit.maxRouteStep,Math.abs(target.state.distance-audit.previous.distance));
        }
        audit.previous={position:physical.position.toArray(),distance:target.state.distance};
        const attack = interceptor.snapshot().counterattack;
        if(attack.warning) {
          if(!audit.phases.includes(attack.phase))audit.phases.push(attack.phase);
          if(attack.phase==='firing')audit.maxWeave=Math.max(audit.maxWeave,Math.abs(target.state.lateral));
        }
        const active = combat.view();
        for(const shot of active.shots)if(shot.source===missionBoss.id&&!shotIds.has(shot.id)) {
          shotIds.add(shot.id);
          audit.shots.push({heavy:!!shot.heavy,forwardDot:new T.Vector3(0,0,1).applyQuaternion(new T.Quaternion().fromArray(shot.quaternion)).dot(frame.tangent),velocityDot:new T.Vector3().fromArray(shot.velocity).dot(frame.tangent)});
        }
        audit.wakes=Math.max(audit.wakes,active.wakes.filter(wake=>wake.source===missionBoss.id).length);
      }
      if(mode==='racing')pause();
      return this.getSnapshot();
    },
    variantDiagnostics() {
      const target=racers.opponents.find(opponent=>opponent.specification.id===missionBoss.id);
      let model=null;scene.traverse(object=>{if(object.userData.rivalId===missionBoss.id)model=object;});
      return {boss:missionBoss.id,actors:dynamics.snapshot().actors.filter(actor=>actor.active).length,
        roster:racers.opponents.map(opponent=>opponent.specification.id),model:model?{id:model.userData.rivalId,bounds:model.userData.bounds}:null,
        audit:structuredClone(window.__variantAudit??null),contacts:structuredClone(window.__variantContacts??[]),
        target:{...target.state},routeLength:track.length,errors:[...errors]};
    },getSnapshot() {`,
    ),
  });
});

const frontend = () => page.evaluate(() => window.__VN_FRONTEND.getState());
const press = async (selector) => {
  await page.locator(selector).focus();
  await page.keyboard.press('Enter');
};
async function pad(index, pressed) {
  await page.evaluate(
    ({ index, pressed }) => {
      window.__variantPad.buttons[index] = { pressed, value: Number(pressed) };
    },
    { index, pressed },
  );
  await page.waitForTimeout(100);
}
async function installPilot() {
  await page.evaluate(async () => {
    const { getRacerControl } = await import('/src/race/racers.js');
    window.__variantContacts = [];
    window.__variantAudit = null;
    window.__variantShotIds = new Set();
    window.__variantPilot = ({ state, track, racers, devices, runtime }) => {
      const target = racers.opponents.find(
        (opponent) => opponent.specification.team === 'quarry',
      ).state;
      const gap = target.distance - state.distance;
      const input = getRacerControl(state, track, {
        difficulty: 'hard',
        pace: 1,
        lane: target.lateral,
        devices,
        nearby: [state, ...racers.opponents.map((opponent) => opponent.state)],
        runtime,
      });
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
      input.equipment1 =
        state.time > 2 && state.time < 5 && gap > 35 && gap < 440;
      input.equipment2 = state.energy < 35;
      return input;
    };
  });
}
function auditDamage(mission, contacts) {
  let health = mission.maxHealth,
    player = 0,
    allied = 0,
    hits = 0;
  const keys = new Set();
  for (const contact of contacts) {
    if (
      contact.target !== mission.targetId ||
      contact.shielded ||
      health <= 0 ||
      !['player', 'rook', 'kite', 'manta'].includes(contact.source)
    )
      continue;
    const kind =
      contact.kind === 'repulsor' && contact.equipment === 'lance'
        ? 'lance'
        : contact.kind;
    const damage = { lance: [18, 3], arc: [5, 1], repulsor: [12, 2] }[kind];
    const key = contact.source + ':' + contact.hitId;
    if (!damage || keys.has(key)) continue;
    keys.add(key);
    const dealt = Math.min(health, damage[contact.source === 'player' ? 0 : 1]);
    health -= dealt;
    hits++;
    if (contact.source === 'player') player += dealt;
    else allied += dealt;
  }
  assert.equal(mission.health, health);
  assert.equal(mission.playerDamage, player);
  assert.equal(mission.alliedDamage, allied);
  assert.equal(mission.hits, hits);
}

try {
  await page.goto(new URL('?level=halcyon&music=0', base).href);
  await page.waitForFunction(
    () => window.__VN_FRONTEND?.getState().screen === 'home',
  );
  await press('[data-action="interceptor"]');
  assert.equal(await page.locator('.circuit-card').count(), 3);
  assert.equal(
    await page
      .locator(
        '.circuit-grid [data-challenge], .circuit-grid .track-group-label',
      )
      .count(),
    0,
  );
  const cards = await page
    .locator('.circuit-card')
    .evaluateAll((elements) =>
      elements.map((element) => ({
        id: element.dataset.level,
        label: element.getAttribute('aria-label'),
      })),
    );
  assert.deepEqual(
    cards.map((card) => card.id),
    encounters.map((encounter) => encounter.level),
  );
  assert.ok(cards.every((card) => !/easy|medium|hard/i.test(card.label)));
  await press('[data-level="interceptor-orbital"]');
  assert.equal((await frontend()).selected, 'interceptor-orbital');
  await press('[data-action="quick-race"]');
  await press('[data-action="interceptor"]');
  assert.equal((await frontend()).selected, 'interceptor-orbital');
  await page.reload();
  await page.waitForFunction(
    () => window.__VN_FRONTEND?.getState().screen === 'home',
  );
  assert.equal((await frontend()).selected, 'interceptor-orbital');
  await page.evaluate(() => {
    window.__variantPad.connected = true;
  });
  await page.waitForTimeout(100);
  await page.locator('[data-level="interceptor-orbital"]').focus();
  await pad(15, true);
  await pad(15, false);
  assert.equal(
    await page.evaluate(() => document.activeElement.dataset.level),
    'interceptor-halcyon',
  );
  await pad(0, true);
  await pad(0, false);
  assert.equal((await frontend()).selected, 'interceptor-halcyon');
  await page.evaluate(() => {
    window.__variantPad.connected = false;
  });
  console.log(
    'PASS · three named boss cards, clean accessibility labels, keyboard/controller selection and remembered encounter',
  );

  for (const encounter of encounters) {
    await press('[data-level="' + encounter.level + '"]');
    await press('[data-action="launch"]');
    await page.waitForFunction(
      () =>
        window.__VN_FRONTEND.getState().error ||
        (window.__VN?.ready &&
          window.__VN_FRONTEND.getState().screen === 'race' &&
          !window.__VN_FRONTEND.getState().loading),
      null,
      { timeout: 60000 },
    );
    assert.equal((await frontend()).error, '');
    await installPilot();
    await page.evaluate(() => window.__VN.stepVariant(1));
    const start = await page.evaluate(() => ({
      snapshot: window.__VN.getSnapshot(),
      diagnostics: window.__VN.variantDiagnostics(),
    }));
    assert.equal(start.snapshot.interceptor.targetId, encounter.boss);
    assert.equal(start.snapshot.interceptor.targetName, encounter.name);
    assert.equal(start.snapshot.interceptor.maxHealth, 450);
    assert.equal(start.diagnostics.actors, 5);
    assert.ok(start.diagnostics.roster.includes(encounter.boss));
    assert.equal(start.diagnostics.model?.id, encounter.boss);
    assert.deepEqual(
      start.snapshot.runtime.state.equipment.slots.map((slot) => slot.id),
      ['lance', 'injector'],
    );
    await page.waitForFunction(
      (name) =>
        document.querySelector('.ic-boss-heading strong')?.textContent === name,
      encounter.name.toUpperCase(),
    );
    let latest;
    for (let batch = 0; batch < 18; batch++) {
      latest = await page.evaluate(() => ({
        snapshot: window.__VN.stepVariant(600),
        diagnostics: window.__VN.variantDiagnostics(),
      }));
      auditDamage(latest.snapshot.interceptor, latest.diagnostics.contacts);
      if (
        latest.snapshot.interceptor.result ||
        (latest.diagnostics.target.distance >=
          latest.diagnostics.routeLength * encounter.progress &&
          latest.snapshot.interceptor.counterattack.phase === 'idle')
      )
        break;
    }
    const { audit } = latest.diagnostics;
    assert.ok(
      audit.phases.includes('firing'),
      'signature attack activates for ' + encounter.boss,
    );
    assert.ok(
      audit.maxSpeed <= 100.001,
      'bounded physical speed for ' + encounter.boss,
    );
    assert.ok(
      audit.maxStep < 5 && audit.maxRouteStep < 5,
      'bounded physical progress for ' + encounter.boss,
    );
    assert.ok(audit.maxHeight < 4, 'magnetic support for ' + encounter.boss);
    assert.ok(
      latest.snapshot.interceptor.playerDamage > 0,
      'real player attacks hit ' + encounter.boss,
    );
    if (encounter.kind === 'ion') {
      assert.ok(audit.wakes > 0, 'Bulwark lays a real Ion wake');
      assert.ok(audit.maxWeave > 0.25, 'Bulwark changes its physical lane');
    } else {
      const shots = audit.shots.filter(
        (shot) => shot.heavy === (encounter.kind === 'lance'),
      );
      assert.ok(
        shots.some((shot) => shot.forwardDot < -0.9 && shot.velocityDot < 0),
        'real rearward signature projectiles for ' + encounter.boss,
      );
    }
    assert.deepEqual(latest.diagnostics.errors, []);
    console.log(
      JSON.stringify({
        check: encounter.name,
        seconds: latest.snapshot.interceptor.elapsed,
        health: latest.snapshot.interceptor.health,
        playerDamage: latest.snapshot.interceptor.playerDamage,
        distance: latest.diagnostics.target.distance,
        maxSpeedKph: audit.maxSpeed * 3.6,
        maxStep: audit.maxStep,
        maxHeight: audit.maxHeight,
        signature: encounter.kind,
      }),
    );
    if (latest.snapshot.interceptor.result)
      await press('[data-action="change"]');
    else await press('#home');
    await page.waitForFunction(
      () => window.__VN_FRONTEND.getState().screen === 'home',
    );
  }
  assert.deepEqual(faults, []);
} finally {
  await browser.close();
}
