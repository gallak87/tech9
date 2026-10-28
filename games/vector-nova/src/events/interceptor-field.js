import { getRacerControl } from '../race/racers.js';
import { GOLIATH_HULL } from '../ships/interceptor-target-hull.js';

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
export const PURSUIT_EQUIPMENT = Object.freeze(['lance', 'injector']);
export const PURSUIT_TUNING = Object.freeze({
  lance: Object.freeze({ cooldown: 1.2, autoRepeat: true }),
});

export function createInterceptorField() {
  const half = GOLIATH_HULL.bounds.max.map(
    (value, index) => (value - GOLIATH_HULL.bounds.min[index]) / 2,
  );
  const center = GOLIATH_HULL.bounds.max.map(
    (value, index) => (value + GOLIATH_HULL.bounds.min[index]) / 2,
  );
  return {
    id: `interceptor-squad-v1:${GOLIATH_HULL.hullSha256}`,
    opponents: [
      {
        id: 'goliath',
        name: 'Goliath',
        shipId: 'bastion',
        chassisId: 'goliath',
        lane: 0,
        pace: 0.82,
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
      goliath: { distance: 120, lateral: 0 },
      rook: { distance: -12, lateral: -10 },
      kite: { distance: -24, lateral: 10 },
      manta: { distance: -36, lateral: -6 },
    },
    control({ opponent, track, devices, nearby, defaultControl }) {
      if (opponent.specification.id === 'goliath')
        return { ...defaultControl, boost: false };
      const target = nearby.find((state) => state.chassisId === 'goliath');
      if (!target) return defaultControl;
      const gap = target.distance - opponent.state.distance;
      const index = ['rook', 'kite', 'manta'].indexOf(
        opponent.specification.id,
      );
      const desiredGap = 70 + index * 25;
      const lane =
        gap > 50 && gap < 380
          ? target.lateral + opponent.specification.lane
          : opponent.specification.lane;
      const control = getRacerControl(opponent.state, track, {
        lane: clamp(lane, -12, 12),
        pace: 1,
        difficulty: 'medium',
        devices,
        nearby,
        runtime: opponent.runtime,
      });
      if (gap < desiredGap) {
        control.boost = false;
        control.throttle = Math.min(control.throttle, 0.3);
        control.brake = Math.max(
          control.brake,
          clamp((desiredGap - gap) / 70, 0, 0.5),
        );
      }
      return control;
    },
  };
}
