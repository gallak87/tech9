import { sampleNacreWater } from './environment/atmosphere.js';

// Absorption covers nearby emissive rails, the craft and the HUD as well as
// distant fogged scenery. One CSS composite works on both rendering qualities.
export function createNacreImmersion(host) {
  const layer = document.createElement('div');
  layer.className = 'nacre-immersion';
  layer.setAttribute('aria-hidden', 'true');
  const flash = document.createElement('div');
  flash.className = 'nacre-storm-flash';
  flash.setAttribute('aria-hidden', 'true');
  host.append(layer, flash);
  let state = { submerged: 0, depth: 0, opacity: 0 };
  return {
    update(cameraY, waterY, enabled) {
      const water = sampleNacreWater(cameraY, waterY);
      const opacity = enabled
        ? water.submerged * (0.38 + Math.min(water.depth / 90, 1) * 0.12)
        : 0;
      state = {
        submerged: enabled ? water.submerged : 0,
        depth: water.depth,
        opacity,
      };
      layer.style.opacity = String(opacity);
    },
    updateStorm(presentation) {
      state.flash = Math.max(
        0,
        Math.min(0.08, presentation?.lightningFlash ?? 0),
      );
      flash.style.opacity = String(state.flash);
    },
    getPresentation: () => ({ ...state }),
    dispose() {
      layer.remove();
      flash.remove();
    },
  };
}
