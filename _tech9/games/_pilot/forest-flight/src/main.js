import './style.css';
import { SceneApp } from './core/SceneApp.js';
import {
  createFlightWorld,
  groundHeight,
  BOUNDS,
  LANDMARKS,
} from './flight/FlightWorld.js';
import { FlightGame } from './flight/FlightGame.js';
const testMode = new URLSearchParams(location.search).get('test') === '1';
const definition = {
  id: 'forest-flight',
  title: 'Forest Flight',
  bounds: {
    minX: -BOUNDS,
    maxX: BOUNDS,
    minZ: -BOUNDS,
    maxZ: BOUNDS,
    minY: 0,
    maxY: 750,
  },
  groundHeight,
  initialView: 'airfield',
  views: { airfield: { position: [-14, 7, 354], target: [0, 1.8, 337] } },
  environment: {
    exposure: 0.98,
    fog: { color: '#b5c9c5', density: 0.00031 },
    hemisphere: { sky: '#c4d3d2', ground: '#5c6146', intensity: 1.65 },
    sun: {
      color: '#ffe2af',
      intensity: 4.2,
      position: [100, 180, -120],
      shadowBounds: {
        left: -135,
        right: 135,
        top: 135,
        bottom: -135,
        near: 1,
        far: 650,
      },
    },
    sky: {
      turbidity: 4,
      rayleigh: 1.4,
      mieCoefficient: 0.004,
      mieDirectionalG: 0.8,
    },
  },
  createWorld: createFlightWorld,
};
let app;
try {
  app = new SceneApp(document.querySelector('canvas'), {
    definition,
    testMode,
    ui: document.getElementById('ui'),
    storageKey: 'forest-flight.settings',
  });
  const world = createFlightWorld();
  await app.register(world);
  const game = new FlightGame(app);
  app.setController(game);
  document.getElementById('map-markers').innerHTML = LANDMARKS.map(
    (m, i) =>
      `<g data-marker="${m.id}" class="map-marker"><circle cx="${80 + m.x / 30}" cy="${80 + m.z / 30}" r="5"/><text x="${80 + m.x / 30 + 8}" y="${80 + m.z / 30 + 3}">${i + 1}</text></g>`,
  ).join('');
  app.events.addEventListener('error', (e) => {
    document.getElementById('load-error').hidden = false;
    document.getElementById('load-error').textContent = e.detail;
  });
  document.getElementById('loading').hidden = true;
  app.start();
  window.addEventListener('pagehide', () => app.dispose(), { once: true });
  if (testMode)
    window.__FLIGHT_TEST__ = {
      snapshot: () => ({ ...game.snapshot(), landscape: { ...world.stats } }),
      dispose: () => app.dispose(),
      setSimulationRate: (rate) => {
        if (!Number.isInteger(rate) || rate < 1 || rate > 12)
          throw new RangeError('Test rate must be 1–12');
        game.testSimulationRate = rate;
      },
      inspect: (position, target) => {
        game.sim.paused = true;
        app.setController({
          update() {
            app.camera.position.fromArray(position);
            app.camera.up.set(0, 1, 0);
            app.camera.lookAt(...target);
          },
          dispose() {},
        });
        app.sun.target.position.set(
          position[0],
          groundHeight(position[0], position[2]),
          position[2],
        );
        app.sun.position
          .copy(app.sun.target.position)
          .add({ x: 100, y: 180, z: -120 });
        app.sun.target.updateMatrixWorld();
        app.renderer.shadowMap.needsUpdate = true;
        document.getElementById('ui').hidden = true;
      },
      scenario: (name) => {
        if (name !== 'collision') throw new Error('Unknown test scenario');
        game.sim.reset();
        game.sim.start();
        Object.assign(game.sim.state, {
          x: 100,
          y: groundHeight(100, 0) + 1.35,
          z: 0,
          speed: 25,
        });
      },
    };
} catch (error) {
  console.error(error);
  app?.dispose();
  document.getElementById('loading').hidden = true;
  document.getElementById('load-error').hidden = false;
  document.getElementById('load-error').textContent =
    `Flight could not load: ${error.message}. Reload to try again.`;
}
