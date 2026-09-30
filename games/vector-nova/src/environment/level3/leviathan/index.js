import * as T from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import {
  NACRE_LEVIATHAN,
  createLeviathanClock,
  createLeviathanPath,
  createLeviathanReturnPath,
} from './path.js';

import { createLeviathanSpray, LEVIATHAN_SPRAY_COUNT } from './spray.js';

const ASSET_URL = '/assets/level3/leviathan/nacre-leviathan-v2.glb';
const POINT_COUNT = LEVIATHAN_SPRAY_COUNT;
const BODY_STATIONS = Math.ceil(NACRE_LEVIATHAN.length) + 6;

function waterEffects(path) {
  const group = new T.Group();
  group.name = 'Leviathan / entry and dive foam';
  const rings = path.contacts.map((contact) => {
    const material = new T.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      side: T.DoubleSide,
      uniforms: { age: { value: -1 } },
      vertexShader: `varying vec2 waterUv; void main(){ waterUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }`,
      fragmentShader: `
        uniform float age; varying vec2 waterUv;
        void main(){
          float r=length(waterUv-.5)*2.;
          float t=max(age,0.);
          float fade=smoothstep(0.,.3,t)*(1.-smoothstep(2.5,4.7,t));
          float pulse=.5+.5*sin(r*39.-t*4.);
          float ring=exp(-pow((r-(.27+t*.075))/.068,2.));
          float foam=exp(-pow((r-.3)/.24,2.))*(.36+.64*pulse);
          float broken=.6+.4*sin(atan(waterUv.y-.5,waterUv.x-.5)*19.+r*25.);
          gl_FragColor=vec4(mix(vec3(.23,.62,.65),vec3(.82,.95,.93),ring), (ring*.67+foam*.4)*broken*fade*(1.-smoothstep(.83,1.,r)));
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    });
    const mesh = new T.Mesh(
      new T.PlaneGeometry(82, 82).rotateX(-Math.PI / 2),
      material,
    );
    mesh.position.copy(contact.position);
    mesh.name =
      contact.side < 0
        ? 'Leviathan / eruption foam'
        : 'Leviathan / return foam';
    mesh.renderOrder = 4;
    mesh.userData.aoExclude = true;
    group.add(mesh);
    return mesh;
  });
  const { positions, velocity, births, sizes, lives, kinds, strengths } =
    createLeviathanSpray(path);
  const geometry = new T.BufferGeometry();
  geometry.setAttribute('position', new T.BufferAttribute(positions, 3));
  geometry.setAttribute('velocity', new T.BufferAttribute(velocity, 3));
  geometry.setAttribute('birth', new T.BufferAttribute(births, 1));
  geometry.setAttribute('size', new T.BufferAttribute(sizes, 1));
  geometry.setAttribute('life', new T.BufferAttribute(lives, 1));
  geometry.setAttribute('kind', new T.BufferAttribute(kinds, 1));
  geometry.setAttribute('strength', new T.BufferAttribute(strengths, 1));
  const material = new T.ShaderMaterial({
    uniforms: { age: { value: 0 } },
    transparent: true,
    depthWrite: false,
    vertexShader: `
      attribute vec3 velocity; attribute float birth; attribute float size; attribute float life; attribute float kind; attribute float strength;
      uniform float age; varying float alpha; varying float trail;
      void main(){
        float t=age-birth;
        vec3 p=position+velocity*max(t,0.); p.y-=15.*max(t,0.)*max(t,0.);
        vec4 v=modelViewMatrix*vec4(p,1.); gl_Position=projectionMatrix*v;
        gl_PointSize=clamp(1800.*size/max(1.,-v.z),1.5,28.);
        trail=kind;
        alpha=step(0.,t)*smoothstep(0.,.13,t)*(1.-smoothstep(life*.64,life,t))*step(.02,p.y)*strength*(1.-.55*smoothstep(.3,2.1,t)*kind);
      }`,
    fragmentShader: `
      varying float alpha; varying float trail;
      void main(){ vec2 uv=(gl_PointCoord-.5)*2.; uv.x*=mix(1.,3.2,trail); float r=length(uv); float a=(1.-smoothstep(.3,1.,r))*alpha*.8; if(a<.015) discard; gl_FragColor=vec4(.81,.95,.96,a);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const spray = new T.Points(geometry, material);
  spray.name = 'Leviathan / pooled breach spray';
  spray.frustumCulled = false;
  spray.renderOrder = 5;
  spray.userData.aoExclude = true;
  group.add(spray);
  return {
    group,
    update(age, active, reducedMotion, quality) {
      group.visible = active && !reducedMotion;
      material.uniforms.age.value = age;
      geometry.setDrawRange(
        0,
        quality === 'low' ? POINT_COUNT / 2 : POINT_COUNT,
      );
      rings.forEach((ring, index) => {
        const localAge = age - path.contacts[index].age;
        ring.material.uniforms.age.value = localAge;
        ring.visible = localAge >= 0 && localAge <= 4.7;
      });
    },
  };
}

/** One original Blender-authored animal; animation is scenery only. */
export function createNacreLeviathan(track, { loadAsset } = {}) {
  const group = new T.Group();
  group.name = 'Nacre / one enormous swimming leviathan';
  group.visible = false;
  const body = new T.Group();
  body.name = 'Leviathan / single continuously deforming body';
  body.visible = false;
  const path = createLeviathanPath(track);
  const encounters = [path, createLeviathanReturnPath(track)].map((route) => ({
    path: route,
    clock: createLeviathanClock(track, route),
  }));
  let encounter = encounters[0];
  function currentEncounter() {
    encounter =
      encounters.findLast((item) => item.clock.getState().active) ?? encounter;
    return encounter;
  }
  const effects = waterEffects(path);
  group.add(body, effects.group);
  const meshes = [];
  const stations = new Float32Array(BODY_STATIONS * 12);
  const sample = {};
  const headSample = {};
  let disposed = false;
  let loading = false;
  let loaded = false;
  let error = null;
  let quality = 'high';
  let reducedMotion = false;
  let overview = false;
  let lastPose = null;
  let lastPath = null;
  let currentTime = 0;
  const metrics = {
    meshCount: 8,
    triangleCount: 35776,
    primitiveCount: 1,
    animalCount: 1,
    modelTriangles: 35772,
    bodyLength: NACRE_LEVIATHAN.length,
    sprayPointsHigh: POINT_COUNT,
    sprayPointsLow: POINT_COUNT / 2,
    textures: 0,
    additionalRenderPasses: 0,
    assetBytes: 917044,
  };
  function disposeGroup(target) {
    const geometries = new Set();
    const materials = new Set();
    target.traverse((object) => {
      if (object.geometry) geometries.add(object.geometry);
      for (const material of [object.material].flat().filter(Boolean))
        materials.add(material);
    });
    for (const geometry of geometries) geometry.dispose();
    for (const material of materials) material.dispose();
    target.clear();
  }
  function accept(gltf) {
    if (disposed) {
      disposeGroup(gltf.scene);
      return;
    }
    gltf.scene.updateMatrixWorld(true);
    gltf.scene.traverse((object) => {
      if (!object.isMesh) return;
      // Bake the export's Blender-to-GLTF transform once. Its dense rest rings
      // remain editable in the .blend; production positions follow arc length.
      const geometry = object.geometry;
      geometry.applyMatrix4(object.matrixWorld);
      const position = geometry.getAttribute('position');
      const normal = geometry.getAttribute('normal');
      const material = object.material;
      const mesh = new T.Mesh(geometry, material);
      mesh.name = 'Leviathan / ' + object.name;
      mesh.frustumCulled = false;
      mesh.receiveShadow = true;
      mesh.userData.aoExclude = true;
      material.side = T.DoubleSide;
      meshes.push({
        mesh,
        position,
        normal,
        rest: new Float32Array(position.array),
        restNormal: new Float32Array(normal.array),
      });
      position.setUsage(T.DynamicDrawUsage);
      normal.setUsage(T.DynamicDrawUsage);
      body.add(mesh);
    });
    metrics.modelTriangles = meshes.reduce(
      (sum, item) =>
        sum + (item.mesh.geometry.index?.count ?? item.position.count) / 3,
      0,
    );
    metrics.triangleCount = metrics.modelTriangles + 4;
    metrics.meshCount = meshes.length + 3;
    loaded = true;
    loading = false;
    lastPose = null;
  }
  let ready = Promise.resolve(false);
  // Plain-Node environment construction is used by source tests. Only browsers
  // fetch assets unless an explicit loader is provided by an asset-level check.
  if (
    loadAsset ||
    (typeof document !== 'undefined' && typeof location !== 'undefined')
  ) {
    loading = true;
    const loader = loadAsset ?? (() => new GLTFLoader().loadAsync(ASSET_URL));
    ready = Promise.resolve()
      .then(() => loader(ASSET_URL))
      .then((gltf) => {
        accept(gltf);
        return !disposed;
      })
      .catch((reason) => {
        loading = false;
        error = reason instanceof Error ? reason.message : String(reason);
        return false;
      });
  }
  function pose(age, path) {
    const headArc = path.headArc(age);
    for (let i = 0; i < BODY_STATIONS; i++) {
      const f = path.sample(headArc - i, sample);
      const offset = i * 12;
      stations.set(f.position.toArray(), offset);
      stations.set(f.back.toArray(), offset + 3);
      stations.set(f.up.toArray(), offset + 6);
      stations.set(f.side.toArray(), offset + 9);
    }
    for (const { position, normal, rest, restNormal } of meshes) {
      for (let i = 0; i < position.count; i++) {
        const v = i * 3;
        const x = T.MathUtils.clamp(rest[v], 0, BODY_STATIONS - 1.001);
        const a = Math.floor(x) * 12;
        const b = a + 12;
        const fraction = x - Math.floor(x);
        for (let axis = 0; axis < 3; axis++) {
          const p = T.MathUtils.lerp(
            stations[a + axis],
            stations[b + axis],
            fraction,
          );
          const bx = T.MathUtils.lerp(
            stations[a + axis + 3],
            stations[b + axis + 3],
            fraction,
          );
          const by = T.MathUtils.lerp(
            stations[a + axis + 6],
            stations[b + axis + 6],
            fraction,
          );
          const bz = T.MathUtils.lerp(
            stations[a + axis + 9],
            stations[b + axis + 9],
            fraction,
          );
          position.array[v + axis] = p + by * rest[v + 1] + bz * rest[v + 2];
          normal.array[v + axis] =
            bx * restNormal[v] +
            by * restNormal[v + 1] +
            bz * restNormal[v + 2];
        }
      }
      position.needsUpdate = true;
      normal.needsUpdate = true;
    }
  }
  return {
    group,
    ready,
    metrics,
    updateVehicle(vehicle) {
      if (!disposed)
        encounters.forEach((item) => item.clock.updateVehicle(vehicle));
    },
    update(time, settings = {}) {
      if (disposed) return;
      currentTime = time;
      quality = settings.quality ?? quality;
      reducedMotion = settings.reducedMotion ?? reducedMotion;
      overview = settings.overview ?? overview;
      const { clock, path: activePath } = currentEncounter();
      const state = clock.getState();
      const shown =
        state.active &&
        !overview &&
        (state.mode === 'racing' || state.mode === 'paused');
      group.visible = shown;
      body.visible = loaded;
      // Reduced motion uses the same animal at a calm submerged rest pose.
      const age = reducedMotion ? 0 : state.age;
      effects.update(age, shown && activePath === path, reducedMotion, quality);
      if (shown && loaded && (lastPose !== age || lastPath !== activePath)) {
        pose(age, activePath);
        lastPose = age;
        lastPath = activePath;
      }
    },
    getPresentation() {
      const { clock, path: activePath } = currentEncounter();
      const state = clock.getState();
      const head = activePath.sample(
        activePath.headArc(reducedMotion ? 0 : state.age),
        headSample,
      );
      const phase = !state.active
        ? 'idle'
        : reducedMotion
          ? 'quiet-submerged'
          : activePath.encounter === 'trench-return'
            ? 'return-swim'
            : head.cross < -NACRE_LEVIATHAN.waterCross
              ? 'swimming'
              : head.cross < 0
                ? 'breaching'
                : head.cross < NACRE_LEVIATHAN.waterCross
                  ? 'crossing'
                  : 'diving';
      return {
        ready: loaded,
        loading,
        error,
        phase,
        encounter: activePath.encounter,
        age: state.age,
        active: state.active,
        visible: group.visible && body.visible,
        animalCount: 1,
        eventCount: encounters.reduce(
          (sum, item) => sum + item.clock.getState().eventCount,
          0,
        ),
        lap: state.consumedLap,
        triggerDistance: state.triggerDistance,
        time: currentTime,
        anchorDistance: activePath.anchorDistance,
        heroDistance: activePath.heroDistance,
        heroAge: activePath.heroAge,
        headPosition: head.position.toArray(),
        reducedMotion,
        quality,
        overview,
        waterContacts: activePath.contacts.map((contact) =>
          contact.position.toArray(),
        ),
        duration: activePath.duration,
        crownAge: activePath.crownAge,
      };
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      loading = false;
      loaded = false;
      encounters.forEach((item) => item.clock.clear());
      group.removeFromParent();
      disposeGroup(group);
      meshes.length = 0;
    },
  };
}
