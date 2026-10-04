import { tidalResponse } from './track/forces.js';

export function createUmbraOverlay({ host, track, view }) {
  host.classList.add('umbra-layout');
  const style = document.createElement('style');
  style.textContent = `
    .umbra-field { position:absolute; left:50%; top:108px; transform:translateX(-50%); z-index:4; pointer-events:none; color:#f0d6a4; background:rgba(10,17,25,.84); border:1px solid #8c744e; border-radius:3px; padding:6px 12px; font:600 10px/1.5 monospace; letter-spacing:.12em; white-space:nowrap; }
    .umbra-field[hidden] { display:none; }
    @media(max-width:600px) { .umbra-field { top:370px; font-size:9px; padding:5px 8px; } }
    @media(max-height:450px) {
      .umbra-field { top:52px; font-size:7px; padding:4px 6px; }
      .umbra-layout #interface.driving .timing small { max-width:none; white-space:nowrap; font-size:7px; }
      .umbra-layout #interface.driving #notice { top:176px; bottom:auto; left:calc(50% + 30px); transform:translateX(-50%); width:min(260px,calc(100vw - 440px)); }
    }
    @media(max-height:450px) and (max-width:700px) {
      .umbra-layout #interface.driving #notice { top:146px; font-size:9px; letter-spacing:.04em; line-height:1.1; }
      .umbra-layout #interface.driving .telemetry { bottom:80px; }
      .umbra-layout #interface.driving .energy-track { margin:6px 0; }
      .umbra-layout #interface.driving .energy small { font-size:7px; }
      .umbra-layout #interface.driving .speed strong { font-size:42px; }
      .umbra-layout #interface #race-roster:not(.in-paddock) li,
      .umbra-layout #interface #race-roster:not(.in-paddock) li > b,
      .umbra-layout #interface #race-roster:not(.in-paddock) li > small { font-size:7px; }
      .umbra-layout #interface #race-roster:not(.in-paddock) li { padding-top:1px; padding-bottom:1px; margin-bottom:1px; }
    }
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
      host.classList.remove('umbra-layout');
      field.remove();
      style.remove();
    },
  };
}
