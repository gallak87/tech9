import { createMenuBackdrop } from './menu-backdrop.js';

const PLAYER_SHIPS = new Set(['kestrel', 'shrike', 'bastion', 'needle']);

// This asset-light owner is mounted before the cinematic chunk is requested.
// Playback may attach later, but loading, failures and credits keep one dialog,
// backdrop and focus lifetime. Progression alone owns acknowledgement on Close.
export function createCompletionOverlay({
  host,
  shipId = 'kestrel',
  settings = {},
  onClose = () => {},
  onState,
  signal,
} = {}) {
  shipId = PLAYER_SHIPS.has(shipId) ? shipId : 'kestrel';
  const life = new AbortController();
  const previousFocus = document.activeElement;
  const readSettings = () =>
    typeof settings === 'function' ? settings() : settings;
  const reduced = () =>
    Boolean(
      readSettings()?.reducedMotion ||
      matchMedia('(prefers-reduced-motion: reduce)').matches,
    );
  const element = document.createElement('section');
  element.className = 'completion-cinematic';
  element.dataset.phase = 'loading';
  element.dataset.stageReady = 'false';
  element.dataset.reducedMotion = String(reduced());
  element.setAttribute('role', 'dialog');
  element.setAttribute('aria-modal', 'true');
  element.setAttribute('aria-label', 'Career collection complete');
  element.setAttribute(
    'aria-description',
    'Your racer takes Shatterline’s last jump, crosses the finish, and drifts to a stop. Skip leads to the completion credits.',
  );
  element.innerHTML = `
    <div class="completion-stage"></div>
    <div class="completion-letterbox" aria-hidden="true"></div>
    <div class="completion-wordmark menu-wordmark" aria-hidden="true">VECTOR<span>//</span>NOVA</div>
    <button type="button" class="completion-skip" data-completion-skip>Skip cinematic <span aria-hidden="true">↗</span></button>
    <div class="completion-loading menu-card" role="status" aria-live="polite">
      <span class="kicker">37 / 37 · CAREER COMPLETE</span>
      <h1>Loading…</h1>
      <div class="transfer-status"><progress max="1" value="0" aria-label="Loading"></progress></div>
      <span class="completion-progress" aria-hidden="true">0%</span>
    </div>
    <div class="completion-credits" hidden>
      <div class="completion-card menu-card">
        <div class="completion-medal" aria-hidden="true"><i></i><b>V</b><i></i></div>
        <span class="kicker">THE NEXT CHAPTER</span>
        <h1 id="completion-thanks">Thx for playing, 3 Encore courses unlocked!</h1>
        <p class="completion-next">Oriel <span>·</span> Ravel <span>·</span> Nomad</p>
        <div class="completion-credit-lines">
          <p><span class="kicker">DEV</span><strong>George Allakhverdyan</strong><small>Studio name TBD</small></p>
          <p><span class="kicker">HOMIES WHO HELPED TEST THE GAME</span><strong>Noyan Gunday</strong></p>
        </div>
        <p class="completion-error" role="alert" hidden>The cinematic couldn’t load. Your unlocks are still available.</p>
        <button type="button" class="completion-retry" data-completion-retry hidden>Reload and retry</button>
        <button type="button" class="completion-close" data-completion-close>Close <span aria-hidden="true">↗</span></button>
      </div>
    </div>`;
  const stageHost = element.querySelector('.completion-stage');
  const loading = element.querySelector('.completion-loading');
  const credits = element.querySelector('.completion-credits');
  const skip = element.querySelector('[data-completion-skip]');
  const close = element.querySelector('[data-completion-close]');
  const retry = element.querySelector('[data-completion-retry]');
  const errorNotice = element.querySelector('.completion-error');
  const progressBar = element.querySelector('progress');
  const progressText = element.querySelector('.completion-progress');
  host.append(element);
  const backdrop = createMenuBackdrop(life.signal);
  backdrop.mount(element);
  let phase = 'loading',
    progress = 0,
    error = null,
    stageReady = false;
  let playback = null,
    closed = false;
  const snapshot = () => ({
    ...playback?.snapshot(),
    phase,
    progress,
    shipId,
    error,
  });
  const announce = () => onState?.(snapshot());
  const focus = (control) => {
    control.focus({ preventScroll: true });
    if (phase === 'credits')
      control.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  };
  const syncBackdrop = () =>
    backdrop.configure({
      active: !stageReady && phase !== 'disposed',
      reducedMotion: reduced(),
    });
  function dispose() {
    if (phase === 'disposed') return;
    phase = 'disposed';
    life.abort();
    playback?.dispose();
    playback = null;
    element.remove();
    signal?.removeEventListener('abort', dispose);
    if (previousFocus?.isConnected && !previousFocus.closest('[inert]'))
      previousFocus.focus({ preventScroll: true });
    announce();
  }
  function setProgress(value) {
    if (phase === 'disposed') return;
    progress = Math.max(progress, Math.min(1, value));
    progressBar.value = progress;
    progressText.textContent = `${Math.round(progress * 100)}%`;
    announce();
  }
  function showCredits({ fade = false, error: failure } = {}) {
    if (phase === 'disposed') return;
    if (failure !== undefined) error = failure?.message ?? String(failure);
    const entering = phase !== 'credits';
    phase = 'credits';
    element.dataset.phase = phase;
    element.dataset.reducedMotion = String(reduced());
    element.dataset.creditsTransition = fade && !reduced() ? 'fade' : 'instant';
    element.setAttribute('aria-labelledby', 'completion-thanks');
    errorNotice.hidden = retry.hidden = !error;
    loading.hidden = skip.hidden = true;
    credits.hidden = false;
    syncBackdrop();
    if (entering) focus(close);
    announce();
  }
  function finish() {
    if (phase === 'disposed' || phase === 'credits') return;
    if (playback) playback.finish();
    else showCredits();
  }
  function closeCredits() {
    if (closed || phase !== 'credits') return;
    closed = true;
    dispose();
    onClose();
  }
  skip.addEventListener('click', finish, { signal: life.signal });
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
        else finish();
      } else if (event.key === 'Tab') {
        const controls =
          phase === 'credits' ? (error ? [retry, close] : [close]) : [skip];
        const index = controls.indexOf(document.activeElement);
        event.preventDefault();
        focus(
          controls[
            (index + (event.shiftKey ? -1 : 1) + controls.length) %
              controls.length
          ],
        );
      }
    },
    { signal: life.signal },
  );
  signal?.addEventListener('abort', dispose, { once: true });
  syncBackdrop();
  if (signal?.aborted) dispose();
  else skip.focus({ preventScroll: true });
  return {
    element,
    stageHost,
    shipId,
    signal: life.signal,
    reduced,
    snapshot,
    dispose,
    get phase() {
      return phase;
    },
    setProgress,
    showCredits,
    finish,
    attachPlayback(value) {
      if (phase === 'disposed') value.dispose();
      else playback = value;
    },
    setStageReady(value) {
      if (phase === 'disposed') return;
      stageReady = Boolean(value);
      element.dataset.stageReady = String(stageReady);
      syncBackdrop();
    },
    play() {
      if (phase === 'disposed' || phase === 'credits') return false;
      phase = 'playing';
      element.dataset.phase = phase;
      loading.hidden = true;
      announce();
      return true;
    },
  };
}
