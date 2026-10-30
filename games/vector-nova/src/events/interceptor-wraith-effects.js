import * as T from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { aimWraithScissors } from './interceptor-aim.js';

// Cold, tensioned ion paths belong to Wraith's real resonance/shot ledger.
// Nothing in this owner decides a counter, hit, trajectory or opening.
export function createWraithEffects({ scene, boss, track, combat, racers }) {
  const world = new T.Group(),
    mount = new T.Group();
  world.name = 'Wraith / resonance paths';
  mount.name = 'Wraith / split capacitors';
  scene.add(world);
  boss.add(mount);
  world.visible = mount.visible = false;
  const geometries = new Set(),
    materials = new Set();
  const geo = (g) => {
    geometries.add(g);
    return g;
  };
  const material = (color, opacity = 1) => {
    const m =
      opacity === 1
        ? new T.MeshPhysicalMaterial({
            color,
            roughness: 0.29,
            metalness: 0.68,
            clearcoat: 0.45,
            clearcoatRoughness: 0.18,
          })
        : new T.MeshBasicMaterial({
            color,
            opacity,
            transparent: true,
            depthWrite: false,
            toneMapped: false,
            side: T.DoubleSide,
            blending: T.AdditiveBlending,
          });
    materials.add(m);
    return m;
  };
  const box = geo(new T.BoxGeometry(1, 1, 1));
  const formed = geo(new RoundedBoxGeometry(1, 1, 1, 1, 0.08));
  const mesh = (parent, g, m, p, s) => {
    const o = new T.Mesh(g, m);
    o.position.set(...p);
    o.scale.set(...s);
    o.userData.aoExclude = o.userData.reflectionExclude = true;
    parent.add(o);
    return o;
  };
  const metal = material(0x7f9bab),
    dark = material(0x172a36),
    cold = material(0x80edff, 0.7);
  const white = material(0xe1faff, 0.85),
    fins = [],
    rails = [],
    jets = [],
    packets = [];
  const carrier = mesh(mount, formed, dark, [0, 0.45, -7.8], [1.8, 0.65, 2]);
  carrier.name = 'Wraith / keel-mounted capacitor carrier';
  for (const side of [-1, 1]) {
    const fin = new T.Group();
    fin.position.set(side * 0.3, 0.65, -8.7);
    mount.add(fin);
    fins.push(fin);
    mesh(fin, formed, metal, [0, 0, 0], [0.6, 1.1, 0.4]);
    mesh(fin, box, cold, [0, 0, -0.24], [0.26, 0.82, 0.1]);
    // A continuous return conductor seats on the existing cutter blade.
    const curve = new T.CatmullRomCurve3([
      new T.Vector3(side * 2.4, 1.7, -6.5),
      new T.Vector3(side * 2.9, 1.5, -3),
      new T.Vector3(side * 2.55, 1.15, 1.2),
      new T.Vector3(side * 2.2, 0.7, 8.75),
    ]);
    rails.push(
      mesh(
        mount,
        geo(new T.TubeGeometry(curve, 24, 0.055, 4, false)),
        cold,
        [0, 0, 0],
        [1, 1, 1],
      ),
    );
    for (let i = 0; i < 6; i++)
      packets.push({
        object: mesh(mount, box, white, [0, 0, 0], [0.08, 0.08, 0.65]),
        curve,
        index: i,
      });
    const jet = new T.Group();
    jet.position.set(side * 3.7, 0.7, -4.5);
    mount.add(jet);
    const plume = mesh(
      jet,
      geo(new T.ConeGeometry(0.35, 2.8, 6, 1, true)),
      cold,
      [side * 1.4, 0, 0],
      [1, 1, 1],
    );
    plume.rotation.z = (-side * Math.PI) / 2;
    jets.push(jet);
  }
  const capacitor = mesh(
    mount,
    geo(new T.OctahedronGeometry(0.5, 0)),
    cold,
    [0, 0.65, -8.5],
    [0.6, 0.8, 0.15],
  );
  const fractures = Array.from({ length: 6 }, (_, i) => {
    const o = mesh(mount, box, white, [0, 0.7, -8.9], [0.08, 0.08, 1]);
    o.rotation.z = (i * Math.PI) / 3;
    return o;
  });
  const ribbonMaterial = new T.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    toneMapped: false,
    side: T.DoubleSide,
    blending: T.AdditiveBlending,
    opacity: 0.55,
    uniforms: {
      color: { value: new T.Color(0x9aefff) },
      time: { value: 0 },
      strength: { value: 0.55 },
    },
    vertexShader:
      'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
    fragmentShader: `varying vec2 vUv;uniform vec3 color;uniform float time,strength;
      void main(){float edge=pow(max(0.,1.-abs(vUv.y*2.-1.)),1.5);
      float pulse=.62+.38*pow(.5+.5*sin(vUv.x*70.-time*11.),4.);
      gl_FragColor=vec4(color*1.25,edge*pulse*strength);}`,
  });
  materials.add(ribbonMaterial);
  const haloMaterial = material(0x3ebdff, 0.1);
  const lowRibbonMaterial = material(0x9aefff, 0.55);
  const paths = Array.from({ length: 2 }, () => {
    const g = geo(new T.BufferGeometry());
    g.setAttribute(
      'position',
      new T.BufferAttribute(new Float32Array(24 * 6 * 3), 3),
    );
    const uv = [];
    for (let n = 0; n < 24; n++)
      for (const [along, across] of [
        [0, 0],
        [1, 0],
        [0, 1],
        [0, 1],
        [1, 0],
        [1, 1],
      ])
        uv.push((n + along) / 24, across);
    g.setAttribute('uv', new T.Float32BufferAttribute(uv, 2));
    const core = new T.Mesh(g, ribbonMaterial);
    core.frustumCulled = false;
    world.add(core);
    const h = geo(g.clone());
    const halo = new T.Mesh(h, haloMaterial);
    halo.frustumCulled = false;
    world.add(halo);
    return { g, h, core, halo };
  });
  const bolts = Array.from({ length: 12 }, () => {
    const group = new T.Group();
    world.add(group);
    for (const side of [-1, 1]) {
      const o = mesh(
        group,
        box,
        white,
        [side * 0.3, 0, -1.7],
        [0.16, 0.16, 3.4],
      );
      o.rotation.y = side * 0.1;
      mesh(group, box, cold, [side * 0.55, 0, -2.8], [0.2, 0.36, 4.7]);
    }
    return group;
  });
  const bursts = Array.from({ length: 10 }, () => {
    const group = new T.Group();
    world.add(group);
    const m = material(0xbef5ff, 0.8);
    const blades = Array.from({ length: 4 }, (_, i) => {
      const o = mesh(group, box, m, [0, 0, 0], [0.08, 0.12, 1]);
      o.rotation.z = (i * Math.PI) / 2;
      return o;
    });
    return { group, m, blades };
  });
  const rupture = new T.Group();
  rupture.name = 'Wraith / accepted ignition rupture';
  world.add(rupture);
  const ruptureMaterial = material(0xb2f7ff, 0.8),
    slivers = [];
  for (const side of [-1, 1])
    for (let i = 0; i < 4; i++) {
      const object = mesh(
        rupture,
        box,
        ruptureMaterial,
        [0, 0, 0],
        [0.08, 0.1, 2],
      );
      object.rotation.y = -side * 0.85;
      slivers.push({ object, side, index: i });
    }
  const quench = [-1, 1].map((side, index) => {
    const points = Array.from({ length: 17 }, (_, i) => {
      const t = i / 16,
        angle = t * Math.PI * 3;
      return new T.Vector3(
        Math.cos(angle) * 0.18 * (1 - t),
        Math.sin(angle) * 0.18 * (1 - t),
        -t * 4,
      );
    });
    const m = material(0x94e8ff, 0.7),
      object = mesh(
        mount,
        geo(
          new T.TubeGeometry(
            new T.CatmullRomCurve3(points),
            16,
            0.055,
            3,
            false,
          ),
        ),
        m,
        [0, 0, 0],
        [1, 1, 1],
      );
    const anchor = boss.getObjectByName(side < 0 ? 'Exhaust_L' : 'Exhaust_R');
    if (anchor)
      object.position.copy(
        boss.worldToLocal(anchor.getWorldPosition(new T.Vector3())),
      );
    else object.position.set(side * 2.4, 0.8, -8.9);
    object.name = 'Wraith / residual ion coil';
    return { object, m, index, side };
  });
  const start = new T.Vector3(),
    end = new T.Vector3(),
    mid = new T.Vector3(),
    sideways = new T.Vector3();
  const a = new T.Vector3(),
    b = new T.Vector3(),
    toward = new T.Vector3(),
    view = new T.Vector3();
  let disposed = false,
    wasWon = false,
    defeatAge = 0;
  function update(frame) {
    if (disposed) return;
    const data = frame.interceptor,
      attack = data?.counterattack ?? {};
    const active =
      !!data && ['racing', 'paused', 'countdown'].includes(frame.mode);
    const tableau = !!data?.result && frame.mode === 'results';
    const won = tableau && data.result.won && data.health === 0;
    defeatAge = won
      ? wasWon
        ? defeatAge + Math.max(0, frame.presentationDt ?? 0)
        : 0
      : 0;
    wasWon = won;
    mount.visible = active || tableau;
    world.visible = active || (won && defeatAge < 0.9);
    if (!mount.visible) return;
    const warning = active && attack.warning === true,
      exposed = active && attack.exposed === true,
      charging = active && !!attack.phase && attack.phase !== 'idle';
    const reduced = !!frame.settings.reducedMotion,
      low = frame.settings.quality === 'low';
    const state = combat.view(),
      countered = !!attack.countered;
    cold.color.setHex(
      won && defeatAge < 0.12
        ? 0xe8fcff
        : countered
          ? 0xc7f7ff
          : attack.locked
            ? 0xa88fff
            : 0x70eaff,
    );
    cold.opacity = won
      ? Math.max(0, 1 - defeatAge / 0.65)
      : exposed
        ? 0.95
        : warning
          ? 0.3 + 0.5 * (attack.charge ?? 0.5)
          : charging
            ? 0.22
            : 0;
    const open = won
      ? Math.max(0, 1 - defeatAge / 0.5)
      : exposed
        ? Math.min(1, (attack.phaseElapsed ?? 0) / 0.22)
        : 0;
    fins.forEach((fin, i) => {
      fin.rotation.z = (i ? 1 : -1) * open * 0.9;
      fin.position.x = (i ? 1 : -1) * (0.3 + open * 0.8);
    });
    capacitor.visible = exposed || (won && defeatAge < 0.65);
    capacitor.scale.set(0.6 + open * 0.25, 0.8 + open * 0.3, 0.15);
    rails.forEach((rail) => {
      rail.visible = charging;
    });
    packets.forEach(({ object, curve, index }) => {
      object.visible = charging && (!low || index < 2);
      if (!object.visible) return;
      let t = (index / 6 + (reduced ? 0 : (attack.elapsed ?? 0) * 0.8)) % 1;
      if (exposed || attack.recovered) t = 1 - t;
      object.position.copy(curve.getPoint(t));
      object.quaternion.setFromUnitVectors(
        new T.Vector3(0, 0, 1),
        curve.getTangent(t),
      );
    });
    jets.forEach((jet) => {
      jet.visible =
        active &&
        (attack.phase === 'turning-back' || attack.phase === 'turning-forward');
    });
    quench.forEach(({ object, m, index, side }) => {
      const p = defeatAge / (0.55 + index * 0.14);
      object.visible = won && p < 1;
      m.opacity = Math.max(0, 1 - p) * (reduced ? 0.25 : 0.8);
      object.scale.set(
        0.8 + 0.2 * (1 - p),
        0.8 + 0.2 * (1 - p),
        0.25 + 1.4 * (1 - p),
      );
      object.rotation.z = reduced ? 0 : side * defeatAge * 5;
    });
    const critical =
      active &&
      data.lastHit?.weakPoint &&
      data.elapsed - data.lastHit.elapsed < 0.3;
    fractures.forEach((o, i) => {
      o.visible = !!critical && (!low || i < 2);
      if (!o.visible) return;
      const age = data.elapsed - data.lastHit.elapsed,
        radius = reduced ? 0.45 : 0.3 + age * 6;
      const angle = (i * Math.PI) / 3;
      o.position.set(
        Math.cos(angle) * radius,
        0.7 + Math.sin(angle) * radius,
        -8.9 - age * 4,
      );
      o.scale.set(0.08, 0.08, Math.max(0.1, 1 - age / 0.3));
    });
    const lanes = attack.aimLanes?.length
      ? attack.aimLanes
      : [frame.state.lateral - 2.5, frame.state.lateral + 2.5];
    const counterAge =
      countered && Number.isFinite(attack.counterAt)
        ? data.elapsed - attack.counterAt
        : Infinity;
    const snap = countered ? Math.max(0, 1 - counterAge / 0.3) : 1;
    const aiming = warning && attack.shots < attack.blasts && snap > 0;
    ribbonMaterial.uniforms.color.value.setHex(
      countered ? 0xc1fbff : attack.locked ? 0xb197ff : 0x61dbff,
    );
    ribbonMaterial.opacity = reduced ? 0.35 : attack.locked ? 0.72 : 0.4;
    lowRibbonMaterial.color.copy(ribbonMaterial.uniforms.color.value);
    lowRibbonMaterial.opacity = ribbonMaterial.opacity * snap;
    ribbonMaterial.uniforms.strength.value = ribbonMaterial.opacity * snap;
    ribbonMaterial.uniforms.time.value = reduced ? 0 : data.elapsed;
    haloMaterial.opacity = (reduced ? 0.025 : 0.08) * snap;
    rupture.visible = active && counterAge >= 0 && counterAge < 0.35;
    if (rupture.visible) {
      const player = frame.ship?.group;
      if (player) {
        rupture.position.copy(player.position);
        rupture.quaternion.copy(player.quaternion);
      } else {
        const f = track.sample(frame.state.distance);
        rupture.position
          .copy(f.position)
          .addScaledVector(f.right, frame.state.lateral)
          .addScaledVector(f.up, 0.72);
        rupture.quaternion.copy(f.quaternion);
      }
      ruptureMaterial.opacity =
        (1 - counterAge / 0.35) * (reduced ? 0.22 : 0.85);
      slivers.forEach(({ object, side, index }) => {
        object.visible = !low || index === 0;
        const travel = reduced ? 0.2 : counterAge * 12;
        object.position.set(
          side * (2 + travel + index * 0.2),
          0.35 + index * 0.22,
          -2 - travel * 0.55 - index * 0.35,
        );
        object.scale.set(
          0.09,
          0.1,
          (1 - counterAge / 0.35) * (2.5 + index * 0.4),
        );
      });
    }
    boss.updateWorldMatrix(true, false);
    paths.forEach(({ g, h, core, halo }, index) => {
      core.material = low ? lowRibbonMaterial : ribbonMaterial;
      core.visible = aiming;
      halo.visible = aiming && !low;
      if (!aiming) return;
      const aimed = aimWraithScissors({
        track,
        bossPose: {
          position: new T.Vector3().setFromMatrixPosition(boss.matrixWorld),
          quaternion: boss.getWorldQuaternion(new T.Quaternion()),
        },
        muzzle: [index ? 2.2 : -2.2, 0.48, 8.75],
        player: { ...frame.state, speed: frame.state.speed ?? 0 },
        aimLane: lanes[Math.min(index, lanes.length - 1)],
        sourceSpeed:
          racers?.opponents.find((r) => r.specification.id === 'wraith')?.state
            .speed ?? 0,
      });
      start.copy(aimed.position);
      end.copy(aimed.destination);
      const receiving = track.sample(aimed.receiveDistance);
      mid
        .copy(start)
        .lerp(end, 0.5)
        .addScaledVector(receiving.up, attack.locked ? 0.25 : 2);
      const curve = new T.QuadraticBezierCurve3(
        start.clone(),
        mid.clone(),
        end.clone(),
      );
      for (const [geometry, width] of [
        [g, 0.05],
        [h, 0.12],
      ]) {
        const array = geometry.attributes.position.array;
        let cursor = 0;
        for (let n = 0; n < 24; n++) {
          curve.getPoint(n / 24, a);
          curve.getPoint((n + 1) / 24, b);
          toward.subVectors(b, a).normalize();
          view
            .copy(frame.camera?.position ?? receiving.position)
            .sub(a)
            .normalize();
          sideways.crossVectors(toward, view).normalize().multiplyScalar(width);
          for (const [point, sign] of [
            [a, -1],
            [b, -1],
            [a, 1],
            [a, 1],
            [b, -1],
            [b, 1],
          ]) {
            array[cursor++] = point.x + sideways.x * sign;
            array[cursor++] = point.y + sideways.y * sign;
            array[cursor++] = point.z + sideways.z * sign;
          }
        }
        geometry.attributes.position.needsUpdate = true;
      }
    });
    const shots = active
      ? state.shots.filter((s) => s.signature === 'wraith-scissor')
      : [];
    bolts.forEach((group, i) => {
      const shot = shots[i];
      group.visible = !!shot;
      if (!shot) return;
      group.position.fromArray(shot.position);
      group.quaternion.fromArray(shot.quaternion);
      group.children.forEach((child, n) => {
        child.visible = !low || n % 2 === 0;
      });
    });
    const flashes = active
      ? state.flashes.filter(
          (f) => f.signature === 'wraith-scissor' && f.kind !== 'aegis',
        )
      : [];
    bursts.forEach(({ group, m, blades }, i) => {
      const flash = flashes[i];
      group.visible = !!flash && flash.age < 0.24;
      if (!group.visible) return;
      group.position.fromArray(flash.position);
      group.quaternion.fromArray(flash.quaternion);
      const age = flash.age;
      m.opacity = (1 - age / 0.24) * (reduced ? 0.25 : 0.8);
      blades.forEach((blade, n) => {
        blade.visible = !low || n < 2;
        const angle = (n * Math.PI) / 2,
          r = reduced ? 0.2 : age * 8;
        blade.position.set(Math.cos(angle) * r, Math.sin(angle) * r, 0);
        blade.scale.set(
          0.1,
          0.1,
          (flash.type === 'muzzle' ? 2.4 : 1.2) * (1 - age / 0.24),
        );
      });
    });
  }
  return {
    update,
    reset() {
      mount.visible = world.visible = false;
      wasWon = false;
      defeatAge = 0;
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
