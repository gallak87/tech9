import * as T from 'three';
import { sailPoint } from './scenery.js';

const Y = new T.Vector3(0, 1, 0);
const ONE = new T.Vector3(1, 1, 1);
const clamp = T.MathUtils.clamp;
const NATIVE = {
  crown: {
    gallery_port: [-26, -13, 0],
    gallery_starboard: [26, -13, 0],
    cable_eye: [0, 43, 0],
    reel_port: [-12, 9, -11],
    reel_starboard: [12, 9, -11],
  },
  spindle: {
    cable_socket_0: [73.5, 127.305734, 25],
    cable_socket_1: [-127.305734, 73.5, 25],
    cable_socket_2: [-69.0123, -129.7933, 25],
    jaw_0: [115.83758, 90.50218, 26],
    jaw_1: [115.83758, -90.50218, 26],
  },
};

function sockets(points, matrix) {
  return Object.fromEntries(
    Object.entries(points).map(([name, point]) => [
      name,
      new T.Vector3(...point).applyMatrix4(matrix),
    ]),
  );
}

function foilFrame(sail, u, v) {
  const h = 0.001;
  const du = sailPoint(sail, clamp(u + h, 0, 1), v).sub(
    sailPoint(sail, clamp(u - h, 0, 1), v),
  );
  const dv = sailPoint(sail, u, clamp(v + h, 0, 1)).sub(
    sailPoint(sail, u, clamp(v - h, 0, 1)),
  );
  const up = dv.clone().cross(du).normalize();
  if (up.y < 0) up.negate();
  return { point: sailPoint(sail, u, v), du, dv, up };
}

// Find the real folded surface under each tilted crown foot. A common tangent
// plane alone would leave its outer load shoes hovering over the fold cage.
function foilBelow(sail, point, initialU, initialV) {
  let u = initialU,
    v = initialV;
  for (let i = 0; i < 5; i++) {
    const h = 0.001,
      surface = sailPoint(sail, u, v);
    const du = sailPoint(sail, clamp(u + h, 0, 1), v)
      .sub(sailPoint(sail, clamp(u - h, 0, 1), v))
      .multiplyScalar(1 / (2 * h));
    const dv = sailPoint(sail, u, clamp(v + h, 0, 1))
      .sub(sailPoint(sail, u, clamp(v - h, 0, 1)))
      .multiplyScalar(1 / (2 * h));
    const delta = point.clone().sub(surface);
    const aa = du.dot(du),
      bb = dv.dot(dv),
      ab = du.dot(dv),
      determinant = aa * bb - ab * ab;
    if (determinant < 1e-8) break;
    u = clamp(
      u + (delta.dot(du) * bb - delta.dot(dv) * ab) / determinant,
      0,
      1,
    );
    v = clamp(
      v + (delta.dot(dv) * aa - delta.dot(du) * ab) / determinant,
      0,
      1,
    );
  }
  return foilFrame(sail, u, v);
}

function galleryRun(a, b, name) {
  const delta = b.clone().sub(a),
    length = delta.length();
  const x = delta.clone().normalize();
  let up = Y.clone().addScaledVector(x, -Y.dot(x));
  if (up.lengthSq() < 1e-8) up.set(0, 0, 1).addScaledVector(x, -x.z);
  up.normalize();
  const rotation = new T.Quaternion().setFromRotationMatrix(
    new T.Matrix4().makeBasis(x, up, x.clone().cross(up)),
  );
  const count = Math.max(1, Math.ceil(length / 36));
  return Array.from({ length: count }, (_, i) => {
    const start = a.clone().lerp(b, i / count),
      end = a.clone().lerp(b, (i + 1) / count);
    return {
      prototype: 'tension_gallery_segment',
      name: `${name} ${i + 1}`,
      a: start,
      b: end,
      // Both native end sockets sit at Y=-0.5, not at the root origin.
      matrix: new T.Matrix4().compose(
        start.clone().add(end).multiplyScalar(0.5).addScaledVector(up, 0.5),
        rotation,
        new T.Vector3(start.distanceTo(end) / 36, 1, 1),
      ),
    };
  });
}

/** Pure socketed construction plan. It allocates no GPU resources, moves no
 * route/foil, and never drops an unsafe link. The caller must inspect blockers
 * before rendering the complete graph and perform its normal mesh clearance.
 */
export function createReceiverAnchorPlan({
  track,
  station,
  spindleScale = 1.05,
  spindleOutboard = 190,
  spindleLift = -150,
  crownU = 0.08,
  crownV = 0.5,
  crownScale = 1.15,
  clearanceStep = 24,
}) {
  const { frame, side, sail } = station;
  const spindlePosition = frame.position
    .clone()
    .addScaledVector(frame.right, side * spindleOutboard)
    .addScaledVector(Y, spindleLift);
  const spindleRotation = frame.quaternion
    .clone()
    .multiply(
      new T.Quaternion().setFromAxisAngle(
        new T.Vector3(0, 0, 1),
        side > 0 ? Math.PI : 0,
      ),
    );
  const spindleMatrix = new T.Matrix4().compose(
    spindlePosition,
    spindleRotation,
    ONE.clone().multiplyScalar(spindleScale),
  );
  const foil = foilFrame(sail, crownU, crownV);
  const crownX = spindlePosition.clone().sub(foil.point);
  crownX.addScaledVector(foil.up, -crownX.dot(foil.up)).normalize();
  const crownRotation = new T.Quaternion().setFromRotationMatrix(
    new T.Matrix4().makeBasis(crownX, foil.up, crownX.clone().cross(foil.up)),
  );
  let crownPosition = foil.point
    .clone()
    .addScaledVector(foil.up, 25.5 * crownScale);
  let crownMatrix = new T.Matrix4().compose(
    crownPosition,
    crownRotation,
    ONE.clone().multiplyScalar(crownScale),
  );
  const feet = [-21, 21].flatMap((x) =>
    [-15, 15].map((z) => new T.Vector3(x, -25.5, z)),
  );
  // Raise the rigid load bed just enough to avoid burying any foot; fitted
  // short shoes then close the remaining real curvature gaps below each foot.
  let raise = 0;
  for (const foot of feet) {
    const world = foot.clone().applyMatrix4(crownMatrix);
    const surface = foilBelow(sail, world, crownU, crownV);
    raise = Math.max(raise, surface.point.clone().sub(world).dot(foil.up));
  }
  crownPosition = crownPosition.addScaledVector(foil.up, raise + 0.3);
  crownMatrix = new T.Matrix4().compose(
    crownPosition,
    crownRotation,
    ONE.clone().multiplyScalar(crownScale),
  );
  const crownSockets = sockets(NATIVE.crown, crownMatrix);
  const spindleSockets = sockets(NATIVE.spindle, spindleMatrix);
  const road = track.sample(station.jump.target + 35);
  const halfWidth = track.width / 2;
  const saddle = road.position
    .clone()
    .addScaledVector(road.right, side * (halfWidth + 4))
    .addScaledVector(road.up, -15);
  const knee = road.position
    .clone()
    .addScaledVector(road.right, side * (halfWidth + 27))
    .addScaledVector(road.up, -34);
  const upperJaw = ['jaw_0', 'jaw_1']
    .map((name) => spindleSockets[name])
    .sort((a, b) => b.y - a.y)[0];
  const arms = [
    { a: saddle, b: knee, width: 6, name: 'receiver under-rim load knee' },
    {
      a: knee,
      b: upperJaw,
      width: 6,
      name: 'continuous knee to seated spindle jaw',
    },
  ];
  const footings = feet.map((foot, i) => {
    const b = foot.clone().applyMatrix4(crownMatrix);
    const surface = foilBelow(sail, b, crownU, crownV);
    const a = surface.point.clone().addScaledVector(surface.up, -0.6);
    return {
      a,
      b,
      width: 7,
      name: `foil-seated crown load shoe ${i + 1}`,
      up: surface.up,
    };
  });
  arms.push(...footings);
  const crownGallery = ['gallery_port', 'gallery_starboard']
    .map((name) => crownSockets[name])
    .sort(
      (a, b) =>
        a.distanceToSquared(spindlePosition) -
        b.distanceToSquared(spindlePosition),
    )[0];
  const spindleGallery = ['cable_socket_0', 'cable_socket_1', 'cable_socket_2']
    .map((name) => spindleSockets[name])
    .sort(
      (a, b) =>
        a.distanceToSquared(crownGallery) - b.distanceToSquared(crownGallery),
    )[0];
  const gallery = galleryRun(
    crownGallery,
    spindleGallery,
    'crown to anchored spindle service gallery',
  );
  const stays = [0.34, 0.66].map((v, i) => ({
    a: crownSockets.cable_eye.clone(),
    b: sailPoint(sail, 0, v),
    width: 1.5,
    name: `crown tension eye to folded inner hem ${i + 1}`,
  }));
  const prototypes = [
    {
      prototype: 'tension_spindle',
      matrix: spindleMatrix,
      name: 'receiver load-bearing C frame',
    },
    {
      prototype: 'sail_load_crown',
      matrix: crownMatrix,
      name: 'foil-seated winding crown',
    },
  ];
  const plan = {
    prototypes,
    arms,
    gallery,
    stays,
    sockets: { crown: crownSockets, spindle: spindleSockets, saddle, knee },
    seating: { foilPoint: foil.point, normal: foil.up, footings },
  };
  plan.clearance = assessClearance(track, plan, clearanceStep);
  return plan;
}

function assessClearance(track, plan, step) {
  const route = [];
  for (let s = 0; s <= track.length; s += step)
    route.push({ s, frame: track.sample(s) });
  route.push({ s: track.length, frame: track.sample(track.length) });
  const blockers = new Map();
  let minDistance = Infinity,
    samples = 0;
  const segment = new T.Line3(),
    closest = new T.Vector3();
  function assess(point, radius, name) {
    samples++;
    let nearest = Infinity,
      selected = null,
      station = 0;
    for (let i = 1; i < route.length; i++) {
      segment.set(route[i - 1].frame.position, route[i].frame.position);
      const alpha = segment.closestPointToPointParameter(point, true);
      segment.at(alpha, closest);
      const distance = point.distanceToSquared(closest);
      if (distance < nearest) {
        nearest = distance;
        selected = route[i - 1];
        station = T.MathUtils.lerp(route[i - 1].s, route[i].s, alpha);
      }
    }
    minDistance = Math.min(minDistance, Math.sqrt(nearest) - radius);
    const frame = track.sample(station),
      delta = point.clone().sub(frame.position);
    const lateral = Math.abs(delta.dot(frame.right)),
      height = delta.dot(frame.up);
    const airborne = track.jumps.some(
      (jump) => station >= jump.takeoff - 50 && station < jump.landingStart,
    );
    const width = track.width / 2 + (airborne ? 55 : 9);
    // Below-road attachments are intentional; the actual road/hull corridor
    // remains clear. Flight gaps receive a taller, wider no-scenery envelope.
    if (
      selected &&
      lateral < width + radius &&
      height > -8 - radius &&
      height < (airborne ? 420 : 90) + radius
    ) {
      if (!blockers.has(name))
        blockers.set(name, {
          name,
          station,
          point: point.toArray(),
          lateral,
          height,
          radius,
        });
    }
  }
  for (const link of [...plan.arms, ...plan.stays, ...plan.gallery]) {
    const count = Math.max(1, Math.ceil(link.a.distanceTo(link.b) / 8));
    const radius = link.prototype ? 12 : link.width / 2;
    for (let i = 0; i <= count; i++)
      assess(link.a.clone().lerp(link.b, i / count), radius, link.name);
  }
  // Sample the real C-shaped carrier rather than its empty rectangular bounds.
  const spindle = plan.prototypes[0].matrix;
  for (let angle = 38; angle <= 322; angle += 4)
    assess(
      new T.Vector3(
        147 * Math.cos((angle * Math.PI) / 180),
        147 * Math.sin((angle * Math.PI) / 180),
        0,
      ).applyMatrix4(spindle),
      28,
      'receiver load-bearing C frame',
    );
  const crown = plan.prototypes[1].matrix;
  for (let x = -28; x <= 28; x += 14)
    for (let y = -25.5; y <= 47.4; y += 12)
      for (const z of [-21.575, 0, 20.5])
        assess(
          new T.Vector3(x, y, z).applyMatrix4(crown),
          9,
          'foil-seated winding crown',
        );
  return {
    safe: blockers.size === 0,
    blockers: [...blockers.values()],
    minDistance,
    samples,
    routeSamples: route.length,
  };
}
