import { Euler, Quaternion, Vector3 } from 'three';

const finite = (values) => values.every(Number.isFinite);
const unitScale = (node) =>
  [node.scale.x, node.scale.y, node.scale.z].every(
    (value) => Number.isFinite(value) && Math.abs(value - 1) < 1e-8,
  );
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

function object(node, label) {
  if (!node?.isObject3D || !node.matrixAutoUpdate)
    throw new TypeError(
      `${label} must be an Object3D with matrixAutoUpdate enabled.`,
    );
}

function wheelHierarchy(root, wheel) {
  object(wheel.hub, 'Wheel hub');
  object(wheel.steering, 'Wheel steering');
  object(wheel.spin, 'Wheel spin');
  if (
    wheel.steering.parent !== wheel.hub ||
    wheel.spin.parent !== wheel.steering
  )
    throw new RangeError('Wheel hierarchy must be hub > steering > spin.');
  let parent = wheel.hub.parent;
  while (parent && parent !== root) {
    object(parent, 'Wheel ancestor');
    parent = parent.parent;
  }
  if (parent !== root)
    throw new RangeError('Every wheel hub must descend from root.');
}

function independentWheels(root, wheels) {
  const articulation = new Set(
    wheels.flatMap((wheel) => [wheel.hub, wheel.steering, wheel.spin]),
  );
  for (const wheel of wheels) {
    for (
      let parent = wheel.hub.parent;
      parent && parent !== root;
      parent = parent.parent
    )
      if (articulation.has(parent))
        throw new RangeError(
          'Wheel hubs cannot descend from another wheel articulation.',
        );
  }
}

function rootHierarchy(root) {
  object(root, 'Root');
  for (let node = root; node; node = node.parent) {
    object(node, 'Root ancestor');
    if (!unitScale(node))
      throw new RangeError('Root and its ancestors must have unit scale.');
    if (
      node !== root &&
      (!finite(node.position.toArray()) ||
        !finite(node.quaternion.toArray()) ||
        Math.abs(node.quaternion.lengthSq() - 1) > 1e-8)
    )
      throw new RangeError('Root ancestors must have finite rigid transforms.');
  }
}

/** Articulates consumer-owned scene nodes; allocates no render resources. */
export class VehiclePresentation {
  constructor({ root, wheels, wheelRadius, suspension = 0.3 } = {}) {
    rootHierarchy(root);
    if (
      !Array.isArray(wheels) ||
      ![2, 4].includes(wheels.length) ||
      !Number.isFinite(wheelRadius) ||
      wheelRadius <= 0 ||
      !Number.isFinite(suspension) ||
      suspension < 0
    )
      throw new RangeError(
        'Supply two or four wheels, a positive radius and nonnegative suspension.',
      );
    const nodes = new Set([root]);
    this.wheels = wheels.map((wheel) => {
      if (!wheel || typeof wheel.front !== 'boolean')
        throw new TypeError('Each wheel requires a boolean front flag.');
      wheelHierarchy(root, wheel);
      for (const node of [wheel.hub, wheel.steering, wheel.spin]) {
        if (nodes.has(node))
          throw new RangeError('Wheel transform nodes must be unique.');
        nodes.add(node);
      }
      if (!finite(wheel.hub.position.toArray()))
        throw new TypeError('Wheel rest positions must be finite.');
      return {
        hub: wheel.hub,
        steering: wheel.steering,
        spin: wheel.spin,
        front: wheel.front,
        rest: wheel.hub.position.clone(),
      };
    });
    if (this.wheels.filter((wheel) => wheel.front).length !== wheels.length / 2)
      throw new RangeError('Supply equal numbers of front and rear wheels.');
    independentWheels(root, this.wheels);
    this.root = root;
    this.wheelRadius = wheelRadius;
    this.suspension = suspension;
    this.wheelSpin = 0;
    this.disposed = false;
    this.position = new Vector3();
    this.rotation = new Euler(0, 0, 0, 'YXZ');
    this.orientation = new Quaternion();
    this.parentOrientation = new Quaternion();
  }

  update(snapshot, dt = 1 / 60) {
    if (this.disposed) return;
    if (!Number.isFinite(dt) || dt < 0)
      throw new RangeError('Frame duration must be finite and nonnegative.');
    if (
      !snapshot ||
      !finite([snapshot.x, snapshot.y, snapshot.z, snapshot.heading]) ||
      !finite(
        ['pitch', 'roll', 'lean', 'steer', 'speed'].map(
          (key) => snapshot[key] ?? 0,
        ),
      ) ||
      (snapshot.wheelSpin !== undefined && !Number.isFinite(snapshot.wheelSpin))
    )
      throw new TypeError('Snapshot pose and motion values must be finite.');
    if (
      snapshot.contacts !== undefined &&
      (!Array.isArray(snapshot.contacts) ||
        snapshot.contacts.length !== this.wheels.length)
    )
      throw new RangeError('Contacts must match the configured wheel count.');
    const contacts = this.wheels.map((_, index) => {
      const contact = snapshot.contacts?.[index];
      if (contact == null) return null;
      if (
        typeof contact !== 'object' ||
        !Number.isFinite(contact.compression ?? 0)
      )
        throw new TypeError('Contact compression must be finite.');
      const hasPosition = ['x', 'y', 'z'].some((key) => key in contact);
      if (hasPosition && !finite([contact.x, contact.y, contact.z]))
        throw new TypeError('World contacts require finite x, y and z.');
      return { contact, hasPosition };
    });
    const roll = (snapshot.roll ?? 0) + (snapshot.lean ?? 0);
    const spin =
      snapshot.wheelSpin ??
      this.wheelSpin +
        ((snapshot.speed ?? 0) * Math.min(dt, 0.1)) / this.wheelRadius;
    if (!Number.isFinite(roll) || !Number.isFinite(spin))
      throw new RangeError(
        'Combined roll and integrated wheel spin must remain finite.',
      );
    rootHierarchy(this.root);
    independentWheels(this.root, this.wheels);
    for (const wheel of this.wheels) {
      wheelHierarchy(this.root, wheel);
      wheel.hub.parent.updateWorldMatrix(true, false);
      const matrix = wheel.hub.parent.matrixWorld;
      if (!finite(matrix.elements) || Math.abs(matrix.determinant()) < 1e-12)
        throw new RangeError(
          'Wheel parent transforms must be finite and invertible.',
        );
    }

    const root = this.root;
    this.position.set(snapshot.x, snapshot.y, snapshot.z);
    this.orientation.setFromEuler(
      this.rotation.set(snapshot.pitch ?? 0, -snapshot.heading, roll, 'YXZ'),
    );
    if (root.parent) {
      root.parent.worldToLocal(this.position);
      root.parent.getWorldQuaternion(this.parentOrientation).invert();
      this.orientation.premultiply(this.parentOrientation);
    }
    root.position.copy(this.position);
    root.quaternion.copy(this.orientation);
    root.updateWorldMatrix(true, true);
    this.wheelSpin = spin;
    this.wheels.forEach((wheel, index) => {
      const value = contacts[index];
      if (value?.hasPosition) {
        const { x, y, z } = value.contact;
        this.position.set(x, y, z);
        wheel.hub.parent.worldToLocal(this.position);
        wheel.hub.position.copy(this.position);
      } else {
        wheel.hub.position.copy(wheel.rest);
        wheel.hub.position.y += clamp(
          value?.contact.compression ?? 0,
          -this.suspension,
          this.suspension,
        );
      }
      wheel.steering.rotation.set(
        0,
        wheel.front ? -(snapshot.steer ?? 0) : 0,
        0,
      );
      wheel.spin.rotation.set(-this.wheelSpin, 0, 0);
    });
    root.updateWorldMatrix(true, true);
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.root = null;
    this.wheels = [];
  }
}
