const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

// Presentation follows confirmed support. It never writes vehicle state, adds
// landing assistance or participates in replay/record identity.
export function createLandingFeedback() {
  const frame = { clock: 0, contact: null, burst: null, supported: false };
  let airborneAt = null,
    pending = null,
    lastTransfer = null;
  function reset(clock = 0) {
    frame.clock = Number.isFinite(clock) ? clock : 0;
    frame.contact = frame.burst = null;
    frame.supported = false;
    airborneAt = pending = lastTransfer = null;
  }
  return {
    reset,
    event({ type, payload = {}, time = frame.clock }) {
      if (time < frame.clock) reset(time);
      if (
        type === 'road-recovery' ||
        (type === 'jump-transfer' && payload.outcome !== 'landed')
      ) {
        reset(time);
        return;
      }
      if (type === 'jump-launch') {
        airborneAt ??= time;
        frame.contact = frame.burst = null;
      }
      if (type !== 'jump-transfer' || payload.outcome !== 'landed') return;
      const key = `${payload.id}:${time}:${payload.from}:${payload.to}`;
      if (lastTransfer === key) return;
      lastTransfer = key;
      pending = {
        id: payload.id,
        at: time,
        airtime: airborneAt === null ? null : Math.max(0, time - airborneAt),
      };
    },
    sample({ clock, grounded, recovering = false }) {
      if (clock < frame.clock) reset(clock);
      frame.clock = clock;
      frame.supported = grounded === true && !recovering;
      if (recovering) {
        frame.contact = frame.burst = pending = null;
        airborneAt = null;
        return null;
      }
      if (grounded === false) {
        airborneAt ??= clock;
        frame.contact = frame.burst = null;
        // A stale contact cannot celebrate a later, unrelated return to road.
        if (pending && clock - pending.at > 0.1) pending = null;
        return null;
      }
      if (!frame.supported) return null;
      airborneAt = null;
      if (frame.burst && clock - frame.burst.at > 0.68)
        frame.contact = frame.burst = null;
      if (!pending) return null;
      const contact = pending;
      pending = null;
      if (
        clock - contact.at > 0.1 ||
        (contact.airtime !== null && contact.airtime < 0.18)
      )
        return null;
      const strength = 0.65 + 0.35 * clamp((contact.airtime ?? 1) / 2, 0, 1);
      frame.contact = { id: contact.id, at: clock, strength: 0.38 * strength };
      frame.burst = {
        id: contact.id,
        at: clock + 0.08,
        strength: 0.88 * strength,
      };
      return {
        type: 'landing-catch',
        payload: { id: contact.id, at: clock, strength },
      };
    },
    read: () => frame,
  };
}

export function applyLandingImpulse(feedback, { seat = 0, lock = 0 }) {
  if (!seat && !lock) return feedback;
  return {
    ...feedback,
    // At most 24 cm: seat and release inside the existing hover clearance.
    hullHeave: feedback.hullHeave - seat * 0.24,
    hullPitch: feedback.hullPitch + seat * 0.008,
    fov: feedback.fov - seat * 0.85 - lock * 0.35,
    position: [
      feedback.position[0],
      feedback.position[1] - seat * 0.08,
      feedback.position[2] - lock * 0.09,
    ],
    rotation: [
      feedback.rotation[0] + seat * 0.002,
      feedback.rotation[1],
      feedback.rotation[2],
    ],
  };
}

export function withLandingFeedback(
  feedback,
  data,
  { reducedMotion = false, mode = 'racing' } = {},
) {
  if (!data?.supported || reducedMotion || !['racing', 'paused'].includes(mode))
    return feedback;
  const contactAge = data.contact ? data.clock - data.contact.at : Infinity;
  const lockAge = data.burst ? data.clock - data.burst.at : Infinity;
  const strength = (data.contact?.strength ?? 0) / 0.38;
  return applyLandingImpulse(feedback, {
    seat:
      contactAge >= 0 && contactAge < 0.22
        ? Math.sin((Math.PI * contactAge) / 0.22) ** 2 * strength
        : 0,
    lock:
      lockAge >= 0 && lockAge < 0.32
        ? Math.sin((Math.PI * lockAge) / 0.32) *
          Math.exp(-lockAge * 7) *
          strength
        : 0,
  });
}
