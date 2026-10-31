import { IS_DEMO, fullCupWins } from './edition.js';
import { REWARDS, ENHANCEMENTS, requirementText } from './catalog.js';
import { rewardProgress } from './profile.js';
import { rewardIcon, escapeHTML } from './view.js';

const undiscovered = (reward) =>
  reward.kind === 'ship'
    ? 'New ship'
    : reward.kind === 'equipment'
      ? 'New equipment'
      : reward.name;
const category = (reward) =>
  reward.kind === 'enhancement'
    ? 'Stat'
    : reward.kind === 'ship'
      ? 'Ship'
      : reward.kind === 'equipment'
        ? reward.equipment === 'lance'
          ? 'Weapon'
          : 'Equipment'
        : 'Exotic';
const unit = (requirement) =>
  requirement.points
    ? 'progress'
    : requirement.finishes
      ? requirement.finishes === 1
        ? 'finish'
        : 'finishes'
      : requirement.trials
        ? 'maps'
        : requirement.cups
          ? 'cups'
          : 'cup';
const goal = (reward, detail) => ({
  id: reward.id,
  title: undiscovered(reward),
  icon: reward.id,
  category: category(reward),
  label:
    reward.kind === 'ship'
      ? 'New hull'
      : reward.name
          .replace('Top speed', 'Speed')
          .replace('Boost duration', 'Boost'),
  rarity: reward.rarity,
  requirement: reward.requirement,
  benefit:
    reward.kind === 'enhancement'
      ? `+${Math.round(ENHANCEMENTS.find((stat) => stat.id === reward.stat).gains[reward.rank] * 100)}% total`
      : '',
  detail,
});

export function rewardGoals(profile, { mode = 'race', trackId, cupId } = {}) {
  if (mode === 'practice') return [];
  const remaining = REWARDS.filter(
    (reward) => !profile.claims.includes(reward.id),
  );
  if (mode === 'time-trial') {
    const reward = remaining.find((entry) => entry.requirement.trials);
    if (!reward) return [];
    const counted = profile.trialTracks.includes(trackId);
    const waiting = profile.trialTracks.length >= reward.requirement.trials;
    const prerequisite =
      reward.requirement.after &&
      !profile.claims.includes(reward.requirement.after);
    const detail =
      waiting && prerequisite
        ? 'Records ready · Earn Boost Duration I in races'
        : counted
          ? 'Record counted here · Try another map'
          : `Set a clean record here${prerequisite ? ' · Race upgrade required' : ''}`;
    return [goal(reward, detail)];
  }
  const ordinary = remaining
    .filter(
      (reward) => reward.requirement.points || reward.requirement.finishes,
    )
    .sort((a, b) => {
      if (a.requirement.finishes && b.requirement.finishes)
        return a.requirement.finishes - b.requirement.finishes;
      if (a.requirement.finishes) return -1;
      if (b.requirement.finishes) return 1;
      return a.requirement.points - b.requirement.points;
    });
  const first = ordinary[0];
  const equipment = ordinary.find((reward) => reward.kind === 'equipment');
  const second = first?.requirement.finishes
    ? ordinary[1]
    : equipment && equipment !== first
      ? equipment
      : ordinary[1];
  const raceGoals = [first, second]
    .filter(Boolean)
    .map((reward) =>
      goal(
        reward,
        reward.requirement.finishes
          ? reward.requirement.finishes === 1
            ? 'Complete your first valid race'
            : `Complete ${reward.requirement.finishes} valid races · Every placing counts`
          : reward.requirement.points <= profile.points
            ? 'Complete a valid finish to claim'
            : `Every valid finish · ${reward.requirement.points - profile.points} progress to go`,
      ),
    );
  if (mode !== 'cup') return raceGoals;
  const cupRewards = remaining.filter(
    (reward) => reward.requirement.cup === cupId,
  );
  const cupGoal = cupRewards.length
    ? {
        ...goal(cupRewards[0], requirementText({ cup: cupId })),
        id: `cup-${cupId}`,
        ...(cupRewards.length > 1
          ? {
              category: 'Cup',
              label: 'Ship + equipment',
              title: 'New ship + equipment',
            }
          : {}),
      }
    : null;
  const exotic = remaining.find((reward) => reward.requirement.cups);
  const finalCup =
    exotic && !profile.cups.includes(cupId) && fullCupWins(profile) === 3
      ? goal(exotic, 'Win your final championship · Four equipment slots')
      : null;
  return [cupGoal, finalCup, ...raceGoals].filter(Boolean).slice(0, 2);
}

export function rewardBadgesView(
  goals,
  profile,
  { before = null, results = false } = {},
) {
  if (!goals.length) return '';
  return `<section class="reward-badges${results ? ' reward-badges-results' : ' reward-badges-compact'}" aria-label="${results ? 'Reward progress' : 'Next rewards'}"><span class="reward-badges-label">${results ? 'Reward progress' : 'Next rewards'}</span><div class="reward-badges-list">${goals
    .map((entry) => {
      if (!results)
        return `<div class="reward-chip-wrap rarity-${entry.rarity}" data-reward-goal="${entry.id}"><button type="button" class="reward-badge reward-chip" data-reward-info="${entry.id}" aria-expanded="false" aria-describedby="reward-detail-${entry.id}">${rewardIcon(entry.icon)}<span><small>${escapeHTML(entry.category)}:</small> ${escapeHTML(entry.label)}</span></button><div class="reward-tooltip" id="reward-detail-${entry.id}" role="tooltip" hidden><strong>${escapeHTML(entry.title)}${entry.benefit ? ` · ${entry.benefit}` : ''}</strong></div></div>`;
      const [current, total] = rewardProgress(profile, entry.requirement);
      const previous = before
        ? rewardProgress(before, entry.requirement)[0]
        : current;
      const ready = entry.requirement.cup
        ? profile.cups.includes(entry.requirement.cup)
        : profile.claims.includes(entry.id);
      const detail = ready
        ? 'Unlocked'
        : entry.requirement.points
          ? `${total - current} progress to go`
          : entry.detail;
      return `<article class="reward-badge rarity-${entry.rarity}" data-reward-goal="${entry.id}"><span class="reward-badge-emblem">${rewardIcon(entry.icon)}</span><div class="reward-badge-copy"><strong>${escapeHTML(entry.title)}${entry.benefit ? `<span class="reward-badge-gain">${entry.benefit}</span>` : ''}</strong><small>${escapeHTML(detail)}</small><div class="reward-badge-progress"><span class="reward-badge-meter" role="progressbar" aria-label="${escapeHTML(entry.title)}" aria-valuemin="0" aria-valuemax="${total}" aria-valuenow="${current}"><i style="--from:${(previous / total) * 100}%;--to:${(current / total) * 100}%"></i></span><span>${before && current !== previous ? `${previous} → ` : ''}${current}/${total} ${unit(entry.requirement)}</span></div></div></article>`;
    })
    .join('')}</div></section>`;
}

export function raceProgressView(before, after, context, result) {
  if (!before || context.mode === 'practice') return '';
  const points = after.points - before.points;
  const maps = after.trialTracks.length - before.trialTracks.length;
  const goals = rewardGoals(before, context);
  if (!goals.length && !points && !maps) return '';
  const player = result?.standings?.find((row) => row.id === 'player');
  const valid =
    context.mode === 'time-trial'
      ? result?.playerValid
      : player?.valid && player?.finished;
  const finishes = after.finishes - before.finishes;
  const label =
    IS_DEMO && finishes
      ? '+1 race finish'
      : points
        ? `+${points} race progress`
        : maps
          ? 'New Time Trial map recorded'
          : valid
            ? 'Progress saved'
            : 'No progress · A valid finish is required';
  const description =
    IS_DEMO && points
      ? 'Every valid finish counts toward demo rewards, at any placing. Export your career to carry it into the full game.'
      : points
        ? `${player?.position ? `P${player.position} · ` : ''}Every valid finish counts. Wins +5 · 2nd +4 · 3rd +3 · 4th–5th +2 · 6th–10th +1`
        : context.mode === 'time-trial'
          ? 'Each distinct map counts once toward your boost rewards.'
          : valid
            ? 'This result has already been counted. Improve your cup placing to earn the difference.'
            : 'Retry for a classified finish.';
  return `<section class="race-reward-progress"><h3>${escapeHTML(label)}</h3><p>${escapeHTML(description)}</p>${rewardBadgesView(goals, after, { before, results: true })}</section>`;
}
