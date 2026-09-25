import './style.css';
import { SceneApp } from './core/SceneApp.js';
import { forestDefinition } from './world/forestDefinition.js';
import { Hunt } from './game/Hunt.js';
const loading = document.querySelector('#loading');
let app;
try {
  const testMode = new URLSearchParams(location.search).get('test') === '1';
  app = new SceneApp(document.querySelector('#scene'), {
    definition: {
      ...forestDefinition,
      id: 'pinewatch-hunt',
      title: 'Pinewatch Hunt',
    },
    testMode,
    ui: document.querySelector('#world-hud'),
    storageKey: 'pinewatch-hunt.settings',
  });
  app.setSettings({ quality: 'balanced' }, false);
  await app.register(forestDefinition.createWorld());
  const hunt = new Hunt(app);
  await app.register(hunt);
  if (testMode) {
    window.__SCENE_TEST__ = {
      get ready() {
        return app.ready;
      },
      snapshot: () => app.snapshot(),
    };
    window.__HUNT_TEST__ = { snapshot: () => hunt.snapshot() };
  }
  app.events.addEventListener('error', (e) => {
    hunt.pause();
    loading.classList.remove('loaded');
    loading.textContent = e.detail;
  });
  app.start();
  loading.classList.add('loaded');
  loading.setAttribute('aria-hidden', 'true');
} catch (error) {
  console.error(error);
  loading.innerHTML =
    '<div class="load-error">The forest could not load. Please reload.</div>';
}
if (import.meta.hot) import.meta.hot.dispose(() => app?.dispose());
