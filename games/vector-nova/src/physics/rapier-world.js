import RAPIER from '@dimforge/rapier3d-compat';
import * as T from 'three';
import { COLLISION_RULES } from './collision-world.js';
import { VEHICLE_HULL } from './hull.js';

export const RAPIER_RULES = Object.freeze({
  version: 6,
  packageVersion: '0.21.0',
  staticCellSize: 96,
  angularDamping: 1.2,
  maxCcdSubsteps: 6,
  // Preserve 32 constraint sweeps, with four PGS refinements per temporal
  // iteration. Thirty-two temporal iterations both waste work and magnify
  // hover-plane correction velocities enough to trigger Rapier's speed cap.
  solverIterations: 8,
  internalPgsIterations: 4,
  airborneSolverIterations: 32,
  simulationHz: 480,
  supportedSimulationHz: 240,
  fastPairDistance: 32,
  fastPairClosingSpeed: 120,
  supportCorrectionSpeed: 15,
  supportFrequency: 120,
  supportRecoveryFrequency: 240,
  supportAcceleration: 1200,
  supportContactDistance: 12,
  supportContactRelease: 0.2,
  friction: 0.55,
  railFriction: 0.18,
  // Hovering contact transfers deck-normal impulses without tyre-like grip.
  deckFriction: 0,
  terrainFriction: 0.65,
  structureFriction: 0.42,
  racerRestitution: 0.25,
});
// Membership in the high 16 bits, accepted membership in the low 16 bits.
const STATIC_GROUPS = (1 << 16) | 2;
const ACTOR_GROUPS = (2 << 16) | 3;
const COMPLIANT_ANGULAR_AXES = [RAPIER.JointAxis.AngX, RAPIER.JointAxis.AngZ];
const LOCKED_SUPPORT_AXES =
  RAPIER.JointAxesMask.LinY |
  RAPIER.JointAxesMask.AngX |
  RAPIER.JointAxesMask.AngZ;
let initialization;
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
  return { position, quaternion: quaternion.normalize() };
}
function finiteSupport(support) {
  const pose = finitePose(support);
  const bodyFrame =
    support.bodyFrame === undefined
      ? new T.Quaternion()
      : finitePose({ position: zero(), quaternion: support.bodyFrame })
          .quaternion;
  return {
    ...pose,
    bodyFrame,
    normalCompliance: support.normalCompliance === true,
  };
}
const encodeRotation = (quaternion) =>
  Object.fromEntries(
    ['x', 'y', 'z', 'w'].map((axis) => [axis, quaternion[axis]]),
  );
function encode(bytes) {
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += 8192)
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 8192));
  return btoa(binary);
}
function decode(binary) {
  // String iteration creates an intermediate element per byte. Large authored
  // worlds can exhaust the browser heap before Rapier restores the snapshot.
  const decoded = atob(binary);
  const bytes = new Uint8Array(decoded.length);
  for (let i = 0; i < decoded.length; i++) bytes[i] = decoded.charCodeAt(i);
  return bytes;
}
function copyContact(contact) {
  return {
    ...contact,
    point: vector(contact.point),
    normal: vector(contact.normal),
    surfaceNormal: vector(contact.surfaceNormal),
  };
}

// Renderer/DOM-independent shared dynamics. Every adapter stages its actor,
// session advances this world once, then adapters consume the solved bodies.
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
  const rulesId = `${collisionWorld?.rulesId ?? 'no-static-geometry'}:rapier:${JSON.stringify(
    {
      ...RAPIER_RULES,
      gravity,
    },
  )}`;
  const identity = `${collisionWorld?.id ?? 'racer-world'}:${collisionWorld?.version ?? 1}:${rulesId}`;
  const sources = new Map();
  for (const triangle of collisionWorld?.triangles ?? []) {
    const key = JSON.stringify([triangle.id, triangle.kind]);
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
  const actors = new Map();
  let engine,
    staticShapes,
    disposed = false;
  const alive = () => {
    if (disposed) throw new Error('Rapier world has been disposed.');
  };
  function createActorColliders(actor, body) {
    const parts = actor.contactShape
      ? (actor.contactShape.parts ?? [actor.contactShape])
      : null;
    const descriptions = parts
      ? parts.map((part) =>
          RAPIER.ColliderDesc.convexHull(Float32Array.from(part.vertices)),
        )
      : [
          RAPIER.ColliderDesc.cuboid(
            actor.hull.halfWidth,
            actor.hull.hover,
            actor.hull.halfLength,
          ),
        ];
    if (descriptions.some((shape) => !shape))
      throw new Error('Racer contact hull must enclose a volume.');
    const colliders = descriptions.map((shape) =>
      engine.createCollider(
        shape
          .setDensity(1)
          .setCollisionGroups(ACTOR_GROUPS)
          .setSolverGroups(ACTOR_GROUPS)
          .setFriction(actor.support ? 0 : RAPIER_RULES.friction)
          .setFrictionCombineRule(RAPIER.CoefficientCombineRule.Min)
          .setRestitution(RAPIER_RULES.racerRestitution)
          .setRestitutionCombineRule(RAPIER.CoefficientCombineRule.Max),
        body,
      ),
    );
    const volumeMass = colliders.reduce(
      (sum, collider) => sum + collider.mass(),
      0,
    );
    for (const collider of colliders)
      collider.setMass((actor.mass * collider.mass()) / volumeMass);
    actor.colliderHandles = colliders.map((collider) => collider.handle);
    actor.colliderHandle = actor.colliderHandles[0];
    body.recomputeMassPropertiesFromColliders();
  }
  function createBody(actor) {
    const body = engine.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic()
        .setAdditionalSolverIterations(
          RAPIER_RULES.airborneSolverIterations - RAPIER_RULES.solverIterations,
        )
        .setCcdEnabled(true)
        .setCanSleep(false)
        .setAngularDamping(RAPIER_RULES.angularDamping)
        .setEnabled(false),
    );
    actor.bodyHandle = body.handle;
    createActorColliders(actor, body);
    actor.anchorHandle = engine.createRigidBody(
      RAPIER.RigidBodyDesc.fixed(),
    ).handle;
    actor.jointHandle = null;
    actor.support = null;
    actor.supportFrom = null;
    actor.compliantSupport = false;
    actor.supportContactTime = 0;
    actor.active = false;
    actor.acceleration = zero();
    actor.angularAcceleration = zero();
    actor.contacts = [];
  }
  function rebuild() {
    engine?.free();
    engine = new RAPIER.World({ x: 0, y: -gravity, z: 0 });
    engine.maxCcdSubsteps = RAPIER_RULES.maxCcdSubsteps;
    engine.numSolverIterations = RAPIER_RULES.solverIterations;
    engine.integrationParameters.numInternalPgsIterations =
      RAPIER_RULES.internalPgsIterations;
    engine.timestep = 1 / 120;
    staticShapes = new Map();
    for (const triangles of batches) {
      const vertices = new Float32Array(triangles.length * 9);
      const indices = new Uint32Array(triangles.length * 3);
      for (const [index, triangle] of triangles.entries()) {
        vertices.set(triangle.points.flat(), index * 9);
        indices.set([index * 3, index * 3 + 1, index * 3 + 2], index * 3);
      }
      const kind = triangles[0].kind;
      const collider = engine.createCollider(
        RAPIER.ColliderDesc.trimesh(
          vertices,
          indices,
          RAPIER.TriMeshFlags.FIX_INTERNAL_EDGES_TWO_SIDED,
        )
          .setCollisionGroups(STATIC_GROUPS)
          .setSolverGroups(STATIC_GROUPS)
          .setFriction(RAPIER_RULES[`${kind}Friction`])
          .setFrictionCombineRule(RAPIER.CoefficientCombineRule.Min)
          .setRestitution(
            kind === 'rail'
              ? COLLISION_RULES.railRestitution
              : COLLISION_RULES.crashRestitution,
          )
          .setRestitutionCombineRule(RAPIER.CoefficientCombineRule.Max),
      );
      staticShapes.set(collider.handle, triangles);
    }
    for (const actor of [...actors.values()].sort((a, b) => a.id - b.id))
      createBody(actor);
  }
  rebuild();
  const bodyOf = (actor) => {
    alive();
    if (actors.get(actor.id) !== actor)
      throw new Error('Rapier actor has been disposed.');
    return engine.getRigidBody(actor.bodyHandle);
  };
  function configureSupportMotors(actor) {
    if (actor.jointHandle === null) return;
    const axes = [
      ...(actor.compliantSupport ? COMPLIANT_ANGULAR_AXES : []),
      ...(actor.support?.normalCompliance ? [RAPIER.JointAxis.LinY] : []),
    ];
    if (axes.length === 0) return;
    const raw = engine.impulseJoints.raw;
    const body = bodyOf(actor);
    const release =
      1 - actor.supportContactTime / RAPIER_RULES.supportContactRelease;
    const blend = T.MathUtils.smoothstep(release, 0, 1);
    const frequency = T.MathUtils.lerp(
      RAPIER_RULES.supportFrequency,
      RAPIER_RULES.supportRecoveryFrequency,
      blend,
    );
    const acceleration = RAPIER_RULES.supportAcceleration;
    const inertia = body.principalInertia();
    for (const axis of axes) {
      raw.jointConfigureMotorModel(
        actor.jointHandle,
        axis,
        RAPIER.MotorModel.AccelerationBased,
      );
      raw.jointConfigureMotorPosition(
        actor.jointHandle,
        axis,
        0,
        frequency ** 2,
        2 * frequency,
      );
      raw.jointSetMotorMaxForce(
        actor.jointHandle,
        axis,
        acceleration *
          (axis === RAPIER.JointAxis.LinY
            ? body.mass()
            : Math.max(inertia.x, inertia.y, inertia.z)),
      );
    }
  }
  function setSupport(actor, support) {
    const colliders = actor.colliderHandles.map((handle) =>
      engine.getCollider(handle),
    );
    bodyOf(actor).setAdditionalSolverIterations(
      support === null
        ? RAPIER_RULES.airborneSolverIterations - RAPIER_RULES.solverIterations
        : 0,
    );
    if (support === null) {
      if (actor.jointHandle !== null)
        engine.removeImpulseJoint(
          engine.getImpulseJoint(actor.jointHandle),
          true,
        );
      actor.jointHandle = null;
      actor.support = null;
      actor.supportFrom = null;
      colliders.forEach((collider) =>
        collider.setFriction(RAPIER_RULES.friction),
      );
      return;
    }
    const pose = finiteSupport(support);
    const body = bodyOf(actor);
    actor.supportFrom ??= actor.support ?? {
      position: vector(body.translation()),
      quaternion: rotation(body.rotation()).multiply(pose.bodyFrame),
      bodyFrame: pose.bodyFrame.clone(),
      normalCompliance: false,
    };
    if (
      actor.support?.normalCompliance !== pose.normalCompliance &&
      actor.jointHandle !== null
    ) {
      engine.removeImpulseJoint(
        engine.getImpulseJoint(actor.jointHandle),
        true,
      );
      actor.jointHandle = null;
    }
    actor.support = pose;
    let joint =
      actor.jointHandle === null
        ? null
        : engine.getImpulseJoint(actor.jointHandle);
    if (!joint) {
      let locked = actor.compliantSupport
        ? RAPIER.JointAxesMask.LinY
        : LOCKED_SUPPORT_AXES;
      if (pose.normalCompliance) locked &= ~RAPIER.JointAxesMask.LinY;
      joint = engine.createImpulseJoint(
        RAPIER.JointData.generic(
          pose.position,
          zero(),
          { x: 1, y: 0, z: 0 },
          locked,
        ),
        engine.getRigidBody(actor.anchorHandle),
        bodyOf(actor),
        true,
      );
      actor.jointHandle = joint.handle;
      // Let touching sloped hulls yield in pitch/roll while the magnets retain
      // normal adhesion. Freeing normal translation as well let a small bump
      // launch a supported ship over the railing.
      // Rapier's generic-joint facade omits motors; its public raw bindings
      // expose the same implicit motor solver used by the typed joints.
      configureSupportMotors(actor);
    }
    // This is local magnetic suspension, not an imposed vehicle pose.
    // Its three free axes retain the solver's forward/sideways motion and yaw.
    // Sampling a new frame changes the magnetic support surface only.
    joint.setLocalFrame1(pose.position, pose.quaternion);
    joint.setLocalFrame2(zero(), pose.bodyFrame);
    // Magnetic support has no tire friction. Contact normals still produce
    // impulses and off-centre yaw; airborne contacts retain their own friction.
    colliders.forEach((collider) => collider.setFriction(0));
  }
  function pointVelocity(before, point, dt) {
    return before.velocity
      .clone()
      .addScaledVector(before.acceleration, dt)
      .add(
        before.angularVelocity
          .clone()
          .addScaledVector(before.angularAcceleration, dt)
          .cross(point.clone().sub(before.position)),
      );
  }
  function contactsFor(actor, before, dt, beforeByActor) {
    const contacts = [];
    for (const handle of actor.colliderHandles) {
      const collider = engine.getCollider(handle);
      engine.contactPairsWith(collider, (other) => {
        const triangles = staticShapes.get(other.handle);
        const otherActor = triangles
          ? null
          : [...actors.values()].find((entry) =>
              entry.colliderHandles.includes(other.handle),
            );
        if (!triangles && !otherActor) return;
        engine.contactPair(collider, other, (manifold, flipped) => {
          const normal = vector(manifold.normal()).multiplyScalar(
            flipped ? 1 : -1,
          );
          const triangle =
            triangles?.[flipped ? manifold.subshape1() : manifold.subshape2()];
          if (triangles && !triangle) return;
          let shape, surfaceNormal;
          if (triangle) {
            const { points, ...metadata } = triangle;
            shape = {
              ...metadata,
              ...(triangle.roadBoundary ? { boundaryPoints: points } : {}),
            };
            surfaceNormal = new T.Vector3(...points[1])
              .sub(new T.Vector3(...points[0]))
              .cross(
                new T.Vector3(...points[2]).sub(new T.Vector3(...points[0])),
              )
              .normalize();
          } else {
            shape = {
              kind: 'racer',
              id: `racer-${otherActor.id}`,
              actorId: otherActor.id,
              order: otherActor.id,
            };
            surfaceNormal = normal.clone();
          }
          // CCD can finish the tick after a bounce, leaving the actual geometric
          // manifold but no final solver contacts. Its static witness remains a
          // valid impact point. Static trimeshes use world vertices at identity.
          const solver = manifold.numSolverContacts() > 0;
          const count = solver
            ? manifold.numSolverContacts()
            : manifold.numContacts();
          for (let index = 0; index < count; index++) {
            const rawPoint = solver
              ? manifold.solverContactPoint(index)
              : flipped
                ? manifold.localContactPoint1(index)
                : manifold.localContactPoint2(index);
            let separation = solver
              ? manifold.solverContactDist(index)
              : manifold.contactDist(index);
            if (!rawPoint) continue;
            const point = vector(rawPoint);
            if (!solver) {
              // CCD may leave the manifold's cached distance at its pre-impact
              // value even after a bounce. Transform both local witnesses with
              // the solved collider poses before deciding whether they touch.
              point
                .applyQuaternion(rotation(other.rotation()))
                .add(vector(other.translation()));
              const localActorPoint = flipped
                ? manifold.localContactPoint2(index)
                : manifold.localContactPoint1(index);
              if (!localActorPoint) continue;
              const actorPoint = vector(localActorPoint)
                .applyQuaternion(rotation(collider.rotation()))
                .add(vector(collider.translation()));
              separation = actorPoint.sub(point).dot(normal);
            }
            if (separation > 0.025) continue;
            // Use pre-solver physical point velocity, never the already reflected
            // result. Acceleration is integrated over this actor's active tick.
            const incoming = pointVelocity(before, point, dt);
            if (otherActor && beforeByActor.has(otherActor.id))
              incoming.sub(
                pointVelocity(beforeByActor.get(otherActor.id), point, dt),
              );
            contacts.push({
              point,
              normal: normal.clone(),
              surfaceNormal: surfaceNormal.clone(),
              shape,
              incomingSpeed: Math.max(0, -incoming.dot(normal)),
              impulse:
                index < manifold.numContacts()
                  ? manifold.contactImpulse(index)
                  : 0,
              penetration: Math.max(0, -separation),
            });
          }
        });
      });
    }
    contacts.sort(
      (a, b) =>
        b.incomingSpeed - a.incomingSpeed || a.shape.order - b.shape.order,
    );
    return contacts;
  }
  const api = {
    id: 'rapier-world',
    version: RAPIER_RULES.version,
    rulesId,
    identity,
    gravity,
    createActor({ hull = VEHICLE_HULL, mass = 1 } = {}) {
      alive();
      if (
        !['halfWidth', 'halfLength', 'hover'].every(
          (key) => Number.isFinite(hull[key]) && hull[key] > 0,
        )
      )
        throw new Error('Rapier requires positive whole-hull dimensions.');
      if (!Number.isFinite(mass) || mass <= 0)
        throw new Error('Rapier requires a positive actor mass.');
      let id = 0;
      while (actors.has(id)) id++;
      const actor = { id, hull: { ...hull }, mass };
      actors.set(id, actor);
      createBody(actor);
      function setPose(pose) {
        const body = bodyOf(actor),
          valid = finitePose(pose);
        body.setTranslation(valid.position, true);
        body.setRotation(valid.quaternion, true);
        actor.contacts = [];
      }
      function setVelocity(velocity, angularVelocity) {
        const body = bodyOf(actor);
        body.setLinvel(finiteVector(velocity, 'velocity'), true);
        if (angularVelocity !== undefined)
          body.setAngvel(
            finiteVector(angularVelocity, 'angular velocity'),
            true,
          );
      }
      function setContactShape(shape) {
        if (
          !shape?.id ||
          !shape.hullSha256 ||
          !Array.isArray(shape.vertices) ||
          shape.vertices.length < 12 ||
          shape.vertices.length % 3 ||
          !shape.vertices.every(Number.isFinite)
        )
          throw new Error(
            'Racer contact hull requires finite model vertices and identity.',
          );
        if (actor.contactShape?.hullSha256 === shape.hullSha256) return;
        if (
          shape.parts &&
          (!Array.isArray(shape.parts) ||
            !shape.parts.length ||
            shape.parts.some(
              (part) =>
                !Array.isArray(part.vertices) ||
                part.vertices.length < 12 ||
                part.vertices.length % 3 ||
                !part.vertices.every(Number.isFinite),
            ))
        )
          throw new Error('Racer compound hull requires valid convex parts.');
        const body = bodyOf(actor);
        for (const handle of actor.colliderHandles)
          engine.removeCollider(engine.getCollider(handle), true);
        actor.contactShape = shape;
        createActorColliders(actor, body);
      }
      const adapter = {
        id,
        setContactShape,
        stage({
          pose,
          velocity,
          angularVelocity,
          active,
          acceleration,
          angularAcceleration,
          support,
          fraction = 1,
        } = {}) {
          if (fraction !== 1)
            throw new Error(
              'Interacting Rapier actors must share the complete world step.',
            );
          const body = bodyOf(actor);
          if (pose) setPose(pose);
          if (velocity !== undefined) setVelocity(velocity, angularVelocity);
          else if (angularVelocity !== undefined)
            body.setAngvel(
              finiteVector(angularVelocity, 'angular velocity'),
              true,
            );
          if (active !== undefined) {
            actor.active = Boolean(active);
            body.setEnabled(actor.active);
          }
          if (support !== undefined) setSupport(actor, support);
          actor.acceleration =
            acceleration === undefined
              ? zero()
              : finiteVector(acceleration, 'acceleration');
          actor.angularAcceleration =
            angularAcceleration === undefined
              ? zero()
              : finiteVector(angularAcceleration, 'angular acceleration');
          if (!actor.active) actor.contacts = [];
        },
        read() {
          const body = bodyOf(actor);
          return {
            position: vector(body.translation()),
            quaternion: rotation(body.rotation()),
            velocity: vector(body.linvel()),
            angularVelocity: vector(body.angvel()),
            mass: actor.mass,
            contactShape: actor.contactShape ?? null,
            active: actor.active,
            support: actor.support && finiteSupport(actor.support),
            contacts: actor.contacts.map(copyContact),
          };
        },
        setPose,
        setVelocity,
        reset({
          pose,
          velocity,
          angularVelocity,
          active = false,
          support = null,
        } = {}) {
          const body = bodyOf(actor);
          setPose(pose ?? { position: zero(), quaternion: new T.Quaternion() });
          setVelocity(velocity ?? zero(), angularVelocity ?? zero());
          body.resetForces(false);
          body.resetTorques(false);
          body.setGravityScale(1, false);
          body.setAngularDamping(RAPIER_RULES.angularDamping);
          actor.active = Boolean(active);
          actor.acceleration = zero();
          actor.angularAcceleration = zero();
          actor.contacts = [];
          setSupport(actor, null);
          actor.supportFrom = null;
          actor.compliantSupport = false;
          actor.supportContactTime = 0;
          setSupport(actor, support);
          body.setEnabled(actor.active);
        },
        dispose() {
          if (disposed || actors.get(id) !== actor) return;
          engine.removeRigidBody(engine.getRigidBody(actor.anchorHandle));
          engine.removeRigidBody(bodyOf(actor));
          actors.delete(id);
        },
      };
      return Object.freeze(adapter);
    },
    step(dt) {
      alive();
      if (!Number.isFinite(dt) || dt <= 0 || dt > 0.1)
        throw new Error('Rapier requires a finite fixed-step duration.');
      // A constrained racer needs two native solves per control tick. Keep
      // the finer original CCD cadence whenever a hull is in free flight;
      // thin-wall impacts and landing captures depend on that resolution.
      const active = [...actors.values()].filter((actor) => actor.active);
      // Begin compliance before narrow-phase contact, including a slight
      // approach margin. Hold it briefly after separation so a glancing hit
      // cannot alternate between a spring and an immovable support plane.
      for (const actor of active)
        actor.supportContactTime = Math.max(0, actor.supportContactTime - dt);
      const positions = active.map((actor) =>
        vector(bodyOf(actor).translation()),
      );
      for (let i = 0; i < active.length; i++) {
        if (!active[i].support) continue;
        for (let j = i + 1; j < active.length; j++) {
          if (!active[j].support) continue;
          if (
            positions[i].distanceToSquared(positions[j]) <
            RAPIER_RULES.supportContactDistance ** 2
          ) {
            active[i].supportContactTime = RAPIER_RULES.supportContactRelease;
            active[j].supportContactTime = RAPIER_RULES.supportContactRelease;
          }
        }
      }
      for (const actor of active) {
        const compliant = actor.supportContactTime > 0;
        if (compliant !== actor.compliantSupport) {
          actor.compliantSupport = compliant;
          if (actor.support) {
            engine.removeImpulseJoint(
              engine.getImpulseJoint(actor.jointHandle),
              true,
            );
            actor.jointHandle = null;
            setSupport(actor, actor.support);
          }
        }
        configureSupportMotors(actor);
      }
      let supported = active.every((actor) => actor.support !== null);
      if (supported) {
        const moving = active.map((actor) => {
          const body = bodyOf(actor);
          return {
            position: vector(body.translation()),
            velocity: vector(body.linvel()),
          };
        });
        // Fast opposing/rear impacts need the finer cadence too. Ordinary
        // racers moving together can use the cheaper constrained solve.
        for (let i = 0; i < moving.length && supported; i++) {
          for (let j = i + 1; j < moving.length; j++) {
            if (
              moving[i].position.distanceToSquared(moving[j].position) <
                RAPIER_RULES.fastPairDistance ** 2 &&
              moving[i].velocity.distanceToSquared(moving[j].velocity) >
                RAPIER_RULES.fastPairClosingSpeed ** 2
            ) {
              supported = false;
              break;
            }
          }
        }
      }
      const frequency = supported
        ? RAPIER_RULES.supportedSimulationHz
        : RAPIER_RULES.simulationHz;
      const steps = Math.ceil(dt * frequency - 1e-10);
      const step = dt / steps;
      engine.timestep = step;
      for (const actor of actors.values()) actor.contacts = [];
      // Every racer shares each native substep. Pilot forces persist for the
      // control tick; collision manifolds from earlier substeps stay available
      // for feedback and landing acceptance even after the bodies separate.
      for (let tick = 0; tick < steps; tick++) {
        const beforeByActor = new Map();
        for (const actor of actors.values()) {
          if (!actor.active) continue;
          const body = bodyOf(actor);
          if (actor.support) {
            // Feed the changing hover plane through native substeps. A sudden
            // height correction creates a large bias velocity in the stiff
            // joint; Rapier's speed cap then also clips the free road-plane
            // velocity. Interpolating the constraint avoids that false braking
            // without replacing the solved pose or collision momentum.
            const fraction = (tick + 1) / steps;
            const from = actor.supportFrom ?? actor.support,
              to = actor.support;
            const position = from.position.clone().lerp(to.position, fraction);
            const quaternion = from.quaternion
              .clone()
              .slerp(to.quaternion, fraction);
            const normal = new T.Vector3(0, 1, 0).applyQuaternion(quaternion);
            const error = position
              .clone()
              .sub(vector(body.translation()))
              .dot(normal);
            // Landing can request nearly a metre of extra hull clearance.
            // Bound only normal-plane correction, allowing it to settle over
            // several ticks instead of clipping tangential momentum at the
            // engine's velocity cap. Free-axis position is never corrected.
            // A landing motor already limits force and damps normal velocity.
            // It must pull toward the real receiving plane; the error limiter
            // is only for a rigid joint's position-correction bias.
            if (!actor.support.normalCompliance) {
              const limit = RAPIER_RULES.supportCorrectionSpeed * step;
              position.addScaledVector(
                normal,
                T.MathUtils.clamp(error, -limit, limit) - error,
              );
            }
            const joint = engine.getImpulseJoint(actor.jointHandle);
            joint.setLocalFrame1(position, quaternion);
            joint.setLocalFrame2(
              zero(),
              from.bodyFrame.clone().slerp(to.bodyFrame, fraction),
            );
          }
          const before = {
            position: vector(body.worldCom()),
            velocity: vector(body.linvel()),
            angularVelocity: vector(body.angvel()),
            angularAcceleration: actor.angularAcceleration.clone(),
            acceleration: actor.acceleration
              .clone()
              .add(new T.Vector3(0, -gravity, 0)),
          };
          body.resetForces(false);
          body.resetTorques(false);
          body.addForce(
            actor.acceleration.clone().multiplyScalar(body.mass()),
            true,
          );
          const principalFrame = rotation(body.rotation()).multiply(
            rotation(body.principalInertiaLocalFrame()),
          );
          const torque = actor.angularAcceleration
            .clone()
            .applyQuaternion(principalFrame.clone().invert())
            .multiply(vector(body.principalInertia()))
            .applyQuaternion(principalFrame);
          body.addTorque(torque, true);
          beforeByActor.set(actor.id, before);
        }
        engine.step();
        for (const actor of actors.values()) {
          if (!actor.active) continue;
          actor.contacts.push(
            ...contactsFor(
              actor,
              beforeByActor.get(actor.id),
              step,
              beforeByActor,
            ),
          );
        }
      }
      for (const actor of actors.values()) {
        if (!actor.active) continue;
        const body = bodyOf(actor);
        body.resetForces(false);
        body.resetTorques(false);
        actor.acceleration = zero();
        actor.angularAcceleration = zero();
        actor.supportFrom = null;
      }
    },
    snapshot() {
      alive();
      return {
        identity,
        engine: encode(engine.takeSnapshot()),
        actors: [...actors.values()]
          .sort((a, b) => a.id - b.id)
          .map((actor) => ({
            id: actor.id,
            hull: { ...actor.hull },
            mass: actor.mass,
            contactShape: actor.contactShape ?? null,
            bodyHandle: actor.bodyHandle,
            colliderHandle: actor.colliderHandle,
            colliderHandles: [...actor.colliderHandles],
            anchorHandle: actor.anchorHandle,
            jointHandle: actor.jointHandle,
            support: actor.support && {
              position: { ...actor.support.position },
              quaternion: encodeRotation(actor.support.quaternion),
              bodyFrame: encodeRotation(actor.support.bodyFrame),
              normalCompliance: actor.support.normalCompliance,
            },
            supportFrom: actor.supportFrom && {
              position: { ...actor.supportFrom.position },
              quaternion: encodeRotation(actor.supportFrom.quaternion),
              bodyFrame: encodeRotation(actor.supportFrom.bodyFrame),
              normalCompliance: actor.supportFrom.normalCompliance,
            },
            compliantSupport: actor.compliantSupport,
            supportContactTime: actor.supportContactTime,
            active: actor.active,
            acceleration: { ...actor.acceleration },
            angularAcceleration: { ...actor.angularAcceleration },
            contacts: actor.contacts.map(copyContact),
          })),
      };
    },
    restore(data) {
      alive();
      if (
        data?.identity !== identity ||
        !Array.isArray(data.actors) ||
        data.actors.length !== actors.size ||
        data.actors.some(
          (entry) =>
            !actors.has(entry.id) ||
            (entry.support &&
              typeof entry.support.normalCompliance !== 'boolean') ||
            (entry.supportFrom &&
              typeof entry.supportFrom.normalCompliance !== 'boolean') ||
            typeof entry.compliantSupport !== 'boolean' ||
            !Number.isFinite(entry.supportContactTime) ||
            entry.supportContactTime < 0 ||
            actors.get(entry.id).mass !== entry.mass ||
            JSON.stringify(actors.get(entry.id).hull) !==
              JSON.stringify(entry.hull),
        )
      )
        throw new Error('Rapier snapshot identity or actors do not match.');
      const restored = RAPIER.World.restoreSnapshot(decode(data.engine));
      if (
        !restored ||
        data.actors.some(
          (entry) =>
            !restored.getRigidBody(entry.bodyHandle) ||
            !Array.isArray(entry.colliderHandles) ||
            !entry.colliderHandles.length ||
            entry.colliderHandles.some(
              (handle) => !restored.getCollider(handle),
            ) ||
            !restored.getRigidBody(entry.anchorHandle) ||
            (entry.jointHandle !== null &&
              !restored.getImpulseJoint(entry.jointHandle)) ||
            Boolean(entry.support) !== (entry.jointHandle !== null),
        )
      ) {
        restored?.free();
        throw new Error('Rapier snapshot body handles are invalid.');
      }
      engine.free();
      engine = restored;
      for (const entry of data.actors) {
        const actor = actors.get(entry.id);
        Object.assign(actor, entry, {
          hull: { ...entry.hull },
          support: entry.support && finiteSupport(entry.support),
          supportFrom: entry.supportFrom && finiteSupport(entry.supportFrom),
          acceleration: vector(entry.acceleration),
          angularAcceleration: vector(entry.angularAcceleration),
          contacts: entry.contacts.map(copyContact),
        });
      }
    },
    reset() {
      alive();
      rebuild();
    },
    dispose() {
      if (disposed) return;
      engine.free();
      actors.clear();
      staticShapes.clear();
      batches.length = 0;
      disposed = true;
    },
  };
  return Object.freeze(api);
}
