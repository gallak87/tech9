import * as T from 'three';

/** Authored assemblies are borrowed from Worldkit; this level owns their composition. */
export function createSculptedPassages(track, sculptures, palette, lifetime) {
  const group = new T.Group();
  group.name = 'Opaline / sculpted mineral passages';
  const fluid = lifetime.own(
    new T.MeshPhysicalMaterial({
      name: 'Opaline / deep translucent overhang',
      color: '#b6e0cf',
      roughness: 0.09,
      metalness: 0,
      transmission: 0.92,
      thickness: 10,
      ior: 1.34,
      attenuationColor: '#3d9b7d',
      attenuationDistance: 35,
      clearcoat: 0.65,
      clearcoatRoughness: 0.12,
      iridescence: 0.15,
      iridescenceIOR: 1.32,
      envMapIntensity: 1.15,
      side: T.DoubleSide,
    }),
  );
  const clock = { value: 0 };
  fluid.onBeforeCompile = (shader) => {
    shader.uniforms.opalineClock = clock;
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        '#include <common>\nvarying vec3 mineralPosition;',
      )
      .replace(
        '#include <begin_vertex>',
        '#include <begin_vertex>\nmineralPosition=position;',
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        uniform float opalineClock;varying vec3 mineralPosition;
        float mineralCaustic(vec2 p) {
          float d=1.;
          for(int i=0;i<3;i++) {p=mat2(.8,-.6,.6,.8)*p*1.73+vec2(1.7,3.2);
            d=min(d,abs(sin(p.x+sin(p.y+opalineClock*.11))));}
          return pow(1.-d,16.);
        }`,
      )
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
        float caustic=mineralCaustic(mineralPosition.xz*.13+mineralPosition.y*.024);
        totalEmissiveRadiance+=vec3(.012,.035,.018)*caustic;
        diffuseColor.rgb*=.82+.18*caustic;`,
      );
  };
  fluid.customProgramCacheKey = () => 'opaline-sculpted-fluid-v1';
  const details = [];
  const up = new T.Vector3(0, 1, 0);
  function add(name, s, lateral, elevation, scale, facing = 'curl') {
    const near = sculptures.high[name],
      middle = sculptures.low[name],
      far = sculptures.distant[name];
    const material = name.endsWith('emerald') ? fluid : palette.stone;
    const mesh = new T.Mesh(near.geometry, material);
    const frame = track.sample(s);
    const tangent = frame.tangent.clone();
    tangent.y = 0;
    tangent.normalize();
    const right = new T.Vector3().crossVectors(up, tangent).normalize();
    mesh.position.copy(frame.position).addScaledVector(right, lateral);
    mesh.position.y += elevation;
    const basis =
      facing === 'curl'
        ? new T.Matrix4().makeBasis(right, up, tangent)
        : new T.Matrix4().makeBasis(tangent, up, right.clone().negate());
    mesh.quaternion.setFromRotationMatrix(basis);
    mesh.scale.set(...scale);
    mesh.name = 'Opaline / authored ' + name;
    mesh.castShadow = !name.endsWith('emerald');
    mesh.receiveShadow = true;
    if (name.endsWith('emerald')) mesh.userData.aoExclude = true;
    group.add(mesh);
    details.push({ mesh, near, middle, far });
    return mesh;
  }
  // The first 300m receiving passage is the visual quality gate.
  for (const [s, x, y, scale] of [
    [448, 0, 4, [1, 1, 1.55]],
    [2525, 0, 7, [1.1, 1.1, 1.8]],
    [2780, 8, 10, [1.25, 1.15, 1.5]],
  ]) {
    add('mineral-curl-crust', s, x, y, scale);
    add('mineral-curl-emerald', s, x, y, scale);
  }
  const beds = [
    [310, 810],
    [1120, 1430],
    [1850, 2080],
    [2380, 3000],
    [3830, 4210],
    [5240, 5600],
  ];
  let index = 0;
  for (const [start, end] of beds)
    for (let s = start; s < end; s += 43) {
      const i = index++;
      add(
        'mineral-buttress-' + ((i % 3) + 1),
        s,
        64 + (i % 3) * 4,
        -25,
        [1.1 + (i % 3) * 0.12, 0.9 + (i % 4) * 0.15, 1],
        'cliff',
      );
    }
  return {
    group,
    update({ camera, quality, time = 0, reducedMotion = false } = {}) {
      clock.value = reducedMotion ? 0 : time;
      for (const { mesh, near, middle, far } of details) {
        const distance = camera
          ? camera.position.distanceToSquared(mesh.position)
          : 0;
        mesh.visible = distance < 1900 ** 2;
        const close = quality !== 'low' && distance < 420 ** 2;
        mesh.geometry = close
          ? near.geometry
          : distance < 1000 ** 2
            ? middle.geometry
            : far.geometry;
        mesh.castShadow = close && !mesh.name.endsWith('emerald');
      }
    },
  };
}
