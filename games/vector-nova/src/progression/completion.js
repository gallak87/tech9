import { ALL_REWARDS, REWARDS } from './catalog.js';
import { IS_DEMO } from './edition.js';

export function isCareerComplete(profile) {
  if (IS_DEMO || !Array.isArray(profile?.claims)) return false;
  const claims = new Set(profile.claims);
  return ALL_REWARDS.every((reward) => claims.has(reward.id));
}

export function remainingModeUnlocks(profile) {
  const claims = new Set(profile?.claims ?? []);
  const counts = { race: 0, cup: 0, 'time-trial': 0, practice: 0 };
  for (const reward of REWARDS) {
    if (claims.has(reward.id)) continue;
    const requirement = reward.requirement;
    if (requirement.points || requirement.finishes) {
      counts.race++;
      counts.cup++;
    } else if (requirement.trials) counts['time-trial']++;
    else if (requirement.cup || requirement.cups) counts.cup++;
  }
  return counts;
}
