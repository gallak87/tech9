import './style.css';
import { SHIPS } from '../ships/catalog.js';
import { RIVAL_SHIPS } from '../ships/rivals.js';
import { circuitURL } from '../levels/contract.js';

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
  { metadata, circuits, shape: blockout = false, selectedShip = SHIPS[0] },
) {
  const root = document.createElement('main');
  root.id = 'interface';
  host.append(root);
  root.innerHTML = `<header class="masthead"><a class="wordmark" href="#" aria-label="Vector Nova home">VECTOR<span>//</span>NOVA</a><div class="edition"><i></i> <span></span></div><button class="quiet" id="pause-button" aria-label="Pause">Ⅱ</button></header>
 <section id="title-panel" class="panel"><h1><span class="circuit-name"></span><em></em></h1><p class="intro"></p><div class="track-facts"><div><b>${(track.length / 1000).toFixed(2)}</b><span>KM CIRCUIT</span></div><div><b>04</b><span>SHIPS</span></div><div><b>∞</b><span>PRACTICE LAPS</span></div></div><div class="actions launch-actions"><button id="start" class="primary">ENTER PROVING LOOP <span>↗</span></button><button id="practice">PRACTICE LAP <span>↗</span></button></div><div class="actions inspection-actions"><button id="inspect">INSPECT SHIPS <span>↗</span></button></div></section>
 <section id="inspection-panel" class="panel hidden"><div class="eyebrow">AERODYNAMICS DIVISION / 07</div><h1 class="inspect-title" aria-live="polite">KESTREL<span class="dot">.</span></h1><p class="intro">Twin-core magnetic interceptor.<br>Ceramic armour. Exposed titanium propulsion.<br>Built to stay close to the limit.</p><dl><div><dt>DESIGN</dt><dd>Split prow / swept ceramic chassis</dd></div><div><dt>PROPULSION</dt><dd>Dual induction turbines</dd></div></dl><div class="actions"><button id="inspect-start" class="primary">DRIVE PROTOTYPE <span>↗</span></button><button id="inspect-back">BACK TO PROVING GROUND</button></div></section>
 <section id="pause-panel" class="modal hidden"><div class="eyebrow">PROVING SESSION</div><h2>TAKE A BREATH.</h2><button id="resume" class="primary">RESUME SESSION ↗</button><button id="restart">RESTART LAP</button><button id="home">RETURN TO PADDOCK</button><label>MASTER VOLUME <input id="volume" type="range" min="0" max="1" step=".05" value="${settings.volume}"></label><label>GRAPHICS <select id="quality"><option value="high">High</option><option value="low">Low</option></select></label><label>REDUCED MOTION <input id="motion" type="checkbox" ${settings.reducedMotion ? 'checked' : ''}></label><p class="small">Prototype settings are saved locally when available.</p></section>
 <section id="hud" class="hidden"><div class="top-telemetry"><div class="lap"><span>PRACTICE LAP</span><b id="lap">01</b></div><div class="timing"><span>SESSION TIME</span><b id="time">00:00.000</b><small id="best">SET YOUR FIRST CLEAN LAP</small></div><div class="section-name"><span></span><b id="section">PROVING STRAIGHT</b></div></div><div class="telemetry"><div class="energy"><span>CORE RESERVE <b id="energy-label">100%</b></span><div class="energy-track"><i id="energy-fill"></i></div><small id="energy-state">BOOST DRAWS FROM IMPACT RESERVE</small></div><div class="speed"><strong id="speed">000</strong><span>KM/H</span><i id="boost-status">MAGNETIC DRIVE</i></div></div><canvas id="minimap" width="200" height="150" aria-label="Track map"></canvas><div id="notice" role="status"></div></section>
 <footer id="legend"><div><kbd>W</kbd><kbd>↑</kbd><span>THROTTLE</span></div><div><kbd>A</kbd><kbd>D</kbd><span>STEER</span></div><div><kbd>S</kbd><span>BRAKE</span></div><div><kbd>SPACE</kbd><span>AIRBRAKE</span></div><div><kbd>SHIFT</kbd><span>BOOST</span></div><div><kbd>R</kbd><span>RESET</span></div><div><kbd>ESC</kbd><span>PAUSE</span></div></footer>
 <div id="touch" class="hidden"><div><button data-drive="left" aria-label="Steer left">◀</button><button data-drive="right" aria-label="Steer right">▶</button><button data-drive="brake">BRAKE</button></div><div><button data-drive="airbrake">SLIP</button><button data-drive="boost">BOOST</button><button data-drive="throttle">GO</button></div></div><div class="review-tag"><span></span></div>`;
  const $ = (id) => root.querySelector('#' + id);
  const pausePanel = $('pause-panel');
  pausePanel.setAttribute('role', 'dialog');
  pausePanel.setAttribute('aria-modal', 'true');
  pausePanel.setAttribute('aria-label', 'Session paused');
  pausePanel.onkeydown = (event) => {
    if (event.key !== 'Tab') return;
    const controls = [...pausePanel.querySelectorAll('button, input, select')];
    const first = controls[0],
      last = controls.at(-1);
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };
  const review = blockout && metadata.review;
  const copy = { ...metadata.ui, ...(blockout ? metadata.ui.shape : {}) };
  const panel = $('title-panel');
  root.classList.toggle('has-review', metadata.review);
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
    `${blockout ? 'DRIVE FULL CIRCUIT' : 'ENTER PROVING LOOP'} `;
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
  flyControls.innerHTML = `<div class="fly-heading"><b>FREE CAMERA <small>SESSION PAUSED</small></b><button id="fly-return">RETURN · F / ESC</button></div><p>Drag to look · WASD move · Q / E down / up</p><div class="fly-touch"><button data-fly="KeyA" aria-label="Fly left">←</button><button data-fly="KeyW" aria-label="Fly forward">FORWARD</button><button data-fly="KeyD" aria-label="Fly right">→</button><button data-fly="KeyQ" aria-label="Fly down">DOWN</button><button data-fly="KeyS" aria-label="Fly backward">BACK</button><button data-fly="KeyE" aria-label="Fly up">UP</button></div>`;
  root.append(flyControls);
  $('fly-return').onclick = actions.leaveFly;
  const currentCircuit = metadata.id;
  const picker = document.createElement('form');
  picker.className = 'circuit-picker';
  picker.setAttribute('aria-label', 'Choose a circuit');
  picker.innerHTML = `<label for="circuit-select">CIRCUIT</label><select id="circuit-select" name="level"></select><button id="circuit-load" type="submit" disabled>LOAD ↗</button>`;
  panel.insertBefore(picker, panel.querySelector('.launch-actions'));
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
    // Enter the selected paddock without carrying another circuit's review
    // scenario or opt-in gameplay features into the new session.
    location.assign(circuitURL(location.href, selected));
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
  let inspectionTab = 'fleet';
  let selectedRival = RIVAL_SHIPS[0];
  const inspection = $('inspection-panel');
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
    '<div class="ship-picker-label" id="rival-ship-label">AI RACERS <span>03 CHASSIS</span></div><div class="ship-picker" role="radiogroup" aria-labelledby="rival-ship-label"></div><p class="ship-summary">PREVIEW ONLY · RACING STATS NOT ASSIGNED</p>';
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
    $('inspect-start').firstChild.textContent =
      `DRIVE ${craft.name.toUpperCase()} `;
    $('inspect-back').textContent = 'BACK TO PADDOCK';
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
  bind('inspect-back', actions.home);
  bind('resume', actions.resume);
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
      if (loading)
        pickerFocus = document.activeElement?.closest('.ship-picker');
      for (const section of shipPickers) {
        section.setAttribute('aria-busy', String(loading));
        for (const button of section.querySelectorAll('button'))
          button.disabled = loading;
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
    inspectionViewport() {
      if (innerWidth > 760 || innerWidth > innerHeight) return null;
      const panel = $('inspection-panel');
      const heading = panel
        .querySelector('.ship-selection:not(.hidden)')
        .getBoundingClientRect();
      const details = panel.querySelector('dl');
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
    setMode(mode) {
      if (mode === oldMode) return;
      oldMode = mode;
      for (const [id, show] of [
        ['title-panel', mode === 'title' || mode === 'overview'],
        ['inspection-panel', mode === 'inspection'],
        ['pause-panel', mode === 'paused'],
        ['hud', mode === 'racing'],
        ['touch', mode === 'racing'],
      ])
        $(id).classList.toggle('hidden', !show);
      root.classList.toggle('driving', mode === 'racing' || mode === 'paused');
      root.classList.toggle('paused', mode === 'paused');
      root.classList.toggle('flying', mode === 'fly');
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
      $('pause-button').classList.toggle('hidden', mode !== 'racing');
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
    update(s, r, motion = null, { practice = false } = {}) {
      $('speed').textContent = String(Math.round(s.speed * 3.6)).padStart(
        3,
        '0',
      );
      $('time').textContent = fmt(r.elapsed);
      $('lap').textContent = String(r.lap).padStart(2, '0');
      $('energy-label').textContent = `${Math.round(s.energy)}%`;
      $('energy-fill').style.width = `${s.energy}%`;
      $('energy-fill').style.background = s.energy < 25 ? '#ef764e' : '#a9d0c9';
      $('boost-status').textContent =
        motion?.mode === 'recovery'
          ? 'RECOVERY DELAY'
          : motion?.mode === 'flight'
            ? 'AIRBORNE'
            : s.boosting
              ? 'BOOST ENGAGED'
              : 'MAGNETIC DRIVE';
      $('boost-status').classList.toggle('active', s.boosting);
      $('energy-state').textContent =
        s.energy < 25
          ? 'LOW RESERVE · RELEASE BOOST TO RECOVER'
          : 'BOOST DRAWS FROM IMPACT RESERVE';
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
      const world = motion?.currentPose?.position;
      const [x, y] = coord(
        world
          ? { x: world[0], z: world[2] }
          : track.sample(s.distance).position,
      );
      ctx.fillStyle = '#fb7959';
      ctx.beginPath();
      ctx.arc(x, y, 4, 0, Math.PI * 2);
      ctx.fill();
      if (performance.now() > noticeUntil) $('notice').textContent = '';
    },
    notice(text) {
      $('notice').textContent = text;
      noticeUntil = performance.now() + 2200;
    },
    dispose() {
      root.remove();
    },
  };
}
