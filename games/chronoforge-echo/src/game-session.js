import { createState } from './progression.js';
import { saveState, loadState } from './persistence.js';
import { getScene } from './world.js';
import { reveal } from './maps.js';
import { SCENES } from './narrative.js';
const copy = (value) => JSON.parse(JSON.stringify(value));

export class GameSession {
  constructor(game) {
    this.game = game;
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
  checkpoint() {
    const g = this.game;
    if (g.mode === 'title' || g.battle) return;
    try {
      saveState(g.saveSnapshot());
    } catch (e) {
      g.log('save_error', { message: e.message });
    }
  }
}
