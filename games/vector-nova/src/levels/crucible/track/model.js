import * as T from 'three';

const TARGET_LENGTH = 4300;
const WIDTH = 44;
const wrap = (s, length) => T.MathUtils.euclideanModulo(s, length);

// One new closed racing surface. The expansive sweeps keep a crowded field
// together; vertical districts change sightlines without airborne shortcuts.
export function createCrucibleTrack() {
  const source = [
    [0, 170, 0],
    [0, 185, 300],
    [200, 235, 620],
    [550, 260, 770],
    [920, 235, 650],
    [1130, 175, 360],
    [1120, 110, 0],
    [950, 90, -230],
    [660, 105, -370],
    [350, 150, -480],
    [0, 170, -300],
  ];
  let scale = 1,
    curve;
  for (let i = 0; i < 8; i++) {
    curve = new T.CatmullRomCurve3(
      source.map(([x, y, z]) => new T.Vector3(x * scale, y, z * scale)),
      true,
      'centripetal',
    );
    curve.arcLengthDivisions = 24000;
    curve.updateArcLengths();
    scale *= TARGET_LENGTH / curve.getLength();
  }
  const length = curve.getLength();
  const positionAt = (s) => curve.getPointAt(wrap(s, length) / length);
  const tangentAt = (s) =>
    positionAt(s + 0.7)
      .sub(positionAt(s - 0.7))
      .normalize();
  function sample(s) {
    const distance = wrap(s, length),
      position = positionAt(distance),
      tangent = tangentAt(distance);
    const horizontalRight = new T.Vector3(tangent.z, 0, -tangent.x).normalize();
    const curvature = tangentAt(distance + 1)
      .sub(tangentAt(distance - 1))
      .multiplyScalar(0.5)
      .dot(horizontalRight);
    // Bank into the turn, bounded well short of wall riding. The road's full
    // 44 m width stays usable for three or four competing lines.
    const bank = T.MathUtils.clamp(curvature * 120, -0.62, 0.62);
    const right = horizontalRight.clone().applyAxisAngle(tangent, -bank);
    const up = new T.Vector3().crossVectors(tangent, right).normalize();
    const quaternion = new T.Quaternion().setFromRotationMatrix(
      new T.Matrix4().makeBasis(right, up, tangent),
    );
    return {
      position,
      tangent,
      right,
      up,
      quaternion,
      curvature,
      bank,
      roll: -bank,
    };
  }
  const regions = [
    ['dispatch', 'Dispatch apron', 0, 0.17, 0.09],
    ['exchanger', 'The exchanger crown', 0.17, 0.36, 0.26],
    ['undercroft', 'Under the hot works', 0.36, 0.55, 0.45],
    ['cooling', 'Cooling causeway', 0.55, 0.75, 0.65],
    ['return', 'The return manifold', 0.75, 1, 0.88],
  ];
  const sections = regions.map(([id, name, start, end, showcase]) => ({
    id,
    name,
    label: name,
    start: start * length,
    end: end * length,
    showcase: showcase * length,
    representative: true,
  }));
  const checkpoints = Array.from({ length: 12 }, (_, i) => ({
    id: `checkpoint-${i}`,
    index: i,
    distance: (i * length) / 12,
  }));
  const bounds = new T.Box3().setFromPoints(
    Array.from({ length: 240 }, (_, i) => positionAt((i * length) / 240)),
  );
  return {
    id: 'crucible-foundry-v1',
    name: 'Crucible Foundry',
    geometryVersion: 'crucible-wide-loop-v1',
    length,
    width: WIDTH,
    closed: true,
    groundY: -50,
    sample,
    sections,
    checkpoints,
    jumps: [],
    bounds: bounds.expandByVector(new T.Vector3(500, 300, 500)),
    scenarios: {
      staging: { distance: 0, speed: 0, lateral: 0, heading: 0 },
      ...Object.fromEntries(
        sections.map((section) => [
          `${section.id}-approach`,
          { distance: section.start, speed: 100, lateral: 0, heading: 0 },
        ]),
      ),
    },
    cutGates: [0, 0.2, 0.4, 0.6, 0.8].map((f) => f * length),
  };
}
