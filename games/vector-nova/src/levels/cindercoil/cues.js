import * as T from 'three';
import { sweepGeometry } from '../../track/geometry.js';
import { sampleSurge } from './mechanics.js';

export function createCindercoilCues(track, shape = false) {
  const group = new T.Group();
  group.name = 'cindercoil-visible-hazard-boundaries';
  const ownedGeometries = [];
  const ownedMaterials = [];
  const patches = [];
  const flowTime = { value: 0 };
  const decorateLava = (material) => {
    material.onBeforeCompile = (shader) => {
      shader.uniforms.cinderFlowTime = flowTime;
      shader.vertexShader = shader.vertexShader
        .replace(
          '#include <common>',
          `#include <common>
        varying vec3 vCinderWorld; varying float vCinderEdge; attribute float cinderEdge;`,
        )
        .replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>
        vCinderWorld=(modelMatrix*vec4(transformed,1.)).xyz;vCinderEdge=cinderEdge;`,
        );
      shader.fragmentShader = shader.fragmentShader
        .replace(
          '#include <common>',
          `#include <common>
        uniform float cinderFlowTime; varying vec3 vCinderWorld; varying float vCinderEdge;
        float cinderHash(vec3 p){return fract(sin(dot(p,vec3(127.1,311.7,74.7)))*43758.5453);}
        float cinderNoise(vec3 p){vec3 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(mix(cinderHash(i),cinderHash(i+vec3(1,0,0)),f.x),mix(cinderHash(i+vec3(0,1,0)),cinderHash(i+vec3(1,1,0)),f.x),f.y),mix(mix(cinderHash(i+vec3(0,0,1)),cinderHash(i+vec3(1,0,1)),f.x),mix(cinderHash(i+vec3(0,1,1)),cinderHash(i+vec3(1,1,1)),f.x),f.y),f.z);}`,
        )
        .replace(
          '#include <color_fragment>',
          `#include <color_fragment>
        vec3 lavaP=vCinderWorld*.24+vec3(cinderFlowTime*.1,0.,cinderFlowTime*.025);
        float broad=cinderNoise(lavaP+vec3(cinderNoise(lavaP*.43)*2.));
        float molten=smoothstep(.28,.72,broad*.7+cinderNoise(lavaP*4.8)*.3);
        float rim=smoothstep(.91,1.,vCinderEdge);
        diffuseColor.rgb=mix(vec3(.14,.035,.012),vec3(.92,.30,.055),molten);
        diffuseColor.rgb=mix(diffuseColor.rgb,vec3(1.,.46,.08),rim*.8);`,
        )
        .replace(
          '#include <emissivemap_fragment>',
          `#include <emissivemap_fragment>
        totalEmissiveRadiance=mix(vec3(.12,.015,.001),vec3(1.05,.24,.018),molten*molten)+rim*vec3(.42,.16,.014);`,
        );
    };
    material.customProgramCacheKey = () => 'cindercoil-visible-lava-v1';
  };
  for (const zone of track.surgeZones ?? []) {
    const warningMaterial = new T.MeshStandardMaterial({
      color: '#edac4e',
      emissive: '#e37d1c',
      emissiveIntensity: 0.22,
      roughness: 0.52,
      side: T.DoubleSide,
    });
    const lavaMaterial = new T.MeshStandardMaterial({
      color: shape ? '#ed7e40' : '#ffab3e',
      emissive: '#f7520c',
      emissiveIntensity: 1.4,
      roughness: 0.66,
      side: T.DoubleSide,
    });
    if (!shape) decorateLava(lavaMaterial);
    ownedMaterials.push(warningMaterial, lavaMaterial);
    const boundary = -3 * zone.side;
    const warning = new T.Mesh(
      sweepGeometry(
        track,
        [
          [boundary - 0.15, 0.09],
          [boundary + 0.15, 0.09],
        ],
        { start: zone.start - 35, end: zone.end, step: 3 },
      ),
      warningMaterial,
    );
    group.add(warning);
    ownedGeometries.push(warning.geometry);
    const positions = [];
    const indices = [];
    const frames = [];
    const count = Math.ceil((zone.end - zone.start) / 3);
    for (let i = 0; i <= count; i++) {
      const frame = track.sample(
        T.MathUtils.lerp(zone.start, zone.end, i / count),
      );
      frames.push({
        position: frame.position.clone(),
        right: frame.right.clone(),
        up: frame.up.clone(),
      });
      for (let j = 0; j < 4; j++) positions.push(0, 0, 0);
      if (i) {
        const a = (i - 1) * 4,
          b = i * 4;
        for (let side = 0; side < 3; side++)
          indices.push(
            a + side,
            b + side,
            a + side + 1,
            a + side + 1,
            b + side,
            b + side + 1,
          );
      }
    }
    const geometry = new T.BufferGeometry();
    geometry.setAttribute(
      'position',
      new T.Float32BufferAttribute(positions, 3),
    );
    geometry.setIndex(indices);
    geometry.setAttribute(
      'cinderEdge',
      new T.Float32BufferAttribute(
        Array.from({ length: (count + 1) * 4 }, (_, index) =>
          index % 4 >= 2 ? 1 : 0,
        ),
        1,
      ),
    );
    const lava = new T.Mesh(geometry, lavaMaterial);
    lava.frustumCulled = false;
    group.add(lava);
    ownedGeometries.push(geometry);
    patches.push({ zone, frames, lava, warningMaterial });
  }
  const point = new T.Vector3();
  const update = ({ time = 0, settings = {} }) => {
    flowTime.value = settings.reducedMotion ? 0 : time;
    for (const { zone, frames, lava, warningMaterial } of patches) {
      const cue = sampleSurge(time, zone);
      lava.visible = cue.coverage > 0.002;
      warningMaterial.emissiveIntensity = cue.warning
        ? settings.reducedMotion
          ? 0.95
          : 0.8 + 0.3 * Math.sin(time * 8)
        : cue.active
          ? 1.1
          : 0.12;
      if (!lava.visible) continue;
      const position = lava.geometry.attributes.position;
      for (const [i, frame] of frames.entries()) {
        const profile = [
          [15 * zone.side, 0.07],
          [15 * zone.side, 0.26],
          [cue.boundary * zone.side, 0.26],
          [cue.boundary * zone.side, 0.07],
        ];
        for (let j = 0; j < 4; j++) {
          point
            .copy(frame.position)
            .addScaledVector(frame.right, profile[j][0])
            .addScaledVector(frame.up, profile[j][1]);
          position.setXYZ(i * 4 + j, point.x, point.y, point.z);
        }
      }
      position.needsUpdate = true;
      lava.geometry.computeVertexNormals();
    }
  };
  update({ time: 0 });
  return {
    group,
    update,
    dispose() {
      ownedGeometries.forEach((geometry) => geometry.dispose());
      ownedMaterials.forEach((material) => material.dispose());
      group.clear();
    },
  };
}
