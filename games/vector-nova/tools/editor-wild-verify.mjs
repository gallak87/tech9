import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { basename } from 'node:path';
import { createHash } from 'node:crypto';
import {
  analyzeDocument,
  pointRouteFractions,
} from '../src/editor/document.js';
import { createRouteSampler } from '../src/editor/route.js';
import {
  openEditorSection,
  revealEditorAction,
  revealEditorField,
} from './editor-controls.mjs';
import { seedVerificationCareer } from './verification-career.mjs';
import {
  collectPageErrors,
  launchVerificationBrowser,
} from './verification-browser.mjs';

// Bounded native-input regression for an imported wild course. The original
// file is read as bytes and never written. This tests one steep climb with the
// production body/contact runtime; it is not an AI or full-lap certification.
const base = process.env.VN_URL;
const sourcePath = process.env.VN_TRACK;
if (!base || !sourcePath)
  throw new Error(
    'Set VN_URL to an isolated full build and VN_TRACK to a course file.',
  );
const source = await readFile(sourcePath);
const hash = (value) => createHash('sha256').update(value).digest('hex');
const originalHash = hash(source);
const doc = JSON.parse(source.toString('utf8'));
const analysis = analyzeDocument(doc);
assert(
  analysis.valid,
  `The unmodified course must load: ${analysis.errors.join(' ')}`,
);
const route = createRouteSampler(doc);
let peak = { distance: 0, grade: 0, pitch: 0 };
for (let distance = 0; distance < route.length; distance++) {
  const { tangent } = route.sample(distance);
  const grade = tangent.y / Math.hypot(tangent.x, tangent.z);
  if (grade > peak.grade)
    peak = { distance, grade, pitch: (Math.asin(tangent.y) * 180) / Math.PI };
}
assert(peak.grade > 0.9, 'the fixture exercises a climb above 90% grade');
const stations = pointRouteFractions(doc).map(
  (fraction) => fraction * route.length,
);
const startIndex = Math.max(
  0,
  stations.findLastIndex((distance) => distance <= peak.distance - 40),
);
assert(
  peak.distance - stations[startIndex] < 500,
  'the selected native point starts near the measured climb',
);
const browser = await launchVerificationBrowser();
const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
});
const errors = [],
  glErrors = [];
const watchdog = setTimeout(() => {
  void browser.close();
  process.exitCode = 1;
}, 120000);
const choose = async (page, action) =>
  (await revealEditorAction(page, action)).click();
const change = async (page, field, value) =>
  (await revealEditorField(page, field)).selectOption(String(value));
async function ready(page) {
  await page.waitForFunction(
    () => {
      const editor = window.__VN_FRONTEND?.getState().editor;
      return editor && !editor.busy && editor.preview?.worldReady;
    },
    null,
    { timeout: 60000 },
  );
}
async function observe(page) {
  return page.evaluate(() => {
    const snapshot = window.__VN.getSnapshot();
    const motion = snapshot.runtime.state.motion ?? snapshot.runtime.state;
    const position = motion.current?.position;
    const quaternion = motion.current?.quaternion;
    const frame = snapshot.trackFrame;
    const clearance = position
      ? position.reduce(
          (sum, value, index) =>
            sum + (value - frame.position[index]) * frame.up[index],
          0,
        )
      : null;
    const bodyForwardY = quaternion
      ? 2 * (quaternion[1] * quaternion[2] - quaternion[3] * quaternion[0])
      : null;
    return {
      mode: snapshot.mode,
      time: snapshot.vehicle.time,
      distance: snapshot.vehicle.distance,
      speed: snapshot.vehicle.speed,
      lateral: snapshot.vehicle.lateral,
      heading: snapshot.vehicle.heading,
      resets: snapshot.vehicle.resetCount,
      framePitch: (Math.asin(frame.tangent[1]) * 180) / Math.PI,
      grade: frame.tangent[1] / Math.hypot(frame.tangent[0], frame.tangent[2]),
      bodyPitch:
        bodyForwardY === null
          ? null
          : (Math.asin(Math.max(-1, Math.min(1, bodyForwardY))) * 180) /
            Math.PI,
      clearance,
      physical:
        Object.hasOwn(motion, 'roadRecovery') &&
        Boolean(position && quaternion),
      recovering: Boolean(motion.roadRecovery),
      steeringAssist: snapshot.handling.steeringAssist,
      events: snapshot.events.filter((event) =>
        ['road-recovery', 'recover', 'jump-transfer', 'jump-miss'].includes(
          event.type,
        ),
      ),
      errors: snapshot.errors,
    };
  });
}

try {
  await seedVerificationCareer(context);
  await context.addInitScript(() =>
    localStorage.setItem(
      'vector-nova.settings',
      JSON.stringify({
        quality: 'low',
        volume: 0,
        masterVolume: 0,
        musicVolume: 0,
        reducedMotion: true,
      }),
    ),
  );
  const page = await context.newPage();
  collectPageErrors(page, errors);
  page.on('console', (message) => {
    if (
      message.type() === 'error' &&
      /WebGL|GL_INVALID|OUT_OF_MEMORY|shader|context lost/i.test(message.text())
    )
      glErrors.push(message.text());
  });
  await page.goto(new URL('?intro=0&music=0&editor=1', base).href);
  await page.locator('[data-editor-field="name"]').waitFor({ timeout: 60000 });
  await ready(page);
  await openEditorSection(page, 'library');
  const chooser = page.waitForEvent('filechooser');
  await choose(page, 'import');
  await (
    await chooser
  ).setFiles({
    name: basename(sourcePath),
    mimeType: 'application/json',
    buffer: source,
  });
  await page.waitForFunction(
    (count) => window.__VN_FRONTEND.getState().editor?.points === count,
    doc.points.length,
  );
  await ready(page);
  assert.equal(
    await page.locator('[data-editor-action="test"]').isEnabled(),
    true,
    'the original wild course can enter Test Drive',
  );
  await change(page, 'point', startIndex);
  await change(page, 'point-test-entry-speed', 'cruise');
  await change(page, 'point-test-reserve', 'full');
  const career = await page.evaluate(() => ({
    profile: window.__VN_FRONTEND.getState().career,
    cup: window.__VN_FRONTEND.getState().cup,
    stored: Object.fromEntries(
      Object.entries(localStorage).filter(([key]) =>
        /careers|profile|cups/.test(key),
      ),
    ),
  }));
  console.log(
    'Measured imported climb',
    JSON.stringify({
      name: doc.name,
      sourceHash: originalHash,
      length: route.length,
      peak,
      startPoint: startIndex + 1,
      startDistance: stations[startIndex],
      warnings: analysis.warnings,
    }),
  );
  await choose(page, 'test-point');
  await page.waitForFunction(
    () =>
      window.__VN?.ready &&
      window.__VN_FRONTEND.getState().editor.testDriving &&
      !window.__VN_FRONTEND.getState().editor.loadingTest,
    null,
    { timeout: 60000 },
  );
  const start = await page.evaluate(
    () => window.__VN.getEditorTestAttempt().start,
  );
  assert(
    Math.abs(start.distance - stations[startIndex]) < 0.001,
    'native local start uses the actual selected point',
  );
  const samples = [await observe(page)];
  await page.keyboard.down('w');
  try {
    const deadline = Date.now() + 6500;
    while (Date.now() < deadline) {
      await page.waitForTimeout(80);
      const sample = await observe(page);
      samples.push(sample);
      if (
        sample.distance >= peak.distance + 55 ||
        sample.recovering ||
        sample.resets
      )
        break;
    }
  } finally {
    await page.keyboard.up('w');
    await page.keyboard.press('Escape');
  }
  const steepest = samples.reduce((best, sample) =>
    sample.grade > best.grade ? sample : best,
  );
  console.log(
    'Native W-only bounded climb',
    JSON.stringify({
      start,
      sampleCount: samples.length,
      steepest,
      final: samples.at(-1),
    }),
  );
  assert(
    samples.at(-1).distance >= peak.distance + 55,
    'native practice progresses through and beyond the measured steepest climb',
  );
  assert(
    steepest.grade > 0.95,
    'the physical ship actually traverses the steep climb',
  );
  assert(
    samples.every(
      (sample) => sample.physical && !sample.recovering && sample.resets === 0,
    ),
    'the real magnetic body remains supported without recovery',
  );
  assert(
    samples.every((sample) => sample.clearance > 0.1 && sample.clearance < 4),
    'the physical body stays close to the authored road surface',
  );
  assert(
    Math.abs(steepest.bodyPitch - steepest.framePitch) < 12,
    'the physical hull follows the steep road pitch',
  );
  assert(
    samples.every((sample) => sample.steeringAssist === 0.3),
    'normal steering assistance remains unchanged',
  );
  assert(
    samples.every(
      (sample) => sample.events.length === 0 && sample.errors.length === 0,
    ),
    'there is no recovery, checkpoint transfer or runtime error during the bounded climb',
  );
  await page.locator('#home').click();
  await ready(page);
  assert.deepEqual(
    await page.evaluate(() => ({
      profile: window.__VN_FRONTEND.getState().career,
      cup: window.__VN_FRONTEND.getState().cup,
      stored: Object.fromEntries(
        Object.entries(localStorage).filter(([key]) =>
          /careers|profile|cups/.test(key),
        ),
      ),
    })),
    career,
    'the custom practice does not change career or cup data',
  );
  assert.deepEqual(errors, [], 'the imported course raises no page errors');
  assert.deepEqual(
    glErrors,
    [],
    'the imported course raises no console GL errors',
  );
  assert.equal(
    hash(await readFile(sourcePath)),
    originalHash,
    'the original course file remains byte-for-byte unchanged',
  );
  console.log(
    'PASS original wild course loads and native physical support follows its steep climb; no full-lap claim',
  );
} finally {
  clearTimeout(watchdog);
  await context.close();
  await browser.close();
}
