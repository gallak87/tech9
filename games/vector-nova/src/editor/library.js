import { validateDocument } from './document.js';
import {
  checkTrackFileSize,
  MAX_TRACK_BYTES,
  MAX_TRACKS,
  parseTrackFile,
  serializeTrack,
  TRACK_ID_PATTERN,
  trackByteLength,
  trackExportName,
  trackId,
} from './track-file.js';

export const TRACK_LIBRARY_KEY = 'vector-nova.tracks.v1.';

function canonical(document) {
  const result = validateDocument(document);
  serializeTrack(result);
  return result;
}

async function pickTrackFile() {
  return new Promise((resolve, reject) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,application/json';
    input.hidden = true;
    const previous = document.activeElement;
    let settled = false;
    let focusTimer;
    const finish = (value, error) => {
      if (settled) return;
      settled = true;
      clearTimeout(focusTimer);
      window.removeEventListener('focus', onFocus);
      input.remove();
      previous?.focus();
      if (error) reject(error);
      else resolve(value);
    };
    const onFocus = () => {
      focusTimer = setTimeout(() => {
        if (!input.files?.length) finish(null);
      }, 500);
    };
    input.addEventListener('cancel', () => finish(null), { once: true });
    input.addEventListener(
      'change',
      async () => {
        const file = input.files?.[0];
        if (!file) return finish(null);
        try {
          checkTrackFileSize(file.size);
          finish(canonical(parseTrackFile(await file.text())));
        } catch (error) {
          finish(null, error);
        }
      },
      { once: true },
    );
    window.addEventListener('focus', onFocus);
    document.body.append(input);
    input.click();
  });
}

export function createTrackLibrary({ storage } = {}) {
  const desktop =
    storage === undefined ? globalThis.vectorNovaDesktop?.tracks : null;
  if (desktop)
    return {
      async list() {
        return desktop.list();
      },
      async read(id) {
        const document = await desktop.read(trackId(id));
        return document === null ? null : canonical(document);
      },
      async save(document) {
        return canonical(await desktop.save(canonical(document)));
      },
      async remove(id) {
        return desktop.remove(trackId(id));
      },
      async import() {
        const document = await desktop.import();
        return document === null ? null : canonical(document);
      },
      async export(document) {
        return desktop.export(canonical(document));
      },
    };
  const getStorage =
    typeof storage === 'function'
      ? storage
      : () => storage ?? globalThis.localStorage;
  const readEnvelope = (id) => {
    const raw = getStorage().getItem(TRACK_LIBRARY_KEY + trackId(id));
    if (raw === null) return null;
    if (trackByteLength(raw) > MAX_TRACK_BYTES + 256)
      throw new Error('The saved track is too large.');
    const envelope = JSON.parse(raw);
    if (!Number.isFinite(envelope.updatedAt) || envelope.updatedAt < 0)
      throw new Error('The saved track could not be read.');
    const document = canonical(envelope.document);
    if (document.id !== id)
      throw new Error('The track ID does not match its save.');
    return { document, updatedAt: envelope.updatedAt };
  };
  const keys = () => {
    const source = getStorage();
    const ids = [];
    for (let index = 0; index < source.length; index++) {
      const key = source.key(index);
      if (key?.startsWith(TRACK_LIBRARY_KEY)) {
        const id = key.slice(TRACK_LIBRARY_KEY.length);
        if (TRACK_ID_PATTERN.test(id)) ids.push(id);
      }
    }
    return ids;
  };
  return {
    async list() {
      const entries = [];
      for (const id of keys()) {
        try {
          const { document, updatedAt } = readEnvelope(id);
          entries.push({
            id,
            name: document.name,
            biome: document.biome,
            updatedAt,
          });
        } catch {
          // Leave the rest of the library usable if one stored item is damaged.
        }
      }
      return entries.sort(
        (a, b) => b.updatedAt - a.updatedAt || a.id.localeCompare(b.id),
      );
    },
    async read(id) {
      return readEnvelope(id)?.document ?? null;
    },
    async save(document) {
      const result = canonical(document),
        id = result.id;
      const ids = keys();
      if (!ids.includes(id) && ids.length >= MAX_TRACKS)
        throw new Error(
          'The track library is full. Remove a track before saving another.',
        );
      getStorage().setItem(
        TRACK_LIBRARY_KEY + id,
        JSON.stringify({ updatedAt: Date.now(), document: result }),
      );
      return result;
    },
    async remove(id) {
      const source = getStorage(),
        key = TRACK_LIBRARY_KEY + trackId(id);
      const found = source.getItem(key) !== null;
      source.removeItem(key);
      return found;
    },
    import: pickTrackFile,
    async export(document) {
      const result = validateDocument(document);
      const url = URL.createObjectURL(
        new Blob([serializeTrack(result)], {
          type: 'application/json',
        }),
      );
      const link = globalThis.document.createElement('a');
      link.href = url;
      link.download = trackExportName(result.name);
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      return true;
    },
  };
}
