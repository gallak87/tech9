import { FREESTYLE_RULES } from '../freestyle/rules.js';
import { withFreestyleCatchFeedback } from '../freestyle/catch-feedback.js';
import { withLandingFeedback } from '../presentation/landing-feedback.js';

export const LANDING_PREVIEW_CONTACT = 0.65;
export const LANDING_PREVIEW_BANK =
  LANDING_PREVIEW_CONTACT + FREESTYLE_RULES.landingWindow;
export const LANDING_PREVIEW_DURATION = LANDING_PREVIEW_BANK + 1.05;

export const LANDING_PREVIEWS = [
  {
    id: 'landing-catch',
    label: 'Landing · magnetic touchdown',
    group: 'Landing & Freestyle',
    detail: 'Descend, catch the road and settle the magnetic suspension.',
  },
  ...['good', 'great', 'perfect'].map((grade) => ({
    id: `freestyle-${grade}`,
    label: `Freestyle · ${grade[0].toUpperCase()}${grade.slice(1)} landing`,
    group: 'Landing & Freestyle',
    detail:
      'Touchdown and hull seating, then the graded catch and points reward.',
  })),
  {
    id: 'freestyle-trick',
    label: 'Freestyle · roll, touchdown + Perfect bank',
    group: 'Landing & Freestyle',
    detail:
      'Completed-roll tick followed by the magnetic touchdown and Perfect reward.',
  },
];

export const isLandingPreview = (kind) =>
  LANDING_PREVIEWS.some((entry) => entry.id === kind);

// Bounded studio poses and event anchors. They feed the actual gameplay
// presentation owners without constructing a vehicle, circuit or collision world.
export function landingDemonstration(
  kind,
  time = 0,
  previous = -1,
  reducedMotion = false,
) {
  const graded = kind.startsWith('freestyle-');
  const grade = kind === 'freestyle-trick' ? 'perfect' : kind.slice(10);
  const airborne = time < LANDING_PREVIEW_CONTACT;
  const banked = graded && time >= LANDING_PREVIEW_BANK;
  const id = 'inspector-landing';
  const contact = airborne
    ? null
    : { id, at: LANDING_PREVIEW_CONTACT, strength: 0.38 };
  const leg = banked
    ? {
        id,
        at: LANDING_PREVIEW_BANK,
        touchdownAt: LANDING_PREVIEW_CONTACT,
        landed: true,
        clean: grade !== 'good',
        perfect: grade === 'perfect',
        bank: { good: 1000, great: 2000, perfect: 2500 }[grade],
        chain: 1,
      }
    : null;
  const freestyle = {
    clock: time,
    flight: airborne ? { id } : null,
    pendingLanding:
      graded && !airborne && !banked
        ? { id, elapsed: time - LANDING_PREVIEW_CONTACT }
        : null,
    legs: leg ? [leg] : [],
  };
  const landing = {
    clock: time,
    supported: !airborne,
    contact,
    burst: contact
      ? { id, at: LANDING_PREVIEW_CONTACT + 0.08, strength: 0.88 }
      : null,
  };
  const neutral = {
    hullHeave: 0,
    hullPitch: 0,
    fov: 0,
    position: [0, 0, 0],
    rotation: [0, 0, 0],
  };
  const feedback = graded
    ? withFreestyleCatchFeedback(neutral, freestyle, { reducedMotion })
    : withLandingFeedback(neutral, landing, { reducedMotion });
  const descent = Math.max(0, 1 - (time / LANDING_PREVIEW_CONTACT) ** 2);
  const roll =
    kind === 'freestyle-trick' && time < 0.32 && !reducedMotion
      ? (time / 0.32) * Math.PI * 2
      : 0;
  const events = [];
  const crossed = (at) => previous < at && time >= at;
  if (kind === 'freestyle-trick' && crossed(0.32))
    events.push({
      type: 'freestyle-trick',
      payload: { id, ordinal: 1, kind: 'roll' },
    });
  if (crossed(LANDING_PREVIEW_CONTACT))
    events.push({
      type: 'landing-catch',
      payload: { id, at: LANDING_PREVIEW_CONTACT, strength: 1 },
    });
  if (leg && crossed(LANDING_PREVIEW_BANK))
    events.push({ type: 'freestyle-bank', payload: leg });
  return {
    kind,
    grade: graded ? grade : null,
    position: [0, 2.8 * descent + feedback.hullHeave, 0],
    rotation: [feedback.hullPitch, 0, roll],
    airborne,
    stage: airborne
      ? 'Descending toward the road'
      : graded && !banked
        ? 'Touchdown · magnetic suspension engaged'
        : graded
          ? `${grade[0].toUpperCase()}${grade.slice(1)} · points banked`
          : 'Landing · magnetic catch',
    end: LANDING_PREVIEW_DURATION,
    events,
    landing,
    freestyle,
  };
}
