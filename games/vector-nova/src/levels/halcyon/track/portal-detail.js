import { Vector3 } from 'three';
import { createSupportClearance } from './supports.js';

export function createPortalTrusses(track, layout) {
  const clears = createSupportClearance(track),
    chords = [],
    diagonals = [];
  const down = new Vector3(0, -6.4, 0);
  for (const { from, to } of layout.portals) {
    if (Math.abs(to.y - from.y) > 1) continue;
    const a = from.clone().add(down),
      b = to.clone().add(down);
    if (!clears(a, b, 1.55)) continue;
    const web = [];
    const count = Math.ceil(from.distanceTo(to) / 12);
    for (let i = 0; i < count; i++) {
      const p = from.clone().lerp(to, i / count),
        q = from.clone().lerp(to, (i + 1) / count);
      if (i % 2 === 0) p.add(down);
      else q.add(down);
      web.push({ from: p, to: q, width: 0.55, depth: 0.65 });
    }
    if (!web.every(({ from, to }) => clears(from, to, 0.65))) continue;
    chords.push({ from: a, to: b, width: 1.1, depth: 2.8 });
    diagonals.push(...web);
  }
  return { chords, diagonals };
}
