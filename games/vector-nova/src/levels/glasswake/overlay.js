import { glasswakeFlightState } from './runtime.js';
import { surfaceAt } from './surface.js';
import { sampleCalvingState } from './environment/event.js';

export function createGlasswakeOverlay({ host, track }) {
  const notice = document.createElement('div');
  notice.dataset.glasswakeNotice = '';
  notice.setAttribute('aria-live', 'polite');
  Object.assign(notice.style, {
    position: 'absolute',
    left: '50%',
    transform: 'translateX(-50%)',
    bottom: '116px',
    padding: '6px 12px',
    pointerEvents: 'none',
    background: 'rgba(6,19,43,.88)',
    border: '1px solid #639abb',
    color: '#dceffa',
    font: '600 11px system-ui',
    letterSpacing: '.06em',
    textAlign: 'center',
    maxWidth: 'calc(100% - 40px)',
    zIndex: '7',
  });
  host.appendChild(notice);
  let presentation = {};
  let disposed = false;
  return {
    update({ state, mode }) {
      if (disposed) return;
      const surface = surfaceAt(track, state.distance, state.lateral);
      const s = ((state.distance % track.length) + track.length) % track.length;
      const gap = track.jumps.find(
        (jump) => s >= jump.takeoff - 190 && s <= jump.takeoff + 0.01,
      );
      const flight = glasswakeFlightState(track);
      const airborne = flight.mode === 'flight';
      const near = gap ? Math.max(0, Math.ceil(gap.takeoff - s)) : null;
      const text =
        flight.mode === 'recovery'
          ? `MISSED FRACTURE · RECOVERY ${flight.flight.remaining.toFixed(1)}s`
          : airborne
            ? 'FRACTURE FLIGHT · HOLD YOUR LINE'
            : gap
              ? `FRACTURE ${near} m · ALIGN + SHIFT BOOST`
              : surface.grip < 1
                ? 'FROST · MORE DRIFT · CLEAR RIBS RESTORE GRIP'
                : 'CRYSTAL · MAGNETIC GRIP';
      notice.textContent = text;
      notice.style.display = ['racing', 'paused'].includes(mode)
        ? 'block'
        : 'none';
      const width = globalThis.innerWidth ?? 1280;
      const heightPx = globalThis.innerHeight ?? 720;
      notice.style.bottom =
        heightPx < 500 ? '65px' : width < 600 ? '142px' : '108px';
      notice.style.fontSize = heightPx < 500 ? '9px' : '11px';
      notice.style.borderColor = gap
        ? '#ffe0a6'
        : surface.grip < 1
          ? '#ecf8ff'
          : '#639abb';
      presentation = {
        glasswake: {
          surface,
          flightMode: flight.mode,
          calving: sampleCalvingState(track, state),
          nextFracture: gap?.id ?? null,
          distanceToFracture: near,
          message: text,
        },
      };
    },
    getPresentation: () => presentation,
    reset() {
      presentation = {};
      notice.style.display = 'none';
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      notice.remove();
    },
  };
}
