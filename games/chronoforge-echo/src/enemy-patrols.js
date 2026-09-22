import { isWalkable, meetsWorldRequirement } from './world-geometry.js';

const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const hash = (id) =>
  [...id].reduce((n, c) => (Math.imul(n, 31) + c.charCodeAt(0)) >>> 0, 7);

// Keep a small ground footprint clear of solids, not just the center point.
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

// Follow one authored road in both directions, keeping every bend. Sampling
// short legs stops at scenery and safe areas instead of cutting across grass.
function roadPatrol(scene, encounter, radius) {
  const home = { x: encounter.x, y: encounter.y };
  const candidates = [];
  for (const line of scene.roads || []) {
    for (let segment = 1; segment < line.length; segment++) {
      const a = line[segment - 1],
        b = line[segment];
      const length = distance(a, b);
      if (length < 0.001) continue;
      const t = Math.max(
        0,
        Math.min(
          1,
          ((home.x - a.x) * (b.x - a.x) + (home.y - a.y) * (b.y - a.y)) /
            length ** 2,
        ),
      );
      const start = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
      if (
        distance(home, start) <= 260 &&
        patrolPointClear(scene, start, encounter)
      )
        candidates.push({ line, segment, start });
    }
  }
  candidates.sort((a, b) => distance(home, a.start) - distance(home, b.start));
  for (const { line, segment, start } of candidates) {
    const trace = (direction) => {
      const points = [];
      let position = start,
        remaining = radius;
      let index = direction > 0 ? segment : segment - 1;
      while (index >= 0 && index < line.length && remaining > 0.001) {
        const target = line[index],
          length = distance(position, target);
        if (length < 0.001) {
          index += direction;
          continue;
        }
        const step = Math.min(12, length, remaining);
        const next = {
          x: position.x + ((target.x - position.x) * step) / length,
          y: position.y + ((target.y - position.y) * step) / length,
        };
        if (
          distance(home, next) > radius ||
          !patrolSegmentClear(scene, position, next, encounter)
        )
          break;
        points.push(next);
        position = next;
        remaining -= step;
      }
      return points;
    };
    const left = trace(-1),
      right = trace(1);
    if (left.length + right.length < 4) continue;
    return {
      kind: 'road',
      points: [...left.reverse(), start, ...right],
      startIndex: left.length,
      direction: right.length >= left.length ? 1 : -1,
    };
  }
  return null;
}

// Run after final scenery footprints. Guards and caves retain short local
// routes; ordinary outdoor encounters start on and follow the actual roads.
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
    const radius = guard ? 64 : scene.kind === 'cave' ? 100 : 650;
    if (!guard && !scene.interior) {
      const route = roadPatrol(scene, encounter, radius);
      if (route)
        encounter.patrol = {
          ...route,
          home,
          radius,
          speed: 52 + (hash(encounter.id) % 17),
          pause: 0.9 + (hash(encounter.id) % 7) * 0.15,
        };
      continue;
    }
    const angles = [0, Math.PI];
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
        objects: authored.objects.map((object) => {
          if (object.type !== 'encounter') return object;
          const patrol = object.patrol;
          const position = patrol?.points[patrol.startIndex || 0] || object;
          return {
            ...object,
            x: position.x,
            y: position.y,
            patrolMotion: patrol
              ? {
                  waypoint:
                    patrol.kind === 'road'
                      ? patrol.startIndex + patrol.direction
                      : 1,
                  direction: patrol.direction || 1,
                  wait: (hash(object.id) % 25) / 10,
                  facing: 'left',
                  moving: false,
                  time: 0,
                  arrivalProtected: distance(position, state) < 125,
                  previous: { x: position.x, y: position.y },
                }
              : null,
          };
        }),
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
      const patrol = object.patrol;
      let remaining = dt;
      while (remaining > 0) {
        const wait = Math.min(motion.wait, remaining);
        motion.wait -= wait;
        remaining -= wait;
        if (remaining <= 0) break;
        const target = patrol.points[motion.waypoint];
        const length = distance(object, target);
        if (length > 0.001) {
          const step = Math.min(patrol.speed * remaining, length);
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
          motion.moving = true;
          motion.time += step / patrol.speed;
          remaining = Math.max(0, remaining - step / patrol.speed);
          if (step < length) break;
        }
        if (patrol.kind === 'road') {
          if (
            motion.waypoint === 0 ||
            motion.waypoint === patrol.points.length - 1
          ) {
            motion.direction *= -1;
            motion.wait = patrol.pause;
          }
          motion.waypoint += motion.direction;
        } else {
          motion.waypoint = (motion.waypoint + 1) % patrol.points.length;
          motion.wait = patrol.pause;
        }
      }
    }
  }

  reset() {
    this.expeditions = new WeakMap();
  }
}
