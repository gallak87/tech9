import * as T from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import {
  createRouteClearance,
  groundFrame,
} from '../../../environment/placement.js';
import { sampleHelionProminences, sampleHelionThermal } from '../thermal.js';
import { createThermalSurfaces } from './thermal-surfaces.js';

const URL = '/assets/levels/helion/thermal-observatory.glb';

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

function flareMaterial(core = false) {
  return new T.ShaderMaterial({
    name: `Helion / modeled ${core ? 'hot core' : 'plasma sheet'}`,
    side: T.DoubleSide,
    uniforms: { strength: { value: 0.6 }, time: { value: 0 } },
    vertexShader: `varying vec3 local;varying vec3 norm;uniform float time;uniform float strength;
    void main(){local=position;norm=normal;vec3 p=position;p.y*=.92+.08*strength;p.z+=sin(position.y*.031+position.x*.017+time*.11)*2.;gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.);}`,
    fragmentShader: `varying vec3 local;varying vec3 norm;uniform float strength;uniform float time;
    void main(){float threads=.5+.5*sin(local.x*.08+local.y*.15+sin(local.y*.033+time*.13)*3.);float cellular=.5+.5*sin(local.z*.14+sin(local.x*.045)*4.);vec3 c=mix(vec3(.34,.023,.004),vec3(1.85,.32,.015),.23+threads*.52+cellular*.15);c*=.45+strength*.85;${core ? 'c=mix(c,vec3(2.1,.85,.14),.65);' : ''}gl_FragColor=vec4(c,1.);
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
  const lamps = [];
  const bodies = [];
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
  const glass = new T.MeshStandardMaterial({
    name: 'Helion / control glazing',
    color: '#214652',
    roughness: 0.21,
    metalness: 0.55,
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
      const station = new T.Group();
      station.name = 'Helion / occupied access and thermal service assembly';
      station.position
        .copy(frame.position)
        .addScaledVector(frame.right, sign * 31)
        .addScaledVector(frame.up, -8);
      station.quaternion.copy(frame.quaternion);
      box(station, 'Layered access deck', [15, 2.8, 22], [0, -2, 0], ivory);
      box(station, 'Heat exchanger trunk', [8, 7, 13], [sign * 2, 2, 0]);
      box(
        station,
        'Control gallery clerestory',
        [8.5, 2, 9.5],
        [sign * 2, 5.3, 0],
        glass,
      );
      box(station, 'Pale visor', [10, 1.2, 15], [sign * 2, 7, 0], ivory);
      for (let k = 0; k < 3; k++)
        box(
          station,
          'Copper exchanger blades',
          [1.15, 5, 13],
          [-sign * 4 + k * sign * 1.4, 1, 0],
          copper,
        );
      box(
        station,
        'Occupied maintenance light',
        [8, 0.45, 0.35],
        [0, 4.5, -6.65],
        amber,
      );
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
          .addScaledVector(frame.up, zone.kind === 'furnace' ? 27 : 24)
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
      const count = Math.ceil((jump.landingStart - jump.takeoff + 140) / 45);
      for (let i = 0; i < count; i++) {
        const s = jump.takeoff - 45 + i * 45;
        const frame = track.sample(s);
        const cover = clone('JumpCanopy');
        cover.name = `${jump.id} / shielded airborne corridor`;
        cover.position.copy(frame.position).addScaledVector(frame.up, 35);
        cover.quaternion.copy(frame.quaternion);
        cover.scale.set(0.77, 1.1, 0.67);
        group.add(cover);
      }
    }
    const flareDefinitions = [
      {
        id: 'crown',
        name: 'ProminenceCrown',
        s: 0.32 * L,
        lateral: -480,
        scale: 1.35,
        yaw: -0.6,
      },
      {
        id: 'ribbon',
        name: 'ProminenceRibbon',
        s: 0.73 * L,
        lateral: 610,
        scale: 1.55,
        yaw: 0.4,
      },
    ];
    for (const definition of flareDefinitions) {
      const body = site(
        definition.name,
        definition.s,
        definition.lateral,
        -180,
        definition.scale,
        definition.yaw,
      );
      body.userData.aoExclude = true;
      const materials = [];
      body.traverse((part) => {
        if (!part.isMesh) return;
        const material = flareMaterial(part.material.name.includes('core'));
        part.material = material;
        part.castShadow = false;
        part.receiveShadow = false;
        materials.push(material);
      });
      const light = new T.PointLight('#ff7327', 0, 1350, 2);
      light.position.copy(body.position).add(new T.Vector3(0, 210, 0));
      group.add(light);
      bodies.push({ ...definition, body, light, materials });
    }
  } catch (error) {
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
      if (!['position', 'normal'].includes(attribute))
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
    const light = new T.PointLight('#ffd291', 0, 95, 2);
    group.add(light);
    return light;
  });
  const baseSun = view?.sun?.intensity ?? 3.0;
  let disposed = false;
  let time = 0;
  let currentSun = baseSun;
  const metrics = {
    assetBytes: 1530128,
    modelPlacements: placements.length,
    source: URL,
    placements,
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
        body.light.intensity = 24000 + event.strength * 155000;
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
          light.color.set(lamp.kind === 'furnace' ? '#ff6024' : '#ffd39a');
          light.intensity = lamp.kind === 'furnace' ? 3500 : 1700;
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
      thermal.group.removeFromParent();
      release(asset.scene, group);
      geometry.dispose();
      group.clear();
    },
  };
}
