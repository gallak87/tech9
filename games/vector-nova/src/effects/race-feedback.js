import { MathUtils } from 'three';
import {
  combatDisruption,
  sampleCombatDisruption,
} from '../pickups/combat-consequences.js';

const clamp = MathUtils.clamp;
const empty = () => ({
  fov: 0,
  position: [0, 0, 0],
  rotation: [0, 0, 0],
  speed: 0,
  boost: 0,
  impact: 0,
  heat: 0,
  hullHeave: 0,
  hullPitch: 0,
  hullRoll: 0,
});

// All envelopes use simulation time. A burst is a brief push and settled return,
// never accumulating camera drift or feeding a force into vehicle handling.
export function createRaceFeedback() {
  let pulses = [],
    previousTime = null,
    pressure = 0,
    grinder = null,
    disruption = null,
    last = empty();
  function reset() {
    pulses = [];
    previousTime = null;
    pressure = 0;
    grinder = null;
    disruption = null;
    last = empty();
  }
  return {
    reset,
    event({ type, payload = {}, time = 0 }) {
      if (type === 'colossus-conveyor-exit' || type === 'jump-launch') {
        grinder = null;
        pulses = pulses.filter((pulse) => !pulse.grinder);
      }
      if (['jump-transfer', 'road-recovery'].includes(type)) {
        if (payload.outcome !== 'landed') {
          reset();
          return;
        }
      }
      let strength = 0,
        duration = 0.32,
        surge = 0;
      if (type === 'impact')
        strength = 0.2 + clamp(payload.severity ?? 0.3, 0, 1) * 0.65;
      if (type === 'pickup-activate') {
        strength =
          { vector: 0.42, aegis: 0.18, arc: 0.2, repulsor: 0.26, ion: 0.22 }[
            payload.kind
          ] ?? 0;
        surge = payload.kind === 'vector' ? 1.4 : 0.4;
      }
      if (type === 'combat-fire') {
        strength = payload.kind === 'repulsor' ? 0.55 : 0.13;
        duration = payload.kind === 'repulsor' ? 0.38 : 0.18;
      }
      if (type === 'combat-hit') {
        strength = payload.shielded ? 0.32 : 0.82;
        duration = payload.shielded ? 0.32 : 0.48;
        if (!payload.shielded)
          disruption = combatDisruption(disruption, payload.kind, time, 0);
      }
      // A level-owned moving surface produces a mechanical engagement, without
      // pretending to be weapon damage or consuming a shield.
      if (type === 'colossus-conveyor-contact') {
        const intensity = clamp(payload.intensity ?? 1, 0, 1);
        grinder = { time, intensity, side: Math.sign(payload.side ?? 1) };
        strength = (payload.contact === 'engage' ? 0.43 : 0.18) * intensity;
        duration = payload.contact === 'engage' ? 0.24 : 0.16;
      }
      if (type === 'combat-confirm') {
        strength = 0.09;
        duration = 0.16;
      }
      if (type === 'combat-contact') {
        strength = payload.target === 'player' ? 0.1 : 0.045;
        duration = 0.14;
      }
      if (
        type === 'lava-contact' ||
        (type === 'helion-power' && payload.limited)
      )
        strength = 0.3;
      if (type === 'jump-transfer' && payload.outcome === 'landed')
        strength = 0.22;
      if (!strength) return;
      pulses.push({
        time,
        strength,
        duration,
        surge,
        grinder: type === 'colossus-conveyor-contact',
        side: Math.sign(payload.side ?? 0),
      });
      if (pulses.length > 8) pulses.shift();
    },
    update({
      state,
      mode,
      reducedMotion = false,
      catapulting = false,
      heat = 0,
    }) {
      const time = state.time;
      if (previousTime !== null && time < previousTime) reset();
      if (!['racing', 'paused'].includes(mode)) {
        reset();
        return last;
      }
      if (reducedMotion) {
        pulses = [];
        grinder = null;
        disruption = null;
        last = empty();
      }
      if (mode === 'paused') return last;
      const dt =
        previousTime === null
          ? 0
          : Math.min(0.1, Math.max(0, time - previousTime));
      previousTime = time;
      pulses = pulses.filter(
        (pulse) => time - pulse.time < pulse.duration && time >= pulse.time,
      );
      const target = state.boosting ? 1 : 0;
      pressure += (target - pressure) * -Math.expm1(-dt * (target ? 16 : 7));
      if (reducedMotion) {
        pulses = [];
        last = empty();
        return last;
      }
      const speed = MathUtils.smoothstep(state.speed, 35, 155);
      let kick = 0,
        sideways = 0,
        surge = 0,
        impact = 0;
      for (const pulse of pulses) {
        const age = (time - pulse.time) / pulse.duration;
        const envelope = Math.sin(Math.PI * age) * Math.exp(-age * 3);
        const recoil = Math.sin(age * Math.PI * 3) * (1 - age) ** 2;
        kick += recoil * pulse.strength;
        sideways += recoil * pulse.strength * pulse.side;
        surge += envelope * pulse.surge;
        impact += envelope * pulse.strength;
      }
      kick = clamp(kick, -0.7, 0.7);
      sideways = clamp(sideways, -0.7, 0.7);
      heat = clamp(heat, 0, 1);
      const tremor = (Math.sin(time * 21) + Math.sin(time * 33) * 0.4) * heat;
      const pressureRipple = Math.sin(time * 19) * pressure * speed;
      // Grounded grinder contacts refresh this short simulation-time envelope.
      // It dies immediately after exit/flight and never moves the physical hull.
      const grind = grinder
        ? grinder.intensity *
          (1 - MathUtils.smoothstep(time - grinder.time, 0.1, 0.23))
        : 0;
      const rattle =
        (Math.sin(time * 71) + 0.45 * Math.sin(time * 109)) * grind;
      const roll = Math.sin(time * 57) * grind * (grinder?.side ?? 1);
      const attack = sampleCombatDisruption(disruption, time);
      const damage = (attack?.strength ?? 0) * 0.7;
      const weaponRattle =
        (Math.sin(time * 49) + 0.4 * Math.sin(time * 83)) * damage;
      const weaponRoll = Math.sin(time * 31) * damage;
      last = {
        fov: speed * 4 + pressure * 4 + (catapulting ? 5 : 0) + surge,
        position: [
          sideways * 0.14 + roll * 0.025,
          kick * 0.12 + tremor * 0.014 + rattle * 0.065 + weaponRattle * 0.065,
          kick * 0.22,
        ],
        rotation: [
          kick * 0.019 +
            tremor * 0.0015 +
            rattle * 0.006 +
            weaponRattle * 0.006,
          sideways * 0.007,
          -sideways * 0.025 +
            pressureRipple * 0.0008 +
            roll * 0.009 +
            weaponRoll * 0.009,
        ],
        speed,
        boost: pressure,
        impact: clamp(impact, 0, 1),
        heat,
        hullHeave: rattle * 0.1 + weaponRattle * 0.1,
        hullPitch: rattle * 0.012 + weaponRattle * 0.012,
        hullRoll: roll * 0.022 + weaponRoll * 0.022,
      };
      return last;
    },
  };
}
