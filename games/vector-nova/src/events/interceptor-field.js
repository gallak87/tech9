import { getRacerControl } from '../race/racers.js';
import { getBossHull } from '../ships/boss-hulls.js';
import { interceptorBoss } from './interceptor-bosses.js';
import { vehicleHandling } from '../ships/catalog.js';
export { PURSUIT_EQUIPMENT, PURSUIT_TUNING } from './interceptor-loadout.js';

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const smooth = (value) => {
  const t = clamp(value, 0, 1);
  return t * t * (3 - 2 * t);
};
function coursePursuitPath(track) {
  if (track?.pursuitPath == null) return null;
  const path = structuredClone(track.pursuitPath);
  let previousEnd = -Infinity;
  if (
    typeof path.id !== 'string' ||
    !path.id ||
    path.id.length > 32 ||
    !Number.isInteger(path.version) ||
    path.version < 1 ||
    !Array.isArray(path.intervals) ||
    !path.intervals.length
  )
    throw new Error('Invalid course pursuit path');
  for (const interval of path.intervals) {
    const { start, settled, release, end, lane, min, max } = interval;
    if (
      !interval.id ||
      ![start, settled, release, end, lane, min, max].every(Number.isFinite) ||
      start < 0 ||
      start < previousEnd ||
      !(start < settled && settled <= release && release < end) ||
      end > track.length ||
      min < -track.width / 2 ||
      max > track.width / 2 ||
      min + 4.5 > lane ||
      max - 4.5 < lane
    )
      throw new Error('Invalid course pursuit interval');
    previousEnd = end;
  }
  return path;
}
function pursuitIdentity(path) {
  if (!path) return '';
  // Field ids are capped at 160 characters. Fingerprint every authored value,
  // retaining the readable path id/version rather than dropping replay data.
  let hash = 2166136261;
  for (const character of JSON.stringify(path))
    hash = Math.imul(hash ^ character.charCodeAt(0), 16777619);
  return `:path-${path.id}-v${path.version}-${(hash >>> 0).toString(16).padStart(8, '0')}`;
}
function pursuitLine(path, track, state, lane) {
  if (!path) return { track, lane };
  const s =
    track.closed === false
      ? state.distance
      : ((state.distance % track.length) + track.length) % track.length;
  const interval = path.intervals.find(
    (entry) => s >= entry.start && s <= entry.end,
  );
  if (!interval) return { track, lane };
  const weight = Math.min(
    smooth((s - interval.start) / (interval.settled - interval.start)),
    1 - smooth((s - interval.release) / (interval.end - interval.release)),
  );
  const min = -track.width / 2 + (interval.min + track.width / 2) * weight;
  const max = track.width / 2 + (interval.max - track.width / 2) * weight;
  return {
    lane: lane + (interval.lane - lane) * weight,
    // Bound the ordinary driver's device/traffic lane choices too. This only
    // informs its steering calculation; physical support and colliders still
    // use the untouched production track and level runtime.
    track: {
      ...track,
      sampleSurface(distance, lateral) {
        const frame =
          track.sampleSurface?.(distance, lateral) ?? track.sample(distance);
        return {
          ...frame,
          bounds: {
            min: Math.max(frame.bounds?.min ?? -track.width / 2, min),
            max: Math.min(frame.bounds?.max ?? track.width / 2, max),
          },
        };
      },
    },
  };
}
export const INTERCEPTOR_CRUISE_KPH = 300;

// Drive to a speed through ordinary throttle/brakes. In particular, a hunter
// must brake before reaching the courier rather than waiting for a hull hit.
function matchSpeed(control, state, track, speed) {
  const handling = vehicleHandling(state);
  const drag = 4.4 + 0.0018 * state.speed * state.speed;
  const nominalDrag = 4.4 + 0.0018 * handling.cruiseSpeed ** 2;
  const engine = Math.max(
    1,
    handling.thrust -
      (handling.thrust - nominalDrag) *
        (Math.max(0, state.speed) / handling.cruiseSpeed) ** 2,
  );
  const acceleration = 2 * (speed - state.speed);
  const grade = 9.81 * track.sample(state.distance).tangent.y;
  return {
    ...control,
    boost: false,
    throttle: Math.min(
      control.throttle,
      clamp((drag + grade + acceleration) / engine, 0, 1),
    ),
    brake: Math.max(
      control.brake,
      clamp(-acceleration / handling.braking, 0, 0.85),
    ),
  };
}

export function createInterceptorField({
  track: courseTrack,
  bossId = 'goliath',
  getCounterattack = () => null,
} = {}) {
  const path = coursePursuitPath(courseTrack);
  const boss = interceptorBoss(bossId),
    hull = getBossHull(bossId);
  const cruiseSpeed = boss.cruiseKph / 3.6;
  const half = hull.bounds.max.map(
    (value, index) => (value - hull.bounds.min[index]) / 2,
  );
  const center = hull.bounds.max.map(
    (value, index) => (value + hull.bounds.min[index]) / 2,
  );
  return {
    id: `interceptor-squad-v3:${boss.id}:${boss.cruiseKph}:${hull.hullSha256}${pursuitIdentity(path)}`,
    opponents: [
      {
        id: boss.id,
        name: boss.name,
        shipId: 'bastion',
        chassisId: boss.id,
        lane: 0,
        pace: 1,
        team: 'quarry',
        version: 1,
        hitBounds: { half, center },
      },
      {
        id: 'rook',
        name: 'Rook',
        shipId: 'kestrel',
        lane: -6,
        pace: 1,
        team: 'hunters',
        version: 1,
      },
      {
        id: 'kite',
        name: 'Kite',
        shipId: 'shrike',
        lane: 6,
        pace: 1,
        team: 'hunters',
        version: 1,
      },
      {
        id: 'manta',
        name: 'Manta',
        shipId: 'bastion',
        lane: 0,
        pace: 1,
        team: 'hunters',
        version: 1,
      },
    ],
    grid: {
      player: { distance: 0, lateral: 0 },
      [boss.id]: { distance: 240, lateral: 0 },
      rook: { distance: -12, lateral: -10 },
      kite: { distance: -24, lateral: 10 },
      manta: { distance: -36, lateral: -6 },
    },
    control({ opponent, track, devices, nearby, defaultControl }) {
      if (opponent.specification.id === boss.id) {
        const phase = getCounterattack();
        const lane =
          boss.laneWeave && phase?.phase === 'firing'
            ? boss.laneWeave * Math.sin(phase.phaseElapsed * Math.PI * 0.8)
            : 0;
        const line = pursuitLine(path, track, opponent.state, lane);
        const control = getRacerControl(opponent.state, line.track, {
          lane: line.lane,
          pace: 1,
          difficulty: 'hard',
          nearby,
          runtime: opponent.runtime,
        });
        const velocity = opponent.runtime?.pose(1)?.velocity;
        const measuredSpeed = velocity?.dot(
          track.sample(opponent.state.distance).tangent,
        );
        return matchSpeed(
          control,
          Number.isFinite(measuredSpeed)
            ? { ...opponent.state, speed: Math.max(0, measuredSpeed) }
            : opponent.state,
          track,
          cruiseSpeed,
        );
      }
      const target = nearby.find((state) => state.chassisId === boss.id);
      if (!target) return defaultControl;
      const gap = target.distance - opponent.state.distance;
      const index = ['rook', 'kite', 'manta'].indexOf(
        opponent.specification.id,
      );
      const desiredGap = 100 + index * 35;
      const lane =
        gap > 50 && gap < 380
          ? target.lateral + opponent.specification.lane
          : opponent.specification.lane;
      const line = pursuitLine(
        path,
        track,
        opponent.state,
        clamp(lane, -12, 12),
      );
      const control = getRacerControl(opponent.state, line.track, {
        lane: line.lane,
        pace: 1,
        difficulty: 'medium',
        devices,
        nearby,
        runtime: opponent.runtime,
      });
      if (gap > desiredGap + 140) return control;
      const followSpeed = Math.max(
        0,
        target.speed + clamp((gap - desiredGap) * 0.45, -35, 35),
      );
      return matchSpeed(control, opponent.state, track, followSpeed);
    },
  };
}
