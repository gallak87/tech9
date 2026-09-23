// Never depend on a final background event for saving: normal action checkpoints
// remain authoritative; this adds a best-effort interruption checkpoint.
export function mountMobileLifecycle(game, canvas) {
  const abort = new AbortController();
  const panel = document.createElement('section');
  panel.id = 'resume-play';
  panel.hidden = true;
  panel.setAttribute('aria-label', 'Paused expedition');
  const label = document.createElement('p');
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'button primary';
  panel.append(label, button);
  document.querySelector('#game').append(panel);
  const clear = () => {
    game.keys.clear();
    game.touchControls?.clear();
    game.movePath = [];
    game.moving = false;
  };
  const suspend = () => {
    clear();
    if (game.mode === 'title') return;
    game.session.checkpoint({ includeBattle: true });
    game.audio.ctx?.suspend()?.catch(() => {});
    if (game.rendererLost) return;
    if (game.mobile?.enabled) {
      game.lifecyclePaused = true;
      label.textContent = 'Expedition paused';
      button.textContent = 'Resume';
      panel.hidden = false;
    } else if (
      !game.ui.menu &&
      !game.upgradeTour?.open &&
      !game.worldView?.open
    ) {
      game.ui.menu = true;
      game.ui.render();
    }
  };
  document.addEventListener(
    'visibilitychange',
    () => {
      if (document.hidden) suspend();
    },
    { signal: abort.signal },
  );
  window.addEventListener('pagehide', suspend, { signal: abort.signal });
  window.addEventListener('blur', clear, { signal: abort.signal });
  canvas.addEventListener(
    'webglcontextlost',
    (event) => {
      event.preventDefault();
      clear();
      game.session.checkpoint({ includeBattle: true });
      game.rendererLost = true;
      game.lifecyclePaused = true;
      label.textContent =
        'The graphics surface was interrupted. Your latest checkpoint is ready to continue after reloading.';
      button.textContent = 'Reload';
      panel.hidden = false;
    },
    { signal: abort.signal },
  );
  button.addEventListener(
    'click',
    () => {
      clear();
      if (game.rendererLost) {
        location.reload();
        return;
      }
      game.audio.unlock();
      game.lifecyclePaused = false;
      panel.hidden = true;
    },
    { signal: abort.signal },
  );
  return {
    dispose() {
      abort.abort();
      panel.remove();
    },
  };
}
