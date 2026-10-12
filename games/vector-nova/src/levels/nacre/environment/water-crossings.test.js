import test from 'node:test';
import assert from 'node:assert/strict';
import { Vector3, Quaternion } from 'three';
import { createNacreWaterCrossingEffects } from './water-crossings.js';
import { createLevel3Track } from '../track/model.js';
import { createNacreRuntime } from '../track/runtime.js';
import { createVehicleState } from '../../../physics/index.js';

const track = createLevel3Track();
const release = (effects) => {
  const owned = new Set();
  effects.group.traverse((object) => {
    if (object.geometry) owned.add(object.geometry);
    if (object.material) owned.add(object.material);
  });
  for (const resource of owned) resource.dispose();
};
test('actual submerged jump emits bounded takeoff, flight and landing bubbles; dry flight stays dry', () => {
  for (const jump of [1, 2]) {
    const effects = createNacreWaterCrossingEffects(track);
    const runtime = createNacreRuntime({ track });
    const state = {
      ...createVehicleState(),
      ...track.scenarios[`jump${jump}-success`],
    };
    runtime.reset({ state });
    const display = () => {
      const pose = runtime.pose(1);
      const f = track.sample(state.distance);
      const position =
        pose?.position ??
        f.position
          .clone()
          .addScaledVector(f.up, 0.72)
          .addScaledVector(f.right, state.lateral);
      effects.updateVehicle({
        position,
        quaternion: pose?.quaternion ?? f.quaternion,
        speed: state.speed,
        distance: state.distance,
        time: state.time,
        motion: runtime.snapshot(),
      });
      effects.update(state.time, false, 'high');
    };
    try {
      display();
      let landed = false;
      for (let tick = 0; tick < 1200 && !landed; tick++) {
        landed = runtime
          .advance(state, {}, 1 / 120)
          .some(
            (event) =>
              event.type === 'jump-transfer' &&
              event.payload.outcome === 'landed',
          );
        display();
        assert.ok(effects.getPresentation().activeBubbleCount <= 4);
      }
      assert.ok(landed);
      const result = effects.getPresentation();
      if (jump === 2) {
        assert.equal(result.bubbleEvents.takeoff, 1);
        assert.ok(result.bubbleEvents.flight > 0);
        assert.equal(result.bubbleEvents.landing, 1);
        assert.equal(result.activeLandingBubbleCount, 1);
        assert.ok(result.lastBubble.position[1] < track.waterY);
        assert.equal(result.lastBubble.kind, 'landing');
        assert.ok(result.lastBubble.lifetime > 2);
        const burst = effects.group.children.find(
          (object) =>
            object.isPoints &&
            object.material.uniforms.landingBurst.value === 1,
        );
        assert.ok(burst.visible);
        assert.ok(
          burst.position.distanceTo(
            new Vector3(...result.lastBubble.position),
          ) < 1,
          'Landing collar starts beside the hull, not far behind the departing craft',
        );
        const contactPosition = burst.position.clone();
        for (let n = 0; n < 36; n++) {
          runtime.advance(state, {}, 1 / 120);
          display();
        }
        assert.equal(effects.getPresentation().bubbleEvents.landing, 1);
        assert.ok(burst.position.distanceTo(contactPosition) > 20);
        const landedFrame = track.sample(state.distance);
        const shipPosition = landedFrame.position
          .clone()
          .addScaledVector(landedFrame.up, 0.72)
          .addScaledVector(landedFrame.right, state.lateral);
        assert.ok(
          burst.position.distanceTo(shipPosition) < 10,
          'Initial landing wake momentum keeps bubbles in the close chase view for .3 seconds',
        );
        const frozenPosition = burst.position.clone();
        const frozen = effects.getPresentation();
        for (let n = 0; n < 4; n++) display();
        assert.deepEqual(effects.getPresentation(), frozen);
        assert.ok(burst.position.equals(frozenPosition));
        effects.update(state.time, true, 'low');
        assert.equal(effects.getPresentation().activeBubbleCount, 0);
        effects.update(state.time + 1.8, false, 'low');
        assert.equal(effects.getPresentation().activeLandingBubbleCount, 1);
        assert.equal(effects.getPresentation().pointsPerSplash, 80);
        effects.update(state.time + 2.4, false, 'high');
        assert.equal(effects.getPresentation().activeLandingBubbleCount, 0);
        assert.equal(effects.getPresentation().bubbleEvents.landing, 1);
      } else assert.equal(result.bubbleEventCount, 0);
    } finally {
      runtime.dispose();
      release(effects);
    }
  }
});

test('a mode change or sea-level crossing without supported landing cannot emit a landing burst', () => {
  const effects = createNacreWaterCrossingEffects(track);
  const tick = (time, y, motionMode) => {
    effects.updateVehicle({
      position: new Vector3(0, y, time * 50),
      quaternion: new Quaternion(),
      speed: 100,
      time,
      motion: { mode: motionMode, landingSettle: null },
    });
    effects.update(time, false, 'high');
  };
  try {
    tick(0, 1, 'magnetic');
    tick(0.05, -2, 'magnetic');
    assert.equal(effects.getPresentation().eventCount, 1);
    assert.equal(effects.getPresentation().bubbleEvents.landing, 0);
    tick(0.1, -3, 'flight');
    tick(0.15, -3, 'magnetic');
    assert.equal(effects.getPresentation().bubbleEvents.landing, 0);
    assert.equal(effects.getPresentation().activeLandingBubbleCount, 0);
    tick(0.2, -3, 'recovery');
    tick(0.25, -3, 'magnetic');
    assert.equal(effects.getPresentation().bubbleEvents.landing, 0);
  } finally {
    release(effects);
  }
});

test('navigation, recovery teleport, pause and reset never synthesize submerged launch/landing bubbles', () => {
  const effects = createNacreWaterCrossingEffects(track);
  const tick = (time, z, motionMode, mode = 'racing', reset = false) => {
    effects.updateVehicle({
      position: new Vector3(0, -50, z),
      quaternion: new Quaternion(),
      speed: 100,
      time,
      motion: { mode: motionMode },
      mode,
      reset,
    });
    effects.update(time, false, 'high');
  };
  try {
    tick(0, 0, 'magnetic');
    tick(0.01, 1, 'flight', 'paused');
    assert.equal(effects.getPresentation().bubbleEventCount, 0);
    tick(0.02, 2, 'flight');
    assert.equal(effects.getPresentation().bubbleEvents.takeoff, 0);
    tick(0.03, 500, 'magnetic');
    assert.equal(effects.getPresentation().bubbleEventCount, 0);
    tick(0.04, 501, 'flight', 'racing', true);
    assert.equal(effects.getPresentation().bubbleEventCount, 0);
    tick(0.05, 502, 'magnetic', 'overview');
    assert.equal(effects.getPresentation().activeBubbleCount, 0);
  } finally {
    release(effects);
  }
});
