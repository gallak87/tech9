import {
  Color,
  DepthTexture,
  HalfFloatType,
  Matrix4,
  ShaderMaterial,
  UnsignedIntType,
  Vector2,
  Vector3,
  WebGLRenderTarget,
} from 'three';
import { FullScreenQuad } from 'three/addons/postprocessing/Pass.js';
const fullscreenVertex =
  'varying vec2 vUv; void main(){vUv=uv; gl_Position=vec4(position.xy,0.0,1.0);}';
/** Half-resolution world-space scattering through the actual directional shadow map.
 * Alpha-cutout pines occlude light in the air as well as shade the trail.
 */
export class AtmospherePass {
  constructor(renderer) {
    this.renderer = renderer;
    this.target = new WebGLRenderTarget(1, 1, {
      type: HalfFloatType,
      depthBuffer: true,
    });
    this.target.depthTexture = new DepthTexture(1, 1, UnsignedIntType);
    this.volumeTarget = new WebGLRenderTarget(1, 1, {
      type: HalfFloatType,
      depthBuffer: false,
    });
    this.volumeMaterial = new ShaderMaterial({
      uniforms: {
        tDepth: { value: this.target.depthTexture },
        tShadow: { value: null },
        inverseProjection: { value: new Matrix4() },
        cameraWorld: { value: new Matrix4() },
        shadowMatrix: { value: new Matrix4() },
        eye: { value: new Vector3() },
        lightDirection: { value: new Vector3() },
        sunColor: { value: new Color('#ffe3a3') },
        strength: { value: 1 },
        raySteps: { value: 32 },
      },
      vertexShader: fullscreenVertex,
      fragmentShader: `
        uniform sampler2D tDepth;
        uniform highp sampler2DShadow tShadow;
        uniform mat4 inverseProjection; uniform mat4 cameraWorld; uniform mat4 shadowMatrix;
        uniform vec3 eye; uniform vec3 lightDirection; uniform vec3 sunColor;
        uniform float strength; uniform float raySteps; varying vec2 vUv;
        void main(){
          float depth=texture2D(tDepth,vUv).r;
          vec4 view=inverseProjection*vec4(vUv*2.0-1.0,depth*2.0-1.0,1.0);
          vec3 world=(cameraWorld*vec4(view.xyz/view.w,1.0)).xyz;
          vec3 delta=world-eye;
          float rayLength=min(length(delta),85.0);
          vec3 ray=normalize(delta);
          float stepLength=rayLength/raySteps;
          float jitter=fract(52.9829189*fract(dot(gl_FragCoord.xy,vec2(0.06711056,0.00583715))));
          float scattering=0.0;
          for(int i=0;i<48;i++){
            if(float(i)>=raySteps)break;
            float distance=(float(i)+jitter)*stepLength;
            vec3 point=eye+ray*distance;
            vec4 shadow=shadowMatrix*vec4(point,1.0);
            vec3 coord=shadow.xyz/shadow.w;
            float visible=0.0;
            if(coord.x>0.0&&coord.x<1.0&&coord.y>0.0&&coord.y<1.0&&coord.z<1.0){
              visible=texture(tShadow,vec3(coord.xy,coord.z-0.0002));
            }
            float groundMist=exp(-max(point.y-1.0,0.0)*0.105);
            scattering+=visible*groundMist*exp(-distance*0.012)*stepLength;
          }
          float alignment=max(dot(ray,lightDirection),0.0);
          float phase=0.55+pow(alignment,4.0)*1.65;
          gl_FragColor=vec4(sunColor*scattering*0.0075*phase*strength,1.0);
        }`,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
    });
    this.volumeQuad = new FullScreenQuad(this.volumeMaterial);
    this.material = new ShaderMaterial({
      uniforms: {
        tColor: { value: this.target.texture },
        tDepth: { value: this.target.depthTexture },
        tVolume: { value: this.volumeTarget.texture },
        resolution: { value: new Vector2(1, 1) },
        clipPlanes: { value: new Vector2(0.15, 240) },
      },
      vertexShader: fullscreenVertex,
      fragmentShader: `
        uniform sampler2D tColor; uniform sampler2D tVolume; uniform sampler2D tDepth;
        uniform vec2 resolution; uniform vec2 clipPlanes; varying vec2 vUv;
        float viewDepth(vec2 uv){float z=texture2D(tDepth,uv).r;return clipPlanes.x*clipPlanes.y/(clipPlanes.y-z*(clipPlanes.y-clipPlanes.x));}
        void main(){
          vec3 color=texture2D(tColor,vUv).rgb;
          vec2 pixel=1.0/resolution;
          vec3 light=texture2D(tVolume,vUv).rgb*0.4;
          light+=texture2D(tVolume,vUv+vec2(pixel.x,0.0)).rgb*0.15;
          light+=texture2D(tVolume,vUv-vec2(pixel.x,0.0)).rgb*0.15;
          light+=texture2D(tVolume,vUv+vec2(0.0,pixel.y)).rgb*0.15;
          light+=texture2D(tVolume,vUv-vec2(0.0,pixel.y)).rgb*0.15;
          float centerDepth=viewDepth(vUv);
          float occlusion=0.0;
          for(int i=0;i<8;i++){
            float angle=float(i)*2.39996;
            vec2 offset=vec2(cos(angle),sin(angle))*pixel*(1.2+float(i)*0.5);
            float difference=centerDepth-viewDepth(vUv+offset);
            occlusion+=smoothstep(0.025,0.20,difference)*(1.0-smoothstep(0.30,1.25,difference));
          }
          color*=1.0-occlusion*0.0375;
          color+=light;
          color*=vec3(1.025,1.008,0.973);
          float vignette=1.0-0.12*smoothstep(0.2,0.8,length((vUv-0.5)*vec2(1.0,0.8)));
          gl_FragColor=vec4(color*vignette,1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
      depthTest: false,
      depthWrite: false,
    });
    this.quad = new FullScreenQuad(this.material);
  }
  resize(width, height, pixelRatio) {
    this.target.setSize(
      Math.floor(width * pixelRatio),
      Math.floor(height * pixelRatio),
    );
    const w = Math.max(1, Math.floor(width * pixelRatio * 0.5));
    const h = Math.max(1, Math.floor(height * pixelRatio * 0.5));
    this.volumeTarget.setSize(w, h);
    this.material.uniforms.resolution.value.set(w, h);
  }
  configure(preset, settings) {
    if (this.target.samples !== preset.samples) {
      this.target.samples = preset.samples;
      this.target.dispose();
    }
    this.volumeMaterial.uniforms.raySteps.value = preset.rays;
    this.volumeMaterial.uniforms.strength.value =
      settings.atmosphere * settings.sunlight;
  }
  render(scene, camera, sun) {
    this.renderer.setRenderTarget(this.target);
    this.renderer.render(scene, camera);
    this.material.uniforms.clipPlanes.value.set(camera.near, camera.far);
    const uniforms = this.volumeMaterial.uniforms;
    uniforms.tShadow.value = sun.shadow.map.depthTexture;
    uniforms.inverseProjection.value.copy(camera.projectionMatrixInverse);
    uniforms.cameraWorld.value.copy(camera.matrixWorld);
    uniforms.shadowMatrix.value.copy(sun.shadow.matrix);
    uniforms.eye.value.copy(camera.position);
    uniforms.lightDirection.value
      .copy(sun.position)
      .sub(sun.target.position)
      .normalize();
    this.renderer.setRenderTarget(this.volumeTarget);
    this.volumeQuad.render(this.renderer);
    this.renderer.setRenderTarget(null);
    this.quad.render(this.renderer);
  }
  dispose() {
    this.target.dispose();
    this.volumeTarget.dispose();
    this.volumeMaterial.dispose();
    this.material.dispose();
    this.volumeQuad.dispose();
    this.quad.dispose();
  }
}
