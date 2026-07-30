import * as THREE from 'three';
import { Sky } from 'three/examples/jsm/objects/Sky.js';
import { bakeStarfield } from './textures.js';

// ─────────────────────────────────────────────────────────────────────────────
// Environment — sky, sun, shadow rig, image-based lighting and fog, driven by a
// single named preset. The sun direction is the one source of truth: the sky
// shader, the key light, the IBL probe and the god-ray origin all read it, so
// changing `elevation` re-lights the entire game coherently.
// ─────────────────────────────────────────────────────────────────────────────

export const PRESETS = {
  corneria: {
    kind: 'atmosphere',
    turbidity: 3.4, rayleigh: 1.35, mieCoefficient: 0.0042, mieDirectionalG: 0.86,
    elevation: 24, azimuth: 148,
    sunColor: 0xfff2dc, sunIntensity: 5.4,
    hemiSky: 0x9dc4f5, hemiGround: 0x4a4230, hemiIntensity: 0.30,
    fillColor: 0x6f93c4, fillIntensity: 0.18,
    rimColor: 0xffd9b0, rimIntensity: 0.42,
    fog: { color: 0x93b7dc, density: 0.00042 },
    exposure: 0.20,
    godray: { intensity: 0.34, tint: 0xffd9a8 },
    envIntensity: 0.55,
  },
  sunset: {
    kind: 'atmosphere',
    turbidity: 8.5, rayleigh: 2.6, mieCoefficient: 0.011, mieDirectionalG: 0.92,
    elevation: 4.2, azimuth: 190,
    sunColor: 0xffb066, sunIntensity: 5.2,
    hemiSky: 0xc09ad0, hemiGround: 0x30202a, hemiIntensity: 0.7,
    fillColor: 0x7060a0, fillIntensity: 0.5,
    rimColor: 0xff8a4a, rimIntensity: 1.3,
    fog: { color: 0xe0a184, density: 0.00075 },
    exposure: 0.55,
    godray: { intensity: 0.9, tint: 0xffb373 },
    envIntensity: 1.0,
  },
  space: {
    kind: 'space',
    sunColor: 0xfff4e2, sunIntensity: 5.0,
    sunDir: [0.42, 0.34, -0.84],
    hemiSky: 0x223052, hemiGround: 0x0a0a12, hemiIntensity: 0.28,
    fillColor: 0x3a4a86, fillIntensity: 0.35,
    rimColor: 0x88bbff, rimIntensity: 0.85,
    fog: { color: 0x05070f, density: 0.00012 },
    exposure: 0.95,
    godray: { intensity: 0.22, tint: 0xbdd6ff },
    nebula: [0x2a3f7a, 0x6b2a6a, 0x123048],
    envIntensity: 0.8,
  },
};

export class Environment {
  constructor(engine, presetName = 'corneria') {
    this.engine = engine;
    this.scene = engine.scene;
    this.root = new THREE.Group();
    this.root.name = 'environment';
    this.scene.add(this.root);

    this.sunDir = new THREE.Vector3(0, 1, 0);
    this.sunWorld = new THREE.Vector3();
    this.sunScreen = new THREE.Vector2(0.5, 0.5);
    this.sunVisible = 0;

    this._pmrem = new THREE.PMREMGenerator(engine.renderer);
    this._pmrem.compileEquirectangularShader();
    this._envRT = null;

    // ── sky dome (Preetham analytic scattering)
    this.sky = new Sky();
    this.sky.scale.setScalar(20000);
    this.sky.material.depthWrite = false;
    this.sky.renderOrder = -1000;
    this.root.add(this.sky);

    // ── starfield backdrop (space presets)
    this.starMesh = null;

    // ── lights
    this.sun = new THREE.DirectionalLight(0xffffff, 1);
    this.sun.castShadow = engine.q.shadows;
    this.sun.shadow.mapSize.set(engine.q.shadowMap, engine.q.shadowMap);
    this.sun.shadow.camera.near = 1;
    this.sun.shadow.camera.far = 1200;
    // A heightfield this large self-shadows into pure acne unless the normal
    // bias is on the order of a shadow texel in world units.
    this.sun.shadow.bias = -0.0006;
    this.sun.shadow.normalBias = 1.8;
    this.sun.shadow.blurSamples = 16;
    this._shadowSpan = 190;
    this._setShadowSpan(this._shadowSpan);
    this.root.add(this.sun);
    this.root.add(this.sun.target);

    this.hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 1);
    this.root.add(this.hemi);

    this.fill = new THREE.DirectionalLight(0xffffff, 0.4);
    this.root.add(this.fill);

    this.rim = new THREE.DirectionalLight(0xffffff, 0.7);
    this.root.add(this.rim);

    this.preset = null;
    this.apply(presetName);
  }

  _setShadowSpan(s) {
    const c = this.sun.shadow.camera;
    c.left = -s; c.right = s; c.top = s; c.bottom = -s;
    c.updateProjectionMatrix();
  }

  apply(name) {
    const p = PRESETS[name];
    if (!p) throw new Error(`unknown environment preset: ${name}`);
    this.presetName = name;
    this.preset = p;

    if (p.kind === 'atmosphere') {
      this.sky.visible = true;
      const u = this.sky.material.uniforms;
      u.turbidity.value = p.turbidity;
      u.rayleigh.value = p.rayleigh;
      u.mieCoefficient.value = p.mieCoefficient;
      u.mieDirectionalG.value = p.mieDirectionalG;
      const phi = THREE.MathUtils.degToRad(90 - p.elevation);
      const theta = THREE.MathUtils.degToRad(p.azimuth);
      this.sunDir.setFromSphericalCoords(1, phi, theta);
      u.sunPosition.value.copy(this.sunDir);
      if (this.starMesh) this.starMesh.visible = false;
    } else {
      this.sky.visible = false;
      this.sunDir.fromArray(p.sunDir).normalize();
      this._ensureStars();
      this.starMesh.visible = true;
      this._tintNebula(p.nebula);
    }

    this.sun.color.setHex(p.sunColor);
    this.sun.intensity = p.sunIntensity;
    this.hemi.color.setHex(p.hemiSky);
    this.hemi.groundColor.setHex(p.hemiGround);
    this.hemi.intensity = p.hemiIntensity;
    this.fill.color.setHex(p.fillColor);
    this.fill.intensity = p.fillIntensity;
    this.rim.color.setHex(p.rimColor);
    this.rim.intensity = p.rimIntensity;

    this.scene.fog = new THREE.FogExp2(p.fog.color, p.fog.density);

    if (this.engine.post) {
      this.engine.post.params.exposure = p.exposure;
      this.engine.post.godRays.params.intensity = p.godray.intensity;
      this.engine.post.godRays.params.tint.setHex(p.godray.tint);
    }

    this.refreshEnvMap();
    return this;
  }

  _ensureStars() {
    if (this.starMesh) return;
    const tex = bakeStarfield({ seed: 'lylat', size: 2048, count: 6000 });
    const geo = new THREE.SphereGeometry(16000, 48, 32);
    const mat = new THREE.MeshBasicMaterial({
      map: tex, side: THREE.BackSide, depthWrite: false, fog: false, toneMapped: false,
    });
    tex.repeat.set(3, 2);
    this.starMesh = new THREE.Mesh(geo, mat);
    this.starMesh.renderOrder = -1000;
    this.starMesh.frustumCulled = false;
    this.root.add(this.starMesh);
  }

  _tintNebula(colors) {
    if (!colors || !this.starMesh) return;
    // Nebula haze rendered as an additive inner shell so stars show through it.
    if (!this.nebulaMesh) {
      const geo = new THREE.SphereGeometry(15600, 48, 32);
      const mat = new THREE.ShaderMaterial({
        side: THREE.BackSide, depthWrite: false, transparent: true, fog: false,
        blending: THREE.AdditiveBlending,
        uniforms: {
          cA: { value: new THREE.Color() }, cB: { value: new THREE.Color() }, cC: { value: new THREE.Color() },
        },
        vertexShader: /* glsl */`
          varying vec3 vDir;
          void main() {
            vDir = normalize(position);
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }`,
        fragmentShader: /* glsl */`
          uniform vec3 cA, cB, cC;
          varying vec3 vDir;
          float hash(vec3 p){ p = fract(p*0.3183099+vec3(0.71,0.113,0.419)); p*=17.0; return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }
          float noise(vec3 x){
            vec3 i = floor(x), f = fract(x); f = f*f*(3.0-2.0*f);
            return mix(mix(mix(hash(i+vec3(0,0,0)),hash(i+vec3(1,0,0)),f.x),
                           mix(hash(i+vec3(0,1,0)),hash(i+vec3(1,1,0)),f.x),f.y),
                       mix(mix(hash(i+vec3(0,0,1)),hash(i+vec3(1,0,1)),f.x),
                           mix(hash(i+vec3(0,1,1)),hash(i+vec3(1,1,1)),f.x),f.y),f.z);
          }
          float fbm(vec3 p){ float a=0.5,s=0.0; for(int i=0;i<6;i++){ s+=a*noise(p); p*=2.03; a*=0.52; } return s; }
          void main() {
            vec3 d = vDir;
            float n1 = fbm(d * 2.4);
            float n2 = fbm(d * 5.1 + 13.0);
            float n3 = fbm(d * 1.1 - 7.0);
            vec3 col = cA * pow(n1, 2.6) * 1.5 + cB * pow(n2, 3.4) * 0.9 + cC * pow(n3, 2.0) * 0.7;
            float band = smoothstep(-0.55, 0.45, d.y * 0.5 + fbm(d*0.9));
            gl_FragColor = vec4(col * band * 0.55, 1.0);
          }`,
      });
      this.nebulaMesh = new THREE.Mesh(geo, mat);
      this.nebulaMesh.renderOrder = -999;
      this.nebulaMesh.frustumCulled = false;
      this.root.add(this.nebulaMesh);
    }
    const u = this.nebulaMesh.material.uniforms;
    u.cA.value.setHex(colors[0]);
    u.cB.value.setHex(colors[1]);
    u.cC.value.setHex(colors[2]);
    this.nebulaMesh.visible = true;
  }

  /** Bake the sky (and nebula) into a PMREM probe used by every PBR material. */
  refreshEnvMap() {
    const r = this.engine.renderer;
    const prevBg = this.scene.background;
    const prevEnv = this.scene.environment;
    const prevFog = this.scene.fog;

    // isolate: only the dome contributes to the probe
    const capture = new THREE.Scene();
    if (this.preset.kind === 'atmosphere') {
      const proxy = new Sky();
      proxy.scale.setScalar(1000);
      const su = proxy.material.uniforms, u = this.sky.material.uniforms;
      su.turbidity.value = u.turbidity.value;
      su.rayleigh.value = u.rayleigh.value;
      su.mieCoefficient.value = u.mieCoefficient.value;
      su.mieDirectionalG.value = u.mieDirectionalG.value;
      su.sunPosition.value.copy(u.sunPosition.value);
      capture.add(proxy);
      if (this._envRT) this._envRT.dispose();
      this._envRT = this._pmrem.fromScene(capture, 0.02, 0.1, 2000);
      proxy.geometry.dispose(); proxy.material.dispose();
    } else {
      capture.background = new THREE.Color(this.preset.fog.color).multiplyScalar(2.4);
      if (this._envRT) this._envRT.dispose();
      this._envRT = this._pmrem.fromScene(capture, 0.04, 0.1, 100);
    }

    this.scene.environment = this._envRT.texture;
    this.scene.environmentIntensity = this.preset.envIntensity ?? 1;
    this.scene.background = prevBg;
    this.scene.fog = prevFog;
    void prevEnv;
  }

  /**
   * Keeps the shadow frustum tight around the action and recomputes the sun's
   * screen-space position for the god-ray pass.
   */
  update(dt, focus, camera) {
    const dist = 420;
    this.sunWorld.copy(this.sunDir).multiplyScalar(dist).add(focus);
    this.sun.position.copy(this.sunWorld);
    this.sun.target.position.copy(focus);
    this.sun.target.updateMatrixWorld();

    this.hemi.position.copy(focus).addScaledVector(new THREE.Vector3(0, 1, 0), 50);
    this.fill.position.copy(focus).add(new THREE.Vector3(-this.sunDir.x, 0.35, -this.sunDir.z).multiplyScalar(200));
    this.rim.position.copy(focus).add(new THREE.Vector3(-this.sunDir.x, -0.12, -this.sunDir.z).multiplyScalar(-260));

    if (this.starMesh) this.starMesh.position.copy(camera.position);
    if (this.nebulaMesh) this.nebulaMesh.position.copy(camera.position);
    this.sky.position.copy(camera.position);

    // sun in screen space, for god rays
    const p = _v.copy(this.sunDir).multiplyScalar(9000).add(camera.position);
    p.project(camera);
    this.sunScreen.set(p.x * 0.5 + 0.5, p.y * 0.5 + 0.5);
    const behind = p.z > 1;
    const off = Math.max(
      Math.abs(this.sunScreen.x - 0.5) - 0.5,
      Math.abs(this.sunScreen.y - 0.5) - 0.5,
    );
    const target = behind ? 0 : THREE.MathUtils.clamp(1 - off / 0.35, 0, 1);
    this.sunVisible += (target - this.sunVisible) * Math.min(1, dt * 6);

    if (this.engine.post) {
      this.engine.post.godRays.sun.copy(this.sunScreen);
      this.engine.post.godRays.visible = this.sunVisible;
    }
  }

  dispose() {
    if (this._envRT) this._envRT.dispose();
    this._pmrem.dispose();
  }
}

const _v = new THREE.Vector3();
