import * as T from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { groundFrame } from '../../../environment/placement.js';
import { createNacreOceanNormals } from '../../nacre/environment/ocean-normals.js';
import { createNacreOceanClock } from '../../nacre/environment/ocean-clock.js';
import { createFallingWaterMaterial } from '../../nightweir/environment/falling-water.js';
import { createTurbineWater } from '../../nightweir/environment/turbine-water.js';
import { finishZephyrMaterial } from './materials.js';

// Cathedral water borrows the proven Nightweir flow surfaces and lit spray.
// Every reservoir/receiver is local to Zephyr; no gameplay force or solid changes.
export function createZephyrWater(track, stoneTexture) {
  const group = new T.Group();
  group.name = 'Zephyr / silver cascades and contained receiving cisterns';
  const clock = { value: 0 },
    opening = { value: 1 };
  const advanceClock = createNacreOceanClock();
  const ripple = createNacreOceanNormals();
  const materials = new Set();
  const records = [],
    pieces = [];
  const unit = new T.BoxGeometry();
  for (const curtain of track.curtains) {
    const f = groundFrame(track, curtain.s - 55);
    const lateral = curtain.id === 'falls-curtain' ? -210 : 135;
    const point = (x, y, z) =>
      f.position
        .clone()
        .addScaledVector(f.right, lateral + x)
        .addScaledVector(f.up, y)
        .addScaledVector(f.tangent, z)
        .toArray();
    const rotation = new T.Quaternion().setFromAxisAngle(
      new T.Vector3(0, 1, 0),
      Math.atan2(f.tangent.x, f.tangent.z),
    );
    const box = (x, y, z, w, h, d) =>
      pieces.push(
        unit
          .clone()
          .applyMatrix4(
            new T.Matrix4().compose(
              new T.Vector3(...point(x, y, z)),
              rotation,
              new T.Vector3(w, h, d),
            ),
          ),
      );
    const impact = point(0, 25, 25);
    records.push({
      id: curtain.id,
      discharge: {
        width: 27,
        height: 5.5,
        impact,
        jet: [
          point(0, 164, 1),
          point(0, 153, 8),
          point(0, 112, 16),
          point(0, 63, 22),
          impact,
        ],
      },
      basin: {
        center: point(0, 25, 38),
        waterY: impact[1],
        along: f.right.toArray(),
        out: f.tangent.toArray(),
        width: 72,
        length: 90,
      },
      runoff: {
        width: 24,
        points: [
          point(0, 25, 83),
          point(0, 20, 91),
          point(0, -45, 105),
          point(0, -185, 119),
          point(0, -360, 128),
        ],
      },
    });
    // Receiver bed, massive side walls and a real open outlet below the foam.
    box(0, 18, 38, 82, 12, 100);
    for (const side of [-1, 1]) {
      box(side * 39, 29, 38, 6, 16, 100);
      box(side * 39, 37.5, 38, 8, 2, 100);
      box(side * 30, -22, 29, 12, 76, 59);
      box(side * 30, -62, 29, 22, 8, 68);
      box(side * 27, 31, 86, 24, 16, 5);
    }
    box(0, 29, -10, 82, 16, 6);
    box(0, 21, 86, 26, 4, 8);
  }
  unit.dispose();
  const stone = new T.MeshStandardMaterial({
    name: 'Zephyr receiver dressed limestone',
    color: '#8e8b7e',
    roughness: 0.84,
  });
  finishZephyrMaterial(stone, { stoneTexture });
  const geometry = mergeGeometries(pieces);
  pieces.forEach((g) => g.dispose());
  const containment = new T.Mesh(geometry, stone);
  containment.name = 'Zephyr / cistern beds piers and spill mouths';
  containment.castShadow = true;
  containment.receiveShadow = true;
  group.add(containment);
  const hydraulic = createTurbineWater(records, clock, ripple);
  group.add(hydraulic.group);
  const adapted = new Set();
  hydraulic.group.traverse((o) => {
    if (
      !o.isMesh ||
      adapted.has(o.material) ||
      !/tailrace|fringes/.test(o.material.name)
    )
      return;
    const m = o.material,
      compile = m.onBeforeCompile;
    adapted.add(m);
    m.onBeforeCompile = (shader) => {
      compile(shader);
      shader.fragmentShader = shader.fragmentShader.replace(
        'diffuseColor.rgb=mix(vec3(.036,.10,.11),vec3(.46,.56,.55),foam);',
        'float silverFlow=max(jet,channel); foam=clamp(foam+silverFlow*(.13+.25*turbulence),0.,.88); diffuseColor.rgb=mix(vec3(.04,.10,.13),vec3(.52,.64,.66),foam);',
      );
    };
    const flowCompile = m.onBeforeCompile;
    m.onBeforeCompile = (shader) => {
      flowCompile(shader);
      shader.fragmentShader = shader.fragmentShader
        .replace('p.x*.23,movingY*.067', 'p.x*.57,movingY*.14')
        .replace(
          'vHydroData.x*.18,movingY*.09',
          'vHydroData.x*.42,movingY*.21',
        );
    };
    m.customProgramCacheKey = () =>
      `zephyr-silver-hydraulics-v6-${m.transparent}`;
  });
  let disposed = false;
  return {
    group,
    clock,
    finishMesh(mesh, crossing = false, { wake = false } = {}) {
      const original = mesh.geometry;
      original.computeBoundingBox();
      const oldBounds = original.boundingBox;
      const flat = oldBounds.max.y - oldBounds.min.y < 5;
      // Unequal corrugated strands replace the old stacked lobes.
      // Each source remains pinned while water accelerates below it.
      if (!flat && !/deep volume/i.test(mesh.material.name))
        mesh.visible = false;
      if (!flat && mesh.visible) {
        const width = wake ? 118 : crossing ? 98 : 68,
          height = crossing ? 245 : 360;
        const positions = [],
          indices = [],
          ends = [],
          strandUV = [];
        const columns = 10,
          rows = 72;
        const strands = wake
          ? [
              [-0.2, 0.58, 0.94],
              [0.19, 0.48, 1],
            ]
          : crossing
            ? [
                [-0.42, 0.18, 1],
                [-0.22, 0.1, 0.87],
                [0.2, 0.1, 0.94],
                [0.41, 0.19, 1],
              ]
            : [
                [-0.4, 0.19, 0.91],
                [-0.18, 0.13, 0.76],
                [0.025, 0.22, 1],
                [0.23, 0.12, 0.84],
                [0.41, 0.16, 0.94],
              ];
        for (let n = 0; n < strands.length; n++) {
          const [center, span, end] = strands[n],
            offset = positions.length / 3;
          for (let y = 0; y <= rows; y++)
            for (let x = 0; x <= columns; x++) {
              const q = y / rows,
                u = x / columns - 0.5,
                h = q * height * end;
              const travel = (Math.sqrt(144 + 19.62 * h) - 12) / 9.81;
              const widthScale = 1 - q * 0.3 + q * q * 0.48;
              const xPos =
                width * (center + u * span * widthScale) +
                Math.sin(q * (wake ? 18 : 8) + n * 2) * q * (wake ? 10 : 2);
              positions.push(
                xPos,
                -h,
                22 * q * q +
                  ((n % 3) - 1) * q * 5 +
                  Math.sin(u * 7 + travel * 2 + n) * (0.25 + q * 1.4),
              );
              ends.push(height * end);
              strandUV.push(x / columns);
              if (y < rows && x < columns) {
                const a = offset + y * (columns + 1) + x;
                indices.push(
                  a,
                  a + columns + 1,
                  a + 1,
                  a + 1,
                  a + columns + 1,
                  a + columns + 2,
                );
              }
            }
        }
        const flow = new T.BufferGeometry();
        flow.setAttribute(
          'position',
          new T.Float32BufferAttribute(positions, 3),
        );
        flow.setAttribute('strandEnd', new T.Float32BufferAttribute(ends, 1));
        flow.setAttribute('strandU', new T.Float32BufferAttribute(strandUV, 1));
        flow.setIndex(indices);
        flow.computeVertexNormals();
        flow.computeBoundingSphere();
        flow.boundingSphere.radius += 3;
        mesh.geometry = flow;
        original.dispose();
      }
      const g = mesh.geometry,
        p = g.attributes.position;
      g.computeBoundingBox();
      const bounds = g.boundingBox,
        width = Math.max(1, bounds.max.x - bounds.min.x),
        height = Math.max(1, bounds.max.y - bounds.min.y);
      if (!g.attributes.strandU)
        g.setAttribute(
          'strandU',
          new T.Float32BufferAttribute(new Array(p.count).fill(0.5), 1),
        );
      if (!g.attributes.strandEnd)
        g.setAttribute(
          'strandEnd',
          new T.Float32BufferAttribute(new Array(p.count).fill(height), 1),
        );
      const uv = [],
        phase = [],
        crossed = [],
        released = [],
        widths = [],
        heights = [],
        right = [];
      for (let i = 0; i < p.count; i++) {
        uv.push(p.getX(i) - bounds.min.x, Math.max(0, -p.getY(i)));
        phase.push(0.37);
        crossed.push(crossing ? 1 : 0);
        released.push(0);
        widths.push(width);
        heights.push(height);
        right.push(1, 0, 0);
      }
      for (const [name, data, size] of [
        ['uv', uv, 2],
        ['sourcePhase', phase, 1],
        ['crossed', crossed, 1],
        ['releaseAt', released, 1],
        ['sheetWidth', widths, 1],
        ['sheetHeight', heights, 1],
        ['flowRight', right, 3],
      ])
        g.setAttribute(name, new T.Float32BufferAttribute(data, size));
      const m = createFallingWaterMaterial(clock, opening, ripple);
      m.name = 'Zephyr / gravity accelerated silver water';
      m.envMapIntensity = 0.45;
      const compile = m.onBeforeCompile;
      m.onBeforeCompile = (shader) => {
        compile(shader);
        shader.vertexShader =
          'uniform float waterTime;attribute float strandEnd;attribute float strandU;varying float vStrandEnd;varying float vStrandU;\n' +
          shader.vertexShader.replace(
            '#include <begin_vertex>',
            `#include <begin_vertex>
          vStrandEnd=strandEnd;vStrandU=strandU;
          float fallAge=(sqrt(144.+19.62*max(0.,-position.y))-12.)/9.81;
          float attached=smoothstep(0.,8.,-position.y);
          transformed.z+=attached*(sin(position.x*.6+fallAge*3.-waterTime*3.)*.55+sin(position.x*1.7-fallAge*2.+waterTime*2.)*.18);`,
          );
        shader.fragmentShader =
          'varying float vStrandEnd;varying float vStrandU;\n' +
          shader.fragmentShader
            .replace(
              'vec2(vFlow.x*.065+vSource.x*3.7,falling*.85)',
              'vec2(vFlow.x*.31+vSource.x*3.7,falling*2.7)',
            )
            .replace(
              'vec3(.018,.066,.079),vec3(.73,.79,.80)',
              'vec3(.025,.075,.095),vec3(.42,.53,.56)',
            )
            .replace(
              'diffuseColor.a+=edge*foam*mix(.12,.07,vSource.y);',
              `diffuseColor.a+=edge*foam*mix(.12,.07,vSource.y);
          float middle=abs(vFlow.x-${(-bounds.min.x).toFixed(4)});
          diffuseColor.a*=mix(1.,mix(.12,3.2,smoothstep(13.,30.,middle)),vSource.y);
          diffuseColor.a*=1.-smoothstep(vStrandEnd*.78,vStrandEnd,vFlow.y);
          float edgeDistance=abs(vFlow.x-vSize.x*.5)/(vSize.x*.5);
          float brokenEdge=.72+.17*fallNoise(vec2(falling*1.6,vSource.x+3.))+.08*fallNoise(vec2(falling*4.3,vFlow.x*.3));
          float edgeStream=smoothstep(.28,.72,ropes*.7+lace*.3);
          diffuseColor.a*=mix(1.,edgeStream*.7,smoothstep(brokenEdge-.07,brokenEdge+.04,edgeDistance)*smoothstep(8.,38.,vFlow.y));
          float strandEdge=smoothstep(0.,.18,vStrandU)*(1.-smoothstep(.82,1.,vStrandU));
          float tears=smoothstep(.16,.43,ropes*.65+lace*.35);
          diffuseColor.a*=strandEdge*mix(.35,1.,tears);
          ${wake ? 'float wakePatch=fallNoise(vec2(vFlow.x*.08,falling*1.15));diffuseColor.a*=mix(1.,smoothstep(.29,.64,wakePatch),smoothstep(25.,100.,down));' : ''}
          diffuseColor.a*=.76+.24*edgeStream;
          diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.55,.64,.65),pow(foam,3.)*.3);`,
            );
      };
      m.customProgramCacheKey = () =>
        `zephyr-nightweir-fall-v18-${crossing}-${bounds.min.x}-${height}`;
      materials.add(m);
      mesh.material = m;
      mesh.castShadow = false;
      mesh.userData.aoExclude = true;
    },
    update(frame) {
      const time = advanceClock(frame);
      clock.value = frame.settings.reducedMotion ? 0 : time;
      hydraulic.update();
    },
    setReflection(texture) {
      hydraulic.setReflection(texture);
      materials.forEach((m) => {
        m.envMap = texture;
        m.needsUpdate = true;
      });
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      hydraulic.dispose();
      geometry.dispose();
      stone.dispose();
      materials.forEach((m) => m.dispose());
      ripple.dispose();
      group.clear();
    },
  };
}
