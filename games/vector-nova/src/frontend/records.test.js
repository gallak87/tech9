import test from 'node:test';
import assert from 'node:assert/strict';
import { recordsView } from './records.js';

test('record track names remain text in filters, headings and accessible action labels', () => {
  const name = `Nacre <coast> & "outer" 'ring'`;
  const escaped = 'Nacre &lt;coast&gt; &amp; &quot;outer&quot; &#39;ring&#39;';
  const html = recordsView({
    records: [
      {
        key: 'personal-best',
        identity: {
          track: 'records-test-track',
          ship: { id: 'kestrel' },
          format: 'circuit',
          start: 'standing',
        },
        duration: 68.125,
        saved: true,
        ghostSaved: true,
      },
    ],
    catalog: [{ id: 'nacre', name }],
    routes: [{ id: 'nacre', trackId: 'records-test-track' }],
    trackId: 'nacre',
  });
  assert.ok(
    html.includes(`<option value="nacre" selected>${escaped}</option>`),
  );
  assert.ok(html.includes(`<h3>${escaped}</h3>`));
  assert.ok(html.includes(`<span class="sr-only"> ${escaped}, Kestrel</span>`));
  assert.doesNotMatch(html, /<coast>/);
});
