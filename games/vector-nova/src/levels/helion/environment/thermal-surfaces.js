import * as T from 'three';
import { sampleHelionThermal } from '../thermal.js';

const vertex = `varying vec2 thermalUv; uniform float flow; uniform float strength; uniform float flame; void main(){thermalUv=uv;vec3 p=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.);}`;
const fragment = `varying vec2 thermalUv;uniform float flow;uniform float strength;uniform float flame;uniform vec3 color;
void main(){vec2 p=thermalUv;float edge=smoothstep(0.,.035,p.x)*smoothstep(0.,.035,1.-p.x);float stripe=.60+.40*smoothstep(.28,.39,abs(fract(p.y*18.)-.5));float flicker=.78+.22*sin(p.y*60.-flow*.8+sin(p.x*16.));float alpha=mix(.22,.56,strength)*edge*stripe;vec3 c=color*(.70+.35*strength);c+=vec3(.48,.21,.04)*flame*strength*flicker;gl_FragColor=vec4(c,alpha);
#include <tonemapping_fragment>
#include <colorspace_fragment>
}`;

// Row positions derive from the actual rolled route. The moving boundary is
// sampled from exactly the simulation function in every visual quality mode.
function surface(track, zone, color, { flame = false } = {}) {
  const rows = Math.max(2, Math.ceil((zone.end - zone.start) / 7));
  const positions = new Float32Array((rows + 1) * 3 * 2);
  const normals = new Float32Array(positions.length);
  const uv = new Float32Array((rows + 1) * 2 * 2);
  const indices = [];
  const frames = [];
  for (let i = 0; i <= rows; i++) {
    const s = T.MathUtils.lerp(zone.start, zone.end, i / rows);
    const frame = track.sample(s);
    frames.push({ frame, s });
    for (let j = 0; j < 2; j++) {
      uv[(i * 2 + j) * 2] = j;
      uv[(i * 2 + j) * 2 + 1] = i / rows;
    }
    if (i < rows) {
      const a = i * 2;
      indices.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
    }
  }
  const geometry = new T.BufferGeometry();
  geometry.setAttribute(
    'position',
    new T.BufferAttribute(positions, 3).setUsage(T.DynamicDrawUsage),
  );
  geometry.setAttribute('normal', new T.BufferAttribute(normals, 3));
  geometry.setAttribute('uv', new T.BufferAttribute(uv, 2));
  geometry.setIndex(indices);
  const material = new T.ShaderMaterial({
    name: `Helion / ${zone.kind} readable surface`,
    transparent: true,
    depthWrite: false,
    side: T.DoubleSide,
    uniforms: {
      color: { value: new T.Color(color) },
      flow: { value: 0 },
      strength: { value: 0 },
      flame: { value: flame ? 1 : 0 },
    },
    vertexShader: vertex,
    fragmentShader: fragment,
  });
  const mesh = new T.Mesh(geometry, material);
  mesh.name = `${zone.label} / physical heat boundary`;
  mesh.renderOrder = 4;
  mesh.userData.aoExclude = true;
  mesh.frustumCulled = false;
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
      const { frame, s } = frames[i];
      const gap = track.gapAt?.(s);
      const max = gap ? Math.min(0, maximum) : maximum;
      const min = Math.min(minimum, max);
      for (let j = 0; j < 2; j++) {
        const p = frame.position
          .clone()
          .addScaledVector(frame.right, j ? max : min)
          .addScaledVector(
            frame.up,
            0.055 +
              (flame
                ? sample.flareStrength * (0.35 + 0.55 * Math.sin(i * 0.7) ** 2)
                : 0),
          );
        p.toArray(positions, (i * 2 + j) * 3);
        frame.up.toArray(normals, (i * 2 + j) * 3);
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

export function createThermalSurfaces(track) {
  const group = new T.Group();
  group.name = 'Helion / explicit cooling and heat boundaries';
  const surfaces = [];
  for (const zone of track.thermalZones ?? []) {
    if (zone.kind === 'shelter') continue;
    const color = zone.kind === 'cooling' ? '#62baba' : '#ff7e35';
    surfaces.push(surface(track, zone, color));
    if (zone.kind !== 'cooling')
      surfaces.push(surface(track, zone, '#ff7f27', { flame: true }));
  }
  group.add(...surfaces.map((part) => part.mesh));
  return {
    group,
    update({ time = 0, settings = {} }) {
      surfaces.forEach((part) => part.update(time, settings.reducedMotion));
    },
    dispose() {
      surfaces.forEach((part) => part.dispose());
      group.clear();
    },
  };
}
