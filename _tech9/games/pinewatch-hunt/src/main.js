import './style.css';
import { SceneApp } from './core/SceneApp.js';
import { forestDefinition } from './world/forestDefinition.js';
import { DevPanel } from './ui/DevPanel.js';

const loading = document.querySelector('#loading');
let app;
let panel;
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
  const testMode = new URLSearchParams(location.search).get('test') === '1';
  app = new SceneApp(document.querySelector('#scene'), {
    definition: forestDefinition,
    testMode,
    ui: document.querySelector('#world-hud'),
  });
  app.events.addEventListener('error', (event) => showError(event.detail));
  if (testMode)
    window.__SCENE_TEST__ = {
      get ready() {
        return app.ready;
      },
      snapshot: () => app.snapshot(),
      setView: (name) => app.setView(name),
      setSettings: (patch) => app.setSettings(patch, false),
    };
  await app.register(forestDefinition.createWorld());
  panel = new DevPanel(app, document.querySelector('#interface'));
  app.start();
  loading.classList.add('loaded');
  loading.setAttribute('aria-hidden', 'true');
} catch (error) {
  console.error(error);
  showError(`The forest could not load. ${error.message}`);
}
if (import.meta.hot)
  import.meta.hot.dispose(() => {
    panel?.dispose();
    app?.dispose();
  });
