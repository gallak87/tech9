import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

// Critic frames come from actual inputs/physics through the production render
// loop. Response instrumentation is temporary; it supplies no combat results.
const level = process.argv[2] ?? 'interceptor';
const round = process.argv[3] ?? 'baseline';
const quality = process.env.VN_QUALITY ?? 'high';
const reducedMotion = process.env.VN_REDUCED === '1';
const policy = process.env.VN_POLICY ?? 'centre';
const cycles = Number(process.env.VN_CYCLES ?? 1);
const firePolicy = process.env.VN_FIRE ?? 'held';
const difficulty = process.env.VN_DIFFICULTY ?? 'hard';
const missAttack = Number(process.env.VN_MISS_ATTACK ?? 1);
const output = resolve('.experiments/fight-critics', level, round);
await mkdir(output, { recursive: true });
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
await page.addInitScript(
  ({ quality, reducedMotion, policy, firePolicy, difficulty, missAttack }) => {
    window.__fightPolicy = policy;
    window.__fightFirePolicy = firePolicy;
    window.__fightMissAttack = missAttack;
    localStorage.setItem(
      'vector-nova.settings',
      JSON.stringify({
        quality,
        reducedMotion,
        volume: 0,
        difficulty,
      }),
    );
  },
  { quality, reducedMotion, policy, firePolicy, difficulty, missAttack },
);
await page.route('**/src/core/game.js*', async (route) => {
  const response = await route.fetch();
  let source = await response.text();
  source = source.replace(
    'const sampledInput = input.sample();',
    'const sampledInput = window.__fightInput ?? input.sample();',
  );
  source = source.replace(
    'onHit(payload) {',
    'onHit(payload) { (window.__fightHits ??= []).push(structuredClone(payload));',
  );
  source = source.replace(
    'getSnapshot() {',
    `
    stepFight(frames = 1) {
      cancelCountdown(); mode = 'racing'; ui.setMode(mode);
      cancelAnimationFrame(raf);
      for (let f = 0; f < frames && mode === 'racing'; f++) {
        window.__fightInput = window.__fightPilot({state, track, racers, devices, runtime, mission:interceptor.snapshot()});
        render((last || performance.now()) + 100);
        cancelAnimationFrame(raf);
      }
      delete window.__fightInput;
      return this.fightState();
    },
    fightState() {
      const model=racerPresentation.getShip(missionBoss.id)?.group;
      const propulsion=model?.getObjectByName('Rival / propulsion');
      const powered=[];model?.traverse(o=>{for(const m of [o.material].flat())if(m?.name?.endsWith('_Ion')&&!powered.some(p=>p.name===m.name))powered.push({name:m.name,intensity:m.emissiveIntensity});});
      return {snapshot:this.getSnapshot(), contacts:structuredClone(window.__fightHits ?? []),
        combat:combat.view(), metrics:this.getMetrics(), camera:camera.position.toArray(),
        presentation:{powered,plumes:propulsion?.children.map(p=>({scale:p.scale.toArray(),strength:p.material.uniforms?.strength?.value,opacity:p.material.opacity})),white:model?.getObjectByName('Boss / white armor hit')?.visible},
        opponents:racers.opponents.map(r=>({id:r.specification.id,state:{...r.state},pose:{position:r.runtime.pose(1).position.toArray()}}))};
    },
    settleFight(frames = 1) {
      cancelAnimationFrame(raf);
      for (let f=0;f<frames&&mode==='results';f++) {
        render((last || performance.now()) + 50);
        cancelAnimationFrame(raf);
      }
      return this.fightState();
    },
    getSnapshot() {`,
  );
  await route.fulfill({ response, body: source });
});
try {
  await page.goto(
    `${process.env.VN_URL ?? 'http://127.0.0.1:5213'}/?level=${level}&music=0`,
  );
  await page.waitForFunction(
    () => window.__VN_FRONTEND?.getState().screen === 'home',
  );
  await page.locator('[data-action="interceptor"]').click();
  await page.locator(`[data-level="${level}"]`).click();
  await page.locator('[data-action="launch"]').click();
  await page.waitForFunction(
    () =>
      window.__VN?.ready && window.__VN_FRONTEND?.getState().screen === 'race',
    null,
    { timeout: 90000 },
  );
  await page.evaluate(async () => {
    const { getRacerControl } = await import('/src/race/racers.js');
    const { createInterceptorField } =
      await import('/src/events/interceptor-field.js');
    let pursuitField;
    window.__fightPilot = ({
      state,
      track,
      racers,
      devices,
      runtime,
      mission,
    }) => {
      const target = racers.opponents.find(
        (r) => r.specification.team === 'quarry',
      ).state;
      const gap = target.distance - state.distance;
      const policy = window.__fightPolicy ?? 'centre';
      const attack = mission.counterattack;
      const missed = attack.attackIndex === window.__fightMissAttack;
      const dodge = policy === 'dodge' || (policy === 'imperfect' && !missed);
      const edge = Math.min(13, track.width / 2 - 4);
      const options = [-edge, 0, edge];
      const distance = (lane) =>
        Math.min(...(attack.aimLanes ?? [0]).map((x) => Math.abs(x - lane)));
      const counterLine =
        attack.resonance && ['counter', 'held', 'imperfect'].includes(policy);
      const lane =
        attack.locked &&
        attack.warning &&
        (attack.resonance || attack.shots < attack.blasts)
          ? counterLine
            ? mission.counterattacks.at(-1).trackingLane
            : dodge
              ? options.toSorted((a, b) => distance(b) - distance(a))[0]
              : ['camp', 'imperfect'].includes(policy)
                ? attack.aimLanes[0]
                : 0
          : 0;
      let control = getRacerControl(state, track, {
        difficulty: 'hard',
        pace: 1,
        lane,
        devices: attack.warning || attack.exposed ? [] : devices,
        runtime: attack.warning || attack.exposed ? null : runtime,
        nearby: [],
      });
      const s = ((state.distance % track.length) + track.length) % track.length;
      const inDetour = track.pursuitPath?.intervals.some(
        (i) => s >= i.start && s <= i.end,
      );
      if (inDetour) {
        pursuitField ??= createInterceptorField({
          track,
          bossId: mission.bossId,
        });
        // Reuse the course's supported detour intent. This remains ordinary
        // steering/throttle input through the unmodified thermal/flight body.
        control = pursuitField.control({
          opponent: { specification: { id: mission.bossId }, state, runtime },
          track,
          devices,
          nearby: [],
          defaultControl: control,
        });
      }
      control.boost = gap > 36 && state.energy > 10 && !inDetour;
      if (attack.resonance && attack.warning) {
        if (policy === 'counter' || (policy === 'imperfect' && !missed))
          control.boost =
            attack.canCounter && attack.elapsed >= 1 && !attack.countered;
        else if (policy === 'held' || (policy === 'imperfect' && missed))
          control.boost = true;
        else control.boost = false;
      }
      control.equipment1 =
        window.__fightFirePolicy === 'window'
          ? attack.exposed &&
            attack.phaseElapsed > (attack.resonance ? 0.7 : 0.4) &&
            attack.phaseElapsed < (attack.resonance ? 0.9 : 0.6)
          : window.__fightFirePolicy === 'none'
            ? false
            : state.time > 2;
      control.equipment2 =
        state.energy < 45 &&
        runtime.snapshot().equipment.slots[1]?.remaining === 0;
      return control;
    };
  });
  const frames = [],
    seen = new Set();
  let hitFrames = 0,
    previousShots = 0,
    firstShot = null;
  let currentAttack = null;
  for (let i = 0; i < Math.max(380, cycles * 350); i++) {
    const data = await page.evaluate(() => window.__VN.stepFight(1));
    const mission = data.snapshot.interceptor;
    const phase = mission.counterattack.phase;
    const attackIndex = mission.counterattack.attackIndex ?? 0;
    if (attackIndex !== currentAttack) {
      seen.clear();
      firstShot = null;
      currentAttack = attackIndex;
    }
    const shots = data.combat.shots.filter(
      (s) => s.source === mission.targetId,
    ).length;
    const muzzle = data.combat.flashes.find(
      (f) => f.source === mission.targetId && f.type === 'muzzle',
    );
    const recent = data.combat.flashes.findLast(
      (f) =>
        f.target === mission.targetId &&
        f.equipment === 'lance' &&
        f.age < 0.11,
    );
    let label = null;
    if (i === 25) label = 'chase';
    if (recent && hitFrames++ < 2) label = `hit-${hitFrames}`;
    if (!seen.has(phase) && phase !== 'idle') {
      seen.add(phase);
      label = phase;
    }
    if (mission.counterattack.locked && !seen.has('lock')) {
      seen.add('lock');
      label = 'lock';
    }
    if (mission.counterattack.countered && !seen.has('counter')) {
      seen.add('counter');
      label = 'counter';
    }
    if (
      mission.counterattack.countered &&
      mission.elapsed - mission.counterattack.counterAt > 0.12 &&
      mission.elapsed - mission.counterattack.counterAt < 0.3 &&
      !seen.has('counter-rupture')
    ) {
      seen.add('counter-rupture');
      label = 'counter-rupture';
    }
    if (
      phase === 'turning-back' &&
      mission.counterattack.phaseElapsed > 0.35 &&
      !seen.has('mid-turn')
    ) {
      seen.add('mid-turn');
      label = 'mid-turn';
    }
    if (shots > previousShots && !seen.has('shot')) {
      seen.add('shot');
      label = 'shot';
    }
    if (muzzle && firstShot === null) {
      firstShot = mission.elapsed;
      label = 'muzzle';
    }
    if (
      firstShot !== null &&
      mission.elapsed - firstShot > 0.15 &&
      !seen.has('post-shot')
    ) {
      seen.add('post-shot');
      label = 'post-shot';
    }
    if (mission.lastHit?.weakPoint && !seen.has('core-hit')) {
      seen.add('core-hit');
      label = 'core-hit';
    }
    if (
      mission.lastHit?.weakPoint &&
      mission.lastHit.equipment === 'repulsor' &&
      mission.elapsed - mission.lastHit.elapsed < 0.15 &&
      !seen.has('core-slam')
    ) {
      seen.add('core-slam');
      label = 'core-slam';
    }
    if (
      ['breach', 'overload'].includes(phase) &&
      mission.counterattack.phaseElapsed > 0.35 &&
      !recent &&
      (phase !== 'overload' ||
        !data.combat.flashes.some(
          (f) =>
            f.target === mission.targetId && f.kind !== 'aegis' && f.age < 0.35,
        )) &&
      !seen.has('breach-open')
    ) {
      seen.add('breach-open');
      label = phase === 'overload' ? 'capacitors-open' : 'breach-open';
    }
    previousShots = shots;
    const restored =
      seen.has('turning-forward') &&
      phase === 'idle' &&
      mission.elapsed -
        mission.counterattack.started -
        mission.counterattack.elapsed >
        0.5;
    if (restored && !seen.has('cruise-restored')) {
      seen.add('cruise-restored');
      label = 'cruise-restored';
    }
    if (label) {
      if (cycles > 1) label = `a${attackIndex + 1}-${label}`;
      const path = resolve(output, `${label}.png`);
      await page.screenshot({ path });
      frames.push({
        label,
        path,
        time: mission.elapsed,
        gap: mission.gap,
        phase,
        health: mission.health,
        playerBoosting: data.snapshot.vehicle.boosting,
        reserve: data.snapshot.vehicle.energy,
        countered: mission.counterattack.countered,
        counterProgress: mission.counterattack.counterProgress,
        aimLanes: mission.counterattack.aimLanes,
        presentation: data.presentation,
        playerLateral: data.snapshot.vehicle.lateral,
        lastHit: mission.lastHit,
        contacts: data.contacts.length,
      });
      console.log(JSON.stringify(frames.at(-1)));
    }
    if (restored && attackIndex >= cycles - 1) break;
    if (mission.result) {
      if (mission.result.won) {
        for (const [label, steps] of [
          ['disabled-0', 0],
          ['disabled-150', 3],
          ['disabled-600', 9],
          ['disabled-1200', 12],
          ['disabled-2000', 16],
        ]) {
          const settled = await page.evaluate(
            (n) => window.__VN.settleFight(n),
            steps,
          );
          const path = resolve(output, `${label}.png`);
          await page.screenshot({ path });
          frames.push({
            label,
            path,
            time: settled.snapshot.interceptor.elapsed,
            health: settled.snapshot.interceptor.health,
            mode: settled.snapshot.mode,
          });
          console.log(JSON.stringify(frames.at(-1)));
        }
      } else {
        const path = resolve(output, 'escaped.png');
        await page.screenshot({ path });
        frames.push({
          label: 'escaped',
          path,
          time: mission.elapsed,
          health: mission.health,
        });
      }
      break;
    }
  }
  const final = await page.evaluate(() => window.__VN.fightState());
  await writeFile(
    resolve(output, 'capture.json'),
    JSON.stringify(
      {
        frames,
        final,
        faults,
        quality,
        reducedMotion,
        difficulty,
        policy,
        firePolicy,
      },
      null,
      2,
    ),
  );
  if (faults.length) throw new Error(faults.join('\n'));
} finally {
  // Vite response interception can leave Playwright's close acknowledgement
  // pending after the owned Chrome process has already exited.
  await Promise.race([
    browser.close(),
    new Promise((resolve) => setTimeout(resolve, 5000)),
  ]);
}
// route.fetch can leave its Node-side HTTP pool alive after Chromium exits.
process.exit(0);
