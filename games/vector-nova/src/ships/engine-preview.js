import { createAudio } from '../audio/index.js';
import { effectsVolume } from '../progression/index.js';

// Dev studio only. Reuse the race propulsion mix in a private audio owner.
export function createEnginePreview({
  getState,
  getSettings,
  createEngine = createAudio,
}) {
  let audio,
    enabled = false,
    foreground = true,
    ready = false,
    disposed = false;
  const active = (state) =>
    enabled && foreground && state.available && (state.driving || state.boost);

  function update() {
    if (disposed || !audio) return;
    const state = getState();
    const settings = getSettings();
    audio.update(
      {
        speed: state.driving ? 400 / 3.6 : 0,
        boosting: state.boost,
        steer: 0,
        time: state.time,
      },
      effectsVolume(settings),
      ready && active(state),
    );
  }

  async function changed() {
    update();
    if (disposed || !active(getState())) return;
    audio ??= createEngine();
    ready = await audio.unlock();
    update(); // Recheck current controls after a delayed browser resume.
  }

  return {
    update,
    changed,
    setEnabled(value) {
      enabled = value;
      void changed();
    },
    setForeground(value) {
      foreground = value;
      void changed();
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      void audio?.dispose();
    },
  };
}
