import { Quaternion, Vector3, MathUtils } from 'three';
import { createRivalPreview } from '../ships/rivals.js';
import { createHitFeedback } from '../pickups/hit-feedback.js';

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
      const ship = await loadRival(opponent.specification.id);
      ship.group.name = `${opponent.specification.name} / racing`;
      ship.group.visible = false;
      scene.add(ship.group);
      ships.push({
        ship,
        opponent,
        hitFeedback: combat ? createHitFeedback(ship.group, settings) : null,
        yaw: new Quaternion(),
        roll: new Quaternion(),
      });
    }
  } catch (error) {
    ships.forEach(({ ship, hitFeedback }) => {
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
      for (const { ship, opponent, yaw, roll, hitFeedback } of ships) {
        ship.group.visible = show;
        const contact = flashes.findLast(
          (flash) =>
            flash.target === opponent.specification.id &&
            ['arc', 'repulsor', 'ion'].includes(flash.kind),
        );
        const blocking = flashes.some(
          (flash) =>
            flash.target === opponent.specification.id &&
            flash.kind === 'aegis',
        );
        if (!show) {
          hitFeedback?.update(undefined, settings);
          continue;
        }
        const blend = mode === 'racing' ? MathUtils.clamp(alpha, 0, 1) : 1;
        const state = opponent.state;
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
        // Hull-space interference must use this frame's rendered transform.
        hitFeedback?.update(contact?.age, settings, contact?.kind, {
          ionContact: !blocking
            ? (combat?.ionContact?.(opponent.specification.id) ?? 0)
            : 0,
          time: combatState?.time,
        });
      }
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      ships.forEach(({ ship, hitFeedback }) => {
        hitFeedback?.dispose();
        ship.dispose();
      });
    },
  };
}
