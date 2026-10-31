import { createMenuBackdrop } from './menu-backdrop.js';
import { loadSettings, subscribeSettings } from '../progression/index.js';
import {
  createCareerSlots,
  createMemoryStorage,
} from '../progression/careers.js';
import { PROFILE_KEY, validateProfile } from '../progression/profile.js';
import { IS_DEMO, fullCupWins } from '../progression/edition.js';
import { careerProgressView, escapeHTML } from '../progression/view.js';
import { CUP_STORAGE_KEY, cupDefinition, validateCup } from '../race/cup.js';
import { bindMenuGamepad } from '../input/menu-gamepad.js';
import { createMusicPlayer } from '../audio/player.js';
import { settingsView, bindSettingsPanel } from './settings-panel.js';
// Keep shared styles in their normal menu order before lazy frontend creation.
import './garage.css';
import '../progression/style.css';
import '../audio/player.css';
import '../ui/style.css';
import './style.css';
import './menu.css';
import './cup-art.css';
import './entry.css';

const wordmark =
  '<span class="entry-wordmark">VECTOR<span>//</span>NOVA</span>';
const specialKeys = ['dev', 'inspect', 'review', 'test', 'capture', 'artPass'];

export function readCareerSlot(careers, slot) {
  if (slot.empty || slot.unavailable) return { profile: null, cup: null };
  try {
    const storage = careers.storageFor(slot.id);
    const profile = validateProfile(JSON.parse(storage.getItem(PROFILE_KEY)));
    if (!profile) throw new Error('Career progress could not be read.');
    const cupText = storage.getItem(CUP_STORAGE_KEY);
    const cup = cupText ? validateCup(JSON.parse(cupText)) : null;
    return { profile, cup };
  } catch {
    return { profile: null, cup: null };
  }
}

export async function startEntry(host) {
  const parameters = new URLSearchParams(
    import.meta.env.VN_DESKTOP ? '' : location.search,
  );
  const life = new AbortController();
  const careers = createCareerSlots();
  const backdrop = createMenuBackdrop(life.signal);
  host.innerHTML =
    '<div data-application-ui></div><div data-application-audio></div>';
  const uiHost = host.querySelector('[data-application-ui]');
  const audioHost = host.querySelector('[data-application-audio]');
  const quiet =
    parameters.get('music') === '0' ||
    parameters.has('artPass') ||
    parameters.get('inspect') === '1';
  const music = quiet ? null : createMusicPlayer(audioHost);
  let frontendModule,
    frontend = null,
    entryLife = null,
    shell = null,
    stage = 'intro',
    preview = null,
    previewGeneration = 0,
    transitioning = false,
    settingsDispose = null,
    headerObserver = null,
    message = '';
  const reducedMotion = () =>
    loadSettings().reducedMotion ||
    matchMedia('(prefers-reduced-motion: reduce)').matches;
  const loadFrontend = () => (frontendModule ??= import('./index.js'));

  function stopPreview() {
    previewGeneration++;
    preview?.dispose();
    preview = null;
  }
  function clearEntry() {
    stopPreview();
    settingsDispose?.();
    settingsDispose = null;
    headerObserver?.disconnect();
    headerObserver = null;
    if (entryLife) music?.close();
    entryLife?.abort();
    entryLife = null;
  }
  function measureHeader() {
    const header = shell?.querySelector('.entry-topbar');
    if (header)
      shell.style.setProperty(
        '--entry-header-clearance',
        `${Math.ceil(header.getBoundingClientRect().bottom + 20)}px`,
      );
  }
  function navigation() {
    if (stage === 'intro') return '';
    const current = stage;
    return `<header class="entry-topbar">${wordmark}<nav class="menu-top-tabs" aria-label="Main navigation"><button class="entry-tab" data-entry-action="profiles" aria-pressed="${current === 'profiles'}">Careers</button><button class="entry-tab" data-entry-action="settings" aria-pressed="${current === 'settings'}">Settings</button>${music ? `<button class="entry-tab" data-entry-action="tunes" aria-expanded="false" aria-controls="music-panel">Tunes</button>` : ''}</nav></header>`;
  }
  function slotView(slot) {
    const active = careers.active()?.id === slot.id;
    const { profile, cup } = readCareerSlot(careers, slot);
    const championship = cup && cupDefinition(cup.cupId);
    const detail = slot.unavailable
      ? '<span class="entry-career-detail">Storage unavailable</span>'
      : slot.empty
        ? '<span class="entry-career-detail">Start a new career</span>'
        : profile
          ? `${careerProgressView(profile)}<span class="entry-career-detail">${profile.wins} wins <span>·</span> ${IS_DEMO ? Number(profile.cups.includes('demo')) : fullCupWins(profile)} / ${IS_DEMO ? 1 : 4} cups${championship ? ` <span>·</span> ${escapeHTML(championship.name)} ${Math.min(cup.eventIndex + 1, championship.tracks.length)}/${championship.tracks.length}` : ''}</span>`
          : '<span class="entry-career-detail">Progress unavailable</span>';
    return `<button class="entry-profile${slot.empty ? ' entry-profile-empty' : ''}" data-career-slot="${slot.id}" aria-pressed="${active}" ${slot.unavailable ? 'disabled' : ''}><span class="entry-slot-number">0${slot.id}</span><span class="entry-profile-copy"><span class="entry-profile-title">${escapeHTML(slot.name)}</span>${detail}</span><span class="entry-profile-action">${slot.empty ? 'Create +' : 'Continue →'}</span></button>`;
  }
  function render() {
    if (!shell || entryLife?.signal.aborted) return;
    settingsDispose?.();
    settingsDispose = null;
    shell.classList.toggle('entry-reduced-motion', reducedMotion());
    document.body.classList.toggle('reduced-motion', reducedMotion());
    shell.dataset.entryStage = stage;
    document.body.dataset.screen = stage;
    const heading = stage === 'profiles' ? 'Choose your career' : 'Settings';
    const content =
      stage === 'intro'
        ? `<section class="entry-intro"><div class="entry-identity"><h1>${wordmark}</h1><button class="entry-continue" data-entry-action="profiles">Start</button></div><div class="entry-ship" aria-hidden="true"></div></section>`
        : `<section class="entry-page ${stage === 'profiles' ? 'entry-careers' : 'entry-utility'}"><header class="entry-page-heading"><h1>${heading}</h1>${stage === 'profiles' ? '' : '<button class="entry-back" data-entry-action="profiles">← Careers</button>'}</header>${stage === 'profiles' ? `<div class="entry-profile-grid">${careers.list().map(slotView).join('')}</div><p class="entry-notice" role="status">${escapeHTML(message || careers.snapshotNotice())}</p>` : `<div class="entry-utility-content">${stage === 'settings' ? settingsView(loadSettings()) : ''}</div>`}</section>`;
    shell.innerHTML = navigation() + content;
    backdrop.mount(shell);
    backdrop.configure({ active: true, reducedMotion: reducedMotion() });
    headerObserver?.disconnect();
    const header = shell.querySelector('.entry-topbar');
    headerObserver = header ? new ResizeObserver(measureHeader) : null;
    if (header) {
      headerObserver.observe(header);
      measureHeader();
    } else shell.style.removeProperty('--entry-header-clearance');
    if (stage === 'settings')
      settingsDispose = bindSettingsPanel(
        shell.querySelector('.entry-utility-content'),
        { getSettings: loadSettings, signal: entryLife.signal },
      );
    shell.scrollTop = 0;
  }
  async function showIntro() {
    stage = 'intro';
    render();
    shell.querySelector('.entry-continue').focus({ preventScroll: true });
    const token = ++previewGeneration;
    const started = performance.now();
    try {
      const { createShipPreview } = await import('./ship-preview.js');
      if (token !== previewGeneration || entryLife.signal.aborted) return;
      const current = createShipPreview({
        autoRotate: !reducedMotion(),
        presentation: true,
      });
      preview = current;
      shell.querySelector('.entry-ship').append(current.element);
      await current.setShip('kestrel');
      if (token !== previewGeneration || entryLife.signal.aborted) return;
      current.element.style.setProperty(
        '--ship-reveal-duration',
        `${Math.max(200, 5000 - (performance.now() - started))}ms`,
      );
      current.element.classList.add('entry-ship-ready');
    } catch {
      // The title and navigation remain usable without the decorative model.
    }
  }
  function showPage(next) {
    if (transitioning) return;
    if (shell?.dataset.entryStage) music?.close();
    stopPreview();
    stage = next;
    message = '';
    render();
    const target =
      next === 'profiles'
        ? `[data-career-slot="${careers.active()?.id ?? 1}"]`
        : '[data-setting="quality"]';
    shell.querySelector(target)?.focus({ preventScroll: true });
  }
  function installEntry(next = 'profiles') {
    clearEntry();
    document.body.classList.remove('developer-entry');
    entryLife = new AbortController();
    uiHost.innerHTML =
      '<main id="front-shell" class="cinematic-menu entry-shell"></main>';
    shell = uiHost.querySelector('#front-shell');
    music?.configureNavigation({
      clearInput: () => {},
      isMenuVisible: () => true,
    });
    bindMenuGamepad(entryLife.signal, {
      toggleMusic: () => music?.togglePlayback(),
    });
    shell.addEventListener(
      'click',
      (event) => {
        if (transitioning) return;
        const button = event.target.closest('button');
        const action = button?.dataset.entryAction;
        const id = Number(button?.dataset.careerSlot);
        if (id) void openCareer(id);
        else if (action === 'tunes') music?.open(button);
        else if (action) showPage(action);
      },
      { signal: entryLife.signal },
    );
    shell.addEventListener(
      'keydown',
      (event) => {
        if (
          event.defaultPrevented ||
          event.ctrlKey ||
          event.metaKey ||
          event.altKey
        )
          return;
        if (stage === 'intro') return;
        const tab = event.target.closest('.entry-tab');
        if (
          tab &&
          ['ArrowLeft', 'ArrowRight', 'Home', 'End', 'ArrowDown'].includes(
            event.code,
          )
        ) {
          event.preventDefault();
          if (event.code === 'ArrowDown') {
            const controls = [
              ...shell.querySelectorAll(
                'section button, section input, section select',
              ),
            ].filter(
              (control) =>
                !control.disabled &&
                control.getClientRects().length &&
                !control.closest('[hidden], [inert]'),
            );
            controls[0]?.focus();
          } else {
            const tabs = [...shell.querySelectorAll('.entry-tab')];
            const index = tabs.indexOf(tab);
            const nextIndex =
              event.code === 'Home'
                ? 0
                : event.code === 'End'
                  ? tabs.length - 1
                  : (index +
                      (event.code === 'ArrowLeft' ? -1 : 1) +
                      tabs.length) %
                    tabs.length;
            tabs[nextIndex].focus();
          }
        } else if (event.code === 'Escape') {
          event.preventDefault();
          event.stopPropagation();
          if (stage !== 'profiles') showPage('profiles');
          else
            shell
              .querySelector('.entry-tab[data-entry-action="profiles"]')
              ?.focus();
        } else if (
          event.code === 'KeyS' &&
          !event.target.matches('input, select, textarea')
        ) {
          event.preventDefault();
          showPage('settings');
        }
      },
      { signal: entryLife.signal },
    );
    const unsubscribe = subscribeSettings(() => {
      shell.classList.toggle('entry-reduced-motion', reducedMotion());
      backdrop.configure({ active: true, reducedMotion: reducedMotion() });
    });
    entryLife.signal.addEventListener('abort', unsubscribe, { once: true });
    if (next === 'intro') void showIntro();
    else showPage(next);
  }
  async function launchCareer(career, storage) {
    transitioning = true;
    shell?.setAttribute('aria-busy', 'true');
    try {
      const { createFrontend } = await loadFrontend();
      shell?.classList.add('entry-leaving');
      if (shell)
        await new Promise((resolve) =>
          setTimeout(resolve, reducedMotion() ? 0 : 220),
        );
      if (life.signal.aborted) return;
      clearEntry();
      frontend = await createFrontend(uiHost, {
        backdrop,
        storage,
        music,
        career,
        onSwitchCareer: returnToCareers,
      });
      transitioning = false;
    } catch (error) {
      frontendModule = null;
      transitioning = false;
      installEntry('profiles');
      message = error.message || 'The career could not be opened.';
      render();
    }
  }
  async function openCareer(id) {
    try {
      const slot = careers.list().find((entry) => entry.id === id);
      const career = slot.empty ? careers.create(id) : careers.select(id);
      await launchCareer(career, careers.storageFor(id));
    } catch (error) {
      message = error.message;
      render();
    }
  }
  async function returnToCareers() {
    if (transitioning) return;
    transitioning = true;
    music?.close();
    await frontend?.dispose();
    frontend = null;
    if (!import.meta.env.VN_DESKTOP) {
      const url = new URL(location.href);
      for (const key of [...url.searchParams.keys()])
        if (!['intro', 'music'].includes(key)) url.searchParams.delete(key);
      history.replaceState(null, '', url);
    }
    transitioning = false;
    installEntry('profiles');
  }
  window.addEventListener(
    'pagehide',
    () => {
      clearEntry();
      void frontend?.dispose();
      music?.dispose();
      life.abort();
    },
    { once: true },
  );

  const special = specialKeys.some((key) => parameters.has(key));
  const direct = parameters.get('intro') === '0' || special;
  if (special) {
    const career = careers.active();
    await launchCareer(
      career,
      career ? careers.storageFor(career.id) : createMemoryStorage(),
    );
  } else if (direct && careers.active()) {
    const career = careers.select(careers.active().id);
    await launchCareer(career, careers.storageFor(career.id));
  } else installEntry(direct ? 'profiles' : 'intro');
}
