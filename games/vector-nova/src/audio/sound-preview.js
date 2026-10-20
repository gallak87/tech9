import { createAudio } from './index.js';
import { createPickupAudio } from '../pickups/audio.js';
import { createGlasswakeShelfAudio } from '../levels/glasswake/audio.js';
import { soundEffects } from './sounds.js';

// Dedicated owners let the menu audition real cues without emitting gameplay
// events or changing a running race's audio state. Each preview releases its
// contexts when it finishes, is replaced, or the page becomes hidden.
export function createSoundPreview({
  getSettings = () => ({ volume: 0.35 }),
  onStatus = () => {},
  createRaceAudio = createAudio,
  createDeviceAudio = createPickupAudio,
  schedule = setTimeout,
  cancel = clearTimeout,
} = {}) {
  let current;
  let timer;
  let disposed = false;

  function stop() {
    cancel(timer);
    timer = undefined;
    const previous = current;
    current = undefined;
    if (previous) void previous.audio.dispose().catch(() => {});
    onStatus('Ready');
  }

  function configure() {
    if (!current) return false;
    const settings = getSettings();
    if (settings.muted || !(settings.volume > 0)) {
      stop();
      onStatus('Effects muted');
      return false;
    }
    const { sound, audio } = current;
    if (sound.bus === 'devices') audio.update(settings, true);
    else {
      audio.setImmersion(sound.submerged ?? 0);
      audio.update(sound.state ?? {}, settings.volume, true);
    }
    return true;
  }

  return {
    async play(id) {
      if (disposed) return false;
      const sound = soundEffects.find((entry) => entry.id === id);
      if (!sound) return false;
      stop();
      const audio =
        sound.bus === 'devices'
          ? createDeviceAudio()
          : createRaceAudio({
              engine: Boolean(sound.state),
              nacre: sound.event?.type === 'nacre-thunder',
              environment:
                sound.event?.type === 'glasswake-shelf'
                  ? createGlasswakeShelfAudio
                  : undefined,
              immersion: Boolean(sound.submerged),
            });
      const preview = { sound, audio };
      current = preview;
      onStatus('Loading');
      const unlocked = await audio.unlock();
      if (disposed || current !== preview) return false;
      if (!unlocked) {
        stop();
        onStatus('Audio unavailable');
        return false;
      }
      if (!configure()) return false;
      if (sound.effects) audio.setEffects(sound.effects);
      if (sound.event) audio.event(sound.event);
      onStatus('Playing');
      timer = schedule(() => {
        if (current === preview) stop();
      }, sound.seconds * 1000);
      return true;
    },
    configure,
    stop,
    dispose() {
      if (disposed) return;
      disposed = true;
      stop();
    },
  };
}
