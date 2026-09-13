import './style.css';
import { CLIPS } from './animation/clips.js';
import { CharacterStage } from './stage.js';
import { mountUI } from './ui.js';
import { CAMERAS, LIGHTING_PRESETS, STORAGE_KEY, DEFAULT_STATE, sanitizeState, readPreset, loadState } from './config.js';

let state = loadState();
let stage;
let lastApplied = null;
let dirty = true;
let disposed = false;
let stats = { fps: 0, triangles: 0, bones: 0, phase: 'Ready', contacts: { left: true, right: true }, tipDistance: 0 };
let saveTimer, noticeTimer, raf;
const clip = () => CLIPS.find(entry => entry.id === state.clip) || CLIPS[0];
state.time = Math.min(state.time, clip().duration);

const ui = mountUI({
  state, clips: CLIPS, cameras: CAMERAS, lightingPresets: LIGHTING_PRESETS,
  onChange: patch => setState(patch),
  onAction: handleAction,
});

const notice = document.createElement('div');
notice.setAttribute('role', 'status');
notice.style.cssText = 'position:fixed;bottom:24px;left:50%;transform:translateX(-50%);padding:12px 20px;border:1px solid #716047;border-radius:8px;background:#20242e;color:#f5e8cf;font:13px system-ui;box-shadow:0 6px 32px #0005;z-index:100;max-width:min(600px,90vw);pointer-events:none;display:none;';
document.body.appendChild(notice);

function notify(message) {
  notice.textContent = message;
  notice.style.display = 'block';
  clearTimeout(noticeTimer);
  noticeTimer = setTimeout(() => { notice.style.display = 'none'; }, 4200);
}

function persist() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
    catch { notify('Browser storage is unavailable. Export a JSON preset to keep these settings.'); }
  }, 180);
}

function flush() {
  if (!stage || !dirty) return;
  stage.update(state, lastApplied);
  lastApplied = structuredClone(state);
  dirty = false;
}

function setState(patch, { immediate = false } = {}) {
  const previousClip = state.clip;
  state = sanitizeState(patch, state);
  if (state.clip !== previousClip) {
    if (patch.time === undefined) state.time = 0;
    if (patch.loop === undefined) state.loop = clip().loop;
  }
  state.time = Math.max(0, Math.min(state.time, clip().duration));
  if (patch.time !== undefined && patch.playing === undefined) state.playing = false;
  if (patch.camera !== undefined && patch.cameraPose === undefined) state.cameraPose = null;
  dirty = true;
  if (immediate) { flush(); if (stage) stats = { ...stats, ...stage.render(state) }; }
  ui.update(state, stats);
  persist();
  return structuredClone(state);
}

function handleAction(action, payload) {
  switch (action) {
    case 'togglePlay':
      if (!state.playing && state.time >= clip().duration) setState({ time: 0, playing: true });
      else setState({ playing: !state.playing });
      break;
    case 'restart': setState({ time: 0, playing: state.playing }); break;
    case 'stepBack': setState({ time: Math.max(0, state.time - 1 / 30), playing: false }); break;
    case 'stepForward': setState({ time: Math.min(clip().duration, state.time + 1 / 30), playing: false }); break;
    case 'reset':
      state = sanitizeState(DEFAULT_STATE);
      dirty = true;
      ui.update(state, stats);
      persist();
      notify('Restored Kaida’s original stage settings.');
      break;
    case 'export': {
      const blob = new Blob([JSON.stringify({ ...state, family: 'humanoid-v1', subject: 'kaida' }, null, 2) + '\n'], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `chronoforge-day-kaida-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      notify('Exported character, motion, camera, and lighting settings.');
      break;
    }
    case 'import':
      try {
        const imported = readPreset(typeof payload === 'string' ? JSON.parse(payload) : payload);
        setState({ ...imported, playing: false });
        notify('Preset loaded. Playback is paused for inspection.');
      } catch (error) { notify(error.message || 'That file could not be read as a stage preset.'); }
      break;
    default: break;
  }
}

try {
  const host = document.getElementById('viewport');
  if (!host) throw new Error('The stage viewport is missing.');
  stage = new CharacterStage(host, {
    onCameraChange: patch => {
      state = sanitizeState(patch, state);
      ui.update(state, stats);
      persist();
    },
    onContextLoss: () => {
      state.playing = false;
      cancelAnimationFrame(raf);
      notify('The graphics context was interrupted. Your settings are saved; reload to restore the stage.');
      persist();
    },
  });
  flush();
  stats = { ...stats, ...stage.render(state) };
  ui.update(state, stats);

  // Exact scenario entry points, so future work never needs a playthrough.
  window.__CHRONOFORGE_DAY__ = {
    version: 1,
    get ready() { return Boolean(stage && !disposed); },
    clips: CLIPS.map(entry => ({ ...entry })),
    state: () => structuredClone(state),
    set: patch => setState(patch, { immediate: true }),
    pose(id, seconds = 0) { return setState({ clip: id, time: seconds, playing: false }, { immediate: true }); },
    step(frames = 1) {
      const n = Number.isFinite(frames) ? frames : 1;
      return setState({ time: Math.max(0, Math.min(clip().duration, state.time + n / 30)), playing: false }, { immediate: true });
    },
    inspect() { flush(); stats = { ...stats, ...stage.render(state) }; return { state: structuredClone(state), stats: { ...stats }, ...stage.inspect() }; },
    export: () => ({ ...structuredClone(state), family: 'humanoid-v1', subject: 'kaida' }),
    import: preset => { handleAction('import', preset); flush(); return structuredClone(state); },
  };

  // Optional URLs are deterministic checkpoints, e.g. ?clip=attack&t=0.73&camera=side.
  const params = new URLSearchParams(location.search);
  const entry = {};
  if (params.has('clip')) entry.clip = params.get('clip');
  if (params.has('camera')) entry.camera = params.get('camera');
  if (params.has('light')) entry.lighting = params.get('light');
  if (params.has('t')) { entry.time = Number(params.get('t')); entry.playing = false; }
  if (params.has('paused')) entry.playing = false;
  if (Object.keys(entry).length) setState(entry, { immediate: true });

  let previousTime = performance.now();
  let displayTime = 0;
  let smoothedFrame = 16.67;
  const frame = now => {
    if (disposed) return;
    const elapsed = now - previousTime;
    previousTime = now;
    const dt = document.hidden ? 0 : Math.min(0.075, Math.max(0, elapsed / 1000));
    if (elapsed > 0 && elapsed < 150) smoothedFrame += (elapsed - smoothedFrame) * 0.06;
    if (state.playing) {
      state.time += dt * state.speed;
      if (state.time > clip().duration) {
        if (state.loop) state.time %= clip().duration;
        else { state.time = clip().duration; state.playing = false; persist(); }
      }
    }
    flush();
    stats = { ...stage.render(state), fps: 1000 / smoothedFrame };
    if (now - displayTime > 50) { ui.update(state, stats); displayTime = now; }
    raf = requestAnimationFrame(frame);
  };
  raf = requestAnimationFrame(frame);
} catch (error) {
  console.error('[Chronoforge Day]', error);
  stage?.dispose();
  stage = null;
  const errorPanel = document.createElement('div');
  errorPanel.style.cssText = 'position:absolute;inset:15%;display:grid;place-content:center;color:#f4e5ce;font:15px/1.7 system-ui;text-align:center;';
  const heading = document.createElement('strong');
  heading.textContent = 'The 3D stage could not start';
  const detail = document.createElement('p');
  detail.textContent = `${error.message} Try a browser with WebGL 2 and hardware acceleration enabled.`;
  errorPanel.append(heading, detail);
  (document.getElementById('viewport') || document.body).appendChild(errorPanel);
}

function shutdown() {
  if (disposed) return;
  disposed = true;
  cancelAnimationFrame(raf);
  clearTimeout(saveTimer);
  clearTimeout(noticeTimer);
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch { /* Export remains available. */ }
  stage?.dispose();
  ui.destroy();
  notice.remove();
  delete window.__CHRONOFORGE_DAY__;
  window.removeEventListener('pagehide', onPageHide);
}

// HMR tears down controls, observers, GPU resources and the old frame loop.
if (import.meta.hot) import.meta.hot.dispose(shutdown);
function onPageHide(event) {
  // A bfcache page keeps its live scene; disposal would break Back navigation.
  if (!event.persisted) shutdown();
}
window.addEventListener('pagehide', onPageHide);
