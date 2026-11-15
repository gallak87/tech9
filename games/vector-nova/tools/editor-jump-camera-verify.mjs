import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { basename } from 'node:path';
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

// This bounded check observes native RAF frames through a real public jump
// practice. It uses ordinary keyboard input and the editor's stock starts;
// it never steps simulation or sets a vehicle pose through developer APIs.
const base = process.env.VN_URL;
const sourcePath = process.env.VN_TRACK;
if (!base || !sourcePath) throw new Error('Set VN_URL and VN_TRACK.');
const source = await readFile(sourcePath);
const hash = (value) => createHash('sha256').update(value).digest('hex');
const sourceHash = hash(source);
const original = JSON.parse(source.toString('utf8'));
const baseline = process.argv.includes('--baseline');
const sourceOnly = process.argv.includes('--source-only');
const presetsOnly = process.argv.includes('--presets-only');
const reports = [],
  errors = [],
  glErrors = [];
const browser = await launchVerificationBrowser();
const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
});
const watchdog = setTimeout(() => {
  process.exitCode = 1;
  void browser.close();
}, 240000);
const choose = async (page, name) =>
  (await revealEditorAction(page, name)).click();
const change = async (page, name, value) =>
  (await revealEditorField(page, name)).selectOption(String(value));
async function ready(page) {
  await page.waitForFunction(
    () => {
      const editor = window.__VN_FRONTEND?.getState().editor;
      return editor && !editor.busy && editor.preview?.worldReady;
    },
    null,
    { timeout: 90000 },
  );
}
async function savedDocument(page) {
  await choose(page, 'save');
  await page.waitForFunction(() =>
    globalThis.document
      .querySelector('[data-editor-status]')
      ?.textContent.includes('Track saved'),
  );
  return page.evaluate(() => {
    const id = window.__VN_FRONTEND.getState().editor.documentId;
    const entries = Object.keys(localStorage)
      .filter((key) => key.startsWith('vector-nova.tracks.v1.'))
      .map((key) => JSON.parse(localStorage.getItem(key)).document);
    return entries.find((doc) => doc.id === id) ?? entries.at(-1);
  });
}
async function enterJump(page, label, course, fromPoint = false, high = false) {
  console.log(
    `Starting native ${label} ${fromPoint ? 'point' : 'jump'} practice`,
  );
  if (fromPoint) {
    const launch = course.points.findIndex(
      (point) => point.id === course.jumps[0].launchPointId,
    );
    await change(page, 'point', Math.max(0, launch - 2));
    await change(page, 'point-test-entry-speed', 'cruise');
    await change(page, 'point-test-reserve', 'full');
    await choose(page, 'test-point');
  } else {
    await openEditorSection(page, 'jumps');
    await change(page, 'test-entry-speed', 'cruise');
    await change(page, 'test-reserve', 'full');
    await choose(page, 'test-jump');
  }
  try {
    await page.waitForFunction(
      (kind) =>
        window.__VN?.ready &&
        window.__VN.getEditorTestAttempt?.()?.request.kind === kind,
      fromPoint ? 'point' : 'jump',
      { timeout: 90000 },
    );
  } catch (error) {
    console.log(
      'Practice startup diagnostic',
      await page.evaluate(() => ({
        screen: document.body.dataset.screen,
        ready: window.__VN?.ready,
        attempt: window.__VN?.getEditorTestAttempt?.(),
        editor: window.__VN_FRONTEND?.getState().editor,
        status: document.querySelector('[data-editor-status]')?.textContent,
      })),
    );
    throw error;
  }
  if (high) {
    await page.keyboard.press('f');
    await page.keyboard.press('p');
    await page
      .locator('#fly-settings [data-setting="quality"]')
      .selectOption('high');
    await page.locator('#fly-settings-close').click();
    await page.keyboard.press('f');
  }
  console.log(`Recording native ${label} frames`);
  await page.evaluate(() => {
    const record = {
      samples: [],
      done: false,
      tookOff: false,
      landedAt: null,
      start: performance.now(),
    };
    window.__editorJumpCamera = record;
    function sample(now) {
      const s = window.__VN.getSnapshot();
      let motion = s.runtime.state;
      while (motion.motion) motion = motion.motion;
      const item = {
        now,
        time: s.vehicle.time,
        distance: s.vehicle.distance,
        speed: s.vehicle.speed,
        lateral: s.vehicle.lateral,
        heading: s.vehicle.heading,
        mode: motion.mode,
        reset: s.vehicle.resetCount,
        camera: s.camera,
        ship: s.ship.position,
        assist: s.handling.steeringAssist,
        errors: s.errors,
        quality: s.settings.quality,
      };
      record.samples.push(item);
      if (motion.mode === 'flight') record.tookOff = true;
      if (
        record.tookOff &&
        motion.mode === 'magnetic' &&
        record.landedAt === null
      )
        record.landedAt = now;
      if (
        motion.mode === 'recovery' ||
        (record.landedAt !== null && now - record.landedAt > 900) ||
        now - record.start > 15000
      )
        record.done = true;
      if (!record.done) requestAnimationFrame(sample);
    }
    requestAnimationFrame(sample);
  });
  await page.keyboard.down('w');
  try {
    await page.waitForFunction(() => window.__editorJumpCamera.done, null, {
      timeout: 20000,
    });
  } finally {
    await page.keyboard.up('w');
  }
  const record = await page.evaluate(() => window.__editorJumpCamera);
  const takeoff = record.samples.findIndex((s) => s.mode === 'flight');
  const landing = record.samples.findIndex(
    (s, i) => i > takeoff && s.mode === 'magnetic',
  );
  const angle = (a, b) =>
    (2 *
      Math.acos(
        Math.min(
          1,
          Math.abs(a.reduce((sum, value, i) => sum + value * b[i], 0)),
        ),
      ) *
      180) /
    Math.PI;
  const relative = (s) =>
    s.camera.position.map((value, i) => value - s.ship[i]);
  function windowMetrics(center, radius) {
    const a = record.samples;
    let rotation = 0,
      offset = 0;
    for (
      let i = Math.max(1, center - radius);
      i <= Math.min(a.length - 1, center + radius);
      i++
    ) {
      const dt = (a[i].now - a[i - 1].now) / 1000;
      if (dt < 0.005 || dt > 0.07) continue;
      rotation = Math.max(
        rotation,
        angle(a[i - 1].camera.quaternion, a[i].camera.quaternion) / (dt * 60),
      );
      const before = relative(a[i - 1]),
        after = relative(a[i]);
      offset = Math.max(
        offset,
        Math.hypot(...after.map((value, axis) => value - before[axis])) /
          (dt * 60),
      );
    }
    return {
      degreesPer60HzFrame: rotation,
      relativeMetresPer60HzFrame: offset,
    };
  }
  const result = {
    label,
    startKind: fromPoint ? 'point' : 'jump',
    samples: record.samples.length,
    tookOff: takeoff >= 0,
    landed: landing > takeoff,
    start: record.samples[0],
    end: record.samples.at(-1),
    takeoff: takeoff >= 0 ? windowMetrics(takeoff, 8) : null,
    landing: landing > takeoff ? windowMetrics(landing, 10) : null,
    attempt: await page.evaluate(() => window.__VN.getEditorTestAttempt()),
  };
  reports.push(result);
  console.log(JSON.stringify(result));
  if (process.env.VN_JUMP_REPORT)
    await writeFile(
      process.env.VN_JUMP_REPORT,
      JSON.stringify({ reports, errors, glErrors, sourceHash }, null, 2),
    );
  assert(takeoff >= 0, `${label} actually leaves the road`);
  assert(landing > takeoff, `${label} actually lands on its receiving road`);
  assert(
    record.samples.every(
      (s) =>
        s.mode !== 'recovery' &&
        !s.reset &&
        s.assist === 0.3 &&
        !s.errors.length,
    ),
  );
  if (!baseline) {
    assert(
      result.takeoff.degreesPer60HzFrame < 6,
      `${label} has no takeoff camera cut`,
    );
    assert(
      result.landing.degreesPer60HzFrame < 6,
      `${label} has no landing camera cut`,
    );
    assert(
      result.landing.relativeMetresPer60HzFrame < 4,
      `${label} avoids a late clearance lift`,
    );
  }
  await page.keyboard.press('Escape');
  await page
    .getByRole('button', { name: /back to editor|return to editor/i })
    .click();
  await ready(page);
}

async function downhillGeneration(page) {
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
    (count) =>
      window.__VN_FRONTEND.getState().editor.points === count &&
      window.__VN_FRONTEND.getState().editor.courseType === 'downhill',
    original.points.length,
  );
  await ready(page);
  const before = await savedDocument(page);
  assert.deepEqual(before, original);
  await openEditorSection(page, 'generate');
  await choose(page, 'generate');
  await ready(page);
  const generated = await savedDocument(page);
  assert.equal(
    generated.generator.version,
    4,
    'new generation uses the current downhill profile',
  );
  assert.equal(generated.courseType, 'downhill');
  const drop = generated.points[0].y - generated.points.at(-1).y;
  assert(
    drop >= 2000 && drop <= 2800,
    `20 km strong descent has mountain-scale fall: ${drop}`,
  );
  const fact = await page.locator('[data-editor-elevation-drop]').textContent();
  assert.equal(Number(fact.replace(/[^0-9]/g, '')), Math.round(drop));
  assert.match(fact, /drop/);
  assert.deepEqual(
    generated.environment,
    original.environment,
    'road generation keeps the applied world seed',
  );
  assert.deepEqual(generated.settings, original.settings);
  console.log(
    JSON.stringify({
      label: 'generated downhill',
      version: generated.generator.version,
      start: generated.points[0].y,
      finish: generated.points.at(-1).y,
      drop,
      fact,
    }),
  );
  await choose(page, 'undo');
  await ready(page);
  assert.deepEqual(
    await savedDocument(page),
    before,
    'one Undo restores every original v3 field and resolved point',
  );
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
        reducedMotion: false,
      }),
    ),
  );
  const page = await context.newPage();
  collectPageErrors(page, errors);
  page.on('console', (message) => {
    if (
      message.type() === 'error' &&
      /WebGL|GL_INVALID|shader|OUT_OF_MEMORY|context lost/i.test(message.text())
    )
      glErrors.push(message.text());
  });
  await page.goto(new URL('?intro=0&music=0&editor=1', base).href);
  await page.locator('[data-editor-field="name"]').waitFor({ timeout: 90000 });
  await ready(page);
  console.log('Editor ready for native jump checks');
  const career = await page.evaluate(() =>
    Object.fromEntries(
      Object.entries(localStorage).filter(([key]) =>
        /careers|profile|cups/.test(key),
      ),
    ),
  );
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
    (count) => window.__VN_FRONTEND.getState().editor.points === count,
    original.points.length,
  );
  await ready(page);
  const imported = await savedDocument(page);
  assert.deepEqual(
    imported,
    original,
    'import and Save retain the supplied course',
  );
  if (!presetsOnly) {
    await enterJump(page, 'supplied G1 downhill', imported, true);
    assert.deepEqual(
      await savedDocument(page),
      imported,
      'jump practice leaves authored geometry untouched',
    );
  }
  if (!sourceOnly) {
    await change(page, 'course-type', 'circuit');
    for (const preset of ['woven', 'big-air']) {
      await openEditorSection(page, 'generate');
      await choose(page, `road-preset-${preset}`);
      await ready(page);
      await enterJump(
        page,
        preset,
        await savedDocument(page),
        true,
        preset === 'big-air',
      );
    }
    await downhillGeneration(page);
  }
  if (process.argv.includes('--responsive')) {
    await page.setViewportSize({ width: 390, height: 844 });
    await ready(page);
    const preview = await page.evaluate(
      () => window.__VN_FRONTEND.getState().editor.preview,
    );
    assert(preview.calls > 0 && preview.triangles > 0);
    assert(preview.camera.position.every(Number.isFinite));
    assert.match(
      await page.locator('[data-editor-elevation-drop]').textContent(),
      /drop/,
    );
    console.log('PASS final portrait preview and downhill drop fact');
  }
  assert.deepEqual(
    await page.evaluate(() =>
      Object.fromEntries(
        Object.entries(localStorage).filter(([key]) =>
          /careers|profile|cups/.test(key),
        ),
      ),
    ),
    career,
    'practice preserves career and cup data',
  );
  assert.deepEqual(errors, [], 'no page errors');
  assert.deepEqual(glErrors, [], 'no WebGL errors');
  assert.equal(
    hash(await readFile(sourcePath)),
    sourceHash,
    'the original file remains untouched',
  );
  if (process.env.VN_JUMP_REPORT)
    await writeFile(
      process.env.VN_JUMP_REPORT,
      JSON.stringify({ reports, errors, glErrors, sourceHash }, null, 2),
    );
} finally {
  clearTimeout(watchdog);
  await context.close();
  await browser.close();
}
