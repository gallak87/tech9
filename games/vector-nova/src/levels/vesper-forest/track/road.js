import { replaceShader } from '../../../renderer/shader-patch.js';
import * as T from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { sweepGeometry, boxProfile } from '../../../track/geometry.js';
import { framePoint } from '../../../track/frames.js';
import { declareCollisionSolid } from '../../../physics/solid-metadata.js';

const routeCoordinates = Object.freeze({
  attribute: 'roadCoord',
  distance: 0,
  lateral: 1,
});

const inside = (s, j) => s > j.takeoff && s < j.landingStart;

function mergeParts(group, parts, material, name) {
  if (!parts.length) return;
  const geometry = mergeGeometries(parts, false);
  parts.forEach((g) => g.dispose());
  const mesh = new T.Mesh(geometry, material);
  mesh.name = name;
  mesh.receiveShadow = true;
  group.add(mesh);
  return mesh;
}

// Cut decorative laminae directly from the submitted driving triangles. An
// independently swept thin layer intersects banked quads along their diagonals.
function deckPatch(surface, x0, x1, s0, s1, offset, shape) {
  const { position, uv, normal: sourceNormals } = surface.geometry.attributes;
  const source = surface.geometry.index;
  const positions = [],
    normals = [],
    uvs = [],
    indices = [];
  const cuts = [
    (v) => v.x - x0,
    (v) => x1 - v.x,
    (v) => v.s - s0,
    (v) => s1 - v.s,
  ];
  if (shape) {
    const area = shape.reduce((sum, a, i) => {
      const b = shape[(i + 1) % shape.length];
      return sum + a[0] * b[1] - b[0] * a[1];
    }, 0);
    for (let i = 0; i < shape.length; i++) {
      const a = shape[i],
        b = shape[(i + 1) % shape.length];
      cuts.push(
        (v) =>
          ((b[0] - a[0]) * (v.s - a[1]) - (b[1] - a[1]) * (v.x - a[0])) *
          Math.sign(area),
      );
    }
  }
  const right = surface.userData.rightEdge;
  for (let i = 0; i < source.count; i += 3) {
    let polygon = [0, 1, 2].map((j) => {
      const index = source.getX(i + j);
      return {
        x: -14 + uv.getX(index) * (right + 14),
        s: uv.getY(index) * 16,
        p: new T.Vector3().fromBufferAttribute(position, index),
        normal: new T.Vector3().fromBufferAttribute(sourceNormals, index),
      };
    });
    if (polygon.every((v) => v.s < s0) || polygon.every((v) => v.s > s1))
      continue;
    for (const distance of cuts) {
      const clipped = [];
      for (let j = 0; j < polygon.length; j++) {
        const a = polygon[j],
          b = polygon[(j + 1) % polygon.length];
        const da = distance(a),
          db = distance(b);
        if (da >= 0) clipped.push(a);
        if (da >= 0 !== db >= 0) {
          const t = da / (da - db);
          clipped.push({
            x: T.MathUtils.lerp(a.x, b.x, t),
            s: T.MathUtils.lerp(a.s, b.s, t),
            p: a.p.clone().lerp(b.p, t),
            normal: a.normal.clone().lerp(b.normal, t),
          });
        }
      }
      polygon = clipped;
    }
    for (let j = 1; j < polygon.length - 1; j++) {
      const triangle = [polygon[0], polygon[j], polygon[j + 1]];
      if (
        new T.Vector3()
          .crossVectors(
            triangle[1].p.clone().sub(triangle[0].p),
            triangle[2].p.clone().sub(triangle[0].p),
          )
          .lengthSq() < 1e-12
      )
        continue;
      for (const vertex of triangle) {
        const normal = vertex.normal.clone().normalize();
        const point = vertex.p.clone().addScaledVector(normal, offset);
        normals.push(...normal.toArray());
        indices.push(positions.length / 3);
        positions.push(...point.toArray());
        uvs.push((vertex.x + 14) / 28, vertex.s / 16);
      }
    }
  }
  const geometry = new T.BufferGeometry();
  geometry.setAttribute('position', new T.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new T.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.setAttribute('normal', new T.Float32BufferAttribute(normals, 3));
  geometry.computeBoundingSphere();
  return geometry;
}

export function createVesperRoad({ track, shape = false }) {
  const group = new T.Group();
  group.name = shape ? 'Vesper route study' : 'Cast amber transport ribbon';
  // Opaque amber keeps the sheen and internal parallax without an additional
  // scene transmission pass, which was costly for little visible benefit.
  const lightScale = shape ? 1 : 1.1;
  const amber = new T.MeshPhysicalMaterial({
    color: shape ? 0x88959c : 0xcb781e,
    roughness: 0.3,
    metalness: 0.02,
    clearcoat: 0.22,
    clearcoatRoughness: 0.33,
    specularIntensity: 0.26,
    specularColor: 0xffd8a0,
    emissive: shape ? 0 : 0x512503,
    emissiveIntensity: 0.13 * lightScale,
  });
  const milk = new T.MeshPhysicalMaterial({
    name: 'Clouded honey resin',
    color: shape ? 0xc1c9cc : 0xad8048,
    roughness: 0.42,
    metalness: 0.02,
    clearcoat: shape ? 0 : 0.14,
    clearcoatRoughness: 0.4,
    specularIntensity: 0.2,
    specularColor: 0xf4d6aa,
  });
  const smoked = new T.MeshStandardMaterial({
    color: shape ? 0x7b8b90 : 0x673715,
    roughness: 0.72,
    metalness: 0.02,
  });
  const polished = new T.MeshPhysicalMaterial({
    color: shape ? 0x9faab0 : 0xda8a27,
    roughness: 0.18,
    metalness: 0.02,
    clearcoat: 0.3,
    clearcoatRoughness: 0.32,
    specularIntensity: 0.28,
    specularColor: 0xffd8a0,
    emissive: shape ? 0 : 0x592503,
    emissiveIntensity: 0.12 * lightScale,
  });
  const core = new T.MeshPhysicalMaterial({
    color: shape ? 0x8d969b : 0xd57a1d,
    roughness: 0.3,
    metalness: 0.02,
    clearcoat: 0.2,
    clearcoatRoughness: 0.3,
    specularIntensity: 0.27,
    specularColor: 0xffd39a,
    emissive: shape ? 0 : 0x9d4103,
    emissiveIntensity: shape ? 0 : 0.22 * lightScale,
  });
  const vein = new T.MeshStandardMaterial({
    color: 0xffc46e,
    emissive: 0xf2a327,
    emissiveIntensity: shape ? 0 : 1.6 * lightScale,
    roughness: 0.45,
  });
  const sap = new T.MeshPhysicalMaterial({
    color: 0x6b2c0c,
    emissive: 0x542006,
    emissiveIntensity: 0.1 * lightScale,
    roughness: 0.26,
    clearcoat: 0.48,
    clearcoatRoughness: 0.3,
    specularIntensity: 0.28,
  });
  const sapEdge =
    !shape &&
    new T.MeshStandardMaterial({
      name: 'Pale gold sap margins / dry resin guidance',
      color: 0xffe5a0,
      emissive: 0xe8a329,
      emissiveIntensity: 0.45,
      roughness: 0.45,
    });
  const sapClock = { value: 0 };
  const resinLayers = { value: 6 };
  for (const material of shape
    ? []
    : [amber, polished, core, milk, smoked, sap]) {
    const flowing = material === sap;
    material.onBeforeCompile = (shader) => {
      shader.uniforms.vesperSapTime = sapClock;
      shader.uniforms.vesperResinLayers = resinLayers;
      shader.vertexShader =
        `varying vec2 vVesperUv;
        attribute vec3 vesperResinCoord, vesperResinRight, vesperResinUp, vesperResinTangent;
        attribute float vesperResinActive;
        varying vec3 vVesperResinCoord, vVesperResinView, vVesperResinNormal;
        varying float vVesperResinActive;
        ` +
        replaceShader(
          shader.vertexShader,
          '#include <begin_vertex>',
          `#include <begin_vertex>
            vVesperUv=uv;
            vVesperResinActive=vesperResinActive;
            vVesperResinCoord=vesperResinCoord;
            vec3 resinEye=cameraPosition-(modelMatrix*vec4(transformed,1.)).xyz;
            vec3 resinNormal=normalize(mat3(modelMatrix)*normal);
            vVesperResinView=vec3(dot(resinEye,vesperResinRight),dot(resinEye,vesperResinUp),dot(resinEye,vesperResinTangent));
            vVesperResinNormal=vec3(dot(resinNormal,vesperResinRight),dot(resinNormal,vesperResinUp),dot(resinNormal,vesperResinTangent));`,
        );
      shader.fragmentShader =
        `varying vec2 vVesperUv;
        uniform float vesperSapTime, vesperResinLayers;
        varying vec3 vVesperResinCoord, vVesperResinView, vVesperResinNormal;
        varying float vVesperResinActive;
        // Resin reflects the moon without an HDR lobe bleaching the driving lane.
        vec3 resinReflectionShoulder(vec3 radiance, float limit) {
          return radiance/(1.+max(max(radiance.r,radiance.g),radiance.b)/limit);
        }
        float resinHash(vec2 p) { return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); }
        float resinNoise(vec2 p) {
          vec2 i=floor(p),f=fract(p); f=f*f*(3.-2.*f);
          return mix(mix(resinHash(i),resinHash(i+vec2(1,0)),f.x),mix(resinHash(i+vec2(0,1)),resinHash(i+vec2(1,1)),f.x),f.y);
        }
        ` +
        replaceShader(
          replaceShader(
            replaceShader(
              replaceShader(
                replaceShader(
                  shader.fragmentShader,
                  '#include <color_fragment>',
                  `#include <color_fragment>
        float longitudinal = vVesperUv.y * 16.0;
        vec2 resinP = vec2(vVesperUv.x * 28.0, longitudinal);
        vec2 warp = vec2(resinNoise(resinP * .09),resinNoise(resinP * .08 + 19.0));
        float cloud = resinNoise(resinP * .18 + warp * 3.0);
        float deep = resinNoise(resinP * .37 + warp * 4.0 + 8.0);
        float filament = 1.0-smoothstep(.012,.06,abs(deep-.49));
        diffuseColor.rgb *= .83 + .26 * cloud;
        diffuseColor.rgb += vec3(.035,.014,.002)*filament*(.3+.7*cloud);
        vec3 vesperInterior=vec3(0.);
        if(${flowing ? 'false' : 'vVesperResinActive>.5'}) {
          // Six refracted interior layers give inclusions real view parallax.
          // The shared probe supplies reflections; these local inclusions
          // sample no background scene and add no further render pass.
          vec3 entryNormal=normalize(vVesperResinNormal);
          vec3 interiorRay=refract(-normalize(vVesperResinView),entryNormal,.68);
          for(int layer=0;layer<6;layer++) {
            if(float(layer)>=vesperResinLayers) break;
            float depth=(float(layer)+.5)*3.8/vesperResinLayers;
            vec3 p=vVesperResinCoord+interiorRay*depth;
            float curl=sin(p.x*.78+sin(p.z*.17+p.y*1.3)*2.1)+.42*sin(p.z*.43-p.y*1.7);
            float strand=1.-smoothstep(.025,.085+fwidth(curl)*.8,abs(curl));
            vec3 cells=p*vec3(.5,.65,.5);
            vec3 cell=floor(cells);
            float seed=resinHash(cell.xz+cell.y*13.7);
            vec3 bead=fract(cells)-vec3(.3+seed*.35,.4,.4);
            float bubble=(1.-smoothstep(.045,.085,abs(length(bead)-.12)))*step(.83,seed);
            float soft=.5+.5*sin(p.z*.24+sin(p.x*.35)+p.y*1.7);
            vec3 attenuation=exp(-vec3(.12,.42,.9)*depth*.6);
            float edgeLight=.22+.78*exp(-abs(abs(p.x)-14.)*.2);
            vesperInterior+=vec3(1.,.43,.045)*attenuation*edgeLight*(strand*.35+bubble*.72+soft*.035)/vesperResinLayers;
          }
          diffuseColor.rgb*=.72+.25*cloud;
          diffuseColor.rgb+=vesperInterior*.9;
        }
        ${
          flowing
            ? `
          float flow = pow(.5+.5*sin(longitudinal*.7-vesperSapTime*.65+sin(resinP.x*1.8+cloud*4.)),7.);
          float bubbles = smoothstep(.76,.91,resinNoise(resinP*.9+vec2(0.,vesperSapTime*.12)));
          diffuseColor.rgb = mix(diffuseColor.rgb*.62,vec3(.48,.17,.025),flow*.75+bubbles*.22);
          diffuseColor.rgb += vec3(.075,.025,.003)*bubbles;
        `
            : ''
        }
      `,
                ),
                'vec3 totalSpecular = reflectedLight.directSpecular + reflectedLight.indirectSpecular;',
                'vec3 totalSpecular = resinReflectionShoulder(reflectedLight.directSpecular + reflectedLight.indirectSpecular, .24);',
              ),
              '( clearcoatSpecularDirect + clearcoatSpecularIndirect ) * material.clearcoat',
              'resinReflectionShoulder((clearcoatSpecularDirect + clearcoatSpecularIndirect) * material.clearcoat, .12)',
            ),
            '#include <roughnessmap_fragment>',
            '#include <roughnessmap_fragment>\n roughnessFactor*=.78+.4*cloud;',
          ),
          '#include <emissivemap_fragment>',
          '#include <emissivemap_fragment>\n totalEmissiveRadiance+=vesperInterior*.22;',
        );
    };
    material.customProgramCacheKey = () =>
      flowing ? 'vesper-flow-v9-resin-orange' : 'vesper-lamina-v7';
  }
  const halfWidth = track.width / 2;
  const slices = [
    0,
    track.length,
    ...track.jumps.flatMap((j) => [j.takeoff, j.landingStart]),
    ...track.sections.map((s) => s.end),
  ]
    .sort((a, b) => a - b)
    .filter((s, i, a) => !i || s - a[i - 1] > 0.001);
  for (let i = 0; i < slices.length - 1; i++) {
    const start = slices[i],
      end = slices[i + 1],
      mid = (start + end) / 2;
    const gap = track.jumps.find((j) => inside(mid, j));
    if (gap) continue;
    const right = halfWidth;
    const twisting = track.inversions.some(
      (roll) => roll.start < end && roll.end > start,
    );
    const section = track.sections.find((s) => mid >= s.start && mid < s.end);
    const mat =
      section?.id === 'rootfall'
        ? smoked
        : section?.id === 'bloom'
          ? milk
          : amber;
    const surface = new T.Mesh(
      sweepGeometry(
        track,
        [
          [-halfWidth, 0],
          [right, 0],
        ],
        { start, end, step: 1, transverseStep: twisting ? 1 : 2 },
      ),
      mat,
    );
    surface.name = 'Cast resin driving surface';
    surface.userData.drivingSurface = true;
    surface.userData.roadSurface = true;
    surface.userData.rightEdge = right;
    declareCollisionSolid(surface, {
      id: 'cast-resin-driving-surface',
      kind: 'deck',
      routeCoordinates,
    });
    surface.receiveShadow = true;
    group.add(surface);
    const thickness = new T.Mesh(
      sweepGeometry(
        track,
        [
          [-halfWidth, 0],
          [-halfWidth - 1.8, -1.4],
          [-halfWidth + 1.8, -4.2],
          [right - 1.8, -4.2],
          [right + 1.8, -1.4],
          [right, 0],
        ],
        { start, end, step: 4 },
      ),
      shape ? smoked : core,
    );
    // This open lower profile runs left to right, opposite the outer shell.
    // Flip winding without changing its vertices or banked quad diagonals.
    const undersideIndices = thickness.geometry.index;
    for (let j = 0; j < undersideIndices.count; j += 3) {
      const b = undersideIndices.getX(j + 1);
      undersideIndices.setX(j + 1, undersideIndices.getX(j + 2));
      undersideIndices.setX(j + 2, b);
    }
    thickness.geometry.computeVertexNormals();
    thickness.name = 'Thick cast resin sides and underside';
    declareCollisionSolid(thickness, {
      id: 'thick-cast-resin-sides-and-underside',
      kind: 'structure',
      routeCoordinates,
    });
    group.add(thickness);
    for (const sign of [-1, 1]) {
      const curb = new T.Mesh(
        sweepGeometry(
          track,
          boxProfile(sign * (halfWidth + 0.75), 0.6, 1.5, 1.2),
          {
            start,
            end,
            step: 4,
          },
        ),
        shape ? milk : core,
      );
      curb.name = 'Continuous cast resin curb';
      declareCollisionSolid(curb, {
        id: 'continuous-cast-resin-curb',
        kind: 'rail',
        roadBoundary: true,
        routeCoordinates,
      });
      group.add(curb);
      group.add(
        new T.Mesh(
          sweepGeometry(
            track,
            boxProfile(sign * (halfWidth - 0.52), 0.07, 0.23, 0.1),
            {
              start,
              end,
              step: 4,
            },
          ),
          vein,
        ),
      );
      group.add(
        new T.Mesh(
          sweepGeometry(
            track,
            [
              [sign * 8, -2.3],
              [sign * 10, -3.5],
            ],
            { start, end, step: 5 },
          ),
          amber,
        ),
      );
    }
    for (const x of [-5, 5]) {
      if (x + 1.9 > right) continue;
      const lane = new T.Mesh(
        deckPatch(surface, x - 1.8, x + 1.8, start, end, 0.025),
        polished,
      );
      lane.receiveShadow = true;
      group.add(lane);
    }
  }
  // Visible films are clipped to the exact same physical zone and road mesh.
  if (!shape) {
    const margins = [];
    const surfaces = group.children.filter(
      (mesh) => mesh.userData.drivingSurface,
    );
    for (const zone of track.sapZones)
      for (const surface of surfaces)
        for (const [a, b] of [
          [-13.9, zone.resinCenter - zone.resinHalfWidth],
          [zone.resinCenter + zone.resinHalfWidth, 13.9],
        ]) {
          const geometry = deckPatch(
            surface,
            a,
            b,
            zone.start,
            zone.end,
            0.045,
          );
          if (geometry.index.count) group.add(new T.Mesh(geometry, sap));
          else geometry.dispose();
          // The pale lip marks the actual safe-lane boundary, so the hazard
          // reads at driving speed without hiding where resistance begins.
          const edge =
            a < 0 && b <= zone.resinCenter ? [b - 0.42, b] : [a, a + 0.42];
          const margin = deckPatch(
            surface,
            ...edge,
            zone.start,
            zone.end,
            0.055,
          );
          if (margin.index.count) margins.push(margin);
          else margin.dispose();
        }
    mergeParts(group, margins, sapEdge, 'Sap flow / pale dry-lane margins');
  }
  group.traverse((o) => {
    if (o.material === sap) {
      o.receiveShadow = true;
      o.name = 'Flowing sap film';
      o.userData.sapFilm = true;
    }
  });
  const seals = [],
    inlays = [];
  const box = new T.BoxGeometry(1, 1, 1);
  for (let s = 10; s < track.length; s += 20) {
    if (track.isGap(s, 0)) continue;
    const f = track.sample(s);
    const m = new T.Matrix4().compose(
      framePoint(f, 0, 0.06),
      f.quaternion,
      new T.Vector3(track.width, 0.1, 0.3),
    );
    seals.push(box.clone().applyMatrix4(m));
    if (!shape)
      for (const side of [-1, 1]) {
        // Warm windows below the low curb expose the resin edge depth.
        inlays.push(
          box
            .clone()
            .applyMatrix4(
              new T.Matrix4().compose(
                framePoint(f, side * (halfWidth + 1.6), -1.4),
                f.quaternion,
                new T.Vector3(0.45, 0.5, 3.4),
              ),
            ),
        );
      }
  }
  box.dispose();
  mergeParts(group, seals, milk, 'Translucent reinforcement joints');
  mergeParts(group, inlays, vein, 'Amber resin edge windows');
  // Full-width chevrons identify the whole launch apron. The usable road
  // stays the same 28 m through the ramp and receiving deck.
  const guide = new T.MeshStandardMaterial({
    color: 0xf2deb0,
    emissive: 0xcaa261,
    emissiveIntensity: shape ? 0 : 0.22 * lightScale,
    roughness: 0.78,
  });
  const guideParts = [];
  const surfaces = group.children.filter(
    (mesh) => mesh.userData.drivingSurface,
  );
  function mark(x0, x1, start, end, shape) {
    for (const surface of surfaces) {
      const part = deckPatch(surface, x0, x1, start, end, 0.13, shape);
      if (part.index.count) guideParts.push(part);
      else part.dispose();
    }
  }
  for (const jump of track.jumps) {
    const center = 0;
    const span = halfWidth - 1.4;
    for (
      let distance = jump.takeoff - 150;
      distance < jump.takeoff - 12;
      distance += 24
    ) {
      for (const side of [-1, 1]) {
        const arrow = [
          [center, distance + 3],
          [center + side * span, distance - 2],
          [center + side * span, distance - 0.1],
          [center, distance + 4.9],
        ];
        mark(center - span, center + span, distance - 2, distance + 5, arrow);
      }
    }
    mark(
      -halfWidth + 0.5,
      halfWidth - 0.5,
      jump.takeoff - 3.2,
      jump.takeoff - 1.5,
    );
    mark(
      -halfWidth + 0.5,
      halfWidth - 0.5,
      jump.landingStart + 2,
      jump.landingStart + 5,
    );
  }
  mergeParts(
    group,
    guideParts,
    guide,
    'Advance jump lane and landing guidance',
  );
  if (!shape) {
    const volumeMaterials = new Set([amber, polished, core]);
    group.traverse((mesh) => {
      if (
        !mesh.isMesh ||
        !(
          volumeMaterials.has(mesh.material) ||
          (mesh.material === milk && mesh.userData.drivingSurface)
        )
      )
        return;
      const { position, uv } = mesh.geometry.attributes;
      const active = new Float32Array(position.count);
      const coordinates = new Float32Array(position.count * 3);
      const right = new Float32Array(position.count * 3);
      const up = new Float32Array(position.count * 3);
      const tangent = new Float32Array(position.count * 3);
      if (uv) {
        for (let i = 0; i < position.count; i++) {
          const s = uv.getY(i) * 16;
          const frame = track.sample(s);
          const delta = new T.Vector3()
            .fromBufferAttribute(position, i)
            .sub(frame.position);
          active[i] = 1;
          coordinates.set(
            [delta.dot(frame.right), delta.dot(frame.up), s],
            i * 3,
          );
          right.set(frame.right.toArray(), i * 3);
          up.set(frame.up.toArray(), i * 3);
          tangent.set(frame.tangent.toArray(), i * 3);
        }
      }
      for (const [name, values, size] of [
        ['vesperResinActive', active, 1],
        ['vesperResinCoord', coordinates, 3],
        ['vesperResinRight', right, 3],
        ['vesperResinUp', up, 3],
        ['vesperResinTangent', tangent, 3],
      ])
        mesh.geometry.setAttribute(name, new T.BufferAttribute(values, size));
    });
  }
  return {
    group,
    setReflection(texture) {
      if (shape) return;
      for (const material of [amber, polished, core]) {
        // Borrow the shared scene probe; renderer lifetime owns this texture.
        material.envMap = texture;
        material.envMapIntensity = 0.58;
        material.needsUpdate = true;
      }
    },
    update({ time, settings }) {
      sapClock.value = settings.reducedMotion ? 0 : time;
      resinLayers.value = settings.quality === 'low' ? 3 : 6;
    },
    dispose() {
      const gs = new Set(),
        ms = new Set();
      group.traverse((o) => {
        if (o.geometry) gs.add(o.geometry);
        if (o.material)
          (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) =>
            ms.add(m),
          );
      });
      gs.forEach((g) => g.dispose());
      ms.forEach((m) => m.dispose());
      group.clear();
    },
  };
}
