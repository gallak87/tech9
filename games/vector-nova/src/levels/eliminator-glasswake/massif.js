import * as T from 'three';

// Authored once from the course-3 production chase view: the actual upper
// mouth is 450m forward and 180m right in flattened XZ. No evidence files or
// camera-following placements are read at runtime.
const WORLD_MATRIX = [
  0.8928574923111305, 0, -0.45033931476596556, 0, 0, 1.25, 0, 0,
  0.45033931476596556, 0, 0.8928574923111305, 0, 1425.21626346616, -145,
  471.5080395685306, 1,
];
const SITES = [
  {
    id: 'crown-fault',
    matrix: WORLD_MATRIX,
    shoulder: 'cliff_1',
    side: -1,
    fraction: 0.4,
  },
  {
    id: 'underfracture',
    matrix: [
      -1.061535138136587, 0, -0.7504286445101476, 0, 0, 0.8062749793336298, 0,
      0, 0.7215660043366803, 0, -1.020706863592872, 0, 580, -145, -350, 1,
    ],
    shoulder: 'cliff_2',
    side: -1,
    fraction: 0.58,
  },
  {
    id: 'aurora-shoulder',
    matrix: [
      -1.0983636440733555, 0, 0.059977540612289076, 0, 0, 1.0789388197054557, 0,
      0, -0.07088254799634164, 0, -1.2980661248139655, 0, -600.8401330376809,
      -145, -326.0522987344725, 1,
    ],
    shoulder: 'cliff_0',
    side: 1,
    fraction: 0.91,
  },
];

export function createFractureMassifPlan(
  track,
  templates,
  { floorY = -130 } = {},
) {
  const massif = templates.get('fracture_massif'),
    basal = templates.get('basal_strata');
  if (
    !massif?.bounds ||
    !basal?.bounds ||
    SITES.some((site) => !templates.get(site.shoulder)?.bounds)
  )
    throw new Error(
      'Fracture massif requires the original massif, shoulder and basal bounds',
    );
  const stations = SITES.map((site, index) => {
    const matrix = new T.Matrix4().fromArray(site.matrix);
    matrix.elements[13] = floorY - 15;
    const shoulder = templates.get(site.shoulder);
    const centre = new T.Vector3(95, 0, 0).applyMatrix4(matrix);
    const rotation = new T.Quaternion(),
      position = new T.Vector3(),
      scale = new T.Vector3();
    matrix.decompose(position, rotation, scale);
    const foundation = {
      prototype: 'basal_strata',
      kind: 'foundation',
      distance: null,
      matrix: new T.Matrix4().compose(
        index === 0
          ? new T.Vector3(1560, floorY - basal.bounds.max.y * 1.4, 450)
          : new T.Vector3(
              centre.x,
              floorY - basal.bounds.max.y * 1.4,
              centre.z,
            ),
        index === 0 ? new T.Quaternion() : rotation,
        new T.Vector3(2.2, 1.4, 2),
      ),
    };
    foundation.bounds = basal.bounds.clone().applyMatrix4(foundation.matrix);
    const placement = {
      prototype: 'fracture_massif',
      matrix,
      kind: 'massif',
      distance: track.length * site.fraction,
      bounds: massif.bounds.clone().applyMatrix4(matrix),
    };
    // A lower, wider source fault enters the massif's left side. Its closed
    // body overlaps the hero rather than sitting beside it as another prop;
    // the lowest formed foot is buried below the joined basal cap.
    const shoulderMatrix = matrix
      .clone()
      .multiply(
        new T.Matrix4().compose(
          new T.Vector3(
            155,
            -24 - shoulder.bounds.min.y * 1.9,
            site.side * 190,
          ),
          new T.Quaternion(),
          new T.Vector3(2.2, 1.9, 2.5),
        ),
      );
    const shoulderPlacement = {
      prototype: site.shoulder,
      matrix: shoulderMatrix,
      kind: 'massif',
      distance: placement.distance,
      bounds: shoulder.bounds.clone().applyMatrix4(shoulderMatrix),
    };
    return {
      id: site.id,
      placement,
      shoulder: shoulderPlacement,
      foundation,
      replacement: {
        matrix,
        inverse: matrix.clone().invert(),
        bounds: new T.Box3(
          new T.Vector3(-120, -10, -210),
          new T.Vector3(245, 470, 210),
        ),
        prototypes: [
          'cliff_0',
          'cliff_1',
          'cliff_2',
          'cave_roof',
          'recess_wall',
        ],
      },
    };
  });
  return {
    stations,
    placement: stations[0].placement,
    shoulder: stations[0].shoulder,
    placements: stations.flatMap((site) => [site.placement, site.shoulder]),
    foundationPlacements: stations.map((site) => site.foundation),
    replacements: stations.map((site) => site.replacement),
  };
}
