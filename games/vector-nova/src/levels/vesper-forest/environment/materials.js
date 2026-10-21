/** Secondary geometry borrows the primary library's single PBR material set. */
export function shareForestMaterials(library, forest) {
  const shared = new Map();
  library.traverse((o) => {
    for (const m of [o.material].flat()) if (m?.name) shared.set(m.name, m);
  });
  const retired = new Set();
  forest.traverse((o) => {
    if (!o.isMesh) return;
    const replace = (m) => {
      const source = shared.get(m.name);
      if (!source || source === m) return m;
      retired.add(m);
      return source;
    };
    o.material = Array.isArray(o.material)
      ? o.material.map(replace)
      : replace(o.material);
  });
  // The secondary export intentionally has no images; shared textures remain
  // owned by the combined environment until its deduplicated disposal.
  for (const material of retired) material.dispose();
}

/** Baked surface maps retain UV growth direction and eliminate per-pixel noise stacks. */
function finishBakedForestMaterial(material, leaf) {
  material.userData.vesperSurfaceDetail = true;
  material.roughness = leaf
    ? 0.7
    : material.userData.worldkitWood === 'cambium'
      ? 0.82
      : 0.94;
  material.envMapIntensity = leaf ? 0.42 : 0.46;
  if (
    !material.userData.worldkitWood &&
    /ridged indigo bark/.test(material.name)
  )
    material.color.setRGB(0.8, 0.86, 0.82);
  if (/fungal moon/.test(material.name)) material.color.setRGB(0.42, 0.6, 0.47);
  if (/fungal pore/.test(material.name)) material.color.setRGB(0.7, 0.8, 0.67);
  for (const map of [material.map, material.normalMap, material.roughnessMap])
    if (map) map.anisotropy = 8;
  material.onBeforeCompile = (shader) => {
    if (!material.userData.vesperSurfaceDetail) {
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <normal_fragment_maps>', '')
        .replace('#include <roughnessmap_fragment>', '');
      return;
    }
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        '#include <common>\nvarying vec3 vForestLocal;',
      )
      .replace(
        '#include <begin_vertex>',
        '#include <begin_vertex>\nvForestLocal=position;',
      );
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <common>',
      '#include <common>\nvarying vec3 vForestLocal;',
    );
    if (leaf)
      shader.fragmentShader = shader.fragmentShader
        .replace(
          '#include <roughnessmap_fragment>',
          '#include <roughnessmap_fragment>\nroughnessFactor=clamp(roughnessFactor,.42,.82);',
        )
        .replace(
          '#include <lights_fragment_end>',
          `#include <lights_fragment_end>
      // The waxy cuticle keeps a soft glint rather than a silver mirror lobe.
      reflectedLight.directSpecular*=.9;
      reflectedLight.indirectSpecular*=.8;
      #if NUM_DIR_LIGHTS > 0
        float transmittedMoon=pow(max(dot(-normal,directionalLights[0].direction),0.),1.5);
        reflectedLight.indirectDiffuse+=diffuseColor.rgb*directionalLights[0].color*transmittedMoon*.19;
      #endif
    `,
        );
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <map_fragment>',
      `#include <map_fragment>
      float growth=.5+.5*sin(vForestLocal.y*.027+sin(vForestLocal.x*.035)*1.8+cos(vForestLocal.z*.041));
      diffuseColor.rgb*=mix(.82,1.12,growth);
      ${
        leaf
          ? `diffuseColor.rgb*=gl_FrontFacing?vec3(1.15,1.45,1.25):vec3(1.3,1.65,1.4);
      float leafLuma=dot(diffuseColor.rgb,vec3(.2126,.7152,.0722));
      diffuseColor.rgb=mix(diffuseColor.rgb,leafLuma*vec3(.9,1.05,.97),.18);`
          : ''
      }`,
    );
    if (material.userData.vesperBarkProjection) {
      // The enormous branch collars span several UV charts. Blend the same
      // reusable color map in object space so their junctions retain density.
      shader.vertexShader = shader.vertexShader
        .replace(
          '#include <common>',
          '#include <common>\nvarying vec3 vForestLocalNormal;',
        )
        .replace(
          '#include <begin_vertex>',
          '#include <begin_vertex>\nvForestLocalNormal=normal;',
        );
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <common>',
        '#include <common>\nvarying vec3 vForestLocalNormal;',
      );
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <map_fragment>',
        `
        vec3 barkWeights=pow(abs(normalize(vForestLocalNormal)),vec3(4.));
        barkWeights/=max(dot(barkWeights,vec3(1.)),.0001);
        vec3 barkProjection=texture2D(map,vForestLocal.zy/vec2(56.,72.)).rgb*barkWeights.x
          +texture2D(map,vForestLocal.xz/vec2(56.,72.)).rgb*barkWeights.y
          +texture2D(map,vForestLocal.xy/vec2(56.,72.)).rgb*barkWeights.z;
        diffuseColor.rgb*=barkProjection;
      `,
      );
    }
  };
  material.customProgramCacheKey = () =>
    `vesper-worldkit-forest-v1-${leaf}-${material.userData.vesperBarkProjection ?? false}-${material.userData.vesperSurfaceDetail}`;
}

/** Metre-scaled scan projection keeps the hero and generated branches consistent.
 * Blend in world space: the original GLB contains unrelated UV charts and scales.
 */
function finishWorldkitWood(material) {
  material.userData.vesperSurfaceDetail = true;
  const kind = material.userData.worldkitWood;
  material.roughness = kind === 'cambium' ? 0.78 : 0.94;
  material.envMapIntensity = 0.5;
  const macroMap = material.woodMacroMap;
  material.onBeforeCompile = (shader) => {
    if (macroMap) shader.uniforms.woodMacroMap = { value: macroMap };
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        '#include <common>\nvarying vec3 vWorldkitPoint, vWorldkitNormal;',
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        vec4 woodPoint=vec4(transformed,1.);
        vec3 woodNormal=normal;
        #ifdef USE_INSTANCING
          woodPoint=instanceMatrix*woodPoint;
          woodNormal=mat3(instanceMatrix)*woodNormal;
        #endif
        vWorldkitPoint=(modelMatrix*woodPoint).xyz;
        vWorldkitNormal=normalize(mat3(modelMatrix)*woodNormal);`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>\nvarying vec3 vWorldkitPoint, vWorldkitNormal;${macroMap ? '\nuniform sampler2D woodMacroMap;' : ''}`,
      )
      .replace(
        '#include <map_fragment>',
        `
        vec3 woodWeights=pow(abs(normalize(vWorldkitNormal)),vec3(4.));
        woodWeights/=max(dot(woodWeights,vec3(1.)),.0001);
        vec3 woodP=vWorldkitPoint/vec3(18.,24.,18.);
        // Separate slow colour variation from photographic surface grain.
        float woodMacro=.5+.5*sin(vWorldkitPoint.x*.021+sin(vWorldkitPoint.y*.017)*1.7+vWorldkitPoint.z*.013);
        vec3 scan=texture2D(map,woodP.zy).rgb*woodWeights.x
          +texture2D(map,woodP.xz).rgb*woodWeights.y
          +texture2D(map,woodP.xy).rgb*woodWeights.z;
        ${
          macroMap
            ? `vec3 coarseP=vWorldkitPoint/vec3(44.,60.,44.);
        vec3 coarse=texture2D(woodMacroMap,coarseP.zy).rgb*woodWeights.x
          +texture2D(woodMacroMap,coarseP.xz).rgb*woodWeights.y
          +texture2D(woodMacroMap,coarseP.xy).rgb*woodWeights.z;
        scan=mix(scan,coarse,${kind === 'bark' ? '.65' : '.48'});`
            : ''
        }
        ${
          kind === 'bark'
            ? 'diffuseColor.rgb*=mix(vec3(.27),scan,.8)*mix(.8,1.14,woodMacro);'
            : 'float woodValue=dot(scan,vec3(.2126,.7152,.0722)); diffuseColor.rgb*=mix(vec3(woodValue),scan,.22)*2.15*mix(.82,1.16,woodMacro);'
        }
      `,
      )
      .replace(
        '#include <roughnessmap_fragment>',
        material.userData.vesperSurfaceDetail
          ? `
        float roughnessFactor=roughness;
        float scanRoughness=texture2D(roughnessMap,woodP.zy).g*woodWeights.x
          +texture2D(roughnessMap,woodP.xz).g*woodWeights.y
          +texture2D(roughnessMap,woodP.xy).g*woodWeights.z;
        roughnessFactor=clamp(roughnessFactor*scanRoughness,.65,.97);
      `
          : 'float roughnessFactor=roughness;',
      )
      .replace(
        '#include <normal_fragment_maps>',
        material.userData.vesperSurfaceDetail
          ? `
        vec2 woodNX=texture2D(normalMap,woodP.zy).xy*2.-1.;
        vec2 woodNY=texture2D(normalMap,woodP.xz).xy*2.-1.;
        vec2 woodNZ=texture2D(normalMap,woodP.xy).xy*2.-1.;
        vec3 woodDetail=vec3(0.,woodNX.y,woodNX.x)*woodWeights.x
          +vec3(woodNY.x,0.,woodNY.y)*woodWeights.y
          +vec3(woodNZ.x,woodNZ.y,0.)*woodWeights.z;
        normal=normalize(normal+mat3(viewMatrix)*woodDetail*normalScale.x*faceDirection);
      `
          : '',
      );
  };
  material.customProgramCacheKey = () =>
    `worldkit-metric-wood-v2-${kind}-${!!macroMap}-${material.userData.vesperSurfaceDetail}`;
}

/** Original 3D material grain. Local-position noise survives instancing and cell batching. */
export function finishVesperMaterial(material) {
  if (material.userData.worldkitWood) {
    finishWorldkitWood(material);
    return;
  }
  const name = material.name.toLowerCase();
  const bark = /bark|cambium|structural living root|exposed ivory sapwood/.test(
    name,
  );
  const leaf = /blue teal leaves/.test(name);
  const fungus = /fungal moon|fungal pore/.test(name);
  const flower = /flower .*tissue|flower plum backs/.test(name);
  const walker = /walker/.test(name);
  if (!bark && !leaf && !fungus && !flower && !walker) return;
  if (
    (bark || leaf || fungus || flower || /fungal pore/.test(name)) &&
    material.normalMap
  ) {
    finishBakedForestMaterial(material, leaf);
    return;
  }
  material.userData.vesperSurfaceDetail = true;
  material.roughness = bark ? 0.9 : leaf ? 0.58 : walker ? 0.76 : 0.88;
  material.envMapIntensity = bark ? 0.18 : leaf ? 0.36 : 0.22;
  material.onBeforeCompile = (shader) => {
    if (!material.userData.vesperSurfaceDetail) return;
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        '#include <common>\nvarying vec3 vVesperSurface;',
      )
      .replace(
        '#include <begin_vertex>',
        '#include <begin_vertex>\nvVesperSurface = position;',
      );
    if (leaf) {
      shader.vertexShader = shader.vertexShader
        .replace(
          '#include <common>',
          '#include <common>\nvarying vec2 vVesperLeafUv;',
        )
        .replace(
          '#include <begin_vertex>',
          '#include <begin_vertex>\nvVesperLeafUv = uv;',
        );
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <common>',
        '#include <common>\nvarying vec2 vVesperLeafUv;',
      );
    }
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <common>',
      `#include <common>
      varying vec3 vVesperSurface;
      float vesperHash(vec3 p) { p=fract(p*.1031);p+=dot(p,p.yzx+33.33);return fract((p.x+p.y)*p.z); }
      float vesperNoise(vec3 p) {
        vec3 i=floor(p),f=fract(p); f=f*f*(3.-2.*f);
        return mix(mix(mix(vesperHash(i),vesperHash(i+vec3(1,0,0)),f.x),mix(vesperHash(i+vec3(0,1,0)),vesperHash(i+vec3(1,1,0)),f.x),f.y),mix(mix(vesperHash(i+vec3(0,0,1)),vesperHash(i+vec3(1,0,1)),f.x),mix(vesperHash(i+vec3(0,1,1)),vesperHash(i+vec3(1,1,1)),f.x),f.y),f.z);
      }`,
    );
    const treatment = bark
      ? `vec3 vp=vVesperSurface;
         float broad=vesperNoise(vp*vec3(.07,.053,.07));
         float fibre=vesperNoise(vp*vec3(.22,.14,.22)+broad*.9);
         float fine=vesperNoise(vp*vec3(.8,.5,.8));
         float crack=smoothstep(.26,.55,fibre*.72+fine*.28);
         diffuseColor.rgb*=mix(.76,1.25,crack)*mix(.87,1.12,broad);
         diffuseColor.rgb=mix(diffuseColor.rgb,diffuseColor.rgb*vec3(.74,1.18,.83),smoothstep(.61,.8,broad)*.48);
         float vesperHeight=(fibre*.7+fine*.3)*.075;
         #ifdef USE_MAP
           vesperHeight+=dot(sampledDiffuseColor.rgb,vec3(.21,.72,.07))*.09;
         #endif`
      : leaf
        ? `float leafT=clamp(vVesperLeafUv.x,0.,1.);
           float leafW=abs(vVesperLeafUv.y*2.-1.);
           float broad=vesperNoise(vVesperSurface*.24);
           float fine=vesperNoise(vVesperSurface*2.8);
           float ribAA=max(fwidth(leafW)*1.25,.008);
           float midrib=1.-smoothstep(.015,.035+ribAA,leafW);
           float branchPhase=leafT*8.-leafW*.85+.09*sin(leafW*5.);
           float branchAA=max(fwidth(branchPhase)*1.25,.015);
           float secondary=1.-smoothstep(.02,.045+branchAA,abs(fract(branchPhase+.5)-.5));
           secondary*=smoothstep(.03,.15,leafT)*(1.-smoothstep(.88,1.,leafT));
           float veins=max(midrib,secondary*.58);
           float margin=smoothstep(.80,1.,leafW);
           diffuseColor.rgb*=mix(.76,1.22,broad)*(1.-margin*.18);
           diffuseColor.rgb=mix(diffuseColor.rgb,diffuseColor.rgb*vec3(1.36,1.30,.87),veins*.68);
           diffuseColor.rgb*=gl_FrontFacing?vec3(1.):vec3(1.12,1.10,.84);
           float vesperHeight=midrib*.15+secondary*.045+fine*.018;`
        : walker
          ? `float broad=vesperNoise(vVesperSurface*.18); float pore=vesperNoise(vVesperSurface*1.6);
             diffuseColor.rgb*=mix(.76,1.23,broad); diffuseColor.rgb=mix(diffuseColor.rgb,diffuseColor.rgb*vec3(.79,1.13,1.04),smoothstep(.55,.8,broad)*.35);
             float vesperHeight=pore*.035;
             #ifdef USE_MAP
               vesperHeight+=dot(sampledDiffuseColor.rgb,vec3(.21,.72,.07))*.8;
             #endif`
          : `float broad=vesperNoise(vVesperSurface*.12); float fine=sin(length(vVesperSurface.xz)*2.4+vesperNoise(vVesperSurface*.6)*3.);
           diffuseColor.rgb*=mix(.76,1.17,broad)*(1.+fine*.055); float vesperHeight=fine*.035;`;
    // Broad plates must survive the actual chase-camera distance. Keep the base
    // palette while enlarging mapped features and separating plate/groove values.
    if (walker)
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <map_fragment>',
        `#ifdef USE_MAP
          vec4 sampledDiffuseColor=texture2D(map,vMapUv*.5);
          diffuseColor.rgb*=clamp(vec3(.35)+sampledDiffuseColor.rgb*3.2,vec3(.32),vec3(1.75));
          diffuseColor.a*=sampledDiffuseColor.a;
        #endif
${treatment}`,
      );
    if (leaf)
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <roughnessmap_fragment>',
        '#include <roughnessmap_fragment>\nroughnessFactor=clamp(roughnessFactor*mix(.87,1.12,broad)+veins*.07,.38,.76);',
      );
    if (walker)
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <roughnessmap_fragment>',
        `#include <roughnessmap_fragment>
        #ifdef USE_MAP
          float plateValue=dot(sampledDiffuseColor.rgb,vec3(.21,.72,.07));
          roughnessFactor=clamp(roughnessFactor*mix(1.15,.78,smoothstep(.03,.36,plateValue)),.55,.96);
        #endif`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <map_fragment>',
        `#include <map_fragment>\n${treatment}`,
      )
      .replace(
        '#include <normal_fragment_maps>',
        `#include <normal_fragment_maps>
        vec3 vsx=dFdx(-vViewPosition),vsy=dFdy(-vViewPosition);
        vec3 vr1=cross(vsy,normal),vr2=cross(normal,vsx);
        float vdet=dot(vsx,vr1);
        normal=normalize(max(abs(vdet),.000001)*normal-sign(vdet)*(dFdx(vesperHeight)*vr1+dFdy(vesperHeight)*vr2));`,
      );
  };
  material.customProgramCacheKey = () =>
    `vesper-organic-r6-${bark ? 'bark' : leaf ? 'leaf' : walker ? 'walker' : 'fungus'}-${material.userData.vesperSurfaceDetail}`;
}

export function setVesperSurfaceDetail(material, enabled) {
  if (
    !Object.hasOwn(material.userData, 'vesperSurfaceDetail') ||
    material.userData.vesperSurfaceDetail === enabled
  )
    return;
  material.userData.vesperSurfaceDetail = enabled;
  material.needsUpdate = true;
}
