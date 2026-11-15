import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import {
  analyzeDocument,
  createDocument,
  validateDocument,
} from '../src/editor/document.js';
import { openEditorSection, revealEditorAction } from './editor-controls.mjs';
import { seedVerificationCareer } from './verification-career.mjs';
import {
  collectPageErrors,
  launchVerificationBrowser,
} from './verification-browser.mjs';

// Independent coordinates reproduce a tight bend and a separate steep climb.
// Import a fresh document through the public file picker; never mutate an open
// frontend document or depend on the user's original exported file.
const coordinates = [
  [-1075, 393, 30],
  [-1150, 592, 240],
  [-265, 393, 685],
  [-590, 52, -790],
  [-325, 52, -845],
  [-250, 52, -320],
  [-340, 52, 135],
  [-240, 52, 235],
  [125, 199, 30],
  [-250, 202, -230],
];
const fixture = createDocument({
  blank: true,
  biome: 'shatterline',
  seed: 2107151003,
  environment: { version: 1, seed: 2107151003, layoutVersion: 2 },
  settings: {
    sceneryPreset: 'limestone-canyon-v1',
    waterLevel: -50,
    density: 0.78,
  },
});
fixture.id = 'track-independent-corners';
fixture.name = 'Independent corner and climb regression';
fixture.points = coordinates.map(([x, y, z], index) => ({
  id: `corner-point-${index + 1}`,
  x,
  y,
  z,
  bank: 0,
  roll: 0,
}));
fixture.generator.length = 6200;
const document = validateDocument(fixture);
const baselineAnalysis = analyzeDocument(document);
assert.equal(
  baselineAnalysis.valid,
  true,
  'wild but usable geometry is advisory',
);
assert.equal(baselineAnalysis.primaryIssue, null);
const bendAdvisory = baselineAnalysis.advisories.find(
  (issue) => issue.kind === 'bend',
);
assert.equal(bendAdvisory.pointIndex, 8);
assert.equal(bendAdvisory.severity, 'warning');
assert(Math.abs(baselineAnalysis.minRadius - 42.56) < 0.1);
assert.equal(Math.round(baselineAnalysis.maxGrade * 100), 102);
const gradeIssue = baselineAnalysis.advisories.find(
  (issue) => issue.kind === 'grade',
);
assert.equal(gradeIssue.pointIndex, 1);
assert.equal(gradeIssue.severity, 'warning');
const hardDocument = structuredClone(document);
hardDocument.id = 'track-independent-hard-climb';
hardDocument.name = 'Independent hard climb regression';
hardDocument.points = hardDocument.points.map((point, index) => ({
  ...point,
  id: `hard-corner-point-${index + 1}`,
  y: index === 1 ? 1000 : point.y,
}));
const hardAnalysis = analyzeDocument(hardDocument);
assert.equal(
  hardAnalysis.valid,
  false,
  'genuinely unsafe grade remains blocked',
);
assert(hardAnalysis.maxGrade > 1.25);
assert.equal(hardAnalysis.primaryIssue.kind, 'grade');
assert.equal(hardAnalysis.primaryIssue.severity, 'error');
console.log('PASS advisory bend/climb and blocked hard-grade CPU diagnostics', {
  length: baselineAnalysis.length,
  minRadius: baselineAnalysis.minRadius,
  maxGrade: baselineAnalysis.maxGrade,
  hardGrade: hardAnalysis.maxGrade,
});

if (!process.argv.includes('--cpu-only')) await browserCheck();

async function browserCheck() {
  const base = process.env.VN_URL;
  if (!base) throw new Error('Set VN_URL to the isolated editor server.');
  const evidence = process.env.VN_EVIDENCE
    ? resolve(process.env.VN_EVIDENCE)
    : null;
  const responsive = process.argv.includes('--responsive');
  const dragOnly = process.argv.includes('--drag-only');
  const browser = await launchVerificationBrowser();
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
  });
  const errors = [];
  const action = (page, id) => page.locator(`[data-editor-action="${id}"]`);
  const state = (page) =>
    page.evaluate(() => window.__VN_FRONTEND.getState().editor);
  const watchdog = setTimeout(() => {
    process.exitCode = 1;
    console.error('Corner diagnostics check exceeded three minutes');
    void browser.close().catch(() => {});
  }, 180000);

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
  async function choose(page, id) {
    await (await revealEditorAction(page, id)).click();
    await frames(page);
  }
  async function pad(page, index) {
    await page.evaluate(async (index) => {
      window.__cornerPad.buttons[index] = { pressed: true, value: 1 };
      await new Promise((done) =>
        requestAnimationFrame(() => requestAnimationFrame(done)),
      );
      window.__cornerPad.buttons[index] = { pressed: false, value: 0 };
      await new Promise((done) =>
        requestAnimationFrame(() => requestAnimationFrame(done)),
      );
    }, index);
  }
  async function activateIssue(page, kind, input) {
    const target = action(page, `show-issue-${kind}`);
    await action(page, 'show-issue').focus();
    for (let step = 0; step < 25; step++) {
      if (
        await target.evaluate(
          (node) => node === globalThis.document.activeElement,
        )
      )
        break;
      if (input === 'controller') await pad(page, 13);
      else await page.keyboard.press('Tab');
    }
    assert(
      await target.evaluate(
        (node) => node === globalThis.document.activeElement,
      ),
      `${input} reaches ${kind}`,
    );
    if (input === 'controller') await pad(page, 0);
    else await page.keyboard.press('Enter');
    await frames(page);
  }
  async function save(page, name = document.name) {
    await choose(page, 'save');
    await page.waitForFunction(() =>
      globalThis.document
        .querySelector('[data-editor-status]')
        ?.textContent.includes('Track saved'),
    );
    const saved = await page.evaluate(
      (name) =>
        Object.keys(localStorage)
          .filter((key) => key.startsWith('vector-nova.tracks.v1.'))
          .map((key) => JSON.parse(localStorage.getItem(key)).document)
          .find((value) => value.name === name),
      name,
    );
    assert(saved, 'public Save writes the current document');
    return saved;
  }
  async function capture(page, filename) {
    if (!evidence) return;
    await mkdir(evidence, { recursive: true });
    await frames(page);
    await page.screenshot({ path: resolve(evidence, filename) });
  }
  async function importDocument(page, value) {
    await openEditorSection(page, 'library');
    const chooser = page.waitForEvent('filechooser');
    await choose(page, 'import');
    await (
      await chooser
    ).setFiles({
      name: 'independent-corners.vntrack.json',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify(value)),
    });
    await ready(page);
    if ((await state(page)).globalGroup) await choose(page, 'global-close');
  }
  async function footerFits(page) {
    const bounds = await page.locator('.workshop-footer').boundingBox();
    const viewport = page.viewportSize();
    assert(bounds.x >= 0 && bounds.x + bounds.width <= viewport.width + 1);
    for (const control of await page
      .locator('.workshop-footer button:visible')
      .all()) {
      const box = await control.boundingBox();
      assert(
        box.x >= 0 && box.x + box.width <= viewport.width + 1,
        'warning action fits horizontally',
      );
      assert(
        box.y >= 0 && box.y + box.height <= viewport.height + 1,
        'warning action fits vertically',
      );
    }
  }
  async function nativeDragAndUndo(page, baseline) {
    const canvas = page.locator('[data-editor-world] canvas');
    const box = await canvas.boundingBox();
    const handle = (await state(page)).preview.interaction.points.find(
      (point) => point.index === 8 && point.visible,
    );
    assert(
      box && handle,
      'the warning selects a visible native 3D point handle',
    );
    await page.mouse.move(box.x + handle.x, box.y + handle.y);
    await page.mouse.down();
    try {
      for (let step = 1; step <= 4; step++) {
        await page.mouse.move(
          box.x + handle.x + step * 8,
          box.y + handle.y + step * 3,
        );
        await frames(page);
        assert.equal((await state(page)).preview.interaction.dragging, true);
      }
      assert.equal(
        await page
          .locator('[data-editor-validation]')
          .getAttribute('data-severity'),
        'none',
        'dragging uses its own transient validation state',
      );
    } finally {
      await page.mouse.up();
    }
    await ready(page);
    assert.deepEqual(errors, [], 'native dragging raises no page errors');
    const changed = await save(page);
    assert.notDeepEqual(
      changed.points[8],
      baseline.points[8],
      'the real drag changes road coordinates',
    );
    assert.equal(
      changed.points[8].y,
      baseline.points[8].y,
      'ground drag keeps height',
    );
    assert.deepEqual(
      changed.points.map((point) => point.id),
      baseline.points.map((point) => point.id),
    );
    await choose(page, 'undo');
    assert.deepEqual(
      await save(page),
      baseline,
      'one Undo restores the exact pre-drag document',
    );
    assert.equal(
      await page
        .locator('[data-editor-validation]')
        .getAttribute('data-severity'),
      'warning',
      'Undo restores the advisory validation state',
    );
    assert.equal(
      (await state(page)).preview.interaction.problemMarker.severity,
      'warning',
    );

    await choose(page, 'view-map');
    const warningCircle = page.locator(
      '[data-map-point="8"].problem.problem-warning circle',
    );
    await warningCircle.waitFor({ state: 'visible' });
    assert.deepEqual(
      await warningCircle.evaluate((circle) => ({
        fill: getComputedStyle(circle).fill,
        stroke: getComputedStyle(circle).stroke,
      })),
      {
        fill: 'rgb(102, 81, 43)',
        stroke: 'rgb(255, 225, 162)',
      },
      'the actual Map warning is amber despite the later red problem rule',
    );
    await page.keyboard.press('Escape');
    await frames(page);
    console.log(
      'PASS native warning-point drag, Save/Undo, restored severity and computed amber Map color',
    );
  }

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
      window.__cornerPad = {
        id: 'Corner diagnostics verification controller',
        index: 0,
        connected: true,
        mapping: 'standard',
        axes: [0, 0, 0, 0],
        buttons: Array.from({ length: 17 }, () => ({
          pressed: false,
          value: 0,
        })),
      };
      Object.defineProperty(navigator, 'getGamepads', {
        configurable: true,
        value: () => [window.__cornerPad],
      });
    });
    const page = await context.newPage();
    collectPageErrors(page, errors);
    await page.goto(new URL('?intro=0&music=0&editor=1', base).href);
    await page
      .locator('[data-editor-field="name"]')
      .waitFor({ timeout: 90000 });
    await ready(page);
    await importDocument(page, document);
    const baseline = await save(page);
    assert.deepEqual(baseline, document);
    assert.equal((await state(page)).primaryIssue, null);
    assert.equal((await state(page)).focusedIssue.pointIndex, 8);
    assert(
      Math.abs(
        (await state(page)).focusedIssue.radius - baselineAnalysis.minRadius,
      ) < 0.001,
    );
    assert.equal((await state(page)).focusedIssue.kind, 'bend');
    assert.equal((await state(page)).focusedIssue.severity, 'warning');
    assert.equal(
      (await state(page)).preview.interaction.problemMarker.index,
      8,
    );
    assert.equal(
      (await state(page)).preview.interaction.problemMarker.pointId,
      baseline.points[8].id,
    );
    assert.equal(
      (await state(page)).preview.interaction.problemMarker.severity,
      'warning',
    );
    assert.equal(
      await page
        .locator('[data-editor-validation]')
        .getAttribute('data-severity'),
      'warning',
    );
    assert.match(
      await page.locator('[data-editor-validation]').textContent(),
      /Ready to test drive/,
    );
    assert.match(
      await page.locator('[data-editor-validation]').textContent(),
      /42\.6\s*m/,
    );
    assert(
      await action(page, 'test').isEnabled(),
      'measured advisories do not block Test drive',
    );
    await choose(page, 'show-issue');
    await footerFits(page);
    await nativeDragAndUndo(page, baseline);
    if (dragOnly) {
      assert.deepEqual(
        errors,
        [],
        'the focused drag regression raises no page errors',
      );
      return;
    }
    await capture(page, 'bend-primary.png');

    for (const input of ['keyboard', 'controller']) {
      await activateIssue(page, 'grade', input);
      const current = await state(page);
      assert.equal(current.focusedIssue.kind, 'grade');
      assert.equal(current.focusedIssue.severity, 'warning');
      assert.equal(current.focusedIssue.pointIndex, 1);
      assert.equal(current.selectedPoint, 1);
      assert.equal(Math.round(current.focusedIssue.grade * 100), 102);
      assert.equal(current.preview.interaction.problemMarker.index, 1);
      assert.equal(
        current.preview.interaction.problemMarker.pointId,
        baseline.points[1].id,
      );
      assert.equal(
        current.preview.interaction.problemMarker.severity,
        'warning',
      );
      assert.equal(current.focusedIssue.position.length, 3);
      assert.equal(
        current.primaryIssue,
        null,
        'inspecting an advisory does not create a hard error',
      );
      assert.match(
        await page.locator('[data-editor-problem-label]').textContent(),
        /Point 2/,
      );
      assert.match(
        await page.locator('[data-editor-validation]').textContent(),
        /102%/,
      );
      await footerFits(page);
      if (input === 'keyboard') await capture(page, 'climb-focused.png');
      await activateIssue(page, 'bend', input);
      assert.equal((await state(page)).focusedIssue.kind, 'bend');
      assert.equal((await state(page)).selectedPoint, 8);
    }
    console.log(
      'PASS enabled Test drive and keyboard/controller navigation between measured advisories',
    );

    await choose(page, 'smooth-corner');
    await ready(page);
    const repaired = await save(page);
    const report = analyzeDocument(repaired);
    assert.notDeepEqual(
      repaired.points,
      baseline.points,
      'Auto fix changes the local bend',
    );
    assert(
      report.minRadius >= 55,
      `local radius is resolved: ${report.minRadius}`,
    );
    assert.equal(
      report.valid,
      true,
      'optional repair leaves the independent climb advisory',
    );
    assert.equal(report.primaryIssue, null);
    assert(report.advisories.some((issue) => issue.kind === 'grade'));
    assert(await action(page, 'test').isEnabled());
    assert.equal(
      await page
        .locator('[data-editor-validation]')
        .getAttribute('data-severity'),
      'warning',
    );
    assert.match(
      await page.locator('[data-editor-validation]').textContent(),
      /102%/,
    );
    for (const key of ['biome', 'environment', 'settings'])
      assert.deepEqual(repaired[key], baseline[key]);
    assert.deepEqual(
      repaired.points.map((point) => point.id),
      baseline.points.map((point) => point.id),
    );
    assert.deepEqual(
      repaired.points.map((point) => point.y),
      baseline.points.map((point) => point.y),
    );
    const moved = repaired.points.flatMap((point, index) =>
      point.x === baseline.points[index].x &&
      point.z === baseline.points[index].z
        ? []
        : [index],
    );
    assert(
      moved.every((index) => Math.abs(index - 8) <= 1),
      'repair stays local to the tight bend',
    );
    await footerFits(page);
    await capture(page, 'corner-fixed-climb-remains.png');
    await choose(page, 'undo');
    assert.deepEqual(
      await save(page),
      baseline,
      'one Undo restores exact document including world, IDs and heights',
    );
    console.log(
      'PASS optional local corner repair with remaining climb advisory and exact Save/Undo',
    );

    await importDocument(page, hardDocument);
    assert.deepEqual(await save(page, hardDocument.name), hardDocument);
    assert.equal((await state(page)).primaryIssue.kind, 'grade');
    assert.equal((await state(page)).primaryIssue.severity, 'error');
    assert.equal(
      await page
        .locator('[data-editor-validation]')
        .getAttribute('data-severity'),
      'error',
    );
    assert(
      await action(page, 'test').isDisabled(),
      'hard grade remains blocked',
    );
    assert.doesNotMatch(
      await page.locator('[data-editor-validation]').textContent(),
      /Ready to (?:test )?drive|Road checks passed/,
    );
    await footerFits(page);
    await capture(page, 'hard-climb-blocked.png');
    console.log('PASS genuinely unsafe climb still blocks Test drive');

    if (responsive) {
      await importDocument(page, baseline);
      await page.setViewportSize({ width: 390, height: 844 });
      await ready(page);
      assert(await action(page, 'test').isEnabled());
      await footerFits(page);
      await capture(page, 'portrait-diagnostics.png');
      console.log('PASS targeted final portrait warning layout');
    }
    assert.deepEqual(errors, [], 'no page errors');
  } finally {
    clearTimeout(watchdog);
    await context.close();
    await browser.close();
  }
}
