import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
  argument,
  openScene,
  root,
  samplePerformance,
} from '../tests/lib/browser.mjs';

const view = argument('view', argument('angle', 'trail'));
const output = path.resolve(
  root,
  argument('out', argument('output', `.artifacts/${view}.png`)),
);
const harness = await openScene({
  width: Number(argument('width', 1600)),
  height: Number(argument('height', 1000)),
  mode: argument('mode', 'dev'),
});
try {
  await harness.page.evaluate(
    ({ view, quality }) => {
      window.__SCENE_TEST__.setView(view);
      window.__SCENE_TEST__.setSettings({ quality });
    },
    { view, quality: argument('quality', 'high') },
  );
  await harness.page.waitForTimeout(2000);
  const performance = await samplePerformance(harness.page);
  if (process.argv.includes('--clean')) {
    await harness.page.addStyleTag({
      content:
        '[data-hud], [data-dev-panel], .hud, .dev-panel { visibility: hidden !important; }',
    });
  }
  await mkdir(path.dirname(output), { recursive: true });
  await harness.page.screenshot({ path: output });
  const report = {
    capturedAt: new Date().toISOString(),
    view,
    screenshot: path.relative(root, output),
    environment: harness.environment,
    snapshot: await harness.snapshot(),
    performance,
    errors: harness.errors,
  };
  await writeFile(
    output.replace(/\.png$/i, '') + '.json',
    `${JSON.stringify(report, null, 2)}\n`,
  );
  console.log(JSON.stringify(report, null, 2));
  if (Object.values(harness.errors).some((errors) => errors.length > 0))
    process.exitCode = 1;
} finally {
  await harness.close();
}
