import {
  CONTROLLER_PRESETS,
  controllerLayout,
  readGamepad,
  steeringAxis,
  stickAxis,
} from '../input/gamepad.js';

export function controllerSettingsView(settings) {
  return `<section class="controller-settings" aria-labelledby="controller-heading">
    <h2 id="controller-heading">Controller</h2>
    <p class="controller-status" role="status">Connect a controller to test.</p>
    <label><span>Button layout</span><select data-setting="controllerPreset">${Object.entries(
      CONTROLLER_PRESETS,
    )
      .map(
        ([id, preset]) =>
          `<option value="${id}" ${settings.controllerPreset === id ? 'selected' : ''}>${preset.name}</option>`,
      )
      .join('')}</select></label>
    <div class="controller-guide keyboard-guide"><dl>${[
      ['throttle', 'Throttle'],
      ['brake', 'Brake'],
      ['boost', 'Boost'],
      ['airbrake', 'Airbrake'],
    ]
      .map(
        ([action, label]) =>
          `<div><dt><kbd data-controller-action="${action}"></kbd></dt><dd>${label}</dd></div>`,
      )
      .join('')}
    <div><dt><kbd>Left stick</kbd></dt><dd>Steer</dd></div>
    <div><dt><kbd>Right stick click</kbd></dt><dd>Change race camera</dd></div>
    <div><dt><kbd>X / Y / D-pad ← / →</kbd></dt><dd>Equipment 1 / 2 / 3 / 4</dd></div>
    <div><dt><kbd>Menu / Start</kbd></dt><dd>Pause / resume</dd></div>
    <div><dt><kbd>View / Select</kbd></dt><dd>Music play / pause</dd></div>
    <div><dt><kbd>D-pad / stick</kbd></dt><dd>Navigate menus</dd></div>
    <div><dt><kbd>A / B</kbd></dt><dd>Confirm / back</dd></div></dl>
    </div>
    <label for="steering-dead-zone"><span>Steering dead zone <small id="dead-zone-help">Increase to reduce stick drift.</small></span><span class="dead-zone-control"><output for="steering-dead-zone" id="dead-zone-value"></output><input id="steering-dead-zone" data-setting="steeringDeadZone" type="range" min="0" max="0.4" step="0.01" value="${settings.steeringDeadZone}" aria-describedby="dead-zone-help"></span></label>
    <p>D-pad: adjust · Left stick: test</p><div class="stick-test" aria-label="Live steering test"><div class="stick-test-heading"><span>Stick test</span><span class="stick-zone-key">Dead zone</span></div><div class="stick-meter" aria-hidden="true"><span class="stick-dead-zone"></span><i></i></div><p><span>Stick <b data-stick-value>0%</b></span><span>Steering <b data-steering-value>0%</b></span></p></div>
    <button data-action="controller-reset">Reset controller defaults</button>
  </section>`;
}
export function bindControllerSettings(root, getSettings) {
  let frame;
  const setText = (selector, value) => {
    const element = root.querySelector(selector);
    if (element.textContent !== value) element.textContent = value;
  };
  function poll() {
    const settings = getSettings();
    const pad = readGamepad();
    const axis = stickAxis(pad?.axes[0]);
    const steer = steeringAxis(axis, settings.steeringDeadZone);
    for (const [action, label] of Object.entries(controllerLayout(settings)))
      setText(`[data-controller-action="${action}"]`, label);
    setText(
      '.controller-status',
      pad ? 'Controller connected' : 'Connect a controller to test.',
    );
    setText(
      '#dead-zone-value',
      `${Math.round(settings.steeringDeadZone * 100)}%`,
    );
    setText('[data-stick-value]', `${Math.round(axis * 100)}%`);
    setText('[data-steering-value]', `${Math.round(steer * 100)}%`);
    root.querySelector('.stick-meter i').style.left = `${(axis + 1) * 50}%`;
    const zone = root.querySelector('.stick-dead-zone');
    zone.style.left = `${(1 - settings.steeringDeadZone) * 50}%`;
    zone.style.width = `${settings.steeringDeadZone * 100}%`;
    frame = requestAnimationFrame(poll);
  }
  poll();
  return () => cancelAnimationFrame(frame);
}
