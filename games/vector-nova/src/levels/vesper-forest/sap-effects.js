import * as T from 'three';
import { createSapHullFilm } from './sap-hull-film.js';
import { createSapAnchorCache } from './sap-anchors.js';
import { replaceShader } from '../../renderer/shader-patch.js';

const maximum = 12;
const fraction = (value) => T.MathUtils.euclideanModulo(value, 1);
const UP = new T.Vector3(0, 1, 0);

function createCollectingPool() {
  const geometry = new T.PlaneGeometry(1, 1, 16, 20).rotateX(-Math.PI / 2);
  const material = new T.ShaderMaterial({
    name: 'Vesper sap / colored viscous resin meniscus',
    uniforms: {
      resinRight: { value: new T.Vector3(1, 0, 0) },
      resinForward: { value: new T.Vector3(0, 0, 1) },
    },
    transparent: true,
    depthWrite: false,
    side: T.DoubleSide,
    forceSinglePass: true,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
    vertexShader: `
      varying vec2 poolUv;
      varying vec3 poolWorld,poolUp;
      void main(){
        poolUv=uv;
        vec4 world=modelMatrix*vec4(position,1.);
        poolWorld=world.xyz;
        poolUp=normalize(mat3(modelMatrix)*normal);
        gl_Position=projectionMatrix*viewMatrix*world;
      }`,
    fragmentShader: `
      uniform vec3 resinRight,resinForward;
      varying vec2 poolUv;
      varying vec3 poolWorld,poolUp;
      void main(){
        vec2 p=poolUv*2.-1.;
        float angle=atan(p.y,p.x);
        float radius=length(p);
        float edge=.86+.065*sin(angle*5.+.4)+.045*sin(angle*9.-1.2);
        float coverage=1.-smoothstep(edge-.105,edge,radius);
        if(coverage<.025)discard;
        float edgeBody=smoothstep(.12,edge-.025,radius);
        vec3 body=mix(vec3(.032,.0045,.0008),vec3(.245,.055,.006),edgeBody*.68);
        float meniscus=exp(-pow((radius-(edge-.065))/.065,2.));
        vec3 normal=normalize(poolUp+(resinRight*p.x+resinForward*p.y)*meniscus*.22);
        vec3 view=normalize(cameraPosition-poolWorld);
        vec3 halfway=normalize(view+normalize(vec3(-.62,.55,-.48)));
        float sheen=pow(max(dot(normal,halfway),0.),48.);
        body+=vec3(.10,.032,.005)*meniscus*.36;
        body+=vec3(.09,.044,.012)*sheen;
        gl_FragColor=vec4(body,coverage*.94);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const mesh = new T.Mesh(geometry, material);
  mesh.name = 'Vesper sap / road-following collecting puddle';
  mesh.userData.aoExclude = mesh.userData.reflectionExclude = true;
  mesh.frustumCulled = false;
  return mesh;
}

/** Grounded contact only: a heavy wet coat, pendant drips and a small collecting pool. */
export function createVesperSapEffects({ track } = {}) {
  const group = new T.Group();
  group.name = 'Vesper / viscous dark amber sap contact';
  group.visible = false;
  const material = new T.MeshPhysicalMaterial({
    name: 'Vesper / heavy dark-orange resin',
    color: 0x923907,
    emissive: 0x190601,
    emissiveIntensity: 0.06,
    roughness: 0.2,
    metalness: 0,
    clearcoat: 0.2,
    envMapIntensity: 0.12,
    clearcoatRoughness: 0.24,
  });
  const strandProfile = new T.SplineCurve([
    new T.Vector2(0.24, 0.5),
    new T.Vector2(0.17, 0.39),
    new T.Vector2(0.105, 0.11),
    new T.Vector2(0.085, -0.16),
    new T.Vector2(0.13, -0.39),
    new T.Vector2(0.32, -0.5),
  ]).getPoints(18);
  const strandGeometry = new T.LatheGeometry(strandProfile, 10);
  const bends = new T.InstancedBufferAttribute(
    new Float32Array(maximum * 2),
    2,
  );
  const reaches = new T.InstancedBufferAttribute(new Float32Array(maximum), 1);
  const pinches = new T.InstancedBufferAttribute(new Float32Array(maximum), 1);
  strandGeometry.setAttribute('sapBend', bends);
  strandGeometry.setAttribute('sapReach', reaches);
  strandGeometry.setAttribute('sapPinch', pinches);
  const strandMaterial = material.clone();
  strandMaterial.name = 'Vesper sap / curved stretching resin necks';
  strandMaterial.onBeforeCompile = (shader) => {
    shader.vertexShader =
      `attribute vec2 sapBend; attribute float sapReach,sapPinch;\n` +
      replaceShader(
        shader.vertexShader,
        '#include <begin_vertex>',
        `
        #include <begin_vertex>
        float resinAlong=clamp(.5-position.y,0.,1.);
        float resinWave=sin(resinAlong*3.14159265);
        float resinThin=1.-sapPinch*.87*pow(resinWave,4.);
        float resinFoot=mix(.34,1.,smoothstep(.86,.99,sapReach));
        float resinTip=mix(1.,resinFoot,smoothstep(.72,1.,resinAlong));
        transformed.xz*=resinThin*resinTip;
        transformed.x+=sapBend.x*resinWave;
        transformed.z+=sapBend.y*resinWave;
        transformed.y=.5-resinAlong*sapReach;
      `,
      );
  };
  strandMaterial.customProgramCacheKey = () => 'vesper-elastic-resin-necks-v1';
  const dropGeometry = new T.LatheGeometry(
    [
      new T.Vector2(0, 0.65),
      new T.Vector2(0.1, 0.36),
      new T.Vector2(0.25, -0.12),
      new T.Vector2(0.18, -0.4),
      new T.Vector2(0, -0.52),
    ],
    8,
  );
  const strands = new T.InstancedMesh(strandGeometry, strandMaterial, maximum);
  strands.name = 'Vesper sap / attached downward rivulets';
  const droplets = new T.InstancedMesh(dropGeometry, material, maximum);
  droplets.name = 'Vesper sap / pendant falling drips';
  for (const mesh of [strands, droplets]) {
    mesh.frustumCulled = false;
    mesh.instanceMatrix.setUsage(T.DynamicDrawUsage);
    mesh.userData.aoExclude = mesh.userData.reflectionExclude = true;
  }
  const pool = createCollectingPool();
  group.add(pool, strands, droplets);
  const film = createSapHullFilm();
  const anchorCache = createSapAnchorCache();
  const pose = new T.Object3D();
  const origin = new T.Vector3(),
    roadPoint = new T.Vector3();
  const rear = new T.Vector3(),
    sideways = new T.Vector3();
  const positions = pool.geometry.attributes.position;
  const uvs = pool.geometry.attributes.uv;
  const normals = pool.geometry.attributes.normal;
  let disposed = false;
  return {
    group,
    update({
      ship,
      motion,
      state = {},
      settings = {},
      time = 0,
      mode,
      reviewing,
    } = {}) {
      if (disposed) return;
      const local = motion?.motion ?? motion;
      const contact = Boolean(
        ship?.group &&
        !reviewing &&
        ['racing', 'paused'].includes(mode) &&
        local?.mode === 'magnetic' &&
        local.surface?.id === 'sap',
      );
      const bounds = ship?.group.userData.bounds ?? {
        min: [-2.25, -0.12, -3.5],
        max: [2.25, 1.8, 3.7],
      };
      const clock = settings.reducedMotion ? 0 : time;
      // Warm the one-time hull queries during title/countdown, before sap contact.
      const anchors = anchorCache.read(ship?.group, bounds);
      film.update(ship?.group, contact, bounds, clock);
      group.visible = contact;
      if (!contact) return;
      ship.group.updateWorldMatrix(true, false);
      const halfWidth = (bounds.max[0] - bounds.min[0]) * 0.5;
      const hullLength = bounds.max[2] - bounds.min[2];
      const center = track?.sample(state.distance ?? 0);
      const surface = track?.sampleSurface?.(
        state.distance ?? 0,
        state.lateral ?? 0,
      );
      const road = surface ?? center;
      const up = road?.up ?? UP;
      if (road)
        roadPoint
          .copy(road.position)
          .addScaledVector(road.right, surface ? 0 : (state.lateral ?? 0));
      else
        roadPoint
          .setFromMatrixPosition(ship.group.matrixWorld)
          .addScaledVector(up, -1.6);
      pool.material.uniforms.resinRight.value.copy(
        road?.right ?? new T.Vector3(1, 0, 0),
      );
      pool.material.uniforms.resinForward.value.copy(
        road?.tangent ?? new T.Vector3(0, 0, 1),
      );
      const rowFrames = new Map();
      for (let i = 0; i < positions.count; i++) {
        const x = (uvs.getX(i) - 0.5) * halfWidth * 2.75;
        const along = (uvs.getY(i) - 0.5) * hullLength * 1.16;
        if (track && !rowFrames.has(along))
          rowFrames.set(along, track.sample((state.distance ?? 0) + along));
        const frame = rowFrames.get(along);
        const poolLateral = T.MathUtils.clamp(
          (state.lateral ?? 0) + x,
          -(track?.width ?? 28) * 0.5 + 0.16,
          (track?.width ?? 28) * 0.5 - 0.16,
        );
        const radial = Math.hypot(uvs.getX(i) * 2 - 1, uvs.getY(i) * 2 - 1);
        const meniscus =
          0.075 + 0.055 * Math.exp(-(((radial - 0.76) / 0.14) ** 2));
        if (frame)
          origin
            .copy(frame.position)
            .addScaledVector(frame.right, poolLateral)
            .addScaledVector(frame.up, meniscus);
        else
          origin
            .copy(roadPoint)
            .addScaledVector(
              new T.Vector3(1, 0, 0).transformDirection(ship.group.matrixWorld),
              x,
            )
            .addScaledVector(
              new T.Vector3(0, 0, 1).transformDirection(ship.group.matrixWorld),
              along,
            )
            .addScaledVector(up, meniscus);
        positions.setXYZ(i, origin.x, origin.y, origin.z);
        normals.setXYZ(
          i,
          frame?.up.x ?? up.x,
          frame?.up.y ?? up.y,
          frame?.up.z ?? up.z,
        );
      }
      positions.needsUpdate = normals.needsUpdate = true;
      const total = Math.min(
        anchors.length,
        settings.quality === 'low' ? 6 : maximum,
      );
      strands.count = total;
      droplets.count = total;
      rear.set(0, 0, -1).transformDirection(ship.group.matrixWorld);
      sideways.set(1, 0, 0).transformDirection(ship.group.matrixWorld);
      for (let i = 0; i < total; i++) {
        const age = fraction(clock / 1.6 + i * 0.2718281828);
        const seed = fraction(Math.sin(i * 127.1 + 73.7) * 43758.5453);
        origin.copy(anchors[i]).applyMatrix4(ship.group.matrixWorld);
        const delta = origin.clone().sub(roadPoint);
        const along = road?.tangent ? delta.dot(road.tangent) : 0;
        const localRoad = track?.sample((state.distance ?? 0) + along) ?? road;
        const localUp = localRoad?.up ?? up;
        const plane = localRoad
          ? localRoad.position
              .clone()
              .addScaledVector(
                localRoad.right,
                (state.lateral ?? 0) +
                  (road?.right ? delta.dot(road.right) : 0),
              )
          : roadPoint;
        // Stop each gravity-down strand at its own local road plane; its flared
        // foot overlaps the shallow resin meniscus instead of hovering beside it.
        const clearance = Math.max(
          0.12,
          (origin.clone().sub(plane).dot(localUp) - 0.1) /
            Math.max(0.35, localUp.y),
        );
        pose.position.copy(origin);
        pose.position.y -= clearance * 0.5;
        pose.quaternion.identity();
        const fullness = (0.88 + seed * 0.24) * 1.25;
        // Two contacts always retain the adhesive read. The other necks grow,
        // stretch thin, release a tear and retract rather than remaining stilts.
        const held = i < 2;
        const grow = T.MathUtils.smoothstep(age, 0, 0.36);
        const retract = T.MathUtils.smoothstep(age, 0.71, 0.9);
        const reach = held ? 1 : 0.16 + 0.84 * grow * (1 - retract);
        const pinch = held
          ? 0.2 + 0.18 * Math.sin(age * Math.PI) ** 2
          : T.MathUtils.smoothstep(age, 0.48, 0.71) *
            (1 - T.MathUtils.smoothstep(age, 0.73, 0.86));
        const curve =
          (0.14 + seed * 0.13) *
          (0.72 + Math.sin(age * Math.PI) * 0.28) *
          reach;
        const lean = rear
          .clone()
          .multiplyScalar(curve)
          .addScaledVector(
            sideways,
            (anchors[i].x < 0 ? -1 : 1) * curve * 0.24,
          );
        bends.setXY(i, lean.x / fullness, lean.z / fullness);
        reaches.setX(i, reach);
        pinches.setX(i, pinch);
        pose.scale.set(fullness, clearance, fullness);
        pose.updateMatrix();
        strands.setMatrixAt(i, pose.matrix);
        if (i < droplets.count) {
          const releasing = !held && age > 0.67;
          const fall = T.MathUtils.clamp((age - 0.67) / 0.27, 0, 1);
          const dropAlong = releasing
            ? 0.48 + 0.48 * fall * fall
            : reach * (0.35 + age * 0.45);
          pose.position.copy(origin);
          pose.position.y -= clearance * dropAlong;
          if (!releasing)
            pose.position.addScaledVector(lean, Math.sin(dropAlong * Math.PI));
          else {
            const releaseCurve =
              (0.14 + seed * 0.13) * (0.72 + Math.sin(0.67 * Math.PI) * 0.28);
            pose.position.addScaledVector(
              rear,
              releaseCurve * Math.sin(0.48 * Math.PI),
            );
            pose.position.addScaledVector(
              sideways,
              (anchors[i].x < 0 ? -1 : 1) *
                releaseCurve *
                0.24 *
                Math.sin(0.48 * Math.PI),
            );
          }
          const bead =
            (releasing
              ? 0.2 * (1 - fall * 0.72)
              : 0.2 + Math.sin(age * Math.PI) * 0.08) * 1.25;
          pose.scale.set(bead, bead * 0.9, bead);
          pose.updateMatrix();
          droplets.setMatrixAt(i, pose.matrix);
        }
      }
      strands.instanceMatrix.needsUpdate =
        droplets.instanceMatrix.needsUpdate = true;
      bends.needsUpdate = reaches.needsUpdate = pinches.needsUpdate = true;
    },
    reset() {
      group.visible = false;
      film.reset();
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      film.dispose();
      group.removeFromParent();
      strands.dispose();
      droplets.dispose();
      strandGeometry.dispose();
      dropGeometry.dispose();
      strandMaterial.dispose();
      material.dispose();
      pool.geometry.dispose();
      pool.material.dispose();
      group.clear();
    },
  };
}

export function withVesperSapEffects(environment, options) {
  const effects = createVesperSapEffects(options);
  environment.group.add(effects.group);
  let disposed = false;
  return {
    ...environment,
    update(frame) {
      if (disposed) return;
      environment.update?.(frame);
      effects.update(frame);
    },
    reset(frame) {
      if (disposed) return;
      environment.reset?.(frame);
      effects.reset();
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      effects.dispose();
      environment.dispose();
    },
  };
}
