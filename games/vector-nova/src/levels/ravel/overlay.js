import { RAVEL_PLAYTEST_CASES } from './runtime.js';

/** Section practice lives in the normal pause flow throughout greybox review. */
export function createRavelOverlay({ host, track }) {
  const document = host.ownerDocument;
  const browser = document.defaultView;
  const section = document.createElement('section');
  section.id = 'ravel-section-practice';
  section.className = 'pause-quick-settings';
  section.setAttribute('aria-label', 'Ravel section practice');
  const label = document.createElement('label');
  label.htmlFor = 'ravel-test-section';
  label.append('Test section');
  const select = document.createElement('select');
  select.id = 'ravel-test-section';
  select.style.width = '240px';
  select.style.maxWidth = '68%';
  for (const entry of RAVEL_PLAYTEST_CASES) {
    const option = document.createElement('option');
    option.value = entry.id;
    option.textContent = entry.label;
    select.append(option);
  }
  label.append(select);
  const drive = document.createElement('button');
  drive.id = 'ravel-drive-section';
  drive.type = 'button';
  drive.textContent = 'Drive selected section';
  section.append(label, drive);
  let disposed = false;
  let launching = false;
  function activeAPI() {
    const api = browser?.__VN;
    return typeof api?.loadScenario === 'function' &&
      (!api.getTrack || api.getTrack() === track)
      ? api
      : null;
  }
  function launchSelected() {
    if (disposed || launching) return;
    const api = activeAPI();
    const entry = RAVEL_PLAYTEST_CASES.find((item) => item.id === select.value);
    if (!api || !entry) return;
    launching = true;
    drive.disabled = true;
    try {
      api.loadScenario(entry.scenario, 7);
      api.clearInput?.();
      api.resume?.();
      // The selected pause control has just become hidden. Keep keyboard and
      // controller focus on the ordinary visible session control instead.
      host.querySelector('#pause-button')?.focus({ preventScroll: true });
    } finally {
      launching = false;
      drive.disabled = !activeAPI();
    }
  }
  drive.addEventListener('click', launchSelected);
  function attach() {
    if (disposed) return;
    const panel = host.querySelector('#pause-panel');
    if (!panel) return;
    if (section.parentElement !== panel)
      panel.insertBefore(section, panel.querySelector('.pause-restart'));
    drive.disabled = launching || !activeAPI();
  }
  attach();
  return {
    update: attach,
    dispose() {
      disposed = true;
      drive.removeEventListener('click', launchSelected);
      section.remove();
    },
  };
}
