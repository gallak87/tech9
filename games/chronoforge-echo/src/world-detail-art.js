// Selected immutable imagegen sources. Crops and grounded anchors are source
// pixels; world heights are authored independently and preserve the aspect ratio.
const frame = (part, x, y, w, h, anchorX, anchorY) => ({
  part,
  x,
  y,
  w,
  h,
  anchorX,
  anchorY,
});
const detail = (id, biome, file, frames, backgroundSeeds) => ({
  id,
  biome,
  source: `assets/world/${file}-source.png`,
  kind: 'environmentDetail',
  columns: 2,
  rows: 2,
  required: true,
  key: 'neutral-exterior',
  backgroundSeeds,
  metadata: { sourceWidth: 1254, sourceHeight: 1254, frames },
});
const landmark = (
  id,
  style,
  file,
  w,
  h,
  crop,
  nativeHeight,
  backgroundSeeds,
) => ({
  id,
  source: `assets/world/${file}-source.png`,
  kind: 'structure',
  columns: 1,
  rows: 1,
  required: true,
  key: 'neutral-exterior',
  backgroundSeeds,
  metadata: {
    style,
    sourceWidth: w,
    sourceHeight: h,
    frames: [{ ...crop, nativeHeight }],
  },
});

const authoredArch = (id, file, crop, footprints) => {
  const entry = landmark(id, null, file, 1254, 1254, crop, 320, []);
  entry.metadata.objectId = id;
  entry.metadata.frames[0].footprints = footprints;
  return entry;
};

export const WORLD_DETAIL_ASSETS = [
  authoredArch(
    'forest_arch',
    'root-wrapped-aqueduct-v1',
    frame(null, 10, 14, 1235, 1228, 622, 1123),
    [
      [-552, -197, 455, 96],
      [140, -22, 442, 113],
    ],
  ),
  authoredArch(
    'crater_gate',
    'basalt-teeth-v1',
    frame(null, 20, 8, 1215, 1234, 607, 1132),
    [
      [-557, -169, 451, 122],
      [107, -38, 476, 125],
    ],
  ),
  authoredArch(
    'orbital_arch',
    'orbital-viaduct-v1',
    frame(null, 20, 20, 1210, 1215, 604, 1120),
    [
      [-573, -181, 459, 99],
      [117, -26, 468, 101],
    ],
  ),
  detail(
    'coastal_world_details',
    'coast',
    'coastal-details-v1',
    [
      frame('tree', 16, 45, 708, 580, 326, 567),
      frame('cypress', 768, 10, 393, 623, 197, 609),
      frame('ring', 47, 630, 597, 603, 303, 587),
      frame('arch', 702, 647, 526, 583, 265, 568),
    ],
    [
      [997, 856],
      [467, 228],
      [281, 334],
      [423, 210],
      [1036, 494],
      [961, 840],
      [230, 306],
      [874, 483],
      [983, 842],
      [138, 952],
      [938, 885],
      [918, 487],
    ],
  ),
  detail(
    'emberline_world_details',
    'desert',
    'emberline-details-v1',
    [
      frame('tree', 102, 25, 503, 631, 251, 621),
      frame('cypress', 733, 10, 370, 671, 188, 652),
      frame('ring', 24, 656, 608, 577, 303, 561),
      frame('arch', 641, 683, 600, 553, 302, 536),
    ],
    [
      [199, 252],
      [455, 306],
      [235, 349],
      [977, 199],
      [898, 411],
      [285, 518],
      [435, 830],
      [320, 369],
      [260, 806],
      [391, 776],
      [508, 355],
      [401, 165],
      [444, 909],
      [462, 125],
      [836, 945],
      [447, 890],
    ],
  ),
  landmark(
    'whale_of_iron',
    'bones',
    'whale-of-iron-v1',
    1536,
    1024,
    frame(null, 25, 14, 1490, 890, 850, 764),
    180,
    [],
  ),
  landmark(
    'glasswood_elder',
    'greattree',
    'glasswood-elder-v1',
    1254,
    1254,
    frame(null, 55, 0, 1160, 1245, 574, 1220),
    240,
    [
      [426, 575],
      [880, 567],
      [830, 401],
      [892, 914],
      [408, 438],
      [389, 910],
      [1073, 336],
      [785, 388],
      [921, 526],
      [677, 561],
      [658, 322],
      [333, 493],
      [1018, 346],
      [664, 646],
      [698, 569],
      [1095, 340],
      [430, 455],
      [898, 987],
      [518, 214],
      [852, 433],
      [950, 570],
      [583, 342],
      [326, 498],
      [581, 171],
      [1006, 173],
      [793, 473],
      [259, 513],
    ],
  ),
  landmark(
    'second_sunrise',
    'furnace',
    'second-sunrise-v1',
    1254,
    1254,
    frame(null, 10, 10, 1234, 1215, 617, 1190),
    250,
    [
      [625, 245],
      [730, 230],
      [1023, 308],
      [289, 311],
      [139, 742],
      [1170, 683],
      [510, 392],
      [174, 536],
      [1158, 654],
      [221, 500],
      [469, 265],
      [912, 262],
      [275, 409],
    ],
  ),
  landmark(
    'orbital_tether',
    'elevator',
    'orbital-tether-v1',
    992,
    1586,
    frame(null, 12, 3, 970, 1573, 479, 1545),
    280,
    [
      [358, 692],
      [640, 788],
    ],
  ),
  landmark(
    'seven_listeners',
    'ice',
    'seven-listeners-v1',
    1254,
    1254,
    frame(null, 35, 32, 1190, 1194, 591, 1170),
    260,
    [
      [417, 511],
      [586, 384],
      [777, 576],
      [319, 619],
      [692, 424],
      [1003, 654],
      [858, 597],
      [672, 483],
      [596, 513],
      [594, 567],
    ],
  ),
  landmark(
    'first_gardener',
    'hand',
    'first-gardener-v1',
    1254,
    1254,
    frame(null, 35, 20, 1184, 1208, 592, 1184),
    230,
    [
      [598, 256],
      [649, 255],
      [780, 810],
      [471, 811],
      [692, 580],
      [560, 582],
    ],
  ),
  landmark(
    'unmade_palace',
    'palace',
    'unmade-palace-v1',
    1254,
    1254,
    frame(null, 22, 0, 1210, 1230, 612, 1214),
    260,
    [
      [895, 579],
      [786, 495],
      [996, 503],
      [464, 499],
      [423, 438],
      [505, 524],
      [645, 226],
      [617, 225],
      [675, 390],
      [738, 214],
      [594, 392],
      [527, 245],
      [817, 637],
      [678, 331],
      [896, 724],
      [428, 538],
      [589, 335],
      [672, 321],
      [752, 591],
      [591, 320],
      [623, 259],
      [641, 259],
    ],
  ),
];

const detailFrames = new Map(
  WORLD_DETAIL_ASSETS.filter((a) => a.kind === 'environmentDetail').flatMap(
    (a) => a.metadata.frames.map((f) => [`${a.biome}:${f.part}`, f]),
  ),
);
const landmarkFrames = new Map(
  WORLD_DETAIL_ASSETS.filter((a) => a.kind === 'structure').map((a) => [
    a.metadata.objectId || a.metadata.style,
    a.metadata.frames[0],
  ]),
);

export function worldDetailFrame(biome, part) {
  return detailFrames.get(`${biome}:${part}`) || null;
}

export function frameBounds(f, x, y, height) {
  const scale = height / f.h;
  return {
    left: x - f.anchorX * scale,
    top: y - f.anchorY * scale,
    width: f.w * scale,
    height,
  };
}

// Shared by foreground occlusion and scenery composition. Interiors deliberately
// keep their own art/layout, including their older regional decoration crops.
export function worldDetailBounds(o, biome) {
  const landmarkFrame =
    o.type === 'landmark' &&
    (landmarkFrames.get(o.id) || landmarkFrames.get(o.style));
  if (landmarkFrame)
    return frameBounds(
      landmarkFrame,
      o.x,
      o.y,
      landmarkFrame.nativeHeight * (o.size || 1),
    );
  let part, height;
  if (o.type === 'tree') {
    part = o.variant === 3 ? 'cypress' : 'tree';
    height = (o.variant === 3 ? 260 : 220) * (o.size || 1);
  } else if (o.type === 'ruin') {
    part = 'arch';
    height = 164;
  } else if (o.type === 'landmark' && ['ring', 'arch'].includes(o.style)) {
    part = o.style;
    height = 320 * (o.size || 1);
  }
  const f = part && worldDetailFrame(biome, part);
  return f ? frameBounds(f, o.x, o.y, height) : null;
}

export function authoredLandmarkFootprints(o) {
  const f = landmarkFrames.get(o.id);
  if (!f?.footprints) return null;
  const scale = (f.nativeHeight * (o.size || 1)) / f.h;
  return f.footprints.map(([x, y, w, h]) => ({
    x: x * scale,
    y: y * scale,
    w: w * scale,
    h: h * scale,
  }));
}
