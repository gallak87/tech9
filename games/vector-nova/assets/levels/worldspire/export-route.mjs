import { writeFile } from 'node:fs/promises';
import { createWorldspireTrack } from '../../../src/levels/worldspire/track/model.js';
// Run from the app root before build_assets.py. Same authored frames as gameplay.
const track = createWorldspireTrack(),
  samples = [];
for (let s = 0; s <= track.length; s += 12) {
  const f = track.sample(s);
  samples.push({
    s,
    p: f.position.toArray(),
    t: f.tangent.toArray(),
    up: f.up.toArray(),
    right: f.right.toArray(),
    gap: track.isGap(s),
  });
}
await writeFile(
  'assets/levels/worldspire/route-source.json',
  JSON.stringify({
    spireHeight: track.spireHeight,
    length: track.length,
    finish: track.finishDistance,
    interior: track.interior,
    interiors: track.interiors,
    inversion: track.inversion,
    inversions: track.inversions,
    sections: track.sections,
    jumps: track.jumps,
    samples,
  }),
);
