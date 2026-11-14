import assert from 'node:assert/strict';
import {
  generateDocument,
  analyzeDocument,
  validateDocument,
} from '../src/editor/document.js';
import { createEditorTrack } from '../src/editor/track.js';
import { seedVerificationCareer } from './verification-career.mjs';
import { openEditorSection, revealEditorAction } from './editor-controls.mjs';
import {
  launchVerificationBrowser,
  collectPageErrors,
} from './verification-browser.mjs';

// Target a CPU-verified crossing pair, then drive both real decks in the full
// Nightweir world. VN_CROSSOVER_STATIONS contains the two route distances in m;
// obtain them from the independent generation-quality crossing check. This
// deliberately reuses those stations rather than implementing another detector.
// VN_URL=http://127.0.0.1:5231 VN_CROSSOVER_STATIONS=8886.882036960844,12561.353770882262 node tools/editor-crossovers-world-verify.mjs
const base = process.env.VN_URL;
if (!base) throw new Error('Set VN_URL to an existing editor dev server.');
const stations = (process.env.VN_CROSSOVER_STATIONS ?? '')
  .split(',')
  .map(Number);
if (stations.length !== 2 || !stations.every(Number.isFinite))
  throw new Error('Set VN_CROSSOVER_STATIONS to two verified route distances.');
const document = generateDocument({
  generatorVersion: 3,
  seed: 42,
  length: 20000,
  courseType: 'circuit',
  crossovers: 1,
  bendiness: 0.75,
  elevation: 0.6,
  jumpFrequency: 'normal',
  jumpSize: 'mixed',
  width: 40,
});
document.name = 'Crossover world verification';
document.settings.sceneryPreset = 'waterfront';
document.settings.density = 0.82;
assert.equal(analyzeDocument(document).valid, true);
const track = createEditorTrack(document);
const crossing = stations.map((distance) => ({
  distance,
  frame: track.sample(distance),
}));
const [first, second] = crossing;
assert(
  Math.hypot(
    first.frame.position.x - second.frame.position.x,
    first.frame.position.z - second.frame.position.z,
  ) < 1,
  'verified stations must meet on the actual XZ route',
);
const envelope = (frame) =>
  Math.abs(frame.right.y) * (track.width / 2 + 6) + Math.abs(frame.up.y) * 24;
const clearance = Math.abs(first.frame.position.y - second.frame.position.y);
assert(
  clearance >= Math.max(30, envelope(first.frame) + envelope(second.frame)),
);
for (const { distance } of crossing) {
  assert(distance > 140 && distance < track.length - 140);
  for (let offset = -120; offset <= 120; offset += 10)
    assert(
      !track.isJumpProtected(distance + offset),
      'the bounded overpass drive must remain outside jump corridors',
    );
}

const browser = await launchVerificationBrowser();
const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  deviceScaleFactor: 1,
});
let page;
const errors = [];
try {
  await seedVerificationCareer(context);
  await context.routeWebSocket('**/*', () => {});
  await context.addInitScript(() => {
    localStorage.setItem('startUpMusicOn', 'false');
    localStorage.setItem(
      'vector-nova.settings',
      JSON.stringify({ quality: 'low', volume: 0, reducedMotion: true }),
    );
  });
  page = await context.newPage();
  collectPageErrors(page, errors);
  await page.goto(new URL('?intro=0&music=0&editor=1', base).href);
  await page.locator('[data-editor-field="name"]').waitFor({ timeout: 90000 });
  await openEditorSection(page, 'library');
  const chooser = page.waitForEvent('filechooser');
  await (await revealEditorAction(page, 'import')).click();
  await (
    await chooser
  ).setFiles({
    name: 'crossovers-world.vntrack.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(document)),
  });
  await page.waitForFunction(
    () =>
      document
        .querySelector('[data-editor-status]')
        ?.textContent.includes('Track imported') &&
      window.__VN_FRONTEND.getState().editor?.preview?.worldReady,
    null,
    { timeout: 90000 },
  );
  await (await revealEditorAction(page, 'save')).click();
  await page.waitForFunction(() =>
    document
      .querySelector('[data-editor-status]')
      ?.textContent.includes('Track saved'),
  );
  const importedDocument = await page.evaluate(() =>
    Object.keys(localStorage)
      .filter((key) => key.startsWith('vector-nova.tracks.v1.'))
      .map((key) => JSON.parse(localStorage.getItem(key)).document)
      .find((value) => value.name === 'Crossover world verification'),
  );
  const careerBefore = await page.evaluate(() =>
    Object.entries(localStorage)
      .filter(([key]) => key.includes('career'))
      .sort(),
  );
  await (await revealEditorAction(page, 'test')).click();
  await page.waitForFunction(
    () =>
      window.__VN?.ready &&
      !document.querySelector('#hud')?.classList.contains('hidden'),
    null,
    { timeout: 120000 },
  );
  const live = await page.evaluate(
    async ({ input, stations }) => {
      const { documentIdentity, validateDocument } =
        await import('/src/editor/document.js');
      const api = window.__VN,
        snapshot = api.getSnapshot();
      return {
        id: api.getTrack().id,
        expectedId: documentIdentity(input),
        canonical: validateDocument(input),
        rules: snapshot.runtime.rulesId,
        stations: stations.map((distance) =>
          api.getTrack().sample(distance).position.toArray(),
        ),
      };
    },
    { input: document, stations },
  );
  assert.deepEqual(
    importedDocument,
    live.canonical,
    'public import/save preserves the browser-canonical input',
  );
  const nodeCanonical = validateDocument(document);
  const stripFractions = (value) => ({
    ...value,
    jumps: value.jumps.map((jump) => {
      const resolved = { ...jump };
      delete resolved.start;
      delete resolved.end;
      return resolved;
    }),
  });
  assert.deepEqual(
    stripFractions(live.canonical),
    stripFractions(nodeCanonical),
    'all resolved points, generator/settings, pickups and non-fraction jump data match exactly across runtimes',
  );
  const fractionDeltas = live.canonical.jumps.map((jump, index) => ({
    start: Math.abs(jump.start - nodeCanonical.jumps[index].start),
    end: Math.abs(jump.end - nodeCanonical.jumps[index].end),
  }));
  assert(
    fractionDeltas.every(({ start, end }) => start < 1e-12 && end < 1e-12),
    `only negligible anchored-fraction roundoff is accepted: ${JSON.stringify(fractionDeltas)}`,
  );
  assert.equal(
    live.id,
    live.expectedId,
    'Test drive uses the imported geometry',
  );
  for (let index = 0; index < stations.length; index++)
    assert(
      crossing[index].frame.position.distanceTo(
        crossing[index].frame.position.clone().fromArray(live.stations[index]),
      ) < 1e-6,
      'browser and CPU fixture stations describe the same physical crossing',
    );
  if (live.id !== track.id)
    console.log(
      'NOTE anchored-fraction identity differs across Node/browser arithmetic',
      JSON.stringify({ node: track.id, browser: live.id, fractionDeltas }),
    );
  assert(
    live.rules.includes(':query:'),
    'drive owns the real native query world',
  );

  for (const { distance, frame } of crossing.sort(
    (a, b) => a.frame.position.y - b.frame.position.y,
  )) {
    const label =
      frame.position.y ===
      Math.min(first.frame.position.y, second.frame.position.y)
        ? 'lower'
        : 'upper';
    await page.evaluate((station) => {
      const api = window.__VN;
      api.getTrack().scenarios['editor-overpass-approach'] = {
        distance: station - 120,
        speed: 80,
        lateral: 0,
        heading: 0,
        energy: 100,
      };
      api.loadScenario('editor-overpass-approach', 7);
      api.pause();
    }, distance);
    await page.locator('#resume').click();
    await page.keyboard.down('w');
    let report;
    try {
      report = await page.evaluate(async (station) => {
        const { getCollisionHull } =
          await import('/src/ships/contact-hulls.js');
        const api = window.__VN,
          track = api.getTrack();
        const report = {
          ticks: 0,
          minHeight: Infinity,
          maxHeight: -Infinity,
          minHullClearance: Infinity,
          maxHullClearance: -Infinity,
          maxLateralError: 0,
          maxProgressStep: 0,
          minSpeed: Infinity,
          failures: [],
        };
        let lastTick = -1,
          previousDistance;
        const deadline = performance.now() + 12000;
        while (performance.now() < deadline) {
          await new Promise(requestAnimationFrame);
          const snapshot = api.getSnapshot();
          if (snapshot.tick === lastTick) continue;
          lastTick = snapshot.tick;
          let motion = snapshot.runtime.state;
          for (let i = 0; i < 8 && motion?.motion; i++) motion = motion.motion;
          const body = motion?.magnetic ?? motion;
          if (!body?.initialized || !body.current) continue;
          const state = snapshot.vehicle,
            frame = track.sample(state.distance);
          const position = frame.position
            .clone()
            .fromArray(body.current.position);
          const quaternion = frame.quaternion
            .clone()
            .fromArray(body.current.quaternion);
          const delta = position.clone().sub(frame.position);
          const height = delta.dot(frame.up);
          const localUp = frame.up.clone().applyQuaternion(quaternion.invert());
          const vertices = getCollisionHull(
            state.chassisId ?? state.shipId,
          ).vertices;
          let lowest = Infinity;
          for (let i = 0; i < vertices.length; i += 3)
            lowest = Math.min(
              lowest,
              vertices[i] * localUp.x +
                vertices[i + 1] * localUp.y +
                vertices[i + 2] * localUp.z,
            );
          const hullClearance = height + lowest;
          report.ticks++;
          report.minHeight = Math.min(report.minHeight, height);
          report.maxHeight = Math.max(report.maxHeight, height);
          report.minHullClearance = Math.min(
            report.minHullClearance,
            hullClearance,
          );
          report.maxHullClearance = Math.max(
            report.maxHullClearance,
            hullClearance,
          );
          report.maxLateralError = Math.max(
            report.maxLateralError,
            Math.abs(delta.dot(frame.right) - state.lateral),
          );
          report.minSpeed = Math.min(report.minSpeed, state.speed);
          if (previousDistance !== undefined)
            report.maxProgressStep = Math.max(
              report.maxProgressStep,
              Math.abs(state.distance - previousDistance),
            );
          previousDistance = state.distance;
          if (state.resetCount) report.failures.push('vehicle reset');
          if (body.roadRecovery)
            report.failures.push('lost native road support');
          if (motion.mode && motion.mode !== 'magnetic')
            report.failures.push(`unexpected ${motion.mode} motion`);
          if (snapshot.mode !== 'racing')
            report.failures.push(`unexpected ${snapshot.mode} session`);
          if (height < -0.2 || height > 2)
            report.failures.push(`wrong-deck body height ${height}`);
          if (hullClearance < -0.2 || hullClearance > 2)
            report.failures.push(`unseated physical hull ${hullClearance}`);
          const contacts = snapshot.events.filter((event) =>
            /road-recovery|jump-|rail-contact|racer-contact/.test(event.type),
          );
          if (contacts.length) report.failures.push(JSON.stringify(contacts));
          if (report.failures.length || state.distance >= station + 120) {
            report.distance = state.distance;
            report.resetCount = state.resetCount;
            return report;
          }
        }
        report.failures.push('bounded crossing drive timed out');
        return report;
      }, distance);
    } finally {
      await page.keyboard.up('w');
      await page.evaluate(() => window.__VN.pause());
    }
    assert.deepEqual(
      report.failures,
      [],
      `${label} deck: ${JSON.stringify(report)}`,
    );
    assert(report.ticks > 30, 'the audit samples many live physical ticks');
    assert(
      report.distance >= distance + 120 && report.distance < distance + 145,
    );
    assert(
      report.maxProgressStep < 30,
      'route progress never jumps to the other branch',
    );
    assert(
      report.maxLateralError < 1,
      'physical pose retains same-frame route ownership',
    );
    assert(
      report.minSpeed > 45,
      'no hidden structure blocks or stalls the crossing',
    );
    console.log(
      `PASS real ${label} deck / ${clearance.toFixed(1)} m crossing clearance`,
      JSON.stringify(report),
    );
  }
  await page.locator('#home').click();
  await page.locator('[data-editor-action="test"]').waitFor({ timeout: 90000 });
  assert.deepEqual(
    await page.evaluate(() =>
      Object.entries(localStorage)
        .filter(([key]) => key.includes('career'))
        .sort(),
    ),
    careerBefore,
  );
  assert.deepEqual(errors, []);
  console.log(
    'PASS full Nightweir crossover world, same-frame physical seating, progress and career isolation',
  );
} catch (error) {
  console.error(error.stack ?? error);
  console.error(
    'CROSSOVER DIAGNOSTIC',
    errors,
    await page?.locator('body').innerText(),
  );
  throw error;
} finally {
  await context.close();
  await browser.close();
}
