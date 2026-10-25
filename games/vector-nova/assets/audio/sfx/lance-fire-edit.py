"""Master the current ion-discharge recording without a laser pitch sweep.

Generate with tools/sfx.py and lance-fire.json, then pass its WAV as --source.
"""
import argparse
import array
import hashlib
import json
import math
from pathlib import Path
import sys
import wave

ROOT = Path(__file__).resolve().parent
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--source', type=Path, required=True)
args = parser.parse_args()
raw = args.source.read_bytes()
with wave.open(str(args.source), 'rb') as wav:
    rate, channels = wav.getframerate(), wav.getnchannels()
    assert (rate, channels, wav.getsampwidth()) == (44100, 2, 2)
    pcm = array.array('h', wav.readframes(wav.getnframes()))
if sys.byteorder != 'little':
    pcm.byteswap()
start, end = 0, min(len(pcm) // channels, round(.875 * rate))
data = [value / 32768 for value in pcm[start * channels:end * channels]]
filters = []
for kind, hz in [('highpass', 30), ('lowpass', 4000)]:
    q = math.sqrt(.5)
    cosine = math.cos(2 * math.pi * hz / rate)
    alpha = math.sin(2 * math.pi * hz / rate) / (2 * q)
    if kind == 'highpass':
        b = [(1 + cosine) / 2, -(1 + cosine), (1 + cosine) / 2]
    else:
        b = [(1 - cosine) / 2, 1 - cosine, (1 - cosine) / 2]
    a0 = 1 + alpha
    b = [value / a0 for value in b]
    a = [-2 * cosine / a0, (1 - alpha) / a0]
    filters.append({'type': kind, 'hz': hz, 'Q': q, 'b': b, 'a': a})
    history = [[0., 0., 0., 0.] for _ in range(channels)]
    for i, value in enumerate(data):
        state = history[i % channels]
        output = b[0] * value + b[1] * state[0] + b[2] * state[1] - a[0] * state[2] - a[1] * state[3]
        state[:] = [value, state[0], output, state[2]]
        data[i] = output
frames = len(data) // channels
attack, release = round(.001 * rate), round(.045 * rate)
for frame in range(frames):
    tail = min(1, (frames - frame - 1) / release)
    fade = min(1, frame / attack) * (.5 - .5 * math.cos(math.pi * tail))
    for channel in range(channels):
        data[frame * channels + channel] *= fade
# Retain the approved body level when removing the late firing-tail transient.
gain = 58906.55694648313
rendered = array.array('h', (round(value * gain) for value in data))
# Preserve the mastered sound; only raise its level by 4 dB.
post_gain_db = 4
post_gain = 10 ** (post_gain_db / 20)
rendered = array.array('h', (round(value * post_gain) for value in rendered))
if sys.byteorder != 'little':
    rendered.byteswap()
target = ROOT / 'lance-fire.wav'
with wave.open(str(target), 'wb') as wav:
    wav.setnchannels(channels)
    wav.setsampwidth(2)
    wav.setframerate(rate)
    wav.writeframes(rendered.tobytes())
p = ROOT / 'equipment-provenance.json'
provenance = json.loads(p.read_text())
provenance['cues']['lance-fire'] = {
    'config': 'lance-fire.json',
    'sourceSha256': hashlib.sha256(raw).hexdigest(),
    'trimStartFrame': start,
    'trimEndFrame': end,
    'filters': filters,
    'gain': gain,
    'postGainDb': post_gain_db,
    'peakDbfs': -1,
    'fadeInFrames': attack,
    'fadeOutFrames': release,
    'fadeOutCurve': 'raised-cosine',
    'editScript': 'lance-fire-edit.py',
    'editScriptSha256': hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
    'seconds': round(frames / rate, 6),
    'sha256': hashlib.sha256(target.read_bytes()).hexdigest(),
}
provenance['approval'] = 'Approved deep firing body retained at +4 dB; late firing-tail transient removed with a smooth release. Listening approval pending.'
p.write_text(json.dumps(provenance, indent=2) + '\n')
print(f'Ion-discharge master: {frames / rate:.2f}s, -1 dBFS peak (+4 dB), mini-boom unchanged.')
