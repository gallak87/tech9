import './completion-cinematic.css';
import { createMenuBackdrop } from './menu-backdrop.js';
import { createCompletionStage } from './completion-stage.js';
import { createCompletionAudio } from './completion-audio.js';
import { COMPLETION_DURATION } from './completion-timeline.js';

const PLAYER_SHIPS = new Set(['kestrel', 'shrike', 'bastion', 'needle']);

// Progression owns eligibility and acknowledgement. This view owns only the
// film, its resources, and the explicit Close action at the end.
export function createCompletionCinematic({
  host,
  shipId = 'kestrel',
  settings = {},
  onClose = () => {},
  signal,
  onState,
} = {}) {
  shipId = PLAYER_SHIPS.has(shipId) ? shipId : 'kestrel';
  const readSettings = () =>
    typeof settings === 'function' ? settings() : settings;
  const reduced = () =>
    Boolean(
      readSettings()?.reducedMotion ||
      matchMedia('(prefers-reduced-motion: reduce)').matches,
    );
  const previousFocus = document.activeElement;
  const life = new AbortController();
  const element = document.createElement('section');
  element.className = 'completion-cinematic';
  element.dataset.phase = 'loading';
  element.dataset.stageReady = 'false';
  element.setAttribute('role', 'dialog');
  element.setAttribute('aria-modal', 'true');
  element.setAttribute('aria-label', 'Career complete');
  element.setAttribute(
    'aria-description',
    'An actual Shatterline run with your racer: the last jump, a real landing, and the course finish. Skip leads to the completion credits.',
  );
  element.innerHTML = `
    <div class="completion-stage"></div>
    <div class="completion-letterbox" aria-hidden="true"></div>
    <div class="completion-wordmark" aria-hidden="true">VECTOR<span>//</span>NOVA</div>
    <button type="button" class="completion-skip" data-completion-skip>Skip cinematic <span aria-hidden="true">↗</span></button>
    <div class="completion-loading" role="status" aria-live="polite">
      <span class="completion-eyebrow">28 / 28 · CAREER COMPLETE</span>
      <h1>Loading…</h1>
      <progress max="1" value="0" aria-label="Loading"></progress>
      <span class="completion-progress" aria-hidden="true">0%</span>
    </div>
    <div class="completion-title" aria-hidden="true"><span>28 / 28 · CAREER COMPLETE</span><strong>THE CIRCUIT<br>IS YOURS.</strong></div>
    <div class="completion-credits" hidden>
      <div class="completion-card">
        <div class="completion-medal" aria-hidden="true"><i></i><b>V</b><i></i></div>
        <span class="completion-eyebrow">THE NEXT CHAPTER</span>
        <h1 id="completion-thanks">Thx for playing, 3 new courses unlocked!</h1>
        <p class="completion-next">Ravel <span>·</span> Nomad <span>·</span> Oriel</p>
        <div class="completion-credit-lines">
          <p><span>DEV</span><strong>George Allakhverdyan</strong><small>Studio name TBD</small></p>
          <p><span>HOMIES WHO HELPED TEST THE GAME</span><strong>Noyan Gunday</strong></p>
        </div>
        <p class="completion-error" role="alert" hidden>The cinematic couldn’t load. Your unlocks are still available.</p>
        <button type="button" class="completion-retry" data-completion-retry hidden>Reload and retry</button>
        <button type="button" class="primary completion-close" data-completion-close>Close <span aria-hidden="true">↗</span></button>
      </div>
    </div>`;
  const stageHost = element.querySelector('.completion-stage');
  const loading = element.querySelector('.completion-loading');
  const credits = element.querySelector('.completion-credits');
  const skip = element.querySelector('[data-completion-skip]');
  const close = element.querySelector('[data-completion-close]');
  const retry = element.querySelector('[data-completion-retry]');
  const errorNotice = element.querySelector('.completion-error');
  const title = element.querySelector('.completion-title');
  const progressBar = element.querySelector('progress');
  const progressText = element.querySelector('.completion-progress');
  host.append(element);
  const backdrop = createMenuBackdrop(life.signal);
  backdrop.mount(element);
  backdrop.configure({ active: true, reducedMotion: reduced() });
  let phase = 'loading',
    progress = 0,
    time = 0,
    error = null;
  let stage,
    audio,
    frame = 0,
    last = 0,
    blurred = false,
    closed = false;
  const snapshot = () => ({
    phase,
    progress,
    time,
    shipId,
    error,
    ...(stage ? { rendering: stage.metrics() } : {}),
  });
  const announce = () => onState?.(snapshot());
  function setProgress(value) {
    if (phase === 'disposed') return;
    progress = Math.max(progress, Math.min(1, value));
    progressBar.value = progress;
    progressText.textContent = `${Math.round(progress * 100)}%`;
    announce();
  }
  function stopFrame() {
    cancelAnimationFrame(frame);
    frame = 0;
    last = 0;
  }
  function showFailure() {
    errorNotice.hidden = retry.hidden = !error;
  }
  function dispose() {
    if (phase === 'disposed') return;
    phase = 'disposed';
    stopFrame();
    life.abort();
    stage?.dispose();
    audio?.dispose();
    element.remove();
    signal?.removeEventListener('abort', dispose);
    if (previousFocus?.isConnected && !previousFocus.closest('[inert]'))
      previousFocus.focus({ preventScroll: true });
    announce();
  }
  function showCredits() {
    if (phase === 'disposed' || phase === 'credits') return;
    phase = 'credits';
    element.dataset.phase = phase;
    element.setAttribute('aria-labelledby', 'completion-thanks');
    stopFrame();
    time = COMPLETION_DURATION;
    try {
      stage?.draw(time, true);
    } catch (failure) {
      error = failure?.message ?? 'Finale unavailable';
      stage?.dispose();
      stage = null;
      element.dataset.stageReady = 'false';
      backdrop.configure({ active: true, reducedMotion: reduced() });
    }
    showFailure();
    audio?.pause();
    loading.hidden = skip.hidden = true;
    credits.hidden = false;
    title.style.opacity = '0';
    close.focus({ preventScroll: true });
    announce();
  }
  function closeCredits() {
    if (closed || phase !== 'credits') return;
    closed = true;
    dispose();
    onClose();
  }
  function fail(failure) {
    if (phase === 'disposed') return;
    error = failure?.message ?? 'Finale unavailable';
    stage?.dispose();
    stage = null;
    element.dataset.stageReady = 'false';
    backdrop.configure({ active: true, reducedMotion: reduced() });
    showFailure();
    showCredits();
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
    if (time >= COMPLETION_DURATION) {
      showCredits();
      return;
    }
    try {
      const sample = stage.draw(time);
      audio?.update(sample);
      title.style.opacity = sample.title;
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
  skip.addEventListener('click', showCredits, { signal: life.signal });
  close.addEventListener('click', closeCredits, { signal: life.signal });
  retry.addEventListener('click', () => location.reload(), {
    signal: life.signal,
  });
  element.addEventListener(
    'keydown',
    (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        if (phase === 'credits') closeCredits();
        else showCredits();
      } else if (event.key === 'Tab') {
        const controls =
          phase === 'credits' ? (error ? [retry, close] : [close]) : [skip];
        const index = controls.indexOf(document.activeElement);
        const control =
          controls[
            (index + (event.shiftKey ? -1 : 1) + controls.length) %
              controls.length
          ];
        event.preventDefault();
        control.focus({ preventScroll: true });
      }
    },
    { signal: life.signal },
  );
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
  skip.focus({ preventScroll: true });
  signal?.addEventListener('abort', dispose, { once: true });
  const ready = (async () => {
    if (signal?.aborted) {
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
      element.dataset.stageReady = 'true';
      setProgress(1);
      backdrop.configure({ active: false, reducedMotion: reduced() });
      loading.hidden = true;
      if (phase === 'credits' || reduced()) {
        if (phase === 'credits') stage.draw(COMPLETION_DURATION, true);
        else showCredits();
      } else {
        phase = 'playing';
        element.dataset.phase = phase;
        announce();
        syncPlayback();
      }
    } catch (failure) {
      fail(failure);
    }
    return snapshot();
  })();
  return { element, ready, dispose, snapshot, finish: showCredits };
}
