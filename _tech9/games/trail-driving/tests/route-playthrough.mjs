import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { openScene, root, samplePerformance } from './lib/browser.mjs';
import { driveRoute } from './lib/drive-route.mjs';
const output = path.join(root, '.artifacts/acceptance');
await mkdir(output, { recursive: true });
const harness = await openScene({ mode: 'preview' });
const { page } = harness;
const report = {
  environment: harness.environment,
  runs: [],
  errors: harness.errors,
};
try {
  const routes = await page.evaluate(() => window.__SCENE_TEST__.routes());
  for (const vehicle of process.env.VEHICLE
    ? [process.env.VEHICLE]
    : ['jeep', 'atv', 'bike'])
    for (const route of routes.filter(
      (r) => !process.env.ROUTE || r.id === process.env.ROUTE,
    )) {
      if ((await harness.snapshot()).state !== 'garage')
        await page.locator('[data-action="garage"]').last().click();
      await page
        .locator(`[data-action="vehicle"][data-value="${vehicle}"]`)
        .click();
      await page
        .locator(`[data-action="route"][data-value="${route.id}"]`)
        .click();
      await page.locator('[data-action="start"]').click();
      let captured = false;
      const result = await driveRoute(page, route, {
        onSample: async ({ state, cursor, routePoints, best, wallSeconds }) => {
          if (!captured && state.trial.nextGate >= 4) {
            captured = true;
            await page.screenshot({
              path: path.join(output, `${vehicle}-${route.id}-driving.png`),
            });
          }
          console.log(
            `${vehicle}/${route.id} ${wallSeconds.toFixed(0)}s gate ${state.trial.nextGate}/${state.trial.totalGates} path ${cursor}/${routePoints} offset ${best.toFixed(1)}m speed ${state.motion.speed.toFixed(1)}`,
          );
        },
      });
      report.runs.push(result);
      console.log('COMPLETE', JSON.stringify(result));
      await page.screenshot({
        path: path.join(output, `${vehicle}-${route.id}-result.png`),
      });
      await page.locator('[data-action="restart"]').click();
      const reset = await harness.snapshot();
      assert.equal(reset.trial.nextGate, 0);
      assert.equal(reset.trial.penalties, 0);
      assert.equal(reset.state, 'driving');
      await page.keyboard.press('Escape');
      await page.locator('[data-action="garage"]').last().click();
      await writeFile(
        path.join(output, 'runs.json'),
        JSON.stringify(report, null, 2) + '\n',
      );
    }
  await page.reload();
  await page.waitForFunction(() => window.__SCENE_TEST__?.ready);
  const records = (await harness.snapshot()).records;
  for (const run of report.runs)
    assert.ok(records[`${run.vehicle}:${run.route}`]);
  report.persisted = records;
  report.performance = await samplePerformance(page, 5000);
  for (const errors of Object.values(harness.errors))
    assert.deepEqual(errors, []);
  report.passed = true;
} finally {
  await writeFile(
    path.join(output, 'runs.json'),
    JSON.stringify(report, null, 2) + '\n',
  );
  await harness.close();
}
