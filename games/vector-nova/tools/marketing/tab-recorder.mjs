import assert from 'node:assert/strict';
import { access, appendFile, mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

// Dedicated-tab picture and native Web Audio only. Chrome stays host-muted;
// no microphone or desktop surface is ever requested.
export async function installNativeAudioTap(context) {
  await context.addInitScript(() => {
    const connect = AudioNode.prototype.connect;
    const taps = new WeakMap();
    window.__VN_MARKETING_AUDIO = [];
    AudioNode.prototype.connect = function (...args) {
      const result = connect.apply(this, args);
      if (args[0] === this.context.destination) {
        let tap = taps.get(this.context);
        if (!tap) {
          tap = this.context.createMediaStreamDestination();
          taps.set(this.context, tap);
          window.__VN_MARKETING_AUDIO.push({
            context: this.context,
            stream: tap.stream,
          });
        }
        connect.call(this, tap);
      }
      return result;
    };
  });
}

export async function startTabRecording(
  page,
  { outputFile, title, audioGain = 1 },
) {
  try {
    await access(outputFile);
    throw new Error(`Refusing to overwrite ${outputFile}.`);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  await mkdir(dirname(outputFile), { recursive: true });
  await writeFile(outputFile, Buffer.alloc(0));
  await page.exposeFunction('writeMarketingCapture', (chunk) =>
    appendFile(outputFile, Buffer.from(chunk, 'base64')),
  );
  await page.evaluate(
    ({ title, audioGain }) => {
      document.title = title;
      const button = document.createElement('button');
      button.id = 'record-marketing-tab';
      button.textContent = 'Record this game tab';
      button.style =
        'position:fixed;left:20px;top:90px;z-index:99999;padding:16px';
      document.body.append(button);
      button.onclick = async () => {
        try {
          const stream = await navigator.mediaDevices.getDisplayMedia({
            preferCurrentTab: true,
            selfBrowserSurface: 'include',
            monitorTypeSurfaces: 'exclude',
            surfaceSwitching: 'exclude',
            video: {
              displaySurface: 'browser',
              width: { ideal: 1920, max: 1920 },
              height: { ideal: 1080, max: 1080 },
              frameRate: { ideal: 60, max: 60 },
              cursor: 'never',
            },
            audio: false,
          });
          const video = stream.getVideoTracks()[0];
          if (video.getSettings().displaySurface !== 'browser') {
            stream.getTracks().forEach((track) => track.stop());
            throw new Error('Refusing non-tab capture.');
          }
          const mixer = new AudioContext({ sampleRate: 48000 });
          const output = mixer.createMediaStreamDestination();
          if (!window.__VN_MARKETING_AUDIO.length)
            throw new Error('No native game audio taps.');
          for (const tap of window.__VN_MARKETING_AUDIO) {
            await tap.context.resume();
            const gain = mixer.createGain();
            gain.gain.value = audioGain;
            mixer
              .createMediaStreamSource(tap.stream)
              .connect(gain)
              .connect(output);
          }
          await mixer.resume();
          const mix = new MediaStream([
            video,
            output.stream.getAudioTracks()[0],
          ]);
          const recorder = new MediaRecorder(mix, {
            mimeType: 'video/webm;codecs=vp9,opus',
            videoBitsPerSecond: 24000000,
            audioBitsPerSecond: 192000,
          });
          const capture = {
            pending: Promise.resolve(),
            video,
            done: false,
            settings: video.getSettings(),
            audioBuses: window.__VN_MARKETING_AUDIO.length,
          };
          window.__VN_TAB_RECORDING = capture;
          recorder.ondataavailable = (event) => {
            if (!event.data.size) return;
            capture.pending = capture.pending.then(async () => {
              const data = await new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onerror = () => reject(reader.error);
                reader.onload = () =>
                  resolve(
                    reader.result.slice(reader.result.indexOf(';base64,') + 8),
                  );
                reader.readAsDataURL(event.data);
              });
              await window.writeMarketingCapture(data);
            });
          };
          recorder.onerror = (event) => {
            capture.error = String(event.error);
          };
          recorder.onstop = async () => {
            try {
              await capture.pending;
            } catch (error) {
              capture.error = String(error);
            }
            mix.getTracks().forEach((track) => track.stop());
            await mixer.close();
            capture.done = true;
          };
          capture.stop = () => {
            capture.endedAt = performance.now();
            recorder.stop();
          };
          capture.start = () => {
            recorder.start(500);
            capture.startedAt = performance.now();
            capture.active = true;
          };
          button.remove();
          capture.ready = true;
        } catch (error) {
          window.__VN_TAB_RECORDING_ERROR = String(error);
        }
      };
    },
    { title, audioGain },
  );
  await page.bringToFront();
  await page.locator('#record-marketing-tab').click();
  await page.waitForFunction(
    () => window.__VN_TAB_RECORDING?.ready || window.__VN_TAB_RECORDING_ERROR,
    null,
    { timeout: 20000 },
  );
  const error = await page.evaluate(() => window.__VN_TAB_RECORDING_ERROR);
  if (error) throw new Error(error);
  const cdp = await page.context().newCDPSession(page);
  await page.waitForTimeout(300);
  try {
    for (let attempt = 0; attempt < 3; attempt++) {
      const current = await page.evaluate(() => ({
        settings: window.__VN_TAB_RECORDING.video.getSettings(),
        width: innerWidth,
      }));
      const missing =
        (current.settings.width * 9) / 16 - current.settings.height;
      if (Math.abs(missing) <= 2) break;
      const { windowId, bounds } = await cdp.send('Browser.getWindowForTarget');
      await cdp.send('Browser.setWindowBounds', {
        windowId,
        bounds: {
          height:
            bounds.height +
            Math.ceil(missing / (current.settings.width / current.width)),
        },
      });
      await page.waitForTimeout(250);
    }
  } finally {
    await cdp.detach();
  }
  // MediaRecorder fixes its encoded dimensions from the first frame. Finish
  // the native tab resize before starting it, avoiding a stale short raster.
  await page.waitForTimeout(300);
  await page.evaluate(() => window.__VN_TAB_RECORDING.start());
  const metadata = await page.evaluate(() => {
    const capture = window.__VN_TAB_RECORDING;
    capture.settings = capture.video.getSettings();
    return {
      startedAt: capture.startedAt,
      settings: capture.settings,
      audioBuses: capture.audioBuses,
    };
  });
  assert.ok(
    Math.abs(metadata.settings.width / metadata.settings.height - 16 / 9) <=
      0.005,
    `Unclipped 16:9 capture: ${metadata.settings.width}x${metadata.settings.height}`,
  );
  return { outputFile, ...metadata };
}

export async function stopTabRecording(page) {
  await page.evaluate(() => window.__VN_TAB_RECORDING.stop());
  await page.waitForFunction(() => window.__VN_TAB_RECORDING.done, null, {
    timeout: 30000,
  });
  const metadata = await page.evaluate(() => ({
    error: window.__VN_TAB_RECORDING.error ?? null,
    settings: window.__VN_TAB_RECORDING.settings,
    startedAt: window.__VN_TAB_RECORDING.startedAt,
    duration:
      (window.__VN_TAB_RECORDING.endedAt -
        window.__VN_TAB_RECORDING.startedAt) /
      1000,
    audioBuses: window.__VN_TAB_RECORDING.audioBuses,
  }));
  assert.equal(metadata.error, null);
  return metadata;
}
