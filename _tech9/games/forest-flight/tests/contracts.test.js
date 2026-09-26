import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_SETTINGS,
  loadSettings,
  saveSettings,
  validateSettings,
} from '../src/core/settings.js';
import {
  WORLD_SIZE,
  WORLD_HALF,
  createRandom,
  pathCenter,
  pathDistance,
  pathWidth,
  terrainHeight,
} from '../src/world/terrain.js';

test('untrusted persisted settings cannot produce unsupported or nonfinite rendering values', () => {
  const settings = validateSettings({
    quality: 'future-device',
    sunlight: Number.POSITIVE_INFINITY,
    atmosphere: -20,
    richness: 200,
    exposure: '1.2',
    unwanted: true,
  });
  assert.equal(settings.quality, DEFAULT_SETTINGS.quality);
  assert.equal(settings.sunlight, DEFAULT_SETTINGS.sunlight);
  assert.equal(settings.atmosphere, 0.4);
  assert.equal(settings.richness, 1.6);
  assert.equal(settings.exposure, DEFAULT_SETTINGS.exposure);
  assert.equal(Object.hasOwn(settings, 'unwanted'), false);
  assert.deepEqual(validateSettings(), DEFAULT_SETTINGS);
  assert.notEqual(validateSettings(), DEFAULT_SETTINGS);
});

test('settings recover from malformed storage and browser storage denial', () => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  let stored = '{broken-json';
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: () => stored,
      setItem: (_, value) => {
        stored = value;
      },
    },
  });
  try {
    assert.deepEqual(loadSettings(), DEFAULT_SETTINGS);
    stored = 'null';
    assert.deepEqual(loadSettings(), DEFAULT_SETTINGS);
    const choice = {
      ...DEFAULT_SETTINGS,
      quality: 'balanced',
      atmosphere: 1.4,
    };
    saveSettings(choice);
    assert.deepEqual(loadSettings(), choice);
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      get() {
        throw new Error('Storage denied');
      },
    });
    assert.deepEqual(loadSettings(), DEFAULT_SETTINGS);
    assert.doesNotThrow(() => saveSettings(choice));
  } finally {
    if (previous) Object.defineProperty(globalThis, 'localStorage', previous);
    else delete globalThis.localStorage;
  }
});

test('the fixed landscape is finite, bounded and independent of evaluation order', () => {
  assert.equal(WORLD_SIZE, 160);
  assert.equal(WORLD_HALF * 2, WORLD_SIZE);
  const samples = [];
  for (let z = -WORLD_HALF; z <= WORLD_HALF; z += 2) {
    for (let x = -WORLD_HALF; x <= WORLD_HALF; x += 2) {
      const height = terrainHeight(x, z);
      assert.ok(Number.isFinite(height), `Invalid terrain at ${x}, ${z}`);
      assert.ok(
        height > -2 && height < 10,
        `Landscape exceeds authored scale at ${x}, ${z}`,
      );
      assert.ok(pathDistance(x, z) >= 0);
      samples.push({ x, z, height });
    }
  }
  for (const { x, z, height } of samples.reverse())
    assert.equal(terrainHeight(x, z), height);
});

test('the main trail stays inside the bounded map and supports a gentle continuous walk', () => {
  for (let z = -70; z < 70; z += 0.5) {
    const x = pathCenter(z);
    assert.ok(Math.abs(x) + pathWidth(z) < 76);
    assert.ok(pathWidth(z) > 1.2 && pathWidth(z) < 3);
    assert.equal(pathDistance(x, z), 0);
    const next = terrainHeight(pathCenter(z + 0.5), z + 0.5);
    assert.ok(
      Math.abs(next - terrainHeight(x, z)) < 0.2,
      `Abrupt trail step at z=${z}`,
    );
  }
});

test('seeded placement is reproducible and separated between asset populations', () => {
  const a = createRandom(731);
  const b = createRandom(731);
  const c = createRandom(732);
  const first = Array.from({ length: 512 }, a);
  assert.deepEqual(Array.from({ length: 512 }, b), first);
  assert.notDeepEqual(Array.from({ length: 512 }, c), first);
  assert.ok(first.every((value) => value >= 0 && value < 1));
});

test('settings namespaces prevent independent game forks from sharing choices', () => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  const storage = new Map();
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (key) => storage.get(key),
      setItem: (key, value) => storage.set(key, value),
    },
  });
  try {
    saveSettings(
      { ...DEFAULT_SETTINGS, quality: 'balanced' },
      'game-a.settings',
    );
    saveSettings({ ...DEFAULT_SETTINGS, quality: 'ultra' }, 'game-b.settings');
    assert.equal(loadSettings('game-a.settings').quality, 'balanced');
    assert.equal(loadSettings('game-b.settings').quality, 'ultra');
    assert.deepEqual(loadSettings('new-game.settings'), DEFAULT_SETTINGS);
  } finally {
    if (previous) Object.defineProperty(globalThis, 'localStorage', previous);
    else delete globalThis.localStorage;
  }
});
