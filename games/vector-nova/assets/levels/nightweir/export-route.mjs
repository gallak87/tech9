import { writeFile } from 'node:fs/promises';
import { createNightweirTrack } from '../../../src/levels/nightweir/track/model.js';
const t = createNightweirTrack(),
  samples = [];
for (let s = 0; s <= t.length; s += 12) {
  const f = t.sample(s);
  samples.push({
    s,
    p: f.position.toArray(),
    t: f.tangent.toArray(),
    up: f.up.toArray(),
    right: f.right.toArray(),
    gap: t.isGap(s),
  });
}
await writeFile(
  'assets/levels/nightweir/route-source.json',
  JSON.stringify({
    length: t.length,
    finish: t.finishDistance,
    jumps: t.jumps,
    inversions: t.inversions,
    curtains: t.curtains,
    sections: t.sections,
    samples,
  }),
);
