import * as T from 'three';
import { assetURL } from '../../../assets/url.js';
/** Sky/cloud image only. Every mountain and all industrial silhouettes are geometry. */
export async function createShatterlineBackdrop({shape=false,loadTexture=(url)=>new T.TextureLoader().loadAsync(url)}={}) {
  const texture=shape?new T.DataTexture(new Uint8Array([154,175,194,255]),1,1):await loadTexture(assetURL('assets/levels/shatterline/shatterline-sky-v1.png'));
  texture.colorSpace=T.SRGBColorSpace;texture.wrapS=T.RepeatWrapping;texture.wrapT=T.ClampToEdgeWrapping;texture.anisotropy=4;texture.needsUpdate=true;
  const group=new T.Group();group.name='Shatterline / pale mountain altitude sky';group.userData.aoExclude=true;
  const material=new T.ShaderMaterial({name:'Shatterline / sky-only panorama radiance',side:T.BackSide,depthWrite:false,uniforms:{panorama:{value:texture},shape:{value:shape?1:0}},vertexShader:'varying vec3 ray;void main(){ray=position;vec4 p=projectionMatrix*modelViewMatrix*vec4(position,1.);gl_Position=p.xyww;}',fragmentShader:`varying vec3 ray;uniform sampler2D panorama;uniform float shape;const float PI=3.141592653589793;
  void main(){vec3 d=normalize(ray);float u=fract(atan(d.z,d.x)/(2.*PI)+.18),v=asin(clamp(d.y,-1.,1.))/PI+.5;float overlap=.045;float pu=u*(1.-overlap);
  vec3 dx=dFdx(d),dy=dFdy(d);float ls=(1.-overlap)/(2.*PI*max(dot(d.xz,d.xz),.000001)),vs=1./(PI*sqrt(max(1.-d.y*d.y,.000001)));vec2 ux=vec2((d.x*dx.z-d.z*dx.x)*ls,dx.y*vs),uy=vec2((d.x*dy.z-d.z*dy.x)*ls,dy.y*vs);
  vec3 radiance=textureGrad(panorama,vec2(pu,v),ux,uy).rgb;if(pu<overlap)radiance=mix(textureGrad(panorama,vec2(pu+1.-overlap,v),ux,uy).rgb,radiance,smoothstep(0.,overlap,pu));
  float pv=d.y>0.?.99:.01;vec3 pole=(textureLod(panorama,vec2(.125,pv),3.).rgb+textureLod(panorama,vec2(.375,pv),3.).rgb+textureLod(panorama,vec2(.625,pv),3.).rgb+textureLod(panorama,vec2(.875,pv),3.).rgb)*.25;radiance=mix(radiance,pole,smoothstep(.96,.998,abs(d.y)));
  vec3 sun=normalize(vec3(-.62,.33,.71));float glow=pow(max(dot(d,sun),0.),95.);radiance+=vec3(.29,.22,.12)*glow;float disk=smoothstep(.99965,.99985,dot(d,sun));radiance+=vec3(1.3,1.1,.75)*disk;
  radiance=mix(radiance,vec3(.37,.45,.53),shape);gl_FragColor=vec4(radiance,1.);\n#include <tonemapping_fragment>\n#include <colorspace_fragment>\n}`});
  const geometry=new T.SphereGeometry(20000,48,32),sky=new T.Mesh(geometry,material);sky.frustumCulled=false;sky.renderOrder=-1000;group.add(sky);let disposed=false;
  return {group,ownedTextures:[texture],sunDirection:new T.Vector3(-.62,.33,.71).normalize(),sunColor:'#ffe2ac',sunIntensity:3.1,ambientSky:'#b4c8de',ambientGround:'#81745f',ambientIntensity:.54,fillColor:'#a5c6ed',fillIntensity:.24,environmentIntensity:.52,far:24000,
    update({camera}={}){if(camera)group.position.copy(camera.position);},
    dispose(){if(disposed)return;disposed=true;texture.dispose();geometry.dispose();material.dispose();group.clear();}
  };
}
