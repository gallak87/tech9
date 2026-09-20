import test from 'node:test';
import assert from 'node:assert/strict';
import { createState, recruit } from '../src/progression.js';
import {
  COMMUNITY_DEFINITIONS,
  restoreCommunity,
} from '../src/community-restoration.js';
import { getScene, isWalkable, nearby, terrainAt } from '../src/world.js';
import { townCenterBounds } from '../src/town-center-art.js';
import { townInteriorFrame } from '../src/town-interior-art.js';
import { havenInteriorBounds } from '../src/haventide-interior-renderer.js';
import { questList, mainObjective } from '../src/narrative.js';

test('regional exteriors and halls use only their own restoration level', () => {
  const state = createState();
  state.buildings.town_center = 4;
  for (const community of COMMUNITY_DEFINITIONS) {
    const entrance = getScene(community.id).objects.find(
      (o) => o.type === 'town',
    );
    assert.equal(townCenterBounds(entrance, state).frameIndex, 0);
    assert.equal(
      townInteriorFrame('board', state, community.id).asset.level,
      1,
    );
    state.communities[community.id].level = 3;
    assert.equal(townCenterBounds(entrance, state).frameIndex, 2);
    assert.equal(
      townInteriorFrame('board', state, community.id).asset.level,
      3,
    );
    state.communities[community.id].level = 1;
  }
  assert.equal(townInteriorFrame('board', state).asset.level, 4);
});

test('each regional project has a dry accessible world worksite with fixed collision', () => {
  const state = createState();
  for (const community of COMMUNITY_DEFINITIONS) {
    const scene = getScene(community.id);
    const sites = scene.objects.filter((o) => o.communityProject);
    assert.deepEqual(
      sites.map((o) => o.communityProject),
      community.projects.map((p) => p.id),
    );
    const geometry = JSON.stringify(sites);
    for (const site of sites) {
      assert.notEqual(terrainAt(scene, site.x, site.y), 'water', site.id);
      const x = site.x,
        y = site.y + 40;
      assert.ok(isWalkable(scene, x, y, state), site.id + ' clear approach');
      assert.ok(
        nearby(scene, x, y, state, 70).some((o) => o.id === site.id),
        site.id + ' interactable',
      );
      for (const level of [1, 2, 3, 4]) {
        state.communities[community.id].level = level;
        const bounds = havenInteriorBounds(site, state);
        assert.ok(
          bounds && bounds.width <= 210 && bounds.height <= 255,
          site.id,
        );
      }
    }
    assert.equal(
      JSON.stringify(sites),
      geometry,
      'art stages cannot shift paths or collisions',
    );
  }
});

test('community journal records the earned gift and next reforge without advancing the main quest', () => {
  const state = createState();
  recruit(state, 'vex');
  recruit(state, 'rune');
  state.resources = { food: 9999, ore: 9999, energy: 9999, renown: 0 };
  state.heroes.forEach((hero) => (hero.level = 15));
  for (const community of COMMUNITY_DEFINITIONS) {
    state.region = community.id + '_town';
    state.visited[state.region] = true;
    state.flags[community.id + '_liberated'] = true;
    const main = mainObjective(state);
    let entry = questList(state).find(
      (q) => q.id === 'community_' + community.id,
    );
    assert.equal(entry.complete, false);
    assert.match(entry.objective, /0 \/ 3/);
    for (const project of community.projects)
      assert.equal(restoreCommunity(state, community.id, project.id).ok, true);
    entry = questList(state).find((q) => q.id === 'community_' + community.id);
    assert.equal(entry.complete, true);
    assert.match(entry.objective, /was awarded/);
    assert.match(entry.objective, /level 20/);
    assert.equal(entry.rewardItems[0].id, community.weaponId + '_2');
    assert.equal(mainObjective(state), main);
  }
});
