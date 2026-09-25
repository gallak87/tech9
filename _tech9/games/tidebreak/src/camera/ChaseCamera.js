import { Vector3 } from 'three';
import { islandHeight } from '../world/islandDefinition.js';
/** The sole camera owner; no rules, input or rendering here. */
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
      r = Math.max(1, Math.hypot(b.x, b.z)),
      ix = -b.x / r,
      iz = -b.z / r;
    if (this.mode === 'captain') {
      const pose = this.boatView.getHelmPose();
      this.position.fromArray(pose.position);
      this.target.fromArray(pose.target);
      this.camera.up.fromArray(pose.up);
    } else if (
      this.rules.state === 'ready' ||
      this.rules.state === 'finished'
    ) {
      this.position.set(b.x + 24, 16, b.z + 21);
      this.target.set(b.x - 11, 4, b.z - 18);
    } else {
      this.position.set(
        b.x - fx * 14 - ix * 9,
        9 + Math.abs(b.speed) * 0.12,
        b.z - fz * 14 - iz * 9,
      );
      this.target.set(b.x + fx * 7 + ix * 8, 2.0, b.z + fz * 7 + iz * 8);
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
