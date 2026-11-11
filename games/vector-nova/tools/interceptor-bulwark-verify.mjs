import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { seedInterceptorCareer } from './interceptor-career-seed.mjs';

// This pilot supplies only ordinary steering/throttle intent. Every boost,
// issued shot and Injector request comes from production input.sample(), driven
// by real keyboard or standard-pad buttons. No poses or mission values change.
const base = process.env.VN_URL ?? 'http://127.0.0.1:5213';
const browser = await chromium.launch({
  channel: 'chrome',
  headless: true,
  args: ['--mute-audio'],
});
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await seedInterceptorCareer(page, 'interceptor-nightweir');
const faults = [];
page.on('pageerror', (error) => faults.push(error.message));
page.on('console', (message) => {
  if (
    message.type() === 'error' &&
    /WebGL|shader|THREE|TypeError|ReferenceError/i.test(message.text())
  )
    faults.push(message.text());
});
await page.addInitScript(() => {
  // Keep the real audio mixer enabled to inspect finish-voice cleanup. Chrome
  // mutes the host, so none of these checks plays sound in the room.
  localStorage.setItem(
    'vector-nova.settings',
    JSON.stringify({
      quality: 'low',
      reducedMotion: true,
      volume: 0.4,
      difficulty: 'easy',
      controllerPreset: 'classic',
    }),
  );
  window.__bulwarkPad = {
    id: 'Bulwark native controller check',
    index: 0,
    connected: false,
    mapping: 'standard',
    axes: [0, 0, 0, 0],
    timestamp: 0,
    buttons: Array.from({ length: 17 }, () => ({
      pressed: false,
      touched: false,
      value: 0,
    })),
  };
  Object.defineProperty(navigator, 'getGamepads', {
    configurable: true,
    value: () => [window.__bulwarkPad],
  });
});
await page.route('**/src/audio/index.js*', async (route) => {
  const response = await route.fetch();
  const source = await response.text();
  assert.ok(
    source.includes('getStatus() {'),
    'the live audio owner exposes status',
  );
  await route.fulfill({
    response,
    body: source.replace(
      'getStatus() {',
      `
    inspectBulwarkQueue() {
      return {count: resources?.shots.size ?? 0,
        voices: [...(resources?.shots ?? [])].map(shot => ({
          id: shot.sampleId ?? 'countdown', finish: !!shot.finish,
        }))};
    },
    getStatus() {`,
    ),
  });
});
await page.route('**/src/core/game.js*', async (route) => {
  const response = await route.fetch();
  let source = await response.text();
  const contact = 'for (const hit of interceptor.hit({';
  const emit = 'const event = { ...e, tick, time: state.time };';
  for (const anchor of [contact, emit, 'getSnapshot() {'])
    assert.ok(source.includes(anchor), `live Bulwark probe anchor: ${anchor}`);
  source = source.replace(
    contact,
    `
    const audit = interceptor.snapshot();
    (window.__bulwarkContacts ??= []).push({
      ...structuredClone(payload), hitLocal: hitLocal && [...hitLocal],
      encounter: {elapsed: audit.elapsed, attackIndex: audit.counterattacks.length - 1,
        attack: structuredClone(audit.counterattacks.at(-1) ?? null)},
    });
    ${contact}`,
  );
  source = source.replace(
    emit,
    `${emit}
    if (['interceptor-hit', 'interceptor-breakwater', 'interceptor-cue', 'equipment-activate'].includes(e.type))
      (window.__bulwarkEvents ??= []).push(structuredClone(e));`,
  );
  source = source.replace(
    'getSnapshot() {',
    `
    freezeBulwarkClock() {
      cancelAnimationFrame(raf);
      return this.readBulwark();
    },
    stepBulwark(n = 1) {
      const { devices } = simulationActors.prepareRacing();
      cancelAnimationFrame(raf);
      for (let i = 0; i < Math.min(1200, Math.max(0, Math.floor(n))) && mode === 'racing'; i++) {
        const native = input.sample();
        if (mode !== 'racing') break;
        const pilot = window.__bulwarkPilot({state, track, racers, devices, runtime,
          mission: interceptor.snapshot()});
        advanceTick({...pilot,
          throttle: Math.max(pilot.throttle, native.throttle),
          brake: Math.max(pilot.brake, native.brake),
          steer: native.steer || pilot.steer,
          boost: native.boost, airbrake: native.airbrake,
          equipment1: native.equipment1, equipment2: native.equipment2,
          equipment3: native.equipment3, equipment4: native.equipment4});
        input.consumeEquipment();
      }
      render(last || performance.now());
      cancelAnimationFrame(raf);
      return this.readBulwark();
    },
    presentBulwark(frames = 1) {
      cancelAnimationFrame(raf);
      for (let i = 0; i < Math.min(30, frames); i++) {
        render((last || performance.now()) + 50);
        cancelAnimationFrame(raf);
      }
      return this.readBulwark();
    },
    readBulwark() {
      const model = racerPresentation.getShip('bulwark')?.group;
      const powered = [], fans = [];
      model?.traverse(object => {
        if (object.name === 'Bulwark / pressure rundown fan')
          fans.push({visible: object.visible,
            strength: object.material.uniforms?.strength?.value ?? object.material.opacity});
        for (const material of [object.material].flat())
          if (material?.name?.endsWith('_Ion') && !powered.some(entry => entry.name === material.name))
            powered.push({name: material.name, intensity: material.emissiveIntensity});
      });
      return {mode, input: input.sample(),
        vehicle: {distance: state.distance, lateral: state.lateral, speed: state.speed,
          energy: state.energy, boosting: state.boosting},
        mission: missionSnapshot(), equipment: runtime.equipment?.(),
        cameraView: structuredClone(camera.view),
        queuedFire: structuredClone(pendingMissionFire),
        boss: {visible: model?.visible,
          propulsion: model?.getObjectByName('Rival / propulsion')?.visible,
          hardware: model?.getObjectByName('Bulwark / breakwater hardware')?.visible,
          signals: scene.getObjectByName('Bulwark / physical breaker signals')?.visible,
          rupture: model?.getObjectByName('Bulwark / ruptured emitter')?.visible,
          powered, fans},
        audio: audio.inspectBulwarkQueue(), audioStatus: audio.getStatus(),
        combat: combat.snapshot(),
        contacts: structuredClone(window.__bulwarkContacts ?? []),
        events: structuredClone(window.__bulwarkEvents ?? [])};
    },
    getSnapshot() {`,
  );
  await route.fulfill({ response, body: source });
});

const read = () => page.evaluate(() => window.__VN.readBulwark());
const step = (ticks) => page.evaluate((n) => window.__VN.stepBulwark(n), ticks);
const present = (frames) =>
  page.evaluate((n) => window.__VN.presentBulwark(n), frames);
const front = () => page.evaluate(() => window.__VN_FRONTEND.getState());
async function enter(selector) {
  await page.locator(selector).focus();
  await page.keyboard.press('Enter');
}
async function pad(index, pressed) {
  await page.evaluate(
    ({ index, pressed }) => {
      window.__bulwarkPad.buttons[index] = {
        pressed,
        touched: pressed,
        value: Number(pressed),
      };
      window.__bulwarkPad.timestamp = performance.now();
    },
    { index, pressed },
  );
}
let device = 'keyboard';
const held = new Map();
async function button(action, pressed) {
  const key = `${device}:${action}`;
  if (held.get(key) === pressed) return;
  held.set(key, pressed);
  if (device === 'keyboard') {
    const name = { boost: 'Shift', lance: 'KeyQ', injector: 'KeyE' }[action];
    await page.keyboard[pressed ? 'down' : 'up'](name);
  } else await pad({ boost: 0, lance: 2, injector: 3 }[action], pressed);
}
async function follow(current) {
  await button(
    'boost',
    current.mission.gap > 36 && current.vehicle.energy > 10,
  );
  if (
    current.vehicle.energy < 35 &&
    current.equipment.slots[1].remaining <= 0
  ) {
    await button('injector', true);
    current = await step(1);
    await button('injector', false);
  }
  return current;
}
async function until(predicate, label, { batch = 30, maxTicks = 24000 } = {}) {
  let current = await read(),
    spent = 0;
  while (!predicate(current) && spent < maxTicks) {
    assert.equal(
      current.mission.result,
      null,
      `${label}: mission ended before the probe`,
    );
    await follow(current);
    current = await step(batch);
    spent += batch;
  }
  assert.ok(
    predicate(current),
    `${label}: bounded actual physics reached its target`,
  );
  return current;
}
const cuts = (state) =>
  state.events.filter((event) => event.type === 'interceptor-breakwater');
const activations = (state) =>
  state.events.filter(
    (event) =>
      event.type === 'equipment-activate' && event.payload.kind === 'lance',
  ).length;
async function nativeCut(index, label) {
  let current = await until(
    (state) =>
      state.mission.counterattack.attackIndex === index &&
      state.mission.counterattack.breakwater.active,
    `${label} active shoulder`,
    { batch: 6 },
  );
  const before = activations(current);
  await button('lance', true);
  current = await step(1);
  assert.equal(
    current.input.equipment1,
    true,
    `${label} maps through production input.sample()`,
  );
  assert.ok(
    activations(current) > before,
    `${label} fires the actual issued Lance`,
  );
  current = await until(
    (state) => cuts(state).some((event) => event.payload.attackIndex === index),
    `${label} physical shoulder cutoff`,
    { batch: 6, maxTicks: 480 },
  );
  const cut = cuts(current).find(
    (event) => event.payload.attackIndex === index,
  );
  const hit = current.events.find(
    (event) =>
      event.type === 'interceptor-hit' && event.payload.key === cut.payload.key,
  );
  assert.equal(
    hit.payload.damage,
    54,
    `${label} earns the real exposed-drive payout`,
  );
  assert.equal(hit.payload.weakPoint, true);
  assert.equal(cut.payload.source, 'bulwark');
  assert.equal(cut.payload.attacker, 'player');
  assert.equal(cut.payload.equipment, 'lance');
  assert.equal(current.combat.emitters.bulwark, undefined);
  assert.ok(
    current.combat.wakes.some((wake) => wake.source === 'bulwark'),
    'cutoff retains the real laid wake',
  );
  await button('lance', false);
  console.log(
    `PASS · ${label} actual 54-damage shoulder hit and physical emitter cutoff`,
  );
  return current;
}

function auditDamage(state) {
  const credited = new Map();
  for (const event of state.events.filter(
    (event) => event.type === 'interceptor-hit',
  )) {
    assert.ok(
      !credited.has(event.payload.key),
      'one credit per physical contact',
    );
    credited.set(event.payload.key, event.payload);
  }
  const broken = new Set();
  const actualCuts = new Map(
    cuts(state).map((event) => [event.payload.key, event.payload]),
  );
  assert.equal(
    actualCuts.size,
    cuts(state).length,
    'one cutoff event per accepted key',
  );
  let health = state.mission.maxHealth,
    playerDamage = 0,
    alliedDamage = 0,
    hits = 0;
  for (const contact of state.contacts) {
    const key = `${contact.hitId}:${contact.source}:${contact.target}`;
    const event = credited.get(key);
    const lance = contact.kind === 'repulsor' && contact.equipment === 'lance';
    const pickup =
      ['arc', 'repulsor'].includes(contact.kind) &&
      (contact.equipment == null || contact.equipment === contact.kind);
    const eligible =
      health > 0 &&
      contact.target === 'bulwark' &&
      !contact.shielded &&
      ['player', 'rook', 'kite', 'manta'].includes(contact.source) &&
      (lance || pickup);
    if (!eligible) {
      assert.equal(event, undefined);
      assert.equal(actualCuts.has(key), false);
      continue;
    }
    assert.ok(event, 'every actual unblocked contact reaches the HP ledger');
    const gear = lance ? 'lance' : contact.kind;
    const { attack, attackIndex, elapsed } = contact.encounter;
    const age = attack ? elapsed - attack.started : -1;
    const point = contact.hitLocal;
    const side = attackIndex % 2 === 0 ? 1 : -1;
    const isPlayer = contact.source === 'player';
    const shoulder =
      isPlayer &&
      ['lance', 'arc'].includes(gear) &&
      attackIndex >= 0 &&
      !broken.has(attackIndex) &&
      age >= 1 - 1e-8 &&
      age < 5.3 - 1e-8 &&
      Array.isArray(point) &&
      point.every(Number.isFinite) &&
      side * point[0] >= 3 &&
      side * point[0] <= 5.4 &&
      point[1] >= -0.3 &&
      point[1] <= 2.4 &&
      point[2] >= -11.1 &&
      point[2] <= -8.8;
    const damage = Math.min(
      health,
      isPlayer
        ? (shoulder
            ? { lance: 54, arc: 15 }
            : { lance: 9, arc: 2, repulsor: 6 })[gear]
        : { lance: 3, arc: 1, repulsor: 2 }[gear],
    );
    assert.equal(
      event.damage,
      damage,
      'independent real-contact armor/drive accounting',
    );
    assert.equal(!!event.weakPoint, shoulder);
    if (shoulder) {
      assert.ok(
        actualCuts.has(key),
        'the first actual shoulder contact stops the emitter',
      );
      broken.add(attackIndex);
      actualCuts.delete(key);
    } else assert.equal(actualCuts.has(key), false);
    health -= damage;
    assert.equal(event.health, health);
    if (isPlayer) playerDamage += damage;
    else alliedDamage += damage;
    hits++;
    credited.delete(key);
  }
  assert.equal(credited.size, 0);
  assert.equal(actualCuts.size, 0);
  assert.equal(state.mission.health, health);
  assert.equal(state.mission.playerDamage, playerDamage);
  assert.equal(state.mission.alliedDamage, alliedDamage);
  assert.equal(state.mission.hits, hits);
}

try {
  await page.goto(
    new URL('?level=interceptor-nightweir&intro=0&music=0', base).href,
  );
  await page.waitForFunction(
    () => window.__VN_FRONTEND?.getState().screen === 'home',
  );
  assert.equal(
    await page.evaluate(() => !!window.__VN),
    false,
    'the picker remains lazy',
  );
  await enter('[data-action="interceptor"]');
  await enter('[data-level="interceptor-nightweir"]');
  await enter('[data-difficulty="easy"]');
  const beforeCareer = (await front()).career.state;
  await enter('[data-action="launch"]');
  await page.waitForFunction(
    () => window.__VN?.ready && window.__VN.getSnapshot().mode === 'racing',
    null,
    { timeout: 90000 },
  );
  await page.evaluate(() => window.__VN.freezeBulwarkClock());
  await page.waitForFunction(
    () =>
      window.__VN
        .readBulwark()
        .audioStatus.loadedSamples.includes('bulwark-disable'),
    null,
    { timeout: 30000 },
  );
  await page.evaluate(async () => {
    const { getRacerControl } = await import('/src/race/racers.js');
    window.__bulwarkPilot = ({
      state,
      track,
      racers,
      devices,
      runtime,
      mission,
    }) => {
      const target = racers.opponents.find(
        (racer) => racer.specification.id === 'bulwark',
      ).state;
      const attack = mission.counterattack;
      const water = attack.breakwater;
      let lane = 0;
      if (water && attack.phase === 'telegraph')
        lane = target.lateral + water.side * (water.side > 0 ? 4.8 : 5.2);
      else if (water && attack.warning && attack.locked) {
        const options = [-13, 0, 13];
        const clearance = (candidate) =>
          Math.min(...attack.aimLanes.map((aim) => Math.abs(aim - candidate)));
        lane = options.toSorted((a, b) => clearance(b) - clearance(a))[0];
      }
      const control = getRacerControl(state, track, {
        difficulty: 'hard',
        pace: 1,
        lane,
        nearby: [],
        devices: attack.warning || attack.exposed ? [] : devices,
        runtime: attack.warning || attack.exposed ? null : runtime,
      });
      // Only lane intent and ordinary longitudinal controls leave this helper.
      return {
        throttle: control.throttle,
        brake: control.brake,
        steer: control.steer,
        airbrake: control.airbrake,
      };
    };
  });
  let current = await read();
  assert.equal(current.mission.bossId, 'bulwark');
  assert.equal(current.mission.maxHealth, 450);
  assert.deepEqual(
    current.equipment.slots.filter(Boolean).map((slot) => slot.id),
    ['lance', 'injector'],
  );
  await page.keyboard.down('KeyW');
  current = await until(
    (state) =>
      state.mission.counterattack.breakwater.emitting &&
      state.mission.counterattack.elapsed >= 0.95,
    'first deposited wake',
    { batch: 6 },
  );
  assert.ok(current.combat.wakes.some((wake) => wake.source === 'bulwark'));
  await page.keyboard.press('Escape');
  const paused = await read();
  assert.equal(paused.mode, 'paused');
  const rendered = await present(12);
  assert.equal(rendered.mission.elapsed, paused.mission.elapsed);
  assert.deepEqual(
    rendered.mission.counterattack,
    paused.mission.counterattack,
    'pause freezes attack progression',
  );
  assert.deepEqual(
    rendered.combat.wakes,
    paused.combat.wakes,
    'pause neither deposits nor ages physical wake segments',
  );
  assert.deepEqual(rendered.combat.emitters, paused.combat.emitters);
  assert.equal(rendered.combat.time, paused.combat.time);
  await page.keyboard.press('Escape');
  held.clear();
  await page.keyboard.down('KeyW');
  await nativeCut(0, 'keyboard Q');
  await button('boost', false);
  await page.keyboard.up('KeyW');
  await page.evaluate(() => {
    window.__bulwarkPad.connected = true;
  });
  await read(); // Production input observes a neutral connection first.
  device = 'pad';
  await pad(7, true);
  await nativeCut(1, 'controller X');
  await button('lance', true);
  current = await until(
    (state) => !!state.mission.result,
    'actual Easy takedown',
    { batch: 60 },
  );
  assert.equal(current.mission.result.won, true);
  assert.equal(current.mission.playerValid, true);
  assert.deepEqual(
    await page.evaluate(() => window.__VN.getSnapshot().errors),
    [],
  );
  auditDamage(current);
  await page.waitForFunction(
    () => window.__VN_FRONTEND.getState().screen === 'results',
  );
  const finished = await front();
  assert.equal(finished.career.state.finishes, beforeCareer.finishes + 1);
  assert.equal(finished.career.state.points, beforeCareer.points + 5);
  assert.equal(finished.career.state.wins, beforeCareer.wins + 1);
  assert.ok(
    current.audio.voices.some(
      (voice) => voice.finish && voice.id === 'bulwark-disable',
    ),
    'the actual Bulwark disable finish cue is queued',
  );
  assert.equal(current.cameraView?.enabled, true);
  const rundown = await present(5);
  assert.equal(
    rundown.boss.fans.length,
    3,
    'all three actual drive-pressure fans are mounted',
  );
  assert.ok(
    rundown.boss.fans.every((fan) => fan.visible && fan.strength > 0),
    'the staged drive-pressure rundown is live after the real takedown',
  );
  const tableau = await present(19);
  assert.ok(
    tableau.boss.fans.every((fan) => !fan.visible && fan.strength === 0),
  );
  assert.equal(tableau.boss.visible, true);
  assert.equal(tableau.boss.hardware, true);
  assert.equal(tableau.boss.propulsion, false);
  assert.equal(tableau.boss.signals, false);
  assert.ok(
    tableau.boss.powered.length > 0 &&
      tableau.boss.powered.every((material) => material.intensity === 0),
  );
  await page.evaluate(() => {
    window.__VN.showResults();
    window.__VN.showResults();
  });
  assert.deepEqual(
    (await front()).career.state,
    finished.career.state,
    'reopening results never awards the same physical mission twice',
  );
  await button('lance', false);
  await button('boost', false);
  await button('injector', false);
  await pad(7, false);
  await page.locator('[data-action="retry-race"]').focus();
  await page.waitForTimeout(100);
  await pad(0, true);
  await page.waitForFunction(
    () => window.__VN.readBulwark().mode === 'countdown',
    null,
    { timeout: 10000 },
  );
  await pad(0, false);
  const retry = await read();
  assert.equal(retry.mission.elapsed, 0);
  assert.equal(retry.mission.health, 450);
  assert.equal(retry.mission.result, null);
  assert.deepEqual(retry.mission.counterattacks, []);
  assert.deepEqual(retry.queuedFire, []);
  assert.equal(retry.combat.shots.length, 0);
  assert.equal(retry.combat.wakes.length, 0);
  assert.deepEqual(retry.combat.emitters, {});
  assert.equal(
    retry.audio.count,
    0,
    'native retry clears the real finish audio queue',
  );
  const reset = await present(1);
  assert.equal(reset.cameraView?.enabled ?? false, false);
  assert.equal(reset.boss.rupture, false);
  assert.equal(reset.boss.fans.length, 3);
  assert.ok(
    reset.boss.fans.every((fan) => !fan.visible && fan.strength === 0),
    'native retry clears every pressure rundown fan',
  );
  assert.ok(
    !reset.audio.voices.some(
      (voice) => voice.finish || voice.id.startsWith('bulwark-'),
    ),
  );
  assert.deepEqual((await front()).career.state, finished.career.state);
  assert.deepEqual(faults, []);
  console.log(
    JSON.stringify({
      check:
        'PASS: native Bulwark keyboard/controller, real takedown, reward once and retry',
      time: current.mission.elapsed,
      playerDamage: current.mission.playerDamage,
      alliedDamage: current.mission.alliedDamage,
      hits: current.mission.hits,
      cutoffAttacks: cuts(current).map((event) => event.payload.attackIndex),
    }),
  );
} finally {
  await Promise.race([
    browser.close(),
    new Promise((resolve) => setTimeout(resolve, 5000)),
  ]);
}
process.exit(0);
