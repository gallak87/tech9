import * as T from 'three';

const amber = 0xff9b32,
  white = 0xfff4d5;
const clamp = T.MathUtils.clamp;

// Encounter effects observe the real mission/combat ledger. The authored ships,
// their contact hulls and ordinary weapons keep their own materials and rules.
export function createInterceptorEffects({
  scene,
  track,
  bossId,
  boss,
  racers,
  combat,
}) {
  const root = new T.Group(),
    mounted = new T.Group();
  root.visible = mounted.visible = false;
  root.name = 'Interceptor / physical attack signals';
  mounted.name = 'Interceptor / pressure machinery';
  scene.add(root);
  boss.add(mounted);
  const geometries = new Set(),
    materials = new Set();
  const geometry = (g) => {
    geometries.add(g);
    return g;
  };
  const mat = (color, opacity = 1, additive = false) => {
    const m =
      opacity === 1 && !additive
        ? new T.MeshStandardMaterial({
            color,
            roughness: 0.38,
            metalness: 0.55,
          })
        : new T.MeshBasicMaterial({
            color,
            transparent: true,
            opacity,
            depthWrite: false,
            toneMapped: false,
            side: T.DoubleSide,
            blending: additive ? T.AdditiveBlending : T.NormalBlending,
          });
    materials.add(m);
    return m;
  };
  const box = geometry(new T.BoxGeometry(1, 1, 1));
  const mesh = (parent, g, material, scale, position) => {
    const object = new T.Mesh(g, material);
    object.scale.set(...scale);
    object.position.set(...position);
    object.castShadow = object.receiveShadow = !material.transparent;
    object.userData.aoExclude = object.userData.reflectionExclude = true;
    parent.add(object);
    return object;
  };
  // A single short white response includes instanced armor, unlike a regular
  // Mesh copy of an InstancedMesh. Geometry is borrowed, instance buffers owned.
  const hitGroup = new T.Group();
  hitGroup.name = 'Boss / white armor hit';
  const hitMaterial = mat(0xffffff, 0);
  hitMaterial.polygonOffset = true;
  hitMaterial.polygonOffsetFactor = -2;
  const parts = [],
    power = new Map();
  boss.traverse((source) => {
    if (
      !source.isMesh ||
      source.userData.aoExclude ||
      source.userData.exhaustHeat
    )
      return;
    if ([source.material].flat().every((m) => m.transparent)) return;
    for (const material of [source.material].flat())
      if (material.emissive?.getHex() && !power.has(material))
        power.set(material, material.emissiveIntensity);
    const copy = source.isInstancedMesh
      ? new T.InstancedMesh(source.geometry, hitMaterial, source.count)
      : new T.Mesh(source.geometry, hitMaterial);
    if (source.isInstancedMesh) copy.instanceMatrix.copy(source.instanceMatrix);
    copy.matrixAutoUpdate = false;
    copy.frustumCulled = false;
    hitGroup.add(copy);
    parts.push({ source, copy });
  });
  mounted.add(hitGroup);
  const inverse = new T.Matrix4();
  const pressure = mat(amber, 0.8, true),
    dark = mat(0x14232c),
    ceramic = mat(0xddd6bf);
  const machinery = new T.Group();
  mounted.add(machinery);
  machinery.visible = bossId === 'goliath';
  const barrels = [],
    bars = [],
    jets = [];
  if (bossId === 'goliath') {
    const tube = geometry(new T.CylinderGeometry(0.9, 1.15, 3.8, 12, 1, true));
    for (const side of [-1, 1]) {
      const barrel = new T.Group();
      barrel.position.set(side * 4.8, 1.6, 18.3);
      machinery.add(barrel);
      barrels.push(barrel);
      const casing = mesh(barrel, tube, ceramic, [1, 1, 1], [0, 0, 0]);
      casing.rotation.x = Math.PI / 2;
      const lip = mesh(
        barrel,
        geometry(new T.RingGeometry(0.66, 0.95, 12)),
        dark,
        [1, 1, 1],
        [0, 0, 1.93],
      );
      lip.rotation.y = Math.PI;
      mesh(barrel, box, dark, [2.5, 0.65, 4.3], [0, -0.7, -0.6]);
      mesh(barrel, box, pressure, [0.45, 0.45, 3.9], [0, 0, 0]);
      for (let i = 0; i < 7; i++)
        bars.push(
          mesh(
            machinery,
            box,
            pressure,
            [0.18, 0.3, 1.5],
            [side * 7.65, 2.1, -14 + i * 4.5],
          ),
        );
    }
    const cone = geometry(new T.ConeGeometry(0.65, 5, 8, 1, true));
    for (const side of [-1, 1])
      for (const end of [-1, 1]) {
        const group = new T.Group();
        group.position.set(side * 7.8, 1.1, end * 11);
        const signal = mat(0x91d9ff, 0.5, true);
        const plume = mesh(group, cone, signal, [1, 1, 1], [side * 2.5, 0, 0]);
        plume.rotation.z = (-side * Math.PI) / 2;
        machinery.add(group);
        jets.push({ group, side, end, signal });
      }
  }
  const core = new T.Group();
  core.position.set(0, 1.1, -19.05);
  machinery.add(core);
  mesh(
    core,
    geometry(new T.TorusGeometry(1.3, 0.16, 6, 12)),
    dark,
    [1, 1, 1],
    [0, 0, 0],
  );
  const coreGlow = mesh(
    core,
    geometry(new T.CircleGeometry(1.2, 16)),
    pressure,
    [1, 1, 1],
    [0, 0, -0.04],
  );
  coreGlow.rotation.y = Math.PI;
  const shutters = [-1, 1].map((side) =>
    mesh(core, box, dark, [1.15, 2.25, 0.16], [side * 0.58, 0, -0.12]),
  );
  for (const side of [-1, 1])
    for (const y of [-0.65, 0, 0.65])
      mesh(core, box, ceramic, [0.12, 0.1, 0.24], [side * 1.25, y, -0.13]);
  const ventMaterial = new T.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: T.AdditiveBlending,
    side: T.DoubleSide,
    toneMapped: false,
    uniforms: { time: { value: 0 }, strength: { value: 0 } },
    vertexShader:
      'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
    fragmentShader: `varying vec2 vUv;uniform float time,strength;
      void main(){float ribs=.8+.2*sin(vUv.y*18.-time*7.);
      float fade=pow(1.-vUv.y,1.6);vec3 c=mix(vec3(1.8,.45,.08),vec3(2.,1.7,.8),fade);
      gl_FragColor=vec4(c,fade*ribs*strength*.35);}`,
  });
  materials.add(ventMaterial);
  const vent = mesh(
    core,
    geometry(new T.CylinderGeometry(1.3, 0.35, 4, 16, 1, true)),
    ventMaterial,
    [1, 1, 1],
    [0, 0, -2.1],
  );
  vent.rotation.x = -Math.PI / 2;
  const muzzleBursts = barrels.map((barrel) => {
    const material = ventMaterial.clone();
    materials.add(material);
    const object = mesh(
      barrel,
      geometry(new T.CylinderGeometry(1.5, 0.3, 4, 12, 1, true)),
      material,
      [1, 1, 1],
      [0, 0, 4],
    );
    object.rotation.x = Math.PI / 2;
    return { object, material };
  });
  const returnMaterial = mat(0xffc05b, 0.7, true);
  const returnBeads = Array.from({ length: 14 }, () =>
    mesh(root, box, returnMaterial, [0.18, 0.18, 0.5], [0, 0, 0]),
  );
  const smokeMaterial = new T.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: T.DoubleSide,
    uniforms: { age: { value: 0 }, motion: { value: 1 } },
    vertexShader:
      'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
    fragmentShader: `varying vec2 vUv;uniform float age,motion;void main(){vec2 p=vUv*2.-1.;
      p.x+=sin(p.y*8.+age*4.*motion)*.13;float a=(1.-smoothstep(.2,1.,length(p*vec2(1.,.7))))*.27*max(0.,1.-age/2.);
      gl_FragColor=vec4(mix(vec3(.12,.15,.17),vec3(.45,.4,.3),vUv.y),a);}`,
  });
  materials.add(smokeMaterial);
  const smoke = Array.from({ length: 4 }, () =>
    mesh(
      root,
      geometry(new T.PlaneGeometry(1, 1)),
      smokeMaterial,
      [1, 1, 1],
      [0, 0, 0],
    ),
  );
  const laneMaterial = mat(0xffffff, 0.5, true);
  laneMaterial.vertexColors = true;
  const laneGeometry = geometry(new T.BufferGeometry());
  const lanePositions = new Float32Array(2 * 24 * 2 * 6 * 3);
  const laneColors = new Float32Array(lanePositions.length);
  laneGeometry.setAttribute(
    'position',
    new T.BufferAttribute(lanePositions, 3),
  );
  laneGeometry.setAttribute('color', new T.BufferAttribute(laneColors, 3));
  const lanes = new T.Mesh(laneGeometry, laneMaterial);
  lanes.frustumCulled = false;
  lanes.name = 'Goliath / locked firing lanes';
  root.add(lanes);
  const impacts = Array.from({ length: 8 }, () => {
    const group = new T.Group();
    root.add(group);
    const material = mat(white, 0, true),
      blades = [];
    for (let i = 0; i < 5; i++) {
      const blade = mesh(group, box, material, [0.14, 0.14, 1], [0, 0, 0]);
      blades.push(blade);
    }
    return { group, material, blades };
  });
  const bolts = Array.from({ length: 12 }, () => {
    const group = new T.Group();
    root.add(group);
    const material = mat(amber, 0.7, true);
    mesh(group, box, material, [1.8, 0.55, 7], [0, 0, -3]);
    mesh(group, box, mat(white, 0.9, true), [0.65, 0.25, 5], [0, 0, -1]);
    return group;
  });
  let disposed = false,
    disableAge = 0,
    wasDisabled = false;
  function update(frame) {
    if (disposed) return;
    const data = frame.interceptor;
    const disabled = !!(data?.result?.won && data.health === 0);
    if (wasDisabled && !disabled) {
      for (const [material, base] of power) material.emissiveIntensity = base;
      wasDisabled = false;
      disableAge = 0;
    }
    const active =
      !!data &&
      (['racing', 'paused', 'countdown'].includes(frame.mode) ||
        (frame.mode === 'results' && disabled));
    root.visible = mounted.visible = active;
    if (!active) return;
    disableAge = disabled
      ? wasDisabled
        ? disableAge + Math.max(0, frame.presentationDt ?? 0)
        : 0
      : 0;
    wasDisabled = disabled;
    if (disabled)
      for (const [material, base] of power)
        material.emissiveIntensity = base * Math.max(0, 1 - disableAge / 0.45);
    const state = combat.view(),
      attack = data.counterattack;
    const reduced = !!frame.settings.reducedMotion;
    const simple = frame.settings.quality === 'low';
    const hit = state.flashes.findLast(
      (f) => f.target === bossId && f.kind !== 'aegis' && f.age < 0.16,
    );
    hitGroup.visible = !!hit && hit.age + disableAge < 0.16;
    if (hitGroup.visible) {
      hitMaterial.opacity =
        (reduced ? 0.17 : 0.8) * (1 - (hit.age + disableAge) / 0.16);
      boss.updateWorldMatrix(true, true);
      inverse.copy(boss.matrixWorld).invert();
      for (const { source, copy } of parts) {
        copy.visible = source.visible;
        copy.matrix.multiplyMatrices(inverse, source.matrixWorld);
      }
    }
    const charge = attack.warning ? (attack.charge ?? 0.8) : 0;
    pressure.color.setHex(
      disabled
        ? disableAge < 0.15
          ? white
          : amber
        : attack.recovered
          ? 0x68baff
          : amber,
    );
    pressure.opacity = disabled
      ? Math.max(0, 1 - disableAge / 0.65)
      : attack.exposed
        ? 0.92
        : attack.recovered
          ? 0.7
          : 0.16 + charge * 0.75;
    bars.forEach((bar, i) => {
      bar.visible = attack.exposed || attack.recovered || charge > (i % 7) / 8;
    });
    const open = disabled
      ? Math.max(0, 1 - disableAge / 0.5)
      : attack.exposed
        ? Math.max(0.45, Math.min(1, attack.phaseElapsed / 0.25))
        : attack.phase === 'turning-forward' && !attack.pressureHits
          ? clamp(attack.phaseElapsed / 0.8, 0, 1) * 0.45
          : 0;
    shutters.forEach((shutter, i) => {
      shutter.position.x = (i ? 1 : -1) * (0.58 + open * 1.4);
    });
    coreGlow.visible = open > 0;
    vent.visible = open > 0;
    ventMaterial.uniforms.strength.value = open;
    ventMaterial.uniforms.time.value =
      reduced || simple ? 0 : data.elapsed + disableAge;
    const propulsion = boss.getObjectByName('Rival / propulsion');
    propulsion?.children.forEach((plume) => {
      if (Math.abs(plume.position.x) < 0.1) plume.visible = !attack.exposed;
    });
    core.scale.setScalar(
      1 + (reduced || simple ? 0 : open * 0.05 * Math.sin(data.elapsed * 8)),
    );
    const turn =
      attack.phase === 'turning-back' || attack.phase === 'turning-forward';
    jets.forEach(({ group, side, end, signal }) => {
      group.visible =
        !disabled &&
        turn &&
        (attack.phase === 'turning-back' ? side !== end : side === end);
      signal.opacity = reduced ? 0.18 : 0.55;
    });
    const firing = state.flashes.findLast(
      (f) => f.signature === 'goliath-pressure' && f.type === 'muzzle',
    );
    const firingSide = firing
      ? new T.Vector3()
          .fromArray(firing.position)
          .sub(boss.position)
          .applyQuaternion(boss.quaternion.clone().invert()).x
      : 0;
    barrels.forEach((barrel, i) => {
      const recoil =
        firing && Math.sign(firingSide) === (i ? 1 : -1)
          ? Math.exp(-firing.age * 13)
          : firing
            ? Math.exp(-firing.age * 13) * 0.3
            : 0;
      barrel.position.z = 18.3 - recoil * 0.85;
      const burst = muzzleBursts[i];
      burst.object.visible =
        !disabled &&
        !!firing &&
        firing.age < 0.18 &&
        Math.sign(firingSide) === (i ? 1 : -1);
      burst.material.uniforms.strength.value = burst.object.visible
        ? Math.max(0, 1 - firing.age / 0.18) * (reduced ? 0.45 : 1.1)
        : 0;
      burst.material.uniforms.time.value = reduced || simple ? 0 : data.elapsed;
    });
    // Borders follow the same sampled road and frozen aim lanes as the real
    // cannon. The centre stays open so bends, pickups and other racers read.
    let cursor = 0;
    const target = racers.opponents.find((r) => r.specification.id === bossId);
    const aimLanes =
      !disabled &&
      bossId === 'goliath' &&
      attack.warning &&
      attack.shots < attack.blasts
        ? attack.aimLanes?.length
          ? attack.aimLanes
          : [attack.aimLane ?? frame.state.lateral]
        : [];
    for (const [laneIndex, lane] of aimLanes.entries())
      for (let n = 0; n < 24; n++) {
        const start = target.state.distance - 110 + n * 4;
        for (const side of [-1, 1]) {
          const a = track.sample(start),
            b = track.sample(start + 3.6);
          const activeLane = laneIndex === (attack.nextShot ?? 0);
          const strength = attack.locked ? (activeLane ? 1.4 : 0.16) : 0.45;
          const x = lane + side * 2.8,
            width = activeLane && attack.locked ? 0.35 : 0.14;
          const points = [
            a.position
              .clone()
              .addScaledVector(a.right, x - width)
              .addScaledVector(a.up, 0.12),
            a.position
              .clone()
              .addScaledVector(a.right, x + width)
              .addScaledVector(a.up, 0.12),
            b.position
              .clone()
              .addScaledVector(b.right, x - width)
              .addScaledVector(b.up, 0.12),
            b.position
              .clone()
              .addScaledVector(b.right, x + width)
              .addScaledVector(b.up, 0.12),
          ];
          for (const v of [0, 2, 1, 1, 2, 3]) {
            points[v].toArray(lanePositions, cursor);
            laneColors.set(
              [strength, strength * (activeLane ? 0.6 : 0.32), strength * 0.12],
              cursor,
            );
            cursor += 3;
          }
        }
      }
    lanes.visible = cursor > 0;
    laneGeometry.setDrawRange(0, cursor / 3);
    laneGeometry.attributes.position.needsUpdate = true;
    laneGeometry.attributes.color.needsUpdate = true;
    laneMaterial.opacity = attack.locked ? 0.75 : 0.3;
    const signatureFlashes = disabled
      ? []
      : state.flashes.filter((f) => f.signature === 'goliath-pressure');
    smokeMaterial.uniforms.age.value = disableAge;
    smokeMaterial.uniforms.motion.value = reduced || simple ? 0 : 1;
    smoke.forEach((sheet, i) => {
      sheet.visible = disabled && disableAge > 0 && disableAge < 2;
      if (!sheet.visible) return;
      sheet.position
        .set((i - 1.5) * 0.9, 1.2, -19.6)
        .applyQuaternion(boss.quaternion)
        .add(boss.position);
      sheet.position.y += reduced ? 0 : disableAge * (1 + i * 0.2);
      sheet.scale.set(
        reduced ? 2.4 : 1.6 + disableAge,
        reduced ? 3.6 : 2 + disableAge * 2,
        1,
      );
      if (frame.camera) sheet.quaternion.copy(frame.camera.quaternion);
    });
    const returned = signatureFlashes.findLast(
      (f) => f.target === 'player' && f.kind !== 'aegis' && f.age < 0.5,
    );
    returnBeads.forEach((bead, i) => {
      const count = reduced || simple ? 6 : returnBeads.length;
      bead.visible = !!returned && i < count;
      if (!bead.visible) return;
      const start = frame.ship.group.position
        .clone()
        .add(new T.Vector3(0, 0.7, 0));
      const end = new T.Vector3(i % 2 ? 7.5 : -7.5, 2, 9)
        .applyQuaternion(boss.quaternion)
        .add(boss.position);
      const t = (i / count + (reduced ? 0 : returned.age * 2)) % 1;
      bead.position.lerpVectors(start, end, t);
      bead.quaternion.setFromUnitVectors(
        new T.Vector3(0, 0, 1),
        end.sub(start).normalize(),
      );
      bead.scale
        .set(0.18, 0.18, 0.5)
        .multiplyScalar(0.5 + Math.sin(t * Math.PI));
      returnMaterial.opacity =
        (1 - returned.age / 0.5) * (reduced ? 0.25 : 0.75);
    });
    impacts.forEach((entry, i) => {
      const flash = signatureFlashes[i];
      entry.group.visible = !!flash;
      if (!flash) return;
      const age = flash.age,
        muzzle = flash.type === 'muzzle';
      entry.group.position.fromArray(flash.position);
      entry.group.quaternion.fromArray(flash.quaternion);
      entry.material.opacity =
        Math.max(0, 1 - age / (muzzle ? 0.18 : 0.4)) * (reduced ? 0.35 : 1);
      entry.blades.forEach((blade, n) => {
        blade.visible = !simple || n < 2;
        const angle = (n * Math.PI * 2) / entry.blades.length;
        const radius = reduced ? 0.25 : age * 8;
        blade.position.set(
          Math.cos(angle) * radius,
          Math.sin(angle) * radius,
          0,
        );
        blade.scale.set(
          muzzle ? 0.2 : 0.1,
          muzzle ? 0.2 : 0.1,
          (muzzle ? 5 : 3) * (1 - age / 0.55),
        );
        blade.rotation.z = angle;
      });
    });
    const shots = disabled
      ? []
      : state.shots.filter((s) => s.signature === 'goliath-pressure');
    bolts.forEach((group, i) => {
      group.children[1].visible = !simple;
      const shot = shots[i];
      group.visible = !!shot;
      if (shot) {
        group.position.fromArray(shot.position);
        group.quaternion.fromArray(shot.quaternion);
      }
    });
  }
  return {
    update,
    reset() {
      root.visible = mounted.visible = false;
      disableAge = 0;
      wasDisabled = false;
      for (const [material, base] of power) material.emissiveIntensity = base;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const [material, base] of power) material.emissiveIntensity = base;
      root.removeFromParent();
      mounted.removeFromParent();
      for (const { copy } of parts) if (copy.isInstancedMesh) copy.dispose();
      geometries.forEach((g) => g.dispose());
      materials.forEach((m) => m.dispose());
      root.clear();
      mounted.clear();
    },
  };
}
