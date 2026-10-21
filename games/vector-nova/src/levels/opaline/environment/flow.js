import * as T from 'three';
import { createOpalineSurfaceGeometry } from '../track/geometry.js';
import { sampleOpalineSurge, OPALINE_SURGE_RULES as RULES } from '../surges.js';

const vertex = `attribute vec2 roadCoord;varying vec2 vRoad;void main(){vRoad=roadCoord;gl_Position=projectionMatrix*modelViewMatrix*vec4(position+normal*.07,1.);}`;
/** The moving front and sheltered-lane envelope are shared with the physical force sampler. */
export function createSurgeFlow(track, zone, lifetime) {
  const uniforms = {
    clock: { value: 0 },
    head: { value: zone.start - 85 },
    strength: { value: 0 },
    along: { value: zone.kind === 'along' ? 1 : 0 },
  };
  const material = lifetime.own(
    new T.ShaderMaterial({
      name: 'Opaline / visible spillway force',
      transparent: true,
      depthWrite: false,
      side: T.DoubleSide,
      uniforms,
      vertexShader: vertex,
      fragmentShader: `
      varying vec2 vRoad;uniform float clock,head,strength,along;
      void main(){
        float u=clamp(1.-abs(vRoad.x-head)/${RULES.pulseHalfLength.toFixed(1)},0.,1.);
        float envelope=u*u*(3.-2.*u);
        float exposure=1.-${(1 - RULES.shelteredForce).toFixed(3)}*smoothstep(${RULES.shelterStart.toFixed(1)},${RULES.shelterEnd.toFixed(1)},vRoad.y);
        float wave=strength*envelope*exposure;
        float direction=mix(vRoad.y*.8+clock*6.,vRoad.x*.38-clock*9.,along);
        float ripple=pow(.5+.5*sin(direction+sin(vRoad.x*.08+vRoad.y*.4)),12.);
        vec3 color=mix(vec3(.07,.37,.3),vec3(.62,.95,.76),ripple);
        float alpha=wave*(.28+ripple*.4);
        if(alpha<.003)discard;
        gl_FragColor=vec4(color,alpha);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
    }),
  );
  const geometry = lifetime.own(
    createOpalineSurfaceGeometry(track, {
      start: zone.start,
      end: zone.end,
      step: 4,
    }),
  );
  const sheet = new T.Mesh(geometry, material);
  sheet.name = 'Opaline / current surface ' + zone.id;
  sheet.renderOrder = 3;
  sheet.userData.aoExclude = true;
  const curtains = [];
  if (zone.kind === 'cross') {
    for (const profile of [
      [
        [42, 0.6],
        [22, 0.45],
        [18, 0.1],
        [5, 0.08],
      ],
      [
        [-16, 0.1],
        [-18, -4],
        [-23, -14],
      ],
    ]) {
      const rows = Math.ceil((zone.end - zone.start) / 5),
        cols = profile.length,
        positions = [],
        coords = [],
        indices = [];
      for (let row = 0; row <= rows; row++) {
        const s = zone.start + ((zone.end - zone.start) * row) / rows,
          f = track.sample(s);
        for (let col = 0; col < cols; col++) {
          const [x, y] = profile[col];
          positions.push(
            ...f.position
              .clone()
              .addScaledVector(f.right, x)
              .addScaledVector(f.up, y)
              .toArray(),
          );
          coords.push(s, -8 + col);
          if (row < rows && col < cols - 1) {
            const n = row * cols + col;
            indices.push(n, n + cols, n + 1, n + 1, n + cols, n + cols + 1);
          }
        }
      }
      const g = lifetime.own(new T.BufferGeometry());
      g.setAttribute('position', new T.Float32BufferAttribute(positions, 3));
      g.setAttribute('roadCoord', new T.Float32BufferAttribute(coords, 2));
      g.setIndex(indices);
      g.computeVertexNormals();
      g.computeBoundingSphere();
      const curtain = new T.Mesh(g, material);
      curtain.name = 'Opaline / connected surge spill';
      curtain.renderOrder = 3;
      curtain.userData.aoExclude = true;
      curtains.push(curtain);
    }
  }
  return {
    sheet,
    curtains,
    update(time, reducedMotion) {
      const sample = sampleOpalineSurge(zone, time);
      uniforms.clock.value = reducedMotion ? 0 : time;
      uniforms.head.value = sample.headDistance;
      uniforms.strength.value = sample.strength;
      return sample;
    },
  };
}
export function createVeilMaterial(lifetime) {
  return lifetime.own(
    new T.ShaderMaterial({
      name: 'Opaline / river inside thin mineral wall',
      side: T.DoubleSide,
      transparent: true,
      depthWrite: false,
      uniforms: { clock: { value: 0 }, pressure: { value: 0.2 } },
      vertexShader:
        'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
      fragmentShader: `
      varying vec2 vUv;uniform float clock,pressure;
      float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
      float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);}
      void main(){
        vec2 p=vec2(vUv.x*3.7,vUv.y*11.-clock*.035);
        float cloud=noise(p)+.28*noise(p*2.1+vec2(7.,2.));
        float caustic=pow(1.-abs(sin(p.x*1.3+sin(p.y*.8)+cloud*1.7)),7.);
        vec3 color=mix(vec3(.006,.026,.019),vec3(.085,.23,.145),smoothstep(.24,1.0,cloud));
        // Slow dark fluid clouds sit behind mineral, with pressure collecting
        // near the lower spill source instead of electrifying the whole wall.
        float source=exp(-pow((vUv.x-.19)/.17,2.));
        color+=vec3(.055,.14,.08)*caustic*.055;
        color+=vec3(.055,.19,.105)*pressure*source*(.65+.35*cloud);
        float edge=smoothstep(0.,.06,vUv.x)*smoothstep(0.,.06,1.-vUv.x);
        gl_FragColor=vec4(color,.91*edge);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
    }),
  );
}
