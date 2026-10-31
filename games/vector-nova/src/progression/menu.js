import { MAX_SAVE_BYTES } from './save-transfer.js';
import { SHIPS } from '../ships/catalog.js';
import { careerView, escapeHTML } from './view.js';
import './style.css';
export function createProgressionMenu({
  host,
  store,
  signal,
  onChange = () => {},
  onCareerBack = () => {},
  onSwitchCareer = null,
  careerName = 'Career',
  sandbox = false,
}) {
  const dialog = document.createElement('dialog');
  dialog.className = 'progression-dialog';
  dialog.dataset.progressionDialog = '';
  host.append(dialog);
  const career = document.createElement('section');
  career.className = 'career-page';
  career.dataset.progressionCareer = '';
  let careerMounted = false;
  const activeRoot = () => (dialog.open ? dialog : career);
  const isActive = (root) =>
    root === dialog ? dialog.open : careerMounted && career.isConnected;
  let shipId,
    opener,
    imported = null,
    confirmation = null,
    message = '',
    importSequence = 0;
  const profile = () => store.snapshot().state;
  function close() {
    importSequence++;
    if (!dialog.open) {
      if (careerMounted) {
        unmountCareer();
        onCareerBack();
      }
      return;
    }
    dialog.close();
    confirmation = null;
    if (opener?.isConnected) opener.focus({ preventScroll: true });
    else {
      const action = opener?.dataset.action;
      const replacement = action
        ? host.querySelector(`[data-action="${action}"]`)
        : null;
      (
        replacement ??
        host.querySelector(
          '[data-action="garage-tab"], [data-action="ship-step"]',
        )
      )?.focus();
    }
  }
  function render(focus) {
    const state = profile();
    const ship = SHIPS.find((entry) => entry.id === shipId) ?? SHIPS[0];
    const root = activeRoot();
    const inline = root === career;
    const title =
      confirmation === 'exotic' ? 'Fit Quad Core' : escapeHTML(careerName);
    const content =
      confirmation === 'exotic'
        ? ''
        : `<div class="career-transfer">${onSwitchCareer ? '<button data-switch-career>Switch career</button>' : ''}<button data-export>Export save</button><button data-import>Import save</button><button data-backup aria-label="Export previous backup">Export backup</button><input type="file" accept=".json,application/json" hidden data-save-file><span>Includes rewards, equipment, cups, records and ghosts.</span></div>${careerView(state)}`;
    const ask =
      confirmation === 'exotic'
        ? `<section class="progression-confirm" role="alertdialog" aria-label="Choose exotic ship"><h3>Fit Quad Core to ${ship.name}?</h3><p>This permanent reward gives ${ship.name} four equipment slots.</p><button data-cancel>Keep choosing</button><button data-confirm-exotic>Fit Quad Core</button></section>`
        : imported
          ? `<section class="progression-confirm" role="alertdialog" aria-label="Import career"><h3>Replace this career?</h3><p>Incoming save: ${imported.profile.wins} wins · ${imported.profile.claims.length} rewards · ${imported.profile.cups.length} cup wins. A backup of your current career will be kept on this device.</p>${imported.cupUnavailable ? '<p>This championship can only resume in the other edition. Its results, rewards and trophies will stay saved.</p>' : ''}<button data-cancel>Cancel</button><button data-confirm-import>Import career</button></section>`
          : '';
    const titleId = inline ? 'career-page-title' : 'progression-title';
    const notice = `<p class="progression-notice" role="status">${escapeHTML(message || store.snapshot().notice || (sandbox ? 'Temporary playtest profile. Your earned career is untouched.' : ''))}</p>`;
    const header = `<header class="progression-header"><div><span class="kicker">VECTOR//NOVA · ${sandbox ? 'PLAYTEST PROFILE' : inline ? 'CAREER' : 'GARAGE'}</span><${inline ? 'h1' : 'h2'} id="${titleId}">${title}</${inline ? 'h1' : 'h2'}></div><button data-close aria-label="${inline ? 'Back from' : 'Close'} ${title}">Back${inline ? '' : ' <span aria-hidden="true">×</span>'}</button></header>`;
    root.innerHTML = inline
      ? `${header}${ask}<div class="progression-body" ${ask ? 'inert' : ''}>${notice}${content}</div>`
      : `${header}<div class="progression-body" ${ask ? 'inert' : ''}>${content}</div>${notice}${ask}`;
    dialog.classList.toggle('exotic-confirm-dialog', confirmation === 'exotic');
    root.setAttribute('aria-labelledby', titleId);
    if (focus !== false)
      root
        .querySelector(focus ?? (ask ? '[data-cancel]' : '[data-close]'))
        ?.focus();
  }
  dialog.addEventListener(
    'cancel',
    (event) => {
      event.preventDefault();
      if (confirmation) {
        confirmation = null;
        close();
      } else if (imported) {
        imported = null;
        render();
      } else close();
    },
    { signal },
  );
  for (const view of [dialog, career]) {
    view.addEventListener(
      'keydown',
      (event) => {
        if (event.key === 'Escape') {
          event.preventDefault();
          event.stopPropagation();
          if (confirmation) {
            confirmation = null;
            close();
          } else if (imported) {
            imported = null;
            render();
          } else close();
          return;
        }
        if (
          !['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(
            event.key,
          ) ||
          !event.target.matches('button')
        )
          return;
        const root = event.currentTarget;
        const buttons = [...root.querySelectorAll('button')].filter(
          (button) => !button.disabled && !button.closest('[inert]'),
        );
        const direction = ['ArrowUp', 'ArrowLeft'].includes(event.key) ? -1 : 1;
        const grid = event.target.closest('.equipment-grid');
        const columns = grid
          ? getComputedStyle(grid).gridTemplateColumns.split(' ').length
          : 1;
        const step =
          grid && ['ArrowUp', 'ArrowDown'].includes(event.key)
            ? direction * columns
            : direction;
        const next = buttons.indexOf(event.target) + step;
        // Inline pages allow controller navigation to continue into the top tabs.
        if (root === career && (next < 0 || next >= buttons.length)) return;
        event.preventDefault();
        event.stopPropagation();
        const target = buttons[(next + buttons.length) % buttons.length];
        target?.focus({ preventScroll: true });
        target?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
      },
      { signal },
    );
    view.addEventListener(
      'click',
      (event) => {
        const button = event.target.closest('button');
        if (!button) return;
        if (button.hasAttribute('data-close')) return close();
        if (button.hasAttribute('data-switch-career')) {
          importSequence++;
          imported = null;
          onSwitchCareer?.();
          return;
        }
        if (button.hasAttribute('data-confirm-exotic')) {
          store.chooseExotic(shipId);
          confirmation = null;
          onChange();
          close();
          return;
        }
        if (button.hasAttribute('data-cancel')) {
          if (confirmation) {
            confirmation = null;
            close();
            return;
          }
          imported = null;
          render();
        }
        if (
          button.hasAttribute('data-export') ||
          button.hasAttribute('data-backup')
        ) {
          const content = button.hasAttribute('data-backup')
            ? store.exportBackup()
            : store.export();
          if (!content) {
            message = 'No previous import backup on this device yet.';
            render('[data-backup]');
            return;
          }
          const url = URL.createObjectURL(
            new Blob([content], { type: 'application/json' }),
          );
          const link = document.createElement('a');
          link.href = url;
          link.download = `vector-nova-${new Date().toISOString().slice(0, 10)}.json`;
          link.click();
          setTimeout(() => URL.revokeObjectURL(url), 1000);
          message = 'Save exported.';
          render('[data-export]');
        }
        if (button.hasAttribute('data-import'))
          event.currentTarget.querySelector('[data-save-file]').click();
        if (button.hasAttribute('data-confirm-import')) {
          try {
            store.replace(imported);
            imported = null;
            message =
              'Save imported. Your previous save is available with Export previous backup.';
            onChange({ imported: true });
          } catch (error) {
            message = error.message;
            imported = null;
          }
          render('[data-import]');
        }
      },
      { signal },
    );
    view.addEventListener(
      'change',
      async (event) => {
        if (!event.target.matches('[data-save-file]')) return;
        const root = event.currentTarget;
        const file = event.target.files?.[0],
          sequence = ++importSequence;
        if (!file) return;
        try {
          if (file.size > MAX_SAVE_BYTES)
            throw new Error('Choose a save under 16 MB.');
          const text = await file.text();
          if (sequence !== importSequence || !isActive(root)) return;
          imported = store.parse(text);
          message = '';
          render();
        } catch (error) {
          if (sequence === importSequence && isActive(root)) {
            message = error.message;
            render('[data-import]');
          }
        }
      },
      { signal },
    );
  }
  signal?.addEventListener(
    'abort',
    () => {
      importSequence++;
      dialog.remove();
      career.remove();
    },
    { once: true },
  );
  return {
    mountCareer,
    unmountCareer,
    openCareer: mountCareer,
    openExotic(id) {
      shipId = id;
      open('exotic');
    },
    close,
  };
  function mountCareer(container) {
    if (!container) return;
    if (!careerMounted) {
      importSequence++;
      imported = null;
      confirmation = null;
      message = '';
      careerMounted = true;
    }
    if (career.parentElement !== container) container.replaceChildren(career);
    render(false);
  }
  function unmountCareer() {
    if (!careerMounted) return;
    importSequence++;
    careerMounted = false;
    imported = null;
    message = '';
    career.remove();
  }
  function open(choice = null) {
    opener = document.activeElement;
    imported = null;
    confirmation = choice;
    message = '';
    dialog.showModal();
    render();
  }
}
