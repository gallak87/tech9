import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
  argument,
  openScene,
  root,
  samplePerformance,
} from '../tests/lib/browser.mjs';
const output = path.resolve(root, argument('out', '.artifacts/intro.png'));
const harness = await openScene({
  width: Number(argument('width', 1600)),
  height: Number(argument('height', 1000)),
});
try {
  await harness.page.waitForTimeout(1000);
  const performance = await samplePerformance(harness.page);
  await mkdir(path.dirname(output), { recursive: true });
  await harness.page.screenshot({ path: output });
  await writeFile(
    output.replace(/\.png$/i, '') + '.json',
    JSON.stringify(
      {
        environment: harness.environment,
        performance,
        snapshot: await harness.snapshot(),
        errors: harness.errors,
      },
      null,
      2,
    ),
  );
  console.log(output);
} finally {
  await harness.close();
}
