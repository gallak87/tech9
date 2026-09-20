import { TIERS, ITEM_TIERS } from './content.js';
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

// Community identity belongs to the surface; the single badge describes power.
export function itemAttributes(item) {
  return item
    ? `data-tier="${item.tier}"${item.exotic ? ' data-exotic="true"' : ''}`
    : '';
}

export function itemBadges(item) {
  return item
    ? badge(item.tier, (item.exotic ? ITEM_TIERS : TIERS)[item.tier - 1])
    : '';
}
