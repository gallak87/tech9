import test from 'node:test';
import assert from 'node:assert/strict';
import { setImmediate } from 'node:timers';
import { createCupClassification } from './cup-classification.js';
import { RACE_ORDER } from '../race/roster.js';

const flush = () => new Promise((resolve) => setImmediate(resolve));
function result(time = 100) {
  return {
    laps: 2,
    courseFormat: 'circuit',
    playerTotalTime: time,
    playerValid: true,
    standings: RACE_ORDER.map((id, i) => ({
      id,
      finished: i !== 9,
      valid: true,
      totalTime: i === 9 ? null : time + i,
    })),
  };
}
class FakeWorker extends EventTarget {
  messages = [];
  terminations = 0;
  postMessage(data) {
    this.messages.push(structuredClone(data));
  }
  terminate() {
    this.terminations++;
  }
  send(data) {
    const event = new Event('message');
    Object.defineProperty(event, 'data', { value: data });
    this.dispatchEvent(event);
  }
  fail(message, type = 'error') {
    const event = new Event(type, { cancelable: true });
    Object.defineProperty(event, 'message', { value: message });
    this.dispatchEvent(event);
    return event;
  }
}
function fixture() {
  const worker = new FakeWorker();
  const client = createCupClassification({
    levelId: 'shatterline',
    settings: { steeringAssist: 0.3 },
    createWorker: () => worker,
  });
  return { worker, client };
}

test('the worker warms early and retains one finish checkpoint while booting', async () => {
  const { worker, client } = fixture();
  try {
    assert.deepEqual(worker.messages, [
      {
        type: 'init',
        levelId: 'shatterline',
        settings: { steeringAssist: 0.3 },
      },
    ]);
    const checkpoint = {
      state: { distance: 21067 },
      race: { rulesId: 'sprint' },
    };
    const pending = client.resolve(checkpoint);
    checkpoint.state.distance = 999;
    assert.equal(worker.messages.length, 1);
    worker.send({ type: 'ready' });
    await client.ready;
    await flush();
    assert.deepEqual(worker.messages[1], {
      type: 'resolve',
      requestId: 1,
      checkpoint: { state: { distance: 21067 }, race: { rulesId: 'sprint' } },
    });
    const data = result();
    worker.send({ type: 'result', requestId: 1, result: data });
    const completed = await pending;
    data.standings[0].totalTime = 999;
    assert.equal(completed.playerTotalTime, 100);
    assert.equal(completed.standings[0].totalTime, 100);
    assert.ok(Object.isFrozen(completed.standings[0]));
  } finally {
    client.dispose();
  }
  assert.equal(worker.terminations, 1);
});

test('concurrent result IDs cannot be confused and stale replies are ignored', async () => {
  const { worker, client } = fixture();
  try {
    worker.send({ type: 'ready' });
    const first = client.resolve({ race: 1 }),
      second = client.resolve({ race: 2 });
    await flush();
    worker.send({ type: 'result', requestId: 999, result: result(999) });
    worker.send({ type: 'result', requestId: 2, result: result(200) });
    worker.send({ type: 'result', requestId: 1, result: result(100) });
    assert.equal((await first).playerTotalTime, 100);
    assert.equal((await second).playerTotalTime, 200);
  } finally {
    client.dispose();
  }
});

test('request errors reject honestly without poisoning another race', async () => {
  const { worker, client } = fixture();
  try {
    worker.send({ type: 'ready' });
    const rejected = assert.rejects(client.resolve({}), /checkpoint mismatch/);
    await flush();
    worker.send({
      type: 'error',
      requestId: 1,
      message: 'checkpoint mismatch',
    });
    await rejected;
    const next = client.resolve({});
    await flush();
    worker.send({ type: 'result', requestId: 2, result: result() });
    assert.equal((await next).playerTotalTime, 100);
  } finally {
    client.dispose();
  }
});

test('boot and native worker errors reject pending work without unhandled events', async () => {
  for (const kind of ['boot', 'error', 'messageerror']) {
    const { worker, client } = fixture();
    const rejected = assert.rejects(client.resolve({}), /could not start/);
    if (kind === 'boot')
      worker.send({ type: 'error', message: 'could not start' });
    else
      assert.equal(worker.fail('could not start', kind).defaultPrevented, true);
    await rejected;
    await assert.rejects(client.ready, /could not start/);
    assert.equal(worker.terminations, 1);
    client.dispose();
    assert.equal(worker.terminations, 1);
  }
});

test('construction failure surfaces through classification and can be disposed', async () => {
  const client = createCupClassification({
    levelId: 'shatterline',
    createWorker: () => {
      throw new Error('worker blocked');
    },
  });
  await assert.rejects(client.resolve({}), /worker blocked/);
  await assert.rejects(client.ready, /worker blocked/);
  client.dispose();
  client.dispose();
});

test('disposing a warming or active worker cancels all owners and ignores late results', async () => {
  for (const warmed of [false, true]) {
    const { worker, client } = fixture();
    if (warmed) worker.send({ type: 'ready' });
    const first = assert.rejects(client.resolve({}), { name: 'AbortError' });
    const second = assert.rejects(client.resolve({}), { name: 'AbortError' });
    await flush();
    client.dispose();
    client.dispose();
    await Promise.all([first, second]);
    worker.send({ type: 'ready' });
    worker.send({ type: 'result', requestId: 1, result: result() });
    await assert.rejects(client.resolve({}), { name: 'AbortError' });
    assert.equal(worker.terminations, 1);
  }
});

test('individual cancellation stops queued and posted work without affecting another request', async () => {
  const { worker, client } = fixture();
  try {
    const queued = new AbortController();
    const first = assert.rejects(
      client.resolve({}, { signal: queued.signal }),
      { name: 'AbortError' },
    );
    queued.abort();
    await first;
    worker.send({ type: 'ready' });
    await flush();
    assert.equal(
      worker.messages.some((message) => message.type === 'resolve'),
      false,
    );
    const posted = new AbortController();
    const second = assert.rejects(
      client.resolve({}, { signal: posted.signal }),
      { name: 'AbortError' },
    );
    await flush();
    posted.abort();
    await second;
    assert.deepEqual(worker.messages.at(-1), { type: 'cancel', requestId: 2 });
    worker.send({ type: 'result', requestId: 2, result: result(200) });
    const next = client.resolve({});
    await flush();
    worker.send({ type: 'result', requestId: 3, result: result() });
    assert.equal((await next).playerTotalTime, 100);
    await assert.rejects(client.resolve({}, { signal: posted.signal }), {
      name: 'AbortError',
    });
  } finally {
    client.dispose();
  }
});

test('null, partial or invalid classifications never become approximate results', async () => {
  const { worker, client } = fixture();
  try {
    worker.send({ type: 'ready' });
    const partial = result();
    partial.standings.pop();
    const inconsistent = result();
    inconsistent.playerTotalTime = 1;
    let id = 0;
    for (const data of [null, {}, { standings: {} }, partial, inconsistent]) {
      const rejected = assert.rejects(client.resolve({}), /incomplete result/);
      await flush();
      worker.send({ type: 'result', requestId: ++id, result: data });
      await rejected;
    }
  } finally {
    client.dispose();
  }
});

test('uncloneable checkpoints fail before posting work', async () => {
  const { worker, client } = fixture();
  try {
    worker.send({ type: 'ready' });
    await assert.rejects(client.resolve({ callback() {} }), {
      name: 'DataCloneError',
    });
    assert.equal(worker.messages.length, 1);
  } finally {
    client.dispose();
  }
});
