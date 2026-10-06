import RAPIER from '@dimforge/rapier3d-compat';
import * as T from 'three';
import { COLLISION_RULES } from './collision-world.js';
import { VEHICLE_HULL } from './hull.js';

export const RAPIER_RULES = Object.freeze({
  version: 1,
  packageVersion: '0.21.0',
  maxAngularSpeed: 4,
  angularDamping: 1.2,
  maxCcdSubsteps: 6,
  solverIterations: 6,
  friction: 0.55,
  railFriction: 0.18,
  deckFriction: 0.48,
  terrainFriction: 0.65,
  structureFriction: 0.42,
});
// Membership in the high 16 bits, accepted membership in the low 16 bits.
// Ships accept static geometry only: actor/actor contact is deliberately absent.
const STATIC_GROUPS = (1 << 16) | 2;
const ACTOR_GROUPS = (2 << 16) | 1;
let initialization;
const vector = (v) => new T.Vector3(v.x, v.y, v.z);
const rotation = (q) => new T.Quaternion(q.x, q.y, q.z, q.w);
const zero = () => new T.Vector3();
function boundedSpin(v) {
  const result = vector(v);
  if (result.length() > RAPIER_RULES.maxAngularSpeed)
    result.setLength(RAPIER_RULES.maxAngularSpeed);
  return result;
}
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
function encode(bytes) {
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += 8192)
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 8192));
  return btoa(binary);
}
function decode(binary) {
  return Uint8Array.from(atob(binary), (character) => character.charCodeAt(0));
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
export async function createRapierWorld({ collisionWorld, gravity = 26 }) {
  if (!collisionWorld?.triangles || !Number.isFinite(gravity) || gravity < 0)
    throw new Error('Rapier requires authored static triangles and gravity.');
  initialization ??= RAPIER.init();
  await initialization;
  const rulesId = `${collisionWorld.rulesId}:rapier:${JSON.stringify({
    ...RAPIER_RULES,
    gravity,
  })}`;
  const identity = `${collisionWorld.id}:${collisionWorld.version}:${rulesId}`;
  const batches = new Map();
  for (const triangle of collisionWorld.triangles) {
    const key = JSON.stringify([
      triangle.id,
      triangle.kind,
      triangle.start,
      triangle.end,
      triangle.distance,
    ]);
    if (!batches.has(key)) batches.set(key, []);
    batches.get(key).push(triangle);
  }
  const actors = new Map();
  let engine,
    staticShapes,
    disposed = false;
  const alive = () => {
    if (disposed) throw new Error('Rapier world has been disposed.');
  };
  function createBody(actor) {
    const body = engine.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic()
        .setCcdEnabled(true)
        .setCanSleep(false)
        .setAngularDamping(RAPIER_RULES.angularDamping)
        .setEnabled(false),
    );
    const collider = engine.createCollider(
      RAPIER.ColliderDesc.cuboid(
        actor.hull.halfWidth,
        actor.hull.hover,
        actor.hull.halfLength,
      )
        .setMass(1)
        .setCollisionGroups(ACTOR_GROUPS)
        .setSolverGroups(ACTOR_GROUPS)
        .setFriction(RAPIER_RULES.friction)
        .setFrictionCombineRule(RAPIER.CoefficientCombineRule.Min)
        .setRestitution(0)
        .setRestitutionCombineRule(RAPIER.CoefficientCombineRule.Max),
      body,
    );
    actor.bodyHandle = body.handle;
    actor.colliderHandle = collider.handle;
    actor.active = false;
    actor.fraction = 1;
    actor.acceleration = zero();
    actor.contacts = [];
  }
  function rebuild() {
    engine?.free();
    engine = new RAPIER.World({ x: 0, y: -gravity, z: 0 });
    engine.maxCcdSubsteps = RAPIER_RULES.maxCcdSubsteps;
    engine.numSolverIterations = RAPIER_RULES.solverIterations;
    engine.timestep = 1 / 120;
    staticShapes = new Map();
    for (const triangles of batches.values()) {
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
  function contactsFor(actor, before, dt, fraction) {
    const contacts = [];
    const collider = engine.getCollider(actor.colliderHandle);
    engine.contactPairsWith(collider, (other) => {
      const triangles = staticShapes.get(other.handle);
      if (!triangles) return;
      engine.contactPair(collider, other, (manifold, flipped) => {
        const normal = vector(manifold.normal()).multiplyScalar(
          flipped ? 1 : -1,
        );
        const triangle =
          triangles[flipped ? manifold.subshape1() : manifold.subshape2()];
        if (!triangle) return;
        const { points, ...shape } = triangle;
        const surfaceNormal = new T.Vector3(...points[1])
          .sub(new T.Vector3(...points[0]))
          .cross(new T.Vector3(...points[2]).sub(new T.Vector3(...points[0])))
          .normalize();
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
          const separation = solver
            ? manifold.solverContactDist(index)
            : manifold.contactDist(index);
          if (!rawPoint || separation > 0.025) continue;
          const point = vector(rawPoint);
          // Use pre-solver physical point velocity, never the already reflected
          // result. Acceleration is integrated over this actor's active tick.
          const incoming = before.velocity
            .clone()
            .addScaledVector(before.acceleration, dt * fraction)
            .add(
              before.angularVelocity
                .clone()
                .cross(point.clone().sub(before.position)),
            );
          contacts.push({
            point,
            normal: normal.clone(),
            surfaceNormal: surfaceNormal.clone(),
            shape,
            incomingSpeed: Math.max(0, -incoming.dot(normal)),
            impulse:
              index < manifold.numContacts()
                ? manifold.contactImpulse(index) / fraction
                : 0,
            penetration: Math.max(0, -separation),
          });
        }
      });
    });
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
    createActor({ hull = VEHICLE_HULL } = {}) {
      alive();
      if (
        !['halfWidth', 'halfLength', 'hover'].every(
          (key) => Number.isFinite(hull[key]) && hull[key] > 0,
        )
      )
        throw new Error('Rapier requires positive whole-hull dimensions.');
      let id = 0;
      while (actors.has(id)) id++;
      const actor = { id, hull: { ...hull } };
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
            boundedSpin(finiteVector(angularVelocity, 'angular velocity')),
            true,
          );
      }
      const adapter = {
        id,
        stage({
          pose,
          velocity,
          angularVelocity,
          active,
          acceleration,
          fraction = 1,
        } = {}) {
          const body = bodyOf(actor);
          if (pose) setPose(pose);
          if (velocity !== undefined) setVelocity(velocity, angularVelocity);
          else if (angularVelocity !== undefined)
            body.setAngvel(
              boundedSpin(finiteVector(angularVelocity, 'angular velocity')),
              true,
            );
          if (active !== undefined) {
            actor.active = Boolean(active);
            body.setEnabled(actor.active);
          }
          if (!Number.isFinite(fraction) || fraction < 0 || fraction > 1)
            throw new Error(
              'Rapier actor fraction must be between zero and one.',
            );
          actor.fraction = fraction;
          actor.acceleration =
            acceleration === undefined
              ? zero()
              : finiteVector(acceleration, 'acceleration');
          if (!actor.active) actor.contacts = [];
        },
        read() {
          const body = bodyOf(actor);
          return {
            position: vector(body.translation()),
            quaternion: rotation(body.rotation()),
            velocity: vector(body.linvel()),
            angularVelocity: vector(body.angvel()),
            active: actor.active,
            contacts: actor.contacts.map(copyContact),
          };
        },
        setPose,
        setVelocity,
        reset({ pose, velocity, angularVelocity, active = false } = {}) {
          const body = bodyOf(actor);
          setPose(pose ?? { position: zero(), quaternion: new T.Quaternion() });
          setVelocity(velocity ?? zero(), angularVelocity ?? zero());
          body.resetForces(false);
          body.resetTorques(false);
          body.setGravityScale(1, false);
          body.setAngularDamping(RAPIER_RULES.angularDamping);
          actor.active = Boolean(active);
          actor.fraction = 1;
          actor.acceleration = zero();
          actor.contacts = [];
          body.setEnabled(actor.active);
        },
        dispose() {
          if (disposed || actors.get(id) !== actor) return;
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
      engine.timestep = dt;
      const pending = [];
      for (const actor of actors.values()) {
        actor.contacts = [];
        if (!actor.active) continue;
        const body = bodyOf(actor),
          fraction = actor.fraction;
        if (!fraction) {
          body.setEnabled(false);
          pending.push({ actor, body, fraction });
          continue;
        }
        const before = {
          position: vector(body.translation()),
          velocity: vector(body.linvel()),
          angularVelocity: boundedSpin(body.angvel()),
          acceleration: actor.acceleration
            .clone()
            .add(new T.Vector3(0, -gravity, 0)),
        };
        // Because actors cannot interact, v'=f*v, w'=f*w and a'=f²*a
        // integrate an independent first-launch duration f*dt in one shared tick.
        // Divide solved velocity/impulses by f afterward; full-tick actors keep f=1.
        body.setLinvel(before.velocity.clone().multiplyScalar(fraction), true);
        body.setAngvel(
          before.angularVelocity.clone().multiplyScalar(fraction),
          true,
        );
        body.setGravityScale(fraction * fraction, false);
        body.setAngularDamping(RAPIER_RULES.angularDamping * fraction);
        body.resetForces(false);
        body.addForce(
          actor.acceleration
            .clone()
            .multiplyScalar(body.mass() * fraction * fraction),
          true,
        );
        pending.push({ actor, body, before, fraction });
      }
      engine.step();
      for (const { actor, body, before, fraction } of pending) {
        if (fraction) {
          actor.contacts = contactsFor(actor, before, dt, fraction);
          body.setLinvel(vector(body.linvel()).divideScalar(fraction), false);
          body.setAngvel(
            boundedSpin(vector(body.angvel()).divideScalar(fraction)),
            false,
          );
          body.resetForces(false);
          body.setGravityScale(1, false);
          body.setAngularDamping(RAPIER_RULES.angularDamping);
        } else body.setEnabled(true);
        actor.fraction = 1;
        actor.acceleration = zero();
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
            bodyHandle: actor.bodyHandle,
            colliderHandle: actor.colliderHandle,
            active: actor.active,
            fraction: actor.fraction,
            acceleration: { ...actor.acceleration },
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
            !restored.getCollider(entry.colliderHandle),
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
          acceleration: vector(entry.acceleration),
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
      batches.clear();
      disposed = true;
    },
  };
  return Object.freeze(api);
}
