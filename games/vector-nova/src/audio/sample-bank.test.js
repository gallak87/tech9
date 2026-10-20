import test from 'node:test';
import assert from 'node:assert/strict';
import { createSampleBank } from './sample-bank.js';

test('loading coalesces, caches successful decodes and retries only missing files', async () => {
  const requests = [];
  let available = false;
  const bank = createSampleBank(
    { decodeAudioData: async () => ({ duration: 0.5 }) },
    { impact: '/impact.wav', shield: '/shield.wav' },
    {
      fetchAudio: async (url) => {
        requests.push(url);
        return {
          ok: url === '/impact.wav' || available,
          arrayBuffer: async () => new ArrayBuffer(0),
        };
      },
    },
  );
  assert.deepEqual(await Promise.all([bank.prepare(), bank.prepare()]), [
    false,
    false,
  ]);
  assert.deepEqual(requests, ['/impact.wav', '/shield.wav']);
  assert.deepEqual(bank.loaded(), ['impact']);
  assert.deepEqual(bank.missing(), ['shield']);
  available = true;
  assert.equal(await bank.prepare(), true);
  assert.deepEqual(requests, ['/impact.wav', '/shield.wav', '/shield.wav']);
  await bank.prepare();
  assert.equal(requests.length, 3);
  bank.dispose();
  assert.equal(bank.get('impact'), undefined);
});

test('disposal aborts requests and prevents a late decode from retaining a buffer', async () => {
  let signal, finishDecode, decoding;
  const started = new Promise((resolve) => {
    decoding = resolve;
  });
  const bank = createSampleBank(
    {
      decodeAudioData: () => {
        decoding();
        return new Promise((resolve) => {
          finishDecode = resolve;
        });
      },
    },
    { impact: '/impact.wav' },
    {
      fetchAudio: async (_, options) => {
        signal = options.signal;
        return { ok: true, arrayBuffer: async () => new ArrayBuffer(0) };
      },
    },
  );
  const loading = bank.prepare();
  await started;
  bank.dispose();
  assert.equal(signal.aborted, true);
  finishDecode({ duration: 0.5 });
  assert.equal(await loading, false);
  assert.deepEqual(bank.loaded(), []);
  assert.equal(await bank.prepare(), false);
});
