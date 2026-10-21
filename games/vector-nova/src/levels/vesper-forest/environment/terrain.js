import * as T from 'three';

export function randomSource(seed) {
  return () => {
    seed = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    seed ^= seed + Math.imul(seed ^ (seed >>> 7), 61 | seed);
    return ((seed ^ (seed >>> 14)) >>> 0) / 4294967296;
  };
}
const smooth = (x) => x * x * (3 - 2 * x);
function noise(x, z) {
  const ix = Math.floor(x),
    iz = Math.floor(z),
    fx = smooth(x - ix),
    fz = smooth(z - iz);
  const h = (a, b) => {
    let v = Math.imul(a, 374761393) ^ Math.imul(b, 668265263);
    v = Math.imul(v ^ (v >>> 13), 1274126177);
    return ((v ^ (v >>> 16)) >>> 0) / 4294967296;
  };
  return T.MathUtils.lerp(
    T.MathUtils.lerp(h(ix, iz), h(ix + 1, iz), fx),
    T.MathUtils.lerp(h(ix, iz + 1), h(ix + 1, iz + 1), fx),
    fz,
  );
}
export function createForestTerrain(track) {
  const route = [];
  for (let s = 0; s < track.length; s += 12)
    route.push(track.sample(s).position.clone());
  const center = new T.Vector3(...track.landmarks.hollow.center);
  const height = (x, z) => {
    const n =
      noise(x * 0.0018 + 6, z * 0.0018 + 9) * 105 +
      noise(x * 0.005 + 19, z * 0.005) * 40 +
      noise(x * 0.017, z * 0.017) * 11;
    const channel =
      120 * Math.exp(-(((z - (-170 + 105 * Math.sin(x * 0.003))) / 125) ** 2));
    const island =
      75 * Math.exp(-((x - center.x) ** 2 + (z - center.z) ** 2) / 85000);
    const basin =
      130 * Math.exp(-(((x - 880) / 330) ** 2 + ((z - 170) / 210) ** 2));
    let y = -115 + n - channel + island - basin;
    for (const p of route) {
      const d2 = (p.x - x) ** 2 + (p.z - z) ** 2;
      if (d2 < 125 ** 2) y = Math.min(y, p.y - 64 + Math.sqrt(d2) * 0.13);
    }
    return y;
  };
  const geometry = new T.PlaneGeometry(3500, 2900, 220, 180)
    .rotateX(-Math.PI / 2)
    .translate(350, 0, 0);
  const p = geometry.attributes.position,
    colors = [];
  const color = new T.Color();
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i),
      z = p.getZ(i),
      y = height(x, z);
    p.setY(i, y);
    const slope =
      Math.hypot(
        height(x + 4, z) - height(x - 4, z),
        height(x, z + 4) - height(x, z - 4),
      ) / 8;
    color.set(slope > 0.65 ? '#687c77' : y < -107 ? '#3f645e' : '#526c4a');
    color.multiplyScalar(0.72 + noise(x * 0.045, z * 0.045) * 0.5);
    colors.push(color.r, color.g, color.b);
  }
  geometry.setAttribute('color', new T.Float32BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  const material = new T.MeshStandardMaterial({
    name: 'Living Forest / moss banks and submerged slate',
    color: 0xffffff,
    vertexColors: true,
    roughness: 0.95,
  });
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 groundP;')
      .replace(
        '#include <begin_vertex>',
        '#include <begin_vertex>\ngroundP=(modelMatrix*vec4(transformed,1.)).xyz;',
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
   varying vec3 groundP;
   float groundHash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
   float groundNoise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(groundHash(i),groundHash(i+vec2(1,0)),f.x),mix(groundHash(i+vec2(0,1)),groundHash(i+vec2(1,1)),f.x),f.y);}
  `,
      )
      .replace(
        '#include <map_fragment>',
        `#include <map_fragment>
   float soil=groundNoise(groundP.xz*.055)*.65+groundNoise(groundP.xz*.21+19.)*.35;
   float grit=groundNoise(groundP.xz*1.8+groundP.y*.3);
   diffuseColor.rgb*=mix(.77,1.13,soil)*mix(.94,1.06,grit);
   diffuseColor.rgb=mix(diffuseColor.rgb,diffuseColor.rgb*vec3(1.16,.95,.78),smoothstep(.55,.8,soil)*.45);`,
      );
  };
  material.customProgramCacheKey = () => 'living-forest-ground-v2';
  const mesh = new T.Mesh(geometry, material);
  mesh.name = 'Living Forest / continuous river-cut terrain';
  mesh.receiveShadow = true;
  return {
    mesh,
    height,
    route,
    dispose() {
      geometry.dispose();
      material.dispose();
    },
  };
}
