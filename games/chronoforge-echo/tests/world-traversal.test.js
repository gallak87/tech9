import test from 'node:test';
import assert from 'node:assert/strict';
import { WorldTraversal } from '../src/world-traversal.js';
import { WorldTravelPreview } from '../src/dev-world-travel.js';
import { createState, recruit } from '../src/progression.js';
import { getScene, isWalkable, nearby, REGIONS } from '../src/world.js';

const openScene = () => ({
  id: 'open',
  width: 1800,
  height: 1200,
  objects: [],
  roads: [],
});
function fixture(scene = openScene()) {
  const state = createState();
  if (scene) Object.assign(state, { x: 240, y: 240 });
  recruit(state, 'vex');
  recruit(state, 'rune');
  const notices = [],
    sounds = [],
    logs = [];
  const game = {
    state,
    mode: 'world',
    camera: { x: 0, y: 0 },
    keys: new Set(),
    followPath: [],
    followers: [],
    movePath: [],
    transition: null,
    ui: { panel: null },
    get scene() {
      return scene || getScene(this.state.region);
    },
    rewards(items) {
      notices.push(...items);
    },
    audio: {
      sound(name) {
        sounds.push(name);
      },
    },
    log(type, data) {
      logs.push({ type, ...data });
    },
    finishRecruitment() {
      delete this.state.recruitmentWalk;
    },
  };
  const traversal = new WorldTraversal(game);
  game.travel = (...args) => traversal.travel(...args);
  traversal.resetFollowers();
  return { game, traversal, notices, sounds, logs };
}

test('walk/run speed is direction-independent and keyboard input cancels a click route', () => {
  for (const running of [false, true]) {
    for (const keys of [['d'], ['d', 's']]) {
      const { game, traversal } = fixture();
      game.keys = new Set([...keys, ...(running ? ['Shift'] : [])]);
      game.movePath = [{ x: 100, y: 100 }];
      traversal.move(0.05);
      assert.ok(
        Math.abs(
          Math.hypot(game.state.x - 240, game.state.y - 240) -
            (running ? 490 : 330) * 0.05,
        ) < 1e-10,
      );
      assert.deepEqual(game.movePath, []);
      assert.equal(game.moving, true);
      assert.equal(game.state.visited.open, true);
    }
  }
});

test('rebinding movement and sliding beside a solid both retain grounded collision', () => {
  const scene = openScene();
  scene.objects.push({ x: 280, y: 330, w: 50, h: 180, solid: true });
  const { game, traversal } = fixture(scene);
  game.state.x = 248;
  game.state.settings.keys = { right: 'l', down: 'j' };
  game.keys = new Set(['l', 'j']);
  traversal.move(0.05);
  assert.equal(
    game.state.x,
    248,
    'The rightward component cannot enter the solid',
  );
  assert.ok(game.state.y > 240, 'The free component can slide along the solid');
  assert.equal(isWalkable(scene, game.state.x, game.state.y), true);
});

test('click routes detour around solids and finish at the precise reachable destination', () => {
  const scene = openScene();
  scene.objects.push({ x: 360, y: 275, w: 70, h: 110, solid: true });
  const { game, traversal } = fixture(scene);
  const target = { x: 487, y: 239 };
  traversal.walkTo(target.x, target.y);
  assert.deepEqual(game.movePath.at(-1), target);
  assert.ok(game.movePath.some((point) => Math.abs(point.y - 240) > 35));
  for (let i = 0; i < 600 && game.movePath.length; i++) {
    traversal.move(1 / 60);
    assert.equal(isWalkable(scene, game.state.x, game.state.y), true);
  }
  assert.equal(game.movePath.length, 0);
  assert.ok(Math.hypot(game.state.x - target.x, game.state.y - target.y) < 5);
});

test('blocked routes report failure without placing waypoints through a barrier', () => {
  const scene = { ...openScene(), width: 600, height: 500 };
  scene.objects.push({ x: 330, y: 505, w: 60, h: 510, solid: true });
  const { game, traversal, notices } = fixture(scene);
  traversal.walkTo(480, 240);
  assert.deepEqual(game.movePath, []);
  assert.match(notices[0].label, /route is blocked/i);
});

test('fast click movement reaches short waypoints without overshooting at low frame rates', () => {
  for (const running of [false, true]) {
    const { game, traversal } = fixture();
    if (running) game.keys.add('Shift');
    const target = { x: 253, y: 240 };
    traversal.walkTo(target.x, target.y);
    for (let i = 0; i < 20 && game.movePath.length; i++) {
      traversal.move(0.05);
      assert.ok(game.state.x <= target.x);
    }
    assert.deepEqual(game.movePath, []);
    assert.equal(game.state.x, target.x);
    assert.equal(game.state.y, target.y);
  }
});

test('running cannot skip a narrow solid between frame endpoints', () => {
  const scene = openScene();
  scene.objects.push({ x: 251, y: 270, w: 1, h: 60, solid: true });
  const { game, traversal } = fixture(scene);
  game.keys = new Set(['d', 'Shift']);
  assert.equal(isWalkable(scene, 264.5, 240), true);
  traversal.move(0.05);
  assert.equal(game.state.x, 240);
  assert.equal(game.state.y, 240);
});

test('followers compress at an arrival wall and camera honors reduced motion and scene bounds', () => {
  const scene = openScene();
  const { game, traversal } = fixture(scene);
  Object.assign(game.state, { x: 24, y: 80, facing: 'right' });
  traversal.resetFollowers();
  assert.equal(game.followers.length, 2);
  assert.ok(
    game.followers.every(
      (actor) => actor.x <= game.state.x && isWalkable(scene, actor.x, actor.y),
    ),
  );
  Object.assign(game.state, { x: 1300, y: 900 });
  traversal.updateCamera();
  assert.ok(game.camera.x > 0 && game.camera.x < 840);
  game.state.settings.reducedMotion = true;
  traversal.updateCamera();
  assert.deepEqual(game.camera, { x: 840, y: 613.8 });
  Object.assign(game.state, { x: 1790, y: 1190 });
  traversal.updateCamera();
  assert.deepEqual(game.camera, { x: 840, y: 660 });
});

test('travel swaps at the fade midpoint and reports completion exactly once in every world', () => {
  for (const destination of Object.values(REGIONS)) {
    const { game, traversal, sounds, logs } = fixture(null);
    const originalRegion = game.state.region;
    const originalPosition = { x: game.state.x, y: game.state.y };
    game.keys.add('d');
    game.movePath = [{ x: 100, y: 100 }];
    traversal.travel(destination.id);
    const transition = game.transition;
    traversal.travel('haventide');
    assert.equal(
      game.transition,
      transition,
      'A second request must not overwrite an active journey',
    );
    assert.deepEqual([...game.keys], []);
    assert.deepEqual(game.movePath, []);
    assert.equal(traversal.updateTransition(0.2), false);
    assert.equal(game.state.region, originalRegion);
    assert.deepEqual({ x: game.state.x, y: game.state.y }, originalPosition);
    assert.equal(traversal.updateTransition(0.1), false);
    assert.equal(game.state.region, destination.id);
    assert.equal(isWalkable(destination, game.state.x, game.state.y), true);
    assert.equal(game.state.visited[destination.id], true);
    assert.equal(traversal.updateTransition(0.3), true);
    assert.equal(game.transition, null);
    assert.equal(traversal.updateTransition(0.3), false);
    assert.equal(logs.length, 1);
    assert.deepEqual(sounds, ['door']);
  }
});

test('every cave mouth enters automatically on foot, running, and click routes', () => {
  for (const scene of Object.values(REGIONS)) {
    for (const entrance of scene.objects.filter((o) => o.type === 'cave')) {
      const cave = getScene(entrance.to);
      for (const input of ['walk', 'run', 'click']) {
        for (const dt of [1 / 60, 0.05]) {
          const { game, traversal, sounds } = fixture(null);
          Object.assign(game.state, {
            region: scene.id,
            ...cave.portals[0].spawn,
          });
          traversal.resetFollowers();
          const approach = () =>
            traversal.autoTravel(
              nearby(game.scene, game.state.x, game.state.y, game.state),
            );
          assert.equal(
            approach(),
            false,
            entrance.id + ' return spawn is clear',
          );
          if (input === 'click') {
            traversal.walkTo(entrance.x, entrance.y - 24);
            assert.ok(game.movePath.length, entrance.id + ' reachable mouth');
          } else
            game.keys = new Set([
              'ArrowUp',
              ...(input === 'run' ? ['Shift'] : []),
            ]);
          for (let frame = 0; frame < 120 && !game.transition; frame++) {
            traversal.move(dt);
            if (game.state.y >= entrance.y)
              assert.equal(
                approach(),
                false,
                entrance.id + ' front steps stay outside',
              );
            else approach();
          }
          assert.equal(
            game.transition?.to,
            cave.id,
            `${entrance.id} ${input} ${dt}`,
          );
          assert.equal(approach(), false, 'active travel cannot retrigger');
          assert.deepEqual(sounds, ['door']);
          assert.equal(traversal.updateTransition(0.6), true);
          assert.equal(game.state.region, cave.id);
          assert.equal(game.state.facing, 'down');
          assert.equal(
            approach(),
            false,
            'arrival does not bounce back outside',
          );
        }
      }
    }
  }
});

test('automatic entrances exclude side approaches, other buildings, and locked routes', () => {
  const { game, traversal } = fixture(null);
  const entrance = REGIONS.haventide.objects.find((o) => o.type === 'cave');
  for (const [dx, dy] of [
    [60, -24],
    [-60, -24],
    [0, 0],
    [0, 40],
    [0, -100],
  ]) {
    Object.assign(game.state, { x: entrance.x + dx, y: entrance.y + dy });
    assert.equal(traversal.autoTravel([entrance]), false);
  }
  Object.assign(game.state, { x: entrance.x, y: entrance.y - 24 });
  for (const type of ['house', 'town'])
    assert.equal(traversal.autoTravel([{ ...entrance, type }]), false);
  assert.equal(
    traversal.autoTravel([{ ...entrance, requires: 'closed_cave' }]),
    false,
  );
  const portal = {
    ...entrance,
    type: 'portal',
    requires: { tier: 4, flag: 'open_route' },
  };
  game.state.y = entrance.y;
  assert.equal(traversal.autoTravel([portal]), false);
  game.state.flags.open_route = true;
  assert.equal(traversal.autoTravel([portal]), false);
  game.state.tier = 4;
  assert.equal(traversal.autoTravel([portal]), true);
});

test('every cave arrives below its north-wall exit and leaves by walking up', () => {
  const entrances = Object.values(REGIONS).flatMap((scene) =>
    scene.objects.filter((object) => object.type === 'cave'),
  );
  assert.equal(entrances.length, 8);
  for (const entrance of entrances) {
    const cave = getScene(entrance.to),
      exit = cave.portals[0],
      entryRoom = cave.walkAreas[0];
    assert.deepEqual(entrance.spawn, cave.spawn, cave.id + ' arrival');
    assert.equal(cave.spawn.x, exit.x);
    assert.ok(cave.spawn.y > exit.y + 62, cave.id + ' clear of exit prompt');
    assert.ok(exit.y >= entryRoom.y && exit.y <= entryRoom.y + 20);
    assert.equal(isWalkable(cave, exit.x, exit.y), true);
    assert.equal(isWalkable(cave, exit.x, entryRoom.y - 1), false);
    for (const running of [false, true]) {
      for (const dt of [1 / 60, 0.05]) {
        const { game, traversal } = fixture(null);
        game.state.facing = 'up';
        traversal.travel(cave.id, entrance.spawn);
        traversal.updateTransition(0.6);
        assert.equal(game.state.facing, 'down');
        assert.ok(
          game.followers.every((actor) => isWalkable(cave, actor.x, actor.y)),
        );
        const autoExit = () =>
          traversal.autoTravel(
            nearby(cave, game.state.x, game.state.y, game.state),
          );
        assert.equal(autoExit(), false);
        game.keys = new Set(['ArrowDown', ...(running ? ['Shift'] : [])]);
        for (let frame = 0; frame < 10; frame++) {
          traversal.move(dt);
          assert.equal(autoExit(), false, cave.id + ' down stays inside');
        }
        assert.ok(game.state.y > cave.spawn.y);
        game.keys = new Set(['ArrowUp', ...(running ? ['Shift'] : [])]);
        for (let frame = 0; frame < 120 && !game.transition; frame++) {
          traversal.move(dt);
          autoExit();
        }
        assert.equal(
          game.transition?.to,
          exit.to,
          cave.id + ' up reaches exit',
        );
        traversal.updateTransition(0.6);
        assert.equal(game.state.region, exit.to);
        assert.deepEqual({ x: game.state.x, y: game.state.y }, exit.spawn);
      }
    }
  }
});

test('traversal follows a detached dev expedition and resumes using the restored state', () => {
  const { game, traversal } = fixture(null);
  const original = game.state;
  const baseline = structuredClone(original);
  const preview = new WorldTravelPreview(game);
  assert.equal(preview.jump('last_crown'), true);
  assert.equal(traversal.updateTransition(0.6), true);
  game.keys.add('d');
  traversal.move(0.05);
  assert.deepEqual(original, baseline);
  assert.equal(preview.saveSource().state, original);
  assert.equal(preview.restore(), true);
  traversal.resetFollowers();
  traversal.updateCamera(true);
  assert.equal(game.state, original);
  assert.ok(
    game.followers.every((actor) => isWalkable(game.scene, actor.x, actor.y)),
  );
});
