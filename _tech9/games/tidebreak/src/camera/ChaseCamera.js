import { Vector3 } from 'three';
import { islandHeight } from '../world/islandDefinition.js';
/** The sole camera owner. Framing follows vessel dimensions, never renderer state. */
export class ChaseCamera {
  constructor(camera, boat, rules, boatView) {
    this.camera = camera;
    this.boat = boat;
    this.rules = rules;
    this.boatView = boatView;
    this.mode = 'chase';
    this.target = new Vector3();
    this.position = new Vector3();
    this.look = new Vector3();
    this.initial = true;
  }
  update(dt) {
    const b = this.boat,
      fx = Math.sin(b.heading),
      fz = -Math.cos(b.heading),
      rx = Math.cos(b.heading),
      rz = Math.sin(b.heading);
    const length = b.vessel?.length ?? 14,
      height = b.vessel?.mastHeight ?? 12;
    if (this.mode === 'captain') {
      const pose = this.boatView.getHelmPose();
      this.position.fromArray(pose.position);
      this.target.fromArray(pose.target);
      this.camera.up.fromArray(pose.up);
    } else if (
      this.rules.state === 'ready' ||
      this.rules.state === 'finished'
    ) {
      // Full rig on the right of the fleet chooser; the left remains readable.
      this.position.set(
        b.x + rx * length * 0.92 - fx * length * 1.08,
        height * 0.78 + 2,
        b.z + rz * length * 0.92 - fz * length * 1.08,
      );
      this.target.set(
        b.x - rx * length * 0.48,
        height * 0.38,
        b.z - rz * length * 0.48,
      );
      this.camera.up.set(0, 1, 0);
    } else {
      this.position.set(
        b.x - fx * length * 1.65 + rx * length * 0.63,
        height * 0.69 + 2 + Math.abs(b.speed) * 0.08,
        b.z - fz * length * 1.65 + rz * length * 0.63,
      );
      this.target.set(
        b.x + fx * length * 0.22,
        height * 0.29,
        b.z + fz * length * 0.22,
      );
      this.camera.up.set(0, 1, 0);
    }
    if (this.mode !== 'captain')
      this.position.y = Math.max(
        this.position.y,
        islandHeight(this.position.x, this.position.z) + 5,
      );
    const blend =
      this.initial || this.mode === 'captain' ? 1 : 1 - Math.exp(-dt * 3.7);
    this.camera.position.lerp(this.position, blend);
    this.look.lerp(this.target, blend);
    this.camera.lookAt(this.look);
    this.initial = false;
  }
  setMode(mode) {
    this.mode = mode === 'captain' ? 'captain' : 'chase';
    this.boatView.setCameraMode(this.mode);
    this.camera.up.set(0, 1, 0);
    this.camera.near = this.mode === 'captain' ? 0.05 : 0.15;
    this.camera.fov = this.mode === 'captain' ? 70 : 58;
    this.camera.updateProjectionMatrix();
    this.initial = true;
  }
  resetMotion() {
    this.initial = true;
  }
  dispose() {}
}
