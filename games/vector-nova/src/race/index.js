export function createRace(
  track,
  { rulesId = 'magnetic-v3-assist-0.3', untimed = false } = {},
) {
  const count = track.checkpoints?.length || 12;
  const positions = Array.from(
    { length: count },
    (_, index) =>
      track.checkpoints?.[index]?.distance ??
      track.checkpoints?.[index]?.s ??
      (index * track.length) / count,
  );
  const completedTransfers = new Set();
  const epsilon = 1e-5;
  return {
    rulesId,
    lap: 1,
    checkpoint: 0,
    elapsed: 0,
    lastLap: null,
    best: null,
    valid: !untimed,
    complete: false,
    startDistance: 0,
    history: [],
    placeScenario(distance) {
      const base = Math.floor(distance / track.length) * track.length;
      const local = distance - base;
      this.checkpoint = positions.findLastIndex(
        (position) => position <= local + epsilon,
      );
      this.startDistance = base + positions[this.checkpoint];
      this.valid = !untimed && distance === 0;
    },
    step(previous, current, dt, vehicleEvents = []) {
      this.elapsed += dt;
      const events = [];
      if (current <= previous) return events;
      // Only the matching authored takeoff can transfer progress over a gap.
      // Holding distance in flight ensures missing a road never awards its CP.
      for (const jump of track.jumps || []) {
        for (
          let cycle = Math.floor(previous / track.length);
          cycle <= Math.floor(current / track.length);
          cycle++
        ) {
          const base = cycle * track.length;
          const takeoff = base + jump.takeoff;
          if (previous > takeoff + epsilon || current <= takeoff + epsilon)
            continue;
          const transfer = vehicleEvents.find(
            (event) =>
              event.type === 'jump-transfer' && event.payload.id === jump.id,
          )?.payload;
          // Optional authored bypasses retain an ordinary supported road.
          // Only a real transfer takes the constrained airborne credit path.
          if (jump.optional && !transfer) continue;
          const key = `${cycle}:${jump.id}`;
          const target = current - base;
          const allowed =
            transfer &&
            Math.abs(previous - takeoff) < epsilon &&
            Math.abs(transfer.from - previous) < epsilon &&
            Math.abs(transfer.to - current) < epsilon &&
            !completedTransfers.has(key) &&
            ((transfer.outcome === 'landed' &&
              target >= jump.landingStart - epsilon &&
              target <= jump.landingEnd + epsilon) ||
              (transfer.outcome === 'recovered' &&
                Math.abs(target - jump.recovery) < epsilon));
          if (!allowed) {
            this.valid = false;
            return events;
          }
          const credited = positions.filter(
            (position) =>
              position > jump.takeoff && position <= target + epsilon,
          );
          if (
            credited.length !== 1 ||
            Math.abs(credited[0] - jump.landingStart) > epsilon
          ) {
            this.valid = false;
            return events;
          }
          completedTransfers.add(key);
        }
      }
      const firstCycle = Math.floor(previous / track.length);
      const finalCycle = Math.floor(current / track.length);
      for (let cycle = firstCycle; cycle <= finalCycle; cycle++) {
        for (let index = 0; index < count; index++) {
          const crossing = cycle * track.length + positions[index];
          if (crossing <= previous || crossing > current) continue;
          if (index !== (this.checkpoint + 1) % count) {
            this.valid = false;
            continue;
          }
          this.checkpoint = index;
          this.startDistance = crossing;
          events.push({
            type: 'checkpoint',
            payload: { index, lapTime: this.elapsed },
          });
          if (index === 0) {
            this.lastLap = this.elapsed;
            this.history.push({
              duration: this.elapsed,
              valid: this.valid,
              rulesId,
            });
            if (this.valid && (!this.best || this.elapsed < this.best))
              this.best = this.elapsed;
            events.push({
              type: 'lap',
              payload: { duration: this.elapsed, valid: this.valid, rulesId },
            });
            this.lap++;
            this.elapsed = 0;
            this.valid = !untimed;
            for (const key of completedTransfers)
              if (+key.split(':')[0] < cycle) completedTransfers.delete(key);
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
