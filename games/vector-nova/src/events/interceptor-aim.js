import * as T from 'three';
import { COMBAT_RULES } from '../pickups/combat.js';
import { LANCE_SPEED, LANCE_LIFETIME } from '../pickups/rules.js';

// Predict the receiving road station, never the pilot's lateral response.
// Each real projectile freezes this pose at discharge and then flies straight.
function aimFrozenLane(
  { track, bossPose, muzzle, player, aimLane, sourceSpeed = 0 },
  projectileSpeed,
  lifetime,
) {
  if (
    ![
      player?.distance,
      player?.speed,
      aimLane,
      sourceSpeed,
      ...(muzzle ?? []),
    ].every(Number.isFinite) ||
    muzzle?.length !== 3
  )
    throw new Error('Invalid Wraith firing solution');
  const position = new T.Vector3()
    .fromArray(muzzle)
    .applyQuaternion(bossPose.quaternion)
    .add(bossPose.position);
  const speed = projectileSpeed + Math.max(0, sourceSpeed);
  const destination = new T.Vector3();
  let flightTime = Math.min(
    lifetime,
    position.distanceTo(track.sample(player.distance).position) / speed,
  );
  let receiveDistance, frame;
  const receive = () => {
    receiveDistance = player.distance + Math.max(0, player.speed) * flightTime;
    frame = track.sample(receiveDistance);
    destination
      .copy(frame.position)
      .addScaledVector(frame.right, aimLane)
      .addScaledVector(frame.up, 1.8);
  };
  for (let i = 0; i < 5; i++) {
    receive();
    flightTime = Math.min(lifetime, position.distanceTo(destination) / speed);
  }
  receive();
  const direction = destination.clone().sub(position).normalize();
  const quaternion = new T.Quaternion().setFromRotationMatrix(
    new T.Matrix4().lookAt(
      new T.Vector3(),
      direction.clone().negate(),
      frame.up,
    ),
  );
  return { position, quaternion, destination, receiveDistance, flightTime };
}

export const aimWraithScissors = (options) =>
  aimFrozenLane(options, COMBAT_RULES.arcSpeed, COMBAT_RULES.arcLifetime);
export const aimBulwarkSlab = (options) =>
  aimFrozenLane(options, LANCE_SPEED, LANCE_LIFETIME);
