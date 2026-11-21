import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { EDITOR_BIOMES } from '../src/editor/biomes.js';
import {
  documentIdentity,
  generateDocument,
  ENVIRONMENT_LAYOUT_VERSION,
} from '../src/editor/document.js';
import { revealEditorAction, revealEditorField } from './editor-controls.mjs';
import { seedVerificationCareer } from './verification-career.mjs';
import {
  collectPageErrors,
  launchVerificationBrowser,
} from './verification-browser.mjs';

// Capture the editor's actual applied world, never a campaign preview or mockup.
// Usage: VN_URL=http://127.0.0.1:5335 node tools/capture-editor-presets.mjs
// Optional filters: nightweir or nightweir/waterfront; --list makes no browser.
// --missing resumes an interrupted pass; --pause-file=path stops after a style.
const root = resolve(import.meta.dirname, '..');
const args = process.argv.slice(2);
const requested = args.filter((arg) => !arg.startsWith('--'));
const styles = EDITOR_BIOMES.flatMap((biome) =>
  biome.presets.map((preset) => ({
    biome,
    preset,
    key: `${biome.id}/${preset.id}`,
  })),
);
for (const name of requested) {
  if (!styles.some(({ key, biome }) => key === name || biome.id === name))
    throw new Error(`Unknown editor biome/style: ${name}`);
}
let chosen = styles.filter(
  ({ key, biome }) =>
    !requested.length ||
    requested.includes(key) ||
    requested.includes(biome.id),
);
if (args.includes('--list')) {
  for (const { key } of chosen) console.log(key);
  process.exit(0);
}
const base = process.env.VN_URL;
if (!base) throw new Error('Set VN_URL to an isolated editor server.');
const output = resolve(root, 'public/assets/editor/environments');
const manifestPath = resolve(root, 'assets/editor/presets-manifest.json');
const roadOptions = Object.freeze({
  seed: 42017,
  length: 3000,
  bendiness: 0.35,
  elevation: 0.2,
  crossovers: 0,
  jumpFrequency: 'none',
  seedJumps: false,
  courseType: 'circuit',
  width: 40,
});
const environmentSeed = 88103;
const fixture = generateDocument({ ...roadOptions, environmentSeed });
fixture.name = 'Environment preview fixture';
const roadFingerprint = createHash('sha256')
  .update(JSON.stringify(fixture.points))
  .digest('hex');
const sourceRevision = execFileSync('git', ['rev-parse', 'HEAD'], {
  cwd: root,
  encoding: 'utf8',
}).trim();
const sourceDirty = Boolean(
  execFileSync(
    'git',
    [
      'status',
      '--porcelain',
      '--',
      '.',
      ':!public/assets/editor/environments',
      ':!assets/editor/presets-manifest.json',
    ],
    { cwd: root, encoding: 'utf8' },
  ).trim(),
);
let manifest;
try {
  manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
  manifest = { version: 1, images: {} };
}
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');
if (args.includes('--missing')) {
  const pending = [];
  for (const style of chosen) {
    const saved = manifest.images[style.key];
    try {
      if (
        !saved ||
        saved.layoutVersion !== ENVIRONMENT_LAYOUT_VERSION ||
        digest(await readFile(resolve(root, 'public', saved.file))) !==
          saved.sha256
      )
        pending.push(style);
      else await readFile(resolve(root, 'public', saved.metadataFile));
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      pending.push(style);
    }
  }
  chosen = pending;
}
if (!chosen.length) {
  console.log('All requested editor styles already captured.');
  process.exit(0);
}
const pauseFileArg = args.find((arg) => arg.startsWith('--pause-file='));
const pauseFile = pauseFileArg ? resolve(root, pauseFileArg.slice(13)) : null;
await mkdir(output, { recursive: true });
await mkdir(dirname(manifestPath), { recursive: true });
const browser = await launchVerificationBrowser();
const captured = [];

try {
  const context = await browser.newContext({
    viewport: { width: 1280, height: 1000 },
    deviceScaleFactor: 1,
  });
  try {
    await seedVerificationCareer(context);
    await context.addInitScript(() => {
      localStorage.setItem('startUpMusicOn', 'false');
      localStorage.setItem(
        'vector-nova.settings',
        JSON.stringify({
          quality: 'low',
          masterVolume: 0,
          volume: 0,
          musicVolume: 0,
          reducedMotion: true,
        }),
      );
    });
    const page = await context.newPage(),
      errors = [];
    collectPageErrors(page, errors);
    const native = async (work) => {
      for (let attempt = 0; ; attempt++) {
        try {
          return await work();
        } catch (error) {
          if (
            attempt >= 2 ||
            !/attached|detached|context was destroyed/i.test(error.message)
          )
            throw error;
          await page.evaluate(
            () =>
              new Promise((done) =>
                requestAnimationFrame(() => requestAnimationFrame(done)),
              ),
          );
        }
      }
    };
    const action = async (id) =>
      native(async () => (await revealEditorAction(page, id)).click());
    const field = async (id, value) =>
      native(async () => {
        const control = await revealEditorField(page, id);
        if (await control.evaluate((element) => element.tagName === 'SELECT'))
          await control.selectOption(String(value));
        else {
          await control.fill(String(value));
          await control.press('Tab');
        }
      });
    const ready = async () => {
      await page.waitForFunction(
        () => {
          const editor = window.__VN_FRONTEND?.getState().editor;
          return editor && !editor.busy && editor.preview?.worldReady;
        },
        null,
        { timeout: 120000 },
      );
      await page.evaluate(
        () =>
          new Promise((done) =>
            requestAnimationFrame(() => requestAnimationFrame(done)),
          ),
      );
    };
    await page.goto(new URL('?intro=0&editor=1&music=0', base).href);
    await page
      .locator('[data-editor-field="name"]')
      .waitFor({ timeout: 90000 });
    await ready();
    const chooser = page.waitForEvent('filechooser');
    await action('import');
    await (
      await chooser
    ).setFiles({
      name: 'environment-preview.vntrack.json',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify(fixture)),
    });
    await ready();
    for (const { biome, preset, key } of chosen) {
      errors.length = 0;
      await action('context-environment');
      await field('biome', biome.id);
      await action(`preset-${preset.id}`);
      await field('world-seed', environmentSeed);
      await action('regenerate-environment');
      await ready();
      await action('save');
      await ready();
      await page.waitForFunction(
        ({ biomeId, presetId, seed }) =>
          Object.keys(localStorage)
            .filter((key) => key.startsWith('vector-nova.tracks.v1.'))
            .map((key) => JSON.parse(localStorage.getItem(key)).document)
            .some(
              (document) =>
                document.name === 'Environment preview fixture' &&
                document.biome === biomeId &&
                document.settings.sceneryPreset === presetId &&
                document.environment.seed === seed,
            ),
        { biomeId: biome.id, presetId: preset.id, seed: environmentSeed },
        { timeout: 15000 },
      );
      const applied = await page.evaluate(() =>
        Object.keys(localStorage)
          .filter((key) => key.startsWith('vector-nova.tracks.v1.'))
          .map((key) => JSON.parse(localStorage.getItem(key)).document)
          .find((document) => document.name === 'Environment preview fixture'),
      );
      if (
        !applied ||
        applied.biome !== biome.id ||
        applied.settings.sceneryPreset !== preset.id ||
        applied.environment.seed !== environmentSeed ||
        applied.environment.layoutVersion !== ENVIRONMENT_LAYOUT_VERSION
      )
        throw new Error(
          `${key}: the applied document differs from the requested style (${JSON.stringify({ biome: applied?.biome, settings: applied?.settings, environment: applied?.environment })})`,
        );
      if (digest(JSON.stringify(applied.points)) !== roadFingerprint)
        throw new Error(`${key}: applying scenery changed the fixed road`);
      await action('global-close');
      const hiding = await page.addStyleTag({
        content: `
          .workshop-strip-editor .workshop-layout {
            grid-template-columns: minmax(0, 1fr);
            grid-template-rows: auto minmax(0, 1fr);
          }
          .workshop-strip-editor .workshop-main { grid-column: 1; grid-row: 2; }
          .workshop-global-nav { display: flex; }
          .workshop-global-panel, .workshop-inspector { display: none; }
          .workshop-preview-status, .workshop-status, .workshop-empty-hint, .workshop-fly-badge { visibility: hidden; }
        `,
      });
      await ready();
      const canvas = page.locator('[data-editor-world] canvas');
      const box = await canvas.boundingBox();
      await page.setViewportSize({
        width: 1280,
        height: page.viewportSize().height + 800 - Math.round(box.height),
      });
      await page.waitForFunction(
        () =>
          window.__VN_FRONTEND.getState().editor.preview?.viewport[1] === 800,
      );
      await action('context-road');
      await action('fit');
      await action('focus-selection');
      await action('zoom-out');
      await action('zoom-out');
      if (biome.id === 'worldspire') {
        // Its one complete monolith lives beyond the road, behind the ordinary
        // first-point camera. Use real preview gestures to include that asset.
        await action('fit');
        for (let i = 0; i < 8; i++) await action('zoom-out');
        const bounds = await canvas.boundingBox();
        const x = bounds.x + bounds.width * 0.65,
          y = bounds.y + bounds.height * 0.6;
        await page.mouse.move(x, y);
        await page.mouse.down({ button: 'right' });
        await page.mouse.move(x - Math.PI / 0.006, y - 102.5, { steps: 12 });
        await page.mouse.up({ button: 'right' });
        const panY = bounds.y + bounds.height * 0.35;
        await page.mouse.move(x, panY);
        await page.keyboard.down('Shift');
        await page.mouse.down({ button: 'right' });
        await page.mouse.move(x - 360, panY + 350, { steps: 12 });
        await page.mouse.up({ button: 'right' });
        await page.keyboard.up('Shift');
      }
      await action('context-environment');
      await ready();
      const editor = await page.evaluate(
        () => window.__VN_FRONTEND.getState().editor,
      );
      if (editor.context !== 'environment' || editor.preview.biome !== biome.id)
        throw new Error(
          `${key}: the preview does not show the requested applied biome`,
        );
      if (
        editor.preview.viewport[0] !== 1280 ||
        editor.preview.viewport[1] !== 800
      )
        throw new Error(
          `${key}: unexpected preview size ${editor.preview.viewport}`,
        );
      const png = await canvas.screenshot({
        type: 'png',
        animations: 'disabled',
      });
      await hiding.evaluate((element) => element.remove());
      const encoded = await page.evaluate(async (data) => {
        const image = new Image();
        image.src = `data:image/png;base64,${data}`;
        await image.decode();
        const target = document.createElement('canvas');
        target.width = 640;
        target.height = 400;
        target.getContext('2d').drawImage(image, 0, 0, 640, 400);
        return target.toDataURL('image/webp', 0.86).split(',')[1];
      }, png.toString('base64'));
      if (errors.length) throw new Error(`${key}: ${errors.join('; ')}`);
      const bytes = Buffer.from(encoded, 'base64'),
        stem = `${biome.id}-${preset.id}`;
      const file = `assets/editor/environments/${stem}.webp`,
        metadataFile = `assets/editor/environments/${stem}.json`;
      const metadata = {
        version: 1,
        biome: biome.id,
        preset: preset.id,
        recipe: {
          road: roadOptions,
          environmentSeed,
          scenery: applied.settings,
          layoutVersion: applied.environment.layoutVersion,
          framing:
            biome.id === 'worldspire'
              ? 'road overview, eight zoom-out steps, native orbit/pan framing the complete distant monolith'
              : 'selected first road point, then two zoom-out steps',
        },
        documentFingerprint: digest(JSON.stringify(applied)),
        documentIdentity: documentIdentity(applied),
        roadFingerprint,
        camera: editor.preview.camera,
        viewport: editor.preview.viewport,
        graphics: editor.preview.preset,
        image: {
          file,
          width: 640,
          height: 400,
          format: 'webp',
          quality: 0.86,
          sha256: digest(bytes),
        },
        source: { revision: sourceRevision, dirty: sourceDirty },
      };
      // Publishing into public/ reloads Vite clients. Keep the reused page alive
      // through the batch, then publish only after the browser closes.
      captured.push({ file, metadataFile, bytes, metadata });
      manifest.images[key] = {
        file,
        metadataFile,
        biome: biome.id,
        preset: preset.id,
        environmentSeed,
        layoutVersion: applied.environment.layoutVersion,
        documentFingerprint: metadata.documentFingerprint,
        camera: metadata.camera,
        sha256: digest(bytes),
        provenance:
          'Captured from the actual applied Vector Nova editor environment; no campaign image or generated illustration.',
        sourceRevision,
        sourceDirty,
      };
      console.log(`Captured editor ${key}`);
      if (pauseFile) {
        let pause = false;
        try {
          await readFile(pauseFile);
          pause = true;
        } catch (error) {
          if (error.code !== 'ENOENT') throw error;
        }
        if (pause) {
          console.log(
            'Paused after the completed style. Resume with --missing.',
          );
          break;
        }
      }
    }
  } finally {
    await context.close();
  }
} finally {
  await browser.close();
  for (const { file, metadataFile, bytes, metadata } of captured) {
    await writeFile(resolve(root, 'public', file), bytes);
    await writeFile(
      resolve(root, 'public', metadataFile),
      JSON.stringify(metadata, null, 2) + '\n',
    );
  }
  if (captured.length)
    await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
}
