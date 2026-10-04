// Keep recent passage history so relative gaps compare the same course point.
// A current-speed estimate or subtraction of lap clocks is not a race gap.
export function createRelativeTiming(
  ids,
  { interval = 0.1, window = 180 } = {},
) {
  let records = {};
  function reset(distances) {
    records = Object.fromEntries(
      ids.map((id) => [
        id,
        {
          current: [distances[id], 0],
          samples: [[distances[id], 0]],
        },
      ]),
    );
  }
  function update(id, distance, time) {
    const record = records[id];
    if (!record || !Number.isFinite(distance) || !Number.isFinite(time)) return;
    if (distance < record.current[0] || time < record.current[1]) {
      // Recovery/reversal must not invent a passage through skipped road.
      record.samples = [[distance, time]];
    } else if (
      time - record.samples.at(-1)[1] >= interval &&
      distance > record.samples.at(-1)[0]
    ) {
      record.samples.push([distance, time]);
    }
    record.current = [distance, time];
    const cutoff = time - window;
    while (record.samples.length > 2 && record.samples[1][1] < cutoff)
      record.samples.shift();
  }
  function gap(leader, follower, time) {
    const record = records[leader],
      target = records[follower]?.current[0];
    if (
      !record ||
      target === undefined ||
      target < record.samples[0][0] ||
      target > record.current[0]
    )
      return null;
    if (target === record.current[0]) return 0;
    const samples = record.samples;
    let low = 0,
      high = samples.length;
    while (low < high) {
      const middle = Math.floor((low + high) / 2);
      if (samples[middle][0] < target) low = middle + 1;
      else high = middle;
    }
    const next = samples[low] ?? record.current;
    const previous = samples[Math.max(0, low - 1)];
    const span = next[0] - previous[0];
    const passage =
      span > 0
        ? previous[1] +
          ((next[1] - previous[1]) * (target - previous[0])) / span
        : next[1];
    return Math.max(0, time - passage);
  }
  function restore(saved) {
    const point = (value) =>
      Array.isArray(value) &&
      value.length === 2 &&
      value.every(Number.isFinite) &&
      value[1] >= 0;
    if (
      !saved ||
      Object.keys(saved).length !== ids.length ||
      !ids.every((id) => {
        const record = saved[id];
        return (
          record &&
          point(record.current) &&
          Array.isArray(record.samples) &&
          record.samples.length > 0 &&
          record.samples.length <= Math.ceil(window / interval) + 2 &&
          record.samples.every(
            (sample, index) =>
              point(sample) &&
              sample[0] <= record.current[0] &&
              sample[1] <= record.current[1] &&
              (!index ||
                (sample[0] > record.samples[index - 1][0] &&
                  sample[1] >= record.samples[index - 1][1])),
          )
        );
      })
    )
      throw new Error('Relative timing state mismatch');
    records = structuredClone(saved);
  }
  return {
    reset,
    update,
    gap,
    restore,
    serialize: () => structuredClone(records),
  };
}
