import test from 'node:test';
import assert from 'node:assert/strict';
import { RIVAL_BONUS_SCALES } from '../race/rival-build.js';
import {
  difficultyBonusDescription,
  difficultyDescriptionView,
} from './difficulty.js';

test('difficulty labels describe earned bonus scaling rather than stock stats or equipment strength', () => {
  for (const [difficulty, scale] of Object.entries(RIVAL_BONUS_SCALES)) {
    const description = difficultyBonusDescription(difficulty);
    assert.equal(
      description,
      scale === 1
        ? 'Rivals match your stat upgrade bonuses.'
        : `Rivals receive ${Math.round(scale * 100)}% of your stat upgrade bonuses.`,
    );
    assert.doesNotMatch(description, /equipment|cooldown|base stats/);
  }
  for (const difficulty of ['unknown', 'toString', '__proto__'])
    assert.equal(
      difficultyBonusDescription(difficulty),
      difficultyBonusDescription('easy'),
    );
});

test('difficulty notes have a safe description target and introduce no interactive focus stop', () => {
  const html = difficultyDescriptionView('medium', 'rival-"description');
  assert.match(html, /id="rival-&quot;description"/);
  assert.match(
    html,
    /data-rival-bonus-description>Rivals receive 75% of your stat upgrade bonuses\./,
  );
  assert.doesNotMatch(html, /<(button|a|input|select|textarea)\b|tabindex=/);
});
