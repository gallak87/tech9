/** The selected generated ice image supplies colour, fracture and pore detail.
 * Triplanar metre coordinates require no UV unwrap; derivative relief and
 * luminance-driven roughness are artistic proxies, not scanned PBR measurements.
 */
export function finishIceMaterial(material, texture = null) {
  if (
    !material.isMeshStandardMaterial ||
    /Titanium|Warm navigation|Deep cavity/.test(material.name)
  )
    return;
  const dark = /buried|meteoric/.test(material.name),
    crust = /frost/.test(material.name);
  const road = /travel bands|fin ice/.test(material.name),
    fresh = /Fresh fracture/.test(material.name);
  const textureScale = road ? 0.16 : dark ? 0.043 : 0.026;
  material.roughness = crust ? 0.93 : dark ? 0.83 : fresh ? 0.23 : 0.44;
  material.metalness = dark ? 0.025 : 0.01;
  material.onBeforeCompile = (shader) => {
    shader.uniforms.glasswakeIceMap = { value: texture };
    shader.uniforms.hasGlasswakeIceMap = { value: texture ? 1 : 0 };
    shader.vertexShader =
      'varying vec3 vIcePoint; varying vec3 vIceNormal;\n' +
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
    `,
    );
    shader.fragmentShader =
      `varying vec3 vIcePoint;varying vec3 vIceNormal;uniform sampler2D glasswakeIceMap;uniform float hasGlasswakeIceMap;
      float iceHash(vec3 p){p=fract(p*.1031);p+=dot(p,p.yzx+33.33);return fract((p.x+p.y)*p.z);}
      float iceNoise(vec3 p){vec3 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
      return mix(mix(mix(iceHash(i),iceHash(i+vec3(1,0,0)),f.x),mix(iceHash(i+vec3(0,1,0)),iceHash(i+vec3(1,1,0)),f.x),f.y),mix(mix(iceHash(i+vec3(0,0,1)),iceHash(i+vec3(1,0,1)),f.x),mix(iceHash(i+vec3(0,1,1)),iceHash(i+vec3(1,1,1)),f.x),f.y),f.z);}
      vec3 iceDetail(vec3 p,vec3 n){
        p+=vec3(iceNoise(p*.012),iceNoise(p*.017+21.),iceNoise(p*.015-13.))*8.;
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
      diffuseColor.rgb*=.87+drift*.25;
      ${dark ? 'diffuseColor.rgb*=.65+drift*.55+grain*.06;' : crust ? 'diffuseColor.rgb*=.87+grain*.12;' : `diffuseColor.rgb=mix(diffuseColor.rgb,iceTex*(.45+diffuseColor.rgb*.48),${road ? '.23' : '.15'});`}
      float cloud=iceNoise(vec3(p.x*.016,p.y*.045,p.z*.016));
      diffuseColor.rgb*=.84+cloud*.32;
      float deposit=smoothstep(.35,.82,normalize(vIceNormal).y)*(0.55+drift*.45);
      diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.69,.79,.85),deposit*${dark ? '.06' : crust ? '.18' : '.09'});
      diffuseColor.rgb+=vec3(.007,.009,.011)*smoothstep(.74,.91,grain);
    `,
    );
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <roughnessmap_fragment>',
      `
      #include <roughnessmap_fragment>
      roughnessFactor=clamp(roughnessFactor+(iceLuma-.3)*.18+(grain-.5)*.045,.26,.94);
    `,
    );
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <normal_fragment_maps>',
      `
      #include <normal_fragment_maps>
      float iceHeight=iceNoise(p*.29)*.08+iceNoise(p*2.7)*.003+iceLuma*.018;
      vec3 sigmaX=dFdx(-vViewPosition),sigmaY=dFdy(-vViewPosition);
      vec3 r1=cross(sigmaY,normal),r2=cross(normal,sigmaX);float det=dot(sigmaX,r1);
      vec3 grad=sign(det)*(dFdx(iceHeight)*r1+dFdy(iceHeight)*r2);
      normal=normalize(abs(det)*normal-grad*.28);
    `,
    );
  };
  material.customProgramCacheKey = () =>
    `glasswake-ice-detail-v4:${dark}:${crust}:${road}:${fresh}:${Boolean(texture)}`;
}

/** A light frost/vein veil on clear panes. Keep the transparent view into real
 * ribs and canyon; opaque detail adds at most five percentage points locally.
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
      'varying vec3 panePoint;varying vec3 paneAxis;uniform sampler2D paneIceMap;\n' +
      shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <color_fragment>',
      `
      #include <color_fragment>
      vec3 pw=pow(abs(normalize(paneAxis)),vec3(8.));pw/=max(.0001,pw.x+pw.y+pw.z);
      vec3 pt=texture2D(paneIceMap,panePoint.yz*.13).rgb*pw.x+texture2D(paneIceMap,panePoint.xz*.13).rgb*pw.y+texture2D(paneIceMap,panePoint.xy*.13).rgb*pw.z;
      float vein=smoothstep(.47,.74,dot(pt,vec3(.2126,.7152,.0722)));
      diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.75,.88,.94),.025+vein*.055);
      diffuseColor.a=min(.76,diffuseColor.a+.012+vein*.038);
    `,
    );
  };
  material.customProgramCacheKey = () => 'glasswake-clear-pane-veil-v1';
}
