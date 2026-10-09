import * as THREE from 'three';
import { Pass, FullScreenQuad } from 'three/addons/postprocessing/Pass.js';
import { createOrbitalPlumeGeometry } from './orbital-plume.js';

// A bounded nozzle volume writes only displacement, coverage and front depth.
// The beauty pass supplies opaque scene depth; there is no second world render.
// Keeping the field separate means the hull, HUD and all pixels outside the
// exhaust footprint retain their original image, including at volume edges.
export class ExhaustHeatPass extends Pass {
  constructor(scene, camera) {
    super();
    this.scene = scene;
    this.camera = camera;
    this.fieldScene = new THREE.Scene();
    this.geometry = createOrbitalPlumeGeometry();
    this.field = new THREE.WebGLRenderTarget(1, 1, {
      type: THREE.HalfFloatType,
      depthBuffer: false,
      stencilBuffer: false,
    });
    this.field.texture.name = 'Exhaust heat / local refraction field';
    this.sources = [];
    this.disposed = false;
    this.proxies = [];
    this.expansion = new THREE.Matrix4().makeScale(2.7, 2.7, 1.7);
    this.clearColor = new THREE.Color();
    this.hullInverse = new THREE.Matrix4();
    this.material = new THREE.ShaderMaterial({
      name: 'Exhaust heat / bounded depth-clipped volume',
      depthTest: false,
      depthWrite: false,
      blending: THREE.NoBlending,
      side: THREE.BackSide,
      toneMapped: false,
      uniforms: {
        sceneDepth: { value: null },
        resolution: { value: new THREE.Vector2(1, 1) },
        nearPlane: { value: camera.near },
        farPlane: { value: camera.far },
        flowTime: { value: 0 },
        pressure: { value: 0 },
        velocity: { value: 0 },
        heatToHull: { value: new THREE.Matrix4() },
        hullMin: { value: new THREE.Vector3() },
        hullMax: { value: new THREE.Vector3() },
      },
      vertexShader: `
        varying vec3 localPosition;
        varying vec3 localEye;
        varying float viewZ;
        void main() {
          localPosition = position;
          vec3 translation = -modelViewMatrix[3].xyz;
          localEye = vec3(dot(normalMatrix[0],translation),
            dot(normalMatrix[1],translation),dot(normalMatrix[2],translation));
          vec4 viewPosition = modelViewMatrix*vec4(position,1.);
          viewZ = viewPosition.z;
          gl_Position = projectionMatrix*viewPosition;
        }`,
      fragmentShader: `
        #include <packing>
        uniform sampler2D sceneDepth;
        uniform vec2 resolution;
        uniform float nearPlane;
        uniform float farPlane;
        uniform float flowTime;
        uniform float pressure;
        uniform float velocity;
        uniform mat4 heatToHull;
        uniform vec3 hullMin;
        uniform vec3 hullMax;
        varying vec3 localPosition;
        varying vec3 localEye;
        varying float viewZ;
        void main() {
          vec3 ray = normalize(localPosition-localEye);
          vec3 safeRay = (step(vec3(0.),ray)*2.-1.)*max(abs(ray),vec3(.00001));
          vec3 a = (vec3(-.36,-.36,-1.)-localEye)/safeRay;
          vec3 b = (vec3(.36,.36,0.)-localEye)/safeRay;
          vec3 nearBox = min(a,b), farBox = max(a,b);
          float entry = max(0.,max(nearBox.x,max(nearBox.y,nearBox.z)));
          float exitDistance = min(farBox.x,min(farBox.y,farBox.z));
          vec2 screenUv = gl_FragCoord.xy/resolution;
          float depth = texture2D(sceneDepth,screenUv).r;
          float sceneZ = perspectiveDepthToViewZ(depth,nearPlane,farPlane);
          float rayLength = length(localPosition-localEye);
          float sceneDistance = rayLength*sceneZ/viewZ;
          vec3 scenePoint = (heatToHull*vec4(localEye+ray*sceneDistance,1.)).xyz;
          if(all(greaterThanEqual(scenePoint,hullMin)) && all(lessThanEqual(scenePoint,hullMax))) discard;
          // Stop integration before geometry. The small inset softens contact
          // with the nozzle rim instead of allowing the ship to refract itself.
          exitDistance = min(exitDistance,sceneDistance-.012);
          float stride = max(0.,exitDistance-entry)/12.;
          if(stride<=0.) discard;
          vec2 bend = vec2(0.);
          float weight = 0.;
          for(int i=0;i<12;i++) {
            vec3 p = localEye+ray*(entry+(float(i)+.5)*stride);
            float aft = clamp(-p.z,0.,1.);
            float radius = (.23+.075*sin(aft*3.14159))*(1.-smoothstep(.72,1.,aft)*.8);
            float radial = length(p.xy)/max(radius,.005);
            float envelope = exp(-radial*radial*2.5)*(1.-smoothstep(.72,1.18,radial));
            envelope *= smoothstep(.012,.12,aft)*(1.-smoothstep(.68,1.,aft));
            float travel = aft*13.-flowTime*(3.4+pressure*2.1);
            // Two advected scales give smooth schlieren-like folds, with no
            // random per-frame jitter, frame history or screen-wide wobble.
            vec2 wave = vec2(sin(travel+p.y*11.),cos(travel*.79+p.x*13.));
            wave += .36*vec2(sin(travel*1.83-p.x*24.),cos(travel*1.47+p.y*27.));
            bend += wave*envelope*stride;
            weight += envelope*stride;
          }
          float coverage = 1.-exp(-weight*7.);
          if(coverage<.002) discard;
          vec2 direction = bend/max(weight,.0001);
          // Pixel amplitudes are independent of canvas/device pixel ratio.
          float pixels = 1.1+velocity*1.1+pressure*3.6;
          float frontDepth = -viewZ*entry/max(rayLength,.00001);
          gl_FragColor = vec4(direction*pixels*coverage,frontDepth*coverage,coverage);
        }`,
    });
    this.composite = new THREE.ShaderMaterial({
      name: 'Exhaust heat / silhouette-safe refraction',
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
      uniforms: {
        tDiffuse: { value: null },
        tField: { value: this.field.texture },
        sceneDepth: { value: null },
        inverseSize: { value: new THREE.Vector2(1, 1) },
        pixelRatio: { value: 1 },
        projectionInverse: { value: new THREE.Matrix4() },
        viewToHull: { value: new THREE.Matrix4() },
        protectHull: { value: 0 },
        hullMin: { value: new THREE.Vector3() },
        hullMax: { value: new THREE.Vector3() },
        nearPlane: { value: camera.near },
        farPlane: { value: camera.far },
      },
      vertexShader: `
        varying vec2 screenUv;
        void main() {
          screenUv = uv;
          gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.);
        }`,
      fragmentShader: `
        #include <packing>
        uniform sampler2D tDiffuse;
        uniform sampler2D tField;
        uniform sampler2D sceneDepth;
        uniform vec2 inverseSize;
        uniform float pixelRatio;
        uniform mat4 projectionInverse;
        uniform mat4 viewToHull;
        uniform float protectHull;
        uniform vec3 hullMin;
        uniform vec3 hullMax;
        uniform float nearPlane;
        uniform float farPlane;
        varying vec2 screenUv;
        float outsideHull(vec2 uv,float depth) {
          if(protectHull<.5) return 1.;
          vec4 viewPoint = projectionInverse*vec4(uv*2.-1.,depth*2.-1.,1.);
          vec3 hullPoint = (viewToHull*vec4(viewPoint.xyz/viewPoint.w,1.)).xyz;
          bool inside = all(greaterThanEqual(hullPoint,hullMin)) && all(lessThanEqual(hullPoint,hullMax));
          return inside ? 0. : 1.;
        }
        void main() {
          vec4 field = texture2D(tField,screenUv);
          vec2 offset = field.rg*inverseSize*pixelRatio;
          vec2 shiftedUv = clamp(screenUv+offset,inverseSize*.5,vec2(1.)-inverseSize*.5);
          float frontDepth = field.b/max(field.a,.00001);
          float currentRaw = texture2D(sceneDepth,screenUv).r;
          float shiftedRaw = texture2D(sceneDepth,shiftedUv).r;
          float currentDepth = -perspectiveDepthToViewZ(currentRaw,nearPlane,farPlane);
          float shiftedDepth = -perspectiveDepthToViewZ(shiftedRaw,nearPlane,farPlane);
          // Repeat the depth guard at full resolution, including the sampled
          // destination. This rejects foreground bleed from filtered field edges.
          float uncovered = step(.002,field.a)*step(frontDepth+.015,currentDepth);
          uncovered *= step(frontDepth+.015,shiftedDepth);
          uncovered *= smoothstep(0.,.15,shiftedDepth-currentDepth+.15);
          uncovered *= outsideHull(screenUv,currentRaw)*outsideHull(shiftedUv,shiftedRaw);
          gl_FragColor = texture2D(tDiffuse,mix(screenUv,shiftedUv,uncovered));
        }`,
    });
    this.quad = new FullScreenQuad(this.composite);
  }

  setSize(width, height) {
    // Half-resolution vectors are smooth; geometry/depth guards stay full-res.
    this.field.setSize(
      Math.max(1, Math.ceil(width / 2)),
      Math.max(1, Math.ceil(height / 2)),
    );
    this.material.uniforms.resolution.value.set(
      this.field.width,
      this.field.height,
    );
    this.composite.uniforms.inverseSize.value.set(1 / width, 1 / height);
  }

  render(renderer, writeBuffer, readBuffer) {
    this.sources.length = 0;
    this.scene.traverseVisible((object) => {
      if (
        object.userData.exhaustHeat &&
        object.userData.exhaustHeat.enabled !== false
      )
        this.sources.push(object);
    });
    this.sources.forEach((source, index) => {
      if (!this.proxies[index]) {
        const mesh = new THREE.Mesh(this.geometry, this.material);
        mesh.matrixAutoUpdate = false;
        mesh.onBeforeRender = () => {
          const source = mesh.userData.source;
          const heat = source.userData.exhaustHeat;
          const hull = source.parent;
          this.hullInverse.copy(hull.matrixWorld).invert();
          this.material.uniforms.heatToHull.value.multiplyMatrices(
            this.hullInverse,
            mesh.matrixWorld,
          );
          this.material.uniforms.hullMin.value
            .fromArray(hull.userData.bounds.min)
            .addScalar(-0.025);
          this.material.uniforms.hullMax.value
            .fromArray(hull.userData.bounds.max)
            .addScalar(0.025);
          this.material.uniforms.flowTime.value = heat.time;
          this.material.uniforms.pressure.value = mesh.userData.heatLevel;
          this.material.uniforms.velocity.value = heat.velocity;
          this.material.uniformsNeedUpdate = true;
        };
        this.fieldScene.add(mesh);
        this.proxies.push(mesh);
      }
      const mesh = this.proxies[index];
      mesh.visible = true;
      mesh.userData.source = source;
      const { velocity, pressure } = source.userData.exhaustHeat;
      // Hot exhaust persists well beyond the visible blue flame. High-speed
      // cruise uses the former boost wake; boost adds a modest 12% width/18%
      // length and stronger refraction. Idle still has a small warm wake.
      const cruiseHeat = THREE.MathUtils.smoothstep(velocity, 0.05, 0.7);
      const runningHeat = THREE.MathUtils.lerp(cruiseHeat, 1, pressure);
      const flameWidth = THREE.MathUtils.lerp(
        0.95 + velocity * 0.42,
        1.5,
        pressure,
      );
      const flameLength = 0.38 + velocity * 1.65 + pressure * 3.5;
      const heatWidth =
        THREE.MathUtils.lerp(0.95 + velocity * 0.42, 1.5, runningHeat) *
        (1 + pressure * 0.12);
      const heatLength =
        (0.38 + velocity * 1.65 + runningHeat * 3.5) * (1 + pressure * 0.18);
      mesh.userData.heatLevel = runningHeat + pressure * 0.2;
      this.expansion.makeScale(
        (2.7 * heatWidth) / flameWidth,
        (2.7 * heatWidth) / flameWidth,
        (1.7 * heatLength) / flameLength,
      );
      mesh.matrix.copy(source.matrixWorld).multiply(this.expansion);
    });
    for (
      let index = this.sources.length;
      index < this.proxies.length;
      index++
    ) {
      this.proxies[index].visible = false;
      this.proxies[index].userData.source = null;
    }
    const uniforms = this.material.uniforms;
    uniforms.sceneDepth.value = readBuffer.depthTexture;
    uniforms.nearPlane.value = this.camera.near;
    uniforms.farPlane.value = this.camera.far;
    const clearAlpha = renderer.getClearAlpha();
    renderer.getClearColor(this.clearColor);
    const autoClear = renderer.autoClear;
    try {
      renderer.autoClear = false;
      renderer.setRenderTarget(this.field);
      renderer.setClearColor(0, 0);
      renderer.clear();
      renderer.render(this.fieldScene, this.camera);
      this.composite.uniforms.tDiffuse.value = readBuffer.texture;
      this.composite.uniforms.sceneDepth.value = readBuffer.depthTexture;
      this.composite.uniforms.nearPlane.value = this.camera.near;
      this.composite.uniforms.farPlane.value = this.camera.far;
      this.composite.uniforms.pixelRatio.value = renderer.getPixelRatio();
      const hull = this.sources[0]?.parent;
      this.composite.uniforms.protectHull.value = hull ? 1 : 0;
      if (hull) {
        this.hullInverse.copy(hull.matrixWorld).invert();
        this.composite.uniforms.viewToHull.value.multiplyMatrices(
          this.hullInverse,
          this.camera.matrixWorld,
        );
        this.composite.uniforms.projectionInverse.value.copy(
          this.camera.projectionMatrixInverse,
        );
        this.composite.uniforms.hullMin.value
          .fromArray(hull.userData.bounds.min)
          .addScalar(-0.025);
        this.composite.uniforms.hullMax.value
          .fromArray(hull.userData.bounds.max)
          .addScalar(0.025);
      }
      renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer);
      this.quad.render(renderer);
    } finally {
      renderer.setClearColor(this.clearColor, clearAlpha);
      renderer.autoClear = autoClear;
      // The renderer borrows current sources only; fleet disposal leaves no
      // retained model in this pass between frames or after ship replacement.
      for (const mesh of this.proxies) mesh.userData.source = null;
      this.sources.length = 0;
    }
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.field.dispose();
    this.geometry.dispose();
    this.material.dispose();
    this.composite.dispose();
    this.quad.dispose();
    this.fieldScene.clear();
    this.proxies.length = 0;
    this.sources.length = 0;
  }
}
