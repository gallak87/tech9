import { MAX_SAVE_BYTES } from './save-transfer.js';
import { careerView, escapeHTML } from './view.js';
import { careerNameIcons } from './career-name.js';
import './style.css';
export function createProgressionMenu({
  store,
  signal,
  onChange = () => {},
  onCareerBack = () => {},
  onRenameCareer = null,
  careerName = 'Career',
  sandbox = false,
}) {
  const career = document.createElement('section');
  career.className = 'career-page';
  career.dataset.progressionCareer = '';
  let careerMounted = false,
    renaming = false,
    renameDraft = '';
  const isActive = (root) =>
    root === career && careerMounted && career.isConnected;
  let imported = null,
    message = '',
    importSequence = 0;
  const profile = () => store.snapshot().state;
  function close() {
    importSequence++;
    if (careerMounted) {
      unmountCareer();
      onCareerBack();
    }
  }
  function render(focus) {
    const state = profile();
    const title = escapeHTML(careerName);
    const content = `<div class="career-transfer"><button data-export>Export save</button><button data-import>Import save</button><button data-backup aria-label="Export previous backup">Export backup</button><input type="file" accept=".json,application/json" hidden data-save-file><span>Includes rewards, equipment, cups, records and ghosts.</span></div>${careerView(state)}`;
    const ask = imported
      ? `<section class="progression-confirm" role="alertdialog" aria-label="Import career"><h3>Replace this career?</h3><p>Incoming save: ${imported.profile.wins} wins · ${imported.profile.claims.length} rewards · ${imported.profile.cups.length} cup wins. A backup of your current career will be kept on this device.</p>${imported.cupUnavailable ? '<p>This championship can only resume in the other edition. Its results, rewards and trophies will stay saved.</p>' : ''}<button data-cancel>Cancel</button><button data-confirm-import>Import career</button></section>`
      : '';
    const notice = `<p class="progression-notice" id="career-page-notice" role="status">${escapeHTML(message || store.snapshot().notice || (sandbox ? 'Temporary playtest profile. Your earned career is untouched.' : ''))}</p>`;
    const rename =
      onRenameCareer && !sandbox && !ask
        ? renaming
          ? `<div class="career-name-editor"><input data-career-name aria-label="Career name" aria-describedby="career-page-notice" maxlength="32" value="${escapeHTML(renameDraft)}" autocomplete="off" spellcheck="false"><div class="career-name-actions" role="group" aria-label="Career name actions"><button type="button" data-career-save aria-label="Save career name" title="Save career name">${careerNameIcons.check}</button><button type="button" data-career-cancel aria-label="Cancel career rename" title="Cancel career rename">${careerNameIcons.cancel}</button></div></div>`
          : `<button type="button" data-career-rename data-controller-skip aria-label="Rename ${title}" title="Rename career · Controller Y">${careerNameIcons.pencil}</button>`
        : '';
    const header = `<header class="progression-header"><div><span class="kicker">VECTOR//NOVA · ${sandbox ? 'PLAYTEST PROFILE' : 'CAREER'}</span><div class="career-name-heading"><h1 id="career-page-title" ${renaming ? 'class="sr-only"' : ''}>${title}</h1>${rename}</div></div><button data-close aria-label="Back from ${title}">Back</button></header>`;
    career.innerHTML = `${header}${ask}<div class="progression-body" ${ask ? 'inert' : ''}>${notice}${content}</div>`;
    career.setAttribute('aria-labelledby', 'career-page-title');
    if (focus !== false)
      career
        .querySelector(focus ?? (ask ? '[data-cancel]' : '[data-close]'))
        ?.focus();
  }
  function renameCareer() {
    if (
      !careerMounted ||
      !career.isConnected ||
      imported ||
      !onRenameCareer ||
      sandbox
    )
      return false;
    if (renaming) {
      career
        .querySelector('[data-career-name]')
        ?.focus({ preventScroll: true });
      return true;
    }
    renaming = true;
    renameDraft = careerName;
    message = '';
    render('[data-career-name]');
    career.querySelector('[data-career-name]')?.select();
    return true;
  }
  function finishRename(save) {
    if (!renaming) return;
    if (save) {
      const input = career.querySelector('[data-career-name]');
      try {
        careerName = onRenameCareer(input.value);
      } catch (error) {
        message = error.message;
        career.querySelector('.progression-notice').textContent = message;
        input.setAttribute('aria-invalid', 'true');
        input.focus({ preventScroll: true });
        return;
      }
    }
    renaming = false;
    renameDraft = '';
    message = '';
    render('[data-export]');
  }
  career.addEventListener(
    'keydown',
    (event) => {
      if (renaming && event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        finishRename(false);
        return;
      }
      if (
        renaming &&
        event.target.matches('[data-career-name]') &&
        event.key === 'Enter' &&
        !event.isComposing
      ) {
        event.preventDefault();
        event.stopPropagation();
        finishRename(true);
        return;
      }
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        if (imported) {
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
        (button) =>
          !button.disabled &&
          !button.hasAttribute('data-controller-skip') &&
          !button.closest('[inert]'),
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
      if (next < 0 || next >= buttons.length) return;
      event.preventDefault();
      event.stopPropagation();
      const target = buttons[(next + buttons.length) % buttons.length];
      target?.focus({ preventScroll: true });
      target?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    },
    { signal },
  );
  career.addEventListener(
    'click',
    (event) => {
      const button = event.target.closest('button');
      if (!button) return;
      if (button.hasAttribute('data-career-rename')) return void renameCareer();
      if (button.hasAttribute('data-career-save')) return finishRename(true);
      if (button.hasAttribute('data-career-cancel')) return finishRename(false);
      if (button.hasAttribute('data-close')) return close();
      if (button.hasAttribute('data-cancel')) {
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
  career.addEventListener(
    'input',
    (event) => {
      if (!event.target.matches('[data-career-name]')) return;
      renameDraft = event.target.value;
      event.target.removeAttribute('aria-invalid');
      message = '';
      career.querySelector('.progression-notice').textContent = '';
    },
    { signal },
  );
  career.addEventListener(
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
        renaming = false;
        renameDraft = '';
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
  signal?.addEventListener(
    'abort',
    () => {
      importSequence++;
      career.remove();
    },
    { once: true },
  );
  return {
    mountCareer,
    unmountCareer,
    openCareer: mountCareer,
    renameCareer,
    close,
  };
  function mountCareer(container) {
    if (!container) return;
    if (!careerMounted) {
      importSequence++;
      imported = null;
      message = '';
      renaming = false;
      renameDraft = '';
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
    renaming = false;
    renameDraft = '';
    career.remove();
  }
}
