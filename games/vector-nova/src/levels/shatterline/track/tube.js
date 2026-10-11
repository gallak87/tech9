import * as T from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { shatterlineGroundHeight } from '../environment/terrain.js';
import { finishShatterlineMaterial } from '../environment/materials.js';
import { MESH_STEPS, quadTriangles } from './tube-tessellation.js';

const SHELL_THICKNESS = 0.72;
const COLLAR_SPACING = 152;

function sheetGeometry(track, chunk, outward = 0, reverse = false) {
  const positions = [],
    normals = [],
    uv = [],
    roadCoord = [],
    indices = [];
  for (const s of chunk.stations) {
    for (let column = 0; column <= MESH_STEPS.columns; column++) {
      const { position, up, lateral } = track.tubeMesh.sheetVertex(
        s,
        column,
        outward,
      );
      positions.push(...position.toArray());
      normals.push(
        ...up
          .clone()
          .multiplyScalar(reverse ? -1 : 1)
          .toArray(),
      );
      uv.push(lateral / 18, s / 52);
      roadCoord.push(s, lateral);
    }
  }
  const stride = MESH_STEPS.columns + 1;
  for (let row = 0; row < chunk.stations.length - 1; row++)
    for (let column = 0; column < MESH_STEPS.columns; column++) {
      const a = row * stride + column,
        b = a + 1,
        c = a + stride,
        d = c + 1;
      for (const face of quadTriangles(a, b, c, d, reverse))
        indices.push(...face);
    }
  const geometry = new T.BufferGeometry();
  geometry.setAttribute('position', new T.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new T.Float32BufferAttribute(normals, 3));
  geometry.setAttribute('uv', new T.Float32BufferAttribute(uv, 2));
  geometry.setAttribute(
    'roadCoord',
    new T.Float32BufferAttribute(roadCoord, 2),
  );
  geometry.setIndex(indices);
  geometry.computeBoundingSphere();
  return geometry;
}

function rimGeometry(track, chunk, side, { guide = false } = {}) {
  const positions = [],
    indices = [];
  const stride = guide
    ? track.tubeProfile(chunk.start).rimCrossSection.length
    : 4;
  for (const s of chunk.stations)
    for (let index = 0; index < stride; index++)
      positions.push(
        ...track.tubeMesh.rimVertex(s, side, index, guide).toArray(),
      );
  for (let row = 0; row < chunk.stations.length - 1; row++)
    for (let face = 0; face < stride; face++) {
      const a = row * stride + face,
        b = row * stride + ((face + 1) % stride),
        c = a + stride,
        d = b + stride;
      for (const triangle of quadTriangles(a, b, c, d, side !== 1))
        indices.push(...triangle);
    }
  // The two taper tips collapse to a line when a guide disappears. Omit those
  // zero-area faces from both the visible mesh and the physical triangle soup.
  const filtered = [];
  const a = new T.Vector3(),
    b = new T.Vector3(),
    c = new T.Vector3();
  for (let i = 0; i < indices.length; i += 3) {
    a.fromArray(positions, indices[i] * 3);
    b.fromArray(positions, indices[i + 1] * 3);
    c.fromArray(positions, indices[i + 2] * 3);
    if (b.sub(a).cross(c.sub(a)).lengthSq() > 1e-12)
      filtered.push(indices[i], indices[i + 1], indices[i + 2]);
  }
  const geometry = new T.BufferGeometry();
  geometry.setAttribute('position', new T.Float32BufferAttribute(positions, 3));
  geometry.setIndex(filtered);
  geometry.computeVertexNormals();
  return geometry;
}

function polymerMaterial({ shape = false, outer = false, exit = null } = {}) {
  const material = new T.MeshPhysicalMaterial({
    name: `Shatterline / ${outer ? 'outer' : 'inner'} structural polymer`,
    color: shape ? '#8cabb4' : '#92b0b8',
    roughness: 0.32,
    metalness: 0,
    transparent: !shape,
    opacity: shape ? 1 : outer ? 0.075 : 0.17,
    depthWrite: shape,
    side: T.FrontSide,
    ior: 1.36,
    specularIntensity: 0.28,
    clearcoat: 0.18,
    clearcoatRoughness: 0.4,
    emissive: '#243b41',
    emissiveIntensity: 0.12,
  });
  if (exit)
    material.userData.exitGuidance = {
      color: '#D01818',
      start: exit.guidanceStart,
      end: exit.guidanceEnd,
      referenceLateral: exit.exitReferenceLateral,
    };
  if (!outer && !shape) {
    // Static, derivative-filtered material inlays stay legible without thin
    // coplanar decals, animated glare or subpixel grid scintillation.
    material.onBeforeCompile = (shader) => {
      shader.uniforms.slTubeExit = {
        value: new T.Vector4(
          exit.guidanceStart,
          exit.guidanceEnd,
          exit.exitReferenceLateral,
          exit.radius,
        ),
      };
      shader.vertexShader =
        'varying vec2 slTubeUv;\n' +
        shader.vertexShader.replace(
          '#include <begin_vertex>',
          '#include <begin_vertex>\nslTubeUv=uv;',
        );
      shader.fragmentShader =
        'varying vec2 slTubeUv;\nuniform vec4 slTubeExit;\n' +
        shader.fragmentShader
          .replace(
            '#include <color_fragment>',
            `#include <color_fragment>
vec2 slTubeCell=abs(fract(slTubeUv+.5)-.5);
vec2 slTubeAA=max(fwidth(slTubeUv),vec2(.0001));
vec2 slTubeLine=vec2(1.)-smoothstep(vec2(.0035,.0022),vec2(.0035,.0022)+slTubeAA*1.5,slTubeCell);
slTubeLine*=vec2(1.)-smoothstep(vec2(.04),vec2(.18),slTubeAA);
float slTubeGrid=max(slTubeLine.x*.8,slTubeLine.y*.44);
diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.30,.48,.52),slTubeGrid*.45);
diffuseColor.a=min(.34,diffuseColor.a+slTubeGrid*.14);
float slExitDistance=slTubeUv.y*52.;
float slExitProgress=clamp((slExitDistance-slTubeExit.x)/(slTubeExit.y-slTubeExit.x),0.,1.);
float slExitAcross=abs(slTubeUv.x*18.-slTubeExit.z);
float slExitSpread=pow(1.-slExitProgress,1.25)*slTubeExit.w*2.35;
float slExitLine=min(slExitAcross,min(abs(slExitAcross-slExitSpread),abs(slExitAcross-slExitSpread*.5)));
float slExitAA=max(fwidth(slExitLine),.012);
float slExitPaint=(1.-smoothstep(.85,.85+slExitAA,slExitLine))*step(slTubeExit.x,slExitDistance)*step(slExitDistance,slTubeExit.y);
vec3 slExitRed=vec3(.63076,.00913,.00913);
diffuseColor.rgb=mix(diffuseColor.rgb,slExitRed,slExitPaint);
diffuseColor.a=mix(diffuseColor.a,1.,slExitPaint);`,
          )
          .replace(
            '#include <emissivemap_fragment>',
            `#include <emissivemap_fragment>
totalEmissiveRadiance+=slExitRed*slExitPaint*.32;`,
          );
    };
    material.customProgramCacheKey = () => 'shatterline-static-polymer-exit-v2';
  }
  return material;
}

/** The sampled shell is both visible raceway and physical driving surface. */
export function createShatterlineTube({
  track,
  shape = false,
  collectSolid = null,
}) {
  const group = new T.Group();
  group.name = 'Shatterline / transparent induction tubes';
  const geometries = new Set(),
    materials = new Set();
  const add = (name, geometry, material, info = null) => {
    geometries.add(geometry);
    const mesh = new T.Mesh(geometry, material);
    mesh.name = name;
    mesh.userData.drivingSurface = info?.kind === 'deck';
    mesh.userData.roadSurface = info?.kind === 'deck';
    mesh.receiveShadow = !material.transparent;
    mesh.castShadow = !material.transparent;
    group.add(mesh);
    if (collectSolid && info) collectSolid({ name, geometry, ...info });
    return mesh;
  };
  const material = (name, parameters) => {
    const m = new T.MeshStandardMaterial({ name, ...parameters });
    materials.add(m);
    finishShatterlineMaterial(m);
    return m;
  };
  const inner = new Map(
    track.tubes.map((tube) => {
      const m = polymerMaterial({ shape, exit: tube });
      materials.add(m);
      return [tube.id, m];
    }),
  );
  const outer = polymerMaterial({ shape, outer: true });
  materials.add(outer);
  const titanium = material('Shatterline / tube titanium', {
    color: '#647a82',
    metalness: 0.61,
    roughness: 0.48,
  });
  const graphite = material('Shatterline / tube graphite isolation', {
    color: '#29383d',
    metalness: 0.26,
    roughness: 0.7,
  });
  const ceramic = material('Shatterline / tube cream ceramic shoes', {
    color: '#c0b9a7',
    metalness: 0.07,
    roughness: 0.73,
  });
  const signal = material('Shatterline / steady tube induction inlay', {
    color: '#93bec4',
    emissive: '#629fa9',
    emissiveIntensity: 0.26,
    roughness: 0.6,
  });
  const exit = material('Shatterline / steady red exit outline', {
    color: '#D01818',
    emissive: '#D01818',
    emissiveIntensity: 0.32,
    metalness: 0.12,
    roughness: 0.58,
  });
  for (const [i, chunk] of track.tubeMesh.chunks.entries()) {
    const { start, end, closed, tubeId } = chunk;
    const tube = track.tubes.find((candidate) => candidate.id === tubeId);
    add(
      `Tube driving shell ${i}`,
      sheetGeometry(track, chunk),
      inner.get(tubeId),
      {
        kind: 'deck',
        start,
        end,
      },
    );
    add(
      `Tube outer shell ${i}`,
      sheetGeometry(track, chunk, SHELL_THICKNESS, true),
      outer,
      { kind: 'structure', start, end },
    );
    if (!closed)
      for (const side of [-1, 1]) {
        add(
          `Tube polymer edge ${side} ${i}`,
          rimGeometry(track, chunk, side),
          outer,
          { kind: 'structure', start, end },
        );
        add(
          `Tube gathering guide ${side} ${i}`,
          rimGeometry(track, chunk, side, { guide: true }),
          start >= tube.exitStart ? exit : ceramic,
          { kind: 'rail', roadBoundary: true, start, end },
        );
      }
  }
  const hardware = {
    titanium: [],
    graphite: [],
    ceramic: [],
    signal: [],
    exit: [],
  };
  const boxSource = new T.BoxGeometry(1, 1, 1),
    beamSource = new T.CylinderGeometry(1, 1, 1, 8),
    worldUp = new T.Vector3(0, 1, 0);
  const box = (key, position, quaternion, size) => {
    const g = boxSource.clone();
    g.deleteAttribute('uv');
    g.applyMatrix4(
      new T.Matrix4().compose(position, quaternion, new T.Vector3(...size)),
    );
    hardware[key].push(g);
  };
  const beam = (key, a, b, r) => {
    const d = b.clone().sub(a),
      g = beamSource.clone(),
      q = new T.Quaternion().setFromUnitVectors(worldUp, d.clone().normalize());
    g.deleteAttribute('uv');
    g.applyMatrix4(
      new T.Matrix4().compose(
        a.clone().add(b).multiplyScalar(0.5),
        q,
        new T.Vector3(r, d.length(), r),
      ),
    );
    hardware[key].push(g);
  };
  const collar = (s, radialWidth, depth, outward, key) => {
    const profile = track.tubeProfile(s),
      positions = [],
      indices = [],
      segments = 128;
    for (let i = 0; i <= segments; i++) {
      const lateral = T.MathUtils.lerp(
        -profile.halfWidth,
        profile.halfWidth,
        i / segments,
      );
      const f = track.sampleSurface(s, lateral);
      for (const [r, z] of [
        [outward, -depth / 2],
        [outward + radialWidth, -depth / 2],
        [outward, depth / 2],
        [outward + radialWidth, depth / 2],
      ])
        positions.push(
          ...f.position
            .clone()
            .addScaledVector(f.up, -r)
            .addScaledVector(f.tangent, z)
            .toArray(),
        );
    }
    for (let i = 0; i < segments; i++) {
      const n = i * 4;
      indices.push(
        n,
        n + 4,
        n + 5,
        n,
        n + 5,
        n + 1,
        n + 2,
        n + 3,
        n + 7,
        n + 2,
        n + 7,
        n + 6,
        n,
        n + 2,
        n + 6,
        n,
        n + 6,
        n + 4,
        n + 1,
        n + 5,
        n + 7,
        n + 1,
        n + 7,
        n + 3,
      );
    }
    const g = new T.BufferGeometry();
    g.setAttribute('position', new T.Float32BufferAttribute(positions, 3));
    g.setIndex(indices);
    g.computeVertexNormals();
    hardware[key].push(g);
  };
  for (const tube of track.tubes) {
    // A substantial fixed red collar announces the collector before its sheet opens.
    collar(tube.exitStart - 8, 1.8, 3.6, SHELL_THICKNESS + 0.18, 'exit');
    let ordinal = 0;
    for (let s = tube.start + 78; s < tube.end - 55; s += COLLAR_SPACING) {
      const p = track.tubeProfile(s);
      collar(s, 1.7, 2.2, SHELL_THICKNESS + 0.18, 'titanium');
      collar(s, 0.52, 3.4, SHELL_THICKNESS + 1.84, 'graphite');
      for (const side of [-1, 1]) {
        const lateral =
          side * Math.min(p.halfWidth * 0.76, Math.PI * tube.radius * 0.52);
        const f = track.sampleSurface(s, lateral);
        box(
          'ceramic',
          f.position.clone().addScaledVector(f.up, -3.5),
          f.quaternion,
          [6, 3.8, 7],
        );
        box(
          'graphite',
          f.position.clone().addScaledVector(f.up, -5.8),
          f.quaternion,
          [5.2, 1.2, 8],
        );
        box(
          'titanium',
          f.position.clone().addScaledVector(f.up, -6.8),
          f.quaternion,
          [3.8, 1.2, 10],
        );
        // The guide is embedded in the outside face; it never occupies the bore.
        box(
          'signal',
          f.position.clone().addScaledVector(f.up, -0.79),
          f.quaternion,
          [1.3, 0.08, 5.4],
        );
      }
      if (ordinal++ % 2 !== 0) continue;
      const base = track.sample(s),
        right = new T.Vector3().crossVectors(worldUp, base.tangent).normalize();
      const yaw = new T.Quaternion().setFromAxisAngle(
        worldUp,
        Math.atan2(base.tangent.x, base.tangent.z),
      );
      for (const side of [-1, 1]) {
        const f = track.sampleSurface(
          s,
          side * Math.min(p.halfWidth * 0.76, Math.PI * tube.radius * 0.52),
        );
        const attachment = f.position.clone().addScaledVector(f.up, -7.2);
        // An inverted sheet swaps its local sides in world space. Keep the
        // gravity pier on the attachment's actual outside, never across the bore.
        const worldSide =
          Math.sign(attachment.clone().sub(base.position).dot(right)) || side;
        const pier = base.position
          .clone()
          .addScaledVector(right, worldSide * 108);
        const floor = shatterlineGroundHeight(track, pier.x, pier.z) - 8,
          top = attachment.y;
        if (floor >= top - 20) continue;
        const h = top - floor;
        box('ceramic', pier.clone().setY(floor + 6), yaw, [35, 12, 42]);
        box('graphite', pier.clone().setY(floor + 15), yaw, [29, 6, 35]);
        for (const x of [-7, 7])
          box(
            'titanium',
            pier
              .clone()
              .addScaledVector(right, x)
              .setY(floor + h / 2),
            yaw,
            [5, h, 12],
          );
        box('ceramic', pier.clone().setY(top - 5), yaw, [28, 12, 27]);
        beam('titanium', attachment, pier.clone().setY(top), 2.3);
        beam(
          'titanium',
          attachment.clone().addScaledVector(base.tangent, 8),
          pier.clone().setY(top - 22),
          1.6,
        );
        for (let y = floor + 35; y < top - 20; y += 85) {
          box('graphite', pier.clone().setY(y), yaw, [24, 5, 22]);
          const a = pier.clone().addScaledVector(right, -7).setY(y),
            b = pier
              .clone()
              .addScaledVector(right, 7)
              .setY(Math.min(top - 10, y + 78));
          beam('titanium', a, b, 1.3);
          beam('titanium', a.clone().setY(b.y), b.clone().setY(a.y), 1.3);
        }
      }
    }
  }
  for (const [key, parts] of Object.entries(hardware)) {
    if (!parts.length) continue;
    const geometry = mergeGeometries(parts, false);
    parts.forEach((g) => g.dispose());
    add(
      `Tube external ${key}`,
      geometry,
      { titanium, graphite, ceramic, signal, exit }[key],
      key === 'signal'
        ? null
        : {
            kind: 'structure',
            start: track.tubes[0].start,
            end: track.tubes.at(-1).end,
          },
    );
  }
  boxSource.dispose();
  beamSource.dispose();
  return {
    group,
    setReflection(texture) {
      for (const m of materials) {
        m.envMap = texture;
        m.envMapIntensity = m.transparent ? 0.38 : 0.48;
        m.needsUpdate = true;
      }
    },
    dispose() {
      for (const g of geometries) g.dispose();
      for (const m of materials) m.dispose();
      group.clear();
    },
  };
}
