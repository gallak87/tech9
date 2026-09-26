import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { openScene, root, samplePerformance } from './lib/browser.mjs';
const out = path.join(
  root,
  '.artifacts',
  process.env.VEHICLE_ROUND || 'vehicle-art',
);
await mkdir(out, { recursive: true });
const h = await openScene({
    mode: 'preview',
    videoDirectory:
      process.env.RECORD_VEHICLE_VIDEO === '1'
        ? path.join(out, 'video')
        : undefined,
  }),
  { page } = h;
const evidence = [];
try {
  for (const kind of ['jeep', 'atv', 'bike']) {
    await page.locator(`[data-action="vehicle"][data-value="${kind}"]`).click();
    await page.waitForTimeout(200);
    await page.screenshot({ path: path.join(out, `${kind}-garage.png`) });
    await page.addStyleTag({ content: '#interface {visibility:hidden}' });
    const scale = kind === 'jeep' ? 1 : 0.76;
    const views = {
      front: [4.3 * scale, 2.45, -5.8 * scale],
      rear: [-4.5 * scale, 2.35, 5.8 * scale],
      side: [6.7 * scale, 1.7, 0],
      'opposite-side': [-6.7 * scale, 1.7, 0],
      'leg-clearance-right': [3.5 * scale, 1.25, 0.2],
      'leg-clearance-left': [-3.5 * scale, 1.25, 0.2],
      detail: [2.9 * scale, 1.6, -3.1 * scale],
    };
    for (const [name, position] of Object.entries(views)) {
      await page.evaluate(
        (pose) => window.__SCENE_TEST__.inspectionCamera(pose),
        {
          position,
          target: [
            0,
            name.startsWith('leg-clearance')
              ? 0.9
              : name === 'detail'
                ? 0.82
                : 1.05,
            0,
          ],
          fov: name === 'detail' ? 39 : 37,
        },
      );
      await page.waitForTimeout(130);
      await page.screenshot({ path: path.join(out, `${kind}-${name}.png`) });
    }
    await page.evaluate(() => window.__SCENE_TEST__.inspectionCamera(null));
    await page.addStyleTag({ content: '#interface {visibility:visible}' });
    await page.locator('[data-action="free"]').click();
    await page.keyboard.down('w');
    await page.waitForTimeout(1700);
    await page.keyboard.down('d');
    for (let frame = 0; frame < 4; frame++) {
      await page.waitForTimeout(180);
      await page.screenshot({
        path: path.join(out, `${kind}-turn-${frame}.png`),
      });
      evidence.push({ kind, frame, snapshot: await h.snapshot() });
    }
    await page.keyboard.up('d');
    await page.keyboard.up('w');
    await page.keyboard.down('Space');
    await page.waitForTimeout(700);
    await page.keyboard.up('Space');
    await page.keyboard.press('c');
    await page.screenshot({ path: path.join(out, `${kind}-driver.png`) });
    for (const key of ['a', 'd']) {
      await page.keyboard.down(key);
      await page.waitForTimeout(350);
      await page.screenshot({
        path: path.join(out, `${kind}-driver-steer-${key}.png`),
      });
      evidence.push({
        kind,
        frame: `driver-steer-${key}`,
        snapshot: await h.snapshot(),
      });
      await page.keyboard.up(key);
    }
    await page.keyboard.press('c');
    await page.evaluate(() =>
      window.__SCENE_TEST__.arrange({
        x: 260,
        z: -4,
        heading: Math.asin(-0.15),
      }),
    );
    await page.keyboard.down('w');
    let takeoff = false,
      landed = false;
    const end = Date.now() + 7000;
    while (Date.now() < end) {
      const state = await h.snapshot();
      if (state.motion.airborne && !takeoff) {
        takeoff = true;
        await page.screenshot({ path: path.join(out, `${kind}-takeoff.png`) });
        evidence.push({ kind, frame: 'takeoff', snapshot: state });
      } else if (takeoff && !state.motion.airborne && !landed) {
        landed = true;
        await page.screenshot({ path: path.join(out, `${kind}-landed.png`) });
        evidence.push({ kind, frame: 'landed', snapshot: state });
      }
      await page.waitForTimeout(40);
    }
    await page.keyboard.up('w');
    assert.ok(
      takeoff && landed,
      `${kind} demonstrates a fresh takeoff and grounded landing`,
    );
    await page.keyboard.press('Escape');
    await page.locator('[data-action="garage"]').last().click();
  }
  const performance = await samplePerformance(page, 3500);
  for (const errors of Object.values(h.errors)) assert.deepEqual(errors, []);
  await writeFile(
    path.join(out, 'report.json'),
    JSON.stringify(
      {
        sourceCommit: execFileSync('git', ['rev-parse', 'HEAD'], {
          cwd: root,
          encoding: 'utf8',
        }).trim(),
        videoPath: page.video() ? await page.video().path() : null,
        environment: h.environment,
        performance,
        errors: h.errors,
        evidence,
        note: 'Inspection closeups use test-only camera poses in the real park. Turn and terrain-jump sequences use real keyboard input. Jump approach uses targeted setup; this is articulation evidence, not route-completion evidence. Still frames do not substitute for continuous video.',
      },
      null,
      2,
    ),
  );
} finally {
  await h.close();
}
