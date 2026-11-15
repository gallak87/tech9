import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import * as T from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

/** Node tests parse the real bundled meshes; native browser checks additionally
 * decode image files and compile their production finishes. */
export function mockBundledEditorAssets(t) {
  t.mock.method(GLTFLoader.prototype, 'loadAsync', async (url) => {
    assert.match(url, /^\/assets\/(?:levels|editor)\/[a-zA-Z0-9_./-]+\.glb$/);
    assert(!url.includes('..'));
    const bytes = await readFile(
      new URL(`../../public${url}`, import.meta.url),
    );
    return new GLTFLoader().parseAsync(
      bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
      '',
    );
  });
  t.mock.method(
    T.TextureLoader.prototype,
    'loadAsync',
    async () => new T.Texture(),
  );
}
