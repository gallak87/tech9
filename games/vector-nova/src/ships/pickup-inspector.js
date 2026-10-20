import { Box3, Vector3 } from 'three';
import arcActivationURL from '../../assets/audio/sfx/arc-activate.wav?url';
import { createPickupPreview } from './pickup-preview.js';
import { PICKUP_PREVIEWS } from './pickup-preview-sequence.js';
import { createRivalPreview } from './rivals.js';
import { createEnginePreview } from './engine-preview.js';
import './pickup-inspector.css';

// Loaded only by the standalone inspector with dev=1.
export async function createPickupInspector({
  host,
  ship,
  getSettings,
  getDriving,
}) {
  let target, targetError;
  try {
    target = await createRivalPreview('rook');
  } catch {
    targetError = 'Rook target unavailable. Reload to retry.';
  }
  const element = document.createElement('section');
  element.className = 'inspection-pickups';
  element.setAttribute('aria-label', 'Powerup sound and effects preview');
  element.innerHTML = `<label for="inspection-pickup">Powerups</label><div class="inspection-pickup-controls"><select id="inspection-pickup">${PICKUP_PREVIEWS.map(({ id, label }) => `<option value="${id}">${label}</option>`).join('')}</select><button type="button" data-trigger>Trigger</button><button type="button" data-stop>Stop</button></div><label class="inspection-engine"><input type="checkbox">Engine sound <span>Driving / Boost</span></label><p role="status">Ready · Rook target ahead</p>`;
  const select = element.querySelector('select');
  const trigger = element.querySelector('[data-trigger]');
  const stop = element.querySelector('[data-stop]');
  const status = element.querySelector('[role="status"]');
  const engineToggle = element.querySelector('input');
  const engine = createEnginePreview({ getState: getDriving, getSettings });
  select.value = 'arc';
  const preview = createPickupPreview({
    ship,
    target: target?.group,
    candidateURL: arcActivationURL,
    getSettings,
    onStatus: (text) => {
      status.textContent = text;
    },
  });
  host.append(element);
  if (targetError) status.textContent = targetError;
  engineToggle.onchange = () => engine.setEnabled(engineToggle.checked);
  trigger.onclick = () => {
    void preview.trigger(select.value);
  };
  stop.onclick = () => preview.stop();
  select.onchange = () => preview.stop();
  const life = new AbortController();
  const syncForeground = () => {
    const foreground = !document.hidden && document.hasFocus();
    engine.setForeground(foreground);
    if (!foreground) preview.stop();
  };
  window.addEventListener('blur', syncForeground, { signal: life.signal });
  window.addEventListener('focus', syncForeground, { signal: life.signal });
  document.addEventListener(
    'visibilitychange',
    () => {
      syncForeground();
    },
    { signal: life.signal },
  );
  return {
    update(dt) {
      preview.update(dt);
      engine.update();
    },
    configure() {
      preview.configure();
      engine.update();
    },
    previewChanged: () => {
      void engine.changed();
    },
    framing(bounds) {
      if (!target) return null;
      const box = new Box3(
        new Vector3(...bounds.min),
        new Vector3(...bounds.max),
      );
      const other = target.group.userData.bounds;
      box.union(
        new Box3(
          new Vector3(...other.min),
          new Vector3(...other.max),
        ).translate(target.group.position),
      );
      return { min: box.min.toArray(), max: box.max.toArray() };
    },
    setShip(next) {
      preview.setShip(next);
      select.disabled =
        trigger.disabled =
        stop.disabled =
        engineToggle.disabled =
          !next;
      void engine.changed();
      if (!next) status.textContent = 'Loading ship…';
    },
    dispose() {
      life.abort();
      engine.dispose();
      preview.dispose();
      target?.dispose();
      element.remove();
    },
  };
}
