// Current audition songs. One prompt and export per song; no versioned takes.
export const musicTracks = [
  {
    id: 'blue-hour',
    title: 'Blue Hour',
    bpm: 128,
    file: 'blue-hour-preview.wav',
    tags: ['halcyon'],
  },
  {
    id: 'phase-shift',
    title: 'Phase Shift',
    bpm: 132,
    file: 'phase-shift.wav',
    tags: ['mix'],
  },
  {
    id: 'nightshift',
    title: 'Nightshift',
    bpm: 122,
    file: 'nightshift.wav',
    tags: ['mix'],
  },
  {
    id: 'undertow',
    title: 'Undertow',
    bpm: 128,
    file: 'undertow.wav',
    tags: ['mix'],
  },
  {
    id: 'ionwake',
    title: 'Ionwake',
    bpm: 134,
    file: 'ionwake.wav',
    tags: ['mix'],
  },
  {
    id: 'event-horizon',
    title: 'Event Horizon',
    bpm: 138,
    file: 'event-horizon.wav',
    tags: ['mix'],
  },
  {
    id: 'slipstream',
    title: 'Slipstream',
    bpm: 128,
    file: 'slipstream.wav',
    tags: ['mix'],
  },
  {
    id: 'mirage',
    title: 'Mirage',
    bpm: 124,
    file: 'mirage.wav',
    tags: ['mix'],
  },
].map((track) => ({
  ...track,
  path: `assets/levels/halcyon/audio/${track.file}`,
}));
