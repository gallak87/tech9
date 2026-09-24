import {
  Color,
  DepthTexture,
  HalfFloatType,
  ShaderMaterial,
  UnsignedIntType,
  Vector2,
  WebGLRenderTarget,
} from 'three';
import { FullScreenQuad } from 'three/addons/postprocessing/Pass.js';

// A single linear-HDR scene target followed by depth-aware screen-space light scattering.
// Rays are occluded by the actual scene depth, including alpha-tested foliage.
export class AtmospherePass {
  constructor(renderer) {
    this.renderer = renderer;
    this.target = new WebGLRenderTarget(1, 1, {
      type: HalfFloatType,
      depthBuffer: true,
    });
    this.target.depthTexture = new DepthTexture(1, 1, UnsignedIntType);
    this.material = new ShaderMaterial({
      uniforms: {
        tColor: { value: this.target.texture },
        tDepth: { value: this.target.depthTexture },
        sunScreen: { value: new Vector2(0.9, 0.95) },
        strength: { value: 0.7 },
        raySteps: { value: 32 },
        sunColor: { value: new Color('#ffe4b0') },
        aspect: { value: 1 },
      },
      vertexShader:
        'varying vec2 vUv; void main(){vUv=uv; gl_Position=vec4(position.xy,0.0,1.0);}',
      fragmentShader: `
        uniform sampler2D tColor; uniform sampler2D tDepth;
        uniform vec2 sunScreen; uniform float strength; uniform float raySteps;
        uniform vec3 sunColor; uniform float aspect; varying vec2 vUv;
        void main(){
          vec3 color=texture2D(tColor,vUv).rgb;
          vec2 ray=(sunScreen-vUv)*0.92/raySteps;
          vec2 p=vUv;
          float scatter=0.0; float decay=1.0;
          float jitter=fract(sin(dot(gl_FragCoord.xy,vec2(12.9898,78.233)))*43758.5453);
          p+=ray*jitter;
          for(int i=0;i<48;i++){
            if(float(i)>=raySteps) break;
            p+=ray;
            float visible=step(0.99995,texture2D(tDepth,clamp(p,0.001,0.999)).r);
            visible*=step(0.0,p.x)*step(p.x,1.0)*step(0.0,p.y)*step(p.y,1.0);
            scatter+=visible*decay; decay*=0.965;
          }
          vec2 sunDelta=(vUv-sunScreen)*vec2(aspect,1.0);
          float halo=exp(-dot(sunDelta,sunDelta)*6.0);
          float sourceFade=1.0-smoothstep(0.6,1.4,length(sunScreen-0.5));
          color+=sunColor*(scatter/raySteps)*strength*sourceFade*(0.20+halo*0.95);
          float vignette=1.0-0.15*smoothstep(0.15,0.82,length((vUv-0.5)*vec2(1.0,0.8)));
          color*=vignette;
          gl_FragColor=vec4(color,1.0);
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
    this.material.uniforms.aspect.value = width / height;
  }
  configure(preset, settings) {
    if (this.target.samples !== preset.samples) {
      this.target.samples = preset.samples;
      this.target.dispose();
    }
    this.material.uniforms.raySteps.value = preset.rays;
    this.material.uniforms.strength.value =
      settings.atmosphere * settings.sunlight * 0.7;
  }
  render(scene, camera, sunPosition) {
    const projected = sunPosition.clone().project(camera);
    this.material.uniforms.sunScreen.value.set(
      projected.x * 0.5 + 0.5,
      projected.y * 0.5 + 0.5,
    );
    const strength = this.material.uniforms.strength.value;
    if (projected.z > 1) this.material.uniforms.strength.value = 0;
    this.renderer.setRenderTarget(this.target);
    this.renderer.render(scene, camera);
    this.renderer.setRenderTarget(null);
    this.quad.render(this.renderer);
    this.material.uniforms.strength.value = strength;
  }
  dispose() {
    this.target.dispose();
    this.material.dispose();
    this.quad.dispose();
  }
}
