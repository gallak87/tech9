import { SHIPS } from '../ships/catalog.js';
import { assetURL } from '../assets/url.js';
import { IS_DEMO } from '../progression/edition.js';
import {
  AVAILABLE_EQUIPMENT,
  ENHANCEMENTS,
  enhancementRanks,
  REWARDS,
  requirementText,
} from '../progression/catalog.js';
import {
  equipmentCapacity,
  shipUnlocked,
  equippedItems,
} from '../progression/profile.js';
import { EQUIPMENT_CONTROLS } from '../equipment/controls.js';
import {
  escapeHTML,
  performanceView,
  rewardIcon,
  shipLockText,
} from '../progression/view.js';
import './garage.css';

const fleet = ['shrike', 'bastion', 'needle', 'kestrel']
  .map((id) => SHIPS.find((ship) => ship.id === id))
  .filter(Boolean);

function fleetUpgradesView(profile, stock) {
  const ranks = enhancementRanks(profile);
  const upgrades = ENHANCEMENTS.flatMap((stat) => {
    const rank = ranks[stat.id];
    const reward = REWARDS.find(
      (entry) => entry.stat === stat.id && entry.rank === (rank || 1),
    );
    if (!reward) return [];
    const benefit = `+${Math.round(stat.gains[reward.rank] * 100)}% across your fleet`;
    const requirement = requirementText(reward.requirement);
    const status = !rank
      ? `Locked · ${requirement}`
      : stock
        ? 'Unlocked · Inactive in stock Time Trial'
        : 'Unlocked · Applies automatically to every ship';
    return `<div class="reward-chip-wrap rarity-${reward.rarity}"><button type="button" class="reward-chip garage-upgrade" data-fleet-upgrade="${reward.id}" data-fleet-state="${rank ? 'unlocked' : 'locked'}" aria-label="${escapeHTML(`${reward.name} · ${benefit} · ${status}`)}" aria-expanded="false" aria-describedby="garage-upgrade-${stat.id}">${rewardIcon(reward.id)}<span class="garage-upgrade-tier">${rank ? ['I', 'II', 'III'][rank - 1] : ''}</span></button><div class="reward-tooltip" id="garage-upgrade-${stat.id}" role="tooltip" hidden><strong>${reward.name} · ${benefit}</strong>${rank ? '' : `<small class="garage-upgrade-requirement">${escapeHTML(requirement)}</small>`}</div></div>`;
  });
  return `<section class="garage-upgrades${stock ? ' is-inactive' : ''}" data-reward-fit aria-label="Fleet upgrades"><div class="garage-upgrades-heading"><h2>Fleet upgrades</h2><span>${stock ? 'Inactive · Stock rules' : 'All ships'}</span></div><div class="garage-upgrade-list">${upgrades.join('')}</div></section>`;
}

export function garageView({
  profile,
  craft,
  selectedShip,
  lockedShip,
  stock,
  notice = '',
}) {
  const unlocked = shipUnlocked(profile, craft.id);
  const cupLocked = !!lockedShip && lockedShip !== craft.id;
  const capacity = equipmentCapacity(profile, craft.id);
  const loadout = equippedItems(profile, craft.id);
  const count = loadout.filter(Boolean).length;
  const unlockedFleet = fleet.filter((ship) => shipUnlocked(profile, ship.id));
  const equipment = AVAILABLE_EQUIPMENT.filter((item) =>
    profile.claims.includes(`equipment-${item.id}`),
  );
  const hint = stock
    ? 'Stock Time Trial · Equipment and fleet upgrades are inactive.'
    : cupLocked
      ? 'Ship locked for this championship. Return to your championship ship to change equipment.'
      : '';
  const detail = (item) =>
    `${item.name} · ${item.detail} · ${item.cooldown}s cooldown`;
  const initial =
    equipment.find((item) => loadout.includes(item.id)) ?? equipment[0];
  return `<div class="garage-layout"><nav class="garage-fleet" aria-label="Choose ship" style="--garage-ships:${unlockedFleet.length}">${unlockedFleet
    .map(
      (ship) =>
        `<button data-ship="${ship.id}" aria-pressed="${ship.id === selectedShip}" data-preview="${ship.id === craft.id}" aria-label="Select ${ship.name}"><img src="${assetURL(`assets/menu/ships/${ship.id}.jpg`)}" alt=""><strong>${ship.name}${ship.id === selectedShip ? ' ✓' : ''}</strong></button>`,
    )
    .join('')}</nav>
    <div class="garage-main"><div class="garage-studio"><section class="ship-details"><h1>${craft.name}</h1><p class="garage-role">${craft.role}</p><div class="ship-preview-slot"><p role="status">Loading ship preview…</p></div><span class="garage-ship-status">${!unlocked ? shipLockText(profile, craft.id) : cupLocked ? 'Locked for this championship' : ''}</span><div class="transfer-slot ship-transfer"></div></section><section class="garage-performance" aria-label="Ship performance"><span class="kicker">Performance</span>${fleetUpgradesView(profile, stock)}${performanceView(craft, profile, { stock })}<div class="garage-legend"><span>Stock</span><span>Fleet upgrades</span></div></section></div>
    <section class="garage-equipment" aria-label="Choose equipment"><div class="garage-equipment-heading"><h2>Equipment</h2><span class="garage-equipment-count">${stock ? 'Stock rules' : `<b>${count} / ${capacity}</b> equipped${capacity === 4 ? ' · Quad Core' : ''}`}</span></div><div class="garage-equipment-grid">${equipment
      .map((item) => {
        const index = loadout.indexOf(item.id),
          equipped = index >= 0;
        return `<button class="garage-equipment-card rarity-${item.rarity}" data-equip="${item.id}" data-equipment-detail="${escapeHTML(detail(item))}" aria-label="${escapeHTML(detail(item))}${equipped && !stock ? ` · Equipped: ${EQUIPMENT_CONTROLS[index].label}` : ''}" aria-pressed="${equipped && !stock}" ${!unlocked || cupLocked || stock ? 'disabled' : ''}>${rewardIcon(`equipment-${item.id}`)}<span><strong>${item.name}</strong><span class="garage-equipment-status">${equipped && !stock ? `✓ ${EQUIPMENT_CONTROLS[index].label}` : `${item.cooldown}s`}</span></span></button>`;
      })
      .join(
        '',
      )}</div><p class="garage-equipment-detail">${initial ? escapeHTML(detail(initial)) : ''}</p>${equipment.length ? '' : '<p class="garage-equipment-empty">No equipment unlocked yet.</p>'}<p class="garage-equipment-hint">${hint}</p></section>
    ${!IS_DEMO && profile.claims.includes('exotic-slot') && !profile.exoticShip && unlocked && !cupLocked ? `<section class="garage-exotic">${rewardIcon('exotic-slot')}<span><strong>Quad Core earned</strong><small>Permanently equip four items on one ship.</small></span><button data-action="fit-exotic">Fit to ${craft.name}</button></section>` : ''}
    <footer class="garage-footer"><span class="garage-notice" role="status" aria-live="polite">${escapeHTML(notice)}</span></footer></div></div>`;
}

export function showGarageEquipment(root, button) {
  if (!button?.dataset.equipmentDetail) return;
  const detail = root.querySelector('.garage-equipment-detail');
  if (detail) detail.textContent = button.dataset.equipmentDetail;
}

export function toggleGarageEquipment(store, shipId, id) {
  const profile = store.snapshot().state;
  const loadout = equippedItems(profile, shipId);
  if (
    !loadout ||
    !shipUnlocked(profile, shipId) ||
    !profile.claims.includes(`equipment-${id}`)
  )
    return '';
  const equipped = loadout.indexOf(id),
    slot = equipped >= 0 ? equipped : loadout.indexOf(null);
  if (slot < 0)
    return `${loadout.length} equipped. Remove one to change your loadout.`;
  store.equip(shipId, slot, equipped >= 0 ? null : id);
  return '';
}

// Keyboard and gamepad share this spatial path, including exits from each grid.
export function navigateGarage(event, root) {
  const button = event.target.closest('button');
  if (
    !button ||
    !root.contains(button) ||
    ![
      'ArrowLeft',
      'ArrowRight',
      'ArrowUp',
      'ArrowDown',
      'Home',
      'End',
    ].includes(event.code)
  )
    return false;
  const controls = [
    ...root.querySelectorAll('button, canvas[tabindex]'),
  ].filter((item) => !item.disabled && item.getClientRects().length);
  const group = button.closest(
    '.garage-fleet, .garage-upgrade-list, .garage-equipment-grid',
  );
  const items = group
    ? [...group.querySelectorAll('button')].filter((item) => !item.disabled)
    : controls;
  const vertical = ['ArrowUp', 'ArrowDown'].includes(event.code);
  const columns = group
    ? getComputedStyle(group).gridTemplateColumns.split(' ').length
    : 1;
  const direction = ['ArrowLeft', 'ArrowUp'].includes(event.code) ? -1 : 1;
  const step = vertical ? columns * direction : direction;
  let index =
    event.code === 'Home'
      ? 0
      : event.code === 'End'
        ? items.length - 1
        : items.indexOf(button) + step;
  let next = items[index];
  if (group?.classList.contains('garage-fleet') && vertical)
    next =
      event.code === 'ArrowUp'
        ? root.querySelector('[data-action="garage-tab"]')
        : (root.querySelector('.garage-upgrade') ??
          root.querySelector('.garage-equipment-card:not(:disabled)') ??
          root.querySelector('.ship-preview canvas'));
  if (group?.classList.contains('garage-upgrade-list') && vertical)
    next =
      event.code === 'ArrowUp'
        ? root.querySelector('.garage-fleet [aria-pressed="true"]')
        : (root.querySelector('.garage-equipment-card:not(:disabled)') ??
          root.querySelector('.ship-preview canvas'));
  if (
    group?.classList.contains('garage-fleet') &&
    columns === 1 &&
    event.code === 'ArrowRight'
  )
    next =
      root.querySelector('.garage-equipment-card:not(:disabled)') ??
      root.querySelector('[data-action="race-tab"]');
  if (!next)
    next =
      controls[
        Math.max(
          0,
          Math.min(controls.length - 1, controls.indexOf(button) + direction),
        )
      ];
  event.preventDefault();
  next?.focus({ preventScroll: true });
  next?.scrollIntoView({ block: 'nearest' });
  return true;
}
