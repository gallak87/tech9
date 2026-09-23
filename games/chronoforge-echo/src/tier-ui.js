import { TIERS, itemRarityTier, itemRarityName } from './content.js';
import './tier-ui.css';

// A tier always carries its name and rank as well as its color.
function badge(tier, name) {
  return name
    ? `<span class="tier-badge" data-tier="${tier}"><span class="tier-rank">${tier}</span> ${name}</span>`
    : '';
}
export function tierBadge(tier) {
  return badge(tier, TIERS[tier - 1]);
}

// Keep saved forge strength separate from the permanent Exotic rarity badge.
export function itemAttributes(item) {
  return item
    ? `data-tier="${item.tier}"${item.exotic ? ' data-exotic="true"' : ''}`
    : '';
}

export function itemBadges(item) {
  return item ? badge(itemRarityTier(item), itemRarityName(item)) : '';
}
