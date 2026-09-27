// Pure pointer ownership and gesture state, shared by UI and regression tests.
export function stickVector(dx, dy, radius, deadZone = 0.15) {
  const distance = Math.hypot(dx, dy);
  const amount = Math.min(1, distance / Math.max(1, radius));
  if (amount <= deadZone || !distance) return { x: 0, y: 0 };
  const magnitude = (amount - deadZone) / (1 - deadZone);
  return { x: (dx / distance) * magnitude, y: (dy / distance) * magnitude };
}
export class TouchMovement {
  constructor() {
    this.run = false;
    this.reset();
  }
  get movement() {
    return {
      x: this.x,
      y: this.y,
      active: this.pointer !== null,
      run: this.run,
    };
  }
  reset({ resetRun = false } = {}) {
    this.pointer = null;
    this.x = 0;
    this.y = 0;
    this.lastTap = null;
    this.contact = null;
    if (resetRun) this.run = false;
  }
  begin(id, x, y, time, center, { doubleTap = true } = {}) {
    if (this.pointer !== null) return false;
    const repeated =
      doubleTap &&
      this.lastTap &&
      time - this.lastTap.time <= 300 &&
      Math.hypot(x - this.lastTap.x, y - this.lastTap.y) <= 35;
    this.pointer = id;
    this.contact = { x, y, time, center, moved: false, repeated: !!repeated };
    if (repeated) this.run = !this.run;
    this.lastTap = null;
    this.update(id, x, y);
    return true;
  }
  update(id, x, y) {
    if (id !== this.pointer || !this.contact) return false;
    if (Math.hypot(x - this.contact.x, y - this.contact.y) > 8)
      this.contact.moved = true;
    Object.assign(
      this,
      stickVector(
        x - this.contact.center.x,
        y - this.contact.center.y,
        this.contact.center.radius,
      ),
    );
    return true;
  }
  end(id, time, canceled = false) {
    if (id !== this.pointer || !this.contact) return false;
    const contact = this.contact;
    this.lastTap =
      !canceled &&
      !contact.moved &&
      !contact.repeated &&
      time - contact.time <= 220
        ? { x: contact.x, y: contact.y, time }
        : null;
    this.pointer = null;
    this.contact = null;
    this.x = 0;
    this.y = 0;
    return true;
  }
}
