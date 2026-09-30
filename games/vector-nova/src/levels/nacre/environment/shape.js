import * as T from 'three';
import {
  createRouteClearance,
  groundFrame,
} from '../../../environment/placement.js';
import {
  NACRE_AIR_COLOR,
  NACRE_WATER_COLOR,
  sampleNacreWater,
} from './atmosphere.js';

function routeBounds(track) {
  const bounds = new T.Box3();
  for (let distance = 0; distance < track.length; distance += 8)
    bounds.expandByPoint(track.sample(distance).position);
  return bounds;
}

function createWater(size, waterY) {
  const material = new T.ShaderMaterial({
    name: 'Nacre / bare-review two-sided ocean surface',
    transparent: true,
    side: T.DoubleSide,
    forceSinglePass: true,
    depthWrite: false,
    uniforms: {
      time: { value: 0 },
      wetness: { value: 0 },
      nearSurface: { value: 1 },
    },
    vertexShader: `
      varying vec3 worldPosition;
      void main() {
        vec4 world=modelMatrix*vec4(position,1.);
        worldPosition=world.xyz;
        gl_Position=projectionMatrix*viewMatrix*world;
      }
    `,
    fragmentShader: `
      varying vec3 worldPosition;
      uniform float time;
      uniform float wetness;
      uniform float nearSurface;
      void main() {
        vec2 p=worldPosition.xz;
        float wave=sin(p.x*.026+p.y*.018+time*.35);
        float crossWave=sin(p.x*-.042+p.y*.031-time*.22);
        vec3 normal=normalize(vec3(wave*.14,1.,crossWave*.12));
        vec3 view=normalize(cameraPosition-worldPosition);
        float fresnel=pow(1.-abs(dot(normal,view)),3.);
        float glint=pow(max(dot(reflect(-normalize(vec3(-.5,.7,.4)),normal),view),0.),36.);
        vec3 tint=mix(vec3(.046,.13,.15),vec3(.22,.33,.35),fresnel);
        tint+=vec3(.05,.075,.075)*(wave*crossWave*.5+.5);
        tint+=vec3(.35,.38,.34)*glint*.28;
        tint=mix(tint,vec3(.16,.35,.38)+vec3(.05)*wave*crossWave,wetness*.72);
        gl_FragColor=vec4(tint,mix(.60,.42,wetness)*nearSurface);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  });
  const mesh = new T.Mesh(new T.PlaneGeometry(size, size), material);
  mesh.name = 'Nacre / sea level, world y = ' + waterY;
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = waterY;
  mesh.renderOrder = 2;
  mesh.userData.aoExclude = true;
  return mesh;
}

/** Deliberately sparse shape-review massing; no production art claim. */
export function createNacreEnvironment(track) {
  const group = new T.Group();
  group.name = 'Nacre / early ocean, seabed and route-scale massing';
  const waterY = track.waterY ?? 0;
  const bounds = routeBounds(track);
  const center = bounds.getCenter(new T.Vector3());
  const span = bounds.getSize(new T.Vector3());
  const oceanSize = Math.max(span.x, span.z, 1600) + 12000;
  const seabedY = Math.min(bounds.min.y - 85, waterY - 180);
  const water = createWater(oceanSize, waterY);
  water.position.x = center.x;
  water.position.z = center.z;
  group.add(water);

  const seaLevelGrid = new T.GridHelper(
    Math.max(span.x, span.z) + 400,
    16,
    '#82a4a9',
    '#6a8990',
  );
  seaLevelGrid.name = 'Nacre / overview sea-level reference';
  seaLevelGrid.position.set(center.x, waterY, center.z);
  seaLevelGrid.material.transparent = true;
  seaLevelGrid.material.opacity = 0.25;
  seaLevelGrid.material.depthWrite = false;
  seaLevelGrid.visible = false;
  group.add(seaLevelGrid);

  const seabedMaterial = new T.MeshStandardMaterial({
    color: '#34484b',
    roughness: 1,
  });
  const basaltMaterial = new T.MeshStandardMaterial({
    color: '#455558',
    roughness: 0.92,
    flatShading: true,
  });
  const structureMaterial = new T.MeshStandardMaterial({
    color: '#b4b9b7',
    roughness: 0.72,
    metalness: 0.12,
  });
  const seabed = new T.Mesh(
    new T.PlaneGeometry(oceanSize, oceanSize),
    seabedMaterial,
  );
  seabed.name = 'Nacre / depth reference seabed';
  seabed.rotation.x = -Math.PI / 2;
  seabed.position.set(center.x, seabedY, center.z);
  group.add(seabed);

  const clearance = createRouteClearance(track);
  const placements = [];
  const columns = new T.Group();
  columns.name = 'Nacre / sparse basalt silhouette study';
  group.add(columns);
  for (let index = 0; index < 14; index += 1) {
    const frame = groundFrame(track, ((index + 0.32) / 14) * track.length);
    const side = index % 2 ? -1 : 1;
    const radius = 20 + ((index * 13) % 32);
    const top = waterY + (index % 3 === 0 ? 54 + index * 4 : -32 - index * 3);
    let accepted;
    for (let attempt = 0; attempt < 15; attempt += 1) {
      const position = frame.position
        .clone()
        .addScaledVector(frame.right, side * (150 + attempt * 52));
      if (
        clearance.clears(
          position.x,
          position.z,
          radius * 2 + 20,
          radius * 2 + 20,
          top + 10,
          0,
          seabedY - 5,
        )
      ) {
        accepted = position;
        break;
      }
    }
    if (!accepted) continue;
    const height = top - seabedY;
    const column = new T.Mesh(
      new T.CylinderGeometry(radius * 0.54, radius, height, 5, 1),
      basaltMaterial,
    );
    column.name = `Nacre / basalt mass ${index + 1}`;
    column.position.set(accepted.x, seabedY + height / 2, accepted.z);
    column.rotation.y = index * 0.93;
    columns.add(column);
    placements.push({
      kind: 'basalt',
      x: accepted.x,
      z: accepted.z,
      radius,
      minY: seabedY,
      maxY: top,
    });
  }

  // One simple observatory silhouette anchors the opening and crown return.
  const observatory = new T.Group();
  observatory.name = 'Nacre / observatory massing placeholder';
  const start = groundFrame(track, 0);
  for (let attempt = 0; attempt < 16; attempt += 1) {
    const position = start.position
      .clone()
      .addScaledVector(start.right, 320 + attempt * 80);
    if (
      !clearance.clears(
        position.x,
        position.z,
        160,
        160,
        waterY + 215,
        0,
        seabedY,
      )
    )
      continue;
    observatory.position.set(position.x, waterY, position.z);
    const shaftHeight = waterY + 145 - seabedY;
    const shaft = new T.Mesh(
      new T.CylinderGeometry(16, 31, shaftHeight, 8),
      structureMaterial,
    );
    shaft.position.y = 145 - shaftHeight / 2;
    const crown = new T.Mesh(
      new T.CylinderGeometry(52, 34, 28, 12),
      structureMaterial,
    );
    crown.position.y = 157;
    const dome = new T.Mesh(
      new T.SphereGeometry(41, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2),
      structureMaterial,
    );
    dome.position.y = 171;
    observatory.add(shaft, crown, dome);
    group.add(observatory);
    placements.push({
      kind: 'observatory',
      x: position.x,
      z: position.z,
      radius: 80,
      minY: seabedY,
      maxY: waterY + 212,
    });
    break;
  }

  let overview = false;
  let disposed = false;
  let ownedScene;
  let previousFog;
  let previousBackground;
  const fog = new T.FogExp2(NACRE_AIR_COLOR, 0.00026);
  const background = NACRE_AIR_COLOR.clone();
  group.userData.waterY = waterY;
  group.userData.seabedY = seabedY;
  group.userData.stage = 'early-shape-review';
  group.userData.clearanceReport = {
    collisions: 0,
    sampleCount: clearance.sampleCount,
    halfWidth: clearance.halfWidth,
    placements,
  };
  group.userData.setOverview = (active) => {
    overview = Boolean(active);
    water.visible = !overview;
    seaLevelGrid.visible = overview;
    seabed.visible = !overview;
    columns.visible = !overview;
    observatory.visible = !overview;
  };
  group.userData.update = (cameraPosition, time = 0) => {
    const state = sampleNacreWater(cameraPosition.y, waterY);
    water.material.uniforms.time.value = time;
    water.material.uniforms.wetness.value = state.submerged;
    water.material.uniforms.nearSurface.value = T.MathUtils.smoothstep(
      Math.abs(cameraPosition.y - waterY),
      0.15,
      1.3,
    );
    group.userData.waterState = state;
  };
  group.userData.updateScene = (
    scene,
    cameraPosition,
    time = 0,
    settings = {},
  ) => {
    if (!ownedScene) {
      ownedScene = scene;
      previousFog = scene.fog;
      previousBackground = scene.background;
      scene.fog = fog;
      scene.background = background;
    }
    group.userData.update(cameraPosition, settings.reducedMotion ? 0 : time);
    const state = group.userData.waterState;
    background
      .copy(NACRE_AIR_COLOR)
      .lerp(NACRE_WATER_COLOR, overview ? 0 : state.submerged);
    fog.color.copy(background);
    fog.density = overview ? 0.000025 : state.fogDensity;
  };
  let triangles = 0;
  let meshes = 0;
  group.traverse((object) => {
    if (!object.isMesh) return;
    meshes += 1;
    triangles +=
      (object.geometry.index?.count ??
        object.geometry.attributes.position.count) / 3;
  });
  group.userData.metrics = {
    meshCount: meshes,
    triangleCount: triangles,
    textures: 0,
    additionalRenderPasses: 0,
    waterPasses: 1,
    reflectionPasses: 0,
    stage: 'early-shape-review',
  };
  group.userData.dispose = () => {
    if (disposed) return;
    disposed = true;
    if (ownedScene?.fog === fog) ownedScene.fog = previousFog;
    if (ownedScene?.background === background)
      ownedScene.background = previousBackground;
    const materials = new Set();
    group.traverse((object) => {
      object.geometry?.dispose();
      if (object.material) materials.add(object.material);
    });
    for (const material of materials) material.dispose();
    group.clear();
  };
  return group;
}
