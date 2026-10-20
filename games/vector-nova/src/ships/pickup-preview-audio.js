import { createPickupAudio } from '../pickups/audio.js';

const clamp = (value) =>
  Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));

// One private context for synthesized cues and the candidate. Nothing touches
// the retained race's buses. Decoding completes before the caller starts VFX.
export function createPickupPreviewAudio({
  candidateURL,
  createContext = () => new AudioContext(),
  createAudio = createPickupAudio,
  fetchAudio = (url, options) => fetch(url, options),
} = {}) {
  let context, output, candidate, source, loading;
  let disposed = false;
  const requests = new AbortController();
  const getContext = () => {
    if (!context || context.state === 'closed') {
      output?.disconnect();
      context = createContext();
      output = context.createGain();
      output.gain.value = 0;
      output.connect(context.destination);
    }
    return context;
  };
  const audio = createAudio({ createContext: getContext });
  function stop() {
    if (source) {
      source.onended = null;
      source.stop();
      source.disconnect();
      source = null;
    }
    audio.silence();
  }
  return {
    async prepare(kind) {
      if (disposed) throw new Error('Preview closed');
      if (!(await audio.unlock())) throw new Error('Audio unavailable');
      if (kind === 'arc' && !candidate) {
        loading ??= (async () => {
          const response = await fetchAudio(candidateURL, {
            signal: requests.signal,
          });
          if (!response.ok) throw new Error('Could not load Arc activation');
          const bytes = await response.arrayBuffer();
          if (disposed) throw new Error('Preview closed');
          return getContext().decodeAudioData(bytes);
        })().finally(() => {
          loading = null;
        });
        candidate = await loading;
      }
      if (disposed) throw new Error('Preview closed');
      return kind === 'arc' ? candidate.duration : 0;
    },
    update(settings, active) {
      if (disposed) return;
      audio.update(settings, active);
      if (output)
        output.gain.setTargetAtTime(
          active && !settings.muted ? clamp(settings.volume) : 0,
          context.currentTime,
          0.01,
        );
    },
    setEffects: (effects) => audio.setEffects(effects),
    event(event) {
      if (disposed) return;
      if (event.type !== 'pickup-activate' || event.payload.kind !== 'arc') {
        audio.event(event);
        return;
      }
      if (!candidate) return;
      source = context.createBufferSource();
      source.buffer = candidate;
      source.connect(output);
      const current = source;
      current.onended = () => {
        current.disconnect();
        if (source === current) source = null;
      };
      source.start();
    },
    stop,
    dispose() {
      if (disposed) return;
      disposed = true;
      requests.abort();
      stop();
      output?.disconnect();
      void audio.dispose();
    },
  };
}
