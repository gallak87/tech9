const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
const finite = (value) => (Number.isFinite(value) ? value : 0);

// AudioParam targets preserve phase and converge continuously when simulation
// speed, boost or volume changes. Holding first bounds queued automation.
export function smooth(param, value, time, response = 0.08) {
  param.cancelAndHoldAtTime(time);
  param.setTargetAtTime(value, time, response);
}

export function createPropulsion(context, destination) {
  const nodes = [];
  const sources = [];
  const own = (node) => {
    nodes.push(node);
    return node;
  };
  const oscillator = (type, frequency) => {
    const node = own(context.createOscillator());
    node.type = type;
    node.frequency.value = frequency;
    sources.push(node);
    return node;
  };
  const gain = (value = 0) => {
    const node = own(context.createGain());
    node.gain.value = value;
    return node;
  };
  const filter = (type, frequency, q = 0.6) => {
    const node = own(context.createBiquadFilter());
    node.type = type;
    node.frequency.value = frequency;
    node.Q.value = q;
    return node;
  };

  // Sparse harmonics retain a mechanical body without a raw sawtooth buzz.
  // Two slightly detuned nacelles beat naturally; the hover fundamental stays
  // centred so steering never swings the entire engine across the listener.
  const wave = context.createPeriodicWave(
    new Float32Array(8),
    new Float32Array([0, 1, 0.32, 0.13, 0.055, 0.018, 0.012, 0.005]),
  );
  const nacelles = [-1, 1].map((side) => {
    const body = oscillator('sine', 58);
    body.setPeriodicWave(wave);
    body.detune.value = side * 4;
    const bodyFilter = filter('lowpass', 360);
    const bodyGain = gain();
    const blade = oscillator('sine', 232);
    blade.detune.value = side * 7;
    const bladeGain = gain();
    const pan = own(context.createStereoPanner());
    pan.pan.value = side * 0.24;
    body.connect(bodyFilter).connect(bodyGain).connect(pan);
    blade.connect(bladeGain).connect(pan);
    pan.connect(destination);
    return { side, body, bodyFilter, bodyGain, blade, bladeGain, pan };
  });
  const hover = oscillator('sine', 43);
  const hoverGain = gain();
  hover.connect(hoverGain).connect(destination);

  // Seamless original stereo noise: a short wrap crossfade avoids a loop-edge
  // impulse. Mostly shared channels keep airflow centred with a little width.
  const buffer = context.createBuffer(
    2,
    Math.round(context.sampleRate * 3),
    context.sampleRate,
  );
  const blendLength = Math.round(context.sampleRate * 0.04);
  for (let channel = 0; channel < 2; channel++) {
    const data = buffer.getChannelData(channel);
    let seed = 73 + channel * 941;
    for (let index = 0; index < data.length; index++) {
      seed = (seed * 16807) % 2147483647;
      data[index] = seed / 1073741824 - 1;
    }
  }
  const leftNoise = buffer.getChannelData(0);
  const rightNoise = buffer.getChannelData(1);
  for (let index = 0; index < leftNoise.length; index++)
    rightNoise[index] = leftNoise[index] * 0.8 + rightNoise[index] * 0.2;
  for (let channel = 0; channel < 2; channel++) {
    const data = buffer.getChannelData(channel);
    for (let index = 0; index < blendLength; index++) {
      const mix = index / (blendLength - 1);
      const tail = data.length - blendLength + index;
      data[tail] = data[tail] * (1 - mix) + data[index] * mix;
    }
  }
  const noise = own(context.createBufferSource());
  noise.buffer = buffer;
  noise.loop = true;
  noise.loopStart = blendLength / context.sampleRate;
  noise.loopEnd = buffer.duration;
  sources.push(noise);
  const airHighpass = filter('highpass', 350);
  const airLowpass = filter('lowpass', 1800, 0.55);
  const airGain = gain();
  noise.connect(airHighpass).connect(airLowpass).connect(airGain);
  airGain.connect(destination);
  const boostFilter = filter('bandpass', 1100, 0.65);
  const boostGain = gain();
  noise.connect(boostFilter).connect(boostGain).connect(destination);
  for (const source of sources) source.start();

  let previousTime;
  let previousSpeed = 0;
  let load = 0;
  let disposed = false;
  return {
    update(state, time = context.currentTime) {
      if (disposed) return;
      const speed = clamp(finite(state?.speed), 0, 200);
      const simulationTime = finite(state?.time);
      const elapsed = simulationTime - previousTime;
      if (elapsed > 0 && elapsed <= 0.2) {
        const acceleration = clamp((speed - previousSpeed) / elapsed, -90, 65);
        load +=
          (clamp(acceleration / 42, -1, 1) - load) * -Math.expm1(-elapsed * 7);
      } else if (elapsed < 0 || elapsed > 0.2) {
        // Reset/scenario jumps must not impersonate an engine acceleration.
        load = 0;
      }
      previousTime = simulationTime;
      previousSpeed = speed;
      const pace = speed / 157;
      const boost = state?.boosting ? 1 : 0;
      const steering = clamp(finite(state?.steer), -1, 1);
      const braking = Math.max(0, -load);
      const power = Math.max(0, load);
      for (const voice of nacelles) {
        smooth(
          voice.body.frequency,
          58 + speed * 0.61 + power * 8 + boost * 13,
          time,
          0.11,
        );
        smooth(
          voice.bodyFilter.frequency,
          310 + speed * 5 + power * 220 + boost * 390 - braking * 120,
          time,
          0.14,
        );
        smooth(
          voice.bodyGain.gain,
          (0.024 + pace * 0.017 + power * 0.009 + boost * 0.008) *
            (1 - braking * 0.2),
          time,
        );
        smooth(
          voice.blade.frequency,
          231 + speed * 2.2 + boost * 70 + power * 17,
          time,
          0.12,
        );
        smooth(
          voice.bladeGain.gain,
          0.002 + pace * 0.006 + boost * 0.007,
          time,
          0.16,
        );
        smooth(voice.pan.pan, voice.side * 0.24 + steering * 0.045, time, 0.18);
      }
      smooth(hover.frequency, 43 + speed * 0.075 + boost * 3, time, 0.18);
      smooth(
        hoverGain.gain,
        0.03 + boost * 0.007 - braking * 0.004,
        time,
        0.12,
      );
      smooth(airLowpass.frequency, 1800 + speed * 16, time, 0.2);
      smooth(airGain.gain, Math.pow(pace, 1.8) * 0.09, time, 0.16);
      smooth(boostFilter.frequency, 1000 + speed * 5, time, 0.15);
      smooth(boostGain.gain, boost * 0.045, time, boost ? 0.09 : 0.18);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const source of sources) source.stop();
      for (const node of nodes) node.disconnect();
      noise.buffer = null;
    },
  };
}
