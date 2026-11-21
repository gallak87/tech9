import { crossoverLimits, clearanceFade } from './high-octane-profile.js';

const pi = Math.PI;
const clamp = (v, low, high) => Math.max(low, Math.min(high, v));
const edge = (t) => Math.sin(pi * clamp(t, 0, 1)) ** 4;
const phase = (t, shift) => t + shift * Math.sin(pi * t);
const ease = (t) => {
  const u = clamp(t, 0, 1);
  return u * u * (3 - 2 * u);
};

const wall = {
  plan: (t) => 0.23 * edge(phase(t, 0.07)),
  height: (t) => 0.48 * edge(phase(t, 0.14)),
  bank: (t) => ease(t / 0.35) * ease((1 - t) / 0.38),
};

// Each section budgets X/Z curvature, grade and deck rotation separately.
// Different entry and exit timings make a crest/release ride differently
// from a dive, a single sustained carve or a linked left/right transition.
const sections = [
  {
    distance: 1.05,
    plan: (t) => edge(t),
    height: (t) => edge(phase(t, -0.12)),
    bank: (t) => edge(phase(t, -0.04)),
  },
  {
    distance: 1.3,
    plan: (t) => edge(t) * Math.cos(pi * t) * 2.8,
    height: (t) => -edge(phase(t, 0.14)) * 0.7,
    bank: (t) => edge(t) * Math.cos(pi * t) * 3.4,
  },
  {
    distance: 0.84,
    plan: (t) => -0.55 * edge(phase(t, 0.09)),
    height: (t) => edge(t) * Math.cos(pi * t) * 2.8,
    bank: (t) => -edge(phase(t, -0.11)),
  },
  {
    distance: 0.93,
    plan: (t) => edge(phase(t, -0.13)) * 0.88,
    height: (t) => -edge(phase(t, -0.08)),
    bank: (t) => edge(phase(t, 0.06)) * 1.22,
  },
];
const turnRadius = (a, b, c) => {
  const ax = b.x - a.x,
    az = b.z - a.z,
    bx = c.x - b.x,
    bz = c.z - b.z;
  const angle = Math.atan2(Math.abs(ax * bz - az * bx), ax * bx + az * bz);
  return (Math.hypot(ax, az) + Math.hypot(bx, bz)) / Math.max(1e-5, 2 * angle);
};

function setSection(
  output,
  stations,
  start,
  span,
  recipe,
  intensity,
  crossings,
  distance,
) {
  const { points } = output;
  const {
    bendiness,
    elevation,
    banking,
    strength,
    floor,
    gradeLimit,
    rollLimit,
    wallStrength,
  } = intensity;
  const samples = new Map();
  const run = (at, side) => clearanceFade(at, side, crossings, distance);
  for (let i = 1; i < points.length - 1; i++) {
    const t = (stations[i] - start) / span;
    if (t <= 0 || t >= 1) continue;
    const prev = points[i - 1].position,
      next = points[i + 1].position;
    const dx = next.x - prev.x,
      dz = next.z - prev.z;
    const spacing = Math.max(1, Math.hypot(dx, dz));
    const corridor = Math.min(run(stations[i], 1), run(stations[i], -1));
    const offset = recipe.shape.plan(t) * corridor * recipe.direction;
    const height = recipe.shape.height(t);
    samples.set(i, {
      x: (dz * offset) / spacing,
      z: (-dx * offset) / spacing,
      height: height * run(stations[i], height),
      bank: recipe.shape.bank(t) * recipe.direction,
    });
  }
  if (samples.size < 4) return;
  const first = samples.keys().next().value;
  const last = first + samples.size - 1;
  // A circular/S-shaped shove scales with the square of the distance budget:
  // the shorter section bends harder at the same displacement. Stop at the
  // first offset that would squeeze an existing corner.
  let side = Math.min(72, (span * span) / 7200) * bendiness * strength;
  const shifted = (index, amount) => {
    const point = points[index].position;
    const delta = samples.get(index);
    return delta
      ? { x: point.x + delta.x * amount, z: point.z + delta.z * amount }
      : point;
  };
  for (let retry = 0; retry < 4; retry++) {
    let clear = true;
    for (let i = first; i <= last + 1 && i < points.length - 1; i++) {
      const before = points[i - 1].position,
        here = points[i].position,
        after = points[i + 1].position;
      const a = shifted(i - 1, side);
      const b = shifted(i, side);
      const c = shifted(i + 1, side);
      const target = Math.min(110, turnRadius(before, here, after) * 0.97);
      if (
        turnRadius(a, b, c) < target ||
        Math.hypot(b.x - a.x, b.z - a.z) < 30.25 ||
        Math.hypot(c.x - b.x, c.z - b.z) < 30.25
      ) {
        clear = false;
        break;
      }
    }
    if (clear) break;
    side *= retry < 3 ? 0.54 : 0;
  }
  let lift = Math.min(115, span * 0.125) * elevation * strength;
  let lean =
    banking * (recipe.shape === wall ? 1.61 * wallStrength : 1.52 * strength);
  for (let i = first; i <= last + 1; i++) {
    const a = shifted(i - 1, side);
    const b = shifted(i, side);
    const metres = Math.hypot(b.x - a.x, b.z - a.z);
    const delta = points[i].position.y - points[i - 1].position.y;
    const grade =
      (samples.get(i)?.height ?? 0) - (samples.get(i - 1)?.height ?? 0);
    const twist = (samples.get(i)?.bank ?? 0) - (samples.get(i - 1)?.bank ?? 0);
    if (grade && metres < 30.25) lift = 0;
    if (grade)
      lift = Math.min(
        lift,
        Math.max(
          0,
          (metres * gradeLimit - Math.sign(grade) * delta) / Math.abs(grade),
        ),
      );
    if (twist) lean = Math.min(lean, (metres * rollLimit) / Math.abs(twist));
  }
  for (const [i, { height }] of samples) {
    const { y } = points[i].position;
    if (height < 0) lift = Math.min(lift, Math.max(0, (y - floor) / -height));
    if (height > 0) lift = Math.min(lift, (3000 - y) / height);
  }
  for (const [i, { x, z, height, bank }] of samples) {
    points[i].position.x += x * side;
    points[i].position.z += z * side;
    points[i].position.y += height * lift;
    points[i].roll = bank * lean;
  }
}

export function createSectionProfile(options, random) {
  const { length, courseType, rhythm, attempt, width, waterLevel, crossovers } =
    options;
  const downhill = courseType === 'downhill';
  const spacing = 1040 - rhythm * 615;
  const intensity = {
    bendiness: length >= 14000 && attempt >= 3 ? 0 : options.bendiness,
    elevation: options.elevation,
    banking: options.banking,
    strength: 0.78 ** attempt,
    floor: waterLevel + 32,
    gradeLimit: attempt >= 2 ? 0.29 : length >= 14000 ? 0.315 : 0.34,
    rollLimit: length >= 14000 || attempt >= 2 ? 0.007 : 0.009,
    wallStrength: 0.92 ** attempt,
  };
  let previous = -1;
  const recipes = Array.from({ length: Math.ceil(length / 320) + 4 }, () => {
    // Avoid choosing the same section twice in succession.
    const index =
      previous < 0
        ? Math.floor(random() * sections.length)
        : (previous + 1 + Math.floor(random() * (sections.length - 1))) %
          sections.length;
    previous = index;
    return {
      shape: sections[index],
      distance: 0.86 + random() * 0.32,
      entry: random(),
      direction: random() < 0.5 ? -1 : 1,
    };
  });
  return (output) => {
    const { points, jumps } = output;
    if (points.length < 4) return;
    const stations = [0];
    for (let i = 1; i < points.length; i++)
      stations.push(
        stations[i - 1] + points[i].position.distanceTo(points[i - 1].position),
      );
    const distance =
      stations.at(-1) +
      (downhill ? 0 : points[0].position.distanceTo(points.at(-1).position));
    const crossings =
      !downhill && crossovers > 0
        ? crossoverLimits(points, stations, distance, width)
        : [];
    // A descending jump's 240 m stock start is inside its 320 m flat/ramp
    // lane. Shaping its upstream end can aim that start away from the receiver.
    const runup = downhill ? (length >= 5000 && attempt < 3 ? 335 : 175) : 260;
    const reservations = jumps
      .map((jump) => [
        stations[points.indexOf(jump.launch)] - runup,
        stations[points.indexOf(jump.receiver)] + (downhill ? 105 : 240),
      ])
      .sort((a, b) => a[0] - b[0]);
    reservations.push([distance - (downhill ? 720 : 220), distance]);
    const corridors = [];
    let cursor = length < 2400 ? 145 : 270;
    for (const [start, end] of reservations) {
      if (start - cursor >= 290) corridors.push([cursor, start]);
      cursor = Math.max(cursor, end);
    }
    // On courses with an ordinary kilometre available, a longer asymmetric
    // transition can reach and hold a near-vertical deck without a snap roll.
    const wallCorridor =
      length >= 5000 && rhythm >= 0.78
        ? corridors.reduce(
            (best, interval) =>
              interval[1] - interval[0] >= 1040 &&
              (!best || interval[1] - interval[0] > best[1] - best[0])
                ? interval
                : best,
            null,
          )
        : null;
    let index = 0;
    const fill = (start, end) => {
      let at = start;
      while (end - at >= 290) {
        const recipe = recipes[index++ % recipes.length];
        const target = spacing * recipe.shape.distance * recipe.distance;
        const available = end - at;
        const window = available - target >= 300 ? target : available;
        const span = window * (0.88 + rhythm * 0.105);
        setSection(
          output,
          stations,
          at + (window - span) * recipe.entry,
          span,
          recipe,
          intensity,
          crossings,
          distance,
        );
        at += window;
      }
    };
    for (const interval of corridors) {
      const [start, end] = interval;
      if (interval !== wallCorridor) {
        fill(start, end);
        continue;
      }
      const span = Math.min(1180, end - start);
      const entry = (start + end - span) / 2;
      fill(start, entry);
      setSection(
        output,
        stations,
        entry,
        span,
        { shape: wall, direction: recipes[index++ % recipes.length].direction },
        intensity,
        crossings,
        distance,
      );
      fill(entry + span, end);
    }
  };
}
