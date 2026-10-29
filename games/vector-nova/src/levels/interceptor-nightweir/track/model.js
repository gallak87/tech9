import * as T from 'three';
import {
  createPursuitRoute,
  envelope,
  smooth,
} from '../../interceptor/track/pursuit-route.js';

const TARGET_LENGTH = 4700,
  WIDTH = 44;
const wrap = (s, length) => T.MathUtils.euclideanModulo(s, length);

// Mission-local closed streets. This does not adapt/close the original 13.6km
// Nightweir descent or its jump corridors: all geometry is newly authored.
function createBasinPlan() {
  const source = [
    [0, 120, 0],
    [80, 126, 290],
    [340, 150, 550],
    [660, 165, 660],
    [990, 149, 470],
    [1120, 105, 170],
    [1070, 78, -180],
    [820, 72, -350],
    [650, 100, -250],
    [420, 112, -420],
    [170, 116, -320],
    [-80, 120, -160],
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
    const bank = T.MathUtils.clamp(curvature * 82, -0.38, 0.38);
    const right = horizontalRight.clone().applyAxisAngle(tangent, -bank),
      up = new T.Vector3().crossVectors(tangent, right).normalize();
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
  const sections = [
    ['lock-apron', 'Lock control apron', 0, 0.18, 0.075],
    ['reservoir', 'Reservoir ward', 0.18, 0.37, 0.275],
    ['generating', 'The generating terraces', 0.37, 0.57, 0.47],
    ['tailrace', 'Tailrace crescent', 0.57, 0.79, 0.68],
    ['upper-weir', 'The upper weir return', 0.79, 1, 0.89],
  ].map(([id, name, start, end, showcase]) => ({
    id,
    name,
    label: name,
    start: start * length,
    end: end * length,
    showcase: showcase * length,
    representative: true,
  }));
  const bounds = new T.Box3().setFromPoints(
    Array.from({ length: 300 }, (_, i) => positionAt((i * length) / 300)),
  );
  return {
    id: 'nightweir-lockdown-pursuit-v1',
    name: 'Nightweir Lockdown',
    geometryVersion: 'nightweir-basin-closed-loop-v1',
    length,
    width: WIDTH,
    closed: true,
    groundY: -30,
    finishDistance: length,
    sample,
    sections,
    jumps: [],
    curtains: [],
    isGap: () => false,
    checkpoints: Array.from({ length: 14 }, (_, index) => ({
      id: `lockdown-check-${index}`,
      index,
      distance: (index * length) / 14,
    })),
    cutGates: [0, 0.2, 0.4, 0.6, 0.8].map((f) => f * length),
    bounds: bounds.expandByVector(new T.Vector3(650, 300, 650)),
    scenarios: {
      staging: { distance: 0, speed: 0, lateral: 0, heading: 0 },
      ...Object.fromEntries(
        sections.map((section) => [
          `${section.id}-approach`,
          { distance: section.start, speed: 80, lateral: 0, heading: 0 },
        ]),
      ),
    },
  };
}

// The outboard generating reach rises clear of the occupied basin before a
// complete connected corkscrew. Its far side plunges back to the tailrace;
// the original reservoir and return-water districts retain their footprint.
export function createNightweirLockdownTrack() {
  const track = createPursuitRoute(createBasinPlan(), {
    heightAt: (f) => 140 * envelope(f, 0.365, 0.445, 0.61, 0.745),
    rollAt: (f) => Math.PI * 2 * smooth((f - 0.43) / 0.22),
    moments: [
      { id: 'generating-corkscrew', type: 'corkscrew', start: 0.43, end: 0.65 },
      { id: 'tailrace-plunge', type: 'drop', start: 0.61, end: 0.745 },
    ],
  });
  return {
    ...track,
    id: 'nightweir-lockdown-pursuit-v2',
    geometryVersion: 'nightweir-basin-corkscrew-plunge-v2',
  };
}
