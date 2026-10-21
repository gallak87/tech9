import * as T from 'three';
import { Water } from '@worldkit/environment/water';
import { createOceanNormals } from '@worldkit/environment/ocean';
import { createLifetime } from '../../../core/lifecycle.js';
import { OPALINE_SUN } from '../backdrop/index.js';

const LEVEL = 82,
  START = 285,
  END = 675;

/** A contained upper reservoir. Materials/peers are borrowed; this owner releases
 * all geometry, the normal texture, reflection target and spill material.
 */
export function createSpillwayBasins({
  track,
  materials,
  settings = {},
  reflectionPeers = [],
}) {
  const lifetime = createLifetime(),
    group = new T.Group();
  group.name = 'Opaline / raised mineral spillway reservoir';
  let disposed = false;
  lifetime.defer(() => group.clear());
  try {
    const boundary = [],
      rows = 64;
    const at = (s, distance, y = LEVEL) => {
      const f = track.sample(s),
        p = f.position.clone().addScaledVector(f.right, -distance);
      p.y = y;
      return p;
    };
    const near = (s) => 31 + 2 * Math.sin(s * 0.031);
    const width = (t) => 9 + 126 * Math.pow(Math.sin(Math.PI * t), 0.62);
    for (let i = 0; i <= rows; i++) {
      const s = START + ((END - START) * i) / rows;
      boundary.push({ p: at(s, near(s)), s, outer: false });
    }
    for (let i = rows; i >= 0; i--) {
      const t = i / rows,
        s = START + (END - START) * t;
      boundary.push({ p: at(s, near(s) + width(t)), s, outer: true });
    }
    const midpoint = boundary
      .reduce((sum, item) => sum.add(item.p), new T.Vector3())
      .multiplyScalar(1 / boundary.length);
    const shape = new T.Shape(
      boundary.map(({ p }) => new T.Vector2(p.x, -p.z)),
    );
    const geometry = lifetime.own(new T.ShapeGeometry(shape));
    const normals = lifetime.own(createOceanNormals(128));
    const water = lifetime.own(
      new Water(geometry, {
        waterNormals: normals,
        waterColor: '#096a4a',
        sunColor: '#fff8e8',
        sunDirection: OPALINE_SUN.clone().normalize(),
        distortionScale: 0.42,
        quality: 'low',
        fog: true,
        surface: {
          declarations: '',
          normal: 'vec3 surfaceNormal=normalize(noise.xzy*vec3(.24,1.,.24));',
          shading: `float poolDepth=.5+.5*sin(worldPosition.x*.017+sin(worldPosition.z*.024));
          albedo=mix(albedo,vec3(.009,.085,.045),.28+poolDepth*.13);
          float mineralRipple=pow(max(0.,sin(worldPosition.x*.11+worldPosition.z*.087-time*.55)),22.);
          albedo+=vec3(.022,.045,.029)*mineralRipple;`,
        },
      }),
    );
    water.name = 'Opaline / contained upper emerald water';
    water.rotation.x = -Math.PI / 2;
    water.position.y = LEVEL;
    water.material.uniforms.size.value = 1.15;
    water.userData.aoExclude = true;
    group.add(water);

    // Real mineral banks contain the finite waterline and continue below the
    // deep river. Narrow near-bank rings join the existing driving escarpment.
    const positions = [],
      uvs = [],
      indices = [],
      count = boundary.length;
    const profiles = [
      [0, LEVEL - 2.5],
      [3, LEVEL + 1.7],
      [8, LEVEL - 1],
      [13, LEVEL - 20],
      [9, -31],
    ];
    for (let ring = 0; ring < profiles.length; ring++) {
      const [outset, height] = profiles[ring];
      for (let i = 0; i < count; i++) {
        const item = boundary[i],
          previous = boundary[(i + count - 1) % count].p,
          next = boundary[(i + 1) % count].p;
        const tangent = next.clone().sub(previous).setY(0).normalize();
        const outward = new T.Vector3(tangent.z, 0, -tangent.x);
        const p = item.p
          .clone()
          .addScaledVector(outward, item.outer ? outset : outset * 0.35);
        const spillMouth = item.outer && Math.abs(item.s - 625) < 14;
        const erosion =
          Math.sin(item.s * 0.073) * 1.25 + Math.sin(item.s * 0.019) * 0.8;
        p.y =
          spillMouth && ring <= 2
            ? LEVEL - 0.45
            : height + erosion * (ring === 4 ? 0.3 : 1);
        if (ring === 1 && !spillMouth) p.y = Math.max(LEVEL + 0.9, p.y);
        positions.push(...p.toArray());
        uvs.push(item.s / 16, ring * 0.5);
        if (ring < profiles.length - 1) {
          const a = ring * count + i,
            b = ring * count + ((i + 1) % count);
          indices.push(a, b, a + count, b, b + count, a + count);
        }
      }
    }
    const bottom = positions.length / 3;
    positions.push(midpoint.x, -32, midpoint.z);
    uvs.push(0, 0);
    for (let i = 0; i < count; i++)
      indices.push(
        bottom,
        (profiles.length - 1) * count + i,
        (profiles.length - 1) * count + ((i + 1) % count),
      );
    const bowlGeometry = lifetime.own(new T.BufferGeometry());
    bowlGeometry.setAttribute(
      'position',
      new T.Float32BufferAttribute(positions, 3),
    );
    bowlGeometry.setAttribute('uv', new T.Float32BufferAttribute(uvs, 2));
    bowlGeometry.setIndex(indices);
    bowlGeometry.computeVertexNormals();
    bowlGeometry.computeBoundingSphere();
    const bowl = new T.Mesh(bowlGeometry, materials.stone);
    bowl.name = 'Opaline / solid mineral reservoir bowl';
    bowl.castShadow = bowl.receiveShadow = true;
    group.add(bowl);

    // The narrow outlet crosses a lowered outer lip, then drains into the deep
    // river. Its entire footprint lies away from the driving shelf.
    const spillPositions = [],
      spillUVs = [],
      spillIndices = [];
    const spillRows = 18,
      spillColumns = 8;
    for (let row = 0; row <= spillRows; row++) {
      const t = row / spillRows;
      for (let col = 0; col <= spillColumns; col++) {
        const u = col / spillColumns,
          s = 625 + (u - 0.5) * (22 - 5 * t);
        const progress = (s - START) / (END - START);
        const d =
          near(s) +
          width(progress) -
          1 +
          5 * Math.sin(t * Math.PI * 0.5) +
          10 * t;
        const p = at(s, d, LEVEL - 0.06 - 105.74 * Math.pow(t, 1.18));
        spillPositions.push(...p.toArray());
        spillUVs.push(u, t);
        if (row < spillRows && col < spillColumns) {
          const a = row * (spillColumns + 1) + col;
          spillIndices.push(
            a,
            a + 1,
            a + spillColumns + 1,
            a + 1,
            a + spillColumns + 2,
            a + spillColumns + 1,
          );
        }
      }
    }
    const spillGeometry = lifetime.own(new T.BufferGeometry());
    spillGeometry.setAttribute(
      'position',
      new T.Float32BufferAttribute(spillPositions, 3),
    );
    spillGeometry.setAttribute('uv', new T.Float32BufferAttribute(spillUVs, 2));
    spillGeometry.setIndex(spillIndices);
    spillGeometry.computeVertexNormals();
    spillGeometry.computeBoundingSphere();
    const clock = { value: 0 };
    const spillMaterial = lifetime.own(
      new T.ShaderMaterial({
        name: 'Opaline / reservoir lip drainage',
        transparent: true,
        depthWrite: false,
        side: T.DoubleSide,
        uniforms: { clock },
        vertexShader:
          'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
        fragmentShader: `varying vec2 vUv;uniform float clock;void main(){
        float edge=smoothstep(0.,.16,vUv.x)*smoothstep(0.,.16,1.-vUv.x);
        float streak=pow(.5+.5*sin(vUv.x*59.+sin(vUv.y*7.-clock)*.65),8.);
        float fall=.5+.5*sin(vUv.y*51.-clock*3.5+vUv.x*9.);
        gl_FragColor=vec4(mix(vec3(.025,.24,.14),vec3(.42,.66,.48),streak*(.5+fall*.3)),edge*(.5+streak*.35));
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
      }),
    );
    const spill = new T.Mesh(spillGeometry, spillMaterial);
    spill.name = 'Opaline / upper reservoir to deep river spill';
    spill.userData.aoExclude = true;
    group.add(spill);

    // Avoid recursive work between this bounded reflector and the deep river.
    const reflect = water.onBeforeRender;
    water.onBeforeRender = function (renderer, scene, camera) {
      if (
        reflectionPeers.some(
          (peer) => renderer.getRenderTarget() === peer?.renderTarget,
        )
      )
        return;
      const hidden = [];
      scene.traverse((object) => {
        if (object !== water && object.isWater && object.visible) {
          hidden.push(object);
          object.visible = false;
        }
      });
      try {
        reflect.call(this, renderer, scene, camera);
      } finally {
        for (const object of hidden) object.visible = true;
      }
    };
    let lastQuality;
    const configure = (quality) => {
      const next = quality === 'low' ? 'low' : 'high';
      if (lastQuality === next) return;
      lastQuality = next;
      water.renderTarget.setSize(
        next === 'low' ? 256 : 384,
        next === 'low' ? 256 : 384,
      );
      water.reflectionStride = next === 'low' ? 18 : 10;
      water.invalidateReflection();
    };
    configure(settings.quality);
    const metrics = {
      start: START,
      end: END,
      level: LEVEL,
      waterTriangles: geometry.index.count / 3,
      bowlTriangles: bowlGeometry.index.count / 3,
      spillTriangles: spillIndices.length / 3,
    };
    group.userData.metrics = metrics;
    return {
      group,
      water,
      metrics,
      update(frame = {}) {
        if (disposed) return;
        const current = frame.settings ?? settings;
        configure(current.quality);
        const time = current.reducedMotion
          ? 0
          : (frame.time ?? frame.state?.time ?? 0);
        water.material.uniforms.time.value = time * 0.25;
        clock.value = time;
        if (frame.camera) {
          group.visible =
            frame.camera.position.distanceToSquared(midpoint) < 1700 ** 2;
          if (frame.reset) water.invalidateReflection();
        }
      },
      dispose() {
        if (disposed) return;
        disposed = true;
        lifetime.dispose();
      },
    };
  } catch (error) {
    lifetime.dispose();
    throw error;
  }
}
