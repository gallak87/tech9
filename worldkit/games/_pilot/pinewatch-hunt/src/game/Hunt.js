import * as THREE from 'three';
import { Walker } from './Walker.js';
import { createDeer, createBow } from './models.js';
import { newHunt, stepHunt, shoot, retrieve } from './rules.js';
import {
  createSigns,
  SPAWN,
  DEER,
  HUNT_BOUNDS,
  clearSight,
  getDeadfallColliders,
  collectShotBlockers,
} from './encounter.js';

export class Hunt {
  constructor(app) {
    this.app = app;
    this.id = 'pinewatch-hunt';
    this.state = newHunt();
    this.mode = 'intro';
    this.draw = 0;
    this.drawing = false;
    this.time = 0;
    this.visualTime = 0;
    this.lastPhase = '';
  }
  init(context) {
    this.context = context;
    this.signs = createSigns();
    context.scene.add(this.signs.group);
    this.colliders = [
      ...context.definition.getColliders(),
      ...this.signs.colliders,
      ...getDeadfallColliders(context.scene),
    ];
    this.shotBlockers = collectShotBlockers(context.scene);
    this.deer = createDeer();
    context.scene.add(this.deer.group);
    this.bow = createBow(context.camera);
    context.camera.add(this.bow.group);
    context.scene.add(context.camera);
    this.ray = new THREE.Raycaster();
    this.walker = this.app.setController(
      (c) =>
        new Walker({ ...c, bounds: HUNT_BOUNDS }, this.colliders, {
          pause: () => this.pause(),
          draw: () => this.startDraw(),
          release: () => this.release(),
          retrieve: () => this.take(),
        }),
    );
    this.mount = document.createElement('div');
    this.mount.className = 'hunt-interface';
    context.ui.append(this.mount);
    this.mount.innerHTML = `
      <header class="masthead"><div class="brand"><span class="pine-mark">♧</span> PINEWATCH <span class="brand-rule"></span><small>THE HUNT</small></div><span class="region">NORTH RANGE &nbsp; / &nbsp; 06:24 AM</span></header>
      <div class="compass"><span>NW</span><i></i><strong>N</strong><i></i><span>NE</span></div>
      <aside class="objective"><span class="eyebrow">FIELD NOTES <b>01 / 03</b></span><h2>Follow the sign.</h2><p>Fresh hoofprints lead north, along the trail.</p></aside>
      <div class="reticle"><i></i><b></b></div>
      <div class="animal-status"><span class="status-dot"></span><span class="animal-text">FOREST IS QUIET</span><div class="alert-track"><i></i></div></div>
      <div class="toast" role="status"></div>
      <div class="draw-feedback"><span>DRAW STRENGTH</span><div><i></i></div><small>Hold steady. Release when full.</small></div>
      <footer class="field-footer"><div class="pace"><i>◌</i><span>WALKING<small>HOLD SHIFT TO MOVE QUIETLY</small></span></div><div class="controls"><kbd>W A S D</kbd> move <em>·</em> mouse look <em>·</em> <kbd>RMB</kbd> aim <em>·</em> hold <kbd>LMB</kbd> draw & release <em>·</em> <kbd>ESC</kbd> pause</div><div class="quiver"><span>↟ ↟ ↟</span><small>03 ARROWS</small></div></footer>
      <div class="screen"><div class="screen-copy"></div><div class="edition">A QUIET PURSUIT <span>46° 52′ N &nbsp; 121° 45′ W</span></div></div>`;
    this.$ = (s) => this.mount.querySelector(s);
    this.reset();
    this.showScreen();
  }
  reset() {
    this.arrow?.removeFromParent();
    this.arrow?.geometry.dispose();
    this.arrow?.material.dispose();
    this.arrow = null;
    this.arrowFlight = null;
    this.state = newHunt();
    this.time = 0;
    this.draw = 0;
    this.drawing = false;
    this.lastPhase = '';
    this.deer.group.position.set(
      DEER.x,
      this.context.groundHeight(DEER.x, DEER.z),
      DEER.z,
    );
    this.deer.group.rotation.set(0, 0.12, 0);
    this.deer.animate({ time: 0, speed: 0, alert: 0, down: false, dt: 2 });
    this.walker.reset(SPAWN.x, SPAWN.z);
    this.walker.enabled = false;
    this.context.camera.fov = 58;
    this.context.camera.updateProjectionMatrix();
    this.context.renderer.shadowMap.needsUpdate = true;
  }
  showScreen() {
    const intro = this.mode === 'intro',
      paused = this.mode === 'paused',
      won = this.state.phase === 'won';
    this.mount.dataset.mode = this.mode;
    const content = intro
      ? `<span class="eyebrow">A WOODLAND FIELD JOURNAL &nbsp; / &nbsp; NO. 01</span><h1>Pinewatch<br/><em>Hunt.</em></h1><p class="lede">The forest gives you a sign.<br/>The rest is patience.</p><div class="instructions"><p><b>01</b><span><strong>Read the trail</strong>Follow fresh hoofprints to the northern clearing.</span></p><p><b>02</b><span><strong>Make your approach</strong>Hold Shift to move quietly. Watch the deer's alertness.</span></p><p><b>03</b><span><strong>Take a clear shot</strong>Hold right mouse to aim. Hold left mouse to draw;<br/>release when full. Walk to the deer and press E.</span></p></div><button id="begin">Enter the forest <span>↗</span></button><p class="small-print">A SHORT FOREST HUNT &nbsp; · &nbsp; KEYBOARD + MOUSE<br/>Keyboard alternative: arrows look · Q aim · Space draw/release</p>`
      : paused
        ? `<span class="eyebrow">TAKE A BREATH</span><h1>The forest<br/><em>can wait.</em></h1><p class="lede">Your hunt is paused.</p><div class="pause-controls">WASD walk · Shift quiet approach<br/>Mouse or arrow keys look<br/>Hold RMB or Q to aim<br/>Hold LMB or Space to draw, release to shoot<br/>E retrieve · Esc or P pause</div><label class="quality-label">RENDER QUALITY <select id="quality"><option value="balanced">Balanced</option><option value="high">High</option><option value="ultra">Ultra</option></select></label><button id="resume">Return to the trail <span>↗</span></button><button class="secondary" id="restart">Start a fresh hunt</button>`
        : `<span class="eyebrow">FIELD JOURNAL &nbsp; / &nbsp; ${won ? 'HUNT COMPLETE' : 'TRAIL LOST'}</span><h1>${won ? 'A moment<br/><em>earned.</em>' : 'Another<br/><em>morning.</em>'}</h1><p class="lede">${won ? 'A quiet approach. A clean shot.<br/>Your hunt is complete.' : this.state.message}</p><div class="result-stats"><div><strong>${this.formatTime()}</strong><span>IN THE FOREST</span></div><div><strong>${this.state.shots}</strong><span>ARROWS LOOSED</span></div>${won ? `<div><strong>${Math.round(this.state.hitRange)} m</strong><span>SHOT DISTANCE</span></div>` : ''}</div><p class="result-note">${won ? 'Follow the trail again. There is always a quieter approach.' : 'Move quietly inside 23 m. If the deer becomes alert, stop and let it settle.'}</p><button id="restart">Follow a fresh trail <span>↗</span></button>`;
    this.$('.screen-copy').innerHTML = content;
    this.$('#begin')?.addEventListener('click', () => this.begin());
    this.$('#resume')?.addEventListener('click', () => this.begin(false));
    this.$('#restart')?.addEventListener('click', () => this.begin(true));
    const quality = this.$('#quality');
    if (quality) {
      quality.value = this.app.settings.quality;
      quality.addEventListener('change', () =>
        this.app.setSettings({ quality: quality.value }),
      );
    }
  }
  begin(fresh = true) {
    if (fresh) this.reset();
    this.mode = 'playing';
    this.mount.dataset.mode = 'playing';
    this.walker.enabled = true;
    this.walker.lock();
  }
  pause() {
    if (this.mode !== 'playing') return;
    this.mode = 'paused';
    this.walker.enabled = false;
    this.walker.resetMotion();
    this.draw = 0;
    this.drawing = false;
    this.showScreen();
    if (document.pointerLockElement) document.exitPointerLock();
  }
  startDraw() {
    if (
      this.mode === 'playing' &&
      this.state.phase === 'stalk' &&
      this.walker.aiming
    )
      this.drawing = true;
  }
  release() {
    if (this.mode !== 'playing' || !this.drawing) return;
    this.drawing = false;
    const camera = this.context.camera;
    camera.updateMatrixWorld();
    this.deer.group.updateMatrixWorld(true);
    this.ray.setFromCamera(new THREE.Vector2(0, 0), camera);
    const hits = this.ray.intersectObjects(this.deer.hitMeshes, false);
    const range = camera.position.distanceTo(this.deer.group.position);
    let hit = hits.length > 0;
    if (hit) {
      // Actual rendered terrain, timber and boulders can obstruct the arrow.
      const blockers = this.ray.intersectObjects(this.shotBlockers, false);
      hit = !blockers.some((b) => b.distance < hits[0].distance - 0.05);
      // Terrain belongs to the forest group and is included above.
    }
    const released = shoot(this.state, {
      draw: this.draw,
      aiming: this.walker.aiming,
      hit,
      range,
    });
    if (released)
      this.spawnArrow(hits[0]?.point, hit && this.state.phase === 'retrieve');
    this.draw = 0;
    this.checkEnd();
  }
  spawnArrow(target, hit) {
    this.arrow?.removeFromParent();
    this.arrow?.geometry.dispose();
    this.arrow?.material.dispose();
    const camera = this.context.camera,
      direction = new THREE.Vector3();
    camera.getWorldDirection(direction);
    const start = camera.position.clone().addScaledVector(direction, 0.5);
    this.arrow = new THREE.Mesh(
      new THREE.CylinderGeometry(0.008, 0.008, 0.8, 6),
      new THREE.MeshStandardMaterial({ color: '#d5b87a' }),
    );
    this.arrow.position.copy(start);
    this.arrow.quaternion.setFromUnitVectors(
      new THREE.Vector3(0, 1, 0),
      direction,
    );
    this.context.scene.add(this.arrow);
    this.arrowFlight = {
      start,
      end: hit ? target.clone() : start.clone().addScaledVector(direction, 24),
      t: 0,
    };
  }
  take() {
    if (this.mode === 'playing' && retrieve(this.state, this.distance()))
      this.checkEnd();
  }
  distance() {
    return Math.hypot(
      this.context.camera.position.x - this.deer.group.position.x,
      this.context.camera.position.z - this.deer.group.position.z,
    );
  }
  checkEnd() {
    if (['won', 'lost'].includes(this.state.phase)) {
      this.mode = 'result';
      this.walker.enabled = false;
      this.walker.resetMotion();
      this.drawing = false;
      this.draw = 0;
      this.showScreen();
      if (document.pointerLockElement) document.exitPointerLock();
    }
  }
  formatTime() {
    const time = Math.floor(this.state.elapsed);
    return `${Math.floor(time / 60)}:${String(time % 60).padStart(2, '0')}`;
  }
  update(dt) {
    const playing = this.mode === 'playing';
    const distance = this.distance();
    if (playing) {
      this.time += dt;
      this.visualTime += dt;
      const visible = clearSight(
        this.context.camera.position,
        this.deer.group.position,
        this.colliders,
      );
      stepHunt(this.state, dt, {
        distance,
        moving: this.walker.moving,
        quiet: this.walker.quiet,
        visible,
      });
      if (this.drawing) {
        if (!this.walker.aiming) {
          this.drawing = false;
          this.draw = 0;
        } else this.draw = Math.min(1, this.draw + dt / 1.15);
      }
      if (this.state.animal === 'fleeing') {
        this.deer.group.position.z -= dt * 6;
        this.deer.group.rotation.y = Math.PI / 2;
        this.deer.group.position.y = this.context.groundHeight(
          this.deer.group.position.x,
          this.deer.group.position.z,
        );
      }
      // Small grazing steps stay on the authored clear trail; the animal never teleports.
      else if (this.state.animal === 'grazing') {
        const x = DEER.x + Math.sin(this.time * 0.12) * 0.75;
        this.deer.group.position.x = x;
        this.deer.group.position.y = this.context.groundHeight(
          x,
          this.deer.group.position.z,
        );
      }
      this.checkEnd();
    }
    this.deer.animate({
      time: this.visualTime,
      speed:
        this.state.animal === 'fleeing'
          ? 6
          : playing && this.state.animal === 'grazing'
            ? 0.09
            : 0,
      alert: this.state.alert,
      down: this.state.animal === 'down',
      dt: playing ? dt : 0,
    });
    this.bow.group.visible = this.mode === 'playing';
    this.bow.update({
      draw: this.draw,
      aiming: this.walker.aiming,
      time: this.visualTime,
      moving: playing && this.walker.moving,
    });
    if (this.arrowFlight && playing) {
      this.arrowFlight.t = Math.min(1, this.arrowFlight.t + dt * 4);
      this.arrow.position.lerpVectors(
        this.arrowFlight.start,
        this.arrowFlight.end,
        this.arrowFlight.t,
      );
      if (this.arrowFlight.t >= 1) this.arrowFlight = null;
    }
    if (playing && Math.floor(this.time * 8) !== this.shadowTick) {
      this.context.renderer.shadowMap.needsUpdate = true;
      this.shadowTick = Math.floor(this.time * 8);
    }
    this.updateHud(distance);
  }
  updateHud(distance) {
    const s = this.state,
      aim = this.walker.aiming,
      retrieving = s.phase === 'retrieve';
    this.mount.classList.toggle('aiming', aim);
    this.mount.classList.toggle('drawing', this.drawing);
    this.mount.classList.toggle('retrieving', retrieving);
    const close = distance < 27;
    this.$('.objective .eyebrow').innerHTML =
      `FIELD NOTES <b>${retrieving ? '03' : close ? '02' : '01'} / 03</b>`;
    this.$('.objective h2').textContent = retrieving
      ? 'Finish the hunt.'
      : close
        ? 'Slow your approach.'
        : 'Follow the sign.';
    this.$('.objective p').textContent = retrieving
      ? 'Walk to the deer. Press E within 3 m to retrieve.'
      : close
        ? 'Hold Shift. Aim at the body. Draw fully, then release.'
        : 'Fresh hoofprints lead north, along the trail.';
    this.$('.animal-text').textContent = retrieving
      ? `RETRIEVE · ${Math.ceil(distance)} m`
      : s.animal === 'fleeing'
        ? 'DEER FLEEING'
        : s.animal === 'alert'
          ? 'DEER ALERT · STAY STILL'
          : close
            ? `DEER CALM · ${Math.ceil(distance)} m`
            : 'FOREST IS QUIET';
    this.$('.animal-status').dataset.alert = s.animal;
    this.$('.alert-track i').style.width = `${s.alert * 100}%`;
    this.$('.draw-feedback i').style.width = `${this.draw * 100}%`;
    this.$('.draw-feedback small').textContent =
      this.draw >= 0.98
        ? 'Full draw. Release to loose.'
        : 'Hold steady. Release when full.';
    this.$('.pace span').innerHTML =
      `${this.walker.quiet ? 'QUIET APPROACH' : 'WALKING'}<small>${this.walker.quiet ? 'SOFT STEPS · STAY PATIENT' : 'HOLD SHIFT TO MOVE QUIETLY'}</small>`;
    this.$('.quiver span').textContent = Array.from(
      { length: s.arrows },
      () => '↟',
    ).join(' ');
    this.$('.quiver small').textContent = `0${s.arrows} ARROWS`;
    this.$('.toast').textContent =
      retrieving && distance < 3
        ? 'Press E to retrieve the deer'
        : s.messageTime > 0
          ? s.message
          : aim
            ? 'Hold left mouse or Space to draw. Release to shoot.'
            : '';
    const bearing =
      ((Math.round((-this.walker.yaw * 180) / Math.PI) % 360) + 360) % 360;
    this.$('.compass strong').textContent =
      bearing < 15 || bearing > 345 ? 'N' : `${bearing}°`;
  }
  snapshot() {
    const p = this.deer.group.position;
    const target = new THREE.Vector3(p.x, p.y + 1.05, p.z);
    const screen = target.clone().project(this.context.camera);
    return {
      mode: this.mode,
      ...this.state,
      draw: this.draw,
      drawing: this.drawing,
      aiming: this.walker.aiming,
      quiet: this.walker.quiet,
      moving: this.walker.moving,
      yaw: this.walker.yaw,
      pitch: this.walker.pitch,
      player: this.context.camera.position.toArray(),
      deer: p.toArray(),
      target: target.toArray(),
      targetScreen: [
        ((screen.x + 1) / 2) * innerWidth,
        ((1 - screen.y) / 2) * innerHeight,
      ],
      distance: this.distance(),
      colliders: this.colliders,
    };
  }
  dispose() {
    this.mount.remove();
    this.signs.dispose();
    this.deer.dispose();
    this.bow.dispose();
    this.arrow?.removeFromParent();
    this.arrow?.geometry.dispose();
    this.arrow?.material.dispose();
  }
}
