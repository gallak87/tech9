const ICONS = {
  play: '<path d="m8 5 11 7-11 7Z"/>',
  pause: '<path d="M8 5v14M16 5v14"/>',
  restart: '<path d="M4 10a8 8 0 1 1 1 7M4 4v6h6"/>',
  back: '<path d="M6 5v14m12-14-9 7 9 7Z"/>',
  forward: '<path d="M18 5v14M6 5l9 7-9 7Z"/>',
  export: '<path d="M12 15V3m-4 4 4-4 4 4M5 14v6h14v-6"/>',
  import: '<path d="M12 3v12m-4-4 4 4 4-4M5 14v6h14v-6"/>',
  crosshair: '<circle cx="12" cy="12" r="6"/><path d="M12 2v5m0 10v5M2 12h5m10 0h5"/>',
  figure: '<circle cx="12" cy="5" r="2"/><path d="M12 7v8m-6-5 6 2 6-2m-6 5-4 6m4-6 4 6"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1 1m12 12 1 1M5 19l1-1M18 6l1-1"/>',
};

function icon(name) {
  return `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${ICONS[name] || ICONS.crosshair}</svg>`;
}

function escapeHTML(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
}

function readPath(source, path) {
  return path.split('.').reduce((value, key) => value?.[key], source);
}

function makePatch(path, value) {
  return path.split('.').reverse().reduce((patch, key) => ({ [key]: patch }), value);
}

function range(path, label, min, max, step, suffix = '') {
  return `<label class="range-control"><span class="control-label">${label}<output data-output="${path}" data-suffix="${suffix}"></output></span><input type="range" data-path="${path}" min="${min}" max="${max}" step="${step}" aria-label="${label}"></label>`;
}

function toggle(path, label, description = '') {
  return `<label class="toggle-control"><span>${label}${description ? `<small>${description}</small>` : ''}</span><input type="checkbox" data-path="${path}"><span class="toggle-track" aria-hidden="true"></span></label>`;
}

function section(title, detail, body, extraClass = '') {
  return `<section class="control-section ${extraClass}"><div class="section-heading"><h2>${title}</h2>${detail ? `<span>${detail}</span>` : ''}</div>${body}</section>`;
}

function actionButton(action, label, iconName, extraClass = '') {
  return `<button type="button" class="${extraClass}" data-action="${action}" title="${label}" aria-label="${label}">${icon(iconName)}</button>`;
}

/** Mount once; frame updates only change existing values and readouts. */
export function mountUI({ state, clips, cameras, lightingPresets, onChange, onAction }) {
  const app = document.querySelector('#app');
  if (!app) throw new Error('Character stage requires an #app element.');
  let currentState = state;
  let currentClipId;
  let messageTimer;
  const eventController = new AbortController();
  const listen = (target, type, handler) => target.addEventListener(type, handler, { signal: eventController.signal });
  const text = (element, value) => {
    const next = String(value);
    if (element.textContent !== next) element.textContent = next;
  };

  const clipList = clips.map((clip, index) => `<button type="button" class="clip-button" data-clip="${escapeHTML(clip.id)}" aria-pressed="false"><span class="clip-number">${String(index + 1).padStart(2, '0')}</span><span class="clip-copy"><strong>${escapeHTML(clip.label)}</strong><small>${clip.loop ? 'Cycle' : 'Single action'} · ${Number(clip.duration).toFixed(2)}s</small></span><span class="clip-indicator" aria-hidden="true"></span></button>`).join('');
  const colorLabels = { skin: 'Skin', hair: 'Hair', coat: 'Jacket', cloth: 'Cloth', leather: 'Leather', metal: 'Steel', accent: 'Brass', blade: 'Blade' };
  const colors = Object.entries(colorLabels).map(([key, label]) => `<label class="color-control"><input type="color" data-path="character.palette.${key}" aria-label="${label} color"><span>${label}</span></label>`).join('');
  const cameraButtons = cameras.map((camera) => `<button type="button" data-camera="${escapeHTML(camera.id)}" aria-pressed="false">${escapeHTML(camera.label)}</button>`).join('');
  const lightingOptions = lightingPresets.map((preset) => `<option value="${escapeHTML(preset.id)}">${escapeHTML(preset.label)}</option>`).join('');

  app.innerHTML = `
    <header class="app-header">
      <a class="brand" href="./" aria-label="Chronoforge Day character stage"><span class="brand-mark" aria-hidden="true">${icon('sun')}</span><span><strong>CHRONOFORGE <b>DAY</b></strong><small>Character stage</small></span></a>
      <div class="header-subject"><span class="status-dot"></span>HUMANOID / KAIDA <span class="revision">01</span></div>
      <div class="file-actions"><button type="button" data-action="importFile">${icon('import')}<span>Load</span></button><button type="button" data-action="export">${icon('export')}<span>Save setup</span></button><button type="button" class="reset-button" data-action="reset" title="Reset character and stage">Reset</button></div>
      <input type="file" id="setup-file" accept=".json,application/json" hidden>
    </header>
    <main class="workbench">
      <aside class="sidebar subject-sidebar" aria-label="Character and motion clips">
        <div class="subject-card"><div class="eyebrow">SUBJECT 001</div><div class="subject-title"><h1>Kaida</h1><span class="family-badge">${icon('figure')} Humanoid</span></div><p>Shared rig · editable proportions</p></div>
        ${section('Motion library', `${clips.length} CLIPS`, `<div class="clip-list" role="group" aria-label="Motion clips">${clipList}</div><p id="clip-description" class="section-note"></p>`)}
        ${section('Silhouette', 'METRES', range('character.height', 'Height', 1.4, 2.1, 0.01, ' m') + range('character.build', 'Build', 0.75, 1.3, 0.01, '×') + range('character.headScale', 'Head', 0.8, 1.2, 0.01, '×') + range('character.weaponScale', 'Weapon', 0.7, 1.3, 0.01, '×'))}
        ${section('Palette', '8 MATERIALS', `<div class="palette-grid">${colors}</div>`)}
        <div class="sidebar-footnote">Appearance is per character.<br>Rig and motion belong to the family.</div>
      </aside>
      <section class="stage-column" aria-label="Animation preview and transport">
        <div class="stage-surface">
          <div id="viewport" aria-label="Interactive 3D character preview"></div>
          <div class="stage-topline"><div><span class="eyebrow">CHARACTER PREVIEW</span><div class="stage-view-name" id="camera-name"></div></div><span class="stage-live"><span></span><span id="play-state">PLAYING</span></span></div>
          <div class="stage-bottomline"><span>Drag to orbit · scroll to zoom</span><span class="stage-axis"><i>Y</i> UP <i>Z</i> FORWARD</span></div>
          <div id="stage-message" class="stage-message" role="status" aria-live="polite" hidden></div>
        </div>
        <div class="inspection-strip" aria-label="Live motion measurements">
          <div><span>PHASE</span><strong id="metric-phase">—</strong></div>
          <div><span>CONTACT</span><strong class="foot-contacts"><span id="contact-left">L</span><span id="contact-right">R</span></strong></div>
          <div><span>SWORD → TARGET</span><strong id="metric-distance">—</strong></div>
          <div class="render-metrics"><span id="metric-geometry">—</span><strong id="metric-fps">— FPS</strong></div>
        </div>
        <section class="transport" aria-label="Animation transport">
          <div class="transport-topline"><div class="transport-title"><strong id="transport-clip">Idle</strong><span id="clip-mode">LOOP</span></div><div class="time-readout"><span id="time-current">0.00</span><span>/</span><span id="time-duration">0.00</span><small>SEC</small></div></div>
          <div class="timeline-wrap"><div id="timeline-markers" class="timeline-markers" aria-hidden="true"></div><input id="timeline" type="range" min="0" max="1" step="0.001" value="0" aria-label="Animation time in seconds"><div id="marker-labels" class="marker-labels" role="group" aria-label="Jump to a motion phase"></div></div>
          <div class="transport-bottomline"><div class="transport-buttons">${actionButton('restart', 'Restart clip', 'restart', 'transport-secondary')}${actionButton('stepBack', 'Previous frame (,)', 'back', 'transport-secondary')}${actionButton('togglePlay', 'Pause (Space)', 'pause', 'play-button')}${actionButton('stepForward', 'Next frame (.)', 'forward', 'transport-secondary')}</div><label class="loop-control"><input type="checkbox" data-path="loop"><span>Loop</span></label><label class="speed-control"><span>Speed</span><select data-path="speed" data-number="true" aria-label="Playback speed"><option value="0.25">0.25×</option><option value="0.5">0.5×</option><option value="1">1×</option><option value="1.5">1.5×</option><option value="2">2×</option></select></label><span class="keyboard-hint"><kbd>Space</kbd> play / pause</span></div>
        </section>
      </section>
      <aside class="sidebar stage-sidebar" aria-label="Stage settings">
        ${section('Camera', 'ORTHOGRAPHIC', `<div class="camera-grid" role="group" aria-label="Camera angle">${cameraButtons}</div>${range('zoom', 'Framing', 0.55, 1.8, 0.01, '×')}<p class="section-note">Game view shows combat scale.<br>Inspection views reveal the silhouette.</p>`)}
        ${section('Lighting', '', `<label class="select-control"><span>Preset</span><select data-path="lighting" aria-label="Lighting preset">${lightingOptions}</select></label>${range('exposure', 'Exposure', 0.4, 2, 0.01, '×')}`)}
        ${section('Inspection', '', toggle('view.skeleton', 'Skeleton') + toggle('view.wireframe', 'Wireframe') + toggle('view.grid', 'Floor grid') + toggle('view.contacts', 'Foot contacts') + toggle('view.trajectory', 'Sword trajectory') + toggle('view.target', 'Strike target'))}
        ${section('Motion tuning', 'SHARED CLIPS', range('motion.stride', 'Stride', 0.5, 1.4, 0.01, '×') + range('motion.intensity', 'Intensity', 0.5, 1.4, 0.01, '×') + range('motion.reach', 'Reach', 0.7, 1.3, 0.01, '×'))}
      </aside>
    </main>
    <footer class="app-footer"><span><span class="status-dot"></span>LOCAL CHARACTER WORKBENCH</span><span>Humanoid family 01 <i>·</i> Setup saved on this device</span></footer>`;

  const refs = Object.fromEntries([...app.querySelectorAll('[id]')].map((element) => [element.id, element]));
  const controls = [...app.querySelectorAll('[data-path]')];
  const outputs = [...app.querySelectorAll('[data-output]')];
  const clipButtons = [...app.querySelectorAll('[data-clip]')];
  const viewButtons = [...app.querySelectorAll('[data-camera]')];
  const playButton = app.querySelector('[data-action="togglePlay"]');
  let wasPlaying;

  function message(content, isError = false) {
    clearTimeout(messageTimer);
    text(refs['stage-message'], content);
    refs['stage-message'].hidden = false;
    refs['stage-message'].classList.toggle('is-error', isError);
    messageTimer = setTimeout(() => { refs['stage-message'].hidden = true; }, 5000);
  }

  for (const control of controls) {
    const eventName = control.tagName === 'SELECT' || control.type === 'checkbox' ? 'change' : 'input';
    listen(control, eventName, () => {
      const value = control.type === 'checkbox' ? control.checked : control.type === 'range' || control.dataset.number ? Number(control.value) : control.value;
      onChange(makePatch(control.dataset.path, value));
    });
  }

  for (const button of clipButtons) listen(button, 'click', () => {
    const clip = clips.find((item) => item.id === button.dataset.clip);
    onChange({ clip: clip.id, time: 0, loop: clip.loop, playing: currentState.playing });
  });
  for (const button of viewButtons) listen(button, 'click', () => onChange({ camera: button.dataset.camera }));

  for (const button of app.querySelectorAll('[data-action]')) listen(button, 'click', () => {
    if (button.dataset.action === 'importFile') refs['setup-file'].click();
    else onAction(button.dataset.action);
  });

  listen(refs.timeline, 'input', () => onChange({ time: Number(refs.timeline.value), playing: false }));
  listen(refs['marker-labels'], 'click', event => {
    const button = event.target.closest('[data-time]');
    if (button) onChange({ time: Number(button.dataset.time), playing: false });
  });
  listen(refs['setup-file'], 'change', async () => {
    const file = refs['setup-file'].files?.[0];
    if (!file) return;
    try {
      const parsed = JSON.parse(await file.text());
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('The setup must contain a JSON object.');
      await onAction('import', parsed);
    } catch (error) {
      message(`Could not load setup: ${error.message}`, true);
    } finally {
      refs['setup-file'].value = '';
    }
  });

  listen(window, 'keydown', (event) => {
    const target = event.target;
    if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey || target?.isContentEditable || target?.closest?.('input, textarea, select, button, a, [contenteditable="true"]')) return;
    if (event.code === 'Space') {
      event.preventDefault();
      if (!event.repeat) onAction('togglePlay');
    } else if (event.code === 'Comma' || event.code === 'Period') {
      event.preventDefault();
      onAction(event.code === 'Comma' ? 'stepBack' : 'stepForward');
    }
  });

  function update(nextState, stats = {}) {
    currentState = nextState;
    const clip = clips.find((item) => item.id === currentState.clip) || clips[0];
    for (const control of controls) {
      const value = readPath(currentState, control.dataset.path);
      if (value === undefined) continue;
      if (control.tagName === 'SELECT' && control.dataset.number && ![...control.options].some((option) => option.value === String(value))) {
        let option = control.querySelector('[data-custom]');
        if (!option) {
          option = document.createElement('option');
          option.dataset.custom = 'true';
          control.appendChild(option);
        }
        option.value = value;
        option.textContent = `${value}×`;
      }
      if (control.type === 'checkbox') control.checked = Boolean(value);
      else if (document.activeElement !== control && control.value !== String(value)) control.value = value;
      if (control.type === 'range') {
        const progress = (Number(value) - Number(control.min)) / (Number(control.max) - Number(control.min));
        control.style.setProperty('--range-progress', `${Math.max(0, Math.min(100, progress * 100))}%`);
      }
    }
    for (const output of outputs) {
      const value = readPath(currentState, output.dataset.output);
      text(output, `${Number(value).toFixed(2)}${output.dataset.suffix || ''}`);
    }
    for (const button of clipButtons) button.setAttribute('aria-pressed', String(button.dataset.clip === currentState.clip));
    for (const button of viewButtons) button.setAttribute('aria-pressed', String(button.dataset.camera === currentState.camera));
    text(refs['camera-name'], cameras.find((camera) => camera.id === currentState.camera)?.label || currentState.camera);
    text(refs['play-state'], currentState.playing ? 'PLAYING' : 'PAUSED');
    refs['play-state'].parentElement.classList.toggle('is-paused', !currentState.playing);
    if (wasPlaying !== currentState.playing) {
      playButton.innerHTML = icon(currentState.playing ? 'pause' : 'play');
      playButton.setAttribute('aria-label', `${currentState.playing ? 'Pause' : 'Play'} (Space)`);
      playButton.title = `${currentState.playing ? 'Pause' : 'Play'} (Space)`;
      wasPlaying = currentState.playing;
    }
    if (clip && currentClipId !== clip.id) {
      currentClipId = clip.id;
      refs.timeline.max = clip.duration;
      text(refs['transport-clip'], clip.label);
      text(refs['clip-description'], clip.description || '');
      text(refs['time-duration'], clip.duration.toFixed(2));
      const markers = clip.markers || [];
      refs['timeline-markers'].innerHTML = markers.map((marker) => `<i style="left:${Math.max(0, Math.min(100, marker.time / clip.duration * 100))}%"></i>`).join('');
      refs['marker-labels'].innerHTML = markers.map((marker) => {
        const position = Math.max(0, Math.min(100, marker.time / clip.duration * 100));
        return `<button type="button" data-time="${marker.time}" title="Inspect ${escapeHTML(marker.label)} at ${marker.time.toFixed(2)} seconds" class="${position < 8 ? 'marker-start' : position > 92 ? 'marker-end' : ''}" style="left:${position}%">${escapeHTML(marker.label)}</button>`;
      }).join('');
    }
    text(refs['clip-mode'], currentState.loop ? 'LOOP' : 'SINGLE');
    text(refs['time-current'], Number(currentState.time).toFixed(2));
    if (document.activeElement !== refs.timeline) refs.timeline.value = currentState.time;
    refs.timeline.style.setProperty('--range-progress', `${Math.min(100, currentState.time / Math.max(0.001, clip?.duration || 1) * 100)}%`);
    text(refs['metric-phase'], stats.phase || '—');
    for (const side of ['left', 'right']) {
      const contact = stats.contacts?.[side];
      refs[`contact-${side}`].classList.toggle('is-planted', Boolean(contact));
      refs[`contact-${side}`].title = `${side === 'left' ? 'Left' : 'Right'} foot: ${contact === undefined ? 'unavailable' : contact ? 'planted' : 'lifted'}`;
      refs[`contact-${side}`].setAttribute('aria-label', refs[`contact-${side}`].title);
    }
    text(refs['metric-distance'], Number.isFinite(stats.tipDistance) ? `${stats.tipDistance.toFixed(3)} m` : '—');
    text(refs['metric-fps'], Number.isFinite(stats.fps) ? `${Math.round(stats.fps)} FPS` : '— FPS');
    text(refs['metric-geometry'], Number.isFinite(stats.triangles) ? `${Math.round(stats.triangles).toLocaleString()} TRI · ${stats.bones ?? '—'} BONES` : '— TRI · — BONES');
  }

  update(state);
  return {
    update,
    destroy() {
      eventController.abort();
      clearTimeout(messageTimer);
      app.replaceChildren();
    },
  };
}
