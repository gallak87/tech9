import { validateDocument } from './document.js';

export const EDITOR_DRAFT_KEY = 'vector-nova.editor-draft.v1';
const MAX_BYTES = 1024 * 1024;
const bytes = (value) => new TextEncoder().encode(value).length;

/** A recovery checkpoint is separate from explicit My tracks saves. */
export function createDraftRecovery({ storage, now = Date.now } = {}) {
  const source = () => storage ?? globalThis.localStorage;
  return {
    read() {
      const raw = source().getItem(EDITOR_DRAFT_KEY);
      if (!raw) return null;
      if (bytes(raw) > MAX_BYTES + 128)
        throw new Error(
          'The recovery draft is too large. Your saved tracks are unchanged.',
        );
      const entry = JSON.parse(raw);
      if (
        entry.version !== 1 ||
        !Number.isFinite(entry.updatedAt) ||
        entry.updatedAt < 0
      )
        throw new Error(
          'The recovery draft could not be read. Your saved tracks are unchanged.',
        );
      return {
        updatedAt: entry.updatedAt,
        document: validateDocument(entry.document),
      };
    },
    write(value) {
      const document = validateDocument(value);
      const raw = JSON.stringify({ version: 1, updatedAt: now(), document });
      if (bytes(raw) > MAX_BYTES)
        throw new Error(
          'Recovery storage is full. Use Save or Export to keep this track.',
        );
      source().setItem(EDITOR_DRAFT_KEY, raw);
      return { updatedAt: now(), document };
    },
    clear() {
      source().removeItem(EDITOR_DRAFT_KEY);
    },
  };
}
