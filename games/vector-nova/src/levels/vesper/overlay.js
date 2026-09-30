import { sampleVesperSurface } from './surface.js';

export function createVesperOverlay({ host, track }) {
  const label = document.createElement('span');
  label.dataset.vesperSurface = '';
  label.style.cssText =
    'display:block;margin:0 0 7px;color:#ffcf86;font-size:9px;letter-spacing:.08em;text-shadow:0 1px 4px #000';
  let presentation = { surface: 'resin', drag: 0 };
  return {
    update({ state, mode }) {
      if (!label.isConnected) host.querySelector('.energy')?.prepend(label);
      const surface = sampleVesperSurface(track, state);
      presentation = {
        surface: surface.id,
        zone: surface.zone,
        drag: surface.drag,
      };
      label.textContent =
        surface.id === 'sap' ? 'FLOWING SAP · DRAG' : 'HARDENED RESIN';
      label.style.display = ['racing', 'paused'].includes(mode)
        ? 'block'
        : 'none';
      label.style.color = surface.id === 'sap' ? '#ffe1b3' : '#bed9c5';
    },
    getPresentation: () => ({ ...presentation }),
    dispose() {
      label.remove();
    },
  };
}
