import * as T from 'three';
import {
  COMPLETION_FIRES,
  COMPLETION_JUMP_START,
  COMPLETION_JUMP_END,
  COMPLETION_SLIDE_START,
  COMPLETION_SLIDE_END,
  sampleCompletionTimeline,
} from './completion-timeline.js';
import { completionPose } from './completion-course.js';

// These are presentation effects only. Every ground trace is sampled once from
// the real course and stays fixed there as the craft and camera move away.
export function createCompletionEffects({ scene, track }) {
  const group = new T.Group();
  group.name = 'Career finale / weapons and braking';
  group.userData.aoExclude = true;
  group.userData.reflectionExclude = true;
  scene.add(group);
  const resources = new Set();
  const own = (value) => {
    resources.add(value);
    return value;
  };
  const material = (color, opacity = 1) =>
    own(
      new T.MeshBasicMaterial({
        color,
        transparent: true,
        opacity,
        depthWrite: false,
        toneMapped: false,
        blending: T.AdditiveBlending,
      }),
    );
  const cylinder = own(new T.CylinderGeometry(1, 1, 1, 8, 1, true));
  const beamOuter = material('#9e79ff', 0.5);
  const beamInner = material('#eee7ff', 0.9);
  const beams = [-1, 1].map((side) => {
    const outer = new T.Mesh(cylinder, beamOuter),
      inner = new T.Mesh(cylinder, beamInner);
    group.add(outer, inner);
    return { side, outer, inner };
  });
  const torus = own(new T.TorusGeometry(1, 0.026, 6, 48));
  const hitMaterial = material('#c2a1ff', 0);
  const hitRings = [0, 1].map(() => {
    const ring = new T.Mesh(torus, hitMaterial);
    group.add(ring);
    return ring;
  });
  const sparkGeometry = own(new T.BoxGeometry(0.05, 0.05, 0.7));
  const sparkMaterial = material('#ffdfa0', 0.8);
  const sparks = Array.from({ length: 12 }, () => {
    const spark = new T.Mesh(sparkGeometry, sparkMaterial);
    group.add(spark);
    return spark;
  });
  const jumpMaterial = material('#86dfff', 0);
  const jumpRing = new T.Mesh(torus, jumpMaterial);
  group.add(jumpRing);
  const flatRing = new T.Quaternion().setFromAxisAngle(
    new T.Vector3(1, 0, 0),
    -Math.PI / 2,
  );

  const tracePositions = [],
    traceIndices = [];
  const traceSteps = 100;
  for (const side of [-1, 1]) {
    const offset = tracePositions.length / 3;
    for (let i = 0; i <= traceSteps; i++) {
      const time = T.MathUtils.lerp(
        COMPLETION_SLIDE_START,
        COMPLETION_SLIDE_END,
        i / traceSteps,
      );
      const hero = sampleCompletionTimeline(time).hero;
      const pose = completionPose(track, {
        ...hero,
        y: 0.07,
        pitch: 0,
        roll: 0,
      });
      for (const width of [-0.055, 0.055]) {
        const point = new T.Vector3(side * 1.35 + width, 0, -1.6)
          .applyQuaternion(pose.quaternion)
          .add(pose.position);
        tracePositions.push(point.x, point.y, point.z);
      }
      if (i < traceSteps) {
        const a = offset + i * 2;
        traceIndices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
      }
    }
  }
  const traceGeometry = own(new T.BufferGeometry());
  traceGeometry.setAttribute(
    'position',
    new T.Float32BufferAttribute(tracePositions, 3),
  );
  traceGeometry.setIndex(traceIndices);
  // Two strips share one mesh; each range is revealed without rewriting its
  // positions. Age lives in a vertex attribute, not a moving texture window.
  const born = [];
  for (let side = 0; side < 2; side++)
    for (let i = 0; i <= traceSteps; i++)
      born.push(
        COMPLETION_SLIDE_START +
          (i / traceSteps) * (COMPLETION_SLIDE_END - COMPLETION_SLIDE_START),
        COMPLETION_SLIDE_START +
          (i / traceSteps) * (COMPLETION_SLIDE_END - COMPLETION_SLIDE_START),
      );
  traceGeometry.setAttribute('born', new T.Float32BufferAttribute(born, 1));
  const traceTime = { value: 0 };
  const traceMaterial = own(
    new T.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      side: T.DoubleSide,
      blending: T.AdditiveBlending,
      toneMapped: false,
      uniforms: { time: traceTime },
      vertexShader:
        'attribute float born;varying float vBorn;void main(){vBorn=born;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
      fragmentShader:
        'uniform float time;varying float vBorn;void main(){float age=time-vBorn;if(age<0.||age>1.25)discard;float fade=pow(max(0.,1.-age/1.25),2.);gl_FragColor=vec4(.38,.72,1.,fade*.34);}',
    }),
  );
  const traces = new T.Mesh(traceGeometry, traceMaterial);
  traces.name = 'Career finale / fixed road skid traces';
  traces.frustumCulled = false;
  group.add(traces);

  const hazePositions = new Float32Array(24 * 3),
    intensities = new Float32Array(24);
  const hazeGeometry = own(new T.BufferGeometry());
  hazeGeometry.setAttribute(
    'position',
    new T.BufferAttribute(hazePositions, 3),
  );
  hazeGeometry.setAttribute('intensity', new T.BufferAttribute(intensities, 1));
  const hazeMaterial = own(
    new T.PointsMaterial({
      color: '#c1d4dc',
      size: 1.35,
      transparent: true,
      opacity: 0.2,
      depthWrite: false,
      toneMapped: false,
    }),
  );
  hazeMaterial.onBeforeCompile = (shader) => {
    shader.vertexShader =
      'attribute float intensity;varying float vIntensity;\n' +
      shader.vertexShader.replace(
        '#include <begin_vertex>',
        '#include <begin_vertex>\nvIntensity=intensity;',
      );
    shader.fragmentShader =
      'varying float vIntensity;\n' +
      shader.fragmentShader.replace(
        '#include <opaque_fragment>',
        'float r=length(gl_PointCoord-.5)*2.;diffuseColor.a*=vIntensity*pow(max(0.,1.-r*r),2.);\n#include <opaque_fragment>',
      );
  };
  hazeMaterial.customProgramCacheKey = () => 'completion-brake-haze-v1';
  const haze = new T.Points(hazeGeometry, hazeMaterial);
  haze.name = 'Career finale / braking haze';
  haze.frustumCulled = false;
  group.add(haze);
  const start = new T.Vector3(),
    end = new T.Vector3(),
    direction = new T.Vector3();
  const up = new T.Vector3(0, 1, 0),
    local = new T.Vector3(),
    rotation = new T.Quaternion();
  const hitPoint = new T.Vector3();
  let disposed = false;

  function pointOnCraft(model, x, y, z, target) {
    return target
      .set(x, y, z)
      .applyQuaternion(model.group.quaternion)
      .add(model.group.position);
  }
  return {
    update(sample, { models, reducedMotion = false }) {
      if (disposed) return;
      group.visible = !reducedMotion;
      if (reducedMotion) return;
      const hero = models.get('hero');
      const fireIndex = COMPLETION_FIRES.findIndex(
        (fire) => sample.time >= fire && sample.time < fire + 0.23,
      );
      const target = models.get(fireIndex === 3 ? 'rook' : 'manta');
      for (const beam of beams) {
        const visible = fireIndex >= 0 && !!hero && !!target;
        beam.outer.visible = beam.inner.visible = visible;
        if (!visible) continue;
        pointOnCraft(
          hero,
          beam.side * 0.7,
          0.55,
          hero.group.userData.bounds?.max?.[2] ?? 3,
          start,
        );
        pointOnCraft(
          target,
          beam.side * 0.35,
          0.55,
          (target.group.userData.bounds?.min?.[2] ?? -3) + 0.7,
          end,
        );
        direction.subVectors(end, start);
        const length = direction.length();
        direction.normalize();
        for (const [mesh, radius] of [
          [beam.outer, 0.08],
          [beam.inner, 0.022],
        ]) {
          mesh.position.copy(start).addScaledVector(direction, length * 0.5);
          mesh.quaternion.setFromUnitVectors(up, direction);
          mesh.scale.set(radius, length, radius);
        }
      }
      const hitIndex = COMPLETION_FIRES.findIndex(
        (fire) => sample.time >= fire + 0.16 && sample.time < fire + 0.7,
      );
      const hitTarget = models.get(hitIndex === 3 ? 'rook' : 'manta');
      const hitAge =
        hitIndex >= 0
          ? (sample.time - COMPLETION_FIRES[hitIndex] - 0.16) / 0.54
          : 0;
      if (hitTarget) pointOnCraft(hitTarget, 0, 0.55, -2.3, hitPoint);
      hitMaterial.opacity = (1 - hitAge) * 0.65;
      for (const [i, ring] of hitRings.entries()) {
        ring.visible = hitIndex >= 0 && !!hitTarget;
        if (!ring.visible) continue;
        ring.position.copy(hitPoint);
        rotation.setFromEuler(
          new T.Euler(hitAge * 2 + i * 1.2, hitAge + i * 0.8, hitAge),
        );
        ring.quaternion.copy(hitTarget.group.quaternion).multiply(rotation);
        ring.scale.setScalar(1.1 + hitAge * 2 + i * 0.4);
      }
      for (const [i, spark] of sparks.entries()) {
        spark.visible = hitIndex >= 0 && !!hitTarget;
        if (!spark.visible) continue;
        const angle = i * 2.4;
        local.set(
          Math.cos(angle) * hitAge * 5,
          0.2 + Math.sin(i * 4.1) * hitAge * 2 - hitAge * hitAge,
          -hitAge * (2 + (i % 4)),
        );
        spark.position
          .copy(local.applyQuaternion(hitTarget.group.quaternion))
          .add(hitPoint);
        rotation.setFromEuler(new T.Euler(angle, angle * 2, angle));
        spark.quaternion.copy(hitTarget.group.quaternion).multiply(rotation);
        spark.scale.set(1, 1, 0.4 + (1 - hitAge) * 0.8);
      }
      const burst = [COMPLETION_JUMP_START, COMPLETION_JUMP_END].find(
        (time) => sample.time >= time && sample.time < time + 0.7,
      );
      jumpRing.visible = burst !== undefined;
      if (jumpRing.visible) {
        const age = (sample.time - burst) / 0.7;
        const ground = completionPose(track, {
          ...sampleCompletionTimeline(burst).hero,
          y: 0.1,
          pitch: 0,
          yaw: 0,
          roll: 0,
        });
        jumpRing.position.copy(ground.position);
        jumpRing.quaternion.copy(ground.quaternion).multiply(flatRing);
        jumpRing.scale.setScalar(1.4 + age * 6);
        jumpMaterial.opacity = (1 - age) * 0.5;
      }
      traceTime.value = sample.time;
      traces.visible =
        sample.time >= COMPLETION_SLIDE_START &&
        sample.time < COMPLETION_SLIDE_END + 1.25;
      haze.visible =
        sample.time >= COMPLETION_SLIDE_START &&
        sample.time < COMPLETION_SLIDE_END + 1;
      if (haze.visible) {
        for (let i = 0; i < intensities.length; i++) {
          const age = (i / intensities.length) * 0.9;
          const emitted = sample.time - age;
          const valid =
            emitted >= COMPLETION_SLIDE_START &&
            emitted <= COMPLETION_SLIDE_END;
          const pose = completionPose(track, {
            ...sampleCompletionTimeline(
              Math.max(COMPLETION_SLIDE_START, emitted),
            ).hero,
            y: 0.18 + age * 0.45,
            pitch: 0,
            roll: 0,
          });
          local
            .set((i % 2 ? 1 : -1) * (1.2 + age * 0.5), 0, -2.4 - age * 1.8)
            .applyQuaternion(pose.quaternion)
            .add(pose.position);
          hazePositions.set(local.toArray(), i * 3);
          intensities[i] = valid
            ? (1 - age) *
              (1 - Math.max(0, emitted - (COMPLETION_SLIDE_END - 0.9)) / 0.9)
            : 0;
        }
        hazeGeometry.attributes.position.needsUpdate = true;
        hazeGeometry.attributes.intensity.needsUpdate = true;
      }
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      group.removeFromParent();
      for (const resource of resources) resource.dispose();
      resources.clear();
    },
  };
}
