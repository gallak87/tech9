import test from 'node:test';
import assert from 'node:assert/strict';
import { createSeededLayoutGeometry } from './seeded-layout.js';
import { routeCurve, createRouteSampler } from './route.js';

function relativeJump(geometry, jump) {
  const launch = geometry.points.findIndex(
    (point) => point.id === jump.launchPointId,
  );
  const landing = geometry.points.findIndex(
    (point) => point.id === jump.landingPointId,
  );
  const origin = geometry.points[launch],
    end = geometry.points[landing];
  const distance = Math.hypot(end.x - origin.x, end.z - origin.z);
  const forward = {
    x: (end.x - origin.x) / distance,
    z: (end.z - origin.z) / distance,
  };
  return geometry.points
    .slice(launch - 1, landing + 3)
    .map((point) => [
      (point.x - origin.x) * forward.x + (point.z - origin.z) * forward.z,
      point.y - origin.y,
      (point.x - origin.x) * forward.z - (point.z - origin.z) * forward.x,
    ]);
}

test('exact-length connector solving preserves rigid launch, gap and receiving geometry', () => {
  for (const courseType of ['circuit', 'downhill']) {
    const options = {
      seed: 42017,
      courseType,
      jumpFrequency: 'few',
      jumpSize: 'small',
      bendiness: 0.45,
      elevation: 0.35,
    };
    const short = createSeededLayoutGeometry({ ...options, length: 10000 });
    const long = createSeededLayoutGeometry({ ...options, length: 15000 });
    assert.equal(short.jumps.length, long.jumps.length);
    for (let i = 0; i < short.jumps.length; i++) {
      const a = relativeJump(short, short.jumps[i]),
        b = relativeJump(long, long.jumps[i]);
      assert.equal(a.length, b.length);
      for (let j = 0; j < a.length; j++)
        for (let axis = 0; axis < 3; axis++)
          assert(
            Math.abs(a[j][axis] - b[j][axis]) < 1e-7,
            'changing connector length cannot stretch or tilt the physical jump district',
          );
    }
    assert(
      Math.abs(routeCurve({ ...short, courseType }).getLength() - 10000) < 0.01,
    );
    assert(
      Math.abs(routeCurve({ ...long, courseType }).getLength() - 15000) < 0.01,
    );
  }
});

test('starter pickup footprints remain exactly level and straight on long and short courses', () => {
  for (const courseType of ['circuit', 'downhill'])
    for (const length of [3000, 20000]) {
      const geometry = createSeededLayoutGeometry({
        seed: 42017,
        courseType,
        length,
      });
      const sampler = createRouteSampler({ ...geometry, courseType });
      const first = sampler.sample(110),
        middle = sampler.sample(130),
        last = sampler.sample(150);
      assert(Math.abs(middle.tangent.y) < 1e-10);
      assert(first.tangent.angleTo(last.tangent) < 1e-7);
      assert(Math.abs(first.position.y - last.position.y) < 1e-8);
    }
});

test('candidate attempts are deterministic distinct plans; zero variation preserves each course type', () => {
  const options = {
    seed: 0,
    courseType: 'circuit',
    length: 10000,
    jumpFrequency: 'none',
    bendiness: 0.8,
    elevation: 0.6,
  };
  const first = createSeededLayoutGeometry(options);
  assert.deepEqual(first, createSeededLayoutGeometry(options));
  const alternate = createSeededLayoutGeometry({ ...options, attempt: 1 });
  assert.notDeepEqual(
    first.points.map((point) => [point.x, point.z]),
    alternate.points.map((point) => [point.x, point.z]),
  );
  for (const courseType of ['circuit', 'downhill']) {
    const flat = createSeededLayoutGeometry({
      seed: 42017,
      length: 3000,
      courseType,
      jumpFrequency: 'none',
      elevation: 0,
    });
    assert.equal(flat.jumps.length, 0);
    if (courseType === 'circuit')
      assert(
        flat.points.every(
          (point) => Math.abs(point.y - flat.points[0].y) < 1e-8,
        ),
      );
    else
      assert(
        flat.points.at(-1).y < flat.points[0].y,
        'Downhill retains a gentle net descent without additional hills',
      );
  }
});

test('the optional zero setting and Downhill retain their resolved geometry exactly', () => {
  const options = {
    seed: 453207366,
    length: 5000,
    jumpFrequency: 'many',
    jumpSize: 'large',
    bendiness: 1,
    elevation: 1,
  };
  assert.deepEqual(
    createSeededLayoutGeometry(options),
    createSeededLayoutGeometry({ ...options, crossovers: 0 }),
  );
  const downhill = { ...options, courseType: 'downhill' };
  assert.deepEqual(
    createSeededLayoutGeometry(downhill),
    createSeededLayoutGeometry({ ...downhill, crossovers: 1 }),
  );
});

test('changing weave density retains rigid physical jumps and a level opening grid', () => {
  const options = {
    seed: 453207366,
    length: 20000,
    courseType: 'circuit',
    jumpFrequency: 'many',
    jumpSize: 'large',
    elevation: 1,
    bendiness: 1,
  };
  const low = createSeededLayoutGeometry({ ...options, crossovers: 0.5 });
  const high = createSeededLayoutGeometry({ ...options, crossovers: 1 });
  assert.equal(low.jumps.length, high.jumps.length);
  assert(high.jumps.length > 0);
  for (let i = 0; i < low.jumps.length; i++) {
    const a = relativeJump(low, low.jumps[i]),
      b = relativeJump(high, high.jumps[i]);
    assert.equal(a.length, b.length);
    for (let j = 0; j < a.length; j++)
      for (let axis = 0; axis < 3; axis++)
        assert(
          Math.abs(a[j][axis] - b[j][axis]) < 1e-7,
          'crossovers do not distort launch/landing geometry',
        );
  }
  for (const geometry of [low, high]) {
    assert(geometry.points.length <= 256);
    const sampler = createRouteSampler({ ...geometry, courseType: 'circuit' });
    assert(Math.abs(sampler.length - 20000) < 0.01);
    const first = sampler.sample(110),
      middle = sampler.sample(130),
      last = sampler.sample(150);
    assert(Math.abs(middle.tangent.y) < 1e-10);
    assert(first.tangent.angleTo(last.tangent) < 1e-7);
    assert(Math.abs(first.position.y - last.position.y) < 1e-8);
  }
  assert.notDeepEqual(
    low.points.map((p) => [p.x, p.y, p.z]),
    high.points.map((p) => [p.x, p.y, p.z]),
  );
});
