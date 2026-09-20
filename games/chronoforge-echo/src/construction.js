import { build } from './progression.js';
import { onEvent } from './narrative.js';
import { townUpgradePlan } from './upgrade-cinematic.js';
import { communityStatus, restoreCommunity } from './community-restoration.js';

// Only Haventide owns the economic buildings and civilization advancement.
export function settlementWorksAvailable(state) {
  return state.region === 'haventide' || state.region === 'haventide_town';
}

// Pay and save once before presenting the regional before/after reveal.
export function performCommunityRestoration(
  game,
  region,
  projectId,
  { feedback } = {},
) {
  if (
    game.upgradeTour?.open ||
    game.devTools?.open ||
    game.mode !== 'world' ||
    game.ui.panel?.type !== 'build'
  )
    return;
  const before = structuredClone(game.state);
  const result = restoreCommunity(game.state, region, projectId);
  const report = () => (feedback ? feedback(result) : game.ui.feedback(result));
  if (!result.ok) {
    report();
    return result;
  }
  game.checkpoint();
  const plan = townUpgradePlan(before, game.state);
  if (!plan || !game.upgradeTour) {
    report();
    return result;
  }
  game.keys.clear();
  game.movePath = [];
  game.moving = false;
  game.ui.panel = null;
  game.ui.notice = '';
  game.ui.render();
  let finished = false;
  const finish = () => {
    if (finished) return;
    finished = true;
    game.keys.clear();
    game.ui.showBuild();
    report();
    const status = communityStatus(game.state, region);
    const next = status?.projects.find((project) => !project.complete);
    game.ui.restoreShopRow(next ? 'community-restore:' + next.id : 'close');
  };
  try {
    game.upgradeTour.openUpgrade(plan, finish);
  } catch (error) {
    game.upgradeTour.close();
    game.log('upgrade_reveal_error', { message: error.message });
    finish();
  }
  return result;
}

// This is the settlement button's real transaction. The cinematic never
// charges resources, changes progression, or rolls back a completed upgrade.
export function performBuild(game, id) {
  if (
    !settlementWorksAvailable(game.state) ||
    game.upgradeTour?.open ||
    game.devTools?.open ||
    game.mode !== 'world' ||
    game.ui.panel?.type !== 'build'
  )
    return;
  const before = id === 'town_center' ? structuredClone(game.state) : null;
  const result = build(game.state, id);
  if (!result.ok) {
    game.ui.feedback(result);
    return result;
  }
  const story = onEvent(game.state, 'build', id);
  game.checkpoint();
  const plan = before && townUpgradePlan(before, game.state);
  if (plan && game.upgradeTour) {
    game.keys.clear();
    game.movePath = [];
    game.moving = false;
    game.ui.panel = null;
    game.ui.notice = '';
    game.ui.render();
    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      game.keys.clear();
      game.ui.showBuild();
      game.ui.feedback(result);
      game.resolveResult(story);
      game.ui.restoreShopRow('build:town_center');
    };
    try {
      game.upgradeTour.openUpgrade(plan, finish);
    } catch (error) {
      // A presentation failure cannot strand a paid, checkpointed upgrade.
      game.upgradeTour.close();
      game.log('upgrade_reveal_error', { message: error.message });
      finish();
    }
  } else {
    game.ui.feedback(result);
    game.resolveResult(story);
  }
  return result;
}
