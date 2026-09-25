import { GATES, DOCK_ZONE } from '../world/islandDefinition.js';

/** Ordered route and lap clock, independent of rendering and input. */
export class LapRules {
  constructor({ gates = GATES, dockZone = DOCK_ZONE } = {}) {
    this.gates = gates;
    this.dockZone = dockZone;
    this.best = null;
    this.reset();
  }

  reset() {
    this.state = 'ready';
    this.elapsed = 0;
    this.nextGate = 0;
    this.dockHold = 0;
    this.notice = 'Three gates. One gentle landing.';
    return this.snapshot();
  }

  start() {
    if (this.state === 'ready') {
      this.state = 'running';
      this.notice = this._routeNotice();
    }
    return this.snapshot();
  }

  pause() {
    if (this.state === 'running') this.state = 'paused';
    return this.snapshot();
  }

  resume() {
    if (this.state === 'paused') this.state = 'running';
    return this.snapshot();
  }

  update(dt, previousPosition, boat) {
    if (this.state !== 'running' || !Number.isFinite(dt) || dt <= 0)
      return this.snapshot();
    this.elapsed += dt;
    let lastCrossing = -1;
    while (this.nextGate < this.gates.length) {
      const gate = this.gates[this.nextGate];
      const before =
        (previousPosition.x - gate.x) * gate.nx +
        (previousPosition.z - gate.z) * gate.nz;
      const after = (boat.x - gate.x) * gate.nx + (boat.z - gate.z) * gate.nz;
      if (!(before < 0 && after >= 0)) break;
      const fraction = -before / (after - before);
      const crossX =
        previousPosition.x + (boat.x - previousPosition.x) * fraction;
      const crossZ =
        previousPosition.z + (boat.z - previousPosition.z) * fraction;
      const across = (crossX - gate.x) * -gate.nz + (crossZ - gate.z) * gate.nx;
      if (Math.abs(across) > gate.halfWidth || fraction < lastCrossing) break;
      lastCrossing = fraction;
      this.nextGate++;
      this.notice = this._routeNotice();
    }

    const dock = this.dockZone;
    const inDock = (position) =>
      Math.hypot(position.x - dock.x, position.z - dock.z) <= dock.radius;
    // Signed longitudinal speed is unsuitable here: a fast reverse or sideways
    // slide is still a fast landing. Support speed-only records for simple UIs.
    const speed =
      Number.isFinite(boat.vx) && Number.isFinite(boat.vz)
        ? Math.hypot(boat.vx, boat.vz)
        : Math.abs(boat.speed ?? Infinity);
    if (
      this.nextGate === this.gates.length &&
      inDock(previousPosition) &&
      inDock(boat) &&
      speed < dock.maxSpeed
    ) {
      this.dockHold += dt;
      if (this.dockHold + 1e-9 >= dock.holdSeconds) {
        this.dockHold = dock.holdSeconds;
        this.state = 'finished';
        this.best =
          this.best === null ? this.elapsed : Math.min(this.best, this.elapsed);
        this.notice = 'Safely home. Ready for another lap?';
      }
    } else this.dockHold = 0;
    return this.snapshot();
  }

  _routeNotice() {
    const gate = this.gates[this.nextGate];
    return gate
      ? `Gate ${this.nextGate + 1}: ${gate.name}`
      : 'Return to the dock and settle below 0.8 m/s.';
  }

  snapshot() {
    return {
      state: this.state,
      elapsed: this.elapsed,
      nextGate: this.nextGate,
      dockHold: this.dockHold,
      best: this.best,
      notice: this.notice,
    };
  }
}
