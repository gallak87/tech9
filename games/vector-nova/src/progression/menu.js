import { MAX_SAVE_BYTES } from './save-transfer.js';
import { SHIPS } from '../ships/catalog.js';
import { careerView, escapeHTML } from './view.js';
import './style.css';
export function createProgressionMenu({
  host,
  store,
  signal,
  onChange = () => {},
  sandbox = false,
}) {
  const dialog = document.createElement('dialog');
  dialog.className = 'progression-dialog';
  dialog.dataset.progressionDialog = '';
  host.append(dialog);
  let shipId,
    opener,
    imported = null,
    confirmation = null,
    message = '',
    importSequence = 0;
  const profile = () => store.snapshot().state;
  function close() {
    importSequence++;
    dialog.close();
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
    const title = confirmation === 'exotic' ? 'Fit Quad Core' : 'Your career';
    const content =
      confirmation === 'exotic'
        ? ''
        : `${careerView(state)}<div class="career-transfer"><button data-export>Export save</button><button data-import>Import save</button><button data-backup>Export previous backup</button><input type="file" accept=".json,application/json" hidden data-save-file><span>Career · Equipment · Cup progress · Time Trial records & ghosts</span></div>`;
    const ask =
      confirmation === 'exotic'
        ? `<section class="progression-confirm" role="alertdialog" aria-label="Choose exotic ship"><h3>Fit Quad Core to ${ship.name}?</h3><p>This permanent reward gives ${ship.name} four equipment slots.</p><button data-cancel>Keep choosing</button><button data-confirm-exotic>Fit Quad Core</button></section>`
        : imported
          ? `<section class="progression-confirm" role="alertdialog" aria-label="Import career"><h3>Replace this career?</h3><p>Incoming save: ${imported.profile.wins} wins · ${imported.profile.claims.length} rewards · ${imported.profile.cups.length} cup wins. A backup of your current career will be kept on this device.</p><button data-cancel>Cancel</button><button data-confirm-import>Import career</button></section>`
          : '';
    dialog.innerHTML = `<header class="progression-header"><div><span class="kicker">VECTOR//NOVA · ${sandbox ? 'PLAYTEST PROFILE' : 'GARAGE'}</span><h2 id="progression-title">${title}</h2></div><button data-close aria-label="Close ${title}">Back <span aria-hidden="true">×</span></button></header><div class="progression-body" ${ask ? 'inert' : ''}>${content}</div><p class="progression-notice" role="status">${escapeHTML(message || store.snapshot().notice || (sandbox ? 'Temporary playtest profile. Your earned career is untouched.' : ''))}</p>${ask}`;
    dialog.classList.toggle('exotic-confirm-dialog', confirmation === 'exotic');
    dialog.setAttribute('aria-labelledby', 'progression-title');
    dialog
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
  dialog.addEventListener(
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
      event.preventDefault();
      event.stopPropagation();
      const buttons = [...dialog.querySelectorAll('button')].filter(
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
      buttons[
        (buttons.indexOf(event.target) + step + buttons.length) % buttons.length
      ]?.focus();
    },
    { signal },
  );
  dialog.addEventListener(
    'click',
    (event) => {
      const button = event.target.closest('button');
      if (!button) return;
      if (button.hasAttribute('data-close')) return close();
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
        dialog.querySelector('[data-save-file]').click();
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
  dialog.addEventListener(
    'change',
    async (event) => {
      if (!event.target.matches('[data-save-file]')) return;
      const file = event.target.files?.[0],
        sequence = ++importSequence;
      if (!file) return;
      try {
        if (file.size > MAX_SAVE_BYTES)
          throw new Error('Choose a save under 16 MB.');
        const text = await file.text();
        if (sequence !== importSequence || !dialog.open) return;
        imported = store.parse(text);
        message = '';
        render();
      } catch (error) {
        if (sequence === importSequence && dialog.open) {
          message = error.message;
          render('[data-import]');
        }
      }
    },
    { signal },
  );
  signal?.addEventListener(
    'abort',
    () => {
      importSequence++;
      dialog.remove();
    },
    { once: true },
  );
  return {
    openCareer() {
      open();
    },
    openExotic(id) {
      shipId = id;
      open('exotic');
    },
    close,
  };
  function open(choice = null) {
    opener = document.activeElement;
    imported = null;
    confirmation = choice;
    message = '';
    dialog.showModal();
    render();
  }
}
