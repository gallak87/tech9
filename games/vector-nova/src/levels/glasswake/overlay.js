import { glasswakeFlightState } from './runtime.js';
import { surfaceAt } from './surface.js';
import { sampleCalvingState } from './environment/event.js';
import { sampleFirstShelf } from './environment/first-shelf.js';
import { createGlasswakeScreen } from './weather/screen.js';

export function createGlasswakeOverlay({ host, track }) {
  const screen = createGlasswakeScreen({ host, track });
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
    update(frame) {
      const { state, mode } = frame;
      screen.update(frame);
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
      const calving = sampleCalvingState(
        track,
        state,
        frame.ship?.group?.position,
      );
      const firstShelf = sampleFirstShelf(flight.openingShelf);
      const calvingCue =
        firstShelf.phase === 'cracking'
          ? ' · ICE SHEET CRACKING'
          : firstShelf.phase === 'falling'
            ? ' · ICE SHEET FALLING'
            : calving.phase === 'cracking'
              ? ' · ICE SHELF FRACTURING'
              : calving.phase === 'separating'
                ? ' · SHELF CALVING'
                : '';
      notice.textContent = text + calvingCue;
      const reviewOpen =
        host.querySelector('#review-toggle')?.getAttribute('aria-expanded') ===
        'true';
      notice.style.display =
        !reviewOpen && ['racing', 'paused'].includes(mode) ? 'block' : 'none';
      const width = globalThis.innerWidth ?? 1280;
      const heightPx = globalThis.innerHeight ?? 720;
      const portrait = width < 600 && heightPx > width;
      const shortLandscape = heightPx < 500;
      notice.style.top = portrait ? '276px' : shortLandscape ? '148px' : 'auto';
      notice.style.bottom = portrait || shortLandscape ? 'auto' : '108px';
      notice.style.maxWidth = shortLandscape
        ? 'min(280px, calc(100% - 420px))'
        : 'calc(100% - 40px)';
      notice.style.fontSize = heightPx < 500 ? '9px' : '11px';
      notice.style.borderColor = gap
        ? '#ffe0a6'
        : surface.grip < 1
          ? '#ecf8ff'
          : '#639abb';
      presentation = {
        glasswake: {
          weather: screen.snapshot(),
          surface,
          flightMode: flight.mode,
          firstShelf,
          calving: sampleCalvingState(
            track,
            state,
            frame.ship?.group?.position,
          ),
          nextFracture: gap?.id ?? null,
          distanceToFracture: near,
          message: text,
        },
      };
    },
    getPresentation: () => presentation,
    reset() {
      screen.reset();
      presentation = {};
      notice.style.display = 'none';
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      screen.dispose();
      notice.remove();
    },
  };
}
