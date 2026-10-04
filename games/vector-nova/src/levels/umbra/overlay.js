import { tidalResponse } from './track/forces.js';

export function createUmbraOverlay({ host, track, view }) {
  const style = document.createElement('style');
  style.textContent = `
    .umbra-field { position:absolute; left:50%; top:108px; transform:translateX(-50%); z-index:4; pointer-events:none; color:#f0d6a4; background:rgba(10,17,25,.84); border:1px solid #8c744e; border-radius:3px; padding:6px 12px; font:600 10px/1.5 monospace; letter-spacing:.12em; white-space:nowrap; }
    .umbra-field[hidden] { display:none; }
    @media(max-width:600px) { .umbra-field { top:130px; font-size:9px; padding:5px 8px; } }
    @media(max-height:450px) { .umbra-field { top:73px; font-size:8px; padding:4px 8px; } }
  `;
  const field = document.createElement('div');
  field.className = 'umbra-field';
  field.hidden = true;
  host.append(style, field);
  let current = null;
  return {
    update({ state, mode, reviewing }) {
      current = tidalResponse(track, state.distance, state.lateral);
      field.hidden =
        reviewing || !['racing', 'paused'].includes(mode) || !current.active;
      const direction = current.lateralAcceleration >= 0 ? 'LEFT' : 'RIGHT';
      field.textContent = `PULL ${direction} · COUNTERSTEER ${direction === 'LEFT' ? 'RIGHT' : 'LEFT'} · ${Math.abs(current.lateralAcceleration).toFixed(1)} m/s²`;
    },
    reset() {
      current = null;
      field.hidden = true;
    },
    getPresentation() {
      return {
        umbra: {
          tidal: current,
          accretion:
            view.scene
              .getObjectByName('umbra-environment')
              ?.userData.getUmbraPresentation?.() ?? null,
        },
      };
    },
    dispose() {
      field.remove();
      style.remove();
    },
  };
}
