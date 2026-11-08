import { Group, Quaternion, Vector3 } from 'three';
import { createCombatPresentation } from '../pickups/combat-presentation.js';
import { createShipFeedbackPresentation } from '../pickups/ship-feedback.js';
import { createHitFeedback } from '../pickups/hit-feedback.js';
import {
  createDeviceHardware,
  deviceGeometryTrack,
} from '../pickups/hardware.js';
import { collectRoadSurfaces } from '../pickups/device-mount.js';
import { createSurfaceProjector } from '../pickups/surface-projector.js';
import { pickupQuality } from '../pickups/quality.js';
import { disposeGroup } from '../pickups/geometry.js';
import { sampleCombatDisruption } from '../pickups/combat-consequences.js';
import { sampleIonContact } from '../pickups/ion-contact.js';
import { COMBAT_RULES } from '../pickups/combat.js';

// Playback borrows production device, projectile and hull renderers. Every pose,
// effect and event time comes from the recorded native race; no attacks, jump
// rings, trajectories or braking animation are generated here.
export function createCompletionEffects({
  scene,
  track,
  road,
  run,
  settings = {},
}) {
  const readSettings = () =>
    typeof settings === 'function' ? settings() : settings;
  const surfaces = collectRoadSurfaces(road);
  const root = new Group();
  root.name = 'Career finale / production road devices';
  scene.add(root);
  const bindings = new Map();
  const actors = run.actors;
  const events = run.events.toSorted((a, b) => a.time - b.time);
  const projector = createSurfaceProjector(
    deviceGeometryTrack(track),
    surfaces,
  );
  const poses = new Map(
    actors.map(({ id, combatId }) => [
      combatId ?? id,
      { position: new Vector3(), quaternion: new Quaternion() },
    ]),
  );
  let current = null,
    previousTime = null,
    cursor = 0,
    disposed = false;
  let quality = pickupQuality(readSettings()),
    hardware = [];
  const combat = {
    view: () => current.combat,
    pose: (id) => poses.get(id) ?? null,
  };
  const combatVisual = createCombatPresentation(scene, combat, readSettings(), {
    track,
    projector,
  });
  function buildHardware() {
    for (const visual of hardware) disposeGroup(visual.group);
    hardware = createDeviceHardware({
      track,
      surfaces,
      devices: run.devices,
      quality,
    });
    for (const visual of hardware) root.add(visual.group);
  }
  function bind(models, currentSettings) {
    for (const actor of actors) {
      const model = models.get(actor.id);
      if (!model || bindings.has(actor.id)) continue;
      const hit = createHitFeedback(model.group, currentSettings);
      const feedback = createShipFeedbackPresentation(currentSettings, {
        vectorThrust: actor.id === 'hero',
      });
      const attachment = new Group();
      attachment.name = 'Career finale / recorded pickup feedback';
      const bounds = model.group.userData.bounds;
      if (actor.id !== 'hero' && bounds) {
        const size = bounds.max.map((value, axis) => value - bounds.min[axis]);
        attachment.scale.set(
          Math.max(1, size[0] / 4),
          Math.max(1, size[1] / 1.5),
          Math.max(1, size[2] / 7.3),
        );
        attachment.position.set(
          (bounds.min[0] + bounds.max[0]) / 2,
          0,
          (bounds.min[2] + bounds.max[2]) / 2,
        );
      }
      attachment.add(feedback.group);
      model.group.add(attachment);
      bindings.set(actor.id, { actor, hit, feedback, attachment });
    }
  }
  function reset() {
    cursor = 0;
    previousTime = 0;
    for (const { feedback, hit } of bindings.values()) {
      feedback.reset();
      hit.update();
    }
    for (const visual of hardware) visual.reset?.();
  }
  function feedbackAt(time, dt, batch, currentSettings) {
    for (const [id, { feedback }] of bindings) {
      const actor = current[id];
      feedback.update({
        effects: actor.effects,
        events: batch.filter((event) => event.actor === id),
        racing: true,
        driving: true,
        dt,
        speed: actor.state.speed,
        time,
        settings: currentSettings,
      });
    }
  }
  try {
    buildHardware();
  } catch (error) {
    combatVisual.dispose();
    projector.dispose();
    root.removeFromParent();
    throw error;
  }
  return {
    update(sample, { models, reducedMotion = false, camera } = {}) {
      if (disposed) return;
      current = sample;
      const currentSettings = { ...readSettings(), reducedMotion };
      const nextQuality = pickupQuality(currentSettings);
      if (nextQuality !== quality) {
        quality = nextQuality;
        buildHardware();
      }
      bind(models, currentSettings);
      if (previousTime === null || sample.time < previousTime - 1e-8) reset();
      for (const { id, combatId } of actors) {
        const pose = poses.get(combatId ?? id);
        pose.position.fromArray(sample[id].position);
        pose.quaternion.fromArray(sample[id].quaternion);
        pose.grounded = sample[id].grounded;
        pose.recovering = sample[id].recovering;
      }
      // Integrate real event ages, including skips. A held/repeated render
      // cannot re-fire an acquisition or extend a hit tail.
      let time = previousTime;
      while (
        cursor < events.length &&
        events[cursor].time <= sample.time + 1e-8
      ) {
        const at = Math.max(time, events[cursor].time),
          batch = [];
        while (cursor < events.length && events[cursor].time <= at + 1e-8)
          batch.push(events[cursor++]);
        feedbackAt(at, at - time, batch, currentSettings);
        for (const event of batch)
          if (event.type === 'pickup-activate')
            hardware
              .find((visual) => visual.device.id === event.payload?.deviceId)
              ?.activate?.(event.time);
        time = at;
      }
      feedbackAt(
        sample.time,
        Math.max(0, sample.time - time),
        [],
        currentSettings,
      );
      previousTime = sample.time;
      combatVisual.update({
        mode: 'racing',
        enabled: true,
        settings: currentSettings,
      });
      for (const [id, { actor: specification, hit }] of bindings) {
        const actor = sample[id],
          combatId = specification.combatId ?? id;
        const flash = sample.combat.flashes.findLast(
          (entry) =>
            entry.target === combatId &&
            ['arc', 'repulsor', 'ion'].includes(entry.kind),
        );
        const grounded = actor.grounded !== false && !actor.recovering;
        const disruption = grounded
          ? sampleCombatDisruption(
              sample.combat.disruptions?.[combatId],
              sample.combat.time,
            )
          : null;
        const blocking =
          actor.effects.aegisRemaining > 0 ||
          sample.combat.flashes.some(
            (entry) => entry.target === combatId && entry.kind === 'aegis',
          );
        const ionContact =
          grounded && !blocking
            ? sampleIonContact(
                sample.combat.wakes,
                poses.get(combatId).position,
                combatId,
                COMBAT_RULES.wakeLifetime,
                (wake) => {
                  const gap =
                    Math.abs(wake.distance - actor.state.distance) %
                    track.length;
                  return Math.min(gap, track.length - gap) <= 45;
                },
              )
            : 0;
        hit.update(
          flash?.age,
          currentSettings,
          disruption?.kind ?? flash?.kind ?? 'ion',
          {
            equipment: flash?.equipment,
            disruptionEquipment: disruption?.equipment,
            disruption: disruption?.strength ?? 0,
            ionContact,
            time: sample.combat.time,
          },
        );
      }
      const hero = sample.hero;
      for (const visual of hardware) {
        visual.updateMotion?.();
        visual.updateCamera?.(camera, poses.get('player').position);
        const lap = Math.floor(hero.state.distance / track.length);
        visual.setAvailable(
          (hero.effects.used?.[visual.device.id] ?? -Infinity) < lap ||
            (visual.device.type === 'vector' &&
              hero.effects.vectorActive &&
              hero.effects.vectorDevice === visual.device.id),
        );
        visual.update({ time: sample.time, reducedMotion, running: true });
      }
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const { hit, feedback, attachment } of bindings.values()) {
        hit.dispose();
        feedback.dispose();
        attachment.removeFromParent();
      }
      bindings.clear();
      for (const visual of hardware) disposeGroup(visual.group);
      hardware = [];
      combatVisual.dispose();
      projector.dispose();
      root.removeFromParent();
    },
  };
}
