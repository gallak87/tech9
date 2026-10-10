import './style.css';
import { SHIPS } from '../ships/catalog.js';
import { RIVAL_SHIPS } from '../ships/rivals.js';
import { circuitURL } from '../levels/contract.js';
import { vesperGraphicsDefaults } from '../progression/index.js';
import { vesperGraphicsControls } from './graphics-settings.js';

const racerColors = Object.freeze({
  player: '#fb7959',
  rook: '#72d9ff',
  latch: '#c799ff',
  mule: '#ffe075',
});

// Compare the actual tuning across the fleet; no separate cosmetic ratings.
const shipStats = [
  {
    id: 'speed',
    label: 'SPEED',
    value: (h) => h.cruiseSpeed,
    format: (value) => `${Math.round(value * 3.6)} km/h`,
  },
  { id: 'acceleration', label: 'ACCEL', value: (h) => h.thrust },
  { id: 'handling', label: 'HANDLING', value: (h) => h.turn },
  { id: 'braking', label: 'BRAKING', value: (h) => h.braking },
  { id: 'grip', label: 'GRIP', value: (h) => h.grip },
  {
    id: 'boost',
    label: 'BOOST',
    value: (h) => 100 / h.boostDrain,
    format: (value) => `${value.toFixed(1)} s`,
  },
].map((stat) => ({
  ...stat,
  maximum: Math.max(...SHIPS.map((craft) => stat.value(craft.handling))),
}));

export function createUI(
  host,
  actions,
  settings,
  track,
  {
    metadata,
    circuits,
    shape: blockout = false,
    selectedShip = SHIPS[0],
    racing = false,
    playtest = null,
    playtestCase = null,
  },
) {
  const root = document.createElement('main');
  const listeners = new AbortController();
  root.id = 'interface';
  root.classList.toggle('jump-playtest', Boolean(playtest));
  host.append(root);
  root.innerHTML = `<header class="masthead"><a class="wordmark" href="#" aria-label="Vector Nova home">VECTOR<span>//</span>NOVA</a><div class="edition"><i></i> <span></span></div><button class="quiet" id="pause-button" aria-label="Pause">Ⅱ</button></header>
 <section id="title-panel" class="panel"><h1><span class="circuit-name"></span><em></em></h1><p class="intro"></p><div class="track-facts"><div><b>${(track.length / 1000).toFixed(2)}</b><span>KM CIRCUIT</span></div><div><b>04</b><span>SHIPS</span></div><div><b>∞</b><span>PRACTICE LAPS</span></div></div><div class="actions launch-actions"><button id="start" class="primary">ENTER PROVING LOOP <span>↗</span></button><button id="practice">PRACTICE LAP <span>↗</span></button></div><div class="actions inspection-actions"><button id="inspect">INSPECT SHIPS <span>↗</span></button><button id="explore">FREE CAMERA <span>F</span></button></div></section>
 <section id="inspection-panel" class="panel hidden"><div class="eyebrow">AERODYNAMICS DIVISION / 07</div><h1 class="inspect-title" aria-live="polite">KESTREL<span class="dot">.</span></h1><p class="intro">Twin-core magnetic interceptor.<br>Ceramic armour. Exposed titanium propulsion.<br>Built to stay close to the limit.</p><dl><div><dt>DESIGN</dt><dd>Split prow / swept ceramic chassis</dd></div><div><dt>PROPULSION</dt><dd>Dual induction turbines</dd></div></dl><div class="actions"><button id="inspect-start" class="primary">DRIVE PROTOTYPE <span>↗</span></button><button id="inspect-back">BACK TO PROVING GROUND</button></div></section>
 <section id="pause-panel" class="modal hidden"><div class="eyebrow">SESSION PAUSED</div><h2>TAKE A BREATH.</h2><button id="resume" class="primary">RESUME SESSION ↗</button><button id="pause-results" class="hidden">RESULTS</button><button id="pause-explore">FREE CAMERA · F</button><button id="restart">RESTART RACE</button><button id="home">CIRCUITS</button><label>EFFECTS VOLUME <input id="volume" type="range" min="0" max="1" step=".05" value="${settings.volume}"></label><label>GRAPHICS <select id="quality"><option value="high">High</option><option value="low">Low</option></select></label><label>REDUCED MOTION <input id="motion" type="checkbox" ${settings.reducedMotion ? 'checked' : ''}></label><p class="small">Settings are saved locally. Tunes stays available while paused.</p></section>
 <section id="hud" class="hidden"><div class="top-telemetry"><div class="position hidden"><span>POSITION</span><b id="position">1 / 4</b><small id="position-state"></small></div><div class="lap"><span>PRACTICE LAP</span><b id="lap">01</b></div><div class="timing"><span>LAP TIME</span><b id="time">00:00.000</b><small id="last">LAST —</small><small id="best">SET YOUR FIRST CLEAN LAP</small></div><div class="section-name"><span></span><b id="section">PROVING STRAIGHT</b></div></div><div class="telemetry"><div class="energy"><span>CORE RESERVE <b id="energy-label">100%</b></span><div class="energy-track"><i id="energy-fill"></i></div><small id="energy-state">BOOST DRAWS FROM IMPACT RESERVE</small></div><div class="speed"><strong id="speed">000</strong><span>KM/H</span><i id="boost-status">MAGNETIC DRIVE</i></div></div><canvas id="minimap" width="200" height="150" aria-label="Track map"></canvas><div id="notice" role="status"></div></section>
 <footer id="legend"><div><kbd>W</kbd><kbd>↑</kbd><span>THROTTLE</span></div><div><kbd>A</kbd><kbd>D</kbd><span>STEER</span></div><div><kbd>S</kbd><span>BRAKE</span></div><div><kbd>SPACE</kbd><span>AIRBRAKE</span></div><div><kbd>SHIFT</kbd><span>BOOST</span></div><div><kbd>R</kbd><span>RESET</span></div><div><kbd>ESC</kbd><span>PAUSE</span></div></footer>
 <div id="touch" class="hidden"><div><button data-drive="left" aria-label="Steer left">◀</button><button data-drive="right" aria-label="Steer right">▶</button><button data-drive="brake">BRAKE</button></div><div><button data-drive="airbrake">SLIP</button><button data-drive="boost">BOOST</button><button data-drive="throttle">GO</button></div></div><div class="review-tag"><span></span></div>`;
  const $ = (id) => root.querySelector('#' + id);
  let casePicker = null;
  if (playtest?.cases?.length > 1) {
    casePicker = document.createElement('div');
    casePicker.className = 'circuit-picker';
    const label = document.createElement('label');
    label.htmlFor = 'playtest-case';
    label.textContent = 'CONTACT TEST CASE';
    const select = document.createElement('select');
    select.id = 'playtest-case';
    for (const entry of playtest.cases) {
      const option = document.createElement('option');
      option.value = entry.id;
      option.textContent = entry.label;
      select.append(option);
    }
    select.value = playtestCase;
    select.addEventListener('change', () =>
      actions.selectPlaytestCase(select.value),
    );
    casePicker.append(label, select);
    $('title-panel').insertBefore(casePicker, $('start').closest('.actions'));
  }
  if (playtest) {
    const repeat = document.createElement('button');
    repeat.id = 'jump-repeat';
    repeat.className = 'quiet hidden';
    repeat.textContent = 'REPEAT CASE · R';
    root.querySelector('.masthead').append(repeat);
    repeat.addEventListener('click', actions.repeatPlaytest);
    $('restart').textContent = 'REPEAT CONTACT CASE';
  }
  const escapeLabel = [...root.querySelectorAll('#legend kbd')].find(
    (key) => key.textContent === 'ESC',
  ).nextElementSibling;
  const roster = document.createElement('aside');
  roster.id = 'race-roster';
  roster.className = 'hidden';
  roster.setAttribute('aria-label', 'Race timing and placements');
  roster.innerHTML = `<div class="roster-heading"><span></span><b></b></div><ol></ol><div class="roster-laps"></div><p class="roster-hint"></p>`;
  root.append(roster);
  const lights = document.createElement('section');
  lights.id = 'start-lights';
  lights.className = 'hidden';
  lights.setAttribute('role', 'status');
  lights.innerHTML =
    '<span>START SEQUENCE</span><div aria-hidden="true"><i></i><i></i><i></i></div><b>3</b><small>HOLD THROTTLE · GREEN TO GO</small>';
  root.append(lights);
  const finish = document.createElement('section');
  finish.id = 'race-finish';
  finish.className = 'hidden';
  finish.setAttribute('role', 'status');
  finish.innerHTML = '<span>FINISH</span><strong></strong><small></small>';
  root.append(finish);
  let rosterKey = '',
    currentCompetition = null,
    retainedResults = null;
  function updateRoster() {
    const driving = oldMode === 'racing' || oldMode === 'countdown';
    const paddock = oldMode === 'title';
    const data = paddock
      ? retainedResults
      : driving &&
          currentCompetition?.enabled &&
          !currentCompetition.playerFinished
        ? currentCompetition
        : null;
    roster.classList.toggle('hidden', !data);
    roster.classList.toggle('in-paddock', paddock);
    root.classList.toggle('has-live-race', Boolean(data) && !paddock);
    const rosterParent =
      paddock && (innerWidth <= 760 || innerHeight <= 570)
        ? $('title-panel')
        : root;
    if (roster.parentElement !== rosterParent) rosterParent.append(roster);
    if (!data) return;
    const rows = paddock ? data.standings : (data.relative?.field ?? []);
    const gapText = (entry) => {
      if (entry.direction === 'self') return '0.0s';
      const sign = entry.direction === 'ahead' ? '−' : '+';
      if (entry.seconds !== null) {
        const seconds = entry.seconds.toFixed(1);
        return `${seconds === '0.0' ? '' : sign}${seconds}s`;
      }
      if (entry.lapGap > 0)
        return `${sign}${entry.lapGap} LAP${entry.lapGap === 1 ? '' : 'S'}`;
      return entry.finished ? 'FINISHED' : '—';
    };
    const key = JSON.stringify({
      paddock,
      rows: rows.map((entry) => ({
        ...entry,
        seconds: entry.seconds == null ? null : entry.seconds.toFixed(1),
        currentLapTime: undefined,
        distance: undefined,
        speed: undefined,
        lateral: undefined,
      })),
    });
    if (key === rosterKey) return;
    rosterKey = key;
    roster.querySelector('.roster-heading span').textContent = paddock
      ? 'LAST SESSION'
      : 'RACE ORDER';
    const heading = roster.querySelector('.roster-heading b');
    heading.textContent = paddock
      ? `${metadata.name.toUpperCase()} · 2 LAPS`
      : 'GAP TO YOU';
    const entries = rows.map((entry) => {
      const row = document.createElement('li');
      row.dataset.racer = entry.id;
      row.style.setProperty('--racer-color', racerColors[entry.id]);
      row.classList.toggle('is-player', entry.id === 'player');
      const place = document.createElement('b');
      place.textContent =
        entry.position === null ? '—' : String(entry.position).padStart(2, '0');
      const name = document.createElement('span');
      name.textContent =
        entry.id === 'player' ? 'YOU' : entry.name.toUpperCase();
      const duration = document.createElement('small');
      duration.textContent = paddock
        ? entry.finished
          ? `${fmt(entry.totalTime)}${entry.valid ? '' : ' *'}`
          : 'IN PROGRESS'
        : gapText(entry);
      if (!paddock)
        duration.setAttribute(
          'aria-label',
          entry.direction === 'self'
            ? 'Your reference time'
            : `${gapText(entry)} ${entry.direction === 'ahead' ? 'ahead of' : 'behind'} you`,
        );
      row.append(place, name, duration);
      return row;
    });
    roster.querySelector('ol').replaceChildren(...entries);
    const player = paddock ? rows.find((entry) => entry.id === 'player') : null;
    roster.querySelector('.roster-laps').replaceChildren(
      ...(player?.lapTimes ?? []).map((duration, index) => {
        const row = document.createElement('div');
        const label = document.createElement('span');
        label.textContent = `LAP ${index + 1}`;
        const value = document.createElement('b');
        value.textContent = fmt(duration);
        row.append(label, value);
        return row;
      }),
    );
    const hint = roster.querySelector('.roster-hint');
    hint.textContent = paddock
      ? rows.some((entry) => entry.finished && !entry.valid)
        ? '* Untimed: lap invalidated'
        : 'Recorded at return to paddock'
      : '';
    hint.classList.toggle('hidden', !paddock);
  }
  const pausePanel = $('pause-panel');
  pausePanel.setAttribute('role', 'dialog');
  pausePanel.setAttribute('aria-modal', 'true');
  pausePanel.setAttribute('aria-label', 'Session paused');
  let suspended = false;
  function syncPauseOwnership() {
    const player = document.querySelector('[data-music-player]');
    if (oldMode === 'paused' && !suspended && player) {
      player.id ||= 'vn-tunes';
      pausePanel.setAttribute('aria-owns', player.id);
    } else pausePanel.removeAttribute('aria-owns');
  }
  // The player stays in its original DOM location so music playback survives
  // every menu transition. aria-owns includes it in the paused dialog instead.
  document.addEventListener(
    'keydown',
    (event) => {
      if (
        oldMode !== 'paused' ||
        suspended ||
        pausePanel.closest('[inert]') ||
        event.key !== 'Tab'
      )
        return;
      const player = document.querySelector('[data-music-player]');
      const controls = [pausePanel, player]
        .filter(Boolean)
        .flatMap((panel) =>
          [
            ...panel.querySelectorAll('button, input, select, [tabindex]'),
          ].filter(
            (control) =>
              !control.disabled &&
              control.tabIndex >= 0 &&
              control.getClientRects().length &&
              !control.closest('[hidden], .hidden, [inert]'),
          ),
        );
      if (!controls.length) return;
      event.preventDefault();
      const current = controls.indexOf(document.activeElement);
      const next =
        current < 0
          ? event.shiftKey
            ? controls.length - 1
            : 0
          : (current + (event.shiftKey ? -1 : 1) + controls.length) %
            controls.length;
      controls[next].focus();
    },
    { capture: true, signal: listeners.signal },
  );
  const review = blockout && metadata.review;
  const copy = { ...metadata.ui, ...(blockout ? metadata.ui.shape : {}) };
  const panel = $('title-panel');
  if (racing && !blockout) {
    const difficulty = document.createElement('label');
    difficulty.className = 'difficulty-picker';
    difficulty.textContent = 'DIFFICULTY';
    const select = document.createElement('select');
    select.id = 'difficulty';
    for (const value of ['easy', 'medium', 'hard']) {
      const option = document.createElement('option');
      option.value = value;
      option.textContent = value.toUpperCase();
      select.append(option);
    }
    select.value = settings.difficulty;
    select.onchange = () => actions.difficulty(select.value);
    difficulty.append(select);
    panel.insertBefore(difficulty, panel.querySelector('.launch-actions'));
  }
  root.classList.toggle('has-review', metadata.review);
  root.classList.toggle('has-racing', racing);
  root.classList.toggle('compact-paddock', Boolean(copy.compact) && !blockout);
  root.classList.toggle('stacked-review', Boolean(copy.stackedReview));
  root.classList.toggle('low-notice', Boolean(copy.lowNotice));
  root.classList.toggle('compact-landscape', Boolean(copy.compactLandscape));
  root.classList.toggle(
    'portrait-compact-hud',
    Boolean(copy.portraitCompactHud),
  );
  const editionDetail = document.createElement('span');
  editionDetail.textContent = blockout ? 'BARE TRACK' : copy.subtitle;
  root
    .querySelector('.edition')
    .replaceChildren(
      document.createElement('i'),
      document.createTextNode(
        blockout ? ' SHAPE REVIEW ' : ` ${copy.edition} `,
      ),
      editionDetail,
    );
  const [name, ...suffix] = metadata.name.trim().split(/\s+/);
  panel.querySelector('.circuit-name').textContent = name.toUpperCase();
  panel.querySelector('h1 em').textContent = (
    suffix.join(' ') || copy.subtitle.split('/')[0].trim()
  ).toUpperCase();
  panel.querySelector('.intro').textContent = copy.intro
    .replace(/the Kestrel/g, 'your ship')
    .replace(/Kestrel/g, 'Your ship');
  $('start').firstChild.textContent =
    `${playtest ? 'START JUMP TEST' : blockout ? 'DRIVE FULL CIRCUIT' : 'ENTER PROVING LOOP'} `;
  if (playtest) {
    panel.querySelector('.intro').textContent = playtest.description;
    $('practice').firstChild.textContent = 'START JUMP TEST ';
  }
  $('inspect').classList.toggle('hidden', blockout);
  root.querySelector('.section-name > span').textContent =
    metadata.name.toUpperCase();
  const tagDetail = document.createElement('span');
  tagDetail.textContent = blockout ? 'ROUTE STUDY' : copy.tagDetail;
  root
    .querySelector('.review-tag')
    .replaceChildren(document.createTextNode(copy.tag), tagDetail);
  if (review) {
    const controls = document.createElement('section');
    controls.id = 'shape-controls';
    controls.setAttribute('aria-label', 'Circuit views');
    controls.innerHTML = `<button id="review-toggle" aria-expanded="true">CIRCUIT VIEWS <span>−</span></button><div id="review-options"><div class="shape-views" aria-label="Whole-track views"><button data-overview="perspective">3D VIEW</button><button data-overview="top">TOP</button><button data-overview="profile">PROFILE</button></div></div>`;
    root.append(controls);
    controls.querySelectorAll('[data-overview]').forEach((button) => {
      button.onclick = () => actions.overview(button.dataset.overview);
    });
    $('review-toggle').onclick = () => {
      const open = !$('review-options').classList.toggle('hidden');
      $('review-toggle').setAttribute('aria-expanded', String(open));
      $('review-toggle').querySelector('span').textContent = open ? '−' : '+';
    };
  }
  const flyControls = document.createElement('section');
  flyControls.id = 'fly-controls';
  flyControls.className = 'hidden';
  flyControls.setAttribute('aria-label', 'Free camera controls');
  flyControls.innerHTML = `<div class="fly-heading"><b>FREE CAMERA <small>SESSION PAUSED</small></b><button id="fly-return">RETURN · F / ESC</button></div><p>Drag to look · WASD / arrows move · Q / E down / up</p><div class="fly-touch"><button data-fly="KeyA" aria-label="Fly left">←</button><button data-fly="KeyW" aria-label="Fly forward">FORWARD</button><button data-fly="KeyD" aria-label="Fly right">→</button><button data-fly="KeyQ" aria-label="Fly down">DOWN</button><button data-fly="KeyS" aria-label="Fly backward">BACK</button><button data-fly="KeyE" aria-label="Fly up">UP</button></div>`;
  root.append(flyControls);
  $('fly-return').onclick = actions.leaveFly;
  const flySettingsButton = document.createElement('button');
  flySettingsButton.id = 'fly-settings-toggle';
  flySettingsButton.textContent = 'DEV TOOLS · P';
  flySettingsButton.setAttribute('aria-expanded', 'false');
  flySettingsButton.setAttribute('aria-controls', 'fly-settings');
  flyControls
    .querySelector('.fly-heading')
    .insertBefore(flySettingsButton, $('fly-return'));
  const flySettings = document.createElement('section');
  flySettings.id = 'fly-settings';
  flySettings.className = 'hidden';
  flySettings.dataset.flySettings = '';
  flySettings.setAttribute('aria-label', 'Free camera dev tools');
  flySettings.innerHTML = `<div class="fly-heading"><b>DEV TOOLS</b><button id="fly-settings-close" aria-label="Close dev tools">CLOSE · ESC</button></div><dl class="dev-metrics"><div><dt>FPS</dt><dd id="dev-fps">—</dd></div><div><dt>Frame avg</dt><dd id="dev-frame-ms">—</dd></div><div><dt>Draw calls</dt><dd id="dev-calls">—</dd></div><div><dt>Triangles</dt><dd id="dev-triangles">—</dd></div></dl><label><span>Graphics</span><select data-setting="quality"><option value="high">High</option><option value="low">Low</option></select></label><label><span>Reduced motion</span><input type="checkbox" data-setting="reducedMotion"></label>${metadata.id === 'vesper' ? vesperGraphicsControls(settings) : ''}<p>Changes apply live and are saved on this device. Frame averages refresh every half second; draw counts include render passes.</p>`;
  root.append(flySettings);
  if (metadata.id === 'vesper') {
    const comparisons = document.createElement('details');
    comparisons.innerHTML = `<summary>Vesper material settings</summary>${vesperGraphicsControls(settings)}`;
    $('pause-panel').append(comparisons);
  }
  let perfLast = null,
    perfElapsed = 0,
    perfFrames = 0;
  function closeFlySettings(restoreFocus = true) {
    const open = !flySettings.classList.contains('hidden');
    flySettings.classList.add('hidden');
    flySettingsButton.setAttribute('aria-expanded', 'false');
    if (open && restoreFocus) flySettingsButton.focus();
    return open;
  }
  function toggleFlySettings() {
    if (closeFlySettings()) return;
    flySettings.classList.remove('hidden');
    perfLast = null;
    perfElapsed = perfFrames = 0;
    $('dev-fps').textContent = $('dev-frame-ms').textContent = '—';
    flySettingsButton.setAttribute('aria-expanded', 'true');
    $('fly-settings-close').focus();
  }
  flySettingsButton.onclick = toggleFlySettings;
  $('fly-settings-close').onclick = () => closeFlySettings();
  root.addEventListener(
    'change',
    (event) => {
      const key = event.target.dataset.setting;
      if (!key) return;
      settings[key] =
        event.target.type === 'checkbox'
          ? event.target.checked
          : event.target.value;
      actions.settings();
    },
    { signal: listeners.signal },
  );
  root.addEventListener(
    'click',
    (event) => {
      if (!event.target.closest('[data-graphics-reset]')) return;
      Object.assign(settings, vesperGraphicsDefaults);
      actions.settings();
    },
    { signal: listeners.signal },
  );
  const currentCircuit = metadata.id;
  const picker = document.createElement('form');
  picker.className = 'circuit-picker';
  picker.setAttribute('aria-label', 'Choose a circuit');
  picker.innerHTML = `<label for="circuit-select">CIRCUIT</label><select id="circuit-select" name="level"></select><button id="circuit-load" type="submit" disabled>LOAD ↗</button>`;
  panel.insertBefore(
    picker,
    panel.querySelector('.difficulty-picker') ??
      panel.querySelector('.launch-actions'),
  );
  for (const circuit of circuits) {
    const option = document.createElement('option');
    option.value = circuit.id;
    option.textContent = circuit.name;
    $('circuit-select').append(option);
  }
  $('circuit-select').value = currentCircuit;
  $('circuit-select').onchange = () => {
    $('circuit-load').disabled = $('circuit-select').value === currentCircuit;
  };
  picker.onsubmit = (event) => {
    event.preventDefault();
    const selected = $('circuit-select').value;
    if (
      selected === currentCircuit ||
      !circuits.some((circuit) => circuit.id === selected)
    )
      return;
    // Enter the selected paddock without another circuit's review flags.
    if (actions.circuit) actions.circuit(selected);
    else location.assign(circuitURL(location.href, selected));
  };
  const shipPickers = [];
  for (const [panelId, prefix] of [
    ['title-panel', 'paddock'],
    ['inspection-panel', 'inspection'],
  ]) {
    const section = document.createElement('section');
    section.className = 'ship-selection';
    section.innerHTML = `<div class="ship-picker-label" id="${prefix}-ship-label">CHOOSE SHIP <span>04 CHASSIS</span></div><div class="ship-picker" role="radiogroup" aria-labelledby="${prefix}-ship-label"></div><div class="ship-stats" role="group" aria-label="Selected ship performance; bars compare the current fleet"></div>`;
    const stats = section.querySelector('.ship-stats');
    for (const stat of shipStats) {
      const row = document.createElement('div');
      row.className = 'ship-stat';
      row.dataset.stat = stat.id;
      row.innerHTML = `<div class="ship-stat-label"><span id="${prefix}-${stat.id}-label">${stat.label}</span><b></b></div><div class="ship-stat-track" role="meter" aria-labelledby="${prefix}-${stat.id}-label" aria-valuemin="0" aria-valuemax="100"><i></i></div>`;
      stats.append(row);
    }
    const choices = section.querySelector('.ship-picker');
    for (const craft of SHIPS) {
      const button = document.createElement('button');
      button.type = 'button';
      button.dataset.ship = craft.id;
      button.setAttribute('role', 'radio');
      button.innerHTML = `<b>${craft.name}</b><span>${craft.role}</span><i aria-hidden="true">✓</i>`;
      button.onclick = () => actions.selectShip(craft.id);
      button.onkeydown = (event) => {
        const direction = ['ArrowRight', 'ArrowDown'].includes(event.key)
          ? 1
          : ['ArrowLeft', 'ArrowUp'].includes(event.key)
            ? -1
            : 0;
        if (!direction) return;
        event.preventDefault();
        event.stopPropagation();
        const next =
          (SHIPS.indexOf(craft) + direction + SHIPS.length) % SHIPS.length;
        const target = choices.children[next];
        target.focus();
        target.click();
      };
      choices.append(button);
    }
    const destination = $(panelId);
    destination.insertBefore(
      section,
      destination.querySelector(
        panelId === 'title-panel' ? '.inspection-actions' : 'dl',
      ),
    );
    shipPickers.push(section);
  }
  let inspectionTab = 'fleet',
    inspectionSession = false,
    fleetLoading = false;
  let selectedRival = RIVAL_SHIPS[0];
  const inspection = $('inspection-panel');
  const inspectionTools = document.createElement('div');
  inspectionTools.id = 'inspection-tools';
  inspectionTools.setAttribute('role', 'group');
  inspectionTools.setAttribute('aria-label', 'Ship preview controls');
  for (const [key, label, pressed] of [
    ['autoRotate', 'Auto-rotate', true],
    ['boost', 'Boost', false],
    ['driving', 'Driving', false],
    ['heat', 'Heat shimmer', true],
  ]) {
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.preview = key;
    button.setAttribute('aria-pressed', String(pressed));
    button.textContent = label;
    button.onclick = () => actions.toggleInspectionPreview(key);
    inspectionTools.append(button);
  }
  const previewHint = document.createElement('p');
  previewHint.textContent = 'Drag to rotate · Preview: stationary';
  inspectionTools.append(previewHint);
  inspection.insertBefore(inspectionTools, inspection.querySelector('dl'));
  function setInspectionPreview(preview) {
    for (const button of inspectionTools.querySelectorAll('button')) {
      const key = button.dataset.preview;
      button.setAttribute('aria-pressed', String(preview[key]));
      button.disabled =
        (inspectionTab === 'rivals' && key !== 'autoRotate') ||
        (key === 'heat' &&
          (settings.quality === 'low' || settings.reducedMotion));
    }
    previewHint.textContent = `Drag to rotate · Preview: ${preview.driving ? 'driving at 400 km/h' : 'stationary'}${settings.quality === 'low' || settings.reducedMotion ? ' · Heat needs High + motion' : ''}`;
  }

  const tabs = document.createElement('div');
  tabs.className = 'inspection-tabs';
  tabs.setAttribute('role', 'tablist');
  tabs.setAttribute('aria-label', 'Ship collection');
  for (const [id, label] of [
    ['fleet', 'Your ships'],
    ['rivals', 'AI racers'],
  ]) {
    const button = document.createElement('button');
    button.id = `inspection-${id}-tab`;
    button.textContent = label;
    button.setAttribute('role', 'tab');
    button.setAttribute('aria-controls', `inspection-${id}-picker`);
    button.onclick = () => actions.selectInspectionTab(id);
    button.onkeydown = (event) => {
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key))
        return;
      event.preventDefault();
      event.stopPropagation();
      const next =
        event.key === 'Home'
          ? 'fleet'
          : event.key === 'End'
            ? 'rivals'
            : id === 'fleet'
              ? 'rivals'
              : 'fleet';
      const target = $(`inspection-${next}-tab`);
      target.focus();
      target.click();
    };
    tabs.append(button);
  }
  inspection.prepend(tabs);
  const fleetPicker = shipPickers[1];
  fleetPicker.id = 'inspection-fleet-picker';
  fleetPicker.setAttribute('role', 'tabpanel');
  fleetPicker.setAttribute('aria-labelledby', 'inspection-fleet-tab');
  const rivalPicker = document.createElement('section');
  rivalPicker.className = 'ship-selection rival-selection hidden';
  rivalPicker.id = 'inspection-rivals-picker';
  rivalPicker.setAttribute('role', 'tabpanel');
  rivalPicker.setAttribute('aria-labelledby', 'inspection-rivals-tab');
  rivalPicker.innerHTML =
    '<div class="ship-picker-label" id="rival-ship-label">AI RACERS <span>03 CHASSIS</span></div><div class="ship-picker" role="radiogroup" aria-labelledby="rival-ship-label"></div><p class="ship-summary">AI RACING FLEET · INSPECTION ONLY</p>';
  const rivalChoices = rivalPicker.querySelector('.ship-picker');
  RIVAL_SHIPS.forEach((craft, index) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.rival = craft.id;
    button.setAttribute('role', 'radio');
    button.innerHTML = `<b>${craft.name}</b><span>${craft.role}</span><i aria-hidden="true">✓</i>`;
    button.onclick = () => actions.inspectRival(craft.id);
    button.onkeydown = (event) => {
      const direction = ['ArrowRight', 'ArrowDown'].includes(event.key)
        ? 1
        : ['ArrowLeft', 'ArrowUp'].includes(event.key)
          ? -1
          : 0;
      if (!direction) return;
      event.preventDefault();
      event.stopPropagation();
      const target =
        rivalChoices.children[
          (index + direction + RIVAL_SHIPS.length) % RIVAL_SHIPS.length
        ];
      target.focus();
      target.click();
    };
    rivalChoices.append(button);
  });
  inspection.insertBefore(rivalPicker, inspection.querySelector('dl'));
  const loadingMessage = document.createElement('p');
  loadingMessage.className = 'ship-load-status';
  loadingMessage.setAttribute('role', 'status');
  root.append(loadingMessage);
  function setShip(craft) {
    selectedShip = craft;
    for (const section of shipPickers) {
      for (const button of section.querySelectorAll('[data-ship]')) {
        const chosen = button.dataset.ship === craft.id;
        button.setAttribute('aria-checked', String(chosen));
        button.tabIndex = chosen ? 0 : -1;
      }
      for (const stat of shipStats) {
        const value = stat.value(craft.handling);
        const fraction = value / stat.maximum;
        const rating = (fraction * 10).toFixed(1);
        const text = stat.format ? stat.format(value) : `${rating}/10`;
        const row = section.querySelector(`[data-stat="${stat.id}"]`);
        const meter = row.querySelector('[role="meter"]');
        row.querySelector('b').textContent = text;
        row.style.setProperty('--stat-fill', `${fraction * 100}%`);
        row.title = `${stat.label}: ${text}. ${rating}/10 relative to the current fleet.`;
        meter.setAttribute('aria-valuenow', String(Math.round(fraction * 100)));
        meter.setAttribute(
          'aria-valuetext',
          `${text}; relative to the current fleet`,
        );
      }
    }
    if (inspectionTab === 'fleet') setInspectionDetails(craft);
  }
  function setInspectionDetails(craft, rival = false) {
    inspection.querySelector('.eyebrow').textContent = rival
      ? 'AI RACERS / SHIP INSPECTION'
      : 'FLEET / SHIP INSPECTION';
    inspection.querySelector('h1').textContent = craft.name.toUpperCase() + '.';
    inspection.querySelector('.intro').textContent = craft.description;
    const details = inspection.querySelectorAll('dd');
    details[0].textContent = craft.design;
    details[1].textContent = rival
      ? craft.propulsion
      : craft.exhausts.length === 1
        ? 'Single oversized ion core'
        : 'Twin ion cores';
    $('inspect-start').firstChild.textContent = inspectionSession
      ? 'RETURN TO SESSION '
      : `DRIVE ${craft.name.toUpperCase()} `;
    $('inspect-back').textContent = inspectionSession
      ? 'RETURN TO SESSION'
      : 'CIRCUITS';
  }
  function setInspectedRival(craft) {
    selectedRival = craft;
    for (const button of rivalChoices.children) {
      const chosen = button.dataset.rival === craft.id;
      button.setAttribute(
        'aria-checked',
        String(inspectionTab === 'rivals' && chosen),
      );
      button.tabIndex = chosen ? 0 : -1;
    }
    if (inspectionTab === 'rivals') setInspectionDetails(craft, true);
  }
  function setInspectionTab(tab) {
    inspectionTab = tab;
    for (const button of tabs.children) {
      const chosen = button.id === `inspection-${tab}-tab`;
      button.setAttribute('aria-selected', String(chosen));
      button.tabIndex = chosen ? 0 : -1;
    }
    fleetPicker.classList.toggle('hidden', tab !== 'fleet');
    rivalPicker.classList.toggle('hidden', tab !== 'rivals');
    $('inspect-start').classList.toggle('hidden', tab === 'rivals');
    root.classList.toggle('inspecting-rivals', tab === 'rivals');
    for (const button of inspectionTools.querySelectorAll('button'))
      button.disabled =
        (tab === 'rivals' && button.dataset.preview !== 'autoRotate') ||
        (button.dataset.preview === 'heat' &&
          (settings.quality === 'low' || settings.reducedMotion));
    setInspectedRival(selectedRival);
    if (tab === 'fleet') setInspectionDetails(selectedShip);
  }
  setShip(selectedShip);
  setInspectionTab('fleet');
  let pickerFocus = null;
  const bind = (id, fn) => ($(id).onclick = fn);
  bind('start', actions.start);
  bind('practice', actions.practice);
  bind('inspect-start', actions.start);
  bind('inspect', () => actions.camera('inspection'));
  bind('explore', () => actions.camera('fly'));
  bind('pause-explore', () => actions.camera('fly'));
  bind('inspect-back', actions.exitInspection ?? actions.home);
  bind('resume', actions.resume);
  bind('pause-results', actions.results);
  bind('restart', actions.restart);
  bind('home', actions.home);
  bind('pause-button', actions.pause);
  root.querySelector('.wordmark').onclick = (e) => {
    e.preventDefault();
    actions.home();
  };
  $('quality').value = settings.quality;
  for (const id of ['volume', 'quality', 'motion'])
    $(id).onchange = () => {
      settings.volume = +$('volume').value;
      settings.quality = $('quality').value;
      settings.reducedMotion = $('motion').checked;
      actions.settings();
    };
  const ctx = $('minimap').getContext('2d');
  const points = [];
  for (let s = 0; s < track.length; s += track.length / 180)
    points.push(track.sample(s).position);
  const xs = points.map((p) => p.x),
    zs = points.map((p) => p.z),
    minX = Math.min(...xs),
    minZ = Math.min(...zs),
    scale = Math.min(
      170 / (Math.max(...xs) - minX),
      120 / (Math.max(...zs) - minZ),
    );
  const coord = (p) => [15 + (p.x - minX) * scale, 15 + (p.z - minZ) * scale];
  let oldMode = '',
    noticeUntil = 0;
  const fmt = (t) =>
    `${String(Math.floor(t / 60)).padStart(2, '0')}:${(t % 60).toFixed(3).padStart(6, '0')}`;
  return {
    root,
    toggleFlySettings,
    closeFlySettings,
    updateDevTools(now, info) {
      if (flySettings.classList.contains('hidden') || document.hidden) {
        perfLast = null;
        perfElapsed = perfFrames = 0;
        return;
      }
      if (perfLast !== null) {
        perfElapsed += now - perfLast;
        perfFrames++;
      }
      perfLast = now;
      if (perfElapsed < 500) return;
      $('dev-fps').textContent = ((1000 * perfFrames) / perfElapsed).toFixed(1);
      $('dev-frame-ms').textContent =
        `${(perfElapsed / perfFrames).toFixed(1)} ms`;
      $('dev-calls').textContent = info.calls.toLocaleString();
      $('dev-triangles').textContent = info.triangles.toLocaleString();
      perfElapsed = perfFrames = 0;
    },
    setSuspended(value) {
      suspended = !!value;
      syncPauseOwnership();
    },
    syncSettings(next) {
      $('volume').value = next.volume;
      $('quality').value = next.quality;
      $('motion').checked = next.reducedMotion;
      for (const control of root.querySelectorAll('[data-setting]')) {
        const value = next[control.dataset.setting];
        if (control.type === 'checkbox') control.checked = value;
        else control.value = value;
      }
    },
    setResultsAvailable(available) {
      $('pause-results').classList.toggle('hidden', !available);
    },
    setFinish(result) {
      finish.classList.toggle('hidden', !result);
      if (!result) return;
      const player = result.standings?.find((entry) => entry.id === 'player');
      const valid = result.playerValid ?? player?.valid;
      const position = player?.position;
      finish.querySelector('strong').textContent = !valid
        ? 'UNTIMED FINISH'
        : position === 1
          ? 'VICTORY'
          : position
            ? `P${position} · FINISH`
            : 'RACE COMPLETE';
      finish.querySelector('small').textContent = valid
        ? `${fmt(result.playerTotalTime)} · ${metadata.name}`
        : 'LAP INVALIDATED · SESSION RECORDED';
      $('pause-results').classList.remove('hidden');
    },
    setInspectionSession(active) {
      inspectionSession = !!active;
      for (const section of shipPickers)
        for (const button of section.querySelectorAll('[data-ship]'))
          button.disabled = fleetLoading || inspectionSession;
      setInspectionDetails(
        inspectionTab === 'rivals' ? selectedRival : selectedShip,
        inspectionTab === 'rivals',
      );
    },
    setShip,
    setInspectionTab,
    setInspectedRival,
    setRivalLoading(loading) {
      rivalPicker.setAttribute('aria-busy', String(loading));
      if (loading) loadingMessage.textContent = 'Preparing AI racer…';
      else if (loadingMessage.textContent === 'Preparing AI racer…')
        loadingMessage.textContent = '';
    },
    setShipLoading(loading) {
      fleetLoading = loading;
      if (loading)
        pickerFocus = document.activeElement?.closest('.ship-picker');
      for (const section of shipPickers) {
        section.setAttribute('aria-busy', String(loading));
        for (const button of section.querySelectorAll('button'))
          button.disabled = loading || inspectionSession;
      }
      $('start').disabled = loading;
      $('practice').disabled = loading;
      $('inspect-start').disabled = loading;
      for (const button of tabs.children) button.disabled = loading;
      if (loading) loadingMessage.textContent = 'Preparing ship…';
      else if (loadingMessage.textContent === 'Preparing ship…')
        loadingMessage.textContent = '';
      if (
        !loading &&
        pickerFocus &&
        document.activeElement === document.body &&
        !pickerFocus.closest('.panel').classList.contains('hidden')
      ) {
        pickerFocus
          .querySelector('[aria-checked="true"]')
          ?.focus({ preventScroll: true });
      }
      if (!loading) pickerFocus = null;
    },
    shipError(message) {
      loadingMessage.textContent = message;
    },
    setInspectionPreview,
    inspectionViewport() {
      if (innerWidth > 760 || innerWidth > innerHeight) return null;
      const panel = $('inspection-panel');
      const heading = panel
        .querySelector('.ship-selection:not(.hidden)')
        .getBoundingClientRect();
      const details = inspectionTools;
      const specs = (
        details.offsetHeight ? details : panel.querySelector('.actions')
      ).getBoundingClientRect();
      return {
        left: innerWidth * 0.06,
        top: heading.bottom + 14,
        width: innerWidth * 0.88,
        height: Math.max(24, specs.top - heading.bottom - 28),
      };
    },
    setPlaytestCase(id) {
      if (casePicker) $('playtest-case').value = id;
    },
    setMode(mode) {
      if (mode === oldMode) return;
      oldMode = mode;
      syncPauseOwnership();
      if (casePicker) {
        const parent = mode === 'paused' ? $('pause-panel') : $('title-panel');
        parent.insertBefore(
          casePicker,
          mode === 'paused' ? $('resume') : $('start').closest('.actions'),
        );
      }
      updateRoster();
      for (const [id, show] of [
        ['title-panel', mode === 'title' || mode === 'overview'],
        ['inspection-panel', mode === 'inspection'],
        ['pause-panel', mode === 'paused'],
        ['hud', mode === 'racing' || mode === 'countdown'],
        ['touch', mode === 'racing'],
      ])
        $(id).classList.toggle('hidden', !show);
      root.classList.toggle(
        'driving',
        ['racing', 'paused', 'countdown'].includes(mode),
      );
      lights.classList.toggle(
        'hidden',
        mode !== 'countdown' &&
          !(mode === 'racing' && lights.dataset.step === '0'),
      );
      root.classList.toggle('paused', mode === 'paused');
      $('jump-repeat')?.classList.toggle('hidden', mode !== 'racing');
      root.classList.toggle('flying', mode === 'fly');
      if (mode !== 'fly') closeFlySettings(false);
      $('fly-controls')?.classList.toggle('hidden', mode !== 'fly');
      root.classList.toggle('inspecting', mode === 'inspection');
      root.querySelector('.masthead').inert = mode === 'paused';
      root.classList.toggle(
        'shape-overview',
        mode === 'title' || mode === 'overview',
      );
      root.classList.toggle(
        'whole-route-view',
        mode === 'overview' || (blockout && mode === 'title'),
      );
      const reviewControls = $('shape-controls');
      if (reviewControls) {
        const stacked =
          copy.stackedReview && root.classList.contains('whole-route-view');
        (stacked ? $('title-panel') : root).append(reviewControls);
      }
      $('shape-controls')?.classList.toggle(
        'hidden',
        mode === 'paused' || mode === 'inspection' || mode === 'fly',
      );
      if (review) {
        const expanded = mode !== 'racing' && innerWidth > 760;
        $('review-options').classList.toggle('hidden', !expanded);
        $('review-toggle').setAttribute('aria-expanded', String(expanded));
        $('review-toggle').querySelector('span').textContent = expanded
          ? '−'
          : '+';
      }
      $('pause-button').classList.toggle(
        'hidden',
        mode !== 'racing' && mode !== 'countdown',
      );
      const f =
        mode === 'title' || mode === 'overview'
          ? 'start'
          : mode === 'inspection'
            ? inspectionTab === 'rivals'
              ? 'inspection-rivals-tab'
              : 'inspect-start'
            : mode === 'paused'
              ? 'resume'
              : null;
      if (f) $(f).focus({ preventScroll: true });
      else document.activeElement?.blur();
    },
    update(
      s,
      r,
      motion = null,
      { practice = false, competition = null, lastResults = null } = {},
    ) {
      currentCompetition = competition;
      retainedResults = lastResults;
      escapeLabel.textContent = 'PAUSE';
      if (!playtest)
        $('restart').textContent = competition?.enabled
          ? 'RESTART RACE'
          : 'RESTART PRACTICE';
      updateRoster();
      const player = competition?.standings.find(
        (entry) => entry.id === 'player',
      );
      root
        .querySelector('.position')
        .classList.toggle('hidden', !competition?.enabled);
      $('position').textContent =
        `${player?.position ?? '—'} / ${competition?.standings.length ?? 4}`;
      $('position-state').textContent = competition?.playerFinished
        ? 'ESC · PAUSE'
        : '';
      root.querySelector('.lap > span').textContent = competition?.enabled
        ? competition.playerFinished
          ? 'FREE DRIVE'
          : 'RACE LAP'
        : 'PRACTICE LAP';
      $('speed').textContent = String(Math.round(s.speed * 3.6)).padStart(
        3,
        '0',
      );
      $('time').textContent = fmt(r.elapsed);
      $('lap').textContent =
        competition?.enabled && !competition.playerFinished
          ? `${Math.min(r.lap, 2)}/2`
          : String(r.lap).padStart(2, '0');
      $('energy-label').textContent = `${Math.round(s.energy)}%`;
      $('energy-fill').style.width = `${s.energy}%`;
      $('energy-fill').style.background = s.energy < 25 ? '#ef764e' : '#a9d0c9';
      $('boost-status').textContent =
        motion?.mode === 'recovery'
          ? motion.flight?.manualRecovery
            ? 'CONTACT TEST · R TO REPEAT'
            : 'RECOVERY DELAY'
          : motion?.mode === 'flight'
            ? 'AIRBORNE'
            : motion?.vectorActive
              ? 'VECTOR DRIVE'
              : s.boosting
                ? 'BOOST ENGAGED'
                : 'MAGNETIC DRIVE';
      $('boost-status').classList.toggle(
        'active',
        s.boosting || motion?.vectorActive,
      );
      $('energy-state').textContent = motion?.vectorActive
        ? 'VECTOR DRIVE · FREE PROPULSION'
        : s.energy < 25
          ? 'LOW RESERVE · RELEASE BOOST TO RECOVER'
          : 'BOOST DRAWS FROM IMPACT RESERVE';
      $('last').textContent = r.lastLap ? `LAST ${fmt(r.lastLap)}` : 'LAST —';
      $('best').textContent = !r.valid
        ? practice && s.resetCount === 0
          ? 'PRACTICE SECTION'
          : 'LAP INVALIDATED · RESET'
        : r.best
          ? `BEST ${fmt(r.best)}`
          : 'SET YOUR FIRST CLEAN LAP';
      const pos = ((s.distance % track.length) + track.length) % track.length;
      const section = track.sections?.find(
        (a) => pos >= a.start && pos < a.end,
      );
      $('section').textContent = section?.name || 'PROVING LOOP';
      ctx.clearRect(0, 0, 200, 150);
      ctx.lineWidth = 2.5;
      ctx.strokeStyle = '#dbe8e1cc';
      ctx.beginPath();
      points.forEach((p, i) => {
        const [x, y] = coord(p);
        i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
      });
      ctx.closePath();
      ctx.stroke();
      const dot = (position, color, radius, player = false) => {
        const [x, y] = coord(position);
        ctx.fillStyle = color;
        ctx.strokeStyle = player ? '#ffffff' : '#0c1926';
        ctx.lineWidth = player ? 1.5 : 2;
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      };
      if (competition?.enabled) {
        for (const rival of competition.standings.filter(
          (entry) => entry.id !== 'player',
        )) {
          const frame = track.sample(rival.distance);
          dot(
            frame.position.clone().addScaledVector(frame.right, rival.lateral),
            racerColors[rival.id],
            3.5,
          );
        }
      }
      const world = motion?.currentPose?.position;
      dot(
        world
          ? { x: world[0], z: world[2] }
          : track.sample(s.distance).position,
        racerColors.player,
        4,
        true,
      );
      if (performance.now() > noticeUntil) $('notice').textContent = '';
    },
    lapComplete({ lap, duration, valid, delta, finalLap = false }) {
      const comparison =
        delta === null || !valid
          ? ''
          : delta === 0
            ? ' · MATCHED BEST'
            : ` · ${Math.abs(delta).toFixed(3)}s ${delta < 0 ? 'FASTER' : 'SLOWER'} THAN BEST`;
      this.notice(
        `${finalLap ? 'FINAL LAP · ' : ''}${valid ? `LAP ${lap}` : 'INVALID LAP'} · ${fmt(duration)}${comparison}`,
      );
    },
    notice(text) {
      $('notice').textContent = text;
      noticeUntil = performance.now() + 2200;
    },
    setCountdown(step) {
      lights.classList.toggle('hidden', step === null);
      lights.dataset.step = String(step);
      lights.classList.toggle('go', step === 0);
      lights.querySelector('b').textContent = step === 0 ? 'GO' : String(step);
      lights.querySelector('small').textContent =
        step === 0 ? 'GREEN · GO' : 'HOLD THROTTLE · GREEN TO GO';
      [...lights.querySelectorAll('i')].forEach((light, index) =>
        light.classList.toggle(
          'lit',
          step === 0 || (step > 0 && index < 4 - step),
        ),
      );
    },
    dispose() {
      listeners.abort();
      pausePanel.removeAttribute('aria-owns');
      root.remove();
    },
  };
}
