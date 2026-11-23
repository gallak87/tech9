import { getRacerControl } from '../../src/race/racers.js';
import { vehicleHandling } from '../../src/ships/catalog.js';

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

// An input policy, never a placement/clock override. The same function is used
// by CPU scouts and the ordinary standard-pad real-time capture runner.
export function createEliminatorCaptureDriver({
  cutIndex = 0,
  boostLead = 2,
  followingGap = 14,
  followingLane = 14,
} = {}) {
  const cutAt = 22 + cutIndex * 10;
  let targetId = null;
  return ({ state, track, event, opponents, runtime = null }) => {
    const active = opponents.filter(
      (opponent) => !event.eliminated.some((cut) => cut.id === opponent.id),
    );
    const last = active.toSorted((a, b) => a.distance - b.distance)[0];
    targetId = last?.id ?? targetId;
    const target = active.find((opponent) => opponent.id === targetId) ?? last;
    const attack = event.elapsed >= cutAt - boostLead;
    const settled = event.elapsed > cutAt + 0.1;
    const edge = track.width / 2 - 5;
    const lane =
      attack && !settled && target
        ? clamp(target.lateral + (target.lateral >= 0 ? -8 : 8), -edge, edge)
        : clamp(followingLane, -edge, edge);
    let input = getRacerControl(state, track, {
      difficulty: 'hard',
      pace: 1,
      lane,
      devices: [],
      nearby: [],
      runtime,
    });
    if (!attack && target) {
      const gap = target.distance - state.distance;
      const desired = Math.max(25, target.speed + 0.8 * (gap - followingGap));
      const handling = vehicleHandling(state);
      const drag = 4.4 + 0.0018 * state.speed ** 2;
      const nominalDrag = 4.4 + 0.0018 * handling.cruiseSpeed ** 2;
      const engine = Math.max(
        1,
        handling.thrust -
          (handling.thrust - nominalDrag) *
            (Math.max(0, state.speed) / handling.cruiseSpeed) ** 2,
      );
      const acceleration = 2 * (desired - state.speed);
      const grade = 9.81 * track.sample(state.distance).tangent.y;
      input = {
        ...input,
        throttle: Math.min(
          input.throttle,
          clamp((drag + grade + acceleration) / engine, 0, 1),
        ),
        brake: Math.max(
          input.brake,
          clamp(-acceleration / handling.braking, 0, 0.85),
        ),
        boost: gap > followingGap + 20 && state.energy > 20,
      };
    } else input.boost = !settled && state.energy > 12;
    return {
      input,
      intent: {
        targetId: target?.id ?? null,
        targetDistance: target?.distance,
        gap: target ? target.distance - state.distance : null,
        cutAt,
        attack,
        settled,
        lane,
      },
    };
  };
}
