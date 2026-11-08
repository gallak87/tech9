import { EQUIPMENT_CONTROLS } from '../equipment/controls.js';
import { createGamepadReader } from './gamepad.js';
import { createTouchControls } from './touch.js';

export function createInput(
  onCommand,
  onBlur,
  getSettings,
  { freestyle = false } = {},
) {
  const gamepad = createGamepadReader(getSettings, undefined, freestyle);
  const keys = new Set(),
    abort = new AbortController();
  let gamepadPresent = false,
    enabled = true;
  const touch = createTouchControls(abort.signal, () => enabled);
  const codes = [
    'ArrowUp',
    'ArrowDown',
    'ArrowLeft',
    'ArrowRight',
    'KeyW',
    'KeyA',
    'KeyS',
    'KeyD',
    'ShiftLeft',
    'ShiftRight',
    'Space',
    ...(freestyle
      ? ['KeyQ', 'KeyE']
      : EQUIPMENT_CONTROLS.map(({ key }) => key)),
  ];
  const equipmentPulses = EQUIPMENT_CONTROLS.map(() => false);
  const clear = () => {
    equipmentPulses.fill(false);
    keys.clear();
    touch.clear();
    gamepad.clear();
  };
  window.addEventListener(
    'keydown',
    (e) => {
      if (!enabled || e.defaultPrevented) return;
      if (e.target.closest('input,select,textarea,summary')) return;
      if (e.code === 'Space' && e.target.matches('button')) return;
      if (codes.includes(e.code)) {
        e.preventDefault();
        keys.add(e.code);
        const slot = EQUIPMENT_CONTROLS.findIndex(({ key }) => key === e.code);
        if (!freestyle && slot >= 0 && !e.repeat) equipmentPulses[slot] = true;
      }
      if (!e.repeat) {
        const commands = {
          Escape: 'pause',
          KeyR: 'restart',
          Enter: 'start',
          KeyC: 'camera',
        };
        if (
          commands[e.code] &&
          !(e.code === 'Enter' && e.target.matches('button'))
        )
          onCommand(commands[e.code]);
      }
    },
    { signal: abort.signal },
  );
  window.addEventListener('keyup', (e) => keys.delete(e.code), {
    signal: abort.signal,
  });
  window.addEventListener(
    'vn-camera-toggle',
    () => {
      if (enabled && !document.hidden) onCommand('camera');
    },
    { signal: abort.signal },
  );
  window.addEventListener('resize', () => touch.clear(), {
    signal: abort.signal,
  });
  window.addEventListener(
    'blur',
    () => {
      clear();
      onBlur();
    },
    { signal: abort.signal },
  );
  document.addEventListener(
    'visibilitychange',
    () => {
      if (document.hidden) {
        clear();
        onBlur();
      }
    },
    { signal: abort.signal },
  );
  const down = (...k) => k.some((v) => keys.has(v));
  const drivingKey = (letter, arrow) =>
    down(letter) || (!freestyle && down(arrow));
  return {
    clear,
    activateEquipment(slot) {
      if (
        enabled &&
        !freestyle &&
        Number.isInteger(slot) &&
        slot >= 0 &&
        slot < equipmentPulses.length
      )
        equipmentPulses[slot] = true;
    },
    consumeEquipment() {
      equipmentPulses.fill(false);
    },
    setEnabled(value) {
      enabled = value;
      if (!value) clear();
    },
    get gamepadPresent() {
      return gamepadPresent;
    },
    sample() {
      const t = touch.sample();
      let i = {
        throttle: drivingKey('KeyW', 'ArrowUp') ? 1 : t.throttle,
        brake: drivingKey('KeyS', 'ArrowDown') ? 1 : t.brake,
        steer:
          Number(drivingKey('KeyD', 'ArrowRight')) -
            Number(drivingKey('KeyA', 'ArrowLeft')) || t.steer,
        boost: down('ShiftLeft', 'ShiftRight') || t.boost,
        airbrake: down('Space') || t.airbrake,
        ...Object.fromEntries(
          EQUIPMENT_CONTROLS.map(({ key }, i) => [
            `equipment${i + 1}`,
            down(key) || equipmentPulses[i],
          ]),
        ),
      };
      const pad = gamepad.sample();
      gamepadPresent = pad.present;
      if (enabled && !document.hidden) {
        if (pad.steer) i.steer = pad.steer;
        i.throttle = Math.max(i.throttle, pad.throttle);
        i.brake = Math.max(i.brake, pad.brake);
        i.boost ||= pad.boost;
        i.airbrake ||= pad.airbrake;
        for (let slot = 1; slot <= EQUIPMENT_CONTROLS.length; slot++)
          i[`equipment${slot}`] ||= pad[`equipment${slot}`];
      }
      if (freestyle) {
        const active = enabled && !document.hidden;
        const clamp = (value) => Math.max(-1, Math.min(1, value));
        // Driving and attitude stay separate for the entire discipline. The
        // flight controller ignores attitude on support, so a held arrow can
        // never turn into steering when the ship touches down.
        i.aerialPitch = active
          ? clamp(
              Number(down('ArrowDown')) -
                Number(down('ArrowUp')) +
                (pad.aerialStickY ?? 0),
            )
          : 0;
        i.aerialRoll = active
          ? clamp(
              Number(down('ArrowLeft')) -
                Number(down('ArrowRight')) -
                (pad.aerialStickX ?? 0),
            )
          : 0;
        i.aerialYaw = active
          ? clamp(
              Number(down('KeyE')) -
                Number(down('KeyQ')) +
                Number(pad.equipment2) -
                Number(pad.equipment1),
            )
          : 0;
        // These buttons belong to attitude control in this discipline. No
        // keyboard pulse, touch activation or pad input can arm equipment.
        for (let slot = 1; slot <= EQUIPMENT_CONTROLS.length; slot++)
          i[`equipment${slot}`] = false;
      }
      // Equipment taps survive observation and frames without a physics tick.
      return i;
    },
    bindTouch(root) {
      touch.bind(root);
    },
    dispose() {
      clear();
      abort.abort();
    },
  };
}
