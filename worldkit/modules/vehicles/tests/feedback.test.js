import test from 'node:test';
import assert from 'node:assert/strict';
import { Mesh, PerspectiveCamera, Scene } from 'three';
import { DrivingFeedback } from '../src/DrivingFeedback.js';
import { VehicleMotion, VEHICLE_PRESETS } from '../src/VehicleMotion.js';

test('optional feedback consumes all presets, bounds particles, fades on pause and releases only its resources', () => {
  const scene = new Scene();
  const borrowed = new Mesh();
  scene.add(borrowed);
  const camera = new PerspectiveCamera();
  const feedback = new DrivingFeedback({ scene, camera });
  const dust = feedback.dust;
  let geometryDisposals = 0,
    materialDisposals = 0;
  dust.geometry.addEventListener('dispose', () => geometryDisposals++);
  dust.material.addEventListener('dispose', () => materialDisposals++);
  const capacity = dust.geometry.attributes.position.count;
  let state;
  for (const [vehicle, config] of Object.entries(VEHICLE_PRESETS)) {
    const motion = new VehicleMotion({
      config,
      world: {
        height: () => 0,
        bounds: { minX: -1000, maxX: 1000, minZ: -1000, maxZ: 1000 },
      },
    });
    for (let i = 0; i < 240; i++) {
      state = Object.freeze({
        ...motion.update(1 / 60, { throttle: 1 }),
        vehicle,
      });
      feedback.update(state, 1 / 60);
    }
    assert.ok(feedback.particles.some((particle) => particle.life > 0));
    assert.equal(dust.geometry.attributes.position.count, capacity);
    assert.ok(dust.geometry.attributes.position.array.every(Number.isFinite));
  }
  for (let i = 0; i < 300; i++)
    feedback.update({ ...state, paused: true }, 1 / 60);
  assert.ok(feedback.particles.every((particle) => particle.life === 0));
  assert.ok(feedback.alphas.every((alpha) => alpha === 0));
  feedback.dispose();
  feedback.dispose();
  feedback.update(state, 1 / 60);
  assert.equal(geometryDisposals, 1);
  assert.equal(materialDisposals, 1);
  assert.deepEqual(scene.children, [borrowed]);
});
