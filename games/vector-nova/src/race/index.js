import { courseIdentity, sprintRunoutControl } from './course.js';
import { landingZoneEnd } from '../physics/landing-zone.js';

export function createRace(
  track,
  {
    rulesId = 'magnetic-v3-assist-0.3',
    untimed = false,
    laps = Infinity,
    continuous = false,
  } = {},
) {
  const sprint = track.closed === false;
  const precise = continuous || Number.isFinite(laps);
  const course = courseIdentity(track);
  const count = track.checkpoints?.length || 12;
  const positions = Array.from(
    { length: count },
    (_, index) =>
      track.checkpoints?.[index]?.distance ??
      track.checkpoints?.[index]?.s ??
      (index * track.length) / count,
  );
  if (
    sprint &&
    (!Number.isFinite(track.finishDistance) ||
      track.finishDistance <= 0 ||
      track.finishDistance >= track.length ||
      positions[0] !== 0 ||
      positions.at(-1) !== track.finishDistance)
  )
    throw new Error(
      'Sprint needs start, terminal checkpoint and supported runout',
    );
  const epsilon = 1e-5;
  return {
    rulesId: sprint
      ? `${rulesId}:sprint-v${course.version}:${track.finishDistance}:${track.length}`
      : rulesId,
    course,
    completedTransfers: [],
    runoutControl(state, input) {
      return sprint && this.complete
        ? sprintRunoutControl(track, state)
        : input;
    },
    lap: 1,
    checkpoint: 0,
    elapsed: 0,
    lastLap: null,
    best: null,
    valid: !untimed,
    complete: false,
    startDistance: 0,
    history: [],
    splits: [],
    completedTime: 0,
    get totalElapsed() {
      return (
        (continuous
          ? this.completedTime
          : this.history.reduce((sum, lap) => sum + lap.duration, 0)) +
        (this.complete ? 0 : this.elapsed)
      );
    },
    placeScenario(distance) {
      const base = sprint
        ? 0
        : Math.floor(distance / track.length) * track.length;
      const local = distance - base;
      this.checkpoint = Math.max(
        0,
        positions.findLastIndex((position) => position <= local + epsilon),
      );
      this.startDistance = base + positions[this.checkpoint];
      this.valid = !untimed && distance === 0;
    },
    step(previous, current, dt, vehicleEvents = [], { grounded = true } = {}) {
      if (this.complete) return [];
      const beforeTime = this.elapsed;
      const beforeTotal = this.totalElapsed;
      let lastCrossingTime = 0;
      this.elapsed += dt;
      const events = [];
      if (current <= previous) return events;
      // Only the matching authored takeoff can transfer progress over a gap.
      // Holding distance in flight ensures missing a road never awards its CP.
      for (const jump of track.jumps || []) {
        for (
          let cycle = sprint
            ? 0
            : Math.max(0, Math.floor(previous / track.length));
          cycle <= (sprint ? 0 : Math.floor(current / track.length));
          cycle++
        ) {
          const base = cycle * track.length;
          const takeoff = base + jump.takeoff;
          if (previous > takeoff + epsilon || current <= takeoff + epsilon)
            continue;
          const equipmentTransfer = vehicleEvents.find(
            (event) =>
              event.type === 'jump-transfer' &&
              event.payload.id === 'equipment-jump' &&
              event.payload.outcome === 'landed' &&
              Math.abs(event.payload.from - previous) < epsilon &&
              Math.abs(event.payload.to - current) < epsilon,
          )?.payload;
          const transfer = vehicleEvents.find(
            (event) =>
              event.type === 'jump-transfer' && event.payload.id === jump.id,
          )?.payload;
          // Optional authored bypasses retain an ordinary supported road.
          // Only a real transfer takes the constrained airborne credit path.
          if (jump.optional && !transfer) continue;
          const key = `${cycle}:${jump.id}`;
          const target = current - base;
          const equipmentAllowed =
            equipmentTransfer &&
            current - previous <= 1000 &&
            target >= jump.landingStart - epsilon &&
            target <= landingZoneEnd(track, jump) + epsilon &&
            !this.completedTransfers.includes(key);
          const allowed =
            equipmentAllowed ||
            (transfer &&
              Math.abs(previous - takeoff) < epsilon &&
              Math.abs(transfer.from - previous) < epsilon &&
              Math.abs(transfer.to - current) < epsilon &&
              !this.completedTransfers.includes(key) &&
              ((transfer.outcome === 'landed' &&
                target >= jump.landingStart - epsilon &&
                target <= landingZoneEnd(track, jump) + epsilon) ||
                (transfer.outcome === 'recovered' &&
                  Math.abs(target - jump.recovery) < epsilon)));
          if (!allowed) {
            this.valid = false;
            return events;
          }
          const credited = positions.filter(
            (position) =>
              position > jump.takeoff && position <= target + epsilon,
          );
          if (
            credited.length === 0 ||
            Math.abs(credited[0] - jump.landingStart) > epsilon
          ) {
            this.valid = false;
            return events;
          }
          this.completedTransfers.push(key);
        }
      }
      const firstCycle = sprint
        ? 0
        : Math.max(0, Math.floor(previous / track.length));
      const finalCycle = sprint ? 0 : Math.floor(current / track.length);
      for (let cycle = firstCycle; cycle <= finalCycle; cycle++) {
        for (let index = 0; index < count; index++) {
          const crossing = cycle * track.length + positions[index];
          if (crossing <= previous || crossing > current) continue;
          // Rear-grid travel (or a hull settling behind zero) belongs to lap 1.
          // Crossing the start is not a completed lap or skipped checkpoint;
          // the clock still includes all time spent reaching the line.
          if (
            cycle === 0 &&
            index === 0 &&
            this.checkpoint === 0 &&
            this.history.length === 0
          )
            continue;
          if (index !== (this.checkpoint + 1) % count) {
            this.valid = false;
            continue;
          }
          if (sprint && index === count - 1 && !grounded) {
            this.valid = false;
            continue;
          }
          const crossingTime =
            (dt * (crossing - previous)) / (current - previous);
          if (precise)
            this.splits.push(
              continuous
                ? (lastCrossingTime ? 0 : beforeTime) +
                    crossingTime -
                    lastCrossingTime
                : beforeTotal + crossingTime,
            );
          this.checkpoint = index;
          this.startDistance = crossing;
          events.push({
            type: 'checkpoint',
            payload: { index, lapTime: this.elapsed },
          });
          if (sprint && index === count - 1) {
            this.elapsed =
              beforeTime + (dt * (crossing - previous)) / (current - previous);
            this.complete = true;
            this.lastLap = this.elapsed;
            if (this.valid) this.best = this.elapsed;
            const result = {
              duration: this.elapsed,
              valid: this.valid,
              rulesId: this.rulesId,
            };
            this.history.push(result);
            events.push({ type: 'sprint-complete', payload: { ...result } });
            return events;
          }
          if (index === 0) {
            if (precise)
              this.elapsed =
                (lastCrossingTime ? 0 : beforeTime) +
                crossingTime -
                lastCrossingTime;
            this.lastLap = this.elapsed;
            this.history.push({
              duration: this.elapsed,
              valid: this.valid,
              rulesId,
              ...(continuous ? { splits: this.splits.slice() } : {}),
            });
            if (continuous) {
              this.completedTime += this.elapsed;
              this.history.splice(0, this.history.length - 1);
              this.splits.length = 0;
            }
            if (this.valid && (!this.best || this.elapsed < this.best))
              this.best = this.elapsed;
            events.push({
              type: 'lap',
              payload: { duration: this.elapsed, valid: this.valid, rulesId },
            });
            this.lap++;
            this.elapsed = precise ? dt - crossingTime : 0;
            lastCrossingTime = crossingTime;
            if (this.lap > laps) {
              this.complete = true;
              this.elapsed = 0;
              return events;
            }
            this.valid = !untimed;
            this.completedTransfers = this.completedTransfers.filter(
              (key) => +key.split(':')[0] >= cycle,
            );
          }
        }
      }
      return events;
    },
    recover() {
      this.valid = false;
      return this.startDistance;
    },
  };
}
