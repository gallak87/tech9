import { HEROES } from './content.js';
import {
  exportSave,
  parseSaveFile,
  importSave,
  saveMeta,
  MAX_SAVE_BYTES,
} from './persistence.js';

// Owns browser file dialogs and asynchronous import lifetime. UI still owns the
// confirmation panel; persistence owns validation and writing the selected slot.
export class SaveTransfer {
  constructor(ui) {
    this.ui = ui;
    this.sequence = 0;
    this.input = null;
  }

  exportSlot(slot) {
    const ui = this.ui;
    try {
      const json = exportSave(slot);
      const record = JSON.parse(json);
      const url = URL.createObjectURL(
        new Blob([json], { type: 'application/json' }),
      );
      const link = document.createElement('a');
      link.href = url;
      link.download = `chronforge-echo-${slot === 'checkpoint' ? 'autosave' : 'record-' + slot}-${record.savedAt.slice(0, 10)}.json`;
      document.body.append(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      ui.notice =
        'Exported ' +
        (slot === 'checkpoint' ? 'autosave' : 'field record ' + slot) +
        '. Import this file in your other browser or game URL.';
      ui.render();
      ui.restoreShopRow('export-save:' + slot, ui.menuScroll[5] || 0);
    } catch (error) {
      ui.feedback({ ok: false, message: 'Could not export: ' + error.message });
    }
  }

  cancelImport() {
    this.sequence++;
    this.input?.remove();
    this.input = null;
  }

  requestImport(slot) {
    const ui = this.ui;
    this.input?.remove();
    const input = document.createElement('input');
    const sequence = ++this.sequence;
    const returnScroll = ui.root.querySelector('.atlas-body')?.scrollTop || 0;
    input.type = 'file';
    input.accept = '.json,application/json';
    input.hidden = true;
    input.setAttribute('aria-label', 'Import expedition save');

    const restore = () => {
      input.remove();
      if (this.input === input) this.input = null;
      if (ui.menu && ui.tab === 5)
        ui.restoreShopRow('import-save:' + slot, returnScroll);
    };
    input.addEventListener('cancel', restore, { once: true });
    input.addEventListener(
      'change',
      async () => {
        const file = input.files?.[0];
        restore();
        if (!file) return;
        try {
          if (file.size > MAX_SAVE_BYTES)
            throw Error('Save files must be 5 MB or smaller.');
          const record = parseSaveFile(await file.text());
          if (
            sequence !== this.sequence ||
            !ui.menu ||
            ui.tab !== 5 ||
            ui.panel?.type === 'confirm'
          )
            return;
          this.confirmImport(record, slot);
        } catch (error) {
          if (sequence === this.sequence && ui.menu && ui.tab === 5) {
            ui.feedback({
              ok: false,
              message: 'Could not import: ' + error.message,
            });
            ui.restoreShopRow('import-save:' + slot, ui.menuScroll[5] || 0);
          }
        }
      },
      { once: true },
    );
    document.body.append(input);
    this.input = input;
    input.click();
  }

  confirmImport(record, slot) {
    const ui = this.ui;
    const previous = ui.panel;
    const label =
      slot === 'checkpoint'
        ? 'Autosave'
        : 'Field record ' + String(slot).padStart(2, '0');
    const scroll = ui.root.querySelector('.atlas-body')?.scrollTop || 0;
    const saveImport = { loadImmediately: false };
    const finish = () => {
      ui.panel = previous;
      try {
        importSave(record, slot);
        ui.game.audio.sound('confirm');
        if (saveImport.loadImmediately) {
          ui.game.load(slot);
          return;
        }
        ui.notice = `Imported into ${label}. Choose Load on that row to resume it.`;
        ui.render();
        ui.restoreShopRow('load:' + slot, scroll);
      } catch (error) {
        ui.feedback({
          ok: false,
          message: 'Could not import: ' + error.message,
        });
        ui.restoreShopRow('import-save:' + slot, scroll);
      }
    };
    const occupied = !!saveMeta(slot);
    const party = record.state.heroes
      .map((hero) => `${HEROES[hero.id].name} LV ${hero.level}`)
      .join(', ');
    ui.confirm(
      (occupied ? 'Replace ' : 'Import into ') + label + '?',
      `Import ${party} into this row?${occupied ? ' The existing record will be replaced.' : ''}` +
        (slot === 'checkpoint'
          ? ' Future automatic checkpoints will update this row again.'
          : ''),
      finish,
      {
        eyebrow: 'IMPORT SAVE',
        confirmLabel: occupied ? 'Replace record' : 'Import record',
        cancelLabel: occupied ? 'Keep existing record' : 'Cancel',
        saveImport,
        returnFocus: 'import-save:' + slot,
        returnScroll: scroll,
      },
    );
    ui.root
      .querySelector('[data-do="confirm-no"]')
      ?.focus({ preventScroll: true });
  }
}
