import { TouchMovement } from './touch-input.js';
import {
  mobileSettingsHTML,
  saveMobilePreferences,
  touchEnabled,
} from './mobile-preferences.js';

export class TouchControls {
  constructor(
    game,
    { shell, preferences, device, storage, activeLoading, onLayout },
  ) {
    this.game = game;
    this.shell = shell;
    this.preferences = preferences;
    this.device = device;
    this.storage = storage;
    this.activeLoading = activeLoading;
    this.onLayout = onLayout;
    this.input = new TouchMovement();
    this.abort = new AbortController();
    this.root = document.createElement('nav');
    this.root.id = 'touch-controls';
    this.root.setAttribute('aria-label', 'Field controls');
    this.root.innerHTML =
      '<div class="touch-stick" aria-label="Movement stick"><span class="touch-stick-ring"></span><span class="touch-stick-knob"></span><span class="touch-stick-label">Move</span></div><div class="touch-actions"><button type="button" data-touch-action="interact" class="touch-interact">Interact</button><button type="button" data-touch-action="run">Walk</button><button type="button" data-touch-action="map">Map</button><button type="button" data-touch-action="menu">Menu</button></div>';
    shell.append(this.root);
    this.pad = this.root.querySelector('.touch-stick');
    this.knob = this.root.querySelector('.touch-stick-knob');
    const listen = (element, event, fn, options = {}) =>
      element.addEventListener(event, fn, {
        ...options,
        signal: this.abort.signal,
      });
    listen(this.pad, 'pointerdown', (event) => {
      if (event.button > 0 || !this.allowed) return;
      const rect = this.pad.getBoundingClientRect();
      if (
        !this.input.begin(
          event.pointerId,
          event.clientX,
          event.clientY,
          event.timeStamp,
          {
            x: rect.left + rect.width / 2,
            y: rect.top + rect.height / 2,
            radius: rect.width * 0.37,
          },
          { doubleTap: preferences.doubleTapRun },
        )
      )
        return;
      event.preventDefault();
      event.stopPropagation();
      this.pad.setPointerCapture(event.pointerId);
      game.movePath = [];
      game.audio.unlock();
      this.paint();
    });
    listen(this.pad, 'pointermove', (event) => {
      if (this.input.update(event.pointerId, event.clientX, event.clientY)) {
        event.preventDefault();
        this.paint();
      }
    });
    for (const type of ['pointerup', 'pointercancel', 'lostpointercapture'])
      listen(this.pad, type, (event) => {
        this.input.end(event.pointerId, event.timeStamp, type !== 'pointerup');
        this.paint();
      });
    listen(this.root, 'click', (event) => {
      const action = event.target.closest('[data-touch-action]')?.dataset
        .touchAction;
      if (!action || !this.allowed) return;
      event.preventDefault();
      event.stopPropagation();
      game.audio.unlock();
      if (action === 'run') this.input.run = !this.input.run;
      else if (action === 'interact') game.interact();
      else if (action === 'map') {
        this.clear();
        game.ui.tab = 0;
        game.ui.menu = true;
        game.ui.render();
      } else {
        this.clear();
        game.ui.handleEscape();
      }
      this.sync();
    });
    listen(this.root, 'keydown', (event) => {
      if (event.key === ' ' || event.key === 'Enter') event.stopPropagation();
    });
    listen(shell, 'change', (event) => {
      const key = event.target.dataset.mobileSetting;
      if (!key || !(key in preferences)) return;
      const value = event.target.value;
      preferences[key] = ['controlSize', 'zoom'].includes(key)
        ? Number(value)
        : ['tapWalk', 'doubleTapRun'].includes(key)
          ? value === 'true'
          : value;
      if (key === 'loading') preferences.loadingChosen = true;
      saveMobilePreferences(storage, preferences);
      this.clear();
      this.sync();
      onLayout?.();
      if (game.ui.menu) game.ui.render();
    });
    listen(shell, 'click', (event) => {
      if (!event.target.closest('[data-mobile-reload]')) return;
      game.session.checkpoint({ includeBattle: true });
      location.reload();
    });
    listen(window, 'blur', () => this.clear());
    this.sync();
  }
  get enabled() {
    return touchEnabled(this.preferences, this.device);
  }
  get layoutEnabled() {
    return this.device.handheld || this.enabled;
  }
  get movement() {
    return this.enabled && this.allowed
      ? this.input.movement
      : { x: 0, y: 0, active: false, run: false };
  }
  get allowed() {
    const g = this.game;
    return (
      this.enabled &&
      g.mode === 'world' &&
      !g.ui.blocked &&
      !g.transition &&
      !g.state.recruitmentWalk &&
      !g.devTools?.open &&
      !g.upgradeTour?.open &&
      !g.worldView?.open &&
      !g.assetLoading?.busy &&
      !g.lifecyclePaused
    );
  }
  clear() {
    this.game.clearGroundContact?.();
    const id = this.input.pointer;
    this.input.reset();
    if (id !== null && this.pad.hasPointerCapture(id))
      this.pad.releasePointerCapture(id);
    this.paint();
  }
  reset() {
    this.clear();
    this.input.run = false;
    this.paint();
  }
  settingsHTML() {
    return mobileSettingsHTML(this.preferences, {
      handheld: this.device.handheld,
      smallScreen: this.device.smallScreen,
      activeLoading: this.activeLoading,
    });
  }
  sync() {
    this.shell.dataset.mobile = String(this.layoutEnabled);
    this.shell.dataset.touchControls = String(this.enabled);
    this.shell.dataset.mode = this.game.mode;
    this.shell.dataset.handedness = this.preferences.handedness;
    this.shell.style.setProperty('--touch-size', this.preferences.controlSize);
    const allowed = this.allowed;
    if (!allowed && this.input.pointer !== null) this.clear();
    this.root.hidden = !allowed;
    const interact = this.root.querySelector('[data-touch-action="interact"]');
    interact.disabled = !this.game.near;
    const label = this.game.near
      ? this.game.interactionLabel(this.game.near)
      : 'Interact';
    if (interact.textContent !== label) interact.textContent = label;
    this.paint();
  }
  paint() {
    this.knob.style.transform = `translate(calc(-50% + ${this.input.x * 30}px), calc(-50% + ${this.input.y * 30}px))`;
    const run = this.root.querySelector('[data-touch-action="run"]');
    run.textContent = this.input.run ? 'Run' : 'Walk';
    run.setAttribute('aria-pressed', String(this.input.run));
  }
  dispose() {
    this.clear();
    this.abort.abort();
    this.root.remove();
  }
}
