import { assetURL } from '../assets/url.js';
import './player.css';

// Opt-in audition transport. Independent of race time and the effects mix.
export function createMusicPlayer(host, { clearInput = () => {} } = {}) {
  const root = document.createElement('aside');
  root.className = 'music-player';
  root.dataset.musicPlayer = '';
  root.setAttribute('aria-label', 'Music player');
  root.innerHTML = `
    <header class="music-heading">
      <button type="button" class="music-expand" aria-expanded="true" aria-controls="music-controls">MUSIC LAB <span>−</span></button>
      <button type="button" class="music-play" aria-label="Play music">PLAY</button>
    </header>
    <div id="music-controls">
      <p class="music-title">Halcyon · Blue Hour</p>
      <div class="music-timeline"><input type="range" aria-label="Music position" min="0" max="30" step="0.1" value="0"><output>0:00 / 0:30</output></div>
      <div class="music-options"><label>Volume <input type="range" aria-label="Music volume" min="0" max="1" step="0.01" value="0.4"></label><label><input type="checkbox" aria-label="Loop music" checked> Loop</label></div>
      <div class="music-actions"><button type="button" data-action="restart">Restart</button><button type="button" data-action="reload">Reload sketch</button><button type="button" data-action="file">Open audio</button></div>
      <input class="music-file" type="file" accept="audio/*,.wav,.mp3,.ogg,.m4a,.flac" aria-label="Open audio file" hidden>
      <p class="music-status" role="status">Ready when you are.</p>
    </div>`;
  const audio = document.createElement('audio');
  audio.preload = 'metadata';
  audio.loop = true;
  audio.volume = 0.4;
  root.append(audio);
  host.append(root);
  const abort = new AbortController();
  const listen = (target, event, callback) =>
    target.addEventListener(event, callback, { signal: abort.signal });
  const play = root.querySelector('.music-play');
  const expand = root.querySelector('.music-expand');
  const controls = root.querySelector('#music-controls');
  const title = root.querySelector('.music-title');
  const status = root.querySelector('.music-status');
  const seek = root.querySelector('[aria-label="Music position"]');
  const volume = root.querySelector('[aria-label="Music volume"]');
  const loop = root.querySelector('[aria-label="Loop music"]');
  const output = root.querySelector('output');
  const fileInput = root.querySelector('.music-file');
  const previewURL = assetURL(
    'assets/levels/halcyon/audio/blue-hour-preview.wav',
  );
  let objectURL;
  let disposed = false;
  const stamp = (seconds) => {
    const value = Math.max(0, Math.floor(seconds || 0));
    return `${Math.floor(value / 60)}:${String(value % 60).padStart(2, '0')}`;
  };
  function update() {
    play.textContent = audio.paused ? 'PLAY' : 'PAUSE';
    play.setAttribute(
      'aria-label',
      audio.paused ? 'Play music' : 'Pause music',
    );
    const duration = Number.isFinite(audio.duration) ? audio.duration : 0;
    seek.disabled = !duration;
    seek.max = duration || 30;
    seek.value = audio.currentTime;
    output.textContent = `${stamp(audio.currentTime)} / ${stamp(duration)}`;
  }
  async function start() {
    try {
      await audio.play();
      if (!disposed)
        status.textContent = 'Playing · independent of game pause.';
    } catch (error) {
      if (!disposed && error.name !== 'AbortError')
        status.textContent =
          'Cannot play this audio. Reload or open another file.';
    }
  }
  function releaseFile() {
    if (objectURL) URL.revokeObjectURL(objectURL);
    objectURL = undefined;
  }
  function reload() {
    const wasPlaying = !audio.paused;
    audio.pause();
    releaseFile();
    title.textContent = 'Halcyon · Blue Hour';
    status.textContent = 'Loading sketch…';
    audio.src = `${previewURL}?v=${Date.now()}`;
    audio.load();
    if (wasPlaying) void start();
  }
  function collapse(collapsed) {
    controls.hidden = collapsed;
    root.classList.toggle('is-collapsed', collapsed);
    expand.setAttribute('aria-expanded', String(!collapsed));
    expand.querySelector('span').textContent = collapsed ? '+' : '−';
  }
  listen(expand, 'click', () => collapse(!controls.hidden));
  listen(play, 'click', () => {
    if (audio.paused) void start();
    else {
      audio.pause();
      status.textContent = 'Paused.';
    }
  });
  listen(root.querySelector('[data-action="restart"]'), 'click', () => {
    if (Number.isFinite(audio.duration)) audio.currentTime = 0;
    update();
  });
  listen(root.querySelector('[data-action="reload"]'), 'click', reload);
  listen(root.querySelector('[data-action="file"]'), 'click', () =>
    fileInput.click(),
  );
  listen(fileInput, 'change', () => {
    const file = fileInput.files?.[0];
    if (!file) return;
    const wasPlaying = !audio.paused;
    audio.pause();
    releaseFile();
    objectURL = URL.createObjectURL(file);
    audio.src = objectURL;
    title.textContent = file.name;
    status.textContent = 'Loading local audio…';
    audio.load();
    fileInput.value = '';
    if (wasPlaying) void start();
  });
  listen(seek, 'input', () => {
    if (Number.isFinite(audio.duration)) audio.currentTime = Number(seek.value);
    update();
  });
  listen(volume, 'input', () => {
    audio.volume = Number(volume.value);
  });
  listen(loop, 'change', () => {
    audio.loop = loop.checked;
  });
  for (const event of [
    'timeupdate',
    'durationchange',
    'play',
    'pause',
    'ended',
  ])
    listen(audio, event, update);
  listen(audio, 'ended', () => {
    status.textContent = 'Finished.';
  });
  listen(audio, 'loadedmetadata', () => {
    status.textContent = audio.paused
      ? 'Ready when you are.'
      : 'Playing · independent of game pause.';
    update();
  });
  listen(audio, 'error', () => {
    status.textContent =
      'Audio unavailable. Reload sketch or open a local file.';
    update();
  });
  listen(root, 'keydown', (event) => event.stopPropagation());
  listen(root, 'click', (event) => {
    if (event.detail > 0) event.target.closest('button')?.blur();
  });
  listen(root, 'focusin', clearInput);
  listen(document, 'visibilitychange', () => {
    if (document.hidden && !audio.paused) {
      audio.pause();
      status.textContent = 'Paused while the tab is hidden.';
    }
  });
  collapse(matchMedia('(max-width: 760px), (max-height: 570px)').matches);
  reload();
  update();
  return {
    dispose() {
      if (disposed) return;
      disposed = true;
      abort.abort();
      audio.pause();
      audio.removeAttribute('src');
      audio.load();
      releaseFile();
      root.remove();
    },
  };
}
