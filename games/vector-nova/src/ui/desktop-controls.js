// Narrow desktop window controls; browser builds do not mount this UI.
let fullscreen = false;
export function fullscreenSetting() {
  return `<label>Fullscreen <input type="checkbox" data-desktop-fullscreen ${fullscreen ? 'checked' : ''}></label>`;
}
export function bindDesktopControls(host, signal) {
  const desktop = window.vectorNovaDesktop;
  const toolbar = document.createElement('nav');
  toolbar.className = 'desktop-window-controls';
  toolbar.setAttribute('aria-label', 'Window controls');
  toolbar.innerHTML = `<button type="button" data-desktop-fullscreen aria-label="Enter fullscreen" title="Enter fullscreen" aria-pressed="false"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path class="fullscreen-enter" d="M9 3H3v6m12-6h6v6M3 15v6h6m12-6v6h-6"/><path class="fullscreen-exit" d="M3 9h6V3m12 6h-6V3M9 21v-6H3m12 6v-6h6"/></svg></button>`;
  function sync() {
    for (const control of host.querySelectorAll('[data-desktop-fullscreen]')) {
      if (control.type === 'checkbox') control.checked = fullscreen;
      else {
        const label = fullscreen ? 'Exit fullscreen' : 'Enter fullscreen';
        control.setAttribute('aria-label', label);
        control.setAttribute('aria-pressed', String(fullscreen));
        control.title = label;
      }
    }
  }
  const update = (value) => {
    if (signal.aborted) return;
    fullscreen = value === true;
    sync();
  };
  const unsubscribe = desktop.onFullscreenChange(update);
  void desktop.getFullscreen().then(update);
  host.addEventListener(
    'click',
    (event) => {
      if (event.target.closest('[data-desktop-fullscreen]'))
        desktop.toggleFullscreen();
    },
    { signal },
  );
  signal.addEventListener(
    'abort',
    () => {
      unsubscribe();
      toolbar.remove();
    },
    { once: true },
  );
  return {
    mount(root) {
      if (root) root.append(toolbar);
      else toolbar.remove();
      sync();
    },
  };
}
