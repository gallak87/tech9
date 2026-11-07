import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { readFile } from 'node:fs/promises';
import {
  verificationBrowserOptions,
  collectPageErrors,
} from './verification-browser.mjs';
import {
  replaceOnce,
  insertRuntimeMethods,
  routeRuntimeProbe,
} from './runtime-probe.mjs';

test('verification launch keeps mute and extra arguments with explicit browser precedence', () => {
  assert.deepEqual(verificationBrowserOptions({}, {}), {
    headless: true,
    args: ['--mute-audio'],
    channel: 'chrome',
  });
  assert.deepEqual(
    verificationBrowserOptions(
      {
        args: ['--mute-audio', '--autoplay-policy=no-user-gesture-required'],
      },
      { VN_BROWSER_PATH: '/chosen/chrome', VN_BROWSER_CHANNEL: 'other' },
    ),
    {
      headless: true,
      args: ['--mute-audio', '--autoplay-policy=no-user-gesture-required'],
      executablePath: '/chosen/chrome',
    },
  );
  assert.equal(
    verificationBrowserOptions({}, { VN_BROWSER_CHANNEL: 'chromium' }).channel,
    'chromium',
  );
  assert.equal(
    Object.hasOwn(
      verificationBrowserOptions({ defaultChannel: null }, {}),
      'channel',
    ),
    false,
  );
});

test('page error collector preserves existing faults and optional reporting without collecting console noise', () => {
  const page = new EventEmitter(),
    faults = ['existing'],
    reported = [];
  assert.equal(
    collectPageErrors(page, faults, (message) => reported.push(message)),
    faults,
  );
  page.emit('console', { text: () => 'ordinary console output' });
  page.emit('pageerror', new Error('uncaught'));
  assert.deepEqual(faults, ['existing', 'uncaught']);
  assert.deepEqual(reported, ['uncaught']);
});

test('runtime probe insertion fails clearly for missing or ambiguous anchors and preserves literal replacement text', () => {
  assert.throws(() => insertRuntimeMethods('no runtime API', ''), /found 0/);
  assert.throws(
    () =>
      insertRuntimeMethods('      getSnapshot() {\n      getSnapshot() {', ''),
    /found 2/,
  );
  assert.equal(
    replaceOnce('before anchor after', 'anchor', '$&'),
    'before $& after',
  );
});

test('the current runtime still exposes exactly one browser-probe insertion point without importing it', async () => {
  const source = await readFile(
    new URL('../src/core/game.js', import.meta.url),
    'utf8',
  );
  assert.ok(
    insertRuntimeMethods(source, '      verify() {},').includes(
      '      verify() {},',
    ),
  );
});

test('runtime route adapter retains response metadata and inserts callable methods after its checked transform', async () => {
  const source =
    'const api = {\n      getSnapshot() { return "original"; }\n};';
  let handler, fulfilled;
  await routeRuntimeProbe(
    {
      route(pattern, run) {
        assert.equal(pattern, '**/src/core/game.js*');
        handler = run;
      },
    },
    '      verify() { return "probe"; },',
    {
      transform: (text) => replaceOnce(text, 'original', 'transformed'),
    },
  );
  const response = { text: async () => source };
  await handler({
    fetch: async () => response,
    fulfill(value) {
      fulfilled = value;
    },
  });
  assert.equal(fulfilled.response, response);
  const api = new Function(`${fulfilled.body}\nreturn api;`)();
  assert.equal(api.verify(), 'probe');
  assert.equal(api.getSnapshot(), 'transformed');
});
