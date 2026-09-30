import * as T from 'three';

const LATERAL_SEGMENTS = 40;
const SHEET_OFFSETS = [-9, -3, 0, 3, 9, 22, 38];
const SPLASH_SLOTS = 3;
const SPRAY_POINTS = 160;
const SPLASH_LIFETIME = 1.65;

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
  const random = (n) =>
    ((Math.imul(n + 413, 1664525) + 1013904223) >>> 0) / 4294967296;
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
      varying float opacity;
      varying float isBubble;
      void main() {
        float t=max(0.,age-seed*.08);
        vec3 p=position+velocity*t*strength;
        p.z*=mix(1.,wetDirection,bubble);
        p.y-=mix(7.8,0.,bubble)*t*t;
        // Bubbles stay below the real surface rather than flying into the air.
        p.y=mix(p.y,min(p.y,-.10),bubble);
        vec4 view=modelViewMatrix*vec4(p,1.);
        gl_Position=projectionMatrix*view;
        gl_PointSize=clamp((216.+seed*186.)/max(1.,-view.z),1.2,10.5);
        opacity=smoothstep(0.,.06,t)*(1.-smoothstep(.55,1.65,age))*.84;
        opacity*=mix(step(-.1,p.y),1.,bubble);
        isBubble=bubble;
      }
    `,
    fragmentShader: `
      varying float opacity;
      varying float isBubble;
      void main() {
        float radius=length(gl_PointCoord-.5);
        float drop=1.-smoothstep(.14,.5,radius);
        float bubbleRing=(1.-smoothstep(.41,.5,radius))*smoothstep(.22,.36,radius);
        float alpha=mix(drop,bubbleRing,isBubble)*opacity;
        gl_FragColor=vec4(mix(vec3(.74,.90,.92),vec3(.30,.74,.80),isBubble),alpha);
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
  return { spray, ripple, uniforms, startedAt: -Infinity, active: false };
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
  const previousPosition = new T.Vector3();
  const origin = new T.Vector3();
  const forward = new T.Vector3();
  const worldUp = new T.Vector3(0, 1, 0);
  let previousTime = 0,
    previousSpeed = 0,
    initialized = false;
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
    for (const slot of slots) {
      slot.active = false;
      slot.startedAt = -Infinity;
      slot.spray.visible = slot.ripple.visible = false;
    }
  }
  function remember(position, time, speed) {
    previousPosition.copy(position);
    previousTime = time;
    previousSpeed = speed;
    initialized = true;
  }
  return {
    group,
    metrics: {
      meshCount: 1 + SPLASH_SLOTS,
      triangleCount:
        waterline.geometry.attributes.position.count / 3 + SPLASH_SLOTS * 2,
      splashSlots: SPLASH_SLOTS,
      splashPointsHigh: SPRAY_POINTS * SPLASH_SLOTS,
      splashPointsLow: (SPRAY_POINTS / 2) * SPLASH_SLOTS,
      additionalRenderPasses: 0,
      textures: 0,
    },
    clear,
    updateVehicle({
      position,
      quaternion,
      speed = 0,
      time = 0,
      mode = 'racing',
      reset = false,
    }) {
      if (reset) clear();
      if (mode !== 'racing' && mode !== 'paused') {
        clear();
        return;
      }
      if (!initialized || mode === 'paused') {
        remember(position, time, speed);
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
        remember(position, time, speed);
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
      remember(position, time, speed);
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
      for (const slot of slots) {
        const age = Math.max(0, time - slot.startedAt);
        if (age > SPLASH_LIFETIME) slot.active = false;
        slot.uniforms.age.value = age;
        slot.uniforms.reducedMotion.value = reducedMotion ? 1 : 0;
        slot.spray.visible = slot.active && !reducedMotion;
        slot.ripple.visible = slot.active;
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
