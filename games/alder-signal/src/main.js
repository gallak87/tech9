import './style.css';
import { SceneApp } from './core/SceneApp.js';
import { forestDefinition } from './world/forestDefinition.js';
import { WalkingController } from './game/WalkingController.js';
import { AlderGame } from './game/AlderGame.js';

const loading = document.querySelector('#loading');
let app;
let game;
function showError(message) {
  loading.classList.remove('loaded');
  loading.removeAttribute('aria-hidden');
  loading.replaceChildren();
  const description = document.createElement('div');
  description.className = 'load-error';
  description.textContent = message;
  const reload = document.createElement('button');
  reload.textContent = 'Reload the mission';
  reload.addEventListener('click', () => location.reload());
  description.append(reload);
  loading.append(description);
}
try {
  const testMode = new URLSearchParams(location.search).get('test') === '1';
  const definition = {
    ...forestDefinition,
    id: 'alder-signal',
    title: 'Alder Signal',
  };
  app = new SceneApp(document.querySelector('#scene'), {
    definition,
    testMode,
    storageKey: 'alder-signal.settings',
    ui: document.querySelector('#world-hud'),
  });
  app.events.addEventListener('error', (event) => showError(event.detail));
  const controller = app.setController(
    (context) =>
      new WalkingController({
        ...context,
        colliders: definition.getColliders(),
        onPause: (reason) => game?.pause(reason),
      }),
  );
  await app.register(definition.createWorld());
  game = new AlderGame({
    controller,
    setSettings: (patch) => app.setSettings(patch),
  });
  await app.register(game);
  if (testMode) {
    window.__SCENE_TEST__ = {
      get ready() {
        return app.ready;
      },
      snapshot: () => ({ ...app.snapshot(), game: game.snapshot() }),
      setSettings: (patch) => app.setSettings(patch, false),
    };
    window.__ALDER_TEST__ = {
      snapshot: () => game.snapshot(),
      setRemaining: (seconds) => {
        if (!Number.isFinite(seconds) || seconds < 0)
          throw new Error('Remaining time must be a non-negative number.');
        game.mission.remainingSeconds = seconds;
        game.mission.lastNow = performance.now() / 1000;
      },
    };
  }
  app.start();
  loading.classList.add('loaded');
  loading.setAttribute('aria-hidden', 'true');
} catch (error) {
  console.error(error);
  showError(`The mission could not load. ${error.message}`);
}
if (import.meta.hot) import.meta.hot.dispose(() => app?.dispose());
