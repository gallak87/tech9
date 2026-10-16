import * as T from 'three';
import { RectAreaLightUniformsLib } from 'three/addons/lights/RectAreaLightUniformsLib.js';
import valve from '../../../../assets/levels/worldspire/resonance-kit.json' with { type: 'json' };

// A deterministic presentation mutation. The wave travels down the mineral body;
// its plates and light never change the supported road, flight or race rules.
export function awakeningPhase(track, distance) {
  return T.MathUtils.smoothstep(distance / track.finishDistance, 0.12, 0.92);
}
export function createAwakening(track, texture) {
  // LTC lookup textures belong to Three's shared lighting uniforms. Reuse them
  // across level lifecycles instead of allocating another set on every reset.
  if (!T.UniformsLib.LTC_FLOAT_1) RectAreaLightUniformsLib.init();
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
    map: texture,
    emissiveMap: texture,
    color: '#df8245',
    roughness: 0.5,
    metalness: 0.12,
    vertexColors: true,
    emissive: '#ff792a',
    emissiveIntensity: 5.2,
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
  // Blender exports seats on the actual fractured surface. Analytic cone
  // positions cannot stay attached after the silhouette or passages change.
  const heart = track.jumps.find((jump) => jump.id === 'heart-chasm');
  const stations = (valve.anchors ?? []).map((anchor) => {
    const radial = new T.Vector3(...anchor.normal).normalize();
    const right = new T.Vector3(0, 1, 0).cross(radial).normalize();
    const up = radial.clone().cross(right).normalize();
    return {
      center: new T.Vector3(...anchor.center),
      radial,
      right,
      q: new T.Quaternion().setFromRotationMatrix(
        new T.Matrix4().makeBasis(right, up, radial),
      ),
      scale: anchor.scale,
      y: anchor.y,
      distance: anchor.distance,
      hero: Boolean(anchor.hero),
      // The Heart's warm cores stay local so daylight can describe the cleft.
      lightStrength:
        heart && Math.abs(anchor.distance - heart.takeoff) < 1 ? 0.18 : 1,
    };
  });
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
  // Two fixed slots keep the warmed shader layout stable. Their rectangular
  // emission follows the exposed core, avoiding a point hotspot on its face.
  const emissionRotation = new T.Quaternion().setFromAxisAngle(
    new T.Vector3(0, 1, 0),
    Math.PI,
  );
  const lights = Array.from({ length: 2 }, () => {
    const l = new T.RectAreaLight('#ffc48a', 0, 28, 220);
    group.add(l);
    return l;
  });
  const matrix = new T.Matrix4(),
    color = new T.Color(),
    scale = new T.Vector3();
  group.userData.anchorCount = stations.length;
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
    // Surface seats carry route distance: a height-only wave can trail behind
    // a steep drop or open the wrong turn when several roads share an altitude.
    const front =
      override === null
        ? state.distance
        : T.MathUtils.lerp(-1200, track.finishDistance + 1200, phase);
    if (front !== last) {
      stations.forEach((v, i) => {
        const open = T.MathUtils.smoothstep(
          front,
          v.distance - (v.hero ? 720 : 520),
          v.distance - (v.hero ? 260 : 120),
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
      if (cores.instanceColor) cores.instanceColor.needsUpdate = true;
      for (const m of [plates, cores, roots]) m.computeBoundingSphere();
      last = front;
      group.userData.phase = phase;
    }
    if (camera) {
      const near = stations
        .filter((v) => v.open > 0.02)
        .map((v) => ({ ...v, d: v.center.distanceToSquared(camera.position) }))
        .sort((a, b) => a.d - b.d);
      lights.forEach((l, i) => {
        const v = near[i];
        l.intensity = v
          ? 8 *
            v.open *
            v.lightStrength *
            (1 - T.MathUtils.smoothstep(v.d, 460 * 460, 600 * 600))
          : 0;
        if (v) {
          l.position.copy(v.center).addScaledVector(v.radial, 10);
          l.width = 28 * v.scale;
          l.height = 220 * v.scale;
          l.quaternion.copy(v.q).multiply(emissionRotation);
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
