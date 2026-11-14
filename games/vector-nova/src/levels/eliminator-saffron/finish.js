import {
  appendShaderPatch,
  replaceShader,
} from '../../renderer/shader-patch.js';

/** The same leached/sheltered hierarchy belongs to original and new cortex.
 * Chalk fades into the matching cortical tone at real joining sockets; it
 * stays pale on exposed lips away from those attachments. */
export function finishOssuaryCortex(material, joints = []) {
  const marrow = /marrow/.test(material.name),
    chalk = /chalk_edges/.test(material.name);
  appendShaderPatch(
    material,
    `:ossuary-leached-cortex-v1:${marrow}:${chalk}:${Boolean(joints.length)}`,
    (shader) => {
      if (joints.length) {
        shader.uniforms.ossuaryCortexJoints = { value: joints };
        shader.fragmentShader =
          'uniform vec3 ossuaryCortexJoints[3];\n' + shader.fragmentShader;
      }
      shader.fragmentShader = replaceShader(
        shader.fragmentShader,
        '#include <emissivemap_fragment>',
        `
      #include <emissivemap_fragment>
      vec3 cortexNormal=inverseTransformDirection(normal,viewMatrix);
      float cortexExposure=smoothstep(-.45,.65,cortexNormal.y);
      diffuseColor.rgb*=mix(${marrow ? 'vec3(.91,.83,.72),vec3(.99,.97,.91)' : 'vec3(.91,.82,.70),vec3(1.04,1.09,1.16)'},cortexExposure);
      ${
        joints.length
          ? `
      float cortexJointDistance=min(length(vSaffronWorld-ossuaryCortexJoints[0]),min(length(vSaffronWorld-ossuaryCortexJoints[1]),length(vSaffronWorld-ossuaryCortexJoints[2])));
      float cortexJoint=1.-smoothstep(3.,22.,cortexJointDistance);
      diffuseColor.rgb*=mix(vec3(1.),${chalk ? 'vec3(.843,.788,.731)' : 'vec3(.96)'},cortexJoint);
      `
          : ''
      }
    `,
      );
    },
  );
}

/** Cast amber uses the already-owned Saffron mineral volume. Internal laminae,
 * shallow sealed relief and a restrained direct highlight distinguish it
 * from the matte dune without another map, pass or transmission buffer. */
export function finishOssuaryGlass(material, noise, width) {
  material.saffronWeatheringNoise = noise;
  material.onBeforeCompile = (shader) => {
    shader.uniforms.ossuaryCastNoise = { value: noise };
    shader.vertexShader =
      'attribute vec2 roadCoord; varying vec3 vCastPoint; varying float vCastLateral;\n' +
      shader.vertexShader;
    shader.vertexShader = replaceShader(
      shader.vertexShader,
      '#include <begin_vertex>',
      `
      #include <begin_vertex>
      vCastPoint=vec3(roadCoord.y,position.y*.12,roadCoord.x);
      vCastLateral=roadCoord.y;
    `,
    );
    shader.fragmentShader =
      `varying vec3 vCastPoint; varying float vCastLateral;
      uniform highp sampler3D ossuaryCastNoise;
      float castNoise(vec3 p) { return textureGrad(ossuaryCastNoise,p/64.,dFdx(p)/64.,dFdy(p)/64.).r; }
      ` + shader.fragmentShader;
    shader.fragmentShader = replaceShader(
      shader.fragmentShader,
      '#include <color_fragment>',
      `
      #include <color_fragment>
      float castDrift=castNoise(vCastPoint*vec3(.12,.018,.035));
      float castFold=castNoise(vCastPoint*.43);
      float castSkin=castNoise(vCastPoint*4.8);
      float castHaze=smoothstep(.43,.72,castFold);
      float castVein=pow(1.-abs(sin(vCastPoint.x*.18+vCastPoint.z*.022+castDrift*3.)),18.);
      float castEdge=smoothstep(${(width / 2 - 7).toFixed(4)},${(width / 2 - 1).toFixed(4)},abs(vCastLateral));
      diffuseColor.rgb*=.82+castDrift*.28;
      diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.58,.32,.075),castVein*.22+castEdge*.16);
      diffuseColor.a=mix(diffuseColor.a,.76,castEdge);
    `,
    );
    shader.fragmentShader = replaceShader(
      shader.fragmentShader,
      '#include <roughnessmap_fragment>',
      `
      #include <roughnessmap_fragment>
      roughnessFactor=clamp(roughnessFactor+castHaze*.15+castSkin*.025,.23,.56);
    `,
    );
    shader.fragmentShader = replaceShader(
      shader.fragmentShader,
      '#include <normal_fragment_maps>',
      `
      #include <normal_fragment_maps>
      float castRelief=castFold*.012+castSkin*.0025;
      vec3 castDx=dFdx(-vViewPosition),castDy=dFdy(-vViewPosition);
      vec3 castRx=cross(castDy,normal),castRy=cross(normal,castDx);
      float castDet=dot(castDx,castRx)*faceDirection;
      normal=normalize(abs(castDet)*normal-sign(castDet)*(dFdx(castRelief)*castRx+dFdy(castRelief)*castRy));
    `,
    );
    shader.fragmentShader = replaceShader(
      shader.fragmentShader,
      '#include <lights_fragment_end>',
      `
      #include <lights_fragment_end>
      // The sealed centre scatters less diffuse light than the thick amber
      // shoulder. Keep the optical coat/reflection, not an opaque gold paint.
      reflectedLight.directDiffuse*=mix(.62,.94,castEdge);
      reflectedLight.indirectDiffuse*=mix(.68,1.,castEdge);
    `,
    );
    shader.fragmentShader = replaceShader(
      shader.fragmentShader,
      '#include <opaque_fragment>',
      `
      vec3 castDirect=reflectedLight.directSpecular;
      #ifdef USE_CLEARCOAT
      castDirect=castDirect*(1.-material.clearcoat*Fcc)+clearcoatSpecularDirect*material.clearcoat;
      #endif
      float castPeak=max(castDirect.r,max(castDirect.g,castDirect.b));
      float castExcess=max(0.,castPeak-.45);
      float castShoulder=.45+castExcess/(1.+castExcess/.40);
      outgoingLight+=castDirect*((castPeak>.45?castShoulder/max(castPeak,.0001):1.)-1.);
      #include <opaque_fragment>
    `,
    );
  };
  material.customProgramCacheKey = () => `ossuary-cast-mineral-v2:${width}`;
}
