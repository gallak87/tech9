import test from 'node:test';
import assert from 'node:assert/strict';
import { freestyleAirPoints, freestyleStylePoints } from './scoring.js';

test('air totals combine continuous rotation with separate diminishing full-trick bonuses', () => {
  assert.equal(freestyleStylePoints(['roll', 'roll', 'flip', 'roll']), 3250);
  assert.equal(
    freestyleAirPoints({
      flight: {
        rotationPoints: 123.5,
        tricks: ['roll', 'roll', 'flip', 'roll'],
      },
    }),
    3373.5,
  );
  assert.equal(
    freestyleAirPoints({ flight: { rotationPoints: 80.5, tricks: [] } }),
    80.5,
  );
  assert.equal(freestyleAirPoints({ flight: null, pendingLanding: null }), 0);
});

test('touchdown freezes the full provisional total and preserves fractional precision until final banking', () => {
  const data = {
    flight: null,
    pendingLanding: { style: 2789.375, tricks: ['spin', 'spin', 'spin'] },
  };
  assert.equal(freestyleAirPoints(data), 2789.375);
  assert.equal(freestyleStylePoints(data.pendingLanding.tricks), 2187.5);
  assert.equal(data.pendingLanding.style, 2789.375);
});
