import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import createNacreLevel from '../levels/nacre/index.js';
import {
  generateCompletionRun,
  sampleCompletionRun,
  COMPLETION_RUN_STEP,
  COMPLETION_RUN_DURATION,
} from './completion-run.js';

const track = createNacreLevel({ shape: false }).createTrack();
const runs = new Map();
async function runFor(shipId) {
  if (!runs.has(shipId))
    runs.set(shipId, generateCompletionRun({ track, shipId }));
  return runs.get(shipId);
}
const finitePose = (pose) =>
  pose.position.length === 3 &&
  pose.quaternion.length === 4 &&
  [...pose.position, ...pose.quaternion].every(Number.isFinite);

test('every supported hero chassis genuinely fires, jumps and lands in a bounded native three-racer run', async (t) => {
  for (const shipId of ['kestrel', 'shrike', 'bastion', 'needle']) {
    await t.test(shipId, async () => {
      const run = await runFor(shipId);
      assert.equal(run.duration, COMPLETION_RUN_DURATION);
      assert.equal(run.step, COMPLETION_RUN_STEP);
      assert.equal(run.frames.length, Math.round(run.duration / run.step) + 1);
      assert.equal(run.frames[0].hero.state.distance, 250);
      assert.equal(run.frames[0].hero.state.speed, 112);
      assert.equal(run.frames[0].hero.state.shipId, shipId);
      assert.equal(run.frames[0].hero.state.chassisId, shipId);
      assert.deepEqual(
        run.actors.map(({ id }) => id),
        ['hero', 'rook', 'manta'],
      );
      assert.deepEqual(
        run.devices.find(({ id }) => id === 'breaker-arc'),
        {
          id: 'breaker-arc',
          type: 'arc',
          distance: 620,
          lateral: -6,
          width: 5,
          length: 10,
          label: 'Breaker arc',
        },
      );
      for (const { id } of run.actors) {
        const launches = run.events.filter(
          (event) => event.actor === id && event.type === 'jump-launch',
        );
        const landings = run.events.filter(
          (event) => event.actor === id && event.type === 'jump-transfer',
        );
        assert.equal(launches.length, 1);
        assert.equal(landings.length, 1);
        assert.equal(landings[0].payload.outcome, 'landed');
        assert.equal(landings[0].payload.id, 'storm-leap');
        assert.ok(landings[0].time > launches[0].time + 1);
        let previous = null;
        for (const frame of run.frames) {
          const actor = frame[id];
          assert.ok(finitePose(actor));
          assert.ok(
            Math.abs(
              new T.Quaternion().fromArray(actor.quaternion).length() - 1,
            ) < 1e-10,
          );
          assert.equal(actor.state.resetCount, 0);
          assert.equal(actor.recovering, false);
          assert.ok(actor.state.speed > 50 && actor.state.speed < 190);
          if (previous)
            assert.ok(
              new T.Vector3().fromArray(actor.position).distanceTo(previous) <
                3,
              `${id}: physical pose cannot teleport between 120 Hz ticks`,
            );
          previous = new T.Vector3().fromArray(actor.position);
        }
        assert.equal(run.frames.at(-1)[id].grounded, true);
        assert.ok(
          run.frames.at(-1)[id].state.distance > track.jumps[0].landingEnd,
        );
      }
      assert.equal(
        run.events.some(({ type }) =>
          [
            'jump-miss',
            'jump-recover',
            'road-recovery',
            'manual-reset',
          ].includes(type),
        ),
        false,
      );
      const heroEvents = run.events.filter(({ actor }) => actor === 'hero');
      const fires = heroEvents.filter(
        ({ type, payload }) => type === 'combat-fire' && payload.kind === 'arc',
      );
      assert.equal(
        fires.length,
        3,
        'the real Arc gate emits its complete three-shot program',
      );
      assert.ok(
        heroEvents.some(
          ({ type, payload }) => type === 'combat-confirm' && payload.shielded,
        ),
      );
      assert.ok(
        heroEvents.some(
          ({ type, payload }) => type === 'combat-confirm' && !payload.shielded,
        ),
      );
      assert.ok(run.frames.some(({ combat }) => combat.shots.length > 0));
      assert.ok(
        run.frames.some(
          ({ combat }) => combat.disruptions.rook?.kind === 'arc',
        ),
      );
      const {
        gateTime,
        firstFireTime,
        firstHitTime,
        launchTime,
        landingTime,
        wormPeakTime,
      } = run.landmarks;
      assert.ok(gateTime < firstFireTime && firstFireTime < firstHitTime);
      assert.ok(firstHitTime < launchTime && launchTime < landingTime);
      assert.ok(wormPeakTime > firstFireTime && wormPeakTime < landingTime);
      assert.ok(
        run.duration - landingTime > 3,
        'normal driving continues after the genuine landing',
      );
      assert.ok(
        run.frames.some(
          (frame) =>
            !frame.hero.grounded && frame.hero.motion.mode === 'flight',
        ),
      );
      assert.ok(
        JSON.stringify(run).length < 8_000_000,
        'recording remains bounded without native snapshots or assets',
      );
    });
  }
});

test('playback interpolates only the actual recorded world poses at one-times speed', async () => {
  const run = await runFor('kestrel');
  for (const frame of run.frames) {
    const exact = sampleCompletionRun(run, frame.time);
    assert.equal(exact.hero.state.time, frame.hero.state.time);
    assert.equal(exact.hero.grounded, frame.hero.grounded);
  }
  const firstFire = run.landmarks.firstFireTime;
  const crossed = sampleCompletionRun(
    run,
    firstFire + 1 / 60,
  ).eventsThroughTime;
  assert.ok(
    crossed.some(
      (event) => event.actor === 'hero' && event.type === 'combat-fire',
    ),
  );
  const index = 500;
  const a = run.frames[index],
    b = run.frames[index + 1];
  const originalSpeed = a.hero.state.speed;
  const sample = sampleCompletionRun(run, (a.time + b.time) / 2);
  const expected = new T.Vector3()
    .fromArray(a.hero.position)
    .lerp(new T.Vector3().fromArray(b.hero.position), 0.5);
  assert.ok(
    new T.Vector3().fromArray(sample.hero.position).distanceTo(expected) <
      1e-10,
  );
  const orientation = new T.Quaternion()
    .fromArray(a.hero.quaternion)
    .slerp(new T.Quaternion().fromArray(b.hero.quaternion), 0.5);
  assert.ok(
    new T.Quaternion().fromArray(sample.hero.quaternion).angleTo(orientation) <
      1e-7,
  );
  assert.deepEqual(sample.hero.state, a.hero.state);
  sample.hero.position[0] += 999;
  sample.hero.state.speed = -999;
  assert.equal(run.frames[index].hero.state.speed, originalSpeed);
  assert.notEqual(sample.hero.position[0], a.hero.position[0]);
  assert.deepEqual(
    sampleCompletionRun(run, -1).hero.position,
    run.frames[0].hero.position,
  );
  assert.deepEqual(
    sampleCompletionRun(run, 99).hero.position,
    run.frames.at(-1).hero.position,
  );
});

test('a second capture repeats the real controls, contacts and flight exactly', async () => {
  const first = await runFor('kestrel');
  const second = await generateCompletionRun({ track, shipId: 'kestrel' });
  assert.equal(second.identity, first.identity);
  assert.deepEqual(second.events, first.events);
  for (const index of [0, 333, 650, 800, 1000, 1680])
    assert.deepEqual(second.frames[index], first.frames[index]);
});

test('capture cancellation interrupts loading before returning a partial film', async () => {
  const already = new AbortController();
  already.abort();
  await assert.rejects(
    generateCompletionRun({ track, shipId: 'kestrel', signal: already.signal }),
    { name: 'AbortError' },
  );
  const loading = new AbortController();
  let progress = 0;
  await assert.rejects(
    generateCompletionRun({
      track,
      shipId: 'kestrel',
      signal: loading.signal,
      onProgress(value) {
        progress = value;
        loading.abort();
      },
    }),
    { name: 'AbortError' },
  );
  assert.ok(progress > 0 && progress < 1);
});
