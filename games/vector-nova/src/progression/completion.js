import { ALL_REWARDS, REWARDS } from './catalog.js';
import { IS_DEMO } from './edition.js';
import { COURSE_IDS, MODE_UNLOCKS, courseEarned } from '../levels/access.js';

function collectedItems(profile, { full = false } = {}) {
  const claims = new Set(profile?.claims ?? []);
  const rewards = full ? ALL_REWARDS : REWARDS;
  const items = rewards.map(({ id }) => ({
    id,
    kind: 'reward',
    collected: claims.has(id),
  }));
  if (full || !IS_DEMO) {
    const access = {
      cupWins: profile?.cups ?? [],
      finishedCourses: profile?.finishedCourses ?? [],
    };
    items.push(
      ...COURSE_IDS.map((id) => ({
        id,
        kind: 'course',
        collected: courseEarned(id, access),
      })),
    );
  }
  return items;
}

// One earned collection. Course unlocks are derived, never stored as claims or
// supplied by a developer's permission to preview and start arbitrary worlds.
export function careerUnlockProgress(profile) {
  const items = collectedItems(profile);
  return {
    collected: items.filter((item) => item.collected).length,
    total: items.length,
    rewardCount: items.filter(
      (item) => item.kind === 'reward' && item.collected,
    ).length,
    courseCount: items.filter(
      (item) => item.kind === 'course' && item.collected,
    ).length,
    items,
  };
}

// Full careers can be imported into the demo without losing acknowledged
// credits, even though the demo exposes only its four-item collection.
export function hasFullCareerUnlocks(profile) {
  return (
    Array.isArray(profile?.claims) &&
    collectedItems(profile, { full: true }).every((item) => item.collected)
  );
}

export function isCareerComplete(profile) {
  return !IS_DEMO && hasFullCareerUnlocks(profile);
}

export function remainingModeUnlocks(profile) {
  const claims = new Set(profile?.claims ?? []);
  const counts = {
    race: 0,
    cup: 0,
    freestyle: 0,
    eliminator: 0,
    interceptor: 0,
    'time-trial': 0,
    practice: 0,
  };
  for (const reward of REWARDS) {
    if (claims.has(reward.id)) continue;
    const requirement = reward.requirement;
    if (requirement.points || requirement.finishes) {
      counts.race++;
      counts.cup++;
      counts.freestyle++;
      counts.eliminator++;
      counts.interceptor++;
    } else if (requirement.trials) counts['time-trial']++;
    else if (requirement.cup || requirement.cups) counts.cup++;
  }
  if (!IS_DEMO)
    for (const mode of MODE_UNLOCKS) {
      const access = {
        cupWins: profile?.cups ?? [],
        finishedCourses: profile?.finishedCourses ?? [],
      };
      if (!courseEarned(mode.levelIds[0], access)) counts.cup++;
      else
        counts[mode.mode] += mode.levelIds
          .slice(1)
          .filter((id) => !courseEarned(id, access)).length;
    }
  return counts;
}
