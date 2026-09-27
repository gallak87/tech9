import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { access, readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
export const root = fileURLToPath(new URL('../..', import.meta.url));
export async function installedChromium() {
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

export async function openCoast({
  width = 1440,
  height = 960,
  touch = false,
} = {}) {
  const pkg = JSON.parse(
    await readFile(path.join(root, 'package.json'), 'utf8'),
  );
  const port = Number(process.env.COAST_PORT ?? pkg.config.devPort);
  if (!Number.isInteger(port) || port < 1024 || port > 65535)
    throw new Error('Invalid COAST_PORT');
  let output = '',
    browser;
  const child = spawn(
    process.execPath,
    [
      path.join(root, 'node_modules/vite/bin/vite.js'),
      '--host',
      '127.0.0.1',
      '--port',
      String(port),
      '--strictPort',
    ],
    { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] },
  );
  child.stdout.on('data', (chunk) => (output += chunk));
  child.stderr.on('data', (chunk) => (output += chunk));
  const url = `http://127.0.0.1:${port}/`;
  try {
    for (let i = 0; i < 100; i++) {
      if (child.exitCode !== null)
        throw new Error(`Vite startup failed: ${output}`);
      await new Promise((resolve) => setTimeout(resolve, 100));
      if (output.includes('Local:') && (await fetch(url).catch(() => null))?.ok)
        break;
      if (i === 99) throw new Error(`Vite startup timed out: ${output}`);
    }
    browser = await chromium.launch({
      headless: true,
      executablePath: await installedChromium(),
    });
    const page = await browser.newPage({
      viewport: { width, height },
      deviceScaleFactor: touch ? 2 : 1,
      hasTouch: touch,
      isMobile: touch,
    });
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => {
      if (m.type() === 'error') errors.push(m.text());
    });
    page.on('response', (r) => {
      if (r.status() >= 400) errors.push(`${r.status()} ${r.url()}`);
    });
    await page.goto(url + '?test=1', { waitUntil: 'networkidle' });
    await page.waitForFunction(
      () =>
        window.__COAST_TEST__?.snapshot() ||
        !document.querySelector('#error').hidden,
    );
    if (await page.locator('#error').isVisible())
      throw new Error(await page.locator('#error-message').textContent());
    return {
      browser,
      page,
      errors,
      url,
      snapshot: () => page.evaluate(() => window.__COAST_TEST__.snapshot()),
      close: async () => {
        await browser.close();
        child.kill('SIGTERM');
      },
    };
  } catch (error) {
    await browser?.close();
    child.kill('SIGTERM');
    throw error;
  }
}
