import assert from 'node:assert/strict';
import { analyzeDocument, generateDocument } from '../src/editor/document.js';
import { applyBiomeSpan } from '../src/editor/biome-spans.js';
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

// GPU fixture regression: import resolved courses through the public file
// picker, then inspect actual rendered road materials through read-only scene
// diagnostics. This does not claim hands-on course creation or a full lap.
const base = process.env.VN_URL;
if (!base) throw new Error('Set VN_URL to an isolated full-edition build.');
const asphaltURL =
  /\/assets\/levels\/halcyon\/asphalt\/(?:color|normal|arm)\.ktx2(?:\?|$)/;
const browser = await launchVerificationBrowser();
const watchdog = setTimeout(() => {
  void browser.close();
  process.exitCode = 1;
}, 180000);
const state = (page) =>
  page.evaluate(() => window.__VN_FRONTEND.getState().editor);
const frames = (page) =>
  page.evaluate(
    () =>
      new Promise((done) =>
        requestAnimationFrame(() => requestAnimationFrame(done)),
      ),
  );
const choose = async (page, action) =>
  (await revealEditorAction(page, action)).click();
async function ready(page) {
  await page.waitForFunction(
    () => {
      const editor = window.__VN_FRONTEND?.getState().editor;
      return editor && !editor.busy && editor.preview?.worldReady;
    },
    null,
    { timeout: 60000 },
  );
  await frames(page);
}

function fixture(biome, spanBiome, seed) {
  const original = generateDocument({
    biome,
    seed,
    length: 3000,
    density: 0.5,
    jumpFrequency: 'none',
    banking: 0,
    seedJumps: false,
  });
  original.name = `Surface regression ${biome}`;
  const result = applyBiomeSpan(original, {
    startIndex: Math.max(1, Math.floor(original.points.length * 0.2)),
    endIndex: Math.ceil(original.points.length * 0.45),
    biome: spanBiome,
  });
  assert(
    analyzeDocument(result).valid,
    'the imported fixture is a valid normal generated road',
  );
  assert.equal(result.jumps.length, 0);
  return result;
}

async function importFixture(page, doc) {
  await openEditorSection(page, 'library');
  const chooser = page.waitForEvent('filechooser');
  await choose(page, 'import');
  await (
    await chooser
  ).setFiles({
    name: 'road-finish-regression.vntrack.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(doc)),
  });
  await page.waitForFunction(
    (count) => window.__VN_FRONTEND.getState().editor?.points === count,
    doc.points.length,
  );
  await ready(page);
}

async function savedDocument(page, name) {
  await choose(page, 'save');
  await page.waitForFunction(() =>
    document
      .querySelector('[data-editor-status]')
      ?.textContent.includes('Track saved'),
  );
  return page.evaluate(
    (name) =>
      Object.keys(localStorage)
        .filter((key) => key.startsWith('vector-nova.tracks.v1.'))
        .map((key) => JSON.parse(localStorage.getItem(key)).document)
        .find((doc) => doc.name === name),
    name,
  );
}

async function cheapDrag(page, doc) {
  const point = await revealEditorField(page, 'point');
  await point.selectOption('3');
  await choose(page, 'focus-selection');
  if ((await state(page)).authorGroup) await choose(page, 'tab-route');
  await frames(page);
  const canvas = page.locator('[data-editor-world] canvas');
  const box = await canvas.boundingBox();
  const handle = (await state(page)).preview.interaction.points.find(
    (p) => p.index === 3 && p.visible,
  );
  assert(box && handle, 'the selected point has a visible native 3D handle');
  await page.mouse.move(box.x + handle.x, box.y + handle.y);
  await page.mouse.down();
  await frames(page);
  const baseline = (await state(page)).preview.guideRouteBuilds;
  assert.equal(
    typeof baseline,
    'number',
    'guide preparations have a read-only counter',
  );
  for (let step = 1; step <= 4; step++) {
    await page.mouse.move(
      box.x + handle.x + step * 7,
      box.y + handle.y + step * 2,
    );
    await frames(page);
    const current = (await state(page)).preview;
    assert.equal(
      current.interaction.dragging,
      true,
      'the native point drag remains active',
    );
    assert.equal(
      current.guideRouteBuilds,
      baseline,
      'held point movement does not prepare full-route guides',
    );
  }
  await page.mouse.up();
  await ready(page);
  const moved = await savedDocument(page, doc.name);
  assert.notDeepEqual(
    moved.points,
    doc.points,
    'the native drag changes the actual road points',
  );
  await choose(page, 'undo');
  await ready(page);
  assert.deepEqual(
    await savedDocument(page, doc.name),
    doc,
    'one Undo restores the exact imported course, including its biome span',
  );
  console.log(
    'PASS native 3D drag keeps guide-route preparations constant; one Undo restores the course',
  );
}

async function actualRoadMaterials(page) {
  return page.evaluate(() => {
    const { scene } = window.__VN.getScene();
    const textures = (texture) =>
      texture
        ? {
            uuid: texture.uuid,
            width: texture.image?.width ?? 0,
            height: texture.image?.height ?? 0,
            renderTarget: texture.isRenderTargetTexture === true,
          }
        : null;
    const materials = new Map();
    scene.traverse((mesh) => {
      if (
        !mesh.isMesh ||
        !mesh.userData.drivingSurface ||
        !mesh.name.endsWith('section driving deck')
      )
        return;
      const biome = mesh.name.startsWith('Nightweir ')
        ? 'nightweir'
        : mesh.name.startsWith('Vesper Forest ')
          ? 'vesper-forest'
          : null;
      if (!biome) return;
      for (const material of [mesh.material].flat())
        materials.set(material.uuid, {
          biome,
          mesh: mesh.name,
          material: material.name,
          uuid: material.uuid,
          map: textures(material.map),
          normalMap: textures(material.normalMap),
          roughnessMap: textures(material.roughnessMap),
          aoMap: textures(material.aoMap),
          envMap: textures(material.envMap),
          envMapIntensity: material.envMapIntensity,
        });
    });
    return {
      environment: scene.environment?.uuid ?? null,
      materials: [...materials.values()].sort((a, b) =>
        a.biome.localeCompare(b.biome),
      ),
    };
  });
}

function assertMaterials(snapshot) {
  const asphalt = snapshot.materials.filter(
    (material) => material.biome === 'nightweir',
  );
  const vesper = snapshot.materials.filter(
    (material) => material.biome === 'vesper-forest',
  );
  assert(
    asphalt.length && vesper.length,
    'both biome finishes exist on actual rendered driving decks',
  );
  for (const material of asphalt) {
    assert.match(
      material.material,
      /fine asphalt/,
      'Nightweir uses its real asphalt material',
    );
    for (const key of ['map', 'normalMap', 'roughnessMap', 'aoMap']) {
      assert(
        material[key]?.width > 0 && material[key]?.height > 0,
        `${material.mesh} ${key} has a loaded texture image at readiness`,
      );
    }
    assert(
      material.envMap?.renderTarget &&
        material.envMap.width > 0 &&
        material.envMap.height > 0,
      'Nightweir asphalt receives an actual rendered reflection probe',
    );
    assert.notEqual(
      material.envMap.uuid,
      snapshot.environment,
      'the baked nearby-world probe is assigned explicitly rather than falling back to scene.environment',
    );
    assert(material.envMapIntensity > 0);
    assert(
      vesper.every((other) => other.envMap?.uuid === material.envMap.uuid),
      'both road finishes borrow the same real nearby-world probe',
    );
  }
}

try {
  for (const [index, [biome, spanBiome]] of [
    ['nightweir', 'vesper-forest'],
    ['vesper-forest', 'nightweir'],
  ].entries()) {
    const context = await browser.newContext({
      viewport: { width: 1440, height: 900 },
    });
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
      // A small bounded delay makes an omitted borrowed-material readiness
      // promise visible even on a warm machine. Routing also disables HTTP cache.
      await context.route(asphaltURL, async (route) => {
        await new Promise((done) => setTimeout(done, 750));
        await route.continue();
      });
      const page = await context.newPage();
      const errors = [],
        glErrors = [],
        pendingTextures = new Set();
      let textureRequests = 0;
      collectPageErrors(page, errors);
      page.on('console', (message) => {
        if (
          message.type() === 'error' &&
          /WebGL|GL_INVALID|OUT_OF_MEMORY|shader|Program Info Log|context lost|compileShader|linkProgram/i.test(
            message.text(),
          )
        )
          glErrors.push(message.text());
      });
      page.on('request', (request) => {
        if (asphaltURL.test(request.url())) {
          pendingTextures.add(request);
          textureRequests++;
        }
      });
      const finish = (request) => pendingTextures.delete(request);
      page.on('requestfinished', finish);
      page.on('requestfailed', finish);
      await page.goto(new URL('?intro=0&music=0&editor=1', base).href);
      await page
        .locator('[data-editor-field="name"]')
        .waitFor({ timeout: 60000 });
      await ready(page);
      const doc = fixture(biome, spanBiome, 42017 + index);
      await importFixture(page, doc);
      assert(
        textureRequests >= 3,
        'the fixture exercises real asphalt texture requests',
      );
      assert.equal(
        pendingTextures.size,
        0,
        'preview readiness includes the borrowed asphalt requests',
      );
      if (!index) await cheapDrag(page, doc);
      await choose(page, 'test');
      await page.waitForFunction(
        () =>
          window.__VN?.ready &&
          window.__VN_FRONTEND.getState().editor.testDriving &&
          !window.__VN_FRONTEND.getState().editor.loadingTest,
        null,
        { timeout: 60000 },
      );
      const first = await actualRoadMaterials(page);
      assertMaterials(first);
      assert.equal(
        pendingTextures.size,
        0,
        'Test Drive readiness includes every borrowed asphalt request',
      );
      await page.keyboard.press('Escape');
      await page.waitForTimeout(450);
      assert.deepEqual(
        await actualRoadMaterials(page),
        first,
        'road maps and loaded images do not change asynchronously after readiness',
      );
      await page.locator('#home').click();
      await ready(page);
      assert.deepEqual(errors, [], 'the GPU fixture raises no page errors');
      assert.deepEqual(
        glErrors,
        [],
        'the GPU fixture raises no console GL/shader errors',
      );
      console.log(
        `PASS ${biome} base + ${spanBiome} span: ready textures, baked asphalt reflection, stable maps, clean GL`,
      );
    } finally {
      await context.close();
    }
  }
} finally {
  clearTimeout(watchdog);
  await browser.close();
}
