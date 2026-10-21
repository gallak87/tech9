import { COMBAT_RULES } from '../pickups/combat.js';
import { Vector3 } from 'three';
import { sampleIonContact } from '../pickups/ion-contact.js';
import {
  AEGIS_DURATION,
  AEGIS_BREAK_DURATION,
  ARC_SHOT_HEIGHT,
  ARC_MUZZLE_HEIGHT,
  ARC_TARGET_HALF_LENGTH,
  ION_WAKE_RADIUS,
} from '../pickups/rules.js';

// Leave room to read the traveling effects and the target's full silhouette.
export const PREVIEW_TARGET_DISTANCE = 27.5;

export const PICKUP_PREVIEWS = [
  { id: 'vector', label: 'Vector · catapult' },
  { id: 'aegis', label: 'Aegis · shield' },
  { id: 'aegis-hit', label: 'Aegis · absorb + break' },
  { id: 'repulsor', label: 'Repulsor · charge + pulse' },
  { id: 'arc', label: 'Arc · activate + burst' },
  { id: 'ion', label: 'Ion · incoming wake' },
];

const quaternion = [0, 0, 0, 1];
const event = (type, kind) => ({ type, payload: { kind } });
const vectorContact = 2.5;
const speed = 400 / 3.6;
const playerPosition = new Vector3();

// Samples of presentation state, never a race, collision world or vehicle
// simulation. Combat timings/speeds come directly from the game's rules.
// The ship stays on its plinth; Ion's wake travels through its local frame.
export function pickupPreviewFrame(
  kind,
  time,
  previous = -1,
  target = false,
  shielded = false,
) {
  const breakShield = kind === 'aegis-hit';
  if (breakShield) kind = 'aegis';
  const events = [];
  const effects = {};
  const combat = { time, emitters: {}, shots: [], flashes: [], wakes: [] };
  let targetShield = shielded;
  const crossed = (at) => previous < at && time >= at;
  function targetHit(at, position, confirmed = true) {
    const blocked = confirmed && targetShield;
    if (confirmed) targetShield = false;
    if (crossed(at))
      events.push({
        type: confirmed ? 'combat-confirm' : 'combat-contact',
        payload: {
          kind,
          source: 'player',
          target: 'rook',
          shielded: blocked,
          position,
        },
      });
    const age = time - at;
    if (age >= 0 && age < 0.55)
      combat.flashes.push({
        kind: blocked ? 'aegis' : kind,
        target: 'rook',
        position,
        quaternion,
        age,
        radius: 4,
      });
  }
  if (crossed(0)) events.push(event('pickup-activate', kind));
  let end = 0;
  if (kind === 'vector') {
    effects.vectorActive = time < vectorContact;
    if (crossed(vectorContact)) events.push(event('pickup-exit', kind));
    end = vectorContact;
  } else if (kind === 'aegis') {
    const finish = breakShield ? 1.5 : AEGIS_DURATION;
    effects.aegisRemaining = time < finish ? AEGIS_DURATION - time : 0;
    if (crossed(finish))
      events.push(event(breakShield ? 'shield-hit' : 'pickup-expire', kind));
    end = finish + (breakShield ? AEGIS_BREAK_DURATION : 0.5);
  } else if (kind === 'repulsor') {
    if (time < COMBAT_RULES.pulseDelay)
      combat.emitters.player = { kind, elapsed: time };
    const age = time - COMBAT_RULES.pulseDelay;
    if (age >= 0 && age < 0.55)
      combat.flashes.push({
        kind,
        position: [0, 0, 0],
        quaternion,
        age,
        radius: COMBAT_RULES.pulseRadius,
      });
    if (crossed(COMBAT_RULES.pulseDelay))
      events.push(event('combat-fire', kind), event('pickup-expire', kind));
    if (target)
      targetHit(COMBAT_RULES.pulseDelay, [0, 0, PREVIEW_TARGET_DISTANCE]);
    end = COMBAT_RULES.pulseDelay + 0.55;
  } else if (kind === 'arc') {
    let shots = 0;
    let lastHit = -Infinity;
    const hitDistance = PREVIEW_TARGET_DISTANCE - ARC_TARGET_HALF_LENGTH;
    const travelTime = target
      ? hitDistance / COMBAT_RULES.arcSpeed
      : COMBAT_RULES.arcLifetime;
    for (let index = 0; index < 3; index++) {
      const at = COMBAT_RULES.arcDelay + index * COMBAT_RULES.arcInterval;
      const age = time - at;
      if (crossed(at)) events.push(event('combat-fire', kind));
      if (age < 0) continue;
      shots++;
      if (age < 0.12)
        combat.flashes.push({
          kind,
          type: 'muzzle',
          source: 'player',
          position: [0, ARC_MUZZLE_HEIGHT, 0],
          quaternion,
          age,
          radius: 1.5,
        });
      if (age < travelTime)
        combat.shots.push({
          position: [0, ARC_SHOT_HEIGHT, age * COMBAT_RULES.arcSpeed],
          quaternion,
          age,
        });
      // Every contact gets a visual pulse; damage/confirmation still follows
      // the game's shared hit grace.
      const hitAt = at + travelTime;
      if (target) {
        const confirmed = hitAt - lastHit >= COMBAT_RULES.hitGrace;
        targetHit(hitAt, [0, ARC_SHOT_HEIGHT, hitDistance], confirmed);
        if (confirmed) lastHit = hitAt;
      }
    }
    if (shots < 3) combat.emitters.player = { kind, elapsed: time, shots };
    const last = COMBAT_RULES.arcDelay + 2 * COMBAT_RULES.arcInterval;
    if (crossed(last)) events.push(event('pickup-expire', kind));
    end = last + travelTime + (target ? 0.55 : 0);
  } else if (kind === 'ion') {
    const { wakeDuration, wakeLifetime, wakeInterval } = COMBAT_RULES;
    const origin = target ? PREVIEW_TARGET_DISTANCE : 0;
    const source = target ? 'rook' : 'player';
    const count = Math.floor(Math.min(time, wakeDuration) / wakeInterval);
    if (time < wakeDuration)
      combat.emitters[source] = {
        kind,
        elapsed: time,
        burst: 0,
        tail: [0, 0, origin - 5 - (time - count * wakeInterval) * speed],
      };
    for (let index = 1; index <= count; index++) {
      const age = time - index * wakeInterval;
      if (age >= wakeLifetime) continue;
      combat.wakes.push({
        age,
        burst: 0,
        source,
        quaternion,
        a: [0, 0, origin - 5 - (age + wakeInterval) * speed],
        b: [0, 0, origin - 5 - age * speed],
      });
    }
    if (target) {
      // First contact with the leading hull, at the real preview speed.
      // A wake burst can hit each racer only once, even after a shield breaks.
      const hitAt = Math.max(
        wakeInterval,
        (origin - 5 - ION_WAKE_RADIUS) / speed,
      );
      effects.aegisRemaining = shielded && time < hitAt ? AEGIS_DURATION : 0;
      if (crossed(hitAt)) {
        events.push({
          type: 'combat-hit',
          payload: {
            kind,
            source,
            target: 'player',
            shielded,
            position: [0, 0, ION_WAKE_RADIUS],
          },
        });
        if (shielded)
          events.push({
            type: 'shield-hit',
            payload: { kind: 'aegis', combat: true },
          });
      }
      const age = time - hitAt;
      if (age >= 0 && age < 0.55)
        combat.flashes.push({
          kind: shielded ? 'aegis' : kind,
          target: 'player',
          position: [0, 0, ION_WAKE_RADIUS],
          quaternion,
          age,
          radius: 4,
        });
    }
    if (crossed(wakeDuration)) events.push(event('pickup-expire', kind));
    end = wakeDuration + wakeLifetime;
  }
  return {
    events,
    effects,
    combat,
    end,
    ionContact:
      !effects.aegisRemaining &&
      !combat.flashes.some(
        (flash) => flash.target === 'player' && flash.kind === 'aegis',
      )
        ? sampleIonContact(
            combat.wakes,
            playerPosition,
            'player',
            COMBAT_RULES.wakeLifetime,
          )
        : 0,
    beds: {
      vector: !!effects.vectorActive,
      ion: Object.values(combat.emitters).some(
        (emitter) => emitter.kind === 'ion',
      ),
    },
  };
}
