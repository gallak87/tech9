import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { access, readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

export const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../..',
);

export function argument(name, fallback) {
  const item = process.argv.find((value) => value.startsWith(`--${name}=`));
  if (item) return item.slice(name.length + 3);
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : fallback;
}

async function installedChromium() {
  if (process.env.CHROMIUM_PATH) return process.env.CHROMIUM_PATH;
  try {
    await access(chromium.executablePath());
    return chromium.executablePath();
  } catch {
    // Use an already-installed browser when Playwright's exact revision is absent.
  }
  const cache =
    process.env.PLAYWRIGHT_BROWSERS_PATH ||
    (process.platform === 'darwin'
      ? path.join(os.homedir(), 'Library/Caches/ms-playwright')
      : path.join(os.homedir(), '.cache/ms-playwright'));
  const folders = await readdir(cache).catch(() => []);
  // The macOS headless shell can silently use SwiftShader. Full Chromium's new
  // headless mode retains the real Metal GPU and produces representative frames.
  const orderedFolders = [
    ...folders
      .filter((folder) => folder.startsWith('chromium-'))
      .sort()
      .reverse(),
    ...folders
      .filter((folder) => folder.startsWith('chromium_headless_shell-'))
      .sort()
      .reverse(),
  ];
  for (const folder of orderedFolders) {
    const candidates = [
      'chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing',
      'chrome-mac-x64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing',
      'chrome-linux64/chrome',
      'chrome-headless-shell-mac-arm64/chrome-headless-shell',
      'chrome-headless-shell-mac-x64/chrome-headless-shell',
      'chrome-headless-shell-linux64/chrome-headless-shell',
    ];
    for (const relative of candidates) {
      const executable = path.join(cache, folder, relative);
      try {
        await access(executable);
        return executable;
      } catch {
        // Try the next layout.
      }
    }
  }
  return undefined;
}

async function startServer(mode) {
  if (process.env.SCENE_URL) return { url: process.env.SCENE_URL, close() {} };
  const packageInfo = JSON.parse(
    await readFile(path.join(root, 'package.json'), 'utf8'),
  );
  const port = Number(
    process.env.SCENE_PORT ??
      (mode === 'preview'
        ? (packageInfo.config?.previewPort ?? 4400)
        : (packageInfo.config?.devPort ?? 4399)),
  );
  if (!Number.isInteger(port) || port < 1024 || port > 65535)
    throw new Error('SCENE_PORT must be an integer between 1024 and 65535');
  const url = `http://127.0.0.1:${port}/`;
  const child = spawn(
    process.execPath,
    [
      path.join(root, 'node_modules/vite/bin/vite.js'),
      ...(mode === 'preview' ? ['preview'] : []),
      '--host',
      '127.0.0.1',
      '--port',
      String(port),
      '--strictPort',
    ],
    { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] },
  );
  let output = '';
  child.stdout.on('data', (chunk) => (output += chunk.toString()));
  child.stderr.on('data', (chunk) => (output += chunk.toString()));
  try {
    for (let attempt = 0; attempt < 100; attempt++) {
      if (child.exitCode !== null) {
        throw new Error(`Vite exited before startup: ${output}`);
      }
      await new Promise((resolve) => setTimeout(resolve, 150));
      const response = await fetch(url).catch(() => null);
      if (response?.ok && output.includes('Local:')) {
        return { url, close: () => child.kill('SIGTERM') };
      }
    }
    throw new Error(`Vite did not start: ${output}`);
  } catch (error) {
    child.kill('SIGTERM');
    throw error;
  }
}

export async function openScene({
  mode = 'dev',
  width = 1600,
  height = 1000,
  timeout = 120000,
} = {}) {
  const server = await startServer(mode);
  let browser;
  try {
    const executablePath = await installedChromium();
    browser = await chromium.launch({
      headless: process.env.HEADED !== '1',
      ...(executablePath ? { executablePath } : {}),
    });
    const context = await browser.newContext({
      viewport: { width, height },
      deviceScaleFactor: 1,
    });
    const page = await context.newPage();
    // Evidence must represent one loaded revision even if another agent edits
    // source during the run. This forest has no application WebSocket traffic.
    if (mode === 'dev') {
      await page.routeWebSocket('**/*', (socket) => {
        socket.send(JSON.stringify({ type: 'connected' }));
        socket.onMessage(() => {});
      });
    }
    const errors = { console: [], page: [], requests: [], webgl: [] };
    page.on('console', (message) => {
      if (message.type() === 'error') errors.console.push(message.text());
      if (
        /webgl.*(error|invalid)|GL_INVALID|GL_OUT_OF_MEMORY/i.test(
          message.text(),
        )
      )
        errors.webgl.push(message.text());
    });
    page.on('pageerror', (error) => errors.page.push(error.message));
    page.on('response', (response) => {
      if (response.status() >= 400)
        errors.requests.push(`${response.status()} ${response.url()}`);
    });
    page.on('requestfailed', (request) => {
      errors.requests.push(`${request.failure()?.errorText} ${request.url()}`);
    });
    const url = new URL(server.url);
    url.searchParams.set('test', '1');
    if (process.env.SIM_RATE)
      url.searchParams.set('rate', process.env.SIM_RATE);
    await page.goto(url.href, { waitUntil: 'domcontentloaded', timeout });
    await page.waitForFunction(
      () =>
        window.__SCENE_TEST__?.ready === true ||
        document.querySelector('.load-error') !== null,
      undefined,
      { timeout },
    );
    if (!(await page.evaluate(() => window.__SCENE_TEST__?.ready === true))) {
      throw new Error(
        `Scene startup failed: ${await page.locator('.load-error').textContent()}`,
      );
    }
    return {
      browser,
      page,
      errors,
      environment: {
        platform: process.platform,
        arch: process.arch,
        cpu: os.cpus()[0]?.model,
        browser: await browser.version(),
        browserExecutable: executablePath ?? chromium.executablePath(),
        headless: process.env.HEADED !== '1',
        viewport: { width, height },
      },
      snapshot: () => page.evaluate(() => window.__SCENE_TEST__.snapshot()),
      async close() {
        await browser.close();
        server.close();
      },
    };
  } catch (error) {
    if (browser) await browser.close();
    server.close();
    throw error;
  }
}

export async function samplePerformance(page, duration = 3500) {
  return page.evaluate(async (duration) => {
    const frames = [];
    let previous;
    const start = performance.now();
    await new Promise((resolve) => {
      function sample(now) {
        if (previous !== undefined) frames.push(now - previous);
        previous = now;
        if (now - start < duration) requestAnimationFrame(sample);
        else resolve();
      }
      requestAnimationFrame(sample);
    });
    const sorted = frames.filter((value) => value > 0).sort((a, b) => a - b);
    const mean = sorted.reduce((sum, value) => sum + value, 0) / sorted.length;
    const canvas = document.querySelector('canvas');
    const gl = canvas?.getContext('webgl2');
    const debug = gl?.getExtension('WEBGL_debug_renderer_info');
    return {
      samples: sorted.length,
      meanMs: mean,
      medianMs: sorted[Math.floor(sorted.length * 0.5)],
      p95Ms: sorted[Math.floor(sorted.length * 0.95)],
      meanFps: 1000 / mean,
      gpu: debug
        ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL)
        : 'unavailable',
      drawingBuffer: gl
        ? [gl.drawingBufferWidth, gl.drawingBufferHeight]
        : null,
      note: 'Observed browser requestAnimationFrame intervals; includes headless/browser scheduling and is not a production hardware FPS guarantee.',
    };
  }, duration);
}
