import { createEquipmentSystem } from '../equipment/runtime.js';
import { toughness } from '../progression/catalog.js';
import { Vector3 } from 'three';
import {
  createMagneticRuntime,
  runtimeIdentity,
} from '../core/session-runtime.js';
import { isCombatDevice, COMBAT_RULES } from './combat.js';
import { createPickupSimulation, VECTOR_PROPULSION } from './simulation.js';

// Compose devices around a circuit's actual simulation. Player and rivals use
// this same adapter. Rival renderers observe feedback without a HUD or audio graph.
export function createDeviceRuntime({
  track,
  devices,
  motion = createMagneticRuntime({ track }),
  identity,
  presentation = null,
  scenarios = {},
  combat = null,
  combatId = 'player',
}) {
  const equipment =
    combatId === 'player'
      ? createEquipmentSystem({ motion, combat, actorId: combatId })
      : null;
  const simulation = createPickupSimulation({
    trackLength: track.length,
    closed: track.closed !== false,
    devices,
  });
  const deviceScenarios = Object.fromEntries(
    devices.map((device) => [
      device.id,
      {
        label: `${device.type.toUpperCase()} · ${device.label} · parked`,
        state: {
          distance:
            device.distance -
            (device.type === 'vector' ? device.length / 2 + 12 : 30),
          lateral: device.lateral,
          speed: 0,
          heading: 0,
        },
      },
    ]),
  );
  let enabled = true;
  let pending = [];
  let disposed = false;
  let staged = null;
  const presentationObservers = new Set();
  function resetPresentation() {
    presentation?.reset();
    for (const observer of presentationObservers) observer.reset();
  }
  const supportedState = (state) => ({
    ...state,
    grounded: motion.pose(1)?.grounded !== false,
  });
  function applyDisruption(state, disruption = combat?.disruption(combatId)) {
    if (
      !disruption ||
      motion.pose(1)?.grounded === false ||
      state.speed <= disruption.speedLimit
    )
      return;
    const pose = motion.pose(1);
    if (motion.applyImpulse && pose) {
      const impulse = new Vector3(
        0,
        0,
        disruption.speedLimit - state.speed,
      ).applyQuaternion(pose.quaternion);
      motion.applyImpulse(state, impulse);
    } else state.speed = disruption.speedLimit;
  }
  function bindCombat(state) {
    if (!combat || !enabled) return;
    combat.bind(combatId, {
      state,
      pose: () => motion.pose(1),
      notify: (event) => pending.push(event),
      disrupt: (disruption) => applyDisruption(state, disruption),
      hit({ source, kind, impulse, cost }) {
        if (equipment?.absorbHit()) {
          const position = combat.pose(source)?.position?.toArray();
          pending.push({
            type: 'equipment-block',
            payload: {
              kind: 'deflector',
              source,
              ...(position ? { position } : {}),
            },
          });
          return true;
        }
        const shield = simulation.consumeShield({ source, attack: kind });
        if (shield) {
          pending.push(shield);
          return true;
        }
        motion.applyImpulse?.(
          state,
          impulse.clone().multiplyScalar(1 - toughness(state)),
        );
        state.energy = Math.max(
          0,
          state.energy - cost * (1 - toughness(state)),
        );
        state.impact = Math.max(state.impact, 0.65);
        return false;
      },
    });
  }
  function beforeEquipment(state, input, dt, before) {
    if (!equipment) return before;
    const gear = equipment.beforeStep(state, input, dt, { enabled });
    const road = before.modifiers.propulsion,
      extra = gear.modifiers.propulsion;
    before.events.push(...gear.events);
    before.modifiers = { ...before.modifiers, ...gear.modifiers };
    if (road && extra)
      before.modifiers.propulsion = {
        cruiseSpeed: Math.max(road.cruiseSpeed, extra.cruiseSpeed),
        thrust: Math.max(road.thrust, extra.thrust),
      };
    return before;
  }
  function applyEntryImpulse(events, state) {
    if (
      events.some(
        (event) =>
          event.type === 'pickup-cancel' && event.payload.reason === 'recover',
      )
    )
      combat?.resetActor(combatId);
    for (let index = events.length - 1; index >= 0; index--) {
      const entry = events[index];
      if (
        entry.type === 'pickup-activate' &&
        isCombatDevice(entry.payload.kind) &&
        combat
      ) {
        combat.request(combatId, entry);
        events.splice(index, 1);
      }
    }
    for (const event of events)
      if (event.type === 'pickup-activate' && event.payload.kind === 'vector')
        state.speed = Math.max(
          state.speed,
          Math.min(
            VECTOR_PROPULSION.cruiseSpeed,
            state.speed + event.payload.speedGain,
          ),
        );
  }
  const ownIdentity = identity ?? {
    id: `${motion.id}-devices`,
    version: 1,
    rulesId: `${JSON.stringify(runtimeIdentity(motion))}:vector65-600kph-1800:aegis6:${simulation.snapshot().layoutKey}`,
  };
  return {
    ...ownIdentity,
    ...(combat
      ? {
          rulesId:
            ownIdentity.rulesId + ':combat:' + JSON.stringify(COMBAT_RULES),
        }
      : {}),
    ...(combat && combatId === 'player'
      ? {
          advanceInteractions(dt) {
            if (!enabled) return [];
            const start = pending.length;
            combat.step(dt);
            return pending.slice(start);
          },
        }
      : {}),
    avoidance: () =>
      combat?.avoidance(combatId) ?? motion.avoidance?.() ?? null,
    scenarios: { ...motion.scenarios, ...deviceScenarios, ...scenarios },
    setEnabled(value) {
      if (enabled === Boolean(value)) return;
      enabled = Boolean(value);
      simulation.reset();
      combat?.resetActor(combatId, combatId === 'player');
      pending = [];
      resetPresentation();
    },
    ...(motion.launch
      ? { launch: (state, setup) => motion.launch(state, setup) }
      : {}),
    advance(state, input, dt) {
      if (disposed || !Number.isFinite(dt) || dt <= 0) return [];
      if (!enabled) return motion.advance(state, input, dt);
      bindCombat(state);
      const elapsed = Math.min(dt, 0.1);
      const steps = Math.ceil(elapsed * 120 - 1e-10);
      const ordered = [];
      for (let tick = 0; tick < steps; tick++) {
        const previous = supportedState(state);
        const before = beforeEquipment(
          state,
          input,
          elapsed / steps,
          simulation.beforeStep(input, elapsed / steps, previous),
        );
        applyEntryImpulse(before.events, state);
        const physics = motion.advance(
          state,
          input,
          elapsed / steps,
          before.modifiers,
        );
        applyDisruption(state);
        const after = simulation.afterStep(
          previous,
          supportedState(state),
          input,
          physics,
        );
        applyEntryImpulse(after, state);
        applyDisruption(state);
        ordered.push(...before.events, ...physics, ...after);
      }
      pending.push(...ordered);
      return ordered;
    },
    ...(typeof motion.beginAdvance === 'function' &&
    typeof motion.finishAdvance === 'function'
      ? {
          beginAdvance(state, input, dt) {
            if (disposed || !Number.isFinite(dt) || dt <= 0) return;
            if (staged) throw new Error('Device advance is already staged');
            bindCombat(state);
            const previous = supportedState(state);
            const before = beforeEquipment(
              state,
              input,
              dt,
              enabled
                ? simulation.beforeStep(input, dt, previous)
                : { events: [], modifiers: {} },
            );
            applyEntryImpulse(before.events, state);
            staged = { state, input, previous, before };
            motion.beginAdvance(state, input, dt, before.modifiers);
          },
          finishAdvance(state) {
            if (!staged) return [];
            if (state !== staged.state)
              throw new Error('Device advance state mismatch');
            const { input, previous, before } = staged;
            const physics = motion.finishAdvance(state);
            if (enabled) applyDisruption(state);
            if (physics.some((event) => event.type === 'road-recovery'))
              combat?.resetActor(combatId);
            const after = enabled
              ? simulation.afterStep(
                  previous,
                  supportedState(state),
                  input,
                  physics,
                )
              : [];
            applyEntryImpulse(after, state);
            if (enabled) applyDisruption(state);
            const ordered = [...before.events, ...physics, ...after];
            staged = null;
            pending.push(...ordered);
            return ordered;
          },
        }
      : {}),
    reset(context) {
      motion.reset(context);
      simulation.reset(context);
      equipment?.reset(context);
      combat?.resetActor(
        combatId,
        combatId === 'player' &&
          !['recover', 'manual-recover'].includes(context?.reason),
      );
      pending = [];
      staged = null;
      resetPresentation();
    },
    snapshot() {
      const movement = motion.snapshot();
      return {
        ...movement,
        ...simulation.snapshot(),
        ...(equipment ? { equipment: equipment.snapshot() } : {}),
        ...(combat && combatId === 'player'
          ? { combat: combat.snapshot() }
          : {}),
        ...(movement === null ? {} : { motion: movement }),
      };
    },
    restore(data) {
      simulation.restore(data);
      if (equipment && data.equipment) equipment.restore(data.equipment);
      if (combat && combatId === 'player') combat.restore(data.combat);
      motion.restore(data?.motion ?? null);
      pending = [];
      staged = null;
      resetPresentation();
    },
    pose: (alpha) => motion.pose(alpha),
    equipment: () => equipment?.snapshot() ?? null,
    getPresentation: () => presentation?.getPresentation?.() ?? null,
    observePresentation(observer) {
      presentationObservers.add(observer);
      return () => presentationObservers.delete(observer);
    },
    update(context) {
      motion.update(context);
      presentation?.update({
        ...context,
        enabled,
        effects: simulation.snapshot(),
        events: pending,
      });
      if (pending.length)
        for (const observer of presentationObservers) observer.events(pending);
      pending = [];
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      pending = [];
      staged = null;
      presentationObservers.clear();
      combat?.resetActor(combatId, combatId === 'player');
      presentation?.dispose();
      motion.dispose();
    },
  };
}
