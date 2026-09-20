import { dialogueLine } from './npc-identities.js';
import { onEvent } from './narrative.js';

export class DialogueController {
  constructor(ui) {
    this.ui = ui;
  }
  show(lines, choices = [], done, options = {}) {
    if (!lines?.length) {
      done?.();
      return;
    }
    this.ui.panel = {
      type: 'dialogue',
      lines: lines.map((l) =>
        typeof l === 'string'
          ? dialogueLine(null, l)
          : Object.hasOwn(l, 'speakerId')
            ? l
            : dialogueLine(l.speaker, l.text),
      ),
      index: Math.max(0, Math.min(lines.length - 1, options.index || 0)),
      choices,
      done,
      ending: !!options.ending,
    };
    this.ui.render();
  }
  atChoice() {
    const p = this.ui.panel;
    return (
      p?.type === 'dialogue' &&
      p.index === p.lines.length - 1 &&
      p.choices?.length
    );
  }
  next() {
    const p = this.ui.panel;
    if (p?.type !== 'dialogue' || this.ui.menu) return;
    if (this.atChoice()) return;
    if (++p.index >= p.lines.length) {
      const done = p.done;
      this.ui.panel = null;
      this.ui.render();
      done?.();
    } else this.ui.render();
    if (p.ending && this.ui.game.state.flags.pendingEnding) {
      if (this.ui.panel?.type === 'dialogue' && this.ui.panel.ending)
        this.ui.game.state.endingProgress = {
          index: this.ui.panel.index,
          panel: 'dialogue',
        };
      this.ui.game.checkpoint();
    }
    this.ui.game.audio.sound('select');
  }
  choose(index) {
    const g = this.ui.game,
      s = g.state;
    const p = this.ui.panel,
      c = p?.choices?.[index];
    if (!this.atChoice() || !c || this.ui.menu) return;
    s.flags[c.flag] = true;
    this.ui.panel = null;
    this.ui.render();
    g.resolveResult(onEvent(s, 'choice', c.flag), p.done);
    g.checkpoint();
  }
  dismiss() {
    const ui = this.ui,
      p = ui.panel;
    if (!p) return;
    if (
      ui.game.state.flags.pendingEnding &&
      (p.ending || p.type === 'ending')
    ) {
      ui.game.state.endingProgress = {
        index: p.index ?? ui.game.state.endingProgress?.index ?? 0,
        panel: p.type,
      };
      ui.panel = null;
      ui.game.checkpoint();
    } else ui.panel = null;
  }
}
