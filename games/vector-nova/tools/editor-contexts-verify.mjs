import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import {
  analyzeDocument,
  generateDocument,
  ENVIRONMENT_LAYOUT_VERSION,
} from '../src/editor/document.js';
import { ROAD_PRESETS, roadPresetOptions } from '../src/editor/road-presets.js';
import { seedVerificationCareer } from './verification-career.mjs';
import {
  openEditorSection,
  revealEditorAction,
  revealEditorField,
} from './editor-controls.mjs';
import {
  collectPageErrors,
  launchVerificationBrowser,
} from './verification-browser.mjs';

// Public native controls and documents written by Save; no release test hooks.
const base = process.env.VN_URL;
if (!base) throw new Error('Set VN_URL to the isolated Workshop server.');
const responsive = process.argv.includes('--responsive');
const review = process.argv.includes('--review-worlds');
const reviewOnly = process.argv.includes('--review-only');
const waterClearance = process.argv.includes('--water-clearance');
const evidence = process.env.VN_EVIDENCE
  ? resolve(process.env.VN_EVIDENCE)
  : null;
const name = 'Road and environment verification';
const browser = await launchVerificationBrowser();
const context = await browser.newContext({
  viewport: responsive
    ? { width: 390, height: 844 }
    : { width: 1440, height: 900 },
  hasTouch: responsive,
});
const errors = [];
const action = (page, id) => page.locator(`[data-editor-action="${id}"]`);
const state = (page) =>
  page.evaluate(() => window.__VN_FRONTEND.getState().editor);
const canvas = (page) => page.locator('[data-editor-world] canvas');
const activate = (control) => (responsive ? control.tap() : control.click());
const choose = async (page, id) => activate(await revealEditorAction(page, id));
const watchdog = setTimeout(() => {
  process.exitCode = 1;
  console.error('Workshop context verification exceeded five minutes');
  void browser.close().catch(() => {});
}, 300000);

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
      return !editor?.busy && editor.preview?.worldReady;
    },
    null,
    { timeout: 90000 },
  );
  await frames(page);
}
async function section(page, id) {
  if (id === 'world' && (await state(page)).context !== 'environment')
    await choose(page, 'context-environment');
  if (
    ['generate', 'pickups'].includes(id) &&
    (await state(page)).context !== 'road'
  )
    await choose(page, 'context-road');
  return openEditorSection(page, id);
}
async function change(page, id, value) {
  const control = await revealEditorField(page, id);
  if (await control.evaluate((el) => el.tagName === 'SELECT'))
    await control.selectOption(String(value));
  else {
    await control.fill(String(value));
    await control.press('Tab');
  }
}
async function save(page) {
  await choose(page, 'save');
  await page.waitForFunction(() =>
    document
      .querySelector('[data-editor-status]')
      ?.textContent.includes('Track saved'),
  );
  const doc = await page.evaluate(
    (trackName) =>
      Object.keys(localStorage)
        .filter((key) => key.startsWith('vector-nova.tracks.v1.'))
        .map((key) => JSON.parse(localStorage.getItem(key)).document)
        .find((value) => value.name === trackName),
    name,
  );
  assert(doc, 'public Save writes the current course');
  return doc;
}
function road(doc) {
  const { biome, environment, settings, props, ...resolved } = doc;
  void biome;
  void environment;
  void settings;
  void props;
  return resolved;
}
function surroundings(doc) {
  return {
    biome: doc.biome,
    environment: doc.environment,
    settings: doc.settings,
  };
}
function valid(doc) {
  const report = analyzeDocument(doc);
  assert(report.valid, report.errors.join(' '));
  assert(Math.abs(report.length - doc.generator.length) < 0.05);
}
async function screenshot(page, filename) {
  if (!evidence) return;
  await mkdir(evidence, { recursive: true });
  await frames(page);
  await page.screenshot({ path: resolve(evidence, filename) });
}
async function pad(page, button) {
  await page.evaluate(async (index) => {
    window.__contextsPad.buttons[index] = { pressed: true, value: 1 };
    await new Promise((done) =>
      requestAnimationFrame(() => requestAnimationFrame(done)),
    );
    window.__contextsPad.buttons[index] = { pressed: false, value: 0 };
    await new Promise((done) =>
      requestAnimationFrame(() => requestAnimationFrame(done)),
    );
  }, button);
}
const contextPanels = new WeakMap();
async function stableContext(
  page,
  id,
  activateContext = () => choose(page, `context-${id}`),
) {
  const previous = await state(page),
    owner = await canvas(page).elementHandle();
  const remembered = contextPanels.get(page) ?? {
    road: { globalGroup: '', authorGroup: '' },
    environment: { globalGroup: 'world', authorGroup: '' },
  };
  remembered[previous.context] = {
    globalGroup: previous.globalGroup,
    authorGroup: previous.authorGroup,
  };
  contextPanels.set(page, remembered);
  await activateContext();
  await frames(page);
  const current = await state(page);
  assert.equal(current.context, id);
  assert.equal(
    current.globalGroup,
    remembered[id].globalGroup,
    'each context restores its own open or closed drawer',
  );
  assert.equal(
    current.authorGroup,
    id === 'road' ? remembered.road.authorGroup : '',
    'road authoring groups restore on Road and stay closed in Environment',
  );
  for (const key of ['tool', 'selectedPoint', 'selectedProp', 'selectionRange'])
    assert.deepEqual(
      current[key],
      previous[key],
      `context switching preserves ${key}`,
    );
  assert(
    current.preview.worldReady,
    'context switching does not rebuild the world',
  );
  assert.deepEqual(
    current.preview.camera,
    previous.preview.camera,
    'context switching does not reset the camera',
  );
  assert(
    await owner.evaluate(
      (el) =>
        el.isConnected &&
        el === document.querySelector('[data-editor-world] canvas'),
    ),
    'both contexts share the same owned 3D canvas',
  );
  assert.equal(
    await action(page, `context-${id}`).getAttribute('aria-pressed'),
    'true',
  );
  assert.equal(
    await action(page, 'open-environment').isVisible(),
    id === 'environment' && !current.globalGroup,
  );
  assert.equal(await action(page, 'draw-mode').isVisible(), id === 'road');
  for (const key of ['tab-generate', 'tab-pickups'])
    assert.equal(await action(page, key).isVisible(), id === 'road');
}

async function reviewWorlds(page) {
  assert(
    !responsive,
    'regional visual review is desktop-only until final implementation',
  );
  assert(
    evidence,
    'set VN_EVIDENCE for the requested regional visual captures',
  );
  await page.setViewportSize({ width: 1440, height: 900 });
  for (const fixture of [
    {
      length: 3000,
      type: 'circuit',
      road: 'flowing',
      character: 'reclaimed',
      seed: 7001,
      roadSeed: 42017,
      density: 0.9,
    },
    {
      length: 20000,
      type: 'downhill',
      road: 'technical',
      character: 'industrial',
      seed: 7002,
      roadSeed: 42017,
      density: 0.88,
    },
  ]) {
    await change(page, 'course-type', fixture.type);
    await section(page, 'generate');
    await change(page, 'length', fixture.length);
    await change(page, 'seed', fixture.roadSeed);
    await choose(page, `road-preset-${fixture.road}`);
    await choose(page, 'generate');
    await ready(page);
    await section(page, 'world');
    await choose(page, `preset-${fixture.character}`);
    await change(page, 'world-seed', fixture.seed);
    await choose(page, 'regenerate-environment');
    await ready(page);
    const doc = await save(page);
    assert.equal(
      doc.settings.density,
      fixture.density,
      'the selected character preserves its exact preset fullness',
    );
    valid(doc);
    if ((await state(page)).globalGroup) await choose(page, 'global-close');
    const prefix = `${fixture.length / 1000}km-${fixture.type}-${fixture.character}`;
    const submission = [];
    for (let frame = 0; frame < 5; frame++) {
      await choose(page, 'fit');
      await frames(page);
      submission.push((await state(page)).preview.frameMs);
    }
    await screenshot(page, `${prefix}-overview.png`);
    const metrics = (await state(page)).preview;
    console.log('WORLD REVIEW DIAGNOSTIC', {
      fixture,
      preset: metrics.preset,
      viewport: metrics.viewport,
      renderer: metrics.renderer,
      calls: metrics.calls,
      triangles: metrics.triangles,
      estimatedGpuBytes: metrics.estimatedGpuBytes,
      geometries: metrics.geometries,
      textures: metrics.textures,
      cpuSubmissionMs: submission,
      timing:
        'CPU submission under concurrent unit load; not final GPU/FPS performance',
    });
    for (const [label, index] of [
      ['start', 0],
      ['middle', Math.floor(doc.points.length / 2)],
      ['end', doc.points.length - 1],
    ]) {
      if (
        reviewOnly &&
        (fixture.length === 3000 ? label !== 'start' : label === 'start')
      )
        continue;
      await section(page, 'route');
      await change(page, 'point', index);
      await choose(page, 'tab-route');
      await choose(page, 'focus-selection');
      await frames(page);
      await screenshot(page, `${prefix}-${label}.png`);
    }
  }
}

async function waterClearanceCheck(page) {
  assert(!responsive, 'the bounded water-clearance regression is desktop-only');
  const fixture = generateDocument({
    generatorVersion: 3,
    seed: 42017,
    length: 3000,
    courseType: 'circuit',
    width: 64,
    jumpFrequency: 'none',
    crossovers: 0,
    elevation: 0,
  });
  fixture.name = name;
  fixture.autoCloseRoll = false;
  fixture.rolls = [];
  for (const point of fixture.points)
    Object.assign(point, { y: 8, bank: 0, roll: Math.PI / 2 });
  fixture.settings = {
    sceneryPreset: 'waterfront',
    density: 0.82,
    waterLevel: -50,
  };
  const lowWater = analyzeDocument(fixture),
    highWater = analyzeDocument({
      ...fixture,
      settings: { ...fixture.settings, waterLevel: -20 },
    });
  assert(lowWater.valid, lowWater.errors.join(' '));
  assert.equal(lowWater.minDeckHeight, -24);
  assert.equal(highWater.valid, false);
  assert.equal(highWater.primaryIssue.kind, 'clearance');
  await section(page, 'library');
  const chooser = page.waitForEvent('filechooser');
  await choose(page, 'import');
  await (
    await chooser
  ).setFiles({
    name: 'water-clearance.vntrack.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(fixture)),
  });
  await page.waitForFunction(() =>
    document
      .querySelector('[data-editor-status]')
      ?.textContent.includes('Track imported'),
  );
  await ready(page);
  const before = await save(page);
  assert.equal(before.settings.waterLevel, -50);
  assert(
    await action(page, 'test').isEnabled(),
    'the imported rotated deck clears the original low water',
  );
  await section(page, 'world');
  await choose(page, 'preset-reclaimed');
  assert(
    await action(page, 'test').isEnabled(),
    'a pending preset does not change the applied clearance',
  );
  assert.deepEqual(await save(page), before);
  await choose(page, 'regenerate-environment');
  await ready(page);
  const applied = await save(page),
    issue = (await state(page)).advisories.find(
      (issue) => issue.kind === 'clearance',
    );
  assert.equal(applied.settings.waterLevel, -20);
  assert.deepEqual(
    road(applied),
    road(before),
    'raising environment water preserves all authored road data',
  );
  assert.equal(
    await action(page, 'test').isEnabled(),
    true,
    'applied higher water warrants advice and still allows Practice',
  );
  assert.equal(issue?.kind, 'clearance');
  assert(
    Number.isInteger(issue.pointIndex),
    'the new water warning identifies an authored point',
  );
  assert.match(
    await page.locator('[data-editor-validation]').innerText(),
    /water|basin/i,
  );
  await choose(page, 'undo');
  await ready(page);
  assert(
    await action(page, 'test').isEnabled(),
    'Undo restores low water and clears the warning',
  );
  assert(
    !(await state(page)).advisories.some((issue) => issue.kind === 'clearance'),
  );
  assert.deepEqual(
    await save(page),
    before,
    'one Undo exactly restores the valid road/environment pair',
  );
  assert.deepEqual(errors, []);
  console.log(
    'PASS applied water-preset warning preserves Practice and Undo exactly restores the road',
  );
}

let page;
try {
  await context.routeWebSocket('**/*', () => {});
  await seedVerificationCareer(context);
  await context.addInitScript(
    ({ controller }) => {
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
      if (controller) {
        window.__contextsPad = {
          id: 'Workshop contexts verification controller',
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
          value: () => [window.__contextsPad],
        });
      }
    },
    { controller: !responsive },
  );
  page = await context.newPage();
  collectPageErrors(page, errors);
  await page.goto(new URL('?intro=0&editor=1', base).href);
  await page.locator('[data-editor-field="name"]').waitFor({ timeout: 90000 });
  await change(page, 'name', name);
  await ready(page);
  if (waterClearance) {
    await waterClearanceCheck(page);
  } else if (reviewOnly) {
    await reviewWorlds(page);
  } else {
    await section(page, 'generate');
    await change(page, 'length', 3000);
    assert.equal(
      await page
        .locator('[data-editor-field="seed"]')
        .getAttribute('aria-label'),
      'Road seed',
    );
    assert.equal(await action(page, 'generate').innerText(), 'Create road');
    assert.equal(
      await action(page, 'new-variation').innerText(),
      'Try another variation',
    );
    let current = await save(page);
    const initialEnvironment = surroundings(current);
    for (const preset of ROAD_PRESETS) {
      await section(page, 'generate');
      const card = action(page, `road-preset-${preset.id}`);
      assert.match(await card.innerText(), new RegExp(preset.label));
      const beforeSelection = await save(page);
      if (!responsive && ['flowing', 'technical'].includes(preset.id)) {
        await card.focus();
        if (preset.id === 'flowing') await page.keyboard.press('Enter');
        else await pad(page, 0);
      } else await choose(page, `road-preset-${preset.id}`);
      assert.equal(await card.getAttribute('aria-pressed'), 'true');
      const selected = await save(page);
      for (const key of ['points', 'jumps', 'pickups', 'props'])
        assert.deepEqual(
          selected[key],
          beforeSelection[key],
          `${preset.label} selection waits for Create road before replacing ${key}`,
        );
      assert.deepEqual(surroundings(selected), surroundings(beforeSelection));
      const create = await revealEditorAction(page, 'generate');
      if (!responsive && ['flowing', 'technical'].includes(preset.id)) {
        await create.focus();
        if (preset.id === 'flowing') await page.keyboard.press('Enter');
        else await pad(page, 0);
      } else await activate(create);
      await ready(page);
      const created = await save(page),
        expected = roadPresetOptions(preset.id, {
          courseType: 'circuit',
          length: 3000,
        });
      valid(created);
      assert(
        await action(page, 'test').isEnabled(),
        `${preset.label} creates a drivable road`,
      );
      assert.equal(created.courseType, 'circuit');
      assert.equal(created.generator.seed, current.generator.seed);
      assert.equal(created.id, current.id);
      assert.equal(created.name, name);
      for (const [key, value] of Object.entries(expected))
        if (!['generatorVersion', 'courseType'].includes(key))
          assert.equal(
            created.generator[key],
            value,
            `${preset.label} applies ${key}`,
          );
      assert.deepEqual(
        surroundings(created),
        initialEnvironment,
        `${preset.label} preserves the independent environment`,
      );
      if (preset.id === 'big-air')
        assert(created.jumps.length > 0, 'Big Air creates real jump gaps');
      if (preset.id === 'flowing') {
        await section(page, 'generate');
        await screenshot(page, 'road-starters.png');
      }
      current = created;
    }
    console.log(
      'PASS four road styles wait for explicit Create and preserve length, identity, seed and environment',
    );

    await change(page, 'course-type', 'downhill');
    await section(page, 'generate');
    assert(await action(page, 'road-preset-woven').isDisabled());
    assert.match(
      await action(page, 'road-preset-woven').getAttribute('title'),
      /Circuit preset/,
    );
    for (const preset of ROAD_PRESETS.filter((entry) => !entry.circuitOnly))
      assert(await action(page, `road-preset-${preset.id}`).isEnabled());
    await choose(page, 'undo');
    await ready(page);
    assert.deepEqual(
      await save(page),
      current,
      'course-type Undo restores the full prior starter',
    );
    await section(page, 'route');
    await change(page, 'point-bank', 3);
    await choose(page, 'height-mode');
    await section(page, 'route');
    await ready(page);
    current = await save(page);
    assert(
      current.points.some((point) => point.bank !== 0),
      'the preservation fixture includes an actual manual road angle edit',
    );
    for (const [width, height] of responsive
      ? [[390, 844]]
      : [
          [1440, 900],
          [1280, 800],
          [1100, 720],
        ]) {
      await page.setViewportSize({ width, height });
      await ready(page);
      await stableContext(page, 'environment');
      await stableContext(page, 'road');
      assert.deepEqual(
        await save(page),
        current,
        'changing contexts never edits the course',
      );
    }
    if (!responsive) {
      await page.setViewportSize({ width: 1440, height: 900 });
      await ready(page);
      await action(page, 'context-environment').focus();
      await stableContext(page, 'environment', () =>
        page.keyboard.press('Enter'),
      );
      await action(page, 'context-road').focus();
      await stableContext(page, 'road', () => pad(page, 0));
    }
    console.log(
      'PASS Road/Environment contexts preserve manual edits, active tool, selection, group, camera and 3D owner across layouts and native inputs',
    );

    await choose(page, 'tab-route');
    await section(page, 'world');
    const pendingOwner = await canvas(page).elementHandle(),
      pendingCamera = (await state(page)).preview.camera;
    const pendingOnly = async () => {
      assert(
        (await state(page)).preview.worldReady,
        'pending environment choices leave the applied world ready',
      );
      assert.deepEqual((await state(page)).preview.camera, pendingCamera);
      assert(
        await pendingOwner.evaluate(
          (el) => el === document.querySelector('[data-editor-world] canvas'),
        ),
      );
      assert.deepEqual(
        await save(page),
        current,
        'pending environment choices are not committed by Save',
      );
      assert(
        await page
          .getByText('New choices ready · Apply to preview', {
            exact: true,
          })
          .isVisible(),
      );
      assert.match(
        await page.locator('[data-editor-status]').innerText(),
        /environment choices are still pending/i,
      );
    };
    const families = await page
      .locator('[data-editor-field="biome"] option')
      .evaluateAll((options) =>
        options
          .filter((option) => !option.disabled)
          .map((option) => option.value),
      );
    const alternative = families.find((family) => family !== current.biome);
    if (alternative) {
      await change(page, 'biome', alternative);
      await pendingOnly();
      await change(page, 'biome', current.biome);
    }
    await choose(page, 'preset-industrial');
    await pendingOnly();
    await change(page, 'environment-density', 0.65);
    await pendingOnly();
    await change(page, 'world-seed', (current.environment.seed + 997) >>> 0);
    await pendingOnly();
    await page.locator('[data-editor-field="biome"]').scrollIntoViewIfNeeded();
    await screenshot(page, 'environment-pending.png');
    if (responsive) await choose(page, 'regenerate-environment');
    else {
      await (await revealEditorAction(page, 'regenerate-environment')).focus();
      await page.keyboard.press('Enter');
    }
    await ready(page);
    const applied = await save(page);
    assert.deepEqual(
      road(applied),
      road(current),
      'regenerating an environment preserves every road point/angle, jump, pickup and road preference',
    );
    assert.equal(
      applied.environment.seed,
      (current.environment.seed + 997) >>> 0,
    );
    assert.equal(applied.environment.version, 1);
    assert.equal(applied.environment.layoutVersion, ENVIRONMENT_LAYOUT_VERSION);
    assert.equal(applied.settings.sceneryPreset, 'industrial');
    assert.equal(applied.settings.density, 0.65);
    assert.equal(
      await page
        .getByText('New choices ready · Apply to preview', {
          exact: true,
        })
        .count(),
      0,
    );
    valid(applied);
    await choose(page, 'undo');
    await ready(page);
    assert.deepEqual(
      await save(page),
      current,
      'one Undo restores the entire applied road/environment pair',
    );
    await choose(page, 'redo');
    await ready(page);
    assert.deepEqual(await save(page), applied);
    await section(page, 'world');
    await page.locator('[data-editor-field="biome"]').scrollIntoViewIfNeeded();
    await screenshot(page, 'environment-applied.png');
    console.log(
      `PASS pending environment ${alternative ? 'family/' : ''}character/fullness/seed choices, scoped apply and exact Undo/Redo`,
    );

    if (responsive) await choose(page, 'new-world-seed');
    else {
      await (await revealEditorAction(page, 'new-world-seed')).focus();
      await pad(page, 0);
    }
    await ready(page);
    const environmentVariation = await save(page);
    assert.notEqual(
      environmentVariation.environment.seed,
      applied.environment.seed,
    );
    assert.deepEqual(road(environmentVariation), road(applied));
    assert.deepEqual(environmentVariation.settings, applied.settings);
    await section(page, 'generate');
    await choose(page, 'new-variation');
    await ready(page);
    const roadVariation = await save(page);
    assert.notEqual(
      roadVariation.generator.seed,
      environmentVariation.generator.seed,
    );
    assert.notDeepEqual(roadVariation.points, environmentVariation.points);
    assert.deepEqual(
      surroundings(roadVariation),
      surroundings(environmentVariation),
    );
    valid(roadVariation);
    for (const [command, expected] of [
      ['undo', environmentVariation],
      ['undo', applied],
      ['redo', environmentVariation],
      ['redo', roadVariation],
    ]) {
      await choose(page, command);
      await ready(page);
      assert.deepEqual(
        await save(page),
        expected,
        'both contexts use the same exact Undo/Redo history',
      );
    }
    console.log(
      'PASS independent road/environment variations and shared exact mixed Undo/Redo',
    );

    await page.reload();
    await page
      .locator('[data-editor-field="name"]')
      .waitFor({ timeout: 90000 });
    await section(page, 'library');
    await change(page, 'saved', roadVariation.id);
    await choose(page, 'load');
    await page.waitForFunction(() =>
      document
        .querySelector('[data-editor-status]')
        ?.textContent.includes('Track loaded'),
    );
    await ready(page);
    assert.deepEqual(
      await save(page),
      roadVariation,
      'public Save/Load restores resolved road, environment seed/version and settings together',
    );
    await section(page, 'world');
    assert.equal(
      Number(
        await page.locator('[data-editor-field="world-seed"]').inputValue(),
      ),
      roadVariation.environment.seed,
    );
    assert.equal(
      Number(
        await page
          .locator('[data-editor-field="environment-density"]')
          .inputValue(),
      ),
      roadVariation.settings.density,
    );
    await section(page, 'generate');
    assert.equal(
      Number(await page.locator('[data-editor-field="seed"]').inputValue()),
      roadVariation.generator.seed,
    );
    assert(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    );
    assert.deepEqual(errors, []);
    console.log(
      'PASS public save/reload preserves both independent contexts and native field values',
    );
    if (review) await reviewWorlds(page);
  }
  assert.deepEqual(errors, []);
} catch (error) {
  console.error(error.stack ?? error);
  if (page)
    console.error(
      'CONTEXT DIAGNOSTIC',
      await page
        .locator('[data-editor-status]')
        .innerText()
        .catch(() => ''),
      errors,
    );
  throw error;
} finally {
  clearTimeout(watchdog);
  await context.close();
  await browser.close();
}
