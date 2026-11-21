import assert from 'node:assert/strict';
import { mkdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { analyzeDocument, generateDocument } from '../src/editor/document.js';
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

// Exercise the public editing/Practice controls. The road is hand-drawn through
// ground clicks; only the isolated career and synthetic menu pad are seeded.
// This is a desktop workflow check, not a full lap or a performance benchmark.
const base = process.env.VN_URL;
if (!base) throw new Error('Set VN_URL to an isolated Workshop server.');
const evidence = process.env.VN_EVIDENCE
  ? resolve(process.env.VN_EVIDENCE)
  : null;
const reviewOnly = process.argv.includes('--review-only');
const skipDrive = process.argv.includes('--skip-drive');
const responsive = process.argv.includes('--responsive');
const landscapeOnly = process.argv.includes('--landscape-only');
const incompleteRecoveryOnly = process.argv.includes(
  '--incomplete-recovery-only',
);
const testDriveControlsOnly = process.argv.includes('--test-drive-controls');
const name = 'Sparse road iteration verification';
const browser = await launchVerificationBrowser();
const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  hasTouch: responsive,
  acceptDownloads: true,
});
const errors = [];
const action = (page, id) => page.locator(`[data-editor-action="${id}"]`);
const field = (page, id) => page.locator(`[data-editor-field="${id}"]`);
const state = (page) =>
  page.evaluate(() => window.__VN_FRONTEND.getState().editor);
const canvas = (page) => page.locator('[data-editor-world] canvas');

async function frames(page) {
  await page.evaluate(
    () =>
      new Promise((done) =>
        requestAnimationFrame(() => requestAnimationFrame(done)),
      ),
  );
}

async function ready(page) {
  await page.waitForFunction(
    () => {
      const editor = window.__VN_FRONTEND.getState().editor;
      return !editor?.busy && editor?.preview?.worldReady;
    },
    null,
    { timeout: 90000 },
  );
  await frames(page);
}

async function choose(page, id, input = 'pointer') {
  const control = await revealEditorAction(page, id);
  if (input === 'keyboard') {
    await control.focus();
    await page.keyboard.press('Enter');
  } else if (input === 'controller') {
    await action(page, 'tab-jumps').focus();
    await reach(page, control, 'controller');
    await pad(page, 0);
  } else if (responsive) await control.tap();
  else await control.click();
  await frames(page);
}

async function reach(page, control, input = 'keyboard') {
  for (let step = 0; step < 100; step++) {
    if (await control.evaluate((node) => node === document.activeElement))
      return;
    if (input === 'controller') await pad(page, 13);
    else await page.keyboard.press('Tab');
  }
  assert.fail(
    `${input} navigation cannot reach ${await control.textContent()}`,
  );
}

async function change(page, id, value) {
  const control = await revealEditorField(page, id);
  if (await control.evaluate((node) => node.tagName === 'SELECT'))
    await control.selectOption(String(value));
  else {
    await control.fill(String(value));
    await control.press('Tab');
  }
  await frames(page);
}

async function pad(page, index) {
  await page.evaluate(async (index) => {
    window.__iterationPad.buttons[index] = { pressed: true, value: 1 };
    await new Promise((done) =>
      requestAnimationFrame(() => requestAnimationFrame(done)),
    );
    window.__iterationPad.buttons[index] = { pressed: false, value: 0 };
    await new Promise((done) =>
      requestAnimationFrame(() => requestAnimationFrame(done)),
    );
  }, index);
}

async function savedDocument(page) {
  await choose(page, 'save');
  await page.waitForFunction(() =>
    document
      .querySelector('[data-editor-status]')
      ?.textContent.includes('Track saved'),
  );
  const document = await page.evaluate(
    (name) =>
      Object.keys(localStorage)
        .filter((key) => key.startsWith('vector-nova.tracks.v1.'))
        .map((key) => JSON.parse(localStorage.getItem(key)).document)
        .find((document) => document.name === name),
    name,
  );
  assert(document, 'Save persists the actual authored course');
  return document;
}

async function capture(page, filename) {
  if (!evidence) return;
  await mkdir(evidence, { recursive: true });
  await frames(page);
  await page.screenshot({ path: resolve(evidence, filename) });
}

async function visibleApply(page) {
  const stripBox = await page.locator('[data-editor-authoring]').boundingBox();
  const applyBox = await action(page, 'apply-jump').boundingBox();
  assert(
    applyBox &&
      applyBox.y >= stripBox.y &&
      applyBox.y + applyBox.height <= stripBox.y + stripBox.height,
    `Apply is fully visible without scrolling away from the proposal: ${JSON.stringify({ stripBox, applyBox })}`,
  );
  const viewport = page.viewportSize();
  assert(
    applyBox.y >= 0 && applyBox.y + applyBox.height <= viewport.height,
    'the prepared primary action is inside the browser viewport',
  );
}

async function responsiveCheck(page) {
  // Public Import supplies a deterministic fixture solely for final responsive
  // controls. Desktop hands-on course creation is a separate verified flow.
  const fixture = generateDocument({
    seed: 42017,
    length: 4800,
    courseType: 'circuit',
    jumpFrequency: 'none',
    crossovers: 0,
  });
  fixture.name = name;
  await openEditorSection(page, 'library');
  const chooser = page.waitForEvent('filechooser');
  await choose(page, 'import');
  await (
    await chooser
  ).setFiles({
    name: 'responsive-road.vntrack.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(fixture)),
  });
  await ready(page);
  if ((await state(page)).globalGroup)
    await openEditorSection(page, 'road-home');
  await openEditorSection(page, 'jumps');
  await change(page, 'jump-size-preset', 'small');
  await choose(page, 'preview-find-jump');
  await ready(page);
  assert(
    (await state(page)).jumpProposal,
    'Find clear space prepares a proposal',
  );
  await page.keyboard.press('Escape');
  await frames(page);
  assert.equal(
    (await state(page)).jumpProposal,
    null,
    'Escape cancels only the ghost',
  );
  assert.equal(
    (await state(page)).authorGroup,
    'jumps',
    'Escape keeps Jumps open',
  );
  assert.equal(
    await page.evaluate(() => document.activeElement?.dataset.editorAction),
    'preview-jump',
    'Escape returns focus to preview',
  );
  assert.deepEqual(
    await savedDocument(page),
    fixture,
    'Cancel does not change the road',
  );
  console.log(
    'PASS targeted desktop Escape/cancel/focus on final responsive fixture',
  );

  if (!landscapeOnly) await page.setViewportSize({ width: 390, height: 844 });
  await ready(page);
  await openEditorSection(page, 'jumps');
  await choose(page, 'preview-find-jump');
  await ready(page);
  await visibleApply(page);
  if (!landscapeOnly) await capture(page, 'portrait-jump-proposal.png');
  await choose(page, 'apply-jump');
  await ready(page);
  assert.equal(
    (await state(page)).jumpCount,
    1,
    'portrait touch Apply commits',
  );
  const applied = await savedDocument(page);
  if (!landscapeOnly) {
    await recovery(page, applied);
    await capture(page, 'portrait-recovered.png');
  }

  await page.setViewportSize({ width: 844, height: 390 });
  await ready(page);
  await openEditorSection(page, 'jumps');
  await choose(page, 'preview-resize');
  await ready(page);
  assert((await state(page)).jumpProposal, 'landscape touch resize previews');
  await capture(page, 'landscape-jump-proposal.png');
  await visibleApply(page);
  await choose(page, 'cancel-jump-preview');
  assert.deepEqual(
    await savedDocument(page),
    applied,
    'landscape Cancel keeps draft',
  );
  await stripChecks(page);
  console.log(
    landscapeOnly
      ? 'PASS targeted final landscape touch resize/Cancel'
      : 'PASS final portrait/landscape touch proposal, Apply/Cancel and recovery',
  );
}

async function incompleteRecovery(page) {
  if ((await state(page)).globalGroup)
    await openEditorSection(page, 'road-home');
  if ((await state(page)).points) await choose(page, 'reset-track');
  await change(page, 'name', name);
  await choose(page, 'draw-mode', 'keyboard');
  await ready(page);
  const box = await canvas(page).boundingBox();
  for (const [x, y] of [
    [0.34, 0.55],
    [0.49, 0.6],
  ]) {
    await page.mouse.click(box.x + box.width * x, box.y + box.height * y);
    await frames(page);
  }
  const original = await savedDocument(page);
  assert.equal(
    original.points.length,
    2,
    'two real ground clicks start the road',
  );
  await change(page, 'name', `${name} — incomplete recovery`);
  await page.waitForFunction(
    () =>
      window.__VN_FRONTEND.getState().editor.recoveryState ===
      'Draft backed up',
  );
  await page.reload();
  const resume = page.getByRole('button', {
    name: 'Continue draft',
    exact: true,
  });
  await resume.waitFor({ timeout: 90000 });
  await resume.focus();
  await page.keyboard.press('Enter');
  await ready(page);
  assert.equal(
    await field(page, 'name').inputValue(),
    `${name} — incomplete recovery`,
  );
  assert.equal((await state(page)).points, 2);
  assert.equal(
    (await state(page)).tool,
    'draw',
    'incomplete recovery resumes Draw',
  );
  assert.equal(
    (await state(page)).selectedPoint,
    1,
    'Draw resumes at the last point',
  );
  const restoredBox = await canvas(page).boundingBox();
  await page.mouse.click(
    restoredBox.x + restoredBox.width * 0.6,
    restoredBox.y + restoredBox.height * 0.72,
  );
  await frames(page);
  assert.equal(
    (await state(page)).points,
    3,
    'the next ground click adds a point',
  );
  assert.equal(
    (await state(page)).selectedPoint,
    2,
    'the third point is appended',
  );
  assert.equal((await state(page)).tool, 'draw');
  await change(page, 'name', name);
  const extended = await savedDocument(page);
  assert.deepEqual(
    extended.points.slice(0, 2),
    original.points,
    'appending preserves the first two point IDs, order and positions exactly',
  );
  console.log(
    'PASS incomplete two-point recovery resumes Draw and appends the third point',
  );
}

async function sparseRoad(page) {
  if ((await state(page)).globalGroup)
    await openEditorSection(page, 'road-home');
  if ((await state(page)).points) await choose(page, 'reset-track');
  await change(page, 'name', name);
  await choose(page, 'draw-mode', 'keyboard');
  await ready(page);
  await choose(page, 'zoom-out');
  await choose(page, 'zoom-out');
  const box = await canvas(page).boundingBox();
  assert(box, 'the live 3D canvas is visible');
  for (const [x, y] of [
    [0.28, 0.55],
    [0.38, 0.48],
    [0.53, 0.49],
    [0.65, 0.56],
    [0.66, 0.72],
    [0.52, 0.82],
    [0.36, 0.82],
    [0.25, 0.7],
  ]) {
    await page.mouse.click(box.x + box.width * x, box.y + box.height * y);
    await frames(page);
  }
  assert.equal(
    (await state(page)).points,
    8,
    'eight clicks author eight points',
  );
  await choose(page, 'finish-drawing', 'keyboard');
  await ready(page);
  const document = await savedDocument(page);
  const analysis = analyzeDocument(document);
  assert(analysis.valid, analysis.errors.join(' '));
  assert.equal(document.points.length, 8, 'the starting route remains sparse');
  console.log('PASS sparse route built through eight real 3D ground clicks', {
    length: analysis.length,
  });
  return document;
}

async function stripChecks(page) {
  assert.equal(await page.locator('[data-editor-authoring]').count(), 1);
  for (const id of [
    'draw-mode',
    'select-mode',
    'height-mode',
    'focus-selection',
    'fit',
    'zoom-in',
    'zoom-out',
    'fly-camera',
    'view-map',
  ])
    assert(
      await action(page, id).isVisible(),
      `${id} remains directly visible`,
    );
  assert(
    await page.getByRole('contentinfo', { name: 'Track status' }).isVisible(),
  );
  assert.match(
    await page.locator('[data-editor-readiness-label]').textContent(),
    /Ready to drive|Before driving/,
  );
}

// IDs below follow the integration contract. Keep selectors here, rather than
// introducing release-only methods or driving the editor's internal state.
async function previewAndApply(page, original) {
  await change(page, 'point', 2);
  await openEditorSection(page, 'jumps');
  await action(page, 'tab-jumps').focus();
  await reach(page, field(page, 'jump-size-preset'));
  await change(page, 'jump-size-preset', 'small');
  await choose(page, 'preview-jump', 'keyboard');
  await ready(page);
  assert.equal((await state(page)).jumpCount, 0, 'preview does not add a gap');
  assert(
    (await state(page)).jumpProposal,
    `preview reports a proposed gap: ${await page.locator('[data-editor-status]').textContent()}`,
  );
  const stripBox = await page.locator('[data-editor-authoring]').boundingBox();
  const applyBox = await action(page, 'apply-jump').boundingBox();
  assert(
    applyBox &&
      applyBox.y >= stripBox.y &&
      applyBox.y + applyBox.height <= stripBox.y + stripBox.height,
    'Apply is fully visible without scrolling away from the proposal',
  );
  await capture(page, 'jump-proposal-before-save.png');
  assert.deepEqual(
    await savedDocument(page),
    original,
    'preview leaves the complete saved road unchanged',
  );
  await visibleApply(page);
  await capture(page, 'jump-proposal.png');
  await choose(page, 'apply-jump', 'controller');
  await ready(page);
  assert.equal(
    (await state(page)).jumpCount,
    1,
    'controller A applies the gap',
  );
  assert.equal((await state(page)).authorGroup, '', 'Apply collapses Jumps');
  assert.equal(
    await page.evaluate(() => document.activeElement?.dataset.editorAction),
    'tab-jumps',
    'Apply returns focus to the persistent Jumps group button',
  );
  await stripChecks(page);
  const applied = await savedDocument(page);
  assert(
    analyzeDocument(applied).valid,
    'the applied sparse-road jump is valid',
  );
  await choose(page, 'undo', 'keyboard');
  assert.deepEqual(
    await savedDocument(page),
    original,
    'one Undo restores road',
  );
  await choose(page, 'redo', 'keyboard');
  assert.deepEqual(await savedDocument(page), applied, 'Redo restores the gap');
  await capture(page, 'jump-applied.png');
  console.log(
    'PASS non-destructive proposal, explicit controller Apply, Undo/Redo',
  );
  return applied;
}

async function resizeJump(page, before) {
  await openEditorSection(page, 'jumps');
  await change(page, 'jump-size-preset', 'medium');
  await choose(page, 'preview-resize', 'keyboard');
  await ready(page);
  assert.deepEqual(
    await savedDocument(page),
    before,
    'resize preview is a ghost',
  );
  await choose(page, 'apply-jump', 'keyboard');
  await ready(page);
  const resized = await savedDocument(page);
  assert.equal(resized.jumps.length, 1, 'resize edits the existing jump');
  assert.equal(
    resized.jumps[0].id,
    before.jumps[0].id,
    'jump identity survives',
  );
  assert(
    analyzeDocument(resized).valid,
    'the resized jump passes track checks',
  );
  await choose(page, 'undo');
  assert.deepEqual(await savedDocument(page), before, 'resize Undo is exact');
  console.log('PASS direct resize preview/Apply and exact Undo');
}

async function recovery(page, before) {
  const libraryBefore = await page.evaluate(() =>
    Object.entries(localStorage)
      .filter(([key]) => key.startsWith('vector-nova.tracks.v1.'))
      .sort(),
  );
  await change(page, 'name', `${name} — unsaved recovery`);
  await page.waitForFunction(
    () =>
      window.__VN_FRONTEND.getState().editor.recoveryState ===
      'Draft backed up',
  );
  await page.reload();
  const continueDraft = page.getByRole('button', {
    name: 'Continue draft',
    exact: true,
  });
  await continueDraft.waitFor({ timeout: 90000 });
  assert(
    await field(page, 'name').isDisabled(),
    'recovery precedes name editing',
  );
  assert(
    await action(page, 'draw-mode').isDisabled(),
    'recovery precedes drawing',
  );
  const pendingPoints = (await state(page)).points;
  const box = await canvas(page).boundingBox();
  await page.mouse.click(box.x + box.width * 0.4, box.y + box.height * 0.7);
  assert.equal(
    (await state(page)).points,
    pendingPoints,
    'pending recovery guards canvas',
  );
  await continueDraft.focus();
  await page.keyboard.press('Enter');
  await ready(page);
  assert.equal(
    await field(page, 'name').inputValue(),
    `${name} — unsaved recovery`,
  );
  assert.equal((await state(page)).jumpCount, before.jumps.length);
  assert.equal(
    (await state(page)).tool,
    'move',
    'a complete recovered road resumes Select / move',
  );
  assert.equal(
    (await state(page)).selectedPoint,
    0,
    'recovery selects a real road point',
  );
  assert.deepEqual(
    await page.evaluate(() =>
      Object.entries(localStorage)
        .filter(([key]) => key.startsWith('vector-nova.tracks.v1.'))
        .sort(),
    ),
    libraryBefore,
    'autosave and recovery do not overwrite the saved library',
  );
  await change(page, 'name', name);
  assert.deepEqual(
    await savedDocument(page),
    before,
    'recovery preserves the road',
  );
  console.log('PASS unsaved reload recovery through native Continue draft');
}

async function roadFinish(page, before) {
  await openEditorSection(page, 'shape');
  await change(page, 'shape-start', 0);
  await change(page, 'shape-end', 1);
  await change(page, 'road-span-biome', 'vesper-forest');
  await choose(page, 'apply-road-finish', 'keyboard');
  await ready(page);
  const finished = await savedDocument(page);
  assert.equal(finished.biomeSpans.length, 1);
  assert.equal(finished.biomeSpans[0].biome, 'vesper-forest');
  assert.equal(finished.biomeSpans[0].startPointId, before.points[0].id);
  assert.equal(finished.biomeSpans[0].endPointId, before.points[1].id);
  for (const key of [
    'points',
    'jumps',
    'rolls',
    'biome',
    'environment',
    'settings',
  ])
    assert.deepEqual(finished[key], before[key], `${key} survives road finish`);
  await capture(page, 'road-finish-pilot.png');

  await openEditorSection(page, 'library');
  const download = page.waitForEvent('download');
  await choose(page, 'export', 'keyboard');
  const exported = await download;
  assert.deepEqual(
    JSON.parse(await readFile(await exported.path(), 'utf8')),
    finished,
    'Export retains the applied section and its endpoints',
  );

  await openEditorSection(page, 'shape');
  await choose(page, 'clear-road-finish', 'keyboard');
  assert.deepEqual(
    await savedDocument(page),
    before,
    'Clear uses the world finish',
  );
  await choose(page, 'undo', 'keyboard');
  assert.deepEqual(
    await savedDocument(page),
    finished,
    'road finish Clear Undo is exact',
  );
  await openEditorSection(page, 'library');
  await change(page, 'saved', finished.id);
  await choose(page, 'load', 'keyboard');
  await ready(page);
  assert.deepEqual(
    await savedDocument(page),
    finished,
    'Load retains section finish',
  );
  await openEditorSection(page, 'shape');
  await change(page, 'shape-start', 0);
  await change(page, 'shape-end', 1);
  await choose(page, 'clear-road-finish', 'keyboard');
  assert.deepEqual(
    await savedDocument(page),
    before,
    'pilot returns to original road',
  );
  console.log(
    'PASS Vesper section Apply/Clear/Undo/Export/Load with anchored endpoints',
  );
}

async function localPractice(page, document) {
  await openEditorSection(page, 'jumps');
  await change(page, 'test-entry-speed', 'cruise');
  const editorBefore = await state(page);
  const startedAt = Date.now();
  await choose(page, 'test-jump', 'keyboard');
  await page.waitForFunction(
    () =>
      document.body.dataset.screen === 'race' &&
      window.__VN?.getEditorTestAttempt?.()?.request.kind === 'jump',
    null,
    { timeout: 90000 },
  );
  const startupMs = Date.now() - startedAt;
  const initial = await page.evaluate(() => window.__VN.getEditorTestAttempt());
  assert.equal(initial.request.jumpId, document.jumps[0].id);
  assert(initial.start.distance > 0, 'local jump test skips the course start');
  assert(
    initial.start.approachMetres >= 100,
    'local test provides an approach',
  );
  await page.keyboard.down('w');
  await page.waitForTimeout(450);
  await page.keyboard.up('w');
  await page.keyboard.press('r');
  await frames(page);
  const retried = await page.evaluate(() => window.__VN.getEditorTestAttempt());
  assert.deepEqual(
    retried.request,
    initial.request,
    'R retries the same approach',
  );
  assert.deepEqual(
    retried.start,
    initial.start,
    'retry retains speed and reserve',
  );
  assert.equal(retried.status, 'not-launched');
  await page.keyboard.down('w');
  let outcomeObserved = true;
  try {
    await page.waitForFunction(
      () =>
        ['landed', 'missed'].includes(
          window.__VN?.getEditorTestAttempt?.()?.status,
        ),
      null,
      { timeout: 20000 },
    );
  } catch (error) {
    if (error.name !== 'TimeoutError') throw error;
    outcomeObserved = false;
  } finally {
    await page.keyboard.up('w');
  }
  const flown = await page.evaluate(() => window.__VN.getEditorTestAttempt());
  assert(flown, 'native local test produces a read-only attempt report');
  if (flown.lastAttempt)
    assert(Number.isFinite(flown.lastAttempt.launch.speed));
  await page.keyboard.press('Escape');
  const back = page.locator('#home');
  await back.waitFor({ state: 'visible' });
  await back.focus();
  await page.keyboard.press('Enter');
  await ready(page);
  const after = await state(page);
  assert.equal(after.lastTestAttempt?.status, flown.status);
  assert.equal(
    after.lastTestAttempt?.lastAttempt?.launch.speed ?? null,
    flown.lastAttempt?.launch.speed ?? null,
    'return retains the actual launch speed, distinct from a forecast',
  );
  for (const key of ['selectedPoint', 'selectionRange', 'tool'])
    assert.deepEqual(
      after[key],
      editorBefore[key],
      `${key} survives local test`,
    );
  assert.deepEqual(after.preview.camera, editorBefore.preview.camera);
  assert.deepEqual(
    await savedDocument(page),
    document,
    'Practice keeps the draft',
  );
  await capture(page, 'last-attempt.png');
  console.log('PASS native local test, R retry and retained actual attempt', {
    startupMs,
    outcome: flown.status,
    outcomeObserved,
    actualLaunchKmh: flown.lastAttempt
      ? flown.lastAttempt.launch.speed * 3.6
      : null,
    caveat:
      'Native straight-ahead input; a timed-out approach is reported without claiming a launch, landing, full lap or physics verdict',
  });
}

async function testDriveControls(page) {
  const file = action(page, 'tab-library');
  const menu = page.locator('#workshop-file-panel');
  const drive = action(page, 'test');
  const focused = () =>
    page.evaluate(() => document.activeElement?.dataset.editorAction);
  const commands = page.getByRole('group', { name: 'Track commands' });
  assert.deepEqual(
    await commands
      .locator('button:visible')
      .evaluateAll((buttons) =>
        buttons.map((node) => node.dataset.editorAction),
      ),
    ['tab-library', 'save', 'test'],
  );
  assert(await drive.isDisabled(), 'an empty document cannot be driven');
  assert.equal(await action(page, 'test-options').count(), 0);

  await file.focus();
  await page.keyboard.press('Enter');
  assert(await menu.isVisible());
  assert(await menu.evaluate((node) => node.contains(document.activeElement)));
  await pad(page, 1);
  assert(await menu.isHidden(), 'controller B dismisses File');
  assert.equal(await focused(), 'tab-library');

  const fixture = generateDocument({ seed: 42017, length: 5000 });
  await pad(page, 0);
  const chooser = page.waitForEvent('filechooser');
  await choose(page, 'import');
  await (
    await chooser
  ).setFiles({
    name: 'test-drive-controls.vntrack.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(fixture)),
  });
  await ready(page);
  assert(await menu.isHidden());

  async function readAttempt(kind) {
    await page.waitForFunction(
      (kind) =>
        document.body.dataset.screen === 'race' &&
        window.__VN?.getEditorTestAttempt?.()?.request.kind === kind,
      kind,
      { timeout: 90000 },
    );
    return page.evaluate(() => window.__VN.getEditorTestAttempt());
  }
  async function returnToEditor(origin) {
    await page.keyboard.press('Escape');
    const back = page.locator('#home');
    await back.waitFor({ state: 'visible' });
    await back.focus();
    await page.keyboard.press('Enter');
    await ready(page);
    assert.equal(await focused(), origin);
    assert.equal(await page.locator('[data-editor-test-feedback]').count(), 0);
  }

  await file.focus();
  await page.keyboard.press('Tab');
  assert.equal(await focused(), 'save');
  await page.keyboard.press('Tab');
  assert.equal(await focused(), 'test');
  await page.keyboard.press('Enter');
  const course = await readAttempt('course');
  assert.equal(course.start.distance, 0);
  await returnToEditor('test');

  await openEditorSection(page, 'jumps');
  await change(page, 'test-entry-speed', 'boost');
  await change(page, 'test-reserve', 'half');
  await choose(page, 'test-jump', 'keyboard');
  const jump = await readAttempt('jump');
  assert.equal(jump.request.jumpId, fixture.jumps[0].id);
  assert.equal(jump.request.speed, 'boost');
  assert.equal(jump.request.reserve, 'half');
  assert(jump.start.distance > 0);
  await page.keyboard.press('r');
  await frames(page);
  const retry = await readAttempt('jump');
  assert.deepEqual(retry.request, jump.request);
  assert.deepEqual(retry.start, jump.start);
  await returnToEditor('test-jump');

  await choose(page, 'context-next');
  await openEditorSection(page, 'route');
  await change(page, 'point-test-entry-speed', 'standing');
  await change(page, 'point-test-reserve', 'empty');
  const pointControl = await revealEditorAction(page, 'test-point');
  await action(page, 'tab-route').focus();
  await reach(page, pointControl, 'controller');
  await pad(page, 0);
  const point = await readAttempt('point');
  assert.equal(point.request.pointId, fixture.points[1].id);
  assert.equal(point.request.speed, 'standing');
  assert.equal(point.request.reserve, 'empty');
  assert(point.start.distance > 0);
  await returnToEditor('test-point');
  console.log(
    'PASS File, direct Test Drive, point and jump tests, exact Practice retry and focus return',
  );
}

const watchdog = setTimeout(() => {
  process.exitCode = 1;
  console.error('Editor iteration verification exceeded six minutes');
  void browser.close().catch(() => {});
}, 360000);

try {
  await context.routeWebSocket('**/*', () => {});
  await seedVerificationCareer(context);
  await context.addInitScript(() => {
    localStorage.setItem('startUpMusicOn', 'false');
    localStorage.setItem(
      'vector-nova.settings',
      JSON.stringify({
        quality: 'low',
        volume: 0,
        masterVolume: 0,
        musicVolume: 0,
        reducedMotion: true,
      }),
    );
    window.__iterationPad = {
      id: 'Editor iteration verification controller',
      index: 0,
      connected: true,
      mapping: 'standard',
      axes: [0, 0, 0, 0],
      buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })),
    };
    Object.defineProperty(navigator, 'getGamepads', {
      configurable: true,
      value: () => [window.__iterationPad],
    });
  });
  const page = await context.newPage();
  collectPageErrors(page, errors);
  await page.goto(new URL('?intro=0&music=0&editor=1', base).href);
  await field(page, 'name').waitFor({ timeout: 90000 });
  await ready(page);
  if (testDriveControlsOnly) {
    await testDriveControls(page);
    assert.deepEqual(errors, [], 'Test Drive controls raise no page errors');
  } else if (incompleteRecoveryOnly) {
    await incompleteRecovery(page);
    assert.deepEqual(errors, [], 'incomplete recovery raises no page errors');
  } else if (responsive) {
    await responsiveCheck(page);
    assert.deepEqual(errors, [], 'final responsive UI raises no page errors');
    console.log('PASS final responsive editor iteration controls');
  } else {
    const original = await sparseRoad(page);
    await stripChecks(page);
    if (!reviewOnly) await roadFinish(page, original);
    const applied = await previewAndApply(page, original);
    if (!reviewOnly) {
      await resizeJump(page, applied);
    }
    await recovery(page, applied);
    if (!skipDrive) await localPractice(page, applied);
    assert.deepEqual(errors, [], 'the public workflow raises no page errors');
    console.log('PASS desktop editor iteration workflow');
  }
} finally {
  clearTimeout(watchdog);
  await context.close();
  await browser.close();
}
