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
  const size = Math.min(1.25, Math.max(0.56, length / 5200));
  const random = placement.random;
  const firstSide = random() < 0.5 ? -1 : 1;
  const count = Math.round(2 + doc.settings.density * 4);
  const layout = Array.from({ length: count }, (_, i) => {
    const side = i % 2 ? -firstSide : firstSide;
    const width = (670 + random() * 315) * size;
    return {
      s: (length * (i + 0.3 + random() * 0.44)) / count,
      length: (820 + random() * 410) * size,
      width,
      side: side * (0.5 * width + track.width * 0.5 + 125),
      lateralClearanceStep: side * (width * 0.42 + 100),
      ahead: (180 + random() * 210) * size,
      lift: (310 + random() * 158) * size,
      sag: (folded ? 185 : 120) * size,
      yaw: side * (0.28 + random() * 0.3),
      lean: -side * (260 + random() * 115) * size,
      fold: folded && i % 3 === 1,
    };
  });
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
