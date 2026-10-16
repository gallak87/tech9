import * as T from 'three';
import { finishNightweirMetal } from './materials.js';

// The electrical restoration moves ahead of the driver through the real city.
// A monotone route envelope prevents a returning bend from switching rooms off.
export function createNightweirBlackstart(track, kit) {
  const group = new T.Group();
  group.name = 'Nightweir / Blackstart generating machinery';
  const front = { value: track.sample(0).position.z },
    distance = { value: 0 };
  const envelope = [];
  let reach = -Infinity;
  for (let s = 0; s <= track.length + 50; s += 50) {
    reach = Math.max(reach, track.sample(Math.min(s, track.length)).position.z);
    envelope.push(reach);
  }
  const records = kit.turbines ?? [];
  const metal = new T.MeshStandardMaterial({
    name: 'Nightweir / Blackstart machined impellers',
    color: '#4e6468',
    roughness: 0.48,
    metalness: 0.48,
  });
  finishNightweirMetal(metal);
  // Thick swept vanes expose a curved leading edge and narrow tips; the
  // machine reads as a cast impeller rather than nine rectangular paddles.
  const vane = new T.Shape();
  vane.moveTo(-0.31, -0.5);
  vane.bezierCurveTo(-0.46, -0.18, -0.24, 0.24, 0.06, 0.5);
  vane.lineTo(0.3, 0.43);
  vane.bezierCurveTo(0.04, 0.14, -0.03, -0.22, 0.19, -0.5);
  vane.closePath();
  const bladeGeometry = new T.ExtrudeGeometry(vane, {
      depth: 0.74,
      steps: 1,
      bevelEnabled: true,
      bevelThickness: 0.09,
      bevelSize: 0.04,
      bevelSegments: 2,
      curveSegments: 8,
    }),
    hubGeometry = new T.CylinderGeometry(0.72, 1.16, 1, 48),
    collarGeometry = new T.TorusGeometry(1, 0.052, 8, 48);
  bladeGeometry.translate(0, 0, -0.37);
  hubGeometry.rotateX(Math.PI / 2);
  const blades = new T.InstancedMesh(bladeGeometry, metal, records.length * 9),
    hubs = new T.InstancedMesh(hubGeometry, metal, records.length),
    collars = new T.InstancedMesh(collarGeometry, metal, records.length);
  blades.name = 'Nightweir / active generating rotors';
  hubs.name = 'Nightweir / turbine shaft bosses';
  collars.name = 'Nightweir / machined shaft collars';
  blades.castShadow = hubs.castShadow = collars.castShadow = true;
  blades.receiveShadow = hubs.receiveShadow = collars.receiveShadow = true;
  group.add(blades, hubs, collars);
  const m = new T.Matrix4(),
    z = new T.Vector3(0, 0, 1),
    q = new T.Quaternion(),
    spin = new T.Quaternion(),
    pitch = new T.Quaternion().setFromAxisAngle(z, -0.24),
    v = new T.Vector3(),
    size = new T.Vector3();
  const machines = records.map((r, i) => {
    const center = new T.Vector3(...r.p),
      axis = new T.Vector3(...r.axis).normalize(),
      basis = new T.Quaternion().setFromUnitVectors(z, axis);
    m.compose(center, basis, size.set(r.radius * 0.24, r.radius * 0.24, 4.8));
    hubs.setMatrixAt(i, m);
    m.compose(
      center.clone().addScaledVector(axis, 2.7),
      basis,
      size.setScalar(r.radius * 0.27),
    );
    collars.setMatrixAt(i, m);
    return { ...r, center, axis, basis, angle: 0 };
  });
  hubs.instanceMatrix.needsUpdate = collars.instanceMatrix.needsUpdate = true;
  let disposed = false,
    previousTime = null;
  function update(frame = {}) {
    if (disposed) return;
    const s = T.MathUtils.clamp(frame.state?.distance ?? 0, 0, track.length);
    distance.value = s;
    const ahead = Math.min(envelope.length - 1, (s + 1200) / 50),
      index = Math.floor(ahead);
    front.value =
      envelope[index] +
      (envelope[Math.min(index + 1, envelope.length - 1)] - envelope[index]) *
        (ahead - index);
    group.userData.front = front.value;
    group.userData.power = s / track.finishDistance;
    const time = frame.settings?.reducedMotion ? 0 : (frame.time ?? 0);
    const elapsed =
      previousTime === null || frame.reset || time < previousTime
        ? 0
        : Math.min(0.1, time - previousTime);
    if (frame.reset || (previousTime !== null && time < previousTime))
      for (const r of machines) r.angle = 0;
    previousTime = time;
    machines.forEach((r, i) => {
      const active = T.MathUtils.smoothstep(
        s,
        r.distance - 900,
        r.distance - 250,
      );
      r.angle += elapsed * 0.28 * active;
      for (let k = 0; k < 9; k++) {
        const angle = (k * Math.PI * 2) / 9 + r.angle;
        spin.setFromAxisAngle(z, angle);
        q.copy(r.basis).multiply(spin);
        v.set(0, r.radius * 0.58, 1.4)
          .applyQuaternion(q)
          .add(r.center);
        // Swept, thick blades read as heavy hydraulic machinery at race scale.
        q.multiply(pitch);
        m.compose(v, q, size.set(r.radius * 0.17, r.radius * 0.67, 2.6));
        blades.setMatrixAt(i * 9 + k, m);
      }
    });
    blades.instanceMatrix.needsUpdate = true;
  }
  update();
  blades.computeBoundingSphere();
  hubs.computeBoundingSphere();
  collars.computeBoundingSphere();
  // The bound must include all angular positions, not only the initial spokes.
  if (blades.boundingSphere) blades.boundingSphere.radius += 50;
  return {
    group,
    uniforms: { front, distance },
    update,
    setReflection(texture) {
      metal.envMap = texture;
      metal.envMapIntensity = 0.7;
      metal.needsUpdate = true;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      blades.dispose();
      hubs.dispose();
      collars.dispose();
      bladeGeometry.dispose();
      hubGeometry.dispose();
      collarGeometry.dispose();
      metal.dispose();
      group.clear();
    },
  };
}

// Each glazed opening owns normalized local UVs authored in Blender. The view-
// dependent interior sits behind reflected glass; masonry remains real geometry.
export function finishNightweirWindows(material, uniforms) {
  const occupied = !/recessed blue glass/.test(material.name);
  const pale = /occupied pale rooms/.test(material.name);
  material.roughness = 0.3;
  material.metalness = 0.12;
  material.envMapIntensity = 0.6;
  material.onBeforeCompile = (shader) => {
    shader.uniforms.nwPowerFront = uniforms.front;
    shader.vertexShader =
      'varying vec2 nwPane;varying vec3 nwWindowPoint;varying vec3 nwWindowNormal;\n' +
      shader.vertexShader.replace(
        '#include <begin_vertex>',
        '#include <begin_vertex>\nnwPane=vec2(uv.x,1.-uv.y);nwWindowPoint=(modelMatrix*vec4(position,1.)).xyz;nwWindowNormal=normalize(mat3(modelMatrix)*normal);',
      );
    shader.fragmentShader =
      'varying vec2 nwPane;varying vec3 nwWindowPoint;varying vec3 nwWindowNormal;uniform float nwPowerFront;\n' +
      shader.fragmentShader
        .replace(
          '#include <color_fragment>',
          `#include <color_fragment>
        vec3 wn=normalize(nwWindowNormal), eye=normalize(cameraPosition-nwWindowPoint);
        vec3 across=normalize(cross(vec3(0.,1.,0.),wn)+vec3(.00001,0.,0.));
        vec2 parallax=vec2(dot(eye,across),eye.y)/max(abs(dot(eye,wn)),.3);
        vec2 inside=nwPane+clamp(parallax,vec2(-2.),vec2(2.))*.12;
        float border=max(abs(inside.x-.5),abs(inside.y-.5));
        float room=1.-smoothstep(.40,.50,border);
        float ceiling=smoothstep(.75,.9,inside.y);
        float curtain=(1.-smoothstep(.12,.28,inside.x))+smoothstep(.76,.88,inside.x);
        float pleats=.87+.13*sin(inside.x*95.);
        float furniture=(1.-smoothstep(.18,.23,inside.y))*smoothstep(.2,.3,inside.x)*(1.-smoothstep(.68,.75,inside.x));
        float power=smoothstep(nwWindowPoint.z-90.,nwWindowPoint.z+90.,nwPowerFront);
        vec3 roomColor=mix(${pale ? 'vec3(.16,.20,.19),vec3(.38,.46,.43)' : 'vec3(.24,.125,.05),vec3(.70,.40,.16)'},ceiling*.6);
        roomColor=mix(roomColor,vec3(.42,.38,.31)*pleats,clamp(curtain,0.,1.)*.75);
        roomColor*=1.-furniture*.78;
        // Broad groups of occupied rooms establish floors and households;
        // individual panes retain their authored variation inside each group.
        float habitation=mix(.38,1.,smoothstep(-.25,.45,
          sin(nwWindowPoint.y*.26+sin(nwWindowPoint.x*.032+nwWindowPoint.z*.026)*2.4)));
        diffuseColor.rgb=mix(vec3(.018,.035,.041),roomColor,room*.18);
      `,
        )
        .replace(
          '#include <emissivemap_fragment>',
          `#include <emissivemap_fragment>
        totalEmissiveRadiance=${occupied ? 'roomColor*room*(.04+power*.72)*habitation*(1.-curtain*.25)' : 'roomColor*room*.012'};
        #if defined(USE_COLOR) || defined(USE_COLOR_ALPHA)
          totalEmissiveRadiance *= vColor.rgb;
        #endif
      `,
        );
  };
  material.customProgramCacheKey = () =>
    'nightweir-recessed-room-v4-' + occupied + '-' + pale;
}
