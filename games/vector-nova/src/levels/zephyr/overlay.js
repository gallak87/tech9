import { wetnessForFrame, interiorAt } from './environment/atmosphere.js';
export function createZephyrOverlay({ host, track }) {
  const layer = document.createElement('div');
  layer.setAttribute('aria-hidden', 'true');
  Object.assign(layer.style, {
    position: 'absolute',
    inset: '0',
    pointerEvents: 'none',
    zIndex: '3',
    opacity: '0',
    mixBlendMode: 'screen',
    background:
      'linear-gradient(105deg, transparent 0%, rgba(170,216,232,.18) 3%, transparent 4%, transparent 14%, rgba(201,235,244,.12) 15%, transparent 16%, transparent 85%, rgba(187,228,240,.17) 86%, transparent 88%, transparent 96%, rgba(220,243,255,.14) 98%, transparent 100%)',
  });
  const drops = Array.from({ length: 10 }, (_, i) => {
    const drop = document.createElement('i');
    Object.assign(drop.style, {
      position: 'absolute',
      width: `${1 + (i % 3)}px`,
      height: `${8 + (i % 4) * 3}%`,
      left: `${[2, 7, 11, 17, 22, 79, 84, 89, 95, 98][i]}%`,
      background: 'linear-gradient(transparent,rgba(211,240,249,.32))',
      borderRadius: '50%',
      filter: 'blur(.5px)',
    });
    layer.append(drop);
    return drop;
  });
  host.append(layer);
  let presentation = { wetness: 0, interior: 0, towerFall: 0 };
  return {
    update(frame) {
      const enabled =
        !frame.reviewing && ['racing', 'paused'].includes(frame.mode);
      const wetness = enabled
        ? wetnessForFrame(track, frame.state.distance, frame.time)
        : 0;
      layer.style.opacity = String(
        wetness * (frame.settings.reducedMotion ? 0.4 : 1),
      );
      drops.forEach((drop, i) => {
        drop.style.top = `${((((frame.settings.reducedMotion ? 0 : frame.time) * 0.38 + i * 0.618) % 1.5) - 0.35) * 100}%`;
      });
      presentation = {
        wetness,
        interior: interiorAt(track, frame.state.distance),
      };
    },
    getPresentation: () => ({ ...presentation }),
    reset() {
      layer.style.opacity = '0';
    },
    dispose() {
      layer.remove();
    },
  };
}
