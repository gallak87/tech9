import test from 'node:test';
import assert from 'node:assert/strict';
import { SaveTransfer } from '../src/save-transfer.js';
import { createState } from '../src/progression.js';
import { saveState, loadState, MAX_SAVE_BYTES } from '../src/persistence.js';

function fixture(t) {
  const rows = new Map();
  const storage = {
    getItem: (key) => rows.get(key) ?? null,
    setItem: (key, value) => rows.set(key, value),
    removeItem: (key) => rows.delete(key),
  };
  const elements = [],
    feedback = [],
    loads = [],
    focus = [];
  const document = {
    body: {
      append(element) {
        element.attached = true;
      },
    },
    createElement(tag) {
      const element = {
        tag,
        events: {},
        files: [],
        setAttribute() {},
        addEventListener(name, handler) {
          this.events[name] = handler;
        },
        click() {
          this.clicked = true;
        },
        remove() {
          this.attached = false;
        },
      };
      elements.push(element);
      return element;
    },
  };
  for (const [name, value] of Object.entries({
    document,
    localStorage: storage,
  })) {
    const previous = Object.getOwnPropertyDescriptor(globalThis, name);
    Object.defineProperty(globalThis, name, { configurable: true, value });
    t.after(() => {
      if (previous) Object.defineProperty(globalThis, name, previous);
      else delete globalThis[name];
    });
  }
  const ui = {
    menu: true,
    tab: 5,
    panel: null,
    menuScroll: { 5: 123 },
    root: {
      querySelector(selector) {
        return selector === '.atlas-body'
          ? { scrollTop: 123 }
          : {
              focus() {
                focus.push(selector);
              },
            };
      },
    },
    game: {
      audio: { sound() {} },
      load(slot) {
        loads.push(slot);
      },
    },
    render() {},
    feedback(result) {
      feedback.push(result);
    },
    restoreShopRow(action, scroll) {
      focus.push({ action, scroll });
    },
    confirm(title, text, run, options) {
      this.panel = { type: 'confirm', title, text, run, ...options };
    },
  };
  const state = createState();
  state.resources.ore = 777;
  const json = JSON.stringify(saveState(state, 1, storage));
  return {
    transfer: new SaveTransfer(ui),
    ui,
    state,
    json,
    storage,
    rows,
    elements,
    feedback,
    loads,
    focus,
  };
}

async function choose(transfer, json) {
  const input = transfer.input;
  input.files = [{ size: json.length, text: async () => json }];
  await input.events.change();
  return input;
}

test('imports wait for confirmation, default to cancel, and change only the selected slot', async (t) => {
  const { transfer, ui, state, json, storage, rows, loads, focus } = fixture(t);
  saveState(createState(), 2, storage);
  const before = new Map(rows);
  transfer.requestImport('2');
  const input = await choose(transfer, json);
  assert.equal(input.attached, false);
  assert.equal(transfer.input, null);
  assert.deepEqual(
    rows,
    before,
    'Reading and confirming must not write a save',
  );
  assert.match(ui.panel.title, /Replace Field record 02/);
  assert.equal(ui.panel.saveImport.loadImmediately, false);
  assert.ok(focus.includes('[data-do="confirm-no"]'));
  ui.panel.run();
  assert.deepEqual(loadState(2, storage), state);
  assert.equal(
    rows.get('chronforge_echo_v1:1'),
    before.get('chronforge_echo_v1:1'),
  );
  assert.deepEqual(loads, []);
  assert.deepEqual(focus.at(-1), { action: 'load:2', scroll: 123 });
});

test('load immediately applies the imported slot only after confirmation', async (t) => {
  const { transfer, ui, json, storage, loads, state } = fixture(t);
  transfer.requestImport('3');
  await choose(transfer, json);
  assert.throws(() => loadState(3, storage), /empty/);
  ui.panel.saveImport.loadImmediately = true;
  ui.panel.run();
  assert.deepEqual(loadState(3, storage), state);
  assert.deepEqual(loads, ['3']);
});

test('leaving Save cancels pending file reads even if the menu opens again', async (t) => {
  const { transfer, ui, json, rows } = fixture(t);
  const before = new Map(rows);
  transfer.requestImport('2');
  let resolve;
  transfer.input.files = [
    {
      size: json.length,
      text: () =>
        new Promise((done) => {
          resolve = done;
        }),
    },
  ];
  const pending = transfer.input.events.change();
  transfer.cancelImport();
  ui.menu = false;
  ui.menu = true;
  resolve(json);
  await pending;
  assert.equal(ui.panel, null);
  assert.equal(transfer.input, null);
  assert.deepEqual(rows, before);
});

test('a newer picker supersedes an earlier asynchronous import', async (t) => {
  const { transfer, ui, json } = fixture(t);
  transfer.requestImport('2');
  let resolve;
  transfer.input.files = [
    {
      size: json.length,
      text: () =>
        new Promise((done) => {
          resolve = done;
        }),
    },
  ];
  const pending = transfer.input.events.change();
  transfer.requestImport('3');
  const newest = transfer.input;
  resolve(json);
  await pending;
  assert.equal(ui.panel, null);
  assert.equal(transfer.input, newest);
  await choose(transfer, json);
  assert.match(ui.panel.title, /Field record 03/);
});

test('invalid or oversized files never alter saved records', async (t) => {
  const { transfer, ui, rows, feedback } = fixture(t);
  const before = new Map(rows);
  transfer.requestImport('2');
  await choose(transfer, '{bad json');
  assert.equal(ui.panel, null);
  assert.match(feedback.at(-1).message, /Could not import/);
  transfer.requestImport('2');
  transfer.input.files = [
    {
      size: MAX_SAVE_BYTES + 1,
      text() {
        assert.fail('Oversized file should not be read');
      },
    },
  ];
  await transfer.input.events.change();
  assert.match(feedback.at(-1).message, /5 MB/);
  assert.deepEqual(rows, before);
});

test('canceling a picker removes it and restores the selected Save row', (t) => {
  const { transfer, focus } = fixture(t);
  transfer.requestImport('2');
  const input = transfer.input;
  input.events.cancel();
  assert.equal(input.attached, false);
  assert.equal(transfer.input, null);
  assert.deepEqual(focus.at(-1), { action: 'import-save:2', scroll: 123 });
});

test('export downloads the stored record and releases its object URL', (t) => {
  const { transfer, elements, json, feedback } = fixture(t);
  const urls = [];
  let exported;
  t.mock.method(URL, 'createObjectURL', (blob) => {
    exported = blob;
    return 'blob:export';
  });
  t.mock.method(URL, 'revokeObjectURL', (url) => urls.push(url));
  t.mock.method(globalThis, 'setTimeout', (callback) => callback());
  transfer.exportSlot('1');
  assert.equal(exported.size, new Blob([json]).size);
  assert.equal(elements[0].clicked, true);
  assert.equal(elements[0].attached, false);
  assert.match(elements[0].download, /^chronforge-echo-record-1-.*\.json$/);
  assert.deepEqual(urls, ['blob:export']);
  assert.deepEqual(feedback, []);
});
