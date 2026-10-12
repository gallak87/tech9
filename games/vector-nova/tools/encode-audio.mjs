import { spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, rename, rm, stat } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { musicTracks } from '../src/audio/tracks.js';

const root = fileURLToPath(new URL('..', import.meta.url));
const ids = process.argv.slice(2);
if (ids.includes('--help')) {
  console.log(
    'Usage: npm run audio:encode -- [track-id ...]\nOmit IDs to encode every catalog track. Requires FFmpeg with libmp3lame.',
  );
  process.exit(0);
}
for (const id of ids) {
  if (!musicTracks.some((track) => track.id === id))
    throw new Error(
      `Unknown track: ${id}. Use a track ID from src/audio/tracks.js.`,
    );
}
const tracks = musicTracks.filter(
  (track) => !ids.length || ids.includes(track.id),
);
const jobs = tracks.map((track) => {
  if (!track.path.endsWith('.mp3'))
    throw new Error(`Expected MP3 destination: ${track.path}`);
  return {
    track,
    source: resolve(root, track.path.replace(/\.mp3$/, '.wav')),
    destination: resolve(root, 'public', track.path),
  };
});
// Check the complete selection before replacing any playable exports.
for (const { source } of jobs) {
  if (!(await stat(source)).isFile())
    throw new Error(`Missing WAV master: ${source}`);
}
const encoder = spawnSync('ffmpeg', ['-version'], { encoding: 'utf8' });
if (encoder.error || encoder.status !== 0)
  throw new Error(
    'FFmpeg is required. Install it (macOS: brew install ffmpeg), then rerun audio:encode.',
  );

let sourceBytes = 0;
let outputBytes = 0;
for (const { track, source, destination } of jobs) {
  await mkdir(dirname(destination), { recursive: true });
  const temporary = await mkdtemp(resolve(dirname(destination), '.encode-'));
  const output = resolve(temporary, 'track.mp3');
  try {
    const result = spawnSync(
      'ffmpeg',
      [
        '-hide_banner',
        '-loglevel',
        'error',
        '-nostdin',
        '-y',
        '-i',
        source,
        '-map',
        '0:a:0',
        '-map_metadata',
        '-1',
        '-c:a',
        'libmp3lame',
        '-b:a',
        '192k',
        '-ar',
        '48000',
        '-ac',
        '2',
        output,
      ],
      { stdio: 'inherit' },
    );
    if (result.error || result.status !== 0)
      throw new Error(
        `Encoding failed for ${track.id}; existing MP3 retained.`,
        { cause: result.error },
      );
    const bytes = (await stat(output)).size;
    if (!bytes)
      throw new Error(`Empty MP3 for ${track.id}; existing export retained.`);
    await rename(output, destination);
    sourceBytes += (await stat(source)).size;
    outputBytes += bytes;
    console.log(`${track.title}: ${(bytes / 1048576).toFixed(2)} MiB`);
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
}
console.log(
  `${jobs.length} tracks: ${(sourceBytes / 1048576).toFixed(2)} MiB WAV → ${(outputBytes / 1048576).toFixed(2)} MiB MP3 (192 kbps, stereo 48 kHz).`,
);
