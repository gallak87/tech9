import * as T from 'three';
import valve from '../../../../assets/levels/worldspire/resonance-kit.json' with { type: 'json' };

// A deterministic presentation mutation. The wave travels down the mineral body;
// its plates and light never change the supported road, flight or race rules.
export function awakeningPhase(track, distance) {
  return T.MathUtils.smoothstep(distance / track.finishDistance, 0.12, 0.92);
}
export function createAwakening(track, texture) {
  const group = new T.Group();
  group.name = 'Worldspire / the awakening';
  const skin = new T.MeshPhysicalMaterial({
    name: 'Worldspire / opening mineral valves',
    map: texture,
    bumpMap: texture,
    bumpScale: 0.18,
    color: '#b2a1a8',
    roughness: 0.58,
    metalness: 0.22,
    clearcoat: 0.15,
    clearcoatRoughness: 0.38,
  });
  const inner = new T.MeshStandardMaterial({
    name: 'Worldspire / resonant amber mineral core',
    color: '#8d4825',
    roughness: 0.5,
    metalness: 0.12,
    vertexColors: true,
    emissive: '#ff792a',
    emissiveIntensity: 0.75,
  });
  inner.onBeforeCompile = (shader) => {
    shader.vertexShader =
      'varying float coreHeight;\n' +
      shader.vertexShader.replace(
        '#include <begin_vertex>',
        '#include <begin_vertex>\ncoreHeight=position.y;',
      );
    shader.fragmentShader =
      'varying float coreHeight;\n' + shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <color_fragment>',
        '#include <color_fragment>\nfloat inclusion=1.-smoothstep(9.,17.,abs(coreHeight+12.));diffuseColor.rgb*=1.-inclusion*.72;',
      )
      .replace(
        '#include <emissivemap_fragment>',
        '#include <emissivemap_fragment>\ntotalEmissiveRadiance*=1.-inclusion*.94;\n#ifdef USE_INSTANCING_COLOR\ntotalEmissiveRadiance *= vColor.rgb*(.22+.78*smoothstep(.08,.25,abs(fract(coreHeight/38.+.25)-.5)));\n#endif',
      );
  };
  const backing = new T.MeshStandardMaterial({
    name: 'Worldspire / valve roots',
    map: texture,
    color: '#554849',
    roughness: 0.71,
    metalness: 0.12,
  });
  const geometry = new T.BufferGeometry();
  geometry.setAttribute(
    'position',
    new T.Float32BufferAttribute(valve.positions, 3),
  );
  geometry.setAttribute('uv', new T.Float32BufferAttribute(valve.uv, 2));
  geometry.computeVertexNormals();
  const stations = [];
  for (let row = 0; row < 11; row++) {
    const y = track.spireHeight - 700 - (row * (track.spireHeight - 1600)) / 10;
    for (let col = 0; col < 7; col++) {
      const angle = (col * Math.PI * 2) / 7 + row * 0.11;
      const radial = new T.Vector3(Math.cos(angle), 0, Math.sin(angle));
      const base = track.spireRadius(y);
      const r =
        base *
          (1 +
            0.065 * Math.cos(angle * 13 + 0.00007 * y) +
            0.035 * Math.cos(angle * 29 - 0.00011 * y)) +
        12 * Math.sin(y * 0.003 + angle * 5) +
        7 * Math.sin(y * 0.009 + angle * 9) +
        22;
      const center = radial.clone().multiplyScalar(r);
      center.y = y;
      // Decorative moving plates live far from every drivable/camera corridor.
      let near = false;
      for (let s = 0; s < track.length; s += 40) {
        const p = track.sample(s).position;
        if (p.distanceToSquared(center) < 230 * 230) {
          near = true;
          break;
        }
      }
      if (near) continue;
      const right = new T.Vector3(0, 1, 0).cross(radial);
      const q = new T.Quaternion().setFromRotationMatrix(
        new T.Matrix4().makeBasis(right, new T.Vector3(0, 1, 0), radial),
      );
      stations.push({
        center,
        right,
        radial,
        q,
        y,
        scale: 0.8 + 0.25 * Math.sin(row * 1.4 + col * 0.7),
      });
    }
  }
  // Hero openings are seated on measured exposed mineral faces seen from the
  // ordinary approach cameras. Their clearance was checked against the route.
  const anchors = [
    {
      point: [-58.7281, 4703.2347, 314.4407],
      normal: [0.072317, 0.16696, 0.983308],
      scale: 0.62,
    },
    {
      point: [-52.70598, 2860.73523, 522.56579],
      normal: [0.0429906, 0.2068387, 0.9774301],
      scale: 0.52,
    },
    {
      point: [-130.7194, 2784.1425, 562.2952],
      normal: [-0.192264, 0.201958, 0.960337],
      scale: 0.82,
    },
    {
      point: [856.1993, 626.3446, 322.1035],
      normal: [0.802228, 0.134762, -0.58161],
      scale: 0.95,
    },
  ];
  for (const a of anchors) {
    const radial = new T.Vector3(...a.normal).normalize(),
      right = new T.Vector3(0, 1, 0).cross(radial).normalize(),
      up = radial.clone().cross(right).normalize(),
      center = new T.Vector3(...a.point).addScaledVector(radial, 22);
    stations.push({
      center,
      right,
      radial,
      q: new T.Quaternion().setFromRotationMatrix(
        new T.Matrix4().makeBasis(right, up, radial),
      ),
      y: center.y,
      scale: a.scale,
      hero: true,
    });
  }
  const plates = new T.InstancedMesh(geometry, skin, stations.length * 2);
  const coreGeometry = geometry.clone();
  coreGeometry.scale(0.65, 0.82, 0.6);
  const colors = [];
  const cp = coreGeometry.attributes.position;
  for (let i = 0; i < cp.count; i++) {
    const y = cp.getY(i) / 123,
      z = cp.getZ(i);
    const glow = (z > 4 ? 0.9 : 0.08) * (1 - Math.abs(y) * 0.7);
    colors.push(glow, glow * 0.7, glow * 0.4);
  }
  coreGeometry.setAttribute('color', new T.Float32BufferAttribute(colors, 3));
  const cores = new T.InstancedMesh(coreGeometry, inner, stations.length);
  const roots = new T.InstancedMesh(geometry.clone(), backing, stations.length);
  plates.name = 'Worldspire / paired grown valve leaves';
  cores.name = 'Worldspire / revealed resonant cores';
  roots.name = 'Worldspire / rooted valve sockets';
  for (const m of [plates, cores, roots]) {
    m.castShadow = m !== cores;
    m.receiveShadow = true;
    group.add(m);
    m.userData.decorative = true;
  }
  const lights = Array.from({ length: 2 }, () => {
    const l = new T.PointLight('#ffc48a', 0, 600, 2);
    group.add(l);
    return l;
  });
  const matrix = new T.Matrix4(),
    color = new T.Color(),
    scale = new T.Vector3();
  let last = -1;
  const update = ({
    state = { distance: 0 },
    camera,
    settings = {},
    override = null,
  } = {}) => {
    const phase =
      override === null
        ? awakeningPhase(track, state.distance)
        : T.MathUtils.clamp(override, 0, 1);
    if (phase !== last) {
      const front = T.MathUtils.lerp(track.spireHeight + 650, -1600, phase);
      stations.forEach((v, i) => {
        const open = T.MathUtils.smoothstep(
          v.y - front,
          v.hero ? -140 : -350,
          v.hero ? 140 : 350,
        );
        v.open = open;
        for (const [j, side] of [-1, 1].entries()) {
          const p = v.center
            .clone()
            .addScaledVector(v.right, side * (15 + open * 23) * v.scale)
            .addScaledVector(v.radial, open * 5);
          matrix.compose(p, v.q, scale.set(v.scale, v.scale, v.scale));
          plates.setMatrixAt(i * 2 + j, matrix);
        }
        matrix.compose(
          v.center.clone().addScaledVector(v.radial, -6),
          v.q,
          scale.set(v.scale, v.scale, v.scale),
        );
        cores.setMatrixAt(i, matrix);
        color.setRGB(
          0.025 + open * 0.975,
          0.025 + open * 0.975,
          0.025 + open * 0.975,
        );
        cores.setColorAt(i, color);
        matrix.compose(
          v.center.clone().addScaledVector(v.radial, -27),
          v.q,
          scale.set(2.3 * v.scale, 1.12 * v.scale, 0.6),
        );
        roots.setMatrixAt(i, matrix);
      });
      plates.instanceMatrix.needsUpdate =
        cores.instanceMatrix.needsUpdate =
        roots.instanceMatrix.needsUpdate =
          true;
      cores.instanceColor.needsUpdate = true;
      for (const m of [plates, cores, roots]) m.computeBoundingSphere();
      last = phase;
      group.userData.phase = phase;
    }
    if (camera) {
      const near = stations
        .filter((v) => v.open > 0.02)
        .map((v) => ({ ...v, d: v.center.distanceToSquared(camera.position) }))
        .sort((a, b) => a.d - b.d);
      lights.forEach((l, i) => {
        const v = near[i];
        l.visible = !!v && v.d < 600 * 600;
        if (v) {
          l.position.copy(v.center).addScaledVector(v.radial, 24);
          l.intensity = 11000 * v.open;
        }
      });
    }
    // No oscillation, particles or flash: reduced motion keeps the same slow,
    // progress-linked reveal and the same architectural navigation contrast.
    group.userData.reducedMotion = !!settings.reducedMotion;
  };
  update();
  return { group, update };
}
