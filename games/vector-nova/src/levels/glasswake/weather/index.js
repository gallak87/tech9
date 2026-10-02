import * as T from 'three';
import { createSnowDriftLayer } from './drift.js';
import { sampleGlasswakeWeather } from './state.js';
/** Local racing adaptation of the Tech9 weather reference's seeded GPU volumes.
 * World-space wrapping, faded volume edges and two depth layers suit race speed.
 * No frame loop, audio owner, physics mutation, or framework import is created.
 */
export function createGlasswakeWeather({ track, shape = false }) {
  const group = new T.Group();
  group.name = 'Glasswake / gusting snow and ice powder';
  group.userData.aoExclude = true;
  const layers = [];
  let disposed = false;
  let presentation = {};
  if (!shape)
    for (const [radius, height, capacity, size] of [
      [28, 42, 2400, 0.09],
      [120, 140, 4400, 0.22],
    ]) {
      const base = new T.PlaneGeometry(1, 1);
      const geometry = new T.InstancedBufferGeometry();
      geometry.index = base.index.clone();
      geometry.setAttribute('position', base.attributes.position.clone());
      geometry.setAttribute('uv', base.attributes.uv.clone());
      base.dispose();
      const seeds = new Float32Array(capacity * 4);
      for (let i = 0; i < seeds.length; i++)
        seeds[i] = (((Math.sin(i * 78.233 + 12.98) * 43758.5453) % 1) + 1) % 1;
      geometry.setAttribute(
        'snowSeed',
        new T.InstancedBufferAttribute(seeds, 4),
      );
      const material = new T.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        uniforms: {
          eye: { value: new T.Vector3() },
          clock: { value: 0 },
          wind: { value: new T.Vector2() },
          strength: { value: 0 },
          fogColor: { value: new T.Color('#91b0cb') },
          fogDensity: { value: 0.0004 },
          stretch: { value: 0 },
        },
        vertexShader: `
      attribute vec4 snowSeed; uniform vec3 eye; uniform float clock; uniform vec2 wind; uniform float stretch;
      varying vec2 snowUv; varying float snowFade; varying float snowDistance;
      void main(){
        float radius=${radius.toFixed(1)};float height=${height.toFixed(1)};
        vec3 p=vec3(snowSeed.x*radius*2.,snowSeed.y*height,snowSeed.z*radius*2.);
        p.xz+=wind*clock*.8;
        p.x+=sin(clock*.73+snowSeed.w*43.)*.8;
        p.z+=cos(clock*.59+snowSeed.x*25.)*.5;
        p.xz=mod(p.xz-eye.xz+radius,radius*2.)-radius+eye.xz;
        p.y=mod(p.y-clock*(1.1+snowSeed.w*1.8)-eye.y+height*.3,height)-height*.3+eye.y;
        vec3 relative=p-eye;
        float edge=(1.-smoothstep(radius*.62,radius,length(relative.xz)))*(1.-smoothstep(height*.25,height*.7,relative.y));
        vec4 mv=viewMatrix*vec4(p,1.);
        float size=${size.toFixed(3)}*(.35+snowSeed.w*snowSeed.w);
        vec2 velocity=(viewMatrix*vec4(wind.x,-1.6,wind.y,0.)).xy;
        vec2 along=normalize(velocity+vec2(.0001));vec2 across=vec2(along.y,-along.x);
        mv.xy+=(across*position.x+along*position.y*(1.+stretch))*size;
        gl_Position=projectionMatrix*mv;
        snowUv=uv;snowDistance=length(mv.xyz);
        snowFade=edge*smoothstep(1.,3.,-mv.z)*(1.-smoothstep(radius*.9,radius*1.6,snowDistance));
      }`,
        fragmentShader: `
      uniform float strength;uniform vec3 fogColor;uniform float fogDensity;
      varying vec2 snowUv;varying float snowFade;varying float snowDistance;
      void main(){float disk=1.-smoothstep(.16,.5,length(snowUv-.5));
        float fog=1.-exp(-fogDensity*fogDensity*snowDistance*snowDistance);
        vec3 color=mix(vec3(.87,.94,1.),fogColor,fog);
        gl_FragColor=vec4(color,disk*snowFade*strength*.7);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
      });
      const mesh = new T.Mesh(geometry, material);
      mesh.name = 'Glasswake / windblown snow';
      mesh.frustumCulled = false;
      mesh.renderOrder = 3;
      group.add(mesh);
      layers.push({ mesh, geometry, material, capacity });
    }
  if (!shape) {
    const drift = createSnowDriftLayer();
    group.add(drift.mesh);
    layers.push(drift);
  }
  return {
    group,
    update({ state = {}, camera, settings = {}, reviewing = false } = {}) {
      if (disposed) return;
      const weather = sampleGlasswakeWeather(track, state, settings);
      let count = 0;
      for (const layer of layers) {
        const quality = settings.quality === 'low' ? 0.8 : 1;
        const intensity = reviewing
          ? 0
          : weather.storm * (settings.reducedMotion ? 0.9 : 1);
        layer.geometry.instanceCount = Math.round(
          layer.capacity * intensity * quality,
        );
        layer.mesh.visible = layer.geometry.instanceCount > 0;
        const u = layer.material.uniforms;
        if (camera) u.eye.value.copy(camera.position);
        u.clock.value = weather.time;
        u.wind.value.set(weather.windX, weather.windZ);
        u.strength.value = Math.min(1, intensity * 2.5);
        u.stretch.value = settings.reducedMotion
          ? 0
          : Math.min(1.4, (state.speed ?? 0) / 90);
        count += layer.geometry.instanceCount;
      }
      presentation = {
        ...weather,
        particles: count,
        reducedMotion: Boolean(settings.reducedMotion),
      };
    },
    snapshot: () => ({ ...presentation }),
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const l of layers) {
        l.geometry.dispose();
        l.material.dispose();
      }
      group.clear();
    },
  };
}
