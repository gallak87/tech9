import assert from 'node:assert/strict';
import { chromium } from 'playwright';

// The pilot supplies only supported steering/throttle. Boost and issued weapons
// always come from production input.sample(), through real keyboard/pad input.
// Chrome mutes host output; an enabled mixer lets retry inspect real audio queues.
const base = process.env.VN_URL ?? 'http://127.0.0.1:5213';
const browser = await chromium.launch({
  channel: 'chrome',
  headless: true,
  args: ['--mute-audio'],
});
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
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
  window.__wraithPad = {
    id: 'Wraith native controller check',
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
    value: () => [window.__wraithPad],
  });
});
await page.route('**/src/audio/index.js*', async (route) => {
  const response = await route.fetch();
  const source = await response.text();
  assert.ok(
    source.includes('getStatus() {'),
    'the live audio owner supports read-only status',
  );
  await route.fulfill({
    response,
    body: source.replace(
      'getStatus() {',
      `
    inspectWraithQueue() { return {count:resources?.shots.size??0,
      samples:[...(resources?.shots??[])].map(shot=>shot.sampleId??'countdown')}; },
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
    assert.ok(source.includes(anchor), `live Wraith probe anchor: ${anchor}`);
  source = source.replace(
    contact,
    `
    const audit=interceptor.snapshot();
    (window.__wraithContacts??=[]).push({...structuredClone(payload),hitLocal:hitLocal&&[...hitLocal],
      encounter:{elapsed:audit.elapsed,attack:structuredClone(audit.counterattacks.at(-1)??null),
        playerLateral:audit.playerLateral,targetLateral:audit.targetLateral,gap:audit.targetDistance-audit.playerDistance}});
    ${contact}`,
  );
  source = source.replace(
    emit,
    `${emit}
    if(['interceptor-hit','interceptor-cue','equipment-activate','boost'].includes(e.type))
      (window.__wraithEvents??=[]).push(structuredClone(e));`,
  );
  source = source.replace(
    'getSnapshot() {',
    `
    freezeWraithClock() { cancelAnimationFrame(raf); return this.readWraith(); },
    stepWraith(n=1) {
      cancelAnimationFrame(raf);
      for(let i=0;i<Math.min(1200,Math.max(0,Math.floor(n)))&&mode==='racing';i++) {
        const native=input.sample();
        if(mode!=='racing')break;
        const pilot=window.__wraithPilot({state,track,racers,devices,runtime,mission:interceptor.snapshot()});
        const control={...pilot,throttle:Math.max(pilot.throttle,native.throttle),
          brake:Math.max(pilot.brake,native.brake),steer:native.steer||pilot.steer,
          boost:native.boost,airbrake:native.airbrake,
          equipment1:native.equipment1,equipment2:native.equipment2,
          equipment3:native.equipment3,equipment4:native.equipment4};
        advanceTick(control);
        const attack=interceptor.snapshot().counterattack;
        if(attack.warning)(window.__wraithNativeTrace??=[]).push({time:state.time,index:attack.attackIndex,
          rawBoost:native.boost,acceptedBoost:state.boosting,rawLance:native.equipment1,
          rawInjector:native.equipment2,countered:attack.countered,progress:attack.counterProgress});
      }
      render(last||performance.now());cancelAnimationFrame(raf);
      return this.readWraith();
    },
    presentWraith(frames=1) {
      cancelAnimationFrame(raf);
      for(let i=0;i<Math.min(30,frames);i++){render((last||performance.now())+50);cancelAnimationFrame(raf);}
      return this.readWraith();
    },
    readWraith() {
      const native=input.sample(),model=racerPresentation.getShip('wraith')?.group;
      const coils=[];model?.traverse(o=>{if(o.name==='Wraith / residual ion coil')coils.push(o.visible);});
      return {mode,input:native,vehicle:{distance:state.distance,lateral:state.lateral,speed:state.speed,
        energy:state.energy,boosting:state.boosting},mission:missionSnapshot(),equipment:runtime.equipment?.(),
        cameraView:structuredClone(camera.view),queuedFire:structuredClone(pendingMissionFire),coils,
        audio:audio.inspectWraithQueue(),audioStatus:audio.getStatus(),
        combat:combat.snapshot(),contacts:structuredClone(window.__wraithContacts??[]),
        events:structuredClone(window.__wraithEvents??[]),trace:structuredClone(window.__wraithNativeTrace??[])};
    },
    getSnapshot() {`,
  );
  await route.fulfill({ response, body: source });
});

const read = () => page.evaluate(() => window.__VN.readWraith());
const step = (ticks) => page.evaluate((n) => window.__VN.stepWraith(n), ticks);
const present = (frames) =>
  page.evaluate((n) => window.__VN.presentWraith(n), frames);
const front = () => page.evaluate(() => window.__VN_FRONTEND.getState());
async function enter(selector) {
  await page.locator(selector).focus();
  await page.keyboard.press('Enter');
}
async function pad(index, pressed) {
  await page.evaluate(
    ({ index, pressed }) => {
      window.__wraithPad.buttons[index] = {
        pressed,
        touched: pressed,
        value: Number(pressed),
      };
      window.__wraithPad.timestamp = performance.now();
    },
    { index, pressed },
  );
}
async function boost(device, pressed) {
  if (device === 'keyboard')
    await page.keyboard[pressed ? 'down' : 'up']('Shift');
  else await pad(0, pressed);
}
async function equipment(device, slot, pressed) {
  if (device === 'keyboard')
    await page.keyboard[pressed ? 'down' : 'up'](slot === 0 ? 'KeyQ' : 'KeyE');
  else await pad(slot === 0 ? 2 : 3, pressed);
}
const activations = (state, kind) =>
  state.events.filter(
    (event) =>
      event.type === 'equipment-activate' && event.payload.kind === kind,
  ).length;
async function until(predicate, label, maxTicks = 18000) {
  let current = await read(),
    spent = 0;
  while (!predicate(current) && spent < maxTicks) {
    assert.equal(
      current.mission.result,
      null,
      `${label}: mission ended before the native probe`,
    );
    current = await step(30);
    spent += 30;
  }
  assert.ok(
    predicate(current),
    `${label}: bounded physical stepping reached its target`,
  );
  return current;
}
async function atLock(index) {
  let current = await until(
    (state) => state.mission.counterattack.attackIndex === index,
    `attack ${index + 1}`,
  );
  while (current.mission.counterattack.elapsed < 1.1) current = await step(1);
  assert.ok(
    current.mission.counterattack.elapsed < 1.2,
    'the probe remains inside the authored post-lock response window',
  );
  return current;
}
async function counter(device, index, pauseProbe = false) {
  let current = await atLock(index);
  assert.equal(
    current.input.boost,
    true,
    `${device} early-held boost arrives through input.sample`,
  );
  assert.equal(current.mission.counterattack.boostHeld, true);
  assert.equal(
    current.mission.counterattack.countered,
    false,
    'holding early never fabricates a resonance counter',
  );
  assert.equal(current.mission.counterattack.counterProgress, 0);
  await boost(device, false);
  if (pauseProbe) {
    await page.keyboard.press('Escape');
    const paused = await read();
    assert.equal(paused.mode, 'paused');
    const rendered = await present(12);
    assert.equal(
      rendered.mission.elapsed,
      paused.mission.elapsed,
      'production paused rendering freezes mission time',
    );
    assert.deepEqual(
      rendered.mission.counterattack,
      paused.mission.counterattack,
      'pause freezes the locked lanes and response clock',
    );
    assert.equal(rendered.mission.health, paused.mission.health);
    await page.keyboard.press('Escape');
    await page.keyboard.down('KeyW');
  }
  await step(1);
  const before = await read();
  await equipment(device, 1, true);
  current = await step(1);
  assert.equal(
    current.input.equipment2,
    true,
    `${device} Injector maps through production input`,
  );
  assert.ok(activations(current, 'injector') > activations(before, 'injector'));
  assert.ok(
    current.vehicle.energy >= before.vehicle.energy,
    'the real Injector refills the real reserve',
  );
  assert.equal(
    current.mission.counterattack.countered,
    false,
    'Injector alone never breaks lock',
  );
  await equipment(device, 1, false);
  await step(1);
  await boost(device, true);
  current = await step(39);
  assert.equal(current.input.boost, true);
  assert.equal(
    current.mission.counterattack.countered,
    true,
    `${device} fresh accepted ignition breaks lock`,
  );
  assert.equal(current.mission.counterattack.counterProgress, 1);
  assert.ok(
    current.trace.some(
      (tick) =>
        tick.index === index &&
        tick.rawBoost &&
        tick.acceptedBoost &&
        tick.countered,
    ),
    'the counter includes real accepted propulsion, with no manufactured state',
  );
  await boost(device, false);
  console.log(
    `PASS · ${device} early hold refused; native Injector and fresh accepted ignition verified`,
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
      'each actual hit is credited once',
    );
    credited.set(event.payload.key, event.payload);
  }
  let health = state.mission.maxHealth,
    player = 0,
    allied = 0,
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
      contact.target === 'wraith' &&
      !contact.shielded &&
      ['player', 'rook', 'kite', 'manta'].includes(contact.source) &&
      (lance || pickup);
    if (!eligible) {
      assert.equal(event, undefined);
      continue;
    }
    assert.ok(
      event,
      'every real unblocked physical target contact reaches the damage ledger',
    );
    const gear = lance ? 'lance' : contact.kind;
    const input = contact.encounter,
      attack = input.attack;
    const age = attack ? input.elapsed - attack.started : -1;
    const exposed =
      attack?.countered === true && age >= 3.35 - 1e-8 && age < 6 - 1e-8;
    const point = contact.hitLocal,
      isPlayer = contact.source === 'player';
    const core =
      exposed &&
      (gear === 'repulsor'
        ? isPlayer &&
          Math.abs(input.playerLateral - input.targetLateral) <= 1.4 &&
          input.gap >= 0 &&
          input.gap <= 38
        : Array.isArray(point) &&
          point.every(Number.isFinite) &&
          Math.abs(point[0]) <= 1.4 &&
          point[1] >= -0.3 &&
          point[1] <= 2.6 &&
          point[2] >= -10 &&
          point[2] <= -7);
    const damage = Math.min(
      health,
      isPlayer
        ? (core
            ? { lance: 54, arc: 15, repulsor: 36 }
            : { lance: 9, arc: 2, repulsor: 6 })[gear]
        : (core
            ? { lance: 4, arc: 2, repulsor: 3 }
            : { lance: 3, arc: 1, repulsor: 2 })[gear],
    );
    assert.equal(
      event.damage,
      damage,
      'actual damage follows the independent armor/core contract',
    );
    assert.equal(!!event.weakPoint, core);
    health -= damage;
    assert.equal(event.health, health);
    if (isPlayer) player += damage;
    else allied += damage;
    hits++;
    credited.delete(key);
  }
  assert.equal(credited.size, 0);
  assert.equal(state.mission.health, health);
  assert.equal(state.mission.playerDamage, player);
  assert.equal(state.mission.alliedDamage, allied);
  assert.equal(state.mission.hits, hits);
}

try {
  await page.goto(new URL('?level=interceptor-helion&music=0', base).href);
  await page.waitForFunction(
    () => window.__VN_FRONTEND?.getState().screen === 'home',
  );
  assert.equal(
    await page.evaluate(() => !!window.__VN),
    false,
    'the mode picker remains lazy',
  );
  await enter('[data-action="interceptor"]');
  await enter('[data-level="interceptor-helion"]');
  await enter('[data-difficulty="easy"]');
  const beforeCareer = (await front()).career.state;
  await enter('[data-action="launch"]');
  await page.waitForFunction(
    () => window.__VN?.ready && window.__VN.getSnapshot().mode === 'racing',
    null,
    { timeout: 90000 },
  );
  await page.evaluate(() => window.__VN.freezeWraithClock());
  await page.waitForFunction(
    () =>
      window.__VN
        .readWraith()
        .audioStatus.loadedSamples.includes('wraith-disable'),
    null,
    { timeout: 30000 },
  );
  await page.evaluate(async () => {
    const { getRacerControl } = await import('/src/race/racers.js');
    const { createInterceptorField } =
      await import('/src/events/interceptor-field.js');
    let detour;
    window.__wraithPilot = ({ state, track, devices, runtime, mission }) => {
      const attack = mission.counterattack;
      const lane =
        attack.locked && attack.warning
          ? mission.counterattacks.at(-1).trackingLane
          : 0;
      let control = getRacerControl(state, track, {
        difficulty: 'hard',
        pace: 1,
        lane,
        nearby: [],
        devices: attack.warning || attack.exposed ? [] : devices,
        runtime: attack.warning || attack.exposed ? null : runtime,
      });
      const s = ((state.distance % track.length) + track.length) % track.length;
      if (
        track.pursuitPath?.intervals.some(
          (interval) => s >= interval.start && s <= interval.end,
        )
      ) {
        detour ??= createInterceptorField({ track, bossId: 'wraith' });
        control = detour.control({
          opponent: { specification: { id: 'wraith' }, state, runtime },
          track,
          devices,
          nearby: [],
          defaultControl: control,
        });
      }
      // This helper never supplies boost or weapon bits; native input owns them.
      delete control.boost;
      return control;
    };
  });
  const start = await read();
  assert.deepEqual(
    start.equipment.slots.filter(Boolean).map((slot) => slot.id),
    ['lance', 'injector'],
  );
  assert.equal(start.mission.maxHealth, 450);
  assert.equal(start.mission.bossId, 'wraith');
  await page.keyboard.down('KeyW');
  await boost('keyboard', true);
  await counter('keyboard', 0, true);
  await until(
    (state) =>
      state.mission.counterattack.exposed &&
      state.mission.counterattack.phaseElapsed >= 0.65,
    'first real capacitor opening',
  );
  let before = await read();
  await equipment('keyboard', 0, true);
  let current = await step(1);
  assert.equal(current.input.equipment1, true);
  assert.ok(
    activations(current, 'lance') > activations(before, 'lance'),
    'native Q fires the actual issued Lance',
  );
  await equipment('keyboard', 0, false);
  await step(30);
  await page.keyboard.up('KeyW');
  await page.evaluate(() => {
    window.__wraithPad.connected = true;
  });
  await read(); // Observe the connection at neutral before pressing mapped buttons.
  await pad(7, true);
  await boost('pad', true);
  await counter('pad', 1);
  await until(
    (state) =>
      state.mission.counterattack.exposed &&
      state.mission.counterattack.phaseElapsed >= 0.65,
    'second real capacitor opening',
  );
  before = await read();
  await equipment('pad', 0, true);
  current = await step(1);
  assert.equal(current.input.equipment1, true);
  assert.ok(
    activations(current, 'lance') > activations(before, 'lance'),
    'native controller X fires the actual issued Lance',
  );
  for (let batch = 0; batch < 360 && !current.mission.result; batch++) {
    const attack = current.mission.counterattack;
    if (attack.warning && attack.canCounter && !attack.countered) {
      await boost('pad', false);
      await step(1);
      if (
        current.vehicle.energy < 20 &&
        current.equipment.slots[1].remaining <= 0
      ) {
        await equipment('pad', 1, true);
        await step(1);
        await equipment('pad', 1, false);
      }
      await boost('pad', true);
      current = await step(39);
      await boost('pad', false);
    } else {
      if (attack.phase === 'idle') await boost('pad', true);
      current = await step(60);
    }
  }
  assert.ok(
    current.mission.result?.won,
    'the native controls and actual physical weapons achieve a real Easy takedown',
  );
  assert.equal(current.mission.playerValid, true);
  assert.deepEqual(
    await page.evaluate(() => window.__VN.getSnapshot().errors),
    [],
  );
  auditDamage(current);
  const finished = await front();
  assert.equal(finished.screen, 'results');
  assert.equal(finished.career.state.finishes, beforeCareer.finishes + 1);
  assert.equal(finished.career.state.points, beforeCareer.points + 5);
  assert.equal(finished.career.state.wins, beforeCareer.wins + 1);
  assert.ok(
    current.audio.count > 0,
    'a real finish voice is queued before retry',
  );
  assert.equal(current.cameraView?.enabled, true);
  await page.evaluate(() => {
    window.__VN.showResults();
    window.__VN.showResults();
  });
  assert.deepEqual(
    (await front()).career.state,
    finished.career.state,
    'results never award the same physical mission twice',
  );
  await equipment('pad', 0, false);
  await boost('pad', false);
  await pad(7, false);
  await page.locator('[data-action="retry-race"]').focus();
  await page.waitForTimeout(100);
  await pad(0, true);
  await page.waitForFunction(
    () => window.__VN.readWraith().mode === 'countdown',
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
  assert.equal(
    retry.audio.count,
    0,
    'native retry clears the real finish audio queue',
  );
  assert.equal(retry.combat.shots.length, 0);
  const reset = await present(1);
  assert.equal(
    reset.cameraView?.enabled ?? false,
    false,
    'retry clears the result-only camera projection',
  );
  assert.ok(
    reset.coils.every((visible) => visible === false),
    'retry clears the real defeat presentation',
  );
  assert.ok(
    !reset.audio.samples.some((id) => id.startsWith('wraith-')),
    'new countdown cannot revive a stale boss cue',
  );
  assert.deepEqual(faults, []);
  console.log(
    JSON.stringify({
      check: 'native Wraith keyboard/controller, real takedown and retry',
      time: current.mission.elapsed,
      playerDamage: current.mission.playerDamage,
      alliedDamage: current.mission.alliedDamage,
      hits: current.mission.hits,
      countered: current.mission.counterattacks.map(
        (attack) => attack.countered,
      ),
    }),
  );
} finally {
  await Promise.race([
    browser.close(),
    new Promise((resolve) => setTimeout(resolve, 5000)),
  ]);
}
process.exit(0);
