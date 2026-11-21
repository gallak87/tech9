const PI = Math.PI;
const fade = (distance) => {
  const t = Math.max(0, Math.min(1, (distance - 45) / 160));
  return t * t * (3 - 2 * t);
};

function crossoverLimits(points, stations, trackLength, width) {
  const clearance = width + 72;
  const near = [];
  for (let i = 0; i < points.length; i++)
    for (let j = i + 1; j < points.length; j++) {
      const separation = stations[j] - stations[i];
      if (Math.min(separation, trackLength - separation) < 250) continue;
      const a = points[i].position;
      const b = points[j].position;
      if (Math.hypot(b.x - a.x, b.z - a.z) < clearance)
        near.push({
          upper: a.y > b.y ? stations[i] : stations[j],
          lower: a.y > b.y ? stations[j] : stations[i],
        });
    }
  return near;
}

function clearanceFade(at, height, pairs, length) {
  let nearest = Infinity;
  for (const pair of pairs) {
    const distance = Math.abs(at - (height < 0 ? pair.upper : pair.lower));
    nearest = Math.min(nearest, distance, length - distance);
  }
  return fade(nearest);
}

export function createHighOctaneProfile(options, random) {
  const { courseType, bendiness, elevation, attempt, length, crossovers } =
    options;
  const downhill = courseType === 'downhill';
  const strength = 0.76 ** attempt;
  const family = Math.floor(random() * 3);
  const openingDirection = random() < 0.5 ? -1 : 1;
  const beats = Array.from({ length: Math.ceil(length / 470) + 4 }, (_, i) => ({
    shape: (family + i) % 3,
    placement: random(),
    size: 0.82 + random() * 0.28,
    sign: (i % 2 ? -1 : 1) * openingDirection,
  }));

  return ({ points, jumps }) => {
    if (points.length < 4 || (!elevation && !bendiness)) return;
    const stations = [0];
    for (let i = 1; i < points.length; i++)
      stations.push(
        stations[i - 1] + points[i].position.distanceTo(points[i - 1].position),
      );
    const trackLength =
      stations.at(-1) +
      (downhill ? 0 : points[0].position.distanceTo(points.at(-1).position));
    const crossings =
      !downhill && crossovers > 0
        ? crossoverLimits(points, stations, trackLength, options.width)
        : [];
    const reservations = jumps
      .map((jump) => [
        stations[points.indexOf(jump.launch)] - (downhill ? 160 : 245),
        stations[points.indexOf(jump.receiver)] + (downhill ? 85 : 260),
      ])
      .sort((a, b) => a[0] - b[0]);
    // Keep the grid, the last circuit transition and the downhill runout quiet.
    reservations.push([trackLength - (downhill ? 720 : 220), trackLength]);
    let cursor = length < 2400 ? 140 : downhill ? 245 : 290;
    let beatIndex = 0;
    for (const [start, end] of reservations) {
      const free = start - cursor;
      if (free >= (downhill ? 315 : 430)) {
        const count = Math.max(1, Math.round(free / (950 - bendiness * 220)));
        for (let i = 0; i < count; i++) {
          const beat = beats[beatIndex++ % beats.length];
          const window = free / count;
          const span = Math.min(window * 0.98, window * beat.size);
          const offset = cursor + i * window + (window - span) * beat.placement;
          shapeBeat(points, stations, offset, span, beat, {
            bendiness,
            elevation,
            strength,
            floor: options.waterLevel + 30,
            crossings,
            trackLength,
          });
        }
      }
      cursor = Math.max(cursor, end);
    }
  };
}

function shapeBeat(points, stations, start, span, beat, settings) {
  const { bendiness, elevation, strength, floor, crossings, trackLength } =
    settings;
  const samples = [];
  for (let i = 0; i < points.length; i++) {
    const t = (stations[i] - start) / span;
    if (t <= 0 || t >= 1) continue;
    // The envelope eases to zero at each end. A crest, a plunge and a linked
    // crest/dip use different timing, while deck roll has its own phase.
    const envelope = Math.sin(PI * t) ** 4;
    const turn = Math.cos(PI * t);
    const height =
      beat.shape === 0
        ? envelope
        : beat.shape === 1
          ? -envelope
          : envelope * turn * 2.4;
    const roll =
      beat.shape === 2
        ? envelope * turn * 2.9
        : envelope * (beat.shape === 0 ? 1 : -1);
    samples.push({
      i,
      height:
        height * clearanceFade(stations[i], height, crossings, trackLength),
      roll,
    });
  }
  if (samples.length < 3) return;
  let amplitude =
    Math.min(86, span * (beat.shape === 2 ? 0.065 : 0.104)) *
    elevation *
    strength;
  // Broad routes retain ordinary sampler banking and upright road for jump
  // inserts. Curvier styles ease into authored wall-like leans.
  const bankMix = Math.max(0, Math.min(1, (bendiness - 0.45) / 0.35));
  let rollAmplitude =
    1.23 * bendiness * strength * bankMix * bankMix * (3 - 2 * bankMix);
  const profile = new Map(samples.map((sample) => [sample.i, sample]));
  // Give the fitted spline some grade headroom beyond the control polygon.
  // Bound only the extra shaping, so a reserved neighbouring grade survives.
  for (
    let i = samples[0].i;
    i <= Math.min(points.length - 1, samples.at(-1).i + 1);
    i++
  ) {
    const a = points[i - 1].position;
    const b = points[i].position;
    const distance = Math.hypot(b.x - a.x, b.z - a.z);
    const delta = b.y - a.y;
    const change =
      (profile.get(i)?.height ?? 0) - (profile.get(i - 1)?.height ?? 0);
    const rollChange =
      (profile.get(i)?.roll ?? 0) - (profile.get(i - 1)?.roll ?? 0);
    if (rollChange)
      rollAmplitude = Math.min(
        rollAmplitude,
        (distance * 0.0115) / Math.abs(rollChange),
      );
    if (change)
      amplitude = Math.min(
        amplitude,
        Math.max(
          0,
          (distance * 0.34 - Math.sign(change) * delta) / Math.abs(change),
        ),
      );
  }
  for (const { i, height } of samples) {
    const { y } = points[i].position;
    if (height < 0)
      amplitude = Math.min(amplitude, Math.max(0, (y - floor) / -height));
    if (height > 0) amplitude = Math.min(amplitude, (3000 - y) / height);
  }
  for (const { i, height, roll: lean } of samples) {
    points[i].position.y += height * amplitude;
    points[i].roll = lean * rollAmplitude * beat.sign;
  }
}
