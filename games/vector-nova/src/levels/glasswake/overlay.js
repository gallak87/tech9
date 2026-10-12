import { glasswakeFlightState } from './runtime.js';
import { surfaceAt } from './surface.js';
import { sampleCalvingState } from './environment/event.js';
import { sampleFirstShelf } from './environment/first-shelf.js';
import { createGlasswakeScreen } from './weather/screen.js';

export function createGlasswakeOverlay({ host, track }) {
  const screen = createGlasswakeScreen({ host, track });
  let presentation = {};
  let disposed = false;
  return {
    update(frame) {
      const { state } = frame;
      screen.update(frame);
      if (disposed) return;
      const surface = surfaceAt(track, state.distance, state.lateral);
      const s = ((state.distance % track.length) + track.length) % track.length;
      const gap = track.jumps.find(
        (jump) => s >= jump.takeoff - 190 && s <= jump.takeoff + 0.01,
      );
      const flight = glasswakeFlightState(track);
      const near = gap ? Math.max(0, Math.ceil(gap.takeoff - s)) : null;
      const firstShelf = sampleFirstShelf(flight.openingShelf);
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
        },
      };
    },
    getPresentation: () => presentation,
    reset() {
      screen.reset();
      presentation = {};
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      screen.dispose();
    },
  };
}
