import * as T from 'three';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { tidalResponse, airborneGravity } from './track/forces.js';

// Project the actual authored acceleration through the current transported camera.
// No force, ship transform, camera pose or replay state is changed here.
export function sampleUmbraLens(track, frame, width, height) {
  const { state, ship, camera, mode, reviewing, motion } = frame;
  const hidden = { active: false, intensity: 0 };
  if (reviewing || !['racing', 'paused'].includes(mode) || !ship?.group)
    return hidden;
  const movement = motion?.motion ?? motion;
  if (movement?.mode === 'recovery') return hidden;
  const road = track.sample(state.distance);
  const tide = tidalResponse(track, state.distance, state.lateral);
  const force = road.right.clone().multiplyScalar(tide.lateralAcceleration);
  let source = tide.zone;
  let magnitude = Math.abs(tide.lateralAcceleration) / 5;
  if (movement?.mode === 'flight') {
    const jump = track.jumps.find((entry) => entry.id === movement.flight?.id);
    if (!jump) return hidden;
    force.copy(airborneGravity({ jump, position: ship.group.position }));
    magnitude = force.length() / 30;
    source = jump.id;
  }
  if (force.lengthSq() < 0.0001) return hidden;
  camera.updateMatrixWorld();
  ship.group.updateWorldMatrix(true, false);
  const local = ship.group.userData.bounds;
  if (!local) return hidden;
  const minimum = new T.Vector3(...local.min);
  const maximum = new T.Vector3(...local.max);
  const centerWorld = minimum
    .clone()
    .add(maximum)
    .multiplyScalar(0.5)
    .applyMatrix4(ship.group.matrixWorld);
  const center = centerWorld.clone().project(camera);
  if (center.z < -1 || center.z > 1) return hidden;
  const toward = centerWorld
    .clone()
    .add(force.clone().normalize().multiplyScalar(5))
    .project(camera);
  const direction = new T.Vector2(
    (toward.x - center.x) * width,
    (toward.y - center.y) * height,
  );
  if (direction.lengthSq() < 0.001) return hidden;
  direction.normalize();
  let extent = 0;
  for (const x of [minimum.x, maximum.x])
    for (const y of [minimum.y, maximum.y])
      for (const z of [minimum.z, maximum.z]) {
        const corner = new T.Vector3(x, y, z)
          .applyMatrix4(ship.group.matrixWorld)
          .project(camera);
        extent = Math.max(
          extent,
          Math.hypot(
            ((corner.x - center.x) * width) / 2,
            ((corner.y - center.y) * height) / 2,
          ),
        );
      }
  const radius = T.MathUtils.clamp(extent * 1.2, height * 0.065, height * 0.19);
  const intensity = Math.pow(T.MathUtils.clamp(magnitude, 0, 1), 0.65);
  return {
    active: intensity > 0.008,
    source,
    intensity,
    center: [(center.x + 1) * 0.5, (center.y + 1) * 0.5],
    direction: direction.toArray(),
    radius,
    force: force.toArray(),
    animationTime: frame.settings.reducedMotion ? 0 : frame.time,
    distortion: frame.settings.reducedMotion ? 0 : intensity,
  };
}

export function createUmbraLensing(view) {
  const pass = new ShaderPass({
    uniforms: {
      tDiffuse: { value: null },
      resolution: { value: new T.Vector2(1, 1) },
      shipCenter: { value: new T.Vector2(0.5, 0.3) },
      pull: { value: new T.Vector2(1, 0) },
      radius: { value: 80 },
      intensity: { value: 0 },
      distortion: { value: 0 },
      time: { value: 0 },
    },
    vertexShader: `varying vec2 lensUv;
      void main(){lensUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
    fragmentShader: `
      uniform sampler2D tDiffuse;
      uniform vec2 resolution,shipCenter,pull;
      uniform float radius,intensity,distortion,time;
      varying vec2 lensUv;
      void main(){
        vec4 original=texture2D(tDiffuse,lensUv);
        vec2 fromShip=(lensUv-shipCenter)*resolution;
        vec2 q=fromShip-pull*radius*.70;
        float sphere=length(q)/radius;
        // The soft half-plane keeps the opposite half and nose readable.
        float halfHull=smoothstep(-radius*.035,radius*.27,dot(fromShip,pull));
        float volume=(1.-smoothstep(.82,1.,sphere))*halfHull;
        if(sphere>1.035 || halfHull<.001){gl_FragColor=original;return;}
        float dome=sqrt(max(0.,1.-sphere*sphere));
        vec2 stretch=pull*radius*.19*dome*dome;
        vec2 bend=q*.055*dome;
        vec2 offset=(stretch+bend)*volume*distortion/resolution;
        vec2 sampleUv=lensUv-offset;
        vec4 refracted=texture2D(tDiffuse,clamp(sampleUv,vec2(0.),vec2(1.)));
        vec2 stride=pull*radius*.14*volume*distortion/resolution;
        vec4 smear=vec4(0.);
        for(int i=0;i<8;i++){
          float stepSize=float(i)/7.;
          smear+=texture2D(tDiffuse,clamp(sampleUv-stride*stepSize,vec2(0.),vec2(1.)));
        }
        vec3 color=mix(refracted.rgb,smear.rgb/8.,.47*volume*distortion);
        float rim=exp(-pow((sphere-.955)/.012,2.));
        float outer=exp(-pow((sphere-.973)/.032,2.));
        float facing=.35+.65*max(0.,dot(q/max(length(q),.001),pull));
        vec3 amber=vec3(1.25,.69,.24);
        color+=amber*(rim*.40+outer*.065)*intensity*halfHull*facing;
        vec2 axes=vec2(dot(q,pull),dot(q,vec2(-pull.y,pull.x)))/radius;
        float lane=floor(axes.y*9.);
        float line=exp(-pow(fract(axes.y*9.)-.5,2.)*450.);
        float flow=fract(axes.x*.65-time*.85+sin(lane*7.3)*3.1);
        float tail=smoothstep(.70,.91,flow)*(1.-smoothstep(.91,1.,flow));
        color+=amber*line*tail*.11*volume*distortion;
        gl_FragColor=vec4(color,original.a);
      }`,
  });
  pass.enabled = false;
  const detach = view.attachWorldPass(pass);
  let disposed = false;
  return {
    update(sample, width, height) {
      pass.enabled = sample.active;
      if (!sample.active) {
        pass.uniforms.intensity.value = pass.uniforms.distortion.value = 0;
        return;
      }
      pass.uniforms.resolution.value.set(width, height);
      pass.uniforms.shipCenter.value.fromArray(sample.center);
      pass.uniforms.pull.value.fromArray(sample.direction);
      for (const key of ['radius', 'intensity', 'distortion'])
        pass.uniforms[key].value = sample[key];
      pass.uniforms.time.value = sample.animationTime;
    },
    reset() {
      pass.enabled = false;
      pass.uniforms.intensity.value = pass.uniforms.distortion.value = 0;
      pass.uniforms.time.value = 0;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      detach();
      pass.dispose();
    },
  };
}
