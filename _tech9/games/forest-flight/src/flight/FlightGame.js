import { Euler, Vector3 } from 'three';
import { FlightSimulation, AIRCRAFT } from './FlightSimulation.js';
import { FlightInput } from './FlightInput.js';
import { FlightAudio } from './FlightAudio.js';
import { AircraftVisual } from './AircraftVisual.js';
import { groundHeight, getObstacle, LANDMARKS, BOUNDS } from './FlightWorld.js';
import { FollowCamera } from '../modules/follow-camera/src/FollowCamera.js';

const $ = (id) => document.getElementById(id);
export class FlightGame {
  constructor(app) {
    this.app = app;
    this.sim = new FlightSimulation({
      groundHeight,
      obstacle: getObstacle,
      bounds: BOUNDS,
      landmarks: LANDMARKS,
    });
    this.audio = new FlightAudio();
    this.visual = new AircraftVisual('trainer');
    app.scene.add(this.visual.group);
    this.rotation = new Euler(0, 0, 0, 'YXZ');
    this.view = new FollowCamera(app.camera, {
      getTarget: () => this.sim.state,
      groundHeight,
      follow: {
        distance: 18,
        height: 5.5,
        lookAhead: 11,
        targetHeight: 1,
        damping: 4,
        fov: 62,
      },
      mounted: { getPose: () => this.cockpitPose(), near: 0.04, fov: 76 },
    });
    this.input = new FlightInput({
      onAction: (key) => this.action(key),
      onBlur: () => this.pause(true),
    });
    this.abort = new AbortController();
    const on = (id, fn) =>
      $(id).addEventListener(
        'click',
        () => {
          fn();
          $(id).blur();
        },
        { signal: this.abort.signal },
      );
    on('start', () => this.start());
    on('resume', () => this.pause(false));
    on('retry', () => this.reset(true));
    on('again', () => this.reset(true));
    on('hangar', () => this.reset(false));
    on('pause', () => this.pause(true));
    on('camera', () => this.toggleCamera());
    on('mute', () => this.mute());
    for (const type of Object.keys(AIRCRAFT))
      on(`choose-${type}`, () => this.select(type));
    $('quality').addEventListener(
      'change',
      (event) => {
        app.setSettings({ quality: event.target.value });
        $('quality').blur();
      },
      { signal: this.abort.signal },
    );
    $('quality').value = app.settings.quality;
    this.frameTimes = [];
    this.lastFrame = performance.now();
    this.update(0);
  }
  select(type) {
    if (this.sim.state.phase !== 'ready') return;
    this.visual.dispose();
    this.app.scene.remove(this.visual.group);
    this.visual = new AircraftVisual(type);
    this.app.scene.add(this.visual.group);
    this.sim.reset(type);
    this.view.setMode('follow');
    $('camera').textContent = 'C · Cockpit';
    this.view.resetMotion();
    for (const id of Object.keys(AIRCRAFT)) {
      $(`choose-${id}`).classList.toggle('selected', id === type);
      $(`choose-${id}`).setAttribute('aria-pressed', String(id === type));
    }
  }
  start() {
    this.sim.start();
    this.input.reset();
    this.audio.start();
    this.view.resetMotion();
  }
  reset(fly) {
    this.sim.reset();
    this.input.reset();
    this.view.setMode('follow');
    this.visual.setCockpitMode?.(false);
    $('camera').textContent = 'C · Cockpit';
    this.view.resetMotion();
    if (fly) this.start();
  }
  pause(value) {
    if (['ready', 'crashed', 'landed'].includes(this.sim.state.phase)) return;
    this.sim.paused = value;
    this.input.reset();
    this.audio.update(this.sim.state, value);
    if (!value) this.audio.start();
  }
  action(key) {
    if (key === 'KeyP' || key === 'Escape') this.pause(!this.sim.paused);
    if (key === 'KeyR') this.reset(true);
    if (key === 'KeyC') this.toggleCamera();
    if (key === 'KeyM') this.mute();
  }
  toggleCamera() {
    const mounted = this.view.mode === 'follow';
    this.view.setMode(mounted ? 'mounted' : 'follow');
    this.visual.setCockpitMode?.(mounted);
    $('camera').textContent = mounted ? 'C · Chase' : 'C · Cockpit';
  }
  mute() {
    this.audio.muted = !this.audio.muted;
    $('mute').textContent = this.audio.muted ? 'M · Sound off' : 'M · Sound on';
  }
  cockpitPose() {
    const q = this.visual.group.quaternion,
      p = this.visual.group.position;
    return {
      position: new Vector3(0, 0.62, -0.55).applyQuaternion(q).add(p).toArray(),
      target: new Vector3(0, 0.62, -100).applyQuaternion(q).add(p).toArray(),
      up: new Vector3(0, 1, 0).applyQuaternion(q).toArray(),
    };
  }
  resetMotion() {
    this.input?.reset();
    this.view?.resetMotion();
  }
  update(dt) {
    if (this.disposed) return;
    const now = performance.now();
    if (!document.hidden && dt > 0) {
      this.frameTimes.push(now - this.lastFrame);
      if (this.frameTimes.length > 600) this.frameTimes.shift();
    }
    this.lastFrame = now;
    this.sim.update(dt, this.input.sample());
    const s = this.sim.state;
    this.visual.group.position.set(s.x, s.y, s.z);
    this.visual.group.quaternion.setFromEuler(
      this.rotation.set(s.pitch, -s.heading, -s.roll, 'YXZ'),
    );
    this.visual.update(s, this.sim.paused ? 0 : dt);
    if (s.phase === 'ready' && this.view.mode === 'follow') {
      this.app.camera.position.set(-14, 7, 354);
      this.app.camera.up.set(0, 1, 0);
      this.app.camera.lookAt(0, 1.8, 337);
      this.app.camera.updateMatrixWorld();
    } else this.view.update(dt);
    // The aircraft and windsock move; nearby shadow maps track those objects.
    this.app.renderer.shadowMap.needsUpdate = true;
    this.audio.update(s, this.sim.paused);
    this.renderHud();
  }
  renderHud() {
    const s = this.sim.state,
      spec = this.sim.spec;
    document.body.classList.toggle('cockpit', this.view.mode === 'mounted');
    document.body.classList.toggle('preflight', s.phase === 'ready');
    const altitude = Math.max(0, s.y - groundHeight(s.x, s.z) - spec.gear);
    $('welcome').hidden = s.phase !== 'ready';
    $('paused').hidden = !this.sim.paused;
    $('result').hidden = !['crashed', 'landed'].includes(s.phase);
    $('result-kicker').textContent =
      s.phase === 'landed' ? 'BACK AT THE AIRFIELD' : 'FLIGHT ENDED';
    $('result-title').textContent =
      s.phase === 'landed' ? 'A good day to fly.' : 'Let’s try that again.';
    $('result-description').textContent =
      s.phase === 'landed'
        ? `${Math.round(s.airborneTime)} seconds aloft · ${s.visited.length} of ${LANDMARKS.length} scenic markers · touchdown ${s.landingSink?.toFixed(1)} m/s. Fly another circuit or explore freely.`
        : s.reason;
    $('speed').textContent = Math.round(s.speed * 1.94384);
    $('altitude').textContent = Math.round(altitude);
    $('throttle').textContent = `${Math.round(s.throttle * 100)}%`;
    $('throttle-fill').style.height = `${s.throttle * 100}%`;
    $('heading').textContent =
      `${String(Math.round(((((s.heading * 180) / Math.PI) % 360) + 360) % 360)).padStart(3, '0')}°`;
    $('climb').textContent =
      `${s.verticalSpeed >= 0 ? '+' : ''}${s.verticalSpeed.toFixed(1)}`;
    $('aircraft-name').textContent = spec.name;
    $('phase').textContent = this.sim.paused
      ? 'PAUSED'
      : {
          ready: 'PREFLIGHT',
          taxi: s.speed < 8 ? 'TAXI / READY' : 'TAKEOFF ROLL',
          flight:
            altitude < 30 && s.verticalSpeed < -0.5 ? 'APPROACH' : 'IN FLIGHT',
          rollout: 'LANDING ROLL',
          landed: 'PARKED',
          crashed: 'RECOVERY',
        }[s.phase];
    $('markers').textContent = `${s.visited.length} / ${LANDMARKS.length}`;
    $('attitude-sky').style.transform =
      `rotate(${(-s.roll * 180) / Math.PI}deg) translateY(${s.pitch * 80}px)`;
    $('map-plane').setAttribute(
      'transform',
      `translate(${80 + s.x / 30} ${80 + s.z / 30}) rotate(${(s.heading * 180) / Math.PI})`,
    );
    for (const marker of LANDMARKS)
      document
        .querySelector(`[data-marker="${marker.id}"]`)
        ?.classList.toggle('visited', s.visited.includes(marker.id));
    let tip = 'Hold W for throttle · At flying speed, gently pull ↓';
    if (s.phase === 'flight')
      tip =
        '← → bank to turn · Space steadies the wings · Scenic markers are optional';
    if (s.phase === 'flight' && altitude < 35 && s.verticalSpeed < -0.5)
      tip =
        'Landing: align with runway · S reduces power · Gently pull ↓ to flare';
    if (s.phase === 'rollout')
      tip = 'Welcome back. Hold S to idle and B to brake to a stop.';
    if (s.phase === 'taxi' && s.speed > spec.rotate * 0.9)
      tip = 'Flying speed reached · Pull ↓ gently to lift off';
    const warning = s.stall
      ? 'LOW AIRSPEED · Lower the nose ↑ and add power W'
      : Math.max(Math.abs(s.x), Math.abs(s.z)) > 1950
        ? 'VALLEY EDGE · Turn back toward the airfield'
        : s.y > 650
          ? 'FLIGHT CEILING · Ease the nose down'
          : '';
    $('tip').textContent = warning || tip;
    $('tip').classList.toggle('warning', !!warning);
    $('fps').textContent = `${this.app.metrics.fps || '—'} fps`;
  }
  snapshot() {
    return {
      ...this.sim.snapshot(),
      cameraMode: this.view.mode,
      heldKeys: [...this.input.keys],
      app: this.app.snapshot(),
      frameTimes: [...this.frameTimes],
    };
  }
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.abort.abort();
    this.input.dispose();
    this.view.dispose();
    this.audio.dispose();
    this.app.scene.remove(this.visual.group);
    this.visual.dispose();
  }
}
