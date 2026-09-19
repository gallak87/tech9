// World-unit layout, applied after the legacy world's 1.25 scale pass.
// Circulation and service anchors stay fixed through all four renovations.
export const HAVENTIDE_HALL = {
  floor: { x: 110, y: 310, w: 1380, h: 710 },
  entrance: { x: 710, y: 1000, w: 180, h: 66 },
  runner: { x: 800, y: 1000, width: 220 },
  services: {
    provisions: {
      part: 'provisions',
      x: 335,
      y: 700,
      width: 238,
      w: 205,
      h: 82,
    },
    smith: { part: 'forge', x: 335, y: 440, width: 246, w: 210, h: 85 },
    inn: { part: 'inn', x: 1265, y: 440, width: 254, w: 215, h: 100 },
    archivist: { part: 'archive', x: 800, y: 440, width: 226, w: 190, h: 74 },
    artificer: {
      part: 'engineering',
      x: 1265,
      y: 700,
      width: 244,
      w: 210,
      h: 85,
    },
    trainer: { part: 'training', x: 335, y: 960, width: 218, w: 185, h: 72 },
    construction: { part: 'board', x: 1040, y: 915, width: 232, w: 200, h: 74 },
  },
};

export function configureHaventideInterior(scene) {
  scene.restorationInterior = true;
  scene.walkAreas = [
    { ...HAVENTIDE_HALL.floor },
    { ...HAVENTIDE_HALL.entrance },
  ];
  // Old floating wall fragments are replaced by the room's perimeter.
  scene.objects = scene.objects.filter((o) => !o.id.startsWith('hav_market_'));
  for (const object of scene.objects) {
    const place = HAVENTIDE_HALL.services[object.service];
    if (place) {
      Object.assign(object, {
        x: place.x,
        y: place.y,
        w: place.w,
        h: place.h,
        solid: true,
        havenPart: place.part,
        artWidth: place.width,
      });
      object.interactionArea = { x: 0, y: 24, w: place.w, h: 32 };
    }
    if (object.id === 'mara') Object.assign(object, { x: 560, y: 815 });
    if (object.id === 'haventide_resident')
      Object.assign(object, { x: 1190, y: 955 });
    if (object.id === 'ending_beacon')
      Object.assign(object, { x: 1410, y: 940 });
  }
  for (const x of [249, 524, 800, 1076, 1351])
    scene.objects.push({
      id: 'haven_wall_' + x,
      type: 'landmark',
      style: 'haven_interior',
      havenPart: 'wall',
      x,
      y: 300,
      artWidth: 290,
      solid: false,
    });
  for (const x of [123, 1477])
    for (const y of [570, 810, 1015])
      scene.objects.push({
        id: `haven_column_${x}_${y}`,
        type: 'landmark',
        style: 'haven_interior',
        havenPart: 'column',
        x,
        y,
        artWidth: 60,
        solid: true,
        w: 40,
        h: 27,
      });
  for (const x of [690, 910])
    scene.objects.push({
      id: 'haven_entry_column_' + x,
      type: 'landmark',
      style: 'haven_interior',
      havenPart: 'column',
      x,
      y: 1035,
      artWidth: 60,
      solid: true,
      w: 40,
      h: 27,
    });
  for (const [x, y] of [
    [525, 430],
    [1060, 355],
  ])
    scene.objects.push({
      id: `haven_stores_${x}`,
      type: 'landmark',
      style: 'haven_interior',
      havenPart: 'storage',
      x,
      y,
      artWidth: 126,
      solid: true,
      w: 100,
      h: 44,
    });
}
