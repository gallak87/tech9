import { TIERS } from './content.js';
import './tier-ui.css';

// A tier always carries its name and rank as well as its color.
export function tierBadge(tier) {
  return TIERS[tier - 1]
    ? `<span class="tier-badge" data-tier="${tier}"><span class="tier-rank">${tier}</span> ${TIERS[tier - 1]}</span>`
    : '';
}

// Community identity belongs to the surface; the single badge describes power.
export function itemAttributes(item) {
  return item
    ? `data-tier="${item.tier}"${item.exotic ? ' data-exotic="true"' : ''}`
    : '';
}

export function itemBadges(item) {
  return item ? tierBadge(item.tier) : '';
}
