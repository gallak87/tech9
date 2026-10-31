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
  contents.setAudioMuted(true);
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
  const target = `Array.from(document.querySelectorAll(${JSON.stringify(selector)})).find(element => element.getClientRects().length && !element.closest('[hidden], [inert]'))`;
  await wait(
    `(() => { const element = ${target}; return !!element && !element.disabled; })()`,
  );
  await evaluate(`(() => {
    const element = ${target};
    element.focus();
    // Focus previews may replace a card; activate its current native control.
    (${target}).click();
  })()`);
}
async function key(keyCode, type = 'keyDown') {
  // Native sendInputEvent requires an OS-focused window. The external verifier
  // stays hidden, so deliver trusted browser input without stealing host focus.
  const letter = /^[A-Z]$/.test(keyCode);
  await window.webContents.debugger.sendCommand('Input.dispatchKeyEvent', {
    type,
    key: letter ? keyCode.toLowerCase() : keyCode,
    code: letter ? `Key${keyCode}` : keyCode,
    text:
      type === 'keyDown'
        ? keyCode === 'Enter'
          ? '\r'
          : letter
            ? keyCode.toLowerCase()
            : ''
        : '',
    windowsVirtualKeyCode: letter
      ? keyCode.charCodeAt(0)
      : { Enter: 13, Escape: 27, F12: 123 }[keyCode],
  });
}
async function press(keyCode) {
  await key(keyCode);
  await key(keyCode, 'keyUp');
  await delay(100);
}
const menu = `!!document.querySelector('.race-menu') && !document.querySelector('#front-shell').hidden`;
const racing = `document.querySelector('#hud') && !document.querySelector('#hud').classList.contains('hidden') && document.querySelector('#front-shell').hidden`;
const paused = `document.querySelector('#pause-panel') && !document.querySelector('#pause-panel').classList.contains('hidden')`;
async function careerKey(key) {
  const { activeCareerKey, CAREER_SLOTS_KEY } =
    await import('./probe-helpers.mjs');
  const registry = await evaluate(
    `JSON.parse(localStorage.getItem(${JSON.stringify(CAREER_SLOTS_KEY)}))`,
  );
  return activeCareerKey(registry, key);
}
async function readCareer(key) {
  return evaluate(
    `localStorage.getItem(${JSON.stringify(await careerKey(key))})`,
  );
}
async function writeCareer(values) {
  for (const [key, value] of Object.entries(values))
    await evaluate(
      `localStorage.setItem(${JSON.stringify(await careerKey(key))}, ${JSON.stringify(value)})`,
    );
}
async function checkTitle() {
  await wait(
    `!!document.querySelector('[data-entry-stage="intro"] .entry-continue')`,
  );
  assert.equal(
    await evaluate(`document.querySelector('.entry-continue').textContent`),
    'Start',
  );
  assert.equal(
    await evaluate(`document.querySelectorAll('.entry-topbar').length`),
    0,
  );
  assert(
    await evaluate(
      `document.querySelector('[data-music-player]').getClientRects().length > 0`,
    ),
  );
}
async function enterCareer() {
  await checkTitle();
  assert(await evaluate(`document.activeElement.matches('.entry-continue')`));
  await press('Enter');
  await wait(
    `document.querySelectorAll('[data-entry-stage="profiles"] [data-career-slot]').length === 3`,
    10000,
  );
  await click('[data-career-slot="1"]');
  await wait(menu);
  await wait(`document.querySelector('.transfer-status')?.hidden === true`);
  // Also assert the slot namespace before any progression/selections are seeded.
  await careerKey('vector-nova.career.v1');
}
async function unlockFullFleet() {
  const { unlockedCareerSave } = await import('./probe-helpers.mjs');
  const text = unlockedCareerSave();
  await click('.menu-top-tabs [data-action="career"]');
  await wait(`!!document.querySelector('[data-save-file]')`);
  await evaluate(`(() => {
    const input = document.querySelector('[data-save-file]');
    const files = new DataTransfer();
    files.items.add(new File([${JSON.stringify(text)}], 'desktop-career.json', { type: 'application/json' }));
    input.files = files.files;
    input.dispatchEvent(new Event('change', { bubbles: true }));
  })()`);
  await click('[data-confirm-import]');
  await wait(
    `document.querySelector('.progression-notice')?.textContent.includes('Save imported.')`,
  );
  const profile = JSON.parse(await readCareer('vector-nova.career.v1'));
  for (const ship of ['bastion', 'needle', 'kestrel'])
    assert(profile.claims.includes(`ship-${ship}`));
  await click('[data-action="race-tab"]');
  await wait(menu);
}
async function checkCollection() {
  const total = manifest.edition === 'demo' ? 4 : 28;
  const claims =
    JSON.parse(await readCareer('vector-nova.career.v1'))?.claims ?? [];
  const progress = await evaluate(`(() => {
    const bar = document.querySelector('.career-progress-bar');
    const claims = ${JSON.stringify(claims)};
    const available = ${JSON.stringify(manifest.edition === 'demo' ? ['speed-1', 'equipment-jump', 'equipment-deflector', 'boost-1'] : null)};
    return {
      collected: Number(bar?.getAttribute('aria-valuenow')),
      total: Number(bar?.getAttribute('aria-valuemax')),
      notches: bar?.children.length,
      active: bar?.querySelectorAll('.is-earned').length,
      saved: available ? claims.filter(id => available.includes(id)).length : claims.length,
      styled: getComputedStyle(bar?.firstElementChild).backgroundImage.includes('linear-gradient'),
    };
  })()`);
  assert.equal(progress.total, total, 'collection uses the edition catalogue');
  assert.equal(progress.notches, total);
  assert.equal(progress.collected, progress.saved);
  assert.equal(progress.active, progress.saved);
  assert.equal(progress.styled, true, 'collection styles ship in Electron');
}
async function run() {
  await app.whenReady();
  window = BrowserWindow.getAllWindows()[0];
  assert.equal(window.webContents.isAudioMuted(), true);
  window.webContents.setBackgroundThrottling(false);
  window.webContents.debugger.attach('1.3');
  await window.webContents.debugger.sendCommand(
    'Emulation.setFocusEmulationEnabled',
    {
      enabled: true,
    },
  );
  session.defaultSession.webRequest.onCompleted((details) => {
    if (details.statusCode >= 400)
      failures.push(`${details.statusCode} ${details.url}`);
  });
  await checkTitle();
  assert.equal(
    window.isFullScreenable(),
    true,
    'Native fullscreen must remain available when starting windowed',
  );
  assert.equal(
    await evaluate('window.vectorNovaDesktop.getFullscreen()'),
    window.isFullScreen(),
  );
  if (process.env.VN_PROBE_WINDOW_ONLY === '1') {
    console.log(
      `PASS ${manifest.edition}: native fullscreen enabled after startup`,
    );
    await evaluate('window.vectorNovaDesktop.quit()');
    return;
  }
  await enterCareer();
  await checkCollection();
  assert(
    await evaluate(
      '!!document.querySelector(".desktop-window-controls button[data-desktop-fullscreen]")',
    ),
  );
  assert.equal(
    await evaluate(
      `!!document.querySelector('.menu-links [data-action="desktop-fullscreen"]')`,
    ),
    false,
  );
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
    assert.equal(await readCareer('vector-nova.ship'), 'kestrel');
    await click('[data-action="cup-hub"]');
    assert.equal(
      JSON.parse(await readCareer('vector-nova.cup.v1')).cupId,
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
    ['getFullscreen', 'onFullscreenChange', 'quit', 'toggleFullscreen'],
  );
  const expected = [...manifest.levels].sort();
  assert.deepEqual(
    await evaluate(
      `[...document.querySelectorAll('button[data-level]')].map(b=>b.dataset.level).sort()`,
    ),
    expected,
  );
  if (manifest.edition === 'full') await unlockFullFleet();
  // Attempt conventional URL/save unlocks; the executable catalog cannot grow.
  await writeCareer({
    'vector-nova.ship': 'needle',
    'vector-nova.circuit': 'umbra',
  });
  await evaluate(
    `localStorage.setItem('vector-nova.demo','false'); localStorage.setItem('vector-nova.settings',JSON.stringify({ quality:'low', volume:0.2 }));`,
  );
  await window.loadURL(
    'vn-game://app/index.html?dev=1&artPass=1&test=jump&review=shape&capture=1&demo=0&edition=full&level=umbra',
  );
  await enterCareer();
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
  await click('button[data-ship="kestrel"]');
  await click('[data-action="race-tab"]');
  assert.equal(await readCareer('vector-nova.ship'), 'kestrel');
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
    await key('W');
    await delay(1200);
    await key('W', 'keyUp');
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
    assert.equal(
      await evaluate(
        `document.querySelector('#pause-panel [data-desktop-fullscreen]').checked`,
      ),
      window.isFullScreen(),
    );
    assert.equal(
      await evaluate('!!document.querySelector(".desktop-window-controls")'),
      false,
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
    await click(`button[data-ship="${ship}"]`);
    await click('[data-action="race-tab"]');
    assert.equal(await readCareer('vector-nova.ship'), ship);
    await click('[data-action="practice"]');
    await click('[data-action="launch"]');
    await wait(racing);
    await key('W');
    await delay(1200);
    await key('W', 'keyUp');
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
  await click('button[data-ship="kestrel"]');
  await click('[data-action="race-tab"]');
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
  assert.equal(
    await evaluate(`!!document.querySelector('[data-action="inspect"]')`),
    false,
    'The developer-only ship inspector must not ship',
  );
  await click('[data-action="garage-tab"]');
  await wait(
    `document.querySelector('.ship-preview')?.dataset.state === 'ready'`,
  );
  assert.deepEqual(
    await evaluate(`Object.keys(window).filter(k => k.startsWith('__VN'))`),
    [],
  );
  assert.equal(
    await evaluate(`!!document.querySelector('#inspection-rivals-tab')`),
    false,
  );
  await click('[data-action="race-tab"]');
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
  await checkCollection();
  console.log(
    `PASS ${manifest.edition}: catalogs, tamper attempts, sandbox, CSP/assets, settings persistence, Quick Race, Time Trial, cups, garage studio and controller menus`,
  );
  await evaluate('window.vectorNovaDesktop.quit()');
}
run().catch((error) => {
  console.error(error);
  app.exit(1);
});
