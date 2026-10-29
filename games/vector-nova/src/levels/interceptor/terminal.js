import { createProcessBuilder, seatProcessDistrict } from './construction.js';
import { emitTerminalPressureBody } from './terminal-pressure.js';
import { emitTerminalAccess } from './service-details.js';

export function createDispatchTerminal({ track, terrain, kit, palette }) {
  const b = createProcessBuilder(
    kit,
    'Dispatch / courier handling and lift terminal',
  );
  const { shell, steel, dark, cast, machined, amber } = kit.materials;
  const { foundation, cavity, copper, warm } = palette;
  b.box(foundation, [430, 34, 570], [-75, -76, 0], undefined, 3);
  b.box(cast, [378, 30, 516], [-75, -46, 0], undefined, 2);
  // The load path is a real open roller bed, seated into two thick service
  // housings with cut-away upper shoulders rather than a decorative portal.
  b.assembly('transferBed', [-22, -12, 0], 2.2);
  for (const x of [-165, 116]) {
    b.box(dark, [42, 110, 410], [x, 0, 0], undefined, 2.5);
    b.box(shell, [49, 17, 430], [x, 65, 0], undefined, 2);
    for (const z of [-170, -60, 65, 170]) {
      b.box(cast, [53, 31, 40], [x, -49, z], undefined, 1.5);
      b.box(steel, [45, 56, 9], [x, 0, z], undefined, 1);
    }
  }
  // Two different height towers carry a joined runway and the platen rails.
  b.assembly('counterweightGuide', [-208, 0, -180], 1.55);
  b.assembly('counterweight', [-208, 111, -180], 1.55);
  b.assembly('counterweightGuide', [-208, -31, 180], 1.35);
  b.assembly('counterweight', [-208, 72, 180], 1.35);
  for (const z of [-180, 180]) {
    b.box(cast, [59, 38, 76], [-208, -40, z], undefined, 2);
    b.beam(cast, [-208, 228, z], [-153, 265, z], 23, 32);
    b.beam(steel, [-153, 265, z], [103, 265, z], 19, 31);
    b.box(shell, [276, 11, 40], [-22, 283, z], undefined, 1.5);
    b.beam(cast, [103, 256, z], [108, 78, z], 21, 28);
  }
  for (const x of [-100, 70]) {
    b.box(dark, [20, 29, 408], [x, 267, 0], undefined, 1.3);
    b.box(machined, [8, 5, 412], [x, 285, 0], undefined, 0.5);
    for (const z of [-90, 90])
      b.box(steel, [3.2, 105, 3.2], [x, 212, z], undefined, 0.3);
  }
  // Suspended load platen is attached through four guide rods and an obvious
  // central lift carriage; its underside remains an open, deep working space.
  b.box(dark, [214, 25, 236], [-14, 153, 0], undefined, 2);
  b.box(shell, [223, 12, 244], [-14, 171, 0], undefined, 2);
  for (const x of [-93, 65])
    b.box(cast, [22, 49, 201], [x, 125, 0], undefined, 1.3);
  b.box(amber, [218, 9, 19], [-14, 157, -126], undefined, 1);
  b.box(cavity, [55, 32, 83], [-14, 206, 0], undefined, 2);
  b.box(machined, [13, 49, 13], [-14, 244, 0], undefined, 0.6);
  // A low joined service spine is subordinate to the open lifting silhouette.
  for (const z of [-195, 0, 195]) {
    b.box(cast, [43, 155, 30], [-264, 22, z], undefined, 1.5);
    b.beam(cast, [-261, 100, z], [-203, 139, z], 13, 18);
  }
  for (const y of [50, 135]) {
    b.box(steel, [90, 14, 430], [-242, y, 0], undefined, 1);
    b.box(shell, [12, 18, 436], [-192, y + 2, 0], undefined, 1);
    b.box(warm, [2.5, 3, 125], [-184, y - 8, -94], undefined, 0.3);
  }
  b.pipe(
    [
      [-250, 40, -197],
      [-265, 40, -215],
      [-265, 173, -215],
      [-211, 195, -215],
      [-199, 210, -180],
    ],
    9,
    copper,
  );
  b.box(steel, [350, 12, 415], [-22, -25, 0], undefined, 1.4);
  emitTerminalPressureBody(b, kit, palette);
  emitTerminalAccess(b, kit, warm);
  const result = seatProcessDistrict(b.finish(), track, {
    fraction: 0.105,
    side: -1,
    offset: 260,
    y: 82,
  });
  const position = result.group.position.clone();
  terrain.seat({
    position,
    quaternion: result.group.quaternion,
    width: 620,
    depth: 610,
    height: -12,
  });
  return result;
}
