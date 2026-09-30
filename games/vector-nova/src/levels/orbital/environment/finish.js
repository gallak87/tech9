const pi = Math.PI;

export function pressureConcourse(parts, scale = 1) {
  const add = (
    shape,
    material,
    position,
    size,
    rotation = [0, 0, 0],
    detail = false,
  ) =>
    parts.add(
      shape,
      material,
      position.map((v) => v * scale),
      size.map((v) => v * scale),
      rotation,
      detail,
    );
  // Five pressure modules, visible in the close transfer approach. Each has a
  // structural end bulkhead, dark recessed observation bay and outer shields.
  for (let i = 0; i < 5; i += 1) {
    const z = -138 + i * 24;
    add('tube', 'dark', [96, -3, z], [23, 22.8, 23], [pi / 2, 0, 0]);
    add('panel', 'ceramic', [96, 10, z], [30, 3, 23]);
    add('panel', 'ivory', [97, -16, z], [30, 4, 21]);
    for (const end of [-1, 1]) {
      add('ring', 'titanium', [96, -3, z + end * 11.4], [24, 24, 6]);
      add('panel', 'ivory', [110, -3, z + end * 10.4], [3, 24, 2.4]);
      add(
        'box',
        'black',
        [111.8, -3, z + end * 8.6],
        [0.25, 13, 0.35],
        [0, 0, 0],
        true,
      );
    }
    add('box', 'black', [108.1, -1.5, z], [0.35, 10.5, 18.5]);
    for (let pane = 0; pane < 4; pane += 1) {
      if (pane !== i % 4) {
        add(
          'box',
          'interior',
          [108.44, -1, z - 6.45 + pane * 4.3],
          [0.3, 5.6, 3],
        );
        add(
          'box',
          'dark',
          [108.78, -2.9, z - 6.45 + pane * 4.3],
          [0.7, 1.3, 2.8],
        );
        add(
          'box',
          'black',
          [108.93, 0.4, z - 6.45 + pane * 4.3],
          [0.5, 1.8, 1.15],
        );
      }
      add(
        'box',
        pane === i % 4 ? 'black' : 'glass',
        [109.5, -1, z - 6.45 + pane * 4.3],
        [0.35, 6.8, 3.7],
      );
      add(
        'box',
        'titanium',
        [110.6, -1, z - 8.5 + pane * 4.3],
        [1.25, 9.3, 0.5],
      );
      add(
        'box',
        'ivory',
        [111.4, -5.3, z - 6.45 + pane * 4.3],
        [0.8, 0.6, 3.7],
        [0, 0, 0],
        true,
      );
    }
    add('panel', 'ceramic', [110.5, 6.6, z], [3.7, 5, 18]);
    add('panel', 'ceramic', [110.5, -11.7, z], [2, 7, 18]);
    add('box', 'vermilion', [111.7, -10.7, z], [0.4, 1.35, 15]);
    add('box', 'titanium', [112.4, 2.8, z], [2.4, 0.55, 19]);
    add('box', 'amber', [112.1, 4.2, z + 6.8], [0.6, 0.45, 2.4]);
    // Cooling skid and fan housing sit on the roof with an actual frame below.
    add('panel', 'black', [95, 13.1, z], [17, 4, 15]);
    add('box', 'titanium', [95, 15.3, z], [14.5, 0.8, 12.5]);
    for (let fin = 0; fin < 7; fin += 1)
      add(
        'box',
        'dark',
        [95, 16, z - 5.5 + fin * 1.8],
        [15, 1.3, 0.5],
        [0, 0, 0],
        true,
      );
    for (const dz of [-6.5, 6.5])
      add(
        'tube',
        'titanium',
        [104.5, 10, z + dz],
        [1.2, 9, 1.2],
        [0, 0, 0],
        true,
      );
    // Visible clamps, suit-scale service hatch and shield fasteners.
    add('panel', 'black', [112.2, -12.5, z + 4], [0.5, 3.8, 5]);
    add('panel', 'ivory', [112.6, -12.5, z + 4], [0.5, 2.8, 4]);
    for (const dz of [-7.5, 7.5])
      for (const y of [-14, 8])
        add(
          'tube',
          'dark',
          [112.1, y, z + dz],
          [0.6, 0.4, 0.6],
          [0, 0, pi / 2],
          true,
        );
  }
  // Walkway, bundled thermal pipes and end airlock make the modules belong to
  // the dock. These are service infrastructure, not unrelated decorative boxes.
  add('box', 'dark', [118, -18.5, -90], [10, 2, 122]);
  add('box', 'titanium', [118, -17.3, -90], [9, 0.35, 122]);
  for (const x of [113.5, 122.5]) {
    add('tube', 'titanium', [x, -14.5, -90], [0.45, 122, 0.45], [pi / 2, 0, 0]);
    for (let z = -150; z <= -30; z += 8)
      add('box', 'dark', [x, -16, z], [0.5, 3.3, 0.5], [0, 0, 0], true);
  }
  for (const x of [88, 92, 97]) {
    add('tube', 'ivory', [x, -20.5, -90], [1.7, 126, 1.7], [pi / 2, 0, 0]);
    for (let z = -144; z < -29; z += 12)
      add('box', 'dark', [x, -20.5, z], [2.3, 2.5, 0.65], [0, 0, 0], true);
  }
  add('tube', 'dark', [96, -3, -24], [18, 12, 18], [pi / 2, 0, 0]);
  add('ring', 'ceramic', [96, -3, -16.7], [18, 18, 8]);
  add('tube', 'black', [96, -3, -17.2], [13.8, 0.3, 13.8], [pi / 2, 0, 0]);
  add('box', 'amber', [96, 5, -16], [5, 0.8, 0.4]);
  add('panel', 'dark', [83, -11, -49], [54, 8, 14]);
  for (const x of [60, 69, 78])
    add('panel', 'ceramic', [x, -11, -49], [2, 10, 16]);
}

export function cargoRack(parts, x, z, type = 0) {
  const width = 18,
    depth = 25,
    height = type === 1 ? 19 : 11;
  // Exoskeleton remains independent from the payload and clear of its recesses.
  parts.add('box', 'dark', [x, 4.5, z], [width, 2, depth]);
  for (const sx of [-1, 1])
    for (const sz of [-1, 1]) {
      parts.add(
        'box',
        'titanium',
        [x + sx * 8.3, 5 + height / 2, z + sz * 11.8],
        [1.35, height, 1.35],
      );
      parts.add(
        'panel',
        'vermilion',
        [x + sx * 8.3, 5.7, z + sz * 11.8],
        [2.1, 2, 2.1],
      );
      parts.add(
        'box',
        'titanium',
        [x, 5 + height, z + sz * 11.8],
        [17.8, 1.1, 1.3],
      );
    }
  if (type === 2) {
    // Cryogenic payload: three restrained pressure vessels with insulated ends.
    for (let tank = 0; tank < 3; tank += 1) {
      const tx = x + (tank - 1) * 5;
      parts.add('tube', 'ivory', [tx, 9.3, z], [4.4, 20, 4.4], [pi / 2, 0, 0]);
      for (const dz of [-8, 8])
        parts.add('ring', 'dark', [tx, 9.3, z + dz], [4.7, 4.7, 2]);
      parts.add(
        'tube',
        'titanium',
        [tx, 9.3, z + 10.7],
        [1.1, 1.4, 1.1],
        [pi / 2, 0, 0],
        true,
      );
    }
  } else {
    const stacks = type === 1 ? 2 : 1;
    for (let stack = 0; stack < stacks; stack += 1) {
      const y = 9 + stack * 8.5;
      parts.add(
        'panel',
        type === 1 ? 'ivory' : 'ceramic',
        [x, y, z],
        [14.4, 7.5, 21.7],
      );
      parts.add('panel', 'black', [x, y, z + 11.1], [11.7, 5.7, 0.45]);
      for (const dx of [-3, 3]) {
        parts.add('panel', 'ivory', [x + dx, y, z + 11.35], [5.6, 5.2, 0.55]);
        parts.add(
          'box',
          'titanium',
          [x + dx, y, z + 11.72],
          [0.35, 4.7, 0.4],
          [0, 0, 0],
          true,
        );
        parts.add(
          'box',
          'dark',
          [x + dx + 1.1, y - 0.2, z + 11.76],
          [0.8, 0.4, 0.25],
          [0, 0, 0],
          true,
        );
      }
      for (const sx of [-1, 1]) {
        for (let rib = 0; rib < 7; rib += 1)
          parts.add(
            'box',
            'titanium',
            [x + sx * 7.5, y, z - 9 + rib * 3],
            [0.45, 6.4, 0.7],
            [0, 0, 0],
            true,
          );
        parts.add(
          'box',
          'vermilion',
          [x + sx * 7.58, y + 1.7, z],
          [0.25, 1.1, 16.7],
        );
      }
      for (let fin = 0; fin < 5; fin += 1)
        parts.add(
          'box',
          'dark',
          [x - 4 + fin * 2, y + 3.9, z],
          [0.8, 0.4, 18],
          [0, 0, 0],
          true,
        );
    }
  }
  for (const sx of [-1, 1])
    parts.beam(
      'dark',
      [x + sx * 8.3, 6, z - 11.8],
      [x + sx * 8.3, height + 4, z + 11.8],
      0.7,
    );
}

export function craneFinish(parts) {
  for (const z of [-53, -45]) {
    parts.beam('titanium', [47, 70, z], [-51, 70, z], 0.8);
    for (let x = -49; x < 46; x += 10) {
      parts.beam('dark', [x, 66, z], [x + 10, 70, z], 0.6);
      parts.add('box', 'titanium', [x, 68, z], [0.55, 4.4, 0.55]);
    }
  }
  parts.add('panel', 'dark', [47, 10, -49], [12, 12, 15]);
  parts.add('ring', 'titanium', [47, 17, -49], [15, 15, 6], [pi / 2, 0, 0]);
  parts.add('panel', 'ivory', [-32, 65, -49], [14, 4, 16]);
  for (const z of [-54, -44])
    parts.add('tube', 'dark', [-32, 67, z], [4.5, 9, 4.5], [0, 0, pi / 2]);
  for (const x of [-41, -29]) {
    parts.beam('titanium', [x, 64, -49], [x, 36, -49], 0.35);
    parts.add('panel', 'black', [x, 34, -49], [3, 3, 20]);
  }
  parts.add('box', 'glass', [43, 58, -57], [11, 4, 0.4]);
  for (const z of [-55, -49, -43])
    parts.add('box', 'dark', [34, 58, z], [1, 4.5, 0.6], [0, 0, 0], true);
}

export function hullFinish(parts, scale = 1) {
  const add = (
    shape,
    material,
    point,
    size,
    rotation = [0, 0, 0],
    detail = false,
  ) =>
    parts.add(
      shape,
      material,
      point.map((v) => v * scale),
      size.map((v) => v * scale),
      rotation,
      detail,
    );
  for (const side of [-1, 1]) {
    for (const z of [-124, -103, -82, -61]) {
      add('panel', 'ivory', [side * 48.4, 15, z], [1.2, 12, 17]);
      add('panel', 'black', [side * 49.1, 15, z], [0.4, 7, 12]);
      for (let fin = 0; fin < 5; fin += 1)
        add(
          'box',
          'titanium',
          [side * 49.5, 12.5 + fin * 1.15, z],
          [0.7, 0.4, 11.5],
          [0, 0, 0],
          true,
        );
      add('box', 'vermilion', [side * 49.7, 21.5, z], [0.25, 1.2, 10]);
      for (const dz of [-7, 7])
        add(
          'tube',
          'dark',
          [side * 49.7, 18.5, z + dz],
          [0.7, 0.4, 0.7],
          [0, 0, pi / 2],
          true,
        );
    }
    // Continuous side manifolds run to aft machinery; twin lines have clamps.
    for (const y of [3, 6]) {
      add(
        'tube',
        'titanium',
        [side * 45, y, -127],
        [1.1, 102, 1.1],
        [pi / 2, 0, 0],
      );
      for (let z = -171; z < -82; z += 11)
        add('panel', 'dark', [side * 45, y, z], [2, 2, 0.7], [0, 0, 0], true);
    }
    for (const z of [-148, -28, 112]) {
      add('panel', 'dark', [side * 72, 31, z], [10.3, 25, 12.2]);
      add('panel', 'ceramic', [side * 72, 31, z + 6.4], [8.5, 22, 0.9]);
      add('tube', 'titanium', [side * 72, 52, z], [7, 9, 7], [pi / 2, 0, 0]);
      add(
        'tube',
        'black',
        [side * 72, 52, z + 4.8],
        [4, 0.3, 4],
        [pi / 2, 0, 0],
      );
      for (const dz of [-4, 4])
        add('tube', 'titanium', [side * 75, 4, z + dz], [1.3, 44, 1.3]);
    }
  }
}

export function habitatFinish(parts) {
  // The banked return looks directly into this underside: its service spine,
  // structural floor cassette and pressure-drum end caps are finished too.
  parts.add('panel', 'dark', [0, -6.4, 0], [26, 3, 76]);
  for (const side of [-1, 1]) {
    parts.add('panel', 'black', [side * 27, -6.1, 0], [21, 1.7, 73]);
    for (let z = -31; z <= 31; z += 6.2) {
      parts.add('panel', 'ivory', [side * 27, -7.3, z], [19, 0.8, 5.2]);
      parts.add(
        'box',
        'titanium',
        [side * 27, -7.9, z],
        [16, 0.35, 0.7],
        [0, 0, 0],
        true,
      );
    }
    parts.add(
      'tube',
      'titanium',
      [side * 9, -9.2, 0],
      [1.6, 72, 1.6],
      [pi / 2, 0, 0],
    );
    for (const z of [-31, -16, 0, 16, 31])
      parts.add(
        'box',
        'dark',
        [side * 9, -9.2, z],
        [2.3, 2.3, 1],
        [0, 0, 0],
        true,
      );
    for (const dz of [-28.5, 28.5]) {
      parts.add(
        'tube',
        'black',
        [side * 31, -26, dz],
        [19, 1.2, 19],
        [pi / 2, 0, 0],
      );
      parts.add(
        'ring',
        'titanium',
        [side * 31, -26, dz + Math.sign(dz) * 0.9],
        [17, 17, 4],
      );
      parts.add(
        'panel',
        'ivory',
        [side * 31, -26, dz + Math.sign(dz) * 1.3],
        [10, 12, 1],
      );
      parts.add(
        'box',
        'black',
        [side * 31, -26, dz + Math.sign(dz) * 2],
        [0.5, 10, 0.5],
      );
      parts.add(
        'box',
        'vermilion',
        [side * 31, -20, dz + Math.sign(dz) * 2],
        [6, 1.2, 0.5],
      );
    }
    parts.add(
      'tube',
      'black',
      [side * 22.5, -51, 0],
      [32, 1.3, 32],
      [0, 0, pi / 2],
    );
    parts.add(
      'ring',
      'ivory',
      [side * 23.6, -51, 0],
      [28, 28, 7],
      [0, pi / 2, 0],
    );
    parts.add('panel', 'titanium', [side * 24.1, -51, 0], [1.1, 18, 21]);
    parts.add('panel', 'black', [side * 24.9, -51, 0], [0.6, 11, 9]);
    parts.add('box', 'amber', [side * 25.3, -43, 0], [0.5, 0.5, 5]);
  }
  // Exterior decks have shield skirts, balcony rails and recessed maintenance
  // panels, while the inhabited glazing remains the continuous middle layer.
  for (const [y, width, length] of [
    [0, 92, 102],
    [15, 76, 86],
    [30, 54, 65],
  ]) {
    for (const side of [-1, 1]) {
      for (let z = -length / 2 + 10; z < length / 2 - 5; z += 14) {
        parts.add(
          'panel',
          'ivory',
          [side * (width / 2 + 0.4), y + 1, z],
          [1.4, 5.7, 12],
        );
        parts.add(
          'box',
          'black',
          [side * (width / 2 + 1.2), y + 1, z],
          [0.3, 1.8, 7],
        );
        for (const dz of [-4.7, 4.7])
          parts.add(
            'tube',
            'titanium',
            [side * (width / 2 + 1.5), y + 2.5, z + dz],
            [0.55, 0.4, 0.55],
            [0, 0, pi / 2],
            true,
          );
      }
      parts.add(
        'box',
        'titanium',
        [side * (width / 2 - 1.5), y + 11, 0],
        [0.5, 0.5, length - 8],
      );
      for (let z = -length / 2 + 8; z < length / 2 - 7; z += 8)
        parts.add(
          'box',
          'dark',
          [side * (width / 2 - 1.5), y + 9.2, z],
          [0.45, 3.5, 0.45],
          [0, 0, 0],
          true,
        );
    }
    // Front bulkheads divide the glazing into individual occupied bays.
    parts.add('box', 'black', [0, y + 7.3, length / 2 - 4], [width - 14, 5, 1]);
    for (let x = -width / 2 + 12; x < width / 2 - 10; x += 8)
      parts.add(
        'box',
        'glass',
        [x, y + 7.3, length / 2 - 3.3],
        [6.5, 3.7, 0.5],
      );
    parts.add(
      'box',
      'amber',
      [width / 2 - 13, y + 11, length / 2 - 4.2],
      [4, 0.5, 0.8],
    );
  }
  for (const side of [-1, 1]) {
    parts.beam('dark', [side * 42, -4, -43], [side * 22, 38, -29], 2.5);
    parts.beam('titanium', [side * 42, -4, 43], [side * 22, 38, 29], 2);
    parts.add('tube', 'titanium', [side * 36, -11, -28], [2.2, 25, 2.2]);
    parts.add('ring', 'dark', [side * 31, -26, 28], [19, 19, 5]);
    parts.add(
      'tube',
      'black',
      [side * 31, -26, 28.6],
      [14, 1, 14],
      [pi / 2, 0, 0],
    );
    parts.add('panel', 'ceramic', [side * 31, -26, 29.3], [9, 10, 1.2]);
    parts.add('box', 'amber', [side * 31, -20, 30], [4, 0.5, 0.5]);
  }
  for (const x of [-16, 4]) {
    parts.add('panel', 'dark', [x, 45, 15], [14, 7, 21]);
    parts.add('box', 'ivory', [x, 49, 15], [15, 0.8, 22]);
    for (let z = 6; z < 26; z += 2.5)
      parts.add(
        'box',
        'titanium',
        [x, 49.7, z],
        [12, 0.5, 0.8],
        [0, 0, 0],
        true,
      );
  }
  parts.add('tube', 'titanium', [-25, 44, 14], [1.5, 34, 1.5], [pi / 2, 0, 0]);
}

export function freightDeckFinish(parts) {
  for (const side of [-1, 1]) {
    for (let z = -60; z < 70; z += 17) {
      parts.add('panel', 'dark', [side * 55, -5, z], [2, 8, 13]);
      parts.add('panel', 'titanium', [side * 56.3, -5, z], [0.7, 5, 10]);
      parts.beam('dark', [side * 54, -13, z - 7], [side * 59, 2, z + 7], 0.9);
    }
    parts.add('box', 'titanium', [side * 58, 6, 0], [0.45, 0.45, 140]);
    for (let z = -68; z < 70; z += 10)
      parts.add(
        'box',
        'dark',
        [side * 58, 4.8, z],
        [0.5, 2.4, 0.5],
        [0, 0, 0],
        true,
      );
  }
  for (const z of [-66, -13, 62]) {
    parts.add('box', 'dark', [0, 3.8, z], [104, 0.3, 1.5]);
    for (let x = -50; x < 52; x += 8)
      parts.add('box', 'amber', [x, 4, z], [3, 0.15, 0.55], [0, 0, 0], true);
  }
  for (const x of [-22.5, 0.5, 23.5])
    parts.add('box', 'dark', [x, 3.8, 0], [1.1, 0.3, 122]);
}
