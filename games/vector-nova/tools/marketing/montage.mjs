import { chromium } from 'playwright';
import { access, writeFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

// The edit is an explicit frame-based EDL. Gameplay sources remain untouched.
export async function assembleMontage({
  root,
  output,
  manifest,
  config,
  command,
}) {
  const fps = config.fps;
  if (fps !== 60 || config.frames !== 900)
    throw new Error(
      'The montage renderer currently supports 15-second, 60 fps edits.',
    );
  const duration = config.frames / fps;
  let previous = 0;
  for (const cut of config.cuts) {
    const shot = manifest.shots.find((s) => s.id === cut.shot);
    if (
      !shot ||
      cut.from !== previous ||
      cut.to <= cut.from ||
      cut.source < 0 ||
      cut.source + (cut.to - cut.from) / fps > shot.seconds + 0.01
    )
      throw new Error(`Invalid montage cut: ${JSON.stringify(cut)}`);
    previous = cut.to;
  }
  if (previous !== config.frames)
    throw new Error('Edit does not fill the requested timeline.');

  console.log('NORMALIZE source takes');
  for (const shot of manifest.shots) {
    const rawPath = join(output, `${shot.id}.webm`);
    const cleanPath = join(output, `${shot.id}.mp4`);
    try {
      const [rawInfo, cleanInfo] = await Promise.all([
        stat(rawPath),
        stat(cleanPath),
      ]);
      if (cleanInfo.mtimeMs >= rawInfo.mtimeMs) {
        const cached = JSON.parse(
          await command('ffprobe', [
            '-v',
            'error',
            '-show_entries',
            'format=duration',
            '-show_entries',
            'stream=codec_type,width,height,avg_frame_rate',
            '-of',
            'json',
            cleanPath,
          ]),
        );
        const video = cached.streams.find((s) => s.codec_type === 'video');
        if (
          Math.abs(Number(cached.format.duration) - shot.seconds) < 0.05 &&
          video.width === 1920 &&
          video.height === 1080 &&
          video.avg_frame_rate === '60/1'
        )
          continue;
      }
    } catch {
      /* Missing or interrupted source export: rebuild it. */
    }
    await command('ffmpeg', [
      '-hide_banner',
      '-loglevel',
      'error',
      '-y',
      '-ss',
      String(shot.inPoint),
      '-i',
      join(output, `${shot.id}.webm`),
      '-t',
      String(shot.seconds),
      '-vf',
      `scale=1920:1080:flags=lanczos,fps=${fps},setsar=1`,
      '-c:v',
      'libx264',
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
      join(output, `${shot.id}.mp4`),
    ]);
  }

  console.log('EXPORT clean typographic plates');
  const plates = [
    'intro-vector',
    'intro-nova',
    'intro-wordmark',
    'slash',
    'finish',
  ];
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
    await page.goto(pathToFileURL(join(root, 'marketing/overlay.html')).href);
    for (const id of plates) {
      await page.evaluate((id) => window.renderPlate(id), id);
      await page.screenshot({
        path: join(output, `${id}.png`),
        omitBackground: true,
      });
    }
  } finally {
    await browser.close();
  }

  const inputArgs = [];
  const filters = [];
  for (let i = 0; i < config.cuts.length; i++) {
    const cut = config.cuts[i];
    const frames = cut.to - cut.from;
    const seconds = frames / fps;
    inputArgs.push(
      '-threads',
      '1',
      '-ss',
      String(cut.source),
      '-t',
      String(seconds + 0.15),
      '-i',
      join(output, `${cut.shot}.mp4`),
    );
    const look =
      cut.look === 'engine-macro'
        ? 'crop=768:432:576:420,'
        : cut.look === 'punch'
          ? 'crop=1728:972:96:54,'
          : '';
    filters.push(
      `[${i}:v]${look}scale=1920:1080:flags=lanczos,fps=${fps},tpad=stop_mode=clone:stop_duration=0.1,trim=end_frame=${frames},setpts=N/(${fps}*TB),setsar=1,eq=saturation=1.08:contrast=1.025[v${i}]`,
    );
    filters.push(
      `[${i}:a]aresample=48000,apad=whole_len=${frames * 800},atrim=end_sample=${frames * 800},asetpts=PTS-STARTPTS,afade=t=in:d=0.012,afade=t=out:st=${Math.max(0, seconds - 0.025)}:d=0.025[a${i}]`,
    );
  }
  filters.push(
    `${config.cuts.map((_, i) => `[v${i}][a${i}]`).join('')}concat=n=${config.cuts.length}:v=1:a=1[montage][fx]`,
  );
  const plateStart = config.cuts.length;
  for (const id of plates)
    inputArgs.push(
      '-loop',
      '1',
      '-framerate',
      String(fps),
      '-i',
      join(output, `${id}.png`),
    );
  const musicIndex = plateStart + plates.length;
  inputArgs.push('-i', join(root, 'assets/levels/halcyon/audio/ionwake.wav'));
  const chargeIndex = musicIndex + 1;
  const hitIndex = musicIndex + 2;
  inputArgs.push(
    '-i',
    join(root, 'assets/audio/sfx/repulsor-charge.wav'),
    '-i',
    join(root, 'assets/audio/sfx/lance-hit.wav'),
  );

  // No feature cards. Split brand fragments land in the opening percussion,
  // then the worlds stay clear until a final wordmark over the huge flight.
  filters.push(
    `[${plateStart}:v]format=rgba,fade=t=in:st=0:d=0.1:alpha=1,fade=t=out:st=0.52:d=0.12:alpha=1[pVector]`,
  );
  filters.push(
    `[${plateStart + 1}:v]format=rgba,fade=t=in:st=0.26:d=0.1:alpha=1,fade=t=out:st=0.98:d=0.12:alpha=1[pNova]`,
  );
  filters.push(
    `[${plateStart + 2}:v]format=rgba,fade=t=in:st=2.466667:d=0.09:alpha=1,fade=t=out:st=3.233333:d=0.116667:alpha=1[pIntro]`,
  );
  filters.push(
    `[${plateStart + 3}:v]format=rgba,split=3[slashA][slashB][slashC]`,
  );
  filters.push(
    `[${plateStart + 4}:v]format=rgba,fade=t=in:st=13.216667:d=0.12:alpha=1[pFinish]`,
  );
  filters.push(
    "[montage]drawbox=x=0:y=0:w=iw:h=ih:color=0x191919@0.16:t=fill:enable='between(t,2.466667,3.35)',drawbox=x=0:y=0:w=iw:h=ih:color=0xedf0e9@0.58:t=fill:enable='between(n,40,41)'[base]",
  );
  filters.push(
    "[base][pVector]overlay=x='if(lt(t,0.2),-280*(1-t/0.2),0)':y=0:enable='between(t,0,0.64)'[o1]",
  );
  filters.push(
    "[o1][pNova]overlay=x='if(lt(t,0.46),280*(1-(t-0.26)/0.2),0)':y=0:enable='between(t,0.26,1.1)'[o2]",
  );
  filters.push(
    "[o2][pIntro]overlay=x=0:y=0:enable='between(t,2.466667,3.35)'[o3]",
  );
  filters.push(
    "[o3][slashA]overlay=x='-2200+(t-0.616667)*26000':y=0:enable='between(t,0.616667,0.8)'[o4]",
  );
  filters.push(
    "[o4][slashB]overlay=x='-2200+(t-6.85)*26000':y=0:enable='between(t,6.85,7.033333)'[o5]",
  );
  filters.push(
    "[o5][slashC]overlay=x='-2200+(t-10.433333)*26000':y=0:enable='between(t,10.433333,10.616667)'[o6]",
  );
  filters.push(
    'color=c=0x191919:s=1920x1080:r=60:d=15,format=rgba,fade=t=in:st=14.6:d=0.4:alpha=1[endDim]',
  );
  filters.push('[o6][endDim]overlay=shortest=1[o7]');
  filters.push("[o7][pFinish]overlay=x=0:y=0:enable='gte(t,13.216667)'[video]");

  const bedDuration = duration - config.music.delay;
  filters.push(
    `[${musicIndex}:a]atrim=start=${config.music.sourceOffset}:duration=${bedDuration},asetpts=PTS-STARTPTS,volume=${config.music.gain},afade=t=in:d=0.025,afade=t=out:st=${bedDuration - 0.3}:d=0.3,adelay=${Math.round(config.music.delay * 1000)}:all=1[music]`,
  );
  filters.push(
    `[${chargeIndex}:a]atrim=duration=0.48,asetpts=PTS-STARTPTS,volume=0.85,afade=t=out:st=0.35:d=0.13,adelay=70:all=1[charge]`,
  );
  filters.push(
    `[${hitIndex}:a]asetpts=PTS-STARTPTS,volume=0.28,adelay=2467:all=1[impact]`,
  );
  filters.push(
    '[fx][music][charge][impact]amix=inputs=4:duration=first:normalize=0,alimiter=limit=0.95[audio]',
  );
  const script = join(output, 'edit.ffmpeg');
  await writeFile(script, filters.join(';\n'));
  await writeFile(join(output, 'edit.json'), JSON.stringify(config, null, 2));
  const movie = join(output, 'vector-nova-montage-15s.mp4');
  console.log('EDIT beat montage / red-slash transitions / sound mix');
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
      'stream=codec_name,codec_type,width,height,avg_frame_rate,nb_frames,sample_rate,channels',
      '-show_entries',
      'format=duration,size',
      '-of',
      'json',
      movie,
    ]),
  );
  const video = result.streams.find((s) => s.codec_type === 'video');
  if (
    video.nb_frames !== String(config.frames) ||
    Math.abs(Number(result.format.duration) - duration) > 0.05
  )
    throw new Error('Rendered duration/frame count differs from the edit.');
  await access(movie);
  return result;
}
