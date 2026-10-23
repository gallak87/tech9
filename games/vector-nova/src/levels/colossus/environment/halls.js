import * as T from 'three';

export function buildColossusHalls({
  track,
  kit,
  stencils = null,
  uprightMatrix,
  bodyClear,
  putBox,
  foundation,
  cladding,
  warmCladding,
  coolCladding,
}) {
  const section = (id) => track.sections.find((s) => s.id === id);
  // Upper hall crowns occupy the driving sightline above the working beds.
  // Unequal service cores carry staggered roof cassettes around daylight slots;
  // these are connected factory volumes rather than distant freestanding sheds.
  const plantWingRecipes = [
    ['intake', 'screw', 0.38, 168, 230, 205],
    ['press', 'press', 0.72, 158, 240, 225],
    ['crossfeed', 'crossfeed', 0.64, 148, 214, 245],
    ['gantry', 'return', 0.72, 168, 246, 235],
    ['cooling', 'cooling', 0.72, 150, 242, 240],
    ['headstock', 'headstock', 0.85, 164, 248, 220],
  ];
  for (const [
    id,
    anchor,
    fraction,
    roofY,
    coreTop,
    length,
  ] of plantWingRecipes) {
    const zone = section(anchor),
      target = T.MathUtils.lerp(zone.start, zone.end, fraction),
      finish =
        id === 'press'
          ? warmCladding
          : id === 'cooling'
            ? coolCladding
            : cladding;
    let chosen;
    for (const shift of [0, -45, 45, -90, 90]) {
      const d = T.MathUtils.clamp(
          target + shift,
          zone.start + 40,
          zone.end - 40,
        ),
        m = uprightMatrix(d),
        parts = [],
        feet = [],
        add = (material, size, position, name) =>
          parts.push({ material, size, position, name });
      for (const side of [-1, 1]) {
        const top = coreTop - (side < 0 ? 0 : 36),
          depth = length * (side < 0 ? 1 : 0.72),
          z = side < 0 ? 0 : length * 0.15,
          inner = side * 132,
          outer = side * 226,
          center = side * 179;
        // Deep upper service volume, with a recessed front opening and stepped
        // roof. Its load passes through paired columns onto the existing bed.
        add(
          kit.materials.dark,
          [108, 18, depth + 12],
          [center, 100, z],
          'upper service floor',
        );
        add(
          finish,
          [10, top - 109, depth],
          [outer, (top + 109) / 2, z],
          'recessed service rear',
        );
        for (const end of [-1, 1]) {
          add(
            finish,
            [94, top - 109, 12],
            [center, (top + 109) / 2, z + (end * depth) / 2],
            'service end cheek',
          );
          for (const bearing of [inner, outer]) {
            add(
              kit.materials.cast,
              [18, top + 35, 22],
              [bearing, (top - 35) / 2, z + end * depth * 0.38],
              'upper hall bearing column',
            );
            add(
              kit.materials.steel,
              [34, 10, 40],
              [bearing, -30, z + end * depth * 0.38],
              'upper hall seated foot',
            );
            feet.push(
              new T.Vector3(bearing, -35, z + end * depth * 0.38).applyMatrix4(
                m,
              ),
            );
          }
        }
        add(
          kit.materials.dark,
          [9, 43, depth - 24],
          [inner + side * 12, top - 27, z],
          'clerestory recess',
        );
        add(
          finish,
          [12, 13, depth + 10],
          [inner, top - 54, z],
          'service aperture sill',
        );
        add(
          kit.materials.shell,
          [116, 13, depth + 28],
          [center, top + 6.5, z],
          'raised service roof',
        );
        add(
          kit.materials.steel,
          [18, 20, depth],
          [inner, roofY - 13, z],
          'longitudinal crane runway',
        );
      }
      // Two broad staggered cassettes cover opposite halves of the hall. The
      // opening continues diagonally through their overlap instead of forming
      // a tunnel; a deep crosshead ties the load into both service cores.
      for (const side of [-1, 1]) {
        const z = side * length * 0.22,
          y = roofY + (side > 0 ? 24 : 0),
          width = 208,
          depth = length * 0.4;
        add(
          kit.materials.shell,
          [width, 12, depth],
          [side * 72, y, z],
          'staggered upper roof cassette',
        );
        add(
          kit.materials.dark,
          [width - 8, 10, depth - 12],
          [side * 72, y - 11, z],
          'deep roof underside',
        );
        add(
          kit.materials.steel,
          [312, 18, 16],
          [0, y - 27, z],
          'transverse roof transfer girder',
        );
      }
      add(
        kit.materials.dark,
        [312, 22, 24],
        [0, roofY - 12, -length * 0.44],
        'front hall crosshead',
      );
      add(
        kit.materials.shell,
        [332, 7, 30],
        [0, roofY + 2.5, -length * 0.44],
        'crosshead top flange',
      );
      // Every solid is screened, including the roof overhangs. Testing the full
      // empty hall envelope would incorrectly reject its intended road opening.
      if (!parts.every(({ size, position }) => bodyClear(size, position, m)))
        continue;
      chosen = { m, parts, feet };
      break;
    }
    if (!chosen) continue;
    for (const { material, size, position, name } of chosen.parts) {
      putBox(
        material,
        size,
        position,
        chosen.m,
        id + ' / production wing ' + name,
      );
      if (name === 'front hall crosshead')
        stencils?.addHall({ id, matrix: chosen.m, size, position });
    }
    for (const foot of chosen.feet) foundation(foot, 42, 54);
  }
}
