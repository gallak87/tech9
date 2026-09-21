import { isWalkable, meetsWorldRequirement } from './world-geometry.js';

const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const hash = (id) =>
  [...id].reduce((n, c) => (Math.imul(n, 31) + c.charCodeAt(0)) >>> 0, 7);

// Keep the ground cue clear of solids, not just its center point.
export function patrolPointClear(scene, point, encounter) {
  for (const [dx, dy] of [
    [0, 0],
    [-20, 0],
    [20, 0],
    [0, -12],
    [0, 12],
  ])
    if (!isWalkable(scene, point.x + dx, point.y + dy)) return false;
  for (const object of [...scene.objects, ...scene.portals]) {
    if (object.id === encounter.id) continue;
    if (object.type === 'encounter' && distance(point, object) < 105)
      return false;
    if (
      ['portal', 'cave', 'house', 'camp'].includes(object.type) &&
      distance(point, object) < 125
    )
      return false;
    if (
      object.type === 'town' &&
      !encounter.guard &&
      distance(point, object) < 180
    )
      return false;
    if (
      ['npc', 'console', 'pickup'].includes(object.type) &&
      distance(point, object) < 70
    )
      return false;
  }
  return distance(point, scene.spawn) >= 130;
}

export function patrolSegmentClear(scene, from, to, encounter) {
  const steps = Math.max(1, Math.ceil(distance(from, to) / 6));
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    if (
      !patrolPointClear(
        scene,
        { x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t },
        encounter,
      )
    )
      return false;
  }
  return true;
}

// Run after final scenery footprints. Every leg goes through home so bends never
// shortcut across a wall. Route construction stays separate from live movement.
export function configureEnemyPatrols(scene) {
  for (const encounter of scene.objects) {
    if (
      encounter.type !== 'encounter' ||
      encounter.boss ||
      encounter.flag ||
      encounter.patrol === false
    )
      continue;
    const home = { x: encounter.x, y: encounter.y };
    const guard = Boolean(encounter.guard);
    const radius = guard
      ? 64
      : scene.kind === 'cave'
        ? 100
        : encounter.id === 'hav_first'
          ? 100
          : 240;
    const angles =
      guard || scene.kind === 'cave'
        ? [0, Math.PI]
        : Array.from({ length: 8 }, (_, i) => (i * Math.PI) / 4);
    const candidates = [];
    for (const angle of angles) {
      for (let reach = radius; reach >= 36; reach -= 12) {
        const point = {
          x: home.x + Math.cos(angle) * reach,
          y: home.y + Math.sin(angle) * reach,
        };
        if (patrolSegmentClear(scene, home, point, encounter)) {
          candidates.push(point);
          break;
        }
      }
    }
    candidates.sort((a, b) => distance(b, home) - distance(a, home));
    const first = candidates[0];
    if (!first) continue;
    const second = candidates
      .slice(1)
      .sort((a, b) => distance(b, first) - distance(a, first))[0];
    encounter.patrol = {
      home,
      radius,
      speed: guard
        ? 36
        : scene.kind === 'cave'
          ? 42
          : 52 + (hash(encounter.id) % 17),
      pause: 0.9 + (hash(encounter.id) % 7) * 0.15,
      points: second ? [home, first, home, second] : [home, first],
    };
  }
}

export class EnemyPatrols {
  constructor() {
    this.expeditions = new WeakMap();
  }

  scene(authored, state) {
    let scenes = this.expeditions.get(state);
    if (!scenes) this.expeditions.set(state, (scenes = new Map()));
    let scene = scenes.get(authored);
    if (!scene) {
      scene = {
        ...authored,
        objects: authored.objects.map((object) =>
          object.type === 'encounter'
            ? {
                ...object,
                patrolMotion: object.patrol
                  ? {
                      waypoint: 1,
                      wait: (hash(object.id) % 25) / 10,
                      facing: 'left',
                      moving: false,
                      time: 0,
                      arrivalProtected: distance(object, state) < 125,
                      previous: { x: object.x, y: object.y },
                    }
                  : null,
              }
            : object,
        ),
      };
      scenes.set(authored, scene);
    }
    for (const object of scene.objects) {
      if (object.patrolMotion && state.cleared?.[object.id]) {
        Object.assign(object, object.patrol.home);
        object.patrolMotion.moving = false;
        object.patrolMotion.previous = { x: object.x, y: object.y };
      }
    }
    return scene;
  }

  update(scene, state, dt, { protected: protection = false } = {}) {
    for (const object of scene.objects) {
      const motion = object.patrolMotion;
      if (!motion) continue;
      motion.previous = { x: object.x, y: object.y };
      motion.moving = false;
      if (
        object.boss ||
        state.cleared?.[object.id] ||
        !meetsWorldRequirement(state, object.requires)
      )
        continue;
      if (motion.arrivalProtected) {
        if (distance(object, state) < 125) continue;
        motion.arrivalProtected = false;
      }
      // Invisible contact protection must not let enemies crowd the party.
      if (protection) continue;
      if (motion.wait > 0) {
        motion.wait = Math.max(0, motion.wait - dt);
        continue;
      }
      const target = object.patrol.points[motion.waypoint];
      const length = distance(object, target);
      if (length < 0.001) {
        motion.waypoint = (motion.waypoint + 1) % object.patrol.points.length;
        motion.wait = object.patrol.pause;
        continue;
      }
      const step = Math.min(object.patrol.speed * dt, length);
      const dx = (target.x - object.x) / length,
        dy = (target.y - object.y) / length;
      object.x += dx * step;
      object.y += dy * step;
      motion.facing =
        Math.abs(dx) > Math.abs(dy)
          ? dx > 0
            ? 'right'
            : 'left'
          : dy > 0
            ? 'down'
            : 'up';
      motion.moving = step > 0;
      motion.time += step / object.patrol.speed;
    }
  }

  reset() {
    this.expeditions = new WeakMap();
  }
}
