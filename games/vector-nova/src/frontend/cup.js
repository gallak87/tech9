import {
  CUPS,
  CUP_POINTS,
  cupDefinition,
  cupComplete,
  cupStandings,
  cupRaceRows,
} from '../race/cup.js';
import { SHIPS } from '../ships/catalog.js';
import { formatTime } from '../race/timing.js';
import { trackChallenge } from './track-challenge.js';
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
function raceTable(rows) {
  return `<table class="cup-table"><caption>Race classification</caption><thead><tr><th scope="col">Pos</th><th scope="col">Pilot</th><th scope="col">Time</th><th scope="col">Pts</th></tr></thead><tbody>${cupRaceRows(
    rows,
  )
    .map(
      (r) =>
        `<tr class="${r.id === 'player' ? 'you' : ''}"><td>${r.position ?? '—'}</td><th scope="row">${r.name}</th><td>${r.status === 'finished' ? time(r.timeMs) : r.status === 'dnf' ? 'DNF' : 'Invalid'}</td><td>+${r.points}</td></tr>`,
    )
    .join('')}</tbody></table>`;
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
      detail: 'Cup complete',
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
    ? `${tied ? 'Joint ' : ''}${player.position === 1 ? 'Cup champion.' : `Cup complete · ${player.position}/10`}`
    : cup.name;
  const route = `<ol class="cup-route" style="--cup-events:${cup.tracks.length}">${cup.tracks.map((id, i) => `<li ${state?.eventIndex === i ? 'aria-current="step"' : ''}><span>${i + 1}</span>${menu ? `<span class="cup-event-art">${menu.eventArt(id)}</span>` : ''}<strong>${esc(trackName(id))}</strong><small>${eventFormat(id)} · ${state?.results[i] ? 'Scored' : state?.eventIndex === i ? 'Current race' : state ? 'Up next' : trackChallenge(id)}</small></li>`).join('')}</ol>`;
  let actions;
  if (confirm) {
    actions = `<div class="cup-confirm" role="group" aria-label="Confirm ${confirm}"><p>${confirm === 'abandon' ? (complete ? 'Clear these final results and choose another cup? All saved scores for this cup will be deleted.' : 'Abandon this cup to choose another? All its saved scores and progress will be deleted.') : 'Restart this cup from race 1? All its scores will be cleared. Ship and difficulty stay the same.'}</p><div class="front-actions">${button('cup-confirm', confirm === 'abandon' ? 'Delete cup progress' : 'Clear scores and restart', true)}${button('cup-cancel', 'Keep this cup')}</div></div>`;
  } else if (!state) {
    actions = `<div class="front-actions">${button('cup-start', `Start ${esc(cup.name)} →`, true)}${button('home', 'Back to setup')}</div>`;
  } else {
    const next = state.phase === 'results' && !complete;
    actions = `<div class="front-actions cup-actions">${next ? button('cup-next', `Continue → ${esc(trackName(cup.tracks[state.eventIndex + 1]))}`, true) : state.phase === 'racing' ? button('cup-resume', `${live ? 'Resume' : 'Start'} race ${state.eventIndex + 1} →`, true) : button('home', 'Back to setup', true)}${button('cup-retry', `Retry race ${state.eventIndex + 1}`)}${button('cup-restart', 'Restart cup')}${button('cup-abandon', complete ? 'Choose another cup' : 'Abandon cup')}${complete ? '' : button('home', 'Save & return to setup')}</div><p class="cup-effects">Retry clears only race ${state.eventIndex + 1}; earlier scores stay. Restart clears all scores. Abandon deletes this cup. ${complete ? 'Final results remain saved until you retry, restart or abandon.' : 'Leaving keeps cup progress. After a reload, an unfinished race starts again from the grid.'}</p>`;
  }
  const scores = state?.results.length
    ? `<div class="cup-results-grid"><section>${state.results.map((rows, i) => `<details ${i === state.eventIndex ? 'open' : ''}><summary>Race ${i + 1} · ${esc(trackName(cup.tracks[i]))} · ${eventFormat(cup.tracks[i])}</summary>${raceTable(rows)}</details>`).join('')}</section><section><table class="cup-table cup-standings"><caption>${complete ? 'Final cup standings' : 'Cumulative standings'}</caption><thead><tr><th scope="col">Pos</th><th scope="col">Pilot</th><th scope="col">Pts</th><th scope="col">Wins</th><th scope="col">Total</th></tr></thead><tbody>${standings.map((r) => `<tr class="${r.id === 'player' ? 'you' : ''}"><td>${r.position}</td><th scope="row">${r.name}</th><td>${r.points}</td><td>${r.wins}</td><td>${r.unclassified ? 'Incomplete' : time(r.timeMs)}</td></tr>`).join('')}</tbody></table></section></div>`
    : '';
  const rules = `<details class="cup-rules"><summary>Scoring & saved progress</summary><p>Places 1–10 earn ${CUP_POINTS.join(' / ')} points. Ties use most wins, then lowest total time across every race. Exact ties share a cup place. An incomplete total loses the time tie-break to a complete total.</p><p>Two laps per circuit; one point-to-point descent per sprint. Both formats award the same placement points. After you finish, rivals have up to 30 race seconds to finish. DNF and invalid finishes earn 0 points and have no classified time. Automatic failed-jump recovery costs time; manual recovery invalidates the race.</p><p>You start race 1 in 10th place. Later grids follow the previous race’s results, with unclassified racers at the back. Retries keep the same starting grid.</p><p>One cup is saved at a time. ${state ? 'Clear or abandon this cup to choose another. ' : ''}Ship and difficulty stay fixed. Scores save when classification closes, and again when you continue. In-page Resume keeps the live attempt; reload restarts an unfinished race. Quick Race, Practice and Time Trials keep saved cup scores.</p></details>`;
  if (menu) {
    const picker = !state
      ? `<fieldset class="cup-picker" aria-label="Choose a championship">${CUPS.map((entry) => `<button data-cup="${entry.id}" aria-pressed="${cup.id === entry.id}">${esc(entry.name)}</button>`).join('')}</fieldset>`
      : '';
    const management = confirm
      ? actions
      : state
        ? `<div class="cup-management">${button('cup-retry', `Retry race ${state.eventIndex + 1}`)}${button('cup-restart', 'Restart cup')}${complete ? '' : button('cup-abandon', 'Abandon cup')}</div><p class="cup-effects">Retry clears this race; restart clears all scores; abandon deletes this cup.</p>`
        : '';
    return `<section class="cup-panel cup-menu-panel" aria-label="${esc(cup.name)}">${menu.hero(title)}${picker}${route}${notice ? `<p class="cup-save" role="status">${esc(notice)}</p>` : state ? '<p class="cup-save" role="status">Progress saved on this device. Ship and difficulty are locked for this cup.</p>' : ''}${management}${scores ? `<details class="cup-scores"><summary>Standings & race results · ${state.results.length}/${cup.tracks.length} scored</summary>${scores}</details>` : ''}${rules}${menu.actions ?? ''}</section>`;
  }
  return `<section class="cup-panel"><div class="front-heading"><span class="kicker">CHAMPIONSHIP / ${esc(cup.name.toUpperCase())}</span><h1 tabindex="-1">${title}</h1></div>${!state ? `<fieldset class="cup-picker"><legend>Choose a championship</legend>${CUPS.map((entry) => `<button data-cup="${entry.id}" aria-pressed="${cup.id === entry.id}">${esc(entry.name)}</button>`).join('')}</fieldset>` : ''}${route}<p class="cup-summary">${state ? `${esc(SHIPS.find((s) => s.id === state.shipId).name)} · ${state.difficulty} · locked for this cup · ${state.results.length}/${cup.tracks.length} races scored${complete ? ` · ${player.points} points` : ''}` : `${cup.tracks.length} races. Ten pilots. One championship.`}</p>${notice ? `<p class="cup-save" role="status">${esc(notice)}</p>` : state ? '<p class="cup-save" role="status">Cup progress saved on this device.</p>' : ''}${!state ? `<section class="cup-setup" aria-label="Cup setup"><fieldset><legend>Ship for all ${cup.tracks.length} races</legend>${SHIPS.map((s) => `<button data-ship="${s.id}" aria-pressed="${shipId === s.id}">${s.name}</button>`).join('')}</fieldset><fieldset><legend>Opponent difficulty</legend>${['easy', 'medium', 'hard'].map((d) => `<button data-difficulty="${d}" aria-pressed="${difficulty === d}">${d}</button>`).join('')}</fieldset></section>` : ''}${actions}${scores}${rules}</section>`;
}

export function cupWaitingView(data) {
  return `<section class="result-panel"><div class="front-heading"><span class="kicker">CUP / ${data.courseFormat === 'sprint' ? 'SPRINT' : 'RACE'} FINISH</span><h1 tabindex="-1">${data.playerValid ? 'Race finished.' : 'Unranked finish.'}</h1></div><p>Your time: ${formatTime(data.playerTotalTime)}</p><ol class="results-list" aria-label="Live race classification">${data.standings.map((r) => `<li class="${r.id === 'player' ? 'you' : ''}"><span>${r.finished && r.valid ? r.position : '—'}</span><b>${r.id === 'player' ? 'YOU' : esc(r.name)}</b><span>${r.finished ? (r.valid ? formatTime(r.totalTime) : 'INVALID') : 'ON TRACK'}</span></li>`).join('')}</ol><p class="results-note" role="status">Waiting for the field · up to ${data.remaining}s. Scores save when classification closes. Unfinished racers receive 0 points.</p><div class="front-actions">${button('cup-retry', 'Retry this race')}${button('cup-hub', 'Cup hub · pause waiting')}</div></section>`;
}
