import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { Euler, Quaternion } from 'three';
import { openScene, root, samplePerformance } from './lib/browser.mjs';
import { pondRadius, isWalkable } from '../src/world/pondDefinition.js';
import { terrainHeight } from '../src/world/terrain.js';
import { getForestColliders } from '../src/world/ForestWorld.js';

const out = path.join(root, '.artifacts/verification');
await mkdir(out, { recursive: true });
const report = {
  method:
    'Production preview, real buttons/keyboard/right-drag input. Snapshots only; no camera, state or movement mutation hooks.',
  checks: [],
};
let harness;
try {
  harness = await openScene({ mode: 'preview', width: 1600, height: 1000 });
  const { page, snapshot } = harness;
  const xyzDistance = (a, b) =>
    Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
  const press = async (key, ms) => {
    await page.keyboard.down(key);
    await page.waitForTimeout(ms);
    await page.keyboard.up(key);
  };
  const check = async (name, fn) => {
    const detail = await fn();
    report.checks.push({ name, pass: true, detail });
    console.log(`PASS ${name}`);
  };
  const state = async (value) =>
    page.waitForFunction(
      (state) => window.__SCENE_TEST__.snapshot().exploration.state === state,
      value,
    );
  const action = async (name) => {
    await page.locator(`[data-action=${name}]:visible`).click();
  };
  async function face([x, z]) {
    for (let i = 0; i < 10; i++) {
      const s = await snapshot();
      const [px, , pz] = s.camera.position;
      const rotation = new Euler().setFromQuaternion(
        new Quaternion().fromArray(s.camera.quaternion),
        'YXZ',
      );
      const desired = Math.atan2(-(x - px), -(z - pz));
      const difference = Math.atan2(
        Math.sin(rotation.y - desired),
        Math.cos(rotation.y - desired),
      );
      if (Math.abs(difference) < 0.008) return;
      const dx = Math.max(-500, Math.min(500, difference / 0.0018));
      await page.mouse.move(800 - dx / 2, 500);
      await page.mouse.down({ button: 'right' });
      await page.mouse.move(800 + dx / 2, 500, { steps: 3 });
      await page.mouse.up({ button: 'right' });
      await page.waitForTimeout(30);
    }
    throw new Error('Right-drag failed to orient camera');
  }
  async function walk([x, z], tolerance = 0.12) {
    for (let i = 0; i < 35; i++) {
      const s = await snapshot();
      assert.equal(s.exploration.state, 'exploring');
      const d = Math.hypot(s.camera.position[0] - x, s.camera.position[2] - z);
      if (d < tolerance) return;
      await face([x, z]);
      await press(
        'w',
        Math.max(25, Math.min(550, ((d - tolerance * 0.4) / 2.6) * 1000)),
      );
    }
    throw new Error(`Route blocked before ${x},${z}`);
  }
  await check(
    'neutral menu, exact five settings and frozen pre-start controls',
    async () => {
      const before = await snapshot();
      assert.equal(before.exploration.state, 'menu');
      assert.equal(before.scene.id, 'stillwater-pond');
      assert.equal(before.settings.quality, 'balanced');
      assert.deepEqual(
        (
          await page
            .locator('[data-setting]')
            .evaluateAll((els) => els.map((e) => e.dataset.setting))
        ).sort(),
        ['atmosphere', 'exposure', 'quality', 'richness', 'sunlight'],
      );
      await press('w', 300);
      assert.deepEqual((await snapshot()).camera, before.camera);
      assert.match(await page.locator('.note').innerText(), /Desktop keyboard/);
    },
  );
  await check('visible start and real grounded keyboard movement', async () => {
    const before = await snapshot();
    await action('start');
    await state('exploring');
    await press('w', 700);
    const s = await snapshot();
    assert.ok(xyzDistance(before.camera.position, s.camera.position) > 1);
    assert.ok(
      Math.abs(
        s.camera.position[1] -
          terrainHeight(s.camera.position[0], s.camera.position[2]) -
          1.68,
      ) < 1e-6,
    );
    return s.camera.position;
  });
  await check(
    'real walking reaches the shore and cannot cross the footprint',
    async () => {
      await press('w', 4500);
      const s = await snapshot();
      const [x, , z] = s.camera.position;
      assert.ok(pondRadius(x, z) < 1.09, 'player reached the bank');
      for (let i = 0; i < 8; i++) {
        const a = (i * Math.PI) / 4;
        assert.ok(isWalkable(x + Math.cos(a) * 0.3, z + Math.sin(a) * 0.3));
      }
      const before = s.camera.position;
      await press('w', 800);
      assert.ok(xyzDistance(before, (await snapshot()).camera.position) < 0.15);
      await page.screenshot({ path: path.join(out, 'pond-shore.png') });
      return { position: before, pondRadius: pondRadius(x, z) };
    },
  );
  await check(
    'pause freezes movement and look; restart clears held keys',
    async () => {
      await page.keyboard.down('w');
      await page.keyboard.press('p');
      await state('paused');
      const before = await snapshot();
      await press('j', 250);
      await page.waitForTimeout(200);
      assert.deepEqual((await snapshot()).camera, before.camera);
      await action('resume');
      await state('exploring');
      const resumed = await snapshot();
      await page.waitForTimeout(300);
      assert.deepEqual((await snapshot()).camera, resumed.camera);
      await page.keyboard.up('w');
      await page.keyboard.press('p');
      await action('reset');
      await state('exploring');
      const reset = await snapshot();
      assert.ok(
        Math.abs(reset.camera.position[0]) < 0.001 &&
          Math.abs(reset.camera.position[2] - 24) < 0.001,
      );
    },
  );
  await check(
    'real approach to authored bank rock is blocked by its shared placement proxy',
    async () => {
      await walk([0, 22]);
      await walk([-6.1, 22]);
      const rock = getForestColliders().find((c) => c.id === 'bank-rock-4');
      let minDistance = Infinity;
      for (let i = 0; i < 28; i++) {
        await face([rock.x, rock.z]);
        await press('w', 100);
        const p = (await snapshot()).camera.position;
        minDistance = Math.min(
          minDistance,
          Math.hypot(p[0] - rock.x, p[2] - rock.z),
        );
      }
      assert.ok(minDistance >= rock.radius + 0.3 - 0.015);
      assert.ok(minDistance < rock.radius + 0.6);
      return { rock, minDistance };
    },
  );
  await check(
    'five visible graphics controls apply and reflection quality follows presets',
    async () => {
      await page.keyboard.press('p');
      await state('paused');
      for (const [quality, size] of [
        ['ultra', 2048],
        ['high', 1536],
        ['balanced', 1024],
      ]) {
        await page.locator('[data-setting=quality]').selectOption(quality);
        const s = await snapshot();
        assert.equal(s.settings.quality, quality);
        assert.equal(
          s.world.find((layer) => layer.id === 'pond-water').reflectionSize,
          size,
        );
      }
      for (const key of ['sunlight', 'atmosphere', 'richness', 'exposure']) {
        await page.locator(`[data-setting=${key}]`).focus();
        await page.keyboard.press('Home');
        assert.equal((await snapshot()).settings[key], 0.4);
        await page.keyboard.press('End');
        assert.equal((await snapshot()).settings[key], 1.6);
        await page.keyboard.press('Home');
        for (let i = 0; i < 12; i++) await page.keyboard.press('ArrowRight');
      }
      await page.screenshot({ path: path.join(out, 'pond-paused.png') });
      await action('reset');
    },
  );
  await check(
    'blur pauses and narrow viewport retains desktop guidance',
    async () => {
      await page.evaluate(() => window.dispatchEvent(new Event('blur')));
      await state('paused');
      await page.setViewportSize({ width: 390, height: 844 });
      assert.ok(await page.locator('[data-action=resume]').isVisible());
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
        true,
      );
      await page.setViewportSize({ width: 1600, height: 1000 });
      await action('reset');
    },
  );
  report.environment = harness.environment;
  report.settings = (await snapshot()).settings;
  report.performance = await samplePerformance(page, 3500);
  await check(
    'ordinary URL exposes no test hooks and no browser or asset errors',
    async () => {
      const url = new URL(page.url());
      url.searchParams.delete('test');
      await page.goto(url.href);
      await page.locator('#loading').waitFor({ state: 'hidden' });
      assert.equal(
        await page.evaluate(() => typeof window.__SCENE_TEST__),
        'undefined',
      );
      assert.deepEqual(Object.values(harness.errors).flat(), []);
    },
  );
  report.passed = true;
} catch (error) {
  report.passed = false;
  report.error = error.stack;
  throw error;
} finally {
  await writeFile(
    path.join(out, 'report.json'),
    JSON.stringify(report, null, 2) + '\n',
  );
  await harness?.close();
}
