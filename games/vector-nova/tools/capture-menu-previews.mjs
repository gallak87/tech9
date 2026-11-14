import { chromium } from 'playwright';
import { levelAvailable } from '../src/levels/access.js';
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
const browser = await chromium.launch({
  channel: 'chrome',
  headless: true,
  args: ['--mute-audio'],
});
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
        new URL(
          `?level=${route.id}&artPass=1&music=0${levelAvailable(route.id) ? '' : '&dev=1'}`,
          base,
        ).href,
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
        () => window.__VN?.ready && window.__VN.getSnapshot().mode === 'fly',
      );
      const data = await page.evaluate(async (id) => {
        const game = window.__VN;
        const track = game.getTrack();
        const { scene, camera, renderer } = game.getScene();
        // Free camera already hides the player, rivals and driving effects.
        // Pull back from the grid and turn into the circuit, rather than taking
        // the title camera's close-up of the starting ship.
        if (game.getSnapshot().mode !== 'fly') game.fly();
        const start = track.sample(0);
        const center = start.position.clone().set(0, 0, 0);
        const samples = 180;
        for (let i = 0; i < samples; i++)
          center.add(track.sample((i * track.length) / samples).position);
        center.multiplyScalar(1 / samples);
        // Clear Halcyon’s tall bridge columns and Zephyr’s deep cathedral roofs.
        const framing =
          id === 'halcyon'
            ? { side: -6, lift: 18, back: -9, toward: 0.8 }
            : id === 'zephyr'
              ? { side: -14, lift: 13, back: -16, toward: 0.4 }
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
        if (id === 'zephyr-skywell') {
          // Crown's flight corridor reveals the court and receiving bank;
          // the generic starting overview is blocked by a foreground shore.
          const frame = track.sample(track.jumps[0].takeoff);
          const forward = frame.tangent.clone().setY(0).normalize();
          const right = forward.clone().set(forward.z, 0, -forward.x);
          camera.position
            .copy(frame.position)
            .addScaledVector(forward, 314.8)
            .addScaledVector(right, -2.3);
          camera.position.y += 10.1;
          target.copy(frame.position).addScaledVector(forward, 997.6);
          target.y -= 144;
          camera.fov = 72;
        }
        if (id === 'freestyle-oriel' || id === 'freestyle-ravel') {
          // Look from the open flight corridor toward a formed pipe arrival;
          // the starting overview hides these courses' defining destinations.
          const jump = track.jumps[id === 'freestyle-oriel' ? 0 : 1];
          const departure = track.sample(jump.takeoff);
          const receiver = track.sample(jump.landingStart);
          camera.position
            .copy(departure.position)
            .lerp(receiver.position, 0.45)
            .addScaledVector(departure.right, -24);
          camera.position.y += 65;
          target
            .copy(track.sample(jump.landingStart + 100).position)
            .addScaledVector(receiver.up, 14);
          camera.fov = 70;
        }
        const eliminatorPreview = {
          'eliminator-glasswake': 0.4,
          'eliminator-saffron': 0.245,
        }[id];
        if (eliminatorPreview !== undefined) {
          const station = track.length * eliminatorPreview - 110;
          const frame = track.sample(station);
          camera.position
            .copy(frame.position)
            .addScaledVector(frame.tangent, -30)
            .addScaledVector(frame.right, -18)
            .addScaledVector(frame.up, 25);
          target
            .copy(track.sample(station + 165).position)
            .addScaledVector(frame.up, 10);
          camera.up.copy(frame.up);
          camera.fov = 64;
        }
        // Frame the crown and exposed road, rather than aiming through the
        // monolith toward the route's interior-weighted average.
        if (id === 'vesper-forest') {
          // Frame the complete Sapling crown, amber approach and blue river.
          camera.position.set(-649.04, 456.26, -422.04);
          target.set(78.28, 296.85, 245.49);
          camera.fov = 64;
        }
        if (id === 'worldspire') {
          camera.position.set(1400, track.spireHeight + 650, -2200);
          target.set(0, track.spireHeight - 1450, 0);
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
        if (id === 'colossus') {
          const station = track.presses[0].distance - 145;
          const frame = track.sample(station);
          camera.position
            .copy(frame.position)
            .addScaledVector(frame.tangent, -40)
            .addScaledVector(frame.right, -36)
            .addScaledVector(frame.up, 36);
          target
            .copy(track.sample(station + 380).position)
            .addScaledVector(frame.up, 22);
          camera.fov = 62;
        }
        if (id === 'interceptor' || id === 'interceptor-helion') {
          // The generic rear overview sits inside Dispatch's new galleries.
          // Keep a clear road approach; Helion's exposed vault exit reveals
          // its defining stellar limb instead of a near shield's back face.
          const station = track.length * (id === 'interceptor' ? 0.04 : 0.15);
          const frame = track.sample(station);
          camera.position
            .copy(frame.position)
            .addScaledVector(frame.tangent, -30)
            .addScaledVector(frame.up, 14);
          target
            .copy(track.sample(station + 115).position)
            .addScaledVector(frame.up, 5);
          camera.up.copy(frame.up);
          camera.fov = 62;
        }

        if (id === 'ravel') {
          const station = (track.braid.splitEnd + track.braid.mergeStart) / 2;
          const frame = track.sample(station);
          camera.position
            .copy(frame.position)
            .addScaledVector(frame.right, 780)
            .addScaledVector(frame.up, 740)
            .addScaledVector(frame.tangent, -850);
          target
            .copy(track.sample(station + 180).position)
            .addScaledVector(frame.right, 100);
          camera.fov = 62;
        }
        if (id === 'nomad') {
          const transfer = track.jumps.find((jump) => jump.hero);
          const departure = track.sample(transfer.takeoff).position;
          const receiver = track.sample(transfer.landingStart + 180).position;
          const centre = departure.clone().lerp(receiver, 0.45);
          // View from the lower side, above the intervening salt shelves.
          camera.position.copy(centre);
          camera.position.x += 650;
          camera.position.y += 440;
          camera.position.z -= 700;
          target.copy(centre);
          target.y -= 35;
          target.z += 140;
          camera.fov = 58;
        }
        if (id === 'eliminator-nomad') {
          // Explain the race on the actual decks at thumbnail size. The full
          // convoy overview makes the drivable hold and receiver too small.
          const transfer = track.jumps[0];
          const frame = track.sample(transfer.takeoff - 140);
          camera.position
            .copy(frame.position)
            .addScaledVector(frame.tangent, -32)
            .addScaledVector(frame.up, 22);
          target
            .copy(track.sample(transfer.landingStart + 100).position)
            .addScaledVector(frame.up, 8);
          camera.up.copy(frame.up);
          camera.fov = 64;
        }
        if (id === 'oriel') {
          // Stay inside the habitat and show the inhabited ceiling, axial sun,
          // lakes and circumferential route together.
          camera.position.set(-140, 350, -1980);
          target.set(0, 1100, 1200);
          camera.fov = 74;
        }
        camera.lookAt(target);
        camera.updateProjectionMatrix();
        // Let ordinary world updates relocate sky/weather around the free
        // camera and apply racer visibility before freezing this frame.
        await new Promise((done) =>
          requestAnimationFrame(() => requestAnimationFrame(done)),
        );
        game.setSuspended(true);
        // Preserve the ordinary composer result for owned water/cloud passes
        // and the mission worlds’ authored presentation.
        if (
          ![
            'nightweir',
            'worldspire',
            'interceptor',
            'interceptor-helion',
            'interceptor-nightweir',
            'freestyle-oriel',
            'freestyle-ravel',
            'eliminator-glasswake',
            'eliminator-saffron',
            'eliminator-nomad',
          ].includes(id)
        )
          renderer.render(scene, camera);
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
