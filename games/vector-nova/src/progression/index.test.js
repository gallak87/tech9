import test from 'node:test';
import assert from 'node:assert/strict';

test('settings stay synchronized between menu/runtime and survive unavailable storage', async () => {
  const storage = new Map();
  globalThis.localStorage = {
    getItem: (key) => storage.get(key),
    setItem: (key, value) => storage.set(key, value),
  };
  try {
    const { loadSettings, saveSettings, subscribeSettings } =
      await import('./index.js');
    const menu = loadSettings();
    const runtime = loadSettings();
    const unsubscribeMenu = subscribeSettings((value) =>
      Object.assign(menu, value),
    );
    const unsubscribeRuntime = subscribeSettings((value) =>
      Object.assign(runtime, value),
    );
    saveSettings({ volume: 0.25, quality: 'low' });
    assert.equal(menu.volume, 0.25);
    assert.equal(runtime.quality, 'low');
    assert.equal(
      JSON.parse(storage.get('vector-nova.settings')).quality,
      'low',
    );
    runtime.volume = 0.7;
    assert.equal(menu.volume, 0.25, 'borrowed snapshots are independent');
    saveSettings(runtime);
    assert.equal(menu.volume, 0.7);
    globalThis.localStorage.setItem = () => {
      throw new Error('Storage blocked');
    };
    assert.equal(saveSettings({ reducedMotion: true }), false);
    assert.equal(menu.reducedMotion, true);
    assert.equal(runtime.reducedMotion, true);
    assert.equal(loadSettings().reducedMotion, true);
    unsubscribeMenu();
    unsubscribeRuntime();
    saveSettings({ volume: -5, difficulty: 'invalid' });
    assert.equal(loadSettings().volume, 0);
    assert.equal(loadSettings().difficulty, 'easy');
    assert.equal(menu.volume, 0.7, 'disposed consumers receive no updates');
  } finally {
    delete globalThis.localStorage;
  }
});
