import { HEROES, ITEMS } from './content.js';
import { tierBadge } from './tier-ui.js';
import * as P from './progression.js';
import { canEquip, weaponOwner, weaponFamilyLabel } from './equipment.js';

const esc = (value) =>
  String(value ?? '').replace(
    /[&<>"']/g,
    (c) =>
      ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;',
      })[c],
  );
const fmt = (n) => Math.floor(n ?? 0).toLocaleString();
const icon = (id) =>
  `<canvas class="pixel-icon" data-inventory-icon="${id}" width="128" height="128" aria-hidden="true"></canvas>`;
const button = (label, action, className, attrs = '') =>
  `<button class="${className}" data-do="${action}" ${attrs}>${label}</button>`;
const groups = [
  ['weapon', 'Weapons'],
  ['armor', 'Armor'],
  ['accessory', 'Accessories'],
  ['consumable', 'Consumables'],
];
const statNames = {
  str: 'Strength',
  int: 'Intellect',
  tec: 'Technique',
  def: 'Defense',
  spd: 'Speed',
  crit: 'Critical %',
  maxHp: 'Max HP',
  maxMp: 'Max MP',
};
export const inventoryHero = (ui) =>
  ui.game.state.heroes.find((h) => h.id === ui.inventoryHero) || null;

export function inventoryRecipient(ui, id) {
  const selected = inventoryHero(ui);
  if (selected)
    return canEquip(selected.id, id) || ITEMS[id]?.slot === 'consumable'
      ? selected
      : null;
  return ui.game.state.heroes.find((h) => h.id === weaponOwner(id)) || null;
}
const portraitSourceOffsets = { kaida: 18, vex: -10 };

export function inventoryItems(ui) {
  const slots = groups.map(([slot]) => slot);
  return Object.keys(ui.game.state.inventory)
    .filter(
      (id) =>
        ui.game.state.inventory[id] > 0 &&
        ITEMS[id] &&
        (!inventoryHero(ui) ||
          ITEMS[id].slot !== 'weapon' ||
          canEquip(ui.inventoryHero, id)) &&
        (ui.inventoryFilter === 'all' ||
          !ui.inventoryFilter ||
          ITEMS[id].slot === ui.inventoryFilter),
    )
    .sort(
      (a, b) =>
        slots.indexOf(ITEMS[a].slot) - slots.indexOf(ITEMS[b].slot) ||
        (ui.inventorySort === 'name' ? 0 : ITEMS[b].tier - ITEMS[a].tier) ||
        ITEMS[a].name.localeCompare(ITEMS[b].name) ||
        a.localeCompare(b),
    );
}

function crewPicker(ui) {
  return `<div class="exp-inventory-crew"><div class="exp-inventory-crew-hint"><span>Crew</span><span><kbd>[</kbd><kbd>]</kbd> Switch</span></div><div class="exp-inventory-heroes" role="group" aria-label="Crew member">${ui.game.state.heroes
    .map((h) =>
      button(
        `<span class="exp-inventory-face"><canvas data-portrait="${h.id}" data-portrait-offset-x="${portraitSourceOffsets[h.id] || 0}" width="192" height="192" aria-hidden="true"></canvas></span><span class="exp-inventory-hero-label">${esc(h.name)} <small>LV ${h.level}</small></span>`,
        'inventory-hero:' + h.id,
        'exp-inventory-hero',
        `aria-pressed="${h.id === ui.inventoryHero}" aria-label="${h.id === ui.inventoryHero ? 'Clear' : 'Filter by'} ${esc(h.name)}, level ${h.level}"`,
      ),
    )
    .join('')}</div></div>`;
}

function loadout(ui, h) {
  if (!h)
    return `<aside class="exp-inventory-loadout" aria-label="Crew equipment">${crewPicker(ui)}<div class="exp-kicker exp-inventory-all-crew">Equipped · All crew</div>${ui.game.state.heroes
      .map(
        (hero) =>
          `<section class="exp-inventory-crew-loadout"><h3>${esc(hero.name)}</h3><div class="exp-inventory-crew-slots">${groups
            .slice(0, 3)
            .map(([slot]) => {
              const id = hero.equip[slot],
                item = ITEMS[id];
              return button(
                `${item ? icon(id) : '<span>—</span>'}<span>${esc(item?.name || 'Empty slot')}</span>`,
                `inventory-slot:${slot}:${hero.id}`,
                'exp-inventory-crew-slot',
                `aria-label="Browse ${slot} for ${esc(hero.name)}; equipped ${esc(item?.name || 'empty slot')}" title="${esc(item?.name || 'Empty slot')}"`,
              );
            })
            .join('')}</div></section>`,
      )
      .join('')}</aside>`;
  const stats = P.stats(h, ui.game.state);
  return `<aside class="exp-inventory-loadout" aria-label="${esc(h.name)} loadout">${crewPicker(ui)}<figure class="exp-inventory-figure"><canvas width="480" height="640" data-menu-hero="${h.id}" aria-label="${esc(h.name)}, ${HEROES[h.id].role}"></canvas><figcaption><strong>${esc(h.name)}</strong><small>${HEROES[h.id].role} · LV ${h.level}</small></figcaption></figure><div class="exp-inventory-vitals"><span>HP ${fmt(h.hp)} / ${fmt(stats.maxHp)}</span><span>MP ${fmt(h.mp)} / ${fmt(stats.maxMp)}</span></div><div class="exp-kicker">Equipped</div><div class="exp-inventory-slots">${groups
    .slice(0, 3)
    .map(([slot]) => {
      const id = h.equip[slot],
        item = ITEMS[id];
      return `<div class="exp-inventory-slot-row" ${item ? `data-tier="${item.tier}"` : ''}>${button(
        `${item ? icon(id) : '<span class="exp-inventory-empty-slot">—</span>'}<span><small class="exp-inventory-slot-meta">${item && slot === 'weapon' ? weaponFamilyLabel(id) : slot}${item ? ` ${tierBadge(item.tier)}` : ''}</small><strong>${item ? esc(item.name) : 'Empty slot'}</strong></span>`,
        `inventory-slot:${slot}:${h.id}`,
        'exp-inventory-slot',
        `aria-pressed="${ui.inventoryFilter === slot}" aria-label="Browse ${slot} replacements for ${esc(h.name)}"`,
      )}${item ? button('×', `unequip:${slot}:${h.id}`, 'exp-inventory-unequip', `aria-label="Return ${esc(item.name)} to pack" title="Return to pack"`) : ''}</div>`;
    })
    .join('')}</div></aside>`;
}

function inventoryCard(ui, id) {
  const item = ITEMS[id],
    h = inventoryRecipient(ui, id),
    s = ui.game.state,
    current = h ? ITEMS[h.equip[item.slot]] : null,
    keys = Object.keys(statNames).filter(
      (key) => (item.stats[key] || 0) !== (current?.stats[key] || 0),
    ),
    consumable = item.slot === 'consumable',
    use = consumable && h ? P.previewItemUse(s, id, h.id) : null,
    unavailable =
      consumable && ui.game.mode === 'battle'
        ? 'Use the battle Item command to choose a supply and ally.'
        : use && !use.ok
          ? use.message
          : '',
    owner = weaponOwner(id),
    unrecruited = item.slot === 'weapon' && !h,
    selected = ui.item === id;
  const comparison = consumable
    ? `<p class="exp-inventory-effect">${esc(item.description)}</p>${use?.ok && (use.wasted || item.effect === 'revive') ? `<small class="exp-inventory-use-preview">${item.effect === 'revive' ? 'Revive with' : 'Restore'} ${fmt(use.amount)} ${use.unit}${use.wasted ? ` · ${fmt(use.wasted)} wasted` : ''}</small>` : ''}${unavailable ? `<small class="exp-inventory-unavailable">${esc(unavailable)}</small>` : ''}`
    : `${h && !inventoryHero(ui) ? `<small class="exp-inventory-comparison-target">${esc(h.name)} · vs ${esc(current?.name || 'empty slot')}</small>` : ''}<dl class="exp-inventory-deltas" aria-label="${h ? `Compared with ${esc(current?.name || 'empty slot')} on ${esc(h.name)}` : 'Item stats'}">${keys
        .map((key) => {
          const delta = (item.stats[key] || 0) - (current?.stats[key] || 0);
          return `<div><dt>${statNames[key]}</dt><dd${h ? ` class="${delta > 0 ? 'exp-gain' : 'exp-loss'}"` : ''}>${h && delta > 0 ? '+' : ''}${delta}</dd></div>`;
        })
        .join(
          '',
        )}</dl>${keys.length ? '' : '<p class="exp-inventory-unchanged">No stat changes</p>'}`;
  return `<article class="exp-inventory-card${selected ? ' selected' : ''}" data-pack-item="${id}" data-tier="${item.tier}">${button(
    `${icon(id)}<span class="exp-inventory-item-copy"><strong>${esc(item.name)}</strong>${tierBadge(item.tier)}${owner ? `<small class="exp-inventory-family">${weaponFamilyLabel(id)} · ${esc(HEROES[owner].name)}</small>` : ''}${item.unique ? '<small class="exp-inventory-keepsake">Personal keepsake</small>' : ''}</span><b class="exp-inventory-quantity">×${fmt(s.inventory[id])}</b>`,
    'item:' + id,
    'exp-inventory-item',
    `aria-pressed="${selected}" aria-label="${esc(item.name)}, tier ${item.tier}, ${fmt(s.inventory[id])} in pack" title="${esc(item.description)}"`,
  )}<div class="exp-inventory-card-comparison">${comparison}</div><div class="exp-inventory-card-footer">${button(
    `<span>${unrecruited ? `Recruit ${esc(HEROES[owner]?.name || 'crew')}` : h ? `${consumable ? 'Use' : 'Equip'} on ${esc(h.name)}` : 'Choose recipient'}</span>${unrecruited ? '' : '<small class="exp-inventory-action-hint"><kbd>Space</kbd> / <kbd>Enter</kbd></small>'}`,
    h
      ? `${consumable ? 'use' : 'equip'}:${id}:${h.id}`
      : 'inventory-recipient:' + id,
    'exp-inventory-action',
    unavailable || unrecruited ? 'disabled' : '',
  )}</div></article>`;
}

export function inventoryPage(ui) {
  const h = inventoryHero(ui),
    ids = inventoryItems(ui);
  // If the last copy leaves the pack, keep the cursor near its former position.
  if (!ids.includes(ui.item))
    ui.item = ids[Math.min(ui.inventoryIndex || 0, ids.length - 1)] || null;
  ui.inventoryIndex = Math.max(0, ids.indexOf(ui.item));
  return `<div class="exp-heading exp-inventory-heading"><h2>Inventory</h2></div><div class="exp-inventory-layout">${loadout(ui, h)}<section class="exp-inventory-pack" aria-label="Pack"><div class="exp-inventory-toolbar"><div class="exp-inventory-filters" role="group" aria-label="Item type">${[['all', 'All'], ...groups].map(([slot, label]) => button(label, 'inventory-filter:' + slot, 'exp-inventory-filter', `aria-pressed="${(ui.inventoryFilter || 'all') === slot}"`)).join('')}</div>${button(ui.inventorySort === 'name' ? 'Name A–Z' : 'Tier ↓', 'inventory-sort', 'exp-inventory-sort', `aria-label="Sort: ${ui.inventorySort === 'name' ? 'name, activate for highest tier first' : 'highest tier first, activate for name'}"`)}</div><div class="exp-pack-items exp-inventory-items">${
    groups
      .map(([slot, label]) => {
        const items = ids.filter((id) => ITEMS[id].slot === slot);
        if (!items.length) return '';
        return `<section class="exp-inventory-group" data-slot="${slot}" aria-label="${label}"><h3>${label}<small>${items.length}</small>${h && slot !== 'consumable' ? `<small class="exp-inventory-group-equipped">vs ${esc(ITEMS[h.equip[slot]]?.name || 'empty slot')}</small>` : ''}</h3><div class="exp-inventory-grid">${items.map((id) => inventoryCard(ui, id)).join('')}</div></section>`;
      })
      .join('') ||
    `<p class="exp-hand exp-inventory-empty">${ui.inventoryFilter && ui.inventoryFilter !== 'all' ? 'No items of this type in your pack.' : 'An empty pack. Room for what comes next.'}</p>`
  }</div><div class="exp-inventory-notice" role="status">${esc(ui.notice)}</div></section></div>`;
}
