import { createCompletionStage } from './completion-stage.js';
import { createCompletionAudio } from './completion-audio.js';
import { completionPlaybackTiming } from './completion-timeline.js';

// The eager overlay owns the dialog and its controls. This lazy owner supplies
// only the film, audio and their resource lifetime.
export function createCompletionCinematic({
  overlay,
  settings = {},
  onState,
} = {}) {
  const { element, stageHost, shipId, reduced } = overlay;
  const life = new AbortController();
  let phase = overlay.phase,
    time = 0,
    error = null;
  let stage,
    timing,
    audio,
    frame = 0,
    last = 0,
    blurred = false,
    disposed = false;
  const snapshot = () => ({
    phase,
    time,
    shipId,
    error,
    ...(timing ? { timing } : {}),
    ...(stage ? { rendering: stage.metrics() } : {}),
  });
  const announce = () => onState?.(snapshot());
  function setProgress(value) {
    if (phase !== 'disposed') overlay.setProgress(value);
  }
  function stopFrame() {
    cancelAnimationFrame(frame);
    frame = 0;
    last = 0;
  }
  function dispose() {
    if (disposed) return;
    disposed = true;
    phase = 'disposed';
    stopFrame();
    life.abort();
    stage?.dispose();
    audio?.dispose();
    overlay.signal.removeEventListener('abort', dispose);
    announce();
  }
  function showCredits({ fade = false } = {}) {
    if (phase === 'disposed' || phase === 'credits') return;
    phase = 'credits';
    stopFrame();
    time = timing?.creditsAt ?? time;
    try {
      stage?.draw(time, true);
    } catch (failure) {
      error = failure?.message ?? 'Finale unavailable';
      fade = false;
      stage?.dispose();
      stage = null;
      overlay.setStageReady(false);
    }
    audio?.pause();
    overlay.showCredits({ fade, ...(error ? { error } : {}) });
    announce();
  }
  function fail(failure) {
    if (phase === 'disposed') return;
    error = failure?.message ?? 'Finale unavailable';
    stage?.dispose();
    stage = null;
    overlay.setStageReady(false);
    stopFrame();
    phase = 'credits';
    audio?.pause();
    overlay.showCredits({ error });
    announce();
  }
  function tick(now) {
    frame = 0;
    if (phase !== 'playing' || document.hidden || blurred) return;
    if (reduced()) {
      showCredits();
      return;
    }
    if (last) time += Math.min((now - last) / 1000, 0.1);
    last = now;
    if (time >= timing.creditsAt) {
      showCredits({ fade: true });
      return;
    }
    try {
      const sample = stage.draw(time);
      audio?.update(sample);
      frame = requestAnimationFrame(tick);
    } catch (failure) {
      fail(failure);
    }
  }
  function syncPlayback() {
    stopFrame();
    if (document.hidden || blurred || phase !== 'playing') audio?.pause();
    else {
      audio?.resume();
      frame = requestAnimationFrame(tick);
    }
  }
  window.addEventListener(
    'blur',
    () => {
      blurred = true;
      syncPlayback();
    },
    { signal: life.signal },
  );
  window.addEventListener(
    'focus',
    () => {
      blurred = false;
      syncPlayback();
    },
    { signal: life.signal },
  );
  document.addEventListener('visibilitychange', syncPlayback, {
    signal: life.signal,
  });
  overlay.signal.addEventListener('abort', dispose, { once: true });
  const api = { ready: null, dispose, snapshot, finish: showCredits };
  overlay.attachPlayback(api);
  api.ready = (async () => {
    if (overlay.signal.aborted) {
      dispose();
      return snapshot();
    }
    try {
      if (!reduced() && phase !== 'credits')
        audio = createCompletionAudio(settings);
      stage = createCompletionStage({
        mount: stageHost,
        shipId,
        settings,
        signal: life.signal,
        onProgress: setProgress,
        onError: fail,
      });
      await Promise.race([
        stage.ready,
        new Promise((resolve) =>
          life.signal.addEventListener('abort', resolve, { once: true }),
        ),
      ]);
      if (phase === 'disposed') return snapshot();
      timing = completionPlaybackTiming(stage.metrics().replay);
      element.dataset.reducedMotion = String(reduced());
      element.style.setProperty(
        '--completion-dialog-fade',
        `${timing.dialogFadeSeconds}s`,
      );
      overlay.setStageReady(true);
      setProgress(1);
      if (phase === 'credits' || reduced()) {
        if (phase === 'credits') {
          time = timing.creditsAt;
          stage.draw(time, true);
        } else showCredits();
      } else {
        phase = 'playing';
        overlay.play();
        announce();
        syncPlayback();
      }
    } catch (failure) {
      fail(failure);
    }
    return snapshot();
  })();
  return api;
}
