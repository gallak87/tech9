import './style.css';
import { SceneApp } from './core/SceneApp.js';
import { forestDefinition } from './world/forestDefinition.js';
import { createPondWorld } from './world/PondWorld.js';
import { shoreline, isWalkable } from './world/pondDefinition.js';
import { createPondWaterLayer } from './capabilities/pond-water/src/PondWater.js';
import { WalkingController } from './capabilities/grounded-walking/src/WalkingController.js';
import { PondExplorer } from './ui/PondExplorer.js';

const loading = document.querySelector('#loading');
let app;
try {
  const testMode = new URLSearchParams(location.search).get('test') === '1';
  app = new SceneApp(document.querySelector('#scene'), {
    definition: forestDefinition,
    testMode,
    ui: document.querySelector('#world-hud'),
  });
  const explorer = new PondExplorer(app);
  app.setController(
    (context) =>
      new WalkingController(context, {
        enabled: false,
        speed: 2.6,
        boostSpeed: 4,
        playerRadius: 0.3,
        eyeHeight: 1.68,
        isWalkable,
        canMove: () => explorer.state === 'exploring',
        canLook: () => explorer.state === 'exploring',
        onPause: () => explorer.pause(),
      }),
  );
  await app.register(forestDefinition.createWorld());
  await app.register(createPondWaterLayer({ shoreline }));
  await app.register(createPondWorld());
  await app.register(explorer);
  app.events.addEventListener('error', (event) => {
    explorer.pause();
    loading.hidden = false;
    loading.classList.add('load-error');
    loading.textContent = event.detail;
  });
  if (testMode)
    window.__SCENE_TEST__ = {
      get ready() {
        return app.ready;
      },
      snapshot: () => ({ ...app.snapshot(), exploration: explorer.snapshot() }),
      setSettings: (patch) => app.setSettings(patch, false),
    };
  app.start();
  loading.hidden = true;
} catch (error) {
  console.error(error);
  app?.dispose();
  loading.hidden = false;
  loading.classList.add('load-error');
  loading.textContent = `The pond could not load. ${error.message}`;
}
if (import.meta.hot) import.meta.hot.dispose(() => app?.dispose());
