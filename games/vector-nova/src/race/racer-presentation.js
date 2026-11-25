import { Quaternion, Vector3, MathUtils } from 'three';
import { createRivalPreview } from '../ships/rivals.js';
import { createHitFeedback } from '../pickups/hit-feedback.js';
import { createRivalPickups } from './rival-pickups.js';
import { readRuntimeFrame } from '../core/session-runtime.js';
import { createLifetime } from '../core/lifecycle.js';
import { createRivalWake } from './rival-wake.js';

const up = new Vector3(0, 1, 0);
const forward = new Vector3(0, 0, 1);
const rivalBatchSize = 3;

// These GLBs already own their materials, geometry and textures. The race
// borrows their authored chassis rather than substituting player ship meshes.
export async function createRacerPresentation({
  racers,
  scene,
  track,
  combat = null,
  settings = {},
  loadRival = createRivalPreview,
  signal,
}) {
  const lifetime = createLifetime();
  const ships = [];
  try {
    for (
      let start = 0;
      start < racers.opponents.length;
      start += rivalBatchSize
    ) {
      signal?.throwIfAborted();
      const batch = racers.opponents.slice(start, start + rivalBatchSize);
      // Settle all started loads so a successful sibling is still released on
      // failure or cancellation. Scene attachment follows roster order.
      const loaded = await Promise.allSettled(
        batch.map(async (opponent) => ({
          opponent,
          ship: lifetime.own(
            await loadRival(opponent.specification.id, { settings, signal }),
          ),
        })),
      );
      signal?.throwIfAborted();
      const failed = loaded.find((result) => result.status === 'rejected');
      if (failed) throw failed.reason;
      for (const {
        value: { opponent, ship },
      } of loaded) {
        ship.group.name = `${opponent.specification.name} / racing`;
        ship.group.visible = false;
        scene.add(ship.group);
        lifetime.defer(() => ship.group.removeFromParent());
        const hitFeedback =
          combat && opponent.specification.team !== 'quarry'
            ? lifetime.own(createHitFeedback(ship.group, settings))
            : null;
        const pickups = lifetime.own(
          createRivalPickups(ship.group, opponent.runtime, settings),
        );
        const wake = createRivalWake(scene, ship.group, opponent.specification);
        if (wake) lifetime.own(wake);
        ships.push({
          ship,
          opponent,
          hitFeedback,
          pickups,
          wake,
          trackOrientation: new Quaternion(),
          roll: new Quaternion(),
        });
      }
    }
  } catch (error) {
    try {
      lifetime.dispose();
    } catch (cleanupError) {
      if (error instanceof Error) error.cause ??= cleanupError;
    }
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
      cameraPosition,
    } = {}) {
      if (disposed) return;
      const enabled = racers.enabled;
      const showField =
        enabled &&
        (['racing', 'paused', 'countdown'].includes(mode) ||
          (mode === 'results' && !interceptor));
      const combatState = combat?.view();
      const flashes = combatState?.flashes ?? [];
      for (const {
        ship,
        opponent,
        trackOrientation,
        roll,
        hitFeedback,
        pickups,
        wake,
      } of ships) {
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
          wake?.reset();
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
        const speed = MathUtils.lerp(
          opponent.prev?.speed ?? state.speed,
          state.speed,
          blend,
        );
        const catapulting =
          effects.vectorActive === true ||
          effects.equipment?.slipstreamRemaining > 0;
        ship.update?.({
          speed,
          boost: state.boosting,
          catapulting,
          time: state.time,
          energy: state.energy / 100,
          quality: settings.quality,
          reducedMotion: settings.reducedMotion,
          visible: !disabled,
          drivePower,
        });
        const pose = opponent.runtime.pose(blend);
        let wakeOrientation;
        if (pose) {
          ship.group.position.copy(pose.position);
          ship.group.quaternion.copy(pose.quaternion);
          if (pose.steeringBank) {
            roll.setFromAxisAngle(forward, state.steer * 0.08);
            ship.group.quaternion.multiply(roll);
          }
          wakeOrientation =
            pose.grounded === false ? ship.group.quaternion : pose.quaternion;
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
          trackOrientation
            .setFromAxisAngle(up, heading)
            .premultiply(frame.quaternion);
          roll.setFromAxisAngle(forward, state.steer * 0.08);
          ship.group.quaternion.copy(trackOrientation).multiply(roll);
          wakeOrientation = trackOrientation;
        }
        if (disabled) wake?.reset();
        else
          wake?.update({
            opponent,
            quaternion: wakeOrientation,
            recovering: pose?.recovering,
            blend,
            speed,
            boost: Number(Boolean(catapulting || state.boosting)),
            mode,
            reducedMotion: settings.reducedMotion,
            cameraPosition,
          });
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
    resetWakes() {
      for (const { wake } of ships) wake?.reset();
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      lifetime.dispose();
    },
  };
}
