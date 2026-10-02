import * as T from 'three';
import { sampleSpill } from './mechanics.js';

/** The source is uphill: flow travels toward decreasing route distance. */
export function spillAnchors(track, zone) {
  const entry = track.sample(zone.end),
    exit = track.sample(zone.start);
  const source = entry.position
    .clone()
    .addScaledVector(entry.right, zone.side * 65);
  source.y += 34;
  const facing = entry.right.clone().multiplyScalar(-zone.side);
  facing.y = 0;
  facing.normalize();
  return { entry, exit, source, yaw: Math.atan2(facing.x, facing.z) };
}

export function spillOpenings(track, side) {
  return (track.surgeZones ?? [])
    .filter((z) => z.kind === 'spill')
    .map((z) => ({
      start: (side === z.side ? z.end : z.start) - 10,
      end: (side === z.side ? z.end : z.start) + 10,
    }));
}

export function spillRoadIntervals(track, side, start, end) {
  let intervals = [{ start, end }];
  for (const gap of spillOpenings(track, side))
    intervals = intervals.flatMap((i) => {
      if (gap.end <= i.start || gap.start >= i.end) return [i];
      return [
        { start: i.start, end: Math.min(i.end, gap.start) },
        { start: Math.max(i.start, gap.end), end: i.end },
      ].filter((i) => i.end > i.start);
    });
  return intervals;
}

function loft(samples, { bed = false } = {}) {
  const positions = [],
    colors = [],
    edges = [],
    along = [],
    indices = [];
  const profile = bed
    ? [
        [-1, -0.6],
        [-0.92, -7],
        [0.92, -7],
        [1, -0.6],
      ]
    : [
        [-1, -0.04],
        [-0.8, 0.23],
        [-0.4, 0.32],
        [0, 0.38],
        [0.4, 0.32],
        [0.8, 0.23],
        [1, -0.04],
        [0, -0.12],
      ];
  let length = 0;
  for (let i = 0; i < samples.length; i++) {
    const sample = samples[i];
    if (i) length += sample.point.distanceTo(samples[i - 1].point);
    for (const [x, y] of profile) {
      const point = sample.point
        .clone()
        .addScaledVector(sample.right, x * sample.width * (bed ? 1.45 : 1))
        .addScaledVector(sample.up, bed && y === -7 ? -(sample.depth ?? 7) : y);
      positions.push(...point.toArray());
      edges.push(Math.abs(x));
      along.push(length);
      colors.push(0.085, 0.103, 0.119);
    }
    if (i)
      for (let j = 0; j < profile.length; j++) {
        const a = (i - 1) * profile.length + j,
          b = i * profile.length + j,
          c = (i - 1) * profile.length + ((j + 1) % profile.length),
          d = i * profile.length + ((j + 1) % profile.length);
        indices.push(a, b, c, c, b, d);
      }
  }
  const geometry = new T.BufferGeometry();
  geometry.setAttribute('position', new T.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new T.Float32BufferAttribute(colors, 3));
  geometry.setAttribute('cinderEdge', new T.Float32BufferAttribute(edges, 1));
  geometry.setAttribute('cinderAlong', new T.Float32BufferAttribute(along, 1));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}

/** One continuous volume joins the crater notch, deck ribbon and falling outfall. */
export function createSpillGeometry(track, zone, heightAt) {
  const { entry, exit, source } = spillAnchors(track, zone);
  const up = new T.Vector3(0, 1, 0);
  const feed = [];
  for (const [lateral, height, width] of [
    [65, 29, 3.8],
    [58, 29, 3.9],
    [52, 26, 3.8],
    [41, 17, 3.5],
    [28, 5, 3.3],
    [17, 0.18, 3.1],
  ]) {
    const point = entry.position
      .clone()
      .addScaledVector(entry.right, lateral * zone.side);
    point.y = entry.position.y + height;
    feed.push({ point, right: entry.tangent.clone(), up, width });
  }
  const samples = [...feed];
  const count = Math.ceil((zone.end - zone.start) / 2);
  for (let i = 1; i <= count; i++) {
    const distance = T.MathUtils.lerp(zone.end, zone.start, i / count),
      frame = track.sample(distance),
      flow = sampleSpill(zone, distance);
    samples.push({
      point: frame.position
        .clone()
        .addScaledVector(frame.right, flow.center)
        .addScaledVector(frame.up, 0.18),
      right: frame.right,
      up: frame.up,
      width: flow.halfWidth,
    });
  }
  for (const [along, lateral, drop, width] of [
    [-3, 19, 2, 3.1],
    [-8, 23, 9, 3],
    [-16, 27, 26, 2.8],
    [-23, 30, 48, 3.8],
  ]) {
    const point = exit.position
      .clone()
      .addScaledVector(exit.tangent, along)
      .addScaledVector(exit.right, -lateral * zone.side);
    point.y -= drop;
    if (heightAt) point.y = Math.max(point.y, heightAt(point.x, point.z) + 0.7);
    samples.push({ point, right: exit.tangent.clone(), up, width });
  }
  const end = samples.at(-1).point;
  if (heightAt) end.y = heightAt(end.x, end.z) + 0.7;
  for (let i = 0; i < samples.length; i++) {
    const previous = samples[Math.max(0, i - 1)].point,
      next = samples[Math.min(samples.length - 1, i + 1)].point;
    samples[i].right = next
      .clone()
      .sub(previous)
      .cross(samples[i].up)
      .normalize();
  }
  const bed = feed.slice(0, -1);
  for (const sample of bed)
    sample.depth = heightAt
      ? sample.point.y - heightAt(sample.point.x, sample.point.z) + 3
      : 7; // The support apron ends outside the driving deck.
  return {
    flow: loft(samples),
    bed: loft(bed, { bed: true }),
    source,
    outfall: end.clone(),
  };
}
