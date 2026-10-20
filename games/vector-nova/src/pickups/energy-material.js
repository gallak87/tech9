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
          float target=mix(.92,.32,age);
          float arcs=pow(.5+.5*cos(angle*3.+time*8.*motion),5.);
          float line=exp(-pow((radius-target)/.028,2.));
          light=(line+exp(-pow((radius-target)/.095,2.))*.2)*(.25+.75*arcs);
          light+=exp(-pow((radius-target-.13)/.015,2.))*.22;
          core=line*arcs*.25;
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
          float x=p.x-.012*sin(p.y*12.+time*4.*motion);
          float rail=min(abs(x),abs(abs(x)-.4286));
          float tail=smoothstep(0.,.25,t)*(1.-smoothstep(.72,1.,t));
          light=(exp(-rail*62.)+exp(-rail*13.)*.22)*tail;
          core=exp(-rail*120.)*tail*.2;
        `
                : style === 'bolt'
                  ? `
          float along=smoothstep(0.,.16,vUv.y)*(1.-smoothstep(.78,1.,vUv.y));
          float jag=sin(p.y*21.+time*39.*motion)*sin(p.y*8.-time*13.*motion)*.045;
          float width=.075+.1*(1.-vUv.y);
          float x=abs(p.x-jag);
          core=exp(-pow(x/width,2.)*9.)*along;
          light=(exp(-pow(x/width,2.)*1.4)+exp(-x*4.)*.2)*along;
          float branch=abs(p.x-jag-.15*sin(p.y*11.+time*20.*motion));
          light+=exp(-branch*95.)*along*.23;
        `
                  : style === 'crown'
                    ? `
          float height=vUv.y;
          float fingers=pow(.5+.5*sin(vUv.x*94.+sin(vUv.x*31.)*2.),8.);
          float front=exp(-pow((height-.1)/.024,2.));
          light=front*.8+exp(-height*12.)*.08+fingers*pow(1.-height,6.)*.1;
          core=front*.22;
        `
                    : style === 'pressure'
                      ? `
          float arms=pow(max(0.,cos(angle*13.+sin(angle*5.))),40.);
          light=arms*exp(-pow((radius-.72)/.21,2.));
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
