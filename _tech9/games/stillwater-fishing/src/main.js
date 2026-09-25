import './style.css';
import { SceneApp } from './core/SceneApp.js';
import { forestDefinition } from './world/forestDefinition.js';
import { createPondWorld } from './world/PondWorld.js';
import { isWalkable } from './world/pondDefinition.js';
import { WalkingController } from './game/WalkingController.js';
import { FishingGame } from './game/FishingGame.js';
const loading = document.querySelector('#loading');
let app;
try {
  const testMode = new URLSearchParams(location.search).get('test') === '1';
  app = new SceneApp(document.querySelector('#scene'), {
    definition: forestDefinition,
    testMode,
    ui: document.querySelector('#world-hud'),
  });
  const game = new FishingGame(app);
  app.setController(
    (context) =>
      new WalkingController(context, {
        canMove: () =>
          game.active &&
          ['ready', 'charging', 'failed'].includes(game.rules.phase),
        canLook: () => game.active && game.rules.phase !== 'landed',
        onPause: () => game.pause(),
        isWalkable,
      }),
  );
  await app.register(forestDefinition.createWorld());
  await app.register(createPondWorld());
  await app.register(game);
  app.events.addEventListener('error', (event) => {
    game.pause();
    loading.hidden = false;
    loading.textContent = event.detail;
  });
  if (testMode)
    window.__SCENE_TEST__ = {
      get ready() {
        return app.ready;
      },
      snapshot: () => ({ ...app.snapshot(), game: game.snapshot() }),
      setSettings: (patch) => app.setSettings(patch, false),
    };
  app.start();
  loading.hidden = true;
} catch (error) {
  console.error(error);
  loading.innerHTML = '';
  const message = document.createElement('div');
  message.className = 'load-error';
  message.textContent = `Stillwater could not load. ${error.message}`;
  loading.append(message);
}
if (import.meta.hot) import.meta.hot.dispose(() => app?.dispose());
