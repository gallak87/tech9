import { REGIONS } from './world.js';

// Only the localhost dev panel creates this controller. Normal exploration,
// quests and map drawing operate on a detached expedition while it is active.
export class WorldTravelPreview {
  constructor(game) {
    this.game = game;
    this.original = null;
    this.preview = null;
  }
  get active() {
    return this.preview !== null && this.game.state === this.preview;
  }
  get canEnable() {
    return !this.active && this.canJump;
  }
  get canJump() {
    const g = this.game;
    return (
      g.mode === 'world' &&
      !g.battle &&
      !g.transition &&
      !g.state.recruitmentWalk &&
      !g.ui.panel &&
      !g.upgradeTour?.open
    );
  }
  enable() {
    if (!this.canEnable) return false;
    this.original = this.game.state;
    this.preview = structuredClone(this.original);
    this.game.state = this.preview;
    return true;
  }
  jump(id) {
    if (!this.canJump || !Object.hasOwn(REGIONS, id)) return false;
    if (!this.active && !this.enable()) return false;
    // Use the ordinary transition and safe-arrival path, without changing any
    // story requirements or pretending that a guarded settlement was freed.
    this.game.travel(id, REGIONS[id].spawn);
    return true;
  }
  saveSource() {
    return this.active
      ? { state: this.original, battle: null }
      : { state: this.game.state, battle: this.game.battle };
  }
  restore() {
    const active = this.active;
    if (active) this.game.state = this.original;
    // Load/New replace game.state before resetting the panel. Never overwrite
    // that new expedition with the one we were previewing earlier.
    this.original = this.preview = null;
    return active;
  }
}
