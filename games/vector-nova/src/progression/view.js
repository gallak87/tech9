import { IS_DEMO, fullCupWins } from './edition.js';
import { assetURL } from '../assets/url.js';
import { SHIPS } from '../ships/catalog.js';
import {
  ENHANCEMENTS,
  enhancementRanks,
  upgradedHandling,
  REWARDS,
  RARITIES,
  EQUIPMENT,
  requirementText,
} from './catalog.js';
import { rewardProgress, shipUnlocked, equippedItems } from './profile.js';
export const escapeHTML = (value) =>
  String(value).replace(
    /[&<>"']/g,
    (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[
        c
      ],
  );
const paths = {
  speed: 'm4 17 8-10 8 10M7 17l5-6 5 6',
  acceleration: 'm5 17 7-5-7-5m8 10 7-5-7-5',
  handling: 'M5 18v-5a6 6 0 0 1 6-6h7m-4-4 4 4-4 4',
  braking: 'M5 5v14m14-14v14M8 8l4 4-4 4m8-8-4 4 4 4',
  boost: 'm13 3-8 11h6l-1 7 9-12h-6z',
  toughness: 'm12 3 8 4v5c0 5-8 9-8 9s-8-4-8-9V7zM8 12l3 3 5-6',
  jump: 'M4 19h16M7 11l5-7 5 7m-5-7v12',
  shield: 'm12 3 8 4v5c0 5-8 9-8 9s-8-4-8-9V7z',
  slipstream: 'M3 6h10l-3 4h11M3 18h10l-3-4h11',
  stabilizer: 'M3 12h18M12 3v18M5 5l4 4m10-4-4 4M5 19l4-4m10 4-4-4',
  equipment: 'M8 3h8l5 9-5 9H8l-5-9zM8 12h8m-4-4v8',
  lance: 'm5 19 14-14m-9 1 9-1-1 9M3 14l7 7',
  ship: 'm12 3 8 17-8-4-8 4z',
  exotic: 'm12 2 3 7 7 3-7 3-3 7-3-7-7-3 7-3z',
};
export function rewardIcon(id, className = '') {
  if (REWARDS.some((reward) => reward.id === id))
    return `<img class="reward-icon reward-art ${className}" src="${assetURL(`assets/rewards/icons-v2/${id}.png`)}" width="128" height="128" alt="" aria-hidden="true" decoding="async">`;
  return `<svg class="reward-icon ${className}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${paths[id] ?? paths.exotic}"/></svg>`;
}
const statValue = (handling, id) =>
  ({
    speed: handling.cruiseSpeed * 3.6,
    acceleration: handling.thrust,
    handling: handling.turn,
    braking: handling.braking,
    boost: 100 / handling.boostDrain,
    toughness: 0,
  })[id];
export function performanceView(ship, profile, { stock = false } = {}) {
  const ranks = stock ? {} : enhancementRanks(profile);
  const effective = upgradedHandling(ship.handling, ranks);
  return `<div class="performance-grid" aria-label="Ship performance">${ENHANCEMENTS.map(
    (stat) => {
      const rank = ranks[stat.id] ?? 0;
      const gain = stat.gains[rank];
      const base =
        stat.id === 'toughness' ? 0 : statValue(ship.handling, stat.id);
      const maximum =
        stat.id === 'toughness'
          ? 100
          : Math.max(...SHIPS.map((s) => statValue(s.handling, stat.id))) *
            (1 + stat.gains[3]);
      const value =
        stat.id === 'toughness' ? gain * 100 : statValue(effective, stat.id);
      const display = (v) =>
        ['handling', 'braking'].includes(stat.id)
          ? ((v / maximum) * 10).toFixed(1)
          : ['speed', 'toughness'].includes(stat.id)
            ? Math.round(v)
            : v.toFixed(1);
      const baseWidth = (base / maximum) * 100;
      const label = `${stat.name}: ${display(value)} ${stat.unit}${rank ? `; ${Math.round(gain * 100)}% earned improvement` : '; stock'}`;
      return `<div class="performance-stat" data-stat="${stat.id}"><div class="performance-label"><span>${stat.name}</span><b>${display(base)}${rank ? `<em> +${display(value - base)}</em>` : ''} <small>${stat.unit}</small></b></div><div class="enhancement-meter" role="meter" aria-label="${label}" aria-valuemin="0" aria-valuemax="${maximum}" aria-valuenow="${value}" aria-valuetext="${label}"><span class="stat-base" style="width:${baseWidth}%"></span>${Array.from({ length: rank }, (_, i) => `<span class="stat-notch" style="width:${stat.id === 'toughness' ? (stat.gains[i + 1] - stat.gains[i]) * 100 : (base / maximum) * (stat.gains[i + 1] - stat.gains[i]) * 100}%" title="${stat.name} ${i + 1}"></span>`).join('')}</div></div>`;
    },
  ).join('')}</div>`;
}
export function loadoutSummary(profile, shipId) {
  const slots = equippedItems(profile, shipId);
  return (
    slots
      .filter(Boolean)
      .map((id) => EQUIPMENT.find((item) => item.id === id)?.name)
      .join(' + ') || 'Choose your equipment'
  );
}
export function rewardsView(rewards, { heading = 'Earned this run' } = {}) {
  if (!rewards?.length) return '';
  return `<section class="earned-rewards" aria-label="${heading}"><h3>${heading}</h3><div>${rewards.map((reward) => `<article class="earned-reward rarity-${reward.rarity}">${rewardIcon(reward.id)}<span><small>${RARITIES[reward.rarity]}</small><strong>${reward.name}</strong><p>${reward.description}</p></span></article>`).join('')}</div></section>`;
}
export function careerView(profile) {
  return `<div class="career-summary"><strong>${REWARDS.filter((reward) => profile.claims.includes(reward.id)).length}<small> / ${REWARDS.length} rewards</small></strong>${IS_DEMO ? '' : `<span>${profile.points} race progress</span>`}<span>${profile.finishes} finishes · ${profile.wins} wins</span><span>${IS_DEMO ? Number(profile.cups.includes('demo')) : fullCupWins(profile)} / ${IS_DEMO ? 1 : 4} cup wins</span><span>${Math.min(profile.trialTracks.length, IS_DEMO ? 1 : 2)} / ${IS_DEMO ? 1 : 2} Time Trial maps</span></div><p class="career-intro">${IS_DEMO ? 'Four rewards to earn: finish races, win the Demo Cup and set a clean Time Trial record. Equip two items. Export your save here, then import it in the full game to keep your rewards, trophy and records. Full-game upgrades stay saved while you play the demo.' : 'Permanent enhancements improve every ship. Every valid Quick Race or cup-race finish earns progress: 1st +5, 2nd +4, 3rd +3, 4th–5th +2, 6th–10th +1. Win championships and set clean Time Trial records on two different maps to complete your collection.'}</p><div class="reward-roadmap">${REWARDS.map(
    (reward) => {
      const owned = profile.claims.includes(reward.id),
        [progress, total] = rewardProgress(profile, reward.requirement);
      return `<article class="reward-milestone rarity-${reward.rarity} ${owned ? 'earned' : ''}">${rewardIcon(reward.id)}<div><strong>${reward.name}</strong><p>${reward.description}</p><small>${owned ? '✓ Earned' : `${requirementText(reward.requirement)} · ${progress}/${total}`}</small></div></article>`;
    },
  ).join('')}</div>`;
}
export function shipLockText(profile, id) {
  if (shipUnlocked(profile, id)) return '';
  return requirementText(
    REWARDS.find((reward) => reward.ship === id).requirement,
  );
}
