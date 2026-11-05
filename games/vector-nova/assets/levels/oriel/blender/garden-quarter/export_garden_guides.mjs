/** Capture the exact production road frames used to author the one-off quarter. */
import { writeFile } from 'node:fs/promises';
import { URL } from 'node:url';
import { createOrielTrack } from '../../../../../src/levels/oriel/track/model.js';

const track = createOrielTrack();
const points = [];
for (let s = -60; s <= 1150; s += 5) {
  const frame = track.sample(s);
  points.push({
    s,
    position: frame.position.toArray(),
    up: frame.up.toArray(),
    right: frame.right.toArray(),
    tangent: frame.tangent.toArray(),
  });
}
await writeFile(
  new URL('./road-guides.json', import.meta.url),
  JSON.stringify({ geometryVersion: track.geometryVersion, points }) + '\n',
);
