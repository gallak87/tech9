import { createParts, hullSection } from './geometry.js';
import {
  pressureConcourse,
  cargoRack,
  craneFinish,
  hullFinish,
  habitatFinish,
  freightDeckFinish,
} from './finish.js';
import {
  manufacturedDecks,
  manufacturedPressureBodies,
  inhabitedGlass,
  fabricatedCrossGirder,
  manufacturedFascia,
} from './manufactured.js';

const pi = Math.PI;

function truss(parts, from, to, width, depth, bays = 8) {
  const [x, y, z] = from;
  const [ex, ey, ez] = to;
  for (const side of [-1, 1])
    for (const vertical of [-1, 1])
      parts.beam(
        'titanium',
        [x + (side * width) / 2, y + (vertical * depth) / 2, z],
        [ex + (side * width) / 2, ey + (vertical * depth) / 2, ez],
        1.25,
      );
  for (let i = 0; i < bays; i += 1) {
    const a = i / bays,
      b = (i + 1) / bays;
    const za = z + (ez - z) * a,
      zb = z + (ez - z) * b;
    const ya = y + (ey - y) * a,
      yb = y + (ey - y) * b;
    for (const side of [-1, 1]) {
      const xa = x + (ex - x) * a + (side * width) / 2;
      const xb = x + (ex - x) * b + (side * width) / 2;
      parts.beam(
        'dark',
        [xa, ya - depth / 2, za],
        [xb, yb + depth / 2, zb],
        0.85,
      );
      parts.beam(
        'titanium',
        [xa, ya + depth / 2, za],
        [xa, ya - depth / 2, za],
        0.8,
      );
    }
  }
}

function windows(parts, x, y, from, count, side, spacing = 4.2) {
  for (let i = 0; i < count; i += 1) {
    parts.add(
      'box',
      i % 7 === 0 ? 'black' : 'glass',
      [x, y, from + i * spacing],
      [0.28, 1.4, 2.65],
      [0, 0, 0],
      true,
    );
    if (i % 8 === 0)
      parts.add(
        'box',
        'amber',
        [x + side * 0.2, y - 1.8, from + i * spacing],
        [0.32, 0.25, 1.8],
        [0, 0, 0],
        true,
      );
  }
}

function engine(parts, x, y, z, scale = 1) {
  const rotation = [pi / 2, 0, 0];
  parts.add(
    'taper',
    'ivory',
    [x, y, z + 4 * scale],
    [22 * scale, 23 * scale, 22 * scale],
    rotation,
  );
  parts.add(
    'tube',
    'dark',
    [x, y, z],
    [18 * scale, 21 * scale, 18 * scale],
    rotation,
  );
  parts.add(
    'tube',
    'black',
    [x, y, z - 10.6 * scale],
    [13.5 * scale, 0.5 * scale, 13.5 * scale],
    rotation,
  );
  for (const dz of [-11, -6, 3, 9])
    parts.add(
      'ring',
      dz === -11 ? 'titanium' : 'dark',
      [x, y, z + dz * scale],
      [18 * scale, 18 * scale, 10 * scale],
    );
  for (let i = 0; i < 12; i += 1) {
    const angle = (i * pi) / 6;
    parts.add(
      'box',
      'titanium',
      [
        x + Math.cos(angle) * 8.8 * scale,
        y + Math.sin(angle) * 8.8 * scale,
        z + scale,
      ],
      [1.25 * scale, 1.25 * scale, 15 * scale],
      [0, 0, angle],
      true,
    );
  }
}

function ship(parts, { unfinished = false, scale = 1 } = {}) {
  // Heavy survey tender with two raised shoulder decks and a narrow prow.
  // The second hull shares its construction logic but exposes the forward ribs.
  const stations = [
    [-190, 27, 15],
    [-161, 40, 19],
    [-108, 46, 22],
    [-45, 44, 22],
    [24, 38, 19],
    [82, 28, 14],
    [135, 18, 9],
    [183, 3, 2],
  ].map(([z, w, h]) => [z * scale, w * scale, h * scale]);
  for (let i = 0; i < stations.length - 1; i += 1) {
    const [a, wa, ha] = stations[i];
    const [b, wb, hb] = stations[i + 1];
    if (!unfinished || i < 3)
      parts.add(
        hullSection(a, b, wa * 0.94, wb * 0.94, ha * 0.8, hb * 0.8),
        'dark',
        [0, 0, 0],
      );
    if (!unfinished || i < 3) {
      parts.add(
        hullSection(a + 1.1, b - 1.1, wa, wb, ha, hb),
        i % 3 === 0 ? 'ivory' : 'ceramic',
        [0, 1.8 * scale, 0],
      );
      // A separate raised thermal tile interrupts each large facet.
      if (i < 5)
        for (const side of [-1, 1]) {
          parts.add(
            'panel',
            'ivory',
            [side * (wa + wb) * 0.13, (ha + hb) / 2 + 2.5 * scale, (a + b) / 2],
            [(wa + wb) * 0.17, 1.1 * scale, (b - a) * 0.8],
          );
          parts.add(
            'box',
            'dark',
            [side * (wa + wb) * 0.06, (ha + hb) / 2 + 3.1 * scale, (a + b) / 2],
            [0.6 * scale, 0.15 * scale, (b - a) * 0.7],
            [0, 0, 0],
            true,
          );
        }
    }
  }
  if (unfinished) {
    // Open forward construction bay: no skin, real ribs with sky between them.
    for (let z = 5; z < 173; z += 24) {
      const width = (41 - z * 0.205) * scale;
      const height = width * 0.52;
      for (const side of [-1, 1]) {
        parts.beam(
          'titanium',
          [0, height, z * scale],
          [side * width, height * 0.14, z * scale],
          1.7 * scale,
        );
        parts.beam(
          'titanium',
          [side * width, height * 0.14, z * scale],
          [0, -height, z * scale],
          1.7 * scale,
        );
      }
      parts.add(
        'panel',
        'vermilion',
        [width * 0.63, height * 0.43, z * scale],
        [width * 0.66, 1.6 * scale, 5 * scale],
        [0, 0, -0.4],
      );
    }
    for (const side of [-1, 1])
      parts.beam(
        'dark',
        [side * 36 * scale, 3, 0],
        [side * 4 * scale, 3, 178 * scale],
        3 * scale,
      );
  }
  // Twin aft shoulders make an asymmetric working ship, not an aircraft.
  for (const side of [-1, 1]) {
    parts.add(
      'panel',
      'ceramic',
      [side * 36 * scale, 18 * scale, -86 * scale],
      [24 * scale, 21 * scale, 104 * scale],
    );
    parts.add(
      'panel',
      'dark',
      [side * 40 * scale, 29 * scale, -89 * scale],
      [13 * scale, 2.3 * scale, 76 * scale],
    );
    for (let i = 0; i < 10; i += 1)
      parts.add(
        'box',
        'titanium',
        [side * 40 * scale, 30.5 * scale, (-119 + i * 6.5) * scale],
        [10 * scale, 0.5 * scale, 0.8 * scale],
        [0, 0, 0],
        true,
      );
    parts.add(
      'box',
      'vermilion',
      [side * 48.2 * scale, 15 * scale, -100 * scale],
      [0.3 * scale, 5.2 * scale, 39 * scale],
    );
    windows(
      parts,
      side * 48.2 * scale,
      24.6 * scale,
      -126 * scale,
      20,
      side,
      4 * scale,
    );
    engine(parts, side * 22 * scale, -4 * scale, -200 * scale, 1.1 * scale);
    engine(parts, side * 44 * scale, 13 * scale, -174 * scale, 0.72 * scale);
  }
  // Bridge is offset toward port, leaving a clear cargo spine along the centre.
  parts.add(
    'panel',
    'dark',
    [-9 * scale, 29 * scale, -21 * scale],
    [32 * scale, 15 * scale, 52 * scale],
  );
  parts.add(
    'panel',
    'ceramic',
    [-9 * scale, 37 * scale, -23 * scale],
    [36 * scale, 3 * scale, 59 * scale],
  );
  parts.add(
    'panel',
    'glass',
    [-9 * scale, 31 * scale, 4 * scale],
    [26 * scale, 5 * scale, 1.2 * scale],
    [0.22, 0, 0],
  );
  parts.add(
    'box',
    'glass',
    [-25.2 * scale, 31 * scale, -20 * scale],
    [0.3 * scale, 4 * scale, 42 * scale],
  );
  parts.add(
    'box',
    'amber',
    [-24 * scale, 36 * scale, -5 * scale],
    [2.5 * scale, 0.45 * scale, 2.5 * scale],
  );
  for (let i = 0; i < 9; i += 1) {
    parts.add(
      'box',
      'dark',
      [-25.5 * scale, 31 * scale, (-39 + i * 4.5) * scale],
      [0.5 * scale, 4.8 * scale, 0.45 * scale],
      [0, 0, 0],
      true,
    );
    parts.add(
      'panel',
      'ivory',
      [12 * scale, 25 * scale, (-119 + i * 15) * scale],
      [10 * scale, 5 * scale, 9 * scale],
    );
  }
  parts.beam(
    'titanium',
    [-13 * scale, 39 * scale, -41 * scale],
    [-13 * scale, 58 * scale, -43 * scale],
    1.1 * scale,
  );
  parts.add(
    'dish',
    'ceramic',
    [-13 * scale, 57 * scale, -43 * scale],
    [12 * scale, 8 * scale, 12 * scale],
    [0.8, 0, 0],
  );
}

export function drydock({ unfinished = false, scale = 1 } = {}) {
  const parts = createParts();
  ship(parts, { unfinished, scale });
  for (const side of [-1, 1]) {
    const x = side * 72 * scale;
    truss(
      parts,
      [x, -34 * scale, -234 * scale],
      [x, -34 * scale, 208 * scale],
      9 * scale,
      13 * scale,
      16,
    );
    parts.add(
      'box',
      'ivory',
      [x, -27 * scale, -10 * scale],
      [10 * scale, 2 * scale, 451 * scale],
    );
    parts.add(
      'box',
      'amber',
      [x + side * 5 * scale, -26 * scale, -10 * scale],
      [0.65 * scale, 0.5 * scale, 440 * scale],
    );
    for (const z of [-148, -28, 112]) {
      // Cradles keep their large negative space. A crane rail runs above one side.
      parts.beam(
        'titanium',
        [x, -34 * scale, z * scale],
        [x, 62 * scale, z * scale],
        4 * scale,
      );
      parts.beam(
        'dark',
        [x, 47 * scale, z * scale],
        [x * 0.53, 67 * scale, z * scale],
        3.5 * scale,
      );
      parts.add(
        'panel',
        'ivory',
        [x, 34 * scale, z * scale],
        [9 * scale, 34 * scale, 11 * scale],
      );
      parts.add(
        'box',
        'vermilion',
        [x + side * 5 * scale, 35 * scale, z * scale],
        [0.5 * scale, 3 * scale, 9 * scale],
      );
      parts.add(
        'box',
        'amber',
        [x, 63 * scale, z * scale],
        [4 * scale, 1.2 * scale, 4 * scale],
      );
      parts.beam(
        'titanium',
        [x, -28 * scale, z * scale],
        [side * 36 * scale, -19 * scale, z * scale],
        5 * scale,
      );
      parts.add(
        'panel',
        'black',
        [side * 38 * scale, -14 * scale, z * scale],
        [17 * scale, 8 * scale, 15 * scale],
      );
    }
    truss(
      parts,
      [x, 65 * scale, -153 * scale],
      [x, 65 * scale, 118 * scale],
      5 * scale,
      5 * scale,
      12,
    );
  }
  for (const z of [-178, -70, 55, 163]) fabricatedCrossGirder(parts, z, scale);
  pressureConcourse(parts, scale);
  hullFinish(parts, scale);
  return parts;
}

export function solarGarden({ wings = 3, radiator = false } = {}) {
  const parts = createParts();
  truss(parts, [0, 0, -wings * 26], [0, 0, wings * 26], 7, 8, wings * 4);
  for (let i = 0; i < wings; i += 1) {
    const z = (i - (wings - 1) / 2) * 54;
    for (const side of [-1, 1]) {
      const x = side * 65;
      parts.beam('titanium', [0, 0, z], [side * 112, 0, z], 2);
      parts.add('panel', 'dark', [x, 0, z], [88, 1.1, 44]);
      for (let row = 0; row < 4; row += 1)
        for (let col = 0; col < 8; col += 1) {
          parts.add(
            'box',
            radiator ? 'ivory' : 'solar',
            [x + (col - 3.5) * 10.4, 0.9, z + (row - 1.5) * 10.3],
            [9.75, 0.4, 9.5],
          );
          parts.add(
            'box',
            'titanium',
            [x + (col - 3.5) * 10.4, 1.15, z + (row - 1.5) * 10.3],
            [0.13, 0.2, 9.5],
            [0, 0, 0],
            true,
          );
        }
      parts.add('tube', 'ivory', [side * 12, 0, z], [7, 10, 7], [0, 0, pi / 2]);
    }
  }
  parts.add('panel', 'ceramic', [0, 4, 0], [18, 14, 39]);
  parts.add('box', 'amber', [0, 11.3, 0], [9, 0.4, 2]);
  return parts;
}

export function habitat() {
  const parts = createParts();
  // Terraced habitation head, hanging pressure laboratories and a rotary drum.
  for (const [y, width, length] of [
    [0, 92, 102],
    [15, 76, 86],
    [30, 54, 65],
  ]) {
    parts.add('panel', 'dark', [0, y, 0], [width, 10, length]);
    parts.add('panel', 'dark', [0, y + 7.3, 0], [width - 9, 5.5, length - 10]);
    for (const side of [-1, 1]) {
      parts.add(
        'box',
        'glass',
        [side * (width / 2 - 4.1), y + 7.6, 0],
        [0.4, 3.7, length - 15],
      );
      for (let z = -length / 2 + 12; z < length / 2 - 8; z += 7)
        parts.add(
          'box',
          'ceramic',
          [side * (width / 2 - 3.8), y + 7.6, z],
          [0.7, 4.2, 0.5],
          [0, 0, 0],
          true,
        );
    }
  }
  parts.add('panel', 'enamel', [0, 41, 0], [62, 3, 71]);
  parts.add('panel', 'black', [-11, 44, -5], [15, 4, 27]);
  for (const side of [-1, 1]) {
    parts.add(
      'tube',
      'dark',
      [side * 31, -26, 0],
      [22, 55, 22],
      [pi / 2, 0, 0],
    );
    for (const z of [-22, 0, 22])
      parts.add('ring', 'titanium', [side * 31, -26, z], [23, 23, 11]);
    parts.beam('dark', [side * 30, -7, -22], [side * 31, -26, -22], 4);
    parts.beam('dark', [side * 30, -7, 22], [side * 31, -26, 22], 4);
    parts.add('box', 'amber', [side * 39, 5.8, 44], [6, 0.3, 1.4]);
  }
  parts.add('tube', 'titanium', [0, -50, 0], [11, 90, 11], [0, 0, pi / 2]);
  parts.add('tube', 'dark', [0, -51, 0], [38, 44, 38], [0, 0, pi / 2]);
  for (const x of [-19, -10, 10, 19])
    parts.add(
      'ring',
      x === -10 || x === 10 ? 'glass' : 'dark',
      [x, -51, 0],
      [38, 38, 10],
      [0, pi / 2, 0],
    );
  parts.beam('titanium', [0, 43, -22], [0, 79, -25], 1.3);
  parts.add('dish', 'ceramic', [0, 74, -25], [25, 14, 25], [0.4, 0, -0.2]);
  parts.add('tube', 'dark', [34, 46, -25], [2, 18, 2]);
  parts.add('box', 'amber', [34, 56, -25], [1.8, 1.2, 1.8]);
  habitatFinish(parts);
  manufacturedDecks(parts);
  manufacturedFascia(parts);
  manufacturedPressureBodies(parts);
  inhabitedGlass(parts);
  return parts;
}

export function freightPort() {
  const parts = createParts();
  parts.add('panel', 'dark', [0, -6, 0], [116, 14, 142]);
  parts.add('panel', 'ivory', [0, 2, 0], [120, 3, 149]);
  for (const side of [-1, 1]) {
    parts.add('box', 'amber', [side * 57, 3.8, 0], [0.7, 0.3, 140]);
    truss(parts, [side * 48, -17, -70], [side * 48, -17, 70], 5, 10, 8);
  }
  for (let row = 0; row < 4; row += 1)
    for (let col = 0; col < 3; col += 1)
      cargoRack(parts, -34 + col * 23, -43 + row * 30, (row + col) % 3);
  // Offset unloading crane with a hanging clamp, parked clear of the circuit.
  parts.beam('titanium', [47, 4, -49], [47, 66, -49], 6);
  parts.beam('titanium', [47, 66, -49], [-51, 66, -49], 4);
  parts.beam('dark', [47, 46, -49], [-19, 66, -49], 2);
  parts.beam('titanium', [-35, 66, -49], [-35, 35, -49], 0.75);
  parts.add('panel', 'amber', [-35, 34, -49], [17, 3, 19]);
  parts.add('panel', 'ivory', [43, 57, -49], [16, 10, 15]);
  parts.add('box', 'glass', [34.5, 58, -49], [0.5, 4, 10]);
  craneFinish(parts);
  freightDeckFinish(parts);
  return parts;
}

export function relay() {
  const parts = createParts();
  truss(parts, [0, -88, 0], [0, 70, 0.01], 11, 1, 8);
  parts.add('tube', 'dark', [0, 0, 0], [12, 139, 12]);
  for (const y of [-70, -32, 20, 52]) {
    parts.add('panel', 'ceramic', [0, y, 0], [29, 7, 26]);
    parts.add('box', 'amber', [0, y + 3.8, 12], [15, 0.7, 0.6]);
  }
  for (const side of [-1, 1]) {
    parts.beam('titanium', [0, 30, 0], [side * 30, 50, 0], 2);
    parts.add(
      'dish',
      'ceramic',
      [side * 36, 50, 0],
      [48, 26, 48],
      [0.2, 0, side * -0.7],
    );
  }
  parts.add('tube', 'titanium', [0, 86, 0], [1.4, 38, 1.4]);
  parts.add('box', 'amber', [0, 105, 0], [2.4, 1.4, 2.4]);
  return parts;
}
