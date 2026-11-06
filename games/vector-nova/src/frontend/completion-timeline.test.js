import test from 'node:test';
import assert from 'node:assert/strict';
import { Euler, Quaternion, Vector3 } from 'three';
import { getCollisionHull } from '../ships/collision-hulls.js';
import { createTrack } from '../levels/halcyon/track/model.js';
import { completionPose } from './completion-course.js';
import {
  COMPLETION_DURATION,
  COMPLETION_FINISH,
  COMPLETION_CUES,
  COMPLETION_SHOTS,
  COMPLETION_JUMP_START,
  COMPLETION_JUMP_END,
  COMPLETION_JUMP_HEIGHT,
  COMPLETION_SLIDE_START,
  COMPLETION_SLIDE_END,
  COMPLETION_STOP_DISTANCE,
  COMPLETION_LANES,
  sampleCompletionTimeline,
} from './completion-timeline.js';

const PLAYERS = ['kestrel', 'shrike', 'bastion', 'needle'];
const AXES = [new Vector3(1, 0, 0), new Vector3(0, 1, 0), new Vector3(0, 0, 1)];
const track = createTrack();
function boxFor(id, pose, world) {
  const { bounds } = getCollisionHull(id);
  const min = new Vector3().fromArray(bounds.min),
    max = new Vector3().fromArray(bounds.max);
  const center = min.clone().add(max).multiplyScalar(0.5);
  const half = max.clone().sub(min).multiplyScalar(0.5).toArray();
  const mapped = world
    ? completionPose(track, pose)
    : {
        position: new Vector3(pose.x, pose.y, pose.z),
        quaternion: new Quaternion().setFromEuler(
          new Euler(pose.pitch, pose.yaw, pose.roll, 'YXZ'),
        ),
      };
  center.applyQuaternion(mapped.quaternion).add(mapped.position);
  const axes = AXES.map((axis) =>
    axis.clone().applyQuaternion(mapped.quaternion),
  );
  const corners = [];
  for (const x of [-1, 1])
    for (const y of [-1, 1])
      for (const z of [-1, 1])
        corners.push(
          center
            .clone()
            .addScaledVector(axes[0], x * half[0])
            .addScaledVector(axes[1], y * half[1])
            .addScaledVector(axes[2], z * half[2]),
        );
  return { center, half, axes, corners, mapped };
}
// The full 15-axis OBB separating-axis test, including rotated bound centers.
// A positive gap is a lower bound on Euclidean chassis clearance.
function separatingGap(a, b) {
  const axes = [...a.axes, ...b.axes];
  for (const aa of a.axes)
    for (const bb of b.axes) {
      const cross = aa.clone().cross(bb);
      if (cross.lengthSq() > 1e-12) axes.push(cross.normalize());
    }
  const delta = b.center.clone().sub(a.center);
  let gap = -Infinity;
  for (const axis of axes) {
    const radius = (box) =>
      box.axes.reduce(
        (sum, own, index) => sum + Math.abs(own.dot(axis)) * box.half[index],
        0,
      );
    gap = Math.max(gap, Math.abs(delta.dot(axis)) - radius(a) - radius(b));
  }
  return gap;
}

test('Jump Drive passes directly over grounded Rook with full hull clearance', () => {
  let crossing;
  for (
    let time = COMPLETION_JUMP_START;
    time <= COMPLETION_JUMP_END;
    time += 0.001
  ) {
    const sample = sampleCompletionTimeline(time);
    if (Math.abs(sample.hero.z - sample.rook.z) < 0.05) {
      crossing = sample;
      break;
    }
  }
  assert.ok(crossing, 'longitudinal overtake occurs during the jump');
  assert.ok(
    Math.abs(crossing.hero.x - crossing.rook.x) < 0.2,
    'the hero passes above the rival rather than beside it',
  );
  assert.ok(crossing.hero.y - crossing.rook.y > 9);
  assert.equal(crossing.shot, 'overtake');
  for (let time = 0; time <= COMPLETION_DURATION; time += 0.025) {
    const sample = sampleCompletionTimeline(time);
    assert.equal(sample.rook.y, 0.65);
    assert.equal(sample.manta.y, 0.65);
    assert.ok(sample.hero.y <= 0.65 + COMPLETION_JUMP_HEIGHT + 1e-9);
  }
});

test('airbrake slide crosses the real finish, countersteers and settles to a full stop', () => {
  const epsilon = 0.0001;
  assert.equal(
    sampleCompletionTimeline(COMPLETION_SLIDE_START).hero.z,
    COMPLETION_FINISH,
  );
  assert.ok(
    Math.abs(
      sampleCompletionTimeline(COMPLETION_SLIDE_START - epsilon).hero.speed -
        sampleCompletionTimeline(COMPLETION_SLIDE_START + epsilon).hero.speed,
    ) < 0.01,
  );
  let previous = sampleCompletionTimeline(COMPLETION_SLIDE_START).hero;
  for (
    let time = COMPLETION_SLIDE_START + 0.005;
    time <= COMPLETION_SLIDE_END;
    time += 0.005
  ) {
    const hero = sampleCompletionTimeline(time).hero;
    assert.ok(hero.z >= previous.z - 1e-9);
    assert.ok(Math.hypot(hero.x - previous.x, hero.z - previous.z) < 0.4);
    assert.ok(
      hero.speed <= previous.speed + 0.001,
      'braking speed falls monotonically',
    );
    const before = sampleCompletionTimeline(time - epsilon).hero;
    const after = sampleCompletionTimeline(time + epsilon).hero;
    const velocity =
      Math.hypot(after.x - before.x, after.z - before.z) / (2 * epsilon);
    assert.ok(
      Math.abs(velocity - hero.speed) < 0.01,
      'engine speed follows actual movement',
    );
    previous = hero;
  }
  const stopped = sampleCompletionTimeline(COMPLETION_SLIDE_END).hero;
  assert.ok(
    Math.abs(stopped.z - COMPLETION_FINISH - COMPLETION_STOP_DISTANCE) < 1e-8,
  );
  assert.equal(stopped.x, COMPLETION_LANES.parked);
  assert.equal(stopped.speed, 0);
  assert.ok(
    sampleCompletionTimeline(18.1).hero.yaw > stopped.yaw + 0.3,
    'body countersteers before settling',
  );
  assert.deepEqual(
    sampleCompletionTimeline(COMPLETION_DURATION).hero,
    stopped,
    'the held hero pose does not creep or rotate after parking',
  );
});

for (const world of [false, true])
  test(`${world ? 'production Halcyon frames' : 'story coordinates'} keep swept worst-hull OBBs clear for the entire film`, (context) => {
    const step = 1 / 240;
    // Each corner remains below this conservative bound: 75m/s cruise plus
    // jump, lateral travel, yaw, pitch and the real course-frame rotation.
    // Two hulls can therefore close by at most 130*step between the midpoint
    // SAT and either endpoint. Certifying that margin covers the whole sweep.
    const cornerSpeedLimit = 130;
    const requiredGap = 0.4 + cornerSpeedLimit * step;
    let minimum = Infinity,
      railMargin = Infinity,
      measuredCornerSpeed = 0;
    let previous;
    for (let index = 0; index < COMPLETION_DURATION / step; index++) {
      const time = (index + 0.5) * step;
      const sample = sampleCompletionTimeline(time);
      const rook = boxFor('rook', sample.rook, world),
        manta = boxFor('manta', sample.manta, world);
      const players = PLAYERS.map((id) => boxFor(id, sample.hero, world));
      const all = [...players, rook, manta];
      for (const [a, b] of [
        [rook, manta],
        ...players.flatMap((hero) => [
          [hero, rook],
          [hero, manta],
        ]),
      ]) {
        const gap = separatingGap(a, b);
        minimum = Math.min(minimum, gap);
        assert.ok(
          gap > requiredGap,
          `swept chassis clearance ${gap.toFixed(3)}m at ${time.toFixed(4)}s`,
        );
      }
      for (const box of all)
        for (const corner of box.corners) {
          let lateral;
          if (world) {
            // Project each physical corner against its nearest station, rather
            // than assuming the road beneath a long rotated hull is planar.
            let distance = box.mapped.distance;
            for (let iteration = 0; iteration < 3; iteration++) {
              const frame = track.sample(distance);
              distance += corner.clone().sub(frame.position).dot(frame.tangent);
            }
            const frame = track.sample(distance);
            lateral = corner.clone().sub(frame.position).dot(frame.right);
          } else lateral = corner.x;
          railMargin = Math.min(railMargin, 14 - Math.abs(lateral));
          assert.ok(
            Math.abs(lateral) < 13,
            `less than 1m rail clearance at ${time.toFixed(4)}s`,
          );
        }
      if (previous)
        all.forEach((box, actor) =>
          box.corners.forEach((corner, part) => {
            const speed =
              corner.distanceTo(previous[actor].corners[part]) / step;
            measuredCornerSpeed = Math.max(measuredCornerSpeed, speed);
            assert.ok(
              speed < cornerSpeedLimit,
              'the conservative continuous-sweep speed bound holds',
            );
          }),
        );
      previous = all;
    }
    context.diagnostic(
      `minimum SAT gap=${minimum.toFixed(3)}m; road margin=${railMargin.toFixed(3)}m; maximum corner speed=${measuredCornerSpeed.toFixed(2)}m/s`,
    );
  });

test('all shots and cues cover the retimed film, including the real landing', () => {
  assert.equal(COMPLETION_SHOTS[0].start, 0);
  assert.equal(COMPLETION_SHOTS.at(-1).end, COMPLETION_DURATION);
  for (let index = 1; index < COMPLETION_SHOTS.length; index++)
    assert.equal(
      COMPLETION_SHOTS[index].start,
      COMPLETION_SHOTS[index - 1].end,
    );
  assert.ok(
    COMPLETION_CUES.every(({ time }) => time > 0 && time < COMPLETION_DURATION),
  );
  assert.equal(
    COMPLETION_CUES.find(({ id }) => id === 'jump-land').time,
    COMPLETION_JUMP_END,
  );
  for (let time = 0; time < COMPLETION_DURATION; time += 0.1) {
    const sample = sampleCompletionTimeline(time);
    assert.ok(sample.camera.position.every(Number.isFinite));
    assert.ok(sample.camera.target.every(Number.isFinite));
  }
  assert.deepEqual(
    sampleCompletionTimeline(Infinity),
    sampleCompletionTimeline(0),
  );
});
