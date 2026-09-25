import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
  argument,
  openScene,
  root,
  samplePerformance,
} from '../tests/lib/browser.mjs';

const state = argument('state', 'menu');
if (!['menu', 'playing'].includes(state))
  throw new Error(
    '--state must be menu or playing; full mission evidence comes from verify:game.',
  );
const output = path.resolve(root, argument('out', `.artifacts/${state}.png`));
const harness = await openScene({
  width: Number(argument('width', 1600)),
  height: Number(argument('height', 1000)),
  mode: argument('mode', 'dev'),
});
try {
  await harness.page.evaluate(
    (quality) => window.__SCENE_TEST__.setSettings({ quality }),
    argument('quality', 'balanced'),
  );
  if (state === 'playing')
    await harness.page.locator('[data-action="start"]').click();
  await harness.page.waitForTimeout(1200);
  const performance = await samplePerformance(harness.page);
  await mkdir(path.dirname(output), { recursive: true });
  await harness.page.screenshot({ path: output });
  const report = {
    capturedAt: new Date().toISOString(),
    requestedState: state,
    environment: harness.environment,
    snapshot: await harness.snapshot(),
    performance,
    errors: harness.errors,
  };
  await writeFile(
    output.replace(/\.png$/i, '') + '.json',
    `${JSON.stringify(report, null, 2)}\n`,
  );
  console.log(
    JSON.stringify(
      {
        screenshot: output,
        state: report.snapshot.game?.state,
        errors: report.errors,
      },
      null,
      2,
    ),
  );
  if (Object.values(harness.errors).some((errors) => errors.length > 0))
    process.exitCode = 1;
} finally {
  await harness.close();
}
