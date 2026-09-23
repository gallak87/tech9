import test from 'node:test';
import assert from 'node:assert/strict';
import { TouchMovement, stickVector } from '../src/touch-input.js';
import {
  deviceProfile,
  touchEnabled,
  loadingProfile,
  normalizeMobilePreferences,
  readMobilePreferences,
} from '../src/mobile-preferences.js';
const center = { x: 60, y: 60, radius: 50 };
test('stick dead zone, proportional motion and diagonal clamp retain one speed budget', () => {
  assert.deepEqual(stickVector(5, 0, 50), { x: 0, y: 0 });
  const partial = stickVector(25, 0, 50);
  assert(partial.x > 0 && partial.x < 0.5);
  const diagonal = stickVector(90, 90, 50);
  assert(Math.abs(Math.hypot(diagonal.x, diagonal.y) - 1) < 1e-12);
});
test('only the owned pointer can move or release the stick; cancellation stops it', () => {
  const input = new TouchMovement();
  assert(input.begin(1, 60, 60, 0, center));
  assert(!input.begin(2, 10, 10, 1, center));
  input.update(1, 110, 60);
  assert.equal(input.movement.x, 1);
  assert(!input.end(2, 10));
  assert.equal(input.movement.active, true);
  input.end(1, 20, true);
  assert.deepEqual(input.movement, { x: 0, y: 0, active: false, run: false });
});
test('double-tap toggles on second down and can immediately become a running drag', () => {
  const input = new TouchMovement();
  input.begin(1, 60, 60, 0, center);
  input.end(1, 80);
  input.begin(2, 60, 60, 150, center);
  assert.equal(input.run, true);
  input.update(2, 110, 60);
  assert.deepEqual(input.movement, { x: 1, y: 0, active: true, run: true });
  input.end(2, 250);
  input.begin(3, 60, 60, 290, center);
  assert.equal(
    input.run,
    true,
    'third tap must not retoggle the completed double-tap',
  );
  input.reset();
  assert.equal(input.run, true);
  input.reset({ resetRun: true });
  assert.equal(input.run, false);
});
test('drag, long hold, cancel and disabled gesture cannot seed a run toggle', () => {
  for (const kind of ['drag', 'hold', 'cancel', 'disabled']) {
    const input = new TouchMovement();
    input.begin(1, 60, 60, 0, center);
    if (kind === 'drag') input.update(1, 90, 60);
    input.end(1, kind === 'hold' ? 400 : 70, kind === 'cancel');
    input.begin(2, 60, 60, kind === 'hold' ? 450 : 140, center, {
      doubleTap: kind !== 'disabled',
    });
    assert.equal(input.run, false, kind);
  }
});
test('touch controls, narrow layouts and handheld loading are independent', () => {
  const prefs = normalizeMobilePreferences({
    controls: 'on',
    loading: 'mobile',
  });
  const laptop = deviceProfile({
    userAgent: 'Windows',
    maxTouchPoints: 10,
    coarse: true,
  });
  assert(touchEnabled(prefs, laptop));
  assert.equal(loadingProfile(prefs, laptop), 'full');
  const phone = deviceProfile({
    userAgent: 'iPhone',
    maxTouchPoints: 5,
    coarse: true,
  });
  assert.equal(loadingProfile(prefs, phone), 'mobile');
  assert.equal(loadingProfile({ ...prefs, loading: 'full' }, phone), 'full');
  assert.equal(touchEnabled({ ...prefs, controls: 'off' }, phone), false);
  assert.equal(
    deviceProfile({ platform: 'MacIntel', maxTouchPoints: 5 }).handheld,
    true,
  );
});
test('malformed/blocked device preference storage falls back safely', () => {
  assert.equal(
    normalizeMobilePreferences({ controls: 'bad', zoom: 90 }).controls,
    'auto',
  );
  assert.equal(normalizeMobilePreferences(null).loading, 'full');
  assert.equal(
    readMobilePreferences({
      getItem() {
        throw Error('blocked');
      },
    }).loading,
    'full',
  );
});
