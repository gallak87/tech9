import test from 'node:test';
import assert from 'node:assert/strict';
import { Vector3 } from 'three';
import { createColossusRoad } from '../src/levels/colossus/track/road.js';
import { collectRoadSurfaces } from '../src/pickups/device-mount.js';
import {
  EJECTOR_RULES,
  ejectorPose,
} from '../src/levels/colossus/mechanics.js';
import { createColossusTrack } from '../src/levels/colossus/track/model.js';

const track = createColossusTrack();
const pitchAt = (s) => (Math.asin(track.sample(s).tangent.y) * 180) / Math.PI;
const pitchRateAt = (s) => (pitchAt(s + 2) - pitchAt(s - 2)) / 4;
const returnStart = track.sections.find((s) => s.id === 'rise').start;

test('supported vertical transitions stay broad while the major dive and ascent remain steep', () => {
  let maximumRate = 0,
    returnRate = 0,
    steepDive = 0,
    maximumClimb = 0;
  for (let s = 0; s < track.length; s += 2) {
    // The virtual curve through a transfer is an airborne projection, not steel.
    if (track.isGap(s - 3) || track.isGap(s + 3)) continue;
    const pitch = pitchAt(s),
      rate = Math.abs(pitchRateAt(s));
    maximumRate = Math.max(maximumRate, rate);
    if (s >= returnStart) returnRate = Math.max(returnRate, rate);
    if (pitch < -30) steepDive += 2;
    maximumClimb = Math.max(maximumClimb, pitch);
  }
  assert.ok(maximumRate < 0.44, `supported pitch change ${maximumRate} deg/m`);
  assert.ok(returnRate < 0.07, `upper works pitch change ${returnRate} deg/m`);
  assert.ok(steepDive > 220, 'retain a sustained steep discharge dive');
  assert.ok(
    maximumClimb > 38,
    'retain the large climb through the upper works',
  );
});

test('the upper works have one climb peak and one descent trough without short pitch waves', () => {
  const directions = [];
  for (let s = returnStart + 3; s < track.length - 3; s += 2) {
    const rate = pitchRateAt(s);
    // Ignore the nearly level crest and the numerical noise of sampled frames.
    if (Math.abs(rate) < 0.002) continue;
    const direction = Math.sign(rate);
    if (directions.at(-1) !== direction) directions.push(direction);
  }
  assert.deepEqual(directions, [1, -1, 1]);
  for (const id of ['rise', 'counterweight', 'cooling', 'crown', 'headstock']) {
    const s = track.sections.find((section) => section.id === id).start;
    assert.ok(
      Math.abs(pitchRateAt(s + 4) - pitchRateAt(s - 4)) < 0.003,
      id + ' has a continuous vertical bend across its planar curve join',
    );
  }
});

test('all three transfers retain their approved launch and receiving geometry', () => {
  const approved = [
    {
      id: 'die-transfer',
      takeoff: [930.619784629, 863.4, 721.71952495],
      landingStart: [1070.589511616, 773.2, 724.630800843],
      landingEnd: [1470.503017292, 706.8, 732.948731964],
      tangent: [0.983960842, -0.177206706, 0.020465722],
    },
    {
      id: 'gantry-flight',
      takeoff: [1197.431865992, 628.2, -235.003761632],
      landingStart: [1011.968388979, 425, -82.677471406],
      landingEnd: [540.58205157, 320.8, 304.485182919],
      tangent: [-0.760538258, -0.177179338, 0.624651135],
    },
    {
      id: 'dispatch-cut',
      takeoff: [114.418145546, 282.8, 518.160300648],
      landingStart: [53.842735861, 218, 609.978706981],
      landingEnd: [-133.390348622, 162.4, 893.781053826],
      tangent: [-0.541967946, -0.177229467, 0.821498911],
    },
  ];
  const close = (actual, expected, label) =>
    assert.ok(
      Math.hypot(...actual.toArray().map((v, i) => v - expected[i])) < 1e-6,
      label,
    );
  assert.equal(track.jumps.length, approved.length);
  for (const fixture of approved) {
    const jump = track.jumps.find((j) => j.id === fixture.id);
    for (const station of ['takeoff', 'landingStart', 'landingEnd'])
      close(
        track.sample(jump[station]).position,
        fixture[station],
        jump.id + ' ' + station,
      );
    close(
      track.sample(jump.takeoff).tangent,
      fixture.tangent,
      jump.id + ' launch pitch',
    );
  }
});

test('rigid ejector heads clear the rendered steel across their complete stroke', () => {
  const road = createColossusRoad({ track, shape: true });
  const clip = (polygon, axis, limit, side) => {
    const result = [];
    for (let i = 0; i < polygon.length; i++) {
      const a = polygon[i],
        b = polygon[(i + 1) % polygon.length],
        da = (a[axis] - limit) * side,
        db = (b[axis] - limit) * side;
      if (da <= 0) result.push(a);
      if ((da < 0 && db > 0) || (da > 0 && db < 0))
        result.push(a.clone().lerp(b, da / (da - db)));
    }
    return result;
  };
  try {
    const surfaces = collectRoadSurfaces(road.group);
    for (const e of track.ejectors) {
      const f = track.sample(e.distance),
        inverse = f.quaternion.clone().invert(),
        stroke = [EJECTOR_RULES.parked, EJECTOR_RULES.extended].map(
          (x) => x * e.side,
        ),
        footprint = [
          ['x', Math.min(...stroke) - e.width / 2, -1],
          ['x', Math.max(...stroke) + e.width / 2, 1],
          ['z', -e.depth / 2, -1],
          ['z', e.depth / 2, 1],
        ];
      let highest = -Infinity;
      for (const mesh of surfaces) {
        const g = mesh.geometry,
          p = g.attributes.position,
          c = g.attributes.roadCoord;
        for (let i = 0; i < g.index.count; i += 3) {
          const ids = [0, 1, 2].map((j) => g.index.getX(i + j)),
            distances = ids.map((j) => c.getX(j));
          if (
            Math.min(...distances) > e.distance + 64 ||
            Math.max(...distances) < e.distance - 64
          )
            continue;
          let polygon = ids.map((j) =>
            new Vector3()
              .fromBufferAttribute(p, j)
              .applyMatrix4(mesh.matrixWorld)
              .sub(f.position)
              .applyQuaternion(inverse),
          );
          for (const edge of footprint) polygon = clip(polygon, ...edge);
          for (const point of polygon) highest = Math.max(highest, point.y);
        }
      }
      const bottom =
        ejectorPose(track, e, -e.phaseOffset)
          .position.sub(f.position)
          .dot(f.up) -
        e.height / 2;
      assert.ok(Number.isFinite(highest), e.id + ' crosses the working bed');
      assert.ok(
        bottom - highest > 0.1,
        e.id + ' must not scrape or jam on the curved steel during its stroke',
      );
    }
  } finally {
    road.dispose();
  }
});
