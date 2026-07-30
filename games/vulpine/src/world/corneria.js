import * as THREE from 'three';
import { rng, RNG } from '../core/rng.js';
import { Mat } from '../render/materials.js';
import { fbm2D, ridged2D } from '../render/textures.js';

// ─────────────────────────────────────────────────────────────────────────────
// Corneria — a river valley you fly down at 200 m/s. Terrain is a heightfield
// carved around the rail centreline, the water is a Gerstner surface injected
// into a real PBR material (so it gets IBL reflections, fog and shadows for
// free), and the city is instanced.
//
// World axes: the rail runs toward -Z, +X is right, +Y is up. Water sits at 0.
// ─────────────────────────────────────────────────────────────────────────────

export const WORLD = {
  length: 9000,        // metres of level along -Z
  halfWidth: 620,      // terrain half-extent either side of the centreline
  chunkLen: 300,
  res: 5,              // metres per terrain quad
  waterLevel: 0,
  valleyInner: 105,    // river half-width
  valleyOuter: 330,    // where the walls top out
  wallHeight: 210,
};

/* ── centreline ───────────────────────────────────────────────────────────── */

/** Lateral offset of the river centre at a given z (z is negative going out). */
export function centrelineX(z) {
  const t = -z;
  return Math.sin(t * 0.00055) * 210 + Math.sin(t * 0.00181 + 1.7) * 78 + Math.sin(t * 0.0041 + 0.4) * 22;
}
export function centrelineY(z) {
  const t = -z;
  return 44 + Math.sin(t * 0.00042 + 0.9) * 16 + Math.sin(t * 0.00133 + 2.3) * 7;
}

/* ── height field ─────────────────────────────────────────────────────────── */

// Band limit: the mesh samples every WORLD.res metres, so the shortest
// wavelength in the height field must stay well above 4×res or the "terrain"
// is just aliased noise. Wavelength = 1 / (base × scale), halving per octave.
const hRng = new RNG('corneria:height');
const mountain = ridged2D(hRng, { octaves: 5, base: 3, gain: 0.52 });   // 2000m → 125m
const detail = fbm2D(hRng, { octaves: 4, base: 8, gain: 0.48 });        //  300m →  38m
const macro = fbm2D(hRng, { octaves: 3, base: 2, gain: 0.60 });         // 8000m → 2000m

const SCALE_A = 1 / 6000;
const SCALE_B = 1 / 2400;
const SCALE_C = 1 / 16000;

export function terrainHeight(x, z) {
  const cx = centrelineX(z);
  const d = Math.abs(x - cx);

  // valley profile: flat riverbed, steep banks, rolling highland
  const t = THREE.MathUtils.clamp((d - WORLD.valleyInner) / (WORLD.valleyOuter - WORLD.valleyInner), 0, 1);
  const bank = t * t * (3 - 2 * t);
  const riverbed = -18 - 10 * Math.cos((d / WORLD.valleyInner) * Math.PI * 0.5);

  const m = mountain(x * SCALE_A, z * SCALE_A);
  const dt = detail(x * SCALE_B, z * SCALE_B);
  const mc = macro(x * SCALE_C, z * SCALE_C);

  const highland = (m * 0.72 + dt * 0.20 + mc * 0.42) * WORLD.wallHeight;
  let h = riverbed * (1 - bank) + (highland + 26) * bank;

  // sharpen the very top so ridges read as ridges, not dunes
  if (h > 90) h += (h - 90) * 0.35 * m;
  return h;
}

function terrainNormal(x, z, e = 2.5, out = new THREE.Vector3()) {
  const hl = terrainHeight(x - e, z), hr = terrainHeight(x + e, z);
  const hd = terrainHeight(x, z - e), hu = terrainHeight(x, z + e);
  return out.set(hl - hr, 2 * e, hd - hu).normalize();
}
export { terrainNormal };

/* ── terrain material: triplanar-ish slope blending via vertex colour ─────── */

function makeTerrainMaterial() {
  const m = new THREE.MeshStandardMaterial({
    map: Mat.rock.map,
    normalMap: Mat.rock.normalMap,
    roughnessMap: Mat.rock.roughnessMap,
    roughness: 1.0,
    metalness: 0.0,
    envMapIntensity: 0.7,
    vertexColors: true,
    dithering: true,
  });
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uDetailScale = { value: 0.11 };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\nvarying vec3 vWorldPos;\nvarying float vSlope;`)
      .replace('#include <worldpos_vertex>', `#include <worldpos_vertex>
        vWorldPos = (modelMatrix * vec4(transformed, 1.0)).xyz;
        vSlope = 1.0 - clamp(dot(normalize(normalMatrix * objectNormal), vec3(0.0,1.0,0.0)), 0.0, 1.0);`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\nvarying vec3 vWorldPos;\nvarying float vSlope;\nuniform float uDetailScale;`)
      .replace('#include <map_fragment>', `
        // world-space triplanar sampling kills the stretched-UV look on cliffs
        vec3 bw = abs(normalize(vNormal));
        bw = pow(bw, vec3(4.0));
        bw /= (bw.x + bw.y + bw.z);
        vec2 uvX = vWorldPos.zy * uDetailScale;
        vec2 uvY = vWorldPos.xz * uDetailScale;
        vec2 uvZ = vWorldPos.xy * uDetailScale;
        vec4 tX = texture2D(map, uvX);
        vec4 tY = texture2D(map, uvY);
        vec4 tZ = texture2D(map, uvZ);
        vec4 sampledDiffuseColor = tX * bw.x + tY * bw.y + tZ * bw.z;
        // large-scale tone variation so tiling never announces itself
        float macroV = texture2D(map, vWorldPos.xz * uDetailScale * 0.045).r;
        sampledDiffuseColor.rgb *= mix(0.78, 1.22, macroV);
        diffuseColor *= sampledDiffuseColor;
      `);
    m.userData.shader = shader;
  };
  return m;
}

/* ── water ────────────────────────────────────────────────────────────────── */

const GERSTNER = /* glsl */`
  // (dirX, dirZ, steepness, wavelength)
  const vec4 W0 = vec4( 0.94,  0.34, 0.070, 118.0);
  const vec4 W1 = vec4(-0.62,  0.78, 0.055,  61.0);
  const vec4 W2 = vec4( 0.31, -0.95, 0.048,  27.0);
  const vec4 W3 = vec4(-0.88, -0.47, 0.030,  13.0);

  vec3 gerstner(vec4 w, vec3 p, float t, inout vec3 tangent, inout vec3 binormal) {
    float k = 6.28318530718 / w.w;
    float c = sqrt(9.8 / k);
    vec2 d = normalize(w.xy);
    float f = k * (dot(d, p.xz) - c * t);
    float a = w.z / k;
    tangent  += vec3(-d.x * d.x * (w.z * sin(f)), d.x * (w.z * cos(f)), -d.x * d.y * (w.z * sin(f)));
    binormal += vec3(-d.x * d.y * (w.z * sin(f)), d.y * (w.z * cos(f)), -d.y * d.y * (w.z * sin(f)));
    return vec3(d.x * (a * cos(f)), a * sin(f), d.y * (a * cos(f)));
  }
`;

function makeWaterMaterial() {
  const m = new THREE.MeshPhysicalMaterial({
    color: 0x14384f,
    roughness: 0.055,
    metalness: 0.0,
    envMapIntensity: 1.9,
    clearcoat: 0.85,
    clearcoatRoughness: 0.07,
    transparent: false,
  });
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = { value: 0 };
    shader.uniforms.uFoamColor = { value: new THREE.Color(0xdff0ff) };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
        uniform float uTime;
        varying vec3 vWPos;
        varying float vFoam;
        ${GERSTNER}`)
      .replace('#include <beginnormal_vertex>', `
        vec3 _wp = (modelMatrix * vec4(position, 1.0)).xyz;
        vec3 _tan = vec3(1.0, 0.0, 0.0);
        vec3 _bin = vec3(0.0, 0.0, 1.0);
        vec3 _off = vec3(0.0);
        _off += gerstner(W0, _wp, uTime, _tan, _bin);
        _off += gerstner(W1, _wp, uTime, _tan, _bin);
        _off += gerstner(W2, _wp, uTime, _tan, _bin);
        _off += gerstner(W3, _wp, uTime, _tan, _bin);
        vec3 objectNormal = normalize(cross(_bin, _tan));
        vFoam = clamp(_off.y * 0.55 + 0.35, 0.0, 1.0);
        #ifdef USE_TANGENT
          vec3 objectTangent = vec3( tangent.xyz );
        #endif`)
      .replace('#include <begin_vertex>', `
        vec3 transformed = position + _off;
        vWPos = _wp + _off;`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        varying vec3 vWPos;
        varying float vFoam;
        uniform vec3 uFoamColor;`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        // depth-tinted water: shallow near the banks, deep in the channel
        float deep = smoothstep(0.0, 260.0, abs(vWPos.x));
        diffuseColor.rgb = mix(vec3(0.09,0.30,0.36), vec3(0.03,0.10,0.19), deep);
        diffuseColor.rgb += uFoamColor * pow(vFoam, 6.0) * 0.35;`);
    m.userData.shader = shader;
  };
  return m;
}

/* ── city ─────────────────────────────────────────────────────────────────── */

function buildCity(group, chunkZ0, chunkZ1) {
  const r = new RNG(`city:${chunkZ0}`);
  const towers = [];
  const count = 22;
  for (let i = 0; i < count; i++) {
    const z = r.range(chunkZ0, chunkZ1);
    const side = r.sign();
    const cx = centrelineX(z);
    const off = r.range(WORLD.valleyInner + 25, WORLD.valleyInner + 250);
    const x = cx + side * off;
    const gh = terrainHeight(x, z);
    if (gh < 4) continue;
    const h = r.range(38, 190) * (1 - Math.min(1, off / 420) * 0.5);
    const w = r.range(11, 30);
    towers.push({ x, y: gh - 6, z, w, h, d: w * r.range(0.7, 1.4), rot: r.range(0, Math.PI) });
  }
  if (!towers.length) return;

  const geo = new THREE.BoxGeometry(1, 1, 1);
  const inst = new THREE.InstancedMesh(geo, Mat.hullDark, towers.length);
  const mtx = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  towers.forEach((t, i) => {
    e.set(0, t.rot, 0);
    q.setFromEuler(e);
    mtx.compose(new THREE.Vector3(t.x, t.y + t.h / 2, t.z), q, new THREE.Vector3(t.w, t.h, t.d));
    inst.setMatrixAt(i, mtx);
  });
  inst.castShadow = true;
  inst.receiveShadow = true;
  inst.instanceMatrix.needsUpdate = true;
  group.add(inst);

  // window glow strips
  const glowGeo = new THREE.BoxGeometry(1, 1, 1);
  const glowMat = new THREE.MeshBasicMaterial({ color: 0x2f7fbf, toneMapped: false, fog: true });
  const glow = new THREE.InstancedMesh(glowGeo, glowMat, towers.length);
  towers.forEach((t, i) => {
    e.set(0, t.rot, 0); q.setFromEuler(e);
    mtx.compose(new THREE.Vector3(t.x, t.y + t.h * 0.62, t.z), q, new THREE.Vector3(t.w * 1.02, t.h * 0.10, t.d * 1.02));
    glow.setMatrixAt(i, mtx);
  });
  glow.instanceMatrix.needsUpdate = true;
  group.add(glow);
}

/* ── build ────────────────────────────────────────────────────────────────── */

export class Corneria {
  constructor(scene) {
    this.scene = scene;
    this.root = new THREE.Group();
    this.root.name = 'corneria';
    scene.add(this.root);

    this.terrainMat = makeTerrainMaterial();
    this.waterMat = makeWaterMaterial();
    this.chunks = [];
    this._time = 0;

    this._buildTerrain();
    this._buildWater();
    this._buildArches();
  }

  _buildTerrain() {
    const { length, halfWidth, chunkLen, res } = WORLD;
    const nChunks = Math.ceil(length / chunkLen);
    const cols = Math.floor((halfWidth * 2) / res) + 1;
    const rows = Math.floor(chunkLen / res) + 1;

    for (let c = 0; c < nChunks; c++) {
      const z0 = -c * chunkLen;
      const pos = new Float32Array(cols * rows * 3);
      const nrm = new Float32Array(cols * rows * 3);
      const col = new Float32Array(cols * rows * 3);
      const uv = new Float32Array(cols * rows * 2);
      const idx = [];
      const n = new THREE.Vector3();
      const cxMid = centrelineX(z0 - chunkLen / 2);

      for (let j = 0; j < rows; j++) {
        const z = z0 - j * res;
        const cxHere = centrelineX(z);
        for (let i = 0; i < cols; i++) {
          const x = cxHere - halfWidth + i * res;
          const h = terrainHeight(x, z);
          const k = (j * cols + i);
          pos[k * 3] = x - cxMid; pos[k * 3 + 1] = h; pos[k * 3 + 2] = z - z0;
          terrainNormal(x, z, res * 0.75, n);
          nrm[k * 3] = n.x; nrm[k * 3 + 1] = n.y; nrm[k * 3 + 2] = n.z;
          // vertex colour: altitude + slope tint (sand → rock → grey scree)
          const slope = 1 - n.y;
          const alt = THREE.MathUtils.clamp(h / 190, 0, 1);
          const sand = THREE.MathUtils.clamp(1 - Math.abs(h - 2) / 26, 0, 1) * (1 - slope * 1.6);
          const green = THREE.MathUtils.clamp((1 - slope * 2.6) * (1 - alt) * 1.4, 0, 1);
          let r = 0.74 + alt * 0.16 - green * 0.42 + sand * 0.24;
          let g = 0.70 + alt * 0.16 - green * 0.10 + sand * 0.22;
          let b = 0.64 + alt * 0.22 - green * 0.44 + sand * 0.05;
          col[k * 3] = r; col[k * 3 + 1] = g; col[k * 3 + 2] = b;
          uv[k * 2] = i / (cols - 1) * 24; uv[k * 2 + 1] = j / (rows - 1) * 6;
        }
      }
      for (let j = 0; j < rows - 1; j++) {
        for (let i = 0; i < cols - 1; i++) {
          const a = j * cols + i, b = a + 1, d = a + cols, e2 = d + 1;
          idx.push(a, d, b, b, d, e2);
        }
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      geo.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
      geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
      geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
      geo.setIndex(idx);
      geo.computeBoundingSphere();

      const mesh = new THREE.Mesh(geo, this.terrainMat);
      mesh.position.set(cxMid, 0, z0);
      mesh.receiveShadow = true;
      // Terrain does not cast: a heightfield of this extent self-shadows into
      // acne long before a single shadow map can resolve it. Cliff shadows come
      // back with cascades (see TECH_DEBT in ROADMAP).
      mesh.castShadow = false;
      mesh.name = `terrain-${c}`;
      this.root.add(mesh);

      const cityGroup = new THREE.Group();
      buildCity(cityGroup, z0, z0 - chunkLen);
      this.root.add(cityGroup);

      this.chunks.push(mesh);
    }
  }

  _buildWater() {
    const geo = new THREE.PlaneGeometry(1900, WORLD.length + 1200, 190, Math.ceil(WORLD.length / 12));
    geo.rotateX(-Math.PI / 2);
    const mesh = new THREE.Mesh(geo, this.waterMat);
    mesh.position.set(0, WORLD.waterLevel, -WORLD.length / 2);
    mesh.receiveShadow = false;
    mesh.name = 'water';
    mesh.frustumCulled = false;
    this.water = mesh;
    this.root.add(mesh);
  }

  _buildArches() {
    const r = rng('corneria:arches');
    for (let i = 0; i < 16; i++) {
      const z = -600 - i * 520 - r.range(-90, 90);
      const cx = centrelineX(z);
      const span = r.range(230, 340);
      const height = r.range(85, 150);
      const g = new THREE.TorusGeometry(span * 0.5, r.range(7, 13), 12, 40, Math.PI);
      const m = new THREE.Mesh(g, Mat.hullDark);
      m.position.set(cx, 4, z);
      m.rotation.y = Math.PI / 2;
      m.scale.y = height / (span * 0.5);
      m.castShadow = true;
      m.receiveShadow = true;
      this.root.add(m);

      const trim = new THREE.Mesh(
        new THREE.TorusGeometry(span * 0.5 + 1.2, 1.6, 6, 40, Math.PI),
        Mat.accentRed,
      );
      trim.position.copy(m.position);
      trim.rotation.copy(m.rotation);
      trim.scale.copy(m.scale);
      this.root.add(trim);
    }
  }

  update(dt) {
    this._time += dt;
    const ws = this.waterMat.userData.shader;
    if (ws) ws.uniforms.uTime.value = this._time;
  }

  /** Ground clearance at a world point — used by the flight model and by AI. */
  groundAt(x, z) { return Math.max(terrainHeight(x, z), WORLD.waterLevel); }
}
