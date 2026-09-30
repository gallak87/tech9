import * as T from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { sweepGeometry, boxProfile } from '../../../track/geometry.js';
import { framePoint } from '../../../track/frames.js';

const inside = (s, j) => s > j.takeoff && s < j.landingStart;

function petalGeometry(side, variant) {
  const points = [];
  const ids = [];
  const rows = 12;
  const cols = 6;
  // A hooked protective petal with a ribbed back, opening away from the chase corridor.
  for (let i = 0; i <= rows; i++) {
    const t = i / rows;
    const rise = 6.5 * t + 1.5 * Math.sin(t * Math.PI);
    const reach = 1 + 6 * t * t + (variant === 1 ? 1.7 : 0);
    const breadth =
      (0.4 + Math.sin(Math.PI * t) * 2.1) * (variant === 2 ? 0.82 : 1);
    for (let j = 0; j <= cols; j++) {
      const u = (j / cols) * 2 - 1;
      points.push(
        side * (15 + reach + 0.35 * Math.cos(u * Math.PI)),
        rise - 0.65 * u * u,
        u * breadth,
      );
      if (i < rows && j < cols) {
        const a = i * (cols + 1) + j;
        ids.push(a, a + cols + 1, a + 1, a + 1, a + cols + 1, a + cols + 2);
      }
    }
  }
  const g = new T.BufferGeometry();
  g.setAttribute('position', new T.Float32BufferAttribute(points, 3));
  g.setIndex(ids);
  g.computeVertexNormals();
  return g;
}
function mergeParts(group, parts, material, name) {
  if (!parts.length) return;
  const geometry = mergeGeometries(parts, false);
  parts.forEach((g) => g.dispose());
  const mesh = new T.Mesh(geometry, material);
  mesh.name = name;
  mesh.receiveShadow = true;
  group.add(mesh);
  return mesh;
}

// Cut decorative laminae directly from the submitted driving triangles. An
// independently swept thin layer intersects banked quads along their diagonals.
function deckPatch(surface, x0, x1, s0, s1, offset) {
  const { position, uv, normal: sourceNormals } = surface.geometry.attributes;
  const source = surface.geometry.index;
  const positions = [],
    normals = [],
    uvs = [],
    indices = [];
  const right = surface.userData.rightEdge;
  for (let i = 0; i < source.count; i += 3) {
    let polygon = [0, 1, 2].map((j) => {
      const index = source.getX(i + j);
      return {
        x: -14 + uv.getX(index) * (right + 14),
        s: uv.getY(index) * 16,
        p: new T.Vector3().fromBufferAttribute(position, index),
        normal: new T.Vector3().fromBufferAttribute(sourceNormals, index),
      };
    });
    if (polygon.every((v) => v.s < s0) || polygon.every((v) => v.s > s1))
      continue;
    for (const [axis, edge, sign] of [
      ['x', x0, 1],
      ['x', x1, -1],
      ['s', s0, 1],
      ['s', s1, -1],
    ]) {
      const clipped = [];
      for (let j = 0; j < polygon.length; j++) {
        const a = polygon[j],
          b = polygon[(j + 1) % polygon.length];
        const da = (a[axis] - edge) * sign,
          db = (b[axis] - edge) * sign;
        if (da >= 0) clipped.push(a);
        if (da >= 0 !== db >= 0) {
          const t = da / (da - db);
          clipped.push({
            x: T.MathUtils.lerp(a.x, b.x, t),
            s: T.MathUtils.lerp(a.s, b.s, t),
            p: a.p.clone().lerp(b.p, t),
            normal: a.normal.clone().lerp(b.normal, t),
          });
        }
      }
      polygon = clipped;
    }
    for (let j = 1; j < polygon.length - 1; j++) {
      const triangle = [polygon[0], polygon[j], polygon[j + 1]];
      if (
        new T.Vector3()
          .crossVectors(
            triangle[1].p.clone().sub(triangle[0].p),
            triangle[2].p.clone().sub(triangle[0].p),
          )
          .lengthSq() < 1e-12
      )
        continue;
      for (const vertex of triangle) {
        const normal = vertex.normal.clone().normalize();
        const point = vertex.p.clone().addScaledVector(normal, offset);
        normals.push(...normal.toArray());
        indices.push(positions.length / 3);
        positions.push(...point.toArray());
        uvs.push((vertex.x - x0) / (x1 - x0), vertex.s / 16);
      }
    }
  }
  const geometry = new T.BufferGeometry();
  geometry.setAttribute('position', new T.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new T.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.setAttribute('normal', new T.Float32BufferAttribute(normals, 3));
  geometry.computeBoundingSphere();
  return geometry;
}

export function createVesperRoad({ track, shape = false }) {
  const group = new T.Group();
  group.name = shape ? 'Vesper route study' : 'Cast amber transport ribbon';
  const amber = new T.MeshPhysicalMaterial({
    color: shape ? 0x88959c : 0xbf651e,
    roughness: 0.44,
    metalness: 0.12,
    clearcoat: 0.68,
    clearcoatRoughness: 0.25,
  });
  const milk = new T.MeshStandardMaterial({
    color: shape ? 0xc1c9cc : 0xd7b47a,
    roughness: 0.53,
    metalness: 0.08,
  });
  const smoked = new T.MeshStandardMaterial({
    color: shape ? 0x7b8b90 : 0x673715,
    roughness: 0.58,
    metalness: 0.13,
  });
  const polished = new T.MeshPhysicalMaterial({
    color: shape ? 0x9faab0 : 0xe8a738,
    roughness: 0.34,
    metalness: 0.24,
    clearcoat: 0.9,
  });
  const vein = new T.MeshStandardMaterial({
    color: 0xffc46e,
    emissive: 0xf2a327,
    emissiveIntensity: shape ? 0 : 0.6,
    roughness: 0.45,
  });
  const tissue = new T.MeshStandardMaterial({
    color: shape ? 0xc2cbd0 : 0xd9b68b,
    roughness: 0.72,
    side: T.DoubleSide,
  });
  const bark = new T.MeshStandardMaterial({
    color: shape ? 0x505d64 : 0x352719,
    roughness: 0.91,
  });
  const metal = new T.MeshStandardMaterial({
    color: 0x77918b,
    metalness: 0.7,
    roughness: 0.4,
  });
  const sap = new T.MeshPhysicalMaterial({
    color: 0xd2b076,
    emissive: 0x644715,
    emissiveIntensity: 0.2,
    roughness: 0.36,
    clearcoat: 0.5,
  });
  const sapClock = { value: 0 };
  for (const material of [amber, polished, milk, smoked, sap]) {
    const flowing = material === sap;
    material.onBeforeCompile = (shader) => {
      shader.uniforms.vesperSapTime = sapClock;
      shader.vertexShader =
        'varying vec2 vVesperUv;\n' +
        shader.vertexShader.replace(
          '#include <begin_vertex>',
          '#include <begin_vertex>\n vVesperUv=uv;',
        );
      shader.fragmentShader =
        'varying vec2 vVesperUv;\nuniform float vesperSapTime;\n' +
        shader.fragmentShader.replace(
          '#include <color_fragment>',
          `#include <color_fragment>
        float lamina = sin(vVesperUv.x * 136.0 + sin(vVesperUv.y * 0.9) * 2.2);
        float fineLayer = sin(vVesperUv.x * 463.0 + sin(vVesperUv.y * 2.5));
        diffuseColor.rgb *= 0.94 + 0.04 * lamina + 0.02 * fineLayer;
        ${flowing ? 'float flow = pow(0.5 + 0.5 * sin(vVesperUv.y * 11.0 - vesperSapTime * 0.75 + sin(vVesperUv.x * 19.0)), 9.0); diffuseColor.rgb += vec3(0.045,0.027,0.01)*flow;' : ''}
      `,
        );
    };
    material.customProgramCacheKey = () =>
      flowing ? 'vesper-flow-v1' : 'vesper-lamina-v1';
  }
  const slices = [
    0,
    track.length,
    ...track.jumps.flatMap((j) => [j.takeoff, j.landingStart]),
    ...track.sections.map((s) => s.end),
  ]
    .sort((a, b) => a - b)
    .filter((s, i, a) => !i || s - a[i - 1] > 0.001);
  for (let i = 0; i < slices.length - 1; i++) {
    const start = slices[i],
      end = slices[i + 1],
      mid = (start + end) / 2;
    const gap = track.jumps.find((j) => inside(mid, j));
    if (gap && !gap.optional) continue;
    const right = gap?.optional ? 5.5 : 14;
    const section = track.sections.find((s) => mid >= s.start && mid < s.end);
    const mat =
      section?.id === 'rootfall'
        ? smoked
        : section?.id === 'bloom'
          ? milk
          : amber;
    const surface = new T.Mesh(
      sweepGeometry(
        track,
        [
          [-14, 0],
          [right, 0],
        ],
        { start, end, step: 3 },
      ),
      mat,
    );
    surface.name = 'Cast resin driving surface';
    surface.userData.drivingSurface = true;
    surface.userData.rightEdge = right;
    surface.receiveShadow = true;
    group.add(surface);
    const thickness = new T.Mesh(
      sweepGeometry(
        track,
        [
          [-14, 0],
          [-15.8, -1.4],
          [-12.2, -4.2],
          [right - 1.8, -4.2],
          [right + 1.8, -1.4],
          [right, 0],
        ],
        { start, end, step: 4 },
      ),
      smoked,
    );
    group.add(thickness);
    for (const sign of [-1, 1]) {
      if (sign === 1 && gap?.optional) continue;
      group.add(
        new T.Mesh(
          sweepGeometry(track, boxProfile(sign * 14.75, 0.6, 1.5, 1.2), {
            start,
            end,
            step: 4,
          }),
          milk,
        ),
      );
      group.add(
        new T.Mesh(
          sweepGeometry(track, boxProfile(sign * 13.48, 0.07, 0.23, 0.1), {
            start,
            end,
            step: 4,
          }),
          vein,
        ),
      );
      group.add(
        new T.Mesh(
          sweepGeometry(
            track,
            [
              [sign * 8, -2.3],
              [sign * 10, -3.5],
            ],
            { start, end, step: 5 },
          ),
          amber,
        ),
      );
    }
    for (const x of [-5, 5]) {
      if (x + 1.9 > right) continue;
      group.add(
        new T.Mesh(
          deckPatch(surface, x - 1.8, x + 1.8, start, end, 0.025),
          polished,
        ),
      );
    }
  }
  for (const jump of track.jumps.filter((j) => j.optional)) {
    const divider = new T.Mesh(
      sweepGeometry(track, boxProfile(5.95, 0.55, 0.9, 1.1), {
        start: jump.takeoff,
        end: jump.landingStart,
        step: 2,
      }),
      milk,
    );
    divider.name = 'Branch bypass main-road protective divider';
    group.add(divider);
    group.add(
      new T.Mesh(
        sweepGeometry(track, boxProfile(5.95, 1.13, 0.28, 0.08), {
          start: jump.takeoff,
          end: jump.landingStart,
          step: 2,
        }),
        vein,
      ),
    );
  }
  // Visible films are clipped to the exact same physical zone and road mesh.
  if (!shape) {
    const surfaces = group.children.filter(
      (mesh) => mesh.userData.drivingSurface,
    );
    for (const zone of track.sapZones)
      for (const surface of surfaces)
        for (const [a, b] of [
          [-13.9, zone.resinCenter - zone.resinHalfWidth],
          [zone.resinCenter + zone.resinHalfWidth, 13.9],
        ]) {
          const geometry = deckPatch(
            surface,
            a,
            b,
            zone.start,
            zone.end,
            0.045,
          );
          if (geometry.index.count) group.add(new T.Mesh(geometry, sap));
          else geometry.dispose();
        }
  }
  group.traverse((o) => {
    if (o.material === sap) {
      o.name = 'Flowing sap film';
      o.userData.sapFilm = true;
    }
  });
  const seals = [],
    petals = [[], [], []],
    roots = [],
    clamps = [],
    inlays = [];
  const box = new T.BoxGeometry(1, 1, 1);
  for (let s = 10; s < track.length; s += 20) {
    if (track.isGap(s, 0)) continue;
    const f = track.sample(s);
    const optional = track.isGap(s, 9);
    const m = new T.Matrix4().compose(
      framePoint(f, optional ? -4.25 : 0, 0.06),
      f.quaternion,
      new T.Vector3(optional ? 19.5 : 28, 0.1, 0.3),
    );
    seals.push(box.clone().applyMatrix4(m));
    if (!shape)
      for (const side of [-1, 1]) {
        if (side > 0 && optional) continue;
        const variant = Math.floor(s / 20) % 3;
        petals[variant].push(
          petalGeometry(side, variant).applyMatrix4(
            new T.Matrix4().compose(
              f.position,
              f.quaternion,
              new T.Vector3(1, 1, 1),
            ),
          ),
        );
        // Warm windows beneath the outer tissue expose resin depth.
        inlays.push(
          box
            .clone()
            .applyMatrix4(
              new T.Matrix4().compose(
                framePoint(f, side * 15.6, -1.4),
                f.quaternion,
                new T.Vector3(0.45, 0.5, 3.4),
              ),
            ),
        );
      }
  }
  if (!shape)
    for (let s = 18; s < track.length; s += 76) {
      if (track.isGap(s, 0)) continue;
      const f = track.sample(s);
      const anchor = framePoint(
        f,
        0,
        -Math.min(48, Math.max(24, (f.position.y + 80) * 0.55)),
      );
      for (const side of [-1, 1])
        for (const braid of [-1, 1]) {
          // These two crown sockets would cross the lower hollow spiral.
          // The adjacent shell-attached ribs carry this short crown span.
          if (side === 1 && s >= 1460 && s <= 1540) continue;
          const start = framePoint(f, side * 10, -3.8);
          const end = anchor
            .clone()
            .addScaledVector(f.right, side * 25)
            .addScaledVector(f.tangent, -17);
          const points = [
            start,
            framePoint(f, side * (15 + braid * 1.6), -13, -5),
            framePoint(f, side * (19 - braid * 1.6), -28, -10),
            end,
          ];
          roots.push(
            new T.TubeGeometry(
              new T.CatmullRomCurve3(points),
              12,
              1.3,
              6,
              false,
            ),
          );
          clamps.push(
            new T.CylinderGeometry(2, 2, 2.4, 8).applyMatrix4(
              new T.Matrix4().compose(
                start,
                new T.Quaternion().setFromUnitVectors(
                  new T.Vector3(0, 1, 0),
                  end.clone().sub(start).normalize(),
                ),
                new T.Vector3(1, 1, 1),
              ),
            ),
          );
        }
    }
  box.dispose();
  mergeParts(group, seals, milk, 'Translucent reinforcement joints');
  petals.forEach((parts, i) =>
    mergeParts(
      group,
      parts,
      i === 1 ? tissue : i === 2 ? smoked : amber,
      `Hooked petal family ${i}`,
    ),
  );
  mergeParts(group, roots, bark, 'Paired braided load roots');
  mergeParts(group, clamps, metal, 'Maintenance sleeves and root sockets');
  mergeParts(group, inlays, vein, 'Amber resin edge windows');
  // Launch teeth and catch bands are geometry, readable in both quality presets.
  for (const jump of track.jumps) {
    for (const offset of [-50, -32, -16]) {
      const f = track.sample(jump.takeoff + offset);
      const width = jump.optional ? 6 : 22;
      const marker = new T.Mesh(new T.BoxGeometry(width, 0.09, 1.4), vein);
      marker.position.copy(framePoint(f, jump.optional ? 9 : 0, 0.12));
      marker.quaternion.copy(f.quaternion);
      group.add(marker);
    }
    const f = track.sample(jump.landingStart + 2);
    const marker = new T.Mesh(
      new T.BoxGeometry(jump.optional ? 8 : 27, 0.09, 3),
      polished,
    );
    marker.position.copy(framePoint(f, jump.optional ? 9 : 0, 0.1));
    marker.quaternion.copy(f.quaternion);
    group.add(marker);
  }
  return {
    group,
    update({ time, settings }) {
      sapClock.value = settings.reducedMotion ? 0 : time;
    },
    dispose() {
      const gs = new Set(),
        ms = new Set();
      group.traverse((o) => {
        if (o.geometry) gs.add(o.geometry);
        if (o.material)
          (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) =>
            ms.add(m),
          );
      });
      gs.forEach((g) => g.dispose());
      ms.forEach((m) => m.dispose());
      group.clear();
    },
  };
}
