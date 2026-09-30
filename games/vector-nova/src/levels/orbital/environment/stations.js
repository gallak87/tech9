import { createParts } from './geometry.js';

const pi = Math.PI;

function pressureTank(parts, x, y, z, diameter = 22, length = 60) {
  parts.add('tube', 'ivory', [x, y, z], [diameter, length, diameter]);
  for (const side of [-1, 1]) {
    parts.add(
      'sphere',
      'ceramic',
      [x, y + (side * length) / 2, z],
      [diameter, diameter * 0.58, diameter],
    );
    parts.add(
      'ring',
      'dark',
      [x, y + side * (length / 2 - 2), z],
      [diameter, diameter, diameter * 0.26],
      [pi / 2, 0, 0],
    );
    parts.add(
      'tube',
      'titanium',
      [x, y + side * (length / 2 + diameter * 0.2), z],
      [diameter * 0.23, diameter * 0.36, diameter * 0.23],
    );
  }
  for (const angle of [0, pi / 2, pi, pi * 1.5]) {
    const tx = x + Math.cos(angle) * diameter * 0.5;
    const tz = z + Math.sin(angle) * diameter * 0.5;
    parts.add(
      'box',
      'titanium',
      [tx, y, tz],
      [0.85, length * 0.8, 0.85],
      [0, angle, 0],
    );
  }
}

export function fuelDepot() {
  const parts = createParts();
  // Three separately cradled cryogenic pressure vessels, a manifold bridge and
  // service spine. Circular ends and seam collars distinguish this district.
  for (const [x, z] of [
    [-32, 0],
    [0, 18],
    [32, 0],
  ]) {
    pressureTank(parts, x, 5, z, 24, 61);
    for (const side of [-1, 1]) {
      parts.beam(
        'dark',
        [x + side * 15, -45, z - 16],
        [x + side * 15, 29, z - 16],
        2.5,
      );
      parts.beam(
        'titanium',
        [x + side * 15, 29, z - 16],
        [x + side * 10, 26, z],
        1.6,
      );
      parts.beam(
        'dark',
        [x + side * 15, -45, z - 16],
        [x + side * 10, -23, z],
        1.6,
      );
    }
    parts.add('tube', 'titanium', [x, -37, z], [4, 16, 4]);
    parts.add('panel', 'vermilion', [x, 11, z + 12.3], [10, 4, 0.5]);
    parts.add('box', 'black', [x, -3, z + 12.4], [6, 15, 0.35]);
    for (let i = 0; i < 6; i += 1)
      parts.add(
        'box',
        'ivory',
        [x, -8 + i * 2.2, z + 12.7],
        [4, 0.5, 0.5],
        [0, 0, 0],
        true,
      );
  }
  parts.add('tube', 'titanium', [0, -43, 0], [5, 94, 5], [0, 0, pi / 2]);
  parts.add('box', 'dark', [0, -48, -16], [102, 6, 18]);
  parts.add('panel', 'ceramic', [59, -29, -14], [25, 28, 34]);
  parts.add('panel', 'black', [59, -26, 3.5], [20, 18, 0.6]);
  parts.add('box', 'glass', [59, -23, 4], [17, 8, 0.4]);
  for (const x of [52, 58, 64])
    parts.add('box', 'titanium', [x, -23, 4.6], [0.65, 9, 0.6]);
  parts.add('box', 'amber', [59, -15, 4], [9, 0.65, 0.5]);
  for (const x of [-42, -16, 16, 42]) {
    parts.add('ring', 'ivory', [x, -43, 0], [7, 7, 4], [0, pi / 2, 0]);
    parts.add('tube', 'dark', [x, -40, 7], [1.8, 14, 1.8], [pi / 2, 0, 0]);
  }
  parts.beam('titanium', [0, -47, -24], [0, -47, -111], 3);
  for (const side of [-1, 1]) {
    parts.add('panel', 'solar', [side * 40, -45, -87], [65, 1.5, 47]);
    for (let x = 13; x < 70; x += 10)
      parts.add('box', 'titanium', [side * x, -44, -87], [0.45, 0.4, 46]);
  }
  return parts;
}

export function observatory() {
  const parts = createParts();
  // A paired optical interferometer: open precision arms and two very distinct
  // apertures. One broad shield and small offset service bus break symmetry.
  parts.add('panel', 'dark', [0, 0, 0], [35, 20, 64]);
  parts.add('panel', 'ceramic', [0, 13, 0], [39, 5, 69]);
  for (const [x, radius, height] of [
    [-48, 23, 28],
    [42, 17, 40],
  ]) {
    parts.beam('dark', [0, 0, -10], [x, height, -10], 5);
    parts.beam('titanium', [0, 0, 21], [x, height, 21], 3);
    parts.add(
      'tube',
      'ivory',
      [x, height, 1],
      [radius * 2, 60, radius * 2],
      [pi / 2, 0, 0],
    );
    parts.add(
      'tube',
      'black',
      [x, height, 31.4],
      [radius * 1.78, 1, radius * 1.78],
      [pi / 2, 0, 0],
    );
    parts.add(
      'ring',
      'ceramic',
      [x, height, 31.8],
      [radius * 2, radius * 2, 10],
    );
    parts.add(
      'ring',
      'dark',
      [x, height, 34],
      [radius * 1.62, radius * 1.62, 5],
    );
    parts.add(
      'sphere',
      'glass',
      [x, height, 30.8],
      [radius * 1.25, radius * 1.25, 1.5],
    );
    parts.add(
      'tube',
      'titanium',
      [x, height, 34.5],
      [radius * 0.25, 2.5, radius * 0.25],
      [pi / 2, 0, 0],
    );
    for (let tile = 0; tile < 12; tile += 1) {
      const angle = (tile * pi) / 6;
      for (const z of [-18, 1, 18]) {
        parts.add(
          'panel',
          tile % 3 === 0 ? 'ivory' : 'ceramic',
          [
            x + Math.cos(angle) * radius * 1.013,
            height + Math.sin(angle) * radius * 1.013,
            z,
          ],
          [radius * 0.47, 0.9, 15.7],
          [0, 0, angle - pi / 2],
        );
        if (tile % 3 === 0)
          parts.add(
            'box',
            'dark',
            [
              x + Math.cos(angle) * radius * 1.04,
              height + Math.sin(angle) * radius * 1.04,
              z,
            ],
            [radius * 0.21, 0.45, 11],
            [0, 0, angle - pi / 2],
          );
      }
    }
    for (const angle of [0, (pi * 2) / 3, (pi * 4) / 3])
      parts.beam(
        'titanium',
        [x, height, 33],
        [
          x + Math.cos(angle) * radius * 0.8,
          height + Math.sin(angle) * radius * 0.8,
          33,
        ],
        0.7,
      );
    for (const z of [-23, -6, 11])
      parts.add(
        'ring',
        'titanium',
        [x, height, z],
        [radius * 2.02, radius * 2.02, 6],
      );
  }
  parts.add('panel', 'ivory', [9, -17, -13], [29, 15, 33]);
  parts.add('box', 'glass', [9, -15, 4.1], [20, 5, 0.4]);
  for (const side of [-1, 1]) {
    parts.beam('titanium', [side * 13, -9, -20], [side * 83, -23, -64], 2);
    for (let i = 0; i < 3; i += 1) {
      const x = side * (35 + i * 30);
      parts.add(
        'panel',
        'solar',
        [x, -24, -71],
        [27, 1.2, 85],
        [0, 0, side * -0.16],
      );
      for (const z of [-108, -80, -52, -32])
        parts.add('box', 'titanium', [x, -23, z], [26, 0.3, 0.5]);
    }
  }
  parts.add('tube', 'titanium', [17, -38, 0], [1.4, 40, 1.4]);
  parts.add('dish', 'ceramic', [17, -57, 0], [22, 12, 22], [pi, 0, 0]);
  return parts;
}

export function wheelStation() {
  const parts = createParts();
  // A single occupied wheel, built from pressure modules on two circular rails.
  // The hub is offset rather than repeating four identical rings on a dumbbell.
  for (const x of [-9, 9])
    parts.add('ring', 'dark', [x, 0, 0], [145, 145, 9], [0, pi / 2, 0]);
  for (let i = 0; i < 20; i += 1) {
    const angle = (i * pi) / 10;
    const y = Math.cos(angle) * 70,
      z = Math.sin(angle) * 70;
    parts.add(
      'panel',
      i % 5 === 0 ? 'ivory' : 'ceramic',
      [0, y, z],
      [27, 14, 18],
      [angle, 0, 0],
    );
    parts.add('panel', 'black', [14.3, y, z], [1, 10, 14], [angle, 0, 0]);
    parts.add('box', 'glass', [15, y, z], [0.4, 6, 12], [angle, 0, 0]);
    parts.add('box', 'titanium', [15.5, y, z], [0.6, 9, 0.6], [angle, 0, 0]);
    if (i % 5 === 0)
      parts.add('box', 'amber', [15.5, y, z], [0.6, 0.8, 6], [angle, 0, 0]);
  }
  for (let i = 0; i < 3; i += 1) {
    const angle = (i * pi * 2) / 3;
    for (const x of [-8, 8])
      parts.beam(
        'titanium',
        [x, 0, 0],
        [x, Math.cos(angle) * 61, Math.sin(angle) * 61],
        2.3,
      );
  }
  parts.add('tube', 'ivory', [-21, 0, 0], [24, 107, 24], [0, 0, pi / 2]);
  parts.add('panel', 'ceramic', [-62, 0, 0], [32, 38, 48]);
  parts.add('panel', 'glass', [-79, 0, 0], [0.5, 20, 31]);
  for (const side of [-1, 1]) {
    parts.beam('dark', [-55, side * 15, 0], [-55, side * 122, 0], 3);
    for (const y of [91, 121]) {
      parts.add('panel', 'solar', [-55, side * y, 0], [95, 1.5, 24]);
      for (let x = -95; x < -12; x += 15)
        parts.add('box', 'titanium', [x, side * y + 1, 0], [0.4, 0.4, 23]);
    }
  }
  return parts;
}
