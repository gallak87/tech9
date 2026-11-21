import { writeFile } from 'node:fs/promises';
import { generateDocument } from '../src/editor/document.js';
import { PLAYABLE_STARTERS } from '../src/editor/playable-starters.js';
import { editorRouteOutline } from '../src/editor/route-outline.js';

// Bake the palette at authoring time so opening the editor never generates four roads.
const outlines = Object.fromEntries(
  PLAYABLE_STARTERS.map(({ id, options }) => {
    const { path } = editorRouteOutline(generateDocument(options));
    return [id, path];
  }),
);
await writeFile(
  new URL('../src/editor/starter-outlines.json', import.meta.url),
  JSON.stringify(outlines, null, 2) + '\n',
);
