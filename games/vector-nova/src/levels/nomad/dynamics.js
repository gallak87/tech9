import { createRapierWorld } from '../../physics/rapier-world.js';
import { NOMAD_MOTION_RULES, sampleCarrierMotion } from './motion.js';
import {
  NOMAD_GROUND_GROUP,
  sampleNomadGroundMotion,
} from './ground-motion.js';

/** One shared carrier clock stages all native rigid skins before racer queries. */
export async function createNomadDynamics({ track, collisionWorld }) {
  const world = await createRapierWorld({ collisionWorld, gravity: 26 });
  const usedGroups = new Set(
    collisionWorld.triangles
      .map((triangle) => triangle.motionGroup)
      .filter(Boolean),
  );
  const movingGround = usedGroups.delete(NOMAD_GROUND_GROUP);
  const carriers = track.carriers.filter((carrier) =>
    usedGroups.has(carrier.id),
  );
  if (carriers.length !== usedGroups.size) {
    world.dispose();
    throw new Error(
      'Nomad collision motion groups must name authored carriers or the salt ground.',
    );
  }
  let time = 0,
    countdownTime = null;
  function place(at, dt = 0) {
    if (movingGround)
      world.setGroupMotion(
        NOMAD_GROUND_GROUP,
        sampleNomadGroundMotion(track, at),
      );
    for (const carrier of carriers) {
      const motion = sampleCarrierMotion(carrier, at);
      // Integrate the exact analytic endpoints. The collision sweep sees one
      // continuous rigid translation, not a frozen endpoint or a rebuilt mesh.
      const velocity =
        dt > 0
          ? sampleCarrierMotion(carrier, at + dt)
              .translation.sub(motion.translation)
              .divideScalar(dt)
          : motion.velocity;
      world.setGroupMotion(carrier.id, {
        translation: motion.translation,
        velocity,
      });
    }
  }
  place(0);
  return {
    ...world,
    id: 'nomad-moving-carrier-world',
    rulesId: `${world.rulesId}:nomad-carriers-v2:${JSON.stringify({
      rules: NOMAD_MOTION_RULES,
      movingGround,
      carriers: carriers.map(({ id, motion }) => ({ id, motion })),
    })}`,
    // Nomad's authored sampler is the same moving chart used by rendering.
    // Static triangle support would replace its next-tick carrier destination
    // with the previous pose. Native triangles still resolve all free contacts.
    sampleRoadSurface: undefined,
    setNomadTime(value) {
      if (!Number.isFinite(value) || value < 0)
        throw new Error('Invalid Nomad carrier time.');
      if (value === time && countdownTime === null) return;
      time = value;
      countdownTime = null;
      place(time);
    },
    setNomadCountdownTime(value) {
      if (value !== null && (!Number.isFinite(value) || value > time))
        throw new Error('Invalid Nomad countdown phase.');
      if (countdownTime === value) return;
      countdownTime = value;
      place(countdownTime ?? time);
    },
    step(dt) {
      // Match the native world's accepted interval before touching any group.
      if (!Number.isFinite(dt) || dt <= 0 || dt > 0.1)
        throw new Error('Query world requires a finite fixed-step duration.');
      if (countdownTime !== null)
        throw new Error('Finish the Nomad countdown before advancing.');
      place(time, dt);
      world.step(dt);
      time += dt;
    },
    snapshot() {
      return { world: world.snapshot(), convoyTime: time, countdownTime };
    },
    restore(data) {
      if (!Number.isFinite(data?.convoyTime) || data.convoyTime < 0)
        throw new Error('Invalid Nomad carrier snapshot.');
      const nextCountdown = data.countdownTime ?? null;
      if (
        nextCountdown !== null &&
        (!Number.isFinite(nextCountdown) || nextCountdown > data.convoyTime)
      )
        throw new Error('Invalid Nomad countdown snapshot.');
      world.restore(data.world);
      time = data.convoyTime;
      countdownTime = nextCountdown;
    },
    reset() {
      world.reset();
      time = 0;
      countdownTime = null;
      place(time);
    },
  };
}
