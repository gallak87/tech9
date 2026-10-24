import {
  CUPS,
  cupDefinition,
  cupComplete,
  cupStandings,
  cupRaceRows,
  cupChampion,
  cupGridOrder,
} from '../race/cup.js';
import { cupCard } from './cup-art.js';
import { SHIPS } from '../ships/catalog.js';
import { formatTime } from '../race/timing.js';
import { trackChallenge } from './track-challenge.js';
import { assetURL } from '../assets/url.js';
const esc = (value) =>
  String(value).replace(
    /[&<>"']/g,
    (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[
        c
      ],
  );
const button = (action, label, primary = false) =>
  `<button data-action="${action}" class="${primary ? 'primary' : ''}">${label}</button>`;
const time = (ms) => formatTime(ms == null ? null : ms / 1000);
// Preserve the actual ranks when showing the player's part of the field.
function nearby(rows, complete = false) {
  const player = rows.findIndex((row) => row.id === 'player');
  return complete ? rows : rows.slice(Math.max(0, player - 2), player + 3);
}
function raceTable(rows, complete) {
  return `<table class="cup-table"><caption>Race classification</caption><thead><tr><th scope="col">Pos</th><th scope="col">Pilot</th><th scope="col">Time</th><th scope="col">Pts</th></tr></thead><tbody>${nearby(
    cupRaceRows(rows),
    complete,
  )
    .map(
      (r) =>
        `<tr class="${r.id === 'player' ? 'you' : ''}"><td>${r.position ?? '—'}</td><th scope="row">${r.name}</th><td>${r.status === 'finished' ? time(r.timeMs) : r.status === 'dnf' ? 'DNF' : 'Invalid'}</td><td>+${r.points}</td></tr>`,
    )
    .join('')}</tbody></table>`;
}
function standingsTable(rows, complete) {
  return `<table class="cup-table cup-standings"><caption>${complete ? 'Final cup standings' : 'Cup standings'}</caption><thead><tr><th scope="col">Pos</th><th scope="col">Pilot</th><th scope="col">Pts</th></tr></thead><tbody>${nearby(
    rows,
    complete,
  )
    .map(
      (r) =>
        `<tr class="${r.id === 'player' ? 'you' : ''}"><td>${r.position}</td><th scope="row">${esc(r.name)}</th><td>${r.points}</td></tr>`,
    )
    .join('')}</tbody></table>`;
}
function confirmation(action, complete) {
  const abandon = action === 'abandon';
  return `<div class="cup-confirm" role="group" aria-label="Confirm ${action}"><p><strong>${abandon ? (complete ? 'Clear this cup’s results?' : 'Abandon this cup?') : 'Restart this cup?'}</strong> Saved scores will be deleted.</p><div class="front-actions">${button('cup-cancel', 'Cancel')}${button('cup-confirm', abandon ? (complete ? 'Clear results' : 'Abandon cup') : 'Restart cup', true)}</div></div>`;
}

function gridSummary(state, cup) {
  if (cupComplete(state)) return '';
  const next = state?.phase === 'results';
  const position = cupGridOrder(state, { next }).indexOf('player') + 1;
  const hint =
    cup.id === 'apex'
      ? 'Earn the front rows through sustained podium finishes.'
      : 'Strong finishes move you forward; poor results set you back.';
  return `<p class="cup-summary cup-grid-progress"><strong>${next ? 'Next grid' : 'Starting grid'}: P${String(position).padStart(2, '0')} / 10</strong> · ${hint}</p>`;
}

function resultsView({
  state,
  cup,
  title,
  complete,
  standings,
  trackName,
  eventFormat,
  routes,
  notice,
  confirm,
}) {
  const race = cupRaceRows(state.results[state.eventIndex]);
  const player = race.find((row) => row.id === 'player');
  const route = `<ol class="cup-route" style="--cup-events:${cup.tracks.length}">${cup.tracks
    .map((id, i) => {
      const preview = routes.find((entry) => entry.id === id)?.preview;
      return `<li ${state.eventIndex === i ? 'aria-current="step"' : ''} class="${state.results[i] ? 'scored' : ''}">${preview ? `<img src="${esc(assetURL(preview))}" alt="">` : ''}<span class="cup-event-number">${String(i + 1).padStart(2, '0')}</span><strong>${esc(trackName(id))}</strong><small>${eventFormat(id)} · ${state.results[i] ? 'Scored' : i === state.eventIndex + 1 ? 'Up next' : 'Upcoming'}</small></li>`;
    })
    .join('')}</ol>`;
  const actions = confirm
    ? confirmation(confirm, complete)
    : `<div class="cup-result-actions"><div class="front-actions">${complete ? button('cup-abandon', 'Choose another cup →', true) : button('cup-next', 'Next race →', true)}${button('cup-retry', 'Retry race')}${button('home', 'Back to setup')}</div><details class="cup-options"><summary>Cup options</summary><div class="front-actions">${button('cup-restart', 'Restart cup')}${complete ? '' : button('cup-abandon', 'Abandon cup')}</div></details></div>`;
  return `<section class="cup-panel cup-results-panel" aria-label="${esc(cup.name)}"><div class="cup-result-heading"><div class="front-heading"><span class="kicker">${complete ? esc(cup.name.toUpperCase()) + ' / FINAL' : `CHAMPIONSHIP / RACE ${state.eventIndex + 1} OF ${cup.tracks.length}`}</span><h1 tabindex="-1">${title}</h1></div><dl class="cup-personal"><div><dt>Race finish</dt><dd>${player.position ? `<span class="cup-place-prefix">P</span>${String(player.position).padStart(2, '0')}` : player.status === 'dnf' ? 'DNF' : 'Invalid'}</dd></div><div><dt>Points</dt><dd>+${player.points}</dd></div><div><dt>Race time</dt><dd class="cup-personal-time">${player.status === 'finished' ? time(player.timeMs) : '—'}</dd></div></dl></div>${gridSummary(state, cup)}${route}${notice ? `<p class="cup-save" role="status">${esc(notice)}</p>` : ''}${standingsTable(standings, complete)}<details class="cup-race-details"><summary>Race results</summary>${state.results.map((rows, i) => `<section><h2>Race ${i + 1} · ${esc(trackName(cup.tracks[i]))}</h2>${raceTable(rows, complete)}</section>`).join('')}</details>${actions}</section>`;
}
// The primary action follows the saved championship phase.
export function cupLaunch(state, cupId, live = false) {
  const cup = cupDefinition(state?.cupId ?? cupId);
  if (!state)
    return {
      action: 'cup-start',
      label: 'Start cup →',
      detail: `${cup.tracks.length} races · 9 rivals`,
    };
  if (cupComplete(state))
    return {
      action: 'cup-abandon',
      label: 'Choose another cup →',
      detail: cupChampion(state) ? 'Cup champion' : 'Final standings',
    };
  if (state.phase === 'results')
    return {
      action: 'cup-next',
      label: 'Next race →',
      detail: `Race ${state.eventIndex + 2} / ${cup.tracks.length}`,
    };
  return {
    action: 'cup-resume',
    label: `${live ? 'Resume' : 'Start'} race →`,
    detail: `Race ${state.eventIndex + 1} / ${cup.tracks.length}`,
  };
}
export function cupView({
  state,
  notice,
  catalog,
  routes,
  shipId,
  difficulty,
  cupId = CUPS[0].id,
  live = false,
  confirm = null,
  menu = null,
  collection = {},
}) {
  const cup = cupDefinition(state?.cupId ?? cupId) ?? CUPS[0];
  const trackName = (id) => catalog.find((l) => l.id === id)?.name ?? id;
  const eventFormat = (id) =>
    routes.find((route) => route.id === id)?.closed === false
      ? 'Sprint · 1 descent'
      : 'Circuit · 2 laps';
  const complete = cupComplete(state);
  const standings = state ? cupStandings(state) : [];
  const player = standings.find((r) => r.id === 'player');
  const tied =
    complete &&
    standings.filter((r) => r.position === player.position).length > 1;
  const title = complete
    ? `${tied ? 'Joint ' : ''}${cupChampion(state) ? 'Cup champion.' : `Cup finished · ${player.position}/10`}`
    : cup.name;
  if (!menu && state?.phase === 'results')
    return resultsView({
      state,
      cup,
      title,
      complete,
      standings,
      trackName,
      eventFormat,
      routes,
      notice,
      confirm,
    });
  const route = `<ol class="cup-route" style="--cup-events:${cup.tracks.length}">${cup.tracks.map((id, i) => `<li ${state?.eventIndex === i ? 'aria-current="step"' : ''}><span>${i + 1}</span>${menu ? `<span class="cup-event-art">${menu.eventArt(id)}</span>` : ''}<strong>${esc(trackName(id))}</strong><small>${eventFormat(id)} · ${state?.results[i] ? 'Scored' : state?.eventIndex === i ? 'Current race' : state ? 'Up next' : trackChallenge(id)}</small></li>`).join('')}</ol>`;
  let actions;
  if (confirm) {
    actions = confirmation(confirm, complete);
  } else if (!state) {
    actions = `<div class="front-actions">${button('cup-start', `Start ${esc(cup.name)} →`, true)}${button('home', 'Back to setup')}</div>`;
  } else {
    const next = state.phase === 'results' && !complete;
    actions = `<div class="front-actions cup-actions">${next ? button('cup-next', `Continue → ${esc(trackName(cup.tracks[state.eventIndex + 1]))}`, true) : state.phase === 'racing' ? button('cup-resume', `${live ? 'Resume' : 'Start'} race ${state.eventIndex + 1} →`, true) : button('home', 'Back to setup', true)}${button('cup-retry', `Retry race ${state.eventIndex + 1}`)}${button('cup-restart', 'Restart cup')}${button('cup-abandon', complete ? 'Choose another cup' : 'Abandon cup')}${complete ? '' : button('home', 'Save & return to setup')}</div>`;
  }
  const scores = state?.results.length
    ? `<div class="cup-results-grid"><section>${state.results.map((rows, i) => `<details><summary>Race ${i + 1} · ${esc(trackName(cup.tracks[i]))} · ${eventFormat(cup.tracks[i])}</summary>${raceTable(rows, complete)}</details>`).join('')}</section><section>${standingsTable(standings, complete)}</section></div>`
    : '';
  if (menu) {
    const picker = !state
      ? `<fieldset class="cup-picker" aria-label="Choose a championship">${CUPS.map((entry) => cupCard(entry, cup.id, collection)).join('')}</fieldset>`
      : '';
    const management = confirm
      ? actions
      : state
        ? `<div class="cup-management">${button('cup-retry', `Retry race ${state.eventIndex + 1}`)}${button('cup-restart', 'Restart cup')}${complete ? '' : button('cup-abandon', 'Abandon cup')}</div>`
        : '';
    return `<section class="cup-panel cup-menu-panel" aria-label="${esc(cup.name)}">${menu.hero(title)}${picker}${route}${gridSummary(state, cup)}${notice ? `<p class="cup-save" role="status">${esc(notice)}</p>` : ''}${management}${scores ? `<details class="cup-scores"><summary>Standings & race results · ${state.results.length}/${cup.tracks.length} scored</summary>${scores}</details>` : ''}${menu.actions ?? ''}</section>`;
  }
  return `<section class="cup-panel"><div class="front-heading"><span class="kicker">CHAMPIONSHIP / ${esc(cup.name.toUpperCase())}</span><h1 tabindex="-1">${title}</h1></div>${!state ? `<fieldset class="cup-picker"><legend>Choose a championship</legend>${CUPS.map((entry) => cupCard(entry, cup.id, collection)).join('')}</fieldset>` : ''}${route}${gridSummary(state, cup)}<p class="cup-summary">${state ? `${esc(SHIPS.find((s) => s.id === state.shipId).name)} · ${state.difficulty} · locked for this cup · ${state.results.length}/${cup.tracks.length} races scored${complete ? ` · ${player.points} points` : ''}` : `${cup.tracks.length} races · 10 pilots`}</p>${notice ? `<p class="cup-save" role="status">${esc(notice)}</p>` : ''}${!state ? `<section class="cup-setup" aria-label="Cup setup"><fieldset><legend>Ship for all ${cup.tracks.length} races</legend>${SHIPS.map((s) => `<button data-ship="${s.id}" aria-pressed="${shipId === s.id}">${s.name}</button>`).join('')}</fieldset><fieldset><legend>Opponent difficulty</legend>${['easy', 'medium', 'hard'].map((d) => `<button data-difficulty="${d}" aria-pressed="${difficulty === d}">${d}</button>`).join('')}</fieldset></section>` : ''}${actions}${scores}</section>`;
}

function waitingRows(data) {
  return nearby(data.standings)
    .map(
      (r) =>
        `<li class="${r.id === 'player' ? 'you' : ''}"><span>${r.finished && r.valid ? r.position : '—'}</span><b>${r.id === 'player' ? 'YOU' : esc(r.name)}</b><span>${r.finished ? (r.valid ? formatTime(r.totalTime) : 'INVALID') : 'ON TRACK'}</span></li>`,
    )
    .join('');
}
const waitingNote = (data) => `Waiting for the field · ${data.remaining}s`;
export function cupWaitingView(data) {
  return `<section class="result-panel cup-waiting"><div class="front-heading"><span class="kicker">CUP / ${data.courseFormat === 'sprint' ? 'SPRINT' : 'RACE'} FINISH</span><h1 tabindex="-1">${data.playerValid ? 'Race finished.' : 'Unranked finish.'}</h1></div><p>Your time: ${formatTime(data.playerTotalTime)}</p><ol class="results-list" aria-label="Live race classification">${waitingRows(data)}</ol><p class="results-note" role="status">${waitingNote(data)}</p><div class="front-actions">${button('cup-retry', 'Retry this race')}${button('cup-hub', 'Cup hub · pause waiting')}</div></section>`;
}
export function updateCupWaitingView(panel, data) {
  // Keep the animated panel and focused controls mounted as rivals finish.
  const list = panel.querySelector('.results-list');
  const rows = waitingRows(data);
  if (list.innerHTML !== rows) list.innerHTML = rows;
  panel.querySelector('.results-note').textContent = waitingNote(data);
}
