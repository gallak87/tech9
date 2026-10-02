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
        assert.ok(result.lastBubble.position[1] < track.waterY);
        const frozen = effects.getPresentation();
        for (let n = 0; n < 4; n++) display();
        assert.deepEqual(effects.getPresentation(), frozen);
        effects.update(state.time, true, 'low');
        assert.equal(effects.getPresentation().activeBubbleCount, 0);
      } else assert.equal(result.bubbleEventCount, 0);
    } finally {
      runtime.dispose();
      release(effects);
    }
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
