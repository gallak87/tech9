import { RIVAL_BONUS_SCALES } from '../race/rival-build.js';
import { escapeHTML } from '../ui/html.js';

export function difficultyBonusDescription(difficulty) {
  const scale = Object.hasOwn(RIVAL_BONUS_SCALES, difficulty)
    ? RIVAL_BONUS_SCALES[difficulty]
    : RIVAL_BONUS_SCALES.easy;
  return scale === 1
    ? 'Rivals match your stat upgrade bonuses.'
    : `Rivals receive ${Math.round(scale * 100)}% of your stat upgrade bonuses.`;
}

export function difficultyDescriptionView(difficulty, id) {
  return `<p class="rival-difficulty-note" id="${escapeHTML(id)}"><span data-rival-bonus-description>${difficultyBonusDescription(difficulty)}</span><span>Random loadouts from your unlocked gear. Same slot limit, effects and cooldowns.</span></p>`;
}
