/* global window */
import assert from 'node:assert/strict';
import { execFile, spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { once } from 'node:events';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { forkBaseline, loadBaseline, readJson } from './lib/project.mjs';
import { STARTING_POINTS } from './lib/starting-points.mjs';
import { syncModules } from './sync-modules.mjs';

const framework = fileURLToPath(new URL('..', import.meta.url));
const execute = promisify(execFile);
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const json = (value) => `${JSON.stringify(value, null, 2)}\n`;
const commandEnv = {
  ...process.env,
  PATH: `${path.dirname(process.execPath)}${path.delimiter}${process.env.PATH ?? ''}`,
};

function verificationPlan(id, startingPoint, version) {
  return {
    schemaVersion: 2,
    id,
    title: `Verify ${startingPoint}`,
    pitch: 'Disposable standalone package integration verification.',
    startingPoint,
    baselineVersion: version,
    status: 'approved',
    authorization: {
      mode: 'delegated',
      basis:
        'The framework verification command creates disposable packages in ignored artifacts.',
    },
    scope: {
      mustHave: ['Standalone install, module copies and build'],
      outOfScope: ['New game development'],
    },
    milestones: [
      {
        id: 'verify',
        title: 'Verify package',
        deliverables: ['Disposable build'],
        acceptance: ['Install and build succeed'],
      },
    ],
    lanes: [
      { id: 'verify', role: 'integration', owns: ['src/**'], dependsOn: [] },
    ],
    validation: {
      commands: ['npm ci', 'npm run build'],
      playthrough: [
        'Exercise each minimal renderer when --browser is selected',
      ],
      performance: {
        targetFps: 60,
        viewport: { width: 960, height: 720 },
        quality: 'default',
      },
    },
    artGate: { threshold: 8, maxRounds: 4 },
    stopAfter:
      'Record verification and leave disposable packages in ignored artifacts.',
  };
}

async function packageCommand(directory, args, log) {
  try {
    const result = await execute('npm', args, {
      cwd: directory,
      env: commandEnv,
      maxBuffer: 16 * 1024 * 1024,
    });
    await writeFile(log, `${result.stdout}${result.stderr}`);
  } catch (error) {
    await writeFile(
      log,
      `${error.stdout ?? ''}${error.stderr ?? error.message}`,
    );
    throw new Error(
      `npm ${args.join(' ')} failed in ${directory}; see ${log}`,
      { cause: error },
    );
  }
}

/** Run only when this process has the session's browser/GPU capture slot. */
export async function verifyScaffoldBrowser(
  directory,
  artifactDirectory,
  port,
) {
  const { chromium } = await import('playwright');
  const server = spawn(
    process.execPath,
    [
      path.join(directory, 'node_modules/vite/bin/vite.js'),
      '--host',
      '127.0.0.1',
      '--strictPort',
      '--port',
      String(port),
    ],
    {
      cwd: directory,
      env: commandEnv,
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );
  let output = '';
  server.stdout.on('data', (data) => {
    output += data;
  });
  server.stderr.on('data', (data) => {
    output += data;
  });
  let browser;
  try {
    const url = `http://127.0.0.1:${port}/?test`;
    let ready = false;
    for (let attempt = 0; attempt < 100; attempt++) {
      if (server.exitCode !== null)
        throw new Error(`Dev server exited: ${output}`);
      try {
        ready = (await fetch(url)).ok;
      } catch {
        /* Wait for Vite. */
      }
      if (ready) break;
      await pause(100);
    }
    assert.ok(ready, `Dev server did not start: ${output}`);
    browser = await chromium.launch({
      headless: true,
      executablePath: process.env.CHROMIUM_PATH,
    });
    const context = await browser.newContext({
      viewport: { width: 960, height: 720 },
    });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (event) => {
      if (event.type() === 'error') errors.push(event.text());
    });
    await page.goto(url);
    await page.waitForFunction(() => window.__STARTER_TEST__);
    const snapshot = () =>
      page.evaluate(() => window.__STARTER_TEST__.snapshot());
    await page.keyboard.down('d');
    await page.waitForFunction(
      () => window.__STARTER_TEST__.snapshot().x > 0.08,
    );
    await page.keyboard.up('d');
    assert.ok(
      (await snapshot()).x > 0.08,
      'Keyboard movement should change the sample',
    );
    await page.getByRole('button', { name: 'Reset', exact: true }).click();
    assert.equal((await snapshot()).x, 0);
    const canvas = page.locator('canvas');
    await canvas.click();
    const bounds = await canvas.boundingBox();
    await page.mouse.move(
      bounds.x + bounds.width / 2,
      bounds.y + bounds.height / 2,
    );
    await page.mouse.down();
    await page.mouse.move(
      bounds.x + bounds.width * 0.7,
      bounds.y + bounds.height * 0.6,
      { steps: 4 },
    );
    await page.mouse.up();
    assert.ok(
      (await snapshot()).x > 0.2,
      'Pointer dragging should change the sample',
    );
    await page.keyboard.press('r');
    assert.equal((await snapshot()).x, 0);
    await page.keyboard.down('d');
    await page.waitForTimeout(100);
    await page.evaluate(() => window.dispatchEvent(new Event('blur')));
    const blurred = await snapshot();
    await page.waitForTimeout(100);
    await page.keyboard.up('d');
    assert.equal(
      (await snapshot()).x,
      blurred.x,
      'Focus loss should clear held input',
    );
    await page.setViewportSize({ width: 390, height: 740 });
    await page.waitForTimeout(100);
    assert.ok((await canvas.boundingBox()).width <= 390);
    // Chromium sends actual touch input through its input backend.
    const mobileBounds = await canvas.boundingBox();
    const client = await context.newCDPSession(page);
    const touch = {
      x: mobileBounds.x + mobileBounds.width / 2,
      y: mobileBounds.y + mobileBounds.height / 2,
    };
    await client.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [touch],
    });
    await client.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [{ x: touch.x + 50, y: touch.y + 30 }],
    });
    await client.send('Input.dispatchTouchEvent', {
      type: 'touchEnd',
      touchPoints: [],
    });
    assert.ok(
      (await snapshot()).x > blurred.x + 0.1,
      'Touch dragging should change the sample',
    );
    await page.screenshot({ path: path.join(artifactDirectory, 'mobile.png') });
    const report = {
      browser: browser.version(),
      viewport: page.viewportSize(),
      state: await snapshot(),
      errors,
    };
    await page.evaluate(() => window.dispatchEvent(new Event('pagehide')));
    assert.equal((await snapshot()).disposed, true);
    assert.equal(
      await canvas.count(),
      0,
      'Disposal should release the renderer surface',
    );
    assert.deepEqual(errors, []);
    report.disposal = {
      state: await snapshot(),
      canvasCount: await canvas.count(),
    };
    await writeFile(path.join(artifactDirectory, 'browser.json'), json(report));
    return report;
  } finally {
    if (browser) await browser.close();
    const exited = once(server, 'exit').catch(() => {});
    if (server.exitCode === null) {
      server.kill('SIGTERM');
      await exited;
    }
    await writeFile(path.join(artifactDirectory, 'server.log'), output);
  }
}

/** Fork the clean committed catalog, install package-owned dependencies and build. */
export async function verifyGeneration({
  root = framework,
  browser = false,
  offline = false,
} = {}) {
  await mkdir(path.join(root, '.artifacts/generation'), { recursive: true });
  const directory = await mkdtemp(
    path.join(root, '.artifacts/generation/run-'),
  );
  const relative = path.relative(root, directory).split(path.sep).join('/');
  const results = [];
  let port = 4620;
  for (const [name, descriptor] of Object.entries(STARTING_POINTS)) {
    const pkg = await loadBaseline(root, name);
    const moduleCheck = await syncModules({ root, from: name });
    const slug = `verify-${name.replaceAll('.', '-')}`;
    const planPath = `${relative}/${slug}.json`;
    await writeFile(
      path.join(root, planPath),
      json(verificationPlan(slug, name, pkg.version)),
    );
    const options = {
      root,
      slug,
      from: name,
      planPath,
      port,
      outputDirectory: `${relative}/packages`,
    };
    await forkBaseline({ ...options, dryRun: true });
    const fork = await forkBaseline(options);
    const game = path.join(root, fork.destination);
    const logs = path.join(directory, slug);
    await mkdir(logs);
    const receiptBytes = await readFile(path.join(game, 'tech9.json'));
    const planBytes = await readFile(path.join(game, 'GAME_PLAN.json'));
    const receipt = JSON.parse(receiptBytes);
    assert.equal(receipt.source.startingPoint, name);
    assert.equal(receipt.plan.sha256, hash(planBytes));
    const copied = await readJson(path.join(game, 'package.json'));
    assert.equal(copied.name, slug);
    assert.equal(copied.tech9.renderer, descriptor.renderer);
    await syncModules({ root, packagePath: fork.destination });
    await packageCommand(
      game,
      [
        'ci',
        '--ignore-scripts',
        '--no-audit',
        '--no-fund',
        '--cache',
        path.join(root, '.artifacts/npm-cache'),
        ...(offline ? ['--offline'] : []),
      ],
      path.join(logs, 'install.log'),
    );
    if (copied.scripts.test)
      await packageCommand(game, ['test'], path.join(logs, 'test.log'));
    await packageCommand(game, ['run', 'build'], path.join(logs, 'build.log'));
    if (browser && descriptor.kind === 'scaffold')
      await verifyScaffoldBrowser(game, logs, port);
    assert.deepEqual(
      await readFile(path.join(game, 'tech9.json')),
      receiptBytes,
    );
    assert.deepEqual(
      await readFile(path.join(game, 'GAME_PLAN.json')),
      planBytes,
    );
    results.push({
      name,
      sourceCommit: fork.sourceCommit,
      destination: fork.destination,
      modules: moduleCheck.modules,
      built: true,
      browser: browser && descriptor.kind === 'scaffold',
    });
    port += 2;
    console.log(
      `Verified ${name}: owned dependencies, module copies, immutable receipt and build${browser && descriptor.kind === 'scaffold' ? ', real input and disposal' : ''}.`,
    );
  }
  await writeFile(path.join(directory, 'report.json'), json(results));
  return { directory, results };
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const args = process.argv.slice(2);
  try {
    if (
      args.some((arg) => !['--browser', '--offline'].includes(arg)) ||
      new Set(args).size !== args.length
    )
      throw new Error(
        'Usage: node tools/verify-generation.mjs [--offline] [--browser] (serialize browser/GPU checks)',
      );
    console.log(
      JSON.stringify(
        await verifyGeneration({
          browser: args.includes('--browser'),
          offline: args.includes('--offline'),
        }),
        null,
        2,
      ),
    );
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  }
}
