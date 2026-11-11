import * as T from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { aimBulwarkSlab } from './interceptor-aim.js';

// Diegetic signals follow the real drive, contact and projectile owners. The
// shoulder rings surround the existing exhaust mouths; they do not cover them.
export function createBulwarkEffects({ scene, boss, track, combat, racers }) {
  const mount = new T.Group(),
    world = new T.Group();
  mount.name = 'Bulwark / breakwater hardware';
  world.name = 'Bulwark / physical breaker signals';
  mount.visible = world.visible = false;
  boss.add(mount);
  scene.add(world);
  const geometries = new Set(),
    materials = new Set();
  const geo = (value) => (geometries.add(value), value);
  const metal = (color, roughness = 0.35) => {
    const m = new T.MeshStandardMaterial({ color, roughness, metalness: 0.65 });
    materials.add(m);
    return m;
  };
  const light = (color, opacity = 0.8) => {
    const m = new T.MeshBasicMaterial({
      color,
      transparent: true,
      opacity,
      depthWrite: false,
      toneMapped: false,
      side: T.DoubleSide,
      blending: T.AdditiveBlending,
    });
    materials.add(m);
    return m;
  };
  const shell = geo(new RoundedBoxGeometry(1, 1, 1, 2, 0.08));
  const mesh = (
    parent,
    geometry,
    material,
    position = [0, 0, 0],
    scale = [1, 1, 1],
  ) => {
    const o = new T.Mesh(geometry, material);
    o.position.set(...position);
    o.scale.set(...scale);
    o.userData.aoExclude = o.userData.reflectionExclude = true;
    o.castShadow = o.receiveShadow = !material.transparent;
    parent.add(o);
    return o;
  };
  const dark = metal(0x293433),
    brass = metal(0xa58b51),
    porcelain = metal(0xcacbb7, 0.29);
  const rim = geo(new T.TorusGeometry(1.07, 0.11, 6, 8));
  const socket = geo(new T.TorusGeometry(1.13, 0.14, 6, 8));
  const ventGeometry = geo(new T.CylinderGeometry(0.03, 0.3, 2.2, 8, 1, true));
  const shoulders = [-1, 1].map((side) => {
    const g = new T.Group();
    g.name = `Bulwark / ${side < 0 ? 'port' : 'starboard'} wake emitter`;
    g.position.set(side * 4.2, 1.1, -10.12);
    mount.add(g);
    mesh(g, socket, dark);
    mesh(g, rim, brass, [0, 0, -0.08]);
    const signal = light(0xd3ffc4),
      energy = mesh(g, rim, signal, [0, 0, -0.15], [0.87, 0.87, 1]);
    const vanes = Array.from({ length: 8 }, (_, i) => {
      const a = (i * Math.PI) / 4,
        o = mesh(
          g,
          shell,
          porcelain,
          [Math.cos(a) * 1.14, Math.sin(a) * 1.14, -0.13],
          [0.24, 0.1, 0.18],
        );
      o.rotation.z = a;
      return { o, a };
    });
    const ventMaterial = light(0xd5ecc4, 0);
    const vent = mesh(g, ventGeometry, ventMaterial, [side * 0.6, 0.35, -0.35]);
    vent.quaternion.setFromUnitVectors(
      new T.Vector3(0, 1, 0),
      new T.Vector3(side, 0.4, -0.5).normalize(),
    );
    vent.name = 'Bulwark / local pressure release';
    return { g, side, signal, energy, vanes, vent, ventMaterial };
  });
  const muzzleLight = light(0xd9f7b9);
  for (const side of [-1, 1]) {
    const socket = mesh(
      mount,
      shell,
      dark,
      [side * 4.7, 2.25, 8.33],
      [1.15, 0.65, 0.8],
    );
    socket.name = 'Bulwark / shield-mounted pressure port';
    mesh(mount, shell, brass, [side * 4.7, 2.25, 8.72], [0.9, 0.42, 0.12]);
    mesh(
      mount,
      shell,
      muzzleLight,
      [side * 4.7, 2.25, 8.8],
      [0.67, 0.13, 0.03],
    );
  }
  const slab = geo(new T.OctahedronGeometry(1, 0));
  slab.scale(0.85, 0.23, 0.85);
  slab.translate(0, 0, -0.85);
  const slugGlow = light(0xc7f3b4),
    slugCore = light(0xffffdb);
  const slugBody = geo(new T.CapsuleGeometry(0.32, 0.7, 3, 8));
  slugBody.rotateX(Math.PI / 2);
  slugBody.translate(0, 0, -0.67);
  const tailGeometry = geo(new T.PlaneGeometry(1.15, 4));
  tailGeometry.rotateX(Math.PI / 2);
  const tailMaterial = new T.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: T.DoubleSide,
    blending: T.AdditiveBlending,
    toneMapped: false,
    uniforms: { strength: { value: 0.28 } },
    vertexShader:
      'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
    fragmentShader: `varying vec2 vUv;uniform float strength;void main(){
      float edge=pow(max(0.,1.-abs(vUv.x*2.-1.)),2.);
      float taper=pow(max(0.,vUv.y),1.7);
      gl_FragColor=vec4(mix(vec3(.45,.75,.32),vec3(1.,1.,.8),taper),edge*taper*strength);}`,
  });
  materials.add(tailMaterial);
  const shots = Array.from({ length: 12 }, () => {
    const group = new T.Group();
    group.name = 'Bulwark / physical pressure slab';
    world.add(group);
    mesh(group, slugBody, slugGlow, [0, 0, 0], [1.7, 1.2, 1]);
    mesh(group, slugBody, slugCore, [0, 0, 0], [1.1, 0.7, 0.8]);
    mesh(group, tailGeometry, tailMaterial, [0, 0, -2], [1, 1, 1]);
    const cross = mesh(
      group,
      tailGeometry,
      tailMaterial,
      [0, 0, -2],
      [1, 1, 1],
    );
    cross.rotation.z = Math.PI / 2;
    return group;
  });
  const flashes = Array.from({ length: 16 }, () => {
    const group = new T.Group(),
      material = light(0xe1f9c8);
    world.add(group);
    const shards = Array.from({ length: 6 }, () => mesh(group, slab, material));
    return { group, material, shards };
  });
  const warnings = [-1, 1].map(() => {
    const geometry = geo(new T.BufferGeometry());
    geometry.setAttribute(
      'position',
      new T.BufferAttribute(new Float32Array(18), 3),
    );
    const material = light(0xd0eab0, 0.4),
      object = mesh(world, geometry, material);
    object.frustumCulled = false;
    object.name = 'Bulwark / frozen slab path';
    return { object, geometry, material };
  });
  const hot = light(0xf7e1aa),
    burst = new T.Group();
  burst.name = 'Bulwark / ruptured emitter';
  mount.add(burst);
  const fragments = Array.from({ length: 8 }, (_, i) => {
    const o = mesh(
      burst,
      shell,
      i % 2 ? hot : brass,
      [0, 0, 0],
      [0.11, 0.08, 0.4],
    );
    return o;
  });
  const ribbon = (from, to, width, out) => {
    const d = to.clone().sub(from).normalize(),
      up = new T.Vector3(0, 1, 0).applyQuaternion(boss.quaternion);
    const right = new T.Vector3()
      .crossVectors(d, up)
      .normalize()
      .multiplyScalar(width);
    const points = [
      from.clone().sub(right),
      from.clone().add(right),
      to.clone().sub(right),
      to.clone().sub(right),
      from.clone().add(right),
      to.clone().add(right),
    ];
    points.forEach((p, i) => p.toArray(out, i * 3));
  };
  const fanGeometry = geo(new T.PlaneGeometry(2.2, 2.2));
  const rundown = [
    ['L', -4.2, 1.1],
    ['C', 0, 1],
    ['R', 4.2, 1.1],
  ].map(([name, x, y], index) => {
    const anchor = boss.getObjectByName(`Exhaust_${name}`);
    const origin = anchor?.position.clone() ?? new T.Vector3(x, y, -10);
    const material = new T.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      side: T.DoubleSide,
      toneMapped: false,
      uniforms: { strength: { value: 0 }, flow: { value: 0 } },
      vertexShader:
        'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
      fragmentShader: `varying vec2 vUv;uniform float strength,flow;void main(){
        vec2 p=vUv*2.-1.;p.x+=sin(p.y*6.-flow*5.)*.09;
        float haze=(1.-smoothstep(.12,1.,length(p*vec2(.8,1.15))));
        gl_FragColor=vec4(mix(vec3(.28,.33,.28),vec3(.75,.8,.65),vUv.y),haze*haze*strength);}`,
    });
    materials.add(material);
    const lowMaterial = light(0xaeb7a0, 0);
    const object = mesh(mount, fanGeometry, material, origin.toArray());
    object.name = 'Bulwark / pressure rundown fan';
    return { origin, index, object, material, lowMaterial };
  });
  const defeatLight = new Map();
  let disposed = false,
    wasWon = false,
    defeatAge = 0;
  function update(frame) {
    if (disposed) return;
    const data = frame.interceptor,
      attack = data?.counterattack ?? {},
      water = attack.breakwater;
    const live =
      !!data && ['racing', 'paused', 'countdown'].includes(frame.mode);
    const tableau = !!data?.result && frame.mode === 'results',
      won = tableau && data.result.won && data.health === 0;
    if (won && !wasWon)
      shoulders.forEach(({ signal }) =>
        defeatLight.set(signal, signal.opacity),
      );
    if (!won) defeatLight.clear();
    defeatAge = won
      ? wasWon
        ? defeatAge + Math.max(0, frame.presentationDt ?? 0)
        : 0
      : 0;
    wasWon = won;
    mount.visible = live || tableau;
    world.visible = live;
    if (!mount.visible) return;
    const low = frame.settings.quality === 'low',
      reduced = !!frame.settings.reducedMotion;
    const state = combat.view();
    const broken = !!water?.disabled,
      ruptureAge = broken ? data.elapsed - water.stoppedAt : Infinity;
    shoulders.forEach(({ side, signal, energy, vanes, vent, ventMaterial }) => {
      const selected = water?.side === side && attack.phase !== 'idle';
      const energized = live && selected && water?.active && !broken;
      if (!won) signal.color.setHex(energized ? 0x89ffb5 : 0x6c6444);
      signal.opacity = tableau
        ? won
          ? Math.max(0, 1 - defeatAge / 0.5) * (defeatLight.get(signal) ?? 0)
          : 0
        : selected && broken
          ? 0
          : energized
            ? 0.9
            : selected && water?.opensIn > 0
              ? 0.25
              : 0.035;
      energy.scale.setScalar(energized ? 1.02 : 0.87);
      vent.visible = !!(
        live &&
        selected &&
        broken &&
        ruptureAge >= 0.12 &&
        ruptureAge < 1
      );
      ventMaterial.opacity = vent.visible
        ? Math.sin(((ruptureAge - 0.12) / 0.88) * Math.PI) *
          (reduced ? 0.12 : 0.28)
        : 0;
      vent.scale.set(
        0.6,
        reduced ? 0.4 : Math.min(1, (ruptureAge - 0.12) * 5),
        0.6,
      );
      vanes.forEach(({ o, a }) => {
        const settle =
          selected && broken
            ? Math.min(1, Math.max(0, ruptureAge) / 0.25)
            : won
              ? Math.min(1, defeatAge / 0.35)
              : 0;
        o.position.set(
          Math.cos(a) * (1.14 + settle * 0.1),
          Math.sin(a) * (1.14 + settle * 0.1),
          -0.13 + settle * 0.13,
        );
        o.rotation.z = a + settle * 0.3;
        o.material = energized ? signal : dark;
      });
    });
    rundown.forEach(({ origin, index, object, material, lowMaterial }) => {
      const age = defeatAge - index * 0.12;
      object.visible = !!(won && age >= 0 && age < 0.5);
      const strength = object.visible
        ? Math.sin((age / 0.5) * Math.PI) * (reduced ? 0.12 : 0.4)
        : 0;
      material.uniforms.strength.value = strength;
      material.uniforms.flow.value = reduced ? 0 : age;
      lowMaterial.opacity = strength * 0.22;
      object.material = low ? lowMaterial : material;
      object.position
        .copy(origin)
        .add(
          new T.Vector3(
            0,
            reduced ? -0.2 : -0.2 - age * 0.8,
            -0.15 - (reduced ? 0 : age * 3),
          ),
        );
      object.scale.set(1 + age * 0.4, reduced ? 0.45 : 0.35 + age, 1);
    });
    muzzleLight.opacity =
      live && ['telegraph', 'turning-back', 'firing'].includes(attack.phase)
        ? 0.12 + 0.55 * (attack.locked ? 1 : 0.3)
        : live
          ? 0.035
          : 0;
    burst.visible = live && ruptureAge >= 0 && ruptureAge < 0.32;
    if (burst.visible) {
      burst.position.fromArray(water.emitter);
      burst.position.z -= 0.2;
      hot.opacity = (1 - ruptureAge / 0.32) * 0.8;
      fragments.forEach((o, i) => {
        o.visible = !low || i < 4;
        const a = (i * Math.PI) / 4,
          r = (reduced ? 0.1 : 1) * ruptureAge * 4;
        o.position.set(Math.cos(a) * r, Math.sin(a) * r, -ruptureAge * 3);
        o.rotation.set(i * 0.6 + ruptureAge * 4, a, 0);
        o.scale.set(0.11, 0.08, 0.4 * (1 - ruptureAge / 0.32));
      });
    }
    const physical = state.shots.filter((s) => s.signature === 'bulwark-slab');
    shots.forEach((group, i) => {
      const shot = physical[i];
      group.visible = live && !!shot;
      if (!group.visible) return;
      group.position.fromArray(shot.position);
      group.quaternion.fromArray(shot.quaternion);
      group.scale.z = Math.min(
        1,
        Math.max(0, (shot.age * (shot.speed ?? 450)) / 4),
      );
      group.children.forEach((child, n) => (child.visible = !low || n < 2));
    });
    const actualFlashes = state.flashes.filter(
      (f) => f.signature === 'bulwark-slab' && f.kind !== 'aegis',
    );
    flashes.forEach(({ group, material, shards }, i) => {
      const f = actualFlashes[i];
      group.visible = live && !!f && f.age < 0.28;
      if (!group.visible) return;
      group.position.fromArray(f.position);
      group.quaternion.fromArray(f.quaternion);
      material.opacity = (1 - f.age / 0.28) * (reduced ? 0.3 : 0.85);
      shards.forEach((o, n) => {
        o.visible = !low || n < 3;
        const a = (n * Math.PI) / 3,
          r = f.age * (reduced ? 1 : 9);
        o.position.set(Math.cos(a) * r, Math.sin(a) * r * 0.35, -f.age * 4);
        o.rotation.z = a;
        o.scale.set(
          0.4,
          0.6,
          (f.type === 'muzzle' ? 1.4 : 0.7) * (1 - f.age / 0.28),
        );
      });
    });
    const target = racers.opponents.find(
      (o) => o.specification.id === 'bulwark',
    );
    const pilot = racers.player?.state;
    // The production player state is supplied by the presentation frame.
    const player = frame.state ?? pilot;
    warnings.forEach(({ object, geometry, material }, i) => {
      object.visible = !!(
        live &&
        attack.locked &&
        attack.warning &&
        target &&
        player &&
        Number.isFinite(attack.aimLanes?.[i])
      );
      if (!object.visible) return;
      const muzzle = [i ? 4.7 : -4.7, 2.25, 8.8];
      const aimed = aimBulwarkSlab({
        track,
        bossPose: target.runtime.pose(1),
        muzzle,
        player,
        aimLane: attack.aimLanes[i],
        sourceSpeed: target.state.speed,
      });
      // During yaw the truthful receiving path stays visible without painting
      // a beam through the front shield: keep only its final eight metres.
      const end = aimed.destination,
        start = end
          .clone()
          .lerp(
            aimed.position,
            Math.min(1, 8 / end.distanceTo(aimed.position)),
          );
      ribbon(start, end, 0.07, geometry.attributes.position.array);
      geometry.attributes.position.needsUpdate = true;
      material.opacity = attack.shots > i ? 0.12 : 0.45;
    });
  }
  return {
    update,
    reset() {
      mount.visible = world.visible = false;
      wasWon = false;
      defeatAge = 0;
      defeatLight.clear();
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      mount.removeFromParent();
      world.removeFromParent();
      geometries.forEach((g) => g.dispose());
      materials.forEach((m) => m.dispose());
      mount.clear();
      world.clear();
    },
  };
}
