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
      `float terrainHaze=1.-exp(-max(0.,distance(cameraPosition,quarryPoint)-650.)*.000075);
      outgoingLight=mix(outgoingLight,vec3(.48,.55,.59),min(.72,terrainHaze));
      #include <opaque_fragment>`,
    );
  };
  material.customProgramCacheKey = () => 'colossus-mountain-quarry-v5';
  const survey = [];
  for (let s = 0; s < track.length; s += 16)
    survey.push(track.sample(s).position);
  const landform = createColossusLandform(track);
  const bounds = track.bounds.clone().expandByScalar(900),
    step = 30;
  const nx = Math.ceil((bounds.max.x - bounds.min.x) / step),
    nz = Math.ceil((bounds.max.z - bounds.min.z) / step),
    positions = [],
    bands = [-90, 35, 210, 440, 720, 1060, 1470, 1930, 2450, 3100];
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
  const fieldAt = (x, z) => {
    let roof = Infinity,
      nearest = Infinity;
    for (const p of survey) {
      const d = Math.hypot(x - p.x, z - p.z);
      nearest = Math.min(nearest, d);
      roof = Math.min(roof, p.y - 95 + Math.max(0, d - 125) * 0.85);
    }
    // Only the factory shoulder is excavated. The same uncut height field
    // continues through the outer mesh and supplies the mountain skyline.
    const warp =
      (Math.sin(x * 0.0023 + Math.sin(z * 0.003)) * 70 +
        Math.cos(z * 0.0027 - x * 0.001) * 45) *
      Math.min(1, Math.max(0, nearest - 120) / 180);
    const natural = landform.heightAt(x, z);
    return {
      x,
      z,
      roof,
      nearest,
      natural,
      cut: Math.min(natural, roof + warp),
    };
  };
  const elevation = ({ x, z, roof, nearest, natural, cut }) => {
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
    cleft *= T.MathUtils.smoothstep(nearest, 145, 310) * 0.55;
    const benchBreak =
      (Math.sin(x * 0.011 + z * 0.003) * 9 +
        Math.cos(z * 0.009 - x * 0.006) * 6) *
      T.MathUtils.smoothstep(nearest, 120, 260);
    const rubble =
      Math.sin(x * 0.017 + z * 0.006) *
      Math.cos(z * 0.013) *
      Math.min(3, Math.max(0, nearest - 110) * 0.01);
    const excavation = 1 - T.MathUtils.smoothstep(nearest, 240, 680),
      cutHeight = Math.min(natural, bench + rubble + benchBreak - cleft),
      ground = T.MathUtils.lerp(natural, cutHeight, excavation),
      clearance = T.MathUtils.lerp(
        roof - 8,
        natural,
        T.MathUtils.smoothstep(nearest, 520, 820),
      );
    return Math.max(-72, Math.min(ground, clearance));
  };
  const heightAt = (x, z) =>
    x < bounds.min.x || x > bounds.max.x || z < bounds.min.z || z > bounds.max.z
      ? landform.heightAt(x, z)
      : elevation(fieldAt(x, z));
  // Split the surface at exact bench contours. A regular grid straddling steep
  // risers produces alternating triangular teeth; the ledges need their own edges.
  const knees = bands
    .slice(0, -1)
    .flatMap((lo, i) => [lo + (bands[i + 1] - lo) * 0.79, bands[i + 1]]);
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
        for (const key of ['x', 'z', 'roof', 'nearest', 'natural', 'cut'])
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
  mesh.name = 'Colossus / excavated mountain shoulder';
  mesh.receiveShadow = true;
  mesh.castShadow = true;
  return {
    mesh,
    material,
    ready,
    heightAt,
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
