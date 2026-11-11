import { readFile } from 'node:fs/promises';

/** Exercise the actual public GLB loader in Node without browser image loading. */
export function allowWorldkitAssetReads(t) {
  const fetch = globalThis.fetch;
  t.mock.method(globalThis, 'fetch', async (request, options) => {
    const url = typeof request === 'string' ? request : request.url;
    if (!url.startsWith('file:')) return fetch(request, options);
    const bytes = await readFile(new URL(url));
    return new Response(bytes, {
      headers: { 'Content-Length': String(bytes.byteLength) },
    });
  });
  if (!globalThis.ProgressEvent) {
    globalThis.ProgressEvent = class ProgressEvent {
      constructor(type, values) {
        this.type = type;
        Object.assign(this, values);
      }
    };
    t.after(() => delete globalThis.ProgressEvent);
  }
}
