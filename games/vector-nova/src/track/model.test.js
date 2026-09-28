import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createTrack } from './model.js';
import { createReferenceFrames } from './frames.js';
import { createSupportLayout } from './supports.js';
import { sweepGeometry } from './geometry.js';

const track = createTrack();

test('all nonadjacent crossing decks provide a full vehicle and camera clearance', () => {
  const samples = Array.from({ length: 900 }, (_, i) =>
    track.sample((i * track.length) / 900),
  );
  let crossings = 0;
  for (let i = 0; i < samples.length; i += 1) {
    for (let j = i + 1; j < samples.length; j += 1) {
      if (
        (Math.min(j - i, samples.length - (j - i)) * track.length) /
          samples.length <
        160
      )
        continue;
      const a = samples[i].position;
      const b = samples[j].position;
      if (Math.hypot(a.x - b.x, a.z - b.z) > 36) continue;
      crossings += 1;
      assert.ok(
        Math.abs(a.y - b.y) > 42,
        `Track deck clearance at ${i}/${j} is ${Math.abs(a.y - b.y)}m`,
      );
    }
  }
  assert.ok(crossings > 0, 'Authored overpass crossing must be present');
});

test('physical arc length, corner radii and full-roll frame transitions remain driveable', () => {
  let measuredLength = 0;
  let maxPitch = 0;
  let minGrade = 0;
  let maxGrade = 0;
  for (let s = 0; s < track.length; s += 1) {
    const a = track.sample(s);
    const b = track.sample(Math.min(s + 1, track.length));
    const chord = a.position.distanceTo(b.position);
    measuredLength += chord;
    assert.ok(
      Math.abs(chord - Math.min(1, track.length - s)) < 0.0005,
      `Metre parameterization changed at ${s}`,
    );
    assert.ok(a.quaternion.angleTo(b.quaternion) < 0.023, `Frame jump at ${s}`);
    assert.ok(
      Math.abs(a.curvature) < 0.008,
      `Road too wide for curve radius at ${s}`,
    );
    assert.ok(
      a.tangent.angleTo(b.tangent) < 0.011,
      `3D curve radius too tight at ${s}`,
    );
    assert.ok(a.position.y > track.groundY + 40);
    for (const axis of [a.right, a.up, a.tangent])
      assert.ok(Math.abs(axis.length() - 1) < 1e-8);
    maxPitch = Math.max(maxPitch, Math.abs(Math.asin(a.tangent.y)));
    minGrade = Math.min(minGrade, a.tangent.y);
    maxGrade = Math.max(maxGrade, a.tangent.y);
  }
  assert.ok(Math.abs(track.length - 5000) < 0.001);
  assert.ok(
    Math.abs(measuredLength - 5000) < 0.025,
    'The actual 3D path, not just its label, must measure 5000m',
  );
  assert.ok(minGrade < -Math.sin((60 * Math.PI) / 180));
  assert.ok(
    maxPitch < (70 * Math.PI) / 180,
    'Plunge remains within the authored 60–70 degree range',
  );
  assert.ok(maxGrade > 0.5, 'Skyline climb must remain substantial');
  assert.ok(
    Math.abs(track.sample(track.length * 0.111).bank + (44 * Math.PI) / 180) <
      0.001,
    'Early crown remains an approachable 44-degree bank',
  );
});

test('signature includes a sustained inverted hold, complete 360 roll and upright plunge entry', () => {
  const signature = track.signature;
  assert.ok(signature.invertedEnd - signature.invertedStart >= 140);
  for (let s = signature.invertedStart + 1; s < signature.invertedEnd; s += 2) {
    const frame = track.sample(s);
    assert.ok(frame.up.y < -0.96, `Inverted surface missing at ${s}`);
    assert.ok(Math.abs(frame.roll - Math.PI) < 0.00001);
    assert.ok(
      frame.position.y > 495,
      'Inverted crossing remains above the skyline',
    );
  }
  assert.ok(
    Math.abs(track.sample(signature.rollEnd).roll - 2 * Math.PI) < 1e-8,
  );
  assert.ok(
    track.sample(signature.rollEnd).up.y > 0.98,
    'Return upright before the plunge',
  );
  const drop = track.sample(track.scenarios['signature-drop'].distance);
  const exit = track.sample(track.scenarios['signature-exit'].distance);
  assert.ok(drop.tangent.y < -0.9);
  assert.ok(
    exit.up.y > 0.99 && Math.abs(exit.tangent.y) < 0.08,
    'Broad low-grade recovery at the canal',
  );
  assert.equal(
    track.scenarios['signature-entry'].speed,
    0,
    'Human playtest begins parked',
  );
});

test('reference transport survives exact vertical tangents and closes a vertical loop', () => {
  const count = 2400;
  const tangents = Array.from(
    { length: count + 1 },
    (_, i) =>
      new THREE.Vector3(
        0,
        Math.sin((i / count) * 2 * Math.PI),
        Math.cos((i / count) * 2 * Math.PI),
      ),
  );
  const rotations = createReferenceFrames(tangents, 1);
  for (let i = 0; i < rotations.length; i += 1) {
    assert.ok(rotations[i].toArray().every(Number.isFinite));
    assert.ok(
      new THREE.Vector3(0, 0, 1)
        .applyQuaternion(rotations[i])
        .distanceTo(tangents[i]) < 1e-8,
    );
    if (i)
      assert.ok(
        rotations[i].angleTo(rotations[i - 1]) < 0.025,
        `Vertical transport jump at ${i}`,
      );
  }
  assert.ok(rotations[0].angleTo(rotations.at(-1)) < 1e-7);
});

test('signature supports remain outside the actual racing surface, including while inverted', () => {
  const layout = createSupportLayout(track);
  assert.ok(layout.portals.length > 30 && layout.cables.length > 20);
  assert.ok(
    layout.standard.every(({ distance }) =>
      layout.zones.every(
        ({ start, end }) => distance < start || distance > end,
      ),
    ),
  );
  const geometry = sweepGeometry(
    track,
    [
      [-14, 0],
      [14, 0],
    ],
    { step: 3 },
  );
  const material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
  const surface = new THREE.Mesh(geometry, material);
  surface.updateMatrixWorld();
  const ray = new THREE.Raycaster();
  for (const segment of layout.segments) {
    const direction = segment.to.clone().sub(segment.from).normalize();
    const across = new THREE.Vector3(1, 0, 0).addScaledVector(
      direction,
      -direction.x,
    );
    if (across.lengthSq() < 0.01)
      across.set(0, 0, 1).addScaledVector(direction, -direction.z);
    across.normalize();
    const up = new THREE.Vector3().crossVectors(direction, across).normalize();
    for (const [x, y] of [
      [0, 0],
      [-1, -1],
      [-1, 1],
      [1, -1],
      [1, 1],
    ]) {
      const origin = segment.from
        .clone()
        .addScaledVector(across, segment.radius * x)
        .addScaledVector(up, segment.radius * y);
      ray.set(origin, direction);
      ray.far = segment.from.distanceTo(segment.to);
      assert.equal(
        ray.intersectObject(surface).length,
        0,
        `${segment.kind} crosses the road`,
      );
    }
  }
  geometry.dispose();
  material.dispose();
});

test('bank and slope rest scenarios exercise distinct meaningful surface forces', () => {
  const bank = track.scenarios['bank-rest'];
  const slope = track.scenarios['slope-rest'];
  assert.equal(bank.speed, 0);
  assert.equal(slope.speed, 0);
  assert.ok(Math.abs(track.sample(bank.distance).right.y) > 0.65);
  assert.ok(track.sample(slope.distance).tangent.y > 0.13);
});

test('the whole circuit is sectioned continuously and each district has a named showcase', () => {
  assert.equal(track.sections[0].start, 0);
  assert.equal(track.sections.at(-1).end, track.length);
  for (let i = 0; i < track.sections.length; i += 1) {
    const section = track.sections[i];
    if (i) assert.equal(track.sections[i - 1].end, section.start);
    assert.ok(
      section.showcase > section.start && section.showcase < section.end,
    );
    assert.ok(track.scenarios[`${section.id}-showcase`]);
  }
});

test('shorter lap distributes terrain events and keeps the canal return active', () => {
  for (const feature of track.featureZones) {
    assert.ok(feature.start >= 0 && feature.end <= track.length);
    assert.ok(
      feature.peak >= feature.start && feature.peak <= feature.end,
      `${feature.id} representative must be inside its own interval`,
    );
  }
  const intro = track.sample(160);
  assert.ok(
    intro.position.y > 12,
    'Visible rise begins within the opening seconds',
  );
  assert.ok(
    Math.abs(intro.bank) > 0.015,
    'Progressive introductory bank starts early',
  );
  assert.ok(
    track.signature.invertedStart < track.length * 0.5,
    'Inversion arrives in the middle, not only near the end',
  );
  assert.ok(track.signature.plungeStart > track.length * 0.65);
  const heights = [];
  const grades = [];
  const banks = [];
  for (let s = track.length * 0.835; s < track.length; s += 4) {
    const frame = track.sample(s);
    heights.push(frame.position.y);
    grades.push(frame.tangent.y);
    banks.push(Math.abs(frame.bank));
  }
  assert.ok(
    Math.max(...heights) - Math.min(...heights) > 35,
    'Canal return includes a real rise and dip',
  );
  assert.ok(Math.max(...grades) > 0.1 && Math.min(...grades) < -0.1);
  assert.ok(
    Math.max(...banks) > 0.36,
    'Canal turn remains meaningfully banked',
  );
  assert.ok(track.supportFootprints.length > 50);
  for (const footprint of track.supportFootprints) {
    assert.ok(
      footprint.minY === track.groundY && footprint.maxY > footprint.minY,
    );
    assert.ok(
      [
        footprint.x,
        footprint.z,
        footprint.halfX,
        footprint.halfZ,
        footprint.minY,
        footprint.maxY,
      ].every(Number.isFinite),
    );
  }
});
