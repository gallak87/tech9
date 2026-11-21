import { DOCUMENT_LIMITS } from './document.js';

const wrap = (index, count) => ((index % count) + count) % count;

export function selectPointSpan(points, start, end = start, active = end) {
  const anchorId = points[start]?.id ?? null;
  const activeId = points[active]?.id ?? null;
  if (!anchorId || !activeId)
    return { ids: [], anchorId: null, activeId: null };
  const ids = points
    .slice(Math.min(start, end), Math.max(start, end) + 1)
    .map(({ id }) => id);
  return { ids, anchorId, activeId };
}

export function changePointSelection(
  points,
  selection,
  index,
  { extend = false, toggle = false, preserve = false, stepDirection = 0 } = {},
) {
  const id = points[index]?.id;
  if (!id) return selectPointSpan(points, -1);
  if (preserve && selection.ids.includes(id))
    return { ...selection, activeId: id };
  if (extend) {
    const anchor = points.findIndex((point) => point.id === selection.anchorId);
    if (anchor >= 0) {
      const active = points.findIndex(
        (point) => point.id === selection.activeId,
      );
      if (stepDirection && active >= 0) {
        const count = points.length;
        const direction = Math.sign(stepDirection);
        const previousOffset = selection.direction
          ? selection.direction *
            wrap((active - anchor) * selection.direction, count)
          : active - anchor;
        const steps = wrap((index - active) * direction, count);
        const offset = Math.max(
          1 - count,
          Math.min(count - 1, previousOffset + direction * steps),
        );
        const travel = Math.sign(offset);
        return {
          ids: Array.from(
            { length: Math.abs(offset) + 1 },
            (_, i) => points[wrap(anchor + i * travel, count)].id,
          ),
          anchorId: selection.anchorId,
          activeId: points[wrap(anchor + offset, count)].id,
          direction: travel,
        };
      }
      return selectPointSpan(points, anchor, index);
    }
  }
  if (toggle) {
    if (!selection.ids.includes(id))
      return { ids: [...selection.ids, id], anchorId: id, activeId: id };
    const ids = selection.ids.filter((member) => member !== id);
    const activeId = ids.includes(selection.activeId)
      ? selection.activeId
      : (ids.at(-1) ?? null);
    const anchorId = ids.includes(selection.anchorId)
      ? selection.anchorId
      : activeId;
    return { ids, anchorId, activeId };
  }
  return selectPointSpan(points, index);
}

export function reconcilePointSelection(points, selection, fallback = -1) {
  const current = new Set(points.map(({ id }) => id));
  const ids = selection.ids.filter((id) => current.has(id));
  if (!ids.length)
    return selectPointSpan(points, selection.ids.length ? fallback : -1);
  const activeId = ids.includes(selection.activeId)
    ? selection.activeId
    : ids[0];
  const anchorId = ids.includes(selection.anchorId)
    ? selection.anchorId
    : activeId;
  const reconciled = { ids, anchorId, activeId };
  if (!selection.direction) return reconciled;
  const anchor = points.findIndex(({ id }) => id === anchorId);
  const remainsStepped = ids.every(
    (id, offset) =>
      points[wrap(anchor + offset * selection.direction, points.length)].id ===
      id,
  );
  return remainsStepped
    ? { ...reconciled, direction: selection.direction }
    : reconciled;
}

export function pointSelectionIndices(points, selection) {
  const selected = new Set(selection.ids);
  return points.flatMap(({ id }, index) => (selected.has(id) ? [index] : []));
}

export function selectedPointRange(points, selection) {
  if (selection.direction) {
    const anchor = points.findIndex(({ id }) => id === selection.anchorId);
    const end = anchor + (selection.ids.length - 1) * selection.direction;
    if (end < 0 || end >= points.length) return null;
  }
  const indices = pointSelectionIndices(points, selection);
  const start = indices[0],
    end = indices.at(-1);
  return indices.length > 1 && end - start + 1 === indices.length
    ? { start, end }
    : null;
}

const axisLimits = {
  x: [-DOCUMENT_LIMITS.coordinate, DOCUMENT_LIMITS.coordinate],
  y: [0, DOCUMENT_LIMITS.height],
  z: [-DOCUMENT_LIMITS.coordinate, DOCUMENT_LIMITS.coordinate],
  bank: [-0.35, 0.35],
  roll: [-Math.PI * 8, Math.PI * 8],
};

/** All members receive one delta, limited by the first member to hit a bound. */
export function boundPointDelta(points, indices, requested) {
  const delta = {};
  let limited = false;
  for (const [axis, offset] of Object.entries(requested)) {
    const [min, max] = axisLimits[axis];
    let lower = -Infinity,
      upper = Infinity;
    for (const index of indices) {
      const coordinate = points[index][axis] ?? 0;
      lower = Math.max(lower, min - coordinate);
      upper = Math.min(upper, max - coordinate);
    }
    delta[axis] = Math.max(lower, Math.min(upper, offset));
    limited ||= delta[axis] !== offset;
  }
  return { delta, limited };
}

export function applyPointDelta(points, initial, indices, delta) {
  for (const index of indices) {
    for (const [axis, offset] of Object.entries(delta))
      points[index][axis] = (initial[index][axis] ?? 0) + offset;
  }
}
