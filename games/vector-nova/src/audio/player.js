import { assetURL } from '../assets/url.js';
import { musicTracks } from './tracks.js';
import './player.css';

const preferenceKey = 'vector-nova.music';
const icon = (paths) =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;
const playIcon = icon(
  '<path d="m9 5 11 7-11 7Z" fill="currentColor" stroke="none"/>',
);
const pauseIcon = icon('<path d="M8 5v14M16 5v14" stroke-width="4"/>');

// Shared music transport. Independent of race time and the effects mix.
export function createMusicPlayer(
  host,
  { clearInput = () => {}, isMenuVisible = () => false } = {},
) {
  let preferences = {};
  try {
    preferences = JSON.parse(localStorage.getItem(preferenceKey)) || {};
  } catch {
    // Storage is optional; the player still works with session defaults.
  }
  let selected =
    musicTracks.find((track) => track.id === preferences.song) ||
    musicTracks[0];
  let shuffled = preferences.shuffle === true;
  let queue = musicTracks;
  let wantsPlayback = true;
  let driving = false;
  const compact = matchMedia('(max-width: 760px)');
  const isCompact = () => compact.matches && (driving || !isMenuVisible());
  const root = document.createElement('aside');
  root.className = 'music-player';
  root.dataset.musicPlayer = '';
  root.setAttribute('aria-label', 'Music player');
  root.innerHTML = `
    <button type="button" class="music-compact-toggle" aria-expanded="false" aria-controls="music-panel" aria-label="Expand Tunes">TUNES</button>
    <div id="music-panel">
    <header class="music-heading">
      <div class="music-transport">
        <div class="music-keyed"><button type="button" class="music-previous" aria-label="Previous song" aria-keyshortcuts="," title="Previous song · ,">${icon('<path d="m14 6-6 6 6 6"/>')}</button><kbd aria-hidden="true">,</kbd></div>
        <div class="music-keyed"><button type="button" class="music-play" aria-label="Play music" aria-keyshortcuts="M" title="Play / pause · M">${playIcon}</button><kbd aria-hidden="true">M</kbd></div>
        <div class="music-keyed"><button type="button" class="music-next" aria-label="Next song" aria-keyshortcuts="." title="Next song · .">${icon('<path d="m10 6 6 6-6 6"/>')}</button><kbd aria-hidden="true">.</kbd></div>
      </div>
      <div class="music-identity">
        <div class="music-eyebrow"><span>TUNES</span><span class="music-status" role="status">Ready</span></div>
        <select class="music-song" aria-label="Song"></select>
      </div>
      <div class="music-keyed"><button type="button" class="music-expand" aria-expanded="true" aria-controls="music-controls" aria-label="Collapse music player" aria-keyshortcuts="/" title="Collapse · /">${icon('<path d="m7 14 5-5 5 5"/>')}</button><kbd aria-hidden="true">/</kbd></div>
    </header>
    <div id="music-controls">
      <div class="music-timeline">
        <input type="range" aria-label="Music position" min="0" max="120" step="0.1" value="0" disabled>
        <div class="music-times"><output class="music-elapsed">0:00</output><output class="music-duration">2:00</output></div>
      </div>
      <div class="music-options">
        <button type="button" class="music-restart" aria-label="Restart song" title="Restart song">${icon('<path d="M3 10a9 9 0 1 1 2 8M3 4v6h6"/><path d="M12 8v5l3 2"/>')}</button>
        <label class="music-volume">${icon('<path d="m11 4-6 5H2v6h3l6 5ZM15 8a6 6 0 0 1 0 8M18 5a10 10 0 0 1 0 14"/>')}<input type="range" aria-label="Music volume" min="0" max="1" step="0.01" value="0.4"><output>40%</output></label>
        <div class="music-order">
        <button type="button" class="music-shuffle" aria-label="Shuffle songs" aria-pressed="false" title="Shuffle songs">${icon('<path d="M3 6h2c5 0 9 12 14 12h2m-4-4 4 4-4 4M3 18h2c2 0 4-2 6-5m2-2c2-3 4-5 6-5h2m-4-4 4 4-4 4"/>')}</button>
        <button type="button" class="music-loop" aria-label="Repeat song" aria-pressed="false" title="Repeat song">${icon('<path d="m17 2 4 4-4 4M3 11V9a3 3 0 0 1 3-3h15M7 22l-4-4 4-4m14-1v2a3 3 0 0 1-3 3H3"/>')}</button>
        </div>
      </div>
    </div>
    </div>`;
  const audio = document.createElement('audio');
  audio.preload = 'auto';
  const progress = document.createElement('div');
  progress.className = 'music-progress';
  progress.setAttribute('aria-hidden', 'true');
  root.append(progress);
  audio.loop = preferences.repeat === true;
  audio.volume = Number.isFinite(preferences.volume)
    ? Math.min(1, Math.max(0, preferences.volume))
    : 0.4;
  root.append(audio);
  host.append(root);
  const abort = new AbortController();
  const listen = (target, event, callback, options = {}) =>
    target.addEventListener(event, callback, {
      ...options,
      signal: abort.signal,
    });
  const play = root.querySelector('.music-play');
  const expand = root.querySelector('.music-expand');
  const compactToggle = root.querySelector('.music-compact-toggle');
  const panel = root.querySelector('#music-panel');
  const controls = root.querySelector('#music-controls');
  const picker = root.querySelector('.music-song');
  const status = root.querySelector('.music-status');
  const seek = root.querySelector('[aria-label="Music position"]');
  const volume = root.querySelector('[aria-label="Music volume"]');
  const volumeOutput = root.querySelector('.music-volume output');
  const loop = root.querySelector('.music-loop');
  const shuffle = root.querySelector('.music-shuffle');
  const elapsed = root.querySelector('.music-elapsed');
  const durationOutput = root.querySelector('.music-duration');
  let disposed = false;
  let loadId = 0;
  for (const track of musicTracks) {
    const option = document.createElement('option');
    option.value = track.id;
    option.textContent = `${track.title} · ${track.bpm} BPM`;
    picker.append(option);
  }
  picker.value = selected.id;
  volume.value = audio.volume;
  loop.setAttribute('aria-pressed', String(audio.loop));
  shuffle.setAttribute('aria-pressed', String(shuffled));
  resetQueue();

  function save() {
    try {
      localStorage.setItem(
        preferenceKey,
        JSON.stringify({
          song: selected.id,
          volume: audio.volume,
          repeat: audio.loop,
          shuffle: shuffled,
          collapsed: controls.hidden,
        }),
      );
    } catch {
      // Storage can be unavailable in private or restricted browser sessions.
    }
  }
  function setStatus(text, error = false) {
    status.textContent = text;
    status.title = error
      ? 'Audio unavailable. Pick another song or refresh the page.'
      : text;
    root.classList.toggle('has-error', error);
  }
  const stamp = (seconds) => {
    const value = Math.max(0, Math.floor(seconds || 0));
    return `${Math.floor(value / 60)}:${String(value % 60).padStart(2, '0')}`;
  };
  const fill = (input, fraction) =>
    input.style.setProperty(
      '--fill',
      `${Math.min(1, Math.max(0, fraction)) * 100}%`,
    );
  function update() {
    play.innerHTML = audio.paused ? playIcon : pauseIcon;
    play.setAttribute(
      'aria-label',
      audio.paused ? 'Play music' : 'Pause music',
    );
    root.classList.toggle('is-playing', !audio.paused);
    const duration = Number.isFinite(audio.duration) ? audio.duration : 0;
    seek.disabled = !duration;
    seek.max = duration || 120;
    seek.value = audio.currentTime;
    seek.setAttribute(
      'aria-valuetext',
      `${stamp(audio.currentTime)} of ${stamp(duration)}`,
    );
    fill(seek, duration ? audio.currentTime / duration : 0);
    progress.style.setProperty(
      '--progress',
      `${duration ? (100 * audio.currentTime) / duration : 0}%`,
    );
    elapsed.textContent = stamp(audio.currentTime);
    durationOutput.textContent = duration ? stamp(duration) : '—:—';
  }
  function updateVolume() {
    audio.volume = Number(volume.value);
    fill(volume, audio.volume);
    volumeOutput.textContent = `${Math.round(audio.volume * 100)}%`;
  }
  async function start() {
    const request = loadId;
    try {
      await audio.play();
    } catch (error) {
      if (!disposed && request === loadId && error.name !== 'AbortError')
        setStatus(
          error.name === 'NotAllowedError' ? 'Press M to play' : 'Unavailable',
          error.name !== 'NotAllowedError',
        );
    }
  }
  function loadSong(resume = false) {
    loadId++;
    audio.pause();
    setStatus('Loading');
    audio.src = assetURL(selected.path);
    audio.load();
    update();
    if (resume) void start();
  }
  function togglePlayback() {
    wantsPlayback = audio.paused;
    if (wantsPlayback) {
      if (audio.error) loadSong();
      void start();
    } else audio.pause();
  }
  function resetQueue() {
    if (!shuffled) {
      queue = musicTracks;
      return;
    }
    const remaining = musicTracks.filter((track) => track !== selected);
    for (let i = remaining.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [remaining[i], remaining[j]] = [remaining[j], remaining[i]];
    }
    queue = [selected, ...remaining];
  }
  function switchSong(offset, resume = !audio.paused) {
    let index = queue.indexOf(selected);
    if (shuffled && offset > 0 && index === queue.length - 1) {
      resetQueue();
      index = 0;
    }
    selected = queue[(index + offset + queue.length) % queue.length];
    picker.value = selected.id;
    loadSong(resume);
    save();
  }
  function collapse(collapsed) {
    root.classList.toggle('is-compact', isCompact());
    controls.hidden = collapsed;
    root.classList.toggle('is-collapsed', collapsed);
    expand.setAttribute('aria-expanded', String(!collapsed));
    expand.setAttribute(
      'aria-label',
      collapsed ? 'Expand music player' : 'Collapse music player',
    );
    expand.title = collapsed ? 'Expand · /' : 'Collapse · /';
    compactToggle.setAttribute('aria-expanded', String(!collapsed));
    compactToggle.setAttribute(
      'aria-label',
      collapsed ? 'Expand Tunes' : 'Collapse Tunes',
    );
    const hiddenContent = isCompact() ? panel : controls;
    if (collapsed && hiddenContent.contains(document.activeElement))
      (isCompact() ? compactToggle : expand).focus();
  }
  function toggleExpanded() {
    if (!driving || isCompact()) collapse(!controls.hidden);
    save();
  }
  listen(expand, 'click', toggleExpanded);
  listen(compactToggle, 'click', toggleExpanded);
  listen(compact, 'change', () => {
    const focused = root.contains(document.activeElement);
    collapse(true);
    expand.disabled = driving && !isCompact();
    if (focused)
      (isCompact() ? compactToggle : expand.disabled ? play : expand).focus();
  });
  listen(document, 'pointerdown', (event) => {
    if (isCompact() && !controls.hidden && !root.contains(event.target))
      collapse(true);
  });
  listen(play, 'click', togglePlayback);
  listen(root.querySelector('.music-previous'), 'click', () => switchSong(-1));
  listen(root.querySelector('.music-next'), 'click', () => switchSong(1));
  listen(picker, 'change', () => {
    const resume = !audio.paused;
    selected = musicTracks.find((track) => track.id === picker.value);
    loadSong(resume);
    save();
  });
  listen(root.querySelector('.music-restart'), 'click', () => {
    if (Number.isFinite(audio.duration)) audio.currentTime = 0;
    update();
  });
  listen(seek, 'input', () => {
    if (Number.isFinite(audio.duration)) audio.currentTime = Number(seek.value);
    update();
  });
  listen(volume, 'input', () => {
    updateVolume();
    save();
  });
  listen(loop, 'click', () => {
    audio.loop = !audio.loop;
    loop.setAttribute('aria-pressed', String(audio.loop));
    save();
  });
  listen(shuffle, 'click', () => {
    shuffled = !shuffled;
    resetQueue();
    shuffle.setAttribute('aria-pressed', String(shuffled));
    save();
  });
  for (const event of [
    'timeupdate',
    'durationchange',
    'play',
    'pause',
    'ended',
  ])
    listen(audio, event, update);
  listen(audio, 'playing', () => setStatus('Playing'));
  listen(audio, 'waiting', () => setStatus('Loading'));
  listen(audio, 'pause', () => {
    if (!audio.error) setStatus('Paused');
  });
  listen(audio, 'ended', () => {
    if (!document.hidden) switchSong(1, true);
  });
  listen(audio, 'loadedmetadata', () => {
    setStatus(audio.paused ? 'Ready' : 'Playing');
    update();
  });
  listen(audio, 'error', () => {
    setStatus('Unavailable', true);
    update();
  });
  listen(
    window,
    'keydown',
    (event) => {
      if (event.code === 'Escape' && isCompact() && !controls.hidden) {
        event.preventDefault();
        event.stopPropagation();
        collapse(true);
        return;
      }
      const step =
        event.code === 'Comma' ? -1 : event.code === 'Period' ? 1 : 0;
      if (
        (!step && event.code !== 'KeyM' && event.code !== 'Slash') ||
        event.repeat ||
        event.ctrlKey ||
        event.metaKey ||
        event.altKey
      )
        return;
      if (
        event.target.closest?.(
          'select, textarea, input:not([type="range"]), [contenteditable]:not([contenteditable="false"])',
        )
      )
        return;
      event.preventDefault();
      event.stopPropagation();
      if (step) switchSong(step);
      else if (event.code === 'KeyM') togglePlayback();
      else toggleExpanded();
    },
    { capture: true },
  );
  listen(root, 'keydown', (event) => event.stopPropagation());
  listen(root, 'click', (event) => {
    if (event.detail > 0) event.target.closest('button')?.blur();
  });
  listen(root, 'focusin', clearInput);
  listen(document, 'visibilitychange', () => {
    if (document.hidden && !audio.paused) audio.pause();
  });
  collapse(true);
  updateVolume();
  loadSong();
  return {
    setDriving(value) {
      driving = value;
      root.classList.toggle('is-compact', isCompact());
      if (value) collapse(true);
      expand.disabled = value && !isCompact();
    },
    startWithGame() {
      if (!disposed && wantsPlayback && audio.paused) void start();
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      abort.abort();
      audio.pause();
      audio.removeAttribute('src');
      audio.load();
      root.remove();
    },
  };
}
