import { TIERS } from './content.js';
import './tier-ui.css';

// A tier always carries its name and rank as well as its color.
export function tierBadge(tier) {
  return TIERS[tier - 1]
    ? `<span class="tier-badge" data-tier="${tier}"><span class="tier-rank">${tier}</span> ${TIERS[tier - 1]}</span>`
    : '';
}

// Exotic describes provenance and reforging; the normal tier still describes
// power. A named badge keeps that distinction readable without color alone.
export function exoticBadge(item) {
  return item?.exotic
    ? '<span class="exotic-badge"><span aria-hidden="true">✧</span> Exotic</span>'
    : '';
}

export function itemBadges(item) {
  return item ? `${tierBadge(item.tier)}${exoticBadge(item)}` : '';
}
