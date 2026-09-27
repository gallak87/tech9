import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { openScene, samplePerformance, argument } from './lib/browser.mjs';
import { groundHeight } from '../src/flight/LandscapeLayout.js';

// Fixed reference views and a short local camera sweep, not another game circuit.
const output = argument('output', '.artifacts/art-refinement/latest');
await mkdir(output, { recursive: true });
const h = await openScene({ mode: 'preview', width: 1440, height: 900 });
const report = {
  revision: execFileSync('git', ['rev-parse', 'HEAD'], {
    encoding: 'utf8',
  }).trim(),
  environment: h.environment,
  quality: 'high',
  simulationRate: 1,
  views: [],
  travel: [],
};
const views = [
  [
    'ground-east',
    [320 + 85 * Math.sin(-900 * 0.003) + 26 * Math.sin(-900 * 0.012), 0, -900],
    [350, 0, -945],
  ],
  ['ground-west', [-980, 0, 520], [-1010, 0, 480]],
  ['ground-offtrail', [330, 0, -972], [325, 0, -1010]],
  [
    'low-east',
    [620, groundHeight(620, -950) + 58, -950],
    [750, groundHeight(750, -1250) + 20, -1250],
  ],
  ['high-valley', [-800, 690, 1000], [0, 30, -400]],
];
for (const [name, p, t] of views)
  if (name.startsWith('ground')) {
    p[1] = groundHeight(p[0], p[2]) + 2.1;
    t[1] = groundHeight(t[0], t[2]) + 2;
  }
async function inspect(p, t) {
  await h.page.evaluate(
    ([p, t]) => window.__FLIGHT_TEST__.inspect(p, t),
    [p, t],
  );
}
try {
  await h.page.locator('#quality').selectOption('high');
  await h.page.screenshot({ path: `${output}/airfield.png` });
  for (const [name, p, t] of views) {
    await inspect(p, t);
    await h.page.waitForTimeout(900);
    await h.page.screenshot({ path: `${output}/${name}.png` });
    report.views.push({
      name,
      p,
      t,
      snapshot: await h.snapshot(),
      performance: await samplePerformance(h.page, 1000),
    });
  }
  // Short 90 m camera sweep; 3 m steps, 100 ms minimum spacing, always 1x time.
  // Screenshots add pauses. Three stills do not establish temporal smoothness.
  for (let i = 0; i <= 30; i++) {
    const p = [620, groundHeight(620, -950) + 35, -950 - i * 3];
    await inspect(p, [750, groundHeight(750, -1250) + 20, -1250 - i * 3]);
    await h.page.waitForTimeout(100);
    if (i % 15 === 0)
      await h.page.screenshot({ path: `${output}/transition-${i}.png` });
  }
  // Revisit dispersed regions twice to detect travel allocations after all views warm.
  for (let pass = 0; pass < 3; pass++)
    for (const [x, z] of [
      [-1800, -1600],
      [1800, -1600],
      [1800, 1600],
      [-1800, 1600],
      [620, -950],
      [-980, 520],
    ]) {
      await inspect(
        [x, groundHeight(x, z) + 35, z],
        [x + 60, groundHeight(x + 60, z - 100) + 20, z - 100],
      );
      await h.page.waitForTimeout(180);
      report.travel.push(await h.snapshot());
    }
  const tail = report.travel.slice(-6);
  const renderer = tail.map((v) => v.app.renderer.memory);
  assert.ok(
    tail.every(
      (v) => v.landscape.poolCapacity === tail[0].landscape.poolCapacity,
    ),
  );
  assert.ok(
    renderer.every(
      (v) =>
        v.geometries === renderer[0].geometries &&
        v.textures === renderer[0].textures &&
        v.programs === renderer[0].programs,
    ),
    'revisited rendering resources must stay flat',
  );
  assert.ok(
    Object.values(h.errors).every((v) => v.length === 0),
    JSON.stringify(h.errors),
  );
  report.passed = true;
} catch (error) {
  report.failure = error.stack;
  process.exitCode = 1;
} finally {
  report.errors = h.errors;
  await writeFile(`${output}/capture.json`, JSON.stringify(report, null, 2));
  console.log(
    JSON.stringify({
      passed: report.passed,
      failure: report.failure,
      errors: report.errors,
      views: report.views.map((v) => ({
        name: v.name,
        performance: v.performance,
        renderer: v.snapshot.app.renderer,
      })),
      final: report.travel.at(-1)?.landscape,
    }),
  );
  await h.close();
}
