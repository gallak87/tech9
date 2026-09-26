const dot = (p, gate) =>
  (p.x - gate.x) * Math.sin(gate.heading) -
  (p.z - gate.z) * Math.cos(gate.heading);
/** Directional swept gates; only the next gate may be awarded. */
export function crossesGate(before, after, gate) {
  const a = dot(before, gate),
    b = dot(after, gate);
  if (!(a <= 0 && b > 0)) return false;
  const t = -a / (b - a),
    x = before.x + (after.x - before.x) * t - gate.x,
    z = before.z + (after.z - before.z) * t - gate.z;
  return (
    Math.abs(x * Math.cos(gate.heading) + z * Math.sin(gate.heading)) <=
    gate.width / 2
  );
}
export class TrialRules {
  constructor(route, vehicle) {
    this.route = route;
    this.vehicle = vehicle;
    this.reset();
  }
  reset() {
    this.nextGate = 0;
    this.elapsed = 0;
    this.penalties = 0;
    this.finished = false;
    this.recoveries = 0;
  }
  update(dt, before, after) {
    if (this.finished) return false;
    this.elapsed += Math.max(0, dt);
    if (crossesGate(before, after, this.route.gates[this.nextGate])) {
      this.nextGate++;
      if (this.nextGate === this.route.gates.length) this.finished = true;
      return true;
    }
    return false;
  }
  recover() {
    if (!this.finished) {
      this.penalties += 5;
      this.recoveries++;
    }
  }
  result() {
    const time = this.elapsed + this.penalties;
    const thresholds = this.route.medals[this.vehicle];
    return {
      time,
      drivingTime: this.elapsed,
      penalties: this.penalties,
      recoveries: this.recoveries,
      medal:
        time <= thresholds[0]
          ? 'gold'
          : time <= thresholds[1]
            ? 'silver'
            : time <= thresholds[2]
              ? 'bronze'
              : 'finished',
    };
  }
  snapshot() {
    return {
      nextGate: this.nextGate,
      totalGates: this.route.gates.length,
      elapsed: this.elapsed,
      penalties: this.penalties,
      finished: this.finished,
    };
  }
}
export function loadRecords(storage) {
  try {
    const value = JSON.parse(
      storage.getItem('trail-driving.records.v1') || '{}',
    );
    if (!value || Array.isArray(value) || typeof value !== 'object') return {};
    return Object.fromEntries(
      Object.entries(value).filter(
        ([key, v]) =>
          /^(jeep|atv|bike):[a-z-]+$/.test(key) &&
          v &&
          Number.isFinite(v.time) &&
          v.time > 0 &&
          ['gold', 'silver', 'bronze', 'finished'].includes(v.medal),
      ),
    );
  } catch {
    return {};
  }
}
export function saveResult(records, vehicle, route, result, storage) {
  const key = `${vehicle}:${route}`;
  const best = !records[key] || result.time < records[key].time;
  if (best) records[key] = { time: result.time, medal: result.medal };
  let saved = true;
  try {
    storage.setItem('trail-driving.records.v1', JSON.stringify(records));
  } catch {
    saved = false;
  }
  return { best, saved };
}
export const formatTime = (s) =>
  `${Math.floor(s / 60)
    .toString()
    .padStart(2, '0')}:${(s % 60).toFixed(2).padStart(5, '0')}`;
