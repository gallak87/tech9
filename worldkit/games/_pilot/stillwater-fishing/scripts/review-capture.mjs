import { mkdir, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import assert from 'node:assert/strict';
import {
  argument,
  openScene,
  root,
  samplePerformance,
} from '../tests/lib/browser.mjs';
process.env.SCENE_PORT ??= '4442';
const round = argument('round', '2');
const output = path.join(root, '.artifacts', `art-round-${round}`);
await mkdir(output, { recursive: true });
const h = await openScene({ mode: 'preview' });
const { page } = h;
const state = async () => (await h.snapshot()).game;
try {
  await page.click('#begin');
  await page.keyboard.down('KeyW');
  await page.waitForTimeout(1500);
  await page.keyboard.up('KeyW');
  await page.waitForTimeout(1500);
  await page.screenshot({ path: path.join(output, 'bank.png') });
  const performance = await samplePerformance(page, 5000);
  await page.keyboard.down('Space');
  await page.waitForTimeout(800);
  await page.keyboard.up('Space');
  await page.waitForFunction(
    () => globalThis.__SCENE_TEST__.snapshot().game.phase === 'bite',
    undefined,
    { timeout: 15000 },
  );
  await page.keyboard.press('Space');
  let held = false,
    minTension = 1,
    maxTension = 0;
  const start = Date.now();
  while (Date.now() - start < 90000) {
    const s = await state();
    if (s.phase !== 'fight') break;
    if (s.tension > 0.7 && held) {
      await page.keyboard.up('Space');
      held = false;
    } else if (s.tension < 0.3 && !held) {
      await page.keyboard.down('Space');
      held = true;
    }
    minTension = Math.min(minTension, s.tension);
    maxTension = Math.max(maxTension, s.tension);
    await page.waitForTimeout(100);
  }
  await page.keyboard.up('Space');
  assert.equal((await state()).phase, 'landed');
  await page.waitForTimeout(1500);
  await page.screenshot({ path: path.join(output, 'landed.png') });
  const landed = await state();
  await page.click('#release');
  assert.equal((await state()).phase, 'ready');
  assert.ok(
    Object.values(h.errors).every((errors) => errors.length === 0),
    JSON.stringify(h.errors),
  );
  const report = {
    round: Number(round),
    sourceCommit: execFileSync('git', ['rev-parse', 'HEAD'], {
      encoding: 'utf8',
    }).trim(),
    environment: h.environment,
    performance,
    settings: (await h.snapshot()).settings,
    validation: {
      realInput: 'walk, charge, cast, bite, hook, reel/ease, land, release',
      landed,
      minTension,
      maxTension,
    },
    errors: h.errors,
  };
  await writeFile(
    path.join(output, 'validation.json'),
    JSON.stringify(report, null, 2) + '\n',
  );
  console.log(
    JSON.stringify(
      {
        round,
        sourceCommit: report.sourceCommit,
        performance,
        catch: landed.lastCatch,
        errors: h.errors,
        output,
      },
      null,
      2,
    ),
  );
} finally {
  await h.close();
}
