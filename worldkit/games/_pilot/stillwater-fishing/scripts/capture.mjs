import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
  argument,
  openScene,
  root,
  samplePerformance,
} from '../tests/lib/browser.mjs';
const view = argument('view', 'bank');
const output = path.resolve(root, argument('out', `.artifacts/${view}.png`));
const harness = await openScene({
  width: Number(argument('width', 1600)),
  height: Number(argument('height', 1000)),
  mode: argument('mode', 'preview'),
});
try {
  await harness.page.evaluate(
    (quality) => window.__SCENE_TEST__.setSettings({ quality }),
    argument('quality', 'balanced'),
  );
  if (view !== 'opening') {
    await harness.page.click('#begin');
    await harness.page.keyboard.down('KeyW');
    await harness.page.waitForTimeout(1500);
    await harness.page.keyboard.up('KeyW');
  }
  await harness.page.waitForTimeout(1000);
  const performance = await samplePerformance(harness.page);
  await mkdir(path.dirname(output), { recursive: true });
  await harness.page.screenshot({ path: output });
  const report = {
    capturedAt: new Date().toISOString(),
    view,
    environment: harness.environment,
    snapshot: await harness.snapshot(),
    performance,
    errors: harness.errors,
  };
  await writeFile(
    output.replace(/\.png$/i, '') + '.json',
    JSON.stringify(report, null, 2) + '\n',
  );
  console.log(JSON.stringify(report, null, 2));
  if (Object.values(harness.errors).some((errors) => errors.length))
    process.exitCode = 1;
} finally {
  await harness.close();
}
