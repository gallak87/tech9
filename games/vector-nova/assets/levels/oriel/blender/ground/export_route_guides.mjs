import { writeFile } from 'node:fs/promises';
import { URL } from 'node:url';
import { log } from 'node:console';
import { createOrielTrack } from '../../../../../src/levels/oriel/track/model.js';

// Run with Node22 before build_ground.py after changing the route. The Blender
// source uses these guides to keep its land behind the driving/camera envelope.
const track = createOrielTrack();
const points = [];
for (let s = 0; s < track.length; s += 12) {
  const frame = track.sample(s);
  points.push({
    s,
    position: frame.position.toArray(),
    up: frame.up.toArray(),
    right: frame.right.toArray(),
  });
}
await writeFile(
  new URL('./route-guides.json', import.meta.url),
  JSON.stringify({
    geometryVersion: track.geometryVersion,
    length: track.length,
    width: track.width,
    habitat: track.habitat,
    points,
  }),
);
log(
  `Exported ${points.length} Oriel ground guides for ${track.geometryVersion}.`,
);
