import { Quaternion, Vector3, MathUtils } from 'three';
import { createRivalPreview } from '../ships/rivals.js';
import { createHitFeedback } from '../pickups/hit-feedback.js';
import { createRivalPickups } from './rival-pickups.js';

const up = new Vector3(0, 1, 0);
const forward = new Vector3(0, 0, 1);

// These GLBs already own their materials, geometry and textures. The race
// borrows their authored chassis rather than substituting player ship meshes.
export async function createRacerPresentation({
  racers,
  scene,
  track,
  combat = null,
  settings = {},
  loadRival = createRivalPreview,
}) {
  const ships = [];
  try {
    for (const opponent of racers.opponents) {
      const ship = await loadRival(opponent.specification.id, { settings });
      ship.group.name = `${opponent.specification.name} / racing`;
      ship.group.visible = false;
      scene.add(ship.group);
      const entry = {
        ship,
        opponent,
        hitFeedback: null,
        pickups: null,
        yaw: new Quaternion(),
        roll: new Quaternion(),
      };
      ships.push(entry);
      entry.hitFeedback = combat
        ? createHitFeedback(ship.group, settings)
        : null;
      entry.pickups = createRivalPickups(
        ship.group,
        opponent.runtime,
        settings,
      );
    }
  } catch (error) {
    ships.forEach(({ ship, hitFeedback, pickups }) => {
      pickups?.dispose();
      hitFeedback?.dispose();
      ship.dispose();
    });
    throw error;
  }
  let disposed = false;
  return {
    update({ alpha = 1, mode = 'title', settings = {} } = {}) {
      if (disposed) return;
      const enabled = racers.enabled;
      const show = enabled && ['racing', 'paused', 'countdown'].includes(mode);
      const combatState = combat?.view();
      const flashes = combatState?.flashes ?? [];
      for (const { ship, opponent, yaw, roll, hitFeedback, pickups } of ships) {
        ship.group.visible = show;
        const effects = opponent.runtime.snapshot?.() ?? {};
        pickups.update({
          visible: show,
          mode,
          state: opponent.state,
          effects,
          settings,
        });
        const contact = flashes.findLast(
          (flash) =>
            flash.target === opponent.specification.id &&
            ['arc', 'repulsor', 'ion'].includes(flash.kind),
        );
        const blocking =
          effects.aegisRemaining > 0 ||
          flashes.some(
            (flash) =>
              flash.target === opponent.specification.id &&
              flash.kind === 'aegis',
          );
        if (!show) {
          ship.update?.({ quality: settings.quality, visible: false });
          hitFeedback?.update(undefined, settings);
          continue;
        }
        const blend = mode === 'racing' ? MathUtils.clamp(alpha, 0, 1) : 1;
        const state = opponent.state;
        ship.update?.({
          speed: MathUtils.lerp(
            opponent.prev?.speed ?? state.speed,
            state.speed,
            blend,
          ),
          boost: state.boosting,
          catapulting: effects.vectorActive === true,
          time: state.time,
          energy: state.energy / 100,
          quality: settings.quality,
          reducedMotion: settings.reducedMotion,
          visible: true,
        });
        const pose = opponent.runtime.pose(blend);
        if (pose) {
          ship.group.position.copy(pose.position);
          ship.group.quaternion.copy(pose.quaternion);
          if (pose.steeringBank) {
            roll.setFromAxisAngle(forward, state.steer * 0.08);
            ship.group.quaternion.multiply(roll);
          }
        } else {
          const previous = opponent.prev;
          const distance = MathUtils.lerp(
            previous.distance,
            state.distance,
            blend,
          );
          const lateral = MathUtils.lerp(
            previous.lateral,
            state.lateral,
            blend,
          );
          const heading = MathUtils.lerp(
            previous.heading,
            state.heading,
            blend,
          );
          const frame = track.sample(distance);
          ship.group.position
            .copy(frame.position)
            .addScaledVector(frame.right, lateral)
            .addScaledVector(frame.up, 0.72);
          yaw.setFromAxisAngle(up, heading);
          roll.setFromAxisAngle(forward, state.steer * 0.08);
          ship.group.quaternion
            .copy(frame.quaternion)
            .multiply(yaw)
            .multiply(roll);
        }
        const disruption = combat?.disruption?.(opponent.specification.id);
        // Hull-space interference must use this frame's rendered transform.
        hitFeedback?.update(
          contact?.age,
          settings,
          disruption?.kind ?? contact?.kind,
          {
            equipment: contact?.equipment,
            disruptionEquipment: disruption?.equipment,
            disruption: disruption?.strength ?? 0,
            ionContact: !blocking
              ? (combat?.ionContact?.(opponent.specification.id) ?? 0)
              : 0,
            time: combatState?.time,
          },
        );
      }
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      ships.forEach(({ ship, hitFeedback, pickups }) => {
        pickups.dispose();
        hitFeedback?.dispose();
        ship.dispose();
      });
    },
  };
}
