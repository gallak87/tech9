import * as T from 'three';
import { Pass } from 'three/addons/postprocessing/Pass.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { createNacreOceanNormals } from '../../nacre/environment/ocean-normals.js';
import { createFallingWaterMaterial } from '../../nightweir/environment/falling-water.js';

export function createLockdownWater(layout, view) {
  const group = new T.Group();
  group.name = 'Lockdown / connected stepped reservoir and tailrace';
  const geometries = new Set(),
    clock = { value: 0 },
    opening = { value: 1 },
    ripple = createNacreOceanNormals();
  const material = new T.MeshPhysicalMaterial({
    name: 'Nightweir / Lockdown sheltered basin water',
    color: '#31575c',
    roughness: 0.24,
    metalness: 0.06,
    ior: 1.333,
    envMapIntensity: 0.85,
  });
  material.onBeforeCompile = (shader) => {
    shader.uniforms.lockWaterTime = clock;
    shader.uniforms.lockRipples = { value: ripple };
    shader.vertexShader =
      'varying vec3 lockWaterPoint;\n' +
      shader.vertexShader.replace(
        '#include <begin_vertex>',
        '#include <begin_vertex>\nlockWaterPoint=position;',
      );
    shader.fragmentShader =
      'uniform float lockWaterTime;uniform sampler2D lockRipples;varying vec3 lockWaterPoint;\n' +
      shader.fragmentShader.replace(
        '#include <normal_fragment_maps>',
        `#include <normal_fragment_maps>
      vec2 flow=vec2(lockWaterTime*.00018,lockWaterTime*.0006);
      vec2 a=texture2D(lockRipples,lockWaterPoint.xz*.008+flow).rg*2.-1.;
      vec2 b=texture2D(lockRipples,lockWaterPoint.xz*.043-flow*3.).rg*2.-1.;
      normal=normalize(normal+mat3(viewMatrix)*vec3(a.x*.29+b.x*.1,0.,a.y*.29+b.y*.1));`,
      );
  };
  material.customProgramCacheKey = () => 'lockdown-nightweir-basin-v1';
  const limits = [
    layout.bounds.min.z - 450,
    ...layout.splits,
    layout.bounds.max.z + 450,
  ];
  for (let reach = 0; reach < 3; reach++) {
    const start = limits[reach],
      end = limits[reach + 1],
      waterY = [19, 46, 77][reach];
    const positions = [],
      uv = [],
      indices = [],
      steps = Math.ceil((end - start) / 22);
    for (let j = 0; j <= steps; j++) {
      const z = T.MathUtils.lerp(start, end, j / steps),
        center = layout.riverX(z);
      for (let k = 0; k <= 12; k++) {
        const x = center + (k / 12 - 0.5) * 320;
        positions.push(x, waterY, z);
        uv.push(x / 12, z / 12);
      }
    }
    for (let j = 0; j < steps; j++)
      for (let k = 0; k < 12; k++) {
        const a = j * 13 + k;
        indices.push(a, a + 13, a + 1, a + 1, a + 13, a + 14);
      }
    const g = new T.BufferGeometry();
    g.setAttribute('position', new T.Float32BufferAttribute(positions, 3));
    g.setAttribute('uv', new T.Float32BufferAttribute(uv, 2));
    g.setIndex(indices);
    g.computeVertexNormals();
    geometries.add(g);
    const mesh = new T.Mesh(g, material);
    mesh.name = `Lockdown / basin reach ${reach}`;
    mesh.receiveShadow = true;
    group.add(mesh);
  }
  const hydro = layout.hydro;
  for (const [start, end, waterY, near, far, label] of [
    [
      hydro.start,
      hydro.dam,
      hydro.upperY,
      58,
      286,
      'contained upper reservoir',
    ],
    [hydro.dam, hydro.end, hydro.lowerY, 72, 255, 'receiving tailrace'],
  ]) {
    const p = [],
      uv = [],
      idx = [],
      steps = Math.ceil((end - start) / 14);
    for (let j = 0; j <= steps; j++) {
      const f = layout.track.sample(T.MathUtils.lerp(start, end, j / steps)),
        right = new T.Vector3(f.right.x, 0, f.right.z).normalize();
      for (let k = 0; k <= 12; k++) {
        const point = f.position
          .clone()
          .addScaledVector(right, T.MathUtils.lerp(near, far, k / 12));
        p.push(point.x, waterY, point.z);
        uv.push(point.x / 12, point.z / 12);
      }
    }
    for (let j = 0; j < steps; j++)
      for (let k = 0; k < 12; k++) {
        const a = j * 13 + k;
        idx.push(a, a + 13, a + 1, a + 1, a + 13, a + 14);
      }
    const g = new T.BufferGeometry();
    g.setAttribute('position', new T.Float32BufferAttribute(p, 3));
    g.setAttribute('uv', new T.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    geometries.add(g);
    const mesh = new T.Mesh(g, material);
    mesh.name = 'Lockdown / ' + label;
    mesh.receiveShadow = true;
    group.add(mesh);
  }
  for (const quay of layout.quays) {
    const p = [],
      uv = [],
      idx = [],
      steps = Math.ceil((quay.end - quay.start) / 12);
    for (let j = 0; j <= steps; j++) {
      const distance = T.MathUtils.lerp(quay.start, quay.end, j / steps),
        f = layout.track.sample(distance),
        right = new T.Vector3(f.right.x, 0, f.right.z).normalize();
      for (let k = 0; k <= 8; k++) {
        const point = f.position
          .clone()
          .addScaledVector(
            right,
            T.MathUtils.lerp(38, layout.quayFar(distance), k / 8),
          );
        p.push(point.x, quay.waterY, point.z);
        uv.push(point.x / 10, point.z / 10);
      }
    }
    for (let j = 0; j < steps; j++)
      for (let k = 0; k < 8; k++) {
        const a = j * 9 + k;
        idx.push(a, a + 9, a + 1, a + 1, a + 9, a + 10);
      }
    const g = new T.BufferGeometry();
    g.setAttribute('position', new T.Float32BufferAttribute(p, 3));
    g.setAttribute('uv', new T.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    geometries.add(g);
    const mesh = new T.Mesh(g, material);
    mesh.name = 'Lockdown / ' + quay.id + ' working water';
    mesh.receiveShadow = true;
    group.add(mesh);
  }
  const discharge = layout.discharge;
  // Only the short missing connection is authored here; its two ends meet the
  // existing water reaches exactly, at different physical elevations.
  for (const [start, end, waterY] of [
    [discharge.start, discharge.station, discharge.lowerY],
    [discharge.station, discharge.end, discharge.upperY],
  ]) {
    const p = [],
      uv = [],
      idx = [],
      steps = Math.ceil((end - start) / 6);
    for (let j = 0; j <= steps; j++) {
      const f = layout.track.sample(T.MathUtils.lerp(start, end, j / steps)),
        right = new T.Vector3(f.right.x, 0, f.right.z).normalize();
      for (let k = 0; k <= 8; k++) {
        const point = f.position
          .clone()
          .addScaledVector(
            right,
            T.MathUtils.lerp(discharge.near, discharge.far, k / 8),
          );
        p.push(point.x, waterY, point.z);
        uv.push(point.x / 10, point.z / 10);
      }
    }
    for (let j = 0; j < steps; j++)
      for (let k = 0; k < 8; k++) {
        const a = j * 9 + k;
        idx.push(a, a + 9, a + 1, a + 1, a + 9, a + 10);
      }
    const g = new T.BufferGeometry();
    g.setAttribute('position', new T.Float32BufferAttribute(p, 3));
    g.setAttribute('uv', new T.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    geometries.add(g);
    const mesh = new T.Mesh(g, material);
    mesh.name = 'Lockdown / linked discharge receiving water';
    mesh.receiveShadow = true;
    group.add(mesh);
  }
  const falling = createFallingWaterMaterial(clock, opening, ripple);
  const pressureFall = createFallingWaterMaterial(clock, opening, ripple),
    fallFinish = pressureFall.onBeforeCompile;
  pressureFall.name = 'Lockdown / pressurised broken aerated discharge';
  pressureFall.onBeforeCompile = (shader, renderer) => {
    fallFinish(shader, renderer);
    shader.vertexShader =
      'uniform float waterTime;\n' +
      shader.vertexShader.replace(
        'vFlowRight=normalMatrix*flowRight;',
        'vFlowRight=normalMatrix*flowRight;transformed+=normal*(sin(vFlow.x*.53+waterTime*3.1+vSource.x)*.11+sin(vFlow.x*1.13-waterTime*4.7)*.06)*smoothstep(0.,5.,vFlow.y);',
      );
    shader.fragmentShader = shader.fragmentShader
      .replace('vFlow.x*.065+vSource.x*3.7', 'vFlow.x*.21+vSource.x*3.7')
      .replace(
        'float aeration=smoothstep(3.,110.,down);',
        'float aeration=smoothstep(1.8,30.,down);',
      )
      .replace(
        'float foam=mix(.07,.32+turbulence*.68,aeration)',
        'float foam=mix(.12,.27+turbulence*.52,aeration)',
      )
      .replace('vec3(.73,.79,.80)', 'vec3(.59,.69,.71)')
      .replace(
        'edge*mix(.88,.23,vSource.y)*mix(.82,1.,supply)*flow',
        'edge*mix(.93,.3,vSource.y)*mix(.9,1.,supply)*flow',
      )
      .replace('vec3(.024,.037,.040)*foam', 'vec3(.004,.008,.009)*foam');
  };
  pressureFall.customProgramCacheKey = () => 'lockdown-pressure-breakup-v1';
  const foam = new T.MeshStandardMaterial({
    name: 'Lockdown / aerated receiving edge',
    color: '#a6bec0',
    roughness: 0.62,
    metalness: 0,
    transparent: true,
    depthWrite: false,
    side: T.DoubleSide,
  });
  foam.onBeforeCompile = (shader) => {
    shader.uniforms.lockFoamTime = clock;
    shader.vertexShader =
      'varying vec2 lockFoamUV;\n' +
      shader.vertexShader.replace(
        '#include <begin_vertex>',
        '#include <begin_vertex>\nlockFoamUV=uv;',
      );
    shader.fragmentShader =
      `varying vec2 lockFoamUV;uniform float lockFoamTime;
      float lockHash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
      float lockNoise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(lockHash(i),lockHash(i+vec2(1,0)),f.x),mix(lockHash(i+vec2(0,1)),lockHash(i+vec2(1,1)),f.x),f.y);}
      ` +
      shader.fragmentShader.replace(
        '#include <map_fragment>',
        `#include <map_fragment>
        vec2 p=lockFoamUV*vec2(11.,7.)-vec2(0.,lockFoamTime*.29);
        float n=lockNoise(p)+lockNoise(p*2.8+vec2(7.,lockFoamTime*.13))*.28;
        float side=smoothstep(0.,.16,lockFoamUV.x)*(1.-smoothstep(.84,1.,lockFoamUV.x));
        float reach=(1.-smoothstep(.0,1.,lockFoamUV.y));
        diffuseColor.a=side*reach*smoothstep(.34,.85,n)*.42;
        diffuseColor.rgb*=.85+.2*n;
      `,
      );
  };
  foam.customProgramCacheKey = () => 'lockdown-receiving-aeration-v1';
  for (const [index, z] of layout.splits.entries()) {
    const top = [46, 77][index],
      bottom = [19, 46][index],
      width = 185,
      height = top - bottom;
    const g = new T.PlaneGeometry(width, height, 24, 8),
      p = g.attributes.position;
    const attrs = {
      sourcePhase: [],
      crossed: [],
      releaseAt: [],
      sheetWidth: [],
      sheetHeight: [],
      flowRight: [],
    };
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i),
        y = p.getY(i);
      g.attributes.uv.setXY(i, x + width / 2, height / 2 - y);
      attrs.sourcePhase.push(index + 0.7);
      attrs.crossed.push(0);
      attrs.releaseAt.push(0);
      attrs.sheetWidth.push(width);
      attrs.sheetHeight.push(height);
      attrs.flowRight.push(1, 0, 0);
    }
    for (const [name, values] of Object.entries(attrs))
      g.setAttribute(
        name,
        new T.Float32BufferAttribute(values, name === 'flowRight' ? 3 : 1),
      );
    geometries.add(g);
    const mesh = new T.Mesh(g, falling);
    mesh.position.set(layout.riverX(z), (top + bottom) / 2, z - 0.6);
    mesh.name = `Lockdown / working weir fall ${index}`;
    group.add(mesh);
  }
  {
    const d = discharge,
      f = layout.track.sample(d.station),
      right = new T.Vector3(f.right.x, 0, f.right.z).normalize(),
      forward = new T.Vector3()
        .crossVectors(right, new T.Vector3(0, 1, 0))
        .normalize(),
      up = new T.Vector3(0, 1, 0);
    const back = forward.clone().negate(),
      across = right.clone().negate(),
      q = new T.Quaternion().setFromRotationMatrix(
        new T.Matrix4().makeBasis(across, up, back),
      );
    for (const [bay, x, width] of [
      [0, 57, 27],
      [1, 95, 27],
    ]) {
      const height = d.sourceY - d.lowerY,
        g = new T.PlaneGeometry(width, height, 12, 12),
        p = g.attributes.position,
        attrs = {
          sourcePhase: [],
          crossed: [],
          releaseAt: [],
          sheetWidth: [],
          sheetHeight: [],
          flowRight: [],
        };
      for (let i = 0; i < p.count; i++) {
        g.attributes.uv.setXY(i, p.getX(i) + width / 2, height / 2 - p.getY(i));
        attrs.sourcePhase.push(12.4 + bay);
        attrs.crossed.push(0);
        attrs.releaseAt.push(0);
        attrs.sheetWidth.push(width);
        attrs.sheetHeight.push(height);
        attrs.flowRight.push(...across.toArray());
      }
      const center = f.position
        .clone()
        .addScaledVector(right, x)
        .addScaledVector(forward, -5)
        .setY((d.sourceY + d.lowerY) / 2);
      g.applyMatrix4(
        new T.Matrix4().compose(center, q, new T.Vector3(1, 1, 1)),
      );
      for (const [name, values] of Object.entries(attrs))
        g.setAttribute(
          name,
          new T.Float32BufferAttribute(values, name === 'flowRight' ? 3 : 1),
        );
      geometries.add(g);
      const mesh = new T.Mesh(g, pressureFall);
      mesh.name = 'Lockdown / controlled tailrace discharge ' + bay;
      group.add(mesh);
    }
  }
  {
    const d = discharge,
      f = layout.track.sample(d.station),
      right = new T.Vector3(f.right.x, 0, f.right.z).normalize(),
      forward = new T.Vector3()
        .crossVectors(right, new T.Vector3(0, 1, 0))
        .normalize(),
      crestParts = [],
      foamParts = [];
    for (const x of [57, 95]) {
      const width = 27,
        positions = [],
        uv = [],
        indices = [],
        profile = [
          [6, 0.08],
          [3, 0.14],
          [0, 0.18],
          [-3, 0.13],
          [-5, 0],
        ];
      for (let j = 0; j < profile.length; j++)
        for (let k = 0; k <= 12; k++) {
          const point = f.position
            .clone()
            .addScaledVector(right, x + (k / 12 - 0.5) * width)
            .addScaledVector(forward, profile[j][0])
            .setY(d.sourceY + profile[j][1]);
          positions.push(...point.toArray());
          uv.push(point.x / 12, point.z / 12);
        }
      for (let j = 0; j < profile.length - 1; j++)
        for (let k = 0; k < 12; k++) {
          const a = j * 13 + k;
          indices.push(a, a + 1, a + 13, a + 1, a + 14, a + 13);
        }
      const crest = new T.BufferGeometry();
      crest.setAttribute(
        'position',
        new T.Float32BufferAttribute(positions, 3),
      );
      crest.setAttribute('uv', new T.Float32BufferAttribute(uv, 2));
      crest.setIndex(indices);
      crest.computeVertexNormals();
      crestParts.push(crest);
      const p = [],
        v = [],
        idx = [];
      for (let j = 0; j <= 12; j++)
        for (let k = 0; k <= 12; k++) {
          const point = f.position
            .clone()
            .addScaledVector(right, x + (k / 12 - 0.5) * (width + 6))
            .addScaledVector(forward, -5 - (j / 12) * 28)
            .setY(d.lowerY + 0.1 + Math.sin(k * 0.7 + j * 0.31) * 0.04);
          p.push(...point.toArray());
          v.push(k / 12, j / 12);
        }
      for (let j = 0; j < 12; j++)
        for (let k = 0; k < 12; k++) {
          const a = j * 13 + k;
          idx.push(a, a + 1, a + 13, a + 1, a + 14, a + 13);
        }
      const pad = new T.BufferGeometry();
      pad.setAttribute('position', new T.Float32BufferAttribute(p, 3));
      pad.setAttribute('uv', new T.Float32BufferAttribute(v, 2));
      pad.setIndex(idx);
      pad.computeVertexNormals();
      foamParts.push(pad);
    }
    const crests = mergeGeometries(crestParts);
    crestParts.forEach((g) => g.dispose());
    geometries.add(crests);
    const wetLip = new T.Mesh(crests, material);
    wetLip.name = 'Lockdown / wet controlled discharge crests';
    wetLip.receiveShadow = true;
    group.add(wetLip);
    const pads = mergeGeometries(foamParts);
    foamParts.forEach((g) => g.dispose());
    geometries.add(pads);
    const aeration = new T.Mesh(pads, foam);
    aeration.name = 'Lockdown / contained aerated receiving wakes';
    aeration.receiveShadow = true;
    group.add(aeration);
  }
  const f = layout.track.sample(hydro.dam),
    right = new T.Vector3(f.right.x, 0, f.right.z).normalize(),
    forward = new T.Vector3()
      .crossVectors(right, new T.Vector3(0, 1, 0))
      .normalize();
  const basis = new T.Quaternion().setFromRotationMatrix(
    new T.Matrix4().makeBasis(right, new T.Vector3(0, 1, 0), forward),
  );
  for (let bay = 0; bay < 5; bay++) {
    const width = 26,
      height = hydro.upperY - hydro.lowerY,
      g = new T.PlaneGeometry(width, height, 8, 16),
      p = g.attributes.position,
      attrs = {
        sourcePhase: [],
        crossed: [],
        releaseAt: [],
        sheetWidth: [],
        sheetHeight: [],
        flowRight: [],
      };
    for (let i = 0; i < p.count; i++) {
      g.attributes.uv.setXY(i, p.getX(i) + width / 2, height / 2 - p.getY(i));
      attrs.sourcePhase.push(3.4 + bay);
      attrs.crossed.push(0);
      attrs.releaseAt.push(0);
      attrs.sheetWidth.push(width);
      attrs.sheetHeight.push(height);
      attrs.flowRight.push(...right.toArray());
    }
    const center = f.position
      .clone()
      .addScaledVector(right, 84 + bay * 40)
      .addScaledVector(forward, 18)
      .setY((hydro.upperY + hydro.lowerY) / 2);
    g.applyMatrix4(
      new T.Matrix4().compose(center, basis, new T.Vector3(1, 1, 1)),
    );
    for (const [name, values] of Object.entries(attrs))
      g.setAttribute(
        name,
        new T.Float32BufferAttribute(values, name === 'flowRight' ? 3 : 1),
      );
    geometries.add(g);
    const mesh = new T.Mesh(g, falling);
    mesh.name = 'Lockdown / main lifting weir aerated spill ' + bay;
    group.add(mesh);
  }
  const horizontal = group.children.filter(
      (mesh) => mesh.isMesh && mesh.material === material,
    ),
    batched = mergeGeometries(horizontal.map((mesh) => mesh.geometry));
  for (const mesh of horizontal) {
    group.remove(mesh);
    geometries.delete(mesh.geometry);
    mesh.geometry.dispose();
  }
  geometries.add(batched);
  const basinSurface = new T.Mesh(batched, material);
  basinSurface.name = 'Lockdown / batched continuous basin surfaces';
  basinSurface.receiveShadow = true;
  group.add(basinSurface);
  const linearWater = new Pass();
  linearWater.needsSwap = false;
  linearWater.render = () => {};
  const detach = view?.attachWorldPass?.(linearWater);
  let disposed = false;
  return {
    group,
    update(frame = {}) {
      clock.value = frame.settings?.reducedMotion ? 0 : (frame.time ?? 0);
    },
    setReflection(texture) {
      for (const m of [material, falling, pressureFall]) {
        m.envMap = texture;
        m.needsUpdate = true;
      }
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      detach?.();
      linearWater.dispose();
      geometries.forEach((g) => g.dispose());
      material.dispose();
      falling.dispose();
      pressureFall.dispose();
      foam.dispose();
      ripple.dispose();
      group.clear();
    },
  };
}
