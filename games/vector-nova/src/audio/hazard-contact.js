import { createSampleBank } from './sample-bank.js';

const texture = new URL(
  '../../assets/audio/sfx/fire-contact.wav',
  import.meta.url,
).href;
export const HAZARD_CONTACT_AUDIO = Object.freeze({
  gain: 0.4,
  attackSeconds: 0.035,
  releaseSeconds: 0.18,
});
const unit = (value) =>
  Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0;

// A single sample voice follows solved contact and its visual afterburn. It borrows the effects
// bus; no context, random voice, ambience or sound is created by a racing tick.
export function createHazardContactAudio(
  context,
  destination,
  { readFeedback, fetchAudio } = {},
) {
  if (typeof readFeedback !== 'function')
    throw new Error('Hazard audio requires a feedback reader.');
  const bank = createSampleBank(context, { contact: texture }, { fetchAudio });
  let voice = null;
  let disposed = false;
  let target = 0;
  let releaseAt = null;
  let starts = 0;

  function stop() {
    if (voice) {
      const owned = voice;
      voice = null;
      owned.source.onended = null;
      owned.source.stop();
      owned.source.disconnect();
      owned.gain.disconnect();
    }
    target = 0;
    releaseAt = null;
  }

  return {
    prepare: () => bank.prepare(),
    update(frame) {
      if (disposed) return;
      if (
        frame?.mode !== 'racing' ||
        frame.reset ||
        context.state !== 'running'
      ) {
        stop();
        return;
      }
      const feedback = readFeedback(frame);
      const contact = unit(feedback?.contact);
      const envelope =
        feedback?.envelope === undefined ? contact : unit(feedback.envelope);
      const next = Math.max(contact, envelope) * HAZARD_CONTACT_AUDIO.gain;
      const now = context.currentTime;
      if (next <= 0) {
        if (!voice) return;
        if (releaseAt === null) {
          target = 0;
          releaseAt = now + HAZARD_CONTACT_AUDIO.releaseSeconds;
          voice.gain.gain.cancelAndHoldAtTime(now);
          voice.gain.gain.linearRampToValueAtTime(0, releaseAt);
        } else if (now >= releaseAt) stop();
        return;
      }
      if (!voice) {
        const buffer = bank.get('contact');
        if (!buffer) return;
        const source = context.createBufferSource(),
          gain = context.createGain();
        source.buffer = buffer;
        source.loop = true;
        gain.gain.setValueAtTime(0, now);
        source.connect(gain).connect(destination);
        voice = { source, gain };
        source.onended = () => {
          if (voice?.source === source) stop();
        };
        source.start(now);
        starts++;
      }
      if (releaseAt !== null || Math.abs(next - target) >= 0.006) {
        voice.gain.gain.cancelAndHoldAtTime(now);
        voice.gain.gain.linearRampToValueAtTime(
          next,
          now + HAZARD_CONTACT_AUDIO.attackSeconds,
        );
        target = next;
      }
      releaseAt = null;
    },
    stop,
    getPresentation: () => ({
      type: 'hazard-contact',
      activeVoices: voice ? 1 : 0,
      starts,
      contact: target > 0,
      releasing: releaseAt !== null,
      loaded: bank.loaded().length === 1,
      missing: bank.missing(),
      maxGain: HAZARD_CONTACT_AUDIO.gain,
    }),
    dispose() {
      if (disposed) return;
      disposed = true;
      stop();
      bank.dispose();
    },
  };
}
