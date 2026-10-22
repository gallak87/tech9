import RAPIER from '@dimforge/rapier3d-compat';
import * as T from 'three';
import { ConvexGeometry } from 'three/addons/geometries/ConvexGeometry.js';
import { createRoadSurface, roadTop } from './road-surface.js';
import { VEHICLE_HULL } from './hull.js';

export const RAPIER_RULES = Object.freeze({
  version: 12,
  packageVersion: '0.21.0',
  controller: 'query-hover-v3',
  staticCellSize: 96,
  simulationHz: 120,
  skin: 0.004,
  angularDamping: 1.2,
  contactBudget: 10,
  castIterations: 24,
  racerRestitution: 0.25,
  railRestitution: 0.08,
  crashRestitution: 0.16,
});
let initialization;
const UP = new T.Vector3(0, 1, 0);
const FORWARD = new T.Vector3(0, 0, 1);
const vector = (v) => new T.Vector3(v.x, v.y, v.z);
const rotation = (q) => new T.Quaternion(q.x, q.y, q.z, q.w);
const zero = () => new T.Vector3();
function finiteVector(value, name) {
  if (!value || !['x', 'y', 'z'].every((axis) => Number.isFinite(value[axis])))
    throw new Error(`Rapier requires a finite ${name}.`);
  return vector(value);
}
function finitePose(pose) {
  const position = finiteVector(pose?.position, 'position');
  const q = pose?.quaternion;
  if (!q || !['x', 'y', 'z', 'w'].every((axis) => Number.isFinite(q[axis])))
    throw new Error('Rapier requires a finite quaternion.');
  const quaternion = rotation(q);
  if (quaternion.lengthSq() < 1e-12)
    throw new Error('Rapier requires a nonzero quaternion.');
  return {
    position,
    quaternion:
      Math.abs(quaternion.lengthSq() - 1) < 1e-10
        ? quaternion
        : quaternion.normalize(),
  };
}
function validRoad(road) {
  return (
    !road ||
    (Number.isFinite(road.distance) &&
      Number.isFinite(road.length) &&
      road.length >= 0 &&
      Number.isFinite(road.reach) &&
      road.reach >= 0 &&
      Array.isArray(road.owners) &&
      road.owners.every((id) => typeof id === 'string'))
  );
}
function finiteSupport(support) {
  if (!validRoad(support?.road))
    throw new Error('Rapier requires finite road support ownership.');
  const pose = finitePose(support);
  return {
    ...pose,
    ...(support.destination
      ? {
          destination: finiteVector(support.destination, 'support destination'),
        }
      : {}),
    ...(support.road
      ? { road: { ...support.road, owners: [...support.road.owners] } }
      : {}),
  };
}

const copyContact = (c) => ({
  ...c,
  point: vector(c.point),
  normal: vector(c.normal),
  surfaceNormal: vector(c.surfaceNormal),
});
const copyPose = (p) => ({
  position: p.position.clone(),
  quaternion: p.quaternion.clone(),
});
const encodeQ = (q) => ({ x: q.x, y: q.y, z: q.z, w: q.w });
const sameShape = (saved, current) =>
  !current
    ? saved === null
    : saved?.id === current.id &&
      saved.hullSha256 === current.hullSha256 &&
      Array.isArray(saved.vertices) &&
      saved.vertices.length === current.vertices.length &&
      saved.vertices.every((v, i) => v === current.vertices[i]);

// Game-owned movement, immutable Rapier scene queries. All racers propose their
// movement before one shared contact pass; no dynamic solver or support joints.
export async function createRapierWorld({
  collisionWorld = null,
  gravity = 26,
} = {}) {
  if (
    (collisionWorld && !collisionWorld.triangles) ||
    !Number.isFinite(gravity) ||
    gravity < 0
  )
    throw new Error('Rapier requires authored static triangles and gravity.');
  initialization ??= RAPIER.init();
  await initialization;
  const roadSurface = createRoadSurface(collisionWorld?.triangles ?? []);
  const rulesId = `${collisionWorld?.rulesId ?? 'no-static-geometry'}:query:${JSON.stringify({ ...RAPIER_RULES, gravity })}`;
  const identity = `${collisionWorld?.id ?? 'racer-world'}:${collisionWorld?.version ?? 1}:${rulesId}`;
  const sources = new Map();
  for (const triangle of collisionWorld?.triangles ?? []) {
    const coords = triangle.roadCoordinates;
    const top = roadTop(triangle);
    const key = JSON.stringify([
      triangle.id,
      triangle.kind,
      top
        ? Math.floor(Math.min(...coords.map((point) => point[0])) / 64)
        : null,
    ]);
    if (!sources.has(key)) sources.set(key, []);
    sources.get(key).push(triangle);
  }
  const batches = [];
  for (const triangles of sources.values()) {
    // Only dense, extensive meshes benefit from partitioning. Keep primitive
    // boxes and large coarse faces intact, including their edge topology.
    const bounds = new T.Box3();
    let largestFace = 0;
    for (const triangle of triangles) {
      const face = new T.Box3();
      for (const point of triangle.points)
        face.expandByPoint(new T.Vector3(...point));
      bounds.union(face);
      largestFace = Math.max(
        largestFace,
        ...face.getSize(new T.Vector3()).toArray(),
      );
    }
    const size = RAPIER_RULES.staticCellSize;
    if (
      triangles.length < 128 ||
      largestFace > size ||
      Math.max(...bounds.getSize(new T.Vector3()).toArray()) <= size * 2
    ) {
      batches.push(triangles);
      continue;
    }
    // A circuit-wide collider keeps distant geometry in every racer's CCD
    // queries. Spatial cells bound candidates while retaining each authored
    // face and its source metadata; nothing is clipped, simplified or omitted.
    const cells = new Map();
    for (const triangle of triangles) {
      const key = [0, 1, 2]
        .map((axis) =>
          Math.floor(
            triangle.points.reduce((sum, point) => sum + point[axis], 0) /
              (3 * size),
          ),
        )
        .join(',');
      if (!cells.has(key)) cells.set(key, []);
      cells.get(key).push(triangle);
    }
    batches.push(...cells.values());
  }
  sources.clear();

  const actors = new Map(),
    statics = new Map(),
    shapes = new Map();
  const engine = new RAPIER.World({ x: 0, y: 0, z: 0 });
  let disposed = false;
  const alive = () => {
    if (disposed) throw new Error('Query world has been disposed.');
  };
  for (const triangles of batches) {
    const vertices = new Float32Array(triangles.length * 9),
      indices = new Uint32Array(triangles.length * 3);
    triangles.forEach((t, i) => {
      vertices.set(t.points.flat(), i * 9);
      indices.set([i * 3, i * 3 + 1, i * 3 + 2], i * 3);
    });
    const collider = engine.createCollider(
      RAPIER.ColliderDesc.trimesh(
        vertices,
        indices,
        RAPIER.TriMeshFlags.FIX_INTERNAL_EDGES_TWO_SIDED,
      ),
    );
    const road = roadTop(triangles[0]) && {
      id: triangles[0].id,
      start: Math.min(
        ...triangles.flatMap((t) => t.roadCoordinates.map((p) => p[0])),
      ),
      end: Math.max(
        ...triangles.flatMap((t) => t.roadCoordinates.map((p) => p[0])),
      ),
    };
    const faces = triangles.map(
      (t) => new T.Triangle(...t.points.map((p) => new T.Vector3(...p))),
    );
    statics.set(collider.handle, { collider, triangles, faces, road });
  }
  engine.step(); // Build the immutable static query index once.
  function ownsRoad(a, entry) {
    const s = a.support?.road,
      r = entry.road;
    if (
      r &&
      s?.owners.includes(r.id) &&
      [s.distance, s.distance - s.length, s.distance + s.length].some(
        (d) => d + s.reach >= r.start && d - s.reach <= r.end,
      )
    )
      return true;
    if (!a.support || r) return false;
    const n = UP.clone().applyQuaternion(a.support.quaternion),
      origin = a.support.position.clone().addScaledVector(n, -a.hull.hover);
    return entry.triangles.every(
      (t, i) =>
        t.kind === 'deck' &&
        t.points.every(
          (p) => Math.abs(new T.Vector3(...p).sub(origin).dot(n)) < 0.02,
        ) &&
        entry.faces[i].getNormal(zero()).dot(n) > 0.95,
    );
  }
  function shapeFor(a) {
    const key = a.contactShape?.hullSha256 ?? JSON.stringify(a.hull);
    if (!shapes.has(key)) {
      let shape, points;
      if (a.contactShape) {
        points = [];
        for (let i = 0; i < a.contactShape.vertices.length; i += 3)
          points.push(new T.Vector3().fromArray(a.contactShape.vertices, i));
        // One convex outer envelope retains the measured chassis silhouette.
        // Open wing gaps no longer make hooks, and there is one cast per racer.
        const geometry = new ConvexGeometry(points),
          v = geometry.attributes.position.array;
        const unique = [],
          indices = [],
          lookup = new Map();
        for (let i = 0; i < v.length; i += 3) {
          const key = `${v[i]},${v[i + 1]},${v[i + 2]}`;
          if (!lookup.has(key)) {
            lookup.set(key, unique.length / 3);
            unique.push(v[i], v[i + 1], v[i + 2]);
          }
          indices.push(lookup.get(key));
        }
        shape = new RAPIER.ConvexPolyhedron(
          Float32Array.from(unique),
          Uint32Array.from(indices),
        );
        geometry.dispose();
      } else {
        shape = new RAPIER.Cuboid(
          a.hull.halfWidth,
          a.hull.hover,
          a.hull.halfLength,
        );
        points = [
          new T.Vector3(-a.hull.halfWidth, -a.hull.hover, -a.hull.halfLength),
          new T.Vector3(a.hull.halfWidth, a.hull.hover, a.hull.halfLength),
        ];
      }
      const bounds = new T.Box3().setFromPoints(points),
        extent = bounds.getSize(zero()).multiplyScalar(0.5);
      shapes.set(key, {
        shape,
        radius: Math.max(...points.map((p) => p.length())),
        extent,
      });
    }
    Object.assign(a, shapes.get(key));
    // Disabled query proxies retain their native shape allocation. They never
    // enter the static broad phase, receive forces, or run in a native solve.
    if (a.proxy) engine.removeCollider(a.proxy, false);
    a.proxy = engine.createCollider(
      new RAPIER.ColliderDesc(a.shape).setEnabled(false),
    );
    const e = a.extent,
      m = a.mass / 3;
    a.inertia = new T.Vector3(
      m * (e.y * e.y + e.z * e.z),
      m * (e.x * e.x + e.z * e.z),
      m * (e.x * e.x + e.y * e.y),
    );
  }
  function metadata(entry, point, normal) {
    let index = 0,
      distance = Infinity;
    const nearest = zero();
    entry.faces.forEach((face, i) => {
      face.closestPointToPoint(point, nearest);
      const d = nearest.distanceToSquared(point);
      if (d < distance) {
        index = i;
        distance = d;
      }
    });
    const { points, ...shape } = entry.triangles[index];
    if (shape.roadBoundary) shape.boundaryPoints = points;
    const surfaceNormal = entry.faces[index].getNormal(zero());
    return {
      shape,
      surfaceNormal: surfaceNormal.lengthSq() ? surfaceNormal : normal.clone(),
    };
  }
  function linearResponse(a, n) {
    const result = n.clone();
    if (a.support) {
      const up = UP.clone().applyQuaternion(a.support.quaternion);
      result.addScaledVector(up, -result.dot(up));
    }
    return result.divideScalar(a.mass);
  }
  function angularResponse(a, t) {
    const result = t
      .clone()
      .applyQuaternion(a.quaternion.clone().invert())
      .divide(a.inertia)
      .applyQuaternion(a.quaternion);
    if (a.support) {
      const up = UP.clone().applyQuaternion(a.support.quaternion);
      return up.multiplyScalar(result.dot(up));
    }
    return result;
  }
  function plan(a, dt) {
    a.motion = a.velocity.clone().add(a.guide ?? zero());
    let baseRotation = a.quaternion;
    if (a.support) {
      const n = UP.clone().applyQuaternion(a.support.quaternion);
      // Magnetic adhesion absorbs pitch/roll spin immediately. Transport the
      // existing heading onto the road, then apply only the accepted yaw.
      a.angularVelocity.copy(
        n.clone().multiplyScalar(a.angularVelocity.dot(n)),
      );
      baseRotation = new T.Quaternion()
        .setFromUnitVectors(UP.clone().applyQuaternion(a.quaternion), n)
        .multiply(a.quaternion);
    }
    const omega = a.angularVelocity.length();
    a.endRotation =
      omega > 1e-10
        ? new T.Quaternion()
            .setFromAxisAngle(
              a.angularVelocity.clone().divideScalar(omega),
              omega * dt,
            )
            .multiply(baseRotation)
        : baseRotation.clone();
    if (a.support) {
      const n = UP.clone().applyQuaternion(a.support.quaternion);
      a.motion.addScaledVector(n, -a.motion.dot(n));
      a.motion.addScaledVector(
        n,
        a.support.position.clone().sub(a.position).dot(n) / dt,
      );
      a.velocity.addScaledVector(n, -a.velocity.dot(n));
      a.angularVelocity.copy(n.multiplyScalar(a.angularVelocity.dot(n)));
    }
    a.angle = a.quaternion.angleTo(a.endRotation);
    const delta = a.endRotation.clone().multiply(a.quaternion.clone().invert());
    if (delta.w < 0) delta.set(-delta.x, -delta.y, -delta.z, -delta.w);
    a.castOmega = new T.Vector3(delta.x, delta.y, delta.z);
    if (a.castOmega.lengthSq() > 1e-14) a.castOmega.setLength(a.angle / dt);
  }
  const at = (a, t, dt) => ({
    position: a.position.clone().addScaledVector(a.motion, t),
    quaternion: a.quaternion.clone().slerp(a.endRotation, dt > 0 ? t / dt : 0),
  });
  function refine(a, b, entry, dt) {
    const rotational = (a.radius * a.angle + (b ? b.radius * b.angle : 0)) / dt;
    let time = 0,
      contact,
      safeHit = null;
    const relative = a.motion.clone().sub(b?.motion ?? zero());
    for (let i = 0; i < RAPIER_RULES.castIterations; i++) {
      const ap = at(a, time, dt),
        bp = b && at(b, time, dt);
      const prediction =
        relative.length() * (dt - time) + rotational * (dt - time) + 0.1;
      a.proxy.setTranslation(ap.position);
      a.proxy.setRotation(ap.quaternion);
      if (b) {
        b.proxy.setTranslation(bp.position);
        b.proxy.setRotation(bp.quaternion);
      }
      contact = b
        ? a.proxy.contactCollider(b.proxy, prediction)
        : entry.collider.contactCollider(a.proxy, prediction);
      if (!contact) return null;
      const normal = vector(b ? contact.normal2 : contact.normal1).normalize(),
        point = vector(b ? contact.point2 : contact.point1);
      const speed = Math.max(0, -relative.dot(normal)) + rotational;
      const gap = contact.distance - RAPIER_RULES.skin;
      safeHit = {
        a,
        b,
        entry,
        time,
        point,
        normal,
        depth: Math.max(0, -contact.distance),
      };
      if (gap <= 0.0001) {
        const pointVelocity = relative
          .clone()
          .add(a.castOmega.clone().cross(point.clone().sub(ap.position)));
        if (b)
          pointVelocity.sub(
            b.castOmega.clone().cross(point.clone().sub(bp.position)),
          );
        if (
          time === 0 &&
          contact.distance >= -RAPIER_RULES.skin &&
          pointVelocity.dot(normal) >= -1e-6
        )
          return null;
        if (b) {
          const middle = ap.position
            .clone()
            .add(bp.position)
            .multiplyScalar(0.5);
          middle.addScaledVector(normal, point.clone().sub(middle).dot(normal));
          point.copy(middle);
        }
        return {
          a,
          b,
          entry,
          time,
          point,
          normal,
          depth: Math.max(0, -contact.distance),
        };
      }
      if (speed < 1e-8) return null;
      time += Math.max(1e-8, gap / speed);
      if (time > dt) return null;
    }
    // Exhausting an angular-distance search clips to its last verified safe
    // interval. It must never turn a query budget into permission to tunnel.
    return safeHit;
  }
  function staticCandidates(a, delta) {
    // A swept enclosing sphere includes the full rotating hull. The immutable
    // scene index rejects distant solids without rebuilding a native shape.
    const center = a.position.clone().addScaledVector(delta, 0.5);
    const extent = new T.Vector3(
      Math.abs(delta.x),
      Math.abs(delta.y),
      Math.abs(delta.z),
    )
      .multiplyScalar(0.5)
      .addScalar(a.radius + RAPIER_RULES.skin);
    const candidates = [];
    engine.collidersWithAabbIntersectingAabb(center, extent, (collider) => {
      const entry = statics.get(collider.handle);
      if (entry && !ownsRoad(a, entry)) candidates.push(entry);
      return true;
    });
    return candidates.sort((a, b) => a.collider.handle - b.collider.handle);
  }
  function staticHit(a, dt) {
    let best = null;
    for (const entry of staticCandidates(
      a,
      a.motion.clone().multiplyScalar(dt),
    )) {
      // Collider casts reuse both cached native shapes. World.castShape would
      // reconstruct the convex mesh on every racer sweep and contact retry.
      a.proxy.setTranslation(a.position);
      a.proxy.setRotation(a.quaternion);
      if (
        a.motion.lengthSq() >= 1e-10 &&
        !a.proxy.castCollider(
          a.motion,
          entry.collider,
          zero(),
          RAPIER_RULES.skin + a.radius * a.angle,
          best?.time ?? dt,
          true,
        )
      )
        continue;
      const exact = refine(a, null, entry, dt);
      if (exact && (!best || exact.time < best.time)) best = exact;
    }
    return best;
  }
  function pairHit(a, b, dt) {
    const relative = b.position.clone().sub(a.position),
      v = b.motion.clone().sub(a.motion);
    const time = v.lengthSq()
      ? T.MathUtils.clamp(-relative.dot(v) / v.lengthSq(), 0, dt)
      : 0;
    if (
      relative.addScaledVector(v, time).lengthSq() >
      (a.radius + b.radius + 0.05) ** 2
    )
      return null;
    return refine(a, b, null, dt);
  }
  function shift(a, delta) {
    if (delta.lengthSq() < 1e-14) return;
    let hit = null;
    a.proxy.setTranslation(a.position);
    a.proxy.setRotation(a.quaternion);
    for (const entry of staticCandidates(a, delta)) {
      const candidate = a.proxy.castCollider(
        delta,
        entry.collider,
        zero(),
        0,
        hit?.time_of_impact ?? 1,
        false,
      );
      if (candidate && (!hit || candidate.time_of_impact < hit.time_of_impact))
        hit = candidate;
    }
    a.position.addScaledVector(
      delta,
      hit
        ? Math.max(0, hit.time_of_impact - RAPIER_RULES.skin / delta.length())
        : 1,
    );
  }
  function respond(hit) {
    const { a, b, point } = hit,
      normal = hit.normal.clone();
    const details = b
      ? {
          shape: {
            id: `racer-${b.id}`,
            kind: 'racer',
            actorId: b.id,
            order: b.id,
          },
          surfaceNormal: normal.clone(),
        }
      : metadata(hit.entry, point, normal);
    // A mesh's coplanar triangle borders must not act as ledges. At a
    // near-zero-distance query use its authored face rather than a noisy GJK axis.
    if (
      !b &&
      details.shape.kind === 'deck' &&
      Math.abs(normal.dot(details.surfaceNormal)) > 0.5
    ) {
      const sign = Math.sign(normal.dot(details.surfaceNormal));
      normal.copy(details.surfaceNormal).multiplyScalar(sign);
    }
    let normalContact = false;
    if (a.support && (!b || b.support)) {
      const up = UP.clone().applyQuaternion(a.support.quaternion),
        flat = normal.clone().addScaledVector(up, -normal.dot(up));
      if (flat.lengthSq() > 0.04) normal.copy(flat.normalize());
      else if (b) {
        flat.copy(a.position).sub(b.position);
        flat.addScaledVector(up, -flat.dot(up));
        normal.copy(flat.lengthSq() > 1e-8 ? flat.normalize() : FORWARD);
      } else normalContact = true;
    }
    const ra = point.clone().sub(a.position),
      rb = b && point.clone().sub(b.position);
    const relative = a.velocity
      .clone()
      .add(a.angularVelocity.clone().cross(ra));
    if (b)
      relative.sub(b.velocity.clone().add(b.angularVelocity.clone().cross(rb)));
    const incoming = Math.max(0, -relative.dot(normal));
    const la = normalContact
        ? normal.clone().divideScalar(a.mass)
        : linearResponse(a, normal),
      lb = b ? linearResponse(b, normal) : zero();
    const wa =
        a.support && !b ? zero() : angularResponse(a, ra.clone().cross(normal)),
      wb = b ? angularResponse(b, rb.clone().cross(normal)) : zero();
    const denominator = normal.dot(
      la
        .clone()
        .add(lb)
        .add(wa.clone().cross(ra))
        .add(b ? wb.clone().cross(rb) : zero()),
    );
    const restitution = b
      ? RAPIER_RULES.racerRestitution
      : details.shape.kind === 'deck'
        ? 0
        : details.shape.kind === 'rail'
          ? RAPIER_RULES.railRestitution
          : RAPIER_RULES.crashRestitution;
    const impulse =
      denominator > 1e-8 ? ((1 + restitution) * incoming) / denominator : 0;
    a.velocity.addScaledVector(la, impulse);
    a.motion.addScaledVector(la, impulse);
    a.angularVelocity.addScaledVector(wa, impulse);
    if (b) {
      b.velocity.addScaledVector(lb, -impulse);
      b.motion.addScaledVector(lb, -impulse);
      b.angularVelocity.addScaledVector(wb, -impulse);
    }
    const linear = normal.dot(la.clone().add(lb)),
      closing = a.motion
        .clone()
        .sub(b?.motion ?? zero())
        .dot(normal);
    if (closing < 0 && linear > 1e-8) {
      const j = -closing / linear;
      a.velocity.addScaledVector(la, j);
      a.motion.addScaledVector(la, j);
      if (b) {
        b.velocity.addScaledVector(lb, -j);
        b.motion.addScaledVector(lb, -j);
      }
    }
    // Authored heavy machinery may bound the opponent's response. A nearly
    // vertical crush against magnetic support has vanishing planar inverse mass;
    // unrestricted impulses turn that constrained contact into enormous sideways
    // velocity. Ordinary racer/static responses retain their established rules.
    for (const [actor, other] of [
      [a, b],
      [b, a],
    ]) {
      if (!actor || !other?.contactSpeedLimit || actor.contactSpeedLimit)
        continue;
      const guide = actor.motion.clone().sub(actor.velocity);
      actor.velocity.clampLength(0, other.contactSpeedLimit);
      actor.motion.copy(actor.velocity).add(guide);
      actor.angularVelocity.clampLength(0, 12);
    }
    const push = Math.min(0.3, hit.depth + RAPIER_RULES.skin * 2);
    if (linear > 1e-8) {
      const da = la.clone().multiplyScalar(push / linear);
      if (b?.contactSpeedLimit) da.clampLength(0, push);
      shift(a, da);
      if (b) {
        const db = lb.clone().multiplyScalar(-push / linear);
        if (a.contactSpeedLimit) db.clampLength(0, push);
        shift(b, db);
      }
    }
    a.contacts.push({
      point: point.clone(),
      normal: normal.clone(),
      ...details,
      incomingSpeed: incoming,
      impulse,
      penetration: hit.depth,
    });
    if (b)
      b.contacts.push({
        point: point.clone(),
        normal: normal.clone().negate(),
        surfaceNormal: normal.clone().negate(),
        shape: {
          id: `racer-${a.id}`,
          kind: 'racer',
          actorId: a.id,
          order: a.id,
        },
        incomingSpeed: incoming,
        impulse,
        penetration: hit.depth,
      });
  }
  function move(active, dt) {
    let remaining = dt;
    for (const a of active) {
      a.blocked = false;
      a.hits = 0;
    }
    for (
      let iteration = 0;
      iteration < active.length * RAPIER_RULES.contactBudget + 1 &&
      remaining > 1e-9;
      iteration++
    ) {
      for (const a of active) {
        plan(a, remaining);
        if (a.blocked) {
          a.motion.set(0, 0, 0);
          a.endRotation.copy(a.quaternion);
          a.angle = 0;
        }
      }
      let first = null;
      const offer = (h) => {
        if (h && (!first || h.time < first.time - 1e-9)) first = h;
      };
      for (const a of active) if (!a.blocked) offer(staticHit(a, remaining));
      for (let i = 0; i < active.length; i++)
        for (let j = i + 1; j < active.length; j++)
          if (!active[i].blocked || !active[j].blocked)
            offer(pairHit(active[i], active[j], remaining));
      const time = first ? Math.max(0, first.time) : remaining;
      for (const a of active) {
        const pose = at(a, time, remaining);
        a.position.copy(pose.position);
        a.quaternion.copy(pose.quaternion);
      }
      remaining -= time;
      if (!first) break;
      respond(first);
      for (const a of [first.a, first.b].filter(Boolean))
        if (++a.hits >= RAPIER_RULES.contactBudget) a.blocked = true;
    }
  }
  function clear(a) {
    Object.assign(a, {
      position: zero(),
      quaternion: new T.Quaternion(),
      velocity: zero(),
      angularVelocity: zero(),
      acceleration: zero(),
      angularAcceleration: zero(),
      support: null,
      contacts: [],
      active: false,
    });
  }
  const api = {
    id: 'rapier-query-world',
    version: RAPIER_RULES.version,
    rulesId,
    identity,
    gravity,
    occlusionFraction(start, end) {
      alive();
      const direction = end.clone().sub(start);
      if (direction.lengthSq() < 1e-12) return 1;
      const hit = engine.castRay(
        new RAPIER.Ray(start, direction),
        1,
        true,
        undefined,
        undefined,
        undefined,
        undefined,
        (collider) => statics.has(collider.handle),
      );
      return hit?.timeOfImpact ?? 1;
    },
    sampleRoadSurface: (...args) => {
      alive();
      return roadSurface(...args);
    },
    createActor({
      hull = VEHICLE_HULL,
      mass = 1,
      contactSpeedLimit = null,
    } = {}) {
      alive();
      if (
        !['halfWidth', 'halfLength', 'hover'].every(
          (k) => Number.isFinite(hull[k]) && hull[k] > 0,
        ) ||
        !Number.isFinite(mass) ||
        mass <= 0
      )
        throw new Error('Query actor requires positive dimensions and mass.');
      let id = 0;
      while (actors.has(id)) id++;
      if (
        contactSpeedLimit !== null &&
        (!Number.isFinite(contactSpeedLimit) || contactSpeedLimit <= 0)
      )
        throw new Error('Contact speed limit must be positive.');
      const a = {
        id,
        mass,
        contactSpeedLimit,
        hull: { ...hull },
        contactShape: null,
      };
      clear(a);
      shapeFor(a);
      actors.set(id, a);
      const valid = () => {
        alive();
        if (actors.get(id) !== a)
          throw new Error('Query actor has been disposed.');
      };
      const setPose = (p) => {
        valid();
        Object.assign(a, finitePose(p));
        a.contacts = [];
      };
      const setVelocity = (v, w) => {
        valid();
        a.velocity = finiteVector(v, 'velocity');
        if (w !== undefined)
          a.angularVelocity = finiteVector(w, 'angular velocity');
      };
      return Object.freeze({
        id,
        setPose,
        setVelocity,
        setContactShape(shape) {
          valid();
          if (
            !shape?.id ||
            !shape.hullSha256 ||
            !Array.isArray(shape.vertices) ||
            shape.vertices.length < 12 ||
            shape.vertices.length % 3 ||
            !shape.vertices.every(Number.isFinite)
          )
            throw new Error('Query hull requires model bounds and identity.');
          a.contactShape = shape;
          shapeFor(a);
        },
        stage({
          pose,
          velocity,
          angularVelocity,
          active,
          support,
          acceleration,
          angularAcceleration,
          fraction = 1,
        } = {}) {
          valid();
          if (fraction !== 1)
            throw new Error(
              'Interacting actors must share the complete world step.',
            );
          if (pose) setPose(pose);
          if (velocity !== undefined) setVelocity(velocity, angularVelocity);
          else if (angularVelocity !== undefined)
            a.angularVelocity = finiteVector(
              angularVelocity,
              'angular velocity',
            );
          if (active !== undefined) a.active = Boolean(active);
          if (support !== undefined)
            a.support = support && finiteSupport(support);
          a.acceleration =
            acceleration === undefined
              ? zero()
              : finiteVector(acceleration, 'acceleration');
          a.angularAcceleration =
            angularAcceleration === undefined
              ? zero()
              : finiteVector(angularAcceleration, 'angular acceleration');
          if (!a.active) a.contacts = [];
        },
        read() {
          valid();
          return {
            ...copyPose(a),
            velocity: a.velocity.clone(),
            angularVelocity: a.angularVelocity.clone(),
            active: a.active,
            mass,
            contactShape: a.contactShape,
            support: a.support && finiteSupport(a.support),
            contacts: a.contacts.map(copyContact),
          };
        },
        reset({
          pose,
          velocity,
          angularVelocity,
          active = false,
          support = null,
        } = {}) {
          valid();
          clear(a);
          if (pose) setPose(pose);
          if (velocity) setVelocity(velocity, angularVelocity ?? zero());
          else if (angularVelocity)
            a.angularVelocity = finiteVector(
              angularVelocity,
              'angular velocity',
            );
          a.active = Boolean(active);
          a.support = support && finiteSupport(support);
        },
        dispose() {
          if (!disposed && actors.get(id) === a) {
            engine.removeCollider(a.proxy, false);
            actors.delete(id);
          }
        },
      });
    },
    step(dt) {
      alive();
      if (!Number.isFinite(dt) || dt <= 0 || dt > 0.1)
        throw new Error('Query world requires a finite fixed-step duration.');
      const active = [...actors.values()].filter((a) => a.active);
      for (const a of actors.values()) a.contacts = [];
      const steps = Math.ceil(dt * RAPIER_RULES.simulationHz - 1e-10),
        step = dt / steps;
      for (let i = 0; i < steps; i++) {
        for (const a of active) {
          a.velocity.addScaledVector(a.acceleration, step);
          a.velocity.y -= gravity * step;
          a.angularVelocity
            .addScaledVector(a.angularAcceleration, step)
            .multiplyScalar(Math.exp(-RAPIER_RULES.angularDamping * step));
          if (a.angularVelocity.length() > 12) a.angularVelocity.setLength(12);
        }
        for (const a of active)
          a.guide = a.support?.destination
            ? a.support.destination
                .clone()
                .sub(a.position)
                .divideScalar(step)
                .sub(a.velocity)
            : zero();
        move(active, step);
      }
      for (const a of actors.values()) {
        a.acceleration = zero();
        a.angularAcceleration = zero();
      }
    },
    snapshot() {
      alive();
      return JSON.parse(
        JSON.stringify({
          identity,
          actors: [...actors.values()].map((a) => ({
            id: a.id,
            mass: a.mass,
            contactSpeedLimit: a.contactSpeedLimit,
            hull: a.hull,
            contactShape: a.contactShape,
            ...copyPose(a),
            quaternion: encodeQ(a.quaternion),
            velocity: a.velocity,
            angularVelocity: a.angularVelocity,
            active: a.active,
            support: a.support && {
              ...a.support,
              quaternion: encodeQ(a.support.quaternion),
            },
            acceleration: a.acceleration,
            angularAcceleration: a.angularAcceleration,
            contacts: a.contacts,
          })),
        }),
      );
    },
    restore(data) {
      alive();
      if (
        data?.identity !== identity ||
        !Array.isArray(data.actors) ||
        data.actors.length !== actors.size ||
        new Set(data.actors.map((a) => a.id)).size !== actors.size ||
        data.actors.some(
          (a) =>
            !actors.has(a.id) ||
            !validRoad(a.support?.road) ||
            !sameShape(a.contactShape, actors.get(a.id).contactShape) ||
            typeof a.active !== 'boolean' ||
            actors.get(a.id).mass !== a.mass ||
            actors.get(a.id).contactSpeedLimit !==
              (a.contactSpeedLimit ?? null) ||
            JSON.stringify(actors.get(a.id).hull) !== JSON.stringify(a.hull),
        )
      )
        throw new Error('Query snapshot identity or actors do not match.');
      const next = data.actors.map((a) => ({
        ...a,
        ...finitePose(a),
        velocity: finiteVector(a.velocity, 'velocity'),
        angularVelocity: finiteVector(a.angularVelocity, 'angular velocity'),
        acceleration: finiteVector(a.acceleration, 'acceleration'),
        angularAcceleration: finiteVector(
          a.angularAcceleration,
          'angular acceleration',
        ),
        support: a.support && finiteSupport(a.support),
        contacts: a.contacts.map(copyContact),
      }));
      for (const a of next) {
        Object.assign(actors.get(a.id), a);
        shapeFor(actors.get(a.id));
      }
    },
    reset() {
      alive();
      for (const a of actors.values()) clear(a);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      engine.free();
      roadSurface.dispose();
      actors.clear();
      statics.clear();
      shapes.clear();
      batches.length = 0;
    },
  };
  return Object.freeze(api);
}
