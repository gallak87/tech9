import * as T from 'three';

// Small procedural energy surfaces; no texture fetches or scene-wide wash.
export function energyMaterial(style) {
  return new T.ShaderMaterial({
    name: 'Device energy / ' + style,
    transparent: true,
    depthWrite: false,
    side: T.DoubleSide,
    blending: T.AdditiveBlending,
    toneMapped: false,
    uniforms: {
      color: { value: new T.Color() },
      age: { value: 0 },
      time: { value: 0 },
      strength: { value: 1 },
      motion: { value: 1 },
    },
    vertexShader: `varying vec2 vUv; void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
    fragmentShader: `
      varying vec2 vUv;
      uniform vec3 color;
      uniform float age, time, strength, motion;
      void main() {
        vec2 p=vUv*2.-1.;
        float radius=length(p), angle=atan(p.y,p.x), light=0., core=0.;
        ${
          style === 'repulsor'
            ? `
          float target=mix(.9,.72,clamp(age,0.,1.));
          float lobes=.5+.5*pow(.5+.5*cos(angle*3.+time*3.*motion),3.);
          float ring=exp(-pow((radius-target)/.05,2.));
          float body=exp(-pow((radius-target+.09)/.13,2.));
          light=(ring*.8+body*.38)*lobes;
          light+=exp(-pow((radius-target-.09)/.014,2.))*.35;
          core=ring*lobes*.32;
        `
            : style === 'repulsor-shell'
              ? `
          float height=vUv.y;
          float lobes=.48+.52*pow(.5+.5*cos(vUv.x*18.84956+time*3.*motion),3.);
          float lower=exp(-pow((height-.2)/.085,2.));
          float upper=exp(-pow((height-.73)/.065,2.));
          float body=sin(height*3.14159)*.1;
          light=(lower*.65+upper*.3+body)*lobes;
          core=(lower+upper*.4)*lobes*.22;
        `
              : style === 'arc'
                ? `
          float rail=abs(abs(p.x)-.55-sin(p.y*30.+time*25.*motion)*.012);
          float along=smoothstep(-.92,-.65,p.y)*(1.-smoothstep(.6,.95,p.y));
          light=(exp(-rail*100.)+exp(-rail*22.)*.2)*along;
          float cells=pow(.5+.5*cos(p.y*15.),20.);
          light+=exp(-rail*35.)*cells*.65;
          core=exp(-rail*190.)*along*.35;
        `
                : style === 'ion'
                  ? `
          float t=(p.y+1.)*.5;
          float x=p.x-.022*sin(p.y*8.+time*3.*motion);
          float rail=min(abs(x),abs(abs(x)-.4286));
          float tail=smoothstep(0.,.25,t)*(1.-smoothstep(.72,1.,t));
          light=(exp(-rail*30.)*1.1+exp(-rail*8.)*.3)*tail;
          core=exp(-rail*90.)*tail*.45;
        `
                  : style === 'bolt'
                    ? `
          float along=smoothstep(0.,.16,vUv.y)*(1.-smoothstep(.78,1.,vUv.y));
          float jag=sin(p.y*21.+time*39.*motion)*sin(p.y*8.-time*13.*motion)*.045;
          float width=.16+.14*(1.-vUv.y);
          float x=abs(p.x-jag);
          core=exp(-pow(x/width,2.)*6.)*along;
          light=(exp(-pow(x/width,2.)*1.1)*1.25+exp(-x*3.5)*.32)*along;
          float branch=abs(p.x-jag-.24*sin(p.y*11.+time*20.*motion));
          light+=exp(-branch*70.)*along*.38;
        `
                    : style === 'crown'
                      ? `
          float height=vUv.y;
          float front=exp(-pow((height-.18)/.075,2.));
          float roll=exp(-pow((height-.36)/.2,2.));
          float edge=exp(-pow((height-.68)/.035,2.));
          light=front*.85+roll*.28+edge*.17;
          core=front*.24;
        `
                      : style === 'pressure'
                        ? `
          float front=exp(-pow((radius-.87)/.026,2.));
          float body=exp(-pow((radius-.79)/.085,2.));
          float echo=exp(-pow((radius-.6)/.022,2.));
          light=front*.8+body*.35+echo*.2;
          core=front*.28;
        `
                        : `
          float arms=pow(abs(cos(angle*4.+.3)),22.);
          float shards=arms*exp(-radius*3.8)*smoothstep(.03,.12,radius);
          core=exp(-radius*radius*170.);
          light=core+shards*1.5+exp(-radius*radius*16.)*.13;
          float edge=1.-smoothstep(.65,.98,radius);
          light*=edge;core*=edge;
        `
        }
        float alpha=(light+core)*strength;
        if(alpha<.002)discard;
        gl_FragColor=vec4(mix(color*1.7,vec3(2.4),min(.85,core)),min(.95,alpha));
      }`,
  });
}

export function energyPlane(style, width, length) {
  const geometry = new T.PlaneGeometry(width, length);
  geometry.rotateX(-Math.PI / 2);
  const mesh = new T.Mesh(geometry, energyMaterial(style));
  mesh.userData.aoExclude = mesh.userData.reflectionExclude = true;
  return mesh;
}

export function energyCylinder(style) {
  const geometry = new T.CylinderGeometry(1, 1, 1, 64, 1, true);
  geometry.translate(0, 0.5, 0);
  const mesh = new T.Mesh(geometry, energyMaterial(style));
  mesh.userData.aoExclude = mesh.userData.reflectionExclude = true;
  return mesh;
}
