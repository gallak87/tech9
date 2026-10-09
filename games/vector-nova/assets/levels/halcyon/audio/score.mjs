// Original Halcyon sketch. Positions and durations are quarter-note beats.
export const score = {
  title: 'Halcyon — Blue Hour',
  bpm: 128,
  bars: 16,
  beatsPerBar: 4,
  sampleRate: 44100,
  seed: 70931,
  // Four-bar harmonic fields in F# minor. Close voicings move slowly.
  harmony: [
    ...Array.from({ length: 4 }, () => ['F#1', ['A2', 'C#3', 'E3', 'G#3']]),
    ...Array.from({ length: 4 }, () => ['D2', ['A2', 'C#3', 'E3', 'F#3']]),
    ...Array.from({ length: 4 }, () => ['B1', ['A2', 'C#3', 'D3', 'F#3']]),
    ...Array.from({ length: 4 }, () => ['E2', ['B2', 'E3', 'F#3', 'G#3']]),
  ],
  // A low, restrained phrase: fewer attacks, longer notes, no bright key runs.
  melody: [
    [
      [0.5, 'F#3', 1.5],
      [2.5, 'C#4', 0.9],
    ],
    [
      [0.5, 'E4', 1.2],
      [2.5, 'C#4', 1],
    ],
    [
      [0.5, 'A3', 1.8],
      [3, 'G#3', 0.7],
    ],
    [[0.5, 'F#3', 2.7]],
    [
      [0.5, 'F#3', 1.5],
      [2.5, 'A3', 1],
    ],
    [
      [0.5, 'C#4', 1.2],
      [2.5, 'A3', 1],
    ],
    [
      [0.5, 'E3', 1.8],
      [3, 'F#3', 0.7],
    ],
    [[0.5, 'A3', 2.7]],
    [
      [0.5, 'F#3', 1.5],
      [2.5, 'A3', 0.9],
    ],
    [
      [0.5, 'B3', 1.2],
      [2.5, 'C#4', 1],
    ],
    [
      [0.5, 'A3', 1.8],
      [3, 'F#3', 0.7],
    ],
    [[0.5, 'E3', 2.7]],
    [
      [0.5, 'G#3', 1.5],
      [2.5, 'B3', 0.9],
    ],
    [
      [0.5, 'F#3', 1.2],
      [2.5, 'E3', 1],
    ],
    [
      [0.5, 'G#3', 1.8],
      [3, 'B3', 0.7],
    ],
    [[0.5, 'C#4', 2.5]],
  ],
};
