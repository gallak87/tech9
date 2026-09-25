import './style.css';
import { SceneApp } from './core/SceneApp.js';
import { BoatSimulation } from './game/BoatSimulation.js';
import { LapRules } from './game/LapRules.js';
import { BoatInput } from './game/BoatInput.js';
import { ChaseCamera } from './camera/ChaseCamera.js';
import { createIslandWorld } from './world/IslandWorld.js';
import { createOceanLayer } from './world/OceanLayer.js';
import { createBoatView } from './world/BoatView.js';
import { tidebreakDefinition as definition } from './world/tidebreakDefinition.js';
import { TidebreakUI } from './ui/TidebreakUI.js';

const testMode = new URLSearchParams(location.search).get('test') === '1';
let app, input, ui;
try {
  app = new SceneApp(document.querySelector('#world'), {
    definition,
    testMode,
    storageKey: 'tidebreak.settings',
  });
  app.camera.far = 1600;
  app.camera.updateProjectionMatrix();
  const boat = new BoatSimulation(),
    rules = new LapRules();
  app.setController(new ChaseCamera(app.camera, boat, rules));
  const refresh = () => ui?.refresh();
  const reset = () => {
    input?.clear();
    boat.reset();
    rules.reset();
    app.controls.resetMotion();
    refresh();
  };
  const primary = () => {
    input.clear();
    if (rules.state === 'paused') rules.resume();
    else {
      boat.reset();
      rules.reset();
      rules.start();
      app.controls.resetMotion();
    }
    refresh();
  };
  const pause = () => {
    input.clear();
    rules.pause();
    refresh();
  };
  input = new BoatInput(rules, refresh, reset);
  ui = new TidebreakUI(app, boat, rules, { primary, pause, reset });
  await app.register({
    id: 'boat-rules',
    init() {},
    update(dt) {
      if (rules.state === 'running') {
        const prev = { x: boat.x, z: boat.z };
        boat.step(dt, input.sample());
        rules.update(dt, prev, boat);
        if (rules.state !== 'running') input.clear();
      }
    },
    dispose() {
      input.dispose();
      ui.dispose();
    },
  });
  await app.register(createIslandWorld(rules));
  await app.register(createOceanLayer());
  await app.register(createBoatView(boat, rules));
  await app.register({
    id: 'helm-ui',
    init() {},
    update() {
      ui.update();
    },
    dispose() {},
  });
  if (testMode)
    Object.defineProperty(window, '__SCENE_TEST__', {
      value: Object.freeze({
        get ready() {
          return app.ready;
        },
        snapshot: () =>
          structuredClone({
            ...app.snapshot(),
            boat: boat.snapshot(),
            lap: rules.snapshot(),
            input: input.sample(),
          }),
      }),
      configurable: true,
    });
  app.start();
  document.querySelector('.loading').remove();
  window.addEventListener('pagehide', () => app.dispose(), { once: true });
} catch (error) {
  console.error(error);
  app?.dispose();
  document.querySelector('.loading')?.remove();
  const message = document.createElement('div');
  message.className = 'load-error';
  message.textContent = `Tidebreak could not launch: ${error.message}`;
  document.body.append(message);
}
