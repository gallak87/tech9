import { IS_DEMO, fullCupWins } from './edition.js';
import { assetURL } from '../assets/url.js';
import { SHIPS } from '../ships/catalog.js';
import {
  ENHANCEMENTS,
  enhancementRanks,
  upgradedHandling,
  REWARDS,
  RARITIES,
  requirementText,
} from './catalog.js';
import { rewardProgress, shipUnlocked } from './profile.js';
import { escapeHTML } from '../ui/html.js';
import {
  courseCollection,
  courseUnlockMessage,
  courseUnlockRequirement,
  MODE_UNLOCKS,
} from '../levels/access.js';
import { trackChallenge } from '../frontend/track-challenge.js';
import { careerUnlockProgress } from './completion.js';
export { escapeHTML };
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
      const label = `${stat.name}: ${display(value)} ${stat.unit}${rank ? `; ${Math.round(gain * 100)}% fleet improvement` : '; stock'}`;
      return `<div class="performance-stat" data-stat="${stat.id}"><div class="performance-label"><span>${stat.name}</span><b>${display(base)}${rank ? `<em> +${display(value - base)}</em>` : ''} <small>${stat.unit}</small></b></div><div class="enhancement-meter" role="meter" aria-label="${label}" aria-valuemin="0" aria-valuemax="${maximum}" aria-valuenow="${value}" aria-valuetext="${label}"><span class="stat-base" style="width:${baseWidth}%"></span>${Array.from({ length: rank }, (_, i) => `<span class="stat-notch" style="width:${stat.id === 'toughness' ? (stat.gains[i + 1] - stat.gains[i]) * 100 : (base / maximum) * (stat.gains[i + 1] - stat.gains[i]) * 100}%" title="${stat.name} ${i + 1}"></span>`).join('')}</div></div>`;
    },
  ).join('')}</div>`;
}
export function rewardsView(rewards, { heading = 'Earned this run' } = {}) {
  if (!rewards?.length) return '';
  return `<section class="earned-rewards" aria-label="${heading}"><h3>${heading}</h3><div>${rewards.map((reward) => `<article class="earned-reward rarity-${reward.rarity}">${rewardIcon(reward.id)}<span><small>${RARITIES[reward.rarity]}${reward.kind === 'enhancement' ? ' · Fleet upgrade unlocked' : ''}</small><strong>${reward.name}</strong><p>${reward.description}${reward.kind === 'enhancement' ? ' · Applies automatically to every ship.' : ''}</p></span></article>`).join('')}</div></section>`;
}
export function courseRequirementText(id, access, catalog = []) {
  const requirement = courseUnlockRequirement(id, access);
  const previous = catalog.find((entry) => entry.id === requirement?.courseId);
  return previous
    ? `${requirement.winRequired ? 'Win' : 'Complete'} ${previous.name} to unlock this course.`
    : courseUnlockMessage(id, access);
}
export function courseResultsView(before, after, catalog = []) {
  if (IS_DEMO || !before) return '';
  const previous = courseCollection(before),
    current = courseCollection(after);
  const completed = current.courses.filter(
    (course) =>
      course.completed &&
      !previous.courses.find((old) => old.id === course.id)?.completed,
  );
  const opened = current.courses.filter(
    (course) =>
      course.available &&
      !previous.courses.find((old) => old.id === course.id)?.available,
  );
  if (!completed.length && !opened.length) return '';
  const title = (id) =>
    escapeHTML(catalog.find((entry) => entry.id === id)?.name ?? id);
  return `<section class="race-reward-progress course-result-progress"><h3>${completed.length ? 'Course complete' : 'New course unlocked'}</h3>${completed.map((course) => `<p>${title(course.id)} completed.</p>`).join('')}${opened.map((course) => `<p><strong>${title(course.id)}</strong> unlocked.</p>`).join('')}${completed.length && !opened.length ? '<p>All three courses in this mode are complete.</p>' : ''}</section>`;
}
export function careerProgressView(profile) {
  const progress = careerUnlockProgress(profile);
  return `<section class="career-progress" aria-label="Career unlock collection"><div class="career-progress-heading"><span>Unlocks</span><span>${progress.collected}<span class="career-progress-total"> / ${progress.total}</span></span></div><div class="career-progress-bar" role="progressbar" aria-label="Career unlocks" aria-valuemin="0" aria-valuemax="${progress.total}" aria-valuenow="${progress.collected}" aria-valuetext="${progress.collected} of ${progress.total} unlocks collected" style="--reward-count:${progress.total}">${Array.from(
    { length: progress.total },
    (_, index) =>
      `<span class="career-progress-notch${index < progress.collected ? ' is-earned' : ''}" aria-hidden="true"></span>`,
  ).join('')}</div></section>`;
}
export function careerView(profile, { catalog = [] } = {}) {
  const progress = careerUnlockProgress(profile);
  const groups = [
    [
      'enhancements',
      'Fleet upgrades',
      REWARDS.filter((reward) => reward.kind === 'enhancement'),
    ],
    ['ships', 'Ships', REWARDS.filter((reward) => reward.kind === 'ship')],
    [
      'equipment',
      'Equipment',
      REWARDS.filter((reward) => ['equipment', 'exotic'].includes(reward.kind)),
    ],
  ].filter(([, , rewards]) => rewards.length);
  const roadmap = groups
    .map(([id, label, rewards]) => {
      const earned = rewards.filter((reward) =>
        profile.claims.includes(reward.id),
      ).length;
      return `<section class="career-reward-group" data-reward-group="${id}" aria-label="${label}"><header><h2>${label}</h2><span>${earned} / ${rewards.length}</span></header><div class="reward-roadmap">${rewards
        .map((reward) => {
          const owned = profile.claims.includes(reward.id),
            [progress, total] = rewardProgress(profile, reward.requirement);
          return `<article class="reward-milestone rarity-${reward.rarity} ${owned ? 'earned' : 'locked'}" aria-label="${escapeHTML(reward.name)} · ${owned ? 'Unlocked' : 'Locked'}">${rewardIcon(reward.id)}<div><strong>${reward.name}</strong><p>${reward.description}</p>${owned ? '' : `<small>${requirementText(reward.requirement)} · ${progress}/${total}</small>`}</div></article>`;
        })
        .join('')}</div></section>`;
    })
    .join('');
  const collection = IS_DEMO ? null : courseCollection(profile);
  const access = {
    cupWins: profile.cups,
    finishedCourses: profile.finishedCourses ?? [],
  };
  const courses = IS_DEMO
    ? ''
    : `<section class="career-collection career-courses" aria-label="Course unlocks"><header class="career-collection-heading"><h2>Courses <small>${collection.unlocked} / ${collection.total} unlocked</small></h2><span>${collection.completed} completed</span></header><p class="career-collection-intro">Cup wins open each mode. Finish Freestyle courses or win Eliminator and Interceptor encounters to open the next course.</p>${MODE_UNLOCKS.map(
        (mode) =>
          `<section class="career-course-group" aria-label="${mode.label} courses"><h3>${mode.label}</h3><div class="career-course-grid">${collection.courses
            .filter((course) => course.mode === mode.mode)
            .map((course) => {
              const name =
                catalog.find((entry) => entry.id === course.id)?.name ??
                `${mode.label} ${course.index + 1}`;
              const status = {
                locked: 'Locked',
                available: 'Available',
                completed: 'Completed',
              }[course.status];
              const message = courseRequirementText(course.id, access, catalog);
              return `<article class="career-course-card is-${course.status}" data-course="${course.id}" aria-label="${escapeHTML(name)} · ${status}"><div><span class="career-course-tier">${trackChallenge(course.id)}</span><span class="career-course-status">${status}</span></div><strong>${escapeHTML(name)}</strong><p>${escapeHTML(message || (course.completed ? 'Course complete.' : 'Ready to play.'))}</p></article>`;
            })
            .join('')}</div></section>`,
      ).join('')}</section>`;
  return `<div class="career-summary menu-card"><strong>${progress.collected}<small> / ${progress.total} unlocks</small></strong>${IS_DEMO ? '' : `<span>${profile.points} race progress</span>`}<span>${profile.finishes} finishes · ${profile.wins} wins</span><span>${IS_DEMO ? Number(profile.cups.includes('demo')) : fullCupWins(profile)} / ${IS_DEMO ? 1 : 4} cup wins</span><span>${Math.min(profile.trialTracks.length, IS_DEMO ? 1 : 2)} / ${IS_DEMO ? 1 : 2} Time Trial tracks</span><span class="career-summary-meter" style="--career-complete:${(progress.collected / progress.total) * 100}%" aria-hidden="true"></span></div><section class="career-unlocks" aria-label="Career unlock collection"><section class="career-collection career-gear" aria-label="Reward unlocks"><header class="career-collection-heading"><h2>Rewards <small>${progress.rewardCount} / ${REWARDS.length} collected</small></h2></header><details class="career-rules"><summary tabindex="0">How to earn rewards</summary><p class="career-intro">${IS_DEMO ? 'Four rewards to earn: finish races, win the Demo Cup and set a clean Time Trial record. Fleet upgrades apply automatically to every ship. Equip two items. Export your save here, then import it in the full game to keep your rewards, trophy and records. Full-game upgrades stay saved while you play the demo.' : 'Fleet upgrades apply automatically to every ship. Races and valid mode results earn reward progress. Race placements award 1st +5, 2nd +4, 3rd +3, 4th–5th +2, 6th–10th +1; Freestyle medals and Interceptor results also contribute. Win championships and set clean Time Trial records on two different tracks to complete your gear collection, then unlock every mode course to complete your career.'}</p></details><div class="career-rewards">${roadmap}</div></section>${courses}</section>`;
}
export function shipLockText(profile, id) {
  if (shipUnlocked(profile, id)) return '';
  return requirementText(
    REWARDS.find((reward) => reward.ship === id).requirement,
  );
}
