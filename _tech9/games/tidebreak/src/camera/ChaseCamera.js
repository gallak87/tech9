import { Vector3 } from 'three';
import { islandHeight } from '../world/islandDefinition.js';
/** The sole camera owner; no rules, input or rendering here. */
export class ChaseCamera {
  constructor(camera, boat) {
    this.camera = camera;
    this.boat = boat;
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
    this.position.set(
      b.x - fx * 15 - ix * 2,
      9.2 + Math.abs(b.speed) * 0.15,
      b.z - fz * 15 - iz * 2,
    );
    this.position.y = Math.max(
      this.position.y,
      islandHeight(this.position.x, this.position.z) + 5,
    );
    this.target.set(b.x + fx * 7 + ix * 5, 1.0, b.z + fz * 7 + iz * 5);
    const blend = this.initial ? 1 : 1 - Math.exp(-dt * 4.2);
    this.camera.position.lerp(this.position, blend);
    this.look.lerp(this.target, blend);
    this.camera.lookAt(this.look);
    this.initial = false;
  }
  resetMotion() {
    this.initial = true;
  }
  dispose() {}
}
