import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { chromium } from 'playwright';
import { seedInterceptorCareer } from './interceptor-career-seed.mjs';

const base = process.env.VN_URL ?? 'http://127.0.0.1:5215';
const probeOnly = process.env.VN_INTERCEPTOR_PROBE === '1';
const nativeOnly = process.env.VN_INTERCEPTOR_NATIVE === '1';
const browser = await chromium.launch({
  channel: 'chrome',
  headless: true,
  args: ['--mute-audio'],
});
const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });
await seedInterceptorCareer(page);
const faults = [];
page.on('pageerror', (error) => faults.push(error.message));
await page.addInitScript(
  ({ difficulty }) => {
    localStorage.setItem(
      'vector-nova.settings',
      JSON.stringify({
        quality: 'low',
        volume: 0,
        reducedMotion: true,
        difficulty,
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
  },
  { difficulty: probeOnly ? 'medium' : 'easy' },
);

// Diagnostics exist only in this intercepted dev response. All motion,
// weapon requests, impacts and damage still use the unchanged live session.
await page.route('**/src/core/game.js*', async (route) => {
  const response = await route.fetch(),
    source = await response.text();
  assert.ok(source.includes('getSnapshot() {'));
  assert.ok(source.includes('onHit(payload) {'));
  const contactAnchor = 'for (const hit of interceptor.hit({';
  const combatAnchor = 'const { combat } = simulationActors.prepareRacing();';
  assert.ok(
    source.includes(contactAnchor),
    'the live owner still receives physical contacts',
  );
  assert.ok(
    source.includes(combatAnchor),
    'the live session exposes its combat owner',
  );
  assert.ok(
    source.includes('const event = { ...e, tick, time: state.time };'),
    'the live event ledger is instrumented',
  );
  const audited = source
    .replace(
      contactAnchor,
      `const probeMission = interceptor.snapshot();
    (window.__missionProbeContacts ??= []).push({
      ...structuredClone(payload), hitLocal: hitLocal && [...hitLocal],
      encounter: { elapsed:probeMission.elapsed,
        playerLateral:probeMission.playerLateral,targetLateral:probeMission.targetLateral,
        gap:probeMission.targetDistance-probeMission.playerDistance,
        attack:structuredClone(probeMission.counterattacks.at(-1)??null) },
    });
    ${contactAnchor}`,
    )
    .replace(
      'const event = { ...e, tick, time: state.time };',
      `const event = { ...e, tick, time: state.time };
    if(e.type==='interceptor-hit')
      (window.__missionProbeAccepted ??= []).push(structuredClone(e.payload));`,
    )
    .replace(
      'onMode(value);',
      `(window.__missionProbeModes ??= []).push({ mode:value,screen:window.__VN_FRONTEND?.getState().screen,difficulty:interceptor?.snapshot().difficulty,maxHealth:interceptor?.snapshot().maxHealth });
    onMode(value);`,
    )
    .replace(
      combatAnchor,
      `${combatAnchor}
    if(combat && interceptor) {
      const originalFireLance = combat.fireLance.bind(combat);
      combat.fireLance = (id,options) => {
        const fired = originalFireLance(id,options);
        if(fired && id===missionBoss.id) {
          const shot=combat.snapshot().shots.findLast(shot=>shot.source===id);
          const target=racers.opponents.find(opponent=>opponent.specification.id===id);
          if(shot && target) {
            const frame=track.sample(target.state.distance);
            (window.__missionProbeCountershots ??= []).push({
              distance:target.state.distance,speed:target.state.speed,
              phase:interceptor.snapshot().counterattack,
              hullForwardDot:new T.Vector3(0,0,1).applyQuaternion(target.runtime.pose(1).quaternion).dot(frame.tangent),
              hunterDot:new T.Vector3().fromArray(shot.velocity).normalize().dot(runtime.pose(1).position.clone().sub(new T.Vector3().fromArray(shot.position)).normalize()),
              velocityDot:new T.Vector3().fromArray(shot.velocity).dot(frame.tangent),
              forwardDot:new T.Vector3(0,0,1).applyQuaternion(new T.Quaternion().fromArray(shot.quaternion)).dot(frame.tangent),
              shot:structuredClone(shot),
            });
          }
        }
        return fired;
      };
    }`,
    );
  await route.fulfill({
    response,
    body: audited.replace(
      'getSnapshot() {',
      `
    stepMission(n,control={}) {
      if(interceptor?.snapshot().result)return this.getSnapshot();
      const { devices } = simulationActors.prepareRacing();
      cancelCountdown();mode='racing';ui.setMode(mode);
      for(let i=0;i<Math.min(n,1200)&&mode==='racing';i++) {
        advanceTick(typeof control==='function'?control({state:{...state},motion:runtime.snapshot(),track,racers,devices,avoidance:runtime.avoidance?.()}):control);
        input.consumeEquipment();
        const attack = interceptor.snapshot().counterattack;
        const quarry = racers.opponents.find(opponent => opponent.specification.id === 'goliath');
        const physical = quarry.runtime.pose(1), routeFrame = track.sample(quarry.state.distance);
        const error = physical.position.clone().sub(routeFrame.position);
        const audit = window.__missionProbeMotion ??= {maxStepDistance:0,maxStepMovement:0,maxHeight:0,maxLateral:0,maxReportedSpeed:0,maxWorldSpeed:0};
        if (audit.last) {
          const routeStep = Math.abs(quarry.state.distance-audit.last.distance), worldStep = physical.position.distanceTo(new T.Vector3().fromArray(audit.last.position));
          if(routeStep > audit.maxStepDistance) {
            audit.maxStepDistance = routeStep;
            audit.routePeak = {time:quarry.state.time,from:audit.last.distance,to:quarry.state.distance,position:physical.position.toArray(),previousPosition:audit.last.position,worldStep,phase:attack.phase};
          }
          if(worldStep > audit.maxStepMovement) {
            audit.maxStepMovement = worldStep;
            audit.worldPeak = {time:quarry.state.time,from:audit.last.distance,to:quarry.state.distance,position:physical.position.toArray(),previousPosition:audit.last.position,routeStep,phase:attack.phase};
          }
        }
        audit.maxHeight = Math.max(audit.maxHeight, Math.abs(error.dot(routeFrame.up)));
        audit.maxLateral = Math.max(audit.maxLateral, Math.abs(error.dot(routeFrame.right)));
        audit.maxReportedSpeed = Math.max(audit.maxReportedSpeed, Math.abs(quarry.state.speed));
        audit.maxWorldSpeed = Math.max(audit.maxWorldSpeed,physical.velocity?.length()??Math.abs(quarry.state.speed));
        audit.last = {distance:quarry.state.distance,position:physical.position.toArray()};
        if (attack.warning) {
          const target = racers.opponents.find(opponent => opponent.specification.id === 'goliath');
          const pose = target.runtime.pose(1), frame = track.sample(target.state.distance);
          (window.__missionProbeCounterframes ??= []).push({
            distance: target.state.distance, speed: target.state.speed,
            phase: attack.phase, yaw: attack.yaw,
            forwardDot: new T.Vector3(0,0,1).applyQuaternion(pose.quaternion).dot(frame.tangent),
          });
        }
      }
      if(mode==='racing')pause();return this.getSnapshot();
    },
    missionDiagnostics() {
      let boss=null;scene.traverse(object=>{if(object.userData.rivalId==='goliath')boss=object;});
      const quarry = racers.opponents.find(opponent=>opponent.specification.id==='goliath');
      const pose = quarry.runtime.pose(1), frame = track.sample(quarry.state.distance), body = dynamics.snapshot().actors.find(actor=>actor.contactShape?.id==='goliath');
      const error = pose.position.clone().sub(frame.position);
      const powered=new Map();
      boss?.traverse(object=>{for(const material of [object.material].flat())
        if(material?.emissive?.getHex())powered.set(material,{name:material.name,intensity:material.emissiveIntensity});});
      const bounds=boss && new T.Box3().setFromObject(boss);
      const frustum=new T.Frustum().setFromProjectionMatrix(new T.Matrix4().multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse));
      return {cameraView:structuredClone(camera.view),actors:dynamics?.snapshot().actors.map(actor=>({id:actor.id,active:actor.active,shape:actor.contactShape?{id:actor.contactShape.id,bounds:actor.contactShape.bounds,parts:actor.contactShape.parts?.length}:null}))??[],
        target:{state:{...quarry.state},position:pose.position.toArray(),quaternion:pose.quaternion.toArray(),headingOffset:quarry.runtime.snapshot().headingOffset??0,
          velocity:body.velocity,tangent:frame.tangent.toArray(),tangentVelocity:new T.Vector3().copy(body.velocity).dot(frame.tangent),worldSpeed:new T.Vector3().copy(body.velocity).length(),
          height:error.dot(frame.up),lateralError:error.dot(frame.right),roadError:error.length(),grounded:pose.grounded,recovering:pose.recovering,contacts:body.contacts},
        routeLength: track.length,
        opponents:racers.opponents.map(opponent=>({id:opponent.specification.id,state:{...opponent.state},hitBounds:opponent.specification.hitBounds,
          forwardDot:new T.Vector3(0,0,1).applyQuaternion(opponent.runtime.pose(1).quaternion).dot(track.sample(opponent.state.distance).tangent)})),
        boss:boss?{visible:boss.visible,inView:frustum.intersectsBox(bounds),
          propulsionVisible:boss.getObjectByName('Rival / propulsion')?.visible,
          powered:[...powered.values()],name:boss.name,bounds:boss.userData.bounds,scale:boss.scale.toArray(),forwardDot:new T.Vector3(0,0,1).applyQuaternion(boss.getWorldQuaternion(new T.Quaternion())).dot(track.sample(racers.opponents.find(opponent=>opponent.specification.id==='goliath').state.distance).tangent)}:null,
        combat:combat?.snapshot(),queuedFire:structuredClone(pendingMissionFire),
        counterframes:structuredClone(window.__missionProbeCounterframes??[]),
        countershots:structuredClone(window.__missionProbeCountershots??[]),
        motionAudit:structuredClone(window.__missionProbeMotion??null),
        modes:structuredClone(window.__missionProbeModes??[]),
        contacts:structuredClone(window.__missionProbeContacts??[]),
        accepted:structuredClone(window.__missionProbeAccepted??[]),
        auditBaseline:structuredClone(window.__missionProbeBaseline??null),draws:renderer.info.render.calls};
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
    window.__missionProbeAccepted = [];
    window.__missionProbeBaseline = structuredClone(
      window.__VN.getSnapshot().interceptor,
    );
    window.__missionProbeCounterframes = [];
    window.__missionProbeCountershots = [];
    window.__missionProbeMotion = null;
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
function verifyCombatAudit(mission, diagnostics) {
  const { contacts, accepted, auditBaseline } = diagnostics;
  const baseline = auditBaseline ?? {
    health: mission.maxHealth,
    playerDamage: 0,
    alliedDamage: 0,
    hits: 0,
  };
  let health = baseline.health,
    player = baseline.playerDamage,
    allied = baseline.alliedDamage,
    hits = baseline.hits;
  const seen = new Set(),
    allies = new Set(['rook', 'kite', 'manta']),
    credited = new Map();
  for (const event of accepted) {
    assert.ok(
      !credited.has(event.key),
      'the mission never credits a physical contact twice',
    );
    credited.set(event.key, event);
  }
  for (const contact of contacts) {
    const key = `${contact.hitId}:${contact.source}:${contact.target}`;
    const event = credited.get(key);
    const lance = contact.kind === 'repulsor' && contact.equipment === 'lance';
    const pickup =
      ['arc', 'repulsor'].includes(contact.kind) &&
      (contact.equipment == null || contact.equipment === contact.kind);
    if (
      health <= 0 ||
      contact.target !== 'goliath' ||
      contact.shielded ||
      !(contact.source === 'player' || allies.has(contact.source)) ||
      (!lance && !pickup)
    ) {
      assert.equal(
        event,
        undefined,
        'shielded, friendly or ineligible contacts never earn HP damage',
      );
      continue;
    }
    assert.ok(!seen.has(key), 'the raw combat owner reports each contact once');
    seen.add(key);
    assert.ok(
      event,
      `actual unblocked impact ${key} reaches the mission damage ledger`,
    );
    assert.equal(event.source, contact.source);
    assert.equal(event.target, contact.target);
    assert.equal(event.kind, contact.kind);
    const equipment = lance ? 'lance' : contact.kind;
    assert.equal(event.equipment, equipment);
    // Independent Goliath armor/core contract. Geometry comes from the real
    // swept contact; the open window is reconstructed from the attack clock,
    // rather than accepting the mission's weakPoint or final HP claims.
    const state = contact.encounter,
      attack = state.attack;
    const elapsed = attack ? state.elapsed - attack.started : -1;
    const breached =
      !!attack &&
      !attack.incomingHits.length &&
      elapsed >= 5 - 1e-8 &&
      elapsed < 8 - 1e-8;
    const point = contact.hitLocal;
    const playerContact = contact.source === 'player';
    const core =
      breached &&
      (equipment === 'repulsor'
        ? playerContact &&
          Math.abs(state.playerLateral - state.targetLateral) <= 1.5 &&
          state.gap >= 0 &&
          state.gap <= 38
        : Array.isArray(point) &&
          point.length === 3 &&
          point.every(Number.isFinite) &&
          Math.abs(point[0]) <= 1.5 &&
          point[1] >= -0.3 &&
          point[1] <= 3.2 &&
          point[2] >= -21.2 &&
          point[2] <= -17.5);
    const damage = Math.min(
      health,
      playerContact
        ? (core
            ? { lance: 54, arc: 15, repulsor: 36 }
            : { lance: 9, arc: 2, repulsor: 6 })[equipment]
        : (core
            ? { lance: 4, arc: 2, repulsor: 3 }
            : { lance: 3, arc: 1, repulsor: 2 })[equipment],
    );
    assert.equal(
      !!event.weakPoint,
      core,
      'critical credit requires the real open aperture and contact bounds',
    );
    assert.equal(!!event.armored, !core, 'closed armor is reported honestly');
    assert.equal(
      event.damage,
      damage,
      'accepted HP damage follows the independent armor/core contract',
    );
    health -= damage;
    assert.equal(
      event.health,
      health,
      'each emitted damage row contains the actual remaining hull',
    );
    hits++;
    if (playerContact) player += damage;
    else allied += damage;
    credited.delete(key);
  }
  assert.equal(
    credited.size,
    0,
    'every credited HP change has a real unblocked physical contact',
  );
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
  assert.equal(player + allied + health, mission.maxHealth);
}
async function verifyCounterattack() {
  await page.setViewportSize({ width: 1280, height: 720 });
  await clearAudit();
  let warned;
  for (let batch = 0; batch < 100 && !warned; batch++) {
    const current = await page.evaluate(() =>
      window.__VN.stepMission(30, window.__missionPilot),
    );
    if (current.interceptor.counterattack.warning) warned = current;
  }
  assert.ok(
    warned,
    'physical first-lap progress reaches the counterattack marker',
  );
  const opening = await page.evaluate(() => window.__VN.missionDiagnostics());
  assert.equal(warned.interceptor.counterattack.phase, 'telegraph');
  assert.equal(warned.interceptor.counterattack.lap, 1);
  assert.ok(warned.interceptor.targetDistance >= opening.routeLength * 0.15);
  assert.ok(
    warned.interceptor.targetDistance < opening.routeLength * 0.15 + 30,
  );
  await page.waitForTimeout(180);
  const frozen = await snapshot();
  assert.deepEqual(
    frozen.interceptor.counterattack,
    warned.interceptor.counterattack,
  );
  assert.equal(
    frozen.interceptor.targetDistance,
    warned.interceptor.targetDistance,
  );
  await page.keyboard.press('Escape');
  await page.locator('.interceptor-hud').waitFor({ state: 'visible' });
  const hud = await page.locator('.interceptor-hud').evaluate((element) => {
    const bounds = element.getBoundingClientRect();
    return {
      left: bounds.left,
      top: bounds.top,
      right: bounds.right,
      bottom: bounds.bottom,
      width: innerWidth,
      height: innerHeight,
      overflow: element.scrollWidth - element.clientWidth,
    };
  });
  assert.ok(
    hud.left >= 0 &&
      hud.top >= 0 &&
      hud.right <= hud.width &&
      hud.bottom <= hud.height &&
      hud.overflow <= 1,
    `counterattack HUD fits1280x720: ${JSON.stringify(hud)}`,
  );
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => window.__VN.getSnapshot().mode === 'paused');
  for (let batch = 0; batch < 60; batch++) {
    const current = await page.evaluate(() =>
      window.__VN.stepMission(10, window.__missionPilot),
    );
    if (current.interceptor.counterattack.phase === 'firing') break;
  }
  // Let the ordinary paused render consume the physical hull pose.
  await page.evaluate(
    () =>
      new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(resolve)),
      ),
  );
  const firing = await page.evaluate(() => ({
    snapshot: window.__VN.getSnapshot(),
    diagnostics: window.__VN.missionDiagnostics(),
  }));
  assert.equal(firing.snapshot.interceptor.counterattack.phase, 'firing');
  const target = firing.diagnostics.opponents.find(
    (opponent) => opponent.id === 'goliath',
  );
  assert.ok(
    target.forwardDot < -0.95,
    'the actual magnetic hull faces backward',
  );
  assert.ok(
    firing.diagnostics.boss.forwardDot < -0.95,
    'the rendered courier follows its physical backward pose',
  );
  assert.ok(
    target.state.speed > 60,
    'the rotating courier continues its pursuit pace',
  );
  assert.ok(
    firing.snapshot.interceptor.targetDistance >
      warned.interceptor.targetDistance + 80,
  );
  const pausedAttack = firing.snapshot.interceptor.counterattack;
  await page.waitForTimeout(180);
  assert.deepEqual((await snapshot()).interceptor.counterattack, pausedAttack);
  for (let batch = 0; batch < 40; batch++) {
    const current = await page.evaluate(() =>
      window.__VN.stepMission(30, window.__missionPilot),
    );
    if (current.interceptor.counterattack.phase === 'idle') break;
  }
  const recovered = await page.evaluate(() => ({
    snapshot: window.__VN.getSnapshot(),
    diagnostics: window.__VN.missionDiagnostics(),
  }));
  assert.equal(recovered.snapshot.interceptor.counterattack.phase, 'idle');
  assert.ok(
    recovered.diagnostics.opponents.find(
      (opponent) => opponent.id === 'goliath',
    ).forwardDot > 0.95,
  );
  assert.equal(
    recovered.diagnostics.countershots.length,
    1,
    'Easy counterattack launches one real blast',
  );
  const shot = recovered.diagnostics.countershots[0];
  assert.equal(shot.shot.source, 'goliath');
  assert.equal(shot.shot.heavy, true);
  assert.ok(shot.forwardDot < -0.95);
  assert.ok(
    shot.velocityDot < -100,
    'the real projectile travels backward along the course',
  );
  assert.ok(shot.distance > opening.routeLength * 0.15);
  assert.ok(
    recovered.snapshot.interceptor.targetDistance > target.state.distance + 120,
  );
  assert.ok(
    recovered.diagnostics.counterframes.every(
      (frame) =>
        Number.isFinite(frame.speed) && frame.speed >= 0 && frame.speed < 150,
    ),
    'physical turnaround never creates runaway propulsion',
  );
  assert.ok(
    recovered.snapshot.interceptor.targetDistance -
      warned.interceptor.targetDistance <
      850,
    'the brief counterattack cannot jump kilometres along the course',
  );
  verifyCombatAudit(recovered.snapshot.interceptor, recovered.diagnostics);
  console.log(
    JSON.stringify({
      check:
        '15-percent marker: physical turn, backward blast, pause and forward recovery',
      triggerDistance: warned.interceptor.targetDistance,
      firingSpeedKph: target.state.speed * 3.6,
      backwardVelocity: shot.velocityDot,
      hullForwardDot: target.forwardDot,
      renderedForwardDot: firing.diagnostics.boss.forwardDot,
    }),
  );
  await page.setViewportSize({ width: 1440, height: 960 });
}
async function verifyNativeWeapons() {
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => window.__VN.getSnapshot().mode === 'racing');
  await page.keyboard.down('KeyQ');
  assert.equal((await snapshot()).input.equipment1, true);
  await page.waitForFunction(
    () =>
      window.__VN
        .getSnapshot()
        .events.filter(
          (event) =>
            event.type === 'equipment-activate' &&
            event.payload.kind === 'lance',
        ).length >= 2,
  );
  const nativeShots = (await snapshot()).events.filter(
    (event) =>
      event.type === 'equipment-activate' && event.payload.kind === 'lance',
  );
  assert.ok(nativeShots[1].payload.time - nativeShots[0].payload.time <= 0.82);
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
  const physical = await page.evaluate(() => ({
    snapshot: window.__VN.getSnapshot(),
    diagnostics: window.__VN.missionDiagnostics(),
  }));
  verifyCombatAudit(physical.snapshot.interceptor, physical.diagnostics);
  assert.ok(
    physical.diagnostics.accepted.length > 0,
    'native firing reaches the actual physical target',
  );
  console.log(
    `PASS · native Q/controller X, frozen pause and ${physical.diagnostics.accepted.length} independently audited physical hits`,
  );
}
async function verifyGarageAfterWin() {
  const profile = (await front()).career.state;
  assert.ok(
    profile.claims.includes('speed-1'),
    'the real win earned Top speed I',
  );
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => window.__VN.getSnapshot().mode === 'paused');
  await pressButton('#home');
  await page.waitForFunction(
    () => window.__VN_FRONTEND.getState().screen === 'home',
  );
  async function garage() {
    await pressButton('[data-action="garage-tab"]');
    await page.locator('.garage-main').waitFor({ state: 'visible' });
    return page.evaluate(() => ({
      stats: [...document.querySelectorAll('.performance-stat')].map(
        (element) => {
          const meter = element.querySelector('[role="meter"]');
          return {
            id: element.dataset.stat,
            value: Number(meter.getAttribute('aria-valuenow')),
            text: meter.getAttribute('aria-valuetext'),
            notches: element.querySelectorAll('.stat-notch').length,
          };
        },
      ),
      equipment: [...document.querySelectorAll('.garage-equipment-card')].map(
        (element) => ({
          id: element.dataset.equip,
          equipped: element.getAttribute('aria-pressed'),
          disabled: element.disabled,
        }),
      ),
    }));
  }
  const interceptor = await garage();
  const speed = interceptor.stats.find((stat) => stat.id === 'speed');
  assert.equal(speed.notches, 1);
  assert.match(speed.text, /5% fleet improvement/);
  assert.deepEqual(
    interceptor.equipment.map((item) => item.id).sort(),
    profile.claims
      .filter((id) => id.startsWith('equipment-'))
      .map((id) => id.slice('equipment-'.length))
      .sort(),
  );
  await pressButton('[data-action="race-tab"]');
  await pressButton('[data-action="quick-race"]');
  const quickRace = await garage();
  assert.deepEqual(
    quickRace,
    interceptor,
    'garage displays the same earned numbers and owned items in both modes',
  );
  await pressButton('[data-action="race-tab"]');
  await pressButton('[data-action="interceptor"]');
  await pressButton('[data-action="launch"]');
  await page.waitForFunction(
    () =>
      window.__VN_FRONTEND.getState().screen === 'race' &&
      !window.__VN_FRONTEND.getState().loading,
  );
  assert.deepEqual(
    (await snapshot()).vehicle.enhancements,
    {},
    'mission-only stock rules do not alter global garage presentation',
  );
  console.log(
    'PASS · real earned Top speed I and owned gear remain identical in Interceptor and Quick Race garages',
  );
}
async function probeMission() {
  await installPilot();
  const before = (await front()).career.state;
  const escaped = await runMission(
    'unarmed physical pursuit / live escape result',
    'unarmed',
  );
  assert.equal(
    escaped.won,
    false,
    'without issued Lance fire Goliath escapes physically',
  );
  assert.equal(escaped.reason, 'escaped');
  assert.ok(
    escaped.diagnostics.contacts.every(
      (contact) => contact.source !== 'player' || contact.equipment !== 'lance',
    ),
    'the physical escape uses no issued player Lance; ordinary road pickups remain active',
  );
  assert.ok(
    escaped.health > 0 && escaped.targetDistance >= escaped.escapeDistance,
  );
  const immediate = await front();
  assert.equal(
    immediate.screen,
    'results',
    'the real terminal tick opens results immediately',
  );
  assert.equal(immediate.career.state.finishes, before.finishes + 1);
  assert.equal(immediate.career.state.points, before.points + 1);
  assert.equal(immediate.career.state.wins, before.wins);
  await page.evaluate(
    () =>
      new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(resolve)),
      ),
  );
  const tableau = await page.evaluate(() => window.__VN.missionDiagnostics());
  assert.equal(
    tableau.boss.visible,
    true,
    'the escaped boss stays visible behind its results',
  );
  assert.equal(
    tableau.boss.inView,
    true,
    'the live boss remains inside the actual result camera frustum',
  );
  assert.equal(
    tableau.boss.propulsionVisible,
    true,
    'escape never quenches live engine plumes',
  );
  assert.ok(
    tableau.boss.powered.length > 0 &&
      tableau.boss.powered.every((material) => material.intensity > 0),
    'every live authored engine material remains powered',
  );
  assert.equal(
    tableau.cameraView?.enabled,
    true,
    'result composition enables its camera projection offset',
  );
  assert.ok(tableau.cameraView.offsetX > 0);
  assert.match(
    await page.locator('.interceptor-results h1').textContent(),
    /escaped/,
  );
  if (process.env.VN_EVIDENCE) {
    const path = resolve(process.env.VN_EVIDENCE);
    await mkdir(dirname(path), { recursive: true });
    await page.screenshot({ path });
    console.log(`Escape result capture: ${path}`);
  }
  await page.evaluate(() => {
    window.__VN.showResults();
    window.__VN.showResults();
  });
  assert.deepEqual(
    (await front()).career.state,
    immediate.career.state,
    'returning to escape results never awards progress twice',
  );
  await pressButton('[data-action="retry-race"]');
  const retried = await snapshot();
  assert.equal(retried.interceptor.elapsed, 0);
  assert.equal(retried.interceptor.health, 700);
  assert.equal(retried.interceptor.result, null);
  assert.deepEqual(retried.interceptor.counterattacks, []);
  assert.deepEqual(issued(retried), ['lance', 'injector']);
  await page.evaluate(
    () =>
      new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(resolve)),
      ),
  );
  const reset = await page.evaluate(() => window.__VN.missionDiagnostics());
  assert.equal(
    reset.cameraView?.enabled ?? false,
    false,
    'retry clears the result-only camera projection',
  );
  assert.deepEqual(reset.queuedFire, []);
  console.log(
    'PASS · physical two-lap escape retains the live powered boss; immediate once-only career progress and retry reset',
  );
}
async function verifyDifficultyRetries() {
  for (const [difficulty, health, blasts] of [
    ['medium', 700, 2],
    ['hard', 950, 2],
    ['easy', 450, 1],
  ]) {
    await pressButton(`[data-difficulty="${difficulty}"]`);
    await pressButton('[data-action="launch"]');
    try {
      await page.waitForFunction(
        () =>
          window.__VN_FRONTEND.getState().error ||
          (window.__VN_FRONTEND.getState().screen === 'race' &&
            !window.__VN_FRONTEND.getState().loading),
      );
    } catch (error) {
      console.log(
        JSON.stringify(
          await page.evaluate(() => ({
            frontend: window.__VN_FRONTEND.getState(),
            mission: window.__VN.getSnapshot().interceptor,
            modes: window.__VN.missionDiagnostics().modes,
          })),
        ),
      );
      throw error;
    }
    const current = await front(),
      selected = await snapshot();
    console.log(
      JSON.stringify({
        check: 'native difficulty entry',
        difficulty,
        error: current.error,
        screen: current.screen,
        mode: selected.mode,
        maxHealth: selected.interceptor?.maxHealth,
        actualDifficulty: selected.interceptor?.difficulty,
      }),
    );
    assert.equal(current.error, '');
    assert.equal(selected.interceptor.health, health);
    assert.equal(selected.interceptor.difficulty, difficulty);
    assert.equal(selected.interceptor.counterattack.blasts, blasts);
    assert.equal(selected.runtime.state.equipment.slots[0].cooldown, 0.8);
    await page.keyboard.press('Escape');
    await page.waitForFunction(
      () => window.__VN.getSnapshot().mode === 'paused',
    );
    await pressButton('#restart');
    const retried = await snapshot();
    assert.equal(retried.interceptor.health, health);
    assert.equal(retried.interceptor.elapsed, 0);
    assert.equal(retried.interceptor.counterattack.phase, 'idle');
    await page.keyboard.press('Escape');
    await page.waitForFunction(
      () => window.__VN.getSnapshot().mode === 'paused',
    );
    await pressButton('#home');
    await page.waitForFunction(
      () => window.__VN_FRONTEND.getState().screen === 'home',
    );
  }
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
          : driver === 'unarmed'
            ? (context) => ({
                ...window.__missionPilot(context),
                equipment1: false,
              })
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
    verifyCombatAudit(current.snapshot.interceptor, current.diagnostics);
    if (probeOnly && batch % 2 === 0)
      console.log(
        JSON.stringify({
          check: 'accelerated escape',
          time: current.snapshot.interceptor.elapsed,
          health: current.snapshot.interceptor.health,
          gap: current.snapshot.interceptor.gap,
        }),
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
  assert.ok(
    result.diagnostics.motionAudit.maxStepDistance < 5,
    'route credit remains physical for the whole mission',
  );
  assert.ok(
    result.diagnostics.motionAudit.maxStepMovement < 5,
    'hull movement stays bounded for the whole mission',
  );
  assert.ok(
    result.diagnostics.motionAudit.maxHeight < 4,
    'the target stays supported by the real road',
  );
  assert.ok(
    result.diagnostics.motionAudit.maxReportedSpeed < 150,
    'combat never creates a brief runaway driving speed',
  );
  assert.ok(
    result.diagnostics.motionAudit.maxWorldSpeed <= 100.001,
    'actual courier velocity respects its physical bound throughout the mission',
  );
  if (driver === 'inactive' || driver === 'unarmed') {
    const rules = JSON.parse(result.diagnostics.auditBaseline.rulesId);
    const stations = rules.counterattack.markers?.length ?? 1;
    const expectedLaps = Array.from({ length: 2 }, (_, index) =>
      Array(stations * rules.counterattack.blasts).fill(index + 1),
    ).flat();
    assert.equal(
      result.diagnostics.countershots.length,
      expectedLaps.length,
      'the escaping target discharges at every authored station on both laps',
    );
    assert.deepEqual(
      result.diagnostics.countershots.map((shot) => shot.phase.lap),
      expectedLaps,
    );
    assert.ok(
      result.diagnostics.countershots.every(
        (shot) =>
          shot.hullForwardDot < -0.95 &&
          shot.hunterDot > 0.8 &&
          shot.shot.velocity.every(Number.isFinite) &&
          Math.hypot(...shot.shot.velocity) > 100,
      ),
      'both laps face backward and discharge real physical shots toward the hunter',
    );
  }
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
  await page.goto(new URL('?level=halcyon&intro=0&music=0', base).href);
  await page.waitForFunction(
    () => window.__VN_FRONTEND?.getState().screen === 'home',
  );
  assert.equal(await page.evaluate(() => !!window.__VN), false);
  await pressButton('[data-action="interceptor"]');
  assert.equal((await front()).intent, 'interceptor');
  assert.equal((await front()).selected, 'interceptor');
  assert.equal(await page.locator('.circuit-card').count(), 3);
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
  if (probeOnly) {
    assert.equal(start.interceptor.maxHealth, 700);
    await probeMission();
  } else if (nativeOnly) {
    assert.deepEqual(issued(start), ['lance', 'injector']);
    assert.deepEqual(start.vehicle.enhancements, {});
    await page.evaluate(
      (control) => window.__VN.stepMission(120, control),
      still,
    );
    await verifyNativeWeapons();
    await pressButton('#home');
    await page.waitForFunction(
      () => window.__VN_FRONTEND.getState().screen === 'home',
    );
    await verifyDifficultyRetries();
  } else {
    assert.deepEqual(issued(start), ['lance', 'injector']);
    assert.deepEqual(start.vehicle.enhancements, {});
    assert.equal(start.interceptor.health, 450);
    assert.equal(start.interceptor.maxHealth, 450);
    assert.equal(start.interceptor.difficulty, 'easy');
    assert.equal(start.runtime.state.equipment.slots[0].cooldown, 0.8);
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
      450,
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

    await verifyNativeWeapons();

    await page.evaluate(() => window.__VN.restartRace());
    await clearAudit();
    await installPilot();
    await verifyCounterattack();
    await page.evaluate(() => window.__VN.restartRace());
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
    assert.equal(retry.interceptor.health, 450);
    assert.equal(retry.interceptor.counterattack.phase, 'idle');
    assert.deepEqual(retry.interceptor.counterattacks, []);
    assert.equal(retry.vehicle.distance, 0);
    assert.deepEqual(issued(retry), ['lance', 'injector']);
    assert.deepEqual(
      (await page.evaluate(() => window.__VN.missionDiagnostics())).queuedFire,
      [],
    );
    console.log(
      'PASS · real-hit victory, one mission award and native full retry',
    );

    await verifyGarageAfterWin();
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
    await verifyDifficultyRetries();
    await pressButton('[data-action="quick-race"]');
    assert.equal((await front()).selected, 'halcyon');
    console.log(
      'PASS · honest physical escape, one failure award and native Back/mode return',
    );
    console.log(
      'PASS · native difficulty changes and retries restore450/700/950 hull and the correct blast count',
    );
  }
  assert.deepEqual(faults, [], 'no uncaught browser exceptions');
} finally {
  await browser.close();
}

// Intercepted module fetches can retain Node's HTTP pool after Chrome closes.
process.exit(0);
