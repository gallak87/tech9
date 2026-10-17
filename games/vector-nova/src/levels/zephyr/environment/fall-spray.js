import * as T from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// Scene-owned spray shares the water clock. Camera-facing droplets use the
// existing scene lights, following Nightweir's lit aeration approach.
export function createFallSpray(clock) {
  const parts = [];
  for (let i = 0; i < 80; i++) {
    const q = 0.42 + (i / 80) * 0.52,
      g = new T.PlaneGeometry(1, 1),
      origin = [],
      seed = [];
    const x = Math.sin(i * 17.1) * (15 + q * 23),
      y = -360 * q,
      z = 22 * q * q + Math.cos(i * 3.7) * 7;
    for (let k = 0; k < 4; k++) {
      origin.push(x, y, z);
      seed.push(i * 0.618, 7 + q * 13, q);
    }
    g.setAttribute('sprayOrigin', new T.Float32BufferAttribute(origin, 3));
    g.setAttribute('spraySeed', new T.Float32BufferAttribute(seed, 3));
    parts.push(g);
  }
  const geometry = mergeGeometries(parts);
  parts.forEach((g) => g.dispose());
  const material = new T.MeshStandardMaterial({
    name: 'Zephyr sunlit fall aeration',
    color: '#b7c9cc',
    roughness: 0.92,
    transparent: true,
    depthWrite: false,
    side: T.DoubleSide,
    forceSinglePass: true,
  });
  material.onBeforeCompile = (shader) => {
    shader.uniforms.waterTime = clock;
    shader.vertexShader =
      'uniform float waterTime;attribute vec3 sprayOrigin;attribute vec3 spraySeed;varying vec2 sprayUV;varying float sprayLife;\n' +
      shader.vertexShader
        .replace(
          '#include <defaultnormal_vertex>',
          'vec3 transformedNormal=vec3(0.,0.,1.);',
        )
        .replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>
        sprayUV=uv;float phase=fract(waterTime*.16+spraySeed.x);sprayLife=sin(phase*3.14159);
        transformed=sprayOrigin+vec3(sin(phase*5.+spraySeed.x)*3.,-phase*28.,phase*12.);`,
        )
        .replace(
          '#include <project_vertex>',
          `vec4 mvPosition=modelViewMatrix*vec4(transformed,1.);float scale=length(modelMatrix[0].xyz);mvPosition.xy+=position.xy*spraySeed.y*scale*(1.+sprayLife*.7);gl_Position=projectionMatrix*mvPosition;`,
        );
    shader.fragmentShader =
      'varying vec2 sprayUV;varying float sprayLife;\n' +
      shader.fragmentShader.replace(
        '#include <map_fragment>',
        `#include <map_fragment>
      vec2 p=(sprayUV-.5)*vec2(1.,.72);float grain=sin(p.x*53.+sin(p.y*37.))*sin(p.y*43.+p.x*17.);
      float edge=1.-smoothstep(.1,.51,length(p)+grain*.055);
      diffuseColor.a=edge*sprayLife*.065;`,
      );
  };
  material.customProgramCacheKey = () => 'zephyr-lit-fall-aeration-v1';
  const mesh = new T.Mesh(geometry, material);
  mesh.name = 'Zephyr / thinning sunlit aeration';
  mesh.userData.aoExclude = true;
  mesh.frustumCulled = false;
  mesh.renderOrder = 4;
  return mesh;
}

// Compact churning contact volume, bounded by the receiving cistern. The pool
// and downstream current stay visible beyond its dense aerated centre.
export function createImpactFoam(clock) {
  const geometry = new T.SphereGeometry(1, 12, 8);
  const material = new T.MeshStandardMaterial({
    name: 'Zephyr receiver contact foam',
    color: '#d9e5e1',
    roughness: 0.88,
    transparent: true,
    opacity: 0.86,
    depthWrite: false,
  });
  material.onBeforeCompile = (shader) => {
    shader.uniforms.waterTime = clock;
    shader.vertexShader =
      'uniform float waterTime;varying vec3 foamLocal;varying float foamPhase;\n' +
      shader.vertexShader.replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
      foamLocal=position;foamPhase=instanceMatrix[3].x*.71+instanceMatrix[3].z*.39;
      transformed.y+=sin(waterTime*4.+foamPhase)*.18;
      transformed.x+=sin(waterTime*2.7+foamPhase)*.12;`,
      );
    shader.fragmentShader =
      'uniform float waterTime;varying vec3 foamLocal;varying float foamPhase;\n' +
      shader.fragmentShader.replace(
        '#include <map_fragment>',
        `#include <map_fragment>
      float bubbles=sin(foamLocal.x*21.+waterTime*3.)*sin(foamLocal.z*17.-waterTime*2.+foamPhase)*.5+.5;
      diffuseColor.rgb*=.72+bubbles*.28;
      float rim=smoothstep(.02,.5,abs(dot(normalize(vNormal),normalize(vViewPosition))));
      diffuseColor.a*=rim*smoothstep(.06,.55,bubbles);`,
      );
  };
  material.customProgramCacheKey = () => 'zephyr-receiver-contact-foam-v1';
  const mesh = new T.InstancedMesh(geometry, material, 56);
  const p = new T.Vector3(),
    scale = new T.Vector3(),
    q = new T.Quaternion(),
    matrix = new T.Matrix4();
  for (let i = 0; i < 56; i++) {
    const a = i * 2.399963,
      r = Math.sqrt((i + 0.5) / 56);
    p.set(
      Math.cos(a) * r * 13,
      0.2 + (1 - r) * 1.1,
      Math.sin(a) * r * 17 + r * r * 6,
    );
    scale.set(2.7 + (i % 4) * 0.7, 0.3 + (1 - r) * 0.85, 4.8 + (i % 3) * 1.1);
    mesh.setMatrixAt(i, matrix.compose(p, q, scale));
  }
  mesh.name = 'Zephyr / turbulent receiving impact';
  mesh.userData.aoExclude = true;
  mesh.renderOrder = 4;
  return mesh;
}
