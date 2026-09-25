import { DEFAULT_SETTINGS } from '../core/settings.js';
const escapeHtml = (value = '') =>
  String(value).replace(
    /[&<>"']/g,
    (character) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[
        character
      ],
  );
const sunIcon =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="3.5"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5"/></svg>';
const tuneIcon =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M4 17h16"/><circle cx="9" cy="7" r="2.5"/><circle cx="16" cy="17" r="2.5"/></svg>';

export class DevPanel {
  constructor(app, root) {
    this.app = app;
    this.root = root;
    this.abort = new AbortController();
    const presentation = app.definition.presentation ?? {};
    const visibleViews = Object.entries(app.definition.views).filter(
      ([, view]) => !view.hidden,
    );
    root.innerHTML = `
      <header class="masthead"><div class="brand-mark" aria-hidden="true"><svg viewBox="0 0 36 42"><path d="M18 3 3 32h30L18 3Zm0 13L9 35h18L18 16Zm0 13v10"/></svg></div><div><h1>${escapeHtml(app.definition.title.toUpperCase())}</h1><p>${escapeHtml(presentation.subtitle)} <span>—</span> ${escapeHtml(presentation.edition)}</p></div></header>
      <div class="status"><span class="live-dot"></span><span id="fps">LIVE</span><span class="status-divider"></span><button id="toggle-panel" aria-expanded="true" aria-controls="dev-panel" title="Toggle tuning panel (Tab)">${tuneIcon}<span>Tune scene</span></button></div>
      <aside id="dev-panel" class="dev-panel" aria-label="Scene tuning"><div class="panel-heading"><span>FIELD CONTROLS</span><button id="close-panel" aria-label="Close tuning panel">×</button></div><h2>Find your light.</h2><p class="panel-description">A few ways to shape the atmosphere.</p>
        <label class="control quality-control" for="quality"><span>Render quality</span><select id="quality" data-setting="quality"><option value="balanced">Balanced</option><option value="high">High</option><option value="ultra">Ultra</option></select></label>
        ${[
          ['sunlight', 'Sunlight', 'Soft', 'Golden'],
          ['atmosphere', 'Atmosphere', 'Clear', 'Hazy'],
          ['richness', 'Ground cover', 'Sparse', 'Lush'],
          ['exposure', 'Exposure', 'Low', 'Bright'],
        ]
          .map(
            ([key, label, low, high]) =>
              `<label class="control" for="${key}"><span>${label}<output for="${key}" id="value-${key}">1.00</output></span><input id="${key}" data-setting="${key}" type="range" min="0.4" max="1.6" step="0.05" value="1"/><span class="range-captions"><small>${low}</small><small>${high}</small></span></label>`,
          )
          .join('')}
        <div class="panel-footer"><button id="reset-settings">${escapeHtml(presentation.resetLabel ?? 'Reset environment')}</button><span id="quality-note">HIGH / WEBGL 2</span></div>
      </aside>
      <div class="location"><span class="eyebrow">${escapeHtml(presentation.coordinates)} &nbsp; / &nbsp; ${escapeHtml(presentation.category)}</span><h2>${escapeHtml(presentation.location)}</h2><p>${sunIcon} ${escapeHtml(presentation.condition)} <span>·</span> ${escapeHtml(presentation.area)}</p></div>
      <div class="explore"><button id="enter-world"><span class="button-dot"></span>${escapeHtml(presentation.enterLabel ?? 'Explore')} <span aria-hidden="true">↗</span></button><p id="control-hint">${escapeHtml(presentation.controls)}</p></div>
      <nav class="view-nav" aria-label="Viewpoints"><span>VIEWPOINT</span>${visibleViews.map(([id, view], index) => `<button data-view="${escapeHtml(id)}" class="${id === app.definition.initialView ? 'active' : ''}" aria-label="View ${escapeHtml(view.label ?? id)}" title="${escapeHtml(view.label ?? id)}">${String(index + 1).padStart(2, '0')}</button>`).join('')}</nav>
      <div id="crosshair" aria-hidden="true"></div><p class="boundary-notice" id="boundary-notice" role="status"></p>`;
    const options = { signal: this.abort.signal };
    for (const control of root.querySelectorAll('[data-setting]'))
      control.addEventListener(
        'input',
        () => {
          app.setSettings({
            [control.dataset.setting]:
              control.tagName === 'SELECT'
                ? control.value
                : Number(control.value),
          });
        },
        options,
      );
    const toggle = () => this.toggle();
    root
      .querySelector('#toggle-panel')
      .addEventListener('click', toggle, options);
    root
      .querySelector('#close-panel')
      .addEventListener('click', () => this.toggle(false), options);
    root
      .querySelector('#reset-settings')
      .addEventListener(
        'click',
        () => app.setSettings(DEFAULT_SETTINGS),
        options,
      );
    root.querySelector('#enter-world').addEventListener(
      'click',
      () => {
        app.canvas.focus();
        app.controls.lock?.();
      },
      options,
    );
    for (const button of root.querySelectorAll('[data-view]'))
      button.addEventListener(
        'click',
        () => {
          app.setView(button.dataset.view);
          app.canvas.focus();
        },
        options,
      );
    window.addEventListener(
      'keydown',
      (event) => {
        if (
          event.code === 'KeyH' &&
          !/INPUT|SELECT/.test(document.activeElement?.tagName)
        )
          root.classList.toggle('hidden-ui');
        if (event.code === 'Escape') root.classList.remove('hidden-ui');
        if (event.code === 'Tab' && document.pointerLockElement) {
          event.preventDefault();
          document.exitPointerLock();
          this.toggle(true);
        }
      },
      options,
    );
    document.addEventListener(
      'pointerlockchange',
      () => {
        const locked = document.pointerLockElement === app.canvas;
        document.body.classList.toggle('is-flying', locked);
        root.querySelector('#control-hint').textContent = locked
          ? (presentation.lockedControls ?? presentation.controls ?? '')
          : (presentation.controls ?? '');
        if (locked) this.toggle(false);
      },
      options,
    );
    app.events.addEventListener(
      'settingschange',
      (event) => this.sync(event.detail),
      options,
    );
    app.events.addEventListener(
      'viewchange',
      (event) => {
        for (const button of root.querySelectorAll('[data-view]'))
          button.classList.toggle(
            'active',
            button.dataset.view === event.detail,
          );
      },
      options,
    );
    app.events.addEventListener(
      'metrics',
      (event) => {
        root.querySelector('#fps').textContent = `${event.detail.fps} FPS`;
        const p = app.camera.position;
        const bounds = app.bounds;
        const edgeDistance = Math.min(
          p.x - bounds.minX,
          bounds.maxX - p.x,
          p.z - bounds.minZ,
          bounds.maxZ - p.z,
        );
        root.querySelector('#boundary-notice').textContent =
          edgeDistance < 1
            ? (presentation.boundaryNotice ?? 'Edge of the scene')
            : '';
      },
      options,
    );
    this.sync(app.settings);
    if (window.innerWidth < 760) this.toggle(false);
  }
  sync(settings) {
    for (const [key, value] of Object.entries(settings)) {
      const control = this.root.querySelector(`[data-setting="${key}"]`);
      if (control) control.value = value;
      const output = this.root.querySelector(`#value-${key}`);
      if (output) output.value = Number(value).toFixed(2);
    }
    this.root.querySelector('#quality-note').textContent =
      `${settings.quality.toUpperCase()} / WEBGL 2`;
  }
  toggle(force) {
    const panel = this.root.querySelector('#dev-panel');
    const open = force ?? panel.hidden;
    panel.hidden = !open;
    this.root
      .querySelector('#toggle-panel')
      .setAttribute('aria-expanded', String(open));
  }
  dispose() {
    this.abort.abort();
    this.root.replaceChildren();
  }
}
