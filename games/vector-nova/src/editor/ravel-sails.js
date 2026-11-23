import { createRavelCanopies } from '../levels/ravel/canopies.js';
import { createRavelFoilFinish } from '../levels/ravel/foil.js';

/** Place the production collector sheets beyond the seeded flight corridors. */
export function buildRavelSails({
  track,
  doc,
  placement,
  renderer,
  collectSolid,
}) {
  if (!track || collectSolid) return null;
  const length = track.finishDistance ?? track.length;
  const folded = doc.settings.sceneryPreset === 'folded-canopies-v1';
  const size = Math.min(1, length / 5800);
  const layout = [0.15, 0.34, 0.65, 0.86, 0.96]
    .slice(0, Math.round(2 + doc.settings.density * 3))
    .map((fraction, i) => ({
      s: length * fraction,
      length: (i % 2 ? 820 : 620) * size,
      width: (i % 2 ? 490 : 410) * size,
      side: (i % 2 ? 1 : -1) * (250 + 95 * size),
      ahead: 660 * size,
      lift: (i % 2 ? 174 : 138) * size + 40,
      sag: (folded ? 142 : 96) * size,
      yaw: i % 2 ? 0.21 : -0.33,
      lean: (i % 2 ? -245 : 225) * size,
      fold: folded && i === 1,
    }));
  const finish = createRavelFoilFinish(renderer);
  try {
    const sails = createRavelCanopies({
      track,
      layout,
      finish,
      clears: placement.clears,
    });
    return {
      group: sails.group,
      ready: finish.ready,
      get ownedTextures() {
        return finish.ownedTextures;
      },
      dispose() {
        sails.dispose();
        finish.dispose();
      },
    };
  } catch (error) {
    finish.dispose();
    throw error;
  }
}
