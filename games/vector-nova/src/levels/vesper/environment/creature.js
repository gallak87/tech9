import * as T from 'three';
import { seededRandom } from './geometry.js';

/** Cosmetic canopy event. A pure simulation-time pose makes replay/reset exact. */
export function sampleCanopyWalker(time = 0, reducedMotion = false) {
  const t = reducedMotion ? 0 : Math.max(0, Number.isFinite(time) ? time : 0);
  return {
    stride: t * 0.29,
    advance: 24 * Math.sin(t * 0.043),
    rise: Math.sin(t * 0.58) * 1.2,
    head: Math.sin(t * 0.12) * 0.075,
    bend: Math.sin(t * 0.15 - 0.6) * 0.065,
    time: t,
  };
}

export function createCanopyWalker(template, track, group, bentTrees = []) {
  const walker = template.clone(true);
  walker.name = 'Vesper / articulated nocturnal canopy walker';
  const f = track.sample(track.landmarks.creature.s);
  const base = f.position.clone();
  base.y -= 54;
  const crossing = f.right.clone().setY(0).normalize();
  const yaw = Math.atan2(crossing.x, crossing.z);
  walker.position.copy(base);
  walker.rotation.y = yaw;
  walker.traverse((object) => {
    if (object.isMesh) {
      object.castShadow = true;
      object.receiveShadow = true;
    }
  });
  group.add(walker);
  const joints = [];
  const crossingRoad = [];
  for (
    let s = track.landmarks.creature.s - 420;
    s <= track.landmarks.creature.s + 420;
    s += 8
  )
    crossingRoad.push(track.sample(s).position);
  walker.traverse((object) => {
    const match = object.name.match(/^walker_shoulder_(-?1)_(\d)$/);
    if (!match) return;
    const side = Number(match[1]),
      leg = Number(match[2]);
    const knee = walker.getObjectByName(`walker_knee_${side}_${leg}`);
    const upper = knee.position.clone();
    const lower = new T.Vector3(side * 22, -58, leg === 1 ? -16 : 16);
    joints.push({
      object,
      knee,
      upper,
      lower,
      side,
      leg,
      rest: object.quaternion.clone(),
      kneeRest: knee.quaternion.clone(),
    });
  });
  const neck = walker.getObjectByName('walker_neck');
  const head = walker.getObjectByName('walker_head');
  const neckRest = neck?.quaternion.clone();
  const headRest = head?.quaternion.clone();
  const random = seededRandom(22517);
  const points = new Float32Array(320 * 3);
  const seeds = new Float32Array(320);
  for (let i = 0; i < 320; i++) {
    points.set(
      [(random() - 0.5) * 150, random() * 120, (random() - 0.5) * 190],
      i * 3,
    );
    seeds[i] = random();
  }
  const geometry = new T.BufferGeometry();
  geometry.setAttribute('position', new T.BufferAttribute(points, 3));
  geometry.setAttribute('seed', new T.BufferAttribute(seeds, 1));
  const material = new T.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: { time: { value: 0 } },
    vertexShader: `attribute float seed; uniform float time; varying float hue;
      void main(){ vec3 p=position; float age=mod(time*.08+seed,1.); p.y=95.-age*135.; p.x+=sin(age*8.+seed*11.)*7.; p.z+=cos(age*7.+seed*13.)*5.; vec4 v=modelViewMatrix*vec4(p,1.); gl_Position=projectionMatrix*v; gl_PointSize=clamp((seed<.28?550.:160.)/max(1.,-v.z),1.,10.); hue=seed; }`,
    fragmentShader: `varying float hue; void main(){ vec2 p=(gl_PointCoord-.5)*2.; float r=length(p*vec2(hue<.28?1.7:1.,1.)); float a=1.-smoothstep(.35,1.,r); if(a<.02) discard; gl_FragColor=vec4(mix(vec3(.15,.6,.54),vec3(1.,.58,.17),step(.72,hue)),a*.7);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }`,
  });
  const particles = new T.Points(geometry, material);
  particles.name = 'Vesper / leaves and spores shed by passing canopy walker';
  particles.position.copy(f.position).add(new T.Vector3(0, 30, 0));
  particles.rotation.y = yaw;
  particles.frustumCulled = false;
  group.add(particles);
  const reflectionLight = new T.PointLight('#ffc373', 5500, 160, 2);
  reflectionLight.position.copy(f.position).add(new T.Vector3(0, 22, 0));
  group.add(reflectionLight);
  const axis = new T.Vector3(1, 0, 0);
  const turn = new T.Quaternion();
  return {
    walker,
    update({ time = 0, settings = {}, state = {} } = {}) {
      const pose = sampleCanopyWalker(time, settings.reducedMotion);
      const distance = Number.isFinite(state.distance) ? state.distance : 0;
      const progress = T.MathUtils.clamp(
        (distance - track.landmarks.creature.s + 300) / 600,
        0,
        1,
      );
      const ease = progress * progress * (3 - 2 * progress);
      const cross = settings.reducedMotion ? 0 : -195 + ease * 390;
      walker.position.copy(base).addScaledVector(crossing, cross);
      walker.position.y += pose.rise;
      for (const {
        object,
        knee,
        upper,
        lower,
        side,
        leg,
        rest,
        kneeRest,
      } of joints) {
        const phase =
          pose.stride +
          progress * Math.PI * 4 +
          leg * 2.09 +
          (side < 0 ? Math.PI : 0);
        const foot = upper.clone().add(lower);
        // Two-link IK lifts each actual foot over the magnetic deck as it crosses.
        // The amber deck never passes through a straight scenery leg.
        const footWorld = foot
          .clone()
          .add(object.position)
          .applyAxisAngle(new T.Vector3(0, 1, 0), yaw)
          .add(walker.position);
        let roadDistance = Infinity;
        for (const road of crossingRoad)
          roadDistance = Math.min(
            roadDistance,
            Math.hypot(footWorld.x - road.x, footWorld.z - road.z),
          );
        const liftEnvelope = 1 - T.MathUtils.smoothstep(roadDistance, 68, 125);
        foot.y +=
          liftEnvelope * 110 +
          (settings.reducedMotion ? 0 : Math.max(0, Math.sin(phase)) * 12);
        foot.z += settings.reducedMotion ? 0 : Math.sin(phase) * 7;
        const l1 = upper.length(),
          l2 = lower.length();
        const distanceToFoot = T.MathUtils.clamp(
          foot.length(),
          5,
          l1 + l2 - 0.2,
        );
        const direction = foot.clone().normalize();
        foot.copy(direction).multiplyScalar(distanceToFoot);
        const along =
          (l1 * l1 - l2 * l2 + distanceToFoot * distanceToFoot) /
          (2 * distanceToFoot);
        const pole = new T.Vector3(
          side * 0.7,
          liftEnvelope * 1.2,
          leg === 1 ? -0.4 : 0.4,
        );
        const bend = pole
          .clone()
          .addScaledVector(direction, -pole.dot(direction))
          .normalize();
        const targetKnee = direction
          .clone()
          .multiplyScalar(along)
          .addScaledVector(
            bend,
            Math.sqrt(Math.max(0, l1 * l1 - along * along)),
          );
        const upperRotation = new T.Quaternion().setFromUnitVectors(
          upper.clone().normalize(),
          targetKnee.clone().normalize(),
        );
        object.quaternion.copy(rest).multiply(upperRotation);
        const lowerTarget = foot
          .clone()
          .sub(targetKnee)
          .applyQuaternion(upperRotation.clone().invert())
          .normalize();
        knee.quaternion
          .copy(kneeRest)
          .multiply(
            new T.Quaternion().setFromUnitVectors(
              lower.clone().normalize(),
              lowerTarget,
            ),
          );
      }
      if (neck)
        neck.quaternion
          .copy(neckRest)
          .multiply(turn.setFromAxisAngle(new T.Vector3(0, 1, 0), pose.head));
      if (head)
        head.quaternion
          .copy(headRest)
          .multiply(turn.setFromAxisAngle(axis, -pose.head * 0.7));
      for (let i = 0; i < bentTrees.length; i++) {
        const encounterBend =
          Math.sin(
            T.MathUtils.clamp((progress - i * 0.09) * 3, 0, 1) * Math.PI,
          ) * 0.095;
        bentTrees[i].rotation.z = settings.reducedMotion
          ? 0
          : encounterBend + pose.bend * 0.2;
      }
      particles.visible =
        !settings.reducedMotion && progress > 0.08 && progress < 0.95;
      geometry.setDrawRange(0, settings.quality === 'low' ? 80 : 320);
      material.uniforms.time.value = pose.time;
    },
  };
}
