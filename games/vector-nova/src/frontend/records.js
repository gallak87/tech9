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
  return `<section class="records-panel"><div class="front-heading"><span class="kicker">TIME TRIALS / PERSONAL BESTS</span><h1 tabindex="-1">Your records.</h1></div><div class="records-toolbar"><label>Track<select data-record-filter="track">${options(catalog, trackId)}</select></label><label>Ship<select data-record-filter="ship">${options(SHIPS, shipId)}</select></label><button data-action="records-back">← Back</button></div><p class="records-help">Three laps per circuit; one descent per sprint. Each track, ship and rules profile has its own best. Times and ghosts are used only when the current course, ship and rules match.</p><p class="records-count" role="status">${rows.length} ${rows.length === 1 ? 'record' : 'records'}${known.some((r) => !r.saved) ? ' · Includes times kept for this page session only' : ' · Saved on this device'}</p>${
    rows.length
      ? `<ol class="records-list">${rows
          .map((r) => {
            const track = catalog.find((l) => l.id === r.levelId);
            const ship = SHIPS.find((s) => s.id === r.identity.ship.id);
            return `<li><div><h2>${esc(track.name)}</h2><p>${esc(ship.name)} · ${r.identity.format === 'sprint' ? '1 descent' : '3 laps'}</p><small>${r.ghostSaved ? 'Personal ghost saved' : r.ghost ? 'Ghost in this page session' : 'No personal ghost'}${r.saved ? '' : ' · Time not saved'}</small><details><summary>Recorded rules profile</summary><p>Course ${esc(r.identity.version)} · Ship ${esc(r.identity.ship.version)} · Physics ${esc(r.identity.physics)}. ${esc(r.identity.rules)}</p></details></div><strong>${formatTime(r.duration)}</strong><button data-record-key="${r.key}" data-record-track="${track.id}" data-record-ship="${ship.id}">Set up trial →<span class="sr-only"> ${esc(track.name)}, ${esc(ship.name)}</span></button></li>`;
          })
          .join('')}</ol>`
      : `<div class="records-empty"><h2>${known.length ? 'No records match these filters.' : 'Your first best starts here.'}</h2><p>${known.length ? 'Choose another track or ship to see your saved times.' : 'Finish a ranked Time Trial to save your time and personal ghost. Manual recovery invalidates a run; automatic failed-jump recovery only costs time.'}</p><button data-action="record-trial" class="primary">Set up Time Trial →</button></div>`
  }<p class="records-help">${routes.filter((r) => r.closed !== false).length} circuits · ${routes.filter((r) => r.closed === false).length} sprints · ${SHIPS.length} ships. Records stay on this device and browser.</p></section>`;
}
