import { discoverLevels } from '../levels/catalog.js';
import routes from 'virtual:menu-catalog';
import { RACE_FIELD_SIZE, RACE_OPPONENTS } from '../race/roster.js';
import {
  SHIPS,
  loadShipSelection,
  saveShipSelection,
} from '../ships/catalog.js';
import {
  loadSettings,
  saveSettings,
  subscribeSettings,
} from '../progression/index.js';
import { createMusicPlayer } from '../audio/player.js';
import { assetURL } from '../assets/url.js';
import { TRACK_CHALLENGES, trackChallenge } from './track-challenge.js';
import {
  artViewParameters,
  runtimeEntryParameters,
  readArtView,
} from '../core/art-pass.js';
import '../ui/style.css';
import './style.css';
import './menu.css';

const escape = (text) =>
  String(text).replace(
    /[&<>"']/g,
    (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[
        c
      ],
  );
const stamp = (seconds) =>
  seconds == null
    ? '—'
    : `${Math.floor(seconds / 60)}:${(seconds % 60).toFixed(3).padStart(6, '0')}`;
const button = (action, label, primary = false) =>
  `<button data-action="${action}" class="${primary ? 'primary' : ''}">${label}</button>`;
function routeArt(route) {
  return route
    ? `<svg viewBox="0 0 300 190" aria-label="Circuit outline"><path d="${route.path}"/><circle cx="${route.start[0]}" cy="${route.start[1]}" r="3.5"/></svg>`
    : '';
}
function picture(route, className = '') {
  return route?.preview
    ? `<img class="${className}" src="${assetURL(route.preview)}" alt="" loading="eager">`
    : '';
}

export function createFrontend(host) {
  const catalog = discoverLevels().list;
  const circuits = catalog;
  const parameters = new URLSearchParams(location.search);
  const artPass = parameters.get('artPass') === '1';
  const inspectShip = !artPass && parameters.get('inspect') === '1';
  let special =
    artPass ||
    inspectShip ||
    parameters.has('review') ||
    parameters.has('test') ||
    parameters.has('capture');
  const requested = parameters.get('level');
  let invalidLevel =
    requested && !catalog.some((level) => level.id === requested);
  let selected =
    requested || (parameters.get('test') === 'jump' ? 'saffron' : null);
  if (!selected) {
    try {
      selected = localStorage.getItem('vector-nova.circuit');
    } catch {
      /* Optional storage. */
    }
  }
  if (!catalog.some((level) => level.id === selected)) selected = catalog[0].id;
  let screen = 'home',
    intent = 'race';
  let previewLevelId = selected;
  let previewShipId = null;
  let shipId =
      (inspectShip && SHIPS.find((s) => s.id === parameters.get('ship')))?.id ??
      loadShipSelection().id,
    settings = loadSettings();
  let game = null,
    loadedId = null,
    pending = null,
    controller = null,
    generation = 0;
  let progress = '',
    error = '',
    launching = false,
    launchGeneration = 0,
    resultsKey = '',
    lastResults = null;
  let settingsBack = 'home',
    launchBack = 'home',
    launchTarget = 'race',
    inspectionBack = null;
  let cacheModule, unsubscribeCache, unsubscribeSettings;
  let preload = {
    ready: 0,
    total: SHIPS.length,
    fraction: 0,
    label: 'Preparing fleet',
  };
  let loadStep = 0;
  const loadStages = [
    'Reading circuit',
    'Preparing route',
    'Preparing graphics',
    'Building world',
    'Building road',
    'Building environment',
    'Preparing ships',
    'Warming graphics',
    'Ready',
  ];
  let shipPreview = null,
    previewGeneration = 0;
  const life = new AbortController();
  // Match CSS: one picker at a time beside the menu, separate pages below.
  const wideMenu = matchMedia('(min-width: 900px)');
  const choosingSession = () => ['home', 'circuits', 'setup'].includes(screen);
  const showingShip = () => screen === 'setup';
  host.innerHTML =
    '<div id="game-host"></div><div id="front-shell"></div><aside class="transfer-status" aria-label="Loading status"><span role="status"></span><progress max="1" value="0"></progress><button type="button" class="retry-fleet" hidden>Retry fleet preload</button></aside>';
  const transfer = host.querySelector('.transfer-status');
  const gameHost = host.querySelector('#game-host');
  const shell = host.querySelector('#front-shell');
  const music =
    artPass || inspectShip || parameters.get('music') === '0'
      ? null
      : createMusicPlayer(host, {
          clearInput: () => game?.clearInput(),
          isMenuVisible: () => !shell.hidden,
        });
  const level = () => catalog.find((l) => l.id === selected);
  const route = (id = selected) => routes.find((r) => r.id === id);
  const selectedShip = () => SHIPS.find((s) => s.id === shipId);
  const ship = () => SHIPS.find((s) => s.id === (previewShipId ?? shipId));
  const isSprint = (id = selected) => route(id)?.closed === false;
  const sessionName = (id = selected, practice = intent === 'practice') =>
    isSprint(id)
      ? practice
        ? 'Solo Descent'
        : 'Downhill Sprint'
      : practice
        ? 'Practice'
        : 'Quick Race';
  const loadedLevel = () => catalog.find((l) => l.id === loadedId) ?? level();
  const difficultyControls = () =>
    `<fieldset class="race-difficulty"><legend>Opponent difficulty</legend>${['easy', 'medium', 'hard'].map((d) => `<button data-difficulty="${d}" aria-pressed="${settings.difficulty === d}" tabindex="${settings.difficulty === d ? 0 : -1}">${d}</button>`).join('')}</fieldset>`;
  const facts = () =>
    `<span>${route() ? (route().length / 1000).toFixed(2) + ' KM' : 'CIRCUIT'}</span><span>${route()?.closed === false ? 'POINT TO POINT' : intent === 'practice' ? 'OPEN PRACTICE' : '2 LAPS'}</span><span>${intent === 'practice' ? 'SOLO' : `${RACE_FIELD_SIZE} PILOTS`}</span>`;
  function remember() {
    try {
      localStorage.setItem('vector-nova.circuit', selected);
    } catch {
      /* Optional storage. */
    }
    const url = new URL(location.href);
    url.searchParams.set('level', selected);
    if (!special)
      for (const flag of [
        ...runtimeEntryParameters,
        'artPass',
        ...artViewParameters,
      ])
        url.searchParams.delete(flag);
    history.replaceState(null, '', url);
  }
  function setScreen(next) {
    const navigating = screen !== next;
    screen = next;
    previewShipId = null;
    previewLevelId = selected;
    if (!showingShip()) {
      previewGeneration++;
      shipPreview?.dispose();
      shipPreview = null;
    }
    document.body.classList.toggle('reduced-motion', settings.reducedMotion);
    shell.hidden = ['race', 'inspection', 'review'].includes(next);
    document.body.classList.toggle('developer-entry', special);
    gameHost.inert = !shell.hidden;
    game?.setSuspended(
      !['race', 'inspection', 'review', 'results'].includes(next),
    );
    document.body.dataset.screen = next;
    music?.setDriving(next === 'race');
    render();
    if (navigating) shell.scrollTop = 0;
    const focus =
      next === 'circuits'
        ? `[data-level="${selected}"]`
        : next === 'setup'
          ? `button[data-ship="${shipId}"]`
          : next === 'home'
            ? '[data-action="launch"]'
            : next === 'settings'
              ? '[data-action="settings-back"]'
              : 'h1';
    shell.querySelector(focus)?.focus({ preventScroll: true });
    if (next === 'circuits')
      shell.querySelector(focus)?.scrollIntoView({ block: 'nearest' });
    updateStatus();
  }
  function heading(kicker, title) {
    return `<div class="front-heading"><span class="kicker">${kicker}</span><h1 tabindex="-1">${title}</h1></div>`;
  }
  const trackBadge = (id) =>
    `<span class="track-type-badge" data-type="${isSprint(id) ? 'sprint' : 'circuit'}">${isSprint(id) ? 'Sprint' : 'Circuit'}</span>`;
  const trackCard = (l) => {
    const challenge = trackChallenge(l.id);
    return `<button class="circuit-card ${l.id === selected ? 'selected' : ''}" data-level="${l.id}" tabindex="${l.id === selected ? 0 : -1}" aria-pressed="${l.id === selected}" title="${escape(l.name)}" aria-label="${escape(l.name)}, ${challenge}, ${isSprint(l.id) ? 'downhill sprint' : 'circuit'}. Select track."><span class="track-icon">${picture(route(l.id))}${routeArt(route(l.id))}</span><span class="card-name"><span class="card-title">${escape(l.name)}</span></span>${trackBadge(l.id)}<span class="track-selected" aria-hidden="true">${l.id === selected ? '✓' : ''}</span></button>`;
  };
  const circuitPanel = () => {
    const groups = new Map();
    for (const track of circuits.toSorted(
      (a, b) =>
        TRACK_CHALLENGES.indexOf(trackChallenge(a.id)) -
        TRACK_CHALLENGES.indexOf(trackChallenge(b.id)),
    )) {
      const challenge = trackChallenge(track.id);
      const group = challenge === 'Warm-up' ? 'Easy' : challenge;
      if (!groups.has(group)) groups.set(group, []);
      groups.get(group).push(track);
    }
    return `<section class="circuit-picker-panel" aria-label="Choose a track"><div class="circuit-hero" aria-live="polite"></div><div class="circuit-grid" role="group" aria-label="Tracks">${[
      ...groups,
    ]
      .map(
        ([challenge, tracks]) =>
          `<div class="track-group" data-challenge="${challenge.toLowerCase()}" role="group" aria-label="${challenge === 'Easy' ? 'Warm-up and Easy' : challenge} tracks"><span class="track-group-label" aria-hidden="true">${challenge}</span>${tracks.map(trackCard).join('')}</div>`,
      )
      .join(
        '',
      )}</div><p class="picker-hint">Sprints are downhill, point to point.</p><div class="transfer-slot track-transfer"></div></section>`;
  };
  // Share one intrinsic text area: the longest wrapped description reserves
  // space for every ship without fixed heights, clipping or resize handlers.
  const shipDescription = () =>
    `<p class="ship-description">${SHIPS.map(
      (s) =>
        `<span${s.id === ship().id ? '' : ' aria-hidden="true"'}>${escape(s.description)}</span>`,
    ).join('')}</p>`;
  const shipPanel = (withActions = false) =>
    `<div class="setup-layout"><section class="ship-list" aria-label="Choose ship">${SHIPS.map((s, i) => `<button data-ship="${s.id}" aria-pressed="${s.id === shipId}" tabindex="${s.id === shipId ? 0 : -1}" class="${s.id === shipId ? 'selected' : ''}"><span>0${i + 1}</span><div><strong>${s.name}</strong><small>${s.role}</small></div></button>`).join('')}</section><section class="ship-details"><span class="kicker">${escape(ship().design)}</span><h2>${ship().name}<small>${previewShipId ? 'PREVIEW' : 'SELECTED SHIP'}</small></h2><div class="ship-preview-slot"><p role="status">Loading ship preview…</p></div><div class="transfer-slot ship-transfer"></div>${shipDescription()}</section><aside class="setup-details"><span class="kicker">PERFORMANCE / ${ship().role.toUpperCase()}</span><div class="ship-metrics">${[
      [
        'Cruise',
        Math.round(ship().handling.cruiseSpeed * 3.6),
        'KM/H',
        ship().handling.cruiseSpeed / 140,
      ],
      [
        'Acceleration',
        ship().handling.thrust,
        'M/S²',
        ship().handling.thrust / 55,
      ],
      [
        'Handling',
        ((ship().handling.turn / 1.3) * 10).toFixed(1),
        '/ 10',
        ship().handling.turn / 1.3,
      ],
      [
        'Braking',
        ((ship().handling.braking / 100) * 10).toFixed(1),
        '/ 10',
        ship().handling.braking / 100,
      ],
      [
        'Boost reserve',
        (100 / ship().handling.boostDrain).toFixed(1),
        'SEC',
        15 / ship().handling.boostDrain,
      ],
    ]
      .map(
        ([n, v, u, f]) =>
          `<div><span>${n}</span><b>${v} <small>${u}</small></b><i style="--stat:${Math.min(100, f * 100)}%"></i></div>`,
      )
      .join(
        '',
      )}</div><p class="stat-note">Handling and braking are relative ratings.</p></aside>${withActions ? pickerRaceActions() : ''}</div>`;
  const launchLabel = () => (isSprint() ? 'Start descent →' : 'Start race →');
  const raceActions = () =>
    `<div class="race-actions"><button class="primary" data-action="launch"><strong>${isSprint() ? 'Sprint' : 'Race'}</strong><small>${isSprint() ? 'One descent' : '2 laps'} · ${RACE_OPPONENTS.length} rivals</small><span aria-hidden="true">→</span></button>${difficultyControls()}<button data-action="practice"><strong>${isSprint() ? 'Solo descent' : 'Practice'}</strong><small>${isSprint() ? 'Summit to finish' : 'Solo · open laps'}</small></button></div>`;
  function pickerRaceActions() {
    return `<div class="picker-race-actions"><button class="change-track" data-action="circuits">${escape(level().name)} · ${trackChallenge(selected)} <span aria-hidden="true">↗</span></button>${raceActions()}</div>`;
  }
  const homeMenu = () =>
    `<section class="race-menu" aria-label="Race setup"><h1 class="menu-wordmark">VECTOR<span>//</span>NOVA</h1><button class="menu-selection" data-action="circuits"><span>Track</span><div><strong>${escape(level().name)}</strong><small>${trackChallenge(selected)} · ${isSprint() ? 'Downhill sprint' : 'Circuit'}</small></div><b aria-hidden="true">›</b></button><button class="menu-selection" data-action="ship-step"><span>Ship</span><div><strong>${selectedShip().name}</strong><small>${selectedShip().role}</small></div><b aria-hidden="true">›</b></button>${raceActions()}<div class="menu-extras">${button('inspect', 'Ship inspector')}</div><nav class="menu-links" aria-label="Preferences">${button('settings', 'Settings')}</nav><div class="transfer-slot menu-transfer"></div>${game?.hasSession() ? `<aside class="session-return">${button('resume-session', `↶ Resume ${escape(loadedLevel().name)}`)}</aside>` : ''}</section>`;
  function renderMenu() {
    const wide = wideMenu.matches;
    const picking = wide || screen !== 'home';
    const setup = screen === 'setup';
    shell.className = 'cinematic-menu';
    shell.innerHTML = `<div class="menu-backdrop" aria-hidden="true">${picture(route())}</div><main class="front-content menu-layout ${wide ? 'menu-wide' : 'menu-narrow'}" data-page="${screen}">${wide || !picking ? homeMenu() : ''}${picking ? `<section class="menu-picker ${setup ? 'menu-ship-picker' : 'menu-track-picker'}" aria-label="${setup ? 'Ship' : 'Track'} selection">${wide ? `<nav class="picker-tabs" aria-label="Setup view"><button data-action="circuits" aria-pressed="${!setup}">Tracks</button><button data-action="ship-step" aria-pressed="${setup}">Ship</button></nav>` : `<header class="picker-header"><button class="front-brand" data-action="home">VECTOR<span>//</span>NOVA</button>${button('home', '← Back to race')}</header>`}${setup ? shipPanel(!wide) : circuitPanel()}</section>` : ''}</main>`;
    if (!setup && picking) showDetail(selected);
    if (showingShip()) mountShipPreview();
    shell
      .querySelector('.ship-transfer, .menu-transfer, .track-transfer')
      ?.append(transfer);
    updateLaunchSummary();
    updateStatus();
  }
  function render() {
    if (shell.hidden) return;
    if (choosingSession()) {
      renderMenu();
      return;
    }
    shell.className = screen === 'settings' ? 'settings-page' : '';
    const title = {
      circuits: wideMenu.matches ? 'RACE SETUP' : 'SELECT CIRCUIT',
      setup: wideMenu.matches ? 'RACE SETUP' : 'CHOOSE SHIP',
      loading:
        launchTarget === 'inspection' ? 'SHIP INSPECTOR' : 'PREPARING SESSION',
      settings: 'SETTINGS',
      results: 'SESSION COMPLETE',
    }[screen];
    const headerAction =
      screen === 'settings'
        ? button('settings-back', '← Back')
        : screen !== 'loading'
          ? button('settings', 'Settings')
          : '';
    const headerLabel =
      screen === 'settings'
        ? `<h1 class="header-label">${title}</h1>`
        : `<span class="header-label">${title}</span>`;
    shell.innerHTML = `<header class="front-header"><button class="front-brand" data-action="home" aria-label="Vector Nova circuits">VECTOR<span>//</span>NOVA</button>${headerLabel}${headerAction}</header><main class="front-content" data-page="${screen}"></main><footer class="front-footer"><span>${screen === 'circuits' ? 'ARROWS · BROWSE <i>/</i> ENTER · SELECT <i>/</i> TAB · CONTROLS' : `${sessionName(screen === 'results' ? loadedId : selected, screen !== 'results' && intent === 'practice').toUpperCase()} <i>/</i> ${escape((screen === 'results' ? loadedLevel() : level()).name.toUpperCase())}`}</span></footer>`;
    const main = shell.querySelector('.front-content');
    let content = main;
    if (screen === 'loading') {
      const inspecting = launchTarget === 'inspection';
      content.innerHTML = `<section class="loading-copy"><div class="loading-card">${picture(route())}${routeArt(route())}</div><div class="transfer-slot loading-transfer"></div>${heading(inspecting ? 'PREPARING STUDIO' : 'LOADING CIRCUIT', inspecting ? 'Ship inspector' : escape(level().name))}${inspecting ? '' : `<div class="session-facts">${facts()}</div>`}<div class="front-actions">${button('cancel', 'Cancel')}${button('retry', 'Try again', true)}</div></section>`;
    } else if (screen === 'settings') {
      content.innerHTML = `<div class="settings-layout"><section class="settings-form"><label><span>Graphics <small>High adds ambient occlusion and postprocessing. Low reduces GPU load.</small></span><select data-setting="quality"><option value="high">High</option><option value="low">Low</option></select></label><label><span>Effects volume <small>Tunes has its own volume control.</small></span><input data-setting="volume" type="range" min="0" max="1" step=".05" value="${settings.volume}"></label><label><span>Reduced motion <small>Reduces decorative motion and distortion.</small></span><input data-setting="reducedMotion" type="checkbox" ${settings.reducedMotion ? 'checked' : ''}></label><p>Saved on this device.</p></section><section class="keyboard-guide" aria-label="Keyboard shortcuts"><h2>Keyboard</h2>${[
        [
          'Driving',
          [
            ['WASD / Arrows', 'Throttle, brake and steer'],
            ['Shift', 'Boost'],
            ['Space', 'Airbrake'],
            ['Esc', 'Pause / resume'],
            ['R', 'Recover at checkpoint / retry finished sprint'],
            ['C', 'Change camera'],
          ],
        ],
        [
          'Menus',
          [
            ['Tab / Shift Tab', 'Move between controls'],
            ['Arrows', 'Preview circuits/ships; change difficulty'],
            ['Home / End', 'First / last item in a list'],
            ['Enter / Space', 'Select or activate'],
            ['Esc', 'Back / cancel loading'],
            ['S', 'Open settings'],
          ],
        ],
        [
          'Free camera',
          [
            ['F', 'Enter / leave free camera'],
            ['WASD / Arrows', 'Move'],
            ['Q / E', 'Move down / up'],
            ['Drag', 'Look around'],
            ['P', 'Toggle live dev tools / FPS'],
            ['Esc', 'Close dev tools, then leave free camera'],
          ],
        ],
        [
          'Tunes',
          [
            ['M', 'Play / pause'],
            [', / .', 'Previous / next track'],
            ['/', 'Expand player in menus / pause'],
          ],
        ],
      ]
        .map(
          ([title, rows]) =>
            `<h3>${title}</h3><dl>${rows.map(([key, label]) => `<div><dt><kbd>${key}</kbd></dt><dd>${label}</dd></div>`).join('')}</dl>`,
        )
        .join('')}</section></div>`;
      content.querySelector('select').value = settings.quality;
    } else if (screen === 'results') {
      const sprint = isSprint(loadedId);
      const player = lastResults?.standings.find(
        (entry) => entry.id === 'player',
      );
      const title = !lastResults?.playerValid
        ? 'Finish · untimed'
        : player?.position === 1
          ? 'Winner.'
          : 'Race finished.';
      content.innerHTML = `<section class="result-panel">${heading('FINISH / ' + escape(loadedLevel().name.toUpperCase()), title)}<div class="results-layout"><section class="result-personal"><span class="kicker">${lastResults?.playerValid ? 'RACE TIME' : 'UNRANKED RUN'}</span><strong>${stamp(lastResults?.playerTotalTime)}</strong><p>${lastResults?.playerValid ? `${sprint ? 'One descent' : `${lastResults.laps ?? 2} laps`} · ${escape(lastResults.difficulty ?? settings.difficulty)}` : `${sprint ? 'This descent' : 'A lap'} was invalidated. This run does not count toward classification.`}</p><div class="lap-splits">${(lastResults?.playerLapTimes ?? []).map((t, i) => `<span>${sprint ? 'DESCENT' : `LAP ${i + 1}`}<b>${stamp(t)}</b></span>`).join('')}</div></section><section><ol class="results-list" aria-label="Race classification" tabindex="0"></ol><p class="results-note" role="status"></p></section></div><div class="front-actions results-actions">${button('retry-race', 'Race again →', true)}${button('continue', 'Continue driving')}${button('change', 'Circuits')}</div></section>`;
      updateResults(lastResults);
    }
    const statusSlot = shell.querySelector('.transfer-slot');
    if (statusSlot) statusSlot.append(transfer);
    updateLaunchSummary();
    updateStatus();
  }
  function mountShipPreview() {
    const slot = shell.querySelector('.ship-preview-slot');
    if (!slot) return;
    if (shipPreview) {
      if (slot.firstElementChild !== shipPreview.element)
        slot.replaceChildren(shipPreview.element);
      void shipPreview.setShip(ship().id);
      return;
    }
    const token = ++previewGeneration;
    void import('./ship-preview.js')
      .then(({ createShipPreview }) => {
        if (
          token !== previewGeneration ||
          !showingShip() ||
          life.signal.aborted
        )
          return;
        shipPreview = createShipPreview();
        shell
          .querySelector('.ship-preview-slot')
          .replaceChildren(shipPreview.element);
        void shipPreview.setShip(ship().id);
      })
      .catch(() => {
        if (token !== previewGeneration || !showingShip()) return;
        slot.innerHTML = `<p role="status">Ship preview unavailable.</p>${button('retry-preview', 'Retry preview')}`;
      });
  }
  function showShip(id) {
    const next = id === shipId ? null : id;
    if (previewShipId === next) return;
    previewShipId = next;
    // Keep the buttons and studio renderer mounted while swapping the preview
    // details, so hover never steals focus or commits a chassis selection.
    const template = document.createElement('template');
    template.innerHTML = shipPanel();
    for (const selector of [
      '.ship-details > .kicker',
      '.ship-details > h2',
      '.ship-description',
      '.setup-details',
    ])
      shell
        .querySelector(selector)
        ?.replaceWith(template.content.querySelector(selector));
    mountShipPreview();
    shell.querySelector('.ship-transfer')?.append(transfer);
    updateStatus();
  }
  function showDetail(id) {
    const l = catalog.find((l) => l.id === id),
      r = route(id),
      node = shell.querySelector('.circuit-hero');
    if (!node) return;
    previewLevelId = id;
    node.innerHTML = `<div class="detail-image">${picture(r)}${routeArt(r)}${trackBadge(id)}<div class="track-caption"><h2>${escape(l.name)}</h2><p>${trackChallenge(id)} · ${r ? (r.length / 1000).toFixed(2) + ' km' : '—'}</p></div></div>`;
  }
  function selectCircuit(id) {
    invalidLevel = false;
    selected = id;
    remember();
    render();
    shell
      .querySelector(`[data-level="${selected}"]`)
      ?.focus({ preventScroll: true });
  }
  function updateLaunchSummary() {
    const launch = shell.querySelector('[data-action="launch"]');
    if (launch)
      launch.setAttribute(
        'aria-label',
        `${launchLabel()} ${level().name}, ${selectedShip().name}, ${settings.difficulty} opponents`,
      );
  }
  function updateStatus() {
    const loading = screen === 'loading';
    const label = loading
      ? error || `${level().name} · ${progress || 'Preparing session'}`
      : preload.label;
    const fraction = loading
      ? loadStep / (loadStages.length - 1)
      : preload.fraction;
    transfer.hidden = !(
      loading ||
      (choosingSession() &&
        (preload.ready < preload.total || preload.failed?.length))
    );
    transfer.querySelector('span').textContent = label;
    const meter = transfer.querySelector('progress');
    meter.value = fraction;
    meter.setAttribute('aria-label', label);
    meter.setAttribute(
      'aria-valuetext',
      loading ? progress : `${preload.ready} of ${preload.total} ships ready`,
    );
    transfer.classList.toggle(
      'failed',
      loading ? !!error : !!preload.failed?.length,
    );
    transfer.querySelector('.retry-fleet').hidden =
      loading || preload.loading || !preload.failed?.length;
    const retry = shell.querySelector('[data-action="retry"]');
    if (retry) retry.hidden = !error || !!invalidLevel;
    shell.querySelector('.loading-card')?.classList.toggle('failed', !!error);
  }
  function updateResults(data) {
    if (!data) return;
    lastResults = data;
    const key = JSON.stringify(
      data.standings.map((e) => [
        e.id,
        e.position,
        e.finished,
        e.valid,
        e.totalTime,
      ]),
    );
    const list = shell.querySelector('.results-list');
    if (!list || (key === resultsKey && list.children.length)) return;
    resultsKey = key;
    list.innerHTML = data.standings
      .map(
        (e) =>
          `<li class="${e.id === 'player' ? 'you' : ''}"><span>${e.position == null || (e.finished && !e.valid) ? '—' : String(e.position).padStart(2, '0')}</span><b>${e.id === 'player' ? 'YOU' : escape(e.name)}</b><span>${e.finished ? (e.valid ? stamp(e.totalTime) : 'UNTIMED') : 'ON TRACK'}</span></li>`,
      )
      .join('');
    const note = shell.querySelector('.results-note');
    if (note)
      note.textContent = data.standings.some((entry) => !entry.finished)
        ? 'Classification updates as the field finishes.'
        : 'Final classification';
  }
  // Serialize world creation/disposal. A cancelled factory must finish unwinding
  // before the next renderer can acquire GPU resources; music is never disposed here.
  async function prepare() {
    if (game && loadedId === selected) return game;
    if (pending?.id === selected && !pending.signal.aborted)
      return pending.promise;
    const token = ++generation,
      id = selected,
      previous = pending?.promise;
    controller?.abort();
    controller = new AbortController();
    const signal = controller.signal;
    error = '';
    progress = 'Reading circuit';
    loadStep = 0;
    updateStatus();
    const promise = (async () => {
      await previous?.catch(() => {});
      signal.throwIfAborted();
      game?.dispose();
      game = null;
      loadedId = null;
      gameHost.replaceChildren();
      if (special && artPass) readArtView(parameters);
      const { createGame } = await import('../core/game.js');
      signal.throwIfAborted();
      const params = special
        ? new URLSearchParams(parameters)
        : new URLSearchParams();
      params.set('level', id);
      // An art pass inspects the finished environment, never a route study or
      // jump-test scene accidentally retained in a copied URL.
      if (artPass || inspectShip)
        for (const flag of runtimeEntryParameters) params.delete(flag);
      const created = await createGame({
        host: gameHost,
        parameters: params,
        signal,
        onProgress(stage) {
          if (token === generation) {
            progress = stage;
            loadStep = Math.max(loadStep, loadStages.indexOf(stage));
            updateStatus();
          }
        },
        onHome(info) {
          if (info?.error) {
            controller?.abort();
            game?.dispose();
            game = null;
            loadedId = null;
            error = info.error.message;
            setScreen('loading');
          } else {
            const destination =
              inspectionBack ?? (screen === 'inspection' ? 'setup' : 'home');
            const fromInspector = inspectionBack !== null;
            inspectionBack = null;
            if (fromInspector && game && !game.hasSession())
              shipId = game.getSnapshot().ship.id;
            if (screen !== 'inspection' || inspectShip) leaveReview();
            setScreen(destination);
            if (fromInspector)
              shell
                .querySelector('[data-action="inspect"]')
                ?.focus({ preventScroll: true });
          }
        },
        onCircuit(next) {
          leaveReview();
          selected = next;
          remember();
          setScreen('circuits');
        },
        onMode(mode) {
          if (screen === 'loading') return;
          if (special && ['title', 'overview'].includes(mode)) {
            setScreen('review');
            return;
          }
          if (
            ['racing', 'countdown', 'paused', 'fly', 'inspection'].includes(
              mode,
            )
          ) {
            game?.setSuspended(false);
            music?.setDriving(['racing', 'countdown'].includes(mode));
            if (screen !== 'results') {
              screen = mode === 'inspection' ? 'inspection' : 'race';
              shell.hidden = true;
              gameHost.inert = false;
              document.body.dataset.screen = screen;
              updateStatus();
            }
          }
        },
        onResults(data) {
          lastResults = data;
          if (screen === 'race' || screen === 'review') setScreen('results');
          else if (screen === 'results') updateResults(data);
        },
      });
      if (signal.aborted || token !== generation) {
        created.dispose();
        throw new DOMException('Cancelled', 'AbortError');
      }
      game = created;
      loadedId = id;
      game.setSuspended(
        !['race', 'inspection', 'review', 'results'].includes(screen),
      );
      updateStatus();
      return game;
    })()
      .catch((e) => {
        if (e.name !== 'AbortError' && token === generation) {
          error = e.message;
          updateStatus();
        }
        throw e;
      })
      .finally(() => {
        if (pending?.token === token) pending = null;
      });
    pending = { id, promise, signal, token };
    return promise;
  }
  async function loadView(target, enter) {
    if (launching) return;
    // A retry from Loading keeps the original menu view as its destination.
    if (choosingSession()) launchBack = screen;
    launching = true;
    launchTarget = target;
    const attempt = ++launchGeneration;
    if (target === 'race') music?.startWithGame();
    error = '';
    progress = 'Reading circuit';
    loadStep = 0;
    setScreen('loading');
    try {
      // Inspection borrows a retained world without replacing its active run,
      // even when the menu is currently browsing a different track.
      const current = target === 'inspection' && game ? game : await prepare();
      if (attempt !== launchGeneration || screen !== 'loading') return;
      current.configure(settings);
      if (target === 'race') current.prepareSession();
      if (
        !current.hasSession() &&
        current.getSnapshot().ship.id !== shipId &&
        !(await current.selectShip(shipId))
      )
        throw new Error('Ship could not be loaded. Try again.');
      if (attempt !== launchGeneration || screen !== 'loading') return;
      enter(current);
    } catch (e) {
      if (attempt === launchGeneration && e.name !== 'AbortError') {
        error = e.message;
        updateStatus();
      }
    } finally {
      if (attempt === launchGeneration) launching = false;
    }
  }
  function openInspector() {
    return loadView('inspection', (current) => {
      inspectionBack = launchBack;
      // Enter the studio while still suspended: menu inspection never exposes
      // the world or shares a callback with Race/Practice, including on retry.
      current.inspect({ fromMenu: true });
      setScreen('inspection');
    });
  }
  function launch() {
    return loadView('race', (current) => {
      setScreen('race');
      if (intent === 'practice') current.practice();
      else current.start();
    });
  }
  function cancel(destination = invalidLevel ? 'home' : launchBack) {
    generation++;
    launchGeneration++;
    launching = false;
    controller?.abort();
    error = '';
    progress = '';
    if (special) leaveReview();
    setScreen(destination);
  }
  function leaveReview() {
    if (!special) return;
    special = false;
    generation++;
    launchGeneration++;
    controller?.abort();
    game?.dispose();
    game = null;
    loadedId = null;
    remember();
  }
  async function launchSpecial() {
    const attempt = ++launchGeneration;
    setScreen('loading');
    try {
      const current = await prepare();
      if (attempt !== launchGeneration || screen !== 'loading') return;
      if (inspectShip) {
        const loaded =
          current.getSnapshot().ship.id === shipId ||
          (await current.selectShip(shipId));
        if (attempt !== launchGeneration || screen !== 'loading') return;
        if (!loaded) throw new Error('Ship could not be loaded. Try again.');
        setScreen('inspection');
        current.inspect();
      } else {
        setScreen('review');
        if (artPass) {
          current.setFlyView(readArtView(parameters));
          current.openDevTools();
        }
      }
    } catch (cause) {
      if (attempt === launchGeneration && cause.name !== 'AbortError') {
        error = cause.message;
        setScreen('loading');
      }
    }
  }
  function goHome() {
    if (screen === 'loading') {
      cancel('home');
      return;
    }
    if (game) game.returnToSetup();
    else leaveReview();
    setScreen('home');
  }
  const actions = {
    home: goHome,
    'resume-session'() {
      if (!game?.hasSession()) return;
      setScreen('race');
      game.resumeSession();
    },
    practice() {
      intent = 'practice';
      remember();
      void launch();
    },
    circuits() {
      setScreen('circuits');
    },
    'ship-step'() {
      remember();
      setScreen('setup');
    },
    settings() {
      if (screen === 'settings') return;
      settingsBack = screen;
      setScreen('settings');
    },
    'settings-back'() {
      const destination = settingsBack;
      setScreen(destination);
      if (destination === 'results') game?.showResults();
    },
    launch() {
      intent = 'race';
      remember();
      void launch();
    },
    inspect() {
      void openInspector();
    },
    'retry-preview'() {
      mountShipPreview();
    },
    cancel,
    retry() {
      if (special) void launchSpecial();
      else if (launchTarget === 'inspection') void openInspector();
      else void launch();
    },
    'retry-race'() {
      setScreen('race');
      game.restartRace();
    },
    change() {
      game?.returnToSetup();
      setScreen('circuits');
    },
    continue() {
      setScreen('race');
      game.continueDriving();
    },
  };
  shell.addEventListener(
    'click',
    (e) => {
      const el = e.target.closest('button');
      if (!el || el.disabled) return;
      if (el.dataset.level) {
        selectCircuit(el.dataset.level);
      } else if (el.dataset.ship) {
        previewShipId = null;
        shipId = el.dataset.ship;
        saveShipSelection(shipId);
        render();
        shell.querySelector(`[data-ship="${shipId}"]`)?.focus();
      } else if (el.dataset.difficulty) {
        settings.difficulty = el.dataset.difficulty;
        saveSettings(settings);
        render();
        shell
          .querySelector(`[data-difficulty="${settings.difficulty}"]`)
          ?.focus();
      } else actions[el.dataset.action]?.();
    },
    { signal: life.signal },
  );
  shell.addEventListener(
    'pointerover',
    (e) => {
      const card = e.target.closest('[data-level]');
      if (card && e.pointerType !== 'touch') showDetail(card.dataset.level);
      const chassis = e.target.closest('button[data-ship]');
      if (chassis && e.pointerType !== 'touch') showShip(chassis.dataset.ship);
    },
    { signal: life.signal },
  );
  shell.addEventListener(
    'focusin',
    (e) => {
      const card = e.target.closest('button[data-level], button[data-ship]');
      if (!card) return;
      const selector = card.dataset.level
        ? '[data-level]'
        : 'button[data-ship]';
      for (const item of shell.querySelectorAll(selector))
        item.tabIndex = item === card ? 0 : -1;
      if (card.dataset.level) showDetail(card.dataset.level);
      else showShip(card.dataset.ship);
    },
    { signal: life.signal },
  );
  function restoreSelection(e) {
    const circuitList = e.target.closest('.circuit-grid');
    if (circuitList && !circuitList.contains(e.relatedTarget))
      showDetail(selected);
    const shipList = e.target.closest('.ship-list');
    if (shipList && !shipList.contains(e.relatedTarget)) showShip(shipId);
  }
  shell.addEventListener('focusout', restoreSelection, { signal: life.signal });
  shell.addEventListener('pointerout', restoreSelection, {
    signal: life.signal,
  });
  shell.addEventListener(
    'change',
    (e) => {
      const key = e.target.dataset.setting;
      if (!key) return;
      settings[key] =
        e.target.type === 'checkbox'
          ? e.target.checked
          : key === 'volume'
            ? +e.target.value
            : e.target.value;
      saveSettings(settings);
      document.body.classList.toggle('reduced-motion', settings.reducedMotion);
    },
    { signal: life.signal },
  );
  shell.addEventListener(
    'keydown',
    (e) => {
      const card = e.target.closest(
        'button[data-level], button[data-ship], button[data-difficulty]',
      );
      if (
        !card ||
        ![
          'ArrowLeft',
          'ArrowRight',
          'ArrowUp',
          'ArrowDown',
          'Home',
          'End',
        ].includes(e.code)
      )
        return;
      const selector = card.dataset.level
        ? '[data-level]'
        : card.dataset.ship
          ? 'button[data-ship]'
          : '[data-difficulty]';
      const items = [...shell.querySelectorAll(selector)];
      const columns =
        card.dataset.level || card.dataset.ship
          ? getComputedStyle(card.parentElement).gridTemplateColumns.split(' ')
              .length
          : 1;
      const step =
        e.code === 'ArrowDown'
          ? columns
          : e.code === 'ArrowUp'
            ? -columns
            : e.code === 'ArrowLeft'
              ? -1
              : 1;
      const index =
        e.code === 'Home'
          ? 0
          : e.code === 'End'
            ? items.length - 1
            : Math.max(
                0,
                Math.min(items.length - 1, items.indexOf(card) + step),
              );
      e.preventDefault();
      let next = items[index];
      if (card.dataset.level && ['ArrowUp', 'ArrowDown'].includes(e.code)) {
        // Difficulty row breaks leave empty cells; follow the visible rows.
        const current = card.getBoundingClientRect();
        const direction = e.code === 'ArrowDown' ? 1 : -1;
        const candidates = items
          .map((item) => ({ item, bounds: item.getBoundingClientRect() }))
          .filter(({ bounds }) => (bounds.top - current.top) * direction > 1)
          .sort(
            (a, b) =>
              (a.bounds.top - b.bounds.top) * direction ||
              Math.abs(a.bounds.left - current.left) -
                Math.abs(b.bounds.left - current.left),
          );
        next = candidates[0]?.item ?? card;
      }
      if (next.dataset.level || next.dataset.ship) {
        next.focus({ preventScroll: true });
        next.scrollIntoView({ block: 'nearest' });
      } else {
        next.click();
        shell
          .querySelector(`${selector}[aria-pressed="true"]`)
          ?.scrollIntoView({ block: 'nearest' });
      }
    },
    { signal: life.signal },
  );
  window.addEventListener(
    'keydown',
    (e) => {
      if (
        shell.hidden ||
        e.defaultPrevented ||
        e.target.closest('[data-music-player]') ||
        e.ctrlKey ||
        e.metaKey ||
        e.altKey
      )
        return;
      if (
        e.code === 'KeyS' &&
        screen !== 'loading' &&
        !e.target.matches('input, select, textarea')
      ) {
        e.preventDefault();
        actions.settings();
      } else if (e.code === 'Escape') {
        e.preventDefault();
        if (screen === 'loading') cancel();
        else if (screen === 'settings') actions['settings-back']();
        else if (screen === 'setup') setScreen('circuits');
        else if (screen === 'circuits') setScreen('home');
      }
    },
    { signal: life.signal },
  );
  wideMenu.addEventListener(
    'change',
    () => {
      if (!choosingSession()) return;
      const focused = document.activeElement;
      const selector = focused?.dataset.ship
        ? `button[data-ship="${focused.dataset.ship}"]`
        : focused?.dataset.level
          ? `[data-level="${focused.dataset.level}"]`
          : focused?.dataset.difficulty
            ? `[data-difficulty="${focused.dataset.difficulty}"]`
            : focused?.dataset.action
              ? `[data-action="${focused.dataset.action}"]`
              : focused?.matches('.ship-preview canvas')
                ? '.ship-preview canvas'
                : null;
      setScreen(screen);
      if (selector)
        shell.querySelector(selector)?.focus({ preventScroll: true });
    },
    { signal: life.signal },
  );
  window.addEventListener(
    'pagehide',
    () => {
      controller?.abort();
      game?.dispose();
      music?.dispose();
      shipPreview?.dispose();
      unsubscribeCache?.();
      unsubscribeSettings?.();
      cacheModule?.disposeShipCache();
      life.abort();
    },
    { once: true },
  );
  unsubscribeSettings = subscribeSettings((next) => {
    settings = { ...next };
    document.body.classList.toggle('reduced-motion', settings.reducedMotion);
    for (const control of shell.querySelectorAll('[data-setting]')) {
      const value = settings[control.dataset.setting];
      if (control.type === 'checkbox') control.checked = value;
      else control.value = value;
    }
    for (const control of shell.querySelectorAll('[data-difficulty]')) {
      const active = control.dataset.difficulty === settings.difficulty;
      control.setAttribute('aria-pressed', active);
      control.tabIndex = active ? 0 : -1;
    }
    updateLaunchSummary();
  });
  transfer.querySelector('.retry-fleet').addEventListener(
    'click',
    () => {
      void cacheModule?.preloadShips();
    },
    { signal: life.signal },
  );
  // Small read-only shell diagnostics used by the preview capture and smoke tools.
  window.__VN_FRONTEND = {
    getState: () => ({
      screen,
      selected,
      previewLevelId,
      loadedId,
      loading: !!pending,
      error,
      intent,
      shipId,
      preview: shipPreview?.getState() ?? null,
      preload,
    }),
    routes,
  };
  if (invalidLevel) {
    error = `Unknown circuit: ${requested}. Choose another circuit to continue.`;
    setScreen('loading');
  } else if (special) {
    void launchSpecial();
  } else {
    setScreen('home');
  }
  if (!special) {
    // Let the lightweight circuit picker paint before parsing the first model.
    requestAnimationFrame(() => {
      void import('../ships/model-cache.js')
        .then((module) => {
          if (life.signal.aborted) return;
          cacheModule = module;
          unsubscribeCache = module.subscribeShipCache((state) => {
            preload = state;
            updateStatus();
          });
          void module.preloadShips();
        })
        .catch(() => {
          preload.label = 'Fleet preload unavailable';
          updateStatus();
        });
    });
  }
}
