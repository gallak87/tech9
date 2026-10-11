import * as T from 'three';
import { sweepGeometry, boxProfile } from '../../../track/geometry.js';
import { framePoint } from '../../../track/frames.js';
import { createShatterlineTube } from './tube.js';
import { quadTriangles } from './tube-tessellation.js';
import { createAsphalt } from '../../halcyon/track/asphalt.js';
export { roadIntervals } from './road-runs.js';

// Use the same complete-run row phase and Float32 vertices as finite-hull
// support. Exposed half-rolls cannot be supported by a separately sampled spline.
function roadDeckGeometry(track, run) {
  const positions = [],
    uv = [],
    roadCoord = [],
    indices = [];
  for (const s of run.stations) {
    for (const side of [-1, 1]) {
      positions.push(...track.tubeMesh.roadVertex(s, side).toArray());
      uv.push(side === -1 ? 0 : 1, s / 32);
      roadCoord.push(s, (side * track.width) / 2);
    }
  }
  for (let row = 0; row < run.stations.length - 1; row++) {
    const a = row * 2;
    for (const face of quadTriangles(a, a + 1, a + 2, a + 3))
      indices.push(...face);
  }
  const geometry = new T.BufferGeometry();
  geometry.setAttribute('position', new T.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new T.Float32BufferAttribute(uv, 2));
  geometry.setAttribute(
    'roadCoord',
    new T.Float32BufferAttribute(roadCoord, 2),
  );
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}

/** The first visible turn ahead, measured in the driver's current road frame. */
export function shatterlineTurnCue(track, distance, lookAhead = 240) {
  if (track.isGap(distance)) return null;
  const frame = track.sample(distance);
  for (let ahead = 24; ahead <= lookAhead; ahead += 12) {
    const targetDistance = distance + ahead;
    if (targetDistance >= track.finishDistance || track.isGap(targetDistance))
      break;
    const target = track.sample(targetDistance);
    const yaw = Math.atan2(
      target.tangent.dot(frame.right),
      target.tangent.dot(frame.tangent),
    );
    if (Math.abs(yaw) > 0.045)
      return {
        distance,
        turnDistance: targetDistance,
        direction: Math.sign(yaw),
        yaw,
      };
  }
  return null;
}
export function createShatterlineRoad({
  track,
  shape = false,
  view,
  collectSolid = null,
}) {
  const halfWidth = track.width / 2;
  const group = new T.Group();
  group.name = 'Shatterline / reinforced induction raceway';
  const geometries = new Set(),
    materials = new Set();
  // The topping borrows Halcyon's licensed scan, not its climate or road UVs.
  // CPU collision/shape construction does not load rendering assets.
  const asphalt =
    !shape && !collectSolid && view?.renderer
      ? createAsphalt(view.renderer, track.width, {
          uvLength: 32,
          label: 'Shatterline',
          moisture: 0.34,
        })
      : null;
  const material = (name, options) => {
    const m = new T.MeshStandardMaterial({ name, ...options });
    materials.add(m);
    return m;
  };
  const graphite =
    asphalt?.material ??
    material('Graphite induction cassettes', {
      color: shape ? '#8e979d' : '#50565b',
      roughness: 0.76,
      metalness: 0.3,
    });
  if (asphalt) {
    graphite.name = 'Shatterline / aggregate-topped induction cassettes';
    graphite.color.set(0xaebfd1);
    graphite.normalScale.set(1.6, 1.6);
    graphite.envMapIntensity = 0.8;
    const compileAsphalt = graphite.onBeforeCompile;
    graphite.onBeforeCompile = (shader) => {
      compileAsphalt(shader);
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        // Large cassette joints and guidance stay independent of aggregate.
        vec2 baySize=vec2(${(track.width / 5).toFixed(3)},8.);
        vec2 bay=mod(roadMetres,baySize);
        vec2 edge=min(bay,baySize-bay);
        vec2 aa=max(fwidth(roadMetres),vec2(.008));
        vec2 seal=1.-smoothstep(vec2(.025),vec2(.065)+aa,edge);
        float joint=max(seal.x,seal.y);
        diffuseColor.rgb*=1.-joint*.55;
        vec2 fitting=edge-vec2(.35,.52);
        float radius=length(fitting);
        float capAA=max(fwidth(radius),.012);
        float seat=1.-smoothstep(.11,.11+capAA,radius);
        float cap=1.-smoothstep(.065,.065+capAA,radius);
        diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.025),seat*.7);
        diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.28,.3,.32),cap*.8);
        float margin=min(abs(roadMetres.x-${(track.width * 0.0835).toFixed(3)}),abs(roadMetres.x-${(track.width * 0.9165).toFixed(3)}));
        float paint=1.-smoothstep(.14,.19+aa.x,margin);
        diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.44,.33,.17),paint*.82);`,
      );
    };
    graphite.customProgramCacheKey = () =>
      `shatterline-aggregate-cassettes-v1-${track.width}`;
  }
  const keel = material('Deep graphite structural spine', {
    color: '#252c32',
    roughness: 0.82,
    metalness: 0.52,
  });
  const ceramic = material('Weathered warm ceramic containment', {
    color: '#b6afa0',
    roughness: 0.78,
    metalness: 0.06,
  });
  const titanium = material('Machined titanium laminations', {
    color: '#687177',
    roughness: 0.43,
    metalness: 0.78,
  });
  const red = material('Oxide maintenance plates', {
    color: '#743e32',
    roughness: 0.82,
    metalness: 0.18,
  });
  const amber = material('Recessed amber guidance', {
    color: '#d8bd82',
    emissive: '#f5b856',
    emissiveIntensity: 0.65,
    roughness: 0.58,
  });
  const blue = material('Induction strip housing blue glass', {
    color: '#88b9d1',
    emissive: '#79b6e0',
    emissiveIntensity: 0.55,
    roughness: 0.4,
  });
  const mesh = (name, g, m, info) => {
    geometries.add(g);
    const o = new T.Mesh(g, m);
    o.name = name;
    o.userData.drivingSurface = info?.kind === 'deck';
    o.userData.roadSurface = info?.kind === 'deck';
    o.receiveShadow = true;
    o.castShadow = m !== graphite;
    group.add(o);
    if (collectSolid && info) collectSolid({ name, geometry: g, ...info });
    return o;
  };
  const intervals = track.tubeMesh.roadRuns;
  for (const [index, run] of intervals.entries()) {
    const { start, end } = run;
    const route = { start: Math.max(0, start), end };
    mesh(`Deck ${index}`, roadDeckGeometry(track, run), graphite, {
      kind: 'deck',
      ...route,
    });
    mesh(
      `Spine ${index}`,
      sweepGeometry(
        track,
        [
          [halfWidth, 0],
          [halfWidth + 2, -2],
          [halfWidth - 3, -6],
          [3 - halfWidth, -6],
          [-halfWidth - 2, -2],
          [-halfWidth, 0],
        ],
        { start, end, step: 6 },
      ),
      keel,
      { kind: 'structure', ...route },
    );
    for (const side of [-1, 1]) {
      mesh(
        `Containment ${side} ${index}`,
        sweepGeometry(
          track,
          boxProfile(side * (halfWidth + 0.8), 0.6, 1.6, 1.2),
          {
            start,
            end,
            step: 4,
          },
        ),
        ceramic,
        { kind: 'rail', roadBoundary: true, ...route },
      );
      mesh(
        `Outboard lamination ${side} ${index}`,
        sweepGeometry(
          track,
          boxProfile(side * (halfWidth + 2.6), -1.6, 1.2, 1.2),
          {
            start,
            end,
            step: 6,
          },
        ),
        titanium,
        { kind: 'structure', ...route },
      );
      mesh(
        `Underside tension spine ${side} ${index}`,
        sweepGeometry(track, boxProfile(side * (halfWidth - 7), -6.5, 1.5, 2), {
          start,
          end,
          step: 6,
        }),
        titanium,
        { kind: 'structure', ...route },
      );
    }
    // End faces are solid; open jump apertures have no invisible connecting road.
    for (const s of [start, end]) {
      if (
        track.tubes.some((tube) =>
          [tube.start, tube.end].some((edge) => Math.abs(s - edge) < 0.001),
        )
      )
        continue;
      const frame = track.sample(s),
        g = new T.PlaneGeometry(track.width, 6);
      const matrix = new T.Matrix4().compose(
        framePoint(frame, 0, -3),
        frame.quaternion,
        new T.Vector3(1, 1, 1),
      );
      g.applyMatrix4(matrix);
      const o = mesh(`Deck end ${index} ${s}`, g, keel, { kind: 'structure' });
      o.material.side = T.DoubleSide;
    }
  }
  const boxes = new Map();
  const addBox = (name, mat, s, x, y, w, h, d, solid = false) => {
    const key = `${name}|${mat.name}`;
    if (!boxes.has(key)) boxes.set(key, { name, mat, items: [] });
    const f = track.sample(s),
      matrix = new T.Matrix4().compose(
        framePoint(f, x, y),
        f.quaternion,
        new T.Vector3(w, h, d),
      );
    boxes.get(key).items.push({ matrix, s, solid });
  };
  for (const { start, end } of intervals) {
    for (let s = start + 6; s < end - 5; s += 12) {
      for (const side of [-1, 1]) {
        addBox(
          'Segmented ceramic shoulder',
          Math.floor(s / 12) % 13 === 0 ? red : ceramic,
          s,
          side * (halfWidth + 2.25),
          0.4,
          2.6,
          0.9,
          10.2,
        );
        addBox(
          'Shoulder open cooling slots',
          keel,
          s,
          side * (halfWidth + 2.3),
          0.91,
          1.65,
          0.08,
          3.8,
        );
        addBox(
          'Shoulder load clamp',
          titanium,
          s,
          side * (halfWidth + 1.2),
          1.05,
          3,
          0.35,
          1.2,
        );
      }
    }
    for (let s = start + 12; s < end - 6; s += 30) {
      for (const side of [-1, 1]) {
        addBox(
          'Lane light',
          amber,
          s,
          side * (halfWidth - 0.25),
          0.22,
          0.22,
          0.12,
          7,
        );
        addBox(
          'Recessed coil window',
          blue,
          s,
          side * (halfWidth + 3),
          -0.45,
          0.35,
          0.6,
          4.5,
        );
      }
      if (s < track.finishDistance - 50)
        addBox('Central guide dash', ceramic, s, 0, 0.035, 0.14, 0.018, 5);
    }
    for (let s = start + 22; s < end - 12; s += 55) {
      addBox(
        'Transverse load diaphragm',
        titanium,
        s,
        0,
        -5.8,
        track.width + 4,
        1.3,
        1.8,
        true,
      );
      for (const side of [-1, 1])
        addBox(
          'Recessed bearing capitals',
          keel,
          s,
          side * (halfWidth - 5),
          -8,
          4,
          4,
          5,
          true,
        );
    }
  }
  for (const jump of track.jumps) {
    for (const side of [-1, 1]) {
      // Upright landing beacons stand outside the actual road and air envelope.
      for (const [s, scale] of [
        [jump.takeoff - 8, 1],
        [jump.landingStart + 10, 1.35],
      ]) {
        addBox(
          'Jump marker foot',
          keel,
          s,
          side * (halfWidth + 4),
          1,
          3,
          2,
          5,
          true,
        );
        addBox(
          'Jump marker blade',
          ceramic,
          s,
          side * (halfWidth + 4),
          5 * scale,
          1.4,
          8 * scale,
          2,
          true,
        );
        addBox(
          'Jump marker inset',
          amber,
          s,
          side * (halfWidth + 3.95),
          5.3 * scale,
          1.6,
          5.5 * scale,
          0.3,
        );
      }
    }
    for (let i = 0; i < 4; i++) {
      const s = jump.takeoff - 14 - i * 16;
      for (const side of [-1, 1]) {
        for (let k = 0; k < 4; k++)
          addBox(
            'Launch fan markings',
            i % 2 ? ceramic : amber,
            s - k * 0.7,
            side * (0.25 + k * 0.1) * halfWidth,
            0.048,
            2.3,
            0.018,
            0.55,
          );
      }
    }
    for (let row = 0; row < 3; row++)
      for (let col = 0; col < 10; col++)
        if ((row + col) % 2 === 0)
          addBox(
            'Receiving deck checkers',
            ceramic,
            jump.landingStart + 8 + row * 3.5,
            -halfWidth + ((col + 0.5) * track.width) / 10,
            0.042,
            track.width / 10 - 0.4,
            0.018,
            3.2,
          );
  }
  // Mark the approaching bend rather than a later endpoint's world-X offset.
  // Geometric +right is driver-left; all cue geometry uses that same road frame.
  const turnPaint = [];
  const cueDistances = [];
  for (let i = 0; i < track.jumps.length - 1; i++) {
    for (const before of [125, 80, 35])
      cueDistances.push(track.jumps[i].landingEnd - before);
  }
  for (const variation of track.variations ?? [])
    for (
      let distance = variation.start + 30;
      distance < variation.end - 80;
      distance += 180
    )
      if (
        !cueDistances.some((candidate) => Math.abs(candidate - distance) < 35)
      )
        cueDistances.push(distance);
  for (const distance of cueDistances) {
    const cue = shatterlineTurnCue(track, distance);
    if (!cue) continue;
    const outline = [
      [-6, -1.3],
      [1, -1.3],
      [1, -4.5],
      [6, 0],
      [1, 4.5],
      [1, 1.3],
      [-6, 1.3],
    ].map(([x, z]) => new T.Vector2(x * cue.direction, z));
    const faces = T.ShapeUtils.triangulateShape(outline, []);
    const frame = track.sample(distance);
    for (const face of faces) {
      const points = face.map((n) =>
        framePoint(frame, outline[n].x, 0.065, outline[n].y),
      );
      // Both turn directions retain the same upward-facing winding.
      const normal = points[1]
        .clone()
        .sub(points[0])
        .cross(points[2].clone().sub(points[0]));
      if (normal.dot(frame.up) < 0)
        [points[1], points[2]] = [points[2], points[1]];
      for (const point of points) turnPaint.push(...point.toArray());
    }
  }
  const turnGeometry = new T.BufferGeometry();
  turnGeometry.setAttribute(
    'position',
    new T.Float32BufferAttribute(turnPaint, 3),
  );
  turnGeometry.computeVertexNormals();
  mesh('Advance direction arrows', turnGeometry, amber);
  for (const distance of [0, track.finishDistance])
    for (let row = 0; row < 3; row++)
      for (let col = 0; col < 16; col++)
        if ((row + col) % 2 === 0)
          addBox(
            'Timing line',
            ceramic,
            distance + row * 2.4,
            -halfWidth + ((col + 0.5) * track.width) / 16,
            0.05,
            track.width / 16 - 0.1,
            0.025,
            2.3,
          );
  const box = new T.BoxGeometry(1, 1, 1);
  geometries.add(box);
  for (const { name, mat, items } of boxes.values()) {
    const o = new T.InstancedMesh(box, mat, items.length);
    o.name = name;
    o.castShadow = true;
    o.receiveShadow = true;
    items.forEach(({ matrix, s, solid }, i) => {
      o.setMatrixAt(i, matrix);
      if (collectSolid && solid)
        collectSolid({
          name: `${name}-${i}`,
          geometry: box,
          matrix,
          kind: 'structure',
          distance: s,
        });
    });
    o.computeBoundingSphere();
    group.add(o);
  }
  const tube = track.tubes.length
    ? createShatterlineTube({ track, shape, collectSolid })
    : null;
  if (tube) group.add(tube.group);
  let disposed = false;
  return {
    group,
    ready: asphalt?.ready,
    setReflection(texture) {
      if (disposed) return;
      if (asphalt) {
        graphite.envMap = texture;
        graphite.needsUpdate = true;
      }
      tube?.setReflection(texture);
      for (const m of materials) {
        m.envMap = texture;
        m.envMapIntensity = 0.45;
        m.needsUpdate = true;
      }
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      asphalt?.dispose();
      tube?.dispose();
      for (const g of geometries) g.dispose();
      for (const m of materials) m.dispose();
      group.clear();
    },
  };
}
