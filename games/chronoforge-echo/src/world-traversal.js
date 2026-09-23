import {
  getScene,
  isWalkable,
  safeArrival,
  meetsWorldRequirement,
} from './world.js';
import { reveal } from './maps.js';
import { onEvent } from './narrative.js';
import {
  followerPosition,
  FOLLOW_PATH_STEP,
  FOLLOW_DISTANCE,
} from './follower-path.js';
import { VIEW_WIDTH, VIEW_HEIGHT } from './rendering.js';
import { clampCamera } from './viewport.js';

const PATH_STEP = 24;
const DIRECTIONS = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];
const gridKey = (point) => point.join(',');

function clearEdge(scene, from, to) {
  const samples = Math.max(
    1,
    Math.ceil(Math.hypot(to[0] - from[0], to[1] - from[1]) / 3),
  );
  for (let i = 0; i <= samples; i++) {
    const t = i / samples;
    const x = from[0] + (to[0] - from[0]) * t;
    const y = from[1] + (to[1] - from[1]) * t;
    if (!isWalkable(scene, x, y)) return false;
  }
  return true;
}

function findPath(scene, from, x, y) {
  const start = [
    Math.round(from.x / PATH_STEP),
    Math.round(from.y / PATH_STEP),
  ];
  const end = [Math.round(x / PATH_STEP), Math.round(y / PATH_STEP)];
  const open = [{ p: start, g: 0, f: 0 }];
  const seen = new Map([[gridKey(start), { g: 0, parent: null, p: start }]]);
  let found = null;
  let iterations = 0;

  while (open.length && iterations++ < 18000) {
    open.sort((a, b) => a.f - b.f);
    const node = open.shift();
    if (Math.hypot(node.p[0] - end[0], node.p[1] - end[1]) < 1.5) {
      found = node.p;
      break;
    }
    for (const [dx, dy] of DIRECTIONS) {
      const p = [node.p[0] + dx, node.p[1] + dy];
      const key = gridKey(p);
      const cost = node.g + 1;
      if (
        (seen.has(key) && seen.get(key).g <= cost) ||
        !clearEdge(
          scene,
          node.p.map((n) => n * PATH_STEP),
          p.map((n) => n * PATH_STEP),
        )
      )
        continue;
      seen.set(key, { g: cost, parent: node.p, p });
      open.push({
        p,
        g: cost,
        f: cost + Math.abs(p[0] - end[0]) + Math.abs(p[1] - end[1]),
      });
    }
  }
  if (!found) return null;

  const path = [];
  let node = seen.get(gridKey(found));
  while (node?.parent) {
    path.push({ x: node.p[0] * PATH_STEP, y: node.p[1] * PATH_STEP });
    node = seen.get(gridKey(node.parent));
  }
  path.reverse();
  // Search tolerance must not stop a reachable click short of interaction range.
  const tail = path.at(-1) || from;
  if (clearEdge(scene, [tail.x, tail.y], [x, y])) {
    path.push({ x, y });
  }
  return path;
}

// Game retains the shared transient state used by rendering, recruitment and dev
// previews. This controller owns traversal rules, never a second copy of state.
export class WorldTraversal {
  constructor(game) {
    this.game = game;
  }

  resetFollowers() {
    const g = this.game;
    const s = g.state;
    const [dx, dy] = {
      right: [-1, 0],
      left: [1, 0],
      up: [0, 1],
      down: [0, -1],
    }[s.facing] || [-1, 0];
    let point = { x: s.x, y: s.y, facing: s.facing };
    g.followPath = Array.from({ length: 160 }, (_, i) => {
      if (
        i &&
        isWalkable(
          g.scene,
          point.x + dx * FOLLOW_PATH_STEP,
          point.y + dy * FOLLOW_PATH_STEP,
        )
      ) {
        point = {
          ...point,
          x: point.x + dx * FOLLOW_PATH_STEP,
          y: point.y + dy * FOLLOW_PATH_STEP,
        };
      }
      return { ...point };
    });
    this.positionFollowers();
  }

  positionFollowers() {
    const g = this.game;
    g.followers = g.state.heroes.slice(1).map((hero, i) => ({
      id: hero.id,
      ...followerPosition(g.followPath, g.state, (i + 1) * FOLLOW_DISTANCE),
    }));
  }

  updateCamera(immediate = false) {
    const g = this.game;
    const viewport = g.viewport || { width: VIEW_WIDTH, height: VIEW_HEIGHT };
    const { x, y } = clampCamera(
      {
        x: g.state.x - viewport.width * (viewport.mobile ? 0.5 : 0.46),
        y: g.state.y - viewport.height * (viewport.mobile ? 0.57 : 0.53),
      },
      g.scene,
      viewport,
    );
    if (immediate || g.state.settings.reducedMotion) {
      g.camera.x = x;
      g.camera.y = y;
    } else {
      g.camera.x += (x - g.camera.x) * 0.14;
      g.camera.y += (y - g.camera.y) * 0.14;
    }
    // Resizing can shrink the legal range while the smoothed camera is outside.
    Object.assign(g.camera, clampCamera(g.camera, g.scene, viewport));
  }

  walkTo(x, y) {
    const g = this.game;
    const path = findPath(g.scene, g.state, x, y);
    if (path) g.movePath = path;
    else
      g.rewards([
        {
          id: 'notice',
          label: 'The route is blocked. Try a nearer point on the path.',
          amount: 1,
        },
      ]);
  }

  move(dt) {
    const g = this.game;
    const s = g.state;
    const scene = g.scene;
    const bindings = s.settings.keys || {};
    let dx =
      (g.keys.has('ArrowRight') || g.keys.has(bindings.right || 'd') ? 1 : 0) -
      (g.keys.has('ArrowLeft') || g.keys.has(bindings.left || 'a') ? 1 : 0);
    let dy =
      (g.keys.has('ArrowDown') || g.keys.has(bindings.down || 's') ? 1 : 0) -
      (g.keys.has('ArrowUp') || g.keys.has(bindings.up || 'w') ? 1 : 0);
    let waypointDistance = Infinity;
    const keyboard = Boolean(dx || dy),
      touch = g.touchControls?.movement;
    const usingTouch = !keyboard && Boolean(touch?.active);
    if (keyboard || usingTouch) {
      g.movePath = [];
      if (usingTouch) {
        dx = Number.isFinite(touch.x) ? touch.x : 0;
        dy = Number.isFinite(touch.y) ? touch.y : 0;
      }
    } else {
      while (g.movePath.length) {
        const point = g.movePath[0];
        const length = Math.hypot(point.x - s.x, point.y - s.y);
        if (length < 5) g.movePath.shift();
        else {
          dx = (point.x - s.x) / length;
          dy = (point.y - s.y) / length;
          waypointDistance = length;
          break;
        }
      }
    }

    const length = Math.hypot(dx, dy);
    const speed = (usingTouch ? touch.run : g.keys.has('Shift')) ? 490 : 330;
    g.moving = length > 0;
    if (!length) return;
    dx /= length;
    dy /= length;
    const oldX = s.x;
    const oldY = s.y;
    const step = Math.min(
      speed * dt * (usingTouch ? Math.min(1, length) : 1),
      waypointDistance,
    );
    if (clearEdge(scene, [s.x, s.y], [s.x + dx * step, s.y])) s.x += dx * step;
    if (clearEdge(scene, [s.x, s.y], [s.x, s.y + dy * step])) s.y += dy * step;
    if (s.x === oldX && s.y === oldY) {
      g.movePath = [];
      return;
    }
    s.facing =
      Math.abs(dx) > Math.abs(dy)
        ? dx > 0
          ? 'right'
          : 'left'
        : dy > 0
          ? 'down'
          : 'up';
    if (!g.followPath.length)
      g.followPath.push({ x: oldX, y: oldY, facing: s.facing });
    let head = g.followPath[0];
    let distance = Math.hypot(s.x - head.x, s.y - head.y);
    while (distance >= FOLLOW_PATH_STEP) {
      head = {
        x: head.x + ((s.x - head.x) * FOLLOW_PATH_STEP) / distance,
        y: head.y + ((s.y - head.y) * FOLLOW_PATH_STEP) / distance,
        facing: s.facing,
      };
      g.followPath.unshift(head);
      distance = Math.hypot(s.x - head.x, s.y - head.y);
    }
    if (g.followPath.length > 180) g.followPath.length = 180;
    this.positionFollowers();
    reveal(s, scene);
  }

  autoTravel(near) {
    const g = this.game;
    if (g.transition) return false;
    const s = g.state;
    if (
      g.travelBlockedAt?.region === s.region &&
      Math.hypot(s.x - g.travelBlockedAt.x, s.y - g.travelBlockedAt.y) < 64
    )
      return false;
    g.travelBlockedAt = null;
    const entrance = near.find((o) => {
      if (o.type === 'portal') return Math.hypot(o.x - s.x, o.y - s.y) < 19;
      if (o.type !== 'cave') return false;
      // The mouth sits above the front-step anchor, between the solid jambs.
      return Math.abs(s.x - o.x) < 28 && s.y >= o.y - 50 && s.y <= o.y - 12;
    });
    if (!entrance || !meetsWorldRequirement(s, entrance.requires)) return false;
    this.travel(entrance.to, entrance.spawn);
    return true;
  }

  travel(to, spawn) {
    const g = this.game;
    if (g.transition) return;
    if (g.state.recruitmentWalk) g.finishRecruitment();
    const scene = getScene(to);
    const point = spawn || scene.spawn;
    const destination = safeArrival(scene, point.x, point.y);
    g.checkpoint();
    g.transition = {
      time: 0,
      duration: 0.55,
      swapped: false,
      to,
      spawn: destination,
      facing: scene.arrivalFacing || g.state.facing,
      departureSnapshot: g.saveSnapshot?.(),
    };
    g.keys.clear();
    g.touchControls?.clear();
    g.movePath = [];
    g.assetLoading?.prepareTransition(g.transition);
    g.audio.sound('door');
  }

  // Every doorway, exit and world route shares departure/arrival checkpoints.
  updateTransition(dt) {
    const g = this.game;
    const transition = g.transition;
    if (!transition) return false;
    transition.time += dt;
    if (
      transition.assetsReady === false &&
      transition.time >= transition.duration / 2
    ) {
      transition.time = transition.duration / 2;
      transition.waitTime = (transition.waitTime || 0) + dt;
      return false;
    }
    if (transition.time >= transition.duration / 2 && !transition.swapped) {
      transition.swapped = true;
      g.assetLoading?.activate(transition.to);
      g.state.region = transition.to;
      g.state.x = transition.spawn.x;
      g.state.y = transition.spawn.y;
      g.state.facing = transition.facing;
      g.encounterCooldown = 2;
      this.resetFollowers();
      this.updateCamera(true);
      reveal(g.state, g.scene);
      g.log('transition', {
        to: transition.to,
        x: transition.spawn.x,
        y: transition.spawn.y,
      });
    }
    if (transition.time < transition.duration) return false;
    g.transition = null;
    g.resolveResult(onEvent(g.state, 'visit', g.state.region));
    g.checkpoint();
    return true;
  }
}
