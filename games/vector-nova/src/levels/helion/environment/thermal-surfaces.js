import * as T from 'three';
import { sampleHelionThermal } from '../thermal.js';
const vertex = `varying vec2 thermalUv; void main(){thermalUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`;
const fragment = `varying vec2 thermalUv;uniform float flow,strength,flame,span;uniform vec3 color;
float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);}
void main(){vec2 p=thermalUv;float edge=smoothstep(0.,.045,p.x)*smoothstep(0.,.045,1.-p.x);
float cell=noise(vec2(p.x*9.,p.y*span*.4-flow*.55));float thread=pow(.5+.5*sin(p.x*39.+p.y*span*.8+cell*9.-flow*.8),5.);
vec3 fire=mix(vec3(.8,.024,.003),vec3(2.2,.52,.024),cell*.5+thread*.5);
float boundary=1.-smoothstep(.005,.03,min(p.x,1.-p.x));
float alpha=mix(.06+strength*.24+boundary*.36,(.13+cell*.3+thread*.19)*strength,flame)*smoothstep(0.,.003,min(p.x,1.-p.x));
vec3 c=mix(color*.7,fire,flame);
gl_FragColor=vec4(c,alpha);
#include <tonemapping_fragment>
#include <colorspace_fragment>
}`;

// Every flame row and ember samples the exact moving simulation footprint.
function surface(track, zone, { flame = false } = {}) {
  const rows = Math.max(2, Math.ceil((zone.end - zone.start) / 5));
  const columns = flame ? 12 : 1;
  const positions = new Float32Array((rows + 1) * (columns + 1) * 3);
  const uv = new Float32Array((rows + 1) * (columns + 1) * 2);
  const indices = [],
    frames = [];
  for (let i = 0; i <= rows; i++) {
    const s = T.MathUtils.lerp(zone.start, zone.end, i / rows);
    frames.push({ frame: track.sample(s), s });
    for (let j = 0; j <= columns; j++) {
      const index = i * (columns + 1) + j;
      uv[index * 2] = j / columns;
      uv[index * 2 + 1] = i / rows;
      if (i < rows && j < columns) {
        const a = index,
          b = a + columns + 1;
        indices.push(a, b, a + 1, a + 1, b, b + 1);
      }
    }
  }
  const geometry = new T.BufferGeometry();
  geometry.setAttribute(
    'position',
    new T.BufferAttribute(positions, 3).setUsage(T.DynamicDrawUsage),
  );
  geometry.setAttribute('uv', new T.BufferAttribute(uv, 2));
  geometry.setIndex(indices);
  const material = new T.ShaderMaterial({
    name: `Helion / ${zone.kind} ${flame ? 'rising plasma' : 'thermal footprint'}`,
    transparent: true,
    depthWrite: false,
    side: T.DoubleSide,
    uniforms: {
      color: {
        value: new T.Color(zone.kind === 'cooling' ? '#62baba' : '#ee732b'),
      },
      flow: { value: 0 },
      strength: { value: 0 },
      flame: { value: flame ? 1 : 0 },
      span: { value: zone.end - zone.start },
    },
    vertexShader: vertex,
    fragmentShader: fragment,
  });
  const mesh = new T.Mesh(geometry, material);
  mesh.name = `${zone.label} / ${flame ? 'rising plasma' : 'physical heat boundary'}`;
  mesh.userData.aoExclude = true;
  mesh.frustumCulled = false;
  mesh.renderOrder = 4;
  function update(time, reducedMotion) {
    const sample = sampleHelionThermal(
      track,
      (zone.start + zone.end) / 2,
      0,
      time,
    );
    const half = zone.kind === 'flare' ? sample.laneHalfWidth : 14.4;
    const center = zone.kind === 'flare' ? sample.laneCenter : 0;
    const minimum = Math.max(
      zone.kind === 'flare' ? -8.5 : -14.5,
      center - half,
    );
    const maximum = Math.min(14.5, center + half);
    for (let i = 0; i <= rows; i++) {
      const { frame, s } = frames[i],
        gap = track.gapAt?.(s);
      const max = gap ? Math.min(0, maximum) : maximum,
        min = Math.min(minimum, max);
      for (let j = 0; j <= columns; j++) {
        const u = j / columns;
        const shape = Math.sin(u * Math.PI) ** 0.8;
        const phase = reducedMotion ? 0 : time * 0.7;
        const irregular =
          Math.sin(i * 1.73 + j * 0.49) * Math.sin(i * 0.67 - j * 1.19);
        const height = flame
          ? sample.flareStrength *
            shape *
            (0.25 +
              (1 + irregular) *
                (0.35 + 1.4 * Math.sin(i * 0.91 + j * 1.37 - phase) ** 4))
          : 0;
        frame.position
          .clone()
          .addScaledVector(frame.right, T.MathUtils.lerp(min, max, u))
          .addScaledVector(frame.up, 0.12 + height)
          .toArray(positions, (i * (columns + 1) + j) * 3);
      }
    }
    geometry.attributes.position.needsUpdate = true;
    material.uniforms.flow.value = reducedMotion ? 0 : time;
    material.uniforms.strength.value =
      zone.kind === 'cooling' ? 0.35 : sample.flareStrength;
    mesh.visible = !flame || sample.active;
  }
  update(0, true);
  return {
    mesh,
    update,
    dispose() {
      geometry.dispose();
      material.dispose();
    },
  };
}
// Disconnected crossed tongues provide volume without a continuous fabric mesh.
function tongues(track, zone) {
  const rows = Math.ceil((zone.end - zone.start) / 6),
    columns = 6;
  const positions = new Float32Array(rows * columns * 2 * 5 * 3);
  const uv = new Float32Array(rows * columns * 2 * 5 * 2),
    indices = [],
    frames = [];
  const profile = [
    [-1, 0],
    [1, 0],
    [-0.58, 0.57],
    [0.38, 0.53],
    [-0.13, 1],
  ];
  for (let i = 0; i < rows; i++) {
    const s = T.MathUtils.lerp(zone.start + 1, zone.end - 1, (i + 0.5) / rows);
    for (let j = 0; j < columns; j++) {
      const shifted = T.MathUtils.clamp(
        s + Math.sin(i * 7.73 + j * 3.41) * 2.1,
        zone.start + 0.5,
        zone.end - 0.5,
      );
      frames.push({ frame: track.sample(shifted), s: shifted });
    }
    for (let j = 0; j < columns; j++)
      for (let side = 0; side < 2; side++) {
        const base = ((i * columns + j) * 2 + side) * 5;
        for (let k = 0; k < 5; k++) {
          uv[(base + k) * 2] = (profile[k][0] + 1) * 0.5;
          uv[(base + k) * 2 + 1] = profile[k][1];
        }
        indices.push(
          base,
          base + 1,
          base + 2,
          base + 1,
          base + 3,
          base + 2,
          base + 2,
          base + 3,
          base + 4,
        );
      }
  }
  const geometry = new T.BufferGeometry();
  geometry.setAttribute(
    'position',
    new T.BufferAttribute(positions, 3).setUsage(T.DynamicDrawUsage),
  );
  geometry.setAttribute('uv', new T.BufferAttribute(uv, 2));
  geometry.setIndex(indices);
  const material = new T.ShaderMaterial({
    name: `Helion / ${zone.kind} separated plasma tongues`,
    transparent: true,
    depthWrite: false,
    side: T.DoubleSide,
    uniforms: { flow: { value: 0 }, strength: { value: 0 } },
    vertexShader: vertex,
    fragmentShader: `varying vec2 thermalUv;uniform float flow,strength;
    float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
    float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);}
    void main(){vec2 p=thermalUv;float billow=noise(vec2(p.x*5.+sin(p.y*9.-flow)*.7,p.y*8.-flow*.85));float thread=pow(.5+.5*sin(p.x*22.+billow*8.+p.y*3.),3.);float halfWidth=max(.04,mix(.5,.26,smoothstep(0.,.55,p.y))*(1.-smoothstep(.55,1.,p.y)));float edge=1.-smoothstep(.55,1.,abs(p.x-.5-sin(p.y*9.+flow)*.035)/halfWidth);float alpha=edge*smoothstep(.17,.6,billow)*(.48+thread*.4)*(1.-p.y*.5)*smoothstep(0.,.18,p.y)*smoothstep(0.,.10,1.-p.y)*strength;if(alpha<.035)discard;vec3 c=mix(vec3(.65,.009,.001),vec3(2.35,.53,.021),thread*.5+billow*.4+(1.-p.y)*.25);gl_FragColor=vec4(c,alpha);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
    }`,
  });
  const mesh = new T.Mesh(geometry, material);
  mesh.name = `${zone.label} / rising plasma`;
  mesh.frustumCulled = false;
  mesh.userData.aoExclude = true;
  mesh.renderOrder = 4;
  return {
    mesh,
    update(time, reducedMotion) {
      const sample = sampleHelionThermal(
        track,
        (zone.start + zone.end) / 2,
        0,
        time,
      );
      const half = zone.kind === 'flare' ? sample.laneHalfWidth : 14.4,
        center = zone.kind === 'flare' ? sample.laneCenter : 0;
      const minimum = Math.max(
          zone.kind === 'flare' ? -8.5 : -14.5,
          center - half,
        ),
        maximum = Math.min(14.5, center + half);
      const phase = reducedMotion ? 0 : time;
      mesh.visible = sample.active;
      material.uniforms.flow.value = phase;
      material.uniforms.strength.value = sample.flareStrength;
      for (let i = 0; i < rows; i++) {
        for (let j = 0; j < columns; j++) {
          const { frame, s } = frames[i * columns + j],
            max = track.gapAt?.(s) ? Math.min(0, maximum) : maximum,
            min = Math.min(minimum, max);
          const seed = i * 7.73 + j * 3.41;
          const u = (j + 0.5 + 0.16 * Math.sin(seed)) / columns;
          const lateral = T.MathUtils.lerp(min, max, u);
          const width = Math.min(
            ((max - min) / columns) * 0.38,
            0.65 + 0.38 * (1 + Math.sin(seed * 1.9)),
          );
          const height =
            sample.flareStrength *
            (1.5 + 3.5 * (0.5 + 0.5 * Math.sin(seed * 1.7 + phase * 0.7)) ** 2);
          for (let side = 0; side < 2; side++)
            for (let k = 0; k < 5; k++) {
              const [x, y] = profile[k];
              const sway = Math.sin(seed + phase * 0.6 + y * 2) * 0.32 * y;
              const px = T.MathUtils.clamp(
                lateral + (side === 0 ? x * width : sway) + sway,
                min,
                max,
              );
              frame.position
                .clone()
                .addScaledVector(frame.right, px)
                .addScaledVector(
                  frame.tangent,
                  side === 1 ? x * width : Math.sin(seed) * 0.4,
                )
                .addScaledVector(frame.up, 0.14 + y * height)
                .toArray(
                  positions,
                  (((i * columns + j) * 2 + side) * 5 + k) * 3,
                );
            }
        }
      }
      geometry.attributes.position.needsUpdate = true;
    },
    dispose() {
      geometry.dispose();
      material.dispose();
    },
  };
}
function embers(track, zone) {
  const count = 36,
    positions = new Float32Array(count * 3),
    frames = [];
  for (let i = 0; i < count; i++) {
    const s = T.MathUtils.lerp(zone.start + 1, zone.end - 1, (i + 0.5) / count);
    frames.push({ frame: track.sample(s), s });
  }
  const geometry = new T.BufferGeometry();
  geometry.setAttribute(
    'position',
    new T.BufferAttribute(positions, 3).setUsage(T.DynamicDrawUsage),
  );
  const material = new T.PointsMaterial({
    color: '#ffae49',
    size: 0.2,
    transparent: true,
    opacity: 0.62,
    depthWrite: false,
  });
  const mesh = new T.Points(geometry, material);
  mesh.name = `${zone.label} / contact embers`;
  mesh.frustumCulled = false;
  mesh.userData.aoExclude = true;
  return {
    mesh,
    update(time, reducedMotion) {
      const sample = sampleHelionThermal(
        track,
        (zone.start + zone.end) / 2,
        0,
        time,
      );
      mesh.visible = sample.active && !reducedMotion;
      material.opacity = 0.62 * sample.flareStrength;
      const half = zone.kind === 'flare' ? sample.laneHalfWidth : 14.4,
        center = zone.kind === 'flare' ? sample.laneCenter : 0;
      const minimum = Math.max(
          zone.kind === 'flare' ? -8.5 : -14.5,
          center - half,
        ),
        maximum = Math.min(14.5, center + half);
      for (let i = 0; i < count; i++) {
        const { frame, s } = frames[i],
          max = track.gapAt?.(s) ? Math.min(0, maximum) : maximum,
          min = Math.min(minimum, max);
        const u = (Math.sin(i * 17.3) * 43758.5) % 1;
        const phase = (((time * 0.31 + i * 0.618) % 1) + 1) % 1;
        frame.position
          .clone()
          .addScaledVector(frame.right, min + (max - min) * Math.abs(u))
          .addScaledVector(frame.up, 0.2 + phase * 2.8)
          .toArray(positions, i * 3);
      }
      geometry.attributes.position.needsUpdate = true;
    },
    dispose() {
      geometry.dispose();
      material.dispose();
    },
  };
}
export function createThermalSurfaces(track) {
  const group = new T.Group();
  group.name = 'Helion / explicit cooling and heat boundaries';
  const parts = [];
  for (const zone of track.thermalZones ?? []) {
    if (zone.kind === 'shelter') continue;
    parts.push(surface(track, zone));
    if (zone.kind !== 'cooling')
      parts.push(tongues(track, zone), embers(track, zone));
  }
  group.add(...parts.map((part) => part.mesh));
  let disposed = false;
  return {
    group,
    update({ time = 0, settings = {} }) {
      parts.forEach((part) => part.update(time, settings.reducedMotion));
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      parts.forEach((part) => part.dispose());
      group.clear();
    },
  };
}
