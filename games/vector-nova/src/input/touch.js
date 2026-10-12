const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const powerZones = ['boost', 'go', 'neutral', 'brake'];

// Each thumb owns its pad until release, even when dragged outside its bounds.
export function createTouchControls(signal, isEnabled) {
  const pads = [];

  function reset(pad) {
    const pointerId = pad.pointerId;
    pad.pointerId = null;
    pad.input = {};
    pad.element.dataset.active = 'false';
    pad.element.dataset.power = 'neutral';
    pad.element.dataset.airbrake = 'false';
    pad.element.style.removeProperty('--touch-x');
    pad.element.style.removeProperty('--touch-y');
    if (pointerId !== null && pad.element.hasPointerCapture(pointerId))
      pad.element.releasePointerCapture(pointerId);
  }

  function update(pad, event) {
    const rect = pad.element.getBoundingClientRect();
    if (!rect.width || !rect.height) return reset(pad);
    const x = clamp((event.clientX - rect.left) / rect.width, 0, 1);
    const y = clamp((event.clientY - rect.top) / rect.height, 0, 1);
    if (pad.kind === 'steer') {
      const axis = clamp((x - 0.5) / 0.36, -1, 1);
      const steer =
        Math.abs(axis) <= 0.12
          ? 0
          : (Math.sign(axis) * (Math.abs(axis) - 0.12)) / 0.88;
      pad.input = { steer, airbrake: y >= 0.7 };
      pad.element.dataset.airbrake = String(pad.input.airbrake);
      pad.element.style.setProperty('--touch-x', `${50 + steer * 36}%`);
      pad.element.style.setProperty(
        '--touch-y',
        `${clamp(y, 0.42, 0.8) * 100}%`,
      );
    } else {
      const zone = Math.min(3, Math.floor(y * 4));
      const power = powerZones[zone];
      pad.input = {
        throttle: power === 'go' || power === 'boost' ? 1 : 0,
        boost: power === 'boost',
        brake: power === 'brake' ? 1 : 0,
      };
      pad.element.dataset.power = power;
      pad.element.style.setProperty('--touch-y', `${zone * 25 + 12.5}%`);
    }
  }

  return {
    bind(root) {
      root.querySelectorAll('[data-touch-control]').forEach((element) => {
        const pad = {
          element,
          kind: element.dataset.touchControl,
          pointerId: null,
          input: {},
        };
        pads.push(pad);
        element.addEventListener('contextmenu', (e) => e.preventDefault(), {
          signal,
        });
        element.addEventListener(
          'pointerdown',
          (event) => {
            if (!isEnabled() || event.button !== 0) return;
            event.preventDefault();
            if (pad.pointerId !== null) return;
            pad.pointerId = event.pointerId;
            element.setPointerCapture(event.pointerId);
            element.dataset.active = 'true';
            update(pad, event);
          },
          { signal },
        );
        element.addEventListener(
          'pointermove',
          (event) => {
            if (pad.pointerId !== event.pointerId) return;
            event.preventDefault();
            update(pad, event);
          },
          { signal },
        );
        for (const kind of ['pointerup', 'pointercancel', 'lostpointercapture'])
          element.addEventListener(
            kind,
            (event) => {
              if (pad.pointerId === event.pointerId) reset(pad);
            },
            { signal },
          );
      });
    },
    clear() {
      pads.forEach(reset);
    },
    sample() {
      return Object.assign(
        { throttle: 0, brake: 0, steer: 0, boost: false, airbrake: false },
        ...pads.map((pad) => pad.input),
      );
    },
  };
}
