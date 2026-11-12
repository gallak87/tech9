import assert from 'node:assert/strict';
import {
  launchVerificationBrowser,
  collectPageErrors,
} from './verification-browser.mjs';
import { replaceOnce } from './runtime-probe.mjs';

const base = process.env.VN_URL;
if (!base) throw new Error('Set VN_URL to the selected checkout server.');
const browser = await launchVerificationBrowser();
try {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
  });
  // Cost probes live only at the response boundary, never in the studio API.
  await context.route('**/src/ships/inspector.js*', async (route) => {
    const response = await route.fetch();
    let source = await response.text();
    source = replaceOnce(
      source,
      'const START_ROTATION = 0;',
      'let __landingVfxHidden = false;\nconst START_ROTATION = 0;',
    );
    source = replaceOnce(
      source,
      'renderer.shadowMap.enabled = true;',
      'renderer.shadowMap.enabled = true; renderer.info.autoReset = false;',
    );
    source = replaceOnce(
      source,
      '      stage.render(() =>',
      `      renderer.info.reset();
      if (__landingVfxHidden) stage.scene.traverse(object => {
        if (object.name.endsWith(' / magnetic catch')) object.visible = false;
      });
      stage.render(() =>`,
    );
    source = replaceOnce(
      source,
      '      getSnapshot: () => ({',
      `      landingProbe(hidden) {
        if (typeof hidden === 'boolean') __landingVfxHidden = hidden;
        const geometries = new Set(), textures = new Set();
        let bytes = 0;
        stage.scene.traverse(object => {
          const geometry = object.geometry;
          if (geometry && !geometries.has(geometry)) {
            geometries.add(geometry);
            for (const attribute of Object.values(geometry.attributes)) bytes += attribute.array.byteLength;
            bytes += geometry.index?.array.byteLength ?? 0;
          }
          for (const material of [object.material].flat().filter(Boolean))
            for (const texture of Object.values(material)) {
              if (!texture?.isTexture || textures.has(texture)) continue;
              textures.add(texture);
              const mips = texture.mipmaps?.reduce((sum, mip) => sum + (mip.data?.byteLength ?? 0), 0) ?? 0;
              const base = texture.image?.data?.byteLength ?? (texture.image?.width ?? 256) * (texture.image?.height ?? 256) * 4;
              bytes += mips || base * (texture.generateMipmaps ? 4 / 3 : 1);
            }
        });
        const gl = renderer.getContext(), ext = gl.getExtension('WEBGL_debug_renderer_info');
        return {
          calls: renderer.info.render.calls, triangles: renderer.info.render.triangles,
          geometries: renderer.info.memory.geometries, textures: renderer.info.memory.textures,
          estimatedSceneMiB: bytes / 2 ** 20,
          memoryScope: 'Unique scene geometry and authored texture payload estimate; excludes framebuffer, PMREM and driver overhead',
          gpu: ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER),
          viewport: { width: innerWidth, height: innerHeight, dpr: renderer.getPixelRatio() },
        };
      },
      getSnapshot: () => ({`,
    );
    await route.fulfill({ response, body: source });
  });
  // Combat's existing presentation helpers import Rapier rule constants; a
  // module request alone does not mean an inspector constructed a physics world.
  await context.route('**/src/physics/rapier-world.js*', async (route) => {
    const response = await route.fetch(),
      source = await response.text();
    const anchor = /(async function createRapierWorld\([^)]*\)\s*\{)/;
    assert.match(source, anchor);
    await route.fulfill({
      response,
      body: source.replace(
        anchor,
        '$1\nwindow.__inspectorPhysicsWorlds = (window.__inspectorPhysicsWorlds ?? 0) + 1;\n',
      ),
    });
  });
  await context.addInitScript(() => {
    localStorage.setItem(
      'vector-nova.settings',
      JSON.stringify({ quality: 'low', volume: 0.35, reducedMotion: false }),
    );
    window.__landingPad = {
      id: 'Landing preview standard controller',
      index: 0,
      connected: true,
      mapping: 'standard',
      axes: [0, 0, 0, 0],
      buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })),
    };
    Object.defineProperty(navigator, 'getGamepads', {
      configurable: true,
      value: () => [window.__landingPad],
    });
  });
  const page = await context.newPage(),
    errors = collectPageErrors(page),
    requests = [];
  page.on('request', (request) =>
    requests.push(new URL(request.url()).pathname),
  );
  await page.goto(
    new URL('/?inspect=1&dev=2&ship=kestrel&music=0&intro=0', base).href,
  );
  await page.waitForFunction(
    () =>
      window.__VN_INSPECTOR?.ready &&
      window.__VN_FRONTEND?.getState().screen === 'inspection',
    null,
    { timeout: 90000 },
  );
  const read = () =>
    page.evaluate(
      () => window.__VN_INSPECTOR.getSnapshot().inspection.demonstration,
    );
  const stop = page.locator('.inspection-pickups [data-stop]');
  const picker = page.locator('#inspection-pickup');
  const trigger = page.locator('.inspection-pickups [data-trigger]');
  for (const kind of [
    'landing-catch',
    'freestyle-good',
    'freestyle-great',
    'freestyle-perfect',
    'freestyle-trick',
  ])
    assert.equal(await picker.locator(`option[value="${kind}"]`).count(), 1);

  // The OS-native select is set as a fixture; Tab/Enter exercise the actual
  // reachable controls. Controller selection below uses the shared menu path.
  await picker.selectOption('landing-catch');
  await picker.focus();
  await page.keyboard.press('Tab');
  assert.equal(
    await trigger.evaluate((element) => element === document.activeElement),
    true,
  );
  await page.keyboard.press('Enter');
  await page.waitForFunction(
    () =>
      window.__VN_INSPECTOR.getSnapshot().inspection.demonstration.landing
        ?.touchdownAudio.triggerCount >= 1,
  );
  const contact = await read();
  assert.equal(contact.kind, 'landing-catch');
  assert.equal(contact.landing.touchdownAudio.loaded, true);
  await stop.focus();
  await page.keyboard.press('Enter');
  assert.equal((await read()).kind, null);
  assert.deepEqual((await read()).position, [0, 0, 0]);

  const button = async (index) => {
    await page.evaluate((index) => {
      window.__landingPad.buttons[index] = { pressed: true, value: 1 };
    }, index);
    await page.waitForTimeout(90);
    await page.evaluate((index) => {
      window.__landingPad.buttons[index] = { pressed: false, value: 0 };
    }, index);
    await page.waitForTimeout(90);
  };
  await picker.focus();
  await button(15); // D-pad right selects the next native option.
  assert.equal(await picker.inputValue(), 'freestyle-good');
  await button(13); // D-pad down reaches Trigger.
  assert.equal(
    await trigger.evaluate((element) => element === document.activeElement),
    true,
  );
  await button(0);
  await page.waitForFunction(
    () =>
      window.__VN_INSPECTOR.getSnapshot().inspection.demonstration.landing
        ?.audio.lastGrade === 'good',
  );
  assert.equal((await read()).landing.audio.lastGrade, 'good');
  await stop.click();

  for (const grade of ['good', 'great', 'perfect']) {
    assert.equal(
      await page.evaluate(
        (grade) =>
          window.__VN_INSPECTOR.audition(`freestyle-${grade}`, {
            time: 0.76,
            paused: true,
          }),
        grade,
      ),
      true,
    );
    const seated = await read();
    assert.ok(seated.position[1] < -0.2);
    assert.equal(seated.landing.vfx.visible, true);
    const held = seated.position;
    await page.waitForTimeout(130);
    assert.deepEqual((await read()).position, held);
    assert.equal(
      await page.evaluate(
        (grade) =>
          window.__VN_INSPECTOR.audition(`freestyle-${grade}`, {
            time: 1.03,
            paused: true,
          }),
        grade,
      ),
      true,
    );
    const banked = await read();
    assert.equal(banked.landing.vfx.grade, grade);
    assert.equal(
      banked.landing.audio.activeVoices,
      0,
      'frozen authoring captures do not replay historical audio',
    );
  }
  await page.evaluate(() =>
    window.__VN_INSPECTOR.audition('freestyle-perfect'),
  );
  await page.waitForFunction(
    () =>
      window.__VN_INSPECTOR.getSnapshot().inspection.demonstration.landing
        ?.audio.activeVoices > 0,
  );
  await stop.click();
  assert.equal((await read()).landing.vfx.visible, false);
  assert.equal((await read()).landing.audio.activeVoices, 0);
  assert.deepEqual((await read()).position, [0, 0, 0]);
  await page.locator('[data-preview="autoRotate"]').click();
  for (const quality of ['low', 'high']) {
    await page.evaluate(
      (quality) =>
        window.__VN_INSPECTOR.configure({
          quality,
          volume: 0.35,
          reducedMotion: false,
        }),
      quality,
    );
    await page.evaluate(() =>
      window.__VN_INSPECTOR.audition('freestyle-perfect', {
        time: 1.03,
        paused: true,
      }),
    );
    const metrics = [];
    for (const hidden of [true, false]) {
      metrics.push(
        await page.evaluate(async (hidden) => {
          window.__VN_INSPECTOR.landingProbe(hidden);
          for (let i = 0; i < 25; i++) await new Promise(requestAnimationFrame);
          const intervals = [];
          let previous = performance.now();
          for (let i = 0; i < 45; i++) {
            await new Promise(requestAnimationFrame);
            const now = performance.now();
            intervals.push(now - previous);
            previous = now;
          }
          intervals.sort((a, b) => a - b);
          return {
            hidden,
            ...window.__VN_INSPECTOR.landingProbe(),
            frameMs: { p50: intervals[22], p95: intervals[42] },
          };
        }, hidden),
      );
    }
    assert.ok(metrics[1].calls > metrics[0].calls);
    assert.ok(metrics[1].triangles > metrics[0].triangles);
    assert.equal(metrics[1].estimatedSceneMiB, metrics[0].estimatedSceneMiB);
    console.log(
      JSON.stringify({
        quality,
        metrics,
        timingNote:
          'Matched warm paused inspector, headless RAF intervals; not foreground GPU headroom certification',
      }),
    );
  }
  assert.deepEqual(
    requests.filter((path) =>
      /\/src\/levels\/[^/]+\/(?:index\.js|track\/)|\/src\/physics\/(?:collision-world|flight)\.js|\/src\/core\/game\.js/.test(
        path,
      ),
    ),
    [],
    'inspector never loads a race or level factory',
  );
  assert.equal(
    await page.evaluate(() => window.__inspectorPhysicsWorlds ?? 0),
    0,
  );
  assert.deepEqual(errors, []);
  console.log(
    'PASS · desktop inspector keyboard/controller landings, graded shared VFX and ship seat, actual decoded audio, paused capture and Stop cleanup',
  );
} finally {
  await browser.close();
}
