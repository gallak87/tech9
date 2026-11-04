import { createRapierWorld } from '../../physics/rapier-world.js';
import { NOMAD_MOTION_RULES, sampleCarrierMotion } from './motion.js';

/** One shared carrier clock stages all native rigid skins before racer queries. */
export async function createNomadDynamics({ track, collisionWorld }) {
  const world = await createRapierWorld({ collisionWorld, gravity: 26 });
  const usedGroups = new Set(
    collisionWorld.triangles
      .map((triangle) => triangle.motionGroup)
      .filter(Boolean),
  );
  const carriers = track.carriers.filter((carrier) =>
    usedGroups.has(carrier.id),
  );
  if (carriers.length !== usedGroups.size) {
    world.dispose();
    throw new Error(
      'Nomad collision motion groups must name authored carriers.',
    );
  }
  let time = 0;
  function place(at, dt = 0) {
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
    rulesId: `${world.rulesId}:nomad-carriers-v1:${JSON.stringify({
      rules: NOMAD_MOTION_RULES,
      carriers: carriers.map(({ id, motion }) => ({ id, motion })),
    })}`,
    // Nomad's authored sampler is the same moving chart used by rendering.
    // Static triangle support would replace its next-tick carrier destination
    // with the previous pose. Native triangles still resolve all free contacts.
    sampleRoadSurface: undefined,
    setNomadTime(value) {
      if (!Number.isFinite(value) || value < 0)
        throw new Error('Invalid Nomad carrier time.');
      if (value === time) return;
      time = value;
      place(time);
    },
    step(dt) {
      // Match the native world's accepted interval before touching any group.
      if (!Number.isFinite(dt) || dt <= 0 || dt > 0.1)
        throw new Error('Query world requires a finite fixed-step duration.');
      place(time, dt);
      world.step(dt);
      time += dt;
    },
    snapshot() {
      return { world: world.snapshot(), convoyTime: time };
    },
    restore(data) {
      if (!Number.isFinite(data?.convoyTime) || data.convoyTime < 0)
        throw new Error('Invalid Nomad carrier snapshot.');
      world.restore(data.world);
      time = data.convoyTime;
    },
    reset() {
      world.reset();
      time = 0;
      place(time);
    },
  };
}
