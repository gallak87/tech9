import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import {
  menuCatalog,
  readPreviewManifest,
  previewPreset,
  previewSize,
} from './menu-catalog.mjs';

// Explicitly refreshed runtime assets. Source changes never hide saved images.
const root = resolve(import.meta.dirname, '..');
const output = resolve(root, 'public/assets/menu');
const base = process.env.VN_URL || 'http://127.0.0.1:5179';
const args = process.argv.slice(2);
const missingOnly = args.includes('--missing');
// --force remains an alias for the previous all-circuit refresh command.
const requested = args.filter((arg) => !['--force', '--missing'].includes(arg));
const catalog = await menuCatalog();
const unknown = requested.filter(
  (id) => !catalog.some((route) => route.id === id),
);
if (unknown.length) throw new Error(`Unknown circuits: ${unknown.join(', ')}`);
const routes = catalog.filter(
  (r) => !requested.length || requested.includes(r.id),
);
await mkdir(output, { recursive: true });
const manifest = await readPreviewManifest(output);
const sourceRevision = execFileSync('git', ['rev-parse', 'HEAD'], {
  cwd: root,
  encoding: 'utf8',
}).trim();
const sourceDirty = Boolean(
  execFileSync(
    'git',
    ['status', '--porcelain', '--', '.', ':!public/assets/menu'],
    { cwd: root, encoding: 'utf8' },
  ).trim(),
);
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  for (const route of routes) {
    if (missingOnly && route.preview) {
      console.log(`Saved: ${route.id}`);
      continue;
    }
    const context = await browser.newContext({
      viewport: { width: 1280, height: 800 },
      deviceScaleFactor: 1,
    });
    try {
      await context.addInitScript(() =>
        localStorage.setItem(
          'vector-nova.settings',
          JSON.stringify({
            quality: 'low',
            volume: 0,
            reducedMotion: true,
            difficulty: 'easy',
          }),
        ),
      );
      const page = await context.newPage();
      await page.goto(
        new URL(`?level=${route.id}&capture=1&music=0`, base).href,
      );
      await page.waitForFunction(
        () => window.__VN?.ready || window.__VN_FRONTEND?.getState().error,
        null,
        { timeout: 120000 },
      );
      const failure = await page.evaluate(
        () => window.__VN_FRONTEND.getState().error,
      );
      if (failure) throw new Error(`${route.id}: ${failure}`);
      await page.waitForFunction(
        () => window.__VN_FRONTEND.getState().screen === 'review',
      );
      const data = await page.evaluate(async (id) => {
        const game = window.__VN;
        const track = game.getTrack();
        const { scene, camera, renderer } = game.getScene();
        // Free camera already hides the player, rivals and driving effects.
        // Pull back from the grid and turn into the circuit, rather than taking
        // the title camera's close-up of the starting ship.
        game.fly();
        const start = track.sample(0);
        const center = start.position.clone().set(0, 0, 0);
        const samples = 180;
        for (let i = 0; i < samples; i++)
          center.add(track.sample((i * track.length) / samples).position);
        center.multiplyScalar(1 / samples);
        // Halcyon's elevated loop climbs 500m: clear its tall bridge columns.
        const framing =
          id === 'halcyon'
            ? { side: -6, lift: 18, back: -9, toward: 0.8 }
            : { side: -4.5, lift: 3.5, back: -5.5, toward: 0.55 };
        const target = start.position.clone().lerp(center, framing.toward);
        const scale = Math.max(24, track.width);
        camera.position
          .copy(start.position)
          .addScaledVector(start.right, framing.side * scale)
          .addScaledVector(start.up, framing.lift * scale)
          .addScaledVector(start.tangent, framing.back * scale);
        camera.up.set(0, 1, 0);
        camera.fov = 58;
        camera.clearViewOffset();
        // Frame the crown and exposed road, rather than aiming through the
        // monolith toward the route's interior-weighted average.
        if (id === 'worldspire') {
          camera.position.set(1800, 10800, -2500);
          target.set(0, 8800, 0);
        }
        if (id === 'nightweir') {
          const station = track.curtains[2].s - 190;
          const frame = track.sample(station);
          camera.position
            .copy(frame.position)
            .addScaledVector(frame.tangent, -35)
            .addScaledVector(frame.up, 16);
          target
            .copy(track.sample(station + 130).position)
            .addScaledVector(frame.up, 18);
          camera.fov = 60;
          scene.getObjectByName(
            'Nightweir / the floodgates',
          ).userData.phaseOverride = 1;
        }
        camera.lookAt(target);
        camera.updateProjectionMatrix();
        // Let ordinary world updates relocate sky/weather around the free
        // camera and apply racer visibility before freezing this frame.
        await new Promise((done) =>
          requestAnimationFrame(() => requestAnimationFrame(done)),
        );
        game.setSuspended(true);
        // Nightweir composes transparent water in linear HDR on both presets.
        if (id !== 'nightweir') renderer.render(scene, camera);
        const canvas = document.createElement('canvas');
        canvas.width = 640;
        canvas.height = 400;
        canvas.getContext('2d').drawImage(renderer.domElement, 0, 0, 640, 400);
        return canvas.toDataURL('image/webp', 0.82).split(',')[1];
      }, route.id);
      await writeFile(
        resolve(output, `${route.id}.webp`),
        Buffer.from(data, 'base64'),
      );
      manifest.images[route.id] = {
        file: `${route.id}.webp`,
        ...previewSize,
        preset: previewPreset,
        sourceRevision,
        sourceDirty,
        routeSignature: route.routeSignature,
      };
      // Keep each image and its record paired even when a later capture fails.
      await writeFile(
        resolve(output, 'previews.json'),
        JSON.stringify(manifest, null, 2) + '\n',
      );
      console.log(`Captured: ${route.id}`);
    } finally {
      await context.close();
    }
  }
} finally {
  await browser.close();
}
