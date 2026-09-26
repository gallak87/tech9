import {
  InstancedBufferGeometry,
  InstancedBufferAttribute,
  PlaneGeometry,
  ShaderMaterial,
  Mesh,
  Vector2,
  Vector3,
  Vector4,
  Color,
} from 'three';
import { surfaceGLSL } from './surfaces.js';

/** Bounded toroidal volumes, evaluated on the GPU. Travel never leaves a stale emitter. */
export function createPrecipitation(
  scene,
  camera,
  field,
  { rain = true, snow = true } = {},
) {
  const effects = [];
  for (const kind of ['rain', 'snow']) {
    if (kind === 'rain' ? !rain : !snow) continue;
    const capacity = kind === 'rain' ? 3600 : 1800;
    const base = new PlaneGeometry(1, 1);
    const geometry = new InstancedBufferGeometry();
    geometry.index = base.index.clone();
    geometry.setAttribute('position', base.attributes.position.clone());
    geometry.setAttribute('uv', base.attributes.uv.clone());
    base.dispose();
    const seeds = new Float32Array(capacity * 4);
    for (let i = 0; i < seeds.length; i++)
      seeds[i] = (((Math.sin(i * 78.233 + 12.98) * 43758.5453) % 1) + 1) % 1;
    geometry.setAttribute(
      'weatherSeed',
      new InstancedBufferAttribute(seeds, 4),
    );
    const uniforms = {
      weatherField: { value: field.texture },
      weatherBounds: {
        value: new Vector4(field.bounds.x, field.bounds.y, ...field.size),
      },
      time: { value: 0 },
      eye: { value: new Vector3() },
      wind: { value: new Vector2() },
      windTravel: { value: new Vector2() },
      fogColor: { value: new Color() },
      fogDensity: { value: 0 },
      strength: { value: 0 },
    };
    const isRain = kind === 'rain';
    const material = new ShaderMaterial({
      uniforms,
      transparent: true,
      depthWrite: false,
      vertexShader: `
        ${surfaceGLSL}
        attribute vec4 weatherSeed;
        uniform float time; uniform vec3 eye; uniform vec2 wind; uniform vec2 windTravel;
        varying vec2 vUv; varying float vFade; varying float vDistance;
        void main(){
          float fallSpeed = ${isRain ? '15.0+weatherSeed.w*7.0' : '0.72+weatherSeed.w*0.75'};
          float radius = ${isRain ? '22.0' : '18.0'};
          vec3 p=vec3(weatherSeed.x*radius*2.0,weatherSeed.y*22.0,weatherSeed.z*radius*2.0);
          p.xz += windTravel*${isRain ? '0.68' : '0.8'};
          ${isRain ? '' : 'p.x += sin(time*0.8+weatherSeed.w*43.0)*0.6; p.z += cos(time*0.6+weatherSeed.x*25.0)*0.45;'}
          p.xz = mod(p.xz-eye.xz+radius,radius*2.0)-radius+eye.xz;
          p.y=mod(p.y-time*fallSpeed-eye.y+5.0,22.0)-5.0+eye.y;
          vec4 hit=weatherSurface(p.xz);
          float floorY=mix(hit.a,hit.r,step(weatherSeed.w,hit.g));
          float above=smoothstep(floorY+0.02,floorY+0.18,p.y);
          float edge=1.0-smoothstep(radius*0.72,radius,length(p.xz-eye.xz));
          vec4 mv=viewMatrix*vec4(p,1.0);
          vec3 velocity=(viewMatrix*vec4(wind.x*0.68,-fallSpeed,wind.y*0.68,0.0)).xyz;
          vec2 along=normalize(velocity.xy+vec2(0.0001));
          vec2 across=vec2(along.y,-along.x);
          float size=${isRain ? '0.014+weatherSeed.w*0.009' : '0.018+weatherSeed.w*0.035'};
          mv.xy += ${isRain ? 'across*position.x*size+along*position.y*(0.11+weatherSeed.w*0.17)' : 'position.xy*size'};
          gl_Position=projectionMatrix*mv;
          vUv=uv;
          vFade=above*edge*smoothstep(0.55,2.0,-mv.z)*(1.0-smoothstep(13.0,17.0,p.y-eye.y));
          vDistance=length(mv.xyz);
        }`,
      fragmentShader: `
        uniform vec3 fogColor; uniform float fogDensity; uniform float strength;
        varying vec2 vUv; varying float vFade; varying float vDistance;
        void main(){
          float shape=${isRain ? 'pow(max(0.0,1.0-abs(vUv.x-0.5)*2.0),1.4)*sin(vUv.y*3.14159)' : '1.0-smoothstep(0.15,0.5,length(vUv-0.5))'};
          float fog=1.0-exp(-fogDensity*fogDensity*vDistance*vDistance);
          vec3 color=mix(${isRain ? 'vec3(0.65,0.74,0.8)' : 'vec3(0.85,0.91,0.94)'},fogColor,fog);
          gl_FragColor=vec4(color,shape*vFade*${isRain ? '0.52' : '0.85'}*strength);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    });
    const mesh = new Mesh(geometry, material);
    mesh.name = `Weather ${kind}`;
    mesh.frustumCulled = false;
    mesh.renderOrder = 3;
    scene.add(mesh);
    effects.push({ kind, capacity, geometry, material, mesh, uniforms });
  }
  return {
    update(state) {
      for (const effect of effects) {
        const intensity = effect.kind === 'rain' ? state.rain : state.snowfall;
        effect.geometry.instanceCount = Math.round(effect.capacity * intensity);
        effect.mesh.visible = intensity > 0.002;
        effect.uniforms.time.value = state.time;
        effect.uniforms.eye.value.copy(camera.position);
        effect.uniforms.wind.value.set(state.windX, state.windZ);
        effect.uniforms.windTravel.value.set(
          state.windTravelX,
          state.windTravelZ,
        );
        effect.uniforms.strength.value = Math.min(1, intensity * 8);
        effect.uniforms.fogColor.value.copy(
          scene.fog?.color ?? new Color('#a8b8c4'),
        );
        effect.uniforms.fogDensity.value = scene.fog?.density ?? 0;
      }
    },
    snapshot: () =>
      Object.fromEntries(
        effects.map((e) => [
          e.kind,
          e.mesh.visible ? e.geometry.instanceCount : 0,
        ]),
      ),
    dispose() {
      for (const e of effects) {
        e.mesh.removeFromParent();
        e.geometry.dispose();
        e.material.dispose();
      }
    },
  };
}
