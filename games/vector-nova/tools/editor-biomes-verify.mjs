import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { EDITOR_BIOMES } from '../src/editor/biomes.js';
import { generateDocument } from '../src/editor/document.js';
import { seedVerificationCareer } from './verification-career.mjs';
import {
  openEditorSection,
  revealEditorAction,
  revealEditorField,
} from './editor-controls.mjs';
import { launchVerificationBrowser } from './verification-browser.mjs';

// Public native picker/apply/Save controls, with a fixed resolved road in every
// family. --biomes=id,id targets an asset fix; add --legacy to include migration.
const base = process.env.VN_URL;
if (!base) throw new Error('Set VN_URL to the isolated Workshop server.');
const responsive = process.argv.includes('--responsive');
const subset = process.argv
  .find((arg) => arg.startsWith('--biomes='))
  ?.slice(9)
  .split(',');
const ids = subset ?? EDITOR_BIOMES.map((entry) => entry.id);
assert.equal(new Set(ids).size, ids.length);
for (const id of ids)
  assert(
    EDITOR_BIOMES.some((entry) => entry.id === id),
    `unknown family ${id}`,
  );
const evidence = process.env.VN_EVIDENCE
  ? resolve(process.env.VN_EVIDENCE)
  : null;
const name = 'Whole-course biome verification';
const environmentSeed = 65003;
const browser = await launchVerificationBrowser();
const context = await browser.newContext({
  viewport: responsive
    ? { width: 390, height: 844 }
    : { width: 1440, height: 900 },
  hasTouch: responsive,
});
const faults = [];
let page,
  currentFamily = 'initial Nightweir',
  closing = false,
  rejectFatal;
const fatal = new Promise((_, reject) => {
  rejectFatal = reject;
});
void fatal.catch(() => {});
const fail = (message) => {
  if (closing) return;
  const detail = `${currentFamily}: ${message}`;
  faults.push(detail);
  console.error('BIOME FAILURE', detail);
  rejectFatal(new Error(detail));
};
const watchdog = setTimeout(() => {
  process.exitCode = 1;
  fail('whole-course biome verification exceeded eight minutes');
  void browser.close().catch(() => {});
}, 480000);
const action = (id) => page.locator(`[data-editor-action="${id}"]`);
const choose = async (id) => {
  const control = await revealEditorAction(page, id);
  return responsive ? control.tap() : control.click();
};
const state = () =>
  page.evaluate(() => {
    const editor = window.__VN_FRONTEND.getState().editor,
      preview = editor?.preview;
    return {
      context: editor?.context,
      globalGroup: editor?.globalGroup,
      authorGroup: editor?.authorGroup,
      tool: editor?.tool,
      mapOpen: editor?.mapOpen,
      busy: editor?.busy,
      preview: preview
        ? {
            biome: preview.biome,
            worldReady: preview.worldReady,
            camera: preview.camera,
            calls: preview.calls,
            triangles: preview.triangles,
            estimatedGpuBytes: preview.estimatedGpuBytes,
            environment: preview.environment?.stats ?? preview.environment,
          }
        : null,
    };
  });
async function frames() {
  await page.evaluate(
    () =>
      new Promise((done) =>
        requestAnimationFrame(() => requestAnimationFrame(done)),
      ),
  );
}
async function ready(biome) {
  await Promise.race([
    page.waitForFunction(
      (expected) => {
        const editor = window.__VN_FRONTEND.getState().editor;
        return (
          !editor?.busy &&
          editor.preview?.worldReady &&
          editor.preview.biome === expected
        );
      },
      biome,
      { timeout: 90000 },
    ),
    fatal,
  ]);
  await frames();
  assert.deepEqual(faults, []);
}
async function section(id) {
  if (id === 'world' && (await state()).context !== 'environment')
    await choose('context-environment');
  if (id === 'generate' && (await state()).context !== 'road')
    await choose('context-road');
  return openEditorSection(page, id);
}
async function change(id, value) {
  const field = await revealEditorField(page, id);
  if (await field.evaluate((el) => el.tagName === 'SELECT'))
    await field.selectOption(String(value));
  else {
    await field.fill(String(value));
    await field.press('Tab');
  }
}
async function save(trackName = name) {
  await choose('save');
  await page.waitForFunction(() =>
    document
      .querySelector('[data-editor-status]')
      ?.textContent.includes('Track saved'),
  );
  const doc = await page.evaluate(
    (label) =>
      Object.keys(localStorage)
        .filter((key) => key.startsWith('vector-nova.tracks.v1.'))
        .map((key) => JSON.parse(localStorage.getItem(key)).document)
        .find((value) => value.name === label),
    trackName,
  );
  assert(doc, 'public Save stores the applied course');
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
async function pad(button) {
  await page.evaluate(async (index) => {
    window.__biomesPad.buttons[index] = { pressed: true, value: 1 };
    await new Promise((done) =>
      requestAnimationFrame(() => requestAnimationFrame(done)),
    );
    window.__biomesPad.buttons[index] = { pressed: false, value: 0 };
    await new Promise((done) =>
      requestAnimationFrame(() => requestAnimationFrame(done)),
    );
  }, button);
}
async function capture(id, kind) {
  if (!evidence) return;
  await mkdir(evidence, { recursive: true });
  await frames();
  await page.screenshot({ path: resolve(evidence, `${id}-${kind}.png`) });
}
async function applyFamily(id, previous, canonicalRoad) {
  currentFamily = id;
  const family = EDITOR_BIOMES.find((entry) => entry.id === id),
    preset = family.presets[0];
  await section('world');
  const camera = (await state()).preview.camera;
  const selector = await revealEditorField(page, 'biome');
  if (id === 'halcyon' && (await selector.inputValue()) === 'nightweir') {
    await selector.focus();
    await pad(15);
    assert.equal(
      await selector.inputValue(),
      id,
      'controller changes the native pending family selector',
    );
  } else await selector.selectOption(id);
  await change('world-seed', environmentSeed);
  assert(
    (await state()).preview.worldReady,
    'pending family/seed do not rebuild the applied world',
  );
  assert.deepEqual((await state()).preview.camera, camera);
  assert.deepEqual(
    await save(),
    previous,
    'Save cannot silently apply a pending family',
  );
  assert(
    await page
      .getByText('Environment changes pending · Regenerate to apply', {
        exact: true,
      })
      .isVisible(),
  );
  if (id === 'nightweir') {
    await pad(1);
    assert.equal((await state()).globalGroup, '');
    assert(
      await action('tab-world').evaluate((el) => el === document.activeElement),
      'controller Back closes the drawer and returns visible native focus',
    );
    await section('world');
  }
  const regenerate = await revealEditorAction(page, 'regenerate-environment');
  if (id === 'nightweir') {
    await regenerate.focus();
    await page.keyboard.press('Enter');
  } else if (id === 'halcyon') {
    await regenerate.focus();
    await pad(0);
  } else await regenerate.click();
  await ready(id);
  const applied = await save();
  assert.deepEqual(
    road(applied),
    canonicalRoad,
    `${id}: whole-family changes preserve all points/angles, jumps, pickups and road preferences`,
  );
  assert.equal(applied.biome, id);
  assert.deepEqual(applied.environment, {
    version: 1,
    seed: environmentSeed,
    layoutVersion: 1,
  });
  assert.deepEqual(applied.settings, {
    sceneryPreset: preset.id,
    density: preset.density,
    waterLevel: preset.waterLevel,
  });
  const metrics = (await state()).preview;
  assert.equal(metrics.biome, id);
  assert(
    metrics.environment?.assemblies > 0,
    `${id}: the actual world reports rendered regional assemblies`,
  );
  assert(metrics.calls > 0 && metrics.triangles > 0);
  assert(
    await action('test').isEnabled(),
    `${id}: the applied course remains drivable`,
  );

  await section('generate');
  await choose('new-variation');
  await ready(id);
  const variation = await save();
  assert.notEqual(variation.generator.seed, applied.generator.seed);
  assert.notDeepEqual(variation.points, applied.points);
  assert.deepEqual(
    surroundings(variation),
    surroundings(applied),
    `${id}: a road reroll preserves the chosen whole-course world`,
  );
  await choose('undo');
  await ready(id);
  assert.deepEqual(
    await save(),
    applied,
    `${id}: one Undo exactly restores the common road and applied world`,
  );
  if ((await state()).globalGroup) await choose('global-close');
  await choose('fit');
  await frames();
  await capture(id, 'overview');
  await section('route');
  await change('point', Math.floor(applied.points.length / 3));
  await choose('tab-route');
  await choose('focus-selection');
  await frames();
  await capture(id, 'near');
  console.log('PASS whole-course biome', id, {
    calls: metrics.calls,
    triangles: metrics.triangles,
    estimatedGpuBytes: metrics.estimatedGpuBytes,
    assemblies: metrics.environment.assemblies,
  });
  return applied;
}
async function importTrack(document) {
  await section('library');
  const chooser = page.waitForEvent('filechooser');
  await choose('import');
  await (
    await chooser
  ).setFiles({
    name: `${document.id}.vntrack.json`,
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(document)),
  });
  await page.waitForFunction(() =>
    document
      .querySelector('[data-editor-status]')
      ?.textContent.includes('Track imported'),
  );
  await ready(document.biome);
}
async function loadAfterReload(expected) {
  await page.reload();
  await page.locator('[data-editor-field="name"]').waitFor({ timeout: 90000 });
  await section('library');
  await change('saved', expected.id);
  await choose('load');
  await page.waitForFunction(() =>
    document
      .querySelector('[data-editor-status]')
      ?.textContent.includes('Track loaded'),
  );
  await ready(expected.biome);
  assert.deepEqual(
    await save(expected.name),
    expected,
    'public reload/Load/Save preserves the complete canonical course',
  );
}

async function responsiveFlow(common, canonicalRoad) {
  let previous = common;
  const fits = async (control, label) => {
    await control.scrollIntoViewIfNeeded();
    assert(
      await control.evaluate((el) => {
        const r = el.getBoundingClientRect();
        return (
          r.left >= 0 &&
          r.top >= 0 &&
          r.right <= innerWidth + 1 &&
          r.bottom <= innerHeight + 1 &&
          el.contains(
            document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2),
          )
        );
      }),
      `${label} fits the touch viewport and is uncovered`,
    );
  };
  for (const [width, height, families] of [
    [390, 844, ['vesper-forest']],
    [844, 390, ['nacre', 'glasswake']],
  ]) {
    await page.setViewportSize({ width, height });
    await ready(previous.biome);
    for (const id of families) {
      currentFamily = `${width}x${height}/${id}`;
      await section('world');
      const picker = await revealEditorField(page, 'biome');
      await fits(picker, 'native whole-family picker');
      await picker.selectOption(id);
      await change('world-seed', environmentSeed);
      assert((await state()).preview.worldReady);
      assert.deepEqual(
        await save(),
        previous,
        'touch selection stays pending until explicit Apply',
      );
      await fits(
        await revealEditorAction(page, 'regenerate-environment'),
        'Regenerate environment',
      );
      await choose('regenerate-environment');
      await ready(id);
      const applied = await save();
      assert.equal(applied.biome, id);
      assert.equal(applied.environment.seed, environmentSeed);
      assert.deepEqual(
        road(applied),
        canonicalRoad,
        'touch family Apply/Save preserves the complete authored road',
      );
      const camera = (await state()).preview.camera;
      await choose('context-road');
      assert.equal((await state()).context, 'road');
      await choose('context-environment');
      assert.equal((await state()).context, 'environment');
      assert.deepEqual((await state()).preview.camera, camera);
      if ((await state()).globalGroup) await choose('global-close');
      await choose('view-map');
      assert((await state()).mapOpen);
      assert(await page.locator('[data-editor-world] canvas').isVisible());
      await fits(await revealEditorAction(page, 'map-close'), 'Map close');
      await choose('map-close');
      assert.equal((await state()).mapOpen, false);
      assert.equal((await state()).preview.biome, id);
      assert.equal(
        await page
          .locator('[data-editor-authoring] [data-editor-tool]')
          .count(),
        3,
      );
      assert.equal(await page.locator('[data-editor-authoring]').count(), 1);
      await fits(action('save'), 'global Save');
      assert(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      );
      await capture(`${id}-${width}x${height}`, 'touch');
      console.log(
        'PASS responsive native Road/environment Apply/Save/Map/strip',
        width,
        height,
        id,
      );
      previous = applied;
    }
  }
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
    window.__biomesPad = {
      id: 'Whole-course biome verification controller',
      index: 0,
      connected: true,
      mapping: 'standard',
      axes: [0, 0, 0, 0],
      buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })),
    };
    Object.defineProperty(navigator, 'getGamepads', {
      configurable: true,
      value: () => [window.__biomesPad],
    });
  });
  page = await context.newPage();
  page.setDefaultTimeout(20000);
  page.on('pageerror', (error) => fail(error.message));
  page.on('console', (message) => {
    if (
      message.type() === 'error' ||
      /THREE\.WebGLProgram|Shader Error|VALIDATE_STATUS|GL_INVALID|WebGL.*(?:error|INVALID_)/i.test(
        message.text(),
      )
    )
      fail(message.text());
  });
  page.on('response', (response) => {
    if (
      response.status() >= 400 &&
      ['image', 'fetch', 'script', 'stylesheet', 'font'].includes(
        response.request().resourceType(),
      )
    )
      fail(`${response.status()} ${response.url()}`);
  });
  page.on('requestfailed', (request) => {
    const error = request.failure()?.errorText;
    if (error !== 'net::ERR_ABORTED') fail(`${error} ${request.url()}`);
  });
  await page.goto(new URL('?intro=0&editor=1', base).href);
  await page.locator('[data-editor-field="name"]').waitFor({ timeout: 90000 });
  await change('name', name);
  await ready('nightweir');
  await section('generate');
  await change('length', 3000);
  await change('seed', 42017);
  await choose('road-preset-flowing');
  await ready('nightweir');
  const common = await save();
  assert(
    common.jumps.length > 0 && common.pickups.devices.length > 0,
    'common road exercises anchored jumps and actual pickups',
  );
  const canonicalRoad = road(common);
  if (responsive) {
    await responsiveFlow(common, canonicalRoad);
  } else {
    let current = common;
    await section('world');
    const available = await page
      .locator('[data-editor-field="biome"] option')
      .evaluateAll((options) =>
        options
          .filter((option) => !option.disabled)
          .map((option) => option.value),
      );
    assert.deepEqual(
      available,
      EDITOR_BIOMES.map((entry) => entry.id),
      'native picker exposes every registered functional whole-course family',
    );
    for (const id of ids)
      current = await applyFamily(id, current, canonicalRoad);
    if (current.biome !== 'nightweir') {
      await section('world');
      await change('biome', 'nightweir');
      await change('world-seed', environmentSeed);
      await choose('regenerate-environment');
      await ready('nightweir');
      assert.deepEqual(road(await save()), canonicalRoad);
    }
    await choose('view-map');
    assert((await state()).mapOpen);
    assert(await page.locator('[data-editor-world] canvas').isVisible());
    await pad(1);
    assert.equal((await state()).mapOpen, false);
    assert(
      await action('view-map').evaluate((el) => el === document.activeElement),
    );
    assert.equal(
      await page.locator('[data-editor-authoring] [data-editor-tool]').count(),
      3,
    );
    assert.equal(await page.locator('[data-editor-authoring]').count(), 1);
    console.log(
      'PASS return to Nightweir, Map/controller Back and intact compact authoring strip',
    );

    if (!subset || process.argv.includes('--legacy')) {
      for (const generatorVersion of [1, 2]) {
        currentFamily = `legacy v${generatorVersion}`;
        const legacy = generateDocument({
          generatorVersion,
          seed: 42,
          length: 3000,
          courseType: 'circuit',
        });
        legacy.id = `biome-legacy-v${generatorVersion}`;
        legacy.name = `Whole-course legacy v${generatorVersion}`;
        delete legacy.environment;
        await importTrack(legacy);
        const canonical = await save(legacy.name);
        assert.deepEqual(canonical.points, legacy.points);
        assert.equal(canonical.generator.version, generatorVersion);
        assert.deepEqual(canonical.environment, {
          version: 1,
          seed: legacy.generator.seed,
          layoutVersion: 0,
        });
        await loadAfterReload(canonical);
        console.log('PASS legacy import/Save/reload/Load', generatorVersion);
      }
    }
    assert.deepEqual(faults, []);
    console.log(
      `PASS ${ids.length} selected whole-course biome families without asset, runtime or shader errors`,
    );
  }
  assert.deepEqual(faults, []);
} catch (error) {
  console.error(
    'BIOME DIAGNOSTIC',
    currentFamily,
    await page
      ?.locator('[data-editor-status]')
      .innerText()
      .catch(() => ''),
    faults,
  );
  throw error;
} finally {
  closing = true;
  clearTimeout(watchdog);
  await context.close();
  await browser.close();
}
