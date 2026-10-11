/** The selected generated ice image supplies colour, fracture and pore detail.
 * Triplanar metre coordinates require no UV unwrap; derivative relief and
 * luminance-driven roughness are artistic proxies, not scanned PBR measurements.
 */
export function finishIceMaterial(
  material,
  texture = null,
  { composite = false } = {},
) {
  if (
    !material.isMeshStandardMaterial ||
    /Titanium|Warm navigation|Deep cavity/.test(material.name)
  )
    return;
  const dark = /buried|meteoric/.test(material.name),
    crust = /frost/.test(material.name);
  const road = /travel bands|fin ice/.test(material.name),
    fresh = /Fresh fracture/.test(material.name);
  const frostRoad = crust && road;
  const textureScale = road ? 0.16 : 0.039;
  material.roughness = crust ? 0.93 : dark ? 0.83 : fresh ? 0.23 : 0.44;
  material.metalness = dark ? 0.025 : 0.01;
  material.onBeforeCompile = (shader) => {
    shader.uniforms.glasswakeIceMap = { value: texture };
    shader.uniforms.hasGlasswakeIceMap = { value: texture ? 1 : 0 };
    shader.vertexShader =
      'varying vec3 vIcePoint; varying vec3 vIceNormal;\n' +
      (composite
        ? 'attribute float iceRoughness; attribute float iceRole; varying float vIceRoughness; varying float vIceRole;\n'
        : '') +
      shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace(
      '#include <begin_vertex>',
      `
      #include <begin_vertex>
      vec4 icePoint=vec4(transformed,1.);vec3 iceNormal=normal;
      #ifdef USE_INSTANCING
        icePoint=instanceMatrix*icePoint;
        iceNormal=transpose(inverse(mat3(instanceMatrix)))*iceNormal;
      #endif
      vIcePoint=icePoint.xyz;vIceNormal=normalize(iceNormal);
      ${composite ? 'vIceRoughness=iceRoughness;vIceRole=iceRole;' : ''}
    `,
    );
    shader.fragmentShader =
      `varying vec3 vIcePoint;varying vec3 vIceNormal;uniform sampler2D glasswakeIceMap;uniform float hasGlasswakeIceMap;
      ${composite ? 'varying float vIceRoughness;varying float vIceRole;' : ''}
      float iceHash(vec3 p){p=fract(p*.1031);p+=dot(p,p.yzx+33.33);return fract((p.x+p.y)*p.z);}
      float iceNoise(vec3 p){vec3 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
      return mix(mix(mix(iceHash(i),iceHash(i+vec3(1,0,0)),f.x),mix(iceHash(i+vec3(0,1,0)),iceHash(i+vec3(1,1,0)),f.x),f.y),mix(mix(iceHash(i+vec3(0,0,1)),iceHash(i+vec3(1,0,1)),f.x),mix(iceHash(i+vec3(0,1,1)),iceHash(i+vec3(1,1,1)),f.x),f.y),f.z);}
      vec3 iceDetail(vec3 p,vec3 n){
        p+=vec3(1.,.37,-.8)*iceNoise(p*.014)*8.;
        vec3 w=pow(abs(normalize(n)),vec3(6.));w/=max(.0001,w.x+w.y+w.z);
        vec3 a=texture2D(glasswakeIceMap,p.yz*${textureScale.toFixed(3)}+vec2(.31,.12)).rgb;
        vec3 b=texture2D(glasswakeIceMap,p.xz*${textureScale.toFixed(3)}+vec2(.17,.44)).rgb;
        vec3 c=texture2D(glasswakeIceMap,p.xy*${textureScale.toFixed(3)}+vec2(.57,.23)).rgb;
        return mix(vec3(.3,.47,.55),a*w.x+b*w.y+c*w.z,hasGlasswakeIceMap);
      }
    ` + shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <color_fragment>',
      `
      #include <color_fragment>
      vec3 p=vIcePoint;vec3 iceTex=iceDetail(p,vIceNormal);
      float iceLuma=dot(iceTex,vec3(.2126,.7152,.0722));
      float drift=iceNoise(p*.033),grain=iceNoise(p*2.7);
      float role=${composite ? 'vIceRole' : dark ? '0.' : crust ? '2.' : fresh ? '3.' : '1.'};
      float darkIce=1.-step(.5,role),frostIce=1.-step(.45,abs(role-2.)),freshIce=step(2.5,role);
      diffuseColor.rgb*=.82+drift*.36;
      vec3 detailed=mix(diffuseColor.rgb,iceTex*(.28+diffuseColor.rgb*.8),${road ? '.23' : '.27'}+freshIce*.06);
      diffuseColor.rgb=mix(detailed,diffuseColor.rgb*(.78+drift*.35),darkIce);
      float cloud=iceNoise(vec3(p.x*.016,p.y*.045,p.z*.016));
      diffuseColor.rgb*=.82+cloud*.36;
      float vein=smoothstep(${frostRoad ? '.33,.57' : '.58,.79'},iceLuma);
      diffuseColor.rgb+=vec3(.045,.065,.073)*vein*(1.-darkIce);
      float deposit=smoothstep(.35,.82,normalize(vIceNormal).y)*(0.55+drift*.45);
      diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.69,.79,.85),deposit*mix(.1,.24,frostIce)*(1.-darkIce*.55));
      diffuseColor.rgb+=vec3(.008,.011,.013)*smoothstep(.74,.91,grain);
      ${
        frostRoad
          ? `
        // Matte granular crust stays opaque and distinct from clear grip panes.
        vec3 frostBody=mix(vec3(.22,.36,.45),vec3(.66,.8,.87),smoothstep(.13,.47,iceLuma));
        diffuseColor.rgb=mix(diffuseColor.rgb,frostBody,.68);
        diffuseColor.rgb+=vec3(.04,.055,.06)*vein;
      `
          : ''
      }
    `,
    );
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <roughnessmap_fragment>',
      `
      #include <roughnessmap_fragment>
      ${composite ? 'roughnessFactor=vIceRoughness;' : ''}
      roughnessFactor=clamp(roughnessFactor+(cloud-.5)*.22+(iceLuma-.35)*.3+(grain-.5)*.065,.18,.96);
    `,
    );
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <normal_fragment_maps>',
      `
      #include <normal_fragment_maps>
      float iceHeight=iceLuma*${frostRoad ? '.085' : '.04'}+vein*.022+grain*.0009;
      vec3 sigmaX=dFdx(-vViewPosition),sigmaY=dFdy(-vViewPosition);
      vec3 r1=cross(sigmaY,normal),r2=cross(normal,sigmaX);float det=dot(sigmaX,r1);
      vec3 grad=sign(det)*(dFdx(iceHeight)*r1+dFdy(iceHeight)*r2);
      normal=normalize(abs(det)*normal-grad*.38);
    `,
    );
  };
  material.customProgramCacheKey = () =>
    `glasswake-ice-detail-v6:${composite}:${dark}:${crust}:${road}:${fresh}:${Boolean(texture)}`;
}

/** Visible cloudy ice and sparse trapped air on clear panes. The bitmap is
 * sampled in linear colour, so masks use its measured luminance range. Clear
 * areas retain the real ribs/canyon; only local veins/bubbles approach .82 alpha.
 */
export function finishCrystalPane(material, texture) {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.paneIceMap = { value: texture };
    shader.vertexShader =
      'varying vec3 panePoint; varying vec3 paneAxis;\n' + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace(
      '#include <begin_vertex>',
      `
      #include <begin_vertex>
      vec4 pp=vec4(transformed,1.);vec3 pn=normal;
      #ifdef USE_INSTANCING
        pp=instanceMatrix*pp;pn=transpose(inverse(mat3(instanceMatrix)))*pn;
      #endif
      panePoint=(modelMatrix*pp).xyz;paneAxis=normalize(mat3(modelMatrix)*pn);
    `,
    );
    shader.fragmentShader =
      `varying vec3 panePoint;varying vec3 paneAxis;uniform sampler2D paneIceMap;
      float paneHash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
      float paneBubbles(vec2 p){
        vec2 cell=floor(p*1.3),f=fract(p*1.3);float seed=paneHash(cell);
        vec2 center=.22+.56*vec2(paneHash(cell+17.),paneHash(cell-23.));
        float r=.05+seed*.065;
        float ring=1.-smoothstep(.009,.027,abs(length(f-center)-r));
        float small=1.-smoothstep(.014,.034,length(f-center-vec2(.16,-.1)));
        return step(.78,seed)*max(ring,small*.7);
      }
    ` + shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <color_fragment>',
      `
      #include <color_fragment>
      vec3 pw=pow(abs(normalize(paneAxis)),vec3(8.));pw/=max(.0001,pw.x+pw.y+pw.z);
      vec3 pt=texture2D(paneIceMap,panePoint.yz*.13).rgb*pw.x+texture2D(paneIceMap,panePoint.xz*.13).rgb*pw.y+texture2D(paneIceMap,panePoint.xy*.13).rgb*pw.z;
      float luma=dot(pt,vec3(.2126,.7152,.0722));
      float paneCloud=smoothstep(.17,.43,luma);
      float paneVein=smoothstep(.33,.57,luma);
      float paneAir=paneBubbles(panePoint.yz)*pw.x+paneBubbles(panePoint.xz)*pw.y+paneBubbles(panePoint.xy)*pw.z;
      float veil=.035+paneCloud*.12+paneVein*.11+paneAir*.24;
      vec3 eye=normalize(cameraPosition-panePoint);
      float grazing=pow(1.-clamp(abs(dot(normalize(paneAxis),eye)),0.,1.),3.);
      // Subsurface clouds remain visible while the exposed face gains a
      // shallow frozen relief. Grain is independent of the metre-scale veins.
      vec3 fineIce=texture2D(paneIceMap,panePoint.yz*1.8).rgb*pw.x
        +texture2D(paneIceMap,panePoint.xz*1.8).rgb*pw.y
        +texture2D(paneIceMap,panePoint.xy*1.8).rgb*pw.z;
      float iceGrain=dot(fineIce,vec3(.2126,.7152,.0722));
      diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.76,.9,.95),min(.6,veil));
      diffuseColor.a=min(.82,diffuseColor.a+.015+paneCloud*.10+paneVein*.065+paneAir*.075+grazing*.20);
    `,
    );
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <roughnessmap_fragment>',
      `
      #include <roughnessmap_fragment>
      roughnessFactor=clamp(roughnessFactor+paneCloud*.14+paneVein*.17+paneAir*.08+(iceGrain-.35)*.06,.19,.68);
    `,
    );
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <normal_fragment_maps>',
      `#include <normal_fragment_maps>
      float paneRelief = luma*.018 + paneVein*.008 + iceGrain*.002;
      vec3 dx=dFdx(-vViewPosition),dy=dFdy(-vViewPosition);
      vec3 rx=cross(dy,normal),ry=cross(normal,dx);
      float det=dot(dx,rx)*faceDirection;
      normal=normalize(abs(det)*normal-sign(det)*(dFdx(paneRelief)*rx+dFdy(paneRelief)*ry));`,
    );
  };
  material.customProgramCacheKey = () => 'glasswake-clear-pane-relief-v3';
}
