import * as T from 'three';
import { equipmentById } from '../progression/catalog.js';

const clamp = T.MathUtils.clamp;
const UP = new T.Vector3(0, 1, 0);
const tails = { jump: 0.58, injector: 1.15, lance: 0.34 };

// Shared by the race and studio: effects stay in the craft's local frame and
// sample the equipment clock, so pause, replay and isolated auditions agree.
export function createEquipmentEffects(scene) {
  const group = new T.Group();
  group.name = 'Player equipment effects';
  scene.add(group);
  const geometries = new Set();
  const materials = new Set();
  const ownGeometry = (geometry) => (geometries.add(geometry), geometry);
  const ownMaterial = (material) => (materials.add(material), material);
  function branch(name) {
    const node = new T.Group();
    node.name = name;
    node.visible = false;
    group.add(node);
    return node;
  }
  function basic(color, opacity = 0) {
    return ownMaterial(
      new T.MeshBasicMaterial({
        color,
        transparent: true,
        opacity,
        depthWrite: false,
        blending: T.AdditiveBlending,
        toneMapped: false,
        side: T.DoubleSide,
      }),
    );
  }
  function flowMaterial(color, kind) {
    return ownMaterial(
      new T.ShaderMaterial({
        name: `Equipment / ${kind}`,
        transparent: true,
        depthWrite: false,
        side: T.DoubleSide,
        blending: T.AdditiveBlending,
        toneMapped: false,
        uniforms: {
          color: { value: new T.Color(color) },
          strength: { value: 0 },
          time: { value: 0 },
          motion: { value: 1 },
        },
        vertexShader: `varying vec2 vUv;
        void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
        fragmentShader: `varying vec2 vUv;
        uniform vec3 color; uniform float strength,time,motion;
        void main(){
          ${
            kind === 'conduit'
              ? `
            float packet=pow(max(0.,sin(vUv.x*17.-time*13.)),10.);
            float a=(.14+packet*.86*motion)*sin(vUv.x*3.14159);
          `
              : kind === 'airflow'
                ? `
            float edge=pow(max(0.,1.-abs(vUv.x-.5)*2.),1.8);
            float along=smoothstep(0.,.12,vUv.y)*(1.-smoothstep(.65,1.,vUv.y));
            float stream=.6+.4*pow(max(0.,sin(vUv.y*28.-time*16.)),6.)*motion;
            float a=edge*along*stream;
          `
                : `
            float edge=exp(-pow((vUv.x-.5)*4.8,2.));
            float along=smoothstep(0.,.045,vUv.y)*(1.-smoothstep(.08,1.,vUv.y));
            float a=edge*along*(.9+.1*sin(vUv.y*20.-time*18.)*motion);
          `
          }
          a*=strength;
          if(a<.004)discard;
          gl_FragColor=vec4(color*1.35,min(a,.82));
        }`,
      }),
    );
  }
  function mesh(parent, geometry, material, name) {
    const node = new T.Mesh(geometry, material);
    node.name = name;
    node.userData.aoExclude = node.userData.reflectionExclude = true;
    parent.add(node);
    return node;
  }
  // Crossed soft sheets give a compact plume without a solid conical shell.
  // Both taper away from the underside mounting point along local -Y.
  const jetGeometry = ownGeometry(new T.BufferGeometry());
  jetGeometry.setAttribute(
    'position',
    new T.Float32BufferAttribute(
      [
        -0.42, 0, 0, 0.42, 0, 0, -0.06, -1, 0, 0.06, -1, 0, 0, 0, -0.42, 0, 0,
        0.42, 0, -1, -0.06, 0, -1, 0.06,
      ],
      3,
    ),
  );
  jetGeometry.setAttribute(
    'uv',
    new T.Float32BufferAttribute(
      [0, 0, 1, 0, 0, 1, 1, 1, 0, 0, 1, 0, 0, 1, 1, 1],
      2,
    ),
  );
  jetGeometry.setIndex([0, 1, 2, 1, 3, 2, 4, 5, 6, 5, 7, 6]);
  const jump = branch('Jump Drive / underside impulse jets');
  const jumpMaterial = flowMaterial(0x76d9ff, 'impulse');
  const jumpJets = [-1, 1].flatMap((x) =>
    [-1, 1].map((z) => {
      const jet = mesh(
        jump,
        jetGeometry,
        jumpMaterial,
        'Jump / downward thrust',
      );
      jet.position.set(x * (z > 0 ? 0.65 : 1.05), -0.03, z * 1.5);
      return jet;
    }),
  );

  const injector = branch('Reserve Injector / inward energy conduits');
  const injectorMaterial = flowMaterial(0xa7f4bc, 'conduit');
  for (const side of [-1, 1]) {
    for (const lane of [0, 1]) {
      const curve = new T.CatmullRomCurve3([
        new T.Vector3(side * (1.55 + lane * 0.12), 0.55, 0.2 - lane * 0.9),
        new T.Vector3(side * 1.42, 0.72, -0.7 - lane * 0.4),
        new T.Vector3(side * 1.25, 0.68, -1.9),
        new T.Vector3(side * 1.08, 0.58, -3.25),
      ]);
      mesh(
        injector,
        ownGeometry(new T.TubeGeometry(curve, 16, 0.075, 4, false)),
        injectorMaterial,
        'Injector / reservoir-to-engine feed',
      );
    }
  }

  const slipstream = branch('Slipstream Drive / trailing airflow');
  const slipMaterial = flowMaterial(0xa6d3ff, 'airflow');
  const slipRibbons = [];
  for (const side of [-1, 1]) {
    for (const lane of [0, 1]) {
      const vertices = [],
        uvs = [],
        indices = [];
      const curve = new T.CatmullRomCurve3([
        new T.Vector3(side * (2.6 + lane * 0.5), 0.3 + lane * 0.6, 4.2),
        new T.Vector3(side * (3.6 + lane * 0.6), 0.55 + lane * 0.6, -2),
        new T.Vector3(side * (3.1 + lane * 0.4), 0.4 + lane * 0.4, -8),
        new T.Vector3(side * 2.6, 0.3, -16),
      ]);
      for (let i = 0; i <= 20; i++) {
        const at = i / 20,
          point = curve.getPoint(at);
        const width = 0.18 + Math.sin(at * Math.PI) * 0.22;
        for (const edge of [-1, 1]) {
          vertices.push(point.x + edge * width, point.y, point.z);
          uvs.push((edge + 1) / 2, at);
        }
        if (i < 20) {
          const a = i * 2;
          indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
        }
      }
      const geometry = ownGeometry(new T.BufferGeometry());
      geometry.setAttribute(
        'position',
        new T.Float32BufferAttribute(vertices, 3),
      );
      geometry.setAttribute('uv', new T.Float32BufferAttribute(uvs, 2));
      geometry.setIndex(indices);
      slipRibbons.push(
        mesh(slipstream, geometry, slipMaterial, 'Slipstream / aft ribbon'),
      );
    }
  }

  const deflector = branch('Deflector / segmented conformal panels');
  const panels = Array.from({ length: 8 }, (_, i) => {
    const angle = (i * Math.PI) / 4;
    const a = angle - Math.PI / 8 + 0.035,
      b = angle + Math.PI / 8 - 0.035;
    const points = [
      [Math.sin(a) * 2.4, -0.24, Math.cos(a) * 4.1],
      [Math.sin(b) * 2.4, -0.24, Math.cos(b) * 4.1],
      [Math.sin(b) * 2.1, 1.72, Math.cos(b) * 3.8],
      [Math.sin(a) * 2.1, 1.72, Math.cos(a) * 3.8],
    ];
    const geometry = ownGeometry(new T.BufferGeometry());
    geometry.setAttribute(
      'position',
      new T.Float32BufferAttribute(points.flat(), 3),
    );
    geometry.setIndex([0, 1, 2, 0, 2, 3]);
    const node = new T.Group();
    node.name = `Deflector / panel ${i + 1}`;
    const fill = mesh(
      node,
      geometry,
      basic(0x88d5f5),
      'Deflector / transparent facet',
    );
    const edge = new T.LineSegments(
      ownGeometry(new T.EdgesGeometry(geometry)),
      ownMaterial(
        new T.LineBasicMaterial({
          color: 0x9ce5ff,
          transparent: true,
          opacity: 0,
          depthWrite: false,
          blending: T.AdditiveBlending,
          toneMapped: false,
        }),
      ),
    );
    edge.name = 'Deflector / panel boundary';
    node.add(edge);
    deflector.add(node);
    return {
      node,
      fill,
      edge,
      normal: new T.Vector3(Math.sin(angle), 0, Math.cos(angle)),
    };
  });

  const stabilizer = branch('Magnetic Stabilizer / corrective jets');
  const stabilizerMaterial = flowMaterial(0xffd391, 'correction');
  const correctionJets = [-1, 1].flatMap((side) =>
    [-1, 1].map((end) => {
      const jet = mesh(
        stabilizer,
        jetGeometry,
        stabilizerMaterial,
        'Stabilizer / corner correction',
      );
      jet.position.set(side * (end > 0 ? 0.85 : 1.65), 0.16, end * 1.6);
      jet.quaternion.setFromUnitVectors(
        UP,
        new T.Vector3(-side, 0.32, end * 0.12).normalize(),
      );
      return { jet, side, end };
    }),
  );

  const lance = branch('Lance / split muzzle rails');
  const railGeometry = ownGeometry(new T.BoxGeometry(0.12, 0.12, 3.2));
  const railMaterial = basic(0xffe3ad);
  for (const side of [-1, 1]) {
    const rail = mesh(
      lance,
      railGeometry,
      railMaterial,
      'Lance / energized rail',
    );
    rail.position.set(side * 0.45, -0.12, 3.4);
  }
  const activation = new Map();
  let key = '',
    previous = [],
    lastTime = -Infinity,
    lastShield = false;
  let previousDeflectorActive = 0;
  let shieldTail = null,
    disposed = false;
  const direction = new T.Vector3(),
    inverse = new T.Quaternion();
  function reset() {
    key = '';
    previous = [];
    lastTime = -Infinity;
    lastShield = false;
    previousDeflectorActive = 0;
    shieldTail = null;
    activation.clear();
    group.visible = false;
    for (const node of group.children) node.visible = false;
  }
  reset();
  return {
    group,
    reset,
    update({
      equipment,
      pose,
      mode,
      suspended = false,
      reducedMotion = false,
      settings = {},
      events = [],
      motion = {},
    } = {}) {
      if (disposed) return;
      const slots = equipment?.slots ?? [],
        time = equipment?.time ?? 0;
      const next = slots.map((slot) => slot?.id ?? '').join(',');
      if (key !== next || time < lastTime) {
        reset();
        key = next;
      }
      const low = settings.quality === 'low';
      const reduced = settings.reducedMotion ?? reducedMotion;
      for (const [i, slot] of slots.entries()) {
        if (!slot) continue;
        if (slot.remaining > (previous[i] ?? 0) + 0.5) {
          const item = equipmentById(slot.id);
          // Reconstruct an existing activation after restore instead of
          // drawing a fresh blast from a mid-cooldown snapshot.
          activation.set(
            slot.id,
            time -
              Math.max(0, (item?.cooldown ?? slot.remaining) - slot.remaining),
          );
        }
        previous[i] = slot.remaining;
      }
      for (const event of events) {
        if (event.type === 'equipment-activate')
          activation.set(event.payload?.kind, time);
      }
      const shield = !!equipment?.shield;
      const blocked = events.find((event) => event.type === 'equipment-block');
      if (blocked || (lastShield && !shield)) {
        const oldActive = previousDeflectorActive;
        const hit = !!blocked || oldActive > time - lastTime + 0.025;
        direction.set(0, 0, -1);
        if (blocked?.payload?.direction)
          direction.fromArray(blocked.payload.direction);
        else if (blocked?.payload?.position && pose) {
          direction.fromArray(blocked.payload.position).sub(pose.position);
          inverse.copy(pose.quaternion).invert();
          direction.applyQuaternion(inverse);
        } else if (blocked?.payload?.side)
          direction.set(Math.sign(blocked.payload.side), 0, 0);
        direction.y = 0;
        direction.normalize();
        let panel = 4,
          best = -Infinity;
        panels.forEach(({ normal }, i) => {
          const dot = normal.dot(direction);
          if (dot > best) {
            best = dot;
            panel = i;
          }
        });
        shieldTail = { time: hit ? time : lastTime + oldActive, hit, panel };
      }
      previousDeflectorActive =
        slots.find((slot) => slot?.id === 'deflector')?.active ?? 0;
      lastShield = shield;
      lastTime = time;
      group.visible =
        !suspended &&
        ['racing', 'countdown', 'paused'].includes(mode) &&
        !!pose;
      if (pose) {
        group.position.copy(pose.position);
        group.quaternion.copy(pose.quaternion);
      }
      const age = (kind) => time - (activation.get(kind) ?? -Infinity);
      const pulse = (kind) => clamp(1 - age(kind) / tails[kind], 0, 1);
      const active = (kind) =>
        slots.find((slot) => slot?.id === kind)?.active ?? 0;
      const tune = (material, strength) => {
        material.uniforms.strength.value = strength * (reduced ? 0.58 : 1);
        material.uniforms.time.value = reduced ? 0 : time;
        material.uniforms.motion.value = reduced ? 0 : 1;
      };
      const jumpPulse = pulse('jump');
      jump.visible = jumpPulse > 0;
      tune(jumpMaterial, jumpPulse * 0.8);
      jumpJets.forEach((jet, i) => {
        jet.visible = !low || i % 2 === 0;
        jet.scale.set(
          0.8 + jumpPulse * 0.25,
          (reduced ? 1.15 : 3.4) * Math.sqrt(jumpPulse),
          0.8 + jumpPulse * 0.25,
        );
      });
      const injectorPulse = pulse('injector');
      injector.visible = injectorPulse > 0;
      tune(injectorMaterial, Math.sin(injectorPulse * Math.PI) * 0.8);
      injector.children.forEach((node, i) => {
        node.visible = !low || i % 2 === 0;
      });
      const slip = active('slipstream');
      slipstream.visible = slip > 0;
      tune(
        slipMaterial,
        Math.min(1, slip / 0.3, 0.25 + age('slipstream') / 0.25) * 0.46,
      );
      slipRibbons.forEach((node, i) => {
        node.visible = !low || i % 2 === 0;
      });
      const tailAge = shieldTail ? time - shieldTail.time : Infinity;
      const tailDuration = shieldTail?.hit ? 0.42 : 0.32;
      const tail = clamp(1 - tailAge / tailDuration, 0, 1);
      deflector.visible = shield || tail > 0;
      panels.forEach(({ node, fill, edge, normal }, i) => {
        const distance = Math.min(
          (i - (shieldTail?.panel ?? 4) + 8) % 8,
          ((shieldTail?.panel ?? 4) - i + 8) % 8,
        );
        const struck = !shield && shieldTail?.hit && distance < 2;
        node.position
          .copy(normal)
          .multiplyScalar(struck && !reduced ? (1 - tail) * 0.65 : 0);
        node.position.y = !shield && !reduced ? (1 - tail) * -0.25 : 0;
        fill.visible = !low;
        fill.material.opacity = shield
          ? 0.045
          : tail * (struck ? 0.3 : 0.035) * (reduced ? 0.45 : 1);
        edge.material.opacity = shield
          ? reduced
            ? 0.2
            : 0.32
          : tail * (struck ? 0.85 : 0.18) * (reduced ? 0.5 : 1);
      });
      const stable = active('stabilizer');
      stabilizer.visible = stable > 0;
      const correction = clamp(motion.correction ?? 0.35, 0, 1);
      const airborne = motion.airborne ?? true;
      tune(
        stabilizerMaterial,
        Math.min(1, stable / 0.25) * (airborne ? 0.52 : 0.18),
      );
      correctionJets.forEach(({ jet, side, end }) => {
        const breathing = reduced
          ? 1
          : 0.86 + 0.14 * Math.sin(time * 4 + side * end * 1.8);
        const length =
          (0.7 + correction * 1.8) * breathing * (airborne ? 1 : 0.45);
        jet.scale.set(low ? 0.42 : 0.5, length, low ? 0.42 : 0.5);
      });
      const lancePulse = pulse('lance');
      lance.visible = lancePulse > 0;
      railMaterial.opacity = lancePulse * (reduced ? 0.35 : 0.75);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      group.removeFromParent();
      geometries.forEach((geometry) => geometry.dispose());
      materials.forEach((material) => material.dispose());
    },
  };
}
