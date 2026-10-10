import { discoverLevels } from '../levels/catalog.js';
import routes from 'virtual:menu-catalog';
import {
  SHIPS,
  loadShipSelection,
  saveShipSelection,
} from '../ships/catalog.js';
import {
  loadSettings,
  saveSettings,
  subscribeSettings,
  vesperGraphicsDefaults,
} from '../progression/index.js';
import { vesperGraphicsControls } from '../ui/graphics-settings.js';
import { createMusicPlayer } from '../audio/player.js';
import { assetURL } from '../assets/url.js';
import {
  artViewParameters,
  runtimeEntryParameters,
  readArtView,
} from '../core/art-pass.js';
import '../ui/style.css';
import './style.css';

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
  let screen = 'circuits',
    intent = 'race';
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
  let settingsBack = 'circuits';
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
  // Match the CSS workbench breakpoint; both layouts reuse the same controls.
  const wideMenu = matchMedia('(min-width: 1200px)');
  const choosingSession = () => ['circuits', 'setup'].includes(screen);
  const showingShip = () =>
    screen === 'setup' || (screen === 'circuits' && wideMenu.matches);
  host.innerHTML =
    '<div id="game-host"></div><div id="front-shell"></div><aside class="transfer-status" aria-label="Loading status"><span role="status"></span><progress max="1" value="0"></progress><button type="button" class="retry-fleet" hidden>Retry fleet preload</button></aside>';
  const transfer = host.querySelector('.transfer-status');
  const gameHost = host.querySelector('#game-host');
  const shell = host.querySelector('#front-shell');
  const music =
    artPass || inspectShip || parameters.get('music') === '0'
      ? null
      : createMusicPlayer(host, { clearInput: () => game?.clearInput() });
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
  const sessionLabel = () =>
    intent === 'practice'
      ? sessionName()
      : `${sessionName()} · ${settings.difficulty}`;
  const loadedLevel = () => catalog.find((l) => l.id === loadedId) ?? level();
  const difficultyControls = () =>
    `<fieldset class="race-difficulty"><legend>Race difficulty</legend>${['easy', 'medium', 'hard'].map((d) => `<button data-difficulty="${d}" aria-pressed="${settings.difficulty === d}" tabindex="${settings.difficulty === d ? 0 : -1}">${d}</button>`).join('')}</fieldset>`;
  const facts = () =>
    `<span>${route() ? (route().length / 1000).toFixed(2) + ' KM' : 'CIRCUIT'}</span><span>${route()?.closed === false ? 'POINT TO POINT' : intent === 'practice' ? 'OPEN PRACTICE' : '2 LAPS'}</span><span>${intent === 'practice' ? 'SOLO' : '4 PILOTS'}</span>`;
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
    screen = next;
    previewShipId = null;
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
    const focus =
      next === 'circuits'
        ? `[data-level="${selected}"]`
        : next === 'setup'
          ? `button[data-ship="${shipId}"]`
          : 'h1';
    shell.querySelector(focus)?.focus({ preventScroll: true });
    if (next === 'circuits')
      shell.querySelector(focus)?.scrollIntoView({ block: 'nearest' });
    updateStatus();
  }
  function heading(kicker, title) {
    return `<div class="front-heading"><span class="kicker">${kicker}</span><h1 tabindex="-1">${title}</h1></div>`;
  }
  function modeButton(action, label, detail, active) {
    return `<button data-action="${action}" aria-pressed="${active}" class="session-mode ${active ? 'selected' : ''}">${label}<span>${detail}${wideMenu.matches ? '' : ' →'}</span></button>`;
  }
  const circuitPanel = () =>
    `<div class="circuit-layout"><section class="circuit-library"><div class="circuit-grid" aria-label="Circuits">${catalog.map((l, i) => `<button class="circuit-card ${l.id === selected ? 'selected' : ''}" data-level="${l.id}" tabindex="${l.id === selected ? 0 : -1}" aria-pressed="${l.id === selected}">${picture(route(l.id))}<span class="card-number">${String(i + 1).padStart(2, '0')}</span>${routeArt(route(l.id))}<span class="card-name">${escape(l.name)}</span><small>${route(l.id) ? (route(l.id).length / 1000).toFixed(2) + ' KM' : 'CIRCUIT'} <i>/</i> ${route(l.id)?.closed === false ? 'SPRINT' : 'CIRCUIT'}</small></button>`).join('')}</div><span class="library-hint">${catalog.length} CIRCUITS <i>↓</i> SCROLL TO EXPLORE</span></section><aside class="circuit-detail"><div class="circuit-hero"></div><div class="mode-actions" aria-label="Choose session"><div class="quick-race-option">${difficultyControls()}${modeButton('quick', sessionName(selected, false), isSprint() ? 'One descent · 3 rivals' : '2 laps · 3 rivals', intent === 'race')}</div><div class="practice-option">${modeButton('practice', sessionName(selected, true), isSprint() ? 'Solo · summit to finish' : 'Solo · open laps', intent === 'practice')}</div></div></aside></div>`;
  // Share one intrinsic text area: the longest wrapped description reserves
  // space for every ship without fixed heights, clipping or resize handlers.
  const shipDescription = () =>
    `<p class="ship-description">${SHIPS.map(
      (s) =>
        `<span${s.id === ship().id ? '' : ' aria-hidden="true"'}>${escape(s.description)}</span>`,
    ).join('')}</p>`;
  const shipPanel = () =>
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
      )}</div><p class="stat-note">Handling and braking are relative ratings.</p></aside></div>`;
  const launchLabel = () =>
    isSprint()
      ? 'Start descent →'
      : intent === 'practice'
        ? 'Start practice →'
        : 'Start race →';
  const launchControls = () =>
    `<div class="front-actions setup-actions"><span class="launch-summary">${escape(level().name)} <i>/</i> ${escape(sessionLabel())}</span>${button('launch', launchLabel(), true)}</div>`;
  function render() {
    if (shell.hidden) return;
    const libraryScroll = shell.querySelector('.circuit-grid')?.scrollTop;
    const title = {
      circuits: wideMenu.matches ? 'RACE SETUP' : 'SELECT CIRCUIT',
      setup: wideMenu.matches ? 'RACE SETUP' : 'CHOOSE SHIP',
      loading: 'PREPARING SESSION',
      settings: 'SETTINGS',
      results: 'SESSION COMPLETE',
    }[screen];
    shell.innerHTML = `<header class="front-header"><button class="front-brand" data-action="home" aria-label="Vector Nova circuits">VECTOR<span>//</span>NOVA</button><span class="header-label">${title}</span>${screen !== 'loading' ? button('settings', 'Settings') : ''}</header><main class="front-content" data-page="${screen}"></main><footer class="front-footer"><span>${screen === 'circuits' ? 'ARROWS · BROWSE <i>/</i> ENTER · SELECT <i>/</i> TAB · CONTROLS' : `${sessionName(screen === 'results' ? loadedId : selected, screen !== 'results' && intent === 'practice').toUpperCase()} <i>/</i> ${escape((screen === 'results' ? loadedLevel() : level()).name.toUpperCase())}`}</span></footer>`;
    const main = shell.querySelector('.front-content');
    let content = main;
    if (choosingSession()) {
      if (wideMenu.matches) {
        main.classList.add('flow-workbench');
        main.innerHTML = `<div class="workbench-layout">${circuitPanel()}<section class="ship-pane" aria-label="Ship selection">${shipPanel()}</section></div>${launchControls()}`;
      } else {
        main.classList.add('flow-accordion');
        main.innerHTML = ['circuits', 'setup']
          .map((step, i) => {
            const open = screen === step;
            const summary =
              step === 'circuits'
                ? `${level().name} / ${sessionLabel()}`
                : `${selectedShip().name} / ${selectedShip().role}`;
            return `<section class="flow-step ${open ? 'open' : ''}" data-step="${step}"><h2 class="step-heading"><button class="step-toggle" data-action="${step === 'circuits' ? 'circuits' : 'ship-step'}" aria-expanded="${open}" aria-controls="${step}-panel"><span class="step-number">0${i + 1}</span><strong>${step === 'circuits' ? 'Circuit & session' : 'Ship'}</strong><span class="step-summary">${escape(summary)}</span><b aria-hidden="true">${open ? '−' : '+'}</b></button></h2><div id="${step}-panel" class="step-panel" ${open ? '' : 'hidden'}></div>${step === 'setup' && !open ? '<div class="transfer-slot collapsed-transfer"></div>' : ''}</section>`;
          })
          .join('');
        content = main.querySelector(`#${screen}-panel`);
        content.innerHTML =
          screen === 'circuits'
            ? circuitPanel()
            : shipPanel() + launchControls();
      }
      showDetail(selected);
      if (showingShip()) mountShipPreview();
    } else if (screen === 'loading') {
      content.innerHTML = `<section class="loading-copy"><div class="loading-card">${picture(route())}${routeArt(route())}</div><div class="transfer-slot loading-transfer"></div>${heading('LOADING CIRCUIT', escape(level().name))}<div class="session-facts">${facts()}</div><div class="front-actions">${button('cancel', 'Cancel')}${button('retry', 'Try again', true)}</div></section>`;
    } else if (screen === 'settings') {
      content.innerHTML = `${heading('PREFERENCES', 'Set your pace.')}<div class="settings-layout"><section class="settings-form"><label><span>Graphics <small>High adds ambient occlusion and postprocessing. Low reduces GPU load.</small></span><select data-setting="quality"><option value="high">High</option><option value="low">Low</option></select></label><label><span>Effects volume <small>Tunes has its own volume control.</small></span><input data-setting="volume" type="range" min="0" max="1" step=".05" value="${settings.volume}"></label><label><span>Reduced motion <small>Reduces decorative motion and distortion.</small></span><input data-setting="reducedMotion" type="checkbox" ${settings.reducedMotion ? 'checked' : ''}></label><p>Saved on this device.</p></section><section class="keyboard-guide" aria-label="Keyboard shortcuts"><h2>Keyboard</h2>${[
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
          'Ship preview',
          [
            ['Arrows / drag', 'Rotate the focused ship'],
            ['Home', 'Reset the view'],
          ],
        ],
        [
          'Driving',
          [
            ['WASD / Arrows', 'Throttle, brake and steer'],
            ['Shift', 'Boost'],
            ['Space', 'Airbrake'],
            ['Esc', 'Pause / resume'],
            ['R', 'Recover at checkpoint / retry finished sprint'],
            ['C', 'Change camera'],
            ['I', 'Ship inspection'],
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
        .join(
          '',
        )}</section></div><div class="front-actions">${button('settings-back', '← Back')}</div>`;
      content.querySelector('select').value = settings.quality;
      content
        .querySelector('.settings-form')
        .insertAdjacentHTML('beforeend', vesperGraphicsControls(settings));
      content.querySelector('[data-graphics-reset]').onclick = () =>
        saveSettings(vesperGraphicsDefaults);
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
      content.innerHTML = `<section class="result-panel">${heading('FINISH / ' + escape(loadedLevel().name.toUpperCase()), title)}<div class="results-layout"><section class="result-personal"><span class="kicker">${lastResults?.playerValid ? 'RACE TIME' : 'UNRANKED RUN'}</span><strong>${stamp(lastResults?.playerTotalTime)}</strong><p>${lastResults?.playerValid ? `${sprint ? 'One descent' : `${lastResults.laps ?? 2} laps`} · ${escape(lastResults.difficulty ?? settings.difficulty)}` : `${sprint ? 'This descent' : 'A lap'} was invalidated. This run does not count toward classification.`}</p><div class="lap-splits">${(lastResults?.playerLapTimes ?? []).map((t, i) => `<span>${sprint ? 'DESCENT' : `LAP ${i + 1}`}<b>${stamp(t)}</b></span>`).join('')}</div></section><section><ol class="results-list" aria-label="Race classification"></ol><p class="results-note" role="status"></p></section></div><div class="front-actions results-actions">${button('retry-race', 'Race again →', true)}${button('continue', 'Continue driving')}${button('change', 'Circuits')}</div></section>`;
      updateResults(lastResults);
    }
    if (choosingSession() && game?.hasSession()) {
      const sessionReturn = `<aside class="session-return"><span>SESSION ON HOLD <b>${escape(loadedLevel().name)}</b></span>${button('resume-session', 'Resume →')}</aside>`;
      if (wideMenu.matches)
        main
          .querySelector('[data-action="launch"]')
          .insertAdjacentHTML('beforebegin', sessionReturn);
      else main.insertAdjacentHTML('afterbegin', sessionReturn);
    }
    const statusSlot = shell.querySelector('.transfer-slot');
    if (statusSlot) statusSlot.append(transfer);
    const library = shell.querySelector('.circuit-grid');
    if (library && libraryScroll != null) library.scrollTop = libraryScroll;
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
    node.innerHTML = `<div class="detail-image">${picture(r)}${routeArt(r)}<span>${id === selected ? 'SELECTED CIRCUIT' : 'PREVIEW'}</span></div><span class="kicker">${escape(l.ui.subtitle)}</span><h2>${escape(l.name)}</h2><p>${escape(l.ui.intro.replace(/the Kestrel/g, 'your ship'))}</p><div class="detail-facts"><span>${r ? (r.length / 1000).toFixed(2) + ' KM' : '—'}</span><span>${r?.closed === false ? 'SPRINT' : 'CIRCUIT'}</span></div>`;
  }
  function selectCircuit(id) {
    invalidLevel = false;
    selected = id;
    remember();
    for (const card of shell.querySelectorAll('[data-level]')) {
      const active = card.dataset.level === selected;
      card.classList.toggle('selected', active);
      card.setAttribute('aria-pressed', active);
      card.tabIndex = active ? 0 : -1;
    }
    showDetail(id);
    updateLaunchSummary();
    const summary = shell.querySelector('[data-step="circuits"] .step-summary');
    if (summary) summary.textContent = `${level().name} / ${sessionLabel()}`;
  }
  function updateLaunchSummary() {
    for (const [action, practice, detail] of [
      [
        'quick',
        false,
        isSprint() ? 'One descent · 3 rivals' : '2 laps · 3 rivals',
      ],
      [
        'practice',
        true,
        isSprint() ? 'Solo · summit to finish' : 'Solo · open laps',
      ],
    ]) {
      const mode = shell.querySelector(`[data-action="${action}"]`);
      if (mode)
        mode.innerHTML = `${sessionName(selected, practice)}<span>${detail}${wideMenu.matches ? '' : ' →'}</span>`;
    }
    const launch = shell.querySelector('[data-action="launch"]');
    if (launch) launch.textContent = launchLabel();
    const summary = shell.querySelector('.launch-summary');
    if (summary)
      summary.textContent = `${level().name} / ${sessionLabel()} / ${selectedShip().name}`;
  }
  function updateStatus() {
    const loading = screen === 'loading';
    const label = loading
      ? error || `${level().name} · ${progress || 'Preparing session'}`
      : preload.label;
    const fraction = loading
      ? loadStep / (loadStages.length - 1)
      : preload.fraction;
    transfer.hidden = !(choosingSession() || loading);
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
            if (screen !== 'inspection' || inspectShip) leaveReview();
            setScreen(screen === 'inspection' ? 'setup' : 'circuits');
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
  async function launch() {
    if (launching) return;
    launching = true;
    const attempt = ++launchGeneration;
    music?.startWithGame();
    error = '';
    progress = 'Reading circuit';
    loadStep = 0;
    setScreen('loading');
    try {
      const current = await prepare();
      if (attempt !== launchGeneration || screen !== 'loading') return;
      current.configure(settings);
      current.prepareSession();
      if (
        current.getSnapshot().ship.id !== shipId &&
        !(await current.selectShip(shipId))
      )
        throw new Error('Ship could not be loaded. Try again.');
      if (attempt !== launchGeneration || screen !== 'loading') return;
      current.setSuspended(false);
      setScreen('race');
      if (intent === 'practice') current.practice();
      else current.start();
    } catch (e) {
      if (attempt === launchGeneration && e.name !== 'AbortError') {
        error = e.message;
        updateStatus();
      }
    } finally {
      if (attempt === launchGeneration) launching = false;
    }
  }
  function cancel(destination = invalidLevel ? 'circuits' : 'setup') {
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
      cancel('circuits');
      return;
    }
    if (game) game.returnToSetup();
    else leaveReview();
    setScreen('circuits');
  }
  function selectMode(action) {
    if (wideMenu.matches) {
      render();
      shell
        .querySelector(`[data-action="${action}"]`)
        ?.focus({ preventScroll: true });
    } else setScreen('setup');
  }
  const actions = {
    home: goHome,
    'resume-session'() {
      if (!game?.hasSession()) return;
      setScreen('race');
      game.resumeSession();
    },
    quick() {
      intent = 'race';
      remember();
      selectMode('quick');
    },
    practice() {
      intent = 'practice';
      remember();
      selectMode('practice');
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
      setScreen(settingsBack);
      if (settingsBack === 'results') game?.showResults();
    },
    launch() {
      void launch();
    },
    'retry-preview'() {
      mountShipPreview();
    },
    cancel,
    retry() {
      if (special) void launchSpecial();
      else void launch();
    },
    'retry-race'() {
      setScreen('race');
      music?.startWithGame();
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
      music?.startWithGame();
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
      if (card) showDetail(card.dataset.level);
      const chassis = e.target.closest('button[data-ship]');
      if (chassis) showShip(chassis.dataset.ship);
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
      const toggle = e.target.closest('.step-toggle');
      if (toggle && ['ArrowUp', 'ArrowDown', 'Home', 'End'].includes(e.code)) {
        const headers = [...shell.querySelectorAll('.step-toggle')];
        e.preventDefault();
        const index =
          e.code === 'Home'
            ? 0
            : e.code === 'End'
              ? headers.length - 1
              : (headers.indexOf(toggle) +
                  (e.code === 'ArrowUp' ? -1 : 1) +
                  headers.length) %
                headers.length;
        headers[index].focus();
        return;
      }
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
      const next = items[index];
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
      }
    },
    { signal: life.signal },
  );
  wideMenu.addEventListener(
    'change',
    () => {
      if (!choosingSession()) return;
      const focused = document.activeElement;
      const onShip = focused?.closest('.ship-pane');
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
      if (!wideMenu.matches)
        screen =
          onShip || focused?.dataset.action === 'launch' ? 'setup' : 'circuits';
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
    const summary = shell.querySelector('[data-step="circuits"] .step-summary');
    if (summary) summary.textContent = `${level().name} / ${sessionLabel()}`;
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
    setScreen('circuits');
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
