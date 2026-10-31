import { garageView, toggleGarageEquipment, navigateGarage } from './garage.js';
import {
  createProfileStore,
  shipUnlocked,
  starterShip,
  sessionBuild,
} from '../progression/profile.js';
import { rewardsView, careerProgressView } from '../progression/view.js';
import { bindRewardDetails } from '../progression/reward-details.js';
import {
  rewardGoals,
  rewardBadgesView,
  raceProgressView,
} from '../progression/goals.js';
import { createSaveTransfer } from '../progression/save-transfer.js';
import { createProgressionMenu } from '../progression/menu.js';
import { bindDesktopControls } from '../ui/desktop-controls.js';
import { settingsView, bindSettingsPanel } from './settings-panel.js';
import {
  CUPS,
  createCupStore,
  cupDefinition,
  cupGridOrder,
  cupChampion,
  cupComplete,
} from '../race/cup.js';
import { createCupCollection } from '../progression/cup-collection.js';
import { cupArt, cupCabinet, cupHero, cupVictoryView } from './cup-art.js';
import {
  cupView,
  cupWaitingView,
  updateCupWaitingView,
  cupLaunch,
} from './cup.js';
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
import { createMenuBackdrop } from './menu-backdrop.js';
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
import './cup-art.css';

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

export async function createFrontend(
  host,
  {
    backdrop = null,
    storage,
    music: sharedMusic = null,
    career = null,
    onSwitchCareer = null,
    onRenameCareer = null,
    configureMusicNavigation = () => {},
  } = {},
) {
  if (!storage || typeof storage.getItem !== 'function')
    throw new TypeError('A selected career storage adapter is required.');
  let disposed = false;
  const catalog = discoverLevels().list;
  const circuits = catalog;
  const parameters = new URLSearchParams(
    !import.meta.env?.VN_DESKTOP ? location.search : '',
  );
  const developer =
    !import.meta.env?.VN_DESKTOP && ['1', '2'].includes(parameters.get('dev'))
      ? (await import('../progression/developer.js')).createDeveloperSession(
          parameters,
          storage,
        )
      : null;
  const careerStorage = () => developer?.storage?.() ?? storage;
  const profileStore = createProfileStore(careerStorage);
  const profile = () => profileStore.snapshot().state;
  const cupStore = createCupStore(careerStorage);
  const cupCollection = createCupCollection(careerStorage);
  cupCollection.award(cupStore.snapshot().state);
  for (const id of Object.keys(cupCollection.snapshot().cups))
    profileStore.recordCup(id);
  let cupCelebration = null;
  let selectedCup = cupStore.snapshot().state?.cupId ?? CUPS[0].id;
  const currentCup = () =>
    cupDefinition(cupStore.snapshot().state?.cupId ?? selectedCup);
  let sessionCup = false,
    cupConfirm = null,
    cupResultsKey = null;
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
      selected = careerStorage().getItem('vector-nova.circuit');
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
  let garageBack = 'home',
    garageFocus = null,
    garageNotice = '';
  let shipId =
      (
        (inspectShip || developer) &&
        SHIPS.find((s) => s.id === parameters.get('ship'))
      )?.id ?? loadShipSelection(careerStorage()).id,
    settings = loadSettings();
  if (!shipUnlocked(profile(), shipId)) shipId = starterShip();
  let sessionRewardId = '',
    earnedRewards = [],
    rewardStart = null,
    rewardContext = null;
  const goalContext = (trackId = selected) => ({
    mode: intent,
    trackId,
    cupId: intent === 'cup' ? currentCup().id : null,
  });
  const goalBadges = (trackId = selected) =>
    rewardBadgesView(rewardGoals(profile(), goalContext(trackId)), profile());
  function beginRewardAttempt() {
    sessionRewardId = crypto.randomUUID();
    earnedRewards = [];
    rewardStart = profile();
    rewardContext = {
      mode: sessionIntent,
      trackId: loadedId ?? selected,
      cupId: sessionIntent === 'cup' ? cupStore.snapshot().state?.cupId : null,
    };
  }

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
        onSecondaryAction(root) {
          if (root === shell && screen === 'career')
            progressionMenu.renameCareer();
        },
      });
  });
  // Match CSS: one picker at a time beside the menu, separate pages below.
  const wideMenu = matchMedia('(min-width: 900px)');
  const choosingSession = () =>
    ['home', 'circuits', 'setup', 'cup', 'records'].includes(screen);
  const utilityPage = () => ['settings', 'career'].includes(screen);
  const menuVisible = () =>
    choosingSession() || utilityPage() || screen === 'loading';
  const showingShip = () => screen === 'setup';
  const lockedCup = () => (intent === 'cup' ? cupStore.snapshot().state : null);
  host.innerHTML =
    '<div id="game-host"></div><div id="front-shell"></div><aside class="transfer-status" aria-label="Loading status"><span role="status"></span><progress max="1" value="0"></progress><button type="button" class="retry-fleet" hidden>Retry fleet preload</button></aside>';
  const transfer = host.querySelector('.transfer-status');
  const gameHost = host.querySelector('#game-host');
  const shell = host.querySelector('#front-shell');
  const menuBackdrop = backdrop ?? createMenuBackdrop(life.signal);
  const inspectorHost = document.createElement('div');
  inspectorHost.id = 'inspector-host';
  const desktopControls = import.meta.env?.VN_DESKTOP
    ? bindDesktopControls(host, life.signal)
    : null;
  const musicNavigation = {
    clearInput: () => game?.clearInput(),
    isMenuVisible: () => !shell.hidden,
  };
  const music =
    artPass || inspectShip || parameters.get('music') === '0'
      ? null
      : (sharedMusic ?? createMusicPlayer(host, musicNavigation));
  music?.configureNavigation?.(musicNavigation);
  configureMusicNavigation(musicNavigation);
  let sounds = null;
  if (!import.meta.env.VN_DESKTOP && ['1', '2'].includes(parameters.get('dev')))
    void import('../audio/sound-panel.js').then(({ createSoundPanel }) => {
      if (life.signal.aborted) return;
      sounds = createSoundPanel(host, {
        clearInput: () => game?.clearInput(),
        getSettings: () => settings,
      });
      if (inspector)
        sounds.mount(inspectorHost.querySelector('#inspection-tools'));
    });
  const progressionMenu = createProgressionMenu({
    host,
    store: createSaveTransfer({
      profileStore,
      cupStore,
      cupCollection,
      storage: careerStorage,
    }),
    signal: life.signal,
    sandbox: !!developer,
    careerName: career?.name,
    onRenameCareer:
      career && onRenameCareer
        ? (name) => {
            if (disposed) throw new Error('This career is closed.');
            career = onRenameCareer(name);
            return career.name;
          }
        : null,
    onCareerBack: () => actions['settings-back'](),
    onChange({ imported = false } = {}) {
      if (disposed) return;
      if (imported) {
        generation++;
        launchGeneration++;
        controller?.abort();
        game?.dispose();
        game = null;
        loadedId = null;
        sessionCup = false;
        lastResults = null;
        if (['race', 'results'].includes(settingsBack)) {
          settingsBack = 'home';
          settingsFocus = null;
        }
        selectedCup = cupStore.snapshot().state?.cupId ?? CUPS[0].id;
        if (intent === 'cup' && cupStore.snapshot().state) {
          shipId = cupStore.snapshot().state.shipId;
          selected = currentCup().tracks[cupStore.snapshot().state.eventIndex];
        }
      }
      if (!shipUnlocked(profile(), shipId) && !lockedCup())
        shipId = starterShip();
      inspector?.refreshProgression?.();
      render();
    },
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
      careerStorage().setItem('vector-nova.circuit', selected);
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
    for (const key of [
      'rewardInfo',
      'level',
      'ship',
      'equip',
      'difficulty',
      'cup',
      'action',
    ]) {
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
      return `${prefix}button[data-${key.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)}="${element.dataset[key]}"]`;
    }
    return element.matches('.ship-preview canvas')
      ? '.ship-preview canvas'
      : null;
  }
  function focusMenu(target) {
    const element =
      typeof target === 'string' ? shell.querySelector(target) : target;
    if (!element || element.disabled) return;
    for (
      let details = element.closest('details');
      details;
      details = details.parentElement?.closest('details')
    )
      if (element.parentElement !== details || element.tagName !== 'SUMMARY')
        details.open = true;
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
            ? (shell.querySelector('.cup-picker [aria-pressed="true"]') ??
              shell.querySelector('.cup-scores > summary') ??
              shell.querySelector('.race-actions > .primary'))
            : `[data-level="${selected}"]`,
    );
  }
  function focusPickerHeader() {
    focusMenu(
      shell.querySelector('.picker-header button:last-child') ??
        shell.querySelector('[data-action="race-tab"]'),
    );
  }
  function setScreen(next) {
    if (disposed) return;
    const navigating = screen !== next;
    if (navigating) music?.close();
    if (screen === 'career' && next !== 'career')
      progressionMenu.unmountCareer();
    if (next !== 'results') cupCelebration = null;
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
    desktopControls?.mount(
      next === 'inspection' ? inspectorHost : shell.hidden ? null : shell,
    );
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
                : next === 'career'
                  ? '[data-export]'
                  : next === 'loading'
                    ? '[data-action="cancel"]'
                    : cupCelebration
                      ? '[data-action="cup-standings"]'
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
      )}</div><div class="transfer-slot track-transfer"></div></section>`;
  };
  const shipPanel = () =>
    garageView({
      profile: profile(),
      craft: ship(),
      selectedShip: shipId,
      lockedShip: lockedCup()?.shipId,
      stock: intent === 'time-trial',
      notice: garageNotice,
    });
  const modePicker = () => {
    const saved = cupStore.snapshot().state;
    const activeCup =
      saved && !cupComplete(saved) ? cupDefinition(saved.cupId) : null;
    const cupStatus = activeCup ? `${escape(activeCup.name)} in progress` : '';
    return `<nav class="mode-picker" aria-label="Game mode">${[
      ['quick-race', 'race', 'Quick Race'],
      ['cup-hub', 'cup', 'Championships'],
      ['time-trial', 'time-trial', 'Time Trial'],
      ['practice', 'practice', 'Practice'],
    ]
      .map(
        ([action, mode, label]) =>
          `<button data-action="${action}" aria-pressed="${intent === mode}"${mode === 'cup' && activeCup ? ` aria-describedby="active-cup-description" title="${cupStatus}"` : ''}>${label}${mode === 'cup' && activeCup ? `<img class="mode-cup-trophy" src="${cupArt(activeCup.id).trophy}" alt="" aria-hidden="true">` : ''}</button>`,
      )
      .join(
        '',
      )}${activeCup ? `<span id="active-cup-description" class="sr-only">${cupStatus}</span>` : ''}</nav>`;
  };
  const launchLabel = () =>
    intent === 'time-trial'
      ? 'Start Time Trial →'
      : intent === 'practice'
        ? 'Start Practice →'
        : isSprint()
          ? 'Start Sprint →'
          : 'Start race →';
  const raceActions = () => {
    if (intent === 'cup') {
      const state = cupStore.snapshot().state;
      const next = cupLaunch(
        state,
        selectedCup,
        sessionCup && game?.hasSession(),
      );
      return `<div class="race-actions"><button class="primary" data-action="${next.action}" ${cupConfirm ? 'disabled' : ''}><strong>${next.label}</strong><small>${next.detail}</small></button>${state ? '' : difficultyControls()}<p class="mode-description">Every valid race finish earns progress. Win the championship for cup rewards.</p></div>`;
    }
    const description =
      intent === 'time-trial' ? 'Manual boost · No road devices' : '';
    return `<div class="race-actions"><button class="primary" data-action="launch"><strong>${launchLabel()}</strong><small>${intent === 'race' ? `${isSprint() ? '1 descent' : '2 laps'} · ${RACE_OPPONENTS.length} rivals` : isSprint() ? '1 descent' : intent === 'practice' ? 'Open laps' : 'Unlimited laps'}</small></button>${intent === 'race' ? difficultyControls() : ''}${description ? `<p class="mode-description">${description}</p>` : ''}</div>`;
  };
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
    return `<section class="race-menu" aria-label="Session setup">${import.meta.env?.VN_EDITION === 'demo' ? '<p class="demo-edition">DEMO · Kestrel · 2 courses · Unlimited play</p>' : ''}${sessionReturn()}${modePicker()}<button class="menu-selection" data-action="circuits"><span>${cup ? 'Cup' : 'Track'}</span><div><strong>${escape(cup ? cup.name : level().name)}</strong><small>${cup ? `${cup.tracks.length} races · ${savedCup ? `${savedCup.results.length} scored` : 'Championship'}` : `${trackChallenge(selected)} · ${isSprint() ? 'Downhill sprint' : 'Circuit'}`}</small></div><b aria-hidden="true">›</b></button><button class="menu-selection" data-action="ship-step"><span>Ship</span><div><strong>${selectedCraft.name}</strong><small>${lockedCup() ? 'Locked for this cup' : selectedCraft.role}</small></div><b aria-hidden="true">${lockedCup() ? '—' : '›'}</b></button>${raceActions()}<div class="menu-extras"><button data-action="records" aria-pressed="${screen === 'records'}">Time Trial records</button>${developer ? button('inspect', 'Ship inspector') : ''}</div>${careerProgressView(profile())}${cupCabinet(cupCollection.snapshot())}${import.meta.env?.VN_DESKTOP === true ? `<nav class="menu-links" aria-label="Application">${button('desktop-quit', 'Quit game')}</nav>` : ''}<div class="transfer-slot menu-transfer"></div>${savedCup && !cup ? `<aside class="saved-cup">${button('saved-cup', `${cupDefinition(savedCup.cupId).name} · ${savedCup.results.length}/${cupDefinition(savedCup.cupId).tracks.length} scored →`)}</aside>` : ''}</section>`;
  };
  function cupPanel(withActions) {
    const cup = currentCup();
    return cupView({
      ...cupStore.snapshot(),
      collection: cupCollection.snapshot().cups,
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
          cupHero(cup, title, cupCollection.snapshot().cups, goalBadges()),
        actions: withActions ? raceActions() : '',
      },
    });
  }
  const topNavigation = () => {
    const active = showingShip()
      ? 'garage-tab'
      : utilityPage()
        ? screen
        : 'race-tab';
    const tabs = [
      ['race-tab', 'Race'],
      ['garage-tab', 'Garage'],
      ['settings', 'Settings'],
      ['career', 'Career'],
      ...(music ? [['tunes', 'Tunes']] : []),
    ];
    const switchCareer =
      career && onSwitchCareer
        ? '<button class="menu-switch-career" data-action="switch-career">Switch career <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 14-5-5 5-5M4 9h10a6 6 0 0 1 6 6v5"/></svg></button>'
        : '';
    return `<header class="menu-topbar"><span class="menu-wordmark">VECTOR<span>//</span>NOVA</span><nav class="menu-top-tabs" aria-label="Main navigation">${tabs.map(([action, label]) => `<button data-action="${action}" ${action === 'tunes' ? 'aria-expanded="false" aria-controls="music-panel"' : `aria-pressed="${active === action}"`}>${label}</button>`).join('')}${switchCareer}</nav></header>`;
  };
  const headerObserver = new ResizeObserver(updateHeaderClearance);
  life.signal.addEventListener('abort', () => headerObserver.disconnect(), {
    once: true,
  });
  function updateHeaderClearance() {
    const header = shell.querySelector('.menu-topbar');
    if (header)
      shell.style.setProperty(
        '--menu-header-clearance',
        `${Math.ceil(header.getBoundingClientRect().bottom + 20)}px`,
      );
  }
  function mountMenuHeader() {
    headerObserver.disconnect();
    const header = shell.querySelector('.menu-topbar');
    if (header) {
      updateHeaderClearance();
      headerObserver.observe(header);
    }
  }
  function renderMenu() {
    if (showingShip()) {
      shell.className = 'cinematic-menu garage-page';
      shell.innerHTML = `${topNavigation()}<main class="front-content dedicated-garage" aria-label="Ship garage">${shipPanel()}</main>`;
      menuBackdrop.mount(shell);
      mountMenuHeader();
      mountShipPreview();
      shell.querySelector('.ship-transfer')?.append(transfer);
      updateStatus();
      desktopControls?.mount(shell);
      return;
    }
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
      ? records
        ? `<header class="picker-tabs"><h2 class="records-heading">Records</h2>${button('records-back', recordsBack === 'results' ? '← Results' : '← Back')}</header>`
        : ''
      : `<header class="picker-header">${button(backAction, backLabel)}</header>`;
    const pickerContent = !picking
      ? ''
      : records
        ? recordsView({
            records: readTrialRecords(careerStorage()),
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
    shell.innerHTML = `${topNavigation()}<main class="front-content menu-layout ${wide ? 'menu-wide' : 'menu-narrow'}" data-page="${screen}">${wide || !picking ? homeMenu() : ''}${picking ? `<section class="menu-picker ${records ? 'menu-records-picker' : setup ? 'menu-ship-picker' : cup ? 'menu-cup-picker' : 'menu-track-picker'}" aria-label="${records ? 'Time Trial records' : setup ? 'Ship selection' : cup ? 'Championship selection' : 'Track selection'}">${pickerHeader}${pickerContent}</section>` : ''}</main>`;
    menuBackdrop.mount(shell);
    mountMenuHeader();
    if (!setup && !cup && !records && picking) showDetail(selected);
    if (showingShip()) mountShipPreview();
    shell
      .querySelector(
        '.ship-transfer, .menu-transfer, .track-transfer, .records-transfer',
      )
      ?.append(transfer);
    updateLaunchSummary();
    updateStatus();
    desktopControls?.mount(shell);
  }
  function render() {
    if (disposed) return;
    headerObserver.disconnect();
    disposeControllerSettings?.();
    disposeControllerSettings = null;
    menuBackdrop.configure({
      active: !shell.hidden && menuVisible(),
      reducedMotion: settings.reducedMotion,
    });
    if (shell.hidden) return;
    if (choosingSession()) {
      renderMenu();
      return;
    }
    if (screen === 'career') {
      shell.className = 'cinematic-menu utility-shell';
      shell.innerHTML = `${topNavigation()}<main class="front-content utility-page" data-page="career"><section class="utility-content" aria-label="Career and saves"></section></main>`;
      menuBackdrop.mount(shell);
      mountMenuHeader();
      const slot = shell.querySelector('.utility-content');
      progressionMenu.mountCareer(slot);
      desktopControls?.mount(shell);
      return;
    }
    shell.className =
      screen === 'settings'
        ? 'cinematic-menu utility-shell settings-page'
        : screen === 'loading'
          ? 'loading-page'
          : '';
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
    if (screen === 'loading') menuBackdrop.mount(shell);
    if (screen === 'settings') {
      shell.innerHTML = `${topNavigation()}<main class="front-content utility-page" data-page="settings"><header class="utility-heading"><div><span class="kicker">PREFERENCES</span><h1>Settings</h1></div>${button('settings-back', '← Back')}</header><section class="utility-content"></section></main>`;
      menuBackdrop.mount(shell);
      mountMenuHeader();
    }
    const main = shell.querySelector('.front-content');
    let content =
      screen === 'settings' ? main.querySelector('.utility-content') : main;
    if (screen === 'loading') {
      const inspecting = launchTarget === 'inspection';
      content.innerHTML = `<section class="loading-copy">${inspecting ? '' : `<div class="loading-card">${picture(route())}${routeArt(route())}</div>`}<div class="transfer-slot loading-transfer"></div>${heading(inspecting ? 'PREPARING STUDIO' : 'LOADING CIRCUIT', inspecting ? 'Ship inspector' : escape(level().name))}${inspecting ? '' : `<div class="session-facts">${facts()}</div><div class="loading-rewards">${goalBadges()}</div>`}<div class="front-actions">${button('cancel', 'Cancel')}${button('retry', 'Try again', true)}</div></section>`;
    } else if (screen === 'settings') {
      content.innerHTML = `${sessionReturn(true)}${settingsView(settings, {
        developer: parameters.get('dev') === '1',
        artPass,
      })}`;
      disposeControllerSettings = bindSettingsPanel(content, {
        getSettings: () => settings,
        signal: life.signal,
      });
    } else if (screen === 'results' && lastResults?.mode === 'cup') {
      content.innerHTML = cupCelebration
        ? cupVictoryView(cupStore.snapshot().state, {
            ...cupCelebration,
            notice: cupCollection.snapshot().notice,
          })
        : !lastResults.final
          ? cupWaitingView(lastResults)
          : cupView({
              ...cupStore.snapshot(),
              collection: cupCollection.snapshot().cups,
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
      content.innerHTML = `<section class="result-panel">${heading('FINISH / ' + escape(loadedLevel().name.toUpperCase()), title)}<div class="front-actions results-actions">${button('retry-race', 'Retry Quick Race →', true)}${button('continue', 'Continue driving')}${button('change', 'Back to setup')}</div><div class="results-layout"><section class="result-personal"><span class="kicker">${lastResults?.playerValid ? 'RACE TIME' : 'UNRANKED RUN'}</span><strong>${stamp(lastResults?.playerTotalTime)}</strong><p>${lastResults?.playerValid ? `${sprint ? 'One descent' : `${lastResults.laps ?? 2} laps`} · ${escape(lastResults.difficulty ?? settings.difficulty)}` : `${sprint ? 'This descent' : 'A lap'} was invalidated. This run does not count toward classification.`}</p><div class="lap-splits">${(lastResults?.playerLapTimes ?? []).map((t, i) => `<span>${sprint ? 'DESCENT' : `LAP ${i + 1}`}<b>${stamp(t)}</b></span>`).join('')}</div></section><section><ol class="results-list" aria-label="Race classification" tabindex="0"></ol><p class="results-note" role="status"></p></section></div></section>`;
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
        detail.innerHTML = `<p class="trial-best">PERSONAL BEST <b>${stamp(r.bestTime)}</b></p><h2 class="trial-split-title">Cumulative splits</h2><p class="trial-split-key">Elapsed time at each sector · − ahead / + behind previous best</p><ol class="trial-splits" aria-label="Cumulative splits against previous best">${r.splits.map((t, i) => `<li><span>${sprint ? '' : `L${Math.floor(i / 3) + 1} · `}S${(i % 3) + 1}</span><b>${stamp(t)}</b><span>${signed(r.splitDeltas[i])}</span></li>`).join('')}</ol><p class="results-note" role="status">${!r.playerValid ? 'Best and ghost unchanged.' : r.improved ? (r.saved.saved ? (r.saved.ghostSaved ? 'Best and personal ghost saved on this device.' : 'Best saved. Ghost could not be saved; storage may be full or the run exceeded 20 minutes.') : 'Storage unavailable. Best and ghost are kept for this page session only.') : r.ghostAvailable ? 'Personal best unchanged.' : 'Personal best unchanged. No compatible ghost is saved for this best.'}</p>`;
        const retry = content.querySelector('[data-action="retry-race"]');
        retry.textContent = 'Retry Time Trial →';
        const records = content.querySelector('[data-action="continue"]');
        records.dataset.action = 'records';
        records.textContent = 'Time Trial records';
      } else updateResults(lastResults);
    }
    if (
      screen === 'results' &&
      (lastResults?.mode !== 'cup' || lastResults.final)
    ) {
      const panel = content.querySelector('.result-panel, .cup-results-panel');
      const actions = panel?.querySelector(
        '.results-actions, .cup-result-actions',
      );
      const progression =
        raceProgressView(
          rewardStart,
          profile(),
          rewardContext ?? {},
          lastResults,
        ) + rewardsView(earnedRewards);
      panel?.insertAdjacentHTML('beforeend', progression);
      if (lastResults?.mode === 'cup')
        actions
          ?.querySelector('.front-actions')
          ?.insertAdjacentHTML(
            'beforeend',
            button('equipment', 'Change equipment'),
          );
    }
    const statusSlot = shell.querySelector('.transfer-slot');
    if (statusSlot) statusSlot.append(transfer);
    updateLaunchSummary();
    updateStatus();
    desktopControls?.mount(shell);
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
        shipPreview = createShipPreview({
          autoRotate: !settings.reducedMotion,
        });
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
      '.ship-details > h1',
      '.garage-role',
      '.garage-ship-status',
      '.garage-performance',
      '.garage-equipment',
      '.garage-footer',
    ]) {
      shell
        .querySelector(selector)
        ?.replaceWith(template.content.querySelector(selector));
    }
    shell.querySelector('.garage-exotic')?.remove();
    const exotic = template.content.querySelector('.garage-exotic');
    if (exotic) shell.querySelector('.garage-footer').before(exotic);
    for (const item of shell.querySelectorAll('button[data-ship]'))
      item.dataset.preview = String(item.dataset.ship === ship().id);
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
    node.innerHTML = `<div class="detail-image">${picture(r)}${routeArt(r)}${goalBadges(id)}${trackBadge(id)}<div class="track-caption"><h2>${escape(l.name)}</h2><p>${trackChallenge(id)} · ${r ? (r.length / 1000).toFixed(2) + ' km' : '—'}</p></div></div>`;
  }
  function showCupDetail(id) {
    const cup = cupDefinition(id),
      node = shell.querySelector('.cup-menu-panel .cup-hero');
    if (!cup || !node || cupStore.snapshot().state) return;
    node.outerHTML = cupHero(
      cup,
      escape(cup.name),
      cupCollection.snapshot().cups,
      goalBadges(),
    );
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
    if (disposed) return;
    const loading = screen === 'loading';
    const label = loading
      ? error ||
        `${launchTarget === 'inspection' ? 'Ship inspector' : level().name} · ${progress || 'Preparing session'}`
      : preload.loading
        ? 'Preparing ships'
        : preload.failed?.length
          ? 'Ship preload incomplete'
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
    if (disposed || !data) return;
    lastResults = data;
    if (data.mode === 'time-trial') return;
    if (data.mode === 'cup') {
      if (cupCelebration && shell.querySelector('.cup-victory')) return;
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
        const waiting = shell.querySelector('.cup-waiting');
        cupResultsKey = key;
        if (!data.final && waiting) {
          updateCupWaitingView(waiting, data);
          return;
        }
        const focused = focusSelector();
        render();
        if (data.final && waiting) {
          shell.scrollTop = 0;
          shell
            .querySelector(
              cupCelebration ? '[data-action="cup-standings"]' : 'h1',
            )
            ?.focus({ preventScroll: true });
        } else focusMenu(focused);
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
    if (disposed) throw new DOMException('Disposed', 'AbortError');
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
      const params =
        special || developer
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
        trialStorage: careerStorage(),
        onAttempt() {
          if (disposed || signal.aborted || token !== generation) return;
          beginRewardAttempt();
        },
        onTrialRecord(data) {
          if (disposed || signal.aborted || token !== generation) return;
          earnedRewards.push(
            ...profileStore.recordTrial(id, data.playerValid && data.improved),
          );
        },
        signal,
        onProgress(stage) {
          if (token === generation) {
            progress = stage;
            loadStep = Math.max(loadStep, loadStages.indexOf(stage));
            updateStatus();
          }
        },
        onHome(info) {
          if (disposed || signal.aborted || token !== generation) return;
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
          ? () => {
              if (!disposed && !signal.aborted && token === generation)
                music.open(gameHost.querySelector('#pause-tunes'));
            }
          : null,
        onSettings() {
          if (disposed || signal.aborted || token !== generation) return;
          settingsBack = 'race';
          settingsFocus = null;
          setScreen('settings');
        },
        onCircuit(next) {
          if (disposed || signal.aborted || token !== generation) return;
          leaveReview();
          selected = next;
          remember();
          setScreen('circuits');
        },
        onMode(mode) {
          if (disposed || signal.aborted || token !== generation) return;
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
              menuBackdrop.configure({
                active: false,
                reducedMotion: settings.reducedMotion,
              });
              gameHost.inert = false;
              document.body.dataset.screen = screen;
              updateStatus();
            }
          }
        },
        onCupRetry() {
          if (disposed || signal.aborted || token !== generation) return;
          if (sessionCup) cupStore.retry();
        },
        onResults(data) {
          if (disposed || signal.aborted || token !== generation) return;
          if (
            data.mode === 'cup' &&
            sessionCup &&
            data.final &&
            cupStore.finish(data)
          ) {
            const saved = cupStore.snapshot().state;
            const player = data.standings.find((row) => row.id === 'player');
            earnedRewards.push(
              ...profileStore.recordRace({
                id: `${saved.runId}:${saved.eventIndex}`,
                position: player?.position,
                valid: !!player?.valid,
                finished: !!player?.finished,
              }),
            );
            if (cupChampion(saved)) {
              earnedRewards.push(...profileStore.recordCup(saved.cupId));
              const fresh = cupCollection.award(saved);
              cupCelebration = { fresh, delay: game?.celebrateCup() ?? 0.6 };
            }
          } else if (
            data.mode !== 'cup' &&
            data.mode !== 'time-trial' &&
            sessionIntent === 'race'
          ) {
            const player = data.standings?.find((row) => row.id === 'player');
            earnedRewards.push(
              ...profileStore.recordRace({
                id: sessionRewardId,
                position: player?.position,
                valid: !!data.playerValid && !!player?.valid,
                finished: !!player?.finished,
              }),
            );
          }
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
    sounds?.mount();
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
        getProfile: profile,
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
      sounds?.mount(inspectorHost.querySelector('#inspection-tools'));
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
      beginRewardAttempt();
      current.setBuild?.(
        sessionBuild(profile(), shipId, { stock: intent === 'time-trial' }),
      );
      setScreen('race');
      if (intent === 'cup') {
        const state = cupStore.snapshot().state;
        const cup = cupDefinition(state.cupId);
        sessionCup = true;
        current.startCup({
          difficulty: state.difficulty,
          eventIndex: state.eventIndex,
          eventCount: cup.tracks.length,
          gridOrder: cupGridOrder(state),
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
  function openGarage(id = lockedCup()?.shipId ?? shipId) {
    if (showingShip()) {
      focusPicker();
      return;
    }
    garageBack = ['home', 'circuits', 'cup', 'records'].includes(screen)
      ? screen
      : intent === 'cup'
        ? 'cup'
        : 'home';
    garageFocus = focusSelector();
    garageNotice = '';
    setScreen('setup');
    showShip(id);
    focusMenu(`[data-ship="${id}"]`);
  }
  function closeGarage() {
    setScreen(garageBack);
    focusMenu(garageFocus ?? '.menu-selection[data-action="ship-step"]');
  }
  function goHome() {
    if (showingShip()) {
      closeGarage();
      return;
    }
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
  function openUtility(next) {
    if (screen === next) return;
    if (!utilityPage()) {
      settingsBack = screen;
      settingsFocus = focusSelector();
    }
    setScreen(next);
  }
  const actions = {
    equipment() {
      openGarage(lockedCup()?.shipId ?? shipId);
    },
    'race-tab'() {
      if (showingShip()) closeGarage();
      else if (utilityPage() || screen !== 'home') goHome();
      focusMenu('[data-action="race-tab"]');
    },
    'garage-tab'() {
      openGarage();
      focusMenu('[data-action="garage-tab"]');
    },
    'fit-exotic'() {
      progressionMenu.openExotic(ship().id);
    },
    career() {
      earnedRewards = [];
      openUtility('career');
    },
    'switch-career'() {
      if (!disposed && career) void onSwitchCareer?.();
    },
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
      if (recordShip !== 'all' && shipUnlocked(profile(), recordShip))
        shipId = recordShip;
      saveShipSelection(shipId, careerStorage());
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
    'cup-standings'() {
      cupCelebration = null;
      render();
      focusMenu('h1');
    },
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
      const action = cupConfirm;
      cupConfirm = null;
      render();
      const opener = shell.querySelector(`[data-action="cup-${action}"]`);
      focusMenu(opener);
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
      remember();
      openGarage();
    },
    tunes() {
      music?.open(shell.querySelector('[data-action="tunes"]'));
    },
    settings() {
      openUtility('settings');
    },
    'desktop-quit'() {
      window.vectorNovaDesktop?.quit();
    },
    'settings-back'() {
      const destination =
        ['race', 'results'].includes(settingsBack) && !game?.hasSession()
          ? 'home'
          : settingsBack;
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
        shipId = shipUnlocked(profile(), el.dataset.recordShip)
          ? el.dataset.recordShip
          : starterShip();
        saveShipSelection(shipId, careerStorage());
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
      } else if (el.dataset.equip) {
        if (
          intent === 'time-trial' ||
          (lockedCup() && lockedCup().shipId !== ship().id)
        )
          return;
        const id = ship().id;
        garageNotice = toggleGarageEquipment(
          profileStore,
          id,
          el.dataset.equip,
        );
        render();
        focusMenu(`[data-equip="${el.dataset.equip}"]`);
      } else if (el.dataset.ship) {
        const id = el.dataset.ship;
        if (
          !shipUnlocked(profile(), id) ||
          (lockedCup() && lockedCup().shipId !== id)
        ) {
          showShip(id);
          return;
        }
        shipId = id;
        previewShipId = null;
        saveShipSelection(id, careerStorage());
        remember();
        garageNotice = '';
        render();
        focusMenu(`[data-ship="${id}"]`);
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
      const cup = e.target.closest('button[data-cup]');
      if (cup && e.pointerType !== 'touch') showCupDetail(cup.dataset.cup);
      const chassis = e.target.closest('button[data-ship]');
      if (chassis && e.pointerType !== 'touch') showShip(chassis.dataset.ship);
    },
    { signal: life.signal },
  );
  shell.addEventListener(
    'focusin',
    (e) => {
      const cup = e.target.closest('button[data-cup]');
      if (cup) {
        showCupDetail(cup.dataset.cup);
        return;
      }
      const card = e.target.closest('button[data-level], button[data-ship]');
      if (!card) return;
      const selector = card.dataset.level
        ? '[data-level]'
        : 'button[data-ship]';
      if (!showingShip())
        for (const item of shell.querySelectorAll(selector))
          item.tabIndex = item === card ? 0 : -1;
      if (card.dataset.level) showDetail(card.dataset.level);
      else showShip(card.dataset.ship);
    },
    { signal: life.signal },
  );
  bindRewardDetails(shell, life.signal);
  function restoreSelection(e) {
    const circuitList = e.target.closest('.circuit-grid');
    if (
      circuitList &&
      !circuitList.contains(e.relatedTarget) &&
      !e.relatedTarget?.closest?.('.reward-badges')
    )
      showDetail(selected);
    const cupList = e.target.closest('.cup-picker');
    if (
      cupList &&
      !cupList.contains(e.relatedTarget) &&
      !e.relatedTarget?.closest?.('.reward-badges')
    )
      showCupDetail(currentCup().id);
    const shipList = e.target.closest('.ship-list');
    if (shipList && !showingShip() && !shipList.contains(e.relatedTarget))
      showShip(shipId);
  }
  shell.addEventListener('focusout', restoreSelection, { signal: life.signal });
  shell.addEventListener('pointerout', restoreSelection, {
    signal: life.signal,
  });
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
    },
    { signal: life.signal },
  );
  shell.addEventListener(
    'keydown',
    (e) => {
      if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey) return;
      if (
        e.target.closest('.menu-top-tabs') &&
        [
          'ArrowLeft',
          'ArrowRight',
          'ArrowUp',
          'ArrowDown',
          'Home',
          'End',
        ].includes(e.code)
      ) {
        e.preventDefault();
        if (e.code === 'ArrowDown') {
          if (showingShip()) focusPicker();
          else if (utilityPage()) {
            const controls = [
              ...shell.querySelectorAll('main button, main input, main select'),
            ];
            focusMenu(
              controls.find(
                (control) =>
                  !control.disabled &&
                  !control.hasAttribute('data-controller-skip') &&
                  control.getClientRects().length &&
                  !control.closest('[hidden], [inert]'),
              ),
            );
          } else
            focusMenu(
              '.mode-picker button[aria-pressed="true"], .picker-header button, .picker-tabs button',
            );
        } else {
          const tabs = [...shell.querySelectorAll('.menu-top-tabs button')];
          const index = tabs.indexOf(e.target.closest('button'));
          const next =
            e.code === 'Home'
              ? 0
              : e.code === 'End'
                ? tabs.length - 1
                : (index +
                    (e.code === 'ArrowLeft'
                      ? -1
                      : e.code === 'ArrowRight'
                        ? 1
                        : 0) +
                    tabs.length) %
                  tabs.length;
          focusMenu(tabs[next]);
        }
        return;
      }
      if (showingShip() && navigateGarage(e, shell)) return;
      const control = e.target.closest('button');
      const vertical = ['ArrowUp', 'ArrowDown'].includes(e.code);
      const edge = ['Home', 'End'].includes(e.code);
      const horizontal = ['ArrowLeft', 'ArrowRight'].includes(e.code);
      if (!control || (!vertical && !edge && !horizontal)) return;

      if (control.dataset.rewardInfo) {
        e.preventDefault();
        const chips = [
          ...control.closest('.reward-badges').querySelectorAll('button'),
        ];
        if (e.code === 'ArrowDown') focusPicker();
        else if (e.code === 'ArrowUp') focusMenu('[data-action="race-tab"]');
        else
          focusMenu(
            chips[
              e.code === 'Home'
                ? 0
                : e.code === 'End'
                  ? chips.length - 1
                  : Math.max(
                      0,
                      Math.min(
                        chips.length - 1,
                        chips.indexOf(control) +
                          (e.code === 'ArrowRight' ? 1 : -1),
                      ),
                    )
            ],
          );
        return;
      }
      if (control.closest('.mode-picker')) {
        e.preventDefault();
        if (
          e.code === 'ArrowUp' &&
          [...control.parentElement.children].indexOf(control) < 2
        ) {
          focusMenu('[data-action="race-tab"]');
          return;
        }
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
      const columns = card.dataset.cup
        ? items.filter(
            (item) =>
              Math.abs(
                item.getBoundingClientRect().top -
                  items[0].getBoundingClientRect().top,
              ) < 1,
          ).length
        : card.dataset.level || card.dataset.ship
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
      if (card.dataset.cup) {
        const current = items.indexOf(card);
        if (e.code === 'ArrowUp' && current < columns) {
          const reward = shell.querySelector('.cup-hero .reward-chip');
          if (reward) focusMenu(reward);
          else focusPickerHeader();
          return;
        }
        if (e.code === 'ArrowDown' && current + columns >= items.length) {
          focusMenu('[data-action="cup-start"]');
          return;
        }
        if (
          e.code === 'ArrowLeft' &&
          current % columns === 0 &&
          wideMenu.matches
        ) {
          focusMenu('.menu-selection[data-action="circuits"]');
          return;
        }
      }
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
          const reward = shell.querySelector('.detail-image .reward-chip');
          if (reward) focusMenu(reward);
          else focusPickerHeader();
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
        else if (utilityPage()) actions['settings-back']();
        else if (screen === 'records') actions['records-back']();
        else if (cupConfirm) actions['cup-cancel']();
        else if (screen === 'results') {
          if (cupCelebration) actions['cup-standings']();
          else if (lastResults?.mode === 'cup') openCup();
          else actions.change();
        } else if (
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
  let disposal;
  function dispose() {
    if (disposal) return disposal;
    disposed = true;
    generation++;
    launchGeneration++;
    previewGeneration++;
    controller?.abort();
    inspectorController?.abort();
    life.abort();
    game?.dispose();
    game = null;
    inspector?.dispose();
    inspector = null;
    music?.close();
    if (!sharedMusic) music?.dispose();
    sounds?.dispose();
    shipPreview?.dispose();
    unsubscribeCache?.();
    unsubscribeSettings?.();
    disposeControllerSettings?.();
    progressionMenu.unmountCareer();
    disposal = Promise.allSettled([pending?.promise, inspectorPending]).then(
      () => {
        // Parsed fleet sources and their decoder belong to the page session.
        // Career switches dispose instances above; pagehide releases the cache.
        if (!import.meta.env?.VN_DESKTOP) delete window.__VN_FRONTEND;
        host.replaceChildren();
      },
    );
    return disposal;
  }
  window.addEventListener('pagehide', () => void dispose(), {
    once: true,
    signal: life.signal,
  });
  unsubscribeSettings = subscribeSettings((next) => {
    settings = { ...next };
    menuBackdrop.configure({
      active: !shell.hidden && menuVisible(),
      reducedMotion: settings.reducedMotion,
    });
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
        cupCollection: cupCollection.snapshot(),
        cupCelebration: !!cupCelebration,
        selectedCup,
        sessionCup,
        shipId,
        career: profileStore.snapshot(),
        careerSlot: career ? { id: career.id, name: career.name } : null,
        developer: !!developer,
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
          if (disposed) return;
          preload.label = 'Fleet preload unavailable';
          updateStatus();
        });
    });
  }
  return {
    dispose,
    clearInput: () => game?.clearInput(),
  };
}
