import * as T from 'three';
import { sampleCindercoilEvent, surgeAt } from './mechanics.js';
import { createCindercoilPlumeResources } from './plume.js';

const smooth = T.MathUtils.smoothstep;

/** Route frame distinguishes exposed decks from the deck over an inverted craft. */
export function sampleCindercoilAtmosphere(track, state) {
  const distance = T.MathUtils.euclideanModulo(state.distance, track.length);
  const frame = track.sample(distance);
  const section = track.sections.find(
    (s) => distance >= s.start && distance < s.end,
  );
  const overhead = 1 - smooth(frame.up.y, -0.18, 0.35);
  const exposure = 1 - overhead;
  const cool = ['teeth', 'crown', 'ashgate'].includes(section?.id);
  const surge = surgeAt(track, state);
  const event = sampleCindercoilEvent(state.time);
  const jump = track.jumps[0];
  const ventProximity =
    smooth(distance, jump.takeoff - 150, jump.takeoff - 45) *
    (1 - smooth(distance, jump.landingStart + 30, jump.landingEnd));
  const hot = Math.min(
    1,
    (surge?.coverage ?? 0) * (surge?.contact ? 1 : 0.3) +
      event.vent * ventProximity * 0.65 +
      (cool ? 0 : 0.12),
  );
  return {
    exposure,
    ash: exposure * (cool ? 0.15 : 0.8),
    hot: exposure * hot,
    contact: surge?.contact ?? false,
  };
}

/** Bounded world-space fields end above their authored receiving deck; no X/Z ground assumption. */
export function createCindercoilAtmosphere(track, ventPosition) {
  const group = new T.Group();
  group.name = 'Cindercoil / exposed ash, vent embers and local heat';
  let seed = 418;
  const random = () => {
    seed = (1664525 * seed + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const positions = [],
    floors = [];
  for (let i = 0; i < 680; i++) {
    const distance = random() * track.length;
    const frame = track.sample(distance);
    const point = frame.position.clone();
    point.x += (random() - 0.5) * 140;
    point.z += (random() - 0.5) * 140;
    // A road overhead shelters the rolled district; emit no ash underneath it.
    point.y += 8 + random() * 58;
    positions.push(...point.toArray());
    floors.push(frame.position.y + 7, frame.up.y < 0 ? 0 : 1);
  }
  const ashGeometry = new T.BufferGeometry();
  ashGeometry.setAttribute(
    'position',
    new T.Float32BufferAttribute(positions, 3),
  );
  ashGeometry.setAttribute(
    'receiving',
    new T.Float32BufferAttribute(floors, 2),
  );
  const ashMaterial = new T.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: { time: { value: 0 }, exposure: { value: 1 } },
    vertexShader: `uniform float time;uniform float exposure;attribute vec2 receiving;varying float opacity;
      void main(){vec3 p=position;p.x+=sin(time*.16+position.y)*3.;p.y=receiving.x+mod(position.y-receiving.x-time*1.3+600.,60.);
      vec4 v=modelViewMatrix*vec4(p,1.);gl_Position=projectionMatrix*v;gl_PointSize=clamp(210./max(1.,-v.z),1.,3.);
      opacity=receiving.y*.26*(1.-smoothstep(160.,650.,-v.z))*mix(exposure,1.,smoothstep(100.,220.,-v.z));}`,
    fragmentShader: `varying float opacity;void main(){float r=length(gl_PointCoord-.5)*2.;if(r>1.)discard;gl_FragColor=vec4(.56,.62,.70,opacity*(1.-r));
      #include <tonemapping_fragment>
      #include <colorspace_fragment>}`,
  });
  const ash = new T.Points(ashGeometry, ashMaterial);
  ash.frustumCulled = false;
  group.add(ash);
  const emberPositions = [];
  for (let i = 0; i < 120; i++)
    emberPositions.push(random(), random(), random());
  const emberGeometry = new T.BufferGeometry();
  emberGeometry.setAttribute(
    'position',
    new T.Float32BufferAttribute(emberPositions, 3),
  );
  const emberMaterial = new T.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: T.AdditiveBlending,
    uniforms: { time: { value: 0 }, eruption: { value: 0 } },
    vertexShader: `uniform float time;uniform float eruption;varying float opacity;void main(){float age=fract(position.y+time*.19);float angle=position.x*6.283185+age*.4;
      vec3 p=vec3(cos(angle),0.,sin(angle))*(8.+position.z*28.+age*12.);p.y=age*(65.+position.z*110.);vec4 v=modelViewMatrix*vec4(p,1.);gl_Position=projectionMatrix*v;
      gl_PointSize=clamp(350./max(1.,-v.z),1.,4.);opacity=eruption*(1.-age)*.65;}`,
    fragmentShader: `varying float opacity;void main(){float r=length(gl_PointCoord-.5)*2.;if(r>1.)discard;gl_FragColor=vec4(1.,.27,.035,opacity*(1.-r));
      #include <tonemapping_fragment>
      #include <colorspace_fragment>}`,
  });
  const embers = new T.Points(emberGeometry, emberMaterial);
  embers.position.copy(ventPosition);
  embers.frustumCulled = false;
  group.add(embers);
  const heatMaterial = new T.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: T.DoubleSide,
    uniforms: { time: { value: 0 }, eruption: { value: 0 } },
    vertexShader: `varying vec2 heatUv;void main(){heatUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
    fragmentShader: `varying vec2 heatUv;uniform float time;uniform float eruption;void main(){vec2 p=heatUv;float envelope=sin(p.x*3.14159)*sin(p.y*3.14159);
      float wave=sin(p.y*54.-time*1.5+sin(p.x*32.+time)*2.);float alpha=pow(max(0.,wave),8.)*envelope*.028*eruption;
      gl_FragColor=vec4(.62,.65,.69,alpha);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>}`,
  });
  const heat = new T.Mesh(new T.PlaneGeometry(74, 105), heatMaterial);
  heat.position.copy(ventPosition).add(new T.Vector3(0, 60, 0));
  group.add(heat);
  const plumeTime = { value: 0 };
  const { geometry: plumeGeometry, material: plumeMaterial } =
    createCindercoilPlumeResources({ time: plumeTime });
  const ventPlume = new T.InstancedMesh(plumeGeometry, plumeMaterial, 16);
  const rupturePlume = new T.InstancedMesh(
    plumeGeometry,
    plumeMaterial.clone(),
    16,
  );
  rupturePlume.material.onBeforeCompile = plumeMaterial.onBeforeCompile;
  const plumePose = new T.Object3D();
  const ruptureSource = new T.Vector3(...track.landmarks.rupture.position);
  ruptureSource.y = track.landmarks.basin.lakeY + 260;
  for (const [field, source] of [
    [ventPlume, ventPosition],
    [rupturePlume, ruptureSource],
  ]) {
    field.name =
      field === ventPlume
        ? 'Cindercoil / source vent ash plume'
        : 'Cindercoil / fault ash plume';
    field.frustumCulled = false;
    for (let i = 0; i < 16; i++) {
      const row = i % 8,
        side = i < 8 ? -1 : 1;
      // Keep the vent plume downwind of the gap and receiving shelf.
      plumePose.position
        .copy(source)
        .add(
          new T.Vector3(24 + row * 8 + side * 19, 35 + row * 31, 55 + row * 9),
        );
      const size = 17 + row * 4.5;
      plumePose.scale.set(size * 1.2, size, size * 0.86);
      plumePose.rotation.set(i * 0.4, i * 1.2, i * 0.7);
      plumePose.updateMatrix();
      field.setMatrixAt(i, plumePose.matrix);
    }
    group.add(field);
  }
  return {
    group,
    update({ state, time = 0, settings = {}, camera } = {}) {
      const exposure = state
        ? sampleCindercoilAtmosphere(track, state)
        : { ash: 0 };
      const event = sampleCindercoilEvent(time);
      ash.visible = !settings.reducedMotion;
      ashMaterial.uniforms.time.value = time;
      ashMaterial.uniforms.exposure.value = exposure.ash;
      ashGeometry.setDrawRange(0, settings.quality === 'low' ? 180 : 680);
      embers.visible = !settings.reducedMotion && event.vent > 0;
      emberMaterial.uniforms.time.value = time;
      emberMaterial.uniforms.eruption.value = event.vent;
      emberGeometry.setDrawRange(0, settings.quality === 'low' ? 28 : 120);
      heat.visible =
        !settings.reducedMotion && settings.quality !== 'low' && event.vent > 0;
      heatMaterial.uniforms.time.value = time;
      heatMaterial.uniforms.eruption.value = event.vent;
      if (camera) heat.quaternion.copy(camera.quaternion);
      plumeTime.value = settings.reducedMotion ? 0 : time;
      ventPlume.material.opacity = 0.045 + event.vent * 0.13;
      rupturePlume.material.opacity = 0.045 + event.rupture * 0.09;
      ventPlume.count = rupturePlume.count =
        settings.quality === 'low' ? 8 : 16;
    },
  };
}
