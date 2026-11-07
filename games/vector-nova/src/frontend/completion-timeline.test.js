import test, { before } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import { PerspectiveCamera, Quaternion, Vector3 } from 'three';
import { getCollisionHull } from '../ships/collision-hulls.js';
import { COMPLETION_SHIPS } from './completion-config.js';
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
let run, runs;
before(async () => {
  runs = Object.fromEntries(
    await Promise.all(
      COMPLETION_SHIPS.map(async (id) => {
        const bytes = await readFile(
          new URL(
            `../../public/assets/completion/shatterline-v1/${id}.json.gz`,
            import.meta.url,
          ),
        );
        return [id, JSON.parse(gunzipSync(bytes).toString('utf8'))];
      }),
    ),
  );
  run = runs.kestrel;
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
  assert.equal(at(run.landmarks.finishTime + 0.02), 'finish');
  assert.equal(at(run.landmarks.slideStartTime), 'exit');
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
    for (const offset of [-0.1, 0, 0.02]) {
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

test('all four fast native slides produce obvious pixel-space rotation and visible sideslip', (context) => {
  const aspect = 1581 / 890;
  const angleDifference = (a, b) =>
    Math.atan2(Math.sin(a - b), Math.cos(a - b));
  // NDC axes have different pixel scales. Measure on the actual landscape
  // viewport rather than overestimating apparent rotation with raw NDC angles.
  const screenAngle = (direction) =>
    Math.atan2(-direction.y, direction.x * aspect);
  for (const [id, recording] of Object.entries(runs)) {
    const director = createCompletionDirector({ track, run: recording });
    const {
      slideStartTime: start,
      slidePeakTime: peak,
      slideEndTime: end,
    } = recording.landmarks;
    assert.ok(
      start > recording.landmarks.finishTime &&
        peak > start &&
        end > peak &&
        end < recording.duration,
    );
    const peakSample = sampleCompletionRun(recording, peak);
    const startSample = sampleCompletionRun(recording, start);
    assert.ok(
      startSample.hero.state.speed >= 90 && peakSample.hero.state.speed >= 90,
      'the actual turn must retain racing speed instead of braking first',
    );
    const movementTime = Math.min(peak - 0.025, start + 0.12);
    const movementStart = sampleCompletionRun(recording, movementTime);
    const movementEnd = sampleCompletionRun(recording, movementTime + 0.1);
    assert.ok(
      new Vector3()
        .fromArray(movementStart.hero.position)
        .distanceTo(new Vector3().fromArray(movementEnd.hero.position)) >= 9,
      'native position must keep travelling at racing pace during the turn',
    );
    const movementCameras = [movementStart, movementEnd].map((sample, index) =>
      cameraFor(
        director.sample(movementTime + index * 0.1, sample, aspect),
        aspect,
      ),
    );
    let roadTravelPixels = 0;
    for (const ahead of [-8, 0, 8])
      for (const side of [-6, 0, 6]) {
        const road = track.sample(movementStart.hero.state.distance + ahead);
        const point = road.position
          .clone()
          .addScaledVector(road.right, movementStart.hero.state.lateral + side);
        const projected = movementCameras.map((camera) =>
          point.clone().project(camera),
        );
        if (
          projected.every(
            (p) => Math.abs(p.x) < 0.94 && Math.abs(p.y) < 0.94 && p.z < 1,
          )
        ) {
          const delta = projected[1].clone().sub(projected[0]);
          roadTravelPixels = Math.max(
            roadTravelPixels,
            Math.hypot(delta.x * aspect, delta.y) * (890 / 2),
          );
        }
      }
    assert.ok(
      roadTravelPixels >= 45,
      'in-frame road details must travel visibly through the position-following camera',
    );
    assert.equal(peakSample.hero.effects.slide.active, true);
    assert.ok(
      Math.abs(peakSample.hero.effects.slide.slipAngle) > 0.02,
      'the capture contains physical slip',
    );
    const exitStart = director.shots.find(({ id }) => id === 'exit').start;
    assert.ok(
      exitStart < start && exitStart >= recording.landmarks.finishTime + 0.04,
      'the checker clears before the camera shows the native slide develop',
    );
    let minCamera = Infinity,
      maxCamera = -Infinity,
      minBody = Infinity,
      maxBody = -Infinity;
    let previousScreenAngle = null,
      screenRotation = 0,
      minScreenRotation = Infinity,
      maxScreenRotation = -Infinity,
      maxScreenSlip = 0;
    for (
      let time = Math.max(start, exitStart) + 0.001;
      time <= end;
      time += 1 / 120
    ) {
      const sample = sampleCompletionRun(recording, time);
      const original = structuredClone(sample);
      const view = director.sample(time, sample, aspect);
      assert.deepEqual(
        sample,
        original,
        'the exit must not change native slide data',
      );
      assert.equal(view.shot, 'exit');
      const position = new Vector3().fromArray(sample.hero.position);
      const quaternion = new Quaternion().fromArray(sample.hero.quaternion);
      const frame = track.sample(sample.hero.state.distance);
      const direction = view.position.clone().sub(position);
      const nose = new Vector3(0, 0, 1).applyQuaternion(quaternion);
      assert.ok(direction.length() < 25, 'the fast slide needs a close view');
      assert.ok(
        direction.normalize().dot(nose) < Math.cos((35 * Math.PI) / 180),
        'the camera stays outside forward light cones',
      );
      const cameraAngle = Math.atan2(
        direction.dot(frame.right),
        direction.dot(frame.tangent),
      );
      const bodyAngle = Math.atan2(
        nose.dot(frame.right),
        nose.dot(frame.tangent),
      );
      minCamera = Math.min(minCamera, cameraAngle);
      maxCamera = Math.max(maxCamera, cameraAngle);
      minBody = Math.min(minBody, bodyAngle);
      maxBody = Math.max(maxBody, bodyAngle);
      const camera = cameraFor(view, aspect),
        bounds = getCollisionHull(id).bounds;
      const front = new Vector3(0, 0.6, 3)
        .applyQuaternion(quaternion)
        .add(position)
        .project(camera);
      const rear = new Vector3(0, 0.6, -3)
        .applyQuaternion(quaternion)
        .add(position)
        .project(camera);
      const headingOnScreen = screenAngle(front.sub(rear));
      if (previousScreenAngle !== null)
        screenRotation += angleDifference(headingOnScreen, previousScreenAngle);
      previousScreenAngle = headingOnScreen;
      minScreenRotation = Math.min(minScreenRotation, screenRotation);
      maxScreenRotation = Math.max(maxScreenRotation, screenRotation);
      const before = sampleCompletionRun(recording, time - recording.step).hero
        .position;
      const after = sampleCompletionRun(recording, time + recording.step).hero
        .position;
      const velocity = new Vector3()
        .fromArray(after)
        .sub(new Vector3().fromArray(before))
        .normalize();
      const origin = position.clone().addScaledVector(frame.up, 0.6),
        projectedOrigin = origin.clone().project(camera);
      const facing = origin
        .clone()
        .addScaledVector(nose, 3)
        .project(camera)
        .sub(projectedOrigin);
      const moving = origin
        .clone()
        .addScaledVector(velocity, 3)
        .project(camera)
        .sub(projectedOrigin);
      maxScreenSlip = Math.max(
        maxScreenSlip,
        Math.abs(angleDifference(screenAngle(facing), screenAngle(moving))),
      );
      let left = Infinity,
        right = -Infinity,
        top = -Infinity;
      for (const x of [bounds.min[0], bounds.max[0]])
        for (const y of [bounds.min[1], bounds.max[1]])
          for (const z of [bounds.min[2], bounds.max[2]]) {
            const point = new Vector3(x, y, z)
              .applyQuaternion(quaternion)
              .add(position)
              .project(camera);
            assert.ok(
              Math.abs(point.x) < 0.94 && Math.abs(point.y) < 0.94,
              `${id} slide cropped`,
            );
            left = Math.min(left, point.x);
            right = Math.max(right, point.x);
            top = Math.max(top, point.y);
            assert.ok(
              !(point.x < -0.08 && point.y < -0.5),
              'the title area must not cover the racer',
            );
          }
      assert.ok(
        right - left > 0.2 && top > -0.2,
        'the real hull remains large and centered above the title',
      );
    }
    assert.ok(
      maxBody - minBody > 0.25,
      `${id} has visible native yaw through the exit`,
    );
    assert.ok(
      maxCamera - minCamera < (maxBody - minBody) * 0.1 + 0.001,
      'the road-referenced camera does not follow away the native body rotation',
    );
    const apparentRotation =
      ((maxScreenRotation - minScreenRotation) * 180) / Math.PI;
    const apparentSlip = (maxScreenSlip * 180) / Math.PI;
    assert.ok(
      apparentRotation >= 20,
      `${id} only shows ${apparentRotation.toFixed(2)} degrees of actual pixel-space heading change`,
    );
    assert.ok(
      apparentSlip >= 10,
      `${id} only shows ${apparentSlip.toFixed(2)} degrees between actual body and movement directions on screen`,
    );
    assert.equal(
      director.sample(peak, peakSample, aspect).title,
      0,
      'the title must wait through the major slide',
    );
    const plan = completionShotPlan(recording);
    assert.ok(
      plan.titleStart >= end - 0.31,
      'title waits until nearly settled',
    );
    assert.ok(
      recording.duration - plan.titleStart - plan.titleFade >= 0.6,
      'title has readable time at full opacity',
    );
    assert.equal(
      director.sample(
        recording.duration,
        sampleCompletionRun(recording, recording.duration),
        aspect,
      ).title,
      1,
    );
    context.diagnostic(
      `${id}: ${apparentRotation.toFixed(1)} degrees screen heading, ${apparentSlip.toFixed(1)} degrees screen sideslip, ${roadTravelPixels.toFixed(0)}px road travel/100ms, ${startSample.hero.state.speed.toFixed(0)}→${peakSample.hero.state.speed.toFixed(0)}m/s`,
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
