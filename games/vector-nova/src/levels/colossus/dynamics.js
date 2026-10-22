import * as T from 'three';
import { createRapierWorld } from '../../physics/rapier-world.js';
import {
  pressPose,
  PRESS_RULES,
  ejectorPose,
  EJECTOR_RULES,
} from './mechanics.js';

/** Level-owned massive press actors use the same swept hull queries as the field. */
export async function createColossusDynamics({ track, collisionWorld }) {
  const world = await createRapierWorld({ collisionWorld, gravity: 26 });
  const machines = [
    ...track.presses.map((spec) => ({ spec, pose: pressPose })),
    ...track.ejectors.map((spec) => ({ spec, pose: ejectorPose })),
  ].map(({ spec, pose }) => ({
    spec,
    pose,
    actor: world.createActor({
      hull: {
        halfWidth: spec.width / 2,
        halfLength: spec.depth / 2,
        hover: spec.height / 2,
      },
      mass: 1000000,
    }),
  }));
  let time = 0;
  return {
    ...world,
    id: 'colossus-press-query-world',
    rulesId:
      world.rulesId +
      ':machines-v2:' +
      JSON.stringify({
        presses: PRESS_RULES,
        ejectors: EJECTOR_RULES,
        layout: track.ejectors,
      }),
    setMachineTime(value) {
      if (Number.isFinite(value)) time = value;
    },
    step(dt) {
      for (const { spec, pose, actor } of machines) {
        const now = pose(track, spec, time),
          next = pose(track, spec, time + dt);
        actor.stage({
          pose: now,
          velocity: next.position.clone().sub(now.position).divideScalar(dt),
          angularVelocity: new T.Vector3(),
          active: true,
          support: null,
          acceleration: new T.Vector3(0, 26, 0),
        });
      }
      world.step(dt);
      time += dt;
    },
    snapshot() {
      return { world: world.snapshot(), machineTime: time };
    },
    restore(data) {
      if (!Number.isFinite(data?.machineTime))
        throw new Error('Invalid Colossus machine clock');
      world.restore(data.world);
      time = data.machineTime;
    },
    reset() {
      world.reset();
      time = 0;
    },
    // The base world owns every actor and releases them together.
  };
}
