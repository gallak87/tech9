# Halcyon — Blue Hour

Original deep-trance sketch: 16 bars, 128 BPM, 4/4, F♯ minor, 30 seconds. Audition through the opt-in `?music=1` player.

- `score.mjs`: editable harmony, melody, tempo and deterministic seed.
- `synthesize.mjs`: PCM instruments, rhythmic arrangement and mix.
- `render.mjs`: offline render and stereo 16-bit WAV export.

From `games/vector-nova`:

```sh
nvm use 22
node assets/levels/halcyon/audio/render.mjs
```

Requires only Node.js. Each render overwrites `public/assets/levels/halcyon/audio/blue-hour-preview.wav`; click **Reload sketch** in Music Lab. Technical checks print to the console without saving reports or comparison copies.

Note tails, stereo echoes and room reflections wrap into a circular buffer. The loop is samples `[0, 1323000)` at 44,100 Hz, stereo, lasting 30 seconds. Peak normalization targets −1.5 dBFS; this is not a LUFS measurement.

## Provenance

Composed and synthesized for VECTOR//NOVA by Codex. All notes, synthesis patches, percussion noise and room reflections come from the accompanying source. No external samples, recordings, soundfonts or music-generation service are used.

See the [current brief](../../../../docs/audio/halcyon.md) for musical direction. The user is the listening critic.
