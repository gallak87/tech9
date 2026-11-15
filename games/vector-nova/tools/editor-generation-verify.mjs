import assert from 'node:assert/strict';
import {
  createCareerSlots,
  createMemoryStorage,
} from '../src/progression/careers.js';
import {
  analyzeDocument,
  generateDocument,
  GENERATOR_VERSION,
} from '../src/editor/document.js';
import {
  revealEditorField,
  revealEditorAction,
  revealEditorControl,
  openEditorSection,
} from './editor-controls.mjs';
import {
  launchVerificationBrowser,
  collectPageErrors,
} from './verification-browser.mjs';

// Exercise generation through public controls and compare the documents Save writes.
const base = process.env.VN_URL;
if (!base) throw new Error('Set VN_URL to the isolated editor server.');
const responsive = process.argv.includes('--responsive');
const crossoversOnly = process.argv.includes('--crossovers');
const storage = createMemoryStorage();
createCareerSlots({ storage: () => storage, now: () => 1 }).create(1);
const entries = Array.from({ length: storage.length }, (_, i) => {
  const key = storage.key(i);
  return [key, storage.getItem(key)];
});
const browser = await launchVerificationBrowser();
const context = await browser.newContext({
  viewport: responsive
    ? { width: 390, height: 844 }
    : { width: 1440, height: 900 },
  hasTouch: responsive,
});
const faults = [];
const name = 'Seeded generation verification';
const action = (page, value) =>
  page.locator(`[data-editor-action="${value}"]`).first();
const state = (page) =>
  page.evaluate(() => window.__VN_FRONTEND.getState().editor);
const click = async (locator) => {
  const control = await revealEditorControl(locator);
  return responsive ? control.tap() : control.click();
};
const watchdog = setTimeout(() => {
  console.error('Generation verification exceeded five minutes');
  process.exit(1);
}, 300000);

async function ready(page) {
  await page.waitForFunction(
    () => {
      const editor = window.__VN_FRONTEND.getState().editor;
      return !editor?.busy && editor.preview?.worldReady;
    },
    null,
    { timeout: 90000 },
  );
}
async function panel(page) {
  await openEditorSection(page, 'generate');
}

async function pad(page, button) {
  await page.evaluate(async (index) => {
    window.__generationPad.buttons[index] = { pressed: true, value: 1 };
    await new Promise((done) =>
      requestAnimationFrame(() => requestAnimationFrame(done)),
    );
    window.__generationPad.buttons[index] = { pressed: false, value: 0 };
    await new Promise((done) =>
      requestAnimationFrame(() => requestAnimationFrame(done)),
    );
  }, button);
}
async function change(page, key, value) {
  const field = await revealEditorField(page, key);
  if (await field.evaluate((el) => el.tagName === 'SELECT'))
    await field.selectOption(String(value));
  else {
    await field.fill(String(value));
    await field.press('Tab');
  }
}
async function save(page) {
  await click(action(page, 'save'));
  await page.waitForFunction(() =>
    document
      .querySelector('[data-editor-status]')
      ?.textContent.includes('Track saved'),
  );
  return page.evaluate(
    (trackName) =>
      Object.keys(localStorage)
        .filter((key) => key.startsWith('vector-nova.tracks.v1.'))
        .map((key) => JSON.parse(localStorage.getItem(key)).document)
        .find((doc) => doc.name === trackName),
    name,
  );
}
async function generate(page, options) {
  await panel(page);
  for (const [key, value] of Object.entries(options))
    await change(page, key, value);
  if (responsive) await (await revealEditorAction(page, 'generate')).tap();
  else {
    await (await revealEditorAction(page, 'generate')).focus();
    await page.keyboard.press('Enter');
  }
  await ready(page);
  assert(
    await action(page, 'test').isEnabled(),
    await page.locator('[data-editor-status]').innerText(),
  );
  const doc = await save(page);
  assert.equal(doc.generator.version, GENERATOR_VERSION);
  const expected = generateDocument({
    ...doc.generator,
    ...doc.settings,
    generatorVersion: GENERATOR_VERSION,
    courseType: doc.courseType,
    width: doc.width,
  });
  // Node and Chrome may round the fitted curves differently below a micrometre.
  // Regeneration within the browser and persistence remain bit-exact below.
  assert.equal(doc.points.length, expected.points.length);
  for (let i = 0; i < doc.points.length; i++) {
    assert.equal(doc.points[i].id, expected.points[i].id);
    for (const key of ['x', 'y', 'z', 'bank', 'roll'])
      assert(
        Math.abs(doc.points[i][key] - expected.points[i][key]) < 1e-6,
        `the running build matches current point ${i + 1}/${key}`,
      );
  }
  assert.equal(doc.jumps.length, expected.jumps.length);
  for (let i = 0; i < doc.jumps.length; i++) {
    for (const key of ['id', 'launchPointId', 'landingPointId'])
      assert.equal(doc.jumps[i][key], expected.jumps[i][key]);
    for (const key of ['start', 'end', 'receiving'])
      assert(
        Math.abs(doc.jumps[i][key] - expected.jumps[i][key]) <
          (key === 'receiving' ? 1e-6 : 1e-10),
      );
  }
  const report = analyzeDocument(doc);
  assert(report.valid, report.errors.join(' '));
  assert(Math.abs(report.length - doc.generator.length) < 0.05);
  return doc;
}
function footprint(doc) {
  const xs = doc.points.map((p) => p.x),
    zs = doc.points.map((p) => p.z);
  return {
    x: Math.max(...xs) - Math.min(...xs),
    z: Math.max(...zs) - Math.min(...zs),
  };
}

async function crossoverChecks(page) {
  await panel(page);
  const slider = await revealEditorField(page, 'crossovers');
  assert.equal(await slider.getAttribute('type'), 'range');
  assert.equal(await slider.getAttribute('min'), '0');
  assert.equal(await slider.getAttribute('max'), '1');
  assert.equal(await slider.getAttribute('step'), '0.05');
  assert.equal(await slider.getAttribute('aria-label'), 'Crossovers');
  assert(
    await slider.isEnabled(),
    'circuits expose the native crossover preference',
  );
  const canvas = page.locator('[data-editor-world] canvas'),
    ownedCanvas = await canvas.elementHandle(),
    camera = (await state(page)).preview.camera;
  const preferenceOnly = async () => {
    assert(
      (await state(page)).preview.worldReady,
      'a crossover preference never rebuilds the current world',
    );
    assert.deepEqual((await state(page)).preview.camera, camera);
    assert(
      await ownedCanvas.evaluate(
        (el) =>
          el.isConnected &&
          el === document.querySelector('[data-editor-world] canvas'),
      ),
    );
  };
  if (responsive) {
    const box = await slider.boundingBox();
    await slider.tap({ position: { x: box.width * 0.75, y: box.height / 2 } });
    assert(
      Number(await slider.inputValue()) > 0,
      'touch operates the native crossover slider',
    );
    await preferenceOnly();
  } else {
    await slider.focus();
    await page.keyboard.press('Home');
    await page.keyboard.press('ArrowRight');
    assert.equal(
      Number(await slider.inputValue()),
      0.05,
      'keyboard adjusts crossovers in native steps',
    );
    await preferenceOnly();
    await pad(page, 15);
    assert.equal(
      Number(await slider.inputValue()),
      0.1,
      'controller adjusts the native crossover slider',
    );
    await preferenceOnly();
  }
  const options = {
    'course-type': 'circuit',
    length: 20000,
    seed: 42,
    bendiness: 0.75,
    crossovers: 1,
    elevation: 0.6,
    'jump-frequency': 'normal',
    'jump-size': 'mixed',
  };
  const first = await generate(page, options);
  assert.equal(first.generator.crossovers, 1);
  const broad = generateDocument({
    ...first.generator,
    ...first.settings,
    generatorVersion: GENERATOR_VERSION,
    courseType: 'circuit',
    width: first.width,
    crossovers: 0,
  });
  assert.notDeepEqual(
    first.points,
    broad.points,
    'the Intertwined preference changes the generated physical road',
  );
  await click(action(page, 'view-map'));
  assert.equal((await state(page)).view, 'world');
  assert((await state(page)).mapOpen);
  assert(await canvas.isVisible());
  assert(
    await ownedCanvas.evaluate(
      (el) => el === document.querySelector('[data-editor-world] canvas'),
    ),
    'the woven Map overlays the same owned 3D preview',
  );
  assert.equal(
    await page.locator('[data-map-point]').count(),
    first.points.length,
  );
  await click(action(page, 'map-close'));
  await click(action(page, 'new-variation'));
  await ready(page);
  const variation = await save(page);
  assert.notEqual(variation.generator.seed, first.generator.seed);
  assert.notDeepEqual(variation.points, first.points);
  for (const key of [
    'length',
    'bendiness',
    'crossovers',
    'elevation',
    'jumpFrequency',
    'jumpSize',
  ])
    assert.equal(
      variation.generator[key],
      first.generator[key],
      `New variation retains ${key}`,
    );
  await click(action(page, 'undo'));
  await ready(page);
  assert.deepEqual(
    await save(page),
    first,
    'one Undo restores the complete woven seed and geometry',
  );
  await panel(page);
  await click(action(page, 'generate'));
  await ready(page);
  assert.deepEqual(
    await save(page),
    first,
    'the same crossover seed/options regenerate exactly',
  );
  await change(page, 'course-type', 'downhill');
  await panel(page);
  assert(
    await slider.isDisabled(),
    'Downhill disables its inapplicable crossover slider',
  );
  assert.equal(
    Number(await slider.inputValue()),
    1,
    'Downhill retains the Circuit preference',
  );
  await click(action(page, 'undo'));
  await ready(page);
  assert.deepEqual(await save(page), first);
  await panel(page);
  assert(await slider.isEnabled());
  console.log(
    'PASS native Crossovers input, deferred generation, Circuit/Downhill availability, woven variation/regeneration and exact Undo',
  );

  await page.reload();
  await page.locator('[data-editor-field="name"]').waitFor({ timeout: 90000 });
  await click(action(page, 'tab-library'));
  await page.locator('[data-editor-field="saved"]').selectOption(first.id);
  await click(action(page, 'load'));
  await page.waitForFunction(() =>
    document
      .querySelector('[data-editor-status]')
      ?.textContent.includes('Track loaded'),
  );
  await ready(page);
  assert.deepEqual(
    await save(page),
    first,
    'public Save/Load preserves the woven road and crossover preference',
  );
  await panel(page);
  assert.equal(
    Number(await page.locator('[data-editor-field="crossovers"]').inputValue()),
    1,
  );
  assert(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  );
  assert.deepEqual(faults, []);
  console.log(
    'PASS woven geometry and crossover preference survive public save/reload with a live 3D preview',
  );
}

try {
  await context.routeWebSocket('**/*', () => {});
  await context.addInitScript(
    ({ seed, controller }) => {
      for (const [key, value] of seed) localStorage.setItem(key, value);
      localStorage.setItem('startUpMusicOn', 'false');
      localStorage.setItem(
        'vector-nova.settings',
        JSON.stringify({ quality: 'low', volume: 0, reducedMotion: true }),
      );
      if (controller) {
        window.__generationPad = {
          id: 'Generation verification pad',
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
          value: () => [window.__generationPad],
        });
      }
    },
    { seed: entries, controller: !responsive },
  );
  const page = await context.newPage();
  collectPageErrors(page, faults);
  await page.goto(new URL('?intro=0&editor=1', base).href);
  await page.locator('[data-editor-field="name"]').waitFor({ timeout: 90000 });
  await change(page, 'name', name);
  await ready(page);
  if (crossoversOnly) {
    await crossoverChecks(page);
  } else {
    await panel(page);
    await change(page, 'bendiness', 0.75);
    assert(
      (await state(page)).preview.worldReady,
      'changing a generation preference keeps the current world ready',
    );
    if (!responsive) {
      const frequency = page.locator('[data-editor-field="jump-frequency"]');
      const size = page.locator('[data-editor-field="jump-size"]');
      await (await revealEditorField(page, 'length')).focus();
      const reached = new Set();
      for (let i = 0; i < 65 && reached.size < 6; i++) {
        const key = await page.evaluate(
          () => document.activeElement.dataset.editorField,
        );
        if (
          [
            'length',
            'bendiness',
            'crossovers',
            'elevation',
            'jump-frequency',
            'jump-size',
          ].includes(key)
        )
          reached.add(key);
        if (reached.size < 6) await page.keyboard.press('Tab');
      }
      assert.equal(
        reached.size,
        6,
        'Tab reaches every native generation preference',
      );
      await frequency.focus();
      await pad(page, 14);
      await pad(page, 14);
      assert.equal(await frequency.inputValue(), 'none');
      assert(await size.isDisabled());
      await pad(page, 15);
      assert.equal(
        await frequency.inputValue(),
        'few',
        'controller adjusts native jump frequency',
      );
      await size.focus();
      await pad(page, 15);
      assert.equal(
        await size.inputValue(),
        'large',
        'controller adjusts native jump size',
      );
      await change(page, 'jump-frequency', 'normal');
      await change(page, 'jump-size', 'mixed');
      console.log(
        'PASS keyboard navigation, controller preferences and disabled no-jump size',
      );
    }
    for (const field of [
      'length',
      'bendiness',
      'crossovers',
      'elevation',
      'jump-frequency',
      'jump-size',
    ])
      assert(
        await page.locator(`[data-editor-field="${field}"]`).isVisible(),
        `${field} is directly available`,
      );
    for (const name of ['generate', 'new-variation']) {
      await (await revealEditorAction(page, name)).scrollIntoViewIfNeeded();
      assert(
        await action(page, name).evaluate((el) => {
          const r = el.getBoundingClientRect();
          return (
            r.x >= 0 &&
            r.right <= innerWidth &&
            r.y >= 0 &&
            r.bottom <= innerHeight &&
            el.contains(
              document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2),
            )
          );
        }),
        `${name} is reachable and uncovered`,
      );
    }
    let doc = await generate(page, {
      'course-type': 'circuit',
      length: 20000,
      seed: 42,
      bendiness: 0.75,
      elevation: 0.6,
      'jump-frequency': 'normal',
      'jump-size': 'mixed',
    });
    const first = doc;
    assert.equal(
      (await state(page)).view,
      'world',
      'generation keeps the owned 3D preview active',
    );
    await click(action(page, 'view-map'));
    const points = await page.locator('[data-map-point]').evaluateAll((nodes) =>
      nodes.map((node) => {
        const m = node.transform.baseVal.consolidate().matrix;
        return [m.e, m.f];
      }),
    );
    assert(
      points.length === doc.points.length &&
        points.every(([x, y]) => x > 0 && x < 1000 && y > 0 && y < 680),
      'the entire new route fits Map',
    );
    await click(action(page, 'new-variation'));
    await ready(page);
    assert(
      await page.evaluate(
        () =>
          ['new-variation', 'tab-generate'].includes(
            document.activeElement.dataset.editorAction,
          ) && !document.activeElement.closest('[hidden]'),
      ),
      'New variation returns focus to a visible generation control',
    );
    doc = await save(page);
    assert.notEqual(doc.generator.seed, first.generator.seed);
    assert.notDeepEqual(
      doc.points,
      first.points,
      'New variation changes the generated road',
    );
    for (const key of [
      'length',
      'bendiness',
      'crossovers',
      'elevation',
      'jumpFrequency',
      'jumpSize',
    ])
      assert.equal(
        doc.generator[key],
        first.generator[key],
        `New variation retains ${key}`,
      );
    assert.equal(doc.id, first.id);
    assert.equal(doc.name, first.name);
    await click(action(page, 'undo'));
    assert.deepEqual(
      await save(page),
      first,
      'one Undo restores the complete prior seed and road',
    );
    await panel(page);
    await click(action(page, 'generate'));
    await ready(page);
    assert.deepEqual(
      await save(page),
      first,
      'same seed and options reproduce the exact saved track',
    );
    console.log(
      'PASS visible generation controls, 20 km seeded route, New variation, exact regeneration and Undo',
      footprint(first),
    );

    doc = await generate(page, {
      length: 5000,
      seed: 2027,
      bendiness: 0.2,
      elevation: 0,
      'jump-frequency': 'none',
    });
    assert.equal(doc.jumps.length, 0);
    assert(
      Math.max(...doc.points.map((p) => p.y)) -
        Math.min(...doc.points.map((p) => p.y)) <
        0.01,
      'zero vertical variation gives a flat jump-free course',
    );
    await panel(page);
    assert(await page.locator('[data-editor-field="jump-size"]').isDisabled());
    doc = await generate(page, {
      elevation: 0.9,
      bendiness: 0.9,
      'jump-frequency': 'many',
      'jump-size': 'large',
      length: 10000,
    });
    assert(doc.jumps.length > 0);
    assert(
      Math.max(...doc.points.map((p) => p.y)) -
        Math.min(...doc.points.map((p) => p.y)) >
        20,
    );
    console.log(
      'PASS flat/no-jump and high-curvature/elevation/large-jump generation',
    );

    doc = await generate(page, {
      'course-type': 'downhill',
      length: 20000,
      seed: 42017,
      'jump-frequency': 'normal',
      'jump-size': 'mixed',
    });
    assert.equal(doc.jumps.length, 4);
    assert.equal(doc.courseType, 'downhill');
    if ((await state(page)).mapOpen) await click(action(page, 'map-close'));
    await ready(page);
    const preview = (await state(page)).preview;
    console.log('PASS generated 20 km descent and actual owned 3D preview', {
      preset: preview.preset,
      calls: preview.calls,
      triangles: preview.triangles,
      estimatedGpuBytes: preview.estimatedGpuBytes,
      viewport: preview.viewport,
    });
    const expected = await save(page);
    await page.reload();
    await page
      .locator('[data-editor-field="name"]')
      .waitFor({ timeout: 90000 });
    await click(action(page, 'tab-library'));
    await page.locator('[data-editor-field="saved"]').selectOption(expected.id);
    await click(action(page, 'load'));
    await page.waitForFunction(() =>
      document
        .querySelector('[data-editor-status]')
        ?.textContent.includes('Track loaded'),
    );
    assert.deepEqual(
      await save(page),
      expected,
      'all v3 options and resolved geometry survive reload',
    );
    await panel(page);
    for (const [key, value] of [
      ['jump-frequency', expected.generator.jumpFrequency],
      ['jump-size', expected.generator.jumpSize],
    ])
      assert.equal(
        await page.locator(`[data-editor-field="${key}"]`).inputValue(),
        value,
      );
    assert(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      'the editor fits the viewport',
    );
    console.log(
      'PASS generation options, world settings and actual geometry persist through public Save/Load',
    );
  }
  assert.deepEqual(faults, []);
} finally {
  clearTimeout(watchdog);
  await context.close();
  await browser.close();
}
