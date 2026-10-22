import * as T from 'three';
import { FOREST_MATERIAL_ASSETS } from '@worldkit/environment/forest';

/** A connected terraced quarry cut below every route reach, including crossings. */
export function createQuarry(track, renderer = null) {
  const material = new T.MeshStandardMaterial({
    color: '#a99c89',
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
      '#include <common>\nvarying vec3 quarryPoint;',
    );
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <map_fragment>',
      `#ifdef USE_MAP
      vec3 w=pow(abs(normalize(cross(dFdx(quarryPoint),dFdy(quarryPoint)))),vec3(4.));w/=max(.001,w.x+w.y+w.z);
      vec3 grain=texture2D(map,quarryPoint.yz/18.).rgb*w.x+texture2D(map,quarryPoint.xz/18.).rgb*w.y+texture2D(map,quarryPoint.xy/18.).rgb*w.z;
      diffuseColor.rgb*=mix(vec3(.88),grain*2.,.68);
      #endif
      vec3 faceNormal=normalize(cross(dFdx(quarryPoint),dFdy(quarryPoint)));
      float benchDust=smoothstep(.56,.9,abs(faceNormal.y));
      float foldedHeight=quarryPoint.y+sin(quarryPoint.x*.004+sin(quarryPoint.z*.003))*46.+cos(quarryPoint.z*.005-quarryPoint.x*.001)*25.;
      float layer=.5+.5*sin(foldedHeight/47.);
      vec3 bedrock=mix(vec3(.74,.77,.76),vec3(.93,.87,.77),smoothstep(.12,.88,layer));
      diffuseColor.rgb*=mix(bedrock,vec3(1.05,.98,.85),benchDust*.68);
      float fracture=abs(sin(quarryPoint.x*.012+quarryPoint.z*.009+sin(quarryPoint.y*.004)));
      diffuseColor.rgb*=.82+.18*smoothstep(.04,.2,fracture);`,
    );
  };
  material.customProgramCacheKey = () => 'colossus-terraced-quarry-v2';
  const survey = [];
  for (let s = 0; s < track.length; s += 16)
    survey.push(track.sample(s).position);
  const bounds = track.bounds.clone().expandByScalar(650),
    step = 22;
  const nx = Math.ceil((bounds.max.x - bounds.min.x) / step),
    nz = Math.ceil((bounds.max.z - bounds.min.z) / step),
    positions = [],
    indices = [];
  const heightAt = (x, z) => {
    let roof = Infinity,
      nearest = Infinity;
    for (const p of survey) {
      const d = Math.hypot(x - p.x, z - p.z);
      nearest = Math.min(nearest, d);
      roof = Math.min(roof, p.y - 72 + Math.max(0, d - 105) * 0.72);
    }
    // Unequal extraction benches with broad flats and broken sloping faces.
    const bands = [-90, 35, 210, 440, 720, 1060, 1470, 1930, 2450];
    const warp =
      (Math.sin(x * 0.0023 + Math.sin(z * 0.003)) * 70 +
        Math.cos(z * 0.0027 - x * 0.001) * 45) *
      Math.min(1, Math.max(0, nearest - 120) / 180);
    const cut = roof + warp;
    let low = bands[0],
      high = bands[1];
    for (let i = 0; i < bands.length - 1; i++)
      if (cut >= bands[i]) {
        low = bands[i];
        high = bands[i + 1];
      }
    const u = T.MathUtils.clamp((cut - low) / (high - low), 0, 1);
    const face = T.MathUtils.smoothstep(u, 0.76, 1);
    const bench = low + (high - low) * face;
    // Intersecting fracture valleys interrupt the excavation walls and produce
    // rubble aprons. Subtraction preserves the route's conservative height roof.
    const cracks = Math.max(
      0,
      1 -
        Math.abs(Math.sin(x * 0.007 + z * 0.004 + Math.sin(z * 0.0015) * 0.8)) /
          0.14,
    );
    const crossCracks = Math.max(
      0,
      1 - Math.abs(Math.sin(z * 0.008 - x * 0.0032)) / 0.1,
    );
    const cleft =
      (cracks * 85 + crossCracks * 42) *
      T.MathUtils.smoothstep(nearest, 145, 310);
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
  for (let z = 0; z <= nz; z++)
    for (let x = 0; x <= nx; x++) {
      const px =
          bounds.min.x + x * step + Math.sin(z * 1.7 + x * 0.8) * step * 0.18,
        pz =
          bounds.min.z + z * step + Math.cos(x * 1.3 + z * 0.9) * step * 0.18;
      positions.push(px, heightAt(px, pz), pz);
      if (x < nx && z < nz) {
        const a = z * (nx + 1) + x,
          b = a + nx + 1;
        indices.push(a, b, a + 1, a + 1, b, b + 1);
      }
    }
  const geometry = new T.BufferGeometry();
  geometry.setAttribute('position', new T.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
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
