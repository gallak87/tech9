// External verifier: never copied into either release. It runs the unchanged
// staged main/preload/renderer with native DevTools still disabled, and drives
// the public DOM/input through Electron's main-process test API.
const { app, BrowserWindow, session, Menu } = require('electron');
const assert = require('node:assert/strict');
const { join } = require('node:path');
const { writeFileSync, mkdirSync } = require('node:fs');
const stage = process.env.VN_PROBE_STAGE;
const manifest = require(join(stage, 'release-manifest.json'));
assert.equal(manifest.edition, process.env.VN_PROBE_EDITION);
app.setPath('appData', process.env.VN_PROBE_PROFILE);
// Keep autonomous verification hidden. This override lives only in this file.
BrowserWindow.prototype.show = function () {};
const failures = [];
app.on('web-contents-created', (_event, contents) => {
  contents.on('console-message', (event) => {
    if (event.level === 'error' || event.level === 3) {
      failures.push(event.message);
      console.error('Renderer:', event.message);
    }
  });
});
require(join(stage, 'main.cjs'));
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
let window;
async function evaluate(expression) {
  return window.webContents.executeJavaScript(expression, true);
}
async function wait(expression, timeout = 120000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    if (window.isDestroyed()) throw new Error('Window closed unexpectedly');
    if (await evaluate(expression).catch(() => false)) return;
    await delay(150);
  }
  throw new Error(
    `Timed out: ${expression}\n${await evaluate('document.body.innerText')}\n${failures.join('\n')}`,
  );
}
async function click(selector) {
  await wait(
    `!!document.querySelector(${JSON.stringify(selector)}) && !document.querySelector(${JSON.stringify(selector)}).disabled`,
  );
  await evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);
}
function key(keyCode, type = 'keyDown') {
  window.webContents.sendInputEvent({ type, keyCode });
}
async function press(keyCode) {
  key(keyCode);
  key(keyCode, 'keyUp');
  await delay(100);
}
const menu = `!!document.querySelector('.race-menu') && !document.querySelector('#front-shell').hidden`;
const racing = `document.querySelector('#hud') && !document.querySelector('#hud').classList.contains('hidden') && document.querySelector('#front-shell').hidden`;
const paused = `document.querySelector('#pause-panel') && !document.querySelector('#pause-panel').classList.contains('hidden')`;
async function run() {
  await app.whenReady();
  window = BrowserWindow.getAllWindows()[0];
  window.webContents.setBackgroundThrottling(false);
  session.defaultSession.webRequest.onCompleted((details) => {
    if (details.statusCode >= 400)
      failures.push(`${details.statusCode} ${details.url}`);
  });
  await wait(menu);
  if (process.env.VN_PROBE_RESTART === '1') {
    assert.equal(
      await evaluate(
        `JSON.parse(localStorage.getItem('vector-nova.settings')).quality`,
      ),
      'low',
    );
    assert.deepEqual(
      await evaluate(
        `(() => { const s = JSON.parse(localStorage.getItem('vector-nova.settings')); return [s.controllerPreset, s.steeringDeadZone]; })()`,
      ),
      ['arcade', 0.22],
    );
    assert.equal(
      await evaluate(`localStorage.getItem('vector-nova.ship')`),
      'kestrel',
    );
    await click('[data-action="cup-hub"]');
    assert.equal(
      await evaluate(
        `JSON.parse(localStorage.getItem('vector-nova.cup.v1')).cupId`,
      ),
      manifest.edition === 'demo' ? 'demo' : 'founders',
    );
    await click('[data-action="cup-resume"]');
    await wait(racing);
    console.log(
      `PASS ${manifest.edition}: settings, ship and a resumable cup survive a complete app restart`,
    );
    await evaluate('window.vectorNovaDesktop.quit()');
    return;
  }
  const menuItems = (menu) =>
    (menu?.items ?? []).flatMap((item) => [item, ...menuItems(item.submenu)]);
  assert(
    !menuItems(Menu.getApplicationMenu()).some((item) =>
      /devtools|reload/i.test(`${item.role} ${item.label}`),
    ),
    'Native menu must not recreate development actions',
  );
  const prefs = window.webContents.getLastWebPreferences();
  for (const key of ['sandbox', 'contextIsolation', 'webSecurity'])
    assert.equal(prefs[key], true, key);
  for (const key of ['devTools', 'nodeIntegration', 'webviewTag'])
    assert.notEqual(prefs[key], true, key);
  window.webContents.openDevTools();
  assert.equal(window.webContents.isDevToolsOpened(), false);
  assert.deepEqual(
    await evaluate(`Object.keys(window).filter(k => k.startsWith('__VN'))`),
    [],
  );
  assert.equal(
    await evaluate(`typeof window.require + ':' + typeof window.process`),
    'undefined:undefined',
  );
  assert.deepEqual(
    await evaluate('Object.keys(window.vectorNovaDesktop).sort()'),
    ['quit', 'toggleFullscreen'],
  );
  const expected = [...manifest.levels].sort();
  assert.deepEqual(
    await evaluate(
      `[...document.querySelectorAll('button[data-level]')].map(b=>b.dataset.level).sort()`,
    ),
    expected,
  );
  // Attempt conventional URL/save unlocks; the executable catalog cannot grow.
  await evaluate(
    `localStorage.setItem('vector-nova.ship','needle'); localStorage.setItem('vector-nova.circuit','umbra'); localStorage.setItem('vector-nova.demo','false'); localStorage.setItem('vector-nova.settings',JSON.stringify({ quality:'low', volume:0.2 }));`,
  );
  await window.loadURL(
    'vn-game://app/index.html?dev=1&artPass=1&test=jump&review=shape&capture=1&demo=0&edition=full&level=umbra',
  );
  await wait(menu);
  assert.deepEqual(
    await evaluate(
      `[...document.querySelectorAll('button[data-level]')].map(b=>b.dataset.level).sort()`,
    ),
    expected,
  );
  assert.deepEqual(
    await evaluate(`Object.keys(window).filter(k => k.startsWith('__VN'))`),
    [],
  );
  await click('[data-action="ship-step"]');
  await wait(
    `document.querySelectorAll('button[data-ship]').length === ${manifest.ships.length}`,
  );
  assert.deepEqual(
    await evaluate(
      `[...document.querySelectorAll('button[data-ship]')].map(b=>b.dataset.ship).sort()`,
    ),
    [...manifest.ships].sort(),
  );
  await click('[data-ship="kestrel"]');
  await click('[data-action="settings"]');
  assert.equal(
    await evaluate(`document.querySelector('[data-setting="quality"]').value`),
    'low',
  );
  assert.equal(
    await evaluate('document.body.innerText.includes("Free camera")'),
    false,
  );
  await click('[data-action="settings-back"]');
  await click('[data-action="circuits"]');
  const levels = process.env.VN_PROBE_LEVELS
    ? process.env.VN_PROBE_LEVELS.split(',')
    : manifest.levels;
  for (const level of levels) {
    await click(`[data-level="${level}"]`);
    await click('[data-action="practice"]');
    await click('[data-action="launch"]');
    await wait(racing, 180000);
    assert.equal(
      await evaluate(
        '!!document.querySelector("#fly-controls, #fly-settings, #pause-explore")',
      ),
      false,
    );
    assert.deepEqual(
      await evaluate(`Object.keys(window).filter(k => k.startsWith('__VN'))`),
      [],
    );
    await press('F');
    await press('F12');
    assert.equal(window.webContents.isDevToolsOpened(), false);
    assert(await evaluate(racing));
    key('W');
    await delay(1200);
    key('W', 'keyUp');
    const speed = await evaluate(
      `Number(document.querySelector('#speed').textContent)`,
    );
    assert(speed > 5, `${level}: throttle must move the ship; speed=${speed}`);
    await press('Escape');
    await wait(paused);
    assert.equal(
      await evaluate('!!document.querySelector("#legend")'),
      false,
      'Steam omits the shortcut footer',
    );
    await click('#pause-tunes');
    assert(
      await evaluate(
        'document.activeElement.matches(".music-play") && !document.querySelector("#music-controls").hidden',
      ),
    );
    await press('Escape');
    assert(await evaluate('document.activeElement.id === "pause-tunes"'));
    assert(await evaluate(paused));
    await click('#pause-settings');
    await wait(`!!document.querySelector('[data-action="resume-session"]')`);
    assert.equal(
      await evaluate(
        `document.querySelector('[data-setting="controllerPreset"]').value`,
      ),
      'classic',
    );
    await click('[data-action="resume-session"]');
    await wait(paused);
    await click('#resume');
    await wait(racing);
    await press('Escape');
    await wait(paused);
    await click('#home');
    await wait(menu);
    assert.equal(
      await evaluate(
        `document.querySelector('.menu-selection[data-action="circuits"] strong').textContent.length > 0`,
      ),
      true,
    );
    if (process.env.VN_PROBE_CAPTURE && level === levels.at(-1)) {
      mkdirSync(process.env.VN_PROBE_CAPTURE, { recursive: true });
      writeFileSync(
        join(process.env.VN_PROBE_CAPTURE, `${manifest.edition}-menu.png`),
        (await window.webContents.capturePage()).toPNG(),
      );
    }
    console.log(
      `PASS ${manifest.edition}: ${level} offline loading, acceleration, pause, resume, return`,
    );
    await click('[data-action="circuits"]');
  }
  await click('[data-level="halcyon"]');
  await click('[data-action="quick-race"]');
  await click('[data-action="launch"]');
  await wait(racing);
  await delay(3500);
  assert(
    await evaluate(
      `document.querySelector('#position').textContent.includes('10')`,
    ),
  );
  await press('Escape');
  await wait(paused);
  await click('#home');
  await wait(menu);
  await click('[data-action="time-trial"]');
  await click('[data-action="launch"]');
  await wait(racing);
  await delay(3500);
  await press('Escape');
  await wait(paused);
  await click('#home');
  await wait(menu);
  for (const ship of manifest.ships.filter((id) => id !== 'kestrel')) {
    await click('[data-action="ship-step"]');
    await click(`[data-ship="${ship}"]`);
    await click('[data-action="practice"]');
    await click('[data-action="launch"]');
    await wait(racing);
    key('W');
    await delay(1200);
    key('W', 'keyUp');
    assert(
      await evaluate(
        `Number(document.querySelector('#speed').textContent) > 5`,
      ),
      `${ship} accelerates`,
    );
    await press('Escape');
    await wait(paused);
    await click('#home');
    await wait(menu);
    console.log(
      `PASS ${manifest.edition}: ${ship} selection, assets and driving`,
    );
  }
  await click('[data-action="ship-step"]');
  await click('[data-ship="kestrel"]');
  await click('[data-action="cup-hub"]');
  assert(
    await evaluate(
      `document.body.innerText.includes(${JSON.stringify(manifest.edition === 'demo' ? 'Demo Cup' : 'Founders Cup')})`,
    ),
  );
  assert.equal(
    await evaluate(`document.querySelectorAll('[data-cup]').length`),
    manifest.edition === 'demo' ? 1 : 4,
  );
  await click('[data-action="cup-start"]');
  await wait(racing);
  await delay(3500);
  assert(
    await evaluate(
      `document.querySelector('#position').textContent.includes('10')`,
    ),
  );
  await press('Escape');
  await wait(paused);
  await click('#home');
  await wait(menu);
  await click('[data-action="inspect"]');
  await wait(
    `!!document.querySelector('#inspect-back') && !document.querySelector('#inspector-host').inert`,
  );
  assert.deepEqual(
    await evaluate(`Object.keys(window).filter(k => k.startsWith('__VN'))`),
    [],
  );
  assert.equal(
    await evaluate(`!!document.querySelector('#inspection-rivals-tab')`),
    false,
  );
  await click('#inspect-back');
  await wait(menu);
  // Controller menu action through the real adapter, with a synthetic standard pad.
  await evaluate(
    `window.__testPad={connected:true,mapping:'standard',axes:[0,0],buttons:Array.from({length:16},()=>({pressed:false,value:0}))}; Object.defineProperty(navigator,'getGamepads',{value:()=>[window.__testPad], configurable:true}); document.querySelector('[data-action="tunes"]').focus();`,
  );
  await delay(200);
  await evaluate('window.__testPad.buttons[0].pressed=true;');
  await wait(
    `document.activeElement.matches('.music-play') && document.querySelector('[data-music-player]').hasAttribute('data-menu-active')`,
  );
  const wasPaused = await evaluate('document.querySelector("audio").paused');
  await evaluate(
    'window.__testPad.buttons[0].pressed=false; window.__testPad.buttons[8].pressed=true;',
  );
  await wait(`document.querySelector('audio').paused === ${!wasPaused}`);
  await delay(450);
  assert.equal(
    await evaluate('document.querySelector("audio").paused'),
    !wasPaused,
    'View toggles music once while held',
  );
  await evaluate(
    'window.__testPad.buttons[8].pressed=false; window.__testPad.buttons[1].pressed=true;',
  );
  await wait(`document.activeElement.matches('[data-action="tunes"]')`);
  await evaluate(
    `window.__testPad.buttons[1].pressed=false; document.querySelector('[data-action="settings"]').focus();`,
  );
  await delay(200);
  await evaluate('window.__testPad.buttons[0].pressed=true;');
  await wait(`!!document.querySelector('[data-action="settings-back"]')`);
  await evaluate(
    `for (const [key, value] of [['controllerPreset', 'arcade'], ['steeringDeadZone', '0.22']]) { const control = document.querySelector('[data-setting="' + key + '"]'); control.value = value; control.dispatchEvent(new Event('change', { bubbles:true })); }`,
  );
  await wait(
    `document.querySelector('[data-controller-action="boost"]').textContent === 'RT' && document.querySelector('#dead-zone-value').textContent === '22%'`,
  );

  await evaluate(
    'window.__testPad.buttons[0].pressed=false; window.__testPad.buttons[1].pressed=true;',
  );
  await wait(menu);
  await evaluate(
    'delete window.__testPad; Object.defineProperty(navigator,"getGamepads",{value:()=>[], configurable:true});',
  );
  assert.equal(failures.length, 0, failures.join('\n'));
  console.log(
    `PASS ${manifest.edition}: catalogs, tamper attempts, sandbox, CSP/assets, settings persistence, Quick Race, Time Trial, cups, inspector and controller menus`,
  );
  await evaluate('window.vectorNovaDesktop.quit()');
}
run().catch((error) => {
  console.error(error);
  app.exit(1);
});
