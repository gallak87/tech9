import test, { before } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import { PerspectiveCamera, Quaternion, Vector3 } from 'three';
import { getCollisionHull } from '../ships/collision-hulls.js';
import { createShatterlineTrack } from '../levels/shatterline/track/model.js';
import { createFinishMarker } from '../race/finish-marker.js';
import { sampleCompletionRun } from './completion-run.js';
import {
  COMPLETION_DURATION,
  completionShotPlan,
  createCompletionDirector,
  completionCueForEvent,
} from './completion-timeline.js';

const track = createShatterlineTrack();
let run;
before(async () => {
  const bytes = await readFile(
    new URL(
      '../../public/assets/completion/shatterline-v1/kestrel.json.gz',
      import.meta.url,
    ),
  );
  run = JSON.parse(gunzipSync(bytes).toString('utf8'));
});
function cameraFor(view, aspect) {
  const camera = new PerspectiveCamera(view.fov, aspect, 0.1, 10000);
  camera.position.copy(view.position);
  camera.up.copy(view.up);
  camera.lookAt(view.target);
  camera.updateMatrixWorld();
  return camera;
}

test('the director follows real repulsor, Horizon flight, landing and sprint finish times', () => {
  const plan = completionShotPlan(run);
  assert.equal(run.duration, COMPLETION_DURATION);
  assert.equal(plan.shots[0].start, 0);
  assert.equal(plan.shots.at(-1).end, run.duration);
  for (let index = 0; index < plan.shots.length; index++) {
    assert.ok(plan.shots[index].end > plan.shots[index].start);
    if (index) assert.equal(plan.shots[index].start, plan.shots[index - 1].end);
  }
  const at = (time) =>
    plan.shots.find(({ start, end }) => time >= start && time < end)?.id;
  assert.equal(at(run.landmarks.firstFireTime), 'combat');
  assert.equal(at(run.landmarks.launchTime), 'flight');
  assert.equal(at(run.landmarks.landingTime), 'landing');
  assert.equal(at(run.landmarks.finishTime - 0.1), 'finish');
  assert.equal(at(run.landmarks.finishTime + 0.2), 'finish');
  assert.ok(
    plan.titleStart > run.landmarks.finishTime,
    'the victory title cannot precede the physical checker crossing',
  );
  assert.equal(run.landmarks.finishDistance, track.finishDistance);
  assert.equal(run.landmarks.jumpId, 'horizon-transfer');
  assert.ok(!plan.shots.some(({ id }) => /worm|leviathan|slide|park/.test(id)));
  assert.throws(
    () =>
      completionShotPlan({
        duration: 16,
        landmarks: { launchTime: 6, landingTime: 10 },
      }),
    /actual finish/,
  );
});

test('camera direction preserves all native poses and frames all four player hulls', () => {
  const director = createCompletionDirector({ track, run });
  for (const aspect of [1.1, 1.6, 2.5])
    for (let time = 0; time <= run.duration; time += 1 / 30) {
      const recording = sampleCompletionRun(run, time);
      const original = structuredClone(recording);
      const view = director.sample(time, recording, aspect);
      assert.deepEqual(
        recording,
        original,
        'the director must not modify recorded physics or events',
      );
      for (const value of [
        ...view.position,
        ...view.target,
        ...view.up,
        view.fov,
      ])
        assert.ok(Number.isFinite(value));
      assert.ok(view.position.distanceTo(view.target) > 2);
      assert.ok(Math.abs(view.up.length() - 1) < 1e-8);
      const camera = cameraFor(view, aspect);
      const q = new Quaternion().fromArray(recording.hero.quaternion);
      const position = new Vector3().fromArray(recording.hero.position);
      for (const id of ['kestrel', 'shrike', 'bastion', 'needle']) {
        const bounds = getCollisionHull(id).bounds;
        for (const x of [bounds.min[0], bounds.max[0]])
          for (const y of [bounds.min[1], bounds.max[1]])
            for (const z of [bounds.min[2], bounds.max[2]]) {
              const projected = new Vector3(x, y, z)
                .applyQuaternion(q)
                .add(position)
                .project(camera);
              assert.ok(
                Math.abs(projected.x) < 0.96 &&
                  Math.abs(projected.y) < 0.96 &&
                  projected.z < 1,
                `${id} cropped at ${time.toFixed(3)}s/${view.shot}/${aspect}`,
              );
            }
      }
    }
});

test('the real production checker and physical hero are readable before and after crossing', () => {
  const director = createCompletionDirector({ track, run });
  const marker = createFinishMarker(track);
  try {
    assert.equal(
      marker.group.userData.finishDistance,
      run.landmarks.finishDistance,
    );
    const positions = marker.group.children[0].geometry.attributes.position;
    for (const offset of [-0.1, 0, 0.2]) {
      const time = run.landmarks.finishTime + offset;
      const view = director.sample(time, sampleCompletionRun(run, time), 1.6);
      assert.equal(view.shot, 'finish');
      const camera = cameraFor(view, 1.6);
      let left = Infinity,
        right = -Infinity,
        bottom = Infinity,
        top = -Infinity;
      for (let index = 0; index < positions.count; index++) {
        const screen = new Vector3()
          .fromBufferAttribute(positions, index)
          .project(camera);
        assert.ok(
          Math.abs(screen.x) < 0.94 &&
            Math.abs(screen.y) < 0.94 &&
            screen.z < 1,
          'actual finish paint is cropped',
        );
        left = Math.min(left, screen.x);
        right = Math.max(right, screen.x);
        bottom = Math.min(bottom, screen.y);
        top = Math.max(top, screen.y);
      }
      assert.ok(right - left > 0.6, 'checker width must remain readable');
      assert.ok(
        top - bottom > 0.025,
        'the real two-row paint must not collapse to a line',
      );
    }
  } finally {
    marker.dispose();
  }
});

test('flight camera follows actual airborne velocity without tethering to the high launch lip', () => {
  const director = createCompletionDirector({ track, run });
  for (
    let time = run.landmarks.launchTime;
    time < run.landmarks.landingTime - 0.15;
    time += 1 / 60
  ) {
    const recording = sampleCompletionRun(run, time);
    const view = director.sample(time, recording, 1.6);
    assert.equal(view.shot, 'flight');
    const hero = new Vector3().fromArray(recording.hero.position);
    assert.ok(
      view.position.distanceTo(hero) < 40,
      'the native plunge cannot leave the racer tiny in frame',
    );
    assert.ok(view.position.y >= hero.y + 7 - 1e-8);
    const travel = new Vector3()
      .fromArray(recording.hero.motion.flight.velocity)
      .normalize();
    assert.ok(
      view.target.clone().sub(hero).dot(travel) > 2,
      'the receiving direction stays ahead',
    );
  }
});

test('audio follows native repulsor/jump events and the exact genuine winner crossing', () => {
  const heroEvents = run.events.filter(({ actor }) => actor === 'hero');
  const launch = heroEvents.find(({ type }) => type === 'jump-launch');
  const land = heroEvents.find(({ type }) => type === 'jump-transfer');
  const finish = heroEvents.find(({ type }) => type === 'sprint-complete');
  assert.equal(completionCueForEvent(launch).id, 'jump-activate');
  assert.equal(completionCueForEvent(land).id, 'jump-land');
  assert.equal(finish.time, run.landmarks.finishTime);
  assert.equal(finish.place, 1);
  assert.equal(completionCueForEvent(finish).id, 'race-winner');
  const pickup = heroEvents.find(
    ({ type, payload }) =>
      type === 'pickup-activate' && payload.kind === 'repulsor',
  );
  assert.equal(completionCueForEvent(pickup).id, 'repulsor-charge');
  assert.equal(completionCueForEvent({ ...finish, actor: 'rook' }), null);
  assert.equal(
    completionCueForEvent({
      type: 'jump-transfer',
      actor: 'hero',
      payload: { outcome: 'missed' },
    }),
    null,
  );
  assert.ok(
    sampleCompletionRun(run, finish.time + 1 / 60).eventsThroughTime.includes(
      finish,
    ),
    '60Hz audio observes the exact interpolated finish event',
  );
});
