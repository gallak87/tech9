import * as THREE from 'three';
import { FishingRules } from './FishingRules.js';
import { Tackle } from './Tackle.js';
import { POND, isWater } from '../world/pondDefinition.js';

const ICON = `<svg viewBox="0 0 64 40" fill="none" aria-hidden="true"><path d="M10 20C22 1 43 3 53 20 43 37 22 39 10 20ZM10 20 2 10v20l8-10Z" stroke="currentColor" stroke-width="1.5"/><circle cx="44" cy="17" r="1.8" fill="currentColor"/><path d="m24 9 8-7 6 7M25 31l7 6 6-7M16 20h18" stroke="currentColor"/></svg>`;
export class FishingGame {
  constructor(app) {
    this.id = 'fishing-game';
    this.app = app;
    this.rules = new FishingRules();
    this.started = false;
    this.held = false;
    this.released = 0;
    this.abort = new AbortController();
    this.previous = '';
    this.uiTime = 0;
  }
  init(ctx) {
    this.ctx = ctx;
    this.tackle = new Tackle(ctx.scene, ctx.camera);
    this.marker = new THREE.Mesh(
      new THREE.RingGeometry(0.27, 0.3, 48),
      new THREE.MeshBasicMaterial({
        color: '#e5d9a8',
        transparent: true,
        opacity: 0.8,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    );
    this.marker.rotation.x = -Math.PI / 2;
    ctx.scene.add(this.marker);
    this.root = document.createElement('div');
    this.root.className = 'game-ui';
    this.root.innerHTML = `
      <header class="masthead"><div class="wordmark">${ICON}<span>STILLWATER<small>THE QUIET HOURS</small></span></div><div class="top-actions"><span class="weather">16° &nbsp; / &nbsp; LATE AFTERNOON</span><button id="pause-button" aria-label="Pause and settings">Ⅱ <span>Pause</span></button></div></header>
      <div class="location"><span class="tiny-line"></span> SOUTH BANK <span class="location-dot">·</span> ALDER POND</div>
      <div class="aim-dot"></div><div class="cast-label"></div>
      <div class="field-notes"><span class="eyebrow">FIELD NOTES &nbsp; / &nbsp; 01</span><span class="species">Brook trout</span><span class="catch-count">Catch & release · 0 returned</span></div>
      <section class="action-card"><div class="action-top"><span class="phase-tag">01 / CAST</span><span class="action-key">SPACE</span></div><h2 class="action-title">Make a little time.</h2><p class="action-detail"></p><div class="power-wrap"><div class="meter-label">CAST POWER <span class="power-value"></span></div><div class="meter"><i class="power-fill"></i></div></div><div class="fight-wrap"><div class="meter-label">LINE TENSION <span class="tension-state"></span></div><div class="meter tension"><i class="tension-fill"></i><b></b></div><div class="meter-label distance-label">DISTANCE TO LAND <span class="progress-value"></span></div><div class="meter progress"><i class="progress-fill"></i></div></div></section>
      <div class="controls"><span><kbd>W A S D</kbd> walk</span><span><kbd>RIGHT DRAG</kbd> look</span><span><kbd>ESC</kbd> pause</span><button id="lock-button">Capture mouse ↗</button></div>
      <div class="session-meta"><span class="session-state">A MOMENT OUTSIDE</span><span class="fps-label"></span></div>
      <section class="intro panel"><div class="eyebrow">A SMALL FISHING ESCAPE</div><h1>Let the world<br>wait a while.</h1><p class="intro-description">A sheltered pond. The last of the sunlight.<br>And something stirring below the surface.</p><div class="howto"><div><b>01</b><p><strong>Cast into the pond</strong><span>Walk to the bank. Hold Space for power; release to cast.</span></p></div><div><b>02</b><p><strong>Watch for a bite</strong><span>When the float dives, press Space to set the hook.</span></p></div><div><b>03</b><p><strong>Bring it home, gently</strong><span>Hold Space to reel. Let go when the fish pulls. Land & release.</span></p></div></div><button id="begin" class="primary">Walk to the water <span>→</span></button><div class="desktop-note">DESKTOP · KEYBOARD & MOUSE · NO SOUND NEEDED</div></section>
      <div class="menu-shade" hidden></div><section class="pause-panel panel" hidden><div class="eyebrow">TAKE YOUR TIME</div><h2>The pond can wait.</h2><p>Your cast is paused. Come back when you’re ready.</p><button id="resume" class="primary">Back to the water <span>→</span></button><details><summary>Scene settings</summary><label>Render quality<select id="quality"><option value="balanced">Balanced</option><option value="high">High</option><option value="ultra">Ultra</option></select></label><label>Sunlight<input id="sunlight" type="range" min=".4" max="1.6" step=".1" value="1"/></label><label>Atmosphere<input id="atmosphere" type="range" min=".4" max="1.6" step=".1" value="1"/></label><label>Ground cover<input id="richness" type="range" min=".4" max="1.6" step=".1" value="1"/></label><label>Exposure<input id="exposure" type="range" min=".4" max="1.6" step=".1" value="1"/></label></details><button id="restart" class="secondary">Restart this visit</button><small>Also aim with I / J / K / L. Shift walks faster.<br>Left mouse can replace Space.</small></section>
      <section class="catch-panel panel" hidden><div class="eyebrow">A MOMENT TO REMEMBER</div><div class="catch-icon">${ICON}</div><h2>Brook trout</h2><p class="latin">Salvelinus fontinalis</p><div class="catch-stats"><div><strong class="length-value"></strong><span>CENTIMETRES</span></div><div><strong class="weight-value"></strong><span>KILOGRAMS</span></div></div><p>A flash of copper. A little wildness.<br>Let this one keep the pond.</p><button id="release" class="primary">Release & cast again <span>↗</span></button><small>SPACE TO RELEASE · CATCH & RELEASE ONLY</small></section>
      <div class="narrow-notice">Best with a keyboard & mouse</div>`;
    ctx.ui.append(this.root);
    const find = (s) => this.root.querySelector(s);
    this.el = {};
    for (const name of [
      'intro',
      'action-card',
      'action-title',
      'action-detail',
      'phase-tag',
      'power-wrap',
      'power-fill',
      'power-value',
      'fight-wrap',
      'tension-fill',
      'tension-state',
      'progress-fill',
      'progress-value',
      'pause-panel',
      'menu-shade',
      'catch-panel',
      'catch-count',
      'length-value',
      'weight-value',
      'cast-label',
      'fps-label',
      'session-state',
    ])
      this.el[name] = find('.' + name);
    const options = { signal: this.abort.signal };
    find('#begin').addEventListener(
      'click',
      () => {
        this.started = true;
        this.el.intro.hidden = true;
        this.app.canvas.focus();
        this.render();
      },
      options,
    );
    find('#pause-button').addEventListener(
      'click',
      () => this.pause(),
      options,
    );
    find('#resume').addEventListener('click', () => this.resume(), options);
    find('#restart').addEventListener('click', () => this.restart(), options);
    find('#release').addEventListener('click', () => this.release(), options);
    find('#lock-button').addEventListener(
      'click',
      async () => {
        const locked = await this.app.controls.lock();
        find('#lock-button').textContent = locked
          ? 'Mouse captured · Esc to pause'
          : 'Capture unavailable · right-drag to look';
      },
      options,
    );
    for (const key of [
      'quality',
      'sunlight',
      'atmosphere',
      'richness',
      'exposure',
    ]) {
      const input = find('#' + key);
      input.value = this.app.settings[key];
      input.addEventListener(
        'input',
        () =>
          this.app.setSettings({
            [key]: key === 'quality' ? input.value : Number(input.value),
          }),
        options,
      );
    }
    window.addEventListener(
      'keydown',
      (event) => {
        if (/^(INPUT|SELECT|TEXTAREA|SUMMARY)$/.test(event.target.tagName))
          return;
        if (event.code === 'Escape' || event.code === 'KeyP') {
          event.preventDefault();
          if (this.rules.paused) this.resume();
          else this.pause();
        }
        if (event.code === 'Space') {
          event.preventDefault();
          if (!event.repeat) this.press();
        }
      },
      options,
    );
    window.addEventListener(
      'keyup',
      (event) => {
        if (event.code === 'Space') {
          event.preventDefault();
          this.releaseInput();
        }
      },
      options,
    );
    ctx.renderer.domElement.addEventListener(
      'pointerdown',
      (event) => {
        if (event.button === 0) this.press();
      },
      options,
    );
    window.addEventListener(
      'pointerup',
      (event) => {
        if (event.button === 0) this.releaseInput();
      },
      options,
    );
    window.addEventListener(
      'pointercancel',
      () => {
        this.held = false;
        this.pause();
      },
      options,
    );
    this.render();
  }
  get active() {
    return this.started && !this.rules.paused;
  }
  press() {
    if (!this.active) return;
    const phase = this.rules.phase;
    if (phase === 'landed') {
      this.release();
      return;
    }
    if (phase === 'failed') {
      this.rules.action();
      this.held = false;
      this.render();
      return;
    }
    this.held = true;
    if (phase === 'ready') this.rules.startCharge();
    else if (phase === 'bite') this.rules.action();
    this.render();
  }
  castAim(power = this.rules.power || 0) {
    const direction = new THREE.Vector3();
    this.ctx.camera.getWorldDirection(direction);
    const distance =
      direction.y < -0.65
        ? 2
        : THREE.MathUtils.clamp(7 + power * 18 + direction.y * 8, 4, 27);
    direction.y = 0;
    direction.normalize();
    const target = this.ctx.camera.position
      .clone()
      .addScaledVector(direction, distance);
    target.y = POND.level + 0.06;
    return { target, distance, valid: isWater(target.x, target.z) };
  }
  releaseInput() {
    if (this.active && this.rules.phase === 'charging' && this.held) {
      const aim = this.castAim();
      this.tackle.target.copy(aim.target);
      this.rules.cast(aim.valid, aim.distance);
    }
    this.held = false;
    this.render();
  }
  release() {
    if (!this.active || this.rules.phase !== 'landed') return;
    this.released++;
    this.rules.action();
    this.held = false;
    this.render();
  }
  pause() {
    if (!this.started || this.rules.paused) return;
    this.rules.paused = true;
    this.held = false;
    this.app.controls.resetMotion();
    if (document.pointerLockElement) document.exitPointerLock();
    this.render();
  }
  resume() {
    if (!this.started) return;
    this.rules.paused = false;
    this.held = false;
    this.app.canvas.focus();
    this.render();
  }
  restart() {
    this.rules.reset();
    this.started = true;
    this.released = 0;
    this.held = false;
    this.tackle.target.set(0, POND.level, 0);
    this.app.setView('trail');
    this.el.intro.hidden = true;
    this.render();
    this.app.canvas.focus();
  }
  update(dt) {
    if (this.active)
      this.rules.tick(dt, {
        reeling: this.held && this.rules.phase === 'fight',
      });
    this.tackle.update(
      this.active ? dt : 0,
      this.rules,
      this.started,
      this.held,
    );
    const aim = this.castAim(
      this.rules.phase === 'charging' ? this.rules.power : 0.45,
    );
    this.marker.visible =
      this.active && ['ready', 'charging'].includes(this.rules.phase);
    this.marker.position.copy(aim.target);
    if (!aim.valid)
      this.marker.position.y =
        this.ctx.groundHeight(aim.target.x, aim.target.z) + 0.04;
    this.marker.material.color.set(aim.valid ? '#e6dcac' : '#d37e5c');
    this.uiTime += dt;
    if (this.uiTime > 0.06 || this.previous !== this.rules.phase) {
      this.render();
      this.uiTime = 0;
    }
  }
  render() {
    if (!this.el) return;
    const r = this.rules,
      e = this.el,
      phase = r.phase;
    const states = {
      ready: [
        '01 / CAST',
        'Cast into the quiet.',
        'Hold Space to build power. Release to cast.',
      ],
      charging: [
        '01 / CAST',
        'Find your distance.',
        'Release Space when the marker is over water.',
      ],
      casting: [
        '01 / CAST',
        'A little patience.',
        'Your float is settling on the water.',
      ],
      waiting: [
        '02 / WATCH',
        'Watch the float.',
        'When it dives, press Space to set the hook.',
      ],
      bite: [
        '03 / HOOK',
        'There! Set the hook.',
        'Press Space now — the float is going under.',
      ],
      fight: [
        '04 / REEL',
        r.pulling ? 'The trout is pulling.' : 'Gently, bring it closer.',
        r.pulling
          ? 'Let go of Space. Give the fish a little line.'
          : 'Hold Space to reel. Let go before tension gets high.',
      ],
      failed: [
        'TRY AGAIN',
        'Another chance.',
        r.reason + ' Press Space to ready your rod.',
      ],
      landed: [
        '05 / LANDED',
        'A beautiful little catch.',
        'Release it when you’re ready.',
      ],
    };
    const state = states[phase] || states.ready;
    e['phase-tag'].textContent = state[0];
    e['action-title'].textContent = state[1];
    e['action-detail'].textContent = state[2];
    e['action-card'].hidden = !this.started || phase === 'landed' || r.paused;
    e['action-card'].classList.toggle('bite', phase === 'bite');
    e['power-wrap'].hidden = phase !== 'charging';
    e['power-fill'].style.width = `${r.power * 100}%`;
    e['power-value'].textContent = `${Math.round(r.power * 100)}%`;
    e['fight-wrap'].hidden = phase !== 'fight';
    e['tension-fill'].style.width = `${r.tension * 100}%`;
    e['tension-fill'].style.background =
      r.tension > 0.7 ? '#d98763' : '#abb793';
    e['tension-state'].textContent =
      r.tension > 0.72
        ? 'HIGH · EASE OFF'
        : r.pulling
          ? 'PULLING · RELEASE'
          : 'STEADY';
    e['progress-fill'].style.width = `${r.progress * 100}%`;
    e['progress-value'].textContent =
      `${Math.round((1 - r.progress) * this.tackle.target.distanceTo(this.ctx.camera.position))} m`;
    e['pause-panel'].hidden = e['menu-shade'].hidden = !r.paused;
    e['catch-panel'].hidden = phase !== 'landed' || r.paused || !this.started;
    if (r.lastCatch) {
      e['length-value'].textContent = r.lastCatch.lengthCm;
      e['weight-value'].textContent = r.lastCatch.weightKg;
    }
    e['catch-count'].textContent =
      `Catch & release · ${this.released} returned`;
    e['session-state'].textContent = r.paused
      ? 'A MOMENT TO BREATHE'
      : phase === 'fight'
        ? 'ONE FISH. ONE MOMENT.'
        : 'A MOMENT OUTSIDE';
    e['fps-label'].textContent = this.app.metrics.fps
      ? `${this.app.settings.quality.toUpperCase()} / ${this.app.metrics.fps} FPS`
      : '';
    const aim = this.castAim(phase === 'charging' ? r.power : 0.45);
    e['cast-label'].hidden =
      !this.active || !['ready', 'charging'].includes(phase);
    e['cast-label'].textContent = aim.valid
      ? 'CAST INTO THE POND'
      : 'BANK · AIM TOWARD WATER';
    this.root.classList.toggle('is-intro', !this.started);
    this.root.classList.toggle('is-paused', r.paused);
    this.root.classList.toggle('is-catch', phase === 'landed');
    this.previous = phase;
  }
  snapshot() {
    return {
      ...this.rules.snapshot(),
      started: this.started,
      released: this.released,
      held: this.held,
      castTarget: this.tackle.target.toArray(),
      aim: this.castAim(0.45),
      position: this.ctx.camera.position.toArray(),
    };
  }
  dispose() {
    this.abort.abort();
    this.root?.remove();
    this.tackle?.dispose();
    this.ctx.scene.remove(this.marker);
    this.marker.geometry.dispose();
    this.marker.material.dispose();
  }
}
