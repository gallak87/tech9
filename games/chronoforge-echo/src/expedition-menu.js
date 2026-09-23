import { notificationMarkup } from './ui-notifications.js';
import { HEROES, ITEMS, TECHS, TIERS } from './content.js';
import { tierBadge, itemBadges, itemAttributes } from './tier-ui.js';
import { inventoryPage } from './inventory-menu.js';
import * as P from './progression.js';
import { REGIONS, ALL_SCENES } from './world.js';
import { MAP_REGIONS, mapRegionVisible } from './expedition-map-model.js';
import { questList, mainObjective } from './narrative.js';
import { saveMeta } from './persistence.js';

const esc = (s) =>
  String(s ?? '').replace(
    /[&<>"']/g,
    (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[
        c
      ],
  );
const fmt = (n) => Math.floor(n ?? 0).toLocaleString();
const time = (s) =>
  `${Math.floor((s || 0) / 3600)}h ${Math.floor(((s || 0) % 3600) / 60)}m`;
const btn = (label, action, cl = '', attrs = '') =>
  `<button class="${cl}" data-do="${esc(action)}" ${attrs}>${label}</button>`;
const icon = (id) =>
  `<canvas class="pixel-icon" data-${ITEMS[id]?.slot === 'weapon' ? 'inventory-icon' : 'icon'}="${esc(id)}" width="128" height="128" aria-hidden="true"></canvas>`;
const names = {
  str: 'Strength',
  int: 'Intellect',
  tec: 'Technique',
  def: 'Defense',
  spd: 'Speed',
  crit: 'Critical %',
  maxHp: 'Max HP',
  maxMp: 'Max MP',
};
const tabs = [
  'Map',
  'Party',
  'Inventory',
  'Skills',
  'Quests',
  'Save',
  'Settings',
];
const heroOf = (ui) => ui.game.state.heroes[ui.hero] || ui.game.state.heroes[0];
const header = (title, note) =>
  `<div class="exp-heading"><h2>${title}</h2><span>${note}</span></div>`;
const statList = (h, s) =>
  `<dl class="exp-stats">${['str', 'int', 'tec', 'def', 'spd', 'crit'].map((k) => `<div><dt>${names[k]}</dt><dd>${P.stats(h, s)[k]}</dd></div>`).join('')}</dl>`;
function heroPicker(ui) {
  return `<div class="exp-crew" role="group" aria-label="Crew member">${ui.game.state.heroes.map((h, i) => btn(`<span>${h.name}</span><small>LV ${h.level}${ui.tab === 3 ? ` · ${h.skillPoints} SP` : ''}</small>`, 'hero:' + i, 'exp-crew-choice', `aria-pressed="${i === ui.hero}"`)).join('')}</div>`;
}
function heroArt(h) {
  return `<div class="exp-figure"><span class="exp-figure-rule"></span><canvas width="480" height="640" data-menu-hero="${h.id}" aria-label="${h.name}, ${HEROES[h.id].role}"></canvas><span class="exp-figure-caption">${HEROES[h.id].role} / LEVEL ${h.level}</span></div>`;
}
function gear(h) {
  return `<div class="exp-gear"><div class="exp-kicker">EQUIPPED</div>${Object.entries(
    h.equip,
  )
    .map(([slot, id]) =>
      btn(
        `${id ? icon(id) : '<span class="exp-empty-slot">—</span>'}<span><small class="exp-equipment-meta"><span>${slot}</span>${itemBadges(ITEMS[id])}</small><strong>${id ? ITEMS[id].name : 'Empty slot'}</strong></span>`,
        `inventory-slot:${slot}:${h.id}`,
        'exp-gear-slot',
        itemAttributes(ITEMS[id]),
      ),
    )
    .join('')}</div>`;
}
function vitals(h, s) {
  const st = P.stats(h, s);
  return `<div class="exp-vitals">${[
    ['HP', h.hp, st.maxHp],
    ['MP', h.mp, st.maxMp],
    ['XP', h.xp, P.xpForLevel(h.level)],
  ]
    .map(
      ([label, v, max]) =>
        `<div><span>${label}</span><strong>${fmt(v)} <small>/ ${fmt(max)}</small></strong><i><i style="width:${Math.max(0, Math.min(100, (v / max) * 100))}%"></i></i></div>`,
    )
    .join('')}</div>`;
}
function characterPage(ui) {
  const s = ui.game.state,
    h = heroOf(ui);
  return `${header(h.name, `${HEROES[h.id].role} · CREW RECORD / ${s.heroes.length} COMPANIONS`)}${heroPicker(ui)}<div class="exp-character-layout">${gear(h)}${heroArt(h)}<aside class="exp-character-notes">${vitals(h, s)}${statList(h, s)}<div class="exp-skill-count">${h.skillPoints} skill points ${btn('Develop techniques →', 'tab:3')}</div></aside></div><div class="exp-character-footer"><p class="exp-hand">${s.heroes.length === 1 ? 'For now, the salt road has only one set of footsteps.' : 'A different road brought each of us here. We go on together.'}</p>${btn('Inspect equipment →', 'inventory-open:' + h.id, 'button quiet')}</div>`;
}

function mapPage(ui) {
  const preview = ui.game.devTools?.mapExplored;
  const visited = Object.keys(REGIONS).filter((id) =>
    mapRegionVisible(ui.game, id),
  ).length;
  return `<div class="map-frame"><canvas id="atlas-map" class="map-canvas" aria-label="World survey: explored terrain, fog and discovered landmarks"></canvas>
  <div class="map-region-layer" role="group" aria-label="Select a region">${Object.keys(
    MAP_REGIONS,
  )
    .map(
      (id) =>
        `<button type="button" class="map-region" data-map-region="${id}" aria-pressed="false"><span class="map-region-name"></span><span class="map-region-action"></span></button>`,
    )
    .join('')}</div>
  <div class="map-heading"><h2>The known world</h2><span>${visited} / ${Object.keys(REGIONS).length} ${preview ? 'revealed · Temporary map view' : 'surveyed'}</span></div>
  <svg class="map-compass" viewBox="0 0 64 88" role="img" aria-label="North is up">
   <text x="32" y="12" text-anchor="middle">N</text>
   <path d="M7 49 32 41 57 49 32 57Z" fill="currentColor" fill-opacity=".18" stroke="currentColor" stroke-width=".8"/>
   <path d="M32 21 42 49 32 81 22 49Z" fill="#e8d5ad" stroke="currentColor" stroke-width="1"/>
   <path d="M32 21 32 49 22 49Z M32 49 42 49 32 81Z" fill="currentColor"/>
   <path d="M7 49H57 M32 21V81" fill="none" stroke="currentColor" stroke-width=".6"/>
  </svg>
  <div class="map-tools">${btn('−', 'map-zoom:out', 'button quiet', 'aria-label="Zoom out"')}${btn('+', 'map-zoom:in', 'button quiet', 'aria-label="Zoom in"')}${btn('Center', 'map-reset', 'button quiet')}</div>
  <div class="map-key">□ Settlement &nbsp; · Shelter / gateway &nbsp; + Crew<br>${preview ? 'All maps revealed temporarily. Your survey is unchanged.' : 'Travel to liberated settlements and discovered road towns. Enter a road town once to unlock its stop.'}</div>
 </div>`;
}
function requirements(t, h, s) {
  const all = s.heroes.flatMap((x) => x.skills),
    r = [];
  for (const id of t.heroes)
    if (!s.heroes.some((x) => x.id === id))
      r.push(`Recruit ${HEROES[id].name}`);
  for (const id of t.requires || [])
    if (!all.includes(id)) r.push(`Learn ${TECHS[id].name}`);
  if (t.level && h.level < t.level) r.push(`Level ${t.level}`);
  if (t.tier && s.tier < t.tier) r.push(TIERS[t.tier - 1]);
  if (t.flag && !s.flags[t.flag]) r.push('Complete personal story');
  if (h.skillPoints < t.cost) r.push(`${t.cost} skill points`);
  return r;
}
function skillsPage(ui) {
  const s = ui.game.state,
    h = heroOf(ui);
  return `${header('A language of our own', `${h.name} · ${h.skillPoints} SKILL POINTS AVAILABLE`)}${heroPicker(ui)}<div class="exp-skills-ledger">${Object.values(
    TECHS,
  )
    .filter((t) => t.heroes.includes(h.id))
    .map((t) => {
      const known = s.heroes.some((x) => x.skills.includes(t.id)),
        req = requirements(t, h, s);
      return btn(
        `<span class="exp-skill-sign">${known ? '✓' : t.heroes.length > 1 ? '＋' : '·'}</span><span class="item-name"><strong>${t.name}</strong>${t.heroes.length > 1 ? `<em>${t.heroes.map((id) => HEROES[id].name).join(' + ')}</em>` : ''}<span>${esc(t.description)}</span><small>${known ? 'Learned' : req.length ? req.join(' · ') : 'Ready to learn'}</small></span><span class="exp-skill-cost">${t.mp} MP<small>${known ? 'KNOWN' : `${t.cost} SP`}</small></span>`,
        'learn:' + t.id,
        'exp-skill-row' +
          (known ? ' learned' : req.length ? ' locked' : ' available'),
        known || req.length ? 'disabled' : '',
      );
    })
    .join(
      '',
    )}</div><p class="exp-hand exp-footnote">Coordinated techniques use every participant’s ready gauge and MP. Their strength belongs to the whole crew.</p>`;
}
function questRewards(q) {
  return `<div class="exp-quest-rewards" aria-label="Quest rewards">${(
    q.rewardItems || []
  )
    .map((r) => {
      const name =
        ITEMS[r.id]?.name ||
        {
          xp: 'XP',
          food: 'Food',
          ore: 'Ore',
          energy: 'Energy',
          renown: 'Renown',
        }[r.id] ||
        r.id;
      return `<span class="exp-quest-reward" ${itemAttributes(ITEMS[r.id])} title="${esc(name)} ×${fmt(r.amount)}" aria-label="${esc(name)} ${fmt(r.amount)}">${icon(r.id)}<b>${fmt(r.amount)}</b>${itemBadges(ITEMS[r.id])}</span>`;
    })
    .join(
      '',
    )}${(q.rewardNotes || []).map((note) => `<span class="exp-quest-benefit">${esc(note)}</span>`).join('')}</div>`;
}
function questsPage(ui) {
  const qs = questList(ui.game.state);
  return `${header('The threads we follow', `${qs.filter((q) => q.complete).length} RESOLVED / ${qs.length} RECORDED`)}<div class="exp-current-objective"><span class="exp-kicker">CURRENT OBJECTIVE</span><p>${esc(mainObjective(ui.game.state))}</p></div><div class="exp-quest-ledger">${qs.map((q) => `<article class="quest ${q.complete ? 'completed' : ''}" data-quest="${esc(q.id)}"${q.rewardItems?.some((reward) => ITEMS[reward.id]?.exotic) ? ' data-exotic="true"' : ''}><div class="exp-quest-meta"><div class="exp-kicker">${esc(q.kind || 'Field story')}${q.stage != null ? ' / ' + esc(q.stage) : ''} · ${q.complete ? 'RESOLVED' : 'IN PROGRESS'}</div>${questRewards(q)}</div><div class="exp-quest-copy"><h3>${esc(q.title)}</h3><p>${esc(q.objective)}</p></div></article>`).join('')}</div>`;
}

function savePage() {
  const statusNames = {
    exploring: 'Exploring',
    battle: 'Battle in progress',
    ending: 'Final conversation',
    complete: 'Campaign complete',
  };
  return `${header('Keep a record', 'LOCAL SAVES · PORTABLE RECORDS')}<p class="exp-save-intro">Autosave follows important discoveries. Export any saved record to keep a copy, or import one into a slot.</p><div class="exp-save-ledger">${[
    'checkpoint',
    1,
    2,
    3,
  ]
    .map((slot) => {
      const m = saveMeta(slot),
        valid = !!m && !m.corrupt,
        automatic = slot === 'checkpoint',
        title = automatic
          ? 'Autosave'
          : `Field record ${String(slot).padStart(2, '0')}`,
        date = valid ? new Date(m.savedAt) : null,
        stamp =
          date && !Number.isNaN(date.getTime())
            ? date.toLocaleString()
            : 'Saved time unavailable';
      return `<article class="save-slot" data-save-slot="${slot}" data-save-state="${valid ? 'saved' : m ? 'corrupt' : 'empty'}"><span class="exp-record-number">${automatic ? 'AUTO' : String(slot).padStart(2, '0')}</span><div class="exp-save-summary"><div class="exp-save-title"><h3>${title}</h3>${valid ? `<time>${esc(stamp)}</time>` : ''}</div>${automatic ? '<small class="exp-save-auto">Updated automatically at discoveries and safe checkpoints.</small>' : ''}${valid ? `<div class="exp-save-meta"><strong>${esc(m.regionName || ALL_SCENES[m.region]?.name || 'Unknown location')}</strong><span>${esc(statusNames[m.status] || 'Exploring')}</span><span>${tierBadge(m.tier)} · ${time(m.playTime)}</span><span>Explored <b>${Number(m.exploration?.percent || 0).toLocaleString(undefined, { maximumFractionDigits: 1 })}%</b></span></div><p class="exp-save-objective">${esc(m.objective || 'Continue the expedition.')}</p><ul class="exp-save-party" aria-label="Saved party">${(m.heroes || []).map((h) => `<li><span><strong>${esc(h.name)}</strong> <small>LV ${h.level}</small></span><span class="exp-save-vitals">HP ${fmt(h.hp)} / ${fmt(h.maxHp)} <i>·</i> MP ${fmt(h.mp)} / ${fmt(h.maxMp)}</span></li>`).join('')}</ul>` : `<p class="exp-save-empty">${m?.corrupt ? 'This record cannot be read. Import a valid record to replace it.' : automatic ? 'No autosave yet. One appears as your journey progresses.' : 'Empty slot. Save this journey here or import a record.'}</p>`}</div><div class="button-group exp-save-actions">${!automatic ? btn('Save', 'save:' + slot, 'button primary', `aria-label="Save to ${title}"`) : ''}${btn('Load', 'load:' + slot, 'button quiet', `${valid ? '' : 'disabled'} aria-label="Load ${title}"`)}${btn('Import', 'import-save:' + slot, 'button quiet', `aria-label="Import into ${title}"`)}${btn('Export', 'export-save:' + slot, 'button quiet', `${valid ? '' : 'disabled'} aria-label="Export ${title}"`)}${m ? btn('Erase', 'delete:' + slot, 'button quiet', `aria-label="Erase ${title}"`) : ''}</div></article>`;
    })
    .join(
      '',
    )}</div><div class="exp-save-footer">${btn('New expedition', 'restart', 'button quiet')}</div>`;
}

function settingsPage(ui) {
  return ui.settingsBody();
}
export function renderExpedition(ui) {
  const s = ui.game.state;
  ui.hero = Math.min(ui.hero, s.heroes.length - 1);
  const bodies = [
    mapPage,
    characterPage,
    inventoryPage,
    skillsPage,
    questsPage,
    savePage,
    settingsPage,
  ];
  return `<div class="scrim"></div><section class="atlas expedition" role="dialog" aria-modal="true" aria-label="Expedition menu"><header class="exp-shell"><div class="exp-brand"><strong>CHRONFORGE <span>ECHO</span></strong><small>THE ${esc((REGIONS[s.region]?.name || ALL_SCENES[s.region]?.townId || 'HAVENTIDE').toUpperCase())} EXPEDITION</small></div><div class="exp-resources">${['food', 'ore', 'energy', 'renown'].map((id) => `<span aria-label="${fmt(s.resources[id])} ${id}">${icon(id)}${fmt(s.resources[id])}</span>`).join('')}</div><span class="close dismiss-hint"><kbd>Esc</kbd> Return</span></header><nav class="tabs" role="tablist" aria-label="Expedition pages">${tabs.map((t, i) => btn(`<small>${i + 1}</small>${t}`, 'tab:' + i, i === ui.tab ? 'active' : '', `role="tab" aria-selected="${i === ui.tab}" aria-controls="exp-page" id="exp-tab-${i}"`)).join('')}</nav><div id="exp-page" class="atlas-body scroll exp-page exp-page-${ui.tab}" role="tabpanel" aria-labelledby="exp-tab-${ui.tab}">${bodies[ui.tab](ui)}</div>${notificationMarkup(ui.notifications)}<footer class="atlas-footer"><span><kbd>1–7</kbd> Pages <kbd>Q</kbd><kbd>E</kbd> Tabs ${ui.tab === 0 ? '<kbd>↑↓←→</kbd> Select region · <kbd>Space</kbd>/<kbd>Enter</kbd> Travel · Drag to pan · Scroll to zoom' : ui.tab === 2 ? '<kbd>↑↓←→</kbd> Browse <kbd>[</kbd><kbd>]</kbd> Crew <kbd>PgUp/Dn</kbd> Scroll <kbd>Space</kbd>/<kbd>Enter</kbd> Action' : '<kbd>↑↓</kbd> Navigate <kbd>PgUp/Dn</kbd> Scroll <kbd>Space</kbd>/<kbd>Enter</kbd> Confirm'}</span><span>${tierBadge(s.tier)} / ${time(s.playTime)}</span></footer></section>`;
}
