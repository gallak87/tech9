import { CONTROLLER_DEFAULTS } from '../input/gamepad.js';
import {
  controllerSettingsView,
  bindControllerSettings,
} from './controller-settings.js';
import { CUPS, createCupStore, cupDefinition } from '../race/cup.js';
import { cupView, cupWaitingView, cupLaunch } from './cup.js';
import { recordsView } from './records.js';
import { readTrialRecords } from '../race/time-trial.js';
import { formatTime, formatDelta } from '../race/timing.js';
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
const stamp = formatTime;
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
  const cupStore = createCupStore();
  let selectedCup = cupStore.snapshot().state?.cupId ?? CUPS[0].id;
  const currentCup = () =>
    cupDefinition(cupStore.snapshot().state?.cupId ?? selectedCup);
  let sessionCup = false,
    cupConfirm = null,
    cupResultsKey = null;
  const parameters = new URLSearchParams(
    !import.meta.env?.VN_DESKTOP ? location.search : '',
  );
  const artPass =
    !import.meta.env?.VN_DESKTOP && parameters.get('artPass') === '1';
  const inspectShip =
    !import.meta.env?.VN_DESKTOP &&
    !artPass &&
    parameters.get('inspect') === '1';
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
  let sessionIntent = 'race',
    recordsBack = 'home',
    recordsFocus = null;
  let recordShip = 'all',
    recordTrack = 'all';
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
    settingsFocus = null,
    launchBack = 'home',
    launchFocus = null,
    launchTarget = 'race',
    inspectionBack = null;
  let inspector = null,
    inspectorController = null,
    inspectorPending = null;
  let cacheModule,
    unsubscribeCache,
    unsubscribeSettings,
    disposeControllerSettings;
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
  void import('../input/menu-gamepad.js').then(({ bindMenuGamepad }) => {
    if (!life.signal.aborted)
      bindMenuGamepad(life.signal, {
        toggleMusic: () => music?.togglePlayback(),
      });
  });
  // Match CSS: one picker at a time beside the menu, separate pages below.
  const wideMenu = matchMedia('(min-width: 900px)');
  const choosingSession = () =>
    ['home', 'circuits', 'setup', 'cup', 'records'].includes(screen);
  const showingShip = () => screen === 'setup';
  const lockedCup = () => (intent === 'cup' ? cupStore.snapshot().state : null);
  host.innerHTML =
    '<div id="game-host"></div><div id="front-shell"></div><aside class="transfer-status" aria-label="Loading status"><span role="status"></span><progress max="1" value="0"></progress><button type="button" class="retry-fleet" hidden>Retry fleet preload</button></aside>';
  const transfer = host.querySelector('.transfer-status');
  const gameHost = host.querySelector('#game-host');
  const shell = host.querySelector('#front-shell');
  const inspectorHost = document.createElement('div');
  inspectorHost.id = 'inspector-host';
  const music =
    artPass || inspectShip || parameters.get('music') === '0'
      ? null
      : createMusicPlayer(host, {
          clearInput: () => game?.clearInput(),
          isMenuVisible: () => !shell.hidden,
        });
  let sounds = null;
  if (!import.meta.env.VN_DESKTOP && parameters.get('dev') === '1')
    void import('../audio/sound-panel.js').then(({ createSoundPanel }) => {
      if (life.signal.aborted) return;
      sounds = createSoundPanel(host, {
        clearInput: () => game?.clearInput(),
        getSettings: () => settings,
      });
    });
  const level = () => catalog.find((l) => l.id === selected);
  const route = (id = selected) => routes.find((r) => r.id === id);
  const selectedShip = () => SHIPS.find((s) => s.id === shipId);
  const ship = () => SHIPS.find((s) => s.id === (previewShipId ?? shipId));
  const isSprint = (id = selected) => route(id)?.closed === false;
  const sessionName = (id = selected, practice = intent === 'practice') =>
    (
      screen === 'results'
        ? lastResults?.mode === 'time-trial'
        : intent === 'time-trial'
    )
      ? 'Time Trial'
      : intent === 'cup'
        ? currentCup().name
        : isSprint(id)
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
    `<span>${route() ? (route().length / 1000).toFixed(2) + ' KM' : 'CIRCUIT'}</span> <span>${route()?.closed === false ? 'POINT TO POINT' : intent === 'practice' ? 'OPEN PRACTICE' : intent === 'time-trial' ? 'UNLIMITED LAPS' : '2 LAPS'}</span> <span>${!['race', 'cup'].includes(intent) ? 'SOLO' : `${RACE_FIELD_SIZE} PILOTS`}</span>`;
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
  function focusSelector(element = document.activeElement) {
    if (!shell.contains(element)) return null;
    if (element.dataset.recordFilter)
      return `[data-record-filter="${element.dataset.recordFilter}"]`;
    if (element.dataset.recordKey)
      return `[data-record-key="${element.dataset.recordKey}"]`;
    for (const key of ['level', 'ship', 'difficulty', 'cup', 'action']) {
      if (!element.dataset[key]) continue;
      const scope = element.closest(
        '.menu-selection, .picker-tabs, .picker-header',
      );
      const prefix = scope?.classList.contains('menu-selection')
        ? '.race-menu '
        : scope?.classList.contains('picker-tabs')
          ? '.picker-tabs '
          : scope
            ? '.picker-header '
            : '';
      return `${prefix}button[data-${key}="${element.dataset[key]}"]`;
    }
    return element.matches('.ship-preview canvas')
      ? '.ship-preview canvas'
      : null;
  }
  function focusMenu(target) {
    const element =
      typeof target === 'string' ? shell.querySelector(target) : target;
    if (!element || element.disabled) return;
    element.focus({ preventScroll: true });
    element.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }
  function focusPicker() {
    focusMenu(
      screen === 'records'
        ? '[data-record-filter="track"]'
        : showingShip()
          ? `button[data-ship="${shipId}"]`
          : intent === 'cup'
            ? '.cup-picker [aria-pressed="true"], .cup-rules summary'
            : `[data-level="${selected}"]`,
    );
  }
  function focusPickerHeader() {
    focusMenu(
      '.picker-tabs [aria-pressed="true"], .picker-header button:last-child',
    );
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
    gameHost.inert = !shell.hidden || !!inspector;
    game?.setSuspended(
      !!inspector ||
        !['race', 'inspection', 'review', 'results'].includes(next),
    );
    document.body.dataset.screen = next;
    music?.setDriving(next === 'race');
    render();
    if (navigating) shell.scrollTop = 0;
    const focus =
      next === 'records'
        ? '[data-record-filter="track"]'
        : next === 'circuits'
          ? `[data-level="${selected}"]`
          : next === 'setup'
            ? `button[data-ship="${shipId}"]`
            : next === 'home' || next === 'cup'
              ? '.cup-picker [aria-pressed="true"], .race-actions > .primary'
              : next === 'settings'
                ? '[data-action="settings-back"]'
                : next === 'loading'
                  ? '[data-action="cancel"]'
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
  const modeName = () =>
    ({
      race: 'Quick Race',
      practice: 'Practice',
      'time-trial': 'Time Trial',
      cup: 'Championships',
    })[intent];
  const modePicker = () =>
    `<nav class="mode-picker" aria-label="Game mode">${[
      ['quick-race', 'race', 'Quick Race'],
      ['cup-hub', 'cup', 'Championships'],
      ['time-trial', 'time-trial', 'Time Trial'],
      ['practice', 'practice', 'Practice'],
    ]
      .map(
        ([action, mode, label]) =>
          `<button data-action="${action}" aria-pressed="${intent === mode}">${label}</button>`,
      )
      .join('')}</nav>`;
  const launchLabel = () =>
    intent === 'time-trial'
      ? 'Start Time Trial →'
      : intent === 'practice'
        ? 'Start Practice →'
        : isSprint()
          ? 'Start Sprint →'
          : 'Start race →';
  const modeDescription = () =>
    intent === 'time-trial'
      ? isSprint()
        ? 'One descent against your personal ghost. Manual boost, no road devices.'
        : 'Unlimited laps. Each clean best saves a ghost for the next lap. Standing and flying bests are separate. Manual boost, no road devices.'
      : intent === 'practice'
        ? `${isSprint() ? 'One solo descent' : 'Open solo laps'} to learn the course. No opponents.`
        : `${isSprint() ? 'One descent' : 'Two laps'} against nine rivals. Choose your opponent difficulty.`;
  const raceActions = () => {
    if (intent === 'cup') {
      const state = cupStore.snapshot().state;
      const cup = currentCup();
      const next = cupLaunch(
        state,
        selectedCup,
        sessionCup && game?.hasSession(),
      );
      const event = state
        ? cup.tracks[
            Math.min(
              state.eventIndex + (state.phase === 'results' ? 1 : 0),
              cup.tracks.length - 1,
            )
          ]
        : null;
      return `<div class="race-actions"><button class="primary" data-action="${next.action}" ${cupConfirm ? 'disabled' : ''}><strong>${next.label}</strong><small>${next.detail}</small></button>${state ? '' : difficultyControls()}<p class="mode-description">${state ? `${escape(catalog.find((entry) => entry.id === event).name)} · ${state.difficulty} opponents. Your cup progress is saved.` : `${cup.tracks.length} races against nine rivals. Ship and difficulty stay fixed throughout the cup.`}</p></div>`;
    }
    return `<div class="race-actions"><button class="primary" data-action="launch"><strong>${launchLabel()}</strong><small>${intent === 'race' ? `${isSprint() ? '1 descent' : '2 laps'} · ${RACE_OPPONENTS.length} rivals` : isSprint() ? '1 descent' : intent === 'practice' ? 'Open laps' : 'Unlimited laps'}</small></button>${intent === 'race' ? difficultyControls() : ''}<p class="mode-description">${modeDescription()}</p></div>`;
  };
  function pickerRaceActions() {
    return `<div class="picker-race-actions"><button class="change-track" data-action="circuits">${escape(intent === 'cup' ? currentCup().name : level().name)} · ${modeName()} <span aria-hidden="true">↗</span></button>${raceActions()}</div>`;
  }
  const sessionReturn = (includeCup = false) => {
    if (!game?.hasSession() || (sessionCup && !includeCup)) return '';
    const name = sessionCup
      ? 'Cup Race'
      : sessionIntent === 'time-trial'
        ? 'Time Trial'
        : sessionIntent === 'practice'
          ? 'Practice'
          : 'Quick Race';
    return `<aside class="session-return"><button data-action="resume-session"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 4-5 5 5 5M4 9h10a6 6 0 0 1 0 12h-2"/></svg><span><strong>Resume ${name}</strong><small>${escape(loadedLevel().name)}</small></span></button></aside>`;
  };
  const homeMenu = () => {
    const savedCup = cupStore.snapshot().state;
    const cup = intent === 'cup' ? currentCup() : null;
    const selectedCraft = lockedCup()
      ? SHIPS.find((entry) => entry.id === savedCup.shipId)
      : selectedShip();
    return `<section class="race-menu" aria-label="Session setup"><h1 class="menu-wordmark">VECTOR<span>//</span>NOVA</h1>${import.meta.env?.VN_EDITION === 'demo' ? '<p class="demo-edition">DEMO · Kestrel · 2 courses · Unlimited play</p>' : ''}${sessionReturn()}${modePicker()}<button class="menu-selection" data-action="circuits"><span>${cup ? 'Cup' : 'Track'}</span><div><strong>${escape(cup ? cup.name : level().name)}</strong><small>${cup ? `${cup.tracks.length} races · ${savedCup ? `${savedCup.results.length} scored` : 'Championship'}` : `${trackChallenge(selected)} · ${isSprint() ? 'Downhill sprint' : 'Circuit'}`}</small></div><b aria-hidden="true">›</b></button><button class="menu-selection" data-action="ship-step" ${lockedCup() ? 'disabled' : ''}><span>Ship</span><div><strong>${selectedCraft.name}</strong><small>${lockedCup() ? 'Locked for this cup' : selectedCraft.role}</small></div><b aria-hidden="true">${lockedCup() ? '—' : '›'}</b></button>${raceActions()}<div class="menu-extras"><button data-action="records" aria-pressed="${screen === 'records'}">Time Trial records</button>${button('inspect', 'Ship inspector')}</div><nav class="menu-links" aria-label="Preferences">${button('settings', 'Settings')}${music ? button('tunes', 'Tunes') : ''}${import.meta.env?.VN_DESKTOP === true ? button('desktop-fullscreen', 'Fullscreen / Windowed') + button('desktop-quit', 'Quit game') : ''}</nav><div class="transfer-slot menu-transfer"></div>${savedCup && !cup ? `<aside class="saved-cup">${button('saved-cup', `${cupDefinition(savedCup.cupId).name} · ${savedCup.results.length}/${cupDefinition(savedCup.cupId).tracks.length} scored →`)}</aside>` : ''}</section>`;
  };
  function cupPanel(withActions) {
    const state = cupStore.snapshot().state;
    const cup = currentCup();
    const event = cup.tracks[state?.eventIndex ?? 0];
    return cupView({
      ...cupStore.snapshot(),
      routes,
      catalog,
      cupId: selectedCup,
      shipId,
      difficulty: settings.difficulty,
      live: sessionCup && game?.hasSession(),
      confirm: cupConfirm,
      menu: {
        eventArt: (id) => picture(route(id)) + routeArt(route(id)),
        hero: (title) =>
          `<div class="circuit-hero cup-hero"><div class="detail-image">${picture(route(event))}${routeArt(route(event))}<span class="track-type-badge">${cup.tracks.length} races</span><div class="track-caption"><h2 class="cup-title">${title}</h2><p>${state ? `Race ${state.eventIndex + 1}` : 'Opening race'} · ${escape(catalog.find((entry) => entry.id === event).name)}</p></div></div></div>`,
        actions: withActions ? raceActions() : '',
      },
    });
  }
  function renderMenu() {
    const wide = wideMenu.matches;
    const picking = wide || screen !== 'home';
    const setup = showingShip();
    const cup = intent === 'cup';
    const records = screen === 'records';
    const backAction = records ? 'records-back' : 'home';
    const backLabel =
      records && recordsBack === 'results'
        ? '← Back to results'
        : '← Back to setup';
    const pickerHeader = wide
      ? `<nav class="picker-tabs" aria-label="Setup view"><button data-action="circuits" aria-pressed="${!setup && !records}">${cup ? 'Cups' : 'Tracks'}</button><button data-action="ship-step" aria-pressed="${setup}" ${lockedCup() ? 'disabled' : ''}>Ship</button>${records ? `<h2 class="records-heading">Records</h2>${button('records-back', recordsBack === 'results' ? '← Results' : '← Back')}` : ''}</nav>`
      : `<header class="picker-header"><button class="front-brand" data-action="home">VECTOR<span>//</span>NOVA</button>${button(backAction, backLabel)}</header>`;
    const pickerContent = !picking
      ? ''
      : records
        ? recordsView({
            records: readTrialRecords(),
            catalog,
            routes,
            shipId: recordShip,
            trackId: recordTrack,
            heading: !wide,
            trackArt: (id) => picture(route(id)) + routeArt(route(id)),
          })
        : setup
          ? shipPanel(!wide)
          : cup
            ? cupPanel(!wide)
            : circuitPanel();
    shell.className = 'cinematic-menu';
    shell.innerHTML = `<div class="menu-backdrop" aria-hidden="true">${picture(route())}</div><main class="front-content menu-layout ${wide ? 'menu-wide' : 'menu-narrow'}" data-page="${screen}">${wide || !picking ? homeMenu() : ''}${picking ? `<section class="menu-picker ${records ? 'menu-records-picker' : setup ? 'menu-ship-picker' : cup ? 'menu-cup-picker' : 'menu-track-picker'}" aria-label="${records ? 'Time Trial records' : setup ? 'Ship selection' : cup ? 'Championship selection' : 'Track selection'}">${pickerHeader}${pickerContent}</section>` : ''}</main>`;
    if (!setup && !cup && !records && picking) showDetail(selected);
    if (showingShip()) mountShipPreview();
    shell
      .querySelector(
        '.ship-transfer, .menu-transfer, .track-transfer, .records-transfer',
      )
      ?.append(transfer);
    updateLaunchSummary();
    updateStatus();
  }
  function render() {
    disposeControllerSettings?.();
    disposeControllerSettings = null;
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
      cup: 'CHAMPIONSHIP',
      records: 'TIME TRIAL RECORDS',
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
    shell.innerHTML = `<header class="front-header"><button class="front-brand" data-action="home" aria-label="Vector Nova setup">VECTOR<span>//</span>NOVA</button>${headerLabel}${headerAction}</header><main class="front-content" data-page="${screen}"></main><footer class="front-footer"><span>${screen === 'circuits' ? 'ARROWS · BROWSE <i>/</i> ENTER · SELECT <i>/</i> TAB · CONTROLS' : `${sessionName(screen === 'results' ? loadedId : selected, screen !== 'results' && intent === 'practice').toUpperCase()} <i>/</i> ${escape((screen === 'results' ? loadedLevel() : level()).name.toUpperCase())}`}</span></footer>`;
    if (screen === 'loading' && launchTarget === 'inspection')
      shell.querySelector('.front-footer span').textContent = 'SHIP INSPECTOR';
    const main = shell.querySelector('.front-content');
    let content = main;
    if (screen === 'loading') {
      const inspecting = launchTarget === 'inspection';
      content.innerHTML = `<section class="loading-copy">${inspecting ? '' : `<div class="loading-card">${picture(route())}${routeArt(route())}</div>`}<div class="transfer-slot loading-transfer"></div>${heading(inspecting ? 'PREPARING STUDIO' : 'LOADING CIRCUIT', inspecting ? 'Ship inspector' : escape(level().name))}${inspecting ? '' : `<div class="session-facts">${facts()}</div>`}<div class="front-actions">${button('cancel', 'Cancel')}${button('retry', 'Try again', true)}</div></section>`;
    } else if (screen === 'settings') {
      content.innerHTML = `${sessionReturn(true)}<div class="settings-layout"><section class="settings-form"><label><span>Graphics</span><select data-setting="quality"><option value="high">High</option><option value="low">Low</option></select></label><label><span>Effects volume</span><input data-setting="volume" type="range" min="0" max="1" step=".05" value="${settings.volume}"></label><label><span>Reduced motion</span><input data-setting="reducedMotion" type="checkbox" ${settings.reducedMotion ? 'checked' : ''}></label>${controllerSettingsView(settings)}<p>Saved on this device.</p></section><section class="keyboard-guide" aria-label="Keyboard shortcuts"><h2>Keyboard</h2>${[
        [
          'Driving',
          [
            ['WASD / Arrows', 'Throttle, brake and steer'],
            ['Shift', 'Boost'],
            ['Space', 'Airbrake'],
            ['Esc', 'Pause / resume'],
            ['R', 'Reset / retry'],
            ['C', 'Change camera'],
          ],
        ],
        [
          'Menus',
          [
            ['Tab / Shift Tab', 'Move between controls'],
            ['↑ / ↓', 'Move between actions'],
            ['← / →', 'Browse choices'],
            ['Home / End', 'First / last choice'],
            ['Enter / Space', 'Select or activate'],
            ['Esc', 'Back / cancel loading'],
            ['S', 'Open settings'],
          ],
        ],
        ...(!import.meta.env?.VN_DESKTOP &&
        (parameters.get('dev') === '1' || artPass)
          ? [
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
            ]
          : []),
        [
          'Tunes',
          [
            ['M', 'Play / pause'],
            [', / .', 'Previous / next track'],
            ['/', 'Expand player'],
          ],
        ],
      ]
        .map(
          ([title, rows]) =>
            `<h3>${title}</h3><dl>${rows.map(([key, label]) => `<div><dt><kbd>${key}</kbd></dt><dd>${label}</dd></div>`).join('')}</dl>`,
        )
        .join('')}</section></div>`;
      content.querySelector('select').value = settings.quality;
      disposeControllerSettings = bindControllerSettings(
        content.querySelector('.controller-settings'),
        () => settings,
      );
    } else if (screen === 'results' && lastResults?.mode === 'cup') {
      content.innerHTML =
        screen === 'results' && !lastResults.final
          ? cupWaitingView(lastResults)
          : cupView({
              ...cupStore.snapshot(),
              routes,
              catalog,
              cupId: selectedCup,
              shipId,
              difficulty: settings.difficulty,
              live: sessionCup && game?.hasSession(),
              confirm: cupConfirm,
            });
      shell.querySelector('.front-footer span').textContent =
        `${currentCup().name} · ${currentCup()
          .tracks.map((id) => catalog.find((entry) => entry.id === id).name)
          .join(' → ')}`;
    } else if (screen === 'results') {
      const sprint = isSprint(loadedId);
      const trial = lastResults?.mode === 'time-trial';
      const player = lastResults?.standings.find(
        (entry) => entry.id === 'player',
      );
      const title = trial
        ? !lastResults.playerValid
          ? 'Trial complete · unranked'
          : lastResults.improved
            ? lastResults.previousBest == null
              ? 'First personal best.'
              : 'New personal best.'
            : 'Time Trial complete.'
        : !lastResults?.playerValid
          ? 'Finish · untimed'
          : player?.position === 1
            ? 'Winner.'
            : 'Race finished.';
      content.innerHTML = `<section class="result-panel">${heading('FINISH / ' + escape(loadedLevel().name.toUpperCase()), title)}<div class="results-layout"><section class="result-personal"><span class="kicker">${lastResults?.playerValid ? 'RACE TIME' : 'UNRANKED RUN'}</span><strong>${stamp(lastResults?.playerTotalTime)}</strong><p>${lastResults?.playerValid ? `${sprint ? 'One descent' : `${lastResults.laps ?? 2} laps`} · ${escape(lastResults.difficulty ?? settings.difficulty)}` : `${sprint ? 'This descent' : 'A lap'} was invalidated. This run does not count toward classification.`}</p><div class="lap-splits">${(lastResults?.playerLapTimes ?? []).map((t, i) => `<span>${sprint ? 'DESCENT' : `LAP ${i + 1}`}<b>${stamp(t)}</b></span>`).join('')}</div></section><section><ol class="results-list" aria-label="Race classification" tabindex="0"></ol><p class="results-note" role="status"></p></section></div><div class="front-actions results-actions">${button('retry-race', 'Retry Quick Race →', true)}${button('continue', 'Continue driving')}${button('change', 'Back to setup')}</div></section>`;
      if (trial) {
        const r = lastResults;
        const signed = formatDelta;
        content.querySelector('.result-personal .kicker').textContent =
          r.playerValid ? 'TOTAL TIME' : 'UNRANKED RUN';
        content.querySelector('.result-personal > p').textContent =
          r.playerValid
            ? `${escape(SHIPS.find((ship) => ship.id === r.shipId)?.name ?? 'Selected ship')} · ${sprint ? 'One descent' : `${r.laps} lap${r.laps === 1 ? '' : 's'}`} · ${r.delta == null ? 'First completed trial' : `${signed(r.delta)} against previous best`}`
            : 'A checkpoint or manual recovery invalidated this run. Retry for a ranked time.';
        const detail = content.querySelector('.results-list').parentElement;
        detail.innerHTML = `<p class="trial-best">PERSONAL BEST <b>${stamp(r.bestTime)}</b></p><h2 class="trial-split-title">Cumulative splits</h2><p class="trial-split-key">Elapsed time at each sector · − ahead / + behind previous best</p><ol class="trial-splits" aria-label="Cumulative splits against previous best">${r.splits.map((t, i) => `<li><span>${sprint ? '' : `L${Math.floor(i / 3) + 1} · `}S${(i % 3) + 1}</span><b>${stamp(t)}</b><span>${signed(r.splitDeltas[i])}</span></li>`).join('')}</ol><p class="results-note" role="status">${!r.playerValid ? 'Best and ghost unchanged.' : r.improved ? (r.saved.saved ? (r.saved.ghostSaved ? 'Best and personal ghost saved on this device.' : 'Best saved. Ghost could not be saved; storage may be full or the run exceeded 20 minutes.') : 'Storage unavailable. Best and ghost are kept for this page session only.') : r.ghostAvailable ? 'Personal best unchanged. Retry to race your ghost.' : 'Personal best unchanged. No compatible ghost is saved for this best.'}</p>`;
        const retry = content.querySelector('[data-action="retry-race"]');
        retry.textContent = 'Retry Time Trial →';
        const records = content.querySelector('[data-action="continue"]');
        records.dataset.action = 'records';
        records.textContent = 'Time Trial records';
      } else updateResults(lastResults);
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
        `${launchLabel()} ${level().name}, ${selectedShip().name}${intent === 'race' ? `, ${settings.difficulty} opponents` : ''}`,
      );
  }
  function updateStatus() {
    const loading = screen === 'loading';
    const label = loading
      ? error ||
        `${launchTarget === 'inspection' ? 'Ship inspector' : level().name} · ${progress || 'Preparing session'}`
      : preload.label;
    const fraction = loading
      ? launchTarget === 'inspection'
        ? [
            'Preparing studio',
            'Preparing ships',
            'Warming studio',
            'Ready',
          ].indexOf(progress) / 3
        : loadStep / (loadStages.length - 1)
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
    if (data.mode === 'time-trial') return;
    if (data.mode === 'cup') {
      const key = JSON.stringify([
        data.final,
        data.remaining,
        data.standings.map((r) => [
          r.id,
          r.position,
          r.finished,
          r.valid,
          r.totalTime,
        ]),
      ]);
      if (key !== cupResultsKey) {
        const focused = focusSelector();
        const wasWaiting = !!shell.querySelector('.results-note');
        cupResultsKey = key;
        render();
        if (data.final && wasWaiting)
          shell.querySelector('h1')?.focus({ preventScroll: true });
        else focusMenu(focused);
      }
      return;
    }
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
      sessionCup = false;
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
      const gameOptions = {
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
              inspectionBack ??
              (screen === 'inspection' ? 'setup' : sessionCup ? 'cup' : 'home');
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
        onTunes: music
          ? () => music.open(gameHost.querySelector('#pause-tunes'))
          : null,
        onSettings() {
          settingsBack = 'race';
          settingsFocus = null;
          setScreen('settings');
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
        onCupRetry() {
          if (sessionCup) cupStore.retry();
        },
        onResults(data) {
          if (data.mode === 'cup' && sessionCup && data.final)
            cupStore.finish(data);
          lastResults = data;
          if (screen === 'race' || screen === 'review') setScreen('results');
          else if (screen === 'results') updateResults(data);
        },
      };
      let created;
      const startedHigh = settings.quality === 'high';
      try {
        created = await createGame(gameOptions);
      } catch (failure) {
        // Failed factories have finished releasing their world/context here.
        // Retry only once, and never turn a cancelled load into another race.
        if (
          failure.name !== 'GraphicsContextLostError' ||
          !startedHigh ||
          signal.aborted ||
          token !== generation
        )
          throw failure;
        saveSettings({ quality: 'low' });
        progress = 'Retrying with Low graphics';
        updateStatus();
        await new Promise((resolve) => setTimeout(resolve, 0));
        signal.throwIfAborted();
        created = await createGame(gameOptions);
      }
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
    if (choosingSession() || screen === 'cup' || screen === 'results') {
      launchBack = intent === 'cup' ? 'cup' : screen;
      launchFocus = focusSelector();
    }
    launching = true;
    launchTarget = target;
    const attempt = ++launchGeneration;
    if (target === 'race') music?.startWithGame();
    error = '';
    progress = 'Reading circuit';
    loadStep = 0;
    setScreen('loading');
    try {
      const current = await prepare();
      if (attempt !== launchGeneration || screen !== 'loading') return;
      current.configure(settings);
      if (target === 'race') {
        sessionCup = false;
        current.prepareSession();
      }
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
  function closeInspector() {
    const destination = inspectionBack ?? launchBack;
    if (inspector) shipId = inspector.getSnapshot().ship.id;
    inspectorController?.abort();
    inspector?.dispose();
    inspector = null;
    inspectionBack = null;
    inspectorHost.remove();
    host.prepend(gameHost);
    if (special) leaveReview();
    setScreen(destination);
    shell
      .querySelector('[data-action="inspect"]')
      ?.focus({ preventScroll: true });
  }
  async function openInspector() {
    if (launching) return;
    if (choosingSession()) {
      launchBack = screen;
      launchFocus = focusSelector();
    }
    launching = true;
    launchTarget = 'inspection';
    const attempt = ++launchGeneration;
    const previous = inspectorPending;
    inspectorController?.abort();
    inspectorController = new AbortController();
    const signal = inspectorController.signal;
    error = '';
    progress = 'Preparing studio';
    setScreen('loading');
    // Keep a retained race suspended and detached while the independent studio
    // owns the visible UI. It is restored, unchanged, when the studio closes.
    gameHost.remove();
    host.prepend(inspectorHost);
    inspectorHost.inert = true;
    const promise = (async () => {
      await previous?.catch(() => {});
      signal.throwIfAborted();
      const { createInspector } = await import('../ships/inspector.js');
      signal.throwIfAborted();
      return createInspector({
        host: inspectorHost,
        shipId,
        settings,
        signal,
        onProgress(stage) {
          if (attempt !== launchGeneration) return;
          progress = stage;
          updateStatus();
        },
        onBack: closeInspector,
      });
    })();
    inspectorPending = promise;
    try {
      const current = await promise;
      if (attempt !== launchGeneration || screen !== 'loading') {
        current.dispose();
        return;
      }
      inspector = current;
      inspectionBack = launchBack;
      inspectorHost.inert = false;
      setScreen('inspection');
      inspectorHost
        .querySelector('#inspect-back')
        ?.focus({ preventScroll: true });
    } catch (cause) {
      if (attempt === launchGeneration && cause.name !== 'AbortError') {
        error = cause.message;
        updateStatus();
      }
    } finally {
      if (inspectorPending === promise) inspectorPending = null;
      if (attempt === launchGeneration) launching = false;
    }
  }
  function launch() {
    return loadView('race', (current) => {
      sessionIntent = intent;
      setScreen('race');
      if (intent === 'cup') {
        const state = cupStore.snapshot().state;
        const cup = cupDefinition(state.cupId);
        sessionCup = true;
        current.startCup({
          difficulty: state.difficulty,
          eventIndex: state.eventIndex,
          eventCount: cup.tracks.length,
        });
      } else if (intent === 'time-trial') current.timeTrial();
      else if (intent === 'practice') current.practice();
      else current.start();
    });
  }
  function cancel(destination = invalidLevel ? 'home' : launchBack) {
    generation++;
    launchGeneration++;
    launching = false;
    controller?.abort();
    inspectorController?.abort();
    inspectorHost.remove();
    host.prepend(gameHost);
    error = '';
    progress = '';
    if (special) leaveReview();
    setScreen(destination);
    focusMenu(launchFocus);
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
    if (inspectShip) return openInspector();
    const attempt = ++launchGeneration;
    setScreen('loading');
    try {
      const current = await prepare();
      if (attempt !== launchGeneration || screen !== 'loading') return;
      setScreen('review');
      if (!import.meta.env?.VN_DESKTOP && artPass) {
        current.setFlyView(readArtView(parameters));
        current.openDevTools();
      }
    } catch (cause) {
      if (attempt === launchGeneration && cause.name !== 'AbortError') {
        error = cause.message;
        setScreen('loading');
      }
    }
  }
  function goHome() {
    const previous = screen;
    if (screen === 'loading') {
      cancel('home');
      return;
    }
    if (game) game.returnToSetup();
    else leaveReview();
    setScreen('home');
    if (['circuits', 'setup', 'cup'].includes(previous))
      focusMenu(
        `.menu-selection[data-action="${previous === 'setup' ? 'ship-step' : 'circuits'}"]`,
      );
  }
  function openCup() {
    intent = 'cup';
    if (game?.hasSession()) game.returnToSetup();
    cupConfirm = null;
    setScreen(wideMenu.matches ? 'cup' : 'home');
    focusMenu('[data-action="cup-hub"]');
  }
  function launchCup() {
    const state = cupStore.snapshot().state;
    if (!state) return;
    selected = cupDefinition(state.cupId).tracks[state.eventIndex];
    shipId = state.shipId;
    intent = 'cup';
    remember();
    void launch();
  }
  function clearCupSession() {
    if (sessionCup) {
      sessionCup = false;
      game?.prepareSession();
    }
  }
  function chooseMode(mode) {
    intent = mode;
    cupConfirm = null;
    if (!choosingSession()) game?.returnToSetup();
    setScreen('home');
    focusMenu(`[data-action="${mode === 'race' ? 'quick-race' : mode}"]`);
  }
  const actions = {
    'quick-race'() {
      chooseMode('race');
    },
    records() {
      if (screen === 'records') {
        focusPicker();
        return;
      }
      recordsBack = screen;
      recordsFocus = focusSelector();
      setScreen('records');
    },
    'record-trial'() {
      if (recordTrack !== 'all') selected = recordTrack;
      if (recordShip !== 'all') shipId = recordShip;
      saveShipSelection(shipId);
      remember();
      chooseMode('time-trial');
      focusMenu('[data-action="launch"]');
    },
    'records-back'() {
      setScreen(recordsBack);
      focusMenu(recordsFocus);
      if (recordsBack === 'results') game?.showResults();
    },
    home: goHome,
    'cup-hub': openCup,
    'saved-cup': openCup,
    'cup-start'() {
      if (cupStore.snapshot().state) return;
      cupStore.start(selectedCup, shipId, settings.difficulty);
      launchCup();
    },
    'cup-resume'() {
      if (sessionCup && game?.hasSession()) {
        setScreen('race');
        game.resumeSession();
      } else launchCup();
    },
    'cup-next'() {
      if (!cupStore.next()) return;
      clearCupSession();
      launchCup();
    },
    'cup-retry'() {
      if (!cupStore.retry()) return;
      clearCupSession();
      launchCup();
    },
    'cup-restart'() {
      cupConfirm = 'restart';
      render();
      focusMenu('[data-action="cup-cancel"]');
    },
    'cup-abandon'() {
      cupConfirm = 'abandon';
      render();
      focusMenu('[data-action="cup-cancel"]');
    },
    'cup-cancel'() {
      cupConfirm = null;
      render();
      focusMenu('[data-action="cup-restart"]');
    },
    'cup-confirm'() {
      const state = cupStore.snapshot().state;
      if (!state || !cupConfirm) return;
      const action = cupConfirm;
      cupConfirm = null;
      clearCupSession();
      if (action === 'restart') {
        cupStore.start(state.cupId, state.shipId, state.difficulty);
        launchCup();
      } else {
        selectedCup = state.cupId;
        cupStore.abandon();
        setScreen('cup');
      }
    },
    'resume-session'() {
      if (!game?.hasSession()) return;
      intent = sessionIntent;
      setScreen('race');
      game.resumeSession();
      gameHost.querySelector('#pause-panel:not(.hidden) #resume')?.focus();
    },
    'time-trial'() {
      chooseMode('time-trial');
    },
    practice() {
      chooseMode('practice');
    },
    circuits() {
      setScreen(intent === 'cup' ? 'cup' : 'circuits');
      if (intent === 'cup') focusPicker();
    },
    'ship-step'() {
      if (lockedCup()) return;
      remember();
      setScreen('setup');
    },
    tunes() {
      music?.open(shell.querySelector('[data-action="tunes"]'));
    },
    settings() {
      if (screen === 'settings') return;
      settingsBack = screen;
      settingsFocus = focusSelector();
      setScreen('settings');
    },
    'controller-reset'() {
      saveSettings(CONTROLLER_DEFAULTS);
    },
    'desktop-fullscreen'() {
      window.vectorNovaDesktop?.toggleFullscreen();
    },
    'desktop-quit'() {
      window.vectorNovaDesktop?.quit();
    },
    'settings-back'() {
      const destination = settingsBack;
      setScreen(destination);
      if (destination === 'race') {
        game?.resumeSession();
        gameHost.querySelector('#pause-settings')?.focus();
      } else focusMenu(settingsFocus);
      if (destination === 'results') game?.showResults();
    },
    launch() {
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
      intent = sessionIntent;
      selected = loadedId;
      shipId = game.getSnapshot().ship.id;
      game?.returnToSetup();
      setScreen('home');
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
      if (el.dataset.recordTrack) {
        selected = el.dataset.recordTrack;
        shipId = el.dataset.recordShip;
        saveShipSelection(shipId);
        remember();
        chooseMode('time-trial');
        focusMenu('[data-action="launch"]');
      } else if (el.dataset.cup) {
        if (cupStore.snapshot().state || !cupDefinition(el.dataset.cup)) return;
        selectedCup = el.dataset.cup;
        render();
        focusMenu(`[data-cup="${selectedCup}"]`);
      } else if (el.dataset.level) {
        selectCircuit(el.dataset.level);
      } else if (el.dataset.ship) {
        if (lockedCup()) return;
        previewShipId = null;
        shipId = el.dataset.ship;
        saveShipSelection(shipId);
        render();
        shell.querySelector(`[data-ship="${shipId}"]`)?.focus();
      } else if (el.dataset.difficulty) {
        if (lockedCup()) return;
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
    'input',
    (event) => {
      if (event.target.dataset.setting === 'steeringDeadZone')
        saveSettings({ steeringDeadZone: Number(event.target.value) });
    },
    { signal: life.signal },
  );
  shell.addEventListener(
    'change',
    (e) => {
      if (e.target.dataset.recordFilter) {
        const key = e.target.dataset.recordFilter;
        if (key === 'ship') recordShip = e.target.value;
        else recordTrack = e.target.value;
        render();
        shell.querySelector(`[data-record-filter="${key}"]`).focus();
        return;
      }
      const key = e.target.dataset.setting;
      if (!key) return;
      settings[key] =
        e.target.type === 'checkbox'
          ? e.target.checked
          : e.target.type === 'range'
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
      if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey) return;
      const control = e.target.closest('button');
      const vertical = ['ArrowUp', 'ArrowDown'].includes(e.code);
      const edge = ['Home', 'End'].includes(e.code);
      const horizontal = ['ArrowLeft', 'ArrowRight'].includes(e.code);
      if (!control || (!vertical && !edge && !horizontal)) return;

      if (control.closest('.mode-picker')) {
        e.preventDefault();
        const items = [
          ...control.closest('.mode-picker').querySelectorAll('button'),
        ];
        const columns = getComputedStyle(
          control.closest('.mode-picker'),
        ).gridTemplateColumns.split(' ').length;
        if (
          e.code === 'ArrowDown' &&
          items.indexOf(control) + columns >= items.length
        ) {
          focusMenu('.menu-selection[data-action="circuits"]');
          return;
        }
        const step = vertical
          ? e.code === 'ArrowDown'
            ? columns
            : -columns
          : e.code === 'ArrowRight'
            ? 1
            : -1;
        const index =
          e.code === 'Home'
            ? 0
            : e.code === 'End'
              ? items.length - 1
              : Math.max(
                  0,
                  Math.min(items.length - 1, items.indexOf(control) + step),
                );
        focusMenu(items[index]);
        return;
      }
      const menu = control.closest(
        '.race-menu, .picker-race-actions, .front-actions',
      );
      if (menu && (vertical || (edge && !control.dataset.difficulty))) {
        e.preventDefault();
        const items = [...menu.querySelectorAll('button')].filter(
          (item) =>
            !item.disabled &&
            item.tabIndex >= 0 &&
            item.getClientRects().length,
        );
        const index =
          e.code === 'Home'
            ? 0
            : e.code === 'End'
              ? items.length - 1
              : Math.max(
                  0,
                  Math.min(
                    items.length - 1,
                    items.indexOf(control) + (e.code === 'ArrowDown' ? 1 : -1),
                  ),
                );
        focusMenu(items[index]);
        return;
      }
      if (
        control.closest('.race-menu') &&
        e.code === 'ArrowRight' &&
        !control.dataset.difficulty &&
        wideMenu.matches
      ) {
        e.preventDefault();
        focusPicker();
        return;
      }
      if (control.dataset.action === 'records-back') {
        if (vertical) {
          e.preventDefault();
          if (e.code === 'ArrowDown') focusPicker();
          else focusMenu('.race-menu [data-action="records"]');
        }
        return;
      }
      if (control.closest('.picker-tabs')) {
        e.preventDefault();
        if (vertical) {
          if (e.code === 'ArrowDown') focusPicker();
          else
            focusMenu(
              `.menu-selection[data-action="${showingShip() ? 'ship-step' : 'circuits'}"]`,
            );
        } else {
          const action = ['ArrowLeft', 'Home'].includes(e.code)
            ? 'circuits'
            : 'ship-step';
          actions[action]();
          focusMenu(`.picker-tabs [data-action="${action}"]`);
        }
        return;
      }
      if (control.closest('.picker-header') && vertical) {
        e.preventDefault();
        if (e.code === 'ArrowDown') focusPicker();
        else focusMenu('.picker-header button:last-child');
        return;
      }
      const card = e.target.closest(
        'button[data-level], button[data-ship], button[data-difficulty], button[data-cup]',
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
          : card.dataset.cup
            ? '[data-cup]'
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
        if (next === card && e.code === 'ArrowUp') {
          focusPickerHeader();
          return;
        }
      }
      if (card.dataset.ship && vertical) {
        if (e.code === 'ArrowUp') focusPickerHeader();
        else focusMenu('.ship-preview canvas');
        return;
      }
      if (card.dataset.level && e.code === 'ArrowLeft' && wideMenu.matches) {
        const bounds = card.getBoundingClientRect();
        const firstInRow = !items.some((item) => {
          const other = item.getBoundingClientRect();
          return (
            Math.abs(other.top - bounds.top) < 1 && other.left < bounds.left - 1
          );
        });
        if (firstInRow) {
          focusMenu('.menu-selection[data-action="circuits"]');
          return;
        }
      }
      if (next.dataset.level || next.dataset.ship) {
        focusMenu(next);
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
        e.target.closest('[data-sound-panel]') ||
        e.ctrlKey ||
        e.metaKey ||
        e.altKey
      )
        return;
      if (
        e.code === 'KeyR' &&
        screen === 'results' &&
        lastResults?.mode === 'time-trial'
      ) {
        e.preventDefault();
        actions['retry-race']();
        return;
      }
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
        else if (screen === 'records') actions['records-back']();
        else if (screen === 'results') {
          if (lastResults?.mode === 'cup') openCup();
          else actions.change();
        } else if (cupConfirm) actions['cup-cancel']();
        else if (
          screen === 'cup' ||
          screen === 'setup' ||
          screen === 'circuits'
        )
          goHome();
        else if (screen === 'home' && e.target.closest('.menu-picker'))
          focusMenu('.menu-selection[data-action="circuits"]');
      }
    },
    { signal: life.signal },
  );
  wideMenu.addEventListener(
    'change',
    () => {
      if (!choosingSession()) return;
      const focused = document.activeElement;
      const selector = focusSelector(focused);
      setScreen(screen);
      if (selector) focusMenu(selector);
      else if (focused !== document.body && focused.isConnected)
        focused.focus({ preventScroll: true });
    },
    { signal: life.signal },
  );
  window.addEventListener(
    'pagehide',
    () => {
      controller?.abort();
      game?.dispose();
      inspectorController?.abort();
      inspector?.dispose();
      music?.dispose();
      sounds?.dispose();
      shipPreview?.dispose();
      unsubscribeCache?.();
      unsubscribeSettings?.();
      disposeControllerSettings?.();
      cacheModule?.disposeShipCache();
      life.abort();
    },
    { once: true },
  );
  unsubscribeSettings = subscribeSettings((next) => {
    settings = { ...next };
    sounds?.configure();
    inspector?.configure(settings);
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
  if (!import.meta.env?.VN_DESKTOP)
    window.__VN_FRONTEND = {
      getState: () => ({
        screen,
        selected,
        previewLevelId,
        loadedId,
        loading: !!pending || !!inspectorPending,
        inspector: inspector?.getSnapshot() ?? null,
        error,
        intent,
        cup: cupStore.snapshot(),
        selectedCup,
        sessionCup,
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
