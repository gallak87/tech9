import * as T from 'three';
import { routeCurve } from './route.js';

const TAU = Math.PI * 2;
const clamp = T.MathUtils.clamp;
const lerp = T.MathUtils.lerp;
const smooth = (t) => t * t * (3 - 2 * t);

function randomFor(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = Math.imul(state ^ (state >>> 15), state | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function jumpShape(gap, random, short = false) {
  const pitch = T.MathUtils.degToRad(
    short ? 2 : 4 + clamp((gap - 96) / 384, 0, 1) * 8 + (random() - 0.5) * 0.7,
  );
  // Give the slower stock cruise a complete-hull margin inside the receiver.
  // The saved road supplies the actual ramp/drop; there is no launch impulse.
  const flightRange = gap + (short ? 15 : 65);
  const time = flightRange / (101 * Math.cos(pitch));
  const drop = Math.max(9, 13 * time * time - Math.tan(pitch) * flightRange);
  return {
    gap,
    pitch,
    drop,
    receiving: short
      ? 160
      : clamp(gap * 1.5 + 120 + Math.max(0, gap - 200) * 0.8, 240, 1150),
  };
}

function collector() {
  const points = [];
  function add(position, important = false) {
    const previous = points.at(-1);
    if (previous && position.distanceTo(previous.position) < 30.5) {
      if (!important) return previous;
      if (!previous.important) points.pop();
    }
    const point = { position: position.clone(), important };
    points.push(point);
    return point;
  }
  return { points, add };
}

function createDownhill(options, random) {
  const { length, bendiness, elevation } = options;
  const count = length < 10000 ? 3 : 4,
    short = length < 2400;
  const baseGap = clamp(96 + (length - 1800) * 0.025, 96, 480);
  const shapes = Array.from({ length: count }, () =>
    jumpShape(short ? 96 : baseGap * (0.95 + random() * 0.1), random, short),
  );
  const runout = 650,
    active = length - runout;
  const used = shapes.reduce(
    (sum, jump) => sum + 80 + jump.gap + jump.receiving,
    0,
  );
  const spare = active - used - 120;
  if (spare < 0)
    throw new Error('This descent is too short for its seeded jump receivers');
  const free = spare + 120,
    extraDrop = Math.min(length * 0.04 * (0.6 + elevation), free * 0.15);
  const slope = extraDrop / free;
  let position = new T.Vector3(
    0,
    60 +
      extraDrop +
      shapes.reduce((sum, j) => sum + j.drop - Math.tan(j.pitch) * 80, 0),
    0,
  );
  const { points, add } = collector(),
    jumps = [];
  add(position, true);
  const share = spare / (count + 1),
    phase = random() * TAU;
  const amplitude = share < 140 ? 0 : Math.min(600, share * 0.2) * bendiness;
  function connect(distance, x) {
    const target = new T.Vector3(
      x,
      position.y - slope * distance,
      position.z + distance,
    );
    const control = distance * 0.4;
    const curve = new T.CubicBezierCurve3(
      position.clone(),
      position.clone().add(new T.Vector3(0, -slope * control, control)),
      target.clone().add(new T.Vector3(0, slope * control, -control)),
      target,
    );
    const divisions = Math.max(1, Math.ceil(curve.getLength() / 180));
    for (let i = 1; i <= divisions; i++) add(curve.getPointAt(i / divisions));
    position = target;
  }
  for (let i = 0; i < shapes.length; i++) {
    const shape = shapes[i];
    connect((i ? 0 : 80) + share, amplitude * Math.sin(phase + (i + 1) * 1.7));
    const pre = position.clone(),
      lip = pre.clone().add(new T.Vector3(0, Math.tan(shape.pitch) * 80, 80));
    add(pre.clone().lerp(lip, 0.5));
    const launch = add(lip, true);
    add(
      lip
        .clone()
        .add(
          new T.Vector3(
            0,
            (Math.tan(shape.pitch) * shape.gap) / 3,
            shape.gap / 3,
          ),
        ),
    );
    const landingPosition = lip
      .clone()
      .add(new T.Vector3(0, -shape.drop, shape.gap));
    add(landingPosition.clone().add(new T.Vector3(0, 0, -shape.gap / 3)));
    const landing = add(landingPosition, true);
    add(landingPosition.clone().add(new T.Vector3(0, 0, shape.receiving / 2)));
    position = landingPosition
      .clone()
      .add(new T.Vector3(0, 0, shape.receiving));
    const receiver = add(position, true);
    jumps.push({ launch, landing, receiver });
  }
  connect(40 + share, 0);
  const end = position.clone();
  for (const distance of [200, 400, 650])
    add(end.clone().add(new T.Vector3(0, 0, distance)), true);
  return { points, jumps };
}

function createCircuit(options, random) {
  const { length, bendiness, elevation } = options;
  const count = length <= 3000 ? 1 : 2;
  const radius =
    Math.min(400, Math.max(120, length * 0.065)) * (0.98 + random() * 0.04);
  const straight = (length - TAU * radius) / 2,
    arc = Math.PI * radius;
  const base = 110 + elevation * 65;
  const gap = clamp(96 + (length - 1800) * 0.04, 96, 250);
  const definitions = Array.from({ length: count }, (_, i) => {
    const shape = jumpShape(
      gap * (0.97 + random() * 0.06),
      random,
      length < 2400,
    );
    const takeoff =
      Math.max(180, (straight - shape.gap - shape.receiving) * 0.5) +
      i * (straight + arc);
    const landing = takeoff + shape.gap,
      receiver = landing + shape.receiving;
    return {
      ...shape,
      takeoff,
      landing,
      receiver,
      recover: Math.min(receiver + 250, (i + 1) * (straight + arc) - 60),
    };
  });
  function planAt(s) {
    if (s <= straight) return new T.Vector3(-radius, 0, -straight / 2 + s);
    if (s < straight + arc) {
      const angle = Math.PI - (s - straight) / radius;
      return new T.Vector3(
        radius * Math.cos(angle),
        0,
        straight / 2 + radius * Math.sin(angle),
      );
    }
    if (s <= straight * 2 + arc)
      return new T.Vector3(radius, 0, straight / 2 - (s - straight - arc));
    const angle = -(s - straight * 2 - arc) / radius;
    return new T.Vector3(
      radius * Math.cos(angle),
      0,
      -straight / 2 + radius * Math.sin(angle),
    );
  }
  function heightAt(s) {
    for (const j of definitions) {
      const lip = base + 10,
        landing = lip - j.drop;
      if (s >= j.takeoff - 80 && s <= j.takeoff)
        return lip + Math.tan(j.pitch) * (s - j.takeoff);
      if (s > j.takeoff && s < j.landing) {
        if (s <= j.takeoff + j.gap / 3)
          return lip + Math.tan(j.pitch) * (s - j.takeoff);
        if (s < j.takeoff + (j.gap * 2) / 3)
          return lerp(
            lip + (Math.tan(j.pitch) * j.gap) / 3,
            landing,
            (s - j.takeoff - j.gap / 3) / (j.gap / 3),
          );
        return landing;
      }
      if (s >= j.landing && s <= j.receiver) return landing;
      if (s > j.receiver && s < j.recover)
        return lerp(
          landing,
          base,
          smooth((s - j.receiver) / (j.recover - j.receiver)),
        );
    }
    return base;
  }
  const reserved = definitions.flatMap((j) => [
    j.takeoff - 80,
    j.takeoff,
    j.takeoff + j.gap / 3,
    j.takeoff + (j.gap * 2) / 3,
    j.landing,
    j.landing + j.receiving / 2,
    j.receiver,
    (j.receiver + j.recover) / 2,
    j.recover,
  ]);
  const stations = new Set([0, ...reserved]);
  const boundaries = [0, straight, straight + arc, straight * 2 + arc, length];
  for (let segment = 0; segment < 4; segment++) {
    const from = boundaries[segment],
      to = boundaries[segment + 1],
      count = Math.max(4, Math.ceil((to - from) / (segment % 2 ? 65 : 180)));
    for (let i = 0; i <= count; i++) {
      const s = lerp(from, to, i / count);
      if (
        s >= length - 1 ||
        definitions.some((j) => s >= j.takeoff - 80 && s <= j.recover) ||
        reserved.some((r) => Math.abs(r - s) < 34)
      )
        continue;
      stations.add(s);
    }
  }
  const { points, add } = collector(),
    records = [];
  for (const s of [...stations].sort((a, b) => a - b)) {
    const point = add(planAt(s).setY(heightAt(s)), reserved.includes(s));
    for (let i = 0; i < definitions.length; i++) {
      const j = definitions[i];
      records[i] ??= {};
      if (s === j.takeoff) records[i].launch = point;
      if (s === j.landing) records[i].landing = point;
      if (s === j.receiver) records[i].receiver = point;
    }
  }
  // Bendiness changes the plan without breaking the parallel launch/receiver
  // straights; all final geometry is persisted rather than regenerated later.
  for (const p of points) p.position.x *= 0.95 + bendiness * 0.1;
  return { points, jumps: records };
}

/** Deterministic, editable jump districts with physical stock-speed geometry. */
export function createSeededCourseGeometry(options) {
  const random = randomFor(options.seed),
    generated =
      options.courseType === 'downhill'
        ? createDownhill(options, random)
        : createCircuit(options, random);
  const angle = (random() - 0.5) * 0.3,
    rotation = new T.Quaternion().setFromAxisAngle(
      new T.Vector3(0, 1, 0),
      angle,
    );
  generated.points.forEach((entry, index) => {
    entry.position.applyQuaternion(rotation);
    entry.id = `point-${index + 1}`;
  });
  const points = generated.points.map(({ position, id }) => ({
    id,
    x: position.x,
    y: position.y,
    z: position.z,
    bank: 0,
    roll: 0,
  }));
  const doc = { points, courseType: options.courseType };
  for (let pass = 0; pass < 7; pass++) {
    const scale =
      options.length / routeCurve(doc, pass < 5 ? 8192 : null).getLength();
    for (const p of points) {
      p.x *= scale;
      p.z *= scale;
    }
  }
  const curve = routeCurve(doc),
    lengths = curve.getLengths(),
    total = lengths.at(-1),
    segments =
      options.courseType === 'downhill' ? points.length - 1 : points.length;
  const at = (entry) => {
    const index = points.findIndex((p) => p.id === entry.id),
      p = (index / segments) * (lengths.length - 1),
      low = Math.floor(p);
    return lerp(
      lengths[low],
      lengths[Math.min(low + 1, lengths.length - 1)],
      p - low,
    );
  };
  const jumps = generated.jumps.map((j, index) => ({
    id: `seed-jump-${index + 1}`,
    start: at(j.launch) / total,
    end: at(j.landing) / total,
    receiving: at(j.receiver) - at(j.landing),
    launchPointId: j.launch.id,
    landingPointId: j.landing.id,
  }));
  return { points, jumps };
}
