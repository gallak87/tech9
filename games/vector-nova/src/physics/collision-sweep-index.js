const leafSize = 12;
const boundsStride = 6;

export function packSweepBounds(triangles) {
  const bounds = new Float64Array(triangles.length * boundsStride);
  for (let face = 0; face < triangles.length; face++) {
    const [a, b, c] = triangles[face].points;
    const offset = face * boundsStride;
    for (let axis = 0; axis < 3; axis++) {
      bounds[offset + axis] = Math.min(a[axis], b[axis], c[axis]);
      bounds[offset + axis + 3] = Math.max(a[axis], b[axis], c[axis]);
    }
  }
  return bounds;
}

function partitionAt(order, from, to, middle, compare) {
  let lower = from;
  let upper = to - 1;
  // Select the same median as a full sort without sorting both subtrees again.
  let remaining = 2 * Math.ceil(Math.log2(to - from));
  while (lower < upper && remaining-- > 0) {
    const pivot = order[(lower + upper) >>> 1];
    let left = lower;
    let right = upper;
    while (left <= right) {
      while (compare(order[left], pivot) < 0) left++;
      while (compare(order[right], pivot) > 0) right--;
      if (left <= right) {
        const item = order[left];
        order[left++] = order[right];
        order[right--] = item;
      }
    }
    if (middle <= right) upper = right;
    else if (middle >= left) lower = left;
    else return;
  }
  if (lower < upper) order.subarray(lower, upper + 1).sort(compare);
}

export function createSweepIndex(faceBounds) {
  const count = faceBounds.length / boundsStride;
  const order = new Uint32Array(count);
  for (let i = 0; i < count; i++) order[i] = i;
  // A balanced binary tree has at most this many nodes for the leaf size.
  const height = Math.ceil(Math.log2(Math.max(1, count / leafSize)));
  const capacity = 2 ** (height + 1) - 1;
  const nodeBounds = new Float64Array(capacity * boundsStride);
  const links = new Int32Array(capacity * 2);
  const byCenter = [0, 1, 2].map((axis) => (a, b) => {
    const i = a * boundsStride + axis;
    const j = b * boundsStride + axis;
    return (
      (faceBounds[i] + faceBounds[i + 3]) * 0.5 -
        (faceBounds[j] + faceBounds[j + 3]) * 0.5 || a - b
    );
  });
  let next = 0;

  function build(from, to, parentSort) {
    const node = next++;
    const bounds = node * boundsStride;
    for (let axis = 0; axis < 3; axis++) {
      let min = Infinity;
      let max = -Infinity;
      for (let i = from; i < to; i++) {
        const face = order[i] * boundsStride + axis;
        min = Math.min(min, faceBounds[face]);
        max = Math.max(max, faceBounds[face + 3]);
      }
      nodeBounds[bounds + axis] = min;
      nodeBounds[bounds + axis + 3] = max;
    }
    if (to - from <= leafSize) {
      // Retain the old traversal order, including nearly simultaneous hits.
      if (parentSort) order.subarray(from, to).sort(parentSort);
      links[node * 2] = ~from;
      links[node * 2 + 1] = to;
    } else {
      const x = nodeBounds[bounds + 3] - nodeBounds[bounds];
      const y = nodeBounds[bounds + 4] - nodeBounds[bounds + 1];
      const z = nodeBounds[bounds + 5] - nodeBounds[bounds + 2];
      const compare = byCenter[x >= y && x >= z ? 0 : y >= z ? 1 : 2];
      const mid = (from + to) >>> 1;
      partitionAt(order, from, to, mid, compare);
      links[node * 2] = build(from, mid, compare);
      links[node * 2 + 1] = build(mid, to, compare);
    }
    return node;
  }
  if (count) build(0, count);
  return { faceBounds, nodeBounds, links, order };
}

export function sweepCandidates(index, bounds) {
  const result = [];
  const { faceBounds, nodeBounds, links, order } = index;
  const { min, max } = bounds;
  function intersects(source, offset) {
    return (
      max.x >= source[offset] &&
      min.x <= source[offset + 3] &&
      max.y >= source[offset + 1] &&
      min.y <= source[offset + 4] &&
      max.z >= source[offset + 2] &&
      min.z <= source[offset + 5]
    );
  }
  function visit(node) {
    if (!intersects(nodeBounds, node * boundsStride)) return;
    const a = links[node * 2];
    const b = links[node * 2 + 1];
    if (a >= 0) {
      visit(a);
      visit(b);
      return;
    }
    for (let i = ~a; i < b; i++) {
      const face = order[i];
      if (intersects(faceBounds, face * boundsStride)) result.push(face);
    }
  }
  if (order.length) visit(0);
  return result;
}
