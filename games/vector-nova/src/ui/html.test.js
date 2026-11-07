import test from 'node:test';
import assert from 'node:assert/strict';
import { escapeHTML } from './html.js';
import { escapeHTML as progressionEscapeHTML } from '../progression/view.js';

test('text and quoted attributes escape all five HTML delimiters', () => {
  assert.equal(
    escapeHTML(`Rook & <pilot title="Aegis">'Nova'</pilot>`),
    'Rook &amp; &lt;pilot title=&quot;Aegis&quot;&gt;&#39;Nova&#39;&lt;/pilot&gt;',
  );
});

test('escaping preserves text and whitespace and treats existing entities as text', () => {
  assert.equal(escapeHTML('Nacre → 海\n\t🚀'), 'Nacre → 海\n\t🚀');
  assert.equal(escapeHTML('&lt;Nova&gt;'), '&amp;lt;Nova&amp;gt;');
});

test('nonstring inputs retain String coercion rather than empty fallbacks', () => {
  for (const [input, expected] of [
    [undefined, 'undefined'],
    [null, 'null'],
    [0, '0'],
    [false, 'false'],
    [Symbol('Nova & Co'), 'Symbol(Nova &amp; Co)'],
    [{ toString: () => '<pilot>' }, '&lt;pilot&gt;'],
  ])
    assert.equal(escapeHTML(input), expected);
});

test('progression keeps its existing escapeHTML export', () => {
  assert.equal(
    progressionEscapeHTML(`Career "A&B"`),
    'Career &quot;A&amp;B&quot;',
  );
});
