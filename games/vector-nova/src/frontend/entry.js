import { createMenuBackdrop } from './menu-backdrop.js';
import { loadSettings, subscribeSettings } from '../progression/index.js';
import {
  createCareerSlots,
  createMemoryStorage,
} from '../progression/careers.js';
import { PROFILE_KEY, validateProfile } from '../progression/profile.js';
import { careerNameIcons } from '../progression/career-name.js';
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
const {
  pencil: pencilIcon,
  check: checkIcon,
  cancel: cancelIcon,
} = careerNameIcons;

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
  let frontendModule,
    frontend = null,
    entryLife = null,
    shell = null,
    stage = 'intro',
    preview = null,
    wordmarkFlight = null,
    previewGeneration = 0,
    transitioning = false,
    settingsDispose = null,
    headerObserver = null,
    renaming = null,
    renameDraft = '',
    message = '';
  const music = quiet
    ? null
    : createMusicPlayer(audioHost, {
        isStartupScreen: () => frontend === null,
      });
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
    wordmarkFlight?.cancel();
    wordmarkFlight = null;
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
    return `<header class="menu-topbar entry-topbar">${wordmark}<nav class="menu-top-tabs" aria-label="Main navigation"><button class="entry-tab" data-entry-action="profiles" aria-pressed="${current === 'profiles'}">Careers</button><button class="entry-tab" data-entry-action="settings" aria-pressed="${current === 'settings'}">Settings</button>${music ? `<button class="entry-tab" data-entry-action="tunes" aria-expanded="false" aria-controls="music-panel">Tunes</button>` : ''}</nav></header>`;
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
    const editing = renaming === slot.id;
    const titleId = `entry-career-title-${slot.id}`;
    const actionId = `entry-career-action-${slot.id}`;
    const detailId = `entry-career-detail-${slot.id}`;
    const rename =
      slot.empty || slot.unavailable
        ? ''
        : `<button type="button" class="entry-rename" data-career-rename="${slot.id}" data-controller-skip aria-label="Rename ${escapeHTML(slot.name)}" title="Rename career · Controller Y">${pencilIcon}</button>`;
    const name = editing
      ? `<div class="entry-profile-name-editor"><input data-career-name aria-label="Career name" aria-describedby="entry-career-notice" maxlength="32" value="${escapeHTML(renameDraft)}" autocomplete="off" spellcheck="false"><div class="entry-rename-actions" role="group" aria-label="Career name actions"><button type="button" data-career-save aria-label="Save career name" title="Save career name">${checkIcon}</button><button type="button" data-career-cancel aria-label="Cancel career rename" title="Cancel career rename">${cancelIcon}</button></div></div>`
      : `<div class="entry-profile-name"><span id="${titleId}" class="entry-profile-title">${escapeHTML(slot.name)}</span>${rename}</div>`;
    // The full-card launch button is a sibling of the editor, never its parent.
    const launch = editing
      ? ''
      : `<button class="entry-profile${slot.empty ? ' entry-profile-empty' : ''}" data-career-slot="${slot.id}" aria-labelledby="${titleId} ${actionId}" aria-describedby="${detailId}" aria-pressed="${active}" ${slot.unavailable ? 'disabled' : ''}></button>`;
    return `<div class="entry-profile-row${editing ? ' entry-profile-row-editing' : ''}" data-career-id="${slot.id}">${launch}<span class="entry-slot-number">0${slot.id}</span><div class="entry-profile-copy">${name}<div id="${detailId}">${detail}</div></div>${editing ? '' : `<span id="${actionId}" class="entry-profile-action">${slot.empty ? 'Create +' : 'Continue →'}</span>`}</div>`;
  }
  function render() {
    if (!shell || entryLife?.signal.aborted) return;
    wordmarkFlight?.cancel();
    wordmarkFlight = null;
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
        : `<section class="entry-page ${stage === 'profiles' ? 'entry-careers' : 'entry-utility'}"><header class="entry-page-heading"><h1>${heading}</h1>${stage === 'profiles' ? '' : '<button class="entry-back" data-entry-action="profiles">← Careers</button>'}</header>${stage === 'profiles' ? `<div class="entry-profile-grid">${careers.list().map(slotView).join('')}</div><p id="entry-career-notice" class="entry-notice" role="status">${escapeHTML(message || careers.snapshotNotice())}</p>` : `<div class="entry-utility-content">${stage === 'settings' ? settingsView(loadSettings()) : ''}</div>`}</section>`;
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
  function beginRename(id) {
    if (transitioning || stage !== 'profiles') return;
    const slot = careers.list().find((entry) => entry.id === id);
    if (!slot || slot.empty || slot.unavailable) return;
    renaming = id;
    renameDraft = slot.name;
    message = '';
    render();
    const input = shell.querySelector('[data-career-name]');
    input.focus({ preventScroll: true });
    input.select();
  }
  function finishRename(save) {
    if (renaming === null || transitioning) return;
    const id = renaming;
    if (save) {
      const input = shell.querySelector('[data-career-name]');
      try {
        careers.rename(id, input.value);
      } catch (error) {
        message = error.message;
        shell.querySelector('.entry-notice').textContent = message;
        input.setAttribute('aria-invalid', 'true');
        input.focus({ preventScroll: true });
        return;
      }
    }
    renaming = null;
    renameDraft = '';
    message = '';
    render();
    shell
      .querySelector(`[data-career-slot="${id}"]`)
      ?.focus({ preventScroll: true });
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
    const from =
      stage === 'intro' && next === 'profiles' && !reducedMotion()
        ? shell?.querySelector('.entry-intro .entry-wordmark')
        : null;
    const source = from ? wordmarkBounds(from) : null;
    if (shell?.dataset.entryStage) music?.close();
    stopPreview();
    renaming = null;
    renameDraft = '';
    stage = next;
    message = '';
    render();
    if (source) flyWordmark(source);
    const target =
      next === 'profiles'
        ? `[data-career-slot="${careers.active()?.id ?? 1}"]`
        : '[data-setting="quality"]';
    shell.querySelector(target)?.focus({ preventScroll: true });
  }
  function wordmarkBounds(element) {
    // The title's block fills its row; measure the lettering itself.
    const range = document.createRange();
    range.selectNodeContents(element);
    return range.getBoundingClientRect();
  }
  function flyWordmark(source) {
    const target = shell.querySelector('.entry-topbar .entry-wordmark');
    if (!target) return;
    const destination = wordmarkBounds(target);
    if (!destination.width || !destination.height) return;
    const box = target.getBoundingClientRect();
    const scaleX = source.width / destination.width;
    const scaleY = source.height / destination.height;
    const x = source.left - box.left - (destination.left - box.left) * scaleX;
    const y = source.top - box.top - (destination.top - box.top) * scaleY;
    const flight = target.animate(
      [
        {
          transformOrigin: '0 0',
          transform: `translate(${x}px, ${y}px) scale(${scaleX}, ${scaleY})`,
        },
        { transformOrigin: '0 0', transform: 'none' },
      ],
      { duration: 220, easing: 'cubic-bezier(0.22, 0.61, 0.36, 1)' },
    );
    wordmarkFlight = flight;
    flight.onfinish = flight.oncancel = () => {
      if (wordmarkFlight === flight) wordmarkFlight = null;
    };
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
      onSecondaryAction(root) {
        if (root !== shell || stage !== 'profiles' || transitioning) return;
        if (renaming !== null) {
          shell.querySelector('[data-career-name]')?.focus();
          return;
        }
        const row = document.activeElement?.closest('[data-career-id]');
        if (row) beginRename(Number(row.dataset.careerId));
      },
    });
    shell.addEventListener(
      'click',
      (event) => {
        if (transitioning) return;
        const button = event.target.closest('button');
        const action = button?.dataset.entryAction;
        const id = Number(button?.dataset.careerSlot);
        if (button?.hasAttribute('data-career-save')) finishRename(true);
        else if (button?.hasAttribute('data-career-cancel'))
          finishRename(false);
        else if (button?.dataset.careerRename)
          beginRename(Number(button.dataset.careerRename));
        else if (id) void openCareer(id);
        else if (action === 'tunes') music?.open(button);
        else if (action) showPage(action);
      },
      { signal: entryLife.signal },
    );
    shell.addEventListener(
      'input',
      (event) => {
        if (!event.target.matches('[data-career-name]')) return;
        renameDraft = event.target.value;
        event.target.removeAttribute('aria-invalid');
        message = '';
        shell.querySelector('.entry-notice').textContent = '';
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
        if (renaming !== null && event.code === 'Escape') {
          event.preventDefault();
          event.stopPropagation();
          finishRename(false);
          return;
        }
        if (
          renaming !== null &&
          event.code === 'Enter' &&
          event.target.matches('[data-career-name]') &&
          !event.isComposing
        ) {
          event.preventDefault();
          event.stopPropagation();
          finishRename(true);
          return;
        }
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
        onRenameCareer: career
          ? (name) => careers.rename(career.id, name)
          : null,
      });
      transitioning = false;
    } catch (error) {
      frontendModule = null;
      transitioning = false;
      installEntry('profiles');
      message = error.message || 'The career could not be opened.';
      render();
      shell
        ?.querySelector(`[data-career-slot="${career?.id ?? 1}"]`)
        ?.focus({ preventScroll: true });
    }
  }
  async function openCareer(id) {
    if (transitioning) return;
    renaming = null;
    renameDraft = '';
    transitioning = true;
    shell?.setAttribute('aria-busy', 'true');
    const chosen = shell?.querySelector(`[data-career-slot="${id}"]`);
    if (chosen) {
      chosen.setAttribute('aria-busy', 'true');
      chosen.setAttribute('data-career-loading', '');
      chosen.insertAdjacentHTML(
        'beforeend',
        '<span class="entry-career-loading" role="progressbar" aria-label="Opening career"></span>',
      );
      // Give the pressed slot a real paint before fetching/evaluating the menu.
      // A warm import may resolve immediately; a cold Vite catalogue takes longer.
      await new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(resolve)),
      );
    }
    if (life.signal.aborted) return;
    try {
      const slot = careers.list().find((entry) => entry.id === id);
      const career = slot.empty ? careers.create(id) : careers.select(id);
      await launchCareer(career, careers.storageFor(id));
    } catch (error) {
      transitioning = false;
      shell?.removeAttribute('aria-busy');
      message = error.message;
      render();
      shell
        ?.querySelector(`[data-career-slot="${id}"]`)
        ?.focus({ preventScroll: true });
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
