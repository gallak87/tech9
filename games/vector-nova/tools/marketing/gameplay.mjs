import { writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';

// Keep the native countdown, race and sound effects in one continuous take.
export async function assembleGameplay({
  root,
  output,
  manifest,
  config,
  command,
}) {
  if (
    config.kind !== 'continuous' ||
    config.fps !== 60 ||
    config.frames !== 1320
  )
    throw new Error('Gameplay assembly requires a 22-second, 60 fps edit.');
  const duration = config.frames / config.fps;
  const shot = manifest.shots?.find((take) => take.id === 'nacre-race');
  if (
    manifest.shots?.length !== 1 ||
    !shot ||
    !Number.isFinite(shot.inPoint) ||
    shot.inPoint < 0 ||
    shot.seconds !== duration
  )
    throw new Error('Expected one 22-second nacre-race take with an inPoint.');
  if (
    config.music?.id !== 'ionwake' ||
    !Number.isFinite(config.music.sourceOffset) ||
    config.music.sourceOffset < 0 ||
    !Number.isFinite(config.music.gain) ||
    config.music.gain < 0 ||
    config.music.delay !== 'green'
  )
    throw new Error('Expected an Ionwake music bed timed to the green light.');
  const filename = config.outputFile ?? 'vector-nova-part1-gameplay.mp4';
  if (basename(filename) !== filename || !filename.endsWith('.mp4'))
    throw new Error(
      'outputFile must be an MP4 filename within the output directory.',
    );

  // Capture metadata is relative to the usable take, after its inPoint.
  const greenAtSeconds = shot.greenAtSeconds ?? 2.8;
  if (
    !Number.isFinite(greenAtSeconds) ||
    greenAtSeconds < 0 ||
    greenAtSeconds > duration - 0.45
  )
    throw new Error('The green light must occur within the recorded take.');
  const musicDuration = duration - greenAtSeconds;
  const delaySamples = Math.round(greenAtSeconds * 48000);
  const filters = [
    `[0:v]scale=1920:1080:flags=lanczos,fps=${config.fps},trim=end_frame=${config.frames},setpts=N/(${config.fps}*TB),setsar=1[video]`,
    `[0:a]aresample=48000,aformat=channel_layouts=stereo,atrim=duration=${duration},asetpts=PTS-STARTPTS[game]`,
    `[1:a]aresample=48000,aformat=channel_layouts=stereo,atrim=start=${config.music.sourceOffset}:duration=${musicDuration},asetpts=PTS-STARTPTS,volume=${config.music.gain},afade=t=in:d=0.05,afade=t=out:st=${musicDuration - 0.4}:d=0.4,adelay=${delaySamples}S:all=1[music]`,
    `[game][music]amix=inputs=2:duration=first:normalize=0,alimiter=limit=0.95:level=false:latency=true,atrim=duration=${duration}[audio]`,
  ];
  const movie = join(output, filename);
  await writeFile(
    join(output, 'gameplay-edit.json'),
    JSON.stringify(
      { ...config, greenAtSeconds, sourceInPoint: shot.inPoint },
      null,
      2,
    ),
  );
  console.log('EDIT continuous Nacre race / native countdown / music at green');
  await command('ffmpeg', [
    '-hide_banner',
    '-loglevel',
    'error',
    '-y',
    '-filter_complex_threads',
    '2',
    '-ss',
    String(shot.inPoint),
    '-i',
    join(output, `${shot.id}.webm`),
    '-i',
    join(root, 'assets/levels/halcyon/audio/ionwake.wav'),
    '-filter_complex',
    filters.join(';'),
    '-map',
    '[video]',
    '-map',
    '[audio]',
    '-t',
    String(duration),
    '-frames:v',
    String(config.frames),
    '-r',
    String(config.fps),
    '-c:v',
    'libx264',
    '-threads',
    '4',
    '-preset',
    'fast',
    '-crf',
    '17',
    '-pix_fmt',
    'yuv420p',
    '-c:a',
    'aac',
    '-b:a',
    '192k',
    '-ar',
    '48000',
    '-ac',
    '2',
    '-movflags',
    '+faststart',
    movie,
  ]);
  const result = JSON.parse(
    await command('ffprobe', [
      '-v',
      'error',
      '-show_entries',
      'stream=codec_name,codec_type,width,height,pix_fmt,sample_aspect_ratio,avg_frame_rate,nb_frames,sample_rate,channels',
      '-show_entries',
      'format=duration,size',
      '-of',
      'json',
      movie,
    ]),
  );
  const video = result.streams?.find((stream) => stream.codec_type === 'video');
  const audio = result.streams?.find((stream) => stream.codec_type === 'audio');
  if (
    video?.codec_name !== 'h264' ||
    video.width !== 1920 ||
    video.height !== 1080 ||
    video.pix_fmt !== 'yuv420p' ||
    video.sample_aspect_ratio !== '1:1' ||
    video.avg_frame_rate !== '60/1' ||
    video.nb_frames !== String(config.frames) ||
    audio?.codec_name !== 'aac' ||
    audio.sample_rate !== '48000' ||
    audio.channels !== 2 ||
    !Number.isFinite(Number(result.format?.duration)) ||
    Math.abs(Number(result.format.duration) - duration) > 0.05
  )
    throw new Error(
      'Rendered gameplay does not match 22s / 1320 frames / 1080p60 / stereo AAC.',
    );
  return result;
}
