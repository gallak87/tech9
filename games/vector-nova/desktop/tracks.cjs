const fs = require('node:fs/promises');
const { constants } = require('node:fs');
const { join, dirname, basename } = require('node:path');
const { randomUUID } = require('node:crypto');
const {
  checkTrackFileSize,
  MAX_TRACK_BYTES,
  MAX_TRACKS,
  parseTrackFile,
  serializeTrack,
  TRACK_ID_PATTERN,
  trackExportName,
  trackId,
} = require('#vector-nova-track-file');

async function readTrackFile(path, noFollow = true) {
  if (noFollow) {
    const info = await fs.lstat(path);
    if (!info.isFile() || info.isSymbolicLink())
      throw new Error('The track must be a regular file.');
  }
  const handle = await fs.open(
    path,
    constants.O_RDONLY | (noFollow ? constants.O_NOFOLLOW || 0 : 0),
  );
  try {
    const info = await handle.stat();
    if (!info.isFile() || info.size > MAX_TRACK_BYTES)
      throw new Error('Choose a track file under 1 MB.');
    const buffer = Buffer.alloc(MAX_TRACK_BYTES + 1);
    let size = 0;
    while (size < buffer.length) {
      const { bytesRead } = await handle.read(
        buffer,
        size,
        buffer.length - size,
        size,
      );
      if (!bytesRead) break;
      size += bytesRead;
    }
    checkTrackFileSize(size);
    const document = parseTrackFile(buffer.toString('utf8', 0, size));
    return { document, updatedAt: info.mtimeMs };
  } finally {
    await handle.close();
  }
}

async function atomicWrite(path, text) {
  try {
    const info = await fs.lstat(path);
    if (!info.isFile() || info.isSymbolicLink())
      throw new Error('The track destination must be a regular file.');
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  const temporary = join(
    dirname(path),
    `.${basename(path)}.${randomUUID()}.tmp`,
  );
  let handle;
  try {
    handle = await fs.open(temporary, 'wx', 0o600);
    await handle.writeFile(text, 'utf8');
    await handle.sync();
    await handle.close();
    handle = null;
    await fs.rename(temporary, path);
  } finally {
    await handle?.close();
    await fs.unlink(temporary).catch((error) => {
      if (error.code !== 'ENOENT') throw error;
    });
  }
}

function createTrackStore(root) {
  let writes = Promise.resolve();
  async function directory() {
    await fs.mkdir(root, { recursive: true });
    const info = await fs.lstat(root);
    if (!info.isDirectory() || info.isSymbolicLink())
      throw new Error('The track library is unavailable.');
  }
  const filename = (id) => join(root, `${trackId(id)}.json`);
  function mutate(action) {
    const next = writes.then(action);
    writes = next.catch(() => {});
    return next;
  }
  return {
    async list() {
      await writes;
      await directory();
      const entries = await fs.readdir(root, { withFileTypes: true });
      const summaries = [];
      for (const entry of entries) {
        if (!entry.isFile() || !entry.name.endsWith('.json')) continue;
        const id = entry.name.slice(0, -5);
        if (!TRACK_ID_PATTERN.test(id)) continue;
        try {
          const { document, updatedAt } = await readTrackFile(filename(id));
          if (document.id !== id) continue;
          summaries.push({
            id,
            name: document.name,
            biome: document.biome,
            updatedAt,
          });
        } catch {
          // One damaged or externally replaced file must not hide other tracks.
        }
      }
      return summaries.sort(
        (a, b) => b.updatedAt - a.updatedAt || a.id.localeCompare(b.id),
      );
    },
    async read(id) {
      const path = filename(id);
      await writes;
      await directory();
      try {
        const { document } = await readTrackFile(path);
        if (document.id !== id)
          throw new Error('The track ID does not match its file.');
        return document;
      } catch (error) {
        if (error.code === 'ENOENT') return null;
        throw error;
      }
    },
    save(document) {
      const text = serializeTrack(document),
        path = filename(document.id);
      return mutate(async () => {
        await directory();
        const entries = await fs.readdir(root);
        if (
          !entries.includes(basename(path)) &&
          entries.filter(
            (name) =>
              TRACK_ID_PATTERN.test(name.slice(0, -5)) &&
              name.endsWith('.json'),
          ).length >= MAX_TRACKS
        )
          throw new Error(
            'The track library is full. Remove a track before saving another.',
          );
        await atomicWrite(path, text);
        return JSON.parse(text);
      });
    },
    remove(id) {
      const path = filename(id);
      return mutate(async () => {
        await directory();
        try {
          const info = await fs.lstat(path);
          if (!info.isFile() || info.isSymbolicLink())
            throw new Error('The track file could not be removed.');
          await fs.unlink(path);
          return true;
        } catch (error) {
          if (error.code === 'ENOENT') return false;
          throw error;
        }
      });
    },
  };
}

function registerTrackHandlers({
  ipcMain,
  dialog,
  getWindow,
  trustedSender,
  root,
}) {
  const store = createTrackStore(root);
  const actions = {
    list: () => store.list(),
    read: (id) => store.read(id),
    save: (document) => store.save(document),
    remove: (id) => store.remove(id),
    async import() {
      const result = await dialog.showOpenDialog(getWindow(), {
        title: 'Import track',
        properties: ['openFile'],
        filters: [{ name: 'Vector Nova track', extensions: ['json'] }],
      });
      if (result.canceled || !result.filePaths?.[0]) return null;
      return (await readTrackFile(result.filePaths[0], false)).document;
    },
    async export(document) {
      const text = serializeTrack(document);
      const result = await dialog.showSaveDialog(getWindow(), {
        title: 'Export track',
        defaultPath: trackExportName(document.name),
        filters: [{ name: 'Vector Nova track', extensions: ['json'] }],
      });
      if (result.canceled || !result.filePath) return null;
      await atomicWrite(result.filePath, text);
      return true;
    },
  };
  for (const [action, run] of Object.entries(actions))
    ipcMain.handle(`tracks:${action}`, (event, value) => {
      if (!trustedSender(event, getWindow()))
        throw new Error('Untrusted track request.');
      return run(value);
    });
}

module.exports = {
  createTrackStore,
  registerTrackHandlers,
  serializeTrack,
  MAX_TRACK_BYTES,
  MAX_TRACKS,
};
