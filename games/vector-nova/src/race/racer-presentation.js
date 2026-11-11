import { Quaternion, Vector3, MathUtils } from 'three';
import { createRivalPreview } from '../ships/rivals.js';
import { createHitFeedback } from '../pickups/hit-feedback.js';
import { createRivalPickups } from './rival-pickups.js';
import { readRuntimeFrame } from '../core/session-runtime.js';

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
      entry.hitFeedback =
        combat && opponent.specification.team !== 'quarry'
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
    getShip(id) {
      return (
        ships.find(({ opponent }) => opponent.specification.id === id)?.ship ??
        null
      );
    },
    update({
      alpha = 1,
      mode = 'title',
      settings = {},
      interceptor = null,
    } = {}) {
      if (disposed) return;
      const enabled = racers.enabled;
      const showField =
        enabled &&
        (['racing', 'paused', 'countdown'].includes(mode) ||
          (mode === 'results' && !interceptor));
      const combatState = combat?.view();
      const flashes = combatState?.flashes ?? [];
      for (const { ship, opponent, yaw, roll, hitFeedback, pickups } of ships) {
        const retained = !!(
          mode === 'results' &&
          interceptor?.result &&
          opponent.specification.id === interceptor.targetId
        );
        const disabled = retained && interceptor.result.won;
        const show = (showField || retained) && !opponent.eliminated;
        ship.group.visible = show;
        const effects =
          typeof opponent.runtime.readFrame === 'function' ||
          typeof opponent.runtime.snapshot === 'function'
            ? (readRuntimeFrame(opponent.runtime) ?? {})
            : {};
        pickups.update({
          visible: show && !disabled,
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
          effects.equipment?.shield === true ||
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
        const blend = ['racing', 'results'].includes(mode)
          ? MathUtils.clamp(alpha, 0, 1)
          : 1;
        const state = opponent.state;
        const attack = interceptor?.counterattack;
        let drivePower = 1;
        if (opponent.specification.id === 'wraith' && attack?.started != null) {
          if (attack.phase !== 'idle')
            drivePower =
              1 - 0.65 * MathUtils.smoothstep(attack.elapsed, 0, 0.4);
          else {
            const releaseAge =
              interceptor.elapsed - attack.started - attack.elapsed;
            drivePower = 0.35 + 0.65 * MathUtils.smoothstep(releaseAge, 0, 0.4);
          }
        }
        ship.update?.({
          speed: MathUtils.lerp(
            opponent.prev?.speed ?? state.speed,
            state.speed,
            blend,
          ),
          boost: state.boosting,
          catapulting:
            effects.vectorActive === true ||
            effects.equipment?.slipstreamRemaining > 0,
          time: state.time,
          energy: state.energy / 100,
          quality: settings.quality,
          reducedMotion: settings.reducedMotion,
          visible: !disabled,
          drivePower,
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
