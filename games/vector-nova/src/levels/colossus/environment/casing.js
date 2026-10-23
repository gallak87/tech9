import * as T from 'three';

export function emitIntakeOpenLoadBed({
  track,
  a,
  b,
  side,
  station,
  casingHeight,
  housingGeometry,
  staticPart,
  materials,
}) {
  const scale = (profile) =>
    profile.map(([x, y]) => [x * side, y > 0 ? y * casingHeight : y]);
  const emit = (profile, from, to, material, name) => {
    if (to <= from + 0.01) return;
    staticPart(
      housingGeometry(track, from, to, scale(profile)),
      material,
      name,
    );
  };
  // Original structural envelope, with a 9 m wide opening down to y=-10.
  // Its outer wall and full bottom sole are retained. The profile's notch
  // exposes real depth rather than putting a dark decal over an opaque lid.
  emit(
    [
      [40, -5],
      [40, -24],
      [65, -24],
      [65, 9],
      [61, 13],
      [61, -10],
      [52, -10],
      [52, 15],
      [49, 15],
      [49, -5],
    ],
    a,
    b,
    materials.cast,
    'Intake / open cast bearing-bed recess',
  );
  const fullHood = [
    [49, 15],
    [49, 20],
    [60, 20],
    [66, 14],
    [66, 9],
    [60, 15],
  ];
  if (station || b - a < 24) {
    // A complete short guard remains directly beneath each working bearing.
    emit(
      fullHood,
      a,
      b,
      materials.shell,
      'Intake / removable bearing-station hood',
    );
    return;
  }
  // Narrow folded returns border a wide visible recess between bearing stations.
  emit(
    [
      [49, 15],
      [49, 20],
      [52, 20],
      [52, 15],
    ],
    a,
    b,
    materials.shell,
    'Intake / inner folded guard return',
  );
  emit(
    [
      [63, 12],
      [63, 17],
      [66, 14],
      [66, 9],
    ],
    a,
    b,
    materials.shell,
    'Intake / outer folded guard return',
  );
  const endLength = Math.min(7, (b - a) / 4);
  for (const [from, to] of [
    [a, a + endLength],
    [b - endLength, b],
  ]) {
    emit(fullHood, from, to, materials.shell, 'Intake / removable end cover');
    // Full-depth cast end bulkheads support the covers and exposed trough.
    emit(
      [
        [49, -10],
        [61, -10],
        [61, 13],
        [60, 15],
        [49, 15],
      ],
      from,
      to,
      materials.cast,
      'Intake / bearing-bed end diaphragm',
    );
  }
}

export function emitOpenPayloadCover({
  putBox,
  staticPart,
  materials,
  loadMatrix,
}) {
  // Thin cover and two short cheeks preserve the original 110×14×96 envelope.
  putBox(
    materials.shell,
    [110, 2.5, 96],
    [0, 5.75, 0],
    loadMatrix,
    'Gantry / thin removable payload lid',
  );
  for (const x of [-48, 48])
    putBox(
      materials.shell,
      [14, 11.5, 96],
      [x, -0.25, 0],
      loadMatrix,
      'Gantry / folded payload end cheek',
    );
  const web = new T.Shape(
    [
      [-55, -7],
      [55, -7],
      [55, 4.5],
      [-55, 4.5],
    ].map(([x, y]) => new T.Vector2(x, y)),
  );
  for (const sign of [-1, 1])
    web.holes.push(
      new T.Path(
        [
          [sign * 7, -4],
          [sign * 7, 2],
          [sign * 37, 2],
          [sign * 41, -4],
        ].map(([x, y]) => new T.Vector2(x, y)),
      ),
    );
  for (const z of [-38, 30]) {
    const geometry = new T.ExtrudeGeometry(web, {
      depth: 8,
      bevelEnabled: false,
      steps: 1,
    });
    geometry.translate(0, 0, z);
    geometry.applyMatrix4(loadMatrix);
    staticPart(
      geometry,
      materials.cast,
      'Gantry / recessed open payload load frame',
    );
  }
  // The wide central load path meets both lifting crossmembers; the two large
  // front openings show an actual 10 m setback and daylight through the frame.
  putBox(
    materials.steel,
    [10, 10, 96],
    [0, -0.5, 0],
    loadMatrix,
    'Gantry / exposed payload center spine',
  );
}
