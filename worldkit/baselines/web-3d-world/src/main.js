import './style.css';
import { SceneApp } from './core/SceneApp.js';
import { forestDefinition } from './world/forestDefinition.js';
import { DevPanel } from './ui/DevPanel.js';
import { createForestWeather } from './world/ForestWeather.js';
import { createForestWeatherSurface } from './world/weatherSurface.js';
import { WalkingController } from './modules/grounded-walking/src/WalkingController.js';

const loading = document.querySelector('#loading');
let app;
let panel;
let walking;
let walkUI;
let weather;

/** Scene-owned demonstration UI; the reusable controller never creates a menu. */
function mountWalking(app, root) {
  const abort = new AbortController();
  const options = { signal: abort.signal };
  let started = false;
  let reason = 'Ready';
  const previous = root.querySelector('#enter-world');
  const button = previous.cloneNode(false);
  previous.replaceWith(button); // Replace the fly panel's capture-only listener.
  const capture = document.createElement('button');
  capture.id = 'capture-walking-mouse';
  capture.textContent = 'Capture mouse';
  capture.style.cssText = 'margin-left:12px;padding:12px;pointer-events:auto';
  button.after(capture);
  root.querySelector('.view-nav').style.display = 'none';
  const hint = root.querySelector('#control-hint');
  const sync = () => {
    button.textContent = walking.enabled
      ? 'Pause walking'
      : started
        ? 'Resume walking'
        : 'Start walking';
    capture.hidden = !walking.enabled;
    hint.textContent = walking.enabled
      ? 'WASD walk · Shift jog · Right-drag / IJKL look · P / Esc pause'
      : `${reason} · Start or resume to walk; mouse capture is optional.`;
  };
  walking = app.setController(
    (context) =>
      new WalkingController(context, {
        onPause: (value) => {
          reason =
            value === 'blur' || value === 'hidden' ? 'Focus changed' : 'Paused';
          panel.toggle(true);
          sync();
        },
      }),
  );
  button.addEventListener(
    'click',
    () => {
      if (walking.enabled) walking.pause('button');
      else {
        started = true;
        walking.setEnabled(true);
        walking.update(0);
        panel.toggle(false);
        app.canvas.focus();
        sync();
      }
    },
    options,
  );
  capture.addEventListener(
    'click',
    () => {
      void walking.lock();
    },
    options,
  );
  root.querySelector('#toggle-panel').addEventListener(
    'click',
    () => {
      if (walking.enabled) walking.pause('tuning');
    },
    options,
  );
  document.addEventListener('pointerlockchange', sync, options);
  sync();
  return {
    dispose: () => {
      abort.abort();
      capture.remove();
    },
  };
}
function showError(message) {
  loading.classList.remove('loaded');
  loading.removeAttribute('aria-hidden');
  loading.replaceChildren();
  const description = document.createElement('div');
  description.className = 'load-error';
  description.textContent = message;
  const reload = document.createElement('button');
  reload.textContent = 'Reload the forest';
  reload.addEventListener('click', () => location.reload());
  description.append(reload);
  loading.append(description);
}
try {
  const query = new URLSearchParams(location.search);
  const testMode = query.get('test') === '1';
  const walkMode = query.get('controller') === 'walk';
  const surface = createForestWeatherSurface();
  const sceneDefinition = walkMode
    ? {
        ...forestDefinition,
        presentation: {
          ...forestDefinition.presentation,
          subtitle: 'GROUNDED FOREST EXPLORATION',
          controls:
            'WASD walk · Shift jog · Right-drag / IJKL look · P / Esc pause',
          lockedControls: 'WASD walk · Shift jog · P / Esc pause',
          boundaryNotice: 'Edge of the forest · walk back toward the grove',
        },
      }
    : forestDefinition;
  const definition = {
    ...sceneDefinition,
    groundHeight: (x, z) =>
      forestDefinition.groundHeight(x, z) +
      (weather?.groundSnowDepth(x, z) ?? 0),
    views: {
      ...sceneDefinition.views,
      weatherRock: {
        hidden: true,
        position: [-3.5, 2.1, 13.5],
        target: [-5.8, 0.9, 10],
      },
      weatherShelter: {
        hidden: true,
        position: [-8.5, 1.9, 16.8],
        target: [-3, 0.3, 12],
      },
    },
  };
  app = new SceneApp(document.querySelector('#scene'), {
    definition,
    testMode,
    ui: document.querySelector('#world-hud'),
  });
  app.events.addEventListener('error', (event) => showError(event.detail));
  if (testMode)
    window.__SCENE_TEST__ = {
      get ready() {
        return app.ready;
      },
      snapshot: () => ({
        ...app.snapshot(),
        weather: weather?.stats,
        ...(walking
          ? {
              walking: {
                ...walking.snapshot(),
                yaw: app.camera.rotation.y,
                pitch: app.camera.rotation.x,
                groundHeight: app.groundHeight(
                  app.camera.position.x,
                  app.camera.position.z,
                ),
              },
            }
          : {}),
      }),
      setView: (name) => app.setView(name),
      setSettings: (patch) => app.setSettings(patch, false),
      setWeather: (patch) => weather.configureWeather(patch),
      cycleWeather: async (features = {}) => {
        app.unregister('forest-weather');
        weather = createForestWeather(app, forest, surface, features);
        await app.register(weather);
      },
    };
  const forest = await app.register(forestDefinition.createWorld());
  weather = createForestWeather(app, forest, surface);
  await app.register(weather);
  panel = new DevPanel(app, document.querySelector('#interface'));
  if (walkMode)
    walkUI = mountWalking(app, document.querySelector('#interface'));
  app.start();
  loading.classList.add('loaded');
  loading.setAttribute('aria-hidden', 'true');
} catch (error) {
  console.error(error);
  showError(`The forest could not load. ${error.message}`);
}
if (import.meta.hot)
  import.meta.hot.dispose(() => {
    walkUI?.dispose();
    panel?.dispose();
    app?.dispose();
  });
