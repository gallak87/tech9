import { fullscreenSetting } from './desktop-controls.js';
import { controllerLayout } from '../input/gamepad.js';
import { createDevTools } from './dev-tools.js';
import './style.css';
import { formatTime, formatDelta } from '../race/timing.js';
import { presentationDistance } from '../race/course.js';
import {
  RACER_COLORS as racerColors,
  RACE_FIELD_SIZE,
} from '../race/roster.js';
import { halcyonGraphicsDefaults } from '../progression/index.js';

export function createUI(
  host,
  actions,
  settings,
  track,
  { metadata, racing = false, playtest = null, playtestCase = null },
) {
  const sprint = track.closed === false;
  const root = document.createElement('main');
  const listeners = new AbortController();
  root.id = 'interface';
  root.dataset.level = metadata.id;
  root.dataset.freestyle = String(metadata.freestyle === true);
  root.classList.toggle('jump-playtest', Boolean(playtest));
  host.append(root);
  root.innerHTML = `<header class="masthead"><a class="wordmark" href="#" aria-label="Vector Nova home">VECTOR<span>//</span>NOVA</a><div class="edition"><i></i> <span></span></div><button class="quiet" id="pause-button" aria-label="Pause">Ⅱ</button></header>
 <section id="pause-panel" class="modal hidden"><h2>Paused</h2><button id="resume" class="primary">Resume <span aria-hidden="true">→</span></button><button id="pause-results" class="hidden">Results</button><section class="pause-quick-settings" aria-label="Quick settings">${import.meta.env?.VN_DESKTOP ? fullscreenSetting() : ''}<label>Graphics <select id="quality"><option value="high">High</option><option value="low">Low</option></select></label><label>Game effects <input id="volume" type="range" min="0" max="1" step=".05" value="${settings.volume}"></label><label>Reduced motion <input id="motion" type="checkbox" ${settings.reducedMotion ? 'checked' : ''}></label></section><div class="pause-restart"><button id="restart">Restart race</button></div><nav class="pause-secondary" aria-label="Session options"><button id="home">Race setup</button><button id="pause-settings">Settings</button>${actions.openTunes ? '<button id="pause-tunes" aria-controls="music-panel">Tunes</button>' : ''}</nav></section>
 <section id="hud" class="hidden"><div class="top-telemetry"><div class="position hidden"><span>POSITION</span><b id="position">1 / ${RACE_FIELD_SIZE}</b><small id="position-state"></small></div><div class="lap"><span>PRACTICE LAP</span><b id="lap">01</b></div><div class="timing"><span>LAP TIME</span><b id="time">00:00.000</b><small id="last">LAST —</small><small id="best">SET YOUR FIRST CLEAN LAP</small></div></div><div class="telemetry"><div class="energy"><span>CORE RESERVE <b id="energy-label">100%</b></span><div class="energy-track"><i id="energy-fill"></i></div><small id="energy-state">BOOST USES CORE RESERVE</small></div><div class="speed"><strong id="speed">000</strong><span>KM/H</span><i id="boost-status">MAGNETIC DRIVE</i></div></div><canvas id="minimap" width="200" height="150" aria-label="Track map"></canvas></section>
 ${!import.meta.env?.VN_DESKTOP ? '<footer id="legend"><div class="legend-movement"><kbd>WASD</kbd><span class="legend-or" aria-hidden="true">/</span><kbd aria-label="Arrow keys">↑←↓→</kbd><span>MOVEMENT</span></div><div class="legend-direction"><kbd>W</kbd><kbd>↑</kbd><span>THROTTLE</span></div><div class="legend-direction"><kbd>A</kbd><kbd>D</kbd><span>STEER</span></div><div class="legend-direction"><kbd>S</kbd><span>BRAKE</span></div><div><kbd>SPACE</kbd><span>AIRBRAKE</span></div><div class="legend-boost"><kbd>SHIFT</kbd><span>BOOST</span></div><div><kbd>R</kbd><span>RECOVER / RETRY</span></div><div><kbd>ESC</kbd><span>PAUSE</span></div></footer>' : ''}
 <div id="touch" class="hidden" role="group" aria-label="Touch driving controls">
  <div class="touch-steer" data-touch-control="steer" role="group" aria-label="Steering: drag left or right; pull down for airbrake. Release to center.">
   <span class="touch-label">STEER</span><span class="touch-directions" aria-hidden="true">←<span>→</span></span><i class="touch-thumb" aria-hidden="true"></i><span class="touch-airbrake">↓ AIRBRAKE</span>
  </div>
  <div class="touch-power" data-touch-control="power" data-power="neutral" role="group" aria-label="Power: slide up to Go, farther up to Boost and accelerate, center for neutral, down to brake. Release to coast.">
   <span data-power-zone="boost">BOOST <small>+ GO</small></span><span data-power-zone="go">GO</span><span data-power-zone="neutral">NEUTRAL</span><span data-power-zone="brake">BRAKE</span><i class="touch-thumb" aria-hidden="true"></i>
  </div>
 </div>`;
  const $ = (id) => root.querySelector('#' + id);
  if (sprint) {
    root.classList.add('sprint-course');
    $('restart').textContent = 'Restart sprint';
    root.querySelector('.timing > span').textContent = 'ELAPSED';
    const finishActions = document.createElement('div');
    finishActions.id = 'sprint-finish-actions';
    finishActions.className = 'actions hidden';
    finishActions.innerHTML = `<button id="sprint-home" class="primary">${metadata.editorTest ? 'Back to editor' : 'Race setup'} →</button><button id="sprint-retry">R · ${metadata.editorTest ? 'RESTART TEST DRIVE' : playtest ? 'REPEAT CASE' : 'RETRY DESCENT'}</button>`;
    root.append(finishActions);
    $('sprint-retry').onclick = actions.restart;
    $('sprint-home').onclick = actions.home;
  }
  if (metadata.editorTest) {
    $('home').textContent = 'Back to editor';
    $('restart').textContent = 'Restart test drive';
  }
  if (metadata.freestyle) {
    $('restart').textContent = 'Retry Freestyle';
  }
  if (metadata.eventType === 'eliminator') {
    $('restart').textContent = 'Retry Eliminator';
  }
  if (metadata.eventType === 'interceptor') {
    $('restart').textContent = 'Retry Interceptor';
  }
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
    $('pause-panel').insertBefore(casePicker, $('resume'));
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
  const keyboardLegend = $('legend')?.innerHTML;
  let controlHint = 'keyboard';
  function updateControlHints(gamepad) {
    if (import.meta.env?.VN_DESKTOP) return;
    const next = gamepad ? settings.controllerPreset : 'keyboard';
    if (next === controlHint) return;
    controlHint = next;
    const layout = controllerLayout(settings);
    $('legend').innerHTML = gamepad
      ? [
          ['Left stick', 'STEER'],
          [layout.throttle, 'THROTTLE'],
          [layout.brake, 'BRAKE'],
          [layout.airbrake, 'AIRBRAKE'],
          [layout.boost, 'BOOST'],
          ['RS', 'CAMERA'],
          ['X / Y · D-pad ← / →', 'EQUIPMENT'],
          ['Menu', 'PAUSE'],
        ]
          .map(
            ([key, label]) =>
              `<div><kbd>${key}</kbd><span>${label}</span></div>`,
          )
          .join('')
      : keyboardLegend;
  }
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
    currentCompetition = null;
  function updateRoster() {
    const driving = oldMode === 'racing' || oldMode === 'countdown';
    const finished = sprint && driving && currentCompetition?.playerFinished;
    const showingResults = finished;
    const data = finished
      ? currentCompetition.results
      : driving &&
          currentCompetition?.enabled &&
          !currentCompetition.playerFinished
        ? currentCompetition
        : null;
    roster.classList.toggle('hidden', !data);
    root.classList.toggle('has-live-race', Boolean(data));
    if (roster.parentElement !== root) root.append(roster);
    if (!data) return;
    const rows = showingResults ? data.standings : (data.relative?.field ?? []);
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
      finished,
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
    roster.querySelector('.roster-heading span').textContent = finished
      ? 'SPRINT COMPLETE'
      : 'RACE ORDER';
    const heading = roster.querySelector('.roster-heading b');
    heading.textContent = showingResults
      ? `${metadata.name.toUpperCase()} · ${sprint ? 'SPRINT' : '2 LAPS'}`
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
      duration.textContent = showingResults
        ? entry.finished
          ? `${fmt(entry.totalTime)}${entry.valid ? '' : ' *'}`
          : 'IN PROGRESS'
        : gapText(entry);
      if (!showingResults)
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
    const player = showingResults
      ? rows.find((entry) => entry.id === 'player')
      : null;
    roster.querySelector('.roster-laps').replaceChildren(
      ...(player?.lapTimes ?? []).map((duration, index) => {
        const row = document.createElement('div');
        const label = document.createElement('span');
        label.textContent = sprint ? 'DESCENT TIME' : `LAP ${index + 1}`;
        const value = document.createElement('b');
        value.textContent = fmt(duration);
        row.append(label, value);
        return row;
      }),
    );
    const hint = roster.querySelector('.roster-hint');
    hint.textContent = showingResults
      ? rows.some((entry) => entry.finished && !entry.valid)
        ? `* Untimed: ${sprint ? 'run' : 'lap'} invalidated`
        : currentCompetition.enabled
          ? 'Field remains live until each rival finishes'
          : 'Solo descent recorded'
      : '';
    hint.classList.toggle('hidden', !showingResults);
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
      if (player?.hasAttribute('data-menu-active')) return;
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
  if (racing && !playtest) {
    const pausedDifficulty = document.createElement('div');
    pausedDifficulty.id = 'pause-race-settings';
    pausedDifficulty.className = 'hidden';
    pausedDifficulty.innerHTML = `<label class="difficulty-picker">Opponent difficulty <select id="pause-difficulty">${['easy', 'medium', 'hard'].map((value) => `<option value="${value}">${value[0].toUpperCase() + value.slice(1)}</option>`).join('')}</select></label><p id="pause-difficulty-hint" class="small">Applies on restart.</p>`;
    $('restart').before(pausedDifficulty);
    $('pause-difficulty').value = settings.difficulty;
    $('pause-difficulty').setAttribute(
      'aria-describedby',
      'pause-difficulty-hint',
    );
    $('pause-difficulty').onchange = () =>
      actions.difficulty($('pause-difficulty').value);
  }
  const copy = metadata.ui;
  root.classList.toggle('has-racing', racing);
  root.classList.toggle('compact-landscape', Boolean(copy.compactLandscape));
  root.classList.toggle(
    'portrait-compact-hud',
    Boolean(copy.portraitCompactHud),
  );
  root.querySelector('.edition span').textContent = metadata.name;
  const {
    openFlySettings,
    toggleFlySettings,
    closeFlySettings,
    updateDevTools,
  } = !import.meta.env?.VN_DESKTOP
    ? createDevTools(root, actions, settings, metadata)
    : {
        openFlySettings() {},
        toggleFlySettings() {},
        closeFlySettings() {},
        updateDevTools() {},
      };
  function updateSetting(event) {
    const control = event.target;
    const key = control.dataset.setting;
    if (!key) return;
    settings[key] =
      control.type === 'checkbox'
        ? control.checked
        : control.type === 'range'
          ? control.valueAsNumber
          : control.value;
    actions.settings();
  }
  root.addEventListener('change', updateSetting, { signal: listeners.signal });
  root.addEventListener(
    'input',
    (event) => {
      if (event.target.type === 'range') updateSetting(event);
    },
    { signal: listeners.signal },
  );
  root.addEventListener(
    'click',
    (event) => {
      const reset = event.target.closest('[data-graphics-reset]');
      if (reset?.dataset.graphicsReset === 'halcyon') {
        Object.assign(settings, halcyonGraphicsDefaults);
        actions.settings();
      }
    },
    { signal: listeners.signal },
  );
  const bind = (id, fn) => ($(id).onclick = fn);
  bind('pause-settings', actions.openSettings);
  if (actions.openTunes) bind('pause-tunes', actions.openTunes);
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
    points.push(track.sample(s).position.clone());
  if (sprint) points.push(track.sample(track.length).position.clone());
  const mapPaths = track.mapPaths ?? [{ points, closed: !sprint }];
  const allMapPoints = mapPaths.flatMap((path) => path.points);
  const xs = allMapPoints.map((p) => p.x),
    zs = allMapPoints.map((p) => p.z),
    minX = Math.min(...xs),
    minZ = Math.min(...zs),
    scale = Math.min(
      170 / (Math.max(...xs) - minX),
      120 / (Math.max(...zs) - minZ),
    );
  const mapLeft = sprint ? (200 - (Math.max(...xs) - minX) * scale) / 2 : 15;
  const mapTop = sprint ? (150 - (Math.max(...zs) - minZ) * scale) / 2 : 15;
  const coord = (p) => [
    mapLeft + (p.x - minX) * scale,
    mapTop + (p.z - minZ) * scale,
  ];
  let oldMode = '';
  const fmt = (t) => formatTime(t, 2);
  return {
    root,
    openFlySettings,
    toggleFlySettings,
    closeFlySettings,
    updateDevTools,
    setSuspended(value) {
      suspended = !!value;
      syncPauseOwnership();
    },
    syncSettings(next) {
      $('volume').value = next.volume;
      $('quality').value = next.quality;
      $('motion').checked = next.reducedMotion;
      for (const control of root.querySelectorAll('.difficulty-picker select'))
        control.value = next.difficulty;
      for (const control of root.querySelectorAll('[data-setting]')) {
        const value = next[control.dataset.setting];
        if (control.type === 'checkbox') control.checked = value;
        else control.value = value;
      }
      for (const output of root.querySelectorAll('[data-setting-output]')) {
        output.value = `${Math.round(next[output.dataset.settingOutput] * 100)}%`;
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
    setPlaytestCase(id) {
      if (casePicker) $('playtest-case').value = id;
    },
    setMode(mode) {
      if (mode === oldMode) return;
      oldMode = mode;
      syncPauseOwnership();
      updateRoster();
      for (const [id, show] of [
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
      $('sprint-finish-actions')?.classList.toggle(
        'hidden',
        mode !== 'racing' || !currentCompetition?.playerFinished,
      );
      root.classList.toggle('flying', mode === 'fly');
      if (mode !== 'fly') closeFlySettings(false);
      $('fly-controls')?.classList.toggle('hidden', mode !== 'fly');
      root.querySelector('.masthead').inert = mode === 'paused';
      $('pause-button').classList.toggle(
        'hidden',
        mode !== 'racing' && mode !== 'countdown',
      );
      if (mode === 'paused') $('resume').focus({ preventScroll: true });
      else if (root.contains(document.activeElement))
        document.activeElement.blur();
    },
    update(
      s,
      r,
      motion = null,
      {
        practice = false,
        freestylePractice = null,
        gamepad = false,
        competition = null,
        trial = null,
        cup = null,
      } = {},
    ) {
      currentCompetition = competition;
      $('pause-race-settings')?.classList.toggle(
        'hidden',
        !competition?.enabled || !!cup,
      );
      updateControlHints(gamepad);
      if (!playtest)
        $('restart').textContent = metadata.editorTest
          ? 'Restart test drive'
          : metadata.freestyle
            ? freestylePractice
              ? 'Retry transfer'
              : 'Restart full chain'
            : sprint
              ? 'Restart sprint'
              : competition?.enabled
                ? 'Restart race'
                : 'Restart practice';
      updateRoster();
      $('sprint-finish-actions')?.classList.toggle(
        'hidden',
        oldMode !== 'racing' || !r.complete,
      );
      const player = competition?.standings.find(
        (entry) => entry.id === 'player',
      );
      const courseDistance = sprint
        ? presentationDistance(track, s, {
            ...motion?.currentPose,
            grounded: motion?.mode !== 'flight',
          })
        : s.distance;
      root
        .querySelector('.position')
        .classList.toggle('hidden', !competition?.enabled);
      $('position').textContent =
        `${player?.position ?? '—'} / ${competition?.standings.length ?? RACE_FIELD_SIZE}`;
      $('position-state').textContent = competition?.playerFinished
        ? 'ESC · PAUSE'
        : '';
      root.querySelector('.lap > span').textContent = sprint
        ? r.complete
          ? 'FINISHED'
          : 'COURSE'
        : competition?.enabled
          ? competition.playerFinished
            ? 'FREE DRIVE'
            : 'RACE LAP'
          : 'PRACTICE LAP';
      $('speed').textContent = String(Math.round(s.speed * 3.6)).padStart(
        3,
        '0',
      );
      $('time').textContent = fmt(r.elapsed);
      $('lap').textContent = sprint
        ? `${Math.min(r.complete ? 100 : 99, Math.max(0, Math.floor((100 * courseDistance) / track.finishDistance)))}%`
        : competition?.enabled && !competition.playerFinished
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
            ? s.boosting
              ? 'AIR BOOST'
              : 'AIRBORNE'
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
          : 'BOOST USES CORE RESERVE';
      $('last').textContent = sprint
        ? r.complete
          ? 'DESCENT COMPLETE'
          : `${Math.max(0, (track.finishDistance - courseDistance) / 1000).toFixed(2)} KM TO FINISH`
        : r.lastLap
          ? `LAST ${fmt(r.lastLap)}`
          : 'LAST —';
      $('best').textContent = sprint
        ? r.complete
          ? r.valid
            ? 'RESULT RECORDED'
            : 'UNTIMED RESULT'
          : r.valid
            ? (copy.courseLabel ?? 'SUMMIT → RECEIVING ARRAY')
            : 'UNTIMED RUN'
        : !r.valid
          ? practice && s.resetCount === 0
            ? 'PRACTICE SECTION'
            : 'LAP INVALIDATED · RESET'
          : r.best
            ? `BEST ${fmt(r.best)}`
            : 'SET YOUR FIRST CLEAN LAP';
      $('home').textContent = metadata.editorTest
        ? 'Back to editor'
        : 'Race setup';
      if ($('sprint-home'))
        $('sprint-home').textContent = metadata.editorTest
          ? 'Back to editor →'
          : 'Race setup →';
      if (cup) {
        $('restart').textContent = 'Retry cup race · earlier scores kept';
        root.querySelector('.lap > span').textContent =
          `CUP ${cup.eventIndex + 1}/${cup.eventCount}`;
      }
      if (trial) {
        $('restart').textContent = 'Retry Time Trial';
        root.querySelector('.lap > span').textContent = 'TIME TRIAL';
        root.querySelector('.timing > span').textContent = sprint
          ? 'ELAPSED'
          : trial.start === 'standing'
            ? 'STANDING LAP'
            : 'LAP TIME';
        if (!sprint) $('lap').textContent = String(r.lap);
        $('time').textContent = fmt(trial.elapsed);
        const storageNote =
          trial.persistence?.saved === false
            ? 'BEST NOT SAVED'
            : trial.persistence?.ghostSaved === false
              ? 'GHOST NOT SAVED'
              : '';
        if (!sprint) {
          // Keep both records in fixed rows, including while the other lap
          // category is active. Status belongs above the running clock.
          const caption = root.querySelector('.timing > span');
          if (!trial.valid) caption.textContent = 'LAP INVALID';
          else if (storageNote) caption.textContent = storageNote;
          else if (trial.delta != null)
            caption.textContent = `S${trial.sector} Δ ${formatDelta(trial.delta)}`;
          $('last').textContent =
            `STANDING BEST: ${trial.standingBest == null ? 'PENDING' : fmt(trial.standingBest)}`;
          $('best').textContent =
            `FLYING BEST: ${trial.flyingBest == null ? 'PENDING' : fmt(trial.flyingBest)}`;
        } else {
          $('last').textContent =
            trial.delta != null
              ? `S${trial.sector} Δ ${formatDelta(trial.delta)}`
              : trial.ghost
                ? 'PERSONAL GHOST'
                : trial.best
                  ? 'BEST TIME · NO GHOST'
                  : 'SET YOUR FIRST BEST';
          $('best').textContent = !trial.valid
            ? 'UNRANKED · R TO RETRY'
            : (trial.best ? `BEST ${fmt(trial.best)}` : 'NO DEVICES') +
              (storageNote ? ` · ${storageNote}` : ' · R RETRY');
        }
      } else
        root.querySelector('.timing > span').textContent = sprint
          ? 'ELAPSED'
          : 'LAP TIME';
      ctx.clearRect(0, 0, 200, 150);
      ctx.lineWidth = 2.5;
      ctx.strokeStyle = '#dbe8e1cc';
      for (const path of mapPaths) {
        ctx.strokeStyle = path.color ?? '#dbe8e1cc';
        ctx.beginPath();
        path.points.forEach((p, i) => {
          const [x, y] = coord(p);
          i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
        });
        if (path.closed) ctx.closePath();
        ctx.stroke();
      }
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
      if (sprint) {
        const marker = (distance, label, color) => {
          const point = track.sample(distance).position;
          const [x, y] = coord(point);
          ctx.fillStyle = color;
          ctx.fillRect(x - 3, y - 3, 6, 6);
          ctx.font = 'bold 9px sans-serif';
          ctx.fillText(
            label,
            x < 155 ? x + 7 : x - 39,
            Math.min(146, Math.max(10, y + 3)),
          );
        };
        marker(0, 'START', '#8adcc9');
        marker(track.finishDistance, 'FINISH', '#ffca84');
      }
      if (competition?.enabled) {
        for (const rival of competition.standings.filter(
          (entry) => entry.id !== 'player' && !entry.eliminated,
        )) {
          const frame = track.sample(rival.distance);
          const surface = track.mapPaths
            ? track.sampleSurface?.(rival.distance, rival.lateral)
            : null;
          dot(
            surface?.position ??
              frame.position
                .clone()
                .addScaledVector(frame.right, rival.lateral),
            racerColors[rival.id],
            3.5,
          );
        }
      }
      const world = motion?.currentPose?.position;
      dot(
        world
          ? { x: world[0], z: world[2] }
          : ((track.mapPaths
              ? track.sampleSurface?.(s.distance, s.lateral)?.position
              : null) ?? track.sample(s.distance).position),
        racerColors.player,
        4,
        true,
      );
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
