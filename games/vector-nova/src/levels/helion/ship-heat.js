import * as T from 'three';
import { sampleHelionHeatFeedback } from './thermal.js';

const maximum = 48;
const vertex = `attribute float puffOpacity; attribute float puffSeed;
varying vec2 puffUv; varying float opacity; varying float seed;
void main(){puffUv=uv;opacity=puffOpacity;seed=puffSeed;
gl_Position=projectionMatrix*modelViewMatrix*instanceMatrix*vec4(position,1.);}`;
const noise = `float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float noise2(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1)),f.x),f.y);}`;
const variation = (i, salt) =>
  T.MathUtils.euclideanModulo(
    Math.sin(i * 127.1 + salt * 311.7) * 43758.5453,
    1,
  );

function plume(name, count, fire = false) {
  const geometry = new T.PlaneGeometry(1, 1);
  const opacity = new T.InstancedBufferAttribute(new Float32Array(count), 1);
  geometry.setAttribute('puffOpacity', opacity);
  geometry.setAttribute(
    'puffSeed',
    new T.InstancedBufferAttribute(
      Float32Array.from({ length: count }, (_, i) => variation(i, 7) * 31),
      1,
    ),
  );
  const material = new T.ShaderMaterial({
    name,
    transparent: true,
    depthWrite: false,
    side: T.DoubleSide,
    blending: fire ? T.AdditiveBlending : T.NormalBlending,
    uniforms: { flow: { value: 0 } },
    vertexShader: vertex,
    fragmentShader: fire
      ? `varying vec2 puffUv;varying float opacity;varying float seed;uniform float flow;${noise}
    void main(){vec2 p=puffUv;float n=noise2(vec2(p.x*7.+seed,p.y*9.-flow*3.));float width=mix(.48,.025,p.y);float flame=(1.-smoothstep(width*.35,width,abs(p.x-.5+sin(p.y*11.-flow*7.+seed)*.05)))*(1.-smoothstep(.55,1.,p.y));float a=flame*smoothstep(0.,.15,p.y)*(.5+n*.5)*opacity;if(a<.01)discard;gl_FragColor=vec4(mix(vec3(2.4,.12,.004),vec3(4.2,1.0,.09),(1.-p.y)*n),a);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>}`
      : `varying vec2 puffUv;varying float opacity;varying float seed;uniform float flow;${noise}
    void main(){vec2 p=puffUv*2.-1.;float n=noise2(p*3.+seed+vec2(flow*.23,-flow*.32));float fine=noise2(p*7.-seed);float radius=length(p*(.92+n*.23));float edge=1.-smoothstep(.38,.98,radius);float a=edge*(.52+n*.48)*opacity;if(a<.008)discard;vec3 c=mix(vec3(.10,.115,.13),vec3(.58,.54,.49),n*.7+fine*.15);gl_FragColor=vec4(c,a);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>}`,
  });
  const mesh = new T.InstancedMesh(geometry, material, count);
  mesh.name = name;
  mesh.frustumCulled = false;
  mesh.userData.aoExclude = true;
  mesh.userData.reflectionExclude = true;
  mesh.instanceMatrix.setUsage(T.DynamicDrawUsage);
  return {
    mesh,
    opacity,
    dispose() {
      geometry.dispose();
      material.dispose();
      mesh.dispose();
    },
  };
}

/** Bounded, simulation-time billows from the selected ship's actual hull.
 * No shared ship material is mutated; pause/replay/reset keep the same plume. */
export function createShipHeatEffects(telemetry) {
  const group = new T.Group();
  group.name = 'Helion / ship heat smoke and small flames';
  group.visible = false;
  const smoke = plume('Helion / trailing hot hull smoke', maximum);
  const fire = plume('Helion / small aft hull flames', 4, true);
  group.add(smoke.mesh, fire.mesh);
  const pose = new T.Object3D(),
    offset = new T.Vector3(),
    rear = new T.Vector3(),
    side = new T.Vector3();
  let disposed = false;
  return {
    group,
    update({
      ship,
      camera,
      time = 0,
      mode,
      reviewing,
      settings = {},
      state = {},
    } = {}) {
      if (disposed) return;
      const feedback = sampleHelionHeatFeedback(telemetry);
      Object.assign(telemetry, {
        heatStatus: feedback.status,
        shipSmoke: feedback.smoke,
        shipFlame: feedback.flame,
      });
      group.visible = Boolean(
        ship?.group &&
        camera &&
        !reviewing &&
        ['racing', 'paused'].includes(mode) &&
        feedback.smoke > 0.005,
      );
      if (!group.visible) return;
      ship.group.updateWorldMatrix(true, false);
      const bounds = ship.group.userData.bounds ?? {
        min: [-2.25, -0.12, -3.5],
        max: [2.25, 1.8, 3.7],
      };
      const halfWidth = (bounds.max[0] - bounds.min[0]) * 0.5;
      const y = bounds.min[1] + (bounds.max[1] - bounds.min[1]) * 0.7;
      const z = bounds.min[2] + (bounds.max[2] - bounds.min[2]) * 0.22;
      const smokeY = bounds.max[1] + 0.1;
      const clock = settings.reducedMotion ? 0 : time;
      smoke.mesh.material.uniforms.flow.value = clock;
      fire.mesh.material.uniforms.flow.value = clock;
      rear.set(0, 0, -1).transformDirection(ship.group.matrixWorld);
      side.set(1, 0, 0).transformDirection(ship.group.matrixWorld);
      smoke.mesh.count = settings.quality === 'low' ? 24 : maximum;
      for (let i = 0; i < smoke.mesh.count; i++) {
        const age = T.MathUtils.euclideanModulo(
          clock * 0.58 + i * 0.61803398875,
          1,
        );
        const sign = i % 2 ? 1 : -1;
        const growth = age ** 1.3;
        const width = 0.42 + growth * 1.75;
        offset
          .set(sign * halfWidth * 0.62, smokeY, z)
          .applyMatrix4(ship.group.matrixWorld);
        offset.addScaledVector(
          rear,
          growth * (1.4 + Math.min(4, (state.speed ?? 0) * 0.035)),
        );
        offset.addScaledVector(
          side,
          sign * growth * (0.3 + variation(i, 2) * 0.65),
        );
        offset.y += 0.12 + growth * 2.1;
        pose.position.copy(offset);
        pose.quaternion.copy(camera.quaternion);
        pose.rotateZ(variation(i, 4) * Math.PI * 2 + clock * 0.1);
        pose.scale.set(width * (0.85 + variation(i, 5) * 0.3), width, 1);
        pose.updateMatrix();
        smoke.mesh.setMatrixAt(i, pose.matrix);
        smoke.opacity.setX(
          i,
          feedback.smoke *
            (settings.quality === 'low' ? 0.9 : 0.58) *
            T.MathUtils.smoothstep(age, 0, 0.08) *
            (1 - age) ** 0.7,
        );
      }
      fire.mesh.visible = feedback.flame > 0.005;
      for (let i = 0; i < 4; i++) {
        offset
          .set(
            (i % 2 ? 1 : -1) * halfWidth * (i < 2 ? 0.6 : 0.34),
            y - 0.15,
            z + (i < 2 ? 0 : 1.1),
          )
          .applyMatrix4(ship.group.matrixWorld);
        pose.position.copy(offset);
        pose.position.y += 0.7;
        pose.quaternion.copy(camera.quaternion);
        pose.scale.set(0.65, 1.12 + feedback.flame * 0.6, 1);
        pose.updateMatrix();
        fire.mesh.setMatrixAt(i, pose.matrix);
        fire.opacity.setX(i, feedback.flame * 0.8);
      }
      for (const part of [smoke, fire]) {
        part.mesh.instanceMatrix.needsUpdate = true;
        part.opacity.needsUpdate = true;
      }
    },
    reset() {
      group.visible = false;
      Object.assign(telemetry, { heatStatus: '', shipSmoke: 0, shipFlame: 0 });
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      group.removeFromParent();
      smoke.dispose();
      fire.dispose();
      group.clear();
    },
  };
}

export function withShipHeatEffects(environment, telemetry) {
  const effects = createShipHeatEffects(telemetry);
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
