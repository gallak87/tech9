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
await page.addInitScript(
  ({ quality, reducedMotion, policy, firePolicy, difficulty }) => {
    window.__fightPolicy = policy;
    window.__fightFirePolicy = firePolicy;
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
  { quality, reducedMotion, policy, firePolicy, difficulty },
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
      return {snapshot:this.getSnapshot(), contacts:structuredClone(window.__fightHits ?? []),
        combat:combat.view(), metrics:this.getMetrics(), camera:camera.position.toArray(),
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
      const dodge =
        policy === 'dodge' ||
        (policy === 'imperfect' && attack.attackIndex !== 1);
      const options = [-13, 0, 13];
      const distance = (lane) =>
        Math.min(...(attack.aimLanes ?? [0]).map((x) => Math.abs(x - lane)));
      const lane =
        attack.locked && attack.warning && attack.shots < attack.blasts
          ? dodge
            ? options.toSorted((a, b) => distance(b) - distance(a))[0]
            : ['camp', 'imperfect'].includes(policy)
              ? attack.aimLanes[0]
              : 0
          : 0;
      const control = getRacerControl(state, track, {
        difficulty: 'hard',
        pace: 1,
        lane,
        devices: attack.warning || attack.exposed ? [] : devices,
        runtime: attack.warning || attack.exposed ? null : runtime,
        nearby: [],
      });
      control.boost = gap > 36 && state.energy > 10;
      control.equipment1 =
        window.__fightFirePolicy === 'window'
          ? attack.exposed &&
            attack.phaseElapsed > 0.4 &&
            attack.phaseElapsed < 0.6
          : window.__fightFirePolicy === 'none'
            ? false
            : state.time > 2;
      control.equipment2 = state.energy < 45;
      return control;
    };
  });
  const frames = [],
    seen = new Set();
  let hitFrames = 0,
    previousShots = 0,
    firstShot = null;
  let currentAttack = null;
  for (let i = 0; i < Math.max(240, cycles * 250); i++) {
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
      phase === 'breach' &&
      mission.counterattack.phaseElapsed > 0.35 &&
      !recent &&
      !seen.has('breach-open')
    ) {
      seen.add('breach-open');
      label = 'breach-open';
    }
    previousShots = shots;
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
        playerLateral: data.snapshot.vehicle.lateral,
        lastHit: mission.lastHit,
        contacts: data.contacts.length,
      });
      console.log(JSON.stringify(frames.at(-1)));
    }
    if (
      seen.has('turning-forward') &&
      phase === 'idle' &&
      attackIndex >= cycles - 1
    )
      break;
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
