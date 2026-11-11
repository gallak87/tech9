import {
  createLandingVfx,
  LANDING_BURST_SPAN,
} from '../presentation/landing-vfx.js';
import { FREESTYLE_GRADES, freestyleLandingGrade } from './arcade.js';

// Freestyle owns the contact confirmation and grading; the shared renderer
// only draws their timed magnetic seating envelope.
export function createFreestyleCatchVfx({ track }) {
  const renderer = createLandingVfx({
    track,
    namePrefix: 'Freestyle',
    color: FREESTYLE_GRADES.good.hex,
  });
  const landing = { clock: 0, contact: null, burst: null, supported: true };
  let contact = null;
  let bank = null;
  let clock = null;
  let previousBankId = null;
  let previousBankAt = null;
  let grade = null;
  let disposed = false;

  function reset() {
    contact = null;
    bank = null;
    clock = null;
    previousBankId = null;
    previousBankAt = null;
    grade = null;
    landing.contact = null;
    landing.burst = null;
    renderer.reset();
  }

  return {
    group: renderer.group,
    reset,
    getPresentation() {
      return { ...renderer.getPresentation(), grade };
    },
    update(frame) {
      if (disposed) return;
      const fs = frame.motion?.freestyle ?? frame.motion?.motion?.freestyle;
      if (!fs || !frame.ship?.group || !frame.state) {
        reset();
        return;
      }
      if (frame.reset || (clock != null && fs.clock < clock)) reset();
      clock = fs.clock;
      const pending = fs.pendingLanding;
      if (pending && contact?.id !== pending.id) {
        contact = {
          id: pending.id,
          at: clock - Math.max(0, pending.elapsed ?? 0),
        };
        bank = null;
      }
      const leg = fs.legs.at(-1);
      const id = leg?.id ?? null;
      const at = leg?.at ?? null;
      if (id !== previousBankId || at !== previousBankAt) {
        previousBankId = id;
        previousBankAt = at;
        const age = leg ? clock - leg.at : Infinity;
        if (leg && age >= 0 && age < LANDING_BURST_SPAN) {
          const result = freestyleLandingGrade(leg);
          bank =
            result === 'miss'
              ? null
              : {
                  id: leg.id,
                  at: leg.at,
                  grade: result,
                  color: FREESTYLE_GRADES[result].hex,
                  strength: { good: 0.64, great: 0.88, perfect: 1.1 }[result],
                  brightTies: result === 'perfect',
                };
          if (result === 'miss') contact = null;
        }
      }
      const bankAge = bank ? clock - bank.at : Infinity;
      grade = bankAge >= 0 && bankAge < LANDING_BURST_SPAN ? bank.grade : null;
      landing.clock = clock;
      landing.contact = contact;
      landing.burst = bank;
      renderer.update(frame, landing);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      reset();
      renderer.dispose();
    },
  };
}
