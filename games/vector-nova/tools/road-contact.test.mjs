import test from 'node:test';
import assert from 'node:assert/strict';
import { createRapierWorld } from '../src/physics/rapier-world.js';
import { withMagneticBoundaries } from '../src/physics/magnetic-boundaries.js';
import { createVehicleState } from '../src/physics/index.js';
import { getRacerControl } from '../src/race/racers.js';

const DT = 1 / 120;
const cases = {
  glasswake: [
    [600, 6],
    [1030, 6],
    [3700, -6],
  ],
  saffron: [
    [4195, -12],
    [4195, -16],
    [4195, -10],
  ],
  nightweir: [
    [10892, 18],
    [10892, 10],
  ],
  worldspire: [[9255, -21]],
  zephyr: [
    [1222, 12],
    [1415, -12],
  ],
};
for (const [slug, starts] of Object.entries(cases)) {
  test(`${slug}: authored road support preserves momentum solo and beside another native hull`, async (t) => {
    const level = (await import(`../src/levels/${slug}/index.js`)).default({});
    const track = level.createTrack();
    const collisionWorld = level.createCollisionWorld({ track });
    const physicalWorld = withMagneticBoundaries(track, collisionWorld);
    const native = level.createDynamics
      ? await level.createDynamics({ track, collisionWorld: physicalWorld })
      : await createRapierWorld({ collisionWorld: physicalWorld });
    const actors = [];
    const dynamics = {
      ...native,
      createActor(...args) {
        const actor = native.createActor(...args);
        actors.push(actor);
        return actor;
      },
    };
    const runtimes = [0, 1].map(() =>
      level.createRuntime({
        track,
        collisionWorld,
        dynamics,
        presentation: false,
        settings: { steeringAssist: 0.3 },
      }),
    );
    t.after(() => {
      for (const runtime of runtimes) runtime.dispose();
      native.dispose();
      collisionWorld.dispose();
    });
    for (const [distance, lateral] of starts)
      for (const speed of [112, 160])
        for (const pair of [false, true]) {
          dynamics.reset();
          const states = [0, 1].map((i) => ({
            ...createVehicleState(),
            distance,
            lateral: i ? lateral - Math.sign(lateral) * 7 : lateral,
            speed,
          }));
          const lanes = states.map((state) => state.lateral);
          runtimes.forEach((runtime, i) => runtime.reset({ state: states[i] }));
          let genuineContact = false;
          for (let tick = 0; tick < 60; tick++) {
            const before = states[0].speed;
            for (let i = 0; i < (pair ? 2 : 1); i++)
              runtimes[i].beginAdvance(
                states[i],
                {
                  ...getRacerControl(states[i], track, {
                    runtime: runtimes[i],
                    difficulty: 'hard',
                    lane: lanes[i],
                  }),
                  throttle: 1,
                  brake: 0,
                  boost: speed === 160,
                },
                DT,
              );
            dynamics.step(DT);
            for (let i = 0; i < (pair ? 2 : 1); i++)
              runtimes[i].finishAdvance(states[i]);
            const contacts = actors[0].read().contacts;
            assert.ok(
              !contacts.some(({ shape }) => shape.kind === 'deck'),
              'the supporting skin has one contact owner',
            );
            genuineContact ||= contacts.some(({ shape }) =>
              ['rail', 'racer'].includes(shape.kind),
            );
            assert.ok(
              before - states[0].speed < (genuineContact ? 12 : 1.3),
              `unexpected braking at ${distance}/${lateral}/${speed}, pair=${pair}, tick=${tick}`,
            );
            assert.ok(
              states[0].speed > speed * 0.75,
              'a scrape cannot strand the hull',
            );
            assert.equal(runtimes[0].pose(1).grounded, true);
          }
          assert.ok(
            states[0].distance > distance + speed * 0.4,
            'continuous road carries the ship forward',
          );
        }
  });
}
