import * as T from 'three';

export const MESH_STEPS = Object.freeze({
  tube: 4,
  road: 3,
  columns: 128,
  chunk: 128,
});
export const floatPoint = (point) =>
  new T.Vector3(
    Math.fround(point.x),
    Math.fround(point.y),
    Math.fround(point.z),
  );
export function sweepStations(start, end, step) {
  const count = Math.ceil((end - start) / step);
  return Array.from({ length: count + 1 }, (_, row) =>
    T.MathUtils.lerp(start, end, row / count),
  );
}
export function quadTriangles(a, b, c, d, reverse = false) {
  return reverse
    ? [
        [a, b, c],
        [b, d, c],
      ]
    : [
        [a, c, b],
        [b, c, d],
      ];
}

// Rendering, physical solids, and hull support all consume these same world
// Float32 vertices and diagonals. No consumer resamples an approximate sheet.
export function createTubeTessellation({
  tubes,
  profileAt,
  geometryAt,
  sample,
  roadIntervals,
  width,
}) {
  const chunks = tubes.flatMap((tube) => {
    const cuts = [
      tube.start,
      tube.end,
      ...tube.breakpoints,
      tube.entryEnd,
      tube.exitStart,
    ];
    for (
      let s = tube.start + MESH_STEPS.chunk;
      s < tube.end;
      s += MESH_STEPS.chunk
    )
      cuts.push(s);
    const boundaries = [
      ...new Set(cuts.filter((s) => s >= tube.start && s <= tube.end)),
    ].sort((a, b) => a - b);
    return boundaries.slice(0, -1).map((start, index) => {
      const end = boundaries[index + 1];
      return {
        tubeId: tube.id,
        start,
        end,
        stations: sweepStations(start, end, MESH_STEPS.tube),
        closed: profileAt((start + end) / 2).closed,
      };
    });
  });
  const roadRuns = roadIntervals.map((run) => ({
    ...run,
    stations: sweepStations(run.start, run.end, MESH_STEPS.road),
  }));
  const sheetCache = new Map(),
    rimCache = new Map(),
    roadCache = new Map();
  function sheetVertex(distance, column, outward = 0) {
    const key = `${distance}:${column}:${outward}`;
    if (sheetCache.has(key)) return sheetCache.get(key);
    const profile = profileAt(distance);
    const lateral = T.MathUtils.lerp(
      -profile.halfWidth,
      profile.halfWidth,
      column / MESH_STEPS.columns,
    );
    const frame = geometryAt(distance, lateral);
    const value = {
      position: floatPoint(
        frame.position.clone().addScaledVector(frame.up, -outward),
      ),
      up: frame.up,
      lateral,
    };
    sheetCache.set(key, value);
    return value;
  }
  function rimVertex(distance, side, index, guide = true) {
    const key = `${distance}:${side}:${index}:${guide}`;
    if (rimCache.has(key)) return rimCache.get(key);
    const profile = profileAt(distance),
      frame = geometryAt(distance, side * profile.halfWidth);
    const section = guide
      ? profile.rimCrossSection
      : [
          [0, 0],
          [0.035, 0],
          [0.035, -0.72],
          [0, -0.72],
        ];
    const [x, y] = section[index];
    const value = floatPoint(
      frame.position
        .clone()
        .addScaledVector(frame.right, side * x)
        .addScaledVector(frame.up, y),
    );
    rimCache.set(key, value);
    return value;
  }
  function roadVertex(distance, side) {
    const key = `${distance}:${side}`;
    if (roadCache.has(key)) return roadCache.get(key);
    const frame = sample(distance),
      value = floatPoint(
        frame.position.clone().addScaledVector(frame.right, (side * width) / 2),
      );
    roadCache.set(key, value);
    return value;
  }
  return {
    chunks,
    roadRuns,
    columns: MESH_STEPS.columns,
    sheetVertex,
    rimVertex,
    roadVertex,
  };
}
