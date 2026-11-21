// External, hidden verifier. No part of this file is copied into releases.
// Node launches two real Electron processes against the same disposable profile;
// Electron runs the unchanged staged main, preload and renderer each time.
const assert = require('node:assert/strict');
const { join, resolve } = require('node:path');
const fs = require('node:fs/promises');

if (!process.versions.electron) {
  const { spawn } = require('node:child_process');
  const { tmpdir } = require('node:os');
  async function verify() {
    const stage = resolve(
      process.argv[2] || join(__dirname, '../../.desktop/full'),
    );
    const profile = await fs.mkdtemp(join(tmpdir(), 'vector-nova-editor-'));
    try {
      for (const restart of ['0', '1'])
        await new Promise((done, reject) => {
          const child = spawn(require('electron'), [__filename], {
            stdio: 'inherit',
            env: {
              ...process.env,
              VN_EDITOR_PROBE_STAGE: stage,
              VN_EDITOR_PROBE_PROFILE: profile,
              VN_EDITOR_PROBE_RESTART: restart,
            },
          });
          const timer = setTimeout(() => {
            child.kill('SIGKILL');
            reject(
              new Error('Native editor verification exceeded three minutes.'),
            );
          }, 180000);
          child.once('error', (error) => {
            clearTimeout(timer);
            reject(error);
          });
          child.once('exit', (code) => {
            clearTimeout(timer);
            if (code === 0) done();
            else
              reject(new Error(`Native editor verification failed (${code}).`));
          });
        });
    } finally {
      await fs.rm(profile, { recursive: true, force: true });
    }
  }
  verify().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
} else {
  const { app, BrowserWindow, dialog } = require('electron');
  const stage = process.env.VN_EDITOR_PROBE_STAGE;
  const profile = process.env.VN_EDITOR_PROBE_PROFILE;
  const manifest = require(join(stage, 'release-manifest.json'));
  assert.equal(manifest.edition, 'full');
  app.setPath('appData', profile);
  BrowserWindow.prototype.show = function () {};
  app.on('web-contents-created', (_event, contents) =>
    contents.setAudioMuted(true),
  );
  let importPath = null,
    exportPath = null;
  dialog.showOpenDialog = async () =>
    importPath
      ? { canceled: false, filePaths: [importPath] }
      : { canceled: true, filePaths: [] };
  dialog.showSaveDialog = async () =>
    exportPath ? { canceled: false, filePath: exportPath } : { canceled: true };
  require(join(stage, 'main.cjs'));
  const delay = (ms) => new Promise((done) => setTimeout(done, ms));
  let window;
  const evaluate = (expression) =>
    window.webContents.executeJavaScript(expression, true);
  async function wait(expression) {
    const end = Date.now() + 90000;
    while (Date.now() < end) {
      if (await evaluate(expression).catch(() => false)) return;
      await delay(100);
    }
    throw new Error(
      `Timed out: ${expression}\n${await evaluate('document.body.innerText')}`,
    );
  }
  async function click(selector) {
    const target = `Array.from(document.querySelectorAll(${JSON.stringify(selector)})).find(element => element.getClientRects().length && !element.closest('[hidden], [inert]'))`;
    await wait(
      `(() => { const element = ${target}; return !!element && !element.disabled; })()`,
    );
    await evaluate(
      `(() => { const element = ${target}; element.focus(); element.click(); })()`,
    );
  }
  async function openWorkshop() {
    await click('.entry-continue');
    await click('[data-career-slot="1"]');
    await click('[data-action="track-editor"]');
    await wait(
      '!!document.querySelector("#track-editor-host #workshop-route-map")',
    );
    if (
      await evaluate(
        '!!document.querySelector("[data-editor-recovery]:not([hidden]) [data-editor-action=discard-recovery]")',
      )
    )
      await click('[data-editor-action="discard-recovery"]');
  }
  async function loadSaved(id, name) {
    await click('[data-editor-action="tab-library"]');
    await wait(
      `Array.from(document.querySelector('[data-editor-field="saved"]')?.options ?? []).some(option => option.value === ${JSON.stringify(id)})`,
    );
    await evaluate(
      `(() => { const select = document.querySelector('[data-editor-field="saved"]'); select.value = ${JSON.stringify(id)}; select.dispatchEvent(new Event('change', {bubbles:true})); })()`,
    );
    await click('[data-editor-action="load"]');
    await wait(
      `document.querySelector('[data-editor-field="name"]')?.value === ${JSON.stringify(name)}`,
    );
  }
  async function testNativeDrive() {
    await click('[data-editor-action="test"]');
    await wait(
      `!!document.querySelector('#editor-game-host #hud:not(.hidden)')`,
    );
    window.webContents.debugger.attach('1.3');
    const input = (type, key, code, value) =>
      window.webContents.debugger.sendCommand('Input.dispatchKeyEvent', {
        type,
        key,
        code,
        text: type === 'keyDown' && key === 'w' ? 'w' : '',
        windowsVirtualKeyCode: value,
      });
    await input('keyDown', 'w', 'KeyW', 87);
    try {
      await wait(
        `Number(document.querySelector('#editor-game-host #speed')?.textContent) > 0`,
      );
      await delay(600);
    } finally {
      await input('keyUp', 'w', 'KeyW', 87);
    }
    await input('keyDown', 'Escape', 'Escape', 27);
    await input('keyUp', 'Escape', 'Escape', 27);
    await wait(
      `!!document.querySelector('#editor-game-host #pause-panel:not(.hidden)')`,
    );
    await click('#editor-game-host #home');
    await wait(
      `!!document.querySelector('#track-editor-host:not([hidden]) #workshop-route-map')`,
    );
    window.webContents.debugger.detach();
    console.log(
      'PASS native editor: the Shatterline starter drives, pauses and returns to the editable draft.',
    );
  }
  const draft = {
    format: 'vector-nova-track',
    version: 1,
    id: 'track-native-probe',
    name: 'Native blank draft',
    biome: 'nightweir',
    generator: {
      version: 1,
      seed: 42,
      length: 3000,
      bendiness: 0.45,
      elevation: 0.35,
    },
    width: 40,
    points: [],
    settings: { density: 0.6, waterLevel: -28 },
    props: [],
  };
  async function run() {
    await app.whenReady();
    window = BrowserWindow.getAllWindows()[0];
    assert(window);
    window.webContents.setBackgroundThrottling(false);
    assert(window.webContents.isAudioMuted());
    await wait(
      '!!window.vectorNovaDesktop?.tracks && document.readyState === "complete"',
    );
    const preferences = window.webContents.getLastWebPreferences();
    assert.equal(preferences.sandbox, true);
    assert.equal(preferences.contextIsolation, true);
    assert.equal(preferences.nodeIntegration, false);
    assert.equal(await evaluate('typeof require'), 'undefined');
    assert.equal(await evaluate('typeof window.__VN'), 'undefined');
    const call = (name, value) =>
      evaluate(
        `window.vectorNovaDesktop.tracks[${JSON.stringify(name)}](${value === undefined ? '' : JSON.stringify(value)})`,
      );
    if (process.env.VN_EDITOR_PROBE_RESTART === '1') {
      assert.deepEqual(await call('read', draft.id), draft);
      const entries = await call('list');
      assert(
        entries.some(
          (entry) =>
            entry.id === draft.id &&
            entry.name === draft.name &&
            entry.updatedAt > 0,
        ),
      );
      const uiEntry = entries.find((entry) => entry.name === 'Native UI draft');
      assert(uiEntry, 'the UI-created draft survives process restart');
      await openWorkshop();
      const starter = entries.find((entry) => entry.biome === 'shatterline');
      assert(starter, 'the Shatterline starter survives process restart');
      await loadSaved(uiEntry.id, uiEntry.name);
      assert.equal((await call('read', uiEntry.id)).points.length, 0);
      await loadSaved(starter.id, starter.name);
      assert.equal((await call('read', starter.id)).jumps.length, 1);
      assert.equal(await call('remove', starter.id), true);
      assert.equal(await call('remove', uiEntry.id), true);
      assert.equal(await call('remove', draft.id), true);
      assert.equal(await call('read', draft.id), null);
      console.log(
        'PASS native editor: restart restores native and UI track files, library loads the saved draft; remove persists.',
      );
    } else {
      assert.deepEqual(await call('list'), []);
      assert.deepEqual(await call('save', draft), draft);
      assert.deepEqual(await call('read', draft.id), draft);
      assert.equal(await call('import'), null);
      assert.equal(await call('export', draft), null);
      importPath = join(profile, 'picked-track.json');
      exportPath = join(profile, 'exported-track.json');
      await fs.writeFile(
        importPath,
        JSON.stringify({
          ...draft,
          id: 'track-imported',
          name: 'Imported draft',
        }),
      );
      const imported = await call('import');
      assert.equal(imported.name, 'Imported draft');
      assert.equal(
        await call('read', imported.id),
        null,
        'import waits for an explicit save',
      );
      assert.equal(await call('export', draft), true);
      assert.deepEqual(
        JSON.parse(await fs.readFile(exportPath, 'utf8')),
        draft,
      );
      const rejected = await evaluate(
        `window.vectorNovaDesktop.tracks.read('../escape').then(() => false, () => true)`,
      );
      assert.equal(rejected, true);
      assert.deepEqual(
        JSON.parse(
          await fs.readFile(
            join(app.getPath('userData'), 'tracks', `${draft.id}.json`),
            'utf8',
          ),
        ),
        draft,
      );
      await openWorkshop();
      await evaluate(
        `(() => { const input = document.querySelector('[data-editor-field="name"]'); input.value = 'Native UI draft'; input.dispatchEvent(new Event('change', {bubbles:true})); })()`,
      );
      await click('[data-editor-action="save"]');
      await wait(
        '(async () => (await window.vectorNovaDesktop.tracks.list()).some(entry => entry.name === "Native UI draft"))()',
      );
      const uiEntry = (await call('list')).find(
        (entry) => entry.name === 'Native UI draft',
      );
      assert.equal((await call('read', uiEntry.id)).points.length, 0);
      await click('[data-editor-action="starter-palette-canyon"]');
      await click('[data-editor-action="save"]');
      await wait(
        '(async () => (await window.vectorNovaDesktop.tracks.list()).some(entry => entry.biome === "shatterline"))()',
      );
      const starter = (await call('list')).find(
        (entry) => entry.biome === 'shatterline',
      );
      assert.equal((await call('read', starter.id)).jumps.length, 1);
      await testNativeDrive();
      assert.equal(
        (await call('read', uiEntry.id)).points.length,
        0,
        'Test Drive does not overwrite the saved draft',
      );
      console.log(
        'PASS native editor: unchanged preload and sandbox, disk save/read, constrained IDs, native import/export and cancel.',
      );
    }
    app.exit(0);
  }
  run().catch((error) => {
    console.error(error);
    app.exit(1);
  });
}
