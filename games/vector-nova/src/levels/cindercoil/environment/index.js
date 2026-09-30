import * as T from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import {
  createRouteClearance,
  groundFrame,
} from '../../../environment/placement.js';
import { sampleCindercoilEvent } from '../mechanics.js';
import { createCindercoilMaterials } from './materials.js';
import {
  createCalderaTerrain,
  createLavaPool,
  disposeOwned,
  seededRandom,
} from './geometry.js';

const ASSET = '/assets/levels/cindercoil/cindercoil-hero-kit.glb';
const UP = new T.Vector3(0, 1, 0);

function instantiateModule(template, placements, name) {
  const group = new T.Group();
  group.name = name;
  const matrix = new T.Matrix4(),
    transform = new T.Matrix4();
  group.userData.batches = [];
  template.updateMatrixWorld(true);
  template.traverse((node) => {
    if (!node.isMesh) return;
    const instances = new T.InstancedMesh(
      node.geometry,
      node.material,
      placements.length,
    );
    instances.name = `${name} / ${node.name}`;
    instances.receiveShadow = true;
    for (let i = 0; i < placements.length; i += 1) {
      const p = placements[i];
      transform.compose(p.position, p.quaternion, p.scale);
      matrix.multiplyMatrices(transform, node.matrixWorld);
      instances.setMatrixAt(i, matrix);
    }
    instances.computeBoundingSphere();
    group.add(instances);
    group.userData.batches.push({
      mesh: instances,
      sourceMatrix: node.matrixWorld.clone(),
    });
  });
  return group;
}

function particles(track) {
  const random = seededRandom(418);
  const count = 680;
  const positions = new Float32Array(count * 3);
  const basin = track.landmarks.basin;
  for (let i = 0; i < count; i += 1) {
    positions.set(
      [
        basin.center[0] + (random() - 0.5) * 1450,
        -15 + random() * 440,
        basin.center[2] + (random() - 0.5) * 1400,
      ],
      i * 3,
    );
  }
  const geometry = new T.BufferGeometry();
  geometry.setAttribute('position', new T.BufferAttribute(positions, 3));
  const material = new T.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: { time: { value: 0 } },
    vertexShader: `uniform float time;varying float opacity;void main(){vec3 p=position;p.x+=sin(time*.14+p.y)*5.;p.y=mod(p.y-time*1.6+500.,500.)-20.;vec4 v=modelViewMatrix*vec4(p,1.);gl_Position=projectionMatrix*v;gl_PointSize=clamp(180./max(1.,-v.z),1.,3.);opacity=.35*(1.-smoothstep(700.,1200.,-v.z));}`,
    fragmentShader: `varying float opacity;void main(){float r=length(gl_PointCoord-.5)*2.;if(r>1.)discard;gl_FragColor=vec4(.52,.60,.67,opacity*(1.-r));\n#include <tonemapping_fragment>\n#include <colorspace_fragment>}`,
  });
  const points = new T.Points(geometry, material);
  points.name = 'Cindercoil / sparse slow ash';
  points.frustumCulled = false;
  return points;
}

/** Local world ownership: no cached GLB, shared scene edits or wall-clock animation. */
export function createCindercoilEnvironment({
  track,
  shape = false,
  settings = {},
  loadAsset,
} = {}) {
  const group = new T.Group();
  group.name = shape
    ? 'Cindercoil / neutral shape floor'
    : 'Cindercoil / natural caldera';
  if (shape) {
    const floor = new T.Mesh(
      new T.CircleGeometry(1600, 64).rotateX(-Math.PI / 2),
      new T.MeshStandardMaterial({ color: '#37414c', roughness: 1 }),
    );
    floor.position.y = track.groundY - 5;
    group.add(floor);
    return {
      group,
      dispose() {
        disposeOwned(group);
      },
    };
  }
  const materials = createCindercoilMaterials();
  const random = seededRandom();
  const clearance = createRouteClearance(track, {
    spacing: 6,
    sidePadding: 17,
    localVertical: [-22, 34],
  });
  const terrain = createCalderaTerrain(track, materials.basalt);
  group.add(terrain);
  const basin = track.landmarks.basin;
  const lake = createLavaPool(
    basin.radius * 1.4,
    basin.radius * 1.03,
    materials.lava,
  );
  lake.position.set(...basin.center);
  group.add(lake);
  const ruptureLocation = track.landmarks.rupture;
  const wall = new T.Group();
  wall.name = 'Cindercoil / rupture and volumetric channels';
  wall.position.set(
    ruptureLocation.position[0],
    basin.lakeY,
    ruptureLocation.position[2],
  );
  wall.rotation.y = Math.atan2(
    ruptureLocation.direction[0],
    ruptureLocation.direction[2],
  );
  group.add(wall);
  const plungePool = createLavaPool(190, 104, materials.lava, 16);
  plungePool.position.set(0, 1, 100);
  wall.add(plungePool);
  const launch = track.landmarks.launch;
  const ventPosition = new T.Vector3()
    .fromArray(launch.takeoff)
    .lerp(new T.Vector3().fromArray(launch.landing), 0.52);
  ventPosition.y = track.groundY + 5;
  const ventPool = createLavaPool(43, 32, materials.lava, 31);
  ventPool.position.copy(ventPosition);
  group.add(ventPool);
  const fountain = new T.Group();
  fountain.name = 'Cindercoil / active vent molten tongues';
  fountain.position.copy(ventPosition);
  const ventMaterial = new T.MeshStandardMaterial({
    color: '#e45116',
    emissive: '#ff6215',
    emissiveIntensity: 1.8,
    roughness: 0.65,
  });
  const ventRimMaterial = new T.MeshStandardMaterial({
    color: '#262c32',
    roughness: 0.93,
  });
  for (let i = 0; i < 5; i += 1) {
    const angle = (i * Math.PI * 2) / 5;
    const height = 132 + i * 9;
    const path = new T.CatmullRomCurve3([
      new T.Vector3(Math.cos(angle) * 7, 0, Math.sin(angle) * 7),
      new T.Vector3(Math.cos(angle) * 9, height * 0.36, Math.sin(angle) * 9),
      new T.Vector3(Math.cos(angle) * 17, height * 0.83, Math.sin(angle) * 17),
      new T.Vector3(Math.cos(angle) * 25, height, Math.sin(angle) * 25),
      new T.Vector3(Math.cos(angle) * 33, height * 0.88, Math.sin(angle) * 33),
    ]);
    const tongue = new T.Mesh(
      new T.TubeGeometry(path, 22, 3.1 - i * 0.27, 7, false),
      ventMaterial,
    );
    tongue.name = 'Cindercoil / volumetric volcanic tongue';
    fountain.add(tongue);
  }
  const ventRim = new T.Mesh(
    new T.TorusGeometry(37, 6, 6, 32).rotateX(Math.PI / 2),
    ventRimMaterial,
  );
  ventRim.position.copy(ventPosition);
  ventRim.position.y -= 1;
  group.add(fountain, ventRim);
  const ash = particles(track);
  group.add(ash);
  const lights = Array.from({ length: 3 }, () => {
    const light = new T.PointLight('#ff772b', 0, 270, 2);
    light.name = 'Cindercoil / motivated molten bounce';
    group.add(light);
    return light;
  });
  const lightAnchors = [
    new T.Vector3(...basin.center).add(new T.Vector3(0, 35, 0)),
    new T.Vector3(
      ruptureLocation.position[0] + 85,
      108,
      ruptureLocation.position[2],
    ),
    ventPosition.clone().add(new T.Vector3(0, 72, 0)),
  ];
  const poses = [],
    raftPlacements = [],
    animated = [];
  let rafts = null;
  const raftMatrix = new T.Matrix4(),
    raftTransform = new T.Matrix4(),
    raftPosition = new T.Vector3();
  let assetScene = null,
    disposed = false,
    loaded = false,
    overview = false;
  let leftPanel = null,
    rightPanel = null;
  const metrics = {
    assetBytes: 642568,
    sourceTriangles: 21590,
    textures: 0,
    additionalRenderPasses: 0,
    localLights: 3,
  };
  group.userData.metrics = metrics;
  const placements = [];
  group.userData.clearanceReport = {
    sampleCount: clearance.sampleCount,
    halfWidth: clearance.halfWidth,
    localVertical: clearance.localVertical,
    placements,
  };
  group.userData.setOverview = (active) => {
    overview = Boolean(active);
    group.visible = !overview;
  };

  function accept(gltf) {
    if (disposed) {
      disposeOwned(gltf.scene);
      return;
    }
    assetScene = gltf.scene;
    const template = (name) => {
      const node = assetScene.getObjectByName(name);
      if (!node) throw new Error(`Cindercoil hero kit is missing ${name}`);
      return node;
    };
    for (const name of [
      'rupture_wall',
      'rupture_left',
      'rupture_right',
      'cascade_0',
      'cascade_1',
      'cascade_2',
    ]) {
      const object = template(name).clone(true);
      wall.add(object);
      if (name === 'rupture_left') leftPanel = object;
      if (name === 'rupture_right') rightPanel = object;
      if (name.startsWith('cascade_')) animated.push(object);
    }
    const coil = track.landmarks.coil;
    const tower = template('hollow_tower').clone(true);
    const towerBounds = new T.Box3().setFromObject(template('hollow_tower'));
    const towerBase = Math.min(coil.baseY, track.groundY - 40);
    const sy =
      (coil.topY - towerBase) / (towerBounds.max.y - towerBounds.min.y);
    tower.position.set(
      coil.center[0],
      towerBase - towerBounds.min.y * sy,
      coil.center[2],
    );
    tower.scale.set(coil.towerRadius / 67, sy, coil.towerRadius / 67);
    group.add(tower);
    // Real launch geometry belongs to the road. These broken external braces
    // stay beyond the entire flight/camera corridor and root into basalt feet.
    const jumpFrame = track.sample(track.jumps[0].takeoff);
    const yaw = Math.atan2(jumpFrame.tangent.x, jumpFrame.tangent.z);
    for (const side of [-1, 1]) {
      const pylon = template('broken_launch_pylon').clone(true);
      pylon.position
        .fromArray(launch.takeoff)
        .addScaledVector(jumpFrame.right, side * 60);
      pylon.position.y -= 31;
      pylon.scale.set(0.75, (pylon.position.y - track.groundY + 35) / 70, 0.95);
      pylon.rotation.y = yaw;
      group.add(pylon);
    }
    // Basalt clusters are composed along every district, with conservative
    // route-space rejection that also protects the fully inverted climb.
    for (let s = 15; s < track.length; s += 65) {
      const frame = groundFrame(track, s);
      for (const side of [-1, 1]) {
        const scale = 0.75 + random() * 1.65;
        const heightScale =
          ((frame.position.y - track.groundY + 50) / 38) *
          (0.68 + random() * 0.32);
        let position,
          accepted = false;
        for (let attempt = 0; attempt < 7; attempt += 1) {
          position = frame.position
            .clone()
            .addScaledVector(
              frame.right,
              side * (60 + attempt * 22 + random() * 12),
            );
          position.y = track.groundY - 38;
          const top = position.y + 46 * heightScale;
          if (
            clearance.clears(
              position.x,
              position.z,
              60 * scale,
              60 * scale,
              top,
              0,
              position.y - 3,
            )
          ) {
            accepted = true;
            break;
          }
        }
        if (!accepted) continue;
        poses.push({
          position,
          quaternion: new T.Quaternion().setFromAxisAngle(
            UP,
            random() * Math.PI * 2,
          ),
          scale: new T.Vector3(scale, heightScale, scale),
        });
        placements.push({
          type: 'basalt-cluster',
          s,
          position: position.toArray(),
          scale,
          heightScale,
        });
      }
    }
    group.add(
      instantiateModule(
        template('basalt_cluster'),
        poses,
        'Cindercoil / ordinary basalt teeth',
      ),
    );
    // Thick plates sit above both main lake and cascade plunge basin.
    for (let i = 0; i < 48; i += 1) {
      const onRupture = i >= 30;
      const angle = random() * Math.PI * 2,
        radius = Math.sqrt(random()) * 0.89;
      const position = new T.Vector3(
        Math.cos(angle) * radius * (onRupture ? 173 : basin.radius * 1.3),
        1.5 + random() * 1.4,
        Math.sin(angle) * radius * (onRupture ? 85 : basin.radius * 0.95),
      );
      if (onRupture) {
        position.z += 102;
        position.applyAxisAngle(UP, wall.rotation.y).add(wall.position);
      } else position.add(new T.Vector3(...basin.center));
      const scale = 0.34 + random() * 0.55;
      raftPlacements.push({
        position,
        quaternion: new T.Quaternion().setFromAxisAngle(
          UP,
          random() * Math.PI * 2,
        ),
        scale: new T.Vector3(scale, 0.7 + random() * 0.5, scale),
      });
    }
    rafts = instantiateModule(
      template('crust_raft'),
      raftPlacements,
      'Cindercoil / fractured cooling crust rafts',
    );
    group.add(rafts);
    let meshes = 0,
      triangles = 0;
    group.traverse((node) => {
      if (!node.isMesh) return;
      meshes += 1;
      triangles +=
        ((node.geometry.index?.count ??
          node.geometry.attributes.position.count) /
          3) *
        (node.isInstancedMesh ? node.count : 1);
    });
    Object.assign(metrics, {
      meshCount: meshes,
      triangleCount: triangles,
      basaltClusters: poses.length,
      crustRafts: raftPlacements.length,
    });
    loaded = true;
  }
  let ready = Promise.resolve(false);
  if (
    loadAsset ||
    (typeof document !== 'undefined' && typeof location !== 'undefined')
  ) {
    ready = Promise.resolve()
      .then(() =>
        (loadAsset ?? ((url) => new GLTFLoader().loadAsync(url)))(ASSET),
      )
      .then((gltf) => {
        accept(gltf);
        return !disposed;
      })
      .catch((error) => {
        disposeOwned(group, [assetScene], Object.values(materials));
        disposed = true;
        throw error;
      });
  }
  function update({
    time = 0,
    camera,
    settings: currentSettings = settings,
  } = {}) {
    if (disposed) return;
    const event = sampleCindercoilEvent(time);
    const motionTime = currentSettings.reducedMotion ? 0 : time;
    materials.lava.uniforms.time.value = motionTime;
    materials.lava.uniforms.pulse.value = event.rupture;
    fountain.scale.y =
      0.025 + event.vent * 0.975 + (event.ventWarning ? 0.055 : 0);
    fountain.rotation.y = currentSettings.reducedMotion
      ? 0
      : Math.sin(motionTime * 0.35) * 0.06;
    ventMaterial.emissiveIntensity = 1.1 + event.vent * 0.7;
    if (rafts) {
      for (const { mesh, sourceMatrix } of rafts.userData.batches) {
        for (let i = 0; i < raftPlacements.length; i += 1) {
          const p = raftPlacements[i];
          raftPosition.copy(p.position);
          const expansion = event.rupture * (i >= 30 ? 5.2 : 1.8);
          raftPosition.x += Math.sin(i * 2.4) * expansion;
          raftPosition.z += Math.cos(i * 2.4) * expansion;
          if (!currentSettings.reducedMotion)
            raftPosition.y += Math.sin(motionTime * 0.38 + i) * 0.38;
          raftTransform.compose(raftPosition, p.quaternion, p.scale);
          raftMatrix.multiplyMatrices(raftTransform, sourceMatrix);
          mesh.setMatrixAt(i, raftMatrix);
        }
        mesh.instanceMatrix.needsUpdate = true;
      }
    }
    ash.visible = !currentSettings.reducedMotion && !overview;
    ash.material.uniforms.time.value = motionTime;
    ash.geometry.setDrawRange(0, currentSettings.quality === 'low' ? 180 : 680);
    if (leftPanel) leftPanel.position.x = -event.rupture * 7;
    if (rightPanel) rightPanel.position.x = event.rupture * 7;
    for (const [index, channel] of animated.entries()) {
      channel.scale.z = 0.91 + event.rupture * 0.22;
      channel.position.y = currentSettings.reducedMotion
        ? 0
        : Math.sin(motionTime * 0.47 + index) * 0.55;
    }
    if (camera?.position) {
      const anchors = lightAnchors
        .map((position, index) => ({
          position,
          index,
          distance: position.distanceTo(camera.position),
        }))
        .sort((a, b) => a.distance - b.distance);
      for (const [index, light] of lights.entries()) {
        const anchor = anchors[index];
        light.position.copy(anchor.position);
        const strength =
          anchor.index === 1
            ? 1 + event.rupture * 0.5
            : anchor.index === 2
              ? 1 + event.vent * 0.35
              : 1;
        light.intensity = overview
          ? 0
          : 10500 *
            strength *
            (1 - T.MathUtils.smoothstep(anchor.distance, 260, 560));
      }
    }
    group.userData.presentation = {
      loaded,
      rupture: event.rupture,
      vent: event.vent,
      time,
      reducedMotion: Boolean(currentSettings.reducedMotion),
      quality: currentSettings.quality ?? 'high',
    };
  }
  return {
    group,
    ready,
    update,
    reset() {
      update({ time: 0, settings });
    },
    setReflection(texture) {
      for (const material of Object.values(materials))
        if (material.isMeshStandardMaterial) {
          material.envMap = texture;
          material.needsUpdate = true;
        }
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      loaded = false;
      disposeOwned(group, [assetScene], Object.values(materials));
      poses.length = 0;
      raftPlacements.length = 0;
      animated.length = 0;
    },
  };
}
