import { tidalResponse } from './track/forces.js';
import { createUmbraLensing, sampleUmbraLens } from './lensing.js';

export function createUmbraOverlay({ host, track, view, shape = false }) {
  const lens = shape ? null : createUmbraLensing(view);
  host.classList.add('umbra-layout');
  const style = document.createElement('style');
  style.textContent = `
    .umbra-pull { position:absolute; z-index:4; pointer-events:none; color:#ffe3ac; transform-origin:center; filter:drop-shadow(0 1px 3px #000b); }
    .umbra-pull[hidden] { display:none; }
    .umbra-pull svg { display:block; width:100%; height:100%; overflow:visible; }
    .umbra-pull path { fill:none; stroke:currentColor; stroke-linecap:round; stroke-linejoin:round; }
    .umbra-pull .orbit { stroke-width:1; opacity:.22; }
    .umbra-pull .pressure { stroke-width:2.3; }
    .umbra-pull .arrows { stroke-width:2.4; }
    @media(max-height:450px) {
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
  field.className = 'umbra-pull';
  field.setAttribute('role', 'img');
  field.innerHTML = `<svg viewBox="0 0 184 184" aria-hidden="true"><path class="orbit" d="M128 27 A74 74 0 0 1 128 157"/><path class="pressure" pathLength="1" d="M128 27 A74 74 0 0 1 128 157"/><path class="arrows" d="m159 84 9 8-9 8m10-16 9 8-9 8"/></svg>`;
  const pressure = field.querySelector('.pressure');
  field.hidden = true;
  host.append(style, field);
  let current = null;
  let lensing = { active: false, intensity: 0 };
  return {
    update(frame) {
      current = tidalResponse(track, frame.state.distance, frame.state.lateral);
      const width = innerWidth,
        height = innerHeight;
      lensing = shape
        ? { active: false, intensity: 0 }
        : sampleUmbraLens(track, frame, width, height);
      lens?.update(lensing, width, height);
      field.hidden = !lensing.active;
      if (!lensing.active) return;
      const [x, y] = lensing.center;
      const [dx, dy] = lensing.direction;
      const size = lensing.radius * 2.35;
      field.style.left = `${x * width - size / 2}px`;
      field.style.top = `${(1 - y) * height - size / 2}px`;
      field.style.width = field.style.height = `${size}px`;
      field.style.transform = `rotate(${-Math.atan2(dy, dx)}rad)`;
      field.style.opacity = String(0.25 + lensing.intensity * 0.65);
      pressure.style.strokeDasharray = `${lensing.intensity} 1`;
      field.setAttribute(
        'aria-label',
        `Gravity pulling ${dx < 0 ? 'left' : 'right'}`,
      );
    },
    reset() {
      current = null;
      field.hidden = true;
      lensing = { active: false, intensity: 0 };
      lens?.reset();
    },
    getPresentation() {
      return {
        umbra: {
          tidal: current,
          lensing,
          accretion:
            view.scene
              .getObjectByName('umbra-environment')
              ?.userData.getUmbraPresentation?.() ?? null,
        },
      };
    },
    dispose() {
      lens?.dispose();
      host.classList.remove('umbra-layout');
      field.remove();
      style.remove();
    },
  };
}
