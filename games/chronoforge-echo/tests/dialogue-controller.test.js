import test from 'node:test';
import assert from 'node:assert/strict';
import { DialogueController } from '../src/dialogue-controller.js';
import { createState } from '../src/progression.js';

function fixture() {
  let saves = 0;
  const ui = {
    panel: null,
    menu: false,
    render() {},
    game: {
      state: createState(),
      audio: { sound() {} },
      checkpoint() {
        saves++;
      },
      resolveResult(_result, done) {
        done?.();
      },
    },
  };
  return { ui, dialogue: new DialogueController(ui), saves: () => saves };
}

test('dialogue preserves speaker normalization, pauses under the menu, and completes once', () => {
  const { ui, dialogue } = fixture();
  let completions = 0;
  dialogue.show(
    ['Field note', { speaker: 'Kaida', text: 'Hello.' }],
    [],
    () => completions++,
  );
  assert.equal(ui.panel.lines[0].speakerId, null);
  assert.equal(ui.panel.lines[1].speakerId, 'kaida');
  ui.menu = true;
  dialogue.next();
  assert.equal(ui.panel.index, 0);
  ui.menu = false;
  dialogue.next();
  dialogue.next();
  dialogue.next();
  assert.equal(completions, 1);
  assert.equal(ui.panel, null);
});

test('choices wait for the last line and trigger their result and checkpoint once', () => {
  const { ui, dialogue, saves } = fixture();
  let completions = 0;
  dialogue.show(
    ['First', 'Choose'],
    [{ text: 'Yes', flag: 'controller_choice' }],
    () => completions++,
  );
  dialogue.choose(0);
  assert.equal(ui.game.state.flags.controller_choice, undefined);
  dialogue.next();
  dialogue.next();
  assert.equal(ui.panel.index, 1);
  dialogue.choose(9);
  assert.equal(saves(), 0);
  dialogue.choose(0);
  dialogue.choose(0);
  assert.equal(ui.game.state.flags.controller_choice, true);
  assert.equal(saves(), 1);
  assert.equal(completions, 1);
});

test('dismissal never completes a conversation and retains resumable ending progress', () => {
  const { ui, dialogue, saves } = fixture();
  let completions = 0;
  dialogue.show(['One', 'Two'], [], () => completions++);
  dialogue.dismiss();
  assert.equal(completions, 0);
  assert.equal(saves(), 0);
  ui.game.state.flags.pendingEnding = true;
  dialogue.show(['One', 'Two'], [], () => completions++, { ending: true });
  dialogue.next();
  assert.deepEqual(ui.game.state.endingProgress, {
    index: 1,
    panel: 'dialogue',
  });
  dialogue.dismiss();
  assert.equal(ui.panel, null);
  assert.equal(completions, 0);
  assert.equal(saves(), 2);
  dialogue.show(['One', 'Two'], [], () => completions++, {
    ending: true,
    index: 1,
  });
  dialogue.next();
  assert.equal(completions, 1);
});
