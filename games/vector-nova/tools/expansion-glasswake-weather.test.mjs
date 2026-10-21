import test from 'node:test';
import assert from 'node:assert/strict';
import { createGlasswakeTrack } from '../src/levels/glasswake/track/model.js';
import { sampleGlasswakeWeather } from '../src/levels/glasswake/weather/state.js';
import { createGlasswakeWeather } from '../src/levels/glasswake/weather/index.js';
import * as T from 'three';
const track = createGlasswakeTrack();
test('ambient snow advances before green, carries into racing and freezes on pause', (t) => {
  let now = 0;
  t.mock.method(performance, 'now', () => now * 1000);
  const weather = createGlasswakeWeather({ track });
  t.after(() => weather.dispose());
  const state = Object.freeze({ distance: 0, time: 0, speed: 0 });
  weather.update({ state, mode: 'title', reset: true });
  now = 0.1;
  weather.update({ state, mode: 'title' });
  assert.equal(weather.snapshot().time, 0.1);
  assert.ok(weather.snapshot().particles > 0);
  weather.update({ state, mode: 'countdown', reset: true });
  now = 0.2;
  weather.update({ state, mode: 'countdown' });
  assert.equal(weather.snapshot().time, 0.2);
  const racing = { ...state, time: 0.5 };
  weather.update({ state: racing, mode: 'racing' });
  assert.equal(weather.snapshot().time, 0.7);
  now = 20;
  weather.update({ state: racing, mode: 'paused' });
  assert.equal(weather.snapshot().time, 0.7);
  weather.update({
    state: racing,
    mode: 'paused',
    settings: { reducedMotion: true },
  });
  assert.equal(weather.snapshot().time, 0);
  weather.update({ state, mode: 'racing', reset: true });
  assert.equal(weather.snapshot().time, 0);
  assert.equal(state.time, 0, 'weather never advances the race clock');
});
test('weather is absolute, sheltered and independent of driving state', () => {
  const rim = {
    distance: track.sections.find((s) => s.id === 'rim').showcase,
    time: 26,
    speed: 80,
  };
  const copy = structuredClone(rim);
  const a = sampleGlasswakeWeather(track, rim);
  const b = sampleGlasswakeWeather(track, { ...rim, time: 0 });
  assert.ok(a.storm > 0.4);
  assert.notEqual(a.gust, b.gust);
  assert.deepEqual(sampleGlasswakeWeather(track, rim), a);
  assert.deepEqual(rim, copy);
  const shelter = sampleGlasswakeWeather(track, {
    ...rim,
    distance: track.sections.find((s) => s.id === 'gallery').showcase,
  });
  assert.ok(shelter.storm < 0.01);
  assert.ok(shelter.sheltered);
  assert.equal(
    sampleGlasswakeWeather(track, rim, { reducedMotion: true }).time,
    0,
  );
});
test('snow volumes preserve phase across presets, suppress review and dispose each resource once', () => {
  const weather = createGlasswakeWeather({ track });
  const camera = new T.PerspectiveCamera();
  const state = {
    distance: track.sections.find((s) => s.id === 'rim').showcase,
    time: 18,
    speed: 80,
  };
  weather.update({ state, camera, settings: { quality: 'high' } });
  const high = weather.snapshot();
  weather.update({ state, camera, settings: { quality: 'low' } });
  const low = weather.snapshot();
  assert.equal(high.time, low.time);
  assert.equal(high.exposure, low.exposure);
  assert.ok(low.particles < high.particles);
  weather.update({ state, camera, reviewing: true });
  assert.equal(weather.snapshot().particles, 0);
  let count = 0;
  for (const mesh of weather.group.children) {
    mesh.geometry.addEventListener('dispose', () => count++);
    mesh.material.addEventListener('dispose', () => count++);
  }
  weather.dispose();
  weather.dispose();
  assert.equal(count, 6);
  assert.equal(weather.group.children.length, 0);
  const shape = createGlasswakeWeather({ track, shape: true });
  assert.equal(shape.group.children.length, 0);
  shape.dispose();
});
