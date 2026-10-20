// One decoded source per authored cue. Missing files stay missing: never replace
// an approved sound with a different synthesizer or replay it after loading.
export function createSampleBank(
  context,
  samples,
  { fetchAudio = (url, options) => fetch(url, options) } = {},
) {
  const buffers = new Map();
  const requests = new AbortController();
  let pending;
  let disposed = false;
  return {
    prepare() {
      if (disposed || typeof context.decodeAudioData !== 'function')
        return Promise.resolve(false);
      pending ??= Promise.all(
        Object.entries(samples).map(async ([id, url]) => {
          if (buffers.has(id)) return true;
          try {
            const response = await fetchAudio(url, { signal: requests.signal });
            if (!response.ok || disposed) return false;
            const bytes = await response.arrayBuffer();
            if (disposed) return false;
            const buffer = await context.decodeAudioData(bytes);
            if (
              disposed ||
              !Number.isFinite(buffer.duration) ||
              buffer.duration <= 0 ||
              buffer.duration > 30
            )
              return false;
            buffers.set(id, buffer);
            return true;
          } catch {
            return false;
          }
        }),
      )
        .then((ready) => ready.every(Boolean))
        .finally(() => {
          pending = undefined;
        });
      return pending;
    },
    get: (id) => buffers.get(id),
    loaded: () => [...buffers.keys()],
    missing: () => Object.keys(samples).filter((id) => !buffers.has(id)),
    dispose() {
      disposed = true;
      requests.abort();
      buffers.clear();
    },
  };
}
