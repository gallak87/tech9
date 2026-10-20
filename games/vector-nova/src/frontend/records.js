import { SHIPS } from '../ships/catalog.js';
import { formatTime } from '../race/timing.js';
const esc = (value) =>
  String(value).replace(
    /[&<>"']/g,
    (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[
        c
      ],
  );
export function recordsView({
  records,
  catalog,
  routes,
  shipId = 'all',
  trackId = 'all',
  heading = false,
  trackArt = () => '',
}) {
  const known = records
    .map((r) => ({
      ...r,
      levelId: routes.find((route) => route.trackId === r.identity.track)?.id,
    }))
    .filter(
      (r) =>
        catalog.some((l) => l.id === r.levelId) &&
        SHIPS.some((s) => s.id === r.identity.ship.id),
    );
  const filtered = known.filter(
    (r) =>
      (shipId === 'all' || r.identity.ship.id === shipId) &&
      (trackId === 'all' || r.levelId === trackId),
  );
  const options = (items, selected) =>
    `<option value="all">All</option>${items.map((i) => `<option value="${i.id}" ${i.id === selected ? 'selected' : ''}>${esc(i.name)}</option>`).join('')}`;
  const rows = filtered.toSorted(
    (a, b) =>
      catalog.findIndex((l) => l.id === a.levelId) -
        catalog.findIndex((l) => l.id === b.levelId) ||
      a.identity.ship.id.localeCompare(b.identity.ship.id) ||
      a.duration - b.duration,
  );
  return `<section class="records-panel" aria-label="Time Trial personal bests">${heading ? '<h2 class="records-heading">Time Trial records</h2>' : ''}<p class="records-intro">Personal bests <span>Standing & flying laps · one descent per sprint</span></p><div class="records-toolbar"><label>Track<select data-record-filter="track">${options(catalog, trackId)}</select></label><label>Ship<select data-record-filter="ship">${options(SHIPS, shipId)}</select></label></div><p class="records-count" role="status">${rows.length} ${rows.length === 1 ? 'record' : 'records'}${known.some((r) => !r.saved) ? ' · Includes times kept for this page session only' : ' · Saved on this device'}</p>${
    rows.length
      ? `<ol class="records-list">${rows
          .map((r) => {
            const track = catalog.find((l) => l.id === r.levelId);
            const ship = SHIPS.find((s) => s.id === r.identity.ship.id);
            return `<li><div class="record-description"><div class="record-course"><span class="track-icon">${trackArt(track.id)}</span><div><h3>${esc(track.name)}</h3><p>${esc(ship.name)} · ${r.identity.format === 'sprint' ? '1 descent' : r.identity.start === 'standing' ? 'Standing lap' : r.identity.start === 'flying' ? 'Flying lap' : 'Legacy · 3-lap run'}</p></div></div><small>${r.ghostSaved ? 'Personal ghost saved' : r.ghost ? 'Ghost in this page session' : 'No personal ghost'}${r.saved ? '' : ' · Time not saved'}</small><details><summary>Recorded rules profile</summary><p>Course ${esc(r.identity.version)} · Ship ${esc(r.identity.ship.version)} · Physics ${esc(r.identity.physics)}. ${esc(r.identity.rules)}</p></details></div><strong>${formatTime(r.duration)}</strong><button data-record-key="${r.key}" data-record-track="${track.id}" data-record-ship="${ship.id}">Set up trial →<span class="sr-only"> ${esc(track.name)}, ${esc(ship.name)}</span></button></li>`;
          })
          .join('')}</ol>`
      : `<div class="records-empty"><h3>${known.length ? 'No records match these filters.' : 'Your first best starts here.'}</h3><p>${known.length ? 'Choose another track or ship to see your saved times.' : 'Complete a clean lap or sprint to save your time and personal ghost immediately. Circuit laps continue until you leave. Automatic failed-jump recovery only costs time.'}</p><button data-action="record-trial">Set up Time Trial →</button></div>`
  }<p class="records-help">Records stay on this device and browser. Each track and ship has separate standing-start and flying-lap bests. Times and ghosts require matching course and rules; legacy three-lap runs are kept for reference.</p><div class="transfer-slot records-transfer"></div></section>`;
}
