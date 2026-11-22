import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { readArtView } from '../src/core/art-pass.js';
import { levelAvailable } from '../src/levels/access.js';
import { canonicalLevelId } from '../src/levels/aliases.js';
import {
  collectPageErrors,
  launchVerificationBrowser,
} from './verification-browser.mjs';

const interceptorIds = [
  'interceptor',
  'interceptor-helion',
  'interceptor-nightweir',
];
const captureName = /^[a-zA-Z0-9][a-zA-Z0-9_-]*$/;
const viewport = { width: 1600, height: 900 };
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
function linkedView(spec, levelId) {
  const separator = spec.indexOf('=');
  const id = spec.slice(0, separator);
  if (separator < 1 || !captureName.test(id))
    throw new Error('Use --view-link <name>=<copied art-pass URL>.');
  const { searchParams } = new URL(spec.slice(separator + 1));
  if (
    searchParams.get('artPass') !== '1' ||
    canonicalLevelId(searchParams.get('level')) !== levelId
  )
    throw new Error(`View ${id} must be an art-pass link for ${levelId}.`);
  const pose = readArtView(searchParams);
  if (!pose.position)
    throw new Error(`View ${id} needs both cam and look coordinates.`);
  return { id, kind: 'link', pose };
}

async function readRenderedView(spec) {
  const game = window.__VN;
  const track = game.getTrack();
  const { camera, renderer } = game.getScene();
  let station = null;
  let pose = spec.pose;
  let bankUp;
  if (spec.kind !== 'link') {
    station = track.length * spec.fraction;
    const sample = (distance) => ({
      ...track.sample(distance),
      ...track.sampleSurface?.(distance, 0),
    });
    const frame = sample(station);
    const position = frame.position.clone();
    bankUp = frame.up.clone();
    let target, fov;
    if (spec.kind === 'drive') {
      position.addScaledVector(frame.tangent, -15).addScaledVector(bankUp, 7);
      target = sample(station + 35)
        .position.clone()
        .addScaledVector(bankUp, 1.2);
      fov = 64;
    } else {
      const scale = Math.max(28, track.width);
      position
        .addScaledVector(frame.right, spec.side * scale * 5)
        .addScaledVector(bankUp, scale * 3.5)
        .addScaledVector(frame.tangent, -scale * 3);
      target = sample(station + scale * 6)
        .position.clone()
        .addScaledVector(bankUp, scale * 0.5);
      fov = 60;
    }
    pose = { position: position.toArray(), target: target.toArray(), fov };
  }
  // A copied art-pass link starts with the runtime's world-up camera.
  camera.up.set(0, 1, 0);
  if (!game.setFlyView({ ...pose, fov: pose.fov ?? 64 }))
    throw new Error('Free camera did not accept the view.');
  if (bankUp) {
    // The free camera resets roll; restore the real bank for road views.
    camera.up.copy(bankUp).normalize();
    camera.lookAt(...pose.target);
  }
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
    tick: snapshot.tick,
    simulationTime: snapshot.vehicle.time,
    contextLost: renderer.getContext().isContextLost(),
    position: camera.position.toArray(),
    target: pose.target,
    up: camera.up.toArray(),
    fov: camera.fov,
    metrics: {
      calls: metrics.calls,
      triangles: metrics.triangles,
      estimatedGpuMiB: metrics.estimatedGpuMiB,
      pipeline: metrics.pipeline,
    },
  };
}

// Render the production art-pass entry with a fixed camera and simulation clock.
export async function runLevelArtCapture({ interceptorOnly = false } = {}) {
  const port = interceptorOnly ? 5213 : 5179;
  const { positionals, values } = parseArgs({
    allowPositionals: true,
    options: {
      round: { type: 'string', default: 'baseline' },
      out: { type: 'string' },
      quality: { type: 'string', default: 'high' },
      url: {
        type: 'string',
        default: process.env.VN_URL || `http://127.0.0.1:${port}`,
      },
      views: { type: 'string' },
      'view-link': { type: 'string', multiple: true, default: [] },
      help: { type: 'boolean', default: false },
    },
  });
  const command = interceptorOnly
    ? 'interceptor-art-capture'
    : 'level-art-capture';
  if (values.help) {
    console.log(`Usage: node tools/${command}.mjs <levelId> [round] [outputDir]
  --round <name>      Default: baseline
  --out <directory>  Default: .experiments/level-art/<round>
  --quality high|low|both  High by default; use Low for the final comparison
  --url <server>     Default: VN_URL or http://127.0.0.1:${port}
  --views <ids>      Comma-separated subset of the fixed views and named links
  --view-link '<id>=<url>'  Add a copied art-pass pose; can be repeated
Fixed views: ${standardViews.map((view) => view.id).join(', ')}
Levels: ${interceptorOnly ? interceptorIds.join(', ') : 'production level IDs from src/levels/'}
All views use 1600×900, real geometry, native postprocessing and muted headless Chrome.`);
    return;
  }
  const [requestedLevel, positionalRound, positionalOut] = positionals;
  const levelId = canonicalLevelId(requestedLevel);
  if (
    !/^[a-z][a-z0-9-]*$/.test(levelId ?? '') ||
    positionals.length > 3 ||
    (interceptorOnly && !interceptorIds.includes(levelId))
  )
    throw new Error(
      `Choose one production level ID. Run ${command}.mjs --help for options.`,
    );
  const metadataURL = new URL(
    `../src/levels/${levelId}/metadata.js`,
    import.meta.url,
  );
  const { default: metadata } = await import(metadataURL).catch((error) => {
    if (error.code === 'ERR_MODULE_NOT_FOUND' && error.url === metadataURL.href)
      throw new Error(`Unknown level: ${levelId}.`);
    throw error;
  });
  if (metadata.id !== levelId) throw new Error(`Unknown level: ${levelId}.`);

  const round = positionalRound ?? values.round;
  if (!captureName.test(round))
    throw new Error('Round must be a short alphanumeric name.');
  if (!['high', 'low', 'both'].includes(values.quality))
    throw new Error('Quality must be high, low or both.');
  const availableViews = new Map(standardViews.map((view) => [view.id, view]));
  for (const spec of values['view-link']) {
    const view = linkedView(spec, levelId);
    if (availableViews.has(view.id))
      throw new Error(`Duplicate view: ${view.id}.`);
    availableViews.set(view.id, view);
  }
  const requested = values.views?.split(',');
  if (requested?.some((id) => !availableViews.has(id)))
    throw new Error('Unknown view. Use --help to list the fixed view IDs.');
  const views = [...availableViews.values()].filter(
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
  const url = new URL(values.url);
  url.search = new URLSearchParams({
    artPass: '1',
    level: levelId,
    music: '0',
  });
  url.hash = '';
  if (!levelAvailable(levelId)) url.searchParams.set('dev', '1');
  const browser = await launchVerificationBrowser();
  try {
    for (const quality of qualities) {
      const context = await browser.newContext({
        viewport,
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
        const faults = collectPageErrors(page);
        await page.goto(url.href, { waitUntil: 'domcontentloaded' });
        await page.waitForFunction(
          () => {
            const frontend = window.__VN_FRONTEND?.getState();
            return (
              (frontend?.loadedId &&
                window.__VN?.ready &&
                window.__VN.getSnapshot().mode === 'fly') ||
              frontend?.error ||
              window.__ART_CAPTURE_ERROR
            );
          },
          null,
          { timeout: 90000 },
        );
        const ready = await page.evaluate(() => {
          const frontend = window.__VN_FRONTEND?.getState();
          const snapshot = window.__VN?.getSnapshot();
          return {
            error: frontend?.error || window.__ART_CAPTURE_ERROR,
            level: frontend?.loadedId,
            mode: snapshot?.mode,
            tick: snapshot?.tick,
            time: snapshot?.vehicle.time,
            quality: snapshot?.settings.quality,
          };
        });
        if (
          ready.error ||
          faults.length ||
          ready.level !== levelId ||
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
          const framing = await page.evaluate(readRenderedView, view);
          if (
            framing.mode !== 'fly' ||
            framing.tick !== ready.tick ||
            framing.simulationTime !== ready.time ||
            framing.contextLost ||
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
              viewport,
              browser: browser.version(),
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

if (resolve(process.argv[1] ?? '') === import.meta.filename)
  await runLevelArtCapture();
