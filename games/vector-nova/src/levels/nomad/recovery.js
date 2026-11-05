export const NOMAD_RECOVERY_RULES = Object.freeze({
  version: 1,
  receiverOffset: 120,
  approachDistance: 220,
  speed: 100,
  lateProgress: 0.65,
});

/** Recovery points belong to the current moving road chart, never a saved
 * world position. Bank supported landings and completed recoveries. */
export function createNomadRecovery(track) {
  const major = track.jumps.filter((jump) => jump.bigAir);
  let banked = null,
    missed = null;
  const byId = (id) => major.find((jump) => jump.id === id);
  const approach = (jump) => ({
    distance: Math.max(
      track.carrierAt(jump.takeoff - 1).start + 20,
      jump.takeoff - NOMAD_RECOVERY_RULES.approachDistance,
    ),
    speed: NOMAD_RECOVERY_RULES.speed,
  });
  const receiver = (jump) => ({
    distance: jump.recovery,
    speed: NOMAD_RECOVERY_RULES.speed,
  });
  function late(jump, position, time) {
    if (!position) return false;
    const from = track.frameAtTime(jump.takeoff, time).position;
    const delta = track
      .frameAtTime(jump.landingStart, time)
      .position.sub(from)
      .setY(0);
    const travel = position.clone().sub(from).setY(0);
    return (
      travel.dot(delta) / Math.max(1, delta.lengthSq()) >=
      NOMAD_RECOVERY_RULES.lateProgress
    );
  }
  function groundTarget(state) {
    const upcoming = major.find(
      (jump) =>
        state.distance <= jump.takeoff &&
        state.distance >= jump.takeoff - NOMAD_RECOVERY_RULES.approachDistance,
    );
    if (upcoming) return approach(upcoming);
    const jump = byId(banked);
    if (jump && track.carrierAt(state.distance)?.id === jump.receivingCarrierId)
      return receiver(jump);
    return null;
  }
  return {
    reset({ preserveBank = false, state } = {}) {
      if (!preserveBank) banked = null;
      missed = null;
      if (preserveBank && state) {
        const jump = major.find(
          (entry) => Math.abs(entry.recovery - state.distance) < 1e-5,
        );
        if (jump) banked = jump.id;
      }
    },
    snapshot: () => ({ banked, missed: missed && { ...missed } }),
    validate(data) {
      if (
        !data ||
        (data.banked !== null && !byId(data.banked)) ||
        (data.missed !== null &&
          (!byId(data.missed?.id) || typeof data.missed.late !== 'boolean'))
      )
        throw new Error('Invalid Nomad recovery checkpoint.');
    },
    restore(data) {
      this.validate(data);
      banked = data.banked;
      missed = data.missed && { ...data.missed };
    },
    observe(state, events, pose) {
      let target = null;
      for (const event of events) {
        const jump = byId(event.payload?.id);
        if (event.type === 'jump-miss' && jump)
          missed = {
            id: jump.id,
            late: late(jump, pose?.position, state.time),
          };
        if (event.type === 'jump-transfer' && jump) {
          if (event.payload.outcome === 'landed') banked = jump.id;
          else if (event.payload.outcome === 'recovered') {
            target =
              missed?.id === jump.id && !missed.late
                ? approach(jump)
                : receiver(jump);
            event.payload.to = target.distance;
            if (target.distance === jump.recovery) banked = jump.id;
          }
          missed = null;
        }
        if (event.type === 'road-recovery') {
          target = groundTarget(state);
          if (target) event.payload.distance = target.distance;
        }
      }
      return target;
    },
    manualTarget(state, snapshot, pose) {
      const jump = byId(snapshot.flight?.id);
      if (jump) {
        const isLate =
          missed?.id === jump.id
            ? missed.late
            : late(jump, pose?.position, state.time);
        if (!isLate) return approach(jump);
        return {
          ...receiver(jump),
          transfer: {
            type: 'jump-transfer',
            payload: {
              id: jump.id,
              from: jump.takeoff,
              to: jump.recovery,
              outcome: 'recovered',
            },
          },
        };
      }
      return groundTarget(state);
    },
  };
}
