import { createState } from './progression.js';
import { saveState, loadState } from './persistence.js';
import { getScene } from './world.js';
import { reveal } from './maps.js';
import { SCENES } from './narrative.js';
const copy = (value) => JSON.parse(JSON.stringify(value));
const inventoryStamp = (state) =>
  JSON.stringify([
    state.inventory,
    state.heroes.map((hero) => [hero.id, hero.equip]),
  ]);

export class GameSession {
  constructor(game) {
    this.game = game;
    this.rememberInventory();
  }
  rememberInventory() {
    this.inventoryState = this.game.state;
    this.inventoryStamp = inventoryStamp(this.game.state);
  }
  autosaveInventory() {
    const g = this.game;
    if (g.mode === 'title' || (g.devTools?.saveSource() ?? g).state !== g.state)
      return;
    if (this.inventoryState !== g.state) {
      this.rememberInventory();
      return;
    }
    const stamp = inventoryStamp(g.state);
    if (stamp === this.inventoryStamp) return;
    // Run after the frame's mutations, never halfway through an equip, reward,
    // reforge or item action. A failed write retries at the next change/checkpoint
    // rather than hammering storage every frame.
    this.inventoryStamp = stamp;
    this.checkpoint({ includeBattle: true });
  }
  resetSession() {
    const g = this.game;
    g.worldView?.close();
    g.upgradeTour?.close();
    g.devTools?.reset();
    g.keys.clear();
    g.transition = null;
    g.near = null;
    g.movePath = [];
    g.moving = false;
    g.encounterCooldown = 1;
    g.battleResultTime = 0;
    g.soundLog = 0;
    g.rewardQueue = [];
    g.rewardClock = 0;
    g.time = 0;
    g.visualTime = 0;
    g.lastHud = 0;
    g.ui.resetSession();
    this.rememberInventory();
  }
  startNew() {
    const g = this.game;
    g.state = createState();
    g.resetSession();
    g.mode = 'world';
    g.battle = null;
    g.audio.set(g.state.settings);
    g.resetFollowers();
    g.updateCamera(true);
    reveal(g.state, g.scene);
    g.ui.showDialogue(
      SCENES.opening || [
        {
          speaker: 'Kaida',
          text: 'The sea kept your signal, Mother. I will find someone who remembers how to answer.',
        },
        {
          speaker: 'Kaida',
          text: 'One road. One pair of boots. Haventide must still be out there.',
        },
      ],
    );
    g.checkpoint();
    g.ui.render();
    g.log('new_game');
  }
  load(slot) {
    const g = this.game;
    try {
      const next = loadState(slot);
      Object.assign(next, g.safePoint(getScene(next.region), next.x, next.y));
      g.state = next;
      g.resetSession();
      g.battle = g.state.suspendedBattle || null;
      delete g.state.suspendedBattle;
      g.mode = g.battle ? 'battle' : 'world';
      g.audio.set(g.state.settings);
      g.resetFollowers();
      g.updateCamera(true);
      g.ui.render();
      if (g.state.flags.pendingEnding) g.presentEnding();
      g.log('load', { slot });
    } catch (e) {
      g.ui.feedback({ ok: false, message: e.message });
    }
  }
  saveSnapshot() {
    const g = this.game;
    const { state, battle } = g.devTools?.saveSource() ?? g;
    const out = copy(state);
    if (battle) out.suspendedBattle = copy(battle);
    return out;
  }
  save(slot) {
    const g = this.game;
    try {
      saveState(g.saveSnapshot(), slot);
      g.audio.sound('confirm');
      g.log('save', { slot });
      return true;
    } catch (e) {
      g.ui.feedback({ ok: false, message: 'Could not save: ' + e.message });
      return false;
    }
  }
  checkpoint({ includeBattle = false } = {}) {
    const g = this.game;
    if (g.mode === 'title' || (g.battle && !includeBattle)) return;
    try {
      saveState(g.saveSnapshot());
      if ((g.devTools?.saveSource() ?? g).state === g.state)
        this.rememberInventory();
    } catch (e) {
      g.log('save_error', { message: e.message });
    }
  }
}
