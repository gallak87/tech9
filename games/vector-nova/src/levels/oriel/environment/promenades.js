import * as T from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { sweepGeometry } from '../../../track/geometry.js';
import { framePoint } from '../../../track/frames.js';
import { finishHabitatMaterial } from './habitat.js';

function promenadeRanges(range, side, reservations) {
  let spans = [range];
  for (const district of reservations) {
    if (!district.replacePromenade || district.side !== side) continue;
    spans = spans.flatMap((span) => {
      const start = Math.max(span.start, district.start);
      const end = Math.min(span.end, district.end);
      if (start >= end) return [span];
      return [
        ...(start > span.start
          ? [{ ...span, end: start, joinedEnd: true }]
          : []),
        ...(end < span.end ? [{ ...span, start: end, joinedStart: true }] : []),
      ];
    });
  }
  return spans.filter((span) => span.end - span.start >= 45);
}

/** The towns sit on real continuous retaining terraces at race height. Streets
 * and planted margins join the authored buildings into inhabited districts. */
export function createPromenadeTerraces(
  track,
  own,
  stoneMaps,
  { reservations = [] } = {},
) {
  const group = new T.Group();
  group.name = 'Oriel / raised inhabited promenade districts';
  const stone = own(
    finishHabitatMaterial(
      new T.MeshStandardMaterial({
        name: 'Oriel / continuous district retaining terraces',
        color: '#aeaa90',
        roughness: 0.82,
        metalness: 0.02,
      }),
      { bounce: 0.075 },
    ),
  );
  const paving = own(
    finishHabitatMaterial(
      new T.MeshStandardMaterial({
        name: 'Oriel / civic pedestrian streets',
        color: '#687e78',
        roughness: 0.8,
        metalness: 0.08,
      }),
      { bounce: 0.075 },
    ),
  );
  const soil = own(
    finishHabitatMaterial(
      new T.MeshStandardMaterial({
        name: 'Oriel / planted garden margins',
        color: '#334b25',
        roughness: 0.95,
      }),
      { bounce: 0.075 },
    ),
  );
  stoneMaps?.apply(stone);
  const buckets = new Map([
      [stone, []],
      [paving, []],
      [soil, []],
    ]),
    fronts = [],
    trees = [];
  const frames = new Map();
  const frameAt = (s) => {
    if (!frames.has(s)) frames.set(s, track.sample(s));
    return frames.get(s);
  };
  const sweep = (profile, range) => {
    const g = sweepGeometry(track, profile, { ...range, step: 5, uvScale: 1 });
    const coordinates = g.attributes.roadCoord,
      p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const s = coordinates.getX(i),
        x = coordinates.getY(i),
        f = frameAt(s);
      const y = new T.Vector3(p.getX(i), p.getY(i), p.getZ(i))
        .sub(f.position)
        .dot(f.up);
      const fade =
        (range.joinedStart
          ? 1
          : T.MathUtils.smoothstep(s - range.start, 0, 80)) *
        (range.joinedEnd ? 1 : T.MathUtils.smoothstep(range.end - s, 0, 80));
      const lateral =
        Math.sign(x) * (32 + (Math.abs(x) - 32) * Math.max(0.04, fade));
      const point = framePoint(f, lateral, y);
      p.setXYZ(i, ...point.toArray());
      coordinates.setY(i, lateral);
    }
    g.computeVertexNormals();
    return g;
  };
  const add = (material, geometry) => {
    if (material === stone) stoneMaps?.coordinates(geometry, track);
    buckets.get(material).push(geometry);
  };
  for (const section of track.sections) {
    if (section.id === 'sunline') continue;
    const intervals = [];
    let from = section.start + 40;
    const excluded = [
      ...track.jumps.map((j) => ({
        start: j.takeoff - 160,
        end: j.landingEnd + 80,
      })),
      ...(track.civicExclusions ?? []).map((r) => ({
        start: r.start - 140,
        end: r.end + 140,
      })),
    ].sort((a, b) => a.start - b.start);
    for (const exclusion of excluded) {
      const a = exclusion.start,
        b = exclusion.end;
      if (a >= section.end || b <= from) continue;
      if (a > from)
        intervals.push({ start: from, end: Math.min(a, section.end - 35) });
      from = Math.max(from, b);
    }
    if (from < section.end - 35)
      intervals.push({ start: from, end: section.end - 35 });
    for (const interval of intervals) {
      if (interval.end - interval.start < 300) continue;
      for (const side of [-1, 1]) {
        for (const range of promenadeRanges(interval, side, reservations)) {
          const profile = [
            [32, -42],
            [32, -10],
            [35, -8],
            [137, -8],
            [145, -15],
            [145, -42],
          ].map(([x, y]) => [side * x, y]);
          if (side < 0) profile.reverse();
          add(stone, sweep(profile, range));
          for (const s of [range.start, range.end]) {
            const f = frameAt(s),
              widthScale = (
                s === range.start ? range.joinedStart : range.joinedEnd
              )
                ? 1
                : 0.04,
              contour = profile.map(
                ([x, y]) =>
                  new T.Vector2(
                    Math.sign(x) * (32 + (Math.abs(x) - 32) * widthScale),
                    y,
                  ),
              );
            const triangles = T.ShapeUtils.triangulateShape(contour, []),
              pos = [];
            for (const tri of triangles)
              for (const i of s === range.start ? tri : [...tri].reverse())
                pos.push(
                  ...framePoint(f, contour[i].x, contour[i].y).toArray(),
                );
            const cap = new T.BufferGeometry();
            cap.userData.orielEndCap = true;
            cap.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
            cap.computeVertexNormals();
            const uv = new Float32Array((pos.length / 3) * 2);
            cap.setAttribute('uv', new T.BufferAttribute(uv, 2));
            // Keep the same indexed layout as the swept retained faces.
            cap.setIndex(Array.from({ length: pos.length / 3 }, (_, i) => i));
            cap.setAttribute(
              'roadCoord',
              new T.BufferAttribute(new Float32Array((pos.length / 3) * 2), 2),
            );
            add(stone, cap);
          }
          const road = [
            [37, -7.94],
            [53, -7.94],
          ].map(([x, y]) => [side * x, y]);
          if (side < 0) road.reverse();
          add(paving, sweep(road, range));
          const garden = [
            [130, -7.9],
            [136, -7.9],
          ].map(([x, y]) => [side * x, y]);
          if (side < 0) garden.reverse();
          add(soil, sweep(garden, range));
          for (let s = range.start + 95; s < range.end - 80; s += 67) {
            const frame = track.sample(s),
              position = frame.position
                .clone()
                .addScaledVector(frame.right, side * 133)
                .addScaledVector(frame.up, -7.8);
            if (reservations.some((r) => r.contains(position, 12))) continue;
            trees.push({
              matrix: new T.Matrix4().compose(
                position,
                frame.quaternion,
                new T.Vector3(0.19, 0.19, 0.19),
              ),
              angle: Math.atan2(position.x, 1000 - position.y),
            });
          }
          let index = 0;
          for (let s = range.start + 140; s < range.end - 135; s += 155) {
            const frame = track.sample(s),
              category =
                (index++ + Math.round(section.start)) % 3 === 0
                  ? 'gardenCourt'
                  : 'waterfront';
            const q = frame.quaternion
              .clone()
              .multiply(
                new T.Quaternion().setFromAxisAngle(
                  new T.Vector3(0, 1, 0),
                  (-side * Math.PI) / 2,
                ),
              );
            const position = frame.position
              .clone()
              .addScaledVector(frame.right, side * 91)
              .addScaledVector(frame.up, -11);
            const matrix = new T.Matrix4().compose(
              position,
              q,
              new T.Vector3(0.94, 0.94, 0.94),
            );
            if (reservations.some((r) => r.contains(position, 85))) continue;
            fronts.push({
              category,
              matrix,
              angle: Math.atan2(position.x, 1000 - position.y),
              position,
              section: section.id,
            });
          }
        }
      }
    }
  }
  for (const [material, parts] of buckets)
    if (parts.length) {
      const geometry = own(mergeGeometries(parts, false));
      parts.forEach((g) => g.dispose());
      const mesh = new T.Mesh(geometry, material);
      mesh.name = material.name;
      mesh.receiveShadow = true;
      mesh.castShadow = true;
      group.add(mesh);
    }
  return { group, fronts, trees, materials: [stone, paving, soil] };
}
