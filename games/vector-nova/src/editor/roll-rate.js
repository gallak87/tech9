import { createRouteSampler } from './route.js';

export const EDITOR_ROLL_RATE_LIMIT = 0.025;

export function rollRateGrid(length) {
  const count = Math.ceil(length / 3);
  return { count, step: length / count };
}

export function measuresRollEdge(index, grid, closed, isGap) {
  return (closed || index < grid.count - 1) && !isGap(index * grid.step);
}

export function editorRollRate(from, to, step) {
  const delta = to - from;
  return Math.abs(Math.atan2(Math.sin(delta), Math.cos(delta))) / step;
}

export function appendFastRollEdge(sections, index, count) {
  const start = index / count;
  const end = (index + 1) / count;
  const previous = sections.at(-1);
  if (previous?.end === start) previous.end = end;
  else sections.push({ start, end });
}

/** A roll gesture leaves geometry and automatic banking fixed. Evaluate only
 * edges influenced by the edited controls or a changed circuit return. */
export function createRollRatePreview(doc, selectedIndices) {
  const route = createRouteSampler(doc);
  const grid = rollRateGrid(route.length);
  const { stations, reader } = route.prepareRollSamples(grid.count, grid.step);
  const base = reader(doc.points);
  const selected = new Set(selectedIndices);
  const last = doc.points.length - 1;
  const gaps = (doc.jumps ?? []).map(({ start, end }) => ({
    takeoff: start * route.length,
    landing: end * route.length,
  }));
  const isGap = (distance) =>
    gaps.some(
      ({ takeoff, landing }) => distance > takeoff && distance < landing,
    );
  const next = (index) => (index + 1) % grid.count;
  const isFast = (angles, index, end) =>
    editorRollRate(angles.at(index), angles.at(end), grid.step) >
    EDITOR_ROLL_RATE_LIMIT;
  const touchesSelected = stations.map(
    ({ node }) =>
      selected.has(node) || selected.has((node + 1) % doc.points.length),
  );
  const edges = [];
  for (let index = 0; index < grid.count; index++) {
    if (!measuresRollEdge(index, grid, route.closed, isGap)) continue;
    const end = next(index);
    const startSample = stations[index];
    const endSample = stations[end];
    edges.push({
      index,
      end,
      affected: touchesSelected[index] || touchesSelected[end],
      distance: Math.max(startSample.distance, endSample.distance),
      seam: startSample.node === last || endSample.node === last,
      fast: isFast(base, index, end),
    });
  }
  return (points) => {
    const angles = reader(points);
    const changesClosingEdge =
      Boolean(angles.closure) !== Boolean(base.closure);
    const returnChanged =
      angles.closure?.start !== base.closure?.start ||
      angles.closure?.angle !== base.closure?.angle;
    const returnStart = returnChanged
      ? Math.min(
          angles.closure?.start ?? Infinity,
          base.closure?.start ?? Infinity,
        )
      : Infinity;
    const sections = [];
    for (const { index, end, affected, distance, seam, fast } of edges) {
      const changed =
        affected || distance >= returnStart || (changesClosingEdge && seam);
      if (changed ? isFast(angles, index, end) : fast)
        appendFastRollEdge(sections, index, grid.count);
    }
    return sections;
  };
}
