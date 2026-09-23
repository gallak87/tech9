import test from 'node:test';
import assert from 'node:assert/strict';
import { AssetCache } from '../src/asset-cache.js';
import { mountLoadingProgress } from '../src/loading-progress.js';
import {
  chooseBootLoading,
  deviceProfile,
  loadingProfile,
  mobileSettingsHTML,
  normalizeMobilePreferences,
  touchEnabled,
} from '../src/mobile-preferences.js';

const tick = () => new Promise((resolve) => setImmediate(resolve));
function bootShell() {
  let continueLoading;
  const select = { value: 'full' };
  const bar = {};
  const count = {};
  const title = {};
  const loading = {
    innerHTML: '',
    querySelector(selector) {
      if (selector === 'select') return select;
      if (selector === 'progress') return bar;
      if (selector === '[data-loading-count]') return count;
      if (selector === '[data-loading-title]') return title;
      if (selector === 'button')
        return {
          addEventListener(event, callback) {
            assert.equal(event, 'click');
            continueLoading = callback;
          },
        };
      assert.fail(`Unexpected selector: ${selector}`);
    },
  };
  return {
    dataset: {},
    querySelector: () => loading,
    continue: () => continueLoading(),
    loading,
    select,
    bar,
    count,
    title,
  };
}

test('wide desktops start immediately, including touch laptops and stored handheld preferences', async () => {
  for (const device of [
    deviceProfile({ userAgent: 'MacIntel' }),
    deviceProfile({ userAgent: 'Windows', maxTouchPoints: 10, coarse: true }),
  ]) {
    const preferences = normalizeMobilePreferences({ loading: 'mobile' });
    const shell = bootShell();
    await chooseBootLoading(shell, preferences, device, null);
    assert.equal(shell.loading.innerHTML, '', 'No picker was mounted');
    assert.equal(loadingProfile(preferences, device), 'full');
    assert.equal(preferences.loadingChosen, false);
  }
});

test('phones and small screens wait for a choice before starting asset preparation', async () => {
  for (const device of [
    deviceProfile({ userAgent: 'iPhone', maxTouchPoints: 5 }),
    deviceProfile({ smallScreen: true }),
  ]) {
    const shell = bootShell();
    const preferences = normalizeMobilePreferences();
    let saved;
    let started = false;
    const boot = chooseBootLoading(shell, preferences, device, {
      setItem(key, value) {
        saved = JSON.parse(value);
      },
    }).then(() => {
      started = true;
    });
    await tick();
    assert.equal(started, false);
    assert.equal(shell.dataset.loadingChoice, 'true');
    shell.select.value = 'mobile';
    shell.continue();
    await boot;
    assert.equal(started, true);
    assert.equal(loadingProfile(preferences, device), 'mobile');
    assert.equal(saved.loadingChosen, true);
    assert.equal(shell.dataset.loadingChoice, undefined);
    assert.match(mobileSettingsHTML(preferences, device), /Asset loading/);
  }
});

test('small-screen loading choice does not enable touch controls, and saved choices skip the picker', async () => {
  const device = deviceProfile({ smallScreen: true });
  const preferences = normalizeMobilePreferences({
    loading: 'mobile',
    loadingChosen: true,
  });
  const shell = bootShell();
  await chooseBootLoading(shell, preferences, device, null);
  assert.equal(shell.loading.innerHTML, '');
  assert.equal(touchEnabled(preferences, device), false);
  assert.equal(loadingProfile(preferences, device), 'mobile');
  assert.equal(
    loadingProfile({ ...preferences, loading: 'full' }, device),
    'full',
  );
});

for (const profile of ['full', 'mobile']) {
  test(`${profile} progress counts only installed assets in the boot bundle`, async () => {
    const shell = bootShell();
    const waiting = new Map();
    let finishFirstInstall;
    const cache = new AssetCache({
      entries: ['shared', 'nearby', 'distant'].map((id) => ({ id })),
      dependencies: () => ({ key: 'nearby', ids: ['shared', 'nearby'] }),
      profile,
      load: (entry) => new Promise((resolve) => waiting.set(entry.id, resolve)),
      install: (entry) =>
        entry.id === 'shared'
          ? new Promise((resolve) => {
              finishFirstInstall = resolve;
            })
          : undefined,
      release: () => {},
    });
    const spec = cache.specification('nearby');
    cache.onProgress = mountLoadingProgress(shell.loading, spec.ids.length);
    const prepared = cache.prepare('nearby');
    assert.equal(shell.bar.value, 0);
    assert.equal(shell.bar.max, profile === 'mobile' ? 2 : 3);
    waiting.get('shared')({ width: 1, height: 1 });
    await tick();
    assert.equal(
      shell.bar.value,
      0,
      'Decoded artwork is not ready until installed',
    );
    finishFirstInstall();
    await tick();
    assert.equal(shell.bar.value, 1);
    assert.match(shell.count.textContent, profile === 'mobile' ? /50%/ : /33%/);
    for (const id of spec.ids.filter((id) => id !== 'shared'))
      waiting.get(id)({ width: 1, height: 1 });
    await prepared;
    assert.equal(shell.bar.value, shell.bar.max);
    assert.match(shell.count.textContent, /100%/);
    assert.equal(shell.title.textContent, 'Starting the expedition…');
    assert.equal(waiting.has('distant'), profile === 'full');
  });
}

test('failed artwork is not counted as ready or shown as 100 percent', async () => {
  const shell = bootShell();
  const cache = new AssetCache({
    entries: [{ id: 'ready' }, { id: 'failed' }],
    dependencies: () => ({ key: 'all', ids: ['ready', 'failed'] }),
    load: async (entry) => {
      if (entry.id === 'failed') throw new Error('Offline');
      return { width: 1, height: 1 };
    },
    install: () => {},
    release: () => {},
    onProgress: mountLoadingProgress(shell.loading, 2),
  });
  await assert.rejects(cache.prepare(), /Offline/);
  assert.equal(shell.bar.value, 1);
  assert.match(shell.count.textContent, /50%/);
  assert.notEqual(shell.title.textContent, 'Starting the expedition…');
});
