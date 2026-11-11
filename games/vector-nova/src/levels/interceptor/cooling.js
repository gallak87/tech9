import { createProcessBuilder, seatProcessDistrict } from './construction.js';
import { emitFinishedCoolingBank } from './cooling-finish.js';

export function createDispatchCooling({ track, terrain, kit, palette }) {
  const b = createProcessBuilder(
    kit,
    'Dispatch / low-pressure cooling and induction exchange',
  );
  const { shell, steel, dark, cast, machined } = kit.materials;
  const { foundation, cavity, copper, warm } = palette;
  b.box(foundation, [526, 32, 610], [-39, -70, 87], undefined, 3);
  b.box(cast, [480, 20, 564], [-39, -43, 87], undefined, 2);
  // Actual recessed impellers, thick formed hoods and closed throats from the
  // approved production kit are the process, with unequal secondary banks.
  emitFinishedCoolingBank(b, kit, [44, 0, -29], 2.25, palette.rotorMetal);
  emitFinishedCoolingBank(b, kit, [-164, -8, 217], 1.65, palette.rotorMetal);
  b.box(cavity, [158, 142, 190], [-137, 44, -89], undefined, 2.5);
  b.box(shell, [172, 12, 205], [-137, 122, -89], undefined, 1.8);
  for (const x of [-203, -74])
    b.box(cast, [19, 159, 208], [x, 37, -89], undefined, 1.5);
  // A coarse, deep copper return heat pack connects the two fan chambers.
  for (let z = -160; z < 300; z += 25) {
    b.box(copper, [101, 5, 16], [-190, 153, z], undefined, 0.7);
    b.box(copper, [101, 5, 16], [-190, 184, z], undefined, 0.7);
  }
  for (const x of [-247, -132]) {
    b.box(dark, [13, 130, 499], [x, 105, 67], undefined, 1.2);
    b.box(steel, [23, 7, 514], [x, 214, 67], undefined, 1.1);
  }
  b.pipe(
    [
      [100, 118, -160],
      [144, 118, -163],
      [164, 143, -130],
      [164, 143, 231],
      [126, 111, 264],
      [-103, 110, 264],
    ],
    14.5,
  );
  b.pipe(
    [
      [44, 218, -24],
      [44, 250, -24],
      [-2, 270, 2],
      [-176, 270, 68],
      [-199, 231, 100],
    ],
    10.5,
    copper,
  );
  for (const z of [-113, 60, 237]) {
    b.box(cast, [53, 167, 35], [164, 33, z], undefined, 2);
    b.box(machined, [49, 12, 39], [164, 118, z], undefined, 1);
  }
  // Service deck joins machinery through deep supports; it stays out of the
  // race envelope and leaves the visible circular working cavities open.
  b.box(steel, [390, 15, 57], [-44, 65, 358], undefined, 1.5);
  b.box(shell, [398, 12, 12], [-44, 71, 325], undefined, 1);
  for (const x of [-206, -38, 123]) {
    b.box(cast, [32, 111, 43], [x, 9, 358], undefined, 1.8);
    b.beam(cast, [x, 43, 350], [x, 18, 307], 12, 17);
  }
  b.box(warm, [112, 3, 2], [54, 59, 321], undefined, 0.3);
  const result = seatProcessDistrict(b.finish(), track, {
    fraction: 0.76,
    side: -1,
    offset: 340,
    y: 30,
  });
  terrain.seat({
    position: result.group.position,
    quaternion: result.group.quaternion,
    width: 630,
    depth: 850,
    height: -57,
  });
  return result;
}
