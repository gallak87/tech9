import * as T from 'three';
import { routeCurve } from './route.js';

const TAU = Math.PI * 2;
const clamp = T.MathUtils.clamp;
const smooth = (t) => t * t * (3 - 2 * t);
const lerp = T.MathUtils.lerp;
function randomFor(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let v = Math.imul(state ^ (state >>> 15), 1 | state);
    v ^= v + Math.imul(v ^ (v >>> 7), 61 | v);
    return ((v ^ (v >>> 14)) >>> 0) / 4294967296;
  };
}
function shapeFor(gap, short) {
  const pitch = T.MathUtils.degToRad(
    short ? 2 : 4 + clamp((gap - 96) / 384, 0, 1) * 8,
  );
  const range = gap + (short ? 15 : 65),
    time = range / (101 * Math.cos(pitch));
  const drop = Math.max(9, 13 * time * time - Math.tan(pitch) * range);
  const receiving = short
    ? 160
    : clamp(gap * 1.5 + 120 + Math.max(0, gap - 200) * 0.8, 240, 1150);
  return { gap, pitch, drop, receiving, delta: Math.tan(pitch) * 80 - drop };
}
function jumpDefinitions(options, random) {
  const {
    length,
    courseType,
    jumpFrequency = 'normal',
    jumpSize = 'mixed',
  } = options;
  const normal =
    courseType === 'downhill'
      ? length < 10000
        ? 3
        : 4
      : length <= 3000
        ? 1
        : 2;
  let count =
    jumpFrequency === 'none'
      ? 0
      : jumpFrequency === 'few'
        ? Math.max(1, Math.floor(normal / 2))
        : jumpFrequency === 'many'
          ? Math.min(8, normal + 1 + Math.floor(length / 9000))
          : normal;
  const short = length < 2400;
  const launchGrid = length < 2400 ? 80 : 200;
  const reserve =
    courseType === 'downhill'
      ? 650 + launchGrid + Math.max(60, length * 0.12)
      : Math.max(
          500,
          length *
            (jumpSize === 'large' ? 0.1 : jumpSize === 'mixed' ? 0.25 : 0.35),
        );
  let gaps = Array.from({ length: count }, () =>
    short
      ? 96
      : jumpSize === 'small'
        ? 108 + random() * 30
        : jumpSize === 'large'
          ? 310 + random() * 150
          : courseType === 'downhill'
            ? 180 + random() * 100
            : 145 + random() * 95,
  );
  const decorate = (gap) => {
    const shape = shapeFor(gap, short);
    const recovery =
      courseType === 'circuit'
        ? short
          ? 100
          : Math.max(180, -shape.delta * 6)
        : 0;
    const preFlat = courseType === 'circuit' && !short ? 80 : 0,
      postReceiver = courseType === 'circuit' && !short ? 80 : 0;
    return {
      ...shape,
      recovery,
      preFlat,
      postReceiver,
      length:
        preFlat +
        80 +
        shape.gap +
        shape.receiving +
        (courseType === 'circuit' ? postReceiver + recovery + 40 : 0),
    };
  };
  let shapes = gaps.map(decorate);
  const budget = () =>
    courseType === 'circuit' && shapes.length
      ? (length < 2400 ? 360 : 480) +
        Math.max(2, shapes.length + (shapes.length % 2)) *
          Math.max(...shapes.map((s) => s.length))
      : shapes.reduce((sum, s) => sum + s.length, 0);
  if (jumpSize === 'large') {
    while (count > 1 && budget() > length - reserve) {
      const next = count - 1;
      if (
        courseType === 'circuit' &&
        Math.max(2, next + (next % 2)) === Math.max(2, count + (count % 2))
      )
        break;
      if (length >= 10000 && next <= normal) break;
      gaps.pop();
      count--;
      shapes = gaps.map(decorate);
    }
  }
  for (let pass = 0; pass < 48 && budget() > length - reserve; pass++) {
    if (gaps.some((gap) => gap > 96.01))
      gaps = gaps.map((gap) => Math.max(96, gap * 0.92));
    else {
      if (
        (courseType === 'circuit' && budget() <= length - 420) ||
        (courseType === 'downhill' &&
          budget() <= length - 650 - launchGrid - 30)
      )
        break;
      gaps.pop();
      count--;
    }
    shapes = gaps.map(decorate);
  }
  return shapes;
}
function collector() {
  const points = [],
    jumps = [];
  function add(position, important = false) {
    const previous = points.at(-1);
    if (previous) {
      const distance = previous.position.distanceTo(position);
      if (distance < 1e-6) {
        previous.important ||= important;
        return previous;
      }
      if (distance < 31) {
        if (!important) return previous;
        if (!previous.important) points.pop();
      }
    }
    const entry = { position: position.clone(), important };
    points.push(entry);
    return entry;
  }
  return { points, jumps, add };
}
function jumpBlock(shape, start, direction, courseType) {
  const result = [],
    side = direction.clone().normalize();
  const pre = shape.preFlat ?? (courseType === 'circuit' ? 80 : 0),
    launchAt = pre + 80;
  const base = start.y,
    lip = base + Math.tan(shape.pitch) * 80,
    landing = lip - shape.drop;
  function point(z, y, label = null) {
    result.push({
      position: start.clone().addScaledVector(side, z).setY(y),
      label,
    });
  }
  point(0, base);
  if (pre) point(pre, base);
  point(pre + 40, base + Math.tan(shape.pitch) * 40);
  point(launchAt, lip, 'launch');
  point(
    launchAt + shape.gap / 3,
    lip + (Math.tan(shape.pitch) * shape.gap) / 3,
  );
  point(launchAt + (shape.gap * 2) / 3, landing);
  point(launchAt + shape.gap, landing, 'landing');
  point(launchAt + shape.gap + shape.receiving / 2, landing);
  const receiver = launchAt + shape.gap + shape.receiving;
  point(receiver, landing, 'receiver');
  if (courseType === 'circuit') {
    const post = shape.postReceiver ?? 80;
    if (post) point(receiver + post, landing);
    for (const f of [1 / 3, 2 / 3, 1])
      point(
        receiver + post + shape.recovery * f,
        lerp(landing, base, smooth(f)),
      );
    point(shape.length, base);
  }
  return result;
}
function appendBlock(output, shape, start, direction, courseType) {
  const record = {};
  const entries = jumpBlock(shape, start, direction, courseType);
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    const added = output.add(entry.position, i > 0);
    if (entry.label) record[entry.label] = added;
  }
  output.jumps.push(record);
  return output.points.at(-1).position.clone();
}
function appendBezier(
  output,
  a,
  b,
  ta,
  tb,
  step,
  omitEnd = false,
  curviness = 0,
) {
  const chord = a.distanceTo(b),
    handle = chord * 0.36;
  const c = a.clone().addScaledVector(ta, handle),
    d = b.clone().addScaledVector(tb, -handle);
  c.y = a.y;
  d.y = b.y;
  const curve = new T.CubicBezierCurve3(a, c, d, b),
    length = curve.getLength();
  const planar = Math.hypot(b.x - a.x, b.z - a.z);
  const amplitude = Math.min(60, (planar * planar) / 15000) * curviness;
  const side =
    planar > 1e-8
      ? new T.Vector3(b.z - a.z, 0, a.x - b.x).divideScalar(planar)
      : new T.Vector3();
  const count = Math.max(amplitude > 0.01 ? 3 : 2, Math.ceil(length / step));
  for (let i = 1; i <= count; i++) {
    if (omitEnd && i === count) continue;
    const f = i / count;
    // This S offset and its first two derivatives vanish at district joins.
    // Only ordinary X/Z controls change; jump and grid geometry stays rigid.
    const offset = amplitude * Math.sin(TAU * f) * Math.sin(Math.PI * f) ** 2;
    output.add(curve.getPointAt(f).addScaledVector(side, offset));
  }
}
function createCircuitBuilder(options, random, shapes) {
  const { length, bendiness, elevation } = options;
  const slots = shapes.length
    ? Math.max(2, shapes.length + (shapes.length % 2))
    : 0;
  const district = shapes.length
    ? Math.max(...shapes.map((shape) => shape.length))
    : 0;
  const gridLength = length < 2400 ? 180 : 240;
  const free = Math.max(300, length - slots * district - gridLength * 2);
  const phase = random() * TAU,
    phase2 = random() * TAU,
    phase3 = random() * TAU;
  const variability = clamp(free / 5000, 0.15, 1);
  const aspect = 1 + (random() - 0.5) * 0.7 * variability,
    shear = (random() - 0.5) * 0.18 * variability;
  const harmonic = Math.min(
    7,
    2 +
      Math.floor(random() * 2) +
      Math.floor(length / 6500) +
      Math.round(bendiness),
  );
  const complexity = (harmonic + slots + 2) ** 2;
  const safeAmplitude = Math.max(0.006, free / (TAU * 140 * complexity));
  const amplitude = Math.min(
      safeAmplitude,
      (0.025 + 0.13 * bendiness) * clamp(free / 4000, 0.15, 1),
    ),
    secondary = Math.min(
      safeAmplitude * 0.3,
      (0.005 + 0.035 * bendiness) * clamp(free / 4000, 0.15, 1),
    );
  const rotation = random() * TAU,
    flip = random() < 0.5 ? -1 : 1;
  const rotate = (x, z) =>
    new T.Vector3(
      x * Math.cos(rotation) - z * Math.sin(rotation),
      0,
      x * Math.sin(rotation) + z * Math.cos(rotation),
    );
  // Family depends on the original seed, independently of jump-count RNG and
  // retry salt. All baselines are centrally symmetric, so fixed insertions at
  // opposite stations close without changing a jump district's dimensions.
  const family = (options.seed >>> 0) % 4;
  const macroStrength = smooth(clamp((free - 1800) / 7000, 0, 1));
  const ellipse = (u) => {
    const theta = u * TAU;
    let xScale = 1,
      zScale = 1,
      radial = 1,
      coastSkew = 0;
    if (family === 0) {
      xScale += macroStrength * 1.4;
      zScale -= macroStrength * 0.25;
      coastSkew = macroStrength * 0.45;
    } else if (family === 1) {
      radial += macroStrength * 0.45 * Math.cos(2 * theta);
      xScale += macroStrength * 0.12;
      zScale -= macroStrength * 0.03;
    } else if (family === 2) {
      radial += macroStrength * 0.29 * Math.cos(4 * theta);
    } else {
      xScale += macroStrength * 0.18;
      zScale += macroStrength * 0.12;
      radial +=
        macroStrength *
        (0.06 * Math.cos(2 * theta) - 0.025 * Math.cos(4 * theta));
    }
    const x = aspect * xScale * radial * Math.cos(theta);
    const z =
      flip * zScale * radial * Math.sin(theta) + (shear + coastSkew) * x;
    return rotate(x, z);
  };
  const ellipseHeading = (u) =>
    ellipse(u + 1e-5)
      .sub(ellipse(u - 1e-5))
      .normalize();
  const plan = (u) => {
    const theta = u * TAU,
      envelope = slots ? Math.cos(Math.PI * slots * u) ** 2 : 1;
    const gridEnvelope =
      harmonic % 2 ? 1 - Math.exp(-((Math.sin(TAU * u) / 0.25) ** 2)) : 1;
    const r =
      1 +
      envelope *
        (gridEnvelope *
          (amplitude * Math.sin(harmonic * theta + phase) +
            secondary * Math.sin((harmonic + 2) * theta + phase2)) +
          Math.min(0.07 * variability, safeAmplitude * 0.6) *
            Math.sin(2 * theta + phase3));
    return ellipse(u).multiplyScalar(r);
  };
  const heading = (u) =>
    plan(u + 1e-5)
      .sub(plan(u - 1e-5))
      .normalize();
  const heightWaves = 1 + Math.floor(length / 6500),
    hills =
      Math.min(130, (free * 0.12) / (TAU * (heightWaves + 1))) * elevation;
  const base = 90 + hills + Math.max(0, ...shapes.map((shape) => -shape.delta));
  const height = (u) =>
    base +
    hills *
      (0.65 * Math.sin(heightWaves * TAU * u + phase3) +
        0.35 * Math.sin((heightWaves + 1) * TAU * u + phase2));
  const districts = Array.from({ length: slots }, (_, i) => ({
    u: (i + 0.5) / slots,
    direction: ellipseHeading((i + 0.5) / slots),
    length: district,
    shape: shapes[i] ? { ...shapes[i], length: district } : null,
  }));
  const gridAxis = heading(0);
  districts.push(
    { u: 0, direction: gridAxis, length: gridLength, shape: null },
    {
      u: 0.5,
      direction: gridAxis.clone().negate(),
      length: gridLength,
      shape: null,
    },
  );
  let anchorCount = Math.min(
    48,
    Math.max(12, Math.ceil(length / (650 - 240 * bendiness))),
  );
  if (slots)
    anchorCount = Math.max(
      slots * 2,
      Math.ceil(anchorCount / (slots * 2)) * slots * 2,
    );
  else anchorCount += anchorCount % 2;
  return (scale) => {
    const anchors = [];
    for (let i = 0; i < anchorCount; i++) {
      const u = i / anchorCount,
        owned = districts.find((d) => Math.abs(d.u - u) < 1e-8),
        offset = new T.Vector3();
      for (const d of districts)
        if (d.u < u - 1e-8) offset.addScaledVector(d.direction, d.length);
      anchors.push({
        u,
        point: plan(u).multiplyScalar(scale).add(offset).setY(height(u)),
        tangent: owned ? owned.direction : heading(u),
        district: owned,
      });
    }
    const output = collector(),
      step = clamp(length / 145, 55, 145);
    output.add(anchors[0].point, true);
    for (let i = 0; i < anchors.length; i++) {
      const a = anchors[i],
        b = anchors[(i + 1) % anchors.length];
      let end = a.point;
      if (a.district?.shape)
        end = appendBlock(
          output,
          a.district.shape,
          a.point,
          a.tangent,
          'circuit',
        );
      else if (a.district) {
        const divisions = Math.max(3, Math.ceil(a.district.length / step));
        for (let j = 1; j <= divisions; j++)
          output.add(
            a.point
              .clone()
              .addScaledVector(a.tangent, (a.district.length * j) / divisions),
            true,
          );
        end = a.point.clone().addScaledVector(a.tangent, a.district.length);
      }
      appendBezier(
        output,
        end,
        b.point,
        a.tangent,
        b.tangent,
        step,
        i === anchors.length - 1,
        bendiness * clamp(free / 6000, 0.08, 1),
      );
    }
    if (
      output.points.length > 1 &&
      output.points.at(-1).position.distanceTo(output.points[0].position) <
        31 &&
      !output.points.at(-1).important
    )
      output.points.pop();
    return output;
  };
}
function appendWovenConnector(output, a, b, ta, tb, radius, omitEnd) {
  const normal = (t) => new T.Vector3(-t.z, 0, t.x);
  const angle = (p, center) => Math.atan2(p.z - center.z, p.x - center.x);
  const wrap = (r) => T.MathUtils.euclideanModulo(r, TAU);
  let best;
  for (const firstTurn of [-1, 1])
    for (const lastTurn of [-1, 1]) {
      const firstCenter = a
          .clone()
          .addScaledVector(normal(ta), firstTurn * radius),
        lastCenter = b.clone().addScaledVector(normal(tb), lastTurn * radius),
        delta = lastCenter.clone().sub(firstCenter).setY(0),
        distance = delta.length(),
        sine = ((firstTurn - lastTurn) * radius) / distance;
      if (!Number.isFinite(sine) || Math.abs(sine) > 1) continue;
      const heading = Math.atan2(delta.z, delta.x) + Math.asin(sine),
        direction = new T.Vector3(Math.cos(heading), 0, Math.sin(heading)),
        firstJoin = firstCenter
          .clone()
          .addScaledVector(normal(direction), -firstTurn * radius),
        lastJoin = lastCenter
          .clone()
          .addScaledVector(normal(direction), -lastTurn * radius),
        straight = lastJoin.clone().sub(firstJoin).dot(direction);
      if (straight < -0.001) continue;
      const firstAngle = angle(a, firstCenter),
        lastAngle = angle(lastJoin, lastCenter),
        firstArc = wrap(
          firstTurn * (angle(firstJoin, firstCenter) - firstAngle),
        ),
        lastArc = wrap(lastTurn * (angle(b, lastCenter) - lastAngle)),
        total = radius * (firstArc + lastArc) + Math.max(0, straight);
      if (!best || total < best.total)
        best = {
          firstTurn,
          lastTurn,
          firstCenter,
          lastCenter,
          firstJoin,
          lastJoin,
          firstAngle,
          lastAngle,
          firstArc,
          lastArc,
          straight: Math.max(0, straight),
          total,
        };
    }
  if (!best)
    throw new Error(
      'This crossing needs more room for its turnarounds. Try fewer jumps or a longer track.',
    );
  const { total } = best;
  let station = 0;
  const add = (position, at, final = false) => {
    if (omitEnd && final) return;
    position.y = lerp(a.y, b.y, smooth(clamp(at / total, 0, 1)));
    output.add(position);
  };
  const arc = (center, from, radians, turn, final) => {
    const distance = radians * radius;
    const count = Math.max(1, Math.floor(distance / 42));
    for (let i = 1; i <= count; i++) {
      const phi = from + (turn * radians * i) / count;
      add(
        new T.Vector3(
          center.x + Math.cos(phi) * radius,
          0,
          center.z + Math.sin(phi) * radius,
        ),
        station + (distance * i) / count,
        final && i === count,
      );
    }
    station += distance;
  };
  arc(best.firstCenter, best.firstAngle, best.firstArc, best.firstTurn, false);
  const count = Math.max(1, Math.floor(best.straight / 85));
  for (let i = 1; i <= count; i++)
    add(
      best.firstJoin.clone().lerp(best.lastJoin, i / count),
      station + (best.straight * i) / count,
    );
  station += best.straight;
  arc(best.lastCenter, best.lastAngle, best.lastArc, best.lastTurn, true);
}

function createWovenCircuitBuilder(options, random, requestedShapes) {
  const { length, bendiness, elevation, crossovers } = options;
  const gridLength = length < 2400 ? 180 : 240;
  // Each additional pair of waves needs room for its grade transitions and
  // broad turnarounds. Short tracks still get a complete, single overpass.
  const capacity = Math.max(0, Math.floor((length - 5500) / 6000));
  const waves =
    2 +
    2 *
      Math.min(
        options.attempt >= 2 ? 1 : 2,
        Math.floor(capacity * crossovers + 0.00001),
      );
  const ratio = (0.75 + random() * 0.08) / waves;
  const aspect = 0.94 + random() * 0.12;
  const shear = (random() - 0.5) * 0.18;
  const rotation = random() * TAU;
  const flip = random() < 0.5 ? -1 : 1;
  const clearanceHeight = 80 / Math.sin(Math.PI / waves);
  const hill = Math.min(35, length * 0.002) * elevation;
  const shapes = requestedShapes.map((original) => {
    const cap =
      options.jumpSize === 'large'
        ? clamp(length * 0.012, 140, 280)
        : options.jumpSize === 'mixed'
          ? clamp(length * 0.01, 112, 220)
          : 135;
    const shape = shapeFor(Math.min(original.gap, cap), length < 5000);
    const recovery = length < 5000 ? 120 : Math.max(180, -shape.delta * 6);
    const preFlat = length < 5000 ? 0 : 80,
      postReceiver = preFlat;
    return {
      ...shape,
      recovery,
      preFlat,
      postReceiver,
      length:
        preFlat +
        80 +
        shape.gap +
        shape.receiving +
        postReceiver +
        recovery +
        40,
    };
  });
  // Reserve broad, supported approaches at the two outer turnarounds. Crossing
  // districts never contain a jump or its flight/receiving envelope.
  const districtBudget = Math.max(480, length * 0.21);
  while (
    shapes.length > 1 &&
    shapes.reduce((n, s) => n + s.length, 0) > districtBudget
  )
    shapes.pop();
  if (shapes.length && length < 5000) {
    const gap =
      options.jumpSize === 'large'
        ? 140
        : options.jumpSize === 'mixed'
          ? 112
          : 96;
    const shape = shapeFor(gap, true);
    const recovery = 120;
    shapes.splice(0, shapes.length, {
      ...shape,
      preFlat: 0,
      postReceiver: 0,
      recovery,
      length: 80 + gap + shape.receiving + recovery + 40,
    });
  }
  const leftShapes = [],
    rightShapes = [];
  for (let i = 0; i < shapes.length; i++)
    (i % 2 ? rightShapes : leftShapes).push(shapes[i]);
  const leftLength = leftShapes.reduce((n, s) => n + s.length, 0);
  const rightLength =
    gridLength + rightShapes.reduce((n, s) => n + s.length, 0);
  const base =
    120 + clearanceHeight + hill + Math.max(0, ...shapes.map((s) => -s.delta));
  const rotate = (x, z) =>
    new T.Vector3(
      x * Math.cos(rotation) - z * Math.sin(rotation),
      0,
      x * Math.sin(rotation) + z * Math.cos(rotation),
    );
  const plan = (u) => {
    const theta = u * TAU;
    const x = aspect * Math.cos(theta);
    const z = flip * ratio * Math.sin(waves * theta) + shear * x;
    return rotate(x, z);
  };
  const tangent = (u) =>
    plan(u + 1e-5)
      .sub(plan(u - 1e-5))
      .normalize();
  const height = (u) =>
    base + clearanceHeight * Math.sin(TAU * u) + hill * Math.cos(TAU * 2 * u);
  const anchors = [];
  const count = waves * 8;
  for (let i = 1; i < count; i++) {
    const u = i / count;
    // The complete outer half-lobe is replaced by its tangent district. Its
    // neighboring crossing nodes remain explicit, so topology cannot disappear.
    const edge = 1 / (waves * 2);
    if (
      u < edge - 1e-8 ||
      u > 1 - edge + 1e-8 ||
      Math.abs(u - 0.5) < edge - 1e-8
    )
      continue;
    if (Math.abs(u - 0.5) < 1e-8) continue;
    anchors.push({ u });
  }
  anchors.push(
    { u: 0, length: rightLength, shapes: rightShapes, grid: gridLength },
    { u: 0.5, length: leftLength, shapes: leftShapes, grid: 0 },
  );
  anchors.sort((a, b) => a.u - b.u);
  return (scale) => {
    const positioned = anchors.map((a) => {
      const axis = tangent(a.u);
      const center = plan(a.u).multiplyScalar(scale).setY(height(a.u));
      if (a.length)
        center.addScaledVector(rotate(a.u < 0.25 ? 1 : -1, 0), a.length * 0.35);
      return {
        ...a,
        tangent: axis,
        point: center.addScaledVector(axis, -(a.length ?? 0) / 2),
      };
    });
    const output = collector();
    output.add(positioned[0].point, true);
    for (let i = 0; i < positioned.length; i++) {
      const a = positioned[i],
        b = positioned[(i + 1) % positioned.length];
      let end = a.point.clone();
      if (a.grid) {
        for (const at of [80, 160, a.grid].filter((n) => n <= a.grid))
          output.add(end.clone().addScaledVector(a.tangent, at), true);
        end.addScaledVector(a.tangent, a.grid);
      }
      for (const shape of a.shapes ?? [])
        end = appendBlock(output, shape, end, a.tangent, 'circuit');
      const tightRadius = length < 5000 ? (shapes.length ? 90 : 112) : 110;
      const broadening = shapes.length
        ? length < 5000
          ? 0.05
          : 0.25
        : length < 5000
          ? 0.35
          : 1.25;
      appendWovenConnector(
        output,
        end,
        b.point,
        a.tangent,
        b.tangent,
        tightRadius * (1 + broadening * (1 - bendiness)),
        i === positioned.length - 1,
      );
    }
    return output;
  };
}

function createDownhillBuilder(options, random, shapes) {
  const { length, bendiness, elevation } = options;
  const launchGrid = length < 2400 ? 80 : 200;
  const fixed = shapes.reduce((sum, s) => sum + s.length, 0) + 650 + launchGrid;
  const free = Math.max(30, length - fixed);
  const count = Math.min(
    38,
    Math.max(3, Math.round(free / (650 - 300 * bendiness))),
  );
  const weights = Array.from({ length: count }, () => 0.7 + random() * 0.6),
    sum = weights.reduce((a, b) => a + b, 0);
  const phase = random() * TAU,
    phase2 = random() * TAU,
    waves = 1 + Math.floor(random() * 2) + Math.floor(count / 8);
  const targets = Array.from(
    { length: count + 1 },
    (_, i) =>
      Math.sin(phase + (i / count) * TAU * waves) * (0.18 + 0.85 * bendiness) +
      Math.sin(phase2 + (i / count) * TAU * (waves + 1)) * 0.16 * bendiness,
  );
  let amplitude = 1;
  for (let i = 0; i < count; i++)
    amplitude = Math.min(
      amplitude,
      (free * weights[i]) /
        sum /
        (Math.max(0.01, Math.abs(targets[i + 1] - targets[i])) * 190),
    );
  const angles = targets.map((theta) => clamp(theta * amplitude, -1.05, 1.05));
  const rotation = (random() - 0.5) * 1.3;
  const heightWaves = 2 + Math.floor(length / 6500);
  const extra = free * (0.005 + 0.02 * elevation),
    hill = Math.min(120, (free * 0.075) / (TAU * heightWaves + 3)) * elevation;
  const base = 95 + extra + hill + shapes.reduce((sum, s) => sum - s.delta, 0);
  const profile = (u) =>
    -extra * smooth(u) +
    hill *
      Math.sin(Math.PI * u) ** 2 *
      Math.sin(heightWaves * TAU * u + phase2);
  const slots = shapes.map((shape, i) => ({
    shape,
    slot: Math.min(count - 1, Math.floor(((i + 0.5) / shapes.length) * count)),
  }));
  return (scale) => {
    const output = collector();
    let position = new T.Vector3(0, base, 0),
      drops = 0;
    const direction = (theta) =>
      new T.Vector3(Math.sin(theta + rotation), 0, Math.cos(theta + rotation));
    output.add(position, true);
    const gridOrigin = position.clone();
    for (const at of launchGrid > 100 ? [80, 160, launchGrid] : [launchGrid])
      output.add(
        gridOrigin.clone().addScaledVector(direction(angles[0]), at),
        true,
      );
    position = gridOrigin.addScaledVector(direction(angles[0]), launchGrid);
    for (let i = 0; i < count; i++) {
      const distance = (scale * weights[i]) / sum,
        divisions = Math.max(
          2,
          Math.ceil(distance / clamp(length / 145, 55, 145)),
        );
      const start = position.clone(),
        startY = start.y,
        endY = clamp(
          base + drops + profile((i + 1) / count),
          startY - distance * 0.16,
          startY + distance * 0.16,
        );
      // Integrate a smooth heading sweep; zero curvature at each fixed district join.
      let previous = start.clone();
      for (let j = 1; j <= divisions; j++) {
        const f0 = (j - 1) / divisions,
          f1 = j / divisions,
          mid = (f0 + f1) / 2;
        const d0 = direction(lerp(angles[i], angles[i + 1], smooth(f0))),
          dm = direction(lerp(angles[i], angles[i + 1], smooth(mid))),
          d1 = direction(lerp(angles[i], angles[i + 1], smooth(f1)));
        previous = previous
          .clone()
          .addScaledVector(d0, distance / divisions / 6)
          .addScaledVector(dm, ((distance / divisions) * 4) / 6)
          .addScaledVector(d1, distance / divisions / 6);
        previous.y = lerp(startY, endY, smooth(f1));
        output.add(previous);
      }
      position = previous;
      for (const entry of slots.filter((s) => s.slot === i)) {
        position = appendBlock(
          output,
          entry.shape,
          position,
          direction(angles[i + 1]),
          'downhill',
        );
        drops += entry.shape.delta;
      }
    }
    const end = position.clone(),
      axis = direction(angles.at(-1));
    for (const distance of [200, 400, 650])
      output.add(end.clone().addScaledVector(axis, distance), true);
    return output;
  };
}
function publicGeometry(generated, courseType) {
  const points = generated.points.map((p, i) => ({
    id: `point-${i + 1}`,
    x: p.position.x,
    y: p.position.y,
    z: p.position.z,
    bank: 0,
    roll: 0,
  }));
  const curve = routeCurve({ points, courseType }),
    lengths = curve.getLengths(),
    total = lengths.at(-1),
    segments = courseType === 'downhill' ? points.length - 1 : points.length;
  const at = (entry) => {
    const index = generated.points.indexOf(entry),
      u = (index / segments) * (lengths.length - 1),
      low = Math.floor(u);
    return lerp(
      lengths[low],
      lengths[Math.min(low + 1, lengths.length - 1)],
      u - low,
    );
  };
  const jumps = generated.jumps.map((j, i) => ({
    id: `seed-jump-${i + 1}`,
    start: at(j.launch) / total,
    end: at(j.landing) / total,
    receiving: at(j.receiver) - at(j.landing),
    launchPointId: points[generated.points.indexOf(j.launch)].id,
    landingPointId: points[generated.points.indexOf(j.landing)].id,
  }));
  return { points, jumps };
}
function assertLayoutClearance(geometry, options) {
  const curve = routeCurve({ ...geometry, courseType: options.courseType }),
    length = curve.getLength();
  const clearance = (options.width ?? 40) + 40,
    neighbour = Math.max(240, clearance * 2),
    count = Math.ceil(length / 35),
    step = length / count;
  const cells = new Map(),
    closed = options.courseType !== 'downhill',
    woven = closed && options.crossovers > 0;
  const protectedAt = (fraction) =>
    fraction * length < 200 ||
    geometry.jumps.some(
      (j) =>
        fraction * length > j.start * length - 180 &&
        fraction * length < j.end * length + j.receiving + 100,
    );
  for (let i = 0; i < count; i++) {
    const fraction = i / count;
    if (
      !woven &&
      geometry.jumps.some((j) => fraction > j.start && fraction < j.end)
    )
      continue;
    const point = curve.getPointAt(fraction),
      x = Math.floor(point.x / clearance),
      z = Math.floor(point.z / clearance);
    for (let dx = -1; dx <= 1; dx++)
      for (let dz = -1; dz <= 1; dz++)
        for (const other of cells.get(`${x + dx},${z + dz}`) ?? []) {
          const delta = (i - other.index) * step,
            apart = closed ? Math.min(delta, length - delta) : delta;
          if (
            apart > neighbour &&
            Math.hypot(point.x - other.x, point.z - other.z) < clearance &&
            (!woven ||
              Math.abs(point.y - other.y) < 120 ||
              protectedAt(fraction) ||
              protectedAt(other.index / count))
          )
            throw new Error(
              'This variation brings separate road sections too close. Try another variation.',
            );
        }
    const key = `${x},${z}`;
    if (!cells.has(key)) cells.set(key, []);
    cells.get(key).push({ index: i, x: point.x, y: point.y, z: point.z });
  }
}
/** Version3 routes preserve each jump district rigidly while solving only ordinary
 * connector dimensions to the requested physical length. Attempts are explicit,
 * deterministic alternate layouts; a rejected route never becomes a hidden oval. */
export function createSeededLayoutGeometry(options) {
  const normalized = {
    seed: 7,
    length: 3000,
    courseType: 'circuit',
    bendiness: 0.45,
    elevation: 0.35,
    jumpFrequency: 'normal',
    jumpSize: 'mixed',
    attempt: 0,
    ...options,
  };
  const random = randomFor(
    (normalized.seed ^ Math.imul(normalized.attempt, 0x9e3779b9)) >>> 0,
  );
  const shapes = jumpDefinitions(normalized, random);
  const build =
    normalized.courseType === 'downhill'
      ? createDownhillBuilder(normalized, random, shapes)
      : normalized.crossovers > 0
        ? createWovenCircuitBuilder(normalized, random, shapes)
        : createCircuitBuilder(normalized, random, shapes);
  const measure = (scale, coarse = true) => {
    const generated = build(scale);
    const points = generated.points.map((p) => p.position);
    if (points.length < 4) return { length: Infinity, generated };
    const length = routeCurve(
      {
        points: points.map((p) => ({ x: p.x, y: p.y, z: p.z })),
        courseType: normalized.courseType,
      },
      coarse ? 8192 : null,
    ).getLength();
    return { length, generated };
  };
  let low = 1,
    high = normalized.length,
    best;
  for (let i = 0; i < 26; i++) {
    const scale = (low + high) / 2,
      value = measure(scale);
    best = { ...value, scale };
    if (value.length > normalized.length) high = scale;
    else low = scale;
  }
  let scale = best.scale;
  for (let i = 0; i < 6; i++) {
    const value = measure(scale, false);
    best = { ...value, scale };
    const error = normalized.length - value.length;
    if (Math.abs(error) < 0.00001) break;
    const shifted = measure(scale * 1.001, false);
    const derivative = (shifted.length - value.length) / (scale * 0.001);
    if (!Number.isFinite(derivative) || derivative <= 0)
      throw new Error(
        'This route could not reserve enough clear connector space. Try another variation.',
      );
    scale = Math.max(1, scale + error / derivative);
  }
  if (
    Math.abs(best.length - normalized.length) > 0.01 ||
    best.generated.points.length > 256
  )
    throw new Error(
      'This variation cannot fit its bends and jump districts within the selected length. Try another variation or fewer jumps.',
    );
  const geometry = publicGeometry(best.generated, normalized.courseType);
  if (
    geometry.points.some(
      (p) =>
        Math.abs(p.x) > 25000 || Math.abs(p.z) > 25000 || p.y < 0 || p.y > 3000,
    )
  )
    throw new Error(
      'This variation leaves the supported world bounds. Try another variation.',
    );
  assertLayoutClearance(geometry, normalized);
  return geometry;
}
