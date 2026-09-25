import { pathCenter, terrainHeight } from '../world/terrain.js';

export const MISSION_SECONDS = 150;
export const REPAIR_SECONDS = 2;
export const INTERACT_RANGE = 2.7;
export const EYE_HEIGHT = 1.7;
export const PLAYER_RADIUS = 0.34;
function station(id, label, z, offset, type) {
  const x = pathCenter(z) + offset;
  return Object.freeze({
    id,
    label,
    type,
    position: Object.freeze([x, terrainHeight(x, z), z]),
  });
}
export const RELAYS = Object.freeze([
  station('relay-1', 'Creek relay', 10, 2.6, 'sensor'),
  station('relay-2', 'Canopy relay', -11, -2.6, 'dish'),
  station('relay-3', 'Ridge relay', -34, 2.6, 'mast'),
]);
export const BASE = station('base', 'Trailhead radio', 26, -2.6, 'radio');
export const SPAWN = Object.freeze([
  pathCenter(26),
  terrainHeight(pathCenter(26), 26) + EYE_HEIGHT,
  26,
]);
export const ROUTE = Object.freeze([...RELAYS, BASE]);
export const distanceTo = (position, target) =>
  Math.hypot(
    position[0] - target.position[0],
    position[2] - target.position[2],
  );

/** Rules and active-time clock only. No rendering, DOM or input ownership. */
export class Mission {
  constructor() {
    this.reset('menu');
  }
  reset(state = 'playing', now = 0) {
    this.state = state;
    this.remainingSeconds = MISSION_SECONDS;
    this.restored = [];
    this.interactionProgress = 0;
    this.lastNow = now;
    this.elapsedSeconds = 0;
    this.pauseReason = '';
  }
  get target() {
    return ROUTE[this.restored.length] ?? null;
  }
  pause(now, reason = 'Mission paused') {
    if (this.state !== 'playing') return;
    this.tick(now, [Infinity, 0, Infinity], false);
    if (this.state !== 'playing') return;
    this.state = 'paused';
    this.pauseReason = reason;
    this.interactionProgress = 0;
  }
  resume(now) {
    if (this.state !== 'paused') return;
    this.lastNow = now;
    this.state = 'playing';
  }
  tick(now, position, interacting) {
    if (this.state !== 'playing') return null;
    const dt = Math.max(0, now - this.lastNow);
    this.lastNow = now;
    this.remainingSeconds = Math.max(0, this.remainingSeconds - dt);
    this.elapsedSeconds += dt;
    if (this.remainingSeconds <= 0) {
      this.state = 'lost';
      this.interactionProgress = 0;
      return 'lost';
    }
    if (interacting && distanceTo(position, this.target) <= INTERACT_RANGE) {
      this.interactionProgress = Math.min(
        1,
        this.interactionProgress + dt / REPAIR_SECONDS,
      );
      if (this.interactionProgress >= 1) {
        this.interactionProgress = 0;
        if (this.target.id === 'base') {
          this.state = 'won';
          return 'won';
        }
        const id = this.target.id;
        this.restored.push(id);
        return 'restored';
      }
    } else this.interactionProgress = 0;
    return null;
  }
  snapshot(position) {
    const target = this.target;
    const distance = target ? distanceTo(position, target) : 0;
    return {
      state: this.state,
      remainingSeconds: this.remainingSeconds,
      elapsedSeconds: this.elapsedSeconds,
      restored: [...this.restored],
      interactionProgress: this.interactionProgress,
      pauseReason: this.pauseReason,
      nearTarget: !!target && distance <= INTERACT_RANGE,
      target: target
        ? { ...target, position: [...target.position], distance }
        : null,
      spawn: [...SPAWN],
      base: { ...BASE, position: [...BASE.position] },
      route: RELAYS.map((point) => ({
        ...point,
        position: [...point.position],
      })),
    };
  }
}
