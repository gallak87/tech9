"""Derive the current reedy feedback family from the user's Great reference.

Run: python3 assets/audio/sfx/landing-feedback-master.py
The four replacement JSONs are offline derivation recipes, not model prompts.
Great and the approved trick WAV/config/provenance are preserved exactly.
"""
import argparse
from array import array
import hashlib
import json
import math
from pathlib import Path
import subprocess
import sys
from tempfile import TemporaryDirectory
import wave

ROOT = Path(__file__).resolve().parent
RATE = 44100
VARIANTS = ('landing-catch', 'freestyle-bank-good',
            'freestyle-bank-perfect', 'freestyle-bank-miss')
PRESERVED = ('freestyle-bank-great', 'freestyle-trick')


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def smooth(value):
    x = max(0, min(1, value))
    return x * x * (3 - 2 * x)


def lowpass(data, start_hz, end_hz):
    # Gentle timbral opening/closing, with the original pitch and breath notch
    # intact. No oscillator, compression, new note or repeated sample is added.
    histories = [[0., 0., 0., 0.] for _ in range(2)]
    frames = len(data) // 2
    for frame in range(frames):
        progress = frame / max(1, frames - 1)
        hz = start_hz + (end_hz - start_hz) * smooth((progress - .40) / .60)
        angle = 2 * math.pi * hz / RATE
        cosine = math.cos(angle)
        alpha = math.sin(angle) / math.sqrt(2)
        divisor = 1 + alpha
        b0 = (1 - cosine) / 2 / divisor
        b1 = (1 - cosine) / divisor
        a1 = -2 * cosine / divisor
        a2 = (1 - alpha) / divisor
        for channel in range(2):
            i = frame * 2 + channel
            x1, x2, y1, y2 = histories[channel]
            value = data[i]
            output = b0 * value + b1 * x1 + b0 * x2 - a1 * y1 - a2 * y2
            histories[channel][:] = [value, x1, output, y1]
            data[i] = output


def master(cue, reference, reference_seconds):
    config_path = ROOT / f'{cue}.json'
    config = json.loads(config_path.read_text())
    if config['source'] != reference.name:
        raise ValueError('Every variant must use the selected Great recording')
    seconds = config['durationSeconds']
    tempo = reference_seconds / seconds
    filters = [f"highpass=f={config['highpassHz']}", f'atempo={tempo:.12g}',
               f'apad=whole_dur={seconds}', f'atrim=duration={seconds}']
    with TemporaryDirectory(prefix='reedy-feedback-') as temporary:
        raw = Path(temporary) / 'reference.f32'
        subprocess.run(['ffmpeg', '-nostdin', '-hide_banner', '-loglevel', 'error', '-y',
                        '-i', str(reference), '-af', ','.join(filters),
                        '-ac', '2', '-ar', str(RATE), '-f', 'f32le', str(raw)], check=True)
        data = array('f', raw.read_bytes())
    if sys.byteorder != 'little':
        data.byteswap()
    frames = round(seconds * RATE)
    if len(data) != frames * 2:
        raise ValueError('Unexpected derivative duration')
    lowpass(data, config['lowpassStartHz'], config['lowpassEndHz'])
    for frame in range(frames):
        progress = frame / max(1, frames - 1)
        second = smooth((progress - .29) / .13)
        lobe = config['firstLobeGain'] * (1 - second) + config['secondLobeGain'] * second
        tail = 1 - (1 - config['tailGain']) * smooth((progress - .73) / .27)
        attack = min(1, frame / max(1, round(config['fadeInSeconds'] * RATE)))
        release = min(1, (frames - 1 - frame) / max(1, round(config['fadeOutSeconds'] * RATE)))
        gain = lobe * tail * attack * (.5 - .5 * math.cos(math.pi * release))
        for channel in range(2):
            data[frame * 2 + channel] *= gain
    peak = max(abs(value) for value in data)
    if peak < .0001 or not all(math.isfinite(value) for value in data):
        raise ValueError('Silent or non-finite derivative')
    level = 10 ** (config['peakDbfs'] / 20) / peak
    pcm = array('h', (round(value * level * 32767) for value in data))
    if sys.byteorder != 'little':
        pcm.byteswap()
    target = ROOT / f'{cue}.wav'
    with wave.open(str(target), 'wb') as wav:
        wav.setnchannels(2)
        wav.setsampwidth(2)
        wav.setframerate(RATE)
        wav.writeframes(pcm.tobytes())
    return {'config': config_path.name, 'configSha256': digest(config_path),
            'sourceMaster': reference.name, 'sourceMasterSha256': digest(reference),
            'master': target.name, 'masterSha256': digest(target),
            'durationSeconds': seconds,
            'processing': {'pitchPreservingTempo': tempo, 'recipe': config,
                           'compressor': None, 'newTonesOrOscillators': False}}


def main():
    argparse.ArgumentParser(description=__doc__).parse_args()
    record = ROOT / 'landing-feedback-provenance.json'
    prior = json.loads(record.read_text())
    for cue in PRESERVED:
        item = prior['cues'][cue]
        if digest(ROOT / item['master']) != item['masterSha256']:
            raise ValueError(f'Selected recording changed: {cue}')
        if digest(ROOT / item['config']) != item['configSha256']:
            raise ValueError(f'Selected recording config changed: {cue}')
    reference = ROOT / 'freestyle-bank-great.wav'
    with wave.open(str(reference), 'rb') as wav:
        if (wav.getnchannels(), wav.getframerate(), wav.getsampwidth()) != (2, RATE, 2):
            raise ValueError('Unexpected Great reference format')
        seconds = wav.getnframes() / RATE
    cues = {cue: master(cue, reference, seconds) for cue in VARIANTS}
    for cue in PRESERVED:
        cues[cue] = prior['cues'][cue]
    provenance = {
        'runtime': 'Great source generated with Stable Audio 3 Small-SFX MLX; derivatives authored offline',
        'toolchain': 'tools/sfx-models.json',
        'mastering': 'landing-feedback-master.py; Great recording, pitch-preserving duration fitting, gentle spectral/lobe shaping and silent fades',
        'referenceAudio': {'file': reference.name, 'sha256': digest(reference)},
        'format': 'stereo 44100 Hz 16-bit PCM',
        'direction': 'Thin reedy breathy whaw-whaw articulation, preserving the selected Great recording and its central breath notch.',
        'approval': 'Great structure selected by user; trick click approved; replacement derivatives pending listening review.',
        'cues': cues,
    }
    record.write_text(json.dumps(provenance, indent=2) + '\n')
    print('Replaced four clips from the Great reference; Great and trick preserved exactly.')


if __name__ == '__main__':
    main()
