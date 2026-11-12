import { soundEffects } from './sounds.js';
import { createSoundPreview } from './sound-preview.js';
import './sound-panel.css';

const preferenceKey = 'vector-nova.dev.sound';

export function createSoundPanel(
  host,
  { clearInput = () => {}, getSettings } = {},
) {
  const root = document.createElement('section');
  root.className = 'sound-panel';
  root.dataset.soundPanel = '';
  root.setAttribute('aria-label', 'Sound effects audition');
  root.innerHTML = `<div class="sound-panel-heading"><label for="sound-picker">SOUNDS</label><span role="status">Ready</span></div><div class="sound-panel-controls"><select id="sound-picker" aria-label="Sound effect"></select><button type="button" aria-label="Play selected sound">Play</button></div>`;
  const picker = root.querySelector('select');
  const play = root.querySelector('button');
  const status = root.querySelector('[role="status"]');
  let group;
  for (const sound of soundEffects) {
    if (group?.label !== sound.group) {
      group = document.createElement('optgroup');
      group.label = sound.group;
      picker.append(group);
    }
    const option = document.createElement('option');
    option.value = sound.id;
    option.textContent = sound.label;
    group.append(option);
  }
  try {
    const remembered = localStorage.getItem(preferenceKey);
    if (soundEffects.some(({ id }) => id === remembered))
      picker.value = remembered;
  } catch {
    /* Auditions remain usable when browser storage is unavailable. */
  }
  const remember = () => {
    try {
      localStorage.setItem(preferenceKey, picker.value);
    } catch {
      /* Keep the current selection for this panel's lifetime. */
    }
  };
  const preview = createSoundPreview({
    getSettings,
    onStatus: (text) => {
      status.textContent = text;
    },
  });
  const life = new AbortController();
  const listen = (target, type, listener) =>
    target.addEventListener(type, listener, { signal: life.signal });
  listen(play, 'click', () => {
    remember();
    void preview.play(picker.value);
  });
  listen(picker, 'change', () => {
    remember();
    preview.stop();
  });
  listen(root, 'keydown', (event) => {
    if (event.code === 'Escape') preview.stop();
    else event.stopPropagation();
  });
  listen(root, 'keyup', (event) => event.stopPropagation());
  listen(root, 'pointerdown', (event) => event.stopPropagation());
  listen(root, 'focusin', clearInput);
  listen(document, 'visibilitychange', () => {
    if (document.hidden) preview.stop();
  });
  host.append(root);
  return {
    mount(target = host) {
      const parent = target ?? host;
      parent.append(root);
      root.toggleAttribute('data-docked', parent !== host);
    },
    configure: () => preview.configure(),
    dispose() {
      life.abort();
      preview.dispose();
      root.remove();
    },
  };
}
