import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';

// Actual production renders only. No server, race simulation, evidence report,
// scene replacement or art-source mutation is performed by this capture tool.
const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: {
    round: { type: 'string', default: 'baseline' },
    out: { type: 'string' },
    quality: { type: 'string', default: 'high' },
    url: {
      type: 'string',
      default: process.env.VN_URL || 'http://127.0.0.1:5213',
    },
    views: { type: 'string' },
    help: { type: 'boolean', default: false },
  },
});
const levelIds = ['interceptor', 'interceptor-helion', 'interceptor-nightweir'];
const standardViews = [0, 0.15, 0.3, 0.48, 0.65, 0.82, 0.94].map(
  (fraction) => ({
    id: `drive-${String(Math.round(fraction * 100)).padStart(2, '0')}`,
    kind: 'drive',
    fraction,
  }),
);
standardViews.push(
  { id: 'district-20', kind: 'district', fraction: 0.2, side: -1 },
  { id: 'district-67', kind: 'district', fraction: 0.67, side: 1 },
);
if (values.help) {
  console.log(`Usage: node tools/interceptor-art-capture.mjs <levelId> [round] [outputDir]
  --round <name>      Default: baseline
  --out <directory>  Default: .experiments/level-art/<round>
  --quality high|low|both  High by default; use Low for the final comparison
  --url <server>     Default: VN_URL or http://127.0.0.1:5213
  --views <ids>      Optional comma-separated subset: ${standardViews.map((view) => view.id).join(',')}
Levels: ${levelIds.join(', ')}
All views use 1600×900, real geometry, native postprocessing and muted headless Chrome.`);
} else {
  const [levelId, positionalRound, positionalOut] = positionals;
  if (!levelIds.includes(levelId) || positionals.length > 3)
    throw new Error(
      `Choose one level: ${levelIds.join(', ')}. Use --help for options.`,
    );
  const round = positionalRound ?? values.round;
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]*$/.test(round))
    throw new Error('Round must be a short alphanumeric name.');
  if (!['high', 'low', 'both'].includes(values.quality))
    throw new Error('Quality must be high, low or both.');
  const requested = values.views?.split(',');
  if (requested?.some((id) => !standardViews.some((view) => view.id === id)))
    throw new Error('Unknown view. Use --help for the fixed view IDs.');
  const views = standardViews.filter(
    (view) => !requested || requested.includes(view.id),
  );
  const appRoot = resolve(import.meta.dirname, '..');
  const output = resolve(
    values.out ??
      positionalOut ??
      resolve(appRoot, '.experiments/level-art', round),
  );
  const qualities =
    values.quality === 'both' ? ['high', 'low'] : [values.quality];
  const browser = await chromium.launch({
    channel: 'chrome',
    headless: true,
    args: ['--mute-audio'],
  });
  try {
    for (const quality of qualities) {
      const context = await browser.newContext({
        viewport: { width: 1600, height: 900 },
        deviceScaleFactor: 1,
      });
      try {
        await context.addInitScript((preset) => {
          localStorage.setItem(
            'vector-nova.settings',
            JSON.stringify({
              quality: preset,
              reducedMotion: false,
              volume: 0,
            }),
          );
          window.addEventListener('error', (event) => {
            if (event.error) window.__ART_CAPTURE_ERROR = event.message;
          });
        }, quality);
        const page = await context.newPage();
        const faults = [];
        page.on('pageerror', (error) => faults.push(error.message));
        const url = new URL(values.url);
        url.search = new URLSearchParams({
          artPass: '1',
          level: levelId,
          music: '0',
        }).toString();
        await page.goto(url.href, { waitUntil: 'domcontentloaded' });
        await page.waitForFunction(
          () =>
            window.__VN?.ready ||
            window.__VN_FRONTEND?.getState().error ||
            window.__ART_CAPTURE_ERROR,
          null,
          { timeout: 90000 },
        );
        const ready = await page.evaluate(() => ({
          error:
            window.__VN_FRONTEND?.getState().error ||
            window.__ART_CAPTURE_ERROR,
          mode: window.__VN?.getSnapshot().mode,
          time: window.__VN?.getSnapshot().vehicle.time,
          quality: window.__VN?.getSnapshot().settings.quality,
        }));
        if (
          ready.error ||
          faults.length ||
          ready.mode !== 'fly' ||
          ready.quality !== quality
        )
          throw new Error(
            `Art pass failed: ${JSON.stringify({ ...ready, faults })}`,
          );
        await page.addStyleTag({
          content:
            '#interface, #front-shell, .transfer-status, .music-player { visibility: hidden !important; }',
        });
        const directory = resolve(output, quality, levelId);
        await mkdir(directory, { recursive: true });
        for (const view of views) {
          const framing = await page.evaluate(async (spec) => {
            const game = window.__VN;
            const track = game.getTrack();
            const { camera } = game.getScene();
            const station = track.length * spec.fraction;
            const sample = (distance) => ({
              ...track.sample(distance),
              ...track.sampleSurface?.(distance, 0),
            });
            const frame = sample(station);
            const position = frame.position.clone();
            let target, fov;
            if (spec.kind === 'drive') {
              position
                .addScaledVector(frame.tangent, -15)
                .addScaledVector(frame.up, 7);
              target = sample(station + 35)
                .position.clone()
                .addScaledVector(frame.up, 1.2);
              fov = 64;
            } else {
              const scale = Math.max(28, track.width);
              position
                .addScaledVector(frame.right, spec.side * scale * 5)
                .addScaledVector(frame.up, scale * 3.5)
                .addScaledVector(frame.tangent, -scale * 3);
              target = sample(station + scale * 6)
                .position.clone()
                .addScaledVector(frame.up, scale * 0.5);
              fov = 60;
            }
            if (
              !game.setFlyView({
                position: position.toArray(),
                target: target.toArray(),
                fov,
              })
            )
              throw new Error('Free camera did not accept the view.');
            // setFlyView synchronizes navigation but intentionally resets roll.
            // Restore this road's real up vector for banks and inversions.
            camera.up.copy(frame.up).normalize();
            camera.lookAt(target);
            camera.clearViewOffset();
            camera.updateProjectionMatrix();
            for (let rendered = 0; rendered < 6; rendered++)
              await new Promise((done) => requestAnimationFrame(done));
            const snapshot = game.getSnapshot();
            const metrics = game.getMetrics();
            return {
              station,
              length: track.length,
              mode: snapshot.mode,
              simulationTime: snapshot.vehicle.time,
              position: camera.position.toArray(),
              target: target.toArray(),
              up: camera.up.toArray(),
              fov: camera.fov,
              metrics: {
                calls: metrics.calls,
                triangles: metrics.triangles,
                estimatedGpuMiB: metrics.estimatedGpuMiB,
                pipeline: metrics.pipeline,
              },
            };
          }, view);
          if (
            framing.mode !== 'fly' ||
            framing.simulationTime !== ready.time ||
            faults.length
          )
            throw new Error(
              `Capture changed state: ${JSON.stringify({ framing, faults })}`,
            );
          const path = resolve(directory, `${view.id}.png`);
          await page.screenshot({ path, animations: 'disabled' });
          console.log(
            JSON.stringify({
              levelId,
              round,
              quality,
              view: view.id,
              path,
              ...framing,
            }),
          );
        }
      } finally {
        await context.close();
      }
    }
  } finally {
    await browser.close();
  }
}
