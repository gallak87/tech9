import { FollowCamera } from '../modules/follow-camera/src/FollowCamera.js';
/** Resolve the camera boom against shared terrain and conservative solid discs. */
export function clearCameraBoom(
  target,
  desired,
  { height, colliders },
  clearance = 0.55,
) {
  let result = { ...desired };
  const distance = Math.hypot(
    desired.x - target.x,
    desired.y - target.y,
    desired.z - target.z,
  );
  const steps = Math.max(1, Math.ceil(distance / 0.35));
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const p = {
      x: target.x + (desired.x - target.x) * t,
      y: target.y + (desired.y - target.y) * t,
      z: target.z + (desired.z - target.z) * t,
    };
    if (
      p.y < height(p.x, p.z) + clearance ||
      colliders.some(
        (c) => Math.hypot(p.x - c.x, p.z - c.z) < c.radius + clearance,
      )
    ) {
      const safe = Math.max(0, (i - 1) / steps);
      result = {
        x: target.x + (desired.x - target.x) * safe,
        y: target.y + (desired.y - target.y) * safe,
        z: target.z + (desired.z - target.z) * safe,
      };
      break;
    }
  }
  result.y = Math.max(result.y, height(result.x, result.z) + clearance);
  return result;
}
export class DrivingCamera {
  constructor(camera, { getTarget, getModel, world }) {
    this.camera = camera;
    this.getTarget = getTarget;
    this.getModel = getModel;
    this.world = world;
    this.follow = new FollowCamera(camera, {
      getTarget: () => {
        const s = getTarget();
        return { ...s, heading: s.heading + s.steer * 0.16 };
      },
      groundHeight: world.height,
      follow: {
        distance: 8.8,
        height: 4.3,
        lookAhead: 5,
        targetHeight: 1.1,
        damping: 7,
        fov: 64,
      },
      mounted: { getPose: () => getModel().mountedPose(), fov: 78, near: 0.04 },
    });
  }
  setMode(mode) {
    this.follow.setMode(mode);
    this.getModel().setDriverView(mode === 'mounted');
  }
  toggle() {
    this.setMode(this.follow.mode === 'follow' ? 'mounted' : 'follow');
  }
  resetMotion() {
    this.follow.resetMotion();
  }
  update(dt) {
    this.follow.update(dt);
    if (this.follow.mode === 'follow') {
      const s = this.getTarget();
      const p = clearCameraBoom(
        { x: s.x, y: s.y + 1.65, z: s.z },
        this.camera.position,
        this.world,
      );
      this.camera.position.set(p.x, p.y, p.z);
      this.camera.updateMatrixWorld();
    }
  }
  dispose() {
    this.follow.dispose();
  }
}
