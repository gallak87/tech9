// Standard Gamepad API positions; labels use Xbox names on every platform.
export const CONTROLLER_PRESETS = Object.freeze({
  classic: { name: 'Classic', throttle: 7, brake: 6, boost: 0, airbrake: 1 },
  shoulders: {
    name: 'Shoulders',
    throttle: 7,
    brake: 6,
    boost: 5,
    airbrake: 4,
  },
  arcade: { name: 'Arcade', throttle: 0, brake: 6, boost: 7, airbrake: 1 },
});
export const CONTROLLER_DEFAULTS = Object.freeze({
  controllerPreset: 'classic',
  steeringDeadZone: 0.15,
});
const labels = { 0: 'A', 1: 'B', 4: 'LB', 5: 'RB', 6: 'LT', 7: 'RT' };
export function controllerSettings(settings = {}) {
  return {
    controllerPreset: Object.hasOwn(
      CONTROLLER_PRESETS,
      settings.controllerPreset,
    )
      ? settings.controllerPreset
      : CONTROLLER_DEFAULTS.controllerPreset,
    steeringDeadZone: Number.isFinite(settings.steeringDeadZone)
      ? Math.max(0, Math.min(0.4, settings.steeringDeadZone))
      : CONTROLLER_DEFAULTS.steeringDeadZone,
  };
}
export function controllerLayout(settings) {
  const preset =
    CONTROLLER_PRESETS[controllerSettings(settings).controllerPreset];
  return Object.fromEntries(
    ['throttle', 'brake', 'boost', 'airbrake'].map((action) => [
      action,
      labels[preset[action]],
    ]),
  );
}
export function readGamepad() {
  try {
    return (
      [...navigator.getGamepads()].find(
        (pad) => pad?.connected && pad.mapping === 'standard',
      ) ?? null
    );
  } catch {
    return null;
  }
}
export function stickAxis(value) {
  return Number.isFinite(value) ? Math.max(-1, Math.min(1, value)) : 0;
}
export function steeringAxis(
  value,
  deadZone = CONTROLLER_DEFAULTS.steeringDeadZone,
) {
  const x = stickAxis(value);
  const threshold = controllerSettings({
    steeringDeadZone: deadZone,
  }).steeringDeadZone;
  return Math.abs(x) <= threshold
    ? 0
    : (Math.sign(x) * (Math.abs(x) - threshold)) / (1 - threshold);
}
function buttonValue(button) {
  return Number.isFinite(button?.value)
    ? Math.max(0, Math.min(1, button.value))
    : Number(!!button?.pressed);
}
export function sampleGamepad(pad, settings = {}, blocked = new Set()) {
  const { controllerPreset, steeringDeadZone } = controllerSettings(settings);
  const preset = CONTROLLER_PRESETS[controllerPreset];
  const value = (index) =>
    blocked.has(index) ? 0 : buttonValue(pad?.buttons[index]);
  const pressed = (index) =>
    !blocked.has(index) &&
    (!!pad?.buttons[index]?.pressed || value(index) > 0.5);
  return {
    steer: steeringAxis(pad?.axes[0], steeringDeadZone),
    throttle: value(preset.throttle),
    brake: value(preset.brake),
    boost: pressed(preset.boost),
    airbrake: pressed(preset.airbrake),
    equipment1: pressed(2),
    equipment2: pressed(3),
    equipment3: pressed(14),
    equipment4: pressed(15),
  };
}
// A held menu/trigger button must be released before it can drive after a
// context switch or reconnect. Countdown-to-green does not clear this reader.
export function createGamepadReader(
  getSettings = () => ({}),
  read = readGamepad,
) {
  const blocked = new Set();
  let identity = null;
  function blockHeld(pad) {
    blocked.clear();
    pad?.buttons.forEach((button, index) => {
      if (button.pressed || buttonValue(button) > 0.05) blocked.add(index);
    });
  }
  return {
    clear() {
      const pad = read();
      blockHeld(pad);
      identity = pad ? `${pad.index}:${pad.id}` : null;
    },
    sample() {
      const pad = read();
      const next = pad ? `${pad.index}:${pad.id}` : null;
      if (identity !== next) {
        blockHeld(pad);
        identity = next;
      }
      for (const index of blocked) {
        const button = pad?.buttons[index];
        if (!button?.pressed && buttonValue(button) <= 0.05)
          blocked.delete(index);
      }
      return { present: !!pad, ...sampleGamepad(pad, getSettings(), blocked) };
    },
  };
}
