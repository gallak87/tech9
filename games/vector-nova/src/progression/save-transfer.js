import { PROFILE_KEY, validateProfile } from './profile.js';
import { CUP_STORAGE_KEY, validateCup } from '../race/cup.js';
import {
  exportTrialSaves,
  validateTrialSaves,
  clearTrialMemory,
} from '../race/time-trial.js';
export const SAVE_BACKUP_KEY = 'vector-nova.save.backup.v1';
export const MAX_SAVE_BYTES = 16 * 1024 * 1024;
export function createSaveTransfer({
  profileStore,
  cupStore,
  storage = () => localStorage,
}) {
  const readableStorage = () => {
    try {
      return storage();
    } catch {
      return null;
    }
  };
  const current = () => ({
    game: 'vector-nova',
    version: 1,
    savedAt: new Date().toISOString(),
    profile: profileStore.snapshot().state,
    cup: cupStore.snapshot().state,
    trials: exportTrialSaves(readableStorage()),
  });
  function parse(text) {
    if (typeof text !== 'string' || text.length > MAX_SAVE_BYTES)
      throw new Error('Choose a Vector Nova save under 16 MB.');
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      throw new Error('This file is not valid JSON.');
    }
    if (data?.game !== 'vector-nova' || data.version !== 1)
      throw new Error('This save belongs to another game or a newer version.');
    const profile = validateProfile(data.profile);
    if (!profile)
      throw new Error('This career save is damaged or incompatible.');
    const cup =
      data.cup === undefined
        ? cupStore.snapshot().state
        : data.cup === null
          ? null
          : validateCup(data.cup);
    if (data.cup != null && !cup)
      throw new Error('This cup save is damaged or incompatible.');
    const trials =
      data.trials === undefined
        ? exportTrialSaves(readableStorage())
        : validateTrialSaves(data.trials);
    return { profile, cup, trials };
  }
  return {
    ...profileStore,
    export: () => JSON.stringify(current(), null, 2),
    exportBackup: () => {
      try {
        return readableStorage()?.getItem(SAVE_BACKUP_KEY) ?? null;
      } catch {
        return null;
      }
    },
    parse,
    replace(value) {
      // Validate again at the write boundary. Stage every affected key for
      // rollback before touching storage or either live store.
      const next = parse(
        JSON.stringify({ game: 'vector-nova', version: 1, ...value }),
      );
      const store = storage(),
        writes = new Map([
          [PROFILE_KEY, JSON.stringify(next.profile)],
          [CUP_STORAGE_KEY, JSON.stringify(next.cup)],
        ]);
      for (let i = 0; i < store.length; i++) {
        const key = store.key(i);
        if (key?.startsWith('vector-nova.trial.v1.')) writes.set(key, null);
      }
      for (const { key, data } of next.trials)
        writes.set(key, JSON.stringify(data));
      writes.set(SAVE_BACKUP_KEY, JSON.stringify(current()));
      const previous = new Map(
        [...writes.keys()].map((key) => [key, store.getItem(key)]),
      );
      try {
        for (const [key, value] of writes)
          value === null ? store.removeItem(key) : store.setItem(key, value);
      } catch {
        for (const [key, value] of previous) {
          try {
            value === null ? store.removeItem(key) : store.setItem(key, value);
          } catch {
            /* Live stores retain the original progress; export remains available. */
          }
        }
        throw new Error(
          'Import could not be saved. Current session progress is unchanged; export it before closing.',
        );
      }
      clearTrialMemory(store);
      profileStore.reload();
      cupStore.reload();
      return next;
    },
  };
}
