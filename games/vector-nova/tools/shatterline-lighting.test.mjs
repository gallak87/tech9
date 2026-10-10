import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import { createShatterlineTrack } from '../src/levels/shatterline/track/model.js';
import { createShatterlinePoleLights } from '../src/levels/shatterline/environment/pole-lights.js';
import { createShatterlineRoad, shatterlineTurnCue } from '../src/levels/shatterline/track/road.js';

function cueTrack({ turn = 1, yaw = 0, roll = 0, scissor = false, width = 50 } = {}) {
  const rotation = new T.Quaternion().setFromAxisAngle(new T.Vector3(0, 1, 0), yaw);
  return {
    width, length: 600, finishDistance: 500, jumps: [], isGap: () => false,
    sample(distance) {
      const d = Math.max(0, distance - 60), tail = Math.max(0, distance - 130);
      const x = scissor ? (tail ? 4.9 + 0.14 * tail - 0.0025 * tail * tail : d * d / 1000) : turn * d * d / 2000;
      const slope = scissor ? (tail ? 0.14 - 0.005 * tail : d * 0.002) : turn * d / 1000;
      const position = new T.Vector3(x, 0, distance).applyQuaternion(rotation);
      const tangent = new T.Vector3(slope, 0, 1).normalize().applyQuaternion(rotation);
      const right = new T.Vector3(0, 1, 0).cross(tangent).normalize().applyAxisAngle(tangent, roll);
      const up = tangent.clone().cross(right).normalize();
      return { position, tangent, right, up,
        quaternion: new T.Quaternion().setFromRotationMatrix(new T.Matrix4().makeBasis(right, up, tangent)) };
    },
  };
}

test('advance arrows follow the imminent local bend through heading changes and inversion', () => {
  for (const turn of [-1, 1])
    for (const yaw of [0, Math.PI / 2, Math.PI])
      for (const roll of [0, Math.PI]) {
        const cue = shatterlineTurnCue(cueTrack({ turn, yaw, roll }), 0);
        assert.equal(cue.direction, turn * (roll === 0 ? 1 : -1));
      }
  const scissor = cueTrack({ scissor: true });
  assert.ok(scissor.sample(240).position.x < 0, 'the later endpoint lies to the opposite side');
  assert.equal(shatterlineTurnCue(scissor, 0).direction, 1, 'the first bend wins over the later opposite sweep');
});

test('road collision boundaries and end faces follow the authored width', () => {
  for (const width of [40, 50]) {
    const track = cueTrack({ width, turn: 0 });
    const solids = [];
    const road = createShatterlineRoad({ track, shape: true, collectSolid(solid) {
      solid.geometry.computeBoundingBox();
      solids.push({ name: solid.name, kind: solid.kind, bounds: solid.geometry.boundingBox.clone() });
    } });
    try {
      for (const solid of solids.filter(item => item.kind === 'deck' || item.name.startsWith('Deck end'))) {
        assert.equal(solid.bounds.min.x, -width / 2, solid.name);
        assert.equal(solid.bounds.max.x, width / 2, solid.name);
      }
      const leftRail = solids.find(item => item.name.startsWith('Containment 1'));
      const rightRail = solids.find(item => item.name.startsWith('Containment -1'));
      assert.ok(Math.abs(leftRail.bounds.min.x - width / 2) < 1e-5);
      assert.ok(Math.abs(rightRail.bounds.max.x + width / 2) < 1e-5);
    } finally { road.dispose(); }
  }
});

test('the Severance exit arrows point into the first corkscrew bend', () => {
  const track = createShatterlineTrack();
  const severance = track.jumps.find(jump => jump.id === 'severance');
  const distance = severance.landingEnd - 35;
  const entry = track.sample(distance);
  const displacement = track.sample(distance + 200).position.clone().sub(entry.position).dot(entry.right);
  assert.ok(displacement > 0, 'the visible first bend moves toward the positive local road side');
  const cue = shatterlineTurnCue(track, distance);
  assert.ok(cue, 'the entry provides an advance direction cue');
  assert.equal(cue.direction, Math.sign(displacement), 'paint agrees with the nearby bend rather than the later service runway');
});

test('Shatterline floodlights illuminate the driving face through inversion without occupying the road', () => {
  const track = createShatterlineTrack();
  const poles = createShatterlinePoleLights(track);
  const lights = poles.group.children.filter(object => object.isSpotLight);
  try {
    assert.equal(lights.length, 6, 'the full course uses a bounded light pool');
    for (const section of track.descents) {
      for (let distance = section.start + 35; distance < section.end - 35; distance += 23) {
        poles.update({ state: { distance } });
        const active = lights.filter(light => light.intensity > 500);
        assert.ok(active.length >= 2, 'neighboring flood pools overlap');
        for (const light of active) {
          const fixture = poles.fixtures.find(item => item.position.equals(light.position));
          const frame = track.sample(fixture.distance);
          assert.ok(light.target.position.clone().sub(light.position).dot(frame.up) < -5,
            'the lamp aims into the road face even when the road is upside down');
        }
        const before = active.map(light => [light.intensity, ...light.position.toArray()]);
        poles.update({ state: { distance }, settings: { quality: 'low', reducedMotion: true } });
        assert.deepEqual(lights.filter(light => light.intensity > 500).map(light => [light.intensity, ...light.position.toArray()]), before,
          'pause/reduced motion and quality changes retain the lighting');
      }
    }
    const point = new T.Vector3();
    poles.group.traverse(object => {
      if (!object.isMesh) return;
      const vertices = object.geometry.attributes.position;
      for (let i = 0; i < vertices.count; i++) {
        point.fromBufferAttribute(vertices, i);
        // A real crossover can have several route distances at the same world Z.
        // Fixture ownership gives a local seed without assuming a monotone axis.
        const nearest = poles.fixtures.reduce((best, fixture) =>
          !best || fixture.position.distanceToSquared(point) < best.position.distanceToSquared(point) ? fixture : best, null);
        let distance = nearest.distance;
        for (let j = 0; j < 3; j++) {
          const frame = track.sample(distance);
          distance += point.clone().sub(frame.position).dot(frame.tangent);
        }
        const frame = track.sample(distance), offset = point.clone().sub(frame.position);
        const lateral = Math.abs(offset.dot(frame.right)), height = offset.dot(frame.up);
        assert.ok(height < -1.8 || height > 4 || lateral > track.width / 2 + 2.3,
          `fixture encroaches on the full road/hull corridor at ${distance}: ${lateral}, ${height}`);
        assert.ok(height < 4 || height > 32 || lateral > track.width / 2 + 1,
          `fixture encroaches on the chase-camera corridor at ${distance}: ${lateral}, ${height}`);
      }
    });
    const meshes = poles.group.children.filter(object => object.isMesh);
    const ray = new T.Raycaster();
    for (const fixture of poles.fixtures) {
      const frame = track.sample(fixture.distance);
      for (const [lateral, forward] of [[0, 0], [-1.5, -2.4], [-1.5, 2.4], [1.5, -2.4], [1.5, 2.4]]) {
        const origin = fixture.position.clone().addScaledVector(frame.right, lateral)
          .addScaledVector(frame.tangent, forward).addScaledVector(frame.up, -1);
        ray.set(origin, frame.up);
        ray.far = 4;
        const hits = ray.intersectObjects(meshes, false);
        assert.ok(hits[0]?.object.material.isMeshBasicMaterial, 'the broad luminous face stays visible ahead of the opaque housing');
        const opaque = hits.find(hit => !hit.object.material.isMeshBasicMaterial);
        assert.ok(opaque && opaque.distance - hits[0].distance > 0.2, 'the bright face and housing do not form a nearly coplanar pair');
      }
    }
  } finally {
    poles.dispose();
    poles.dispose();
  }
});
