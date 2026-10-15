import * as T from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { finishNightweirMetal } from './materials.js';
import { NACRE_WAVE_GLSL } from '../../nacre/environment/ocean-waves.js';
import { wetnessAt } from '../../zephyr/environment/atmosphere.js';
import kit from '../../../../assets/levels/nightweir/water-kit.json' with { type: 'json' };
const bed = (z) =>
  Math.max(-45, Math.floor((2750 - 0.55 * (z + 350)) / 360) * 360);
export const floodgatePhase = (track, distance) =>
  T.MathUtils.clamp(distance / track.finishDistance, 0, 1);
export function createNightweirWater(track) {
  const group = new T.Group();
  group.name = 'Nightweir / the floodgates';
  const geometries = new Set(),
    materials = new Set();
  const clock = { value: 0 },
    opening = { value: 0 };
  // Reuse Nacre's analytic wave field at a sheltered harbor amplitude. This is
  // presentation water; it never substitutes a wave mesh for the solid road.
  const basinPieces = [];
  let beginning = -1300,
    level = bed(beginning);
  for (let z = -1295; z <= 6500; z += 5) {
    const next = bed(z);
    if (next !== level || z === 6500) {
      const length = z - beginning,
        g = new T.PlaneGeometry(
          1840,
          length,
          46,
          Math.max(2, Math.ceil(length / 40)),
        );
      g.rotateX(-Math.PI / 2);
      g.translate(0, level + 4, (beginning + z) / 2);
      basinPieces.push(g);
      beginning = z;
      level = next;
    }
  }
  const riverGeometry = mergeGeometries(basinPieces);
  basinPieces.forEach((g) => g.dispose());
  geometries.add(riverGeometry);
  const river = new T.MeshStandardMaterial({
    name: 'Nightweir / sheltered flowing basin',
    color: '#284653',
    roughness: 0.26,
    metalness: 0.18,
  });
  river.onBeforeCompile = (shader) => {
    shader.uniforms.waterTime = clock;
    shader.vertexShader =
      'uniform float waterTime;varying vec3 waterPoint;\n' +
      NACRE_WAVE_GLSL +
      '\n' +
      shader.vertexShader
        .replace(
          '#include <begin_vertex>',
          '#include <begin_vertex>\nNacreOcean wave=nacreOcean(position.xz,waterTime,vec3(.055,0.,0.),vec3(50.,0.,0.));transformed+=wave.displacement;waterPoint=position;',
        )
        .replace(
          '#include <beginnormal_vertex>',
          '#include <beginnormal_vertex>\nNacreOcean wn=nacreOcean(position.xz,waterTime,vec3(.055,0.,0.),vec3(50.,0.,0.));objectNormal=normalize(normal+(wn.normal-vec3(0.,1.,0.))*.35);',
        );
    shader.fragmentShader =
      'varying vec3 waterPoint;uniform float waterTime;\n' +
      shader.fragmentShader.replace(
        '#include <roughnessmap_fragment>',
        '#include <roughnessmap_fragment>\nfloat ripple=sin(waterPoint.x*.07+sin(waterPoint.z*.11)*2.-waterTime*.4)*sin(waterPoint.z*.06+waterTime*.3);roughnessFactor=.27+.045*ripple;',
      );
  };
  river.customProgramCacheKey = () => 'nightweir-nacre-basin-v1';
  materials.add(river);
  const basin = new T.Mesh(riverGeometry, river);
  basin.name = 'Nightweir / falling river and lower basin';
  basin.userData.aoExclude = true;
  group.add(basin);
  const waterMaterial = new T.ShaderMaterial({
    name: 'Nightweir / source-fed spillway sheets',
    side: T.DoubleSide,
    transparent: true,
    depthWrite: false,
    forceSinglePass: true,
    uniforms: { waterTime: clock, flood: opening },
    vertexShader: `attribute float sourcePhase;attribute float crossed;attribute float releaseAt;attribute float sheetWidth;varying float vWidth;varying float vGate;varying vec2 vFlow;varying float vPhase;varying float vCross;varying vec3 vWorld;void main(){vWidth=sheetWidth;vGate=releaseAt;vFlow=uv;vPhase=sourcePhase;vCross=crossed;vec4 world=modelMatrix*vec4(position,1.);vWorld=world.xyz;gl_Position=projectionMatrix*viewMatrix*world;}`,
    fragmentShader: `uniform float waterTime;uniform float flood;varying float vWidth;varying float vGate;varying vec2 vFlow;varying float vPhase;varying float vCross;varying vec3 vWorld;
 float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);}
 void main(){float fall=vFlow.y-waterTime*(15.+vPhase*2.);float strands=noise(vec2(vFlow.x*.42,fall*.045))+noise(vec2(vFlow.x*1.8,fall*.13))*.3;float edge=smoothstep(0.,2.5,vFlow.x)*(1.-smoothstep(vWidth-2.5,vWidth,vFlow.x));float foam=smoothstep(.66,.95,strands);float released=mix(smoothstep(fract(vPhase*.618)*.65,fract(vPhase*.618)*.65+.35,flood),smoothstep(vGate-.0242,vGate-.00646,flood),vCross);float open=.3+.7*released;float opacity=mix(.68,.25,vCross)*(.32+strands*.6)*edge*open;vec3 color=mix(vec3(.13,.27,.32),vec3(.76,.84,.84),foam*.85+strands*.23);gl_FragColor=vec4(color,opacity);
 #include <tonemapping_fragment>
 #include <colorspace_fragment>
 }`,
  });
  materials.add(waterMaterial);
  const pos = [],
    uv = [],
    seeds = [],
    cross = [],
    releases = [],
    widths = [],
    indices = [];
  const foamCenters = [],
    impactFrames = [];
  for (const source of kit.falls) {
    const fall = {
      ...source,
      height:
        source.kind === 'crossing'
          ? source.top[1] - bed(source.top[2]) - 4
          : source.height,
    };
    const top = new T.Vector3(...fall.top),
      right = new T.Vector3(...fall.right),
      outward = new T.Vector3(right.z, 0, -right.x),
      n = 16,
      offset = pos.length / 3;
    // Dams spill toward +Z. The default curtain normal points upstream and
    // bowed five metres into a wall only four metres behind the spill mouth.
    if (fall.kind === 'dam') outward.negate();
    for (let i = 0; i <= n; i++) {
      const down = (fall.height * i) / n;
      for (const side of [-1, 1]) {
        const p = top.clone().addScaledVector(right, (side * fall.width) / 2);
        p.y -= down;
        p.addScaledVector(outward, Math.sin((i / n) * Math.PI) * 5);
        pos.push(...p.toArray());
        uv.push(side < 0 ? 0 : fall.width, down);
        seeds.push(fall.seed);
        cross.push(fall.kind === 'crossing' ? 1 : 0);
        releases.push((fall.distance ?? 0) / track.finishDistance);
        widths.push(fall.width);
      }
      if (i < n) {
        let k = offset + i * 2;
        indices.push(k, k + 2, k + 1, k + 1, k + 2, k + 3);
      }
    }
    impactFrames.push({
      p: top.clone().add(new T.Vector3(0, -fall.height + 1.3, 0)),
      right,
      width: fall.width,
      seed: fall.seed,
    });
    for (let x = -fall.width / 2 + 8; x < fall.width / 2; x += 32)
      foamCenters.push(
        top
          .clone()
          .addScaledVector(right, x)
          .add(new T.Vector3(0, -fall.height, 0)),
      );
  }
  const g = new T.BufferGeometry();
  g.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new T.Float32BufferAttribute(uv, 2));
  g.setAttribute('sourcePhase', new T.Float32BufferAttribute(seeds, 1));
  g.setAttribute('crossed', new T.Float32BufferAttribute(cross, 1));
  g.setAttribute('releaseAt', new T.Float32BufferAttribute(releases, 1));
  g.setAttribute('sheetWidth', new T.Float32BufferAttribute(widths, 1));
  g.setIndex(indices);
  g.computeBoundingSphere();
  geometries.add(g);
  const sheets = new T.Mesh(g, waterMaterial);
  sheets.name = 'Nightweir / actual falling curtains';
  sheets.userData.aoExclude = true;
  sheets.renderOrder = 3;
  group.add(sheets);
  const sprayPositions = [],
    spraySeeds = [];
  for (const [n, p] of foamCenters.entries())
    for (let i = 0; i < 38; i++) {
      sprayPositions.push(
        p.x + Math.sin(i * 17 + n) * 23,
        p.y + Math.cos(i * 13) * 4,
        p.z + Math.cos(i * 11 + n) * 14,
      );
      spraySeeds.push(i * 0.618 + n, 6 + (i % 5) * 2);
    }
  const sg = new T.BufferGeometry();
  sg.setAttribute('position', new T.Float32BufferAttribute(sprayPositions, 3));
  sg.setAttribute('seedSize', new T.Float32BufferAttribute(spraySeeds, 2));
  geometries.add(sg);
  const sprayMaterial = new T.ShaderMaterial({
    name: 'Nightweir / foot-of-fall mist',
    transparent: true,
    depthWrite: false,
    uniforms: { waterTime: clock },
    vertexShader: `uniform float waterTime;attribute vec2 seedSize;varying float fade;void main(){float phase=fract(waterTime*.19+seedSize.x);vec3 p=position+vec3(sin(seedSize.x*7.)*phase*9.,phase*14.,cos(seedSize.x*11.)*phase*9.);vec4 v=modelViewMatrix*vec4(p,1.);gl_PointSize=min(100.,seedSize.y*500./max(8.,-v.z));fade=sin(phase*3.14159)*.13;gl_Position=projectionMatrix*v;}`,
    fragmentShader:
      `varying float fade;void main(){float a=(1.-smoothstep(.1,.5,length(gl_PointCoord-.5)))*fade;gl_FragColor=vec4(.65,.78,.81,a);#include <tonemapping_fragment>\n#include <colorspace_fragment>}`.replace(
        'a);#include',
        'a);\n#include',
      ),
  });
  materials.add(sprayMaterial);
  const spray = new T.Points(sg, sprayMaterial);
  spray.name = 'Nightweir / waterfall spray';
  spray.userData.aoExclude = true;
  group.add(spray);

  // Surface contact is a broken sheet of aerated water, separate from rising mist.
  const impactGeometry = new T.PlaneGeometry(1, 1);
  impactGeometry.rotateX(-Math.PI / 2);
  geometries.add(impactGeometry);
  const impactMaterial = new T.ShaderMaterial({
    name: 'Nightweir / aerated plunge pools',
    transparent: true,
    depthWrite: false,
    side: T.DoubleSide,
    uniforms: { waterTime: clock },
    vertexShader: `varying vec2 poolUV;varying vec3 poolWorld;void main(){poolUV=uv;vec4 w=modelMatrix*instanceMatrix*vec4(position,1.);poolWorld=w.xyz;gl_Position=projectionMatrix*viewMatrix*w;}`,
    fragmentShader: `uniform float waterTime;varying vec2 poolUV;varying vec3 poolWorld;
 float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);}
 void main(){vec2 p=poolWorld.xz;float n=noise(p*.16+vec2(waterTime*.2,waterTime*.8));float fine=noise(p*.7+vec2(n*2.,waterTime));float edge=smoothstep(0.,.05,poolUV.x)*(1.-smoothstep(.95,1.,poolUV.x));float shape=1.-smoothstep(.16,.5,abs(poolUV.y-.5)+n*.15);float a=edge*shape*smoothstep(.26,.76,n+fine*.25)*.5;gl_FragColor=vec4(vec3(.49,.64,.66),a);
 #include <tonemapping_fragment>
 #include <colorspace_fragment>
 }`,
  });
  materials.add(impactMaterial);
  const impacts = new T.InstancedMesh(
      impactGeometry,
      impactMaterial,
      impactFrames.length,
    ),
    im = new T.Matrix4();
  impacts.name = 'Nightweir / source-fed plunge foam';
  impacts.userData.aoExclude = true;
  impacts.renderOrder = 2;
  impactFrames.forEach((f, i) => {
    const q = new T.Quaternion().setFromAxisAngle(
      new T.Vector3(0, 1, 0),
      -Math.atan2(f.right.z, f.right.x),
    );
    im.compose(f.p, q, new T.Vector3(f.width + 10, 1, 48));
    impacts.setMatrixAt(i, im);
  });
  group.add(impacts);
  // Gate leaves visibly lift over their fixed feeder openings. They are outside
  // the driving envelope; source flow grows without concealing landing decks.
  const gateMaterial = new T.MeshStandardMaterial({
    name: 'Nightweir / lifting floodgate leaves',
    color: '#674530',
    roughness: 0.46,
    metalness: 0.68,
  });
  materials.add(gateMaterial);
  finishNightweirMetal(gateMaterial);
  const panelParts = [new T.BoxGeometry(53, 17, 1.4)];
  for (const x of [-24, -12, 0, 12, 24])
    panelParts.push(new T.BoxGeometry(0.8, 17, 1.3).translate(x, 0, -1.2));
  for (const y of [-6.6, 6.6])
    panelParts.push(new T.BoxGeometry(53, 0.8, 1.8).translate(0, y, -1.4));
  const gateGeometry = mergeGeometries(panelParts);
  panelParts.forEach((g) => g.dispose());
  geometries.add(gateGeometry);
  const colors = [];
  for (let i = 0; i < gateGeometry.attributes.position.count; i++) {
    const z = gateGeometry.attributes.position.getZ(i);
    colors.push(...(z < -0.8 ? [0.48, 0.59, 0.61] : [1, 1, 1]));
  }
  gateGeometry.setAttribute('color', new T.Float32BufferAttribute(colors, 3));
  gateMaterial.vertexColors = true;
  const gates = new T.InstancedMesh(
    gateGeometry,
    gateMaterial,
    track.curtains.length,
  );
  gates.name = 'Nightweir / rising sluice leaves';
  group.add(gates);
  const m = new T.Matrix4();
  const hoistGeometry = new T.BoxGeometry(1, 1, 1),
    hoistMaterial = new T.MeshStandardMaterial({
      name: 'Nightweir / sluice hoist iron',
      color: '#263c43',
      roughness: 0.43,
      metalness: 0.6,
    });
  geometries.add(hoistGeometry);
  materials.add(hoistMaterial);
  finishNightweirMetal(hoistMaterial);
  const hoists = new T.InstancedMesh(
      hoistGeometry,
      hoistMaterial,
      track.curtains.length * 2,
    ),
    weights = new T.InstancedMesh(
      hoistGeometry,
      hoistMaterial,
      track.curtains.length * 2,
    );
  hoists.name = 'Nightweir / gate lifting stems';
  weights.name = 'Nightweir / descending counterweights';
  group.add(hoists, weights);

  for (const material of [waterMaterial, sprayMaterial, impactMaterial]) {
    material.fog = true;
    Object.assign(material.uniforms, T.UniformsUtils.clone(T.UniformsLib.fog));
    material.vertexShader =
      '#include <fog_pars_vertex>\n' + material.vertexShader;
    material.vertexShader = material.vertexShader.replace(
      /}\s*$/,
      '\nvec4 mvPosition=modelViewMatrix*vec4(position,1.);\n#include <fog_vertex>\n}',
    );
    if (material === impactMaterial)
      material.vertexShader = material.vertexShader.replace(
        'vec4 mvPosition=modelViewMatrix*vec4(position,1.);',
        'vec4 mvPosition=viewMatrix*w;',
      );
    material.fragmentShader =
      '#include <fog_pars_fragment>\n' +
      material.fragmentShader.replace(
        '#include <colorspace_fragment>',
        '#include <colorspace_fragment>\n#include <fog_fragment>\n',
      );
  }
  let last = -1,
    disposed = false;
  return {
    group,
    setReflection(texture) {
      river.envMap = texture;
      river.envMapIntensity = 0.65;
      river.needsUpdate = true;
    },
    update({ state = { distance: 0 }, time = 0, settings = {} } = {}) {
      if (disposed) return;
      clock.value = settings.reducedMotion ? 0 : time;
      group.userData.flowTime = clock.value;
      const phase =
        group.userData.phaseOverride ?? floodgatePhase(track, state.distance);
      opening.value = phase;
      group.userData.phase = phase;
      group.userData.wetness = wetnessAt(track, state.distance);
      if (last !== phase) {
        track.curtains.forEach((c, i) => {
          const open =
            group.userData.phaseOverride ??
            T.MathUtils.smoothstep(state.distance, c.s - 300, c.s - 80);
          const f = track.sample(c.s),
            p = f.position.clone().add(new T.Vector3(0, 44 + 26 * open, 0)),
            right = f.right.clone().setY(0).normalize(),
            forward = new T.Vector3().crossVectors(
              right,
              new T.Vector3(0, 1, 0),
            );
          const q = new T.Quaternion().setFromRotationMatrix(
            new T.Matrix4().makeBasis(right, new T.Vector3(0, 1, 0), forward),
          );
          p.addScaledVector(forward, -12);
          m.compose(p, q, new T.Vector3(1, 1, 1));
          gates.setMatrixAt(i, m);
          for (const [j, side] of [-1, 1].entries()) {
            const root = f.position
              .clone()
              .addScaledVector(right, side * 30)
              .addScaledVector(forward, -12);
            m.compose(
              root.clone().add(new T.Vector3(0, 74, 0)),
              q,
              new T.Vector3(1.8, 70, 2.6),
            );
            hoists.setMatrixAt(i * 2 + j, m);
            m.compose(
              root.clone().add(new T.Vector3(0, 91 - 26 * open, 0)),
              q,
              new T.Vector3(5, 9, 5),
            );
            weights.setMatrixAt(i * 2 + j, m);
          }
        });
        for (const mesh of [gates, hoists, weights]) {
          mesh.instanceMatrix.needsUpdate = true;
          mesh.computeBoundingSphere();
        }
        last = phase;
      }
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const mesh of [gates, hoists, weights, impacts]) mesh.dispose();
      geometries.forEach((g) => g.dispose());
      materials.forEach((m) => m.dispose());
      group.clear();
    },
  };
}
