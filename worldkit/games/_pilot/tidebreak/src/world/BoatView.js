import * as THREE from 'three';
import { createSailingShip } from '../modules/sailing-ships/src/SailingShipModel.js';
import { createShipShadow } from '../modules/sailing-ships/src/ShipShadow.js';

/** Vessel appearance and wake only; rules, movement, renderer and camera stay separate. */
export function createBoatView(boat, rules) {
  const root = new THREE.Group();
  root.name = 'Tidebreak sailing vessel';
  const owned = new Set(),
    samples = [],
    drops = [];
  const stats = {
    vesselId: 'schooner',
    vessel: 'schooner',
    wakeSamples: 0,
    sprayParticles: 0,
    length: 14,
    beam: 4.2,
    mastHeight: 12,
    cameraMode: 'chase',
    wheelAngle: 0,
  };
  let context, ship, wake, spray, selfShadow;
  let disposed = false,
    lastX = boat.x,
    lastZ = boat.z;
  let emitTime = 0,
    sprayTime = 0,
    visualTime = 0;
  let previousState = rules.state,
    previousElapsed = rules.elapsed ?? 0;
  let roll = 0,
    pitch = 0;
  const MAX_SAMPLES = 90,
    MAX_DROPS = 128;
  const own = (resource) => {
    owned.add(resource);
    return resource;
  };
  function selectVessel() {
    if (disposed) return;
    const profile = boat.vessel ?? {
      id: 'schooner',
      length: 14,
      beam: 4.2,
      mastHeight: 12,
    };
    ship?.dispose();
    ship = createSailingShip(profile.id);
    root.add(ship.group);
    selfShadow?.attach();
    ship.setView(stats.cameraMode === 'captain' ? 'captain' : 'outside');
    Object.assign(stats, {
      vesselId: profile.id,
      vessel: profile.id,
      length: profile.length,
      beam: profile.beam,
      mastHeight: profile.mastHeight,
      wheelAngle: 0,
    });
    if (wake) wake.material.uniforms.beam.value = profile.beam;
    clearWake();
    lastX = boat.x;
    lastZ = boat.z;
    root.position.set(boat.x, 0, boat.z);
    root.rotation.set(0, -boat.heading, 0, 'YXZ');
    roll = pitch = 0;
  }
  function buildWake() {
    // One footprint includes the diffuse centre wash and both spreading edges.
    // Three vertices across each row keep curved wakes continuous without rails.
    const geometry = own(new THREE.BufferGeometry());
    geometry.setAttribute(
      'position',
      new THREE.BufferAttribute(
        new Float32Array(MAX_SAMPLES * 3 * 3),
        3,
      ).setUsage(THREE.DynamicDrawUsage),
    );
    geometry.setAttribute(
      'uv',
      new THREE.BufferAttribute(
        new Float32Array(MAX_SAMPLES * 3 * 2),
        2,
      ).setUsage(THREE.DynamicDrawUsage),
    );
    geometry.setAttribute(
      'aFade',
      new THREE.BufferAttribute(new Float32Array(MAX_SAMPLES * 3), 1).setUsage(
        THREE.DynamicDrawUsage,
      ),
    );
    geometry.setAttribute(
      'aAge',
      new THREE.BufferAttribute(new Float32Array(MAX_SAMPLES * 3), 1).setUsage(
        THREE.DynamicDrawUsage,
      ),
    );
    const indices = [];
    for (let i = 0; i < MAX_SAMPLES - 1; i++)
      for (let side = 0; side < 2; side++) {
        const a = i * 3 + side;
        indices.push(a, a + 3, a + 1, a + 1, a + 3, a + 4);
      }
    geometry.setIndex(indices);
    geometry.setDrawRange(0, 0);
    const foam = own(
      new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
        fog: true,
        uniforms: {
          ...THREE.UniformsLib.fog,
          tint: { value: new THREE.Color('#b7cdc5') },
          beam: { value: boat.vessel?.beam ?? 4.2 },
        },
        vertexShader: `attribute float aFade; attribute float aAge;
        varying vec2 vUv; varying vec2 vWorld; varying float vFade; varying float vAge;
        #include <fog_pars_vertex>
        void main() { vUv=uv; vFade=aFade; vAge=aAge; vWorld=position.xz;
          vec4 mvPosition=modelViewMatrix*vec4(position,1.); gl_Position=projectionMatrix*mvPosition;
          #include <fog_vertex>
        }`,
        fragmentShader: `uniform vec3 tint; uniform float beam;
        varying vec2 vUv; varying vec2 vWorld; varying float vFade; varying float vAge;
        #include <fog_pars_fragment>
        float hash(vec2 p) {
          vec3 q=fract(vec3(p.xyx)*0.1031); q+=dot(q,q.yzx+33.33);
          return fract((q.x+q.y)*q.z);
        }
        float noise(vec2 p) {
          vec2 i=floor(p), f=fract(p); f=f*f*(3.-2.*f);
          return mix(mix(hash(i),hash(i+vec2(1.,0.)),f.x),
            mix(hash(i+vec2(0.,1.)),hash(i+vec2(1.,1.)),f.x),f.y);
        }
        void main() {
          vec2 p=vWorld*2.6+vec2(vAge*0.13,-vAge*0.09);
          float broad=noise(p*0.31);
          float n=noise(p)*0.57+noise(p*2.07+17.8)*0.29+noise(p*4.13-9.2)*0.14;
          float crossWake=vUv.x*2.-1.;
          float edgeCentre=0.70+(broad-0.5)*0.22;
          float edgeDistance=abs(abs(crossWake)-edgeCentre);
          float edgeWidth=0.14+vAge*0.009;
          float edge=exp(-pow(edgeDistance/edgeWidth,2.)*1.6);
          // Broken soft foam patches, not a periodic weave along each strip.
          float breakup=smoothstep(0.37,0.72,n);
          float edgeFoam=edge*breakup*0.27;
          float metres=crossWake*(beam*0.47+vAge*0.88);
          float centre=exp(-pow(metres/(0.40+vAge*0.24),2.)*1.6)*exp(-vAge*1.02);
          float wash=centre*(0.02+smoothstep(0.40,0.68,n)*0.10);
          float mist=(1.-smoothstep(0.2,1.,abs(crossWake)))*0.027*exp(-vAge*0.55);
          float outer=1.-smoothstep(0.86,1.,abs(crossWake));
          float sternFade=smoothstep(0.,0.12,vAge);
          gl_FragColor=vec4(tint,(edgeFoam+wash+mist)*vFade*outer*sternFade);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
          #include <fog_fragment>
        }`,
      }),
    );
    wake = new THREE.Mesh(geometry, foam);
    wake.name = 'World space sailing hull wake';
    wake.frustumCulled = false;
    wake.renderOrder = 2;
    context.scene.add(wake);
    const sprayGeometry = own(new THREE.BufferGeometry());
    sprayGeometry.setAttribute(
      'position',
      new THREE.BufferAttribute(new Float32Array(MAX_DROPS * 3), 3).setUsage(
        THREE.DynamicDrawUsage,
      ),
    );
    sprayGeometry.setAttribute(
      'aFade',
      new THREE.BufferAttribute(new Float32Array(MAX_DROPS), 1).setUsage(
        THREE.DynamicDrawUsage,
      ),
    );
    sprayGeometry.setAttribute(
      'aSize',
      new THREE.BufferAttribute(new Float32Array(MAX_DROPS), 1).setUsage(
        THREE.DynamicDrawUsage,
      ),
    );
    sprayGeometry.setDrawRange(0, 0);
    const sprayMaterial = own(
      new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        fog: true,
        uniforms: { ...THREE.UniformsLib.fog },
        vertexShader: `attribute float aFade; attribute float aSize; varying float vFade;
        #include <fog_pars_vertex>
        void main(){vFade=aFade;vec4 mvPosition=modelViewMatrix*vec4(position,1.);gl_Position=projectionMatrix*mvPosition;gl_PointSize=clamp(aSize*650./-mvPosition.z,1.,16.);
          #include <fog_vertex>
        }`,
        fragmentShader: `varying float vFade;
        #include <fog_pars_fragment>
        void main(){
          vec2 p=(gl_PointCoord-0.5)*2.;float r=length(p);
          if(r>1.)discard;
          float soft=pow(1.-r,2.1);
          gl_FragColor=vec4(0.76,0.89,0.83,soft*vFade*0.36);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
          #include <fog_fragment>
        }`,
      }),
    );
    spray = new THREE.Points(sprayGeometry, sprayMaterial);
    spray.name = 'Fine bow spray';
    spray.frustumCulled = false;
    spray.renderOrder = 3;
    context.scene.add(spray);
  }
  // Seeded stochastic emission gives reproducible checks without periodic strings.
  let effectSeed = 14371;
  function random() {
    effectSeed = (Math.imul(effectSeed, 1664525) + 1013904223) >>> 0;
    return effectSeed / 4294967296;
  }
  function clearWake() {
    ship?.reset();
    samples.length = 0;
    drops.length = 0;
    emitTime = 0;
    sprayTime = 0;
  }
  function updateWake(dt, speed) {
    const h = boat.heading;
    const forwardX = Math.sin(h);
    const forwardZ = -Math.cos(h);
    const rightX = Math.cos(h);
    const rightZ = Math.sin(h);
    for (const sample of samples) sample.age += dt;
    while (samples.length && samples[0].age > 5.2) samples.shift();
    emitTime += dt;
    if (dt > 0 && speed > 1.1 && emitTime > 0.065) {
      const direction = boat.speed < 0 ? -1 : 1;
      if (samples.length && samples.at(-1).direction !== direction)
        samples.length = 0;
      samples.push({
        x: boat.x - forwardX * stats.length * 0.49,
        z: boat.z - forwardZ * stats.length * 0.49,
        h,
        direction,
        age: 0,
        strength: Math.min(speed / 6, 1),
      });
      if (samples.length > MAX_SAMPLES) samples.shift();
      emitTime = 0;
    }
    const pos = wake.geometry.attributes.position;
    const uv = wake.geometry.attributes.uv;
    const fade = wake.geometry.attributes.aFade;
    const age = wake.geometry.attributes.aAge;
    for (let i = 0; i < samples.length; i++) {
      const sample = samples[i];
      const width =
        stats.beam * 0.47 + sample.age * (0.55 + sample.strength * 0.33);
      const rx = Math.cos(sample.h);
      const rz = Math.sin(sample.h);
      for (let column = 0; column < 3; column++) {
        const j = i * 3 + column;
        const cross = (column - 1) * width;
        pos.setXYZ(j, sample.x + rx * cross, 0.072, sample.z + rz * cross);
        uv.setXY(j, column / 2, 0);
        age.setX(j, sample.age);
        fade.setX(
          j,
          Math.pow(Math.max(0, 1 - sample.age / 5.2), 1.55) * sample.strength,
        );
      }
    }
    pos.needsUpdate =
      uv.needsUpdate =
      fade.needsUpdate =
      age.needsUpdate =
        true;
    wake.geometry.setDrawRange(0, Math.max(0, samples.length - 1) * 12);
    sprayTime += dt;
    if (dt > 0 && speed > 2.6 && sprayTime > 0.028) {
      const count = 4 + Math.floor(random() * 3);
      for (let i = 0; i < count; i++) {
        const sign = random() < 0.5 ? -1 : 1;
        const fore = stats.length * (0.2 + random() * 0.08);
        const cross = sign * (stats.beam * 0.4 + random() * 0.17);
        const outward = sign * (0.25 + random() * 1.05);
        const carry = speed * (0.05 + random() * 0.18);
        drops.push({
          x: boat.x + forwardX * fore + rightX * cross,
          y: 0.1 + random() * 0.075,
          z: boat.z + forwardZ * fore + rightZ * cross,
          vx: rightX * outward + forwardX * carry,
          vz: rightZ * outward + forwardZ * carry,
          vy: 0.25 + random() * 0.55,
          age: 0,
          life: 0.24 + random() * 0.32,
          size: 0.025 + random() * 0.085,
          strength: (0.35 + random() * 0.5) * Math.min(1, speed / 6),
        });
      }
      sprayTime = random() * 0.012;
    }
    for (let i = drops.length - 1; i >= 0; i--) {
      const drop = drops[i];
      drop.age += dt;
      drop.x += drop.vx * dt;
      drop.z += drop.vz * dt;
      drop.vy -= dt * 3;
      drop.y = Math.max(0.082, drop.y + drop.vy * dt);
      if (drop.age > drop.life || drops.length > MAX_DROPS) drops.splice(i, 1);
    }
    const sp = spray.geometry.attributes.position;
    const sf = spray.geometry.attributes.aFade;
    const ss = spray.geometry.attributes.aSize;
    for (let i = 0; i < drops.length; i++) {
      const drop = drops[i];
      const life = drop.age / drop.life;
      sp.setXYZ(i, drop.x, drop.y, drop.z);
      sf.setX(i, Math.pow(1 - life, 1.6) * drop.strength);
      ss.setX(i, drop.size * (1 + life * 1.8));
    }
    sp.needsUpdate = sf.needsUpdate = ss.needsUpdate = true;
    spray.geometry.setDrawRange(0, drops.length);
    stats.wakeSamples = samples.length;
    stats.sprayParticles = drops.length;
  }
  return {
    id: 'boat-view',
    stats,
    selectVessel,
    setCameraMode(mode) {
      stats.cameraMode = mode === 'captain' ? 'captain' : 'chase';
      ship?.setView(stats.cameraMode === 'captain' ? 'captain' : 'outside');
    },
    getHelmPose() {
      return ship.getHelmPose();
    },
    init(ctx) {
      context = ctx;
      selectVessel();
      buildWake();
      ctx.scene.add(root);
      if (ctx.renderer) {
        selfShadow = createShipShadow(
          ctx.renderer,
          root,
          ctx.definition.environment.sun.position,
        );
        selfShadow.attach();
      }
    },
    update(dt) {
      if (disposed) return;
      const state = rules.state,
        running = state === 'running',
        speed = Math.abs(boat.speed),
        elapsed = rules.elapsed ?? 0;
      if (
        Math.hypot(boat.x - lastX, boat.z - lastZ) > 12 ||
        elapsed < previousElapsed ||
        (state === 'running' &&
          ['ready', 'finished'].includes(previousState)) ||
        (state === 'ready' && previousState !== 'ready')
      )
        clearWake();
      const activeDt = running || state === 'ready' ? dt : 0;
      visualTime += activeDt;
      stats.wheelAngle = ship.update(activeDt, boat.steer || 0);
      const blend = 1 - Math.exp(-activeDt * 2.5);
      roll +=
        (-(boat.steer || 0) * Math.min(speed / 8, 1) * 0.035 - roll) * blend;
      pitch += (Math.min(speed / 10, 1) * 0.012 - pitch) * blend;
      root.position.set(
        boat.x,
        Math.sin(visualTime * 1.17) * 0.045 +
          Math.sin(visualTime * 1.9) * 0.013,
        boat.z,
      );
      root.rotation.set(
        pitch + Math.sin(visualTime * 0.93) * 0.007,
        -boat.heading,
        roll + Math.sin(visualTime * 0.81) * 0.011,
        'YXZ',
      );
      selfShadow?.render(boat.vessel);
      updateWake(running ? dt : 0, speed);
      lastX = boat.x;
      lastZ = boat.z;
      previousState = state;
      previousElapsed = elapsed;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      selfShadow?.dispose();
      ship?.dispose();
      context?.scene.remove(root);
      if (wake) context?.scene.remove(wake);
      if (spray) context?.scene.remove(spray);
      for (const resource of owned) resource.dispose();
      owned.clear();
      root.clear();
      samples.length = drops.length = 0;
    },
  };
}
