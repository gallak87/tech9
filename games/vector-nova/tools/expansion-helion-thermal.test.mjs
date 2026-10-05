import test from 'node:test';
import assert from 'node:assert/strict';
import {
  sampleHelionThermal,
  sampleHelionProminences,
  integrateHelionHeat,
  helionThrustScale,
} from '../src/levels/helion/thermal.js';
const track = {
  length: 5000,
  thermalZones: [
    { id: 'cool', kind: 'cooling', start: 100, end: 160 },
    { id: 'furnace', kind: 'furnace', start: 170, end: 240 },
    { id: 'flare', kind: 'flare', start: 300, end: 480, phase: 0 },
  ],
};
test('mandatory furnace exposes both lanes while physical sheltered flight cools', () => {
  for (const lateral of [-14, 0, 14]) {
    const sample = sampleHelionThermal(track, 200, lateral, 4);
    assert.equal(sample.exposure, 25);
    assert.equal(sample.cooling, 0);
    assert.equal(integrateHelionHeat(0, sample, 1), 25);
  }
  assert.equal(
    sampleHelionThermal(track, 200, 0, 4, { airborne: true }).exposure,
    0,
  );
});
test('flare boundary and physical sheltered detour agree over the complete cycle', () => {
  for (let time = 0; time <= 28; time += 0.025) {
    const center = sampleHelionThermal(track, 400, 0, time);
    const contact = sampleHelionThermal(track, 400, center.laneCenter, time);
    const covered = sampleHelionThermal(track, 400, -10, time);
    assert.equal(covered.exposure, 0);
    assert.equal(covered.sheltered, true);
    assert.ok(contact.laneCenter >= -7.5 && contact.laneCenter <= 7.5);
    if (time % 14 < 3) assert.equal(contact.exposure, 0);
    if (contact.flareStrength > 0) assert.ok(contact.exposure > 0);
  }
});
test('cooling removes accumulated heat and power loss has an explicit bounded threshold', () => {
  const furnace = sampleHelionThermal(track, 200, 0, 0);
  const cooling = sampleHelionThermal(track, 120, 0, 0);
  let heat = 0;
  for (let i = 0; i < 480; i++)
    heat = integrateHelionHeat(heat, furnace, 1 / 120);
  assert.ok(Math.abs(heat - 100) < 1e-9);
  assert.ok(Math.abs(helionThrustScale(heat) - 0.56) < 1e-9);
  for (let i = 0; i < 360; i++)
    heat = integrateHelionHeat(heat, cooling, 1 / 120);
  assert.equal(heat, 0);
  assert.equal(helionThrustScale(62), 1);
  assert.ok(helionThrustScale(80) < 1);
});
test('prominences are deterministic, differently timed and never strobing', () => {
  let different = false;
  for (let time = 0; time < 66; time += 1 / 120) {
    const a = sampleHelionProminences(time),
      b = sampleHelionProminences(time + 1 / 120);
    assert.deepEqual(a, sampleHelionProminences(time));
    a.forEach((event, i) => {
      assert.ok(event.strength >= 0.16 && event.strength <= 1);
      assert.ok(Math.abs(event.strength - b[i].strength) < 0.003);
    });
    if (Math.abs(a[0].strength - a[1].strength) > 0.3) different = true;
  }
  assert.ok(different);
});
