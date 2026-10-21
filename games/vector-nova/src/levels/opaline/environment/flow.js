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
        [16, 0.08],
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
          coords.push(s, x);
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
      name: 'Opaline / deep pressurised emerald mineral',
      side: T.DoubleSide,
      uniforms: { clock: { value: 0 }, pressure: { value: 0.2 } },
      vertexShader: `
        varying vec2 vUv;varying vec3 vWorld,vNormal;
        void main(){
          vUv=uv;vec4 world=modelMatrix*vec4(position,1.);
          vWorld=world.xyz;vNormal=normalize(mat3(modelMatrix)*normal);
          gl_Position=projectionMatrix*viewMatrix*world;
        }`,
      fragmentShader: `
      varying vec2 vUv;varying vec3 vWorld,vNormal;
      uniform float clock,pressure;
      float hash(vec3 p){p=fract(p*.1031);p+=dot(p,p.yzx+33.33);return fract((p.x+p.y)*p.z);}
      float noise(vec3 p){
        vec3 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
        return mix(mix(mix(hash(i),hash(i+vec3(1,0,0)),f.x),mix(hash(i+vec3(0,1,0)),hash(i+vec3(1,1,0)),f.x),f.y),
          mix(mix(hash(i+vec3(0,0,1)),hash(i+vec3(1,0,1)),f.x),mix(hash(i+vec3(0,1,1)),hash(i+vec3(1,1,1)),f.x),f.y),f.z);
      }
      void main(){
        vec3 eye=normalize(cameraPosition-vWorld);
        vec3 n=normalize(vNormal)*(gl_FrontFacing?1.:-1.);
        float ripple=sin(vWorld.y*.31+vWorld.x*.017-clock*.3)*sin(vWorld.z*.055+vWorld.y*.09);
        n=normalize(n+vec3(dFdx(ripple),dFdy(ripple),0.)*.12);
        vec3 ray=refract(-eye,n,1./1.38);
        // Finite optical depth, sampled in world metres. Changing viewpoint
        // moves the inclusions relative to the surface instead of scrolling a flat picture.
        vec3 transmittance=vec3(1.),scatter=vec3(0.);
        for(int i=0;i<6;i++){
          float depth=(float(i)+.5)*4.;
          vec3 q=(vWorld+ray*depth)*.047+vec3(0.,-clock*.014,0.);
          float cloud=noise(q)+noise(q*2.13+9.)*.3;
          float fold=sin(q.y*2.7+sin(q.x*1.3)+cloud*2.6);
          float inclusion=smoothstep(.22,.72,cloud)*(.52+.48*smoothstep(-.3,.6,fold));
          vec3 extinction=vec3(.15,.036,.082)*(1.1+inclusion*1.8);
          vec3 absorbed=1.-exp(-extinction*4.);
          vec3 lit=mix(vec3(.006,.048,.026),vec3(.12,.42,.21),inclusion);
          float shaft=pow(max(0.,1.-abs(fold)),9.);
          lit+=vec3(.065,.19,.075)*shaft*(.2+pressure*.4);
          scatter+=transmittance*absorbed*lit;
          transmittance*=1.-absorbed;
        }
        vec3 color=scatter+transmittance*vec3(.008,.06,.035);
        float fresnel=.035+.965*pow(1.-max(dot(eye,n),0.),5.);
        vec3 reflection=reflect(-eye,n);
        vec3 sky=mix(vec3(.11,.19,.23),vec3(.45,.55,.62),smoothstep(-.2,.8,reflection.y));
        float glint=pow(max(dot(reflection,normalize(vec3(.8,.5,.31))),0.),180.);
        color=mix(color,sky,fresnel*.63)+vec3(.9,.78,.57)*glint*.33;
        // Pressure collects at the low spill source; it never flattens the whole volume.
        color+=vec3(.025,.09,.045)*pressure*exp(-pow((vUv.x-.19)/.15,2.));
        gl_FragColor=vec4(color,1.);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
    }),
  );
}
