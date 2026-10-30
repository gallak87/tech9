import { chromium } from 'playwright';
import { access, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';

const finite = (value) => Number.isFinite(value);
const seconds = (frames, fps) => Number((frames / fps).toFixed(9));

async function closingPlate(output, supplied) {
  if (supplied) {
    await access(supplied);
    return supplied;
  }
  const path = join(output, 'closing-wordmark.png');
  const browser = await chromium.launch({
    channel: process.env.VN_BROWSER_CHANNEL ?? 'chrome',
    headless: true,
    args: ['--mute-audio'],
  });
  try {
    const page = await browser.newPage({
      viewport: { width: 1920, height: 1080 },
      deviceScaleFactor: 1,
    });
    // Same markup and type treatment as the game's menu-wordmark, enlarged
    // without its surrounding interface. No new badge or title-card system.
    await page.setContent(`<!doctype html><html lang="en"><head><style>
      *{box-sizing:border-box}html,body{width:1920px;height:1080px;margin:0}
      body{display:grid;place-items:center;background:#191919;color:#edf0e9;
        font-family:Arial,Helvetica,sans-serif;overflow:hidden}
      .menu-wordmark{white-space:nowrap;font-size:174px;font-weight:900;
        font-style:italic;letter-spacing:-.055em;line-height:1;margin:0}
      .menu-wordmark span{color:#c41c1c}
      </style></head><body><p class="menu-wordmark">VECTOR<span>//</span>NOVA</p></body></html>`);
    await page.screenshot({ path });
  } finally {
    await browser.close();
  }
  return path;
}

// Interwoven gameplay/menu shots, one musical bed, and a plain closing wordmark.
// All source offsets are relative to each take's saved usable inPoint.
export async function assembleTrailer({
  root,
  output,
  manifest,
  config,
  command,
}) {
  const { fps, frames, closing, music } = config;
  if (
    config.kind !== 'trailer' ||
    fps !== 60 ||
    !Number.isInteger(frames) ||
    frames < 1800 ||
    frames > fps * 120 ||
    !closing ||
    !Number.isInteger(closing.from) ||
    closing.to !== frames ||
    closing.to - closing.from < fps * 3 ||
    closing.to - closing.from > fps * 3.5 ||
    !Array.isArray(config.cuts) ||
    !config.cuts.length
  )
    throw new Error(
      'Expected a 30–120s, 60fps trailer with a 3–3.5s closing hold.',
    );
  if (
    music?.id !== 'ionwake' ||
    !finite(music.sourceOffset) ||
    music.sourceOffset < 0 ||
    !finite(music.gain) ||
    music.gain < 0
  )
    throw new Error('Expected an Ionwake source offset and gain.');
  const filename = config.outputFile ?? 'vector-nova-gameplay-trailer-30s.mp4';
  if (basename(filename) !== filename || !filename.endsWith('.mp4'))
    throw new Error(
      'outputFile must be an MP4 filename inside the output directory.',
    );

  let previous = 0;
  const sources = config.cuts.map((cut) => {
    const shot = manifest.shots?.find((take) => take.id === cut.shot);
    const duration = seconds(cut.to - cut.from, fps);
    if (
      !shot ||
      !finite(shot.inPoint) ||
      shot.inPoint < 0 ||
      !Number.isInteger(cut.from) ||
      cut.from !== previous ||
      !Number.isInteger(cut.to) ||
      cut.to <= cut.from ||
      !finite(cut.source) ||
      cut.source < 0 ||
      cut.source + duration > shot.seconds + 0.01 ||
      (cut.audio !== undefined && typeof cut.audio !== 'boolean') ||
      (cut.gain !== undefined && (!finite(cut.gain) || cut.gain < 0)) ||
      (cut.audioFade !== undefined &&
        (!finite(cut.audioFade) ||
          cut.audioFade < 0 ||
          cut.audioFade > duration / 2))
    )
      throw new Error(`Invalid trailer cut: ${JSON.stringify(cut)}`);
    previous = cut.to;
    return { shot, cut, duration };
  });
  if (previous !== closing.from)
    throw new Error(
      'Picture cuts must fill the timeline up to the closing hold.',
    );

  const duration = seconds(frames, fps);
  const requestedTail = closing.tail ?? 0.2;
  if (!finite(requestedTail) || requestedTail < 0 || requestedTail > 0.5)
    throw new Error(
      'The native landing audio tail must be between 0 and 0.5 seconds.',
    );
  const last = sources.at(-1);
  const tail =
    last.cut.audio === false || last.cut.gain === 0 ? 0 : requestedTail;
  if (last.cut.source + last.duration + tail > last.shot.seconds + 0.01)
    throw new Error(
      'Final source needs enough handle for its native landing tail.',
    );
  const fadeOut = music.fadeOut ?? 1.2;
  if (!finite(fadeOut) || fadeOut <= 0 || fadeOut > 3)
    throw new Error('Music fadeOut must be between 0 and 3 seconds.');
  const ducks = music.ducks ?? [{ from: 7.6, to: 9.1, gain: 0.75 }];
  for (const duck of ducks) {
    if (
      !finite(duck.from) ||
      !finite(duck.to) ||
      duck.from < 0 ||
      duck.to <= duck.from ||
      duck.to > duration ||
      !finite(duck.gain) ||
      duck.gain < 0 ||
      duck.gain > 1
    )
      throw new Error(`Invalid music duck: ${JSON.stringify(duck)}`);
  }

  const plate = await closingPlate(output, closing.image);
  const inputArgs = [];
  const filters = [];
  const decisions = [];
  const continuousAudio = (left, right) =>
    left &&
    right &&
    left.shot.id === right.shot.id &&
    left.cut.audio !== false &&
    right.cut.audio !== false &&
    (left.cut.gain ?? 1) === (right.cut.gain ?? 1) &&
    left.cut.audioFade === undefined &&
    right.cut.audioFade === undefined &&
    Math.abs(left.cut.source + left.duration - right.cut.source) < 1 / fps / 10;
  for (let index = 0; index < sources.length; index++) {
    const { shot, cut, duration: cutDuration } = sources[index];
    const sourcePath = join(output, `${shot.id}.webm`);
    await access(sourcePath);
    const isLast = index === sources.length - 1;
    const nativeTail = isLast ? tail : 0;
    const audioDuration = cutDuration + nativeTail;
    const muted = cut.audio === false || cut.gain === 0;
    const continuesFromPrevious = Boolean(
      continuousAudio(sources[index - 1], sources[index]),
    );
    const continuesIntoNext = Boolean(
      continuousAudio(sources[index], sources[index + 1]),
    );
    const fade = cut.audioFade ?? 0.15;
    const fadeIn = continuesFromPrevious
      ? 0
      : index === 0
        ? Math.min(fade, 0.05)
        : fade;
    const fadeOutStart = isLast ? cutDuration : cutDuration - fade;
    const fadeOutDuration = continuesIntoNext ? 0 : isLast ? nativeTail : fade;
    inputArgs.push(
      '-threads',
      '1',
      '-ss',
      String(shot.inPoint + cut.source),
      '-t',
      String(audioDuration + 0.08),
      '-i',
      sourcePath,
    );
    filters.push(
      `[${index}:v]scale=1920:1080:flags=lanczos,fps=${fps},trim=end_frame=${cut.to - cut.from},setpts=N/(${fps}*TB),setsar=1[v${index}]`,
    );
    const fades = [
      ...(fadeIn > 0 ? [`afade=t=in:d=${fadeIn}`] : []),
      ...(fadeOutDuration > 0
        ? [`afade=t=out:st=${fadeOutStart}:d=${fadeOutDuration}`]
        : []),
    ];
    const delay = cut.from * (48000 / fps);
    filters.push(
      muted
        ? `anullsrc=r=48000:cl=stereo,atrim=duration=${audioDuration},asetpts=PTS-STARTPTS,adelay=${delay}S:all=1[a${index}]`
        : `[${index}:a]aresample=48000,aformat=channel_layouts=stereo,atrim=duration=${audioDuration},asetpts=PTS-STARTPTS,volume=${cut.gain ?? 1}${fades.length ? `,${fades.join(',')}` : ''},adelay=${delay}S:all=1[a${index}]`,
    );
    decisions.push({
      ...cut,
      sourceInPoint: shot.inPoint + cut.source,
      sourcePath,
      nativeTail,
      muted,
      continuesFromPrevious,
      continuesIntoNext,
      // Capture gains remain in the source. This gain defaults to unity.
      postCaptureGain: cut.gain ?? 1,
      fadeIn,
      fadeOutStart,
      fadeOutDuration,
    });
  }
  const plateIndex = sources.length;
  inputArgs.push('-loop', '1', '-framerate', String(fps), '-i', plate);
  filters.push(
    `[${plateIndex}:v]fps=${fps},trim=end_frame=${closing.to - closing.from},setpts=N/(${fps}*TB),format=yuv420p,setsar=1[closing]`,
    `${sources.map((_, index) => `[v${index}]`).join('')}[closing]concat=n=${sources.length + 1}:v=1:a=0[video]`,
  );
  const musicIndex = plateIndex + 1;
  inputArgs.push('-i', join(root, 'assets/levels/halcyon/audio/ionwake.wav'));
  const phrase = music.phraseJump;
  if (
    phrase &&
    (!finite(phrase.at) ||
      phrase.at <= 1 ||
      phrase.at >= duration - 3 ||
      !finite(phrase.source) ||
      phrase.source < 0 ||
      !finite(phrase.crossfade) ||
      phrase.crossfade <= 0 ||
      phrase.crossfade > 0.1 ||
      !finite(phrase.gain) ||
      phrase.gain < 0 ||
      phrase.gain > 2)
  )
    throw new Error('Invalid same-song musical phrase jump.');
  let musicInput = `[${musicIndex}:a]`;
  if (phrase) {
    const half = phrase.crossfade / 2;
    filters.push(
      `[${musicIndex}:a]aresample=48000,aformat=channel_layouts=stereo,asplit=2[musicHead][musicReturn]`,
      `[musicHead]atrim=start=${music.sourceOffset}:duration=${phrase.at + half},asetpts=PTS-STARTPTS[musicH]`,
      `[musicReturn]atrim=start=${phrase.source - half}:duration=${duration - phrase.at + half},asetpts=PTS-STARTPTS[musicR]`,
      `[musicH][musicR]acrossfade=d=${phrase.crossfade}:c1=qsin:c2=qsin[phraseMusic]`,
    );
    musicInput = '[phraseMusic]';
  }
  // Soft trapezoid-shaped reductions leave actual combat sounds intelligible.
  const duckExpression = ducks.map(
    (duck) =>
      `(1-${1 - duck.gain}*max(0,min(1,min((t-${duck.from})/0.12,(${duck.to}-t)/0.3))))`,
  );
  const musicVolume = [
    String(music.gain),
    ...duckExpression,
    ...(phrase
      ? [`(1+${phrase.gain - 1}*max(0,min(1,(t-${phrase.at})/0.6)))`]
      : []),
  ].join('*');
  filters.push(
    `${musicInput}aresample=48000,aformat=channel_layouts=stereo,atrim=${phrase ? '' : `start=${music.sourceOffset}:`}duration=${duration},asetpts=PTS-STARTPTS,volume='${musicVolume}':eval=frame,afade=t=in:d=0.025,afade=t=out:st=${duration - fadeOut}:d=${fadeOut}[music]`,
    `${sources.map((_, index) => `[a${index}]`).join('')}[music]amix=inputs=${sources.length + 1}:duration=longest:normalize=0,alimiter=limit=0.95:level=false:latency=true,apad=whole_len=${frames * 800},atrim=end_sample=${frames * 800}[audio]`,
  );
  const movie = join(output, filename);
  await writeFile(join(output, 'trailer.ffmpeg'), filters.join(';\n'));
  await writeFile(
    join(output, 'trailer-edit.json'),
    JSON.stringify({ ...config, decisions, closingPlate: plate }, null, 2),
  );
  console.log(
    'EDIT trailer / gameplay and menus / continuous Ionwake / closing wordmark',
  );
  await command('ffmpeg', [
    '-hide_banner',
    '-loglevel',
    'error',
    '-y',
    '-filter_complex_threads',
    '2',
    ...inputArgs,
    '-filter_complex',
    filters.join(';'),
    '-map',
    '[video]',
    '-map',
    '[audio]',
    '-t',
    String(duration),
    '-frames:v',
    String(frames),
    '-r',
    String(fps),
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
    video.nb_frames !== String(frames) ||
    audio?.codec_name !== 'aac' ||
    audio.sample_rate !== '48000' ||
    audio.channels !== 2 ||
    !finite(Number(result.format?.duration)) ||
    Math.abs(Number(result.format.duration) - duration) > 0.05
  )
    throw new Error(
      'Rendered trailer does not match requested duration/frames/1080p60/stereo AAC.',
    );
  return result;
}
