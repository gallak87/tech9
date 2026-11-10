import * as T from 'three';
import {
  COLLECTOR_FOLD_SIZE,
  COLLECTOR_FOLD_OFFSETS,
} from '../ravel/collector-fold-data.js';

const Y = new T.Vector3(0, 1, 0);

export function levelFrame(track, distance) {
  const frame = track.sample(distance);
  const tangent = frame.tangent.clone().setY(0).normalize();
  const right = new T.Vector3(tangent.z, 0, -tangent.x);
  return {
    position: frame.position.clone(),
    tangent,
    right,
    up: Y,
    quaternion: new T.Quaternion().setFromRotationMatrix(
      new T.Matrix4().makeBasis(right, Y, tangent),
    ),
  };
}

// Retain Ravel's editable Blender fold cage, with its fixed corner hems, in a
// new set of independently placed collector sheets rather than the old ENV.
function foldAt(u, v) {
  const last = COLLECTOR_FOLD_SIZE - 1;
  const x = u * last,
    y = v * last;
  const col = Math.min(last - 1, Math.floor(x)),
    row = Math.min(last - 1, Math.floor(y));
  const out = [0, 0, 0];
  for (let j = 0; j < 2; j++)
    for (let i = 0; i < 2; i++) {
      const weight = (i ? x - col : 1 - x + col) * (j ? y - row : 1 - y + row);
      const index = 3 * ((row + j) * COLLECTOR_FOLD_SIZE + col + i);
      for (let axis = 0; axis < 3; axis++)
        out[axis] += COLLECTOR_FOLD_OFFSETS[index + axis] * weight;
    }
  return out;
}

export function sailPoint(definition, u, v) {
  const {
    frame,
    side,
    outboard,
    width,
    length,
    lift,
    sag,
    lean,
    yaw = 0,
  } = definition;
  const right = frame.right.clone().applyAxisAngle(Y, yaw);
  const forward = frame.tangent.clone().applyAxisAngle(Y, yaw);
  const fold = foldAt(u, v);
  const x = side * (outboard + (u - 0.5) * width);
  const z = (v - 0.5) * length;
  const height =
    lift -
    sag * Math.sin(u * Math.PI) * Math.sin(v * Math.PI) +
    lean * (u - 0.5) +
    95 * (v - 0.5);
  return frame.position
    .clone()
    .addScaledVector(right, x + side * fold[0] * 0.6)
    .addScaledVector(forward, z + fold[2] * 0.7)
    .addScaledVector(Y, height + fold[1]);
}

export function createSailGeometry(definition) {
  const rows = Math.max(30, Math.ceil(definition.length / 24));
  const columns = Math.max(30, Math.ceil(definition.width / 24));
  const positions = [],
    uv = [],
    coordinates = [],
    indices = [];
  for (let r = 0; r <= rows; r++)
    for (let c = 0; c <= columns; c++) {
      const u = c / columns,
        v = r / rows,
        point = sailPoint(definition, u, v);
      positions.push(point.x, point.y, point.z);
      uv.push((v * definition.length) / 24, (u * definition.width) / 16);
      coordinates.push(v * definition.length, u * definition.width);
    }
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < columns; c++) {
      const a = r * (columns + 1) + c,
        b = a + columns + 1;
      indices.push(a, b, a + 1, a + 1, b, b + 1);
    }
  const geometry = new T.BufferGeometry();
  geometry.setAttribute('position', new T.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new T.Float32BufferAttribute(uv, 2));
  geometry.setAttribute(
    'roadCoord',
    new T.Float32BufferAttribute(coordinates, 2),
  );
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}

export function routeSamples(track) {
  const points = [];
  for (let s = 0; s < track.length; s += 24) {
    const point = track.sample(s).position;
    points.push(point);
    if (
      track.jumps.some(
        (jump) => s >= jump.takeoff - 60 && s < jump.landingStart + 120,
      )
    )
      points.push(point.clone().addScaledVector(Y, 360), point.clone());
  }
  points.push(track.sample(track.length).position);
  return points;
}

export function clearanceAt(point, route) {
  let nearest = Infinity;
  const segment = new T.Line3();
  const closest = new T.Vector3();
  for (let i = 1; i < route.length; i++) {
    segment
      .set(route[i - 1], route[i])
      .closestPointToPoint(point, true, closest);
    nearest = Math.min(nearest, point.distanceToSquared(closest));
  }
  return Math.sqrt(nearest);
}

export function createSailbreakPlan(track) {
  const route = routeSamples(track),
    sails = [],
    stations = [];
  for (const [i, jump] of track.jumps.entries()) {
    const frame = levelFrame(track, jump.target + 35);
    const side = i % 2 ? 1 : -1;
    const primary = {
      id: `${jump.id}-receiving-fold`,
      frame,
      side,
      outboard: 660,
      width: 760,
      length: 1300,
      lift: -50,
      sag: 200,
      lean: 470,
      yaw: side * 0.08,
      gold: i === 2 || i === 4,
    };
    sails.push(primary);
    stations.push({ index: i, jump, frame, side, sail: primary });
  }
  // The original road is a new winding course. Test every sheet against that
  // whole course, not just its local receiving station, before placing it.
  for (const sail of sails) {
    const initialOutboard = sail.outboard,
      initialLift = sail.lift;
    const lifts = [0, -450, 650, -900, 1100];
    for (let attempt = 0; attempt < lifts.length * 8; attempt++) {
      sail.outboard = initialOutboard + (attempt % 8) * 110;
      sail.lift = initialLift + lifts[Math.floor(attempt / 8)];
      let nearest = Infinity;
      for (let r = 0; r <= 24; r++)
        for (let c = 0; c <= 20; c++)
          nearest = Math.min(
            nearest,
            clearanceAt(sailPoint(sail, c / 20, r / 24), route),
          );
      if (nearest >= 205) break;
      if (attempt === lifts.length * 8 - 1)
        throw new Error(`Sailbreak cannot clear ${sail.id}`);
    }
  }
  return { sails, stations, route };
}
