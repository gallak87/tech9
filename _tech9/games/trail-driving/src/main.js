import './style.css';
import { SceneApp } from './core/SceneApp.js';
import { forestDefinition } from './world/forestDefinition.js';
import { ROUTES, bounds, height, surface, colliders } from './park/parkData.js';
import { createParkWorld } from './park/ParkWorld.js';
import { VehicleMotion, VEHICLES } from './driving/VehicleMotion.js';
import { VehicleInput } from './driving/VehicleInput.js';
import { createVehicleModel } from './vehicles/VehicleModel.js';
import { DrivingFeedback } from './vehicles/DrivingFeedback.js';
import { DrivingCamera } from './game/DrivingCamera.js';
import { createVehicleLighting } from './game/VehicleLighting.js';
import { TrialRules, loadRecords, saveResult } from './game/TrialRules.js';
import { GameUI } from './game/GameUI.js';

const storage = () => {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
};
const world = { height, surface, colliders, bounds };
const garageSpawn = { x: 0, z: 238, heading: Math.PI * 0.08 };
const definition = {
  ...forestDefinition,
  id: 'trail-driving',
  title: 'Trail Driving Park',
  bounds,
  groundHeight: height,
  createWorld: createParkWorld,
  getColliders: () => colliders,
  views: {
    garage: {
      position: [9, height(0, 246) + 5, 237],
      target: [0, height(0, 246) + 1, 246],
    },
  },
  initialView: 'garage',
  environment: {
    ...forestDefinition.environment,
    exposure: 1.0,
    fog: { color: '#b5c7bf', density: 0.0027 },
    hemisphere: { sky: '#c6dcec', ground: '#697263', intensity: 2.3 },
    sun: {
      color: '#ffe6bd',
      intensity: 3.5,
      position: [65, 90, -50],
      shadowBounds: {
        left: -65,
        right: 65,
        top: 65,
        bottom: -65,
        near: 1,
        far: 250,
      },
    },
    sky: {
      turbidity: 5,
      rayleigh: 1.0,
      mieCoefficient: 0.004,
      mieDirectionalG: 0.82,
    },
  },
};
class TrailGame {
  constructor(app, park) {
    this.app = app;
    this.park = park;
    this.vehicles = VEHICLES;
    this.routes = ROUTES;
    this.route = ROUTES[0];
    this.vehicle = 'jeep';
    this.state = 'garage';
    this.mode = 'trial';
    this.records = loadRecords(storage());
    this.volume = 0.45;
    try {
      const volume = Number(
        localStorage.getItem('trail-driving.volume') ?? '.45',
      );
      if (Number.isFinite(volume))
        this.volume = Math.max(0, Math.min(1, volume));
    } catch {
      /* Session-only settings. */
    }
    this.feedback = new DrivingFeedback({
      scene: app.scene,
      camera: app.camera,
    });
    this.feedback.setVolume(this.volume);
    this.vehicleLighting = createVehicleLighting(app.renderer);
    this.setVehicle('jeep');
    this.rules = new TrialRules(this.route, this.vehicle);
    this.input = new VehicleInput({
      onAction: (a) => this.keyAction(a),
      onPause: () => this.pause(),
    });
    this.input.setEnabled(false);
    this.camera = new DrivingCamera(app.camera, {
      getTarget: () => this.motion.snapshot(),
      getModel: () => this.model,
      world,
    });
    this.ui = new GameUI(document.querySelector('#interface'), this);
    this.park.setRoute(this.route.id, 0);
    this.uiTick = 0;
    this.frameTimes = [];
  }
  setVehicle(id) {
    if (!VEHICLES[id]) return;
    this.model?.dispose();
    if (this.model) this.app.scene.remove(this.model.group);
    this.vehicle = id;
    this.motion = new VehicleMotion({ vehicle: id, world, spawn: garageSpawn });
    this.model = createVehicleModel(id);
    this.vehicleLighting.apply(this.model.group);
    this.app.scene.add(this.model.group);
    this.model.update(this.motion.snapshot(), 0);
    if (this.camera) {
      this.camera.dispose();
      this.camera = new DrivingCamera(this.app.camera, {
        getTarget: () => this.motion.snapshot(),
        getModel: () => this.model,
        world,
        vehicle: id,
      });
    }
  }
  start(mode = this.mode) {
    this.mode = mode;
    this.rules = new TrialRules(this.route, this.vehicle);
    this.motion.reset(this.route.spawn);
    this.model.update(this.motion.snapshot(), 0);
    this.model.setDriverView(this.camera.follow.mode === 'mounted');
    this.camera.resetMotion();
    this.state = 'driving';
    this.input.clear();
    this.input.setEnabled(true);
    this.feedback.start();
    this.park.setRoute(this.route.id, mode === 'trial' ? 0 : -1);
    this.notice =
      'W / ↑ accelerate · Brake before turns · Follow the colored gates';
    this.noticeUntil = performance.now() + 7000;
    this.ui.render();
    this.app.canvas.focus();
  }
  pause() {
    if (this.state !== 'driving') return;
    this.state = 'paused';
    this.input.setEnabled(false);
    this.feedback.update({ ...this.motion.snapshot(), active: false }, 0);
    this.ui.render();
  }
  resume() {
    if (this.state !== 'paused') return;
    this.state = 'driving';
    this.input.clear();
    this.input.setEnabled(true);
    this.ui.render();
    this.app.canvas.focus();
    this.feedback.start();
  }
  garage() {
    this.state = 'garage';
    this.input.setEnabled(false);
    this.motion.reset(garageSpawn);
    this.model.update(this.motion.snapshot(), 0);
    this.camera.setMode('follow');
    this.park.setRoute(this.route.id, -1);
    this.ui.resetArmed = false;
    this.ui.render();
  }
  keyAction(a) {
    const action =
      {
        KeyC: 'camera',
        KeyR: 'recover',
        KeyT: 'restart',
        Escape: 'pause',
        KeyP: 'pause',
      }[a] || a;
    this.action(action);
  }
  action(action, value) {
    if (action === 'pause') {
      if (this.state === 'paused') this.resume();
      else this.pause();
      return;
    }
    if (action === 'resume') {
      this.resume();
      return;
    }
    if (action === 'garage') {
      this.garage();
      return;
    }
    if (action === 'settings' && this.state === 'garage') {
      this.state = 'settings';
      this.ui.render();
      return;
    }
    if (action === 'vehicle' && this.state === 'garage') {
      this.setVehicle(value);
      this.ui.render();
      return;
    }
    if (action === 'route' && this.state === 'garage') {
      this.route = ROUTES.find((r) => r.id === value) || this.route;
      this.park.setRoute(this.route.id, -1);
      this.ui.render();
      return;
    }
    if (action === 'start' && this.state === 'garage') {
      this.start('trial');
      return;
    }
    if (action === 'free' && this.state === 'garage') {
      this.start('free');
      return;
    }
    if (
      action === 'restart' &&
      ['driving', 'paused', 'results'].includes(this.state)
    ) {
      this.start();
      return;
    }
    if (action === 'nextVehicle' && this.state === 'results') {
      this.setVehicle(
        Object.keys(VEHICLES)[
          (Object.keys(VEHICLES).indexOf(this.vehicle) + 1) % 3
        ],
      );
      this.garage();
      return;
    }
    if (action === 'camera' && this.state === 'driving') {
      this.camera.toggle();
      this.notice =
        this.camera.follow.mode === 'follow' ? 'CHASE CAMERA' : 'DRIVER VIEW';
      this.noticeUntil = performance.now() + 2200;
      return;
    }
    if (action === 'recover' && this.state === 'driving') {
      this.motion.recover();
      this.input.clear();
      this.camera.resetMotion();
      if (this.mode === 'trial') this.rules.recover();
      this.notice =
        this.mode === 'trial'
          ? 'GROUNDED RECOVERY · +5 SECOND PENALTY'
          : 'GROUNDED RECOVERY';
      this.noticeUntil = performance.now() + 4000;
      return;
    }
    if (action === 'mute') {
      this.setting('volume', this.volume === 0 ? 0.45 : 0);
      this.ui.render();
      return;
    }
    if (action === 'resetRecords' && this.state === 'settings') {
      if (!this.ui.resetArmed) {
        this.ui.resetArmed = true;
        this.ui.render();
      } else {
        this.records = {};
        try {
          localStorage.removeItem('trail-driving.records.v1');
        } catch {
          /* Already cleared in memory. */
        }
        this.ui.resetArmed = false;
        this.ui.render();
      }
    }
  }
  setting(key, value) {
    if (key === 'quality') this.app.setSettings({ quality: value });
    if (key === 'volume') {
      this.volume = Number(value);
      this.feedback.setVolume(this.volume);
      try {
        localStorage.setItem('trail-driving.volume', String(this.volume));
      } catch {
        /* Session setting remains usable. */
      }
    }
  }
  update(dt) {
    const before = this.motion.snapshot();
    if (this.state === 'driving') {
      this.motion.update(dt, this.input.sample());
      const after = this.motion.snapshot();
      if (this.mode === 'trial') {
        if (this.rules.update(dt, before, after)) {
          this.park.setRoute(this.route.id, this.rules.nextGate);
          this.notice = `GATE ${this.rules.nextGate} CLEARED`;
          this.noticeUntil = performance.now() + 1400;
        }
        if (this.rules.finished) {
          this.result = {
            ...this.rules.result(),
            ...saveResult(
              this.records,
              this.vehicle,
              this.route.id,
              this.rules.result(),
              storage(),
            ),
          };
          this.state = 'results';
          this.input.setEnabled(false);
          this.ui.render();
        }
      }
    }
    const s = this.motion.snapshot();
    this.model.update(s, dt);
    this.feedback.update(
      {
        ...s,
        vehicle: this.vehicle,
        active: this.state === 'driving',
        speed: this.state === 'driving' ? s.speed : 0,
        airborne: this.state === 'driving' && s.airborne,
      },
      dt,
    );
    if (['garage', 'settings', 'results'].includes(this.state)) {
      this.model.setDriverView(false);
      const x = s.x,
        y = s.y,
        z = s.z;
      const scale =
        this.vehicle === 'jeep' ? 1 : this.vehicle === 'atv' ? 0.76 : 0.69;
      const narrow = this.app.canvas.clientWidth < 521;
      this.app.camera.position.set(
        x + 5.0 * scale,
        y + 2.65 * scale,
        z - 5.8 * scale,
      );
      this.app.camera.lookAt(
        x + (narrow ? 0 : 1.55 * scale),
        y + 1,
        z + (narrow ? 0 : 1.4 * scale),
      );
      this.app.camera.updateMatrixWorld();
    } else this.camera.update(dt);
    this.app.sun.position.set(s.x + 65, s.y + 90, s.z - 50);
    this.app.sun.target.position.set(s.x, s.y, s.z);
    this.app.sun.target.updateMatrixWorld();
    this.app.renderer.shadowMap.needsUpdate = true;
    this.uiTick += dt;
    if (this.uiTick > 0.08) {
      this.ui.update(s);
      this.uiTick = 0;
    }
  }
  snapshot() {
    return {
      ...this.app.snapshot(),
      state: this.state,
      mode: this.mode,
      vehicle: this.vehicle,
      route: this.route.id,
      motion: this.motion.snapshot(),
      trial: this.rules.snapshot(),
      result: this.result,
      records: structuredClone(this.records),
      cameraMode: this.camera.follow.mode,
      input: this.input.sample(),
      audio: {
        engine: this.feedback.engineGain?.gain.value ?? 0,
        tire: this.feedback.tireGain?.gain.value ?? 0,
        state: this.feedback.context?.state ?? 'locked',
      },
    };
  }
  dispose() {
    this.input.dispose();
    this.camera.dispose();
    this.feedback.dispose();
    this.model.dispose();
    this.app.scene.remove(this.model.group);
    this.vehicleLighting.dispose();
    this.ui.dispose();
  }
}
let app, game;
try {
  const testMode = new URLSearchParams(location.search).get('test') === '1';
  app = new SceneApp(document.querySelector('#scene'), {
    definition,
    testMode,
    ui: document.querySelector('#world-hud'),
  });
  app.camera.far = 1200;
  app.camera.updateProjectionMatrix();
  let hasSettings = false;
  try {
    hasSettings = Boolean(storage()?.getItem('trail-driving.settings'));
  } catch {
    /* Denied storage uses defaults. */
  }
  if (testMode || !hasSettings) app.setSettings({ quality: 'balanced' }, false);
  const park = createParkWorld();
  await app.register(park);
  game = new TrailGame(app, park);
  let inspection = null;
  let inspectionFov = null;
  app.setController({
    update: (dt) => {
      game.update(dt);
      if (testMode && inspection) {
        const s = game.motion.snapshot();
        const transform = ([x, y, z]) => [
          s.x + Math.cos(s.heading) * x - Math.sin(s.heading) * z,
          s.y + y,
          s.z + Math.sin(s.heading) * x + Math.cos(s.heading) * z,
        ];
        app.camera.position.set(...transform(inspection.position));
        app.camera.up.set(0, 1, 0);
        app.camera.lookAt(...transform(inspection.target));
        app.camera.fov = inspection.fov;
        app.camera.updateProjectionMatrix();
        app.camera.updateMatrixWorld();
      }
    },
    resetMotion: () => game?.input.clear(),
    dispose() {},
  });
  if (testMode)
    window.__SCENE_TEST__ = {
      get ready() {
        return app.ready;
      },
      snapshot: () => game.snapshot(),
      routes: () => ROUTES,
      world: () => ({ bounds, colliders }),
      height: (x, z) => height(x, z),
      setSettings: (p) => app.setSettings(p, false),
      inspectionCamera: (pose) => {
        if (pose === null) {
          inspection = null;
          if (inspectionFov !== null) app.camera.fov = inspectionFov;
          inspectionFov = null;
          app.camera.updateProjectionMatrix();
          game.camera.resetMotion();
          return;
        }
        const vector = (v) =>
          Array.isArray(v) && v.length === 3 && v.every(Number.isFinite);
        if (
          !vector(pose?.position) ||
          !vector(pose?.target) ||
          !Number.isFinite(pose.fov) ||
          pose.fov < 20 ||
          pose.fov > 100
        )
          throw new TypeError(
            'Inspection camera requires finite vectors and fov20–100.',
          );
        inspectionFov ??= app.camera.fov;
        inspection = {
          position: [...pose.position],
          target: [...pose.target],
          fov: pose.fov,
        };
      },
      arrange: (pose) => {
        game.motion.reset(pose);
        game.model.update(game.motion.snapshot(), 0);
        game.camera.resetMotion();
      },
    };
  app.start();
  document.querySelector('#loading').classList.add('loaded');
} catch (error) {
  console.error(error);
  document.querySelector('#loading').innerHTML =
    `<div class="load-error">The park could not load. ${error.message}</div>`;
}
if (import.meta.hot)
  import.meta.hot.dispose(() => {
    game?.dispose();
    app?.dispose();
  });
