import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyPointDelta,
  boundPointDelta,
  changePointSelection,
  pointSelectionIndices,
  reconcilePointSelection,
  selectedPointRange,
  selectPointSpan,
} from './point-selection.js';

const points = ['one', 'two', 'three', 'four', 'five'].map((id) => ({ id }));

test('Shift selection extends and shrinks from one stable anchor across either side', () => {
  let selection = selectPointSpan(points, 2);
  selection = changePointSelection(points, selection, 4, { extend: true });
  assert.deepEqual(pointSelectionIndices(points, selection), [2, 3, 4]);
  assert.deepEqual(selectedPointRange(points, selection), { start: 2, end: 4 });
  selection = changePointSelection(points, selection, 3, { extend: true });
  assert.deepEqual(pointSelectionIndices(points, selection), [2, 3]);
  selection = changePointSelection(points, selection, 0, { extend: true });
  assert.deepEqual(pointSelectionIndices(points, selection), [0, 1, 2]);
  assert.equal(selection.anchorId, 'three');
  assert.equal(selection.activeId, 'one');
});

test('directional Shift navigation extends and shrinks across the first/last seam', () => {
  let selection = selectPointSpan(points, 0);
  const step = (index, stepDirection, expected) => {
    selection = changePointSelection(points, selection, index, {
      extend: true,
      stepDirection,
    });
    assert.deepEqual(pointSelectionIndices(points, selection), expected);
    assert.equal(selection.activeId, points[index].id);
    assert.equal(selection.anchorId, points[0].id);
  };
  step(4, -1, [0, 4]);
  step(3, -1, [0, 3, 4]);
  assert.equal(selectedPointRange(points, selection), null);
  selection = reconcilePointSelection(
    points.map((point) => ({ ...point, y: 20 })),
    selection,
  );
  step(4, 1, [0, 4]);
  step(0, 1, [0]);
  step(1, 1, [0, 1]);
  assert.deepEqual(selectedPointRange(points, selection), { start: 0, end: 1 });
});

test('a wrapped Shift range stops before selecting the anchor twice and absolute Shift-click stays linear', () => {
  let selection = selectPointSpan(points, 4);
  for (const index of [0, 1, 2, 3, 4])
    selection = changePointSelection(points, selection, index, {
      extend: true,
      stepDirection: 1,
    });
  assert.equal(selection.activeId, points[3].id);
  assert.equal(
    selectedPointRange(points, selection),
    null,
    'the all-points wrapped range still crosses the seam',
  );
  selection = changePointSelection(points, selection, 2, {
    extend: true,
    stepDirection: -1,
  });
  assert.deepEqual(pointSelectionIndices(points, selection), [0, 1, 2, 4]);
  selection = changePointSelection(points, selection, 1, { extend: true });
  assert.deepEqual(pointSelectionIndices(points, selection), [1, 2, 3, 4]);
  assert.deepEqual(selectedPointRange(points, selection), { start: 1, end: 4 });
});

test('toggle supports disjoint groups, and dragging one member preserves membership and anchor', () => {
  let selection = selectPointSpan(points, 0);
  selection = changePointSelection(points, selection, 3, { toggle: true });
  assert.equal(selectedPointRange(points, selection), null);
  selection = changePointSelection(points, selection, 0, { preserve: true });
  assert.deepEqual(pointSelectionIndices(points, selection), [0, 3]);
  assert.equal(selection.activeId, 'one');
  assert.equal(selection.anchorId, 'four');
  selection = changePointSelection(points, selection, 0, { toggle: true });
  assert.deepEqual(pointSelectionIndices(points, selection), [3]);
  assert.equal(selection.activeId, 'four');
});

test('members survive changes in route order by point ID and a removed active member falls back', () => {
  const selection = selectPointSpan(points, 1, 3);
  const reordered = [points[3], points[0], points[4], points[2], points[1]];
  const reconciled = reconcilePointSelection(reordered, selection);
  assert.equal(reconciled.activeId, 'four');
  assert.equal(reconciled.anchorId, 'two');
  assert.deepEqual(pointSelectionIndices(reordered, reconciled), [0, 3, 4]);
  const remaining = reconcilePointSelection(reordered.slice(1), selection);
  assert.equal(remaining.activeId, 'two');
  assert.deepEqual(
    pointSelectionIndices(reordered.slice(1), remaining),
    [2, 3],
  );
});

test('one bounds-constrained shift and roll preserves the whole group’s coordinate and angle offsets', () => {
  const initial = [
    { x: 24990, y: 20, z: 0, roll: Math.PI * 8 - 0.75 },
    { x: 24999, y: 7, z: -20, roll: Math.PI * 8 - 0.25 },
    { x: 10, y: 10, z: 10, roll: 0 },
  ];
  const next = structuredClone(initial);
  const requested = { x: 6, y: -10, z: 20, roll: 0.5 };
  const { delta, limited } = boundPointDelta(initial, [0, 1], requested);
  assert.equal(limited, true);
  assert.deepEqual(delta, { x: 1, y: -7, z: 20, roll: 0.25 });
  applyPointDelta(next, initial, [0, 1], delta);
  for (const axis of Object.keys(delta))
    assert.equal(
      next[0][axis] - next[1][axis],
      initial[0][axis] - initial[1][axis],
    );
  assert.deepEqual(next[2], initial[2]);
});
