import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { Vector3 } from 'three';
import createLevel from '../src/levels/ravel/index.js';
import { ravelBandBounds } from '../src/levels/ravel/track/branches.js';
import { createVehicleState } from '../src/physics/index.js';
import { sampleRavelWave } from '../src/levels/ravel/waves.js';

const definition = createLevel();
const track = definition.createTrack();
let collisionWorld, dynamics;
before(async () => {
  collisionWorld = definition.createCollisionWorld({ track });
  dynamics = await definition.createDynamics({ track, collisionWorld });
});
after(() => {
  dynamics?.dispose();
  collisionWorld?.dispose();
});
const makeRuntime = () =>
  definition.createRuntime({ track, collisionWorld, dynamics });
const middle = (track.braid.splitEnd + track.braid.mergeStart) / 2;

// The old floor remains the same planar cross-section; only its real open
// outboard edge grows into a curved sheet, with no internal support boundary.
test('outboard wings join each original eighty-metre branch floor without a seam', () => {
  for (const side of [-1, 1]) {
    const centre = track.branchPoint(middle, side * 100);
    const across = track.branchPoint(middle, side * 100 + 1).sub(centre);
    for (const offset of [-40, -20, 0, 20, 40]) {
      const expected = centre.clone().addScaledVector(across, offset);
      assert.ok(
        expected.distanceTo(track.branchPoint(middle, side * 100 + offset)) <
          1e-8,
      );
    }
    const edge = side * 140;
    const a = track.sampleBranchSurface(middle, edge - 0.001);
    const b = track.sampleBranchSurface(middle, edge + 0.001);
    assert.ok(a.position.distanceTo(b.position) < 0.0021);
    assert.ok(a.quaternion.angleTo(b.quaternion) < 0.00001);
    for (const lateral of [edge - 0.1, edge, edge + 0.1]) {
      const frame = track.sampleBranchSurface(middle, lateral);
      assert.equal(track.surfaceCoverage(middle, lateral), 1);
      assert.ok(side < 0 ? frame.bounds.min < -350 : frame.bounds.max > 599);
    }
    const band = track.roadBands.find((entry) =>
      entry.id.startsWith(`ribbon-${side < 0 ? 'inner' : 'outer'}`),
    );
    assert.equal(band.wave, false, 'the whole continuous outer deck is static');
  }
});

test('the vast curled wings have true arc metrics and keep forward-facing longitudinal shoulders', () => {
  const profile = track.wingProfileAt(middle);
  let minimumProgress = Infinity,
    maximumWidth = 0;
  for (let s = profile.start + 0.5; s < profile.end; s += 3) {
    const shape = track.wingProfileAt(s);
    maximumWidth = Math.max(maximumWidth, shape.innerHalfWidth);
    for (const side of [-1, 1]) {
      const width = side < 0 ? shape.innerHalfWidth : shape.outerHalfWidth;
      const centreFrame = track.sampleBranchSurface(s, side * 100);
      for (const fraction of [0, 0.25, 0.5, 0.75, 1]) {
        const lateral = side * (140 + (width - 140) * fraction);
        const frame = track.sampleBranchSurface(s, lateral);
        const along = track
          .branchPoint(s + 0.05, lateral)
          .sub(track.branchPoint(s - 0.05, lateral))
          .multiplyScalar(10);
        const across = track
          .branchPoint(s, lateral + 0.01)
          .sub(track.branchPoint(s, lateral - 0.01))
          .multiplyScalar(50);
        assert.equal(frame.supported, true);
        assert.ok(Math.abs(across.length() - 1) < 1e-6);
        assert.ok(Math.abs(frame.lateralMetric - 1) < 1e-10);
        assert.ok(
          Math.abs(along.dot(frame.right) - frame.longitudinalShear) < 0.0001,
        );
        assert.ok(
          Math.abs(along.dot(frame.tangent) - frame.longitudinalMetric) <
            0.0001,
        );
        const progress =
          frame.tangent.dot(centreFrame.tangent) * frame.longitudinalMetric;
        minimumProgress = Math.min(minimumProgress, progress);
        assert.ok(
          progress > 0.3,
          `folded shoulder at ${s}/${lateral}: ${progress}`,
        );
        assert.ok(
          frame.longitudinalMetric > 0.3 && frame.longitudinalMetric < 3,
        );
        for (const axis of [frame.right, frame.up, frame.tangent])
          assert.ok(
            axis.toArray().every(Number.isFinite) &&
              Math.abs(axis.length() - 1) < 1e-8,
          );
        assert.equal(sampleRavelWave(track, s, lateral, 0).dynamicHeight, 0);
      }
    }
  }
  assert.ok(minimumProgress > 0.35);
  assert.ok(
    maximumWidth > 595,
    'the inside sheet retains its full broad lobe after the safe waist',
  );
  const tall = track.sampleBranchSurface(middle, 590);
  assert.ok(
    tall.up.dot(track.sampleBase(middle).up) < 0,
    'the outside sail curls past vertical',
  );
  assert.ok(tall.position.distanceTo(track.branchPoint(middle, 140)) > 430);
  for (const s of [profile.start, profile.end]) {
    const shape = track.wingProfileAt(s);
    assert.ok(Math.abs(shape.innerHalfWidth - 140) < 1e-6);
    assert.ok(Math.abs(shape.outerHalfWidth - 140) < 1e-6);
  }
  const outer = track.jumps.find((jump) => jump.branch === 'outer');
  assert.equal(
    track.surfaceCoverage((outer.takeoff + outer.landingStart) / 2, 100),
    0,
  );
  assert.equal(
    track.surfaceCoverage(outer.takeoff - 1, 500),
    0,
    'the wing tapers away before the unchanged real jump',
  );
});

test('the new wing surfaces retain clearance from every other supported route', () => {
  const cellSize = 24,
    cells = new Map(),
    points = [];
  const key = (x, y, z) => `${x}/${y}/${z}`;
  for (const band of track.roadBands) {
    for (let s = band.start + 0.1; s < band.end; s += 6) {
      const bounds = ravelBandBounds(band, s);
      const columns = Math.max(1, Math.ceil((bounds.max - bounds.min) / 6));
      for (let column = 0; column <= columns; column++) {
        const lateral =
          bounds.min + ((bounds.max - bounds.min) * column) / columns;
        const position = track.branchPoint(s, lateral);
        const entry = { s, lateral, position, branch: band.branch };
        const cell = key(
          Math.floor(position.x / cellSize),
          Math.floor(position.y / cellSize),
          Math.floor(position.z / cellSize),
        );
        if (!cells.has(cell)) cells.set(cell, []);
        cells.get(cell).push(entry);
        if (
          ['inner', 'outer'].includes(band.branch) &&
          Math.abs(lateral) > 150 &&
          track.wingProfileAt(s)
        )
          points.push(entry);
      }
    }
  }
  let minimum = Infinity;
  for (const a of points) {
    const x = Math.floor(a.position.x / cellSize),
      y = Math.floor(a.position.y / cellSize),
      z = Math.floor(a.position.z / cellSize);
    for (let dx = -2; dx <= 2; dx++)
      for (let dy = -2; dy <= 2; dy++)
        for (let dz = -2; dz <= 2; dz++) {
          for (const b of cells.get(key(x + dx, y + dy, z + dz)) ?? []) {
            if (a.branch === b.branch && Math.abs(a.s - b.s) < 140) continue;
            const distance = a.position.distanceTo(b.position);
            minimum = Math.min(minimum, distance);
            assert.ok(
              distance > 25,
              `wing intersects another road at ${a.s}/${a.lateral}, ${b.s}/${b.lateral}: ${distance}`,
            );
          }
        }
  }
  assert.ok(points.length > 10000 && Number.isFinite(minimum));
});

test('production collision triangles and native magnetic hulls support branch seams and distant curled wings', () => {
  let triangles = 0;
  for (const triangle of collisionWorld.triangles) {
    if (triangle.kind !== 'deck' || !triangle.roadCoordinates) continue;
    const coords = triangle.roadCoordinates;
    if (!coords.some(([s, x]) => track.wingProfileAt(s) && Math.abs(x) > 400))
      continue;
    if (triangles++ % 97) continue;
    for (let i = 0; i < 3; i++) {
      const [s, x] = coords[i];
      assert.ok(
        new Vector3(...triangle.points[i]).distanceTo(track.branchPoint(s, x)) <
          0.025,
        'native collider is the rendered sampled sail',
      );
    }
  }
  assert.ok(triangles > 1000);
  for (const lateral of [-140, 140, -400, 400, 570]) {
    const runtime = makeRuntime();
    try {
      const state = {
        ...createVehicleState(),
        distance: middle + 80,
        lateral,
        speed: 0,
      };
      runtime.reset({ state });
      for (let tick = 0; tick < 90; tick++) {
        const events = runtime.advance(
          state,
          { throttle: 0, steer: 0, brake: 0 },
          1 / 120,
        );
        assert.equal(runtime.pose(1).grounded, true, `parked wing ${lateral}`);
        assert.ok(
          !events.some(
            (event) =>
              event.type === 'impact' || event.type === 'road-departure',
          ),
        );
      }
      const start = runtime.pose(1).position.clone(),
        startDistance = state.distance;
      for (
        let tick = 0;
        tick < 1200 && state.distance < startDistance + 65;
        tick++
      ) {
        const events = runtime.advance(
          state,
          { throttle: 1, steer: 0, brake: 0 },
          1 / 120,
        );
        const pose = runtime.pose(1);
        assert.equal(pose.grounded, true, `propelled wing ${lateral}`);
        assert.equal(Boolean(pose.recovering), false);
        assert.ok(
          !events.some(
            (event) =>
              event.type === 'impact' ||
              event.type === 'road-departure' ||
              event.type === 'jump-launch',
          ),
        );
      }
      assert.ok(
        state.distance >= startDistance + 65,
        `ordinary propulsion advances on wing ${lateral}`,
      );
      assert.ok(runtime.pose(1).position.distanceTo(start) > 35);
    } finally {
      runtime.dispose();
    }
  }
});
