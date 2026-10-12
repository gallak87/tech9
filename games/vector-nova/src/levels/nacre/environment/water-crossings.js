import * as T from 'three';

const LATERAL_SEGMENTS = 40;
const SHEET_OFFSETS = [-9, -3, 0, 3, 9, 22, 38];
const SPLASH_SLOTS = 3;
const BUBBLE_SLOTS = 4;
const SPRAY_POINTS = 160;
const SPLASH_LIFETIME = 1.65;
const LANDING_BUBBLE_LIFETIME = 2.35;
const LANDING_BUBBLE_DRAG = 0.8;

function surfacePoint(track, distance, lateral) {
  const frame = track.sample(distance);
  return frame.position.clone().addScaledVector(frame.right, lateral);
}

function solveHeight(track, low, high, lateral, waterY) {
  let lowHeight = surfacePoint(track, low, lateral).y - waterY;
  for (let iteration = 0; iteration < 25; iteration++) {
    const middle = (low + high) / 2;
    const height = surfacePoint(track, middle, lateral).y - waterY;
    if (lowHeight * height <= 0) high = middle;
    else {
      low = middle;
      lowHeight = height;
    }
  }
  return (low + high) / 2;
}

// Rebuild from the current authored route: no stored scenario or crossing metres.
// Each lateral lane is solved separately so banking creates the actual slanted
// intersection curve, not a perpendicular bar at the centreline crossing.
export function findNacreWaterCrossings(track) {
  const waterY = track.waterY ?? 0;
  const halfWidth = track.width / 2;
  const extent = halfWidth + 24;
  const crossings = [];
  let previous = surfacePoint(track, 0, 0).y - waterY;
  for (let distance = 4; distance <= track.length; distance += 4) {
    const height = surfacePoint(track, distance, 0).y - waterY;
    if ((previous > 0 && height <= 0) || (previous < 0 && height >= 0)) {
      const centerDistance = solveHeight(
        track,
        distance - 4,
        distance,
        0,
        waterY,
      );
      const direction = height < previous ? 'entry' : 'exit';
      const points = [];
      for (let lane = 0; lane <= LATERAL_SEGMENTS; lane++) {
        const lateral = -extent + (lane / LATERAL_SEGMENTS) * extent * 2;
        let bracket = null;
        let before =
          surfacePoint(track, centerDistance - 220, lateral).y - waterY;
        let nearest = Infinity;
        for (let s = centerDistance - 216; s <= centerDistance + 220; s += 4) {
          const after = surfacePoint(track, s, lateral).y - waterY;
          if (before * after <= 0 && Math.abs(s - centerDistance) < nearest) {
            bracket = [s - 4, s];
            nearest = Math.abs(s - centerDistance);
          }
          before = after;
        }
        if (!bracket) continue;
        const s = solveHeight(track, bracket[0], bracket[1], lateral, waterY);
        const frame = track.sample(s);
        const position = surfacePoint(track, s, lateral);
        const wetDirection = frame.tangent.clone().setY(0).normalize();
        if (direction === 'exit') wetDirection.negate();
        points.push({ distance: s, lateral, position, wetDirection });
      }
      if (points.length > 1)
        crossings.push({
          distance: centerDistance,
          direction,
          halfWidth,
          extent,
          points,
        });
    }
    previous = height;
  }
  return crossings;
}

function createWaterline(crossings, waterY) {
  const positions = [],
    uvs = [],
    edges = [];
  const addVertex = (point, offset, extent) => {
    positions.push(
      point.position.x + point.wetDirection.x * offset,
      waterY + 0.14,
      point.position.z + point.wetDirection.z * offset,
    );
    uvs.push(point.lateral, offset);
    edges.push(
      1 - T.MathUtils.smoothstep(Math.abs(point.lateral), extent - 15, extent),
    );
  };
  for (const crossing of crossings)
    for (let lane = 0; lane < crossing.points.length - 1; lane++)
      for (let row = 0; row < SHEET_OFFSETS.length - 1; row++) {
        const a = crossing.points[lane],
          b = crossing.points[lane + 1];
        const near = SHEET_OFFSETS[row],
          far = SHEET_OFFSETS[row + 1];
        for (const [point, offset] of [
          [a, near],
          [b, near],
          [a, far],
          [b, near],
          [b, far],
          [a, far],
        ])
          addVertex(point, offset, crossing.extent);
      }
  const geometry = new T.BufferGeometry();
  geometry.setAttribute('position', new T.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new T.Float32BufferAttribute(uvs, 2));
  geometry.setAttribute('edgeOpacity', new T.Float32BufferAttribute(edges, 1));
  geometry.computeBoundingSphere();
  const material = new T.ShaderMaterial({
    name: 'Nacre / real banked sea-level crossing and foam',
    transparent: true,
    depthWrite: false,
    side: T.DoubleSide,
    forceSinglePass: true,
    uniforms: { time: { value: 0 } },
    vertexShader: `
      attribute float edgeOpacity;
      varying vec2 waterUv;
      varying float edgeFade;
      varying float cameraDistance;
      void main() {
        waterUv=uv;edgeFade=edgeOpacity;
        vec4 world=modelMatrix*vec4(position,1.);
        cameraDistance=distance(cameraPosition,world.xyz);
        gl_Position=projectionMatrix*viewMatrix*world;
      }
    `,
    fragmentShader: `
      uniform float time;
      varying vec2 waterUv;
      varying float edgeFade;
      varying float cameraDistance;
      void main() {
        float u=waterUv.x,v=waterUv.y;
        float lapping=sin(u*.38-time*1.25+sin(u*.13+time*.42))*.46+sin(u*.91+time*.73)*.18;
        float foam=exp(-pow((v-lapping)/.74,2.));
        float lace=.66+.34*sin(u*2.1+sin(u*.47)*2.-time*2.3);
        foam*=lace;
        float wake=exp(-pow((v-4.7-lapping*2.)/1.2,2.))*.19;
        float edge=smoothstep(-9.,-2.,v)*(1.-smoothstep(17.,38.,v))*edgeFade;
        float shimmer=.5+.5*sin(v*.69-u*.22+sin(u*.1)*1.8-time*1.6);
        float opacity=(.18+foam*.53+wake+shimmer*.035)*edge;
        opacity*=1.-smoothstep(300.,720.,cameraDistance);
        vec3 color=mix(vec3(.075,.30,.34),vec3(.62,.84,.80),foam*.86+wake*.5);
        gl_FragColor=vec4(color,opacity);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  });
  const mesh = new T.Mesh(geometry, material);
  mesh.name = 'Nacre / water visibly crossing the banked road';
  mesh.renderOrder = 3;
  mesh.userData.aoExclude = true;
  return mesh;
}

function sprayGeometry() {
  const positions = new Float32Array(SPRAY_POINTS * 3);
  const velocities = new Float32Array(SPRAY_POINTS * 3);
  const seeds = new Float32Array(SPRAY_POINTS);
  const kinds = new Float32Array(SPRAY_POINTS);
  const random = (n) => {
    let value = Math.imul(n ^ 0x9e3779b9, 0x85ebca6b);
    value = Math.imul(value ^ (value >>> 13), 0xc2b2ae35);
    return ((value ^ (value >>> 16)) >>> 0) / 4294967296;
  };
  for (let i = 0; i < SPRAY_POINTS; i++) {
    const a = random(i * 193 + 11),
      b = random(i * 337 + 29),
      c = random(i * 157 + 83);
    const bubble = i % 3 === 0;
    positions.set(
      [(a - 0.5) * 6, bubble ? -0.8 - b : 0.18, (c - 0.5) * 5.8],
      i * 3,
    );
    velocities.set(
      [
        (a - 0.5) * (bubble ? 5.5 : 20),
        bubble ? 1.3 + b * 2.4 : 6.5 + b * 8.5,
        (c - 0.5) * 8.8 + (bubble ? 9 : 3.3),
      ],
      i * 3,
    );
    seeds[i] = b;
    kinds[i] = bubble ? 1 : 0;
  }
  const geometry = new T.BufferGeometry();
  geometry.setDrawRange(0, SPRAY_POINTS);
  geometry.setAttribute('position', new T.BufferAttribute(positions, 3));
  geometry.setAttribute('velocity', new T.BufferAttribute(velocities, 3));
  geometry.setAttribute('seed', new T.BufferAttribute(seeds, 1));
  geometry.setAttribute('bubble', new T.BufferAttribute(kinds, 1));
  return geometry;
}

function splashSlot(pointsGeometry, rippleGeometry) {
  const uniforms = {
    age: { value: 0 },
    strength: { value: 1 },
    reducedMotion: { value: 0 },
    wetDirection: { value: 1 },
    bubbleOnly: { value: 0 },
    waterCeiling: { value: -0.1 },
    landingBurst: { value: 0 },
    lifetime: { value: SPLASH_LIFETIME },
    deckSlope: { value: new T.Vector2() },
  };
  const sprayMaterial = new T.ShaderMaterial({
    name: 'Nacre / swept-craft sea spray and bubbles',
    transparent: true,
    depthWrite: false,
    uniforms,
    vertexShader: `
      attribute vec3 velocity;
      attribute float seed;
      attribute float bubble;
      uniform float age;
      uniform float strength;
      uniform float wetDirection;
      uniform float bubbleOnly;
      uniform float waterCeiling;
      uniform float landingBurst;
      uniform float lifetime;
      uniform vec2 deckSlope;
      varying float opacity;
      varying float isBubble;
      void main() {
        float t=max(0.,age-seed*mix(.08,.012,landingBurst));
        float kind=max(bubble,bubbleOnly);
        vec3 drift=mix(velocity,vec3(velocity.x*.25,1.5+seed*2.5,velocity.z*.25),bubbleOnly);
        // Landing squeezes a broad collar of bubbles out beside the hull.
        // Start above the actual banked deck, not below it like a trail seed.
        vec3 initial=position;
        if(landingBurst>.5) {
          initial.x=sign(position.x)*(2.6+abs(position.x)*1.15);
          initial.z*=.72;
          initial.y=dot(initial.xz,deckSlope)+.4+seed*.9;
          drift=vec3(sign(initial.x)*(1.3+abs(velocity.x)*.24),2.8+seed*3.4,velocity.z*.12);
        }
        vec3 p=initial+drift*t*strength;
        p.z*=mix(1.,wetDirection,kind);
        p.y-=mix(7.8,0.,kind)*t*t;
        // Bubbles stay below the real surface rather than flying into the air.
        p.y=mix(p.y,min(p.y,waterCeiling),kind);
        vec4 view=modelViewMatrix*vec4(p,1.);
        gl_Position=projectionMatrix*view;
        gl_PointSize=clamp(mix(216.+seed*186.,75.+seed*seed*340.,landingBurst)/max(1.,-view.z),1.2,mix(10.5,12.,landingBurst));
        float appear=mix(smoothstep(0.,.06,t),.35+.65*smoothstep(0.,.025,t),landingBurst);
        opacity=appear*(1.-smoothstep(lifetime*.34,lifetime,age))*mix(.84,.42+seed*.24,landingBurst);
        opacity*=mix(step(-.1,p.y),1.,kind);
        isBubble=kind;
      }
    `,
    fragmentShader: `
      varying float opacity;
      varying float isBubble;
      uniform float landingBurst;
      void main() {
        float radius=length(gl_PointCoord-.5);
        float drop=1.-smoothstep(.14,.5,radius);
        float bubbleRing=(1.-smoothstep(.41,.5,radius))*smoothstep(.22,.36,radius);
        float thinRim=exp(-pow((radius-.36)/.045,2.));
        thinRim*=.25+.6*smoothstep(-.3,.3,gl_PointCoord.y-gl_PointCoord.x);
        bubbleRing=mix(bubbleRing,thinRim,landingBurst);
        float glint=exp(-dot(gl_PointCoord-vec2(.34,.32),gl_PointCoord-vec2(.34,.32))*160.);
        bubbleRing=clamp(bubbleRing+glint*.6,0.,1.);
        float alpha=mix(drop,bubbleRing,isBubble)*opacity;
        vec3 bubbleColor=mix(vec3(.30,.74,.80),vec3(.53,.83,.86),landingBurst);
        gl_FragColor=vec4(mix(vec3(.74,.90,.92),bubbleColor,isBubble),alpha);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  });
  const spray = new T.Points(pointsGeometry, sprayMaterial);
  spray.name = 'Nacre / localized craft crossing splash';
  spray.frustumCulled = false;
  spray.renderOrder = 5;
  spray.userData.aoExclude = true;
  const rippleMaterial = new T.ShaderMaterial({
    name: 'Nacre / fading sea-entry ripple',
    transparent: true,
    depthWrite: false,
    side: T.DoubleSide,
    forceSinglePass: true,
    uniforms,
    vertexShader: `
      varying vec2 rippleUv;
      void main() {
        rippleUv=uv;
        gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);
      }
    `,
    fragmentShader: `
      uniform float age;
      uniform float strength;
      uniform float reducedMotion;
      varying vec2 rippleUv;
      void main() {
        vec2 p=(rippleUv-.5)*60.;
        float radius=length(p);
        float expansion=mix(3.5+age*14.4,6.7,reducedMotion);
        float ring=exp(-pow((radius-expansion)/(1.45+age*.9),2.));
        float broken=.70+.30*sin(atan(p.y,p.x)*9.+radius*.5);
        float fade=1.-smoothstep(.25,1.65,age);
        gl_FragColor=vec4(.42,.77,.78,ring*broken*fade*.62*min(strength,1.));
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  });
  const ripple = new T.Mesh(rippleGeometry, rippleMaterial);
  ripple.name = 'Nacre / physical crossing surface ripple';
  ripple.rotation.x = -Math.PI / 2;
  ripple.renderOrder = 4;
  ripple.userData.aoExclude = true;
  spray.visible = ripple.visible = false;
  return {
    spray,
    ripple,
    uniforms,
    startedAt: -Infinity,
    active: false,
    landingOrigin: new T.Vector3(),
    landingVelocity: new T.Vector3(),
  };
}

export function createNacreWaterCrossingEffects(track) {
  const waterY = track.waterY ?? 0;
  const crossings = findNacreWaterCrossings(track);
  const group = new T.Group();
  group.name = 'Nacre / physical waterline and craft crossing presentation';
  const waterline = createWaterline(crossings, waterY);
  group.add(waterline);
  const pointsGeometry = sprayGeometry();
  const rippleGeometry = new T.PlaneGeometry(60, 60);
  const slots = Array.from({ length: SPLASH_SLOTS }, () => {
    const slot = splashSlot(pointsGeometry, rippleGeometry);
    group.add(slot.spray, slot.ripple);
    return slot;
  });
  const bubbleSlots = Array.from({ length: BUBBLE_SLOTS }, () => {
    const slot = splashSlot(pointsGeometry, rippleGeometry);
    slot.uniforms.bubbleOnly.value = 1;
    slot.spray.name = 'Nacre / actual submerged flight bubbles';
    group.add(slot.spray, slot.ripple);
    return slot;
  });
  const previousPosition = new T.Vector3();
  const origin = new T.Vector3();
  const forward = new T.Vector3();
  const worldUp = new T.Vector3(0, 1, 0);
  const deckNormal = new T.Vector3();
  const inverseYaw = new T.Quaternion();
  let previousTime = 0,
    previousSpeed = 0,
    initialized = false;
  let previousMotionMode = 'magnetic';
  let lastBubbleTime = -Infinity,
    bubbleIndex = 0,
    bubbleEventCount = 0,
    lastBubble = null;
  let bubbleEvents = { takeoff: 0, flight: 0, landing: 0 };
  let eventCount = 0,
    lastCrossing = null,
    lastEventTime = -Infinity;
  let currentTime = 0,
    reducedMotion = false,
    quality = 'high';
  let slotIndex = 0;
  function clear() {
    initialized = false;
    eventCount = 0;
    lastCrossing = null;
    lastEventTime = -Infinity;
    previousMotionMode = 'magnetic';
    lastBubbleTime = -Infinity;
    bubbleEventCount = 0;
    lastBubble = null;
    bubbleEvents = { takeoff: 0, flight: 0, landing: 0 };
    for (const slot of [...slots, ...bubbleSlots]) {
      slot.active = false;
      slot.startedAt = -Infinity;
      slot.spray.visible = slot.ripple.visible = false;
    }
  }
  function remember(position, time, speed, motionMode = 'magnetic') {
    previousPosition.copy(position);
    previousTime = time;
    previousSpeed = speed;
    initialized = true;
    previousMotionMode = motionMode;
  }
  return {
    group,
    metrics: {
      meshCount: 1 + SPLASH_SLOTS + BUBBLE_SLOTS,
      triangleCount:
        waterline.geometry.attributes.position.count / 3 +
        (SPLASH_SLOTS + BUBBLE_SLOTS) * 2,
      splashSlots: SPLASH_SLOTS,
      bubbleSlots: BUBBLE_SLOTS,
      splashPointsHigh: SPRAY_POINTS * (SPLASH_SLOTS + BUBBLE_SLOTS),
      splashPointsLow: (SPRAY_POINTS / 2) * (SPLASH_SLOTS + BUBBLE_SLOTS),
      additionalRenderPasses: 0,
      textures: 0,
    },
    clear,
    updateVehicle({
      position,
      quaternion,
      speed = 0,
      distance = null,
      time = 0,
      mode = 'racing',
      reset = false,
      motion,
    }) {
      if (reset) clear();
      if (mode !== 'racing' && mode !== 'paused') {
        clear();
        return;
      }
      if (!initialized || mode === 'paused') {
        remember(position, time, speed, motion?.mode);
        return;
      }
      const dt = time - previousTime;
      if (
        dt < -1e-8 ||
        dt > 0.25 ||
        previousPosition.distanceTo(position) >
          2 + Math.max(speed, previousSpeed) * Math.max(dt, 0) * 2.2
      ) {
        clear();
        remember(position, time, speed, motion?.mode);
        return;
      }
      if (dt <= 1e-8) return;
      const fromY = previousPosition.y - waterY;
      const toY = position.y - waterY;
      if (
        ((fromY > 0 && toY <= 0) || (fromY < 0 && toY >= 0)) &&
        time - lastEventTime > 1.1
      ) {
        const fraction = fromY / (fromY - toY);
        origin
          .copy(previousPosition)
          .lerp(position, fraction)
          .setY(waterY + 0.18);
        const crossingTime = previousTime + dt * fraction;
        const slot = slots[slotIndex];
        slotIndex = (slotIndex + 1) % SPLASH_SLOTS;
        slot.startedAt = crossingTime;
        slot.active = true;
        slot.uniforms.strength.value = T.MathUtils.clamp(
          speed / 100,
          0.45,
          1.35,
        );
        slot.uniforms.wetDirection.value = toY < fromY ? 1 : -1;
        slot.spray.position.copy(origin).setY(waterY);
        slot.ripple.position.copy(origin);
        forward.set(0, 0, 1).applyQuaternion(quaternion).setY(0).normalize();
        slot.spray.quaternion.setFromAxisAngle(
          worldUp,
          Math.atan2(forward.x, forward.z),
        );
        lastEventTime = crossingTime;
        eventCount++;
        lastCrossing = {
          time: crossingTime,
          direction: toY < fromY ? 'entry' : 'exit',
          position: [origin.x, waterY, origin.z],
          speed,
        };
      }
      const motionMode = motion?.mode ?? 'magnetic';
      const bubbleKind =
        motionMode === 'flight' && previousMotionMode === 'magnetic'
          ? 'takeoff'
          : motionMode === 'magnetic' &&
              previousMotionMode !== 'magnetic' &&
              motion?.landingSettle
            ? 'landing'
            : motionMode === 'flight' && time - lastBubbleTime >= 0.16
              ? 'flight'
              : null;
      if (
        bubbleKind &&
        position.y < waterY - 1 &&
        (speed > 10 || bubbleKind === 'landing')
      ) {
        const slot = bubbleSlots[bubbleIndex];
        bubbleIndex = (bubbleIndex + 1) % BUBBLE_SLOTS;
        forward.set(0, 0, 1).applyQuaternion(quaternion).setY(0).normalize();
        const landing = bubbleKind === 'landing';
        slot.spray.position
          .copy(position)
          .addScaledVector(forward, landing ? -0.8 : -4);
        slot.spray.quaternion.setFromAxisAngle(
          worldUp,
          Math.atan2(forward.x, forward.z),
        );
        slot.uniforms.waterCeiling.value = waterY - slot.spray.position.y - 0.1;
        slot.uniforms.strength.value = bubbleKind === 'flight' ? 0.75 : 1.25;
        slot.uniforms.landingBurst.value = landing ? 1 : 0;
        slot.uniforms.lifetime.value = landing
          ? LANDING_BUBBLE_LIFETIME
          : SPLASH_LIFETIME;
        if (landing) {
          const landingFrame = Number.isFinite(distance)
            ? track.sample(distance)
            : null;
          // Entrained water initially carries the hull's forward momentum.
          // It slows in world space; it never follows the craft after contact.
          // Project along the receiving deck: the nose can still be pitched
          // into its landing settle, which would push the wake below the road.
          slot.landingOrigin.copy(slot.spray.position);
          if (landingFrame) slot.landingVelocity.copy(landingFrame.tangent);
          else slot.landingVelocity.copy(forward);
          slot.landingVelocity.multiplyScalar(T.MathUtils.clamp(speed, 0, 200));
          inverseYaw.copy(slot.spray.quaternion).invert();
          if (landingFrame) deckNormal.copy(landingFrame.up);
          else deckNormal.copy(worldUp);
          deckNormal.applyQuaternion(inverseYaw);
          slot.uniforms.deckSlope.value.set(
            -deckNormal.x / Math.max(0.2, deckNormal.y),
            -deckNormal.z / Math.max(0.2, deckNormal.y),
          );
        }
        slot.startedAt = time;
        slot.active = true;
        lastBubbleTime = time;
        bubbleEventCount++;
        bubbleEvents[bubbleKind]++;
        lastBubble = {
          kind: bubbleKind,
          time,
          position: position.toArray(),
          lifetime: slot.uniforms.lifetime.value,
        };
      }
      remember(position, time, speed, motionMode);
    },
    update(time, settingsReducedMotion, settingsQuality) {
      currentTime = time;
      reducedMotion = settingsReducedMotion;
      quality = settingsQuality;
      waterline.material.uniforms.time.value = reducedMotion ? 0 : time;
      pointsGeometry.setDrawRange(
        0,
        quality === 'low' ? SPRAY_POINTS / 2 : SPRAY_POINTS,
      );
      for (const slot of [...slots, ...bubbleSlots]) {
        const age = Math.max(0, time - slot.startedAt);
        if (age > slot.uniforms.lifetime.value) slot.active = false;
        if (slot.active && slot.uniforms.landingBurst.value === 1) {
          const travel =
            (1 - Math.exp(-LANDING_BUBBLE_DRAG * age)) / LANDING_BUBBLE_DRAG;
          slot.spray.position
            .copy(slot.landingOrigin)
            .addScaledVector(slot.landingVelocity, travel);
          slot.uniforms.waterCeiling.value =
            waterY - slot.spray.position.y - 0.1;
        }
        slot.uniforms.age.value = age;
        slot.uniforms.reducedMotion.value = reducedMotion ? 1 : 0;
        slot.spray.visible = slot.active && !reducedMotion;
        slot.ripple.visible =
          slot.active && slot.uniforms.bubbleOnly.value === 0;
      }
    },
    getPresentation() {
      return {
        crossings: crossings.map((crossing) => ({
          distance: crossing.distance,
          direction: crossing.direction,
          halfWidth: crossing.halfWidth,
          waterY,
          pointCount: crossing.points.length,
          left: crossing.points[0].position.toArray(),
          right: crossing.points.at(-1).position.toArray(),
        })),
        activeSplashCount: slots.filter((slot) => slot.active).length,
        activeSprayCount: slots.filter((slot) => slot.spray.visible).length,
        activeBubbleCount: bubbleSlots.filter((slot) => slot.spray.visible)
          .length,
        activeLandingBubbleCount: bubbleSlots.filter(
          (slot) =>
            slot.spray.visible && slot.uniforms.landingBurst.value === 1,
        ).length,
        bubblePoolSlots: BUBBLE_SLOTS,
        bubbleEventCount,
        bubbleEvents: { ...bubbleEvents },
        lastBubble: lastBubble
          ? { ...lastBubble, position: [...lastBubble.position] }
          : null,
        eventCount,
        lastCrossing: lastCrossing
          ? { ...lastCrossing, position: [...lastCrossing.position] }
          : null,
        simulationTime: currentTime,
        waterlineShaderTime: waterline.material.uniforms.time.value,
        splashAges: slots
          .filter((slot) => slot.active)
          .map((slot) => slot.uniforms.age.value),
        pointsPerSplash: pointsGeometry.drawRange.count,
        quality,
        reducedMotion,
      };
    },
  };
}
