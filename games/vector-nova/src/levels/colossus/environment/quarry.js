import * as T from 'three';
import {
  mergeVertices,
  toCreasedNormals,
} from 'three/addons/utils/BufferGeometryUtils.js';
import { FOREST_MATERIAL_ASSETS } from '@worldkit/environment/forest';
import { createColossusLandform } from './mountains.js';

/** Local extraction benches cut into the mountain shoulder below the works. */
export function createQuarry(track, renderer = null) {
  const material = new T.MeshStandardMaterial({
    color: '#92958b',
    roughness: 0.95,
    metalness: 0.02,
    flatShading: false,
    // Use one terrain atmosphere; scene fog would erase the distant rock twice.
    fog: false,
  });
  const manager = new T.LoadingManager();
  let disposed = false,
    texture = null;
  const ready = renderer
    ? new T.TextureLoader(manager)
        .loadAsync(FOREST_MATERIAL_ASSETS.rockColor)
        .then((map) => {
          if (disposed) {
            map.dispose();
            return;
          }
          texture = map;
          map.wrapS = map.wrapT = T.RepeatWrapping;
          map.colorSpace = T.SRGBColorSpace;
          map.anisotropy = Math.min(
            8,
            renderer.capabilities.getMaxAnisotropy(),
          );
          material.map = map;
          material.needsUpdate = true;
        })
    : Promise.resolve();
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        '#include <common>\nvarying vec3 quarryPoint;',
      )
      .replace(
        '#include <project_vertex>',
        '#include <project_vertex>\nvec4 quarryWorld=vec4(transformed,1.);\n#ifdef USE_INSTANCING\nquarryWorld=instanceMatrix*quarryWorld;\n#endif\nquarryPoint=(modelMatrix*quarryWorld).xyz;',
      );
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <common>',
      '#include <common>\nvarying vec3 quarryPoint;\nfloat quarryHash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}\nfloat quarryNoise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(quarryHash(i),quarryHash(i+vec2(1.,0.)),f.x),mix(quarryHash(i+vec2(0.,1.)),quarryHash(i+vec2(1.)),f.x),f.y);}',
    );
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <map_fragment>',
      `float quarryRelief=0.;
      #ifdef USE_MAP
      vec3 w=pow(abs(normalize(cross(dFdx(quarryPoint),dFdy(quarryPoint)))),vec3(4.));w/=max(.001,w.x+w.y+w.z);
      vec3 grain=texture2D(map,quarryPoint.yz/32.).rgb*w.x+texture2D(map,quarryPoint.xz/32.).rgb*w.y+texture2D(map,quarryPoint.xy/32.).rgb*w.z;
      vec3 fracture=texture2D(map,quarryPoint.yz/145.+.37).rgb*w.x+texture2D(map,quarryPoint.xz/145.+.37).rgb*w.y+texture2D(map,quarryPoint.xy/145.+.37).rgb*w.z;
      grain=mix(grain,fracture,.65);
      quarryRelief=dot(grain,vec3(.299,.587,.114));
      diffuseColor.rgb*=mix(vec3(.96),vec3(quarryRelief*2.7),.64);
      #endif
      vec3 faceNormal=normalize(cross(dFdx(quarryPoint),dFdy(quarryPoint)));
      float benchDust=smoothstep(.50,.90,abs(faceNormal.y));
      // Bedding follows the folded mountain, while fractured joints cut across
      // it. Broad mineral masses remain legible beyond the fine rock scan.
      vec2 plan=quarryPoint.xz;
      float warp=quarryNoise(plan*.0017)*47.+quarryNoise(plan*.006)*12.;
      float foldedHeight=quarryPoint.y+sin(quarryPoint.x*.0015+sin(quarryPoint.z*.0012))*65.+quarryPoint.z*.035;
      float layer=quarryNoise(vec2((foldedHeight+warp)*.035,quarryPoint.x*.0007));
      float mineral=quarryNoise(plan*.003+vec2(quarryPoint.y*.0018));
      vec3 bedrock=mix(vec3(.34,.40,.42),vec3(.76,.69,.53),smoothstep(.22,.82,layer));
      bedrock=mix(bedrock,vec3(.46,.49,.46),mineral*.35);
      float seamCoord=(foldedHeight+warp+quarryNoise(plan*.014)*16.)/27.;
      float seam=1.-smoothstep(.025,.09,abs(fract(seamCoord)-.5));
      float jointCoord=quarryNoise(vec2((quarryPoint.x+quarryPoint.z*.63)*.022,quarryPoint.y*.035)+vec2(warp*.016));
      float joint=(1.-smoothstep(.015,.055,abs(jointCoord-.5)))*smoothstep(.38,.7,quarryNoise(plan*.018));
      float resolved=1.-smoothstep(.2,.75,max(fwidth(seamCoord),fwidth(jointCoord)));
      bedrock*=1.-resolved*(seam*.08*smoothstep(.38,.68,quarryNoise(plan*.027))+joint*.14)*(1.-benchDust*.8);
      float stonePatch=quarryNoise(plan*.009)+quarryNoise(plan*.035)*.3;
      vec3 dust=mix(vec3(.57,.55,.47),vec3(.88,.80,.64),smoothstep(.2,.95,stonePatch));
      diffuseColor.rgb*=mix(bedrock,dust,benchDust*.82);
      diffuseColor.rgb*=.82+.18*quarryNoise(plan*.018+quarryPoint.y*.002);
      quarryRelief+=quarryNoise(quarryPoint.xy*.08)*.32+resolved*(seam*.24+joint*.3);`,
    );
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <normal_fragment_maps>',
      `#include <normal_fragment_maps>
      vec3 qx=dFdx(-vViewPosition),qy=dFdy(-vViewPosition),qrX=cross(qy,normal),qrY=cross(normal,qx);
      float qdet=dot(qx,qrX); vec2 qSlope=vec2(dFdx(quarryRelief),dFdy(quarryRelief))*.11;
      normal=normalize(abs(qdet)*normal-sign(qdet)*(qSlope.x*qrX+qSlope.y*qrY));`,
    );
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <opaque_fragment>',
      `float terrainHaze=1.-exp(-max(0.,distance(cameraPosition,quarryPoint)-650.)*.000095);
      outgoingLight=mix(outgoingLight,vec3(.36,.43,.49),min(.78,terrainHaze));
      #include <opaque_fragment>`,
    );
  };
  material.customProgramCacheKey = () =>
    'colossus-mountain-quarry-v6-single-haze';
  const survey = [];
  for (let s = 0; s < track.length; s += 16)
    survey.push(track.sample(s).position);
  const landform = createColossusLandform(track);
  // The upper factory is excavated into connected rock shoulders. Starting
  // from the distant valley floor and only subtracting left every hall on
  // kilometre-high stilts. These broad district spines supply the missing site.
  const station = (id, drop) => {
    const section = track.sections.find((s) => s.id === id),
      p = track.sample((section.start + section.end) / 2).position;
    return { x: p.x, z: p.z, height: Math.max(70, p.y - drop) };
  };
  const shoulders = [
    {
      width: 245,
      points: ['headstock', 'intake', 'press', 'die'].map((id) =>
        station(id, 170),
      ),
    },
    {
      width: 230,
      points: ['counterweight', 'cooling', 'crown', 'headstock'].map((id) =>
        station(id, 155),
      ),
    },
    {
      width: 175,
      points: ['die', 'dive', 'crossfeed', 'auger', 'gantry'].map((id) =>
        station(id, 155),
      ),
    },
  ];
  const hash = (x, z) => {
    const n = Math.sin(x * 127.1 + z * 311.7) * 43758.5453;
    return n - Math.floor(n);
  };
  // Piecewise planar geology, with unequal 90–260 m fracture blocks. Unlike
  // sinusoidal displacement this creates broad angular cuts and broken ledges.
  const fractureAt = (x, z, scale) => {
    const px = x / scale,
      pz = z / scale,
      ix = Math.floor(px),
      iz = Math.floor(pz),
      u = px - ix,
      v = pz - iz,
      a = hash(ix, iz),
      b = hash(ix + 1, iz),
      c = hash(ix, iz + 1),
      d = hash(ix + 1, iz + 1);
    return (
      (u + v < 1
        ? a + (b - a) * u + (c - a) * v
        : d + (c - d) * (1 - u) + (b - d) * (1 - v)) *
        2 -
      1
    );
  };
  // A shared set of unequal joint directions creates long planar outcrops.
  // This norm never exceeds Euclidean distance, so using it for the protected
  // route cuts can only enlarge their clearance envelope.
  const jointAxes = [0.13, 0.81, 1.53, 2.31].map((a) => [
    Math.cos(a),
    Math.sin(a),
  ]);
  const jointDistance = (x, z) => {
    let distance = 0;
    for (const [a, b] of jointAxes)
      distance = Math.max(distance, Math.abs(x * a + z * b));
    return distance;
  };
  const naturalAt = (x, z) => {
    let height = landform.heightAt(x, z);
    const edge =
      fractureAt(x, z, 260) * 48 + fractureAt(x + 93, z - 71, 115) * 16;
    for (const shoulder of shoulders)
      for (let i = 0; i < shoulder.points.length - 1; i++) {
        const a = shoulder.points[i],
          b = shoulder.points[i + 1],
          dx = b.x - a.x,
          dz = b.z - a.z,
          t = T.MathUtils.clamp(
            ((x - a.x) * dx + (z - a.z) * dz) / (dx * dx + dz * dz),
            0,
            1,
          ),
          distance = jointDistance(x - a.x - dx * t, z - a.z - dz * t),
          crest = T.MathUtils.lerp(a.height, b.height, t),
          flank = Math.max(0, distance - shoulder.width - edge),
          shelf = crest - flank * 1.12;
        height = Math.max(height, shelf);
      }
    return height;
  };
  const bounds = track.bounds.clone().expandByScalar(900),
    step = 30;
  const nx = Math.ceil((bounds.max.x - bounds.min.x) / step),
    nz = Math.ceil((bounds.max.z - bounds.min.z) / step),
    positions = [],
    cells = new Uint32Array(nx * nz + 1),
    bands = [
      -90, 35, 150, 280, 440, 620, 790, 970, 1160, 1400, 1720, 2100, 2550, 3100,
    ];
  const axes = {
    x: Array.from({ length: nx + 1 }, (_, i) =>
      T.MathUtils.lerp(bounds.min.x, bounds.max.x, i / nx),
    ),
    z: Array.from({ length: nz + 1 }, (_, i) =>
      T.MathUtils.lerp(bounds.min.z, bounds.max.z, i / nz),
    ),
  };
  const faults = ['screw', 'die', 'cooling'].map((id, i) => {
    const zone = track.sections.find((s) => s.id === id),
      f = track.sample(zone.start + 180),
      p = f.position.clone().addScaledVector(f.right, i % 2 ? -480 : 480);
    return { x: p.x, z: p.z, angle: 0.45 + i * 0.93 };
  });
  const siteCenter = track.bounds.getCenter(new T.Vector3());
  const excavationBays = [
    ['press', 435, 185, 1.0, false],
    ['die', 455, 205, 1.15, true],
    ['gantry', 420, 160, 0.85, true],
    ['cooling', 425, 220, 1.1, true],
    ['crown', 460, 210, 0.95, false],
  ].flatMap(([id, reach, depth, scale, talus], index) => {
    const section = track.sections.find((s) => s.id === id),
      p = track.sample((section.start + section.end) / 2).position,
      outward = new T.Vector2(
        p.x - siteCenter.x,
        p.z - siteCenter.z,
      ).normalize(),
      along = new T.Vector2(-outward.y, outward.x),
      origin = new T.Vector2(p.x, p.z).addScaledVector(outward, reach),
      floor = Math.max(-45, p.y - 170 - depth);
    const make = (outline, offset, slope = 0) => {
      const vertices = outline.map(([x, z]) => [x * scale, z * scale]);
      const planes = vertices.map((a, i) => {
        const b = vertices[(i + 1) % vertices.length],
          dx = b[0] - a[0],
          dz = b[1] - a[1],
          length = Math.hypot(dx, dz);
        return {
          x: dz / length,
          z: -dx / length,
          edge: (dz * a[0] - dx * a[1]) / length,
        };
      });
      return {
        origin: origin.clone().addScaledVector(along, offset),
        outward,
        along,
        planes,
        floor,
        slope,
      };
    };
    // Broad dogleg-shaped blast bays interrupt the circular terrace contour.
    // A few sloping extraction aprons cross multiple ledges instead of making
    // every district another stack of parallel horizontal rings.
    const cuts = [
      make(
        [
          [-180, -95],
          [-35, -155],
          [155, -80],
          [205, 55],
          [55, 145],
          [-145, 115],
        ],
        0,
      ),
    ];
    if (talus)
      cuts.push(
        make(
          [
            [-90, -180],
            [70, -135],
            [110, 175],
            [-115, 160],
          ],
          index % 2 ? -215 : 205,
          0.63,
        ),
      );
    return cuts;
  });
  const bayCeilingAt = (x, z) => {
    let ceiling = 100000;
    for (const bay of excavationBays) {
      const dx = x - bay.origin.x,
        dz = z - bay.origin.y,
        along = dx * bay.along.x + dz * bay.along.y,
        outward = dx * bay.outward.x + dz * bay.outward.y,
        outside = Math.max(
          0,
          ...bay.planes.map((p) => p.x * along + p.z * outward - p.edge),
        ),
        floor = bay.floor + bay.slope * (155 - outward);
      ceiling = Math.min(ceiling, floor + outside * (bay.slope ? 2.6 : 3.2));
    }
    return ceiling;
  };
  const fieldAt = (x, z) => {
    let roof = Infinity,
      nearest = Infinity;
    for (const p of survey) {
      const d = jointDistance(x - p.x, z - p.z);
      nearest = Math.min(nearest, d);
      // Keep the same 125 m protected corridor, but allow steep quarried
      // faces outside it. A shallow cone flattened distant upper districts
      // merely because a much lower route passed several hundred metres away.
      roof = Math.min(roof, p.y - 95 + Math.max(0, d - 125) * 2.35);
    }
    // Only the factory shoulder is excavated. The same uncut height field
    // continues through the outer mesh and supplies the mountain skyline.
    const broken =
        fractureAt(x, z, 260) * 52 + fractureAt(x + 93, z - 71, 115) * 15,
      warp = broken * T.MathUtils.smoothstep(nearest, 125, 240),
      datum = fractureAt(x - 50, z + 170, 520) * 32,
      natural = naturalAt(x, z);
    return {
      x,
      z,
      roof,
      nearest,
      natural,
      datum,
      bayCeiling: bayCeilingAt(x, z),
      cut: Math.min(natural, roof + warp) - datum,
    };
  };
  const surfacesAt = ({
    x,
    z,
    roof,
    nearest,
    natural,
    datum,
    cut,
    bayCeiling,
  }) => {
    let low = bands[0],
      high = bands[1];
    for (let i = 0; i < bands.length - 1; i++)
      if (cut >= bands[i]) {
        low = bands[i];
        high = bands[i + 1];
      }
    const u = T.MathUtils.clamp((cut - low) / (high - low), 0, 1);
    const face = T.MathUtils.clamp((u - 0.88) / 0.12, 0, 1);
    const bench = datum + low + (high - low) * face;
    // Intersecting fracture valleys interrupt the excavation walls and produce
    // rubble aprons. Subtraction preserves the route's conservative height roof.
    let cleft = 0;
    for (const f of faults) {
      const dx = x - f.x,
        dz = z - f.z,
        across = Math.abs(dx * Math.cos(f.angle) + dz * Math.sin(f.angle)),
        along = Math.abs(-dx * Math.sin(f.angle) + dz * Math.cos(f.angle));
      cleft +=
        Math.max(0, 1 - across / 65) *
        T.MathUtils.clamp((460 - along) / 180, 0, 1) *
        78;
    }
    cleft *= T.MathUtils.smoothstep(nearest, 145, 310) * 0.55;
    const benchBreak =
      fractureAt(x + 35, z - 80, 170) *
      15 *
      T.MathUtils.smoothstep(nearest, 120, 260);
    const rubble =
      fractureAt(x, z, 90) * 4 * T.MathUtils.smoothstep(nearest, 110, 180);
    const excavation = 1 - T.MathUtils.smoothstep(nearest, 380, 780),
      cutHeight = bench + rubble + benchBreak - cleft,
      ground = T.MathUtils.lerp(natural, cutHeight, excavation),
      clearance = T.MathUtils.lerp(
        roof - 8,
        natural,
        T.MathUtils.smoothstep(nearest, 520, 820),
      );
    return {
      ground: Math.max(-72, ground),
      natural: Math.max(-72, natural),
      clearance: Math.max(-72, clearance),
      bayCeiling: Math.max(-72, bayCeiling),
    };
  };
  const elevation = (p) => Math.min(...Object.values(surfacesAt(p)));
  const heightAt = (x, z) =>
    x < bounds.min.x || x > bounds.max.x || z < bounds.min.z || z > bounds.max.z
      ? naturalAt(x, z)
      : elevation(fieldAt(x, z));
  // Split the surface at exact bench contours. A regular grid straddling steep
  // risers produces alternating triangular teeth; the ledges need their own edges.
  const knees = bands
    .slice(0, -1)
    .flatMap((lo, i) => [lo + (bands[i + 1] - lo) * 0.88, bands[i + 1]]);
  const grid = [];
  for (let z = 0; z <= nz; z++)
    for (let x = 0; x <= nx; x++) grid.push(fieldAt(axes.x[x], axes.z[z]));
  const clip = (poly, cut, above) => {
    const result = [];
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i],
        b = poly[(i + 1) % poly.length],
        insideA = above ? a.cut >= cut : a.cut <= cut,
        insideB = above ? b.cut >= cut : b.cut <= cut;
      if (insideA) result.push(a);
      if (insideA !== insideB) {
        const t = (cut - a.cut) / (b.cut - a.cut),
          p = {};
        for (const key of [
          'x',
          'z',
          'roof',
          'nearest',
          'natural',
          'datum',
          'bayCeiling',
          'cut',
        ])
          p[key] = T.MathUtils.lerp(a[key], b[key], t);
        p.cut = cut;
        result.push(p);
      }
    }
    return result;
  };
  const triangle = (a, b, c) => {
    let remaining = [a, b, c];
    const lo = Math.min(a.cut, b.cut, c.cut),
      hi = Math.max(a.cut, b.cut, c.cut);
    const emit = (poly) => {
      const samples = poly.map((p) => ({ ...p, ...surfacesAt(p) }));
      // Each height constraint must be affine over its input polygon. Split
      // the contour fan first: clipping a four-corner saddle as one plane can
      // join opposite corners into the visible triangular ledge fringes.
      let pieces = [];
      for (let i = 1; i < samples.length - 1; i++)
        pieces.push([samples[0], samples[i], samples[i + 1]]);
      const split = (polygon, key, below) => {
        const result = [];
        for (let i = 0; i < polygon.length; i++) {
          const a = polygon[i],
            b = polygon[(i + 1) % polygon.length],
            da = a.ground - a[key],
            db = b.ground - b[key],
            insideA = below ? da <= 0 : da >= 0,
            insideB = below ? db <= 0 : db >= 0;
          if (insideA) result.push(a);
          if (insideA !== insideB) {
            const t = da / (da - db),
              p = {};
            for (const k of Object.keys(a))
              p[k] = T.MathUtils.lerp(a[k], b[k], t);
            p.ground = p[key];
            result.push(p);
          }
        }
        return result;
      };
      for (const cap of ['natural', 'clearance']) {
        const next = [];
        for (const sourcePolygon of pieces) {
          // Snap numerically coincident planes before classifying a split.
          // Otherwise round-off can invent a midpoint on only one side of a
          // shared coplanar ledge edge, creating a T-junction or tiny wedge.
          const polygon = sourcePolygon.map((p) =>
            Math.abs(p.ground - p[cap]) < 0.000001
              ? { ...p, ground: p[cap] }
              : p,
          );
          const differences = polygon.map((p) => p.ground - p[cap]);
          if (differences.every((d) => d <= 0)) {
            next.push(polygon);
            continue;
          }
          if (differences.every((d) => d >= 0)) {
            next.push(polygon.map((p) => ({ ...p, ground: p[cap] })));
            continue;
          }
          const low = split(polygon, cap, true),
            high = split(polygon, cap, false);
          if (low.length >= 3) next.push(low);
          if (high.length >= 3)
            next.push(high.map((p) => ({ ...p, ground: p[cap] })));
        }
        pieces = next;
      }
      // A blast bay is the maximum of its floor and outward face planes.
      // Sampling that convex surface at grid corners bridges across its joints,
      // leaving triangular ramps above a flat floor. Partition at the actual
      // plane joints before capping, so each ledge meets a continuous cut face.
      const clipPlane = (polygon, distance) => {
        const result = [];
        for (let i = 0; i < polygon.length; i++) {
          const a = polygon[i],
            b = polygon[(i + 1) % polygon.length],
            da0 = distance(a),
            db0 = distance(b),
            da = Math.abs(da0) < 0.000001 ? 0 : da0,
            db = Math.abs(db0) < 0.000001 ? 0 : db0;
          if (da >= 0) result.push(a);
          if (da >= 0 !== db >= 0) {
            const t = da / (da - db),
              p = {};
            for (const k of Object.keys(a))
              p[k] = T.MathUtils.lerp(a[k], b[k], t);
            result.push(p);
          }
        }
        return result;
      };
      for (const bay of excavationBays) {
        const planeAt = (p, plane) => {
          const dx = p.x - bay.origin.x,
            dz = p.z - bay.origin.y,
            along = dx * bay.along.x + dz * bay.along.y,
            outward = dx * bay.outward.x + dz * bay.outward.y,
            floor = bay.floor + bay.slope * (155 - outward);
          return (
            floor +
            (plane
              ? (plane.x * along + plane.z * outward - plane.edge) *
                (bay.slope ? 2.6 : 3.2)
              : 0)
          );
        };
        const planes = [null, ...bay.planes],
          next = [];
        for (const polygon of pieces) {
          // A single face above the whole polygon proves the maximum cannot
          // cut it. This rejects almost all remote bays without subdivision.
          if (
            planes.some((plane) =>
              polygon.every((p) => planeAt(p, plane) >= p.ground - 0.000001),
            )
          ) {
            next.push(polygon);
            continue;
          }
          for (let i = 0; i < planes.length; i++) {
            let region = polygon;
            for (let j = 0; j < planes.length && region.length >= 3; j++) {
              if (i === j) continue;
              region = clipPlane(
                region,
                (p) => planeAt(p, planes[i]) - planeAt(p, planes[j]),
              );
            }
            if (region.length < 3) continue;
            const lower = clipPlane(
                region,
                (p) => planeAt(p, planes[i]) - p.ground,
              ),
              upper = clipPlane(
                region,
                (p) => p.ground - planeAt(p, planes[i]),
              );
            if (lower.length >= 3) next.push(lower);
            if (upper.length >= 3)
              next.push(
                upper.map((p) => ({
                  ...p,
                  ground: Math.max(-72, planeAt(p, planes[i])),
                })),
              );
          }
        }
        pieces = next;
      }
      for (const polygon of pieces) {
        // Clipping exactly on a contour can duplicate vertices; remove those
        // before fan triangulation instead of leaving zero-area sliver faces.
        const clean = polygon.filter((p, i) => {
          const previous = polygon[(i + polygon.length - 1) % polygon.length];
          return Math.hypot(p.x - previous.x, p.z - previous.z) > 0.00001;
        });
        for (let i = 1; i < clean.length - 1; i++) {
          const vertices = [clean[0], clean[i], clean[i + 1]],
            [a, b, c] = vertices,
            area = Math.abs(
              (b.x - a.x) * (c.z - a.z) - (c.x - a.x) * (b.z - a.z),
            );
          if (area < 1e-12) continue;
          for (const p of vertices) positions.push(p.x, p.ground, p.z);
        }
      }
    };
    for (const knee of knees) {
      if (knee <= lo || knee >= hi) continue;
      emit(clip(remaining, knee, false));
      remaining = clip(remaining, knee, true);
    }
    emit(remaining);
  };
  for (let z = 0; z < nz; z++)
    for (let x = 0; x < nx; x++) {
      cells[z * nx + x] = positions.length;
      const a = z * (nx + 1) + x,
        b = a + nx + 1;
      triangle(grid[a], grid[b], grid[a + 1]);
      triangle(grid[a + 1], grid[b], grid[b + 1]);
    }
  cells[nx * nz] = positions.length;
  const terrainTriangles = new Float32Array(positions);
  positions.length = 0;
  let geometry = new T.BufferGeometry();
  geometry.setAttribute('position', new T.BufferAttribute(terrainTriangles, 3));
  const raw = geometry;
  geometry = mergeVertices(raw, 0.001);
  raw.dispose();
  geometry.computeVertexNormals();
  const smooth = geometry;
  geometry = toCreasedNormals(smooth, 0.48);
  smooth.dispose();
  geometry.computeBoundingSphere();
  // Footings query the same split triangles that are rendered. Evaluating the
  // continuous field can miss a steep cut by tens of metres between grid nodes.
  // Each cell stores a compact range into the original unindexed triangle data.
  const renderedHeightAt = (x, z) => {
    if (
      x < bounds.min.x ||
      x > bounds.max.x ||
      z < bounds.min.z ||
      z > bounds.max.z
    )
      return naturalAt(x, z);
    const ix = Math.min(
        nx - 1,
        Math.floor(((x - bounds.min.x) / (bounds.max.x - bounds.min.x)) * nx),
      ),
      iz = Math.min(
        nz - 1,
        Math.floor(((z - bounds.min.z) / (bounds.max.z - bounds.min.z)) * nz),
      ),
      cell = iz * nx + ix,
      epsilon = 0.00002;
    for (let i = cells[cell]; i < cells[cell + 1]; i += 9) {
      const ax = terrainTriangles[i],
        az = terrainTriangles[i + 2],
        bx = terrainTriangles[i + 3],
        bz = terrainTriangles[i + 5],
        cx = terrainTriangles[i + 6],
        cz = terrainTriangles[i + 8],
        denominator = (bz - cz) * (ax - cx) + (cx - bx) * (az - cz);
      if (Math.abs(denominator) < 1e-10) continue;
      const a = ((bz - cz) * (x - cx) + (cx - bx) * (z - cz)) / denominator,
        b = ((cz - az) * (x - cx) + (ax - cx) * (z - cz)) / denominator;
      if (a >= -epsilon && b >= -epsilon && a + b <= 1 + epsilon)
        return (
          a * terrainTriangles[i + 1] +
          b * terrainTriangles[i + 4] +
          (1 - a - b) * terrainTriangles[i + 7]
        );
    }
    // Only floating-point edge cases at the rectangle boundary reach here.
    return heightAt(x, z);
  };
  const mesh = new T.Mesh(geometry, material);
  mesh.name = 'Colossus / excavated mountain shoulder';
  mesh.receiveShadow = true;
  mesh.castShadow = true;
  return {
    mesh,
    material,
    ready,
    heightAt: renderedHeightAt,
    bounds,
    axes,
    dispose() {
      if (disposed) return;
      disposed = true;
      manager.abort();
      geometry.dispose();
      material.dispose();
      texture?.dispose();
    },
  };
}
