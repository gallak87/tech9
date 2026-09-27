import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { openScene } from './lib/browser.mjs';
// Run native cursor checks without screenshot capture, which can alter macOS
// foreground/cursor state. The full rendered core loop is exercised separately.
process.env.HEADED = '1';
const scene = await openScene({ mode: 'preview' });
const { page } = scene;
const snapshot = () => page.evaluate(() => window.__HUNT_TEST__.snapshot());
const results = [];
async function captureButton(id) {
  await page.bringToFront();
  await page.waitForTimeout(500);
  await page.locator(id).click();
  await page.waitForFunction(
    () => document.pointerLockElement?.id === 'scene',
    undefined,
    { timeout: 5000 },
  );
}
try {
  await captureButton('#begin');
  results.push('native pointer capture');
  const start = await snapshot();
  await page.mouse.move(830, 500);
  await page.waitForTimeout(100);
  assert.notEqual((await snapshot()).yaw, start.yaw);
  results.push('real mouse look');
  await page.keyboard.down('KeyQ');
  await page.waitForTimeout(100);
  await page.keyboard.down('Space');
  await page.keyboard.down('KeyW');
  await page.waitForTimeout(200);
  // Opening a second foreground page causes actual document/window focus loss.
  const other = await scene.browser.newPage();
  await other.goto('about:blank');
  await other.bringToFront();
  await page.waitForTimeout(200);
  const paused = await snapshot();
  assert.equal(paused.mode, 'paused');
  assert.equal(paused.draw, 0);
  assert.equal(paused.aiming, false);
  await page.keyboard.up('KeyQ');
  await page.keyboard.up('Space');
  await page.keyboard.up('KeyW');
  await other.close();
  results.push('actual browser focus loss cancels held inputs');
  await page.waitForTimeout(1500);
  await captureButton('#resume');
  assert.equal((await snapshot()).arrows, 3);
  results.push('resume recaptures without firing');
  await page.evaluate(() => document.exitPointerLock());
  await page.waitForTimeout(200);
  assert.equal((await snapshot()).mode, 'paused');
  results.push('native pointer release pauses');
  await page.keyboard.press('Tab');
  assert.notEqual(
    await page.evaluate(() => document.activeElement?.tagName),
    'BODY',
  );
  await mkdir('.artifacts/verification', { recursive: true });
  await writeFile(
    '.artifacts/verification/native-input.json',
    JSON.stringify(
      {
        sourceCommit: execFileSync('git', ['rev-parse', 'HEAD'], {
          encoding: 'utf8',
        }).trim(),
        environment: scene.environment,
        results,
        errors: scene.errors,
      },
      null,
      2,
    ),
  );
  assert.deepEqual(scene.errors, {
    console: [],
    page: [],
    requests: [],
    webgl: [],
  });
  console.log('PASS native input', JSON.stringify(results));
} finally {
  await scene.close();
}
