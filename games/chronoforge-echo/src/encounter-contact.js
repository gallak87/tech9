import { meetsWorldRequirement } from './world.js';

// Flatten the ring onto the ground plane. Contact adds a small forgiving margin
// around it; cleared patrols remain opt-in replays.
export const ENCOUNTER_RING = Object.freeze({ radiusX: 36, radiusY: 20 });
export const ENCOUNTER_CONTACT_PADDING = 15;

export function hasContactBoundary(encounter, state) {
  return (
    encounter.type === 'encounter' &&
    !state.cleared?.[encounter.id] &&
    meetsWorldRequirement(state, encounter.requires)
  );
}

function contactTime(encounter, from, to) {
  const rx = ENCOUNTER_RING.radiusX + ENCOUNTER_CONTACT_PADDING,
    ry = ENCOUNTER_RING.radiusY + ENCOUNTER_CONTACT_PADDING;
  // Normalize the padded ellipse into a unit circle for the swept crossing.
  const x = (from.x - encounter.x) / rx,
    y = (from.y - encounter.y) / ry;
  const distance = x * x + y * y - 1;
  if (distance <= 0) return 0;
  const dx = (to.x - from.x) / rx,
    dy = (to.y - from.y) / ry,
    length = dx * dx + dy * dy;
  if (!length) return null;
  const dot = x * dx + y * dy,
    discriminant = dot * dot - length * distance;
  if (discriminant < 0) return null;
  const time = (-dot - Math.sqrt(discriminant)) / length;
  return time >= 0 && time <= 1 ? time : null;
}

export function contactEncounter(scene, state, from = state) {
  let result = null,
    first = Infinity;
  for (const encounter of scene.objects) {
    if (!hasContactBoundary(encounter, state)) continue;
    const time = contactTime(encounter, from, state);
    if (time !== null && time < first) {
      first = time;
      result = encounter;
    }
  }
  return result;
}
