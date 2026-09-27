import './style.css';
import {
  createSpriteWorld,
  COASTAL_ASSETS,
  COASTAL_FRAMES,
  COASTAL_ACTOR,
  drawCoastalGround,
  createCoastalPatterns,
} from './modules/sprite-world/src/index.js';
import { coastScene, coastNotes, regionAt } from './coast.js';

const byId = (id) => document.getElementById(id);
let world = null,
  started = false,
  generation = 0,
  lastDisposed = null;
const listeners = new AbortController();
const on = (element, type, fn) =>
  element.addEventListener(type, fn, { signal: listeners.signal });
const view = { quality: 'high', logicalWidth: 960, logicalHeight: 600 };
const hide = (id, value) => {
  byId(id).hidden = value;
};

function setPaused(paused, { show = true } = {}) {
  if (!world || !started) return;
  world.setPaused(paused);
  hide('paused', !paused || !show);
  byId('pause').textContent = paused ? 'Resume' : 'Pause';
}
function sync(state) {
  byId('region').textContent = regionAt(state.actor);
  const near = state.near;
  hide('nearby', !near || !started || state.paused);
  byId('near-label').textContent = near?.interact?.label ?? near?.label ?? '';
  hide('field-note', !started || state.actor.y < 700);
}
function interact(object) {
  const note = coastNotes[object.id];
  if (!note || !started || byId('reading').open) return;
  setPaused(true, { show: false });
  byId('reading-title').textContent = note.title;
  byId('reading-body').textContent = note.body;
  byId('reading').showModal();
}
function fail(error) {
  hide('loading', true);
  hide('error', false);
  byId('error-message').textContent = error.message || String(error);
}
async function boot({ welcome = true } = {}) {
  const ticket = ++generation;
  byId('pause').disabled = byId('reset').disabled = true;
  if (byId('reading').open) byId('reading').close();
  hide('paused', true);
  hide('error', true);
  hide('welcome', true);
  hide('loading', false);
  started = false;
  if (world) {
    world.dispose();
    lastDisposed = world.snapshot();
    world = null;
  }
  try {
    const next = await createSpriteWorld({
      mount: byId('stage'),
      scene: coastScene,
      assets: COASTAL_ASSETS,
      frames: COASTAL_FRAMES,
      actor: { ...COASTAL_ACTOR, ...coastScene.spawn },
      drawGround: drawCoastalGround,
      createPatterns: createCoastalPatterns,
      controls: { touch: 'auto', container: byId('touch-controls') },
      viewport: view,
      budgets: { assetBytes: 96 * 1024 ** 2, concurrency: 2 },
      onInteract: interact,
      onState: sync,
      onError: fail,
      onPause: (value) => setPaused(value),
    });
    if (ticket !== generation) {
      next.dispose();
      return;
    }
    world = next;
    world.start();
    world.setPaused(welcome);
    started = !welcome;
    hide('loading', true);
    hide('welcome', !welcome);
    byId('pause').disabled = byId('reset').disabled = false;
    byId('pause').textContent = 'Pause';
    sync(world.snapshot());
    if (welcome) byId('start').focus();
    else world.controls.focus();
  } catch (error) {
    if (ticket === generation) fail(error);
  }
}
on(byId('start'), 'click', () => {
  started = true;
  hide('welcome', true);
  world.setPaused(false);
  world.controls.focus();
});
on(byId('pause'), 'click', () => setPaused(!world.state.paused));
on(byId('resume'), 'click', () => {
  setPaused(false);
  world.controls.focus();
});
on(byId('reset'), 'click', () => boot({ welcome: false }));
on(byId('retry'), 'click', () => boot());
on(byId('reading'), 'close', () => {
  if (started) {
    setPaused(false);
    world.controls.focus();
  }
});
on(window, 'keydown', (event) => {
  if (
    event.key === 'Escape' &&
    event.target !== world?.canvas &&
    !byId('reading').open &&
    started
  ) {
    event.preventDefault();
    setPaused(!world.state.paused);
  }
});
on(window, 'blur', () => {
  if (started && !byId('reading').open) setPaused(true);
});
on(document, 'visibilitychange', () => {
  if (document.hidden && started) setPaused(true);
});
function dispose() {
  generation++;
  world?.dispose();
  listeners.abort();
}
on(window, 'pagehide', dispose);
if (import.meta.hot) import.meta.hot.dispose(dispose);
if (import.meta.env.DEV && new URLSearchParams(location.search).has('test'))
  window.__COAST_TEST__ = {
    snapshot: () =>
      world ? { ...world.snapshot(), started, lastDisposed } : null,
    // Rare-state setup only; normal browser acceptance navigates with actual input.
    teleport: (x, y) => world.teleport(x, y),
    dispose: () => {
      world?.dispose();
      return world?.snapshot();
    },
  };
await boot();
