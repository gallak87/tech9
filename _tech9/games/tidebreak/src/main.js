import './style.css';
import { SceneApp } from './core/SceneApp.js';
import { BoatSimulation } from './game/BoatSimulation.js';
import { LapRules } from './game/LapRules.js';
import { BoatInput } from './game/BoatInput.js';
import { ChaseCamera } from './camera/ChaseCamera.js';
import { createIslandWorld } from './world/IslandWorld.js';
import { createOceanLayer } from './world/OceanLayer.js';
import { createBoatView } from './world/BoatView.js';
import { islandHeight } from './world/islandDefinition.js';
import { TidebreakUI } from './ui/TidebreakUI.js';

const definition = {
  id: 'tidebreak',
  title: 'Tidebreak',
  bounds: { minX: -260, maxX: 260, minZ: -260, maxZ: 260, minY: 0, maxY: 80 },
  groundHeight: islandHeight,
  createWorld: createIslandWorld,
  initialView: 'jetty',
  views: { jetty: { position: [0, 10, 118], target: [25, 1, 103] } },
  environment: {
    exposure: 0.95,
    fog: { color: '#aec5c5', density: 0.0018 },
    hemisphere: { sky: '#bedbd9', ground: '#626b4f', intensity: 1.8 },
    sun: {
      color: '#ffe1ad',
      intensity: 3.5,
      position: [-130, 100, -90],
      shadowBounds: {
        left: -125,
        right: 125,
        top: 125,
        bottom: -125,
        near: 1,
        far: 500,
      },
    },
    sky: {
      turbidity: 4,
      rayleigh: 1.25,
      mieCoefficient: 0.004,
      mieDirectionalG: 0.82,
    },
  },
};
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
  app.setController(new ChaseCamera(app.camera, boat));
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
