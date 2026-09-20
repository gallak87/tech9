import { ITEMS, TIERS } from './content.js';
import {
  communityRegion,
  communityStatus,
  reforgeCommunityWeapon,
} from './community-restoration.js';
import { performCommunityRestoration } from './construction.js';
import { itemBadges, tierBadge } from './tier-ui.js';

const esc = (value) =>
  String(value ?? '').replace(
    /[&<>"']/g,
    (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[
        c
      ],
  );
const fmt = (value) => Math.floor(value || 0).toLocaleString();
const button = (label, action, attrs = '', className = 'button') =>
  `<button class="${className}" data-do="${action}" ${attrs}>${label}</button>`;
const costText = (cost) =>
  Object.entries(cost || {})
    .map(([resource, value]) => `${fmt(value)} ${resource}`)
    .join(' · ') || 'No resource cost';
const icon = (id) =>
  `<canvas class="pixel-icon" data-inventory-icon="${esc(id)}" width="128" height="128" aria-hidden="true"></canvas>`;
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
const statsMarkup = (item, previous = null) =>
  `<dl class="community-weapon-stats" aria-label="${previous ? 'Reforge stat changes' : 'Weapon stats'}">${Object.keys(
    statNames,
  )
    .filter((key) => (item?.stats[key] || 0) !== (previous?.stats[key] || 0))
    .map((key) => {
      const value = (item.stats[key] || 0) - (previous?.stats[key] || 0);
      return `<div><dt>${statNames[key]}</dt><dd>${previous && value > 0 ? '+' : ''}${value}</dd></div>`;
    })
    .join('')}</dl>`;

function offer(status, kind, id) {
  if (!status) return null;
  const candidate =
    kind === 'restore'
      ? status.projects.find((project) => project.id === id)
      : kind === 'reforge'
        ? status.reforge
        : null;
  if (!candidate) return null;
  return {
    kind,
    id,
    region: status.id,
    eligible: candidate.eligible,
    reason: candidate.reason,
    key: JSON.stringify([
      status.id,
      kind,
      id,
      status.level,
      status.weapon.tier,
      status.weapon.targetTier,
      candidate.cost,
    ]),
  };
}

// Quotes belong to the current panel, so leaving, loading, and visiting another
// town cannot retain a confirmation against a different community or save.
export class CommunityMenu {
  constructor(ui) {
    this.ui = ui;
  }
  get status() {
    return communityStatus(this.ui.game.state, this.ui.game.state.region);
  }
  get quote() {
    return this.ui.panel?.type === 'build'
      ? this.ui.panel.communityQuote
      : null;
  }
  available() {
    const { game, panel, menu } = this.ui;
    return (
      !menu &&
      panel?.type === 'build' &&
      game.mode === 'world' &&
      !game.upgradeTour?.open &&
      !game.devTools?.open &&
      !!communityRegion(game.state.region)
    );
  }
  request(kind, id = '') {
    if (!this.available()) return;
    const quote = offer(this.status, kind, id);
    if (!quote?.eligible) return;
    this.ui.panel.communityQuote = quote;
    this.ui.render();
    this.ui.root
      .querySelector('[data-do="community-confirm"]')
      ?.focus({ preventScroll: true });
  }
  cancel() {
    const quote = this.quote;
    if (!quote) return false;
    this.ui.panel.communityQuote = null;
    this.ui.render();
    const action =
      quote.kind === 'restore'
        ? `community-restore:${quote.id}`
        : 'community-reforge';
    this.ui.root
      .querySelector(`[data-do="${action}"]`)
      ?.focus({ preventScroll: true });
    return true;
  }
  openInventory() {
    const status = this.status;
    if (!this.available() || !status?.complete || !status.weapon.owned) return;
    const { ui } = this;
    ui.clearInventoryFilters();
    ui.inventoryHero = status.weapon.heroId;
    ui.inventoryFilter = 'weapon';
    ui.item = status.weapon.id;
    ui.inventoryIndex = 0;
    ui.menuScroll ??= {};
    ui.menuScroll[2] = { body: 0, pack: 0 };
    ui.panel = null;
    ui.menu = true;
    ui.tab = 2;
    ui.notice = '';
    ui.game.keys.clear();
    ui.render();
    const target =
      ui.root.querySelector(`[data-do="item:${status.weapon.id}"]`) ||
      ui.root.querySelector(
        `[data-do="inventory-slot:weapon:${status.weapon.heroId}"]`,
      );
    target?.focus({ preventScroll: true });
    target?.scrollIntoView({ block: 'nearest' });
  }
  confirm() {
    if (!this.available() || !this.quote) return;
    const quote = this.quote;
    const current = offer(this.status, quote.kind, quote.id);
    this.ui.panel.communityQuote = null;
    if (!current?.eligible || current.key !== quote.key) {
      this.ui.feedback({
        ok: false,
        message:
          current?.reason ||
          'The project changed. Review its current requirements.',
      });
      return;
    }
    if (quote.kind === 'restore')
      return performCommunityRestoration(this.ui.game, quote.region, quote.id, {
        feedback: (result) => this.feedback(result, 'restore'),
      });
    const result = reforgeCommunityWeapon(this.ui.game.state, quote.region);
    if (result.ok) this.ui.game.checkpoint();
    this.feedback(result, 'reforge');
    return result;
  }
  feedback(result, kind) {
    const status = this.status;
    let message = result.message;
    if (result.ok && status?.complete) {
      const weapon = status.weapon;
      message = `${kind === 'restore' ? `${status.name} restoration complete · Added to inventory` : 'Reforge complete'} · ${weapon.name} — Exotic · ${TIERS[weapon.tier - 1]} · ${weapon.heroName}. ${weapon.nextLevel ? `Next reforge at ${weapon.heroName} level ${weapon.nextLevel}.` : 'Fully reforged.'}`;
    }
    if (result.ok && this.ui.game.devTools?.worldPreviewActive)
      message += ' Temporary world preview — not saved to your expedition.';
    this.ui.feedback({ ...result, message });
  }
  controls(kind, id, eligible, label) {
    const pending = this.quote?.kind === kind && this.quote.id === id;
    return `<div class="community-actions">${button(
      pending ? 'Confirm' : label,
      pending
        ? 'community-confirm'
        : kind === 'restore'
          ? `community-restore:${id}`
          : 'community-reforge',
      eligible ? '' : 'disabled',
      pending ? 'button primary' : 'button',
    )}${button('Cancel', 'community-cancel', pending ? '' : 'disabled aria-hidden="true"', pending ? 'button' : 'button community-cancel-hidden')}</div>`;
  }
  render() {
    const status = this.status;
    if (!status) return '';
    const weapon = status.weapon;
    const preview = this.ui.game.devTools?.worldPreviewActive;
    const locked = !status.liberated;
    const reforge = status.reforge;
    const rewardTier = weapon.tier || weapon.targetTier;
    const received = status.complete && weapon.owned;
    const finalProject = status.projects.at(-1);
    return `<div class="community-view" data-community="${status.id}">
      <section class="tier-heading community-progress"><div class="tier-title-row"><div><div class="eyebrow">${status.complete ? 'COMMUNITY COMPLETE' : `${status.level - 1} / 3 PROJECTS RESTORED`}</div><h3>${esc(status.name)}</h3></div>${button('Return to town', 'close')}</div>${locked ? '<p>Liberate this community to restore it.</p>' : ''}</section>
      ${preview ? '<p class="community-preview">World preview · These projects and rewards are temporary. Return to your expedition to keep progress.</p>' : ''}
      <div class="community-projects">${status.projects
        .map((project) => {
          const state = project.complete
            ? 'complete'
            : project.level === status.level + 1
              ? 'current'
              : 'locked';
          return `<article class="community-project${!project.complete && !project.eligible ? ' community-unavailable' : ''}" data-community-project="${project.id}" data-project-state="${state}">
          <div class="community-project-details"><h3>${esc(project.name)}</h3>${project.complete ? '' : `<div class="community-cost">${esc(costText(project.cost))}</div><p class="community-requirement">${esc(project.reason)}</p>`}</div>${project.complete ? '<div class="community-actions"><span class="community-completed">✓ Complete</span></div>' : this.controls('restore', project.id, project.eligible, 'Restore')}
        </article>`;
        })
        .join('')}</div>
      <section class="community-reward" data-tier="${rewardTier}" data-exotic="true" aria-label="Community reward">
        <div class="community-weapon">${icon(weapon.id)}<div><div class="eyebrow">${status.complete ? 'YOUR COMMUNITY KEEPSAKE' : 'COMPLETION REWARD'}</div><h3>${esc(weapon.name)}</h3><div class="item-badges">${itemBadges(weapon.item)}</div><p>For ${esc(weapon.heroName)} · Unsellable</p>${statsMarkup(weapon.item)}</div></div>
        <div class="community-reward-status"><label class="community-receipt"><input type="checkbox" disabled ${received ? 'checked' : ''} aria-label="Reward received"><small>${received ? 'Received' : `Complete “${esc(finalProject.name)}” to receive`}</small></label>${received ? button('View in inventory', 'community-inventory') : ''}${
          status.complete
            ? `<div class="community-reforge">${reforge.toTier > weapon.tier ? `<div class="community-reforge-target">Reforge to ${tierBadge(reforge.toTier)}<span>Spend ${esc(costText(reforge.cost))}</span></div>${statsMarkup(ITEMS[reforge.itemId], weapon.item)}` : ''}<p class="community-requirement">${esc(reforge.reason)}</p>${this.controls('reforge', '', reforge.eligible, 'Reforge')}</div>`
            : ''
        }</div>
      </section>
    </div>`;
  }
}
