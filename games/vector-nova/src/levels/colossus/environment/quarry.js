import * as T from 'three';
import {
  mergeVertices,
  toCreasedNormals,
} from 'three/addons/utils/BufferGeometryUtils.js';
import { FOREST_MATERIAL_ASSETS } from '@worldkit/environment/forest';

/** A connected terraced quarry cut below every route reach, including crossings. */
export function createQuarry(track, renderer = null) {
  const material = new T.MeshStandardMaterial({
    color: '#b8ad9b',
    roughness: 0.95,
    metalness: 0.02,
    flatShading: false,
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
      vec3 grain=texture2D(map,quarryPoint.yz/24.).rgb*w.x+texture2D(map,quarryPoint.xz/24.).rgb*w.y+texture2D(map,quarryPoint.xy/24.).rgb*w.z;
      quarryRelief=dot(grain,vec3(.299,.587,.114));
      diffuseColor.rgb*=mix(vec3(.9),grain*2.8,.55);
      #endif
      vec3 faceNormal=normalize(cross(dFdx(quarryPoint),dFdy(quarryPoint)));
      float benchDust=smoothstep(.46,.88,abs(faceNormal.y));
      float foldedHeight=quarryPoint.y+sin(quarryPoint.x*.004+sin(quarryPoint.z*.003))*46.+cos(quarryPoint.z*.005-quarryPoint.x*.001)*25.;
      float layer=quarryNoise(vec2(foldedHeight*.023,quarryPoint.x*.0005));
      vec3 bedrock=mix(vec3(.36,.42,.46),vec3(.75,.65,.52),smoothstep(.24,.76,layer));
      float stonePatch=quarryNoise(quarryPoint.xz*.004);
      vec3 dust=mix(vec3(.8,.72,.57),vec3(1.12,1.02,.82),stonePatch);
      diffuseColor.rgb*=mix(bedrock,dust,benchDust*.86);
      diffuseColor.rgb*=.9+.1*quarryNoise(quarryPoint.xz*.008);
      quarryRelief+=quarryNoise(quarryPoint.xy*.08)*.22;`,
    );
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <normal_fragment_maps>',
      `#include <normal_fragment_maps>
      vec3 qx=dFdx(-vViewPosition),qy=dFdy(-vViewPosition),qrX=cross(qy,normal),qrY=cross(normal,qx);
      float qdet=dot(qx,qrX); vec2 qSlope=vec2(dFdx(quarryRelief),dFdy(quarryRelief))*.15;
      normal=normalize(abs(qdet)*normal-sign(qdet)*(qSlope.x*qrX+qSlope.y*qrY));`,
    );
  };
  material.customProgramCacheKey = () => 'colossus-fractured-quarry-v3';
  const survey = [];
  for (let s = 0; s < track.length; s += 16)
    survey.push(track.sample(s).position);
  const bounds = track.bounds.clone().expandByScalar(650),
    step = 30;
  const nx = Math.ceil((bounds.max.x - bounds.min.x) / step),
    nz = Math.ceil((bounds.max.z - bounds.min.z) / step),
    positions = [],
    bands = [-90, 35, 210, 440, 720, 1060, 1470, 1930, 2450];
  const faults = ['screw', 'die', 'cooling'].map((id, i) => {
    const zone = track.sections.find((s) => s.id === id),
      f = track.sample(zone.start + 180),
      p = f.position.clone().addScaledVector(f.right, i % 2 ? -480 : 480);
    return { x: p.x, z: p.z, angle: 0.45 + i * 0.93 };
  });
  const fieldAt = (x, z) => {
    let roof = Infinity,
      nearest = Infinity;
    for (const p of survey) {
      const d = Math.hypot(x - p.x, z - p.z);
      nearest = Math.min(nearest, d);
      roof = Math.min(roof, p.y - 72 + Math.max(0, d - 105) * 0.72);
    }
    // Unequal extraction benches with broad flats and broken sloping faces.
    const warp =
      (Math.sin(x * 0.0023 + Math.sin(z * 0.003)) * 70 +
        Math.cos(z * 0.0027 - x * 0.001) * 45) *
      Math.min(1, Math.max(0, nearest - 120) / 180);
    return { x, z, roof, nearest, cut: roof + warp };
  };
  const elevation = ({ x, z, roof, nearest, cut }) => {
    let low = bands[0],
      high = bands[1];
    for (let i = 0; i < bands.length - 1; i++)
      if (cut >= bands[i]) {
        low = bands[i];
        high = bands[i + 1];
      }
    const u = T.MathUtils.clamp((cut - low) / (high - low), 0, 1);
    const face = T.MathUtils.clamp((u - 0.79) / 0.21, 0, 1);
    const bench = low + (high - low) * face;
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
    cleft *= T.MathUtils.smoothstep(nearest, 145, 310);
    const benchBreak =
      (Math.sin(x * 0.011 + z * 0.003) * 9 +
        Math.cos(z * 0.009 - x * 0.006) * 6) *
      T.MathUtils.smoothstep(nearest, 120, 260);
    const rubble =
      Math.sin(x * 0.017 + z * 0.006) *
      Math.cos(z * 0.013) *
      Math.min(3, Math.max(0, nearest - 110) * 0.01);
    return Math.max(
      -72,
      Math.min(roof - 8, bench + rubble + benchBreak - cleft),
    );
  };
  const heightAt = (x, z) => elevation(fieldAt(x, z));
  // Split the surface at exact bench contours. A regular grid straddling steep
  // risers produces alternating triangular teeth; the ledges need their own edges.
  const knees = bands
    .slice(0, -1)
    .flatMap((lo, i) => [lo + (bands[i + 1] - lo) * 0.79, bands[i + 1]]);
  const grid = [];
  for (let z = 0; z <= nz; z++)
    for (let x = 0; x <= nx; x++)
      grid.push(fieldAt(bounds.min.x + x * step, bounds.min.z + z * step));
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
        for (const key of ['x', 'z', 'roof', 'nearest', 'cut'])
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
      for (let i = 1; i < poly.length - 1; i++)
        for (const p of [poly[0], poly[i], poly[i + 1]])
          positions.push(p.x, elevation(p), p.z);
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
      const a = z * (nx + 1) + x,
        b = a + nx + 1;
      triangle(grid[a], grid[b], grid[a + 1]);
      triangle(grid[a + 1], grid[b], grid[b + 1]);
    }
  let geometry = new T.BufferGeometry();
  geometry.setAttribute('position', new T.Float32BufferAttribute(positions, 3));
  const raw = geometry;
  geometry = mergeVertices(raw, 0.001);
  raw.dispose();
  geometry.computeVertexNormals();
  const smooth = geometry;
  geometry = toCreasedNormals(smooth, 0.8);
  smooth.dispose();
  geometry.computeBoundingSphere();
  const mesh = new T.Mesh(geometry, material);
  mesh.name = 'Colossus / connected terraced quarry';
  mesh.receiveShadow = true;
  mesh.castShadow = true;
  return {
    mesh,
    material,
    ready,
    heightAt,
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
