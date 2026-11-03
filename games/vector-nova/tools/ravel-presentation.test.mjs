import test from 'node:test';
import assert from 'node:assert/strict';
import { Vector3 } from 'three';
import createLevel from '../src/levels/ravel/index.js';

const level = createLevel();
const track = level.createTrack();

test('Ravel rendered GPU wave coordinates agree with physical moving support', () => {
  const road = level.createRoad({ track });
  try {
    const skin = road.group.children.filter((m) => m.userData.drivingSurface);
    assert.ok(
      skin.length <= 10,
      'road should retain culled material/motion batches',
    );
    let animated = 0;
    for (const mesh of skin) {
      const g = mesh.geometry,
        p = g.attributes.position,
        c = g.attributes.roadCoord;
      const wave = g.attributes.ravelWave,
        up = g.attributes.ravelWaveUp;
      for (let i = 0; i < p.count; i += 53) {
        if (wave.getX(i) === 0) continue;
        animated++;
        for (const time of [0, 0.67, 2.4, 5.2]) {
          const rendered = new Vector3()
            .fromBufferAttribute(p, i)
            .addScaledVector(
              new Vector3().fromBufferAttribute(up, i),
              wave.getX(i) *
                (0.5 + 0.5 * Math.cos(wave.getY(i) + wave.getZ(i) * time)),
            );
          const expected = track.pointAtTime(c.getX(i), c.getY(i), time);
          assert.ok(
            rendered.distanceTo(expected) < 0.006,
            `wave/physics mismatch at ${c.getX(i)}, ${c.getY(i)} time ${time}`,
          );
        }
      }
    }
    assert.ok(animated > 20, 'sample both deforming districts');
    const positions = skin.map((m) =>
      Array.from(m.geometry.attributes.position.array),
    );
    road.update({ time: 2.4 });
    assert.equal(road.group.userData.waveClock.value, 2.4);
    road.update({ time: 2.4 });
    assert.equal(road.group.userData.waveClock.value, 2.4);
    skin.forEach((m, i) =>
      assert.deepEqual(
        Array.from(m.geometry.attributes.position.array),
        positions[i],
        'animation must not rebuild CPU geometry every frame',
      ),
    );
  } finally {
    road.dispose();
    road.dispose();
  }
});

test('Ravel rendered triangles preserve physical holes and branch separation', () => {
  const road = level.createRoad({ track });
  try {
    for (const mesh of road.group.children.filter(
      (m) => m.userData.drivingSurface,
    )) {
      const g = mesh.geometry,
        c = g.attributes.roadCoord,
        indices = g.index;
      for (let i = 0; i < indices.count; i += 3) {
        const ids = [indices.getX(i), indices.getX(i + 1), indices.getX(i + 2)];
        const s = ids.reduce((n, j) => n + c.getX(j), 0) / 3;
        const x = ids.reduce((n, j) => n + c.getY(j), 0) / 3;
        const bounds = track.branchAt(s, x);
        // A curved expanding boundary is tessellated into four-metre chords.
        // Permit at most 12 cm at a widening edge, never a real gap bridge.
        const edgeError = Math.min(
          Math.abs(x - bounds.min),
          Math.abs(x - bounds.max),
        );
        assert.ok(
          track.surfaceCoverage(s, x) > 0 ||
            (!track.isGap(s) && edgeError < 0.12),
          `visible skin crosses a hole at ${s},${x}`,
        );
      }
    }
  } finally {
    road.dispose();
  }
});

test('long outer ribbon has a materially longer live Vector strip', () => {
  const devices = level.racing.createDevices(track);
  const outer = devices.find((d) => d.id === 'ravel-outer-long-vector');
  const inner = devices.find((d) => d.id === 'ravel-inner-vector');
  assert.ok(outer && inner, 'both branch boost choices must exist');
  assert.equal(outer.lateral, 100);
  assert.ok(outer.length >= inner.length * 6);
  for (const device of [outer, inner])
    for (const s of [
      device.distance - device.length / 2,
      device.distance,
      device.distance + device.length / 2,
    ]) {
      assert.ok(track.surfaceCoverage(s, device.lateral) > 0);
      for (const time of [0, 0.7, 2.4])
        assert.ok(
          Math.abs(track.waveAt(s, device.lateral, time).dynamicHeight) < 1e-6,
          'fixed boost hardware must stay on a steady ribbon',
        );
    }
});
