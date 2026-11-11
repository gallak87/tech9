import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const base = process.env.VN_URL ?? 'http://127.0.0.1:5213';
const difficulty = process.env.VN_DIFFICULTY ?? 'easy';
assert.ok(['easy', 'medium', 'hard'].includes(difficulty));
const selectedBosses = process.env.VN_BOSSES?.split(',');
const closeBoost = process.env.VN_CLOSE_BOOST === '1';
const encounters = [
  {
    level: 'interceptor',
    boss: 'goliath',
    name: 'Goliath',
    kind: 'lance',
    progress: 1.3,
  },
  {
    level: 'interceptor-helion',
    boss: 'wraith',
    name: 'Wraith',
    kind: 'arc',
    progress: 1.35,
  },
  {
    level: 'interceptor-nightweir',
    boss: 'bulwark',
    name: 'Bulwark',
    kind: 'lance',
    progress: 1.3,
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
await page.addInitScript(
  ({ difficulty, closeBoost }) => {
    localStorage.setItem(
      'vector-nova.settings',
      JSON.stringify({
        quality: 'low',
        volume: 0,
        reducedMotion: true,
        difficulty,
      }),
    );
    window.__variantCloseBoost = closeBoost;
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
  },
  { difficulty, closeBoost },
);

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
      const audit = window.__variantAudit ??= {maxSpeed:0,maxStep:0,maxRouteStep:0,maxHeight:0,maxSupportedHeight:0,airborneTicks:0,invalidAirborneTicks:0,flightIds:[],maxHeat:0,coolingTicks:0,cooledOnStrip:false,maxLateral:0,phases:[],shots:[],wakes:0,maxWeave:0,attackLaps:{},minGap:Infinity,closeBoostTicks:0};
      const shotIds = window.__variantShotIds ??= new Set();
      for(let i=0;i<Math.min(ticks,1200)&&mode==='racing';i++) {
        advanceTick(window.__variantPilot({state:{...state},track,racers,devices,runtime}));
        const target = racers.opponents.find(opponent=>opponent.specification.id===missionBoss.id);
        const physical = target.runtime.pose(1), frame = track.sample(target.state.distance), error = physical.position.clone().sub(frame.position);
        const chaseGap=target.state.distance-state.distance;
        audit.minGap=Math.min(audit.minGap,chaseGap);
        if(chaseGap<90&&state.boosting)audit.closeBoostTicks++;
        audit.maxSpeed = Math.max(audit.maxSpeed,physical.velocity?.length()??Math.abs(target.state.speed));
        audit.maxHeight = Math.max(audit.maxHeight,Math.abs(error.dot(frame.up)));
        const movement = target.runtime.snapshot().motion;
        if(physical.grounded===false) {
          audit.airborneTicks++;
          const flightId=movement?.flight?.flight?.id;
          if(movement?.mode!=='flight'||!track.jumps?.some(jump=>jump.id===flightId))audit.invalidAirborneTicks++;
          else if(!audit.flightIds.includes(flightId))audit.flightIds.push(flightId);
        } else audit.maxSupportedHeight=Math.max(audit.maxSupportedHeight,Math.abs(error.dot(frame.up)));
        if(Number.isFinite(movement?.heat)) {
          audit.maxHeat=Math.max(audit.maxHeat,movement.heat);
          const at=T.MathUtils.euclideanModulo(target.state.distance,track.length);
          if(track.thermalZones?.some(zone=>zone.kind==='cooling'&&at>=zone.start&&at<=zone.end)) {
            audit.coolingTicks++;
            if(Number.isFinite(audit.previousHeat)&&movement.heat<audit.previousHeat-1e-6)audit.cooledOnStrip=true;
          }
          audit.previousHeat=movement.heat;
        }
        audit.maxLateral = Math.max(audit.maxLateral,Math.abs(error.dot(frame.right)));
        if(audit.previous) {
          audit.maxStep = Math.max(audit.maxStep,physical.position.distanceTo(new T.Vector3().fromArray(audit.previous.position)));
          audit.maxRouteStep = Math.max(audit.maxRouteStep,Math.abs(target.state.distance-audit.previous.distance));
        }
        audit.previous={position:physical.position.toArray(),distance:target.state.distance};
        const attack = interceptor.snapshot().counterattack;
        if(attack.warning) {
          if(!audit.phases.includes(attack.phase))audit.phases.push(attack.phase);
          const lap=audit.attackLaps[attack.lap]??={warningTicks:0,firingTicks:0,backwardTicks:0,minHullDot:1,warningVisible:false};
          lap.warningTicks++;
          if(!lap.warningVisible) {
            eventPresentation.update({mode,settings,interceptor:missionSnapshot()});
            const warning=host.querySelector('.ic-counterattack');
            lap.warningVisible=!!warning&&!warning.hidden&&warning.getBoundingClientRect().height>0&&/CHARGING|TURNING|VOLLEY/.test(warning.textContent);
          }
          if(attack.phase==='firing') {
            audit.maxWeave=Math.max(audit.maxWeave,Math.abs(target.state.lateral));
            lap.firingTicks++;
            const hullDot=new T.Vector3(0,0,1).applyQuaternion(physical.quaternion).dot(frame.tangent);
            lap.minHullDot=Math.min(lap.minHullDot,hullDot);
            if(hullDot<-.9)lap.backwardTicks++;
          }
        }
        const active = combat.view();
        for(const shot of active.shots)if(shot.source===missionBoss.id&&!shotIds.has(shot.id)) {
          shotIds.add(shot.id);
          audit.shots.push({lap:attack.lap,heavy:!!shot.heavy,forwardDot:new T.Vector3(0,0,1).applyQuaternion(new T.Quaternion().fromArray(shot.quaternion)).dot(frame.tangent),velocityDot:new T.Vector3().fromArray(shot.velocity).dot(frame.tangent)});
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
        target:{...target.state},routeLength:track.length,errors:[...errors],
        playerMotion:{id:runtime.id,rulesId:runtime.rulesId,state:runtime.snapshot().motion},
        motions:racers.opponents.map(opponent=>({id:opponent.specification.id,runtime:{id:opponent.runtime.id,version:opponent.runtime.version,rulesId:opponent.runtime.rulesId,state:opponent.runtime.snapshot().motion}}))};
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
        nearby: window.__variantCloseBoost
          ? []
          : [state, ...racers.opponents.map((opponent) => opponent.state)],
        runtime,
      });
      if (window.__variantCloseBoost) {
        input.throttle = 1;
        input.brake = 0;
        input.boost = true;
        input.equipment1 =
          state.time > 2 && state.time < 5 && gap > 25 && gap < 440;
        input.equipment2 = state.energy < 35;
        return input;
      }
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
        state.time > 2 && state.time < 5 && gap > 25 && gap < 440;
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
  const cards = await page.locator('.circuit-card').evaluateAll((elements) =>
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
  await press('[data-level="interceptor-helion"]');
  assert.equal((await frontend()).selected, 'interceptor-helion');
  await press('[data-action="quick-race"]');
  await press('[data-action="interceptor"]');
  assert.equal((await frontend()).selected, 'interceptor-helion');
  await page.reload();
  await page.waitForFunction(
    () => window.__VN_FRONTEND?.getState().screen === 'home',
  );
  assert.equal((await frontend()).selected, 'interceptor-helion');
  await page.evaluate(() => {
    window.__variantPad.connected = true;
  });
  await page.waitForTimeout(100);
  await page.locator('[data-level="interceptor-helion"]').focus();
  await pad(15, true);
  await pad(15, false);
  assert.equal(
    await page.evaluate(() => document.activeElement.dataset.level),
    'interceptor-nightweir',
  );
  await pad(0, true);
  await pad(0, false);
  assert.equal((await frontend()).selected, 'interceptor-nightweir');
  await page.evaluate(() => {
    window.__variantPad.connected = false;
  });
  console.log(
    'PASS · three named boss cards, clean accessibility labels, keyboard/controller selection and remembered encounter',
  );

  for (const encounter of encounters) {
    if (selectedBosses && !selectedBosses.includes(encounter.boss)) continue;
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
    assert.equal(
      start.snapshot.interceptor.maxHealth,
      { easy: 450, medium: 700, hard: 950 }[difficulty],
    );
    assert.equal(start.diagnostics.actors, 5);
    assert.ok(start.diagnostics.roster.includes(encounter.boss));
    assert.equal(start.diagnostics.model?.id, encounter.boss);
    const bossMotion = start.diagnostics.motions.find(
      (opponent) => opponent.id === encounter.boss,
    ).runtime;
    if (encounter.boss === 'wraith') {
      assert.equal(bossMotion.id, 'interceptor-helion-thermal-flight-devices');
      assert.ok(bossMotion.rulesId.includes('helion-thermal-flight-v4:'));
      assert.ok(bossMotion.rulesId.includes('courier-facing-v3-driving-axis'));
      for (const motion of [
        bossMotion,
        start.diagnostics.playerMotion,
        ...start.diagnostics.motions
          .filter((opponent) => opponent.id !== encounter.boss)
          .map((opponent) => opponent.runtime),
      ]) {
        assert.ok(
          motion.id.includes('helion-thermal-flight'),
          'live Helion controllers are composed for the whole field',
        );
        for (const key of ['heat', 'contactAge', 'contactHeat'])
          assert.ok(
            Number.isFinite(motion.state?.[key]),
            'live Helion state includes ' + key,
          );
      }
    } else {
      assert.equal(bossMotion.id, 'interceptor-magnetic-devices');
    }
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
    for (let batch = 0; batch < 36; batch++) {
      latest = await page.evaluate(() => ({
        snapshot: window.__VN.stepVariant(600),
        diagnostics: window.__VN.variantDiagnostics(),
      }));
      auditDamage(latest.snapshot.interceptor, latest.diagnostics.contacts);
      if ((batch + 1) % 6 === 0)
        console.log(
          JSON.stringify({
            progress: encounter.boss,
            batch: batch + 1,
            seconds: latest.snapshot.interceptor.elapsed,
            target: latest.diagnostics.target.distance,
            speed: latest.diagnostics.target.speed,
            player: latest.snapshot.interceptor.playerDistance,
            result: latest.snapshot.interceptor.result?.reason ?? null,
          }),
        );
      if (
        latest.snapshot.interceptor.result ||
        (latest.diagnostics.target.distance >=
          latest.diagnostics.routeLength * encounter.progress &&
          latest.snapshot.interceptor.counterattack.phase === 'idle')
      )
        break;
    }
    const { audit } = latest.diagnostics;
    if (
      !audit.phases.includes('firing') ||
      latest.snapshot.interceptor.counterattacks.length < 2
    ) {
      const motion = latest.diagnostics.motions.find(
        (opponent) => opponent.id === encounter.boss,
      ).runtime;
      console.log(
        JSON.stringify({
          failure: 'missing lap signature',
          boss: encounter.boss,
          mission: latest.snapshot.interceptor,
          target: latest.diagnostics.target,
          routeLength: latest.diagnostics.routeLength,
          audit,
          motion: { id: motion.id, state: motion.state },
          errors: latest.diagnostics.errors,
        }),
      );
    }
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
    assert.ok(
      audit.maxSupportedHeight < 4,
      'bounded magnetic support for ' + encounter.boss,
    );
    if (encounter.boss === 'wraith') {
      assert.equal(
        audit.invalidAirborneTicks,
        0,
        'Wraith only leaves support in a real authored vault flight',
      );
      assert.ok(
        audit.maxHeat > 0,
        'live Wraith accumulates heat in actual furnaces',
      );
      assert.ok(
        audit.coolingTicks > 0 && audit.cooledOnStrip,
        'live Wraith loses stored heat on a real cooling strip',
      );
    } else {
      assert.equal(audit.airborneTicks, 0, 'magnetic boss stays supported');
      assert.ok(audit.maxHeight < 4, 'magnetic support for ' + encounter.boss);
    }
    assert.ok(
      latest.snapshot.interceptor.playerDamage > 0,
      'real player attacks hit ' + encounter.boss,
    );
    assert.ok(
      audit.minGap >= 29.99,
      'the physical pursuit buffer prevents passing ' + encounter.boss,
    );
    if (closeBoost)
      assert.ok(
        audit.closeBoostTicks > 120,
        'held manual boost reaches the real pursuit buffer for ' +
          encounter.boss,
      );
    const pulseHits = latest.diagnostics.contacts.filter(
      (contact) =>
        contact.source === 'player' &&
        contact.target === encounter.boss &&
        contact.kind === 'repulsor' &&
        contact.equipment !== 'lance' &&
        !contact.shielded,
    ).length;
    if (closeBoost && encounter.boss === 'bulwark')
      assert.ok(
        pulseHits > 0,
        'ordinary Repulsor gates hit the boss from the pursuit buffer',
      );
    const mission = latest.snapshot.interceptor;
    assert.equal(
      mission.counterattacks.length,
      2,
      'each physical lap marker is consumed',
    );
    assert.deepEqual(
      mission.counterattacks.map((attack) => attack.shots),
      difficulty === 'easy' ? [1, 1] : [2, 2],
      'both lap volleys follow encounter difficulty',
    );
    for (const lap of [1, 2]) {
      const attack = audit.attackLaps[lap];
      assert.ok(
        attack?.warningTicks >= 120,
        'visible warning for lap ' + lap + ' of ' + encounter.boss,
      );
      assert.ok(
        attack.warningVisible,
        'the live HUD renders the charge/turn warning on lap ' +
          lap +
          ' of ' +
          encounter.boss,
      );
      assert.ok(
        attack.firingTicks >= 120,
        'sustained firing hold for lap ' + lap + ' of ' + encounter.boss,
      );
      assert.ok(
        attack.backwardTicks > 90 && attack.minHullDot < -0.9,
        'physical hull turns rearward on lap ' + lap + ' of ' + encounter.boss,
      );
      const signatureShots = audit.shots.filter(
        (shot) =>
          shot.lap === lap && shot.heavy === (encounter.kind === 'lance'),
      );
      assert.equal(
        signatureShots.length,
        (difficulty === 'easy' ? 1 : 2) * (encounter.kind === 'arc' ? 3 : 1),
        'each scheduled volley emits its actual projectiles on lap ' +
          lap +
          ' of ' +
          encounter.boss,
      );
      assert.ok(
        signatureShots.every(
          (shot) => shot.forwardDot < -0.9 && shot.velocityDot < 0,
        ),
        'real rearward signature projectiles on lap ' +
          lap +
          ' of ' +
          encounter.boss,
      );
    }
    assert.ok(
      latest.diagnostics.contacts.some(
        (contact) =>
          contact.source === encounter.boss &&
          ['player', 'rook', 'kite', 'manta'].includes(contact.target) &&
          (encounter.kind === 'lance'
            ? contact.equipment === 'lance'
            : contact.kind === 'arc'),
      ),
      'the signature volley makes a real squad contact for ' + encounter.boss,
    );
    if (encounter.boss === 'bulwark') {
      assert.ok(audit.wakes > 0, 'Bulwark lays a real Ion wake');
      assert.ok(audit.maxWeave > 0.25, 'Bulwark changes its physical lane');
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
        maxSupportedHeight: audit.maxSupportedHeight,
        airborneTicks: audit.airborneTicks,
        flightIds: audit.flightIds,
        motion: bossMotion.id,
        ...(encounter.boss === 'wraith'
          ? { maxHeat: audit.maxHeat, cooledOnStrip: audit.cooledOnStrip }
          : {}),
        signature: encounter.kind,
        difficulty,
        minGap: audit.minGap,
        closeBoostTicks: audit.closeBoostTicks,
        pulseHits,
        attackLaps: audit.attackLaps,
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
