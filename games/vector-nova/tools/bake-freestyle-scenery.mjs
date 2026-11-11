import assert from 'node:assert/strict';
import { readFile, writeFile, rename, rm } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import {
  launchVerificationBrowser,
  collectPageErrors,
} from './verification-browser.mjs';

const root = resolve(import.meta.dirname, '..');
const base = process.env.VN_URL;
assert.ok(base, 'VN_URL must point to the selected checkout dev server');
const courses = {
  launchworks: 'Zephyr Skywell / suspended water gardens',
  'freestyle-oriel':
    'Oriel Sunvault / the inhabited cylinder and five arrival courts',
  'freestyle-ravel': 'Ravel Sailbreak / five folded-sail fleet stations',
};
const requested = process.argv.slice(2);
assert.ok(
  requested.every((id) => courses[id]),
  'Only current Freestyle courses can be baked',
);
const browser = await launchVerificationBrowser();
try {
  for (const id of requested.length ? requested : Object.keys(courses)) {
    const context = await browser.newContext({
      viewport: { width: 1280, height: 800 },
      deviceScaleFactor: 1,
    });
    try {
      await context.addInitScript(() =>
        localStorage.setItem(
          'vector-nova.settings',
          JSON.stringify({ quality: 'high', volume: 0, reducedMotion: true }),
        ),
      );
      const page = await context.newPage(),
        errors = collectPageErrors(page);
      // Authoring must remain able to rebuild stale collision data after a
      // route revision. This response-only road world never enters the game.
      await page.route(
        '**/src/freestyle/scenery-collision.js*',
        async (route) => {
          const response = await route.fetch(),
            source = await response.text();
          const anchor =
            /(async function createFreestyleCollisionWorld\([^)]*\)\s*\{)/;
          assert.match(
            source,
            anchor,
            'the current collision factory is present',
          );
          await route.fulfill({
            response,
            body: source.replace(
              anchor,
              `$1\nreturn collectProductionSolids({track,id: id + '-authoring-solids',geometryId: track.geometryVersion,road: createLaunchworksRoad({track,shape:true}),select: object => object.userData.drivingSurface ? {kind:'deck'} : /Low outboard rail/.test(object.name) ? {kind:'rail',roadBoundary:true} : null});\n`,
            ),
          });
        },
      );
      const sourcePaths = new Set();
      page.on('response', (response) => {
        const path = new URL(response.url()).pathname;
        if (/^\/assets\/levels\/.*\.glb$/.test(path)) sourcePaths.add(path);
      });
      console.log(`${id}: loading current environment`);
      await page.goto(
        new URL(`/?dev=2&intro=0&level=${id}&artPass=1&music=0`, base).href,
      );
      await page.waitForFunction(
        () => window.__VN?.ready || window.__VN_FRONTEND?.getState().error,
        null,
        { timeout: 120000 },
      );
      const failure = await page.evaluate(
        () => window.__VN_FRONTEND.getState().error,
      );
      assert.ok(!failure, `${id}: ${failure}`);
      const info = await page.evaluate(() => ({
        geometryVersion: window.__VN.getTrack().geometryVersion,
        jumps: window.__VN.getTrack().jumps.map((jump) => ({
          id: jump.id,
          start: jump.landingStart,
          end: jump.recovery,
        })),
      }));
      const parts = new Map();
      console.log(`${id}: environment ready`);
      for (const jump of info.jumps) {
        for (const s of [
          jump.start + 40,
          (jump.start + jump.end) / 2,
          jump.end - 40,
        ]) {
          await page.evaluate((distance) => {
            const { camera } = window.__VN.getScene();
            const frame = window.__VN.getTrack().sample(distance);
            camera.position.copy(frame.position).addScaledVector(frame.up, 30);
          }, s);
          // Let the ordinary environment owner select its full near geometry.
          await page.waitForTimeout(120);
          const batch = await page.evaluate(
            async ({ name, receiver }) => {
              const { collectReceiverScenery } =
                await import('/tools/freestyle-scenery-geometry.mjs');
              const track = window.__VN.getTrack(),
                scene = window.__VN.getScene().scene;
              const group = scene.getObjectByName(name);
              if (!group) throw new Error(`Missing live environment: ${name}`);
              return collectReceiverScenery(
                group,
                track,
                track.jumps.find((jump) => jump.id === receiver),
              );
            },
            { name: courses[id], receiver: jump.id },
          );
          for (const part of batch) {
            const key = createHash('sha256')
              .update(JSON.stringify(part))
              .digest('hex');
            parts.set(key, part);
          }
        }
        console.log(`${id}: sampled ${jump.id}`);
      }
      assert.deepEqual(errors, [], `${id}: no loading/composition failures`);
      assert.ok(parts.size, `${id}: authored surroundings are present`);
      const buffers = [],
        geometries = new Map(),
        instances = [];
      let triangleCount = 0;
      for (const part of parts.values()) {
        const positions = Buffer.from(new Float32Array(part.positions).buffer),
          indices = Buffer.from(new Uint32Array(part.indices).buffer);
        const hash = createHash('sha256')
          .update(positions)
          .update(indices)
          .digest('hex');
        if (!geometries.has(hash)) {
          geometries.set(hash, buffers.length);
          buffers.push({
            positions: positions.toString('base64'),
            indices: indices.toString('base64'),
          });
        }
        instances.push({
          name: part.name,
          receiver: part.receiver,
          geometry: geometries.get(hash),
          matrix: part.matrix,
        });
        triangleCount += part.indices.length / 3;
      }
      const sources = [];
      const assets = [...sourcePaths].sort();
      assert.ok(assets.length, `${id}: source GLBs are recorded`);
      for (const path of assets)
        sources.push({
          file: `public${path}`,
          sha256: createHash('sha256')
            .update(await readFile(resolve(root, `public${path}`)))
            .digest('hex'),
        });
      const kit = {
        version: 1,
        course: id,
        geometryVersion: info.geometryVersion,
        worldTolerance: {
          small: 0.025,
          landscape: 0.25,
          landscapeExtent: 80,
          solverSafetyFactor: 0.5,
        },
        triangleCount,
        sources,
        buffers,
        instances,
      };
      kit.fingerprint = createHash('sha256')
        .update(JSON.stringify(kit))
        .digest('hex');
      const output = resolve(root, `src/levels/${id}/landing-solids.json`);
      const temporary = `${output}.tmp`;
      try {
        await writeFile(temporary, JSON.stringify(kit, null, 2) + '\n');
        await rename(temporary, output);
      } finally {
        await rm(temporary, { force: true });
      }
      console.log(
        `${id}: ${triangleCount} scenery triangles, ${buffers.length} unique buffers, ${instances.length} placed parts`,
      );
    } finally {
      await context.close();
    }
  }
} finally {
  await browser.close();
}
