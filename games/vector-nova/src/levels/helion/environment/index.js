import * as T from 'three';
import { assetURL } from '../../../assets/url.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import {
  createRouteClearance,
  groundFrame,
} from '../../../environment/placement.js';
import { sampleHelionProminences, sampleHelionThermal } from '../thermal.js';
import { finishThermalMaterial } from './materials.js';
import { createThermalSurfaces } from './thermal-surfaces.js';
import { createPlasmaVolume } from './plasma-volume.js';

const URL = assetURL('assets/levels/helion/thermal-observatory.glb');

function release(...groups) {
  const geometries = new Set();
  const materials = new Set();
  for (const group of groups)
    group.traverse((object) => {
      if (object.geometry) geometries.add(object.geometry);
      for (const material of Array.isArray(object.material)
        ? object.material
        : object.material
          ? [object.material]
          : [])
        materials.add(material);
    });
  for (const item of geometries) item.dispose();
  for (const item of materials) item.dispose();
}

function flareMaterial(core = false, cloud = false) {
  return new T.ShaderMaterial({
    name: `Helion / modeled ${core ? 'hot core' : cloud ? 'turbulent red pocket' : 'plasma sheet'}`,
    side: T.DoubleSide,
    transparent: true,
    depthWrite: false,
    uniforms: { strength: { value: 0.6 }, time: { value: 0 } },
    vertexShader: `attribute vec4 color;varying float plasmaEdge;varying vec3 plasmaView;varying vec3 local;varying vec3 norm;uniform float time;uniform float strength;
    void main(){local=position;plasmaEdge=color.r;norm=normalMatrix*normal;vec3 p=position;p.y*=.14+.86*strength;p.x+=sin(position.y*.009+time*.17)*18.*strength;p.z+=sin(position.y*.031+position.x*.017+time*.11)*6.;${cloud ? 'p+=normal*8.*sin(position.x*.063+sin(position.y*.071+time*.14)*3.)*strength;' : ''}plasmaView=-(modelViewMatrix*vec4(p,1.)).xyz;gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.);}`,
    fragmentShader: `varying float plasmaEdge;varying vec3 plasmaView;varying vec3 local; varying vec3 norm; uniform float strength; uniform float time;
    float plasmaHash(vec3 p){p=fract(p*.1031);p+=dot(p,p.yzx+33.33);return fract((p.x+p.y)*p.z);}
    float plasmaNoise(vec3 p){vec3 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(mix(plasmaHash(i),plasmaHash(i+vec3(1,0,0)),f.x),mix(plasmaHash(i+vec3(0,1,0)),plasmaHash(i+vec3(1,1,0)),f.x),f.y),mix(mix(plasmaHash(i+vec3(0,0,1)),plasmaHash(i+vec3(1,0,1)),f.x),mix(plasmaHash(i+vec3(0,1,1)),plasmaHash(i+vec3(1,1,1)),f.x),f.y),f.z);}
    float plasmaField(vec3 p){return plasmaNoise(p)*.57+plasmaNoise(p*2.13+5.7)*.28+plasmaNoise(p*4.3-8.1)*.15;}
    void main(){vec3 p=local*.035; p.y-=time*.045;float warp=plasmaField(p*.57);float field=plasmaField(p+warp*3.);
    float threads=pow(.5+.5*sin(local.x*.052+local.y*.061+warp*16.+field*8.),4.);
    vec3 c=mix(vec3(.32,.006,.002),vec3(2.55,.37,.012),.16+threads*.52+field*.25);c*=.42+strength*.85;
    ${core ? 'c=vec3(1.4,.12,.003)*(.4+field*.6);float alpha=(.12+field*.28)*smoothstep(.3,.57,field);' : cloud ? 'c=vec3(1.55,.045,.004)*(.25+field*.85)+vec3(.3,.06,.002)*pow(threads,8.);c*=.42+strength*.85;float alpha=(.08+field*.36)*smoothstep(.26,.60,field);' : 'c=vec3(.75,.019,.002)*(field*.8+.2)+vec3(1.4,.12,.005)*pow(threads,5.);c*=.42+strength*.85;float alpha=(.07+field*.37+threads*.17)*smoothstep(.24,.60,field);'}
    float facing=abs(dot(normalize(norm),normalize(plasmaView)));alpha*=smoothstep(.08,.5,facing)*smoothstep(.04,.54,plasmaEdge-field*.17);c*=.5+facing*.5;if(alpha<.025)discard;gl_FragColor=vec4(c,alpha);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
    }`,
  });
}

/** Original Blender assets are placed as complete assemblies. No major asset
 * is discarded for low quality; only small distant service details are reduced. */
export async function createHelionEnvironment(
  { track, view, settings = {} },
  { loadAsset } = {},
) {
  const group = new T.Group();
  group.name = 'Helion / working thermal observatory';
  const asset = await (loadAsset
    ? loadAsset(URL)
    : new GLTFLoader().loadAsync(URL));
  const templates = Object.fromEntries(
    asset.scene.children.map((part) => [part.name, part]),
  );
  const clearance = createRouteClearance(track, { localVertical: [-14, 22] });
  const placements = [];
  const airborneCover = [];
  const lamps = [];
  const bodies = [];
  const volumes = [];
  const geometry = new T.BoxGeometry(1, 1, 1);
  const graphite = new T.MeshStandardMaterial({
    name: 'Helion / service graphite',
    color: '#252d35',
    roughness: 0.66,
    metalness: 0.4,
  });
  const ivory = new T.MeshStandardMaterial({
    name: 'Helion / service ceramic',
    color: '#b9b8a4',
    roughness: 0.64,
    metalness: 0.12,
  });
  const copper = new T.MeshStandardMaterial({
    name: 'Helion / exposed heat pipes',
    color: '#9b572d',
    roughness: 0.43,
    metalness: 0.72,
  });
  const amber = new T.MeshStandardMaterial({
    name: 'Helion / inhabited amber apertures',
    color: '#e9bb72',
    emissive: '#eb8a35',
    emissiveIntensity: 1.2,
    roughness: 0.55,
  });
  function box(parent, name, size, position, material = graphite) {
    const mesh = new T.Mesh(geometry, material);
    mesh.name = name;
    mesh.scale.set(...size);
    mesh.position.set(...position);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  }
  function clone(name) {
    if (!templates[name]) throw new Error(`Helion scene asset missing ${name}`);
    const result = templates[name].clone(true);
    result.traverse((part) => {
      if (part.isMesh) {
        part.castShadow = true;
        part.receiveShadow = true;
      }
    });
    return result;
  }
  function site(name, distance, offset, lift = -35, scale = 1, yaw = 0) {
    const object = clone(name);
    const frame = groundFrame(track, distance);
    object.scale.setScalar(scale);
    object.rotation.y = Math.atan2(frame.tangent.x, frame.tangent.z) + yaw;
    let accepted = false;
    let bounds;
    for (let attempt = 0; attempt < 48; attempt++) {
      object.position
        .copy(frame.position)
        .addScaledVector(
          frame.right,
          offset + Math.sign(offset) * attempt * 35,
        );
      object.position.y += lift;
      object.updateMatrixWorld(true);
      bounds = new T.Box3().setFromObject(object);
      const center = bounds.getCenter(new T.Vector3());
      const size = bounds.getSize(new T.Vector3());
      if (
        clearance.clears(
          center.x,
          center.z,
          size.x + 2,
          size.z + 2,
          bounds.max.y + 1,
          0,
          bounds.min.y - 1,
        )
      ) {
        accepted = true;
        break;
      }
    }
    if (!accepted)
      throw new Error(
        `Helion architecture fails route clearance: ${name} at ${distance}`,
      );
    group.add(object);
    placements.push({
      name,
      distance,
      bounds: { min: bounds.min.toArray(), max: bounds.max.toArray() },
    });
    return object;
  }
  try {
    const L = track.length;
    // A repeated family with different joints/scale makes the ordinary road a
    // working facility, with gaps preserving long braking and star sightlines.
    for (const [s, lateral, scale, yaw] of [
      [0.04, 135, 1.08, 1.57],
      [0.19, -150, 1.12, 1.4],
      [0.29, -180, 1.9, 1.57],
      [0.43, 135, 1.28, 1.5],
      [0.62, 185, 1.6, 1.65],
      [0.79, -160, 1.25, 1.4],
      [0.94, 145, 1.0, 1.6],
    ])
      site('Sunshield', s * L, lateral, -53, scale, yaw);
    for (const [s, lateral, scale, yaw] of [
      [0.085, 112, 0.8, -0.4],
      [0.14, 132, 1.1, 0.3],
      [0.21, 140, 1.35, -0.6],
      [0.37, -115, 0.72, -0.3],
      [0.51, 125, 0.94, 0.8],
      [0.59, -120, 1.2, 0.45],
      [0.7, 148, 0.85, -0.7],
      [0.83, 125, 0.7, 0.3],
      [0.91, -130, 0.8, -0.4],
    ])
      site('RadiatorFan', s * L, lateral, -18, scale, yaw);
    site('InstrumentTower', 0.245 * L, -95, -35, 1.15, 0.25);
    site('InstrumentTower', 0.47 * L, -180, -55, 1.4, 0);
    site('InstrumentTower', 0.9 * L, 145, -38, 0.65, 0.4);
    // Distant massing sits below/behind complete near assemblies, giving scale
    // through off-axis views without adding a generic orbital skyline.
    site('Sunshield', 0.31 * L, -860, -210, 3.5, 1.2);
    site('Sunshield', 0.72 * L, 900, -240, 3.0, 1.75);
    site('RadiatorFan', 0.52 * L, -720, -130, 2.2, 0.5);

    for (let s = 40, index = 0; s < L; s += 142, index++) {
      const frame = track.sample(s);
      const sign = index % 2 ? -1 : 1;
      const station = clone('ServiceGantry');
      station.name = 'Helion / occupied access and thermal service assembly';
      station.position
        .copy(frame.position)
        .addScaledVector(frame.right, sign * 31)
        .addScaledVector(frame.up, -8);
      station.quaternion.copy(frame.quaternion);
      // Ground-frame clearance also catches another overpassing route branch.
      station.updateMatrixWorld(true);
      let clear = false;
      for (let attempt = 0; attempt < 12; attempt++) {
        const bounds = new T.Box3().setFromObject(station);
        const center = bounds.getCenter(new T.Vector3());
        const size = bounds.getSize(new T.Vector3());
        if (
          clearance.clears(
            center.x,
            center.z,
            size.x,
            size.z,
            bounds.max.y,
            0,
            bounds.min.y,
          )
        ) {
          clear = true;
          break;
        }
        station.position.addScaledVector(frame.right, sign * 14);
        station.updateMatrixWorld(true);
      }
      if (clear) {
        group.add(station);
      }
    }
    for (let s = 60, index = 0; s < L; s += 142, index++) {
      const frame = track.sample(s);
      const side = index % 2 ? -1 : 1;
      const deck = new T.Group();
      deck.name = 'Helion / connected service terrace';
      deck.position.copy(frame.position).addScaledVector(frame.up, -20);
      deck.quaternion.copy(frame.quaternion);
      box(
        deck,
        'Lower service span',
        [22, 2.2, 32],
        [side * 24, 0, 0],
        graphite,
      );
      box(
        deck,
        'Stepped pale maintenance ledge',
        [14, 1.6, 24],
        [side * 30, 3, 0],
        ivory,
      );
      for (const z of [-12, 12]) {
        box(
          deck,
          'Attached copper cross-keel',
          [42, 1.4, 1.6],
          [side * 9, 6, z],
          copper,
        );
        box(
          deck,
          'Lower graphite bundled seat',
          [5, 11, 5],
          [side * 15, 3, z],
          graphite,
        );
        box(
          deck,
          'Terrace inset service light',
          [8, 0.4, 0.4],
          [side * 25, 3.9, z],
          amber,
        );
      }
      for (let x = 20; x <= 34; x += 7)
        box(
          deck,
          'Maintenance guard post',
          [0.4, 2.5, 0.4],
          [side * x, 5, -12],
          copper,
        );
      group.add(deck);
    }

    // Physical cover follows the authored route. The narrow flare refuge has
    // an unbroken roof over lateral -15..-8.5, with no in-road support posts.
    for (const zone of track.thermalZones ?? []) {
      if (!['shelter', 'flare', 'furnace'].includes(zone.kind)) continue;
      const roofWidth =
        zone.kind === 'flare' ? 0.125 : zone.kind === 'furnace' ? 0.83 : 0.9;
      const step = 44;
      const count = Math.ceil((zone.end - zone.start) / step);
      for (let i = 0; i < count; i++) {
        const s = zone.start + ((i + 0.5) * (zone.end - zone.start)) / count;
        const frame = track.sample(s);
        const cover = clone('JumpCanopy');
        cover.name = `${zone.label} / ${zone.kind === 'furnace' ? 'heated thermal shutter' : 'physical cover'}`;
        cover.position
          .copy(frame.position)
          .addScaledVector(
            frame.up,
            zone.id === 'wall-shade' ? 78 : zone.kind === 'furnace' ? 27 : 24,
          )
          .addScaledVector(frame.right, zone.kind === 'flare' ? -11.75 : 0);
        cover.quaternion.copy(frame.quaternion);
        cover.scale.set(roofWidth, 1, 0.66);
        group.add(cover);
        lamps.push({
          position: frame.position.clone().addScaledVector(frame.up, 8),
          kind: zone.kind,
          s,
        });
      }
    }
    for (const jump of track.jumps ?? []) {
      const start = jump.takeoff - 60;
      const end = jump.landingEnd + 40;
      // At the outer 15 m driving edge the tapered roof still has at least
      // 42 m longitudinal coverage. A <=34 m pitch leaves physical overlap,
      // including through the full fast-flight landing envelope.
      const count = Math.ceil((end - start) / 34);
      const pitch = (end - start) / count;
      const intervals = [];
      for (let i = 0; i < count; i++) {
        const s = start + (i + 0.5) * pitch;
        intervals.push({ start: s - 21, end: s + 21 });
        const frame = track.sample(s);
        const cover = clone('JumpCanopy');
        cover.name = `${jump.id} / shielded airborne corridor`;
        cover.position.copy(frame.position).addScaledVector(frame.up, 36.4);
        cover.quaternion.copy(frame.quaternion);
        cover.scale.set(0.77, 1.1, 0.67);
        group.add(cover);
      }
      airborneCover.push({
        id: jump.id,
        start,
        end,
        minimumUndersideUp: 34.09,
        intervals,
      });
    }
    const flareDefinitions = [
      {
        id: 'crown',
        name: 'ProminenceCrown',
        s: 0.32 * L,
        lateral: -480,
        scale: 1.65,
        yaw: Math.PI / 2,
        center: new T.Vector3(-2300, 270, 1100),
      },
      {
        id: 'ribbon',
        name: 'ProminenceRibbon',
        s: 0.73 * L,
        lateral: 610,
        scale: 1.55,
        yaw: 0,
        center: new T.Vector3(460, 90, 1450),
      },
    ];
    for (const definition of flareDefinitions) {
      const body = clone(definition.name);
      body.scale.setScalar(definition.scale);
      body.rotation.y = definition.yaw;
      body.updateMatrixWorld(true);
      const initialBounds = new T.Box3().setFromObject(body);
      body.position
        .copy(definition.center)
        .sub(initialBounds.getCenter(new T.Vector3()));
      body.updateMatrixWorld(true);
      const bounds = new T.Box3().setFromObject(body);
      const center = bounds.getCenter(new T.Vector3()),
        size = bounds.getSize(new T.Vector3());
      if (
        !clearance.clears(
          center.x,
          center.z,
          size.x,
          size.z,
          bounds.max.y,
          0,
          bounds.min.y,
        )
      )
        throw new Error(
          `Helion prominence intersects driving corridor: ${definition.id}`,
        );
      group.add(body);
      placements.push({
        name: definition.name,
        distance: definition.s,
        bounds: { min: bounds.min.toArray(), max: bounds.max.toArray() },
      });
      body.userData.aoExclude = true;
      const materials = [];
      body.traverse((part) => {
        if (!part.isMesh) return;
        const material = flareMaterial(
          part.material.name.includes('core'),
          part.material.name.includes('billow'),
        );
        part.material = material;
        part.visible = material.name.includes('hot core');
        part.castShadow = false;
        part.receiveShadow = false;
        materials.push(material);
      });
      const volume = createPlasmaVolume(
        JSON.parse(body.userData.helionDensityPockets),
      );
      body.add(volume.mesh);
      volumes.push(volume);
      const light = new T.PointLight('#ff7327', 0, 2600, 2);
      const spill = new T.PointLight('#ff6628', 0, 350, 2);
      const receiver = track.sample(
        (definition.id === 'crown' ? 0.17 : 0.798) * L,
      );
      spill.position
        .copy(receiver.position)
        .addScaledVector(receiver.up, 65)
        .addScaledVector(receiver.right, -35);
      group.add(spill);
      light.position.copy(body.position).add(new T.Vector3(0, 210, 0));
      group.add(light);
      bodies.push({ ...definition, body, light, spill, materials, volume });
    }
  } catch (error) {
    for (const volume of volumes) volume.dispose();
    release(asset.scene, group);
    if (!group.getObjectByProperty('geometry', geometry)) geometry.dispose();
    throw error;
  }
  // Batch all static architecture by material in four broad map quadrants.
  // This preserves full modeled forms while bounding draw calls even in overview.
  group.updateMatrixWorld(true);
  const batches = new Map();
  const removed = [];
  group.traverse((object) => {
    if (!object.isMesh || object.material.isShaderMaterial) return;
    const center = new T.Vector3().setFromMatrixPosition(object.matrixWorld);
    const quadrant = `${center.x < -180 ? 0 : 1}:${center.z < -260 ? 0 : 1}`;
    const key = `${object.material.uuid}:${quadrant}`;
    if (!batches.has(key))
      batches.set(key, { material: object.material, geometries: [] });
    const copy = object.geometry.clone().applyMatrix4(object.matrixWorld);
    for (const attribute of Object.keys(copy.attributes))
      if (!['position', 'normal', 'color'].includes(attribute))
        copy.deleteAttribute(attribute);
    batches.get(key).geometries.push(copy);
    removed.push(object);
  });
  for (const object of removed) object.removeFromParent();
  for (const { material, geometries } of batches.values()) {
    const merged = mergeGeometries(geometries);
    for (const part of geometries) part.dispose();
    if (!merged) throw new Error('Helion static architecture batching failed');
    const mesh = new T.Mesh(merged, material);
    mesh.name = `Helion / thermal district / ${material.name}`;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
  }
  const thermal = createThermalSurfaces(track);
  group.add(thermal.group);
  const localLights = Array.from({ length: 3 }, () => {
    const light = new T.PointLight('#ffd291', 0, 72, 2);
    group.add(light);
    return light;
  });
  const finished = new Set();
  for (const root of [asset.scene, group])
    root.traverse((object) => {
      for (const material of [object.material].flat().filter(Boolean)) {
        if (finished.has(material)) continue;
        finished.add(material);
        finishThermalMaterial(
          material,
          /copper/i.test(material.name)
            ? 'copper'
            : /graphite|shield|carbon/i.test(material.name)
              ? 'graphite'
              : 'ceramic',
        );
      }
    });
  const baseSun = view?.sun?.intensity ?? 3.0;
  let disposed = false;
  let time = 0;
  let currentSun = baseSun;
  const metrics = {
    assetBytes: 7530252,
    modelPlacements: placements.length,
    source: URL,
    placements,
    airborneCover,
    meshCount: 0,
    triangles: 0,
  };
  group.traverse((object) => {
    if (!object.isMesh) return;
    metrics.meshCount++;
    metrics.triangles +=
      (object.geometry.index?.count ??
        object.geometry.attributes.position.count) / 3;
  });
  group.userData.metrics = metrics;
  return {
    group,
    metrics,
    update(frame = {}) {
      time = frame.time ?? time;
      const current = frame.settings ?? settings;
      thermal.update({ ...frame, time, settings: current });
      const prominences = sampleHelionProminences(time);
      for (const body of bodies) {
        const event = prominences.find((entry) => entry.id === body.id);
        for (const material of body.materials) {
          material.uniforms.strength.value = event.strength;
          material.uniforms.time.value = current.reducedMotion ? 0 : time;
        }
        body.volume.update(event.strength, time, current);
        body.light.intensity = 4000 + event.strength ** 2 * 650000;
        body.spill.intensity = 1000 + event.strength ** 2 * 9000;
      }
      const state = frame.state;
      if (state) {
        const thermalSample = sampleHelionThermal(
          track,
          state.distance ?? 0,
          state.lateral ?? 0,
          time,
        );
        if (view?.sun) {
          const target =
            baseSun *
            (thermalSample.sheltered ? 0.36 : 1) *
            (0.91 +
              0.12 * prominences[0].strength +
              0.08 * prominences[1].strength);
          currentSun = frame.reset
            ? target
            : T.MathUtils.lerp(
                currentSun,
                target,
                1 - Math.exp(-Math.max(0, frame.dt ?? 0) * 2.2),
              );
          view.sun.intensity = currentSun;
        }
        const position = track.sample(state.distance ?? 0).position;
        const nearest = lamps
          .map((lamp) => ({
            ...lamp,
            distance: lamp.position.distanceToSquared(position),
          }))
          .sort((a, b) => a.distance - b.distance)
          .slice(0, 3);
        localLights.forEach((light, index) => {
          const lamp = nearest[index];
          if (!lamp) {
            light.intensity = 0;
            return;
          }
          light.position.copy(lamp.position);
          light.color.set(lamp.kind === 'furnace' ? '#ff6024' : '#a8c7dc');
          light.intensity =
            lamp.kind === 'furnace'
              ? 140
              : lamp.kind === 'flare'
                ? 90 * sampleHelionThermal(track, lamp.s, 0, time).flareStrength
                : 90;
        });
      }
    },
    reset() {
      time = 0;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      if (view?.sun) view.sun.intensity = baseSun;
      thermal.dispose();
      for (const volume of volumes) volume.dispose();
      thermal.group.removeFromParent();
      release(asset.scene, group);
      geometry.dispose();
      group.clear();
    },
  };
}
