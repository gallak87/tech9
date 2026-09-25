import { Vector3 } from 'three';

const vector = (value) =>
  Array.isArray(value) && value.length === 3 && value.every(Number.isFinite);
const defaults = Object.freeze({
  distance: 12,
  height: 6,
  side: 0,
  lookAhead: 4,
  targetHeight: 1,
  damping: 5,
  clearance: 1,
  near: 0.15,
  fov: 58,
});

/** A world-space camera adapter. The consumer supplies subject and mounted poses. */
export class FollowCamera {
  constructor(
    camera,
    {
      getTarget,
      groundHeight = () => -Infinity,
      follow = {},
      mounted,
      onChange = () => {},
    } = {},
  ) {
    if (
      !camera?.isPerspectiveCamera ||
      typeof getTarget !== 'function' ||
      typeof groundHeight !== 'function'
    )
      throw new TypeError(
        'A perspective camera and target/ground callbacks are required.',
      );
    const config = { ...defaults, ...follow };
    for (const [key, value] of Object.entries(config))
      if (!Object.hasOwn(defaults, key) || !Number.isFinite(value))
        throw new RangeError(`Invalid follow option: ${key}`);
    if (
      config.distance < 0 ||
      config.damping <= 0 ||
      config.clearance < 0 ||
      config.near <= 0 ||
      config.fov <= 0 ||
      config.fov >= 180
    )
      throw new RangeError('Invalid follow projection or distance settings.');
    if (
      mounted &&
      (typeof mounted.getPose !== 'function' ||
        !Number.isFinite(mounted.near ?? 0.05) ||
        (mounted.near ?? 0.05) <= 0 ||
        !Number.isFinite(mounted.fov ?? 70) ||
        (mounted.fov ?? 70) <= 0 ||
        (mounted.fov ?? 70) >= 180)
    )
      throw new RangeError('Invalid mounted camera settings.');
    this.camera = camera;
    this.getTarget = getTarget;
    this.groundHeight = groundHeight;
    this.follow = Object.freeze(config);
    this.mounted =
      mounted && Object.freeze({ near: 0.05, fov: 70, ...mounted });
    this.onChange = onChange;
    this.mode = 'follow';
    this.disposed = false;
    this.snap = true;
    this.position = new Vector3();
    this.target = new Vector3();
    this.aim = new Vector3();
    this._projection();
  }
  _projection() {
    const settings = this.mode === 'mounted' ? this.mounted : this.follow;
    this.camera.near = settings.near;
    this.camera.fov = settings.fov;
    this.camera.updateProjectionMatrix();
  }
  setMode(mode) {
    if (this.disposed) return;
    if (mode !== 'follow' && mode !== 'mounted')
      throw new RangeError('Unknown camera mode.');
    if (mode === 'mounted' && !this.mounted)
      throw new Error('A mounted pose provider is required.');
    if (mode === this.mode) return;
    this.mode = mode;
    this._projection();
    this.resetMotion();
  }
  resetMotion() {
    if (this.disposed) return;
    this.snap = true;
    this.onChange(this.mode);
  }
  update(dt) {
    if (this.disposed || !Number.isFinite(dt) || dt < 0) return;
    const camera = this.camera;
    if (this.mode === 'mounted') {
      const pose = this.mounted.getPose();
      if (
        !pose ||
        !vector(pose.position) ||
        !vector(pose.target) ||
        !vector(pose.up ?? [0, 1, 0])
      )
        throw new TypeError(
          'Mounted pose requires finite position, target and up vectors.',
        );
      const position = this.position.fromArray(pose.position),
        target = this.target.fromArray(pose.target);
      const up = this.aim.fromArray(pose.up ?? [0, 1, 0]);
      if (up.lengthSq() < 1e-12 || position.distanceToSquared(target) < 1e-12)
        throw new RangeError('Mounted pose is degenerate.');
      camera.position.copy(position);
      camera.up.copy(up).normalize();
      camera.lookAt(target);
    } else {
      const subject = this.getTarget(),
        c = this.follow;
      if (
        !subject ||
        ![subject.x, subject.y ?? 0, subject.z, subject.heading].every(
          Number.isFinite,
        )
      )
        throw new TypeError(
          'Target requires finite x, z, heading and optional y.',
        );
      const fx = Math.sin(subject.heading),
        fz = -Math.cos(subject.heading),
        y = subject.y ?? 0;
      this.position.set(
        subject.x - fx * c.distance - fz * c.side,
        y + c.height,
        subject.z - fz * c.distance + fx * c.side,
      );
      const floor = (x, z) => {
        const h = this.groundHeight(x, z);
        if (h !== -Infinity && !Number.isFinite(h))
          throw new TypeError('Ground height must be finite or -Infinity.');
        return h + c.clearance;
      };
      this.position.y = Math.max(
        this.position.y,
        floor(this.position.x, this.position.z),
      );
      this.target.set(
        subject.x + fx * c.lookAhead,
        y + c.targetHeight,
        subject.z + fz * c.lookAhead,
      );
      const blend = this.snap
        ? 1
        : 1 - Math.exp(-c.damping * Math.min(dt, 0.25));
      camera.position.lerp(this.position, blend);
      this.aim.lerp(this.target, blend);
      camera.position.y = Math.max(
        camera.position.y,
        floor(camera.position.x, camera.position.z),
      );
      camera.up.set(0, 1, 0);
      camera.lookAt(this.aim);
    }
    this.snap = false;
    camera.updateMatrixWorld();
  }
  dispose() {
    this.disposed = true;
  }
}
