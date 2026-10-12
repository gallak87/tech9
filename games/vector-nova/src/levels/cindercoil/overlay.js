import { sampleCindercoilEvent, sampleSurge, surgeAt } from './mechanics.js';
import { sampleCindercoilAtmosphere } from './atmosphere.js';

export function createCindercoilOverlay({ host, track }) {
  host.classList.add('cindercoil-overlay-host');
  const style = document.createElement('style');
  style.textContent = `.cindercoil-overlay-host #interface.whole-route-view #title-panel{overflow-y:auto}@media(min-width:1100px){.cindercoil-overlay-host #interface.driving #shape-controls:has(#review-toggle[aria-expanded="false"]){width:180px;padding:8px;background:rgba(14,29,39,.55)}}`;
  host.append(style);
  const peripheral = document.createElement('canvas');
  peripheral.className = 'cindercoil-exposure';
  peripheral.setAttribute('aria-hidden', 'true');
  Object.assign(peripheral.style, {
    position: 'absolute',
    inset: '0',
    width: '100%',
    height: '100%',
    pointerEvents: 'none',
    zIndex: '2',
  });
  host.append(peripheral);
  const ink = peripheral.getContext('2d');
  let presentation = {};
  return {
    update({ state, time, mode, reviewing, settings = {} }) {
      const width = host.clientWidth || globalThis.innerWidth;
      const height = host.clientHeight || globalThis.innerHeight;
      const distance =
        ((state.distance % track.length) + track.length) % track.length;
      const local = surgeAt(track, state);
      const upcoming = (track.surgeZones ?? []).find(
        (zone) => zone.start > distance && zone.start - distance < 110,
      );
      const zone = local?.zone ?? upcoming;
      const cue = zone ? sampleSurge(time, zone) : null;
      const event = sampleCindercoilEvent(time);
      const reviewOpen =
        host.querySelector('#review-toggle')?.getAttribute('aria-expanded') ===
        'true';
      const atmosphere = sampleCindercoilAtmosphere(track, state);
      const show =
        !reviewing && !reviewOpen && ['racing', 'paused'].includes(mode);
      if (peripheral.width !== width || peripheral.height !== height) {
        peripheral.width = width;
        peripheral.height = height;
      }
      ink.clearRect(0, 0, width, height);
      if (show && !settings.reducedMotion) {
        for (let i = 0; i < (settings.quality === 'low' ? 10 : 24); i++) {
          const phase = (i * 0.61803398875 + time * 0.018) % 1;
          const x =
            (i % 2
              ? 0.91 + 0.08 * Math.sin(i * 7)
              : 0.09 + 0.08 * Math.sin(i * 7)) * width;
          const y = phase * height;
          ink.strokeStyle = `rgba(183,194,206,${atmosphere.ash * 0.13})`;
          ink.beginPath();
          ink.moveTo(x, y);
          ink.lineTo(x + 2 + atmosphere.hot * Math.sin(time + i) * 3, y + 3);
          ink.stroke();
        }
      }
      if (show && atmosphere.contact) {
        const heat = ink.createLinearGradient(0, 0, width, 0);
        heat.addColorStop(0, 'rgba(236,109,44,.07)');
        heat.addColorStop(0.15, 'transparent');
        heat.addColorStop(0.85, 'transparent');
        heat.addColorStop(1, 'rgba(236,109,44,.07)');
        ink.fillStyle = heat;
        ink.fillRect(0, 0, width, height);
      }
      presentation = {
        event,
        surge: cue,
        contact: local?.contact ?? false,
        atmosphere,
      };
    },
    getPresentation: () => ({ cindercoil: presentation }),
    dispose() {
      style.remove();
      host.classList.remove('cindercoil-overlay-host');
      peripheral.remove();
    },
  };
}
