import { CONTROLLER_DEFAULTS } from '../input/gamepad.js';
import {
  loadSettings,
  saveSettings,
  subscribeSettings,
} from '../progression/index.js';
import {
  controllerSettingsView,
  bindControllerSettings,
} from './controller-settings.js';

export function settingsView(
  settings,
  { developer = false, artPass = false } = {},
) {
  const audio = [
    ['masterVolume', 'Master volume'],
    ['volume', 'Game effects'],
    ['musicVolume', 'Tunes'],
  ]
    .map(
      ([key, label]) =>
        `<label><span>${label}</span><span class="audio-volume-control"><output for="setting-${key}" data-setting-output="${key}">${Math.round(settings[key] * 100)}%</output><input id="setting-${key}" aria-label="${label}" data-setting="${key}" type="range" min="0" max="1" step=".01" value="${settings[key]}"></span></label>`,
    )
    .join('');
  return `<div class="settings-layout"><section class="settings-form"><label><span>Graphics</span><select data-setting="quality"><option value="high">High</option><option value="low">Low</option></select></label>${audio}<label><span>Reduced motion</span><input data-setting="reducedMotion" type="checkbox" ${settings.reducedMotion ? 'checked' : ''}></label>${controllerSettingsView(settings)}</section><section class="keyboard-guide" aria-label="Keyboard shortcuts"><h2>Keyboard</h2>${[
    [
      'Driving',
      [
        ['WASD / Arrows', 'Throttle, brake and steer'],
        ['Shift', 'Boost'],
        ['Q / E / Z / X', 'Equipment 1 / 2 / 3 / 4'],
        ['Space', 'Airbrake'],
        ['Esc', 'Pause / resume'],
        ['R', 'Reset / retry'],
        ['C', 'Change camera'],
      ],
    ],
    [
      'Menus',
      [
        ['Tab / Shift Tab', 'Move between controls'],
        ['↑ / ↓', 'Move between actions'],
        ['← / →', 'Browse choices'],
        ['Home / End', 'First / last choice'],
        ['Enter / Space', 'Select or activate'],
        ['Esc', 'Back / cancel loading'],
        ['S', 'Open settings'],
      ],
    ],
    ...(!import.meta.env?.VN_DESKTOP && (developer || artPass)
      ? [
          [
            'Free camera',
            [
              ['F', 'Enter / leave free camera'],
              ['WASD / Arrows', 'Move'],
              ['Q / E', 'Move down / up'],
              ['Drag', 'Look around'],
              ['P', 'Toggle live dev tools / FPS'],
              ['Esc', 'Close dev tools, then leave free camera'],
            ],
          ],
        ]
      : []),
    [
      'Tunes',
      [
        ['M', 'Play / pause'],
        [', / .', 'Previous / next track'],
        ['/', 'Expand player'],
      ],
    ],
  ]
    .map(
      ([title, rows]) =>
        `<h3>${title}</h3><dl>${rows.map(([key, label]) => `<div><dt><kbd>${key}</kbd></dt><dd>${label}</dd></div>`).join('')}</dl>`,
    )
    .join('')}</section></div>`;
}

export function bindSettingsPanel(
  root,
  { getSettings = loadSettings, signal } = {},
) {
  const life = new AbortController();
  let current = { ...getSettings() };
  const sync = (next) => {
    current = { ...next };
    document.body.classList.toggle('reduced-motion', current.reducedMotion);
    for (const control of root.querySelectorAll('[data-setting]')) {
      const value = current[control.dataset.setting];
      if (control.type === 'checkbox') control.checked = value;
      else control.value = value;
    }
    for (const output of root.querySelectorAll('[data-setting-output]'))
      output.textContent = `${Math.round(current[output.dataset.settingOutput] * 100)}%`;
  };
  sync(current);
  const unsubscribe = subscribeSettings(sync);
  const controller = root.querySelector('.controller-settings');
  const disposeController = controller
    ? bindControllerSettings(controller, () => current)
    : () => {};
  function save(control) {
    const key = control.dataset.setting;
    if (!key) return;
    const value =
      control.type === 'checkbox'
        ? control.checked
        : control.type === 'range'
          ? Number(control.value)
          : control.value;
    if (current[key] !== value) saveSettings({ [key]: value });
  }
  root.addEventListener(
    'input',
    (event) => {
      if (event.target.type === 'range') save(event.target);
    },
    { signal: life.signal },
  );
  root.addEventListener('change', (event) => save(event.target), {
    signal: life.signal,
  });
  root.addEventListener(
    'click',
    (event) => {
      if (event.target.closest('[data-action="controller-reset"]'))
        saveSettings(CONTROLLER_DEFAULTS);
    },
    { signal: life.signal },
  );
  function dispose() {
    if (life.signal.aborted) return;
    signal?.removeEventListener('abort', dispose);
    life.abort();
    unsubscribe();
    disposeController();
  }
  signal?.addEventListener('abort', dispose, { once: true });
  if (signal?.aborted) dispose();
  return dispose;
}
